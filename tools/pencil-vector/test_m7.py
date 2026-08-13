"""M7 acceptance tests -- geometry fitting (plan §9).

Working in the turning function, a wobbly-but-straight run fits ONE line, a distorted
circle ONE arc (not forty segments), and a deliberate corner survives as a step. The fit
is an annotation: the raw points are never replaced, and a tunable fraction of the residual
reproduces the hand exactly at alpha=1.
"""
import os
from collections import Counter

import numpy as np
import pytest

from fit import fit_curve, reconstruct
from model import BLOB
from vectorize import vectorize

W = 10.0


def _kinds(f):
    return Counter(p.kind for p in f.prims)


def _wobble(rng, n, amp=0.06):                 # per-sample jitter at ~real-scan level. The spline corner
    return rng.normal(0, amp * W, (n, 2))      # detector tunes for real-scan fidelity (validated on hand
    #                                            labels), not extreme synthetic noise that traces never show.


def test_straight_run_is_one_line():
    rng = np.random.default_rng(0)
    s = np.linspace(0, 400, 120)
    P = np.column_stack([s, np.full(s.size, 200.0)]) + _wobble(rng, s.size)
    f = fit_curve(P, W, closed=False)
    assert [p.kind for p in f.prims] == ["line"], _kinds(f)


def test_distorted_circle_is_one_arc_not_many():
    rng = np.random.default_rng(0)
    th = np.linspace(0, 2 * np.pi, 160, endpoint=False)
    P = np.column_stack([300 + 90 * np.cos(th), 300 + 90 * np.sin(th)]) + _wobble(rng, th.size)
    f = fit_curve(P, W, closed=True)
    assert _kinds(f) == {"arc": 1}, _kinds(f)
    assert abs(f.prims[0].params["radius"] - 90) < 6           # recovered the true radius


def test_corner_survives_as_a_step():
    # an L: two straight legs meeting at a right angle -> two lines with a corner between,
    # NOT one smoothed curve (the whole point of working in curvature, not x/y)
    rng = np.random.default_rng(0)
    a = np.column_stack([np.linspace(0, 200, 60), np.full(60, 100.0)])
    b = np.column_stack([np.full(60, 200.0), np.linspace(100, 300, 60)])
    f = fit_curve(np.vstack([a, b]) + _wobble(rng, 120, 0.06), W, closed=False)
    assert _kinds(f) == {"line": 2}, _kinds(f)
    assert sum(p.corner_in for p in f.prims) == 1             # exactly one C0 break


def test_charm_reproduces_the_hand_and_zero_is_crisp():
    rng = np.random.default_rng(1)
    th = np.linspace(0, 2 * np.pi, 200, endpoint=False)
    P = np.column_stack([200 + 60 * np.cos(th), 200 + 60 * np.sin(th)]) + _wobble(rng, th.size)
    f = fit_curve(P, W, closed=True)
    hand = reconstruct(f, 1.0)                                # alpha=1: exactly the resampled hand
    crisp = reconstruct(f, 0.0)                               # alpha=0: the idealized geometry
    assert np.allclose(hand[:-1], f.samples, atol=1e-6)       # (closed: drop the repeated wrap)
    assert not np.allclose(crisp[:-1], f.samples, atol=1.0)   # crisp genuinely differs from the wobble


# ---- integration on the real pipeline (skip if the isolated subjects aren't present) ----

HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "..", "scan-to-svg", "out")
needs_iso = pytest.mark.skipif(not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
                               reason="isolated subjects not present")


@needs_iso
def test_m7_annotates_without_replacing_points():
    g6 = vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=6)
    g7 = vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=7)
    assert all("fit" not in e.ann for e in g6.edges.values())     # gating: no fit before M7
    assert all("fit" in e.ann for e in g7.edges.values())         # every stroke fitted at M7
    assert any("fit" in nd.ann for nd in g7.nodes.values() if nd.kind == BLOB)   # blobs too
    for e in g7.edges.values():                                   # raw geometry untouched (§9)
        assert e.pts is not None and len(e.pts) >= 1


@needs_iso
def test_m7_fits_lines_and_arcs_on_a_real_subject():
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), milestone=7)
    kinds = Counter(p.kind for e in g.edges.values() for p in e.ann["fit"].prims)
    assert kinds["line"] > 0 and kinds["arc"] > 0                 # the cannon has both
