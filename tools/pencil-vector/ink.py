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
from scipy import ndimage
from skimage.filters import threshold_sauvola
from skimage.morphology import skeletonize

# Paper grain lives at a couple of pixels; a deliberate dot is bigger. Gate on
# an absolute floor this small (NOT a Potrace-style turdsize, which would kill
# a 6px dot) and let ink-density do the rest.
GRAIN_AREA = 4          # px; drop connected components at or below this
SAUVOLA_WINDOW = 25     # px; local-threshold neighborhood for uneven pencil


@dataclass
class Ink:
    mask: np.ndarray        # bool (H,W) ink
    dist: np.ndarray        # float (H,W) EDT of the mask
    w: float                # modal pen width


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


def ingest(rgb: np.ndarray) -> Ink:
    """RGB uint8 image -> Ink. Local (Sauvola) threshold handles the uneven
    illumination of pencil on paper where global Otsu underperforms."""
    gray = rgb.mean(2) / 255.0 if rgb.ndim == 3 else rgb / 255.0

    thr = threshold_sauvola(gray, window_size=SAUVOLA_WINDOW)
    # Sauvola alone flags texture inside large blank areas; require the pixel
    # be genuinely darker than mid-gray too, so paper stays paper.
    mask = (gray < thr) & (gray < 0.65)

    # Speckle rejection on imaging grounds only: drop paper-grain-sized specks.
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n:
        areas = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        keep = np.isin(lab, 1 + np.where(areas > GRAIN_AREA)[0])
        mask = mask & keep

    dist = ndimage.distance_transform_edt(mask)
    w = _modal_pen_width(mask, dist)
    return Ink(mask=mask, dist=dist, w=w)
