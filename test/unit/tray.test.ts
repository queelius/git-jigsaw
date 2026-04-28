import { describe, it, expect } from 'vitest';
import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';

describe('Tray', () => {
  it('lists all 64 pieces when state is empty', () => {
    const s = new PuzzleState();
    const t = new Tray(s, 'queelius');
    expect(t.unplaced().length).toBe(64);
  });

  it('omits placed pieces', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    const t = new Tray(s, 'queelius');
    expect(t.unplaced().length).toBe(63);
    expect(t.unplaced().includes(0)).toBe(false);
  });

  it('order is deterministic for the same actor name', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const b = new Tray(s, 'queelius').unplaced();
    expect(a).toEqual(b);
  });

  it('order differs across actor names', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'alice').unplaced();
    const b = new Tray(s, 'bob').unplaced();
    expect(a).not.toEqual(b);
  });

  it('order is not numerical (does not give the answer away)', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const numerical = Array.from({ length: 64 }, (_, i) => i);
    expect(a).not.toEqual(numerical);
  });

  it('contains every piece exactly once', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const set = new Set(a);
    expect(set.size).toBe(64);
    for (let i = 0; i < 64; i++) expect(set.has(i)).toBe(true);
  });
});
