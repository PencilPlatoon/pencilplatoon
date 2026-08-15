"""Pipeline Stages study page: per subject, the original SCAN next to a tab strip stepping through the
pipeline stages that each visibly change the diagram -- skeleton, grow, absorb, fit (named for
what they do; see stage_graphs). Tabs are radio-driven (pure CSS) and clone
into the zoom, so they work zoomed and non-zoomed (the pencil-vector study-page pattern). Selecting a
stage in any cell syncs every cell on the page. Published as artifact bab2a5a5 ("Pencil Vector —
pipeline stages").

Each panel renders the stage as plain black on paper; the 'coverage vs scan' toggle recolours it
against the ink (ORANGE where the render is bigger than the scan, LAVENDER where smaller). Hover
identifies an element (mirrors red onto the scan); the Skeleton toggle overlays the cyan centerlines.

    python pipeline_stages.py [out.html]     # default: pipeline_stages.html next to this script"""
import base64, io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
import growth
import raster
import vectorize as V
from vectorize import Stage, vectorize
from export_model import model_dict
from graph import build
from ink import Ink, ingest
from model import Graph
from svgdump import dump

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "pipeline_stages.html")
ISO = os.path.join(HERE, "subjects", "%s_iso.png")

PAPER = (246, 241, 230)
LAVENDER = (181, 126, 220)
BLACK = (26, 25, 23)
ORANGE = (201, 116, 43)

SUBJECTS = [
    ("flag",    "Capture flag",  "flag field + ragged pole; the pole is a stroke misread as a fill"),
    ("cannon",  "Wheeled cannon","clean control — few fills, so little should change"),
    ("soldier", "Gunner’s SMG",  "filled gun body — the clearest rim-fray case"),
    ("mg",      "Mounted MG",    "gun + muzzle-flash; the flash is line-work, left alone"),
    ("dying",   "Hit soldier",   "torso fill by the grip; the fingers stay strokes"),
]


def build_pre_absorb(key):
    """The identify-elements graph the instant BEFORE absorb_rim_stubs runs -- growth blob-resolution
    and the junction merge are done, but the rim fray isn't yet folded into the fills. Diffed against
    the 'absorb' tab (elements fully identified), this isolates what the rim-stub absorber changes."""
    saved = V.absorb_rim_stubs
    V.absorb_rim_stubs = (lambda *a, **k: None)
    try:
        return vectorize(ISO % key, Stage.IDENTIFY_ELEMENTS)
    finally:
        V.absorb_rim_stubs = saved                        # restore even if vectorize raises


def pre_grow(key):
    """The real 'before grow' stage: growth.classify's carved, endpoint-disciplined stroke skeleton
    -- the exact input the growth sim starts from (`net = skel.copy()`), built into a graph with the
    2D regions still carved out (no fills yet). This is what grow actually works from, not a separate
    naive skeletonize; its free ends are already pulled back to the pen's reach."""
    rgb = np.asarray(Image.open(ISO % key).convert("RGB"))
    ink = ingest(rgb)
    g = Graph(nodes={}, edges={}, w=ink.w, size=(ink.mask.shape[1], ink.mask.shape[0]),
              scale=ink.scale, palette=ink.palette)
    nc, ec = [0], [0]
    agg = growth.expand(growth.raw_core(ink), ink) if len(ink.palette) > 1 else None   # aggregate-wide fill hint (§5)
    for c, cmask in V._color_masks(ink):
        ink_c = Ink(mask=cmask, dist=ndimage.distance_transform_edt(cmask), w=ink.w, scale=ink.scale)
        _grown, skel, *_ = growth.classify(ink_c, force_fill=agg)
        V._merge(g, build(ink_c, mask=skel), c, nc, ec)
    g.labels = ink.labels
    return g


def _png_b64(arr):
    bio = io.BytesIO()
    Image.fromarray(arr).save(bio, format="PNG", optimize=True)
    return base64.b64encode(bio.getvalue()).decode()


