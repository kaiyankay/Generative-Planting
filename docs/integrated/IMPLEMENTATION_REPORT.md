# Integrated Prototype — implementation report

Package: `Generative_Planting_Development_Package` (00–06 + sketch). Role: Implementation Agent. Date 2026-11-27.
Branch **`feature/integrated-prototype`** (worktree `ARCH540/Generative-Planting-integrated`), based on the pushed
public branch `integration/design-prototype-public` (8454ba6) + `origin/main` (9b34048). Recovery baseline: tag
`baseline/pre-integrated-prototype`. `main` and the live GitHub Pages site are **not** changed.

## 1 · What was built

One app (`index.html`) with one persistent shell — wordmark · Design | Knowledge · project / design name · numbered
stepper **Define → Structure → Compose → Explore** — over the existing canvas (plan + existing 3D of the frozen Detroit
model), a right task panel for the current action, an inspector only on selection, and a bottom bar with Back · undo /
redo · status · one primary next action. All stages read and write one project state (`src/flow/project.js`).

| Stage | What the user does | Output (contract) |
|---|---|---|
| Define | one project (preselected — there is one real site), intent in words or one of three starters, Rules-mode reading shown in full, editable objectives / months / constraints, knowledge sources with coverage, unknown site data stated; resume a saved design | DesignBrief |
| Structure | select a bed (list or canvas), compare three real previews, preview adaptive numbered cells with the reason, adjust size / direction / seed layout, confirm; other beds untouched; changing a bed previews the impact and remaps by overlap or clears | SpatialCells |
| Compose | Suggest mixes (Rules mode) / create / reuse a Detroit legend recipe → one mix library; edit members, roles, % of plants, density; ask for a change (bounded parser → patch preview); add knowledge in context with scope; paint (click / drag, one gesture = one undo step) or Auto compose (preview, accept); inspect a cell; local variant vs update all | Mixes, CellAssignments, PlantInstances, compatibility |
| Explore | Planting / Pollinators / Seasonality / Adaptability; month timeline (view only); bars by month; issues → Edit mix / Reassign cell / Add knowledge / Change structure; snapshots + compare; export JSON | PerformanceResult, export |

Knowledge is the existing Knowledge workspace, opened over the design in the same page (the design stays mounted;
coming back re-reads personal knowledge and keeps the stage, selection and camera).

## 2 · Code changes

New `src/flow/`: `project.js` (state, persistence, undo, snapshots, export, draft sync), `spatial.js` (spatial logic
engine), `knowledge.js` (Active Knowledge), `mix.js`, `suggest.js` (Rules mode), `llm.js` (adapter + validation),
`compose.js` (compatibility, Auto Compose), `arrange.js` (instances), `performance.js`, `paintflow.js` (one painter for
plan and 3D ground), `shell.js`, `stages/{define,structure,compose,explore}.js`, `ui.js`, `flow.css`, `tests.js`.
New data: `data/detroit/teaching-traits.json` (illustrative, labelled). New tools: `tools/flow_server.py` (static +
language-model gate), `tools/flow_e2e.py` (browser release gates), `tools/flow_report.py`; `flow-tests.html`.

Changed existing files (minimal): `src/app.js` (workflow mode by default, `?classic=1` keeps the previous prototype; the
old header, entry card, draft dialog and brush UI are not mounted in workflow mode; ctx hooks exported),
`src/paint.js` (one `flow` painter hook in the paint order), `src/model.js` (`registerRuntimeSpecies` — plants added in
a project get a runtime display proxy; the frozen baseline is not modified), `src/design/library.js` (`pollinators`
record kind for personal knowledge), `tests.html` and older tools (`acceptance_run.py`, `design_e2e.py`,
`screenshots.py`) now open `?classic=1`.

Frozen: site geometry, terrain, coordinates, `model.json`, `instances.bin`, reference planting, Knowledge workspace
code and seed. Out of the main path (kept in the repo): the brush prototype `src/design/ui.js`, the site-setup header,
the Conditions panel.

## 3 · Data sources and what is illustrative

| Data | Source | Status in the app |
|---|---|---|
| Beds, paths, structures, terrain, crowns | OSM, USGS 3DEP, USGS NAIP (existing model) | real, frozen |
| Plants of the site, legend roles, recipes | Oudolf 2019/2020 legends, 2026 plant lists (existing) | real |
| Meadow hydrology | official meadow lists (`design-library.json`) | real (site list scope) |
| Light (Cornus sericea), Robertson 1929 visitor counts | knowledge seed (public copy) | real; Robertson shown as evidence of insect visitors only |
| Flowering months, pollinator groups, light, moisture for ~60 Detroit plants | `teaching-traits.json` | **illustrative teaching values — not verified**, switchable, labelled wherever used |
| Sun, soil moisture, pH | none | unknown everywhere |

## 4 · Algorithms

See [ALGORITHMS.md](ALGORITHMS.md) (all parameters, scores and limits).

## 5 · LLM

`MixReasoner` adapter with one request / response schema and one validator for Rules mode and a live model. The live
path runs only behind `tools/flow_server.py` with the `anthropic` package, `ANTHROPIC_API_KEY` and
`GP_CLAUDE_ALLOW_CALLS=1` (none present here); static hosting has no endpoint. **No model call was made in this work;
the live path is untested against a model.** Validation with invalid answers is tested with labelled fixtures (L1).

