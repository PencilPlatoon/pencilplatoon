# Pen-width vector with primitive fitting: stroke skeleton centerlines at a uniform
# pen width, but snap straight runs to line segments and curved runs to circular
# arcs / full circles. Genuinely thick or coloured areas are filled.
from PIL import Image
import numpy as np, os, re, vtracer, math
from scipy import ndimage
from skimage.morphology import skeletonize, remove_small_objects
from skimage.transform import hough_circle, hough_circle_peaks
from skimage.measure import find_contours

INK="#1a1a17"; BLUE="#2b3f8a"; RED="#c23423"
ARC_FIT=0.5   # an arc must hug the pixels (aerr <= ARC_FIT*tol), not merely fit within tol;
              # a polygon forced through a circle passes tol loosely but never tightly.
SOLID_FRAC=0.03  # a shape is "solid" (fill it) rather than line-art when its stroke width
                 # is this fraction of the whole figure's size — scale-invariant, unlike a
                 # pixel threshold. Line-art strokes are ~1% of the figure; a blob is many %.
CIRC_MIN=18      # minimum circle radius in native scan pixels (scaled by the upsample F).
                 # NOTE: this is deliberately ABSOLUTE, not pen-relative. Real circular
                 # features (wheels, heads) and incidental loops (trigger guards) overlap in
                 # pen-units — the only thing that separates them is absolute feature size at
                 # the scan's resolution. A true multi-scan generalization needs the scan DPI
                 # as an input; until then this assumes the sketchbook's native resolution.
# --- topology resolution (how strokes join each other and circles); all *_PEN are pen-multiples ---
CONTACT_IN, CONTACT_OUT = 1.6, 2.5   # a stroke end / ring fragment is "on a rim" within [r-IN·pen, r+OUT·pen]
CONTACT_CLUSTER = 3.0                 # group free ends this close (pen-mult) as one rim junction
RING_MEMBER = 0.7                     # a polyline is an absorbed ring fragment if >this fraction sits on a rim
NEXUS_WEIGHT_CAP = 30.0               # cap (pen-mult) on a segment's angle-vote weight so one long edge can't dominate
NEXUS_REG = 0.05                      # pull the meeting point toward the endpoint centroid by this fraction of total weight
REFIT_DRIFT = 0.6                     # reject a least-squares circle refit that moves/resizes more than this fraction of r

def classify(iso_path, F=1):
    im=Image.open(iso_path).convert("RGB")
    if F>1: im=im.resize((im.width*F, im.height*F), Image.LANCZOS)  # zoom in: skeleton resolves
    a=np.asarray(im).astype(int)
    r,g,b=a[...,0],a[...,1],a[...,2]; lum=a.mean(2); sat=a.max(2)-a.min(2)
    colored=sat>55
    red=colored&(r>g+15)&(r>b+15); blue=colored&(b>r+10)&(b>g+5)
    black=(~colored)&(lum<150)
    return black,blue,red,a.shape[:2]

def neighbors(y,x):
    for dy in (-1,0,1):
        for dx in (-1,0,1):
            if dy or dx: yield y+dy,x+dx

def prune_spurs(skel, max_len):
    # remove short dangling branches (skeleton spurs from stroke wobble): a branch that
    # ends in a free endpoint and reaches a junction within max_len pixels.
    sk=skel.copy()
    for _ in range(5):
        S=set(map(tuple,np.argwhere(sk)))
        deg={p:sum((n in S) for n in neighbors(*p)) for p in S}
        remove=set()
        for e in [p for p in S if deg[p]==1]:
            path=[e]; prev=None; cur=e
            while True:
                nb=[n for n in neighbors(*cur) if n in S and n!=prev]
                if len(nb)!=1: break                 # junction or dead end
                prev,cur=cur,nb[0]; path.append(cur)
                if deg[cur]>=3 or len(path)>max_len+2: break
            if deg.get(cur,0)>=3 and len(path)-1<=max_len:
                remove.update(path[:-1])             # drop spur, keep the junction pixel
        if not remove: break
        for p in remove: sk[p]=False
    return sk

