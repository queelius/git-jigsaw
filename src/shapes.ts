export type Edge = 'N' | 'E' | 'S' | 'W';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tabPattern(seed: string, row: number, col: number, edge: Edge, gridSize: number): -1 | 0 | 1 {
  if (edge === 'N' && row === 0) return 0;
  if (edge === 'S' && row === gridSize - 1) return 0;
  if (edge === 'W' && col === 0) return 0;
  if (edge === 'E' && col === gridSize - 1) return 0;

  let r1 = row, c1 = col, r2 = row, c2 = col, axis: 'H' | 'V';
  if (edge === 'E') { c2 = col + 1; axis = 'H'; }
  else if (edge === 'W') { c1 = col - 1; axis = 'H'; }
  else if (edge === 'S') { r2 = row + 1; axis = 'V'; }
  else { r1 = row - 1; axis = 'V'; }

  const key = `${seed}|${axis}|${r1},${c1}|${r2},${c2}`;
  const bit = (fnv1a(key) >>> 31) & 1;
  const sign: -1 | 1 = bit === 0 ? -1 : 1;

  const isCanonical = (edge === 'E' || edge === 'S');
  return isCanonical ? sign : (-sign as -1 | 1);
}

export interface PieceShape {
  N: -1 | 0 | 1;
  E: -1 | 0 | 1;
  S: -1 | 0 | 1;
  W: -1 | 0 | 1;
}

export function pieceShape(seed: string, row: number, col: number, gridSize: number): PieceShape {
  return {
    N: tabPattern(seed, row, col, 'N', gridSize),
    E: tabPattern(seed, row, col, 'E', gridSize),
    S: tabPattern(seed, row, col, 'S', gridSize),
    W: tabPattern(seed, row, col, 'W', gridSize),
  };
}
