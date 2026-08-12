"""Corner study: lay out every reasonable corner CANDIDATE across all scans as a zoom-in card, and let
the cards be re-ordered by different parameters (angle, longer side, shorter side, isolation, side
straightness) -- so the rule that separates real corners from texture can be found by eye rather than
guessed. Generated -> corner_study.html (a new artifact)."""
import os, sys, math, json, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
import fit
from fit import resample, _line_params, RESAMPLE_W, MIN_STEP, CORNER_STRAIGHT_W, CORNER_WIN2_W
from vectorize import vectorize
from model import BLOB

ISO = os.path.join(HERE, "..", "scan-to-svg", "out", "%s_iso.png")
OUT = os.path.join(HERE, "corner_study.html")
SUBJECTS = [("dying", "Hit soldier"), ("soldier", "Gunner’s SMG"), ("cannon", "Wheeled cannon"),
            ("mg", "Mounted MG"), ("flag", "Capture flag")]
ANGLE_LOW = 15.0        # a candidate must turn at least this much (deg) -- a low floor, the study reveals the cut
MIN_SIDE_W = 0.4        # ...and each side must run at least this many w (drops single-pixel texture bumps)
RUN_MAX_W = 10.0        # cap how far a straight side is grown, in w
APEX_HALF_W = 2.0       # search the corner vertex within ±this many w of the detected candidate
MOVE_PX = 2.0           # if the apex relocates a labelled candidate more than this many px, its old label may be stale


def _run(S, i, dirn, tol, maxw, closed, M):
    """Grow the straight run from i outward (dirn=±1) while collinear within tol. Returns (outward unit
    dir, arclength px, rms residual) -- the run stops at a bend/corner/end, so it measures the real side."""
    idx = [i % M]
    for s in range(1, maxw + 1):
        nj = i + dirn * s
        if not closed and (nj < 0 or nj >= M):
            break
        idx.append(nj % M)
        if len(idx) >= 3:
            arr = S[idx]; p0, d = _line_params(arr); e = arr - p0
            r = math.sqrt(((e - np.outer(e @ d, d)) ** 2).sum(1).mean())
            if r > tol:
                idx.pop(); break
    arr = S[idx]
    if len(arr) < 2:
        return None, 0.0, 0.0
    p0, d = _line_params(arr); e = arr - p0
    r = math.sqrt(((e - np.outer(e @ d, d)) ** 2).sum(1).mean())
    if d @ (arr[-1] - arr[0]) < 0:
        d = -d
    al = float(np.hypot(*np.diff(arr, axis=0).T).sum())
    return d, al, r


def side_dir(S, i, dirn, win, closed, M):
    """Direction of a short line fit to the ±win side of i, oriented OUTWARD from i. Fixed window: local
    enough to catch a curved-side/shallow corner, wide enough to wash out a single-pixel jog."""
    idx = [(i + dirn * s) % M for s in range(win + 1)] if closed else \
          [i + dirn * s for s in range(win + 1) if 0 <= i + dirn * s < M]
    if len(idx) < 2:
        return None
    arr = S[idx]; p0, d = _line_params(arr)
    if d @ (arr[-1] - arr[0]) < 0:
        d = -d
    return d


def candidates(S, w, step, closed):
    """Candidacy = a peak of the corner turn measured from FIXED-window side fits (inclusive: no straight
    gate). The green lines and the angle both come from these side directions, so number and picture agree.
    Side lengths / straightness are separate metrics from the adaptive runs, only to reason with."""
    M = len(S)
    if M < 6:
        return []
    win = max(3, int(round(CORNER_WIN2_W * w / step)))
    nms = max(2, int(round(1.0 * w / step)))
    tol = CORNER_STRAIGHT_W * w
    maxw = max(4, int(round(RUN_MAX_W * w / step)))
    ang = np.zeros(M); DL = [None] * M; DR = [None] * M
    for i in range(M):
        dl = side_dir(S, i, -1, win, closed, M); dr = side_dir(S, i, +1, win, closed, M)
        if dl is None or dr is None:
            continue
        DL[i], DR[i] = dl, dr
        ang[i] = math.degrees(math.acos(max(-1.0, min(1.0, float((-dl) @ dr)))))
    out = []
    for i in range(M):
        if ang[i] <= ANGLE_LOW:
            continue
        wnd = [ang[k % M] for k in range(i - nms, i + nms + 1)] if closed else \
              [ang[k] for k in range(max(0, i - nms), min(M, i + nms + 1))]
        if ang[i] < max(wnd) - 1e-9:
            continue
        if out and (i - out[-1]["i"]) < nms:
            if ang[i] > out[-1]["angle"]:
                out.pop()
            else:
                continue
        _, ll, el = _run(S, i, -1, tol, maxw, closed, M)
        _, lr, er = _run(S, i, +1, tol, maxw, closed, M)
        out.append(dict(i=i, angle=float(ang[i]), maxside=float(max(ll, lr)), minside=float(min(ll, lr)),
                        straight=float(max(el, er)), dl=DL[i], dr=DR[i], ll=float(ll), lr=float(lr)))
    return out


def cumlen(S, closed):
    seg = np.hypot(*np.diff(S, axis=0).T)
    cl = np.concatenate([[0.0], np.cumsum(seg)])
    total = cl[-1] + (math.hypot(*(S[0] - S[-1])) if closed else 0.0)
    return cl, total


