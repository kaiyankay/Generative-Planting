# Retrieval API — LLM access to the same effective knowledge

Human access (Graph / Matrix / Table / Inspector) and LLM access read the **same** effective state (Base + personal events). The API returns structured records — ids, values, units, sources, context, status, flags, gaps — never a generated summary. No LLM is connected in Phase 02A; this is the data side a future tool call would use.

Two implementations, proven equal by `tools/knowledge/run_knowledge_tests.py` (parity: same `activeRevision`, same 1,064 active ids, identical returned ids **and scores** on 9 queries incl. Chinese and alias queries, before and after edits):

| Where | How |
|---|---|
| Browser | `window.GPK` on `knowledge/index.html` (read-only, frozen; no write methods) |
| Python / server / scripts | `tools/knowledge/kq.py` over `knowledge/data/seed.json` + an exported workspace file |

## Calls

| Call (JS) | CLI | Returns |
|---|---|---|
| `GPK.searchKnowledge({query, projectContext:{place}, limit, includeHistory, subjectIds})` | `kq.py search "<q>" [--place place:vancouver] [--limit N] [--workspace f.json] [--trace log.jsonl]` | `{query, projectContext, activeRevision, at, returnedRecordIds[], results[], missing[], method, traceId}` |
| `GPK.getRecords({subjectIds, predicate, place, includeHistory})` | `kq.py records --subject <id> [--predicate p] [--history]` | `{activeRevision, records[]}` |
| `GPK.getEntity(id)` | `kq.py entity <id>` | entity (without legacy blob), active / history record ids, edges, revision |
| `GPK.searchEntities(q, {types, limit})` | — | ranked name/alias matches |
| `GPK.resolveSpecies({canonicalKey, scientificName, cultivar})` | `kq.py resolve "<name>"` | `{status: exact│ambiguous│none, entityId, candidates, cultivarOf, spatialIds}`; cultivars and placeholders are never merged |
| `GPK.getNeighborhood({entityId, depth, limit})` | — | nodes + edges (with supporting record / relation ids) |
| `GPK.getDataset(id)` / `GPK.getEvidence(recordIds)` | — | rows as published; records with full sources, legacy refs and dataset rows |
| `GPK.activeRevision`, `GPK.counts()`, `GPK.diff()`, `GPK.traces()` | — | version, counts, Base→effective diff, stored traces |

### A result record

```json
{
  "recordId": "my-rev-…", "score": 11.362827,
  "subjects": [{"id": "arctostaphylos-uva-ursi", "name": "Arctostaphylos uva-ursi"}],
  "predicate": "resistances", "value": {"kind": "text", "data": "drought tolerant only once established; …", "previous": {…original value…}},
  "valueText": "…", "statement": "…", "context": {"text": "…", "place": "place:vancouver", "scope": "personal"},
  "sourceRefs": [{"sourceId": "me", "sourceName": "My knowledge (this browser)", "locator": "personal revision of arctostaphylos-uva-ursi:resistances:mobot01 — own observation"}, {"sourceId": "mobot", …}],
  "origin": "user", "knowledgeKind": "attribute", "evidenceStatus": "personal revision", "state": {"active": true}, "revises": "arctostaphylos-uva-ursi:resistances:mobot01",
  "placeMatch": "same",
  "flags": ["personal knowledge (designer-provided; not externally verified)"],
  "aiSourceCheck": null
}
```

Flags tell a model how to treat a record: personal knowledge; experience or preference ("use as a lead, not as a measured trait"); free text with no extraction run; unverified in the source database. `aiSourceCheck` is labelled "an AI read the cited source; this is not human verification". `missing[]` lists entities named in the query that have no active records ("attributes unknown").

## Method

Keyword + alias retrieval over effective records (no embeddings, no LLM): canonical text per record (statement, quote, context, predicate label, subject / object / concept names and aliases, place, string leaves of the value, source names, raw imported row) → tokens (NFKD fold, lower case, ASCII words + single CJK characters, light plural strip) → score = Σ log(1 + N/df) over distinct query tokens, +2 when a record's subject is named in the query (alias route, as in planting-db `tools/retrieve.py`). Ties by record id. The index is rebuilt on every event, so an edit is visible to the next query. Inactive records (excluded, superseded, retired) are left out unless `includeHistory`.

