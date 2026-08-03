"""The vectorizer's data model.

Per the plan (§2.2, §9): the model is a graph of nodes and edges plus a layer
of *annotations*. Stages below the topology tiers record facts about an edge
("this run fits an arc, center c, radius r, residual sigma") rather than
rewriting its geometry. The sampled polyline is ground truth; export decides
which annotations to cash in. Nothing here substitutes geometry.

`w` -- the modal pen width -- rides on the graph because every downstream
tolerance is expressed in multiples of it (§2.3).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# Node kinds (§6.3). A blob is a first-class connectivity hub, not a skeleton
# branch: it has no interior medial axis, so it carries a boundary + a set of
# parameterized attachment points where strokes meet it.
ENDPOINT = "endpoint"   # valence 1
JUNCTION = "junction"   # valence >= 3
BLOB = "blob"           # a filled region


@dataclass
class Node:
    id: int
    kind: str
    pos: tuple[float, float]              # (x, y) representative point
    boundary: np.ndarray | None = None    # (M,2) outline, blobs only
    ann: dict = field(default_factory=dict)


@dataclass
class Edge:
    """A collapsed graph edge: one run from node `a` to node `b`, with no
    valence-2 nodes in between (§6.3)."""
    id: int
    a: int
    b: int
    pts: np.ndarray                       # (N,2) centerline polyline
    r: np.ndarray                         # (N,) half-width sampled along pts
    width_class: str = "stroke"           # stroke | blob | variable (Stage 1)
    ann: dict = field(default_factory=dict)

    @property
    def length(self) -> float:
        if len(self.pts) < 2:
            return 0.0
        return float(np.hypot(*np.diff(self.pts, axis=0).T).sum())


@dataclass
class Graph:
    nodes: dict[int, Node]
    edges: dict[int, Edge]
    w: float                              # modal pen width, the unit of scale
    size: tuple[int, int]                 # (width, height) of the source raster

    def neighbors(self, node_id: int) -> list[Edge]:
        return [e for e in self.edges.values() if e.a == node_id or e.b == node_id]
