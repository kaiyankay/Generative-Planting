# Source register and reconstruction register

All coordinates are in the local frame `OGD-LOCAL-2026` (metres, x = east, y = north; see `MODEL_CONTRACT.md`).
Statuses: **documented** (taken from a source), **reconstructed** (derived from a source by a stated method),
**schematic** (placed by this model to show documented structure; not a survey), **unknown**.
`dataKind`: source / inferred / hypothetical. Machine-readable copy: `data/detroit/model.json → sources[]`.

## 1. Sources

| ID | Source | Date / access | Licence & what we publish | Used for |
|---|---|---|---|---|
| S-OSM | OpenStreetMap API extract, bbox around the garden (`sources/raw/osm_map.json`) | accessed 2026-11-26 | **ODbL 1.0**, © OpenStreetMap contributors — redistributed with attribution | 15 bed outlines + 2 triangle beds + Rain Garden basin (`leisure=garden, garden:type=botanical`), gravel walk area (relation 16191056), grass walks (relation 16191061), 3 retaining walls, Carillon (height 30 m), moat, Lake Tacoma, roads, parking, benches, International Peace Memorial |
| S-NAIP | USGS NAIP Imagery service (The National Map), ~0.6 m | accessed 2026-11-26; acquisition year not exposed by the service (shows the garden planted, meadows not yet converted) | **US public domain** — resampled copy published as `data/detroit/ortho.jpg` | Registration check of OSM geometry (visually within ~0.5 m); 29 existing tree crowns digitised by eye (`sources/curated/naip_tree_crowns.json`) |
| S-3DEP | USGS 3D Elevation Program, dynamic 1 m service, NAVD88 | accessed 2026-11-26 | **US public domain** — published as `terrain.bin` | Terrain, slope, contours |
| S-OGD-OVERVIEW | oudolfgardendetroit.org/garden-overview | accessed 2026-11-26 | © Oudolf Garden Detroit — facts cited, text not copied | Area/variety/plant statistics, design elements (steel edging, limestone walls, crushed granite walks, central axis, walkable lawns) |
| S-OGD-MAIN | oudolfgardendetroit.org/main-garden | accessed 2026-11-26 | © OGD — facts cited | 15 beds, three styles (Block A / Matrix B / Grouping C), Triangles (Matrix) listed separately, counts **as of March 2023**, 2019 redesign after record high water, planting 2020 |
| S-OGD-PL-2026 | Official Plant List, Feb 2026 (PDF) | Feb 2026 | © OGD — species names cited | Species per style; Sporobolus heterolepis named as the B-bed matrix grass; Rain Garden forbs & sedges |
| S-OGD-FA/FB/FC-2019 | Piet Oudolf, *Revised planting plans* A / B / C beds, Oct 2019, 1:100 | Oct 2019 | © Piet Oudolf / OGD — **not redistributed**; only legend facts (species, legend codes, legend grouping) cited | Species and role of each legend entry; key maps (style of every bed position) |
| S-OGD-BA/BB/BC-2020 | Piet Oudolf, bulb plans A / B / C, Sept 2020 | Sept 2020 | © Piet Oudolf / OGD — not redistributed | **Bed codes A1–A4, B1–B5, C1–C4** (A3 and B3 each label two beds), bulb species per style |
| S-OGD-RAIN | Rain Garden page, March 2020 trees & shrubs plan, stormwater inlet CAD | 2020–2023 | © OGD / Oudolf / InSite Design Studio — facts cited | 14 woody species and approximate counts per species (counted from the plan, ≈91 symbols vs. 89 official), stormwater figures, cobble swale |
| S-OGD-BIRD | Bird Border page + drawing | planted spring 2023 | © OGD — facts cited | 9 species, 45 plants, two staggered rows, along the parking area at the west end |
| S-OGD-MEADOW | Native Meadows page + East / West Meadow lists (Feb 2026) | opened Oct 2024 | © OGD — facts cited | Species lists with hydrology zones (as attributes), areas 0.38 + 0.87 acres, boardwalk in the east meadow |
| S-OGD-PHOTO-2023 | Official aerial photograph of the meadows (7-10-2023) | 2023 | © OGD — **viewed only**, not redistributed | Locating the meadows around the Carillon |
| S-MODEL | `tools/build_model.py` | this build | MIT (code) | Every generated arrangement, with seeds |
| Course slides | *Generative Planting at Scale* (Rainer, Landau, Liu; ASLA 2024) | 2024-10-07 | © ASLA — kept in `private-inputs/`, never published | Research framing only (see `SLIDES_TO_MODEL.md`) |

