"""Geometry fitting (plan §9).

Idealize each traced polyline -- stroke centerlines AND blob boundaries alike, the
one uniform step the earlier stages defer -- so a wobbly-but-straight line reads as a line, an
intended circle as one arc, and a corner stays a corner. Smoothing x/y naively would kill
corners along with wobble; the fit keeps them as knots where it is free to bend.

Pipeline per curve:
  1. corner-preserving resample to ~uniform arc length (small sharp features kept as knots),
  2. a smoothing spline on x(s), y(s) with a curvature penalty that is DROPPED at corners and
     stroke attachments -- wobble is removed with no drift; corners and joins stay sharp,
  3. segment the smoothed curve into primitives -- line, arc, corner -- as a shortest path over
     candidate spans, chosen by description length (so a distorted circle becomes ONE arc, not
     forty segments),
  4. record {kind, params, residual} as ANNOTATIONS; the raw points are never replaced.

The residual (each sample's signed normal offset from its primitive) is kept so a tunable
fraction can be reapplied as a style layer -- compact geometry and the hand, independently
controllable (§11 wobble/charm)."""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

RESAMPLE_W = 0.5        # resample step, in units of w
MIN_STEP = 1.5          # ...but never finer than this many px
SPLIT_PEN_W = 0.35      # per-segment description-length penalty, as (SPLIT_PEN_W*w)^2 of SSE
ARC_EXTRA_W = 0.15      # an arc costs this much (in the same SSE units) more than a line
MIN_SEG = 4             # a primitive spans at least this many samples
# corner detector: arclength-weighted local-turn peaks + apex localization. Tuned on hand labels
# (recall ~0.90, position median ~0.5px). See _corners.
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

SPLINE_LAMBDA = 5.0      # spline: weight of the position-domain curvature-smoothing penalty (local support)


@dataclass
class Primitive:
    kind: str                       # 'line' | 'arc'
    i: int                          # [i, j] sample span on the resampled curve
    j: int
    params: dict                    # line: {p0,dir}; arc: {center,radius}
    residual: float                 # RMS geometric residual (px)
    corner_in: bool = False         # a C0 break precedes this primitive


@dataclass
class Fit:
    closed: bool
    samples: np.ndarray             # (M,2) the resampled curve the fit was measured on
    prims: list = field(default_factory=list)
    resid: np.ndarray | None = None # (M,2) per-sample offset (samples - cleaned), for charm


# ---------------------------------------------------------------- resample / turning

def _arclen(P: np.ndarray, closed: bool):
    """Deduped polyline and its cumulative arc length. Returns (P, s); s is None if the curve is degenerate."""
    P = np.asarray(P, float)
    if closed and (len(P) < 2 or not np.allclose(P[0], P[-1])):
        P = np.vstack([P, P[:1]])
    P = P[np.concatenate([[True], np.hypot(*np.diff(P, axis=0).T) > 1e-9])]
    if len(P) < 2:
        return P, None
    return P, np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])


def _interp_at(P: np.ndarray, s: np.ndarray, su: np.ndarray, closed: bool) -> np.ndarray:
    out = np.column_stack([np.interp(su, s, P[:, 0]), np.interp(su, s, P[:, 1])])
    return out[:-1] if closed else out                       # a closed curve repeats no endpoint


def resample_corners(P: np.ndarray, step: float, closed: bool, w: float):
    """Corner-preserving resample for the spline fit, returning BOTH the samples and the corners on them so the
    caller never re-detects. A small sharp feature (< ~2w) whose vertices miss the uniform samples gets chorded
    away before detection sees it; so detect on a finer resample and insert the ones the uniform pass missed.
    Uniform samples stay put -- well-localized corners keep their position. Returns (S, corners: list[int])."""
    P, s = _arclen(P, closed)
    if s is None:
        return P, []
    total = s[-1]
    n = max(2, int(round(total / step)))
    su_u = np.linspace(0, total, n + 1 if closed else n)
    Su = _interp_at(P, s, su_u, closed)
    if len(Su) < MIN_SEG + 1:                                 # too short to segment -- fit_curve one-lines it
        return Su, []
    fstep = max(MIN_STEP, CORNER_FINE_W * w)                  # finer resample where detection is reliable
    suf = np.linspace(0, total, max(2, int(round(total / fstep))) + (1 if closed else 0))
    Sf = _interp_at(P, s, suf, closed)
    fine = _corners(Sf, w, fstep, closed) if len(Sf) >= 6 else []
    std = _corners(Su, w, step, closed)                    # corners the uniform pass gets == the cornerset if no inserts
    if not fine:
        return Su, std
    std_pts = [Su[c] for c in std]
    extra = [float(suf[c]) for c in fine                      # ...keep only the small features the uniform pass missed
             if not std_pts or min(math.hypot(*(Sf[c] - q)) for q in std_pts) > w]
    if not extra:
        return Su, std
    core = (su_u[:-1] if closed else su_u).tolist()
    su2 = sorted(set(core) | set(extra))
    S = _interp_at(P, s, np.array(su2 + [total]) if closed else np.array(su2), closed)
    return S, _corners(S, w, step, closed)                 # detect on the densified samples (what _fit_spline used to)


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

