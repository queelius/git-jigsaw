/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { loadInitialState, parseMeta } from '../../src/read-flow';
import { MockStore } from './mock-store';

describe('parseMeta', () => {
  it('parses V2 meta with grid_size and rotation', () => {
    const text = "seed: a3f7c1234567890d\ngrid_size: 10\nrotation: true\n";
    const meta = parseMeta(text);
    expect(meta.seed).toBe('a3f7c1234567890d');
    expect(meta.gridSize).toBe(10);
    expect(meta.rotationEnabled).toBe(true);
  });

  it('defaults to gridSize=8 and rotation=false when meta lacks them (V1 backwards compat)', () => {
    const text = "seed: deadbeef00000000\n";
    const meta = parseMeta(text);
    expect(meta.seed).toBe('deadbeef00000000');
    expect(meta.gridSize).toBe(8);
    expect(meta.rotationEnabled).toBe(false);
  });

  it('throws when seed is missing', () => {
    expect(() => parseMeta("grid_size: 8\n")).toThrow(/seed/);
  });
});

describe('loadInitialState', () => {
  it('applies all valid place events from the store', async () => {
    const store = new MockStore({
      initialEvents: [
        { op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: '1' },
        { op: 'place', piece: 9, slot: [1, 1], rotation: 0, grid_size: 8, actor: 'b', ts: 't', v: 1, sha: '2' },
        { op: 'place', piece: 9, slot: [3, 0], rotation: 0, grid_size: 8, actor: 'c', ts: 't', v: 1, sha: '3' },
      ],
    });
    const state = await loadInitialState(store, '2026-W17', 8);
    expect(state.placedCount).toBe(2);
    expect(state.contributors.size).toBe(2);
    expect(state.validEvents.length).toBe(2);
  });

  it('returns empty state when store has no events', async () => {
    const store = new MockStore();
    const state = await loadInitialState(store, '2026-W17', 8);
    expect(state.placedCount).toBe(0);
  });
});
