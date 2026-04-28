import { describe, it, expect } from 'vitest';
import { isValidPlacement, GRID_SIZE, PIECE_COUNT } from '../../src/validator';

describe('isValidPlacement', () => {
  it('GRID_SIZE is 8', () => {
    expect(GRID_SIZE).toBe(8);
  });

  it('PIECE_COUNT is 64', () => {
    expect(PIECE_COUNT).toBe(64);
  });

  it('accepts piece 0 at slot [0, 0]', () => {
    expect(isValidPlacement(0, [0, 0])).toBe(true);
  });

  it('accepts piece 42 at slot [5, 2] (5*8+2=42)', () => {
    expect(isValidPlacement(42, [5, 2])).toBe(true);
  });

  it('accepts piece 63 at slot [7, 7] (last piece)', () => {
    expect(isValidPlacement(63, [7, 7])).toBe(true);
  });

  it('rejects piece 42 at wrong slot [3, 7]', () => {
    expect(isValidPlacement(42, [3, 7])).toBe(false);
  });

  it('rejects piece -1 (out of range)', () => {
    expect(isValidPlacement(-1, [0, 0])).toBe(false);
  });

  it('rejects piece 64 (out of range)', () => {
    expect(isValidPlacement(64, [0, 0])).toBe(false);
  });

  it('rejects slot with row out of range', () => {
    expect(isValidPlacement(0, [8, 0])).toBe(false);
    expect(isValidPlacement(0, [-1, 0])).toBe(false);
  });

  it('rejects slot with col out of range', () => {
    expect(isValidPlacement(0, [0, 8])).toBe(false);
    expect(isValidPlacement(0, [0, -1])).toBe(false);
  });

  it('all 64 pieces validate at their canonical slot', () => {
    for (let p = 0; p < 64; p++) {
      const r = Math.floor(p / 8);
      const c = p % 8;
      expect(isValidPlacement(p, [r, c])).toBe(true);
    }
  });
});
