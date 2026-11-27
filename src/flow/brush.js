// Live Generative Brush. Hover = ghost preview only (never written). Press + move = plants appear WHILE the pointer moves:
// every pointer move is densified into short segments (step ≤ radius / 2, so a fast drag never skips ground); each
// segment's capsule (radius in metres, independent of zoom) reveals the world-anchored lattice candidates of the active
// mix inside it, which are validated against the plants that stay (fill.js) in every cell the capsule touches — across
// beds; paths, water and structures are not in any cell, so they never receive a plant; frozen cells are skipped.
// Existing plants of the target layers under the capsule are staged for removal (replace semantics, inside the footprint
// only). Nothing is committed until pointer-up: then ONE atomic, validated patch (Project.applyStroke) = one undo step.
// Esc / pointercancel discards the staged stroke. Timing of every move is recorded in F.brushLog (real latency).
import { candidates, validate, makeEnv, PlantIndex } from './fill.js';
import { bbox, inside } from './spatial.js';
import { bufferLine, disk, union } from '../design/geo.js';

export const BRUSH = { defaultRadiusM: 1.5, minR: 0.4, maxR: 6, stepK: 0.5 };
const segDist2 = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay; const L2 = vx * vx + vy * vy; let t = L2 ? ((px - ax) * vx + (py - ay) * vy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = ax + t * vx - px, ey = ay + t * vy - py; return ex * ex + ey * ey; };

export class Brush {
  constructor(F) { this.F = F; this.stroke = null; this.ghost = null; this.active = null; F.brushLog = []; }
  get P() { return this.F.P; }
  // active = { mixId | null (eraser), slots: ['base','overlay','ephemeral'] subset, r }
  start(opts) { this.active = { r: BRUSH.defaultRadiusM, ...this.active, ...opts }; this.ghost = null; this.stroke = null; }
  stop() { this.cancel(); this.active = null; this.ghost = null; }
  setRadius(r) { if (this.active) this.active.r = Math.max(BRUSH.minR, Math.min(BRUSH.maxR, r)); }
  cellsNear(b) { const out = []; for (const c of this.P.allCells()) { const q = c._bb || (c._bb = bbox(c.geometry)); if (q[2] < b[0] || q[0] > b[2] || q[3] < b[1] || q[1] > b[3]) continue; out.push(c); } return out; }
  mixNow() { return this.active && this.active.mixId ? this.P.mix(this.active.mixId) : null; }
  slotsFor(mix) { const s = this.active.slots; if (!mix) return s && s.length ? s : ['base', 'overlay', 'ephemeral']; const has = [...new Set(mix.layers.map((L) => L.slot))]; return s && s.length ? s.filter((x) => has.includes(x)) : has; }

