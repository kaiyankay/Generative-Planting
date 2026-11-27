// Project state (gp.project/2): the one authoritative record of a design. Every stage reads and writes it; every gesture
// is one undoable command; the model's working draft (2D + 3D rendering, picking) is derived from it.
//
//   brief + strategy (Define) → beds / cells (Structure) → mixes + assignments.fragments → instances (Compose) → perf
//
// V2 placement contract: a cell keeps a list of assignment FRAGMENTS {id, mixId, mixVersion, slots, geometry|null (whole
// cell), origin, seed}. A whole-cell fill, an Auto Compose proposal and a brush stroke all write fragments and the plants
// they produced (instances[cell].plants, each plant tagged with its fragment, layer slot and lattice id). The stored plants
// are authoritative: a stroke only changes plants inside its footprint and target layers; plants outside keep their
// coordinates. A mix edit re-fills only the unfrozen fragments of that mix. Persistence: localStorage.
import { generateCells, linkAcrossBeds, overlapMap, mpArea, inside, bbox } from './spatial.js';
import { computePerformance, summarize } from './performance.js';
import { editMix, makeMix, validateMix, migrateMix, finalize } from './mix.js';
import { candidates, validate, makeEnv, PlantIndex, targetCount, slotOfRole } from './fill.js';
import { diff, clip, union, safeClip, safeDiff, safeUnion } from '../design/geo.js';

export const SCHEMA = 'gp.project/2';
const KEY = 'gp.flow.project.v2', KEY_V1 = 'gp.flow.project.v1', SNAP_KEY = 'gp.flow.snapshots.v2';
const DESIGN_PARTS = ['beds', 'cells', 'mixes', 'assignments', 'instances', 'knowledge', 'plants', 'acknowledged', 'locks', 'strategy', 'env'];
const PER_CELL = ['assignments', 'instances']; // parts that a cell-scoped command changes only for its declared cells
const SLOTS = ['base', 'overlay', 'ephemeral'];

export function defaultBrief(siteId) {
  return {
    siteId, intent: '', starter: null, interpreted: null,
    objectives: {
      flowering: { on: true, months: [4, 5, 6, 7, 8, 9, 10], priority: 1, label: 'Flowering continuity' },
      pollinators: { on: true, priority: 1, label: 'Pollinator resources (groups)' },
      continuity: { on: false, priority: 2, label: 'Connected resources in space' },
      suitability: { on: true, priority: 1, label: 'Plant suitability' },
    },
    constraints: [
      { id: 'geom', kind: 'hard', text: 'Plants only inside the beds, never on paths, walls or structures; 0.6 m clear of existing tree trunks.' },
      { id: 'reference', kind: 'hard', text: 'Areas outside the design scope keep the reference planting; existing trees stay.' },
      { id: 'frozen', kind: 'hard', text: 'Frozen cells are never regenerated or painted over.' },
      { id: 'light', kind: 'soft', text: 'A plant recorded for the other light than the local crown proxy is swapped for a layer-mate that fits, or flagged.' },
    ],
    scopeBeds: [], knowledgeVersion: null, confirmed: false,
  };
}
export function emptyState(site) {
  const now = new Date().toISOString();
  return { schema: SCHEMA, id: 'prj.' + Date.now().toString(36), siteId: site.id, siteName: site.name, name: 'Planting design 1', created: now, updated: now, stage: 'define', maxStage: 'define',
    brief: defaultBrief(site.id), strategy: null, beds: {}, cells: {}, mixes: [], assignments: {}, instances: {}, knowledge: { records: [], prefs: [] }, plants: [], acknowledged: {}, locks: {},
    env: { light: {} }, rev: 0,
    view: { month: 6, explore: 'planting', mode: 'plan', diagram: 'arrangement', selectedCell: null, selectedMix: null, camera: null, obs: null, sv: {} } };
}
let _fid = 0; const fragId = () => 'f' + Date.now().toString(36) + (++_fid).toString(36);

export class Project {
  constructor({ store, cs, K, site }) {
    this.s = store; this.cs = cs; this.K = K; this.site = site;
    this.state = emptyState(site); this.past = []; this.future = []; this.listeners = new Set(); this._perf = null; this._perfDirty = false; this.storage = { ok: true, error: null, savedAt: null };
    addEventListener('pagehide', () => { if (this._sv) { clearTimeout(this._sv); this._sv = 0; this.save(); } });
    this._ctxCache = new Map(); this._trees = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, detail) { for (const f of this.listeners) f(type, detail); }

  // ================================================================ site context (shared query with the AI side)
  bedCode(bedId) { return bedId.replace(/^bed\./, ''); }
  eligibleBeds() { return this.cs.designBeds().map((b) => ({ id: b.id, code: this.bedCode(b.id), name: b.name, style: b.props.styleName, areaM2: +(b.props.areaM2 || mpArea(b.geometry)).toFixed(1), district: b.parent || null })); }
  plantable(bedId) {
    this._pl ||= new Map(); if (this._pl.has(bedId)) return this._pl.get(bedId);
    const bed = this.s.getObject(bedId); if (!bed) return null;
    const bl = this.s.unitBlockers(bedId).map((b) => b.g);
    const g = bl.length ? diff(bed.geometry, ...bl) : (bed.geometry.type === 'MultiPolygon' ? bed.geometry : { type: 'MultiPolygon', coordinates: [bed.geometry.coordinates] });
    this._pl.set(bedId, g); return g;
  }
  context() {
    if (this._ctx) return this._ctx;
    const cs = this.cs, s = this.s; const cache = this._ctxCache;
    const F = ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.canopy'];
    this._ctx = {
      label: 'site layers: 3DEP elevation and slope, OSM path distance, NAIP crowns; sun / moisture / pH unknown',
      sample: (x, y) => { const k = `${Math.round(x * 4)},${Math.round(y * 4)}`; let v = cache.get(k); if (!v) { const p = cs._pointValues(x, y, null, F); v = { elevation: p['field.elevation'], slope: p['field.slope'], pathDist: p['field.distance-to-path'], canopy: p['field.canopy'] }; cache.set(k, v); } return v; },
      pathDist: (x, y) => { const v = cs._pathIdx.dist(x, y); return Number.isFinite(v) ? v : null; },
      elevation: (x, y) => s.sampleElevation(x, y), unknownFields: ['sun', 'moisture', 'ph'],
      pathGeoms: () => this.pathGeoms(),
    };
    return this._ctx;
  }
  pathGeoms() { if (!this._paths) this._paths = this.s.model.objects.filter((o) => ['path', 'boardwalk'].includes(o.type) && o.geometry && /Polygon/.test(o.geometry.type)).map((o) => ({ id: o.id, name: o.name, g: o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry })); return this._paths; }
  trees() { if (!this._trees) this._trees = this.cs._trees.map((t) => ({ x: t.x, y: t.y })); return this._trees; }