def win_idx(S, i, closed, M, aback, afwd):
    back, acc, j = [], 0.0, i % M
    while acc < aback:
        nj = (j - 1) % M if closed else j - 1
        if (not closed and nj < 0) or len(back) > 300:
            break
        acc += math.hypot(*(S[j % M] - S[nj % M])); back.append(nj % M); j = nj
    fwd, acc, j = [], 0.0, i % M
    while acc < afwd:
        nj = (j + 1) % M if closed else j + 1
        if (not closed and nj >= M) or len(fwd) > 300:
            break
        acc += math.hypot(*(S[nj % M] - S[j % M])); fwd.append(nj % M); j = nj
    return list(reversed(back)) + [i % M] + fwd


def apex_index(S, c, w, closed, M):
    """The corner vertex is the point that sticks out furthest along the angle bisector -(dl+dr): project a
    small window around the detected candidate onto that direction and take the max. If the sides are ~opposite
    (a straight run, no real corner) there is no apex -- keep the candidate."""
    i = c["i"]; b = -(np.asarray(c["dl"]) + np.asarray(c["dr"])); nb = math.hypot(*b)
    if nb < 1e-6:
        return i
    b = b / nb
    wnd = win_idx(S, i, closed, M, APEX_HALF_W * w, APEX_HALF_W * w)
    return max(wnd, key=lambda k: float(S[k] @ b))


def poly(pts):
    return " ".join("%.1f,%.1f" % (x, y) for x, y in pts)


def card_svg(S, c, others, w, closed, M, ai):
    i = c["i"]
    idx = win_idx(S, i, closed, M, min(c["ll"], 5 * w) + w, min(c["lr"], 5 * w) + w)
    idxset = set(idx)
    arr = S[idx]
    x0, y0 = arr[:, 0].min(), arr[:, 1].min(); x1, y1 = arr[:, 0].max(), arr[:, 1].max()
    pad = max(3.0, 0.12 * max(x1 - x0, y1 - y0, 1))
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad
    W, H = max(x1 - x0, 1), max(y1 - y0, 1)
    sw = max(0.5, max(W, H) / 90.0)
    cx, cy = S[ai]                                                # dot + rays sit at the apex (corner vertex)
    dl, dr = c["dl"], c["dr"]; sl = min(c["ll"], 5 * w); srr = min(c["lr"], 5 * w)
    blue = "".join('<circle class="odot" cx="%.1f" cy="%.1f" r="%.2f"/>' % (S[o][0], S[o][1], sw * 1.4)
                   for o in others if o in idxset)                # other candidates visible in this window
    svg = ('<svg viewBox="%.1f %.1f %.1f %.1f" preserveAspectRatio="xMidYMid meet">'
           '<polyline class="cv" points="%s" stroke-width="%.2f"/>'
           '<!--RAYS-->'                                          # rays injected later (they may carry overrides)
           '%s<circle class="dot" cx="%.1f" cy="%.1f" r="%.2f"/></svg>'
           % (x0, y0, W, H, poly(arr), sw, blue, cx, cy, sw * 1.6))
    geom = dict(ax=float(cx), ay=float(cy), dl=[float(dl[0]), float(dl[1])], dr=[float(dr[0]), float(dr[1])],
                sl=float(sl), srr=float(srr), vw=sw * 0.8, hw=max(sw * 3.0, 1.5))
    return svg, sw * 1.6, geom


def ray_markup(card):
    """Two interactive rays from the corner. Each ALWAYS shows the computed fit (green .raydef, from
    data-defx/defy) and, when a correction is present and different, ALSO shows it (purple .rayovr, from
    data-dx/dy). A wide transparent hit line (offset off the vertex, so it stays clickable for spot-placing)
    runs along the effective ray and captures hover/click."""
    g = card["ray_geom"]; ax, ay = g["ax"], g["ay"]; out = []
    for key, ddef, ln in [("l", g["dl"], g["sl"]), ("r", g["dr"], g["srr"])]:
        ov = card.get("ray_" + key)                              # correction unit dir (from a label) or None
        cur = ov if ov else ddef                                 # effective dir (hit line runs along this)
        dtx, dty = ax + ddef[0] * ln, ay + ddef[1] * ln          # green computed endpoint
        otx, oty = ax + cur[0] * ln, ay + cur[1] * ln            # purple correction endpoint
        hx, hy = ax + cur[0] * ln * 0.25, ay + cur[1] * ln * 0.25
        hide = "" if ov else ' style="display:none"'
        out.append('<g class="ray%s" data-ray="%s" data-defx="%.4f" data-defy="%.4f" data-dx="%.4f" data-dy="%.4f" data-len="%.2f">'
                   '<line class="rayhit" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%.2f"/>'
                   '<line class="raydef" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%.2f"/>'
                   '<line class="rayovr" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke-width="%.2f"%s/></g>'
                   % (" ovr" if ov else "", key, ddef[0], ddef[1], cur[0], cur[1], ln,
                      hx, hy, otx, oty, g["hw"], ax, ay, dtx, dty, g["vw"], ax, ay, otx, oty, g["vw"], hide))
    return "".join(out)


