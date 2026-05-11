/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

class Path2DStub {
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  bezierCurveTo(): void {}
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

import { piecePath, paintBoard, BOARD_SIZE, tileSizeFor } from '../../src/renderer';
import { PuzzleState } from '../../src/puzzle';

describe('renderer constants', () => {
  it('BOARD_SIZE is 1024', () => {
    expect(BOARD_SIZE).toBe(1024);
  });

  it('tileSizeFor scales with gridSize', () => {
    expect(tileSizeFor(8)).toBe(128);
    expect(tileSizeFor(10)).toBe(102.4);
    expect(tileSizeFor(16)).toBe(64);
  });
});

describe('piecePath', () => {
  it('returns a Path2D for a valid piece', () => {
    const p = piecePath('seedabc1234567890', 0, 0, 8);
    expect(p).toBeInstanceOf(Path2DStub);
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

  it('paints a placed piece on 8x8', () => {
    const s = new PuzzleState(8, 'seedabc1234567890');
    s.ingest([{ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'alice', ts: 't', v: 1, sha: 'a' }]);
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 8);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('does not paint unplaced pieces', () => {
    const s = new PuzzleState(8, 'seedabc1234567890');
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 8);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('paints with the parameterized gridSize for 10x10', () => {
    const s = new PuzzleState(10, 'seedabc1234567890');
    s.ingest([{ op: 'place', piece: 42, slot: [4, 2], rotation: 0, grid_size: 10, actor: 'a', ts: 't', v: 1, sha: 'x' }]);
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 10);
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});
