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

RESULTS_PLACEHOLDER

## 7 · How to run

```bash
python3 -I tools/flow_server.py --port 8796        # http://127.0.0.1:8796/  (?fresh=1 ignores a saved design, ?kdb=<name> uses a test knowledge DB)
python3 -I -u tools/flow_e2e.py                    # engine tests + first-time-user journey in headless Chrome (~10–20 min)
python3 -I tools/flow_report.py                    # docs/qa/FLOW_E2E.md + flow-sheet.jpg / flow.gif
python3 -I tools/run_browser_tests.py              # the existing site-component suite (now on ?classic=1)
```

## 8 · Known issues and requirements not (fully) met

ISSUES_PLACEHOLDER