cards = []
for key, sname in SUBJECTS:
    fit.STRATEGY = "spline"
    g = vectorize(ISO % key, milestone=8)
    step = max(MIN_STEP, RESAMPLE_W * g.w)
    num, dn = 0, {}
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            num += 1; dn[("blob", nd.id)] = num
    for e in g.edges.values():
        num += 1; dn[("seg", e.id)] = num
    comps = [("seg", dn[("seg", e.id)], np.asarray(e.pts, float), False) for e in g.edges.values()]
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 5:
            comps.append(("blob", dn.get(("blob", nd.id), 0), np.asarray(nd.ann.get("traced", nd.boundary), float), True))
    for kind, eid, P, closed in comps:
        S = resample(P, step, closed, g.w); M = len(S)     # corner-preserving, exactly as production sees it
        cs = candidates(S, g.w, step, closed)
        if not cs:
            continue
        cl, total = cumlen(S, closed)
        for c in cs:
            others = [o["i"] for o in cs if o is not c]
            if others:
                dd = [abs(cl[c["i"]] - cl[o]) for o in others]
                if closed:
                    dd = [min(d, total - d) for d in dd]
                dist = min(dd)
            else:
                dist = total
            # combined corner-likelihood (closest to the old straight-sides rule): a sharp turn AND the
            # shorter side staying straight for a real length (~the old ±win). Tight arcs have short sides.
            score = c["angle"] * min(1.0, c["minside"] / (CORNER_WIN2_W * g.w))
            ai = apex_index(S, c, g.w, closed, M)                 # relocate the candidate onto the corner vertex
            cx0, cy0 = float(S[c["i"], 0]), float(S[c["i"], 1])   # the raw detected candidate (pre-apex)
            svg, dotr, geom = card_svg(S, c, others, g.w, closed, M, ai)
            cards.append(dict(scan=sname, label="%s %d" % (kind, eid), x=float(S[ai, 0]), y=float(S[ai, 1]),
                              cand_x=cx0, cand_y=cy0, moved=float(math.hypot(S[ai, 0] - cx0, S[ai, 1] - cy0)),
                              dotr=dotr, ray_geom=geom, angle=c["angle"], maxside=c["maxside"], minside=c["minside"],
                              score=float(score), straight=c["straight"], dist=float(dist), svg=svg))
    print("  %-8s cumulative candidates: %d" % (key, len(cards)))

print("total candidate corners:", len(cards))

# persistent labels: read corner_labels.json (a list of {scan,comp,x,y,label}). Seed it, once, from the
# earlier hand-labelled locations. The artifact edits + exports this same file, so marks survive rebuilds.
LABELS_FILE = os.path.join(HERE, "corner_labels.json")
SEED = [("Mounted MG", "blob 1", 257, 233, "corner"), ("Mounted MG", "blob 3", 176, 282, "corner"),
        ("Wheeled cannon", "blob 1", 374, 106, "corner"), ("Wheeled cannon", "blob 1", 380, 113, "corner"),
        ("Gunner’s SMG", "seg 21", 360, 417, "not"), ("Gunner’s SMG", "seg 21", 361, 428, "corner"),
        ("Gunner’s SMG", "blob 1", 508, 469, "corner"), ("Gunner’s SMG", "blob 1", 521, 477, "corner"),
        ("Gunner’s SMG", "blob 1", 529, 476, "corner")]
if os.path.exists(LABELS_FILE):
    labels = json.load(open(LABELS_FILE))
else:
    labels = [dict(scan=s, comp=c, x=x, y=y, label=lab) for s, c, x, y, lab in SEED]
    json.dump(labels, open(LABELS_FILE, "w"), indent=1)
MARK_OF = {"corner": "want", "not": "notwant", "misplaced": "misplaced"}
for L in labels:                                          # apply each label to the nearest matching card
    best, bd = None, 1e9
    for c in cards:                                        # a stored label sits at the old candidate OR (once
        if c["scan"] == L["scan"] and c["label"] == L["comp"]:   # re-confirmed) at the apex -- match to either
            d = min(math.hypot(c["x"] - L["x"], c["y"] - L["y"]), math.hypot(c["cand_x"] - L["x"], c["cand_y"] - L["y"]))
            if d < bd:
                bd, best = d, c
    if best is not None and bd <= 10:
        best["mark"] = MARK_OF.get(L["label"], "")
        # stale = the apex relocated this card away from where the label was placed (label predates the apex)
        if best["moved"] > MOVE_PX and math.hypot(best["x"] - L["x"], best["y"] - L["y"]) > MOVE_PX:
            best["stale"] = True
            if L["label"] == "corner":                     # show the previously-approved spot as a gold circle
                best["gold"] = (best["cand_x"], best["cand_y"])
        if "cx" in L and "cy" in L:                        # a hand-placed true-corner spot
            best["cx"], best["cy"] = L["cx"], L["cy"]
        if L.get("angle_ok"):                              # angle validation + any corrected rays
            best["angle_ok"] = L["angle_ok"]
        if L.get("ray_l"):
            best["ray_l"] = L["ray_l"]
        if L.get("ray_r"):
            best["ray_r"] = L["ray_r"]
    else:
        print("  label has NO CANDIDATE: %s %s (%s,%s) %s (nearest %.1fpx)" % (L["scan"], L["comp"], L["x"], L["y"], L["label"], bd))
print("stale (moved labelled cards):", sum(1 for c in cards if c.get("stale")))

TABS = [("Likelihood", "score"), ("Angle", "angle"), ("Longer side", "maxside"),
        ("Shorter side", "minside"), ("Isolation", "dist"), ("Side straightness", "straight")]

STATDEFS = [("score", "likelihood", "%.0f"), ("angle", "angle", "%.0f°"), ("maxside", "long side", "%.0f px"),
            ("minside", "short side", "%.0f px"), ("dist", "isolation", "%.0f px"),
            ("straight", "straightness", "%.2f px")]

