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
from skimage.filters import threshold_otsu, threshold_sauvola
from skimage.morphology import skeletonize

# Nothing here is a raw-pixel constant: every spatial threshold is a multiple of the pen
# width `w` (plan §5), so a scan vectorizes the same whatever DPI it was captured at. The
# one exception is TARGET_W itself -- the pixel scale we normalize *to*, so w is constant.
GRAIN_W2 = 0.5          # speckle floor: drop ink components smaller than this * w^2 (paper grain
                        # is ~a fraction of a pen width across, not a fixed pixel count)
SAUVOLA_W = 2.9         # Sauvola local-threshold window, in pen widths (a few w spans the local
                        # contrast the child's uneven pencil needs); realized as an odd px window
DARK_ABS = 0.4          # any pixel this dark is ink regardless of local contrast: Sauvola
                        # otherwise carves false holes out of a large uniform-dark fill
MIN_HOLE_W2 = 0.79      # keep an interior hole only if at least ~a pen width across (0.79
                        # w^2 = area of a disc of diameter w); the pen can't carve a smaller
                        # one, so it is imaging noise. Filled at ingest (so a fill isn't left
                        # notched around it) and re-checked when holes are traced.

# Dynamic resolution (§5): a scan is drawn at whatever DPI it was captured at, so the native pen
# width varies. We supersample (LANCZOS) toward a consistent effective pen width -- thin walls and
# small holes that pinch shut at the native pixel scale then resolve into their true shape. The
# factor is picked from the measured native width; every downstream tolerance is a multiple of the
# resulting `w`, so the constants themselves carry no pixel scale (they track the pen at any DPI).
TARGET_W = 13.0         # effective working pen width to supersample toward
SCALE_MAX = 3           # never blow the image up by more than this. 3x already carries the native pen
                        # past TARGET_W (upscaling + re-thresholding fattens strokes ~2x), so a 4th step
                        # only quadruples the per-op cost of a whole colour drawing for no visible gain
                        # (a thin scan measured 18.4px at 4x vs 14.5px at 3x -- same vectorization, 2x slower)

# Colour determination (§5, revised M1): a scan is drawn with a few discrete pencil/pen
# colours, no gradients, and each pixel is exactly one colour (marks abut, never overlap).
# So we QUANTIZE the ink into a small canonical palette -- an achromatic "pencil-black" for
# everything under CHROMA_ABS, and chromatic clusters merged into perceptual colours (§MERGE_AB).
# Each colour is a separate entity downstream, rendered in an idealized
# (clean, saturated) version of its hue, so a red mark abutting a black line stays a distinct
# red region instead of binarizing into one thick black blob that swallows the line.
CHROMA_ABS = 0.08       # absolute RGB spread (max-min, 0..1) below this is pencil-black, not a colour. Unlike
                        # Lab chroma it doesn't collapse as a colour darkens, and unlike HSV saturation it
                        # isn't amplified into noise for near-black pixels -- so a DARK reddish stroke stays
                        # chromatic (mapped to its own colour area) while grey pencil stays black.
# k-means over-segments a shaded colour into several clusters; merge them back by PERCEPTUAL distance
# (Lab a/b) rather than hue (which is unstable for desaturated colours near the red axis -- two browns
# read as different hues). But a plain distance can't tell a shading split (one object, clusters
# INTERWOVEN -> merge) from two genuinely-different adjacent colours (a reddish patch sitting in a brown
# pole -> keep): the reddish/brown pair is as close as the shading split. Spatial interpenetration
# breaks the tie -- interwoven clusters have most of their pixels near each other; a distinct patch
# touches its host only along a seam. So the allowed merge distance widens with mutual contact.
MERGE_AB = 11.0         # base Lab a/b distance under which two clusters are the same colour outright
MERGE_GAIN = 30.0       # ...extended by this * their mutual spatial-contact fraction (0..1)
MERGE_R = 0.3           # contact = fraction of a cluster within this * pen-width of the other
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


def _pen_width(mask: np.ndarray, dist: np.ndarray) -> float:
    """`w` = mode of the medial-axis half-width, doubled (§5) -- the width the child drew MOST,
    robust to a few fat blobs or thin tails. It is the unit every downstream tolerance is a multiple
    of, so no stage carries a raw pixel constant. A parabolic fit to the peak bin recovers a sub-pixel mode."""
    radii = dist[skeletonize(mask)]
    radii = radii[radii > 0]
    if radii.size == 0:
        return 1.0
    hi = max(2.0, float(radii.max()))
    counts, edges = np.histogram(radii, bins=np.arange(0.0, hi + 0.5, 0.5))
    i = int(counts.argmax())
    peak = 0.5 * (edges[i] + edges[i + 1])
    if 0 < i < len(counts) - 1:
        c0, c1, c2 = float(counts[i - 1]), float(counts[i]), float(counts[i + 1])
        denom = c0 - 2.0 * c1 + c2
        if denom < 0.0:                                    # a genuine peak -- shift within [-¼,+¼] bin
            peak += 0.25 * (c0 - c2) / denom
    return float(2.0 * peak)


