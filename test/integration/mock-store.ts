import type { PlaceEvent, UnknownEvent } from '../../src/puzzle';

type AnyEvent = PlaceEvent | UnknownEvent;

export interface MockStoreOptions {
  initialEvents?: AnyEvent[];
  initialActor?: string | null;
  rejectNextWith?: Error;
}

export class MockStore {
  private events: AnyEvent[] = [];
  private actor: string | null = null;
  public commitCalls: Array<{ op: string; payload: any; files: Record<string, string> | undefined }> = [];
  private subscribers = new Set<(events: AnyEvent[]) => void>();
  private rejectNext: Error | undefined;

  constructor(opts: MockStoreOptions = {}) {
    this.events = opts.initialEvents ? [...opts.initialEvents] : [];
    this.actor = opts.initialActor ?? null;
    this.rejectNext = opts.rejectNextWith;
  }

  isAuthenticated(): boolean { return this.actor !== null; }
  currentActor(): string | null { return this.actor; }

  async signIn(): Promise<void> {
    this.actor = this.actor ?? 'mockuser';
  }

  async signInWithToken(_token: string): Promise<void> {
    this.actor = this.actor ?? 'mockuser';
  }

  async restoreSession(): Promise<void> {
    // no-op for tests
  }

  async signOut(): Promise<void> { this.actor = null; }

  async commit(op: string, payload: any, opts?: { files?: Record<string, string> }): Promise<{ sha: string }> {
    if (this.rejectNext) {
      const e = this.rejectNext;
      this.rejectNext = undefined;
      throw e;
    }
    this.commitCalls.push({ op, payload, files: opts?.files });
    const sha = 'sha-' + (this.events.length + 1).toString().padStart(8, '0');
    const event: AnyEvent = {
      op,
      ...payload,
      actor: this.actor ?? 'mockuser',
      ts: new Date().toISOString(),
      v: 1,
      sha,
    };
    this.events.push(event);
    for (const fn of this.subscribers) fn([event]);
    return { sha };
  }

  async eventsSince(_since?: string): Promise<AnyEvent[]> {
    return [...this.events];
  }

  subscribe(callback: (events: AnyEvent[]) => void): { unsubscribe(): void } {
    this.subscribers.add(callback);
    return { unsubscribe: () => this.subscribers.delete(callback) };
  }

  pushRemoteEvent(event: AnyEvent): void {
    this.events.push(event);
    for (const fn of this.subscribers) fn([event]);
  }
}
