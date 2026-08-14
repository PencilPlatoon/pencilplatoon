"""Serialize the frozen graph to JSON -- the model the cleanup tool loads (§13).

One file per drawing. Edges carry their endpoint node ids so the tool can
flood-select over adjacency; every element carries its stable `sid` so the edit
log the tool emits stays valid when the pipeline is re-run (§7, §10).
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys

from PIL import Image

from fit import reconstruct
from model import BLOB
from vectorize import LATEST, vectorize


def _pts(a):
    return [[round(float(x), 1), round(float(y), 1)] for x, y in a]


def _scan_b64(img, maxdim: int = 700) -> str:
    """A downscaled JPEG of the source scan, base64 -- the cleanup tool shows it beside the vector so
    you can compare your cleanup against the original pencil drawing."""
    im = img.convert("RGB")
    w, h = im.size
    s = min(1.0, maxdim / max(w, h))
    if s < 1.0:
        im = im.resize((max(1, round(w * s)), max(1, round(h * s))))
    buf = io.BytesIO(); im.save(buf, format="JPEG", quality=82)
    return base64.b64encode(buf.getvalue()).decode()


def _ideal(ann, raw):
    """The idealized geometry the pipeline actually renders (reconstruct at alpha=0), so the cleanup
    tool shows the same smooth output as the asset rather than the raw trace the fit annotates. Falls
    back to the raw points if the element was never fitted (mirrors how holes are already exported)."""
    f = ann.get("fit")
    return _pts(reconstruct(f, 0.0)) if f is not None else _pts(raw)


def model_dict(g, subject: str, scan_b64: str | None = None) -> dict:
    nodes, blobs = [], []
    for nd in g.nodes.values():
        if nd.kind == BLOB:
            blobs.append({"id": nd.id, "sid": nd.sid,
                          "pos": [round(nd.pos[0], 1), round(nd.pos[1], 1)],
                          "boundary": _ideal(nd.ann, nd.boundary),
                          "holes": [_pts(h) for h in nd.ann.get("holes", [])],  # §6.2
                          "edges": nd.ann.get("edges", []),     # incident strokes (§6.3)
                          "z": nd.ann.get("z", 0)})             # paint order (§8 containment)
        else:
            nodes.append({"id": nd.id, "sid": nd.sid, "kind": nd.kind,
                          "pos": [round(nd.pos[0], 1), round(nd.pos[1], 1)]})
    edges = [{"id": e.id, "sid": e.sid, "a": e.a, "b": e.b, "pts": _ideal(e.ann, e.pts),
              "blobs": e.ann.get("blobs", []),
              "cont": e.ann.get("cont", {})}   # node id -> continuity-partner sid (§6.4)
             for e in g.edges.values()]
    return {"subject": subject, "w": round(g.w, 2), "size": list(g.size),
            "nodes": nodes, "edges": edges, "blobs": blobs, "scan": scan_b64}


def export(in_path: str, subject: str, out_path: str) -> dict:
    d = model_dict(vectorize(in_path, milestone=LATEST), subject, _scan_b64(Image.open(in_path)))
    with open(out_path, "w") as f:
        json.dump(d, f)
    return d


def main(argv):
    subjects = argv or ["flag", "cannon", "soldier", "mg", "dying"]
    os.makedirs("out", exist_ok=True)
    for s in subjects:
        d = export(f"subjects/{s}_iso.png", s, f"out/{s}_model.json")
        print("%-8s nodes=%d edges=%d blobs=%d -> out/%s_model.json"
              % (s, len(d["nodes"]), len(d["edges"]), len(d["blobs"]), s))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
