from PIL import Image
import numpy as np, os
from scipy import ndimage

HERE=os.path.dirname(os.path.abspath(__file__))
src=os.path.join(HERE,"..","..","artwork-scans","level-1-pg-4.png")
im=Image.open(src).convert("RGB"); W,H=im.size

CFG={
 "flag":   dict(mode="isolate",region=(55,90,286,672),seed=(92,95,252,665),band=6),
 "cannon": dict(mode="isolate",region=(1006,333,1390,596),seed=(1052,338,1454,594),band=6,
                protect=[(42,100),(198,272)],minsize=120),
 "dying":  dict(mode="isolate",region=(1344,1728,1618,2014),seed=(1360,1734,1612,2012),band=5),
 "soldier":dict(mode="weapon_open",region=(1370,260,1611,558),r=3),
 "mg":     dict(mode="weapon_zone",region=(984,1723,1434,2012),
                zones=[(80,60,292,118),(168,86,244,158)],minsize=25),
}

def remove_ground(mask,band,protect=()):
    h,w=mask.shape
    bottom=np.full(w,-1.0)
    for x in range(w):
        col=np.where(mask[:,x])[0]
        if len(col): bottom[x]=col.max()
    xs=np.where(bottom>=0)[0]
    if len(xs)<w*0.5: return mask
    g=np.interp(np.arange(w),xs,bottom[xs]); g=ndimage.median_filter(g,size=max(7,w//8))
    terrain=np.zeros_like(mask)
    for x in range(w):
        if any(x0<=x<x1 for x0,x1 in protect): continue   # keep wheels etc.
        lo=max(0,int(g[x]-band)); hi=min(h,int(g[x]+band)+1)
        terrain[lo:hi,x]=mask[lo:hi,x]
    if terrain.sum()<0.4*w: return mask
    return mask & ~terrain

def tighten(iso,keep,pad=8):
    ys,xs=np.where(keep)
    bx0,bx1=max(0,xs.min()-pad),min(iso.shape[1],xs.max()+pad)
    by0,by1=max(0,ys.min()-pad),min(iso.shape[0],ys.max()+pad)
    return Image.fromarray(iso[by0:by1,bx0:bx1])

def run(name):
    c=CFG[name]; rx0,ry0,rx1,ry1=c["region"]
    crop=im.crop((rx0,ry0,rx1,ry1)); crop.save(f"out/{name}_crop.png")
    ca=np.asarray(crop).astype(np.int16); lum=ca.mean(2); sat=ca.max(2)-ca.min(2)

    if c["mode"]=="weapon_open":
        mask=(lum<150)|(sat>45)
        op=ndimage.binary_erosion(mask,iterations=c["r"]); op=ndimage.binary_dilation(op,iterations=c["r"])
        lab,n=ndimage.label(op)
        sizes=ndimage.sum(np.ones_like(lab),lab,range(1,n+1))
        keep=(lab==(np.argmax(sizes)+1)) if n else op
    elif c["mode"]=="weapon_zone":
        mask=(lum<160)|(sat>50)
        zone=np.zeros_like(mask)
        for x0,y0,x1,y1 in c["zones"]: zone[y0:y1,x0:x1]=True
        m=mask&zone; lab,n=ndimage.label(m,np.ones((3,3)))
        keep=np.zeros_like(mask)
        for i in range(1,n+1):
            if (lab==i).sum()>=c["minsize"]: keep|=(lab==i)
    else:  # isolate
        mask=(lum<170)|(sat>45); mask=ndimage.binary_closing(mask,iterations=1)
        mask=remove_ground(mask,c["band"],c.get("protect",()))
        lab,n=ndimage.label(mask,np.ones((3,3)))
        sx0,sy0,sx1,sy1=c["seed"]
        lsx0,lsy0,lsx1,lsy1=sx0-rx0,sy0-ry0,sx1-rx0,sy1-ry0
        seed=np.zeros_like(mask); seed[max(0,lsy0):lsy1,max(0,lsx0):lsx1]=True
        ids=[i for i in np.unique(lab[seed&mask]) if i>0]
        keep=np.zeros_like(mask); mn=c.get("minsize",50)
        for i in ids:
            comp=(lab==i); area=int(comp.sum())
            if area>=mn: keep|=comp; continue
            ys,xs=np.where(comp); w=xs.max()-xs.min()+1; h=ys.max()-ys.min()+1
            if area>=12 and 0.5<=w/h<=2.0 and area/(w*h)>=0.6:  # keep small compact dots (salient)
                keep|=comp

    iso=np.full(ca.shape,255,np.uint8); iso[keep]=ca[keep]
    out=tighten(iso,keep); out.save(f"out/{name}_iso.png")
    print(f"{name:8} {c['mode']:12} -> {out.size}")

if __name__=="__main__":
    import sys
    os.makedirs("out",exist_ok=True)
    for k in (sys.argv[1:] or CFG): run(k)
