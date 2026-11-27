# Integrated Prototype — algorithms as implemented

Everything below is the code in `src/flow/` on branch `feature/integrated-prototype`. Numbers marked *prototype default* are
implementation choices disclosed as assumptions, not validated standards. Units: model metres (x east, y north),
z = USGS 3DEP elevation (NAVD88).

## 0. One project state

`src/flow/project.js` — `gp.project/1`, localStorage `gp.flow.project.v1`.

```
{ siteId, name, stage, maxStage, brief, beds{bedId:{logic, params, adaptation, cellIds}}, cells{id:SpatialCell},
  mixes[Mix], assignments{cellId:{mixId, mixVersion, origin: manual|auto|remap, seed, overrides, status}},
  instances{cellId:{target, requested, placed, missing, notes, plants:[{x,y,plantId,role,spacing}]}},
  knowledge{records[], prefs[]}, plants[runtime plants], acknowledged{cellId:{empty}}, view{month, explore, camera…} }
```

* Every gesture is one `commit(label, fn)`: a deep snapshot of the design part goes on the undo stack (60 steps), the
  change is applied, affected cells are re-arranged, the model draft is patched, performance recomputed, the project
  saved. Undo / redo restore the snapshot and rebuild the draft.
* The **model working draft** (`ModelStore`, used by the plan, the existing 3D scene and picking) is *derived*: a blank
  draft whose scope is exactly the structured beds (every other bed keeps the reference planting), plus one placement of
  kind `plants` per planted cell (`pl.dz.<cell>`, one row = one plant, validated by the model's own patch check:
  inside the bed, not on a path / water / structure). 2D and 3D read these rows; there is no second copy.
* Persistence stores the plant positions themselves (≈ 285 KB for 2,000 plants). If storage is full the positions are
  dropped and rebuilt from their seeds on load (deterministic), and the status says so; if storage refuses entirely the
  status says "not saved" and suggests export. View changes (month, view, camera) never touch the design.
* Snapshots (`gp.flow.snapshots.v1`, 8 max) keep the design without plant rows + a fingerprint + the performance summary.

## 1. Spatial Logic engine (`spatial.js`)

Input: the bed's **plantable geometry** = bed outline − every non-plantable object inside it (`store.unitBlockers`:
paths, walks, water, structures), the shared site query (below) and the brief's objectives.

Site query (`project.context()`, the same one any AI client would read): elevation (3DEP 1 m, bilinear), slope,
distance to the nearest path (OSM), tree crown above (NAIP crowns). **Sun, soil moisture, pH: unknown** — never sampled,
never 0. Layer visibility does not change the query (tested).

Reference directions, all from real geometry:

| reference | how |
|---|---|
| path edge | bed outline edges whose midpoint is ≤ 2 m from a path; length-weighted doubled-angle mean |
| long axis | second moments of the outline (length-weighted) |
| contours | least-squares plane of elevation samples in the bed; direction ⟂ gradient; used only if relief ≥ 0.3 m |

Pattern families:

* **Honeycomb** — hex lattice (centre spacing = size), rotated, three lattice offsets; vertices snapped to 10 µm so shared
  edges are identical.
* **Bands** — parallel strips `size` wide stacked across the reference direction, two offsets; every band cut into equal
  segments ≈ 3 × width long (*prototype default*), so a band becomes numbered cells.
* **Organic patches** — n = round(area / size²) seeds by deterministic dart throwing inside the bed (min distance 0.7 ×
  size), 2 steps of bounded Lloyd relaxation (≤ 0.5 × size per step), Voronoi by half-plane clipping, clipped to the bed;
  6 seed layouts. Edges are straight (no smoothing, so shared boundaries stay exact).

Clip and fragment rule: every tile ∩ plantable geometry; each disjoint part is a candidate cell. A part < 30 % of a full
cell merges into the neighbour with the longest shared boundary; an isolated part < 1 m² is dropped and its area
reported. A failed boolean never loses geometry (fallback keeps both parts).

Candidates and ranking (hard validity first, then a documented score, lower = better):

```
score = 2·sliver + 0.6·size irregularity (CV of cell areas) + w·mixed site conditions + v·path misalignment + 0.3·count deviation
  sliver            = (merged + dropped fragment area) / bed area
  mixed conditions  = Σ cell area × (1 − majority share of known site classes in the cell) / bed area
                      classes: crown above yes/no · ≤ 1 m from a path · elevation tercile (only if relief ≥ 0.3 m)
  path misalignment = angle to the path-edge direction / 90° (bands, honeycomb)
  w = 1.2 if Plant suitability is on, else 0.3 ;  v = 1.5 if Connected resources is on, else 0
```

