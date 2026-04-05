import { geometry, NUM_POINTS, bitForMove, ctz32 } from "./geometry.js";
import { Player, State } from "./state.js";

const SYMMETRY_MAGIC = "F5P2SYM1";
const SYMMETRY_VERSION = 3;
const STABILIZER_COUNT = 400;
const K_ANCHOR_UNIVERSE_SIZE = 29;
const REP_BASE = [0, 1, 2, 3, 5, 10, 23, 87];

function mod5(value) {
  let reduced = value % 5;
  if (reduced < 0) {
    reduced += 5;
  }
  return reduced;
}

function mod5Mul(lhs, rhs) {
  return (lhs * rhs) % 5;
}

function mod5Inverse(value) {
  switch (value) {
    case 1:
      return 1;
    case 2:
      return 3;
    case 3:
      return 2;
    case 4:
      return 4;
    default:
      throw new Error("invalid non-zero F5 element");
  }
}

function normalizeProjectiveVector(vector) {
  for (let i = 0; i < 3; i += 1) {
    if (vector[i] !== 0) {
      const inverse = mod5Inverse(vector[i]);
      return [
        mod5Mul(vector[0], inverse),
        mod5Mul(vector[1], inverse),
        mod5Mul(vector[2], inverse),
      ];
    }
  }
  throw new Error("zero projective vector");
}

function applyMatrixToPoint(matrix, move) {
  const point = geometry.pointCoords[move];
  const mapped = [
    mod5(matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2]),
    mod5(matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2]),
    mod5(matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2]),
  ];
  const normalized = normalizeProjectiveVector(mapped);
  for (let candidate = 0; candidate < NUM_POINTS; candidate += 1) {
    const coords = geometry.pointCoords[candidate];
    if (
      coords[0] === normalized[0] &&
      coords[1] === normalized[1] &&
      coords[2] === normalized[2]
    ) {
      return candidate;
    }
  }
  throw new Error("matrix mapped point outside geometry");
}

function buildPermutation(matrix) {
  const permutation = new Uint8Array(NUM_POINTS);
  for (let point = 0; point < NUM_POINTS; point += 1) {
    permutation[point] = applyMatrixToPoint(matrix, point);
  }
  return permutation;
}

function inversePermutation(permutation) {
  const inverse = new Uint8Array(NUM_POINTS);
  for (let point = 0; point < NUM_POINTS; point += 1) {
    inverse[permutation[point]] = point;
  }
  return inverse;
}

function applyPermutationToBits(bits, permutation) {
  let mapped = 0;
  let cursor = bits >>> 0;
  while (cursor !== 0) {
    const point = ctz32(cursor);
    mapped = (mapped | bitForMove(permutation[point])) >>> 0;
    cursor &= cursor - 1;
  }
  return mapped >>> 0;
}

function composePermutations(first, second) {
  const composed = new Uint8Array(NUM_POINTS);
  for (let i = 0; i < NUM_POINTS; i += 1) {
    composed[i] = second[first[i]];
  }
  return composed;
}

class BinomialTable {
  constructor() {
    this.choose = Array.from({ length: 32 }, () => new Array(32).fill(0));
    for (let n = 0; n < 32; n += 1) {
      this.choose[n][0] = 1;
      this.choose[n][n] = 1;
      for (let k = 1; k < n; k += 1) {
        this.choose[n][k] = this.choose[n - 1][k - 1] + this.choose[n - 1][k];
      }
    }
  }

  chooseValue(n, k) {
    if (k < 0 || k > n) {
      return 0;
    }
    return this.choose[n][k];
  }
}

const binomial = new BinomialTable();

function rankCombination(chosen, universeSize) {
  let rank = 0;
  let previous = -1;
  let remaining = chosen.length;
  for (let i = 0; i < chosen.length; i += 1) {
    for (let candidate = previous + 1; candidate < chosen[i]; candidate += 1) {
      rank += binomial.chooseValue(universeSize - 1 - candidate, remaining - 1);
    }
    previous = chosen[i];
    remaining -= 1;
  }
  return rank;
}

function rankAnchoredRepresentative(rep, ply) {
  const extraFirst = Math.floor((ply + 1) / 2) - 1;
  const extraSecond = Math.floor(ply / 2) - 1;
  const firstExtras = [];
  const secondExtrasRaw = [];
  for (let point = 2; point < NUM_POINTS; point += 1) {
    const bit = bitForMove(point);
    if ((rep.firstBits & bit) !== 0) {
      firstExtras.push(point - 2);
    } else if ((rep.secondBits & bit) !== 0) {
      secondExtrasRaw.push(point - 2);
    }
  }

  const firstRank = rankCombination(firstExtras, K_ANCHOR_UNIVERSE_SIZE);
  const isFirst = new Array(K_ANCHOR_UNIVERSE_SIZE).fill(false);
  for (const value of firstExtras) {
    isFirst[value] = true;
  }
  const secondExtras = [];
  for (const raw of secondExtrasRaw) {
    let compressed = 0;
    for (let value = 0; value < raw; value += 1) {
      if (!isFirst[value]) {
        compressed += 1;
      }
    }
    secondExtras.push(compressed);
  }
  const secondRank = rankCombination(
    secondExtras,
    K_ANCHOR_UNIVERSE_SIZE - extraFirst,
  );
  return (
    firstRank *
      binomial.chooseValue(K_ANCHOR_UNIVERSE_SIZE - extraFirst, extraSecond) +
    secondRank
  );
}

