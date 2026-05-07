import { pieceShape, type PieceShape } from './shapes';
import type { PuzzleState } from './puzzle';

export const BOARD_SIZE = 1024;

export function tileSizeFor(gridSize: number): number {
  return BOARD_SIZE / gridSize;
}

const TAB_DEPTH_RATIO = 0.22;
const TAB_WIDTH_RATIO = 0.34;

function edgePath(p: Path2D, x0: number, y0: number, x1: number, y1: number, sign: -1 | 0 | 1, tileSize: number): void {
  if (sign === 0) {
    p.lineTo(x1, y1);
    return;
  }
  const tabDepth = tileSize * TAB_DEPTH_RATIO;
  const tabWidth = tileSize * TAB_WIDTH_RATIO;
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
  const tabStartX = midX - tx * tabWidth / 2;
  const tabStartY = midY - ty * tabWidth / 2;
  const tabEndX = midX + tx * tabWidth / 2;
  const tabEndY = midY + ty * tabWidth / 2;
  const peakX = midX + ux * tabDepth * sign;
  const peakY = midY + uy * tabDepth * sign;
  p.lineTo(tabStartX, tabStartY);
  p.bezierCurveTo(
    tabStartX + ux * tabDepth * sign, tabStartY + uy * tabDepth * sign,
    peakX - tx * tabWidth * 0.4, peakY - ty * tabWidth * 0.4,
    peakX, peakY,
  );
  p.bezierCurveTo(
    peakX + tx * tabWidth * 0.4, peakY + ty * tabWidth * 0.4,
    tabEndX + ux * tabDepth * sign, tabEndY + uy * tabDepth * sign,
    tabEndX, tabEndY,
  );
  p.lineTo(x1, y1);
}

export function piecePath(seed: string, row: number, col: number, gridSize: number): Path2D {
  const shape: PieceShape = pieceShape(seed, row, col, gridSize);
  const tileSize = tileSizeFor(gridSize);
  const x = col * tileSize;
  const y = row * tileSize;
  const p = new Path2D();
  p.moveTo(x, y);
  edgePath(p, x, y, x + tileSize, y, shape.N, tileSize);
  edgePath(p, x + tileSize, y, x + tileSize, y + tileSize, shape.E, tileSize);
  edgePath(p, x + tileSize, y + tileSize, x, y + tileSize, shape.S, tileSize);
  edgePath(p, x, y + tileSize, x, y, shape.W, tileSize);
  p.closePath();
  return p;
}

export function paintBoard(
  ctx: CanvasRenderingContext2D,
  state: PuzzleState,
  source: CanvasImageSource,
  seed: string,
  gridSize: number,
): void {
  const tileSize = tileSizeFor(gridSize);
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
    }
  }
  for (const [piece] of state.placements) {
    const r = Math.floor(piece / gridSize);
    const c = piece % gridSize;
    const path = piecePath(seed, r, c, gridSize);
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(source, 0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.restore();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
  }
}