def _sauvola_window(w: float) -> int:
    """Odd Sauvola window ~SAUVOLA_W pen widths wide (never below 3px)."""
    return max(3, int(round(SAUVOLA_W * w)) | 1)


def _chroma(rgb01: np.ndarray | None) -> np.ndarray | None:
    """Per-pixel absolute RGB spread (max-min, 0..1); None for greyscale. A darkness-independent colour
    signal -- paper is achromatic (~0), pigment is not -- shared with the palette gate (§CHROMA_ABS)."""
    return None if rgb01 is None else rgb01.max(2) - rgb01.min(2)


def _binarize(gray: np.ndarray, thresh_bias: float, window: int,
              chroma: np.ndarray | None = None) -> np.ndarray:
    """Gray (0..1) -> bool ink mask. Local (Sauvola) threshold handles the uneven
    illumination of pencil on paper where global Otsu underperforms. `window` is sized to
    the pen width by the caller so the neighborhood is a fixed number of pen widths at any DPI."""
    thr = threshold_sauvola(gray, window_size=window)
    # Sauvola alone flags texture inside large blank areas, so require the pixel be
    # genuinely darker than mid-gray too (paper stays paper). But Sauvola also *misses*
    # the interior of a large uniform-dark fill (no local contrast there) -- so accept
    # any absolutely-dark pixel as ink as well, or that interior becomes a false hole.
    ink = ((gray < thr + thresh_bias) | (gray < DARK_ABS + thresh_bias)) & (gray < 0.65 + thresh_bias)
    # The absolute-dark floor only rescues a DARK fill; a mid-tone COLOURED fill (a brown flagpole,
    # gray just above DARK_ABS) is missed by both it and Sauvola, leaving a false hole in the middle
    # of clearly-drawn colour. Paper is achromatic, so any strongly chromatic pixel is ink regardless
    # of luminance. No effect on greyscale/black-only art (chroma is None / ~0 everywhere).
    if chroma is not None:
        ink = ink | (chroma >= CHROMA_ABS)
    return ink


def _otsu_w(gray: np.ndarray, thresh_bias: float) -> float:
    """A rough modal pen width via a window-FREE global (Otsu) threshold -- carries no pixel-scale
    window, so it breaks the chicken-and-egg of sizing the Sauvola window before knowing w."""
    try:
        t = float(threshold_otsu(gray))
    except Exception:
        t = 0.5
    rough = (gray < min(t, 0.65) + thresh_bias) | (gray < DARK_ABS + thresh_bias)
    if not rough.any():
        return 1.0
    return _pen_width(rough, ndimage.distance_transform_edt(rough))


def _ink_mask(gray: np.ndarray, thresh_bias: float,
              chroma: np.ndarray | None = None) -> tuple[np.ndarray, float]:
    """The Sauvola ink mask and its modal pen width, window bootstrapped from the Otsu-rough width. The
    mode -- the width the child drew MOST -- is the right characteristic width even for a two-width
    drawing (the flag's thin emblem vs its fat field): it follows the dominant stroke population, so the
    resize factor derived from it takes that population to TARGET_W rather than an in-between median."""
    mask = _binarize(gray, thresh_bias, _sauvola_window(_otsu_w(gray, thresh_bias)), chroma)
    return mask, _pen_width(mask, ndimage.distance_transform_edt(mask))


def _pick_scale(w_native: float) -> int:
    """Integer supersample factor that brings the native pen width up toward TARGET_W (up-sampling only;
    LANCZOS can't invent detail, so a high-DPI scan is left at native and normalized by the w-relative
    tolerances rather than resized down)."""
    return int(min(SCALE_MAX, max(1, round(TARGET_W / max(w_native, 1e-3)))))