function stateCountsMatchReachableTurn(state) {
  const firstCount = popcountBits(state.firstBits);
  const secondCount = popcountBits(state.secondBits);
  const ply = firstCount + secondCount;
  if (ply !== state.plyCount) {
    return false;
  }
  if (firstCount !== Math.floor((ply + 1) / 2)) {
    return false;
  }
  if (secondCount !== Math.floor(ply / 2)) {
    return false;
  }
  const expectedSide = (state.plyCount & 1) === 0 ? Player.First : Player.Second;
  return state.sideToMove === expectedSide;
}

function popcountBits(bits) {
  let count = 0;
  let cursor = bits >>> 0;
  while (cursor !== 0) {
    cursor &= cursor - 1;
    count += 1;
  }
  return count;
}

export class SymmetryData {
  constructor() {
    this.repCatalog = Array.from({ length: 7 }, () => []);
    this.anchorMaps = Array.from({ length: 7 }, () => []);
    this.transporters = Array.from({ length: NUM_POINTS }, () =>
      Array.from({ length: NUM_POINTS }, () => null),
    );
  }
}

export function smallRepresentativeBase(ply) {
  return REP_BASE[ply] ?? 0;
}

export function smallRepresentativeCount(symmetry, ply) {
  if (ply === 0 || ply === 1) {
    return 1;
  }
  return symmetry.repCatalog[ply].length;
}

export function getSmallRepresentativeState(symmetry, ply, repId) {
  if (ply === 0) {
    return new State();
  }
  if (ply === 1) {
    return State.fromBitboards(1, 0, Player.Second);
  }
  const rep = symmetry.repCatalog[ply][repId];
  const sideToMove = (ply & 1) === 0 ? Player.First : Player.Second;
  return State.fromBitboards(rep.firstBits, rep.secondBits, sideToMove);
}

export async function loadSymmetryTables(buffer) {
  const view = new DataView(buffer);
  let offset = 0;
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 8));
  offset += 8;
  if (magic !== SYMMETRY_MAGIC) {
    throw new Error("unexpected symmetry magic");
  }
  const version = view.getUint32(offset, true);
  offset += 4;
  if (version !== SYMMETRY_VERSION) {
    throw new Error("unexpected symmetry version");
  }

  const symmetry = new SymmetryData();
  offset += STABILIZER_COUNT * 9;

  for (let black = 0; black < NUM_POINTS; black += 1) {
    for (let white = 0; white < NUM_POINTS; white += 1) {
      const matrix = new Uint8Array(buffer, offset, 9);
      symmetry.transporters[black][white] = buildPermutation(matrix);
      offset += 9;
    }
  }

  for (let ply = 2; ply <= 6; ply += 1) {
    const repCount = view.getUint32(offset, true);
    offset += 4;
    const reps = new Array(repCount);
    for (let i = 0; i < repCount; i += 1) {
      const firstBits = view.getUint32(offset, true);
      const secondBits = view.getUint32(offset + 4, true);
      offset += 8;
      reps[i] = { firstBits, secondBits };
    }
    symmetry.repCatalog[ply] = reps;

    const mapCount = view.getUint32(offset, true);
    offset += 4;
    const entries = new Array(mapCount);
    for (let i = 0; i < mapCount; i += 1) {
      const repId = view.getUint32(offset, true);
      offset += 4;
      const matrix = new Uint8Array(buffer, offset, 9);
      const toRepresentative = buildPermutation(matrix);
      offset += 9;
      entries[i] = { repId, toRepresentative };
    }
    symmetry.anchorMaps[ply] = entries;
  }

  return symmetry;
}

export function canonicalizeSmallState(symmetry, state) {
  if (state.plyCount > 6 || !stateCountsMatchReachableTurn(state)) {
    throw new Error("state is outside supported small-state range");
  }

  if (state.plyCount === 0) {
    return {
      repFirstBits: 0,
      repSecondBits: 0,
      repId: 0,
      transformPermutation: identityPermutation(),
    };
  }

  if (state.plyCount === 1) {
    const blackAnchor = ctz32(state.firstBits);
    const auxiliary = blackAnchor === 1 ? 2 : 1;
    const transporter = blackAnchor === 0
      ? identityPermutation()
      : symmetry.transporters[blackAnchor][auxiliary];
    return {
      repFirstBits: 1,
      repSecondBits: 0,
      repId: 1,
      transformPermutation: transporter,
    };
  }

  const blackAnchor = ctz32(state.firstBits);
  const whiteAnchor = ctz32(state.secondBits);
  const transporter = symmetry.transporters[blackAnchor][whiteAnchor];
  const anchored = {
    firstBits: applyPermutationToBits(state.firstBits, transporter),
    secondBits: applyPermutationToBits(state.secondBits, transporter),
  };
  const rank = rankAnchoredRepresentative(anchored, state.plyCount);
  const anchorEntry = symmetry.anchorMaps[state.plyCount][rank];
  const rep = symmetry.repCatalog[state.plyCount][anchorEntry.repId];
  const transformPermutation = composePermutations(
    transporter,
    anchorEntry.toRepresentative,
  );
  return {
    repFirstBits: rep.firstBits,
    repSecondBits: rep.secondBits,
    repId: smallRepresentativeBase(state.plyCount) + anchorEntry.repId,
    transformPermutation,
  };
}

export function inverseMovePermutation(permutation) {
  return inversePermutation(permutation);
}

export function applyPermutationToMove(move, permutation) {
  return permutation[move];
}

export function applyPermutationToState(state, permutation) {
  return State.fromBitboards(
    applyPermutationToBits(state.firstBits, permutation),
    applyPermutationToBits(state.secondBits, permutation),
    state.sideToMove,
  );
}

function identityPermutation() {
  const permutation = new Uint8Array(NUM_POINTS);
  for (let i = 0; i < NUM_POINTS; i += 1) {
    permutation[i] = i;
  }
  return permutation;
}
