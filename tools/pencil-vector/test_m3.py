"""M3 acceptance tests -- stable IDs and topology freeze (plan §7, §12).

The load-bearing property: re-running with a slightly different binarization
threshold must keep the same identities, so downstream cleanup survives re-runs.
Two checks capture that: on clean line-art the edge IDs are >=95% preserved under
a few-percent threshold change; and on a blob-heavy subject (where a wobbling
blob boundary genuinely spawns/kills some strokes) the ID scheme never loses
*more* identity than the geometry itself changes -- it tracks geometry, it
doesn't add churn of its own.
"""
import os

import numpy as np
import pytest
from PIL import Image

from graph import prune_spurs
from model import ENDPOINT, JUNCTION, BLOB, Edge, Graph, Node
from vectorize import vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (../scan-to-svg/out/*_iso.png) not present",
)


def _path(name):
    return os.path.join(ISO, f"{name}_iso.png")


def _edge_sids(g):
    return {e.sid for e in g.edges.values()}


def _midpoints(g):
    return [np.array(e.pts[len(e.pts) // 2], float) for e in g.edges.values()]


@pytest.mark.parametrize("bias", [0.005, -0.005])
def test_edge_ids_stable_on_clean_lineart(bias):
    # plan §7: perturb the threshold ~1%, >=95% of edge IDs survive. (A larger
    # perturbation moves solid-region boundaries -- a genuine topology change, not
    # ID churn; that regime is covered by test_edge_ids_track_geometry.)
    base = _edge_sids(vectorize(_path("cannon"), milestone=3))
    pert = _edge_sids(vectorize(_path("cannon"), milestone=3, thresh_bias=bias))
    assert len(base & pert) / len(base) >= 0.95


@pytest.mark.parametrize("bias", [0.005, -0.005])
def test_edge_ids_track_geometry_not_iteration(bias):
    # on a blob-heavy subject, IDs must not churn beyond genuine geometry change:
    # fraction of edges keeping their sid >= fraction whose midpoint still exists.
    b = vectorize(_path("soldier"), milestone=3)
    q = vectorize(_path("soldier"), milestone=3, thresh_bias=bias)
    bs, qs = _edge_sids(b), _edge_sids(q)
    sid_frac = len(bs & qs) / len(bs)
    qmids = _midpoints(q)
    geo_frac = sum(1 for mp in _midpoints(b)
                   if any(np.hypot(*(mp - x)) < 3 for x in qmids)) / len(bs)
    assert sid_frac >= geo_frac - 0.03


def test_ids_are_deterministic():
    a = vectorize(_path("mg"), milestone=3)
    b = vectorize(_path("mg"), milestone=3)
    assert sorted(_edge_sids(a)) == sorted(_edge_sids(b))
    assert sorted(n.sid for n in a.nodes.values()) == sorted(n.sid for n in b.nodes.values())


def test_ids_are_unique():
    g = vectorize(_path("cannon"), milestone=3)
    esids = [e.sid for e in g.edges.values()]
    nsids = [n.sid for n in g.nodes.values()]
    assert len(esids) == len(set(esids)) and all(esids)
    assert len(nsids) == len(set(nsids)) and all(nsids)


def test_graph_freezes_at_m3_not_before():
    assert vectorize(_path("cannon"), milestone=3).frozen is True
    assert vectorize(_path("cannon"), milestone=2).frozen is False


def _line(a, b, n=8):
    return np.column_stack([np.linspace(a[0], b[0], n), np.linspace(a[1], b[1], n)])


def test_prune_keeps_collinear_leaf_drops_angled_twig():
    # A junction J with a long stroke to the left, a SHORT collinear leaf to the
    # right (a fragmented continuation, keep), a SHORT angled leaf up (a real
    # twig, prune), and a LONGER angled leaf down (a deliberate segment, keep --
    # long enough not to be a thinning artifact even though it's not collinear).
    J, Lend, Cend, Dup, Ddn = (0, 0), (-40, 0), (5, 0), (0, 4), (0, 10)
    nodes = {
        0: Node(0, JUNCTION, J), 1: Node(1, ENDPOINT, Lend),
        2: Node(2, ENDPOINT, Cend), 3: Node(3, ENDPOINT, Dup), 4: Node(4, ENDPOINT, Ddn),
    }
    def edge(i, b, pts):
        return Edge(i, 0, b, pts, np.full(len(pts), 2.0))
    edges = {
        0: edge(0, 1, _line(J, Lend)),      # long stroke
        1: edge(1, 2, _line(J, Cend)),      # collinear short leaf -> keep
        2: edge(2, 3, _line(J, Dup)),       # angled short leaf (4px < 6) -> prune
        3: edge(3, 4, _line(J, Ddn)),       # angled longer leaf (10px > 6) -> keep
    }
    g = Graph(nodes=nodes, edges=edges, w=4.0, size=(100, 100))
    prune_spurs(g, max_len=6.0)             # threshold 6px (=1.5w here)
    assert 1 in g.edges, "collinear continuation was wrongly pruned"
    assert 3 in g.edges, "a long enough segment was wrongly pruned as a twig"
    assert 2 not in g.edges, "angled short twig was not pruned"
    assert 0 in g.edges


def test_prune_keeps_leaf_that_attaches_to_a_blob():
    # A short angled leaf that would prune on its own is KEPT when its free end
    # runs into a blob -- it's a connector, not a twig (connectivity > geometry).
    J, Lend, Rend, Aend = (50, 50), (10, 50), (90, 50), (50, 54)
    def make():
        nodes = {0: Node(0, JUNCTION, J), 1: Node(1, ENDPOINT, Lend),
                 2: Node(2, ENDPOINT, Aend), 3: Node(3, ENDPOINT, Rend)}
        edges = {0: Edge(0, 0, 1, _line(J, Lend), np.full(8, 2.0)),   # long stroke left
                 3: Edge(3, 0, 3, _line(J, Rend), np.full(8, 2.0)),   # long stroke right (J is deg 3)
                 2: Edge(2, 0, 2, _line(J, Aend), np.full(8, 2.0))}   # 4px leaf, angled up
        return Graph(nodes=nodes, edges=edges, w=4.0, size=(100, 100))
    blob = np.zeros((100, 100), bool)
    blob[56:66, 44:56] = True                # a blob just past the leaf's free end

    attached = make()
    prune_spurs(attached, max_len=6.0, blob_masks=[blob])
    assert 2 in attached.edges, "leaf running into a blob was wrongly pruned"

    dangling = make()
    prune_spurs(dangling, max_len=6.0)       # same leaf, no blob -> a real twig
    assert 2 not in dangling.edges, "angled twig with no blob was not pruned"


def test_spurs_pruned_at_m3():
    # M3 prunes thinning twigs, so it has no more edges than M2
    m2 = vectorize(_path("cannon"), milestone=2)
    m3 = vectorize(_path("cannon"), milestone=3)
    assert len(m3.edges) <= len(m2.edges)
    # blobs (first-class nodes) survive the prune
    assert any(n.kind == BLOB for n in m3.nodes.values())
