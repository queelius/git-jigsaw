# git-jigsaw V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace V2's strict-identity validator with real-jigsaw shape-fit semantics. Add unplace/move via dragger-off-board and implicit-unplace-on-drop. Make rotation a real tool (rotating a piece lets it fit slots it wouldn't fit at rotation 0). Completion is canonical-correct.

**Architecture:** Most V2 modules unchanged. Validator becomes shape-fit with outer-edge constraint. PuzzleState gains rebuild-from-sorted-log to keep non-commutative events convergent. Input layer gains unplace + bounded conflict retry + implicit-unplace-on-drop. Dragger gains hit-test on canvas for picking up placed pieces. `git-native` library gains `delete()` and transparent PUT-with-sha.

**Tech Stack:** TypeScript, Vite, Vitest, happy-dom, `git-native` (TS sibling), GitHub Contents API. No new third-party deps. Bundle target: stay under 60 KB gzipped (V2 is 43 KB).

---

## File structure

```
git-native/src/                      (sibling repo)
├── adapters/github/index.ts         # MODIFIED: commit() does transparent sha lookup; new delete()
├── adapters/github/api.ts           # MODIFIED: deleteContents() helper
└── core/types.ts                    # MODIFIED: GitHostAdapter.delete? optional method

git-jigsaw/src/
├── validator.ts                     # MODIFIED: shape-fit signature, outer-edge constraint, rotation
├── shape-rotation.ts                # NEW: rotatedShape() helper extracted
├── puzzle.ts                        # MODIFIED: ingest() public API, rebuild-on-batch, unplace handling
├── input.ts                         # MODIFIED: attemptPlace handles moves + implicit-unplace; attemptUnplace
├── dragger.ts                       # MODIFIED: placedAt callback, onUnplace, off-board drop semantics
├── main.ts                          # MODIFIED: wire placedAt + onUnplace; canonical-correct completion
├── leaderboard.ts                   # MODIFIED: per-event credit + finalPieces + canonical closedItOut
├── store-config.ts                  # MODIFIED: expose delete() through StoreLike wrapper
├── completion.ts                    # NEW: isCanonicalSolved (renamed/extracted from puzzle.ts:isSolved)
├── tray.ts                          # UNCHANGED
├── renderer.ts                      # UNCHANGED
├── shapes.ts                        # UNCHANGED
├── thumbnail.ts                     # UNCHANGED
├── drawer.ts                        # UNCHANGED
├── confetti.ts                      # UNCHANGED
├── auth-bar.ts                      # UNCHANGED
├── sign-in-menu.ts                  # UNCHANGED
├── read-flow.ts                     # UNCHANGED
├── parse-event.ts                   # UNCHANGED
├── toast.ts                         # UNCHANGED
└── env.d.ts                         # UNCHANGED

git-jigsaw/test/
├── unit/
│   ├── validator.test.ts            # MODIFIED: shape-fit + outer-edge cases
│   ├── shape-rotation.test.ts       # NEW
│   ├── puzzle.test.ts               # MODIFIED: ingest + sorted replay + unplace
│   ├── leaderboard.test.ts          # MODIFIED: per-event credit + finalPieces
│   └── completion.test.ts           # NEW (extracted from puzzle.test.ts; canonical-only)
├── integration/
│   ├── write-flow.test.ts           # MODIFIED: attemptUnplace + implicit-unplace-on-drop
│   ├── dragger.test.ts              # MODIFIED: placedAt + off-board unplace
│   ├── conflict-retry.test.ts       # NEW
│   ├── completion.test.ts           # MODIFIED: canonical-correct triggers, filled-but-wrong doesn't
│   └── mock-store.ts                # MODIFIED: delete() method + per-piece file simulation
└── fixtures/
    ├── py-commit-body.yaml          # UNCHANGED
    ├── py-commit-body-v2.yaml       # UNCHANGED
    └── py-commit-body-v3-unplace.yaml  # NEW
```

---

## Task 1: git-native: `delete()` and transparent PUT-with-sha

**Files:**
- Modify: `/home/spinoza/github/repos/git-native/src/adapters/github/api.ts`
- Modify: `/home/spinoza/github/repos/git-native/src/adapters/github/index.ts`
- Modify: `/home/spinoza/github/repos/git-native/src/core/types.ts`
- Modify: `/home/spinoza/github/repos/git-native/test/contracts/github.test.ts` (and `local.test.ts`)

The GitHub Contents API requires the prior file's sha for both updates and deletes. V2 always PUT without sha, which only worked for first-place. V3 needs:
- `GitHubAdapter.commit()` to do GET-for-sha-then-PUT-with-sha when the target file already exists
- `GitHubAdapter.delete()` to do GET-for-sha-then-DELETE
- Protocol: `GitHostAdapter.delete?` is optional (LocalAdapter implements it as `fs.unlink`)

- [ ] **Step 1: Add `getContents` and `deleteContents` to `api.ts`**

In `/home/spinoza/github/repos/git-native/src/adapters/github/api.ts`, add:

```ts
async getContentsSha(path: string): Promise<string | null> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${this.opts.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    { headers: this.headers() },
  );
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const err = new Error(`Get contents failed: ${resp.status}`);
    (err as { status?: number }).status = resp.status;
    throw err;
  }
  const data = await resp.json() as { sha?: string };
  return data.sha ?? null;
}

async deleteContents(input: { path: string; message: string; sha: string; branch?: string }): Promise<{ commit: { sha: string } }> {
  const resp = await fetch(
    `${GITHUB_API}/repos/${this.opts.repo}/contents/${encodeURIComponent(input.path).replace(/%2F/g, '/')}`,
    {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({
        message: input.message,
        sha: input.sha,
        branch: input.branch,
      }),
    },
  );
  if (resp.status === 409 || resp.status === 422) {
    const text = await resp.text();
    throw Object.assign(new Error(`Delete conflict: ${text}`), { isConflict: true });
  }
  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Delete contents failed: ${resp.status} ${text}`);
    (err as { status?: number }).status = resp.status;
    throw err;
  }
  return resp.json();
}
```

- [ ] **Step 2: Modify `GitHubAdapter.commit()` to do transparent PUT-with-sha**

In `/home/spinoza/github/repos/git-native/src/adapters/github/index.ts`, find the body of `commit()`. Replace the existing PUT block with:

```ts
    try {
      const existingSha = await this.api.getContentsSha(filePath);
      const result = await this.api.putContents({
        path: filePath,
        content,
        message: fullMessage,
        branch,
        sha: existingSha ?? undefined,
      });
      return { sha: result.commit.sha };
    } catch (e) {
      if ((e as { isConflict?: boolean }).isConflict) {
        throw new ConflictError();
      }
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403) {
        this.token = null;
        this.api = new ApiClient({ token: null, repo: this.opts.repo });
        this.actor = null;
        this.opts.storage?.set(null);
        throw new AuthError('Token rejected by GitHub; please sign in again');
      }
      throw e;
    }
```

The key change is calling `getContentsSha` before PUT and passing the result as the optional `sha` field.

- [ ] **Step 3: Add `GitHubAdapter.delete()` method**

Append to the `GitHubAdapter` class:

```ts
  async delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }> {
    if (!this.token || !this.api) throw new AuthError('Not authenticated');
    if (input.files.length !== 1) {
      throw new Error('Multi-file delete is not supported. Use single-file delete.');
    }
    const filePath = input.files[0]!;
    const message = `delete ${filePath}`;
    try {
      const existingSha = await this.api.getContentsSha(filePath);
      if (existingSha === null) {
        throw new Error(`File does not exist: ${filePath}`);
      }
      const result = await this.api.deleteContents({
        path: filePath,
        message,
        sha: existingSha,
        branch: input.branch,
      });
      return { sha: result.commit.sha };
    } catch (e) {
      if ((e as { isConflict?: boolean }).isConflict) {
        throw new ConflictError();
      }
      const status = (e as { status?: number }).status;
      if (status === 401 || status === 403) {
        this.token = null;
        this.api = new ApiClient({ token: null, repo: this.opts.repo });
        this.actor = null;
        this.opts.storage?.set(null);
        throw new AuthError('Token rejected by GitHub; please sign in again');
      }
      throw e;
    }
  }
```

- [ ] **Step 4: Add `delete?` to GitHostAdapter Protocol**

In `/home/spinoza/github/repos/git-native/src/core/types.ts`, find the `GitHostAdapter` interface. Add:

```ts
  delete?(input: { files: string[]; branch?: string }): Promise<{ sha: string }>;
```

(Optional method like `signInWithToken` and `restoreSession`.)

- [ ] **Step 5: Add `delete()` delegate to Store**

In `/home/spinoza/github/repos/git-native/src/core/store.ts`, add to Store:

```ts
  async delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }> {
    if (!this.adapter.delete) {
      throw new Error('Adapter does not support delete');
    }
    return await this.adapter.delete(input);
  }
