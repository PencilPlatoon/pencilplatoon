"""curv-fit pipeline inspector: renders the geometry at each stage of _fit_curvfit for one scan, with
off-image hover readout of every component's parameters. Generated -> curvfit_pipeline.html (artifact)."""
import os, sys, math, base64, json, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from scipy.ndimage import gaussian_filter1d
from skimage.restoration import denoise_tv_chambolle
from scipy.optimize import least_squares
from PIL import Image
import fit
from fit import (resample, _turning, _corners_v2, _kappa_dp, _kabsch, _Prefix, _line_params,
                 RESAMPLE_W, MIN_STEP, TV_KAPPA_W, CURV_LINE_K, CURV_ARC_DK)
import vectorize as V
from vectorize import vectorize
from ink import ingest
from model import BLOB

SCAN = sys.argv[1] if len(sys.argv) > 1 else "dying"
ISO = os.path.join(HERE, "..", "scan-to-svg", "out", "%s_iso.png")
OUT = os.path.join(HERE, "curvfit_pipeline.html")


def trace(P, w, closed, anchors):
    """Replay _fit_curvfit, capturing every intermediate geometry/signal."""
    step = max(MIN_STEP, RESAMPLE_W * w)
    S = resample(np.asarray(P, float), step, closed); M = len(S)
    if M < 2:
        return None
    s = np.arange(M, dtype=float) * step
    if M < 5:                                             # too short for the curvature pipeline; the real
        return dict(S=S, step=step, closed=closed, arclen=float(s[-1]), turn=np.zeros(M), kap=np.zeros(M),  # fit emits one line
                    cands=[], jumps={}, recon_dp=S.copy(), recon=S.copy(),
                    pieces=[dict(i=0, j=M, a=0.0, b=0.0, kind="line", R=None, corner_in=False)])
    turn = _turning(S, closed)
    cands = _corners_v2(S, w, step, closed)
    ts = gaussian_filter1d(turn, 0.5, mode="wrap" if closed else "nearest")
    sm = turn.copy()
    for c in cands:
        lo, hi = max(0, c-1), min(M, c+2); sm[lo:hi] = 0.0
    kap = denoise_tv_chambolle(sm, weight=TV_KAPPA_W * w * step) / step
    pieces = _kappa_dp(kap, s, w, list(cands), M); nco = 2 * len(pieces)

    def build(params):
        kp = np.empty(M); idx = 0
        for (i, j, _, _) in pieces:
            kp[i:j] = params[idx] + params[idx+1] * s[i:j]; idx += 2
        jm = np.zeros(M)
        for k, c in enumerate(cands):
            jm[c] = params[nco + k]
        theta = np.cumsum(jm + np.concatenate([[0.0], kp[:-1] * step]))
        return np.cumsum(np.column_stack([np.cos(theta), np.sin(theta)]) * step, axis=0)

    def kappa_of(p):
        kp = np.empty(M); idx = 0
        for (i, j, _, _) in pieces:
            kp[i:j] = p[idx] + p[idx+1] * s[i:j]; idx += 2
        return kp

    def resid(p):
        pos = (_kabsch(build(p), S) - S).ravel()
        return pos if fit.CURV_FIT_W <= 0 else np.concatenate([pos, math.sqrt(fit.CURV_FIT_W) * kappa_of(p)])

    x0 = np.array([v for (i, j, a, b) in pieces for v in (a, b)] + [ts[c] for c in cands])
    recon_dp = _kabsch(build(x0), S)
    prm = least_squares(resid, x0, method="lm", max_nfev=300).x
    recon = _kabsch(build(prm), S)

    def classify(a, b, i, j):
        amid = a + b * s[(i+j)//2]; span = s[j-1] - s[i]
        if abs(amid) + abs(b) * span < CURV_LINE_K:
            return "line", None
        if abs(b) * span < CURV_ARC_DK and abs(amid) > 1e-6:
            cr, c, R = _Prefix(recon[i:j]).circle(0, j-i)
            return ("arc", R) if c is not None else ("clothoid", None)
        return "clothoid", None

    out_pieces = []
    for k, (i, j, _, _) in enumerate(pieces):
        a, b = prm[2*k], prm[2*k+1]; kind, R = classify(a, b, i, j)
        out_pieces.append(dict(i=i, j=j, a=float(a), b=float(b), kind=kind, R=R,
                               corner_in=(i in set(cands))))
    return dict(S=S, step=step, closed=closed, arclen=float(s[-1]), turn=turn, kap=kap, cands=cands,
                jumps={c: float(ts[c]) for c in cands}, recon_dp=recon_dp, recon=recon, pieces=out_pieces)


# gather traces for every edge + blob boundary
ink = ingest(np.asarray(Image.open(ISO % SCAN).convert("RGB")))
Wd, Hd = ink.mask.shape[1], ink.mask.shape[0]
fit.STRATEGY = "curvfit"
g = vectorize(ISO % SCAN, milestone=8)
sid2edge = {e.sid: e for e in g.edges.values()}
# data-num like svgdump/the study page: blobs (with a boundary) first, then edges; 1-indexed
num, dn = 0, {}
for nd in g.nodes.values():
    if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 3:
        num += 1; dn[("blob", nd.id)] = num
for e in g.edges.values():
    num += 1; dn[("seg", e.id)] = num
def build_items():                                        # trace every component at the current fit.CURV_PEN_K
    out = []
    for e in g.edges.values():
        tr = trace(e.pts, g.w, False, None)
        if tr: out.append(("seg", dn[("seg", e.id)], tr))
    for nd in g.nodes.values():
        if nd.kind == BLOB and nd.boundary is not None and len(nd.boundary) >= 5:
            raw = nd.ann.get("traced", nd.boundary)       # the RAW traced boundary -- nd.boundary was
            anch = fit._blob_anchors(nd, sid2edge, g.w)    # overwritten with the idealized (drifted) fit
            tr = trace(raw, g.w, True, anch)
            if tr: out.append(("blob", dn.get(("blob", nd.id), 0), tr))
    return out

# 2D sweep: CURV_PEN_K (segmentation coarseness) x CURV_FIT_W (WLS kappa^2 penalty). Only stages 5 & 6
# depend on these; two sliders pick the (ki, wi) variant. W=0 / K=0.004 = the current baseline.
K_VALUES = [0.004, 0.010, 0.025, 0.040]
W_VALUES = [0.0, 1.0, 3.0, 10.0, 30.0, 100.0]
DEFAULT_KI, DEFAULT_WI = 0, 0                              # open on the baseline (K=0.004, penalty off)
items_by_kw = [[None] * len(W_VALUES) for _ in K_VALUES]
kstats = []                                                # kstats[ki][wi] = {k,w,pieces,drift,maxdrift}
for ki, kv in enumerate(K_VALUES):
    row = []
    for wi, wv in enumerate(W_VALUES):
        fit.CURV_PEN_K = kv; fit.CURV_FIT_W = wv
        its = build_items(); items_by_kw[ki][wi] = its
        devs = [np.hypot(*(tr["recon"][:len(tr["S"])] - tr["S"]).T) for _, _, tr in its]
        st = dict(k=kv, w=wv, pieces=sum(len(tr["pieces"]) for _, _, tr in its),
                  drift=float(np.mean([d.mean() for d in devs])), maxdrift=float(max(d.max() for d in devs)))
        row.append(st)
        print("  K=%.3f W=%-5g -> %d pieces, mean %.2f px, max %.1f px"
              % (kv, wv, st["pieces"], st["drift"], st["maxdrift"]))
    kstats.append(row)
fit.CURV_FIT_W = 0.0
items = items_by_kw[DEFAULT_KI][DEFAULT_WI]                # K/W-independent stages use this
print("traced %d components x %d K x %d W variants" % (len(items), len(K_VALUES), len(W_VALUES)))

# per-signal-stage colour scale (robust max) so each stage uses the full colour range and stays visible
VMAX_TURN = float(np.percentile(np.abs(np.concatenate([tr["turn"] for _, _, tr in items])), 92)) or 0.3
VMAX_KAP = float(np.percentile(np.abs(np.concatenate([tr["kap"] * tr["step"] for _, _, tr in items])), 92)) or 0.1


# ---- rendering helpers ----
DIV_NEG, DIV_MID, DIV_POS = (40, 90, 205), (240, 150, 40), (200, 30, 30)   # blue -> orange(0) -> red


def col_div(v, vmax):                                     # diverging: visible orange midpoint, not white
    t = max(-1.0, min(1.0, v / vmax))
    end = DIV_POS if t >= 0 else DIV_NEG
    c = tuple(int(round(DIV_MID[i] + (end[i] - DIV_MID[i]) * abs(t))) for i in range(3))
    return "rgb(%d,%d,%d)" % c

KCOL = {"line": "#2f6fb0", "arc": "#2e9e4e", "clothoid": "#e08020"}
TICK_HALF = 4.0                                           # half-length of the boundary tick marks (px)


def boundary_tick(rec, i, M, closed):                     # short line perpendicular to the curve at index i
    a = rec[(i - 1) % M] if closed else rec[max(0, i - 1)]
    b = rec[(i + 1) % M] if closed else rec[min(M - 1, i + 1)]
    t = b - a; n = math.hypot(t[0], t[1])
    if n < 1e-6:
        return ""
    px, py = -t[1] / n * TICK_HALF, t[0] / n * TICK_HALF
    x, y = rec[i]
    return '<line class="tick" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>' % (x - px, y - py, x + px, y + py)


def poly(pts):
    return " ".join("%.1f,%.1f" % (x, y) for x, y in pts)


def _cl(pts, closed):                                     # append the first point so a loop draws closed
    return np.vstack([pts, pts[:1]]) if (closed and len(pts) >= 2) else pts


def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace('"', "&quot;")


def svg_open():
    return ('<svg viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet">'
            '<image x="-0.5" y="-0.5" width="%d" height="%d" href="data:image/png;base64,%s"/>'
            % (Wd, Hd, Wd, Hd, INK_B64))


bio = __import__("io").BytesIO()
base = np.full((Hd, Wd, 4), 0, np.uint8); base[ink.mask] = (150, 145, 135, 90)
Image.fromarray(base).save(bio, format="PNG", optimize=True)
INK_B64 = base64.b64encode(bio.getvalue()).decode()


def hit(pts, info):                                       # wide transparent hover target carrying params
    return '<polyline class="hit" points="%s" data-i="%s"/>' % (poly(pts), esc(info))


def stage_resample(tr, name):
    cp = _cl(tr["S"], tr["closed"])
    info = "%s · resampled · %d samples · arc %.0f px · step %.1f" % (name, len(tr["S"]), tr["arclen"], tr["step"])
    return '<polyline class="wire" points="%s"/>%s' % (poly(cp), hit(cp, info))


def stage_signal(tr, name, sig, vmax, unit):
    pts = tr["S"]; M = len(pts); segs = ""
    for k in range(M if tr["closed"] else M-1):
        k2 = (k + 1) % M
        segs += '<polyline class="seg" points="%.1f,%.1f %.1f,%.1f" stroke="%s"/>' % (
            pts[k, 0], pts[k, 1], pts[k2, 0], pts[k2, 1], col_div(sig[k], vmax))
    info = "%s · %s · peak %.3f %s" % (name, "turning" if unit == "τ" else "denoised κ", np.abs(sig).max(), unit)
    return segs + hit(_cl(pts, tr["closed"]), info)


def stage_corners(tr, name):
    pts = tr["S"]; cp = _cl(pts, tr["closed"])
    out = '<polyline class="wire" points="%s"/>' % poly(cp)
    for c in tr["cands"]:
        x, y = pts[c]
        out += ('<circle class="corner" cx="%.1f" cy="%.1f" r="3.2" data-i="%s"/>'
                % (x, y, esc("%s · corner @ (%.0f,%.0f) · jump %.0f°" % (name, x, y, math.degrees(tr["jumps"][c])))))
    out += hit(cp, "%s · %d corner(s)" % (name, len(tr["cands"])))
    return out


def stage_pieces(tr, name, key):
    rec = tr[key]; M = len(rec); out = ""; dots = ""; ticks = ""
    closed = tr["closed"]
    for pid, p in enumerate(tr["pieces"], 1):
        i, j = p["i"], p["j"]
        if i > 0 or closed:                               # tick at every boundary between contiguous pieces
            ticks += boundary_tick(rec, i % M, M, closed)
        seg = list(rec[i:j])
        if j < M:                                         # bridge to the next piece so joins don't gap
            seg.append(rec[j])
        elif tr["closed"]:                                # last piece of a loop -> back to the start
            seg.append(rec[0])
        if len(seg) < 2:
            continue
        R = ("R=%.0f" % p["R"]) if p["R"] else ("κ=%.3f b=%.3f" % (p["a"], p["b"]))
        info = "%s · piece %d · %s%s [%d:%d] · %s" % (name, pid, p["kind"], " (corner)" if p["corner_in"] else "", i, j, R)
        out += '<polyline class="piece" points="%s" stroke="%s"/>%s' % (poly(np.array(seg)), KCOL[p["kind"]], hit(np.array(seg), info))
        if p["corner_in"] and i < M:                      # mark the θ-jump at this piece's start (drawn on top)
            x, y = rec[i]
            dots += ('<circle class="corner" cx="%.1f" cy="%.1f" r="3.2" data-i="%s"/>'
                     % (x, y, esc("%s · corner @ (%.0f,%.0f)" % (name, x, y))))
    return out + ticks + dots


STAGES = [
    ("resample", "1 · Resample", lambda tr, n: stage_resample(tr, n)),
    ("turning",  "2 · Turning κ", lambda tr, n: stage_signal(tr, n, tr["turn"], VMAX_TURN, "τ")),
    ("corners",  "3 · Corners",   lambda tr, n: stage_corners(tr, n)),
    ("tvk",      "4 · Denoised κ", lambda tr, n: stage_signal(tr, n, tr["kap"] * tr["step"], VMAX_KAP, "τ")),
    ("dp",       "5 · Pieces (on trace)", lambda tr, n: stage_pieces(tr, n, "S")),
    ("fit",      "6 · WLS fit",    lambda tr, n: stage_pieces(tr, n, "recon")),
]

def grad_legend(name, vmax):
    return ('<span>%s (rad/sample):</span>'
            '<span class="grad"></span>'
            '<span class="gl">−%.2f</span><span class="gl">0</span><span class="gl">+%.2f</span>'
            '<span style="color:#888">blue = turns one way · red = the other · orange ≈ straight</span>'
            % (name, vmax, vmax))
PIECE_LEG = ('<span><i style="background:#2f6fb0"></i>line</span><span><i style="background:#2e9e4e"></i>arc</span>'
             '<span><i style="background:#e08020"></i>clothoid</span><span><i style="background:#d81f1f"></i>corner</span>'
             '<span style="color:#888">hover a piece for its κ / radius / span</span>')
LEGENDS = {
    "resample": '<span><i style="background:#888"></i>resampled polyline — uniform arc-length samples</span>',
    "turning": grad_legend("per-sample turning τ", VMAX_TURN),
    "corners": '<span><i style="background:#d81f1f;border-radius:50%"></i>detected corner (θ-jump) — hover a dot for its angle</span>',
    "tvk": grad_legend("TV-denoised curvature κ·step", VMAX_KAP),
    "dp": PIECE_LEG, "fit": PIECE_LEG,
}
legend_html = "".join('<div class="leg leg-%s">%s</div>' % (s[0], LEGENDS[s[0]]) for s in STAGES)
legcss = "\n".join(".pg:has(#st-%s:checked) .leg-%s{display:flex}" % (s[0], s[0]) for s in STAGES)

panels = ""
for si, (sid, label, fn) in enumerate(STAGES):
    body = svg_open()
    if sid in ("dp", "fit"):                              # K/W-dependent: one variant group per (ki, wi)
        for ci, (kind, eid, _) in enumerate(items):
            name = "%s %d" % (kind, eid)
            for ki in range(len(K_VALUES)):
                for wi in range(len(W_VALUES)):
                    trk = items_by_kw[ki][wi][ci][2]
                    body += '<g class="kvar" data-k="%d" data-w="%d">%s</g>' % (ki, wi, fn(trk, name))
    else:                                                 # K/W-independent stages: render once
        for kind, eid, tr in items:
            body += '<g>%s</g>' % fn(tr, "%s %d" % (kind, eid))
    body += "</svg>"
    panels += ('<input class="tr" type="radio" name="stage" id="st-%s"%s>'
               '<div class="stage"><div class="wrap">%s</div></div>'
               % (sid, " checked" if si == 0 else "", body))
kvarcss = ".kvar{display:none}\n" + "\n".join(
    '.pg.k%d.w%d .kvar[data-k="%d"][data-w="%d"]{display:inline}' % (ki, wi, ki, wi)
    for ki in range(len(K_VALUES)) for wi in range(len(W_VALUES)))
slider_html = ('<div class="kbar"><label class="klab" for="kslider">CURV_PEN_K</label>'
               '<input type="range" id="kslider" min="0" max="%d" step="1" value="%d">'
               '<label class="klab" for="wslider">κ²-penalty</label>'
               '<input type="range" id="wslider" min="0" max="%d" step="1" value="%d">'
               '<span id="kread"></span></div>'
               % (len(K_VALUES) - 1, DEFAULT_KI, len(W_VALUES) - 1, DEFAULT_WI))
tabs = "".join('<label for="st-%s">%s</label>' % (s[0], s[1]) for s in STAGES)
tabcss = "\n".join(".pg:has(#st-%s:checked) .stage:nth-of-type(%d){display:block}" % (s[0], i+1)
                   for i, s in enumerate(STAGES))
tabcss += "\n" + ",".join(".pg:has(#st-%s:checked) .tabs label:nth-of-type(%d)" % (s[0], i+1)
                          for i, s in enumerate(STAGES)) + "{background:#2f6f4e;color:#fff;border-color:#2f6f4e}"

HTML = '''<title>curv-fit pipeline — %s</title>
<style>
  *{box-sizing:border-box} body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1a1c22;background:#f6f5f2}
  header{position:sticky;top:0;z-index:5;background:#fbfaf8;border-bottom:1px solid #e2e2de;padding:10px 20px}
  h1{font-size:15px;margin:0 0 8px;letter-spacing:.01em}
  .tabs{display:flex;flex-wrap:wrap;gap:6px}
  .tabs label{font:600 12px/1 ui-monospace,Menlo,monospace;padding:6px 10px;border:1px solid #d3d3ce;border-radius:6px;cursor:pointer;background:#fff}
  #info{margin-top:8px;font:13px/1.3 ui-monospace,Menlo,monospace;color:#0b6;min-height:1.3em;color:#333}
  #info b{color:#111}
  .leg{display:none;margin-top:6px;font-size:12px;color:#444;gap:14px;flex-wrap:wrap;align-items:center}
  .leg i{display:inline-block;width:12px;height:12px;border-radius:2px;vertical-align:-2px;margin-right:4px}
  .grad{display:inline-block;width:130px;height:12px;border-radius:2px;vertical-align:-2px;border:1px solid #ccc;background:linear-gradient(90deg,rgb(40,90,205),rgb(240,150,40),rgb(200,30,30))}
  .gl{font:11px ui-monospace,Menlo,monospace;color:#555}
%s
  .stage{display:none;padding:16px 20px 60px}
  .wrap{max-width:900px;margin:0 auto;background:#fff;border:1px solid #e2e2de;border-radius:8px;padding:8px}
  svg{width:100%%;height:auto;display:block}
  .tr{position:absolute;opacity:0;pointer-events:none}
  .wire{fill:none;stroke:#888;stroke-width:1.2}
  .seg{stroke-width:2.4;fill:none}
  .piece{fill:none;stroke-width:2.2}
  .corner{fill:#d81f1f;stroke:#fff;stroke-width:1}
  .tick{stroke:#111;stroke-width:1.1;stroke-linecap:round}
  .hit{fill:none;stroke:transparent;stroke-width:11;cursor:crosshair}
  .hit:hover{stroke:rgba(40,120,80,.18)}
  #coord{position:fixed;bottom:14px;right:14px;z-index:20;pointer-events:none;font:600 13px/1.2 ui-monospace,Menlo,monospace;background:rgba(20,22,28,.85);color:#fff;padding:6px 10px;border-radius:6px}
  #coord[hidden]{display:none} #coord b{color:#7fd0ff}
  .kbar{display:flex;align-items:center;gap:10px;margin-top:8px;font:12px ui-monospace,Menlo,monospace;color:#555}
  #kslider{width:230px} #kread b{color:#111} .klab{font-weight:600;color:#444}
  %s
</style>
<div class="pg k%d w%d">
<header>
  <h1>curv-fit pipeline · %s · hover any component for its parameters</h1>
  <div class="tabs">%s</div>
  %s
  <div id="info">hover a component…</div>
  %s
</header>
%s
</div>
<div id="coord" hidden></div>
<script>
  var KSTATS=%s;
  var pg=document.querySelector('.pg'), ks=document.getElementById('kslider'), ws=document.getElementById('wslider'), kr=document.getElementById('kread');
  function apply(){
    var ki=+ks.value, wi=+ws.value, s=KSTATS[ki][wi];
    for(var a=0;a<KSTATS.length;a++) pg.classList.remove('k'+a);
    for(var b=0;b<KSTATS[0].length;b++) pg.classList.remove('w'+b);
    pg.classList.add('k'+ki); pg.classList.add('w'+wi);
    kr.innerHTML='K=<b>'+s.k.toFixed(3)+'</b> · κ²-pen=<b>'+s.w+'</b> · '+s.pieces+' pieces · mean drift '+s.drift.toFixed(1)+' px · worst drift <b>'+s.maxdrift.toFixed(1)+'</b> px';
  }
  ks.addEventListener('input',apply); ws.addEventListener('input',apply); apply();
  var info=document.getElementById('info'), coord=document.getElementById('coord');
  document.addEventListener('pointerover',function(e){
    var t=e.target, d=t.dataset&&t.dataset.i;
    if(d&&t.classList&&(t.classList.contains('hit')||t.classList.contains('corner'))){ info.innerHTML='<b>'+d.replace(' · ','</b> · '); }
  });
  document.addEventListener('pointermove',function(e){
    var svg=e.target.closest?e.target.closest('svg'):null, ctm=svg&&svg.getScreenCTM();
    if(!ctm){ coord.hidden=true; return; }
    var p=svg.createSVGPoint(); p.x=e.clientX; p.y=e.clientY; var l=p.matrixTransform(ctm.inverse());
    coord.innerHTML='x <b>'+Math.round(l.x)+'</b>&nbsp;&nbsp;y <b>'+Math.round(l.y)+'</b>'; coord.hidden=false;
  });
</script>''' % (SCAN, legcss, tabcss + "\n" + kvarcss, DEFAULT_KI, DEFAULT_WI, SCAN, tabs,
                 slider_html, legend_html, panels, json.dumps(kstats))

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT)/1024))
