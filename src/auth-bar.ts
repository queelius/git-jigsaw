import type { PuzzleState } from './puzzle';
import { PIECE_COUNT } from './validator';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

const PAT_INSTRUCTIONS = (
  'Paste a GitHub Personal Access Token (classic) with "repo" scope.\n\n' +
  'Generate one at:\n' +
  'https://github.com/settings/tokens/new?scopes=repo&description=metafunctor%20jigsaw\n\n' +
  'The token stays in your browser (localStorage). The page never sends it anywhere except api.github.com.'
);

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
    const token = window.prompt(PAT_INSTRUCTIONS);
    if (!token) return;
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    try {
      await store.signInWithToken(token.trim());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      showToast(`Sign-in failed: ${msg}`);
    } finally {
      render();
    }
  });

  host.replaceChildren(label, counts, actorEl, btn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
