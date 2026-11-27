# QA report — Phase 02A.1 Knowledge Workspace (and Phase 02A)

## Public branch (2026-11-26)

`feature/knowledge-workspace` on kaiyankay/Generative-Planting is one commit on main 3615e93. It carries a public copy of the Preset, without the licence-unclear Robertson rows and Metro Vancouver quotes (see `DATA_CONTRACT.md` › Two copies). Every suite was run on both copies, in the worktree `ARCH540/Generative-Planting-knowledge-public`:

| Suite | Full research copy (local) | Public copy |
|---|---|---|
| `run_knowledge_tests.py` (browser, real `/api`) | 133/133, kq parity ok | 133/133 with `--copy public`, kq parity ok. T06.1 and A15 check the "kept in the local research copy" state instead of rows. |
| `llm/test_llm.py` | 18/18; R01–R05 **Not run** | 18/18 with `GP_KNOWLEDGE_COPY=public`; R01–R05 **Not run** |
| `test_seed.py` | 34/34, including P01–P03: the public copy is exactly `public_seed(full)`, holds no quote or row, and keeps every record | P01 and P03 need the full copy |

Before and after pushing, every tracked text file was scanned for the 7 Metro Vancouver quotes (first 30 characters) and for the 623 insect names in the Robertson rows. Neither appears anywhere.

The two screenshots that show that material stay local and are marked `localOnly` in their indexes.

## Part B — Claude integration (2026-11-26)

