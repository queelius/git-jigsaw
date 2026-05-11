import type { PieceShape } from './shapes';

export function rotatedShape(shape: PieceShape, rotation: 0 | 90 | 180 | 270): PieceShape {
  const e: Array<-1 | 0 | 1> = [shape.N, shape.E, shape.S, shape.W];
  const turns = rotation / 90;
  return {
    N: e[(0 - turns + 4) % 4],
    E: e[(1 - turns + 4) % 4],
    S: e[(2 - turns + 4) % 4],
    W: e[(3 - turns + 4) % 4],
  } as PieceShape;
}
