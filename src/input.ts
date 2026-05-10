import { isValidPlacement } from './validator';
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(op: string, payload: Record<string, unknown>, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  gridSize: number;
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export type AttemptResult =
  | { kind: 'placed'; sha: string }
  | { kind: 'invalid' }
  | { kind: 'conflict' }
  | { kind: 'auth-required' };

export async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, state, store, week } = args;
  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }
  if (!isValidPlacement(piece, slot, rotation, gridSize)) {
    showToast(`Piece ${piece} doesn't go there.`);
    return { kind: 'invalid' };
  }
  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]], rotation }) };
  try {
    const { sha } = await store.commit('place', { piece, slot, rotation, grid_size: gridSize }, { files });
    state.applyEvent({
      op: 'place', piece, slot, rotation, grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1, sha,
    });
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Someone else placed piece ${piece} just now.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast(`Sign-in expired; please refresh the page and sign in again.`);
      return { kind: 'auth-required' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
