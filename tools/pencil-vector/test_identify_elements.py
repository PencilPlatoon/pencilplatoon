"""Identify-elements acceptance tests (plan §6.1, §12).

A filled region (the cannon's gun, the SMG) becomes a filled blob instead of a
skeleton, while the surrounding line-work stays as stroke centerlines. Skips if
the isolated subjects aren't present.
"""
import os

import pytest

from model import BLOB
from svgdump import dump
from vectorize import Stage, vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "subjects")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (subjects/*_iso.png) not present",
)


def _blobs(g):
    return [nd for nd in g.nodes.values() if nd.kind == BLOB]


@pytest.mark.parametrize("name", ["cannon", "soldier"])
def test_filled_weapon_becomes_a_blob(name):
    # the cannon's gun-on-top and the gunner's SMG are solid fills -> >=1 blob
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), Stage.IDENTIFY_ELEMENTS)
    blobs = _blobs(g)
    assert blobs, f"{name} produced no blobs"
    for b in blobs:
        assert b.boundary is not None and len(b.boundary) >= 3


def test_strokes_survive_alongside_blobs():
    # element identification must not swallow the line-work: strokes remain as edges
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), Stage.IDENTIFY_ELEMENTS)
    assert g.edges, "cannon lost all strokes to blobs"


def test_dump_emits_fills_and_strokes():
    g = vectorize(os.path.join(ISO, "soldier_iso.png"), Stage.IDENTIFY_ELEMENTS)
    svg = dump(g)
    assert 'data-blob=' in svg and 'fill="' in svg     # filled blob present
    assert 'data-edge=' in svg                          # strokes present
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
