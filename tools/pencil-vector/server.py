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
  POST /export      -> {subject, name, svg} : write out/svg/<name>.svg AND append the export to the
                       subject's box in out/boxes.json -- the audit trail

  python3 server.py            (or: npm run vector-server)  ->  http://localhost:8000
"""
from __future__ import annotations

import datetime
import json
import os

from flask import Flask, Response, abort, jsonify, request, send_file
from PIL import Image

from export_model import _scan_b64, model_dict
from vectorize import LATEST, vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.abspath(os.path.join(HERE, "..", "..", "artwork-scans"))
OUT = os.path.join(HERE, "out")
SVGDIR = os.path.join(OUT, "svg")
BOXES = os.path.join(OUT, "boxes.json")
PORT = 8000

app = Flask(__name__)


def _page(name: str) -> Response:
    return Response(open(os.path.join(HERE, name), encoding="utf-8").read(), mimetype="text/html")


def _load_boxes() -> dict:
    return json.load(open(BOXES)) if os.path.exists(BOXES) else {"boxes": [], "exports": []}


def _save_boxes(d: dict) -> None:
    os.makedirs(OUT, exist_ok=True)
    json.dump(d, open(BOXES, "w"), indent=2)


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


@app.post("/vectorize")
def do_vectorize():
    req = request.get_json(force=True)
    scan_name, boxes = req["scan"], req["boxes"]
    img = Image.open(os.path.join(SCANS, scan_name)).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    bx = _load_boxes()
    by_name = {b["name"]: b for b in bx["boxes"]}
    results = []
    for b in boxes:
        crop = img.crop((b["x0"], b["y0"], b["x1"], b["y1"]))
        crop_path = os.path.join(OUT, f"{b['name']}_crop.png")
        crop.save(crop_path)
        d = model_dict(vectorize(crop_path, milestone=LATEST), b["name"], _scan_b64(crop))
        d["box"] = {"scan": scan_name, "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"]}
        json.dump(d, open(os.path.join(OUT, f"{b['name']}_model.json"), "w"))
        rec = by_name.get(b["name"], {"exports": []})
        rec.update({"name": b["name"], "scan": scan_name,
                    "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"]})
        rec.setdefault("exports", [])
        by_name[b["name"]] = rec
        results.append({"name": b["name"], "nodes": len(d["nodes"]),
                        "edges": len(d["edges"]), "blobs": len(d["blobs"])})
        print(f"vectorized {b['name']}: nodes={len(d['nodes'])} edges={len(d['edges'])} blobs={len(d['blobs'])}", flush=True)
    bx["boxes"] = list(by_name.values())
    _save_boxes(bx)
    return jsonify(results)


@app.post("/export")
def do_export():
    req = request.get_json(force=True)
    subject, name, svg = req["subject"], req["name"], req["svg"]
    os.makedirs(SVGDIR, exist_ok=True)
    path = os.path.join(SVGDIR, f"{name}.svg")
    open(path, "w").write(svg)
    bx = _load_boxes()
    entry = {"asset": f"{name}.svg", "at": _now()}
    box = next((b for b in bx["boxes"] if b.get("name") == subject), None)
    if box is not None:
        box.setdefault("exports", []).append(entry)
    else:                                              # a subject with no box (e.g. a demo) -- record loosely
        bx.setdefault("exports", []).append({"subject": subject, **entry})
    _save_boxes(bx)
    rel = os.path.relpath(path, HERE)
    print(f"exported {subject} -> {rel}  (audit -> out/boxes.json)", flush=True)
    return jsonify({"ok": True, "path": rel})


if __name__ == "__main__":
    print(f"pencil-vector server on http://localhost:{PORT}  (boxer: /   cleanup: /cleanup)", flush=True)
    app.run(port=PORT, debug=False)