  // ================================================================ commands (one gesture = one undo step)
  snapshotDesign() { const o = {}; for (const k of DESIGN_PARTS) o[k] = structuredClone(this.state[k]); return o; }
  // V3: a cell-scoped command keeps only its declared cells of assignments / instances in the undo entry (a full clone of
  // ≈ 19 000 plants per stroke was the main cost of pointer-up); everything else is cloned as before.
  _snap(cells) {
    if (!cells) return { full: true, state: this.snapshotDesign() };
    const o = {}; for (const k of DESIGN_PARTS) if (!PER_CELL.includes(k)) o[k] = structuredClone(this.state[k]);
    for (const k of PER_CELL) { o[k] = {}; for (const c of cells) o[k][c] = this.state[k][c] === undefined ? null : structuredClone(this.state[k][c]); }
    return { full: false, cells: cells.slice(), state: o };
  }
  _apply(sn) {
    if (sn.full) { Object.assign(this.state, structuredClone(sn.state)); return null; }
    for (const k of DESIGN_PARTS) if (!PER_CELL.includes(k)) this.state[k] = structuredClone(sn.state[k]);
    for (const k of PER_CELL) for (const c of sn.cells) { const v = sn.state[k][c]; if (v == null) delete this.state[k][c]; else this.state[k][c] = structuredClone(v); }
    return sn.cells;
  }
  commit(label, fn, { undoable = true, changedCells = null, rebuildAll = false } = {}) {
    const cells = Array.isArray(changedCells) && !rebuildAll ? changedCells : null;
    const before = undoable ? this._snap(cells) : null;
    const r = fn(this.state);
    if (r && r.ok === false) { if (before) this._apply(before); return r; }
    if (undoable) { this.past.push({ label, ...before }); if (this.past.length > 60) this.past.shift(); this.future = []; }
    this.state.updated = new Date().toISOString(); this.state.rev = (this.state.rev || 0) + 1;
    this.syncStore({ changedCells, rebuildAll }); this.invalidatePerf(); this.saveSoon();
    this.emit('change', { label, changedCells });
    return r || { ok: true };
  }
  _undoRedo(from, to, verb) {
    const e = from.pop(); if (!e) return false;
    to.push({ label: e.label, ...this._snap(e.full ? null : e.cells) });
    const cells = this._apply(e); this.state.rev = (this.state.rev || 0) + 1;
    this.syncStore(cells ? { changedCells: cells } : { rebuildAll: true }); this.invalidatePerf(); this.saveSoon();
    this.emit('change', { label: verb + ' ' + e.label, [verb]: true, changedCells: cells }); return e.label;
  }
  undo() { return this._undoRedo(this.past, this.future, 'undo'); }
  redo() { return this._undoRedo(this.future, this.past, 'redo'); }
  // performance is derived: computed when first read after a change (and in idle time), not inside every gesture
  get perf() { if (this._perfDirty) this.recompute(); return this._perf; }
  set perf(v) { this._perf = v; this._perfDirty = false; }
  invalidatePerf() { this._perfDirty = true; clearTimeout(this._pt); this._pt = setTimeout(() => { if (this._perfDirty) (window.requestIdleCallback || setTimeout)(() => { if (this._perfDirty) this.recompute(); }, { timeout: 1500 }); }, 600); }
  setView(patch) { Object.assign(this.state.view, patch); this.saveSoon(); this.emit('view', patch); } // view only: never touches the design
  setStage(stage) { const order = ['define', 'structure', 'compose', 'explore']; this.state.stage = stage; if (order.indexOf(stage) > order.indexOf(this.state.maxStage)) this.state.maxStage = stage; this.save(); this.emit('stage', stage); }

  // ================================================================ Define: brief + whole-site strategy
  setBrief(patch) { Object.assign(this.state.brief, patch); this.state.brief.knowledgeVersion = this.K.version(); this.markStale('brief'); this.save(); this.emit('brief', patch); }
  markStale(why) { this.state.staleSince = this.state.staleSince || (Object.keys(this.state.assignments).length ? { why, at: new Date().toISOString() } : null); }
  confirmStrategy(strategy) {
    return this.commit('confirm planting strategy', (st) => {
      st.strategy = { ...structuredClone(strategy), confirmed: true, confirmedAt: new Date().toISOString() };
      // a bed that already has cells stays in the scope (its design is never cleared by a new strategy)
      st.brief.scopeBeds = [...new Set([...strategy.zones.flatMap((z) => z.bedIds), ...Object.keys(st.beds)])]; st.brief.confirmed = true;
    }, { changedCells: [] });
  }
  // ================================================================ environment: explicit project light assumptions per bed
  // value: 'sun' | 'part' | 'shade' | null (= remove; unknown). Labelled as a designer's assumption everywhere; the crown
  // proxy is kept and shown beside it, never replaced. Existing plants are not regenerated (new plants use it).
  setLightAssumption(bedIds, value) {
    const ids = bedIds.filter(Boolean); if (!ids.length) return { ok: false };
    return this.commit(value ? `assume ${value === 'part' ? 'part shade' : value} in ${ids.map((b) => this.bedCode(b)).join(', ')}` : `light unknown in ${ids.map((b) => this.bedCode(b)).join(', ')}`, (st) => {
      st.env ||= { light: {} }; st.env.light ||= {};
      for (const b of ids) { if (value) st.env.light[b] = { value, at: new Date().toISOString(), source: 'project assumption' }; else delete st.env.light[b]; }
    }, { changedCells: [] });
  }
  lightAssumption(bedId) { const e = this.state.env && this.state.env.light && this.state.env.light[bedId]; return e ? e.value : null; }
  zoneOf(bedId) { const s = this.state.strategy; return s ? s.zones.find((z) => z.bedIds.includes(bedId)) || null : null; }

