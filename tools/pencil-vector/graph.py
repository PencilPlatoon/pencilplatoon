"""Stage 2-3 (M1 subset) -- skeleton and naive graph construction (plan §6.2-6.3).

M1 is deliberately naive: thin the whole mask, find nodes where the skeleton's
degree != 2, and trace the degree-2 runs between them into junction-to-junction
edges. Width classification (blobs vs strokes), continuity pairing, and stable
IDs arrive in later milestones; this just gets a graph end-to-end.

IDs here are traversal-order and therefore NOT yet stable across re-runs -- that
is M3's job (§7), and is called out so nothing downstream leans on them early.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

from ink import Ink
from model import ENDPOINT, JUNCTION, Edge, Graph, Node

# 8-connectivity for skeleton pixel adjacency
_N8 = np.ones((3, 3), dtype=int)


def _degree(skel: np.ndarray) -> np.ndarray:
    """Neighbor count for each skeleton pixel (0 off-skeleton)."""
    neigh = ndimage.convolve(skel.astype(int), _N8, mode="constant") - skel
    return np.where(skel, neigh, 0)


def _trace_run(start, came_from, skel, node_at):
    """Walk a degree-2 corridor from a pixel adjacent to a node until the next
    node pixel, returning the ordered pixel list (exclusive of both nodes)."""
    run = []
    y, x = start
    py, px = came_from
    while True:
        run.append((y, x))
        nxt = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ny, nx = y + dy, x + dx
                if (ny, nx) == (py, px):
                    continue
                if 0 <= ny < skel.shape[0] and 0 <= nx < skel.shape[1] and skel[ny, nx]:
                    if node_at[ny, nx] >= 0:
                        return run, (ny, nx)          # hit the next node
                    nxt = (ny, nx)
        if nxt is None:
            return run, None                          # dangling (shouldn't happen)
        py, px = y, x
        y, x = nxt


def build(ink: Ink, mask: np.ndarray | None = None) -> Graph:
    # `mask` defaults to all ink (M1). M2 passes the thin (stroke-only) mask so
    # blob interiors aren't skeletonized into centerlines (§6.2).
    skel = skeletonize(ink.mask if mask is None else mask)
    deg = _degree(skel)

    # Cluster the non-corridor pixels (endpoints deg==1, junctions deg>=3) into
    # nodes by connectivity, so a fat junction of several touching pixels is ONE
    # node rather than several (§6.3, "collapse valence-2 nodes").
    node_px = skel & (deg != 2)
    lab, n = ndimage.label(node_px, structure=_N8)
    node_at = np.full(skel.shape, -1, dtype=int)      # pixel -> node id (or -1)
    node_at[lab > 0] = lab[lab > 0] - 1

    # group node pixels by label in ONE pass -- was np.where(lab == nid+1) per node, an O(image)
    # scan repeated 2n times (once here, once in the edge trace); on the supersampled masks that
    # scan dominated build. Node pixels (deg != 2) are few, so this pass is cheap.
    npx_ys: list[list[int]] = [[] for _ in range(n)]
    npx_xs: list[list[int]] = [[] for _ in range(n)]
    nys, nxs = np.where(node_px)
    for y, x in zip(nys.tolist(), nxs.tolist()):
        L = int(lab[y, x]) - 1
        npx_ys[L].append(y); npx_xs[L].append(x)

    nodes: dict[int, Node] = {}
    for nid in range(n):
        ys, xs = np.asarray(npx_ys[nid]), np.asarray(npx_xs[nid])
        maxdeg = deg[ys, xs].max()
        kind = ENDPOINT if maxdeg == 1 else JUNCTION
        nodes[nid] = Node(id=nid, kind=kind, pos=(float(xs.mean()), float(ys.mean())))

    # Trace one edge out of each corridor pixel adjacent to a node.
    edges: dict[int, Edge] = {}
    seen: set = set()
    eid = 0
    for nid in range(n):
        for y, x in zip(npx_ys[nid], npx_xs[nid]):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < skel.shape[0] and 0 <= nx < skel.shape[1]):
                        continue
                    if not skel[ny, nx] or node_at[ny, nx] >= 0:
                        continue
                    if (ny, nx) in seen:
                        continue
                    run, end = _trace_run((ny, nx), (y, x), skel, node_at)
                    for p in run:
                        seen.add(p)
                    if end is None:
                        continue
                    b = node_at[end]
                    px_path = [(x, y)] + [(rx, ry) for ry, rx in run] + [
                        (float(nodes[b].pos[0]), float(nodes[b].pos[1]))]
                    pts = np.array(px_path, dtype=float)
                    r = ink.dist[np.clip(pts[:, 1].astype(int), 0, skel.shape[0] - 1),
                                 np.clip(pts[:, 0].astype(int), 0, skel.shape[1] - 1)]
                    edges[eid] = Edge(id=eid, a=nid, b=int(b), pts=pts, r=r.astype(float))
                    eid += 1

    h, w_img = skel.shape
    return Graph(nodes=nodes, edges=edges, w=ink.w, size=(w_img, h), scale=ink.scale)


# ---- Contact-aware skeleton + the w/2 endpoint discipline (§6.2, revised) --------------------------
# The old M2 skeleton was skeletonize(ink - blobs): it treats a stroke->fill contact as a WALL, so the
# medial axis HOOKS where a stroke is cut against a solid, and forks at every rounded end. Instead
# skeletonize the FULL ink and drop only the fill interiors, so the axis runs THROUGH each contact;
# then apply one w/2 endpoint rule, symmetric about a half pen, entirely here (not as later cleanups).

EDGE_TOL = 0.75         # px: discretization slack on the w/2 edge margin
EDGE_CAP_W = 1.0        # w: max free-end retraction. A ragged pen cap / fork prong is short and gets
                        # trimmed (it stops at the pen-wide body first anyway); a stroke thinner than the
                        # pen along its whole length keeps everything past this, so it isn't consumed whole.
MERGE_THR = 1.4         # w: collapse a junction-junction stub shorter than this (the skeletonizer 'H')


def _neigh(sk: np.ndarray) -> np.ndarray:
    """8-neighbour count per pixel (self excluded)."""
    return ndimage.convolve(sk.astype(int), _N8, mode="constant") - sk


def _edge_prune(skel: np.ndarray, dt: np.ndarray, thr: float, protect: np.ndarray,
                cap_len: float | None = None) -> np.ndarray:
    """Retract the skeleton from its FREE endpoints while they sit closer than `thr` to the ink edge:
    eat degree<=1 tips one pixel at a time, stopping at the first pixel with dt >= thr. Free-end caps
    and fork prongs (which run toward the edge) are trimmed; a mid-stroke thin spot (never an endpoint)
    is preserved, so a stroke is never severed. Tips inside `protect` (the fill contact band) are a
    contact, not a free end -- they are left, so a stroke that meets a fill keeps its contact.

    `cap_len` bounds the retraction per free end (in px): a ragged cap or prong is short and stops at
    the pen-wide body well within it, but a stroke that is thinner than the pen along its WHOLE length
    (no body to stop on) keeps everything past `cap_len` instead of being consumed entirely. None =
    unbounded (the original behaviour)."""
    sk = skel.copy()
    erodable = (dt < thr) & ~protect
    # Incremental leaf-peel: keep an 8-neighbour count and only revisit a pixel when a neighbour is
    # removed (one convolution up front, then O(1) per removed pixel). Each worklist entry carries how
    # many pixels have been eaten from its free end, so the cap can stop a run without a full re-scan.
    deg = ndimage.convolve(sk.astype(int), _N8, mode="constant") - sk
    H, W = sk.shape
    ys, xs = np.where(sk & erodable & (deg <= 1))
    stack = [(int(y), int(x), 0) for y, x in zip(ys, xs)]
    while stack:
        y, x, d = stack.pop()
        if not sk[y, x] or not erodable[y, x] or deg[y, x] > 1 or (cap_len is not None and d > cap_len):
            continue                                    # gone / not a leaf / retracted a full cap-length
        sk[y, x] = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy or dx:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and sk[ny, nx]:
                        deg[ny, nx] -= 1
                        if erodable[ny, nx] and deg[ny, nx] <= 1:
                            stack.append((ny, nx, d + 1))
    return sk


def _drop_short_free_branches(skel: np.ndarray, protect: np.ndarray, minlen: float) -> np.ndarray:
    """Drop a leaf branch (free endpoint to its junction) shorter than `minlen` -- a leftover fork
    stub, below pen resolution, never emitted as a stroke. Branches touching `protect` (a fill) are
    kept regardless of length. Iterated: dropping one stub can expose the next."""
    sk = skel.copy()
    changed = True
    while changed:
        changed = False
        nb = _neigh(sk)
        endpt = sk & (nb == 1)
        branches = sk & ~(sk & (nb >= 3))               # split at junctions into simple paths
        lbl, n = ndimage.label(branches, structure=_N8)
        for i in range(1, n + 1):
            comp = lbl == i
            if (comp & endpt).any() and not (comp & protect).any() and int(comp.sum()) < minlen:
                sk &= ~comp
                changed = True
    return sk


def _skel_back(sk: np.ndarray, y: int, x: int, span: int):
    """Walk `span` pixels back along the skeleton from endpoint (y,x) for a stable outgoing direction."""
    prev, cur = (y, x), (y, x)
    for _ in range(span):
        nxt = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == 0 and dx == 0:
                    continue
                ny, nx = cur[0] + dy, cur[1] + dx
                if 0 <= ny < sk.shape[0] and 0 <= nx < sk.shape[1] and sk[ny, nx] and (ny, nx) != prev:
                    nxt = (ny, nx)
                    break
            if nxt:
                break
        if nxt is None:
            break
        prev, cur = cur, nxt
    return cur


def _extend_contacts(skel: np.ndarray, blob_union: np.ndarray, w: float) -> np.ndarray:
    """The inverse of the free-end retraction, at the same stage: a skeleton end that runs into a fill
    along its own axis is drawn on to w/2 PAST where it enters -- so the rear of its round pen cap
    clears the fill boundary (a free end was pulled BACK w/2; a contact end is pushed FORWARD w/2)."""
    sk = skel.copy()
    band = ndimage.binary_dilation(blob_union, iterations=max(1, int(round(w / 2.0))))
    H, Wd = sk.shape
    for y, x in np.argwhere(sk & (_neigh(sk) <= 1) & band):
        by, bx = _skel_back(sk, int(y), int(x), 4)
        dy, dx = y - by, x - bx
        nrm = float(np.hypot(dy, dx))
        if nrm == 0:
            continue
        dy, dx = dy / nrm, dx / nrm
        entry = next((t for t in np.arange(0.0, 1.5 * w, 0.5)
                      if 0 <= int(round(y + dy * t)) < H and 0 <= int(round(x + dx * t)) < Wd
                      and blob_union[int(round(y + dy * t)), int(round(x + dx * t))]), None)
        if entry is None:                               # axis doesn't run into a fill -> a real free end
            continue
        for t in np.arange(0.5, entry + w / 2.0 + 0.01, 0.5):
            yy, xx = int(round(y + dy * t)), int(round(x + dx * t))
            if 0 <= yy < H and 0 <= xx < Wd:
                sk[yy, xx] = True
    return sk


def contact_skeleton(mask: np.ndarray, blob_union: np.ndarray, w: float) -> np.ndarray:
    """The M2+ stroke skeleton: contact-aware, with the whole w/2 endpoint discipline baked in.
    Skeletonize the FULL ink and drop the fill interiors (axis runs through contacts, no hooks); then,
    about a half pen: prune free ends back w/2 and eat their fork prongs, drop sub-pen leaf stubs, and
    extend fill contacts w/2 into the fill. The w/2 band around each fill is protected from the prune
    and the drop, so a stroke's neck into a fill is never severed."""
    band = ndimage.binary_dilation(blob_union, iterations=max(1, int(round(w / 2.0))))
    dt = ndimage.distance_transform_edt(mask)
    skel = skeletonize(mask) & ~blob_union
    skel = _edge_prune(skel, dt, w / 2.0 - EDGE_TOL, band, cap_len=round(EDGE_CAP_W * w))
    skel = _drop_short_free_branches(skel, band, w)
    skel = _extend_contacts(skel, blob_union, w)
    return skel


