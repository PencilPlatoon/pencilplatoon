"""Assemble the self-contained cleanup tool: inline every model into the template.

Reads out/*_model.json (written by export_model.py) and the app template, then
writes a single standalone cleanup.html the user can open directly -- no server,
no fetch (works even under a strict CSP).
"""
import glob
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    models = {}
    for p in sorted(glob.glob(os.path.join(HERE, "out", "*_model.json"))):
        m = json.load(open(p))
        models[m["subject"]] = m
    order = ["cannon", "soldier", "mg", "dying", "flag"]
    models = {k: models[k] for k in order if k in models} | \
             {k: v for k, v in models.items() if k not in order}

    tpl = open(os.path.join(HERE, "cleanup_template.html")).read()
    html = tpl.replace("__MODELS__", json.dumps(models, separators=(",", ":")))
    out = os.path.join(HERE, "cleanup.html")
    open(out, "w").write(html)
    print("wrote cleanup.html  %d subjects  %.0f KB"
          % (len(models), os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
