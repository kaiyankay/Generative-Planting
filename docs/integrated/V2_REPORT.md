# Generative Planting V2 — development report (overnight 2026-11-27/28)

Branch `feature/integrated-prototype` (appended to V1 `e64f437`, no force push; V1 tag `v1/integrated-prototype-e64f437`).
PR #1 updated, **not merged**; `main` and GitHub Pages unchanged. Package: `Generative_Planting_V2_Overnight` (00–04 +
private references; the references and the course slides were read locally and are **not** in the repository).
Algorithms: [ALGORITHMS_V2.md](ALGORITHMS_V2.md) · visual changes: [DESIGN_CHANGES_V2.md](DESIGN_CHANGES_V2.md) ·
test report with every step, screenshot and assertion: [../qa/V2_E2E.md](../qa/V2_E2E.md) · machine-readable:
`docs/qa/v2_e2e.json` (incl. the pointer log), `docs/qa/v2_unit_tests.json`, `docs/qa/browser_tests.json`.

## Gate 0 — audit (what V1 was, what changed)
V1 had one project state and four stages, but: Define stopped at a brief (beds chosen one by one later); Structure was
select bed → logic → confirm per bed; painting assigned whole cells on mouse-up; mixes were flat lists at 4.5 plants / m²;
performance was presence per cell; Knowledge was an iframe; the look was a white, square, generic tool. Reused unchanged:
the Detroit model and its frozen data (`data/` byte-identical, `test_model.py` 23/23), ModelStore / draft patching, the
spatial-logic engine (extended), ActiveKnowledge, Rules-mode suggestion and edit parsers, Auto Compose ranking, the
Knowledge notebook, the CDP test harness.

## Results by acceptance case (final run, headless Chrome / SwiftShader, empty profile, real mouse and keyboard)
| case | prio | result | evidence (journey step → actual) |
|---|---|---|---|
| A entry | P0 | **pass** | intro from real instances; 3 axo cards, 2 honestly "Planned"; Detroit → Define (steps 1–3) |
| B whole-site strategy | P0 | **pass** | V2 intent → 3 zones (Path matrix · Matrix Based · curved bands, 8 beds; Matrix beds · honeycomb, 5; Organic groups · Maximal Color, 4) over 17 beds, meadows kept, "beneath trees" reported as not applicable (max crown 6 %), one confirm = one undo step (4–5) |
| C structure | P0 | **pass** | 17 beds / 209 cells previewed at once in 2.5 s, 8 curved; size slider changes the zone's candidates; a drawn guide curve re-bands all 8 path beds; one confirm; A1 refined alone, other beds' cell ids unchanged (6–10). Engine: no overlap / inside plantable on all beds (V2), shared band phase across beds (V4) |
| D layered mixes | P0 | **pass** | palette of 3 legend recipes as base (area) + overlay (count) + drift layers, plan patch / section / ribbon from the engine; same-scale compare (11–12); overlay density edit changes overlay plants only (engine V5–V7); 4 system templates; 4.5 / m² only as V1 fallback |
| **E live brush** | **P0 critical** | **pass** | 25 real mouse moves B1 → walk → B2 with the button held: staged plants 49 → 95 → 141 → 189 → 229 while **0** were committed; release commits +267 in one undo step, 2 beds, 0 plants on the walk or outside a cell; 10.6 ms mean / 13.6 ms max per move (14). Frames while held: `docs/screenshots/v2/E-live-*.jpg`, strip `live-stroke-strip.jpg`. Hover writes nothing (13); Esc discards 333 staged plants (15); undo / redo one stroke (16); repeating the stroke adds 0 (17); fast drag with 3 moves leaves no gap (19) |
| E metric brush | P0 | **partial** | brush radius is in metres by construction (capsule in world units, HUD in m); step 18 confirmed the radius at the first zoom (max distance 1.50 m = r) but its second, zoomed-in stroke produced no new plants to measure (the evidence there is weak) |
| F fragments & engine | P0 | **pass** | overlay-only stroke keeps the matrix exactly (20); Cell Fill = whole-cell fragment of the same engine (21); frozen cell unchanged by brush, fill, mix edit (22, engine V12); Auto Compose 114 cells previewed then accepted (23); shared mix edit: impact 117 cells, 15 604 → 17 593 plants, 1 frozen excluded (24); local variant only selected cells (engine V13); Axo shows the same 19 356 rows as the project (25) |
| G performance | P0 | **pass** | A2 vs A4 (227 / 214 m², 1 632 / 1 383 plants, presence 5 / 6 both): June flowering 151 vs 304, fraction 9 % vs 22 %, 0.67 vs 1.42 / m², unknown 1 249 vs 464 shown apart (27). Illustrative layer off → known flowering 1 339 → **0**, unknown 7 522 → 19 003 (28): all Detroit flowering knowledge in this design comes from the teaching layer. Engine fixture V14 |
| H views | P0 | **pass** | Plan / Axo / Diagram (structure · mix · arrangement) / Performance, months, play / pause; design fingerprint unchanged, camera kept (29); issue → Compose with 60 cells selected → repaint → Explore recomputed (30) |
| I knowledge | P0 | **pass** | lenses with real edges (ecology 36, spatial function 24 from the planting-db KG), focus / dim, edge evidence, Matrix / Table same data (31); project record previewed (month-by-month before → after) then applied; unknown falls (32); empty personal layer is fine |
| J save / reload | P0 | **pass** | option saved and compared with the same definitions (33); export with x / y / z, slot, fragment, layers, frozen, assumptions (34); reload restores identical plants, 144 fragments, locks, stage (35) |
| K visual | P1 | **done, see limits** | V4.3 tokens and type, dock, intro, Knowledge network; 1440 × 900 screenshots for every step; 820 px without horizontal overflow (36). No Impeccable critique was available here |
| L regression | P0 | **pass** | engine 60 / 60 (V1 44 incl. 4 updated to V2 semantics + 16 new); model data unchanged; 0 console errors in the journey; classic suite below |
| M GitHub | P0 | see the PR | commits pushed to `feature/integrated-prototype`, PR #1 updated, fixed-SHA preview on raw.githack (third party, not Pages) |

