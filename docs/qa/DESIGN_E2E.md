# Design e2e experiments — 39/39 checks passed

Runner: headless Chrome (SwiftShader) over the DevTools protocol; real mouse input events for brushes and panels. Started 2026-11-26 22:06:17, finished 2026-11-26 22:28:18.
Served at `http://127.0.0.1:8794/Generative-Planting/`; personal knowledge in a test database (`gp-knowledge-e2e-1795755977`).

## Checks

### F · full iteration

- PASS — entry shows the site preset and the design choices
- PASS — Empty beds starts a working design in the same workspace (plan, palette, brushes)
- PASS — Undo and Redo through the bar buttons
- PASS — Reference ↔ Working design switch keeps both intact
- PASS — season feedback uses only applicable phenology records and reports the coverage
- PASS — free language is not faked: without a connected model the request is reported as not interpreted
- PASS — structured operations preview, then apply through the same engine
- PASS — after a reload the design document is restored and rebuilt to the same plants
- PASS — no runtime errors

### A · whole-garden fill

- PASS — Shift-click selects six beds before filling
- PASS — two assignments, each spanning several beds, cover all 15 main beds (no open bed area)
- PASS — real plants written to the working design (> 12,000 perennials)
- PASS — base-role proportions within 5 points of the target
- PASS — every sampled design plant is plantable and inside its own bed (paths, structures excluded)
- PASS — every design plant record carries its DEM elevation (bilinear 3DEP, no display exaggeration)
- PASS — 3D renders the same design plants (rendered instances = live rows)

### B · across beds (curve, area)

- PASS — a curve drawn with the mouse becomes ONE assignment across ≥ 3 beds
- PASS — no plant of the curve band on a path or outside a bed; the path part is reported as unplanted space
- PASS — an area drawn across beds is clipped to the beds (one assignment, several beds, path area unplanted)

### C · terrain and environment response

- PASS — Under trees in TE: under the existing crown only species with shade knowledge applying in Detroit (Cornus sericea, USDA North America record)
- PASS — positions under the crown with no qualified species are left unplanted, with the reason
- PASS — plants keep ≥ 0.6 m from existing tree centres (approximate trunks)
- PASS — the same mix in an East Meadow area with a crown: Cornus under the crown, unqualified positions unplanted, open ground planted with every role
- PASS — the East Meadow area: the boardwalk inside it stays unplanted
- PASS — scenario OFF: species of every hydrology class are spread over the same ground (mean z of wet ≈ dry, within 0.05 m)
- PASS — scenario ON (hypothetical, flagged): species sort along the ground — mean z wet < moist < dry, wet ≥ 0.10 m below dry
- PASS — the scenario is labelled hypothetical in the result and its basis is the official list attribute
- PASS — role rule on a real field: Dropseed emergents all ≥ 0.6 m from paths (distance-to-path, OSM)

### D · editing a shared mix

- PASS — Keep brush: B5 kept as a frozen snapshot
- PASS — mix edit is held as pending changes and previewed (plants and role shares before → after) before it is applied
- PASS — every non-frozen Dropseed space follows the new version (groups share rises, version + 2)
- PASS — the kept B5 snapshot is byte-identical after the mix edit
- PASS — spaces of another mix (Colour blocks) are untouched
- PASS — a local repaint changes nothing outside its area (plants outside identical)

### E · knowledge connection

- PASS — before: Geranium maculatum has no exposure record (unknown) and is never planted under the crown
- PASS — adding a personal Detroit record makes the engine plant Geranium under the crown and leaves fewer positions unplanted
- PASS — narrowing the knowledge scope to Detroit-only removes Cornus sericea (its record is for North America) from under the crown
- PASS — applying the North America record to Detroit (a stored scope decision) brings Cornus back
- PASS — missing knowledge is reported as unknown, never invented

## Numbers

- **A**: 16,231 perennials + 7,112 bulbs on 2,935.8 m² (5.529 perennials / m², 33 species), open bed area 0 m².
  - Dropseed matrix (1160 m²): Long-lived matrix 0.72 → 0.712 (share of planted area); Groups 0.28 → 0.274 (share of planted area); Emergents 0.11 → 0.082 (plants / m²); Spring bulbs 0.12 → 0.138 (drift coverage)
  - Colour blocks (1775.9 m²): Base blocks 1 → 0.975 (share of planted area); Emergents 0.18 → 0.136 (plants / m²); Ephemerals 0.14 → 0.16 (drift coverage)
  - validation: 23,343 design rows; 3,334 re-checked with `plantableAt` → 0 not plantable; elevation mismatch 0 (max |Δz| 0).
