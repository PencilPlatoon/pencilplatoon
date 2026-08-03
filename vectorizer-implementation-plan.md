# Children's Drawing → SVG Vectorizer: Implementation Plan

Handoff document for Claude Code. Read the whole thing before writing code —
the ordering constraints between stages are the load-bearing part of this
design, and several stages will look over-engineered until you see what
depends on them.

The implementation of this plan is named **Pencil Vector** (`tools/pencil-vector/`).
It is built as a *parallel* tool alongside the older `tools/scan-to-svg/`, which
stays in place; the two are compared side by side on the fidelity study page.

---

## 1. Goal

Convert scanned children's drawings into SVG game assets.

- **Input:** scanned pencil/pen drawings. Stick figures holding weapons, plus
  hats, blood spurts, and assorted freeform additions.
- **Output:** individually extracted assets (primarily weapons) as SVG,
  no more complex than the game needs, with attachment points and
  metadata for runtime use.
- **Extraction target:** the weapons, *not* the figures holding them.
  The weapon is topologically fused to the figure at the grip.
- **Runtime roles vary per object:** static art, rigid transform,
  rigged/deformable, physics collider. The vectorizer does **not** know
  which role an asset will have.

### Non-goals

- Automatic recognition of figures, weapons, or any semantic category.
- Repairing stroke undershoot/overshoot. The source drawings do not have it.
  Do not build gap-closing or tail-trimming for that reason. (Spur pruning
  for *skeletonization artifacts* is different and is in scope — see §6.4.)
- A single canonical SVG per drawing. Output is a model plus derived exports.

---

## 2. Core principles

These govern every stage. When a local decision seems ambiguous, resolve it
by whichever of these applies.

1. **Connectivity is the primary invariant.** Raster connectivity is ground
   truth. It is computed once, frozen, and edited only by explicit human
   action in the cleanup tool — never by a heuristic.

2. **Annotations, not substitutions.** Below the topology tiers, every stage
   *records facts about* the model rather than rewriting it. "This edge is an
   arc, center c, radius r, residual σ" is an annotation. Replacing the edge's
   points with a circle is a substitution and is forbidden inside the
   vectorizer. Export decides which annotations to cash in.

3. **Stroke width is the unit of scale.** Every tolerance is expressed in
   multiples of `w`, the drawing's modal pen width. No pixel constants
   anywhere below Stage 0. This makes the pipeline invariant to scan DPI and
   to how fat a marker the child used.

4. **Weak automation appears only as hints.** Any heuristic that can be wrong
   is rendered as a ranked suggestion in the cleanup UI, never as a pipeline
   stage that can fail silently. The manual path must always work unaided.

5. **Edits are a replayable log, not a mutation.** The vectorizer will be
   re-run many times as tolerances are tuned. Human cleanup work must survive
   every re-run. This makes stable IDs load-bearing (§7).

6. **Size ≠ salience.** Detail allocation follows semantic salience, not
   feature extent. A 6px deliberate dot outranks a 400px blob's boundary
   wiggle. The one exception is at export, where on-screen size legitimately
   governs LOD (§11).

---

## 3. The invariant hierarchy

A strict lexicographic priority order. Any tier-*k* constraint beats every
tier-(*k*+1) constraint, with no weighting and no tunable tradeoff. This
exists to resolve conflicts mechanically: when snapping six strokes to
vertical would push a component across a face boundary, tier 2 wins and the
snap is abandoned.

| Tier | Name | Contents |
|------|------|----------|
| 0 | Ink determination | Binarization, speckle rejection. *Not an invariant — the one destructive step.* |
| 1 | Topology | Component membership (β₀); cycle structure (β₁); incidence structure, valence, junction type |
| 2 | Planar embedding | Non-crossing; containment/nesting (faces); rotational edge order at junctions |
| 3 | Arrangement | Ordinal relations among components in a shared face (above/below, left/right) |
| 4 | Primitive identity | Line / arc / closed circle / corner / free curve per edge; width class per region |
| 5 | Relational geometry | Parallelism, perpendicularity, angle equality, length equality, concentricity, symmetry |
| 6 | Absolute orientation | Axis-alignment against the inferred page frame |
| 7 | Relative magnitude | Size ratios, aspect ratios, relative stroke width |
| 8 | Absolute metric | Exact position, scale, angle, width — everything residual |

