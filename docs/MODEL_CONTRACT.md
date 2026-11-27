# Model contract — `generative-planting/spatial-model` v0.3 data · runtime API 0.6 (Phase 01.3, computational space)

One JSON document (`data/detroit/model.json`) plus two binary buffers. The 2D plan, the 3D scene and any AI client read the same data; no view owns geometry.

```
data/detroit/
  case.json       case settings (Phase 01.1): path types for distance queries, editable planting units, blank-canvas scope
  model.json      canonical model (project, sources, layers, objects, species, recipes, placements, fields)
  instances.bin   plant instances, 16 bytes each (seeded, stable)
  terrain.bin     Int16 elevation grid (cm above datumZ), 1 m
  terrain.json    grid metadata (also embedded as fields[field.elevation])
  ortho.jpg       USGS NAIP resampled to the local frame (public domain, optional underlay)
```

## Coordinates

- Frame `OGD-LOCAL-2026`, metres. **x = east, y = north**, z = elevation (NAVD88, USGS 3DEP).
- Origin: WGS84 42.3357458, −82.9886728 (OSM point of the Main Garden). Local tangent plane, WGS84 radii at the origin; < 2 cm distortion over the 360 × 260 m extent (`tools/geo.py` has `to_local` / `to_latlon`).
- Geometry is GeoJSON-shaped (`Polygon`, `MultiPolygon` with holes, `LineString`, `Point`, `MultiPoint`) in local metres, snapped to 1 mm and validated.
- three.js is y-up: `three(x, y, z) = (x, (elevation − datumZ) × 1.6, −y)`. The ×1.6 vertical exaggeration is display only.

## Records

| Collection | Key fields |
|---|---|
| `project` | caseId, version, reconstructionEpoch, coordinateSystem (origin, axes, extent, datums), uncertainty, officialStatistics, attribution |
| `sources[]` | id, title, url, accessed, license, public |
| `layers[]` | id, parent, name, kind, order, **visible**, **locked**, **selectable**, opacity, status (`available` / `unavailable`) — visibility, editability and planting constraints are separate fields |
| `objects[]` | id, type (site, district, bed, path, wall, water, road, parking, building, tower, monument, bench, boardwalk, swale, lawn, tree, edging), name, layer, parent, geometry \| geometryRef, props, sourceRefs, status, dataKind, confidence |
| `species[]` | id (`sp.*`), index, scientificName, cultivar, canonicalKey, plantType, aliases, formProxy, nominalHeightM/SpreadM, displayFlower/Leaf, `inferredFields`, phenology (null), temporal{…} (null) |
| `recipes[]` | id (`mix.*`), style, version, components[{legendCode, speciesIds, role}], sourceRefs, notes, roleNote |
| `placements[]` | id (`pl.*`), index, bedId \| districtId, recipeId, kind (area / point / scatter), role, legendCode, speciesIds, geometry \| geometryRef, areaM2, countEstimatedReal, countBasis, countModelled, instanceRange, positionSource, status, dataKind |
| `fields[]` | elevation (source), slope (derived), distance-to-path (derived), sun / moisture / pH (**unknown**) with units, resolution, validExtent |

Hierarchy: `site → district → bed → placement → plant instance`. Placements may overlap (matrix + groups + emergents + bulbs share space); a point can hold several species.

### Instances (`instances.bin`)

`float32 x, float32 y, uint16 speciesIndex, uint16 placementIndex (65535 = none), uint8 scale×100, uint8 rotation×255/2π, uint16 pad`, little-endian, sorted by placement so `placement.instanceRange = [start, count]`. A runtime plant has id `pi.<n>`.
Instances are **visual proxies** (≈0.42 per real perennial, ≈0.12 per bulb, 1 per woody plant), generated with fixed seeds; rebuilding gives byte-identical output (tested). They are not surveyed positions.

## Status vocabulary

- `status`: documented · reconstructed · schematic · unknown · draft (working design only)
- `dataKind`: source · inferred · hypothetical
- Unknown values are `null` with `status: "unknown"`, never 0. Display-only inferences are listed in `species.inferredFields`.

## Site, reference design, working design, view state (Phase 01.1)

One coordinate frame, four concepts (not four files):

