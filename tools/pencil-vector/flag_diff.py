"""One-off diagnostic: the flag attachment regression (primitives render) the v3 corner detector introduces on blob 212.
Reads flagdiff.json (extracted from the vectorizer, v2 vs v3, everything else held equal) and renders a
blob overview + a tight zoom on the stroke<->fill contact, both for v2 (attached) and v3 (detached)."""
import os, sys, json, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "flagdiff.json")
OUT = os.path.join(HERE, "flag_diff.html")
D = json.load(open(SRC))
W = D["w"]; REACH = D["reach"]; BX, BY = D["break_pt"]
EDGE = D["edge"]
GAP = {"v2": 4.0, "v3": 4.5}          # closest centreline approach to the rendered fill (px)

COL = dict(v2="#2f6f4e", v3="#c0392b")
def nums(d): return [float(x) for x in re.findall(r"-?\d+\.?\d*", d)]
xs = nums(D["traced_d"])[0::2]; ys = nums(D["traced_d"])[1::2]
BB = (min(xs), min(ys), max(xs), max(ys))     # blob bounding box


def svg(vb, sw, body, h=300):
    x0, y0, w, h2 = vb
    return ('<svg viewBox="%.1f %.1f %.1f %.1f" preserveAspectRatio="xMidYMid meet" '
            'style="width:100%%;height:%dpx;display:block">%s</svg>' % (x0, y0, w, h2, h, body))


def edge_poly(sw):
    pts = " ".join("%.1f,%.1f" % (x, y) for x, y in EDGE)
    return ('<polyline points="%s" fill="none" stroke="#33353c" stroke-width="%.2f" stroke-linecap="round" opacity="0.14"/>'
            '<polyline points="%s" fill="none" stroke="#2c2e35" stroke-width="%.2f" stroke-linecap="round"/>'
            % (pts, W, pts, sw * 1.1))                # faint pen-width body + crisp centreline


def corners(cs, col, r):
    return "".join('<circle cx="%.1f" cy="%.1f" r="%.2f" fill="%s" stroke="#fff" stroke-width="%.2f"/>'
                   % (x, y, r, col, r * 0.35) for x, y in cs)


def panel(ver, mode):
    d = D[ver]; col = COL[ver]
    if mode == "over":
        pad = 0.10 * max(BB[2] - BB[0], BB[3] - BB[1])
        vb = (BB[0] - pad, BB[1] - pad, BB[2] - BB[0] + 2 * pad, BB[3] - BB[1] + 2 * pad)
        sw = vb[2] / 260.0; dot = vb[2] / 70.0; h = 300
        contact_box = ('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#8a8a8a" '
                       'stroke-width="%.2f" stroke-dasharray="%.1f %.1f" rx="1"/>'
                       % (BX - 14, BY - 14, 28, 28, sw * 0.8, sw * 2, sw * 2))
        body = ('<path d="%s" fill="#ece9e2" stroke="none"/>'
                '<path d="%s" fill="none" stroke="#b7b3ab" stroke-width="%.2f" stroke-dasharray="%.1f %.1f"/>'
                '<path d="%s" fill="none" stroke="%s" stroke-width="%.2f"/>'
                '%s%s%s'
                % (D["traced_d"], D["traced_d"], sw * 0.9, sw * 2.2, sw * 1.6,
                   d["fill_d"], col, sw * 1.3, edge_poly(sw), corners(d["corners"], "#e0a520", dot), contact_box))
    else:                                                # overlay: both boundaries against the reach ring
        P = 16.0
        vb = (BX - P, BY - P, 2 * P, 2 * P); sw = vb[2] / 240.0; h = 400
        reach = ('<circle cx="%.1f" cy="%.1f" r="%.2f" fill="none" stroke="#9a9aa2" stroke-width="%.2f" '
                 'stroke-dasharray="%.1f %.1f"/><circle cx="%.1f" cy="%.1f" r="%.2f" fill="#33353c"/>'
                 % (BX, BY, REACH, sw * 0.75, sw * 1.4, sw * 1.4, BX, BY, sw * 0.9))
        body = ('<path d="%s" fill="#ece9e2" stroke="none"/>'
                '<path d="%s" fill="none" stroke="#b7b3ab" stroke-width="%.2f" stroke-dasharray="%.1f %.1f"/>'
                '<path d="%s" fill="none" stroke="%s" stroke-width="%.2f"/>'
                '<path d="%s" fill="none" stroke="%s" stroke-width="%.2f"/>'
                '%s%s'
                % (D["traced_d"], D["traced_d"], sw * 0.85, sw * 1.8, sw * 1.3,
                   D["v2"]["fill_d"], COL["v2"], sw * 1.5,
                   D["v3"]["fill_d"], COL["v3"], sw * 1.5, edge_poly(sw), reach))
    return svg(vb, sw, body, h)


VERDICT = {"v2": ("attached", "4.0 px ≤ 4.2 px reach", COL["v2"]),
           "v3": ("detached", "4.5 px &gt; 4.2 px reach", COL["v3"])}
def card(ver, mode, label):
    v, detail, col = VERDICT[ver]
    tag = ('<span class="pill" style="background:%s">%s · %s</span>' % (col, ver, v)) if mode == "zoom" else \
          ('<span class="cn">%d corners</span>' % len(D[ver]["corners"]))
    return ('<figure class="card"><figcaption><b>%s</b>%s</figcaption>%s'
            '%s</figure>'
            % (label, tag, panel(ver, mode),
               ('<p class="cap">closest approach <b style="color:%s">%s</b></p>' % (col, detail)) if mode == "zoom" else ""))


