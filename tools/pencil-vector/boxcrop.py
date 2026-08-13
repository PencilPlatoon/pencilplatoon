"""Crop hand-drawn boxes out of a full paper scan and vectorize each into a cleanup-tool model.

Companion to scan_boxer.html: that tool writes a boxes.json --
  {"scan": "jf-battles-4.png", "boxes": [{"name": "gunner", "x0":.., "y0":.., "x1":.., "y1":..}, ...]}
in scan-pixel coordinates. This script crops each box from the scan, runs the pipeline on the crop,
and writes out/<name>_model.json (with box provenance + a scan thumbnail) plus records the boxes in
out/boxes.json. The pencil-vector server (npm run vector-server) then serves these models live to the
cleanup tool -- this is the headless CLI over the same code path as the server's /vectorize endpoint.

  python3 boxcrop.py boxes.json [--scan=PATH]

The scan is resolved from artwork-scans/<scan> unless --scan overrides it. The box IS the isolation:
the crop is fed straight to vectorize(), whose ink threshold pulls the pencil off the paper.
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image

from export_model import model_dict, _scan_b64
from vectorize import LATEST, vectorize

HERE = os.path.dirname(os.path.abspath(__file__))
SCANS = os.path.abspath(os.path.join(HERE, "..", "..", "artwork-scans"))
OUT = os.path.join(HERE, "out")


def resolve_scan(name: str, override: str | None) -> str:
    if override:
        return override
    p = os.path.join(SCANS, name)
    if not os.path.exists(p):
        raise SystemExit(f"scan not found: {p}  (pass --scan=PATH)")
    return p


BOXES = os.path.join(OUT, "boxes.json")


def load_boxes() -> dict:
    return json.load(open(BOXES)) if os.path.exists(BOXES) else {"boxes": [], "exports": []}


def save_boxes(d: dict) -> None:
    os.makedirs(OUT, exist_ok=True)
    json.dump(d, open(BOXES, "w"), indent=2)


def vectorize_box(img, scan_name: str, b: dict, bx: dict) -> dict:
    """Crop box b from img, vectorize, write out/<name>_model.json (box provenance + scan thumb), and
    record/refresh the box in bx (a load_boxes() dict). Returns a node/edge/blob summary. Shared by the
    boxcrop CLI and the server's /vectorize so both stay in lockstep."""
    crop = img.crop((b["x0"], b["y0"], b["x1"], b["y1"]))
    crop_path = os.path.join(OUT, f"{b['name']}_crop.png")
    crop.save(crop_path)
    d = model_dict(vectorize(crop_path, milestone=LATEST), b["name"], _scan_b64(crop))
    d["box"] = {"scan": scan_name, "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"]}
    json.dump(d, open(os.path.join(OUT, f"{b['name']}_model.json"), "w"))
    by = {r["name"]: r for r in bx["boxes"]}
    rec = by.get(b["name"], {"exports": []})
    rec.update({"name": b["name"], "scan": scan_name,
                "x0": b["x0"], "y0": b["y0"], "x1": b["x1"], "y1": b["y1"]})
    rec.setdefault("exports", [])
    by[b["name"]] = rec
    bx["boxes"] = list(by.values())
    return {"name": b["name"], "nodes": len(d["nodes"]), "edges": len(d["edges"]), "blobs": len(d["blobs"])}


def process(boxes_path: str, scan_override: str | None) -> None:
    data = json.load(open(boxes_path))
    scan_path = resolve_scan(data["scan"], scan_override)
    print(f"scan   {scan_path}", flush=True)
    img = Image.open(scan_path).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    bx = load_boxes()
    boxes = data["boxes"]
    n = len(boxes)
    print(f"boxes  {n} to vectorize", flush=True)
    for i, b in enumerate(boxes, 1):
        w, h = b["x1"] - b["x0"], b["y1"] - b["y0"]
        print(f"[{i}/{n}] {b['name']:16} crop {w}x{h} @ ({b['x0']},{b['y0']}) -- vectorizing...", flush=True)
        r = vectorize_box(img, data["scan"], b, bx)
        print(f"       done: nodes={r['nodes']} edges={r['edges']} blobs={r['blobs']}"
              f"  ->  out/{b['name']}_model.json", flush=True)
    save_boxes(bx)
    print("done. start the server (npm run vector-server) and open /cleanup", flush=True)


def main(argv):
    pos = [a for a in argv if not a.startswith("--")]
    scan_override = next((a.split("=", 1)[1] for a in argv if a.startswith("--scan=")), None)
    if not pos:
        print(__doc__)
        return 2
    process(pos[0], scan_override)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
