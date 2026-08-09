"""Justification resolution (§6.4 follow-on): a leaf/isolated stroke whose pen-width render lands
mostly on bare paper isn't geometry to keep -- it's a signal that a NEIGHBOUR stops short. Rather
than prune it (which dents the drawing) we absorb it into whatever its ink belongs to:

  spike   -- sub-pen isolated noise                 -> drop
  sliver  -- a short bit flush along a stroke's side -> drop (the stroke already covers that ink)
  extend  -- collinear with a through-stroke         -> merge into it (only across a deg-2 split)
  expand  -- thin ink on a blob's rim                -> grow the blob out to it, then drop

Justification is measured on the ACTUAL render (pen width + round caps), the same way the study
shows it. Runs on the merged graph, before stable IDs, so everything downstream sees the result.
"""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours

from model import BLOB

THRESH = 0.5            # >this share of a stroke's non-overlapping render on bare paper -> flagged
SPIKE_W = 0.9           # shorter than this many pen-widths and unattached -> spike
BLOB_NEAR = 1.2         # a whisker within this many w of a blob belongs to it (expand)
COLLINEAR = 136         # deg: a neighbour this straight through the junction continues the stroke
POLY_TOL = 0.1          # boundary re-trace tolerance, in w (matches the fill tracer, §6.1)


def _stroke_mask(pts, wi, h, sw):
    im = Image.new("L", (wi, h), 0)
    d = ImageDraw.Draw(im)
    p = [(float(x), float(y)) for x, y in pts]
    if len(p) >= 2:
        d.line(p, fill=255, width=sw, joint="curve")
    for q in (p[0], p[-1]):
        d.ellipse([q[0] - sw / 2, q[1] - sw / 2, q[0] + sw / 2, q[1] + sw / 2], fill=255)
    return np.asarray(im) > 0


def _blob_union(g, wi, h):
    m = np.zeros((h, wi), bool)
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            im = Image.new("L", (wi, h), 0)
            ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in nd.boundary], fill=255)
            m |= np.asarray(im) > 0
    return m


def _outdir(e, j, pos):
    p = e.pts if e.a == j else e.pts[::-1]
    far = np.array(p[min(len(p) - 1, 6)], float)
    d = far - np.array(pos, float)
    n = np.hypot(*d)
    return d / n if n > 0 else d


def classify(g, ink, w):
    """Return {edge_id: (category, target)} for every flagged leaf/isolated stroke.
    target is the neighbour edge id (extend/sliver), the blob node id (expand), or None (spike)."""
    h, wi = ink.mask.shape
    sw = max(1, int(round(w)))
    inkd = ndimage.binary_dilation(ink.mask, iterations=1)
    masks = {e.id: _stroke_mask(e.pts, wi, h, sw) for e in g.edges.values()}
    blobs = _blob_union(g, wi, h)
    deg: dict = {}
    for e in g.edges.values():
        deg[e.a] = deg.get(e.a, 0) + 1
        deg[e.b] = deg.get(e.b, 0) + 1

    blob_dil = {}
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            im = Image.new("L", (wi, h), 0)
            ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in nd.boundary], fill=255)
            blob_dil[nd.id] = ndimage.binary_dilation(np.asarray(im) > 0, iterations=int(round(BLOB_NEAR * w)))

    def rim_blob(pts):
        # the whisker HUGS a blob's rim (a majority of its length within a pen or so of the blob),
        # so its ink belongs to that blob -- distinct from a stroke that merely touches one at an end
        for bid, bm in blob_dil.items():
            cnt = sum(1 for x, y in pts if bm[min(h - 1, int(round(y))), min(wi - 1, int(round(x)))])
            if cnt >= 0.5 * len(pts):
                return bid
        return None

    out = {}
    for e in g.edges.values():
        other = blobs.copy()
        for oid, m in masks.items():
            if oid != e.id:
                other |= m
        nonov = masks[e.id] & ~other
        if (nonov & ~inkd).sum() / max(1, nonov.sum()) <= THRESH:
            continue
        if min(deg[e.a], deg[e.b]) != 1:                 # a through-stroke, not a leaf: a false merge
            out[e.id] = ("bridge", None)                 # if redundant, else a needed thin link -> kept
            continue
        L = e.length
        j = e.a if deg[e.a] > 1 else (e.b if deg[e.b] > 1 else None)
        collin = None
        if j is not None:
            wd = _outdir(e, j, g.nodes[j].pos)
            for o in g.edges.values():
                if o.id == e.id or not (o.a == j or o.b == j):
                    continue
                ang = math.degrees(math.acos(max(-1, min(1, float(np.dot(wd, _outdir(o, j, g.nodes[j].pos)))))))
                if ang > COLLINEAR:
                    collin = o.id
                    break
        bid = rim_blob(e.pts)
        if bid is not None:                              # rim-hugging blob wins over collinearity:
            out[e.id] = ("expand", bid)                  # it's the blob's edge, not a stroke's end
        elif collin is not None:
            out[e.id] = ("extend", collin)
        elif L < SPIKE_W * w:
            out[e.id] = ("spike", None)
        else:
            out[e.id] = ("sliver", None)
    return out


