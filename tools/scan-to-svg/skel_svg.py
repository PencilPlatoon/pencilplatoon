# Pen-width vector with primitive fitting: stroke skeleton centerlines at a uniform
# pen width, but snap straight runs to line segments and curved runs to circular
# arcs / full circles. Genuinely thick or coloured areas are filled.
from PIL import Image
import numpy as np, os, re, vtracer, math
from scipy import ndimage
from skimage.morphology import skeletonize, remove_small_objects
from skimage.transform import hough_circle, hough_circle_peaks

INK="#1a1a17"; BLUE="#2b3f8a"; RED="#c23423"
ARC_FIT=0.5   # an arc must hug the pixels (aerr <= ARC_FIT*tol), not merely fit within tol;
              # a polygon forced through a circle passes tol loosely but never tightly.

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

def line_resid(P):
    m=P.mean(0); Q=P-m
    if len(P)<2: return 0.0
    _,_,V=np.linalg.svd(Q,full_matrices=False)
    return float(np.max(np.abs(Q@V[-1])))

def grow_line(P,i,tol):
    j=i+1
    while j+1<len(P) and line_resid(P[i:j+2])<=tol: j+=1
    return j

def grow_arc(P,i,tol,maxr):
    if i+4>=len(P): return i
    j=i+4; last=i
    while j<len(P):
        cx,cy,r,res=fit_circle(P[i:j+1])
        if res<=tol and r<=maxr and r>2: last=j; j+=1
        else: break
    return last

def full_circle(P,tol):
    cx,cy,r,res=fit_circle(P)
    if res>tol*2.2 or r<4: return None
    ang=np.sort(np.arctan2(P[:,1]-cy,P[:,0]-cx))
    gaps=np.diff(np.r_[ang,ang[0]+2*math.pi])
    if gaps.max() < math.radians(95): return (cx,cy,r)   # covers most of the circle
    return None

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

def segment_prims(P,eps,floor,maxr,minseg=10.0,minr=0.0):
    return fit_prims(P,eps,floor,maxr,minr)

def ray_to_circle(E,d,c):
    cx,cy,r=c; L=math.hypot(d[0],d[1])
    if L<1e-6: return None
    ux,uy=d[0]/L,d[1]/L; ex,ey=E[0]-cx,E[1]-cy
    b=2*(ex*ux+ey*uy); cc=ex*ex+ey*ey-r*r; disc=b*b-4*cc
    if disc<0: return None
    s=math.sqrt(disc); t=min((-b+s)/2,(-b-s)/2,key=abs)
    return [E[0]+t*ux, E[1]+t*uy]

def seglen(a,b): return math.hypot(b[0]-a[0],b[1]-a[1])

def extend_to_circles(prims,circles,thresh,minlen):
    # where a stroke ends near a detected circle, extend its last LONG straight
    # segment along its own direction to the rim, discarding any junction wobble.
    if not prims or not circles: return prims
    def near(pt):
        for c in circles:
            if abs(math.hypot(pt[0]-c[0],pt[1]-c[1])-c[2])<=thresh: return c
        return None
    c=near(prims[-1][2])              # end side
    if c:
        for j in range(len(prims)-1,-1,-1):
            if prims[j][0]=='L' and seglen(prims[j][1],prims[j][2])>=minlen:
                a,b=prims[j][1],prims[j][2]; nb=ray_to_circle(b,(b[0]-a[0],b[1]-a[1]),c)
                if nb is not None: prims=prims[:j+1]; prims[j]=('L',a,nb)
                break
    c=near(prims[0][1])               # start side
    if c:
        for j in range(len(prims)):
            if prims[j][0]=='L' and seglen(prims[j][1],prims[j][2])>=minlen:
                a,b=prims[j][1],prims[j][2]; na=ray_to_circle(a,(a[0]-b[0],a[1]-b[1]),c)
                if na is not None: prims=prims[j:]; prims[0]=('L',na,b)
                break
    return prims

def move_wheel_to_body(c, segs, pen):
    # keep the wheel's size; translate it straight up until it touches the bottom of
    # the frame (tangent to the nearest long edge above it). Ground isn't wanted, so
    # only edges above the centre matter and we never move down.
    cx,cy,r=c; best=None; bestny=1.0
    for a,b in segs:
        if seglen(a,b) < 1.5*r: continue                 # frame edges are long
        ax,ay=a; bx,by=b; dx,dy=bx-ax,by-ay; L2=dx*dx+dy*dy
        if L2<1: continue
        t=((cx-ax)*dx+(cy-ay)*dy)/L2
        if t<-0.15 or t>1.15: continue                   # foot of perpendicular on the edge
        fx,fy=ax+t*dx, ay+t*dy; pd=math.hypot(cx-fx,cy-fy)
        if fy<cy-1 and r<pd<=2.4*r:                      # a gap to a frame edge above
            if best is None or pd<best:                  # nearest edge above
                best=pd; nlen=math.hypot(dx,dy); bestny=abs(dx/nlen)  # |normal_y|
    if best is None: return c
    delta=min((best-r)/max(bestny,0.3), 1.3*r)           # rise to tangency (capped)
    return (cx, cy-delta, r)

