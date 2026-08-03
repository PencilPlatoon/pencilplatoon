# scan-to-svg

Vectorizes hand-drawn battle-sketchbook scans into clean, tiny SVGs for the game.
Given a scanned page, it isolates each subject (flag, cannon, soldier, MG, dying
soldier), skeletonizes the ink at a uniform pen width, and snaps the line-work to
straight segments, circular arcs, and full circles — keeping solid regions solid.

The output is a comparison page (`comparison3.html`) that shows each scan next to
its generated SVG, with a per-component hover-to-identify + numbered overlay. This
is the smoke test for the general vectorization principles; the eventual home is
the "Auto-detect + isolate" button in `level-image-saver.html`.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Build

```bash
./build.sh
```

Regenerates everything into `out/` and produces `comparison3.html`. The source
scan is `../../artwork-scans/level-1-pg-4.png`.

Individual steps (all operate on the `out/` directory):

| step | script | output |
|------|--------|--------|
| isolate subjects from the scan | `iso.py` | `out/*_iso.png`, `out/*_crop.png` |
| vectorize one or more subjects | `skel_svg.py flag cannon ...` | `out/*_C.svg` |
| assemble the page body | `build3.py` | `body3.html` |
| escape non-ASCII for publishing | `entities.py` | `comparison3.html` (in place) |

## Tests

```bash
pip install -r requirements-dev.txt
pytest
```

- `test_skel_svg.py` — fast unit tests for the primitive-fitting geometry (needs no
  scan): line/arc/corner classification, the corner test's own-size tolerance, the
  `ARC_FIT` tight-fit gate, circle fitting, and the skeleton graph helpers.
- `test_pipeline.py` — end-to-end regression over the real scan (skips if the scan
  image is absent): asserts the cannon has no smoothing arcs and its gunsight
  trapezoid stays straight, and that every subject produces components.

## How the vectorizer works (`skel_svg.py`)

Two guiding principles run through the whole pipeline:

1. **Salience is not size**, and tolerances are **relative to each feature's own
   size** — a big squiggle straightens while a tiny sharp shape is kept.
2. **Preserve the scan's topology**, in this priority order:
   **connectivity > shape (orientation + straightness) > size > position.** Things
   drawn touching stay touching; a segment keeps its angle before it keeps its
   length; a circle resizes before the things joined to it move.

### Per-stroke idealization

- **Higher-resolution skeleton** (`F=3` upsample) so thin walls between strokes that
  fused at the scan's pixel scale resolve into their true shapes.
- **Pen-width normalization**: every stroke is drawn at one median pen width with
  round caps, never thinner than the pen.
- **Primitive fitting** (`fit_prims`): each skeleton run becomes a line, a circular
  arc, or is split at its worst point and recursed. Two guards keep hand-drawn
  polygons from being smoothed into arcs:
  - a **corner test** — if splitting at the worst point already yields two straight
    runs (each judged against *its own* size), it's a corner between line segments,
    so lines win;
  - a **tight-fit requirement** (`ARC_FIT`) — an arc is accepted only if it *hugs*
    the pixels (`aerr <= ARC_FIT * tol`), not merely fits within tolerance. A polygon
    forced through a circle passes tolerance loosely but never tightly.

### Circles

- **Hough detection** for wheels/heads, gated by a `CIRC_MIN` absolute radius floor
  (real features vs. incidental loops overlap in pen-units — only absolute size, at a
  known scan resolution, separates them). Each circle is then **least-squares refit to
  its own ring points** (`refit_circle`), which matches the drawn ring far better than
  Hough's voted integer radius. Ring pixels are removed from the skeleton so they
  aren't redrawn as strokes.

### Topology resolution (`resolve_topology`) — the connectivity model

The skeleton already encodes which strokes meet: they share a junction *blob*.

- **Cluster by connectivity, not distance.** Meeting strokes are grouped by their
  shared skeleton node-blob (`ndimage.label` on degree≠2 pixels), so two nearby
  junctions stay two junctions instead of collapsing into one.
- **The segments set the meeting point, keeping their angles.** At a junction the
  nexus is the *weighted least-squares intersection of the members' lines*
  (`_line_isect`), which minimizes each segment's **perpendicular** (angle-changing)
  move while letting it lengthen/shorten freely — shape before length. Longer
  segments weigh more; the little end-wobble is trimmed so strokes run straight in
  (no kinks).
- **The circle yields to its contacts.** Where ≥2 segments meet on a rim, the segments
  own the point and the circle is **refit through those nexuses + its ring points**,
  so its edge moves to pass through where the strokes actually meet. A *lone* stroke
  touching a circle instead yields to it, meeting the rim along its own axis.
- **Ring fragments are absorbed.** A polyline that hugs a rim (a bulge that survived
  ring-removal) is dropped — the idealized circle stands in for the whole rim.

### Solid regions (blobs)

- A region is **solid** when its stroke width is a large fraction of the whole figure
  (`SOLID_FRAC`), or a locally-thick area within line-art (ink more than `thick_k·pen`
  wide). Two steps make the fill match the drawing: the thick core is **grown along the
  ink while it stays wider than a pen-line** (so a blob follows its own taper down to
  true line-width and hands off to a stroke cleanly, instead of stopping abruptly and
  leaving the still-wide taper drawn as a too-thin centerline), then the **rim is
  recovered out to the ink's true edge** (so the fill isn't a pen-half inside it).
- **Blobs are first-class, like circles.** Their interior is removed from the skeleton
  (so strokes stop at the boundary instead of running through), and their outline is
  **straightened with the same `blob_outline` → `fit_prims`** used for strokes — clean
  straight edges and sharp corners, not vtracer's pixel-stepped polygon.
- **Blob corners are nexus candidates.** A stroke ending at a blob snaps to its nearest
  corner (a shared meeting point) or, failing that, its nearest edge. The blob is a
  fixed shape, so the stroke yields to it (unlike a circle, which can resize).
- Coloured regions (flag emblem, blood) are still traced by **vtracer**.

All tuning knobs live as documented module constants at the top of `skel_svg.py`
(`ARC_FIT`, `SOLID_FRAC`, `CIRC_MIN`, and the `CONTACT_*` / `NEXUS_*` / `REFIT_DRIFT`
topology block).

Each emitted component is wrapped as `<g class="seg" data-num="N">` with an invisible
wide hit-area for the comparison page's hover interaction, plus a `<g class="nums">`
overlay of numbered bubbles. In the comparison page the left "scan" panel overlays the
hovered segment red on the aligned scan, for checking how the idealization diverges.
