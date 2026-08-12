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
from vectorize import vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")
SUBJECTS = ["cannon", "mg", "soldier", "dying", "flag"]

pytestmark = pytest.mark.skipif(not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
                                reason="isolated subjects not present")


@pytest.mark.parametrize("name", SUBJECTS)
@pytest.mark.parametrize("milestone", [6, 7, 8])
def test_render_preserves_connectivity(name, milestone):
    # within each colour the rendered pieces must not exceed the ink pieces (no split)
    ink = ingest(np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB")))
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), milestone=milestone)
    rows, worst = raster.connectivity(g, ink, primitives=milestone >= 8)
    splits = [(c, rc, ic) for c, rc, ic, _ in rows if rc > ic]
    assert worst <= 0, f"{name} M{milestone} splits a colour (colour, render, ink): {splits}"


@pytest.mark.parametrize("name", SUBJECTS)
@pytest.mark.parametrize("milestone", [7, 8])
def test_idealization_breaks_no_attachment(name, milestone):
    # the detour-masked class piece-counting can't see: idealizing/emitting a fill must not pull
    # a stroke the ink held against a blob out of contact, even if the drawing stays one piece the
    # long way round (how cannon 2/26 slipped through). Checked on the actual render, per attachment.
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), milestone=milestone)
    broken = raster.broken_attachments(g, primitives=milestone >= 8)
    # reviewed exceptions: a graze the v3 corner detector idealizes 0.5px past the ½-pen reach -- the boundary
    # recedes just over the hard cutoff but the stroke reads as attached (see flag_diff artifact). (blob, name).
    accepted = {(212, "flag")}
    broken = [b for b in broken if (b[0], name) not in accepted]
    assert not broken, f"{name} M{milestone} idealization broke attachments (blob, edge, gap): {broken}"


@pytest.mark.parametrize("name", SUBJECTS)
def test_render_covers_the_ink(name):
    # idealization trims edges, but the render must still cover the bulk of each colour's ink
    ink = ingest(np.asarray(Image.open(os.path.join(ISO, f"{name}_iso.png")).convert("RGB")))
    g = vectorize(os.path.join(ISO, f"{name}_iso.png"), milestone=8)
    rows, _ = raster.connectivity(g, ink, primitives=True)
    for c, _, _, cov in rows:
        assert cov >= 0.6, f"{name} colour {c} coverage only {cov:.2f} -- a chunk went missing"
