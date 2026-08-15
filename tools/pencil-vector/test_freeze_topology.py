"""Freeze-topology acceptance tests -- stable IDs and topology freeze (plan §7, §12).

The load-bearing property: re-running with a slightly different binarization
threshold must keep the same identities, so downstream cleanup survives re-runs.
On a blob-heavy subject (where a wobbling blob boundary genuinely spawns/kills
some strokes) the ID scheme never loses *more* identity than the geometry itself
changes -- it tracks geometry, it doesn't add churn of its own.
"""
import os

import numpy as np
import pytest
from PIL import Image

from model import BLOB
from vectorize import Stage, vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "subjects")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (subjects/*_iso.png) not present",
)


def _path(name):
    return os.path.join(ISO, f"{name}_iso.png")


def _edge_sids(g):
    return {e.sid for e in g.edges.values()}


def _midpoints(g):
    return [np.array(e.pts[len(e.pts) // 2], float) for e in g.edges.values()]


@pytest.mark.parametrize("bias", [0.005, -0.005])
def test_edge_ids_track_geometry_not_iteration(bias):
    # on a blob-heavy subject, IDs must not churn beyond genuine geometry change:
    # fraction of edges keeping their sid >= fraction whose midpoint still exists.
    b = vectorize(_path("soldier"), Stage.FREEZE_TOPOLOGY)
    q = vectorize(_path("soldier"), Stage.FREEZE_TOPOLOGY, thresh_bias=bias)
    bs, qs = _edge_sids(b), _edge_sids(q)
    sid_frac = len(bs & qs) / len(bs)
    qmids = _midpoints(q)
    geo_frac = sum(1 for mp in _midpoints(b)
                   if any(np.hypot(*(mp - x)) < 3 for x in qmids)) / len(bs)
    assert sid_frac >= geo_frac - 0.03


def test_ids_are_deterministic():
    a = vectorize(_path("mg"), Stage.FREEZE_TOPOLOGY)
    b = vectorize(_path("mg"), Stage.FREEZE_TOPOLOGY)
    assert sorted(_edge_sids(a)) == sorted(_edge_sids(b))
    assert sorted(n.sid for n in a.nodes.values()) == sorted(n.sid for n in b.nodes.values())


def test_ids_are_unique():
    g = vectorize(_path("cannon"), Stage.FREEZE_TOPOLOGY)
    esids = [e.sid for e in g.edges.values()]
    nsids = [n.sid for n in g.nodes.values()]
    assert len(esids) == len(set(esids)) and all(esids)
    assert len(nsids) == len(set(nsids)) and all(nsids)


def test_graph_freezes_at_m3_not_before():
    assert vectorize(_path("cannon"), Stage.FREEZE_TOPOLOGY).frozen is True
    assert vectorize(_path("cannon"), Stage.IDENTIFY_ELEMENTS).frozen is False


def test_freeze_preserves_identified_strokes():
    # Freeze-topology no longer spur-prunes: the contact-aware skeleton drops sub-pen twigs at the
    # source, so freezing (stable IDs + freeze) keeps exactly the identified strokes -- it only assigns
    # identity, it doesn't reshape.
    identified = vectorize(_path("cannon"), Stage.IDENTIFY_ELEMENTS)
    frozen = vectorize(_path("cannon"), Stage.FREEZE_TOPOLOGY)
    assert len(frozen.edges) == len(identified.edges)
    # blobs (first-class nodes) carry through unchanged
    assert any(n.kind == BLOB for n in frozen.nodes.values())
