#!/usr/bin/env bash
# Builds both production artefacts (module + standalone) for a finished
# Themenfeld branch and rsyncs them to the AN ALLE! production server.
set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE_HOST="uberspace-allean"
REMOTE_BASE="html"

branch="$(git branch --show-current)"

case "$branch" in
  zufallsverteilung-lod)     slug="randomfield" ;;
  animationssystem-wanderer) slug="soundwanderer" ;;
  material-shader-showcase)  slug="shadershowcase" ;;
  *)
    echo "Kein bekannter Produktions-Branch: '$branch'." >&2
    echo "Slug explizit angeben: npm run deploy:production -- <slug>" >&2
    if [ "${1:-}" = "" ]; then
      exit 1
    fi
    slug="$1"
    ;;
esac

# Explicit override: npm run deploy:production -- <slug>
if [ "${1:-}" != "" ]; then
  slug="$1"
fi

module_name="ar-${slug}-module"
standalone_name="ar-${slug}-standalone"

echo "Branch: $branch -> ar-modules/${module_name}/ + standalones/${standalone_name}/"

npm run build
npm run build:ar

rsync -avz --delete \
  -e "ssh" \
  "dist-platform/" \
  "${REMOTE_HOST}:${REMOTE_BASE}/ar-modules/${module_name}/"

rsync -avz --delete \
  -e "ssh" \
  "dist-ar/" \
  "${REMOTE_HOST}:${REMOTE_BASE}/standalones/${standalone_name}/"

echo ""
echo "Modul deployed nach ar-modules/${module_name}/ (vom Host geladen, keine eigene URL)"
echo "Standalone deployed: https://alnilam.uberspace.de/standalones/${standalone_name}/"
