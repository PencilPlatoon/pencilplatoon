"""Stage 1 -- width-class segmentation (plan §6.1).

Skeletonizing a filled region is wrong: the medial axis of a disc is a point.
So before extracting centerlines we split the ink into width classes and route
each to the right representation:

    stroke    r ~ w, low variance            -> centerline + stroke-width
    blob      r >> w, low aspect ratio        -> boundary polygon + fill
    variable  r ramps monotonically           -> filled outline (a taper)

A region is solid where ink is locally dense (from thick strokes or crosshatch);
its raw outer boundary is traced as-is. Boundary idealization (smoothing,
straightening, arc-fitting) is a later, uniform step (M7) applied to line-work
and blob outlines alike, and interior holes (§6.2) are left in place for later
tracing -- neither is done here, where the job is only classification.

A long thick *line* (a deliberately heavy outline stroke, e.g. a flag pole) is
rescued back to `stroke`: high length-to-width aspect with near-constant width
is a stroke however fat it is, and belongs as a centerline, not a fill.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import skeletonize

from ink import Ink
from model import BLOB

# A region is solid where ink is locally DENSE -- from thick strokes OR from
# crosshatch/scribble whose individual strokes are thin. Thickness alone misses
# the scribbled kind and leaves the blob with concave gaps and internal strokes.
WIDE_ENTER = 1.15       # SEED a blob only at a genuine thick core, r > 1.15w
                        # (a junction of thin lines has no such core, so it can't seed)
WIDE_EXIT = 0.75        # GROW through still-thick ink, r > 0.75w ...
DENS_WIN = 2.5          # ... or through locally dense ink: fraction of ink in a
DENS_GROW = 0.5         # window this wide (in w) above this -> part of the solid

# Thick-line rescue (plan §6.1.2): a heavy *outline stroke* is very elongated and
# never much wider than a stroke -- keep it a centerline, not a fill. A filled
# shape (gun, SMG) is only moderately elongated and has a genuinely thick core, so
# it fails one of these and stays a blob. (Fluctuating width is fine for a stroke;
# it's elongation + thinness, not uniformity, that says "line" -- §6.1.4.)
LINE_ASPECT = 60.0      # length/width above which a component may be a line
LINE_MAX_W = 3.0        # ...but only if it never exceeds this width (in w) anywhere

MIN_BLOB_AREA_W2 = 3.0  # ignore wide specks smaller than this many w^2
POLY_TOL_W = 0.5        # boundary decimation tolerance, in units of w


@dataclass
class Blob:
    mask: np.ndarray            # bool region
    boundary: np.ndarray        # (M,2) closed outline as (x,y)
    width_class: str            # 'blob' or 'variable'
    centroid: tuple[float, float]


def _wide_mask(ink: Ink) -> np.ndarray:
    """Solid regions: seed on a genuine thick core, then grow through ink that is
    either still thick OR locally dense (so crosshatch is pulled in). Interior
    holes are left in place -- §6.2 keeps them, and filling them here would
    swallow real hollows; tracing them is later work."""
    d, m, w = ink.dist, ink.mask, ink.w
    seed = m & (d > WIDE_ENTER * w)
    if not seed.any():
        return np.zeros_like(m)
    dens = ndimage.uniform_filter(m.astype(float), size=max(3, int(round(DENS_WIN * w))))
    grow = m & ((d > WIDE_EXIT * w) | (dens > DENS_GROW))
    lab, _ = ndimage.label(grow, structure=np.ones((3, 3)))
    keep = np.unique(lab[seed])
    return np.isin(lab, keep[keep > 0])


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


def _boundary(comp: np.ndarray, w: float) -> np.ndarray | None:
    cs = find_contours(comp.astype(float), 0.5)
    if not cs:
        return None
    c = max(cs, key=len)                              # outer boundary, longest
    poly = approximate_polygon(c, tolerance=POLY_TOL_W * w)   # (row,col)
    if len(poly) < 3:
        return None
    return np.column_stack([poly[:, 1], poly[:, 0]])  # -> (x,y)


def segment(ink: Ink) -> tuple[list[Blob], np.ndarray]:
    """Return (blobs, thin_mask). `thin_mask` is the stroke ink with blob
    interiors removed, ready to skeletonize; `blobs` are the filled regions.

    (Taper/`variable` detection -- splitting an elongated fill into a monotone
    ramp vs a compact blob -- is a later refinement; every fill is a `blob` here.)
    """
    wide = _wide_mask(ink)
    lab, n = ndimage.label(wide, structure=np.ones((3, 3)))
    min_area = MIN_BLOB_AREA_W2 * ink.w * ink.w

    blobs: list[Blob] = []
    blob_union = np.zeros_like(ink.mask)
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < min_area:
            continue
        if _is_line(comp, ink.dist, ink.w):
            continue                                  # rescued: stays a stroke
        b = _boundary(comp, ink.w)
        if b is None:
            continue
        ys, xs = np.where(comp)
        blobs.append(Blob(mask=comp, boundary=b, width_class=BLOB,
                          centroid=(float(xs.mean()), float(ys.mean()))))
        blob_union |= comp

    thin = ink.mask & ~blob_union
    return blobs, thin
