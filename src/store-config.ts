import { gitNative, type Event, type EventQuery } from 'git-native';
import { GitHubAdapter } from 'git-native/github';

export interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  commit(op: string, payload: Record<string, unknown>, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
  eventsSince(since?: string): Promise<Event[]>;
  subscribe(callback: (events: Event[]) => void): { unsubscribe(): void };
}

export function makeStore(week: string): StoreLike {
  if (!__OAUTH_CLIENT_ID__) {
    console.warn('GH_OAUTH_CLIENT_ID is empty; sign-in will fail');
  }
  const adapter = new GitHubAdapter({
    repo: __DATA_REPO__,
    path: `${__DATA_PATH__}${week}/`,
    clientId: __OAUTH_CLIENT_ID__,
  });
  const real = gitNative({ adapter, pollInterval: 5000 });
  return {
    isAuthenticated: () => real.isAuthenticated(),
    currentActor: () => real.currentActor(),
    signIn: () => real.signIn(),
    signOut: () => real.signOut(),
    commit: (op, payload, opts) => real.commit({ op, ...payload }, opts),
    eventsSince: (since?: string) => {
      const query: EventQuery = since ? { since } : {};
      return real.events(query);
    },
    subscribe: (cb) => real.subscribe(cb),
  };
}
