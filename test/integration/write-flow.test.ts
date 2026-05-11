/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace, attemptUnplace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

const SEED = 'fixedseed12345678';

describe('attemptPlace V3', () => {
  it('valid first placement commits and applies locally', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls).toHaveLength(1);
    expect(state.isPlaced(0)).toBe(true);
  });

  it('shape-misfit returns invalid with no commit', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 9, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('no-op move (same slot, same rotation) returns noop with no commit', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    store.commitCalls.length = 0;
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('implicit-unplace-on-drop: dropping on occupied slot unplaces the occupant', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(true);
    // Try to put piece 1 at [0,0] (occupied)
    // Should unplace 0 first, then attempt to place 1 (which is canonical at [0,1], so shape-fits will fail at [0,0])
    const result = await attemptPlace({ piece: 1, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(false);
    expect(result.kind).toBe('invalid');
  });

  it('place identical re-place is a noop (short-circuits before validator)', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    store.commitCalls.length = 0;
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('unauthenticated returns auth-required without commit', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('auth-required');
    expect(store.commitCalls).toHaveLength(0);
  });
});

describe('attemptUnplace V3', () => {
  it('unplaces a placed piece via store.delete', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(true);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('unplaced');
    expect(state.isPlaced(0)).toBe(false);
    expect(store.deleteCalls).toHaveLength(1);
    expect(store.deleteCalls[0].files).toEqual(['jigsaw/2026-W19/placements/000.json']);
  });

  it('unplacing a non-placed piece returns noop', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.deleteCalls).toHaveLength(0);
  });

  it('unauthenticated unplace returns auth-required', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('auth-required');
  });
});
