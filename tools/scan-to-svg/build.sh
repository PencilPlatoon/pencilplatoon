#!/usr/bin/env bash
# Scan -> SVG pipeline. Run from anywhere; operates in this script's directory.
set -euo pipefail
cd "$(dirname "$0")"

SUBJECTS="flag cannon soldier mg dying"

mkdir -p out
python3 iso.py                       # crop + isolate each subject from the scan  -> out/*_iso.png, *_crop.png
python3 skel_svg.py $SUBJECTS        # vectorize each isolated subject            -> out/*_C.svg
python3 build3.py                    # assemble the comparison page body          -> body3.html
cat style3.html body3.html > comparison3.html
python3 entities.py                  # escape non-ASCII for the artifact sandbox  -> comparison3.html (in place)

echo "done -> comparison3.html"
