// Knowledge Workspace — app shell. One KB (Preset + personal events), collections on the left, one visualisation in the
// centre chosen by the data, one inspector on the right that opens only on selection and narrows the canvas.
import { KB } from './kb.js';
import { Store, loadSeed } from './store.js';
import * as A from './analysis.js';
import { Inspector } from './inspector.js';
import { AddDialog } from './add.js';
import { MoreDialog } from './access.js';
import { esc, fmtN, sci, icon, trim, kindLabel } from './ui.js';
import * as Library from './views/library.js';
import * as Connections from './views/connections.js';
import * as Recipes from './views/recipes.js';
import * as Survey from './views/survey.js';
import * as Research from './views/research.js';
import * as Local from './views/local.js';
import * as Personal from './views/personal.js';

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

export const COLLECTIONS = {
  library: { title: 'Plant Library', views: [['network', 'Network'], ['profiles', 'Profiles'], ['compare', 'Compare'], ['seasons', 'Seasons']], def: 'network', mod: Library },
  survey: { title: 'Designer survey', views: [['responses', 'Responses']], def: 'responses', mod: Survey },
  research: { title: 'Research', views: [['visitors', 'Flower visitors'], ['databases', 'Curated databases'], ['literature', 'Design literature']], def: 'visitors', mod: Research },
  recipes: { title: 'Planting recipes', views: [['composition', 'Composition'], ['compare', 'Compare'], ['seasons', 'Seasons']], def: 'composition', mod: Recipes },
  local: { title: 'Local data', views: [['context', 'Metro Vancouver']], def: 'context', mod: Local },
  personal: { title: 'Personal knowledge', views: [['changes', 'Changes']], def: 'changes', mod: Personal },
};
const DEFAULT_FOCUS = { library: 'achillea-millefolium', survey: 'src:survey', research: 'ds:robertson-1929', local: 'place:vancouver', personal: 'me' };

class App {
  async init() {
    const [seed, sm] = await Promise.all([loadSeed(params), fetch('data/species_map.json').then(r => r.json())]);
    this.seed = seed;
    this.kb = new KB(seed, sm);
    this.kbBase = new KB(seed, sm);                     // the read-only Preset
    const db = params.get('db') || '';
    this.store = await new Store(/^gp-knowledge-test[\w-]*$/.test(db) ? db : undefined).init();
    if (params.get('fresh') === '1' && this.store.name !== 'gp-knowledge') await this.store.clearAll();   // only test databases can be wiped from a URL
    this.kb.setEvents(await this.store.loadEvents());
    this.kb.traces = await this.store.loadTraces();
    this.kb.onChange(info => { if (info.type === 'trace') this.store.saveTrace(info.trace); });
    this.layer = ['preset', 'mine', 'combined'].includes(params.get('layer')) ? params.get('layer') : 'combined';
    this.col = COLLECTIONS[params.get('col')] ? params.get('col') : 'library';
    this.view = params.get('view') || COLLECTIONS[this.col].def;
    this.sub = params.get('sub') || 'system:mix.B-matrix';
    this.focus = params.get('focus') || null;
    this.trail = [];
    this.sel = null;
    if (params.get('sel')) this.sel = { kind: params.get('selkind') || 'entity', id: params.get('sel') };
    this.lib = { coverage: new Set(['full']), origin: new Set(), status: new Set(), contrib: new Set(), themes: ['water', 'tolerance', 'ecology', 'light'], expandCommon: false, withMine: true };
    if (params.get('scope') === 'all') this.lib.coverage = new Set();
    this.fresh = { ids: new Set(), at: 0 };
    this.inspector = new Inspector($('#insp'), this);
    this.inspector.scopeIds = () => { const l = Library.scope(this).list.filter(f => f.coverage.attrs > 0 || f.contrib.has('added') || f.mine); return l.length <= 60 ? l.map(f => f.id) : []; };
    this.add = new AddDialog($('#addp'), this);
    this.more = new MoreDialog($('#moreDlg'), this);
    this.bindChrome();
    this.render();
    $('#loading').remove();
    window.GPK = this.publicApi();
    window.GPKApp = this;
    document.documentElement.dataset.ready = '1';
  }

