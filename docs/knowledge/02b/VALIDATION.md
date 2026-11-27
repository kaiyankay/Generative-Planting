# Preset vs Combined — validation run 2026-11-26 20:10

- Preset `base-ebbbf3db18e5+0e:811c9dc5` · Combined `base-ebbbf3db18e5+8e:8568833b`
- Designer layer: TEST EVENT SCRIPT from the browser tests (docs/qa/knowledge_parity.json) — not a real designer's knowledge

## Part 1 — retrieval (real, no model)

Top 12 records per question, keyword + alias index (the same in the browser and in `kq.py`). What changes between layers is only what the designer layer adds, revises or leaves out.

| Question | Same records (Jaccard) | Added in Combined | Left out in Combined |
|---|---|---|---|
| Is Kinnikinnick suitable for a dry, sunny slope in Vancouver? | 0.846 | 1 (1 personal) | 1 — pushed below the top 12 by other records |
| How much summer water does Yarrow need once established? | 0.846 | 1 (1 personal) | 1 — revised by my-rev-fix-kinni |
| Which plants in the library tolerate drought? | 0.714 | 2 (1 personal) | 2 — excluded, revised by my-rev-fix-kinni |
| What do the designers in the survey say about Yarrow? | 0.846 | 1 (1 personal) | 1 — pushed below the top 12 by other records |
| Which insects visit Zizia aurea flowers, and where was that recorded? | 0.714 | 2 (2 personal) | 2 — pushed below the top 12 by other records |
| When can a new planting be watered under Metro Vancouver's restrictions? | 1.0 | 0 (0 personal) | 0 |
| Which members of the B beds recipe flower in late summer? | 1.0 | 0 (0 personal) | 0 |
| Acer griseum | 0.846 | 1 (1 personal) | 1 — pushed below the top 12 by other records |

## Part 2 — Claude's answers (same model, questions and settings per layer)

**NOT RUN.** Claude not connected: Python package "anthropic" is not installed — pip install anthropic; no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / `ant auth login` profile on this machine; paid calls not authorised — start the server with GP_CLAUDE_ALLOW_CALLS=1 when you want real calls.

Nothing about Claude's answers is reported here. When run, each question records, per layer: what the tools retrieved, what the answer cited (and any citation not retrieved or not in the knowledge), and the answer text — kept apart.
