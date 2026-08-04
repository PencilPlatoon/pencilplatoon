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

from scipy import ndimage

from embedding import containment, rotational_order
from fit import fit_graph
from graph import (attach_edges_to_blobs, build, defork, prune_spurs,
                   resolve_continuity)
from ink import Ink, ingest
from model import BLOB, Graph, Node
from stableid import assign
from svgdump import dump
from widthclass import segment

LATEST = 8                      # highest implemented milestone
SPUR_W = 1.5                    # twig-size ceiling (§6.4); connectivity, not length, decides
                                # which short leaves are twigs vs. real connectors/continuations


def vectorize(in_path: str, milestone: int = LATEST, thresh_bias: float = 0.0,
              scale: int | None = None):
    """Run the pipeline up to `milestone` -- each milestone adds the features up
    to it, so a given milestone's output is what the approach produced at that
    stage. M1 naive skeleton; M2 width classes; M3 stable IDs + freeze; M4/M5 add
    connectivity (no render change); M6 interior holes + embedding. Only render-
    changing milestones differ visually (M1, M2, M3, M6).

    `scale` supersamples the scan (§5); None picks it dynamically from the native
    pen width so small holes / thin walls resolve instead of pinching shut."""
    rgb = np.asarray(Image.open(in_path).convert("RGB"))
    ink = ingest(rgb, thresh_bias=thresh_bias, scale=scale)

    # Stage 1 runs PER COLOUR LAYER (§5, revised M1): each colour's ink is skeletonized and
    # width-classed on its own, so a black line abutting a red fill is measured on the black
    # layer alone -- it stays a thin stroke instead of fusing with the fill into one blob. The
    # layers' subgraphs merge into one graph; cross-colour contiguity is then restored below
    # by attaching each stroke to whatever blob it meets, of any colour.
    g = Graph(nodes={}, edges={}, w=ink.w, size=(ink.mask.shape[1], ink.mask.shape[0]),
              scale=ink.scale, palette=ink.palette)
    nc, ec = [0], [0]                       # global node / edge id counters across layers
    blob_masks = {}
    for c, cmask in _color_masks(ink):
        ink_c = Ink(mask=cmask, dist=ndimage.distance_transform_edt(cmask), w=ink.w, scale=ink.scale)
        if milestone <= 1:                  # M1: raw skeleton per colour, no width classes
            _merge(g, build(ink_c), c, nc, ec)
            continue
        blobs, thin = segment(ink_c)
        sub = build(ink_c, mask=thin)       # strokes only
        defork(sub, ink.w)                  # blunt-end Y where a stroke is cut at a solid -> one end
        _merge(g, sub, c, nc, ec)
        for b in blobs:                     # blobs are first-class nodes (§6.3), tagged by colour
            nid = nc[0]; nc[0] += 1
            g.nodes[nid] = Node(id=nid, kind=BLOB, pos=b.centroid, boundary=b.boundary,
                                ann={"color": c, "width_class": b.width_class,
                                     "holes": b.holes if milestone >= 6 else []})   # holes are M6
            blob_masks[nid] = b.mask
    if milestone <= 1:
        return g                            # M1 is a skeleton -- no fills, so no contiguity base
    g.labels = ink.labels                   # M2+: carry the colour map for the render's fill base

    if milestone >= 3:                      # M3: stable IDs + freeze; M4: blob incidence
        prune_spurs(g, SPUR_W * ink.w, blob_masks=list(blob_masks.values()))
        assign(g)
        attach_edges_to_blobs(g, blob_masks)   # cross-colour: a stroke attaches to any blob it meets
    if milestone >= 5:                      # M5: junction resolution for continuity flood (§6.4)
        resolve_continuity(g)
    if milestone >= 6:                      # M6: planar embedding (§8)
        rotational_order(g)
        containment(g)
    if milestone >= 7:                      # M7: geometry fitting (§9) -- annotations only
        fit_graph(g, ink.w)
    return g


def _color_masks(ink: Ink):
    """(colour id, boolean mask) per colour present; a single black layer if uncoloured."""
    if ink.labels is None:
        return [(0, ink.mask)]
    return [(c, ink.labels == c) for c in range(len(ink.palette)) if (ink.labels == c).any()]


def _merge(g: Graph, sub: Graph, color: int, nc: list, ec: list) -> None:
    """Fold a layer's subgraph into the merged graph, remapping ids and tagging the colour."""
    idmap = {}
    for oid, nd in sub.nodes.items():
        nid = nc[0]; nc[0] += 1
        idmap[oid] = nid
        nd.id = nid
        nd.ann["color"] = color
        g.nodes[nid] = nd
    for e in sub.edges.values():
        eid = ec[0]; ec[0] += 1
        e.id = eid
        e.a, e.b = idmap[e.a], idmap[e.b]
        e.ann["color"] = color
        g.edges[eid] = e


def main(argv):
    show_nodes = "--nodes" in argv           # debug overlay of node kinds
    milestone = LATEST
    scale = None                             # dynamic by default
    for a in argv:
        if a.startswith("--milestone="):
            milestone = int(a.split("=", 1)[1])
        if a.startswith("--scale="):
            scale = int(a.split("=", 1)[1])
    pos = [a for a in argv if not a.startswith("--")]
    if not pos:
        print(__doc__)
        return 2
    in_path = pos[0]
    out_path = pos[1] if len(pos) > 1 else "%s_m%d.svg" % (os.path.splitext(in_path)[0], milestone)
    g = vectorize(in_path, milestone, scale=scale)
    with open(out_path, "w") as f:
        f.write(dump(g, show_nodes=show_nodes, primitives=milestone >= 8))   # M8 cashes in arcs
    blobs = sum(1 for nd in g.nodes.values() if nd.kind == BLOB)
    print("m%d  scale=%dx  w=%.2f  nodes=%d  edges=%d  blobs=%d  -> %s"
          % (milestone, g.scale, g.w, len(g.nodes), len(g.edges), blobs, out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
