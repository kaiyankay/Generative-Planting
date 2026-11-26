# Phase 01.1 — status (checkpoint file)

_A resumed session reads this first, then `git log`, then the code._

| | |
|---|---|
| Branch | `refinement/phase-01-1` from `main` @ `5a7062d`, merged (fast-forward) into `main` @ `1ea4975`, live on Pages |
| Baseline | model 23/23, browser 42/42 (run on a frozen copy of `5a7062d`, 286 s) |
| Data | `model.json` and `instances.bin` byte-identical to Phase 01 (SHA-256 in `PHASE_01_1_QA.md`, checked by a browser test) |

## Gates

- [x] G0 — package, repo, slides (PDF pages viewed as images), SALA sheets (browser), baseline tests, before-screenshots (`docs/screenshots/phase-01-1/before/`), plan (`PHASE_01_1_PLAN.md`).
- [x] G1 — 01 scenarios (reference / working, modes Reference / Canvas / Terrain), 03 edit loop (instance table per scenario, validated atomic patches, export / import / reset), 04 exact queries + constraints. Verified by hand in the browser, then by tests.
- [x] G2 — 05 style test + tokens, 06 plan painters per layer group + zoom hierarchy + contextual legend, 08 Layers overview + isolated plan + overlays + Back, 09 interface.
- [x] G3 — 02 written accuracy report (no tracing), 07 3D look (muted shared palette, soft crowns, section edge, open beds in canvas, whole-garden hero).
- [x] G4 — tests 23/23 + 113/113 local and live, screenshot set, docs, fast-forward merge to `main` (`1ea4975`), Pages live, handoff (`PHASE_01_1_HANDOFF.md`).

## Commands

```bash
python3 -I tools/test_model.py
python3 -I tools/run_browser_tests.py                    # ~6–8 min headless
python3 -I tools/screenshots.py --set phase011            # docs/screenshots/phase-01-1/
python3 -I tools/run_browser_tests.py --url https://kaiyankay.github.io/Generative-Planting/tests.html
```

Preview: launch config `gp` (port 8780). The browser pane is often hidden → rAF throttled; force frames with `GP._scene.renderNow()` / `GP._plan.drawNow()`. Hard-reload modules after edits (`fetch(f, {cache:'reload'})`).
