import { describe, it, expect } from 'vitest';
import { isCanonicalSolved } from '../../src/completion';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function fillCanonical(state: PuzzleState, gridSize: number): void {
  const events: PlaceEvent[] = [];
  for (let i = 0; i < gridSize * gridSize; i++) {
    events.push({
      op: 'place',
      piece: i,
      slot: [Math.floor(i / gridSize), i % gridSize],
      rotation: 0,
      grid_size: gridSize,
      actor: 'alice',
      ts: `2026-05-11T10:${String(i).padStart(2, '0')}:00Z`,
      v: 1,
      sha: `sha-${i}`,
    });
  }
  state.ingest(events);
}

describe('isCanonicalSolved', () => {
  it('returns false when no pieces placed', () => {
    const s = new PuzzleState(8, SEED);
    expect(isCanonicalSolved(s)).toBe(false);
  });

  it('returns false when only some pieces placed', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([{
      op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8,
      actor: 'alice', ts: '2026-05-11T10:00:00Z', v: 1, sha: 'a',
    }]);
    expect(isCanonicalSolved(s)).toBe(false);
  });

  it('returns true when all pieces placed at canonical slots rotation 0 (8x8)', () => {
    const s = new PuzzleState(8, SEED);
    fillCanonical(s, 8);
    expect(isCanonicalSolved(s)).toBe(true);
  });

  it('returns true for fully-canonical 2x2', () => {
    const s = new PuzzleState(2, SEED);
    s.ingest([
      { op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 2, actor: 'a', ts: 't1', v: 1, sha: '1' },
      { op: 'place', piece: 1, slot: [0, 1], rotation: 0, grid_size: 2, actor: 'a', ts: 't2', v: 1, sha: '2' },
      { op: 'place', piece: 2, slot: [1, 0], rotation: 0, grid_size: 2, actor: 'a', ts: 't3', v: 1, sha: '3' },
      { op: 'place', piece: 3, slot: [1, 1], rotation: 0, grid_size: 2, actor: 'a', ts: 't4', v: 1, sha: '4' },
    ]);
    expect(s.placedCount).toBe(4);
    expect(isCanonicalSolved(s)).toBe(true);
  });
});
