# QA report — Phase 01

## 1. Automated tests

| Suite | Command | Result | Where |
|---|---|---|---|
| Model contract | `python3 -I tools/test_model.py` | **23 / 23 pass** | `docs/qa/model_tests.json` |
| Browser, local, production base path `/Generative-Planting/`, headless Chrome (SwiftShader) | `python3 -I tools/run_browser_tests.py` | **42 / 42 pass** | `docs/qa/browser_tests.json` |
| Browser, desktop browser pane (Intel Iris Plus 650 GPU) | open `tests.html` | 40 / 40 pass (before the two exploded-view checks were added), app load 625 ms | — |
| Browser, **live GitHub Pages** | `python3 -I tools/run_browser_tests.py --url https://kaiyankay.github.io/Generative-Planting/tests.html --out docs/qa/browser_tests_live.json` | **42 / 42 pass** (commit 4ef93db) | `docs/qa/browser_tests_live.json` |

What the suites cover (all required checks of the brief):

- 15 main beds, unique IDs, A5 / B6 / C4, original codes exactly A1, A2, A3×2, A4, B1, B2, B3×2, B4, B5, C1–C4; triangles separate and not counted in the 15.
- Every reference resolves (parents, layers, sources, recipes, beds, species, geometryRef); placement/species indices consistent.
- Every geometry valid (shapely) and inside the extent; main beds do not overlap.
- **Every plant instance lies inside its own bed / district** (20,788 checked).
- Rebuild is byte-identical (instances.bin and model.json) → seeds stable.
- Sun / moisture / pH: `null` + `unknown`, layers flagged unavailable; elevation outside the extent is `null`.
- Layers: hiding trees hides the 3D meshes, keeps the data, leaves other layers visible; group toggle hides children without changing their own state; locked bed layer stays visible but is not selectable.
- Selection: click selects A1, 3D draws the outline and quiets other beds, second click drills down to a patch/plant, switching to Plan keeps it, inspector opens, parent climb, Esc clears.
- Plan wheel zoom, drag pan, fit reset; 3D home reset.
- Exploded view lifts vegetation and shows the structure plane, and returns to the ground and the previous camera.
- Draft: `applyPatch` changes the draft, baseline unchanged, `exportModel()` returns the baseline, `resetDraft` restores.
- No runtime errors; no horizontal overflow at 1440×900 and at 390×844 (phone); layer panel fits the phone width.

## 2. Model coverage

| | Count |
|---|---|
| Objects | 58 (20 beds incl. triangles / rain garden / meadows, 5 districts, walks, walls, water, roads, structures, 29 trees from NAIP) |
| Placements | 2,005 (area 1,470 · point 515 · scatter 20) |
| Plant instances (visual proxies) | 20,788 |
| Species records | 248 (Oudolf beds, bulbs, rain garden, bird border, 108 meadow taxa, 3 neutral placeholders) |
| Recipes | 8 (A block, B matrix, C grouping, Triangles, Rain Garden, Bird Border, West / East Meadow) |

Placements by style: A 749 · B 637 · C 466 · Rain Garden 102 · Triangles 4 · meadows 2.

### A / B / C fidelity

| Style | Documented | Modelled (schematic) | Difference from Oudolf's drawing |
|---|---|---|---|
| A Block | 28 block legend entries (some paired, e.g. *Echinacea* + *Dalea*), 15 emergents, 10 bulbs | Voronoi mosaic of ~55–68 blocks per bed (≈3.3 m² each), greedy colouring so neighbours differ; emergent symbols every ~5.5 m²; bulb drifts | Real blocks are drawn as rows of rounded rectangles; species sequence per bed differs |
| B Matrix | Sporobolus heterolepis matrix (named on the list), 18 group entries, 13 emergents/scatter species incl. 4 Baptisias, 9 bulbs | One matrix placement over the whole bed (overlapping everything), ~0.6–0.8 m groups on a 1.85 m Poisson spacing, emergents and three scatter species avoiding groups | Group sizes and positions generated |
| C Grouping | 16 group entries, 8 "individual plants / small groups", 10 bulbs | Rounded Voronoi groups (~4.2 m²), individual symbols every ~7 m² | Real groups are larger, interlocking blobs |

## 3. Visual reviews (real screenshots, 1440×900)

Scoring 1–5 against: recognisability of the real site, edges/composition, plant-form differentiation, hierarchy, UI restraint, performance.

