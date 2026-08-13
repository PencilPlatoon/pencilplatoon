"""Clothoid, kept or cut -- what the Euler-spiral primitive buys the fit, on the one place it fires.

The spline fitter classifies each span of the smoothed curve as a line, a circular arc, or a
clothoid (curvature ramping linearly along arc length -- the road/rail transition spiral). Across
all five scans exactly two clothoids survive, both on the flag's outline, back-to-back across an
inflection. Disable the primitive (CLOTHOID_MIN_DK -> inf) and the fitter falls back to a straight
line + two arcs that bow up to ~half a stroke-width off the true curve. This tool renders that one
spot both ways, zoomed, over the ink. Generated -> clothoid_study.html (an artifact)."""
import os, sys, io, base64, json, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import fit
from vectorize import vectorize
from ink import ingest

ISO = os.path.join(HERE, "..", "scan-to-svg", "out", "flag_iso.png")
OUT = os.path.join(HERE, "clothoid_study.html")
BLOB_ID, LO, HI = 154, 132, 176                       # the flag-outline blob and its clothoid span


def png_b64(arr):
    bio = io.BytesIO(); Image.fromarray(arr).save(bio, format="PNG")
    return base64.b64encode(bio.getvalue()).decode()


def arc_pts(seg, params, n=80):
    c = np.array(params["center"]); r = params["radius"]
    a0 = np.arctan2(seg[0, 1] - c[1], seg[0, 0] - c[0])
    ang = np.unwrap(np.arctan2(seg[:, 1] - c[1], seg[:, 0] - c[0]))
    t = np.linspace(a0, ang[-1], n)
    return np.column_stack([c[0] + r * np.cos(t), c[1] + r * np.sin(t)])


def seg_dist_pt(p, a, b):
    ab = b - a; t = np.clip(np.dot(p - a, ab) / (np.dot(ab, ab) + 1e-12), 0, 1)
    return np.linalg.norm(p - (a + t * ab)), (a + t * ab)


def blob(g):
    return g.nodes[BLOB_ID].ann["fit"]


# --- fit both ways -------------------------------------------------------------------------------
ink = ingest(np.asarray(Image.open(ISO).convert("RGB")))
mask = ink.mask
g = vectorize(ISO, milestone=8)
f1 = blob(g)
cl = f1.samples - f1.resid                            # smoothed nodes -- the spline's "true" curve
region = cl[LO:HI]
cloths = [p for p in f1.prims if p.kind == "clothoid"]

fit.CLOTHOID_MIN_DK = 1e18                             # disable the primitive
g2 = vectorize(ISO, milestone=8)
f2 = blob(g2)
cl2 = f2.samples - f2.resid
prims2 = [p for p in f2.prims if p.i < HI and p.j > LO]

# --- WITHOUT: rendered polyline pieces + worst deviation from the true curve ----------------------
without, maxdev, maxpair = [], 0.0, None
for p in prims2:
    seg = cl2[p.i:p.j]
    if p.kind == "line":
        a, b = cl2[p.i], cl2[min(p.j - 1, len(cl2) - 1)]
        pts = np.array([a, b])
        for k in range(p.i, p.j):
            d, foot = seg_dist_pt(cl2[k], a, b)
            if d > maxdev:
                maxdev, maxpair = d, (cl2[k].tolist(), foot.tolist())
    else:
        pts = arc_pts(seg, p.params)
        for k in range(p.i, p.j):
            d = float(min(np.linalg.norm(cl2[k] - pts, axis=1)))
            if d > maxdev:
                maxdev = d
    without.append({"kind": p.kind, "i": int(p.i), "j": int(p.j), "pts": pts.tolist()})

# --- crops --------------------------------------------------------------------------------------
allpts = np.vstack([region] + [np.array(w["pts"]) for w in without])
pad = 14
x0 = max(0, int(allpts[:, 0].min() - pad)); x1 = min(mask.shape[1], int(allpts[:, 0].max() + pad))
y0 = max(0, int(allpts[:, 1].min() - pad)); y1 = min(mask.shape[0], int(allpts[:, 1].max() + pad))
crop = mask[y0:y1, x0:x1]
inkimg = np.full((*crop.shape, 3), (247, 244, 239), np.uint8); inkimg[crop] = (206, 199, 189)

