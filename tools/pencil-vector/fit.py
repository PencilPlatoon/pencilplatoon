"""Stage 8 -- geometry fitting (plan §9).

Idealize each traced polyline -- stroke centerlines AND blob boundaries alike, the
one uniform step promised at M2/M6 -- by working in the **turning function**, not in
x/y. A wobbly-but-straight line is a tangent angle noisy with near-zero drift; an
intended circle is roughly constant curvature; a corner is a step. Smoothing x/y would
kill corners along with wobble; denoising curvature does not.

Pipeline per curve:
  1. resample to uniform arc length,
  2. turning function theta(s) and curvature kappa(s); TV-denoise both kappa and the
     half-width r(s) with an L1 prior (noise oscillates around a mean; intent is a
     sustained excursion),
  3. segment into primitives -- line, arc, clothoid, corner -- as a shortest path over
     candidate spans, chosen by description length (so a distorted circle becomes ONE
     arc, not forty segments),
  4. record {kind, params, residual} as ANNOTATIONS; the raw points are never replaced.

The residual (each sample's signed normal offset from its primitive) is kept so a tunable
fraction can be reapplied as a style layer -- compact geometry and the hand, independently
controllable (§11 wobble/charm)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.ndimage import distance_transform_edt, gaussian_filter1d
from skimage.restoration import denoise_tv_chambolle

RESAMPLE_W = 0.5        # resample step, in units of w
MIN_STEP = 1.5          # ...but never finer than this many px
KAPPA_SMOOTH = 2.0      # Gaussian sigma (samples) on kappa(s) for the clothoid linearity test
TV_RADIUS = 0.8         # TV weight on r(s)
SPLIT_PEN_W = 0.35      # per-segment description-length penalty, as (SPLIT_PEN_W*w)^2 of SSE
ARC_EXTRA_W = 0.15      # an arc costs this much (in the same SSE units) more than a line
MIN_SEG = 4             # a primitive spans at least this many samples
CORNER_DEG = 38.0       # a tangent break wider than this at a join is a corner (else smooth)
ENVELOPE_TOL_W = 0.15   # a fitted arc may bow at most this far (units of w) FURTHER out than the raw edge
TV_KAPPA_W = 0.30       # TV/L1 denoise weight on kappa(s), in units of w (plan sec 9)
CORNER_WIN_W = 0.6      # corner detector: turning measured over +-this many w of arc length
CORNER_ANGLE = 40.0     # ...a turn sharper than this over that window is a corner break
PEN_FLOOR = 0.05        # baran: a break at a full corner still costs this fraction of the base penalty
CORNER_WIN2_W = 2.5     # rebuild: fit each side's line over +-this many w to test straightness
CORNER_STRAIGHT_W = 0.4 # rebuild: a corner's sides must each be straight to within this*w (rms)
CORNER_NMS_W = 1.5      # rebuild: suppress corners within +-this many w of a stronger one (< the win above,
                        # so two genuinely distinct corners a short stretch apart both survive)
# corner detector v3 (spline): arclength-weighted local-turn peaks + apex localization. Tuned on hand labels
# (recall ~0.90, position median ~0.5px, vs v2's 0.70 / 1.7px). See _corners_v3.
CORNER_TAU_W = 0.33     # arclength decay of the side-direction fit, in w -- nearby samples dominate the turn
CORNER_NMS3_W = 0.6     # turn-peak local-max radius, in w (small; apex + dedup merge one vertex's peaks)
CORNER_ACCEPT = 38.0    # a turn peak this sharp (deg) is a corner...
CORNER_STRONG = 55.0    # ...outright above this; in the [ACCEPT, STRONG) band it must ALSO kink
CORNER_KINK_SW = 0.17   # kink = turn(short scale) / turn(long scale): ~1 at a corner, <1 through an arc
CORNER_KINK_LW = 1.1
CORNER_KINK_MIN = 0.5
CORNER_SUSTAIN = 20.0   # ...and the turn must persist at the long scale (a real corner is visible even
                        # coarsely; per-sample NOISE turns sharply but averages out over CORNER_KINK_LW*w)
CORNER_APEX_W = 2.0     # relocate an accepted corner to the vertex within +-this many w
CORNER_DEDUP_W = 0.8    # merge accepted corners closer than this many w (keep the sharper)
CORNER_END_MARGIN = 1   # on an open edge, keep corners this many samples in from each end (the very ends are
                        # junctions, handled as anchors; corners a couple samples in are real bends -- keep them)
CORNER_FINE_W = 0.25    # corner-preserving resample: detect on a resample this fine (in w) to catch small
                        # sharp features the 0.5w step would chord across, then insert the ones it missed
LINE_TOL_W = 0.6        # rebuild: a span whose line fit is within this*w (rms) stays a line, not an arc
ARC_MIN_SWEEP = 30.0    # css/wtmm: a span must sustain this many deg of (multiscale) turning to be an arc
CSS_FINE_W = 0.8        # css: fine gaussian scale on the turning (units of w) -- localizes corners
CSS_COARSE_W = 2.5      # css: coarse scale -- the sustained-curvature trend a corner must beat
CSS_PEAK = 0.20         # css: a corner's fine-scale turning peak (rad) must exceed this
CSS_SHARP = 1.3         # css: ...and be this many x sharper than the coarse trend (localized, not an arc)
WTMM_S0_W = 1.0         # wtmm: base wavelet scale (units of w); scales = S0*{1,2,4,8}
WTMM_PEAK = 0.35        # wtmm: fine-scale |CWT| modulus-maximum threshold (rad)
WTMM_SINGULAR = 0.85    # wtmm: a corner's |CWT| stays >= this frac coarse->fine (no decay = singular)

# Segmentation strategy, switchable for the fit-quality experiment (set fit.STRATEGY):
#   "baseline" - current: gaussian-smoothed kappa, x/y SSE DP, uniform split penalty
#   "tv_kappa" - plan sec 9: TV/L1-denoise kappa instead of gaussian (keeps corner steps)
#   "corner"   - tv_kappa + detect kappa-step corners as fixed breaks, smooth runs between them
#   "baran"    - continuity-transition DP: joins cost by G0(corner)/G1(smooth), corners emerge
#   "rebuild"  - the full rewrite: robust straight-sides corner detection (a corner is where two
#                straight sides meet, not just a sharp turn), line/arc segmentation between corners,
#                and blob boundaries pinned to their stroke-attachment points (no cross-element gaps)
#   "spline"   - DEFAULT: local-support position-domain smoothing spline (no integration drift), corners
#                as knots, primitives classified off the smoothed curve. Best look, near-minimal data.
STRATEGY = "spline"
CLOTHOID_GAIN = 0.55    # clothoid must cut an arc-span's residual to at most this fraction
CLOTHOID_MIN_DK = 0.15  # ...and its curvature must sweep at least this many rad over the span


@dataclass
class Primitive:
    kind: str                       # 'line' | 'arc' | 'clothoid'
    i: int                          # [i, j] sample span on the resampled curve
    j: int
    params: dict                    # line: {p0,dir}; arc: {center,radius}; clothoid: {k0,dk,...}
    residual: float                 # RMS geometric residual (px)
    corner_in: bool = False         # a C0 break precedes this primitive


@dataclass
class Fit:
    closed: bool
    samples: np.ndarray             # (M,2) the resampled curve the fit was measured on
    prims: list = field(default_factory=list)
    resid: np.ndarray | None = None # (M,2) per-sample offset (samples - cleaned), for charm
    width: np.ndarray | None = None # (M,) TV-denoised half-width r(s), strokes only


# ---------------------------------------------------------------- resample / turning

def resample(P: np.ndarray, step: float, closed: bool, w: float = 0.0) -> np.ndarray:
    """Arc-length-uniform resample of a polyline (deduped). Closed curves repeat no endpoint.

    When w>0, additionally PRESERVE corners the uniform step would chord across: a small sharp feature (< ~2w)
    whose vertices don't land on samples gets rounded below the corner threshold before detection ever sees it.
    Fix at the source -- detect corners on a finer resample, and insert (only) the ones the uniform pass missed.
    Uniform samples stay put, so already-well-localized corners are untouched (position is preserved)."""
    P = np.asarray(P, float)
    if closed and (len(P) < 2 or not np.allclose(P[0], P[-1])):
        P = np.vstack([P, P[:1]])
    seg = np.hypot(*np.diff(P, axis=0).T)
    keep = np.concatenate([[True], seg > 1e-9])
    P = P[keep]
    if len(P) < 2:
        return P
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    total = s[-1]

    def sample(su):
        out = np.column_stack([np.interp(su, s, P[:, 0]), np.interp(su, s, P[:, 1])])
        return out[:-1] if closed else out

    n = max(2, int(round(total / step)))
    su_u = np.linspace(0, total, n + 1 if closed else n)
    Su = sample(su_u)
    if w <= 0 or total < 2 * step:
        return Su
    fstep = max(MIN_STEP, CORNER_FINE_W * w)                  # finer resample where detection is reliable
    suf = np.linspace(0, total, max(2, int(round(total / fstep))) + (1 if closed else 0))
    Sf = sample(suf)
    if len(Sf) < 6:
        return Su
    fine = _corners_v3(Sf, w, fstep, closed)
    if not fine:
        return Su
    std_pts = [Su[c] for c in _corners_v3(Su, w, step, closed)]   # corners the uniform pass already gets
    extra = [float(suf[c]) for c in fine                          # ...keep only the small features it missed
             if not std_pts or min(math.hypot(*(Sf[c] - q)) for q in std_pts) > w]
    if not extra:
        return Su
    core = (su_u[:-1] if closed else su_u).tolist()
    su2 = sorted(set(core) | set(extra))
    return sample(np.array(su2 + [total]) if closed else np.array(su2))       # drop the duplicated wrap sample


def _turning(P: np.ndarray, closed: bool):
    """Signed curvature per sample (rad per step) from the tangent-angle increments."""
    d = np.diff(np.vstack([P, P[:1]]) if closed else P, axis=0)
    ang = np.arctan2(d[:, 1], d[:, 0])
    dth = np.diff(np.concatenate([ang[-1:], ang]) if closed else ang)
    dth = (dth + np.pi) % (2 * np.pi) - np.pi                 # wrap to (-pi, pi]
    # place the turn at the shared vertex; pad ends of an open curve with zero curvature
    if closed:
        return dth
    return np.concatenate([[0.0], dth, [0.0]])


# ---------------------------------------------------------------- O(1) span residuals

class _Prefix:
    """Prefix sums so any span's best line / circle fit and its residual are O(1)."""

    def __init__(self, P: np.ndarray):
        x, y = P[:, 0], P[:, 1]
        z = x * x + y * y
        o = np.ones(len(P))
        cols = [o, x, y, z, x * x, y * y, x * y, x * z, y * z, z * z]
        self.c = np.vstack([np.zeros(10), np.cumsum(np.column_stack(cols), axis=0)])

    def _s(self, i, j):
        return self.c[j] - self.c[i]     # sums over [i, j)

    def line(self, i, j):
        s = self._s(i, j)
        if s[0] < 2:
            return 0.0
        # plain floats via one tolist() (scalar np.float64 math / per-elem float() was pure overhead)
        n, Sx, Sy, _, Sxx, Syy, Sxy, *_ = s.tolist()
        mx, my = Sx / n, Sy / n
        cxx, cyy, cxy = Sxx - n * mx * mx, Syy - n * my * my, Sxy - n * mx * my
        # smaller eigenvalue of the scatter matrix = sum of squared perpendicular distances
        tr, det = cxx + cyy, cxx * cyy - cxy * cxy
        disc = max(0.0, tr * tr / 4 - det)
        return max(0.0, tr / 2 - math.sqrt(disc))

    def circle(self, i, j):
        s = self._s(i, j)
        if s[0] < 3:
            return 0.0, None, 0.0
        n, Sx, Sy, Sz, Sxx, Syy, Sxy, Sxz, Syz, Szz = s.tolist()   # one C conversion, no per-elem float()
        # Kasa algebraic fit: minimize sum (z + D x + E y + F)^2 -> the symmetric 3x3 normal eqs
        # [[Sxx,Sxy,Sx],[Sxy,Syy,Sy],[Sx,Sy,n]] @ [D,E,F] = -[Sxz,Syz,Sz]. Solved in closed form
        # (cofactor inverse) -- far cheaper per span than np.linalg.solve, which this O(M^2) DP
        # called hundreds of thousands of times.
        co0 = Syy * n - Sy * Sy                       # cofactors of the symmetric matrix
        co1 = Sx * Sy - Sxy * n
        co2 = Sxy * Sy - Sx * Syy
        det = Sxx * co0 + Sxy * co1 + Sx * co2
        if abs(det) < 1e-9:
            return 1e18, None, 0.0
        co3 = Sxx * n - Sx * Sx
        co4 = Sx * Sxy - Sxx * Sy
        co5 = Sxx * Syy - Sxy * Sxy
        D = (co0 * -Sxz + co1 * -Syz + co2 * -Sz) / det
        E = (co1 * -Sxz + co3 * -Syz + co4 * -Sz) / det
        F = (co2 * -Sxz + co4 * -Syz + co5 * -Sz) / det
        cx, cy = -D / 2, -E / 2
        R2 = cx * cx + cy * cy - F
        if R2 <= 1e-6:
            return 1e18, None, 0.0
        alg = (Szz + D * D * Sxx + E * E * Syy + n * F * F
               + 2 * (D * Sxz + E * Syz + F * Sz + D * E * Sxy + D * F * Sx + E * F * Sy))
        return max(0.0, alg) / (4 * R2), (cx, cy), math.sqrt(R2)   # algebraic -> ~geometric SSE


