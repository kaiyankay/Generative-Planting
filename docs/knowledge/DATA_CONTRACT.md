# Data contract — `gp-knowledge-seed/1` + `gp-knowledge-workspace/1`

One fact is stored once. The **Base** is a read-only snapshot built from real sources; the **personal layer** is an append-only list of events in the browser. The **effective state** = Base + live events, computed the same way by `knowledge/src/kb.js` (browser) and `tools/knowledge/kq.py` (Python); the parity test proves they agree. Every view (Graph, Matrix, Table, Inspector, search, query API) is a projection of the effective state. Editing changes data, never node positions.

```
knowledge/data/seed.json            Base (build: tools/knowledge/build_seed.py)       ~3.3 MB, deterministic
knowledge/data/species_map.json     spatial sp.* → knowledge entity (read-only mapping)
knowledge/data/migration_manifest.json   counts in → out, kg edges not imported, aliases not used, exclusions
IndexedDB "gp-knowledge"            events · traces · files (this browser)
my-planting-knowledge-<date>.json   exported workspace (events + traces + attached files)
```

## Seed (`format: "gp-knowledge-seed/1"`)

| Key | Content |
|---|---|
| `meta` | `plantingDb.sha`, `spatialModel.sha256`, `external` (Robertson sha256, water fetch date), `ontologyVersion`, **`baseVersion`** (`base-` + 12 hex of the content hash) |
| `predicates` | registry: id → `{label, group, unit?, note?}`. New predicates can be registered; unknown kinds still work as generic records. |
| `edgeVocabulary` | `catRel` / `fieldRel` — the claim→concept edge names of planting-db `build_kg.py` (`grows_in`, `has_morphology`, `resists`, …) |
| `sources[]` | planting-db sources unchanged (+ `origin`, `layer`); spatial-model sources; Robertson; two Metro Vancouver pages |
| `entities[]` | `{id, type, name, aliases[], status, origin, layer, …}`; types: `plant`, `cultivar`, `concept`, `planting_system`, `role`, `dataset`, `topic` (+ user `list`) |
| `records[]` | see below |
| `relations[]` | rule-derived and ontology links: `{id, predicate, from, to, formation, rule, supportingRecordIds[], verdict?, conditions, legacyRef}` |
| `datasets[]` | `{id, title, sourceId, columns[], rows[][] (as published), rowsInSource, note}` |
| `aiChecks` | claim id → `{result, risk, explanation, missing_context, locator, model, method, reviewed_at}` — an AI's reading of the source, **not** verification |

### Entity

| Field | Meaning |
|---|---|
| `id` | stable. planting-db plants keep their ids (`achillea-millefolium`); ontology concepts keep theirs (`stress:drought`); Detroit taxa `taxon:<slug>`; survey candidates their synonyms.json id; user entities `my:<slug>` |
| `status` | `established` · `candidate` (survey taxon, identity not reviewed) · `provisional` (added by name, nothing known) · `placeholder` (legend name that is not a taxon) |
| `origin` / `layer` | `preset` (Base) or `user`; layer names the source collection (planting-db plant, Detroit model taxon, survey candidate, personal …) |
| `spatialIds` | `sp.*` ids that map here (Detroit model) |
| `legacy` | (planting-db plants) the original `entity`, `custom`, `fill_plan` objects |

### Record

```json
{
  "id": "arctostaphylos-uva-ursi:resistances:mobot01",          // planting-db claim id kept
  "subjects": ["arctostaphylos-uva-ursi"],                      // 0..n entities (0 = general knowledge)
  "objects": [],                                                // entities the record points at (role, list, dataset, place, plant_b)
  "edgePredicate": null,                                        // optional name for the subject→object link
  "predicate": "resistances",                                   // registered predicate (claim field, relation type, has_role, listed_in, …)
  "value": {"kind": "categorical", "data": ["stress:drought"], "value_label": ["drought"]},   // original structure: numbers, ranges, units, lists, rows
  "statement": "Missouri Botanical Garden: drought tolerant once established.",
  "quote": null,                                                // verbatim source words where we have them (water rules)
  "context": {"text": "...; once established", "place": "place:st_louis", "time": ["age:established"], "conditions": [], "cultivar": null, "scope": "source"},
  "concepts": ["stress:drought"],                               // ontology concepts → graph links
  "sourceRefs": [{"sourceId": "mobot", "sourceType": "database", "url": "...", "locator": "planting-db plants/arctostaphylos-uva-ursi.json · claim …", "accessed": "2026-11-02"}],
  "origin": "preset",                                           // preset | user
  "knowledgeKind": "attribute",                                 // attribute · observation · selection_reason · practitioner_note · warning · relation · rule · guidance · preference · practice · project_requirement · note · list_membership · document
  "evidenceStatus": "unverified",                               // verified · unverified · retired · documented · unreviewed · personal · personal revision · imported
  "verificationScope": null,                                    // planting-db: statement | content
  "formation": "documented",                                    // for relation records: documented · derived · candidate
  "active": true,                                               // false only for retired source records
  "confidence": 0.8,
  "layer": "planting-db claim",
  "legacyRef": "planting-db@d577104:plants/arctostaphylos-uva-ursi.json#…",
  "legacy": {"fields": {...unmapped original fields...}, "order": [...original key order...]}
}
```