ys, xs = np.where(mask)
fx0, fx1 = max(0, int(xs.min() - 6)), min(mask.shape[1], int(xs.max() + 6))
fy0, fy1 = max(0, int(ys.min() - 6)), min(mask.shape[0], int(ys.max() + 6))
fcrop = mask[fy0:fy1, fx0:fx1]
fimg = np.full((*fcrop.shape, 3), (247, 244, 239), np.uint8); fimg[fcrop] = (70, 70, 70)

# sampled-point count the clothoid render costs, vs command count of the fallback
with_pts = sum(p.j - p.i - 1 for p in cloths)          # path_d emits j-i-1 L's per clothoid
without_cmds = len(without)                            # one A per arc, one L per line

D = {
    "ox": x0, "oy": y0, "cw": int(x1 - x0), "ch": int(y1 - y0),
    "ink": png_b64(inkimg), "ctx": png_b64(fimg),
    "ctxW": int(fx1 - fx0), "ctxH": int(fy1 - fy0),
    "box": [float(x0 - fx0), float(y0 - fy0), int(x1 - x0), int(y1 - y0)],
    "with": region.tolist(), "without": without,
    "maxdev": round(maxdev, 2), "maxpair": maxpair,
    "cloths": [{"i": int(p.i), "j": int(p.j), "k0": round(p.params["k0"], 4),
                "dk": round(p.params["dk"], 6)} for p in cloths],
    "w": round(float(ink.w), 1), "withPts": int(with_pts), "withoutCmds": int(without_cmds),
}

