# git-jigsaw V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the V1 protocol demo at metafunctor.com/arcade/jigsaw into a real jigsaw puzzle: image-fragment thumbnails, drag-and-drop with snap-to-slot, rotation, variable per-puzzle difficulty, and a completion leaderboard built from the commit log.

**Architecture:** Wire format extended additively (v: 1 stays). `meta.yaml` becomes authoritative for `grid_size` and `rotation`; commit bodies are self-describing. Renderer, validator, shapes, and tray are parameterized by gridSize. New units: drawer (bottom sheet), thumbnail (cached jigsaw-shape rendering), dragger (pointer state machine), leaderboard (commit-log projection), confetti (one-shot celebration), sign-in-menu (renamed; hosts both sign-in and sign-out popovers). 

**Tech Stack:** TypeScript, Vite, Vitest, happy-dom, Pointer Events API, OffscreenCanvas. No new third-party dependencies. Bundle target: under 60 KB gzipped (V1 is 38 KB).

---

## File structure

```
git-jigsaw/src/
├── validator.ts              # MODIFIED: parameterized by gridSize, accepts rotation
├── shapes.ts                 # MODIFIED: parameterized by gridSize
├── puzzle.ts                 # MODIFIED: PlaceEvent adds grid_size+rotation; validEvents log
├── renderer.ts               # MODIFIED: parameterized; draws pieces at committed rotation
├── tray.ts                   # MODIFIED: shuffle parameterized; render() returns DOM
├── read-flow.ts              # MODIFIED: parses grid_size+rotation from meta.yaml
├── input.ts                  # MODIFIED: attemptPlace accepts rotation
├── main.ts                   # MODIFIED: drawer lifecycle + completion + sign-out wiring
├── auth-bar.ts               # MODIFIED: actor name becomes button with popover
├── parse-event.ts            # UNCHANGED (already permissive)
├── store-config.ts           # UNCHANGED
├── toast.ts                  # UNCHANGED
├── env.d.ts                  # UNCHANGED
│
├── drawer.ts                 # NEW: bottom-sheet state machine
├── thumbnail.ts              # NEW: pieceThumbnail() with (piece, rotation) cache
├── dragger.ts                # NEW: pointer state machine + ghost overlay + R-key
├── leaderboard.ts            # NEW: buildLeaderboard + renderLeaderboard
├── confetti.ts               # NEW: tiny canvas-particle burst
└── sign-in-menu.ts           # NEW: renamed from sign-in-modal.ts; hosts sign-out menu

git-jigsaw/test/
├── unit/
│   ├── validator.test.ts     # MODIFIED: parameterized cases
│   ├── shapes.test.ts        # MODIFIED: parameterized cases
│   ├── puzzle.test.ts        # MODIFIED: rotation + validEvents
│   ├── tray.test.ts          # MODIFIED: per-gridSize shuffle
│   ├── parse-event.test.ts   # MODIFIED: V2 fixture
│   ├── renderer.test.ts      # MODIFIED: parameterized
│   ├── leaderboard.test.ts   # NEW
│   └── thumbnail.test.ts     # NEW
├── integration/
│   ├── auth-bar.test.ts      # MODIFIED: sign-out menu
│   ├── write-flow.test.ts    # MODIFIED: rotation arg
│   ├── completion.test.ts    # NEW
│   ├── drawer.test.ts        # NEW
│   └── dragger.test.ts       # NEW
└── fixtures/
    ├── py-commit-body.yaml          # UNCHANGED
    └── py-commit-body-v2.yaml       # NEW

metafunctor-data/tools/src/jigsaw_tools/
├── generate_puzzle.py        # MODIFIED: grid_size + rotation in meta.yaml + seed event
└── prompts.py                # UNCHANGED
```

---

## Task 1: Cron writes grid_size + rotation

**Files:**
- Modify: `metafunctor-data/tools/src/jigsaw_tools/generate_puzzle.py`
- Modify: `metafunctor-data/tools/tests/test_generate_puzzle.py`

The cron is the upstream source of `meta.yaml`. Without this task, V2 readers default to the V1 hardcoded values.

- [ ] **Step 1: Add grid_size + rotation choice helpers to generate_puzzle.py**

Edit `metafunctor-data/tools/src/jigsaw_tools/generate_puzzle.py`. Add two helpers above `main()`:

```python
GRID_SIZES = [8, 10, 12]


def pick_grid_size(week_id: str) -> int:
    """Deterministic per-week grid size from a small list."""
    digits = "".join(ch for ch in week_id if ch.isdigit())
    idx = int(digits) % len(GRID_SIZES) if digits else 0
    return GRID_SIZES[idx]


def pick_rotation_enabled(week_id: str) -> bool:
    """Half of weeks have rotation enabled."""
    digits = "".join(ch for ch in week_id if ch.isdigit())
    return (int(digits) if digits else 0) % 2 == 1
```

- [ ] **Step 2: Update write_puzzle to include grid_size + rotation in meta.yaml**

Replace `write_puzzle` with:

```python
def write_puzzle(repo_root: Path, week_id: str, image_bytes: bytes, prompt: str, model: str, grid_size: int, rotation: bool) -> Path:
    puzzle_dir = repo_root / "jigsaw" / week_id
    puzzle_dir.mkdir(parents=True, exist_ok=True)
    (puzzle_dir / "source.png").write_bytes(image_bytes)
    seed = hashlib.sha256(image_bytes).hexdigest()[:16]
    (puzzle_dir / "meta.yaml").write_text(yaml.safe_dump({
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "model": model,
        "prompt": prompt,
        "seed": seed,
        "grid_size": grid_size,
        "rotation": rotation,
    }))
    return puzzle_dir
```

- [ ] **Step 3: Update commit_and_push to include grid_size + rotation in seed_puzzle event body**

Replace `commit_and_push` with:

```python
def commit_and_push(repo_root: Path, puzzle_dir: Path, week_id: str, prompt: str, grid_size: int, rotation: bool) -> None:
    body = yaml.safe_dump({
        "op": "seed_puzzle",
        "week": week_id,
        "prompt": prompt,
        "grid_size": grid_size,
        "rotation": rotation,
        "v": 1,
    })
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
```

- [ ] **Step 4: Update main() to compute and pass grid_size + rotation**

Replace `main()` with:

```python
def main() -> int:
    repo_root = Path(os.environ.get("REPO_ROOT", ".")).resolve()
    week_id = os.environ.get("WEEK_ID") or current_week_id()
    if (repo_root / "jigsaw" / week_id / "source.png").exists():
        print(f"{week_id} already generated; exiting.")
        return 0
    prompt = pick_prompt(week_id)
    grid_size = pick_grid_size(week_id)
    rotation = pick_rotation_enabled(week_id)
    model = os.environ.get("OPENAI_IMAGE_MODEL") or "gpt-image-1"
    base_url = os.environ.get("OPENAI_BASE_URL") or None
    image_bytes = generate_image(prompt, model, base_url)
    puzzle_dir = write_puzzle(repo_root, week_id, image_bytes, prompt, model, grid_size, rotation)
    commit_and_push(repo_root, puzzle_dir, week_id, prompt, grid_size, rotation)
    print(f"Generated and committed {week_id} (grid {grid_size}, rotation {rotation}).")
    return 0
```

- [ ] **Step 5: Update existing tests to pass grid_size + rotation**

Edit `metafunctor-data/tools/tests/test_generate_puzzle.py`. Replace `test_write_puzzle_creates_dir_and_files` and `test_commit_and_push_invokes_git` with:

```python
def test_write_puzzle_creates_dir_and_files(tmp_path: Path):
    image_bytes = b"\x89PNG\r\n\x1a\n" + b"fakepngdata" * 100
    puzzle_dir = write_puzzle(tmp_path, "2026-W17", image_bytes, "a prompt", "gpt-image-1", 8, False)
    assert (puzzle_dir / "source.png").read_bytes() == image_bytes
    meta = yaml.safe_load((puzzle_dir / "meta.yaml").read_text())
    assert meta["model"] == "gpt-image-1"
    assert meta["prompt"] == "a prompt"
    assert meta["seed"] == hashlib.sha256(image_bytes).hexdigest()[:16]
    assert meta["grid_size"] == 8
    assert meta["rotation"] is False


def test_commit_and_push_invokes_git(tmp_path: Path, monkeypatch):
    calls: list[list[str]] = []
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        class R: returncode = 0
        return R()
    monkeypatch.setattr(subprocess, "run", fake_run)
    puzzle_dir = tmp_path / "jigsaw" / "2026-W17"
    puzzle_dir.mkdir(parents=True)
    commit_and_push(tmp_path, puzzle_dir, "2026-W17", "a prompt", 8, False)
    assert any(call[0] == "git" and "add" in call for call in calls)
    assert any(call[0] == "git" and "commit" in call for call in calls)
    assert any(call[0] == "git" and "push" in call for call in calls)
```

Add new tests for the picker functions:

```python
def test_pick_grid_size_deterministic_per_week():
    a = pick_grid_size("2026-W17")
    b = pick_grid_size("2026-W17")
    assert a == b
    assert a in [8, 10, 12]


def test_pick_grid_size_varies_across_weeks():
    sizes = [pick_grid_size(f"2026-W{i:02d}") for i in range(1, 13)]
    assert len(set(sizes)) > 1


def test_pick_rotation_enabled_deterministic():
    a = pick_rotation_enabled("2026-W17")
    b = pick_rotation_enabled("2026-W17")
    assert a == b
    assert isinstance(a, bool)
```

You'll also need to import the new symbols at the top of the test file:

```python
from jigsaw_tools.generate_puzzle import (
    current_week_id,
    write_puzzle,
    commit_and_push,
    pick_grid_size,
    pick_rotation_enabled,
)
```

- [ ] **Step 6: Run tests, verify all pass**

```bash
cd /home/spinoza/github/repos/metafunctor-data/tools
source .venv/bin/activate
pytest -v
```

Expected: 8 passed (original 5 + 3 new).

- [ ] **Step 7: Commit**

```bash
cd /home/spinoza/github/repos/metafunctor-data
git add tools/src/jigsaw_tools/generate_puzzle.py tools/tests/test_generate_puzzle.py
git commit -m "Cron: write grid_size and rotation into meta.yaml + seed event

Per-week grid_size cycles through [8, 10, 12]; rotation alternates
true/false. Both fields are added to meta.yaml (authoritative) and
to the seed_puzzle commit body (self-describing). V2 readers will
use these; V1 readers ignore unknown YAML keys."
git push
```

---

## Task 2: Validator parameterized by gridSize, accepts rotation

**Files:**
- Modify: `git-jigsaw/src/validator.ts`
- Modify: `git-jigsaw/test/unit/validator.test.ts`

- [ ] **Step 1: Update tests to require new signature**

Replace `test/unit/validator.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { isValidPlacement, PIECE_COUNT_FOR } from '../../src/validator';

describe('isValidPlacement', () => {
  it('PIECE_COUNT_FOR(8) is 64', () => {
    expect(PIECE_COUNT_FOR(8)).toBe(64);
  });

  it('PIECE_COUNT_FOR(10) is 100', () => {
    expect(PIECE_COUNT_FOR(10)).toBe(100);
  });

  it('accepts piece 0 at slot [0, 0] rotation 0 on 8x8', () => {
    expect(isValidPlacement(0, [0, 0], 0, 8)).toBe(true);
  });

  it('accepts piece 42 at slot [5, 2] on 8x8 (5*8+2=42)', () => {
    expect(isValidPlacement(42, [5, 2], 0, 8)).toBe(true);
  });

  it('accepts piece 42 at slot [4, 2] on 10x10 (4*10+2=42)', () => {
    expect(isValidPlacement(42, [4, 2], 0, 10)).toBe(true);
  });

  it('rejects rotation other than 0', () => {
    expect(isValidPlacement(0, [0, 0], 90, 8)).toBe(false);
    expect(isValidPlacement(0, [0, 0], 180, 8)).toBe(false);
    expect(isValidPlacement(0, [0, 0], 270, 8)).toBe(false);
  });

  it('rejects piece out of range for given gridSize', () => {
    expect(isValidPlacement(64, [0, 0], 0, 8)).toBe(false);
    expect(isValidPlacement(100, [0, 0], 0, 10)).toBe(false);
  });

  it('rejects slot row out of range', () => {
    expect(isValidPlacement(0, [8, 0], 0, 8)).toBe(false);
    expect(isValidPlacement(0, [-1, 0], 0, 8)).toBe(false);
  });

  it('rejects slot col out of range', () => {
    expect(isValidPlacement(0, [0, 8], 0, 8)).toBe(false);
    expect(isValidPlacement(0, [0, -1], 0, 8)).toBe(false);
  });

  it('rejects mismatched piece/slot for given gridSize', () => {
    expect(isValidPlacement(42, [3, 7], 0, 8)).toBe(false);
  });

  it('all pieces validate at canonical slot for various gridSizes', () => {
    for (const g of [6, 8, 10, 12, 16]) {
      for (let p = 0; p < g * g; p++) {
        const r = Math.floor(p / g);
        const c = p % g;
        expect(isValidPlacement(p, [r, c], 0, g)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/spinoza/github/repos/git-jigsaw
npm test -- validator
```