def _color_base(g):
    """The stage rendered exactly as the ASSET TOOL draws it: blobs in node order, each filled in its
    palette colour with holes cut to reveal what's underneath (not painted black-last), then strokes at
    pen width. Rendering from the same `model_dict` the tool consumes keeps the study page and the tool
    in lockstep -- so a later stage here matches the vectorization you edit."""
    m = model_dict(g, "")
    W, H = int(g.size[0]), int(g.size[1])
    pal = m["palette"]
    col = lambda c: BLACK if (c or 0) == 0 else tuple(pal[c])
    canvas = np.full((H, W, 3), PAPER, np.uint8)

    def polymask(pts):
        im = Image.new("1", (W, H)); ImageDraw.Draw(im).polygon([tuple(p) for p in pts], fill=1)
        return np.array(im, dtype=bool)

    for b in m["blobs"]:
        if not b["boundary"] or len(b["boundary"]) < 3:
            continue
        fill = polymask(b["boundary"])
        for h in b.get("holes", []):
            if len(h) >= 3:
                fill &= ~polymask(h)                      # a hole reveals the earlier-drawn colour beneath
        canvas[fill] = col(b.get("color", 0))
    im = Image.fromarray(canvas); dr = ImageDraw.Draw(im)
    sw = max(1, int(round(m["w"])))
    for e in m["edges"]:
        if len(e["pts"]) >= 2:
            dr.line([tuple(p) for p in e["pts"]], fill=col(e.get("color", 0)), width=sw)
    return np.asarray(im)


def coverage_datauri(g, ink, prim=False):
    """Two layers: the stage rendered on paper in the drawing's palette colours the way the asset tool
    draws it (always shown), and a transparent diff overlay marking where the render is BIGGER than the
    scan (orange) or SMALLER (grey) -- revealed only by the 'coverage vs scan' toggle."""
    render = raster.render_mask(g, primitives=prim)       # full coverage, for the diff
    inkm = ink.mask
    base = _color_base(g)
    diff = np.zeros((*inkm.shape, 4), np.uint8)            # transparent everywhere it matches
    diff[inkm & ~render] = (*LAVENDER, 255)               # pen in the scan, missing in the render
    diff[render & ~inkm] = (*ORANGE, 255)                 # bigger than the scan (overshoot)
    return _png_b64(base), _png_b64(diff), int((render & ~inkm).sum())


def phase_svg(g, ink, clines=False, prim=False):
    """One stage's interactive coverage SVG: the black coverage raster (+ the toggleable diff overlay
    and cyan centerlines) under the svgdump graph. The graph's own strokes are hidden but hoverable --
    the hovered element, stroke or blob, highlights red; every segment of this stage is present."""
    base_b64, diff_b64, over = coverage_datauri(g, ink, prim)
    svg = dump(g, primitives=prim)
    m = re.search(r'viewBox="0 0 (\d+) (\d+)"', svg)
    w, h = int(m.group(1)), int(m.group(2))
    # Raster pixel (i,j) is centred at (i+0.5, j+0.5); the vector graph is drawn at integer corners.
    # Offset the images by -0.5 so pixel centres land on the integer coords -> raster and the red
    # hover highlight line up exactly (no half-pixel fringe).
    overlay = ('<image x="-0.5" y="-0.5" width="%d" height="%d" preserveAspectRatio="none" '
               'href="data:image/png;base64,%s"/>') % (w, h, base_b64)
    overlay += ('<image class="covdiff" x="-0.5" y="-0.5" width="%d" height="%d" preserveAspectRatio="none" '
                'href="data:image/png;base64,%s"/>') % (w, h, diff_b64)
    if clines:                                          # thin cyan centerlines so the kink/snap shows
        pl = "".join('<polyline points="%s"/>' % " ".join("%.1f,%.1f" % (x, y) for x, y in e.pts)
                     for e in g.edges.values())
        overlay += '<g class="cline" stroke-width="%.1f">%s</g>' % (max(1.5, g.w * 0.32), pl)
    svg = svg.replace("<svg ", '<svg class="covsvg" ', 1)
    svg = re.sub(r"(<svg[^>]*>)", lambda mm: mm.group(1) + overlay, svg, count=1)
    svg = re.sub(r'<g class="seg" data-num="\d+"><g class="vis"><path data-blob="\d+"[^>]*d="([^"]*)"[^>]*/></g>',
                 lambda mm: mm.group(0) + '<path class="bhi" d="%s" fill="#e8402f" fill-rule="evenodd"/>' % mm.group(1),
                 svg)
    return svg, (w, h), over


