"""Export the graph as an SVG (plan §12, §11 complexity note 1).

Each stroke edge becomes one centerline `<path>` at stroke-width `w`; each blob a
filled `<path>` -- the topology graph stays literally visible in the SVG.

The markup mirrors the `scan-to-svg` hybrid's interactive structure so the
comparison page's shared CSS drives it: every component is a
`<g class="seg" data-num="N">` wrapping a `<g class="vis">` (what you see), a wide
transparent `.hit` area (so thin strokes are easy to hover), and a `.corner`
number bubble shown on hover. A trailing `<g class="nums">` overlays a numbered
bubble on each component for the element-number toggle. `data-sid` carries the
stable id (M3) for reference.
"""
from __future__ import annotations

from model import BLOB, Graph

STROKE = "#111"
HIT_W = 2.8             # wide invisible hit stroke, in units of w
NODE_FILL = {"endpoint": "#2a7", "junction": "#e8402f", "blob": "#39f"}


def _d(pts, close: bool = False) -> str:
    head = "M%.1f %.1f" % (pts[0][0], pts[0][1])
    rest = "".join("L%.1f %.1f" % (x, y) for x, y in pts[1:])
    return head + rest + (" Z" if close else "")


def _sid(el) -> str:
    return ' data-sid="%s"' % el.sid if el.sid else ""


def dump(g: Graph, show_nodes: bool = False) -> str:
    w_img, h = g.size
    sw = max(1.0, g.w)
    hitw = HIT_W * sw

    # (cx, cy, vis, hit) in draw order: blobs first (filled, behind), then strokes.
    # Node order keeps numbering stable; holes are cut out with the evenodd rule (§6.2).
    comps = []
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            d = _d(nd.boundary, close=True)
            for hole in nd.ann.get("holes", []):
                if len(hole) >= 3:
                    d += " " + _d(hole, close=True)
            vis = '<path data-blob="%d"%s d="%s" fill="%s" fill-rule="evenodd"/>' % (nd.id, _sid(nd), d, STROKE)
            hit = '<path class="hit" d="%s" fill="transparent" fill-rule="evenodd"/>' % d
            comps.append((nd.pos[0], nd.pos[1], vis, hit))
    for e in g.edges.values():
        d = _d(e.pts)
        vis = ('<path data-edge="%d"%s d="%s" fill="none" stroke="%s" stroke-width="%.2f" '
               'stroke-linecap="round" stroke-linejoin="round"/>' % (e.id, _sid(e), d, STROKE, sw))
        hit = ('<path class="hit" d="%s" fill="none" stroke="transparent" '
               'stroke-width="%.1f" stroke-linecap="round"/>' % (d, hitw))
        cx = float(e.pts[:, 0].mean())
        cy = float(e.pts[:, 1].mean())
        comps.append((cx, cy, vis, hit))

    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">' % (w_img, h)]

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
