import { describe, it, expect } from 'vitest';
import { buildLeaderboard, formatDuration } from '../../src/leaderboard';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function place(piece: number, actor: string, ts: string, slot?: [number, number], gridSize = 8): PlaceEvent {
  return {
    op: 'place',
    piece,
    slot: slot ?? [Math.floor(piece / gridSize), piece % gridSize],
    rotation: 0,
    grid_size: gridSize,
    actor,
    ts,
    v: 1,
    sha: `sha-${piece}-${actor}-${ts}`,
  };
}

describe('formatDuration', () => {
  it('formats sub-hour duration', () => {
    expect(formatDuration(45 * 60 * 1000)).toBe('45m');
  });
  it('formats hours+minutes', () => {
    expect(formatDuration((2 * 60 + 14) * 60 * 1000)).toBe('2h 14m');
  });
  it('formats days+hours+minutes', () => {
    expect(formatDuration(((3 * 24 + 14) * 60 + 22) * 60 * 1000)).toBe('3d 14h 22m');
  });
});

describe('buildLeaderboard V3', () => {
  it('per-event credit: 3 placements by Alice -> Alice.placements = 3', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(8, 'alice', '2026-05-11T10:02:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.rows.find((r) => r.actor === 'alice')!.placements).toBe(3);
  });

  it('finalPieces reflects current ownership: Alice places, Bob replaces -> Alice has 1 placement, 0 final', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(0, 'bob', '2026-05-11T10:05:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    const alice = lb.rows.find((r) => r.actor === 'alice')!;
    const bob = lb.rows.find((r) => r.actor === 'bob')!;
    expect(alice.placements).toBe(1);
    expect(alice.finalPieces).toBe(0);
    expect(bob.placements).toBe(1);
    expect(bob.finalPieces).toBe(1);
  });

  it('totalPlacements is sum of all place events; totalPieces is gridSize squared', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(0, 'bob', '2026-05-11T10:02:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.totalPlacements).toBe(3);
    expect(lb.totalPieces).toBe(64);
  });

  it('closedItOut tracks the actor whose place produced canonical-correct state', () => {
    const state = new PuzzleState(2, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z', [0, 0], 2),
      place(1, 'alice', '2026-05-11T10:01:00Z', [0, 1], 2),
      place(2, 'alice', '2026-05-11T10:02:00Z', [1, 0], 2),
      place(3, 'queelius', '2026-05-11T10:03:00Z', [1, 1], 2),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.closedItOut).toBe('queelius');
  });

  it('sorts by finalPieces desc, then placements desc, then firstPlacement ts asc', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'bob', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(2, 'alice', '2026-05-11T10:02:00Z'),
      place(8, 'bob', '2026-05-11T10:03:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.rows.map((r) => r.actor)).toEqual(['bob', 'alice']);
  });
});
