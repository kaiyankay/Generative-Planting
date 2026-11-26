# Phase 01.1 · Task 02 — accuracy and version boundaries

**Result: partial, by design.** The planting inside the beds stays a *schematic reconstruction*. Nothing was traced from Oudolf's drawings. This page is the written comparison and the per-bed evidence table the package asks for when the legal basis for a traced layer cannot be confirmed.

## What was checked (locally, not published)

| Source | Date | What it can tell us | Status in the model |
|---|---|---|---|
| Revised planting plans A / B / C beds (Piet Oudolf, hand-drawn, 1:100 with scale bar and key map) | Oct 2019 | Patch shapes, legend codes and species per patch, emergent / individual symbol positions, per bed | **Not used for geometry.** Species + legend role per *style* were already cited from the legends (Phase 01). |
| Bulb plans A / B / C beds | Sept 2020 | Bed codes A1–A4, B1–B5, C1–C4; bulb species + drift / cluster / line / scatter roles | Codes documented; bulb positions generated. |
| Official plant list | Feb 2026 | Current cultivars per area | Kept as a dated reference: 10 cultivars differ from the 2019 plans (table below). |
| Official statistics | Mar 2023 | Plants / varieties per **style**, not per bed | Shown per style only. |
| OpenStreetMap beds + paths | 2026 extract | As-built outlines (current) | Documented (±0.5 m against NAIP). |
| oudolfgardendetroit.org pages, photos | 2020–2023 | Narrative, statistics, photographs | Facts cited, images not redistributed. |

These five sources describe **four different moments** (2019 design → 2020 bulbs → 2023 counts → 2026 list, on 2026 OSM outlines). The model labels its epoch as "planting intent of the 2019/2020 plans on as-built outlines" and never mixes them silently.

## Can the drawings be reproduced exactly?

Technically yes: the 2019 sheets are clear, drawn at 1:100 with a metric scale bar and key map, and the bed outlines match the OSM beds closely enough for a similarity transform (an estimated 0.3–0.6 m residual; not measured because no control points were digitised). **Legally not confirmed**: a traced patch layer is a derivative of a copyrighted drawing, and course use does not by itself allow publishing it. Following the package, the work stops at this written comparison. If Kay obtains permission, the route is: QGIS georeferencer, 4+ control points per sheet on bed corners, similarity transform, residuals recorded per sheet, traced layer kept in `private-inputs/` with its own source id, published only if the permission covers redistribution.

## Representative beds: drawing vs model (paraphrase, no reproduction)

| | A1 (Block) | B1 (Matrix) | C1 (Grouping) |
|---|---|---|---|
| **Drawing (2019)** | Bed divided into roughly rectangular cells aligned with the bed's long axis; each cell one block species (or a paired legend entry); emergent symbols placed over the cells. | Continuous *Sporobolus heterolepis* matrix stipple over the whole bed; rounded group patches (≈1–2 m) with codes; many small emergent symbols scattered between them. | Rounded, interlocking drifts of different sizes with coloured outlines, plus individual / small-group symbols. |
| **Model (schematic)** | 58 block cells + 35 emergents + 48 bulb placements, from Voronoi-style cells. Cells are irregular polygons, **not** axis-aligned rectangles — the main visual difference. | 1 matrix + 38 groups + 25 emergents + 3 scatters + 58 bulb placements. Matrix-over-groups overlap is right; group outlines are polygonal rather than rounded. | 47 groups + 28 individuals + 49 bulb placements. Drift sizes vary; outlines polygonal rather than rounded. |
| **Species** | From the A legend (style level). Which block sits where in A1 is **unknown** in the model. | From the B legend; position of each group **unknown**. | From the C legend; position **unknown**. |
| **Counts** | Per-bed real counts unknown; style A total 28,126 plants (2023). | Style B total 31,925. | Style C total 16,754. |
| **Verdict** | Role structure right; geometry schematic; species-to-position not documented. | Role structure right (matrix + groups + emergents + bulbs overlap); geometry schematic. | Role structure right; geometry schematic. |

What changed visually in Phase 01.1 (rendering only, data unchanged): A blocks read as crisp filled cells, B as a stippled matrix with groups on top, C as groups + ringed individuals, bulbs as an independent dotted layer — so the three systems are distinguishable without pretending to be the drawings. Every view still says *Schematic reconstruction · not a survey*.