# ---------------------------------------------------------------- segmentation (MDL DP)

ENV_K = 16              # points sampled along a span for the envelope test (keeps it O(1) per span)


def _per_pt_out(pts: np.ndarray, dt_out: np.ndarray) -> np.ndarray:
    """Per-point distance outside the ink (0 on ink); off-image treated as far outside."""
    H, W = dt_out.shape
    xi = np.round(pts[:, 0]).astype(int); yi = np.round(pts[:, 1]).astype(int)
    off = (xi < 0) | (yi < 0) | (xi >= W) | (yi >= H)
    d = dt_out[np.clip(yi, 0, H - 1), np.clip(xi, 0, W - 1)]
    d[off] = 1e9
    return d


def _line_dir(pre: _Prefix, i: int, j: int):
    """The span's least-squares line (centroid, unit direction) in O(1) from the prefix sums --
    the principal axis of its scatter, the same fit `pre.line` scores."""
    n, Sx, Sy, _, Sxx, Syy, Sxy, *_ = pre._s(i, j).tolist()
    mx, my = Sx / n, Sy / n
    th = 0.5 * math.atan2(2 * (Sxy - n * mx * my), (Sxx - n * mx * mx) - (Syy - n * my * my))
    return np.array([mx, my]), np.array([math.cos(th), math.sin(th)])


def _bulges(curve_K: np.ndarray, raw_K: np.ndarray, p0, dr, env) -> bool:
    """True where the curved primitive bows further outside the ink than BOTH the raw traced edge
    and the straight-line fallback, by more than `tol` px, at the same sampled point. Beating the
    raw edge means the curve inflated the shape past the drawn ink; beating the line too means a
    line would hug better, so a curve that merely tracks a gentle bend (whose line pokes out just
    as far) is spared. All three are sampled at the same ENV_K points, so the test is O(1)/span."""
    dt_out, tol = env
    line_K = p0 + np.outer((raw_K - p0) @ dr, dr)
    arc = _per_pt_out(curve_K, dt_out)
    return bool(((arc - _per_pt_out(raw_K, dt_out) > tol) & (arc - _per_pt_out(line_K, dt_out) > tol)).any())


