"""Serialize the frozen graph to JSON -- the model the cleanup tool loads (§13).

One file per drawing. Edges carry their endpoint node ids so the tool can
flood-select over adjacency; every element carries its stable `sid` so the edit
log the tool emits stays valid when the pipeline is re-run (§7, §10).
"""
from __future__ import annotations

import json
import os
import sys

from model import BLOB
from vectorize import vectorize


def _pts(a):
    return [[round(float(x), 1), round(float(y), 1)] for x, y in a]


def model_dict(g, subject: str) -> dict:
    nodes, blobs = [], []
    for nd in g.nodes.values():
        if nd.kind == BLOB:
            blobs.append({"id": nd.id, "sid": nd.sid,
                          "pos": [round(nd.pos[0], 1), round(nd.pos[1], 1)],
                          "boundary": _pts(nd.boundary),
                          "edges": nd.ann.get("edges", [])})   # incident strokes (§6.3)
        else:
            nodes.append({"id": nd.id, "sid": nd.sid, "kind": nd.kind,
                          "pos": [round(nd.pos[0], 1), round(nd.pos[1], 1)]})
    edges = [{"id": e.id, "sid": e.sid, "a": e.a, "b": e.b, "pts": _pts(e.pts),
              "blobs": e.ann.get("blobs", [])}
             for e in g.edges.values()]
    return {"subject": subject, "w": round(g.w, 2), "size": list(g.size),
            "nodes": nodes, "edges": edges, "blobs": blobs}


def export(in_path: str, subject: str, out_path: str) -> dict:
    d = model_dict(vectorize(in_path, milestone=3), subject)
    with open(out_path, "w") as f:
        json.dump(d, f)
    return d


def main(argv):
    subjects = argv or ["flag", "cannon", "soldier", "mg", "dying"]
    os.makedirs("out", exist_ok=True)
    for s in subjects:
        d = export(f"../scan-to-svg/out/{s}_iso.png", s, f"out/{s}_model.json")
        print("%-8s nodes=%d edges=%d blobs=%d -> out/%s_model.json"
              % (s, len(d["nodes"]), len(d["edges"]), len(d["blobs"]), s))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
