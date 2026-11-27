# Generative Planting V2 — visual and interaction changes

## Why
Kay's feedback on V1: the interface looked like a generic admin back-office (white paper, grey rules, Archivo, square
buttons, a stacked panel log). V2 restores the visual identity of Planting Intelligence V4.3 (live at
kaiyankay.github.io/planting-intelligence, source `planting-db/platform/css/platform.css`) and adds the continuity of a
bottom observation dock (principle borrowed from Pollinator Pathmaker — position and continuity only; no logo, icon,
font or code copied).

## Tokens (one table for Intro, Design and Knowledge — `src/flow/flow.css`)
| token | value | source / reason |
|---|---|---|
| ivory / paper / paper-2 | `#F7F3EA` / `#FFFDF8` / `#F3EEE3` | V4.3 `--pi-ivory`, `--pi-paper`, `--pi-paper-2`: warm paper instead of white |
| ink / ink-2 / ink-3 | `#27241F` / `#5C5648` / `#716B5C` | V4.3 charcoal ink (contrast ≥ 4.5 on paper for ink-2 and ink) |
| olive-deep / olive / olive-soft | `#3B5538` / `#5B7A57` / `#DFE6D7` | V4.3 — primary action, selection, current step |
| caramel / caramel-ink · rust | `#B7894D` / `#8A5F1C` · `#B04F36` | V4.3 limited accents: kicker, brief months, warnings / project records |
| display · UI · data | Bricolage Grotesque · DM Sans · DM Mono | V4.3 type system (Google Fonts, as V4.3 loads them) |
| brand | `nct127` | Kay's own face, already in this repository (`knowledge/fonts/nct127-Regular.woff2`, used with her permission in V4.1+); wordmark + intro title only |
| radii | 8–14 px, pills for actions | V4.3 `--pi-r-*`; V1's square buttons removed |

Data colour is separate from UI colour: plants keep their display colours; the Performance ramp is a sequential warm ramp
(`#F3EEE4 → #8A3B1E`); provenance is shown by line type (Knowledge); zone colours are a 6-step categorical set.

## Layout
* Top bar (52 px): nct127 wordmark (button back to the introduction) · Design | Knowledge with the V4.3 underline ·
  site + design name · four-step stepper (pill for the current step) · save status.
* Right task panel (404 px, paper): kicker `n · STAGE`, a Bricolage title, one task sentence, then only decisions.
  Long reasoning sits behind `details` ("Why · gaps", "How it adapts", "Definitions").
* Bottom dock (64 px, one place): **Plan · Axo · Diagram · Performance · Layers** (icon + label, the old top-left Axo / Plan
  toolbar is hidden) | **Play + 12-month track** (tiny bars = flowering plants / m² per month from the design; brief months in
  caramel; visible in Explore, Diagram and Performance) | undo / redo · message · Back · Continue (or Save option in Explore).
* Brush HUD (top centre, dark pill, only while the brush is on): mix swatch, layer toggles Base / Overlay / Bulbs, diameter
  in metres, live counts `+added −replaced · cells`, Done (Esc).
* Legend (bottom left, only for Diagram / Performance): one ramp or one segmented switch.
* Intro: a typographic title over a field of the model's real plant instances drawn in reading order (2.6 s, static with
  reduced motion), one Start; then three landscape cards in one axonometric projection and light: Detroit (real model,
  drawn from its geometry) and two honest "Planned" cards (dashed plinths, disabled).
* Knowledge: V4.3's X · Plants → Z → Y network (italic scientific names, mono sub-labels, column heads with explanations,
  legend of line types at the bottom), lenses as chips, Network | Matrix | Table | Notebook tabs, side inspector.
* Narrow screens (≤ 900 px): canvas above, panel below, dock in two rows (checked at 820 px).

## Interaction changes
| V1 | V2 |
|---|---|
| Define: brief only, beds chosen later one by one | Define proposes a whole-site strategy (zones on the map), one confirm |
| Structure: select a bed → choose logic → confirm, repeat | every zone previewed at once, shared zone parameters, guide curve, one confirm; a bed click only refines |
| Compose: paint = assign whole cells on mouse-up | Mix palette → live generative brush (plants appear while dragging, across beds, paths skipped); Cell Fill and Auto Compose use the same engine |
| flat member list, 4.5 / m² for everything | layered recipe editor (base shares + spacing, overlay density, drift coverage), impact preview, Update all / local variant |
| Explore: cell tints by presence | 1 m resource raster with distribution, groups filter, continuity; Diagram (structure · mix · arrangement · layers); region table; option comparison |
| Knowledge iframe | in-page lenses + the notebook iframe as one tab; record preview → apply |

## Not done / honest limits
* The 3D (Axo) view shows the same plants and cell tints, but not the Performance raster or the month colouring (stated in the
  dock tooltip: "observe the same plants; paint in Plan").
* No Impeccable critique was run in this session (the skill was not available here); the visual check is the screenshot
  set in `docs/screenshots/v2/` at 1440 × 900 and 820 px.
