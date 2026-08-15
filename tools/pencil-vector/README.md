# Pencil Vector

A **from-scratch** scan→SVG vectorizer, built to the architecture in
[`../../vectorizer-implementation-plan.md`](../../vectorizer-implementation-plan.md).

It is **model-based and annotation-first**: connectivity is frozen ground truth,
every geometric fit is recorded *about* an edge rather than replacing it, and
export decides which annotations to emit as geometry. See the plan's core
principles (§2) and invariant hierarchy (§3).

The 5 reference subjects it iterates on live in `subjects/` (`*_iso.png`).

## Pipeline

The pipeline runs in ordered **stages** (the `Stage` enum in `vectorize.py`). `vectorize(path,
stage=…)` stops at any of them, so the graph can be inspected at each point; each stage builds on the
ones before it. Following the plan §12 — end-to-end early, depth later:

| stage | what it does |
|-------|--------------|
| `SKELETONIZE` | ink + `w` → naive per-colour skeleton → graph → one `<path>` per edge |
| `IDENTIFY_ELEMENTS` | width classes (hysteresis): filled regions → blobs, line-work → strokes; boundaries + holes traced |
| `FREEZE_TOPOLOGY` | geometry-derived stable IDs + topology freeze + blob incidence |
| `JUNCTIONIZE` | junction resolution (continuity pairing) + continuity flood |
| `PLANAR_EMBED` | planar embedding — interior holes, rotational order, containment/z, validation |
| `FIT_IDEAL_GEOMETRY` | geometry fitting (TV-denoised κ(s)/r(s), primitive segmentation) |

`svgdump.dump(…, primitives=True)` then emits the fitted geometry as real arc/line SVG commands — a
render choice, not a stage. Two things sit outside the pipeline: the **asset tool** (interactive
cleanup, below), and future export work (constraints, LOD, colliders, role-specific export).

The CLI writes `out/<subject>_<stage>.svg` — a new stage never overwrites another, and each stage's
code path stays runnable. The `pipeline_stages` study page (below) turns those into a per-cell tab
strip so you can flip through the approach's progress on each subject.

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python vectorize.py subjects/cannon_iso.png       # full pipeline; add --stage=skeletonize to stop early
```

Prints the derived pen width `w` (the unit every downstream tolerance is
measured in) and the node/edge counts, and writes an SVG where each collapsed
graph edge is one centerline `<path>` at stroke-width `w`.

## Server (box selector + asset tool)

One Flask process serves the browser tools and owns the pipeline + files. From
the **repo root**:

```bash
npm run python-tool-setup                 # once: pip install -r requirements.txt
npm run vector-server                     # start the server
```

Serves `http://localhost:8889` — the **box selector** at `/` and the **asset
tool** at `/asset`. Saving an asset writes a vector `out/svg/<asset>.svg` (the
game asset); `out/<name>_crop.png` and `out/<name>_model.json` are display/data
intermediates.

## Modules

| file | role |
|------|------|
| `model.py` | data model — `Node` / `Edge` / `Graph`, annotations layer |
| `ink.py` | ingest — Sauvola threshold, speckle rejection, distance transform, `w` |
| `widthclass.py` | element identification — solid detection (thick-core seed + density grow) → blobs |
| `graph.py` | skeleton → node/edge graph, spur pruning (§6.4), blob incidence, continuity |
| `stableid.py` | freeze topology — geometry-derived stable IDs + topology freeze |
| `embedding.py` | planar embedding — rotational order, containment/z, post-fit crossing check |
| `svgdump.py` | export — filled blobs + one `<path>` per stroke edge (carries `data-sid`) |
| `vectorize.py` | end-to-end driver + the `Stage` enum (`--stage=NAME`, default `fit_ideal_geometry`) |
| `export_model.py` | serialize the frozen graph to `out/<subject>_model.json` (§13) |
| `asset_template.html` | the asset tool (served live by `server.py` at `/asset`) |
| `pipeline_stages.py` | **Pipeline Stages** study page → `pipeline_stages.html`, published as artifact `bab2a5a5` (per subject: scan next to a stage tab-strip — skeleton · grow · absorb · fit · arcs; selecting a stage syncs every cell) |

## Asset tool

`./build.sh` generates a standalone **`cleanup.html`** (all subjects' models inlined —
no server needed). Open it in a browser to extract an asset by hand:

- **hover** highlights a segment (unit = one junction-to-junction edge);
- **click** toggles one segment; **shift-click** fills the connected component, or
  anti-fills it if the clicked segment is already selected;
- **ctrl/⌘-click** selects one continuity *stroke* (through junctions, §10);
- flood is **continuity-aware** (junctionize, §6.4): it follows a stroke through a junction but does
  not leak across a crossing (an arm crossing a sword shaft doesn't drag in the
  figure), and it stops at deleted (masked) segments;
- **Delete → mask** hides the selection (recorded, never mutating the model);
- **Export asset…** emits the selection as a named SVG;
- every op is appended to an **edit log** keyed on the stable `sid`s, downloadable as
  JSON so it replays against a re-run of the pipeline (§10). Hints and free-cut are
  later work.

Freeze-topology note: IDs come from quantized geometry (a node's grid cell, an edge's midpoint
cell), not traversal order, so re-running with tweaked tolerances keeps the same
identities. The `test_freeze_topology.py` ID-stability test perturbs the threshold a few
percent and asserts ≥95% of edge IDs survive on clean line-art, and that on
blob-heavy inputs the IDs never churn beyond genuine geometry change.

Spur pruning is decided by **connectivity**, the primary invariant (§2.1), not by
geometry. A short leaf is a thinning twig only if its free end connects to
*nothing*. It is kept if it connects to something — either it **attaches to a
blob** (extending the end lands inside the blob, not in an empty concave notch —
the edge→blob incidence blobs need as first-class nodes, §6.3), or it runs
**collinear** with a junction partner (a continuation of that stroke, fragmented
by the skeleton; full merge is junctionize). Length is only the twig-size ceiling.

A region is **solid** where ink is locally dense — seeded on a genuine thick core
(a thin-line junction can't seed) and grown through ink that is either still thick
or *locally dense*, so crosshatch/scribble reads as solid even though its strokes
are thin. Enclosed white gaps (drawing noise) are filled. This keeps solids solid
instead of leaving concave gaps, pinches, and stray medial-axis strokes.

Element-identification notes: the `variable`/taper class (splitting an elongated fill into a
monotone ramp) is deferred; every fill is a `blob` for now.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

`test_skeletonize.py` runs the pipeline on the checked-in isolated subjects and asserts
`w` is sane and the graph is well-formed (skips if the isos aren't present).
