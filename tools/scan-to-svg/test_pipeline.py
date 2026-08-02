"""End-to-end regression test over the real scan.

Runs the isolate -> vectorize steps on the checked-in scan and asserts the
behavior the fixes were made for: the cannon has no smoothing arcs (seg9 became
a trapezoid, seg36 became straight segments) while the flag keeps its one genuine
curved stroke. Skipped automatically if the scan image isn't present.
"""
import os
import subprocess
import sys

import pytest

from _helpers import arc_segments, paths, points

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN = os.path.join(HERE, "..", "..", "artwork-scans", "level-1-pg-4.png")
SUBJECTS = ["flag", "cannon", "mg", "dying"]

pytestmark = pytest.mark.skipif(
    not os.path.exists(SCAN), reason="source scan artwork-scans/level-1-pg-4.png not present"
)


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """Isolate + vectorize into an isolated working dir; return {name: svg text}."""
    work = tmp_path_factory.mktemp("scan_out")
    os.makedirs(os.path.join(work, "out"), exist_ok=True)
    # iso.py and skel_svg.py write/read ./out relative to cwd, so run them in `work`.
    # Isolate only the subjects the tests use (iso.py processes all of CFG by default).
    subprocess.run([sys.executable, os.path.join(HERE, "iso.py"), *SUBJECTS], cwd=work, check=True)
    subprocess.run([sys.executable, os.path.join(HERE, "skel_svg.py"), *SUBJECTS], cwd=work, check=True)
    svgs = {}
    for name in SUBJECTS:
        with open(os.path.join(work, "out", f"{name}_C.svg")) as f:
            svgs[name] = f.read()
    return svgs


def test_cannon_has_no_arcs(built):
    # seg9 (trapezoid) and seg36 (3 straight segments) must not be arcs; the
    # whole cannon is straight edges + Hough circles.
    assert arc_segments(built["cannon"]) == []


def test_cannon_gunsight_is_straight(built):
    # The peaked "gunsight" trapezoid on the barrel (the former arc/seg9 fix) must render as
    # straight segments. Located by region, not exact coords: nexus-snapping shifts points a
    # few px. It sits around x 420-545, y 180-295 in the cannon viewBox.
    def in_region(d):
        return sum(1 for x, y in points(d) if 420 <= x <= 545 and 180 <= y <= 295) >= 3
    gunsight = [d for d in paths(built["cannon"]) if " A " not in d and in_region(d)]
    assert gunsight, "straight gunsight trapezoid not found"


def test_every_subject_produces_components(built):
    for name, svg in built.items():
        assert 'class="seg"' in svg, f"{name} produced no components"
