# Phase 01.1 — QA

Environment: MacBook Pro, Intel Iris Plus 650 (ANGLE Metal), macOS 13, Chrome 158. Headless tests and screenshots use SwiftShader (software WebGL) — slower and slightly different anti-aliasing than a GPU browser, same model and code.

## 1. Data integrity

| File | SHA-256 (Phase 01 = Phase 01.1) |
|---|---|
| `data/detroit/model.json` | `b7bc3689929d91f469a58a6592aee689048a671fbcff1d499729ccf641ce7d7b` |
| `data/detroit/instances.bin` | `1bf31385f064f540d3ec68d4855fe92eaf370af7f21ca16da5cb2b8d9483bdf7` |
| `data/detroit/terrain.bin` | `fbfbd39952c6847f27cae9b362aaad42687737d90aec0476021e7f38214d97a3` |

No id, geometry, species or placement changed. New file: `data/detroit/case.json` (settings only). A browser test re-hashes the two baseline files on every run; another checks that the reference instance table's fingerprint never changes during edits.

## 2. Tests

| Suite | Phase 01 baseline (`5a7062d`) | Phase 01.1 |
|---|---|---|
| `tools/test_model.py` (data contract) | 23/23 | 23/23 (unchanged; data unchanged) |
| `tools/run_browser_tests.py` → `tests.html` | 42/42 (286 s, frozen copy) | see §2.1 |

No Phase 01 test was removed or loosened. The harness wall-time limit was raised (300 s → 1800 s) because this machine is shared with another Chrome renderer at ~70 % CPU; assertions are unchanged.

### 2.1 What the 71 new browser tests check (all through the real app in an iframe)

- **10 · integrity** — SHA-256 of the two baseline files; reference rows untouched after every edit.
- **01 · site vs design** — Reference / Canvas / Terrain reachable; *Hide planting* keeps data and queries; the Canvas button without a draft opens the scope dialog and creates nothing until *Start*; blank canvas: B1 has 0 placements / proxies, live count = reference − preview, site trees / Rain Garden / paths / 20 beds kept; 3D rendered proxies = live rows; same terrain mesh (site not reloaded); reference still complete; Terrain hides plants but deletes nothing; a hidden boardwalk still blocks planting; the draft survives state switches.
- **03 · edit loop** (B1, non-matrix group chosen from data, here `pl.B1.g27` *Monarda bradburiana*, 6 proxies) — replace → same proxy ids change species; model tally and **3D rendered counts** move by 6; 3D form and colour of the proxy change; **plan pixel colour** at the proxy changes; point / species queries and the inspector show the new species; export carries the change. Remove → gone from model, index, render, queries and picking. Add → seeded proxies, pickable, rendered; outside the bed → `E_OUTSIDE`. Atomic rollback with a `__proto__` path; site read-only; unknown species; UI lock ≠ model permission, model edit lock blocks; `dryRun`; export → import fingerprint; reset = reference exactly.
- **04 · queries** — polygon crossing a slanted bed edge intersects but is not `within`; polygon with a hole; MultiPolygon; LineString / MultiLineString; boundary contact; 7 m radius = brute force (1 mm tolerance documented); large-radius nearest neighbour; bbox candidates flagged `exact:false`; out-of-extent nulls; definitions + units; path set from `case.json`; elevation in m NAVD88 independent of display exaggeration; hidden layer still blocks; matrix + group overlap at one point.
- **08 · layers** — six plates + analysis entry; no cross-layer shadows; **real pointer clicks on the 3D plates** focus composition then infrastructure; Open in Plan (isolated layer, breadcrumb, legend); in-scope picking; overlays not pickable, opacity applied; Back to the Layers camera; Esc to the world camera (exact); layer state restored; Analysis shows slope and marks sun / moisture / pH as no data.
- **09 · interface** — view and state controls separate; *Schematic reconstruction · not a survey* in Reference; no inspector without selection; model ≥ 80 % of the screen; keys `3` / `Esc`.

### 2.2 Problems the tests found (and fixes)

| Found | Cause | Fix |
|---|---|---|
| A species id in the screenshot demo did not exist | my typo; the validator refused the patch (correctly) | demo uses *Achillea* 'Moonshine' |
| Camera transitions never finished in headless / hidden tabs | `requestAnimationFrame` only | `animate()` with a timer fallback that always lands the last frame; newer camera moves cancel older ones |
| Back from a second isolated layer went to Plan, not Layers | origin overwritten when switching layers inside the isolated plan | origin kept |
| World camera not restored after Layers → Plan → Back → Esc | the hidden 3D view started a return tween while the plan was open | 3D keeps its pose while the plan is shown |
| `setPointerCapture` / `releasePointerCapture` threw for synthetic clicks | browser rule for events without an active pointer (agents, automation) | guarded on both canvases |
| Plan redraw ~60 ms | colour strings rebuilt per proxy | cached per species → ~45 ms full extent, ~19 ms zoomed |
| Test-side bugs | slanted bed edge, tolerance, variable shadowing, a `//` comment inside a one-line function | fixed in the test, assertions not weakened |

## 3. Screenshots

`docs/screenshots/phase-01-1/` (1440 × 900, headless Chrome, real model). Before: `before/` (same cameras on the Phase 01 code). Index in `PHASE_01_1_HANDOFF.md` §5.

## 4. Performance (GPU browser, 1440 × 900, measured as render + 1-pixel readback, averaged)

| | Phase 01 report | Phase 01.1 |
|---|---|---|
| World hero, DPR 1.5 | ≈ 25 fps | 42 ms / frame ≈ 24 fps (now frames the whole garden) |
| World hero, DPR 1 | ≈ 37 fps | 29 ms ≈ 34 fps |
| Close-up C3 (near LOD), DPR 1.5 | — | 23 ms ≈ 44 fps |
| Layers overview, DPR 1.5 | — | 27 ms ≈ 37 fps |
| Triangles / draw calls (overview) | — | 466 k / 57 |
| 3D rebuild after a patch | — | 186 ms (all plant meshes from the instance table) |
| Plan redraw, full extent / zoomed | — | ≈ 45 ms / ≈ 19 ms |

Different moments and camera from the Phase 01 numbers, so only roughly comparable. The adaptive fallback (DPR 1, then smaller shadow map below 22 fps) is unchanged; near-LOD never drops objects.

## 5. Load size

| | raw | gzip -9 |
|---|---|---|
| App code (`index.html`, `src/*`) | 0.27 MB | 0.08 MB |
| `model.json` + `instances.bin` + `terrain.bin` + `case.json` | 2.46 MB | 0.60 MB |
| three.js r186 (vendored) | 2.16 MB | 0.43 MB |
| **Total** | **4.89 MB** | **1.10 MB** |

## 6. Manual browser checks (Claude browser pane, desktop 1440 × 900 and 390 × 844)

World / Plan / Layers; Reference / Canvas / Terrain; draft dialog and blank canvas in 2D and 3D; Layers focus → Open in Plan → overlays → Back; isolated Composition / Representation / Terrain / Analysis; B1 replacement in console with rendered counts; phone: no horizontal overflow, legend collapsed to a header, overview stack resized. Issues seen and fixed: plates visible at ground level in World (fixed), labels half a plate off (fixed), fit ignoring the legend (fixed), phone legend covering the model (fixed), scatter / emergent clutter at overview zoom (progressive reveal), empty beds reading as planted mass in 3D (open-bed hatch).
