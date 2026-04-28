export const GRID_SIZE = 8;
export const PIECE_COUNT = GRID_SIZE * GRID_SIZE;

export function isValidPlacement(piece: number, slot: readonly [number, number]): boolean {
  if (!Number.isInteger(piece) || piece < 0 || piece >= PIECE_COUNT) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= GRID_SIZE) return false;
  if (!Number.isInteger(col) || col < 0 || col >= GRID_SIZE) return false;
  return row * GRID_SIZE + col === piece;
}

export function pieceToSlot(piece: number): [number, number] {
  return [Math.floor(piece / GRID_SIZE), piece % GRID_SIZE];
}

export function slotToPiece(slot: readonly [number, number]): number {
  return slot[0] * GRID_SIZE + slot[1];
}
