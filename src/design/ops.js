// Design operations: the one interface through which the mouse tools AND any AI client change the design.
// An operation is plain JSON; `run(ops, { preview })` validates every op, builds the next design state with the same
// engine and returns the result (preview: nothing written). Natural language is NOT interpreted here: a language model,
// when one is connected, reads `context()` and proposes these operations; the engine computes, checks and executes.
import { regionOf } from './engine.js';
import { union, bboxOf, area, clip } from './geo.js';
import { validateGeometry, polysOf } from '../geom.js';

export const OPS = {
  fill: { args: 'beds: bed id[] | "main" | "all", mix, params?', does: 'paints whole planting beds with a mix (one assignment, may span several beds)' },
  paint: { args: 'geometry: Polygon, mix, params?', does: 'paints any area; it is clipped to the beds, paths stay unplanted' },
  line: { args: 'coordinates: [[x,y]…], widthM, mode: drifts | rows, mix, params?', does: 'a band along a curve: drifts in sequence, or rows (layout plant row)' },
  point: { args: 'at: [x,y], mix, roleId?, speciesId?, count?, spacingM?', does: 'a small group at a position (phyllotaxis), on top of what is there' },
  erase: { args: 'geometry | beds', does: 'empties an area (design plants and the existing planting there)' },
  keep: { args: 'geometry | beds', does: 'freezes the planting inside an area: later edits and mix changes do not touch it' },
  freeze: { args: 'assignment, on', does: 'freezes / unfreezes one assignment' },
  remove: { args: 'assignment', does: 'deletes an assignment' },
  setAssignment: { args: 'assignment, mix?, params?', does: 'changes the mix or the local parameters (densityScale, seed, widthM, mode, count…)' },
  createMix: { args: 'name, system?, color?, roles?, from?', does: 'creates a mix, or duplicates `from`' },
  editMix: { args: 'mix, changes: [{op: setShare | setSpacing | addSpecies | removeSpecies | replaceSpecies | setWeight | addRole | removeRole | setRule | setRoleParam | rename | setColor, …}]', does: 'edits a shared mix: every non-frozen assignment using it follows' },
  setScenario: { args: 'wet: boolean', does: 'switches the HYPOTHETICAL "lower ground is wetter" scenario (not site data)' },
  addKnowledge: { args: 'speciesId, kind: exposure | bloom | hydrology | note, value, place?, note?', does: 'adds personal knowledge (shared with the Knowledge workspace); async, not previewable' },
  applyRecordHere: { args: 'recordId, why?', does: 'applies one knowledge record to the project place (a personal scope decision)' },
  setKnowledgePolicy: { args: 'accept: [same, within, broader, elsewhere, unknown]', does: 'which record places design rules may use' },
};
const PARAM_KEYS = new Set(['densityScale', 'seed', 'widthM', 'lineMode', 'count', 'spacingM', 'roleId', 'speciesId']);

export class DesignOps {
  constructor(doc) { this.doc = doc; this.log = []; }
  get st() { return this.doc.state; }

  _beds(v, env) {
    const all = env.beds.map((b) => b.id);
    if (v === 'all') return all;
    if (v === 'main') return env.beds.filter((b) => 'ABC'.includes(b.props.style)).map((b) => b.id);
    const L = [].concat(v || []).map((b) => (b.startsWith('bed.') ? b : 'bed.' + b));
    const bad = L.filter((b) => !all.includes(b)); if (bad.length) throw new Error('not a bed open to design: ' + bad.join(', '));
    if (!L.length) throw new Error('no beds');
    return L;
  }
  _geom(g, kind = 'polygon') {
    const v = validateGeometry(g); if (!v.ok) throw new Error('geometry: ' + v.error);
    if (kind === 'polygon' && !polysOf(g).length) throw new Error('geometry must be a Polygon or MultiPolygon');
    return g;
  }
  _mix(st, id) { const m = st.mixes.find((x) => x.id === id); if (!m) throw new Error('unknown mix ' + id); return m; }
  _asg(st, id) { const a = st.assignments.find((x) => x.id === id); if (!a) throw new Error('unknown assignment ' + id); return a; }
  _params(p) { const o = {}; for (const [k, v] of Object.entries(p || {})) { if (!PARAM_KEYS.has(k)) throw new Error('parameter not allowed: ' + k); o[k] = v; } return o; }

