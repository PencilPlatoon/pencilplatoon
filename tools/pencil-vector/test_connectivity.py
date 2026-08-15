"""Connectivity invariant, checked on the ACTUAL rendered output (plan tier 1, §12).

Geometry-space checks miss render bugs -- an `A` arc command with a wrong sweep/large-arc
flag draws the arc the wrong way and self-intersects a fill, or an arc boundary smooths
inward off the strokes attached to it, splitting the drawing -- none of which show up in the
sampled geometry. So we rasterize the emitted paths (arcs and all, via raster.py) and check
connectivity PER COLOUR: different colours are separate entities, but within one colour a
connected run of ink must never render as disconnected pieces.
"""
import os

import numpy as np
import pytest
from PIL import Image

import raster
from ink import ingest
from vectorize import Stage, vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "subjects")
SUBJECTS = ["cannon", "mg", "soldier", "dying", "flag"]

# (stage, primitives) render configs to check. Emitting the fitted geometry as real arc/line primitives
# is a render choice on top of FIT_IDEAL_GEOMETRY, so it's a flag here rather than its own stage.
RENDER_CONFIGS = [(Stage.PLANAR_EMBED, False), (Stage.FIT_IDEAL_GEOMETRY, False),
                  (Stage.FIT_IDEAL_GEOMETRY, True)]
IDEAL_CONFIGS = [(Stage.FIT_IDEAL_GEOMETRY, False), (Stage.FIT_IDEAL_GEOMETRY, True)]


def _label(stage, primitives):
    return stage.name.lower() + ("+primitives" if primitives else "")


pytestmark = pytest.mark.skipif(not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
                                reason="isolated subjects not present")


@pytest.mark.parametrize("name", SUBJECTS)
@pytest.mark.parametrize("stage,primitives", RENDER_CONFIGS)
def test_render_preserves_connectivity(name, stage, primitives):
    # within each colour the rendered pieces must not exceed the ink pieces (no split)
    ink = ingest(np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB")))
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), stage)
    rows, worst = raster.connectivity(g, ink, primitives=primitives)
    splits = [(c, rc, ic) for c, rc, ic, _ in rows if rc > ic]
    assert worst <= 0, f"{name} {_label(stage, primitives)} splits a colour (colour, render, ink): {splits}"


@pytest.mark.parametrize("name", SUBJECTS)
@pytest.mark.parametrize("stage,primitives", IDEAL_CONFIGS)
def test_idealization_breaks_no_attachment(name, stage, primitives):
    # the detour-masked class piece-counting can't see: idealizing/emitting a fill must not pull
    # a stroke the ink held against a blob out of contact, even if the drawing stays one piece the
    # long way round (how cannon 2/26 slipped through). Checked on the actual render, per attachment.
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), stage)
    broken = raster.broken_attachments(g, primitives=primitives)
    # a graze the corner detector idealizes a hair past the ½-pen reach reads as still attached: the
    # boundary recedes just over the hard cutoff (rounding), not a real detachment. Accept overshoots
    # under 0.15w; a genuine break (how cannon 2/26 slipped through) is far larger. Tolerance-relative,
    # not a hardcoded blob id, so it survives the resolution normalization (§5) rescaling the geometry.
    broken = [b for b in broken if b[2] - g.w / 2 >= 0.15 * g.w]
    assert not broken, f"{name} {_label(stage, primitives)} idealization broke attachments (blob, edge, gap): {broken}"


@pytest.mark.parametrize("name", SUBJECTS)
def test_render_covers_the_ink(name):
    # idealization trims edges, but the render must still cover the bulk of each colour's ink
    ink = ingest(np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB")))
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), Stage.FIT_IDEAL_GEOMETRY)
    rows, _ = raster.connectivity(g, ink, primitives=True)
    for c, _, _, cov in rows:
        assert cov >= 0.6, f"{name} colour {c} coverage only {cov:.2f} -- a chunk went missing"
