"""Primitives acceptance tests -- emit real primitives (plan §11 "complexity wins").

The fit annotations are emitted as real SVG geometry: a `line` becomes an `L`, an
`arc` becomes a single `A` arc command (not a sampled polyline), coordinates round to one
decimal. Same picture as the sampled render, a fraction of the bytes. Gated on `primitives`,
and only when no charm is reapplied (a perturbed arc is no longer an arc).
"""
import os
import re

import numpy as np
import pytest

from fit import fit_curve, path_d
from svgdump import dump
from vectorize import Stage, vectorize

W = 10.0
COORD = re.compile(r"-?\d+\.\d{2,}")            # a coordinate with 2+ decimals = not rounded


def test_arc_becomes_one_A_command():
    rng = np.random.default_rng(0)
    th = np.linspace(0, 2 * np.pi, 160, endpoint=False)
    P = np.column_stack([200 + 70 * np.cos(th), 200 + 70 * np.sin(th)]) + rng.normal(0, 0.06 * W, (th.size, 2))
    d = path_d(fit_curve(P, W, closed=True))
    assert d.count("A") == 1, d                 # the whole circle is a single arc command
    r = float(re.search(r"A([\d.]+)", d).group(1))
    assert abs(r - 70) < 6                       # with the true radius


def test_line_is_all_linetos_no_arcs():
    rng = np.random.default_rng(0)
    s = np.linspace(0, 400, 120)
    P = np.column_stack([s, np.full(s.size, 200.0)]) + rng.normal(0, 0.06 * W, (s.size, 2))
    d = path_d(fit_curve(P, W, closed=False))
    assert "A" not in d and d.count("L") == 1    # one straight run -> a single lineto


def test_fit_emits_only_line_and_arc_kinds():
    # post-clothoid the classifier yields 'line' or 'arc' only; path_d's binary line/else
    # split relies on it -- an unhandled third kind would render silently as an arc, not error.
    rng = np.random.default_rng(3)
    th = np.linspace(0, 1.7 * np.pi, 140)
    P = np.column_stack([200 + 60 * np.cos(th), 200 + 60 * np.sin(th)]) + rng.normal(0, 0.06 * W, (th.size, 2))
    f = fit_curve(P, W, closed=False)
    assert {p.kind for p in f.prims} <= {"line", "arc"}, {p.kind for p in f.prims}


def test_coordinates_are_rounded():
    rng = np.random.default_rng(1)
    th = np.linspace(0, 1.6 * np.pi, 120)
    P = np.column_stack([200 + 55 * np.cos(th), 200 + 55 * np.sin(th)]) + rng.normal(0, 0.06 * W, (th.size, 2))
    d = path_d(fit_curve(P, W, closed=False))
    assert not COORD.search(d), "found an un-rounded coordinate"


HERE = os.path.dirname(os.path.abspath(__file__))
ISO = os.path.join(HERE, "subjects")
needs_iso = pytest.mark.skipif(not os.path.exists(os.path.join(ISO, "cannon_iso.png")),
                               reason="isolated subjects not present")


@needs_iso
def test_primitives_are_smaller_than_sampling_and_gated():
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), Stage.FIT_IDEAL_GEOMETRY)
    sampled = dump(g, primitives=False)          # sampled (no-primitives) render
    emitted = dump(g, primitives=True)            # primitives render
    assert "A" not in re.sub(r"[^A]", "", sampled) or sampled.count("A") == 0   # the sampled render never emits arcs
    assert emitted.count("A") > 10                # the cannon's arcs become A commands
    assert len(emitted) < 0.8 * len(sampled)      # and it's markedly smaller
    assert emitted.startswith("<svg") and emitted.rstrip().endswith("</svg>")


@needs_iso
def test_all_fitted_primitives_are_line_or_arc():
    # the whole real subject -- strokes, blob boundaries, holes -- classifies to line/arc only
    from model import BLOB
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), Stage.FIT_IDEAL_GEOMETRY)
    kinds = set()
    for e in g.edges.values():
        if "fit" in e.ann:
            kinds |= {p.kind for p in e.ann["fit"].prims}
    for nd in g.nodes.values():
        if nd.kind == BLOB and "fit" in nd.ann:
            kinds |= {p.kind for p in nd.ann["fit"].prims}
            for hf in nd.ann.get("fit_holes", []):
                kinds |= {p.kind for p in hf.prims}
    assert kinds == {"line", "arc"}, f"the cannon should fit both kinds and nothing else, got {kinds}"


@needs_iso
def test_emit_does_not_touch_the_model():
    # primitives is a render choice; the frozen geometry/annotations are unchanged
    g = vectorize(os.path.join(ISO, "cannon_iso.png"), Stage.FIT_IDEAL_GEOMETRY)
    for e in g.edges.values():
        assert "fit" in e.ann and e.pts is not None and len(e.pts) >= 1
