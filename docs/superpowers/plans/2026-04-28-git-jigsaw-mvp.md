# git-jigsaw V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the weekly AI-generated jigsaw at `metafunctor.com/arcade/jigsaw`, with each piece-placement persisted as a git commit in `queelius/metafunctor-data` via the `git-native` TypeScript library.

**Architecture:** Three repos cooperate. `git-jigsaw` (this repo) is a vanilla-TS-plus-canvas Vite app. It depends on `git-native` for OAuth, commits, conflict retry, and subscription. `metafunctor-data` holds the source images and the commit log; a GitHub Actions cron generates a fresh image every Monday. `metafunctor` (Hugo) hosts the built bundle at `static/arcade/jigsaw/` and a page at `content/arcade/jigsaw.md`.

**Tech Stack:** TypeScript, Vite, Vitest, happy-dom, Playwright (opt-in), `git-native` (TS), Python 3.12, `openai` SDK, GitHub Actions, Hugo, GitHub Device Flow.

---

## File structure

```
git-jigsaw/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── index.html                    # dev server entry
├── public/                       # static assets if any
├── src/
│   ├── main.ts                   # bootstrap, URL parsing, lifecycle
│   ├── puzzle.ts                 # PuzzleState (event log + state mutation)
│   ├── shapes.ts                 # deterministic jigsaw tab/blank generation
│   ├── validator.ts              # isValidPlacement (pure arithmetic)
│   ├── renderer.ts               # canvas painter
│   ├── tray.ts                   # piece tray UI (shuffled, draggable)
│   ├── input.ts                  # drag-and-drop wiring
│   ├── auth-bar.ts               # sign-in button + counter UI
│   ├── toast.ts                  # toast notifications
│   ├── store-config.ts           # git-native Store factory
│   ├── styles.css
│   └── env.d.ts                  # __DATA_REPO__ etc. type declarations
├── test/
│   ├── unit/
│   │   ├── validator.test.ts
│   │   ├── shapes.test.ts
│   │   └── puzzle.test.ts
│   ├── integration/
│   │   ├── mock-store.ts
│   │   ├── auth-bar.test.ts
│   │   ├── read-flow.test.ts
│   │   ├── write-flow.test.ts
│   │   ├── subscription.test.ts
│   │   └── cross-client.test.ts
│   ├── e2e/
│   │   └── happy-path.spec.ts
│   └── fixtures/
│       ├── ts-commit-body.yaml   # produced by git-native-py
│       └── tiny-source.png       # 4-piece test image (256×256)
├── scripts/
│   └── deploy.sh
├── .github/workflows/ci.yml
├── docs/superpowers/specs/2026-04-28-git-jigsaw-design.md
├── docs/superpowers/plans/2026-04-28-git-jigsaw-mvp.md
├── README.md
├── LICENSE
└── .gitignore
```

In `metafunctor-data`:

```
metafunctor-data/
├── README.md
├── .gitignore
├── .github/workflows/jigsaw-weekly.yml
├── tools/
│   ├── pyproject.toml
│   ├── src/jigsaw_tools/
│   │   ├── __init__.py
│   │   ├── generate_puzzle.py
│   │   └── prompts.py
│   └── tests/
│       └── test_generate_puzzle.py
└── jigsaw/
    └── README.md
```

In `metafunctor` (existing Hugo repo, additions only):

```
metafunctor/
├── content/arcade/
│   ├── _index.md
│   └── jigsaw.md
├── layouts/arcade/jigsaw/
│   └── single.html
├── layouts/partials/
│   └── jigsaw-assets.html
└── static/arcade/jigsaw/         # rsync target (git-tracked artifacts)
```

---

## Task 1: Repo scaffolding

**Files:**
- Create: `git-jigsaw/package.json`
- Create: `git-jigsaw/tsconfig.json`
- Create: `git-jigsaw/vite.config.ts`
- Create: `git-jigsaw/vitest.config.ts`
- Create: `git-jigsaw/index.html`
- Create: `git-jigsaw/.gitignore`
- Create: `git-jigsaw/LICENSE`
- Create: `git-jigsaw/README.md` (placeholder)
- Create: `git-jigsaw/src/env.d.ts`
- Create: `git-jigsaw/src/main.ts` (stub)
- Create: `git-jigsaw/src/styles.css` (empty)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "git-jigsaw",
  "version": "0.1.0-pre",
  "description": "Weekly AI-generated jigsaw puzzle where each piece-placement is a git commit",
  "type": "module",
  "license": "MIT",
  "author": "Alexander Towell <lex@metafunctor.com>",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "deploy": "bash scripts/deploy.sh"
  },
  "dependencies": {
    "git-native": "file:../git-native",
    "js-yaml": "^4.1.0"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@playwright/test": "^1.48.0",
    "happy-dom": "^15.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "types": ["vitest/globals"]
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/arcade/jigsaw/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
  },
  define: {
    __DATA_REPO__: JSON.stringify('queelius/metafunctor-data'),
    __DATA_PATH__: JSON.stringify('jigsaw/'),
    __OAUTH_CLIENT_ID__: JSON.stringify(process.env.GH_OAUTH_CLIENT_ID ?? ''),
  },
});
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.test.ts'],
    environment: 'happy-dom',
    environmentMatchGlobs: [
      ['test/unit/**', 'node'],
      ['test/integration/**', 'happy-dom'],
    ],
  },
});
```

- [ ] **Step 5: Write `src/env.d.ts`**

```ts
declare const __DATA_REPO__: string;
declare const __DATA_PATH__: string;
declare const __OAUTH_CLIENT_ID__: string;
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Weekly Jigsaw</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="jigsaw-root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Write `src/main.ts` stub**

```ts
const root = document.getElementById('jigsaw-root');
if (root) root.textContent = 'jigsaw bootstrapping';
```

- [ ] **Step 8: Write `src/styles.css` (empty placeholder)**

```css
/* styles populated in later tasks */
```

- [ ] **Step 9: Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
playwright-report/
test-results/
*.log
.DS_Store
```

- [ ] **Step 10: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Alexander Richard Towell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 11: Write `README.md` placeholder**

```markdown
# git-jigsaw

Weekly AI-generated jigsaw puzzle where each piece-placement is a git commit. Demo for the `git-native` library, deployed at https://metafunctor.com/arcade/jigsaw.

Full README in Task 18. See `docs/superpowers/specs/2026-04-28-git-jigsaw-design.md` for the design.
```

- [ ] **Step 12: Install and verify build**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm install
npm run typecheck
npm run build
```