**Rules:**
- Higher tiers are decided globally and frozen before lower tiers are fit locally.
- Each tier is a **hard constraint** on the fitting of all lower ones, not a
  soft loss term. On violation: refit tighter and retry. Never accept and move on.
- Dynamic resolution (coarse for large features, fine for small) operates
  **only in tier 8**, where by construction nothing semantic remains to lose.

---

## 4. Pipeline overview

```
Stage 0   Ingest & ink determination          → binary mask, distance transform, w
Stage 1   Width-class segmentation            → stroke / blob / variable-width regions
Stage 2   Skeleton & boundary extraction      → medial axes, blob outlines
Stage 3   Graph construction                  → nodes, edges, blob nodes
Stage 4   Junction resolution                 → T vs X, continuity pairing
Stage 5   TOPOLOGY FREEZE + stable ID assignment
Stage 6   Planar embedding                    → faces, containment tree, rotational order
Stage 7   Cleanup tool (human in the loop)    → edit log
Stage 8   Geometry fitting                    → κ(s) and r(s) segmentation, primitives
Stage 9   Relational constraint inference     → per-asset, with global page frame
Stage 10  Export / build                      → role-specific SVG + LOD + colliders
```

Stages 0–6 are deterministic and re-runnable. Stage 7 produces a durable
artifact (the edit log) that stages 8–10 consume. Re-running 0–6 with new
tolerances must not invalidate Stage 7's output.

---

## 5. Stage 0 — Ingest and ink determination

The only place a component may be deleted, and only on **imaging** grounds
(contrast, paper grain, media spatter) — never semantic ones.

- Grayscale, then adaptive/local threshold (Sauvola or Niblack; pencil on
  white paper has uneven illumination and global Otsu underperforms).
- Speckle rejection by connected-component area against paper-grain scale.
  **Do not** use a fixed pixel threshold like Potrace's `turdsize` — a
  deliberate 6px dot is exactly what that kills. Gate on ink density and
  contrast, and set the bar as low as the scan noise permits.
- Compute the Euclidean distance transform of the ink mask
  (`scipy.ndimage.distance_transform_edt`).
- **Compute `w`, the modal pen width:** take the mode of the distance
  transform values restricted to medial-axis pixels, doubled. Everything
  downstream is expressed in units of `w`. Log it; it is the single most
  important derived constant in the pipeline.

**Acceptance:** on a test scan, `w` should land within ~15% of a
hand-measured stroke width, and no hand-labelled deliberate small mark
should be removed by speckle rejection.

---

## 6. Stages 1–4 — Building the graph

### 6.1 Stage 1: width-class segmentation

Skeletonization is *wrong* for filled regions — the medial axis of a filled
circle is a point. Classify before extracting.

Per skeleton branch, using `r(s)` = distance transform along the medial axis:

1. **Range gate first (cheap exit).** If `max(r)/min(r) < 1.5` → **stroke**.
   Most branches exit here; skip all further analysis.
2. **Aspect ratio.** `branch_length / (2·max(r))`. High → stroke even if wide
   (rescues deliberately thick outline strokes).
3. **Absolute width vs `w`.** Regions where `r` runs well above `w` are fill.
   This holds even when a blob was scribbled with a thin pen, because
   overlapping passes merge into a wide region.
4. **Profile shape.** TV/L1-denoise `r(s)` (see §9 — same machinery as
   curvature). Flat pieces → stroke. Sustained monotone ramps → taper.
   Oscillating around a mean → fluctuating-width stroke, still class 1.

**Three output classes:**

| Class | Condition | Representation |
|-------|-----------|----------------|
| `stroke` | `r ≈ w`, low variance | centerline + constant `stroke-width` |
| `blob` | `r ≫ w`, low aspect ratio | boundary polygon + fill |
| `variable` | `r` ramps monotonically | offset curves both sides → closed filled outline |

Class `variable` exists specifically so tapers don't need a cut point. A
taper is continuous; the child drew one thing; any "where the blob ends"
boundary is an artifact of the representation. Do not look for one.

**Hysteresis is mandatory.** Enter the wide state at `r > 2.5w`, leave it
only below `r < 1.5w`. A single threshold produces state flapping along any
noisy taper, and every flap becomes a spurious boundary.

### 6.2 Stage 2: skeleton and boundary extraction

