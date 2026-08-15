"""Local pipeline server for the pencil-vector tools (Flask).

One process serves the browser tools AND owns the pipeline + files, so the tools can vectorize live
and read/write real files (no baking, no downloads, a real audit trail):

  GET  /            -> scan boxer
  GET  /asset       -> asset tool
  GET  /scans       -> list scans in artwork-scans/
  GET  /scan/<name> -> serve a scan image
  GET  /svg/<name>  -> serve an exported asset SVG (asset-tool thumbnails)
  POST /vectorize   -> {scan, boxes:[{name,x0,y0,x1,y1}]} : crop + vectorize each, save out/<name>_model.json
                       (with box provenance + scan thumbnail), record the boxes in out/boxes.json
  GET  /models      -> every current out/*_model.json (the asset tool loads these live)
  GET  /boxes       -> data/boxes.json (box defs + audit) so the boxer can pre-load a scan's boxes
  POST /box         -> {name, scan, x0,y0,x1,y1} : persist a drawn box def at once (no vectorize)
  POST /box/delete  -> {name} : drop a box def + its regeneratable model/crop (exported svgs kept)
  POST /asset/delete-> {subject, asset} : remove one saved asset (its boxes.json record + its svg file)
  POST /rename      -> {old, new} : rename a box everywhere (model, crop, boxes.json)
  POST /export      -> {subject, name, svg, state, asset?} : save an asset -- its svg + the editing state
                       (hidden sids, rotation, flips) that made it. `asset` present updates it in place,
                       absent creates a new one. Recorded on the subject's box in data/boxes.json (audit)

  python3 server.py            (or: npm run vector-server)  ->  http://localhost:8889
"""
from __future__ import annotations

import datetime
import json
import os
import re
import traceback

from flask import Flask, Response, abort, jsonify, request, send_file
from PIL import Image

from boxcrop import load_boxes, record_box, save_boxes, vectorize_box

HERE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.abspath(os.path.join(HERE, "..", "..", "artwork-scans"))
OUT = os.path.join(HERE, "out")
SVGDIR = os.path.join(OUT, "svg")
PORT = 8889

app = Flask(__name__)


def _file(name: str, mimetype: str) -> Response:      # a tool source file, served fresh (no strong caching in dev)
    return Response(open(os.path.join(HERE, name), encoding="utf-8").read(), mimetype=mimetype)


def _now() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


@app.get("/")
def boxer():
    return _file("scan_boxer.html", "text/html")


@app.get("/asset")
def asset_tool():
    return _file("asset_template.html", "text/html")


@app.get("/pv-common.css")
def pv_css():                                         # design system shared by both pages
    return _file("pv-common.css", "text/css")


@app.get("/pv-common.js")
def pv_js():                                          # helpers shared by both pages
    return _file("pv-common.js", "application/javascript")


@app.get("/scans")
def list_scans():
    exts = (".png", ".jpg", ".jpeg", ".webp")
    files = sorted(f for f in os.listdir(SCANS) if f.lower().endswith(exts)) if os.path.isdir(SCANS) else []
    return jsonify(files)


@app.get("/scan/<path:name>")
def get_scan(name):
    p = os.path.abspath(os.path.join(SCANS, name))
    if not p.startswith(SCANS) or not os.path.isfile(p):
        abort(404)
    return send_file(p)


@app.get("/svg/<path:name>")
def get_svg(name):                                     # an exported asset, for the asset-tool thumbnails
    p = os.path.abspath(os.path.join(SVGDIR, name))
    if not p.startswith(SVGDIR) or not os.path.isfile(p):
        abort(404)
    return send_file(p, mimetype="image/svg+xml")


@app.get("/models")
def get_models():
    if not os.path.isdir(OUT):
        return jsonify([])
    out = [json.load(open(os.path.join(OUT, f)))
           for f in sorted(os.listdir(OUT)) if f.endswith("_model.json")]
    return jsonify(out)


@app.get("/boxes")
def get_boxes():                                       # box defs (+ audit) so the boxer can pre-load a scan's boxes
    return jsonify(load_boxes())


@app.post("/box")
def do_box():                                          # persist a freshly-drawn box def (no vectorize) so it survives at once
    b = request.get_json(force=True)
    bx = load_boxes()
    record_box(bx, b["scan"], b)
    save_boxes(bx)
    print(f"saved box {b['name']} ({b['scan']})", flush=True)
    return jsonify({"ok": True})


@app.post("/box/delete")
def do_box_delete():                                   # drop a box def + its regeneratable model/crop (exported svgs are kept)
    name = request.get_json(force=True)["name"]
    bx = load_boxes()
    bx["boxes"] = [b for b in bx["boxes"] if b.get("name") != name]
    save_boxes(bx)
    for f in (f"{name}_model.json", f"{name}_crop.png"):
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            os.remove(p)
    print(f"deleted box {name}", flush=True)
    return jsonify({"ok": True})


