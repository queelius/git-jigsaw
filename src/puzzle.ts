import { isValidPlacement } from './validator';

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
  readonly validEvents: PlaceEvent[] = [];
  private listeners = new Set<ChangeListener>();

  constructor(public readonly gridSize: number) {}

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  applyEvent(event: Event): void {
    if (event.op !== 'place') return;
    const piece = (event as Record<string, unknown>).piece;
    const slot = (event as Record<string, unknown>).slot;
    const rotation = (event as Record<string, unknown>).rotation ?? 0;
    const eventGrid = (event as Record<string, unknown>).grid_size ?? this.gridSize;
    if (typeof piece !== 'number') return;
    if (!Array.isArray(slot) || slot.length !== 2) return;
    if (typeof slot[0] !== 'number' || typeof slot[1] !== 'number') return;
    if (typeof rotation !== 'number') return;
    if (typeof eventGrid !== 'number' || eventGrid !== this.gridSize) return;
    if (!isValidPlacement(piece, [slot[0], slot[1]] as const, rotation as 0 | 90 | 180 | 270, this.gridSize)) return;
    if (this.placements.has(piece)) return;
    this.placements.set(piece, [slot[0], slot[1]] as const);
    this.contributors.add((event as PlaceEvent).actor);
    this.validEvents.push(event as PlaceEvent);
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

export function isSolved(state: PuzzleState, gridSize: number): boolean {
  return state.placedCount === gridSize * gridSize;
}