def _turn_window(S: np.ndarray, closed: bool, w: float, step: float) -> np.ndarray:
    """Per-sample turning angle (degrees) measured over a +-CORNER_WIN_W*w arc-length window -- a
    real direction change at that sample, not one noisy pixel. The corner signal for both strategies."""
    M = len(S)
    win = max(2, int(round(CORNER_WIN_W * w / step)))
    ang = np.zeros(M)
    if M < 2 * win + 2:
        return ang
    for i in range(M):
        a, b = i - win, i + win
        if not closed and (a < 0 or b >= M):
            continue
        v0 = S[i] - S[a % M]; v1 = S[b % M] - S[i]
        n0, n1 = math.hypot(*v0), math.hypot(*v1)
        if n0 > 1e-9 and n1 > 1e-9:
            ang[i] = math.degrees(math.acos(max(-1.0, min(1.0, float(v0 @ v1) / (n0 * n1)))))
    return ang


def _corners(ang: np.ndarray) -> list:
    """Forced breaks (strategy 'corner'): the turning-angle local maxima above CORNER_ANGLE."""
    M = len(ang)
    win = 2
    out = []
    for i in range(M):
        if ang[i] > CORNER_ANGLE and ang[i] >= ang[max(0, i-win):i+win+1].max() - 1e-9:
            if not out or i - out[-1] >= MIN_SEG:
                out.append(i)
    return [i for i in out if MIN_SEG <= i <= M - MIN_SEG]  # interior only; ends are breaks already


def _corners_v2(S: np.ndarray, w: float, step: float, closed: bool) -> list:
    """Corners for the rebuild fit: a corner is where two STRAIGHT sides meet at an angle. Fit a
    short line to the +-win window on each side; fire only where BOTH sides are straight (low line
    residual) AND the turn between them is sharp. An arc curves *through* its window (high residual)
    so it is rejected -- the separation a fixed turning-angle threshold can't make (a tight arc and a
    corner show the same windowed turn). Local-max suppressed and merged so each vertex fires once."""
    M = len(S)
    win = max(3, int(round(CORNER_WIN2_W * w / step)))
    if M < 2 * win + 2:
        return []

    def straight(seg):                                    # (rms perpendicular residual, unit dir)
        p0, dr = _line_params(seg)
        d = seg - p0
        return float(np.sqrt(((d - np.outer(d @ dr, dr)) ** 2).sum(1).mean())), dr

    score = np.zeros(M)
    for i in range(M):
        a, b = i - win, i + win
        if not closed and (a < 0 or b >= M):
            continue
        rl, dl = straight(S[[k % M for k in range(a, i + 1)]])
        rr, dr = straight(S[[k % M for k in range(i, b + 1)]])
        if rl <= CORNER_STRAIGHT_W * w and rr <= CORNER_STRAIGHT_W * w:
            # _line_params' direction has arbitrary sign; orient each along the curve's own travel
            # (into i, then out of i) so the angle is the real turn -- else a straight run reads as 180
            if dl @ (S[i] - S[a % M]) < 0: dl = -dl
            if dr @ (S[b % M] - S[i]) < 0: dr = -dr
            score[i] = math.degrees(math.acos(max(-1.0, min(1.0, float(dl @ dr)))))
    nms = max(2, int(round(CORNER_NMS_W * w / step)))     # peak-suppress over a tighter radius than the
    out = []                                              # straightness window, so close corners both fire
    for i in range(M):
        if score[i] > CORNER_ANGLE and score[i] >= score[max(0, i-nms):i+nms+1].max() - 1e-9:
            if not out or i - out[-1] >= nms:              # one corner per vertex
                out.append(i)
    return out if closed else [i for i in out if MIN_SEG <= i <= M - MIN_SEG]


def _wdir(S: np.ndarray, p: int, dirn: int, piv, tau: float, closed: bool, M: int) -> np.ndarray:
    """Arclength-weighted principal direction of the side leaving p (dirn=+-1), oriented outward from piv.
    Weight decays exp(-arclength/tau), so nearby samples dominate and a boundary that curls back near the
    corner can't hijack the fit. Fits a line THROUGH piv (2nd moment about piv); returns its unit direction."""
    a = b = c = rx = ry = arc = 0.0
    prev = S[p % M]
    for s in range(400):
        k = p + dirn * s
        if not closed and (k < 0 or k >= M):
            break
        k %= M; cur = S[k]; vx, vy = cur[0] - piv[0], cur[1] - piv[1]
        if s > 0:
            arc += math.hypot(cur[0] - prev[0], cur[1] - prev[1]); prev = cur
        if s > 2 and arc > 8 * tau:
            break
        wt = math.exp(-arc / tau)
        a += wt * vx * vx; b += wt * vx * vy; c += wt * vy * vy
        if s >= 1:
            rx += vx; ry += vy
    t = (a + c) / 2.0; disc = math.sqrt(((a - c) / 2.0) ** 2 + b * b); lam = t + disc
    if abs(b) > 1e-9:
        dx, dy = lam - c, b
    elif a >= c:
        dx, dy = 1.0, 0.0
    else:
        dx, dy = 0.0, 1.0
    n = math.hypot(dx, dy) or 1.0; dx, dy = dx / n, dy / n
    if dx * rx + dy * ry < 0:
        dx, dy = -dx, -dy
    return np.array([dx, dy])


def _turn_wt(S: np.ndarray, i: int, tau: float, closed: bool, M: int):
    """Turning angle (deg) at i from the two arclength-weighted side directions, plus those directions."""
    dl = _wdir(S, i, -1, S[i], tau, closed, M)
    dr = _wdir(S, i, +1, S[i], tau, closed, M)
    return math.degrees(math.acos(max(-1.0, min(1.0, float(-dl[0] * dr[0] - dl[1] * dr[1]))))), dl, dr


def _win_arc(S: np.ndarray, i: int, closed: bool, M: int, half: float) -> list:
    out = [i % M]
    for dirn in (-1, 1):
        acc, j = 0.0, i % M
        while acc < half:
            nj = (j + dirn) % M if closed else j + dirn
            if not closed and (nj < 0 or nj >= M):
                break
            acc += math.hypot(*(S[nj % M] - S[j % M])); out.append(nj % M); j = nj
    return out


def _apex(S: np.ndarray, i: int, dl: np.ndarray, dr: np.ndarray, w: float, closed: bool, M: int) -> int:
    """The corner vertex = the sample sticking out furthest along the bisector -(dl+dr) within +-CORNER_APEX_W."""
    bx, by = -(dl[0] + dr[0]), -(dl[1] + dr[1]); nb = math.hypot(bx, by)
    if nb < 1e-6:
        return i
    bx, by = bx / nb, by / nb
    return max(_win_arc(S, i, closed, M, CORNER_APEX_W * w), key=lambda k: float(S[k][0] * bx + S[k][1] * by))


