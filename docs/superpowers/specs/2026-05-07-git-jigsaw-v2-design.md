---
date: 2026-05-07
author: Alexander Towell (queelius)
status: design, awaiting user review
type: app-design
---

# Spec: git-jigsaw V2 (playable game)

V2 turns the V1 protocol demo into an actual jigsaw puzzle: image-fragment thumbnails, drag-and-drop, snap-to-slot, rotation, variable difficulty per puzzle, and a completion leaderboard built from the commit log.

## Goal

V1 demonstrated the substrate (every placement is a git commit, conflicts retry, the log is the record). It works end-to-end at metafunctor.com/arcade/jigsaw, but the user experience is a debug UI: numbered tray buttons that auto-place to their predetermined slot. V2 closes the gap between "protocol works" and "this is a jigsaw puzzle."

## Non-goals

- Chat / comments (V3 brainstorm)
- Aliases or display-name flexibility (V3 brainstorm)
- Cross-week meta-stats, weekly winner badges, all-time leaderboard (V4+)
- Live during-play leaderboard (revisit only if the completion-only feel falls flat)
- Pinch-zoom inside the canvas (use browser-native page zoom)
- Hosted OAuth Worker / smoother sign-in flow (V1 stance preserved)
- Mobile-native multi-touch rotate gestures (single-finger rotate-via-tap only)

## Architecture & file impact

V2 is a rework of the rendering and input layers plus an additive wire-format extension. The protocol library (`git-native`), the data substrate (`metafunctor-data`), the deploy pipeline, and the auth path are unchanged.

**Files modified:**

| File | Change |
|---|---|
| `src/validator.ts` | Drop hardcoded `GRID_SIZE`. `isValidPlacement(piece, slot, rotation, gridSize)`. |
| `src/shapes.ts` | `tabPattern(seed, row, col, edge, gridSize)` parameterized. |
| `src/puzzle.ts` | `PlaceEvent` adds `grid_size`, `rotation`. State holds rotation per placed piece and a `validEvents` log. `applyEvent` validates against the puzzle's gridSize. |
| `src/renderer.ts` | `paintBoard(ctx, state, source, seed, gridSize, rotationEnabled)`. Pieces drawn at their committed rotation. |
| `src/tray.ts` | Per-actor shuffle parameterized by gridSize. |
| `src/read-flow.ts` | `loadAssets` parses `grid_size` and `rotation` from `meta.yaml`. |
| `src/input.ts` | `attemptPlace` accepts a rotation argument. |
| `src/main.ts` | Drawer lifecycle, completion detection, confetti trigger, sign-out wiring. |
| `src/auth-bar.ts` | Actor name becomes a clickable button with a sign-out popover. |

**New files:**

| File | Responsibility |
|---|---|
| `src/drawer.ts` | Bottom-sheet drawer with peek / half / full states; gesture resize on touch; hosts either tray or leaderboard depending on solved state. |
| `src/thumbnail.ts` | Renders one piece thumbnail to an OffscreenCanvas (jigsaw clip + rotation), keyed cache. |
| `src/dragger.ts` | Pointer-event state machine for drag and tap-select; ghost-piece overlay; R-key handling; bounce-back animation. |
| `src/leaderboard.ts` | Reads `state.validEvents` into per-actor stats; renders the leaderboard panel. |
| `src/confetti.ts` | Tiny canvas-particle burst, fires on local-witness completion. |
| `src/sign-in-menu.ts` | Renamed from V1's `sign-in-modal.ts`; now also hosts the sign-out popover. |

**Files unchanged:** `src/store-config.ts`, `src/parse-event.ts`, `src/toast.ts`, `src/env.d.ts`.

**Cron change in `metafunctor-data`:** `tools/src/jigsaw_tools/generate_puzzle.py` decides `grid_size` (rotated through a list per ISO week or randomized) and `rotation: bool`. Both go into `meta.yaml` and into the `seed_puzzle` commit body.

**Estimated size:** V1 was 693 LOC. V2 adds roughly 400 to 500 LOC across new files and modifies roughly 250 in existing ones. Bundle target: under 60 KB gzipped (V1 is 38 KB).

## Wire-format changes

This is an *additive minor* change. `v: 1` stays. Old parsers ignoring the new fields still treat the event as valid; the protocol's "minor changes are additive" rule covers this.

### V2 `place` event body

```yaml
op: place
piece: 42
slot: [5, 2]
rotation: 0
grid_size: 8
actor: queelius
ts: 2026-04-29T12:34:56Z
v: 1
```

