/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';
import { MockStore } from './mock-store';

const SEED = 'test-seed-12345';

function wireSubscription(store: MockStore, state: PuzzleState): () => void {
  const sub = store.subscribe((events) => {
    state.ingest(events);
  });
  return () => sub.unsubscribe();
}

describe('subscription wiring', () => {
  it('remote event applied to state', () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    wireSubscription(store, state);
    const remote: PlaceEvent = {
      op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'remote', ts: 't', v: 1, sha: 'rx',
    };
    store.pushRemoteEvent(remote);
    expect(state.isPlaced(0)).toBe(true);
    expect(state.contributors.has('remote')).toBe(true);
  });

  it('multiple remote events applied in order', () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    wireSubscription(store, state);
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: '1' });
    store.pushRemoteEvent({ op: 'place', piece: 1, slot: [0, 1], rotation: 0, grid_size: 8, actor: 'b', ts: 't', v: 1, sha: '2' });
    expect(state.placedCount).toBe(2);
  });

  it('invalid remote events are ignored', () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    wireSubscription(store, state);
    // Piece 5's canonical slot is [0, 5]; placing it at [3, 0] is a shape misfit.
    store.pushRemoteEvent({ op: 'place', piece: 5, slot: [3, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });

  it('unsubscribe stops further updates', () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    const off = wireSubscription(store, state);
    off();
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });
});