def _corners_v3(S: np.ndarray, w: float, step: float, closed: bool) -> list:
    """Corners = arclength-weighted local-turn peaks, apex-localized. A real corner turns sharply within a
    short arc (high LOCAL turn); an arc spreads its turn out (low local turn) -- so the local turn angle is
    itself the corner/arc separator. Peaks accept at CORNER_ACCEPT; in the [ACCEPT, STRONG) ambiguity band
    they must ALSO kink (short-scale turn ~ long-scale turn, unlike an arc). Each accepted peak is relocated
    to the vertex (apex) and near-duplicates merged. Tuned on hand labels: recall ~0.90, pos median ~0.5px."""
    M = len(S)
    if M < 6:
        return []
    tau = CORNER_TAU_W * w
    theta = np.zeros(M); DL = [None] * M; DR = [None] * M
    for i in range(M):
        th, dl, dr = _turn_wt(S, i, tau, closed, M)
        theta[i] = th; DL[i] = dl; DR[i] = dr
    nms = max(1, int(round(CORNER_NMS3_W * w / step)))
    cand = []
    for i in range(M):
        if theta[i] < CORNER_ACCEPT:
            continue
        wnd = [theta[k % M] for k in range(i - nms, i + nms + 1)] if closed else \
              [theta[k] for k in range(max(0, i - nms), min(M, i + nms + 1))]
        if theta[i] < max(wnd) - 1e-9:                    # keep only the local-max sample of each turn peak
            continue
        thl = _turn_wt(S, i, CORNER_KINK_LW * w, closed, M)[0]
        if thl < CORNER_SUSTAIN:                          # not sustained at the coarse scale -> per-sample noise
            continue
        if theta[i] < CORNER_STRONG:                      # ambiguity band: demand a concentrated kink
            ths = _turn_wt(S, i, CORNER_KINK_SW * w, closed, M)[0]
            if ths / max(thl, 1e-6) < CORNER_KINK_MIN:
                continue
        cand.append((_apex(S, i, DL[i], DR[i], w, closed, M), theta[i]))
    out = []
    for j, th in sorted(cand, key=lambda t: -t[1]):       # strongest first; drop near-duplicate vertices
        if all(math.hypot(*(S[j] - S[k])) >= CORNER_DEDUP_W * w for k in out):
            out.append(j)
    out.sort()
    return out if closed else [i for i in out if CORNER_END_MARGIN <= i <= M - 1 - CORNER_END_MARGIN]


def _local_max_corners(strength: np.ndarray, thresh: float, win: int, closed: bool) -> list:
    """Corner breaks = local maxima of a per-sample corner strength above `thresh`, one per vertex."""
    M = len(strength)
    out = []
    for i in range(M):
        if strength[i] <= thresh:
            continue
        lo, hi = max(0, i - win), min(M, i + win + 1)
        if strength[i] < strength[lo:hi].max() - 1e-12:
            continue
        if not out or i - out[-1] >= win:
            out.append(i)
    return out if closed else [i for i in out if MIN_SEG <= i <= M - MIN_SEG]


def _detect_css(turn: np.ndarray, closed: bool, w: float, step: float):
    """Curvature Scale Space corner detection: Gaussian scale-space of the turning function. A corner
    is a fine-scale turning peak that is SHARP relative to the coarse-scale trend (localized, persists
    as a peak) -- an arc's turning is broad, so fine ~ coarse there and it is not flagged. Returns the
    corner breaks and a coarse-scale curvature (rad/px) for the line-vs-arc gate."""
    mode = "wrap" if closed else "nearest"
    fine = gaussian_filter1d(turn, max(0.6, CSS_FINE_W * w / step), mode=mode)
    coarse = gaussian_filter1d(turn, max(1.6, CSS_COARSE_W * w / step), mode=mode)
    af, ac = np.abs(fine), np.abs(coarse)
    strength = np.where(af > CSS_SHARP * np.maximum(ac, 1e-6), af, 0.0)     # sharp vs the coarse trend
    win = max(2, int(round(CORNER_WIN_W * w / step)))
    return _local_max_corners(strength, CSS_PEAK, win, closed), coarse / step


def _detect_wtmm(turn: np.ndarray, closed: bool, w: float, step: float):
    """Wavelet Transform Modulus Maxima corner detection: CWT of the turning with a Ricker (Mexican-hat)
    wavelet across scales. A corner is a SINGULARITY -- its |CWT| does not decay from coarse to fine
    scale (Lipschitz ~0); a smooth arc's |CWT| decays. Returns corner breaks and a coarse curvature."""
    from scipy.signal import ricker
    scales = [max(1.0, WTMM_S0_W * w / step) * f for f in (1, 2, 4, 8)]
    maxlen = (len(turn) - 1) | 1                            # odd, <= len(turn) so 'same' stays turn-length
    W = []
    for a in scales:
        wav = ricker(min(maxlen, max(9, int(10 * a)) | 1), a)
        if closed:
            pad = len(wav)
            d = np.concatenate([turn[-pad:], turn, turn[:pad]])
            W.append(np.convolve(d, wav, "same")[pad:pad + len(turn)])
        else:
            W.append(np.convolve(turn, wav, "same"))
    aW = np.abs(np.array(W))
    fine, coarse = aW[0], aW.max(0)
    strength = np.where(fine >= WTMM_SINGULAR * np.maximum(coarse, 1e-6), fine, 0.0)  # no decay = singular
    win = max(2, int(round(CORNER_WIN_W * w / step)))
    kap = gaussian_filter1d(turn, max(1.6, CSS_COARSE_W * w / step),
                            mode="wrap" if closed else "nearest") / step
    return _local_max_corners(strength, WTMM_PEAK, win, closed), kap


# ---------------------------------------------------------------- Option A: curvature-domain fit
CORNER_CAND_R_W = 2.0   # curvfit: a turning peak needing radius < this*w is a CANDIDATE corner (generous)
CURV_L1_W = 0.9         # curvfit: L1 weight on candidate theta-jumps (units of w) -- higher = fewer corners
CORNER_JUMP_MIN = 0.35  # curvfit: a candidate jump above this (rad) survives the L1 fit as a real corner
CURV_PEN_K = 0.004      # curvfit: opening a kappa piece costs this^2 (rad/px) of kappa SSE
CURV_FIT_W = 0.0        # curvfit: WLS penalty on per-sample kappa^2 -- caps wild pieces / spreads closure error
SPLINE_LAMBDA = 5.0     # spline: weight of the position-domain curvature-smoothing penalty (local support)
HUG_PRIMITIVES = False  # spline: emit line/arc pieces that each HUG the smoothed curve (subdivide where a
HUG_TOL_W = 0.12        # chord/arc bows off by more than HUG_TOL_W*w) -- fidelity at a few more data points
CURV_LINE_K = 0.006     # curvfit: |kappa| below this (rad/px) over a piece -> line
CURV_ARC_DK = 0.012     # curvfit: |kappa slope| below this*span -> arc (else clothoid)


def _kabsch(A: np.ndarray, B: np.ndarray) -> np.ndarray:
    """Rigidly align A onto B (rotation + translation, arc length is already matched)."""
    ca, cb = A.mean(0), B.mean(0)
    U, _, Vt = np.linalg.svd((A - ca).T @ (B - cb))
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    return (A - ca) @ (Vt.T @ np.diag([1.0, d]) @ U.T).T + cb


def _integrate(kap: np.ndarray, step: float, jumps: np.ndarray) -> np.ndarray:
    """Reconstruct the curve from its curvature: theta = int kappa (+ corner jumps), pos = int(cos,sin).
    theta is continuous except at the explicit jumps, so the curve is G1 by construction -- no kinks."""
    theta = np.cumsum(jumps + np.concatenate([[0.0], kap[:-1] * step]))
    return np.cumsum(np.column_stack([np.cos(theta), np.sin(theta)]) * step, axis=0)


def _kappa_dp(kap: np.ndarray, s: np.ndarray, w: float, breaks, M: int):
    """Segment the curvature into linear pieces (kappa = a + b*s) by description length -- one piece is a
    line (a~b~0), an arc (b~0), or a clothoid (b!=0). Forced breaks (corners) may not be spanned."""
    cs = lambda v: np.concatenate([[0.0], np.cumsum(v)])
    S1, Ss, Sk, Sss, Ssk = cs(np.ones(M)), cs(s), cs(kap), cs(s * s), cs(s * kap)
    Skk = cs(kap * kap)
    pen = (CURV_PEN_K ** 2) * MIN_SEG
    brk = np.zeros(M + 1, bool)                            # keep forced breaks >= MIN_SEG apart + interior
    kept = []                                             # so every inter-break gap can hold a piece
    for b in sorted(set(breaks)):
        if MIN_SEG <= b <= M - MIN_SEG and (not kept or b - kept[-1] >= MIN_SEG):
            kept.append(b); brk[b] = True
    bc = np.cumsum(brk)

    def fit(i, j):
        n = S1[j] - S1[i]
        ss, sk, sss, ssk, skk = Ss[j]-Ss[i], Sk[j]-Sk[i], Sss[j]-Sss[i], Ssk[j]-Ssk[i], Skk[j]-Skk[i]
        den = n * sss - ss * ss
        b = (n * ssk - ss * sk) / den if abs(den) > 1e-12 else 0.0
        a = (sk - b * ss) / n
        res = max(0.0, skk - a * sk - b * ssk)
        return res, a, b

    dp = [math.inf] * (M + 1); dp[0] = 0.0; back = [(-1, 0.0, 0.0)] * (M + 1)
    for j in range(MIN_SEG, M + 1):
        for i in range(0, j - MIN_SEG + 1):
            if not math.isfinite(dp[i]) or bc[j - 1] - bc[i] > 0:
                continue
            res, a, b = fit(i, j)
            c = dp[i] + res + pen
            if c < dp[j]:
                dp[j] = c; back[j] = (i, a, b)
    out, j = [], M
    while j > 0:
        i, a, b = back[j]; out.append((i, j, a, b)); j = i
    return out[::-1]


