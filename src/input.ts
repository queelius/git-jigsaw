import { isValidPlacement } from './validator';
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(op: string, payload: any, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
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
  const { piece, slot, state, store, week } = args;
  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }
  if (!isValidPlacement(piece, slot)) {
    showToast('Wrong slot.');
    return { kind: 'invalid' };
  }
  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]] }) };
  try {
    const { sha } = await store.commit('place', { piece, slot }, { files });
    state.applyEvent({
      op: 'place',
      piece,
      slot,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1,
      sha,
    });
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Someone else placed piece ${piece} just now.`);
      return { kind: 'conflict' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
