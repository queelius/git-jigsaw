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