def pv_cell(subj, panels, default=-1):
    """A stage tab-strip (radio-driven, pure CSS) over one cell. `panels` = [(label, svg), ...];
    `default` is the checked tab index. The lightbox clones the whole cell so tabs come with zoom."""
    radios = tabs = pans = ""
    d = default % len(panels)
    for i, (lab, svg) in enumerate(panels):
        rid = "pv-%s-%s" % (subj, lab)
        chk = " checked" if i == d else ""
        radios += '<input class="pvr" type="radio" name="pv-%s" id="%s" data-stage="%s"%s>' % (subj, rid, lab, chk)
        tabs += '<label for="%s">%s</label>' % (rid, lab)
        pans += '<div class="pvpanel">%s</div>' % svg
    return '%s<div class="pvtabs">%s</div><div class="pvpanels">%s</div>' % (radios, tabs, pans)


def scan_cell(key, w, h):
    b = base64.b64encode(open(ISO % key, "rb").read()).decode()
    return ('<svg class="scansvg" viewBox="0 0 %d %d" preserveAspectRatio="xMidYMid meet">'
            '<image x="-0.5" y="-0.5" width="%d" height="%d" preserveAspectRatio="none" '
            'href="data:image/png;base64,%s"/><g class="scanov"></g></svg>') % (w, h, w, h, b)


ZOOM = ('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
        'stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/>'
        '<path d="M20 20l-4.7-4.7"/></svg>')


def tile(kind, label, inner, meta):
    return ('<figure class="tile"><div class="art %s">%s</div>'
            '<button type="button" class="zoombtn" aria-label="Zoom">%s</button>'
            '<figcaption><span class="k">%s</span><span class="m">%s</span></figcaption>'
            '</figure>') % (kind, inner, ZOOM, label, meta)


def stage_graphs(key):
    """The pipeline checkpoints that each visibly change the diagram, named for what they DO. Each was
    verified to differ from the one before by hundreds to tens of
    thousands of rendered pixels on every scan (skeleton->grow is the big one -- 2D regions fill in).
      skeleton  contact-aware stroke skeleton: endpoints disciplined, 2D regions carved out (classify)
      grow      2D regions grown from their stroke contacts into networks + kept fills (pre-absorb)
      absorb    rim fray folded into the fills it frays off (absorb_rim_stubs)
      fit       strokes + fill edges idealized to line/arc geometry (fit-ideal-geometry, spline)"""
    return [
        ("skeleton", pre_grow(key),                                    False),
        ("grow",     build_pre_absorb(key),                           False),
        ("absorb",   vectorize(ISO % key, Stage.IDENTIFY_ELEMENTS),   False),
        ("fit",      vectorize(ISO % key, Stage.FIT_IDEAL_GEOMETRY),  False),
    ]


