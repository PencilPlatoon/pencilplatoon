"""Width-class primitives (plan §6.1).

Skeletonizing a filled region is wrong: the medial axis of a disc is a point. So a fill has to be
told from line-work and routed to the right representation:

    stroke    r ~ w, low variance            -> centerline + stroke-width
    blob      r >> w, low aspect ratio        -> boundary polygon + fill
    variable  r ramps monotonically           -> filled outline (a taper)

This module holds the detectors that decide, and the boundary tracer that renders a fill; the
growth-based blob resolution (`growth.py`) calls them. A region is solid where the ink is 2D-thick --
a pen-diameter disc fits inside it, so its medial radius exceeds the pen (`_has_2d_core`). A stroke,
~one pen wide, never reaches that; a fill's interior does, however thin the fill. A long thick *line*
(a deliberately heavy outline stroke, e.g. a flag pole) is rescued back to `stroke` (`_is_line`): high
length-to-width aspect with near-constant width is a stroke however fat it is. `_boundaries` traces a
kept fill's raw outer outline + interior holes (§6.2); idealization is a later, uniform step.
"""
from __future__ import annotations

import numpy as np
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import skeletonize

from ink import MIN_HOLE_W2

# A region is solid where the ink is 2D-thick: a pen-diameter disc fits inside it (its
# medial radius exceeds WIDE_EXIT*w). A stroke, ~one pen wide, never reaches that; a
# fill's interior does, however thin the fill. (Genuine crosshatch -- thin strokes with
# white gaps -- is deliberately NOT captured: no local measure separates it from a stroke
# crossing, so it is left as line-work.)
WIDE_EXIT = 0.75        # ink is a 2D FILL where a pen-diameter disc fits: r > 0.75w
WIDE_ENTER = 0.90       # SEED slightly deeper so a stroke *crossing* (a thin, shallow
                        # overlap) can't seed a fill; the band is grown back out to the edge

# Thick-line rescue (plan §6.1.2): a heavy *outline stroke* is very elongated and
# never much wider than a stroke -- keep it a centerline, not a fill. A filled
# shape (gun, SMG) is only moderately elongated and has a genuinely thick core, so
# it fails one of these and stays a blob. (Fluctuating width is fine for a stroke;
# it's elongation + thinness, not uniformity, that says "line" -- §6.1.4.)
LINE_ASPECT = 60.0      # length/width above which a component may be a line
LINE_MAX_W = 3.0        # ...but only if it never exceeds this width (in w) anywhere

# A blob must own a genuine 2D INTERIOR, not merely enough total ink (plan §6.1). This
# rejects the two things that masquerade as fills: a thin RING (walls one pen wide -- a
# stroke loop with no interior) and a small dark MARK (a doubled-stroke spot or a hub
# dot). Both have almost no deep core, so a blob is required to own one.
CORE_R = 1.0            # a "2D core" pixel lies more than this many w from any edge
MIN_CORE_W2 = 3.0       # a blob must own at least this many w^2 of such core

MIN_BLOB_AREA_W2 = 3.0  # ignore wide specks smaller than this many w^2
POLY_TOL_W = 0.1        # boundary decimation, in units of w. A stroke keeps every traced
                        # pixel, so it follows the drawn wobble; the blob boundary is the
                        # same kind of traced polyline and should track its own rough edge
                        # the same way. Kept just coarse enough to drop the marching-squares
                        # staircase, NOT to abstract the shape into a polygon (that faceting
                        # is not idealization -- real smoothing/arc-fitting is fit-ideal-geometry, uniform for
                        # strokes and blobs alike).  (MIN_HOLE_W2: ink.py)


def _is_line(comp: np.ndarray, dist: np.ndarray, w: float) -> bool:
    """A heavy outline stroke: very elongated and never much wider than a stroke."""
    d = dist[comp]
    if d.size == 0:
        return False
    width = 2.0 * np.median(d)
    if width <= 0:
        return False
    aspect = float(skeletonize(comp).sum()) / width
    return aspect > LINE_ASPECT and 2.0 * d.max() < LINE_MAX_W * w


