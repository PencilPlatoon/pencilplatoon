"""Stage 2-3 (M1 subset) -- skeleton and naive graph construction (plan §6.2-6.3).

M1 is deliberately naive: thin the whole mask, find nodes where the skeleton's
degree != 2, and trace the degree-2 runs between them into junction-to-junction
edges. Width classification (blobs vs strokes), continuity pairing, and stable
IDs arrive in later milestones; this just gets a graph end-to-end.

IDs here are traversal-order and therefore NOT yet stable across re-runs -- that
is M3's job (§7), and is called out so nothing downstream leans on them early.
"""
from __future__ import annotations

import math

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

from ink import Ink
from model import ENDPOINT, JUNCTION, Edge, Graph, Node

# 8-connectivity for skeleton pixel adjacency
_N8 = np.ones((3, 3), dtype=int)


def _degree(skel: np.ndarray) -> np.ndarray:
    """Neighbor count for each skeleton pixel (0 off-skeleton)."""
    neigh = ndimage.convolve(skel.astype(int), _N8, mode="constant") - skel
    return np.where(skel, neigh, 0)


def _trace_run(start, came_from, skel, node_at):
    """Walk a degree-2 corridor from a pixel adjacent to a node until the next
    node pixel, returning the ordered pixel list (exclusive of both nodes)."""
    run = []
    y, x = start
    py, px = came_from
    while True:
        run.append((y, x))
        nxt = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ny, nx = y + dy, x + dx
                if (ny, nx) == (py, px):
                    continue
                if 0 <= ny < skel.shape[0] and 0 <= nx < skel.shape[1] and skel[ny, nx]:
                    if node_at[ny, nx] >= 0:
                        return run, (ny, nx)          # hit the next node
                    nxt = (ny, nx)
        if nxt is None:
            return run, None                          # dangling (shouldn't happen)
        py, px = y, x
        y, x = nxt


def build(ink: Ink, mask: np.ndarray | None = None) -> Graph:
    # `mask` defaults to all ink (M1). M2 passes the thin (stroke-only) mask so
    # blob interiors aren't skeletonized into centerlines (§6.2).
    skel = skeletonize(ink.mask if mask is None else mask)
    deg = _degree(skel)

    # Cluster the non-corridor pixels (endpoints deg==1, junctions deg>=3) into
    # nodes by connectivity, so a fat junction of several touching pixels is ONE
    # node rather than several (§6.3, "collapse valence-2 nodes").
    node_px = skel & (deg != 2)
    lab, n = ndimage.label(node_px, structure=_N8)
    node_at = np.full(skel.shape, -1, dtype=int)      # pixel -> node id (or -1)
    node_at[lab > 0] = lab[lab > 0] - 1

    nodes: dict[int, Node] = {}
    for nid in range(n):
        ys, xs = np.where(lab == nid + 1)
        maxdeg = deg[ys, xs].max()
        kind = ENDPOINT if maxdeg == 1 else JUNCTION
        nodes[nid] = Node(id=nid, kind=kind, pos=(float(xs.mean()), float(ys.mean())))

    # Trace one edge out of each corridor pixel adjacent to a node.
    edges: dict[int, Edge] = {}
    seen: set = set()
    eid = 0
    for nid in range(n):
        ys, xs = np.where(lab == nid + 1)
        for y, x in zip(ys, xs):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < skel.shape[0] and 0 <= nx < skel.shape[1]):
                        continue
                    if not skel[ny, nx] or node_at[ny, nx] >= 0:
                        continue
                    if (ny, nx) in seen:
                        continue
                    run, end = _trace_run((ny, nx), (y, x), skel, node_at)
                    for p in run:
                        seen.add(p)
                    if end is None:
                        continue
                    b = node_at[end]
                    px_path = [(x, y)] + [(rx, ry) for ry, rx in run] + [
                        (float(nodes[b].pos[0]), float(nodes[b].pos[1]))]
                    pts = np.array(px_path, dtype=float)
                    r = ink.dist[np.clip(pts[:, 1].astype(int), 0, skel.shape[0] - 1),
                                 np.clip(pts[:, 0].astype(int), 0, skel.shape[1] - 1)]
                    edges[eid] = Edge(id=eid, a=nid, b=int(b), pts=pts, r=r.astype(float))
                    eid += 1

    h, w_img = skel.shape
    return Graph(nodes=nodes, edges=edges, w=ink.w, size=(w_img, h))


CONT_ANGLE = 44.0       # deg: a leaf within this of a junction partner is a continuation


def _dir_from(e: Edge, jpos: np.ndarray, span: int = 6) -> np.ndarray:
    """Unit direction of edge `e` leaving the endpoint nearest `jpos`, averaged
    over ~`span` px so a couple of noisy pixels don't swing the angle."""
    p = e.pts
    if np.hypot(*(p[0] - jpos)) <= np.hypot(*(p[-1] - jpos)):
        a, b = p[0], p[min(len(p) - 1, span)]
    else:
        a, b = p[-1], p[max(0, len(p) - 1 - span)]
    v = b - a
    n = float(np.hypot(*v))
    return v / n if n > 0 else v


def prune_spurs(g: Graph, max_len: float) -> Graph:
    """Remove short twigs that thinning manufactures from boundary noise on wide
    strokes (§6.4) -- a leaf edge shorter than `max_len` hanging off a junction.

    But a short leaf that runs *collinear* with one of the other edges at that
    junction is not a twig: it's the continuation of that stroke, fragmented by
    the skeleton. Keep it (its neighbour effectively absorbs it -- full merge
    into one extended segment is junction resolution, M5). Only leaves that stick
    out at an angle (no near-collinear partner) are real twigs. A standalone
    short mark (both ends free) is always kept."""
    from model import BLOB, ENDPOINT, JUNCTION

    def is_twig(e, junc):
        jpos = np.array(g.nodes[junc].pos, float)
        myd = _dir_from(e, jpos)
        best = 999.0
        for o in g.edges.values():
            if o.id != e.id and (o.a == junc or o.b == junc):
                cos = float(np.clip(np.dot(-myd, _dir_from(o, jpos)), -1, 1))
                best = min(best, math.degrees(math.acos(cos)))
        return best > CONT_ANGLE            # no collinear partner -> a real twig

    changed = True
    while changed:
        changed = False
        deg: dict = {}
        for e in g.edges.values():
            deg[e.a] = deg.get(e.a, 0) + 1
            deg[e.b] = deg.get(e.b, 0) + 1
        for eid, e in list(g.edges.items()):
            da, db = deg.get(e.a, 0), deg.get(e.b, 0)
            if min(da, db) == 1 and max(da, db) >= 3 and e.length < max_len:
                junc = e.b if da == 1 else e.a
                if is_twig(e, junc):
                    del g.edges[eid]
                    changed = True

    used = {e.a for e in g.edges.values()} | {e.b for e in g.edges.values()}
    for nid in [n for n, nd in g.nodes.items() if n not in used and nd.kind != BLOB]:
        del g.nodes[nid]
    # a junction that lost branches down to two may now be a through-point; leave
    # that merge to junction resolution (M5). Refresh endpoint/junction labels.
    deg = {}
    for e in g.edges.values():
        deg[e.a] = deg.get(e.a, 0) + 1
        deg[e.b] = deg.get(e.b, 0) + 1
    for nid, nd in g.nodes.items():
        if nd.kind in (ENDPOINT, JUNCTION):
            nd.kind = ENDPOINT if deg.get(nid, 0) <= 1 else JUNCTION
    return g
