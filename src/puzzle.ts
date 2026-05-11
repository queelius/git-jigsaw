import { isValidPlacement } from './validator';

export interface Placement {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  actor: string;
  ts: string;
  sha: string;
}

export interface PlaceEvent {
  op: 'place';
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  grid_size: number;
  actor: string;
  ts: string;
  v: number;
  sha: string;
}

export interface UnplaceEvent {
  op: 'unplace';
  piece: number;
  slot?: readonly [number, number];
  rotation?: 0 | 90 | 180 | 270;
  grid_size: number;
  actor: string;
  ts: string;
  v: number;
  sha: string;
}

export interface UnknownEvent {
  op: string;
  actor: string;
  ts: string;
  v: number;
  sha: string;
  [k: string]: unknown;
}

export type Event = PlaceEvent | UnplaceEvent | UnknownEvent;

type ChangeListener = () => void;

export class PuzzleState {
  readonly placements = new Map<number, Placement>();
  readonly contributors = new Set<string>();
  readonly history: Event[] = [];
  private readonly eventLog: Event[] = [];
  private listeners = new Set<ChangeListener>();

  constructor(
    public readonly gridSize: number,
    public readonly seed: string,
  ) {}

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  placedAt(row: number, col: number): { piece: number; rotation: 0 | 90 | 180 | 270 } | null {
    for (const [piece, p] of this.placements) {
      if (p.slot[0] === row && p.slot[1] === col) {
        return { piece, rotation: p.rotation };
      }
    }
    return null;
  }

  ingest(newEvents: Event[]): void {
    this.eventLog.push(...newEvents);
    this.rebuild();
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private rebuild(): void {
    const sorted = [...this.eventLog].sort((a, b) =>
      a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha),
    );
    this.placements.clear();
    this.contributors.clear();
    this.history.length = 0;
    for (const event of sorted) {
      this.applyEventInternal(event);
    }
    this.emit();
  }

  private applyEventInternal(event: Event): void {
    // grid_size filter
    const eventGrid = (event as Record<string, unknown>).grid_size;
    if (typeof eventGrid !== 'number' || eventGrid !== this.gridSize) return;

    if (event.op === 'place') {
      const raw = event as Record<string, unknown>;
      const piece = raw.piece;
      const slot = raw.slot;
      const rotation = raw.rotation ?? 0;
      if (typeof piece !== 'number') return;
      if (!Array.isArray(slot) || slot.length !== 2) return;
      if (typeof slot[0] !== 'number' || typeof slot[1] !== 'number') return;
      if (typeof rotation !== 'number') return;
      const excludePiece = this.placements.has(piece) ? piece : undefined;
      if (!isValidPlacement(piece, [slot[0], slot[1]] as const, rotation as 0 | 90 | 180 | 270, this.gridSize, this.seed, this.placements, excludePiece)) return;
      this.placements.set(piece, {
        slot: [slot[0], slot[1]] as const,
        rotation: rotation as 0 | 90 | 180 | 270,
        actor: event.actor,
        ts: event.ts,
        sha: event.sha,
      });
      this.contributors.add(event.actor);
      this.history.push(event);
    } else if (event.op === 'unplace') {
      const raw = event as Record<string, unknown>;
      const piece = raw.piece;
      if (typeof piece !== 'number') return;
      if (!this.placements.has(piece)) return;
      this.placements.delete(piece);
      this.history.push(event);
    }
    // unknown ops: ignored
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