`rotation` and `grid_size` are new. Both are always present in V2 commits, even on rotation-disabled weeks.

### V2 `meta.yaml` (per-puzzle)

```yaml
generated_at: '2026-05-04T00:00:00Z'
model: gpt-image-1
prompt: ...
seed: a3f7c1234567890d
grid_size: 8           # NEW
rotation: false        # NEW; true on harder weeks
```

`meta.yaml` is the **authoritative source** for `grid_size` and `rotation`. The commit body's `grid_size` is for self-description; the renderer reads `meta.yaml` first and validates commits against it.

### V2 `seed_puzzle` cron event body

```yaml
op: seed_puzzle
week: 2026-W18
prompt: ...
grid_size: 8
rotation: false
v: 1
```

### Validator semantics

```ts
isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270,
  gridSize: number,
): boolean
```

Logic: piece in `[0, gridSize²)`, slot row and col in `[0, gridSize)`, `row * gridSize + col === piece`, **and `rotation === 0`**. The committed rotation must always be 0 because the source image is shown unrotated; rotation-enabled weeks just *start* tray pieces at non-zero values to make the puzzle harder. The validator's job is the same either way.

### Cross-client compatibility

`test/fixtures/py-commit-body.yaml` (V1 shape) stays. A new `test/fixtures/py-commit-body-v2.yaml` covers the new shape. The TS parser (`parseCommitBody`) is already permissive (`[k: string]: unknown`); V2 fixtures pass without code change. We add explicit assertions on the new fields. **`git-native-py` itself does not change**; only the cron's output payload grows.

### Backwards compat with the existing 2026-W18 puzzle

The current week's puzzle is V1: `meta.yaml` has no `grid_size`, commits have no `rotation` or `grid_size`. The reader's behavior:

- If `meta.yaml.grid_size` is absent: assume 8.
- If `meta.yaml.rotation` is absent: assume `false`.
- If a `place` event lacks `rotation` or `grid_size`: treat as `rotation: 0`, `grid_size: <meta.yaml's grid_size>`.

The existing 2026-W18 puzzle and its 64 commits remain renderable under V2 code with no re-commit.

## Drawer + tray

The drawer is a bottom-anchored panel. It holds tray content during play, leaderboard content after completion. Three states:

| State | Height | Content visible | Trigger |
|---|---|---|---|
| **peek** | ~64px | strip of unplaced pieces, scrollable horizontally | default on load |
| **half** | ~40% viewport | grid of pieces, 2 to 3 rows | swipe up / click handle |
| **full** | ~70% viewport | grid of pieces, all visible | swipe further / drag-to-full |

A handle at the top of the drawer collapses one step (full → half → peek) on tap or swipe-down. The drawer never fully hides during play; peek is always available. Desktop click toggles peek↔half.

When the puzzle is solved, the drawer's contents flip to the leaderboard. The state machine still applies; the leaderboard is bigger content that benefits from the half/full states.

### Tray content

Inside the drawer, unplaced pieces are arranged in a wrapping flex grid sized by drawer state:

- **peek**: single row, horizontal scroll, ~10 pieces visible at 1024px viewport
- **half / full**: wrapped grid, ~6 columns wide on desktop, ~4 on mobile

Each piece is a `<button>` (for native a11y) wrapping a `<canvas>` (for the rendered jigsaw shape). Canvas is 96×96 with the piece centered in its bounding box. Order is the per-actor deterministic shuffle from V1's `Tray.unplaced()`.

### Rotation control on a tray piece

Each thumbnail has a small `↻` overlay button anchored top-right of its bounding box.

- Always-visible on desktop (small, low-contrast)
- On long-press or hover on touch (tap on the rotate icon directly avoids triggering drag/select)

Tap cycles `0 → 90 → 180 → 270 → 0`. The thumbnail re-renders. Rotation state lives in `Tray` (per-piece, in-memory; refresh resets all rotations).

When dragging starts, the held piece keeps its current rotation. Pressing **R** during drag rotates by 90° (desktop only; mobile pre-rotates in tray).

When `meta.yaml.rotation: false`, the rotate overlay is never rendered, pieces are always at rotation 0, and R-key is a no-op.

### Thumbnail rendering

`src/thumbnail.ts` exports one function:

