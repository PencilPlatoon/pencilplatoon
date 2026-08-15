"""Export the graph as an SVG (plan §12, §11 complexity note 1).

Each stroke edge becomes one centerline `<path>` at stroke-width `w`; each blob a
filled `<path>` -- the topology graph stays literally visible in the SVG.

The markup is an interactive hover-to-identify structure: every component is a
`<g class="seg" data-num="N">` wrapping a `<g class="vis">` (what you see), a wide
transparent `.hit` area (so thin strokes are easy to hover), and a `.corner`
number bubble shown on hover. A trailing `<g class="nums">` overlays a numbered
bubble on each component for the element-number toggle. `data-sid` carries the
stable id (freeze-topology) for reference.
"""
from __future__ import annotations

from fit import path_d, reconstruct
from model import BLOB, Graph

STROKE = "#111"
CHARM = 0.0             # fraction of the fitted residual to reapply as wobble (§9/§11):
                        # 0 = crisp idealized geometry, 1 = the original hand. The fitted render is crisp.
HIT_W = 2.8             # wide invisible hit stroke, in units of w
NODE_FILL = {"endpoint": "#2a7", "junction": "#e8402f", "blob": "#39f"}


def _d(pts, close: bool = False) -> str:
    head = "M%.1f %.1f" % (pts[0][0], pts[0][1])
    rest = "".join("L%.1f %.1f" % (x, y) for x, y in pts[1:])
    return head + rest + (" Z" if close else "")


def _sid(el) -> str:
    return ' data-sid="%s"' % el.sid if el.sid else ""


def _color(el, g) -> str:
    """The element's idealized palette colour (§5), or pencil-black if uncoloured."""
    c = el.ann.get("color", 0)
    rgb = g.palette[c] if c < len(g.palette) else (17, 17, 17)
    return "#%02x%02x%02x" % (int(rgb[0]), int(rgb[1]), int(rgb[2]))


def _curve_d(ann, raw, closed, charm, primitives):
    """The `d` for one fitted curve. With a geometry fit and `primitives` on, emit the
    primitives in as real `A`/`L` commands; without them sample the fit; with no fit trace the raw
    polyline. `charm` > 0 forces sampling (a perturbed arc is no longer an arc)."""
    fit = ann.get("fit")
    if fit is not None:
        if primitives and charm == 0.0:
            return path_d(fit)
        return _d(reconstruct(fit, charm), close=closed)
    return _d(raw, close=closed) if raw is not None and len(raw) >= (3 if closed else 2) else None


def blob_d(nd, charm: float, primitives: bool) -> str:
    """The `d` for a fill: real arc/line commands when `primitives` on (fit_ok), else the idealized/traced polygon."""
    if primitives and charm == 0.0 and nd.ann.get("fit_ok"):
        d = path_d(nd.ann["fit"])
        for hf in nd.ann.get("fit_holes", []):
            d += " " + path_d(hf)
        return d
    d = _d(nd.boundary, close=True)
    for hole in nd.ann.get("holes", []):
        if len(hole) >= 3:
            d += " " + _d(hole, close=True)
    return d


def dump(g: Graph, show_nodes: bool = False, charm: float = CHARM, primitives: bool = False) -> str:
    w_img, h = g.size
    sw = max(1.0, g.w)
    hitw = HIT_W * sw

    # (cx, cy, vis, hit) in draw order: blobs first (filled, behind), then strokes.
    # Node order keeps numbering stable; holes are cut out with the evenodd rule (§6.2).
    comps = []
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            if primitives and charm == 0.0 and nd.ann.get("fit_ok"):
                d = path_d(nd.ann["fit"])                    # primitives: emit the fill's edge as real arc/line commands
                for hf in nd.ann.get("fit_holes", []):
                    d += " " + path_d(hf)
            else:                                            # sampled / fallback: idealized polygon
                d = _d(nd.boundary, close=True)
                for hole in nd.ann.get("holes", []):
                    if len(hole) >= 3:
                        d += " " + _d(hole, close=True)
            vis = '<path data-blob="%d"%s d="%s" fill="%s" fill-rule="evenodd"/>' % (nd.id, _sid(nd), d, _color(nd, g))
            hit = '<path class="hit" d="%s" fill="transparent" fill-rule="evenodd"/>' % d
            comps.append((nd.pos[0], nd.pos[1], vis, hit))
    for e in g.edges.values():
        d = _curve_d(e.ann, e.pts, False, charm, primitives)
        vis = ('<path data-edge="%d"%s d="%s" fill="none" stroke="%s" stroke-width="%.2f" '
               'stroke-linecap="round" stroke-linejoin="round"/>' % (e.id, _sid(e), d, _color(e, g), sw))
        hit = ('<path class="hit" d="%s" fill="none" stroke="transparent" '
               'stroke-width="%.1f" stroke-linecap="round"/>' % (d, hitw))
        cx = float(e.pts[:, 0].mean())
        cy = float(e.pts[:, 1].mean())
        comps.append((cx, cy, vis, hit))

    # width/height give the SVG an intrinsic size, so it still sizes when a
    # container has no fixed height (e.g. the comparison page's zoom view).
    out = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
           % (w_img, h, w_img, h)]

    cr = sw * 2.6                           # corner number bubble (fixed top-left, on hover)
    cx0 = cy0 = cr + sw
    for n, (_, _, vis, hit) in enumerate(comps, 1):
        corner = ('<g class="corner"><circle cx="%.1f" cy="%.1f" r="%.1f" fill="#e8402f"/>'
                  '<text x="%.1f" y="%.1f" font-size="%.1f" fill="#fff" text-anchor="middle" '
                  'dominant-baseline="central" font-family="system-ui,sans-serif" '
                  'font-weight="700">%d</text></g>' % (cx0, cy0, cr, cx0, cy0, cr * 1.15, n))
        out.append('<g class="seg" data-num="%d"><g class="vis">%s</g>%s%s</g>'
                   % (n, vis, hit, corner))

    br = sw * 1.4                            # numbered-bubble overlay (element-number toggle)
    fs = sw * 1.8
    out.append('<g class="nums" font-family="system-ui,sans-serif" font-weight="700">')
    for n, (cx, cy, _, _) in enumerate(comps, 1):
        out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#e8402f" stroke="#fff" '
                   'stroke-width="%.1f"/>' % (cx, cy, br, sw * 0.3))
        out.append('<text x="%.1f" y="%.1f" font-size="%.1f" fill="#fff" text-anchor="middle" '
                   'dominant-baseline="central">%d</text>' % (cx, cy, fs, n))
    out.append("</g>")

    if show_nodes:                          # debug overlay of node kinds
        out.append("<g>")
        for nd in g.nodes.values():
            out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                       % (nd.pos[0], nd.pos[1], sw * (0.9 if nd.kind == BLOB else 0.7),
                          NODE_FILL[nd.kind]))
        out.append("</g>")

    out.append("</svg>")
    return "".join(out)
