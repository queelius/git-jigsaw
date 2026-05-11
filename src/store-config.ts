import { gitNative, type Event, type EventQuery } from 'git-native';
import { GitHubAdapter } from 'git-native/github';

const TOKEN_KEY = 'git-jigsaw:token';

const tokenStorage = {
  get: (): string | null => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  set: (v: string | null): void => {
    if (typeof localStorage === 'undefined') return;
    if (v === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, v);
  },
};

export interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
  signOut(): Promise<void>;
  restoreSession(): Promise<void>;
  commit(op: string, payload: Record<string, unknown>, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
  delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }>;
  eventsSince(since?: string): Promise<Event[]>;
  subscribe(callback: (events: Event[]) => void): { unsubscribe(): void };
}

export function makeStore(week: string): StoreLike {
  if (!__OAUTH_CLIENT_ID__) {
    console.warn('GH_OAUTH_CLIENT_ID is empty');
  }
  const adapter = new GitHubAdapter({
    repo: __DATA_REPO__,
    path: `${__DATA_PATH__}${week}/`,
    clientId: __OAUTH_CLIENT_ID__,
    storage: tokenStorage,
  });
  const real = gitNative({ adapter, pollInterval: 5000 });
  return {
    isAuthenticated: () => real.isAuthenticated(),
    currentActor: () => real.currentActor(),
    signInWithToken: (token) => real.signInWithToken(token),
    signOut: () => real.signOut(),
    restoreSession: () => real.restoreSession(),
    commit: (op, payload, opts) => real.commit({ op, ...payload }, opts),
    delete: (input) => real.delete(input),
    eventsSince: (since?: string) => {
      const query: EventQuery = since ? { since } : {};
      return real.events(query);
    },
    subscribe: (cb) => real.subscribe(cb),
  };
}
