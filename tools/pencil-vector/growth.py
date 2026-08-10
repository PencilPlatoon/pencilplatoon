"""Growth-based blob resolution (§6.4 successor to resolve.py's justification pass).

A 2D region is one of two things: a real *fill* (a head, a wheel -- a pen-uncovered bulge), or a
*junction* where strokes cross (all its ink is swept by the strokes). We decide per region by
growing the strokes that touch it inward and measuring what area is left uncovered:

  classify(ink)          -> (grown, carved skeleton, [candidate regions], [kept fills], snapped)
  blob_contacts(...)     -> the stroke->region contacts (seeds), snapped onto the region edge;
                            a skeleton pixel bridging TWO regions seeds both
  grow(contacts, ...)    -> the region's internal segment network (paths + junction nodes), by a
                            rewind-to-first-reacher fixpoint
  keep_as_blob(...)      -> True if a leftover LOBE (uncovered area, biggest inscribed circle >
                            LOBE_FACTOR*w) survives -- then it's a fill, else it's a junction

Strokes steer by momentum + centering between the L/R edges + weak pairwise gravity; a segment
stops only when a wall lies in its forward +-45 deg cone (a lateral pinch is ignored) with nothing
ahead to reach. Everything is measured in the pen width `w`.
"""
from __future__ import annotations

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import skeletonize

import graph as GR
import widthclass as WC
from ink import MIN_HOLE_W2

# --- growth-sim weights / tolerances (all in px or w) ---
K_MOM, K_CEN, K_GRAV = 2.0, 0.25, 0.5          # momentum / centering / gravity
QUANTUM, MEET_D = 0.5, 0.8                      # step length / meeting distance
SAFETY_STEPS = 4000                            # hang-guard; real stops are edge / meet / self
_CONE = [np.radians(a) for a in (-45.0, -30.0, -15.0, 0.0, 15.0, 30.0, 45.0)]   # edge-stop looks ahead only
_CONE_CS = [(float(np.cos(a)), float(np.sin(a))) for a in _CONE]                # (cos, sin) to rotate a dir into each ray

# --- contact detection / decision ---
SNAP_W = 0.2                                   # a stroke within this many w of a region snaps onto it
KBACK = 7                                      # steps walked back along a skeleton end to read its direction
MIN_OVERSHOOT = 2                              # px: a tail this long past a contact is trimmed
LOBE_FACTOR = 0.5                              # a leftover lobe with inscribed radius > this*w keeps the region a fill
MIN_NET_SEG_W = 0.5                            # drop a grown network segment shorter than this many w: too
                                               # short to be more than its pen-width round cap, which only
                                               # pokes past the (thin) region edge; the sub-w/2 gap it leaves
                                               # is bridged by the neighbouring segments' caps
_NB = np.ones((3, 3), np.uint8); _NB[1, 1] = 0


# ----------------------------------------------------------------------------- region detection
def raw_core(ink):
    d, m, w = ink.dist, ink.mask, ink.w
    seed = m & (d > WC.WIDE_ENTER * w)
    if not seed.any():
        return np.zeros_like(m)
    band = m & (d > WC.WIDE_EXIT * w)
    lab, _ = ndimage.label(band, structure=np.ones((3, 3)))
    keep = np.unique(lab[seed])
    return np.isin(lab, keep[keep > 0])


def expand(core, ink):
    return ink.mask & (ndimage.distance_transform_edt(~core) <= WC.WIDE_EXIT * ink.w + 1.0)


