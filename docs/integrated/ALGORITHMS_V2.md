# Generative Planting V2 — algorithms as implemented

Code: `src/flow/` on `feature/integrated-prototype`. Units: model metres (x east, y north); z = USGS 3DEP 1 m (NAVD88).
Every number marked **(assumption)** is a prototype parameter, editable or documented here — not a professional standard,
not taken from the course slides or from Land Kit. The slides (Generative Planting at Scale, DC, 2024-10-07; read locally,
not committed) supplied the *concepts*: modular, legible spatial frameworks (P24–26), functional roles per planting system
(P34–36), blocks / emergents / ephemerals as seasonal layers (P41–43), phenology (P44–52), analysis layers constraining
placement (P69–72), automation · predictability · clarity · customisability · evolvability (P84). Land Kit's public
component reference (Create Environment, Create Niche, Rule Restriction, Fill Area with Plants / Pattern, Pack Plants,
Freeze Area Plants, Draw Bloom Calendar) supplied the *order of operations*; no Land Kit code or formula is used.

## 1. One state, one chain

`Project` (`gp.project/2`, localStorage `gp.flow.project.v2`; `gp.project/1` is migrated on resume):

```
brief + strategy ─▶ beds{logic, params, cellIds} + cells ─▶ mixes (gp.mix/2, layered)
                 ─▶ assignments[cell].fragments[{id, mixId, mixVersion, slots, geometry|null, origin, seed}]
                 ─▶ instances[cell].plants[{id, x, y, plantId, role, slot, layerId, mixId, mixVersion, frag, spacing, fit, sub?}]
                 ─▶ model working draft (2D, 3D, picking: one placement per cell, one row per plant) ─▶ performance
```

Every gesture is one `commit()` (snapshot → change → draft patch → recompute → save → one undo step). Stored plants are
authoritative: a stroke changes only plants inside its footprint and target layers; plants outside keep x / y.
Locks (`state.locks`) = frozen cells: never painted, filled, re-filled by a mix edit or restructured.

## 2. Define — site-wide strategy (Rules mode)

