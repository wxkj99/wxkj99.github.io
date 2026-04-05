import {
  BOARD_MASK,
  NUM_LINES,
  NUM_POINTS,
  bitForMove,
  geometry,
  popcount32,
} from "./geometry.js";

export const Player = Object.freeze({
  First: 0,
  Second: 1,
});

export const GameResult = Object.freeze({
  Ongoing: -1,
  FirstWin: 0,
  SecondWin: 1,
  Draw: 2,
});

export class State {
  constructor() {
    this.firstBits = 0;
    this.secondBits = 0;
    this.sideToMove = Player.First;
    this.plyCount = 0;
    this.terminalResult = GameResult.Ongoing;
    this.lineCounts = new Uint8Array(NUM_LINES);
    this.blackGe2Mask = 0;
    this.whiteGe2Mask = 0;
  }

  static fromBitboards(firstBits, secondBits, sideToMove) {
    const state = new State();
    state.firstBits = firstBits >>> 0;
    state.secondBits = secondBits >>> 0;
    state.sideToMove = sideToMove;
    state.plyCount = popcount32((state.firstBits | state.secondBits) >>> 0);
    rebuildLineCaches(state);
    state.terminalResult = evaluateTerminalResult(
      state.firstBits,
      state.secondBits,
      state.blackGe2Mask,
      state.whiteGe2Mask,
    );
    return state;
  }

  clone() {
    const clone = new State();
    clone.firstBits = this.firstBits;
    clone.secondBits = this.secondBits;
    clone.sideToMove = this.sideToMove;
    clone.plyCount = this.plyCount;
    clone.terminalResult = this.terminalResult;
    clone.blackGe2Mask = this.blackGe2Mask;
    clone.whiteGe2Mask = this.whiteGe2Mask;
    clone.lineCounts.set(this.lineCounts);
    return clone;
  }

  occupied() {
    return (this.firstBits | this.secondBits) >>> 0;
  }

  emptyMask() {
    return (BOARD_MASK & ~this.occupied()) >>> 0;
  }

  legalMovesMask() {
    return this.isTerminal() ? 0 : this.emptyMask();
  }

  isLegal(move) {
    if (move < 0 || move >= NUM_POINTS || this.isTerminal()) {
      return false;
    }
    return (this.occupied() & bitForMove(move)) === 0;
  }

  play(move) {
    const next = this.clone();
    next.doMove(move);
    return next;
  }

  doMove(move) {
    if (!this.isLegal(move)) {
      throw new Error("illegal move");
    }

    const mover = this.sideToMove;
    const bit = bitForMove(move);
    if (mover === Player.First) {
      this.firstBits = (this.firstBits | bit) >>> 0;
    } else {
      this.secondBits = (this.secondBits | bit) >>> 0;
    }

    let moverWon = false;
    const incident = geometry.pointToLines[move];
    for (let i = 0; i < incident.length; i += 1) {
      const line = incident[i];
      let firstCount = this.lineCounts[line] & 0x0f;
      let secondCount = (this.lineCounts[line] >>> 4) & 0x0f;
      if (mover === Player.First) {
        firstCount += 1;
        moverWon ||= firstCount >= 5;
      } else {
        secondCount += 1;
        moverWon ||= secondCount >= 5;
      }
      this.lineCounts[line] = firstCount | (secondCount << 4);
      if (firstCount >= 2) {
        this.blackGe2Mask = (this.blackGe2Mask | bitForMove(line)) >>> 0;
      } else {
        this.blackGe2Mask = (this.blackGe2Mask & ~bitForMove(line)) >>> 0;
      }
      if (secondCount >= 2) {
        this.whiteGe2Mask = (this.whiteGe2Mask | bitForMove(line)) >>> 0;
      } else {
        this.whiteGe2Mask = (this.whiteGe2Mask & ~bitForMove(line)) >>> 0;
      }
    }

    this.plyCount += 1;
    this.sideToMove = otherPlayer(mover);
    if (moverWon) {
      this.terminalResult =
        mover === Player.First ? GameResult.FirstWin : GameResult.SecondWin;
      return;
    }
    if (this.hasEarlyDrawBarrier() || this.plyCount === NUM_POINTS) {
      this.terminalResult = GameResult.Draw;
      return;
    }
    this.terminalResult = GameResult.Ongoing;
  }

  lineCount(line, player) {
    const packed = this.lineCounts[line];
    return player === Player.First ? packed & 0x0f : (packed >>> 4) & 0x0f;
  }

  stones(player) {
    return player === Player.First ? this.firstBits : this.secondBits;
  }

  hasEarlyDrawBarrier() {
    return this.blackGe2Mask === BOARD_MASK && this.whiteGe2Mask === BOARD_MASK;
  }

