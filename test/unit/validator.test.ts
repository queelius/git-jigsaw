import { describe, it, expect } from 'vitest';
import { isValidPlacement, PIECE_COUNT_FOR } from '../../src/validator';

const SEED = 'fixedseed12345678';

interface PlacementForTest {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
}

function emptyPlacements(): Map<number, PlacementForTest> {
  return new Map();
}

describe('isValidPlacement (shape-fit)', () => {
  it('PIECE_COUNT_FOR(8) is 64', () => {
    expect(PIECE_COUNT_FOR(8)).toBe(64);
  });

  it('canonical placement of any piece validates on empty board', () => {
    for (let piece = 0; piece < 64; piece++) {
      const row = Math.floor(piece / 8);
      const col = piece % 8;
      expect(isValidPlacement(piece, [row, col], 0, 8, SEED, emptyPlacements())).toBe(true);
    }
  });

  it('rejects rotation that does not match outer-edge constraint for corner pieces', () => {
    // piece 0 is the NW corner; its canonical shape has N=0, W=0
    // at rotation 90, the W face would carry the old S value (tab/blank, not flat),
    // so piece 0 at corner [0,0] rotation 90 should fail
    expect(isValidPlacement(0, [0, 0], 90, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('rejects interior piece at outer slot at any rotation', () => {
    // piece 9 is interior (row 1, col 1); all four canonical edges are tab/blank
    // it cannot go on any outer slot at any rotation
    const outerSlots: Array<[number, number]> = [
      [0, 0], [0, 3], [0, 7], [3, 0], [3, 7], [7, 0], [7, 3], [7, 7],
    ];
    for (const slot of outerSlots) {
      for (const rot of [0, 90, 180, 270] as const) {
        expect(isValidPlacement(9, slot, rot, 8, SEED, emptyPlacements())).toBe(false);
      }
    }
  });

  it('rejects placement where the piece would block an interior slot with a flat edge', () => {
    // piece 0 (NW corner, canonical has flat N and flat W) at slot [3, 3] (interior)
    // its flat edges would face empty interior neighbors. Validator must reject.
    expect(isValidPlacement(0, [3, 3], 0, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('shape-fits piece at canonical slot when canonical neighbor is placed', () => {
    // piece 0 at [0, 0] rotation 0
    // piece 1 at [0, 1] rotation 0; piece 0's east must match piece 1's west
    const placements = new Map<number, PlacementForTest>([
      [0, { slot: [0, 0], rotation: 0 }],
    ]);
    expect(isValidPlacement(1, [0, 1], 0, 8, SEED, placements)).toBe(true);
  });

  it('rejects when placed neighbor blocks the slot via mismatched edge', () => {
    // place piece 9 (interior) at slot [1, 1] rotation 0
    // try to put piece 0 (corner with flat N, flat W) at slot [1, 2]
    // piece 0's west face (flat) must match piece 9's east face (tab or blank, not flat)
    // mismatch -> false. (Also rejected by outer-edge constraint, but useful as a layered check.)
    const placements = new Map<number, PlacementForTest>([
      [9, { slot: [1, 1], rotation: 0 }],
    ]);
    expect(isValidPlacement(0, [1, 2], 0, 8, SEED, placements)).toBe(false);
  });

  it('respects excludePiece: a piece can be moved to its own current slot (no-op move)', () => {
    const placements = new Map<number, PlacementForTest>([
      [42, { slot: [5, 2], rotation: 0 }],
    ]);
    expect(isValidPlacement(42, [5, 2], 0, 8, SEED, placements, 42)).toBe(true);
  });

  it('without excludePiece, slot occupancy check fails for a self-move', () => {
    const placements = new Map<number, PlacementForTest>([
      [42, { slot: [5, 2], rotation: 0 }],
    ]);
    expect(isValidPlacement(42, [5, 2], 0, 8, SEED, placements)).toBe(false);
  });

  it('rejects piece out of range', () => {
    expect(isValidPlacement(64, [0, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
    expect(isValidPlacement(-1, [0, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('rejects slot row/col out of range', () => {
    expect(isValidPlacement(0, [8, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
    expect(isValidPlacement(0, [-1, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
  });
});
