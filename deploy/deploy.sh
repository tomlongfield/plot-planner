#!/bin/bash
# Build and publish the latest main. Run by the GitHub webhook (and safe to run by hand).
# Each release is built into its own folder and the "current" symlink is swapped
# atomically, so a failed build or test run leaves the live site untouched.
set -euo pipefail
R=/srv/plot-planner
exec 9>"$R/deploy.lock"
flock 9
log() { echo "[$(date -Is)] $*"; }

cd "$R/repo"
git fetch --quiet origin main
git reset --hard --quiet origin/main
SHA=$(git rev-parse --short HEAD)
if [ "$(readlink -f "$R/current" || true)" = "$R/releases/$SHA" ] && [ "${1:-}" != "--force" ]; then
  log "already live: $SHA"
  exit 0
fi
log "building $SHA: $(git log -1 --format=%s)"
npm ci --no-audit --no-fund --loglevel=error
npm test
npm run build
rm -rf "$R/releases/$SHA.tmp"
cp -a dist "$R/releases/$SHA.tmp"
rm -rf "$R/releases/$SHA"
mv "$R/releases/$SHA.tmp" "$R/releases/$SHA"
ln -sfn "$R/releases/$SHA" "$R/current.tmp"
mv -T "$R/current.tmp" "$R/current"
log "live: $SHA"
# Keep the five most recent releases for quick rollback.
ls -1dt "$R"/releases/*/ | tail -n +6 | xargs -r rm -rf
