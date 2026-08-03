"""M1 driver: image -> graph -> SVG, end-to-end.

Usage:
    python vectorize.py IN.png [OUT.svg]

Prints the derived pen width `w` (§5 acceptance: sane, ~within 15% of a
hand-measured stroke) and the node/edge counts.
"""
from __future__ import annotations

import os
import sys

import numpy as np
from PIL import Image

from graph import build
from ink import ingest
from svgdump import dump


def vectorize(in_path: str):
    rgb = np.asarray(Image.open(in_path).convert("RGB"))
    ink = ingest(rgb)
    g = build(ink)
    return g


def main(argv):
    show_nodes = "--nodes" in argv           # debug overlay of node kinds
    pos = [a for a in argv if not a.startswith("--")]
    if not pos:
        print(__doc__)
        return 2
    in_path = pos[0]
    out_path = pos[1] if len(pos) > 1 else os.path.splitext(in_path)[0] + "_m1.svg"
    g = vectorize(in_path)
    with open(out_path, "w") as f:
        f.write(dump(g, show_nodes=show_nodes))
    print("w=%.2f  nodes=%d  edges=%d  -> %s"
          % (g.w, len(g.nodes), len(g.edges), out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
