# Overnight status — Generative Planting, Phase 01

_Checkpoint file. A resumed session reads this first, then `git log`, then the code._

| | |
|---|---|
| Current gate | **All core gates passed (G0–G5); optional exploded view done; further work = refinement only** |
| Branch | `main` (repo was empty at start, so main carries the first version; no force pushes) |
| Last verified live commit | `4ef93db` (Pages built, live tests 42/42) — later commits are docs/refinement, see `git log` |
| Pages | enabled via API: source `main` / root, legacy build — https://kaiyankay.github.io/Generative-Planting/ |
| Last model tests | `python3 -I tools/test_model.py` → 23/23 |
| Last browser tests | `python3 -I tools/run_browser_tests.py` → 42/42 (headless Chrome, base path `/Generative-Planting/`); live site 42/42 |

## Gates

- [x] G0 preflight — repo was empty; `.gitignore` keeps `private-inputs/`, `.claude/`, `.env*` out; no Node / `gh` on this Mac → no-build ES modules + vendored three.js 0.186; git push works through the macOS keychain credential.
- [x] G1 source → model — OSM beds/paths/walls, USGS NAIP + 3DEP, bed codes from the 2020 bulb plans, species/roles from legends, official counts. `tools/build_model.py`.
- [x] G2 shared viewer — one `ModelStore`; Plan (canvas) + 3D (three.js) read the same layers / selection.
- [x] G3 detailed planting — every bed has a schematic arrangement following its style; far/near plant LOD with botanical near forms; five visual review rounds (QA_REPORT §3).
- [x] G4 verification — tests above.
- [x] G5 release — pushed; Pages enabled; live page opened and tested (42/42).
- [x] Optional: exploded layer view.

## Next executable commands

```bash
cd ~/Desktop/ARCH540/Generative-Planting
python3 -I tools/build_model.py && python3 -I tools/test_model.py
python3 -I tools/run_browser_tests.py
python3 -I tools/run_browser_tests.py --url https://kaiyankay.github.io/Generative-Planting/tests.html
```

Local preview: launch config `gp` (port 8780) in `ARCH540/.claude/launch.json`.

## Blockers / notes

- Official Oudolf drawings and the class slides stay in `private-inputs/` (git-ignored). Planting geometry inside beds is generated, not traced, so nothing derived from the drawings' geometry is public.
- No live AI work tonight by design.
