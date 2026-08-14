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
ISO = os.path.join(HERE, "subjects")

pytestmark = pytest.mark.skipif(
    not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
    reason="isolated subjects (subjects/*_iso.png) not present",
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


def test_pen_width_hole_floor():
    # A hole smaller than the pen width can't be carved by the pen, so it is dropped; a
    # hole at least a pen width across is kept (§6.2). Solid disc with one sub-pen hole
    # and one >= pen-width hole -> only the larger survives.
    from scipy import ndimage
    from ink import Ink
    w = 16.0
    H = Wd = int(16 * w)
    yy, xx = np.mgrid[0:H, 0:Wd]
    cx = cy = H // 2
    disc = (xx - cx) ** 2 + (yy - cy) ** 2 <= (6 * w) ** 2
    small = (xx - (cx + int(2.5 * w))) ** 2 + (yy - cy) ** 2 <= (0.3 * w) ** 2   # sub-pen -> drop
    big = (xx - (cx - int(2.5 * w))) ** 2 + (yy - cy) ** 2 <= (1.0 * w) ** 2      # >= pen -> keep
    mask = disc & ~small & ~big
    dist = ndimage.distance_transform_edt(mask)
    blobs, _ = segment(Ink(mask=mask, dist=dist, w=w, scale=1))
    assert len(blobs) == 1
    holes = blobs[0].holes
    assert len(holes) == 1, f"expected only the >=pen-width hole, got {len(holes)}"
    assert holes[0][:, 0].mean() < cx, "the sub-pen hole survived instead of the large one"


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


def test_no_shell_of_rim_crumbs():
    # Regression (§6.3): the old detector left the blob a pen-width inside the ink edge,
    # so a whole SHELL of ink survived around it and skeletonized into a chain of crumbs.
    # Grow-to-edge lands the boundary on the true edge, so at most a few sparse rough-edge
    # crumbs remain (strokes stay connected -- no absorb) -- not a ring of them.
    from scipy import ndimage
    ink = ingest(_iso("cannon"))
    blobs, _ = segment(ink)
    union = np.zeros_like(ink.mask)
    for b in blobs:
        union |= b.mask
    edt = ndimage.distance_transform_edt(~union) / ink.scale     # native px to a blob
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=2)
    on_rim = [e for e in g.edges.values()
              if float(np.hypot(*np.diff(e.pts, axis=0).T).sum()) / ink.scale < 2.0
              and edt[int(e.pts[len(e.pts) // 2][1]), int(e.pts[len(e.pts) // 2][0])] < 2.5]
    assert len(on_rim) <= 6, f"{len(on_rim)} rim crumbs -- a shell, not sparse roughness"


def test_dump_emits_fills_and_strokes():
    g = vectorize(os.path.join(ISO, "soldier_iso.png"), milestone=2)
    svg = dump(g)
    assert 'data-blob=' in svg and 'fill="' in svg     # filled blob present
    assert 'data-edge=' in svg                          # strokes present
    assert svg.startswith("<svg") and svg.rstrip().endswith("</svg>")
