/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

describe('attemptPlace', () => {
  it('valid placement: calls commit with rotation, applies event locally', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls).toHaveLength(1);
    expect(store.commitCalls[0].op).toBe('place');
    expect(store.commitCalls[0].payload.piece).toBe(42);
    expect(store.commitCalls[0].payload.rotation).toBe(0);
    expect(store.commitCalls[0].payload.grid_size).toBe(8);
    expect(store.commitCalls[0].files).toEqual({
      'jigsaw/2026-W17/placements/042.json': JSON.stringify({ slot: [5, 2], rotation: 0 }),
    });
    expect(state.isPlaced(42)).toBe(true);
  });

  it('non-zero rotation is invalid', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 90, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('invalid placement: does not commit, returns invalid', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [3, 7], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('conflict: returns conflict', async () => {
    const conflictErr = new Error('conflict');
    (conflictErr as any).name = 'ConflictError';
    const store = new MockStore({ initialActor: 'queelius', rejectNextWith: conflictErr });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('conflict');
  });

  it('unauthenticated: returns auth-required without commit', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('auth-required');
    expect(store.commitCalls).toHaveLength(0);
  });
});
