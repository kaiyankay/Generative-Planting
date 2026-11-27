// Project state: the one authoritative record of a design. Every stage reads and writes it; every gesture is one undoable
// command; the model's working draft (2D + 3D rendering, picking) is derived from it. Persistence: localStorage with a
// schema version; API keys are never stored.
import { generateCells, linkAcrossBeds, overlapMap, mpArea } from './spatial.js';
import { arrangeCell } from './arrange.js';
import { computePerformance, summarize } from './performance.js';
import { editMix, makeMix, validateMix } from './mix.js';
import { pointInGeom } from '../geom.js';
import { diff } from '../design/geo.js';

export const SCHEMA = 'gp.project/1';
const KEY = 'gp.flow.project.v1', SNAP_KEY = 'gp.flow.snapshots.v1';
const DESIGN_PARTS = ['beds', 'cells', 'mixes', 'assignments', 'instances', 'knowledge', 'plants', 'acknowledged'];

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
      { id: 'reference', kind: 'hard', text: 'Beds you do not structure keep the reference planting.' },
      { id: 'light', kind: 'soft', text: 'Avoid plants recorded for the wrong light (crown above = probable shade); you can override.' },
    ],
    scopeBeds: [], knowledgeVersion: null, confirmed: false,
  };
}
export function emptyState(site) {
  const now = new Date().toISOString();
  return { schema: SCHEMA, id: 'prj.' + Date.now().toString(36), siteId: site.id, siteName: site.name, name: 'Planting design 1', created: now, updated: now, stage: 'define', maxStage: 'define',
    brief: defaultBrief(site.id), beds: {}, cells: {}, mixes: [], assignments: {}, instances: {}, knowledge: { records: [], prefs: [] }, plants: [], acknowledged: {},
    view: { month: 6, explore: 'planting', selectedCell: null, selectedMix: null, camera: null, obs: null } };
}

export class Project {
  constructor({ store, cs, K, site }) {
    this.s = store; this.cs = cs; this.K = K; this.site = site;
    this.state = emptyState(site); this.past = []; this.future = []; this.listeners = new Set(); this.perf = null; this.storage = { ok: true, error: null, savedAt: null };
    this._ctxCache = new Map(); this._trees = null;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, detail) { for (const f of this.listeners) f(type, detail); }