Not used: commercial basemaps or screenshots, the YouTube GIS tutorial (not needed once OSM + USGS were available).

## 2. Reconstruction epoch and version differences

- **Epoch modelled:** planting intent of the Oct 2019 revised plans + Sept 2020 bulb plans, placed on the **as-built** bed outlines (OSM). Not a survey of the garden today.
- 2019 legend names differ from the 2026 list for several cultivars (e.g. *Helenium* ‘Kupferzwerg’ → ‘Sahin’s Early Flowerer’, *Sedum* ‘Matrona’ → ‘Pillow Talk’, *Veronicastrum* ‘Cupid’ → ‘Red Arrows’, *Papaver* ‘Matador’ → ‘Patty’s Plum’). The model keeps the 2019 name and records the 2026 name in `aliases`.
- Bulb legends (2020) also differ from the 2026 list (e.g. *Narcissus* ‘Lemon Drops’ on the plan, ‘Sailboat’ on the list). The plan name is kept.
- Statistics are as of March 2023 and cannot be split per bed from the sources; per-patch numbers are labelled area-share estimates.
- Native Meadows (opened 2024) postdate the NAIP image used; their outlines are schematic.

## 3. Bed register (15 main beds + triangles + other planted areas)

Bed IDs are model IDs; `originalCode` is exactly as written on Oudolf's 2020 bulb plans.
Columns 1–8 run west → east; N/S = north or south of the diagonal cross walk.

| Model ID | Original code | Style | Col/row | Area m² | Outline | Status | Modelled placements (by role) |
|---|---|---|---|---|---|---|---|
| `bed.C1` | C1 | Grouping | 1N | 197.6 | OSM way/1197169313 | documented / source | group 47, individual 28, bulbs 49 |
| `bed.C2` | C2 | Grouping | 1S | 124.6 | OSM way/1197169305 | documented / source | group 29, individual 17, bulbs 31 |
| `bed.B1` | B1 | Matrix | 2N | 232.8 | OSM way/1197169312 | documented / source | matrix 1, group 38, emergent 25, scatter 3, bulbs 58 |
| `bed.B2` | B2 | Matrix | 2S | 229.0 | OSM way/1197169304 | documented / source | matrix 1, group 42, emergent 25, scatter 3, bulbs 57 |
| `bed.A1` | A1 | Block | 3N | 194.1 | OSM way/1197169311 | documented / source | block 58, emergent 35, bulbs 48 |
| `bed.A2` | A2 | Block | 3S | 226.7 | OSM way/1197169303 | documented / source | block 68, emergent 41, bulbs 56 |
| `bed.B3N` | B3 | Matrix | 4N | 169.7 | OSM way/1197169310 | documented / source | matrix 1, group 28, emergent 18, scatter 3, bulbs 42 |
| `bed.B3S` | B3 | Matrix | 4S | 132.1 | OSM way/1197169302 | documented / source | matrix 1, group 22, emergent 14, scatter 3, bulbs 33 |
| `bed.A3N` | A3 | Block | 5N | 214.9 | OSM way/1197169309 | documented / source | block 65, emergent 39, bulbs 53 |
| `bed.A3S` | A3 | Block | 5S | 180.2 | OSM way/1197169301 | documented / source | block 54, emergent 32, bulbs 45 |
| `bed.C3` | C3 | Grouping | 6N | 206.6 | OSM way/1197169308 | documented / source | group 49, individual 29, bulbs 51 |
| `bed.C4` | C4 | Grouping | 6S | 217.6 | OSM way/1197169300 | documented / source | group 51, individual 31, bulbs 54 |
| `bed.B4` | B4 | Matrix | 7N | 157.8 | OSM way/1197169307 | documented / source | matrix 1, group 28, emergent 17, scatter 3, bulbs 39 |
| `bed.B5` | B5 | Matrix | 7S | 238.6 | OSM way/1197169299 | documented / source | matrix 1, group 42, emergent 26, scatter 3, bulbs 59 |
| `bed.A4` | A4 | Block | 8S | 213.5 | OSM way/1197169298 | documented / source | block 64, emergent 38, bulbs 53 |
| `bed.TN` | — | Triangles (Matrix) | NE corner | 5.7 | OSM way/1197169306 | reconstructed / inferred | grass matrix (species unknown), woody (species unknown) |
| `bed.TE` | — | Triangles (Matrix) | E end | 228.6 | OSM way/1197169291 | reconstructed / inferred | grass matrix (species unknown), woody (species unknown) |
| `bed.RG` | — | Rain garden basin | W | 406.9 | OSM way/1197169292 | documented / source | trees + shrubs (14 species), perennial groups, sedge matrix |
| `bed.MW` | — | West Meadow | S-W | 1537.8 | schematic | schematic / inferred | meadow mix (56 listed taxa) |
| `bed.ME` | — | East Meadow | S-E | 3520.8 | schematic | schematic / inferred | meadow mix (76 listed taxa) |

