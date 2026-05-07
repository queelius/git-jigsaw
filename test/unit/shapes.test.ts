import { describe, it, expect } from 'vitest';
import { tabPattern, type Edge } from '../../src/shapes';

const SEED = 'fixedseed12345678';

describe('tabPattern', () => {
  for (const gridSize of [6, 8, 10, 12]) {
    it(`outer north edge of top row is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 0, 3, 'N', gridSize)).toBe(0);
    });

    it(`outer south edge of bottom row is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, gridSize - 1, 3, 'S', gridSize)).toBe(0);
    });

    it(`outer west edge of left column is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 3, 0, 'W', gridSize)).toBe(0);
    });

    it(`outer east edge of right column is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 3, gridSize - 1, 'E', gridSize)).toBe(0);
    });

    it(`east edge of (r,c) opposite-signs west edge of (r,c+1) (gridSize=${gridSize})`, () => {
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize - 1; c++) {
          const east = tabPattern(SEED, r, c, 'E', gridSize);
          const west = tabPattern(SEED, r, c + 1, 'W', gridSize);
          expect(east + west).toBe(0);
          expect(east).not.toBe(0);
        }
      }
    });

    it(`south edge of (r,c) opposite-signs north edge of (r+1,c) (gridSize=${gridSize})`, () => {
      for (let r = 0; r < gridSize - 1; r++) {
        for (let c = 0; c < gridSize; c++) {
          const south = tabPattern(SEED, r, c, 'S', gridSize);
          const north = tabPattern(SEED, r + 1, c, 'N', gridSize);
          expect(south + north).toBe(0);
          expect(south).not.toBe(0);
        }
      }
    });
  }

  it('is deterministic for the same inputs', () => {
    const a = tabPattern(SEED, 3, 4, 'E', 8);
    const b = tabPattern(SEED, 3, 4, 'E', 8);
    expect(a).toBe(b);
  });

  it('different seeds produce different patterns at many internal edges', () => {
    const seedA = 'seedA1234567890a';
    const seedB = 'seedB1234567890b';
    let differences = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (tabPattern(seedA, r, c, 'E', 8) !== tabPattern(seedB, r, c, 'E', 8)) differences++;
        if (tabPattern(seedA, r, c, 'S', 8) !== tabPattern(seedB, r, c, 'S', 8)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(10);
  });
});
