import type { PuzzleState } from './puzzle';
import { showToast } from './toast';
import { promptForToken, showSignOutMenu } from './sign-in-menu';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
  signOut(): Promise<void>;
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
  const actorBtn = document.createElement('button');
  actorBtn.className = 'actor-button';
  actorBtn.style.display = 'none';
  const signInBtn = document.createElement('button');
  signInBtn.className = 'sign-in';
  const total = gridSize * gridSize;

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${total} pieces placed; ${state.contributors.size} contributors`;
    if (store.isAuthenticated()) {
      actorBtn.textContent = `${store.currentActor() ?? ''} ▼`;
      actorBtn.style.display = '';
      signInBtn.style.display = 'none';
    } else {
      actorBtn.style.display = 'none';
      signInBtn.style.display = '';
      signInBtn.textContent = 'Sign in';
      signInBtn.disabled = false;
    }
  };

  signInBtn.addEventListener('click', async () => {
    const token = await promptForToken();
    if (!token) return;
    signInBtn.textContent = 'Signing in...';
    signInBtn.disabled = true;
    try {
      await store.signInWithToken(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      showToast(`Sign-in failed: ${msg}`);
    } finally {
      render();
    }
  });

  actorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showSignOutMenu(actorBtn, async () => {
      await store.signOut();
      render();
    });
  });

  host.replaceChildren(label, counts, actorBtn, signInBtn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
