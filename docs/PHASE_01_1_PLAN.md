# Phase 01.1 — plan (short)

Start: branch `refinement/phase-01-1` from `main` @ `5a7062d` (= origin/main). Baseline tests on that commit: model 23/23, browser 42/42 (see `PHASE_01_1_QA.md`). Baseline data hashes recorded in `PHASE_01_1_QA.md` and re-checked by a test.

## What exists (measured, not from the old reports)

- `data/detroit/model.json` (87 objects, 2,041 placements, 248 species, 6 fields), `instances.bin` (20,788 visual proxies), `terrain.bin` (3DEP 1 m).
- `src/model.js` ModelStore: queries + `applyPatch` that edits a JSON copy only — instances keep coming from the fixed buffer, so a species change never reached the 3D plants or the plan symbols. `queryObjects` polygon = "object centroid inside", `bbox` = bbox overlap; `nearestInstance` only scans 3×3 cells of 2 m (misses for radius > 2 m); `distanceToPath` hard-codes three Detroit ids.
- Views: `plan2d.js` (canvas), `scene3d.js` (three r186, instanced plants, LOD, render on demand, exploded stack of 3 groups), `app.js` (UI, inspector, `window.GP`).

## Ten tasks, order of work

| Gate | Task | Plan |
|---|---|---|
| G1 | 03 edit loop | Instance table (structure of arrays) per scenario; working draft = placements + instances + grid index; validated, atomic patch batches (replace species / remove / add / set with path whitelist); reset; export with instance state; draft persisted per session (localStorage) as a replayable op list. |
| G1 | 04 query | `geom.js`: exact intersects / within for point(+radius), multipoint, line, multiline, polygon, multipolygon with holes; closed-set boundary semantics; bbox only as rectangle or explicit `candidates`. Radius-correct instance grid. Path set from object type (`path`), not ids. `sampleConditions` with definitions, plantable/locked/hidden as separate facts. |
| G1 | 01 site / design | Scenarios `reference` (frozen) and `working`; modes Reference / Canvas / Terrain; "Hide reference planting" (view) vs "Start new planting design" (clears active planting in a scope shown before it runs). Site trees (no placement) vs designed woody separated. |
| G2 | 05 art direction | Three same-camera style tests on the real model; adopt #2 (line + low-saturation plant illustration). Tokens from the package; one theme. |
| G2 | 06 plan | Plan painter split into the 7 layer groups; zoom hierarchy; halo plant symbols; contextual legend; label decluttering. |
| G2 | 08 layers | 7 groups (UI categories over existing layer ids). Exploded overview: one plate per physical group, click to focus, `Open in Plan` → isolated orthographic layer with legend, sources, overlays (opacity), breadcrumb, Back, Fit. |
| G2 | 09 interface | World / Plan / Layers views; Reference / Canvas / Terrain modes as a separate control; inspector only on selection; status line keeps "Schematic reconstruction · not a survey". |
| G3 | 02 accuracy | Written per-bed evidence table A1/B1/C1 (no tracing; drawings stay private). |
| G3 | 07 3D | Muted palette shared with plan, softer light, cleaner trees and plant forms, no cross-layer shadows when exploded, true-scale option for terrain. |
| G4 | 10 QA / deploy | Extend tests (never loosen), screenshots 01–12 + before/after, merge to main, Pages, live check, Chinese handoff. |

## Keep

All ids, geometry, `model.json` / `instances.bin` bytes (hash-checked), the build script, deterministic seeds, LOD + render on demand, the URL states that still make sense, the `window.GP` read calls (signatures extended, not changed).

## Not doing

AI / LLM, knowledge graph, automatic design generation, ecological scoring, phenology / growth, new cases, redrawing terrain or paths, new framework / build step.
