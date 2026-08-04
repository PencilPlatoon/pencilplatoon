"""Stage 0 -- ingest and ink determination (plan §5).

The one destructive stage: it decides which pixels are ink and computes the
scale everything else is measured in. A component may be dropped here only on
imaging grounds (paper grain, speckle), never semantic ones.

Outputs: the binary ink mask, its Euclidean distance transform, and `w`, the
modal pen width. `w` is the single most important derived constant downstream.
"""
from __future__ import annotations

import itertools
from dataclasses import dataclass, field

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.cluster.vq import kmeans2
from skimage.color import hsv2rgb, rgb2hsv, rgb2lab
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
MIN_HOLE_W2 = 0.79      # keep an interior hole only if at least ~a pen width across (0.79
                        # w^2 = area of a disc of diameter w); the pen can't carve a smaller
                        # one, so it is imaging noise. Filled at ingest (so a fill isn't left
                        # notched around it) and re-checked when holes are traced.

# Dynamic resolution (§5): a scan is drawn at whatever DPI it was drawn at, so the
# native pen width `w` varies. We supersample (LANCZOS) so the pipeline always runs
# at a consistent *effective* pen width -- thin walls and small holes that pinch shut
# at the native pixel scale then resolve into their true shape (the hybrid does the
# same with a fixed F=3; picking the factor from `w` generalizes it across scans).
TARGET_W = 13.0         # effective working pen width to supersample toward
SCALE_MAX = 4           # never blow the image up by more than this

# Colour determination (§5, revised M1): a scan is drawn with a few discrete pencil/pen
# colours, no gradients, and each pixel is exactly one colour (marks abut, never overlap).
# So we QUANTIZE the ink into a small canonical palette -- an achromatic "pencil-black" for
# everything under CHROMA_MIN, and chromatic hue-clusters merged when their hue agrees to
# within HUE_MERGE. Each colour is a separate entity downstream, rendered in an idealized
# (clean, saturated) version of its hue, so a red mark abutting a black line stays a distinct
# red region instead of binarizing into one thick black blob that swallows the line.
CHROMA_MIN = 16.0       # Lab chroma below this is pencil-black (achromatic), not a colour
HUE_MERGE = 0.06        # merge two chromatic clusters whose HSV hue agrees within this (~22deg)
COLOR_MIN_FRAC = 0.03   # drop a chromatic cluster smaller than this fraction of chromatic ink
IDEAL_S_MIN, IDEAL_S_MAX = 0.30, 0.72   # idealize by cleaning SATURATION into this band while
                                        # keeping the measured value -- a light touch, so a
                                        # muted reddish-brown stays reddish-brown, not a vivid red
BLACK = (35, 35, 35)    # canonical pencil-black


@dataclass
class Ink:
    mask: np.ndarray        # bool (H,W) ink, at the working (supersampled) scale
    dist: np.ndarray        # float (H,W) EDT of the mask
    w: float                # modal pen width (at the working scale)
    scale: int = 1          # supersample factor applied to the native scan (§5)
    labels: np.ndarray | None = None    # (H,W) colour id per ink pixel (-1 paper); None = all black
    palette: list = field(default_factory=lambda: [BLACK])   # colour id -> idealized (r,g,b)


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


def _hue_diff(a: float, b: float) -> float:
    d = abs(a - b) % 1.0
    return min(d, 1.0 - d)