def poly_area(poly: np.ndarray) -> float:
    """Shoelace area. abs() makes it invariant to (x,y) vs (row,col) point order."""
    x, y = poly[:, 0], poly[:, 1]
    return 0.5 * abs(float(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def _xy(poly: np.ndarray) -> np.ndarray:
    return np.column_stack([poly[:, 1], poly[:, 0]])   # (row,col) -> (x,y)


def point_in_poly(x: float, y: float, poly: np.ndarray) -> bool:
    """Ray cast: is (x,y) inside the (x,y)-ordered polygon `poly`? (The `(yi>y)!=(yj>y)`
    entry test guarantees yi!=yj before the divide, so the 1e-12 is a defensive no-op.)"""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _boundaries(comp: np.ndarray, w: float):
    """Trace the outer boundary AND any interior holes (§6.2), each decimated.
    Holes below a pen-width floor are dropped (smaller than the pen can carve)."""
    cs = find_contours(comp.astype(float), 0.5)
    if not cs:
        return None, []
    cs = sorted(cs, key=poly_area, reverse=True)      # largest area = outer boundary
    outer = approximate_polygon(cs[0], tolerance=POLY_TOL_W * w)
    if len(outer) < 3:
        return None, []
    outer_xy = _xy(outer)
    hole_floor = MIN_HOLE_W2 * w * w
    holes = []
    for c in cs[1:]:
        if poly_area(c) < hole_floor:
            continue
        h = approximate_polygon(c, tolerance=POLY_TOL_W * w)
        if len(h) < 3:
            continue
        hxy = _xy(h)
        # A hole must nest INSIDE the (independently decimated) outer, else even-odd fills the overflow.
        # A separate mask piece, or a hole inside a thin tendril the outer got simplified away, does not
        # nest -- keep a hole only if most of its vertices land inside the simplified outer (§6.2).
        if np.mean([point_in_poly(float(x), float(y), outer_xy) for x, y in hxy]) >= 0.5:
            holes.append(hxy)
    return outer_xy, holes


def bbox_slice(mask: np.ndarray, pad: int = 1):
    """(y-slice, x-slice) of mask's true-pixel bounding box grown by `pad`, clamped to shape; None if
    mask is empty. Lets a per-region EDT run on a small window instead of the full supersampled image.
    Reduce to a per-axis any() first (O(H+W) scan) rather than np.where'ing every true pixel -- this runs
    once per blob, so on the full supersampled frame the difference is large."""
    rows = np.any(mask, axis=1)
    if not rows.any():
        return None
    cols = np.any(mask, axis=0)
    ys = np.where(rows)[0]
    xs = np.where(cols)[0]
    H, W = mask.shape
    return (slice(max(0, int(ys[0]) - pad), min(H, int(ys[-1]) + 1 + pad)),
            slice(max(0, int(xs[0]) - pad), min(W, int(xs[-1]) + 1 + pad)))


def windowed_dilation(mask: np.ndarray, iters: int) -> np.ndarray:
    """Full-frame bool of `mask` dilated by `iters`, computed in the mask's bbox window
    (identical result -- the dilation reaches at most `iters` px past the bbox)."""
    out = np.zeros_like(mask)
    sl = bbox_slice(mask, pad=iters + 1)
    if sl is not None:
        out[sl] = ndimage.binary_dilation(mask[sl], iterations=iters)
    return out


def _has_2d_core(comp: np.ndarray, w: float) -> bool:
    """A blob owns a genuine 2D interior -- a deep core wider than the pen (§6.1).
    A thickened spot on a line or a small dark mark has almost none, so it fails."""
    sl = bbox_slice(comp)                                 # crop: the EDT is identical on bbox+1 but far
    if sl is None:                                        # cheaper than running it over the whole scan
        return False
    core = ndimage.distance_transform_edt(comp[sl]) > CORE_R * w
    return int(core.sum()) >= MIN_CORE_W2 * w * w
