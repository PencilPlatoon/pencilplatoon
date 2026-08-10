"""Stage 1 -- width-class segmentation (plan §6.1).

Skeletonizing a filled region is wrong: the medial axis of a disc is a point.
So before extracting centerlines we split the ink into width classes and route
each to the right representation:

    stroke    r ~ w, low variance            -> centerline + stroke-width
    blob      r >> w, low aspect ratio        -> boundary polygon + fill
    variable  r ramps monotonically           -> filled outline (a taper)

A region is solid where the ink is 2D-thick -- a pen-diameter disc fits inside it, so
its medial radius exceeds the pen. A stroke, ~one pen wide, never reaches that; a fill's
interior does, however thin the fill. (The distance transform is the "density" test:
thick over an area vs thin along a line. Genuine crosshatch -- thin strokes with white
gaps -- is left as line-work, being indistinguishable from a stroke crossing.) The raw
outer boundary is traced as-is; boundary idealization (smoothing, straightening,
arc-fitting) is a later, uniform step (M7), and interior holes (§6.2) are left in place.

A long thick *line* (a deliberately heavy outline stroke, e.g. a flag pole) is
rescued back to `stroke`: high length-to-width aspect with near-constant width
is a stroke however fat it is, and belongs as a centerline, not a fill.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import skeletonize

from ink import Ink, MIN_HOLE_W2
from model import BLOB

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
MIN_WIDTH_R = 0.65      # a fill is >= a pen wide everywhere: floor the medial radius here (a
                        # touch over w/2 so it still clears a pen after boundary decimation)
POLY_TOL_W = 0.1        # boundary decimation, in units of w. A stroke keeps every traced
                        # pixel, so it follows the drawn wobble; the blob boundary is the
                        # same kind of traced polyline and should track its own rough edge
                        # the same way. Kept just coarse enough to drop the marching-squares
                        # staircase, NOT to abstract the shape into a polygon (that faceting
                        # is not idealization -- real smoothing/arc-fitting is M7, uniform for
                        # strokes and blobs alike).  (MIN_HOLE_W2: ink.py)

# Where the rough ink edge bulges out past grow-to-edge's reach, a thin sliver of ink is
# left just outside the blob. Isolated and touching the blob, it survives skeletonizing as
# a crumb and renders as a pen-width dot on the rim. Fold any such small speck back into the
# blob it abuts (completing the fill to the true edge). A real stroke is a LARGE component,
# so it is never reclaimed and stays connected -- the targeted opposite of a blanket absorb.
RIM_CRUMB_W2 = 1.0      # an isolated sub-(pen-square) speck touching a blob is a rim sliver


@dataclass
class Blob:
    mask: np.ndarray            # bool region
    boundary: np.ndarray        # (M,2) closed outer outline as (x,y)
    width_class: str            # 'blob' or 'variable'
    centroid: tuple[float, float]
    holes: list = field(default_factory=list)   # interior hole outlines (§6.2), each (M,2) (x,y)


def _wide_mask(ink: Ink) -> np.ndarray:
    """Solid regions are 2D-thick ink -- where a pen-diameter disc fits (d > WIDE_EXIT*w)
    the ink is a fill, not a stroke. Hysteresis seeds on a slightly deeper core so a
    stroke *crossing* (a thin, shallow overlap) cannot seed a spurious fill, keeps the
    band component each seed touches, then grows that core back out to the true ink edge
    so the blob matches the drawing and strokes meet it cleanly (no inner shell, hence no
    rim stubs).

    The distance transform IS the 2D-"density" test: thick over an *area* vs thin along a
    *line*. A local ink-fraction window cannot tell a thin fill from a stroke crossing
    (both read ~0.7), but the medial radius can. Interior holes are left in place (§6.2)."""
    d, m, w = ink.dist, ink.mask, ink.w
    seed = m & (d > WIDE_ENTER * w)
    if not seed.any():
        return np.zeros_like(m)
    band = m & (d > WIDE_EXIT * w)
    lab, _ = ndimage.label(band, structure=np.ones((3, 3)))
    keep = np.unique(lab[seed])
    core = np.isin(lab, keep[keep > 0])
    return m & (ndimage.distance_transform_edt(~core) <= WIDE_EXIT * w + 1.0)


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


def _poly_area(c: np.ndarray) -> float:
    x, y = c[:, 1], c[:, 0]
    return 0.5 * abs(float(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def _xy(poly: np.ndarray) -> np.ndarray:
    return np.column_stack([poly[:, 1], poly[:, 0]])   # (row,col) -> (x,y)


def _boundaries(comp: np.ndarray, w: float):
    """Trace the outer boundary AND any interior holes (§6.2), each decimated.
    Holes below a pen-width floor are dropped (smaller than the pen can carve)."""
    cs = find_contours(comp.astype(float), 0.5)
    if not cs:
        return None, []
    cs = sorted(cs, key=_poly_area, reverse=True)      # largest area = outer boundary
    outer = approximate_polygon(cs[0], tolerance=POLY_TOL_W * w)
    if len(outer) < 3:
        return None, []
    hole_floor = MIN_HOLE_W2 * w * w
    holes = []
    for c in cs[1:]:
        if _poly_area(c) < hole_floor:
            continue
        h = approximate_polygon(c, tolerance=POLY_TOL_W * w)
        if len(h) >= 3:
            holes.append(_xy(h))
    return _xy(outer), holes


def _reclaim_rim_crumbs(wide: np.ndarray, ink: Ink) -> np.ndarray:
    """Fold rim slivers back into the blob they touch (see RIM_CRUMB_W2).

    `outside` is the ink not in a blob. Its LARGE components are real strokes (the line-work
    running up to the blob) and are left alone; its small components that abut the blob are
    the slivers grow-to-edge just failed to reach, so they are reclaimed. Keying on
    *isolated & small*, not on dilation, is what keeps the strokes connected."""
    outside = ink.mask & ~wide
    lab, n = ndimage.label(outside, structure=np.ones((3, 3)))
    if not n:
        return wide
    touching = np.unique(lab[ndimage.binary_dilation(wide) & outside])
    touching = touching[touching > 0]
    if not touching.size:
        return wide
    areas = ndimage.sum(np.ones_like(lab), lab, index=touching)
    crumbs = touching[areas < RIM_CRUMB_W2 * ink.w * ink.w]
    return wide | np.isin(lab, crumbs) if crumbs.size else wide


def bbox_slice(mask: np.ndarray, pad: int = 1):
    """(y-slice, x-slice) of mask's true-pixel bounding box grown by `pad`, clamped to shape; None if
    mask is empty. Lets a per-region EDT run on a small window instead of the full supersampled image."""
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return None
    H, W = mask.shape
    return (slice(max(0, ys.min() - pad), min(H, ys.max() + 1 + pad)),
            slice(max(0, xs.min() - pad), min(W, xs.max() + 1 + pad)))


def _enforce_min_width(comp: np.ndarray, w: float) -> np.ndarray:
    """A pen mark is at least a pen wide EVERYWHERE -- a sub-pen taper or spike is unphysical
    (the pen can't draw thinner). Reconstruct the region from its skeleton with the medial
    radius floored at w/2, so a thin tip blunts to a pen-wide rounded cap -- fixing the pinch-
    offs that disconnect a tapering blob -- while the thick body is kept exactly (union)."""
    ys, xs = np.where(comp)
    if len(ys) == 0:
        return comp
    # the skeleton reconstruction reaches at most one medial radius outside comp (<= half the
    # region's smaller extent), so run the skeletonize + both EDTs on bbox+that window rather than
    # the whole supersampled image -- identical result, far cheaper for a small blob in a big scan.
    H, W = comp.shape
    y0b, y1b, x0b, x1b = ys.min(), ys.max(), xs.min(), xs.max()
    pad = int(np.ceil(min(y1b - y0b, x1b - x0b) / 2.0)) + 2
    y0, y1 = max(0, y0b - pad), min(H, y1b + 1 + pad)
    x0, x1 = max(0, x0b - pad), min(W, x1b + 1 + pad)
    cw = comp[y0:y1, x0:x1]
    sk = skeletonize(cw)
    if not sk.any():
        return comp
    dist = ndimage.distance_transform_edt(cw)
    d2s, idx = ndimage.distance_transform_edt(~sk, return_distances=True, return_indices=True)
    radius = dist[idx[0], idx[1]]                     # medial radius of the nearest skeleton point
    out = comp.copy()
    out[y0:y1, x0:x1] = cw | (d2s <= np.maximum(radius, MIN_WIDTH_R * w))
    return out


def _has_2d_core(comp: np.ndarray, w: float) -> bool:
    """A blob owns a genuine 2D interior -- a deep core wider than the pen (§6.1).
    A thickened spot on a line or a small dark mark has almost none, so it fails."""
    sl = bbox_slice(comp)                                 # crop: the EDT is identical on bbox+1 but far
    if sl is None:                                        # cheaper than running it over the whole scan
        return False
    core = ndimage.distance_transform_edt(comp[sl]) > CORE_R * w
    return int(core.sum()) >= MIN_CORE_W2 * w * w


def segment(ink: Ink) -> tuple[list[Blob], np.ndarray]:
    """Return (blobs, thin_mask). `thin_mask` is the stroke ink with blob
    interiors removed, ready to skeletonize; `blobs` are the filled regions.

    (Taper/`variable` detection -- splitting an elongated fill into a monotone
    ramp vs a compact blob -- is a later refinement; every fill is a `blob` here.)
    """
    wide = _wide_mask(ink)                            # solid ink, grown to the true edge
    wide = _reclaim_rim_crumbs(wide, ink)             # fold isolated rim slivers back in
    lab, n = ndimage.label(wide, structure=np.ones((3, 3)))
    min_area = MIN_BLOB_AREA_W2 * ink.w * ink.w

    blobs: list[Blob] = []
    blob_union = np.zeros_like(ink.mask)
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < min_area:
            continue
        if not _has_2d_core(comp, ink.w):
            continue                                  # ring / dot: no 2D core -> stays strokes
        if _is_line(comp, ink.dist, ink.w):
            continue                                  # heavy outline stroke -> centerline
        comp = _enforce_min_width(comp, ink.w)        # a fill is >= a pen wide everywhere (§6.1)
        outer, holes = _boundaries(comp, ink.w)
        if outer is None:
            continue
        ys, xs = np.where(comp)
        blobs.append(Blob(mask=comp, boundary=outer, holes=holes, width_class=BLOB,
                          centroid=(float(xs.mean()), float(ys.mean()))))
        blob_union |= comp

    # The blob reaches the true ink edge (grow-to-edge in `_wide_mask`), so ink not in a
    # blob is stroke ink and each stroke runs right up to the blob it meets -- no absorb,
    # so nothing is trimmed back and strokes stay connected.
    thin = ink.mask & ~blob_union
    return blobs, thin
