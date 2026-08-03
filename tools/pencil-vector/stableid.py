"""Stage 5 (M3) -- topology freeze and stable IDs (plan §7).

Human cleanup (Stage 7) is expensive and keyed on element identity, while the
vectorizer is re-run many times as tolerances are tuned. If IDs came from
traversal order, every re-run would silently invalidate every cleaned drawing.
So identity is derived from *re-derivable geometry*, not iteration index:

  - a **node**'s id is a hash of its position quantized to a coarse grid (~1.5w),
    coarse enough that a small binarization change doesn't move it to another
    cell;
  - an **edge**'s id is a hash of its *midpoint* quantized to a coarse grid
    (~2w). The midpoint is the mean of the whole polyline, so it barely moves
    when the threshold shifts -- far steadier than keying on the endpoint nodes,
    where one node flipping a grid cell would cascade to every edge touching it.

Collisions inside a cell are broken by a stable secondary sort (length), then
indexed. After assignment the graph is frozen: nothing in the automatic pipeline
may renumber or re-shape it.

The ID-stability test (`test_m3.py`) perturbs the threshold a few percent and
asserts >=95% of edge ids survive -- the property this whole scheme exists for.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict

from model import Graph

NODE_GRID_W = 1.5       # node quantization cell size, in units of w
EDGE_GRID_W = 2.0       # edge-midpoint quantization cell size, in units of w


def _h(prefix: str, *parts) -> str:
    digest = hashlib.blake2s(repr(parts).encode(), digest_size=5).hexdigest()
    return prefix + digest


def _cell(pos, q):
    return (int(round(pos[0] / q)), int(round(pos[1] / q)))


def assign(g: Graph) -> Graph:
    """Assign stable `sid`s to every node and edge, then freeze the graph."""
    nq = max(4.0, NODE_GRID_W * g.w)
    eq = max(4.0, EDGE_GRID_W * g.w)

    # Nodes: bucket by grid cell, break ties by rounded position + kind.
    by_cell: dict = defaultdict(list)
    for nd in g.nodes.values():
        by_cell[_cell(nd.pos, nq)].append(nd)
    for c, nds in by_cell.items():
        nds.sort(key=lambda n: (round(n.pos[0], 1), round(n.pos[1], 1), n.kind))
        for j, nd in enumerate(nds):
            nd.sid = _h("n", c, nd.kind, j)

    # Edges: identity is the quantized midpoint (steady under threshold change),
    # ties broken by length so overlapping/parallel edges stay distinct.
    by_mid: dict = defaultdict(list)
    for e in g.edges.values():
        mid = e.pts[len(e.pts) // 2]
        by_mid[_cell(mid, eq)].append(e)
    for c, es in by_mid.items():
        es.sort(key=lambda e: round(e.length, 1))
        for j, e in enumerate(es):
            e.sid = _h("e", c, j)

    g.frozen = True
    return g
