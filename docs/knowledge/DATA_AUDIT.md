# Data audit — Phase 02A knowledge migration

Audited 2026-11-26. Every number below comes from running `tools/knowledge/build_seed.py` / `test_seed.py` on the commits listed, not from earlier write-ups. Different metrics are kept apart: a **claim** is a sourced statement; an **AI source assessment** is a model's reading of the cited page; **verification** is a human status. They are not interchangeable.

## 1. Repositories and exact versions

| Repository | Role here | Version read | Notes |
|---|---|---|---|
| `kaiyankay/planting-db` | read-only migration source | `main` **d5771049d06c5d0e8b68614613655cd15cd6ea43** (2026-11-17, "Tidy: the website moved …") | Read with `git show <sha>:<path>`; the local checkout (on `docs/workflow-v5`) is not touched. Later branches (`dev/main` e2f719c, `feature/v5-1-design-quality` 9dcb473, `docs/workflow-v5` c19aaf0, `feature/topography-presets` ee9bcfb) change **no** file under `plants/`, `relations.json`, `sources.json`, `synonyms.json`, `ontology.json`, `data/survey/` — so d577104 is the complete knowledge state. |
| `kaiyankay/planting-survey` | survey design + privacy context | `main` 00ee216 (2026-10-29) | Vite app + Supabase schema; **no response data in the repository**. Survey is presented to respondents as anonymous (`docs/survey-spec.md`). Nothing is imported from this repo; the de-identified outputs already in planting-db are used. |
| `kaiyankay/planting-intelligence` | V4.3 published site (UI reference) | `main` 5d6124f (2026-11-17) | Generated static build. Used as a visual/interaction reference only (Network/Matrix/Table, evidence trace). No data imported from it (it is a build of planting-db). |
| `kaiyankay/Generative-Planting` | target | branch **`feature/dynamic-knowledge-canvas`** from `origin/main` 5a7062d | Another agent is working on `refinement/phase-01-1` (local, unpushed; 19051bc at audit time, plus uncommitted files) in `ARCH540/Generative-Planting`. This work lives in a separate worktree (`ARCH540/Generative-Planting-knowledge`) and adds files only — no existing file is modified. |

## 2. planting-db at d577104 — what is there

