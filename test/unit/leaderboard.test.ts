import { describe, it, expect } from 'vitest';
import { buildLeaderboard, formatDuration } from '../../src/leaderboard';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

function ev(piece: number, actor: string, ts: string): PlaceEvent {
  const slot: [number, number] = [Math.floor(piece / 8), piece % 8];
  return { op: 'place', piece, slot, rotation: 0, grid_size: 8, actor, ts, v: 1, sha: `sha-${piece}-${actor}` };
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

describe('buildLeaderboard', () => {
  it('groups events by actor and counts pieces', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'alice', '2026-04-29T10:01:00Z'));
    state.applyEvent(ev(8, 'bob', '2026-04-29T10:02:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.totalPieces).toBe(64);
    expect(lb.contributors).toBe(2);
    expect(lb.rows.find((r) => r.actor === 'alice')!.pieces).toBe(2);
    expect(lb.rows.find((r) => r.actor === 'bob')!.pieces).toBe(1);
  });

  it('sorts rows by pieces desc, tie-break by first-placement ts asc', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'bob', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'alice', '2026-04-29T10:01:00Z'));
    state.applyEvent(ev(2, 'alice', '2026-04-29T10:02:00Z'));
    state.applyEvent(ev(3, 'bob', '2026-04-29T10:03:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.rows.map((r) => r.actor)).toEqual(['bob', 'alice']);
  });

  it('captures first and last placement per actor', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(5, 'alice', '2026-04-29T10:05:00Z'));
    const lb = buildLeaderboard(state, 8);
    const row = lb.rows[0];
    expect(row.firstPlacement).toEqual({ piece: 0, ts: '2026-04-29T10:00:00Z' });
    expect(row.lastPlacement).toEqual({ piece: 5, ts: '2026-04-29T10:05:00Z' });
  });

  it('closedItOut is the actor of the latest event', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'bob', '2026-04-29T10:05:00Z'));
    state.applyEvent(ev(2, 'queelius', '2026-04-29T10:10:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.closedItOut).toBe('queelius');
  });

  it('durationMs is endTs - startTs', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'bob', '2026-04-29T10:30:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.durationMs).toBe(30 * 60 * 1000);
  });
});