```ts
export function pieceThumbnail(
  piece: number,
  rotation: 0 | 90 | 180 | 270,
  source: HTMLImageElement,
  seed: string,
  gridSize: number,
): HTMLCanvasElement
```

Per-piece thumbnails are cached by `${piece}:${rotation}` key in a `Map<string, HTMLCanvasElement>`. First render computes the clip path via `piecePath(seed, row, col, gridSize)`, applies the rotation transform, drawImages the source-image fragment into the offscreen canvas. Subsequent renders return the cached canvas.

Memory: 64 pieces × 4 rotations × 96×96×4 bytes ≈ 9 MB peak. Acceptable; evict on drawer close if needed.

### Drawer ↔ tray vs drawer ↔ leaderboard handoff

`main.ts` swaps the drawer's child:

```ts
if (state.placedCount === gridSize * gridSize) {
  drawer.setContent(leaderboard.render(state, meta));
} else {
  drawer.setContent(tray.render(state, store.currentActor()));
}
```

Both renderers return a single `HTMLElement`; the drawer doesn't know what's inside.

## Drag-and-drop + tap mechanics

The hybrid input layer is `src/dragger.ts`. One pointer-event handler. Both flows (drag, tap-select-then-tap-slot) terminate in the same `attemptPlace(piece, slot, rotation)` call.

### State machine

```
              ┌───────────┐
              │   IDLE    │
              └─────┬─────┘
                    │ pointerdown on tray piece
                    ▼
              ┌───────────────┐
              │ POINTER_DOWN  │  (started; intent not yet committed)
              └─────┬─────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   movement >5px           pointerup quickly
   (drag intent)        (tap-select intent)
        │                       │
        ▼                       ▼
   ┌─────────┐             ┌─────────────────┐
   │ DRAGGING│             │ SELECTED        │ (piece highlighted in tray)
   └────┬────┘             └────┬────────────┘
        │                       │
   pointerup over slot       pointerdown on slot
        │                       │
        └───────┬───────────────┘
                ▼
        ┌─────────────┐
        │ ATTEMPT     │  → attemptPlace(piece, slot, rotation)
        └─────┬───────┘
              │
        ┌─────┴─────┐
   commit ok    bounce
        │         │
        ▼         ▼
   ┌───────┐  ┌─────────────┐
   │ IDLE  │  │ BOUNCING    │ (piece animates back to tray)
   └───────┘  └─────┬───────┘
                    │ ~400ms
                    ▼
                ┌───────┐
                │ IDLE  │
                └───────┘
```

The 5px threshold separates intent.

### Drag flow

A "ghost piece" follows the pointer on a top-layer overlay canvas. Board canvas underneath shows a faint highlight on the slot under the pointer. **R** key on desktop rotates the held piece (event listener on `window` for the duration of drag). `pointercancel` returns to IDLE; piece restored to tray, no commit.

### Tap-select flow

Selected piece gets a high-contrast border in the tray. Pointer cursor over the board changes. Subsequent tap on a slot calls `attemptPlace`. Second tap on the same selected piece deselects. Tap outside or ESC also deselects.

### `attemptPlace` (V2)

```ts
async function attemptPlace(args: AttemptPlaceArgs): Promise<AttemptResult> {
  const { piece, slot, rotation, state, store, week, meta } = args;
  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }
  if (!isValidPlacement(piece, slot, rotation, meta.gridSize)) {
    return { kind: 'invalid' };
  }
  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot, rotation }) };
  try {
    const { sha } = await store.commit(
      'place',
      { piece, slot, rotation, grid_size: meta.gridSize },
      { files },
    );
    state.applyEvent({
      op: 'place', piece, slot, rotation, grid_size: meta.gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1, sha,
    });
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError') { showToast(`Someone else placed piece ${piece} just now.`); return { kind: 'conflict' }; }
    if (err?.name === 'AuthError')     { showToast('Sign-in expired; refresh and sign in again.'); return { kind: 'auth-required' }; }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
```

### Bounce animation

On `{ kind: 'invalid' }`, dragger snapshots the piece's current screen position, animates it back to its tray slot in 400ms ease-out via `requestAnimationFrame`. Ends at original rotation (a wrong-place attempt does not modify rotation). Same animation on `{ kind: 'conflict' }` with a different toast.

### Touch-vs-drawer-gesture coexistence

The drawer accepts swipe-up/down for resize. Tray pieces inside the drawer accept drag-to-board. The dragger uses `e.target.closest('.jigsaw-piece')` to gate its handler; the drawer uses the inverse. Element-under-pointer determines ownership.