def skeleton_polylines(skel):
    S=set(map(tuple,np.argwhere(skel)))
    deg={p:sum((n in S) for n in neighbors(*p)) for p in S}
    nodes={p for p,d in deg.items() if d!=2}
    used=set(); lines=[]
    def walk(start,nxt):
        path=[start,nxt]; prev,cur=start,nxt
        while cur not in nodes:
            nb=[n for n in neighbors(*cur) if n in S and n!=prev]
            if not nb: break
            prev,cur=cur,nb[0]; path.append(cur)
            if cur==start: break
        return path
    for n in nodes:
        for m in [p for p in neighbors(*n) if p in S]:
            if (n,m) in used: continue
            path=walk(n,m)
            for i in range(len(path)-1):
                used.add((path[i],path[i+1])); used.add((path[i+1],path[i]))
            if len(path)>=2: lines.append(path)
    remaining=S-{p for ln in lines for p in ln}; seen=set()
    for p in remaining:
        if p in seen: continue
        nb=[n for n in neighbors(*p) if n in S]
        if not nb: continue
        path=walk(p,nb[0])
        for q in path: seen.add(q)
        if len(path)>=2: lines.append(path)
    return lines

# ---- primitive fitting (points are (x,y) float arrays) ----
def fit_circle(P):
    x,y=P[:,0],P[:,1]
    A=np.c_[2*x,2*y,np.ones(len(P))]; b=x*x+y*y
    sol,*_=np.linalg.lstsq(A,b,rcond=None); cx,cy,c=sol
    r=math.sqrt(max(c+cx*cx+cy*cy,1e-6))
    resid=float(np.max(np.abs(np.hypot(x-cx,y-cy)-r)))
    return cx,cy,r,resid

def refit_circle(prev, pts, max_drift):
    # least-squares refit of a circle to `pts`, accepted only if it stays within max_drift*r of
    # `prev` (rejects a wild fit). Used to refine to ring points, and again to pull to contacts.
    cx,cy,r=prev; fcx,fcy,fr,_=fit_circle(np.asarray(pts,float))
    if abs(fr-r)<max_drift*r and math.hypot(fcx-cx,fcy-cy)<max_drift*r: return (fcx,fcy,fr)
    return prev

def line_resid(P):
    if len(P)<2: return 0.0
    Q=P-P.mean(0)
    _,_,V=np.linalg.svd(Q,full_matrices=False)
    return float(np.max(np.abs(Q@V[-1])))

def arc_cmd(seg,cx,cy,r):
    ang=np.arctan2(seg[:,1]-cy,seg[:,0]-cx)
    d=np.diff(ang); d=(d+math.pi)%(2*math.pi)-math.pi; tot=float(d.sum())
    large=1 if abs(tot)>math.pi else 0
    sweep=1 if tot>0 else 0
    p1=seg[-1]
    return "A %.1f %.1f 0 %d %d %.1f %.1f"%(r,r,large,sweep,p1[0],p1[1])

def link_strokes(polys):
    # group branch-polylines into continuous strokes: at each shared junction, pair the
    # two branches that continue most straight-through, so one visible line = one stroke.
    from collections import defaultdict
    ends=defaultdict(list)
    key=lambda pt:(round(float(pt[0])),round(float(pt[1])))
    for i,P in enumerate(polys):
        ends[key(P[0])].append((i,0)); ends[key(P[-1])].append((i,1))
    parent=list(range(len(polys)))
    def find(a):
        while parent[a]!=a: parent[a]=parent[parent[a]]; a=parent[a]
        return a
    def adir(i,e):
        P=polys[i]; k=min(len(P)-1,5)
        v=(P[k]-P[0]) if e==0 else (P[-1-k]-P[-1]); n=math.hypot(v[0],v[1])
        return (v[0]/n,v[1]/n) if n>1e-6 else (0.0,0.0)
    for coord,lst in ends.items():
        if len(lst)<2: continue
        dirs=[adir(i,e) for i,e in lst]; used=set()
        cand=sorted(((a,b) for a in range(len(lst)) for b in range(a+1,len(lst))),
                    key=lambda ab: dirs[ab[0]][0]*dirs[ab[1]][0]+dirs[ab[0]][1]*dirs[ab[1]][1])
        for a,b in cand:
            if a in used or b in used: continue
            if dirs[a][0]*dirs[b][0]+dirs[a][1]*dirs[b][1] < -0.5:   # straight-through (>120 deg)
                parent[find(lst[a][0])]=find(lst[b][0]); used.add(a); used.add(b)
    groups=defaultdict(list)
    for i in range(len(polys)): groups[find(i)].append(i)
    return list(groups.values())

