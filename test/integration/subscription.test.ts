/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';
import { MockStore } from './mock-store';

function wireSubscription(store: MockStore, state: PuzzleState): () => void {
  const sub = store.subscribe((events) => {
    for (const e of events) state.applyEvent(e);
  });
  return () => sub.unsubscribe();
}

describe('subscription wiring', () => {
  it('remote event applied to state', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    const remote: PlaceEvent = {
      op: 'place', piece: 5, slot: [0, 5], actor: 'remote', ts: 't', v: 1, sha: 'rx',
    };
    store.pushRemoteEvent(remote);
    expect(state.isPlaced(5)).toBe(true);
    expect(state.contributors.has('remote')).toBe(true);
  });

  it('multiple remote events applied in order', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: '1' });
    store.pushRemoteEvent({ op: 'place', piece: 1, slot: [0, 1], actor: 'b', ts: 't', v: 1, sha: '2' });
    expect(state.placedCount).toBe(2);
  });

  it('invalid remote events are ignored', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    store.pushRemoteEvent({ op: 'place', piece: 5, slot: [3, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });

  it('unsubscribe stops further updates', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    const off = wireSubscription(store, state);
    off();
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });
});