def merge_close_junctions(g: Graph, w: float) -> Graph:
    """Collapse the skeletonizer's 'H': two deg>=3 nodes joined by a sub-MERGE_THR stub become one node
    at their midpoint (stub deleted, its neighbours re-pointed). This is the only junction cleanup the
    contact-aware skeleton needs -- the blunt-end forks the old skeleton made at fills are gone."""
    from model import BLOB
    changed = True
    while changed:
        changed = False
        deg: dict = {}
        for e in g.edges.values():
            deg[e.a] = deg.get(e.a, 0) + 1
            deg[e.b] = deg.get(e.b, 0) + 1
        for eid, e in list(g.edges.items()):
            if (e.a != e.b and e.length < MERGE_THR * w and deg.get(e.a, 0) >= 3 and deg.get(e.b, 0) >= 3
                    and e.a in g.nodes and e.b in g.nodes
                    and g.nodes[e.a].kind != BLOB and g.nodes[e.b].kind != BLOB):
                a, b = e.a, e.b
                mid = ((g.nodes[a].pos[0] + g.nodes[b].pos[0]) / 2.0,
                       (g.nodes[a].pos[1] + g.nodes[b].pos[1]) / 2.0)
                g.nodes[a].pos = mid
                del g.edges[eid]
                for e2 in g.edges.values():
                    if e2.a == b:
                        e2.a = a; e2.pts[0] = np.array(mid, float)
                    if e2.b == b:
                        e2.b = a; e2.pts[-1] = np.array(mid, float)
                g.nodes.pop(b, None)
                changed = True
                break
    return g


