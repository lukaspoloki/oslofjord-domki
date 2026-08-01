#!/usr/bin/env bash
# Publish the Dutch standalone site to lukaspoloki/oslofjord-huisjes (main).
# Run from a clone of oslofjord-domki (this branch), with push access to huisjes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/standalone-huisjes"
DEST="${TMPDIR:-/tmp}/oslofjord-huisjes-publish"
REMOTE="${HUISJES_REMOTE:-https://github.com/lukaspoloki/oslofjord-huisjes.git}"

rm -rf "$DEST"
git clone "$REMOTE" "$DEST"
rsync -a --delete --exclude .git "$SRC/" "$DEST/"
cd "$DEST"
git checkout -B main
git add -A
if git diff --cached --quiet; then
  echo "Nothing to publish."
  exit 0
fi
git commit -m "Publish Dutch Oslofjord huisjes site"
git push -u origin main
echo "Published. Site: https://lukaspoloki.github.io/oslofjord-huisjes/"