Candidate set: sizes {3.5, 4.5, 5.5} m (honeycomb, organic) / {2.5, 3.5, 5} m (bands) unless you set one; angles = the
reference directions (+ 0/15/30/45° for the hex lattice) unless you set one; offsets / seed layouts as above. Ties:
size, then angle, then offset, then seed. The chosen parameters, the reason in words, notes (no path / flat bed /
merged fragments) and the top 6 candidates with their terms are stored with the bed and shown under "Candidates
compared". No pollinator-specific geometry is claimed: the continuity objective acts only through path alignment
(structural proxy).

Cells: ids `c.<bed>.<n>` numbered in reading order along the pattern (stable for the same input — tested); area;
label point; neighbours (shared boundary ≥ 0.3 m); conditions sampled on a ≤ 1 m grid inside the cell (elevation,
slope, path distance: min/mean/max + coverage; crown: open / mixed / under crown + fraction; sun / moisture / pH listed
as unknown). Cells of different beds ≤ 3 m apart (a path width) are linked as "near" for the continuity proxy only.

Changing a committed bed: preview first; impact = old cells with mixes and plants; on confirm each new cell takes the
mix of the old cell it overlaps by ≥ 50 % ("remap"), the rest start unassigned, or "Replace and clear mixes". Other beds
are never touched.

## 2. Active Knowledge (`knowledge.js`)

Scopes: **foundation** (`knowledge/data/seed.json` through the existing PlantLibrary; a record applies only if its
place is the project place, inside it or a region containing it), **site list** (hydrology printed on the official meadow
lists), **project** (records added in this design, stored in the project, facts and preferences apart), **personal**
(IndexedDB `gp-knowledge`, the same event log as the Knowledge workspace), **illustrative** (`data/detroit/teaching-traits.json`,
switchable, labelled "not verified"). Precedence when sources disagree: personal > project > foundation > site list >
illustrative, unless the designer chose a source for that trait in this project (a scoped preference). Disagreement is
reported as `conflict` with the alternatives; nothing is overwritten globally.

Traits read per plant: flowering months, pollinator groups, flower resource (wind-pollinated = not a resource),
light (sun / part / shade), moisture (dry / moist / wet), role hint. Spread and height are the display proxy of the
model (labelled as such). A species-level record is never applied to a cultivar (PlantLibrary rule, unchanged).

Writing knowledge from the design: a bounded note parser (month names and ranges, group names, light and moisture
words, avoid / prefer) proposes claims; the designer ticks / corrects them and picks the scope: this project, my
knowledge (personal, Detroit scope, visible in the Knowledge workspace) or a note on the mix (not used in calculations).
The original words are kept with every record; records are "observation, not verified" — no external verification step
is required. New plants beyond the catalogue: a project plant `sp.x-<name>` with a generic display proxy (labelled),
registered at runtime in the model (never written to `model.json`).

## 3. Mix contract and reasoning (`mix.js`, `suggest.js`, `llm.js`)

Mix: `{id, version, name, color, members:[{plantId, role, proportion, constraints}], density:{value, unit:'plants/m²'},
spacing basis, rationale, knowledgeRefs, conditions, uncertainty, origin, sourceMixId, history}`. Proportions are
**shares of individual plants** and must sum to 100 % (validated; "Balance" normalises with largest remainder at
0.1 %). Roles: matrix, structure, seasonal, filler, ephemeral. Density default 4.5 plants / m² (*prototype default*).
Every edit = version + 1 with a one-line summary; a local variant records its source mix and version. Detroit legend
recipes (`mixes.json`) convert to reusable mixes: base role count / m² = share / (0.866 × spacing²), overlay = its
density, ephemeral = coverage × density in drift; species split by weight (equal weights are an assumption).

**Rules mode suggestion** (offline, deterministic):
1. Target summary of the chosen cells: area, crown share → light class (open / mixed / under crown); moisture unknown.
2. Candidates: herbaceous catalogue plants (no trees, shrubs or plants with nominal spread > 1.2 m — a shrub at an individual
   share would take most of a cell; woody plants are added by hand) minus "avoid" preferences; light conflicts are excluded, plants with
   unknown flowering or light are listed separately as uncertain.
3. Three variants by greedy marginal coverage of the brief's (month × pollinator group) pairs (months only if groups are
   off): *season-long*, *early and late* (end months weighted ×2), *structure-led* (two structural plants first). Up to 7
   flowering members; one or two matrix grasses at 35 % of plants; remaining shares by role weight.
4. Each recipe carries coverage months, gaps (brief months with no known flowering member), unknowns, how many members
   use illustrative values, and the evidence ids of the values used.
5. If fewer than three plants with known flowering fit, no recipe is proposed: guidance instead.

