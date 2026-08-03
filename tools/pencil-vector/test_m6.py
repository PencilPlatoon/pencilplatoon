"""M6 acceptance tests -- planar embedding (plan §8).

Interior holes are traced (a hollow shape stays hollow), the rotational order
around a junction is its incident edges, a nested fill gets a higher paint order,
and the post-fit validator catches a fit that introduces a crossing.
"""
import os

import numpy as np
import pytest

from embedding import containment, count_crossings, rotational_order, validate_embedding
from model import BLOB, Edge, Graph, Node
from vectorize import vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects not present",
)


def _iso(name):
    return os.path.join(ISO, f"{name}_iso.png")


def _e(i, a, b, pts):
    return Edge(i, a, b, np.array(pts, float), np.zeros(len(pts)))


def test_blobs_get_interior_holes():
    # the SMG's solid has real hollows -- they must be traced, not swallowed
    g = vectorize(_iso("soldier"), milestone=6)
    blobs = [nd for nd in g.nodes.values() if nd.kind == BLOB]
    assert any(nd.ann.get("holes") for nd in blobs)


def test_rotational_order_is_the_incident_edges():
    g = vectorize(_iso("cannon"), milestone=6)
    for nid, nd in g.nodes.items():
        if nd.kind == BLOB:
            continue
        inc = {e.sid for e in g.edges.values() if e.a == nid or e.b == nid}
        assert set(nd.ann.get("rot", [])) == inc


def test_nested_fill_gets_a_higher_paint_order():
    # a small fill inside a larger one paints on top (higher z)
    outer = np.array([(0, 0), (100, 0), (100, 100), (0, 100)], float)
    inner = np.array([(10, 10), (30, 10), (30, 30), (10, 30)], float)
    nodes = {0: Node(0, BLOB, (50, 50), boundary=outer),
             1: Node(1, BLOB, (20, 20), boundary=inner)}
    containment(Graph(nodes=nodes, edges={}, w=4.0, size=(100, 100)))
    assert nodes[1].ann["z"] >= 1       # inner is enclosed -> painted after
    assert nodes[0].ann["z"] == 0       # outer encloses nothing


def test_count_crossings():
    assert count_crossings([_e(0, 0, 1, [(0, 0), (10, 10)]),
                            _e(1, 2, 3, [(0, 10), (10, 0)])]) == 1        # cross
    assert count_crossings([_e(2, 4, 5, [(0, 0), (10, 0)]),
                            _e(3, 6, 7, [(0, 5), (10, 5)])]) == 0         # parallel
    assert count_crossings([_e(4, 0, 1, [(0, 0), (10, 0)]),
                            _e(5, 1, 2, [(10, 0), (10, 10)])]) == 0       # share a node


def test_validate_embedding_flags_a_new_crossing():
    before = [_e(0, 0, 1, [(0, 0), (10, 0)]), _e(1, 2, 3, [(0, 5), (10, 5)])]   # parallel
    after = [_e(0, 0, 1, [(0, 0), (10, 0)]), _e(1, 2, 3, [(0, -1), (10, 1)])]   # now crosses
    assert validate_embedding(before, before) == []
    assert validate_embedding(before, after)
