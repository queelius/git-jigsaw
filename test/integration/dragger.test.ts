/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Dragger, type Rotation } from '../../src/dragger';

describe('Dragger', () => {
  let host: HTMLElement;
  let board: HTMLElement;
  let onAttempt: any;
  let attempts: Array<{ piece: number; slot: readonly [number, number]; rotation: number }>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    board = document.createElement('canvas');
    board.className = 'jigsaw-board';
    Object.defineProperty(board, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    });
    host.appendChild(board);
    attempts = [];
    onAttempt = (piece: number, slot: [number, number], rotation: number) => {
      attempts.push({ piece, slot, rotation });
      return Promise.resolve({ kind: 'placed' });
    };
  });

  function pieceButton(piece: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'jigsaw-piece';
    btn.dataset.piece = piece.toString();
    Object.defineProperty(btn, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 1100, width: 96, height: 96 }),
    });
    host.appendChild(btn);
    return btn;
  }

  function pointerEvent(type: string, target: EventTarget, opts: Partial<PointerEvent>): void {
    const e = new Event(type, { bubbles: true }) as any;
    Object.assign(e, { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...opts });
    target.dispatchEvent(e);
  }

  it('tap-select then tap-slot calls onAttempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('SELECTED');

    pointerEvent('pointerdown', board, { clientX: 320, clientY: 700 });
    expect(attempts.length).toBe(1);
    expect(attempts[0].piece).toBe(42);
    expect(attempts[0].slot).toEqual([5, 2]);
  });

  it('drag (movement >5px) then drop on slot calls onAttempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointermove', window, { clientX: 320, clientY: 700 });
    pointerEvent('pointerup', window, { clientX: 320, clientY: 700 });
    expect(attempts.length).toBe(1);
    expect(attempts[0].piece).toBe(42);
  });

  it('R key during drag rotates held piece', () => {
    let currentRot: Rotation = 0;
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => currentRot,
      onAttempt: (_p, _s, rot) => {
        attempts.push({ piece: _p, slot: _s, rotation: rot });
        return Promise.resolve({ kind: 'placed' });
      },
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    expect(dragger.state).toBe('DRAGGING');

    const keyEvent = new KeyboardEvent('keydown', { key: 'r' });
    window.dispatchEvent(keyEvent);
    expect(dragger.heldRotation).toBe(90);

    pointerEvent('pointerup', window, { clientX: 320, clientY: 700 });
    expect(attempts[0].rotation).toBe(90);
  });

  it('pointercancel returns to IDLE without attempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointercancel', window, { clientX: 60, clientY: 1100 });
    expect(dragger.state).toBe('IDLE');
    expect(attempts.length).toBe(0);
  });

  it('clicking same selected piece deselects', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('SELECTED');

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('IDLE');
  });
});
