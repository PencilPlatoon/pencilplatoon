"""Skeleton and graph construction (plan §6.2-6.3).

Skeletonization is deliberately naive: thin the whole mask, find nodes where the skeleton's
degree != 2, and trace the degree-2 runs between them into junction-to-junction
edges. Width classification (blobs vs strokes), continuity pairing, and stable
IDs arrive in later stages; this just gets a graph end-to-end.

IDs here are traversal-order and therefore NOT yet stable across re-runs -- that
is the freeze-topology stage's job (§7), and is called out so nothing downstream leans on them early.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np
from scipy import ndimage
from skimage.morphology import skeletonize

from geom import NEIGHBORS_8, in_bounds
from ink import Ink
from model import BLOB, ENDPOINT, JUNCTION, Edge, Graph, Node
from widthclass import bbox_slice, windowed_dilation

# 8-connectivity for skeleton pixel adjacency
_N8 = np.ones((3, 3), dtype=int)


def neighbour_count(sk: np.ndarray) -> np.ndarray:
    """8-neighbour count per pixel, self excluded (0 where off-mask is irrelevant -- callers
    mask by `sk` where needed). Shared with growth.py via `GR.neighbour_count`."""
    return ndimage.convolve(sk.astype(int), _N8, mode="constant") - sk


def _degree(skel: np.ndarray) -> np.ndarray:
    """Neighbor count for each skeleton pixel (0 off-skeleton)."""
    return np.where(skel, neighbour_count(skel), 0)


def _trace_run(start, came_from, skel, node_at):
    """Walk a degree-2 corridor from a pixel adjacent to a node until the next
    node pixel, returning the ordered pixel list (exclusive of both nodes)."""
    run = []
    y, x = start
    py, px = came_from
    while True:
        run.append((y, x))
        nxt = None
        for dy, dx in NEIGHBORS_8:
            ny, nx = y + dy, x + dx
            if (ny, nx) == (py, px):
                continue
            if in_bounds(ny, nx, skel.shape) and skel[ny, nx]:
                if node_at[ny, nx] >= 0:
                    return run, (ny, nx)              # hit the next node
                nxt = (ny, nx)
        if nxt is None:
            return run, None                          # dangling (shouldn't happen)
        py, px = y, x
        y, x = nxt


def build(ink: Ink, mask: np.ndarray | None = None) -> Graph:
    # `mask` defaults to all ink (the naive skeleton). Element identification passes the thin
    # (stroke-only) mask so blob interiors aren't skeletonized into centerlines (§6.2).
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
            for dy, dx in NEIGHBORS_8:
                ny, nx = y + dy, x + dx
                if not in_bounds(ny, nx, skel.shape):
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
# The old width-class skeleton was skeletonize(ink - blobs): it treats a stroke->fill contact as a WALL, so the
# medial axis HOOKS where a stroke is cut against a solid, and forks at every rounded end. Instead
# skeletonize the FULL ink and drop only the fill interiors, so the axis runs THROUGH each contact;
# then apply one w/2 endpoint rule, symmetric about a half pen, entirely here (not as later cleanups).

EDGE_TOL = 0.75         # px: discretization slack on the w/2 edge margin
EDGE_CAP_W = 1.0        # w: max free-end retraction. A ragged pen cap / fork prong is short and gets
                        # trimmed (it stops at the pen-wide body first anyway); a stroke thinner than the
                        # pen along its whole length keeps everything past this, so it isn't consumed whole.
MERGE_THR = 1.4         # w: collapse a junction-junction stub shorter than this (the skeletonizer 'H')


def _edge_prune(skel: np.ndarray, dt: np.ndarray, thr: float, protect: np.ndarray,
                cap_len: float) -> np.ndarray:
    """Retract the skeleton from its FREE endpoints while they sit closer than `thr` to the ink edge:
    eat degree<=1 tips one pixel at a time, stopping at the first pixel with dt >= thr. Free-end caps
    and fork prongs (which run toward the edge) are trimmed; a mid-stroke thin spot (never an endpoint)
    is preserved, so a stroke is never severed. Tips inside `protect` (the fill contact band) are a
    contact, not a free end -- they are left, so a stroke that meets a fill keeps its contact.

    `cap_len` bounds the retraction per free end (in px): a ragged cap or prong is short and stops at
    the pen-wide body well within it, but a stroke that is thinner than the pen along its WHOLE length
    (no body to stop on) keeps everything past `cap_len` instead of being consumed entirely."""
    sk = skel.copy()
    erodable = (dt < thr) & ~protect
    # Incremental leaf-peel: keep an 8-neighbour count and only revisit a pixel when a neighbour is
    # removed (one convolution up front, then O(1) per removed pixel). Each worklist entry carries how
    # many pixels have been eaten from its free end, so the cap can stop a run without a full re-scan.
    deg = neighbour_count(sk)
    ys, xs = np.where(sk & erodable & (deg <= 1))
    stack = [(int(y), int(x), 0) for y, x in zip(ys, xs)]
    while stack:
        y, x, d = stack.pop()
        if not sk[y, x] or not erodable[y, x] or deg[y, x] > 1 or d > cap_len:
            continue                                    # gone / not a leaf / retracted a full cap-length
        sk[y, x] = False
        for dy, dx in NEIGHBORS_8:
            ny, nx = y + dy, x + dx
            if in_bounds(ny, nx, sk.shape) and sk[ny, nx]:
                deg[ny, nx] -= 1
                if erodable[ny, nx] and deg[ny, nx] <= 1:
                    stack.append((ny, nx, d + 1))
    return sk


def _drop_short_free_branches(skel: np.ndarray, protect: np.ndarray, minlen: float) -> np.ndarray:
    """Drop a leaf branch (free endpoint to its junction) shorter than `minlen` -- a leftover fork
    stub, below pen resolution, never emitted as a stroke. Branches touching `protect` (a fill) are
    kept regardless of length. A branch whose whole skeleton component has NO junction is not a stub
    but a standalone mark (an isolated dot); it is kept too, else a lone pen-dab vanishes entirely.
    Iterated: dropping one stub can expose the next."""
    sk = skel.copy()
    changed = True
    while changed:
        changed = False
        nb = neighbour_count(sk)
        endpt = sk & (nb == 1)
        junc = sk & (nb >= 3)
        cc, _ = ndimage.label(sk, structure=_N8)         # whole components: a junction-free one is a mark
        has_junc = set(cc[junc].tolist())
        branches = sk & ~junc                            # split at junctions into simple paths
        lbl, n = ndimage.label(branches, structure=_N8)
        for i in range(1, n + 1):
            comp = lbl == i
            if not (comp & endpt).any() or (comp & protect).any() or int(comp.sum()) >= minlen:
                continue
            if int(cc[comp][0]) not in has_junc:         # standalone mark, not a fork stub -> keep
                continue
            sk &= ~comp
            changed = True
    return sk


def skel_walk_back(sk: np.ndarray, y: int, x: int, span: int):
    """Walk `span` pixels back along the skeleton from endpoint (y,x) for a stable outgoing direction."""
    prev, cur = (y, x), (y, x)
    for _ in range(span):
        nxt = None
        for dy, dx in NEIGHBORS_8:
            ny, nx = cur[0] + dy, cur[1] + dx
            if in_bounds(ny, nx, sk.shape) and sk[ny, nx] and (ny, nx) != prev:
                nxt = (ny, nx)
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
    for y, x in np.argwhere(sk & (neighbour_count(sk) <= 1) & band):
        by, bx = skel_walk_back(sk, int(y), int(x), 4)
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
    """Junction resolution (§6.4): at each junction pair the edges that
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
    it = max(1, int(round(g.w)))
    for nid, mask in blob_masks.items():
        nb = g.nodes[nid]
        near = windowed_dilation(mask, it)                 # "near the blob" band, dilated in-window
        attached = []
        for e in g.edges.values():
            if _edge_touches_blob(e, mask, near, g.w):
                attached.append(e.sid)
                e.ann.setdefault("blobs", [])
                if nb.sid not in e.ann["blobs"]:
                    e.ann["blobs"].append(nb.sid)
        nb.ann["edges"] = attached
    return g


