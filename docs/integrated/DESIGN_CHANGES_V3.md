# Generative Planting V3.1 — design changes, distillation record, Knowledge decisions

Principle applied everywhere: **Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining.**
Before / after of the same tasks (V2 `b6e6b8f` left, V3.1 right): `docs/screenshots/v3/before-after.jpg`.

## Visual language
The V2 introduction and landscape choice are kept unchanged (same file, same CSS; only the Detroit card now says
“Continue …” when a design is saved, and “Start a new design instead” asks before replacing it). Its type and palette
(Bricolage Grotesque headings, DM Sans UI, DM Mono numbers, nct127 wordmark; warm paper, ink, olive / caramel / rust) carry
into every stage; what changed is the *layout* of each stage:
* **Canvas first.** No stage opens with a page title, kicker or paragraph; the panel starts with the task's object (Scope,
  zones, Mixes). The canvas tells where you are: a breadcrumb (site / scope / focused bed, Overview) floats over it.
* **One state, one encoding.** Candidate scope = dashed rust outline; confirmed = solid ink; outside the scope = quietened
  (paper veil); kept reference = hatched; focused bed = heavier outline. Conditions and mix fit use textures as well as
  colour; *blocked* has its own texture and is never a conflict.
* **Feedback at the cursor.** The large black brush HUD is replaced by a light brush bar (mix · layers · ⌀ in metres ·
  Replace / Soft edge · allow conflicts · ×) and a small chip beside the pointer that says what is here and what the stroke
  would do (adds, replaces, keeps, skips, unknown light, or why it is blocked). The red corner text “no plantable cell here”
  is gone.
* **Explore is its own space** (Pollinator Pathmaker reading: the result in the centre, observation at the bottom): top bar
  ← Design · result name / revision / plants / planted m² · Save option · Compare · Export · Site context · Details; bottom
  dock Plan · 3D · Diagram · Performance · play · 12 months; the analysis panel closed until asked; a contextual community
  card on click.

## Distillation record (text removed, merged or moved; what replaces it)
| screen | V2 text / control | V3.1 |
|---|---|---|
| Define | kicker “1 · DEFINE”, title “The planting strategy”, paragraph “Say what the whole site should become… nothing changes until you confirm it.” | removed — the dashed candidate outline and the disabled Continue say it |
| Define | “Click beds on the map to make your own selection. Existing trees always stay. N m² plantable in N beds…” | one key row `click` one bed · `⇧ click` add / remove · `⇧ drag` box; the count and m² are the big numbers of the Scope block |
| Define | three long starter sentences as cards | three short chips (full sentence on hover; clicking fills the intent) |
| Define | Brief objectives, knowledge sources, “What Rules mode read”, constraints — always open | one collapsed “Brief and sources” (nothing deleted; the Rules tag stays beside Intent) |
| Define | dock: “Define the planting for the whole scope — words or manual choices. · Confirm a planting strategy first (it takes one click).” | “Not confirmed · 3 zones · 17 beds” / “Confirmed · …” |
| Define | Performance mode, June legend, month timeline visible after returning from Explore (screenshot 01) | impossible: those controls exist only in Explore |
| Structure | kicker, title “Spatial cells”, paragraph “Every zone is divided at once… Cells are places, not plants.” | removed; numbered cells at a readable scale, chip with cell number and m² on hover |
| Structure | “Refine only this bed:” | the bed block appears when you focus a bed (its code, m², light assumption, logics) |
| Compose | kicker, title “Communities in space”, paragraph “Choose a mix to load the brush…” | removed — clicking a mix card turns the brush on and shows the fit |
| Compose | “Brush ⌀ in metres (independent of zoom): [ ] or Alt + wheel. Paint in Plan; Axo shows the same plants.” | the brush bar shows ⌀ in m; keys on the tooltip |
| Compose | “Add a mix” block with “Start from a Planting System (slides P34 / P41)…” always open | collapsed “Add a mix” (same functions) |
| Compose | black HUD “hover to preview · drag to plant · Done (Esc)” | light brush bar + cursor chip + live count |
| Explore | kicker, title “Observe and return”, paragraph, four lens chips, resident KPI block, issues, options | dock modes + months; KPIs, issues and options under “Details” (closed by default); community card on click |
| Knowledge | page title “Knowledge” beside the nav item; two rows of navigation (Network/Matrix/Table/Notebook + four lenses); right column “Select a node to focus it; a line shows its evidence. Add knowledge from a plant.” and “Personal knowledge can be empty…” | one row: back · search · which plants · Plants / Seasons / Communities / Relations / Notebook; the side column only when a plant is selected |
| everywhere | “Saved in this browser” | “● Saved” (time and place on hover) |

