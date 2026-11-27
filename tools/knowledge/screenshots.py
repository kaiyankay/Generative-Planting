#!/usr/bin/env python3
"""Interaction screenshots of the Knowledge Workspace (Phase 02A.1), taken from one real session in headless Chrome.

  python3 -I tools/knowledge/screenshots.py

Serves the repository on a free local port, opens knowledge/index.html with a throw-away test database, and performs the
steps a first-time designer would: explore, select, walk the graph, add a plant and a note, edit a preset record, switch
layers, import a list, query retrieval. Every state is produced by the interface itself (clicks / typing dispatched to the
real elements, or the app's own methods); nothing is drawn by this script. Writes docs/screenshots/knowledge-02a1/*.png
and index.json (step, caption, what changed).
"""
import functools, json, os, sys, tempfile, threading, time, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE)); sys.path.insert(0, HERE)
from cdp import Chrome  # noqa: E402

OUT = os.path.join(ROOT, "docs", "screenshots", "knowledge-02a1")
H = """
window.$ = s => document.querySelector(s); window.$$ = s => [...document.querySelectorAll(s)];
window.clk = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
window.dbl = el => el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
window.typ = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
window.A = window.GPKApp; 0;
"""
STEPS = [
    ("01-workspace-default", "Default workspace: the ten full profiles linked only through attributes their records share; groups are areas; common ground folded in the footer. Counts, kinds and sources appear on hover and in the inspector.", ""),
    ("02-plant-selected", "Selecting Yarrow opens the inspector, which narrows the canvas: profile, coverage strip, values at a glance, flowering by source and place, the designers' words.", "clk($$('#cbody .node.plant').find(g => g.dataset.ent === 'achillea-millefolium'))"),
    ("03-connections-yarrow", "Explore connections from the inspector: Yarrow across collections — its cultivar ‘Terra Cotta’ and through it the B beds recipe, Robertson 1929 (dotted: name match only), the survey, local sources, places; attribute groups folded.", "clk($('#insp [data-act=explore]'))"),
    ("04-connections-robertson", "Expand in place: double-click Robertson 1929 — its plants join the same picture; Yarrow and everything already drawn keep their places, shared plants are drawn once.", "dbl($('#cc .node[data-id=\"ds:robertson-1929\"]'))"),
    ("05-connections-recipe", "Expand again: B beds adds its members by drawing role; the view zooms to fit, nothing is redrawn from scratch.", "A.explore('system:mix.B-matrix')"),
    ("06-recipe-composition", "Planting recipes · B beds: Layers in the plan legend (schematic, clickable: symbol = member, band = drawing role) above the member list; ink = kinds of knowledge recorded.", "A.col='recipes'; A.sub='system:mix.B-matrix'; A.view='composition'; A.sel={kind:'entity', id:'taxon:achillea-millefolium-terra-cotta'}; A.render()"),
    ("07-recipe-compare", "Recipe Compare opens on the members with knowledge, ordered by how much is recorded; all 46 one click away. Units in the header, the key under the table.", "A.setView('compare')"),
    ("27-network-expanded", "Plant Library network, expanded in place: double-clicking Yarrow and Red osier dogwood adds their recipes, research, survey and places around them; the shared-attribute network stays as it was.", "A.sel=null; A.cx=null; A.open('library','network'); A.netExp=new Set(['achillea-millefolium','cornus-sericea']); A.renderBody()"),
    ("08-library-compare", "Plant Library · Compare across the ten full profiles; any cell opens its records.", "A.sel=null; A.netExp=new Set(); A.open('library','compare')"),
    ("09-library-seasons", "Seasons: flowering by source and place, never merged — the UK, St. Louis, North America and Greater Vancouver rows differ.", "A.setView('seasons')"),
    ("10-library-profiles-filters", "Profiles with the four independent dimensions open (coverage · origin · identity · contribution); counts are plants, one per stable identity.", "A.lib.open=true; A.lib.coverage=new Set(); A.lib.origin=new Set(['detroit']); A.setView('profiles')"),
    ("11-survey", "Designer survey: who answered (aggregate), plants and reasons as a dot matrix, observations in their words, plants listed together.", "A.lib.open=false; A.lib.origin=new Set(); A.lib.coverage=new Set(['full']); A.open('survey')"),
    ("12-research-robertson", "Robertson 1929: visitor taxa per plant (dashed = name match only) beside the original rows of the selected plant — no overlap.", "A.open('research','visitors'); A.select({kind:'entity', id: A.kb.resolveName('Zizia aurea').matches[0].id}); A.renderBody()"),
    ("13-research-databases", "Research · Curated databases: which source documents which plant, and for which region.", "A.sel=null; A.open('research','databases')"),
    ("14-research-literature", "Research · Design literature: functional layers and spatial functions as cited; plant placements derived by rule and marked so.", "A.setView('literature')"),
    ("15-local", "Local data · Metro Vancouver: place hierarchy, water-rule calendar, local evidence per plant.", "A.open('local')"),
    ("16-add-plant", "Add knowledge opens beside the canvas (no modal): a short name is read as a plant name; a new name becomes a provisional plant with nothing invented.", "A.open('library','profiles'); A.openAdd(); typ($('#adText'), 'Acer griseum')"),
    ("17-add-note", "A sentence is read as a note: Yarrow linked and marked in the canvas, Preference and Metro Vancouver pre-selected from words in the text — visible and changeable. No AI reads it.", "clk($('#adOut [data-addplant]')); await new Promise(r=>setTimeout(r,300)); A.add.close(); A.select({kind:'entity', id:'achillea-millefolium'}); A.openAdd(); typ($('#adText'), 'I prefer Yarrow for low-irrigation plantings in Vancouver; on dry south slopes it self-seeds into gravel.')"),
    ("18-after-note", "Saved: the note sits on Yarrow as ◆ My knowledge (inspector); the plant count is unchanged (151 species = 150 + Acer griseum).", "clk($('#adOut [data-save]')); await new Promise(r=>setTimeout(r,300)); A.select({kind:'entity', id:'achillea-millefolium'})"),
    ("19-edit-my-version", "Edit my version of a preset record (Kinnikinnick · MOBOT, St. Louis): yours starts with an empty context — say where it applies.", "A.select({kind:'record', id:'arctostaphylos-uva-ursi:resistances:mobot01'}); await new Promise(r=>setTimeout(r,200)); clk($('#insp [data-act=revise]')); await new Promise(r=>setTimeout(r,100)); $('#rvText').value='In my Vancouver projects Kinnikinnick needed summer water for its first two years; only then did it cope with drought.'; $('#rvPlace').value='place:vancouver'; $('#rvWhy').value='three projects, 2022–25'"),
    ("20-revision-vs", "Saved: Preset (struck through, unchanged) against my version — source “me”, place Metro Vancouver, kind observation.", "clk($('#rvOk'))"),
    ("21-layer-mine", "My knowledge layer: the same network; what is mine is drawn, the rest stays as faded context.", "A.sel=null; A.open('library','network'); A.setLayer('mine')"),
    ("28-layers-connections", "Same exploration, Preset layer: positions are kept; my note and list disappear, nothing else moves. Switching back shows them again in place.", "A.setLayer('preset'); A.sel=null; A.cx=null; A.focus='achillea-millefolium'; A.view='connections'; A.render(); await new Promise(r=>setTimeout(r,400)); A.setLayer('combined'); await new Promise(r=>setTimeout(r,300)); A.setLayer('preset')"),
    ("22-layer-preset", "Preset layer: the prepared knowledge exactly as migrated — the MOBOT record in effect, no personal marks.", "A.setLayer('preset'); A.open('library','network'); A.select({kind:'record', id:'arctostaphylos-uva-ursi:resistances:mobot01'})"),
    ("23-add-list", "A pasted list: read as a list; import needs a title and a source; Yarrow twice = one membership; “irrigation” not linked and not counted.", "A.setLayer('combined'); A.sel=null; A.render(); A.openAdd(); typ($('#adText'), 'Achillea millefolium\\nYarrow\\nEurybia divaricata\\nirrigation\\nZizia aurea'); await new Promise(r=>setTimeout(r,100)); typ($('#tTitle'), 'Edge perennials I trust'); typ($('#tSrc'), 'my planting notes 2025')"),
    ("24-personal", "Personal knowledge: per plant what I added, my version against the Preset, the list with its unlinked row, and the full history with undo.", "clk($('#tGo')); await new Promise(r=>setTimeout(r,300)); A.sel=null; A.open('personal')"),
    ("25-connections-me", "Connections from My knowledge: everything I touched, as a network.", "A.explore('me')"),
    ("26-llm-access", "Data & access · LLM access: searchKnowledge() on the knowledge in effect, with place match (same / within / broader / elsewhere) and flags; compared with the Preset run.", "A.sel=null; A.render(); A.more.open('llm'); const B = new (await import('./src/kb.js')).KB(A.kb.seed, A.kb.speciesMap); const o = B.searchKnowledge({ query: 'Kinnikinnick drought summer water', limit: 15, projectContext: { place: 'place:vancouver' } }); A.kb.traces.push({ id: 'trace-preset', query: o.query, projectContext: o.projectContext, activeRevision: o.activeRevision, at: o.at, returnedRecordIds: o.returnedRecordIds }); A.more._rq = { query: 'Kinnikinnick drought summer water', place: 'place:vancouver' }; A.more.open('llm'); $('#rqCmp').value='trace-preset'; clk($('#rqGo'))"),
]


