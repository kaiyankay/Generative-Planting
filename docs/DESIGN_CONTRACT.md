# Design layer — data, engine and operations (Integrated Design Prototype, design API 0.1)

The design layer sits on top of the site component (levels 1–4, `MODEL_CONTRACT.md`, `COMPUTATIONAL_SPACE.md`).
It never edits the site, the bed framework or the reference planting. Code: `src/design/`.

```
library.js   Plant Library: Detroit species ↔ Planting Intelligence knowledge (+ site attributes), applicability by place
mixes.js     Planting Mix: versioned, editable "paint" (roles × species × proportion × spacing × arrangement × rules)
engine.js    one Design Assignment → planned plants + diagnostics (deterministic, local, rule-based)
doc.js       Design document: mixes, assignments, clears, settings; precedence; keep / freeze; undo / redo; store diff
ops.js       the operation interface shared by the brushes and any AI client; context() for a language model
feedback.js  numbers, target vs actual, unfilled space, rule effects, season, reference comparison
ui.js        palette, brushes, contextual panel, chip, operations drawer        design.css
```

## Three spatial concepts, kept apart

| Concept | Data | Changes when |
|---|---|---|
| Bed framework (planting units) | `model.json` objects of type `bed` | never in a design |
| Design space (assignment) | `doc.state.assignments[]` — beds, a drawn polygon, a curve + width, or a point + count | the designer paints, erases, keeps |
| Computational zones / cells | `ComputeSpace` (1 m lattice aligned with the DEM) | site data or condition rules change |

An assignment may span several beds; its plants are written per bed (one placement per assignment and bed), because a
placement belongs to exactly one planting unit.

## Planting Mix (`data/<site>/mixes.json`, then `doc.state.mixes`)

```js
{ id: 'mix.dropseed-matrix', name, color, system: 'matrix-based' | 'true-meadow' | 'maximal-color' | 'under-trees' | 'custom',
  status: 'executable' | 'template', version, history: [{ version, at, summary }],
  basis: { summary, recipe, sourceRefs, notes }, drift: { angleDeg }, rules: { crown?: 'require-shade-knowledge', crownBasis },
  roles: [{ id, name, layer: 'base' | 'overlay' | 'ephemeral',
            arrangement: 'matrix' | 'intermingled' | 'blocks' | 'groups' | 'scatter' | 'drift',
            share (base: fraction of planted area) | density (overlay: plants / m²) | coverage (ephemeral: drift coverage),
            densityInDrift, driftM2, spacingM, patchM2, minDistM,
            designRole, designRoleBasis ('legend' | 'list' | null), functionalRole, functionalBasis ('legend' | 'list' | 'assumption'),
            species: [{ id: 'sp.*', weight }], rules: { minPathM?, minPathBasis?, edge?: 'front' | 'back', edgeM? } }] }
```

Every edit (`editMix` → `changeMix`) produces version + 1 with a one-line summary. Assignments follow the latest version
unless they are frozen.

## Design Assignment

```js
{ id: 'as.N', order, type: 'fill' | 'area' | 'line' | 'point' | 'erase' | 'keep', mixId, bedIds?, geometry?,
  params: { seed, densityScale, widthM?, lineMode?: 'drifts' | 'rows', count?, roleId?, speciesId?, spacingM? },
  frozen, snapshot /* plants kept exactly as they were (freeze / keep) */, label, created }
```

Precedence: `rank = order (+10⁶ if frozen or keep)`. A plant of an assignment is kept unless a higher-ranked space covers
it, or a higher-ranked plant of the same layer is closer than 0.6 × spacing (the seam). So a later paint overrides an
earlier one only inside its own space, and a kept / frozen space wins over everything.

Painting in a design started from the reference (or wherever the existing planting is still present) records a **clear**:
the existing placements in that space are really removed (`clearArea` patch op: removed when wholly inside, clipped and
their proxies removed when crossing). The clear belongs to the assignment that made it: remove that paint (or erase)
and the draft is rebuilt with the planting underneath restored; undo / redo restore it too. Hiding the planting (view
filter) and clearing it (data) remain different things.

## Engine (`generate(assignment, env)`)

1. Space → `regionOf` (beds union, polygon, curve buffer, disk) → `partsOf`: ∩ every design bed (polygon-clipping).
2. Positions: a hex lattice at the share-weighted base spacing, **anchored to world coordinates** (±13 % jitter from a
   hash of the lattice index). Roles ≥ 1.3 × wider are thinned to their own spacing ("lowest hash wins" within it).
3. Membership: block / group seeds on a jittered grid (cell size from patch size and share), anisotropic cells (orientation
   and aspect from a hash); `matrix` / `intermingled` roles choose plant by plant with an R2 low-discrepancy dither; along a
   curve, drift seeds follow the centre line, alternating sides. Neighbouring seeds avoid the same species.
4. Overlay: one plant per cell of a grid sized by the density; the cell's own point must lie in the space; it takes the
   place of the nearest base plant. Ephemerals: elliptical drifts on their own grid, bulbs on a fine lattice inside.
5. Rules (exact field values at each position, never the 1 m cell value):
   - trunk clearance `settings.trunkM` (0.6 m) from existing crown centres (`field.canopy` source, NAIP) — hard;
   - role rules on `field.distance-to-path`: `minPathM` (overlay kept off the path edge), `edge` preference — weights;
   - `mix.rules.crown = 'require-shade-knowledge'`: under a crown only species whose applicable exposure records include
     part shade or shade — hard;
   - `settings.scenarioWet` (HYPOTHETICAL): "lower ground is wetter" relative to the space itself — wetness =
     (z_max − z) / (z_max − z_min) over the space (1 m sample of the 3DEP DEM; no gradient below 0.1 m of relief) →
     dry / moist / wet thirds vs the hydrology zone printed on the official meadow lists; adjacent class tolerated (×0.12),
     two classes apart excluded.
   An excluded species is replaced by another species of the same role (counted as a substitution); if none fits, the
   position stays unplanted with its reason (`REASONS`).
