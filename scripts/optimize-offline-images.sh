#!/usr/bin/env bash
# Regenerates the small WebP copies used by the Offline Library (public/offline-img/) from the
# full-size originals in src/assets/images/. Requires `cwebp` (brew install webp).
# Originals are never modified. Re-run after adding or replacing an image.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/offline-img
for f in src/assets/images/*.jpg src/assets/images/*.jpeg src/assets/images/*.png; do
  [ -e "$f" ] || continue
  base="$(basename "${f%.*}")"
  cwebp -quiet -resize 560 0 -q 55 "$f" -o "public/offline-img/${base}.webp"
done
ls -l public/offline-img
