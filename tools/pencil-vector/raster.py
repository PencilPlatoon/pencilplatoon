"""Render-side rasterization -- turn an emitted SVG path `d` back into a pixel mask.

Geometry-space checks (does reconstruct(fit) have the right area?) miss RENDER bugs: an `A`
arc command with a wrong large-arc/sweep flag draws the arc the wrong way and self-intersects
the fill, even though the sampled geometry was fine. To catch that we must rasterize the
ACTUAL output -- arc commands and all -- and check coverage + connectivity. This module parses
M/L/A/Z (circular arcs, no rotation, which is all svgdump emits) and fills with the even-odd
rule (so holes subtract), matching how a browser draws it."""
from __future__ import annotations

import re

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


def _arc_points(p0, p1, r, large, sweep):
    """SVG endpoint -> center parameterization for a circular arc, then sample it (spec §B.2.4)."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    xp, yp = (p0 - p1) / 2.0
    scale = (xp * xp + yp * yp) / (r * r)
    if scale > 1:
        r *= np.sqrt(scale)
    den = r * r * yp * yp + r * r * xp * xp
    num = max(0.0, r * r * r * r - den)
    coef = (0.0 if den == 0 else np.sqrt(num / den)) * (-1 if large == sweep else 1)
    cxp, cyp = coef * yp, -coef * xp
    c = np.array([cxp + (p0[0] + p1[0]) / 2, cyp + (p0[1] + p1[1]) / 2])
    a0 = np.arctan2((yp - cyp) / r, (xp - cxp) / r)
    a1 = np.arctan2((-yp - cyp) / r, (-xp - cxp) / r)
    da = a1 - a0
    if sweep == 0 and da > 0:
        da -= 2 * np.pi
    if sweep == 1 and da < 0:
        da += 2 * np.pi
    n = max(2, int(abs(da) / 0.2))
    return [c + r * np.array([np.cos(a0 + da * t / n), np.sin(a0 + da * t / n)]) for t in range(1, n + 1)]


def subpaths(d: str):
    """Parse an `M/L/A/Z` path into a list of closed point-lists (arcs sampled to points)."""
    cur = None
    sub, out = [], []
    for cmd, arg in re.findall(r"([MLAZ])([^MLAZ]*)", d):
        nums = [float(x) for x in re.findall(r"-?\d+\.?\d*", arg)]
        if cmd == "M":
            if sub:
                out.append(sub)
            cur = (nums[0], nums[1])
            sub = [cur]
        elif cmd == "L":
            cur = (nums[0], nums[1])
            sub.append(cur)
        elif cmd == "A":
            end = (nums[5], nums[6])
            sub += [tuple(p) for p in _arc_points(cur, end, nums[0], int(nums[3]), int(nums[4]))]
            cur = end
        elif cmd == "Z" and sub:
            out.append(sub)
            sub = []
    if sub:
        out.append(sub)
    return out


def fill_mask(d: str, pad: int = 2):
    """Rasterize a filled path (even-odd, so holes subtract). Returns (mask, x0, y0)."""
    subs = subpaths(d)
    pts = np.array([p for s in subs for p in s])
    x0, y0 = int(pts[:, 0].min()) - pad, int(pts[:, 1].min()) - pad
    w, h = int(pts[:, 0].max()) - x0 + pad, int(pts[:, 1].max()) - y0 + pad
    m = np.zeros((h, w), bool)
    for s in subs:
        if len(s) < 3:
            continue
        im = Image.new("L", (w, h), 0)
        ImageDraw.Draw(im).polygon([(x - x0, y - y0) for x, y in s], fill=255)
        m ^= np.asarray(im) > 0                       # even-odd
    return m, x0, y0


def is_intact(d: str, want_area: float, min_frac: float = 0.9) -> bool:
    """A filled path is intact if it rasterizes to ONE connected piece covering at least
    `min_frac` of the intended area -- i.e. the arc commands didn't self-intersect or split it."""
    m, _, _ = fill_mask(d)
    if not m.any():
        return False
    return ndimage.label(m)[1] == 1 and m.sum() >= min_frac * want_area


def edge_px(e, h: int, w_img: int):
    """A frozen edge centerline clipped to integer (row, col) index arrays, or None if empty."""
    if e is None or e.pts is None or len(e.pts) == 0:
        return None
    return (np.clip(e.pts[:, 1].astype(int), 0, h - 1),
            np.clip(e.pts[:, 0].astype(int), 0, w_img - 1))


def attachment_gaps(d: str, edges, esid, h: int, w_img: int) -> dict:
    """For each edge sid in `edges`, the min distance (px) from its frozen centerline to the fill
    rasterized from path `d` (absent from the result if the edge has no points). Probed on a window
    spanning the fill and all probe points: the EDT runs off a small crop but returns distances
    identical to a full-frame EDT, since the window contains the whole fill (hence every nearest-fill
    pixel). One probe shared by the idealize GUARD (vectorize) and the post-hoc VERIFIER
    (broken_attachments) -- both must measure attachment the same way (§12)."""
    fm, fx0, fy0 = fill_mask(d)
    probes = [(sid, edge_px(esid.get(sid), h, w_img)) for sid in edges]
    probes = [(sid, p) for sid, p in probes if p is not None]
    if not fm.any() or not probes:
        return {sid: float("inf") for sid, _ in probes}
    fh, fw = fm.shape
    ys = [fy0, fy0 + fh - 1]; xs = [fx0, fx0 + fw - 1]   # fill bbox straight off its crop -- no where()
    for _, (pr, pc) in probes:
        ys += [int(pr.min()), int(pr.max())]; xs += [int(pc.min()), int(pc.max())]
    y0, y1 = max(0, min(ys) - 1), min(h, max(ys) + 2)
    x0, x1 = max(0, min(xs) - 1), min(w_img, max(xs) + 2)
    win = np.zeros((y1 - y0, x1 - x0), bool)
    _blit(win, fm, fx0 - x0, fy0 - y0)
    dt = ndimage.distance_transform_edt(~win)
    return {sid: float(dt[pr - y0, pc - x0].min()) for sid, (pr, pc) in probes}


