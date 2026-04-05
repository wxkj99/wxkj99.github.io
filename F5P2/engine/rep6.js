import {
  applyPermutationToMove,
  applyPermutationToState,
  canonicalizeSmallState,
  inverseMovePermutation,
  smallRepresentativeBase,
} from "./symmetry.js";

export function createRep6Context(symmetry, state) {
  if (state.plyCount !== 6 || state.sideToMove !== 0 || state.isTerminal()) {
    throw new Error("rep6 context expects a non-terminal six-ply first-player state");
  }
  const canonical = canonicalizeSmallState(symmetry, state);
  const toRep = canonical.transformPermutation;
  const fromRep = inverseMovePermutation(toRep);
  const repState = applyPermutationToState(state, toRep);
  return {
    actualState: state.clone(),
    representativeState: repState,
    toRepresentative: toRep,
    fromRepresentative: fromRep,
    representativeGlobalId: canonical.repId,
    representativeLocalId: canonical.repId - smallRepresentativeBase(6),
  };
}

export function playActualMove(context, move) {
  if (!context.actualState.isLegal(move)) {
    throw new Error("illegal actual move");
  }
  const representativeMove = applyPermutationToMove(move, context.toRepresentative);
  if (!context.representativeState.isLegal(representativeMove)) {
    throw new Error("mapped representative move is illegal");
  }
  context.actualState.doMove(move);
  context.representativeState.doMove(representativeMove);
}

export function chooseBlackMove(context, searchContext) {
  const result = searchContext.lookupOrSolve(context.representativeState);
  const actualMove = applyPermutationToMove(result.bestMove, context.fromRepresentative);
  if (!context.actualState.isLegal(actualMove)) {
    throw new Error("mapped actual move is illegal");
  }
  return {
    usedCache: result.usedCache,
    exactValue: result.exactValue,
    depth: result.depth,
    representativeMove: result.bestMove,
    actualMove,
  };
}

export function playBestBlackMove(context, searchContext) {
  const decision = chooseBlackMove(context, searchContext);
  context.actualState.doMove(decision.actualMove);
  context.representativeState.doMove(decision.representativeMove);
  return decision;
}
