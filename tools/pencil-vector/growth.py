"""Growth-based blob resolution (§6.4 successor to the earlier justification-resolution pass).

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

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.measure import approximate_polygon, find_contours
from skimage.morphology import skeletonize

import graph as GR
import widthclass as WC
from geom import NEIGHBORS_8, in_bounds, rowcol_to_xy
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


def classify(ink, force_fill=None):
    """(grown, carved skeleton, candidate regions, kept fills, snapped-endpoints).
    `kept` are regions with a clear 2D core (real fills, always blobs); `candidates` are the ambiguous
    2D regions that get grown and then decided fill-vs-junction by keep_as_blob. Both are lists of
    per-component bool masks; `grown` is their union (what the growth-sim treats as solid).

    `force_fill` is the 2D-thick mask of the AGGREGATE ink (all colours unioned, §5). A component this
    colour contributes that is thin on its own but sits inside an aggregate-wide area is kept as a fill,
    so a wide contiguous region striped from several pen-wide colours (a painted flagpole) is covered by
    tiling per-colour blobs instead of gappy per-colour strokes. Only the EXTRA thickness aggregation
    creates is forced, so on a single-colour drawing `force_fill` == this layer's own core and nothing
    changes -- black-only art is untouched."""
    w = ink.w
    grown = expand(raw_core(ink), ink)
    extra = None
    if force_fill is not None:
        extra = (ink.mask & force_fill) & ~grown          # thick only once colours are aggregated
        grown = grown | extra
    lab, n = ndimage.label(grown, structure=np.ones((3, 3)))
    kept = []; candidates = []
    for i in range(1, n + 1):
        c = lab == i
        if extra is not None and bool((c & extra).any()):
            kept.append(c)                                # aggregate-wide -> a fill (tiles with the other colours)
        elif c.sum() < WC.MIN_BLOB_AREA_W2 * w * w or not WC._has_2d_core(c, w) or WC._is_line(c, ink.dist, w):
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
        nb = GR.neighbour_count(sk)
        for y, x in np.argwhere(sk & (nb == 1)):
            prev, cur, path, hit = (y, x), (y, x), [(y, x)], -1
            for _ in range(1, reach + 1):
                nxt = None
                for dy, dx in NEIGHBORS_8:
                    ny, nx = cur[0] + dy, cur[1] + dx
                    if in_bounds(ny, nx, sk.shape) and sk[ny, nx] and (ny, nx) != prev:
                        nxt = (ny, nx); break
                if nxt is None:
                    break
                path.append(nxt); prev, cur = cur, nxt
                if gdil[cur]:
                    hit = len(path) - 1; break
            if hit >= MIN_OVERSHOOT:
                contact = path[hit]; pathset = set(map(tuple, path))
                cont = any(in_bounds(contact[0] + dy, contact[1] + dx, sk.shape)
                           and sk[contact[0] + dy, contact[1] + dx]
                           and (contact[0] + dy, contact[1] + dx) not in pathset
                           for dy, dx in NEIGHBORS_8)
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
    nb = GR.neighbour_count(skel)
    H, W = skel.shape

    def sk_nbrs(y, x):
        return [(y + dy, x + dx) for dy, dx in NEIGHBORS_8
                if in_bounds(y + dy, x + dx, skel.shape) and skel[y + dy, x + dx]]

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
            by, bx = GR.skel_walk_back(skel, y, x, KBACK); base_pt = np.array([bx, by], float)
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


@dataclass
class _Tip:
    """One growing segment. `path`/`stamp` are the committed points and their step-clocks; `dir` is the
    current unit heading; `birth` the spawn origin. The flags track its lifecycle: `spawn` (a
    continuation aimed at the COM, not an original contact), `active` (still growing), `matched`
    (terminated on a forced point or crossing), `deep` (has latched onto open interior)."""
    path: list
    stamp: list
    dir: np.ndarray
    birth: np.ndarray
    spawn: bool = False
    active: bool = True
    matched: bool = False
    deep: bool = False


@dataclass
class _Split:
    """A crossing forced a fixpoint rewind: terminate the first reacher at `pt`, whose committed
    point was stamped `stamp`, and re-simulate with it pinned."""
    pt: np.ndarray
    stamp: int


@dataclass
class _Done:
    """The sim converged: `paths`/`matched` are per-segment, `nodes` the junction points it placed."""
    paths: list
    nodes: list
    matched: list


def _simulate(contacts, grown, w, com, forced, final=False) -> _Split | _Done:
    """One growth simulation toward the `forced` junction points: returns a `_Split` to ask grow()'s
    fixpoint for a rewind, or a `_Done` once it converges. Each growing segment is a `_Tip`; the
    spawn/land/cast helpers stay local, so this reads as one self-contained sim."""
    self_skip = max(4, int(round(w / QUANTUM)))
    grace = w / 2.0
    feps = 0.02
    joinr = MEET_D
    segs = [_Tip(path=[np.array(e, float)], stamp=[0],
                 dir=np.array(dv, float) / (np.hypot(*dv) or 1), birth=np.array(e, float))
            for e, dv in contacts]
    occupied = [False] * len(forced); nodes = []

    def spawn_from(pt, step):
        cvd = com - np.asarray(pt, float); cn = np.hypot(*cvd)
        if cn < w / 2.0:                               # already at the COM: no degenerate continuation
            return
        segs.append(_Tip(path=[np.asarray(pt, float).copy()], stamp=[step],
                         dir=cvd / cn, birth=np.asarray(pt, float).copy(), spawn=True))

    def land_on(i, fj, step):
        s = segs[i]
        s.path.append(forced[fj].copy()); s.stamp.append(step); s.active = False; s.matched = True
        if not occupied[fj]:
            occupied[fj] = True; nodes.append(forced[fj]); spawn_from(forced[fj], step)

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
        for j in range(len(segs)):
            if j == i:
                continue
            for q in segs[j].path:
                rel = q - p; along = rel @ d
                if 0 < along <= ahead + MEET_D and np.hypot(*(rel - along * d)) < w / 2.0:
                    return True
        return False

    for step in range(SAFETY_STEPS):
        if not any(s.active for s in segs):
            break
        cur_n = len(segs); tips = [segs[m].path[-1] for m in range(cur_n)]
        for i in range(cur_n):
            s = segs[i]
            if not s.active:
                continue
            p, d = s.path[-1], s.dir
            cd = cone_dist(p, d)
            if not s.deep and cd > w / 2.0:
                s.deep = True
            if s.deep and cd < w / 2.0 and not seg_ahead(i, p, d):
                s.active = False; continue
            perp = np.array([-d[1], d[0]])
            R = cast(p, perp, grown, 20 * w); lft = cast(p, -perp, grown, 20 * w)
            cvec = perp * (R - lft) / (2.0 * w)
            grav = np.zeros(2)
            for j2 in range(cur_n):
                if j2 != i and segs[j2].active:
                    v = tips[j2] - p; dd = np.hypot(*v)
                    if dd > 1e-6:
                        grav += v / dd * (w / dd) ** 2
            nd = K_MOM * d + K_CEN * cvec + K_GRAV * grav; nn = np.hypot(*nd)
            if nn < 1e-6:
                nd = d; nn = 1.0
            nd = nd / nn; newp = p + nd * QUANTUM

            fj = next((f for f in range(len(forced)) if np.hypot(*(newp - forced[f])) < feps), -1)
            if fj >= 0:                                 # (a) first-reacher arrives at a forced point
                land_on(i, fj, step); continue
            near_birth = s.spawn and np.hypot(*(newp - s.birth)) < grace
            cross = None; cstamp = 0
            if not near_birth:                          # (b) crossing another segment's committed path
                for j in range(len(segs)):
                    if j == i:
                        continue
                    # vectorized proximity to path j's committed points; np.hypot (not d^2 < r^2)
                    # keeps the compared value bitwise-identical to the scalar scan. argmax takes
                    # the FIRST hit in index order -- load-bearing: cross/cstamp must be the earliest
                    # committed point (it drives the fixpoint rewind), not the nearest. Do NOT argmin.
                    P = np.asarray(segs[j].path)
                    hit = np.hypot(newp[0] - P[:, 0], newp[1] - P[:, 1]) < MEET_D
                    if hit.any():
                        kk = int(np.argmax(hit))
                        cross = segs[j].path[kk]; cstamp = segs[j].stamp[kk]; break
            if cross is not None:
                fj = next((f for f in range(len(forced)) if np.hypot(*(cross - forced[f])) < joinr), -1)
                if fj >= 0:
                    s.path.append(newp); s.stamp.append(step); land_on(i, fj, step); continue
                if final:                               # non-converged: terminate on the crossing
                    cp = np.asarray(cross, float).copy()
                    s.path.append(cp); s.stamp.append(step); s.active = False; s.matched = True
                    nodes.append(cp); continue
                return _Split(np.asarray(cross, float).copy(), cstamp)
            if len(s.path) > self_skip:                 # (c) self-intersection
                Q = np.asarray(s.path[:-self_skip])
                if (np.hypot(newp[0] - Q[:, 0], newp[1] - Q[:, 1]) < MEET_D).any():
                    s.active = False; continue
            s.path.append(newp); s.stamp.append(step); s.dir = nd
    return _Done([s.path for s in segs], nodes, [s.matched for s in segs])


def grow(contacts, grown, w, com):
    """Grow `contacts` into a region. Every intersection rewinds to the instant the FIRST segment
    reached that point: it terminates there and spawns one continuation aimed at the centre of mass
    (direction reset); later arrivals just join. A fixpoint re-simulates and prunes the future so
    junctions don't pile up. Returns (paths, nodes, matched)."""

    forced = []; seen = set()
    for _ in range(600):                                    # fixpoint with a true rewind: prune the future
        res = _simulate(contacts, grown, w, com, [p for p, _ in forced])
        if isinstance(res, _Done):
            return res.paths, res.nodes, res.matched
        P, sp = res.pt, res.stamp
        forced = [(p, s) for p, s in forced if s <= sp]     # delete every junction created after sp
        key = (round(float(P[0]), 1), round(float(P[1]), 1), int(sp))
        if key in seen:
            break
        seen.add(key); forced.append((P, sp))
    res = _simulate(contacts, grown, w, com, [p for p, _ in forced], final=True)
    return res.paths, res.nodes, res.matched


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
    """A region kept as a blob: trace its outer edge + holes from the ink mask, one pen-scale closing
    first. The closing (dilate-then-erode by 1) is the blob's SHAPING -- it fills sub-pen rim notches so
    a fill reads as one clean outline; it runs for EVERY blob here so the shape is uniform, rather than
    only as a side effect of `absorb_rim_stubs` re-tracing the blobs that happen to have a stub. No
    pen-width floor -- a blob mask is a `grown` region (seeded at d>0.90w, expanded to d>0.75w), so it is
    already >~1.5 pen wide everywhere and can't pinch off. A hole the pen actually left open (`holes_mask`)
    must survive even when the closing SEALS its narrow mouth: any such hole `_boundaries` couldn't trace
    is re-added as its own even-odd contour. Only holes the closing FULLY sealed are re-added (`& closed`) --
    a hole that survived closing is already in `holes`, and adding it twice would even-odd cancel it open.

    All of this runs in the blob's own bounding-box window, not the full supersampled frame -- one blob
    touches a tiny fraction of it, so cropping keeps the per-blob morphology + tracing off the whole
    image. Traced polygons are shifted back to full-frame coordinates on return."""
    # Each blob's outline is traced then decimated INWARD by up to POLY_TOL_W*w, so two abutting blobs
    # each recede from their shared border and leave a background sliver between them. Dilate the closure
    # by that same tolerance: neighbours now overlap by ~a pixel at the seam (drawn in node order, so it
    # reads solid) instead of gapping. It grows real paper holes / the silhouette inward by the same hair,
    # below the decimation's own error.
    grow = max(1, int(round(WC.POLY_TOL_W * w)))
    sl = WC.bbox_slice(mask, pad=grow + 2)                  # window the blob out of the full frame
    if sl is None:
        return None, []
    off = np.array([sl[1].start, sl[0].start], float)      # (x,y) shift back to full-frame coords
    closed = ndimage.binary_dilation(ndimage.binary_closing(mask[sl], iterations=1), iterations=grow)
    # `_boundaries` traces this colour's closure and cuts a hole at every interior gap >= a pen wide --
    # so a blob is hollow wherever ANOTHER colour (or real paper) sits inside it (§5, §6.2). The other
    # colour's own blob fills that hole from beneath, so a wide multi-colour region still tiles solid;
    # but the blob no longer claims -- or hit-tests over -- area that isn't its colour.
    outer, holes = WC._boundaries(closed, w)               # in window coords
    if outer is None:
        return None, []
    if holes_mask is not None and holes_mask[sl].any():
        h, wd = closed.shape
        im = Image.new("1", (wd, h), 0)
        ImageDraw.Draw(im).polygon([(float(x), float(y)) for x, y in outer], fill=1)
        enclosed = holes_mask[sl] & np.asarray(im, bool) & closed   # real holes closing sealed (not already traced)
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
                holes.append(rowcol_to_xy(hpoly))
    return outer + off, [hp + off for hp in holes]


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
def resolve(ink, force_fill=None):
    """Resolve one colour layer's 2D regions. Returns (skeleton, fills):
      skeleton -- carved stroke skeleton + the growth networks of junction regions + blob-bridge links,
                  ready for graph.build (blob interiors are absent, so they aren't skeletonized)
      fills    -- [(mask, centroid)] for every region kept as a solid blob. The boundary is NOT traced
                  here: rim-stub absorption folds ink into these masks first, so tracing waits until the
                  mask is final (vectorize._trace_blobs) and each blob is traced once, not twice.
    `force_fill` (see classify) makes aggregate-wide colour regions blobs rather than gappy strokes."""
    w = ink.w
    grown, skel, candidates, kept, snapped = classify(ink, force_fill)
    lab, _ = ndimage.label(grown, structure=np.ones((3, 3)))
    owned = {}; bynear = {}
    for near, edge, dv, L in blob_contacts(skel, grown, w):
        owned.setdefault(L, []).append((edge, dv))
        bynear.setdefault((round(float(near[0]), 1), round(float(near[1]), 1)), []).append((np.asarray(edge, float), L))

    net = skel.copy()
    fills = []

    def add_fill(mask):
        sl = WC.bbox_slice(mask, pad=0)                    # centroid off the blob's window, not a full-frame where()
        if sl is not None:                                 # boundary + holes traced later, once the mask
            ys, xs = np.where(mask[sl])                    # is final (post rim-stub absorption)
            fills.append((mask, (float(xs.mean()) + sl[1].start, float(ys.mean()) + sl[0].start)))

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
