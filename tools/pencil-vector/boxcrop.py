"""Crop hand-drawn boxes out of a full paper scan and vectorize each into a cleanup-tool model.

Companion to scan_boxer.html: that tool writes a boxes.json --
  {"scan": "jf-battles-4.png", "boxes": [{"name": "gunner", "x0":.., "y0":.., "x1":.., "y1":..}, ...]}
in scan-pixel coordinates. This script crops each box from the scan, runs the pipeline on the crop,
and writes out/<name>_model.json (the same shape export_model emits), then rebuilds cleanup.html so
the boxed subjects show up there. Clean them and Export asset from the cleanup tool.

  python3 boxcrop.py boxes.json [--scan=PATH] [--no-build]

The scan is resolved from artwork-scans/<scan> unless --scan overrides it. The box IS the isolation:
the crop is fed straight to vectorize(), whose ink threshold pulls the pencil off the paper.
"""
from __future__ import annotations

import json
import os
import sys

from PIL import Image

from export_model import model_dict
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


def process(boxes_path: str, scan_override: str | None, do_build: bool) -> None:
    data = json.load(open(boxes_path))
    scan_path = resolve_scan(data["scan"], scan_override)
    print(f"scan   {scan_path}", flush=True)
    img = Image.open(scan_path).convert("RGB")
    os.makedirs(OUT, exist_ok=True)
    boxes = data["boxes"]
    n = len(boxes)
    print(f"boxes  {n} to vectorize", flush=True)
    for i, b in enumerate(boxes, 1):
        w, h = b["x1"] - b["x0"], b["y1"] - b["y0"]
        print(f"[{i}/{n}] {b['name']:16} crop {w}x{h} @ ({b['x0']},{b['y0']}) -- vectorizing...", flush=True)
        crop = img.crop((b["x0"], b["y0"], b["x1"], b["y1"]))
        crop_path = os.path.join(OUT, f"{b['name']}_crop.png")
        crop.save(crop_path)
        d = model_dict(vectorize(crop_path, milestone=LATEST), b["name"])
        json.dump(d, open(os.path.join(OUT, f"{b['name']}_model.json"), "w"))
        print(f"       done: nodes={len(d['nodes'])} edges={len(d['edges'])} blobs={len(d['blobs'])}"
              f"  ->  out/{b['name']}_model.json", flush=True)
    if do_build:
        print("build  regenerating cleanup.html...", flush=True)
        import build_cleanup
        build_cleanup.main()
    print("done.", flush=True)


def main(argv):
    pos = [a for a in argv if not a.startswith("--")]
    scan_override = next((a.split("=", 1)[1] for a in argv if a.startswith("--scan=")), None)
    if not pos:
        print(__doc__)
        return 2
    process(pos[0], scan_override, "--no-build" not in argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
