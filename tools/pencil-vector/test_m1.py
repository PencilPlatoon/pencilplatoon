"""M1 acceptance tests (plan §5, §12).

Runs the end-to-end skeleton->graph on the checked-in isolated subjects and
asserts the two things M1 promises: a sane pen width `w`, and a connected graph
of junction-to-junction edges dumped as SVG paths. Skips if the isos are absent.
"""
import os

import numpy as np
import pytest
from PIL import Image

from graph import build
from ink import ingest
from model import ENDPOINT, JUNCTION
from svgdump import dump

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")

# line-art subjects: w should read as a thin pen. (soldier/flag are fill-heavy
# or fine-emblem, so their w is Stage-1's business, not M1's.)
LINE_ART = ["cannon", "mg", "dying"]

pytestmark = pytest.mark.skipif(
    not os.path.isdir(ISO) or not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (../scan-to-svg/out/*_iso.png) not present",
)


def _graph(name):
    rgb = np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB"))
    return build(ingest(rgb))


@pytest.mark.parametrize("name", LINE_ART)
def test_pen_width_is_sane(name):
    # hand-measured line-art stroke on these scans is ~4px; accept a wide band
    # but reject degenerate (<=1) or fill-dominated (>8) results.
    g = _graph(name)
    assert 2.0 <= g.w <= 8.0, f"{name} w={g.w}"


@pytest.mark.parametrize("name", LINE_ART)
def test_graph_is_nonempty_and_typed(name):
    g = _graph(name)
    assert g.nodes and g.edges
    kinds = {nd.kind for nd in g.nodes.values()}
    assert kinds <= {ENDPOINT, JUNCTION}          # blobs arrive in M2
    assert {ENDPOINT, JUNCTION} & kinds            # at least one real node kind


@pytest.mark.parametrize("name", LINE_ART)
def test_edges_are_junction_to_junction(name):
    # every edge connects two existing nodes and carries >=2 points + width samples
    g = _graph(name)
    for e in g.edges.values():
        assert e.a in g.nodes and e.b in g.nodes
        assert len(e.pts) >= 2 and len(e.r) == len(e.pts)


def test_dump_emits_a_seg_per_edge():
    # M1 has no blobs, so every component is a stroke edge: one interactive
    # <g class="seg"> and one data-edge apiece.
    g = _graph("cannon")
    svg = dump(g, show_nodes=True)
    assert svg.count('class="seg"') == len(g.edges)
    assert svg.count('data-edge="') == len(g.edges)
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