def bbox_diag(P):
    return math.hypot(float(np.ptp(P[:,0])), float(np.ptp(P[:,1])))

def max_dev_index(P):
    # index and value of the point furthest from the chord P[0]..P[-1] (a corner or
    # the crown of a curve). For near-closed runs, measure from the centroid instead.
    a,b=P[0],P[-1]; dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy)
    if L<1e-6:
        c=P.mean(0); dev=np.hypot(P[:,0]-c[0],P[:,1]-c[1])
    else:
        nx,ny=-dy/L,dx/L; dev=np.abs((P[:,0]-a[0])*nx+(P[:,1]-a[1])*ny)
    k=int(np.argmax(dev)); return k, float(dev[k])

def swept_angle(P,cx,cy):
    ang=np.arctan2(P[:,1]-cy,P[:,0]-cx); d=np.diff(ang)
    d=(d+math.pi)%(2*math.pi)-math.pi; return abs(float(d.sum()))

def fit_prims(P, eps, floor, maxr, minr, depth=0):
    # size-relative, fidelity-driven fit: accept a line, else an arc, else split at the
    # worst point and recurse. Tolerance scales with the run's own size (salience!=size).
    n=len(P)
    if n<=2: return [('L',P[0].copy(),P[-1].copy())]
    tol=max(floor, eps*bbox_diag(P))
    k,ldev=max_dev_index(P)
    if ldev<=tol:                                        # straight enough (relative)
        return [('L',P[0].copy(),P[-1].copy())]
    # corner vs curve: if splitting at the worst point already yields two straight runs,
    # this is a corner between line segments, not an arc — prefer the lines over one
    # smoothing arc. Each half is judged against its OWN size-relative tolerance (not the
    # parent's), so a genuine curve — whose halves are still curved at their own scale —
    # fails this test and the arc branch below still wins.
    straight=lambda Q: len(Q)>=2 and line_resid(Q)<=max(floor, eps*bbox_diag(Q))
    corner = 0<k<n-1 and straight(P[:k+1]) and straight(P[k:])
    if n>=5 and not corner:
        cx,cy,r,aerr=fit_circle(P)
        # minr rejects rounded corners (radius ~pen) so they stay sharp; real curves keep
        if minr<=r<maxr and aerr<=ARC_FIT*tol and swept_angle(P,cx,cy)>math.radians(25):
            return [('A',P[0].copy(),P[-1].copy(),cx,cy,r,P.copy())]
    if k<=0 or k>=n-1 or depth>60: k=n//2                # safety
    return fit_prims(P[:k+1],eps,floor,maxr,minr,depth+1)+fit_prims(P[k:],eps,floor,maxr,minr,depth+1)

def segment_prims(P,eps,floor,maxr,minr=0.0):
    return fit_prims(P,eps,floor,maxr,minr)

def blob_outline(comp, eps, floor, maxr, minr):
    # Straighten a solid region's outline with the SAME primitive fitting used for strokes:
    # trace its boundary and fit lines/arcs, so a blob gets clean straight edges and sharp
    # corners instead of vtracer's pixel-stepped polygon. Returns the closed prims, or None.
    cs=find_contours(comp.astype(float),0.5)
    if not cs: return None
    C=max(cs,key=len); P=np.column_stack([C[:,1],C[:,0]])          # boundary as (x,y)
    ctr=P.mean(0); k=int(np.argmax(np.hypot(P[:,0]-ctr[0],P[:,1]-ctr[1])))
    P=np.vstack([P[k:],P[:k+1]])                                    # open the loop at a corner
    return fit_prims(P,eps,floor,maxr,minr)

def outline_verts(prims):
    # the corner points of a fitted outline (prim endpoints), for use as nexus candidates
    return [np.asarray(prims[0][1],float)]+[np.asarray(p[2],float) for p in prims]

def prims_to_d(prims):
    if not prims: return ""
    d="M %.1f %.1f"%(prims[0][1][0],prims[0][1][1])
    for p in prims:
        if p[0]=='L': d+=" L %.1f %.1f"%(p[2][0],p[2][1])
        else: d+=" "+arc_cmd(p[6],p[3],p[4],p[5])
    return d

