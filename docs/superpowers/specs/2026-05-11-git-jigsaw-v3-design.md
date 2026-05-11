---
date: 2026-05-11
author: Alexander Towell (queelius)
status: design, awaiting user review
type: app-design
---

# Spec: git-jigsaw V3 (real-jigsaw shape-fit + unplace + rotation as tool)

V3 changes the validator from strict-identity to **shape-fit semantics**. A piece can be placed at any empty slot whose placed neighbors' facing edges interlock. Rotation becomes a real tool (rotating a piece makes it fit slots it wouldn't fit at rotation 0). Pieces can be unplaced (returned to tray) or moved (placed at a new slot). Completion is canonical-correct (every piece at its canonical slot, rotation 0). The leaderboard credits per-event placements + tracks current ownership.

## Goal

V2 enforced strict piece-id-equals-slot-id matching. The puzzle's main interaction reduced to "drag piece N anywhere, it goes to slot [N//8, N%8]". There was no puzzle. V3 makes it a real jigsaw: shape determines fit, image determines correctness, the user makes both judgments.

## Non-goals (V3)

- Swap as a new wire-format primitive (handled at the app layer via implicit-unplace-on-drop)
- Mid-drag rotation on mobile (pre-rotate in tray; R-key is desktop-only)
- Visual signal for "wrong piece in shape-fit slot" (the image itself is the signal)
- Time travel / undo beyond unplace (single-step; multi-step replay deferred)
- Chat or in-puzzle communication (deferred to a separate brainstorm)
- Aliases / display name override (auth-side concern; deferred)

## Architecture & file impact

V3 is a validator + wire-format change. Most V2 modules are unchanged. Changes:

| File | Change |
|---|---|
| `src/validator.ts` | New shape-fit signature; outer-edge constraint; rotation arithmetic |
| `src/puzzle.ts` | `ingest()` replaces `applyEvent` as public API; internal sorted replay; `unplace` handling; per-event credit history |
| `src/input.ts` | `attemptPlace` handles moves + implicit-unplace-on-drop; bounded conflict retry; new `attemptUnplace` |
| `src/dragger.ts` | `placedAt` callback for hit-test on canvas; `onUnplace` callback; off-board drop semantics |
| `src/main.ts` | Wire `placedAt`/`onUnplace`; canonical-correct completion check |
| `src/leaderboard.ts` | `ActorStats` gains `finalPieces`; new sort order; "closed it out" tracks canonical completion |
| `src/tray.ts` | Unchanged (still returns DOM grid) |
| `src/renderer.ts` | Unchanged (still paints `state.placements`) |
| `src/shapes.ts` | Unchanged |
| `src/confetti.ts`, `src/drawer.ts`, etc. | Unchanged |

Cross-repo change: `git-native` (TypeScript sibling) needs `GitHubAdapter.delete()` (DELETE via Contents API) and `commit()` becomes transparent about PUT-with-sha-vs-PUT-without. App-layer `commit()` signature is unchanged.

## V3 wire format

### `place` event (semantic change, no schema change)

```yaml
op: place
piece: 42
slot: [5, 2]
rotation: 0
grid_size: 8
actor: queelius
ts: 2026-05-11T12:34:56Z
v: 1
```

**Semantic change**: a `place` event for a piece that is already placed elsewhere REPLACES the prior placement. The renderer reflects the latest placement; the leaderboard counts each event in `history`.

### `unplace` event (NEW)

```yaml
op: unplace
piece: 42
slot: [5, 2]
rotation: 0
grid_size: 8
actor: queelius
ts: 2026-05-11T12:34:56Z
v: 1
```

`slot` and `rotation` carry the state being undone (self-describing; renderer/audit-tooling can use; validator ignores).

### File-side semantics

`placements/<NNN>.json` per piece. PUT same path with sha = update (move/replace). PUT without sha = create. DELETE = unplace.

`GitHubAdapter` handles the sha lookup transparently:

```ts
// app code stays simple
await store.commit('place', { piece, slot, rotation, grid_size }, { files: { ... } });
await store.delete({ files: ['jigsaw/2026-W19/placements/042.json'] });

// inside GitHubAdapter.commit():
// for each file, GET the path; if 200, PUT with sha; if 404, PUT without sha
// inside GitHubAdapter.delete():
// GET path for sha; DELETE with sha
```

`GitHostAdapter` Protocol grows by one method (`delete`). Existing `commit` keeps its signature.

### Backwards compat with V2 commits

Existing V2 placements (the 64 commits in `metafunctor-data/jigsaw/2026-W19/placements/`) all validate cleanly under V3 (canonical placements always shape-fit because shapes derive from canonical coordinates). No re-commit needed.

## Validator (shape-fit)

### Signature

```ts
isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270,
  gridSize: number,
  seed: string,
  placements: ReadonlyMap<number, Placement>,
  excludePiece?: number,
): boolean
```

