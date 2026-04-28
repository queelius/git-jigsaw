---
date: 2026-04-28
author: Alexander Towell (queelius)
status: design, awaiting user review
type: app-design
---

# Spec: git-jigsaw

The browser app behind the *Your Blog Will Outlive Your Database* essay's worked example. A weekly AI-generated jigsaw puzzle where each piece-placement is a git commit. First and primary deployment: `metafunctor.com/arcade/jigsaw`.

## Goal

Stand up the demo the essay describes. A reader visits the page, signs in with GitHub via Device Flow, drags a piece into its slot, and watches a commit land in a public repo. The puzzle's solving history is the git log. By Monday next week the puzzle is a fresh AI-generated picture.

## Non-goals (V1)

- Multi-puzzle archive UI. Past weeks reachable by direct URL or `git log`.
- Per-user history, stats, or leaderboard.
- Real-time chat, presence, or co-presence cues.
- Moderation tooling. Bad placements are invisible to the renderer; that is the moderation.
- Mobile gestures. Desktop-first; mobile is a future iteration.
- i18n, themes, dark mode beyond what metafunctor's CSS gives us.
- Rate limiting. GitHub's per-user limits handle abuse.
- Custom git host adapters. Inherits `git-native`; GitHub-only.

## Repos

Three repos collaborate; each has one job.

```
git-jigsaw            (NEW)        Browser TS app. Vite + canvas.
                                   Depends on git-native (TS lib).
                                   Builds to dist/, deployed by copy.

metafunctor          (existing)    Hugo blog. /arcade/jigsaw page.
                                   Hosts the built dist/ at static/arcade/jigsaw/.

metafunctor-data      (NEW)        The git-native substrate. Public repo.
                                   Stores per-week puzzle images + commit log.
                                   GitHub Action cron generates new puzzles
                                   via plain git (binary file commits).
                                   Commit bodies follow the git-native YAML
                                   shape so the log is library-readable.
```

## Data layout in `metafunctor-data`

```
metafunctor-data/
├── README.md
├── .github/workflows/jigsaw-weekly.yml
├── tools/
│   ├── pyproject.toml
│   ├── generate_puzzle.py
│   └── prompts.py
├── jigsaw/
│   ├── README.md
│   ├── 2026-W17/
│   │   ├── source.png            # 1024×1024 AI-generated image
│   │   ├── meta.yaml             # generated_at, model, prompt, seed
│   │   └── placements/
│   │       ├── 042.json          # {"slot":[5,2]}
│   │       └── ...               # one file per placed piece
│   └── 2026-W18/...
└── (future apps: comments/, reactions/, ...)
```

- **One directory per ISO week** (`YYYY-Www`). Cron writes the new directory; renderer reads it.
- **Each `place` commit writes `placements/{NNN}.json`.** GitHub's Contents API requires a file change per commit; this file is also the conflict surface (two clients writing the same path → 422 → retry).
- **Apps live at paths, not branches.** Vocabulary discipline from the library follow-up doc.

## Frontend architecture

```
git-jigsaw/src/
├── main.ts                # entry: bootstrap + URL params (?week=YYYY-Www)
├── puzzle.ts              # PuzzleState: load source, hold placements, apply events
├── shapes.ts              # deterministic jigsaw tab/blank generation from seed
├── renderer.ts            # canvas: draw board, draw placed pieces with clip paths
├── tray.ts                # piece tray UI: shuffled list of unplaced pieces
├── input.ts               # drag-and-drop: hit-test, validate, commit, animate
└── auth-bar.ts            # sign-in button + actor display + counter
```

State model:

```ts
interface PuzzleState {
  week: string;                              // "2026-W17"
  source: HTMLImageElement;                  // 1024×1024
  seed: string;                              // sha256(source.png)[:16]; drives shape gen
  placements: Map<number, [number, number]>; // pieceId → [row, col]; valid only
  contributors: Set<string>;                 // unique actors this week
}
```

### Read flow (page load)

