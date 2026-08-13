"""spline pipeline inspector: the smoothing-spline stages for EVERY scan (switcher at top), at fixed
smoothing (SPLINE_LAMBDA=5). A 'detail' slider sets the primitive-emission tolerance (HUG_TOL_W): the
Pieces stage re-fits the curve into hugging line/arc pieces at that tolerance, and the readout shows how
many data points the output carries. Generated -> spline_pipeline.html (artifact)."""
import os, sys, math, base64, io, re, json, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from scipy.ndimage import gaussian_filter1d
from skimage.restoration import denoise_tv_chambolle
from PIL import Image
import fit
from fit import (resample_corners, _Prefix, RESAMPLE_W, MIN_STEP)
from vectorize import vectorize
from ink import ingest
from model import BLOB
from svgdump import dump

_VISPATH = re.compile(r'data-(?:blob|edge)="[^"]*"[^>]*?\bd="([^"]*)"')
_PATHCMD = re.compile(r'[MLHVCSQTAZ]', re.I)


def count_datapoints(g):                                  # same measure as the hug-vs-arcs artifact
    return sum(len(_PATHCMD.findall(m.group(1))) for m in _VISPATH.finditer(dump(g, charm=0.0, primitives=True)))

ISO = os.path.join(HERE, "..", "scan-to-svg", "out", "%s_iso.png")
OUT = os.path.join(HERE, "spline_pipeline.html")
SUBJECTS = [("dying", "Hit soldier"), ("soldier", "Gunner’s SMG"), ("cannon", "Wheeled cannon"),
            ("mg", "Mounted MG"), ("flag", "Capture flag")]
LAM = 5.0                                                  # smoothing is fixed now (was the old slider)
TOL_VALUES = [0.40, 0.24, 0.16, 0.12, 0.08, 0.04]          # HUG_TOL_W: coarse (few pts) -> fine (many pts)
DEFAULT_TI = 3
fit.SPLINE_LAMBDA = LAM


TV_KAPPA_W = 0.30                                         # TV/L1 denoise weight on kappa(s), in units of w


def _turning(P, closed):
    """Signed curvature per sample (rad per step) from the tangent-angle increments -- for the
    curvature readout only; the production fit (fit.py) no longer computes a turning function."""
    d = np.diff(np.vstack([P, P[:1]]) if closed else P, axis=0)
    ang = np.arctan2(d[:, 1], d[:, 0])
    dth = np.diff(np.concatenate([ang[-1:], ang]) if closed else ang)
    dth = (dth + np.pi) % (2 * np.pi) - np.pi             # wrap to (-pi, pi]
    if closed:
        return dth
    return np.concatenate([[0.0], dth, [0.0]])


