// Live Generative Brush (V3). ONE evaluation for hover, drag and commit:
//   evaluate(capsule) = cells of the confirmed scope under the capsule (paths, water, structures, unselected beds and frozen
//   cells are in no editable cell → blocked) → the target layers' existing plants inside the capsule are staged for
//   REPLACEMENT → world-anchored lattice candidates of the mix inside the capsule → validate() (fill.js: bed edge, trunks,
//   spacing against every plant that stays, including plants of neighbouring cells; light: assumption > crown proxy >
//   unknown; a known conflict is swapped for a layer-mate or skipped unless the brush overrides).
// Hover runs evaluate() on a throw-away stage and draws it on the overlay canvas (nothing is written). Press + move runs it
// on the stroke's stage for every densified segment, so plants appear while the pointer moves; pointer-up commits the
// stage as ONE validated patch (Project.applyStroke) = one undo step. What the hover shows is exactly what the stroke
// would do at that spot. Esc / pointercancel discards the stage.
// Soft edge (optional): inside the outer band of the footprint a plant of the old community is replaced, and a new
// candidate accepted, with a probability that falls from 1 to 0 towards the rim (deterministic per id) — a mixed
// transition instead of a hard seam. Other layers are never touched. Timing of every move is kept in F.brushLog.
import { candidates, validate, makeEnv, PlantIndex, lightFit } from './fill.js';
import { bbox, inside, hash } from './spatial.js';
import { bufferLine, disk, union, safeUnion } from '../design/geo.js';

export const BRUSH = { defaultRadiusM: 1.5, minR: 0.4, maxR: 6, stepK: 0.5, softBand: 0.45, reachM: 1.2 };
const segDist2 = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay; const L2 = vx * vx + vy * vy; let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = ax + t * vx - px, ey = ay + t * vy - py; return ex * ex + ey * ey; };
const u01 = (...p) => hash(...p) / 4294967296;
const posKey = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

export class Brush {
  constructor(F) { this.F = F; this.stroke = null; this.ghost = null; this.active = null; F.brushLog = []; }
  get P() { return this.F.P; }
  // active = { mixId | null (eraser), slots: ['base','overlay','ephemeral'] subset, r, edge: 'hard'|'soft', override }
  start(opts) { this.active = { r: BRUSH.defaultRadiusM, edge: 'hard', override: false, ...this.active, ...opts }; this.ghost = null; this.stroke = null; }
  stop() { this.cancel(); this.active = null; this.ghost = null; }
  setRadius(r) { if (this.active) this.active.r = Math.max(BRUSH.minR, Math.min(BRUSH.maxR, r)); }
  editable(c) { const P = this.P; return !P.state.locks[c.id] && (!P.state.brief.scopeBeds.length || P.state.brief.scopeBeds.includes(c.bedId)); }
  cellsNear(b) { const out = []; for (const c of this.P.allCells()) { const q = c._bb || (c._bb = bbox(c.geometry)); if (q[2] < b[0] || q[0] > b[2] || q[3] < b[1] || q[1] > b[3]) continue; out.push(c); } return out; }
  mixNow() { return this.active && this.active.mixId ? this.P.mix(this.active.mixId) : null; }
  slotsFor(mix) { const s = this.active.slots; if (!mix) return s && s.length ? s : ['base', 'overlay', 'ephemeral']; const has = [...new Set(mix.layers.map((L) => L.slot))]; return s && s.length ? s.filter((x) => has.includes(x)) : has; }

