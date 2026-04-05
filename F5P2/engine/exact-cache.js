const CACHE_MAGIC = 0x45583543;
const CACHE_VERSION = 1;

export function loadExactCache(buffer) {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== CACHE_MAGIC || version !== CACHE_VERSION) {
    throw new Error("unexpected exact cache header");
  }

  const recordCount = Number(view.getBigUint64(8, true));
  const keysHi = new Uint32Array(recordCount);
  const keysLo = new Uint32Array(recordCount);
  const exactValues = new Int32Array(recordCount);
  const depths = new Int32Array(recordCount);
  const bestMoves = new Uint8Array(recordCount);

  let offset = 16;
  for (let index = 0; index < recordCount; index += 1) {
    const key = view.getBigUint64(offset, true);
    keysLo[index] = Number(key & 0xffffffffn) >>> 0;
    keysHi[index] = Number((key >> 32n) & 0xffffffffn) >>> 0;
    exactValues[index] = view.getInt32(offset + 8, true);
    depths[index] = view.getInt32(offset + 12, true);
    bestMoves[index] = view.getUint8(offset + 16);
    offset += 24;
  }

  return {
    size: recordCount,
    keysHi,
    keysLo,
    exactValues,
    depths,
    bestMoves,
  };
}

export function packStateKeyParts(state) {
  const firstBits = state.firstBits >>> 0;
  const secondBits = state.secondBits >>> 0;
  const lo = (firstBits + ((secondBits & 1) * 0x80000000)) >>> 0;
  const hi = (((secondBits >>> 1) >>> 0) + ((state.sideToMove & 1) << 30)) >>> 0;
  return { hi, lo };
}

export function lookupExactEntry(cache, state) {
  const { hi, lo } = packStateKeyParts(state);
  let left = 0;
  let right = cache.size - 1;
  while (left <= right) {
    const mid = (left + right) >>> 1;
    const midHi = cache.keysHi[mid];
    const midLo = cache.keysLo[mid];
    if (midHi === hi && midLo === lo) {
      return {
        exactValue: cache.exactValues[mid],
        depth: cache.depths[mid],
        bestMove: cache.bestMoves[mid],
      };
    }
    if (midHi < hi || (midHi === hi && midLo < lo)) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return null;
}
