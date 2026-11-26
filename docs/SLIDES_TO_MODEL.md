# From the slides to the model

Reference: *Generative Planting at Scale — Systems Design for Ecological Impact* (Thomas Rainer, Chris Landau, Xun Liu; ASLA, 2024-10-07, 137 slides). The deck is copyrighted and stays in the git-ignored `private-inputs/`; this page paraphrases it in a few words per slide. **"Slide says"** is my paraphrase of the slide; **"This model"** is my own design decision, not the authors'.

| Slides | Slide says (paraphrase) | This model (Phase 01) | Hook for later | Gap |
|---|---|---|---|---|
| 11 | The profession moves from technician / CAD control / plants as objects toward curator / tool-maker / AI collaboration / plants as systems. | A queryable model, not another CAD file: every object has provenance and can be read by code (`window.GP`). | AI reads and proposes drafts; the designer curates. | — |
| 24 | Scalable modules: one planting module repeated across a large area. | `recipes[]` (style-level mixes) are separate from `placements[]` (where they occur), so a recipe can be reused on another bed or case. | Module tiling / reuse across cases. | Detroit is drawn bed-by-bed, not as tiled modules. |
| 25 | A legible spatial framework holding diverse functional cover. | The as-built bed/path framework is documented geometry; the cover inside is the variable layer. | Edit cover without moving the framework. | — |
| 26 | Example of the conventional "paint by number" plan (each area = one species code). | A-bed blocks look like this, but the data model never forces one species per point: placements overlap (matrix + groups + emergents + bulbs). | — | — |
| 28–29 | Operationalise plant functions in three ways: spatial layers (role in a mix), time (phenology), curated databases. | Role is stored on the **placement** (legend role in that recipe), not on the species. | Functional-role vocabulary per recipe. | Oudolf's legends give drawing roles (block / emergent / matrix / group), not ecological functions; ecological roles left `null`. |
| 30–31 | Natural prairie vs. designed prairie garden and green infrastructure. | Native Meadows modelled as a separate planting type from the designed beds. | — | Meadow arrangement not published. |
| 32–33 | Substitute species but keep functional layers; proxies that simulate a species' role. | Species records carry `formProxy` (rendering) separate from role; `aliases` record 2019→2026 substitutions. | Substitution engine. | — |
| 34 | Planting layers by functional role for four system types (matrix-based, true meadow, maximal colour, under trees). | B beds = matrix-based (Sporobolus base + groups + emergents); A = blocks + emergents + ephemerals (bulbs); meadow = separate system. | Map recipe roles onto these four systems. | — |
| 35–36 | Build a matrix base, then add long-lived perennials; bloom-season chart. | Matrix placement covers the whole B bed and overlaps its groups (tested). | Bloom calendar per species. | No calibrated phenology: `phenology: null`. |
| 41 | Layers by seasonal events: blocks, emergents, ephemerals (bulbs). | Bulbs are an independent layer that overlaps the herbaceous layer; bloom state explicitly not shown. | Seasonal states. | — |
| 44–52 | Document phenology; test forb proportion month by month. | Temporal hooks exist on every species (`phenology`, `temporal{plantingDate, initial/matureHeight, seasonalStates}`) and are left `null`. Display is one labelled illustrative summer state. | Season slider once data exist. | No phenology source collected tonight. |
| 53–58 | Curated databases (pollinator research, lists by habitat and by pattern of arrangement). | Detroit plant list imported as its own list with stable `sp.*` IDs + `canonicalKey`; lists by pattern ≈ our legend roles. | Map `sp.*` to an open knowledge base. | No performance attributes yet. |
| 69 | Rhino → Grasshopper → Land Kit stack: Site, Topo, Paving, Planting, Performance as layers of one model. | Layer registry: Site, Topography, Built, Planting structure, Vegetation, Analysis — shared by Plan and 3D. | Performance layer = future computed output. | — |
| 71 | Rules-based planting: water, shade and pH tolerance overlaps drive placement. | Field registry has sun, moisture, pH as **unknown** (null, not 0); UI shows "n/a". | Fill fields → rule queries. | No soil / light data. |
| 72 | Layering constraints: plants over slope, sun exposure, elevation, proximity. | Elevation (3DEP), slope (derived), distance to walk (derived) are queryable at any point (`sampleConditions`). | Sun exposure from a shade model. | Sun not computed. |
| 73–74 | Computational planting design; ML clustering of planting zones. | No cells imposed on Oudolf's design; vector placements + spatial queries, cells derivable later. | Grid / cell derivation. | — |
| 84 | What makes a good computational approach: automation, relative predictability, clarity, new possibilities, customisability, evolvability, openness (≠ open source). | Seeded and deterministic (tested), every value labelled with status, case-agnostic schema, open JSON. | Second and third cases on the same schema. | — |
| 105–108 | Real-time collaboration with generative image AI. | Not implemented (by design). | Future interaction ideas only. | — |
| 122 | AI for plants must consider accuracy, functionality and time. | Accuracy is explicit per object (documented / reconstructed / schematic / unknown). | — | — |
| 123–134 | Training AI on local data: site conditions → plant distribution; iterate soil and topography. | Baseline is immutable; drafts are patch lists (`applyPatch`, `resetDraft`), so scenarios can be compared against the baseline. | Condition-driven drafts. | We do not replicate the SWA model. |
| 135 | Rule-based (quantitative, deterministic) vs. generative AI (qualitative, indeterminate). | Phase 01 is entirely deterministic; AI comes later on top of the same model. | — | — |

