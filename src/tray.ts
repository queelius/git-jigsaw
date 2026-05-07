import type { PuzzleState } from './puzzle';
import { pieceThumbnail } from './thumbnail';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rotation = 0 | 90 | 180 | 270;

export interface TrayRenderOpts {
  source: CanvasImageSource;
  seed: string;
  rotationEnabled: boolean;
  onRotate(piece: number, rotation: Rotation): void;
}

export class Tray {
  private rotations = new Map<number, Rotation>();

  constructor(
    private readonly state: PuzzleState,
    private readonly actor: string,
    private readonly gridSize: number,
  ) {}

  unplaced(): number[] {
    const total = this.gridSize * this.gridSize;
    const all: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!this.state.isPlaced(i)) all.push(i);
    }
    const rng = mulberry32(fnv1a('tray|' + this.actor));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }

  rotationOf(piece: number): Rotation {
    return this.rotations.get(piece) ?? 0;
  }

  render(opts: TrayRenderOpts): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'jigsaw-tray-grid';

    for (const piece of this.unplaced()) {
      const btn = document.createElement('button');
      btn.className = 'jigsaw-piece';
      btn.dataset.piece = piece.toString();
      const rot = this.rotationOf(piece);
      const thumb = pieceThumbnail(piece, rot, opts.source, opts.seed, this.gridSize);
      const thumbClone = thumb.cloneNode(true) as HTMLCanvasElement;
      btn.appendChild(thumbClone);

      if (opts.rotationEnabled) {
        const overlay = document.createElement('button');
        overlay.className = 'jigsaw-rotate-overlay';
        overlay.type = 'button';
        overlay.setAttribute('aria-label', `Rotate piece ${piece}`);
        overlay.textContent = '↻';
        overlay.addEventListener('click', (e) => {
          e.stopPropagation();
          const current = this.rotationOf(piece);
          const next = ((current + 90) % 360) as Rotation;
          this.rotations.set(piece, next);
          opts.onRotate(piece, next);
        });
        btn.appendChild(overlay);
      }
      grid.appendChild(btn);
    }
    return grid;
  }
}