**Classic site suite (`?classic=1`, 177): 177 / 177** when run alone. A first run overlapping other headless work gave
173 / 177 — the four exploded-view plate-click tests V1 already recorded as load-timing failures; not a regression.

Engine tests changed to V2 semantics (stated, not hidden): S5 now asks for straight bands explicitly (curved is the V2
default), P6 reads adaptability per placed plant, K7 checks the base-layer share, M1 validates a layered mix.

## Data schema and migration
`gp.project/2` (localStorage `gp.flow.project.v2`): + `strategy`, `locks`, `assignments[cell].fragments`, plants with
`id` (lattice), `slot`, `layerId`, `frag`, `fit`; mixes `gp.mix/2` (layers). Plants are stored compactly (string table +
tuples, ≈ 60 bytes each; V1's plain JSON overflowed the quota with ≈ 19 000 plants — found by the journey and fixed).
A saved `gp.project/1` is migrated on Resume: flat mixes → layers by role family, whole-cell assignments → whole-cell
fragments, positions regenerated by the V2 engine (the toast says so).

## AI / data honesty
* No language model was called. Rules mode is labelled everywhere; it lists the words it read and those it did not use.
* Detroit flowering / pollinator / light values in use come from the switchable illustrative teaching layer (step 28).
* Sun, soil moisture and pH: unknown on this site; crowns are a probable-shade proxy only.
* No synthetic second or third site; the cards say "Planned".

## Known limits / not done
1. Axo shows the same plants and cell tints but not the Performance raster or month colouring (Plan / Diagram do).
2. Brush painting is Plan-only; Axo is observation (stated in the dock tooltip and the toast).
3. Organic patches keep straight Voronoi edges; curved bands fall back to straight bands (stated in the notes) if a boolean
   operation fails on a geometry.
4. Strategy rules are a fixed rule list (Rules mode); arbitrary language is not understood.
5. Knowledge: personal records are still added in the Notebook tab (IndexedDB); the lens panel writes project records.
6. Zone edits in Structure (logic / size) update the strategy without their own undo step (the structure commit is one).
7. Performance of the brush measured only in headless SwiftShader on this Mac (≈ 11–23 ms per move); no device guarantee.
8. The metric-brush zoom check (E, second zoom) is weak evidence (see table).