  // ================================================================ Structure (one bed or many at once)
  previewCells(bedId, logic, params = {}) {
    const plantable = this.plantable(bedId); const code = this.bedCode(bedId);
    const o = this.state.brief.objectives;
    return generateCells({ bedId, bedCode: code, plantable, logic, params, context: this.context(), objectives: { continuity: o.continuity.on, suitability: o.suitability.on } });
  }
  structureImpact(bedId, preview) {
    const old = (this.state.beds[bedId] ? this.state.beds[bedId].cellIds : []).map((id) => this.state.cells[id]).filter(Boolean);
    const assigned = old.filter((c) => this.state.instances[c.id] && this.state.instances[c.id].plants.length);
    const remap = overlapMap(preview.cells, old);
    const carried = preview.cells.filter((n) => remap[n.id].to && remap[n.id].share >= 0.5 && this.state.assignments[remap[n.id].to]?.mixId).length;
    const frozen = old.filter((c) => this.state.locks[c.id]).length;
    return { oldCells: old.length, assignedCells: assigned.length, plants: assigned.reduce((a, c) => a + this.state.instances[c.id].plants.length, 0), remap, carried, frozen };
  }
  commitStructure(bedId, preview, opts = {}) { return this.commitStructureMany([preview], opts); }
  // several beds in ONE gesture (the strategy's whole scope). Frozen beds (any frozen cell) are skipped, not regenerated.
  commitStructureMany(previews, { remap = 'overlap', label } = {}) {
    const list = previews.filter((p) => p && p.ok);
    const skipped = list.filter((p) => (this.state.beds[p.bedId]?.cellIds || []).some((id) => this.state.locks[id])).map((p) => p.bedId);
    const todo = list.filter((p) => !skipped.includes(p.bedId)); if (!todo.length) return { ok: false, error: skipped.length ? 'these beds have frozen cells: unfreeze them first' : 'nothing to confirm' };
    const impacts = Object.fromEntries(todo.map((p) => [p.bedId, this.structureImpact(p.bedId, p)]));
    const r = this.commit(label || (todo.length === 1 ? `${todo[0].logic} cells in ${this.bedCode(todo[0].bedId)}` : `structure ${todo.length} beds`), (st) => {
      for (const preview of todo) {
        const bedId = preview.bedId; const impact = impacts[bedId];
        const old = st.beds[bedId] ? st.beds[bedId].cellIds : []; const oldA = {};
        for (const id of old) { if (st.assignments[id]) oldA[id] = st.assignments[id]; delete st.assignments[id]; delete st.instances[id]; delete st.cells[id]; delete st.acknowledged[id]; }
        st.beds[bedId] = { logic: preview.logic, params: preview.params, adaptation: preview.adaptation, cellIds: preview.cells.map((c) => c.id), zoneId: preview.zoneId || null, committedAt: new Date().toISOString() };
        for (const c of preview.cells) st.cells[c.id] = c;
        if (remap === 'overlap') for (const c of preview.cells) { const m = impact.remap[c.id]; const a = m && m.to && m.share >= 0.5 ? oldA[m.to] : null; if (a && a.fragments && a.fragments.length) { const mixIds = [...new Set(a.fragments.map((f) => f.mixId))]; st.assignments[c.id] = { cellId: c.id, fragments: [], origin: 'remap', remappedFrom: m.to, at: new Date().toISOString() }; for (const mid of mixIds) this._fillWhole(st, c.id, mid, { origin: 'remap', slots: [...new Set(a.fragments.filter((f) => f.mixId === mid).flatMap((f) => f.slots))] }); } }
        if (!st.brief.scopeBeds.includes(bedId)) st.brief.scopeBeds.push(bedId);
      }
    }, { rebuildAll: true });
    return { ...r, skipped };
  }
  removeStructure(bedId) {
    return this.commit(`reference planting back in ${this.bedCode(bedId)}`, (st) => {
      for (const id of (st.beds[bedId] || {}).cellIds || []) { delete st.cells[id]; delete st.assignments[id]; delete st.instances[id]; delete st.locks[id]; }
      delete st.beds[bedId]; st.brief.scopeBeds = st.brief.scopeBeds.filter((b) => b !== bedId);
    }, { rebuildAll: true });
  }
  allCells() { return Object.values(this.state.beds).flatMap((b) => b.cellIds.map((id) => this.state.cells[id])).filter(Boolean); }
  links() { const cells = this.allCells(); const key = cells.map((c) => c.id).join(','); if (this._linksKey !== key) { this._linksKey = key; this._links = linkAcrossBeds(cells); } return this._links; }

  // ================================================================ Mixes (one library; templates, legend recipes, Rules suggestions, manual)
  mix(id) { return this.state.mixes.find((m) => m.id === id) || null; }
  knownPlant = (id) => !!this.s.getObject(id) || this.state.plants.some((p) => p.id === id);
  addMix(mix, label = 'add mix') {
    const v = validateMix(mix, { knownPlant: this.knownPlant }); if (!v.ok) return { ok: false, errors: v.errors };
    let id = mix.id; let k = 2; while (this.mix(id)) id = mix.id.replace(/(\.\d+)?$/, '.' + k++);
    const r = this.commit(label, (st) => { st.mixes.push({ ...mix, id }); st.view.selectedMix = id; }, { changedCells: [] });
    return { ...r, ok: r.ok !== false, id };
  }
  usesOf(mixId) { return Object.entries(this.state.assignments).filter(([, a]) => a && (a.fragments || []).some((f) => f.mixId === mixId)).map(([c]) => c); }
  previewMixEdit(mixId, next) {
    const uses = this.usesOf(mixId).filter((c) => !this.state.locks[c]);
    const before = uses.reduce((a, c) => a + (this.state.instances[c] ? this.state.instances[c].plants.filter((p) => p.mixId === mixId).length : 0), 0);
    const st = { cells: this.state.cells, mixes: this.state.mixes.map((m) => (m.id === mixId ? next : m)), assignments: structuredClone(Object.fromEntries(uses.map((c) => [c, this.state.assignments[c]]))), instances: structuredClone(Object.fromEntries(uses.map((c) => [c, this.state.instances[c]]))), locks: this.state.locks };
    for (const c of uses) this._refillMix(st, c, mixId, next);
    const after = uses.reduce((a, c) => a + st.instances[c].plants.filter((p) => p.mixId === mixId).length, 0);
    const perfAfter = computePerformance({ cells: this.allCells(), assignments: this.state.assignments, instances: { ...this.state.instances, ...st.instances }, mixes: st.mixes, K: this.K, brief: this.state.brief, links: this.links() });
    return { uses, frozen: this.usesOf(mixId).filter((c) => this.state.locks[c]), before, after, perfBefore: summarize(this.perf), perfAfter: summarize(perfAfter), instancesAfter: st.instances };
  }
  applyMixEdit(mixId, next, { scope = 'all', cells = null, label } = {}) {
    const v = validateMix(next, { knownPlant: this.knownPlant }); if (!v.ok) return { ok: false, errors: v.errors };
    if (scope === 'variant') {
      const target = (cells || []).filter((c) => !this.state.locks[c]);
      const base = this.mix(mixId); const vid = mixId + '.v' + (this.state.mixes.filter((m) => m.sourceMixId === mixId).length + 1);
      const variant = finalize({ ...structuredClone(next), id: vid, name: next.name + ' (local)', version: 1, origin: 'variant', sourceMixId: mixId, sourceVersion: base.version, color: shade(base.color), history: [{ version: 1, at: new Date().toISOString(), summary: `local variant of ${base.name} v${base.version}: ${next.history[next.history.length - 1].summary}` }] });
      return this.commit(label || `local variant of ${base.name}`, (st) => {
        st.mixes.push(variant);
        for (const c of target) { const a = st.assignments[c]; if (!a) continue; for (const f of a.fragments) if (f.mixId === mixId) { f.mixId = vid; f.mixVersion = 1; } this._refillMix(st, c, vid, variant); }
        st.view.selectedMix = vid;
      }, { changedCells: target });
    }
    const uses = this.usesOf(mixId).filter((c) => !this.state.locks[c]);
    return this.commit(label || `edit ${next.name}`, (st) => { st.mixes = st.mixes.map((m) => (m.id === mixId ? next : m)); for (const c of uses) this._refillMix(st, c, mixId, next); }, { changedCells: uses });
  }
  deleteMix(mixId) {
    const uses = this.usesOf(mixId); if (uses.length) return { ok: false, error: `used in ${uses.length} cell(s): repaint or clear them first` };
    return this.commit('delete mix', (st) => { st.mixes = st.mixes.filter((m) => m.id !== mixId); if (st.view.selectedMix === mixId) st.view.selectedMix = null; }, { changedCells: [] });
  }

