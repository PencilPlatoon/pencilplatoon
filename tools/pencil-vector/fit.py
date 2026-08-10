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

def resample(P: np.ndarray, step: float, closed: bool) -> np.ndarray:
    """Arc-length-uniform resample of a polyline (deduped). Closed curves repeat no endpoint."""
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
    n = max(2, int(round(total / step)))
    su = np.linspace(0, total, n + 1 if closed else n)
    out = np.column_stack([np.interp(su, s, P[:, 0]), np.interp(su, s, P[:, 1])])
    return out[:-1] if closed else out       # drop the duplicated wrap sample


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


def _segment(P: np.ndarray, pre: _Prefix, kappa: np.ndarray, s_arc: np.ndarray,
             closed: bool, w: float, env=None):
    """Shortest-path partition of [0, M) into line/arc/clothoid spans by description length.

    Segment cost = geometric SSE + a fixed per-segment penalty (the description-length
    term that keeps a wobbly circle one arc); arcs pay a little more than lines so a
    straight run resolves to the cheaper primitive. A clothoid competes only where the
    curvature is convincingly LINEAR in arc length (an Euler spiral) -- so one clothoid
    beats a fan of arcs on the penalty -- and its geometry is integrated only then, keeping
    the DP fast."""
    M = len(P)
    pen = (SPLIT_PEN_W * w) ** 2 * MIN_SEG          # opening a new segment costs this SSE
    arc_extra = (ARC_EXTRA_W * w) ** 2 * MIN_SEG
    cl_extra = 2 * arc_extra                         # a clothoid carries one more parameter

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

    def seg_cost(i, j):
        lr = pre.line(i, j)
        cr, c, R = pre.circle(i, j)
        best = (lr + pen, ("line", None))
        if c is not None and cr + arc_extra < best[0] - pen:
            best = (cr + arc_extra + pen, ("arc", (c, R)))
        cl = clothoid_cost(i, j)
        if cl is not None and cl[0] + pen < best[0]:
            best = (cl[0] + pen, cl[1])
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

def fit_curve(P: np.ndarray, w: float, closed: bool, r: np.ndarray | None = None, env=None) -> Fit | None:
    """Fit one polyline to primitives; returns a Fit (annotations) or None if too short."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S = resample(P, step, closed)
    M = len(S)
    if M < 2:
        return None
    if M < MIN_SEG + 1:                                     # too short to segment: one straight line
        p0, dr = _line_params(S)
        cl = _clean_line(S, p0, dr)
        prim = Primitive("line", 0, M, {"p0": p0.tolist(), "dir": dr.tolist()}, _rms(S, cl))
        return Fit(closed=closed, samples=S, prims=[prim], resid=S - cl)
    s_arc = np.arange(M, dtype=float) * step
    # curvature in rad/px (turning-per-sample / step), lightly denoised so the clothoid test
    # sees the trend, not the wobble
    kappa = gaussian_filter1d(_turning(S, closed), KAPPA_SMOOTH,
                              mode="wrap" if closed else "nearest") / step
    pre = _Prefix(S)
    spans = _segment(S, pre, kappa, s_arc, closed, w, env)

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
    for nd in g.nodes.values():
        if nd.boundary is not None and len(nd.boundary) >= 3:
            fb = fit_curve(nd.boundary, w, closed=True, env=env)
            if fb is not None:
                nd.ann["fit"] = fb
            hf = [fit_curve(h, w, closed=True, env=env) for h in nd.ann.get("holes", []) if len(h) >= 3]
            nd.ann["fit_holes"] = [h for h in hf if h is not None]