def extend_ends_raw(P, circles, thresh, span):
    # robustly reconnect a polyline end to a nearby wheel: from a point ~span back
    # (past tip wobble) shoot along the line and replace the tip with a straight run to
    # the rim. Independent of how the line later segments.
    P=np.asarray(P,float); n=len(P)
    for end in (0,-1):
        ex,ey=P[end]
        hit=next(((cx,cy,r) for cx,cy,r in circles if abs(math.hypot(ex-cx,ey-cy)-r)<=thresh), None)
        if not hit: continue
        cx,cy,r=hit; kk=min(n-1,max(4,int(span)))
        far=P[kk] if end==0 else P[n-1-kk]
        ux,uy=ex-far[0],ey-far[1]; L=math.hypot(ux,uy)
        if L<1e-6: continue
        ux,uy=ux/L,uy/L
        b=2*((far[0]-cx)*ux+(far[1]-cy)*uy); c=(far[0]-cx)**2+(far[1]-cy)**2-r*r; disc=b*b-4*c
        if disc<0:
            dd=math.hypot(ex-cx,ey-cy); npt=np.array([cx+(ex-cx)/dd*r, cy+(ey-cy)/dd*r])
        else:
            s=math.sqrt(disc); npt=min((np.array([far[0]+t*ux,far[1]+t*uy]) for t in ((-b+s)/2,(-b-s)/2)),
                                       key=lambda p:math.hypot(p[0]-ex,p[1]-ey))
        P = np.vstack([npt, P[kk:]]) if end==0 else np.vstack([P[:n-kk], npt])
        n=len(P)
    return P

def prims_to_d(prims):
    if not prims: return ""
    d="M %.1f %.1f"%(prims[0][1][0],prims[0][1][1])
    for p in prims:
        if p[0]=='L': d+=" L %.1f %.1f"%(p[2][0],p[2][1])
        else: d+=" "+arc_cmd(p[6],p[3],p[4],p[5])
    return d