  // ---------------------------------------------------------------- the stage: plants that stay + what the gesture changes
  _newStage(mix, opts) {
    return { mixId: mix ? mix.id : null, version: mix ? mix.version : null, slots: this.slotsFor(mix), r: opts.r, edge: opts.edge || 'hard', override: !!opts.override,
      env: makeEnv(this.P), index: new PlantIndex(), loaded: new Set(), ids: new Set(), cells: new Map(), removedPos: new Set(),
      added: 0, removed: 0, kept: 0, rej: { edge: 0, trunk: 0, clearance: 0, light: 0 }, fit: { match: 0, conflict: 0, unknown: 0, substituted: 0 }, blocked: 0, samples: 0 };
  }
  // load the plants of every cell near a box into the shared index once (spacing across cell edges)
  _load(S, b) {
    const m = BRUSH.reachM; const st = this.P.state;
    for (const c of this.cellsNear([b[0] - m, b[1] - m, b[2] + m, b[3] + m])) { if (S.loaded.has(c.id)) continue; S.loaded.add(c.id); const i = st.instances[c.id]; if (i) for (const p of i.plants) { S.index.add(p); S.ids.add(p.id); } }
  }
  _cellStage(S, cell) {
    let cs = S.cells.get(cell.id); if (cs) return cs;
    const inst = this.P.state.instances[cell.id]; const keep = new Map(); for (const p of inst ? inst.plants : []) keep.set(p.id, p);
    cs = { cell, keep, add: new Map(), remove: new Set(), rej: { edge: 0, trunk: 0, clearance: 0, light: 0 } }; S.cells.set(cell.id, cs); return cs;
  }
  // evaluate one capsule a → b on a stage (hover: a === b on a fresh stage). Returns the touched world box.
  _segment(S, a, b, { rejectedOut = null } = {}) {
    const r = S.r; const r2 = r * r; const mix = S.mixId ? this.P.mix(S.mixId) : null;
    const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r];
    const d2 = (x, y) => segDist2(x, y, a[0], a[1], b[0], b[1]);
    const soft = S.edge === 'soft'; const core = r * (1 - BRUSH.softBand);
    const weight = (x, y) => { const d = Math.sqrt(d2(x, y)); return d <= core ? 1 : Math.max(0, (r - d) / (r - core)); };
    const cells = this.cellsNear(bb).filter((c) => this.editable(c)); if (!cells.length) return bb;
    this._load(S, bb);
    const cands = mix ? candidates(mix, bb, { layers: S.slots }).filter((q) => d2(q.x, q.y) <= r2 && (!soft || u01(q.key, 'soft', S.mixId) < weight(q.x, q.y))) : [];
    for (const cell of cells) {
      const cs = this._cellStage(S, cell);
      for (const p of cs.keep.values()) {
        if (d2(p.x, p.y) > r2) continue;
        if (!S.slots.includes(p.slot)) { cs.keptIds ||= new Set(); if (!cs.keptIds.has(p.id)) { cs.keptIds.add(p.id); S.kept++; } continue; } // other layers stay
        if (soft && u01(p.id, 'soft-out') >= weight(p.x, p.y)) continue; // soft edge: part of the old community stays
        cs.keep.delete(p.id); S.index.remove(p); S.ids.delete(p.id); cs.remove.add(p.id); S.removedPos.add(posKey(p)); S.removed++;
      }
      if (!mix) continue;
      const cb = cell._bb; const mine = cands.filter((q) => q.x >= cb[0] && q.x <= cb[2] && q.y >= cb[1] && q.y <= cb[3]); if (!mine.length) continue;
      const v = validate(mine, { cell, mix, env: S.env, index: S.index, existingKeys: S.ids, override: S.override, rejectedOut });
      for (const p of v.plants) {
        S.ids.add(p.id); cs.add.set(p.id, p);
        if (cs.remove.has(p.id)) { cs.remove.delete(p.id); S.removedPos.delete(posKey(p)); S.removed--; } else S.added++;
        if (p.fit) S.fit[p.fit]++; if (p.sub) S.fit.substituted++;
      }
      for (const k of Object.keys(v.rejected)) { cs.rej[k] = (cs.rej[k] || 0) + v.rejected[k]; S.rej[k] = (S.rej[k] || 0) + v.rejected[k]; }
    }
    return bb;
  }

  // ---------------------------------------------------------------- hover: the same evaluation, never written
  hover(x, y) {
    if (!this.active || this.stroke) return; if (x == null) { this.ghost = null; return; }
    const mix = this.mixNow(); const S = this._newStage(mix, this.active); const rejected = [];
    this._segment(S, [x, y], [x, y], { rejectedOut: rejected });
    const adds = []; const removes = []; for (const cs of S.cells.values()) { for (const p of cs.add.values()) adds.push(p); for (const id of cs.remove) { const p = (this.P.state.instances[cs.cell.id] || { plants: [] }).plants.find((q) => q.id === id); if (p) removes.push(p); } }
    const touched = [...S.cells.values()].filter((cs) => inside(cs.cell.geometry, x, y) || cs.add.size || cs.remove.size).map((cs) => cs.cell);
    this.ghost = { x, y, r: S.r, adds, removes, rejected, cells: [...S.cells.keys()], touched: touched.map((c) => c.id), beds: [...new Set(touched.map((c) => c.bedId))], stage: S, here: this.whatIsHere(x, y) };
  }
  // what is under one point: an editable cell, or why not (path, frozen, outside the scope, not plantable)
  whatIsHere(x, y) {
    const P = this.P; const F = this.F; const cell = F.cellAt(x, y);
    const env = makeEnv(P);
    if (cell) {
      if (P.state.locks[cell.id]) return { blocked: 'frozen', cell };
      if (!this.editable(cell)) return { blocked: 'outside the design scope', cell };
      const light = env.lightAt(x, y, cell.bedId); const mix = this.mixNow();
      return { cell, light, compat: mix ? mixFitAt(F.K, mix, light, this.slotsFor(mix)) : null };
    }
    const path = P.pathGeoms().find((p) => inside(p.g, x, y)); if (path) return { blocked: 'path', name: path.name };
    const bed = P.eligibleBeds().find((b) => { const o = F.store.getObject(b.id); if (!o) return false; const g = o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry; return inside(g, x, y); });
    if (bed) return { blocked: P.state.beds[bed.id] ? 'not plantable (structure, trunk or sliver)' : 'outside the design scope', bed };
    return { blocked: 'outside the beds' };
  }

  // ---------------------------------------------------------------- stroke
  down(x, y) {
    if (!this.active || x == null) return null;
    const mix = this.mixNow(); if (this.active.mixId && !mix) return null;
    const S = this._newStage(mix, this.active); Object.assign(S, { samples: [[x, y]], t0: performance.now(), moves: 0, timeline: [] });
    this.stroke = S; this.ghost = null; return this._segment(S, [x, y], [x, y]);
  }
  // returns the world box that changed (for a region redraw), or null
  move(x, y) {
    const s = this.stroke; if (!s || x == null) return null;
    const last = s.samples[s.samples.length - 1]; const d = Math.hypot(x - last[0], y - last[1]); const step = s.r * BRUSH.stepK; if (d < step * 0.35) return null;
    const t = performance.now(); const n = Math.max(1, Math.ceil(d / step)); let prev = last; let box = null;
    for (let k = 1; k <= n; k++) { const p = [last[0] + ((x - last[0]) * k) / n, last[1] + ((y - last[1]) * k) / n]; const b = this._segment(s, prev, p); box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; s.samples.push(p); prev = p; }
    s.moves++; const dt = performance.now() - t; const rec = { t: Math.round(t - s.t0), dt: +dt.toFixed(1), segments: n, added: s.added, removed: s.removed, cells: s.cells.size };
    s.timeline.push(rec); this.F.brushLog.push(rec); if (this.F.brushLog.length > 2000) this.F.brushLog.shift();
    return box;
  }
  stagedPlants() { const out = []; if (!this.stroke) return out; for (const cs of this.stroke.cells.values()) for (const p of cs.add.values()) out.push(p); return out; }
  removedKeys() { return this.stroke ? this.stroke.removedPos : new Set(); }
  cancel() { const had = !!this.stroke; this.stroke = null; return had; }
  // pointer-up: one atomic, validated patch
  up() {
    const s = this.stroke; if (!s) return null; this.stroke = null;
    const touched = [...s.cells.values()].filter((cs) => cs.add.size || cs.remove.size);
    const summary = { added: s.added, removed: s.removed, kept: s.kept, fit: s.fit, rejected: s.rej, cells: touched.length, beds: new Set(touched.map((cs) => cs.cell.bedId)).size, bedIds: [...new Set(touched.map((cs) => cs.cell.bedId))] };
    if (!touched.length) return { ok: false, empty: true, ...summary };
    const pts = simplify(s.samples, 0.08); let footprint;
    try { footprint = pts.length > 1 ? bufferLine(pts, 2 * s.r) : union([disk(pts[0][0], pts[0][1], s.r, 28)]); } catch { footprint = safeUnion(pts.map((p) => disk(p[0], p[1], s.r, 20))); } // the plants are validated already; the footprint only records the area
    const cells = {}; const stats = {}; for (const cs of touched) { cells[cs.cell.id] = { add: [...cs.add.values()], remove: [...cs.remove] }; stats[cs.cell.id] = cs.rej; }
    const res = this.P.applyStroke({ mixId: s.mixId, slots: s.slots, footprint, cells, stats, edge: s.edge });
    this.last = { ok: res.ok !== false, ms: Math.round(performance.now() - s.t0), moves: s.moves, samples: s.samples.length, ...summary, timeline: s.timeline, maxMoveMs: Math.max(0, ...s.timeline.map((q) => q.dt)), meanMoveMs: s.timeline.length ? +(s.timeline.reduce((a, q) => a + q.dt, 0) / s.timeline.length).toFixed(1) : 0 };
    return { ...res, ...this.last };
  }
}

