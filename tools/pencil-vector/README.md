# Pencil Vector

A **parallel, from-scratch** implementation of the scan→SVG vectorizer, built
to the architecture in [`../../vectorizer-implementation-plan.md`](../../vectorizer-implementation-plan.md).
It exists alongside the older `../scan-to-svg/` tool, which stays untouched.

The two differ fundamentally. `scan-to-svg` *substitutes* geometry as it goes
(a run of points becomes a circle). This one is **model-based and
annotation-first**: connectivity is frozen ground truth, every geometric fit is
recorded *about* an edge rather than replacing it, and export decides which
annotations to cash in. See the plan's core principles (§2) and invariant
hierarchy (§3).

## Build order

Each milestone writes its own **retained** render, `out/<subject>_m<N>.svg` — a new
milestone never overwrites a prior one, and each milestone's code path stays
runnable. The comparison page (`../scan-to-svg`) turns those into a per-cell tab
strip (M1, M2, …) so you can flip through the approach's progress on each subject.

Milestones follow the plan §12 — end-to-end early, depth later:

| # | milestone | status |
|---|-----------|--------|
| **M1** | Stage 0 (ink + `w`) → naive skeleton → graph → one `<path>` per edge | ✅ done |
| **M2** | Width classes (hysteresis): filled regions → blobs, line-work → strokes | ✅ done |
| **M3** | Spur prune + stable IDs (geometry-derived) + topology freeze | ✅ done |
| M4 | Cleanup tool (manual highlight/delete/flood/export) | — |
| M5 | Junction resolution + continuity flood | — |
| M6 | Planar embedding + post-fit validation | — |
| M7 | Geometry fitting (TV-denoised κ(s)/r(s), primitive segmentation) | — |
| M8 | Constraints, LOD, colliders, role-specific export | — |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python vectorize.py ../scan-to-svg/out/cannon_iso.png out/cannon_m1.svg
```

Prints the derived pen width `w` (the unit every downstream tolerance is
measured in) and the node/edge counts, and writes an SVG where each collapsed
graph edge is one centerline `<path>` at stroke-width `w`.

## Modules

| file | role |
|------|------|
| `model.py` | data model — `Node` / `Edge` / `Graph`, annotations layer |
| `ink.py` | Stage 0 — Sauvola threshold, speckle rejection, distance transform, `w` |
| `widthclass.py` | Stage 1 (M2) — hysteresis width classing: filled regions → blobs |
| `graph.py` | skeleton → node/edge graph + spur pruning (§6.4) |
| `stableid.py` | Stage 5 (M3) — geometry-derived stable IDs + topology freeze |
| `svgdump.py` | export — filled blobs + one `<path>` per stroke edge (carries `data-sid`) |
| `vectorize.py` | end-to-end driver (`--milestone=N`, default latest) |

M3 note: IDs come from quantized geometry (a node's grid cell, an edge's midpoint
cell), not traversal order, so re-running with tweaked tolerances keeps the same
identities. The `test_m3.py` ID-stability test perturbs the threshold a few
percent and asserts ≥95% of edge IDs survive on clean line-art, and that on
blob-heavy inputs the IDs never churn beyond genuine geometry change.

Spur pruning keeps a short leaf that runs **collinear** with a junction partner
(it's a fragmented continuation of that stroke, not a twig) and only drops leaves
that stick out at an angle — merging the continuation into one extended segment is
junction resolution (M5).

M2 notes: **colour** isn't handled yet, so a coloured solid (the flag field, blood
spray) fills flat black rather than its hue — a later concern (the plan keeps colour
separate). The `variable`/taper class (splitting an elongated fill into a monotone
ramp) is also deferred; every fill is a `blob` for now.

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

`test_m1.py` runs the pipeline on the checked-in isolated subjects and asserts
`w` is sane and the graph is well-formed (skips if the isos aren't present).
