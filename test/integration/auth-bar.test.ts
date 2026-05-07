/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAuthBar } from '../../src/auth-bar';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

describe('auth-bar', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('renders the week label', () => {
    const state = new PuzzleState(8);
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    expect(host.textContent).toContain('2026-W17');
  });

  it('shows placed-count, total, and contributors-count', () => {
    const state = new PuzzleState(8);
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    state.applyEvent({ op: 'place', piece: 1, slot: [0, 1], rotation: 0, grid_size: 8, actor: 'b', ts: 't', v: 1, sha: 'y' });
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    expect(host.textContent).toMatch(/2 of 64/);
    expect(host.textContent).toMatch(/2 contributors/);
  });

  it('updates when state changes', () => {
    const state = new PuzzleState(8);
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(host.textContent).toMatch(/1 of 64/);
  });

  it('shows Sign in when unauthenticated', () => {
    const store = new MockStore();
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    const btn = host.querySelector('button.sign-in') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Sign in');
  });

  it('shows actor name when authenticated', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    expect(host.textContent).toContain('queelius');
  });
});
