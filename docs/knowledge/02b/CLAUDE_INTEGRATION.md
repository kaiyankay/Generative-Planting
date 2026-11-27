# Claude integration — Phase 02A.1 Part B

Status on 2026-11-26: **built, tested without a model, not connected.** This machine has no `anthropic` Python package, no Anthropic credentials and no authorisation for paid calls. No request has been sent to Anthropic, and no API cost has been incurred. No answer or extraction shown anywhere in this branch comes from Claude.

## Shape

```
browser (knowledge/)                         local server (tools/knowledge/server.py, 127.0.0.1 only)
─────────────────────                        ───────────────────────────────────────────────────────
KB = Preset + my events (IndexedDB)          kq.KB(seed, events)  ← rebuilt from the browser's events
window.GPK (read-only)                       revision check: 409 if it differs from the browser's
Ask / Add composer (right column)  ──POST──▶ /api/retrieve        keyword retrieval, no model
  events + activeRevision + layer            /api/ask             Claude + read-only tools over that KB
                                             /api/ingest/extract  Claude → editable preview (never saved here)
                                   ◀──GET─── /api/llm/status      the three gates, never the key
                                                    │
                                             tools/knowledge/llm/provider.py
                                             official `anthropic` SDK (lazy import)
```

- The page and the API share one origin, so the browser never holds a key.
- `window.GPK`, `kq.py`, IndexedDB, the event log, the workspace file and the parity test are all unchanged in role.

## The three gates

`provider.status()` reports each gate. All three must be open before any call is made:

| Gate | Open when |
|---|---|
| SDK | `pip install anthropic` (imported only when a call is made) |
| Credentials | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` profile |
| Authorisation | the server is started with `GP_CLAUDE_ALLOW_CALLS=1` |

If any gate is closed:

- `/api/ask` and `/api/ingest/extract` return `{"status":"not_connected", ...}` and contain no answer text.
- The page shows "not connected" with the reasons and disables "Ask Claude" and "Understand with Claude".
- Retrieval and the plain Save keep working.

To connect, once you decide to pay for calls:

```bash
pip install anthropic
```
```bash
GP_CLAUDE_ALLOW_CALLS=1 ANTHROPIC_API_KEY=sk-ant-… python3 -I tools/knowledge/server.py
```

Then open http://127.0.0.1:8782/knowledge/ (launch config `gp-knowledge-api`).

## Model settings

| Setting | Value |
|---|---|
| Model | `claude-sonnet-5-5` (override: `GP_CLAUDE_MODEL`) |
| Call | `client.beta.messages.create` |
| Effort | `output_config.effort = "medium"` (override: `GP_CLAUDE_EFFORT`) |
| Thinking | adaptive (the model default; `thinking` is not sent) |
| `max_tokens` | 16000 |
| System prompt | cached (`cache_control: ephemeral`) |
| **Server-side refusal fallback** | **enabled**: `betas=["server-side-fallback-2026-07-01"]`, `fallbacks="default"`. A refusal is retried on the documented fallback model; if it is still refused, the page shows "declined" and no answer. |

**Tool loop.** The loop is written out by hand, so every tool call is recorded:

- `tool_use`: all tool results go back in one user message.
- `pause_turn`: the loop continues.
- `end_turn`, `max_tokens` and `refusal` end the loop. `max_tokens` is shown as the stop reason.

There are at most 8 rounds.

**Tools.** All five are strict (`strict: true`, `additionalProperties: false`, every property required) and read-only:

| Tool | Returns |
|---|---|
| `search_knowledge(query, project_place)` | kq retrieval: same ids, order and scores as `window.GPK`, plus place match and flags |
| `get_evidence(record_ids)` | full records; unknown ids are reported, never invented |
| `get_records(subject_id, predicate)` | records in effect for an entity. The designer's own records come first, so they are never the ones cut at 40 |
| `get_entity(entity_id)` | names, type, status and the ids of its records in effect |
| `resolve_name(name)` | exact / ambiguous / none; never guesses |

**Citations.** The system prompt asks for `[[record:ID]]` and `[[entity:ID|name]]`. The server checks every cited id against the effective KB and against what the tools retrieved. The page then shows three things apart:

1. **Answer.** Citations are numbered links; ids the knowledge does not hold show as "?" and are not linked.
2. **Cited.** Each cited record, marked "not retrieved by a tool" where that applies.
3. **Retrieved by Claude's tools.** All tool calls and the records they returned.

The page's own **Retrieved here** (no model) stays below these three.

**Extraction.**

- `output_config.format` uses a strict JSON schema: statements, plants as written plus entity id, kind, place, time, conditions, topic, "in short", and what was left open.
- The model may call `resolve_name` and `search_knowledge` while it works.
- The server clears any entity or place id the knowledge does not hold.
- The browser shows an **editable preview**. Nothing is saved until the designer presses *Confirm and save*.
- Confirmation writes one event through the normal path, so Undo removes all of it. Each record keeps:
  - `sourceRefs: me`;
  - `extraction: { method: "claude", model, at, input (the raw words), proposed (the model's proposal), summary, topic, confirmedBy: "designer", edited }`.
- Retrieval flags these records as "structured by a language model from the designer's words; every field confirmed by the designer".

## What leaves the machine when Claude is connected

- The question.
- The layer, the knowledge revision, the project place and the selected object's name.
- Whatever the tools return. **This includes the designer's own notes when they match.**

The panel says this under "What is sent to Anthropic".

These stay local (`model_view()` in `provider.py`):

- verbatim third-party quotes (the `quote` field and quote locators: Metro Vancouver);
- digitised dataset rows (Robertson 1929);
- `raw` and `legacy` fields.

The public copy of the Preset (`knowledge/data/seed.json`, see `DATA_CONTRACT.md`) does not hold those quotes or rows at all. They exist only in the full research copy on this machine.

The statements and values of those records are paraphrases and do go to the model. Private survey material is not in the seed at all, so it cannot be sent: only pseudonymous respondent ids and statements already in planting-db are there.

## Server safety

- Binds 127.0.0.1 only.
- POSTs from another web origin are refused (403), so a web page cannot spend API credit.
- Only `application/json` is accepted (415). The body limit is 8 MB.
- `/private-inputs`, `/.git`, `/.env` and `/.claude` are never served, including through `../` or percent-encoded paths.
- The log records method and path only.

## Research validation

`tools/knowledge/llm/validate.py` puts the same questions to Preset and to Combined.

- **Part 1 (run):** real retrieval differences. See [VALIDATION.md](VALIDATION.md).
- **Part 2:** the same model, questions and settings answer once per layer. For each run it records what was retrieved, what was cited (with any citation that was not retrieved, or is not in the knowledge) and the answer.
  - Part 2 is **NOT RUN**: it needs `--run-model` and an open connection.
  - No outcome is assumed.
- The designer layer is `--workspace <exported file>` (Kay's knowledge). Without it, the browser tests' event script is used and labelled as test data.

## Tests

See `docs/knowledge/QA_REPORT.md`, Part B.

- **Real-model tests R01–R05:** NOT RUN.
- **Loop tests L08–L11:** use a scripted stand-in that replays fixed blocks. They test what our code sends and how it handles each stop reason. They say nothing about Claude's answers.
- **Browser tests B10–B21:** use a parser or preview fixture whose model name is `TEST FIXTURE — not model output`.