def _at(p: int, dirn: int, s: int, closed: bool, M: int):
    """The s-th index from p in direction dirn (+-1); None once it runs past the end of an open curve."""
    k = p + dirn * s
    if not closed and (k < 0 or k >= M):
        return None
    return k % M


def _wdir(S: np.ndarray, p: int, dirn: int, piv, tau: float, closed: bool, M: int) -> np.ndarray:
    """Arclength-weighted principal direction of the side leaving p (dirn=+-1), oriented outward from piv.
    Weight decays exp(-arclength/tau), so nearby samples dominate and a boundary that curls back near the
    corner can't hijack the fit. Fits a line THROUGH piv (2nd moment about piv); returns its unit direction."""
    a = b = c = rx = ry = arc = 0.0
    prev = S[p % M]
    for s in range(400):
        k = _at(p, dirn, s, closed, M)
        if k is None:
            break
        cur = S[k]; vx, vy = cur[0] - piv[0], cur[1] - piv[1]
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
    """Indices within `half` arc length of i on both sides (i itself included)."""
    out = [i % M]
    for dirn in (-1, 1):
        acc, prev, s = 0.0, i % M, 1
        while acc < half:
            k = _at(i, dirn, s, closed, M)
            if k is None:
                break
            acc += math.hypot(*(S[k] - S[prev])); out.append(k); prev = k; s += 1
    return out


def _apex(S: np.ndarray, i: int, dl: np.ndarray, dr: np.ndarray, w: float, closed: bool, M: int) -> int:
    """The corner vertex = the sample sticking out furthest along the bisector -(dl+dr) within +-CORNER_APEX_W."""
    bx, by = -(dl[0] + dr[0]), -(dl[1] + dr[1]); nb = math.hypot(bx, by)
    if nb < 1e-6:
        return i
    bx, by = bx / nb, by / nb
    return max(_win_arc(S, i, closed, M, CORNER_APEX_W * w), key=lambda k: float(S[k][0] * bx + S[k][1] * by))


def _is_turn_peak(S: np.ndarray, theta: np.ndarray, i: int, nms: int, w: float, closed: bool, M: int) -> bool:
    """Whether sample i is a corner: sharp enough (>= ACCEPT), the local turn maximum, sustained at the coarse
    scale (not per-sample noise), and -- in the [ACCEPT, STRONG) ambiguity band -- a concentrated kink (short-
    scale turn ~ long-scale turn), which an arc is not."""
    if theta[i] < CORNER_ACCEPT:
        return False
    wnd = [theta[k % M] for k in range(i - nms, i + nms + 1)] if closed else \
          [theta[k] for k in range(max(0, i - nms), min(M, i + nms + 1))]
    if theta[i] < max(wnd) - 1e-9:                        # keep only the local-max sample of the turn peak
        return False
    thl = _turn_wt(S, i, CORNER_KINK_LW * w, closed, M)[0]
    if thl < CORNER_SUSTAIN:                              # not sustained at the coarse scale -> per-sample noise
        return False
    if theta[i] < CORNER_STRONG:                          # ambiguity band: demand a concentrated kink
        ths = _turn_wt(S, i, CORNER_KINK_SW * w, closed, M)[0]
        return ths / max(thl, 1e-6) >= CORNER_KINK_MIN
    return True


