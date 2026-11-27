# Phase 02A.1 — Data integrity and bug-fix report

2026-11-26 · branch `feature/dynamic-knowledge-canvas` · Preset `base-ebbbf3db18e5` (rebuilt from planting-db d577104; the 02A Preset was `base-d36a18bea643`).

Every issue listed in `docs/knowledge/redesign-02a1/proposal.html` §6 (screenshots 08, 10, 12, 17 plus review) and every check named in the 02A.1 brief §10 is fixed in code and guarded by a regression test that runs in the real data and, where it is an interaction, in the real interface. Test ids: `D…`/`T…` in `knowledge/tests.html` (browser), `D…` in `tools/knowledge/test_seed.py` (seed), `U…` = interface tests (iframe, real clicks).

Raw data was not edited: planting-db, the Detroit spatial model and the Robertson rows are read as they are. Fixes are in the migration (`build_seed.py`), the knowledge core (`kb.js`, `ingest.js`, `kq.py`) or in how the interface groups what it shows.

| # | Seen in | Problem | Cause | Fix | Tests |
|---|---|---|---|---|---|
| 1 | 08 | A Vancouver revision still read “St. Louis growing conditions; once established” (time `age:established`) | `makeRevision` copied the original `context` | A revision starts from an empty context: place only if the designer gives one, time = the day it was written, no conditions, scope `personal`/`project:…` | D01, U10 |
| 2 | 08 · 17 | MOBOT listed as a source of the designer's own revision; retrieval showed MOBOT supporting it | `sourceRefs` of the original were appended | Sources = `me` only; the original is linked as `respondsTo` (shown as “Answers the preset record”) | D02, U10, U11 |
| 3 | 08 | The designer's observation was typed `attribute` | `knowledgeKind` was inherited | Default `observation`; the designer picks observation / practice / preference / project requirement / note | D03 |
| 4 | 08 | Graph showed Yarrow, inspector showed a Kinnikinnick record | graph focus and selection were two states | One selection (`app.sel`) drives every view's highlight and the inspector; the graph centre changes only by “Explore connections” / double-click | U03 |
| 5 | 10 | Inspector kept a matrix cell from another view; the cell summary said “from source, unverified” although it held my revision | inspector not re-rendered on view/layer change; `cell()` mixed my records into the source status | Inspector re-reads the object from the current layer on every change; a collection switch drops a selection the new view cannot show; `cell()` returns `user`, `mine[]` (with what each revises) and a status computed from preset records only (`mine` when only my records) | D05, U03, U12 |
| 6 | 10 | “Mine” did not show the plant I added | “Mine” listed records only | Personal knowledge lists added plants and lists, notes, my versions against their originals, exclusions, imports with unlinked rows, and the full history | U15, D20 |
| 7 | 12 | “Achillea millefolium” and “Yarrow” rows of one list gave two `listed_in` records (“listed in 4/6”) | one record per row | One membership per (plant, list); every source row kept (`datasetRows`, raw rows) and named in the statement | T05.4, U14 |
| 8 | 12 | The unmatched row “irrigation” became an active record “(no subject) … is listed in …” and was counted | unmatched rows produced records | Unlinked rows produce no knowledge record; they stay in the imported table (`dataset.unmatched`) and are reported (“1 row not linked”) | T05.5, U14 |
| 9 | 12 | A new provisional plant looked like an established one; the list was titled from the file name | no identity mark; no title step | Identity is its own dimension (established / provisional / unconfirmed / placeholder) with a visible mark everywhere; import waits for a title and a source | U07, U14 |
| 10 | 17 | My Vancouver revision was “place: different” for a Metro Vancouver project | 02A added `place:metro_vancouver` beside planting-db's `place:vancouver` (whose name is “Metro Vancouver”); Detroit and Illinois had no parent | Seed: one Metro Vancouver place; water rules moved to `place:vancouver`; Detroit and Illinois joined to North America. Retrieval returns `placeMatch` = same / within / broader / elsewhere / unknown from one hierarchy (JS and Python identical) | seed D10.a–c; D10.a, D10.b, T09.3 |
| 11 | review | All 38 Robertson plant matches are by spelling (e.g. *Pycnanthemum flexuosum* in 1929 Illinois usage may be today's *P. tenuifolium*) | no taxonomic review | `evidenceStatus: "name-match lead"` + `taxonMatch {checked:false, note}`; retrieval flags it; drawn dashed/dotted and labelled “name match only”; kept visible as a research lead, never as established evidence | seed D11; D11 |
| 12 | review | One survey answer appears twice (Yarrow sv02/sv03) and two “derived from the respondent's note” claims repeat an answer | planting-db stores the same answer under several fields | Data unchanged; the interface groups by respondent + text and shows it once (“2 records, one answer”) | D12 |
| 13 | review | `synonyms.json` lists source keys (`rhs`, `eflora…`) among Yarrow's names | planting-db data | Not used as names since 02A (`clean_names`); a fix in planting-db is still recommended | D13 |
| 14 | brief | “150 plants” and “277 taxa” were different scopes shown without saying so | 150 = species without survey names; 277 = 10 library + 235 plan taxa + 32 survey names (and left out the 8 cultivars in planting-db's graph) | One tally per stable entity: **150 species · 100 cultivars · 3 placeholders · 32 unconfirmed survey names = 285 taxa**, and records counted separately | D14, U01 |
| 15 | brief | A note about an existing plant raised the plant count | counts mixed records and entities | Notes add records only; the plant gains “with my knowledge” (contribution), not “added by me” | D15, U09 |
| 16 | brief | Cultivar coverage mixed its own knowledge with its species' | no distinction | `coverage.direct` vs `coverage.via` (species); views mark species knowledge “via species” (hatched / dashed) | D16 |
| 17 | brief | Recipe analysis defaulted to the ten Vancouver plants | fixed plant scope | Recipe views use the recipe's real members (B beds: 46) | D17, U16 |
| 18 | brief | “2–7 of 10 plants” was the graph's rule | — | It is now only the Plant Library network's display filter: concepts on ≥ 80 % of the scope are folded (listed, expandable), everything drawn is backed by active records; the underlying graph is unchanged | D18, D23 |
| 19 | brief | Three groups were fixed | — | Groups are recomputed from the records in view (average linkage, Jaccard ≥ 0.25); their number follows the data; labelled exploratory, not communities | D19 |
| 20 | brief | Knowledge without shared links could vanish | network drew shared links only | Unlinked plants (e.g. one you added) are listed under “Not linked here” and remain in Profiles, Connections and retrieval | D20 |
| 21 | brief | The knowledge graph was only plants × attributes | — | Connections explores from any object across collections; every neighbour carries its records (identity links are marked as such) | D21, D22, U04, U05 |

Checks the brief asked for explicitly:

- **Personal revisions do not inherit place, source, time or context** — D01, D02, D03.
- **Metro Vancouver duplicate** — seed D10.a–c, D10.a/b.
- **Synonym duplicates in lists** — T05.4, U14.
- **Unmatched content not counted** — T05.5, U14.
- **Graph, Table/Compare, Inspector selection consistent** — U03, U12.
- **Original research vs personal observation** — D02, D03, marks `◆ Mine` / `my version` / `replaced by mine` / `name match only`, retrieval flags (U11, U12).
- **150 vs 277** — D14 (now 150 species within 285 taxa).
- **Note on an existing plant does not add a plant** — D15, U09.
- **Direct cultivar vs species coverage** — D16.

Restrictions kept: the digitised Robertson table (no licence file) and the verbatim Metro Vancouver quotes stay in this local research build and are marked “not for publication” in Data & access; course slides and P57 lists remain in git-ignored `private-inputs/`.