def classify(ink):
    """(grown, carved skeleton, candidate regions, kept fills, snapped-endpoints).
    `kept` are regions with a clear 2D core (real fills, always blobs); `candidates` are the ambiguous
    2D regions that get grown and then decided fill-vs-junction by keep_as_blob. Both are lists of
    per-component bool masks; `grown` is their union (what the growth-sim treats as solid)."""
    w = ink.w
    grown = expand(raw_core(ink), ink)
    lab, n = ndimage.label(grown, structure=np.ones((3, 3)))
    kept = []; candidates = []
    for i in range(1, n + 1):
        c = lab == i
        if c.sum() < WC.MIN_BLOB_AREA_W2 * w * w or not WC._has_2d_core(c, w) or WC._is_line(c, ink.dist, w):
            candidates.append(c)                          # ambiguous: grow + decide by leftover lobe
        else:
            kept.append(c)                                # clear 2D core -> a fill
    skel = skeletonize(ink.mask) & ~grown                 # carve every region; contacts snap to its edge
    dt = ndimage.distance_transform_edt(ink.mask)
    band = ndimage.binary_dilation(grown, iterations=max(1, int(round(w / 2.0))))
    skel = GR._edge_prune(skel, dt, w / 2.0 - GR.EDGE_TOL, band, cap_len=round(GR.EDGE_CAP_W * w))
    skel = GR._drop_short_free_branches(skel, band, w)
    skel, snapped = snap_overshoot(skel, grown, w)
    return grown, skel, candidates, kept, snapped


def snap_overshoot(skel, grown, w):
    """A free end whose tail runs a few px PAST a region contact is an overshoot: trim it so the
    segment terminates AT the contact. Returns (skel, set of the contact endpoints it created)."""
    sk = skel.copy()
    gdil = ndimage.binary_dilation(grown)
    reach = max(2, int(round(1.5 * w)))
    snapped = set()
    changed = True
    while changed:
        changed = False
        nb = ndimage.convolve(sk.astype(np.uint8), _NB, mode="constant")
        for y, x in np.argwhere(sk & (nb == 1)):
            prev, cur, path, hit = (y, x), (y, x), [(y, x)], -1
            for _ in range(1, reach + 1):
                nxt = None
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if (dy or dx):
                            ny, nx = cur[0] + dy, cur[1] + dx
                            if 0 <= ny < sk.shape[0] and 0 <= nx < sk.shape[1] and sk[ny, nx] and (ny, nx) != prev:
                                nxt = (ny, nx); break
                    if nxt:
                        break
                if nxt is None:
                    break
                path.append(nxt); prev, cur = cur, nxt
                if gdil[cur]:
                    hit = len(path) - 1; break
            if hit >= MIN_OVERSHOOT:
                contact = path[hit]; pathset = set(map(tuple, path))
                cont = any(sk[contact[0] + dy, contact[1] + dx] and (contact[0] + dy, contact[1] + dx) not in pathset
                           for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx))
                if cont:                                   # segment continues PAST the contact -> real overshoot
                    for py, px in path[:hit]:
                        sk[py, px] = False
                    snapped.add((contact[0], contact[1]))
                    changed = True
                    break
    return sk, snapped