STAGE_STRIP = "skeleton · grow · absorb · fit"
rows = ""
for key, name, note in SUBJECTS:
    ink = ingest(np.asarray(Image.open(ISO % key).convert("RGB")))
    panels, wh, counts = [], None, {}
    for label, g, prim in stage_graphs(key):
        svg, (w, h), _ = phase_svg(g, ink, clines=True, prim=prim)
        panels.append((label, svg)); wh = (w, h); counts[label] = len(g.edges)
    w, h = wh
    pv = pv_cell(key, panels, default=0)             # default tab = skeleton (the raw starting point)
    meta = "skeleton %d segments · fit %d" % (counts["skeleton"], counts["fit"])
    cells = (tile("scan", "scan", scan_cell(key, w, h), "the drawing")
             + tile("pv", STAGE_STRIP, pv, meta))
    rows += ('<div class="row" style="--ar:%d/%d"><div class="rowhead"><h3>%s</h3><p>%s</p></div>'
             '<div class="cells">%s</div></div>') % (w, h, name, note, cells)

NTABS = 12          # emit tab show/hide rules for up to this many panels (grows with the stage set)
PVCSS = "\n".join(
    "  .pv:has(.pvr:nth-of-type(%d):checked) .pvpanel:nth-of-type(%d){display:contents}" % (i, i)
    for i in range(1, NTABS + 1))
PVCSS += "\n" + ",\n".join(
    "  .pv:has(.pvr:nth-of-type(%d):checked) .pvtabs label:nth-of-type(%d)" % (i, i)
    for i in range(1, NTABS + 1))
PVCSS += "{background:var(--blue);border-color:var(--blue);color:#fff}"