def _dir_from(e: Edge, jpos: np.ndarray, span: int = 6) -> np.ndarray:
    """Unit direction of edge `e` leaving the endpoint nearest `jpos`, averaged
    over ~`span` px so a couple of noisy pixels don't swing the angle."""
    p = e.pts
    if np.hypot(*(p[0] - jpos)) <= np.hypot(*(p[-1] - jpos)):
        a, b = p[0], p[min(len(p) - 1, span)]
    else:
        a, b = p[-1], p[max(0, len(p) - 1 - span)]
    v = b - a
    n = float(np.hypot(*v))
    return v / n if n > 0 else v


def _runs_into_blob(free_end, out_dir, blob_masks, w) -> bool:
    """Does the stroke ATTACH to a blob at this end -- i.e. if you keep going
    past the free end, do you land inside a blob (not in an empty concave notch)?
    This is the edge->blob incidence the topology needs: a stroke ending on a
    blob is connected to it, not dangling (§2.1, §6.3)."""
    for k in (0.5, 1.0, 1.5):
        p = free_end + out_dir * k * w
        xi, yi = int(round(p[0])), int(round(p[1]))
        for m in blob_masks:
            if 0 <= yi < m.shape[0] and 0 <= xi < m.shape[1] and m[yi, xi]:
                return True
    return False


