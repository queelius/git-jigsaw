import { BOARD_SIZE } from './renderer';

export type DraggerState = 'IDLE' | 'POINTER_DOWN' | 'DRAGGING' | 'SELECTED';
export type Rotation = 0 | 90 | 180 | 270;

export interface AttemptResult { kind: 'placed' | 'invalid' | 'conflict' | 'auth-required'; }

export interface DraggerOpts {
  board: HTMLElement;
  gridSize: number;
  getRotation(piece: number): Rotation;
  onAttempt(piece: number, slot: readonly [number, number], rotation: Rotation): Promise<AttemptResult>;
}

const DRAG_THRESHOLD_PX = 5;

export class Dragger {
  state: DraggerState = 'IDLE';
  heldPiece: number | null = null;
  heldRotation: Rotation = 0;
  private startX = 0;
  private startY = 0;
  private host: HTMLElement | null = null;

  constructor(private readonly opts: DraggerOpts) {}

  attach(host: HTMLElement): void {
    this.host = host;
    host.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKey);
  }

  detach(): void {
    if (!this.host) return;
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKey);
    this.host = null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    const pieceBtn = target?.closest?.('.jigsaw-piece') as HTMLElement | null;
    const onBoard = target?.closest?.('.jigsaw-board') as HTMLElement | null;

    if (this.state === 'SELECTED') {
      if (pieceBtn && pieceBtn.dataset.piece === String(this.heldPiece)) {
        this.reset();
        return;
      }
      if (onBoard) {
        const slot = this.slotAt(e.clientX, e.clientY);
        if (slot) {
          const piece = this.heldPiece!;
          const rot = this.heldRotation;
          this.reset();
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
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.state !== 'POINTER_DOWN' && this.state !== 'DRAGGING') return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (this.state === 'POINTER_DOWN' && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.state = 'DRAGGING';
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.state === 'POINTER_DOWN') {
      this.state = 'SELECTED';
      return;
    }
    if (this.state === 'DRAGGING') {
      const slot = this.slotAt(e.clientX, e.clientY);
      const piece = this.heldPiece!;
      const rot = this.heldRotation;
      this.reset();
      if (slot) {
        void this.opts.onAttempt(piece, slot, rot);
      }
    }
  };

  private onPointerCancel = (): void => {
    if (this.state === 'POINTER_DOWN' || this.state === 'DRAGGING') {
      this.reset();
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (this.state !== 'DRAGGING') return;
    if (e.key === 'r' || e.key === 'R') {
      this.heldRotation = ((this.heldRotation + 90) % 360) as Rotation;
    }
  };

  private slotAt(clientX: number, clientY: number): [number, number] | null {
    const rect = this.opts.board.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.left + rect.width) return null;
    if (clientY < rect.top || clientY > rect.top + rect.height) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const col = Math.floor(fx * this.opts.gridSize);
    const row = Math.floor(fy * this.opts.gridSize);
    return [row, col];
  }

  private reset(): void {
    this.state = 'IDLE';
    this.heldPiece = null;
    this.heldRotation = 0;
  }
}

export { BOARD_SIZE };