def _merge_clusters(lb: np.ndarray, cxy: np.ndarray, crgb: np.ndarray,
                    shape: tuple, w: float) -> np.ndarray:
    """Single-linkage merge of the k-means clusters into perceptual colours (see MERGE_AB). Two clusters
    join when their mean Lab a/b distance is under MERGE_AB, widened by MERGE_GAIN * their mutual spatial
    contact -- a shaded colour split into interwoven clusters re-merges, a distinct patch that only seams
    its host stays its own colour. Returns lb with each pixel relabelled to its component representative."""
    ids = list(np.unique(lb))
    if len(ids) <= 1:
        return lb
    H, W = shape
    r = max(1, int(round(MERGE_R * w)))
    img = {}; dil = {}
    for c in ids:
        m_ = np.zeros((H, W), bool); sel = cxy[lb == c]; m_[sel[:, 0], sel[:, 1]] = True
        img[c], dil[c] = m_, ndimage.binary_dilation(m_, iterations=r)
    abv = {c: rgb2lab(crgb[lb == c].mean(0)[None, None, :])[0, 0, 1:] for c in ids}
    parent = {c: c for c in ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x

    for a, b in itertools.combinations(ids, 2):
        contact = min((img[a] & dil[b]).sum() / max(1, img[a].sum()),
                      (img[b] & dil[a]).sum() / max(1, img[b].sum()))
        if np.linalg.norm(abv[a] - abv[b]) < MERGE_AB + MERGE_GAIN * contact:
            parent[find(a)] = find(b)
    out = lb.copy()
    for c in ids:
        out[lb == c] = find(c)
    return out


def _quantize_colors(rgb: np.ndarray, mask: np.ndarray, w: float) -> tuple[np.ndarray, list]:
    """Partition the ink into a small canonical palette (see CHROMA_ABS/MERGE_AB).

    `rgb` is 0..1 at the working scale. Returns a colour-id map (-1 = paper, 0 = pencil-black,
    1.. = chromatic) and the idealized palette. Chromatic pixels are k-means clustered in Lab
    (a,b), clusters of one perceptual colour are merged (spatially-aware, §_merge_clusters), tiny
    ones dropped; each surviving colour renders as its hue cleanly saturated. Achromatic ink (and
    pixels a colour didn't claim, e.g. filled sub-pen holes) fall to pencil-black."""
    labels = np.full(mask.shape, -1, int)
    labels[mask] = 0
    palette = [BLACK]
    ab = rgb2lab(rgb)[..., 1:]                       # cluster + merge in Lab...
    chroma = rgb.max(2) - rgb.min(2)                 # ...but gate chromatic-vs-black on the absolute RGB spread
    idx = np.argwhere(mask)
    px_ab = ab[mask]
    chro = chroma[mask] >= CHROMA_ABS
    if chro.sum() <= 0.01 * max(1, mask.sum()):
        return labels, palette                      # essentially monochrome
    cab, crgb, cxy = px_ab[chro], rgb[mask][chro], idx[chro]
    k = min(6, max(1, int(chro.sum() // 120)))
    _, lb = kmeans2(cab, k, minit="++", seed=0, missing="warn")
    lb = _merge_clusters(lb, cxy, crgb, mask.shape, w)

    def mean_hsv(c):
        return rgb2hsv(crgb[lb == c].mean(0)[None, None, :])[0, 0]

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

    if scale is None:                       # measure native w (w-relative window), then pick the factor
        scale = _pick_scale(_ink_mask(gray, thresh_bias, _chroma(rgb01))[1])
    if scale > 1:                           # LANCZOS keeps antialiased walls/holes crisp
        h, w_ = gray.shape
        gray = np.asarray(Image.fromarray((gray * 255).astype(np.uint8))
                          .resize((w_ * scale, h * scale), Image.LANCZOS), float) / 255.0
        if color:
            rgb01 = np.asarray(Image.fromarray((rgb01 * 255).astype(np.uint8))
                               .resize((w_ * scale, h * scale), Image.LANCZOS), float) / 255.0

    mask, w = _ink_mask(gray, thresh_bias, _chroma(rgb01))  # Sauvola window sized to the pen width
    dist = ndimage.distance_transform_edt(mask)

    # Speckle rejection on imaging grounds only: drop paper-grain components smaller than a fraction
    # of a pen width across (GRAIN_W2 * w^2) -- a w-relative floor, not a fixed pixel count.
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n:
        areas = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
        keep = np.isin(lab, 1 + np.where(areas > GRAIN_W2 * w * w)[0])
        mask = mask & keep
        dist = ndimage.distance_transform_edt(mask)
        w = _pen_width(mask, dist)

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
        labels, palette = _quantize_colors(rgb01, mask, w)
    else:
        labels, palette = None, [BLACK]
    return Ink(mask=mask, dist=dist, w=w, scale=scale, labels=labels, palette=palette)