Kept on purpose (data honesty): Rules tags, *illustrative* tags on teaching values, *unknown* stated, the Metro Vancouver
banner, assumption / proxy labels, units and denominators, conflict and saving risks.

## Knowledge — course concept → data semantics → decision → expression
Course PDF `20241007_Generative Planting at Scale _ DC.pdf` read locally (not committed): P24 “Scalable modules”, P25 “Legible
spatial framework / diverse, functional vegetative cover”, P26 “Conventional approach: paint by number”, P34 “Planting layers
by functional roles” (Matrix Based: long-lived matrix, emergent forbs, groundcovers, dynamic fillers · True Meadow: cool- and
warm-season growers, nitrogen fixers, dynamic fillers · Maximal Color: base blocks, emergents, ephemerals · Under Trees:
clumping, clonal spreading, winter-present, colour theme, ephemerals), P35 “Matrix based mix: build your base species”,
P36 “Then add long-lived, stable perennials” with a season-of-bloom chart (species × months), P41 “Blocks / Emergents /
Ephemerals — layers based on seasonal events”, P42–43 (planting plans with module codes), P69 “Topo · Site · Paving ·
Planting · Performance” (Rhino > GH > Land Kit), P71 “Rules-based planting: each layer of analysis impacts plant placement;
water / shade / pH tolerance overlaps”, P72 “Layering constraints: plants, slope, sun exposure, elevation, proximity”.

| course concept | data in this project | decision | expression |
|---|---|---|---|
| Planting systems and functional roles (P34, P41) | 4 system templates; roles held by plants **inside a mix** (`layers[].members[].role`); 3 Detroit legend recipes | a role is a relation in a mix, not a species class; show systems even without a mix, greyed | **Communities**: system columns → role layers → each mix's composition bar (real shares) and member list |
| Season of bloom (P36) | flowering months per plant (illustrative teaching layer for most Detroit plants; unknown for many) | months are a calendar question, not a network | **Seasons**: plants × 12 months, sorted by first month, brief months marked, unknown rows hatched, source tag |
| Plant characteristics for rules (P71–72) | light, moisture, nominal height / width, groups, sources and conflicts | a plant is compared attribute by attribute | **Plants**: comparable table + profile (sources, conflicts with “use”, role in this design, light here over the scope's beds) |
| Rules-based tolerances (P71) | light records vs the site's light (assumption / crown proxy / unknown); moisture has no site data | requirement → site condition is a real two-step relation | **Relations → Light and moisture** (graph with focus / evidence) and the Compose fit map |
| Pollinator association | documented groups (association, not visitation) | an edge with a stated meaning | **Relations → Pollinator groups** (graph, focus, evidence, Matrix / Table of V4.3 kept inside the graph data) |
| Spatial functions (planting-db KG, V4.3) | 24 `suited_for` relations — all Metro Vancouver species; none for Detroit | never shown as this project's knowledge; available as labelled base knowledge on request | **Relations → Spatial function**: “No spatial-function records for this project's plants” + button → graph with a “Metro Vancouver base knowledge” banner |
| Personal / project knowledge | project records (state), personal records (IndexedDB notebook) | same model; effect previewed before it changes anything | **Notebook** + “Add or correct” in the profile: preview (metrics month by month, each mix's fit over the scope beds) → Apply |
Not added (no data): new categories, inferred plant–function edges for Detroit, bulk trait filling.

## Interaction kept from V4.3 / V2
Node focus (dim the rest), edge evidence, Matrix / Table views of the same relations (inside the relation data), preview
before applying knowledge, the plan's scale bar and north arrow, Plan / 3D with the same instances, undo / redo, frozen cells,
Cell Fill, Auto Compose, save / compare / export.