6. Validation, independent of the generation: inside its own bed part, not inside a path / structure inside the bed,
   ≥ 0.55 × spacing from the nearest plant of the same layer; failures are dropped and counted.
7. Output: plants `{x, y, sp, role, size (planned spacing), bed, layer (0 base, 1 overlay, 2 ephemeral)}`, unplanted
   positions with reasons, diagnostics (areas, target vs actual per role, substitutions, rules, fields used, z range, ms).
   z is not stored by the engine: it is the bilinear 3DEP elevation at the plant (`store.sampleElevation`), the same value
   every plant record reports; the 3D exaggeration is display only.

Determinism: the same assignment, mix version, settings and (when a rule reads knowledge) knowledge revision give the
same plants. Generation results are cached by that key.

## Working design (store)

Design plants are placements of kind `plants` written by the validated patch API:

```js
{ op: 'add', collection: 'placements', value: { id: 'pl.dz.<asg>.<bed>.<hash>', kind: 'plants', bedId, mixId, mixVersion, assignmentId,
  color, speciesIds: [...≤ 64], roles: [...], plants: [[x, y, speciesIndex, spacingM, roleIndex], …], geometry: effective space } }
{ op: 'clearArea', geometry: (Multi)Polygon, units?: [...] }
```

The store checks every plant again (inside the unit, not on a path / water / structure, valid species and spacing). One
instance row = one planned plant (`InstanceTable.k = 1`); `instanceRecord` reports `type: 'designPlant'`, role, mix
version, planned spacing and the DEM elevation. Reference rows stay visual proxies (k = 0). The 2D painter draws design
plants at their planned spacing; the 3D scene gives each a render proxy (form from `formProxy`, nominal height).

Persistence: the design document (`localStorage['gp.designDoc.v1']`) is the source of truth; design ops are not stored in
the store's op list (`isDesignOp`); on load the document rebuilds the draft deterministically.

## Operations (`GP.design.run(ops, { preview })`, `GP.design.runAsync(ops)`)

| op | arguments |
|---|---|
| `fill` | `beds: [ids] \| 'main' \| 'all'`, `mix`, `params?` |
| `paint` | `geometry: Polygon`, `mix`, `params?` |
| `line` | `coordinates`, `widthM`, `mode: 'drifts' \| 'rows'`, `mix`, `params?` |
| `point` | `at: [x, y]`, `mix`, `roleId?`, `speciesId?`, `count?`, `spacingM?` |
| `erase` / `keep` | `geometry` or `beds` |
| `freeze` | `assignment`, `on` |
| `remove` | `assignment` |
| `setAssignment` | `assignment`, `mix?`, `params?` |
| `createMix` | `name`, `system?`, `color?`, `roles?`, `from?` (duplicate) |
| `editMix` | `mix`, `changes: [{ op: setShare \| setSpacing \| addSpecies \| removeSpecies \| replaceSpecies \| setWeight \| addRole \| removeRole \| setRule \| setRoleParam \| rename \| setColor, … }]` |
| `setScenario` | `wet: boolean` (hypothetical) |
| `addKnowledge` (async) | `speciesId`, `kind: exposure \| bloom \| hydrology \| note`, `value`, `place?`, `note?` |
| `applyRecordHere` (async) | `recordId`, `why?` |
| `setKnowledgePolicy` (async) | `accept: [same, within, broader, elsewhere, unknown]` |

All ops of a batch are validated on a copy first; any error refuses the whole batch. `preview: true` computes the result
(plants before / after, target placements) and writes nothing. Every brush in the UI calls exactly this function.

`GP.design.context()` returns what a language model would read: operations, design state, beds with areas and boxes,
field registry (unknowns marked), condition ranges per bed, knowledge per species in the mixes (unknowns kept), policy.

Other calls: `start({from, scope})`, `active()`, `state()`, `undo()`, `redo()`, `feedback()`, `season(month)`,
`compare(beds)`, `assignments()`, `mixes()`, `generated(id)`, `plants(id)`, `operations()`,
`library.load/status/profile/policy/setAccept/revision`.

## Plant Library and knowledge

- Mapping: `knowledge/data/species_map.json` (spatial id → entity, status matched / cultivar / same_taxon / placeholder).
- Effective knowledge: `knowledge/src/kb.js` over `seed.json` + the personal events in IndexedDB `gp-knowledge`
  (shared with the Knowledge workspace; `?kdb=` selects another database for tests).
- Applicability: `kb.placeRelation(record place, 'place:detroit')`; default accepted: same, within, broader. Records from
  elsewhere are listed, never applied automatically; `applyRecordHere` stores the designer's scope decision as a personal
  `applies_in` record. Records without a place are not used by rules.
- Cultivars: species-level records are shown for a cultivar but not applied to it.
- Site attributes: `data/<site>/design-library.json` (hydrology zone printed on the official meadow lists, both lists
  kept when they disagree). A personal `water_drainage` record with `value.data.hydrology` that applies here overrides it.
- If the knowledge files are not present (a checkout without the knowledge module), the library reports
  `unavailable`, exposure and bloom stay unknown, and the crown rule plants nothing under crowns.
