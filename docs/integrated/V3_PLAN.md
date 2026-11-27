# V3.1 — G0 record and change plan (written before implementation)

Package: `ARCH540/Generative_Planting_V3_1_Overnight` (00 = entry; 01–05; private references read locally, not committed).
Base: `feature/integrated-prototype` @ `6fd9001` (V2 tested at `b6e6b8f`), worktree clean. V2 kept as tag
`v2/integrated-prototype-6fd9001` (V1 tag `v1/integrated-prototype-e64f437` unchanged). Course PDF found locally and read
for P24–26, 34–36, 41–43, 69–72 (not committed).

## G0 — reproduced (V2, this Mac: MacBookPro14,2 · i5-7267U · Intel Iris Plus 650 · macOS 13.7.8 · Chrome 158, headless
with Metal GPU, 1440 × 900)
* Screenshot 01: Performance mode, June legend and the month timeline stay visible after Explore → Define, because the
  observation mode is one project-wide value (`view.mode`) and the timeline shows whenever mode = performance / diagram.
* Screenshot 03: the right panel keeps the scroll offset of the previous content; the black brush HUD covers the beds; the
  only feedback off a bed is the red text “no plantable cell here”; the hover ghost uses `inside()` only (no spacing,
  frozen, light) — it is not the same validation as the stroke.
* Brush scale: Compose fits all beds (≈ 2 px / m on 1440 px) — the user must zoom by hand to paint one bed.
* Seams: `fill.js` rejects every candidate within 0.08 m of ANY cell edge (internal edges included) and checks spacing only
  against plants of the same cell → a thin empty seam along internal cell edges and unchecked spacing across them.
* Knowledge (screenshot 08): “This project” shows 8 Metro Vancouver plants in the Spatial-function lens.
* Performance: `performance.js` picks the largest connectivity component by cell count but reports its area share; a
  partly brushed cell counts its whole area as designed area.
* Live brush trace (docs/qa/perf/v2-baseline-gpu.json, real mouse, ⌀ 3 m, B1 → walk → B2):

  | scenario | frame p50 / p95 | input → drawn p95 | plan draw p50 | handler p50 | long tasks ≥ 100 ms while held |
  |---|---|---|---|---|---|
  | empty design (structure only) | 66.7 / 133.3 ms | 124.6 ms | 13.1 ms | 11.5 ms | 1 (121 ms) |
  | large design, 19 356 plants | 283.3 / 366.6 ms | 371.6 ms | 55.1 ms | 10.9 ms | 108 (max 561 ms) |

  CPU profile while held (v2-profile-gpu.json): 52 % native “(program)” (canvas raster / flush of a full redraw on every
  move), `paintInstances` 6 %, the brush engine ≈ 1–2 %. The engine is not the bottleneck; redrawing everything is.

## Plan (order of the package)
G1  stage-owned observation state (mode / camera / focus per stage; Explore-only month, performance, timeline);
    design Scope (confirmed) ≠ Focus (camera); click / shift-click / shift-drag box selection in Define, candidate vs
    confirmed vs kept drawn differently; Structure fits the scope union, bed click = local focus with breadcrumb and
    Overview; Compose inherits the focus.
G2  environment layer (crown proxy, explicit per-bed light assumptions, unknown) and Mix compatibility per cell
    (match / partial / conflict / unknown, blocked drawn apart); ONE evaluation function for hover and drag; hard boundary
    = bed outline (no inset on internal cell edges); spacing checked across cells; light conflicts skipped or swapped
    (override explicit); soft-edge transition; dirty-region redraw + overlay canvas, no DOM rebuild per move, deferred
    persistence / performance on release.
G3  Explore as its own result layout over a read-only snapshot (scope only, context optional), bottom dock
    Plan / 3D / Diagram / Performance + months; community inspector from real instance ids; corrected area and component
    metrics.
G4  Knowledge: project plants first (profiles, traits, bloom calendar, communities), relation graphs only where real
    relations exist, region of the records labelled; distil labels across stages; full journey in a real browser.