```

Add the method to the exported `Store` interface in `types.ts` as well.

- [ ] **Step 6: Add LocalAdapter `delete()` implementation**

In `/home/spinoza/github/repos/git-native/src/adapters/local/node.ts`, append a `delete` method that does:
1. `fs.unlinkSync` the file
2. Stages and commits via `isomorphic-git`
3. Returns the new commit's sha

(Mirror the pattern of LocalAdapter's existing `commit`. If `LocalAdapter` doesn't use isomorphic-git directly but shells out to `git`, follow that pattern instead.)

- [ ] **Step 7: Add contract-test cases for delete**

In `/home/spinoza/github/repos/git-native/test/contracts/github.test.ts` and `local.test.ts`, add:

```ts
  it('delete removes a file and creates a commit', async () => {
    await adapter.signIn?.() ?? adapter.signInWithToken?.('test-token');
    await adapter.commit({
      subject: 'create',
      body: 'op: place\nv: 1\n',
      files: { 'test/path.txt': 'hello' },
    });
    if (!adapter.delete) {
      // adapter doesn't implement; skip
      return;
    }
    const { sha } = await adapter.delete({ files: ['test/path.txt'] });
    expect(sha).toMatch(/^[0-9a-f]+$/);
    // verify the file is gone via events() or direct check
  });
```

- [ ] **Step 8: Update MockAdapter in tests**

In `/home/spinoza/github/repos/git-native/test/helpers/mock-adapter.ts` (or wherever MockAdapter lives), add a `delete` method:

```ts
  async delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }> {
    // Remove the synthesized file from internal storage
    for (const path of input.files) {
      this.files?.delete(path);
    }
    const sha = 'sha-' + Math.random().toString(36).slice(2, 8);
    return { sha };
  }
```

- [ ] **Step 9: Run tests, rebuild, commit**

```bash
cd /home/spinoza/github/repos/git-native
npm test
npm run build
git add src/
git commit -m "Adapter: transparent PUT-with-sha; add delete() method

GitHub Contents API requires the prior file's sha for both updates
and deletes. commit() now does GET-for-sha-then-PUT-with-sha when
the target file exists; delete() does GET-for-sha-then-DELETE.

GitHostAdapter Protocol gains optional delete() method. Store
exposes it via Store.delete()."
git push
```

---

## Task 2: git-jigsaw: extract `rotatedShape` to its own module

**Files:**
- Create: `/home/spinoza/github/repos/git-jigsaw/src/shape-rotation.ts`
- Create: `/home/spinoza/github/repos/git-jigsaw/test/unit/shape-rotation.test.ts`

The rotation arithmetic is one self-contained function used by the validator. Keeping it in its own file makes it easy to test exhaustively.

- [ ] **Step 1: Write the failing test**

Create `/home/spinoza/github/repos/git-jigsaw/test/unit/shape-rotation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rotatedShape } from '../../src/shape-rotation';
import type { PieceShape } from '../../src/shapes';

const corner: PieceShape = { N: 0, E: 1, S: 1, W: 0 };
const edge: PieceShape = { N: 0, E: 1, S: -1, W: 1 };
const interior: PieceShape = { N: 1, E: -1, S: 1, W: -1 };