HTML = '''<title>Flag attachment — v2 vs v3 corners</title>
<style>
  *{box-sizing:border-box} body{margin:0;background:#f6f5f2;color:#20222a;
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .wrap{max-width:940px;margin:0 auto;padding:34px 26px 70px}
  h1{font:600 25px/1.25 Georgia,"Times New Roman",serif;margin:0 0 6px;letter-spacing:-.01em}
  .lede{color:#5b5d66;max-width:64ch;margin:0 0 4px}
  .lede b{color:#20222a}
  .eyebrow{font:600 11.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:#a08a4a;margin:0 0 12px}
  .stat{display:flex;gap:0;flex-wrap:wrap;margin:22px 0 26px;border:1px solid #e4e4df;border-radius:11px;overflow:hidden;background:#fff}
  .stat > div{flex:1;min-width:120px;padding:13px 16px;border-right:1px solid #efeee9}
  .stat > div:last-child{border-right:none}
  .stat .k{font:600 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8f8f88;margin-bottom:6px}
  .stat .v{font:600 21px/1 ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums;color:#20222a}
  .stat .v small{font-size:12px;color:#8f8f88;font-weight:400}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
  .card{margin:0;background:#fff;border:1px solid #e4e4df;border-radius:11px;padding:12px 12px 6px;min-width:0}
  .card.overlay{max-width:440px;margin:14px auto 0} .chips{display:inline-flex;gap:6px}
  figcaption{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 2px 8px;
    font:13px/1.3 ui-monospace,Menlo,monospace;color:#54565e}
  .pill{color:#fff;font:600 11px/1 ui-monospace,Menlo,monospace;padding:4px 9px;border-radius:20px;letter-spacing:.02em}
  .cn{font:600 11.5px ui-monospace,Menlo,monospace;color:#a08a4a}
  .cap{font:12.5px/1.4 ui-monospace,Menlo,monospace;color:#7a7c84;margin:8px 4px 4px;text-align:center}
  .cap b{font-weight:700}
  h2{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#8f8f88;margin:34px 0 6px}
  .legend{display:flex;gap:18px;flex-wrap:wrap;margin:10px 0 4px;font:12.5px ui-monospace,Menlo,monospace;color:#5b5d66}
  .legend span{display:inline-flex;align-items:center;gap:7px}
  .sw{width:20px;height:0;border-top-width:3px;border-top-style:solid;display:inline-block}
  .dot{width:9px;height:9px;border-radius:50%%;display:inline-block}
  .note{background:#fff;border:1px solid #e4e4df;border-left:3px solid #c0392b;border-radius:9px;padding:15px 18px;margin-top:18px;color:#40424a;max-width:70ch}
  .note b{color:#20222a}
</style>
<div class="wrap">
  <p class="eyebrow">pencil-vector · corner detector v3 · regression</p>
  <h1>The flag stroke that let go of its fill</h1>
  <p class="lede">Same scan, same pipeline — only the corner detector changes. On <b>blob&nbsp;212</b>, v3 places
  <b>6 corners</b> where v2 places <b>4</b>; the two extras idealize the boundary a hair tighter, and it recedes
  <b>0.5&nbsp;px</b> from the grazing stroke — just far enough to cross the half-pen reach and read as a broken
  attachment. The ink itself has them touching.</p>

  <div class="stat">
    <div><div class="k">traced ink</div><div class="v" style="color:#2f6f4e">0.0<small> px</small></div></div>
    <div><div class="k">v2 render</div><div class="v" style="color:#2f6f4e">4.0<small> px · attached</small></div></div>
    <div><div class="k">v3 render</div><div class="v" style="color:#c0392b">4.5<small> px · broken</small></div></div>
    <div><div class="k">reach (½ pen)</div><div class="v">4.2<small> px</small></div></div>
  </div>

  <h2>Blob 212 — corner placement</h2>
  <div class="legend">
    <span><i class="sw" style="border-top-color:#b7b3ab;border-top-style:dashed"></i>traced ink</span>
    <span><i class="sw" style="border-top-color:#2f6f4e"></i>v2 boundary</span>
    <span><i class="sw" style="border-top-color:#c0392b"></i>v3 boundary</span>
    <span><i class="dot" style="background:#e0a520"></i>corner</span>
    <span><i class="sw" style="border-top-color:#33353c"></i>grazing stroke</span>
  </div>
  <div class="grid">%s%s</div>

  <h2>The contact, up close</h2>
  <p class="lede" style="margin-bottom:10px">Both idealized boundaries over the traced ink. The dashed ring is the
  half-pen reach around the stroke's nearest point — <b style="color:#2f6f4e">v2</b> reaches into it (attached);
  <b style="color:#c0392b">v3</b> stops <b>0.5&nbsp;px</b> short (broken).</p>
  <figure class="card overlay">
    <figcaption><b>blob 212 · stroke contact</b><span class="chips">
      <span class="pill" style="background:#2f6f4e">v2 · 4.0 px ✓</span>
      <span class="pill" style="background:#c0392b">v3 · 4.5 px ✗</span></span></figcaption>
    %s
  </figure>

  <div class="note"><b>What this is:</b> a 0.5&nbsp;px idealization difference sitting right on the 4.2&nbsp;px
  threshold — not a stroke flying off. The fix is to look at the two extra corners v3 finds on this blob boundary:
  if they're spurious, removing them restores the attachment <i>and</i> tightens precision; if they're real, the
  attachment test's hard threshold is what's brittle here.</div>
</div>''' % (card("v2", "over", "v2 detector"), card("v3", "over", "v3 detector"),
            panel("v3", "overlay"))

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