Three axes stay independent: **origin** (preset / user), **evidence status** (verified / unverified / disputed via conflicts / personal …) and **formation** of a link (documented / derived by a named rule / candidate). Optional fields: `datasetId` + `datasetRows` (row indices into a dataset), `raw` (an imported row as typed), `extraction` (`not_run` for free text), `revises`, `why`, `derivedFrom`, `unresolvedName`, `spatialRefs`.

### Migration mapping (planting-db claim → record)

| claim | record |
|---|---|
| `id` | `id` |
| `plant` | `subjects[0]` |
| `field` | `predicate` |
| `value`, `value_kind`, `value_label` | `value.data`, `value.kind`, `value.value_label` |
| `text` | `statement` |
| `context`, `place`, `time`, `conditions`, `cultivar` | `context.text`, `.place`, `.time`, `.conditions`, `.cultivar` |
| `concepts` | `concepts` |
| `source_id`, `source_type`, `source_url`, `accessed` | `sourceRefs[0]` |
| `status` | `evidenceStatus` (+ `active = status != retired`) |
| `claim_kind`, `confidence`, `verification_scope` | `knowledgeKind`, `confidence`, `verificationScope` |
| everything else (`note`, `attribution`, `citation`, `practitioner_meta`, `survey_question`, `recorded_at`, `recorded_by`, …) | `legacy.fields` |

`relations.json` rows map the same way (`plant_a` → subject, `plant_b` → object, `relation_type` → predicate, `direction` → `value.data.direction`). Inverse functions `to_legacy_claim` / `to_legacy_relation` in `build_seed.py` are tested on all rows.

## Personal layer (events)

Append-only; each event `{id, at, type, label?, …}`. Nothing in the Base is ever written.

| Event | Payload | Effect |
|---|---|---|
| `add_entity` | `entity` | new provisional plant / list / topic (id must be new) |
| `add_record` | `record` | note, observation, preference, list membership, imported row, document reference |
| `revise_record` | `target`, `record` | the user's copy becomes active; target becomes history (`why: revised`, restorable) |
| `exclude` | `target` (record or relation), `reason` | left out of the effective view and retrieval; history keeps it |
| `include` | `target` | cancels an exclude |
| `add_source`, `add_dataset`, `add_file` | object | user sources, imported tables (rows as typed), attached files (blob in IndexedDB) |
| `batch` | `events[]` | one import = one event, one undo |
| `undo` | `target` (event id) | reverts that event; an undo can itself be undone (redo) |

Validation (both implementations): ids unique, every subject/object must exist, unknown event types are refused, batches may not nest. Imported text is data — it never becomes an instruction or an event.

**Effective rules.** A record is active unless excluded, superseded by a revision, or retired in its source. A rule-derived relation is active only while at least one of its `supportingRecordIds` is active ("support withdrawn" otherwise) — e.g. exclude all height claims of a plant and its KG-R2 height-band links disappear. Graph links are projected from active records (`concepts` → concept links named by `edgeVocabulary`; `objects` → `edgePredicate || predicate`) and active relations, aggregated per (from, predicate, to) with all supporting ids. A user record with no concept and no object becomes a visible record node on its subjects.

**Version.** `activeRevision = <baseVersion>+<live events>e:<fnv1a of all event ids>`; every query result and trace carries it.

## Scope rules

