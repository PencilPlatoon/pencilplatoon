"""Stage 2-3 (M1 subset) -- skeleton and naive graph construction (plan §6.2-6.3).

M1 is deliberately naive: thin the whole mask, find nodes where the skeleton's
degree != 2, and trace the degree-2 runs between them into junction-to-junction
edges. Width classification (blobs vs strokes), continuity pairing, and stable
IDs arrive in later milestones; this just gets a graph end-to-end.

IDs here are traversal-order and therefore NOT yet stable across re-runs -- that
is M3's job (§7), and is called out so nothing downstream leans on them early.
"""
from __future__ import annotations

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


def build(ink: Ink) -> Graph:
    skel = skeletonize(ink.mask)
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
