"""Hug vs arcs: the spline fit rendered two ways, side by side, for every scan --
  hug   = the idealized geometry SAMPLED (dump/render primitives=False -> reconstruct); it hugs the curve
  arcs  = the compact line/arc/clothoid primitives (primitives=True -> path_d); fewer data points, but the
          chords/arcs can pull off the smooth curve.
Each panel shows the asset raster with a deviation overlay (orange = drawn past the ink, purple = missed
ink), plus the data-point count and total pixels-off. Generated -> hug_compare.html (a new artifact)."""
import os, sys, io, base64, re, warnings
warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import fit
import raster
from vectorize import vectorize
from ink import ingest
from svgdump import dump

fit.STRATEGY = "spline"
ISO = os.path.join(HERE, "..", "scan-to-svg", "out", "%s_iso.png")
OUT = os.path.join(HERE, "hug_compare.html")
SUBJECTS = [("dying", "Hit soldier"), ("soldier", "Gunner’s SMG"), ("cannon", "Wheeled cannon"),
            ("mg", "Mounted MG"), ("flag", "Capture flag")]

PAPER, BLACK, ORANGE, PURPLE = (247, 244, 239), (32, 32, 32), (232, 120, 40), (150, 120, 210)
_VISPATH = re.compile(r'data-(?:blob|edge)="[^"]*"[^>]*?\bd="([^"]*)"')
_CMD = re.compile(r'[MLHVCSQTAZ]', re.I)


def png_b64(arr):
    bio = io.BytesIO(); Image.fromarray(arr).save(bio, format="PNG", optimize=True)
    return base64.b64encode(bio.getvalue()).decode()


def count_pts(g, prim):
    return sum(len(_CMD.findall(m.group(1))) for m in _VISPATH.finditer(dump(g, charm=0.0, primitives=prim)))


def panel(g, inkm, prim, bbox):
    y0, y1, x0, x1 = bbox
    mask = raster.render_mask(g, primitives=prim, charm=0.0)[y0:y1, x0:x1]
    ink = inkm[y0:y1, x0:x1]
    img = np.full((*ink.shape, 3), PAPER, np.uint8); img[mask] = BLACK
    diff = np.zeros((*ink.shape, 4), np.uint8)
    diff[ink & ~mask] = (*PURPLE, 255)                    # ink the render missed
    diff[mask & ~ink] = (*ORANGE, 255)                    # render past the ink
    return png_b64(img), png_b64(diff), int((mask ^ ink).sum()), count_pts(g, prim)


rows, summary = "", []
for key, name in SUBJECTS:
    ink = ingest(np.asarray(Image.open(ISO % key).convert("RGB")))
    fit.HUG_PRIMITIVES = False
    g0 = vectorize(ISO % key, milestone=8)
    fit.HUG_PRIMITIVES = True                              # re-fit so the primitives subdivide to hug C
    g1 = vectorize(ISO % key, milestone=8)
    fit.HUG_PRIMITIVES = False
    ys, xs = np.where(ink.mask); pad = 8
    bbox = (max(0, ys.min() - pad), min(ink.mask.shape[0], ys.max() + pad),
            max(0, xs.min() - pad), min(ink.mask.shape[1], xs.max() + pad))
    w = bbox[3] - bbox[2]; h = bbox[1] - bbox[0]
    sb, sd, spx, spts = panel(g0, ink.mask, False, bbox)   # sampled (reference)
    lb, ld, lpx, lpts = panel(g0, ink.mask, True, bbox)    # loose arcs
    gb, gd, gpx, gpts = panel(g1, ink.mask, True, bbox)    # hugging arcs
    summary.append((name, spts, spx, lpts, lpx, gpts, gpx))

    def cell(label, base, dif, px, pts, kind):
        return ('<figure class="cell"><figcaption><b>%s</b><span class="pts %s">%s pts</span></figcaption>'
                '<div class="panel" style="aspect-ratio:%d/%d">'
                '<img src="data:image/png;base64,%s"><img class="dv" src="data:image/png;base64,%s"></div>'
                '<div class="px">%s px off the scan</div></figure>'
                % (label, kind, format(pts, ","), w, h, base, dif, format(px, ",")))
    rows += ('<section class="row"><h2>%s</h2><div class="trio">%s%s%s</div></section>'
             % (name,
                cell("sampled — reference", sb, sd, spx, spts, "hug"),
                cell("arcs — loose", lb, ld, lpx, lpts, "arc"),
                cell("arcs — hugging", gb, gd, gpx, gpts, "hugarc")))