  /** Your changes in effect: live events (an undo cancels its target and is not counted). */
  mineCount() { return this.kb.liveEvents().live.length; }

  /** KB for the current layer: Preset reads the untouched base; My knowledge and Combined read the effective state. */
  kbv() { return this.layer === 'preset' ? this.kbBase : this.kb; }
  get mineMode() { return this.layer === 'mine'; }

  publicApi() {
    const kb = this.kb;
    return Object.freeze({
      getEntity: id => kb.getEntity(id), searchEntities: (q, o) => kb.searchEntities(q, o), getRecords: o => kb.getRecords(o), searchKnowledge: o => kb.searchKnowledge(o),
      getDataset: id => kb.getDataset(id), getEvidence: ids => kb.getEvidence(ids), getNeighborhood: o => kb.getNeighborhood(o), resolveSpecies: o => kb.resolveSpecies(o),
      get activeRevision() { return kb.activeRevision; }, get baseVersion() { return kb.baseVersion; }, traces: () => kb.traces.slice(), counts: () => kb.counts(), diff: () => kb.diff(),
      about: 'Read-only query interface over the knowledge in effect (Preset + this browser\'s personal layer). Returns record ids, values, sources, context, status and gaps. This object calls no model; Claude reads the same knowledge through tools on the local knowledge server (tools/knowledge/server.py).',
    });
  }