def detect_circles(skel, rmin, rmax, atol, cov_min=300):
    # Hough circle detection: finds circles from all skeleton points collectively,
    # even when the loop is fragmented into separate arcs. Returns circles and the
    # skeleton with the circle rings removed (so they aren't double-drawn as strokes).
    radii=np.arange(rmin,rmax+1)
    if len(radii)==0: return [], skel
    hres=hough_circle(skel,radii)
    accums,cxs,cys,rs=hough_circle_peaks(hres,radii,total_num_peaks=8,
        min_xdistance=max(3,rmin//2),min_ydistance=max(3,rmin//2))
    pts=np.argwhere(skel); ys=pts[:,0].astype(float); xs=pts[:,1].astype(float)
    out=[]; remove=np.zeros(len(pts),bool)
    for a,cx,cy,r in zip(accums,cxs,cys,rs):
        if a<0.17: continue                            # floor: rejects tangles (score-based)
        d=np.hypot(xs-cx,ys-cy); ring=np.abs(d-r)<=atol
        frac=ring.sum()/(2*math.pi*r)                  # fraction of circumference populated
        if frac<0.85: continue                         # a real, well-drawn ring
        ang=np.sort(np.arctan2(ys[ring]-cy,xs[ring]-cx))
        gaps=np.diff(np.r_[ang,ang[0]+2*np.pi]); cov=360-math.degrees(gaps.max())
        if cov<cov_min: continue                       # near-complete loop (goes ~all the way)
        if any(np.hypot(cx-ocx,cy-ocy)<max(ocr,r)*0.6 for ocx,ocy,ocr in out): continue
        out.append((float(cx),float(cy),float(r))); remove|=ring
    if os.environ.get("DBGCIRC"): print("  circles:",[(round(x),round(y),round(r)) for x,y,r in out])
    skel2=skel.copy(); rp=pts[remove]; skel2[rp[:,0],rp[:,1]]=False
    return out, skel2

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
    eps=0.06; floor=max(1.0,pen*0.4); maxr=130.0*F; minseg=max(10.0,4*pen); ethr=max(12.0,pen*4); minr=2.5*pen
    circles=[]; subpaths=[]; polys=[]
    if pen>8*F:                                          # a genuinely solid shape (not line-art)
        thick=black; lines=[]
    else:
        thick=ndimage.binary_dilation(black & (2*dist>thick_k*pen), np.ones((3,3)))
        # snap whole circles first (wheels, heads). rmin ~18px at 1x scan, scaled by F;
        # excludes small incidental loops (trigger guards) that outscore wheels.
        circles,skel2=detect_circles(skel, 18*F, int(min(W,H)/3), max(6.0,pen*1.8))
        lines=skeleton_polylines(skel2)

    polys=[np.array([(x,y) for (y,x) in ln],float) for ln in lines if len(ln)>=2]
    # wheel hubs: a solid dot at the centre. Detect, drop from the fill, and redraw at
    # the wheel's final centre so it travels with the wheel when it snaps to the frame.
    hubs=[]
    if circles:
        yy,xx=np.mgrid[0:H,0:W]
        for cx,cy,r in circles:
            if cy<=0.5*H: continue                       # wheels only
            cmask=((xx-cx)**2+(yy-cy)**2) < (0.4*r)**2
            ink=black & cmask
            if ink.sum()>=max(30,0.4*pen*pen):
                hubs.append((cx,cy,math.sqrt(ink.sum()/math.pi)))
                thick=thick & ~ndimage.binary_dilation(cmask,np.ones((3,3)))
    moved=[]; movemap={}
    if circles:
        segs=[(p[1],p[2]) for P in polys for p in segment_prims(P,eps,floor,maxr,minseg,minr) if p[0]=='L']
        out=[]
        for c in circles:
            nc = move_wheel_to_body(c,segs,pen) if c[1] > 0.5*H else c  # only wheels (lower half)
            out.append(nc); movemap[(c[0],c[1])]=nc
            if nc!=c: moved.append(nc)
        circles=out

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

    kept=[P for P in polys
          if not (moved and any(all(math.hypot(x-cx,y-cy)<=r+pen for x,y in P) for cx,cy,r in moved))]
    groups=link_strokes(kept)
    bd={}
    for i,P in enumerate(kept):
        Pe=extend_ends_raw(P,circles,ethr,1.5*minseg) if circles else P
        d=prims_to_d(segment_prims(Pe,eps,floor,maxr,minseg,minr))
        if d: bd[i]=d

    comps=[]                                              # (cx,cy,vis,hit) in draw order
    if blue.sum()>30: comps+=fill_comps(blue,BLUE,f"{name}_bl")
    if red.sum()>30:  comps+=fill_comps(red,RED,f"{name}_rd")
    for g in groups:                                      # one numbered component per linked stroke
        ds=[bd[i] for i in g if i in bd]
        if not ds: continue
        dstr=" ".join(ds); pts=np.vstack([kept[i] for i in g])
        vis='<path d="%s" fill="none" stroke="%s" stroke-width="%.1f" stroke-linecap="round" stroke-linejoin="round"/>'%(dstr,INK,pen)
        hit='<path class="hit" d="%s" fill="none" stroke="transparent" stroke-width="%.1f" stroke-linecap="round"/>'%(dstr,HITW)
        comps.append((float(pts[:,0].mean()),float(pts[:,1].mean()),vis,hit))
    for cx,cy,r in circles:
        vis='<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="%s" stroke-width="%.1f"/>'%(cx,cy,r,INK,pen)
        hit='<circle class="hit" cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="transparent" stroke-width="%.1f"/>'%(cx,cy,r,HITW)
        comps.append((cx,cy,vis,hit))
    if thick.sum()>20: comps+=fill_comps(thick,INK,f"{name}_thk")
    for cx,cy,har in hubs:
        mcx,mcy,_=movemap.get((cx,cy),(cx,cy,0)); rr=max(har,pen*0.6)
        vis='<circle cx="%.1f" cy="%.1f" r="%.1f" fill="%s"/>'%(mcx,mcy,rr,INK)
        hit='<circle class="hit" cx="%.1f" cy="%.1f" r="%.1f" fill="transparent"/>'%(mcx,mcy,rr+pen)
        comps.append((mcx,mcy,vis,hit))

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
    subpaths=comps
    open(f"out/{name}_C.svg","w").write("\n".join(parts))
    print(f"{name}: pen≈{pen:.1f}px  {len(subpaths)} strokes  {len(circles)} circles  {os.path.getsize(f'out/{name}_C.svg')//1024}KB")

if __name__=="__main__":
    import sys
    for n in sys.argv[1:]: build(n)