# ----------------------------------------------------------------------------- contacts (seeds)
def blob_contacts(skel, grown, w):
    """Every place a segment comes within SNAP_W*w of a region: snap its closest-approach pixel
    STRAIGHT onto the nearest region edge. The nearest region is the PRIMARY contact (unchanged); a
    pixel that also reaches a SECOND region within range seeds that one too (a blob-to-blob bridge).
    Returns [(near_xy, edge_xy, dir_into_region, region_label)]."""
    thresh = SNAP_W * w
    distg, idx = ndimage.distance_transform_edt(~grown, return_distances=True, return_indices=True)
    lab, _ = ndimage.label(grown, structure=np.ones((3, 3)))
    nb = ndimage.convolve(skel.astype(np.uint8), _NB, mode="constant")
    H, W = skel.shape

    def sk_nbrs(y, x):
        return [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                if (dy or dx) and 0 <= y + dy < H and 0 <= x + dx < W and skel[y + dy, x + dx]]

    def back(y, x):
        prev, cur = (y, x), (y, x)
        for _ in range(KBACK):
            nxt = next((nn for nn in sk_nbrs(*cur) if nn != prev), None)
            if nxt is None:
                break
            prev, cur = cur, nxt
        return cur

    reach = int(np.ceil(thresh))
    raw = []
    for y, x in np.argwhere(skel):
        d = distg[y, x]
        if d < 0.5 or d > thresh:                          # already touching, or too far to snap
            continue
        is_end = nb[y, x] == 1
        if not is_end and not all(distg[ny, nx] >= d for ny, nx in sk_nbrs(y, x)):
            continue                                       # neither an endpoint nor a closest-approach minimum
        if is_end:                                         # continue the segment's own line onto the edge
            by, bx = back(y, x); base_pt = np.array([bx, by], float)
        else:                                              # straight (shortest) to the edge
            base_pt = np.array([x, y], float)
        edge = np.array([idx[1][y, x], idx[0][y, x]], float)   # PRIMARY: nearest region edge (unchanged)
        lprim = int(lab[int(edge[1]), int(edge[0])])
        emit = [(edge, lprim, d)]
        others = {}                                        # BRIDGE: any OTHER region within thresh gets its own
        for yy in range(max(0, y - reach), min(H, y + reach + 1)):
            for xx in range(max(0, x - reach), min(W, x + reach + 1)):
                lb = int(lab[yy, xx])
                if grown[yy, xx] and lb != lprim:
                    dd = np.hypot(xx - x, yy - y)
                    if dd <= thresh and (lb not in others or dd < others[lb][0]):
                        others[lb] = (dd, xx, yy)
        for lb, (dd, ex, ey) in others.items():
            emit.append((np.array([ex, ey], float), lb, dd))
        for e2, lb, dd in emit:
            dv = e2 - base_pt; nv = np.hypot(*dv)
            if nv:
                raw.append((np.array([x, y], float), e2, dv / nv, lb, dd))
    contacts = []                                          # dedupe near-coincident contacts on the same edge
    for near, edge, dv, lb, d in sorted(raw, key=lambda r: r[4]):
        if not any(np.hypot(*(edge - e2)) < 1.5 for _, e2, _, _ in contacts):
            contacts.append((near, edge, dv, lb))
    return contacts


# ----------------------------------------------------------------------------- growth-sim
def cast(p, d, grown, maxd):
    """March from p along dir d in 0.5-px steps; return the distance at which we leave `grown` (a
    wall ahead), capped at maxd. p/d may be arrays or tuples -- read as plain Python floats so the
    inner loop stays in scalars: np.float64 scalar math + round() here dominated the growth sim."""
    H, W = grown.shape
    px, py, dx, dy = float(p[0]), float(p[1]), float(d[0]), float(d[1])
    t = 0.5
    while t < maxd:
        x, y = int(round(px + dx * t)), int(round(py + dy * t))
        if not (0 <= y < H and 0 <= x < W and grown[y, x]):
            return t
        t += 0.5
    return maxd