OVERLAP_FRAC = 0.6      # a stroke lying this fraction within ~1w of a blob is part of it


def _edge_touches_blob(e: Edge, mask, near, w) -> bool:
    """A stroke is connected to a blob if its end runs *into* the blob, or if it
    lies *along/over* it -- most of the stroke within ~1w of the blob (§6.3).
    Endpoint-only misses outline strokes that run beside the fill."""
    p = e.pts
    for end, inner in [(p[0], p[min(len(p) - 1, 4)]), (p[-1], p[max(0, len(p) - 5)])]:
        end = np.asarray(end, float)
        out = end - np.asarray(inner, float)
        n = float(np.hypot(*out))
        if n > 0 and _runs_into_blob(end, out / n, [mask], w):
            return True
    xi = np.clip(p[:, 0].astype(int), 0, near.shape[1] - 1)
    yi = np.clip(p[:, 1].astype(int), 0, near.shape[0] - 1)
    return float(near[yi, xi].mean()) > OVERLAP_FRAC


CONT_MAX_TURN = 60.0    # deg: two edges are one stroke through a junction if the bend
                        # from straight-through is under this (a T-stem turns ~90, an X-cross ~90)


def resolve_continuity(g: Graph) -> Graph:
    """Junction resolution (Stage 4, §6.4): at each junction pair the edges that
    continue smoothly through it -- a stroke passing through -- greedily by the
    straightest continuation (Noris 'reverse drawing'). An edge that has no
    smooth partner is a T-termination. Records the partner sid per (edge, node)
    on `edge.ann['cont']` so flood can follow a stroke through a junction without
    leaking across a crossing."""
    inc = defaultdict(list)
    for e in g.edges.values():
        inc[e.a].append(e)
        inc[e.b].append(e)
    for nid, edges in inc.items():
        if len(edges) < 3:
            continue                        # degree<3: no real junction to resolve
        pos = np.array(g.nodes[nid].pos, float)
        d = {e.id: _dir_from(e, pos) for e in edges}    # direction leaving the node
        pairs = []
        for i in range(len(edges)):
            for j in range(i + 1, len(edges)):
                cos = float(np.clip(np.dot(d[edges[i].id], d[edges[j].id]), -1, 1))
                turn = 180.0 - math.degrees(math.acos(cos))   # 0 = dead straight through
                pairs.append((turn, edges[i], edges[j]))
        pairs.sort(key=lambda p: p[0])
        used = set()
        for turn, ea, eb in pairs:
            if turn > CONT_MAX_TURN:
                break
            if ea.id in used or eb.id in used:
                continue
            used.update((ea.id, eb.id))
            ea.ann.setdefault("cont", {})[nid] = eb.sid
            eb.ann.setdefault("cont", {})[nid] = ea.sid
    return g


