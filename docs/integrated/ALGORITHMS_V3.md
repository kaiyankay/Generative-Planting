# Generative Planting V3.1 — algorithms and rules (what the code does)

Applies on top of [ALGORITHMS_V2.md](ALGORITHMS_V2.md); only changes and additions are listed. Code: `src/flow/`.
Prototype parameters are marked **assumption** (editable, not from a source).

## 1. Stage-owned observation (shell.js)
`P.state.view.sv[stage] = { mode, cam, focus }`. Modes per stage: Define Plan / 3D; Structure and Compose Plan / 3D / Diagram;
Explore Plan / 3D / Diagram / Performance. The month, the phenology colouring, the timeline and the Performance legend exist
only while the stage is Explore (`applyStageView` clears them on every other stage). Leaving a stage stores its camera;
Compose entered from Structure inherits Structure's focus (or fits the scope); Compose entered from Explore restores its
own camera; Explore always fits the result.

## 2. Scope ≠ focus
* **Scope** (confirmed) = `brief.scopeBeds` = beds of the confirmed strategy ∪ beds that already have cells (a new strategy
  never drops a designed bed — engine test W11).
* **Candidate** (Define only) = `F.u.candidate`: click = only that bed, Shift-click = toggle, Shift-drag = box (bed counted when
  the box contains it or the centre of the overlap lies inside it), presets. A strategy is re-proposed for the candidate and
  must be confirmed; Continue is disabled while it differs from the confirmed one.
* **Focus** = `F.u.focus` (camera + inspected beds), set by clicking a bed (Structure), the breadcrumb's bed menu or the
  inspector; *Overview* clears it. Focus never changes the scope, the cells or the brush's reach (the brush still paints every
  scope bed it touches).
* Camera fit = union bbox of the beds + margin (3 m one bed, 4 m several) fitted into the free canvas: panel, legend, dock,
  breadcrumb and top bar subtracted (`fitView`); animated 480 ms (ease-out), instant with reduced motion.

## 3. Light at a point (fill.js `makeEnv().lightAt`)
1. the designer's **project assumption** for the bed (`state.env.light[bedId]`: sun / part / shade, with time and the label
   “project assumption”; set from the Conditions legend or the bed panel in Structure; undoable);
2. else the **crown proxy**: inside a NAIP crown (`field.canopy = 1`) → shade (“probable shade · proxy”);
3. else **unknown** — open ground is *not* treated as verified sun (V2 did; changed).
The proxy is never overwritten by an assumption (both are drawn; a plant records `ls = 'a' | 'p'` for the source used).
Changing an assumption changes new plants only; placed plants are not regenerated (stated in the toast).

## 4. Plant fit and Mix fit
* Plant: `match` if its recorded light values contain the site value, `conflict` otherwise, `unknown` if either is unknown.
  Values are matched literally: a part-shade plant is not a match for “shade”, “part” is not a wildcard.
* Validation: a conflicting candidate is swapped for a member of the same layer recorded for this light (weighted by share);
  if none exists it is **skipped** (counted `rejected.light`) — unless the brush's *allow conflicts* is on, then it is placed
  with `fit: 'conflict', ov: 1` and stays flagged in every view.
* Mix at a light value (`brush.js mixFitAt`, share-weighted over the target layers): `unknown` if there is no site light or no
  member with a light record; `match` if no member with a record conflicts; `conflict` if none matches; `partial` otherwise.
  The known share (`known`) and up to three conflicting members (name, recorded light, source) travel with it.
* Map (Compose, Conditions → Mix fit): per cell (light of the cell = assumption of its bed, else crown fraction ≥ 0.5 → shade,
  else unknown); textures, not colour alone: fits (olive), partly (rust stripes, denser = larger conflicting share),
  conflict (rust cross-hatch), unknown (dots), **blocked** (ink hatch: paths in view, frozen cells) — blocked is never a
  conflict. Hiding the layer changes nothing in the computation (journey step 15).

## 5. One evaluation for hover, drag and commit (brush.js)
`_segment(stage, a, b)` = capsule a→b of radius r (metres):
1. cells of the **editable scope** under the capsule (frozen cells and cells of beds outside the scope excluded; paths, water,
   structures are in no cell);
2. load once, into ONE stroke-wide spatial index, the plants of every cell within `reachM = 1.2 m` (**assumption**) of the box
   → spacing is checked across internal cell edges;
3. existing plants of the target layers inside the capsule are staged for removal (replacement); other layers are kept and
   counted;
4. world-anchored lattice candidates of the mix inside the capsule → `validate()` (bed edge, trunks, spacing, light).
Hover = `_segment(freshStage, p, p)` on the overlay: adds (dots in the layer colour, dashed = light unknown, caramel ring =
swapped), replacements (rust ×), light-skipped candidates (rust rings), the footprint (editable part tinted, the rest hatched
as clipped) and a chip beside the cursor (bed·cell · light and its source · fit with the known share · +adds · replaced · kept
· skipped, or the blocking reason: path, frozen, outside the design scope, not plantable, outside the beds). Drag = the same
function on the stroke's stage for every densified segment (step = r / 2). Pointer-up = `Project.applyStroke` with exactly
the staged plants (no re-generation) → hover and commit agree by construction (engine test W3).