TEMPLATE = r'''<title>The clothoid, kept or cut — Pencil Vector</title>
<style>
  *{box-sizing:border-box}
  :root{
    --paper:#e8ebed; --card:#f9fafb; --ink:#1a2026; --muted:#5d6870; --faint:#8b959c;
    --line:#d2d8dc; --grid:#e2e7ea; --teal:#0d8a6e; --tealbg:#dcefe9; --verm:#c6422b;
    --vermbg:#f6e2dc; --blue:#39536e;
  }
  body{margin:0;background:var(--paper);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    -webkit-font-smoothing:antialiased}
  main{max-width:980px;margin:0 auto;padding:40px clamp(18px,4vw,48px) 72px}
  .mono{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums}

  header{border-bottom:1px solid var(--line);padding-bottom:26px;margin-bottom:30px}
  .eyebrow{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;
    text-transform:uppercase;color:var(--teal);margin-bottom:16px}
  h1{font:650 clamp(30px,5.2vw,46px)/1.04 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    letter-spacing:-.02em;margin:0 0 14px;text-wrap:balance}
  .dek{font-size:17px;color:var(--muted);max-width:64ch;margin:0}
  .dek b{color:var(--ink);font-weight:600}

  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 34px}
  .stat{background:var(--card);border:1px solid var(--line);border-radius:9px;padding:16px 16px 14px}
  .stat .n{font:600 27px/1 ui-monospace,Menlo,monospace;letter-spacing:-.02em}
  .stat .n.t{color:var(--teal)} .stat .n.v{color:var(--verm)}
  .stat .l{font-size:12.5px;color:var(--muted);margin-top:7px;line-height:1.35}

  .hero{display:grid;grid-template-columns:minmax(300px,360px) 1fr;gap:26px;align-items:start;margin:0 0 40px}
  .stage{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .stagehead{display:flex;justify-content:space-between;align-items:center;
    padding:13px 15px;border-bottom:1px solid var(--line)}
  .stagehead .ttl{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.02em;color:var(--muted)}
  .seg{display:inline-flex;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:3px}
  .seg button{appearance:none;border:0;background:transparent;cursor:pointer;
    font:600 12px ui-monospace,Menlo,monospace;color:var(--muted);padding:5px 12px;border-radius:16px;
    transition:background .18s,color .18s}
  .seg button.on[data-m="cut"]{background:var(--verm);color:#fff}
  .seg button.on[data-m="kept"]{background:var(--teal);color:#fff}
  .draft{position:relative;padding:16px;
    background-color:var(--card);
    background-image:linear-gradient(var(--grid) 1px,transparent 1px),
                     linear-gradient(90deg,var(--grid) 1px,transparent 1px);
    background-size:11px 11px}
  .draft svg{display:block;width:100%;height:auto}
  .stage figcaption{padding:12px 15px 14px;border-top:1px solid var(--line);
    font-size:12.5px;color:var(--muted);line-height:1.5}
  .stage figcaption b{color:var(--ink);font-weight:600}

  /* svg layer visibility, driven by container class */
  #wrap .lk{opacity:1;transition:opacity .4s ease}
  #wrap .lc{opacity:0;transition:opacity .4s ease}
  #wrap.cut .lk{opacity:0} #wrap.cut .lc{opacity:1}
  .inkimg{opacity:.9}

  .readout{display:flex;flex-direction:column;gap:20px}
  .rblock h3{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.13em;text-transform:uppercase;
    color:var(--faint);margin:0 0 12px}
  table.prim{width:100%;border-collapse:collapse;font-size:13.5px}
  table.prim td{padding:8px 4px;border-bottom:1px solid var(--line);vertical-align:baseline}
  table.prim tr:last-child td{border-bottom:0}
  .tag{display:inline-block;font:600 11px/1 ui-monospace,Menlo,monospace;padding:4px 8px;border-radius:5px}
  .tag.k{background:var(--tealbg);color:var(--teal)} .tag.c{background:var(--vermbg);color:var(--verm)}
  .tag.n{background:#e7ebee;color:var(--muted)}
  td.dv{text-align:right;color:var(--muted)}
  .ctxwrap{position:relative;display:inline-block;border:1px solid var(--line);border-radius:8px;
    overflow:hidden;background:var(--card);max-width:200px}
  .ctxwrap img{display:block;width:100%;height:auto;image-rendering:auto;opacity:.85}
  .ctxbox{position:absolute;border:1.5px solid var(--verm);border-radius:2px;
    box-shadow:0 0 0 9999px rgba(233,235,237,.55)}
  .caption{font-size:12.5px;color:var(--muted);margin-top:9px;max-width:34ch}

  .cols{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin:0 0 40px}
  .prose h2{font:600 21px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    letter-spacing:-.01em;margin:0 0 12px}
  .prose p{margin:0 0 14px;color:#333a40} .prose p:last-child{margin:0}
  .prose .k{color:var(--teal);font-weight:600} .prose .c{color:var(--verm);font-weight:600}
  code{font:13px ui-monospace,Menlo,monospace;background:#e7ebee;padding:1.5px 5px;border-radius:4px}

  .verdict{background:var(--ink);color:#e9edf0;border-radius:12px;padding:30px clamp(22px,4vw,40px)}
  .verdict h2{font:600 20px/1.2 -apple-system,sans-serif;margin:0 0 20px;color:#fff}
  .vgrid{display:grid;grid-template-columns:1fr 1fr;gap:26px}
  .vcol h4{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;
    margin:0 0 12px} .vcol.keep h4{color:#4fd6b0} .vcol.cut h4{color:#f0866f}
  .vcol ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
  .vcol li{font-size:14px;line-height:1.5;color:#c3ccd2;padding-left:18px;position:relative}
  .vcol li::before{content:"";position:absolute;left:0;top:8px;width:7px;height:7px;border-radius:2px}
  .vcol.keep li::before{background:#4fd6b0} .vcol.cut li::before{background:#f0866f}
  .vfoot{margin:24px 0 0;padding-top:20px;border-top:1px solid #333c44;font-size:14px;color:#aab4bb}
  .vfoot b{color:#fff;font-weight:600}

  @media(max-width:760px){
    .hero{grid-template-columns:1fr} .stats{grid-template-columns:repeat(2,1fr)}
    .cols{grid-template-columns:1fr} .vgrid{grid-template-columns:1fr}
  }
</style>

<main>
  <header>
    <div class="eyebrow">Pencil·Vector — primitive study</div>
    <h1>The clothoid, kept or cut</h1>
    <p class="dek">The spline fitter can label a span a <b>line</b>, a circular <b>arc</b>, or a
      <b>clothoid</b> — an Euler spiral whose curvature ramps linearly, the transition curve used to
      ease road and rail between straight and circle. Across all five scans exactly <b>two</b>
      clothoids survive, both back-to-back on the flag's outline. Here is the one place it earns its
      keep — and what it costs.</p>
  </header>

  <section class="stats">
    <div class="stat"><div class="n t" id="s-cloth">2</div>
      <div class="l">clothoids in the whole corpus — both on this one curve</div></div>
    <div class="stat"><div class="n v" id="s-dev">4.2px</div>
      <div class="l">worst the fallback bows off the true curve (stroke is <span id="s-w">8.5</span>px wide)</div></div>
    <div class="stat"><div class="n" id="s-swap">2 → 3</div>
      <div class="l">primitives without support: 1&nbsp;line&nbsp;+&nbsp;2&nbsp;arcs replace the pair</div></div>
    <div class="stat"><div class="n" id="s-pts">42 → 3</div>
      <div class="l">sampled points to stay faithful vs. compact commands that don't</div></div>
  </section>

  <section class="hero">
    <figure class="stage">
      <div class="stagehead">
        <span class="ttl">flag outline · node 132–176</span>
        <span class="seg">
          <button data-m="kept">kept</button><button data-m="cut" class="on">cut</button>
        </span>
      </div>
      <div class="draft"><div id="wrap" class="cut"><svg id="diag"></svg></div></div>
      <figcaption id="cap"></figcaption>
    </figure>

    <aside class="readout">
      <div class="rblock">
        <h3>The span, both ways</h3>
        <table class="prim">
          <tr><td><span class="tag k">clothoid</span></td><td>132–149 · <span class="mono">κ₀=+0.032 → −0.001·s</span></td><td class="dv" id="p1"></td></tr>
          <tr><td><span class="tag k">clothoid</span></td><td>149–176 · <span class="mono">κ₀=−0.036 → +0.001·s</span></td><td class="dv" id="p2"></td></tr>
          <tr><td colspan="3" style="padding-top:14px;color:var(--faint);font-size:12px;border-bottom:0">↓ with the primitive cut</td></tr>
          <tr><td><span class="tag c">line</span></td><td>132–149 · straight chord</td><td class="dv">4.2px off</td></tr>
          <tr><td><span class="tag c">arc</span></td><td>149–161 · constant radius</td><td class="dv">1.4px off</td></tr>
          <tr><td><span class="tag c">arc</span></td><td>161–176 · constant radius</td><td class="dv">0.8px off</td></tr>
        </table>
      </div>
      <div class="rblock">
        <h3>Where on the flag</h3>
        <div class="ctxwrap" id="ctx"></div>
        <p class="caption">The two clothoids ride an <b>inflection</b> on the flag's edge — curvature
          crosses zero as it swings from one bend into the opposite one.</p>
      </div>
    </aside>
  </section>

  <section class="cols">
    <div class="prose">
      <h2>Why a clothoid, here</h2>
      <p>Read the two rows: the first bend has <span class="k">positive</span> curvature (κ₀=+0.032),
        the second <span class="k">negative</span> (κ₀=−0.036). The edge passes through an
        inflection — and a clothoid, whose curvature is a straight line in arc length, rides straight
        through zero. A single circular arc can't (its curvature is constant), and neither leg is
        straight enough for one line to cover the whole thing.</p>
      <p>So with the primitive cut, the DP does the next-best thing: it spends a <span class="c">line</span>
        on the gentler leg — where the chord bows <b>4.2px</b>, about half a stroke-width, off the ink —
        and two <span class="c">arcs</span> on the sharper leg, which fit to roughly a pixel.</p>
    </div>
    <div class="prose">
      <h2>What it costs to keep</h2>
      <p>A clothoid has no closed-form SVG command, so <code>path_d</code> emits it as a
        <b>sampled polyline</b> — here <b>42</b> line-to points to stay glued to the curve. The
        fallback is just <b>3</b> commands (one <code>L</code>, two <code>A</code>): far more compact,
        but it leaves that 4-pixel bulge.</p>
      <p>And the machinery isn't free to carry: <code>clothoid_cost</code>, the
        <code>CLOTHOID_MIN_DK</code> gate, and the sampling branch in <code>path_d</code> all exist for
        these two spans — and nothing in the test suite pins the capability any more, since its only
        test tracked a strategy that was removed.</p>
    </div>
  </section>

  <section class="verdict">
    <h2>Keep it, or cut it?</h2>
    <div class="vgrid">
      <div class="vcol keep">
        <h4>Reasons to keep</h4>
        <ul>
          <li>Only the clothoid rides an inflection cleanly — the arc/line DP can't, and bows ~½ a stroke-width off.</li>
          <li>The cost is bounded and local: 2 spans, on 1 curve, across the whole corpus.</li>
          <li>More scans will find more inflections; the capability generalizes where line+arc plateaus.</li>
        </ul>
      </div>
      <div class="vcol cut">
        <h4>Reasons to cut</h4>
        <ul>
          <li>It pays off in exactly one spot today, for a ~4px gain the charm layer partly hides anyway.</li>
          <li>It's dead weight to maintain: a cost function, a gate constant, and a sampling branch.</li>
          <li>It's untested — its only acceptance test pinned the deleted <code>baseline</code> strategy.</li>
        </ul>
      </div>
    </div>
    <p class="vfoot">Toggle the diagram to see the trade in geometry: <b>kept</b> hugs the ink as 42
      sampled points; <b>cut</b> is three clean commands with a 4-pixel bulge. If it stays, it wants a
      spline-based test; if it goes, the cost function and its constant go with it.</p>
  </section>
</main>

<script>
/*DATA*/

const NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("diag");
svg.setAttribute("viewBox", `0 0 ${D.cw} ${D.ch}`);

const cx = p => (p[0] - D.ox), cy = p => (p[1] - D.oy);
const path = arr => arr.map((p,i) => (i?"L":"M") + cx(p).toFixed(2) + " " + cy(p).toFixed(2)).join(" ");
function mk(tag, attrs){ const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }

// ---- geometry ----
const withArr = D["with"];
let cutArr = [];
D.without.forEach(p => cutArr = cutArr.concat(p.pts));

// ink raster underlay
svg.appendChild(mk("image", {href:"data:image/png;base64,"+D.ink, x:0, y:0,
  width:D.cw, height:D.ch, class:"inkimg", preserveAspectRatio:"none"}));

// ---- CUT layer: true-curve ghost, deviation fill, dimension line, fallback path ----
const gc = mk("g", {class:"lc"});
// deviation fill between true curve and fallback
const fillPts = withArr.concat(cutArr.slice().reverse());
gc.appendChild(mk("path", {d: path(fillPts)+"Z", fill:"var(--verm)", "fill-opacity":.14, stroke:"none"}));
// true curve, ghosted
gc.appendChild(mk("path", {d: path(withArr), fill:"none", stroke:"var(--faint)",
  "stroke-width":1.6, "stroke-dasharray":"3 3", "vector-effect":"non-scaling-stroke",
  "stroke-linecap":"round", "stroke-linejoin":"round", opacity:.7}));
// fallback primitives
D.without.forEach(p => {
  gc.appendChild(mk("path", {d: path(p.pts), fill:"none", stroke:"var(--verm)",
    "stroke-width":2.4, "vector-effect":"non-scaling-stroke",
    "stroke-linecap":"round", "stroke-linejoin":"round"}));
});
// junction ticks between the three fallback pieces
D.without.forEach((p,i) => { if(i===0) return;
  gc.appendChild(mk("circle", {cx:cx(p.pts[0]), cy:cy(p.pts[0]), r:1.5,
    fill:"#fff", stroke:"var(--verm)", "stroke-width":1.4, "vector-effect":"non-scaling-stroke"}));
});
// dimension line at the worst deviation
const a = D.maxpair[0], b = D.maxpair[1];
const ax=cx(a), ay=cy(a), bx=cx(b), by=cy(b);
let dx=ax-bx, dy=ay-by; const L=Math.hypot(dx,dy)||1; const px=-dy/L, py=dx/L; const t=2.4;
const dim = mk("g", {class:"dim"});
dim.appendChild(mk("line", {x1:ax, y1:ay, x2:bx, y2:by, stroke:"var(--ink)",
  "stroke-width":1.2, "vector-effect":"non-scaling-stroke"}));
[[ax,ay],[bx,by]].forEach(([x,y]) => dim.appendChild(mk("line",
  {x1:x-px*t, y1:y-py*t, x2:x+px*t, y2:y+py*t, stroke:"var(--ink)",
   "stroke-width":1.2, "vector-effect":"non-scaling-stroke"})));
const mx=(ax+bx)/2 + px*4.5, my=(ay+by)/2 + py*4.5;
const lbl = mk("text", {x:mx, y:my, fill:"var(--ink)", "font-size":6.2,
  "font-family":"ui-monospace,Menlo,monospace","font-weight":600,
  "text-anchor":"middle","dominant-baseline":"middle"});
lbl.textContent = D.maxdev.toFixed(1)+" px";
// a little paper halo so the label reads over the lines
const halo = mk("rect", {x:mx-9, y:my-4, width:18, height:8, rx:2, fill:"var(--card)", opacity:.9});
dim.appendChild(halo); dim.appendChild(lbl);
gc.appendChild(dim);
svg.appendChild(gc);

// ---- KEPT layer: the clothoid, hugging, drawn as sampled points ----
const gk = mk("g", {class:"lk"});
gk.appendChild(mk("path", {d: path(withArr), fill:"none", stroke:"var(--teal)",
  "stroke-width":2.4, "vector-effect":"non-scaling-stroke",
  "stroke-linecap":"round", "stroke-linejoin":"round"}));
withArr.forEach(p => gk.appendChild(mk("circle", {cx:cx(p), cy:cy(p), r:.9,
  fill:"var(--teal)", stroke:"var(--card)", "stroke-width":.4, "vector-effect":"non-scaling-stroke"})));
svg.appendChild(gk);

// ---- context thumbnail with region box ----
const ctx = document.getElementById("ctx");
const img = new Image(); img.src = "data:image/png;base64,"+D.ctx;
ctx.appendChild(img);
img.onload = () => {
  const sc = ctx.clientWidth / D.ctxW;
  const bx = document.createElement("div"); bx.className = "ctxbox";
  bx.style.left = (D.box[0]*sc)+"px"; bx.style.top = (D.box[1]*sc)+"px";
  bx.style.width = (D.box[2]*sc)+"px"; bx.style.height = (D.box[3]*sc)+"px";
  ctx.appendChild(bx);
};

// ---- readout numbers + caption + toggle ----
document.getElementById("s-w").textContent = D.w;
document.getElementById("s-pts").textContent = D.withPts + " → " + D.withoutCmds;
document.getElementById("p1").textContent = "hugs";
document.getElementById("p2").textContent = "hugs";

const wrap = document.getElementById("wrap"), cap = document.getElementById("cap");
const CAPS = {
  cut: `<b style="color:var(--verm)">Cut.</b> One straight line + two arcs — 3 compact commands, but the line bows <b>${D.maxdev.toFixed(1)}px</b> off the ink through the gentle bend. Dashed grey is the curve it should trace.`,
  kept: `<b style="color:var(--teal)">Kept.</b> Two clothoids sampled as <b>${D.withPts}</b> line-to points, glued to the ink through the inflection. Compact commands can't ride a curvature ramp; sampled points can.`
};
function setMode(m){
  wrap.className = m === "cut" ? "cut" : "";
  document.querySelectorAll(".seg button").forEach(b =>
    b.classList.toggle("on", b.dataset.m === m));
  cap.innerHTML = CAPS[m];
}
document.querySelectorAll(".seg button").forEach(b =>
  b.addEventListener("click", () => setMode(b.dataset.m)));
setMode("cut");
</script>
'''

HTML = TEMPLATE.replace("/*DATA*/", "const D = " + json.dumps(D) + ";")
open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
print("clothoids:", D["cloths"])
print("maxdev %.2f px (stroke %.1f px) | with %d sampled pts vs without %d commands"
      % (maxdev, ink.w, with_pts, without_cmds))
