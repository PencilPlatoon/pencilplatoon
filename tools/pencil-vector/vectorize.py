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
from PIL import Image, ImageDraw

from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours

import growth
import raster
import widthclass as WC
from embedding import containment, rotational_order
from fit import fit_graph, path_d, reconstruct
from graph import (absorb_rim_stubs, attach_contact_splits, attach_edges_to_blobs,
                   build, merge_close_junctions, resolve_continuity,
                   split_edges_at_blob_contacts)
from ink import Ink, ingest
from model import BLOB, Graph, Node
from stableid import assign
from svgdump import dump

LATEST = 8                      # highest implemented milestone


def vectorize(in_path: str, milestone: int = LATEST, thresh_bias: float = 0.0,
              scale: int | None = None):
    """Run the pipeline up to `milestone` -- each milestone adds the features up
    to it, so a given milestone's output is what the approach produced at that
    stage. M1 naive skeleton; M2 width classes (blobs, holes and all -- a hollow shape
    is hollow from the start); M3 stable IDs + freeze; M4/M5 add connectivity (no
    render change); M6 planar embedding. Only render-changing milestones differ
    visually (M1, M2, M3).

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
    # The fill-vs-stroke test is 2D-thickness, but measured on the AGGREGATE ink (all colours unioned),
    # not per colour (§5): a wide contiguous region striped from several pen-wide colours is a fill even
    # though no single colour is thick there, so it's covered by tiling blobs, not gappy strokes. On a
    # single-colour drawing this equals that colour's own core, so black-only art is unchanged.
    agg_solid = growth.expand(growth.raw_core(ink), ink) if len(ink.palette) > 1 else None
    for c, cmask in _color_masks(ink):
        ink_c = Ink(mask=cmask, dist=ndimage.distance_transform_edt(cmask), w=ink.w, scale=ink.scale)
        if milestone <= 1:                  # M1: raw skeleton per colour, no width classes
            _merge(g, build(ink_c), c, nc, ec)
            continue
        # Growth-based blob resolution (§6.4): grow the ambiguous 2D regions into segment networks by
        # the stroke contacts that touch them, and keep only those with a leftover fill-lobe as blobs
        # (a clear 2D-core fill is always a blob). The returned skeleton already has each junction
        # network and every blob-to-blob bridge folded in, ready to build like any stroke skeleton.
        net, fills = growth.resolve(ink_c, force_fill=agg_solid)
        sub = build(ink_c, mask=net)
        merge_close_junctions(sub, ink.w)   # collapse the skeletonizer's split junctions at a fill
        _merge(g, sub, c, nc, ec)
        for mask, centroid in fills:                    # fills are first-class blob nodes (§6.3)
            nid = nc[0]; nc[0] += 1                      # boundary + holes traced once, post-absorb (below)
            g.nodes[nid] = Node(id=nid, kind=BLOB, pos=centroid, boundary=None,
                                ann={"color": c, "width_class": "blob", "holes": []})
            blob_masks[nid] = mask
    if milestone <= 1:
        return g                            # M1 is a skeleton -- no fills, so no contiguity base
    g.labels = ink.labels                   # M2+: carry the colour map for the render's fill base
    absorb_rim_stubs(g, blob_masks, ink.mask, ink.w)   # M2: fold rim fray into the fill it bumps off
                                            # -- a width-class cleanup, so it belongs with M2's blobs
                                            # and must run before the M3 topology freeze either way
    _trace_blobs(g, blob_masks, ink)                   # trace each blob's boundary + holes ONCE, from its final mask
    split_edges_at_blob_contacts(g, blob_masks, ink.w)  # M2: separate a stroke that GRAZES a blob mid-edge at
                                            # the contact (like absorb_rim_stubs, this is stroke<->blob geometry
                                            # cleanup, so it precedes the M3 freeze -- not a reshape at M3)

    if milestone >= 3:                      # M3: stable IDs + freeze; M4: blob incidence
        # (no spur-prune: the contact-aware skeleton already drops sub-pen twigs at the source, §6.2)
        assign(g)
        attach_edges_to_blobs(g, blob_masks)   # cross-colour: a stroke attaches to any blob it meets
        attach_contact_splits(g)               # wire the graze-split incidence (endpoint attach can't see it)
    if milestone >= 5:                      # M5: junction resolution for continuity flood (§6.4)
        resolve_continuity(g)
    if milestone >= 6:                      # M6: planar embedding (§8)
        rotational_order(g)
        containment(g)
    if milestone >= 7:                      # M7: geometry fitting (§9)
        fit_graph(g, ink.w)                 # strokes AND fills fit to primitives (annotations)
        _idealize_blob_boundaries(g, ink)    # idealize/emit only where it keeps strokes in contact
    return g


def _poly_area(p: np.ndarray) -> float:
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def _fill_polygon(poly: np.ndarray, w: float):
    """Rasterize a (possibly self-intersecting) fitted boundary and re-trace its solid outer
    outline -- raster is a scratch step, the result is a vector polygon. This does NOT re-assert
    the pen-width minimum: the fill mask was already made >= a pen wide upstream (§6.1), and
    re-enforcing here dilates skeleton spurs into spurious tabs at every little boundary bump.
    Returns None if the fit self-intersected into pieces (caller falls back)."""
    x0, y0 = int(poly[:, 0].min()) - 4, int(poly[:, 1].min()) - 4
    im = Image.new("L", (int(poly[:, 0].max()) - x0 + 4, int(poly[:, 1].max()) - y0 + 4), 0)
    ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in poly], fill=255)
    mask = ndimage.binary_fill_holes(np.asarray(im) > 0)
    cs = find_contours(mask.astype(float), 0.5)
    if not cs:
        return None
    outer = max(cs, key=lambda c: _poly_area(c[:, ::-1]))
    p = approximate_polygon(outer, 0.1 * w)
    return np.column_stack([p[:, 1] + x0, p[:, 0] + y0]) if len(p) >= 3 else None


def _idealize_blob_boundaries(g: Graph, ink: Ink) -> None:
    """Give fills the stroke's M7 treatment: render each fill from its FITTED (idealized) edge
    -- straight edges, arcs -- with the pen-width minimum re-asserted. But idealizing can smooth
    the boundary INWARD, off a stroke that reached the traced edge, opening a gap -- and the
    drawing may stay connected the long way round, so a piece-count check misses it (how cannon
    2/26 slipped through, §12). So guard each attachment the blob RECORDED from the ink (§6.3)
    one at a time: idealize a fill only if no attached stroke ends up more than a half-pen from
    the new edge when it wasn't before (an aggregate contact count is fooled -- pulling off one
    stroke while gaining another nets zero). Emit arcs at M8 under the same per-attachment guard;
    otherwise keep the traced edge -- connected, if not as clean. This is the guard side of the
    invariant `raster.broken_attachments` checks after the fact.

    Contact is probed with each stroke's frozen centerline `pts`, NOT its rendered stroke: the raw
    geometry never idealizes (M7 fits only annotations), so the same probe measures identically at
    M7 and M8 -- the boundary is the only thing that moves."""
    from svgdump import _d
    h, w_img = ink.mask.shape
    reach = 0.5 * ink.w                               # a stroke within a half-pen of the edge touches
    esid = {e.sid: e for e in g.edges.values()}
    probe: dict = {}                                  # attached stroke -> its centerline pixel coords

    def pts(sid):
        if sid not in probe:
            e = esid.get(sid)
            if e is None or e.pts is None or len(e.pts) == 0:
                probe[sid] = None
            else:
                probe[sid] = (np.clip(e.pts[:, 1].astype(int), 0, h - 1),
                              np.clip(e.pts[:, 0].astype(int), 0, w_img - 1))
        return probe[sid]

    def gaps(dstr, edges):
        dt = ndimage.distance_transform_edt(~raster.full_fill_mask(dstr, w_img, h))
        out = {}
        for sid in edges:
            p = pts(sid)
            if p is not None:
                out[sid] = float(dt[p].min())
        return out

    def opens(cand, edges, ref):
        g2 = gaps(cand, edges)                        # would a contact the traced edge held within
        return any(v > reach and ref.get(sid, 1e9) <= reach for sid, v in g2.items())  # reach fall out?

    for nd in g.nodes.values():
        if nd.kind != BLOB or "fit" not in nd.ann:
            continue
        nd.ann["traced"] = nd.boundary                # keep the ink-faithful edge for the verifier
        ideal = _fill_polygon(reconstruct(nd.ann["fit"], 0.0), ink.w)
        if ideal is None or _poly_area(ideal) < 0.9 * _poly_area(nd.boundary):
            continue                                  # fit pinched / lost area -> keep traced edge
        edges = nd.ann.get("edges", [])
        traced = gaps(_d(nd.boundary, close=True), edges)  # attachment gaps on the traced edge
        if opens(_d(ideal, close=True), edges, traced):
            continue                                  # idealizing drops a real contact -> keep traced
        nd.boundary = ideal
        nd.ann["holes"] = [reconstruct(hh, 0.0) for hh in nd.ann.get("fit_holes", [])]
        arc = path_d(nd.ann["fit"])
        if raster.is_intact(arc, _poly_area(ideal)) and not opens(arc, edges, traced):
            nd.ann["fit_ok"] = True                   # arcs render intact AND keep every attachment


def _blob_pieces(mask: np.ndarray, w: float):
    """The blob's mask split into the pieces a single outline can actually enclose. A boundary is one
    outer polygon + holes, so a mask whose regions only touch through a sub-pixel/diagonal strand (which
    marching-squares tracing reads as disconnected) can't be one blob -- the stray region would trace as
    a non-nesting contour and get dropped, leaving real ink uncovered. Split on the same 4-connectivity
    the tracer sees so each piece is a faithful outline. Sub-blob-area crumbs are discarded (as tracing
    dropped them before), but a lone under-area piece is kept so a small legitimate blob never vanishes."""
    closed = ndimage.binary_closing(mask, iterations=1)
    lab, n = ndimage.label(closed)                        # ndimage default: 4-connectivity, matches the tracer
    if n <= 1:
        return [closed] if closed.any() else []
    comps = [lab == i for i in range(1, n + 1)]
    big = [c for c in comps if c.sum() >= WC.MIN_BLOB_AREA_W2 * w * w]
    return big if big else [max(comps, key=lambda c: c.sum())]


def _trace_blobs(g: Graph, blob_masks: dict, ink: Ink) -> None:
    """Trace each blob's outer boundary + interior holes from its FINAL (post rim-stub absorption) mask,
    once. Deferred here (rather than at blob creation in growth.resolve) so a blob whose rim stub absorb
    folded in isn't traced twice -- 23 of the 26 blobs were being traced then re-traced. Holes are traced
    natively WITH the outline -- a hollow shape is hollow from the start, not gated to a later milestone.
    A mask that fell into disconnected pieces (§_blob_pieces) becomes one sibling blob per piece."""
    ink_holes = ndimage.binary_fill_holes(ink.mask) & ~ink.mask   # holes the pen left open in the drawing
    dead = []; born = {}
    next_id = (max(g.nodes) + 1) if g.nodes else 0
    for nid, mask in list(blob_masks.items()):
        nd = g.nodes.get(nid)
        if nd is None or nd.kind != BLOB:
            continue
        pieces = _blob_pieces(mask, ink.w)
        if not pieces:
            dead.append(nid)                              # degenerate mask -> not a real blob
            continue
        for k, piece in enumerate(sorted(pieces, key=lambda m: -int(m.sum()))):
            if k == 0:
                tgt, blob_masks[nid] = nid, piece         # largest piece stays this node
            else:
                tgt = next_id; next_id += 1               # a stray region strands into its own sibling blob
                ys, xs = np.where(piece)
                g.nodes[tgt] = Node(id=tgt, kind=BLOB, pos=(float(xs.mean()), float(ys.mean())),
                                    boundary=None, ann={**nd.ann, "holes": []})
                born[tgt] = piece
            outer, holes = growth.fill_boundary(piece, ink.w, ink_holes)
            gn = g.nodes[tgt]
            if outer is None:
                dead.append(tgt)
                continue
            gn.boundary, gn.ann["holes"] = outer, holes
    blob_masks.update(born)
    for nid in dead:
        g.nodes.pop(nid, None); blob_masks.pop(nid, None)


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
        f.write(dump(g, show_nodes=show_nodes, primitives=milestone >= 8))   # M8 emits real arcs
    blobs = sum(1 for nd in g.nodes.values() if nd.kind == BLOB)
    print("m%d  scale=%dx  w=%.2f  nodes=%d  edges=%d  blobs=%d  -> %s"
          % (milestone, g.scale, g.w, len(g.nodes), len(g.edges), blobs, out_path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
