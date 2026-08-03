"""M5 acceptance tests -- junction resolution / continuity pairing (plan §6.4).

At a crossing the two strokes are paired straight-through (so flood won't leak
across); at a T the stem is left unpaired (a termination). Synthetic junctions
plus a check on the real graph.
"""
import os

import numpy as np
import pytest

from graph import resolve_continuity
from model import ENDPOINT, JUNCTION, Edge, Graph, Node
from vectorize import vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")


def _line(a, b, n=8):
    return np.column_stack([np.linspace(a[0], b[0], n), np.linspace(a[1], b[1], n)])


def _edge(i, b, pts):
    e = Edge(i, 0, b, pts, np.full(len(pts), 2.0)); e.sid = "e%d" % i; return e


def test_x_junction_pairs_into_two_through_strokes():
    # a + crossing: left-right is one stroke, up-down is the other
    J = (50, 50)
    nodes = {0: Node(0, JUNCTION, J), 1: Node(1, ENDPOINT, (10, 50)), 2: Node(2, ENDPOINT, (90, 50)),
             3: Node(3, ENDPOINT, (50, 10)), 4: Node(4, ENDPOINT, (50, 90))}
    edges = {0: _edge(0, 1, _line(J, (10, 50))), 1: _edge(1, 2, _line(J, (90, 50))),
             2: _edge(2, 3, _line(J, (50, 10))), 3: _edge(3, 4, _line(J, (50, 90)))}
    resolve_continuity(Graph(nodes=nodes, edges=edges, w=4.0, size=(100, 100)))
    assert edges[0].ann["cont"][0] == "e1" and edges[1].ann["cont"][0] == "e0"
    assert edges[2].ann["cont"][0] == "e3" and edges[3].ann["cont"][0] == "e2"


def test_t_junction_leaves_the_stem_unpaired():
    # left-right passes through; the stem going down terminates (no smooth partner)
    J = (50, 50)
    nodes = {0: Node(0, JUNCTION, J), 1: Node(1, ENDPOINT, (10, 50)),
             2: Node(2, ENDPOINT, (90, 50)), 3: Node(3, ENDPOINT, (50, 90))}
    edges = {0: _edge(0, 1, _line(J, (10, 50))), 1: _edge(1, 2, _line(J, (90, 50))),
             2: _edge(2, 3, _line(J, (50, 90)))}
    resolve_continuity(Graph(nodes=nodes, edges=edges, w=4.0, size=(100, 100)))
    assert edges[0].ann["cont"].get(0) == "e1"          # through-stroke paired
    assert 0 not in edges[2].ann.get("cont", {})        # stem terminates, unpaired


@pytest.mark.skipif(not os.path.exists(os.path.join(ISO, "mg_iso.png")),
                    reason="mg_iso.png not present")
def test_real_crossing_pairs_up():
    # the mg has genuine crossings; at least one 4-way junction resolves to two pairs
    g = vectorize(os.path.join(ISO, "mg_iso.png"), milestone=3)
    deg = {}
    for e in g.edges.values():
        deg[e.a] = deg.get(e.a, 0) + 1; deg[e.b] = deg.get(e.b, 0) + 1
    found = False
    for nid, dg in deg.items():
        if dg != 4:
            continue
        inc = [e for e in g.edges.values() if e.a == nid or e.b == nid]
        partners = [e.ann.get("cont", {}).get(nid) for e in inc]
        if sum(p is not None for p in partners) == 4:   # all four paired into two strokes
            found = True
    assert found, "no 4-way crossing resolved into two through-strokes"
