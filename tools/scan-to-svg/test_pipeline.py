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

HERE = os.path.dirname(os.path.abspath(__file__))
SCAN = os.path.join(HERE, "..", "..", "artwork-scans", "level-1-pg-4.png")

pytestmark = pytest.mark.skipif(
    not os.path.exists(SCAN), reason="source scan artwork-scans/level-1-pg-4.png not present"
)


def _arc_segments(svg):
    """data-num values of components whose path contains an arc command."""
    out = []
    for num, vis in re.findall(r'data-num="(\d+)"><g class="vis">(.*?)</g>', svg, re.S):
        d = re.search(r'd="([^"]+)"', vis)
        if d and " A " in d.group(1):
            out.append(num)
    return out


@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """Isolate + vectorize into an isolated working dir; return {name: svg text}."""
    work = tmp_path_factory.mktemp("scan_out")
    env = {**os.environ}
    # iso.py and skel_svg.py write/read ./out relative to cwd, so run them in `work`.
    os.makedirs(os.path.join(work, "out"), exist_ok=True)
    subprocess.run([sys.executable, os.path.join(HERE, "iso.py")], cwd=work, check=True)
    subprocess.run(
        [sys.executable, os.path.join(HERE, "skel_svg.py"), "flag", "cannon", "mg", "dying"],
        cwd=work, check=True,
    )
    svgs = {}
    for name in ("flag", "cannon", "mg", "dying"):
        with open(os.path.join(work, "out", f"{name}_C.svg")) as f:
            svgs[name] = f.read()
    return svgs


def test_cannon_has_no_arcs(built):
    # seg9 (trapezoid) and seg36 (3 straight segments) must not be arcs; the
    # whole cannon is straight edges + Hough circles.
    assert _arc_segments(built["cannon"]) == []


def test_cannon_seg9_is_present_and_straight(built):
    svg = built["cannon"]
    m = re.search(r'data-num="9"><g class="vis">(.*?)</g>', svg, re.S)
    assert m, "component 9 missing"
    d = re.search(r'd="([^"]+)"', m.group(1)).group(1)
    assert " A " not in d
    assert " L " in d  # made of straight segments


def test_flag_keeps_its_genuine_curve(built):
    # The little curl at the flagpole base is a real arc and must survive.
    assert len(_arc_segments(built["flag"])) >= 1


def test_every_subject_produces_components(built):
    for name, svg in built.items():
        assert 'class="seg"' in svg, f"{name} produced no components"