def trace_base(P, w, closed, anchors):
    """Everything the λ-fixed stages need (resample, corners, smoothed curve C, its curvature), plus the
    _Prefix and break set the Pieces stage reuses to re-fit hugging primitives at any tolerance."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S, corners_v = resample_corners(np.asarray(P, float), step, closed, w); M = len(S)   # corner-preserving (matches production)
    if M < 2:
        return None
    s_arc = np.arange(M, dtype=float) * step
    if M < 5:                                              # too short: the real fit emits one straight line
        C = S.copy()
        return dict(S=S, C=C, step=step, closed=closed, arclen=float(s_arc[-1]), kap=np.zeros(M),
                    cands=[], jumps={}, anchors=[], cornerset=set(), pre=_Prefix(C), breaks=[])
    cornerset = set(corners_v)                             # reuse the corners resample_corners already detected
    anchor_ix = []
    for ax, ay in (anchors or []):
        k = int(np.hypot(S[:, 0] - ax, S[:, 1] - ay).argmin())
        if 0 <= k < M:
            anchor_ix.append(k)
    breaks = cornerset | set(anchor_ix)
    d_rows = []
    for k in (range(M) if closed else range(1, M - 1)):
        km, kp = (k - 1) % M, (k + 1) % M
        if k in breaks or km in breaks or kp in breaks:
            continue
        row = np.zeros(M); row[km] += 1.0; row[k] += -2.0; row[kp] += 1.0
        d_rows.append(row)
    D = np.array(d_rows) if d_rows else np.zeros((0, M))
    C = np.linalg.solve(np.eye(M) + LAM * (D.T @ D), S)
    for k in anchor_ix:
        lo, hi = max(0, k - 1), min(M, k + 2); C[lo:hi] = S[lo:hi]
    kappa = denoise_tv_chambolle(_turning(C, closed), weight=TV_KAPPA_W * w * step) / step
    ts = gaussian_filter1d(_turning(S, closed), 0.5, mode="wrap" if closed else "nearest")
    return dict(S=S, C=C, step=step, closed=closed, arclen=float(s_arc[-1]), kap=kappa,
                cands=sorted(cornerset), anchors=anchor_ix, jumps={c: float(ts[c]) for c in cornerset},
                cornerset=cornerset, pre=_Prefix(C),
                breaks=sorted(cornerset | {(k + 1) % M for k in anchor_ix}))


def hug_pieces(tr, w, tol):
    """Re-fit the smoothed curve C into the fewest hugging line/arc pieces within `tol` (HUG_TOL_W*w)."""
    C = tr["C"]; M = len(C)
    if M < 5:
        return [dict(i=0, j=M, kind="line", R=None, corner_in=False)]
    fit.HUG_TOL_W = tol
    out = []
    for i, j, (kind, par) in fit._hug_spans(C, tr["pre"], tr["breaks"], w):
        out.append(dict(i=i, j=j, kind=kind, R=(float(par[1]) if kind == "arc" else None),
                        center=([float(par[0][0]), float(par[0][1])] if kind == "arc" else None),
                        corner_in=(i in tr["cornerset"])))
    return out


# ---- precompute every scan ----
def ink_png(mask):
    rgba = np.zeros((*mask.shape, 4), np.uint8); rgba[mask] = (150, 145, 135, 90)
    b = io.BytesIO(); Image.fromarray(rgba).save(b, format="PNG", optimize=True)
    return base64.b64encode(b.getvalue()).decode()


SCANS, allkap = [], []
for key, sname in SUBJECTS:
    ink = ingest(np.asarray(Image.open(ISO % key).convert("RGB")))
    counts, g = [], None
    for tol in TOL_VALUES:                                # the honest output size: the real asset at each tol
        fit.HUG_PRIMITIVES = True; fit.HUG_TOL_W = tol
        gt = vectorize(ISO % key, milestone=8)
        counts.append(count_datapoints(gt))
        if g is None: g = gt                              # raw geometry is tol-independent -> trace from any
    fit.HUG_PRIMITIVES = False
    s2e = {e.sid: e for e in g.edges.values()}
    num, dn = 0, {}
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
            num += 1; dn[("blob", nd.id)] = num
    for e in g.edges.values():
        num += 1; dn[("seg", e.id)] = num
    items = []
    for e in g.edges.values():
        tr = trace_base(e.pts, g.w, False, None)
        if tr: items.append(("seg", dn[("seg", e.id)], tr))
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 5:
            tr = trace_base(nd.ann.get("traced", nd.boundary), g.w, True, fit._blob_anchors(nd, s2e, g.w))
            if tr: items.append(("blob", dn.get(("blob", nd.id), 0), tr))
    pieces_by_tol = [[hug_pieces(tr, g.w, tol) for _, _, tr in items] for tol in TOL_VALUES]
    allkap.append(np.concatenate([tr["kap"] * tr["step"] for _, _, tr in items]) if items else np.zeros(1))
    SCANS.append(dict(key=key, name=sname, w=g.w, wd=ink.mask.shape[1], hd=ink.mask.shape[0],
                      ink=ink_png(ink.mask), items=items, pieces_by_tol=pieces_by_tol, counts=counts))
    print("  %-8s %d components, data pts %s" % (key, len(items), counts))

VMAX_KAP = float(np.percentile(np.abs(np.concatenate(allkap)), 92)) or 0.1
print("wrote counts; VMAX_KAP=%.3f" % VMAX_KAP)


# ---- rendering helpers ----
DIV_NEG, DIV_MID, DIV_POS = (40, 90, 205), (240, 150, 40), (200, 30, 30)
KCOL = {"line": "#2f6fb0", "arc": "#2e9e4e"}
TICK_HALF = 4.0


def col_div(v, vmax):
    t = max(-1.0, min(1.0, v / vmax)); end = DIV_POS if t >= 0 else DIV_NEG
    return "rgb(%d,%d,%d)" % tuple(int(round(DIV_MID[i] + (end[i] - DIV_MID[i]) * abs(t))) for i in range(3))


def boundary_tick(rec, i, M, closed):
    a = rec[(i - 1) % M] if closed else rec[max(0, i - 1)]
    b = rec[(i + 1) % M] if closed else rec[min(M - 1, i + 1)]
    t = b - a; n = math.hypot(t[0], t[1])
    if n < 1e-6:
        return ""
    px, py = -t[1] / n * TICK_HALF, t[0] / n * TICK_HALF; x, y = rec[i]
    return '<line class="tick" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (x - px, y - py, x + px, y + py)


def poly(pts):
    return " ".join("%.1f,%.1f" % (x, y) for x, y in pts)


def _cl(pts, closed):
    return np.vstack([pts, pts[:1]]) if (closed and len(pts) >= 2) else pts


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")


def svg_open(sc):
    return ('<svg viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet">'
            '<image x="-0.5" y="-0.5" width="%d" height="%d" href="data:image/png;base64,%s"/>'
            % (sc["wd"], sc["hd"], sc["wd"], sc["hd"], sc["ink"]))


def hit(pts, info):
    return '<polyline class="hit" points="%s" data-i="%s"/>' % (poly(pts), esc(info))


def stage_resample(tr, name):
    cp = _cl(tr["S"], tr["closed"])
    info = "%s · resampled · %d samples · arc %.0f px · step %.1f" % (name, len(tr["S"]), tr["arclen"], tr["step"])
    return '<polyline class="wire" points="%s"/>%s' % (poly(cp), hit(cp, info))


def stage_corners(tr, name):
    pts = tr["S"]; cp = _cl(pts, tr["closed"]); out = '<polyline class="wire" points="%s"/>' % poly(cp)
    for k in tr["anchors"]:
        x, y = pts[k]
        out += ('<rect class="anchor" x="%.1f" y="%.1f" width="6" height="6" data-i="%s"/>'
                % (x - 3, y - 3, esc("%s · anchor @ (%.0f,%.0f) · pinned to trace" % (name, x, y))))
    for c in tr["cands"]:
        x, y = pts[c]
        out += ('<circle class="corner" cx="%.1f" cy="%.1f" r="3.2" data-i="%s"/>'
                % (x, y, esc("%s · corner @ (%.0f,%.0f) · turn %.0f°" % (name, x, y, math.degrees(tr["jumps"][c])))))
    return out + hit(cp, "%s · %d corner(s) · %d anchor(s)" % (name, len(tr["cands"]), len(tr["anchors"])))


def stage_smoothed(tr, name):
    S, C, closed = tr["S"], tr["C"], tr["closed"]; dev = np.hypot(*(C - S).T)
    out = '<polyline class="wire" points="%s"/>' % poly(_cl(S, closed))
    info = "%s · smoothed (λ=%g) · pull max %.1f mean %.1f px" % (name, LAM, dev.max(), dev.mean())
    return out + '<polyline class="smooth" points="%s"/>%s' % (poly(_cl(C, closed)), hit(_cl(C, closed), info))


def stage_kappa(tr, name):
    pts = tr["C"]; M = len(pts); sig = tr["kap"] * tr["step"]; segs = ""
    for k in range(M if tr["closed"] else M - 1):
        k2 = (k + 1) % M
        segs += '<polyline class="seg" points="%.1f,%.1f %.1f,%.1f" stroke="%s"/>' % (
            pts[k, 0], pts[k, 1], pts[k2, 0], pts[k2, 1], col_div(sig[k], VMAX_KAP))
    return segs + hit(_cl(pts, tr["closed"]), "%s · curvature of smoothed curve · peak %.3f" % (name, np.abs(sig).max()))


def arc_poly(c, R, p0, p1, n=16):
    c = np.asarray(c, float)
    a0 = math.atan2(p0[1] - c[1], p0[0] - c[0]); a1 = math.atan2(p1[1] - c[1], p1[0] - c[0])
    d = a1 - a0
    while d > math.pi:
        d -= 2 * math.pi
    while d < -math.pi:
        d += 2 * math.pi
    t = np.linspace(a0, a0 + d, n)
    return np.column_stack([c[0] + R * np.cos(t), c[1] + R * np.sin(t)])


def piece_geom(tr, p):                                    # the ACTUAL emitted primitive (chord / arc), not C
    C = tr["C"]; M = len(C); i, j = p["i"], p["j"]
    jb = j if j < M else (0 if tr["closed"] else M - 1)   # bridge to where the next piece starts
    p0, p1 = C[i], C[jb]
    if p["kind"] == "arc" and p["center"] is not None and p["R"]:
        return arc_poly(p["center"], p["R"], p0, p1)
    return np.array([p0, p1])                             # line = straight chord


def stage_pieces(tr, name, pieces):
    C = tr["C"]; M = len(C); closed = tr["closed"]
    out = '<polyline class="cref" points="%s"/>' % poly(_cl(C, closed))    # faint smoothed curve, for reference
    ticks = ""; dots = ""
    for pid, p in enumerate(pieces, 1):
        i, j = p["i"], p["j"]
        if i > 0 or closed:
            ticks += boundary_tick(C, i % M, M, closed)
        seg = piece_geom(tr, p)
        if len(seg) < 2:
            continue
        det = ("R=%.0f" % p["R"]) if p["kind"] == "arc" else "line"
        info = "%s · piece %d · %s [%d:%d] · %s" % (name, pid, p["kind"], i, j, det)
        out += '<polyline class="piece" points="%s" stroke="%s"/>%s' % (poly(seg), KCOL[p["kind"]], hit(seg, info))
        if p["corner_in"] and i < M:
            x, y = C[i]
            dots += '<circle class="corner" cx="%.1f" cy="%.1f" r="3.2" data-i="%s"/>' % (x, y, esc("%s · corner @ (%.0f,%.0f)" % (name, x, y)))
    return out + ticks + dots


STAGES = [("resample", "1 · Resample", stage_resample), ("corners", "2 · Corners", stage_corners),
          ("smoothed", "3 · Smoothed", stage_smoothed), ("kappa", "4 · Curvature κ", stage_kappa),
          ("pieces", "5 · Pieces", stage_pieces)]

LEGENDS = {
    "resample": '<span><i style="background:#888"></i>resampled polyline — uniform arc-length samples</span>',
    "corners": ('<span><i style="background:#d81f1f;border-radius:50%"></i>detected corner</span>'
                '<span><i style="background:#7a3ff2"></i>attachment anchor</span>'),
    "smoothed": ('<span><i style="background:#888"></i>raw samples</span><span><i style="background:#2f6fb0"></i>smoothing spline (λ=5)</span>'),
    "kappa": ('<span>curvature κ·step:</span><span class="grad"></span>'
              '<span class="gl">−%.2f</span><span class="gl">0</span><span class="gl">+%.2f</span>' % (VMAX_KAP, VMAX_KAP)),
    "pieces": ('<span><i style="background:#2f6fb0"></i>line</span><span><i style="background:#2e9e4e"></i>arc</span>'
               '<span><i style="background:#d81f1f"></i>corner</span><span><i style="background:#c9c9c9"></i>smoothed curve</span>'
               '<span style="color:#888">emitted primitives vs the curve — coarser detail = looser fit, fewer pieces</span>'),
}
legend_html = "".join('<div class="leg leg-%s">%s</div>' % (s[0], LEGENDS[s[0]]) for s in STAGES)

panels = ""
for si, sc in enumerate(SCANS):
    items = sc["items"]
    for sid, label, fn in STAGES:
        if sid == "pieces":
            for ti in range(len(TOL_VALUES)):
                body = svg_open(sc)
                for ci, (kind, eid, tr) in enumerate(items):
                    body += '<g>%s</g>' % fn(tr, "%s %d" % (kind, eid), sc["pieces_by_tol"][ti][ci])
                panels += '<div class="stage" data-scan="%d" data-stage="pieces" data-tol="%d"><div class="wrap">%s</svg></div></div>' % (si, ti, body)
        else:
            body = svg_open(sc)
            for kind, eid, tr in items:
                body += '<g>%s</g>' % fn(tr, "%s %d" % (kind, eid))
            panels += '<div class="stage" data-scan="%d" data-stage="%s"><div class="wrap">%s</svg></div></div>' % (si, sid, body)

scan_btns = "".join('<button class="pick" data-kind="scan" data-v="%d">%s</button>' % (i, sc["name"]) for i, sc in enumerate(SCANS))
stage_btns = "".join('<button class="pick" data-kind="stage" data-v="%s">%s</button>' % (s[0], s[1]) for s in STAGES)
COUNTS = [sc["counts"] for sc in SCANS]

HTML = '''<title>spline pipeline</title>
<style>
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1c22;background:#f6f5f2}
  header{position:sticky;top:0;z-index:5;background:#fbfaf8;border-bottom:1px solid #e2e2de;padding:10px 20px}
  h1{font-size:15px;margin:0 0 8px;letter-spacing:.01em}
  .bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:7px}
  .bar .lbl{font:600 11px/1 ui-monospace,Menlo,monospace;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-right:4px}
  .pick{font:600 12px/1 ui-monospace,Menlo,monospace;padding:6px 10px;border:1px solid #d3d3ce;border-radius:6px;cursor:pointer;background:#fff;color:#333}
  .pick.on{background:#2f6f4e;color:#fff;border-color:#2f6f4e}
  #info{margin-top:6px;font:13px/1.3 ui-monospace,Menlo,monospace;color:#333;min-height:1.3em} #info b{color:#111}
  .leg{display:none;margin-top:6px;font-size:12px;color:#444;gap:14px;flex-wrap:wrap;align-items:center}
  .leg i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:4px}
  .grad{display:inline-block;width:120px;height:12px;border-radius:2px;vertical-align:-2px;border:1px solid #ccc;background:linear-gradient(90deg,rgb(40,90,205),rgb(240,150,40),rgb(200,30,30))}
  .gl{font:11px ui-monospace,Menlo,monospace;color:#555}
  .dbar{display:flex;align-items:center;gap:10px;font:12px ui-monospace,Menlo,monospace;color:#555}
  #tol{width:220px} .klab{font-weight:600;color:#444} #dread b{color:#111;font-size:14px}
  .stage{display:none;padding:16px 20px 60px}
  .wrap{max-width:900px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:8px;padding:8px}
  svg{width:100%%;height:auto;display:block}
  .wire{fill:none;stroke:#aaa;stroke-width:1.2} .smooth{fill:none;stroke:#2f6fb0;stroke-width:2.2}
  .seg{stroke-width:2.4;fill:none} .piece{fill:none;stroke-width:2.2}
  .cref{fill:none;stroke:#c9c9c9;stroke-width:1.4}
  .corner{fill:#d81f1f;stroke:#fff;stroke-width:1} .anchor{fill:#7a3ff2;stroke:#fff;stroke-width:1}
  .tick{stroke:#111;stroke-width:1.1;stroke-linecap:round}
  .hit{fill:none;stroke:transparent;stroke-width:11;cursor:crosshair} .hit:hover{stroke:rgba(40,120,80,.18)}
  #coord{position:fixed;bottom:14px;right:14px;z-index:20;pointer-events:none;font:600 13px/1.2 ui-monospace,Menlo,monospace;background:rgba(20,22,28,.85);color:#fff;padding:6px 10px;border-radius:6px}
  #coord[hidden]{display:none} #coord b{color:#7fd0ff}
</style>
<div class="pg">
<header>
  <h1>spline pipeline · smoothing spline (λ=5) · hover any component</h1>
  <div class="bar"><span class="lbl">scan</span>%s</div>
  <div class="bar"><span class="lbl">stage</span>%s</div>
  <div class="bar"><span class="lbl">detail</span>
    <div class="dbar"><span class="klab">coarse</span>
      <input type="range" id="tol" min="0" max="%d" step="1" value="%d"><span class="klab">fine</span>
      <span id="dread"></span></div></div>
  <div id="info">hover a component…</div>
  %s
</header>
%s
</div>
<div id="coord" hidden></div>
<script>
  var COUNTS=%s, TOLS=%s;
  var ST={scan:0, stage:"resample", tol:%d};
  var pg=document.querySelector('.pg'), info=document.getElementById('info'), coord=document.getElementById('coord'), dread=document.getElementById('dread');
  function render(){
    document.querySelectorAll('.stage').forEach(function(s){ s.style.display='none'; });
    var sel='.stage[data-scan="'+ST.scan+'"][data-stage="'+ST.stage+'"]';
    if(ST.stage==='pieces') sel+='[data-tol="'+ST.tol+'"]';
    var p=document.querySelector(sel); if(p) p.style.display='block';
    document.querySelectorAll('.pick').forEach(function(b){
      var on=(b.dataset.kind==='scan'&&+b.dataset.v===ST.scan)||(b.dataset.kind==='stage'&&b.dataset.v===ST.stage);
      b.classList.toggle('on',on);
    });
    document.querySelectorAll('.leg').forEach(function(l){ l.style.display='none'; });
    var lg=document.querySelector('.leg-'+ST.stage); if(lg) lg.style.display='flex';
    dread.innerHTML='tol '+TOLS[ST.tol].toFixed(2)+'·w  →  <b>'+COUNTS[ST.scan][ST.tol].toLocaleString()+'</b> data points';
  }
  document.querySelectorAll('.pick').forEach(function(b){ b.addEventListener('click',function(){
    if(b.dataset.kind==='scan') ST.scan=+b.dataset.v; else ST.stage=b.dataset.v; render();
  }); });
  document.getElementById('tol').addEventListener('input',function(){ ST.tol=+this.value; render(); });
  render();
  document.addEventListener('pointerover',function(e){
    var t=e.target, d=t.dataset&&t.dataset.i;
    if(d&&t.classList&&(t.classList.contains('hit')||t.classList.contains('corner')||t.classList.contains('anchor'))){ info.innerHTML='<b>'+d.replace(' · ','</b> · '); }
  });
  document.addEventListener('pointermove',function(e){
    var svg=e.target.closest?e.target.closest('svg'):null, ctm=svg&&svg.getScreenCTM();
    if(!ctm){ coord.hidden=true; return; }
    var pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; var l=pt.matrixTransform(ctm.inverse());
    coord.innerHTML='x <b>'+Math.round(l.x)+'</b>&nbsp;&nbsp;y <b>'+Math.round(l.y)+'</b>'; coord.hidden=false;
  });
</script>''' % (scan_btns, stage_btns, len(TOL_VALUES) - 1, DEFAULT_TI, legend_html, panels,
                 json.dumps(COUNTS), json.dumps(TOL_VALUES), DEFAULT_TI)

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