CONTACT_REACH_W = 0.5    # a stroke centreline within this*w of a blob touches it (the stroke body overlaps)
CONTACT_GRAZE_W = 2.5    # split only where the near-blob run is shorter than this*w (a graze, not run-along)
CONTACT_ARM_W = 1.0      # ...and each resulting half is at least this*w long (never leave a tiny stub)


def _best_blob_contact(p, seglen, dts, reach, w):
    """The nearest mid-edge blob graze on polyline `p`: (blob nid, index k) of the closest contact
    within `reach` whose near-blob run is short enough to be a graze -- not a long run lying ALONG
    the blob, which the overlap attach owns -- or None. Pure geometry (no graph mutation)."""
    best = None
    for nid, (dt, y0, x0) in dts.items():
        H, W = dt.shape
        py, px = p[:, 1].astype(int) - y0, p[:, 0].astype(int) - x0
        inb = (py >= 0) & (py < H) & (px >= 0) & (px < W)
        d = np.full(len(p), np.inf)
        d[inb] = dt[py[inb], px[inb]]                      # points outside the window stay > reach
        k = int(d.argmin())
        if d[k] >= reach:
            continue
        lo = hi = k                                        # the contiguous near-blob run around k
        while lo > 0 and d[lo - 1] < reach:
            lo -= 1
        while hi < len(p) - 1 and d[hi + 1] < reach:
            hi += 1
        if seglen[hi] - seglen[lo] > CONTACT_GRAZE_W * w:
            continue                                       # a long run = lies ALONG the blob, overlap owns it
        if best is None or d[k] < best[1]:
            best = (nid, d[k], k)
    return None if best is None else (best[0], best[2])