| Item | Count (run) | Status breakdown |
|---|---|---|
| Plant entities (`plants/*.json`) | **10** | ids kept: acer-palmatum, achillea-millefolium, arctostaphylos-uva-ursi, cercidiphyllum-japonicum, cornus-nuttallii, cornus-sericea, gaillardia-aristata, gaultheria-shallon, polystichum-munitum, vaccinium-ovatum |
| Claims | **615** | 534 unverified · 70 verified · 11 retired |
| — by claim kind | | 557 attribute · 29 observation · 22 selection_reason · 7 warning |
| — by source type | | 525 database · 47 municipal · 33 practitioner (survey) · 10 model |
| — with `verification_scope` | 70 | 37 `content` · 33 `statement` (statement = the respondent's words are accurate, the botany is not thereby checked) |
| — per plant | | 48 (V. ovatum) – 72 (A. uva-ursi) |
| — with a cultivar in context | 50 | |
| — places | | uk 137 · st_louis 96 · north_america 91 · willamette_valley 70 · vancouver 60 · pnw 59 · bc 54 · city_of_vancouver 37 · global 11 |
| Claim fields (`field`) | 24 | seasonal_interest 65, mature_height 54, exposure 50, … |
| Claims with flowering months | 29 | the only phenology data in the base |
| Relations (`relations.json`) | **41** | 15 co_listed (verified, survey) · 22 companion (retired model placeholders) · 2 layered_under, 1 competes, 1 companion (unverified candidates) |
| `outside_db` companion notes | 19 | companions named by sources but not in the DB |
| Sources (`sources.json`) | **35** | 10 database · 5 literature · 3 municipal · 1 model · 16 practitioner (survey parent + survey-r01…r15) |
| Synonym entries | see synonyms.json | 10 in-DB plants + survey candidates |
| Survey candidate evidence (`data/survey/candidate_evidence.json`) | **39 records** about **32 candidate taxa** | 33 d1 selection reasons + 6 d2 practitioner notes; all `unreviewed`; 15 anonymous responses, export 2026-11-14 |
| Ontology (`ontology.json` 0.2.0) | 438 nodes | 378 concept · 42 facet · 15 category · 3 axis; 53 concept relations |
| AI source assessments (`review/ai/assessments/*.jsonl`) | **534** | 427 supported_by_source · 102 partially_supported · 5 conflicting_evidence; all by `claude-fable-5-1`. **Not verification**: no claim status was changed by them. |
| Knowledge graph build (`brain/data/kg.json`) | 491 nodes · **2115 edges** | by status: 1811 documented · 211 derived · 46 candidate · 47 unknown. Conflicts: 67 disagreements, 1 variation, 5 design-use-vs-traits. Gaps: 436 single-source links, 41 design contradicted, 22 relations to confirm, … |

## 3. What was migrated, and how

| Source | Into | Count | Loss check |
|---|---|---|---|
| claims | records (same id) | 615 | `to_legacy_claim(record)` rebuilds every original claim **byte-for-byte, key order included** (test T01.b) |
| relations.json | records (same id; subject plant_a, object plant_b) | 41 | rebuilt exactly (T01.d); 22 retired kept as history |
| outside_db | records (`names_companions_outside_db`) | 19 | names kept; no edges to plants not in the base |
| survey candidate evidence | records (same id) on 32 candidate entities | 39 | verbatim text, anonymous id, status `unreviewed` (T01.f) |
| ontology nodes | concept entities | 438 (+3 places added: Detroit, Carlinville IL, Metro Vancouver region) | labels/aliases/definitions kept (T01.i) |
| kg.json rule edges | relations with `formation` + `supportingRecordIds` | 190 + concept/ontology 504 | KG-R2 height bands 105, KG-R5 layers 15, KG-R1 suited_for 33 (derived), KG-R4 suited_for 42 (candidate), M29 growth form 10, taxonomy 19, cultivar_of 8, ontology hierarchy 431, literature concept relations 53 |
| kg.json claim→concept edges | **not copied — re-projected** from records' `concepts` | 1181 (+110 concept-less claims) | identical pairs (T01.j); projected live so edits change them |
| kg.json `design … unknown` edges | not edges | 47 | "no evidence" is a gap, not a link |
| AI assessments | `aiChecks` annotation keyed by claim id | 534 | shown as "AI source check (not verification)" |
| sources | sources (fields untouched) | 35 | licence fields kept (T01.h) |

Re-running the build gives a byte-identical seed (T01.m): no duplicates on repeat.

**Defect found in the source data:** `synonyms.json` lists `rhs`, `eflora`, `eflora_native_bc_taxon`, `eflora_varieties_recognised_in_bc` among Yarrow's names (source keys leaked into the name list). Used as aliases they would make the word "rhs" resolve to Yarrow, so the migration does not use identifier-like names that are source ids or snake_case (4 dropped, listed in `knowledge/data/migration_manifest.json` → `aliases_not_used`). planting-db itself is not changed; fix there if wanted.

## 4. Added in Phase 02A (sourced, limited)

| Topic (brief §5) | Data | Count | Source and licence | Gaps |
|---|---|---|---|---|
| Functional roles / community | Oudolf Garden Detroit recipes from this repo's `data/detroit/model.json` (plan legends, design 2019-10 / bulbs 2020-09) | 8 planting systems, 26 roles-in-a-recipe, 298 `fills_role` + 26 `has_role` records, 245 Detroit taxa/cultivars | the spatial model's own sources (S-OGD-*) | roles are **drawing roles** from the legends; ecological roles are `null` (unknown) everywhere |
| Phenology | the 29 existing flowering-month claims, shown per source and place | 29 | planting-db | **No new phenology dataset was added.** Detroit taxa have none (model `phenology: null`). A sourced set (e.g. for the Detroit forbs) is an open item. |
| Ecological performance | Robertson, C. (1929) *Flowers and insects*, Carlinville IL — digitised by S.E. Miller (2015), indexed by GloBI; rows for plants already in the base | 1998 of 15261 rows; 38 plants; 38 `has_observation` records (count of listed visitor taxa) | 1929 work: US public domain. Digitised table: GitHub repo has **no licence file**; rows are factual presence records. sha256 012176…40548. **Kay to confirm reuse before formal publication.** | presence lists only (no visit counts, no per-row dates); Illinois 1884–1916, not Vancouver; the slide P56 table (Robertson et al. with n / S(n) / Smax) is from a later analysis and **not** imported |
| Local water conservation | Metro Vancouver "Lawn Watering Restrictions" + "Seasonal Lawn Care" pages | 7 records on 2 topics (lawn; trees/shrubs/flower beds), place Metro Vancouver region | quotes re-verified on the fetched page text (`sources/knowledge/fetch_log.json`); © Metro Vancouver, short quotes with attribution; copyright notice PDF could not be read — **Kay to confirm** | City of Vancouver pages refused automated access (HTTP 403); Stage 2–4 PDFs not read; no plant water-use figures exist in the data and none are invented |
| Curated plant list | public: a mechanism fixture of names (`knowledge/fixtures/list_names_mechanism.csv`); **private**: slide P57 lists "Perennials to overseed into planted mixes" (25 names) and "Forbs to seed into existing cool-season grasses" (22 names), from the PDF text layer, in git-ignored `private-inputs/` | 6 / 47 rows | P57 is course material: never committed or published | no public curated list with a confirmed licence was added to the seed |

## 5. What may be published and what stays local

Publishable (in the branch): the seed (planting-db is a public repository; survey content there is already de-identified with pseudonymous ids `survey-rNN`), Robertson subset (pending Kay's confirmation of the digitisation's reuse), seven short attributed Metro Vancouver quotes, test fixtures, code, docs, screenshots of the real UI with public data.

Local only (git-ignored `private-inputs/`): the 137-page slide PDF and slide excerpts, the P57 list CSVs, screenshots that show P57 content. Not touched at all: planting-survey raw responses (Supabase), `inputs/survey/respondent_map.json` (git-ignored in planting-db).

Checks: T11.a/T11.3 scan the seed for e-mail addresses, API-key patterns, raw survey exports and respondent maps; T11.b confirms nothing under `private-inputs/` is tracked; T11.c confirms no slide tables or list headings are in the seed.

## 6. Spatial project mapping (read only)

`knowledge/data/species_map.json` maps all 248 spatial `sp.*` ids: 2 `matched` (both Cornus sericea ids → planting-db `cornus-sericea`), 11 `same_taxon` (a second sp id for a taxon), 139 `new_entity` (species with no planting-db claims), 92 `cultivar` (own entity; `cultivar_of` link when the species is known — e.g. Achillea millefolium 'Terra Cotta' → achillea-millefolium), 3 `placeholder` (Eragrostis 'spec.', Ilex verticillata 'M + F', Iris germanica 'mixed'), 1 `not_a_taxon` (lawn). Nothing is merged; the spatial model file is unchanged (T12.e).