def _drop(g, eid):
    del g.edges[eid]


def _merge_extend(g, eid, nid):
    """Merge whisker `eid` into collinear neighbour `nid` where they meet -- only if that junction
    is degree-2 (a stroke the skeleton split spuriously); otherwise leave the branch in place."""
    w, n = g.edges[eid], g.edges[nid]
    j = ({w.a, w.b} & {n.a, n.b})
    if len(j) != 1:
        return False
    j = j.pop()
    deg = sum(1 for e in g.edges.values() if e.a == j or e.b == j)
    if deg != 2:                                         # real junction -> keep the branch
        return False
    wp = w.pts if w.a == j else w.pts[::-1]              # j -> whisker tip
    wr = w.r if w.a == j else w.r[::-1]
    if n.b == j:
        n.pts = np.vstack([n.pts, wp[1:]]); n.r = np.concatenate([n.r, wr[1:]]); n.b = w.b if w.a == j else w.a
    else:
        n.pts = np.vstack([wp[::-1][:-1], n.pts]); n.r = np.concatenate([wr[::-1][:-1], n.r]); n.a = w.b if w.a == j else w.a
    del g.edges[eid]
    if j in g.nodes and g.nodes[j].kind != BLOB:
        del g.nodes[j]
    return True


def _grow_blob(g, bid, eid, ink, w):
    """Grow the blob's boundary to swallow the whisker's ink, then drop the whisker."""
    nd = g.nodes[bid]
    h, wi = ink.mask.shape
    im = Image.new("L", (wi, h), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in nd.boundary], fill=255)
    bm = np.asarray(im) > 0
    cl = np.zeros((h, wi), bool)                          # the whisker's ink footprint
    im2 = Image.new("L", (wi, h), 0)
    ImageDraw.Draw(im2).line([(float(x), float(y)) for x, y in g.edges[eid].pts], fill=255, width=1)
    cl = np.asarray(im2) > 0
    wink = ink.mask & ndimage.binary_dilation(cl, iterations=int(round(w)))
    grown = ndimage.binary_closing(bm | wink, iterations=1)
    grown = ndimage.binary_fill_holes(grown)
    cs = find_contours(grown.astype(float), 0.5)
    if cs:
        outer = max(cs, key=lambda c: len(c))
        poly = approximate_polygon(outer, POLY_TOL * w)
        if len(poly) >= 3:
            nd.boundary = np.column_stack([poly[:, 1], poly[:, 0]])
    del g.edges[eid]


def _connected_without(g, a, b, skip):
    """Are nodes a and b still joined by edges other than `skip`? (blob hubs aside -- edge graph.)"""
    adj: dict = {}
    for e in g.edges.values():
        if e.id == skip:
            continue
        adj.setdefault(e.a, []).append(e.b)
        adj.setdefault(e.b, []).append(e.a)
    seen, stack = {a}, [a]
    while stack:
        n = stack.pop()
        if n == b:
            return True
        for m in adj.get(n, []):
            if m not in seen:
                seen.add(m); stack.append(m)
    return b in seen


def _orphans(g):
    used = {e.a for e in g.edges.values()} | {e.b for e in g.edges.values()}
    for nid in [n for n, nd in g.nodes.items() if n not in used and nd.kind != BLOB]:
        del g.nodes[nid]


def resolve_justification(g, ink) -> dict:
    """Absorb every flagged whisker into its rightful owner, iterating to a fixed point: dropping or
    merging a stroke exposes its neighbour's own now-unjustified render, which the next pass catches.
    Returns a tally by category (`kept` = a needed thin link or real branch that stays)."""
    w = g.w
    tally = {"spike": 0, "sliver": 0, "extend": 0, "expand": 0, "bridge": 0, "kept": 0, "passes": 0}
    for _ in range(8):
        cats = classify(g, ink, w)
        changed = 0
        for eid, (cat, target) in list(cats.items()):
            if eid not in g.edges:
                continue
            if cat in ("spike", "sliver"):
                _drop(g, eid); tally[cat] += 1; changed += 1
            elif cat == "extend":
                if target in g.edges and _merge_extend(g, eid, target):
                    tally["extend"] += 1; changed += 1
            elif cat == "expand":
                if target in g.nodes:
                    _grow_blob(g, target, eid, ink, w); tally["expand"] += 1; changed += 1
            elif cat == "bridge":
                e = g.edges[eid]
                if _connected_without(g, e.a, e.b, eid):     # redundant merge -> drop the false link
                    _drop(g, eid); tally["bridge"] += 1; changed += 1
        _orphans(g)
        tally["passes"] += 1
        if changed == 0:
            break
    tally["kept"] = len(classify(g, ink, w))                  # whatever the rule can't absorb
    return tally
