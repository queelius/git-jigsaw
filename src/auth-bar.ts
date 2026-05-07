import type { PuzzleState } from './puzzle';
import { showToast } from './toast';
import { promptForToken } from './sign-in-modal';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
  gridSize: number;
}

export function mountAuthBar(host: HTMLElement, { state, store, week, gridSize }: MountOpts): () => void {
  host.classList.add('jigsaw-auth-bar');
  const label = document.createElement('span');
  label.className = 'week';
  const counts = document.createElement('span');
  counts.className = 'counts';
  const actorEl = document.createElement('span');
  actorEl.className = 'actor';
  const btn = document.createElement('button');
  btn.className = 'sign-in';
  const total = gridSize * gridSize;

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${total} pieces placed; ${state.contributors.size} contributors`;
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
    const token = await promptForToken();
    if (!token) return;
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    try {
      await store.signInWithToken(token);
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
