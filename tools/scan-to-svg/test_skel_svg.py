"""Unit tests for the pure geometry in skel_svg.py.

These need no scan image — they exercise the primitive-fitting math directly with
synthetic point sets. The end-to-end pipeline is covered in test_pipeline.py.
"""
import math

import numpy as np
import pytest

import skel_svg as S
from _helpers import arc_points, edge, polygon_arc


FIT = dict(eps=0.06, floor=1.0, maxr=400.0, minr=5.0)


def kinds(P, **kw):
    """Primitive kinds ('L'/'A') that segment_prims produces for a run."""
    return [p[0] for p in S.segment_prims(P, **{**FIT, **kw})]


# --- fit_circle ----------------------------------------------------------

def test_fit_circle_recovers_known_circle():
    P = arc_points(10, -5, 40, 0, 300, 60)
    cx, cy, r, resid = S.fit_circle(P)
    assert cx == pytest.approx(10, abs=1e-4)
    assert cy == pytest.approx(-5, abs=1e-4)
    assert r == pytest.approx(40, abs=1e-4)
    assert resid == pytest.approx(0, abs=1e-4)


# --- line_resid ----------------------------------------------------------

def test_line_resid_zero_for_collinear():
    assert S.line_resid(edge((0, 0), (100, 50), 20)) == pytest.approx(0, abs=1e-9)


def test_line_resid_positive_for_bent():
    P = np.array([[0.0, 0.0], [5.0, 10.0], [10.0, 0.0]])
    assert S.line_resid(P) > 4


# --- bbox_diag / seglen --------------------------------------------------

def test_bbox_diag():
    P = np.array([[0.0, 0.0], [3.0, 4.0], [1.0, 1.0]])
    assert S.bbox_diag(P) == pytest.approx(5.0)


def test_seglen():
    assert S.seglen((0, 0), (3, 4)) == pytest.approx(5.0)


# --- max_dev_index -------------------------------------------------------

def test_max_dev_index_finds_apex():
    P = np.vstack([edge((0, 0), (40, 30), 20), edge((40, 30), (80, 0), 20)[1:]])
    k, dev = S.max_dev_index(P)
    assert np.allclose(P[k], [40, 30], atol=1e-6)
    assert dev == pytest.approx(30, abs=1e-6)


# --- swept_angle ---------------------------------------------------------

def test_swept_angle_quarter_circle():
    P = arc_points(0, 0, 50, 0, 90, 40)
    assert math.degrees(S.swept_angle(P, 0, 0)) == pytest.approx(90, abs=1)


# --- segment_prims: the core line/arc/corner behavior --------------------

def test_straight_run_is_single_line():
    assert kinds(edge((0, 0), (100, 50), 40)) == ["L"]


def test_true_arc_is_fitted_as_arc():
    # A clean 140-degree arc must survive as one arc, not be faceted into lines.
    assert "A" in kinds(arc_points(0, 0, 60, 0, 140, 80))


def test_corner_becomes_two_lines_not_arc():
    # Two straight edges meeting at a peak -> a corner, never an arc.
    P = np.vstack([edge((0, 0), (40, 30), 25), edge((40, 30), (80, 0), 25)[1:]])
    k = kinds(P)
    assert "A" not in k
    assert k == ["L", "L"]


def test_trapezoid_stays_straight(trapezoid):
    # Regression for cannon seg9: a 3-edge outline that loosely fits a circle
    # must render as straight segments, not one smoothing arc.
    assert "A" not in kinds(trapezoid)


def test_corner_test_uses_own_size_tolerance():
    # A genuine arc, split at its crown, yields two half-arcs that are straight
    # relative to the WHOLE run but curved at their own scale. The corner test
    # must judge each half by its own size and so keep the arc.
    P = arc_points(0, 0, 60, 0, 140, 80)
    k, _ = S.max_dev_index(P)
    parent_tol = max(FIT["floor"], FIT["eps"] * S.bbox_diag(P))
    # Each half looks "straight" against the parent's tolerance...
    assert S.line_resid(P[: k + 1]) <= parent_tol
    # ...but not against its own, so it is (correctly) not treated as a corner.
    own_tol = max(FIT["floor"], FIT["eps"] * S.bbox_diag(P[: k + 1]))
    assert S.line_resid(P[: k + 1]) > own_tol


