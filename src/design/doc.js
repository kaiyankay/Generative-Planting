// Design document: the working planting design as data.
//   mixes        – versioned paint (src/design/mixes.js)
//   assignments  – a space (beds / drawn area / curve band / point) that references a mix, with local parameters,
//                  a precedence order and a keep rule (frozen = its plants are kept exactly as they are)
//   clears       – areas where the existing (reference / copied) planting was really removed (data, not a view filter)
//   settings     – hypothetical scenarios, trunk clearance
// Three independent concepts stay apart: the bed framework (model objects), the designer's spaces (assignments) and the
// computational zones (ComputeSpace). The document is the source of truth; the store's working draft is rebuilt from it
// through the same validated patch API every client uses (placements of kind 'plants', ids pl.dz.*).
import { generate, regionOf, ENGINE_VERSION } from './engine.js';
import { clip, diff, union, area, bboxOf, pointInGeom, fnv, hashStr } from './geo.js';
import { validateMix, changeMix, nextColor, slug } from './mixes.js';
import { DESIGN_PREFIX, isDesignOp } from '../model.js';

const KEY = 'gp.designDoc.v1';
const MAX_HISTORY = 80;
const SQ3 = Math.sqrt(3) / 2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class DesignDoc {
  constructor({ store, cs, library, site, initialMixes }) {
    this.s = store; this.cs = cs; this.lib = library; this.site = site;
    this.initialMixes = initialMixes || [];
    this.state = null; this.past = []; this.future = []; this.cache = new Map(); this.applied = { ids: new Set(), clears: [] };
    this.listeners = new Set(); this.last = null; this.busy = false;
    this._bedBoxes = new Map();
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(info) { for (const fn of this.listeners) { try { fn(info); } catch (e) { console.error(e); } } }

  // ---------------------------------------------------------------- environment shared with the engine
  env(state = this.state) {
    const beds = this.cs.designBeds();
    for (const b of beds) if (!this._bedBoxes.has(b.id)) this._bedBoxes.set(b.id, bboxOf(b.geometry));
    return {
      store: this.s, cs: this.cs, lib: this.lib, beds, bedBox: (id) => this._bedBoxes.get(id), blockers: this.s._blockerList(), unitBlockers: (id) => this.s.unitBlockers(id),
      spIndex: this.s.speciesIndexById, settings: state.settings,
    };
  }
  mix(id, state = this.state) { return state.mixes.find((m) => m.id === id) || null; }

  // ---------------------------------------------------------------- lifecycle
  fresh(base) {
    return { schema: 'generative-planting/design-document', version: '0.1', engine: ENGINE_VERSION, site: this.site.id, base: { from: base.from, scope: (base.scope || []).slice() },
      mixes: structuredClone(this.initialMixes).map((m) => ({ ...m, history: m.history || [{ version: m.version || 1, at: null, summary: 'initial palette' }] })),
      assignments: [], clears: [], settings: { scenarioWet: false, trunkM: 0.6 }, seq: 1, created: new Date().toISOString() };
  }
  // start a design: a working draft from the reference or with empty beds, and a document on top of it
  start({ from = 'blank', scope } = {}) {
    const r = this.s.createDraft({ from, scope }); if (!r.ok) return r;
    this.s.draft.designManaged = true;
    this.state = this.fresh({ from, scope: this.s.draft.scope });
    this.past = []; this.future = []; this.applied = { ids: new Set(), clears: [] }; this.cache.clear();
    this._persist(); this.emit({ type: 'start', state: this.state });
    return { ok: true, base: this.state.base, mixes: this.state.mixes.length };
  }
  // adopt the store's existing working draft (e.g. restored from the last visit) and the persisted document
  restore() {
    let saved = null; try { const raw = localStorage.getItem(KEY); if (raw) saved = JSON.parse(raw); } catch { /* none */ }
    const d = this.s.draft;
    if (saved && saved.site === this.site.id) {
      this.state = saved; if (!this.state.settings) this.state.settings = { scenarioWet: false, trunkM: 0.6 };
      for (const m of this.initialMixes) if (!this.state.mixes.some((x) => x.id === m.id)) this.state.mixes.push(structuredClone(m));
      const r = this.rebuild(); this.emit({ type: 'restore', state: this.state });
      return { ok: true, restored: true, assignments: this.state.assignments.length, ...r };
    }
    if (d) { this.state = this.fresh({ from: d.from, scope: d.scope }); d.designManaged = true; this.emit({ type: 'adopt', state: this.state }); return { ok: true, adopted: true }; }
    return { ok: false, error: 'no working design' };
  }
  active() { return !!(this.state && this.s.draft); }
  _persist() { try { if (this.state) localStorage.setItem(KEY, JSON.stringify(this.state)); else localStorage.removeItem(KEY); } catch { /* storage full or blocked: the document lives for this session */ } }
  discard() { this.state = null; this.past = []; this.future = []; this.applied = { ids: new Set(), clears: [] }; this._persist(); }

  // ---------------------------------------------------------------- generation (cached per assignment content)
  _key(a, state) {
    const m = a.mixId ? this.mix(a.mixId, state) : null;
    const usesKnowledge = !!(m && ((m.rules && m.rules.crown) || state.settings.scenarioWet));
    return fnv([hashStr(JSON.stringify({ t: a.type, b: a.bedIds, g: a.geometry, p: a.params, m: m ? { r: m.roles, ru: m.rules, d: m.drift } : null, s: state.settings, e: ENGINE_VERSION })), hashStr(usesKnowledge ? this.lib.revision : '')]);
  }
  generated(a, state = this.state) {
    if (a.snapshot) return a.snapshot;
    const k = this._key(a, state); let g = this.cache.get(k);
    if (!g) { const env = this.env(state); env.mix = a.mixId ? this.mix(a.mixId, state) : null; g = generate(a, env); g.key = k; g.mixVersion = env.mix ? env.mix.version : null; this.cache.set(k, g); if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value); }
    return g;
  }

  // ---------------------------------------------------------------- composition: precedence, keep rules, spacing at the seams
  compose(state = this.state) {
    const t0 = now();
    const A = state.assignments.slice().sort((a, b) => a.order - b.order);
    const rank = (a) => (a.frozen || a.type === 'keep' ? 1e6 : 0) + a.order;
    const gens = A.map((a) => this.generated(a, state));
    const out = [];
    const beds = this.cs.designBeds(); const bedGeom = new Map(beds.map((b) => [b.id, b.geometry]));
    // keep a plant of assignment i unless a higher-ranked space covers it, or a higher-ranked plant is too close
    const order = A.map((a, i) => i).sort((i, j) => rank(A[j]) - rank(A[i]));
    const grid = new Map(); const cell = 0.6; const gk = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    for (const i of order) {
      const a = A[i]; const g = gens[i]; const higher = A.filter((b, j) => j !== i && rank(b) > rank(a));
      const subs = higher.map((b) => gens[A.indexOf(b)].region).filter(Boolean).map((r) => ({ g: r, bb: bboxOf(r) }));
      const inSub = (x, y) => { for (const q of subs) if (x >= q.bb[0] && x <= q.bb[2] && y >= q.bb[1] && y <= q.bb[3] && pointInGeom(q.g, x, y)) return true; return false; };
      const P = g.plants; const keep = [];
      for (let k = 0; k < P.x.length; k++) {
        const x = P.x[k], y = P.y[k]; if (inSub(x, y)) continue;
        if (P.layer[k] !== 2) { // perennials: spacing against plants of higher-ranked spaces at the seam
          const gx = Math.floor(x / cell), gy = Math.floor(y / cell); let clash = false;
          for (let u = -2; u <= 2 && !clash; u++) for (let v = -2; v <= 2 && !clash; v++) for (const q of grid.get(`${gx + u},${gy + v}`) || []) if (q.r !== i && Math.hypot(q.x - x, q.y - y) < 0.6 * Math.min(q.s, P.size[k])) { clash = true; break; }
          if (clash) continue;
        }
        keep.push(k);
      }
      for (const k of keep) if (P.layer[k] !== 2) { const kk = gk(P.x[k], P.y[k]); let arr = grid.get(kk); if (!arr) grid.set(kk, (arr = [])); arr.push({ x: P.x[k], y: P.y[k], s: P.size[k], r: i }); }
      // effective space per bed (what this assignment really governs now)
      const subU = subs.length ? union(subs.map((q) => q.g)) : null;
      const partsEff = (g.parts || []).map((p) => { const eg = subU ? diff(p.geometry, subU) : p.geometry; return { bedId: p.bedId, geometry: eg, areaM2: area(eg) }; }).filter((p) => p.geometry && p.areaM2 > 0.01);
      const U = g.unplanted || { x: [], y: [], r: [] }; const un = { x: [], y: [], r: [] };
      for (let k = 0; k < U.x.length; k++) if (!inSub(U.x[k], U.y[k])) { un.x.push(U.x[k]); un.y.push(U.y[k]); un.r.push(U.r[k]); }
      out[i] = { a, gen: g, keep, parts: partsEff, unplanted: un, rank: rank(a) };
    }
    return { assignments: out.filter(Boolean), ms: now() - t0, beds: bedGeom };
  }

  // target placements for the store (one per assignment and bed)
  placements(comp) {
    const list = [];
    for (const c of comp.assignments) {
      const a = c.a; if (a.type === 'erase') continue;
      const g = c.gen; const P = g.plants; const mix = a.mixId ? this.mix(a.mixId) : null;
      const byBed = new Map(); for (const k of c.keep) { const b = P.bed[k]; let arr = byBed.get(b); if (!arr) byBed.set(b, (arr = [])); arr.push(k); }
      const roleIds = g.roleIds || (mix ? mix.roles.map((r) => r.id) : []);
      for (const [bedId, ks] of byBed) {
        const sp = [...new Set(ks.map((k) => P.sp[k]))]; const si = new Map(sp.map((s, n) => [s, n]));
        const plants = ks.map((k) => [P.x[k], P.y[k], si.get(P.sp[k]), P.size[k], typeof P.role[k] === 'string' ? roleIds.indexOf(P.role[k]) : P.role[k]]);
        const part = c.parts.find((p) => p.bedId === bedId);
        const h = fnv(plants.flatMap((q) => [Math.round(q[0] * 1000), Math.round(q[1] * 1000), q[2], Math.round(q[3] * 100)]).concat([hashStr(sp.join(','))]));
        list.push({ id: `${DESIGN_PREFIX}${a.id.replace(/^as\./, '')}.${bedId.replace(/^bed\./, '')}.${h}`, kind: 'plants', bedId, role: 'mix', mixId: a.mixId || null, mixVersion: g.mixVersion ?? (mix ? mix.version : null), assignmentId: a.id,
          color: mix ? mix.color : '#9C9A8C', speciesIds: sp, roles: roleIds, plants, geometry: part ? part.geometry : null, note: `${a.label || a.type} · ${mix ? mix.name + ' v' + (g.mixVersion ?? mix.version) : 'kept planting'}` });
      }
    }
    return list;
  }

  // ---------------------------------------------------------------- commit / undo / redo / preview
  // a clear lives with the paint (or erase) that made it: remove that space and the planting under it comes back
  effClears(state = this.state) { const ids = new Set(state.assignments.map((a) => a.id)); return state.clears.filter((c) => ids.has(c.assignmentId)); }
  _clearKey(c) { return c.assignmentId + '|' + area(c.geometry).toFixed(3); }
  _clearOpsFor(state) { return this.effClears(state).map((c) => ({ op: 'clearArea', geometry: c.geometry, note: c.note })); }
  // apply a new state: history, store patch (diff), persistence, events. Returns the composition and the store result.
  commit(next, { label = 'change', history = true } = {}) {
    const t0 = now();
    if (history && this.state) { this.past.push(JSON.stringify(this.state)); if (this.past.length > MAX_HISTORY) this.past.shift(); this.future = []; }
    const res = this._apply(next);
    this.last = { label, at: new Date().toISOString(), ms: Math.round(now() - t0), ...res.summary };
    this._persist(); this.emit({ type: 'commit', label, state: this.state, result: res });
    return res;
  }
  _apply(next) {
    const comp = this.compose(next); const target = this.placements(comp);
    const tIds = new Set(target.map((p) => p.id));
    const done = this.applied.clears; const want = this.effClears(next); const wantK = want.map((c) => this._clearKey(c)); let rebuilt = false, r;
    const prefix = done.length <= wantK.length && done.every((k, i) => wantK[i] === k);
    const needRebuild = !prefix || !this.s.draft || (this.s.draft.inst.n - this.s.liveCount > 90000);
    this.state = next;
    if (needRebuild) { r = this._rebuild(next, target); rebuilt = true; }
    else {
      const cur = new Set(this.s.draft.model.placements.filter((p) => p.id.startsWith(DESIGN_PREFIX)).map((p) => p.id));
      const ops = [];
      for (const c of want.slice(done.length)) ops.push({ op: 'clearArea', geometry: c.geometry, note: c.note });
      for (const id of cur) if (!tIds.has(id)) ops.push({ op: 'remove', target: id });
      for (const p of target) if (!cur.has(p.id)) ops.push({ op: 'add', collection: 'placements', value: p });
      r = ops.length ? this.s.applyPatch(ops) : { ok: true, applied: 0, changes: {} };
      if (!r.ok) { console.warn('design patch refused', r.errors); r = this._rebuild(next, target); rebuilt = true; }
    }
    if (r.ok) { this.applied = { ids: tIds, clears: wantK }; if (this.s.scenario !== 'working') this.s.setScenario('working'); }
    const summary = { ok: r.ok, rebuilt, placements: target.length, plants: target.reduce((a, p) => a + p.plants.length, 0), errors: r.ok ? null : r.errors };
    return { ok: r.ok, comp, target, store: r, summary };
  }
  _rebuild(next, target) {
    const legacy = this.s.draft ? this.s.draft.ops.filter((o) => !isDesignOp(o) && o.op !== 'clearArea') : [];
    const locks = this.s.draft ? [...this.s.draft.locks] : [];
    const c = this.s.createDraft({ from: next.base.from, scope: next.base.scope, activate: false }); if (!c.ok) return c;
    this.s.draft.designManaged = true; locks.forEach((l) => this.s.draft.locks.add(l));
    const ops = [...legacy, ...this._clearOpsFor(next), ...target.map((p) => ({ op: 'add', collection: 'placements', value: p }))];
    const r = ops.length ? this.s.applyPatch(ops) : { ok: true, applied: 0 };
    if (!ops.length) this.s.setScenario('working');
    return r;
  }
  rebuild() { const comp = this.compose(this.state); const target = this.placements(comp); const r = this._rebuild(this.state, target); if (r.ok) this.applied = { ids: new Set(target.map((p) => p.id)), clears: this.effClears(this.state).map((c) => this._clearKey(c)) }; this.emit({ type: 'rebuild', state: this.state }); return { ok: r.ok, plants: target.reduce((a, p) => a + p.plants.length, 0) }; }
  undo() { if (!this.past.length) return { ok: false, error: 'nothing to undo' }; this.future.push(JSON.stringify(this.state)); const prev = JSON.parse(this.past.pop()); const res = this._apply(prev); this.last = { label: 'undo', ...res.summary }; this._persist(); this.emit({ type: 'undo', state: this.state, result: res }); return { ok: res.ok, ...res.summary }; }
  redo() { if (!this.future.length) return { ok: false, error: 'nothing to redo' }; this.past.push(JSON.stringify(this.state)); const nx = JSON.parse(this.future.pop()); const res = this._apply(nx); this.last = { label: 'redo', ...res.summary }; this._persist(); this.emit({ type: 'redo', state: this.state, result: res }); return { ok: res.ok, ...res.summary }; }
  // composition of a candidate state without touching the store (Preview)
  preview(next) { const comp = this.compose(next); const target = this.placements(comp); return { comp, target, plants: target.reduce((a, p) => a + p.plants.length, 0) }; }

  // ---------------------------------------------------------------- building blocks for operations (pure: return a new state)
  clone() { return JSON.parse(JSON.stringify(this.state)); }
  _newAsg(st, a) {
    const id = 'as.' + (st.seq++); const order = st.assignments.reduce((m, x) => Math.max(m, x.order), 0) + 1;
    const rec = { id, order, frozen: false, snapshot: null, created: new Date().toISOString(), params: {}, ...a };
    rec.params = { seed: 0, densityScale: 1, ...(a.params || {}) };
    st.assignments.push(rec);
    // painting over the existing (reference / copied) planting really removes it there
    if (st.base.from === 'reference' || this._hasLegacy()) {
      const env = this.env(st); const reg = regionOf(rec, env).geometry;
      if (reg && rec.type !== 'keep') { const inBeds = clip(reg, union(env.beds.map((b) => b.geometry))); if (inBeds && area(inBeds) > 0.05 && this._legacyIn(inBeds)) st.clears.push({ assignmentId: id, geometry: inBeds, note: `cleared by ${rec.label || rec.type}` }); }
    }
    return rec;
  }
  _hasLegacy() { return !!(this.s.draft && this.s.draft.model.placements.some((p) => !p.id.startsWith(DESIGN_PREFIX))); }
  _legacyIn(g) { const bb = bboxOf(g); return this.s.draft.model.placements.some((p) => { if (p.id.startsWith(DESIGN_PREFIX)) return false; const pg = p.geometry || this.s.placementGeom(p); if (!pg) return false; const b = bboxOf(pg); return !(b[2] < bb[0] || b[0] > bb[2] || b[3] < bb[1] || b[1] > bb[3]); }); }

  // keep (freeze) the planting inside an area: a snapshot of what is there now, protected from later edits and mix changes
  snapshotIn(geometry, comp = this.compose(this.state)) {
    const bb = bboxOf(geometry); const P = { x: [], y: [], sp: [], role: [], size: [], bed: [], layer: [] }; const roleIds = []; const mixes = new Set();
    for (const c of comp.assignments) { const g = c.gen; for (const k of c.keep) { const x = g.plants.x[k], y = g.plants.y[k]; if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3] || !pointInGeom(geometry, x, y)) continue;
      const rid = (c.a.mixId || 'kept') + ':' + (this.mix(c.a.mixId)?.roles[g.plants.role[k]]?.id ?? g.plants.role[k]); let ri = roleIds.indexOf(rid); if (ri < 0) { roleIds.push(rid); ri = roleIds.length - 1; }
      P.x.push(x); P.y.push(y); P.sp.push(g.plants.sp[k]); P.role.push(ri); P.size.push(g.plants.size[k]); P.bed.push(g.plants.bed[k]); P.layer.push(g.plants.layer[k]); if (c.a.mixId) mixes.add(c.a.mixId); } }
    const env = this.env(); const parts = env.beds.map((b) => { const gg = clip(b.geometry, geometry); return gg && area(gg) > 0.01 ? { bedId: b.id, geometry: gg, areaM2: area(gg) } : null; }).filter(Boolean);
    return { plants: P, roleIds, region: geometry, parts, unplanted: { x: [], y: [], r: [] }, diag: { kept: P.x.length, fromMixes: [...mixes] }, mixVersion: null, at: new Date().toISOString() };
  }
  freezeSnapshot(a, comp = this.compose(this.state)) {
    const c = comp.assignments.find((q) => q.a.id === a.id); if (!c) return null; const g = c.gen;
    const pick = (arr) => c.keep.map((k) => arr[k]);
    const m = a.mixId ? this.mix(a.mixId) : null;
    return { plants: { x: pick(g.plants.x), y: pick(g.plants.y), sp: pick(g.plants.sp), role: pick(g.plants.role), size: pick(g.plants.size), bed: pick(g.plants.bed), layer: pick(g.plants.layer) }, roleIds: g.roleIds || (m ? m.roles.map((r) => r.id) : []), region: g.region, parts: g.parts, unplanted: c.unplanted, diag: g.diag, mixVersion: g.mixVersion, at: new Date().toISOString() };
  }
  // mix editing (shared: every non-frozen assignment that references the mix follows the new version)
  mixChange(st, mixId, change) {
    const m = st.mixes.find((x) => x.id === mixId); if (!m) throw new Error('no mix ' + mixId);
    const { mix, summary } = changeMix(m, change, (id) => this.s.getObject(id)?.canonicalKey || id);
    const v = validateMix(mix, this.s.speciesIndexById); if (!v.ok) throw new Error(v.errors.join('; '));
    st.mixes[st.mixes.indexOf(m)] = mix; return { mix, summary, warnings: v.warnings };
  }
  newMix(st, def = {}) {
    const name = String(def.name || 'New mix').slice(0, 60); let id = def.id || 'mix.' + slug(name); let k = 2; while (st.mixes.some((m) => m.id === id)) id = 'mix.' + slug(name) + '-' + k++;
    const m = { id, name, color: def.color || nextColor(st.mixes), system: def.system || 'custom', status: def.status || 'executable', version: 1,
      basis: def.basis || { summary: 'Created in the Design workspace.', recipe: null, sourceRefs: [], notes: ['Proportions, spacing and roles are design inputs.'] }, drift: def.drift || { angleDeg: 20 }, rules: def.rules || {},
      roles: (def.roles || [{ id: 'base', name: 'Base', layer: 'base', arrangement: 'matrix', share: 1, spacingM: 0.45, functionalRole: 'base', functionalBasis: 'assumption', species: [], rules: {} }]).map((r) => ({ rules: {}, functionalBasis: 'assumption', ...r, species: (r.species || []).map((x) => (typeof x === 'string' ? { id: x, weight: 1 } : x)) })),
      history: [{ version: 1, at: new Date().toISOString(), summary: def.from ? 'duplicated from ' + def.from : 'created' }] };
    const v = validateMix(m, this.s.speciesIndexById); if (!v.ok) throw new Error(v.errors.join('; '));
    st.mixes.push(m); return { mix: m, warnings: v.warnings };
  }
}
