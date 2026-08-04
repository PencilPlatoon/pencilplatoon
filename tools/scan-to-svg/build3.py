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
    # zoom is handled by a small JS lightbox (see LIGHTBOX): the button clones the
    # cell's visible SVG into a fixed overlay -- no #hash, no scroll side effects.
    return ('<figure class="tile">'
            '<div class="art %s">%s</div>'
            '<button type="button" class="zoombtn" aria-label="Zoom">%s</button>'
            '<figcaption><span class="k">%s</span><span class="m">%s</span></figcaption>'
            '</figure>')%(kind,inner,ZOOM_ICON,label,meta)

def img(f,alt): return '<img alt="%s" src="data:image/png;base64,%s"/>'%(alt,b64(f))

# JS lightbox: clone the cell's currently-visible SVG/img into a fixed overlay.
# No #hash and no scroll changes, so opening a zoom never moves the page behind it.
LIGHTBOX='''<div id="lb"><div id="lbframe"></div></div>
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
        // clone the whole Pencil Vector cell so the milestone tabs come with the zoom;
        // remap the radio group to a fresh name/id so it drives the clone, not the page.
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
      lb.classList.add('on');
      return;
    }
    if(e.target===lb) close();               // click the backdrop (not the drawing) to close
  });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
})();
</script>'''

rows=""
for key,name,note in comps:
    cells=(tile("scan",name+" &middot; scan",img(f"out/{key}_iso.png",name+" scan"),"the drawing")
         + tile("pv",name+" &middot; Pencil Vector",pv_cell(key),pv_meta(key)))
    rows+=('<div class="row"><div class="rowhead"><h3>%s</h3><p>%s</p></div>'
           '<div class="cells">%s</div></div>')%(name,note,cells)

body=('<input id="shownums" type="checkbox">'
 '<label class="numtoggle" for="shownums"><span class="dot"></span>Element numbers</label>'
 '<div class="wrap">'
 '<header class="masthead"><p class="eyebrow">Pencil Vector &middot; milestone study</p>'
 '<h1>A drawing, vectorized to a model</h1>'
 '<p class="dek"><em>Pencil&nbsp;Vector</em> is a ground-up, model-based vectorizer built to the implementation plan: it recovers a drawing&rsquo;s <strong>topology</strong> first (a frozen graph of strokes and filled regions), then hangs geometry off it as annotations. Each cell carries a <strong>tab per milestone</strong> so you can watch the same drawing sharpen &mdash; raw skeleton &rarr; width classes &rarr; holes &rarr; fitted lines / arcs / clothoids &rarr; real primitives. Zoom any cell (the tabs come with it) and flip <em>Element&nbsp;numbers</em> to inspect the graph.</p></header>'
 '<section class="matrix"><h2>Every subject, every milestone</h2>'
 '<p class="sub">Two panels per row: the original <em>scan</em> and <em>Pencil&nbsp;Vector</em>, one milestone at a time. Each render is kept, so the tabs let you watch the approach evolve. M1 is raw skeleton&rarr;graph (one centerline path per edge, no width classes yet), so it looks rougher on purpose; M2 splits width classes (fills become filled shapes); M3 freezes stable IDs; M6 adds interior holes so hollow shapes stay hollow; <strong>M7 fits each stroke and boundary to lines, arcs and clothoids in the turning function</strong> &mdash; wobble gone, corners kept &mdash; recorded as annotations, so the raw ink is never discarded; <strong>M8 cashes those annotations in as real geometry</strong> (one <code>A</code> arc command where M7 sampled a whole polyline), the same picture at roughly half the bytes. (M4&ndash;M5 add the cleanup tool and continuity pairing, which don&rsquo;t change the picture.)</p>'
 +rows+'</section>'
 '<footer class="foot"><p><strong>Where this is going:</strong> M1&ndash;M8 are done &mdash; scan to a frozen topological model with fitted, cashed-in geometry. Next: <em>M9</em> relational constraints (snap parallels, right-angles, concentric circles), <em>M10</em> role-specific export + colliders + asset metadata, <em>M11</em> level-of-detail from the one model.</p>'
 '<p>The M4 cleanup tool is where assets actually get cut out; the automatic pipeline exists to make that step cheap, not to replace it.</p></footer>'
 '</div>'
 +LIGHTBOX)
open("body3.html","w").write(body)
print("wrote body3.html","%.0f KB"%(os.path.getsize("body3.html")/1024))
