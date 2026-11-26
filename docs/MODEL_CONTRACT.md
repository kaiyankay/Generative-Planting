# Model contract — `generative-planting/spatial-model` v0.3

One JSON document (`data/detroit/model.json`) plus two binary buffers. The 2D plan, the 3D scene and any AI client read the same data; no view owns geometry.

```
data/detroit/
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

- `status`: documented · reconstructed · schematic · unknown
- `dataKind`: source · inferred · hypothetical
- Unknown values are `null` with `status: "unknown"`, never 0. Display-only inferences are listed in `species.inferredFields`.

## Query and edit API

Exposed in the browser as `window.GP` (also usable in Node by importing `src/model.js`):

| Call | Returns |
|---|---|
| `getObject(id)` | object, placement, species, recipe, source, or a plant instance (`pi.N`) |
| `getBedAt(x, y)` | bed containing the point or null |
| `queryObjects(geometry, filters)` | objects (or `{collection:'placements'}`) intersecting a point+radius, polygon or `{bbox}`; filters: type, layer, style, role, speciesId |
| `sampleConditions(x, y)` | elevation, slope, distance-to-walk, sun/moisture/pH (null + unknown), bedId, placements at the point |
| `getPlantingContext(id)` | bed, style, recipe, placements by role, species list, conditions at the centroid |
| `applyPatch(ops)` | applies `[{op:'set', target, path, value} \| {op:'remove', target} \| {op:'add', collection, value}]` to a **draft copy**; the frozen baseline never changes |
| `resetDraft()`, `diffDraft()`, `exportModel({draft})` | discard / list / export |
| `select(id)`, `setLayer(id, {visible, locked})`, `layers()` | shared UI state (both views follow) |

Example:

```js
GP.getPlantingContext('bed.B1').placementsByRole        // { matrix: 1, group: 38, emergent: 25, scatter: 3, ... }
GP.sampleConditions(0, 0)['field.sun']                  // { value: null, status: 'unknown', ... }
GP.applyPatch([{ op: 'set', target: 'pl.A1.b01', path: 'speciesIds', value: ['sp.sporobolus-heterolepis'] }])
GP.resetDraft()
```

The renderer is never an input: an AI proposes operations on the model; the views re-render from it.

## URL states

`index.html?view=3d|plan&sel=<id>&focus=1&z=<zoom>&at=x,y&layers=+topo.contours,-veg.trees&lopen=1&about=1` reproduces a view (used for screenshots and links).

## Adding a second case

1. Copy `tools/geo.py` with a new origin and extent; run `tools/fetch_sources.py` for OSM + USGS (or supply local survey data in the same frame).
2. Write a `curated_<case>.py` with species (`sp()`), legends (role per recipe) and official statistics.
3. Adapt the bed register in `build_model.py` (OSM ids → model ids, codes, styles) and run it; run `tools/test_model.py`.
4. Point the viewer at `data/<case>/` (one constant in `src/app.js`). Nothing in the viewer is Detroit-specific except the home camera.
