import base64, os, re
def b64(f): return base64.b64encode(open(f,"rb").read()).decode()
def read(f): return open(f).read()
def kb(f): return "%.1f&#8202;KB"%(os.path.getsize(f)/1024)
def paths(s): return str(s.count("<path"))

def vec(name):
    return read(f"out/{name}_C.svg")

def pv_milestones(name):
    # Every retained Pencil Vector render for this subject, oldest milestone first.
    fs=[f"../pencil-vector/out/{f}" for f in os.listdir("../pencil-vector/out")
        if re.match(rf"{name}_m\d+\.svg$", f)] if os.path.isdir("../pencil-vector/out") else []
    return sorted(fs, key=lambda p:int(re.search(r"_m(\d+)\.svg$",p).group(1)))

def pv_cell(name):
    # Pencil Vector cell: a radio-driven tab per milestone (M1, M2, ...) over the same cell,
    # showing one render at a time. Data-driven, so new milestones' SVGs auto-add a tab.
    ms=pv_milestones(name)
    if not ms: return '<svg viewBox="0 0 10 10"></svg>'
    radios=tabs=panels=""
    for i,p in enumerate(ms):
        n=re.search(r"_m(\d+)\.svg$",p).group(1)
        rid=f"pv-{name}-m{n}"
        chk=" checked" if i==len(ms)-1 else ""          # default to the latest milestone
        radios+='<input class="pvr" type="radio" name="pv-%s" id="%s"%s>'%(name,rid,chk)
        tabs+='<label for="%s">M%s</label>'%(rid,n)
        panels+='<div class="pvpanel">%s</div>'%read(p)
    return '%s<div class="pvtabs">%s</div><div class="pvpanels">%s</div>'%(radios,tabs,panels)

def pv_meta(name):
    ms=pv_milestones(name)
    if not ms: return "not built"
    p=ms[-1]; n=re.search(r"_m(\d+)\.svg$",p).group(1)
    return "M%s · "%n+kb(p)+" · "+str(read(p).count("data-edge"))+"e"

def scan_overlay(name):
    # Left panel: the aligned scan (the iso the vector was traced from) with a hidden copy of
    # the vector segments on top. CSS keeps the vector invisible until its twin is hovered in
    # the clean panel, at which point that one segment draws red on the scan — for comparing
    # how the idealised segment diverges from the original ink at the same coordinates.
    svg=read(f"out/{name}_C.svg")
    m=re.search(r'viewBox="0 0 (\d+) (\d+)"',svg); W,H=m.group(1),m.group(2)
    scan=('<image x="0" y="0" width="%s" height="%s" preserveAspectRatio="none" '
          'href="data:image/png;base64,%s"/>')%(W,H,b64(f"out/{name}_iso.png"))
    svg=re.sub(r'<g class="nums".*?</g></svg>','</svg>',svg,flags=re.S)   # no number bubbles here
    return re.sub(r'(<svg[^>]*>)', lambda mm: mm.group(1)+scan, svg, count=1)

def link_css():
    # Generate the per-segment link: hovering segment N in a row's clean (.vec) panel draws
    # segment N red in that same row's scan (.overlay) panel. `.cells:has(...)` scopes it to
    # the hovered row, so one rule set covers every row.
    maxn=max((int(n) for f in os.listdir("out") if f.endswith("_C.svg")
              for n in re.findall(r'data-num="(\d+)"', read(f"out/{f}"))), default=0)
    r=[]
    for n in range(1,maxn+1):
        s='.cells:has(.vec .seg[data-num="%d"]:hover) .overlay .seg[data-num="%d"] .vis'%(n,n)
        r.append('%s path{stroke:#e8402f}'%s)
        r.append('%s path[fill]:not([fill="none"]){fill:#e8402f}'%s)
        r.append('%s circle{stroke:#e8402f}'%s)
        r.append('%s circle[fill]:not([fill="none"]){fill:#e8402f}'%s)
    return "<style>"+"".join(r)+"</style>"