srow = "".join(
    "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td class='g'>%s</td><td>%s</td><td>%s</td><td class='g'>%s</td></tr>"
    % (n, format(sp, ","), format(lp, ","), format(gp, ","),
       ("%+d" % (gp - lp)), format(lx, ","), format(gx, ","), ("%+d" % (gx - lx)))
    for n, sp, sx, lp, lx, gp, gx in summary)

HTML = '''<title>Pencil Vector — hug vs arcs</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f6f5f2;color:#1a1c22;
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px clamp(16px,4vw,54px)}
  h1{font:600 28px/1.1 Georgia,serif;margin:0 0 6px} .dek{color:#666;max-width:70ch;margin:0 0 22px}
  .tog{display:inline-flex;gap:8px;align-items:center;font:600 13px ui-monospace,Menlo,monospace;
    background:#fff;border:1px solid #ddd;border-radius:20px;padding:8px 14px;cursor:pointer;margin-bottom:20px}
  table{border-collapse:collapse;font:13px ui-monospace,Menlo,monospace;margin:0 0 30px;min-width:560px}
  th,td{padding:6px 14px;text-align:right;border-bottom:1px solid #e6e4df} th{color:#888;font-weight:600;
    text-transform:uppercase;font-size:11px;letter-spacing:.04em} td:first-child,th:first-child{text-align:left}
  td.g{color:#1a8a4a;font-weight:700} td.b{color:#c0392b;font-weight:700}
  .row{margin:0 0 38px} h2{font:600 18px/1.2 Georgia,serif;margin:0 0 12px;display:flex;gap:12px;align-items:baseline}
  .save{font:600 12px ui-monospace,Menlo,monospace;color:#1a8a4a}
  .trio{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;max-width:1320px}
  .cell{margin:0} figcaption{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 6px;gap:8px}
  figcaption b{font-weight:600;font-size:13px} .pts{font:600 12px ui-monospace,Menlo,monospace;padding:2px 8px;border-radius:10px;white-space:nowrap}
  .pts.hug{background:#eef;color:#3a3ad0} .pts.arc{background:#fde9dc;color:#c0560f} .pts.hugarc{background:#e0f3e7;color:#1a8a4a}
  .panel{position:relative;background:#fff;border:1px solid #e2e2de;border-radius:8px;overflow:hidden}
  .panel img{position:absolute;inset:0;width:100%%;height:100%%;image-rendering:pixelated}
  .dv{display:none} #cov:checked ~ .rows .dv{display:block}
  .px{font:12px ui-monospace,Menlo,monospace;color:#888;margin-top:5px}
  .legend{font:12px ui-monospace,Menlo,monospace;color:#888;margin:-12px 0 22px}
  .sw{display:inline-block;width:11px;height:11px;border-radius:2px;vertical-align:-1px;margin:0 3px 0 10px}
</style>
<input id="cov" type="checkbox" hidden checked>
<h1>Hugging vs. arcs</h1>
<p class="dek">The same spline fit, emitted three ways. <b>Sampled</b> samples the idealized curve densely —
it sits on the ink but is heavy. <b>Loose arcs</b> emit line/arc/clothoid primitives — far fewer data points,
but the chords/arcs (and sampled clothoids) can pull off the smooth curve. <b>Hugging arcs</b> is the
prototype: emit only line/arc pieces, and subdivide wherever one bows off the curve by more than ~a pixel —
so it's compact <em>and</em> faithful. Toggle the overlay to see where each deviates from the scan.</p>
<label class="tog"><input type="checkbox" checked onclick="document.getElementById('cov').checked=this.checked">
  show deviation from scan</label>
<div class="legend">overlay:<span class="sw" style="background:#e87828"></span>drawn past the ink
  <span class="sw" style="background:#9678d2"></span>missed ink</div>
<table><thead><tr><th>scan</th><th>sampled pts</th><th>loose pts</th><th>hug pts</th><th>Δ pts</th>
  <th>loose px off</th><th>hug px off</th><th>Δ px</th></tr></thead><tbody>%s</tbody></table>
<div class="legend" style="margin-top:-14px">Δ = hugging arcs vs loose arcs (negative = fewer points / less deviation)</div>
<div class="rows">%s</div>''' % (srow, rows)

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
