"""Study page for the growth-based blob resolution -- regenerates the `grow.html` artifact.

This is a DEV/inspection tool, not part of the pipeline: it imports the pipeline's `growth` module
(classify / blob_contacts / grow / keep_as_blob) so the study always shows exactly what production
does, and keeps only the rendering here. Per subject it draws the growth networks (green) into each
ambiguous region, the fill-vs-junction decision (salmon = area > w/2 from any segment; red circle =
the leftover lobe whose inscribed radius keeps the region a blob), and a pixel-coordinate hover.

    python growth_study.py [out.html]        # default: grow.html next to this script
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import growth as G
from ink import ingest
from pv_common import png_datauri

ISO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "subjects", "%s_iso.png")
SUBJECTS = [("dying", "Hit soldier"), ("cannon", "Wheeled cannon"), ("soldier", "Gunner’s SMG"),
            ("mg", "Mounted MG"), ("flag", "Capture flag")]

INK, GREY, KEPT, REGION = (232, 228, 220), (150, 162, 176), (26, 25, 23), (236, 214, 150)
LEFTOVER = (233, 138, 110)                            # blob pixels farther than w/2 from any segment
GREEN = (46, 168, 74)


def render(key):
    ink = ingest(np.asarray(Image.open(ISO % key).convert("RGB")))
    w = ink.w; H, W = ink.mask.shape
    g, skel, candidates, kept, snapped = G.classify(ink)   # shared pipeline code
    lab, _ = ndi.label(g, structure=np.ones((3, 3)))
    reg_lab = {}
    for c in candidates:
        ys, xs = np.where(c); reg_lab[int(lab[ys[0], xs[0]])] = c
    owned = {L: [] for L in reg_lab}; gray = []; snaplines = []; bynear = {}
    for near, edge, dv, L in G.blob_contacts(skel, g, w):
        snaplines.append((near, edge))
        (owned[L].append((edge, dv)) if L in reg_lab else gray.append(edge))
        bynear.setdefault((round(float(near[0])), round(float(near[1]))), []).append((np.asarray(edge, float), L))
    a = np.full((H, W, 3), 246, np.uint8); a[ink.mask] = INK
    for c in candidates:
        a[c] = REGION
    for c in kept:
        a[c] = KEPT                                        # clear 2D-core fills (always blobs)
    a[skel] = GREY

    regions = []; polylines = []
    for L, c in reg_lab.items():
        cy, cx = np.where(c); com = np.array([cx.mean(), cy.mean()])
        paths, nodes, matched = G.grow(owned[L], g, w, com)
        for pth in paths:
            if len(pth) >= 2:
                polylines.append([(float(p[0]), float(p[1])) for p in pth])
        regions.append((c, owned[L], matched, nodes))
    for pts in bynear.values():                            # a skeleton pixel seeding >=2 regions is a bridge
        for m in range(len(pts)):
            for nn in range(m + 1, len(pts)):
                if pts[m][1] != pts[nn][1]:
                    ea, eb = pts[m][0], pts[nn][0]
                    polylines.append([(float(ea[0]), float(ea[1])), (float(eb[0]), float(eb[1]))])

    # unexplained bulk: region area farther than w/2 from any segment; circle the fat, circular lobes
    segimg = Image.new("1", (W, H), 0); sd = ImageDraw.Draw(segimg)
    for pth in polylines:
        if len(pth) >= 2:
            sd.line([(p[0], p[1]) for p in pth], fill=1, width=1)
    dist_seg = ndi.distance_transform_edt(~np.asarray(segimg, bool))
    leftover = np.isin(lab, list(reg_lab.keys())) & (dist_seg > w / 2.0)
    a[leftover] = LEFTOVER
    lobe_r = G.LOBE_FACTOR * w; circles = []; radii = []
    ll, nll = ndi.label(leftover)
    for k in range(1, nll + 1):
        idt = ndi.distance_transform_edt(ll == k); rr = float(idt.max()); radii.append(rr)
        if rr > lobe_r:
            yy, xx = np.unravel_index(int(idt.argmax()), idt.shape)
            circles.append((float(xx), float(yy), rr))
    print("  %-14s w=%.1f thresh=%.1f  top lobe radii: %s"
          % (key, w, lobe_r, " ".join("%.1f" % r for r in sorted(radii, reverse=True)[:8])))
    base = Image.fromarray(a)

    dots = [(edge, (120, 128, 140)) for edge in gray]
    for c, cl, matched, nodes in regions:
        for i, (edge, dv) in enumerate(cl):
            dots.append((edge, (46, 108, 214) if matched[i] else (201, 60, 43)))
        for nd in nodes:
            qy, qx = int(round(nd[1])), int(round(nd[0]))
            inside = 0 <= qy < H and 0 <= qx < W and g[qy, qx]
            dots.append((nd, (182, 138, 230) if inside else (232, 140, 40)))

    def zoom(bx, target):
        bx = tuple(int(v) for v in bx); zc = max(1, int(round(target / max(1, bx[2] - bx[0]))))
        img = base.crop(bx).resize(((bx[2] - bx[0]) * zc, (bx[3] - bx[1]) * zc), Image.NEAREST).convert("RGB")
        dd = ImageDraw.Draw(img); ox, oy = bx[0], bx[1]
        sc = lambda pt: ((pt[0] - ox) * zc + zc * 0.5, (pt[1] - oy) * zc + zc * 0.5)
        for near, edge in snaplines:
            dd.line([sc(near), sc(edge)], fill=GREY, width=2)
        for pth in polylines:
            dd.line([sc(p) for p in pth], fill=GREEN, width=2, joint="curve")
        for cx, cy, rr in circles:
            x, y = sc((cx, cy)); rp = rr * zc
            dd.ellipse([x - rp, y - rp, x + rp, y + rp], outline=(214, 30, 30), width=max(2, int(round(zc * 0.35))))
        r = max(1.4, zc * 0.5)
        for pt, col in dots:
            x, y = sc(pt); dd.ellipse([x - r, y - r, x + r, y + r], fill=col)
        return img

    ys, xs = np.where(ink.mask)
    wbox = (int(xs.min() - 6), int(ys.min() - 6), int(xs.max() + 6), int(ys.max() + 6))
    whole = zoom(wbox, 940)
    crops = []; pad = int(round(4 * w))
    for c, cl, matched, nodes in regions:
        if not cl:
            continue
        ys, xs = np.where(c)
        cb = (int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)), int(min(W, xs.max() + pad)), int(min(H, ys.max() + pad)))
        crops.append((zoom(cb, 480), cb, len(cl), sum(matched)))
    return whole, wbox, crops, len(candidates)


def build(out_path):
    rows = ""
    for key, name in SUBJECTS:
        whole, wbox, crops, nreg = render(key)
        cropimgs = "".join('<figure class="cf"><img data-box="%d,%d,%d,%d" src="%s"/><figcaption>#%d &middot; %d seg &middot; %d met</figcaption></figure>'
                           % (cb[0], cb[1], cb[2], cb[3], png_datauri(ci), i + 1, ne, nm) for i, (ci, cb, ne, nm) in enumerate(crops))
        rows += ('<section class="row"><div class="rowhead"><h3>%s</h3><p>%d regions</p></div>'
                 '<div class="iw"><img data-box="%d,%d,%d,%d" src="%s"/></div><div class="crops">%s</div></section>'
                 % (name, nreg, wbox[0], wbox[1], wbox[2], wbox[3], png_datauri(whole), cropimgs))
    html = ('<title>Segment growth into blobs</title><style>body{margin:0}*{box-sizing:border-box}'
            '.wrap{background:#16171b;color:#e9e6de;font-family:system-ui,sans-serif;padding:clamp(18px,3vw,44px);line-height:1.5}'
            '.wrap>*{max-width:1000px;margin-inline:auto}h1{font-family:Georgia,serif;font-size:clamp(26px,4vw,40px);margin:0 0 8px}'
            '.dek{color:#9b978c;max-width:80ch;margin:0 0 8px}'
            '.legend{display:flex;flex-wrap:wrap;gap:16px;font-family:ui-monospace,monospace;font-size:12px;margin:0 0 12px;color:#c7c3b8}'
            '.legend i{display:inline-block;width:16px;height:11px;border-radius:2px;margin-right:6px;vertical-align:middle;border:1px solid #0005}'
            '.row{border-top:1px solid #33343c;padding:20px 0}.rowhead h3{font-family:Georgia,serif;font-size:21px;margin:0 0 3px}'
            '.rowhead p{color:#a8a496;font-size:13px;font-family:ui-monospace,monospace;margin:0 0 12px}'
            '.iw{background:#f6f1e6;border-radius:8px;overflow:auto}.iw img{display:block;margin:0 auto;image-rendering:pixelated;max-width:100%;cursor:crosshair}'
            '.crops{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px}.cf{margin:0;background:#f6f1e6;border-radius:6px;padding:6px}'
            '.cf img{display:block;image-rendering:pixelated;max-width:480px;cursor:crosshair}'
            '.cf figcaption{font-family:ui-monospace,monospace;font-size:10px;color:#6b6659;margin-top:4px;text-align:center}'
            '#coord{position:fixed;pointer-events:none;z-index:999;background:#000e;color:#e9e6de;font-family:ui-monospace,monospace;'
            'font-size:13px;padding:3px 8px;border-radius:5px;border:1px solid #555;opacity:0;white-space:nowrap}'
            '#pixmark{position:fixed;pointer-events:none;z-index:998;border:2px solid #000;box-sizing:border-box;opacity:0}'
            '</style><div class="wrap"><h1>Segment growth into blobs</h1>'
            '<p class="dek">Each edge contact grows a curve into the region, steered by centering (stay on the medial '
            'axis), momentum, and weak gravity toward the other growth points. It stops at a wall in its forward '
            '&plusmn;45&deg; cone (a lateral pinch is ignored), or where it meets another growth path (a node). '
            '<b style="color:#4c86e8">Blue</b> met another; <b style="color:#e05a4a">red</b> stopped alone.</p>'
            '<div class="legend"><span><i style="background:#2ea84a"></i>growth path</span>'
            '<span><i style="background:#2e6cd6"></i>contact — met another</span>'
            '<span><i style="background:#c93c2b"></i>contact — stopped alone</span>'
            '<span><i style="background:#b68ae6"></i>meeting node</span>'
            '<span><i style="background:#788494"></i>owned by other blob</span>'
            '<span><i style="background:#e98a6e"></i>&gt; w/2 from any segment</span>'
            '<span><i style="background:#d61e1e"></i>lobe keeps its blob</span></div>'
            '<p class="dek" style="margin-top:2px">Hover any panel for the scan pixel coordinate.</p>'
            + rows + '</div><div id="coord"></div><div id="pixmark"></div>'
            '<script>(function(){var coord=document.getElementById("coord"),mark=document.getElementById("pixmark");'
            'function hide(){coord.style.opacity=0;mark.style.opacity=0;}'
            'window.addEventListener("mousemove",function(e){var t=e.target;'
            'if(t&&t.tagName==="IMG"&&t.dataset.box){var b=t.dataset.box.split(",").map(Number),r=t.getBoundingClientRect();'
            'var cx=e.clientX-6,cy=e.clientY-6;if(cx>=r.left&&cx<=r.right&&cy>=r.top&&cy<=r.bottom){'
            'var pw=r.width/(b[2]-b[0]),ph=r.height/(b[3]-b[1]);var col=Math.floor(b[0]+(cx-r.left)/pw),row=Math.floor(b[1]+(cy-r.top)/ph);'
            'mark.style.left=(r.left+(col-b[0])*pw)+"px";mark.style.top=(r.top+(row-b[1])*ph)+"px";mark.style.width=pw+"px";mark.style.height=ph+"px";mark.style.opacity=1;'
            'coord.textContent=col+", "+row;coord.style.left=(e.clientX+15)+"px";coord.style.top=(e.clientY+17)+"px";coord.style.opacity=1;return;}}'
            'hide();});})();</script>')
    with open(out_path, "w") as f:
        f.write(html)
    print("wrote %s (%.0f KB)" % (out_path, len(html) / 1024))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "grow.html")
    build(out)