Counts: A = 5, B = 6, C = 4 → **15 main beds** (tested). The two triangle beds are *not* counted in the 15; identifying them with these two OSM beds is an inference from position (the official page lists "Triangles (Matrix)" without a plan).

## 4. Accuracy by region

| Region / object | Geometry | Planting content | Notes |
|---|---|---|---|
| 15 main beds — outline | high (OSM, checked on NAIP) | — | Steel edging rendered on every outline |
| 15 main beds — style & code | high (key maps, bulb plans) | — | A3/B3 split into N/S by position |
| Inside A / B / C beds | patch shapes **schematic** | species + role **documented**; position **generated** | Block = Voronoi mosaic; Matrix = Sporobolus base + groups + emergents + scatter; Grouping = rounded groups + individuals. Not a tracing. |
| Bulbs | drift shapes schematic | species documented (2020) | Bloom state not modelled |
| Triangles | outline high | counts documented, species **unknown** | Neutral proxies |
| Rain Garden | outline high | woody species + approximate counts documented; positions generated | Cobble swale route schematic |
| Bird Border | alignment **schematic** | 9 species / 45 plants documented; sequence generated | |
| Native Meadows | outline **schematic**, area matched to official acreage | species documented, arrangement unknown | Hydrology zones are attributes only |
| Walks, walls, roads | medium–high (OSM; road widths inferred from lanes) | — | Wall height not published (3D shows 0.45 m above grade, labelled) |
| Terrain | 1 m 3DEP | — | Site scale only; 3D shows ×1.6 vertical exaggeration |
| Existing trees (29) | crowns ±1.5 m (NAIP, by eye) | species & height **unknown** | Display height scaled from crown |
| Sun, soil moisture, pH | **unknown** | — | Returned as `null` + `unknown`, never 0 |

## 5. Public vs. local

The public repository contains no Oudolf drawing, photograph, plant-list PDF or class slide, and no geometry traced from them. Everything inside the beds is generated from citable facts (species names, legend roles, counts, bed codes). The originals are kept only in the git-ignored `private-inputs/` folder on this machine. A future local-only layer could hold traced patch geometry for comparison; none was produced in this phase.
