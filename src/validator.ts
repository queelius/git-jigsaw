import { pieceShape, type PieceShape } from './shapes';
import { rotatedShape } from './shape-rotation';

export function PIECE_COUNT_FOR(gridSize: number): number {
  return gridSize * gridSize;
}

export interface PlacementForValidator {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
}

export function isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270 | number,
  gridSize: number,
  seed: string,
  placements: ReadonlyMap<number, PlacementForValidator>,
  excludePiece?: number,
): boolean {
  // Sanity
  if (!Number.isInteger(gridSize) || gridSize < 2) return false;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return false;
  if (!Number.isInteger(piece) || piece < 0 || piece >= gridSize * gridSize) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= gridSize) return false;
  if (!Number.isInteger(col) || col < 0 || col >= gridSize) return false;

  // Slot occupancy (excluding the piece being moved)
  for (const [otherPiece, p] of placements) {
    if (otherPiece === excludePiece) continue;
    if (p.slot[0] === row && p.slot[1] === col) return false;
  }

  // Piece-already-placed dedup (a piece can be in only one slot at a time)
  if (placements.has(piece) && piece !== excludePiece) return false;

  // Compute the piece's rotated shape
  const canonRow = Math.floor(piece / gridSize);
  const canonCol = piece % gridSize;
  const canonShape: PieceShape = pieceShape(seed, canonRow, canonCol, gridSize);
  const rotated = rotatedShape(canonShape, rotation as 0 | 90 | 180 | 270);

  // Check each cardinal direction
  const directions: Array<{ edge: keyof PieceShape; dr: number; dc: number; oppositeEdge: keyof PieceShape }> = [
    { edge: 'N', dr: -1, dc: 0, oppositeEdge: 'S' },
    { edge: 'E', dr: 0, dc: 1, oppositeEdge: 'W' },
    { edge: 'S', dr: 1, dc: 0, oppositeEdge: 'N' },
    { edge: 'W', dr: 0, dc: -1, oppositeEdge: 'E' },
  ];

  for (const { edge, dr, dc, oppositeEdge } of directions) {
    const nrow = row + dr;
    const ncol = col + dc;
    const pieceEdge = rotated[edge];

    if (nrow < 0 || nrow >= gridSize || ncol < 0 || ncol >= gridSize) {
      // Outer boundary: piece's edge must be flat
      if (pieceEdge !== 0) return false;
      continue;
    }

    // Find a placed piece at the neighbor slot
    let neighborPiece: number | undefined;
    let neighborPlacement: PlacementForValidator | undefined;
    for (const [op, p] of placements) {
      if (op === excludePiece) continue;
      if (p.slot[0] === nrow && p.slot[1] === ncol) {
        neighborPiece = op;
        neighborPlacement = p;
        break;
      }
    }

    if (neighborPlacement === undefined || neighborPiece === undefined) {
      // Empty interior neighbor: piece's edge must NOT be flat
      // (Outer-edge constraint: a flat edge must face the puzzle boundary.)
      if (pieceEdge === 0) return false;
      continue;
    }

    // Occupied neighbor: edges must sum to 0 (tab into blank or blank into tab)
    const neighborCanonRow = Math.floor(neighborPiece / gridSize);
    const neighborCanonCol = neighborPiece % gridSize;
    const neighborCanonShape: PieceShape = pieceShape(seed, neighborCanonRow, neighborCanonCol, gridSize);
    const neighborRotated = rotatedShape(neighborCanonShape, neighborPlacement.rotation);
    const neighborEdge = neighborRotated[oppositeEdge];

    if (pieceEdge + neighborEdge !== 0) return false;
  }

  return true;
}