def grow(contacts, grown, w, com):
    """Grow `contacts` into a region. Every intersection rewinds to the instant the FIRST segment
    reached that point: it terminates there and spawns one continuation aimed at the centre of mass
    (direction reset); later arrivals just join. A fixpoint re-simulates and prunes the future so
    junctions don't pile up. Returns (paths, nodes, matched)."""
    self_skip = max(4, int(round(w / QUANTUM)))
    grace = w / 2.0
    feps = 0.02
    joinr = MEET_D

    def simulate(forced, final=False):
        n = len(contacts)
        paths = [[np.array(e, float)] for e, _ in contacts]
        stamps = [[0] for _ in contacts]
        dirs = [np.array(dv, float) / (np.hypot(*dv) or 1) for _, dv in contacts]
        births = [np.array(e, float) for e, _ in contacts]
        spawn = [False] * n
        active = [True] * n; matched = [False] * n; deep = [False] * n
        occupied = [False] * len(forced); nodes = []; clock = [0]

        def spawn_from(pt):
            cvd = com - np.asarray(pt, float); cn = np.hypot(*cvd)
            if cn < w / 2.0:                               # already at the COM: no degenerate continuation
                return
            paths.append([np.asarray(pt, float).copy()]); stamps.append([clock[0]]); dirs.append(cvd / cn)
            births.append(np.asarray(pt, float).copy()); spawn.append(True)
            active.append(True); matched.append(False); deep.append(False)

        def land_on(i, fj):
            paths[i].append(forced[fj].copy()); stamps[i].append(clock[0]); active[i] = False; matched[i] = True
            if not occupied[fj]:
                occupied[fj] = True; nodes.append(forced[fj]); spawn_from(forced[fj])

        def cone_dist(p, d):
            # The result is only ever tested against w/2 (deep-latch / stop), never used as a real
            # distance -- so cap each ray's march at the threshold and bail the instant one ray is
            # under it (the min can only fall further). Turns a full 20*w march per ray into ~w in
            # open regions, which is where the sim spent most of its time.
            cap = 0.5 * w + 1.0
            best = cap
            d0, d1 = float(d[0]), float(d[1])
            for c, s in _CONE_CS:
                t = cast(p, (d0 * c - d1 * s, d0 * s + d1 * c), grown, cap)
                if t < best:
                    best = t
                    if best < 0.5 * w:                     # already below the only threshold that matters
                        break
            return best

        def seg_ahead(i, p, d):
            ahead = cast(p, d, grown, 20 * w)
            for j in range(len(paths)):
                if j == i:
                    continue
                for q in paths[j]:
                    rel = q - p; along = rel @ d
                    if 0 < along <= ahead + MEET_D and np.hypot(*(rel - along * d)) < w / 2.0:
                        return True
            return False

        for step in range(SAFETY_STEPS):
            clock[0] = step
            if not any(active):
                break
            cur_n = len(paths); tips = [paths[m][-1] for m in range(cur_n)]
            for i in range(cur_n):
                if not active[i]:
                    continue
                p, d = paths[i][-1], dirs[i]
                cd = cone_dist(p, d)
                if not deep[i] and cd > w / 2.0:
                    deep[i] = True
                if deep[i] and cd < w / 2.0 and not seg_ahead(i, p, d):
                    active[i] = False; continue
                perp = np.array([-d[1], d[0]])
                R = cast(p, perp, grown, 20 * w); lft = cast(p, -perp, grown, 20 * w)
                cvec = perp * (R - lft) / (2.0 * w)
                grav = np.zeros(2)
                for j2 in range(cur_n):
                    if j2 != i and active[j2]:
                        v = tips[j2] - p; dd = np.hypot(*v)
                        if dd > 1e-6:
                            grav += v / dd * (w / dd) ** 2
                nd = K_MOM * d + K_CEN * cvec + K_GRAV * grav; nn = np.hypot(*nd)
                if nn < 1e-6:
                    nd = d; nn = 1.0
                nd = nd / nn; newp = p + nd * QUANTUM

                fj = next((f for f in range(len(forced)) if np.hypot(*(newp - forced[f])) < feps), -1)
                if fj >= 0:                                 # (a) first-reacher arrives at a forced point
                    land_on(i, fj); continue
                near_birth = spawn[i] and np.hypot(*(newp - births[i])) < grace
                cross = None; cstamp = 0
                if not near_birth:                          # (b) crossing another segment's committed path
                    for j in range(len(paths)):
                        if j == i:
                            continue
                        # vectorized proximity to path j's committed points; np.hypot (not d^2 < r^2)
                        # keeps the compared value bitwise-identical to the scalar scan. argmax takes
                        # the FIRST hit in index order -- load-bearing: cross/cstamp must be the earliest
                        # committed point (it drives the fixpoint rewind), not the nearest. Do NOT argmin.
                        P = np.asarray(paths[j])
                        hit = np.hypot(newp[0] - P[:, 0], newp[1] - P[:, 1]) < MEET_D
                        if hit.any():
                            kk = int(np.argmax(hit))
                            cross = paths[j][kk]; cstamp = stamps[j][kk]; break
                if cross is not None:
                    fj = next((f for f in range(len(forced)) if np.hypot(*(cross - forced[f])) < joinr), -1)
                    if fj >= 0:
                        paths[i].append(newp); stamps[i].append(step); land_on(i, fj); continue
                    if final:                               # non-converged: terminate on the crossing
                        cp = np.asarray(cross, float).copy()
                        paths[i].append(cp); stamps[i].append(step); active[i] = False; matched[i] = True
                        nodes.append(cp); continue
                    return ('split', np.asarray(cross, float).copy(), cstamp)
                if len(paths[i]) > self_skip:               # (c) self-intersection
                    Q = np.asarray(paths[i][:-self_skip])
                    if (np.hypot(newp[0] - Q[:, 0], newp[1] - Q[:, 1]) < MEET_D).any():
                        active[i] = False; continue
                paths[i].append(newp); stamps[i].append(step); dirs[i] = nd
        return ('done', paths, nodes, matched)

    forced = []; seen = set()
    for _ in range(600):                                    # fixpoint with a true rewind: prune the future
        res = simulate([p for p, _ in forced])
        if res[0] != 'split':
            return res[1], res[2], res[3]
        P, sp = res[1], res[2]
        forced = [(p, s) for p, s in forced if s <= sp]     # delete every junction created after sp
        key = (round(float(P[0]), 1), round(float(P[1]), 1), int(sp))
        if key in seen:
            break
        seen.add(key); forced.append((P, sp))
    res = simulate([p for p, _ in forced], final=True)
    return res[1], res[2], res[3]