- `stroke` and `variable` regions: medial axis. Prefer distance-transform
  ridge extraction over iterative thinning — fewer manufactured spurs,
  at the cost of worse junction placement (which Stage 4 fixes anyway).
- `blob` regions: trace the outer boundary (and any interior holes).
  Do not skeletonize.

### 6.3 Stage 3: graph construction

Nodes and edges, with valence-2 nodes collapsed so an edge runs
junction-to-junction.

- Node kinds: `endpoint` (valence 1), `junction` (valence ≥ 3), `blob`.
- **Blobs are first-class nodes with N parameterized boundary attachment
  points** — not skeleton branches. This is essential: a blob is a
  connectivity hub, and continuity pairing (§6.4) has no tangent to work
  with inside a filled region. Without per-attachment granularity, a blood
  spurt touching both blade and arm merges the sword into the figure and
  flood-select takes everything.
- Store per-edge: polyline points, `r(s)` samples, width class, endpoints.

### 6.4 Stage 4: junction resolution

At each junction, pair edges by tangent continuity to determine whether it's
a T (one stroke terminates on another) or an X (two strokes cross). Reference
implementation to follow: Noris et al., *Topology-Driven Vectorization of
Clean Line Drawings* (TOG 2013) — the "reverse drawing" procedure.

This is not cosmetic. It has two direct consumers:

- **Flood-select traverses continuity, not adjacency** (§10). At an X where
  an arm crosses a sword shaft, raw adjacency leaks the flood down the arm
  and takes the whole figure. Continuity pairing stops it dead. This is what
  reduces most drawings from "cut then flood" to just "flood."
- **Whether a grip cut is lossless.** T → delete the arm edge, shaft intact.
  X → cutting leaves a wound in the shaft that must be healed.

Spend extra effort on junctions adjacent to grip candidates; elsewhere a
cheaper heuristic is fine.

**Spur pruning:** prune branches shorter than ~1–2× local stroke width.
Justification is that thinning manufactures twigs from boundary noise on wide
strokes — *not* that the child overshot. Keep the distinction in comments;
it governs how aggressive the threshold should be.

---

## 7. Stage 5 — Topology freeze and stable IDs

After this point nothing in the automatic pipeline may alter the graph.

**Stable IDs are load-bearing, not a nicety.** Human cleanup (Stage 7) is
expensive and downstream; the vectorizer will be re-run many times while
tuning tolerances. If IDs come from traversal order or iteration index, every
re-run silently invalidates every drawing already cleaned.

Derive IDs from topologically re-derivable properties: canonical ordering by
embedding, position in the graph, spatial hash of the node's neighbourhood.
Requirement: **a re-run with slightly different tolerances must map onto the
same identities for the parts of the graph that didn't change.**

Write an ID-stability test early. Perturb the binarization threshold by a few
percent, re-run, and assert that ≥95% of edge IDs are preserved.

---

## 8. Stage 6 — Planar embedding

- **Faces:** the regions the edges carve the plane into. Hollow shapes cost
  nothing extra here — a head outline's interior is already a face, so
  filling it for a game asset needs no re-tracing and stays in sync with the
  outline automatically.
- **Containment tree:** which face each component occupies. This gives object
  grouping for free — components inside the head's face belong to the head —
  and it gives **z-order** (a pupil blob inside an eye outline must paint
  after it). Do not derive z-order from traversal order.
- **Rotational order:** cyclic ordering of edges around each junction.

**Embedding validation (used in Stage 8):** after any geometric fit, assert
(a) no curve-curve intersection exists that wasn't in the input, and (b)
every component is still in the face it started in. Preserving connectivity
alone is not enough: a regularized ellipse can bulge past a wobble and leave
an eye outside the head with the graph perfectly intact.

---

## 9. Stage 8 — Geometry fitting

Two channels along arc length, fit **jointly**, through the same machinery:

- `κ(s)` — curvature
- `r(s)` — half-width

**Work in the turning function, not in x/y.** A wobbly intended-straight line
is a tangent angle that is noisy with near-zero drift; an intended circle is
roughly constant curvature with noise; a deliberate corner is a step
discontinuity. Smoothing in x/y destroys corners along with wobble.
Denoising `κ(s)` with an **L1/total-variation prior** kills wobble and keeps
steps. The same prior on `r(s)` gives the width classification in §6.1.

The discriminator throughout: **noise oscillates around a mean; intent is a
sustained excursion.**

