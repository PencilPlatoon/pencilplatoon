"""M4 acceptance tests -- the model the cleanup tool consumes (plan §10, §13).

The tool needs a serialized model whose edges carry endpoint node ids (so
flood-select can traverse adjacency) and whose every element carries its stable
sid (so the edit log survives a re-run). Skips if the isolated subjects are
absent.
"""
import os

import pytest

from export_model import model_dict
from vectorize import vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (../scan-to-svg/out/*_iso.png) not present",
)


@pytest.fixture(scope="module")
def m():
    return model_dict(vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=3), "cannon")


def test_model_has_the_pieces_the_tool_needs(m):
    assert m["subject"] == "cannon" and m["w"] > 0 and len(m["size"]) == 2
    assert m["nodes"] and m["edges"] and m["blobs"]


def test_every_element_carries_a_stable_id(m):
    sids = [e["sid"] for e in m["edges"]] + [b["sid"] for b in m["blobs"]] \
        + [n["sid"] for n in m["nodes"]]
    assert all(sids) and len(sids) == len(set(sids))


def test_edges_reference_real_nodes_for_flood(m):
    node_ids = {n["id"] for n in m["nodes"]}
    for e in m["edges"]:
        assert e["a"] in node_ids and e["b"] in node_ids
        assert len(e["pts"]) >= 2


def test_flood_over_adjacency_forms_components(m):
    # the same raw-adjacency flood the tool runs: a connected sub-drawing comes
    # back as one component, not the whole scattered edge set.
    adj = {}
    for e in m["edges"]:
        for n in (e["a"], e["b"]):
            adj.setdefault(n, []).append(e["id"])
    by_id = {e["id"]: e for e in m["edges"]}

    def flood(eid):
        seen, stack, out = {eid}, [eid], set()
        while stack:
            e = by_id[stack.pop()]; out.add(e["sid"])
            for n in (e["a"], e["b"]):
                for nb in adj.get(n, []):
                    if nb not in seen:
                        seen.add(nb); stack.append(nb)
        return out

    biggest = max(len(flood(e["id"])) for e in m["edges"])
    assert 1 < biggest < len(m["edges"])          # a real component, not all-or-one
