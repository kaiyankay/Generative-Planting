# Generative Planting V3.1 — development report (overnight 2026-11-27/28)

Branch `feature/integrated-prototype`, appended to V2 `6fd9001` (V2 kept as tag `v2/integrated-prototype-6fd9001`; V1 tag
unchanged; no force push). PR #1 updated, **not merged**; `main` and GitHub Pages untouched. Package:
`Generative_Planting_V3_1_Overnight` (00 = entry; private references and the course PDF were read locally and are **not** in
the repository). G0 record and plan written before the work: [V3_PLAN.md](V3_PLAN.md). Algorithms: [ALGORITHMS_V3.md](ALGORITHMS_V3.md) ·
design / distillation / Knowledge decisions: [DESIGN_CHANGES_V3.md](DESIGN_CHANGES_V3.md) · every journey step, screenshot and
assertion: [../qa/V3_E2E.md](../qa/V3_E2E.md) · machine-readable: `docs/qa/v3_e2e.json` (incl. pointer log), `docs/qa/v3_unit_tests.json`,
`docs/qa/perf/*.json` (raw frames, inputs, draws, long tasks). Fixed-SHA preview: see the PR and HANDOFF (third-party
raw.githack, not GitHub Pages).

**Tests (final code, same machine):** engine 71 / 71 (V2 60 kept unchanged + 11 new) · real-browser journey 27 / 27 (one
continuous session from an empty profile, real mouse and keyboard; 0 console errors). Device: MacBookPro14,2 · Intel i5-7267U ·
Intel Iris Plus 650 (Metal) · macOS 13.7.8 · Chrome 158, headless, 1440 × 900.

## Results by acceptance case
| case | result | evidence (journey step → actual) |
|---|---|---|
| **A** entry, Explore → Define | **pass** | intro and landscape cards unchanged (1–2); Detroit → Define in Plan with no timeline / month / legend / brush, dock offers Plan · 3D only (3); back in Define after Compose and after Explore: same (9, 24); plants kept |
| **B** one bed, auto fit | **pass** | click B2 → only B2 candidate, Continue disabled until confirm (4–5); Structure fits B2 without any wheel (B2 box fills ≥ 55 % of the free canvas, camera / bbox recorded) (6); Compose keeps that scale; hover chip + one-step stroke (7–8) |
| **C** several beds across walks, focus / Overview | **pass** | Shift-click B1 + Shift-drag box over A2, C2 → B1 B2 A2 C2 confirmed, B2's cells kept (10); only new beds previewed, one confirm, union fitted (11); click B1 = focus (breadcrumb, B1 fills the canvas), scope and cells unchanged, Overview back (12) |
| **D** sun / shade / unknown, two mixes | **pass** | B1 sun, B2 shade, C2 part assumed from the Conditions legend; A2 left unknown (13). Colour blocks: B1 fits, B2 conflict, C2 partly, A2 unknown; Organic groups differ at C2 in shares and named conflicting members (14). Layer off → the brush still skips sun-recorded members in shaded B2 (15) |
| **E** hover legal / conflict / unknown / path / frozen | **pass** | chip and preview at each: +n; skipped for light; light unknown; “Path” blocked; frozen blocked (cell frozen through the inspector); hover never writes (16 + 15-hover-*.jpg) |
| **F** real stroke across cells and two beds; two zooms | **pass** | 30 real moves B1 → walk → B2: staged plants rising in 4 frames while held, nothing committed until release, both beds in one undo step, undo / redo exact, 0 plants outside cells (17, frames 16-live-*); fresh ground of A2 at the fit zoom and of C2 after two wheel zooms: both add plants, all within the metric radius (18) |
| **G** base over base, overlay, soft edge | **pass** | preview shows replacements before the press; base replaced inside the footprint only, outside + other layers identical; overlay-only adds overlays, base fingerprint unchanged; soft edge leaves old and new base plants in the rim (19). Engine W1 / W2: no inset at internal cell edges, 0 spacing violations across cells |
| **H** performance at ≈ 21 000 plants | **pass on p50 / p95 targets; one outlier frame open** | see the table below |
| **I** independent Explore | **pass** | own layout (panel closed, top bar, dock with months), scope-only plan (clip), 3D shows the design's plants only with the ground outside veiled; Plan / 3D / Diagram / Performance keep the same fingerprint and result revision (21) |
| **J** months, play | **pass** | April vs August: different known flowering in Plan (flower-colour dots) and in 3D (per-instance colours changed); Play advances, Pause stops; design unchanged (22) |
| **K** community inspector → Compose → back | **pass** | inspector counts = the instances of the fragments under the click (engine W10 too), layers planned vs placed, ≥ 4 “why” lines with sources; Edit in Compose selects those cells; after a new stroke the result revision rises, the saved option keeps its fingerprint (23) |
| **L** metrics | **pass** | planted footprint < structured area, perf/3; illustrative layer off → unknown up, known flowering down (24); W7 largest group by area, W8 partial-cell footprint |
| **M** V2 functions | **pass** | Cell Fill, Auto Compose, freeze (20), save option / compare / export / reload → same plants, fragments and light assumptions; the Detroit card says “Continue” (no silent loss) (26); undo / redo (17) |
| **N** visual, narrow | **pass (see limits)** | 1440 × 900 screenshot of every step; 820 px: no horizontal overflow (27). Before / after: `docs/screenshots/v3/before-after.jpg` |
| **O** first-time distillation | **pass** | removed / moved texts listed in DESIGN_CHANGES_V3.md; the journey is completed with the layout alone (no developer docs); journey.gif |
| **P** Knowledge task | **pass** | default list = 46 project plants, all Detroit, none from Metro Vancouver; search → profile; Seasons, Communities, Relations (pollinator graph 36 edges, Matrix / Table, focus dims); Spatial function: “no records for this project's plants” → labelled Metro Vancouver graph on request; a record (flowering 6–8) previewed (months + mix fit) → applied → June unknown 1 429 → 1 244 → back to the design (25) |