**Rules mode edit** (bounded parser): add / remove / replace a named plant; more / less grass (matrix share ×1.3 / ×0.7);
keep the matrix (matrix shares fixed); more spring / summer / autumn bloom or more for a pollinator group (adds the best
plant with known flowering in those months, raises members already flowering then ×1.25). The result is a **patch
preview**; anything else is answered "Not interpreted in Rules mode".

**Language-model path**: one adapter (`MixReasoner`). The browser never holds a key; it calls `api/flow/llm/*` on the
local server (`tools/flow_server.py`), which answers only if the `anthropic` package, `ANTHROPIC_API_KEY` and
`GP_CLAUDE_ALLOW_CALLS=1` are all present (Claude Sonnet 5.5, structured JSON output, server-side refusal fallback).
The request carries the brief, cell summaries, candidate plants with their traits and evidence ids, preferences,
existing mixes and the instruction. Every answer is validated: known plant ids, valid roles, proportions sum to 1 (±0.02),
evidence ids must be ones the request supplied (an invented id refuses the answer), no coordinates / counts / scores.
Timeout (45 s), HTTP error or invalid answer → the work is untouched and the Rules-mode result is offered. On this Mac
and on static hosting none of the gates is open: **the live path has never been exercised with a model.**

## 4. Composition (`compose.js`) and arrangement (`arrange.js`)

Compatibility of a mix in a cell: per member, light requirement vs crown above the cell (known match, **soft** conflict —
"crown above = probable shade" is stated as an inference —, or unknown); moisture always unknown on this site. Hard
exclusions are geometric and applied in the arrangement; soft conflicts can be kept with a recorded override.

**Auto Compose** (greedy, deterministic): repeatedly take the (unassigned scope cell, mix) pair with the largest

```
coverage (new month × group pairs in the design within the brief months)
+ continuity (0.15 per neighbour cell already offering a resource in a month this mix also covers; only if the objective is on)
+ balance (0.3 per brief month offered by < 20 % of assigned cells)
+ variety (0.2 × share of assigned cells NOT using this mix — a tie-breaker)
− conflict (2 × share of members with a soft conflict + 0.5 × share with unknown light; 0.5 × conflict share if suitability is off)
```

ties by cell id, then mix id. Cells that already have a mix are never proposed. The proposal is previewed on the canvas
(dashed fills) with a reason per cell and applied as one undoable step.

**Arrangement of one cell** (seeded by cell, mix id, mix version, assignment seed):
* usable area = cell area − 0.6 m trunk clearance discs of existing tree centres inside the cell;
  target N = round(usable area × density); counts per member by largest remainder (sum exactly N).
* order: structure → seasonal (clusters of ≈ 4) → filler (pairs) → matrix (fills what is left) → ephemeral (own layer).
* positions: best-of-10 candidate sampling inside the cell, ≥ 0.12 m from its edge, off trunks; soft spacing
  0.5 × (sᵢ + sⱼ) with s = nominal spread × role factor (structure 1.0, seasonal 0.8, filler 0.7, matrix 0.7,
  ephemeral 0.4). If a plant does not fit, spacing is relaxed to ×0.75 then ×0.5 (counted); if it still does not fit it is
  reported as not placed (requested vs placed per plant) — counts are never reduced silently.
* only affected cells are re-arranged after an edit; z is read from the terrain for display and export.

## 5. Performance (`performance.js`) — proxies from placed plants

| measure | definition |
|---|---|
| resource (cell, month) | ≥ 1 placed species known to flower that month and not known to be wind-pollinated. Presence proxy, not nectar quantity or abundance |
| uncertain | no known resource but some placed species has unknown flowering — never shown as "no resource" |
| share | resource cell area / assigned cell area, per month |
| groups | union of documented pollinator groups of the flowering species (association, not visits) |
| continuity | connected components of resource cells over neighbours (shared boundary ≥ 0.3 m) and near links (≤ 3 m across a path); isolated cells. Potential continuity, not insect movement |
| seasonality | per placed plant: flowering / not / unknown in the month (known months only, no growth model) |
| adaptability | light match / conflict / uncertain per cell from compatibility; moisture never claimed |
| coverage | share of placed plants whose flowering / groups / light are known, and how many use illustrative values |

Issues (actionable): brief month with no known resource (gap or uncertain) → Edit mix / Add knowledge; isolated
resource cells → Reassign; light conflict → Edit mix / Reassign; cells without a mix → Reassign; placed plants with
unknown flowering → Add knowledge. Each issue carries its cells, mix and species, and its action returns to Compose (or
Structure) with that selection.

Comparison with a snapshot is shown only when the metric version matches; a different knowledge version is flagged.
