import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent, type Event } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function placeEvent(overrides: Partial<PlaceEvent>): PlaceEvent {
  return {
    op: 'place',
    piece: 0,
    slot: [0, 0],
    rotation: 0,
    grid_size: 8,
    actor: 'alice',
    ts: '2026-05-11T12:00:00Z',
    v: 1,
    sha: 'sha-' + Math.random().toString(36).slice(2, 8),
    ...overrides,
  };
}

function unplaceEvent(overrides: Partial<Event> & { piece: number }): Event {
  const base = {
    op: 'unplace' as const,
    slot: [0, 0] as readonly [number, number],
    rotation: 0 as const,
    grid_size: 8,
    actor: 'alice',
    ts: '2026-05-11T12:00:00Z',
    v: 1,
    sha: 'sha-' + Math.random().toString(36).slice(2, 8),
  };
  return { ...base, ...overrides } as Event;
}

describe('PuzzleState (V3)', () => {
  it('starts empty', () => {
    const s = new PuzzleState(8, SEED);
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
    expect(s.history.length).toBe(0);
  });

  it('ingest place applies valid placement', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0], actor: 'queelius' })]);
    expect(s.placements.get(0)?.slot).toEqual([0, 0]);
    expect(s.contributors.has('queelius')).toBe(true);
    expect(s.history.length).toBe(1);
  });

  it('ingest place-then-unplace produces empty state', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z' }),
      unplaceEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z' }),
    ]);
    expect(s.placements.size).toBe(0);
    expect(s.history.length).toBe(2);  // both events retained in history
  });

  it('ingest place-then-place-different-slot is a move (final placement wins)', () => {
    // Piece 0 can only legally be at slot [0,0]; replaying the same place is a no-op move.
    // Replace the same piece with a later event from a different actor.
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a', actor: 'alice' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z', sha: 'b', actor: 'bob' }),
    ]);
    // Final ownership: bob (latest in sorted order)
    expect(s.placements.size).toBe(1);
    expect(s.placements.get(0)?.actor).toBe('bob');
  });

  it('ingest out-of-order: sorts by ts before applying', () => {
    // Arrivals: P3 first, then U, then P1. Sorted (ts asc): P1, U, P3.
    // Final state: piece 0 at slot [0,0] from P3 (alice, sha=c).
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:02:00Z', sha: 'c', actor: 'alice' }),
      unplaceEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z', sha: 'b', actor: 'bob' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a', actor: 'alice' }),
    ]);
    expect(s.placements.get(0)?.actor).toBe('alice');
    expect(s.placements.get(0)?.sha).toBe('c');
  });

  it('sha lexicographic tiebreak when ts is identical', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'b' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a' }),
    ]);
    // Sorted: 'a' before 'b'. Final placement = 'b' (last-in-sorted-order wins).
    expect(s.placements.get(0)?.sha).toBe('b');
  });

  it('grid_size filter: events with wrong grid_size are dropped', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0], grid_size: 10 })]);
    expect(s.placements.size).toBe(0);
  });

  it('unknown ops are ignored', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([{ op: 'comment', actor: 'a', ts: 't', v: 1, sha: 'x', grid_size: 8 } as any]);
    expect(s.placements.size).toBe(0);
  });

  it('invalid place (shape-misfit) is silently dropped', () => {
    // Piece 9 (interior) cannot be placed on an outer slot
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 9, slot: [0, 0] })]);
    expect(s.placements.size).toBe(0);
  });

  it('placedAt returns the piece at a slot', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0] })]);
    expect(s.placedAt(0, 0)).toEqual({ piece: 0, rotation: 0 });
    expect(s.placedAt(5, 5)).toBeNull();
  });

  it('emits change on ingest with valid events', () => {
    const s = new PuzzleState(8, SEED);
    let changes = 0;
    s.on('change', () => changes++);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0] })]);
    expect(changes).toBe(1);
  });
});