@app.post("/rename")
def do_rename():                                       # rename a box everywhere: model, crop, and boxes.json entry
    req = request.get_json(force=True)
    old, new = req["old"], req["new"]
    if not new or new == old:
        return jsonify({"ok": False})
    om = os.path.join(OUT, f"{old}_model.json")
    if os.path.exists(om):
        d = json.load(open(om)); d["subject"] = new
        json.dump(d, open(os.path.join(OUT, f"{new}_model.json"), "w")); os.remove(om)
    oc = os.path.join(OUT, f"{old}_crop.png")
    if os.path.exists(oc):
        os.replace(oc, os.path.join(OUT, f"{new}_crop.png"))
    bx = load_boxes()
    for b in bx["boxes"]:
        if b.get("name") == old:
            b["name"] = new
    save_boxes(bx)
    print(f"renamed {old} -> {new}", flush=True)
    return jsonify({"ok": True, "name": new})


@app.post("/vectorize")
def do_vectorize():
    req = request.get_json(force=True)
    scan_name, boxes = req["scan"], req["boxes"]
    img = Image.open(os.path.join(SCANS, scan_name)).convert("RGB")
    bx = load_boxes()
    try:
        results = [vectorize_box(img, scan_name, b, bx) for b in boxes]
    except Exception:                                  # hand the traceback back so the tool can show it copyably
        tb = traceback.format_exc()
        print(tb, flush=True)
        return jsonify({"ok": False, "error": tb}), 500
    save_boxes(bx)
    for r in results:
        print(f"vectorized {r['name']}: nodes={r['nodes']} edges={r['edges']} blobs={r['blobs']}", flush=True)
    return jsonify(results)


def _slug(name: str) -> str:                           # a display name -> a filesystem-safe asset id
    s = re.sub(r"\s+", "_", (name or "").strip())
    s = re.sub(r"[\\/]+", "-", s)
    s = re.sub(r"[^\w.\-]", "", s)
    return s or "unnamed"


def _unique_asset(taken, base: str) -> str:            # base.svg, or base-2.svg, base-3.svg ... if taken
    cand, i = f"{base}.svg", 2
    while cand in taken:
        cand, i = f"{base}-{i}.svg", i + 1
    return cand


@app.post("/export")
def do_export():
    """Save an asset: its SVG plus the editing state (hidden sids, rotation, flips) that produced it, so it
    can be reloaded and re-edited. `asset` present -> update that asset in place; absent -> a brand-new asset."""
    req = request.get_json(force=True)
    subject, name, svg = req["subject"], req["name"], req["svg"]
    state, asset = req.get("state", {}), req.get("asset")
    os.makedirs(SVGDIR, exist_ok=True)
    bx = load_boxes()
    box = next((b for b in bx["boxes"] if b.get("name") == subject), None)
    exports = box.setdefault("exports", []) if box is not None else bx.setdefault("exports", [])
    same = exports if box is not None else [e for e in exports if e.get("subject") == subject]
    if asset:                                          # update an existing asset in place (filename is its stable id)
        entry = next((e for e in same if e.get("asset") == asset), None)
        if entry is None:
            abort(404)
        entry.update(name=name, at=_now(), state=state)
    else:                                              # a brand-new asset
        asset = _unique_asset({e.get("asset") for e in same}, _slug(name))
        entry = {"asset": asset, "name": name, "at": _now(), "state": state}
        if box is None:                                # a subject with no box (e.g. a demo) -- record loosely
            entry["subject"] = subject
        exports.append(entry)
    open(os.path.join(SVGDIR, asset), "w").write(svg)
    save_boxes(bx)
    rel = os.path.relpath(os.path.join(SVGDIR, asset), HERE)
    print(f"{'updated' if req.get('asset') else 'saved'} asset {subject}/{name} -> {rel}", flush=True)
    return jsonify({"ok": True, "asset": asset, "name": name, "path": rel})


@app.post("/asset/delete")
def do_asset_delete():                                 # remove one saved asset: its boxes.json record + its svg file
    req = request.get_json(force=True)
    subject, asset = req["subject"], req["asset"]
    bx = load_boxes()
    box = next((b for b in bx["boxes"] if b.get("name") == subject), None)
    if box is not None:
        box["exports"] = [e for e in box.get("exports", []) if e.get("asset") != asset]
    else:
        bx["exports"] = [e for e in bx.get("exports", [])
                         if not (e.get("asset") == asset and e.get("subject") == subject)]
    save_boxes(bx)
    p = os.path.join(SVGDIR, asset)
    if os.path.exists(p):
        os.remove(p)
    print(f"deleted asset {subject}/{asset}", flush=True)
    return jsonify({"ok": True})


if __name__ == "__main__":
    print(f"pencil-vector server on http://localhost:{PORT}  (boxer: /   asset tool: /asset)", flush=True)
    app.run(port=PORT, debug=False)
