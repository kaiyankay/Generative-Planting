# Phase 01.1 · Task 05 — art direction

**Theme:** computational landscape illustration — an operable research drawing, not a game and not a GIS dashboard. Product name *Generative Planting*; case *Detroit · Spatial Laboratory*.

## What was taken from the primary reference (principles only)

UBC SALA, *Landscape as Laboratory* (White, Shahbazi, Zhang, 2024). The four sheets were opened in a browser and studied; nothing was downloaded into the repository or copied.

| Sheet | Principle observed | How it shows up here |
|---|---|---|
| Site Plan | Warm off-white page; the surrounding city drawn in one pale beige with thin lighter street lines; the research area carries all the colour (sage, olive, ochre), paths as fine cream lines, small tree silhouettes with a soft offset shadow, a blue-grey river. | Paper `#F5F1E8`, context `#DED8C9` with fine edges, garden in sage / meadow / muted species colours, cream paths with a fine edge, tree crowns translucent with a soft offset shadow, water `#BACBD0`. |
| Experimental Plots | Each plant = a solid core dot + a translucent halo of its spread; overlapping halos merge into a field; a small muted categorical palette with a legend beside it. | Plan proxies drawn as core + translucent halo (forbs) or fine radiating strokes (grasses); contextual legend lists the species in view. |
| Ecological Relationships | Fine ink line drawings of leaves; large translucent discs. | Fine ink strokes for outlines, edges and symbols; translucency instead of saturation. |
| Site Throughout Time | Continuous landscape in a narrow tonal range; soft atmospheric depth; a grey section cut under the ground. | 3D: muted palette shared with the plan, neutral tone mapping, soft sun with light shadows (intensity 0.55), warm-grey soil section with a darker topsoil band, fine ink edges on buildings. |

Not taken: their drawings, plant inventories, species colour assignments, fonts, illustrations or compositions. Rhino informed the operation (orthographic plan, layers, eye / lock), Terra Nil / Tiny Glade only the sense of a tactile miniature; no game styling is used.

## Style test (same camera, real model)

`tools/style_test.html` draws Beds C1 / B1 / A1 and the Rain Garden at 14 px/m three ways with the production painters (screenshot: `docs/screenshots/phase-01-1/05-style-test.png`).

| | 1 · Pure line | 2 · Line + low-saturation illustration | 3 · Light picture-book |
|---|---|---|---|
| Reads at a glance | Weak: beds turn into grey lace; A / B / C barely differ. | Strong: matrix vs blocks vs groups visible; species colour without noise. | Strong, but softer edges. |
| Precision / hit-testing | Best edge clarity. | Edges crisp (fine ink outlines over translucent fills). | Colour bleed (±1.5 px offsets) blurs edges — misleading for a measuring tool. |
| Fits a working canvas for people and AI | Too austere for composition reading. | Yes. | Decorative grain fights small symbols and overlays. |
| Cost | Lowest. | Medium. | Highest (extra full-canvas passes). |

**Adopted: 2.** It is the only theme; there are no theme switches in the app.

## Tokens (shared by plan, ground texture, plates and 3D: `src/style.js`)

paper `#F5F1E8` · context `#DED8C9` · meadow `#C7C38A` · low vegetation `#AFBE9E` · mid vegetation `#859779` · dark ink `#506B5F` (text uses `#33433A` for contrast) · water `#BACBD0` · muted flowering accent `#B59CBB`.

- **Species colour** = the species' display colour pushed to low saturation (`muteFlower`, `muteLeaf`), identical in 2D and 3D.
- **Analysis colour** = dedicated ramps (elevation warm greys, slope ochre → brown, distance to path blue-grey), always with a legend and units; never a plant hue.
- **State** = line style plus words, never colour alone: selection solid line with a soft halo, hover dashed, draft placements dotted, existing (digitised) tree crowns dashed vs designed crowns solid, open beds of a blank canvas hatched, *Canvas* state with a dashed outline.
- Type: serif titles (system Iowan / Palatino / Georgia), legible sans for UI, Latin names in italics, tabular numbers. No web font is fetched.

## Zoom hierarchy in the plan

| px per metre | What appears |
|---|---|
| < 3.2 | beds and patches as colour fields; bed codes only where they fit |
| 3.2 – 7 | emergent / individual rings, patch outlines, single-dot proxies |
| 7 – 22 | proxy halos, grass strokes, bulb points, scatter marks, matrix stipple (> 5) |
| > 22 | full symbols with fine outlines, legend codes inside large rings, style names under bed codes |
