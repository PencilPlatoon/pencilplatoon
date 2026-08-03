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
from model import BLOB, Node
from svgdump import dump
from widthclass import segment

LATEST = 2                      # highest implemented milestone


def vectorize(in_path: str, milestone: int = LATEST):
    """Run the pipeline up to `milestone`. M1: naive whole-mask skeleton. M2:
    width-class segmentation -- strokes on the thin mask, blobs filled."""
    rgb = np.asarray(Image.open(in_path).convert("RGB"))
    ink = ingest(rgb)
    if milestone <= 1:
        return build(ink)

    blobs, thin = segment(ink)              # Stage 1
    g = build(ink, mask=thin)               # strokes only
    nid = (max(g.nodes) + 1) if g.nodes else 0
    for b in blobs:                         # blobs are first-class nodes (§6.3)
        g.nodes[nid] = Node(id=nid, kind=BLOB, pos=b.centroid, boundary=b.boundary,
                            ann={"width_class": b.width_class})
        nid += 1
    return g


def main(argv):
    show_nodes = "--nodes" in argv           # debug overlay of node kinds
    milestone = LATEST
    for a in argv:
        if a.startswith("--milestone="):
            milestone = int(a.split("=", 1)[1])
    pos = [a for a in argv if not a.startswith("--")]
    if not pos:
        print(__doc__)
        return 2
    in_path = pos[0]
    out_path = pos[1] if len(pos) > 1 else "%s_m%d.svg" % (os.path.splitext(in_path)[0], milestone)
    g = vectorize(in_path, milestone)
    with open(out_path, "w") as f:
        f.write(dump(g, show_nodes=show_nodes))
    blobs = sum(1 for nd in g.nodes.values() if nd.kind == BLOB)
    print("m%d  w=%.2f  nodes=%d  edges=%d  blobs=%d  -> %s"
          % (milestone, g.w, len(g.nodes), len(g.edges), blobs, out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
