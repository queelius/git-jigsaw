import { isValidPlacement } from './validator';
import type { PuzzleState, PlaceEvent, UnplaceEvent } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(op: string, payload: Record<string, unknown>, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
  delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }>;
  eventsSince(since?: string): Promise<any[]>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  gridSize: number;
  seed: string;
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export interface AttemptUnplaceArgs {
  piece: number;
  gridSize: number;
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export type AttemptResult =
  | { kind: 'placed'; sha: string }
  | { kind: 'unplaced' }
  | { kind: 'noop' }
  | { kind: 'invalid' }
  | { kind: 'conflict' }
  | { kind: 'auth-required' };

const MAX_CONFLICT_RETRIES = 3;

export async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, state, store } = args;

  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }

  // No-op detection
  const current = state.placements.get(piece);
  if (current && current.slot[0] === slot[0] && current.slot[1] === slot[1] && current.rotation === rotation) {
    return { kind: 'noop' };
  }

  // Implicit-unplace-on-drop
  const occupant = state.placedAt(slot[0], slot[1]);
  if (occupant && occupant.piece !== piece) {
    const unplaceResult = await attemptUnplace({ piece: occupant.piece, gridSize, state, store: args.store, week: args.week });
    if (unplaceResult.kind !== 'unplaced' && unplaceResult.kind !== 'noop') {
      return unplaceResult;
    }
  }

  return tryPlace(args, 0);
}

async function tryPlace(args: AttemptPlaceArgs, retries: number): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, seed, state, store, week } = args;

  const excludePiece = state.placements.has(piece) ? piece : undefined;
  if (!isValidPlacement(piece, slot, rotation, gridSize, seed, state.placements, excludePiece)) {
    showToast(`Piece ${piece} doesn't fit there.`);
    return { kind: 'invalid' };
  }

  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]], rotation }) };

  try {
    const { sha } = await store.commit('place', { piece, slot, rotation, grid_size: gridSize }, { files });
    const event: PlaceEvent = {
      op: 'place',
      piece,
      slot,
      rotation,
      grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1,
      sha,
    };
    state.ingest([event]);
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError' && retries < MAX_CONFLICT_RETRIES) {
      const fresh = await store.eventsSince(undefined);
      state.ingest(fresh);
      return tryPlace(args, retries + 1);
    }
    if (err?.name === 'ConflictError') {
      showToast(`Couldn't place piece ${piece}: too many conflicts. Try again.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast('Sign-in expired; refresh and sign in again.');
      return { kind: 'auth-required' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}

export async function attemptUnplace(args: AttemptUnplaceArgs): Promise<AttemptResult> {
  const { piece, gridSize, state, store, week } = args;

  if (!store.isAuthenticated()) {
    showToast('Sign in to unplace pieces.');
    return { kind: 'auth-required' };
  }

  const current = state.placements.get(piece);
  if (!current) return { kind: 'noop' };

  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;

  try {
    const { sha } = await store.delete({ files: [path] });
    const event: UnplaceEvent = {
      op: 'unplace',
      piece,
      slot: current.slot,
      rotation: current.rotation,
      grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1,
      sha,
    };
    state.ingest([event]);
    return { kind: 'unplaced' };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Couldn't unplace piece ${piece}: conflict. Try again.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast('Sign-in expired; refresh and sign in again.');
      return { kind: 'auth-required' };
    }
    showToast(`Could not unplace piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
