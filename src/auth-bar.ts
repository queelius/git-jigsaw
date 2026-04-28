import type { PuzzleState } from './puzzle';
import { PIECE_COUNT } from './validator';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signIn(): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export function mountAuthBar(host: HTMLElement, { state, store, week }: MountOpts): () => void {
  host.classList.add('jigsaw-auth-bar');
  const label = document.createElement('span');
  label.className = 'week';
  const counts = document.createElement('span');
  counts.className = 'counts';
  const actorEl = document.createElement('span');
  actorEl.className = 'actor';
  const btn = document.createElement('button');
  btn.className = 'sign-in';

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${PIECE_COUNT} pieces placed; ${state.contributors.size} contributors`;
    if (store.isAuthenticated()) {
      actorEl.textContent = store.currentActor() ?? '';
      btn.textContent = 'Signed in';
      btn.disabled = true;
    } else {
      actorEl.textContent = '';
      btn.textContent = 'Sign in';
      btn.disabled = false;
    }
  };

  btn.addEventListener('click', async () => {
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    try { await store.signIn(); } finally { render(); }
  });

  host.replaceChildren(label, counts, actorEl, btn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
