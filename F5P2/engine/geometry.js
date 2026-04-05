export const BOARD_MASK = 0x7fffffff;
export const NUM_POINTS = 31;
export const NUM_LINES = 31;
export const POINTS_PER_LINE = 6;
export const LINES_PER_POINT = 6;

function pointOnLine(line, point) {
  const lhs = line[0] * point[0] + line[1] * point[1] + line[2] * point[2];
  return lhs % 5 === 0;
}

function moveBit(move) {
  if (move === 30) {
    return 0x40000000;
  }
  return (1 << move) >>> 0;
}

function buildGeometry() {
  const pointCoords = Array.from({ length: NUM_POINTS }, () => [0, 0, 0]);
  const lineCoords = Array.from({ length: NUM_LINES }, () => [0, 0, 0]);
  const lineMasks = new Uint32Array(NUM_LINES);
  const linePoints = Array.from({ length: NUM_LINES }, () => new Uint8Array(POINTS_PER_LINE));
  const pointToLines = Array.from({ length: NUM_POINTS }, () => new Uint8Array(LINES_PER_POINT));
  const pointLineCounts = new Uint8Array(NUM_POINTS);

  let pointId = 0;
  for (let a = 0; a < 5; a += 1) {
    for (let b = 0; b < 5; b += 1) {
      pointCoords[pointId] = [1, a, b];
      pointId += 1;
    }
  }
  for (let a = 0; a < 5; a += 1) {
    pointCoords[pointId] = [0, 1, a];
    pointId += 1;
  }
  pointCoords[pointId] = [0, 0, 1];

  let lineId = 0;
  for (let a = 0; a < 5; a += 1) {
    for (let b = 0; b < 5; b += 1) {
      lineCoords[lineId] = [1, a, b];
      lineId += 1;
    }
  }
  for (let a = 0; a < 5; a += 1) {
    lineCoords[lineId] = [0, 1, a];
    lineId += 1;
  }
  lineCoords[lineId] = [0, 0, 1];

  for (let line = 0; line < NUM_LINES; line += 1) {
    let count = 0;
    let mask = 0;
    for (let point = 0; point < NUM_POINTS; point += 1) {
      if (!pointOnLine(lineCoords[line], pointCoords[point])) {
        continue;
      }
      linePoints[line][count] = point;
      pointToLines[point][pointLineCounts[point]] = line;
      pointLineCounts[point] += 1;
      mask = (mask | moveBit(point)) >>> 0;
      count += 1;
    }
    lineMasks[line] = mask >>> 0;
  }

  return {
    pointCoords,
    lineCoords,
    lineMasks,
    linePoints,
    pointToLines,
  };
}

export const geometry = buildGeometry();

export function popcount32(value) {
  value >>>= 0;
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

export function ctz32(value) {
  return 31 - Math.clz32(value & -value);
}

export function bitForMove(move) {
  return moveBit(move);
}