comps=[
 ("flag","Capture flag","colour + fine emblem &mdash; the hard case"),
 ("cannon","Wheeled cannon","straight edges snapped to lines, both wheels to circles, solid top gun kept"),
 ("soldier","Gunner&rsquo;s SMG","weapon only &mdash; filled shape kept, figure lines dropped"),
 ("mg","Mounted MG","weapon only &mdash; gun + bipod kept, gunner dropped"),
 ("dying","Hit soldier","red spatter kept; adjacent MG dropped"),
]
flagB=os.path.join(os.path.dirname(os.path.abspath(__file__)),"B_redraw.svg")

_id=[0]
ZOOM_ICON=('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" '
           'stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/>'
           '<path d="M20 20l-4.7-4.7"/></svg>')
def tile(kind,label,inner,meta):
    i="z%d"%_id[0]; _id[0]+=1
    return ('<figure class="tile" id="%s">'
            '<div class="art %s">%s</div>'
            '<a class="zoombtn" href="#%s" aria-label="Zoom">%s</a>'
            '<figcaption><span class="k">%s</span><span class="m">%s</span></figcaption>'
            '<a class="zclose" href="#closez" aria-label="Close zoom"></a>'
            '</figure>')%(i,kind,inner,i,ZOOM_ICON,label,meta)

def img(f,alt): return '<img alt="%s" src="data:image/png;base64,%s"/>'%(alt,b64(f))

rows=""
for key,name,note in comps:
    C=vec(key)
    cells=(tile("overlay",name+" · scan",scan_overlay(key),"hover the hybrid &rarr;")
         + tile("vec",name+" · hybrid (old)",C,kb(f"out/{key}_C.svg")+" · "+paths(C)+"p")
         + tile("pv",name+" · Pencil Vector",pv_cell(key),pv_meta(key)))
    rows+=('<div class="row"><div class="rowhead"><h3>%s</h3><p>%s</p></div>'
           '<div class="cells">%s</div></div>')%(name,note,cells)

body=(link_css()
 +'<input id="shownums" type="checkbox">'
 '<label class="numtoggle" for="shownums"><span class="dot"></span>Element numbers</label>'
 '<div class="wrap">'
 '<header class="masthead"><p class="eyebrow">Scan &rarr; SVG &middot; fidelity study v8</p>'
 '<h1>Size-aware fitting, at the right resolution</h1>'
 '<p class="dek">Two principled upgrades. Fitting tolerance is now <strong>relative to each feature&rsquo;s size</strong> &mdash; a big squiggle straightens while a tiny sharp shape is preserved (<em>salience isn&rsquo;t size</em>). And the pipeline <strong>skeletonises at higher resolution</strong>, so strokes that fused at the scan&rsquo;s pixel scale (like the little box at the cannon&rsquo;s tip) resolve into their true shapes. On top of that, still: pen-width snapping (round caps), line / arc / circle fitting, and wheels that sit on the frame.</p></header>'
 '<section class="matrix"><h2>Old approach vs. new, every candidate</h2>'
 '<p class="sub">Three panels per row: original <em>scan</em> &rarr; <em>hybrid (old)</em>, the shipping <code>scan-to-svg</code> tool that fits lines / arcs / circles and keeps solid areas solid &rarr; <em>Pencil&nbsp;Vector</em>, the ground-up model-based vectorizer being built to the implementation plan. Its cell carries a <strong>tab per visually-distinct milestone</strong> &mdash; M1&ndash;M3, then M6 (M4&ndash;M5 add the cleanup tool and continuity pairing, which don&rsquo;t change the picture, so the tabs jump straight to M6). Flip through to watch the approach evolve; each render is kept. M1 is raw skeleton&rarr;graph (one centerline path per edge, no width classes yet), so it looks rougher on purpose; M6 adds interior holes so hollow shapes stay hollow.</p>'
 +rows+'</section>'
 '<footer class="foot"><p><strong>Where this lands:</strong> <em>hybrid</em> stays the batch default &mdash; subject-only, 12&ndash;21&#8202;KB, clean flat colour. <em>Auto-trace</em> when you want pencil texture; <em>redraw</em> for props you rig or recolour at runtime.</p>'
 '<p>Next: the <strong>Auto-detect + isolate</strong> button in <code>level-image-saver.html</code>, wrapping exactly this pipeline with draggable boxes and an eraser for the leftovers.</p></footer>'
 '</div>')
open("body3.html","w").write(body)
print("wrote body3.html","%.0f KB"%(os.path.getsize("body3.html")/1024))
