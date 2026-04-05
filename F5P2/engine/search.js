import {
  coarseLowerBound,
  coarseUpperBound,
  evaluateLastMoverAdvantage,
  exactValueDepthForState,
  terminalValue,
} from "./state.js";

function chooseMoveOrderHeuristic(childState) {
  if (childState.isTerminal()) {
    return 0;
  }
  return evaluateLastMoverAdvantage(childState);
}

function sortMoveCandidates(moves) {
  moves.sort((left, right) => {
    if (left.orderScore !== right.orderScore) {
      return right.orderScore - left.orderScore;
    }
    return left.move - right.move;
  });
}

export function createSearchContext(exactCache, nodeLimit = 0) {
  return {
    exactCache,
    nodeLimit,
    nodesVisited: 0,
    ttHits: 0,
    exactStores: 0,
    cutoffs: 0,
    exactTable: new Map(),
  };
}

export function lookupOrSolve(searchContext, state) {
  const cached = searchContext.exactCache.lookup(state);
  if (cached) {
    return {
      usedCache: true,
      exactValue: cached.exactValue,
      depth: cached.depth,
      bestMove: cached.bestMove,
    };
  }

  const exactValue = solveExactValue(searchContext, state);
  const entry = searchContext.exactTable.get(packStateKey(state));
  if (!entry) {
    throw new Error("search failed to store exact root");
  }
  return {
    usedCache: false,
    exactValue,
    depth: entry.depth,
    bestMove: entry.bestMove,
  };
}

export function solveExactValue(searchContext, state) {
  const existing = lookupCombinedEntry(searchContext, state);
  if (existing) {
    return existing.exactValue;
  }
  const alpha = coarseLowerBound(state) - 1;
  const beta = coarseUpperBound(state) + 1;
  return negamax(searchContext, state, alpha, beta);
}

function negamax(searchContext, state, alpha, beta) {
  if (state.isTerminal()) {
    return terminalValue(state);
  }
  if (searchContext.nodeLimit !== 0 && searchContext.nodesVisited >= searchContext.nodeLimit) {
    throw new Error("negamax node limit exceeded");
  }
  searchContext.nodesVisited += 1;

  const hit = lookupCombinedEntry(searchContext, state);
  if (hit) {
    searchContext.ttHits += 1;
    return hit.exactValue;
  }

  const alpha0 = alpha;
  const beta0 = beta;
  const upper = coarseUpperBound(state);
  const orderedMoves = [];
  let legal = state.legalMovesMask();
  while (legal !== 0) {
    const move = 31 - Math.clz32(legal & -legal);
    legal &= legal - 1;
    const child = state.play(move);
    let orderScore = chooseMoveOrderHeuristic(child);
    if (child.isTerminal()) {
      orderScore = 1000000 + (-terminalValue(child));
    }
    orderedMoves.push({ move, orderScore });
  }
  sortMoveCandidates(orderedMoves);

  let bestValue = -0x3fffffff;
  let bestMove = orderedMoves[0]?.move ?? 0;
  let bestTieBreak = orderedMoves[0]?.orderScore ?? -0x3fffffff;

  for (const candidate of orderedMoves) {
    const child = state.play(candidate.move);
    const childValue = negamax(searchContext, child, -beta, -alpha);
    const score = -childValue;
    if (
      score > bestValue ||
      (score === bestValue &&
        (candidate.orderScore > bestTieBreak ||
          (candidate.orderScore === bestTieBreak && candidate.move < bestMove)))
    ) {
      bestValue = score;
      bestMove = candidate.move;
      bestTieBreak = candidate.orderScore;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      searchContext.cutoffs += 1;
      break;
    }
    if (bestValue === upper) {
      break;
    }
  }

  const lower = coarseLowerBound(state);
  const isExact =
    (alpha0 < bestValue && bestValue < beta0) ||
    (bestValue === alpha0 && alpha0 === lower) ||
    (bestValue === beta0 && beta0 === upper);

  if (isExact) {
    searchContext.exactTable.set(packStateKey(state), {
      exactValue: bestValue,
      depth: exactValueDepthForState(state, bestValue),
      bestMove,
    });
    searchContext.exactStores += 1;
  }
  return bestValue;
}

function lookupCombinedEntry(searchContext, state) {
  const key = packStateKey(state);
  const stored = searchContext.exactTable.get(key);
  if (stored) {
    return stored;
  }
  return searchContext.exactCache.lookup(state);
}

function packStateKey(state) {
  return `${state.firstBits >>> 0}:${state.secondBits >>> 0}:${state.sideToMove}`;
}
