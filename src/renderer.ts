import { GRID_SIZE } from './validator';
import { pieceShape, type PieceShape } from './shapes';
import type { PuzzleState } from './puzzle';

export const BOARD_SIZE = 1024;
export const TILE_SIZE = BOARD_SIZE / GRID_SIZE;
const TAB_DEPTH = TILE_SIZE * 0.22;
const TAB_WIDTH = TILE_SIZE * 0.34;

function edgePath(p: Path2D, x0: number, y0: number, x1: number, y1: number, sign: -1 | 0 | 1): void {
  if (sign === 0) {
    p.lineTo(x1, y1);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(dx, dy);
  const ux = nx / len;
  const uy = ny / len;
  const tx = dx / len;
  const ty = dy / len;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const tabStartX = midX - tx * TAB_WIDTH / 2;
  const tabStartY = midY - ty * TAB_WIDTH / 2;
  const tabEndX = midX + tx * TAB_WIDTH / 2;
  const tabEndY = midY + ty * TAB_WIDTH / 2;
  const peakX = midX + ux * TAB_DEPTH * sign;
  const peakY = midY + uy * TAB_DEPTH * sign;
  p.lineTo(tabStartX, tabStartY);
  p.bezierCurveTo(
    tabStartX + ux * TAB_DEPTH * sign,
    tabStartY + uy * TAB_DEPTH * sign,
    peakX - tx * TAB_WIDTH * 0.4,
    peakY - ty * TAB_WIDTH * 0.4,
    peakX,
    peakY,
  );
  p.bezierCurveTo(
    peakX + tx * TAB_WIDTH * 0.4,
    peakY + ty * TAB_WIDTH * 0.4,
    tabEndX + ux * TAB_DEPTH * sign,
    tabEndY + uy * TAB_DEPTH * sign,
    tabEndX,
    tabEndY,
  );
  p.lineTo(x1, y1);
}

export function piecePath(seed: string, row: number, col: number): Path2D {
  const shape: PieceShape = pieceShape(seed, row, col);
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  const p = new Path2D();
  p.moveTo(x, y);
  edgePath(p, x, y, x + TILE_SIZE, y, shape.N);
  edgePath(p, x + TILE_SIZE, y, x + TILE_SIZE, y + TILE_SIZE, shape.E);
  edgePath(p, x + TILE_SIZE, y + TILE_SIZE, x, y + TILE_SIZE, shape.S);
  edgePath(p, x, y + TILE_SIZE, x, y, shape.W);
  p.closePath();
  return p;
}

export function paintBoard(
  ctx: CanvasRenderingContext2D,
  state: PuzzleState,
  source: CanvasImageSource,
  seed: string,
): void {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  for (const [piece] of state.placements) {
    const r = Math.floor(piece / GRID_SIZE);
    const c = piece % GRID_SIZE;
    const path = piecePath(seed, r, c);
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(source, 0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.restore();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
  }
}
