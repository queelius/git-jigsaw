import type { PuzzleState } from './puzzle';

export function isCanonicalSolved(state: PuzzleState): boolean {
  const total = state.gridSize * state.gridSize;
  if (state.placedCount !== total) return false;
  for (const [piece, p] of state.placements) {
    const canonRow = Math.floor(piece / state.gridSize);
    const canonCol = piece % state.gridSize;
    if (p.slot[0] !== canonRow || p.slot[1] !== canonCol) return false;
    if (p.rotation !== 0) return false;
  }
  return true;
}
