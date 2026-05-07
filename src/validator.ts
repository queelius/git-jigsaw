export function PIECE_COUNT_FOR(gridSize: number): number {
  return gridSize * gridSize;
}

export function isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270 | number,
  gridSize: number,
): boolean {
  if (!Number.isInteger(gridSize) || gridSize < 2) return false;
  if (rotation !== 0) return false;
  const pieceCount = gridSize * gridSize;
  if (!Number.isInteger(piece) || piece < 0 || piece >= pieceCount) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= gridSize) return false;
  if (!Number.isInteger(col) || col < 0 || col >= gridSize) return false;
  return row * gridSize + col === piece;
}
