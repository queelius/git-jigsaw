/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { PuzzleState, isSolved, type PlaceEvent } from '../../src/puzzle';

function fillState(state: PuzzleState, gridSize: number, upto: number): void {
  for (let i = 0; i < upto; i++) {
    const ev: PlaceEvent = {
      op: 'place',
      piece: i,
      slot: [Math.floor(i / gridSize), i % gridSize],
      rotation: 0,
      grid_size: gridSize,
      actor: i % 2 === 0 ? 'alice' : 'bob',
      ts: `2026-04-29T10:${String(i).padStart(2, '0')}:00Z`,
      v: 1,
      sha: `sha-${i}`,
    };
    state.applyEvent(ev);
  }
}

describe('completion detection', () => {
  it('isSolved is false before final piece', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 63);
    expect(isSolved(state, 8)).toBe(false);
  });

  it('isSolved is true at exactly piece-count placements', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 64);
    expect(isSolved(state, 8)).toBe(true);
  });

  it('local-witness pattern: capture startedSolved at boot, fire confetti only on transition', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 63);
    const startedSolved = isSolved(state, 8);
    expect(startedSolved).toBe(false);

    let confettiFires = 0;
    const fireConfetti = vi.fn(() => { confettiFires++; });
    let confettiAlreadyFired = false;

    const onChange = () => {
      if (!startedSolved && isSolved(state, 8) && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    };
    state.on('change', onChange);
    state.applyEvent({
      op: 'place',
      piece: 63,
      slot: [7, 7],
      rotation: 0,
      grid_size: 8,
      actor: 'queelius',
      ts: '2026-04-29T11:00:00Z',
      v: 1,
      sha: 'sha-63',
    });
    expect(confettiFires).toBe(1);
  });

  it('reload-into-solved does NOT fire confetti', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 64);
    const startedSolved = isSolved(state, 8);
    expect(startedSolved).toBe(true);

    let confettiFires = 0;
    const fireConfetti = vi.fn(() => { confettiFires++; });
    let confettiAlreadyFired = false;

    const onChange = () => {
      if (!startedSolved && isSolved(state, 8) && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    };
    state.on('change', onChange);
    state.applyEvent({
      op: 'place',
      piece: 0,
      slot: [0, 0],
      rotation: 0,
      grid_size: 8,
      actor: 'mallory',
      ts: '2026-04-29T11:00:00Z',
      v: 1,
      sha: 'sha-dup',
    });
    expect(confettiFires).toBe(0);
  });
});