## Completion + leaderboard

A pure projection over the commit log. No new wire format.

### Completion detection

```ts
const isSolved = (state: PuzzleState, gridSize: number): boolean =>
  state.placedCount === gridSize * gridSize;
```

Local-witness flag captured at bootstrap:

```ts
const startedSolved = isSolved(state, meta.gridSize);
state.on('change', () => {
  if (!startedSolved && isSolved(state, meta.gridSize) && !confettiAlreadyFired) {
    fireConfetti();
    confettiAlreadyFired = true;
  }
});
```

Confetti fires exactly once per session, only on the in-session transition. Reload-into-solved is quiet.

### Leaderboard data structure

```ts
interface ActorStats {
  actor: string;
  pieces: number;
  firstPlacement: { piece: number; ts: string };
  lastPlacement:  { piece: number; ts: string };
}

interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;
  contributors: number;
  closedItOut: string;
  rows: ActorStats[];
}
```

### Computing stats

`PuzzleState` retains a `validEvents: PlaceEvent[]` log alongside the placements map. `applyEvent` appends after a successful validate-and-dedup. Bounded (≤ gridSize²); no network round-trip needed at completion.

`leaderboard.ts` builds `LeaderboardData` from `state.validEvents`: groups by actor, sorts events within each actor by ISO timestamp (string-sort works for ISO 8601), tallies. Tie-break for per-actor sort: more pieces first, then earlier first-placement-ts.

### Render output

```html
<section class="jigsaw-leaderboard">
  <header>
    <h3>Solved 2026-W18 in 3d 14h 22m</h3>
    <div class="meta">12 contributors · 64 pieces</div>
  </header>
  <ol class="rows">
    <li class="row" data-rank="1">
      <span class="actor">queelius</span>
      <span class="badge closed-it-out" title="Placed the final piece">🧩</span>
      <span class="pieces">18 pieces</span>
      <span class="span">first 0 · last 7</span>
    </li>
  </ol>
  <footer class="actions">
    <a href="https://github.com/queelius/metafunctor-data/commits/main/jigsaw/2026-W18">View git log</a>
    <a href="...">Download source.png</a>
    <button class="copy-link">Copy link</button>
  </footer>
</section>
```

The 🧩 badge appears only on the row where `actor === data.closedItOut`. Duration formatted with a tiny helper (`3d 14h 22m`, falling back to `14h 22m` etc.).

### Confetti

`src/confetti.ts`, ~30 LOC. Burst of ~80 colored particles emitted from the canvas center, gravity and drag. Plays for ~2 seconds, particles fade. Rendered to a fixed-position canvas overlay removed at end-of-animation. No third-party dep.

### Look-and-feel notes

- No animation when the leaderboard appears (drawer content swap is instant). Confetti is the only celebration.
- Leaderboard does not auto-refresh on subscription (puzzle is solved; no more events for this week).
- An arriving-late visitor renders the leaderboard correctly from the initial commit-log read.

## Sign-out menu

