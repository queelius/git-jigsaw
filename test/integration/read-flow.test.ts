/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { loadInitialState } from '../../src/read-flow';
import { MockStore } from './mock-store';

describe('loadInitialState', () => {
  it('applies all valid place events from the store', async () => {
    const store = new MockStore({
      initialEvents: [
        { op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: '1' },
        { op: 'place', piece: 9, slot: [1, 1], actor: 'b', ts: 't', v: 1, sha: '2' },
        { op: 'place', piece: 9, slot: [3, 0], actor: 'c', ts: 't', v: 1, sha: '3' }, // invalid
      ],
    });
    const state = await loadInitialState(store, '2026-W17');
    expect(state.placedCount).toBe(2);
    expect(state.contributors.size).toBe(2);
  });

  it('returns empty state when store has no events', async () => {
    const store = new MockStore();
    const state = await loadInitialState(store, '2026-W17');
    expect(state.placedCount).toBe(0);
  });
});