### Algorithm

1. Sanity: piece ∈ [0, gridSize²), slot row/col ∈ [0, gridSize), rotation ∈ {0,90,180,270}, gridSize ≥ 2
2. Slot occupancy: if any piece (excluding `excludePiece`) occupies the target slot, return false
3. Piece dedup: if piece is in `placements` and piece ≠ `excludePiece`, return false
4. For each cardinal direction (N, E, S, W) from the target slot:
   - Compute the neighbor slot
   - If the neighbor is outside the grid:
     - The piece's edge facing that direction (after applying `rotation` to the piece's canonical shape) MUST be flat (sign 0). Otherwise return false.
   - If the neighbor is inside the grid but empty:
     - The piece's edge facing that direction MUST be tab or blank (sign != 0). Otherwise return false. (Outer-edge constraint: a flat edge must face the puzzle boundary.)
   - If the neighbor is occupied by piece N (and N ≠ `excludePiece`):
     - The piece's edge facing N (after rotation) and N's edge facing the candidate (after N's rotation) must sum to 0 (tab-into-blank or blank-into-tab).

5. If all checks pass, return true.

### Rotation arithmetic

```ts
function rotatedShape(shape: PieceShape, rotation: 0 | 90 | 180 | 270): PieceShape {
  const e = [shape.N, shape.E, shape.S, shape.W];
  const turns = rotation / 90;
  return {
    N: e[(0 - turns + 4) % 4],
    E: e[(1 - turns + 4) % 4],
    S: e[(2 - turns + 4) % 4],
    W: e[(3 - turns + 4) % 4],
  } as PieceShape;
}
```

Tab/blank sign is **preserved** across rotation (a tab is a tab regardless of which face it's on). Sign arithmetic happens only at edge-pair comparison: two pieces' facing edges must sum to 0.

### Outer-edge constraint (rule 4 sub-bullet)

Two interpretations of "a flat edge must face the puzzle boundary":

**(a) Strict**: a flat edge ONLY faces the boundary. Equivalently: every edge facing an interior direction (toward the inside of the puzzle, regardless of whether the neighbor slot is currently occupied) must be tab or blank.

**(b) Lenient**: a flat edge facing an empty interior slot is permitted; it just can't ever match an interior piece. Allows lock-in.

V3 picks **(a)**: interior pieces (4 tab/blank edges) cannot go on outer slots at any rotation; edge pieces (1 flat edge) only fit on edges where the flat side faces outward; corner pieces (2 flat edges) only fit in corners at exactly one orientation.

### Why this is principled

Every piece has a "shape signature" (which edges are flat, which are tab, which are blank). The shape signature is derived from the canonical position. The outer-edge constraint says: a piece can only be placed at a slot whose boundary topology matches the piece's flat-edge topology. Interior pieces (4 non-flat) match interior slots (0 flat directions). Edge pieces (1 flat) match edge slots (1 flat direction). Corners (2 flat) match corner slots (2 flat directions).

This collapses lock-in scenarios at the validator level. The user can never place an edge piece in the interior (where its flat edge would face an empty neighbor and prevent that neighbor from ever being filled).

## PuzzleState

### Internal state

```ts
interface Placement {
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  actor: string;
  ts: string;
  sha: string;
}

class PuzzleState {
  readonly placements = new Map<number, Placement>();
  readonly contributors = new Set<string>();
  readonly history: Event[] = [];          // includes both place and unplace (audit)
  private readonly eventLog: Event[] = [];

  constructor(
    public readonly gridSize: number,
    public readonly seed: string,
  ) {}

  placedAt(row: number, col: number): { piece: number; rotation: 0|90|180|270 } | null {
    for (const [piece, p] of this.placements) {
      if (p.slot[0] === row && p.slot[1] === col) {
        return { piece, rotation: p.rotation };
      }
    }
    return null;
  }

  get placedCount(): number { return this.placements.size; }

  isPlaced(piece: number): boolean { return this.placements.has(piece); }

  ingest(newEvents: Event[]): void {
    this.eventLog.push(...newEvents);
    this.rebuild();
  }

  // ... change listener, emit ...
}
```

### Rebuild-on-ingest

```ts
private rebuild(): void {
  const sorted = [...this.eventLog].sort((a, b) =>
    a.ts.localeCompare(b.ts) || a.sha.localeCompare(b.sha)
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
  // grid_size filter (applies to all op types)
  const eventGrid = (event as Record<string, unknown>).grid_size;
  if (typeof eventGrid !== 'number' || eventGrid !== this.gridSize) return;

  if (event.op === 'place') {
    const piece = /* extract + typecheck */;
    const slot = /* extract + typecheck */;
    const rotation = /* extract + typecheck */;
    if (piece === undefined || slot === undefined || rotation === undefined) return;
    const excludePiece = this.placements.has(piece) ? piece : undefined;
    if (!isValidPlacement(piece, slot, rotation, this.gridSize, this.seed, this.placements, excludePiece)) return;
    this.placements.set(piece, { slot, rotation, actor: event.actor, ts: event.ts, sha: event.sha });
    this.contributors.add(event.actor);
    this.history.push(event);
  } else if (event.op === 'unplace') {
    const piece = /* extract + typecheck */;
    if (piece === undefined) return;
    if (!this.placements.has(piece)) return;
    this.placements.delete(piece);
    this.history.push(event);
  }
  // unknown ops: ignored
}
```

Rebuild on every batch is O(N log N) where N ≤ ~256 for 8x8. Trivial.

### Move detection in replay

The `excludePiece` is computed locally per event: if `placements.has(event.piece)` after partial replay, the event is a move, and the validator uses `excludePiece = event.piece` so the prior placement doesn't block.

## Input flow

### `attemptPlace` (handles place, move, implicit-unplace-on-drop, conflict retry)

```ts
export async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, rotation, gridSize, seed, state, store, week } = args;

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
    const unplaceResult = await attemptUnplace({ piece: occupant.piece, gridSize, state, store, week });
    if (unplaceResult.kind !== 'unplaced') return unplaceResult;
  }

  return tryPlace(args, 0);
}

async function tryPlace(args: AttemptPlaceArgs, retries: number): Promise<AttemptResult> {
  const excludePiece = state.placements.has(piece) ? piece : undefined;
  if (!isValidPlacement(piece, slot, rotation, gridSize, seed, state.placements, excludePiece)) {
    showToast(`Piece doesn't fit there.`);
    return { kind: 'invalid' };
  }

  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]], rotation }) };

  try {
    const { sha } = await store.commit('place', { piece, slot, rotation, grid_size: gridSize }, { files });
    state.ingest([{
      op: 'place', piece, slot, rotation, grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1, sha,
    }]);
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError' && retries < 3) {
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
```

### `attemptUnplace` (new)

```ts
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
    state.ingest([{
      op: 'unplace', piece, slot: current.slot, rotation: current.rotation,
      grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1, sha: '',  // store.delete doesn't return a sha; populate from next subscription
    }]);
    return { kind: 'unplaced' };
  } catch (err: any) {
    // Same error handling shape as attemptPlace; refresh+retry on conflict
    /* ... */
  }
}
```

## Dragger

### `placedAt` and `onUnplace` callbacks

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

### Pickup-from-board

```ts
private onPointerDown = (e: PointerEvent): void => {
  const target = e.target as HTMLElement | null;
  const trayBtn = target?.closest?.('.jigsaw-piece') as HTMLElement | null;
  const onBoard = target?.closest?.('.jigsaw-board') as HTMLElement | null;

  // SELECTED branch unchanged from V2

  if (trayBtn) {
    const piece = parseInt(trayBtn.dataset.piece!, 10);
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
```

### Drop semantics

```ts
private onPointerUp = (e: PointerEvent): void => {
  if (this.state === 'POINTER_DOWN') {
    this.state = 'SELECTED';
    this.applySelectedClass();
    return;
  }
  if (this.state === 'DRAGGING') {
    const piece = this.heldPiece!;
    const rot = this.heldRotation;
    const fromBoard = this.heldFromBoard;
    this.removeGhost();
    const slot = this.slotAt(e.clientX, e.clientY);
    this.reset();
    if (slot) {
      void this.opts.onAttempt(piece, slot, rot);
    } else if (fromBoard) {
      void this.opts.onUnplace(piece);
    }
    // else: tray piece dragged off-board, no-op
  }
};
```

### Rotation during drag (R-key only)

Mid-drag rotation via the R-key on desktop is preserved from V2. The "rotate button on ghost" idea from V3 §4 is dropped: it's unreachable on mobile (button is outside the finger contact patch). Mobile users pre-rotate in the tray; mid-drag rotation is desktop-only.

## Completion + leaderboard

### Canonical-correct check

```ts
function isCanonicalSolved(state: PuzzleState): boolean {
  if (state.placedCount !== state.gridSize * state.gridSize) return false;
  for (const [piece, p] of state.placements) {
    const canonRow = Math.floor(piece / state.gridSize);
    const canonCol = piece % state.gridSize;
    if (p.slot[0] !== canonRow || p.slot[1] !== canonCol) return false;
    if (p.rotation !== 0) return false;
  }
  return true;
}
```

Replaces V2's `isSolved`. The local-witness pattern (capture `startedSolved` at bootstrap, fire confetti once on transition `false → true`) is unchanged.

### Leaderboard

```ts
interface ActorStats {
  actor: string;
  placements: number;        // count of place events in history
  finalPieces: number;       // count of currently-owned placements
  firstPlacement: { piece: number; ts: string };
  lastPlacement: { piece: number; ts: string };
}

interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;       // gridSize²
  totalPlacements: number;   // sum of all place events in history
  contributors: number;
  closedItOut: string;       // actor of latest place event that produced canonical-correct state
  rows: ActorStats[];
}
```

Sort: `finalPieces` desc, `placements` desc, `firstPlacement.ts` asc.

`closedItOut`: scan history backwards; first `place` event after which `isCanonicalSolved` was true.

UI label changes:
- Meta line: "12 contributors · 64 pieces · 87 placements" (only show "X placements" when > totalPieces)
- Row: "queelius: 18 placements (12 final)" (only show "(N final)" when placements > finalPieces)
- Solved/work distinction is visible at a glance.

## Testing

### Unit (`test/unit/`)

**validator.test.ts** (extend V2 set):
- Shape-fit accepts canonical placement
- Shape-misfit rejects tab-to-tab
- Outer-edge: interior piece on edge fails all rotations
- Outer-edge: edge piece on edge with flat outward passes
- Outer-edge: corner piece in corner at correct orientation passes
- Empty-neighbor: piece with no neighbors validates if no flat edges face interior
- `excludePiece`: move from S1 to S2 passes when only blocker is piece itself
- Slot occupied by different piece: fails

**puzzle.test.ts** (extend V2 set):
- `ingest([place])` accepts valid
- `ingest([place, unplace])` produces empty
- `ingest([place, place_different_slot])` produces single placement at second slot
- Out-of-order ingest sorted by ts
- `history` contains both ops; leaderboard filters

**leaderboard.test.ts** (extend V2 set):
- Per-event credit: 3 placements by Alice → Alice.placements = 3
- `finalPieces` reflects current ownership: Alice places, Bob moves → Alice has 1 placement, 0 final
- `closedItOut` reflects last canonical-completing actor

### Integration (`test/integration/`)

**write-flow.test.ts** (extend):
- `attemptUnplace` happy path
- Implicit-unplace-on-drop scenario (drop on occupied → 2 commits)

**conflict-retry.test.ts** (new):
- MockStore rejects first commit with ConflictError, returns fresh events, succeeds on retry
- Bounded retry (3 iterations max; 4th attempt gives up)

**dragger.test.ts** (extend):
- `placedAt` callback consulted on canvas pointerdown
- Off-board drop with `heldFromBoard=true` triggers `onUnplace`

### E2E (manual smoke after deploy)

- Canonical-correct triggers confetti + leaderboard
- Filled-but-wrong does NOT
- Move wrong piece to correct slot triggers confetti
- Drag off-board unplaces
- Drag onto occupied slot implicit-unplaces occupant
- Two browsers racing on same piece: one wins, other retries

## Risks

- **Implicit-unplace failure mode**: drop on occupied → unplace succeeds, place fails (validator rejects, e.g., shape doesn't fit at new slot). The original occupant has been kicked to the tray. User sees the occupant return to the tray and the held piece bounce back. Acceptable failure: the user can re-place the occupant. Worst case: bad-actor griefing by intentionally dropping bad pieces on good ones. Mitigation: rate-limit at the GitHub API level (already capped by per-token rate limits).
- **Conflict retry bound (3) under heavy multi-client write**: in pathological scenarios (e.g., 10 users racing on one piece), most users see "couldn't place; try again." Acceptable; the rate-limited substrate is being asked to do something it's not designed for.
- **`unplace.sha = ''` until next subscription**: the synthesized local event after a successful delete has an empty sha (DELETE doesn't return a sha). On rebuild, sort-by-(ts, sha) will tie-break by empty string. Practical impact: subscription-delivered version of the same event will overwrite (re-rebuild) and the sha will be populated. Brief inconsistency only.
- **Outer-edge constraint catches some legitimate-feeling placements**: an edge piece dragged near the interior to "set it aside" can't be placed there. User must keep edge pieces on the edge. Different from a real physical jigsaw where you can put edge pieces anywhere. Trade-off: prevents lock-in, costs the "scratch space" feel. Acceptable for V3.
- **Move credit can be gamed**: a user can pad their leaderboard count by repeatedly moving a piece between slots. The no-op detection (same slot + rotation) prevents the trivial case; multi-slot moves are still credited. Acceptable in V3; not worth designing against without observed griefing.

## Out of scope (explicit)

- Swap as wire-format primitive
- Mid-drag rotation on mobile
- Visual signal for misplaced pieces beyond the image itself
- Time-travel / multi-step undo
- Chat / comments
- Aliases / display name override
- Cross-week meta-stats
- Submodule operations
- Multi-puzzle archive UI
- Hosted OAuth Worker
- Custom git host adapters beyond GitHub