This is a deliberate small baseline; a semantic adapter (embeddings, GraphRAG) can replace the scorer later while keeping the same inputs (effective records) and outputs (record ids + evidence).

## Traces

Every `searchKnowledge` call records `{id, query, projectContext, limit, activeRevision, at, returnedRecordIds}` (browser: IndexedDB `traces`, included in workspace export; CLI: `--trace file.jsonl`). The Retrieval drawer adds a snapshot of the returned values so a later run can be compared (+ new, − gone, changed value).

What traces do **not** claim: they record what was *retrievable and returned* for a query at a revision. They are not a record of what a model read, cited or decided; a future LLM run must additionally log the ids actually passed to the model and the ids it cites in its answer or design patch.

## Example (real, from the tests)

Query `Kinnikinnick drought water`, project place Metro Vancouver:

- Base (`base-…+0e`): returns `arctostaphylos-uva-ursi:resistances:mobot01` ("drought tolerant once established", MOBOT, St. Louis — flagged `placeMatch: elsewhere`).
- After the designer's revision (`…+4e`): `mobot01` is no longer returned (superseded, kept as history); `my-rev-…` is returned with the designer's wording, place Vancouver, flagged as personal knowledge, carrying the original value under `value.previous`.

Data retrieval changed; nothing is claimed about any design behaviour — no model was run.

## LLM access (Part B, built; not connected on this machine)

Claude reads this API through the local knowledge server (`tools/knowledge/server.py`). Five strict, read-only tools sit over the same effective knowledge as the page:

- `search_knowledge` = `searchKnowledge`
- `get_evidence` = `getEvidence`
- `get_records`
- `get_entity`
- `resolve_name`

The server rebuilds Preset + the browser's events with `kq.py` and refuses (409) a request whose `activeRevision` differs. `POST /api/retrieve` gives the same retrieval over HTTP, with no model. Answers return retrieved ids, cited ids and the text separately. See `docs/knowledge/02b/CLAUDE_INTEGRATION.md`.

## Future spatial flow (not implemented)

project request + spatial context (`GP.getPlantingContext`, `GP.sampleConditions` — unknown site conditions stay unknown) + scoped designer knowledge → `searchKnowledge` / `getRecords` / `resolveSpecies` → model proposes selections or substitutions citing record ids → spatial model patch tools (`GP.applyPatch` on a draft) → human review. Documents passed to a model are data; instructions inside them are not executed (test T11.1 covers this on the storage side).

## Phase 02A.1 changes

- **Place match** uses one place hierarchy (planting-db `narrower_than`, plus Detroit and Carlinville joined to North America). With `projectContext.place`, every result carries `placeMatch` and `placeNote`:
  `same` (the project place) · `within` (recorded inside it, e.g. City of Vancouver for Metro Vancouver) · `broader` (a region containing it, e.g. BC, Pacific Northwest, North America — applies, but less specifically) · `elsewhere` (UK, St. Louis, Detroit … — do not transfer without checking) · `unknown` (no place stated). Mirrored exactly in `kq.py` (`place_relation`). The 02A duplicate `place:metro_vancouver` is gone; use `place:vancouver` (“Metro Vancouver”).
- **New flag**: `historical plant name matched by spelling only; taxonomy not checked — a research lead, not established evidence` on Robertson 1929 records (`evidenceStatus: "name-match lead"`, `taxonMatch.checked: false`).
- **Personal revisions** return `sourceRefs` = `me` only and a `respondsTo` field naming the preset record they answer; their `context` is the designer's own (no inherited place, time or conditions); `knowledgeKind` is what the designer chose (default `observation`).
- **Imported lists**: one `listed_in` record per (plant, list), with every source row in `datasetRows`; rows that could not be linked are not records (they are in `getDataset(id).unmatched`).