def split_edges_at_blob_contacts(g: Graph, blob_masks: dict, w: float) -> Graph:
    """Separate a stroke that only GRAZES a blob mid-edge (a tangential contact, not an endpoint) at the
    contact: insert a valence-2 node there and cut the edge in two, so the boundary fit anchors to it (the
    contact node becomes an edge endpoint on the blob). A loop or through-stroke touching a blob has no
    free end, so neither the endpoint nor the overlap-fraction attach catches it, and idealising the
    boundary later pulls it off the stroke. Runs before assign()/attach so the new elements get stable ids
    and are attached like any other. `blob_contact` on the new node records the blob for the incidence pass."""
    if not blob_masks:
        return g
    reach = CONTACT_REACH_W * w
    # Only distances within `reach` of a blob matter (all else is skipped below), so window each blob's
    # EDT to its bbox + reach instead of transforming the whole supersampled frame per blob. A point
    # outside the window is necessarily > reach from the blob, so it reads as infinitely far (skipped).
    pad = int(math.ceil(reach)) + 1
    dts = {}
    for nid, m in blob_masks.items():
        sl = bbox_slice(m, pad=pad)
        if sl is not None:
            dts[nid] = (ndimage.distance_transform_edt(~m[sl]), sl[0].start, sl[1].start)
    nc = (max(g.nodes) if g.nodes else 0) + 1
    ec = (max(g.edges) if g.edges else 0) + 1
    for e in list(g.edges.values()):                       # snapshot: g.edges is mutated in the loop
        p = e.pts
        if len(p) < 5:
            continue
        seglen = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
        contact = _best_blob_contact(p, seglen, dts, reach, w)
        if contact is None:
            continue
        nid, k = contact
        if seglen[k] < CONTACT_ARM_W * w or seglen[-1] - seglen[k] < CONTACT_ARM_W * w:
            e.ann.setdefault("blob_contact_ends", [])      # contact AT an endpoint (splitting would leave a
            if nid not in e.ann["blob_contact_ends"]:      # stub) -> the endpoint exists; just attach the edge
                e.ann["blob_contact_ends"].append(nid)     # (endpoint runs tangent/away, so _runs_into missed it)
            continue
        B = g.nodes[nid].boundary                          # mid-edge graze: snap the contact ONTO the blob edge
        if B is not None and len(B) >= 2:                  # (like the growth-stage snap) and split there
            j = int(np.hypot(B[:, 0] - p[k, 0], B[:, 1] - p[k, 1]).argmin())
            X = np.array([float(B[j, 0]), float(B[j, 1])])
        else:
            X = p[k].astype(float)
        pts1 = p[:k + 1].astype(float).copy(); pts1[-1] = X
        pts2 = p[k:].astype(float).copy(); pts2[0] = X
        g.nodes[nc] = Node(id=nc, kind=JUNCTION, pos=(float(X[0]), float(X[1])), ann={"blob_contact": nid})
        g.edges[ec] = Edge(id=ec, a=e.a, b=nc, pts=pts1, r=e.r[:k + 1].copy(),
                           width_class=e.width_class, ann=dict(e.ann))
        g.edges[ec + 1] = Edge(id=ec + 1, a=nc, b=e.b, pts=pts2, r=e.r[k:].copy(),
                               width_class=e.width_class, ann=dict(e.ann))
        del g.edges[e.id]
        nc += 1; ec += 2
    return g


