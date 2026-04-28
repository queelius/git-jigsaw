/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// happy-dom v15 does not implement Path2D or canvas 2D context.
// Stub the minimum surface area the renderer touches so we can
// verify behavior without a real rendering engine.
class Path2DStub {
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  bezierCurveTo(
    _cp1x: number, _cp1y: number,
    _cp2x: number, _cp2y: number,
    _x: number, _y: number,
  ): void {}
  closePath(): void {}
}

interface FakeCtx {
  clearRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  lineWidth: number;
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { piecePath, paintBoard, BOARD_SIZE, TILE_SIZE } from '../../src/renderer';
import { PuzzleState } from '../../src/puzzle';

describe('piecePath', () => {
  it('returns a Path2D for a valid piece', () => {
    const p = piecePath('seedabc1234567890', 0, 0);
    expect(p).toBeInstanceOf(Path2DStub);
  });

  it('BOARD_SIZE is 1024 and TILE_SIZE is 128', () => {
    expect(BOARD_SIZE).toBe(1024);
    expect(TILE_SIZE).toBe(128);
  });
});

describe('paintBoard', () => {
  let ctx: FakeCtx;

  beforeEach(() => {
    ctx = {
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
    };
  });

  it('paints a placed piece', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'alice', ts: 't', v: 1, sha: 'a' });
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890');
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('does not paint unplaced pieces', () => {
    const s = new PuzzleState();
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890');
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });
});