Expected: typecheck passes; build emits `dist/` with `index.html`, hashed JS, manifest.json. No errors.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "Scaffold git-jigsaw: Vite + TS + Vitest + license"
```

---

## Task 2: Validator (TDD)

**Files:**
- Create: `git-jigsaw/src/validator.ts`
- Create: `git-jigsaw/test/unit/validator.test.ts`

The puzzle is 8×8. Piece N belongs at slot `[N // 8, N % 8]`. The validator is one line of arithmetic. Doing this first locks the convention and gives us a building block every later task assumes.

- [ ] **Step 1: Write the failing test**

Create `test/unit/validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidPlacement, GRID_SIZE } from '../../src/validator';

describe('isValidPlacement', () => {
  it('GRID_SIZE is 8', () => {
    expect(GRID_SIZE).toBe(8);
  });

  it('accepts piece 0 at slot [0, 0]', () => {
    expect(isValidPlacement(0, [0, 0])).toBe(true);
  });

  it('accepts piece 42 at slot [5, 2] (5*8+2=42)', () => {
    expect(isValidPlacement(42, [5, 2])).toBe(true);
  });

  it('accepts piece 63 at slot [7, 7] (last piece)', () => {
    expect(isValidPlacement(63, [7, 7])).toBe(true);
  });

  it('rejects piece 42 at wrong slot [3, 7]', () => {
    expect(isValidPlacement(42, [3, 7])).toBe(false);
  });

  it('rejects piece -1 (out of range)', () => {
    expect(isValidPlacement(-1, [0, 0])).toBe(false);
  });

  it('rejects piece 64 (out of range)', () => {
    expect(isValidPlacement(64, [0, 0])).toBe(false);
  });

  it('rejects slot with row out of range', () => {
    expect(isValidPlacement(0, [8, 0])).toBe(false);
    expect(isValidPlacement(0, [-1, 0])).toBe(false);
  });

  it('rejects slot with col out of range', () => {
    expect(isValidPlacement(0, [0, 8])).toBe(false);
    expect(isValidPlacement(0, [0, -1])).toBe(false);
  });

  it('all 64 pieces validate at their canonical slot', () => {
    for (let p = 0; p < 64; p++) {
      const r = Math.floor(p / 8);
      const c = p % 8;
      expect(isValidPlacement(p, [r, c])).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- validator
```

Expected: FAIL, "Cannot find module '../../src/validator'".

- [ ] **Step 3: Write `src/validator.ts`**

```ts
export const GRID_SIZE = 8;
export const PIECE_COUNT = GRID_SIZE * GRID_SIZE;

export function isValidPlacement(piece: number, slot: readonly [number, number]): boolean {
  if (!Number.isInteger(piece) || piece < 0 || piece >= PIECE_COUNT) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= GRID_SIZE) return false;
  if (!Number.isInteger(col) || col < 0 || col >= GRID_SIZE) return false;
  return row * GRID_SIZE + col === piece;
}
```

Add a `PIECE_COUNT` test alongside the `GRID_SIZE` test (11 tests total). YAGNI on `pieceToSlot`/`slotToPiece` helpers since downstream tasks inline `[Math.floor(piece / 8), piece % 8]`.

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- validator
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/validator.ts test/unit/validator.test.ts
git commit -m "Validator: piece N belongs at slot [N//8, N%8]"
```

---

## Task 3: Shapes (TDD)

**Files:**
- Create: `git-jigsaw/src/shapes.ts`
- Create: `git-jigsaw/test/unit/shapes.test.ts`

`tabPattern(seed, row, col, edge)` returns `-1` (blank, cuts inward), `0` (flat, outer edge of puzzle), or `1` (tab, protrudes outward). The critical property: shared edges between two pieces must agree with opposite signs (Alice's east is Bob's west, with opposite sign), so the function hashes a canonical pair of coordinates that both sides compute identically.

- [ ] **Step 1: Write the failing test**

Create `test/unit/shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { tabPattern, type Edge } from '../../src/shapes';
import { GRID_SIZE } from '../../src/validator';

const SEED = 'fixedseed12345678';

describe('tabPattern', () => {
  it('outer north edge of top row is flat', () => {
    expect(tabPattern(SEED, 0, 3, 'N')).toBe(0);
  });

  it('outer south edge of bottom row is flat', () => {
    expect(tabPattern(SEED, GRID_SIZE - 1, 3, 'S')).toBe(0);
  });

  it('outer west edge of left column is flat', () => {
    expect(tabPattern(SEED, 3, 0, 'W')).toBe(0);
  });

  it('outer east edge of right column is flat', () => {
    expect(tabPattern(SEED, 3, GRID_SIZE - 1, 'E')).toBe(0);
  });

  it('east edge of (r, c) opposite-signs west edge of (r, c+1)', () => {
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 1; c++) {
        const east = tabPattern(SEED, r, c, 'E');
        const west = tabPattern(SEED, r, c + 1, 'W');
        expect(east + west).toBe(0);
        expect(east).not.toBe(0);
      }
    }
  });

  it('south edge of (r, c) opposite-signs north edge of (r+1, c)', () => {
    for (let r = 0; r < GRID_SIZE - 1; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const south = tabPattern(SEED, r, c, 'S');
        const north = tabPattern(SEED, r + 1, c, 'N');
        expect(south + north).toBe(0);
        expect(south).not.toBe(0);
      }
    }
  });

  it('is deterministic for the same inputs', () => {
    const a = tabPattern(SEED, 3, 4, 'E');
    const b = tabPattern(SEED, 3, 4, 'E');
    expect(a).toBe(b);
  });

  it('produces a roughly even mix of tabs and blanks across all interior edges', () => {
    let tabs = 0;
    let blanks = 0;
    const edges: Edge[] = ['N', 'E', 'S', 'W'];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        for (const e of edges) {
          const v = tabPattern(SEED, r, c, e);
          if (v === 1) tabs++;
          if (v === -1) blanks++;
        }
      }
    }
    expect(tabs).toBeGreaterThan(40);
    expect(blanks).toBeGreaterThan(40);
    expect(Math.abs(tabs - blanks)).toBeLessThan(50);
  });

  it('different seeds produce different patterns at many internal edges', () => {
    const seedA = 'seedA1234567890a';
    const seedB = 'seedB1234567890b';
    let differences = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (tabPattern(seedA, r, c, 'E') !== tabPattern(seedB, r, c, 'E')) differences++;
        if (tabPattern(seedA, r, c, 'S') !== tabPattern(seedB, r, c, 'S')) differences++;
      }
    }
    expect(differences).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- shapes
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/shapes.ts`**

```ts
import { GRID_SIZE } from './validator';

export type Edge = 'N' | 'E' | 'S' | 'W';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tabPattern(seed: string, row: number, col: number, edge: Edge): -1 | 0 | 1 {
  if (edge === 'N' && row === 0) return 0;
  if (edge === 'S' && row === GRID_SIZE - 1) return 0;
  if (edge === 'W' && col === 0) return 0;
  if (edge === 'E' && col === GRID_SIZE - 1) return 0;

  let r1 = row, c1 = col, r2 = row, c2 = col, axis: 'H' | 'V';
  if (edge === 'E') { c2 = col + 1; axis = 'H'; }
  else if (edge === 'W') { c1 = col - 1; axis = 'H'; }
  else if (edge === 'S') { r2 = row + 1; axis = 'V'; }
  else { r1 = row - 1; axis = 'V'; }

  const key = `${seed}|${axis}|${r1},${c1}|${r2},${c2}`;
  const bit = (fnv1a(key) >>> 31) & 1;
  const sign: -1 | 1 = bit === 0 ? -1 : 1;

  const isCanonical = (edge === 'E' || edge === 'S');
  return isCanonical ? sign : (-sign as -1 | 1);
}

export interface PieceShape {
  N: -1 | 0 | 1;
  E: -1 | 0 | 1;
  S: -1 | 0 | 1;
  W: -1 | 0 | 1;
}

export function pieceShape(seed: string, row: number, col: number): PieceShape {
  return {
    N: tabPattern(seed, row, col, 'N'),
    E: tabPattern(seed, row, col, 'E'),
    S: tabPattern(seed, row, col, 'S'),
    W: tabPattern(seed, row, col, 'W'),
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- shapes
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shapes.ts test/unit/shapes.test.ts
git commit -m "Shapes: deterministic tab/blank pattern with edge agreement"
```

---

## Task 4: Puzzle state (TDD)

**Files:**
- Create: `git-jigsaw/src/puzzle.ts`
- Create: `git-jigsaw/test/unit/puzzle.test.ts`

`PuzzleState` is the in-memory model. It accepts events from the commit log, applies valid `place` events, ignores invalid or unknown ops, and tracks unique contributors. It is event-source-shaped, so adding new ops later is one switch case.

- [ ] **Step 1: Write the failing test**

Create `test/unit/puzzle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const baseEvent = (overrides: Partial<PlaceEvent>): PlaceEvent => ({
  op: 'place',
  piece: 0,
  slot: [0, 0],
  actor: 'alice',
  ts: '2026-04-27T12:00:00Z',
  v: 1,
  sha: 'sha-' + Math.random().toString(36).slice(2, 8),
  ...overrides,
});

describe('PuzzleState', () => {
  it('starts empty', () => {
    const s = new PuzzleState();
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
  });

  it('applies valid place event', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'queelius' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('queelius')).toBe(true);
  });

  it('ignores invalid place event (wrong slot for piece)', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [3, 7] }));
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
  });

  it('ignores unknown ops', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'comment', actor: 'alice', ts: '2026-04-27T12:00:00Z', v: 1, sha: 'x' } as any);
    expect(s.placements.size).toBe(0);
  });

  it('first placement of a piece wins; later overwrites are ignored', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'mallory', sha: 'b' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('alice')).toBe(true);
    expect(s.contributors.has('mallory')).toBe(false);
  });

  it('counts unique contributors only once', () => {
    const s = new PuzzleState();
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 1, slot: [0, 1], actor: 'alice', sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 2, slot: [0, 2], actor: 'bob', sha: 'c' }));
    expect(s.contributors.size).toBe(2);
  });

  it('placedCount tracks number of placed pieces', () => {
    const s = new PuzzleState();
    expect(s.placedCount).toBe(0);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'b' }));
    expect(s.placedCount).toBe(2);
  });

  it('isPlaced(piece) reports placement state', () => {
    const s = new PuzzleState();
    expect(s.isPlaced(42)).toBe(false);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], sha: 'a' }));
    expect(s.isPlaced(42)).toBe(true);
  });

  it('emits change event on valid placement', () => {
    const s = new PuzzleState();
    let count = 0;
    s.on('change', () => count++);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 99, slot: [0, 0], sha: 'b' })); // invalid; no change
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- puzzle
```

Expected: FAIL, module not found.

- [ ] **Step 3: Write `src/puzzle.ts`**

```ts
import { isValidPlacement } from './validator';

