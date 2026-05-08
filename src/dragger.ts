import { BOARD_SIZE } from './renderer';

export type DraggerState = 'IDLE' | 'POINTER_DOWN' | 'DRAGGING' | 'SELECTED';
export type Rotation = 0 | 90 | 180 | 270;

export interface AttemptResult { kind: 'placed' | 'invalid' | 'conflict' | 'auth-required'; }

export interface DraggerOpts {
  board: HTMLElement;
  gridSize: number;
  getRotation(piece: number): Rotation;
  getThumbnail?(piece: number, rotation: Rotation): HTMLCanvasElement | null;
  onAttempt(piece: number, slot: readonly [number, number], rotation: Rotation): Promise<AttemptResult>;
}

const DRAG_THRESHOLD_PX = 5;
const DEBUG = true;

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[dragger]', ...args);
}

export class Dragger {
  state: DraggerState = 'IDLE';
  heldPiece: number | null = null;
  heldRotation: Rotation = 0;
  private startX = 0;
  private startY = 0;
  private host: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;

  constructor(private readonly opts: DraggerOpts) {}

  attach(host: HTMLElement): void {
    this.host = host;
    host.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKey);
    log('attached to', host.tagName);
  }

  detach(): void {
    if (!this.host) return;
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKey);
    this.host = null;
    this.removeGhost();
    this.clearSelectedClass();
  }

  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    const pieceBtn = target?.closest?.('.jigsaw-piece') as HTMLElement | null;
    const onBoard = target?.closest?.('.jigsaw-board') as HTMLElement | null;
    log('pointerdown', { state: this.state, pieceBtn: pieceBtn?.dataset.piece, onBoard: !!onBoard });

    if (this.state === 'SELECTED') {
      if (pieceBtn && pieceBtn.dataset.piece === String(this.heldPiece)) {
        log('tap same piece -> deselect');
        this.reset();
        return;
      }
      if (onBoard) {
        const slot = this.slotAt(e.clientX, e.clientY);
        log('tap on board', { slot });
        if (slot) {
          const piece = this.heldPiece!;
          const rot = this.heldRotation;
          this.reset();
          log('attempt place from SELECTED', { piece, slot, rot });
          void this.opts.onAttempt(piece, slot, rot);
          return;
        }
      }
      return;
    }

    if (pieceBtn) {
      const piece = parseInt(pieceBtn.dataset.piece!, 10);
      this.heldPiece = piece;
      this.heldRotation = this.opts.getRotation(piece);
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.state = 'POINTER_DOWN';
      log('-> POINTER_DOWN', { piece, rotation: this.heldRotation });
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.state !== 'POINTER_DOWN' && this.state !== 'DRAGGING') return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (this.state === 'POINTER_DOWN' && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.state = 'DRAGGING';
      log('-> DRAGGING');
      this.showGhost();
    }
    if (this.state === 'DRAGGING') {
      this.updateGhost(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    log('pointerup', { state: this.state });
    if (this.state === 'POINTER_DOWN') {
      this.state = 'SELECTED';
      this.applySelectedClass();
      log('-> SELECTED', { piece: this.heldPiece });
      return;
    }
    if (this.state === 'DRAGGING') {
      const slot = this.slotAt(e.clientX, e.clientY);
      const piece = this.heldPiece!;
      const rot = this.heldRotation;
      log('drop attempt', { piece, slot, rot, x: e.clientX, y: e.clientY });
      this.removeGhost();
      this.reset();
      if (slot) {
        log('attempt place from DRAGGING', { piece, slot, rot });
        void this.opts.onAttempt(piece, slot, rot);
      } else {
        log('drop off-board, no attempt');
      }
    }
  };

  private onPointerCancel = (): void => {
    if (this.state === 'POINTER_DOWN' || this.state === 'DRAGGING') {
      log('pointercancel from', this.state);
      this.removeGhost();
      this.reset();
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (this.state !== 'DRAGGING') return;
    if (e.key === 'r' || e.key === 'R') {
      this.heldRotation = ((this.heldRotation + 90) % 360) as Rotation;
      log('R rotated to', this.heldRotation);
      this.refreshGhost();
    }
  };

  private slotAt(clientX: number, clientY: number): [number, number] | null {
    const rect = this.opts.board.getBoundingClientRect();
    log('slotAt', { clientX, clientY, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
    if (clientX < rect.left || clientX > rect.left + rect.width) return null;
    if (clientY < rect.top || clientY > rect.top + rect.height) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const col = Math.floor(fx * this.opts.gridSize);
    const row = Math.floor(fy * this.opts.gridSize);
    return [row, col];
  }

  private reset(): void {
    this.clearSelectedClass();
    this.state = 'IDLE';
    this.heldPiece = null;
    this.heldRotation = 0;
  }

  private applySelectedClass(): void {
    if (this.heldPiece === null) return;
    const btn = document.querySelector(`.jigsaw-piece[data-piece="${this.heldPiece}"]`);
    btn?.classList.add('jigsaw-piece-selected');
  }

  private clearSelectedClass(): void {
    document.querySelectorAll('.jigsaw-piece-selected').forEach((el) => el.classList.remove('jigsaw-piece-selected'));
  }

  private showGhost(): void {
    if (this.heldPiece === null) return;
    const ghost = document.createElement('div');
    ghost.className = 'jigsaw-ghost';
    const thumb = this.opts.getThumbnail?.(this.heldPiece, this.heldRotation);
    if (thumb) {
      const cloneCanvas = document.createElement('canvas');
      cloneCanvas.width = thumb.width;
      cloneCanvas.height = thumb.height;
      const ctx = cloneCanvas.getContext('2d');
      if (ctx) ctx.drawImage(thumb, 0, 0);
      ghost.appendChild(cloneCanvas);
    } else {
      ghost.textContent = String(this.heldPiece);
    }
    document.body.appendChild(ghost);
    this.ghost = ghost;
  }

  private updateGhost(clientX: number, clientY: number): void {
    if (!this.ghost) return;
    this.ghost.style.left = `${clientX}px`;
    this.ghost.style.top = `${clientY}px`;
  }

  private refreshGhost(): void {
    this.removeGhost();
    this.showGhost();
  }

  private removeGhost(): void {
    if (this.ghost) {
      this.ghost.remove();
      this.ghost = null;
    }
  }
}

export { BOARD_SIZE };