| Concept | Where | Mutable? |
|---|---|---|
| **Site** — boundary, terrain, paths, walls, water, buildings, existing tree crowns, lawn | `objects[]` (types other than placements) + `terrain.bin`; existing trees = instances with no placement (`siteveg.trees`) | never edited by a planting draft (`E_READONLY`) |
| **Planting framework** — bed outlines and codes, districts | `objects[]` type `bed` / `district` | constraint for drafts; not editable in this phase |
| **Reference design** — the schematic reconstruction | `placements[]` + `instances.bin`, frozen (deep-frozen JSON, reference instance table never written; file hashes tested) | no |
| **Working design** — editable draft | runtime copy: its own placements, instance table, spatial index; persisted per browser as a replayable op list | yes, through validated patches only |
| **View state** — mode Reference / Canvas / Terrain, layer visibility / lock, hide-planting, selection, camera | UI only | never changes data |

- `createDraft({from:'reference'})` copies the reference; `createDraft({from:'blank', scope})` clears the active placements (and their proxies) of the listed planting units. Default scope = the 15 A/B/C beds; triangles, Rain Garden, meadows and Bird Border only when listed. Site trees, lawn, paths and the bed framework always stay. `blankScopePreview(scope)` reports what would be cleared **before** anything happens.
- *Hide reference planting* and *Terrain* are view filters: data, counts and constraints are untouched. *Start new planting design* really removes the active planting in scope from the working design (queries and counts no longer return it); the reference keeps it.
- Instance ids `pi.<row>` are stable within a scenario: removing marks the row dead, adding appends new rows (`pi.20788…`), replacing keeps the row and changes its species. Reference rows are never written.

## Query and edit API (`window.GP`, also usable by importing `src/model.js`)

| Call | Returns |
|---|---|
| `getObject(id)` | object, placement, species, recipe, source, or a live plant instance (`pi.N`) of the active scenario |
| `getBedAt(x, y)` | bed containing the point (boundary included) or null |
| `query(geometry, filters)` / `queryObjects(…)` | exact spatial query on the active scenario, see semantics below. `query` returns `{ok, scenario, exact, predicate, radius, results}`; `queryObjects` returns the array (throws on invalid input) |
| `queryInstances(geometry, filters)` | plant-instance records (same semantics) |
| `sampleConditions(x, y)` | elevation, slope, distance-to-path (value, units, status, **definition**, source), sun / moisture / pH = null + unknown, `inExtent`, bed, overlapping placements, objects at the point, `constraints.plantable` |
| `plantableAt(x, y)` | `{value, unitId, reason, editLocked}` — independent of visibility and UI lock |
| `getPlantingContext(id)`, `speciesTally({bedId})`, `instancesOfPlacement(id)` | context / counts of the active scenario |
| `createDraft(o)`, `blankScopePreview(scope)`, `draftInfo()`, `draftSummary()` | working-design lifecycle |
| `applyPatch(ops, {dryRun})` | validated, atomic batch on the working design (below) |
| `setEditLock(id, on)` | model-level edit lock on a planting unit or placement (separate from the UI layer lock) |
| `resetDraft()`, `discardDraft()`, `diffDraft()` | back to the draft's starting point / drop it / list of applied ops |
| `exportDraft()`, `exportModel({draft:true})`, `importDraft(obj)` | working design with **instance state** (removed rows, species changes, added rows, fingerprint); import replays the ops and checks the fingerprint |
| `setMode('reference'|'canvas'|'terrain')`, `setView('3d'|'plan'|'layers')`, `openLayer(group, {overlays})`, `closeLayer()`, `focusLayer(group)`, `layerGroups()`, `setLayer`, `setLayerGroup`, `setOverlay` | view state (never changes data) |

### Spatial query semantics