# ----------------------------------------------------------------------------- rasterize / boundary
def _draw_polyline(mask, pts):
    H, W = mask.shape
    pts = np.asarray(pts, float)
    for a, b in zip(pts[:-1], pts[1:]):
        steps = int(max(1, round(np.hypot(*(b - a)) / 0.5)))
        for t in np.linspace(0, 1, steps + 1):
            q = a + (b - a) * t
            yy, xx = int(round(q[1])), int(round(q[0]))
            if 0 <= yy < H and 0 <= xx < W:
                mask[yy, xx] = True


def _arclen(pth):
    p = np.asarray(pth, float)
    return float(np.sum(np.hypot(*np.diff(p, axis=0).T))) if len(p) >= 2 else 0.0


def rasterize_network(paths, shape):
    m = np.zeros(shape, bool)
    for pth in paths:
        if len(pth) >= 2:
            _draw_polyline(m, pth)
    return m


def fill_boundary(mask, w, holes_mask=None):
    """A region kept as a blob: trace its outer edge + holes straight from the ink mask. No pen-width
    floor -- a blob mask is a `grown` region (seeded at d>0.90w, expanded to d>0.75w), so it is already
    >~1.5 pen wide everywhere and can't pinch off; flooring only inflated thin rim spurs into bulges.
    A hole the pen actually left open (`holes_mask`) must survive even when the outline decimation spans
    its narrow mouth: so after tracing, add every real hole the OUTER polygon encloses as its own
    even-odd contour (re-tracing a carved mask loses a hole with a thin channel)."""
    outer, holes = WC._boundaries(mask, w)
    if outer is None or holes_mask is None or not holes_mask.any():
        return outer, holes
    H, W = mask.shape
    im = Image.new("1", (W, H), 0)
    ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in outer], fill=1)
    enclosed = holes_mask & np.asarray(im, bool)          # real holes the fill polygon covers
    lab, n = ndimage.label(enclosed)
    for k in range(1, n + 1):
        comp = lab == k
        if comp.sum() < MIN_HOLE_W2 * w * w:
            continue
        cs = find_contours(comp.astype(float), 0.5)
        if not cs:
            continue
        hpoly = approximate_polygon(max(cs, key=len), WC.POLY_TOL_W * w)
        if len(hpoly) >= 3:
            holes.append(np.column_stack([hpoly[:, 1], hpoly[:, 0]]))   # (row,col) -> (x,y)
    return outer, holes