  // apply one op to a state copy; returns a one-line description
  _one(st, op, ctx) {
    const doc = this.doc; const env = doc.env(st);
    switch (op && op.op) {
      case 'fill': { const m = this._mix(st, op.mix); const beds = this._beds(op.beds, env); const a = doc._newAsg(st, { type: 'fill', bedIds: beds, mixId: m.id, params: this._params(op.params), label: `${m.name} · ${beds.length === 1 ? beds[0].replace('bed.', '') : beds.length + ' beds'}` }); ctx.created.push(a.id); return `fill ${beds.map((b) => b.replace('bed.', '')).join(', ')} with ${m.name}`; }
      case 'paint': { const m = this._mix(st, op.mix); const g = this._geom(op.geometry); if (!(area(g) > 0.2)) throw new Error('area too small (< 0.2 m²)'); const a = doc._newAsg(st, { type: 'area', geometry: g, mixId: m.id, params: this._params(op.params), label: `${m.name} · painted area` }); ctx.created.push(a.id); return `paint ${area(g).toFixed(0)} m² with ${m.name}`; }
      case 'line': { const m = this._mix(st, op.mix); const c = op.coordinates; if (!Array.isArray(c) || c.length < 2) throw new Error('line needs ≥ 2 points'); this._geom({ type: 'LineString', coordinates: c }, 'line'); const w = Math.max(0.4, Math.min(12, +op.widthM || 2)); const a = doc._newAsg(st, { type: 'line', geometry: { type: 'LineString', coordinates: c }, mixId: m.id, params: { ...this._params(op.params), widthM: w, lineMode: op.mode === 'rows' ? 'rows' : 'drifts' }, label: `${m.name} · curve ${op.mode === 'rows' ? 'rows' : 'drifts'}` }); ctx.created.push(a.id); return `curve band ${w} m (${op.mode === 'rows' ? 'rows' : 'drifts'}) with ${m.name}`; }
      case 'point': { const m = this._mix(st, op.mix); const at = op.at; if (!Array.isArray(at) || at.length !== 2 || !at.every(Number.isFinite)) throw new Error('at: [x, y]'); const prm = this._params({ count: op.count ?? 5, ...(op.roleId ? { roleId: op.roleId } : {}), ...(op.speciesId ? { speciesId: op.speciesId } : {}), ...(op.spacingM ? { spacingM: op.spacingM } : {}) });
        if (prm.roleId && !m.roles.some((r) => r.id === prm.roleId)) throw new Error('mix has no role ' + prm.roleId);
        if (prm.speciesId && !doc.s.speciesIndexById.has(prm.speciesId)) throw new Error('unknown species ' + prm.speciesId);
        const r = m.roles.find((q) => q.id === prm.roleId) || m.roles.find((q) => q.layer === 'overlay') || m.roles[0]; if (!prm.spacingM) prm.spacingM = r.spacingM;
        const a = doc._newAsg(st, { type: 'point', geometry: { type: 'Point', coordinates: at }, mixId: m.id, params: prm, label: `${m.name} · ${prm.count} at a point` }); ctx.created.push(a.id); return `point group of ${prm.count} (${m.name})`; }
      case 'erase': { const g = op.beds ? union(this._beds(op.beds, env).map((b) => env.beds.find((q) => q.id === b).geometry)) : this._geom(op.geometry); const a = doc._newAsg(st, { type: 'erase', geometry: g, mixId: null, label: `erase ${area(g).toFixed(0)} m²` }); ctx.created.push(a.id); return `erase ${area(g).toFixed(0)} m²`; }
      case 'keep': { const g = op.beds ? union(this._beds(op.beds, env).map((b) => env.beds.find((q) => q.id === b).geometry)) : this._geom(op.geometry); const snap = doc.snapshotIn(g, doc.compose(st)); const a = doc._newAsg(st, { type: 'keep', geometry: g, mixId: null, frozen: true, snapshot: snap, label: `kept ${snap.plants.x.length} plants` }); ctx.created.push(a.id); return `keep ${snap.plants.x.length} plants in ${area(g).toFixed(0)} m²`; }
      case 'freeze': { const a = this._asg(st, op.assignment); if (a.type === 'keep' || a.type === 'erase') throw new Error('keep / erase spaces cannot be frozen'); const on = op.on !== false;
        if (on && !a.frozen) { a.snapshot = doc.freezeSnapshot(a, doc.compose(st)); a.frozen = true; } else if (!on && a.frozen) { a.frozen = false; a.snapshot = null; }
        return `${on ? 'freeze' : 'unfreeze'} ${a.label || a.id}`; }
      case 'remove': { const a = this._asg(st, op.assignment); st.assignments.splice(st.assignments.indexOf(a), 1); return `remove ${a.label || a.id}`; }
      case 'setAssignment': { const a = this._asg(st, op.assignment); if (a.frozen) throw new Error(`${a.id} is frozen: unfreeze it first`); if (op.mix) { const m = this._mix(st, op.mix); a.mixId = m.id; a.label = (a.label || '').replace(/^[^·]*·/, m.name + ' ·'); }
        if (op.params) a.params = { ...a.params, ...this._params(op.params) };
        const P = op.params || {}; const words = [op.mix ? 'now ' + this._mix(st, op.mix).name : null, P.seed != null ? 'another variation' : null, P.densityScale != null ? `density ×${(+P.densityScale).toFixed(1)}` : null, P.widthM != null ? `width ${P.widthM} m` : null, P.lineMode ? P.lineMode : null, P.count != null ? `${P.count} plants` : null].filter(Boolean);
        return `${a.label || a.id}: ${words.join(', ') || 'changed'}`; }
      case 'createMix': { let def = op; if (op.from) { const src = this._mix(st, op.from); def = { ...structuredClone(src), id: undefined, name: op.name || src.name + ' copy', color: op.color, from: src.id, history: undefined, status: src.status }; } const { mix } = doc.newMix(st, def); ctx.mixes.push(mix.id); return `create mix ${mix.name} (${mix.id})`; }
      case 'editMix': { const m = this._mix(st, op.mix); const out = []; for (const ch of [].concat(op.changes || [])) { const r = doc.mixChange(st, m.id, ch); out.push(r.summary); ctx.warnings.push(...r.warnings); } return `edit ${m.name}: ${out.join('; ')}`; }
      case 'setScenario': { st.settings.scenarioWet = !!op.wet; if (op.wet && !doc.cs.field('hyp.low-ground-wetter')) throw new Error('hypothetical wetness field not available'); return `hypothetical wetness scenario ${op.wet ? 'on' : 'off'}`; }
      default: throw new Error('unknown op ' + (op && op.op) + ' (known: ' + Object.keys(OPS).join(', ') + ')');
    }
  }