## Plant names: synonym or substitution?

The model keeps the 2019/2020 plan names. Ten "aliases" carried from Phase 01 are in fact **different cultivars in the 2026 list** (a possible substitution or version change), not synonyms. They are now shown that way in the inspector; `model.json` is unchanged.

| Species id | Model name (2019/2020 plans) | Alias as stored | Classification |
|---|---|---|---|
| `sp.amsonia-salicifolia` | *Amsonia tabernaemontana var. salicifolia* | Amsonia tabernaemontana 'Storm Cloud' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.anemone-hadspen` | *Anemone hupehensis* ‘Hadspen Abundance’ | Anemone x hybrida 'September Charm' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.aster-twilight` | *Eurybia macrophylla* ‘Twilight’ | Aster 'Twilight' | spelling / synonym of the same plant |
| `sp.echinops-veitchs-blue` | *Echinops ritro* ‘Veitch's Blue’ | Echinops bannaticus 'Blue Glow' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.geranium-raven` | *Geranium* ‘Raven’ | Geranium psilostemon / sanguineum 'Max Frei' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.helenium-kupferzwerg` | *Helenium* ‘Kupferzwerg’ | Helenium 'Sahin's Early Flowerer' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.helenium-moerheim` | *Helenium* ‘Moerheim Beauty’ | Helenium 'Potter's Wheel' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.papaver-matador` | *Papaver orientale* ‘Matador’ | Papaver orientale 'Patty's Plum' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.pennisetum-viridescens` | *Pennisetum alopecuroides* ‘Viridescens’ | Pennisetum viridescens | spelling / synonym of the same plant |
| `sp.phlox-blue-paradise` | *Phlox paniculata* ‘Blue Paradise’ | Phlox paniculata 'Fashionably Early Lavender Ice' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.sedum-matrona` | *Hylotelephium* ‘Matrona’ | Hylotelephium (Sedum) 'Pillow Talk' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |
| `sp.veronicastrum-cupid` | *Veronicastrum* ‘Cupid’ | Veronicastrum sibiricum 'Red Arrows' (2026 list) | different cultivar in the 2026 list — possible substitution or version change, **not a synonym** |

## Per-bed evidence (15 main beds)

Every column is the same kind of evidence for every bed, which is itself the finding: only outline and code are bed-specific facts; species and roles are style-level; positions are generated; real counts are style totals.

| Bed | Style | Area m² (OSM) | Placements (non-bulb / bulb) | Species in bed | Proxies | Outline | Code | Species + role | Patch / symbol positions | Real counts |
|---|---|---|---|---|---|---|---|---|---|---|
| A1 | A | 194.1 | 93 / 48 | 60 | 1,068 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| A2 | A | 226.7 | 109 / 56 | 60 | 1,321 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| A3N | A | 214.9 | 104 / 53 | 60 | 1,245 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| A3S | A | 180.2 | 86 / 45 | 60 | 997 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| A4 | A | 213.5 | 102 / 53 | 60 | 1,179 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B1 | B | 232.8 | 67 / 58 | 46 | 1,146 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B2 | B | 229.0 | 71 / 57 | 46 | 1,141 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B3N | B | 169.7 | 50 / 42 | 46 | 842 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B3S | B | 132.1 | 40 / 33 | 46 | 651 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B4 | B | 157.8 | 49 / 39 | 46 | 779 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| B5 | B | 238.6 | 72 / 59 | 46 | 1,187 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| C1 | C | 197.6 | 75 / 49 | 37 | 837 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| C2 | C | 124.6 | 46 / 31 | 37 | 502 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| C3 | C | 206.6 | 78 / 51 | 37 | 862 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |
| C4 | C | 217.6 | 82 / 54 | 37 | 922 | documented (OSM, ±0.5 m vs NAIP) | documented (2020 bulb plan) | documented per **style**, not per bed | schematic (generated) | unknown per bed; style total 2023 |

Bulbs: species + role from the 2020 bulb legends (style level), positions generated. Triangles (TN, TE): species list per style from 2026 list, arrangement **unknown** (open item from Phase 01).
