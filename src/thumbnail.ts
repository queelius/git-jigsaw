import { piecePath, BOARD_SIZE, tileSizeFor } from './renderer';

export const THUMBNAIL_SIZE = 96;

const cache = new Map<string, HTMLCanvasElement>();

export function clearThumbnailCache(): void {
  cache.clear();
}

export function pieceThumbnail(
  piece: number,
  rotation: 0 | 90 | 180 | 270 | number,
  source: CanvasImageSource,
  seed: string,
  gridSize: number,
): HTMLCanvasElement {
  const key = `${piece}:${rotation}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cache.set(key, canvas);
    return canvas;
  }

  const tileSize = tileSizeFor(gridSize);
  const row = Math.floor(piece / gridSize);
  const col = piece % gridSize;
  const path = piecePath(seed, row, col, gridSize);
  const sx = col * tileSize;
  const sy = row * tileSize;

  ctx.save();
  ctx.translate(THUMBNAIL_SIZE / 2, THUMBNAIL_SIZE / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const scale = THUMBNAIL_SIZE / tileSize;
  ctx.scale(scale, scale);
  ctx.translate(-tileSize / 2 - sx, -tileSize / 2 - sy);
  ctx.clip(path);
  ctx.drawImage(source, 0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.restore();

  cache.set(key, canvas);
  return canvas;
}