| Round | What I saw | Changes made |
|---|---|---|
| 1 (first render) | 4.4 M triangles, 1 fps in the pane; beds read as bare brown soil with dark specks; plants black on back faces. Recognisability 3, forms 1, hierarchy 2. | Far/near LOD + render on demand; soft "foliage" normals without back-face flipping; brighter hemisphere light; wider far tufts. |
| 2 | Garden legible and colourful, but the view from the north-west was upside-down relative to the plan, the east end hid behind the layer panel, Carillon cropped, flower caps read as pastel confetti, meadows as plastic rows. Recognisability 4, composition 2. | South-facing home view (north up like the plan, Carillon and meadows in front); layer panel folded by default; smaller flower caps; meadow drifts (7 m cells), more grass; greener lawn. |
| 3 | B1's north half empty; trees clumsy; Carillon a plain box; analysis tint muddy. | Fixed the Poisson sampler (it filled from one end when truncated — a real generator bug); Carillon buttresses, lancets, cornice, pinnacles; rounder canopies; 29 NAIP trees; lake islands; contour layer. |
| 5 (exploded + phone) | High view made the stack overlap; meadow plants and park trees floated over the Carillon; lake surface ran past the diorama edge on phone; bed tags crowded at 375 px. | Exploded view swings to a low side-on camera and back; clips vegetation to Main Garden + Rain Garden while exploded; captions at the east end; water clipped to the board; smaller tags on narrow screens. |
| 4 (close-ups) | Near forms looked like paper cut-outs; then too sparse; LOD switch left half the beds empty after zooming. | Rewrote near forms (leaf rosettes, stems with node leaves, spikes, domed umbels, daisy heads, grass blades with seed haze); jittered companion per proxy in near LOD; budget-based LOD switch (≤2,400 proxies in view) with a single decision path; foliage understorey painted under the plants; instant focus for URL states. |

Current self-assessment (not a perfect score): recognisability 4, composition 4, plant forms 3.5 (far forms are still generic tufts; near forms are stylised, not species-accurate), hierarchy 4, UI restraint 4, performance 3.5 on a 2017 Intel iGPU.

Screenshots in `docs/screenshots/`: 01-hero, 02-plan, 03-layer-structure, 04-block, 05-matrix, 06-grouping, 07-inspector, 08-layer-toggle (vegetation hidden, contours + slope on), 09-plan-detail, 10-exploded. Phone layout (375×812) was checked visually in the browser pane; headless Chrome cannot lay out narrower than ~500 px, so no phone PNG is included. Captured by `tools/screenshots.py` with headless Chrome (SwiftShader) from the same URL states as the live site.

## 4. Performance (measured, not assumed)

Machine: this Mac, **Intel Iris Plus Graphics 650** (ANGLE / Metal), viewport 1440×900. The browser pane throttles `requestAnimationFrame` when hidden, so frame cost was measured by synchronous `render()` + 1-pixel `readPixels` (forces the GPU to finish), 15 frames each:

| View | Triangles / frame (incl. shadow pass) | ms / frame | ≈ fps |
|---|---|---|---|
| Hero, DPR 1.5 | 0.96 M | 39.4 | 25 |
| Hero, DPR 1.0 | 0.96 M | 27.2 | 37 |
| Hero, plants hidden | 0.10 M | 16.9 | 59 |
| Close-up (near LOD), DPR 1.5 | 0.96 M | 31.5 | 32 |

The app renders only when something changes (idle cost 0) and steps the pixel ratio down if sustained interaction falls below 22 fps. Data: model.json 1.9 MB, instances.bin 0.33 MB, terrain.bin 0.19 MB.

## 5. Deployment check

- Commit `4ef93db` (exploded view): Pages `built`; live `tests.html` → **42 / 42**.
- Pages enabled through the GitHub API (source `main`, `/`, legacy build), first build from `55e5b23`.
- Live URL opened in the browser: page title correct, all assets (`src/*.js`, `data/detroit/*`, `vendor/three/*`) returned 200 through relative paths, no console errors, 3D rendered.
- Commit `4102f92`: Pages build `built`; `tests.html` run against the live URL in headless Chrome → **40 / 40**, including base-path loading and both viewports.
- Live page opened in the desktop browser (real GPU): clicked bed A2 in 3D → outline, inspector, focus dimming; no console errors.

## 6. Not done / known issues

- Plant arrangements inside beds are schematic, not traced; species-accurate plant morphology is not attempted (form proxies by growth habit).
- Triangles' species unpublished; meadow layout unpublished; Bird Border alignment inferred.
- No phenology / season states; bulbs shown as positions only.
- Wall heights unpublished (display height labelled).
