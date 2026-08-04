"""Stage 0 -- ingest and ink determination (plan §5).

The one destructive stage: it decides which pixels are ink and computes the
scale everything else is measured in. A component may be dropped here only on
imaging grounds (paper grain, speckle), never semantic ones.

Outputs: the binary ink mask, its Euclidean distance transform, and `w`, the
modal pen width. `w` is the single most important derived constant downstream.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage.filters import threshold_sauvola
from skimage.morphology import skeletonize

# Paper grain lives at a couple of pixels; a deliberate dot is bigger. Gate on
# an absolute floor this small (NOT a Potrace-style turdsize, which would kill
# a 6px dot) and let ink-density do the rest. GRAIN_AREA is in *native* pixels;
# at a supersampled scale it is applied as GRAIN_AREA * scale^2 (§5).
GRAIN_AREA = 4          # native px; drop connected components at or below this
SAUVOLA_WINDOW = 25     # px; local-threshold neighborhood for uneven pencil
DARK_ABS = 0.4          # any pixel this dark is ink regardless of local contrast: Sauvola
                        # otherwise carves false holes out of a large uniform-dark fill

# Dynamic resolution (§5): a scan is drawn at whatever DPI it was drawn at, so the
# native pen width `w` varies. We supersample (LANCZOS) so the pipeline always runs
# at a consistent *effective* pen width -- thin walls and small holes that pinch shut
# at the native pixel scale then resolve into their true shape (the hybrid does the
# same with a fixed F=3; picking the factor from `w` generalizes it across scans).
TARGET_W = 13.0         # effective working pen width to supersample toward
SCALE_MAX = 4           # never blow the image up by more than this


@dataclass
class Ink:
    mask: np.ndarray        # bool (H,W) ink, at the working (supersampled) scale
    dist: np.ndarray        # float (H,W) EDT of the mask
    w: float                # modal pen width (at the working scale)
    scale: int = 1          # supersample factor applied to the native scan (§5)


def _modal_pen_width(mask: np.ndarray, dist: np.ndarray) -> float:
    """`w` = mode of the distance transform along the medial axis, doubled
    (§5). The medial axis samples the local half-width; its mode is the width
    the child drew most, robust to a few fat blobs or thin tails."""
    skel = skeletonize(mask)
    radii = dist[skel]
    radii = radii[radii > 0]
    if radii.size == 0:
        return 1.0
    # mode via a half-pixel histogram of the half-widths, then double
    hi = max(2.0, float(radii.max()))
    bins = np.arange(0.0, hi + 0.5, 0.5)
    counts, edges = np.histogram(radii, bins=bins)
    peak = 0.5 * (edges[counts.argmax()] + edges[counts.argmax() + 1])
    return float(2.0 * peak)


def _binarize(gray: np.ndarray, thresh_bias: float) -> np.ndarray:
    """Gray (0..1) -> bool ink mask. Local (Sauvola) threshold handles the uneven
    illumination of pencil on paper where global Otsu underperforms."""
    thr = threshold_sauvola(gray, window_size=SAUVOLA_WINDOW)
    # Sauvola alone flags texture inside large blank areas, so require the pixel be
    # genuinely darker than mid-gray too (paper stays paper). But Sauvola also *misses*
    # the interior of a large uniform-dark fill (no local contrast there) -- so accept
    # any absolutely-dark pixel as ink as well, or that interior becomes a false hole.
    return ((gray < thr + thresh_bias) | (gray < DARK_ABS + thresh_bias)) & (gray < 0.65 + thresh_bias)


def _pick_scale(w_native: float) -> int:
    """Supersample factor that brings the native pen width up to ~TARGET_W."""
    return int(min(SCALE_MAX, max(1, round(TARGET_W / max(w_native, 1e-3)))))


def ingest(rgb: np.ndarray, thresh_bias: float = 0.0, scale: int | None = None) -> Ink:
    """RGB uint8 image -> Ink, supersampled so the pipeline runs at a consistent
    effective pen width (§5). Pass `scale` to force a factor; otherwise it is
    chosen from the native pen width (`scale=1` reproduces the native behaviour).

    `thresh_bias` nudges the ink threshold (used by the M3 ID-stability test to
    perturb binarization a few percent and check identities still hold)."""
    gray = rgb.mean(2) / 255.0 if rgb.ndim == 3 else rgb / 255.0

    if scale is None:                       # measure native w, then pick the factor
        native = _binarize(gray, thresh_bias)
        scale = _pick_scale(_modal_pen_width(native, ndimage.distance_transform_edt(native)))
    if scale > 1:                           # LANCZOS keeps antialiased walls/holes crisp
        h, w_ = gray.shape
        gray = np.asarray(Image.fromarray((gray * 255).astype(np.uint8))
                          .resize((w_ * scale, h * scale), Image.LANCZOS), float) / 255.0

    mask = _binarize(gray, thresh_bias)

    # Speckle rejection on imaging grounds only: drop paper-grain-sized specks
    # (grain is a fixed native size, so the floor grows with the supersample).
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n:
        areas = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        keep = np.isin(lab, 1 + np.where(areas > GRAIN_AREA * scale * scale)[0])
        mask = mask & keep

    dist = ndimage.distance_transform_edt(mask)
    w = _modal_pen_width(mask, dist)
    return Ink(mask=mask, dist=dist, w=w, scale=scale)