# --- ARC_FIT gate: an arc must hug the pixels, not merely fit within tol ---

def test_arc_fit_gate_rejects_loose_circle(monkeypatch):
    # nv=4 chords give aerr/tol ~= 0.64: within tol, but not within 0.5*tol.
    P = polygon_arc(0, 0, 50, 10, 190, n_vertices=4)
    _, _, _, aerr = S.fit_circle(P)
    tol = max(FIT["floor"], FIT["eps"] * S.bbox_diag(P))
    assert 0.5 < aerr / tol <= 1.0  # genuinely in the "loose" band

    assert "A" not in kinds(P)  # default tight gate -> straight lines

    monkeypatch.setattr(S, "ARC_FIT", 1.0)  # loosen the gate to plain "within tol"
    assert "A" in kinds(P)  # now the same loose circle is accepted


def test_arc_fit_gate_keeps_tight_circle():
    # nv=6 chords hug the circle (aerr/tol well under 0.5) -> kept as an arc.
    assert "A" in kinds(polygon_arc(0, 0, 50, 10, 190, n_vertices=6))


# --- arc_cmd / prims_to_d ------------------------------------------------

def test_arc_cmd_flags_and_endpoint():
    P = arc_points(0, 0, 50, 0, 90, 20)  # quarter circle, counter-clockwise
    parts = S.arc_cmd(P, 0, 0, 50).split()
    assert parts[0] == "A"
    assert float(parts[1]) == pytest.approx(50, abs=0.1)
    assert parts[4] == "0"  # large-arc flag (sweep < 180)
    assert parts[5] == "1"  # sweep flag (positive/ccw)
    assert (float(parts[6]), float(parts[7])) == pytest.approx((0, 50), abs=0.5)


def test_prims_to_d_line():
    prims = [("L", np.array([0.0, 0.0]), np.array([10.0, 20.0]))]
    assert S.prims_to_d(prims) == "M 0.0 0.0 L 10.0 20.0"


# --- ray_to_circle -------------------------------------------------------

def test_ray_to_circle_picks_nearest_intersection():
    # From origin heading +x toward a circle centred at (10,0) r=3: hits x=7.
    pt = S.ray_to_circle([0.0, 0.0], (1.0, 0.0), (10.0, 0.0, 3.0))
    assert pt[0] == pytest.approx(7.0)
    assert pt[1] == pytest.approx(0.0)


def test_ray_to_circle_misses_returns_none():
    # Parallel to x-axis but offset far above the circle -> no intersection.
    assert S.ray_to_circle([0.0, 100.0], (1.0, 0.0), (10.0, 0.0, 3.0)) is None


# --- skeleton graph helpers ----------------------------------------------

def test_skeleton_polylines_single_path():
    skel = np.zeros((3, 12), bool)
    skel[1, 1:11] = True  # a straight 10-pixel horizontal run
    lines = S.skeleton_polylines(skel)
    assert len(lines) == 1
    assert len(lines[0]) == 10


def test_prune_spurs_removes_dangling_branch():
    skel = np.zeros((7, 14), bool)
    skel[5, 1:13] = True  # main line: arms of 5 and 6 px on either side of the junction
    skel[2:5, 6] = True   # a 3-px vertical spur rising from the line at column 6
    pruned = S.prune_spurs(skel, max_len=3)  # short spur pruned, longer arms kept
    assert not pruned[2, 6]  # spur tip removed
    assert not pruned[3, 6]  # spur body removed
    assert pruned[5, 1] and pruned[5, 12]  # main line preserved


def test_link_strokes_joins_collinear_polylines():
    a = edge((0, 0), (10, 0), 11)
    b = edge((10, 0), (20, 0), 11)
    groups = S.link_strokes([a, b])
    assert len(groups) == 1
    assert sorted(groups[0]) == [0, 1]


def test_link_strokes_keeps_sharp_turn_separate():
    # Two polylines meeting at a right angle should NOT be linked into one stroke.
    a = edge((0, 0), (10, 0), 11)
    b = edge((10, 0), (10, 10), 11)
    groups = S.link_strokes([a, b])
    assert len(groups) == 2