## Case H — live brush, before / after (same machine, stroke, camera, ⌀ 3 m; real mouse events)
| build | design | frame interval p50 / p95 | input → drawn p50 / p95 | long tasks ≥ 100 ms while held | staged plants at moves 21 / 61 / 101 |
|---|---|---|---|---|---|
| V2 `6fd9001` | empty (structure only) | 33.4 / 100.1 ms | 72.1 / 113.0 ms | 0 | 320 / 722 / 929 |
| V2 `6fd9001` | 20 965 plants | 216.7 / 283.3 ms | 230.0 / 286.5 ms | **108** (max 427 ms) | 313 / 707 / 910 |
| V3.1 | empty | 16.7 / 16.7 ms | 27.7 / 33.5 ms | 0 (max 79 ms) | 343 / 776 / 1 004 |
| V3.1 | 21 743 plants | 16.7 / 16.8 ms | 35.6 / 39.5 ms | **0** (max 86 ms) | 338 / 760 / 984 |

Targets: p95 frame ≤ 33 ms — met; input → visible preview p95 ≤ 100 ms — met; no long task ≥ 100 ms while drawing — met.
Stability: three V3.1 runs on an idle machine gave the same p95 (16.7–16.8 ms frames, 33–42 ms input → drawn); one earlier
run had one 124 ms task at the press. A run made while the machine was loaded by the parallel journey test (load average ≈ 16
on 4 threads) gave frame p95 66.6 ms, input → drawn p95 105 ms and 4 long tasks ≥ 100 ms at 21 743 plants (brush handler p95
30 ms instead of 14 ms): the budget has little headroom on this 2017 dual-core laptop under load.
**Not solved:** one frame of ≈ 0.52 s per stroke at the same point of the large-design stroke (when the pointer jumps ≈ 5 m
into the zig-zag), reproduced in both runs. It is not a JS long task (max 85 ms), not a full redraw (only region and overlay
paints while held) and the CPU profile shows the main thread ≈ 49 % idle with 31 ms of GC during the stroke — most likely a
compositor / GPU stall of the accelerated canvas; not diagnosed further.
What changed: region redraw of the swept rectangle + a separate overlay canvas (cursor, preview, chip), no DOM rebuilt while
held, the replaced-plant mask kept incrementally, persistence / performance / 3D rebuild deferred to after the stroke, partial
undo snapshots. Brush engine time per move is unchanged (p50 ≈ 13 ms, now including spacing across cells and light).
V2 profile (`docs/qa/perf/v2-profile-gpu.json`): 52 % native canvas work from full redraws; V3 (`v3-profile-gpu.json`): idle 49 %.
Headless numbers on this Mac; no claim for other devices.

## What changed (by gate)
* **G1** stage-owned views; scope (click / Shift / box / presets, candidate vs confirmed vs kept) vs focus (breadcrumb,
  Overview, bed menu); automatic animated fit of the scope / focus; Compose inherits the Structure focus; Define never shows
  Explore controls; panels start at the top of the current task; loading the page never wipes a saved design.
* **G2** light model (assumption > crown proxy > unknown; open ground no longer “sun”); per-bed assumptions; Mix fit map
  with textures and a blocked state; one evaluation for hover / drag / commit; stroke-wide spacing index; inset only at the
  hard outline; light conflicts swapped / skipped / explicitly allowed; soft edge; blocked reasons at the cursor; region
  redraw; geometry booleans that cannot lose a stroke (retry on 1 mm grid, safe fallbacks — a lost stroke was found and fixed
  during the journey).
* **G3** result snapshot (revision, fingerprint); Explore layout; 3D scope filter and month colours; community inspector;
  perf/3 metrics (planted footprint, largest group by area, phenology vs resource vs unknown).
* **G4** Knowledge by question (Plants · Seasons · Communities · Relations · Notebook), region-labelled spatial records,
  record preview with mix fit; distillation across stages (DESIGN_CHANGES_V3.md); 27-step real-mouse journey.

## Known limits / not done
1. The ≈ 0.5 s single-frame stall in the large-design stroke (above).
2. 3D Explore hides non-design plants and veils the ground outside the scope; terrain and built forms (tower, walls) remain.
3. Light matching is literal (part ≠ shade); moisture has no site data and is never matched.
4. The mix-fit map is per cell (assumption of the bed, crown fraction ≥ 0.5 of the cell); the brush itself evaluates the light
   per plant position.
5. Soft edge is a probabilistic rim (no explicit two-recipe weighting control).
6. Strategy and explanations are Rules mode (fixed rules); no language model; the inspector's “why” lines are assembled from
   recorded configuration, not reasoning.
7. Knowledge: Seasons and Plants read the same traits; no new categories or relations were created; most Detroit traits remain
   illustrative or unknown.
8. Device coverage: one Mac, headless Chrome with GPU; the brush is Plan-only (3D is observation).
