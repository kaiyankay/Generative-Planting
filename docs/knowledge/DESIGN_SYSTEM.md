# Knowledge Workspace — design system (Phase 02A.1)

**Botanical modernism × scientific visualisation × landscape-architecture research tool.** Plants and knowledge carry the identity; the interface is paper, ink and rules. Tokens live in `knowledge/src/app.css` (`:root`), the shared vocabulary (names, glyphs, marks, month strips, icons) in `knowledge/src/ui.js`. Both are written so the future Design Workspace can import them unchanged.

## 1 · Principles

1. **White paper, one ink.** Background `#FFFFFF`; text `#252A25`. Hierarchy comes from size, weight, space and alignment — not from boxes.
2. **Colour is data.** Botanical green = preset plant data; mineral = structure and areas; terracotta = your knowledge. Five muted theme colours encode attribute themes in graphs. No decorative colour, gradient, shadow or illustration that is not a plant.
3. **Fine rules, right angles.** 1 px rules (`--rule #E1E4E0`, `--rule-2 #C9CEC8`), 1.5 px for the current tab / selection, no rounded cards, no pills (filter chips are square-cornered, outlined).
4. **Text buttons, one primary.** Actions are words with an underline on hover; the only filled button is the ink “Add knowledge” (terracotta “Save to my knowledge” inside the dialog).
5. **Never colour alone.** Every state also has a sign: a drawn diamond for mine, strike-through replaced/left out, dotted underline “name match only”, dashed “derived”, outlined (not filled) “species only”.
6. **Details on demand.** Record ids, version hashes, full synonym lists, licences, extraction status and raw rows sit under “Details” in the inspector or in Data & access.

## 2 · Typography

