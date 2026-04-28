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
