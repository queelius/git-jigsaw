/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

class Path2DStub {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';
import { clearThumbnailCache } from '../../src/thumbnail';

function makeFakeSource(): HTMLImageElement {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', { value: 1024 });
  Object.defineProperty(img, 'naturalHeight', { value: 1024 });
  return img;
}

describe('Tray.render', () => {
  beforeEach(() => clearThumbnailCache());

  it('returns an HTMLElement with one button per unplaced piece', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelectorAll('button.jigsaw-piece').length).toBe(64);
  });

  it('omits placed pieces', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    state.ingest([{ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' }]);
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelectorAll('button.jigsaw-piece').length).toBe(63);
  });

  it('shows rotate overlay when rotationEnabled is true', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: true,
      onRotate: () => {},
    });
    expect(el.querySelector('.jigsaw-rotate-overlay')).not.toBeNull();
  });

  it('hides rotate overlay when rotationEnabled is false', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelector('.jigsaw-rotate-overlay')).toBeNull();
  });

  it('rotation cycles 0->90->180->270->0 on rotate-icon click', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    const tray = new Tray(state, 'queelius', 8);
    const rotations: number[] = [];
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: true,
      onRotate: (_piece, rotation) => rotations.push(rotation),
    });
    const overlay = el.querySelector('.jigsaw-rotate-overlay') as HTMLElement;
    overlay.click();
    overlay.click();
    overlay.click();
    overlay.click();
    expect(rotations).toEqual([90, 180, 270, 0]);
  });

  it('button has data-piece attribute matching piece id', () => {
    const state = new PuzzleState(8, 'seed1234567890ab');
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    const first = el.querySelector('button.jigsaw-piece') as HTMLElement;
    expect(first.dataset.piece).toBeDefined();
    expect(parseInt(first.dataset.piece!, 10)).toBeGreaterThanOrEqual(0);
  });
});
