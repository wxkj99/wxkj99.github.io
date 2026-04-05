import {
  applyPermutationToMove,
  canonicalizeSmallState,
  inverseMovePermutation,
} from "./symmetry.js";

const OPENING_MAGIC = 0x4f504e35;
const OPENING_VERSION = 1;

export function loadOpeningTable(buffer) {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const tableSize = view.getUint32(8, true);
  if (magic !== OPENING_MAGIC || version !== OPENING_VERSION) {
    throw new Error("unexpected opening strategy binary");
  }
  const entries = new Array(tableSize);
  let offset = 12;
  for (let repId = 0; repId < tableSize; repId += 1) {
    entries[repId] = {
      exactValue: view.getInt32(offset, true),
      depth: view.getInt32(offset + 4, true),
      bestMove: view.getUint8(offset + 8),
      flags: view.getUint8(offset + 9),
    };
    offset += 12;
  }
  return { tableSize, entries };
}

export function lookupOpeningEntry(openingTable, repId) {
  const entry = openingTable.entries[repId];
  if (!entry || (entry.flags & 1) === 0) {
    return null;
  }
  return entry;
}

export function chooseOpeningMove(symmetry, openingTable, state) {
  const canonical = canonicalizeSmallState(symmetry, state);
  const entry = lookupOpeningEntry(openingTable, canonical.repId);
  if (!entry) {
    throw new Error("missing opening entry");
  }
  const fromRepresentative = inverseMovePermutation(canonical.transformPermutation);
  const actualMove = applyPermutationToMove(entry.bestMove, fromRepresentative);
  return {
    repId: canonical.repId,
    exactValue: entry.exactValue,
    depth: entry.depth,
    representativeMove: entry.bestMove,
    actualMove,
  };
}