  // ================================================================ Placement: whole-cell fill, auto, strokes — same fragments, same engine
  _env(st) { return makeEnv(this, { frozen: (c) => !!(st.locks && st.locks[c]) }); }
  _ensureA(st, cellId) { return (st.assignments[cellId] ||= { cellId, fragments: [], origin: 'manual', at: new Date().toISOString() }); }
  _ensureI(st, cellId) { return (st.instances[cellId] ||= { cellId, plants: [], target: 0, placed: 0, missing: [], notes: [], byFrag: {} }); }
  // whole-cell fill of the given slots (default: every slot the mix has) — replaces those slots in the cell
  _fillWhole(st, cellId, mixId, { origin = 'manual', slots = null, seed = 1 } = {}) {
    const cell = st.cells[cellId]; const mix = st.mixes.find((m) => m.id === mixId); if (!cell || !mix) return null;
    const mixSlots = [...new Set(mix.layers.map((L) => L.slot))]; const use = (slots || mixSlots).filter((s) => mixSlots.includes(s));
    const a = this._ensureA(st, cellId); const inst = this._ensureI(st, cellId);
    for (const f of a.fragments) f.slots = f.slots.filter((s) => !use.includes(s)); a.fragments = a.fragments.filter((f) => f.slots.length);
    inst.plants = inst.plants.filter((p) => !use.includes(p.slot));
    const f = { id: fragId(), mixId, mixVersion: mix.version, slots: use, geometry: null, origin, seed, at: new Date().toISOString() };
    a.fragments.push(f); this._generate(st, cellId, f, mix); this._summarize(st, cellId); return f;
  }
  // generate the plants of one fragment against the plants that stay in the cell
  _generate(st, cellId, f, mix) {
    const cell = st.cells[cellId]; const inst = this._ensureI(st, cellId); const env = this._env(st);
    const idx = new PlantIndex(); for (const p of inst.plants) idx.add(p);
    for (const p of this.plantsNear(st, cell, cellId)) idx.add(p); // V3: spacing is checked across internal cell edges
    const g = f.geometry; const within = g ? (x, y) => inside(g, x, y) : null;
    const layers = mix.layers.filter((L) => f.slots.includes(L.slot)).map((L) => L.id);
    const b = g ? bbox(g) : (cell._bb || bbox(cell.geometry));
    const cands = candidates(mix, b, { layers, seed: f.seed || 1 });
    const v = validate(cands, { cell, mix, env, index: idx, within, fragId: f.id, existingKeys: new Set(inst.plants.map((p) => p.id)), seed: f.seed || 1 });
    inst.plants.push(...v.plants);
    const area = g ? mpArea(g) : cell.areaM2;
    inst.byFrag[f.id] = { target: +targetCount(mix, area, layers).toFixed(1), placed: v.plants.length, rejected: v.rejected, niche: v.niche, areaM2: +area.toFixed(2) };
    return v;
  }
  // plants of OTHER cells within 1.2 m of a cell's bbox (for spacing across cell edges; the cell itself excluded)
  plantsNear(st, cell, exclude, m = 1.2) {
    const b = cell._bb || (cell._bb = bbox(cell.geometry)); const out = [];
    for (const c of Object.values(st.cells)) { if (c.id === exclude || c.bedId !== cell.bedId) continue; const q = c._bb || (c._bb = bbox(c.geometry)); if (q[2] < b[0] - m || q[0] > b[2] + m || q[3] < b[1] - m || q[1] > b[3] + m) continue; const i = st.instances[c.id]; if (!i) continue; for (const p of i.plants) if (p.x > b[0] - m && p.x < b[2] + m && p.y > b[1] - m && p.y < b[3] + m) out.push(p); }
    return out;
  }
  _refillMix(st, cellId, mixId, mix) {
    const a = st.assignments[cellId]; const inst = st.instances[cellId]; if (!a || !inst) return;
    const frags = a.fragments.filter((f) => f.mixId === mixId); const ids = new Set(frags.map((f) => f.id));
    inst.plants = inst.plants.filter((p) => !ids.has(p.frag));
    for (const f of frags) { f.mixVersion = mix.version; this._generate(st, cellId, f, mix); }
    this._summarize(st, cellId);
  }
  _summarize(st, cellId) {
    const a = st.assignments[cellId]; const inst = st.instances[cellId]; if (!a || !inst) return;
    // drop fragments that own nothing and cover nothing
    const live = new Set(inst.plants.map((p) => p.frag)); a.fragments = a.fragments.filter((f) => live.has(f.id) || !f.geometry || mpArea(f.geometry) > 0.05);
    for (const k of Object.keys(inst.byFrag)) if (!a.fragments.some((f) => f.id === k)) delete inst.byFrag[k];
    const byMix = {}; for (const p of inst.plants) byMix[p.mixId] = (byMix[p.mixId] || 0) + 1;
    const dom = Object.entries(byMix).sort((x, y) => y[1] - x[1])[0];
    a.mixId = dom ? dom[0] : (a.fragments[0] ? a.fragments[0].mixId : null); const dm = a.mixId && st.mixes.find((m) => m.id === a.mixId); a.mixVersion = dm ? dm.version : null; a.status = 'ok';
    inst.mixId = a.mixId; inst.mixVersion = a.mixVersion; inst.byMix = byMix;
    inst.target = +Object.values(inst.byFrag).reduce((s, q) => s + q.target, 0).toFixed(1); inst.placed = inst.plants.length;
    const rej = Object.values(inst.byFrag).reduce((s, q) => s + q.rejected.edge + q.rejected.trunk + q.rejected.clearance + (q.rejected.light || 0), 0);
    inst.missing = rej ? [{ plantId: '*', requested: Math.round(inst.target), placed: inst.placed, rejected: rej }] : [];
    inst.notes = rej ? [`${rej} candidate position${rej === 1 ? '' : 's'} not planted (bed edge, trunk clearance, spacing, or a known light conflict) — reported, not moved`] : [];
    if (!inst.plants.length && !a.fragments.length) { delete st.assignments[cellId]; delete st.instances[cellId]; }
  }
  // Cell Fill (precise, whole cells) — V1 name kept: assign(cellIds, mixId)
  assign(cellIds, mixId, { origin = 'manual', layers = null, label } = {}) {
    const mix = this.mix(mixId); if (!mix) return { ok: false, error: 'no mix ' + mixId };
    const ids = cellIds.filter((c) => this.state.cells[c] && !this.state.locks[c]); if (!ids.length) return { ok: false, error: cellIds.some((c) => this.state.locks[c]) ? 'frozen cells are not changed' : 'no cells' };
    const slots = layers ? [...new Set(mix.layers.filter((L) => layers.includes(L.id) || layers.includes(L.slot)).map((L) => L.slot))] : null;
    return this.commit(label || `${mix.name} → ${ids.length} cell${ids.length === 1 ? '' : 's'}`, (st) => { for (const c of ids) { delete st.acknowledged[c]; this._fillWhole(st, c, mixId, { origin, slots }); } }, { changedCells: ids });
  }
  // Auto Compose accept: several cells, different mixes, ONE gesture
  assignMany(map, { origin = 'auto', label } = {}) {
    const ids = Object.keys(map).filter((c) => this.state.cells[c] && this.mix(map[c]) && !this.state.locks[c]);
    if (!ids.length) return { ok: false, error: 'nothing to assign' };
    return this.commit(label || `auto compose: ${ids.length} cells`, (st) => { for (const c of ids) { delete st.acknowledged[c]; this._fillWhole(st, c, map[c], { origin }); } }, { changedCells: ids });
  }
  /**
   * Commit a brush stroke staged by the live brush (brush.js): per cell, the plants it added and the ids it removed, and
   * the swept footprint. Target slots are replaced inside the footprint only. mixId null = eraser.
   */
  applyStroke({ mixId, slots, footprint, cells, label, stats = null, edge = 'hard' }) {
    const mix = mixId ? this.mix(mixId) : null; if (mixId && !mix) return { ok: false, error: 'no mix' };
    const ids = Object.keys(cells).filter((c) => this.state.cells[c] && !this.state.locks[c]); if (!ids.length) return { ok: false, error: 'the stroke touched no unfrozen cell' };
    const r = this.commit(label || (mix ? `brush ${mix.name}: ${ids.length} cell${ids.length === 1 ? '' : 's'}` : `erase in ${ids.length} cell${ids.length === 1 ? '' : 's'}`), (st) => {
      for (const c of ids) {
        const cell = st.cells[c]; const part = safeClip(cell.geometry, footprint, null); const s = cells[c]; // (if the boolean fails: no fragment geometry change, the plants are still applied)
        const a = this._ensureA(st, c); const inst = this._ensureI(st, c);
        const rm = new Set(s.remove || []); inst.plants = inst.plants.filter((p) => !rm.has(p.id));
        // existing fragments lose the footprint in the target slots (split by slot when needed)
        const next = [];
        for (const f of a.fragments) {
          const hit = f.slots.filter((x) => slots.includes(x)); if (!hit.length) { next.push(f); continue; }
          const keep = f.slots.filter((x) => !slots.includes(x)); if (keep.length) next.push({ ...f, slots: keep });
          const rest = part ? safeDiff(f.geometry || cell.geometry, part) : (f.geometry || cell.geometry);
          if (rest && mpArea(rest) > 0.05) { const nf = { ...f, id: keep.length ? fragId() : f.id, slots: hit, geometry: rest }; if (nf.id !== f.id) for (const p of inst.plants) if (p.frag === f.id && hit.includes(p.slot)) p.frag = nf.id; next.push(nf); }
        }
        a.fragments = next;
        if (mix && part && mpArea(part) > 0.01) {
          const same = a.fragments.find((f) => f.mixId === mixId && f.mixVersion === mix.version && f.origin === 'brush' && f.slots.join() === slots.join());
          const add = (s.add || []).map((p) => ({ ...p })); const exists = new Set(inst.plants.map((p) => p.id));
          if (same) { same.geometry = safeUnion([same.geometry || cell.geometry, part]); for (const p of add) p.frag = same.id; }
          else { const f = { id: fragId(), mixId, mixVersion: mix.version, slots: slots.slice(), geometry: part, origin: 'brush', seed: 1, at: new Date().toISOString(), ...(edge === 'soft' ? { edge: 'soft' } : {}) }; a.fragments.push(f); for (const p of add) p.frag = f.id; }
          inst.plants.push(...add.filter((p) => !exists.has(p.id)));
          const fid = add.length ? add[0].frag : (same && same.id); if (fid) { const area = mpArea(a.fragments.find((f) => f.id === fid).geometry || cell.geometry); const layers = mix.layers.filter((L) => slots.includes(L.slot)).map((L) => L.id); const mine = inst.plants.filter((p) => p.frag === fid); inst.byFrag[fid] = { target: +targetCount(mix, area, layers).toFixed(1), placed: mine.length, rejected: (stats && stats[c]) || { edge: 0, trunk: 0, clearance: 0, light: 0 }, niche: countFit(mine), areaM2: +area.toFixed(2) }; }
        }
        delete st.acknowledged[c]; this._summarize(st, c);
      }
    }, { changedCells: ids });
    return { ...r, cells: ids };
  }
  setLock(cellIds, on = true) {
    const ids = cellIds.filter((c) => this.state.cells[c]); if (!ids.length) return { ok: false };
    return this.commit(`${on ? 'freeze' : 'unfreeze'} ${ids.length} cell${ids.length === 1 ? '' : 's'}`, (st) => { for (const c of ids) { if (on) st.locks[c] = { at: new Date().toISOString() }; else delete st.locks[c]; } }, { changedCells: [] });
  }
  overrideConflict(cellId, items) { return this.commit('keep despite conflict', (st) => { const a = st.assignments[cellId]; if (!a) return { ok: false }; a.overrides = [...(a.overrides || []), ...items.map((i) => ({ ...i, acceptedAt: new Date().toISOString() }))]; }, { changedCells: [] }); }
  addProjectKnowledge({ plantId, claims = [], preference = null, original = '', uncertainty = 'personal observation, not verified', scope = 'project', label }) {
    return this.commit(label || 'add knowledge', (st) => {
      const at = new Date().toISOString();
      for (const c of claims) st.knowledge.records.push({ id: 'pk.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'fact', plantId, attr: c.attr, value: c.value, original, statement: original, uncertainty, scope, source: 'project', at });
      if (preference) st.knowledge.prefs.push({ id: 'pp.' + Date.now().toString(36), type: preference, plantId, original, at });
    }, { changedCells: [] });
  }
  editProjectKnowledge(recordId, patch) { return this.commit('edit knowledge', (st) => { const r = st.knowledge.records.find((q) => q.id === recordId); if (!r) return { ok: false }; Object.assign(r, patch, { editedAt: new Date().toISOString() }); }, { changedCells: [] }); }
  chooseSource(plantId, attr, source) { return this.commit('choose knowledge source', (st) => { st.knowledge.prefs = st.knowledge.prefs.filter((p) => !(p.type === 'source' && p.plantId === plantId && p.attr === attr)); st.knowledge.prefs.push({ type: 'source', plantId, attr, source, at: new Date().toISOString() }); }, { changedCells: [] }); }
  addPlant({ name, plantType = 'forb', heightM = null, spreadM = null, original = '' }) {
    const slug = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'plant';
    const id = 'sp.x-' + slug; if (this.s.getObject(id)) return { ok: true, id };
    const rec = { id, scientificName: String(name).trim().slice(0, 80), plantType, nominalHeightM: heightM || 0.6, nominalSpreadM: spreadM || 0.5, runtime: true, proxy: true, sizeKnown: !!(heightM || spreadM), original, addedAt: new Date().toISOString() };
    const r = this.s.registerRuntimeSpecies(rec); if (!r.ok) return r;
    this.commit(`add plant ${rec.scientificName}`, (st) => { st.plants.push(rec); }, { changedCells: [] });
    return { ok: true, id };
  }
  clearCells(cellIds, { empty = false } = {}) {
    const ids = cellIds.filter((c) => !this.state.locks[c]);
    return this.commit(empty ? `leave ${ids.length} cell(s) empty` : `clear ${ids.length} cell(s)`, (st) => { for (const c of ids) { delete st.assignments[c]; delete st.instances[c]; if (empty) st.acknowledged[c] = { empty: true, at: new Date().toISOString() }; else delete st.acknowledged[c]; } }, { changedCells: ids });
  }
  // new arrangement of the same recipes (another lattice seed) — frozen cells untouched
  reseed(cellId) { if (this.state.locks[cellId]) return { ok: false, error: 'frozen' }; return this.commit('new arrangement', (st) => { const a = st.assignments[cellId]; const inst = st.instances[cellId]; if (!a || !inst) return { ok: false }; inst.plants = []; inst.byFrag = {}; for (const f of a.fragments) { f.seed = (f.seed || 1) + 1; const m = st.mixes.find((q) => q.id === f.mixId); if (m) this._generate(st, cellId, f, m); } this._summarize(st, cellId); }, { changedCells: [cellId] }); }
  _arrange(st, cellId) { const a = st.assignments[cellId]; if (!a) return; const inst = this._ensureI(st, cellId); inst.plants = []; inst.byFrag = {}; for (const f of a.fragments) { const m = st.mixes.find((q) => q.id === f.mixId); if (m) { f.mixVersion = m.version; this._generate(st, cellId, f, m); } } this._summarize(st, cellId); }

  // ================================================================ derived: model draft (2D / 3D) and performance
  syncStore({ changedCells = null, rebuildAll = false } = {}) {
    const s = this.s; const st = this.state;
    const scope = Object.keys(st.beds).sort();
    for (const p of st.plants) if (!s.speciesIndexById.has(p.id)) s.registerRuntimeSpecies(p);
    const same = s.draft && s.draft.from === 'blank' && JSON.stringify([...s.draft.scope].sort()) === JSON.stringify(scope);
    if (!scope.length) { if (s.draft) { s.discardDraft(); } return; }
    let ops = [];
    if (!same || rebuildAll || changedCells == null) {
      s.createDraft({ from: 'blank', scope, activate: false }); this._newDraft = true;
      for (const c of Object.keys(st.instances)) { const op = this._placementOp(c); if (op) ops.push(op); }
    } else {
      for (const c of changedCells) { const pid = this._pid(c); if (s.draft.model.placements.some((p) => p.id === pid)) ops.push({ op: 'remove', target: pid }); const op = this._placementOp(c); if (op) ops.push(op); }
    }
    if (ops.length) { const r = s.applyPatch(ops); if (!r.ok) { console.error('draft patch refused', r.errors); this.emit('error', { message: 'The plant positions were refused by the model check: ' + r.errors.slice(0, 2).map((e) => e.message).join('; ') }); } }
    if (s.scenario !== 'working' || this._newDraft) { this._newDraft = false; s.setScenario('working'); } else s.emit('model', { scenario: 'working' });
  }
  _pid(cellId) { return 'pl.dz.' + cellId.replace(/^c\./, '').replace(/[^A-Za-z0-9._-]/g, '_'); }
  _placementOp(cellId) {
    const st = this.state; const inst = st.instances[cellId]; const cell = st.cells[cellId];
    if (!inst || !cell || !inst.plants.length) return null;
    const a = st.assignments[cellId] || {}; const mix = this.mix(a.mixId); const ids = [...new Set(inst.plants.map((p) => p.plantId))]; const roles = [...new Set(inst.plants.map((p) => p.role))];
    return { op: 'add', collection: 'placements', value: { id: this._pid(cellId), kind: 'plants', bedId: cell.bedId, mixId: a.mixId, mixVersion: a.mixVersion, assignmentId: cellId, color: mix ? mix.color : '#9C9A8C', speciesIds: ids, roles, geometry: cell.geometry, plants: inst.plants.map((p) => [p.x, p.y, ids.indexOf(p.plantId), Math.max(0.05, Math.min(5.9, p.spacing)), roles.indexOf(p.role)]) } };
  }
  recompute() {
    this._perfDirty = false;
    this._perf = computePerformance({ cells: this.allCells(), assignments: this.state.assignments, instances: this.state.instances, mixes: this.state.mixes, K: this.K, brief: this.state.brief, links: this.links(), plantedArea: (c) => this.plantedFootprint(c) });
    this.emit('perf', this._perf); return this._perf;
  }
  // planted footprint of a cell = union of its fragments (whole-cell fragment = the cell), clipped to the cell — the
  // area actually painted / filled, not the whole structural cell. Cached by the fragments' ids and geometry sizes.
  plantedFootprint(cell) {
    const a = this.state.assignments[cell.id]; const inst = this.state.instances[cell.id]; if (!a || !inst || !inst.plants.length) return 0;
    if (a.fragments.some((f) => !f.geometry)) return cell.areaM2;
    const key = a.fragments.map((f) => f.id + ':' + (f.geometry ? JSON.stringify(f.geometry).length : 0)).join('|');
    this._fp ||= new Map(); const hit = this._fp.get(cell.id); if (hit && hit.key === key) return hit.area;
    let area = cell.areaM2; try { const u = union(a.fragments.map((f) => f.geometry)); const c = u && clip(cell.geometry, u); area = c ? Math.min(cell.areaM2, mpArea(c)) : 0; } catch { area = Math.min(cell.areaM2, a.fragments.reduce((s2, f) => s2 + mpArea(f.geometry), 0)); } // fallback: sum of fragments (may double count overlaps; capped at the cell)
    this._fp.set(cell.id, { key, area: +area.toFixed(2) }); return +area.toFixed(2);
  }
  totals() { let plants = 0; const bySp = {}; for (const [c, i] of Object.entries(this.state.instances)) { plants += i.plants.length; for (const p of i.plants) bySp[p.plantId] = (bySp[p.plantId] || 0) + 1; } return { plants, species: Object.keys(bySp).length, bySpecies: bySp, cells: this.allCells().length, assigned: Object.values(this.state.instances).filter((i) => i && i.plants.length).length }; }

  // ================================================================ persistence
  save() {
    try {
      const st = { ...this.state, instances: undefined, packed: packInstances(this.state.instances), savedAt: new Date().toISOString() };
      const raw = JSON.stringify(st); localStorage.setItem(KEY, raw); this.storage = { ok: true, error: null, savedAt: st.savedAt, withInstances: true, bytes: raw.length };
    } catch (e) {
      try { const { instances, ...rest } = this.state; localStorage.setItem(KEY, JSON.stringify({ ...rest, instances: {}, instancesOmitted: true, savedAt: new Date().toISOString() })); this.storage = { ok: true, error: 'storage full: plant positions are rebuilt from their fragments on reload (brushed areas are re-filled from their footprints)', savedAt: new Date().toISOString(), withInstances: false }; }
      catch (e2) { this.storage = { ok: false, error: 'not saved: this browser refused local storage (' + (e2.name || e2.message) + '). Export the design to keep it.', savedAt: null }; }
    }
    this.emit('saved', this.storage); return this.storage;
  }
  saveSoon() { clearTimeout(this._sv); this._sv = setTimeout(() => this.save(), 400); }
  static stored() {
    try { const raw = localStorage.getItem(KEY); if (raw) { const o = JSON.parse(raw); if (o && o.schema === SCHEMA) return o; }
      const v1 = localStorage.getItem(KEY_V1); if (v1) { const o = JSON.parse(v1); if (o && o.schema === 'gp.project/1') return o; } } catch { /* */ }
    return null;
  }
  restore(o) {
    if (!o || (o.schema !== SCHEMA && o.schema !== 'gp.project/1')) return { ok: false, error: 'no saved project of this version' };
    const migrated = o.schema === 'gp.project/1';
    if (o.packed) { o = { ...o, instances: unpackInstances(o.packed) }; delete o.packed; }
    const base = emptyState(this.site); this.state = { ...base, ...o, schema: SCHEMA, locks: o.locks || {}, strategy: o.strategy || null, view: { ...base.view, ...(o.view || {}) }, brief: { ...base.brief, ...(o.brief || {}), objectives: { ...base.brief.objectives, ...((o.brief || {}).objectives || {}) } } };
    const ks = this.state.brief.knowledgeScopes; if (ks) { for (const [k, v] of Object.entries(ks)) if (k in this.K.scopes) this.K.scopes[k] = !!v; this.K.invalidate('restore'); }
    for (const p of this.state.plants) if (!this.s.speciesIndexById.has(p.id)) this.s.registerRuntimeSpecies(p);
    if (migrated) { // gp.project/1: whole-cell assignments → whole-cell fragments, mixes → layers; positions regenerated (stated)
      this.state.mixes = (o.mixes || []).map(migrateMix); const old = o.assignments || {}; this.state.assignments = {}; this.state.instances = {};
      for (const [c, a] of Object.entries(old)) if (a && a.mixId && this.state.cells[c]) this._fillWhole(this.state, c, a.mixId, { origin: 'migrated' });
      this.state.migratedFrom = { schema: 'gp.project/1', at: new Date().toISOString(), note: 'plant positions regenerated by the V2 fill engine' };
    } else if (o.instancesOmitted) for (const c of Object.keys(this.state.assignments)) this._arrange(this.state, c);
    this.state.env ||= { light: {} }; this.state.view.sv ||= {};
    this.past = []; this.future = []; this.syncStore({ rebuildAll: true }); this.recompute(); this.emit('change', { label: 'restored' });
    return { ok: true, migrated };
  }
  reset() { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_V1); } catch { /* */ } this.state = emptyState(this.site); this.past = []; this.future = []; if (this.s.draft) this.s.discardDraft(); this.recompute(); this.emit('change', { label: 'new project' }); }
  snapshots() { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]').map((s) => (s.design && s.design.packed ? { ...s, design: { ...s.design, instances: unpackInstances(s.design.packed), packed: undefined } } : s)); } catch { return []; } }
  // named snapshots keep the design INCLUDING plant positions (brush strokes are not reproducible from seeds alone)
  saveSnapshot(name) {
    const list = this.snapshots(); const design = this.snapshotDesign(); design.packed = packInstances(design.instances); delete design.instances;
    const snap = { id: 'snap.' + Date.now().toString(36), name: String(name || `Option ${String.fromCharCode(65 + list.length % 26)}`).slice(0, 60), at: new Date().toISOString(), stage: this.state.stage, brief: structuredClone(this.state.brief), design, fingerprint: fingerprint(this.state.instances), totals: this.totals(), perf: summarize(this.perf), knowledgeVersion: this.K.version() };
    list.unshift(snap); while (list.length > 4) list.pop();
    const enc = (l) => JSON.stringify(l.map((x) => (x.design && x.design.instances ? { ...x, design: { ...x.design, packed: packInstances(x.design.instances), instances: undefined } } : x)));
    try { localStorage.setItem(SNAP_KEY, enc(list)); } catch (e) { list.pop(); try { localStorage.setItem(SNAP_KEY, enc(list.slice(0, 2))); } catch { return { ok: false, error: 'snapshot not saved: storage refused (' + (e.name || e.message) + ')' }; } }
    return { ok: true, snapshot: snap };
  }
  restoreSnapshot(id) {
    const snap = this.snapshots().find((s) => s.id === id); if (!snap) return { ok: false, error: 'no snapshot' };
    return this.commit(`restore “${snap.name}”`, (st) => { for (const k of DESIGN_PARTS) if (snap.design[k] !== undefined) st[k] = structuredClone(snap.design[k]); }, { rebuildAll: true });
  }
  // performance of a snapshot computed NOW with the same definitions, knowledge and scope (for a fair comparison)
  perfOf(design) { const cells = Object.values(design.beds).flatMap((b) => b.cellIds.map((id) => design.cells[id])).filter(Boolean); return computePerformance({ cells, assignments: design.assignments, instances: design.instances, mixes: design.mixes, K: this.K, brief: this.state.brief, links: linkAcrossBeds(cells) }); }