class Q(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Q, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/knowledge/index.html?db=gp-knowledge-test-shots&fresh=1"
    index = []
    with Chrome(width=1440, height=900, scale=2) as c:
        c.goto(url); c.wait_for("document.documentElement.dataset.ready === '1'", timeout=90); time.sleep(1.5)
        c.eval(H)
        for name, caption, js in STEPS:
            if js:
                c.eval(f"(async () => {{ {js} }})()"); time.sleep(1.0)
            if name not in ("18-after-note", "20-revision-vs", "24-personal"): c.eval("document.getElementById('toast').hidden = true; 0")
            state = c.eval("JSON.stringify({ layer: A.layer, col: A.col, view: A.view, sel: A.sel && (A.sel.id || A.sel.kind), events: A.kb.events.length, active: A.kb.counts().active, revision: A.kb.activeRevision })")
            p = os.path.join(OUT, name + ".png"); c.screenshot(p)
            index.append({"file": name + ".png", "caption": caption, "state": json.loads(state)}); print(name, state)
    json.dump({"about": "Phase 02A.1 Knowledge Workspace — one real session, 1440×900 @2x, headless Chrome. Test database only; the designer's own browser layer is never touched.", "shots": index},
              open(os.path.join(OUT, "index.json"), "w"), indent=1, ensure_ascii=False)
    srv.shutdown()


if __name__ == "__main__":
    main()
