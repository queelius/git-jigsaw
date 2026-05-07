/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeAll } from 'vitest';

class Path2DStub {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { pieceThumbnail, clearThumbnailCache, THUMBNAIL_SIZE } from '../../src/thumbnail';

describe('pieceThumbnail', () => {
  function makeFakeSource(): HTMLImageElement {
    const img = document.createElement('img');
    Object.defineProperty(img, 'naturalWidth', { value: 1024 });
    Object.defineProperty(img, 'naturalHeight', { value: 1024 });
    return img;
  }

  it('THUMBNAIL_SIZE is 96', () => {
    expect(THUMBNAIL_SIZE).toBe(96);
  });

  it('returns a canvas-shaped object', () => {
    clearThumbnailCache();
    const t = pieceThumbnail(0, 0, makeFakeSource(), 'seed1234567890ab', 8);
    expect(t.width).toBeGreaterThan(0);
    expect(t.height).toBeGreaterThan(0);
  });

  it('caches by (piece, rotation) key', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    const b = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    expect(a).toBe(b);
  });

  it('different rotation key returns a different canvas', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    const b = pieceThumbnail(5, 90, source, 'seed1234567890ab', 8);
    expect(a).not.toBe(b);
  });

  it('clearThumbnailCache invalidates cached entries', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    clearThumbnailCache();
    const b = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    expect(a).not.toBe(b);
  });
});