  // ================================================================ export (structured planting data with caveats)
  exportData() {
    const st = this.state; const s = this.s; const perf = this.perf;
    const cells = this.allCells();
    return {
      schema: 'gp.export/2', exported: new Date().toISOString(), site: { id: st.siteId, name: st.siteName, units: 'm (local metres, x east, y north); z = USGS 3DEP 1 m elevation, NAVD88', crs: s.baseline.project.coordinateSystem || null },
      project: { id: st.id, name: st.name, stage: st.stage }, brief: st.brief, strategy: st.strategy,
      knowledge: { version: this.K.version(), scopes: this.K.scopes, projectRecords: st.knowledge.records, preferences: st.knowledge.prefs, addedPlants: st.plants },
      structure: Object.fromEntries(Object.entries(st.beds).map(([b, v]) => [b, { logic: v.logic, params: v.params, zoneId: v.zoneId || null, explanation: v.adaptation.explanation, notes: v.adaptation.notes }])),
      cells: cells.map((c) => ({ id: c.id, label: c.label, bedId: c.bedId, logic: c.logic, areaM2: c.areaM2, geometry: c.geometry, neighbors: c.neighbors.map((n) => n.id), conditions: c.conditions, frozen: !!st.locks[c.id], fragments: (st.assignments[c.id] && st.assignments[c.id].fragments) || [], intentionallyEmpty: !!(st.acknowledged[c.id] && st.acknowledged[c.id].empty) })),
      mixes: st.mixes,
      quantities: cells.filter((c) => st.instances[c.id]).map((c) => { const i = st.instances[c.id]; return { cellId: c.id, target: i.target, placed: i.placed, byMix: i.byMix, byFragment: i.byFrag, notes: i.notes }; }),
      instances: cells.flatMap((c) => (st.instances[c.id] ? st.instances[c.id].plants.map((p) => ({ id: p.id, plantId: p.plantId, cellId: c.id, fragmentId: p.frag, mixId: p.mixId, mixVersion: p.mixVersion, layer: p.layerId, slot: p.slot, role: p.role, x: p.x, y: p.y, z: s.sampleElevation(p.x, p.y), spacingM: p.spacing, niche: p.fit, substitutedFor: p.sub || null, proposal: true })) : [])),
      performance: perf ? { version: perf.version, definitions: perf.definitions, months: perf.months, byMonth: perf.byMonth, coverage: perf.coverage, designedAreaM2: perf.assignedAreaM2, issues: perf.issues } : null,
      assumptions: ['Layer densities, spacings, grains and drift coverage of the system templates are prototype assumptions (ALGORITHMS_V2.md).', 'Legend recipes: species of one legend role split its share equally.', 'Crown above = probable shade (NAIP crowns), not measured sun hours.'],
      caveats: [
        'Research prototype output: plant positions are a proposal generated from the recipes, not a survey or construction drawing.',
        'Flowering, pollinator and light values come from the knowledge scopes listed in knowledge.scopes; values from the illustrative layer are teaching values, not verified.',
        'Sun, soil moisture and pH have no data on this site: suitability for them is unknown.',
        'Performance metrics are proxies from placed plants (counts of plants with known flowering, documented groups, adjacency), not nectar quantity, pollinator abundance or flight.',
        'Areas outside the design scope keep the reconstructed reference planting (schematic, not a survey) and are not counted in the design metrics.',
      ],
    };
  }
}
// compact persistence of plant instances: string table + one tuple per plant (≈ 60 bytes instead of ≈ 250)
export function packInstances(instances) {
  const S = [], M = new Map(); const ix = (v) => { if (v == null) return -1; let k = M.get(v); if (k == null) { k = S.length; S.push(v); M.set(v, k); } return k; };
  const cells = {};
  for (const [c, i] of Object.entries(instances || {})) {
    const { plants, ...meta } = i;
    cells[c] = { m: meta, p: plants.map((q) => { const a = q.id.indexOf('/'); const b = q.id.indexOf('/', a + 1); return [ix(q.id.slice(0, b)), q.id.slice(b + 1), q.x, q.y, ix(q.plantId), ix(q.role), ix(q.slot), ix(q.layerId), ix(q.mixId), q.mixVersion, ix(q.frag), q.spacing, ix(q.fit), ix(q.sub || null)]; }) };
  }
  return { v: 1, s: S, c: cells };
}
export function unpackInstances(pk) {
  if (!pk || pk.v !== 1) return {}; const S = pk.s; const g = (k) => (k < 0 ? null : S[k]); const out = {};
  for (const [c, e] of Object.entries(pk.c)) out[c] = { ...e.m, plants: e.p.map((t) => { const q = { id: g(t[0]) + '/' + t[1], x: t[2], y: t[3], plantId: g(t[4]), role: g(t[5]), slot: g(t[6]), layerId: g(t[7]), mixId: g(t[8]), mixVersion: t[9], frag: g(t[10]), spacing: t[11], fit: g(t[12]) }; if (t[13] >= 0) q.sub = g(t[13]); return q; }) };
  return out;
}
function countFit(plants) { const n = { match: 0, conflict: 0, unknown: 0, substituted: 0 }; for (const p of plants) { n[p.fit || 'unknown']++; if (p.sub) n.substituted++; } return n; }
export function fingerprint(instances) { let h = 2166136261 >>> 0, n = 0; for (const c of Object.keys(instances).sort()) for (const p of instances[c].plants) { n++; for (const ch of `${c}|${p.plantId}|${p.x.toFixed(2)}|${p.y.toFixed(2)};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return `${n}:${h.toString(16)}`; }
function shade(hex) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.82))); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); }
export { editMix, makeMix, SLOTS, slotOfRole };
