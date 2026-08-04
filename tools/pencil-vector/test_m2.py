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
    # solid regions are taken out of the stroke mask before skeletonizing, so the
    # thin mask carries meaningfully less ink than the whole drawing
    ink = ingest(_iso("cannon"))
    blobs, thin = segment(ink)
    assert blobs
    assert thin.sum() < 0.9 * ink.mask.sum()


def test_thin_mask_excludes_blob_pixels():
    ink = ingest(_iso("cannon"))
    blobs, thin = segment(ink)
    for b in blobs:
        assert not (thin & b.mask).any(), "blob pixels leaked into the thin mask"


def _poly_area(p):
    x, y = p[:, 0], p[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def test_supersample_recovers_small_receiver_holes():
    # Regression (§5): at native resolution the two small holes in the SMG receiver
    # fall under the hole noise floor and vanish; dynamic supersampling must resolve
    # them. Assert the gun blob keeps a sub-pen-scale hole in that region, which a
    # pen-relative floor at native scale would have dropped.
    ink = ingest(_iso("soldier"))
    assert ink.scale > 1, "dynamic supersample did not fire"
    blobs, _ = segment(ink)
    gun = max(blobs, key=lambda b: b.mask.sum())
    s, wn = ink.scale, ink.w / ink.scale
    receiver = [h for h in gun.holes
                if 118 <= h[:, 0].mean() / s <= 148 and 100 <= h[:, 1].mean() / s <= 124]
    assert receiver, f"no holes recovered in the receiver region (total={len(gun.holes)})"
    # at least one is genuinely small -- below w^2, i.e. it only survives via resolution
    assert any(_poly_area(h) / (s * s) < wn * wn for h in receiver), \
        "recovered holes are all large; the sub-pen-scale hole was still lost"


def test_no_microblobs_on_cannon_wheel():
    # Regression (§6.1): a blob is a genuine 2D solid, not any locally-thick line-art.
    # A doubled stroke on the wheel rim and the small hub mark used to seed microblobs
    # that pass a total-area test but have no 2D interior. The cannon's real fills are
    # only the gun-on-top; nothing solid should land on the (line-art) right wheel.
    ink = ingest(_iso("cannon"))
    blobs, _ = segment(ink)
    assert len(blobs) <= 2, f"cannon has {len(blobs)} blobs; microblobs likely returned"
    s = ink.scale
    for b in blobs:                                    # right wheel bbox, native px
        cx, cy = b.centroid[0] / s, b.centroid[1] / s
        assert not (195 <= cx <= 232 and 165 <= cy <= 214), \
            f"a blob sits on the wheel at native ({cx:.0f},{cy:.0f}) -- microblob"


def test_dump_emits_fills_and_strokes():
    g = vectorize(os.path.join(ISO, "soldier_iso.png"), milestone=2)
    svg = dump(g)
    assert 'data-blob=' in svg and 'fill="' in svg     # filled blob present
    assert 'data-edge=' in svg                          # strokes present
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
