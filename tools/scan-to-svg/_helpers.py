"""Shared helpers for the scan-to-svg tests."""
import math
import re

import numpy as np


def edge(a, b, n):
    """A straight polyline of n points from a to b."""
    return np.column_stack([np.linspace(a[0], b[0], n), np.linspace(a[1], b[1], n)])


def arc_points(cx, cy, r, a0_deg, a1_deg, n):
    """n points sampled exactly on a circle, from a0 to a1 degrees."""
    a = np.linspace(math.radians(a0_deg), math.radians(a1_deg), n)
    return np.column_stack([cx + r * np.cos(a), cy + r * np.sin(a)])


def polygon_arc(cx, cy, r, a0_deg, a1_deg, n_vertices, per_edge=14):
    """A polyline whose vertices sit on a circle but whose edges are straight
    chords -- a run that only *loosely* fits a circle. Fewer vertices -> looser."""
    V = arc_points(cx, cy, r, a0_deg, a1_deg, n_vertices)
    pts = [V[0]]
    for i in range(1, len(V)):
        pts.extend(edge(V[i - 1], V[i], per_edge)[1:])
    return np.array(pts)


def arc_segments(svg):
    """data-num values of components whose emitted path contains an arc command."""
    out = []
    for num, vis in re.findall(r'data-num="(\d+)"><g class="vis">(.*?)</g>', svg, re.S):
        d = re.search(r'd="([^"]+)"', vis)
        if d and " A " in d.group(1):
            out.append(num)
    return out
