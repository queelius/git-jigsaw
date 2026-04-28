import { PIECE_COUNT } from './validator';
import type { PuzzleState } from './puzzle';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Tray {
  constructor(private readonly state: PuzzleState, private readonly actor: string) {}

  unplaced(): number[] {
    const all: number[] = [];
    for (let i = 0; i < PIECE_COUNT; i++) {
      if (!this.state.isPlaced(i)) all.push(i);
    }
    const rng = mulberry32(fnv1a('tray|' + this.actor));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }
}