  // ---------- chrome ----------
  bindChrome() {
    document.querySelectorAll('#layers button').forEach(b => b.onclick = () => this.setLayer(b.dataset.l));
    $('#btnAdd').onclick = () => this.openAdd();
    $('#btnAsk').onclick = () => this.openAsk();
    $('#btnMore').onclick = () => this.more.open();
    $('#railBtn').onclick = () => document.body.classList.toggle('rail-open');
    $('#rail').addEventListener('click', e => { if (e.target.closest('[data-col],[data-sub]')) document.body.classList.remove('rail-open'); });
    const q = $('#q'); const sug = $('#suggest'); let on = -1;
    const pick = (id, kind = 'entity') => { sug.hidden = true; q.value = ''; this.goTo(id, kind); };
    q.oninput = () => {
      const kb = this.kb; const v = q.value.trim(); on = -1;
      if (!v) { sug.hidden = true; return; }
      const r = kb.searchEntities(v, { limit: 9 });
      const rec = v.length > 2 ? kb.searchKnowledge({ query: v, limit: 4, record: false }).results : [];
      sug.innerHTML = r.map(x => { const e = kb.state.entities.get(x.id); return `<button data-id="${esc(x.id)}">${A.isPlant(e) ? sci(x.name) : esc(x.name)}${e?.commonName ? ` <span class="dim">${esc(e.commonName)}</span>` : ''}<span class="t">${esc(kindLabel(e))}${x.origin === 'user' ? ' · ◆ mine' : ''}</span></button>`; }).join('')
        + rec.map(x => `<button data-rec="${esc(x.recordId)}"><span>${esc(trim(x.statement, 74))}</span><span class="t">record</span></button>`).join('')
        + (!r.length && !rec.length ? `<div class="dim" style="padding:8px 10px">Nothing matches. <button class="btn small" data-add>Add “${esc(trim(v, 30))}” as knowledge</button></div>` : '');
      sug.hidden = false;
      sug.querySelectorAll('[data-id]').forEach(b => b.onclick = () => pick(b.dataset.id));
      sug.querySelectorAll('[data-rec]').forEach(b => b.onclick = () => pick(b.dataset.rec, 'record'));
      sug.querySelector('[data-add]')?.addEventListener('click', () => { sug.hidden = true; this.openAdd({ text: v }); });
    };
    q.onkeydown = e => {
      const bs = [...sug.querySelectorAll('button')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); on = Math.max(0, Math.min(bs.length - 1, on + (e.key === 'ArrowDown' ? 1 : -1))); bs.forEach((b, i) => b.classList.toggle('on', i === on)); }
      if (e.key === 'Enter') (bs[on] || bs[0])?.click();
      if (e.key === 'Escape') { sug.hidden = true; q.blur(); }
    };
    document.addEventListener('click', e => { if (!e.target.closest('.search')) sug.hidden = true; });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); q.focus(); }
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { if (this.add.isOpen) this.add.close(); else if (!e.target.closest('input,textarea')) this.select(null); }
    });
    new ResizeObserver(() => { clearTimeout(this._rz); this._rz = setTimeout(() => this.renderBody(), 80); }).observe($('#cbody'));
  }

  setLayer(l) {
    if (l === this.layer) return;
    this.layer = l; this.render(); this.syncUrl();
  }

  /** Open a collection (and optionally a view / sub-selection). Selection is kept only if the new view still shows it. */
  open(col, view = null, sub = null) {
    const changed = col !== this.col;
    this.col = col; this.view = view || (changed ? COLLECTIONS[col].def : this.view);
    if (sub) this.sub = sub;
    if (changed && this.sel && !this.contains(this.sel)) this.sel = null;
    this.render(); this.syncUrl();
  }
  setView(v) { this.view = v; if (v === 'connections' && !this.focus) this.focus = this.defaultFocus(); this.render(); this.syncUrl(); }

  defaultFocus() {
    if (this.sel?.kind === 'entity') return this.sel.id;
    if (this.col === 'recipes') return this.sub;
    return DEFAULT_FOCUS[this.col] || 'achillea-millefolium';
  }
  /** Explore any object in Connections. From another view this starts a fresh picture; inside Connections it expands in place
   *  (the object's real neighbours are added; everything already drawn stays where it is). */
  explore(id, { fresh = false } = {}) {
    if (fresh || this.view !== 'connections' || !this.cx) { this.cx = { expanded: [id], pos: new Map(), open: new Set() }; this._placed = new Set(); }
    else if (!this.cx.expanded.includes(id)) this.cx.expanded.push(id);
    this.focus = id; this.view = 'connections';
    const kb = this.kbv(); const ent = kb.state.entities.get(id);
    if (ent || id.startsWith('src:') || id === 'me') this.sel = id === 'me' ? { kind: 'me', id } : id.startsWith('src:') ? { kind: 'source', id } : { kind: 'entity', id };
    this.render(); this.syncUrl();
  }

  contains(sel) { const m = COLLECTIONS[this.col].mod; return this.view === 'connections' ? true : (m.contains ? m.contains(this, sel) : false); }

  /** Shared selection: the canvas highlights it, the inspector shows it. */
  select(sel) {
    this.sel = sel;
    this.renderInspector(); this.markSelection(); this.syncUrl();
  }
  /** Jump to an object from search or a link: choose a collection that shows it, select it. */
  goTo(id, kind = 'entity') {
    const kb = this.kb;
    if (kind === 'record') { this.sel = { kind: 'record', id }; this.renderInspector(); this.markSelection(); this.syncUrl(); return; }
    const e = kb.state.entities.get(id);
    this.sel = { kind: 'entity', id };
    if (A.isPlant(e)) { if (this.col !== 'library') { this.col = 'library'; this.view = 'profiles'; } this.ensureInScope(id); }
    else if (e?.type === 'planting_system') { this.col = 'recipes'; this.sub = id; this.view = 'composition'; }
    else if (e?.id === 'ds:robertson-1929') { this.col = 'research'; this.view = 'visitors'; }
    else { this.focus = id; this.col = this.col || 'library'; this.view = 'connections'; }
    this.render(); this.syncUrl();
  }
  /** Make sure a plant is visible in the Plant Library scope (filters widen rather than hide the object asked for). */
  ensureInScope(id) {
    const f = A.plantFacts(this.kbv(), id); if (!f) return;
    const vis = A.filterPlants([f], this.lib).length || (this.lib.withMine && this.layer !== 'preset' && (f.contrib.has('added') || f.contrib.has('annotated')));
    if (!vis) { this.lib.coverage = new Set(); this.lib.origin = new Set(); this.lib.status = new Set(); this.lib.contrib = new Set(); }
    if (this.view === 'network' && f.coverage.level !== 'full' && !f.contrib.has('added')) this.view = 'profiles';
  }

  // ---------- rendering ----------
  render() {
    document.querySelectorAll('#layers button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.l === this.layer)));
    const n = this.mineCount();
    $('#mineN').textContent = n ? String(n) : '';
    this.renderRail(); this.renderHead(); this.renderBody(); this.renderInspector();
  }

  renderRail() {
    const kb = this.kbv();
    const t = A.plantTally(A.allPlants(kb)); const sv = A.survey(kb); const rc = A.recipes(kb);
    const mineN = this.mineCount();
    const item = (k, nm, num, extra = '') => `<button class="col ${k === 'personal' ? 'personal' : ''}" data-col="${k}" aria-current="${this.col === k}"><span class="nm">${nm}<span class="num">${num}</span></span></button>${extra}`;
    const subs = this.col === 'recipes' ? `<div class="subs">${rc.map(r => `<button class="sub" data-sub="${esc(r.id)}" aria-current="${this.sub === r.id}"><span>${esc(r.name)}</span><span class="num">${r.members || '—'}</span></button>`).join('')}</div>` : '';
    $('#rail').innerHTML = item('library', 'Plant Library', fmtN(t.total)) + item('survey', 'Designer survey', sv.respondents) + item('research', 'Research', '')
      + item('recipes', 'Planting recipes', rc.length, subs) + item('local', 'Local data', '') + item('personal', 'Personal knowledge', mineN || '');
    $('#rail').querySelectorAll('[data-col]').forEach(b => b.onclick = () => this.open(b.dataset.col));
    $('#rail').querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { this.sub = b.dataset.sub; if (this.view === 'connections') { this.focus = b.dataset.sub; this.cx = null; this._placed = new Set(); } this.sel = null; this.render(); this.syncUrl(); });
  }

  renderHead() {
    const C = COLLECTIONS[this.col]; const m = C.mod;
    const h = m.head ? m.head(this) : { title: C.title, count: '' };
    const tabs = C.views.length > 1 ? C.views.map(([k, l]) => `<button data-v="${k}" aria-pressed="${this.view === k}">${l}</button>`).join('') + '<span class="sep"></span>' : `<button data-v="${C.views[0][0]}" aria-pressed="${this.view === C.views[0][0]}">${C.views[0][1]}</button><span class="sep"></span>`;
    $('#chead').innerHTML = `<div class="row1"><h1>${h.title}</h1>${h.count != null && h.count !== '' ? `<span class="count" title="${esc(h.countTitle || '')}">${h.count}</span>` : ''}</div>${h.scope ? `<p class="scopeline">${h.scope}</p>` : ''}
      <div class="views" role="group" aria-label="Views">${tabs}<button data-v="connections" aria-pressed="${this.view === 'connections'}">${icon('graph', 14)} Connections</button></div>`;
    $('#chead').querySelectorAll('[data-v]').forEach(b => b.onclick = () => { if (b.dataset.v === 'connections' && this.view !== 'connections') { this.focus = this.defaultFocus(); this.cx = null; this._placed = new Set(); } this.setView(b.dataset.v); });
  }

  renderBody() {
    const host = $('#cbody'); const C = COLLECTIONS[this.col];
    host.className = 'cbody';
    try {
      if (this.view === 'connections') Connections.render(host, this);
      else C.mod.render(host, this);
    } catch (e) { console.error(e); host.innerHTML = `<div class="empty">Could not draw this view: ${esc(e.message)}</div>`; }
    this.markSelection();
  }

  renderInspector() {
    const adding = this.add.isOpen;
    $('#work').classList.toggle('with-insp', !!this.sel || adding);
    $('#work').dataset.layer = this.layer;
    $('#addp').hidden = !adding;
    if (adding) { $('#insp').hidden = true; return; }
    this.inspector.render();
  }
  markSelection() {
    const host = $('#cbody'); const s = this.sel;
    host.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
    if (!s) return;
    const key = s.kind === 'entity' || s.kind === 'source' || s.kind === 'me' ? s.id : s.kind === 'record' ? 'r:' + s.id : s.key || null;
    if (key) host.querySelectorAll(`[data-key="${CSS.escape(key)}"]`).forEach(x => x.classList.add('sel'));
    const m = COLLECTIONS[this.col].mod;
    if (this.view === 'connections') Connections.mark?.(this); else m.mark?.(this);
  }

  /** Mark objects in the canvas without selecting them (e.g. the plants a note being written will attach to). */
  highlight(ids) {
    const host = $('#cbody'); host.querySelectorAll('.hl').forEach(x => x.classList.remove('hl'));
    for (const id of ids || []) host.querySelectorAll(`[data-key="${CSS.escape(id)}"]`).forEach(x => x.classList.add('hl'));
  }

  syncUrl() {
    const p = new URLSearchParams();
    for (const k of ['db']) if (params.get(k)) p.set(k, params.get(k));
    if (this.col !== 'library') p.set('col', this.col);
    if (this.view !== COLLECTIONS[this.col].def) p.set('view', this.view);
    if (this.layer !== 'combined') p.set('layer', this.layer);
    if (this.col === 'recipes') p.set('sub', this.sub);
    if (this.view === 'connections' && this.focus) p.set('focus', this.focus);
    if (this.sel && ['entity', 'record', 'source'].includes(this.sel.kind)) { p.set('sel', this.sel.id); if (this.sel.kind !== 'entity') p.set('selkind', this.sel.kind); }
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
  }

  // ---------- writing knowledge ----------
  /** Validate, persist and apply one event; every view, the inspector and retrieval read the new state. */
  commit(ev, msg = 'Saved') {
    const kb = this.kb;
    const before = { active: kb.counts().active, ents: new Set(kb.state.entities.keys()), edges: new Set(kb.state.edges.keys()), plants: A.plantTally(A.allPlants(kb)) };
    let e;
    try { e = kb.apply(ev); } catch (err) { this.toast('Not saved: ' + err.message); return null; }
    this.store.appendEvent(e).catch(err => this.toast('Kept for this session only — browser storage failed: ' + err));
    const after = { active: kb.counts().active, plants: A.plantTally(A.allPlants(kb)) };
    const added = [...kb.state.entities.keys()].filter(k => !before.ents.has(k));
    const newEdges = [...kb.state.edges.keys()].filter(k => !before.edges.has(k)).length; const lost = [...before.edges].filter(k => !kb.state.edges.has(k)).length;
    this.fresh = { ids: new Set([...added, ...touched(ev)]), at: Date.now() };
    if (this.layer === 'preset') this.layer = 'combined';
    this.lastChange = { event: e, delta: { records: after.active - before.active, plants: after.plants.species + after.plants.cultivars - before.plants.species - before.plants.cultivars, links: newEdges - lost } };
    this.render();
    const dp = this.lastChange.delta.plants;
    this.toast(dp ? `${msg} · ${dp > 0 ? '+' : ''}${dp} plant` : msg, e.type === 'undo' ? null : () => this.commit({ type: 'undo', target: e.id }, 'Undone'));
    setTimeout(() => { this.fresh = { ids: new Set(), at: 0 }; }, 6000);
    return e;
  }

  toast(msg, undo = null) {
    const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button data-u>Undo</button>' : ''); t.hidden = false;
    t.querySelector('[data-u]')?.addEventListener('click', () => { t.hidden = true; undo(); });
    clearTimeout(this._tt); this._tt = setTimeout(() => { t.hidden = true; }, undo ? 7000 : 3500);
  }

  openAdd(ctx = {}) {
    if (!ctx.subjects && this.sel?.kind === 'entity' && A.isPlant(this.kb.state.entities.get(this.sel.id))) ctx = { ...ctx, subjects: [this.sel.id] };
    const text = this.add.isOpen || this.add.suspended ? this.add.ta?.value : '';
    this.add.open({ text, ...ctx, tab: 'add' });
  }
  /** Ask opens in the same column, with the current selection as context (removable). */
  openAsk(ctx = null) {
    if (!ctx && this.add.suspended) return this.add.resume();          // the top-bar Ask returns to the question in progress
    ctx = ctx || {};
    const text = this.add.isOpen ? this.add.ta?.value : '';
    this.add.open({ text, ...ctx, tab: 'ask', sel: ctx.sel === undefined ? this.sel : ctx.sel });
  }
}

function touched(ev) {
  const out = []; const evs = ev.type === 'batch' ? ev.events : [ev];
  for (const e of evs) { if (e.entity) out.push(e.entity.id); if (e.record) out.push(...e.record.subjects, e.record.id); if (e.target) out.push(e.target); }
  return out;
}
new App().init().catch(err => { const l = document.getElementById('loading'); if (l) l.textContent = 'Could not load the knowledge base: ' + err; console.error(err); });
