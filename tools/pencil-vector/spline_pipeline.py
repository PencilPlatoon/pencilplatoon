"""spline pipeline inspector: the smoothing-spline stages for EVERY scan (switcher at top), at fixed
smoothing (SPLINE_LAMBDA=5) -- resample, corners, the smoothed curve, and its curvature, each drawn over
the ink with per-component hover. Generated -> spline_pipeline.html (artifact)."""
import os, sys, math, base64, io, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from scipy.ndimage import gaussian_filter1d
from skimage.restoration import denoise_tv_chambolle
from PIL import Image
import fit
from fit import (resample_corners, RESAMPLE_W, MIN_STEP)
from vectorize import Stage, vectorize
from ink import ingest
from model import BLOB

ISO = os.path.join(HERE, "subjects", "%s_iso.png")
OUT = os.path.join(HERE, "spline_pipeline.html")
SUBJECTS = [("dying", "Hit soldier"), ("soldier", "Gunner’s SMG"), ("cannon", "Wheeled cannon"),
            ("mg", "Mounted MG"), ("flag", "Capture flag")]
LAM = 5.0                                                  # smoothing is fixed now (was the old slider)
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
    """Everything the λ-fixed stages need: resample, corners, the smoothed curve C, and its curvature."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S, corners_v = resample_corners(np.asarray(P, float), step, closed, w); M = len(S)   # corner-preserving (matches production)
    if M < 2:
        return None
    s_arc = np.arange(M, dtype=float) * step
    if M < 5:                                              # too short: the real fit emits one straight line
        C = S.copy()
        return dict(S=S, C=C, step=step, closed=closed, arclen=float(s_arc[-1]), kap=np.zeros(M),
                    cands=[], jumps={}, anchors=[])
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
                cands=sorted(cornerset), anchors=anchor_ix, jumps={c: float(ts[c]) for c in cornerset})


# ---- precompute every scan ----
def ink_png(mask):
    rgba = np.zeros((*mask.shape, 4), np.uint8); rgba[mask] = (150, 145, 135, 90)
    b = io.BytesIO(); Image.fromarray(rgba).save(b, format="PNG", optimize=True)
    return base64.b64encode(b.getvalue()).decode()


SCANS, allkap = [], []
for key, sname in SUBJECTS:
    ink = ingest(np.asarray(Image.open(ISO % key).convert("RGB")))
    g = vectorize(ISO % key, Stage.FIT_IDEAL_GEOMETRY)
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
    allkap.append(np.concatenate([tr["kap"] * tr["step"] for _, _, tr in items]) if items else np.zeros(1))
    SCANS.append(dict(key=key, name=sname, w=g.w, wd=ink.mask.shape[1], hd=ink.mask.shape[0],
                      ink=ink_png(ink.mask), items=items))
    print("  %-8s %d components" % (key, len(items)))

VMAX_KAP = float(np.percentile(np.abs(np.concatenate(allkap)), 92)) or 0.1
print("VMAX_KAP=%.3f" % VMAX_KAP)


# ---- rendering helpers ----
DIV_NEG, DIV_MID, DIV_POS = (40, 90, 205), (240, 150, 40), (200, 30, 30)


def col_div(v, vmax):
    t = max(-1.0, min(1.0, v / vmax)); end = DIV_POS if t >= 0 else DIV_NEG
    return "rgb(%d,%d,%d)" % tuple(int(round(DIV_MID[i] + (end[i] - DIV_MID[i]) * abs(t))) for i in range(3))


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


STAGES = [("resample", "1 · Resample", stage_resample), ("corners", "2 · Corners", stage_corners),
          ("smoothed", "3 · Smoothed", stage_smoothed), ("kappa", "4 · Curvature κ", stage_kappa)]

LEGENDS = {
    "resample": '<span><i style="background:#888"></i>resampled polyline — uniform arc-length samples</span>',
    "corners": ('<span><i style="background:#d81f1f;border-radius:50%"></i>detected corner</span>'
                '<span><i style="background:#7a3ff2"></i>attachment anchor</span>'),
    "smoothed": ('<span><i style="background:#888"></i>raw samples</span><span><i style="background:#2f6fb0"></i>smoothing spline (λ=5)</span>'),
    "kappa": ('<span>curvature κ·step:</span><span class="grad"></span>'
              '<span class="gl">−%.2f</span><span class="gl">0</span><span class="gl">+%.2f</span>' % (VMAX_KAP, VMAX_KAP)),
}
legend_html = "".join('<div class="leg leg-%s">%s</div>' % (s[0], LEGENDS[s[0]]) for s in STAGES)

panels = ""
for si, sc in enumerate(SCANS):
    items = sc["items"]
    for sid, label, fn in STAGES:
        body = svg_open(sc)
        for kind, eid, tr in items:
            body += '<g>%s</g>' % fn(tr, "%s %d" % (kind, eid))
        panels += '<div class="stage" data-scan="%d" data-stage="%s"><div class="wrap">%s</svg></div></div>' % (si, sid, body)

scan_btns = "".join('<button class="pick" data-kind="scan" data-v="%d">%s</button>' % (i, sc["name"]) for i, sc in enumerate(SCANS))
stage_btns = "".join('<button class="pick" data-kind="stage" data-v="%s">%s</button>' % (s[0], s[1]) for s in STAGES)

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
  .stage{display:none;padding:16px 20px 60px}
  .wrap{max-width:900px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:8px;padding:8px}
  svg{width:100%%;height:auto;display:block}
  .wire{fill:none;stroke:#aaa;stroke-width:1.2} .smooth{fill:none;stroke:#2f6fb0;stroke-width:2.2}
  .seg{stroke-width:2.4;fill:none}
  .corner{fill:#d81f1f;stroke:#fff;stroke-width:1} .anchor{fill:#7a3ff2;stroke:#fff;stroke-width:1}
  .hit{fill:none;stroke:transparent;stroke-width:11;cursor:crosshair} .hit:hover{stroke:rgba(40,120,80,.18)}
  #coord{position:fixed;bottom:14px;right:14px;z-index:20;pointer-events:none;font:600 13px/1.2 ui-monospace,Menlo,monospace;background:rgba(20,22,28,.85);color:#fff;padding:6px 10px;border-radius:6px}
  #coord[hidden]{display:none} #coord b{color:#7fd0ff}
</style>
<div class="pg">
<header>
  <h1>spline pipeline · smoothing spline (λ=5) · hover any component</h1>
  <div class="bar"><span class="lbl">scan</span>%s</div>
  <div class="bar"><span class="lbl">stage</span>%s</div>
  <div id="info">hover a component…</div>
  %s
</header>
%s
</div>
<div id="coord" hidden></div>
<script>
  var ST={scan:0, stage:"resample"};
  var info=document.getElementById('info'), coord=document.getElementById('coord');
  function render(){
    document.querySelectorAll('.stage').forEach(function(s){ s.style.display='none'; });
    var p=document.querySelector('.stage[data-scan="'+ST.scan+'"][data-stage="'+ST.stage+'"]'); if(p) p.style.display='block';
    document.querySelectorAll('.pick').forEach(function(b){
      var on=(b.dataset.kind==='scan'&&+b.dataset.v===ST.scan)||(b.dataset.kind==='stage'&&b.dataset.v===ST.stage);
      b.classList.toggle('on',on);
    });
    document.querySelectorAll('.leg').forEach(function(l){ l.style.display='none'; });
    var lg=document.querySelector('.leg-'+ST.stage); if(lg) lg.style.display='flex';
  }
  document.querySelectorAll('.pick').forEach(function(b){ b.addEventListener('click',function(){
    if(b.dataset.kind==='scan') ST.scan=+b.dataset.v; else ST.stage=b.dataset.v; render();
  }); });
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
</script>''' % (scan_btns, stage_btns, legend_html, panels)

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
