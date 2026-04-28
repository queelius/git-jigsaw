import { describe, it, expect } from 'vitest';
import { tabPattern, type Edge } from '../../src/shapes';
import { GRID_SIZE } from '../../src/validator';

const SEED = 'fixedseed12345678';

describe('tabPattern', () => {
  it('outer north edge of top row is flat', () => {
    expect(tabPattern(SEED, 0, 3, 'N')).toBe(0);
  });

  it('outer south edge of bottom row is flat', () => {
    expect(tabPattern(SEED, GRID_SIZE - 1, 3, 'S')).toBe(0);
  });

  it('outer west edge of left column is flat', () => {
    expect(tabPattern(SEED, 3, 0, 'W')).toBe(0);
  });

  it('outer east edge of right column is flat', () => {
    expect(tabPattern(SEED, 3, GRID_SIZE - 1, 'E')).toBe(0);
  });

  it('east edge of (r, c) opposite-signs west edge of (r, c+1)', () => {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const east = tabPattern(SEED, r, c, 'E');
        const west = tabPattern(SEED, r, c + 1, 'W');
        expect(east + west).toBe(0);
        expect(east).not.toBe(0);
      }
    }
  });

  it('south edge of (r, c) opposite-signs north edge of (r+1, c)', () => {
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const south = tabPattern(SEED, r, c, 'S');
        const north = tabPattern(SEED, r + 1, c, 'N');
        expect(south + north).toBe(0);
        expect(south).not.toBe(0);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = tabPattern(SEED, 3, 4, 'E');
    const b = tabPattern(SEED, 3, 4, 'E');
    expect(a).toBe(b);
  });

  it('produces a roughly even mix of tabs and blanks across all interior edges', () => {
    let tabs = 0;
    let blanks = 0;
    const edges: Edge[] = ['N', 'E', 'S', 'W'];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        for (const e of edges) {
          const v = tabPattern(SEED, r, c, e);
          if (v === 1) tabs++;
          if (v === -1) blanks++;
        }
      }
    }
    expect(tabs).toBeGreaterThan(40);
    expect(blanks).toBeGreaterThan(40);
    expect(Math.abs(tabs - blanks)).toBeLessThan(50);
  });

  it('different seeds produce different patterns at many internal edges', () => {
    const seedA = 'seedA1234567890a';
    const seedB = 'seedB1234567890b';
    let differences = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (tabPattern(seedA, r, c, 'E') !== tabPattern(seedB, r, c, 'E')) differences++;
        if (tabPattern(seedA, r, c, 'S') !== tabPattern(seedB, r, c, 'S')) differences++;
      }
    }
    // For two random seeds we expect ~56 of 112 internal edges to differ.
    // The probability of fewer than 10 differences across 112 independent
    // bits is vanishingly small, so this is statistically robust.
    expect(differences).toBeGreaterThan(10);
  });
});