`src/sign-in-menu.ts` (renamed from V1's `sign-in-modal.ts`) hosts both the token-entry modal and a new dropdown menu when authenticated.

When signed in, the auth bar shows the actor name as a clickable button. Click → small popover, single item: "Sign out" → `await store.signOut()` → cleared token + cleared local state → bar re-renders to "Sign in".

```
┌─ auth bar (signed in) ──────────────────────────────────┐
│  Week 2026-W18 · 47/64 pieces · 12 contributors         │
│                                       queelius ▼        │
└─────────────────────────────────────────────────────────┘
                                              │
                                              ▼ on click
                                       ┌──────────────┐
                                       │  Sign out    │
                                       └──────────────┘
```

Dismissed by clicking outside, pressing Escape, or clicking the menu item. Same lightweight DOM pattern as the sign-in modal: `replaceChildren` + a global click-outside listener added on open and removed on close.

A11y: the menu is a `<ul role="menu">` with the sign-out as `<li role="menuitem">`. Arrow keys and Enter activate. ESC closes.

`auth-bar.ts` change is small: actor span becomes `<button class="actor-button">`, click handler invokes `showSignOutMenu(anchorEl, onSignOut)` from `sign-in-menu.ts`.

## Mobile behavior

The whole input layer uses Pointer Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`); no separate touch/mouse branches.

**Drawer gesture-resize on touch.** Swipe up/down on the drawer handle resizes between peek/half/full. ~30 LOC of pointermove tracking + snap-on-pointerup. Desktop ignores; click handle instead.

**Long-press shows the rotate icon on mobile.** Pointerdown without movement for 300ms reveals the overlay. Protects against thumb-fat-fingering rotate during drag start. Desktop always shows the overlay.

**No pinch-zoom inside the canvas.** `touch-action` rules:

```css
.jigsaw-board { touch-action: none; }
.jigsaw-drawer { touch-action: pan-y; }
.jigsaw-piece { touch-action: none; }
.jigsaw-page { touch-action: pan-x pan-y; }
```

Mobile users can use browser-native page zoom. The app does not reimplement zoom inside the canvas.

## Testing

Three layers, mirroring V1.

**Unit (`test/unit/`):**

| Test file | What it covers |
|---|---|
| `validator.test.ts` (modified) | Parameterized by gridSize. Cases for 6, 8, 10, 12, 16. Rotation must be 0 to validate. Out-of-range piece for given gridSize. |
| `shapes.test.ts` (modified) | `tabPattern` parameterized by gridSize. Edge agreement. Outer edges flat for arbitrary gridSize. |
| `puzzle.test.ts` (modified) | `applyEvent` accepts rotation in payload. `validEvents` log appended in arrival order. Dedup on piece id. |
| `leaderboard.test.ts` (new) | `buildLeaderboard` over a synthetic event sequence: per-actor sort, tie-break by first-placement, closed-it-out matches latest event's actor, durations correct. |
| `thumbnail.test.ts` (new) | Cache hits on `(piece, rotation)` repeat. Returns canvas-shaped object (happy-dom). |
| `parse-event.test.ts` (modified) | New fixture `py-commit-body-v2.yaml` parses with `grid_size` + `rotation`. V1-shape body still parses. |

**Integration (`test/integration/`):**

| Test file | What it covers |
|---|---|
| `write-flow.test.ts` (modified) | `attemptPlace` includes `rotation` in commit payload and optimistic apply. |
| `completion.test.ts` (new) | Inject events into MockStore, simulate `placedCount === gridSize²` transition, assert confetti fires *once*. Reload-into-solved (`startedSolved=true`) does NOT fire. |
| `drawer.test.ts` (new) | Drawer state transitions: peek↔half↔full via simulated pointer gestures. Content swap on solved-state. |
| `dragger.test.ts` (new) | State machine. Synthetic pointerdown → pointermove(>5px) → pointerup over slot → ATTEMPT. Bounce on invalid. R-key during DRAGGING rotates held piece. |
| `auth-bar.test.ts` (modified) | Sign-out menu opens on actor click, closes on outside-click, Escape, or menu item. Sign-out triggers re-render to "Sign in" state. |

**E2E (`test/e2e/`):** V1 happy-path stays. New scenarios: drag-drop a real piece, watch a commit land in a fixture data repo, watch the next subscription poll bring it back. Rotation-bounce. Completion: place all 64, see leaderboard render and confetti fire.

**Coverage targets:** ≥90% on `src/`, integration covers every drag-drop and completion path, E2E remains opt-in.

## Risks

- **Bundle size growth.** V2 adds dragger, drawer, leaderboard, confetti, thumbnail. Target stays under 60 KB gzipped (V1 is 38 KB). If we breach, the most likely offenders are the drawer's gesture math and the confetti renderer; both are isolated and replaceable.
- **Thumbnail cache memory.** 64 × 4 × 96² × 4 bytes ≈ 9 MB peak. Acceptable on desktop, watch on low-memory mobile. Mitigation: evict on drawer close.
- **Pointer-event coverage.** Some older mobile browsers have buggy `pointercancel` semantics. Test on iOS Safari 16+, Chrome Android 120+. Fallback if needed: a touchstart/touchmove/touchend pair behind feature detection.
- **Wire-format additivity claim.** We assume V1 readers ignore `grid_size` and `rotation`. The V1 parser (`parseCommitBody`) is permissive, so this holds; verified by the cross-client test.
- **Per-actor rotation-state lost on reload.** Tray rotation is in-memory only. On rotation-enabled weeks, refresh resets all unplaced pieces to fresh random rotations. Acceptable for V2; could be persisted to localStorage if user feedback demands.
- **Confetti "once per session" invariant.** Could fail if a user reloads at exactly the moment the 64th commit arrives across the wire. The `startedSolved` capture protects against most cases; race is narrow. Acceptable.
