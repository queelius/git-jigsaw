import { describe, it, expect } from 'vitest';
import { isValidPlacement, PIECE_COUNT_FOR } from '../../src/validator';

describe('isValidPlacement', () => {
  it('PIECE_COUNT_FOR(8) is 64', () => {
    expect(PIECE_COUNT_FOR(8)).toBe(64);
  });

  it('PIECE_COUNT_FOR(10) is 100', () => {
    expect(PIECE_COUNT_FOR(10)).toBe(100);
  });

  it('accepts piece 0 at slot [0, 0] rotation 0 on 8x8', () => {
    expect(isValidPlacement(0, [0, 0], 0, 8)).toBe(true);
  });

  it('accepts piece 42 at slot [5, 2] on 8x8 (5*8+2=42)', () => {
    expect(isValidPlacement(42, [5, 2], 0, 8)).toBe(true);
  });

  it('accepts piece 42 at slot [4, 2] on 10x10 (4*10+2=42)', () => {
    expect(isValidPlacement(42, [4, 2], 0, 10)).toBe(true);
  });

  it('rejects rotation other than 0', () => {
    expect(isValidPlacement(0, [0, 0], 90, 8)).toBe(false);
    expect(isValidPlacement(0, [0, 0], 180, 8)).toBe(false);
    expect(isValidPlacement(0, [0, 0], 270, 8)).toBe(false);
  });

  it('rejects piece out of range for given gridSize', () => {
    expect(isValidPlacement(64, [0, 0], 0, 8)).toBe(false);
    expect(isValidPlacement(100, [0, 0], 0, 10)).toBe(false);
  });

  it('rejects slot row out of range', () => {
    expect(isValidPlacement(0, [8, 0], 0, 8)).toBe(false);
    expect(isValidPlacement(0, [-1, 0], 0, 8)).toBe(false);
  });

  it('rejects slot col out of range', () => {
    expect(isValidPlacement(0, [0, 8], 0, 8)).toBe(false);
    expect(isValidPlacement(0, [0, -1], 0, 8)).toBe(false);
  });

  it('rejects mismatched piece/slot for given gridSize', () => {
    expect(isValidPlacement(42, [3, 7], 0, 8)).toBe(false);
  });

  it('all pieces validate at canonical slot for various gridSizes', () => {
    for (const g of [6, 8, 10, 12, 16]) {
      for (let p = 0; p < g * g; p++) {
        const r = Math.floor(p / g);
        const c = p % g;
        expect(isValidPlacement(p, [r, c], 0, g)).toBe(true);
      }
    }
  });
});