def _quantize_colors(rgb: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, list]:
    """Partition the ink into a small canonical palette (see CHROMA_MIN/HUE_MERGE).

    `rgb` is 0..1 at the working scale. Returns a colour-id map (-1 = paper, 0 = pencil-black,
    1.. = chromatic) and the idealized palette. Chromatic pixels are k-means clustered in Lab
    (a,b), clusters whose HSV hue agrees are merged, tiny ones dropped; each surviving colour
    renders as its hue cleanly saturated. Achromatic ink (and pixels a colour didn't claim, e.g.
    filled sub-pen holes) fall to pencil-black."""
    labels = np.full(mask.shape, -1, int)
    labels[mask] = 0
    palette = [BLACK]
    ab = rgb2lab(rgb)[..., 1:]
    idx = np.argwhere(mask)
    px_ab = ab[mask]
    chro = np.hypot(px_ab[:, 0], px_ab[:, 1]) >= CHROMA_MIN
    if chro.sum() <= 0.01 * max(1, mask.sum()):
        return labels, palette                      # essentially monochrome
    cab, crgb, cxy = px_ab[chro], rgb[mask][chro], idx[chro]
    k = min(6, max(1, int(chro.sum() // 120)))
    _, lb = kmeans2(cab, k, minit="++", seed=0, missing="warn")

    def mean_hsv(c):
        return rgb2hsv(crgb[lb == c].mean(0)[None, None, :])[0, 0]

    merged = True                                    # merge clusters that share a hue
    while merged:
        merged = False
        for a, b in itertools.combinations(np.unique(lb), 2):
            if _hue_diff(float(mean_hsv(a)[0]), float(mean_hsv(b)[0])) < HUE_MERGE:
                lb[lb == b] = a
                merged = True
                break
    for c in np.unique(lb):
        if (lb == c).sum() < COLOR_MIN_FRAC * len(cab):
            continue
        sel = cxy[lb == c]
        labels[sel[:, 0], sel[:, 1]] = len(palette)
        h, s, v = mean_hsv(c)                         # keep the value, clean the saturation
        rgb_id = hsv2rgb(np.array([[[h, min(IDEAL_S_MAX, max(IDEAL_S_MIN, s)), v]]]))[0, 0]
        palette.append(tuple(int(val) for val in rgb_id * 255))
    return labels, palette


def ingest(rgb: np.ndarray, thresh_bias: float = 0.0, scale: int | None = None) -> Ink:
    """RGB uint8 image -> Ink, supersampled so the pipeline runs at a consistent
    effective pen width (§5). Pass `scale` to force a factor; otherwise it is
    chosen from the native pen width (`scale=1` reproduces the native behaviour).

    `thresh_bias` nudges the ink threshold (used by the M3 ID-stability test to
    perturb binarization a few percent and check identities still hold)."""
    color = rgb.ndim == 3
    gray = rgb.mean(2) / 255.0 if color else rgb / 255.0
    rgb01 = rgb.astype(float) / 255.0 if color else None

    if scale is None:                       # measure native w, then pick the factor
        native = _binarize(gray, thresh_bias)
        scale = _pick_scale(_modal_pen_width(native, ndimage.distance_transform_edt(native)))
    if scale > 1:                           # LANCZOS keeps antialiased walls/holes crisp
        h, w_ = gray.shape
        gray = np.asarray(Image.fromarray((gray * 255).astype(np.uint8))
                          .resize((w_ * scale, h * scale), Image.LANCZOS), float) / 255.0
        if color:
            rgb01 = np.asarray(Image.fromarray((rgb01 * 255).astype(np.uint8))
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

    # Fill enclosed hollows smaller than a pen width across: the pen can't carve them, so
    # they are imaging noise, not real holes. Doing it here (not only dropping them when
    # holes are traced) also reconnects the thin ink around such a hollow to the solid --
    # otherwise a fill is left with a notch where the sub-pen hole sat.
    holes = ndimage.binary_fill_holes(mask) & ~mask
    if holes.any():
        hl, hn = ndimage.label(holes, structure=np.ones((3, 3)))
        area = ndimage.sum(np.ones_like(hl), hl, index=np.arange(1, hn + 1))
        tiny = np.isin(hl, 1 + np.where(area < MIN_HOLE_W2 * w * w)[0])
        if tiny.any():
            mask = mask | tiny
            dist = ndimage.distance_transform_edt(mask)

    if color:                               # §5: quantize the ink into a canonical palette
        labels, palette = _quantize_colors(rgb01, mask)
    else:
        labels, palette = None, [BLACK]
    return Ink(mask=mask, dist=dist, w=w, scale=scale, labels=labels, palette=palette)
