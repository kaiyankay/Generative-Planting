# Research basis → design prototype

What the Integrated Design Prototype takes from the research material, and what it deliberately does not take.
The slide deck *Generative Planting at Scale* is classroom material: it stays in the git-ignored `private-inputs/`,
nothing from it is published here except short paraphrases of the concepts used.

## Slides (local, not published)

| Pages | Concept | Where it lives in the prototype |
|---|---|---|
| P24–26 | Scalable modules; diverse functional cover inside a legible spatial framework; "paint by number" as the conventional approach | A **Mix** is the reusable module (the paint); a **Design Assignment** binds it to a space. The bed framework stays legible (bed outlines, space outlines and mix labels in plan). Unlike paint-by-number, a fill is not a flat colour: it generates plants from roles, proportions and rules. |
| P28–34 | Operationalising plant functions: spatial layers by functional role; four planting systems (matrix-based, true meadow, maximal colour, under trees) with their roles | Mix roles carry two independent role fields: the **plan role** (from the Detroit legends: block, matrix, group, emergent, bulb) and the **community / functional role** (long-lived matrix, emergent forbs, warm / cool season growers, nitrogen fixers, clonal spreading …), each with its basis (`legend`, `list`, `assumption`). The four systems are starting points (`system` field), not closed options. |
| P32–33 | Substitute species but keep functional layers and roles | Every exclusion at a place (crown without shade knowledge, hypothetical wet class) first substitutes **within the same role**; only if no species of the role fits is the position left unplanted, with the reason. Substitutions are counted and shown. |
| P35–36 | Matrix-based mix: build the base, then add long-lived perennials; season of bloom | `matrix` / `intermingled` base roles + `groups` / `blocks` + `scatter` overlay; bloom months only from records (feedback month slider). |
| P41–43 | Blocks, emergents, ephemerals layered on the same ground | Three layers in every mix: **base** (share of area), **overlay** (plants / m², they take the place of base plants), **ephemeral** (drift coverage; bulbs among the perennials). |
| P44–52 | Phenology, seasonal activation, testing the proportion of forbs | Feedback month view (applicable bloom records only, coverage reported); target vs actual proportions per role after every change. |
| P53–58 | Curated databases; lists by habitat and by pattern of arrangement | The Plant Library joins the Detroit species to the Planting Intelligence knowledge base; the meadow lists' hydrology zone is a sourced site attribute; arrangement is a role property. |
| P67–74 | Rules-based planting; each analysis layer impacts placement; layering constraints (plants / slope / sun / elevation / proximity); automatic clustering | Rules read the Computational Space fields at the exact plant position: distance to path (role rules), existing tree crowns (trunk clearance, crown rule), hypothetical wetness. Sun, soil moisture and pH stay **unknown** — no rule pretends otherwise. k-means clustering (P74) is not used. |
| P84 | Automation, relative predictability, clarity, new possibilities, customisability, evolvability, openness | Deterministic, world-anchored generation (predictable, local); every result explains its rules, fields and unplanted reasons (clarity); mixes and rules are editable and versioned (customisable, evolvable); one JSON operation interface for people and AI (openness). |
| P124–130 | Site conditions → plant distribution; iterating soil and topography | The same mix painted on different ground responds to the fields; a hypothetical scenario can be switched on and off to compare (Experiment C). No model is trained: the prototype is rule-based, not data-driven. |

## Hand sketch (the "design logic" circled in red)

A point with a count, plants along a curve, drifts of blobs alongside a curve, a band following the ground, and an area
marked "mix × 2". Implemented as brushes that are independent of arrangement and role: **Point** (a small group of N
plants, phyllotaxis), **Curve** (a band of a chosen width: drifts in sequence along the curve, or rows), **Area** and
**Fill** (any mix, any arrangement). A curve band crossing paths is clipped to the beds.

## Land Kit (landkit.design) — concepts only

Land Kit is a commercial Grasshopper plug-in (licence keys, paid components); no code was looked at or copied. From
its public component reference:

| Land Kit component | Relationship | Here |
|---|---|---|
| Create Environment | topo + boundaries + analysis layers in one data-rich environment | the Computational Space (`compute.js`, Phase 01.3) — already existed |
| Create Niche | a plant's allowed range on a named environment layer (domain, cushion) | species suitability at a place: hydrology range vs (hypothetical) wetness class, shade knowledge vs crown; role rules on distance to path |
| Fill Area with Plants | area + environment + library, weighted random fill, packing ratio, constrained by niches | `engine.generate` — but **not random**: world-anchored lattice and dither, so a local edit never re-shuffles other places |
| Fill Area with Pattern | fill with a pattern of patches | block / group seeds on a jittered grid claiming lattice points (organic anisotropic cells) |
| Layout Plant Row | plants along a curve | Curve brush, `rows` mode |
| Rule Restriction Gradient | maps an attribute range to an analysis-layer range | role preference by field (edge rule); hydrology class vs wetness index |
| Pack Plants | relaxation to remove overlap | not needed: positions come from a lattice; an independent validation drops any plant closer than 0.55 × spacing |
| Freeze Area Plants | freeze plants in an area during later packing | **Keep** brush (snapshot of the plants in an area) and **Freeze** of an assignment — protected from later edits and mix changes |

## Groundhog (github.com/philipbelesky/groundhog)

Licensed **GPL v3**. This repository is MIT-licensed, so no Groundhog code is used; only the general idea that planting
can be computed from site layers informed the work.

## eco-gen (github.com/nandiyang/eco-gen)

A pix2pix conditional GAN that maps elevation, aspect and soil images to vegetation layouts (Santa Monica Mountains).
The README states the article is under CC BY-ND 4.0; no licence covers the code. Nothing is reused. Its message — site
conditions drive distribution — is honoured by rules on real fields; training a model on Detroit data is not possible
without plant-community data for the site.