  // ---------------------------------------------------------------- hover ghost (view only)
  hover(x, y) {
    if (!this.active || this.stroke) return; if (x == null) { this.ghost = null; return; }
    const r = this.active.r; const mix = this.mixNow(); const b = [x - r, y - r, x + r, y + r];
    const pts = []; const cells = this.cellsNear(b).filter((c) => !this.P.state.locks[c.id]);
    if (mix && cells.length) { const layers = this.slotsFor(mix); for (const q of candidates(mix, b, { layers })) { if ((q.x - x) ** 2 + (q.y - y) ** 2 > r * r) continue; if (!cells.some((c) => inside(c.geometry, q.x, q.y))) continue; pts.push(q); } }
    this.ghost = { x, y, r, pts, cells: cells.map((c) => c.id) };
  }
  // ---------------------------------------------------------------- stroke
  down(x, y) {
    if (!this.active || x == null) return;
    const mix = this.mixNow(); if (this.active.mixId && !mix) return;
    this.stroke = { mixId: this.active.mixId, version: mix ? mix.version : null, slots: this.slotsFor(mix), r: this.active.r, samples: [[x, y]], cells: new Map(), t0: performance.now(), moves: 0, added: 0, removed: 0, timeline: [], env: makeEnv(this.P) };
    this.ghost = null; this._segment([x, y], [x, y]);
  }
  move(x, y) {
    const s = this.stroke; if (!s || x == null) return;
    const last = s.samples[s.samples.length - 1]; const d = Math.hypot(x - last[0], y - last[1]); const step = s.r * BRUSH.stepK; if (d < step * 0.35) return;
    const t = performance.now(); const n = Math.max(1, Math.ceil(d / step)); let prev = last;
    for (let k = 1; k <= n; k++) { const p = [last[0] + ((x - last[0]) * k) / n, last[1] + ((y - last[1]) * k) / n]; this._segment(prev, p); s.samples.push(p); prev = p; }
    s.moves++; const dt = performance.now() - t; const rec = { t: Math.round(t - s.t0), dt: +dt.toFixed(1), segments: n, added: s.added, removed: s.removed, cells: s.cells.size };
    s.timeline.push(rec); this.F.brushLog.push(rec); if (this.F.brushLog.length > 2000) this.F.brushLog.shift();
  }
  _cellStage(cell) {
    const s = this.stroke; let cs = s.cells.get(cell.id); if (cs) return cs;
    const inst = this.P.state.instances[cell.id]; const idx = new PlantIndex(); const keep = new Map();
    for (const p of inst ? inst.plants : []) { idx.add(p); keep.set(p.id, p); }
    cs = { cell, idx, keep, add: new Map(), remove: new Set(), rej: { edge: 0, trunk: 0, clearance: 0 } }; s.cells.set(cell.id, cs); return cs;
  }
  _segment(a, b) {
    const s = this.stroke; const r = s.r; const r2 = r * r; const mix = s.mixId ? this.P.mix(s.mixId) : null;
    const bb = [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r];
    const inCap = (x, y) => segDist2(x, y, a[0], a[1], b[0], b[1]) <= r2;
    const cells = this.cellsNear(bb).filter((c) => !this.P.state.locks[c.id]); if (!cells.length) return;
    const cands = mix ? candidates(mix, bb, { layers: s.slots }).filter((q) => inCap(q.x, q.y)) : [];
    for (const cell of cells) {
      const cs = this._cellStage(cell);
      // replace: existing plants of the target layers under the capsule leave (staged)
      for (const p of cs.keep.values()) { if (!s.slots.includes(p.slot) || !inCap(p.x, p.y)) continue; cs.keep.delete(p.id); cs.idx.remove(p); cs.remove.add(p.id); s.removed++; }
      if (!mix) continue;
      const mine = cands.filter((q) => { const cb = cell._bb; return q.x >= cb[0] && q.x <= cb[2] && q.y >= cb[1] && q.y <= cb[3]; }); if (!mine.length) continue;
      const existing = new Set([...cs.add.keys(), ...cs.keep.keys()]);
      const v = validate(mine, { cell, mix, env: s.env, index: cs.idx, existingKeys: existing });
      for (const p of v.plants) { cs.add.set(p.id, p); if (cs.remove.has(p.id)) { cs.remove.delete(p.id); s.removed--; } else s.added++; }
      for (const k of Object.keys(v.rejected)) cs.rej[k] += v.rejected[k];
    }
  }
  // staged plants for drawing, and the removed positions (to hide them in the site painter)
  stagedPlants() { const out = []; if (!this.stroke) return out; for (const cs of this.stroke.cells.values()) for (const p of cs.add.values()) out.push(p); return out; }
  removedKeys() { const k = new Set(); if (!this.stroke) return k; for (const cs of this.stroke.cells.values()) for (const id of cs.remove) { const inst = this.P.state.instances[cs.cell.id]; const p = inst && inst.plants.find((q) => q.id === id); if (p) k.add(`${p.x.toFixed(3)},${p.y.toFixed(3)}`); } return k; }
  cancel() { const had = !!this.stroke; this.stroke = null; return had; }
  // pointer-up: one atomic, validated patch
  up() {
    const s = this.stroke; if (!s) return null; this.stroke = null;
    const touched = [...s.cells.values()].filter((cs) => cs.add.size || cs.remove.size); if (!touched.length) return { ok: false, empty: true };
    const pts = simplify(s.samples, 0.08); const footprint = pts.length > 1 ? bufferLine(pts, 2 * s.r) : union([disk(pts[0][0], pts[0][1], s.r, 28)]);
    const cells = {}; const stats = {}; for (const cs of touched) { cells[cs.cell.id] = { add: [...cs.add.values()], remove: [...cs.remove] }; stats[cs.cell.id] = cs.rej; }
    const res = this.P.applyStroke({ mixId: s.mixId, slots: s.slots, footprint, cells, stats });
    const beds = new Set(touched.map((cs) => cs.cell.bedId));
    this.last = { ok: res.ok !== false, ms: Math.round(performance.now() - s.t0), moves: s.moves, samples: s.samples.length, added: s.added, removed: s.removed, cells: touched.length, beds: beds.size, timeline: s.timeline, maxMoveMs: Math.max(0, ...s.timeline.map((q) => q.dt)), meanMoveMs: s.timeline.length ? +(s.timeline.reduce((a, q) => a + q.dt, 0) / s.timeline.length).toFixed(1) : 0 };
    return { ...res, ...this.last };
  }
}
function simplify(pts, tol) { // Douglas–Peucker, keeps ends
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true; const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let md = 0, mk = -1; for (let k = i + 1; k < j; k++) { const d = segDist2(pts[k][0], pts[k][1], pts[i][0], pts[i][1], pts[j][0], pts[j][1]); if (d > md) { md = d; mk = k; } } if (mk >= 0 && md > tol * tol) { keep[mk] = true; st.push([i, mk], [mk, j]); } }
  return pts.filter((_, k) => keep[k]);
}
