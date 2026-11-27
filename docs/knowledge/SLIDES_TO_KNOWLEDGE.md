# Slides → knowledge design

Source: Rainer, Landau & Liu, *Generative Planting at Scale* (2024-10-07), 137 pages; page numbers are PDF page order. The deck is used for its argument only; its tables, lists and images are not published here. The slides do not prescribe a schema, RAG or an LLM — what follows is this project's reading.

| Pages | What the slides argue | Data design here | Status |
|---|---|---|---|
| 16–17 | Automation beyond our understanding loses control; ChatGPT's groundcover picks vs a designer's experience (short-lived, high-pH failure, aggressive re-seeder) | Origin (preset/user), knowledge kind (attribute / observation / practice / preference / project requirement) and evidence status are separate fields. Designer notes are stored verbatim, flagged in retrieval as experience, never converted to traits. | Done: notes, revisions, flags (T03, T04) |
| 22–25 | Functional mixes; niche differentiation; how we cover the ground | A mix is a `planting_system` entity; membership and roles are records, so community-level statements can exist without being summed from species attributes. | Structure done; no community-performance data yet (gap) |
| 28–34 | Functional role *in a mix*; substitute species, keep roles; matrix-based, true meadow, maximal colour, under trees are examples | Roles are entities **per recipe** (`role:<mix>:<role>`); `fills_role` records link taxa to that recipe's role only. Detroit legends give *drawing* roles; `ecologicalRole` is `null` (unknown). The four mix types are not hard-coded. | Done for 8 Detroit recipes (298 records). Ecological roles: gap |
| 44–52 | Phenology and seasonal activation (P45 month sequence) | Flowering months stay on the record with its source and place; the Season lens draws one bar per record (St. Louis, UK, Metro Vancouver side by side), never merged; absent months are unknown. | Done for the 29 existing records. P45's month sequence (eastern US practice) is **not** imported. New sourced phenology for Detroit taxa: gap |
| 53–58 | Curated databases: pollinator research (P55–56), observation tables, lists by habitat (P57) and by arrangement (P58) | Datasets keep rows as published with locators; per-plant records point at rows; numbers keep their units; no composite scores. Lists create `listed_in` only — co-listing is not co-occurrence or compatibility. | Done: Robertson 1929 (public domain work, via GloBI) 1998 rows / 38 plants; list import with preview (T05, T06). P56 table and P57/P58 lists: private only (P57 used as a local test fixture) |
| 71–72 | Water, shade, pH, slope … each analysis layer changes placement; constraints combine | Conditions are claims with place and conditions; the Water & soil lens shows every source's value and marks disagreement. Site conditions belong to the spatial model (`GP.sampleConditions`: sun / moisture / pH unknown) and are never inferred from plant knowledge. Metro Vancouver water rules are records on topics, not plant traits. | Done (records + lens); no rule engine added, by design |
| 84 | Customisable, evolvable, open | Base + personal events; export/import; new predicates register without code; unknown knowledge stays a generic record. | Done |
| 122 | Accuracy, functionality, time | Evidence status, AI source check kept apart from verification, revision history, retrieval traces with revision ids. | Done |
| 123–130 | Local data and site context into AI | Place on every record; project place in retrieval flags cross-region transfer ("different — do not transfer without checking"). | Retrieval side done; no model trained or called |
| 135 | Rule-based generative design vs generative AI | Rule-derived links keep their rule id (KG-R1/R2/R4/R5) and are shown dashed; they disappear when their evidence is withdrawn. Generative AI is a future consumer of the same records, not a rule engine. | Done |

## Brief §5 checklist

| Demo corpus item | Delivered | Not delivered (gap, shown in the app as empty / unknown) |
|---|---|---|
| Functional roles / community | Detroit recipes: 8 systems, 26 recipe-specific roles, 298 role records | ecological roles; any second case |
| Phenology | 29 flowering-month records in the Season lens | a new sourced flowering dataset; Detroit taxa phenology |
| Ecological performance | Robertson 1929 visitor lists (presence) | visit rates / bee counts (P56 numbers are from a later analysis without a confirmed licence) |
| Local water conservation | 7 Metro Vancouver rules/guidance records | City of Vancouver pages (blocked), Stage 2–4 rules, any plant water-use figure |
| Curated plant list | list import end-to-end; P57 lists as private fixtures | a public, licence-confirmed list in the seed |