  // ================================================================ site context (shared query with the AI side)
  bedCode(bedId) { return bedId.replace(/^bed\./, ''); }
  eligibleBeds() { return this.cs.designBeds().map((b) => ({ id: b.id, code: this.bedCode(b.id), name: b.name, style: b.props.styleName, areaM2: +(b.props.areaM2 || mpArea(b.geometry)).toFixed(1) })); }
  plantable(bedId) {
    const bed = this.s.getObject(bedId); if (!bed) return null;
    const bl = this.s.unitBlockers(bedId).map((b) => b.g);
    const g = bl.length ? diff(bed.geometry, ...bl) : (bed.geometry.type === 'MultiPolygon' ? bed.geometry : { type: 'MultiPolygon', coordinates: [bed.geometry.coordinates] });
    return g;
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
    };
    return this._ctx;
  }
  trees() { if (!this._trees) this._trees = this.cs._trees.map((t) => ({ x: t.x, y: t.y })); return this._trees; }

  // ================================================================ commands (one gesture = one undo step)
  snapshotDesign() { const o = {}; for (const k of DESIGN_PARTS) o[k] = structuredClone(this.state[k]); return o; }
  commit(label, fn, { undoable = true, changedCells = null, rebuildAll = false } = {}) {
    const before = undoable ? this.snapshotDesign() : null;
    const r = fn(this.state);
    if (r && r.ok === false) return r;
    if (undoable) { this.past.push({ label, state: before }); if (this.past.length > 60) this.past.shift(); this.future = []; }
    this.state.updated = new Date().toISOString();
    this.syncStore({ changedCells, rebuildAll }); this.recompute(); this.save();
    this.emit('change', { label, changedCells });
    return r || { ok: true };
  }
  undo() { const e = this.past.pop(); if (!e) return false; this.future.push({ label: e.label, state: this.snapshotDesign() }); Object.assign(this.state, structuredClone(e.state)); this.syncStore({ rebuildAll: true }); this.recompute(); this.save(); this.emit('change', { label: 'undo ' + e.label, undo: true }); return e.label; }
  redo() { const e = this.future.pop(); if (!e) return false; this.past.push({ label: e.label, state: this.snapshotDesign() }); Object.assign(this.state, structuredClone(e.state)); this.syncStore({ rebuildAll: true }); this.recompute(); this.save(); this.emit('change', { label: 'redo ' + e.label, redo: true }); return e.label; }
  setView(patch) { Object.assign(this.state.view, patch); this.saveSoon(); this.emit('view', patch); } // view only: never touches the design
  setStage(stage) { const order = ['define', 'structure', 'compose', 'explore']; this.state.stage = stage; if (order.indexOf(stage) > order.indexOf(this.state.maxStage)) this.state.maxStage = stage; this.save(); this.emit('stage', stage); }

  // ================================================================ Define
  setBrief(patch) { Object.assign(this.state.brief, patch); this.state.brief.knowledgeVersion = this.K.version(); this.markStale('brief'); this.save(); this.emit('brief', patch); }
  markStale(why) { // Define / knowledge changes never delete the design: suggestions and metrics become "to review"
    this.state.staleSince = this.state.staleSince || (Object.keys(this.state.assignments).length ? { why, at: new Date().toISOString() } : null);
  }

  // ================================================================ Structure
  previewCells(bedId, logic, params = {}) {
    const plantable = this.plantable(bedId); const code = this.bedCode(bedId);
    const o = this.state.brief.objectives;
    return generateCells({ bedId, bedCode: code, plantable, logic, params, context: this.context(), objectives: { continuity: o.continuity.on, suitability: o.suitability.on } });
  }
  // impact of replacing a bed's cells: which assignments are affected, and the overlap remap
  structureImpact(bedId, preview) {
    const old = (this.state.beds[bedId] ? this.state.beds[bedId].cellIds : []).map((id) => this.state.cells[id]).filter(Boolean);
    const assigned = old.filter((c) => this.state.assignments[c.id] && (this.state.assignments[c.id].mixId || this.state.assignments[c.id].empty));
    const remap = overlapMap(preview.cells, old); // for each NEW cell: best old cell
    const carried = preview.cells.filter((n) => remap[n.id].to && remap[n.id].share >= 0.5 && this.state.assignments[remap[n.id].to]?.mixId).length;
    return { oldCells: old.length, assignedCells: assigned.length, plants: assigned.reduce((a, c) => a + ((this.state.instances[c.id] && this.state.instances[c.id].plants.length) || 0), 0), remap, carried };
  }
  commitStructure(bedId, preview, { remap = 'overlap' } = {}) {
    const impact = this.structureImpact(bedId, preview);
    return this.commit(`${preview.logic} cells in ${this.bedCode(bedId)}`, (st) => {
      const old = st.beds[bedId] ? st.beds[bedId].cellIds : [];
      const oldAssign = {}; for (const id of old) { if (st.assignments[id]) oldAssign[id] = st.assignments[id]; delete st.assignments[id]; delete st.instances[id]; delete st.cells[id]; delete st.acknowledged[id]; }
      st.beds[bedId] = { logic: preview.logic, params: preview.params, adaptation: preview.adaptation, cellIds: preview.cells.map((c) => c.id), committedAt: new Date().toISOString() };
      for (const c of preview.cells) st.cells[c.id] = c;
      if (remap === 'overlap') for (const c of preview.cells) { const m = impact.remap[c.id]; const a = m && m.to && m.share >= 0.5 ? oldAssign[m.to] : null; if (a && a.mixId) { st.assignments[c.id] = { ...a, origin: 'remap', remappedFrom: m.to, at: new Date().toISOString() }; this._arrange(st, c.id); } }
      if (!st.brief.scopeBeds.includes(bedId)) st.brief.scopeBeds.push(bedId);
    }, { rebuildAll: true });
  }
  removeStructure(bedId) {
    return this.commit(`reference planting back in ${this.bedCode(bedId)}`, (st) => {
      for (const id of (st.beds[bedId] || {}).cellIds || []) { delete st.cells[id]; delete st.assignments[id]; delete st.instances[id]; }
      delete st.beds[bedId]; st.brief.scopeBeds = st.brief.scopeBeds.filter((b) => b !== bedId);
    }, { rebuildAll: true });
  }
  allCells() { return Object.values(this.state.beds).flatMap((b) => b.cellIds.map((id) => this.state.cells[id])).filter(Boolean); }
  links() { const cells = this.allCells(); const key = cells.map((c) => c.id).join(','); if (this._linksKey !== key) { this._linksKey = key; this._links = linkAcrossBeds(cells); } return this._links; }

  // ================================================================ Mixes (one library; assisted and manual paths write the same objects)
  mix(id) { return this.state.mixes.find((m) => m.id === id) || null; }
  knownPlant = (id) => !!this.s.getObject(id) || this.state.plants.some((p) => p.id === id);
  addMix(mix, label = 'add mix') {
    const v = validateMix(mix, { knownPlant: this.knownPlant }); if (!v.ok) return { ok: false, errors: v.errors };
    let id = mix.id; let k = 2; while (this.mix(id)) id = mix.id.replace(/(\.\d+)?$/, '.' + k++);
    return this.commit(label, (st) => { st.mixes.push({ ...mix, id }); st.view.selectedMix = id; }, { changedCells: [] }), { ok: true, id };
  }
  // edit a shared mix: 'all' updates every linked cell (affected instances only); 'variant' makes a local copy for the given cells
  usesOf(mixId) { return Object.entries(this.state.assignments).filter(([, a]) => a && a.mixId === mixId).map(([c]) => c); }
  previewMixEdit(mixId, next) {
    const uses = this.usesOf(mixId); const before = uses.reduce((a, c) => a + ((this.state.instances[c] && this.state.instances[c].plants.length) || 0), 0);
    const st = structuredClone({ cells: this.state.cells, mixes: this.state.mixes.map((m) => (m.id === mixId ? next : m)), assignments: this.state.assignments, instances: {} });
    for (const c of uses) this._arrange(st, c);
    const after = uses.reduce((a, c) => a + st.instances[c].plants.length, 0);
    const perfAfter = computePerformance({ cells: this.allCells(), assignments: this.state.assignments, instances: { ...this.state.instances, ...st.instances }, mixes: st.mixes, K: this.K, brief: this.state.brief, links: this.links() });
    return { uses, before, after, perfBefore: summarize(this.perf), perfAfter: summarize(perfAfter), instancesAfter: st.instances };
  }
  applyMixEdit(mixId, next, { scope = 'all', cells = null, label } = {}) {
    const v = validateMix(next, { knownPlant: this.knownPlant }); if (!v.ok) return { ok: false, errors: v.errors };
    if (scope === 'variant') {
      const target = cells && cells.length ? cells : [];
      const base = this.mix(mixId); const vid = mixId + '.v' + (this.state.mixes.filter((m) => m.sourceMixId === mixId).length + 1);
      const variant = { ...next, id: vid, name: next.name + ' (local)', version: 1, origin: 'variant', sourceMixId: mixId, sourceVersion: base.version, color: shade(base.color), history: [{ version: 1, at: new Date().toISOString(), summary: `local variant of ${base.name} v${base.version}: ${next.history[next.history.length - 1].summary}` }] };
      return this.commit(label || `local variant of ${base.name}`, (st) => { st.mixes.push(variant); for (const c of target) { st.assignments[c] = { ...st.assignments[c], mixId: vid, mixVersion: 1, origin: 'manual', at: new Date().toISOString() }; this._arrange(st, c); } st.view.selectedMix = vid; }, { changedCells: target });
    }
    const uses = this.usesOf(mixId);
    return this.commit(label || `edit ${next.name}`, (st) => { st.mixes = st.mixes.map((m) => (m.id === mixId ? next : m)); for (const c of uses) { st.assignments[c].mixVersion = next.version; this._arrange(st, c); } }, { changedCells: uses });
  }
  deleteMix(mixId) {
    const uses = this.usesOf(mixId); if (uses.length) return { ok: false, error: `used by ${uses.length} cell(s): reassign or clear them first` };
    return this.commit('delete mix', (st) => { st.mixes = st.mixes.filter((m) => m.id !== mixId); if (st.view.selectedMix === mixId) st.view.selectedMix = null; }, { changedCells: [] });
  }

  // ================================================================ Assignments (manual and auto write the same objects)
  assign(cellIds, mixId, { origin = 'manual', overrides = [], label } = {}) {
    const mix = this.mix(mixId); if (!mix) return { ok: false, error: 'no mix ' + mixId };
    const ids = cellIds.filter((c) => this.state.cells[c]);
    if (!ids.length) return { ok: false, error: 'no cells' };
    return this.commit(label || `${mix.name} → ${ids.length} cell${ids.length === 1 ? '' : 's'}`, (st) => {
      for (const c of ids) { st.assignments[c] = { cellId: c, mixId, mixVersion: mix.version, origin, seed: (st.assignments[c] && st.assignments[c].seed) || 1, overrides: overrides.filter((o) => o.cellId === c || !o.cellId), status: 'ok', at: new Date().toISOString() }; delete st.acknowledged[c]; this._arrange(st, c); }
    }, { changedCells: ids });
  }
  // several cells, possibly different mixes, as ONE gesture (Auto Compose accept)
  assignMany(map, { origin = 'auto', label } = {}) {
    const ids = Object.keys(map).filter((c) => this.state.cells[c] && this.mix(map[c]));
    if (!ids.length) return { ok: false, error: 'nothing to assign' };
    return this.commit(label || `auto compose: ${ids.length} cells`, (st) => {
      for (const c of ids) { const mix = st.mixes.find((m) => m.id === map[c]); st.assignments[c] = { cellId: c, mixId: mix.id, mixVersion: mix.version, origin, seed: 1, overrides: [], status: 'ok', at: new Date().toISOString() }; delete st.acknowledged[c]; this._arrange(st, c); }
    }, { changedCells: ids });
  }
  overrideConflict(cellId, items) { return this.commit('keep despite conflict', (st) => { const a = st.assignments[cellId]; if (!a) return { ok: false }; a.overrides = [...(a.overrides || []), ...items.map((i) => ({ ...i, acceptedAt: new Date().toISOString() }))]; }, { changedCells: [] }); }
  // knowledge from the design: project facts and preferences are kept apart; original text and uncertainty are kept
  addProjectKnowledge({ plantId, claims = [], preference = null, original = '', uncertainty = 'personal observation, not verified', label }) {
    return this.commit(label || 'add knowledge', (st) => {
      const at = new Date().toISOString();
      for (const c of claims) st.knowledge.records.push({ id: 'pk.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: 'fact', plantId, attr: c.attr, value: c.value, original, statement: original, uncertainty, scope: 'project', source: 'project', at });
      if (preference) st.knowledge.prefs.push({ id: 'pp.' + Date.now().toString(36), type: preference, plantId, original, at });
    }, { changedCells: [] });
  }
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
    return this.commit(empty ? `leave ${cellIds.length} cell(s) empty` : `clear ${cellIds.length} cell(s)`, (st) => { for (const c of cellIds) { delete st.assignments[c]; delete st.instances[c]; if (empty) st.acknowledged[c] = { empty: true, at: new Date().toISOString() }; else delete st.acknowledged[c]; } }, { changedCells: cellIds });
  }
  reseed(cellId) { return this.commit('new arrangement', (st) => { const a = st.assignments[cellId]; if (!a) return { ok: false }; a.seed = (a.seed || 1) + 1; this._arrange(st, cellId); }, { changedCells: [cellId] }); }
  _arrange(st, cellId) {
    const a = st.assignments[cellId]; const cell = st.cells[cellId]; const mix = st.mixes.find((m) => m.id === a.mixId);
    if (!a || !cell || !mix) { delete st.instances[cellId]; return; }
    st.instances[cellId] = arrangeCell({ cell, mix, K: this.K, seed: a.seed || 1, trees: this.trees() });
  }

  // ================================================================ derived: model draft (2D / 3D) and performance
  syncStore({ changedCells = null, rebuildAll = false } = {}) {
    const s = this.s; const st = this.state;
    const scope = Object.keys(st.beds).sort();
    for (const p of st.plants) if (!s.speciesIndexById.has(p.id)) s.registerRuntimeSpecies(p);
    const same = s.draft && s.draft.from === 'blank' && JSON.stringify([...s.draft.scope].sort()) === JSON.stringify(scope);
    if (!scope.length) { if (s.draft) { s.discardDraft(); } return; }
    let ops = [];
    if (!same || rebuildAll || changedCells == null) {
      s.createDraft({ from: 'blank', scope, activate: false });
      for (const c of Object.keys(st.instances)) { const op = this._placementOp(c); if (op) ops.push(op); }
    } else {
      for (const c of changedCells) { const pid = this._pid(c); if (s.draft.model.placements.some((p) => p.id === pid)) ops.push({ op: 'remove', target: pid }); const op = this._placementOp(c); if (op) ops.push(op); }
    }
    if (ops.length) { const r = s.applyPatch(ops); if (!r.ok) { console.error('draft patch refused', r.errors); this.emit('error', { message: 'The plant positions were refused by the model check: ' + r.errors.slice(0, 2).map((e) => e.message).join('; ') }); } }
    if (s.scenario !== 'working') s.setScenario('working'); else s.emit('model', { scenario: 'working' });
  }
  _pid(cellId) { return 'pl.dz.' + cellId.replace(/^c\./, '').replace(/[^A-Za-z0-9._-]/g, '_'); }
  _placementOp(cellId) {
    const st = this.state; const inst = st.instances[cellId]; const a = st.assignments[cellId]; const cell = st.cells[cellId];
    if (!inst || !a || !cell || !inst.plants.length) return null;
    const mix = this.mix(a.mixId); const ids = [...new Set(inst.plants.map((p) => p.plantId))]; const roles = [...new Set(inst.plants.map((p) => p.role))];
    return { op: 'add', collection: 'placements', value: { id: this._pid(cellId), kind: 'plants', bedId: cell.bedId, mixId: a.mixId, mixVersion: a.mixVersion, assignmentId: cellId, color: mix ? mix.color : '#9C9A8C', speciesIds: ids, roles, geometry: cell.geometry, plants: inst.plants.map((p) => [p.x, p.y, ids.indexOf(p.plantId), Math.max(0.05, Math.min(5.9, p.spacing)), roles.indexOf(p.role)]) } };
  }
  recompute() {
    this.perf = computePerformance({ cells: this.allCells(), assignments: this.state.assignments, instances: this.state.instances, mixes: this.state.mixes, K: this.K, brief: this.state.brief, links: this.links() });
    this.emit('perf', this.perf); return this.perf;
  }
  totals() { let plants = 0; const bySp = {}; for (const [c, i] of Object.entries(this.state.instances)) { if (!this.state.assignments[c]) continue; plants += i.plants.length; for (const p of i.plants) bySp[p.plantId] = (bySp[p.plantId] || 0) + 1; } return { plants, species: Object.keys(bySp).length, bySpecies: bySp, cells: this.allCells().length, assigned: Object.values(this.state.assignments).filter((a) => a && a.mixId).length }; }

  // ================================================================ persistence
  save() {
    try {
      const st = { ...this.state, savedAt: new Date().toISOString() };
      localStorage.setItem(KEY, JSON.stringify(st)); this.storage = { ok: true, error: null, savedAt: st.savedAt, withInstances: true };
    } catch (e) {
      try { const { instances, ...rest } = this.state; localStorage.setItem(KEY, JSON.stringify({ ...rest, instances: {}, instancesOmitted: true, savedAt: new Date().toISOString() })); this.storage = { ok: true, error: 'storage full: plant positions are rebuilt from their seeds on reload', savedAt: new Date().toISOString(), withInstances: false }; }
      catch (e2) { this.storage = { ok: false, error: 'not saved: this browser refused local storage (' + (e2.name || e2.message) + '). Export the design to keep it.', savedAt: null }; }
    }
    this.emit('saved', this.storage); return this.storage;
  }
  saveSoon() { clearTimeout(this._sv); this._sv = setTimeout(() => this.save(), 400); }
  static stored() { try { const raw = localStorage.getItem(KEY); if (!raw) return null; const o = JSON.parse(raw); return o && o.schema === SCHEMA ? o : null; } catch { return null; } }
  restore(o) {
    if (!o || o.schema !== SCHEMA) return { ok: false, error: 'no saved project of this version' };
    const base = emptyState(this.site); this.state = { ...base, ...o, view: { ...base.view, ...(o.view || {}) }, brief: { ...base.brief, ...(o.brief || {}), objectives: { ...base.brief.objectives, ...((o.brief || {}).objectives || {}) } } };
    const ks = this.state.brief.knowledgeScopes; if (ks) { for (const [k, v] of Object.entries(ks)) if (k in this.K.scopes) this.K.scopes[k] = !!v; this.K.invalidate('restore'); }
    for (const p of this.state.plants) if (!this.s.speciesIndexById.has(p.id)) this.s.registerRuntimeSpecies(p);
    if (o.instancesOmitted) for (const c of Object.keys(this.state.assignments)) this._arrange(this.state, c);
    this.past = []; this.future = []; this.syncStore({ rebuildAll: true }); this.recompute(); this.emit('change', { label: 'restored' });
    return { ok: true };
  }
  reset() { try { localStorage.removeItem(KEY); } catch { /* */ } this.state = emptyState(this.site); this.past = []; this.future = []; if (this.s.draft) this.s.discardDraft(); this.recompute(); this.emit('change', { label: 'new project' }); }
  // named snapshots: design part without instance rows (rebuilt deterministically) + the performance summary
  snapshots() { try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch { return []; } }
  saveSnapshot(name) {
    const list = this.snapshots(); const { instances, ...design } = this.snapshotDesign();
    const fp = fingerprint(this.state.instances);
    const snap = { id: 'snap.' + Date.now().toString(36), name: String(name || `Snapshot ${list.length + 1}`).slice(0, 60), at: new Date().toISOString(), stage: this.state.stage, brief: structuredClone(this.state.brief), design, fingerprint: fp, totals: this.totals(), perf: summarize(this.perf), knowledgeVersion: this.K.version() };
    list.unshift(snap); while (list.length > 8) list.pop();
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); } catch (e) { return { ok: false, error: 'snapshot not saved: storage refused (' + (e.name || e.message) + ')' }; }
    return { ok: true, snapshot: snap };
  }
  restoreSnapshot(id) {
    const snap = this.snapshots().find((s) => s.id === id); if (!snap) return { ok: false, error: 'no snapshot' };
    return this.commit(`restore "${snap.name}"`, (st) => { for (const k of DESIGN_PARTS) if (k !== 'instances') st[k] = structuredClone(snap.design[k]); st.instances = {}; for (const c of Object.keys(st.assignments)) if (st.assignments[c] && st.assignments[c].mixId) this._arrange(st, c); }, { rebuildAll: true });
  }

  // ================================================================ export (structured planting data with caveats)
  exportData() {
    const st = this.state; const s = this.s; const perf = this.perf;
    const cells = this.allCells();
    return {
      schema: 'gp.export/1', exported: new Date().toISOString(), site: { id: st.siteId, name: st.siteName, units: 'm (local metres, x east, y north); z = USGS 3DEP 1 m elevation, NAVD88', crs: s.baseline.project.coordinateSystem || null },
      project: { id: st.id, name: st.name, stage: st.stage }, brief: st.brief,
      knowledge: { version: this.K.version(), scopes: this.K.scopes, projectRecords: st.knowledge.records, preferences: st.knowledge.prefs, addedPlants: st.plants },
      structure: Object.fromEntries(Object.entries(st.beds).map(([b, v]) => [b, { logic: v.logic, params: v.params, explanation: v.adaptation.explanation, notes: v.adaptation.notes }])),
      cells: cells.map((c) => ({ id: c.id, label: c.label, bedId: c.bedId, logic: c.logic, areaM2: c.areaM2, geometry: c.geometry, neighbors: c.neighbors.map((n) => n.id), conditions: c.conditions, assignment: st.assignments[c.id] || null, intentionallyEmpty: !!(st.acknowledged[c.id] && st.acknowledged[c.id].empty) })),
      mixes: st.mixes,
      quantities: cells.filter((c) => st.instances[c.id] && st.assignments[c.id]).map((c) => { const i = st.instances[c.id]; return { cellId: c.id, mixId: i.mixId, mixVersion: i.mixVersion, target: i.target, requested: i.requested, placed: i.placed, missing: i.missing, notes: i.notes }; }),
      instances: cells.flatMap((c) => (st.instances[c.id] && st.assignments[c.id] ? st.instances[c.id].plants.map((p, k) => ({ id: `${c.id}#${k + 1}`, plantId: p.plantId, cellId: c.id, mixId: st.instances[c.id].mixId, mixVersion: st.instances[c.id].mixVersion, role: p.role, x: p.x, y: p.y, z: s.sampleElevation(p.x, p.y), spacingM: p.spacing, seed: st.instances[c.id].seed, proposal: true })) : [])),
      performance: perf ? { version: perf.version, definitions: perf.definitions, months: perf.months, byMonth: perf.byMonth, coverage: perf.coverage, issues: perf.issues } : null,
      caveats: [
        'Research prototype output: plant positions are a proposal generated from the recipes, not a survey or construction drawing.',
        'Flowering, pollinator and light values come from the knowledge scopes listed in knowledge.scopes; values from the illustrative layer are teaching values, not verified.',
        'Sun, soil moisture and pH have no data on this site: suitability for them is unknown.',
        'Performance metrics are proxies (presence of known flowering, documented groups, adjacency), not nectar quantity, pollinator abundance or flight.',
        'Beds not structured keep the reconstructed reference planting (schematic, not a survey).',
      ],
    };
  }
}
export function fingerprint(instances) { let h = 2166136261 >>> 0, n = 0; for (const c of Object.keys(instances).sort()) for (const p of instances[c].plants) { n++; for (const ch of `${c}|${p.plantId}|${p.x.toFixed(2)}|${p.y.toFixed(2)};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return `${n}:${h.toString(16)}`; }
function shade(hex) { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * 0.82))); return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join(''); }
export { editMix, makeMix };
