import base64, os, re
def b64(f): return base64.b64encode(open(f,"rb").read()).decode()
def read(f): return open(f).read()
def kb(f): return "%.1f&#8202;KB"%(os.path.getsize(f)/1024)
def paths(s): return str(s.count("<path"))

def vec(name):
    return read(f"out/{name}_C.svg")

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

# featured flag: original / hybrid / redraw
featured=(tile("raster","Flag · original",img("out/flag_crop.png","flag original"),"raster source")
        + tile("vec","Flag · hybrid (auto)",vec("flag"),kb("out/flag_C.svg")+" · auto")
        + tile("vec","Flag · clean redraw",read(flagB),kb(flagB)+" · by hand"))

rows=""
for key,name,note in comps:
    C=vec(key)
    cells=(tile("overlay",name+" · scan",scan_overlay(key),"hover the hybrid &rarr;")
         + tile("vec",name+" · hybrid",C,kb(f"out/{key}_C.svg")+" · "+paths(C)+"p"))
    rows+=('<div class="row"><div class="rowhead"><h3>%s</h3><p>%s</p></div>'
           '<div class="cells">%s</div></div>')%(name,note,cells)

body=(link_css()
 +'<input id="shownums" type="checkbox">'
 '<label class="numtoggle" for="shownums"><span class="dot"></span>Element numbers</label>'
 '<div class="wrap">'
 '<header class="masthead"><p class="eyebrow">Scan &rarr; SVG &middot; fidelity study v8</p>'
 '<h1>Size-aware fitting, at the right resolution</h1>'
 '<p class="dek">Two principled upgrades. Fitting tolerance is now <strong>relative to each feature&rsquo;s size</strong> &mdash; a big squiggle straightens while a tiny sharp shape is preserved (<em>salience isn&rsquo;t size</em>). And the pipeline <strong>skeletonises at higher resolution</strong>, so strokes that fused at the scan&rsquo;s pixel scale (like the little box at the cannon&rsquo;s tip) resolve into their true shapes. On top of that, still: pen-width snapping (round caps), line / arc / circle fitting, and wheels that sit on the frame.</p></header>'
 '<section class="featured"><div class="feat-head"><h2>The flag, three ways</h2>'
 '<p>Click the redraw and zoom in to check the emblem and pole — it scales without blurring, unlike the raster original beside it.</p></div>'
 '<div class="cells feat-cells">'+featured+'</div></section>'
 '<section class="matrix"><h2>All four approaches, every candidate</h2>'
 '<p class="sub">Original scan &rarr; hybrid. The <em>hybrid</em> snaps all line-work to one pen width (round caps, never thinner than the pen), fits lines / arcs / circles, and keeps solid areas solid &mdash; a clean, tiny SVG produced automatically.</p>'
 +rows+'</section>'
 '<footer class="foot"><p><strong>Where this lands:</strong> <em>hybrid</em> stays the batch default &mdash; subject-only, 12&ndash;21&#8202;KB, clean flat colour. <em>Auto-trace</em> when you want pencil texture; <em>redraw</em> for props you rig or recolour at runtime.</p>'
 '<p>Next: the <strong>Auto-detect + isolate</strong> button in <code>level-image-saver.html</code>, wrapping exactly this pipeline with draggable boxes and an eraser for the leftovers.</p></footer>'
 '</div>')
open("body3.html","w").write(body)
print("wrote body3.html","%.0f KB"%(os.path.getsize("body3.html")/1024))