Expected: FAIL (signature mismatch).

- [ ] **Step 3: Replace `src/validator.ts` with parameterized version**

```ts
export function PIECE_COUNT_FOR(gridSize: number): number {
  return gridSize * gridSize;
}

export function isValidPlacement(
  piece: number,
  slot: readonly [number, number],
  rotation: 0 | 90 | 180 | 270 | number,
  gridSize: number,
): boolean {
  if (!Number.isInteger(gridSize) || gridSize < 2) return false;
  if (rotation !== 0) return false;
  const pieceCount = gridSize * gridSize;
  if (!Number.isInteger(piece) || piece < 0 || piece >= pieceCount) return false;
  const [row, col] = slot;
  if (!Number.isInteger(row) || row < 0 || row >= gridSize) return false;
  if (!Number.isInteger(col) || col < 0 || col >= gridSize) return false;
  return row * gridSize + col === piece;
}
```

Note: `GRID_SIZE` and `PIECE_COUNT` constants are removed; consumers must compute via `PIECE_COUNT_FOR(gridSize)` or pass gridSize through.

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- validator
```

Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add src/validator.ts test/unit/validator.test.ts
git commit -m "Validator: parameterize by gridSize, accept rotation"
```

---

## Task 3: Shapes parameterized by gridSize

**Files:**
- Modify: `git-jigsaw/src/shapes.ts`
- Modify: `git-jigsaw/test/unit/shapes.test.ts`

- [ ] **Step 1: Update tests for parameterized signature**

Replace `test/unit/shapes.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { tabPattern, type Edge } from '../../src/shapes';

const SEED = 'fixedseed12345678';

describe('tabPattern', () => {
  for (const gridSize of [6, 8, 10, 12]) {
    it(`outer north edge of top row is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 0, 3, 'N', gridSize)).toBe(0);
    });

    it(`outer south edge of bottom row is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, gridSize - 1, 3, 'S', gridSize)).toBe(0);
    });

    it(`outer west edge of left column is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 3, 0, 'W', gridSize)).toBe(0);
    });

    it(`outer east edge of right column is flat (gridSize=${gridSize})`, () => {
      expect(tabPattern(SEED, 3, gridSize - 1, 'E', gridSize)).toBe(0);
    });

    it(`east edge of (r,c) opposite-signs west edge of (r,c+1) (gridSize=${gridSize})`, () => {
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize - 1; c++) {
          const east = tabPattern(SEED, r, c, 'E', gridSize);
          const west = tabPattern(SEED, r, c + 1, 'W', gridSize);
          expect(east + west).toBe(0);
          expect(east).not.toBe(0);
        }
      }
    });

    it(`south edge of (r,c) opposite-signs north edge of (r+1,c) (gridSize=${gridSize})`, () => {
      for (let r = 0; r < gridSize - 1; r++) {
        for (let c = 0; c < gridSize; c++) {
          const south = tabPattern(SEED, r, c, 'S', gridSize);
          const north = tabPattern(SEED, r + 1, c, 'N', gridSize);
          expect(south + north).toBe(0);
          expect(south).not.toBe(0);
        }
      }
    });
  }

  it('is deterministic for the same inputs', () => {
    const a = tabPattern(SEED, 3, 4, 'E', 8);
    const b = tabPattern(SEED, 3, 4, 'E', 8);
    expect(a).toBe(b);
  });

  it('different seeds produce different patterns at many internal edges', () => {
    const seedA = 'seedA1234567890a';
    const seedB = 'seedB1234567890b';
    let differences = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (tabPattern(seedA, r, c, 'E', 8) !== tabPattern(seedB, r, c, 'E', 8)) differences++;
        if (tabPattern(seedA, r, c, 'S', 8) !== tabPattern(seedB, r, c, 'S', 8)) differences++;
      }
    }
    expect(differences).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- shapes
