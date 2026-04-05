import { loadExactCache, lookupExactEntry } from "./engine/exact-cache.js";
import { geometry } from "./engine/geometry.js";
import { chooseOpeningMove, loadOpeningTable } from "./engine/opening.js";
import { createRep6Context, playActualMove, playBestBlackMove } from "./engine/rep6.js";
import { createSearchContext, lookupOrSolve } from "./engine/search.js";
import { GameResult, Player, State } from "./engine/state.js";
import { loadSymmetryTables } from "./engine/symmetry.js";

const DATA_URLS = {
  symmetry: new URL("./data/symmetry_tables.bin", import.meta.url),
  opening: new URL("./data/opening_strategy.bin", import.meta.url),
  exact: new URL("./data/exact_strategy_cache.bin", import.meta.url),
};

const COMPUTER_REPLY_DELAY_MS = 220;

let initialized = false;
let symmetry = null;
let openingTable = null;
let exactCache = null;
let searchContext = null;
let currentState = new State();
let currentPhase = "proxy_black_1";
let lastMove = null;
let rep6Context = null;
let strategyInfo = freshStrategyInfo();
let history = [];
let pendingReplyToken = 0;

self.addEventListener("message", async (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      await initializeResources();
      resetGame();
      self.postMessage({ type: "ready" });
      postState();
      return;
    }

    if (!initialized) {
      self.postMessage({ type: "error", message: "页面仍在准备中，请稍候。" });
      return;
    }

    if (message.type === "new_game") {
      resetGame();
      postState();
      return;
    }

    if (message.type === "undo") {
      undoMove();
      postState();
      return;
    }

    if (message.type === "play_human_move") {
      handleHumanMove(message.move);
      postState();
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

async function initializeResources() {
  self.postMessage({
    type: "loading",
    title: "正在准备对局",
    message: "正在读取对局数据，请稍候。",
  });

  const [symmetryBuffer, openingBuffer, exactBuffer] = await Promise.all([
    fetch(DATA_URLS.symmetry).then((response) => response.arrayBuffer()),
    fetch(DATA_URLS.opening).then((response) => response.arrayBuffer()),
    fetch(DATA_URLS.exact).then((response) => response.arrayBuffer()),
  ]);

  symmetry = await loadSymmetryTables(symmetryBuffer);
  openingTable = loadOpeningTable(openingBuffer);

  const cacheIndex = loadExactCache(exactBuffer);
  exactCache = {
    lookup(state) {
      return lookupExactEntry(cacheIndex, state);
    },
  };

  searchContext = createSearchContext(exactCache, 0);
  initialized = true;
}

function resetGame() {
  pendingReplyToken += 1;
  currentState = new State();
  currentPhase = "proxy_black_1";
  lastMove = null;
  rep6Context = null;
  strategyInfo = freshStrategyInfo();
  history = [];
}

function undoMove() {
  if (history.length === 0) {
    return;
  }

  pendingReplyToken += 1;
  const steps = undoStepCount();
  const replayMoves = history.slice(0, Math.max(0, history.length - steps));
  resetGame();
  for (const move of replayMoves) {
    replayMove(move);
  }
}

function handleHumanMove(move) {
  if (!isHumanPhase(currentPhase)) {
    throw new Error("当前还没轮到你落子。");
  }
  applyHumanMoveInternal(move, true);
}

function applyHumanMoveInternal(move, allowAutoReply) {
  if (!Number.isInteger(move) || move < 0 || move >= 31) {
    throw new Error("点编号超出范围。");
  }
  if (!currentState.isLegal(move)) {
    throw new Error("这个点现在不能落子。");
  }

  history.push(move);
  currentState.doMove(move);
  lastMove = move;

  if (rep6Context) {
    playActualMove(rep6Context, move);
  }

  if (currentState.isTerminal()) {
    currentPhase = "game_over";
    strategyInfo = freshStrategyInfo();
    return;
  }

  currentPhase = nextHumanPhase(currentState.plyCount);
  strategyInfo = freshStrategyInfo();

  if (allowAutoReply && currentPhase === "computer_black") {
    scheduleComputerTurn();
  }
}

function replayMove(move) {
  if (!Number.isInteger(move) || move < 0 || move >= 31) {
    throw new Error("点编号超出范围。");
  }
  if (!currentState.isLegal(move)) {
    throw new Error("历史记录包含非法落子。");
  }

  if (rep6Context) {
    playActualMove(rep6Context, move);
    currentState = rep6Context.actualState.clone();
  } else {
    currentState.doMove(move);
    if (
      currentState.plyCount === 6 &&
      !currentState.isTerminal() &&
      currentState.sideToMove === Player.First
    ) {
      rep6Context = createRep6Context(symmetry, currentState);
    }
  }

  history.push(move);
  lastMove = move;

  if (currentState.isTerminal()) {
    currentPhase = "game_over";
    strategyInfo = freshStrategyInfo();
    return;
  }

  currentPhase = phaseAfterMove(currentState);
  strategyInfo = freshStrategyInfo();
}

function scheduleComputerTurn() {
  const token = ++pendingReplyToken;
  strategyInfo = {
    mode: currentState.plyCount < 6 ? "opening" : "rep6",
    representativeId: null,
    exactValue: null,
    depth: null,
    usedCache: false,
  };

  self.setTimeout(() => {
    if (token !== pendingReplyToken) {
      return;
    }
    try {
      runComputerTurn();
      postState();
    } catch (error) {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, COMPUTER_REPLY_DELAY_MS);
}

function runComputerTurn() {
  if (currentState.isTerminal()) {
    currentPhase = "game_over";
    return;
  }
  if (currentState.sideToMove !== Player.First) {
    throw new Error("现在还没轮到先手应手。");
  }

  if (currentState.plyCount < 6) {
    const decision = chooseOpeningMove(symmetry, openingTable, currentState);
    currentState.doMove(decision.actualMove);
    lastMove = decision.actualMove;
    history.push(decision.actualMove);
    strategyInfo = {
      mode: "opening",
      representativeId: decision.repId,
      exactValue: decision.exactValue,
      depth: decision.depth,
      usedCache: true,
    };
  } else {
    if (!rep6Context) {
      rep6Context = createRep6Context(symmetry, currentState);
    }

    const searchFacade = {
      lookupOrSolve(state) {
        return lookupOrSolve(searchContext, state);
      },
    };
    const decision = playBestBlackMove(rep6Context, searchFacade);
    currentState = rep6Context.actualState.clone();
    lastMove = decision.actualMove;
    history.push(decision.actualMove);
    strategyInfo = {
      mode: "rep6",
      representativeId: rep6Context.representativeGlobalId,
      exactValue: decision.exactValue,
      depth: decision.depth,
      usedCache: decision.usedCache,
    };
  }

  currentPhase = currentState.isTerminal() ? "game_over" : "human_white";
}

function postState() {
  self.postMessage({
    type: "state",
    board: {
      firstBits: currentState.firstBits,
      secondBits: currentState.secondBits,
      sideToMove: currentState.sideToMove,
      plyCount: currentState.plyCount,
      terminalResult: currentState.terminalResult,
    },
    ui: {
      phase: currentPhase,
      lastMove,
      highlightMove: null,
      clickableMovesMask: clickableMovesMask(),
      message: phaseMessage(),
      submessage: phaseSubmessage(),
      winningLinePoints: winningLinePoints(),
    },
    challenge: {
      proxyBlackMovesPlayed: Math.min(3, Math.ceil(currentState.plyCount / 2)),
      rep6Active: rep6Context !== null,
    },
    strategy: strategyInfo,
    historyLength: history.length,
  });
}

function clickableMovesMask() {
  if (currentPhase === "game_over" || currentPhase === "computer_black") {
    return 0;
  }
  return currentState.legalMovesMask();
}

function phaseMessage() {
  if (currentPhase === "game_over") {
    switch (currentState.terminalResult) {
      case GameResult.FirstWin:
        return "先手获胜";
      case GameResult.SecondWin:
        return "后手获胜";
      case GameResult.Draw:
        return "和局";
      default:
        return "终局";
    }
  }

  switch (currentPhase) {
    case "proxy_black_1":
      return "请替先手下第 1 手";
    case "white_1":
      return "现在请你为后手下第 1 手";
    case "proxy_black_2":
      return "请替先手下第 2 手";
    case "white_2":
      return "现在请你为后手下第 2 手";
    case "proxy_black_3":
      return "请替先手下第 3 手";
    case "white_3":
      return "现在请你为后手下第 3 手";
    case "computer_black":
      return "轮到先手应手";
    case "human_white":
      return "现在轮到你为后手落子";
    default:
      return "对局中";
  }
}

function phaseSubmessage() {
  if (currentPhase === "game_over") {
    if (currentState.terminalResult === GameResult.SecondWin) {
      return "这一局由后手取胜。";
    }
    if (currentState.terminalResult === GameResult.FirstWin) {
      return "这一局由先手取胜。";
    }
    return "这一局没有分出胜负。";
  }

  if (currentPhase === "computer_black") {
    return "请稍候。";
  }

  if (currentPhase === "human_white") {
    return "点选一个空点继续。";
  }

  return "你执后手；先手的前三手由你代下。";
}

function nextHumanPhase(plyCount) {
  switch (plyCount) {
    case 1:
      return "white_1";
    case 2:
      return "proxy_black_2";
    case 3:
      return "white_2";
    case 4:
      return "proxy_black_3";
    case 5:
      return "white_3";
    default:
      return "computer_black";
  }
}

function phaseAfterMove(state) {
  if (state.plyCount < 6) {
    return nextHumanPhase(state.plyCount);
  }
  return state.sideToMove === Player.First ? "computer_black" : "human_white";
}

function isHumanPhase(phase) {
  return (
    phase === "proxy_black_1" ||
    phase === "white_1" ||
    phase === "proxy_black_2" ||
    phase === "white_2" ||
    phase === "proxy_black_3" ||
    phase === "white_3" ||
    phase === "human_white"
  );
}

function winningLinePoints() {
  let winner = null;
  if (currentState.terminalResult === GameResult.FirstWin) {
    winner = Player.First;
  } else if (currentState.terminalResult === GameResult.SecondWin) {
    winner = Player.Second;
  } else {
    return null;
  }

  for (let line = 0; line < geometry.linePoints.length; line += 1) {
    if (currentState.lineCount(line, winner) >= 5) {
      return Array.from(geometry.linePoints[line]);
    }
  }
  return null;
}

function undoStepCount() {
  if (history.length === 0) {
    return 0;
  }

  if (currentPhase === "computer_black") {
    return 1;
  }

  if (currentPhase === "human_white") {
    return currentState.plyCount >= 7 ? 2 : 1;
  }

  if (currentPhase === "game_over") {
    const lastMover = currentState.sideToMove === Player.First ? Player.Second : Player.First;
    if (currentState.plyCount >= 7 && lastMover === Player.First) {
      return 2;
    }
    return 1;
  }

  return 1;
}

function freshStrategyInfo() {
  return {
    mode: "opening",
    representativeId: null,
    exactValue: null,
    depth: null,
    usedCache: false,
  };
}