def attach_edges_to_blobs(g: Graph, blob_masks: dict) -> Graph:
    """Record edge<->blob incidence (§6.3): a stroke connected to a blob (running
    into it, or lying along it) is stored on the blob's `ann['edges']` and the
    blob sid on the edge's `ann['blobs']`, so flood can traverse the blob as a
    connectivity hub. `blob_masks` maps blob node id -> mask."""
    for nid, mask in blob_masks.items():
        nb = g.nodes[nid]
        near = ndimage.binary_dilation(mask, iterations=max(1, int(round(g.w))))
        attached = []
        for e in g.edges.values():
            if _edge_touches_blob(e, mask, near, g.w):
                attached.append(e.sid)
                e.ann.setdefault("blobs", [])
                if nb.sid not in e.ann["blobs"]:
                    e.ann["blobs"].append(nb.sid)
        nb.ann["edges"] = attached
    return g


STUB_LEN = 3.0          # w: only a SHORT edge is rim fray -- a long tangent stroke is not a stub
STUB_NEAR = 1.5         # w: "near the rim" band, dilated out from the blob
STUB_HUG = 0.6          # a stub HUGS the rim if this fraction of it lies within the near band (so it
                        # runs ALONG the edge); a radial stroke has only its tip near -> kept


def absorb_rim_stubs(g: Graph, blob_masks: dict, ink_mask, w: float) -> Graph:
    """Fold rim stubs into the blob they fray off of (§6.3, the bumpy-rim artifact).

    A blob's boundary is re-traced from its ink, but the skeleton often leaves a few SHORT edges
    running ALONG the rim just outside the fill -- fragments of the blob's own edge that width
    detection and ring-removal didn't reach. Rendered at pen width, each stub's round-capped end
    bulges past the smooth ink edge, so a fill that should read as one clean outline comes out with
    a rim of bumps. The stub's ink IS the blob's edge, so absorb it: grow the blob to swallow the
    stub's ink (clamped to the real ink, so nothing overshoots the drawn edge), re-trace the OUTER
    boundary (interior holes are untouched -- they're not on the rim), and drop the edge.

    A stub is short AND rim-hugging (most of its length within STUB_NEAR*w of the blob). That keeps
    a radial stroke *ending* at the blob (only its tip is near) and a long stroke running tangent to
    it (length gate) as strokes. Same-colour only, so a coloured detail over a black fill isn't lost."""
    from PIL import Image, ImageDraw
    from skimage.measure import approximate_polygon, find_contours

    from ink import MIN_HOLE_W2
    from model import BLOB
    from widthclass import POLY_TOL_W, _boundaries

    ink_holes = ndimage.binary_fill_holes(ink_mask) & ~ink_mask   # holes the pen left open in the drawing
    sw = max(1, int(round(w)))
    removed: set = set()
    for nid, mask in list(blob_masks.items()):
        bcol = g.nodes[nid].ann.get("color", 0)
        near = ndimage.binary_dilation(mask, iterations=max(1, int(round(STUB_NEAR * w))))
        stubs = []
        for e in g.edges.values():
            if e.id in removed or e.length > STUB_LEN * w or e.ann.get("color", 0) != bcol:
                continue
            xi = np.clip(e.pts[:, 0].astype(int), 0, near.shape[1] - 1)
            yi = np.clip(e.pts[:, 1].astype(int), 0, near.shape[0] - 1)
            if float(near[yi, xi].mean()) >= STUB_HUG:
                stubs.append(e)
        if not stubs:
            continue
        im = Image.new("L", (mask.shape[1], mask.shape[0]), 0)
        d = ImageDraw.Draw(im)
        for e in stubs:                                   # reconstruct each stub's ink at pen width
            pts = [(float(x), float(y)) for x, y in e.pts]
            if len(pts) >= 2:
                d.line(pts, fill=255, width=sw, joint="curve")
            for q in (pts[0], pts[-1]):
                d.ellipse([q[0] - sw / 2, q[1] - sw / 2, q[0] + sw / 2, q[1] + sw / 2], fill=255)
        grown = ndimage.binary_closing(mask | ((np.asarray(im) > 0) & ink_mask), iterations=1)
        outer, _ = _boundaries(grown, w)
        if outer is None:
            continue
        # growing + re-tracing can span a hole the pen left open; add every such hole back so the
        # absorb never fills one shut (the existing interior holes ride on ann['holes'] untouched).
        im2 = Image.new("1", (mask.shape[1], mask.shape[0]), 0)
        ImageDraw.Draw(im2).polygon([(float(x), float(y)) for x, y in outer], fill=1)
        holes = list(g.nodes[nid].ann.get("holes", []))
        seen = [np.asarray(h).mean(0) for h in holes]
        hlab, hn = ndimage.label(ink_holes & np.asarray(im2, bool))
        for k in range(1, hn + 1):
            comp = hlab == k
            if comp.sum() < MIN_HOLE_W2 * w * w:
                continue
            ys, xs = np.where(comp); cen = np.array([xs.mean(), ys.mean()])
            if any(np.hypot(*(cen - s)) < w for s in seen):
                continue
            cs = find_contours(comp.astype(float), 0.5)
            if cs:
                hp = approximate_polygon(max(cs, key=len), POLY_TOL_W * w)
                if len(hp) >= 3:
                    holes.append(np.column_stack([hp[:, 1], hp[:, 0]]))
        g.nodes[nid].boundary = outer
        g.nodes[nid].ann["holes"] = holes
        blob_masks[nid] = grown
        removed.update(e.id for e in stubs)

    for eid in removed:
        g.edges.pop(eid, None)
    used = {e.a for e in g.edges.values()} | {e.b for e in g.edges.values()}
    for nid in [n for n, nd in g.nodes.items() if n not in used and nd.kind != BLOB]:
        del g.nodes[nid]
    return g