def _corner_candidates(turn: np.ndarray, w: float, step: float, closed: bool) -> list:
    """GENEROUS corner candidates: turning peaks that could plausibly be corners (radius < CORNER_CAND_R*w).
    Which of these are truly corners is NOT decided here -- a local test can't tell a shallow corner from
    a tight arc -- it is left to the L1-sparsity fit, which keeps only the jumps that earn their keep."""
    ts = gaussian_filter1d(turn, 0.5, mode="wrap" if closed else "nearest")
    M = len(turn)
    strength = np.abs(ts) / step
    kmax = 1.0 / (CORNER_CAND_R_W * w)
    out = []
    for i in range(M):
        if strength[i] > kmax and strength[i] >= strength[max(0, i-2):i+3].max() - 1e-12:
            if not out or i - out[-1] >= MIN_SEG:
                out.append(i)
    return out if closed else [i for i in out if MIN_SEG <= i <= M - MIN_SEG]


def _fit_curvfit(S: np.ndarray, P: np.ndarray, w: float, step: float, closed: bool, r, anchors):
    """Option A (McCrae-Singh): fit in the curvature domain and reconstruct by integration, so continuity
    is intrinsic (no kinks except real corners). Corners are NOT detected -- a candidate theta jump sits at
    every plausible spot and an L1-sparse weighted-least-squares keeps only the jumps that improve the x/y
    fit enough to pay for themselves (a rounded corner deviates from sharp ink; a smooth bend does not). The
    same least squares refits the kappa pieces so the INTEGRATED curve matches the samples -- killing drift."""
    from scipy.optimize import least_squares
    M = len(S)
    s = np.arange(M, dtype=float) * step
    turn = _turning(S, closed)
    cands = _corners_v2(S, w, step, closed)               # corner = straight sides meeting (an arc curves
    ts = gaussian_filter1d(turn, 0.5, mode="wrap" if closed else "nearest")  # through, so it is not one)
    sm = turn.copy()
    for c in cands:
        lo, hi = max(0, c-1), min(M, c+2); sm[lo:hi] = 0.0
    kap = denoise_tv_chambolle(sm, weight=TV_KAPPA_W * w * step) / step
    pieces = _kappa_dp(kap, s, w, list(cands), M)
    nco = 2 * len(pieces)

    def build(params):                                    # params = [a,b per piece..., jump per corner]
        kp = np.empty(M); idx = 0
        for (i, j, _, _) in pieces:
            kp[i:j] = params[idx] + params[idx+1] * s[i:j]; idx += 2
        jm = np.zeros(M)
        for k, c in enumerate(cands):
            jm[c] = params[nco + k]
        theta = np.cumsum(jm + np.concatenate([[0.0], kp[:-1] * step]))
        return np.cumsum(np.column_stack([np.cos(theta), np.sin(theta)]) * step, axis=0)

    def kappa_of(p):                                      # per-sample curvature kappa = a + b*s for its piece
        kp = np.empty(M); idx = 0
        for (i, j, _, _) in pieces:
            kp[i:j] = p[idx] + p[idx+1] * s[i:j]; idx += 2
        return kp

    def resid(p):                                         # position error, plus optional kappa^2 penalty
        pos = (_kabsch(build(p), S) - S).ravel()
        return pos if CURV_FIT_W <= 0 else np.concatenate([pos, math.sqrt(CURV_FIT_W) * kappa_of(p)])

    x0 = np.array([v for (i, j, a, b) in pieces for v in (a, b)] + [ts[c] for c in cands])
    prm = least_squares(resid, x0, method="lm", max_nfev=300).x
    corners = set(cands)
    recon = _kabsch(build(prm), S)
    for ax, ay in (anchors or []):                        # keep the boundary on its trace at attachments
        k = int(np.hypot(S[:, 0]-ax, S[:, 1]-ay).argmin())
        lo, hi = max(0, k-1), min(M, k+2); recon[lo:hi] = S[lo:hi]

    prims, cornerset, idx = [], set(corners), 0
    for (i, j, _, _) in pieces:
        a, b = prm[idx], prm[idx + 1]; idx += 2
        amid = a + b * s[(i+j)//2]
        if abs(amid) + abs(b) * (s[j-1]-s[i]) < CURV_LINE_K:
            kind, par = "line", {"p0": recon[i].tolist(), "dir": (recon[min(j-1, M-1)]-recon[i]).tolist()}
        elif abs(b)*(s[j-1]-s[i]) < CURV_ARC_DK and abs(amid) > 1e-6:
            cr, c, R = _Prefix(recon[i:j]).circle(0, j-i)
            kind, par = ("arc", {"center": [float(c[0]), float(c[1])], "radius": float(R)}) if c is not None \
                else ("clothoid", {"k0": float(a), "dk": float(b)})
        else:
            kind, par = "clothoid", {"k0": float(a), "dk": float(b)}
        p = Primitive(kind, i, j, par, _rms(S[i:j], recon[i:j]))
        p.corner_in = i in cornerset
        prims.append(p)

    width = None
    if r is not None and len(r) >= 2:
        s0 = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
        rr = np.interp(np.linspace(0, s0[-1], M), s0, np.asarray(r, float))
        width = denoise_tv_chambolle(rr, weight=TV_RADIUS * w)
    return Fit(closed=closed, samples=S, prims=prims, resid=S - recon, width=width)


def _width(P, r, w, M):
    if r is None or len(r) < 2:
        return None
    s0 = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    rr = np.interp(np.linspace(0, s0[-1], M), s0, np.asarray(r, float))
    return denoise_tv_chambolle(rr, weight=TV_RADIUS * w)


def _line_dev(seg):
    """Max perpendicular distance of a polyline to the chord through its ends (and the local index of it)."""
    d = seg[-1] - seg[0]; L = math.hypot(d[0], d[1])
    if L < 1e-9:
        rr = np.hypot(seg[:, 0] - seg[0, 0], seg[:, 1] - seg[0, 1])
        return float(rr.max()), int(rr.argmax())
    nrm = np.array([-d[1], d[0]]) / L
    pd = np.abs((seg - seg[0]) @ nrm)
    return float(pd.max()), int(pd.argmax())


def _arc_dev(seg, pre, i, j):
    """Max radial distance of C[i:j] from its best-fit circle (and the local index), plus (center, radius)."""
    _cr, c, R = pre.circle(i, j)
    if c is None or R <= 0:
        return math.inf, 0, None, 0.0
    dd = np.abs(np.hypot(seg[:, 0] - c[0], seg[:, 1] - c[1]) - R)
    return float(dd.max()), int(dd.argmax()), c, float(R)


def _hug_spans(C, pre, breaks, w):
    """Partition each break-bounded run of the smoothed curve C into the FEWEST line/arc pieces that each
    stay within HUG_TOL of C. Where C is a clean line/arc it stays one piece (compact); where it genuinely
    bends more, it splits at the worst-deviating sample -- so path_d's emitted geometry HUGS C instead of
    chording across it. Output matches _segment: [(i, j, (kind, par)), ...] contiguous over [0, M)."""
    tol = HUG_TOL_W * w
    M = len(C)
    cuts = sorted(set([0, M] + [b for b in breaks if 0 < b < M]))
    out = []

    def refine(i, j):
        seg = C[i:j]; n = j - i
        if n < 3:
            out.append((i, j, ("line", None))); return
        ld, la = _line_dev(seg)
        ad, aa, c, R = _arc_dev(seg, pre, i, j)
        if ld <= tol and ld <= ad:
            out.append((i, j, ("line", None))); return
        if ad <= tol:
            out.append((i, j, ("arc", (c, R)))); return
        if n <= 2 * MIN_SEG:                               # too short to split -> keep the closer primitive
            out.append((i, j, ("arc", (c, R)) if (c is not None and ad < ld) else ("line", None))); return
        m = i + (aa if (c is not None and ad < ld) else la)   # split at the worst point of the better fit
        m = max(i + MIN_SEG, min(j - MIN_SEG, m))
        refine(i, m); refine(m, j)

    for a, b in zip(cuts[:-1], cuts[1:]):
        refine(a, b)
    return out


def _fit_spline(S: np.ndarray, P: np.ndarray, w: float, step: float, closed: bool, r, anchors):
    """Local-support alternative to curv-fit. Instead of integrating kappa (global support -> the drift
    accumulates over arc length), fit x(s), y(s) DIRECTLY with a corner-aware curvature-smoothing penalty
    -- a discrete smoothing spline. Every point is pulled by its OWN sample (data term) and only coupled
    to immediate neighbours (2nd-difference penalty); the inverse of that banded system has exponentially
    decaying entries, so a control point's influence dies with distance (the Bezier/B-spline property) and
    wobble is removed with NO error accumulation. Corners are knots where the penalty is dropped, so they
    stay sharp. Primitives (line/arc/clothoid) are then classified off the smoothed curve for output."""
    M = len(S)
    s_arc = np.arange(M, dtype=float) * step
    cornerset = set(_corners_v3(S, w, step, closed))
    anchor_ix = []
    for ax, ay in (anchors or []):                        # blob attachments: pin exactly, never smooth across
        k = int(np.hypot(S[:, 0] - ax, S[:, 1] - ay).argmin())
        if 0 <= k < M:
            anchor_ix.append(k)
    smooth_breaks = cornerset | set(anchor_ix)

    # smoothing spline: minimize |C - S|^2 + LAMBDA*|D2 C|^2. Drop any 2nd-difference row whose 3-point
    # stencil touches a break, so corners/attachments bend freely. Banded, solved once for both columns.
    d_rows = []
    for k in (range(M) if closed else range(1, M - 1)):
        km, kp = (k - 1) % M, (k + 1) % M
        if k in smooth_breaks or km in smooth_breaks or kp in smooth_breaks:
            continue
        row = np.zeros(M); row[km] += 1.0; row[k] += -2.0; row[kp] += 1.0
        d_rows.append(row)
    D = np.array(d_rows) if d_rows else np.zeros((0, M))
    C = np.linalg.solve(np.eye(M) + SPLINE_LAMBDA * (D.T @ D), S)
    for k in anchor_ix:                                   # keep the boundary exactly on its trace at joins
        lo, hi = max(0, k - 1), min(M, k + 2); C[lo:hi] = S[lo:hi]

    # classify the smoothed curve into primitives; geometry rendered stays C (resid = S - C), so joins are
    # as smooth as C itself -- the primitives are labels + params, not a re-fit that could reintroduce kinks.
    # The break for an anchor goes one sample AFTER it, so the piece ENDS on the pinned sample: path_d draws
    # each piece to C[j-1], so this lands the rendered vertex exactly on the attachment (the boundary touches
    # the stroke; a break at the anchor itself would leave the pinned point mid-piece, where a line/arc chord
    # can bow off it).
    seg_breaks = sorted(cornerset | {(k + 1) % M for k in anchor_ix})
    pre = _Prefix(C)
    if HUG_PRIMITIVES:                                     # subdivide so the emitted primitives hug C
        spans = _hug_spans(C, pre, seg_breaks, w)
    else:
        kappa = denoise_tv_chambolle(_turning(C, closed), weight=TV_KAPPA_W * w * step) / step
        spans = _segment(C, pre, kappa, s_arc, closed, w, None, seg_breaks, None)
    prims = []
    for i, j, (kind, par) in spans:
        seg = C[i:j]
        if kind == "line":
            p0, dr = _line_params(seg); params = {"p0": p0.tolist(), "dir": dr.tolist()}
        elif kind == "arc":
            c, R = par; params = {"center": [float(c[0]), float(c[1])], "radius": float(R)}
        else:
            params = par
        p = Primitive(kind, i, j, params, _rms(S[i:j], seg))
        p.corner_in = i in cornerset
        prims.append(p)
    return Fit(closed=closed, samples=S, prims=prims, resid=S - C, width=_width(P, r, w, M))


def _segment(P: np.ndarray, pre: _Prefix, kappa: np.ndarray, s_arc: np.ndarray,
             closed: bool, w: float, env=None, breaks=None, turn=None):
    """Shortest-path partition of [0, M) into line/arc/clothoid spans by description length.

    Segment cost = geometric SSE + a fixed per-segment penalty (the description-length
    term that keeps a wobbly circle one arc); arcs pay a little more than lines so a
    straight run resolves to the cheaper primitive. A clothoid competes only where the
    curvature is convincingly LINEAR in arc length (an Euler spiral) -- so one clothoid
    beats a fan of arcs on the penalty -- and its geometry is integrated only then, keeping
    the DP fast."""
    M = len(P)
    # corner/baran force real corners to be breaks, so a smooth run needn't split for a bend -- raise
    # the split penalty there so a smooth run resolves to ONE arc instead of a fan of hugging lines.
    pen_scale = 2.0 if STRATEGY in ("rebuild", "css", "wtmm", "spline") else 4.0 if STRATEGY in ("corner", "baran") else 1.0
    pen = (SPLIT_PEN_W * w) ** 2 * MIN_SEG * pen_scale   # opening a new segment costs this SSE
    arc_extra = (ARC_EXTRA_W * w) ** 2 * MIN_SEG
    cl_extra = 2 * arc_extra                         # a clothoid carries one more parameter
    brk = np.zeros(M + 1, bool)                      # forced segment boundaries (real corners)
    kept = []                                        # keep them >= MIN_SEG apart and interior so every
    for b in sorted(set(breaks or [])):              # inter-break gap can still hold one segment
        if MIN_SEG <= b <= M - MIN_SEG and (not kept or b - kept[-1] >= MIN_SEG):
            kept.append(b)
    if kept:
        brk[np.asarray(kept, int)] = True
    brk_cum = np.cumsum(brk)                         # a segment [i,j) may not straddle a forced break

    def pen_at(i):                                    # baran: a break costs full on a smooth run, but
        if STRATEGY != "baran" or turn is None:       # nearly nothing where the curve genuinely turns
            return pen
        return pen * max(PEN_FLOOR, 1.0 - turn[i] / CORNER_ANGLE)

    # prefix sums for the O(1) linear regression kappa(s) ~ a + b s over any span
    def cs(v):
        return np.concatenate([[0.0], np.cumsum(v)])
    Sk, Ssk, Ss, Ss2, Sk2 = cs(kappa), cs(s_arc * kappa), cs(s_arc), cs(s_arc * s_arc), cs(kappa * kappa)

    def env_ok(i, j, c=None, R=None, cpts=None):
        """Would the arc (c,R) / clothoid (cpts) stay within the ink envelope? Samples ENV_K points
        so the whole check is O(1) per span rather than O(span)."""
        if env is None:
            return True
        if cpts is None:                                    # cheap skip: an arc within `tol` of its
            chord = math.hypot(P[j - 1, 0] - P[i, 0], P[j - 1, 1] - P[i, 1])   # own chord can't bow
            if R - math.sqrt(max(0.0, R * R - (chord / 2) ** 2)) <= env[1]:    # past a hugging line
                return True
        idx = np.linspace(i, j - 1, min(j - i, ENV_K)).round().astype(int)
        raw_K = P[idx]
        if cpts is None:
            cen = np.array(c); v = raw_K - cen; d = np.hypot(v[:, 0], v[:, 1]); d[d < 1e-9] = 1e-9
            curve_K = cen + R * v / d[:, None]
        else:
            curve_K = cpts[idx - i]
        p0, dr = _line_dir(pre, i, j)
        return not _bulges(curve_K, raw_K, p0, dr, env)

    def clothoid_cost(i, j):
        n = j - i
        if n < 2 * MIN_SEG:
            return None
        sk, ssk, ss, ss2, sk2 = Sk[j]-Sk[i], Ssk[j]-Ssk[i], Ss[j]-Ss[i], Ss2[j]-Ss2[i], Sk2[j]-Sk2[i]
        den = n * ss2 - ss * ss
        if abs(den) < 1e-9:
            return None
        b = (n * ssk - ss * sk) / den
        a = (sk - b * ss) / n
        var = sk2 - sk * sk / n                              # total curvature variance
        res = sk2 - a * sk - b * ssk                         # residual of the linear kappa fit
        sweep = abs(b) * (s_arc[j - 1] - s_arc[i])          # curvature change across the span (1/px)
        if sweep < CLOTHOID_MIN_DK / w or res > 0.35 * max(var, 1e-9):
            return None                                     # not convincingly a spiral
        k0 = a + b * s_arc[i]                                # curvature at the span start
        cpts, par = _clothoid(P[i:j], s_arc[i:j], k0, b)
        sse = float(np.sum((P[i:j] - cpts) ** 2))
        return sse + cl_extra, ("clothoid", par)

    line_tol2 = (LINE_TOL_W * w) ** 2                # rebuild: a span the line holds within this rms stays a
    step = float(s_arc[1] - s_arc[0]) if len(s_arc) > 1 else 1.0   # line; css/wtmm instead ask the multiscale
    min_sweep = math.radians(ARC_MIN_SWEEP)         # curvature whether the span SUSTAINS real turning
    def seg_cost(i, j):
        p = pen_at(i)
        lr = pre.line(i, j)
        cr, c, R = pre.circle(i, j)
        best = (lr + p, ("line", None))
        if STRATEGY == "rebuild":
            curved = lr > line_tol2 * (j - i)
        elif STRATEGY in ("css", "wtmm"):
            curved = abs(Sk[j] - Sk[i]) * step >= min_sweep
        else:
            curved = True
        if c is not None and cr + arc_extra < lr and curved:
            best = (cr + arc_extra + p, ("arc", (c, R)))
        cl = clothoid_cost(i, j)
        if cl is not None and cl[0] + p < best[0]:
            best = (cl[0] + p, cl[1])
        return best

    def line_partition(lo, hi):
        """Re-cover [lo, hi) with only lines (an arc that bulged past the ink is dropped for these)."""
        n = hi - lo
        if n < 2 * MIN_SEG:
            return [(lo, hi, ("line", None))]
        dl = [math.inf] * (n + 1); dl[0] = 0.0; bk = [0] * (n + 1)
        for b in range(MIN_SEG, n + 1):
            for a in range(0, b - MIN_SEG + 1):
                cost = dl[a] + pre.line(lo + a, lo + b) + pen
                if cost < dl[b]:
                    dl[b] = cost; bk[b] = a
        out, b = [], n
        while b > 0:
            a = bk[b]; out.append((lo + a, lo + b, ("line", None))); b = a
        return out[::-1]

    dp = np.full(M + 1, np.inf)
    back = [(-1, None)] * (M + 1)
    dp[0] = 0.0
    for j in range(MIN_SEG, M + 1):
        for i in range(0, j - MIN_SEG + 1):
            if not np.isfinite(dp[i]):
                continue
            if brk_cum[j - 1] - brk_cum[i] > 0:              # a forced corner lies strictly inside -> skip
                continue
            c, info = seg_cost(i, j)
            if dp[i] + c < dp[j]:
                dp[j] = dp[i] + c
                back[j] = (i, info)
    spans = []
    j = M
    while j > 0:
        i, info = back[j]
        spans.append((i, j, info))
        j = i
    spans = spans[::-1]
    if env is None:
        return spans
    fixed = []                                       # envelope test only the CHOSEN curves, not every
    for i, j, info in spans:                          # candidate -- a bulging arc/clothoid falls back to lines
        if info[0] == "arc":
            bad = not env_ok(i, j, c=info[1][0], R=info[1][1])
        elif info[0] == "clothoid":
            cpts, _ = _clothoid(P[i:j], s_arc[i:j], info[1]["k0"], info[1]["dk"])
            bad = not env_ok(i, j, cpts=cpts)
        else:
            bad = False
        fixed.extend(line_partition(i, j) if bad else [(i, j, info)])
    return fixed


# ---------------------------------------------------------------- primitive geometry

def _clean_line(seg, p0, dr):
    d = seg - p0
    t = d @ dr
    return p0 + np.outer(t, dr)


def _clean_arc(seg, c, R):
    c = np.asarray(c)
    v = seg - c
    n = np.hypot(v[:, 0], v[:, 1])
    n[n < 1e-9] = 1e-9
    return c + (v / n[:, None]) * R


def _line_params(seg):
    p0 = seg.mean(0)
    u, s, vt = np.linalg.svd(seg - p0, full_matrices=False)
    return p0, vt[0]                # centroid, principal direction


def _clothoid(seg, s, k0, dk):
    """Integrate the Euler spiral kappa(s)=k0+dk*s to a canonical shape, then rigidly
    (rotation + translation, Kabsch) align it onto the span's points -- so the residual is
    the honest geometric distance, not an artefact of where we anchored the integration."""
    u = s - s[0]
    phi = k0 * u + 0.5 * dk * u * u
    ds = np.gradient(s) if len(s) > 1 else np.array([1.0])
    Q = np.cumsum(np.column_stack([np.cos(phi), np.sin(phi)]) * ds[:, None], axis=0)
    qc, pc = Q.mean(0), seg.mean(0)
    H = (Q - qc).T @ (seg - pc)
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1.0, d]) @ U.T
    return (Q - qc) @ Rm.T + pc, {"k0": float(k0), "dk": float(dk)}