- Geometry: `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`, `MultiPolygon` (holes respected), optional `radius` in metres (matches objects within that distance). `{bbox:[x0,y0,x1,y1]}` is an **exact** rectangle; `{bbox, candidates:true}` is broad phase only and every result carries `exact:false`.
- Predicates: `intersects` (default) — closed sets, so boundary contact counts; `within` — every point of the object in the query area. Tolerance 1 mm (the model's snapping precision).
- Filters: `collection` (`objects` default, `placements`, `instances`), `type`, `layer`, `style`, `role`, `speciesId`, `bedId`, `limit`.
- Placements overlap (matrix + groups + emergents + bulbs): a point can return several; nothing is forced into one-plant-per-cell.
- Units: x/y metres in OGD-LOCAL-2026, z metres NAVD88. The 3D vertical exaggeration (×1.6 by default, ×1 with `?vex=1`) is display only. The DEM is 1 m; 0.25 m contours are interpolated isolines, not a finer survey.
- Distance to path = planar distance to the nearest object whose `type` is listed in `case.json → pathTypes` (Detroit: `path` → gravel walks, grass walks, sidewalks); 0 inside.

### Patch operations

```js
{ op: 'replaceSpecies', target: 'pl.*', speciesIds: ['sp.*', …], legendCode? } // keeps proxy rows, changes their species (2D, 3D, queries follow);
                                                                              // clears the old legend code, records `replaced: {speciesIds, legendCode}`
{ op: 'set', target: 'pl.*', path, value }   // path ∈ speciesIds | role | legendCode | note | countEstimatedReal | symbolRadiusM
{ op: 'remove', target: 'pl.*' }                                              // placement + its proxies leave model, index, render
{ op: 'add', collection: 'placements', value: { id?, bedId | districtId, role, speciesIds, geometry: Point | (Multi)Polygon, legendCode?, note? } }
```

- Checked before anything is written: target exists in the working design and is a placement (site objects → `E_READONLY`), path whitelisted and free of `__proto__` / `constructor` / `prototype` (`E_PATH`), species exist (`E_SPECIES`), role in the vocabulary (`E_ROLE`), geometry valid (`E_GEOMETRY`), inside the planting unit (`E_OUTSIDE`), not on a path / water / structure even if that layer is hidden (`E_NOT_PLANTABLE`), unit / placement not edit-locked (`E_LOCKED`), id format and uniqueness (`E_ID`).
- All-or-nothing: the batch runs on a staged copy; any error returns `{ok:false, errors:[{index, op, code, message}]}` and the working design is unchanged. `dryRun:true` validates only.
- Success returns `{ok:true, rev, applied, changes:{placementsAdded, placementsRemoved, placementsModified, instancesAdded:[pi.*], instancesRemoved, instancesChanged}}`.
- Added placements get seeded proxies (seed = placement id; same density rules as the build), `status:'draft'`, `dataKind:'hypothetical'`, `positionSource:'draft'`.
- No draft yet → `applyPatch` creates a copy of the reference first (`draftCreated:true`). The UI layer lock is **not** a model permission; use `setEditLock`.

Example (the Phase 01.1 acceptance flow):

```js
GP.createDraft({ from: 'reference' })
const g = GP._store.model.placements.filter(p => p.bedId === 'bed.B1' && p.role === 'group').sort((a, b) => b.areaM2 - a.areaM2)[0]
GP.applyPatch([{ op: 'replaceSpecies', target: g.id, speciesIds: ['sp.achillea-moonshine'] }])   // 2D symbols, 3D forms, tallies, queries change
GP.speciesTally({ bedId: 'bed.B1' })
GP.applyPatch([{ op: 'remove', target: 'pl.B1.e01' }])
GP.resetDraft()                                                                                   // back to the reference rows exactly
```

The renderer is never an input: an AI proposes operations on the model; the views re-render from it.

## Site setup as a component (Phase 01.2)

This viewer is the **Site setup / Spatial input** module of Generative Planting, not a standalone product. A site is a **preset**:

```
data/presets.json   { presets: [{ id, name, location, base: "data/<site>/", designer?, status }] }
```

`?site=<id>` picks one (default: the first). Every preset folder has the same files (`model.json`, `instances.bin`, `terrain.bin`, `case.json`).

**Two axes, never mixed.** *Design* — `reference` (read-only reconstruction) | `working` (editable) — is chosen in the bar. *View* — `axo` | `plan`, show filter `all` | `site` | `terrain`, one layer group alone (`solo`, in plan) with trace overlays, optional `layers` (exploded) — is chosen on the canvas. View calls never change data.

**Canonical axonometric.** Orthographic camera 20° east of south, 35° above the horizon (`Scene3D.AXO`), framing the designed garden; the entry view and the target of Fit. Axo and Plan hand the same centre and scale to each other.

**Embedding.** `index.html?embed=1` hides the product and module name (the host workflow shows those) and keeps the site chip, the design selector and the canvas. The host talks to the component only by `postMessage`:

```js
// host → component (only whitelisted, plain-data methods; anything else returns ok:false)
frame.contentWindow.postMessage({ gp: 'call', id: 1, method: 'solo', args: ['composition', { overlays: { framework: 0.5 } }] }, '*')
// component → host
{ gp: 'result', id: 1, ok: true, value: … }            // or { ok: false, error }
{ gp: 'event', type: 'ready' | 'view' | 'design' | 'solo' | 'selection', detail: … }
```

Bridged methods: `site, sites, getObject, getBedAt, queryObjects, query, sampleConditions, getPlantingContext, plantableAt, speciesTally, instancesOfPlacement, design, setDesign, createDraft, blankScopePreview, draftInfo, draftSummary, applyPatch, resetDraft, discardDraft, exportDraft, importDraft, diffDraft, viewState, setView, setViewFilter, setExploded, setPanel, fit, solo, exitSolo, setOverlay, layerGroups, setLayerGroup, select, selection`. In the page, the same object is `window.GP` (plus `on(type, fn)` for events). `tools/embed_check.html` is a QA fixture that exercises the bridge.

Phase 01.1 calls keep working: `setMode('reference'|'canvas'|'terrain')` maps to design + show filter, `setView('layers')` to the exploded view, `openLayer` / `closeLayer` to `solo` / `exitSolo`.

## Computational space (Phase 01.3)

Five model levels — base site, planting framework, environmental fields, computational space, planting design —
and the API for the first four (domains, distributions, zones, sampling, queries) are specified in
[COMPUTATIONAL_SPACE.md](COMPUTATIONAL_SPACE.md). Levels 1–4 never read the planting design.
API 0.6 adds: `spatialModel, fields, field, domain, cells, distribution, classify, computeZones, computation,
clearComputation, zoneAt, queryZones, sampleAt, samplePoints, registerHypotheticalField, unregisterField,
openConditions, closeConditions, conditions, setConditionScope, showField, showZones, hideConditionDisplay,
setConditionRules, startBlank, enter, entered` (all plain-data ones are on the `postMessage` bridge).
`getPlantingContext(bedId).conditionsInBed` is the distribution over the bed.

Edit-API fix found by the carrying test: an area patch running along a bed edge was refused as "overlapping a path"
when the bed sits in a hole of the path polygon (the old interior test only measured the outer ring). The test is
now exact — area of patch ∩ obstacle (polygon-clipping, holes included) > 1 cm² — so edge contact is allowed and a
patch over the East Meadow boardwalk is still refused.

## URL states

`index.html?site=detroit&view=axo|plan|layers&design=working&filter=site|terrain&solo=<group>&overlay=<group>:<opacity>,…&panel=1&layer=<group>&sel=<id>&focus=1&z=<zoom>&at=x,y&details=1&about=1&layers=+topo.contours,-veg.trees&vex=1&dev=1&embed=1`
reproduces a view (`layer` with `view=layers` focuses a plate). Screenshot-only helpers: `draft=blank|copy|demo`, `then=reference`, `newdesign=1`. Older URLs (`view=3d`, `mode=canvas|terrain`, `layer=` with `view=plan`) still resolve. Layer groups: `terrain, infrastructure, siteveg, framework, composition, representation, analysis`.

## Adding a second case

1. Copy `tools/geo.py` with a new origin and extent; run `tools/fetch_sources.py` for OSM + USGS (or supply local survey data in the same frame).
2. Write a `curated_<case>.py` with species (`sp()`), legends (role per recipe) and official statistics.
3. Adapt the bed register in `build_model.py` (OSM ids → model ids, codes, styles) and run it; run `tools/test_model.py`.
4. Write `data/<case>/case.json` (path types, editable planting units, blank-canvas scope) and point the viewer at `data/<case>/` (one constant in `src/app.js`). Nothing in the viewer is Detroit-specific except the home camera, the layers-overview crop and a few object ids used for drawing (water, paths).