  isTerminal() {
    return this.terminalResult !== GameResult.Ongoing;
  }
}

export function otherPlayer(player) {
  return player === Player.First ? Player.Second : Player.First;
}

export function evaluateLineForLastMover(aCount, bCount, weights = defaultWeights()) {
  if (aCount === 4 && bCount === 0) return weights.openFour;
  if (aCount === 4 && bCount === 1) return weights.forcedBlockFourOne;
  if (aCount === 3 && bCount === 0) return weights.openThree;
  if (aCount === 3 && bCount === 1) return weights.thinThreeOne;
  if (aCount === 0 && bCount === 4) return -weights.opponentOpenFour;
  if (aCount === 1 && bCount === 4) return -weights.opponentBlockedFour;
  if (aCount === 0 && bCount === 3) return -weights.opponentOpenThree;
  return 0;
}

export function evaluateLastMoverAdvantage(state, weights = defaultWeights()) {
  if (state.isTerminal()) {
    throw new Error("heuristic called on terminal state");
  }
  const playerB = state.sideToMove;
  const playerA = otherPlayer(playerB);
  let total = 0;
  for (let line = 0; line < NUM_LINES; line += 1) {
    total += evaluateLineForLastMover(
      state.lineCount(line, playerA),
      state.lineCount(line, playerB),
      weights,
    );
  }
  return total;
}

export function defaultWeights() {
  return {
    openFour: 1000,
    forcedBlockFourOne: 100,
    openThree: 10,
    thinThreeOne: 1,
    opponentOpenFour: 9000,
    opponentBlockedFour: 3000,
    opponentOpenThree: 300,
  };
}

export function terminalValue(state) {
  if (!state.isTerminal()) {
    throw new Error("terminalValue on non-terminal state");
  }
  if (state.terminalResult === GameResult.Draw) {
    return 0;
  }
  const winner =
    state.terminalResult === GameResult.FirstWin ? Player.First : Player.Second;
  const score = Math.floor(popcount32(state.emptyMask()) / 2) + 1;
  return winner === state.sideToMove ? score : -score;
}

export function remainingActionUpperBound(state, player) {
  const empty = popcount32(state.emptyMask());
  return state.sideToMove === player ? Math.floor((empty + 1) / 2) : Math.floor(empty / 2);
}

export function coarseLowerBound(state) {
  return -remainingActionUpperBound(state, otherPlayer(state.sideToMove));
}

export function coarseUpperBound(state) {
  return remainingActionUpperBound(state, state.sideToMove);
}

export function exactValueDepthForState(state, exactValue) {
  if (exactValue === 0) {
    return 0;
  }
  const empty = popcount32(state.emptyMask());
  const magnitude = Math.abs(exactValue);
  const parity = empty & 1;
  let remainingEmpty = 0;
  if (exactValue > 0) {
    remainingEmpty = 2 * magnitude - 1 - parity;
  } else {
    remainingEmpty = 2 * magnitude - 2 + parity;
  }
  const depth = empty - remainingEmpty;
  if (depth <= 0) {
    throw new Error("derived non-positive depth");
  }
  return depth;
}

function rebuildLineCaches(state) {
  state.blackGe2Mask = 0;
  state.whiteGe2Mask = 0;
  for (let line = 0; line < NUM_LINES; line += 1) {
    const firstCount = popcount32(state.firstBits & geometry.lineMasks[line]);
    const secondCount = popcount32(state.secondBits & geometry.lineMasks[line]);
    state.lineCounts[line] = firstCount | (secondCount << 4);
    if (firstCount >= 2) {
      state.blackGe2Mask = (state.blackGe2Mask | bitForMove(line)) >>> 0;
    }
    if (secondCount >= 2) {
      state.whiteGe2Mask = (state.whiteGe2Mask | bitForMove(line)) >>> 0;
    }
  }
}

function hasWinningLineMask(stones) {
  for (let line = 0; line < NUM_LINES; line += 1) {
    if (popcount32(stones & geometry.lineMasks[line]) >= 5) {
      return true;
    }
  }
  return false;
}

function evaluateTerminalResult(firstBits, secondBits, blackGe2Mask, whiteGe2Mask) {
  if (hasWinningLineMask(firstBits)) {
    return GameResult.FirstWin;
  }
  if (hasWinningLineMask(secondBits)) {
    return GameResult.SecondWin;
  }
  if (blackGe2Mask === BOARD_MASK && whiteGe2Mask === BOARD_MASK) {
    return GameResult.Draw;
  }
  if (((firstBits | secondBits) & BOARD_MASK) === BOARD_MASK) {
    return GameResult.Draw;
  }
  return GameResult.Ongoing;
}
