# Integrated Prototype — Gate 0 audit and implementation map

Date 2026-11-26/27 · package `ARCH540/Generative_Planting_Development_Package` (00–06 + sketch) · Implementation Agent.

## Gate 0 · audit (facts checked in the repository, not taken from the package)

| Item | Found |
|---|---|
| Repository | `kaiyankay/Generative-Planting` (origin). Worktrees: `Generative-Planting` (feature/computational-space), `-design` (integration/design-prototype, local, contains licence-unclear knowledge rows — never pushed), `-knowledge` (local only), `-knowledge-public` (feature/knowledge-workspace). |
| Base of this work | `integration/design-prototype-public` 8454ba6 (pushed; computational space + design layer + public Knowledge copy) merged with `origin/main` 9b34048 (Knowledge live docs). Branch **`feature/integrated-prototype`**, worktree `ARCH540/Generative-Planting-integrated`. |
| Recovery baseline | tag `baseline/pre-integrated-prototype` = 8454ba6. `main` and GitHub Pages (main, root) untouched; the live site keeps serving the Phase 01.3 site component + `/knowledge/`. |
| Build | static ES modules, vendored three r186 and polygon-clipping; no Node, no `gh`, no Playwright on this Mac. Python 3 with shapely / numpy / Pillow. Headless Chrome over CDP (`tools/knowledge/cdp.py`). |
| Site | one real site preset: Oudolf Garden Detroit (`data/presets.json`, `data/detroit/model.json` 20 planting units, 248 species, 3DEP 1 m terrain, OSM paths, NAIP crowns). Sun, soil moisture, pH: **no data** (unknown). One project only → it is preselected, not offered as a fake choice. |
| Knowledge | `knowledge/data/seed.json` public copy: 763 entities, 1083 records — mostly the ten Metro Vancouver plants. For the Detroit species: drawing roles (legends), 37 Robertson (1929, Illinois) visitor-list counts (name-match leads), hydrology printed on the official meadow lists (`design-library.json`), one applicable exposure record (Cornus sericea). **No flowering months and no pollinator-group associations for any Detroit species.** Personal knowledge = IndexedDB `gp-knowledge`, shared with the Knowledge workspace. |
| Design system | `docs/knowledge/DESIGN_SYSTEM.md` (white paper, one ink, nct127 display / Archivo / DM Mono, botanic = preset data, terracotta = your knowledge). The site component uses its own warm-paper tokens; the shell follows the Knowledge design system, which says it was written for the future Design Workspace. |
| Handoffs present | `docs/INTEGRATED_HANDOFF.md`, `docs/DESIGN_CONTRACT.md`, `docs/MODEL_CONTRACT.md`, `docs/COMPUTATIONAL_SPACE.md`, `docs/knowledge/HANDOFF.md`. No `HANDOFF.md` at the root (recorded, not guessed). |
| LLM | no API key, no `anthropic` package on this Mac → **Rules mode** (offline). The adapter has a live path behind a local server gate; it has never been exercised with a model. |
| Old interface | https://kaiyankay.github.io/planting-intelligence/ (looked at in the browser): wordmark + Design / Plants / Knowledge, numbered stepper on the right of the top bar, stage title, canvas, right task panel, bottom bar with status and one primary "next" button. Taken: continuity of that shell. Not taken: Imagine/Shape/Compose/Grow logic, screen / ground-cover flows. |

## Map: reuse · modify · freeze · out of the main path

| Module | Decision |
|---|---|
| `model.js` ModelStore, `geom.js`, terrain, `instances.bin`, reference planting | **frozen** (site model). Used: plantable geometry, `unitBlockers`, `sampleElevation`, working draft + validated `applyPatch` (placements of kind `plants`, one row = one plant). One addition: runtime species proxies for plants added beyond the catalogue (`registerRuntimeSpecies`, never written to model.json). |
| `compute.js` ComputeSpace | **reused** as the shared site-layer query (fields: elevation, slope, distance to path / edge / obstacle, tree crown; sun / moisture / pH unknown). Cell attributes are sampled from it. |
| `plan2d.js`, `scene3d.js`, `paint.js`, `picker.js`, `layers.js` | **reused** canvas (plan + existing 3D, same camera across stages). Added: one paint hook (`flow`) used by plan and the 3D ground texture, so cells / overlays are drawn once for both. |
| `src/design/*` (mixes-as-paint brushes, assignments, Ask · Operate drawer) | **out of the main path**: not mounted in the workflow (kept in the repo, `?classic=1` still opens the previous prototype). Reused pieces: `library.js` (PlantLibrary: knowledge join, place applicability, personal records), `geo.js` (polygon helpers), the Detroit legend recipes in `mixes.json` (converted to reusable Mixes). |
| `knowledge/` workspace | **kept unchanged as the parallel workspace**; opened from the shell's Design | Knowledge switch inside the same page (the design stays mounted underneath), sharing the IndexedDB personal layer. |
| Entry card, Reference/New design selector, draft dialog, site-setup header | **removed from the main path** in workflow mode (code kept for `?classic=1`). |
| New `src/flow/` | project state + persistence + undo, spatial-logic engine (honeycomb / bands / organic + adaptation ranking), active knowledge, mix contract + rules-mode suggestion + bounded edit parser, LLM adapter, auto compose, arrangement, performance, shell + four stages. |

## Data that does not exist and how it is handled

- Flowering months and pollinator groups for Detroit species: **absent** in the knowledge. A separate, switchable project layer `data/detroit/teaching-traits.json` holds *illustrative teaching values* (labelled everywhere "illustrative — not verified", own source type `illustrative`, never merged into the foundation, can be switched off in Define to see the real unknowns). Values are typical horticultural ranges, not a Detroit survey and not checked against a source; replacing them with sourced records is an item for Kay.
- Sun / moisture / pH: unknown. Light suitability reads the only spatial light proxy that exists (NAIP crown above = probable shade, stated as an inference). Moisture suitability stays *uncertain* unless a cell condition is known.