1. Read `?week=YYYY-Www` (defaults to current ISO week).
2. Fetch `meta.yaml` and `source.png` from `raw.githubusercontent.com/queelius/metafunctor-data/main/jigsaw/{week}/`.
3. `store.events({ since: weekStart, path: "jigsaw/{week}/" })` → all events this week.
4. Apply each `place` event; ignore if `pieceId !== row*8+col`.
5. Tally `actor` values into `contributors`; render counter.
6. Paint board (placed pieces) + tray (unplaced pieces, shuffled deterministically by user's actor name).
7. `store.subscribe()` → on each new event, validate, update, repaint.

### Write flow (drag a piece)

1. User drags piece N from tray, releases over slot [r, c].
2. Validate locally: `r * 8 + c === N`?
   - **No**: shake, snap back to tray. No commit.
   - **Yes**: optimistically render, then `store.commit("place", piece: N, slot: [r, c], files: { "jigsaw/{week}/placements/{NNN}.json": JSON.stringify({slot: [r, c]}) })`.
3. On success: piece stays. Counter ticks if first placement by this actor.
4. On `ConflictError`: pop a toast "queelius beat you to piece 42", remove piece from tray. Do not roll back the placement (it landed; the placer is just someone else).

### Deterministic jigsaw shapes

`shapes.ts` exports `tabPattern(seed: string, row: number, col: number, edge: 'N'|'E'|'S'|'W'): -1 | 0 | 1`.

- `0` = flat (outer edge of the puzzle)
- `1` = tab protruding outward
- `-1` = blank cut inward

Shared edges must agree: Alice's east edge equals Bob's west edge with opposite signs. The function hashes `seed + min(coord1, coord2) + edge_axis`, returning the same value from either side. Renderer composes a per-piece SVG path from the four edges, sets canvas clip, drawImages a 128×128 region of source.

### Tray ordering

Pieces are numbered 0..63, identity = slot identity (piece N belongs at [N//8, N%8]). Numerical-order tray would give the answer away, so the tray uses a Fisher-Yates shuffle seeded by the user's actor name. Each user sees a stable order across sessions; different users see different orders.

### What the user sees

- **Header**: "Week of April 27, 2026 · 47 of 64 pieces placed · 12 contributors · [Sign in]"
- **Board**: 1024×1024 canvas (scales to viewport). Empty slots show a faint grid.
- **Tray**: unplaced pieces, shuffled, draggable.
- **Sign-in flow**: GitHub Device Flow modal: "Visit github.com/login/device and enter code ABCD-1234". No redirect, no callback. Inherits from `git-native`.

### Tech choices

- **Vanilla TS + canvas, no framework.** Mirrors arcade-grid. Keeps bundle small (target <80KB gzipped).
- **Vite for build.** Same as arcade-grid.
- **No state library.** PuzzleState is a plain object; mutations route through methods that emit a 'change' event the renderer listens for.

## Image generation pipeline

The cron lives in `metafunctor-data` so the data and the writer ship together.

### Workflow (`.github/workflows/jigsaw-weekly.yml`)

```yaml
name: Generate weekly jigsaw
on:
  schedule:
    - cron: '0 0 * * 1'                      # Monday 00:00 UTC
  workflow_dispatch:                         # manual trigger for testing/recovery

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -e tools/
      - run: python tools/generate_puzzle.py
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL }}
          OPENAI_IMAGE_MODEL: ${{ vars.OPENAI_IMAGE_MODEL }}
```

`OPENAI_BASE_URL` and `OPENAI_IMAGE_MODEL` are GitHub Actions **vars** (not secrets), so the cron flips to a self-hosted endpoint by changing one repo setting. No code change.

### `generate_puzzle.py` (sketch)

```python
import os, datetime, hashlib, base64, subprocess, yaml
from pathlib import Path
from openai import OpenAI

today = datetime.date.today()
year, week, _ = today.isocalendar()
week_id = f"{year}-W{week:02d}"
puzzle_dir = Path(f"jigsaw/{week_id}")

if (puzzle_dir / "source.png").exists():
    print(f"{week_id} already generated; exiting.")
    raise SystemExit(0)

client = OpenAI(base_url=os.environ.get("OPENAI_BASE_URL"))
prompt = pick_prompt(week_id)
response = client.images.generate(
    model=os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1"),
    prompt=prompt,
    size="1024x1024",
    n=1,
)
image_bytes = base64.b64decode(response.data[0].b64_json)
seed = hashlib.sha256(image_bytes).hexdigest()[:16]

puzzle_dir.mkdir(parents=True, exist_ok=True)
(puzzle_dir / "source.png").write_bytes(image_bytes)
(puzzle_dir / "meta.yaml").write_text(yaml.safe_dump({
    "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
    "model": os.environ.get("OPENAI_IMAGE_MODEL", "gpt-image-1"),
    "prompt": prompt,
    "seed": seed,
}))

# Plain subprocess git: source.png is binary, which git-native-py's
# CommitInput.files (dict[str, str]) does not handle in V1. The cron
# is a single writer with no concurrent commits, so the conflict-retry
# value of the protocol library is not load-bearing here.
subprocess.run(["git", "add", str(puzzle_dir)], check=True)
subprocess.run([
    "git", "-c", "user.name=jigsaw-cron", "-c", "user.email=cron@metafunctor.com",
    "commit", "-m", f"jigsaw: seed {week_id}", "-m",
    yaml.safe_dump({"op": "seed_puzzle", "week": week_id, "prompt": prompt, "v": 1}),
], check=True)
subprocess.run(["git", "push"], check=True)
```

### Properties

- **Idempotent**: rerunning on the same week is a no-op. Recovery from a failed week is a manual `workflow_dispatch` (delete `source.png` first if you want a fresh image).
- **One image, no pre-slicing**: piece geometry is computed in the browser from `seed`. All clients agree.
- **Commit body still YAML, still version-tagged**: the `seed_puzzle` op is recorded in the commit message body in the same shape `git-native-py` would produce. A reader using the library to scan the log gets back a parseable event without the cron ever depending on the library's write path. The TS app only renders `place` events; unknown ops are ignored.
- **`git-native-py` is not in the cron's hot path**: V1 of the library targets `dict[str, str]` files (text events with placement records). Adding `bytes` support is a reasonable follow-up but not a prereq for the demo.

### Not in the cron

- No prompt curation UI. Edit `tools/prompts.py` via PR.
- No image quality gate. Manual rerun if the model returns a bad image.
- No concurrency safeguards needed (one writer).

## Hugo embedding & deploy

### In `git-jigsaw`

```
git-jigsaw/
├── vite.config.ts                # base: '/arcade/jigsaw/'
├── index.html                    # dev server entry; not deployed
├── src/...
├── scripts/
│   └── deploy.sh                 # rsync dist/ → ../metafunctor/static/arcade/jigsaw/
├── package.json                  # scripts: dev, build, test, deploy
└── README.md
```

`vite.config.ts`:

```ts
export default defineConfig({
  base: '/arcade/jigsaw/',
  build: { outDir: 'dist', emptyOutDir: true, manifest: true },
  define: {
    __DATA_REPO__: JSON.stringify('queelius/metafunctor-data'),
    __DATA_PATH__: JSON.stringify('jigsaw/'),
    __OAUTH_CLIENT_ID__: JSON.stringify(process.env.GH_OAUTH_CLIENT_ID),
  },
});
```

`scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TARGET="${1:-../metafunctor/static/arcade/jigsaw}"
npm run build
mkdir -p "$TARGET"
rsync -a --delete dist/ "$TARGET/"
echo "Deployed to $TARGET"
echo "Now: cd $TARGET && git add . && git commit -m 'jigsaw: deploy <hash>'"
```

The script does not auto-commit on the metafunctor side. Eyeball, then commit explicitly.

### In `metafunctor` (Hugo)

```
metafunctor/
├── content/arcade/
│   ├── _index.md             # arcade hub (placeholder for now)
│   └── jigsaw.md             # the page that hosts the embed
├── layouts/arcade/jigsaw/
│   └── single.html           # injects the script tag using Vite manifest
└── static/arcade/jigsaw/     # rsync target
    └── assets/
        ├── index-{hash}.js
        └── index-{hash}.css
```

`content/arcade/jigsaw.md`:

```yaml
---
title: "Weekly Jigsaw"
date: 2026-04-27
url: /arcade/jigsaw/
layout: arcade-jigsaw
---

A fresh AI-generated picture every Monday. Each piece you place is a git commit.
The puzzle's solving history is the [git log](https://github.com/queelius/metafunctor-data/commits/main/jigsaw).

Sign in with GitHub to play.
```

`layouts/arcade/jigsaw/single.html` reads Vite's `manifest.json` via a partial that resolves the hashed asset filenames, then emits `<script type="module" src="...">` and `<link rel="stylesheet" ...>` tags.

### OAuth callback

GitHub Device Flow has no redirect URL. The user enters a code on github.com/login/device manually. The OAuth app's only setting is `client_id` baked into the bundle. No client secret. No server. No callback.

### Deploy cadence

- **App changes (git-jigsaw)**: `npm run deploy` → eyeball metafunctor diff → commit + push to metafunctor → Hugo Pages republishes (minutes).
- **Data changes (metafunctor-data)**: cron pushes directly. Browser fetches data on every page load. No metafunctor rebuild needed.

This split keeps app deploys slow and considered, data flow fast and continuous.

## Testing

Three layers, mirroring the discipline that worked for the libraries.

### Unit (`test/unit/`)

Vitest, node environment. No DOM, no I/O.

- **`shapes.test.ts`**: `tabPattern(seed, r, c, edge)`: determinism, edge agreement (east/west, north/south), outer-edge zero, distribution.
- **`puzzle.test.ts`**: `PuzzleState.applyEvent`: accepts valid `place`, ignores invalid, ignores unknown ops, dedup on piece id.
- **`validator.test.ts`**: `isValidPlacement(piece, slot)`: exhaustive on 64 pieces.

### Integration (`test/integration/`)

Vitest with `happy-dom`. `MockGitNativeStore` fixture mimics the `Store` interface.

- **Drag-and-drop flow**: pointerdown → pointermove → pointerup; valid drop calls `mockStore.commit`, invalid does not.
- **Conflict UX**: `mockStore.commit` rejects with `ConflictError`; piece returns to tray with toast.
- **Subscription paint**: remote event fires; renderer updates without re-fetching.
- **Counter accuracy**: 5 events from 3 unique actors → counter shows 3.

### End-to-end (`test/e2e/`)

Playwright. Opt-in via `E2E=1`.

1. **Dev-server happy path**: Vite dev + a local fixture data repo (4 pieces, file:// URLs). Stub-adapter sign-in. Place all 4. Final canvas matches reference image.
2. **Real GitHub round-trip** (opt-in via `E2E_REAL=1` + `GITHUB_TEST_TOKEN` + `GITHUB_TEST_REPO`): browser places one piece, then verifies the commit appears in the test repo via the GitHub API.

### Cross-client compatibility

One integration test loads a fixture commit body produced by `git-native-py` (committed under `test/fixtures/`) and verifies the TS app parses it identically. Mirrors the cross-client test on the Python side.

### What's not tested

- OpenAI image generation API call (mocked in `generate_puzzle.py` unit tests). Real generation verified by manual `workflow_dispatch`.
- Hugo template rendering (Hugo's own concern).
- GitHub Pages deploy.

### Coverage targets

- Unit: ≥90% on `src/`
- Integration: every drag-and-drop path
- E2E: smoke only

### CI

`.github/workflows/ci.yml` in git-jigsaw:

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: E2E=1 npm run test:e2e
```

Real-GitHub E2E runs only on `workflow_dispatch` so secrets never leak from PRs.

## Dependencies

- `git-native` (TS) v0.1.0+ (installable from git, eventually npm)
- `git-native-py` v0.1.0+ (dev-only: needed for generating cross-client test fixtures; not used by the cron at runtime in V1)
- A registered GitHub OAuth App (queelius-owned), `client_id` baked into the bundle
- `OPENAI_API_KEY` secret in metafunctor-data
- `metafunctor-data` repo (created as part of this work)
- The `/arcade/` URL space free in metafunctor

## Risks

- **OpenAI policy or image quality drift**: bad image → bad puzzle. Mitigation: idempotent cron + manual `workflow_dispatch` to regenerate.
- **GitHub Device Flow UX confusion** for first-time users. Mitigation: a one-paragraph "How sign-in works" expandable in the page chrome.
- **Rendering perf at 64 pieces with jigsaw shapes**: should be fine on modern hardware (many SVG-jigsaw demos run hundreds of pieces). Profile if it stutters.
- **Bundle size**: target <80KB gzipped. git-native (GitHub-only) is small; the rest is canvas math. Achievable.

## Out of scope (with hooks for later)

- **Comments / reactions** on the puzzle. Different verbs (`comment`, `react`), different paths. `metafunctor-data/jigsaw/comments/` reserved by convention.
- **Stats dashboard** reading from multiple `metafunctor-data/*` paths. Trivial later (cron writes `stats/weekly.json`, blog reads it).
- **Self-hosted image endpoint**. `OPENAI_BASE_URL` is already a knob; pointing at a local server is one repo-variable change.

## Out of scope (explicit)

- Multi-puzzle archive UI
- Per-user history / stats / leaderboard
- Real-time chat / presence
- Moderation tooling
- Mobile gestures
- i18n, themes, dark mode beyond inherited
- Multiple concurrent puzzles per week
- Difficulty levels
- Per-week prompt curation UI
- Rate limiting in the browser
- OAuth-via-Worker
- Custom git host adapters

## Open questions (decided in design conversation)

| Question | Decision |
|---|---|
| Repo organization | git-jigsaw (app), metafunctor-data (data + cron), metafunctor (host) |
| Stack | Vanilla TS + canvas + Vite |
| Pieces | True jigsaw shapes, deterministic from `seed = sha256(source.png)[:16]` |
| Validation | Client-side check + renderer-ignores-invalid |
| Cron host | GitHub Actions on metafunctor-data, Monday 00:00 UTC |
| Image API | OpenAI-compatible via Python SDK; base URL and model configurable |
| Auth | GitHub Device Flow (inherited from git-native) |
| Bundle deploy | `npm run deploy` → rsync → eyeball metafunctor diff → commit |
| Grid size | 8×8 = 64 pieces |
| Piece identity | `piece N belongs at [N//8, N%8]`; no solution.json |
| Tray order | Fisher-Yates shuffled by user's actor name |
| Counter | Client-side, tallied from commits this week |
