/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore, type MockStoreOptions } from './mock-store';

const SEED = 'fixedseed12345678';

class ConflictingStore extends MockStore {
  public attempts = 0;
  private failTimes: number;

  constructor(failTimes: number, opts?: MockStoreOptions) {
    super(opts);
    this.failTimes = failTimes;
  }

  override async commit(
    op: string,
    payload: Record<string, unknown>,
    opts?: { files?: Record<string, string> }
  ): Promise<{ sha: string }> {
    this.attempts++;
    this.commitCalls.push({ op, payload, files: opts?.files });
    if (this.attempts <= this.failTimes) {
      const e = new Error('conflict');
      (e as any).name = 'ConflictError';
      throw e;
    }
    return { sha: `sha-${this.attempts}` };
  }
}

describe('conflict retry', () => {
  it('retries on first conflict and succeeds', async () => {
    const store = new ConflictingStore(1, { initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({
      piece: 0,
      slot: [0, 0],
      rotation: 0,
      gridSize: 8,
      seed: SEED,
      state,
      store,
      week: '2026-W19',
    });
    expect(result.kind).toBe('placed');
    expect(store.attempts).toBe(2); // first attempt + one retry
  });

  it('after 3 conflict retries, gives up with conflict result', async () => {
    const store = new ConflictingStore(Number.POSITIVE_INFINITY, { initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({
      piece: 0,
      slot: [0, 0],
      rotation: 0,
      gridSize: 8,
      seed: SEED,
      state,
      store,
      week: '2026-W19',
    });
    expect(result.kind).toBe('conflict');
    expect(store.attempts).toBe(4); // initial + 3 retries
  });
});