def attach_contact_splits(g: Graph) -> Graph:
    """Wire incidence for the tangential-contact splits: each split node's two edges attach to its blob
    (endpoint-only attach can't see a tangential touch, so record it directly from the split we made)."""
    def wire(blob, e):
        if blob is None or blob.kind != BLOB:
            return
        elist = blob.ann.setdefault("edges", [])
        if e.sid and e.sid not in elist:
            elist.append(e.sid)
        bl = e.ann.setdefault("blobs", [])
        if blob.sid and blob.sid not in bl:
            bl.append(blob.sid)

    for nd in list(g.nodes.values()):                      # mid-edge split node: attach both incident edges
        bid = nd.ann.get("blob_contact") if nd.ann else None
        if bid is None:
            continue
        blob = g.nodes.get(bid)
        for e in g.edges.values():
            if nd.id in (e.a, e.b):
                wire(blob, e)
    for e in g.edges.values():                             # near-endpoint contact: attach that edge alone
        for bid in e.ann.get("blob_contact_ends", []):
            wire(g.nodes.get(bid), e)
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
    a rim of bumps. The stub's ink IS the blob's edge, so absorb it: fold the stub's ink into the
    blob's mask (clamped to the real ink, so nothing overshoots the drawn edge) and drop the edge.
    The boundary is (re)traced once from the final mask by vectorize._trace_blobs, not here.

    A stub is short AND rim-hugging (most of its length within STUB_NEAR*w of the blob). That keeps
    a radial stroke *ending* at the blob (only its tip is near) and a long stroke running tangent to
    it (length gate) as strokes. Same-colour only, so a coloured detail over a black fill isn't lost."""
    from PIL import Image, ImageDraw

    from model import BLOB

    sw = max(1, int(round(w)))
    it = max(1, int(round(STUB_NEAR * w)))
    removed: set = set()
    for nid, mask in list(blob_masks.items()):
        bcol = g.nodes[nid].ann.get("color", 0)
        near = windowed_dilation(mask, it)                 # "near the blob" band, dilated in-window
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
        # rasterize the stubs in a window over the blob + its (rim-hugging) stubs, not the full frame
        ms = bbox_slice(mask, pad=0)
        allx = np.concatenate([e.pts[:, 0] for e in stubs])
        ally = np.concatenate([e.pts[:, 1] for e in stubs])
        H, W = mask.shape
        y0 = max(0, min(ms[0].start, int(ally.min()) - sw))
        y1 = min(H, max(ms[0].stop, int(ally.max()) + sw + 1))
        x0 = max(0, min(ms[1].start, int(allx.min()) - sw))
        x1 = min(W, max(ms[1].stop, int(allx.max()) + sw + 1))
        im = Image.new("L", (x1 - x0, y1 - y0), 0)
        d = ImageDraw.Draw(im)
        for e in stubs:                                   # reconstruct each stub's ink at pen width
            pts = [(float(x) - x0, float(y) - y0) for x, y in e.pts]
            if len(pts) >= 2:
                d.line(pts, fill=255, width=sw, joint="curve")
            for q in (pts[0], pts[-1]):
                d.ellipse([q[0] - sw / 2, q[1] - sw / 2, q[0] + sw / 2, q[1] + sw / 2], fill=255)
        nm = mask.copy()                                  # fold the stubs' ink into the blob mask (clamped to
        nm[y0:y1, x0:x1] |= (np.asarray(im) > 0) & ink_mask[y0:y1, x0:x1]   # ink); boundary (re)traced later
        blob_masks[nid] = nm
        removed.update(e.id for e in stubs)

    for eid in removed:
        g.edges.pop(eid, None)
    used = {e.a for e in g.edges.values()} | {e.b for e in g.edges.values()}
    for nid in [n for n, nd in g.nodes.items() if n not in used and nd.kind != BLOB]:
        del g.nodes[nid]
    return g