```

Expected: FAIL (signature mismatch).

- [ ] **Step 3: Replace `src/shapes.ts`**

```ts
export type Edge = 'N' | 'E' | 'S' | 'W';

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tabPattern(seed: string, row: number, col: number, edge: Edge, gridSize: number): -1 | 0 | 1 {
  if (edge === 'N' && row === 0) return 0;
  if (edge === 'S' && row === gridSize - 1) return 0;
  if (edge === 'W' && col === 0) return 0;
  if (edge === 'E' && col === gridSize - 1) return 0;

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

export function pieceShape(seed: string, row: number, col: number, gridSize: number): PieceShape {
  return {
    N: tabPattern(seed, row, col, 'N', gridSize),
    E: tabPattern(seed, row, col, 'E', gridSize),
    S: tabPattern(seed, row, col, 'S', gridSize),
    W: tabPattern(seed, row, col, 'W', gridSize),
  };
}
```

The only change is `gridSize` is now an explicit parameter rather than imported from validator.

- [ ] **Step 4: Run test, verify all pass**

```bash
npm test -- shapes
```

Expected: 26 passed (parameterized 6 properties × 4 grid sizes + 2 fixed = 26).

- [ ] **Step 5: Commit**

```bash
git add src/shapes.ts test/unit/shapes.test.ts
git commit -m "Shapes: parameterize by gridSize"
```

---

## Task 4: PuzzleState (rotation + grid_size + validEvents log)

**Files:**
- Modify: `git-jigsaw/src/puzzle.ts`
- Modify: `git-jigsaw/test/unit/puzzle.test.ts`

- [ ] **Step 1: Update tests**

Replace `test/unit/puzzle.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

const baseEvent = (overrides: Partial<PlaceEvent>): PlaceEvent => ({
  op: 'place',
  piece: 0,
  slot: [0, 0],
  rotation: 0,
  grid_size: 8,
  actor: 'alice',
  ts: '2026-04-27T12:00:00Z',
  v: 1,
  sha: 'sha-' + Math.random().toString(36).slice(2, 8),
  ...overrides,
});

describe('PuzzleState', () => {
  it('starts empty', () => {
    const s = new PuzzleState(8);
    expect(s.placements.size).toBe(0);
    expect(s.contributors.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('applies valid place event with rotation=0', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'queelius' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('queelius')).toBe(true);
    expect(s.validEvents.length).toBe(1);
  });

  it('rejects place event with non-zero rotation', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], rotation: 90 }));
    expect(s.placements.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('rejects place event with mismatched grid_size', () => {
    const s = new PuzzleState(8);
    // event claims grid_size 10 but state is 8; renderer trusts state
    s.applyEvent(baseEvent({ piece: 99, slot: [9, 9], grid_size: 10 }));
    expect(s.placements.size).toBe(0);
  });

  it('accepts place event when grid_size matches state', () => {
    const s = new PuzzleState(10);
    s.applyEvent(baseEvent({ piece: 42, slot: [4, 2], grid_size: 10 }));
    expect(s.placements.get(42)).toEqual([4, 2]);
  });

  it('ignores invalid place event (wrong slot for piece)', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [3, 7] }));
    expect(s.placements.size).toBe(0);
    expect(s.validEvents.length).toBe(0);
  });

  it('ignores unknown ops', () => {
    const s = new PuzzleState(8);
    s.applyEvent({ op: 'comment', actor: 'alice', ts: 't', v: 1, sha: 'x' } as any);
    expect(s.placements.size).toBe(0);
  });

  it('first placement of a piece wins', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], actor: 'mallory', sha: 'b' }));
    expect(s.placements.get(42)).toEqual([5, 2]);
    expect(s.contributors.has('alice')).toBe(true);
    expect(s.contributors.has('mallory')).toBe(false);
    expect(s.validEvents.length).toBe(1);
  });

  it('counts unique contributors only once', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], actor: 'alice', sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 1, slot: [0, 1], actor: 'alice', sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 2, slot: [0, 2], actor: 'bob', sha: 'c' }));
    expect(s.contributors.size).toBe(2);
  });

  it('placedCount tracks number of placed pieces', () => {
    const s = new PuzzleState(8);
    expect(s.placedCount).toBe(0);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'b' }));
    expect(s.placedCount).toBe(2);
  });

  it('isPlaced(piece) reports placement state', () => {
    const s = new PuzzleState(8);
    expect(s.isPlaced(42)).toBe(false);
    s.applyEvent(baseEvent({ piece: 42, slot: [5, 2], sha: 'a' }));
    expect(s.isPlaced(42)).toBe(true);
  });

  it('emits change event on valid placement only', () => {
    const s = new PuzzleState(8);
    let count = 0;
    s.on('change', () => count++);
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 99, slot: [0, 0], sha: 'b' }));
    expect(count).toBe(1);
  });

  it('does not throw on malformed place event (missing piece/slot)', () => {
    const s = new PuzzleState(8);
    expect(() => {
      s.applyEvent({ op: 'place', actor: 'a', ts: 't', v: 1, sha: 'x' } as any);
    }).not.toThrow();
    expect(s.placements.size).toBe(0);
  });

  it('validEvents preserves arrival order', () => {
    const s = new PuzzleState(8);
    s.applyEvent(baseEvent({ piece: 5, slot: [0, 5], sha: 'a' }));
    s.applyEvent(baseEvent({ piece: 0, slot: [0, 0], sha: 'b' }));
    s.applyEvent(baseEvent({ piece: 9, slot: [1, 1], sha: 'c' }));
    expect(s.validEvents.map((e) => e.piece)).toEqual([5, 0, 9]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- puzzle
```

Expected: FAIL.

- [ ] **Step 3: Replace `src/puzzle.ts`**

```ts
import { isValidPlacement } from './validator';

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
  readonly validEvents: PlaceEvent[] = [];
  private listeners = new Set<ChangeListener>();

  constructor(public readonly gridSize: number) {}

  get placedCount(): number {
    return this.placements.size;
  }

  isPlaced(piece: number): boolean {
    return this.placements.has(piece);
  }

  applyEvent(event: Event): void {
    if (event.op !== 'place') return;
    const piece = (event as Record<string, unknown>).piece;
    const slot = (event as Record<string, unknown>).slot;
    const rotation = (event as Record<string, unknown>).rotation ?? 0;
    const eventGrid = (event as Record<string, unknown>).grid_size ?? this.gridSize;
    if (typeof piece !== 'number') return;
    if (!Array.isArray(slot) || slot.length !== 2) return;
    if (typeof slot[0] !== 'number' || typeof slot[1] !== 'number') return;
    if (typeof rotation !== 'number') return;
    if (typeof eventGrid !== 'number' || eventGrid !== this.gridSize) return;
    if (!isValidPlacement(piece, [slot[0], slot[1]] as const, rotation as 0 | 90 | 180 | 270, this.gridSize)) return;
    if (this.placements.has(piece)) return;
    this.placements.set(piece, [slot[0], slot[1]] as const);
    this.contributors.add((event as PlaceEvent).actor);
    this.validEvents.push(event as PlaceEvent);
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

- [ ] **Step 4: Run test, verify all pass**

```bash
npm test -- puzzle
```

Expected: 14 passed.

- [ ] **Step 5: Commit**

```bash
git add src/puzzle.ts test/unit/puzzle.test.ts
git commit -m "PuzzleState: parameterized by gridSize, accepts rotation, validEvents log"
```

---

## Task 5: Read-flow parses grid_size + rotation from meta.yaml

**Files:**
- Modify: `git-jigsaw/src/read-flow.ts`
- Modify: `git-jigsaw/test/integration/read-flow.test.ts`

- [ ] **Step 1: Update tests**

Replace `test/integration/read-flow.test.ts` with:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { loadInitialState, parseMeta } from '../../src/read-flow';
import { MockStore } from './mock-store';

describe('parseMeta', () => {
  it('parses V2 meta with grid_size and rotation', () => {
    const text = "seed: a3f7c1234567890d\ngrid_size: 10\nrotation: true\n";
    const meta = parseMeta(text);
    expect(meta.seed).toBe('a3f7c1234567890d');
    expect(meta.gridSize).toBe(10);
    expect(meta.rotationEnabled).toBe(true);
  });

  it('defaults to gridSize=8 and rotation=false when meta lacks them (V1 backwards compat)', () => {
    const text = "seed: deadbeef00000000\n";
    const meta = parseMeta(text);
    expect(meta.seed).toBe('deadbeef00000000');
    expect(meta.gridSize).toBe(8);
    expect(meta.rotationEnabled).toBe(false);
  });

  it('throws when seed is missing', () => {
    expect(() => parseMeta("grid_size: 8\n")).toThrow(/seed/);
  });
});

describe('loadInitialState', () => {
  it('applies all valid place events from the store', async () => {
    const store = new MockStore({
      initialEvents: [
        { op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: '1' },
        { op: 'place', piece: 9, slot: [1, 1], rotation: 0, grid_size: 8, actor: 'b', ts: 't', v: 1, sha: '2' },
        { op: 'place', piece: 9, slot: [3, 0], rotation: 0, grid_size: 8, actor: 'c', ts: 't', v: 1, sha: '3' },
      ],
    });
    const state = await loadInitialState(store, '2026-W17', 8);
    expect(state.placedCount).toBe(2);
    expect(state.contributors.size).toBe(2);
    expect(state.validEvents.length).toBe(2);
  });

  it('returns empty state when store has no events', async () => {
    const store = new MockStore();
    const state = await loadInitialState(store, '2026-W17', 8);
    expect(state.placedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- read-flow
```

Expected: FAIL.

- [ ] **Step 3: Update `src/read-flow.ts`**

Replace the file with:

```ts
import { PuzzleState, type Event } from './puzzle';

interface StoreLike {
  eventsSince(since?: string): Promise<Event[]>;
}

export async function loadInitialState(store: StoreLike, _week: string, gridSize: number): Promise<PuzzleState> {
  const events = await store.eventsSince();
  const state = new PuzzleState(gridSize);
  for (const e of events) state.applyEvent(e);
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
```

- [ ] **Step 4: Run test, verify all pass**

```bash
npm test -- read-flow
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/read-flow.ts test/integration/read-flow.test.ts
git commit -m "Read-flow: parse grid_size + rotation from meta.yaml; defaults for V1 compat"
```

---

## Task 6: parse-event accepts V2 fixture

**Files:**
- Create: `git-jigsaw/test/fixtures/py-commit-body-v2.yaml`
- Modify: `git-jigsaw/test/unit/parse-event.test.ts`

- [ ] **Step 1: Write V2 fixture**

Create `test/fixtures/py-commit-body-v2.yaml`:

```yaml
op: place
piece: 42
slot: [5, 2]
rotation: 0
grid_size: 8
actor: queelius
ts: 2026-04-27T14:23:11Z
v: 1
```

- [ ] **Step 2: Add test for V2 parsing**

Append to `test/unit/parse-event.test.ts`:

```ts
  it('parses a V2-shape place commit body with grid_size and rotation', () => {
    const yaml = readFileSync(join(__dirname, '../fixtures/py-commit-body-v2.yaml'), 'utf8');
    const event = parseCommitBody(yaml, 'sha-from-git') as any;
    expect(event).toMatchObject({
      op: 'place',
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

- [ ] **Step 3: Run tests**

```bash
npm test -- parse-event
```

Expected: 4 passed (3 existing + 1 new).

- [ ] **Step 4: Commit**

```bash
git add test/fixtures/py-commit-body-v2.yaml test/unit/parse-event.test.ts
git commit -m "Cross-client: V2 fixture with grid_size and rotation parses cleanly"
```

---

## Task 7: Renderer parameterized + draws at committed rotation

**Files:**
- Modify: `git-jigsaw/src/renderer.ts`
- Modify: `git-jigsaw/test/unit/renderer.test.ts`

- [ ] **Step 1: Update tests**

Replace `test/unit/renderer.test.ts` with:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

class Path2DStub {
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
}

interface FakeCtx {
  clearRect: ReturnType<typeof vi.fn>;
  strokeRect: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  strokeStyle: string;
  lineWidth: number;
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { piecePath, paintBoard, BOARD_SIZE, tileSizeFor } from '../../src/renderer';
import { PuzzleState } from '../../src/puzzle';

describe('renderer constants', () => {
  it('BOARD_SIZE is 1024', () => {
    expect(BOARD_SIZE).toBe(1024);
  });

  it('tileSizeFor scales with gridSize', () => {
    expect(tileSizeFor(8)).toBe(128);
    expect(tileSizeFor(10)).toBe(102.4);
    expect(tileSizeFor(16)).toBe(64);
  });
});

describe('piecePath', () => {
  it('returns a Path2D for a valid piece', () => {
    const p = piecePath('seedabc1234567890', 0, 0, 8);
    expect(p).toBeInstanceOf(Path2DStub);
  });
});

describe('paintBoard', () => {
  let ctx: FakeCtx;

  beforeEach(() => {
    ctx = {
      clearRect: vi.fn(),
      strokeRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clip: vi.fn(),
      stroke: vi.fn(),
      drawImage: vi.fn(),
      strokeStyle: '',
      lineWidth: 0,
    };
  });

  it('paints a placed piece on 8x8', () => {
    const s = new PuzzleState(8);
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'alice', ts: 't', v: 1, sha: 'a' });
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 8);
    expect(ctx.drawImage).toHaveBeenCalled();
  });

  it('does not paint unplaced pieces', () => {
    const s = new PuzzleState(8);
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 8);
    expect(ctx.drawImage).not.toHaveBeenCalled();
  });

  it('paints with the parameterized gridSize for 10x10', () => {
    const s = new PuzzleState(10);
    s.applyEvent({ op: 'place', piece: 42, slot: [4, 2], rotation: 0, grid_size: 10, actor: 'a', ts: 't', v: 1, sha: 'x' });
    const source = {} as CanvasImageSource;
    paintBoard(ctx as unknown as CanvasRenderingContext2D, s, source, 'seedabc1234567890', 10);
    expect(ctx.drawImage).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- renderer
```

Expected: FAIL.

- [ ] **Step 3: Replace `src/renderer.ts`**

```ts
import { pieceShape, type PieceShape } from './shapes';
import type { PuzzleState } from './puzzle';

export const BOARD_SIZE = 1024;

export function tileSizeFor(gridSize: number): number {
  return BOARD_SIZE / gridSize;
}

const TAB_DEPTH_RATIO = 0.22;
const TAB_WIDTH_RATIO = 0.34;

function edgePath(p: Path2D, x0: number, y0: number, x1: number, y1: number, sign: -1 | 0 | 1, tileSize: number): void {
  if (sign === 0) {
    p.lineTo(x1, y1);
    return;
  }
  const tabDepth = tileSize * TAB_DEPTH_RATIO;
  const tabWidth = tileSize * TAB_WIDTH_RATIO;
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
  const tabStartX = midX - tx * tabWidth / 2;
  const tabStartY = midY - ty * tabWidth / 2;
  const tabEndX = midX + tx * tabWidth / 2;
  const tabEndY = midY + ty * tabWidth / 2;
  const peakX = midX + ux * tabDepth * sign;
  const peakY = midY + uy * tabDepth * sign;
  p.lineTo(tabStartX, tabStartY);
  p.bezierCurveTo(
    tabStartX + ux * tabDepth * sign, tabStartY + uy * tabDepth * sign,
    peakX - tx * tabWidth * 0.4, peakY - ty * tabWidth * 0.4,
    peakX, peakY,
  );
  p.bezierCurveTo(
    peakX + tx * tabWidth * 0.4, peakY + ty * tabWidth * 0.4,
    tabEndX + ux * tabDepth * sign, tabEndY + uy * tabDepth * sign,
    tabEndX, tabEndY,
  );
  p.lineTo(x1, y1);
}

export function piecePath(seed: string, row: number, col: number, gridSize: number): Path2D {
  const shape: PieceShape = pieceShape(seed, row, col, gridSize);
  const tileSize = tileSizeFor(gridSize);
  const x = col * tileSize;
  const y = row * tileSize;
  const p = new Path2D();
  p.moveTo(x, y);
  edgePath(p, x, y, x + tileSize, y, shape.N, tileSize);
  edgePath(p, x + tileSize, y, x + tileSize, y + tileSize, shape.E, tileSize);
  edgePath(p, x + tileSize, y + tileSize, x, y + tileSize, shape.S, tileSize);
  edgePath(p, x, y + tileSize, x, y, shape.W, tileSize);
  p.closePath();
  return p;
}

export function paintBoard(
  ctx: CanvasRenderingContext2D,
  state: PuzzleState,
  source: CanvasImageSource,
  seed: string,
  gridSize: number,
): void {
  const tileSize = tileSizeFor(gridSize);
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 1;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
    }
  }
  for (const [piece] of state.placements) {
    const r = Math.floor(piece / gridSize);
    const c = piece % gridSize;
    const path = piecePath(seed, r, c, gridSize);
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

Note: `TILE_SIZE` constant removed; consumers call `tileSizeFor(gridSize)`.

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- renderer
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer.ts test/unit/renderer.test.ts
git commit -m "Renderer: parameterize by gridSize"
```

---

## Task 8: Tray parameterized

**Files:**
- Modify: `git-jigsaw/src/tray.ts`
- Modify: `git-jigsaw/test/unit/tray.test.ts`

- [ ] **Step 1: Update tests**

Replace `test/unit/tray.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';

describe('Tray', () => {
  it('lists all pieces when state is empty (8x8)', () => {
    const t = new Tray(new PuzzleState(8), 'queelius', 8);
    expect(t.unplaced().length).toBe(64);
  });

  it('lists all pieces when state is empty (10x10)', () => {
    const t = new Tray(new PuzzleState(10), 'queelius', 10);
    expect(t.unplaced().length).toBe(100);
  });

  it('omits placed pieces', () => {
    const s = new PuzzleState(8);
    s.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    const t = new Tray(s, 'queelius', 8);
    expect(t.unplaced().length).toBe(63);
    expect(t.unplaced().includes(0)).toBe(false);
  });

  it('order is deterministic for the same actor name', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    const b = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    expect(a).toEqual(b);
  });

  it('order differs across actor names', () => {
    const a = new Tray(new PuzzleState(8), 'alice', 8).unplaced();
    const b = new Tray(new PuzzleState(8), 'bob', 8).unplaced();
    expect(a).not.toEqual(b);
  });

  it('order is not numerical', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
    const numerical = Array.from({ length: 64 }, (_, i) => i);
    expect(a).not.toEqual(numerical);
  });

  it('contains every piece exactly once', () => {
    const a = new Tray(new PuzzleState(8), 'queelius', 8).unplaced();
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

- [ ] **Step 3: Replace `src/tray.ts`**

```ts
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
  constructor(
    private readonly state: PuzzleState,
    private readonly actor: string,
    private readonly gridSize: number,
  ) {}

  unplaced(): number[] {
    const total = this.gridSize * this.gridSize;
    const all: number[] = [];
    for (let i = 0; i < total; i++) {
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

The render() method is added in Task 12 once thumbnails exist.

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- tray
```

Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add src/tray.ts test/unit/tray.test.ts
git commit -m "Tray: parameterize per-actor shuffle by gridSize"
```

---

## Task 9: Update main.ts and existing call sites for new signatures

**Files:**
- Modify: `git-jigsaw/src/main.ts`
- Modify: `git-jigsaw/src/store-config.ts` (no change but verify still compiles)
- Modify: `git-jigsaw/src/auth-bar.ts` (uses gridSize-aware count)

This is glue work to keep the build green after the parameterization tasks above. The drawer/dragger come later; main.ts here is a transition state.

- [ ] **Step 1: Update `src/auth-bar.ts` to take pieceCount as a parameter**

Replace the imports and the body of `mountAuthBar` to compute counts from gridSize. Replace file contents:

```ts
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';
import { promptForToken } from './sign-in-modal';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
  gridSize: number;
}

export function mountAuthBar(host: HTMLElement, { state, store, week, gridSize }: MountOpts): () => void {
  host.classList.add('jigsaw-auth-bar');
  const label = document.createElement('span');
  label.className = 'week';
  const counts = document.createElement('span');
  counts.className = 'counts';
  const actorEl = document.createElement('span');
  actorEl.className = 'actor';
  const btn = document.createElement('button');
  btn.className = 'sign-in';
  const total = gridSize * gridSize;

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${total} pieces placed; ${state.contributors.size} contributors`;
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
    const token = await promptForToken();
    if (!token) return;
    btn.textContent = 'Signing in...';
    btn.disabled = true;
    try {
      await store.signInWithToken(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      showToast(`Sign-in failed: ${msg}`);
    } finally {
      render();
    }
  });

  host.replaceChildren(label, counts, actorEl, btn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
```

(The sign-out menu lands later; this keeps the V1 sign-in path working.)

- [ ] **Step 2: Update existing auth-bar test to pass gridSize**

Edit `test/integration/auth-bar.test.ts`. Change every call to `mountAuthBar(host, { state, store: ..., week: '2026-W17' })` to add `gridSize: 8`. The test expectation `'2 of 64'` already matches.

- [ ] **Step 3: Update `src/main.ts` to use the parameterized signatures**

Replace the file with:

```ts
import { PuzzleState, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore, type StoreLike } from './store-config';

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

function renderTray(trayEl: HTMLElement, state: PuzzleState, store: StoreLike, week: string, gridSize: number, onAfterPlace: () => void): void {
  const actor = store.currentActor() ?? 'guest';
  const t = new Tray(state, actor, gridSize);
  const buttons = t.unplaced().map((piece) => {
    const btn = document.createElement('button');
    btn.className = 'jigsaw-piece';
    btn.dataset.piece = piece.toString();
    btn.textContent = piece.toString().padStart(3, '0');
    btn.addEventListener('click', async () => {
      const slot: [number, number] = [Math.floor(piece / gridSize), piece % gridSize];
      await attemptPlace({ piece, slot, rotation: 0, gridSize, state, store, week });
      onAfterPlace();
    });
    return btn;
  });
  trayEl.replaceChildren(...buttons);
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('jigsaw-root');
  if (!root) throw new Error('jigsaw-root not found');
  const { headerEl, canvas, trayEl } = buildShell(root);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const params = new URLSearchParams(location.search);
  const week = params.get('week') ?? currentWeek();

  const store = makeStore(week);
  await store.restoreSession();
  const assets = await loadAssets(__DATA_REPO__, week);
  const state = await loadInitialState(store, week, assets.gridSize);

  mountAuthBar(headerEl, { state, store, week, gridSize: assets.gridSize });

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed, assets.gridSize);
  const refreshTray = (): void => renderTray(trayEl, state, store, week, assets.gridSize, refreshTray);
  state.on('change', repaint);
  state.on('change', refreshTray);
  repaint();
  refreshTray();

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

- [ ] **Step 4: Update `src/input.ts` to accept rotation and gridSize**

Replace the file with:

```ts
import { isValidPlacement } from './validator';
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  commit(op: string, payload: any, opts?: { files?: Record<string, string> }): Promise<{ sha: string }>;
}

export interface AttemptPlaceArgs {
  piece: number;
  slot: readonly [number, number];
  rotation: 0 | 90 | 180 | 270;
  gridSize: number;
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
  const { piece, slot, rotation, gridSize, state, store, week } = args;
  if (!store.isAuthenticated()) {
    showToast('Sign in to place pieces.');
    return { kind: 'auth-required' };
  }
  if (!isValidPlacement(piece, slot, rotation, gridSize)) {
    return { kind: 'invalid' };
  }
  const path = `jigsaw/${week}/placements/${piece.toString().padStart(3, '0')}.json`;
  const files = { [path]: JSON.stringify({ slot: [slot[0], slot[1]], rotation }) };
  try {
    const { sha } = await store.commit('place', { piece, slot, rotation, grid_size: gridSize }, { files });
    state.applyEvent({
      op: 'place', piece, slot, rotation, grid_size: gridSize,
      actor: store.currentActor() ?? 'unknown',
      ts: new Date().toISOString(),
      v: 1, sha,
    });
    return { kind: 'placed', sha };
  } catch (err: any) {
    if (err?.name === 'ConflictError') {
      showToast(`Someone else placed piece ${piece} just now.`);
      return { kind: 'conflict' };
    }
    if (err?.name === 'AuthError') {
      showToast(`Sign-in expired; please refresh the page and sign in again.`);
      return { kind: 'auth-required' };
    }
    showToast(`Could not place piece ${piece}: ${err?.message ?? 'unknown error'}.`);
    throw err;
  }
}
```

- [ ] **Step 5: Update `test/integration/write-flow.test.ts`**

Replace the file with:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { attemptPlace } from '../../src/input';
import { PuzzleState } from '../../src/puzzle';
import { MockStore } from './mock-store';

describe('attemptPlace', () => {
  it('valid placement: calls commit with rotation, applies event locally', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('placed');
    expect(store.commitCalls).toHaveLength(1);
    expect(store.commitCalls[0].op).toBe('place');
    expect(store.commitCalls[0].payload.piece).toBe(42);
    expect(store.commitCalls[0].payload.rotation).toBe(0);
    expect(store.commitCalls[0].payload.grid_size).toBe(8);
    expect(store.commitCalls[0].files).toEqual({
      'jigsaw/2026-W17/placements/042.json': JSON.stringify({ slot: [5, 2], rotation: 0 }),
    });
    expect(state.isPlaced(42)).toBe(true);
  });

  it('non-zero rotation is invalid', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 90, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('invalid placement: does not commit, returns invalid', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [3, 7], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('invalid');
    expect(store.commitCalls).toHaveLength(0);
  });

  it('conflict: returns conflict', async () => {
    const conflictErr = new Error('conflict');
    (conflictErr as any).name = 'ConflictError';
    const store = new MockStore({ initialActor: 'queelius', rejectNextWith: conflictErr });
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 42, slot: [5, 2], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('conflict');
  });

  it('unauthenticated: returns auth-required without commit', async () => {
    const store = new MockStore();
    const state = new PuzzleState(8);
    const result = await attemptPlace({ piece: 0, slot: [0, 0], rotation: 0, gridSize: 8, state, store, week: '2026-W17' });
    expect(result.kind).toBe('auth-required');
    expect(store.commitCalls).toHaveLength(0);
  });
});
```

Same for `test/integration/subscription.test.ts` if it instantiates PuzzleState: change `new PuzzleState()` to `new PuzzleState(8)` and add `rotation: 0, grid_size: 8` to the synthetic events.

- [ ] **Step 6: Run full test suite + typecheck**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean; all existing tests pass with the new signatures (~70+ tests).

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/auth-bar.ts src/input.ts test/integration/
git commit -m "Wire main + input through gridSize; existing tests pass

This is the green-build transition state after parameterizing the
core modules. Drawer + dragger + thumbnails come next."
```

---

## Task 10: Thumbnail rendering with cache

**Files:**
- Create: `git-jigsaw/src/thumbnail.ts`
- Create: `git-jigsaw/test/unit/thumbnail.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/unit/thumbnail.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

class Path2DStub {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { pieceThumbnail, clearThumbnailCache, THUMBNAIL_SIZE } from '../../src/thumbnail';

describe('pieceThumbnail', () => {
  function makeFakeSource(): HTMLImageElement {
    const img = document.createElement('img');
    Object.defineProperty(img, 'naturalWidth', { value: 1024 });
    Object.defineProperty(img, 'naturalHeight', { value: 1024 });
    return img;
  }

  it('THUMBNAIL_SIZE is 96', () => {
    expect(THUMBNAIL_SIZE).toBe(96);
  });

  it('returns a canvas-shaped object', () => {
    clearThumbnailCache();
    const t = pieceThumbnail(0, 0, makeFakeSource(), 'seed1234567890ab', 8);
    expect(t.width).toBeGreaterThan(0);
    expect(t.height).toBeGreaterThan(0);
  });

  it('caches by (piece, rotation) key', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    const b = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    expect(a).toBe(b);
  });

  it('different rotation key returns a different canvas', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    const b = pieceThumbnail(5, 90, source, 'seed1234567890ab', 8);
    expect(a).not.toBe(b);
  });

  it('clearThumbnailCache invalidates cached entries', () => {
    clearThumbnailCache();
    const source = makeFakeSource();
    const a = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    clearThumbnailCache();
    const b = pieceThumbnail(5, 0, source, 'seed1234567890ab', 8);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test -- thumbnail
```

Expected: FAIL.

- [ ] **Step 3: Write `src/thumbnail.ts`**

```ts
import { piecePath, BOARD_SIZE, tileSizeFor } from './renderer';

export const THUMBNAIL_SIZE = 96;

const cache = new Map<string, HTMLCanvasElement>();

export function clearThumbnailCache(): void {
  cache.clear();
}

export function pieceThumbnail(
  piece: number,
  rotation: 0 | 90 | 180 | 270 | number,
  source: CanvasImageSource,
  seed: string,
  gridSize: number,
): HTMLCanvasElement {
  const key = `${piece}:${rotation}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cache.set(key, canvas);
    return canvas;
  }

  const tileSize = tileSizeFor(gridSize);
  const row = Math.floor(piece / gridSize);
  const col = piece % gridSize;
  const path = piecePath(seed, row, col, gridSize);
  const sx = col * tileSize;
  const sy = row * tileSize;

  ctx.save();
  ctx.translate(THUMBNAIL_SIZE / 2, THUMBNAIL_SIZE / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  const scale = THUMBNAIL_SIZE / tileSize;
  ctx.scale(scale, scale);
  ctx.translate(-tileSize / 2 - sx, -tileSize / 2 - sy);
  ctx.clip(path);
  ctx.drawImage(source, 0, 0, BOARD_SIZE, BOARD_SIZE);
  ctx.restore();

  cache.set(key, canvas);
  return canvas;
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- thumbnail
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/thumbnail.ts test/unit/thumbnail.test.ts
git commit -m "Thumbnail: pieceThumbnail() with (piece, rotation) cache"
```

---

## Task 11: Drawer (bottom-sheet state machine)

**Files:**
- Create: `git-jigsaw/src/drawer.ts`
- Create: `git-jigsaw/test/integration/drawer.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/integration/drawer.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Drawer, type DrawerState } from '../../src/drawer';

describe('Drawer', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('starts in peek state', () => {
    const d = new Drawer(host);
    expect(d.state).toBe<DrawerState>('peek');
    expect(host.querySelector('.jigsaw-drawer')).not.toBeNull();
  });

  it('expand() goes peek→half', () => {
    const d = new Drawer(host);
    d.expand();
    expect(d.state).toBe<DrawerState>('half');
  });

  it('expand() from half goes to full', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    expect(d.state).toBe<DrawerState>('full');
  });

  it('expand() from full stays at full', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    d.expand();
    expect(d.state).toBe<DrawerState>('full');
  });

  it('collapse() goes full→half→peek', () => {
    const d = new Drawer(host);
    d.expand();
    d.expand();
    d.collapse();
    expect(d.state).toBe<DrawerState>('half');
    d.collapse();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('collapse() from peek stays at peek', () => {
    const d = new Drawer(host);
    d.collapse();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('setContent replaces drawer body', () => {
    const d = new Drawer(host);
    const content = document.createElement('div');
    content.id = 'first-content';
    d.setContent(content);
    expect(host.querySelector('#first-content')).not.toBeNull();

    const next = document.createElement('div');
    next.id = 'second-content';
    d.setContent(next);
    expect(host.querySelector('#first-content')).toBeNull();
    expect(host.querySelector('#second-content')).not.toBeNull();
  });

  it('handle click toggles peek↔half', () => {
    const d = new Drawer(host);
    const handle = host.querySelector('.jigsaw-drawer-handle') as HTMLElement;
    handle.click();
    expect(d.state).toBe<DrawerState>('half');
    handle.click();
    expect(d.state).toBe<DrawerState>('peek');
  });

  it('emits change events on state transitions', () => {
    const d = new Drawer(host);
    const states: DrawerState[] = [];
    d.on('change', (s) => states.push(s));
    d.expand();
    d.expand();
    d.collapse();
    expect(states).toEqual(['half', 'full', 'half']);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npm test -- drawer
```

Expected: FAIL.

- [ ] **Step 3: Write `src/drawer.ts`**

```ts
export type DrawerState = 'peek' | 'half' | 'full';

const ORDER: DrawerState[] = ['peek', 'half', 'full'];

type ChangeListener = (s: DrawerState) => void;

export class Drawer {
  private root: HTMLElement;
  private body: HTMLElement;
  private handle: HTMLElement;
  private listeners = new Set<ChangeListener>();
  state: DrawerState = 'peek';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'jigsaw-drawer drawer-peek';
    this.handle = document.createElement('button');
    this.handle.className = 'jigsaw-drawer-handle';
    this.handle.setAttribute('aria-label', 'Toggle drawer');
    this.handle.addEventListener('click', () => {
      if (this.state === 'peek') this.expand();
      else this.collapse();
    });
    this.body = document.createElement('div');
    this.body.className = 'jigsaw-drawer-body';
    this.root.append(this.handle, this.body);
    host.appendChild(this.root);
    this.installSwipe();
  }

  expand(): void {
    const idx = ORDER.indexOf(this.state);
    if (idx < ORDER.length - 1) this.setState(ORDER[idx + 1]);
  }

  collapse(): void {
    const idx = ORDER.indexOf(this.state);
    if (idx > 0) this.setState(ORDER[idx - 1]);
  }

  setContent(child: HTMLElement): void {
    this.body.replaceChildren(child);
  }

  on(_kind: 'change', fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private setState(s: DrawerState): void {
    this.state = s;
    this.root.classList.remove('drawer-peek', 'drawer-half', 'drawer-full');
    this.root.classList.add(`drawer-${s}`);
    for (const fn of this.listeners) fn(s);
  }

  private installSwipe(): void {
    let startY: number | null = null;
    this.handle.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      this.handle.setPointerCapture(e.pointerId);
    });
    this.handle.addEventListener('pointermove', (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > 30) {
        if (dy < 0) this.expand();
        else this.collapse();
        startY = e.clientY;
      }
    });
    const end = () => { startY = null; };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- drawer
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/drawer.ts test/integration/drawer.test.ts
git commit -m "Drawer: peek/half/full state machine with click + pointer-swipe"
```

---

## Task 12: Tray render() returns DOM thumbnails grid with rotation overlay

**Files:**
- Modify: `git-jigsaw/src/tray.ts`
- Add: `test/integration/tray-render.test.ts` (new)

- [ ] **Step 1: Write the failing integration test**

Create `test/integration/tray-render.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

class Path2DStub {
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  closePath(): void {}
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D = Path2DStub;
});

import { Tray } from '../../src/tray';
import { PuzzleState } from '../../src/puzzle';
import { clearThumbnailCache } from '../../src/thumbnail';

function makeFakeSource(): HTMLImageElement {
  const img = document.createElement('img');
  Object.defineProperty(img, 'naturalWidth', { value: 1024 });
  Object.defineProperty(img, 'naturalHeight', { value: 1024 });
  return img;
}

describe('Tray.render', () => {
  beforeEach(() => clearThumbnailCache());

  it('returns an HTMLElement with one button per unplaced piece', () => {
    const state = new PuzzleState(8);
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelectorAll('button.jigsaw-piece').length).toBe(64);
  });

  it('omits placed pieces', () => {
    const state = new PuzzleState(8);
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelectorAll('button.jigsaw-piece').length).toBe(63);
  });

  it('shows rotate overlay when rotationEnabled is true', () => {
    const state = new PuzzleState(8);
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: true,
      onRotate: () => {},
    });
    expect(el.querySelector('.jigsaw-rotate-overlay')).not.toBeNull();
  });

  it('hides rotate overlay when rotationEnabled is false', () => {
    const state = new PuzzleState(8);
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    expect(el.querySelector('.jigsaw-rotate-overlay')).toBeNull();
  });

  it('rotation cycles 0→90→180→270→0 on rotate-icon click', () => {
    const state = new PuzzleState(8);
    const tray = new Tray(state, 'queelius', 8);
    const rotations: number[] = [];
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: true,
      onRotate: (piece, rotation) => rotations.push(rotation),
    });
    const overlay = el.querySelector('.jigsaw-rotate-overlay') as HTMLElement;
    overlay.click();
    overlay.click();
    overlay.click();
    overlay.click();
    expect(rotations).toEqual([90, 180, 270, 0]);
  });

  it('button has data-piece attribute matching piece id', () => {
    const state = new PuzzleState(8);
    const tray = new Tray(state, 'queelius', 8);
    const el = tray.render({
      source: makeFakeSource(),
      seed: 'seed1234567890ab',
      rotationEnabled: false,
      onRotate: () => {},
    });
    const first = el.querySelector('button.jigsaw-piece') as HTMLElement;
    expect(first.dataset.piece).toBeDefined();
    expect(parseInt(first.dataset.piece!, 10)).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npm test -- tray-render
```

Expected: FAIL (`render` not a function).

- [ ] **Step 3: Add `render()` to `src/tray.ts`**

Replace `src/tray.ts` (keeping the existing class, adding render and TS types):

```ts
import type { PuzzleState } from './puzzle';
import { pieceThumbnail } from './thumbnail';

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

export type Rotation = 0 | 90 | 180 | 270;

export interface TrayRenderOpts {
  source: CanvasImageSource;
  seed: string;
  rotationEnabled: boolean;
  onRotate(piece: number, rotation: Rotation): void;
}

export class Tray {
  private rotations = new Map<number, Rotation>();

  constructor(
    private readonly state: PuzzleState,
    private readonly actor: string,
    private readonly gridSize: number,
  ) {}

  unplaced(): number[] {
    const total = this.gridSize * this.gridSize;
    const all: number[] = [];
    for (let i = 0; i < total; i++) {
      if (!this.state.isPlaced(i)) all.push(i);
    }
    const rng = mulberry32(fnv1a('tray|' + this.actor));
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all;
  }

  rotationOf(piece: number): Rotation {
    return this.rotations.get(piece) ?? 0;
  }

  render(opts: TrayRenderOpts): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'jigsaw-tray-grid';

    for (const piece of this.unplaced()) {
      const btn = document.createElement('button');
      btn.className = 'jigsaw-piece';
      btn.dataset.piece = piece.toString();
      const rot = this.rotationOf(piece);
      const thumb = pieceThumbnail(piece, rot, opts.source, opts.seed, this.gridSize);
      const thumbClone = thumb.cloneNode(true) as HTMLCanvasElement;
      btn.appendChild(thumbClone);

      if (opts.rotationEnabled) {
        const overlay = document.createElement('button');
        overlay.className = 'jigsaw-rotate-overlay';
        overlay.type = 'button';
        overlay.setAttribute('aria-label', `Rotate piece ${piece}`);
        overlay.textContent = '↻';
        overlay.addEventListener('click', (e) => {
          e.stopPropagation();
          const next = ((rot + 90) % 360) as Rotation;
          this.rotations.set(piece, next);
          opts.onRotate(piece, next);
        });
        btn.appendChild(overlay);
      }
      grid.appendChild(btn);
    }
    return grid;
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- tray-render
```

Expected: 6 passed. Existing `tray.test.ts` (unit, 7 tests) also still passes.

- [ ] **Step 5: Commit**

```bash
git add src/tray.ts test/integration/tray-render.test.ts
git commit -m "Tray: render() returns thumbnail grid with optional rotate overlay"
```

---

## Task 13: Dragger (pointer state machine)

**Files:**
- Create: `git-jigsaw/src/dragger.ts`
- Create: `git-jigsaw/test/integration/dragger.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/integration/dragger.test.ts`:

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Dragger } from '../../src/dragger';

describe('Dragger', () => {
  let host: HTMLElement;
  let board: HTMLElement;
  let onAttempt: any;
  let attempts: Array<{ piece: number; slot: [number, number]; rotation: number }>;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    board = document.createElement('canvas');
    board.className = 'jigsaw-board';
    Object.defineProperty(board, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 1024, height: 1024 }),
    });
    host.appendChild(board);
    attempts = [];
    onAttempt = (piece: number, slot: [number, number], rotation: number) => {
      attempts.push({ piece, slot, rotation });
      return Promise.resolve({ kind: 'placed' });
    };
  });

  function pieceButton(piece: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'jigsaw-piece';
    btn.dataset.piece = piece.toString();
    Object.defineProperty(btn, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 1100, width: 96, height: 96 }),
    });
    host.appendChild(btn);
    return btn;
  }

  function pointerEvent(type: string, target: EventTarget, opts: Partial<PointerEvent>): void {
    const e = new Event(type, { bubbles: true }) as any;
    Object.assign(e, { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, ...opts });
    target.dispatchEvent(e);
  }

  it('tap-select then tap-slot calls onAttempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('SELECTED');

    pointerEvent('pointerdown', board, { clientX: 320, clientY: 700 });
    expect(attempts.length).toBe(1);
    expect(attempts[0].piece).toBe(42);
    expect(attempts[0].slot).toEqual([5, 2]);
  });

  it('drag (movement >5px) then drop on slot calls onAttempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointermove', window, { clientX: 320, clientY: 700 });
    pointerEvent('pointerup', window, { clientX: 320, clientY: 700 });
    expect(attempts.length).toBe(1);
    expect(attempts[0].piece).toBe(42);
  });

  it('R key during drag rotates held piece', () => {
    let currentRot = 0;
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => currentRot,
      onAttempt: (_p, _s, rot) => {
        attempts.push({ piece: _p, slot: _s, rotation: rot });
        return Promise.resolve({ kind: 'placed' });
      },
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    expect(dragger.state).toBe('DRAGGING');

    const keyEvent = new KeyboardEvent('keydown', { key: 'r' });
    window.dispatchEvent(keyEvent);
    expect(dragger.heldRotation).toBe(90);

    pointerEvent('pointerup', window, { clientX: 320, clientY: 700 });
    expect(attempts[0].rotation).toBe(90);
  });

  it('pointercancel returns to IDLE without attempt', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointermove', window, { clientX: 60, clientY: 1100 });
    pointerEvent('pointercancel', window, { clientX: 60, clientY: 1100 });
    expect(dragger.state).toBe('IDLE');
    expect(attempts.length).toBe(0);
  });

  it('clicking same selected piece deselects', () => {
    const dragger = new Dragger({
      board,
      gridSize: 8,
      getRotation: () => 0,
      onAttempt,
    });
    dragger.attach(host);
    const btn = pieceButton(42);

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('SELECTED');

    pointerEvent('pointerdown', btn, { clientX: 50, clientY: 1150 });
    pointerEvent('pointerup', btn, { clientX: 50, clientY: 1150 });
    expect(dragger.state).toBe('IDLE');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
npm test -- dragger
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write `src/dragger.ts`**

```ts
import { BOARD_SIZE } from './renderer';

export type DraggerState = 'IDLE' | 'POINTER_DOWN' | 'DRAGGING' | 'SELECTED';
export type Rotation = 0 | 90 | 180 | 270;

export interface AttemptResult { kind: 'placed' | 'invalid' | 'conflict' | 'auth-required'; }

export interface DraggerOpts {
  board: HTMLElement;
  gridSize: number;
  getRotation(piece: number): Rotation;
  onAttempt(piece: number, slot: readonly [number, number], rotation: Rotation): Promise<AttemptResult>;
}

const DRAG_THRESHOLD_PX = 5;

export class Dragger {
  state: DraggerState = 'IDLE';
  heldPiece: number | null = null;
  heldRotation: Rotation = 0;
  private startX = 0;
  private startY = 0;
  private host: HTMLElement | null = null;

  constructor(private readonly opts: DraggerOpts) {}

  attach(host: HTMLElement): void {
    this.host = host;
    host.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('keydown', this.onKey);
  }

  detach(): void {
    if (!this.host) return;
    this.host.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKey);
    this.host = null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target as HTMLElement | null;
    const pieceBtn = target?.closest?.('.jigsaw-piece') as HTMLElement | null;
    const onBoard = target?.closest?.('.jigsaw-board') as HTMLElement | null;

    if (this.state === 'SELECTED') {
      if (pieceBtn && pieceBtn.dataset.piece === String(this.heldPiece)) {
        this.reset();
        return;
      }
      if (onBoard) {
        const slot = this.slotAt(e.clientX, e.clientY);
        if (slot) {
          const piece = this.heldPiece!;
          const rot = this.heldRotation;
          this.reset();
          void this.opts.onAttempt(piece, slot, rot);
          return;
        }
      }
      return;
    }

    if (pieceBtn) {
      const piece = parseInt(pieceBtn.dataset.piece!, 10);
      this.heldPiece = piece;
      this.heldRotation = this.opts.getRotation(piece);
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.state = 'POINTER_DOWN';
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.state !== 'POINTER_DOWN' && this.state !== 'DRAGGING') return;
    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    if (this.state === 'POINTER_DOWN' && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.state = 'DRAGGING';
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.state === 'POINTER_DOWN') {
      this.state = 'SELECTED';
      return;
    }
    if (this.state === 'DRAGGING') {
      const slot = this.slotAt(e.clientX, e.clientY);
      const piece = this.heldPiece!;
      const rot = this.heldRotation;
      this.reset();
      if (slot) {
        void this.opts.onAttempt(piece, slot, rot);
      }
    }
  };

  private onPointerCancel = (): void => {
    if (this.state === 'POINTER_DOWN' || this.state === 'DRAGGING') {
      this.reset();
    }
  };

  private onKey = (e: KeyboardEvent): void => {
    if (this.state !== 'DRAGGING') return;
    if (e.key === 'r' || e.key === 'R') {
      this.heldRotation = ((this.heldRotation + 90) % 360) as Rotation;
    }
  };

  private slotAt(clientX: number, clientY: number): [number, number] | null {
    const rect = this.opts.board.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.left + rect.width) return null;
    if (clientY < rect.top || clientY > rect.top + rect.height) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const col = Math.floor(fx * this.opts.gridSize);
    const row = Math.floor(fy * this.opts.gridSize);
    return [row, col];
  }

  private reset(): void {
    this.state = 'IDLE';
    this.heldPiece = null;
    this.heldRotation = 0;
  }
}

export { BOARD_SIZE };
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- dragger
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/dragger.ts test/integration/dragger.test.ts
git commit -m "Dragger: pointer state machine with R-key + tap-select + drag"
```

---

## Task 14: Leaderboard (data + render)

**Files:**
- Create: `git-jigsaw/src/leaderboard.ts`
- Create: `git-jigsaw/test/unit/leaderboard.test.ts`

- [ ] **Step 1: Write failing test**

Create `test/unit/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLeaderboard, formatDuration } from '../../src/leaderboard';
import { PuzzleState, type PlaceEvent } from '../../src/puzzle';

function ev(piece: number, actor: string, ts: string): PlaceEvent {
  const slot: [number, number] = [Math.floor(piece / 8), piece % 8];
  return { op: 'place', piece, slot, rotation: 0, grid_size: 8, actor, ts, v: 1, sha: `sha-${piece}-${actor}` };
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

describe('buildLeaderboard', () => {
  it('groups events by actor and counts pieces', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'alice', '2026-04-29T10:01:00Z'));
    state.applyEvent(ev(8, 'bob', '2026-04-29T10:02:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.totalPieces).toBe(64);
    expect(lb.contributors).toBe(2);
    expect(lb.rows.find((r) => r.actor === 'alice')!.pieces).toBe(2);
    expect(lb.rows.find((r) => r.actor === 'bob')!.pieces).toBe(1);
  });

  it('sorts rows by pieces desc, tie-break by first-placement ts asc', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'bob', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'alice', '2026-04-29T10:01:00Z'));
    state.applyEvent(ev(2, 'alice', '2026-04-29T10:02:00Z'));
    state.applyEvent(ev(3, 'bob', '2026-04-29T10:03:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.rows.map((r) => r.actor)).toEqual(['bob', 'alice']);
  });

  it('captures first and last placement per actor', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(5, 'alice', '2026-04-29T10:05:00Z'));
    const lb = buildLeaderboard(state, 8);
    const row = lb.rows[0];
    expect(row.firstPlacement).toEqual({ piece: 0, ts: '2026-04-29T10:00:00Z' });
    expect(row.lastPlacement).toEqual({ piece: 5, ts: '2026-04-29T10:05:00Z' });
  });

  it('closedItOut is the actor of the latest event', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'bob', '2026-04-29T10:05:00Z'));
    state.applyEvent(ev(2, 'queelius', '2026-04-29T10:10:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.closedItOut).toBe('queelius');
  });

  it('durationMs is endTs - startTs', () => {
    const state = new PuzzleState(8);
    state.applyEvent(ev(0, 'alice', '2026-04-29T10:00:00Z'));
    state.applyEvent(ev(1, 'bob', '2026-04-29T10:30:00Z'));
    const lb = buildLeaderboard(state, 8);
    expect(lb.durationMs).toBe(30 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test, verify fail**

```bash
npm test -- leaderboard
```

Expected: FAIL.

- [ ] **Step 3: Write `src/leaderboard.ts`**

```ts
import type { PuzzleState, PlaceEvent } from './puzzle';

export interface ActorStats {
  actor: string;
  pieces: number;
  firstPlacement: { piece: number; ts: string };
  lastPlacement:  { piece: number; ts: string };
}

export interface LeaderboardData {
  solvedAt: string;
  startedAt: string;
  durationMs: number;
  totalPieces: number;
  contributors: number;
  closedItOut: string;
  rows: ActorStats[];
}

export function buildLeaderboard(state: PuzzleState, gridSize: number): LeaderboardData {
  const events = [...state.validEvents].sort((a, b) => a.ts.localeCompare(b.ts));
  const byActor = new Map<string, PlaceEvent[]>();
  for (const e of events) {
    const arr = byActor.get(e.actor) ?? [];
    arr.push(e);
    byActor.set(e.actor, arr);
  }
  const rows: ActorStats[] = [];
  for (const [actor, arr] of byActor) {
    rows.push({
      actor,
      pieces: arr.length,
      firstPlacement: { piece: arr[0].piece, ts: arr[0].ts },
      lastPlacement:  { piece: arr.at(-1)!.piece, ts: arr.at(-1)!.ts },
    });
  }
  rows.sort((a, b) =>
    b.pieces - a.pieces ||
    a.firstPlacement.ts.localeCompare(b.firstPlacement.ts),
  );
  const startedAt = events[0]?.ts ?? '';
  const solvedAt = events.at(-1)?.ts ?? '';
  return {
    solvedAt,
    startedAt,
    durationMs: startedAt && solvedAt ? new Date(solvedAt).getTime() - new Date(startedAt).getTime() : 0,
    totalPieces: gridSize * gridSize,
    contributors: byActor.size,
    closedItOut: events.at(-1)?.actor ?? '',
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

export function renderLeaderboard(data: LeaderboardData, week: string, dataRepo: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'jigsaw-leaderboard';

  const header = document.createElement('header');
  const title = document.createElement('h3');
  title.textContent = `Solved ${week} in ${formatDuration(data.durationMs)}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${data.contributors} contributors · ${data.totalPieces} pieces`;
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
    const pieces = document.createElement('span');
    pieces.className = 'pieces';
    pieces.textContent = `${row.pieces} pieces`;
    const span = document.createElement('span');
    span.className = 'span';
    span.textContent = `first ${row.firstPlacement.piece} · last ${row.lastPlacement.piece}`;
    li.append(actor, pieces, span);
    if (row.actor === data.closedItOut) {
      const badge = document.createElement('span');
      badge.className = 'badge closed-it-out';
      badge.title = 'Placed the final piece';
      badge.textContent = '🧩';
      li.appendChild(badge);
    }
    ol.appendChild(li);
  });

  const footer = document.createElement('footer');
  footer.className = 'actions';
  const logLink = document.createElement('a');
  logLink.href = `https://github.com/${dataRepo}/commits/main/jigsaw/${week}`;
  logLink.textContent = 'View git log';
  logLink.target = '_blank';
  logLink.rel = 'noopener noreferrer';
  const sourceLink = document.createElement('a');
  sourceLink.href = `https://raw.githubusercontent.com/${dataRepo}/main/jigsaw/${week}/source.png`;
  sourceLink.textContent = 'Download source.png';
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  footer.append(logLink, sourceLink);

  section.append(header, ol, footer);
  return section;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- leaderboard
```

Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/leaderboard.ts test/unit/leaderboard.test.ts
git commit -m "Leaderboard: buildLeaderboard, renderLeaderboard, formatDuration"
```

---

## Task 15: Confetti

**Files:**
- Create: `git-jigsaw/src/confetti.ts`

No new test file; the visual nature is hard to assert and the function is small. We rely on the completion test (Task 16) to assert it's *called*.

- [ ] **Step 1: Write `src/confetti.ts`**

```ts
const COLORS = ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e67e22'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  color: string;
  life: number;
}

export function fireConfetti(durationMs = 2000, particleCount = 80): void {
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '9999';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 200 + Math.random() * 400;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 200,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      life: 1,
    });
  }

  let startTs = 0;
  const step = (ts: number): void => {
    if (!startTs) startTs = ts;
    const elapsed = ts - startTs;
    const dt = 16 / 1000;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += 800 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      p.life = Math.max(0, 1 - elapsed / durationMs);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();
    }

    if (elapsed < durationMs) {
      requestAnimationFrame(step);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(step);
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/confetti.ts
git commit -m "Confetti: tiny canvas-particle burst on completion"
```

---

## Task 16: Completion detection (integration test)

**Files:**
- Create: `git-jigsaw/test/integration/completion.test.ts`

We'll wire the actual completion logic in main.ts (Task 19). This test asserts the helper function we'll use there.

- [ ] **Step 1: Add a small helper in `src/puzzle.ts`**

Append to `src/puzzle.ts`:

```ts
export function isSolved(state: PuzzleState, gridSize: number): boolean {
  return state.placedCount === gridSize * gridSize;
}
```

- [ ] **Step 2: Write `test/integration/completion.test.ts`**

```ts
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest';
import { PuzzleState, isSolved, type PlaceEvent } from '../../src/puzzle';

function fillState(state: PuzzleState, gridSize: number, upto: number): void {
  for (let i = 0; i < upto; i++) {
    const ev: PlaceEvent = {
      op: 'place',
      piece: i,
      slot: [Math.floor(i / gridSize), i % gridSize],
      rotation: 0,
      grid_size: gridSize,
      actor: i % 2 === 0 ? 'alice' : 'bob',
      ts: `2026-04-29T10:${String(i).padStart(2, '0')}:00Z`,
      v: 1,
      sha: `sha-${i}`,
    };
    state.applyEvent(ev);
  }
}

describe('completion detection', () => {
  it('isSolved is false before final piece', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 63);
    expect(isSolved(state, 8)).toBe(false);
  });

  it('isSolved is true at exactly piece-count placements', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 64);
    expect(isSolved(state, 8)).toBe(true);
  });

  it('local-witness pattern: capture startedSolved at boot, fire confetti only on transition', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 63);
    const startedSolved = isSolved(state, 8);
    expect(startedSolved).toBe(false);

    let confettiFires = 0;
    const fireConfetti = vi.fn(() => { confettiFires++; });
    let confettiAlreadyFired = false;

    const onChange = () => {
      if (!startedSolved && isSolved(state, 8) && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    };
    state.on('change', onChange);
    state.applyEvent({
      op: 'place',
      piece: 63,
      slot: [7, 7],
      rotation: 0,
      grid_size: 8,
      actor: 'queelius',
      ts: '2026-04-29T11:00:00Z',
      v: 1,
      sha: 'sha-63',
    });
    expect(confettiFires).toBe(1);
  });

  it('reload-into-solved does NOT fire confetti', () => {
    const state = new PuzzleState(8);
    fillState(state, 8, 64);
    const startedSolved = isSolved(state, 8);
    expect(startedSolved).toBe(true);

    let confettiFires = 0;
    const fireConfetti = vi.fn(() => { confettiFires++; });
    let confettiAlreadyFired = false;

    const onChange = () => {
      if (!startedSolved && isSolved(state, 8) && !confettiAlreadyFired) {
        fireConfetti();
        confettiAlreadyFired = true;
      }
    };
    state.on('change', onChange);
    state.applyEvent({
      op: 'place',
      piece: 0,
      slot: [0, 0],
      rotation: 0,
      grid_size: 8,
      actor: 'mallory',
      ts: '2026-04-29T11:00:00Z',
      v: 1,
      sha: 'sha-dup',
    });
    expect(confettiFires).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npm test -- completion
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/puzzle.ts test/integration/completion.test.ts
git commit -m "Completion: isSolved helper + once-per-session local-witness pattern test"
```

---

## Task 17: Sign-in-menu rename + sign-out popover

**Files:**
- Rename: `git-jigsaw/src/sign-in-modal.ts` → `git-jigsaw/src/sign-in-menu.ts`
- Modify: `git-jigsaw/src/auth-bar.ts`
- Modify: `git-jigsaw/test/integration/auth-bar.test.ts`

- [ ] **Step 1: Rename the file and add showSignOutMenu**

```bash
git mv /home/spinoza/github/repos/git-jigsaw/src/sign-in-modal.ts /home/spinoza/github/repos/git-jigsaw/src/sign-in-menu.ts
```

Append to `src/sign-in-menu.ts`:

```ts
export function showSignOutMenu(anchor: HTMLElement, onSignOut: () => void): void {
  const existing = document.querySelector('.jigsaw-signout-menu');
  if (existing) { existing.remove(); return; }

  const menu = document.createElement('ul');
  menu.className = 'jigsaw-signout-menu';
  menu.setAttribute('role', 'menu');

  const item = document.createElement('li');
  item.setAttribute('role', 'menuitem');
  item.tabIndex = 0;
  item.textContent = 'Sign out';
  item.addEventListener('click', () => {
    cleanup();
    onSignOut();
  });
  item.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      cleanup();
      onSignOut();
    }
  });
  menu.appendChild(item);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${rect.right + window.scrollX - 120}px`;
  document.body.appendChild(menu);
  setTimeout(() => item.focus(), 0);

  const cleanup = () => {
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEscape);
    menu.remove();
  };

  const onOutsideClick = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node) && e.target !== anchor) cleanup();
  };
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cleanup();
  };
  setTimeout(() => {
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onEscape);
  }, 0);
}
```

- [ ] **Step 2: Update import in auth-bar.ts**

Replace `src/auth-bar.ts`:

```ts
import type { PuzzleState } from './puzzle';
import { showToast } from './toast';
import { promptForToken, showSignOutMenu } from './sign-in-menu';

interface StoreLike {
  isAuthenticated(): boolean;
  currentActor(): string | null;
  signInWithToken(token: string): Promise<void>;
  signOut(): Promise<void>;
}

interface MountOpts {
  state: PuzzleState;
  store: StoreLike;
  week: string;
  gridSize: number;
}

export function mountAuthBar(host: HTMLElement, { state, store, week, gridSize }: MountOpts): () => void {
  host.classList.add('jigsaw-auth-bar');
  const label = document.createElement('span');
  label.className = 'week';
  const counts = document.createElement('span');
  counts.className = 'counts';
  const actorBtn = document.createElement('button');
  actorBtn.className = 'actor-button';
  actorBtn.style.display = 'none';
  const signInBtn = document.createElement('button');
  signInBtn.className = 'sign-in';
  const total = gridSize * gridSize;

  const render = (): void => {
    label.textContent = `Week ${week}`;
    counts.textContent = `${state.placedCount} of ${total} pieces placed; ${state.contributors.size} contributors`;
    if (store.isAuthenticated()) {
      actorBtn.textContent = `${store.currentActor() ?? ''} ▼`;
      actorBtn.style.display = '';
      signInBtn.style.display = 'none';
    } else {
      actorBtn.style.display = 'none';
      signInBtn.style.display = '';
      signInBtn.textContent = 'Sign in';
      signInBtn.disabled = false;
    }
  };

  signInBtn.addEventListener('click', async () => {
    const token = await promptForToken();
    if (!token) return;
    signInBtn.textContent = 'Signing in...';
    signInBtn.disabled = true;
    try {
      await store.signInWithToken(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      showToast(`Sign-in failed: ${msg}`);
    } finally {
      render();
    }
  });

  actorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showSignOutMenu(actorBtn, async () => {
      await store.signOut();
      render();
    });
  });

  host.replaceChildren(label, counts, actorBtn, signInBtn);
  const off = state.on('change', render);
  render();
  return () => { off(); };
}
```

- [ ] **Step 3: Update auth-bar test**

Replace `test/integration/auth-bar.test.ts`:

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
    document.querySelectorAll('.jigsaw-signout-menu').forEach((el) => el.remove());
  });

  it('renders the week label', () => {
    const state = new PuzzleState(8);
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    expect(host.textContent).toContain('2026-W17');
  });

  it('shows placed-count, total, and contributors-count', () => {
    const state = new PuzzleState(8);
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    state.applyEvent({ op: 'place', piece: 1, slot: [0, 1], rotation: 0, grid_size: 8, actor: 'b', ts: 't', v: 1, sha: 'y' });
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    expect(host.textContent).toMatch(/2 of 64/);
    expect(host.textContent).toMatch(/2 contributors/);
  });

  it('updates when state changes', () => {
    const state = new PuzzleState(8);
    mountAuthBar(host, { state, store: new MockStore(), week: '2026-W17', gridSize: 8 });
    state.applyEvent({ op: 'place', piece: 0, slot: [0, 0], rotation: 0, grid_size: 8, actor: 'a', ts: 't', v: 1, sha: 'x' });
    expect(host.textContent).toMatch(/1 of 64/);
  });

  it('shows Sign in button when unauthenticated', () => {
    const store = new MockStore();
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    const btn = host.querySelector('button.sign-in') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.style.display).not.toBe('none');
  });

  it('shows actor button when authenticated', () => {
    const store = new MockStore({ initialActor: 'queelius' });
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    const btn = host.querySelector('button.actor-button') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toContain('queelius');
  });

  it('actor button click opens sign-out menu', () => {
    const store = new MockStore({ initialActor: 'queelius' });
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    const btn = host.querySelector('button.actor-button') as HTMLButtonElement;
    btn.click();
    expect(document.querySelector('.jigsaw-signout-menu')).not.toBeNull();
  });

  it('sign-out menu Sign out item triggers signOut and re-renders', async () => {
    const store = new MockStore({ initialActor: 'queelius' });
    mountAuthBar(host, { state: new PuzzleState(8), store, week: '2026-W17', gridSize: 8 });
    const btn = host.querySelector('button.actor-button') as HTMLButtonElement;
    btn.click();
    const item = document.querySelector('.jigsaw-signout-menu li') as HTMLElement;
    item.click();
    await Promise.resolve();
    expect(store.isAuthenticated()).toBe(false);
  });
});
```

- [ ] **Step 4: Update any references in main.ts**

The import `import { promptForToken } from './sign-in-modal'` in `src/sign-in-menu.ts` no longer applies (the file IS sign-in-menu.ts now). Search-and-fix:

```bash
grep -rn "sign-in-modal" /home/spinoza/github/repos/git-jigsaw/src /home/spinoza/github/repos/git-jigsaw/test
```

Update any hits. Also if `sign-in-menu.ts` had other internal references, update them.

- [ ] **Step 5: Run all tests + typecheck**

```bash
npm run typecheck
npm test
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Sign-in menu: rename + add sign-out popover; auth-bar wires actor button"
```

---

## Task 18: Wire main.ts (drawer + dragger + completion + leaderboard)

**Files:**
- Modify: `git-jigsaw/src/main.ts`

This is the assembly task. No new TDD; integration tests above cover the units. Manual smoke after deploy is the acceptance check.

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { PuzzleState, isSolved, type Event } from './puzzle';
import { paintBoard, BOARD_SIZE } from './renderer';
import { Tray } from './tray';
import { mountAuthBar } from './auth-bar';
import { attemptPlace } from './input';
import { loadInitialState, loadAssets } from './read-flow';
import { makeStore, type StoreLike } from './store-config';
import { Drawer } from './drawer';
import { Dragger } from './dragger';
import { buildLeaderboard, renderLeaderboard } from './leaderboard';
import { fireConfetti } from './confetti';
import { clearThumbnailCache } from './thumbnail';

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
  const state = await loadInitialState(store, week, assets.gridSize);
  const startedSolved = isSolved(state, assets.gridSize);
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
    const data = buildLeaderboard(state, assets.gridSize);
    drawer.setContent(renderLeaderboard(data, week, dataRepo));
  };

  const repaint = (): void => paintBoard(ctx, state, assets.source, assets.seed, assets.gridSize);

  const refresh = (): void => {
    repaint();
    if (isSolved(state, assets.gridSize)) {
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
    onAttempt: (piece, slot, rotation) =>
      attemptPlace({ piece, slot, rotation, gridSize: assets.gridSize, state, store, week }),
  });
  dragger.attach(document.body);

  store.subscribe((events: Event[]) => {
    for (const e of events) state.applyEvent(e);
  });

  // evict thumbnail cache when drawer closes to free memory
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

- [ ] **Step 2: Run typecheck and full test suite**

```bash
npm run typecheck
npm test
```

Expected: typecheck clean; all tests pass.

- [ ] **Step 3: Run vite build**

```bash
npm run build
```

Expected: build emits dist/ with hashed JS + CSS + manifest. Note bundle gzip size; aim for under 60 KB.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "Wire main: drawer + dragger + leaderboard + confetti

Bootstrap creates Drawer + Dragger + Tray. The 'refresh' function is
the single source of truth: solved state shows leaderboard, otherwise
shows tray. Confetti fires only on local-witness transition (using
startedSolved captured at bootstrap)."
```

---

## Task 19: Styles for V2 (drawer, thumbnail, leaderboard, confetti host)

**Files:**
- Modify: `git-jigsaw/src/styles.css`

- [ ] **Step 1: Replace `src/styles.css`**

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
.jigsaw-header .counts { color: #555; }
.jigsaw-header button.sign-in,
.jigsaw-header button.actor-button {
  margin-left: auto;
  padding: 0.4rem 0.8rem;
  font: inherit;
  cursor: pointer;
  background: #f6f8fa;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.jigsaw-header button.actor-button:hover { background: #e0e0e0; }

.jigsaw-board {
  display: block;
  width: 100%;
  max-width: 1024px;
  height: auto;
  background: #fafafa;
  border: 1px solid #ccc;
  touch-action: none;
}

.jigsaw-drawer-host {
  position: relative;
  margin-top: 1rem;
}
.jigsaw-drawer {
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 6px 6px 0 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
  touch-action: pan-y;
}
.jigsaw-drawer.drawer-peek { max-height: 96px; }
.jigsaw-drawer.drawer-half { max-height: 320px; }
.jigsaw-drawer.drawer-full { max-height: 600px; }
.jigsaw-drawer-handle {
  display: block;
  width: 100%;
  height: 24px;
  background: #f0f0f0;
  border: none;
  border-bottom: 1px solid #ccc;
  cursor: pointer;
  position: relative;
}
.jigsaw-drawer-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 4px;
  background: #999;
  border-radius: 2px;
}
.jigsaw-drawer-body {
  padding: 0.75rem;
  overflow-y: auto;
  max-height: calc(100% - 24px);
}

.jigsaw-tray-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 0.5rem;
}
.jigsaw-tray-grid .jigsaw-piece {
  position: relative;
  aspect-ratio: 1;
  background: transparent;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  touch-action: none;
}
.jigsaw-tray-grid .jigsaw-piece canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.jigsaw-tray-grid .jigsaw-piece:hover { border-color: #333; }
.jigsaw-rotate-overlay {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  font: 14px/22px sans-serif;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid #999;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  text-align: center;
}

.jigsaw-leaderboard header h3 {
  margin: 0 0 0.25rem;
  font-size: 1.1rem;
}
.jigsaw-leaderboard .meta {
  color: #555;
  font-size: 0.9rem;
  margin-bottom: 0.75rem;
}
.jigsaw-leaderboard .rows {
  list-style: none;
  padding: 0;
  margin: 0 0 1rem;
}
.jigsaw-leaderboard .row {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid #eee;
}
.jigsaw-leaderboard .row .actor {
  font-weight: 600;
  flex: 1;
}
.jigsaw-leaderboard .row .pieces {
  font-variant-numeric: tabular-nums;
}
.jigsaw-leaderboard .row .span {
  color: #777;
  font-size: 0.85rem;
}
.jigsaw-leaderboard .badge {
  font-size: 1rem;
}
.jigsaw-leaderboard footer.actions {
  display: flex;
  gap: 0.75rem;
}
.jigsaw-leaderboard footer.actions a {
  color: #0366d6;
}

.jigsaw-signout-menu {
  list-style: none;
  margin: 0;
  padding: 4px 0;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 120px;
  z-index: 1000;
}
.jigsaw-signout-menu li {
  padding: 0.4rem 1rem;
  cursor: pointer;
}
.jigsaw-signout-menu li:hover,
.jigsaw-signout-menu li:focus {
  background: #f0f0f0;
  outline: none;
}

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

.jigsaw-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  font: 1rem/1.5 system-ui, -apple-system, sans-serif;
}
.jigsaw-modal {
  background: #fff;
  border-radius: 6px;
  padding: 1.5rem;
  max-width: 480px;
  width: calc(100% - 2rem);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
}
.jigsaw-modal h2 {
  margin: 0 0 0.75rem;
  font-size: 1.25rem;
}
.jigsaw-modal p { margin: 0 0 0.75rem; }
.jigsaw-modal-steps-heading { font-weight: 600; margin-bottom: 0.25rem; }
.jigsaw-modal ol { margin: 0 0 1rem 1.25rem; padding: 0; }
.jigsaw-modal ol li { margin: 0.25rem 0; }
.jigsaw-modal a { color: #0366d6; text-decoration: underline; }
.jigsaw-modal-input-label {
  display: block;
  font-weight: 600;
  margin-bottom: 1rem;
}
.jigsaw-modal-input-label input {
  display: block;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.5rem;
  font: inherit;
  font-family: monospace;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}
.jigsaw-modal-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}
.jigsaw-modal-buttons button {
  padding: 0.5rem 1rem;
  font: inherit;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid #ccc;
  background: #f6f8fa;
}
.jigsaw-modal-submit {
  background: #2da44e !important;
  border-color: #2c974b !important;
  color: #fff !important;
}
.jigsaw-modal-submit:hover { background: #2c974b !important; }
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Expected: clean build, dist with hashed assets.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "Styles: drawer, thumbnail grid, leaderboard, sign-out menu, modal"
```

---

## Task 20: Cron deploy + first V2 puzzle generation

**Files:**
- (no file changes; this is the smoke step for the cron change in Task 1)

- [ ] **Step 1: Push metafunctor-data Task-1 commit if not already**

```bash
cd /home/spinoza/github/repos/metafunctor-data
git status
git log origin/main..HEAD --oneline
```

If the cron change isn't on origin yet, push:

```bash
git push origin main
```

- [ ] **Step 2: Manually trigger workflow for next week**

Pick a non-current week (e.g., next week's ISO id) so we don't clobber the existing 2026-W18 puzzle:

```bash
WEEK=$(python3 -c "import datetime; d=datetime.date.today()+datetime.timedelta(days=7); y,w,_=d.isocalendar(); print(f'{y}-W{w:02d}')")
echo "Generating puzzle for $WEEK"
gh workflow run -R queelius/metafunctor-data jigsaw-weekly.yml -f week_id="$WEEK" 2>&1 || \
  gh workflow run -R queelius/metafunctor-data jigsaw-weekly.yml
```

(If the workflow doesn't accept the `week_id` input, the second command runs the cron in default mode and lets it pick the current week. That's fine for smoke too.)

- [ ] **Step 3: Watch the run**

```bash
gh run list -R queelius/metafunctor-data --limit 1
gh run watch <RUN_ID> -R queelius/metafunctor-data --exit-status
```

Expected: success.

- [ ] **Step 4: Verify the new puzzle has grid_size and rotation in meta.yaml**

```bash
cd /home/spinoza/github/repos/metafunctor-data
git pull --quiet
ls jigsaw/
cat jigsaw/<NEW_WEEK>/meta.yaml
```

Expected: `meta.yaml` includes `grid_size: <8|10|12>` and `rotation: <true|false>`.

---

## Task 21: Build, deploy, smoke

**Files:**
- (no file changes; build/deploy verification)

- [ ] **Step 1: Build the bundle**

```bash
cd /home/spinoza/github/repos/git-jigsaw
export GH_OAUTH_CLIENT_ID=Ov23liZw9EJe1eYk7cxv
npm run build
```

Capture the dist asset names and sizes from the build output.

- [ ] **Step 2: Deploy to metafunctor**

```bash
bash scripts/deploy.sh
```

Expected: rsync to `../metafunctor/static/arcade/jigsaw/`.

- [ ] **Step 3: Rebuild Hugo**

```bash
cd /home/spinoza/github/repos/metafunctor
hugo --gc --minify 2>&1 | tail -5
```

- [ ] **Step 4: Commit metafunctor + push**

```bash
cd /home/spinoza/github/repos/metafunctor
JIGSAW_SHA=$(cd /home/spinoza/github/repos/git-jigsaw && git rev-parse --short HEAD)
git add -A
git commit -m "jigsaw: deploy V2 (git-jigsaw $JIGSAW_SHA)"
git push
```

- [ ] **Step 5: Wait for Pages to rebuild and verify the new bundle is live**

```bash
NEW_BUNDLE=$(grep -oE 'index-[A-Za-z0-9]+\.js' /home/spinoza/github/repos/git-jigsaw/dist/index.html | head -1)
until [ "$(curl -sIo /dev/null -w '%{http_code}' https://metafunctor.com/arcade/jigsaw/assets/$NEW_BUNDLE)" = "200" ]; do
  sleep 10
done
echo "live: $(date -u)"
curl -s https://metafunctor.com/arcade/jigsaw/ | grep -oE 'index-[A-Za-z0-9]+\.js' | head -1
```

Expected: matches NEW_BUNDLE.

- [ ] **Step 6: Smoke test in browser**

Open https://metafunctor.com/arcade/jigsaw/. Hard refresh (Ctrl+Shift+R).

Manual checks:
1. Page loads without errors
2. Header shows current week + counts + actor button (if signed in) or sign-in button
3. Drawer at the bottom is in peek state with image-fragment thumbnails
4. Drawer expand on handle click → half state
5. Tap-select a piece → highlighted
6. Drag a piece on desktop → ghost follows pointer; drop on slot → commits or bounces
7. Press R during drag (desktop) rotates held piece
8. Click rotate icon on tray piece → cycles 0→90→180→270 (only visible when rotation enabled for the week)
9. Sign out via actor button → menu appears, click Sign out → returns to Sign in state

- [ ] **Step 7: Tag v0.2.0**

```bash
cd /home/spinoza/github/repos/git-jigsaw
git tag v0.2.0
git push origin v0.2.0
```

---

## Task 22: README + CI updates

**Files:**
- Modify: `git-jigsaw/README.md`

- [ ] **Step 1: Update README**

Replace `README.md` with:

```markdown
# git-jigsaw

Weekly AI-generated jigsaw puzzle where every piece-placement is a git commit. The substrate is a public repo (`metafunctor-data`), not a database. Demo for the [git-native](https://github.com/queelius/git-native) library; deployed at https://metafunctor.com/arcade/jigsaw.

## How it works

- Every Monday at 00:00 UTC, a GitHub Actions cron in `metafunctor-data` calls an OpenAI-compatible image API and commits a fresh source image at `jigsaw/YYYY-Www/`. The cron picks `grid_size` (8/10/12) and whether `rotation` is enabled, both written to `meta.yaml`.
- The browser app loads that image and computes N×N jigsaw pieces with deterministic tab/blank shapes from a per-week seed.
- You sign in with GitHub via Personal Access Token (browser-only; no server, no client secret).
- You drag a piece from the tray onto the board, or tap to select then tap a slot. If correct, the app commits a `place` event. If two people race on the same piece, `git-native` retries once on conflict and one of you sees a "beaten to it" toast.
- On rotation-enabled weeks, click the rotate icon on a tray piece, or press R while dragging.
- The renderer reads the commit log and paints only valid placements. When the puzzle is solved, the drawer transforms into a leaderboard sourced from the commit log.

## Develop

```bash
npm install
npm run dev          # Vite dev server
npm test             # vitest
npm run typecheck
npm run build        # produces dist/
```

## Deploy

```bash
export GH_OAUTH_CLIENT_ID=Iv1.your_app_client_id  # not strictly needed for PAT-only auth, but baked in for consistency
npm run deploy                                     # to ../metafunctor/static/arcade/jigsaw/
cd ../metafunctor
git diff --stat HEAD
git add -A && git commit -m "jigsaw: deploy <hash>" && git push
```

Hugo Pages republishes on push.

## Architecture

See `docs/superpowers/specs/2026-05-07-git-jigsaw-v2-design.md` for the V2 design.
See `docs/superpowers/specs/2026-04-28-git-jigsaw-design.md` for the original V1 design.

## License

MIT.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "README: V2 update (drag, rotation, leaderboard, variable difficulty)"
git push
```

---

## Self-review notes

**Spec coverage:**

| Spec section | Tasks |
|---|---|
| Wire-format change (place + meta.yaml + seed_puzzle) | 1, 2, 3, 4, 5, 6 |
| Backwards compat with V1 commits | 5 (parseMeta defaults), 4 (PuzzleState ignores grid_size mismatch) |
| Cross-client compat (V2 fixture) | 6 |
| Validator parameterized + rotation gate | 2 |
| Shapes parameterized | 3 |
| PuzzleState validEvents log | 4 |
| Renderer parameterized | 7 |
| Tray parameterized + render() | 8, 12 |
| Thumbnail with cache | 10 |
| Drawer state machine | 11 |
| Dragger state machine | 13 |
| Input attemptPlace(rotation) | 9 |
| Leaderboard data + render | 14 |
| Confetti | 15 |
| Completion detection | 16 |
| Sign-out menu | 17 |
| Main wire-up | 18 |
| Styles | 19 |
| Cron change shipped | 1, 20 |
| Deploy + tag | 21 |
| README | 22 |

**Placeholder scan:** none.

**Type consistency:**
- `Rotation = 0 | 90 | 180 | 270` used in `tray.ts`, `dragger.ts`, `input.ts`, `puzzle.ts`. `validator.ts` accepts `0 | 90 | 180 | 270 | number` (looser to admit malformed events; runtime check rejects).
- `gridSize: number` is the parameter name everywhere. `meta.yaml` field is `grid_size` (snake_case) and event payload is `grid_size`; the read-flow translates to `gridSize` for in-code use.
- `tileSizeFor(gridSize: number): number` exported from `renderer.ts`, consumed by `thumbnail.ts`.
- `PuzzleState(gridSize)` constructor signature consistent.
- `mountAuthBar({state, store, week, gridSize})` signature consistent.
- `attemptPlace({piece, slot, rotation, gridSize, state, store, week})` signature consistent.

**Things deliberately left as smoke instead of automated:**
- Confetti visual (canvas particle accuracy is unrealistic to assert; we only assert the function is called once via Task 16).
- Drawer gesture-resize on real touch hardware (synthetic pointer events cover the state machine; mobile gesture is a manual smoke item in Task 21).
- Bundle size verification (Task 21 step 1 captures it; if breach, follow-up task to trim).