export interface PlaceEvent {
  op: 'place';
  piece: number;
  slot: readonly [number, number];
  actor: string;
  ts: string;
  v: number;
  sha: string;
}

export interface UnknownEvent {
  op: string;
  actor: string;
  ts: string;
  v: number;
  sha: string;
  [k: string]: unknown;
}

export type Event = PlaceEvent | UnknownEvent;

type ChangeListener = () => void;

export class PuzzleState {
  readonly placements = new Map<number, readonly [number, number]>();
  readonly contributors = new Set<string>();
  private listeners = new Set<ChangeListener>();

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  applyEvent(event: Event): void {
    if (event.op !== 'place') return;
    const place = event as PlaceEvent;
    if (!isValidPlacement(place.piece, place.slot)) return;
    if (this.placements.has(place.piece)) return;
    this.placements.set(place.piece, place.slot);
    this.contributors.add(place.actor);
    this.emit();
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- puzzle
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/puzzle.ts test/unit/puzzle.test.ts
git commit -m "PuzzleState: event log + change emitter, ignores invalid"
```

---

## Task 5: Renderer

**Files:**
- Create: `git-jigsaw/src/renderer.ts`
- Create: `git-jigsaw/test/unit/renderer.test.ts`

The renderer paints `PuzzleState` onto a `<canvas>`. For each placed piece, it computes a clip path from the piece's tab pattern and `drawImage`s the corresponding source-image region. Empty slots show a faint grid line. The canvas is fixed at 1024×1024 internally and CSS-scaled to viewport.

- [ ] **Step 1: Write the failing test**

Create `test/unit/renderer.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { piecePath, paintBoard, BOARD_SIZE, TILE_SIZE } from '../../src/renderer';
import { PuzzleState } from '../../src/puzzle';

describe('piecePath', () => {
  it('returns a Path2D for a valid piece', () => {
    const p = piecePath('seedabc1234567890', 0, 0);
    expect(p).toBeInstanceOf(Path2D);
  });

  it('BOARD_SIZE is 1024 and TILE_SIZE is 128', () => {
    expect(BOARD_SIZE).toBe(1024);
    expect(TILE_SIZE).toBe(128);
  });
});

describe('paintBoard', () => {
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let drawImageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    drawImageSpy = vi.fn();
    (ctx as any).drawImage = drawImageSpy;
  });

  it('paints a placed piece', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'alice', ts: 't', v: 1, sha: 'a' });
    const source = document.createElement('canvas');
    paintBoard(ctx, s, source, 'seedabc1234567890');
    expect(drawImageSpy).toHaveBeenCalled();
  });

  it('does not paint unplaced pieces', () => {
    const s = new PuzzleState();
    const source = document.createElement('canvas');
    paintBoard(ctx, s, source, 'seedabc1234567890');
    expect(drawImageSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- renderer
```

Expected: FAIL.

- [ ] **Step 3: Write `src/renderer.ts`**

```ts
import { GRID_SIZE } from './validator';
import { pieceShape, type PieceShape } from './shapes';
import type { PuzzleState } from './puzzle';

export const BOARD_SIZE = 1024;
export const TILE_SIZE = BOARD_SIZE / GRID_SIZE;
const TAB_DEPTH = TILE_SIZE * 0.22;
const TAB_WIDTH = TILE_SIZE * 0.34;

function edgePath(p: Path2D, x0: number, y0: number, x1: number, y1: number, sign: -1 | 0 | 1): void {
  if (sign === 0) {
    p.lineTo(x1, y1);
    return;
  }
  const dx = x1 - x0;
  const dy = y1 - y0;
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(dx, dy);
  const ux = nx / len;
  const uy = ny / len;
  const tx = dx / len;
  const ty = dy / len;
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const tabStartX = midX - tx * TAB_WIDTH / 2;
  const tabStartY = midY - ty * TAB_WIDTH / 2;
  const tabEndX = midX + tx * TAB_WIDTH / 2;
  const tabEndY = midY + ty * TAB_WIDTH / 2;
  const peakX = midX + ux * TAB_DEPTH * sign;
  const peakY = midY + uy * TAB_DEPTH * sign;
  p.lineTo(tabStartX, tabStartY);
  p.bezierCurveTo(
    tabStartX + ux * TAB_DEPTH * sign,
    tabStartY + uy * TAB_DEPTH * sign,
    peakX - tx * TAB_WIDTH * 0.4,
    peakY - ty * TAB_WIDTH * 0.4,
    peakX,
    peakY,
  );
  p.bezierCurveTo(
    peakX + tx * TAB_WIDTH * 0.4,
    peakY + ty * TAB_WIDTH * 0.4,
    tabEndX + ux * TAB_DEPTH * sign,
    tabEndY + uy * TAB_DEPTH * sign,
    tabEndX,
    tabEndY,
  );
  p.lineTo(x1, y1);
}

export function piecePath(seed: string, row: number, col: number): Path2D {
  const shape: PieceShape = pieceShape(seed, row, col);
  const x = col * TILE_SIZE;
  const y = row * TILE_SIZE;
  const p = new Path2D();
  p.moveTo(x, y);
  edgePath(p, x, y, x + TILE_SIZE, y, shape.N);
  edgePath(p, x + TILE_SIZE, y, x + TILE_SIZE, y + TILE_SIZE, shape.E);
  edgePath(p, x + TILE_SIZE, y + TILE_SIZE, x, y + TILE_SIZE, shape.S);
  edgePath(p, x, y + TILE_SIZE, x, y, shape.W);
  p.closePath();
  return p;
}

export function paintBoard(
  ctx: CanvasRenderingContext2D,
  state: PuzzleState,
  source: CanvasImageSource,
  seed: string,
): void {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }
  for (const [piece] of state.placements) {
    const r = Math.floor(piece / GRID_SIZE);
    const c = piece % GRID_SIZE;
    const path = piecePath(seed, r, c);
    ctx.save();
    ctx.clip(path);
    ctx.drawImage(source, 0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.restore();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- renderer
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts test/unit/renderer.test.ts
git commit -m "Renderer: piecePath + paintBoard with clip-and-drawImage"
```

---

## Task 6: Tray (TDD)

**Files:**
- Create: `git-jigsaw/src/tray.ts`
- Create: `git-jigsaw/test/unit/tray.test.ts`

The tray exposes the unplaced pieces as a deterministically shuffled list, seeded by the user's actor name so each person sees a stable order across sessions but different orders across users.

- [ ] **Step 1: Write the failing test**

Create `test/unit/tray.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';

describe('Tray', () => {
  it('lists all 64 pieces when state is empty', () => {
    const s = new PuzzleState();
    const t = new Tray(s, 'queelius');
    expect(t.unplaced().length).toBe(64);
  });

  it('omits placed pieces', () => {
    const s = new PuzzleState();
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    const t = new Tray(s, 'queelius');
    expect(t.unplaced().length).toBe(63);
    expect(t.unplaced().includes(0)).toBe(false);
  });

  it('order is deterministic for the same actor name', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const b = new Tray(s, 'queelius').unplaced();
    expect(a).toEqual(b);
  });

  it('order differs across actor names', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'alice').unplaced();
    const b = new Tray(s, 'bob').unplaced();
    expect(a).not.toEqual(b);
  });

  it('order is not numerical (does not give the answer away)', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const numerical = Array.from({ length: 64 }, (_, i) => i);
    expect(a).not.toEqual(numerical);
  });

  it('contains every piece exactly once', () => {
    const s = new PuzzleState();
    const a = new Tray(s, 'queelius').unplaced();
    const set = new Set(a);
    expect(set.size).toBe(64);
    for (let i = 0; i < 64; i++) expect(set.has(i)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- tray
```

Expected: FAIL.

- [ ] **Step 3: Write `src/tray.ts`**

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- tray
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tray.ts test/unit/tray.test.ts
git commit -m "Tray: deterministic per-actor shuffle of unplaced pieces"
```

---

## Task 7: Mock store + integration scaffolding

**Files:**
- Create: `git-jigsaw/test/integration/mock-store.ts`
- Create: `git-jigsaw/test/integration/scaffold.test.ts`

The mock store mimics `git-native`'s `Store` interface for integration tests. Real `git-native` stays out of integration tests so they run without network.

- [ ] **Step 1: Write `test/integration/mock-store.ts`**

```ts
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
  public commitCalls: Array<{ op: string; payload: any; files?: Record<string, string> }> = [];
  private subscribers = new Set<(events: AnyEvent[]) => void>();
  private rejectNext?: Error;

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
```

- [ ] **Step 2: Write `test/integration/scaffold.test.ts`**

```ts
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
});
```

- [ ] **Step 3: Run tests, verify pass**

```bash
npm test -- scaffold
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add test/integration/mock-store.ts test/integration/scaffold.test.ts
git commit -m "Integration scaffold: MockStore mimicking git-native Store"
```

---

## Task 8: Auth bar + counter (integration test)

**Files:**
- Create: `git-jigsaw/src/auth-bar.ts`
- Create: `git-jigsaw/test/integration/auth-bar.test.ts`

The auth bar is the page header: title, contributors counter, sign-in button. It listens to `PuzzleState` for counter updates and to the store for actor changes.

- [ ] **Step 1: Write the failing test**

Create `test/integration/auth-bar.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountAuthBar } from '../../src/auth-bar';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

describe('auth-bar', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('renders the week label', () => {
    const state = new PuzzleState();
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17' });
    expect(host.textContent).toContain('2026-W17');
  });

  it('shows placed-count, total, and contributors-count', () => {
    const state = new PuzzleState();
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    state.applyEvent({ op: 'place', piece: 1, slot: [0, 1], actor: 'b', ts: 't', v: 1, sha: 'y' });
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17' });
    expect(host.textContent).toMatch(/2 of 64/);
    expect(host.textContent).toMatch(/2 contributors/);
  });

  it('updates when state changes', () => {
    const state = new PuzzleState();
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17' });
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(host.textContent).toMatch(/1 of 64/);
  });

  it('shows Sign in when unauthenticated', () => {
    const store = new MockStore();
    mountAuthBar(host, { state: new PuzzleState(), store, week: '2026-W17' });
    const btn = host.querySelector('button.sign-in') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Sign in');
  });

  it('shows actor name when authenticated', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    mountAuthBar(host, { state: new PuzzleState(), store, week: '2026-W17' });
    expect(host.textContent).toContain('queelius');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- auth-bar
```

Expected: FAIL.

- [ ] **Step 3: Write `src/auth-bar.ts`**

```ts
import type { PuzzleState } from './puzzle';
import { PIECE_COUNT } from './validator';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signIn(): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export function mountAuthBar(host: HTMLElement, { state, store, week }: MountOpts): () => void {
  host.classList.add('jigsaw-auth-bar');
  const label = document.createElement('span');
  label.className = 'week';
  const counts = document.createElement('span');
  counts.className = 'counts';
  const actorEl = document.createElement('span');
  actorEl.className = 'actor';
  const btn = document.createElement('button');
  btn.className = 'sign-in';

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${PIECE_COUNT} pieces placed; ${state.contributors.size} contributors`;
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
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    try { await store.signIn(); } finally { render(); }
  });

  host.replaceChildren(label, counts, actorEl, btn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- auth-bar
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/auth-bar.ts test/integration/auth-bar.test.ts
git commit -m "Auth bar: title, counter, sign-in button bound to state"
```

---

## Task 9: Read flow (integration test)

**Files:**
- Create: `git-jigsaw/src/read-flow.ts`
- Create: `git-jigsaw/test/integration/read-flow.test.ts`

The read flow loads the source image, fetches existing events, applies them to `PuzzleState`. The test injects a `MockStore` and a fake source image (a tiny canvas) so it runs without network.

- [ ] **Step 1: Write the failing test**

Create `test/integration/read-flow.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { loadInitialState } from '../../src/read-flow';
import { MockStore } from './mock-store';

describe('loadInitialState', () => {
  it('applies all valid place events from the store', async () => {
    const store = new MockStore({
      initialEvents: [
        { op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: '1' },
        { op: 'place', piece: 9, slot: [1, 1], actor: 'b', ts: 't', v: 1, sha: '2' },
        { op: 'place', piece: 9, slot: [3, 0], actor: 'c', ts: 't', v: 1, sha: '3' }, // invalid
      ],
    });
    const state = await loadInitialState(store, '2026-W17');
    expect(state.placedCount).toBe(2);
    expect(state.contributors.size).toBe(2);
  });

  it('returns empty state when store has no events', async () => {
    const store = new MockStore();
    const state = await loadInitialState(store, '2026-W17');
    expect(state.placedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- read-flow
```

Expected: FAIL.

- [ ] **Step 3: Write `src/read-flow.ts`**

```ts
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npm test -- read-flow
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/read-flow.ts test/integration/read-flow.test.ts
git commit -m "Read flow: load events, build state; load assets from data repo"
```

---

## Task 10: Write flow (drag-drop + commit)

**Files:**
- Create: `git-jigsaw/src/input.ts`
- Create: `git-jigsaw/src/toast.ts`
- Create: `git-jigsaw/test/integration/write-flow.test.ts`

The input handler accepts a piece selection, validates locally, calls the store's commit, handles `ConflictError` gracefully via toast, and rolls back optimistic state if necessary. Drag-and-drop is exposed via `attemptPlace(piece, slot)` so tests can drive it without simulating real pointer events.

- [ ] **Step 1: Write the failing test**

Create `test/integration/write-flow.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

describe('attemptPlace', () => {
  it('valid placement: calls commit, applies event locally', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState();
    const result = await attemptPlace({ piece: 42, slot: [5, 2], state, store, week: '2026-W17' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls).toHaveLength(1);
    expect(store.commitCalls[0].op).toBe('place');
    expect(store.commitCalls[0].payload.piece).toBe(42);
    expect(store.commitCalls[0].files).toEqual({
      'jigsaw/2026-W17/placements/042.json': JSON.stringify({ slot: [5, 2] }),
    });
    expect(state.isPlaced(42)).toBe(true);
  });

  it('invalid placement: does not commit, returns invalid', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState();
    const result = await attemptPlace({ piece: 42, slot: [3, 7], state, store, week: '2026-W17' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
    expect(state.isPlaced(42)).toBe(false);
  });

  it('conflict: returns conflict, piece is removed from tray (state still has the placement from remote)', async () => {
    const conflictErr = new Error('conflict');
    (conflictErr as any).name = 'ConflictError';
    const store = new MockStore({ initialActor: 'queelius', rejectNextWith: conflictErr });
    const state = new PuzzleState();
    const result = await attemptPlace({ piece: 42, slot: [5, 2], state, store, week: '2026-W17' });
    expect(result.kind).toBe('conflict');
    expect(state.isPlaced(42)).toBe(false);
  });

  it('unauthenticated: returns auth-required without commit', async () => {
    const store = new MockStore();
    const state = new PuzzleState();
    const result = await attemptPlace({ piece: 0, slot: [0, 0], state, store, week: '2026-W17' });
    expect(result.kind).toBe('auth-required');
    expect(store.commitCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- write-flow
```

Expected: FAIL.

- [ ] **Step 3: Write `src/toast.ts`**

```ts
export function showToast(message: string, durationMs = 4000): void {
  let host = document.querySelector('.jigsaw-toast-host') as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.className = 'jigsaw-toast-host';
    document.body.appendChild(host);
  }
  const t = document.createElement('div');
  t.className = 'jigsaw-toast';
  t.textContent = message;
  host.appendChild(t);
  setTimeout(() => t.remove(), durationMs);
}
```

- [ ] **Step 4: Write `src/input.ts`**

```ts
import { isValidPlacement } from './validator';
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  commit(op: string, payload: any, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export type AttemptResult =
  | { kind: 'placed'; sha: string }
  | { kind: 'invalid' }
  | { kind: 'conflict' }
  | { kind: 'auth-required' };

export async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, state, store, week } = args;
  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }
  if (!isValidPlacement(piece, slot)) {
    showToast('Wrong slot.');
    return { kind: 'invalid' };
  }
  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]] }) };
  try {
    const { sha } = await store.commit('place', { piece, slot }, { files });
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Someone else placed piece ${piece} just now.`);
      return { kind: 'conflict' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm test -- write-flow
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/input.ts src/toast.ts test/integration/write-flow.test.ts
git commit -m "Write flow: attemptPlace with validate, commit, conflict toast"
```

---

## Task 11: Subscription (live updates)

**Files:**
- Create: `git-jigsaw/test/integration/subscription.test.ts`

`git-native`'s `subscribe` returns a callback-driven API; PuzzleState's `applyEvent` is idempotent for already-seen events (placement-already-set ignores). The integration is wiring; test that remote events flow through.

- [ ] **Step 1: Write the failing test**

Create `test/integration/subscription.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';
import { MockStore } from './mock-store';

function wireSubscription(store: MockStore, state: PuzzleState): () => void {
  const sub = store.subscribe((events) => {
    for (const e of events) state.applyEvent(e);
  });
  return () => sub.unsubscribe();
}

describe('subscription wiring', () => {
  it('remote event applied to state', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    const remote: PlaceEvent = {
      op: 'place', piece: 5, slot: [0, 5], actor: 'remote', ts: 't', v: 1, sha: 'rx',
    };
    store.pushRemoteEvent(remote);
    expect(state.isPlaced(5)).toBe(true);
    expect(state.contributors.has('remote')).toBe(true);
  });

  it('multiple remote events applied in order', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: '1' });
    store.pushRemoteEvent({ op: 'place', piece: 1, slot: [0, 1], actor: 'b', ts: 't', v: 1, sha: '2' });
    expect(state.placedCount).toBe(2);
  });

  it('invalid remote events are ignored', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    wireSubscription(store, state);
    store.pushRemoteEvent({ op: 'place', piece: 5, slot: [3, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });

  it('unsubscribe stops further updates', () => {
    const store = new MockStore();
    const state = new PuzzleState();
    const off = wireSubscription(store, state);
    off();
    store.pushRemoteEvent({ op: 'place', piece: 0, slot: [0, 0], actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(state.placedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it passes**

```bash
npm test -- subscription
```

Expected: 4 passed (no production code change needed; this verifies existing behavior).

- [ ] **Step 3: Commit**

```bash
git add test/integration/subscription.test.ts
git commit -m "Subscription: integration test for remote event flow"
```

---

## Task 12: Cross-client compatibility test

**Files:**
- Create: `git-jigsaw/test/fixtures/py-commit-body.yaml`
- Create: `git-jigsaw/src/parse-event.ts`
- Create: `git-jigsaw/test/unit/parse-event.test.ts`

A commit body produced by `git-native-py` must parse identically here. We commit a pinned fixture string and exercise the parser against it.

- [ ] **Step 1: Write the fixture**

Create `test/fixtures/py-commit-body.yaml`:

```yaml
op: place
piece: 42
slot: [5, 2]
actor: queelius
ts: 2026-04-27T14:23:11Z
v: 1
```

- [ ] **Step 2: Write the failing test**

Create `test/unit/parse-event.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCommitBody } from '../../src/parse-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('parseCommitBody', () => {
  it('parses a git-native-py-shaped place commit body', () => {
    const yaml = readFileSync(join(__dirname, '../fixtures/py-commit-body.yaml'), 'utf8');
    const event = parseCommitBody(yaml, 'sha-from-git');
    expect(event).toMatchObject({
      op: 'place',
      piece: 42,
      slot: [5, 2],
      actor: 'queelius',
      ts: '2026-04-27T14:23:11Z',
      v: 1,
      sha: 'sha-from-git',
    });
  });

  it('rejects unknown major version', () => {
    expect(() => parseCommitBody('op: place\nv: 2\n', 'x')).toThrow(/version/);
  });

  it('returns minor-version-tolerant for v: 1.5', () => {
    const yaml = 'op: place\npiece: 0\nslot: [0, 0]\nactor: a\nts: t\nv: 1\nextra: stuff\n';
    const e = parseCommitBody(yaml, 'x');
    expect(e.op).toBe('place');
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
npm test -- parse-event
```

Expected: FAIL.

- [ ] **Step 4: Write `src/parse-event.ts`**

```ts
import { load } from 'js-yaml';
import type { Event } from './puzzle';

export function parseCommitBody(yamlText: string, sha: string): Event {
  const parsed = load(yamlText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Commit body is not a YAML object');
  }
  const v = parsed['v'];
  if (typeof v !== 'number' || Math.floor(v) !== 1) {
    throw new Error(`Unsupported event version: ${v}`);
  }
  const op = parsed['op'];
  const actor = parsed['actor'];
  const ts = parsed['ts'];
  if (typeof op !== 'string' || typeof actor !== 'string') {
    throw new Error('Event missing op or actor');
  }
  return {
    ...parsed,
    op,
    actor,
    ts: typeof ts === 'string' ? ts : (ts instanceof Date ? ts.toISOString() : String(ts)),
    v: 1,
    sha,
  } as Event;
}
```

- [ ] **Step 5: Run test, verify it passes**

```bash
npm test -- parse-event
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/parse-event.ts test/unit/parse-event.test.ts test/fixtures/py-commit-body.yaml
git commit -m "Cross-client: parse git-native-py-shaped commit bodies"
```

---

## Task 13: Bootstrap metafunctor-data + Python tools

**Files:**
- Create: `metafunctor-data/README.md`
- Create: `metafunctor-data/.gitignore`
- Create: `metafunctor-data/jigsaw/README.md`
- Create: `metafunctor-data/tools/pyproject.toml`
- Create: `metafunctor-data/tools/src/jigsaw_tools/__init__.py`
- Create: `metafunctor-data/tools/src/jigsaw_tools/prompts.py`
- Create: `metafunctor-data/tools/src/jigsaw_tools/generate_puzzle.py`
- Create: `metafunctor-data/tools/tests/test_generate_puzzle.py`

- [ ] **Step 1: Init repo locally**

```bash
mkdir -p /home/spinoza/github/repos/metafunctor-data
cd /home/spinoza/github/repos/metafunctor-data
git init -b main
git config user.email "queelius@gmail.com"
git config user.name "queelius"
mkdir -p jigsaw tools/src/jigsaw_tools tools/tests .github/workflows
```

- [ ] **Step 2: Write `metafunctor-data/README.md`**

```markdown
# metafunctor-data

Public data substrate for participation features on metafunctor.com.

Apps live as path-namespaced subdirectories. Currently:

- `jigsaw/`: weekly AI-generated jigsaw puzzles. New `YYYY-Www/` directory each Monday via the GitHub Actions cron in `.github/workflows/jigsaw-weekly.yml`. Browser at https://metafunctor.com/arcade/jigsaw places pieces by committing here via the [git-native](https://github.com/queelius/git-native) library.

The commit log is the record. Anyone can clone this repo at any time.
```

- [ ] **Step 3: Write `metafunctor-data/.gitignore`**

```
__pycache__/
*.py[cod]
.pytest_cache/
.venv/
*.egg-info/
.env
```

- [ ] **Step 4: Write `metafunctor-data/jigsaw/README.md`**

```markdown
# jigsaw

Per-week subdirectory layout: `YYYY-Www/{source.png, meta.yaml, placements/}`. The `meta.yaml` records `generated_at`, `model`, `prompt`, and a `seed` (sha256 prefix of `source.png`) used to derive piece geometry deterministically in the browser.

Each placement is a commit creating `placements/NNN.json` (zero-padded piece id) with body `{"slot": [row, col]}`. The commit message body carries the canonical YAML event payload.
```

- [ ] **Step 5: Write `metafunctor-data/tools/pyproject.toml`**

```toml
[project]
name = "jigsaw-tools"
version = "0.1.0"
description = "Cron tooling for the metafunctor jigsaw"
authors = [{name = "Alexander Towell", email = "lex@metafunctor.com"}]
license = "MIT"
requires-python = ">=3.12"
dependencies = [
  "openai>=1.50.0",
  "pyyaml>=6.0",
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-mock>=3.10"]

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

- [ ] **Step 6: Write `metafunctor-data/tools/src/jigsaw_tools/__init__.py`**

```python
"""Cron tooling for the metafunctor jigsaw."""
```

- [ ] **Step 7: Write `metafunctor-data/tools/src/jigsaw_tools/prompts.py`**

```python
"""Rotating prompt list for weekly puzzle generation.

Add new prompts at the end. The cron picks deterministically based on week_id
so the same week id always produces the same prompt. Edit prompts via PR;
no admin UI in V1.
"""

PROMPTS: list[str] = [
    "An impressionist landscape at dawn over a quiet meadow, oil-painting style, soft lightfall through low fog, no text",
    "A cyberpunk alleyway with neon kanji signs, raining, reflective puddles, no people, no text",
    "An art-nouveau botanical illustration of a fictional flower with vines and gold accents, no text",
    "A retro 1970s travel poster of an imagined coastal city, flat colors, geometric shapes, no text",
    "A storybook watercolor of a small wooden house on a hill at twilight, fireflies, no text",
    "A minimalist Japanese garden scene with raked sand, three stones, a small bridge, ink-wash style, no text",
    "A hard-edged modernist abstract painting in saturated reds, blues, and ochres, no text",
    "An underwater coral reef with bioluminescent fish and a single shipwreck silhouette, no text",
    "A dense pine forest in winter at golden hour, painterly, low angle, no text",
    "A high-altitude photograph of farmland geometry, square fields in patchwork, no text",
]


def pick_prompt(week_id: str) -> str:
    """Deterministic per-week-id selection from PROMPTS."""
    digits = "".join(ch for ch in week_id if ch.isdigit())
    idx = int(digits) % len(PROMPTS) if digits else 0
    return PROMPTS[idx]
```

- [ ] **Step 8: Write `metafunctor-data/tools/src/jigsaw_tools/generate_puzzle.py`**

```python
"""Generate the current ISO week's jigsaw image and commit it.

Run from the metafunctor-data repo root. Idempotent: if this week's source.png
already exists, exits 0 without doing anything (manual workflow_dispatch is
the recovery path for a bad image; delete source.png first).
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import os
import subprocess
import sys
from pathlib import Path

import yaml
from openai import OpenAI

from .prompts import pick_prompt


def current_week_id(today: datetime.date | None = None) -> str:
    today = today or datetime.date.today()
    year, week, _ = today.isocalendar()
    return f"{year}-W{week:02d}"


def generate_image(prompt: str, model: str, base_url: str | None) -> bytes:
    client = OpenAI(base_url=base_url) if base_url else OpenAI()
    response = client.images.generate(model=model, prompt=prompt, size="1024x1024", n=1)
    if not response.data or not response.data[0].b64_json:
        raise RuntimeError("Image API returned no b64_json")
    return base64.b64decode(response.data[0].b64_json)


def write_puzzle(repo_root: Path, week_id: str, image_bytes: bytes, prompt: str, model: str) -> Path:
    puzzle_dir = repo_root / "jigsaw" / week_id
    puzzle_dir.mkdir(parents=True, exist_ok=True)
    (puzzle_dir / "source.png").write_bytes(image_bytes)
    seed = hashlib.sha256(image_bytes).hexdigest()[:16]
    (puzzle_dir / "meta.yaml").write_text(yaml.safe_dump({
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "model": model,
        "prompt": prompt,
        "seed": seed,
    }))
    return puzzle_dir


def commit_and_push(repo_root: Path, puzzle_dir: Path, week_id: str, prompt: str) -> None:
    body = yaml.safe_dump({"op": "seed_puzzle", "week": week_id, "prompt": prompt, "v": 1})
    subprocess.run(["git", "add", str(puzzle_dir.relative_to(repo_root))], cwd=repo_root, check=True)
    subprocess.run([
        "git",
        "-c", "user.name=jigsaw-cron",
        "-c", "user.email=cron@metafunctor.com",
        "commit",
        "-m", f"jigsaw: seed {week_id}",
        "-m", body,
    ], cwd=repo_root, check=True)
    subprocess.run(["git", "push"], cwd=repo_root, check=True)


def main() -> int:
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()
    week_id = os.environ.get("WEEK_ID") or current_week_id()
    if (repo_root / "jigsaw" / week_id / "source.png").exists():
        print(f"{week_id} already generated; exiting.")
        return 0
    prompt = pick_prompt(week_id)
    model = os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1")
    base_url = os.environ.get("OPENAI_BASE_URL") or None
    image_bytes = generate_image(prompt, model, base_url)
    puzzle_dir = write_puzzle(repo_root, week_id, image_bytes, prompt, model)
    commit_and_push(repo_root, puzzle_dir, week_id, prompt)
    print(f"Generated and committed {week_id}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 9: Write `metafunctor-data/tools/tests/test_generate_puzzle.py`**

```python
import datetime
import hashlib
import subprocess
from pathlib import Path

import pytest
import yaml

from jigsaw_tools.generate_puzzle import (
    current_week_id,
    write_puzzle,
    commit_and_push,
)
from jigsaw_tools.prompts import PROMPTS, pick_prompt


def test_current_week_id_format():
    wid = current_week_id(datetime.date(2026, 4, 27))
    assert wid == "2026-W18"


def test_pick_prompt_deterministic_per_week_id():
    a = pick_prompt("2026-W17")
    b = pick_prompt("2026-W17")
    assert a == b
    assert a in PROMPTS


def test_pick_prompt_varies_across_weeks():
    weeks = [pick_prompt(f"2026-W{i:02d}") for i in range(1, 11)]
    assert len(set(weeks)) > 1


def test_write_puzzle_creates_dir_and_files(tmp_path: Path):
    image_bytes = b"\x89PNG\r\n\x1a\n" + b"fakepngdata" * 100
    puzzle_dir = write_puzzle(tmp_path, "2026-W17", image_bytes, "a prompt", "gpt-image-1")
    assert (puzzle_dir / "source.png").read_bytes() == image_bytes
    meta = yaml.safe_load((puzzle_dir / "meta.yaml").read_text())
    assert meta["model"] == "gpt-image-1"
    assert meta["prompt"] == "a prompt"
    assert meta["seed"] == hashlib.sha256(image_bytes).hexdigest()[:16]


def test_commit_and_push_invokes_git(tmp_path: Path, monkeypatch):
    calls: list[list[str]] = []
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        class R: returncode = 0
        return R()
    monkeypatch.setattr(subprocess, "run", fake_run)
    puzzle_dir = tmp_path / "jigsaw" / "2026-W17"
    puzzle_dir.mkdir(parents=True)
    commit_and_push(tmp_path, puzzle_dir, "2026-W17", "a prompt")
    cmds = [" ".join(c) for c in calls]
    assert any("git add" in c for c in cmds)
    assert any("git commit" in c for c in cmds[1:])
    assert any("git push" in c for c in cmds[2:])
```

- [ ] **Step 10: Run tests, verify they pass**

```bash
cd /home/spinoza/github/repos/metafunctor-data/tools
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest -v
```

Expected: 5 passed.

- [ ] **Step 11: Commit**

```bash
cd /home/spinoza/github/repos/metafunctor-data
git add -A
git commit -m "Bootstrap metafunctor-data with jigsaw tools and tests"
```

---

## Task 14: GitHub Actions workflow

**Files:**
- Create: `metafunctor-data/.github/workflows/jigsaw-weekly.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Generate weekly jigsaw

on:
  schedule:
    - cron: '0 0 * * 1'                  # Monday 00:00 UTC
  workflow_dispatch:                     # manual trigger for testing/recovery

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
          cache-dependency-path: tools/pyproject.toml
      - name: Install tools
        run: pip install -e tools/
      - name: Generate puzzle
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL }}
          OPENAI_IMAGE_MODEL: ${{ vars.OPENAI_IMAGE_MODEL }}
          REPO_ROOT: ${{ github.workspace }}
        run: python -m jigsaw_tools.generate_puzzle
```

- [ ] **Step 2: Document required configuration in README**

Append to `metafunctor-data/README.md`:

````markdown

## Configuration

Required for the weekly cron in `.github/workflows/jigsaw-weekly.yml`:

| Setting | Type   | Default          | Notes |
|---------|--------|------------------|-------|
| `OPENAI_API_KEY`    | secret | (none, required)  | API key for OpenAI or any OpenAI-compatible endpoint |
| `OPENAI_BASE_URL`   | var    | (unset = api.openai.com) | Override to point at a self-hosted endpoint |
| `OPENAI_IMAGE_MODEL`| var    | `gpt-image-1`     | Model name; must be supported by the endpoint |

Set in repo: Settings, then Secrets and variables, then Actions.
````

- [ ] **Step 3: Commit**

```bash
cd /home/spinoza/github/repos/metafunctor-data
git add .github/workflows/jigsaw-weekly.yml README.md
git commit -m "Cron: weekly jigsaw generation workflow"
```

- [ ] **Step 4: Manual verification deferred to Task 19**

The cron cannot run until the repo is on GitHub with secrets configured. Smoke test happens in Task 19 after `gh repo create`.

---

## Task 15: Hugo content + layouts

**Files:**
- Create: `metafunctor/content/arcade/_index.md`
- Create: `metafunctor/content/arcade/jigsaw.md`
- Create: `metafunctor/layouts/arcade/jigsaw/single.html`
- Create: `metafunctor/layouts/partials/jigsaw-assets.html`

- [ ] **Step 1: Write `metafunctor/content/arcade/_index.md`**

```markdown
---
title: "Arcade"
description: "Participation features on metafunctor"
url: /arcade/
---

A small set of participation features built on the [git-native](https://github.com/queelius/git-native) substrate. Each one persists its state as commits in a public repository.

- [Weekly Jigsaw](/arcade/jigsaw/): a fresh AI-generated picture every Monday; each piece you place is a commit.
```

- [ ] **Step 2: Write `metafunctor/content/arcade/jigsaw.md`**

```markdown
---
title: "Weekly Jigsaw"
date: 2026-04-27
url: /arcade/jigsaw/
layout: arcade-jigsaw
---

A fresh AI-generated picture every Monday. Each piece you place is a git commit. The puzzle's solving history is the [git log](https://github.com/queelius/metafunctor-data/commits/main/jigsaw).

Sign in with GitHub to play. The "type a code at github.com/login/device" flow runs entirely in your browser; no server holds your token.
```

- [ ] **Step 3: Write `metafunctor/layouts/partials/jigsaw-assets.html`**

```html
{{- $manifestPath := "/arcade/jigsaw/.vite/manifest.json" -}}
{{- $manifest := getJSON (printf "%s%s" .Site.Params.staticDir $manifestPath) -}}
{{- $entry := index $manifest "index.html" -}}
{{- if $entry -}}
  <link rel="stylesheet" href="/arcade/jigsaw/{{ index $entry.css 0 }}">
  <script type="module" src="/arcade/jigsaw/{{ $entry.file }}"></script>
{{- else -}}
  <p><strong>jigsaw bundle not deployed.</strong> Run <code>npm run deploy</code> in git-jigsaw.</p>
{{- end -}}
```

If your Hugo doesn't expose `getJSON` in the way your version expects, use `resources.Get` instead. Fallback: hardcode the entry filename and rebuild the partial when Vite hashes change.

- [ ] **Step 4: Write `metafunctor/layouts/arcade/jigsaw/single.html`**

```html
{{ define "main" }}
<article class="jigsaw-page">
  <header>
    <h1>{{ .Title }}</h1>
    {{ .Content }}
  </header>
  <div id="jigsaw-root"></div>
  {{ partial "jigsaw-assets.html" . }}
</article>
{{ end }}
```

- [ ] **Step 5: Verify Hugo builds**

```bash
cd /home/spinoza/github/repos/metafunctor
hugo --gc --minify
```

Expected: Hugo builds without errors. Note: the `jigsaw-assets.html` partial will warn that `staticDir/arcade/jigsaw/.vite/manifest.json` does not exist yet; that is expected until Task 17 deploys the bundle.

- [ ] **Step 6: Commit (in metafunctor)**

```bash
cd /home/spinoza/github/repos/metafunctor
git add content/arcade/ layouts/arcade/ layouts/partials/jigsaw-assets.html
git commit -m "Hugo: arcade hub + jigsaw page + asset partial"
```

---

## Task 16: deploy.sh script

**Files:**
- Create: `git-jigsaw/scripts/deploy.sh`

- [ ] **Step 1: Write `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-../metafunctor/static/arcade/jigsaw}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [[ -z "${GH_OAUTH_CLIENT_ID:-}" ]]; then
  echo "WARNING: GH_OAUTH_CLIENT_ID is not set; the deployed bundle will have an empty client_id"
  echo "         and Device Flow sign-in will not work. Set this env var before running deploy.sh"
  echo "         in production:"
  echo "           export GH_OAUTH_CLIENT_ID=Iv1.your_oauth_app_client_id"
fi

echo "Building..."
npm run build

if [[ ! -d "$TARGET" ]]; then
  echo "ERROR: target directory does not exist: $TARGET"
  echo "       create it (mkdir -p) inside metafunctor first."
  exit 1
fi

echo "Syncing dist/ to $TARGET ..."
rsync -a --delete dist/ "$TARGET/"

cat <<EOF
Deployed to $TARGET

Next steps:
  cd $(realpath "$TARGET")
  git status
  git diff --stat HEAD
  # eyeball the change, then:
  git add -A
  git commit -m "jigsaw: deploy \$(cd $SCRIPT_DIR && git rev-parse --short HEAD)"
  git push
EOF
```

- [ ] **Step 2: Make executable**

```bash
chmod +x /home/spinoza/github/repos/git-jigsaw/scripts/deploy.sh
```

- [ ] **Step 3: Commit**

```bash
cd /home/spinoza/github/repos/git-jigsaw
git add scripts/deploy.sh
git commit -m "Deploy script: build + rsync to metafunctor static target"
```

---

## Task 17: Wire main.ts (assemble the app)

**Files:**
- Create or modify: `git-jigsaw/src/main.ts`
- Modify: `git-jigsaw/src/styles.css`
- Create: `git-jigsaw/src/store-config.ts`

This is the assembly step. main.ts brings together puzzle state, asset loading, store, auth-bar, renderer, tray, input, subscription. No new TDD cycle; the unit and integration tests cover each piece. Manual verification via `npm run dev` is the acceptance check.

The DOM is built with `document.createElement` calls (no `innerHTML`), which keeps the bundle XSS-safe by construction.

- [ ] **Step 1: Write `src/store-config.ts`**

```ts
import { gitNative } from 'git-native';
import { GitHubAdapter } from 'git-native/github';

export function makeStore() {
  if (!__OAUTH_CLIENT_ID__) {
    console.warn('GH_OAUTH_CLIENT_ID is empty; sign-in will fail');
  }
  const adapter = new GitHubAdapter({
    repo: __DATA_REPO__,
    path: __DATA_PATH__,
    clientId: __OAUTH_CLIENT_ID__,
  });
  return gitNative({ adapter, pollInterval: 5000 });
}
```

- [ ] **Step 2: Write `src/main.ts`**

```ts
import { PuzzleState, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore } from './store-config';

function currentWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function buildShell(root: HTMLElement): { headerEl: HTMLElement; canvas: HTMLCanvasElement; trayEl: HTMLElement } {
  const headerEl = document.createElement('header');
  headerEl.className = 'jigsaw-header';
  const canvas = document.createElement('canvas');
  canvas.className = 'jigsaw-board';
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const trayEl = document.createElement('div');
  trayEl.className = 'jigsaw-tray';
  root.replaceChildren(headerEl, canvas, trayEl);
  return { headerEl, canvas, trayEl };
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('jigsaw-root');
  if (!root) throw new Error('jigsaw-root not found');
  const { headerEl, canvas, trayEl } = buildShell(root);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const params = new URLSearchParams(location.search);
  const week = params.get('week') ?? currentWeek();

  const store = makeStore();
  const [state, assets] = await Promise.all([
    loadInitialState(store, week),
    loadAssets(__DATA_REPO__, week),
  ]);

  mountAuthBar(headerEl, { state, store, week });

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed);
  state.on('change', repaint);
  repaint();

  const renderTray = (): void => {
    const actor = store.currentActor() ?? 'guest';
    const t = new Tray(state, actor);
    const buttons = t.unplaced().map((piece) => {
      const btn = document.createElement('button');
      btn.className = 'jigsaw-piece';
      btn.dataset.piece = piece.toString();
      btn.textContent = piece.toString().padStart(3, '0');
      btn.addEventListener('click', async () => {
        const slot: [number, number] = [Math.floor(piece / 8), piece % 8];
        await attemptPlace({ piece, slot, state, store, week });
        renderTray();
      });
      return btn;
    });
    trayEl.replaceChildren(...buttons);
  };
  state.on('change', renderTray);
  renderTray();

  store.subscribe((events: Event[]) => {
    for (const e of events) state.applyEvent(e);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  const root = document.getElementById('jigsaw-root');
  if (root) root.textContent = `Failed to load jigsaw: ${err.message}`;
});
```

> Note: V1 ships with a click-to-place tray. Drag-and-drop polish lands as a follow-up; the protocol claim is fully demonstrated by click-to-place.

- [ ] **Step 3: Write `src/styles.css`**

```css
.jigsaw-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1rem;
}

.jigsaw-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
  font: 1rem/1.4 system-ui, -apple-system, sans-serif;
  margin-bottom: 1rem;
}

.jigsaw-header .week { font-weight: 600; }
.jigsaw-header .actor { color: #666; }
.jigsaw-header button.sign-in {
  margin-left: auto;
  padding: 0.4rem 0.8rem;
  font: inherit;
  cursor: pointer;
}

.jigsaw-board {
  display: block;
  width: 100%;
  max-width: 1024px;
  height: auto;
  background: #fafafa;
  border: 1px solid #ccc;
}

.jigsaw-tray {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 0.5rem;
  margin-top: 1rem;
}
.jigsaw-tray .jigsaw-piece {
  aspect-ratio: 1;
  font: monospace;
  background: #f0f0f0;
  border: 1px solid #ccc;
  cursor: pointer;
}
.jigsaw-tray .jigsaw-piece:hover { background: #e0e0e0; }

.jigsaw-toast-host {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 1000;
}
.jigsaw-toast {
  background: #333;
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
```

- [ ] **Step 4: Build and verify**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm run build
```

Expected: build emits `dist/`. The build should not reference an undefined client id (it can be empty string at build time; sign-in is what fails on empty).

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/store-config.ts src/styles.css
git commit -m "Wire main: bootstrap, click-to-place tray, subscription"
```

---

## Task 18: README + CI

**Files:**
- Modify: `git-jigsaw/README.md`
- Create: `git-jigsaw/.github/workflows/ci.yml`

- [ ] **Step 1: Write `README.md`**

```markdown
# git-jigsaw

Weekly AI-generated jigsaw puzzle where every piece-placement is a git commit. The substrate is a public repo (`metafunctor-data`), not a database. Demo for the [git-native](https://github.com/queelius/git-native) library; deployed at https://metafunctor.com/arcade/jigsaw.

## How it works

- Every Monday at 00:00 UTC, a GitHub Actions cron in `metafunctor-data` calls an OpenAI-compatible image API and commits a fresh source image at `jigsaw/YYYY-Www/`.
- The browser app loads that image and computes 64 jigsaw pieces with deterministic tab/blank shapes from a per-week seed.
- You sign in with GitHub via Device Flow (no server, no callback, no client secret).
- You click a piece in the tray; if the slot is right, the app commits a `place` event to `metafunctor-data`. If two people race on the same piece, `git-native` retries once on conflict and one of you sees a "beaten to it" toast.
- The renderer reads the commit log and paints only valid placements. Bad commits are visible in the log but invisible in the picture.

## Develop

```bash
npm install
npm run dev          # Vite dev server
npm test             # vitest
npm run typecheck
npm run build        # produces dist/
```

## Deploy

Build and rsync into the local checkout of `metafunctor`:

```bash
export GH_OAUTH_CLIENT_ID=Iv1.your_app_client_id
npm run deploy                                     # to ../metafunctor/static/arcade/jigsaw/
cd ../metafunctor
git diff --stat HEAD
git add -A && git commit -m "jigsaw: deploy <hash>" && git push
```

Hugo Pages republishes on push.

## Architecture

See `docs/superpowers/specs/2026-04-28-git-jigsaw-design.md` for the full design and rationale.

## License

MIT.
```

- [ ] **Step 2: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Check out git-native sibling
        run: |
          cd ..
          git clone --depth 1 https://github.com/queelius/git-native.git
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
        env:
          GH_OAUTH_CLIENT_ID: ''
```

- [ ] **Step 3: Verify CI workflow file syntax**

```bash
cd /home/spinoza/github/repos/git-jigsaw
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: no error.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml
git commit -m "README + CI workflow"
```

---

## Task 19: Push to GitHub + first end-to-end smoke

**Files:**
- (no file changes; this is the deploy + verify step)

- [ ] **Step 1: Confirm `git-native` is published or installable**

The `git-native` repo at https://github.com/queelius/git-native is public and built. For dev we use `file:../git-native`. CI clones the sibling. No npm publish required for V1.

- [ ] **Step 2: Push `git-jigsaw` to GitHub**

```bash
cd /home/spinoza/github/repos/git-jigsaw
gh repo create queelius/git-jigsaw --public --source=. --remote=origin --push \
  --description "Weekly AI-generated jigsaw puzzle where every piece-placement is a git commit. Demo for the git-native library."
```

Expected: repo created, pushed, CI workflow runs and passes.

- [ ] **Step 3: Push `metafunctor-data` to GitHub**

```bash
cd /home/spinoza/github/repos/metafunctor-data
gh repo create queelius/metafunctor-data --public --source=. --remote=origin --push \
  --description "Public data substrate for participation features on metafunctor.com. Apps live as path-namespaced subdirectories."
```

Expected: repo created and pushed.

- [ ] **Step 4: Register GitHub OAuth App** (manual user step)

The user (queelius) navigates to https://github.com/settings/applications/new and registers:

- Application name: `metafunctor jigsaw`
- Homepage URL: `https://metafunctor.com/arcade/jigsaw`
- Authorization callback URL: `https://metafunctor.com/arcade/jigsaw` (Device Flow ignores this; field is required)
- Enable Device Flow: yes

Capture the Client ID. Save it to a local env file or your secret store. The app needs the `repo` scope to write to `metafunctor-data` on behalf of users.

- [ ] **Step 5: Configure metafunctor-data secrets and vars**

In `https://github.com/queelius/metafunctor-data/settings/secrets/actions`:

- Secret `OPENAI_API_KEY`: your OpenAI API key

Optionally, in `https://github.com/queelius/metafunctor-data/settings/variables/actions`:

- `OPENAI_BASE_URL`: leave unset for OpenAI cloud, or set to your local endpoint URL
- `OPENAI_IMAGE_MODEL`: leave unset to default to `gpt-image-1`, or set explicitly

- [ ] **Step 6: Manually trigger first puzzle generation**

```bash
gh workflow run -R queelius/metafunctor-data jigsaw-weekly.yml
gh run watch -R queelius/metafunctor-data
```

Expected: workflow succeeds; new commit appears on `main` adding `jigsaw/2026-W18/source.png` and `meta.yaml`.

- [ ] **Step 7: Build and deploy the bundle**

```bash
cd /home/spinoza/github/repos/git-jigsaw
export GH_OAUTH_CLIENT_ID=Iv1.your_client_id_from_step_4
npm install
npm run deploy
```

Expected: `dist/` built, rsync'd into `../metafunctor/static/arcade/jigsaw/`.

- [ ] **Step 8: Commit the metafunctor diff**

```bash
cd /home/spinoza/github/repos/metafunctor
git status
git add -A
git commit -m "jigsaw: deploy v0.1.0"
git push
```

Expected: GitHub Pages rebuilds and republishes within minutes.

- [ ] **Step 9: Smoke test in the browser**

1. Open https://metafunctor.com/arcade/jigsaw
2. Click `Sign in`. Follow the Device Flow modal: visit github.com/login/device, enter the displayed code, authorize.
3. Click any piece in the tray. The click handler routes the click to `slot = [piece // 8, piece % 8]`, so the placement is always valid; commit lands.
4. Verify the commit at `https://github.com/queelius/metafunctor-data/commits/main`. The commit body should be the YAML payload.
5. Reload the page. The placed piece is still there.
6. The contributors counter shows `1`.

- [ ] **Step 10: If smoke test passes, tag**

```bash
cd /home/spinoza/github/repos/git-jigsaw
git tag v0.1.0
git push origin v0.1.0
```

Done. The demo is live.

---

## Task 20 (optional): Drag-and-drop polish

The V1 ships with click-to-place. Drag-and-drop is a UX polish item, not a protocol claim. If you want it, the work is:

- Add `pointerdown`/`pointermove`/`pointerup` handlers in `src/input.ts`
- Convert tray buttons to draggable elements with their own canvas snippet showing the piece preview
- Hit-test the drop coordinate against the slot grid
- Snap-back animation on invalid drop

Defer to a follow-up. The essay claim, the protocol behavior, the conflict UX, the cron, the deploy: all are demonstrated without drag.

---

## Self-review notes

**Spec coverage:**

| Spec section | Tasks |
|---|---|
| Three-repo architecture | 1, 13, 15 |
| Data layout | 13 |
| Frontend components (puzzle, shapes, validator, renderer, tray, input, auth-bar, toast) | 2 to 7, 8, 10 |
| Read flow / write flow / subscription | 9, 10, 11 |
| Cross-client compatibility | 12 |
| Image generation pipeline | 13, 14 |
| Hugo embedding & deploy | 15, 16, 17 |
| Testing strategy (unit + integration; e2e deferred) | each task includes its own tests |
| OAuth Device Flow | 17, 19 step 4 |
| Deploy cadence | 17, 19 |
| Bundle size target (<80KB gzipped) | verified at deploy time in 19; not gated in CI for V1 |

**Placeholders:** none.

**Type consistency:**
- `PlaceEvent` shape consistent across `puzzle.ts`, `parse-event.ts`, `mock-store.ts`, all tests.
- `MockStore.commit(op, payload, opts?)` signature matches `attemptPlace`'s call site.
- `slot: readonly [number, number]` consistent throughout.
- `seed: string` (16-char hex) consistent across `meta.yaml`, `loadAssets`, `paintBoard`, `piecePath`, `tabPattern`.
- `__DATA_REPO__` / `__DATA_PATH__` / `__OAUTH_CLIENT_ID__` declared once in `src/env.d.ts`, consumed by `store-config.ts` and `main.ts`.

**E2E (Playwright) deferred:** mentioned in spec; not a V1 task. The dev-server happy-path scenario is a documented follow-up, executable via `npm run test:e2e` once the Playwright config is added. Acceptance for V1 is the manual smoke test in Task 19 step 9.

**Drag-and-drop deferred:** Task 20 documents it as optional polish. V1 ships with click-to-place. The change preserves all protocol claims.

**No `innerHTML`:** all DOM construction uses `document.createElement` and `replaceChildren`. Static HTML lives only in `index.html` (dev entry) and Hugo templates (server-rendered).
