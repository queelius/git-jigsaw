/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { MockStore } from './mock-store';

describe('MockStore', () => {
  it('starts unauthenticated', () => {
    const s = new MockStore();
    expect(s.isAuthenticated()).toBe(false);
  });

  it('signIn sets actor', async () => {
    const s = new MockStore();
    await s.signIn();
    expect(s.isAuthenticated()).toBe(true);
    expect(s.currentActor()).toBe('mockuser');
  });

  it('commit records call and emits to subscribers', async () => {
    const s = new MockStore({ initialActor: 'queelius' });
    const seen: any[] = [];
    s.subscribe((evs) => seen.push(...evs));
    await s.commit('place', { piece: 42, slot: [5, 2] });
    expect(s.commitCalls).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].op).toBe('place');
  });

  it('delete records call', async () => {
    const s = new MockStore({ initialActor: 'queelius' });
    await s.delete({ files: ['jigsaw/2026-W19/placements/042.json'] });
    expect(s.deleteCalls).toHaveLength(1);
    expect(s.deleteCalls[0].files).toEqual(['jigsaw/2026-W19/placements/042.json']);
  });
});