// how the members of a mix's target layers fit one light value: share-weighted match / conflict / unknown → category
export function mixFitAt(K, mix, light, slots = null) {
  const v = light && light.value; let m = 0, c = 0, u = 0; const why = [];
  for (const L of mix.layers) {
    if (slots && !slots.includes(L.slot)) continue; const key = L.basis === 'area' ? 'share' : 'proportion';
    for (const q of L.members) { const w = q[key] || 0; const t = K.traits(q.plantId); const f = lightFit(t, v); if (f === 'match') m += w; else if (f === 'conflict') { c += w; if (why.length < 3) why.push({ plantId: q.plantId, name: t.name, light: t.light.value, source: t.light.source }); } else u += w; }
  }
  // fits = no member known to conflict (the share still unknown is reported, and drawn); conflict = no member known to
  // fit; partial = both; unknown = no site light, or no member with a light record
  const tot = m + c + u || 1; const known = (m + c) / tot;
  const cat = !v || m + c === 0 ? 'unknown' : c === 0 ? 'match' : m === 0 ? 'conflict' : 'partial';
  return { cat, known: +known.toFixed(2), match: +(m / tot).toFixed(2), conflict: +(c / tot).toFixed(2), unknown: +(u / tot).toFixed(2), why, light };
}
function simplify(pts, tol) { // Douglas–Peucker, keeps ends
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true; const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let md = 0, mk = -1; for (let k = i + 1; k < j; k++) { const d = segDist2(pts[k][0], pts[k][1], pts[i][0], pts[i][1], pts[j][0], pts[j][1]); if (d > md) { md = d; mk = k; } } if (mk >= 0 && md > tol * tol) { keep[mk] = true; st.push([i, mk], [mk, j]); } }
  return pts.filter((_, k) => keep[k]);
}