def detect_circles(skel, rmin, rmax, atol, cov_min=300):
    # Hough circle detection: finds circles from all skeleton points collectively, even when the
    # loop is fragmented into separate arcs. Returns each circle and its ring points (so the
    # circle can later be refit to pass through its stroke-contacts as well as its ring).
    radii=np.arange(rmin,rmax+1)
    if len(radii)==0: return [], []
    hres=hough_circle(skel,radii)
    accums,cxs,cys,rs=hough_circle_peaks(hres,radii,total_num_peaks=8,
        min_xdistance=max(3,rmin//2),min_ydistance=max(3,rmin//2))
    pts=np.argwhere(skel); ys=pts[:,0].astype(float); xs=pts[:,1].astype(float)
    out=[]; rings=[]; remove=np.zeros(len(pts),bool)
    for a,cx,cy,r in zip(accums,cxs,cys,rs):
        if a<0.17: continue                            # floor: rejects tangles (score-based)
        d=np.hypot(xs-cx,ys-cy); ring=np.abs(d-r)<=atol
        frac=ring.sum()/(2*math.pi*r)                  # fraction of circumference populated
        if frac<0.85: continue                         # a real, well-drawn ring
        ang=np.sort(np.arctan2(ys[ring]-cy,xs[ring]-cx))
        gaps=np.diff(np.r_[ang,ang[0]+2*np.pi]); cov=360-math.degrees(gaps.max())
        if cov<cov_min: continue                       # near-complete loop (goes ~all the way)
        if any(np.hypot(cx-ocx,cy-ocy)<max(ocr,r)*0.6 for ocx,ocy,ocr in out): continue
        rp=np.c_[xs[ring],ys[ring]]
        # refine Hough's voted (integer-radius) circle by least-squares on its own ring points,
        # which matches the drawn ring far better (Hough is biased small); keep it if sane.
        cx,cy,r=refit_circle((cx,cy,r), rp, 0.5)
        out.append((float(cx),float(cy),float(r))); rings.append(rp); remove|=ring
    if os.environ.get("DBGCIRC"): print("  circles:",[(round(x),round(y),round(r)) for x,y,r in out])
    skel2=skel.copy(); rp=pts[remove]; skel2[rp[:,0],rp[:,1]]=False   # rings removed: no chord strokes
    return out, skel2, rings

def fill_paths(mask, tag, col, speckle=5):
    Image.fromarray(np.where(mask,0,255).astype(np.uint8)).convert("RGB").save(f"out/_{tag}.png")
    vtracer.convert_image_to_svg_py(f"out/_{tag}.png",f"out/_{tag}.svg",colormode='color',
        hierarchical='stacked',mode='polygon',filter_speckle=speckle,color_precision=6,path_precision=3)
    out=[]
    for pd,fill,tr in re.findall(r'<path d="([^"]+)"\s+fill="([^"]+)"(?:\s+transform="([^"]*)")?\s*/>',open(f"out/_{tag}.svg").read()):
        if fill.lower() in ("#ffffff","#fefefe"): continue
        tra=' transform="%s"'%tr if tr else ''
        out.append('<path d="%s" fill="%s"%s/>'%(pd,col,tra))
    return out

def _line_isect(lines, anchor):
    # The meeting point minimises the weighted sum of PERPENDICULAR distances to each segment's
    # line (p_i, unit dir u_i, weight w_i). Perpendicular distance is the angle-change cost, so a
    # segment reaches this point mainly by lengthening/shortening along its axis (cheap) rather
    # than tilting (costly) — shape is preserved. Longer segments are weighted more (their angle
    # is more salient). Light regularisation toward `anchor` keeps it stable for near-parallel lines.
    W=sum(w for _,_,w in lines); reg=NEXUS_REG*W+1e-6
    A=reg*np.eye(2); b=reg*np.asarray(anchor,float)
    for p,u,w in lines:
        M=w*(np.eye(2)-np.outer(u,u)); A+=M; b+=M@np.asarray(p,float)
    return np.linalg.solve(A,b)

def _body_line(P, e, pen):
    # a point on the stroke just past its end-wobble, and the unit direction pointing outward,
    # so the meeting point is set by the stroke's true orientation, not its junction wobble.
    n=len(P); step=min(max(1,int(2.5*pen)), max(1,(n-1)//2))
    if e==0: a=P[step]; b=P[min(n-1,2*step)]
    else:    a=P[n-1-step]; b=P[max(0,n-1-2*step)]
    v=a-b; L=math.hypot(v[0],v[1])
    if L<1e-6: v=(P[0]-P[-1]) if e==0 else (P[-1]-P[0]); L=math.hypot(v[0],v[1])
    return (a, (v/L if L>1e-6 else np.array([1.0,0.0])))

def resolve_topology(polys, poly_nodes, circles, rings, blob_polys, pen):
    # Preserve the scan's TOPOLOGY. Priority: connectivity > shape (orientation+straightness) >
    # size > position. The skeleton already carries the connectivity — strokes meeting at a
    # junction share a node BLOB. We cluster by that blob (not by distance, so two nearby T's stay
    # two T's), then:
    #   (1) drop ring-arc polylines (the idealised circle stands in for the whole rim);
    #   (2) at each junction of >=2 strokes, set the meeting point to the strokes' own line
    #       intersection (keeps their angles, kills wobble kinks); a lone stroke touching a circle
    #       meets it along its own direction;
    #   (3) a circle YIELDS to its multi-stroke contacts: refit it through (ring points + those
    #       nexuses), so its rim moves to pass through where the strokes actually meet.
    bin_,bout=CONTACT_IN*pen,CONTACT_OUT*pen
    # absorb ring fragments (e.g. a bulge that survived the tighter ring-removal in detect_circles):
    # a polyline hugging a rim — most points in the contact band and near-constant radius — is drawn
    # by the idealised circle, not as its own stroke.
    is_ring=[False]*len(polys)
    for i,P in enumerate(polys):
        for cx,cy,r in circles:
            d=np.hypot(P[:,0]-cx,P[:,1]-cy); inb=(d>=r-bin_)&(d<=r+bout)
            if inb.mean()>RING_MEMBER and inb.any() and (d[inb].max()-d[inb].min())<CONTACT_CLUSTER*pen:
                is_ring[i]=True; break
    S=[np.asarray(polys[i],float) for i in range(len(polys)) if not is_ring[i]]
    N=[poly_nodes[i] for i in range(len(polys)) if not is_ring[i]]
    from collections import defaultdict
    grp=defaultdict(list)                                  # node blob id -> [(stroke, end)]
    for i,(na,nb) in enumerate(N):
        if len(S[i])>=2:
            if na>0: grp[na].append((i,0))
            if nb>0: grp[nb].append((i,-1))
    posf=lambda ie: S[ie[0]][0 if ie[1]==0 else -1]
    def near_circle(pt):
        for ci,(cx,cy,r) in enumerate(circles):
            if r-bin_ <= math.hypot(pt[0]-cx,pt[1]-cy) <= r+bout: return ci
        return None
    def seg_nexus(mem):                                   # angle-preserving meeting point of the members
        ln=[(*_body_line(S[i],e,pen), min(bbox_diag(S[i]),NEXUS_WEIGHT_CAP*pen)) for (i,e) in mem]
        return _line_isect(ln, np.mean([posf(m) for m in mem],0))
    target={}; contacts=defaultdict(list); free=[]
    for nid,mem in grp.items():                           # (1) interior junctions by connectivity
        if len(mem)>=2:
            nx=seg_nexus(mem)
            for m in mem: target[m]=nx
            ci=near_circle(nx)
            if ci is not None: contacts[ci].append(nx)
        else: free.append(mem[0])
    fc=defaultdict(list); blob_free=[]                     # (2) route free ends to a circle or a blob
    for m in free:
        ci=near_circle(posf(m))
        if ci is not None: fc[ci].append(m)
        elif blob_polys: blob_free.append(m)
    singles=[]
    for ci,mem in fc.items():
        seen=set()
        for a in mem:
            if a in seen: continue
            cl=[a]; seen.add(a); pa=posf(a)
            for b in mem:
                if b not in seen and math.hypot(*(posf(b)-pa))<=CONTACT_CLUSTER*pen: cl.append(b); seen.add(b)
            if len(cl)>=2:                                # >=2 strokes meet here: they set the point
                nx=seg_nexus(cl)
                for m in cl: target[m]=nx
                contacts[ci].append(nx)
            else: singles.append((cl[0],ci))              # lone stroke: yields to the circle (step 4)
    circles=list(circles)
    for ci,pts in contacts.items():                       # (3) circle yields: refit through contacts+ring
        w=max(1,len(rings[ci])//(3*len(pts)))             # weight contacts to ~a third of the ring's pull
        fit=np.vstack([rings[ci]]+[np.array(pts)]*w)
        circles[ci]=refit_circle(circles[ci], fit, REFIT_DRIFT)
    for (i,e),ci in singles:                              # (4) lone stroke meets its circle along its axis
        a,u=_body_line(S[i],e,pen); cx,cy,r=circles[ci]; ep=posf((i,e))
        ex,ey=a[0]-cx,a[1]-cy; bq=2*(ex*u[0]+ey*u[1]); cq=ex*ex+ey*ey-r*r; disc=bq*bq-4*cq
        if disc>=0:
            s=math.sqrt(disc)
            cand=[np.array([a[0]+t*u[0],a[1]+t*u[1]]) for t in ((-bq+s)/2,(-bq-s)/2)]
            target[(i,e)]=min(cand,key=lambda q:math.hypot(q[0]-ep[0],q[1]-ep[1]))
    def _foot(p,a,b):                                     # nearest point on segment a..b to p
        ab=b-a; L2=float(ab@ab)
        if L2<1: return a
        t=max(0.0,min(1.0,float((p-a)@ab)/L2)); return a+t*ab
    for m in blob_free:                                   # (5) strokes meet a fixed blob: snap the end
        ep=posf(m); best=None                             # to its nearest corner (a shared nexus), else edge
        for verts in blob_polys:
            for v in verts:
                dd=math.hypot(ep[0]-v[0],ep[1]-v[1])
                if dd<=CONTACT_IN*pen and (best is None or dd<best[0]): best=(dd,np.asarray(v,float))
        if best is None:
            for verts in blob_polys:
                for j in range(len(verts)-1):
                    q=_foot(ep,np.asarray(verts[j],float),np.asarray(verts[j+1],float))
                    dd=math.hypot(ep[0]-q[0],ep[1]-q[1])
                    if dd<=CONTACT_OUT*pen and (best is None or dd<best[0]): best=(dd,q)
        if best is not None: target[m]=best[1]
    out=[]
    for i,P in enumerate(S):
        P=[np.asarray(p,float) for p in P]; n=len(P)
        t0=target.get((i,0)); t1=target.get((i,-1))
        if n<=4:                                          # too short to have wobble: just move ends
            if t1 is not None: P[-1]=t1
            if t0 is not None: P[0]=t0
        else:
            step=min(max(1,int(2.5*pen)), (n-1)//2)       # replace end wobble with a straight run
            if t1 is not None: P=P[:n-step]+[t1]
            if t0 is not None: P=[t0]+P[step:]
        out.append(np.array(P))
    return out, circles

def build(name, thick_k=1.75, F=3):
    # F = upsample factor: skeletonise at higher resolution so thin walls between merged
    # strokes resolve (a ~3px wall pinches the skeleton; at F*3px it stays a wall).
    black,blue,red,(H,W)=classify(f"out/{name}_iso.png", F)
    black=ndimage.binary_closing(black,iterations=1); black=remove_small_objects(black,int(15*F))
    dist=ndimage.distance_transform_edt(black)
    skel=skeletonize(black); w=2*dist[skel]; pen=float(np.median(w[w>0]))
    # fill scribble imperfections: SMALL gaps sitting inside a high-ink-density (solid)
    # area. Outlines (sparse) and larger intentional holes are left alone. pen is kept
    # from the line-work (not recomputed) so a filled blob doesn't flip the solid test.
    win=int(3*pen)|1
    solid=ndimage.binary_dilation(ndimage.uniform_filter(black.astype(float),size=win)>0.55,iterations=2)
    holes=ndimage.binary_fill_holes(black)&~black
    lab_h,nh=ndimage.label(holes); cap=(3.0*pen)**2
    fillmask=np.zeros_like(black)
    for i in range(1,nh+1):
        comp=(lab_h==i)
        if comp.sum()<=cap and (comp&solid).mean()>0:
            if (comp&solid).sum()>=0.5*comp.sum(): fillmask|=comp   # mostly inside a solid area
    if fillmask.any():
        black=black|fillmask
        dist=ndimage.distance_transform_edt(black); skel=skeletonize(black)
    skel=prune_spurs(skel, 2.2*pen)                   # drop tabs while connectors are still
                                                      # attached to rings (before ring removal)
    eps=0.06; floor=max(1.0,pen*0.4); maxr=130.0*F; minr=2.5*pen
    ys0,xs0=np.where(black); fig=math.hypot(np.ptp(xs0),np.ptp(ys0)) if len(xs0) else 1.0
    circles=[]; rings=[]                                 # stay empty in the solid-shape branch below
    if pen>SOLID_FRAC*fig:                               # a genuinely solid shape (not line-art)
        thick=black; lines=[]
    else:
        # a "solid" region is the ink around a locally-thick core. Take the deep core, then grow
        # it back out to the ink's true edge (dilate within `black` by the erosion depth) so the
        # filled blob matches the drawing rather than sitting a pen-half inside it.
        core=black & (2*dist>thick_k*pen)
        thick=black & (ndimage.distance_transform_edt(~core) <= thick_k*pen/2+2)
        # find circles (wheels, heads). CIRC_MIN (scaled by F) is the smallest radius kept,
        # which rejects small incidental loops (trigger guards).
        circles,skel,rings=detect_circles(skel, CIRC_MIN*F, int(min(W,H)/3), max(6.0,pen*1.8))
        skel=skel & ~thick               # a blob is drawn as a filled shape; strokes stop at its
        lines=skeleton_polylines(skel)   # edge, they don't run through it (no interior medial axis)

    # node identity per skeleton pixel: junction blobs (deg>=3) and free ends (deg==1). Clustering
    # meeting strokes by blob (connectivity) keeps two nearby junctions distinct — unlike distance.
    Sb=skel.astype(np.uint8); Kk=np.ones((3,3),int); Kk[1,1]=0
    deg=ndimage.convolve(Sb,Kk,mode='constant')*Sb
    node_labels,_=ndimage.label(Sb & (deg!=2), structure=np.ones((3,3)))
    polys=[]; poly_nodes=[]
    for ln in lines:
        if len(ln)<2: continue
        polys.append(np.array([(x,y) for (y,x) in ln],float))
        poly_nodes.append((int(node_labels[ln[0][0],ln[0][1]]), int(node_labels[ln[-1][0],ln[-1][1]])))
    # Wheel hubs: a solid dot at a circle's centre. Detect it, draw it as a faithful feature,
    # and remove it from the fill. Each shape is idealised on its own — circles stay where
    # they were detected. We do NOT nudge circles to force contact with neighbouring strokes:
    # that cascades into worse distortions (kinked frames, slivers) than the small gaps it closes.
    hubs=[]
    if circles:
        yy,xx=np.mgrid[0:H,0:W]
        for cx,cy,r in circles:
            cmask=((xx-cx)**2+(yy-cy)**2) < (0.4*r)**2   # a solid dot concentric with the circle
            ink=black & cmask
            if ink.sum()>=max(30,0.4*pen*pen):
                ys,xs=np.where(ink)
                hubs.append((float(xs.mean()),float(ys.mean()),math.sqrt(ink.sum()/math.pi)))
                thick=thick & ~ndimage.binary_dilation(cmask,np.ones((3,3)))

    HITW=pen*2.8
    def cen(mask): ys,xs=np.where(mask); return (float(xs.mean()),float(ys.mean()))
    def fill_comps(mask,col,tag):                         # one component per connected blob
        out=[]; lab,nc=ndimage.label(mask)
        for i in range(1,nc+1):
            comp=(lab==i)
            if comp.sum()<max(20,0.3*pen*pen): continue
            ps=fill_paths(comp,f"{tag}{i}",col)
            if ps:
                vis="".join(ps)
                hit="".join(p.replace('<path ','<path class="hit" ').replace('fill="%s"'%col,'fill="transparent"') for p in ps)
                cx,cy=cen(comp); out.append((cx,cy,vis,hit))
        return out

    blobs=[]                                              # (prims, vertices, centroid) per solid region
    lab,nc=ndimage.label(thick)
    for i in range(1,nc+1):
        comp=(lab==i)
        if comp.sum()<max(20,0.3*pen*pen): continue
        pr=blob_outline(comp,eps,floor,maxr,minr)
        if not pr: continue
        ys,xs=np.where(comp); blobs.append((pr,outline_verts(pr),(float(xs.mean()),float(ys.mean()))))
    polys,circles=resolve_topology(polys,poly_nodes,circles,rings,[b[1] for b in blobs],pen)
    kept=polys
    groups=link_strokes(kept)
    bd={}
    for i,P in enumerate(kept):
        d=prims_to_d(segment_prims(P,eps,floor,maxr,minr))
        if d: bd[i]=d

    comps=[]                                              # (cx,cy,vis,hit) in draw order
    if blue.sum()>30: comps+=fill_comps(blue,BLUE,f"{name}_bl")
    if red.sum()>30:  comps+=fill_comps(red,RED,f"{name}_rd")
    for g in groups:                                      # one numbered component per linked stroke
        ds=[bd[i] for i in g if i in bd]
        if not ds: continue
        dstr=" ".join(ds); pts=np.vstack([kept[i] for i in g])
        if bbox_diag(pts) < pen: continue                 # drop degenerate slivers (no real extent)
        vis='<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round"/>'%(dstr,INK,pen)
        hit='<path class="hit" d="%s" fill="none" stroke="transparent" stroke-width="%.1f" stroke-linecap="round"/>'%(dstr,HITW)
        comps.append((float(pts[:,0].mean()),float(pts[:,1].mean()),vis,hit))
    for cx,cy,r in circles:
        vis='<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="%s" stroke-width="%.1f"/>'%(cx,cy,r,INK,pen)
        hit='<circle class="hit" cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="transparent" stroke-width="%.1f"/>'%(cx,cy,r,HITW)
        comps.append((cx,cy,vis,hit))
    for pr,verts,(cx,cy) in blobs:                        # straightened solid regions (lines/arcs + corners)
        d=prims_to_d(pr)+" Z"
        vis='<path d="%s" fill="%s"/>'%(d,INK)
        hit='<path class="hit" d="%s" fill="transparent"/>'%d
        comps.append((cx,cy,vis,hit))
    for hx,hy,har in hubs:                                # already at the wheel's final centre
        rr=max(har,pen*0.6)
        vis='<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'%(hx,hy,rr,INK)
        hit='<circle class="hit" cx="%.1f" cy="%.1f" r="%.1f" fill="transparent"/>'%(hx,hy,rr+pen)
        comps.append((hx,hy,vis,hit))

    parts=['<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'%(W,H,W,H)]
    br=pen*1.4; fs=pen*1.8; cr=pen*2.6; cX=cr+pen; cY=cr+pen   # corner bubble (fixed top-left)
    for n,(cx,cy,vis,hit) in enumerate(comps,1):
        corner=('<g class="corner"><circle cx="%.1f" cy="%.1f" r="%.1f" fill="#e8402f"/>'
                '<text x="%.1f" y="%.1f" font-size="%.1f" fill="#fff" text-anchor="middle" dominant-baseline="central" '
                'font-family="system-ui,sans-serif" font-weight="700">%d</text></g>')%(cX,cY,cr,cX,cY,cr*1.15,n)
        parts.append('<g class="seg" data-num="%d"><g class="vis">%s</g>%s%s</g>'%(n,vis,hit,corner))
    parts.append('<g class="nums" font-family="system-ui,sans-serif" font-weight="700">')
    for n,(cx,cy,vis,hit) in enumerate(comps,1):
        parts.append('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="#e8402f" stroke="#fff" stroke-width="%.1f"/>'%(cx,cy,br,pen*0.3))
        parts.append('<text x="%.1f" y="%.1f" font-size="%.1f" fill="#fff" text-anchor="middle" dominant-baseline="central">%d</text>'%(cx,cy,fs,n))
    parts.append('</g></svg>')
    open(f"out/{name}_C.svg","w").write("\n".join(parts))
    print(f"{name}: pen≈{pen:.1f}px  {len(comps)} strokes  {len(circles)} circles  {os.path.getsize(f'out/{name}_C.svg')//1024}KB")

if __name__=="__main__":
    import sys
    # default to whatever iso.py produced (out/*_iso.png), so the subject list
    # lives only in iso.py's CFG — no second copy to keep in sync.
    names=sys.argv[1:] or sorted(f[:-8] for f in os.listdir("out") if f.endswith("_iso.png"))
    for n in names: build(n)