for a, _, _ in STATDEFS:                                   # percentile of each candidate per dimension
    vals = np.array([c[a] for c in cards], float)
    order = np.argsort(vals, kind="mergesort"); ranks = np.empty(len(vals)); ranks[order] = np.arange(len(vals))
    denom = max(1, len(vals) - 1)
    for k, c in enumerate(cards):
        c.setdefault("pct", {})[a] = float(ranks[k] / denom)

RADIO = [("", "none"), ("corner", "corner"), ("not", "not"), ("misplaced", "misp")]
ARADIO = [("", "none"), ("good", "good ∠"), ("wrong", "wrong ∠")]
card_html = ""
for ci, c in enumerate(cards):
    attrs = " ".join('data-%s="%.3f"' % (a, c[a]) for a, _, _ in STATDEFS)
    rows = "".join('<tr class="s-%s" style="background:linear-gradient(90deg,#e6e6e6 %.1f%%,transparent %.1f%%)">'
                   '<td>%s</td><td>%s</td></tr>' % (a, c["pct"][a] * 100, c["pct"][a] * 100, lbl, fmt % c[a])
                   for a, lbl, fmt in STATDEFS)
    lab = "".join('<label><input type="radio" name="l%d" value="%s">%s</label>' % (ci, v, t) for v, t in RADIO)
    alab = "".join('<label><input type="radio" name="a%d" value="%s">%s</label>' % (ci, v, t) for v, t in ARADIO)
    mark = c.get("mark", "")
    stale = " stale" if c.get("stale") else ""
    svg = c["svg"].replace("<!--RAYS-->", ray_markup(c))
    if "gold" in c:                                        # inject the previously-approved position as a gold ring
        gx, gy = c["gold"]
        svg = svg.replace("</svg>", '<circle class="gold" cx="%.1f" cy="%.1f" r="%.2f"/></svg>' % (gx, gy, c["dotr"]))
    card_html += ('<figure class="card %s%s" data-mark="%s" data-angleok="%s" data-scan="%s" data-comp="%s" data-x="%.0f" data-y="%.0f" data-cx="%s" data-cy="%s" %s>'
                  '<div class="gauge"><div class="fill"></div><div class="knob"></div></div>'
                  '<div class="body"><div class="loc">%s · %s · (%.0f,%.0f)</div>'
                  '<div class="pv">%s</div><table class="stats">%s</table>'
                  '<div class="labeler">%s</div><div class="labeler angle">%s</div></div></figure>'
                  % (mark, stale, mark, c.get("angle_ok", ""), c["scan"], c["label"], c["x"], c["y"],
                     c.get("cx", ""), c.get("cy", ""), attrs,
                     c["scan"], c["label"], c["x"], c["y"], svg, rows, lab, alab))

tabs_html = "".join('<button class="tab%s" data-k="%s">%s</button>' % (" on" if i == 0 else "", key, label)
                    for i, (label, key) in enumerate(TABS))