`strategy.js`. Scope presets: Main Garden (A·B·C beds + triangles), Whole site, Meadows, Block + Matrix beds, or a
custom selection (click beds). The intent is read by listed keyword rules only (shown in the panel as "what Rules mode
read" / "not used"). Zone rules, in order:
meadow beds → True Meadow · whole; rain garden → True Meadow · organic; beds with ≥ 30 % crown above (NAIP crowns, a
probable-shade proxy) and a "trees / shade" intent → Under Trees · organic; "path" intent + Matrix beds (B) / triangles →
Path matrix: Matrix Based · curved bands; Block beds (A) → Matrix Based · honeycomb if "matrix" without "colour", else
Maximal Color · honeycomb; Grouping beds (C) → Maximal Color · organic when "colour" or "early" (ephemeral layer), else
Matrix Based · organic. "Keep the meadows" removes them from the scope (kept as reference). If the intent asks for trees but
no bed reaches 30 % crown (the Detroit Main Garden: max 6 %), the rule says so instead of inventing shade. Every zone
lists its reasons and gaps (sun / moisture / pH unknown). Zones' system and logic can be changed by hand. Confirm = one
undo step; nothing in the design changes before it.

## 3. Structure — the whole scope at once

`structure.js` previews every bed of the strategy in batches (≈ 1.5 s for 17 beds on this Mac), one commit for all
(`commitStructureMany`). Zone parameters are shared: size, a common direction (length-weighted doubled-angle mean of the
path edges of the zone's beds), and a world anchor for straight bands so the band phase continues across paths.

| logic | generation |
|---|---|
| Curved bands (default for bands) | guide = the longest run of bed edges that face a path (midpoint ≤ 2 m) **and** run within 32° of the dominant path direction (beds ringed by walks would otherwise give a closed ring). Band k = buffer(guide,(k+1)w) − buffer(guide,kw) ∩ plantable (true distance bands, so they bend with the edge). Segments: cut lines perpendicular to the guide every 3 w **(assumption)**, slabs sequentially differenced (no overlap); leftovers go through the fragment rule. A designer-drawn guide curve (Structure → "Draw a guide curve") replaces the path edge for the whole zone. If a boolean fails, straight bands are used and the note says "fallback". |
| Straight bands | V1 bands; with a zone anchor the offset is (lo − anchor·n) mod w so neighbouring beds share the phase |
| Honeycomb | V1 hex lattice; the zone direction is a candidate angle |
| Organic patches | V1 clipped Voronoi + 2 bounded Lloyd steps (straight edges; no smoothing — not claimed) |
| Whole area | no division: each plantable part ≥ 1 m² is one cell |

Validity and ranking as in ALGORITHMS.md §1 (slivers, regularity, mixed site conditions, path alignment, count). Changing a
planted bed: overlap ≥ 50 % keeps the mix (the new cell is re-filled with it), else unassigned; frozen beds are skipped.

## 4. Planting Systems and layered Mixes (`mix.js`)

Four system templates (slides P34): **Matrix Based** (long-lived matrix + groundcover base; emergent forbs; dynamic
fillers), **True Meadow** (warm / cool growers + nitrogen fixers base; fillers), **Maximal Color** (base blocks;
emergents; ephemerals), **Under Trees** (clumping + clonal + winter-present base; colour theme; ephemerals).
A Mix has layers; each layer is its own 100 %:

| layer basis | meaning | expected plants / m² |
|---|---|---|
| `area` (base) | members share the ground; each packs at its own spacing s | Σ share · 1 / (0.866 s²) |
| `count` (overlay) | independent density over the base, split by proportion | density · proportion |
| `drift` (ephemeral) | a coverage of the area in drifts × a density inside the drift | coverage · densityInDrift · proportion |

Template densities **(assumption)**: Matrix Based emergents 1.2 / m², fillers 0.3; True Meadow fillers 0.8; Maximal Color
emergents 0.8, ephemerals 25 % × 14 / m²; Under Trees theme 0.8, ephemerals 30 % × 12. The library is seeded with the
**Detroit legend recipes** (`data/detroit/mixes.json`: base shares and spacings, overlay densities, drift coverage as
recorded; species of one legend role split it equally — assumption) for the systems the strategy uses; "Add a mix" fills a
system template from its legend recipe; Rules-mode suggestions (V1 greedy coverage) are converted to layers by role family.
4.5 plants / m² survives only as the V1 fallback for flat member lists. A role is the plant's relation in this mix.
Edits: shares, spacing, layer density / coverage / arrangement, add / remove / role; version + 1 with a summary.

## 5. Fill engine (`fill.js`) — one backend for Brush, Cell Fill, Auto Compose

Environment → Niche → region → layers → counts → candidates → validation → instances.

* **Candidates are world-anchored hex lattices**, one per (mix, layer signature, member for area layers), jitter ±17 % of
  the spacing **(assumption)**. The salt is the *layer signature* (its own parameters), so editing one layer never moves
  another layer's plants, and the same mix painted twice over the same ground yields the same candidate ids (no stacking).
* **Species distribution**: area layers use a grain field (jittered seeds at the grain: intermingled 0.5 m, matrix 0.7,
  groups 1.4, blocks 2.2 — assumption), each seed choosing a member by area share, each member growing on its own lattice
  where its seeds own the ground; count layers pick per point (scatter) or per cluster seed (2.1 × lattice spacing →
  clusters of ≈ 3–5); drift layers keep lattice points whose drift seed (2.5 m) is "on" with probability = coverage.
* **Hard validation**: inside the region (cell; cells exclude paths, water, structures), ≥ 0.08 m from the cell edge,
  ≥ 0.6 m from tree trunks, not in a frozen cell, centre ≥ 0.12 m from any plant of another layer (canopies may overlap),
  ≥ 0.6 × the smaller spacing from a plant of the same layer. Rejections are counted per fragment (target vs placed), never
  moved or hidden.
* **Niche (soft)**: if a member's recorded light conflicts with the crown proxy at the point, a layer-mate recorded for that
  light is substituted (weighted by share; `sub` records the original); if none fits it is kept and flagged `conflict`.
  Unknown light or crown → `unknown`, never "suitable".

## 6. Live Generative Brush (`brush.js`)

Hover → ghost candidates (never written). Press → stroke; every pointer move is densified into segments of ≤ r / 2 (fast
drags never skip); each segment's capsule (radius in **metres**, independent of zoom; default 1.5 m, 0.4–6 m) touches the
cells it overlaps — across beds; for each cell, existing plants of the target slots under the capsule are staged for
removal and the mix's lattice candidates inside the capsule are validated against the plants that stay. Staged plants are
drawn immediately (same symbols as the model plants; replaced ones are hidden). Pointer-up: the swept footprint
(Douglas–Peucker-simplified path buffered by r) is intersected with each touched cell; fragments of the target slots lose
the footprint, a fragment of this mix gets it (merged with an earlier one of the same mix), and the staged plants are
committed — one validated patch, one undo step. Esc / pointercancel discards. Slots: the HUD selects base / overlay /
bulbs (overlay-only painting keeps the matrix). Timing per move is logged (`GPFlow.brushLog`): ≈ 15–23 ms per move in
headless SwiftShader on this Mac (not a device guarantee).

Cell Fill = the same engine over the whole cell (a whole-cell fragment of the chosen slots). Auto Compose = V1 greedy
ranking (coverage + continuity + balance + variety − conflict) over unplanted, unfrozen cells, previewed, then whole-cell
fills. Shared-mix edit = re-fill of that mix's unfrozen fragments only (impact preview first); local variant = a copy
applied to the selected cells' fragments.

## 7. Performance (`performance.js`, `perf/2`) — from placed instances only

| measure | definition |
|---|---|
| presence | cell has ≥ 1 placed plant known to flower in the month and not known to be wind-pollinated |
| distribution | per cell: flowering instances; known flowering fraction = flowering / placed plants of the cell (denominator stated); per m²; unknown counted apart (never 0, never support) |
| groups | documented groups of the flowering instances (instances per group; unknown groups apart); association, not visits |
| continuity | components of presence cells over adjacency (≥ 0.3 m shared boundary) and near links (≤ 3 m across a path); also components of strong cells (≥ 1 flowering plant / m² — assumption) |
| adaptability | per placed plant: light fit at its own position (match / conflict / unknown, substitutions counted); moisture unknown |
| seasonality | per instance flowering / not / unknown in the month (plants recoloured on the plan); no growth model |

Scope = designed cells only (the reference planting is never in the denominator). The Performance view draws 1 m pixels of
flowering plants / m² (ramp 0 / <1 / <2 / <3 / ≥3), unknown-dominated pixels hatched, planted-but-not-flowering pale,
continuity links (solid adjacency, dashed across a path), separate groups ringed. Snapshot comparison recomputes both
options now with the same knowledge, definitions, month and scope.

## 8. Knowledge lenses (`knet.js`)

X · Plants → Z → Y, edges only from real relations / records: **Spatial function** (seed relations `suited_for` /
`requires_trait`, planting-db KG; formation documented / derived / candidate), **Community role** (member role in a mix of
this project → system that names it, slides), **Ecological association** (documented groups of plants with known
flowering → season, derived), **Environment** (recorded light / moisture → known site condition; moisture: no site data).
Line type = provenance (source · derived · candidate · project / personal · illustrative · conflict). Network, Matrix,
Table share data and focus. A project record is previewed (metrics before → after) and applied only on confirm; mixes and
plant positions do not change.