def _corners(S: np.ndarray, w: float, step: float, closed: bool) -> list:
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
    cand = [(_apex(S, i, DL[i], DR[i], w, closed, M), theta[i])
            for i in range(M) if _is_turn_peak(S, theta, i, nms, w, closed, M)]
    out = []
    for j, th in sorted(cand, key=lambda t: -t[1]):       # strongest first; drop near-duplicate vertices
        if all(math.hypot(*(S[j] - S[k])) >= CORNER_DEDUP_W * w for k in out):
            out.append(j)
    out.sort()
    return out if closed else [i for i in out if CORNER_END_MARGIN <= i <= M - 1 - CORNER_END_MARGIN]


def _nearest_index(S, ax, ay):
    """Index of the resample sample closest to an anchor point (ax, ay)."""
    return int(np.hypot(S[:, 0] - ax, S[:, 1] - ay).argmin())


def _pin(C, S, k):
    """Overwrite C at k+-1 with the raw samples S, so an anchored point stays exactly on the trace."""
    lo, hi = max(0, k - 1), min(len(S), k + 2)
    C[lo:hi] = S[lo:hi]


def _fit_spline(S: np.ndarray, P: np.ndarray, w: float, closed: bool, r, anchors, cornerset):
    """Local-support alternative to curv-fit. Instead of integrating kappa (global support -> the drift
    accumulates over arc length), fit x(s), y(s) DIRECTLY with a corner-aware curvature-smoothing penalty
    -- a discrete smoothing spline. Every point is pulled by its OWN sample (data term) and only coupled
    to immediate neighbours (2nd-difference penalty); the inverse of that banded system has exponentially
    decaying entries, so a control point's influence dies with distance (the Bezier/B-spline property) and
    wobble is removed with NO error accumulation. Corners are knots where the penalty is dropped, so they
    stay sharp. Primitives (line/arc) are then classified off the smoothed curve for output."""
    M = len(S)
    cornerset = set(cornerset)                            # detected once in resample_corners; reused, not recomputed
    anchor_ix = []
    for ax, ay in (anchors or []):                        # blob attachments: pin exactly, never smooth across
        k = _nearest_index(S, ax, ay)
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
        _pin(C, S, k)

    # classify the smoothed curve into primitives; geometry rendered stays C (resid = S - C), so joins are
    # as smooth as C itself -- the primitives are labels + params, not a re-fit that could reintroduce kinks.
    # The break for an anchor goes one sample AFTER it, so the piece ENDS on the pinned sample: path_d draws
    # each piece to C[j-1], so this lands the rendered vertex exactly on the attachment (the boundary touches
    # the stroke; a break at the anchor itself would leave the pinned point mid-piece, where a line/arc chord
    # can bow off it).
    seg_breaks = sorted(cornerset | {(k + 1) % M for k in anchor_ix})
    pre = _Prefix(C)
    spans = _segment(C, pre, w, seg_breaks)
    prims = []
    for i, j, (kind, par) in spans:
        seg = C[i:j]
        if kind == "line":
            p0, dr = _line_params(seg); params = {"p0": p0.tolist(), "dir": dr.tolist()}
        else:                                             # arc
            c, R = par; params = {"center": [float(c[0]), float(c[1])], "radius": float(R)}
        p = Primitive(kind, i, j, params, _rms(S[i:j], seg))
        p.corner_in = i in cornerset
        prims.append(p)
    return Fit(closed=closed, samples=S, prims=prims, resid=S - C)


def _segment(P: np.ndarray, pre: _Prefix, w: float, breaks):
    """Shortest-path partition of [0, M) into line/arc spans by description length.

    Segment cost = geometric SSE + a fixed per-segment penalty (the description-length term that keeps a
    wobbly circle one arc); arcs pay a little more than lines so a straight run resolves to the cheaper
    primitive."""
    M = len(P)
    pen = (SPLIT_PEN_W * w) ** 2 * MIN_SEG * 2.0     # opening a new segment costs this SSE
    arc_extra = (ARC_EXTRA_W * w) ** 2 * MIN_SEG
    brk = np.zeros(M + 1, bool)                      # forced segment boundaries (real corners)
    kept = []                                        # keep them >= MIN_SEG apart and interior so every
    for b in sorted(set(breaks or [])):              # inter-break gap can still hold one segment
        if MIN_SEG <= b <= M - MIN_SEG and (not kept or b - kept[-1] >= MIN_SEG):
            kept.append(b)
    if kept:
        brk[np.asarray(kept, int)] = True
    brk_cum = np.cumsum(brk)                         # a segment [i,j) may not straddle a forced break

    def seg_cost(i, j):
        lr = pre.line(i, j)
        cr, c, R = pre.circle(i, j)
        best = (lr + pen, ("line", None))
        if c is not None and cr + arc_extra < lr:
            best = (cr + arc_extra + pen, ("arc", (c, R)))
        return best

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
    return spans[::-1]