Segmentation into primitives — line, arc, clothoid, corner — as a shortest
path over an overcomplete candidate set (Baran et al., *Sketching Clothoid
Splines Using Shortest Paths*, 2010; McCrae & Singh, *Sketching Piecewise
Clothoid Curves*, 2009). Select by description length so a distorted circle
resolves to an arc rather than 40 Bézier segments.

**Output is annotations.** Record `{kind: arc, center, radius, residual}` on
the edge alongside its sampled geometry. Do not replace the points.

---

## 10. Stage 7 — Cleanup tool

A separate interactive app. This is where extraction actually happens; the
automatic pipeline exists to make this step cheap, not to replace it.

Automatic stick-figure detection is explicitly **out of scope** — the figure
class is open-ended in practice (hats, spurts, variant limb counts) and
template matching has to enumerate what a figure can look like. The human
identifies a sword in well under a second. Put perception on the human and
graph traversal on the machine.

### Required operations

| Op | Behaviour |
|----|-----------|
| Highlight | Hover/click a segment. **Unit = collapsed graph edge** (junction-to-junction), not fitted primitive pieces. An arm is one click, not four. |
| Select stroke | Modifier-click selects the whole continuity chain through junctions as one unit. |
| Delete | Mask the segment. Never mutate the model. |
| Flood-select | Select everything transitively connected to a segment — **traversing continuity pairings, not raw adjacency**. |
| Exclude | After flooding, click a branch to remove it from the selection, then reflood. Needed for a blood spurt attached to the *blade*. |
| Free cut | Cut anywhere along a medial axis, not only at classified boundaries. A misclassified taper then costs one click instead of blocking the workflow. |
| Export selection | Emit the selection as a named asset. |

### Hints (optional, must degrade gracefully)

Pre-highlight articulation points (Tarjan, linear time) whose smaller side
looks limb-like. Caveat: a stick figure is nearly a tree, so almost every
vertex is an articulation point — these are only useful as ranked
suggestions. Two-handed grips are 2-cuts, not cut vertices.

Wrong hints cost nothing when the human is already clicking. Never let a hint
gate an operation.

### Edit log format

A list of operations keyed on stable edge/node IDs, replayable against a
freshly re-run Stage 5 output. Store per drawing, version it, keep it in the
repo alongside the source scans.

---

## 11. Stage 9–10 — Constraints, export, and build

### Relational inference scope

Run tier-5 constraints **per extracted asset**, not per drawing. You do not
want a blade snapped parallel to a leg or a pommel made concentric with a
head.

But that weakens aggregate evidence, since one weapon has few strokes. So:
infer the **page-up axis and the child's systematic angular bias globally**
across the whole drawing, then apply the actual constraints within each asset
using those global parameters.

### Export is role-specific; the model is not

The same annotated edge exports three different ways:

- **Static art** → cash in the arc annotation: one `<circle>`. Merge adjacent
  same-fill faces. Cheapest possible.
- **Rigged/deformable** → *cannot* use `<circle>`; you can't bend it. Needs
  *more* nodes than static, evenly distributed along arc length so
  deformation doesn't bunch.
- **Collision** → derive from tiers 1–2 only. Per-component convex hulls or
  hard-decimated face polygons. Never reuse render geometry; physics engines
  choke on 200-vertex concave shapes and no player perceives the difference.

Path merging is a **build-step optimization gated on role**, never done in
the vectorizer. It's a win for backgrounds and fatal for anything that moves
independently.

### Complexity wins, in rough order of payoff

1. **Centerline + `stroke-width`, not outlined fills.** A stroked line is 2
   points; the same line as a filled outline is 8+ with joins and caps.
   Biggest single reduction available, and it keeps the topology graph
   literally visible in the SVG (one `<path>` per graph edge).
2. **Real primitive elements** — `<circle>`, `<ellipse>`, `<line>`, `A` arc
   commands over Bézier approximations. Direct payoff from tier 4.
3. **Aggressive blob-boundary decimation.** Nobody perceives the exact
   outline of a scribble; often 10× fewer nodes than a stroke tolerates.
   This is where the savings are, not in the strokes.
4. **Coordinate rounding.** One decimal place. Free 30%+.

### LOD

Do not produce a single SVG. Keep one topological model and derive several
geometric levels of detail sharing the frozen tier 1–3 structure. LOD choice
is a rendering decision, not a vectorization one — and it is the one place
where on-screen size legitimately overrides "size ≠ salience."

