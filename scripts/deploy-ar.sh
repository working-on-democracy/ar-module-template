#!/usr/bin/env bash
# Builds the standalone AR app (dist-ar/) and rsyncs it to the Uberspace test space.
# Target folder is derived from the current git branch (see the map below).
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE_HOST="uberspace-oplooi"
REMOTE_BASE="html"

branch="$(git branch --show-current)"

case "$branch" in
  sound-player)              remote_name="ar-soundplayer" ;;
  proximity-effekte)         remote_name="ar-proximity" ;;
  animationssystem-wanderer) remote_name="ar-wanderer" ;;
  zufallsverteilung-lod)     remote_name="ar-lod" ;;
  material-shader-showcase)  remote_name="ar-shader" ;;
  *)
    echo "Kein bekannter Themenfeld-Branch: '$branch'." >&2
    echo "Zielordner explizit angeben: npm run deploy:ar -- <ordnername>" >&2
    if [ "${1:-}" = "" ]; then
      exit 1
    fi
    remote_name="$1"
    ;;
esac

# Explicit override: npm run deploy:ar -- <ordnername>
if [ "${1:-}" != "" ]; then
  remote_name="$1"
fi

echo "Branch: $branch -> html/$remote_name/"

npm run build:ar

rsync -avz --delete \
  -e "ssh" \
  "dist-ar/" \
  "${REMOTE_HOST}:${REMOTE_BASE}/${remote_name}/"

echo ""
echo "Deployed: https://oplooi.uber.space/${remote_name}/"