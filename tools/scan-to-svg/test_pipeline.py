"""End-to-end regression test over the real scan.

Runs the isolate -> vectorize steps on the checked-in scan and asserts the
behavior the fixes were made for: the cannon has no smoothing arcs (seg9 became
a trapezoid, seg36 became straight segments) while the flag keeps its one genuine
curved stroke. Skipped automatically if the scan image isn't present.
"""
import os
import re
import subprocess
import sys

import pytest

from _helpers import arc_segments

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


def test_cannon_seg9_is_present_and_straight(built):
    svg = built["cannon"]
    m = re.search(r'data-num="9"><g class="vis">(.*?)</g>', svg, re.S)
    assert m, "component 9 missing"
    d = re.search(r'd="([^"]+)"', m.group(1)).group(1)
    assert " A " not in d
    assert " L " in d  # made of straight segments


def test_flag_keeps_its_genuine_curve(built):
    # The little curl at the flagpole base is a real arc and must survive.
    assert len(arc_segments(built["flag"])) >= 1


def test_every_subject_produces_components(built):
    for name, svg in built.items():
        assert 'class="seg"' in svg, f"{name} produced no components"
