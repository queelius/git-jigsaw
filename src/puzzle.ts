import { isValidPlacement } from './validator';

export interface PlaceEvent {
  op: 'place';
  piece: number;
  slot: readonly [number, number];
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

export type Event = PlaceEvent | UnknownEvent;

type ChangeListener = () => void;

export class PuzzleState {
  readonly placements = new Map<number, readonly [number, number]>();
  readonly contributors = new Set<string>();
  private listeners = new Set<ChangeListener>();

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  applyEvent(event: Event): void {
    if (event.op !== 'place') return;
    const place = event as PlaceEvent;
    if (!isValidPlacement(place.piece, place.slot)) return;
    if (this.placements.has(place.piece)) return;
    this.placements.set(place.piece, place.slot);
    this.contributors.add(place.actor);
    this.emit();
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