- **B** curve: Organic groups · curve drifts, beds C1, B1, A1, B3N, 672 perennials, 30.584 m² of the band on paths (unplanted); check {'plants': 942, 'onPathOrOutside': 0}.
- **B** area: Native meadow · painted area, beds C1, B1, B2, RG, 874 perennials, 133.903 m² outside beds.
- **C** Under trees as.4: 936 plants, 4 under crowns {'sp.m-cornus-sericea': 4}, unplanted {'crown': 20}, min distance to tree centre 5.78 m, z [175.951, 176.679].
- **C** Under trees as.5: 2052 plants, 33 under crowns {'sp.m-cornus-sericea': 33}, unplanted {'blocked': 103, 'trunk': 4, 'crown': 131}, min distance to tree centre 0.63 m, z [175.55, 175.849].
- **C** shade knowledge applying in Detroit: {'sp.m-cornus-sericea': True, 'sp.m-geranium-maculatum': None, 'sp.m-packera-aurea': None, 'sp.aquilegia-canadensis': None, 'sp.m-carex-radiata': None}
- **C** hypothetical wetness: mean z by hydrology class OFF {'dry': 175.607, 'moist': 175.606, 'wet': 175.608} (n {'dry': 3769, 'moist': 2011, 'wet': 407}) → ON {'dry': 175.717, 'moist': 175.609, 'wet': 175.48} (n {'dry': 1593, 'moist': 2504, 'wet': 1022}); 41 substitution kinds.
- **C** edge rule: {'emergents': 88, 'minDistanceToPathM': 0.61, 'rule': 0.6}.
- **D** Dropseed matrix v1 → v3: Long-lived matrix 0.717; Groups 0.27; Emergents 0.076; Spring bulbs 0.133 → Long-lived matrix 0.511; Groups 0.479; Emergents 0.073; Spring bulbs 0.133
  - kept B5 (rows, hash) before/after: [[2462, 1749648819], [2462, 1749648819]]; local repaint outside-area (rows, hash) {'outsideBefore': [24632, 1148101423], 'outsideAfter': [24632, 1148101423]}.
- **E** under the TE crown — before: {'underCrown': {'sp.m-cornus-sericea': 4}, 'unplantedCrown': 20}; after adding a Geranium record: {'underCrown': {'sp.m-geranium-maculatum': 19, 'sp.m-cornus-sericea': 4}, 'unplantedCrown': 1}; scope Detroit-only: {'underCrown': {'sp.m-geranium-maculatum': 34}, 'unplantedCrown': 3}; after applying `cornus-sericea:exposure:usdaplants01` here: {'underCrown': {'sp.m-geranium-maculatum': 19, 'sp.m-cornus-sericea': 4}, 'unplantedCrown': 1}; missing knowledge: [['sp.m-packera-aurea', 'unknown', 'unknown'], ['sp.m-carex-radiata', 'unknown', 'unknown'], ['sp.sporobolus-heterolepis', 'unknown', 'unknown']].
- **F** season (May): {'total': 25141, 'known': 33, 'coverage': 0.001, 'blooming': 33, 'speciesKnown': 1, 'speciesUnknown': 53}.

## Screenshots (run order)

- [F01-entry.png](../../docs/screenshots/integrated/F01-entry.png) — Entry: the Detroit site preset in the canonical axonometric, with the two ways to start designing
- [F02-workspace.png](../../docs/screenshots/integrated/F02-workspace.png) — The design workspace: mixes on the left, brushes in the canvas toolbar, the 15 empty main beds hatched
- [A01-select-beds.png](../../docs/screenshots/integrated/A01-select-beds.png) — Experiment A: six B beds selected with the Fill brush (Shift-click)
- [A02-filled-plan.png](../../docs/screenshots/integrated/A02-filled-plan.png) — Experiment A: the 15 main beds painted with two executable mixes — real plants, 2D plan
- [A03-filled-axo.png](../../docs/screenshots/integrated/A03-filled-axo.png) — Experiment A: the same design in the axonometric 3D view, on the 3DEP terrain
- [B01-curve-across-beds.png](../../docs/screenshots/integrated/B01-curve-across-beds.png) — Experiment B: one curve band (Organic groups, drifts) across B1, A1 and B3N; the gravel paths it crosses stay unplanted
- [B02-area-across-beds.png](../../docs/screenshots/integrated/B02-area-across-beds.png) — Experiment B: a lasso area (Native meadow) across C2, B2 and the path between them — clipped to the beds
- [C01-under-trees-crowns.png](../../docs/screenshots/integrated/C01-under-trees-crowns.png) — Experiment C: Under trees in TE and part of the East Meadow — under existing crowns only species with applicable shade knowledge; × = left unplanted (no qualified species), boardwalk excluded
- [C02-wetness-on.png](../../docs/screenshots/integrated/C02-wetness-on.png) — Experiment C: Native meadow in the West Meadow with the HYPOTHETICAL 'lower ground is wetter' scenario — wet-listed species gather on low ground
- [C03-wetness-off.png](../../docs/screenshots/integrated/C03-wetness-off.png) — Experiment C: the same space and mix with the scenario off — the same species intermingled regardless of elevation
- [D01-mix-preview.png](../../docs/screenshots/integrated/D01-mix-preview.png) — Experiment D: Dropseed matrix edited (matrix 72 % → 50 %, + Echinacea pallida 'Hula Dancer' in the groups) — preview, not applied yet
- [D02-mix-applied.png](../../docs/screenshots/integrated/D02-mix-applied.png) — Experiment D: after Apply — every Dropseed space updated, kept B5 and the Colour blocks spaces unchanged
- [E01-knowledge-card.png](../../docs/screenshots/integrated/E01-knowledge-card.png) — Experiment E: a Geranium maculatum planted under the TE crown after the personal Detroit exposure record — its knowledge card
- [F03-reference.png](../../docs/screenshots/integrated/F03-reference.png) — Reference comparison: the reconstructed reference planting in the same canvas (palette hidden, nothing changed)
- [F04-feedback-season.png](../../docs/screenshots/integrated/F04-feedback-season.png) — Feedback: totals, target vs actual per mix, unfilled space, site rules, May — bloom known only where a record applies (coverage shown)
- [F05-ops-preview.png](../../docs/screenshots/integrated/F05-ops-preview.png) — Ask · Operate: the structured design operations (the same interface the brushes use) previewed — hollow circles, nothing applied
- [F06-final-axo.png](../../docs/screenshots/integrated/F06-final-axo.png) — The iterated design in 3D
- [F07-final-plan.png](../../docs/screenshots/integrated/F07-final-plan.png) — The iterated design in plan
