# Phase 02A.1 — Knowledge interface proposal (awaiting confirmation)

Design study only; no product code was changed. Phase 02A is kept as the local tag `knowledge-phase-02a`.

- `proposal.html` — the proposal (Chinese): workflow A → B → C, current vs new, what is kept / merged / hidden / reorganised, IA per collection, graph rules, data issues from screenshots 08/10/12/17, implementation order, open questions.
- `A-default-workspace.png`, `B-collection-analysis.png`, `C-after-adding-knowledge.png` — 1440×900 @2x renders of `mockup.html?s=1|2|3`.
- `mockup.html` + `data.js` — the mock-up page; every number, plant, link and value comes from `data.js`, computed by `tools/knowledge/mockup_data.py` from `knowledge/data/seed.json`. Only the note text in C is an example input (labelled in the image).
- `art/` — the ten AI-generated editorial illustrations of the original Plant Library (planting-db `platform/art`, declared "not evidence"); `img/` — the Yarrow photograph (Petar Milošević, CC BY-SA 4.0, Wikimedia Commons; see `img/ATTRIBUTION.json`).

Rebuild: `python3 -I tools/knowledge/mockup_data.py && python3 -I tools/knowledge/render_mockups.py`