## Two inputs for future AI

1. **Open Knowledge Base** (not built tonight): plant knowledge, experience, budgets, office principles, preferences.
2. **Spatial Model** (this phase): geometry, positions, the current plant community and conditions — with a species-ID boundary (`sp.*`, `canonicalKey`) where the knowledge base will connect.

## Phase 01.1 additions (2026-11-26)

The deck was re-read locally (the PDF stays in `private-inputs/`); diagrams on P11, P16–17, P22–25, P28–34, P44, P58, P69, P71–74, P84 and P122–135 were looked at as images, not only as text. Page numbers follow the PDF. The mapping below is this project's own inference, not something the slides prescribe.

| Slides | Slide idea (paraphrase) | Phase 01.1 decision |
|---|---|---|
| 11, 16–17 | Designer as curator; real-world knowledge cannot be skipped. | The reference stays frozen and visible; a working design is a separate, explicit act (dialog with the scope shown first). Every edit is a validated patch an expert can read, refuse or reset. |
| 22–25 | Functional mixes; ground cover; scalable modules on a legible framework. | Site and bed framework are separated from the planting: a blank canvas keeps the framework as a constraint and clears only the planting in scope. |
| 28–34 | Plants in functional layers; substitute species but keep the role. | `replaceSpecies` keeps the placement, its role and its proxy positions and changes only the species — the substitution pattern of P32–33, now visible in 2D and 3D. |
| 44, 58 | Time / phenology; curated databases. | Still hooks only (`phenology: null`); the 2026 list cultivars are now flagged as possible substitutions, not synonyms (data versioning before databases). |
| 69 | Site / Topo / Paving / Planting / Performance as layers of one model. | Seven layer groups (Terrain, Infrastructure, Site Vegetation, Planting Framework, Planting Composition, Plant Representation, Analysis) as one stack you can pull apart, enter and overlay. |
| 71–74 | Constraint overlays (water, shade, pH, slope, sun, elevation, proximity); computational layout. | `plantableAt` + `sampleConditions` return constraints that do not depend on visibility; only real fields (elevation, slope, distance to path) are drawn; sun / moisture / pH are explicit "no data". Exact polygon / line / point queries make a selection area usable as a layout input. |
| 84 | Clarity, relative predictability, customisability, evolvability, openness. | Atomic, deterministic patches; export / import replays to the same fingerprint; case settings in `case.json`; open JSON and a documented API. |
| 122–135 | Accuracy, functionality, time; local data; rules vs generative AI. | Accuracy per object stays explicit; the 2D / 3D / query / export consistency is tested end to end, so a later rule engine or AI can act on the model rather than on pictures. |