| Suite | Result |
|---|---|
| `tools/knowledge/run_knowledge_tests.py` — everything above plus **B01–B21**, served by the knowledge server's own handler so `/api` is real | **133/133** + `kq.py` parity identical |
| `tools/knowledge/llm/test_llm.py` — L01–L11 (adapter) + S01–S07 (server) | **18/18** |
| Real-model tests R01–R05 | **NOT RUN.** Claude is not connected on this machine: no `anthropic` package, no credentials, no `GP_CLAUDE_ALLOW_CALLS=1`. |
| `tools/knowledge/llm/validate.py` | Part 1 (retrieval, Preset vs Combined): run. Part 2 (Claude's answers): **NOT RUN.** |
| Impeccable detector on the changed UI files | 0 findings |

What B01–B21 cover:

- Ask opens on demand in the inspector column, with the selection as context.
- Ask and Add share one text box.
- Retrieve shows exactly what `window.GPK` returns.
- The server rebuilds the browser's version from its events and returns the same records for Combined (with a new note) and for Preset (without it). A different revision gets 409.
- The connection state matches `/api/llm/status`. "Ask Claude" is enabled only when connected, and `/api/ask` returns `not_connected` with no answer text.
- What is sent is disclosed.
- Answer rendering, with citation numbers, entity links and unknown ids flagged.
- The three blocks are kept apart: answer, cited, retrieved.
- Following a citation updates the inspector and canvas, and Back keeps the answer.
- Ctrl/⌘+Enter runs retrieval.
- "Understand with Claude" is off when not connected.
- The editable preview: nothing is saved before Confirm. Confirm writes one batch with the raw input, the proposal, the model and the designer's confirmation, and adds the retrieval flag. Undo removes all of it. Discard saves nothing.

**Fixtures.** B10–B21 and L08–L11 test our code with fixtures, never presented as Claude. In the browser, the fixture's model name is `TEST FIXTURE — not model output`. In Python, a scripted stand-in replays fixed response blocks.

What S01–S07 cover:

- the three gates;
- 9 Combined and 9 Preset queries over HTTP, with the browser's ids and scores;
- 409 on a version mismatch;
- 403 cross-origin and 415 non-JSON;
- `private-inputs`, `.git` and `.claude` not served, including through `../` and encoded paths;
- `/api/ask` not connected.

Recording: `docs/screenshots/knowledge-02b/ask-session.gif`, 13 frames from one headless Chrome session against `server.py`.

## Part A — final refinement (2026-11-26)

| Suite | Result |
|---|---|
| `tools/knowledge/test_seed.py` | **31/31** |
| `tools/knowledge/run_knowledge_tests.py` — T01–T12, D01–D23, U01–U20 and the new **A01–A20** (expand in place, stable positions across layers, network satellites, compare cell / season bar / survey dot / recipe member / layer band as real targets, keyboard Enter / Shift+Enter, recipe compare default, Robertson layout, evidence classes, “+ mine” scope, tablet and phone widths) | **112/112** + `kq.py` parity identical |
| Impeccable detector (v4.11.1, engine 0.1.31) on the changed UI files | **0 findings** |

## Phase 02A.1 run (2026-11-26, same branch)

| Suite | Command | Result | Log |
|---|---|---|---|
| Migration / data / privacy / mapping + 02A.1 seed regressions (one Metro Vancouver place, place hierarchy, Robertson leads, no inferred spatial values) | `python3 -I tools/knowledge/test_seed.py` | **31/31** | `docs/qa/knowledge_seed_tests.json` |
| Browser: core T01–T12 (updated), regressions D01–D23 (every 02A.1 data issue), interface U01–U20 (real clicks in the new workspace, own test databases) | `python3 -I tools/knowledge/run_knowledge_tests.py` | **92/92**, 0 skipped on this machine | `docs/qa/knowledge_browser_tests.json` |
| Python retrieval CLI vs browser | (same run) `kq.py parity` | **identical**: revision, 1,062 active ids, ids + scores of 9 queries after edits and 9 Preset queries | `docs/qa/knowledge_parity.json` |
| Spatial model (unchanged: no file outside the knowledge paths differs from 5a7062d) | `python3 -I tools/test_model.py` | **23/23** | — |
| Spatial viewer | `tests.html` driven by `tools/knowledge/cdp.py` (the repository runner `tools/run_browser_tests.py` uses `--dump-dom`, which timed out twice in this environment) | **42/42** | — |
| Interaction screenshots (one real session) | `python3 -I tools/knowledge/screenshots.py` | 26 states | `docs/screenshots/knowledge-02a1/index.json` |

Data issue → fix → test mapping: `docs/knowledge/02a1/DATA_INTEGRITY.md`.

---

## Phase 02A run (kept for reference)

Run 2026-11-26 on branch `feature/dynamic-knowledge-canvas` (worktree `ARCH540/Generative-Planting-knowledge`). All results come from the commands below; logs in `docs/qa/`.

| Suite | Command | Result | Log |
|---|---|---|---|
| Migration / data / privacy / mapping | `python3 -I tools/knowledge/test_seed.py` | **26/26** | `docs/qa/knowledge_seed_tests.json` |
| Acceptance in headless Chrome (core + real UI in an iframe, own test databases) | `python3 -I tools/knowledge/run_knowledge_tests.py` | **65/65**, 0 skipped on this machine | `docs/qa/knowledge_browser_tests.json` |
| Python retrieval CLI vs browser | (same run) `kq.py parity` | **identical** revision, 1,064 active ids, ids + scores of 9 queries (after edits) and 9 Base queries | `docs/qa/knowledge_parity.json` |
| Spatial model (unchanged) | `python3 -I tools/test_model.py` | **23/23** | — |
| Spatial viewer in the browser | `python3 -I tools/run_browser_tests.py --url …` | **42/42** (the branch's spatial viewer, headless Chrome; the first attempt timed out while another agent's suite was using the CPU and port 8791) | — |

## Acceptance tests (brief §10)

| Test | Verdict | Evidence (test ids) |
|---|---|---|
| T01 Migration | **Pass** | 10 plants with original ids; 615 claims rebuilt byte-for-byte incl. key order; 534/70/11 status kept, retired = history; 41 relations rebuilt; 19 outside_db; 39 survey candidates retrievable; 438 concepts; claim→concept projection equals kg.json (1181 pairs); rule edges keep rule + supporting claims; 534 AI assessments kept apart; rebuild byte-identical (seed T01.a–m; browser T01.1–5) |
| T02 Add a plant | **Pass** | Acer griseum → provisional, 10 → 11 (seed set) and 150 → 151 (all plants); zero invented attributes, retrieval lists it as "known but empty"; case/spacing duplicate, aliases (Kinnikinnick, kinnikinnik, 熊果) and a cultivar name do not create entities; IndexedDB reload, export → import restore it; foreign files rejected (T02.1–9, T10.9) |
| T03 Personal knowledge | **Partial (by design of this phase)** | Yarrow note stored verbatim with kind, scope, place; Yarrow linked by exact alias; no trait or concept created; retrievable and flagged as preference; visible as record node (T03.1–5, T10.8). **No NL extraction**: no LLM/API is connected, records say `extraction: not_run`. |
| T04 Edit a base claim | **Pass** | Revision of MOBOT drought claim: seed object byte-identical; original superseded, revision active with previous value; Matrix, Table, Graph and retrieval follow; exclude removes from cell/graph/retrieval but keeps history; undo + restore → effective base records equal the Base; rule-derived KG-R2 links vanish when their supporting claims are excluded (T04.1–9, T10.5–7, T10.10) |
| T05 Import a list | **Pass** | Preview per row; Achillea + "Yarrow" row → same entity; Eurybia → provisional; "irrigation" ambiguous → kept unlinked; only `listed_in` links; rows kept as typed (T05.1–5). Private P57 lists: Yarrow in both lists → two `listed_in`, no new Yarrow (T05.6, local only) |
| T06 Research table | **Pass** | Robertson 1929 rows unchanged (1998 of 15261, 38 plants), per-plant record = count of listed visitor taxa with unit, no score; CSV import keeps values and the unit header, new fields searchable, no predicate or rule added (seed T06.a–b, T06.1–3). Licence of the digitised table to be confirmed by Kay |
| T07 Water + unfamiliar knowledge | **Pass** | 7 Metro Vancouver records with verified quotes, topic subjects, place, no water-saving figures; soil-biology/budget note with project scope stored and retrieved without schema change (seed T07.a, T07.1–3) |
| T08 Roles / time | **Pass (with data gaps)** | roles only within a recipe, ecological role null; flowering months per source and place, not merged; Detroit taxa keep no phenology (T08.1–4, seed T08.a–b). Gaps: no new phenology dataset, no ecological roles |
| T09 Data usage | **Pass (data retrieval only)** | same query before/after: revision in, superseded/excluded out, different revision id, trace stored, cross-region results flagged (T09.1–3). No LLM ran, so nothing is claimed about design behaviour |
| T10 Real interface | **Pass** | Graph node, relation line, Matrix cell and Table row open the same inspector; revise in the inspector updates Table, Matrix, Graph and the counts; Add-knowledge note appears in Graph and Inspector; reload keeps it; undo in the change drawer returns to Base; `GPK` read-only (T10.0–11) |
| T11 Privacy / safety | **Pass** | no e-mail, keys, raw survey export or respondent map in the seed; `private-inputs/` ignored and untracked; no slide tables/lists in the seed; instruction-like text stored as one data record; unknown event types refused (seed T11.a–c, T11.1–3) |
| T12 Spatial compatibility | **Pass** | every `sp.*` mapped with a status; Terra Cotta stays a cultivar (`cultivar_of` achillea-millefolium); both Cornus sericea ids → cornus-sericea; placeholders/lawn unresolved; `data/` unchanged; model tests 23/23, viewer tests 42/42 (seed T12.a–e, T12.1–3) |

## Manual walkthrough (browser pane, 1440×900 and 375×812)

- Overview → Kinnikinnick → drought link evidence → Add Acer griseum → Yarrow note → revise MOBOT claim → Matrix / Table / Graph in sync → import list → Season / Roles lenses → Robertson dataset → Retrieval diff → change drawer undo. Screenshots: `docs/screenshots/knowledge/01…18` (index with captions: `index.json`), made by `tools/knowledge/screenshots.py` on a throw-away database.
- Phone width: no page-level horizontal scroll (scrollWidth = clientWidth = 375); Matrix and Table scroll inside the canvas; inspector becomes a bottom sheet.
- Console: no errors during the walkthrough.

## Issues found and fixed during QA

- All KB instances wrote their effective state onto the shared seed objects, so the "Base" layer could show another instance's edits → each rebuild now works on its own copies; test T04.9 checks the whole seed is unchanged after edits in several instances.
- Focus graph showed ~100 neighbours → concept neighbours collapse per relation type (open on click); your own changes always stay visible.
- Concept inspector listed no records → records citing a concept or place are now included.
- planting-db `synonyms.json` names for Yarrow include source keys (`rhs`, `eflora…`) → not used as aliases (logged; source unchanged).
- Note text appeared twice in the inspector; toast counted record nodes as entities → fixed.

## Not done / limits

No LLM or extraction service (none authorised); PDFs and other documents are stored, not parsed; retrieval is keyword + alias; no new phenology dataset, ecological roles, community-performance data or public licence-confirmed plant list; personal layer is per browser (export/import to move it); the spatial `index.html` has no Knowledge link yet (left for the merge to avoid conflicts with Phase 01.1).
