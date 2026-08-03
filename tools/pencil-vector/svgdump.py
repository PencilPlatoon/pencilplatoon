"""M1 export -- dump the graph as an SVG (plan §12, §11 complexity note 1).

Every collapsed graph edge becomes exactly one `<path>` drawn as a centerline
at stroke-width `w` with round caps -- the topology graph stays literally
visible in the SVG. This is the ugly-but-end-to-end M1 output; role-specific
export (static / rigged / collider) is M8.
"""
from __future__ import annotations

from model import BLOB, Graph

STROKE = "#111"
NODE_FILL = {"endpoint": "#2a7", "junction": "#e8402f", "blob": "#39f"}


def _d(pts, close: bool = False) -> str:
    head = "M%.1f %.1f" % (pts[0][0], pts[0][1])
    rest = "".join("L%.1f %.1f" % (x, y) for x, y in pts[1:])
    return head + rest + (" Z" if close else "")


def dump(g: Graph, show_nodes: bool = False) -> str:
    w_img, h = g.size
    sw = max(1.0, g.w)
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d">' % (w_img, h)]

    def sid(el):
        return ' data-sid="%s"' % el.sid if el.sid else ""

    # blobs first (filled), so strokes meeting them draw on top
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            out.append('<path data-blob="%d"%s d="%s" fill="%s"/>'
                       % (nd.id, sid(nd), _d(nd.boundary, close=True), STROKE))

    out.append('<g fill="none" stroke="%s" stroke-width="%.2f" '
               'stroke-linecap="round" stroke-linejoin="round">' % (STROKE, sw))
    for e in g.edges.values():
        out.append('<path data-edge="%d"%s d="%s"/>' % (e.id, sid(e), _d(e.pts)))
    out.append("</g>")

    if show_nodes:
        out.append("<g>")
        for nd in g.nodes.values():
            x, y = nd.pos
            out.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'
                       % (x, y, sw * (0.9 if nd.kind == BLOB else 0.7), NODE_FILL[nd.kind]))
        out.append("</g>")

    out.append("</svg>")
    return "".join(out)