| Role | Face | Use |
|---|---|---|
| Display | **nct127** (Kay's typeface, `knowledge/fonts/nct127-Regular.woff2`, already the Planting Intelligence brand trial face) | wordmark, collection titles (30 px), section heads (20 px), big numbers |
| Text | **Archivo** (variable, true italics) | everything else: 13 px body, 12 px secondary, 10.5 px marks and captions |
| Data | **DM Mono** (the project's existing data face) | counts, ids, axis ticks, scores |

Botanical names: genus + epithet in italics, cultivar epithet upright in single quotes (`sci()` in `ui.js`), common name above the scientific name when one exists. Nothing is synthesised: nct127 has one weight and no italic, so it is never bolded or slanted.

## 3 · Colour tokens

| Token | Value | Meaning |
|---|---|---|
| `--paper` / `--wash` / `--wash-2` | `#FFFFFF` / `#F6F7F5` / `#EDF0EC` | page / hover, selected row / empty cell |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | `#252A25` / `#4C534C` / `#687068` / `#B3B9B2` | text levels (ink-3 ≥ 4.5:1 on white), axis ticks; ink-4 only for non-text marks |
| `--botanic` / `--botanic-ink` | `#82967D` / `#56694F` | preset plant data (bars, cells, glyphs) / its text-safe tone |
| `--mineral` / `--mineral-wash` | `#A8B8AE` / `#EDF2EE` | structure: group areas, field strata |
| `--mine` / `--mine-ink` / `--mine-wash` | `#B66D48` / `#96512E` / `#F8EDE6` | your knowledge (marks, lines, notes) |
| `--c-water` `--c-tol` `--c-eco` `--c-light` `--c-use` | `#6C91A4` `#9A8C55` `#6E8B66` `#C4A23F` `#8C789F` | attribute themes in the network and Connections |

## 4 · Layout

`Top bar 52 px` · `Collections rail 232 px` · `Canvas` · `Inspector 372 px (only on selection)`.
The inspector is a grid column: opening it narrows the canvas (`.work.with-insp`); it never overlays a chart, node or table. Each collection shows only its own views as text tabs, plus **Connections**. Dialogs (Add knowledge, Data & access) are the only overlays.

## 5 · Preset and personal knowledge

| | Preset | My knowledge | Combined |
|---|---|---|---|
| Data | the untouched Preset (`kbBase`) | the effective state, emphasising what is mine | the effective state (what retrieval returns) |
| Drawing | ink / botanic | mine in terracotta; everything else faded to context | mine in terracotta among preset |
| Marks | none | `◆` · strike-through originals | `◆ Mine`, `◆ my version`, `replaced by mine`, `left out` |

Same views, same layout, same data path — only the KB handed to the view and the emphasis change.

## 6 · Data encodings

- **Plant visuals.** The ten Plant Library illustrations (white-balanced copies of planting-db `platform/art`, AI-generated editorial art declared “not evidence”) for full profiles; for every other taxon a plan-symbol **glyph by plant type** (tree, shrub, forb, grass, sedge, bulb, fern — type from the Detroit plan's species list, never guessed; unknown = dashed circle). A cultivar never borrows its species' illustration.
- **Network.** Plant node = illustration in a white disc; attribute node = label with a theme tick and plant count; line width = number of independent sources (never confidence or performance); dashed = listed together by a designer; areas = exploratory groups; folded common ground listed below.
- **Connections.** Shapes by object kind: hexagon recipe, ruled rectangle dataset/list, dotted square survey, square source, triangle place, dot attribute, terracotta diamond my note; dotted line = name-match lead, fine dotted = identity link.
- **Compare.** Height = range bar per source (local street-tree median as a ringed dot); light = sun / part / shade symbols; water = dry→wet scale, dot size = sources; flowering = 12-month strip, shade = number of sources; designers = dots; Robertson = dashed bar (lead); dashed / outlined = via species.
- **Seasons.** One bar per record, grouped by plant, labelled by source and place; never merged.
- **Composition.** Strata are the plan legend's drawing roles in their documented order (not heights); a fine field hatch for matrix / meadow; a ground line before bulbs; five knowledge marks under each plant (profile, flowering, survey, Robertson lead, mine).
- **Charts.** Mono ticks in `--ink-3`, `--rule` gridlines, captions that state the method, place and period (borrowed from Plant Atlas 2020).

## 7 · References and what was taken

- **Pollinator Pathmaker** (looked at the live page): white field, black ink, a single typeface, one accent, the planting itself as the image → plants as the visual subject, near-zero chrome.
- **Plant Atlas 2020** (live species page): Helvetica-like neutral type, italic figure captions, month axes in ruled cells, method stated with each chart → captions with method, month strips in ruled cells.
- **Felt** (help centre tour): detail panel opens only on selection; view vs edit modes; tools appear in context → inspector on selection, edits inside the inspector.
- **Kumu** (map editor docs): selection swaps the side panel to the element's profile; focus and walk the map → inspector profiles, Connections centre/trail.
- **InfraNodus** (tutorial): clusters and structural gaps as first-class analysis; the network changes as text is added → exploratory groups, “carried by one plant only”, “not linked here”, gaps; your notes appear immediately.
- **Observable Plot** (examples collection returned HTTP 429 to the fetcher; conventions applied from the library's documented defaults): thin axes, mono ticks, direct labels, sequential vs categorical colour used for meaning.

None of these is copied; no asset from them is used.

## 8 · Distill pass (Impeccable `distill`, 2026-11-26)

Kay's direction: *avoid unnecessary secondary labels and descriptions; let the layout do the explaining.* Applied with the Impeccable skill (v4.8.0, `planting-db/.claude/skills/impeccable`, `distill` + craft floor; mechanical detector run on the changed files — 0 findings after the pass).

- **One line of words per screen at most.** Collection title + a quiet count (`10 / 285`); no lede, no scope paragraph, no chart captions. Method, scope and caveats live in hover titles, the inspector and Data & access.
- **No eyebrow labels.** The inspector shows the object's name only; the rail has no “Collections” heading and no per-item descriptions — name and count.
- **Legends only where they are also controls.** The network keeps its theme toggles; line-style and shape keys are gone (a hover names any line or node).
- **Footers, not bands.** The Plant Library network ends in one line: what is folded (expandable) and what is not linked. Groups explain themselves as areas (hover: what they share); knowledge only one plant carries moves to that plant's inspector (“Only here”).
- **Glyph ink carries knowledge.** In recipe compositions a plant's symbol is darker the more is known about it (profile, flowering, survey, Robertson); the five tiny squares and their key are removed.
- **Add knowledge beside the canvas, not over it.** The panel replaces the inspector column; the plants a note will attach to are outlined in the canvas while you write.
- **Layer shown by the frame.** My knowledge colours the canvas header rule terracotta; no explanatory banner.
- **Craft floor fixes.** Drawn diamond instead of a text glyph; no coloured left borders on notes or selected items; no hero-metric number row; no repeating-gradient stripes; themed selection, caret and scrollbars; tabular numerals; secondary grey raised to AA contrast.
- **One count for “mine”.** Rail, layer switch and Personal knowledge all count your live changes.

## 9 · Final refinement (Part A, after Kay's review)

The distill rules in §8 are **not** hard rules for scientific visualisation. Restored, kept short:

- **Scope line** under each title (what is in view, how many, which unit): e.g. “Full profile + 1 of mine — 10 species (1 provisional) · 645 knowledge records (not observations)”.
- **Keys that are always visible** — never hover-only: network (line width = independent sources, dashed = listed together, area = computed group, my knowledge, Preset-only ghosts), Connections (line styles and shapes), Compare (a drawn key for height, light, water, months, survey dots, Robertson bars, species-only), Profiles (the coverage strip with its eleven labels and fill meanings), Seasons, Survey dots, Curated databases, Robertson, recipe glyphs (type and ink).
- **Units in table headers** (m, respondents, insect taxa, my records, observations as reported, trees in the inventory).
- **Evidence classes** in words in the inspector and as marks: professional database · value read by a language model (planting-db T5) · not checked by a person / checked by a person · AI re-read the page (not verification); **language-model inference** (planting-db “model placeholder”) is its own class, never evidence.
- **Counts say what they count**: taxa, knowledge records, respondents, statements, observations (as the source reports), trees — never mixed.

Graph conventions added: **expand in place** (a dotted outer ring marks an expanded plant; satellites = an object's recipes, research, survey, places and notes; nodes already placed never move; each picture keeps its own frame and scales with the canvas); **ghost links** (dashed, ink-4) = in the Preset but replaced or left out in your knowledge. **Functional layers diagram** for recipes: one band per drawing role in the plan legend's order, a ground line before bulbs, one symbol per member; schematic — spacing and band height carry no height, density, function or position. **Keyboard**: every data mark (node, cell, bar, dot, member, band) is focusable; Enter selects, Shift+Enter expands in place. **Narrow screens**: ≤1280 px tighter; ≤1024 px collections behind a menu button; ≤760 px the inspector takes the screen.

## 10 · Ask and Claude (Part B)

- **One composer in the inspector column.**
  - Two display-type tabs: **Add knowledge · Ask**. The inactive tab is ink-3, the active one ink with a 1.5 px underline.
  - One text box. Switching tabs keeps the words.
  - It opens on demand from the top-bar Ask (an outlined `btn box`, beside the primary Add), from the inspector's speech-bubble icon (beside close), or from the tab. It is never a fourth panel.
- **Context chips** are neutral (no ◆ — they are not "mine"): layer, revision (mono, ink-3), selection with ×, project place as an underlined select.
- **Connection block** under the actions, after a hairline rule.
  - Not connected: the model name, then `✕` per missing gate (mine-ink).
  - Connected: botanic-ink.
  - "What is sent to Anthropic" is folded.
- **Answer blocks**, separated by hairlines, always in this order:
  1. *Answer*: model name in the heading.
  2. *Cited*: count, with warnings in mine-ink.
  3. *Retrieved by Claude's tools*: folded.
  4. *Retrieved here*: keyword index, no model.
- **Citations.**
  - Record citations are small ink-2 squares with a white mono number. An id the knowledge does not hold is shown as a hollow mine-outlined "?", never a link.
  - Entity references are underlined in botanic.
  - Following one hands the column to the inspector, which shows "← Back to your question" until the composer returns.
- **Extraction preview.** One block per statement:
  - a checkbox to include it, and the verbatim text in an editable box;
  - plants as chips (linked ◆ / unlinked struck / "+ name" for a new provisional plant);
  - kind as radio buttons;
  - Where / When / Conditions / In short as underlined fields;
  - "Left open" in ink-3;
  - the actions *Confirm and save N* (primary mine) and *Discard*.