def _clean_line(seg, p0, dr):
    d = seg - p0
    t = d @ dr
    return p0 + np.outer(t, dr)


def _line_params(seg):
    p0 = seg.mean(0)
    u, s, vt = np.linalg.svd(seg - p0, full_matrices=False)
    return p0, vt[0]                # centroid, principal direction


def _rms(a, b):
    return float(np.sqrt(np.mean(np.sum((a - b) ** 2, axis=1)))) if len(a) else 0.0


# ---------------------------------------------------------------- top level

def fit_curve(P: np.ndarray, w: float, closed: bool, r: np.ndarray | None = None, anchors=None) -> Fit | None:
    """Fit one polyline to primitives; returns a Fit (annotations) or None if too short. `anchors`
    are (x,y) points the fit must pass through exactly (a blob boundary's stroke-attachment points),
    so idealizing the boundary never pulls it away from a stroke that ends on it (the cross-element gap fix)."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S, corners = resample_corners(P, step, closed, w)      # corner-preserving samples + their corners, once
    M = len(S)
    if M < 2:
        return None
    if M < MIN_SEG + 1:                                     # too short to segment: one straight line
        p0, dr = _line_params(S)
        cl = _clean_line(S, p0, dr)
        prim = Primitive("line", 0, M, {"p0": p0.tolist(), "dir": dr.tolist()}, _rms(S, cl))
        return Fit(closed=closed, samples=S, prims=[prim], resid=S - cl)
    return _fit_spline(S, P, w, closed, r, anchors, corners)  # smoothing spline, no integration drift


def path_d(fit: Fit) -> str:
    """Emit the fitted primitives as a real SVG path (§11): `L` for a line, an `A`
    arc command for an arc (large-arc/sweep read off the swept angle). One arc command
    replaces a whole sampled polyline -- the biggest size win after centerline strokes.
    Crisp geometry only; the charm layer samples instead."""
    S = fit.samples                                            # the endpoints sit on the graph
    cl = S - fit.resid                                         # nodes -- anchor the render to them
    M = len(cl)
    out = ["M%.1f %.1f" % (S[0, 0], S[0, 1])]                  # start at the true endpoint (node)
    for k, p in enumerate(fit.prims):
        last = k == len(fit.prims) - 1
        end = (S[0] if fit.closed else S[-1]) if last else cl[min(p.j - 1, M - 1)]
        if p.kind == "line":
            out.append("L%.1f %.1f" % (end[0], end[1]))
        else:                                                  # arc
            c, r = p.params["center"], p.params["radius"]
            seg = cl[p.i:p.j]
            ang = np.unwrap(np.arctan2(seg[:, 1] - c[1], seg[:, 0] - c[0]))
            delta = ang[-1] - ang[0]
            out.append("A%.1f %.1f 0 %d %d %.1f %.1f"
                       % (r, r, 1 if abs(delta) > np.pi else 0, 1 if delta > 0 else 0, end[0], end[1]))
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


def fit_graph(g, w: float) -> None:
    """Annotate every stroke edge and blob boundary (+holes) with its primitive fit (§9).
    Uniform across strokes and fills; raw geometry is left untouched."""
    for e in g.edges.values():
        f = fit_curve(e.pts, w, closed=False, r=getattr(e, "r", None))
        if f is not None:
            e.ann["fit"] = f
    sid2edge = {e.sid: e for e in g.edges.values()}
    for nd in g.nodes.values():
        if nd.boundary is not None and len(nd.boundary) >= 3:
            anchors = _blob_anchors(nd, sid2edge, w)
            fb = fit_curve(nd.boundary, w, closed=True, anchors=anchors)
            if fb is not None:
                nd.ann["fit"] = fb
            hf = [fit_curve(h, w, closed=True) for h in nd.ann.get("holes", []) if len(h) >= 3]
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
