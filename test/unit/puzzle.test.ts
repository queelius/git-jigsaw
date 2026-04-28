import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const baseEvent = (overrides: Partial<PlaceEvent>): PlaceEvent => ({
  op: 'place',
  piece: 0,
  slot: [0, 0],
  actor: 'alice',
  ts: '2026-04-27T12:00:00Z',
  v: 1,
  sha: 'sha-' + Math.random().toString(36).slice(2, 8),
  ...overrides,
});

describe('PuzzleState', () => {
  it('starts empty', () => {
    const s = new PuzzleState();
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
  });

  it('applies valid place event', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'queelius' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('queelius')).toBe(true);
  });

  it('ignores invalid place event (wrong slot for piece)', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [3, 7] }));
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
  });

  it('ignores unknown ops', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'comment', actor: 'alice', ts: '2026-04-27T12:00:00Z', v: 1, sha: 'x' } as any);
    expect(s.placements.size).toBe(0);
  });

  it('first placement of a piece wins; later overwrites are ignored', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'mallory', sha: 'b' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('alice')).toBe(true);
    expect(s.contributors.has('mallory')).toBe(false);
  });

  it('counts unique contributors only once', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 1, slot: [0, 1], actor: 'alice', sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 2, slot: [0, 2], actor: 'bob', sha: 'c' }));
    expect(s.contributors.size).toBe(2);
  });

  it('placedCount tracks number of placed pieces', () => {
    const s = new PuzzleState();
    expect(s.placedCount).toBe(0);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'b' }));
    expect(s.placedCount).toBe(2);
  });

  it('isPlaced(piece) reports placement state', () => {
    const s = new PuzzleState();
    expect(s.isPlaced(42)).toBe(false);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], sha: 'a' }));
    expect(s.isPlaced(42)).toBe(true);
  });

  it('emits change event on valid placement', () => {
    const s = new PuzzleState();
    let count = 0;
    s.on('change', () => count++);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 99, slot: [0, 0], sha: 'b' })); // invalid; no change
    expect(count).toBe(1);
  });
});
