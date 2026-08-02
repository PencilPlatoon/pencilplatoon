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

## How the vectorizer works (`skel_svg.py`)

Guiding principle: **salience is not size**, and tolerances are **relative to each
feature's own size**. A big squiggle straightens while a tiny sharp shape is kept.

- **Higher-resolution skeleton** (`F=3` upsample) so thin walls between strokes that
  fused at the scan's pixel scale resolve into their true shapes.
- **Pen-width normalization**: every stroke is drawn at one median pen width with
  round caps, never thinner than the pen.
- **Primitive fitting** (`fit_prims`): each skeleton run becomes a line, a circular
  arc, or is split at its worst point and recursed. Two guards keep hand-drawn
  polygons from being smoothed into arcs:
  - a **corner test** — if splitting at the worst point already yields two straight
    runs, it's a corner between line segments, so lines win;
  - a **tight-fit requirement** (`ARC_FIT`) — an arc is accepted only if it *hugs*
    the pixels (`aerr <= ARC_FIT * tol`), not merely fits within tolerance. A polygon
    forced through a circle passes tolerance loosely but never tightly.
- **Hough circle detection** for wheels/heads, with wheels translated up to sit
  tangent to the frame, and solid hub dots redrawn at the wheel's final center.
- **Density fill** for genuinely solid/colored regions (via vtracer).

Each emitted component is wrapped as `<g class="seg" data-num="N">` with an invisible
wide hit-area for the comparison page's hover interaction, plus a `<g class="nums">`
overlay of numbered bubbles.
