# Computational Space — data structure and API (v0.1)

The site is a space that can be sampled, queried, overlaid and classified **before any planting exists**.
Module: `src/compute.js` (`ComputeSpace`), configuration: `data/compute.json`, panel: `src/conditions.js`,
painter: `paint.js › paintCompute` (the same painter draws the plan and the 3D ground texture).

## Five model levels (data relations, not pages)

| Level | What | Where it lives | Reads level 5? |
|---|---|---|---|
| 1 Base site | USGS 3DEP 1 m terrain, paths, walls, structures, water | `model.json` objects + `terrain.bin` | no |
| 2 Planting framework | the 20 real bed outlines (15 main A/B/C beds + triangles, Rain Garden, meadows): id, geometry, area, coordinates | `model.json` objects of type `bed` | no |
| 3 Environmental fields | elevation, slope, distance to path, distance to bed edge, distance to wall / structure, tree crown above; sun, moisture, pH = unknown | `ComputeSpace` field samplers, `data/compute.json` | no |
| 4 Computational space | lattice, bed domains, distributions, zones, sampled positions | `ComputeSpace` | no |
| 5 Planting design | reference / working placements and plant symbols | `ModelStore` scenarios | — |

`GP.spatialModel()` returns the five levels and their state. Levels 1–4 never read level 5: with every design bed
empty (blank working design) the distributions and zones are byte-identical (tested).

## Lattice

* One grid for the whole site, aligned with the DEM: origin = DEM origin (−200, −150), cell (c, r) is centred on
  DEM node (c, r), cell size = 1 m = the DEM resolution.