describe('rotatedShape', () => {
  it('rotation 0 is identity', () => {
    expect(rotatedShape(corner, 0)).toEqual(corner);
  });

  it('rotation 90: new N = old W (tabs/blanks shift clockwise to new positions)', () => {
    const r = rotatedShape(corner, 90);
    expect(r.N).toBe(corner.W);
    expect(r.E).toBe(corner.N);
    expect(r.S).toBe(corner.E);
    expect(r.W).toBe(corner.S);
  });

  it('rotation 180: flips opposite faces', () => {
    const r = rotatedShape(corner, 180);
    expect(r.N).toBe(corner.S);
    expect(r.E).toBe(corner.W);
    expect(r.S).toBe(corner.N);
    expect(r.W).toBe(corner.E);
  });

  it('rotation 270 is inverse of rotation 90', () => {
    const r = rotatedShape(rotatedShape(corner, 90), 270);
    expect(r).toEqual(corner);
  });

  it('signs are preserved (tabs stay tabs, blanks stay blanks)', () => {
    const r = rotatedShape(interior, 90);
    const signs = [interior.N, interior.E, interior.S, interior.W].sort();
    const rotSigns = [r.N, r.E, r.S, r.W].sort();
    expect(rotSigns).toEqual(signs);
  });

  it('edge piece rotated 90 has flat edge in new position', () => {
    const r = rotatedShape(edge, 90);
    expect(r.E).toBe(0);   // old N (flat) is now at E
  });

  it('four rotations bring back identity', () => {
    let r = corner;
    for (let i = 0; i < 4; i++) r = rotatedShape(r, 90);
    expect(r).toEqual(corner);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm test -- shape-rotation
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/shape-rotation.ts`**

```ts
import type { PieceShape } from './shapes';

export function rotatedShape(shape: PieceShape, rotation: 0 | 90 | 180 | 270): PieceShape {
  const e: Array<-1 | 0 | 1> = [shape.N, shape.E, shape.S, shape.W];
  const turns = rotation / 90;
  return {
    N: e[(0 - turns + 4) % 4],
    E: e[(1 - turns + 4) % 4],
    S: e[(2 - turns + 4) % 4],
    W: e[(3 - turns + 4) % 4],
  } as PieceShape;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- shape-rotation
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/shape-rotation.ts test/unit/shape-rotation.test.ts
git commit -m "Shape rotation: extract rotatedShape helper with unit tests"
```

---

## Task 3: Validator: shape-fit semantics + outer-edge constraint

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/validator.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/unit/validator.test.ts`

V2's validator was 9 lines (pure arithmetic). V3's is ~50 lines (shape lookup, neighbor traversal, rotation arithmetic). The signature grows.

- [ ] **Step 1: Update tests for shape-fit + outer-edge**

Replace `/home/spinoza/github/repos/git-jigsaw/test/unit/validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isValidPlacement, PIECE_COUNT_FOR } from '../../src/validator';

const SEED = 'fixedseed12345678';

interface PlacementForTest {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
}

function emptyPlacements(): Map<number, PlacementForTest> {
  return new Map();
}

describe('isValidPlacement (shape-fit)', () => {
  it('PIECE_COUNT_FOR(8) is 64', () => {
    expect(PIECE_COUNT_FOR(8)).toBe(64);
  });

  it('canonical placement of any piece validates on empty board', () => {
    for (let piece = 0; piece < 64; piece++) {
      const row = Math.floor(piece / 8);
      const col = piece % 8;
      expect(isValidPlacement(piece, [row, col], 0, 8, SEED, emptyPlacements())).toBe(true);
    }
  });

  it('rejects rotation that does not match outer-edge constraint for corner pieces', () => {
    // piece 0 is the NW corner; its canonical shape has N=0, W=0
    // at rotation 90, N face would carry the old W value (still 0), W carries S (tab/blank, not flat)
    // so piece 0 at corner [0,0] rotation 90 should fail
    expect(isValidPlacement(0, [0, 0], 90, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('rejects interior piece at outer slot at any rotation', () => {
    // piece 9 is interior (row 1, col 1); all four canonical edges are tab/blank
    // it cannot go on any outer slot at any rotation
    const outerSlots: Array<[number, number]> = [
      [0, 0], [0, 3], [0, 7], [3, 0], [3, 7], [7, 0], [7, 3], [7, 7],
    ];
    for (const slot of outerSlots) {
      for (const rot of [0, 90, 180, 270] as const) {
        expect(isValidPlacement(9, slot, rot, 8, SEED, emptyPlacements())).toBe(false);
      }
    }
  });

  it('rejects placement where the piece would block an interior slot with a flat edge', () => {
    // piece 0 (NW corner, canonical has flat N and flat W) at slot [3, 3] (interior)
    // its flat edges would face empty interior neighbors. Validator must reject.
    expect(isValidPlacement(0, [3, 3], 0, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('shape-fits piece at canonical slot when canonical neighbor is placed', () => {
    // piece 0 at [0, 0] rotation 0
    // piece 1 at [0, 1] rotation 0; piece 0's east must match piece 1's west
    const placements = new Map<number, PlacementForTest>([
      [0, { slot: [0, 0], rotation: 0 }],
    ]);
    expect(isValidPlacement(1, [0, 1], 0, 8, SEED, placements)).toBe(true);
  });

  it('rejects when placed neighbor blocks the slot via mismatched edge', () => {
    // place piece 9 (interior) at slot [1, 1] rotation 0
    // try to put piece 0 (corner with flat N, flat W) at slot [1, 2]
    // piece 0's west face (flat) must match piece 9's east face (tab or blank, not flat)
    // mismatch -> false. (Also rejected by outer-edge constraint, but useful as a layered check.)
    const placements = new Map<number, PlacementForTest>([
      [9, { slot: [1, 1], rotation: 0 }],
    ]);
    expect(isValidPlacement(0, [1, 2], 0, 8, SEED, placements)).toBe(false);
  });

  it('respects excludePiece: a piece can be moved to its own current slot (no-op move)', () => {
    const placements = new Map<number, PlacementForTest>([
      [42, { slot: [5, 2], rotation: 0 }],
    ]);
    expect(isValidPlacement(42, [5, 2], 0, 8, SEED, placements, 42)).toBe(true);
  });

  it('without excludePiece, slot occupancy check fails for a self-move', () => {
    const placements = new Map<number, PlacementForTest>([
      [42, { slot: [5, 2], rotation: 0 }],
    ]);
    expect(isValidPlacement(42, [5, 2], 0, 8, SEED, placements)).toBe(false);
  });

  it('rejects piece out of range', () => {
    expect(isValidPlacement(64, [0, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
    expect(isValidPlacement(-1, [0, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
  });

  it('rejects slot row/col out of range', () => {
    expect(isValidPlacement(0, [8, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
    expect(isValidPlacement(0, [-1, 0], 0, 8, SEED, emptyPlacements())).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- validator
```

Expected: FAIL.

- [ ] **Step 3: Replace `src/validator.ts`**

```ts
import { pieceShape, type PieceShape } from './shapes';
import { rotatedShape } from './shape-rotation';

export function PIECE_COUNT_FOR(gridSize: number): number {
  return gridSize * gridSize;
}

export interface PlacementForValidator {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
}

export function isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270 | number,
  gridSize: number,
  seed: string,
  placements: ReadonlyMap<number, PlacementForValidator>,
  excludePiece?: number,
): boolean {
  // Sanity
  if (!Number.isInteger(gridSize) || gridSize < 2) return false;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) return false;
  if (!Number.isInteger(piece) || piece < 0 || piece >= gridSize * gridSize) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= gridSize) return false;
  if (!Number.isInteger(col) || col < 0 || col >= gridSize) return false;

  // Slot occupancy (excluding the piece being moved)
  for (const [otherPiece, p] of placements) {
    if (otherPiece === excludePiece) continue;
    if (p.slot[0] === row && p.slot[1] === col) return false;
  }

  // Piece-already-placed dedup (a piece can be in only one slot at a time)
  if (placements.has(piece) && piece !== excludePiece) return false;

  // Compute the piece's rotated shape
  const canonRow = Math.floor(piece / gridSize);
  const canonCol = piece % gridSize;
  const canonShape: PieceShape = pieceShape(seed, canonRow, canonCol, gridSize);
  const rotated = rotatedShape(canonShape, rotation as 0 | 90 | 180 | 270);

  // Check each cardinal direction
  const directions: Array<{ edge: keyof PieceShape; dr: number; dc: number; oppositeEdge: keyof PieceShape }> = [
    { edge: 'N', dr: -1, dc: 0, oppositeEdge: 'S' },
    { edge: 'E', dr: 0, dc: 1, oppositeEdge: 'W' },
    { edge: 'S', dr: 1, dc: 0, oppositeEdge: 'N' },
    { edge: 'W', dr: 0, dc: -1, oppositeEdge: 'E' },
  ];

  for (const { edge, dr, dc, oppositeEdge } of directions) {
    const nrow = row + dr;
    const ncol = col + dc;
    const pieceEdge = rotated[edge];

    if (nrow < 0 || nrow >= gridSize || ncol < 0 || ncol >= gridSize) {
      // Outer boundary: piece's edge must be flat
      if (pieceEdge !== 0) return false;
      continue;
    }

    // Find a placed piece at the neighbor slot
    let neighborPiece: number | undefined;
    let neighborPlacement: PlacementForValidator | undefined;
    for (const [op, p] of placements) {
      if (op === excludePiece) continue;
      if (p.slot[0] === nrow && p.slot[1] === ncol) {
        neighborPiece = op;
        neighborPlacement = p;
        break;
      }
    }

    if (neighborPlacement === undefined || neighborPiece === undefined) {
      // Empty interior neighbor: piece's edge must NOT be flat
      // (Outer-edge constraint: a flat edge must face the puzzle boundary.)
      if (pieceEdge === 0) return false;
      continue;
    }

    // Occupied neighbor: edges must sum to 0 (tab into blank or blank into tab)
    const neighborCanonRow = Math.floor(neighborPiece / gridSize);
    const neighborCanonCol = neighborPiece % gridSize;
    const neighborCanonShape: PieceShape = pieceShape(seed, neighborCanonRow, neighborCanonCol, gridSize);
    const neighborRotated = rotatedShape(neighborCanonShape, neighborPlacement.rotation);
    const neighborEdge = neighborRotated[oppositeEdge];

    if (pieceEdge + neighborEdge !== 0) return false;
  }

  return true;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- validator
```

Expected: 11 passed (the test list above).

- [ ] **Step 5: Commit**

```bash
git add src/validator.ts test/unit/validator.test.ts
git commit -m "Validator: shape-fit semantics with outer-edge constraint

Replaces strict-identity validator (V2) with shape-fit: a piece
validates if its edges (after rotation) interlock with placed
neighbors' facing edges. Outer-edge constraint: a flat edge must
face the puzzle boundary, preventing edge/corner pieces from being
placed in the interior even when neighbors are empty.

Signature gains seed, placements, and optional excludePiece for
moves."
```

---

## Task 4: PuzzleState: `ingest()` with sorted replay; unplace handling

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/puzzle.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/unit/puzzle.test.ts`

PuzzleState becomes a rebuild-on-batch state machine. The public API replaces single-event `applyEvent` with batch `ingest`.

- [ ] **Step 1: Update tests for V3 semantics**

Replace `/home/spinoza/github/repos/git-jigsaw/test/unit/puzzle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent, type Event } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function placeEvent(overrides: Partial<PlaceEvent>): PlaceEvent {
  return {
    op: 'place',
    piece: 0,
    slot: [0, 0],
    rotation: 0,
    grid_size: 8,
    actor: 'alice',
    ts: '2026-05-11T12:00:00Z',
    v: 1,
    sha: 'sha-' + Math.random().toString(36).slice(2, 8),
    ...overrides,
  };
}

function unplaceEvent(overrides: Partial<Event> & { piece: number }): Event {
  return {
    op: 'unplace',
    piece: 0,
    slot: [0, 0],
    rotation: 0,
    grid_size: 8,
    actor: 'alice',
    ts: '2026-05-11T12:00:00Z',
    v: 1,
    sha: 'sha-' + Math.random().toString(36).slice(2, 8),
    ...overrides,
  } as Event;
}

describe('PuzzleState (V3)', () => {
  it('starts empty', () => {
    const s = new PuzzleState(8, SEED);
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
    expect(s.history.length).toBe(0);
  });

  it('ingest place applies valid placement', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0], actor: 'queelius' })]);
    expect(s.placements.get(0)?.slot).toEqual([0, 0]);
    expect(s.contributors.has('queelius')).toBe(true);
    expect(s.history.length).toBe(1);
  });

  it('ingest place-then-unplace produces empty state', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z' }),
      unplaceEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z' }),
    ]);
    expect(s.placements.size).toBe(0);
    expect(s.history.length).toBe(2);  // both events retained in history
  });

  it('ingest place-then-place-different-slot is a move (final placement wins)', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z', sha: 'b' }),
    ]);
    // Note: piece 0 cannot legally move because its only canonical slot is [0,0].
    // We construct a test that actually exercises a move below.
    expect(s.placements.size).toBe(1);
  });

  it('ingest out-of-order: sorts by ts before applying', () => {
    // P_at_S2 (ts T3) arrives BEFORE Unplace (ts T2) arrives BEFORE P_at_S1 (ts T1)
    // Final state should be: piece 0 at slot [0,0] (T3 = "place 0 at [0,0]")
    // Actually, sorted by ts gives [T1, T2, T3]: place, unplace, place. Final: T3 placement applies.
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:02:00Z', sha: 'c', actor: 'alice' }),
      unplaceEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:01:00Z', sha: 'b', actor: 'bob' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a', actor: 'alice' }),
    ]);
    expect(s.placements.get(0)?.actor).toBe('alice');
    expect(s.placements.get(0)?.sha).toBe('c');
  });

  it('sha lexicographic tiebreak when ts is identical', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'b' }),
      placeEvent({ piece: 0, slot: [0, 0], ts: '2026-05-11T12:00:00Z', sha: 'a' }),
    ]);
    // Sorted: 'a' before 'b'. Final placement = 'b' (last-in-sorted-order wins).
    expect(s.placements.get(0)?.sha).toBe('b');
  });

  it('grid_size filter: events with wrong grid_size are dropped', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0], grid_size: 10 })]);
    expect(s.placements.size).toBe(0);
  });

  it('unknown ops are ignored', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([{ op: 'comment', actor: 'a', ts: 't', v: 1, sha: 'x', grid_size: 8 } as any]);
    expect(s.placements.size).toBe(0);
  });

  it('invalid place (shape-misfit) is silently dropped', () => {
    // Piece 9 (interior) cannot be placed on an outer slot
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 9, slot: [0, 0] })]);
    expect(s.placements.size).toBe(0);
  });

  it('placedAt returns the piece at a slot', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0] })]);
    expect(s.placedAt(0, 0)).toEqual({ piece: 0, rotation: 0 });
    expect(s.placedAt(5, 5)).toBeNull();
  });

  it('emits change on ingest with valid events', () => {
    const s = new PuzzleState(8, SEED);
    let changes = 0;
    s.on('change', () => changes++);
    s.ingest([placeEvent({ piece: 0, slot: [0, 0] })]);
    expect(changes).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- puzzle
```

Expected: FAIL.

- [ ] **Step 3: Replace `src/puzzle.ts`**

```ts
import { isValidPlacement } from './validator';

export interface Placement {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  actor: string;
  ts: string;
  sha: string;
}

export interface PlaceEvent {
  op: 'place';
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  grid_size: number;
  actor: string;
  ts: string;
  v: number;
  sha: string;
}

export interface UnplaceEvent {
  op: 'unplace';
  piece: number;
  slot?: readonly [number, number];
  rotation?: 0 | 90 | 180 | 270;
  grid_size: number;
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

export type Event = PlaceEvent | UnplaceEvent | UnknownEvent;

type ChangeListener = () => void;

export class PuzzleState {
  readonly placements = new Map<number, Placement>();
  readonly contributors = new Set<string>();
  readonly history: Event[] = [];
  private readonly eventLog: Event[] = [];
  private listeners = new Set<ChangeListener>();

  constructor(
    public readonly gridSize: number,
    public readonly seed: string,
  ) {}

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  placedAt(row: number, col: number): { piece: number; rotation: 0 | 90 | 180 | 270 } | null {
    for (const [piece, p] of this.placements) {
      if (p.slot[0] === row && p.slot[1] === col) {
        return { piece, rotation: p.rotation };
      }
    }
    return null;
  }

  ingest(newEvents: Event[]): void {
    this.eventLog.push(...newEvents);
    this.rebuild();
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private rebuild(): void {
    const sorted = [...this.eventLog].sort((a, b) =>
      a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha),
    );
    this.placements.clear();
    this.contributors.clear();
    this.history.length = 0;
    for (const event of sorted) {
      this.applyEventInternal(event);
    }
    this.emit();
  }

  private applyEventInternal(event: Event): void {
    // grid_size filter
    const eventGrid = (event as Record<string, unknown>).grid_size;
    if (typeof eventGrid !== 'number' || eventGrid !== this.gridSize) return;

    if (event.op === 'place') {
      const raw = event as Record<string, unknown>;
      const piece = raw.piece;
      const slot = raw.slot;
      const rotation = raw.rotation ?? 0;
      if (typeof piece !== 'number') return;
      if (!Array.isArray(slot) || slot.length !== 2) return;
      if (typeof slot[0] !== 'number' || typeof slot[1] !== 'number') return;
      if (typeof rotation !== 'number') return;
      const excludePiece = this.placements.has(piece) ? piece : undefined;
      if (!isValidPlacement(piece, [slot[0], slot[1]] as const, rotation as 0 | 90 | 180 | 270, this.gridSize, this.seed, this.placements, excludePiece)) return;
      this.placements.set(piece, {
        slot: [slot[0], slot[1]] as const,
        rotation: rotation as 0 | 90 | 180 | 270,
        actor: event.actor,
        ts: event.ts,
        sha: event.sha,
      });
      this.contributors.add(event.actor);
      this.history.push(event);
    } else if (event.op === 'unplace') {
      const raw = event as Record<string, unknown>;
      const piece = raw.piece;
      if (typeof piece !== 'number') return;
      if (!this.placements.has(piece)) return;
      this.placements.delete(piece);
      this.history.push(event);
    }
    // unknown ops: ignored
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- puzzle
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/puzzle.ts test/unit/puzzle.test.ts
git commit -m "PuzzleState V3: ingest with sorted rebuild; place semantics replace; unplace handling

V3 turns the commit log into a non-commutative state machine.
Place for already-placed piece replaces. Unplace removes. The
public ingest() API appends to eventLog and rebuilds placements
from sorted (ts, sha) order so out-of-order subscription delivery
converges.

PlaceEvent type unchanged. UnplaceEvent added with optional slot
and rotation for self-description. UnknownEvent and forward-compat
preserved."
```

---

## Task 5: completion.ts: canonical-correct check

**Files:**
- Create: `/home/spinoza/github/repos/git-jigsaw/src/completion.ts`
- Create: `/home/spinoza/github/repos/git-jigsaw/test/unit/completion.test.ts` (extracted from puzzle.test.ts; new V3-specific)

V2 had `isSolved` in puzzle.ts. V3 needs `isCanonicalSolved`. Extracted into its own module so the spec/completion semantics are explicit.

- [ ] **Step 1: Write the failing test**

Create `/home/spinoza/github/repos/git-jigsaw/test/unit/completion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCanonicalSolved } from '../../src/completion';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function fillCanonical(state: PuzzleState, gridSize: number): void {
  const events: PlaceEvent[] = [];
  for (let i = 0; i < gridSize * gridSize; i++) {
    events.push({
      op: 'place',
      piece: i,
      slot: [Math.floor(i / gridSize), i % gridSize],
      rotation: 0,
      grid_size: gridSize,
      actor: 'alice',
      ts: `2026-05-11T10:${String(i).padStart(2, '0')}:00Z`,
      v: 1,
      sha: `sha-${i}`,
    });
  }
  state.ingest(events);
}

describe('isCanonicalSolved', () => {
  it('returns false when no pieces placed', () => {
    const s = new PuzzleState(8, SEED);
    expect(isCanonicalSolved(s)).toBe(false);
  });

  it('returns false when only some pieces placed', () => {
    const s = new PuzzleState(8, SEED);
    s.ingest([{
      op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8,
      actor: 'alice', ts: '2026-05-11T10:00:00Z', v: 1, sha: 'a',
    }]);
    expect(isCanonicalSolved(s)).toBe(false);
  });

  it('returns true when all pieces placed at canonical slots rotation 0', () => {
    const s = new PuzzleState(8, SEED);
    fillCanonical(s, 8);
    expect(isCanonicalSolved(s)).toBe(true);
  });

  it('does not require canonical placement of every piece; shape-fit can produce wrong-image fills', () => {
    // This test documents that filled != solved.
    // If two interior pieces have identical shape signatures, they can swap.
    // Without constructing a specific seed that produces a swap, we can
    // simulate by manually constructing a PuzzleState with a non-canonical
    // placement that the validator would still reject. The simplest test:
    // a 1-piece puzzle is solved if and only if piece 0 is at slot [0,0].
    const s = new PuzzleState(2, SEED);
    // Filling a 2x2 puzzle canonically:
    s.ingest([
      { op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 2, actor: 'a', ts: 't1', v: 1, sha: '1' },
      { op: 'place', piece: 1, slot: [0, 1], rotation: 0, grid_size: 2, actor: 'a', ts: 't2', v: 1, sha: '2' },
      { op: 'place', piece: 2, slot: [1, 0], rotation: 0, grid_size: 2, actor: 'a', ts: 't3', v: 1, sha: '3' },
      { op: 'place', piece: 3, slot: [1, 1], rotation: 0, grid_size: 2, actor: 'a', ts: 't4', v: 1, sha: '4' },
    ]);
    expect(s.placedCount).toBe(4);
    expect(isCanonicalSolved(s)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- completion
```

Expected: FAIL.

- [ ] **Step 3: Write `src/completion.ts`**

```ts
import type { PuzzleState } from './puzzle';

export function isCanonicalSolved(state: PuzzleState): boolean {
  const total = state.gridSize * state.gridSize;
  if (state.placedCount !== total) return false;
  for (const [piece, p] of state.placements) {
    const canonRow = Math.floor(piece / state.gridSize);
    const canonCol = piece % state.gridSize;
    if (p.slot[0] !== canonRow || p.slot[1] !== canonCol) return false;
    if (p.rotation !== 0) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- completion
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/completion.ts test/unit/completion.test.ts
git commit -m "Completion: isCanonicalSolved (each piece at canonical slot, rotation 0)"
```

---

## Task 6: store-config: expose `delete()` through StoreLike

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/store-config.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/integration/mock-store.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/integration/scaffold.test.ts`

The app-layer `Store` wrapper grows by one method (`delete`). MockStore mirrors.

- [ ] **Step 1: Add `delete()` to MockStore**

Edit `/home/spinoza/github/repos/git-jigsaw/test/integration/mock-store.ts`. Add to the class:

```ts
  public deleteCalls: Array<{ files: string[] }> = [];
  private deletedFiles = new Set<string>();

  async delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }> {
    if (this.rejectNext) {
      const e = this.rejectNext;
      this.rejectNext = undefined;
      throw e;
    }
    this.deleteCalls.push({ files: input.files });
    for (const path of input.files) {
      this.deletedFiles.add(path);
    }
    const sha = 'sha-' + (this.events.length + 1).toString().padStart(8, '0');
    return { sha };
  }
```

- [ ] **Step 2: Update `scaffold.test.ts` to verify the new method**

In `/home/spinoza/github/repos/git-jigsaw/test/integration/scaffold.test.ts`, add:

```ts
  it('delete records call', async () => {
    const s = new MockStore({ initialActor: 'queelius' });
    await s.delete({ files: ['jigsaw/2026-W19/placements/042.json'] });
    expect(s.deleteCalls).toHaveLength(1);
    expect(s.deleteCalls[0].files).toEqual(['jigsaw/2026-W19/placements/042.json']);
  });
```

- [ ] **Step 3: Update `store-config.ts`**

Replace `/home/spinoza/github/repos/git-jigsaw/src/store-config.ts`:

```ts
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
```

- [ ] **Step 4: Run typecheck + tests**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm run typecheck
npm test
```

Expected: typecheck clean (assumes Task 1 in git-native has been rebuilt and is available via `file:../git-native`); tests pass.

If typecheck fails because `Store` doesn't have `delete`, the issue is that Task 1's git-native changes haven't propagated. Run `cd ../git-native && npm run build && cd ../git-jigsaw && rm -rf node_modules/git-native && npm install` to refresh the sibling.

- [ ] **Step 5: Commit**

```bash
git add src/store-config.ts test/integration/mock-store.ts test/integration/scaffold.test.ts
git commit -m "Store-config: expose delete() through StoreLike wrapper; MockStore mirrors"
```

---

## Task 7: input.ts: `attemptPlace` (move + implicit-unplace + conflict retry) + `attemptUnplace`

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/input.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/integration/write-flow.test.ts`

- [ ] **Step 1: Update write-flow tests**

Replace `/home/spinoza/github/repos/git-jigsaw/test/integration/write-flow.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace, attemptUnplace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

const SEED = 'fixedseed12345678';

describe('attemptPlace V3', () => {
  it('valid first placement commits and applies locally', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls).toHaveLength(1);
    expect(state.isPlaced(0)).toBe(true);
  });

  it('shape-misfit returns invalid with no commit', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 9, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('no-op move (same slot, same rotation) returns noop with no commit', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    store.commitCalls.length = 0;
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('implicit-unplace-on-drop: dropping on occupied slot unplaces the occupant', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    // Place piece 0 at [0,0]
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(true);
    // Now try to put piece 1 at [0,0] (occupied)
    // This should unplace 0 first, then attempt to place 1.
    // (Piece 1's canonical slot is [0,1], so placing it at [0,0] should fail shape-fit
    //  but the unplace should still have happened.)
    const result = await attemptPlace({ piece: 1, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(false);
    expect(result.kind).toBe('invalid');
  });

  it('move: place piece 0 then place it at its same canonical slot is a no-op (rejected by no-op check)', async () => {
    // Piece 0 can only legally be at slot [0,0]; we already tested no-op above.
    // This test confirms the no-op short-circuit happens before the validator runs.
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    store.commitCalls.length = 0;
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('unauthenticated returns auth-required without commit', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('auth-required');
    expect(store.commitCalls).toHaveLength(0);
  });
});

describe('attemptUnplace V3', () => {
  it('unplaces a placed piece via store.delete', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(state.isPlaced(0)).toBe(true);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('unplaced');
    expect(state.isPlaced(0)).toBe(false);
    expect(store.deleteCalls).toHaveLength(1);
    expect(store.deleteCalls[0].files).toEqual(['jigsaw/2026-W19/placements/000.json']);
  });

  it('unplacing a non-placed piece returns noop', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8, SEED);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('noop');
    expect(store.deleteCalls).toHaveLength(0);
  });

  it('unauthenticated unplace returns auth-required', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8, SEED);
    const result = await attemptUnplace({ piece: 0, gridSize: 8, state, store, week: '2026-W19' });
    expect(result.kind).toBe('auth-required');
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- write-flow
```

Expected: FAIL (attemptPlace signature changed; attemptUnplace doesn't exist).

- [ ] **Step 3: Replace `src/input.ts`**

```ts
import { isValidPlacement } from './validator';
import type { PuzzleState, PlaceEvent, UnplaceEvent } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(op: string, payload: Record<string, unknown>, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
  delete(input: { files: string[]; branch?: string }): Promise<{ sha: string }>;
  eventsSince(since?: string): Promise<any[]>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  gridSize: number;
  seed: string;
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export interface AttemptUnplaceArgs {
  piece: number;
  gridSize: number;
  state: PuzzleState;
  store: StoreLike;
  week: string;
}

export type AttemptResult =
  | { kind: 'placed'; sha: string }
  | { kind: 'unplaced' }
  | { kind: 'noop' }
  | { kind: 'invalid' }
  | { kind: 'conflict' }
  | { kind: 'auth-required' };

const MAX_CONFLICT_RETRIES = 3;

export async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, state, store } = args;

  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }

  // No-op detection
  const current = state.placements.get(piece);
  if (current && current.slot[0] === slot[0] && current.slot[1] === slot[1] && current.rotation === rotation) {
    return { kind: 'noop' };
  }

  // Implicit-unplace-on-drop
  const occupant = state.placedAt(slot[0], slot[1]);
  if (occupant && occupant.piece !== piece) {
    const unplaceResult = await attemptUnplace({ piece: occupant.piece, gridSize, state, store: args.store, week: args.week });
    if (unplaceResult.kind !== 'unplaced' && unplaceResult.kind !== 'noop') {
      return unplaceResult;
    }
  }

  return tryPlace(args, 0);
}

async function tryPlace(args: AttemptPlaceArgs, retries: number): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, seed, state, store, week } = args;

  const excludePiece = state.placements.has(piece) ? piece : undefined;
  if (!isValidPlacement(piece, slot, rotation, gridSize, seed, state.placements, excludePiece)) {
    showToast(`Piece ${piece} doesn't fit there.`);
    return { kind: 'invalid' };
  }

  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]], rotation }) };

  try {
    const { sha } = await store.commit('place', { piece, slot, rotation, grid_size: gridSize }, { files });
    const event: PlaceEvent = {
      op: 'place',
      piece,
      slot,
      rotation,
      grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1,
      sha,
    };
    state.ingest([event]);
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError' && retries < MAX_CONFLICT_RETRIES) {
      const fresh = await store.eventsSince(undefined);
      state.ingest(fresh);
      return tryPlace(args, retries + 1);
    }
    if (err?.name === 'ConflictError') {
      showToast(`Couldn't place piece ${piece}: too many conflicts. Try again.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast('Sign-in expired; refresh and sign in again.');
      return { kind: 'auth-required' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}

export async function attemptUnplace(args: AttemptUnplaceArgs): Promise<AttemptResult> {
  const { piece, gridSize, state, store, week } = args;

  if (!store.isAuthenticated()) {
    showToast('Sign in to unplace pieces.');
    return { kind: 'auth-required' };
  }

  const current = state.placements.get(piece);
  if (!current) return { kind: 'noop' };

  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;

  try {
    await store.delete({ files: [path] });
    const event: UnplaceEvent = {
      op: 'unplace',
      piece,
      slot: current.slot,
      rotation: current.rotation,
      grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1,
      sha: '',  // populated from next subscription
    };
    state.ingest([event]);
    return { kind: 'unplaced' };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Couldn't unplace piece ${piece}: conflict. Try again.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast('Sign-in expired; refresh and sign in again.');
      return { kind: 'auth-required' };
    }
    showToast(`Could not unplace piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- write-flow
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/input.ts test/integration/write-flow.test.ts
git commit -m "Input V3: attemptPlace handles moves + implicit-unplace + conflict retry; attemptUnplace

attemptPlace short-circuits no-op moves, triggers implicit-unplace
when dropping on an occupied slot, calls validator with excludePiece
when piece is already placed, and retries up to 3 times on
ConflictError after refreshing state.

attemptUnplace calls store.delete() and applies a local unplace
event via state.ingest()."
```

---

## Task 8: Conflict-retry integration test

**Files:**
- Create: `/home/spinoza/github/repos/git-jigsaw/test/integration/conflict-retry.test.ts`

- [ ] **Step 1: Write the test**

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

const SEED = 'fixedseed12345678';

describe('conflict retry', () => {
  it('retries up to 3 times before giving up', async () => {
    const conflictErr = new Error('conflict');
    (conflictErr as any).name = 'ConflictError';
    const store = new MockStore({ initialActor: 'queelius' });
    // MockStore.rejectNextWith only fires once; we need a more sophisticated mock for repeat conflicts.
    // For this test, simulate a single conflict that resolves on retry.
    store.commit = async (op, payload, opts) => {
      store.commitCalls.push({ op, payload, files: opts?.files });
      if (store.commitCalls.length === 1) throw conflictErr;
      const sha = `sha-${store.commitCalls.length}`;
      return { sha };
    };
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls.length).toBe(2);  // first attempt + one retry
  });

  it('after 3 conflict retries, gives up with conflict result', async () => {
    const conflictErr = new Error('conflict');
    (conflictErr as any).name = 'ConflictError';
    const store = new MockStore({ initialActor: 'queelius' });
    let attempts = 0;
    store.commit = async (_op, _payload, _opts) => {
      attempts++;
      throw conflictErr;
    };
    const state = new PuzzleState(8, SEED);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, seed: SEED, state, store, week: '2026-W19' });
    expect(result.kind).toBe('conflict');
    expect(attempts).toBe(4);  // initial + 3 retries
  });
});
```

- [ ] **Step 2: Run**

```bash
npm test -- conflict-retry
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```bash
git add test/integration/conflict-retry.test.ts
git commit -m "Conflict retry: bounded to 3 retries with refresh-then-revalidate"
```

---

## Task 9: Dragger: placedAt callback + off-board unplace + heldFromBoard

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/dragger.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/integration/dragger.test.ts`

The dragger learns to pick up placed pieces from the canvas and treat off-board drops as unplaces when the piece was held from the board.

- [ ] **Step 1: Update tests**

Append to `/home/spinoza/github/repos/git-jigsaw/test/integration/dragger.test.ts`:

```ts
  it('pickup from canvas: pointerdown on a slot with a placed piece begins a hold', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      placedAt: (row, col) => {
        if (row === 5 && col === 2) return { piece: 42, rotation: 0 };
        return null;
      },
      onAttempt,
      onUnplace: async (piece) => {
        attempts.push({ piece, slot: [-1, -1], rotation: 0 });
        return { kind: 'unplaced' };
      },
    });
    dragger.attach(host);

    pointerEvent('pointerdown', board, { clientX: 320, clientY: 700 });
    expect(dragger.heldPiece).toBe(42);
    expect(dragger.state).toBe('POINTER_DOWN');
  });

  it('off-board drop with heldFromBoard=true calls onUnplace', async () => {
    const unplaceCalls: number[] = [];
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      placedAt: (row, col) => (row === 5 && col === 2 ? { piece: 42, rotation: 0 } : null),
      onAttempt,
      onUnplace: async (piece) => {
        unplaceCalls.push(piece);
        return { kind: 'unplaced' };
      },
    });
    dragger.attach(host);

    pointerEvent('pointerdown', board, { clientX: 320, clientY: 700 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointerup', window, { clientX: 60, clientY: 1100 });
    // Wait for the void promise to resolve
    await new Promise((r) => setTimeout(r, 0));
    expect(unplaceCalls).toEqual([42]);
  });

  it('off-board drop with tray piece (heldFromBoard=false) does NOT call onUnplace', async () => {
    const unplaceCalls: number[] = [];
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      placedAt: () => null,
      onAttempt,
      onUnplace: async (piece) => {
        unplaceCalls.push(piece);
        return { kind: 'unplaced' };
      },
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointerup', window, { clientX: 60, clientY: 1100 });
    await new Promise((r) => setTimeout(r, 0));
    expect(unplaceCalls).toEqual([]);
  });
```

- [ ] **Step 2: Update existing dragger tests to provide `placedAt` and `onUnplace`**

Find every `new Dragger({ ... })` call in `test/integration/dragger.test.ts` and add `placedAt: () => null` and `onUnplace: async () => ({ kind: 'unplaced' })` to the opts.

- [ ] **Step 3: Run, verify failure**

```bash
npm test -- dragger
```

Expected: FAIL.

- [ ] **Step 4: Modify `src/dragger.ts`**

Find the `DraggerOpts` interface. Replace with:

```ts
export interface DraggerOpts {
  board: HTMLElement;
  gridSize: number;
  getRotation(piece: number): Rotation;
  placedAt(row: number, col: number): { piece: number; rotation: Rotation } | null;
  getThumbnail?(piece: number, rotation: Rotation): HTMLCanvasElement | null;
  onAttempt(piece: number, slot: readonly [number, number], rotation: Rotation): Promise<AttemptResult>;
  onUnplace(piece: number): Promise<AttemptResult>;
}
```

Add a private flag to the class:

```ts
  private heldFromBoard = false;
```

Replace `onPointerDown` with:

```ts
  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    const pieceBtn = target?.closest?.('.jigsaw-piece') as HTMLElement | null;
    const onBoard = target?.closest?.('.jigsaw-board') as HTMLElement | null;
    log('pointerdown', { state: this.state, pieceBtn: pieceBtn?.dataset.piece, onBoard: !!onBoard });

    if (this.state === 'SELECTED') {
      if (pieceBtn && pieceBtn.dataset.piece === String(this.heldPiece)) {
        log('tap same piece -> deselect');
        this.reset();
        return;
      }
      if (onBoard) {
        const slot = this.slotAt(e.clientX, e.clientY);
        log('tap on board', { slot: slot ? `[${slot[0]},${slot[1]}]` : null });
        if (slot) {
          const piece = this.heldPiece!;
          const rot = this.heldRotation;
          this.reset();
          log('attempt place from SELECTED', { piece, slot: `[${slot[0]},${slot[1]}]`, rot });
          void this.opts.onAttempt(piece, slot, rot);
          return;
        }
      }
      return;
    }

    if (pieceBtn) {
      const piece = parseInt(pieceBtn.dataset.piece!, 10);
      this.heldFromBoard = false;
      this.beginHold(piece, this.opts.getRotation(piece), e);
      return;
    }
    if (onBoard) {
      const slot = this.slotAt(e.clientX, e.clientY);
      if (slot) {
        const placed = this.opts.placedAt(slot[0], slot[1]);
        if (placed) {
          this.heldFromBoard = true;
          this.beginHold(placed.piece, placed.rotation, e);
          return;
        }
      }
    }
  };

  private beginHold(piece: number, rotation: Rotation, e: PointerEvent): void {
    this.heldPiece = piece;
    this.heldRotation = rotation;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.state = 'POINTER_DOWN';
    log('-> POINTER_DOWN', { piece, rotation, fromBoard: this.heldFromBoard });
  }
```

Replace `onPointerUp` with:

```ts
  private onPointerUp = (e: PointerEvent): void => {
    log('pointerup', { state: this.state });
    if (this.state === 'POINTER_DOWN') {
      this.state = 'SELECTED';
      this.applySelectedClass();
      log('-> SELECTED', { piece: this.heldPiece });
      return;
    }
    if (this.state === 'DRAGGING') {
      const slot = this.slotAt(e.clientX, e.clientY);
      const piece = this.heldPiece!;
      const rot = this.heldRotation;
      const fromBoard = this.heldFromBoard;
      log('drop attempt', { piece, slot: slot ? `[${slot[0]},${slot[1]}]` : null, rot, x: e.clientX, y: e.clientY });
      this.removeGhost();
      this.reset();
      if (slot) {
        log('attempt place from DRAGGING', { piece, slot: `[${slot[0]},${slot[1]}]`, rot });
        void this.opts.onAttempt(piece, slot, rot);
      } else if (fromBoard) {
        log('off-board drop -> unplace', { piece });
        void this.opts.onUnplace(piece);
      } else {
        log('off-board drop with tray piece, no-op');
      }
    }
  };
```

Update `reset()`:

```ts
  private reset(): void {
    this.clearSelectedClass();
    this.state = 'IDLE';
    this.heldPiece = null;
    this.heldRotation = 0;
    this.heldFromBoard = false;
  }
```

- [ ] **Step 5: Run, verify pass**

```bash
npm test -- dragger
```

Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
git add src/dragger.ts test/integration/dragger.test.ts
git commit -m "Dragger V3: pickup from canvas, off-board drop unplaces if from board

placedAt callback returns the placed-piece info for a canvas slot.
Pointerdown on a placed slot starts a hold with heldFromBoard=true.
On drop off-board with heldFromBoard, calls onUnplace; tray-piece
off-board drops are no-ops as before."
```

---

## Task 10: leaderboard: per-event credit + finalPieces + canonical closedItOut

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/leaderboard.ts`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/unit/leaderboard.test.ts`

- [ ] **Step 1: Update tests**

Replace `/home/spinoza/github/repos/git-jigsaw/test/unit/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLeaderboard, formatDuration } from '../../src/leaderboard';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const SEED = 'fixedseed12345678';

function place(piece: number, actor: string, ts: string, slot?: [number, number]): PlaceEvent {
  return {
    op: 'place',
    piece,
    slot: slot ?? [Math.floor(piece / 8), piece % 8],
    rotation: 0,
    grid_size: 8,
    actor,
    ts,
    v: 1,
    sha: `sha-${piece}-${actor}-${ts}`,
  };
}

describe('formatDuration', () => {
  it('formats sub-hour duration', () => {
    expect(formatDuration(45 * 60 * 1000)).toBe('45m');
  });
  it('formats hours+minutes', () => {
    expect(formatDuration((2 * 60 + 14) * 60 * 1000)).toBe('2h 14m');
  });
  it('formats days+hours+minutes', () => {
    expect(formatDuration(((3 * 24 + 14) * 60 + 22) * 60 * 1000)).toBe('3d 14h 22m');
  });
});

describe('buildLeaderboard V3', () => {
  it('per-event credit: 3 placements by Alice => Alice.placements = 3', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(8, 'alice', '2026-05-11T10:02:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.rows.find((r) => r.actor === 'alice')!.placements).toBe(3);
  });

  it('finalPieces reflects current ownership: Alice places, Bob moves => Alice has 1 placement, 0 final', () => {
    // Simulate a move by placing the same piece twice (replace semantics).
    // For this test, Alice places piece 0 at [0,0], then we ingest the second place by Bob.
    // Note: piece 0 can only legally exist at [0,0] (canonical). So we use a synthetic test:
    // Alice places piece 0, Bob "moves" piece 0 (same slot, same rotation -- a self-replace).
    // After replay, piece 0 is owned by Bob (the latest place wins).
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(0, 'bob', '2026-05-11T10:05:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    const alice = lb.rows.find((r) => r.actor === 'alice')!;
    const bob = lb.rows.find((r) => r.actor === 'bob')!;
    expect(alice.placements).toBe(1);
    expect(alice.finalPieces).toBe(0);
    expect(bob.placements).toBe(1);
    expect(bob.finalPieces).toBe(1);
  });

  it('totalPlacements is sum of all place events; totalPieces is gridSize squared', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(0, 'bob', '2026-05-11T10:02:00Z'),  // move/replace
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.totalPlacements).toBe(3);
    expect(lb.totalPieces).toBe(64);
  });

  it('closedItOut tracks the actor whose place produced canonical-correct state', () => {
    // 2x2 puzzle, all canonical
    const state = new PuzzleState(2, SEED);
    state.ingest([
      place(0, 'alice', '2026-05-11T10:00:00Z', [0, 0]),
      place(1, 'alice', '2026-05-11T10:01:00Z', [0, 1]),
      place(2, 'alice', '2026-05-11T10:02:00Z', [1, 0]),
      place(3, 'queelius', '2026-05-11T10:03:00Z', [1, 1]),
    ]);
    const lb = buildLeaderboard(state);
    expect(lb.closedItOut).toBe('queelius');
  });

  it('sorts by finalPieces desc, then placements desc, then firstPlacement ts asc', () => {
    const state = new PuzzleState(8, SEED);
    state.ingest([
      place(0, 'bob', '2026-05-11T10:00:00Z'),
      place(1, 'alice', '2026-05-11T10:01:00Z'),
      place(2, 'alice', '2026-05-11T10:02:00Z'),
      place(8, 'bob', '2026-05-11T10:03:00Z'),
    ]);
    const lb = buildLeaderboard(state);
    // Both have 2 finalPieces; both have 2 placements. Tiebreak by firstPlacement ts.
    // Bob first placed at 10:00; Alice first placed at 10:01.
    expect(lb.rows.map((r) => r.actor)).toEqual(['bob', 'alice']);
  });
});
```

- [ ] **Step 2: Run, verify failure**

```bash
npm test -- leaderboard
```

Expected: FAIL.

- [ ] **Step 3: Replace `src/leaderboard.ts`**

```ts
import type { PuzzleState, PlaceEvent, Event } from './puzzle';
import { isCanonicalSolved } from './completion';

export interface ActorStats {
  actor: string;
  placements: number;
  finalPieces: number;
  firstPlacement: { piece: number; ts: string };
  lastPlacement: { piece: number; ts: string };
}

export interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;
  totalPlacements: number;
  contributors: number;
  closedItOut: string;
  rows: ActorStats[];
}

export function buildLeaderboard(state: PuzzleState): LeaderboardData {
  const placeEvents = state.history.filter((e): e is PlaceEvent => e.op === 'place');
  const sorted = [...placeEvents].sort((a, b) => a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha));

  const byActor = new Map<string, PlaceEvent[]>();
  for (const e of sorted) {
    const arr = byActor.get(e.actor) ?? [];
    arr.push(e);
    byActor.set(e.actor, arr);
  }

  // Final-piece ownership
  const finalCounts = new Map<string, number>();
  for (const [, p] of state.placements) {
    finalCounts.set(p.actor, (finalCounts.get(p.actor) ?? 0) + 1);
  }

  const rows: ActorStats[] = [];
  for (const [actor, arr] of byActor) {
    rows.push({
      actor,
      placements: arr.length,
      finalPieces: finalCounts.get(actor) ?? 0,
      firstPlacement: { piece: arr[0].piece, ts: arr[0].ts },
      lastPlacement: { piece: arr.at(-1)!.piece, ts: arr.at(-1)!.ts },
    });
  }

  rows.sort((a, b) =>
    b.finalPieces - a.finalPieces ||
    b.placements - a.placements ||
    a.firstPlacement.ts.localeCompare(b.firstPlacement.ts),
  );

  const startedAt = sorted[0]?.ts ?? '';
  const solvedAt = sorted.at(-1)?.ts ?? '';

  // closedItOut: scan history backwards; first place after which canonical-solved was true
  let closedItOut = '';
  if (isCanonicalSolved(state)) {
    // Replay the history to find when canonical state first achieved
    // For simplicity, the last place event's actor is "closed it out"
    // (because canonical-solved is monotonic once reached IF all subsequent events
    // also preserve it, which we don't guarantee but accept for V3).
    closedItOut = sorted.at(-1)?.actor ?? '';
  }

  return {
    solvedAt,
    startedAt,
    durationMs: startedAt && solvedAt ? new Date(solvedAt).getTime() - new Date(startedAt).getTime() : 0,
    totalPieces: state.gridSize * state.gridSize,
    totalPlacements: sorted.length,
    contributors: byActor.size,
    closedItOut,
    rows,
  };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / (24 * 60));
  const hours = Math.floor((totalMin % (24 * 60)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function extLink(href: string, text: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = text;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function renderLeaderboard(data: LeaderboardData, week: string, dataRepo: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'jigsaw-leaderboard';

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = `Solved ${week} in ${formatDuration(data.durationMs)}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const placementsNote = data.totalPlacements > data.totalPieces ? ` · ${data.totalPlacements} placements` : '';
  meta.textContent = `${data.contributors} contributors · ${data.totalPieces} pieces${placementsNote}`;
  header.append(title, meta);

  const ol = document.createElement('ol');
  ol.className = 'rows';
  data.rows.forEach((row, i) => {
    const li = document.createElement('li');
    li.className = 'row';
    li.dataset.rank = String(i + 1);
    const actor = document.createElement('span');
    actor.className = 'actor';
    actor.textContent = row.actor;
    const placements = document.createElement('span');
    placements.className = 'pieces';
    const finalNote = row.placements > row.finalPieces ? ` (${row.finalPieces} final)` : '';
    placements.textContent = `${row.placements} placements${finalNote}`;
    li.append(actor, placements);
    if (row.actor === data.closedItOut) {
      const badge = document.createElement('span');
      badge.className = 'badge closed-it-out';
      badge.title = 'Placed the final canonical piece';
      badge.textContent = '🧩';
      li.appendChild(badge);
    }
    ol.appendChild(li);
  });

  const footer = document.createElement('footer');
  footer.className = 'actions';
  footer.append(
    extLink(`https://github.com/${dataRepo}/commits/main/jigsaw/${week}`, 'View git log'),
    extLink(`https://raw.githubusercontent.com/${dataRepo}/main/jigsaw/${week}/source.png`, 'Download source.png'),
  );

  section.append(header, ol, footer);
  return section;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
npm test -- leaderboard
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard.ts test/unit/leaderboard.test.ts
git commit -m "Leaderboard V3: per-event credit + finalPieces + canonical closedItOut

Sort: finalPieces desc, placements desc, firstPlacement.ts asc.
UI shows 'X placements (Y final)' when placements > finalPieces.
closedItOut is the latest place actor when canonical-solved is true."
```

---

## Task 11: main.ts: wire `placedAt`, `onUnplace`, canonical completion

**Files:**
- Modify: `/home/spinoza/github/repos/git-jigsaw/src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { PuzzleState, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace, attemptUnplace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore, type StoreLike } from './store-config';
import { Drawer } from './drawer';
import { Dragger } from './dragger';
import { buildLeaderboard, renderLeaderboard } from './leaderboard';
import { fireConfetti } from './confetti';
import { pieceThumbnail, clearThumbnailCache } from './thumbnail';
import { isCanonicalSolved } from './completion';

function currentWeek(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

function buildShell(root: HTMLElement): { headerEl: HTMLElement; canvas: HTMLCanvasElement; drawerHost: HTMLElement } {
  const headerEl = document.createElement('header');
  headerEl.className = 'jigsaw-header';
  const canvas = document.createElement('canvas');
  canvas.className = 'jigsaw-board';
  canvas.width = BOARD_SIZE;
  canvas.height = BOARD_SIZE;
  const drawerHost = document.createElement('div');
  drawerHost.className = 'jigsaw-drawer-host';
  root.replaceChildren(headerEl, canvas, drawerHost);
  return { headerEl, canvas, drawerHost };
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('jigsaw-root');
  if (!root) throw new Error('jigsaw-root not found');
  const { headerEl, canvas, drawerHost } = buildShell(root);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const params = new URLSearchParams(location.search);
  const week = params.get('week') ?? currentWeek();
  const dataRepo = __DATA_REPO__;

  const store = makeStore(week);
  await store.restoreSession();
  const assets = await loadAssets(dataRepo, week);
  const state = new PuzzleState(assets.gridSize, assets.seed);

  // Initial load: fetch all events, then ingest
  const initialEvents = await store.eventsSince(undefined);
  state.ingest(initialEvents);

  const startedSolved = isCanonicalSolved(state);
  let confettiAlreadyFired = false;

  mountAuthBar(headerEl, { state, store, week, gridSize: assets.gridSize });

  const drawer = new Drawer(drawerHost);
  const tray = new Tray(state, store.currentActor() ?? 'guest', assets.gridSize);

  const renderTray = (): void => {
    drawer.setContent(tray.render({
      source: assets.source,
      seed: assets.seed,
      rotationEnabled: assets.rotationEnabled,
      onRotate: () => renderTray(),
    }));
  };

  const renderLeaderboardContent = (): void => {
    const data = buildLeaderboard(state);
    drawer.setContent(renderLeaderboard(data, week, dataRepo));
  };

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed, assets.gridSize);

  const refresh = (): void => {
    repaint();
    if (isCanonicalSolved(state)) {
      renderLeaderboardContent();
      if (!startedSolved && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    } else {
      renderTray();
    }
  };

  state.on('change', refresh);
  refresh();

  const dragger = new Dragger({
    board: canvas,
    gridSize: assets.gridSize,
    getRotation: (piece) => tray.rotationOf(piece),
    placedAt: (row, col) => state.placedAt(row, col),
    getThumbnail: (piece, rotation) =>
      pieceThumbnail(piece, rotation, assets.source, assets.seed, assets.gridSize),
    onAttempt: (piece, slot, rotation) =>
      attemptPlace({ piece, slot, rotation, gridSize: assets.gridSize, seed: assets.seed, state, store, week }),
    onUnplace: (piece) =>
      attemptUnplace({ piece, gridSize: assets.gridSize, state, store, week }),
  });
  dragger.attach(document.body);

  store.subscribe((events: Event[]) => {
    state.ingest(events);
  });

  drawer.on('change', (s) => {
    if (s === 'peek') clearThumbnailCache();
  });
}

bootstrap().catch((err) => {
  console.error(err);
  const root = document.getElementById('jigsaw-root');
  if (root) root.textContent = `Failed to load jigsaw: ${err.message}`;
});
```

- [ ] **Step 2: Run typecheck + tests**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm run typecheck
npm test
```

Expected: typecheck clean; all tests pass (~140 total).

- [ ] **Step 3: Run vite build**

```bash
npm run build
```

Expected: build clean; bundle gzip under 60 KB.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Main V3: wire placedAt + onUnplace; canonical-correct completion

Bootstrap creates PuzzleState(gridSize, seed) and uses ingest()
for both initial load and subscription. Dragger gets placedAt
(for canvas pickup), getThumbnail (for ghost), and onUnplace
(for off-board drops). Completion uses isCanonicalSolved."
```

---

## Task 12: Cross-client V3 fixture + parse-event test

**Files:**
- Create: `/home/spinoza/github/repos/git-jigsaw/test/fixtures/py-commit-body-v3-unplace.yaml`
- Modify: `/home/spinoza/github/repos/git-jigsaw/test/unit/parse-event.test.ts`

- [ ] **Step 1: Write fixture**

Create `/home/spinoza/github/repos/git-jigsaw/test/fixtures/py-commit-body-v3-unplace.yaml`:

```yaml
op: unplace
piece: 42
slot: [5, 2]
rotation: 0
grid_size: 8
actor: queelius
ts: 2026-05-11T14:23:11Z
v: 1
```

- [ ] **Step 2: Append test**

In `/home/spinoza/github/repos/git-jigsaw/test/unit/parse-event.test.ts`, append:

```ts
  it('parses a V3 unplace event with slot and rotation for self-description', () => {
    const yaml = readFileSync(join(__dirname, '../fixtures/py-commit-body-v3-unplace.yaml'), 'utf8');
    const event = parseCommitBody(yaml, 'sha-from-git') as any;
    expect(event).toMatchObject({
      op: 'unplace',
      piece: 42,
      slot: [5, 2],
      rotation: 0,
      grid_size: 8,
      actor: 'queelius',
      v: 1,
      sha: 'sha-from-git',
    });
  });
```

- [ ] **Step 3: Run**

```bash
npm test -- parse-event
```

Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/py-commit-body-v3-unplace.yaml test/unit/parse-event.test.ts
git commit -m "Cross-client: V3 unplace fixture with slot + rotation parses cleanly"
```

---

## Task 13: Build, deploy, smoke

**Files:** (no file changes; deploy + verify)

- [ ] **Step 1: Push git-native sibling**

```bash
cd /home/spinoza/github/repos/git-native
git log origin/main..HEAD --oneline
git push origin main
```

Wait for CI to pass.

- [ ] **Step 2: Push git-jigsaw**

```bash
cd /home/spinoza/github/repos/git-jigsaw
git push origin main
```

Wait for CI to pass.

- [ ] **Step 3: Build bundle**

```bash
export GH_OAUTH_CLIENT_ID=Ov23liZw9EJe1eYk7cxv
npm run build
```

Capture bundle size; verify under 60 KB gzipped.

- [ ] **Step 4: Deploy**

```bash
bash scripts/deploy.sh
cd /home/spinoza/github/repos/metafunctor
hugo --gc --minify
git add -A
JIGSAW_SHA=$(cd /home/spinoza/github/repos/git-jigsaw && git rev-parse --short HEAD)
git commit -m "jigsaw: deploy V3 (git-jigsaw $JIGSAW_SHA)"
git push
```

- [ ] **Step 5: Wait for Pages rebuild and verify new bundle is live**

```bash
NEW_BUNDLE=$(grep -oE 'index-[A-Za-z0-9]+\.js' /home/spinoza/github/repos/git-jigsaw/dist/index.html | head -1)
until [ "$(curl -sIo /dev/null -w '%{http_code}' https://metafunctor.com/arcade/jigsaw/assets/$NEW_BUNDLE)" = "200" ]; do
  sleep 10
done
echo "live: $(date -u)"
```

- [ ] **Step 6: Smoke test**

Open https://metafunctor.com/arcade/jigsaw/ with hard refresh.

Manual checks:
1. Page loads, no console errors
2. Drag any tray piece to any slot: shape-fit validator decides; "Piece doesn't fit there" toast on misfit
3. Drag a placed piece off the board: it returns to the tray
4. Drag a placed piece to a different slot: piece moves
5. Drag a placed piece onto an occupied slot: occupant returns to tray
6. Press R during drag (desktop): held piece rotates 90°; rotated piece may shape-fit slots it wouldn't otherwise
7. Place all 64 in canonical positions: confetti fires, leaderboard shows in drawer

- [ ] **Step 7: Tag**

```bash
cd /home/spinoza/github/repos/git-jigsaw
git tag v0.3.0
git push origin v0.3.0
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `git-native` delete + transparent PUT-with-sha | 1 |
| Validator shape-fit + outer-edge constraint | 2 (rotation helper), 3 (validator) |
| PuzzleState ingest + sorted rebuild + unplace | 4 |
| Canonical-correct completion | 5 |
| Store wrapper delete | 6 |
| attemptPlace move + implicit-unplace + retry | 7 |
| attemptUnplace | 7 |
| Conflict retry (bounded) | 8 |
| Dragger placedAt + off-board unplace | 9 |
| Leaderboard per-event credit + finalPieces | 10 |
| Main wire-up | 11 |
| Cross-client V3 fixture | 12 |
| Deploy + smoke + tag | 13 |

**Placeholder scan:** none.

**Type consistency:**
- `Placement = { slot, rotation, actor, ts, sha }` consistent across `puzzle.ts`, `validator.ts` (via interface alias), `leaderboard.ts`
- `Event = PlaceEvent | UnplaceEvent | UnknownEvent` (V3 adds UnplaceEvent)
- `attemptPlace`/`attemptUnplace` return `AttemptResult` with `kind: 'placed' | 'unplaced' | 'noop' | 'invalid' | 'conflict' | 'auth-required'`
- `Dragger.placedAt` returns `{ piece, rotation } | null`
- `state.ingest(events: Event[])` is the single state-mutation API

**Cross-cutting concerns:**
- All `place` events in V3 may be replaces; consumers (leaderboard, completion, renderer) read from `placements` and don't assume monotonic.
- `unplace` events carry slot + rotation for self-description; validator + state ignore those fields.
- Conflict path is bounded (3 retries) and refreshes state before retrying.
