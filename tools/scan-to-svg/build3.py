import base64, os, re
def b64(f): return base64.b64encode(open(f,"rb").read()).decode()
def read(f): return open(f).read()
def kb(f): return "%.1f&#8202;KB"%(os.path.getsize(f)/1024)
def paths(s): return str(s.count("<path"))

def datauri(f): return "data:image/png;base64,"+b64(f)

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
        radios+='<input class="pvr" type="radio" name="pv-%s" id="%s" data-m="%s"%s>'%(name,rid,n,chk)
        tabs+='<label for="%s">M%s</label>'%(rid,n)
        panels+='<div class="pvpanel">%s</div>'%read(p)
    return '%s<div class="pvtabs">%s</div><div class="pvpanels">%s</div>'%(radios,tabs,panels)

def pv_meta(name):
    ms=pv_milestones(name)
    if not ms: return "not built"
    p=ms[-1]; n=re.search(r"_m(\d+)\.svg$",p).group(1)
    return "M%s · "%n+kb(p)+" · "+str(read(p).count("data-edge"))+"e"

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

def img(f,alt): return '<img alt="%s" src="%s"/>'%(alt,datauri(f))

def subj_wh(name):
    # the drawing's pixel size, read off a milestone SVG's viewBox -- the scan overlay shares
    # this coordinate system with the PV panel. Every milestone renders the same drawing, so the
    # latest one (already sorted last) is as good as any.
    ms=pv_milestones(name)
    mm=re.search(r'viewBox="0 0 (\d+) (\d+)"',read(ms[-1])) if ms else None
    return (mm.group(1),mm.group(2)) if mm else ("1000","1000")

def scan_cell(name):
    # the scan as an SVG (image + an empty .scanov group) in the SAME coordinate system as the
    # Pencil Vector panel, so hovering a PV segment can mirror its exact geometry onto the ink.
    W,H=subj_wh(name)
    return ('<svg viewBox="0 0 %s %s" preserveAspectRatio="xMidYMid meet">'
            '<image x="0" y="0" width="%s" height="%s" preserveAspectRatio="none" href="%s"/>'
            '<g class="scanov"></g></svg>')%(W,H,W,H,datauri(f"out/{name}_iso.png"))

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

# Nearest-to-cursor identify: highlight whichever segment's rendered geometry is closest to the
# pointer, so you never have to land on a thin stroke. Distance is measured in the SVG's own user
# units -- each .hit path is sampled once (cached), plus isPointInFill so hovering inside a blob
# picks that blob. Runs for the visible SVG under the pointer, matrix cell or zoom clone alike.
NEAREST='''<script>
(function(){
  function build(svg){
    if(svg.__segs) return svg.__segs;
    var out=[];
    svg.querySelectorAll('.seg').forEach(function(seg){
      var hit=seg.querySelector('.hit'); if(!hit) return;
      var f=hit.getAttribute('fill'), isFill=!!f && f!=='none', pts=[], L=0;
      try{ L=hit.getTotalLength(); }catch(e){}
      var n=Math.max(2, Math.min(48, Math.round(L/6)));
      for(var i=0;i<=n;i++){ try{ var p=hit.getPointAtLength(L*i/n); pts.push(p.x,p.y); }catch(e){} }
      out.push({seg:seg, hit:hit, isFill:isFill, pts:pts});
    });
    svg.__segs=out; return out;
  }
  var cur=null, raf=0, last=null;
  // SVG paint order is DOM order, so a highlighted segment is still covered by whatever is drawn
  // after it. Move it to the end of its parent (top of the stack) while active, and put it back
  // exactly where it was when it stops being nearest.
  function raise(el){ el.__next=el.nextSibling; el.__parent=el.parentNode; el.parentNode.appendChild(el); }
  function restore(el){ if(el.__parent){ el.__parent.insertBefore(el, el.__next); el.__parent=null; el.__next=null; } }
  // mirror the highlighted PV segment's geometry onto its row's scan, in the shared coordinate
  // system, so you see the idealized element drawn over the ink it came from
  var mir=null;
  function mirror(t){
    if(mir){ mir.innerHTML=''; mir=null; }
    if(!t) return;
    var art=t.closest('.art'); if(!art||!art.classList.contains('pv')) return;
    var row=t.closest('.row'); if(!row) return;             // no row in the zoom clone -> skip
    var ov=row.querySelector('.scanov'), vis=t.querySelector('.vis');
    if(ov&&vis){ ov.innerHTML=vis.innerHTML; mir=ov; }
  }
  function clear(){ if(cur){ cur.classList.remove('near'); restore(cur); cur=null; } mirror(null); }
  function visibleSvg(art){
    var s=art.querySelectorAll('svg');
    for(var i=0;i<s.length;i++){ var r=s[i].getBoundingClientRect(); if(r.width>0&&r.height>0) return s[i]; }
    return null;
  }
  function run(){
    raf=0; if(!last) return; var e=last;
    var art=e.target.closest ? e.target.closest('.art') : null;
    var svg=art ? visibleSvg(art) : null;
    if(!svg){ clear(); return; }
    var ctm=svg.getScreenCTM(); if(!ctm){ clear(); return; }
    // match 3px up-and-left of the hotspot -- the cursor covers whatever is directly under it,
    // so testing under the arrow makes the highlighted segment hard to see
    var pt=svg.createSVGPoint(); pt.x=e.clientX-3; pt.y=e.clientY-3;
    var loc=pt.matrixTransform(ctm.inverse());
    var segs=build(svg), best=null, bd=Infinity;
    // a fill containing the point wins outright, so test all fills first -- when the pointer is
    // inside a blob this skips the per-sample distance scan for every segment entirely
    for(var i=0;i<segs.length;i++){
      var s=segs[i];
      if(s.isFill){ try{ if(s.hit.isPointInFill(loc)){ best=s; bd=0; break; } }catch(e2){} }
    }
    if(bd!==0) for(var i=0;i<segs.length;i++){
      var p=segs[i].pts, d=Infinity;
      for(var k=0;k<p.length;k+=2){ var dx=p[k]-loc.x, dy=p[k+1]-loc.y, dd=dx*dx+dy*dy; if(dd<d) d=dd; }
      if(d<bd){ bd=d; best=segs[i]; }
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
</script>'''