* `cellSize` may be a whole multiple of 1 m (2 m, 3 m …). **Finer than 1 m is refused** (`E`: "finer than the terrain
  data") so the grid never suggests a precision the sources do not have.
* Coordinates: the model's local metres (OGD-LOCAL-2026, x east, y north). Every field is sampled in this system.

## Domain (a bed as a computational unit)

A domain is the set of cells of one bed. Each cell that the bed outline crosses is clipped to the bed
(Sutherland–Hodgman against the cell square, exact area), so:

* cell parts of a bed add up to the bed's area exactly (all 20 beds: difference < 1 mm²);
* a cell straddling two beds is two cell parts, each with its own bed id;
* whole cells are found by an even–odd scanline, only boundary cells (grid traversal of the outline) are clipped;
* non-plantable objects inside the bed (boardwalk, swale, road edge) are cut to the bed once; cells whose
  representative point lies in one are `plantable: false`.

Per cell: `bedId, c, r, x, y` (representative point = centroid of the part inside the bed; for whole cells the DEM
node), `areaM2`, `plantable`, and a value per field. Domains are cached; bed outlines are never modified.

## Fields (level 3)

| id | status | method | accuracy (`tolerance`) |
|---|---|---|---|
| `field.elevation` | source (S-3DEP) | bilinear DEM at the representative point (= the node for whole cells) | 0.1 m |
| `field.slope` | derived | central difference over a 2 m baseline (`baselineM`, configurable) | 1.5° |
| `field.distance-to-path` | derived (S-OSM) | exact distance to gravel walks, grass walks, sidewalks; 0 inside | 0.5 m |
| `field.distance-to-edge` | derived (S-OSM) | exact distance to the bed's own outline | 0.5 m |
| `field.distance-to-obstacle` | derived (S-OSM) | exact distance to walls and structures (`layers` configurable) | 0.5 m |
| `field.canopy` | derived (S-NAIP) | 1 under an existing tree crown (NAIP circle), else 0 — an obstacle, not sun | — |
| `field.sun`, `field.moisture`, `field.ph` | unknown | always `null`, never 0; a rule on them gives the class “no data” | — |
| `hyp.*` | hypothetical | registered test fields, flagged `hypothetical` in every result | per field |

Built-in hypothetical field: `hyp.low-ground-wetter` (1 at the lowest point of the design beds, 0 at the highest).
It exists only to test overlays of three conditions; it is not soil moisture and not Detroit data.

The `tolerance` is the field's accuracy. It is used three ways: a bed whose range is below it is **uniform** and is
not split; cells within ±½ tolerance of a threshold are reported as `uncertainAreaM2`; field display bands are never
narrower than it.

## API (same calls as `window.GP` and, embedded, over `postMessage`)

Scope everywhere: `'bed.B1'` · `['bed.B1', 'bed.A1']` · `'all'` (the 20 design beds) · `'main'` (the 15 A/B/C
beds) · `{ bedIds: [...] }` · `{ geometry: Polygon }` (any area; cells are clipped to bed ∩ area).

| Call | Returns |
|---|---|
| `spatialModel()` | the five levels and their state |
| `fields()`, `field(id)` | field registry with method, units, status, accuracy |
| `domain(scope, { cellSize })` | `{ areaM2, cells, wholeCells, plantableAreaM2, byBed: [{ bedId, cells, areaM2, bedAreaM2 }] }` |
| `cells(scope, { fields, cellSize, limit })` | every cell part: `{ bedId, c, r, x, y, areaM2, plantable, values }` |
| `distribution(scope, { fields, bins })` | per field, **area-weighted over the scope**: `min, p10, p50, p90, max, mean, sd, range, uniform, histogram { edges, areaM2 }, areaKnownM2, areaUnknownM2, byBed` |
| `classify(scope, { rules, cellSize, minRegionM2 })` | a computation (pure, not stored), see below |
| `computeZones(scope, spec)` | same, and keeps it as the current computation (painted, used by `zoneAt` / `queryZones`) |
| `computation()`, `clearComputation()` | the current computation |
| `zoneAt(x, y)` | the zone (with its `bedId`) under a point |
| `queryZones(geometry, { predicate })` | zones that intersect / lie within any GeoJSON geometry |
| `sampleAt(x, y)` | exact point values, the lattice cell (with its values), the bed and the zone |
| `samplePoints(scope, { spacing, pattern: grid / hex / jitter, seed, plantableOnly })` | planting positions with their values and zone |
| `registerHypotheticalField({ id: 'hyp.*', sample(x, y, ctx) })`, `unregisterField(id)` | page only (functions do not cross `postMessage`) |
| `getPlantingContext(bedId)` | now also `conditionsInBed` (the distribution), besides `conditionsAtCentroid` |

Panel (view state): `openConditions(scope)`, `closeConditions()`, `conditions()`, `setConditionScope(scope)`,
`showField(id)`, `showZones()`, `hideConditionDisplay()`, `setConditionRules(rules)`, `startBlank(scope)`.
URL: `?cond=B1,A1|all&show=zones|elevation|slope|distance-to-path…&rules=slope:2,distance-to-path:1.5&zoom=1`.
Events: `conditions` (scope / display / rules changed), plus the existing `selection`, `design`, `view`.

### A computation

```js
{ ok, id: 'cmp.<fingerprint>', version: '0.1', scope: { bedIds, region }, cellSize, areaM2, readsPlanting: false,
  rules: [{ field, breaks: [2], labels: ['Slope < 2°', 'Slope ≥ 2°'], status, dataKind, hypothetical,
            tolerance, uniformIn: [bedIds], uncertainAreaM2, unknownAreaM2 }],
  zones: [{ id: 'zone.B1.0-1', bedId: 'bed.B1', key: '0|1', label: 'Slope < 2° · To path ≥ 1.5 m',
            classes: [{ field, class, label }], areaM2, cellAreaM2, shareOfBed, cells, regions,
            geometry: MultiPolygon /* clipped to the bed outline */, stats: { field: { min, max, mean } }, hypothetical }],
  summary: [{ key, label, areaM2, share, beds }],   // the same class across the scope
  splits: { bedId: zoneCount }, notes: ['…uniform…', '…within the accuracy…', '…no data…'], fingerprint, ms }
```

* A rule = a field + one or more thresholds; classes are half-open `[−∞, t1) [t1, t2) … [tn, ∞)`. Up to 4 rules
  (the panel offers 3, each drawn on its own channel: colour steps, hatching, stipple).
* Zone key = the class of every rule (`'0|1'`, `'?'` = no data). Zones are built per bed: cells merged by key
  (lattice tracing, 4-connectivity) and intersected with the bed outline (`polygon-clipping`), so the zones of a
  bed tile it exactly and never overlap (tested in vector).
* Uniform: a bed whose range of a field is below the field's accuracy takes the class of its mean for that rule —
  no artificial split (TN: elevation range 0.06 m < 0.1 m → one zone).
* `minRegionM2` (default 0 = off) merges pieces smaller than this into the neighbouring class they share most edge with.
* Nothing is a planting rule. Thresholds are inputs; `data/compute.json › experiments` only holds starting values.

## Carrying future planting configurations (level 5)

Verified by dry runs of the existing patch API (nothing written, the reference untouched):
point (an emergent at a sampled position), line (a 0.3 m strip, `bulb-line`), area / block (the largest region of a
zone), matrix (the whole bed), grouping (three groups at positions in one zone), mixed (all of these in one batch).
The generators themselves are not part of this phase.

## Performance (headless Chrome, SwiftShader, this Mac)

Domain B1 ≈ 10 ms, East Meadow (3 663 cells) ≈ 90 ms; classify B1 ≈ 2–20 ms; all 20 design beds ≈ 0.3 s;
distributions of every field over all design beds the first time ≈ 0.8 s (then cached).