  // validate + build the next state; preview = compute only
  run(ops, { preview = false, label } = {}) {
    if (!this.doc.active()) return { ok: false, errors: [{ index: -1, message: 'no working design: start one first' }] };
    if (!Array.isArray(ops) || !ops.length) return { ok: false, errors: [{ index: -1, message: 'ops must be a non-empty array' }] };
    const asyncOps = ops.filter((o) => ['addKnowledge', 'applyRecordHere', 'setKnowledgePolicy'].includes(o && o.op));
    if (asyncOps.length) return { ok: false, errors: [{ index: ops.indexOf(asyncOps[0]), message: 'knowledge operations change the knowledge base: use runAsync' }] };
    const st = this.doc.clone(); const ctx = { created: [], mixes: [], warnings: [] }; const said = []; const errors = [];
    ops.forEach((op, i) => { try { said.push(this._one(st, op, ctx)); } catch (e) { errors.push({ index: i, op: op && op.op, message: String(e.message || e) }); } });
    if (errors.length) return { ok: false, errors };
    const before = this.doc.preview(this.doc.state);
    if (preview) { const p = this.doc.preview(st); return { ok: true, preview: true, said, created: ctx.created, warnings: ctx.warnings, plantsBefore: before.plants, plantsAfter: p.plants, target: p.target, comp: p.comp, state: st }; }
    const res = this.doc.commit(st, { label: label || said.join(' · ') });
    this.log.push({ at: new Date().toISOString(), ops: JSON.parse(JSON.stringify(ops)), said, ok: res.ok });
    return { ok: res.ok, said, created: ctx.created, mixes: ctx.mixes, warnings: ctx.warnings, plantsBefore: before.plants, plantsAfter: res.summary.plants, placements: res.summary.placements, rebuilt: res.summary.rebuilt, errors: res.summary.errors };
  }
  // knowledge ops write the shared knowledge layer, then the design regenerates what depends on it
  async runAsync(ops) {
    const lib = this.doc.lib; const said = []; const errors = []; const out = [];
    for (const [i, op] of ops.entries()) {
      try {
        if (op.op === 'addKnowledge') { const r = await lib.addRecord({ spId: op.speciesId, kind: op.kind, value: op.value, place: op.place === undefined ? lib.place : op.place, note: op.note || '' }); if (!r.ok) throw new Error(r.error); out.push(r); said.push(`knowledge: ${op.kind} of ${op.speciesId}`); }
        else if (op.op === 'applyRecordHere') { const r = await lib.applyHere(op.recordId, op.why || ''); if (!r.ok) throw new Error(r.error); out.push(r); said.push('apply ' + op.recordId + ' here'); }
        else if (op.op === 'setKnowledgePolicy') { out.push({ accept: lib.setAccept(op.accept || []) }); said.push('knowledge policy: ' + (op.accept || []).join(', ')); }
        else { const r = this.run([op]); if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; ')); out.push(r); said.push(...r.said); }
      } catch (e) { errors.push({ index: i, op: op && op.op, message: String(e.message || e) }); break; }
    }
    // re-generate what reads knowledge (cache keys include the knowledge revision)
    const res = this.doc.active() ? this.doc.commit(this.doc.clone(), { label: 'knowledge changed: ' + said.join(' · '), history: false }) : null;
    return { ok: !errors.length, said, results: out, errors, plantsAfter: res ? res.summary.plants : null };
  }

  // what an AI client reads before proposing operations (plain data; unknowns stay null / "unknown")
  context({ selection = null } = {}) {
    const doc = this.doc; const st = this.st; if (!st) return { ok: false, error: 'no working design' };
    const env = doc.env(); const comp = doc.compose(); const lib = doc.lib;
    const asg = comp.assignments.map((c) => ({ id: c.a.id, type: c.a.type, label: c.a.label, mix: c.a.mixId, frozen: !!c.a.frozen, beds: c.parts.map((p) => p.bedId), areaM2: +c.parts.reduce((s, p) => s + p.areaM2, 0).toFixed(1), plants: c.keep.length, params: c.a.params, unplanted: c.gen.diag ? c.gen.diag.unplanted : null }));
    const species = new Set(st.mixes.flatMap((m) => m.roles.flatMap((r) => r.species.map((s) => s.id))));
    const knowledge = [...species].map((id) => { const p = lib.profile(id); return p && { id, name: p.canonicalKey, hydrology: p.hydrology.range, exposure: p.exposure.status === 'known' ? p.exposure.labels : p.exposure.status, bloomMonths: p.bloom.status === 'known' ? p.bloom.months : p.bloom.status, mapStatus: p.mapStatus }; }).filter(Boolean);
    return {
      ok: true, site: doc.site.id, place: lib.place, operations: OPS,
      design: { base: st.base, settings: st.settings, assignments: asg, mixes: st.mixes.map((m) => ({ id: m.id, name: m.name, version: m.version, system: m.system, status: m.status, rules: m.rules || {}, roles: m.roles.map((r) => ({ id: r.id, name: r.name, layer: r.layer, arrangement: r.arrangement, share: r.share, density: r.density, coverage: r.coverage, spacingM: r.spacingM, species: r.species, functionalRole: r.functionalRole, functionalBasis: r.functionalBasis })) })) },
      beds: env.beds.map((b) => ({ id: b.id, style: b.props.style, areaM2: +area(b.geometry).toFixed(1), bbox: bboxOf(b.geometry).map((v) => +v.toFixed(1)) })),
      fields: doc.cs.fields().map((f) => ({ id: f.id, status: f.status, hypothetical: !!f.hypothetical, units: f.units })),
      conditionsByBed: Object.fromEntries(env.beds.filter((b) => 'ABCT'.includes(b.props.style[0])).map((b) => { const d = doc.cs.distribution(b.id, { fields: ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.canopy'] }); return [b.id, d.ok ? Object.fromEntries(Object.entries(d.fields).map(([k, v]) => [k, v.areaKnownM2 ? { min: v.min, p50: v.p50, max: v.max } : 'unknown'])) : null]; })),
      selection, knowledge, knowledgeStatus: lib.status, knowledgePolicy: [...lib.policy.accept],
      note: 'Coordinates are local metres (x east, y north). Sun, soil moisture and pH are unknown on this site. Propose operations from `operations`; the engine computes positions and checks every plant.',
    };
  }
}
