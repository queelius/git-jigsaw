import { describe, it, expect } from 'vitest';
import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';

describe('Tray', () => {
  it('lists all pieces when state is empty (8x8)', () => {
    const t = new Tray(new PuzzleState(8), 'queelius', 8);
    expect(t.unplaced().length).toBe(64);
  });

  it('lists all pieces when state is empty (10x10)', () => {
    const t = new Tray(new PuzzleState(10), 'queelius', 10);
    expect(t.unplaced().length).toBe(100);
  });

  it('omits placed pieces', () => {
    const s = new PuzzleState(8);
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    const t = new Tray(s, 'queelius', 8);
    expect(t.unplaced().length).toBe(63);
    expect(t.unplaced().includes(0)).toBe(false);
  });

  it('order is deterministic for the same actor name', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    const b = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    expect(a).toEqual(b);
  });

  it('order differs across actor names', () => {
    const a = new Tray(new PuzzleState(8), 'alice', 8).unplaced();
    const b = new Tray(new PuzzleState(8), 'bob', 8).unplaced();
    expect(a).not.toEqual(b);
  });

  it('order is not numerical', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    const numerical = Array.from({ length: 64 }, (_, i) => i);
    expect(a).not.toEqual(numerical);
  });

  it('contains every piece exactly once', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    const set = new Set(a);
    expect(set.size).toBe(64);
    for (let i = 0; i < 64; i++) expect(set.has(i)).toBe(true);
  });
});
