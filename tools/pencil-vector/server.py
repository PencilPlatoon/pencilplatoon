"""Local pipeline server for the pencil-vector tools (Flask).

One process serves the browser tools AND owns the pipeline + files, so the tools can vectorize live
and read/write real files (no baking, no downloads, a real audit trail):

  GET  /            -> scan boxer
  GET  /cleanup     -> cleanup tool
  GET  /scans       -> list scans in artwork-scans/
  GET  /scan/<name> -> serve a scan image
  POST /vectorize   -> {scan, boxes:[{name,x0,y0,x1,y1}]} : crop + vectorize each, save out/<name>_model.json
                       (with box provenance + scan thumbnail), record the boxes in out/boxes.json
  GET  /models      -> every current out/*_model.json (the cleanup tool loads these live)
  GET  /boxes       -> data/boxes.json (box defs + audit) so the boxer can pre-load a scan's boxes
  POST /rename      -> {old, new} : rename a box everywhere (model, crop, boxes.json)
  POST /export      -> {subject, name, svg} : write out/svg/<name>.svg AND append the export to the
                       subject's box in out/boxes.json -- the audit trail

  python3 server.py            (or: npm run vector-server)  ->  http://localhost:8889
"""
from __future__ import annotations

import datetime
import json
import os

from flask import Flask, Response, abort, jsonify, request, send_file
from PIL import Image

from boxcrop import load_boxes, save_boxes, vectorize_box

HERE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.abspath(os.path.join(HERE, "..", "..", "artwork-scans"))
OUT = os.path.join(HERE, "out")
SVGDIR = os.path.join(OUT, "svg")
PORT = 8889

app = Flask(__name__)


def _page(name: str) -> Response:
    return Response(open(os.path.join(HERE, name), encoding="utf-8").read(), mimetype="text/html")


def _now() -> str:
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


@app.get("/")
def boxer():
    return _page("scan_boxer.html")


@app.get("/cleanup")
def cleanup():
    return _page("cleanup_template.html")


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
    results = [vectorize_box(img, scan_name, b, bx) for b in boxes]
    save_boxes(bx)
    for r in results:
        print(f"vectorized {r['name']}: nodes={r['nodes']} edges={r['edges']} blobs={r['blobs']}", flush=True)
    return jsonify(results)


@app.post("/export")
def do_export():
    req = request.get_json(force=True)
    subject, name, svg = req["subject"], req["name"], req["svg"]
    os.makedirs(SVGDIR, exist_ok=True)
    path = os.path.join(SVGDIR, f"{name}.svg")
    open(path, "w").write(svg)
    bx = load_boxes()
    entry = {"asset": f"{name}.svg", "at": _now()}
    box = next((b for b in bx["boxes"] if b.get("name") == subject), None)
    if box is not None:
        box.setdefault("exports", []).append(entry)
    else:                                              # a subject with no box (e.g. a demo) -- record loosely
        bx.setdefault("exports", []).append({"subject": subject, **entry})
    save_boxes(bx)
    rel = os.path.relpath(path, HERE)
    print(f"exported {subject} -> {rel}  (audit -> out/boxes.json)", flush=True)
    return jsonify({"ok": True, "path": rel})


if __name__ == "__main__":
    print(f"pencil-vector server on http://localhost:{PORT}  (boxer: /   cleanup: /cleanup)", flush=True)
    app.run(port=PORT, debug=False)
