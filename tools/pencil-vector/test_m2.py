"""M2 acceptance tests (plan §6.1, §12).

Width-class segmentation: a filled region (the cannon's gun, the SMG) becomes a
filled blob instead of a skeleton, while the surrounding line-work stays as
stroke centerlines. Skips if the isolated subjects aren't present.
"""
import os

import numpy as np
import pytest
from PIL import Image

from ink import ingest
from model import BLOB
from svgdump import dump
from vectorize import vectorize
from widthclass import segment

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (../scan-to-svg/out/*_iso.png) not present",
)


def _iso(name):
    return np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB"))


def _blobs(g):
    return [nd for nd in g.nodes.values() if nd.kind == BLOB]


@pytest.mark.parametrize("name", ["cannon", "soldier"])
def test_filled_weapon_becomes_a_blob(name):
    # the cannon's gun-on-top and the gunner's SMG are solid fills -> >=1 blob
    g = vectorize(_path := os.path.join(ISO, f"{name}_iso.png"), milestone=2)
    blobs = _blobs(g)
    assert blobs, f"{name} produced no blobs"
    for b in blobs:
        assert b.boundary is not None and len(b.boundary) >= 3


def test_strokes_survive_alongside_blobs():
    # segmentation must not swallow the line-work: strokes remain as edges
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=2)
    assert g.edges, "cannon lost all strokes to blobs"


def test_blob_interior_removed_from_skeleton():
    # M2 skeletonizes only the thin mask, so it has fewer edges than M1's
    # whole-mask skeleton (the gun's messy centerlines are gone)
    p = os.path.join(ISO, "cannon_iso.png")
    assert len(vectorize(p, milestone=2).edges) < len(vectorize(p, milestone=1).edges)


def test_thin_mask_excludes_blob_pixels():
    ink = ingest(_iso("cannon"))
    blobs, thin = segment(ink)
    for b in blobs:
        assert not (thin & b.mask).any(), "blob pixels leaked into the thin mask"


def test_dump_emits_fills_and_strokes():
    g = vectorize(os.path.join(ISO, "soldier_iso.png"), milestone=2)
    svg = dump(g)
    assert 'data-blob=' in svg and 'fill="' in svg     # filled blob present
    assert 'data-edge=' in svg                          # strokes present
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