HTML = '''<title>corner study</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f6f5f2;color:#1a1c22;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  header{position:sticky;top:0;z-index:5;background:#fbfaf8;border-bottom:1px solid #e2e2de;padding:12px 22px}
  h1{font:600 16px/1.2 Georgia,serif;margin:0 0 3px} .sub{color:#777;font-size:12.5px;margin:0 0 9px}
  .tabs{display:flex;flex-wrap:wrap;gap:6px}
  .tab{font:600 12px/1 ui-monospace,Menlo,monospace;padding:7px 12px;border:1px solid #d3d3ce;border-radius:7px;cursor:pointer;background:#fff;color:#333}
  .tab.on{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:12px;padding:18px 22px 60px}
  .card{margin:0;background:#fff;border:1px solid #e4e4df;border-radius:9px;padding:8px;display:flex;align-items:stretch;gap:9px}
  .card.want{background:#dff3e4;border-color:#a9d9ba} .card.notwant{background:#fbe0e0;border-color:#eab0b0}
  .card.misplaced{background:#fdecd8;border-color:#f0c891}
  .card.stale{background-image:repeating-linear-gradient(45deg,rgba(70,70,80,.17) 0 5px,transparent 5px 12px);border-color:#9a9aa2}
  .card.want .pv,.card.notwant .pv,.card.misplaced .pv{background:transparent}
  .gold{fill:#e0a520;pointer-events:none}
  .labeler.angle{color:#7a5aa8}
  .labeler{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;font:11px ui-monospace,Menlo,monospace;color:#555}
  .labeler label{display:inline-flex;align-items:center;gap:2px;cursor:pointer}
  .labeler input{margin:0;cursor:pointer}
  .gauge{position:relative;width:9px;flex:0 0 9px;border-radius:5px;background:#ececec}
  .fill{position:absolute;bottom:0;left:0;right:0;border-radius:5px;min-height:3px;background:#bbb}
  .knob{position:absolute;left:50%%;bottom:0;transform:translate(-50%%,50%%);width:11px;height:11px;border-radius:50%%;background:#bbb;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.18)}
  .body{flex:1;min-width:0;display:flex;flex-direction:column}
  .loc{font:11px/1.35 ui-monospace,Menlo,monospace;color:#8a8a8a;margin-bottom:5px;word-break:break-word}
  .pv{background:#fcfbf9;border:1px solid #eee;border-radius:6px;aspect-ratio:1/1;overflow:hidden}
  .pv svg{width:100%%;height:100%%;display:block;cursor:crosshair}
  .spot{fill:#8b6fd6;pointer-events:none}
  .cv{fill:none;stroke:#333;stroke-linejoin:round;stroke-linecap:round;pointer-events:none}
  .dot{fill:#e8402f;pointer-events:none} .odot{fill:#2f6fb0;pointer-events:none}
  .raydef{fill:none;stroke:#2e9e4e;opacity:.7;stroke-linecap:round;pointer-events:none}   /* computed fit (always) */
  .rayovr{fill:none;stroke:#7d3cc9;opacity:.95;stroke-linecap:round;pointer-events:none}  /* your correction (if different) */
  .rayhit{fill:none;stroke:transparent;stroke-linecap:round;cursor:pointer}
  .ray:hover .raydef{stroke:#0f7a2e;opacity:1} .ray:hover .rayovr{opacity:1}              /* hover highlight */
  .ray.aim .rayovr{stroke-dasharray:3 3}                                                  /* following the mouse */
  .stats{border-collapse:collapse;margin-top:7px;font:11px/1.5 ui-monospace,Menlo,monospace;width:100%%}
  .stats td{padding:0 3px} .stats td:first-child{color:#8a8a8a} .stats td:last-child{text-align:right;color:#222}
  .stats tr.hi td{color:#c0392b;font-weight:700}
  .card:hover{border-color:#c9c9c4}
  .toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px;font-size:12.5px;color:#666}
  .btn{font:600 12px ui-monospace,Menlo,monospace;padding:6px 11px;border:1px solid #cfcfca;border-radius:7px;background:#fff;cursor:pointer;color:#333}
  #count{font:600 12px ui-monospace,Menlo,monospace;color:#333}
  .swatch{display:inline-block;width:11px;height:11px;border-radius:3px;vertical-align:-1px;margin:0 3px 0 8px}
  #expwrap{display:none;margin-top:9px}
  #exp{width:100%%;height:120px;font:11px/1.4 ui-monospace,Menlo,monospace;border:1px solid #ddd;border-radius:6px;padding:8px;margin-top:6px}
</style>
<header>
  <h1>Corner candidates — ordered to find the rule</h1>
  <p class="sub">Every reasonable candidate across all scans (turn ≥ %.0f°, each side ≥ %.1f·w). Re-order to see where real corners give way to texture. %d candidates.</p>
  <div class="tabs">%s</div>
  <div class="toolbar">
    <span>Label with each card's radio:<span class="swatch" style="background:#dff3e4;border:1px solid #a9d9ba"></span>corner<span class="swatch" style="background:#fbe0e0;border:1px solid #eab0b0"></span>not<span class="swatch" style="background:#fdecd8;border:1px solid #f0c891"></span>misplaced. Click the image to drop the <b style="color:#8b6fd6">true corner</b> (click the dot to remove).<br>The red dot is now the <b>apex</b> (snapped to the corner vertex). A <span class="swatch" style="background:repeating-linear-gradient(45deg,rgba(70,70,80,.5) 0 3px,transparent 3px 7px);border:1px solid #9a9aa2"></span>diagonal hatch means the apex moved a labelled point &gt;%.0fpx, so its label may be stale — re-pick a radio to clear it. A <b style="color:#e0a520">gold ring</b> marks where a corner was previously approved.<br><b style="color:#2e9e4e">Rays:</b> the <b style="color:#2e9e4e">green</b> ray is always the computed fit; your <b style="color:#7d3cc9">purple</b> correction is drawn over it when it differs. Hover to highlight, click to grab, move the mouse to aim, click again to set (the angle stat updates live). Then mark the angle <b>good ∠</b> / <b>wrong ∠</b> (auto-set to wrong when you move a ray; picking good ∠ discards the correction).<br>The computed (green) rays are an <b>arclength-weighted side fit anchored at the corner</b> — nearby samples dominate, weight falls off as exp(−arclength/τ). Drag <b>τ</b> to tune the falloff; smaller = more local. Moving the true-corner spot re-fits the angle at that location.</span>
    <span id="count"></span>
    <label style="display:inline-flex;align-items:center;gap:6px;color:#555">∠ weight decay τ <input type="range" id="tau" min="1.5" max="25" step="0.5" value="3" style="width:130px"> <span id="tauval" style="font:600 12px ui-monospace,Menlo,monospace">3</span> px</label>
    <button class="btn" id="expbtn">Export labels</button>
    <button class="btn" id="clrbtn">Clear my edits</button>
  </div>
  <div id="expwrap">
    <a id="dl" download="corner_labels.json" class="btn">⬇ download corner_labels.json</a>
    <span style="color:#888;font-size:12px"> — or copy the JSON below into <code>tools/pencil-vector/corner_labels.json</code></span>
    <textarea id="exp" readonly></textarea>
  </div>
</header>
<div class="grid" id="grid">%s</div>
<script>
  var grid=document.getElementById('grid');
  var cards=[].slice.call(grid.children);
  var BLUE=[40,90,205], ORANGE=[240,150,40];
  function lerp(h){ return 'rgb('+[0,1,2].map(function(i){return Math.round(ORANGE[i]+(BLUE[i]-ORANGE[i])*h);}).join(',')+')'; }
  (function setGauges(){                                  // gauge = combined corner-likelihood (fixed, not the sort)
    var vals=cards.map(function(c){ return parseFloat(c.dataset.score); });
    var mn=Math.min.apply(null,vals), mx=Math.max.apply(null,vals), rng=(mx-mn)||1;
    cards.forEach(function(c){
      var h=(parseFloat(c.dataset.score)-mn)/rng, col=lerp(h), pc=(h*100).toFixed(1)+'%%';
      var f=c.querySelector('.fill'), kn=c.querySelector('.knob');
      f.style.height=pc; f.style.background=col; kn.style.bottom=pc; kn.style.background=col;
    });
  })();
  function sortBy(k){
    cards.sort(function(a,b){ return parseFloat(b.dataset[k]) - parseFloat(a.dataset[k]); });
    cards.forEach(function(c){ grid.appendChild(c); });
    document.querySelectorAll('.tab').forEach(function(t){ t.classList.toggle('on', t.dataset.k===k); });
    document.querySelectorAll('.stats tr').forEach(function(r){ r.classList.remove('hi'); });
    document.querySelectorAll('.stats tr.s-'+k).forEach(function(r){ r.classList.add('hi'); });
  }
  document.querySelectorAll('.tab').forEach(function(t){ t.addEventListener('click',function(){ sortBy(t.dataset.k); }); });
  sortBy('score');

  // ---- labeling: per-card radios (none/corner/not/misplaced); persists in this browser, exports to JSON ----
  var LKEY='cornerlabels_v3', store;
  try{ store=JSON.parse(localStorage.getItem(LKEY)||'{}'); }catch(e){ store={}; }
  function cid(c){ return c.dataset.scan+'|'+c.dataset.comp+'|'+c.dataset.x+'|'+c.dataset.y; }
  function markToLabel(m){ return m==='want'?'corner':m==='notwant'?'not':m==='misplaced'?'misplaced':''; }
  function paint(c,m){ c.classList.remove('want','notwant','misplaced');
    if(m==='corner')c.classList.add('want'); else if(m==='not')c.classList.add('notwant'); else if(m==='misplaced')c.classList.add('misplaced'); }
  function count(){ var n={corner:0,not:0,misplaced:0}; for(var k in store){ if(n[store[k]]!==undefined)n[store[k]]++; }
    var g=0,wr=0; for(var k2 in angs){ if(angs[k2].ok==='good')g++; else if(angs[k2].ok==='wrong')wr++; }
    document.getElementById('count').textContent=n.corner+' corner · '+n.not+' not · '+n.misplaced+' misplaced · '+g+' good∠ · '+wr+' wrong∠'; }
  // hand-placed true-corner spots: click the image to place/move; click the dot to remove
  var SKEY='cornerspots_v2', spots;
  try{ spots=JSON.parse(localStorage.getItem(SKEY)||'{}'); }catch(e){ spots={}; }
  function drawSpot(svg,s){ var o=svg.querySelector('.spot'); if(o)o.remove(); if(!s)return;
    var r=Math.max(svg.viewBox.baseVal.width,svg.viewBox.baseVal.height)/56.25, c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('class','spot'); c.setAttribute('cx',s.x); c.setAttribute('cy',s.y); c.setAttribute('r',r); svg.appendChild(c); }
  cards.forEach(function(c){
    var id=cid(c), m=(id in store)?store[id]:markToLabel(c.dataset.mark);
    if(m) store[id]=m; paint(c,m);
    var radios=c.querySelectorAll('.labeler:not(.angle) input');
    radios.forEach(function(r){ if(r.value===m) r.checked=true;
      r.addEventListener('change',function(){
        var v=r.value; if(v) store[id]=v; else delete store[id];
        paint(c,v); localStorage.setItem(LKEY,JSON.stringify(store)); count();
      });
      r.addEventListener('click',function(){                // click (even re-picking the same label) confirms
        c.classList.remove('stale'); var g=c.querySelector('.gold'); if(g)g.remove();  // re-decided -> not stale
      });
    });
    var svg=c.querySelector('.pv svg');
    if(!(id in spots) && c.dataset.cx!==''){ spots[id]={x:+c.dataset.cx, y:+c.dataset.cy}; }
    if(spots[id]) drawSpot(svg, spots[id]);
    svg.addEventListener('click',function(e){
      if(aim){ commitAim(); return; }                    // a ray edit is in progress -> this click sets it
      var ctm=svg.getScreenCTM(); if(!ctm)return;
      var p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; var l=p.matrixTransform(ctm.inverse());
      var nx=Math.round(l.x*10)/10, ny=Math.round(l.y*10)/10, cur=spots[id], r=Math.max(svg.viewBox.baseVal.width,svg.viewBox.baseVal.height)/56.25;
      if(cur && Math.hypot(cur.x-nx,cur.y-ny) < r*1.5){ delete spots[id]; drawSpot(svg,null); }
      else { spots[id]={x:nx,y:ny}; drawSpot(svg,spots[id]); }
      localStorage.setItem(SKEY, JSON.stringify(spots));
      applyDefaults(c); redrawRays(c); showAngle(c);      // re-pivot + re-fit the rays onto the moved true corner
    });
  });
  localStorage.setItem(LKEY,JSON.stringify(store)); count();

  // ---- angle validation: drag each ray to correct it, then mark the angle good/wrong (persists + exports) ----
  var AKEY='cornerangles_v1', angs;
  try{ angs=JSON.parse(localStorage.getItem(AKEY)||'{}'); }catch(e){ angs={}; }
  var aim=null;                                            // {g:rayGroup} while a ray follows the mouse
  function svgpt(svg,e){ var ctm=svg.getScreenCTM(); if(!ctm)return null;
    var p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; return p.matrixTransform(ctm.inverse()); }
  function pivotXY(c){ var id=cid(c);                      // rays pivot at the hand-placed true corner if any
    if(spots[id]) return [spots[id].x, spots[id].y]; return [+c.dataset.x, +c.dataset.y]; }
  function lineTo(el,a,t){ el.setAttribute('x1',a[0]); el.setAttribute('y1',a[1]); el.setAttribute('x2',t[0]); el.setAttribute('y2',t[1]); }
  function tipOf(g,d){ var a=pivotXY(g.closest('.card')), L=+g.dataset.len; return [a[0]+d[0]*L, a[1]+d[1]*L]; }
  function effDir(g){ return g.classList.contains('ovr') ? [+g.dataset.dx,+g.dataset.dy] : [+g.dataset.defx,+g.dataset.defy]; }
  function paintRay(g){                                    // green = computed fit (always); purple = correction (if present & >~1.5° off)
    var a=pivotXY(g.closest('.card')), def=[+g.dataset.defx,+g.dataset.defy], ov=[+g.dataset.dx,+g.dataset.dy], iso=g.classList.contains('ovr');
    lineTo(g.querySelector('.raydef'), a, tipOf(g,def));
    var po=g.querySelector('.rayovr'), diff = iso && (def[0]*ov[0]+def[1]*ov[1] < 0.99966);
    if(diff){ lineTo(po, a, tipOf(g,ov)); po.style.display=''; } else { po.style.display='none'; }
    var eff = iso?ov:def, t=tipOf(g,eff); lineTo(g.querySelector('.rayhit'), [a[0]+(t[0]-a[0])*0.25, a[1]+(t[1]-a[1])*0.25], t); }
  function aimTo(g, tip){                                  // during a drag: purple correction follows the mouse; green stays put
    var a=pivotXY(g.closest('.card')), dx=tip[0]-a[0], dy=tip[1]-a[1], L=Math.hypot(dx,dy)||1;
    g.dataset.dx=dx/L; g.dataset.dy=dy/L; g.classList.add('ovr');
    var po=g.querySelector('.rayovr'); po.style.display=''; lineTo(po, a, tip);
    lineTo(g.querySelector('.rayhit'), [a[0]+dx*0.25, a[1]+dy*0.25], tip);
    lineTo(g.querySelector('.raydef'), a, tipOf(g,[+g.dataset.defx,+g.dataset.defy])); }
  function redrawRays(c){ c.querySelectorAll('.ray').forEach(paintRay); }
  // ---- angle = distance-weighted side fit anchored at the pivot: nearby samples dominate, weight decays exp(-r/τ) ----
  var TAUKEY='cornertau_v2', TAU=3;
  try{ var _tv=localStorage.getItem(TAUKEY); if(_tv!==null) TAU=+_tv; }catch(e){}
  function curvePts(c){ if(c._pts) return c._pts; var cv=c.querySelector('.cv');
    c._pts = cv ? cv.getAttribute('points').trim().split(/\\s+/).map(function(s){ var a=s.split(','); return [+a[0],+a[1]]; }) : [];
    return c._pts; }
  function nearestIdx(pts,q){ var bi=0,bd=Infinity; for(var k=0;k<pts.length;k++){ var dx=pts[k][0]-q[0],dy=pts[k][1]-q[1],d=dx*dx+dy*dy; if(d<bd){bd=d;bi=k;} } return bi; }
  function wdir(pts,p,step,piv){                           // weighted principal dir through the pivot; weight decays with ARCLENGTH along the edge (robust to a boundary that curls back near the corner)
    var a=0,b=0,cc=0,rx=0,ry=0,arc=0,px=pts[p][0],py=pts[p][1];
    for(var s=0;;s++){ var k=p+step*s; if(k<0||k>=pts.length) break;
      var x=pts[k][0], y=pts[k][1]; if(s>0){ arc+=Math.hypot(x-px,y-py); px=x; py=y; }
      var vx=x-piv[0], vy=y-piv[1];
      if(s>2 && arc>8*TAU) break;                          // past here the weight is negligible
      var w=Math.exp(-arc/TAU); a+=w*vx*vx; b+=w*vx*vy; cc+=w*vy*vy; if(s>=1){ rx+=vx; ry+=vy; } }
    var t=(a+cc)/2, disc=Math.sqrt(((a-cc)/2)*((a-cc)/2)+b*b), lam=t+disc, dx,dy;
    if(Math.abs(b)>1e-9){ dx=lam-cc; dy=b; } else if(a>=cc){ dx=1; dy=0; } else { dx=0; dy=1; }
    var L=Math.hypot(dx,dy)||1; dx/=L; dy/=L; if(dx*rx+dy*ry<0){ dx=-dx; dy=-dy; } return [dx,dy]; }
  function computeDefaults(c){ var pts=curvePts(c); if(pts.length<3) return;
    var piv=pivotXY(c), p=nearestIdx(pts,piv), dl=wdir(pts,p,-1,piv), dr=wdir(pts,p,1,piv);
    var gl=c.querySelector('.ray[data-ray=l]'), gr=c.querySelector('.ray[data-ray=r]');
    gl.dataset.defx=dl[0]; gl.dataset.defy=dl[1]; gr.dataset.defx=dr[0]; gr.dataset.defy=dr[1]; }
  function applyDefaults(c){ computeDefaults(c);           // push the weighted dirs into the non-overridden rays
    c.querySelectorAll('.ray').forEach(function(g){ if(!g.classList.contains('ovr')){ g.dataset.dx=g.dataset.defx; g.dataset.dy=g.dataset.defy; } }); }
  function cardAngle(c){                                   // turn angle from the two effective ray dirs (correction if any, else fit)
    var l=effDir(c.querySelector('.ray[data-ray=l]')), r=effDir(c.querySelector('.ray[data-ray=r]'));
    var d=Math.max(-1,Math.min(1,(-l[0])*r[0]+(-l[1])*r[1])); return Math.acos(d)*180/Math.PI; }
  function showAngle(c){ var a=cardAngle(c); c.dataset.angle=a.toFixed(3);
    var cell=c.querySelector('tr.s-angle td:last-child'); if(cell)cell.textContent=Math.round(a)+'°'; }
  function setARadio(c,v){ c.querySelectorAll('.labeler.angle input').forEach(function(r){ r.checked=(r.value===v); }); }
  function recordRays(c){ var id=cid(c), a=angs[id]||(angs[id]={ok:''});
    c.querySelectorAll('.ray').forEach(function(g){ if(g.classList.contains('ovr'))
      a[g.dataset.ray]=[+(+g.dataset.dx).toFixed(4), +(+g.dataset.dy).toFixed(4)]; else delete a[g.dataset.ray]; }); }
  function revertRays(c){ computeDefaults(c); c.querySelectorAll('.ray').forEach(function(g){ g.classList.remove('ovr','aim');
    g.dataset.dx=g.dataset.defx; g.dataset.dy=g.dataset.defy; paintRay(g); });
    if(aim && aim.g.closest('.card')===c) aim=null; }
  function persistA(){ localStorage.setItem(AKEY, JSON.stringify(angs)); }
  function commitAim(){ if(!aim)return; var g=aim.g, c=g.closest('.card'); g.classList.remove('aim'); g.classList.add('ovr');
    paintRay(g);                                          // snap purple to fixed length; green stays as reference
    var id=cid(c); angs[id]=angs[id]||{ok:''}; angs[id].ok='wrong'; setARadio(c,'wrong'); recordRays(c); showAngle(c); persistA(); aim=null; }
  cards.forEach(function(c){
    var id=cid(c), svg=c.querySelector('.pv svg');
    if(!(id in angs)){                                     // seed from the baked DOM (Python drew any overrides)
      var o={ok:c.dataset.angleok||''};
      c.querySelectorAll('.ray.ovr').forEach(function(g){ o[g.dataset.ray]=[+g.dataset.dx,+g.dataset.dy]; });
      angs[id]=o;
    } else {                                               // browser has newer edits -> restore override dirs/classes
      var a=angs[id]; ['l','r'].forEach(function(k){ var g=c.querySelector('.ray[data-ray='+k+']');
        if(a[k]){ g.classList.add('ovr'); g.dataset.dx=a[k][0]; g.dataset.dy=a[k][1]; }
        else { g.classList.remove('ovr'); } });
    }
    applyDefaults(c);                                      // weighted-at-pivot dirs for the non-overridden rays
    setARadio(c, angs[id].ok||''); redrawRays(c); showAngle(c);   // rays pivot at the true-corner spot if any
    c.querySelectorAll('.ray').forEach(function(g){        // click a ray to aim it, click again to set it
      g.addEventListener('click',function(e){ e.stopPropagation(); if(aim) commitAim(); else { aim={g:g}; g.classList.add('aim'); } }); });
    svg.addEventListener('mousemove',function(e){ if(!aim || aim.g.closest('.card')!==c) return;
      var l=svgpt(svg,e); if(l) { aimTo(aim.g,[l.x,l.y]); showAngle(c); } });
    c.querySelectorAll('.labeler.angle input').forEach(function(r){ r.addEventListener('change',function(){
      var v=r.value, id2=cid(c); angs[id2]=angs[id2]||{ok:''}; angs[id2].ok=v;
      if(v!=='wrong') revertRays(c);                       // good / none discard any manual ray edits
      recordRays(c); showAngle(c); persistA(); }); });
  });
  persistA();
  (function(){ var sl=document.getElementById('tau'), tv=document.getElementById('tauval');
    sl.value=TAU; tv.textContent=TAU;
    sl.addEventListener('input',function(){ TAU=+sl.value; tv.textContent=TAU;
      try{ localStorage.setItem(TAUKEY, String(TAU)); }catch(e){}
      cards.forEach(function(c){ applyDefaults(c); redrawRays(c); showAngle(c); }); }); })();
  document.getElementById('expbtn').addEventListener('click',function(){
    var out=[]; cards.forEach(function(c){ var id=cid(c), m=store[id], s=spots[id], a=angs[id];
      var hasA=a&&(a.ok||a.l||a.r);
      if(m||s||hasA){ var o={scan:c.dataset.scan,comp:c.dataset.comp,x:+c.dataset.x,y:+c.dataset.y,label:m||''};
        if(s){ o.cx=s.x; o.cy=s.y; }
        if(a){ if(a.ok)o.angle_ok=a.ok; if(a.l)o.ray_l=a.l; if(a.r)o.ray_r=a.r; } out.push(o); } });
    var txt=JSON.stringify(out,null,1);
    document.getElementById('expwrap').style.display='block';
    var t=document.getElementById('exp'); t.value=txt; t.focus(); t.select();
    document.getElementById('dl').href='data:application/json;charset=utf-8,'+encodeURIComponent(txt);
  });
  document.getElementById('clrbtn').addEventListener('click',function(){ localStorage.removeItem(LKEY); localStorage.removeItem(SKEY); localStorage.removeItem(AKEY); localStorage.removeItem(TAUKEY); location.reload(); });
</script>''' % (ANGLE_LOW, MIN_SIDE_W, len(cards), tabs_html, MOVE_PX, card_html)

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