## 6. Boundaries
* **Hard**: bed plantable outline (bed − blockers) ∩ scope − frozen. Plant centres stay inside a cell and ≥ 0.08 m from the
  hard outline (**assumption**, V2 value).
* **Cell edges** are computational: no inset (V2 inset 0.08 m at every cell edge → removed); spacing checked across them.
  W1: plants exist within 0.08 m of internal edges, none within 0.08 m of the hard outline; W2: 0 spacing violations across
  cells, internal-edge band density / interior density = test value in `docs/qa/v3_unit_tests.json` (> 0.7 required).
* **Community boundary**: default = same-layer replacement inside the footprint. **Soft edge** (brush bar): band = outer 45 %
  of the radius (**assumption**); weight w(d) = 1 inside the core, falling linearly to 0 at the rim; an old plant of the
  target layers in the band is replaced with probability w, a new candidate accepted with probability w (deterministic hash
  of the id) → a mixed rim; spacing still validated; fragment marked `edge: 'soft'` (W6).
* **Functional layers**: Base / Overlay / Bulbs are chosen in the brush bar; an Overlay stroke never removes Base (V2 V11);
  centres of different layers ≥ 0.12 m apart (V2).

## 7. Rendering during a stroke (plan2d.js, paintflow.js)
* `requestRegion(box)` redraws only the world rectangle swept since the last frame (+1.1 m for symbols), clipped, with the
  same painters culled to it; `requestOverlay()` redraws the cursor layer (separate canvas). A region larger than 60 % of the
  canvas falls back to a full draw. Staged plants are painted by the region pass; replaced plants are hidden by an
  incrementally kept position set (V2 rebuilt it on every draw).
* No DOM is rebuilt while the button is held (live count and chip are text updates); performance (perf/3), persistence
  (debounced 400 ms, flushed on `pagehide`) and the 3D rebuild (only when the 3D view is shown) are deferred until after the
  stroke. Undo entries of cell-scoped commands keep only the declared cells' assignments / instances (W9).

## 8. Performance metrics (perf/3)
* **Planted area** of a cell = area of the union of its fragments clipped to the cell (whole-cell fragment = the cell); if the
  boolean fails, the sum of fragment areas capped at the cell (stated). Per-m² values use the planted area; the structured area
  is reported apart (W8).
* **Largest connected group** = largest *planted area* (ties: first cell id) — V2 sorted by cell count but reported area (W7).
* Flowering (phenology: known to flower that month, wind-pollinated included) is counted apart from a known **resource**
  (flowering and not known to be wind-pollinated); unknown is apart from both. Adjacency rule (shared edge ≥ 0.3 m, ≤ 3 m
  across a path) and the strong threshold (1 / m²) remain **assumptions**; “potential connection”, never a pollinator route.

## 9. Result snapshot and community inspector (stages/explore.js)
* Result = `{ rev (design revision, +1 per commit / undo / redo), fp (fingerprint of the instances), scope, knowledge
  version, perf version, prevRev }`, a projection of the project state — not a copy; saved options keep their own copy (V2).
* Plan shows the scope only: canvas clip = union of the scope beds buffered by 2 m (the real path gaps stay); *Site context*
  removes the clip. 3D: instances filtered to the design's plants and trees within 4 m of the scope box; the ground texture
  outside the scope is veiled; terrain and built forms remain (stated limit).
* Month: Plan colours plants by known flowering / not / unknown (V2); 3D now does the same per instance (flower colour kept /
  leaf only / neutral grey). No growth, no succession, no insect movement.
* **Community** under a click = the fragments of that cell covering the point (all layers) + the fragments of the *same
  gesture* (same mix, origin and time stamp) in other cells for brush strokes. Plants = instances whose `frag` is in that set
  (W10). Reported: plants per layer and species, planned share (recipe) vs placed share, density over the fragment area,
  target vs placed, light fit and its source, a real 4 × 3 m sample around the click, a schematic section (nominal heights,
  labelled), the month's flowering, and “why” lines assembled from the strategy zone, the system's roles (slides P34 / P41)
  actually counted among the plants, the cell logic and arrangement grain, overlaps at the point, brief-month coverage and
  light — each line tagged with its source; Rules mode, no language model.

## 10. Knowledge (kview.js)
Readings by question (see DESIGN_CHANGES_V3.md §Knowledge for the course mapping): Plants (comparable trait table, profile),
Seasons (calendar), Communities (systems → roles → mixes), Relations (graphs with node focus and edge evidence, V4.3
interaction), Notebook. Scope filters: This project (plants of the mixes and instances), Selected mix, All Detroit plants
(site catalogue). Spatial-function records (planting-db KG) exist only for Metro Vancouver species: shown only on request,
with a banner. A new record is previewed: month metrics before → after (V2) and each mix's fit over the scope beds before →
after; Apply writes a project record (undoable).
