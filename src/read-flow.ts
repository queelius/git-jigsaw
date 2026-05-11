import { PuzzleState, type Event } from './puzzle';

interface StoreLike {
  eventsSince(since?: string): Promise<Event[]>;
}

export async function loadInitialState(store: StoreLike, _week: string, gridSize: number, seed: string): Promise<PuzzleState> {
  const events = await store.eventsSince();
  const state = new PuzzleState(gridSize, seed);
  state.ingest(events);
  return state;
}

export interface PuzzleAssets {
  source: HTMLImageElement;
  seed: string;
  gridSize: number;
  rotationEnabled: boolean;
}

export interface PuzzleMeta {
  seed: string;
  gridSize: number;
  rotationEnabled: boolean;
}

export function parseMeta(text: string): PuzzleMeta {
  const seedMatch = text.match(/seed:\s*([0-9a-f]+)/);
  if (!seedMatch) throw new Error('seed not found in meta.yaml');
  const gridMatch = text.match(/grid_size:\s*(\d+)/);
  const rotMatch = text.match(/rotation:\s*(true|false)/i);
  return {
    seed: seedMatch[1],
    gridSize: gridMatch ? parseInt(gridMatch[1], 10) : 8,
    rotationEnabled: rotMatch ? rotMatch[1].toLowerCase() === 'true' : false,
  };
}

export async function loadAssets(dataRepo: string, week: string): Promise<PuzzleAssets> {
  const baseUrl = `https://raw.githubusercontent.com/${dataRepo}/main/jigsaw/${week}`;
  const metaUrl = `${baseUrl}/meta.yaml`;
  const sourceUrl = `${baseUrl}/source.png`;
  const metaText = await fetch(metaUrl).then((r) => {
    if (!r.ok) throw new Error(`meta.yaml fetch failed: ${r.status}`);
    return r.text();
  });
  const meta = parseMeta(metaText);
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('source.png failed to load'));
    img.src = sourceUrl;
  });
  return { source, seed: meta.seed, gridSize: meta.gridSize, rotationEnabled: meta.rotationEnabled };
}