- `context.scope`: `source` (as the source states it), `recipe` (a role only within its recipe), `region` (water rules), `personal` (my practice), `project:<name>` (one project's requirement or budget).
- Preferences and project requirements never overwrite a source record; they sit beside it and are flagged in retrieval.
- Excluding a source record only removes it from *your* effective knowledge; it does not mark the source wrong.
- Place is never transferred silently: retrieval with a project place marks each result `same`, `unknown` or `different — do not transfer without checking`.

## Workspace file (`format: "gp-knowledge-workspace/1"`)

`{format, exportedAt, baseVersion, activeRevision, note, events[], traces[], files[{id,name,type,size,data(base64)}]}`. Import replaces or merges (by event id). A workspace made on another Base version still loads; ids that no longer exist simply have no effect. Personal data is never pushed anywhere automatically.

## Versioning the Base

Rebuild with a new planting-db SHA (`build_seed.py --sha …`) → new `baseVersion`. Record ids are stable across rebuilds (claim ids), so personal events keep pointing at the same records; a record that disappeared from the source leaves its events inert and visible in the change log.

## Two copies of the Base: public and full (2026-11-26)

Some source material has no cleared licence: the digitised Robertson 1929 table and the verbatim Metro Vancouver page text. So the Base exists in two copies, built together by `build_seed.py` (`--split` re-derives the public copy from the full one):

| File | What it holds | Published |
|---|---|---|
| `knowledge/data/seed.json` | **Public copy** (`meta.copy: "public"`, `meta.fullBaseVersion` names the full copy). The same entities, records and relations. The Robertson dataset has `rows: []`, `rowsLocalOnly: 1998` and `restricted`. The 7 Metro Vancouver records have no `quote`; instead they carry `quoteLocalOnly: true`, and their locator says the quote is kept local. | yes |
| `knowledge/data/local/seed.json` | **Full research copy**, with rows and quotes. | no (git-ignored) |

The two copies have different `baseVersion`s, because their content differs. Record ids are the same in both, so personal events apply to either copy.

Which copy is used:

- **The page.** On localhost, the page uses the full copy when it exists. `?copy=public` forces the public copy. On any other host (GitHub Pages) it always uses the public copy.
- **`kq.py` and `server.py`.** They use the full copy when it exists. `GP_KNOWLEDGE_COPY=public` forces the public copy.
- **The server's version check.** The server picks the copy named by the browser's `activeRevision`, so its version check still holds.

`getEvidence` returns `datasetRowsNote` instead of rows when a record's rows are kept local.

## Phase 02A.1 additions (backwards compatible; workspace format unchanged)

| Field | On | Meaning |
|---|---|---|
| `respondsTo` | personal revision / note | the preset record the designer answers; **not** a source of the designer's words (`sourceRefs` = `me` only) |
| `taxonMatch` `{method, checked, note}` | Robertson 1929 observation records | how the 1929 plant name was matched (exact spelling) and that it is not taxonomically checked; `evidenceStatus: "name-match lead"` |
| `plantType` + `plantTypeBasis` | Detroit taxa | type as listed in the spatial model's species list (field not marked inferred); heights, spreads and colours there are inferred and are **not** imported |
| `parent` | places | every place reaches `place:global` through `narrower_than` (Detroit, Carlinville → North America) |
| `dataset.unmatched[]` `{row, raw, why, candidates}` | imported tables | rows that could not be linked; kept with the table, never turned into records |
| `cites {text, url}` | personal note (optional) | a reference the designer relies on; the record's source is still `me` |

Rules added: a revision's `context` starts empty (place only if given, time = the day written); list membership is one record per (plant, list) with `datasetRows` listing every source row; place relation for retrieval = same / within / broader / elsewhere / unknown.

## Part B addition — Claude-assisted records (backwards compatible)

A record the designer confirmed from a Claude extraction preview is an ordinary personal `add_record`. Its `sourceRefs` is `[{ sourceId: "me" }]` and its `statement` is the designer's (possibly edited) text. It also carries:

```json
"extraction": { "method": "claude", "model": "claude-sonnet-5-5", "at": "…", "input": "the raw words, verbatim",
                "proposed": { …the model's statement as returned… }, "summary": "…or null", "topic": "behaviour",
                "confirmedBy": "designer", "edited": true }
```

- Several statements, or new provisional plants, are confirmed as one `batch` event, so one undo removes all of it.
- `extraction: "not_run"` (free text saved without extraction) is unchanged.
- Retrieval flags `method: "claude"` records as *structured by a language model from the designer's words; every field confirmed by the designer*, in both `kb.js` and `kq.py`.
