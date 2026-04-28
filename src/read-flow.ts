import { PuzzleState, type Event } from './puzzle';

interface StoreLike {
  eventsSince(since?: string): Promise<Event[]>;
}

export async function loadInitialState(store: StoreLike, _week: string): Promise<PuzzleState> {
  const events = await store.eventsSince();
  const state = new PuzzleState();
  for (const e of events) state.applyEvent(e);
  return state;
}

export interface PuzzleAssets {
  source: HTMLImageElement;
  seed: string;
}

export async function loadAssets(dataRepo: string, week: string): Promise<PuzzleAssets> {
  const baseUrl = `https://raw.githubusercontent.com/${dataRepo}/main/jigsaw/${week}`;
  const metaUrl = `${baseUrl}/meta.yaml`;
  const sourceUrl = `${baseUrl}/source.png`;
  const metaText = await fetch(metaUrl).then((r) => {
    if (!r.ok) throw new Error(`meta.yaml fetch failed: ${r.status}`);
    return r.text();
  });
  const seedMatch = metaText.match(/seed:\s*([0-9a-f]+)/);
  if (!seedMatch) throw new Error('seed not found in meta.yaml');
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('source.png failed to load'));
    img.src = sourceUrl;
  });
  return { source, seed: seedMatch[1] };
}