# Stage sync: the milestone tabs are a per-cell radio group, but selecting a stage should move
# the whole page to it. On any tab change, check the same `data-m` stage in every other matrix
# cell (setting .checked doesn't re-fire change, so no loop). Scoped to .matrix, so the zoom
# lightbox's cloned cell keeps its own independent radio group.
STAGESYNC='''<script>
document.addEventListener('change', function(e){
  var r=e.target;
  if(!r.classList||!r.classList.contains('pvr')||r.closest('#lb')) return;
  var m=r.getAttribute('data-m'); if(m==null) return;
  document.querySelectorAll('.matrix .pvr[data-m="'+m+'"]').forEach(function(o){ if(o!==r) o.checked=true; });
});
</script>'''

rows=""
for key,name,note in comps:
    cells=(tile("scan",name+" &middot; scan",scan_cell(key),"the drawing")
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
 '<p class="sub">Two panels per row: the original <em>scan</em> and <em>Pencil&nbsp;Vector</em>, one milestone at a time. Each render is kept, so the tabs let you watch the approach evolve. M1 is raw skeleton&rarr;graph (one centerline path per edge, no width classes yet), so it looks rougher on purpose; M2 splits width classes (fills become filled shapes); M3 freezes stable IDs; M6 adds interior holes so hollow shapes stay hollow; <strong>M7 fits each stroke and boundary to lines, arcs and clothoids in the turning function</strong> &mdash; wobble gone, corners kept &mdash; recorded as annotations, so the raw ink is never discarded; <strong>M8 emits those annotations as real geometry</strong> (one <code>A</code> arc command where M7 sampled a whole polyline), the same picture at roughly half the bytes. (M4&ndash;M5 add the cleanup tool and continuity pairing, which don&rsquo;t change the picture.)</p>'
 +rows+'</section>'
 '<footer class="foot"><p><strong>Where this is going:</strong> M1&ndash;M8 are done &mdash; scan to a frozen topological model with fitted, emitted geometry. Next: <em>M9</em> relational constraints (snap parallels, right-angles, concentric circles), <em>M10</em> role-specific export + colliders + asset metadata, <em>M11</em> level-of-detail from the one model.</p>'
 '<p>The M4 cleanup tool is where assets actually get cut out; the automatic pipeline exists to make that step cheap, not to replace it.</p></footer>'
 '</div>'
 +LIGHTBOX+NEAREST+STAGESYNC)
open("body3.html","w").write(body)
print("wrote body3.html","%.0f KB"%(os.path.getsize("body3.html")/1024))
