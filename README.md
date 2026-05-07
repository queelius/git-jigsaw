# git-jigsaw

Weekly AI-generated jigsaw puzzle where every piece-placement is a git commit. The substrate is a public repo (`metafunctor-data`), not a database. Demo for the [git-native](https://github.com/queelius/git-native) library; deployed at https://metafunctor.com/arcade/jigsaw.

## How it works

- Every Monday at 00:00 UTC, a GitHub Actions cron in `metafunctor-data` calls an OpenAI-compatible image API and commits a fresh source image at `jigsaw/YYYY-Www/`. The cron picks `grid_size` (8/10/12) and whether `rotation` is enabled, both written to `meta.yaml`.
- The browser app loads that image and computes N x N jigsaw pieces with deterministic tab/blank shapes from a per-week seed.
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