def _blit(full, m, x0, y0):
    h_f, w_f = full.shape
    h_m, w_m = m.shape
    a0, b0 = max(0, x0), max(0, y0)
    a1, b1 = min(w_f, x0 + w_m), min(h_f, y0 + h_m)
    if a1 > a0 and b1 > b0:
        full[b0:b1, a0:a1] |= m[b0 - y0:b1 - y0, a0 - x0:a1 - x0]


def broken_attachments(g, primitives: bool = True):
    """Verify no edge<->blob attachment recorded from the ink (graph.py §6.3) was BROKEN by
    idealization/emission. Piece-counting is blind to a local gap when the two elements stay
    connected the long way round (a detour) -- exactly how cannon 2/26 slipped through: the
    idealized boundary receded off edge 26, but the drawing stayed one piece via the barrel.

    An absolute 'is the stroke near the fill' test is the wrong bar: the ink itself draws some
    strokes ending a pen or more from a blob, and both the stroke and the boundary idealize at
    the fit stage, so the two shift together. What matters is the REGRESSION the idealization introduced.
    So compare at the same render config: for each blob, measure each attached stroke's gap to the fill it
    ACTUALLY renders vs the gap to its stashed traced edge (`ann['traced']`, the ink-faithful
    boundary). A contact the traced edge held within a half-pen but the rendered edge does not
    is a break. Contact is probed with the stroke's frozen centerline `pts` (never idealized), so
    the measure is identical with or without primitives -- only the boundary moves. Returns a list of
    (blob_id, edge_sid, gap_px)."""
    from model import BLOB
    from svgdump import _d, blob_d
    w_img, h = g.size
    reach = 0.5 * g.w
    esid = {e.sid: e for e in g.edges.values()}
    broken = []
    for nd in g.nodes.values():
        if nd.kind != BLOB or nd.boundary is None or len(nd.boundary) < 3:
            continue
        traced = nd.ann.get("traced")
        if traced is None:                            # never idealized -> nothing could have broken
            continue
        edges = nd.ann.get("edges", [])
        cur = attachment_gaps(blob_d(nd, 0.0, primitives), edges, esid, h, w_img)   # rendered edge
        tr = attachment_gaps(_d(traced, close=True), edges, esid, h, w_img)          # ink-faithful edge
        for sid, gap in cur.items():
            if gap > reach >= tr[sid]:                # held within a half-pen when traced, not now -> break
                broken.append((nd.id, sid, round(gap, 1)))
    return broken


def render_mask(g, primitives: bool = True, charm: float = 0.0, color=None):
    """Rasterize the emitted render -- filled fills + strokes at pen width, arc commands and
    all -- the way a browser draws it, so coverage and connectivity can be checked on the
    ACTUAL output. Pass `color` to rasterize only that colour's elements (§12)."""
    from model import BLOB
    from svgdump import _curve_d, blob_d
    w_img, h = g.size
    sw = max(1, int(round(g.w)))
    full = np.zeros((h, w_img), bool)
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            if color is None or nd.ann.get("color", 0) == color:
                m, x0, y0 = fill_mask(blob_d(nd, charm, primitives))
                _blit(full, m, x0, y0)
    for e in g.edges.values():
        if color is not None and e.ann.get("color", 0) != color:
            continue
        for s in subpaths(_curve_d(e.ann, e.pts, False, charm, primitives)):
            if len(s) < 2:
                continue
            im = Image.new("L", (w_img, h), 0)
            dr = ImageDraw.Draw(im)
            dr.line([(float(x), float(y)) for x, y in s], fill=255, width=sw, joint="curve")
            r = sw / 2.0                                    # round pen caps: svgdump emits stroke-linecap=round,
            for qx, qy in (s[0], s[-1]):                    # so the ends are disks, not the butt caps PIL draws
                dr.ellipse([qx - r, qy - r, qx + r, qy + r], fill=255)
            full |= np.asarray(im) > 0
    return full


_N8 = np.ones((3, 3))


def connectivity(g, ink, primitives: bool = True):
    """Verify the render preserves the ink's connectivity, PER COLOUR (different colours are
    meant to be separate entities, so only same-colour splits are bugs). For each colour, the
    rendered pieces must not exceed the ink pieces. Returns a list of
    (colour, render_pieces, ink_pieces, coverage) and the worst split = max(render - ink)."""
    labels = ink.labels if ink.labels is not None else np.where(ink.mask, 0, -1)
    rows = []
    for c in range(len(ink.palette)):
        ink_c = labels == c
        if not ink_c.any():
            continue
        r = render_mask(g, primitives=primitives, color=c)
        rc = ndimage.label(r, structure=_N8)[1]
        ic = ndimage.label(ink_c, structure=_N8)[1]
        cov = float((r & ink_c).sum()) / max(1, int(ink_c.sum()))
        rows.append((c, rc, ic, cov))
    worst = max((rc - ic for _, rc, ic, _ in rows), default=0)
    return rows, worst