HTML = r'''<title>Pencil Vector — pipeline stages</title>
<style>
  :root{
    --desk:#17181c; --panel:#212229; --panel-2:#191a1f; --paper:#f6f1e6;
    --ink:#e8e5dd; --muted:#9b988d; --hair:#33343c; --blue:#4763d0; --gold:#c9a24b;
    --sans:system-ui,-apple-system,"Segoe UI",sans-serif;
    --serif:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--desk)}
  .wrap{background:radial-gradient(120% 80% at 50% -10%,#20222a 0%,var(--desk) 60%);
    color:var(--ink);font-family:var(--sans);line-height:1.55;padding:clamp(20px,4vw,56px)}
  .wrap>*{max-width:1290px;margin-inline:auto}
  #shownums{position:fixed;opacity:0;width:0;height:0;pointer-events:none}
  .numtoggle{position:fixed;top:16px;right:16px;z-index:1100;background:var(--panel);
    border:1px solid var(--hair);color:var(--ink);padding:9px 15px;border-radius:20px;
    font-size:13px;cursor:pointer;user-select:none;display:flex;gap:9px;align-items:center;
    box-shadow:0 6px 20px -8px #000}
  .numtoggle:hover{border-color:var(--blue)}
  .numtoggle .dot{width:12px;height:12px;border-radius:50%;border:2px solid var(--muted)}
  #shownums:checked ~ .numtoggle .dot{background:var(--blue);border-color:var(--blue)}
  #shownums:focus-visible ~ .numtoggle{outline:2px solid var(--blue);outline-offset:2px}
  .nums{display:none;pointer-events:none}
  #shownums:checked ~ .wrap .nums{display:inline}
  #shownums:checked ~ #lb .nums{display:inline}
  #showskel{position:fixed;opacity:0;width:0;height:0;pointer-events:none}
  .skeltoggle{top:58px}
  #showskel:checked ~ .skeltoggle .dot{background:var(--skel,#16c7ee);border-color:var(--skel,#16c7ee)}
  #showskel:focus-visible ~ .skeltoggle{outline:2px solid var(--blue);outline-offset:2px}
  #showdiff{position:fixed;opacity:0;width:0;height:0;pointer-events:none}
  .difftoggle{top:100px}
  #showdiff:checked ~ .difftoggle .dot{background:#c9742b;border-color:#c9742b}
  #showdiff:focus-visible ~ .difftoggle{outline:2px solid var(--blue);outline-offset:2px}
  em{font-style:normal;color:#fff;font-weight:600}
  code{font-family:var(--mono);font-size:.85em;background:var(--panel);padding:.12em .42em;
    border-radius:4px;color:#d6d2c6}

  .masthead{padding-bottom:clamp(20px,3vw,30px);border-bottom:1px solid var(--hair)}
  .eyebrow{font-family:var(--mono);text-transform:uppercase;letter-spacing:.18em;font-size:12px;
    color:var(--blue);margin:0 0 14px}
  h1{font-family:var(--serif);font-weight:600;font-size:clamp(30px,5vw,50px);line-height:1.04;
    margin:0;text-wrap:balance;letter-spacing:-.01em}
  .dek{max-width:78ch;color:var(--muted);font-size:clamp(15px,1.5vw,17px);margin:16px 0 0}
  .legend{display:flex;flex-wrap:wrap;gap:8px 20px;margin:18px 0 0;font-family:var(--mono);font-size:12px}
  .legend span{display:flex;gap:8px;align-items:center;color:var(--ink)}
  .legend i{width:22px;height:12px;border-radius:3px;display:inline-block;border:1px solid #0004}
  .sw-black{background:#1a1917} .sw-orange{background:#c9742b} .sw-lav{background:#b57edc}
  .sw-skel{background:#16c7ee} .sw-red{background:#e8402f}

  .matrix{padding-top:clamp(18px,2.5vw,30px)}
  .row{display:grid;grid-template-columns:196px 1fr;gap:24px;padding:22px 0;border-top:1px solid var(--hair)}
  .row:first-of-type{border-top:none}
  .rowhead h3{font-family:var(--serif);font-weight:600;font-size:20px;margin:0}
  .rowhead p{color:var(--muted);font-size:13px;margin:6px 0 12px}
  .delta{font-family:var(--mono);font-size:11px;letter-spacing:.02em;color:#e2b06a;
    border:1px solid #4a3c22;background:#241d10;border-radius:20px;padding:4px 10px;display:inline-block}
  .delta.flat{color:var(--muted);border-color:var(--hair);background:var(--panel-2)}
  .cells{display:grid;gap:16px;grid-template-columns:repeat(2,1fr)}

  .tile{position:relative;margin:0;background:var(--panel);border:1px solid var(--hair);
    border-radius:10px;padding:12px;transition:border-color .15s,transform .15s}
  .tile:hover{border-color:var(--blue);transform:translateY(-2px)}
  .art{background:var(--paper);border-radius:6px;height:clamp(320px,48vh,470px);display:grid;
    place-items:center;padding:14px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);overflow:hidden;
    position:relative;z-index:2;cursor:crosshair}
  .art svg,.art img{max-height:100%;max-width:100%;width:auto;height:auto;display:block}
  .scanov{pointer-events:none}
  .scanov path{stroke:#e8402f} .scanov path[fill]:not([fill="none"]){fill:#e8402f}
  .scanov circle{stroke:#e8402f} .scanov circle[fill]:not([fill="none"]){fill:#e8402f}
  .cline{fill:none;stroke:#16c7ee;pointer-events:none;stroke-linejoin:round;stroke-linecap:round;display:none}
  #showskel:checked ~ .wrap .cline{display:inline}
  #showskel:checked ~ #lb .cline{display:inline}
  .covdiff{pointer-events:none;image-rendering:pixelated;display:none}
  #showdiff:checked ~ .wrap .covdiff{display:inline}
  #showdiff:checked ~ #lb .covdiff{display:inline}
  /* coverage panels: raster is the picture; hide svgdump's own strokes, reveal only the hovered
     element in red -- a stroke via its .vis path, a blob via the .bhi highlight overlay. */
  .covsvg .seg .vis{display:none}
  .covsvg .seg.near:not(:has(path[data-blob])) .vis{display:inline}
  .bhi{display:none;pointer-events:none}
  .seg.near .bhi{display:inline}
  .seg .vis,.seg .corner{pointer-events:none}
  .hit{pointer-events:none}
  .corner{display:none}
  .seg.near .corner{display:inline}
  .art .seg.near .corner{transform:scale(2);transform-box:fill-box;transform-origin:center}
  /* Hover highlight: skeleton OFF -> the whole segment lights up at its native pen width; skeleton ON
     -> a thin line to match the cyan centerlines. */
  .seg.near .vis path{stroke:#e8402f}
  #showskel:checked ~ .wrap .seg.near .vis path,
  #showskel:checked ~ #lb .seg.near .vis path{stroke-width:3}
  .seg.near .vis path[fill]:not([fill="none"]){fill:#e8402f}
  .seg.near .vis circle{stroke:#e8402f}

  /* Pencil-Vector stage tab-strip over one cell (radio-driven, pure CSS). Panels use
     display:contents so the shown SVG sizes exactly like the scan panel. Show/hide rules (PVCSS)
     are generated for NTABS panels, so the strip grows with the stage set. */
  .art.pv{position:relative;padding-top:38px;cursor:default}
  .pvr{position:absolute;width:0;height:0;opacity:0;pointer-events:none}
  .pvtabs{position:absolute;top:9px;left:10px;right:10px;z-index:4;display:flex;gap:6px;
    flex-wrap:wrap;justify-content:center}
  .pvtabs label{font-family:var(--mono);font-size:11px;letter-spacing:.06em;color:var(--muted);
    background:var(--panel-2);border:1px solid var(--hair);border-radius:20px;padding:3px 11px;
    cursor:pointer;transition:color .12s,border-color .12s,background .12s}
  .pvtabs label:hover{border-color:var(--blue);color:var(--ink)}
  .pvpanels{display:contents}
  .pvpanel{display:none}
''' + PVCSS + r'''
  .pv:has(.pvr:focus-visible) .pvtabs{outline:2px solid var(--blue);outline-offset:3px;border-radius:22px}

  .zoombtn{position:absolute;top:15px;right:15px;z-index:6;width:34px;height:34px;border-radius:50%;
    padding:0;background:var(--panel);border:1px solid var(--hair);color:var(--ink);display:grid;
    place-items:center;cursor:zoom-in}
  .zoombtn:hover{border-color:var(--blue);color:var(--blue)}
  figcaption{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:11px}
  .k{font-size:13px;color:var(--ink)}
  .m{font-family:var(--mono);font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;
    text-align:right;white-space:nowrap}

  .foot{border-top:1px solid var(--hair);margin-top:8px;padding-top:24px}
  .foot p{color:var(--muted);font-size:14.5px;max-width:80ch;margin:0 0 12px}

  #lb{position:fixed;inset:0;z-index:1000;display:none;place-items:center;cursor:zoom-out;
    background:rgba(11,11,13,.93);backdrop-filter:blur(3px);padding:clamp(20px,5vh,64px)}
  #lb.on{display:grid}
  #lbframe{background:var(--paper);border-radius:12px;padding:min(5vw,48px);cursor:default;
    box-shadow:0 30px 80px -20px #000;display:grid;place-items:center}
  #lbframe svg{width:84vw;height:76vh;display:block}
  /* cloned pv cell in the zoom: keep the tab strip, drop the panel chrome, let the SVG fill */
  #lbframe .art.pv{width:86vw;height:auto;max-height:84vh;background:transparent;box-shadow:none;
    padding:0;cursor:default;display:flex;flex-direction:column;align-items:center;gap:14px}
  #lbframe .art.pv .pvtabs{position:static;flex-wrap:wrap}
  #lbframe .art.pv svg{width:82vw;height:70vh}

  @media(max-width:820px){
    .cells{grid-template-columns:1fr;max-width:460px}
    .row{grid-template-columns:1fr;gap:14px}
  }
  #coord{position:fixed;bottom:14px;right:14px;z-index:1200;pointer-events:none;letter-spacing:.02em;
    font:600 13px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;color:#fff;padding:7px 10px;
    border-radius:7px;background:rgba(20,22,28,.86)}
  #coord[hidden]{display:none}
  #coord b{color:#7fd0ff;font-weight:700}
</style>
<input id="shownums" type="checkbox">
<input id="showskel" type="checkbox">
<input id="showdiff" type="checkbox">
<label class="numtoggle" for="shownums"><span class="dot"></span>Element numbers</label>
<label class="numtoggle skeltoggle" for="showskel"><span class="dot"></span>Skeleton</label>
<label class="numtoggle difftoggle" for="showdiff"><span class="dot"></span>Coverage vs scan</label>
<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Pencil Vector &middot; the real pipeline &middot; skeleton · grow · absorb · fit</p>
    <h1>Pencil Vector — the pipeline, stage by stage</h1>
    <div class="legend">
      <span><i class="sw-black"></i>the render (in the drawing's palette)</span>
      <span><i class="sw-orange"></i>vs scan: bigger</span>
      <span><i class="sw-lav"></i>vs scan: smaller</span>
      <span><i class="sw-skel"></i>skeleton / centerline</span>
      <span><i class="sw-red"></i>hover: element</span>
    </div>
  </header>
  <section class="matrix">''' + rows + r'''</section>
</div>
<div id="lb"><div id="lbframe"></div></div>
<div id="coord" hidden></div>
<script>
(function(){
  var lb=document.getElementById('lb'), fr=document.getElementById('lbframe'), n=0;
  function close(){ lb.classList.remove('on'); fr.textContent=''; }
  document.addEventListener('click', function(e){
    var btn=e.target.closest('.zoombtn');
    if(btn){
      var art=btn.parentNode.querySelector('.art');
      fr.textContent='';
      if(art.classList.contains('pv')){
        // clone the whole cell so the stage tabs come with the zoom; remap the radio group
        var clone=art.cloneNode(true), uid='lbpv'+(++n);
        clone.querySelectorAll('.pvr').forEach(function(r){
          var old=r.id; r.name=uid; r.id=uid+'-'+old;
          var l=clone.querySelector('label[for="'+old+'"]');
          if(l) l.setAttribute('for', uid+'-'+old);
        });
        fr.appendChild(clone);
      } else {
        var el=[].slice.call(art.querySelectorAll('svg,img')).filter(function(x){
          return x.getBoundingClientRect().width>0; })[0];
        if(el) fr.appendChild(el.cloneNode(true));
      }
      lb.classList.add('on'); return;
    }
    if(e.target===lb) close();
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
})();
(function(){
  function build(svg){
    if(svg.__segs) return svg.__segs;
    var out=[];
    svg.querySelectorAll('.seg').forEach(function(seg){
      var hit=seg.querySelector('.hit'); if(!hit) return;
      var f=hit.getAttribute('fill'), isFill=!!f && f!=='none', pts=[], L=0;
      try{ L=hit.getTotalLength(); }catch(e){}
      var m=Math.max(2, Math.min(60, Math.round(L/6)));
      for(var i=0;i<=m;i++){ try{ var p=hit.getPointAtLength(L*i/m); pts.push(p.x,p.y); }catch(e){} }
      out.push({seg:seg, hit:hit, isFill:isFill, pts:pts});
    });
    svg.__segs=out; return out;
  }
  var cur=null, raf=0, last=null, mir=null, coordEl=document.getElementById('coord');
  function showCoord(x,y){ coordEl.innerHTML='x <b>'+x+'</b>&nbsp;&nbsp;y <b>'+y+'</b>'; coordEl.hidden=false; }
  function hideCoord(){ coordEl.hidden=true; }
  function raise(el){ el.__next=el.nextSibling; el.__parent=el.parentNode; el.parentNode.appendChild(el); }
  function restore(el){ if(el.__parent){ el.__parent.insertBefore(el, el.__next); el.__parent=null; el.__next=null; } }
  function mirror(t){
    if(mir){ mir.innerHTML=''; mir=null; }
    if(!t) return;
    var row=t.closest('.row'); if(!row) return;
    var ov=row.querySelector('.scanov'), vis=t.querySelector('.vis');
    if(ov&&vis){ ov.innerHTML=vis.innerHTML; mir=ov; }
  }
  function clear(){ if(cur){ cur.classList.remove('near'); restore(cur); cur=null; } mirror(null); hideCoord(); }
  function visibleSvg(host){
    var s=host.querySelectorAll('svg');
    for(var i=0;i<s.length;i++){ var r=s[i].getBoundingClientRect(); if(r.width>0&&r.height>0) return s[i]; }
    return null;
  }
  function run(){
    raf=0; if(!last) return; var e=last;
    var host=e.target.closest ? (e.target.closest('.art')||e.target.closest('#lbframe')) : null;
    var svg=host ? visibleSvg(host) : null;
    if(!svg){ clear(); return; }
    var tabs=host.querySelector('.pvtabs');           // cursor in the M# tab strip -> don't highlight anything
    if(tabs){ var tr=tabs.getBoundingClientRect(); if(e.clientY<=tr.bottom){ clear(); return; } }
    var ctm=svg.getScreenCTM(); if(!ctm){ clear(); return; }
    var pt=svg.createSVGPoint(); pt.x=e.clientX-3; pt.y=e.clientY-3;
    var loc=pt.matrixTransform(ctm.inverse());
    var rp=svg.createSVGPoint(); rp.x=e.clientX; rp.y=e.clientY;   // clean point (no hover fudge) for the readout
    var rl=rp.matrixTransform(ctm.inverse());
    showCoord(Math.round(rl.x), Math.round(rl.y));                 // viewBox px == ink-mask px (my analysis space)
    var segs=build(svg), best=null;
    for(var i=0;i<segs.length;i++){                   // topmost element actually under the cursor: svgdump draws blobs
      var s=segs[i], inside=false;                     // (node order) then strokes, so the LAST cover is the VISIBLE one --
      try{ inside = s.isFill ? s.hit.isPointInFill(loc) : s.hit.isPointInStroke(loc); }catch(e2){}  // matching the render, where
      if(inside) best=s;                               // a later blob sits on top and its holes reveal the earlier blob beneath
    }
    if(!best){                                        // nothing under the cursor -> snap to the nearest stroke (thin, hard to hit exactly)
      var bd=Infinity;
      for(var j=0;j<segs.length;j++){
        var s2=segs[j]; if(s2.isFill) continue;
        var d=Infinity, p=s2.pts;
        for(var k=0;k<p.length;k+=2){ var dx=p[k]-loc.x, dy=p[k+1]-loc.y, dd=dx*dx+dy*dy; if(dd<d) d=dd; }
        if(d<bd){ bd=d; best=s2; }
      }
    }
    var t=best?best.seg:null;
    if(cur!==t){
      if(cur){ cur.classList.remove('near'); restore(cur); }
      cur=t; if(t){ t.classList.add('near'); raise(t); }
      mirror(t);
    }
  }
  document.addEventListener('pointermove', function(e){ last=e; if(!raf) raf=requestAnimationFrame(run); });
  document.addEventListener('pointerdown', function(e){ last=e; if(!raf) raf=requestAnimationFrame(run); });
})();
(function(){
  // The stage tabs are a per-cell radio group; selecting a stage broadcasts to every other cell so
  // the whole page moves to the same pipeline stage at once (setting .checked doesn't re-fire change,
  // so no loop). Scoped to .matrix, so the zoom lightbox's cloned cell keeps its own independent group.
  document.addEventListener('change', function(e){
    var r=e.target;
    if(!r.classList||!r.classList.contains('pvr')||r.closest('#lb')) return;
    var st=r.getAttribute('data-stage'); if(st==null) return;
    document.querySelectorAll('.matrix .pvr[data-stage="'+st+'"]').forEach(function(o){ if(o!==r) o.checked=true; });
  });
})();
</script>'''

open(OUT, "w").write(HTML)
print("wrote", OUT, "%.0f KB" % (os.path.getsize(OUT) / 1024))
