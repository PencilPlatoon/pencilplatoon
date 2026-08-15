"""Small pixel/geometry primitives shared across the pipeline.

These are the idioms that recurred verbatim in graph.py, growth.py, and widthclass.py: iterating a
pixel's 8 neighbours, bounds-checking against an array shape, and swapping (row, col) contours into
(x, y) point order. Kept here so there is one definition of each and no local re-spelling.
"""
from __future__ import annotations

import numpy as np

# The 8 neighbour offsets (dy, dx), in the exact order the nested `for dy in (-1, 0, 1): for dx in
# (-1, 0, 1)` loops used to visit them, minus the centre. Callers that take the FIRST or LAST match
# (skeleton walks, corridor traces) depend on this order, so it is fixed here rather than sorted.
NEIGHBORS_8: list[tuple[int, int]] = [(dy, dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]


def in_bounds(y: int, x: int, shape: tuple[int, int]) -> bool:
    """Is pixel (y, x) inside an array of `shape` (rows, cols)?"""
    return 0 <= y < shape[0] and 0 <= x < shape[1]


def rowcol_to_xy(poly: np.ndarray) -> np.ndarray:
    """Swap a (row, col) contour (skimage order) into (x, y) point order."""
    return np.column_stack([poly[:, 1], poly[:, 0]])
