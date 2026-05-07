import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const baseEvent = (overrides: Partial<PlaceEvent>): PlaceEvent => ({
  op: 'place',
  piece: 0,
  slot: [0, 0],
  rotation: 0,
  grid_size: 8,
  actor: 'alice',
  ts: '2026-04-27T12:00:00Z',
  v: 1,
  sha: 'sha-' + Math.random().toString(36).slice(2, 8),
  ...overrides,
});

describe('PuzzleState', () => {
  it('starts empty', () => {
    const s = new PuzzleState(8);
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('applies valid place event with rotation=0', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'queelius' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('queelius')).toBe(true);
    expect(s.validEvents.length).toBe(1);
  });

  it('rejects place event with non-zero rotation', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], rotation: 90 }));
    expect(s.placements.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('rejects place event with mismatched grid_size', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 99, slot: [9, 9], grid_size: 10 }));
    expect(s.placements.size).toBe(0);
  });

  it('accepts place event when grid_size matches state', () => {
    const s = new PuzzleState(10);
    s.applyEvent(baseEvent({ piece: 42, slot: [4, 2], grid_size: 10 }));
    expect(s.placements.get(42)).toEqual([4, 2]);
  });

  it('ignores invalid place event (wrong slot for piece)', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [3, 7] }));
    expect(s.placements.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('ignores unknown ops', () => {
    const s = new PuzzleState(8);
    s.applyEvent({ op: 'comment', actor: 'alice', ts: 't', v: 1, sha: 'x' } as any);
    expect(s.placements.size).toBe(0);
  });

  it('first placement of a piece wins', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'mallory', sha: 'b' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('alice')).toBe(true);
    expect(s.contributors.has('mallory')).toBe(false);
    expect(s.validEvents.length).toBe(1);
  });

  it('counts unique contributors only once', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 1, slot: [0, 1], actor: 'alice', sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 2, slot: [0, 2], actor: 'bob', sha: 'c' }));
    expect(s.contributors.size).toBe(2);
  });

  it('placedCount tracks number of placed pieces', () => {
    const s = new PuzzleState(8);
    expect(s.placedCount).toBe(0);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'b' }));
    expect(s.placedCount).toBe(2);
  });

  it('isPlaced(piece) reports placement state', () => {
    const s = new PuzzleState(8);
    expect(s.isPlaced(42)).toBe(false);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], sha: 'a' }));
    expect(s.isPlaced(42)).toBe(true);
  });

  it('emits change event on valid placement only', () => {
    const s = new PuzzleState(8);
    let count = 0;
    s.on('change', () => count++);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 99, slot: [0, 0], sha: 'b' }));
    expect(count).toBe(1);
  });

  it('does not throw on malformed place event (missing piece/slot)', () => {
    const s = new PuzzleState(8);
    expect(() => {
      s.applyEvent({ op: 'place', actor: 'a', ts: 't', v: 1, sha: 'x' } as any);
    }).not.toThrow();
    expect(s.placements.size).toBe(0);
  });

  it('validEvents preserves arrival order', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 5, slot: [0, 5], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'c' }));
    expect(s.validEvents.map((e) => e.piece)).toEqual([5, 0, 9]);
  });
});