### Asset metadata

Every exported asset carries:

- **Anchor transform** = the cut vertex. The grip is where the game attaches
  the item to a hand, so segmentation point and attachment point are the same
  thing. Free.
- **Canonical orientation** = shaft direction at the anchor.
- **Pivot candidates** = junction vertices from the tier-1 incidence graph.
- **Fill semantics** = hollow vs. filled per region. A child filling
  something in is a deliberate act (solid, dark, bloody, hairy). Never let
  normalization erase it.

### The wobble/charm tradeoff

Full tier 5/6 snapping produces something semantically faithful and
aesthetically dead — the wobble is much of what makes a drawing read as a
child's. Fit the constraints, then **reapply a tunable fraction of the
measured residual as a style layer.** Compact representation and the hand,
independently controllable.

---

## 12. Suggested build order

Get end-to-end early; depth later.

1. **M1 — Skeleton to SVG.** Stage 0 + naive thinning + graph + dump every
   edge as a polyline `<path>`. Ugly but end-to-end. Verify `w` is sane.
2. **M2 — Width classes.** Stage 1 with the range gate and hysteresis.
   Blobs render as filled boundaries, strokes as centerlines.
3. **M3 — Stable IDs + freeze.** Write the ID-stability test before the
   cleanup tool exists. Cheap now, near-impossible to retrofit.
4. **M4 — Cleanup tool, manual only.** Highlight, delete, flood on raw
   adjacency, export. No hints, no continuity. Extract one weapon by hand
   end-to-end and put it in the game. **This is the real milestone.**
5. **M5 — Junction resolution + continuity flood.** Measure the drop in
   clicks per asset against M4. This is the highest-leverage improvement.
6. **M6 — Embedding + validation.** Faces, containment, z-order, the
   post-fit assertion.
7. **M7 — Geometry fitting.** TV denoising, primitive segmentation,
   annotations.
8. **M8 — Constraints, LOD, colliders, export roles.**

Measure **clicks per extracted asset** from M4 onward. It's the only metric
that tracks whether the automatic work is paying for itself.

### Milestone artifacts are retained and comparable

Progress is judged visually, milestone against milestone, so the renders must
accumulate rather than replace each other:

- **Retain every milestone's output.** Each milestone writes its own render per
  subject, `out/<subject>_m<N>.svg`, and a later milestone never overwrites an
  earlier one. Keep each milestone's code path runnable so its render can be
  regenerated — do not delete or in-place-rewrite M(N−1)'s producer when adding
  M(N). (M1's `out/*_m1.svg` must still exist and rebuild once M2 lands.)
- **Per-cell milestone tabs on the study page.** The comparison page
  (`tools/scan-to-svg`) renders the Pencil Vector column as a tab strip — one
  tab per milestone (M1, M2, …) over each subject's cell — showing one render at
  a time so you can flip through the approach's evolution. The tabs are
  data-driven off the retained `_m<N>.svg` files, so a new milestone's render
  adds its own tab with no page changes. This is a build-step / study-page
  concern only; it imposes nothing on the pipeline stages above.

---

## 13. Suggested stack

- Python. `numpy`, `scipy.ndimage` (distance transform), `scikit-image`
  (`skeletonize`, `medial_axis`, `label`), `networkx` (articulation points,
  biconnected components, traversal), `shapely` (polygon ops, intersection
  validation), `svgelements` or `svgwrite` for output.
- Cleanup tool: browser-based is easiest — render the model as SVG, wire
  click handlers to edge IDs, POST the edit log. Avoids building a canvas
  picking system.
- Model serialization: JSON, one file per drawing, with the edit log separate.

---

## 14. Open questions

- **Ink bridging.** Two strokes the child drew as separate that touch anyway
  because the medium is wide. The drawing has no error but the raster has a
  false edge, and it's the one case where trusting raster connectivity gives
  the wrong graph. Check whether it occurs in the corpus before building
  anything for it.
- **Two-handed grips** are 2-cuts. Confirm whether they appear often enough
  to warrant special handling in the hint system.
- **X-junction wound healing** at grips — how to close the shaft when the
  hand wrapped around it. May be acceptable to leave to the human.
- **Tier 3 (arrangement)** is specified but has no identified consumer yet.
  Skip until something needs it.
