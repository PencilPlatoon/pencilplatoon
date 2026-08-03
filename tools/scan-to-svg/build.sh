#!/usr/bin/env bash
# Scan -> SVG pipeline. Run from anywhere; operates in this script's directory.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p out
python3 iso.py                       # crop + isolate each subject (iso.py CFG)   -> out/*_iso.png, *_crop.png
python3 skel_svg.py                  # vectorize everything iso.py produced       -> out/*_C.svg

# Pencil Vector (../pencil-vector): the parallel model-based vectorizer. Emits one SVG per
# milestone (retained, never overwritten) for the comparison page's per-cell milestone tabs.
# Runs from its own dir (local imports); reads our isos. M1 is the only milestone so far.
mkdir -p ../pencil-vector/out
for s in flag cannon soldier mg dying; do
  ( cd ../pencil-vector && python3 vectorize.py "../scan-to-svg/out/${s}_iso.png" "out/${s}_m1.svg" )
done

python3 build3.py                    # assemble the comparison page body          -> body3.html
cat style3.html body3.html > comparison3.html
python3 entities.py                  # escape non-ASCII for the artifact sandbox  -> comparison3.html (in place)

echo "done -> comparison3.html"