## 6 · Tests

All in a real browser (headless Chrome, SwiftShader WebGL, DevTools protocol), on the real Detroit model. Full step
table, actual values and screenshots: [../qa/FLOW_E2E.md](../qa/FLOW_E2E.md); raw records `docs/qa/flow_unit_tests.json`,
`docs/qa/flow_e2e.json`.

| Gate | Evidence | Result |
|---|---|---|
| 0 audit / preserve | [IMPLEMENTATION_MAP.md](IMPLEMENTATION_MAP.md); baseline tag; `test_model.py` 23/23 (model bytes unchanged); `test_seed.py` 31/31; D6 reference planting not overwritten | pass |
| 1 first-time user (P0) | journey steps 1–31 from an empty browser profile with real mouse input: brief, layer toggle with unchanged site query, B1 Bands by canvas click, back to Define and return, A2 honeycomb, TE organic, Rules-mode suggestion, Auto compose, inspector, paint drag, undo / redo / Esc, 3D, Explore months, issue → Compose, Knowledge and back, snapshot, export file inspected, reload + resume with identical plant fingerprint, compare, narrow layout | **31 / 31 pass** |
| 2 converging branches (P0) | engine tests S1–S9, A1–A2, M1, D1–D5, D10 (valid geometry for all three logics, holes, determinism, objective- and context-driven adaptation on labelled fixtures, adjacency, largest remainder, arrangement inside cells and off trunks, one gesture = one undo, Auto compose scope, update-all vs local variant, logic change with remap, new plant) | **42 / 42 pass** (engine tests, all gates) |
| 3 knowledge (P0) | K1–K8, L1–L2 (first use without personal records, knowledge change → recipe change, project scope isolation, personal note saved and used, visible conflict + scoped choice, explicit intent reading, bounded edit parser, refusal of invalid model answers, Rules mode on a static page, no key in the client) | included above |
| 4 performance (P0) | P1–P6, D9 (known example {Apr, May} / {Jun, Jul}, replacement changes coverage, unknown → uncertain, adjacency vs separation, empty design, known mismatch vs unknown, timeline never changes the design) | included above |
| 5 interface / regressions (P0) | four stages only; layers closed by default; inspector only on selection; one primary action; existing site suite on `?classic=1`: **177 / 177** (`docs/qa/browser_tests_classic.json`) | pass — see note |

Console during the journey: one line, `knowledge/data/local/seed.json` 404 — the Knowledge workspace looks for its
git-ignored local research copy on localhost and falls back to the public copy (existing behaviour, not an error of the
workflow). The site suite first showed 4 failures in the exploded-plate click tests; they did not reproduce in the browser pane and passed 177 / 177 when the run was repeated with the pane idle (the baseline commit also gives 177 / 177): load from a second WebGL page, not a regression. The language-model status endpoint is not probed on static hosts (no 404 there).

## 7 · How to run

```bash
python3 -I tools/flow_server.py --port 8796        # http://127.0.0.1:8796/  (?fresh=1 ignores a saved design, ?kdb=<name> uses a test knowledge DB)
python3 -I -u tools/flow_e2e.py                    # engine tests + first-time-user journey in headless Chrome (~10–20 min)
python3 -I tools/flow_report.py                    # docs/qa/FLOW_E2E.md + flow-sheet.jpg / flow.gif
python3 -I tools/run_browser_tests.py              # the existing site-component suite (now on ?classic=1)
```

## 8 · Known issues and requirements not (fully) met

1. **Flowering / pollinator data are illustrative.** Without the teaching layer most Detroit plants are unknown and Rules
   mode cannot propose a recipe (it says so and offers manual creation). Sourced data are needed for any real use.
2. **No language model was exercised.** The live adapter and server endpoint are written and validated with fixtures
   only; prompts, schema fit and latency with Claude Sonnet 5.5 are untested.
3. **Light suitability is the only site-based suitability**, inferred from NAIP crowns; moisture is always uncertain
   (no data). The Rain Garden and meadow hydrology lists are used as plant attributes only, not as cell conditions.
4. **Bands are straight** (parallel to the chosen reference direction); they do not bend with a curved path. Organic patch
   edges are straight Voronoi edges. Honeycomb / organic sizes are the candidates listed in ALGORITHMS.md.
5. **Arrangement capacity**: dense mixes in small cells relax spacing (counted) and can leave a few plants unplaced
   (≈ 1.5 % in the test design); the shortfall is reported per cell and in the export, not hidden.
6. **Compare** is against your own snapshots only; a comparison with the reconstructed reference planting is not offered
   because the reference has no comparable per-plant traits (stated, not faked).
7. **Undo** covers design gestures (structure, mixes, assignments, project knowledge); personal knowledge saved to the
   shared notebook is undone in the Knowledge workspace.
8. **3D**: cells show as ground tints and plants as the existing form proxies; cell numbers and the seasonality dots are
   plan only. Camera position in 3D is not persisted (plan view is).
9. **Narrow screens**: basic stacked layout (panel below the canvas) checked at 820 px; not tuned for phones.
10. **Preview hosting**: raw.githack serves the branch with a one-click third-party notice; GitHub Pages was not changed
    (it can serve only `main`).
