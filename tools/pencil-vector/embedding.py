"""Stage 6 (M6) -- planar embedding (plan §8).

The edges carve the plane into faces; containment of one closed region inside
another gives object grouping and paint order (z) for free -- a fill nested
inside another paints on top, not by traversal order. Rotational order (the
cyclic order of edges around a junction) is the embedding's local structure.

`validate_embedding` is the guard §8 asks for, to be run after any geometric fit
(M7): a fit may not introduce a crossing that wasn't there, nor move a component
out of the region it started in.
"""
from __future__ import annotations

import math

import networkx as nx
import numpy as np

from graph import _dir_from
from model import BLOB, Graph


def rotational_order(g: Graph) -> Graph:
    """Cyclic (counter-clockwise) order of the edges around each junction (§8),
    stored as `node.ann['rot']` = list of edge sids."""
    for nid, nd in g.nodes.items():
        if nd.kind == BLOB:
            continue
        inc = [e for e in g.edges.values() if e.a == nid or e.b == nid]
        pos = np.array(nd.pos, float)
        inc.sort(key=lambda e: math.atan2(_dir_from(e, pos)[1], _dir_from(e, pos)[0]))
        nd.ann["rot"] = [e.sid for e in inc]
    return g


def _poly_area(poly: np.ndarray) -> float:
    x, y = poly[:, 0], poly[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def _point_in_poly(pt, poly: np.ndarray) -> bool:
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _closed_regions(g: Graph):
    """Every closed region: blob outer boundaries + stroke cycles (node polygons).
    Returns [(polygon, owner_blob_id_or_None)]."""
    regions = []
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            regions.append((np.asarray(nd.boundary, float), nd.id))
    G = nx.Graph()
    for e in g.edges.values():
        G.add_edge(e.a, e.b)
    for cyc in nx.cycle_basis(G):
        if len(cyc) >= 3:
            regions.append((np.array([g.nodes[n].pos for n in cyc], float), None))
    return regions


def containment(g: Graph) -> Graph:
    """Paint order for blobs (§8): z = how many closed regions enclose the blob's
    centre. A nested fill (higher z) is painted after the regions around it."""
    regions = _closed_regions(g)
    for nd in g.nodes.values():
        if nd.kind != BLOB:
            continue
        c = nd.pos
        nd.ann["z"] = sum(1 for poly, owner in regions
                          if owner != nd.id and _point_in_poly(c, poly))
    return g


def _segments_cross(a, b, c, d) -> bool:
    def o(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    o1, o2, o3, o4 = o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b)
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)   # proper crossing only


def count_crossings(edges) -> int:
    """Number of edge pairs (not sharing an endpoint node) whose polylines cross.
    A planar line drawing has none; a bad geometric fit introduces some."""
    edges = list(edges)
    bbox = []
    for e in edges:
        p = e.pts
        bbox.append((p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()))
    n = 0
    for i in range(len(edges)):
        ei = edges[i]
        for j in range(i + 1, len(edges)):
            ej = edges[j]
            if {ei.a, ei.b} & {ej.a, ej.b}:
                continue                                    # adjacent: shared node, skip
            ax0, ay0, ax1, ay1 = bbox[i]
            bx0, by0, bx1, by1 = bbox[j]
            if ax1 < bx0 or bx1 < ax0 or ay1 < by0 or by1 < ay0:
                continue                                    # bbox miss
            pi, pj = ei.pts, ej.pts
            hit = False
            for a in range(len(pi) - 1):
                for b in range(len(pj) - 1):
                    if _segments_cross(pi[a], pi[a + 1], pj[b], pj[b + 1]):
                        hit = True
                        break
                if hit:
                    break
            n += hit
    return n


def validate_embedding(before, after, tol: float = 1e-6) -> list[str]:
    """After a geometric fit, the embedding must hold (§8): no crossing that
    wasn't in the input. Returns a list of violations (empty == valid)."""
    problems = []
    if count_crossings(after) > count_crossings(before):
        problems.append("fit introduced a curve crossing that was not in the input")
    return problems