# ----------------------------------------------------------------------------- fill-vs-junction
def keep_as_blob(region_mask, paths, w):
    """True if, after growth, a leftover LOBE survives -- an uncovered area (> w/2 from every segment)
    whose largest inscribed circle exceeds LOBE_FACTOR*w. That inscribed radius is the metric: a
    compact fill fits a big disc, a long thin rind only a tiny one, so a circle beats a rind."""
    seg = rasterize_network(paths, region_mask.shape)
    if not seg.any():
        return True                                        # nothing grown at all -> it's a fill
    # crop to bbox(region | seg)+1 so the EDTs run on a small window, not the full supersampled image
    # -- identical values, since every seg a region pixel could be nearest to is inside the window.
    sl = WC.bbox_slice(region_mask | seg)
    region_mask, seg = region_mask[sl], seg[sl]
    dist_seg = ndimage.distance_transform_edt(~seg)
    leftover = region_mask & (dist_seg > w / 2.0)
    if not leftover.any():
        return False
    ll, nll = ndimage.label(leftover)
    # each lobe's inscribed radius = its max distance-to-own-boundary. The lobes are disjoint, so ONE
    # EDT of their union gives every lobe that distance at once (was one EDT per lobe -- the pipeline's
    # single biggest EDT cost); read the per-lobe maxima straight off it.
    edt = ndimage.distance_transform_edt(leftover)
    return float(np.max(ndimage.maximum(edt, ll, index=range(1, nll + 1)))) > LOBE_FACTOR * w


# ----------------------------------------------------------------------------- one-layer resolution
def resolve(ink):
    """Resolve one colour layer's 2D regions. Returns (skeleton, fills):
      skeleton -- carved stroke skeleton + the growth networks of junction regions + blob-bridge links,
                  ready for graph.build (blob interiors are absent, so they aren't skeletonized)
      fills    -- [(mask, boundary, holes, centroid)] for every region kept as a solid blob."""
    w = ink.w
    grown, skel, candidates, kept, snapped = classify(ink)
    ink_holes = ndimage.binary_fill_holes(ink.mask) & ~ink.mask   # holes the pen left open in the drawing
    lab, _ = ndimage.label(grown, structure=np.ones((3, 3)))
    owned = {}; bynear = {}
    for near, edge, dv, L in blob_contacts(skel, grown, w):
        owned.setdefault(L, []).append((edge, dv))
        bynear.setdefault((round(float(near[0]), 1), round(float(near[1]), 1)), []).append((np.asarray(edge, float), L))

    net = skel.copy()
    fills = []

    def add_fill(mask):
        outer, holes = fill_boundary(mask, w, ink_holes)
        if outer is not None:
            ys, xs = np.where(mask)
            fills.append((mask, outer, holes, (float(xs.mean()), float(ys.mean()))))

    for c in kept:
        add_fill(c)
    for c in candidates:
        ys, xs = np.where(c); L = int(lab[ys[0], xs[0]]); com = np.array([xs.mean(), ys.mean()])
        own = owned.get(L, [])
        if not own:                                        # nothing touches it -> keep as strokes, not a fill
            net |= skeletonize(c)
            continue
        paths, _nodes, _matched = grow(own, grown, w, com)
        paths = [p for p in paths if _arclen(p) >= MIN_NET_SEG_W * w]   # omit sub-pen stubs BEFORE deciding
        if keep_as_blob(c, paths, w):
            add_fill(c)
        else:
            for pth in paths:
                if len(pth) >= 2:
                    _draw_polyline(net, pth)               # network replaces the region's interior
    for pts in bynear.values():                            # bridge: a skeleton pixel that seeded two regions
        for m in range(len(pts)):
            for n2 in range(m + 1, len(pts)):
                if pts[m][1] != pts[n2][1]:
                    _draw_polyline(net, [pts[m][0], pts[n2][0]])
    kept_union = np.zeros_like(grown)                      # push stroke ends w/2 INTO the kept fills so the
    for mask, *_ in fills:                                 # round-cap rear clears the blob edge (a clean join,
        kept_union |= mask                                 # the inverse of the free-end retraction)
    if kept_union.any():
        net = GR._extend_contacts(net, kept_union, w)
    return net, fills