def _rms(a, b):
    return float(np.sqrt(np.mean(np.sum((a - b) ** 2, axis=1)))) if len(a) else 0.0


# ---------------------------------------------------------------- top level

def fit_curve(P: np.ndarray, w: float, closed: bool, r: np.ndarray | None = None, env=None, anchors=None) -> Fit | None:
    """Fit one polyline to primitives; returns a Fit (annotations) or None if too short. `anchors`
    are (x,y) points the fit must pass through exactly (a blob boundary's stroke-attachment points),
    so idealizing the boundary never pulls it away from a stroke that ends on it (the rebuild gap fix)."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S = resample(P, step, closed, w if STRATEGY == "spline" else 0.0)   # corner-preserving only on the spline path
    M = len(S)
    if M < 2:
        return None
    if M < MIN_SEG + 1:                                     # too short to segment: one straight line
        p0, dr = _line_params(S)
        cl = _clean_line(S, p0, dr)
        prim = Primitive("line", 0, M, {"p0": p0.tolist(), "dir": dr.tolist()}, _rms(S, cl))
        return Fit(closed=closed, samples=S, prims=[prim], resid=S - cl)
    if STRATEGY == "curvfit":                              # Option A: curvature-domain fit + integration
        return _fit_curvfit(S, P, w, step, closed, r, anchors)
    if STRATEGY == "spline":                               # local-support alternative: position-domain
        return _fit_spline(S, P, w, step, closed, r, anchors)  # smoothing spline, no integration drift
    s_arc = np.arange(M, dtype=float) * step
    # curvature in rad/px (turning-per-sample / step). baseline lightly gaussian-blurs it (blurs
    # corners too); the plan (sec 9) calls for a TV/L1 prior instead -- kills wobble, keeps steps.
    turn = _turning(S, closed)
    mode = "wrap" if closed else "nearest"
    ang = None
    anchor_ix = []
    if STRATEGY == "css":                                  # multiscale corner detectors: kappa is the
        breaks, kappa = _detect_css(turn, closed, w, step) # coarse-scale curvature they return, so the
    elif STRATEGY == "wtmm":                               # line/arc gate reads sustained (not local) turn
        breaks, kappa = _detect_wtmm(turn, closed, w, step)
    elif STRATEGY == "baseline":
        kappa = gaussian_filter1d(turn, KAPPA_SMOOTH, mode=mode) / step
        breaks = None
    else:                                                  # tv_kappa / corner / baran / rebuild
        kappa = denoise_tv_chambolle(turn, weight=TV_KAPPA_W * w * step) / step
        ang = _turn_window(S, closed, w, step) if STRATEGY in ("corner", "baran") else None
        breaks = _corners_v2(S, w, step, closed) if STRATEGY == "rebuild" else \
            (_corners(ang) if STRATEGY == "corner" else None)
    if STRATEGY in ("rebuild", "css", "wtmm"):
        for ax, ay in (anchors or []):                     # pin the boundary at each stroke attachment
            k = int(np.hypot(S[:, 0] - ax, S[:, 1] - ay).argmin())
            if MIN_SEG <= k <= M - MIN_SEG:
                anchor_ix.append(k)
        breaks = sorted(set(breaks or []) | set(anchor_ix))
    pre = _Prefix(S)
    spans = _segment(S, pre, kappa, s_arc, closed, w, env, breaks, ang)

    prims, cleaned = [], np.array(S, float)
    for i, j, info in spans:
        seg = S[i:j]
        kind, par = info
        if kind == "line":
            p0, dr = _line_params(seg)
            cl = _clean_line(seg, p0, dr)
            params = {"p0": p0.tolist(), "dir": dr.tolist()}
        elif kind == "arc":
            c, R = par
            cl = _clean_arc(seg, c, R)
            params = {"center": [float(c[0]), float(c[1])], "radius": float(R)}
        else:                                                  # clothoid: integrate k0 + dk*u
            cl, _ = _clothoid(seg, s_arc[i:j], par["k0"], par["dk"])
            params = par
        cleaned[i:j] = cl
        prims.append(Primitive(kind, i, j, params, _rms(seg, cl)))

    for k in range(1, len(prims)):                             # classify joins: corner vs smooth
        a, b = prims[k - 1], prims[k]
        t0 = cleaned[a.j - 1] - cleaned[max(a.i, a.j - 2)]
        t1 = cleaned[b.i + 1] - cleaned[b.i] if b.i + 1 < M else t0
        if np.hypot(*t0) > 1e-9 and np.hypot(*t1) > 1e-9:
            cos = np.clip(t0 @ t1 / (np.hypot(*t0) * np.hypot(*t1)), -1, 1)
            b.corner_in = np.degrees(np.arccos(cos)) > CORNER_DEG

    for k in anchor_ix:                                        # keep the boundary on its raw trace at
        lo, hi = max(0, k - 1), min(M, k + 2)                  # each attachment so the stroke stays joined
        cleaned[lo:hi] = S[lo:hi]

    width = None
    if r is not None and len(r) >= 2:
        s0 = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
        rr = np.interp(np.linspace(0, s0[-1], M), s0, np.asarray(r, float))
        width = denoise_tv_chambolle(rr, weight=TV_RADIUS * w)

    return Fit(closed=closed, samples=S, prims=prims, resid=S - cleaned, width=width)


def path_d(fit: Fit) -> str:
    """Emit the fitted primitives as a real SVG path (M8, §11): `L` for a line, an `A`
    arc command for an arc (large-arc/sweep read off the swept angle), sampled `L`s for a
    clothoid. One arc command replaces a whole sampled polyline -- the biggest size win
    after centerline strokes. Crisp geometry only; the charm layer samples instead."""
    S = fit.samples                                            # the endpoints sit on the graph
    cl = S - fit.resid                                         # nodes -- anchor the render to them
    M = len(cl)
    out = ["M%.1f %.1f" % (S[0, 0], S[0, 1])]                  # start at the true endpoint (node)
    for k, p in enumerate(fit.prims):
        last = k == len(fit.prims) - 1
        end = (S[0] if fit.closed else S[-1]) if last else cl[min(p.j - 1, M - 1)]
        if p.kind == "line":
            out.append("L%.1f %.1f" % (end[0], end[1]))
        elif p.kind == "arc":
            c, r = p.params["center"], p.params["radius"]
            seg = cl[p.i:p.j]
            ang = np.unwrap(np.arctan2(seg[:, 1] - c[1], seg[:, 0] - c[0]))
            delta = ang[-1] - ang[0]
            out.append("A%.1f %.1f 0 %d %d %.1f %.1f"
                       % (r, r, 1 if abs(delta) > np.pi else 0, 1 if delta > 0 else 0, end[0], end[1]))
        else:                                                  # clothoid: sample, end anchored
            for q in cl[p.i + 1:p.j - 1]:
                out.append("L%.1f %.1f" % (q[0], q[1]))
            out.append("L%.1f %.1f" % (end[0], end[1]))
    if fit.closed:
        out.append("Z")
    return "".join(out)


def reconstruct(fit: Fit, alpha: float = 0.0) -> np.ndarray:
    """Idealized polyline = cleaned primitives + a tunable fraction `alpha` of the residual
    (0 = crisp, 1 = the original hand). Closed curves return with the wrap point repeated."""
    out = fit.samples - (1.0 - alpha) * fit.resid
    if not fit.closed:                                         # anchor endpoints on the graph nodes
        out[0], out[-1] = fit.samples[0], fit.samples[-1]      # so adjacent strokes still meet
    return np.vstack([out, out[:1]]) if fit.closed else out


def fit_graph(g, w: float, ink_mask=None) -> None:
    """Annotate every stroke edge and blob boundary (+holes) with its primitive fit (§9).
    Uniform across strokes and fills; raw geometry is left untouched. When `ink_mask` is given,
    an arc that would bow more than ENVELOPE_TOL_W*w outside the ink is not offered -- the fit
    keeps a hugging line/split instead, so idealization never bulges the shape past the drawn ink."""
    env = (distance_transform_edt(~ink_mask), ENVELOPE_TOL_W * w) if ink_mask is not None else None
    for e in g.edges.values():
        f = fit_curve(e.pts, w, closed=False, r=getattr(e, "r", None), env=env)
        if f is not None:
            e.ann["fit"] = f
    sid2edge = {e.sid: e for e in g.edges.values()}
    for nd in g.nodes.values():
        if nd.boundary is not None and len(nd.boundary) >= 3:
            anchors = _blob_anchors(nd, sid2edge, w) if STRATEGY in ("rebuild", "css", "wtmm", "curvfit", "spline") else None
            fb = fit_curve(nd.boundary, w, closed=True, env=env, anchors=anchors)
            if fb is not None:
                nd.ann["fit"] = fb
            hf = [fit_curve(h, w, closed=True, env=env) for h in nd.ann.get("holes", []) if len(h) >= 3]
            nd.ann["fit_holes"] = [h for h in hf if h is not None]


def _blob_anchors(nd, sid2edge, w: float) -> list:
    """The (x,y) points where strokes end on this blob's boundary -- an attached edge's endpoint that
    lands within ~1.5w of the boundary. The boundary fit is pinned there so it can't drift off the
    stroke when idealized (the cross-element gap fix)."""
    B = np.asarray(nd.boundary, float)
    out = []
    for sid in nd.ann.get("edges", []):
        e = sid2edge.get(sid)
        if e is None:
            continue
        p = np.asarray(e.pts, float)
        for end in (p[0], p[-1]):
            if np.hypot(B[:, 0] - end[0], B[:, 1] - end[1]).min() < 1.5 * w:
                out.append((float(end[0]), float(end[1])))
    return out
