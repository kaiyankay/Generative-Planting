// Canonical model store: one source of truth for the 2D plan, the 3D scene and any future AI client.
// Geometry is in local metres (x east, y north). Nothing here knows about rendering.
//
// Phase 01.1: two design scenarios on one site.
//   reference = the frozen schematic reconstruction (model.json + instances.bin, never mutated)
//   working   = an editable draft (copy of the reference, or a blank planting canvas) with its OWN
//               placements, plant-instance table and spatial index. Patches are validated and atomic.
// Views read store.model / store.inst*, which always point at the ACTIVE scenario.

import polygonClipping from '../vendor/polygon-clipping/polygon-clipping.esm.js';
import {
  EPS, pointInGeom, distToGeom as gDist, bboxOf as gBbox, intersects, within, bboxPolygon, bboxOverlap,
  validateGeometry, areaOf, polysOf, pointsOf,
} from './geom.js';

const STRIDE = 16;
export const ROLES = ['block', 'matrix', 'group', 'emergent', 'individual', 'scatter', 'bulb-drift', 'bulb-cluster', 'bulb-scatter', 'bulb-line', 'tree', 'shrub', 'hedgerow', 'meadow'];
const POINT_ROLES = new Set(['emergent', 'individual', 'tree', 'shrub', 'hedgerow']);
const SET_PATHS = { speciesIds: 'speciesIds', role: 'role', legendCode: 'string', note: 'string', countEstimatedReal: 'numberOrNull', symbolRadiusM: 'number' };
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype']);

export class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); }
  emit(ev, data) { (this._h[ev] || []).forEach((f) => f(data)); }
}

// ---------------------------------------------------------------- geometry helpers (kept for existing imports)
export function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const polyContains = (geom, x, y) => pointInGeom(geom, x, y);
export const distToGeom = gDist;
export const bboxOf = gBbox;
export function areaOfRing(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
export function centroidOf(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates.slice();
  const polys = polysOf(geom);
  if (!polys.length) { const b = bboxOf(geom); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  let A = 0, cx = 0, cy = 0;
  for (const p of polys) {
    const r = p[0];
    for (let i = 0; i < r.length - 1; i++) {
      const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      A += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f;
    }
  }
  return A ? [cx / (3 * A), cy / (3 * A)] : null;
}

// ---------------------------------------------------------------- plant-instance table (structure of arrays)
// One row per visual proxy. Rows are never re-numbered: removing marks alive = 0, adding appends.
// So `pi.<n>` ids stay stable inside a scenario and reference rows keep the ids of instances.bin.
export class InstanceTable {
  constructor(cap) {
    this.n = 0; this.cap = cap;
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.sp = new Uint16Array(cap);
    this.pl = new Int32Array(cap); this.sc = new Float32Array(cap); this.rot = new Float32Array(cap); this.alive = new Uint8Array(cap);
  }
  static fromBuffer(buf) {
    const n = buf.byteLength / STRIDE; const t = new InstanceTable(n); const v = new DataView(buf);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      t.x[i] = v.getFloat32(o, true); t.y[i] = v.getFloat32(o + 4, true); t.sp[i] = v.getUint16(o + 8, true);
      const p = v.getUint16(o + 10, true); t.pl[i] = p === 65535 ? -1 : p;
      t.sc[i] = v.getUint8(o + 12) / 100; t.rot[i] = (v.getUint8(o + 13) / 255) * Math.PI * 2; t.alive[i] = 1;
    }
    t.n = n; return t;
  }
  clone(extra = 2048) {
    const t = new InstanceTable(this.n + extra);
    for (const k of ['x', 'y', 'sp', 'pl', 'sc', 'rot', 'alive']) t[k].set(this[k].subarray(0, this.n));
    t.n = this.n; return t;
  }
  push(x, y, sp, pl, sc, rot) {
    if (this.n >= this.cap) {
      const c = Math.max(1024, this.cap * 2);
      for (const k of ['x', 'y', 'sp', 'pl', 'sc', 'rot', 'alive']) { const a = new this[k].constructor(c); a.set(this[k]); this[k] = a; }
      this.cap = c;
    }
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.sp[i] = sp; this.pl[i] = pl; this.sc[i] = sc; this.rot[i] = rot; this.alive[i] = 1;
    return i;
  }
  // stable fingerprint of the live rows (used by tests: reset must reproduce the reference exactly)
  fingerprint() {
    let h = 2166136261 >>> 0; let live = 0;
    const mixIn = (v) => { h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0; };
    const f = new Float32Array(1), u = new Uint32Array(f.buffer);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue; live++;
      mixIn(i); f[0] = this.x[i]; mixIn(u[0]); f[0] = this.y[i]; mixIn(u[0]); mixIn(this.sp[i]); mixIn(this.pl[i] + 1);
    }
    return { live, hash: h.toString(16) };
  }
}

function rng(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// ---------------------------------------------------------------- store
export class ModelStore extends Emitter {
  static async load(base) {
    const [model, instBuf, terrBuf, caseCfg] = await Promise.all([
      fetch(base + 'model.json').then((r) => { if (!r.ok) throw new Error('model.json ' + r.status); return r.json(); }),
      fetch(base + 'instances.bin').then((r) => r.arrayBuffer()),
      fetch(base + 'terrain.bin').then((r) => r.arrayBuffer()),
      fetch(base + 'case.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    return new ModelStore(model, instBuf, terrBuf, caseCfg);
  }

  constructor(model, instBuf, terrBuf, caseCfg = null) {
    super();
    this.caseCfg = caseCfg || {};
    this.baseline = deepFreeze(model);
    this.refInst = InstanceTable.fromBuffer(instBuf); // reference rows: read-only by convention
    this.refInstCount = this.refInst.n;
    this.model = this.baseline; this.inst = this.refInst;
    this.draft = null; this.scenario = 'reference';
    this.revision = 0;
    const ef = model.fields.find((f) => f.id === 'field.elevation');
    this.terrain = { meta: ef, data: new Int16Array(terrBuf) };
    // runtime layers (UI categories over the model's own layer ids; nothing in model.json changes)
    this.layerDefs = [...model.layers.map((l) => ({ ...l })), ...RUNTIME_LAYERS];
    this.layers = new Map(this.layerDefs.map((l) => [l.id, l]));
    this.layerState = {};
    for (const l of this.layerDefs) this.layerState[l.id] = { visible: l.visible, locked: l.locked, opacity: l.opacity };
    this.view = { mode: 'reference', hidePlanting: false };
    this._index();
    this.selection = null; this.hover = null;
  }

  // ---- index of the ACTIVE scenario
  _index() {
    const m = this.model;
    this.byId = new Map();
    for (const o of m.objects) this.byId.set(o.id, { kind: 'object', rec: o });
    for (const p of m.placements) this.byId.set(p.id, { kind: 'placement', rec: p });
    for (const s of m.species) this.byId.set(s.id, { kind: 'species', rec: s });
    for (const r of m.recipes) this.byId.set(r.id, { kind: 'recipe', rec: r });
    for (const s of m.sources) this.byId.set(s.id, { kind: 'source', rec: s });
    this.speciesByIndex = [];
    for (const s of m.species) this.speciesByIndex[s.index] = s;
    this.speciesIndexById = new Map(m.species.map((s) => [s.id, s.index]));
    this.placementByIndex = [];
    for (const p of m.placements) this.placementByIndex[p.index] = p;
    this.beds = m.objects.filter((o) => o.type === 'bed');
    this.bedBoxes = new Map(this.beds.map((b) => [b.id, bboxOf(b.geometry)]));
    this.placementsByBed = new Map();
    for (const p of m.placements) {
      const k = p.bedId || p.districtId || '_';
      if (!this.placementsByBed.has(k)) this.placementsByBed.set(k, []);
      this.placementsByBed.get(k).push(p);
    }
    this._pbox = new Map();
    // instances: spatial hash (2 m cells) + rows per placement, live rows only
    const t = this.inst;
    this.instanceCount = t.n;
    this._grid = new Map(); this.instByPlacement = new Map(); this.liveCount = 0;
    for (let i = 0; i < t.n; i++) {
      if (!t.alive[i]) continue; this.liveCount++;
      const k = cellKey(Math.floor(t.x[i] / 2), Math.floor(t.y[i] / 2));
      let a = this._grid.get(k); if (!a) this._grid.set(k, (a = [])); a.push(i);
      const p = t.pl[i]; if (p >= 0) { let b = this.instByPlacement.get(p); if (!b) this.instByPlacement.set(p, (b = [])); b.push(i); }
    }
    this.revision++;
  }

  // ---- instances (active scenario)
  ix(i) { return this.inst.x[i]; }
  iy(i) { return this.inst.y[i]; }
  isp(i) { return this.inst.sp[i]; }
  ipl(i) { return this.inst.pl[i]; }
  iscale(i) { return this.inst.sc[i]; }
  irot(i) { return this.inst.rot[i]; }
  ialive(i) { return i >= 0 && i < this.inst.n && this.inst.alive[i] === 1; }
  instanceLayer(i) { return this.inst.pl[i] < 0 ? 'siteveg.trees' : speciesLayer(this.speciesByIndex[this.inst.sp[i]]); }
  instancesOfPlacement(pid) { const p = this.getObject(pid); if (!p || this.kindOf(pid) !== 'placement') return []; return (this.instByPlacement.get(p.index) || []).slice(); }
  instanceRecord(i) {
    if (!this.ialive(i)) return null;
    const sp = this.speciesByIndex[this.isp(i)];
    const pl = this.placementByIndex[this.ipl(i)];
    return {
      id: 'pi.' + i, type: 'plantInstance', scenario: this.scenario, speciesId: sp.id, placementId: pl ? pl.id : null,
      bedId: pl ? pl.bedId || null : null, recipeId: pl ? pl.recipeId : null,
      position: [+this.ix(i).toFixed(3), +this.iy(i).toFixed(3)], elevation: this.sampleElevation(this.ix(i), this.iy(i)),
      assetId: sp.formProxy, scale: +this.iscale(i).toFixed(2), sizeState: 'nominal (not measured)', layer: this.instanceLayer(i),
      positionSource: pl ? pl.positionSource : 'digitised', sampled: true,
      status: pl ? pl.status : 'reconstructed', dataKind: pl ? pl.dataKind : 'inferred',
      note: 'Visual proxy, not a surveyed plant. Proxies ≈ 0.42 per real perennial, 0.12 per bulb, 1 per woody plant.',
    };
  }
  _cellsFor(b) { // cells overlapping bbox b
    const out = []; const gx0 = Math.floor(b[0] / 2), gx1 = Math.floor(b[2] / 2), gy0 = Math.floor(b[1] / 2), gy1 = Math.floor(b[3] / 2);
    if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400000) return null; // too large: caller scans all rows
    for (let a = gx0; a <= gx1; a++) for (let c = gy0; c <= gy1; c++) { const arr = this._grid.get(cellKey(a, c)); if (arr) out.push(arr); }
    return out;
  }
  // nearest live instance within radius r (radius-correct: scans every cell the circle touches)
  nearestInstance(x, y, r = 0.5, filter) {
    let best = -1, bd = r;
    const cells = this._cellsFor([x - r, y - r, x + r, y + r]) || [this._allLive()];
    for (const arr of cells) for (const i of arr) {
      if (filter && !filter(i)) continue;
      const d = Math.hypot(this.inst.x[i] - x, this.inst.y[i] - y);
      if (d <= bd) { bd = d; best = i; }
    }
    return best;
  }
  _allLive() { const a = []; for (let i = 0; i < this.inst.n; i++) if (this.inst.alive[i]) a.push(i); return a; }

  // ---- terrain
  sampleElevation(x, y) {
    const m = this.terrain.meta;
    const fx = (x - m.origin[0]) / m.cellSize, fy = (y - m.origin[1]) / m.cellSize;
    if (!(fx >= 0 && fy >= 0 && fx <= m.cols - 1 && fy <= m.rows - 1)) return null;
    const x0 = Math.min(m.cols - 2, Math.floor(fx)), y0 = Math.min(m.rows - 2, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0;
    const d = this.terrain.data;
    const g = (c, r) => d[r * m.cols + c];
    const v = [g(x0, y0), g(x0 + 1, y0), g(x0, y0 + 1), g(x0 + 1, y0 + 1)];
    if (v.some((q) => q === -32768)) return null;
    const z = (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
    return m.datumZ + z / 100;
  }
  // derived contour lines (marching squares on the 3DEP grid); cached per interval.
  // 0.25 m contours are INTERPOLATED isolines of a 1 m grid (vertical accuracy ~0.1 m), not a finer survey.
  contours(step = 0.25) {
    this._contours ||= {};
    if (this._contours[step]) return this._contours[step];
    const m = this.terrain.meta, d = this.terrain.data, C = m.cols, R = m.rows;
    const z = (c, r) => { const v = d[r * C + c]; return v === -32768 ? NaN : m.datumZ + v / 100; };
    const out = [];
    const lo = Math.ceil(m.zMin / step) * step;
    for (let L = lo; L <= m.zMax; L += step) {
      const segs = [];
      for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
        const a = z(c, r), b = z(c + 1, r), e = z(c + 1, r + 1), f = z(c, r + 1);
        if ([a, b, e, f].some(Number.isNaN)) continue;
        const pts = [];
        const edge = (z1, z2, x1, y1, x2, y2) => { if ((z1 < L) !== (z2 < L)) { const t = (L - z1) / (z2 - z1); pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]); } };
        const X = m.origin[0] + c * m.cellSize, Y = m.origin[1] + r * m.cellSize, s = m.cellSize;
        edge(a, b, X, Y, X + s, Y); edge(b, e, X + s, Y, X + s, Y + s); edge(e, f, X + s, Y + s, X, Y + s); edge(f, a, X, Y + s, X, Y);
        if (pts.length === 2) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1]);
        else if (pts.length === 4) segs.push(pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]);
      }
      out.push({ z: +L.toFixed(2), major: Math.abs(L - Math.round(L)) < 1e-6, segs: new Float32Array(segs) });
    }
    return (this._contours[step] = out);
  }
  sampleSlope(x, y) {
    const h = 1.0;
    const a = this.sampleElevation(x - h, y), b = this.sampleElevation(x + h, y), c = this.sampleElevation(x, y - h), d = this.sampleElevation(x, y + h);
    if ([a, b, c, d].some((v) => v == null)) return null;
    const gx = (b - a) / (2 * h), gy = (d - c) / (2 * h);
    return (Math.atan(Math.hypot(gx, gy)) * 180) / Math.PI;
  }

  // ---- public query API (also exposed as window.GP for future AI clients)
  getObject(id) {
    if (typeof id !== 'string') return null;
    if (id.startsWith('pi.')) { const i = +id.slice(3); return Number.isInteger(i) ? this.instanceRecord(i) : null; }
    const e = this.byId.get(id);
    return e ? e.rec : null;
  }
  kindOf(id) { if (typeof id !== 'string') return null; if (id.startsWith('pi.')) return this.ialive(+id.slice(3)) ? 'instance' : null; const e = this.byId.get(id); return e ? e.kind : null; }
  getBedAt(x, y) {
    for (const b of this.beds) {
      const bb = this.bedBoxes.get(b.id);
      if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
      if (pointInGeom(b.geometry, x, y)) return b;
    }
    return null;
  }
  placementGeom(p) {
    if (p.geometry) return p.geometry;
    if (p.geometryRef) { const o = this.getObject(p.geometryRef); return o ? o.geometry : null; }
    return null;
  }
  placementBox(p) { let b = this._pbox.get(p.id); if (!b) { b = bboxOf(this.placementGeom(p)); this._pbox.set(p.id, b); } return b; }
  getPlacementsAt(x, y, { roles, includeBulbs = false, tol = 0 } = {}) {
    const bed = this.getBedAt(x, y);
    const list = bed ? this.placementsByBed.get(bed.id) || [] : [];
    const out = [];
    for (const p of list) {
      const isBulb = (p.role || '').startsWith('bulb');
      if (isBulb && !includeBulbs) continue;
      if (roles && !roles.includes(p.role)) continue;
      const g = this.placementGeom(p);
      if (!g) continue;
      if (g.type === 'Point') { if (Math.hypot(g.coordinates[0] - x, g.coordinates[1] - y) <= (p.symbolRadiusM || 0.35) + tol) out.push(p); }
      else if (g.type === 'MultiPoint') { /* scatter: only via instance pick */ }
      else if (pointInGeom(g, x, y)) out.push(p);
    }
    out.sort((a, b) => rank(a) - rank(b)); // most specific first: points, small areas, then matrix
    return out;
    function rank(p) { const g = p.geometry; if (g && g.type === 'Point') return 0; if (p.role === 'matrix' || p.role === 'meadow') return 3; return 1 + (p.areaM2 || 0) / 1e4; }
  }

  /**
   * Exact spatial query on the ACTIVE scenario (or filters.scenario).
   * geometry: any GeoJSON geometry (Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon with holes),
   *   optional `radius` (m): match objects within that distance (closed). `{bbox:[x0,y0,x1,y1]}` = exact rectangle.
   *   `{bbox, candidates:true}` = broad phase only (bbox overlap), results flagged `exact:false`.
   * filters: collection 'objects' (default) | 'placements' | 'instances'; predicate 'intersects' (default) | 'within';
   *   type, layer, style, role, speciesId, bedId, limit.
   * Boundary contact counts as intersecting. Distances use real metres; display exaggeration never applies.
   */
  queryObjects(geometry, filters = {}) {
    const r = this.query(geometry, filters);
    if (!r.ok) throw new Error(r.error);
    return r.results;
  }
  query(geometry, filters = {}) {
    if (!geometry || typeof geometry !== 'object') return { ok: false, error: 'geometry required' };
    let q = geometry, candidates = false;
    if (geometry.bbox) {
      const b = geometry.bbox;
      if (!Array.isArray(b) || b.length !== 4 || !b.every(Number.isFinite) || b[0] > b[2] || b[1] > b[3]) return { ok: false, error: 'bbox must be [x0, y0, x1, y1]' };
      q = bboxPolygon(b); candidates = !!geometry.candidates;
    } else {
      const v = validateGeometry(geometry); if (!v.ok) return { ok: false, error: v.error };
    }
    const radius = Math.max(0, +(geometry.radius || 0) || 0);
    const qb = bboxOf(q); const qbPad = [qb[0] - radius, qb[1] - radius, qb[2] + radius, qb[3] + radius];
    const pred = filters.predicate || 'intersects';
    if (!['intersects', 'within'].includes(pred)) return { ok: false, error: 'predicate must be intersects | within' };
    const test = (g) => {
      if (!g) return false;
      if (!bboxOverlap(bboxOf(g), qbPad, EPS)) return false;
      if (candidates) return true;
      if (pred === 'within') return radius === 0 ? within(g, q) : false;
      if (radius > 0) return geomDistanceFast(g, q) <= radius + EPS;
      return intersects(g, q);
    };
    const coll = filters.collection || 'objects';
    const limit = filters.limit || Infinity;
    const res = [];
    if (coll === 'instances') {
      const cells = this._cellsFor(qbPad) || [this._allLive()];
      for (const arr of cells) for (const i of arr) {
        if (res.length >= limit) break;
        const pt = { type: 'Point', coordinates: [this.inst.x[i], this.inst.y[i]] };
        if (filters.speciesId && this.speciesByIndex[this.inst.sp[i]].id !== filters.speciesId) continue;
        if (filters.layer && this.instanceLayer(i) !== filters.layer) continue;
        const pl = this.placementByIndex[this.inst.pl[i]];
        if (filters.bedId && (!pl || pl.bedId !== filters.bedId)) continue;
        if (filters.role && (!pl || pl.role !== filters.role)) continue;
        if (test(pt)) res.push(this.instanceRecord(i));
      }
      res.sort((a, b) => +a.id.slice(3) - +b.id.slice(3));
    } else {
      const pool = coll === 'placements' ? this.model.placements : this.model.objects;
      for (const o of pool) {
        if (res.length >= limit) break;
        if (filters.type && o.type !== filters.type) continue;
        if (filters.layer && this.layerOf(o) !== filters.layer && o.layer !== filters.layer) continue;
        if (filters.style && !(o.props && o.props.style === filters.style)) continue;
        if (filters.role && o.role !== filters.role) continue;
        if (filters.bedId && o.bedId !== filters.bedId) continue;
        if (filters.speciesId && !(o.speciesIds || []).includes(filters.speciesId)) continue;
        if (test(o.geometry || this.placementGeom(o))) res.push(candidates ? { ...o, exact: false } : o);
      }
    }
    return { ok: true, scenario: this.scenario, exact: !candidates, predicate: pred, radius, results: res };
  }
  queryInstances(geometry, filters = {}) { return this.queryObjects(geometry, { ...filters, collection: 'instances' }); }

  // "distance to path" = distance to the nearest object of a path type listed in case.json (default: type 'path')
  pathObjects() {
    const types = this.caseCfg.pathTypes || ['path'];
    return (this._paths ||= this.baseline.objects.filter((o) => types.includes(o.type)));
  }
  distanceToPath(x, y) {
    let best = Infinity;
    for (const o of this.pathObjects()) best = Math.min(best, distToGeom(o.geometry, x, y));
    return best;
  }
  // planting units of the case (beds + designed districts) and whether a point may be planted
  plantingUnits() {
    const P = this.caseCfg.planting || {};
    const styles = new Set(P.editableBedStyles || ['A', 'B', 'C', 'T', 'RG', 'M']);
    const extra = new Set(P.editableDistricts || []);
    return this.baseline.objects.filter((o) => (o.type === 'bed' && styles.has(o.props.style)) || extra.has(o.id));
  }
  plantableAt(x, y) {
    const unit = this.plantingUnits().find((u) => pointInGeom(u.geometry, x, y));
    if (!unit) return { value: false, reason: 'outside every planting unit (bed / designed district)' };
    const blockers = new Set(this.caseCfg.nonPlantableLayers || ['built.paths', 'built.walks', 'site.water', 'site.context', 'built.structures']);
    for (const o of this.baseline.objects) {
      if (!blockers.has(o.layer) || !o.geometry || !polysOf(o.geometry).length) continue;
      if (pointInGeom(o.geometry, x, y)) return { value: false, unitId: unit.id, reason: `inside ${o.type} ${o.id}` };
    }
    const lock = this.draft && (this.draft.locks.has(unit.id));
    return { value: true, unitId: unit.id, editLocked: !!lock };
  }
  sampleConditions(x, y) {
    const f = (id) => this.model.fields.find((q) => q.id === id);
    const out = { x: +(+x).toFixed(3), y: +(+y).toFixed(3), scenario: this.scenario };
    const e = this.sampleElevation(x, y);
    out.inExtent = e != null;
    out['field.elevation'] = { value: e == null ? null : +e.toFixed(2), units: 'm NAVD88', status: e == null ? 'unknown' : 'source',
      definition: 'bilinear sample of the USGS 3DEP 1 m DEM (vertical ~0.1 m); null outside the DEM extent', source: 'S-3DEP' };
    const s = this.sampleSlope(x, y);
    out['field.slope'] = { value: s == null ? null : +s.toFixed(1), units: 'deg', status: s == null ? 'unknown' : 'derived',
      definition: 'central difference of the DEM over ±1 m (2 m baseline)', source: 'S-3DEP' };
    const dp = e == null ? Infinity : this.distanceToPath(x, y);
    out['field.distance-to-path'] = { value: isFinite(dp) ? +dp.toFixed(2) : null, units: 'm', status: isFinite(dp) ? 'derived' : 'unknown',
      definition: `planar distance to the nearest ${(this.caseCfg.pathTypes || ['path']).join('/')} object (${this.pathObjects().map((o) => o.id).join(', ')}); 0 inside`, source: 'S-OSM' };
    for (const id of ['field.sun', 'field.moisture', 'field.ph']) out[id] = { value: null, units: f(id).units, status: 'unknown', note: f(id).note };
    const bed = this.getBedAt(x, y);
    out.bedId = bed ? bed.id : null;
    out.placements = this.getPlacementsAt(x, y, { includeBulbs: true }).map((p) => p.id);
    out.objects = this.query({ type: 'Point', coordinates: [x, y] }, {}).results.filter((o) => o.type !== 'site').map((o) => o.id);
    out.constraints = { plantable: this.plantableAt(x, y), note: 'Plantable, hidden and locked are independent: hiding a layer never removes a constraint.' };
    return out;
  }
  getPlantingContext(id) {
    const o = this.getObject(id);
    if (!o) return null;
    const kind = this.kindOf(id);
    let bed = null, placements = [];
    if (kind === 'instance') { bed = o.bedId ? this.getObject(o.bedId) : null; placements = o.placementId ? [this.getObject(o.placementId)] : []; }
    else if (kind === 'placement') { bed = o.bedId ? this.getObject(o.bedId) : null; placements = [o]; }
    else if (o.type === 'bed') { bed = o; placements = this.placementsByBed.get(o.id) || []; }
    const recipe = placements[0] ? this.getObject(placements[0].recipeId) : null;
    const speciesIds = [...new Set(placements.flatMap((p) => p.speciesIds || []))];
    const byRole = {};
    for (const p of placements) { byRole[p.role] = (byRole[p.role] || 0) + 1; }
    const c = bed ? centroidOf(bed.geometry) : null;
    let instances = 0; for (const p of placements) instances += (this.instByPlacement.get(p.index) || []).length;
    return {
      id, kind, scenario: this.scenario, bedId: bed ? bed.id : null, style: bed && bed.props ? bed.props.style : null,
      recipeId: recipe ? recipe.id : null, placementCount: placements.length, placementsByRole: byRole, instanceCount: instances,
      species: speciesIds.map((s) => { const r = this.getObject(s); return { id: s, name: r.canonicalKey, type: r.plantType }; }),
      conditionsAtCentroid: c ? this.sampleConditions(c[0], c[1]) : null,
      conditionsInBed: bed && this.compute && this.compute.designBeds().some((u) => u.id === bed.id) ? this.compute.distribution(bed.id, { fields: ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.distance-to-edge', 'field.canopy', 'field.sun', 'field.moisture', 'field.ph'] }) : null,
    };
  }
  // per-species tally of the active scenario (inspector, legend, tests)
  speciesTally(filter = {}) {
    const t = new Map();
    for (const p of this.model.placements) {
      if (filter.bedId && p.bedId !== filter.bedId) continue;
      const rows = this.instByPlacement.get(p.index) || [];
      for (const i of rows) { const s = this.speciesByIndex[this.inst.sp[i]].id; t.set(s, (t.get(s) || 0) + 1); }
    }
    return Object.fromEntries([...t.entries()].sort((a, b) => b[1] - a[1]));
  }

  // ================================================================ scenarios + drafts
  // Draft = { from:'reference'|'blank', scope:[unitIds cleared], model, inst, ops:[], batches:n, locks:Set, created }
  draftInfo() {
    if (!this.draft) return null;
    const d = this.draft;
    return { from: d.from, scope: d.scope.slice(), changes: d.ops.length, batches: d.batches, locks: [...d.locks], dirty: d.ops.length > 0 || d.from === 'blank', saved: d.saved };
  }
  // what "Start new planting design" would clear (shown to the user BEFORE it runs)
  blankScopePreview(scope = this.defaultBlankScope()) {
    const set = new Set(scope); let placements = 0, instances = 0; const byUnit = {};
    for (const p of this.baseline.placements) {
      const u = p.bedId || p.districtId; if (!set.has(u)) continue;
      placements++; const n = p.instanceRange ? p.instanceRange[1] : 0; instances += n; byUnit[u] = (byUnit[u] || 0) + 1;
    }
    const kept = this.plantingUnits().filter((u) => !set.has(u.id)).map((u) => u.id);
    return { clears: { units: scope.slice(), placements, instances, byUnit }, keeps: { site: true, terrain: true, paths: true, bedFramework: true, existingTrees: true, lawn: true, otherUnits: kept } };
  }
  defaultBlankScope() {
    const st = new Set((this.caseCfg.planting || {}).blankDefaultStyles || ['A', 'B', 'C']);
    return this.plantingUnits().filter((u) => u.type === 'bed' && st.has(u.props.style)).map((u) => u.id);
  }
  createDraft({ from = 'reference', scope, activate = true } = {}) {
    if (!['reference', 'blank'].includes(from)) return { ok: false, error: "from must be 'reference' or 'blank'" };
    const sc = from === 'blank' ? (scope || this.defaultBlankScope()) : [];
    const units = new Set(this.plantingUnits().map((u) => u.id));
    const bad = sc.filter((u) => !units.has(u));
    if (bad.length) return { ok: false, error: 'not a planting unit: ' + bad.join(', ') };
    const model = structuredClone(this.baseline);
    const inst = this.refInst.clone();
    if (from === 'blank') {
      const set = new Set(sc); const gone = new Set();
      model.placements = model.placements.filter((p) => { const u = p.bedId || p.districtId; if (set.has(u)) { gone.add(p.index); return false; } return true; });
      for (let i = 0; i < inst.n; i++) if (gone.has(inst.pl[i])) inst.alive[i] = 0;
    }
    this.draft = { from, scope: sc, model, inst, ops: [], batches: 0, locks: new Set(), created: new Date().toISOString(), saved: false, nextIndex: 1 + Math.max(...this.baseline.placements.map((p) => p.index)) };
    if (activate) this.setScenario('working'); else this.emit('draft', this.draftInfo());
    this._persist();
    return { ok: true, draft: this.draftInfo() };
  }
  setScenario(s) {
    if (s === 'working' && !this.draft) return false;
    this.scenario = s;
    this.model = s === 'working' ? this.draft.model : this.baseline;
    this.inst = s === 'working' ? this.draft.inst : this.refInst;
    this._index();
    if (this.selection && !this.getObject(this.selection.id)) { this.selection = null; this.emit('selection', null); }
    if (this.hover && !this.getObject(this.hover.id)) { this.hover = null; this.emit('hover', null); }
    this.emit('model', { scenario: s, draft: this.draftInfo() });
    return true;
  }
  setEditLock(id, locked = true) {
    if (!this.draft) return { ok: false, error: 'no working draft' };
    if (!this.draft.model.objects.some((o) => o.id === id) && !this.draft.model.placements.some((p) => p.id === id)) return { ok: false, error: 'unknown id ' + id };
    locked ? this.draft.locks.add(id) : this.draft.locks.delete(id);
    this._persist(); this.emit('draft', this.draftInfo());
    return { ok: true, locks: [...this.draft.locks] };
  }

  /**
   * Validate and apply a batch of operations to the WORKING draft. All-or-nothing.
   * ops: { op:'replaceSpecies', target:'pl.*', speciesIds:['sp.*'] }
   *      { op:'set', target:'pl.*', path: speciesIds|role|legendCode|note|countEstimatedReal|symbolRadiusM, value }
   *      { op:'remove', target:'pl.*' }
   *      { op:'add', collection:'placements', value:{ id?, bedId, role, kind:'area'|'point', speciesIds, geometry, legendCode?, note? } }
   * Returns { ok:true, rev, applied, changes } or { ok:false, errors:[{index, op, code, message}] } (state untouched).
   * No draft yet -> a copy of the reference is created first (draftCreated:true).
   */
  applyPatch(ops, { dryRun = false } = {}) {
    if (!Array.isArray(ops) || !ops.length) return { ok: false, errors: [{ index: -1, code: 'E_INPUT', message: 'ops must be a non-empty array' }] };
    let created = false;
    if (!this.draft) { this.createDraft({ from: 'reference', activate: false }); created = true; }
    const d = this.draft;
    // stage on copies: placements array (records cloned on write), instance table clone
    const st = { placements: d.model.placements.slice(), inst: d.inst.clone(256), nextIndex: d.nextIndex, changes: { added: [], removed: [], modified: [], instancesAdded: [], instancesRemoved: 0, instancesChanged: 0 } };
    st.byId = new Map(st.placements.map((p, k) => [p.id, k]));
    const errors = [];
    ops.forEach((op, k) => { const e = this._applyOne(st, op); if (e) errors.push({ index: k, op: op && op.op, ...e }); });
    if (errors.length) {
      if (created) { this.draft = null; this._persist(); }
      return { ok: false, errors, draftCreated: false };
    }
    if (dryRun) { if (created) { this.draft = null; this._persist(); } return { ok: true, dryRun: true, changes: summarize(st.changes) }; }
    d.model.placements = st.placements; d.inst = st.inst; d.nextIndex = st.nextIndex;
    for (const op of ops) d.ops.push(JSON.parse(JSON.stringify(op)));
    d.batches++; d.saved = false;
    if (this.scenario !== 'working') this.setScenario('working');
    else { this.model = d.model; this.inst = d.inst; this._index(); this.emit('model', { scenario: 'working', draft: this.draftInfo(), changes: st.changes }); }
    if (this.selection && !this.getObject(this.selection.id)) this.select(null);
    this._persist();
    return { ok: true, rev: this.revision, applied: ops.length, draftCreated: created, changes: summarize(st.changes) };
  }
  _applyOne(st, op) {
    const E = (code, message) => ({ code, message });
    if (!op || typeof op !== 'object') return E('E_INPUT', 'op must be an object');
    const d = this.draft;
    const getP = (id) => (typeof id === 'string' && st.byId.has(id) ? st.placements[st.byId.get(id)] : null);
    const writable = (p) => { // clone on write so the committed draft is never half-modified
      const k = st.byId.get(p.id); if (st.placements[k] === p && !st._cloned?.has(p.id)) { st.placements[k] = structuredClone(p); (st._cloned ||= new Set()).add(p.id); }
      return st.placements[st.byId.get(p.id)];
    };
    const unitOf = (p) => p.bedId || p.districtId;
    const lockedP = (p) => d.locks.has(p.id) || d.locks.has(unitOf(p));
    const unitIds = new Set(this.plantingUnits().map((u) => u.id));
    const checkSpecies = (ids) => {
      if (!Array.isArray(ids) || !ids.length || ids.length > 4) return 'speciesIds must be 1–4 species ids';
      for (const s of ids) if (typeof s !== 'string' || !this.speciesIndexById.has(s)) return 'unknown species ' + s;
      return null;
    };
    switch (op.op) {
      case 'replaceSpecies':
      case 'set': {
        const p = getP(op.target);
        if (!p) return E(this.draft.model.objects.some((o) => o.id === op.target) ? 'E_READONLY' : 'E_NOT_FOUND', `no editable placement ${op.target} in the working draft (site objects are read-only)`);
        if (lockedP(p)) return E('E_LOCKED', `${op.target} is edit-locked`);
        let path = op.op === 'replaceSpecies' ? 'speciesIds' : op.path; const value = op.op === 'replaceSpecies' ? op.speciesIds : op.value;
        if (typeof path !== 'string' || path.split('.').some((k) => FORBIDDEN.has(k))) return E('E_PATH', 'forbidden path');
        const kind = SET_PATHS[path]; if (!kind) return E('E_PATH', `path not editable: ${path} (allowed: ${Object.keys(SET_PATHS).join(', ')})`);
        if (kind === 'speciesIds') { const e = checkSpecies(value); if (e) return E('E_SPECIES', e); }
        if (kind === 'role' && !ROLES.includes(value)) return E('E_ROLE', 'unknown role ' + value);
        if (kind === 'string' && (typeof value !== 'string' || value.length > 500)) return E('E_VALUE', path + ' must be a string ≤ 500 chars');
        if (kind === 'number' && !(typeof value === 'number' && value > 0 && value < 20)) return E('E_VALUE', path + ' must be a number in (0, 20)');
        if (kind === 'numberOrNull' && !(value === null || (typeof value === 'number' && value >= 0 && Number.isFinite(value)))) return E('E_VALUE', path + ' must be ≥ 0 or null');
        const w = writable(p);
        if (kind === 'speciesIds') {
          const old = w.speciesIds.map((s) => this.speciesIndexById.get(s)); const nu = value.map((s) => this.speciesIndexById.get(s));
          const rows = this._rowsOf(st.inst, w.index);
          rows.forEach((i, j) => { let pos = old.indexOf(st.inst.sp[i]); if (pos < 0) pos = j; st.inst.sp[i] = nu[pos % nu.length]; });
          st.changes.instancesChanged += rows.length;
          // the legend code belonged to the old species in Oudolf's legend: clear it, keep a trace of what was replaced
          if (!w.replaced) w.replaced = { speciesIds: w.speciesIds.slice(), legendCode: w.legendCode || null };
          w.speciesIds = value.slice(); w.legendCode = typeof op.legendCode === 'string' ? op.legendCode.slice(0, 24) : null;
          w.dataKind = 'hypothetical'; w.status = 'draft'; w.positionSource = w.positionSource || 'draft';
        } else w[path] = value;
        if (!st.changes.modified.includes(w.id) && !st.changes.added.includes(w.id)) st.changes.modified.push(w.id);
        return null;
      }
      case 'remove': {
        const p = getP(op.target);
        if (!p) return E(this.draft.model.objects.some((o) => o.id === op.target) ? 'E_READONLY' : 'E_NOT_FOUND', `no editable placement ${op.target} in the working draft`);
        if (lockedP(p)) return E('E_LOCKED', `${op.target} is edit-locked`);
        const rows = this._rowsOf(st.inst, p.index); for (const i of rows) st.inst.alive[i] = 0;
        st.changes.instancesRemoved += rows.length;
        const k = st.byId.get(p.id); st.placements.splice(k, 1); st.byId = new Map(st.placements.map((q, j) => [q.id, j]));
        if (st.changes.added.includes(p.id)) st.changes.added = st.changes.added.filter((x) => x !== p.id); else st.changes.removed.push(p.id);
        st.changes.modified = st.changes.modified.filter((x) => x !== p.id);
        return null;
      }
      case 'add': {
        if (op.collection !== 'placements') return E('E_COLLECTION', "only collection 'placements' can be added to in a planting draft");
        const v = op.value; if (!v || typeof v !== 'object') return E('E_INPUT', 'value required');
        for (const k of Object.keys(v)) if (FORBIDDEN.has(k)) return E('E_PATH', 'forbidden key');
        const unit = v.bedId || v.districtId;
        if (!unitIds.has(unit)) return E('E_UNIT', `bedId must be a planting unit (${unit})`);
        if (d.locks.has(unit)) return E('E_LOCKED', `${unit} is edit-locked`);
        if (!ROLES.includes(v.role)) return E('E_ROLE', 'unknown role ' + v.role);
        const es = checkSpecies(v.speciesIds); if (es) return E('E_SPECIES', es);
        const gv = validateGeometry(v.geometry); if (!gv.ok) return E('E_GEOMETRY', gv.error);
        const kind = v.geometry.type === 'Point' ? 'point' : (v.geometry.type === 'Polygon' || v.geometry.type === 'MultiPolygon') ? 'area' : null;
        if (!kind) return E('E_GEOMETRY', 'placements are Point or (Multi)Polygon');
        if (kind === 'point' && !POINT_ROLES.has(v.role)) return E('E_ROLE', `role ${v.role} needs an area`);
        const unitGeom = this.baseline.objects.find((o) => o.id === unit).geometry;
        if (!within(v.geometry, unitGeom)) return E('E_OUTSIDE', `geometry is not inside ${unit}`);
        for (const pt of kind === 'point' ? [v.geometry.coordinates] : []) { const pa = this.plantableAt(pt[0], pt[1]); if (!pa.value) return E('E_NOT_PLANTABLE', pa.reason); }
        if (kind === 'area') {
          for (const o of this.baseline.objects) {
            if (!(this.caseCfg.nonPlantableLayers || ['built.paths', 'built.walks', 'site.water', 'site.context', 'built.structures']).includes(o.layer) || !o.geometry || !polysOf(o.geometry).length) continue;
            if (intersects(v.geometry, o.geometry) && areaOverlapsInterior(v.geometry, o.geometry)) return E('E_NOT_PLANTABLE', `overlaps ${o.type} ${o.id}`);
          }
        }
        const id = v.id || `pl.${unit.replace(/^(bed|district)\./, '')}.d${st.nextIndex}`;
        if (typeof id !== 'string' || !/^pl\.[A-Za-z0-9._-]{1,60}$/.test(id)) return E('E_ID', 'id must match pl.[A-Za-z0-9._-]');
        if (st.byId.has(id) || this.baseline.placements.some((p) => p.id === id) || this.byId.has(id)) return E('E_ID', 'id already used: ' + id);
        const recipe = (this.placementsByBed.get(unit) || this.baseline.placements.filter((p) => (p.bedId || p.districtId) === unit))[0];
        const area = kind === 'area' ? areaOf(v.geometry) : null;
        if (kind === 'area' && !(area > 0.05)) return E('E_GEOMETRY', 'area too small (< 0.05 m²)');
        const index = st.nextIndex++;
        const rec = {
          id, index, kind, role: v.role, bedId: v.bedId || null, districtId: v.districtId || null, recipeId: recipe ? recipe.recipeId : null,
          legendCode: typeof v.legendCode === 'string' ? v.legendCode.slice(0, 24) : null, speciesIds: v.speciesIds.slice(), geometry: structuredClone(v.geometry),
          areaM2: area == null ? null : +area.toFixed(2), symbolRadiusM: kind === 'point' ? (typeof v.symbolRadiusM === 'number' ? v.symbolRadiusM : 0.35) : undefined,
          countEstimatedReal: null, countBasis: 'draft placement: real count not estimated', positionSource: 'draft', status: 'draft', dataKind: 'hypothetical',
          sourceRefs: ['S-MODEL'], note: typeof v.note === 'string' ? v.note.slice(0, 500) : undefined,
        };
        const rows = this._generate(st.inst, rec);
        rec.countModelled = rows.length;
        st.placements.push(rec); st.byId.set(id, st.placements.length - 1);
        st.changes.added.push(id); st.changes.instancesAdded.push(...rows.map((i) => 'pi.' + i));
        return null;
      }
      default: return E('E_OP', 'unknown op ' + op.op);
    }
  }
  _rowsOf(t, plIndex) { const out = []; for (let i = 0; i < t.n; i++) if (t.alive[i] && t.pl[i] === plIndex) out.push(i); return out; }
  // deterministic proxies for a new placement (seed = placement id): same density rules as the build
  _generate(t, rec) {
    const sps = rec.speciesIds.map((s) => this.getObject(s) || this.baseline.species.find((q) => q.id === s));
    const r = rng(hashStr(rec.id)); const rows = [];
    const spIdx = sps.map((s) => s.index);
    if (rec.kind === 'point') {
      const [x, y] = rec.geometry.coordinates; rows.push(t.push(x, y, spIdx[0], rec.index, 1, r() * Math.PI * 2)); return rows;
    }
    const sp0 = sps[0]; const spread = Math.max(0.15, sp0.nominalSpreadM || 0.5);
    const ratio = sp0.plantType === 'bulb' ? 0.12 : (sp0.plantType === 'tree' || sp0.plantType === 'shrub') ? 1 : 0.42;
    const target = Math.max(1, Math.min(2000, Math.round((rec.areaM2 / (spread * spread)) * ratio)));
    const b = bboxOf(rec.geometry); const minD = spread * 0.55; const pts = [];
    for (let a = 0; a < target * 40 && pts.length < target; a++) {
      const x = b[0] + r() * (b[2] - b[0]), y = b[1] + r() * (b[3] - b[1]);
      if (!pointInGeom(rec.geometry, x, y)) continue;
      if (pts.some((q) => (q[0] - x) ** 2 + (q[1] - y) ** 2 < minD * minD)) continue;
      pts.push([x, y]);
    }
    if (!pts.length) { const c = centroidOf(rec.geometry); pts.push(c); }
    pts.forEach((q, j) => rows.push(t.push(q[0], q[1], spIdx[j % spIdx.length], rec.index, 0.85 + r() * 0.3, r() * Math.PI * 2)));
    return rows;
  }
  // reset the working draft to its starting point (copy of the reference, or the blank canvas). Baseline untouched.
  resetDraft() {
    if (!this.draft) return { ok: true, draft: null };
    const { from, scope } = this.draft; const locks = [...this.draft.locks];
    const keep = this.scenario;
    this.createDraft({ from, scope, activate: false });
    locks.forEach((l) => this.draft.locks.add(l));
    this._persist();
    this.setScenario(keep);
    return { ok: true, draft: this.draftInfo() };
  }
  discardDraft() { this.draft = null; this._persist(); this.setScenario('reference'); return { ok: true }; }
  diffDraft() { return this.draft ? this.draft.ops.map((o) => JSON.parse(JSON.stringify(o))) : []; }
  draftSummary() {
    if (!this.draft) return null;
    const ref = new Map(this.baseline.placements.map((p) => [p.id, p]));
    const cur = new Map(this.draft.model.placements.map((p) => [p.id, p]));
    const added = [...cur.keys()].filter((k) => !ref.has(k)), removed = [...ref.keys()].filter((k) => !cur.has(k));
    const modified = [...cur.keys()].filter((k) => ref.has(k) && JSON.stringify(ref.get(k).speciesIds) !== JSON.stringify(cur.get(k).speciesIds) || (ref.has(k) && ref.get(k).role !== cur.get(k).role));
    const fp = this.draft.inst.fingerprint();
    return { from: this.draft.from, scope: this.draft.scope.slice(), ops: this.draft.ops.length, placements: { added, removed: this.draft.from === 'blank' ? removed.length : removed, modified }, liveInstances: fp.live, instanceHash: fp.hash };
  }
  // export: the reference model (default) or the working draft WITH its instance state
  exportModel({ draft = false } = {}) {
    if (!draft || !this.draft) return JSON.stringify(this.baseline);
    return JSON.stringify(this.exportDraft());
  }
  exportDraft() {
    if (!this.draft) return null;
    const d = this.draft; const t = d.inst; const ref = this.refInst;
    const removed = [], changed = [], added = [];
    for (let i = 0; i < t.n; i++) {
      if (i < ref.n) {
        if (!t.alive[i]) { removed.push(i); continue; }
        if (t.sp[i] !== ref.sp[i]) changed.push([i, this.speciesByIndexAll(t.sp[i])]);
      } else if (t.alive[i]) added.push([i, +t.x[i].toFixed(3), +t.y[i].toFixed(3), this.speciesByIndexAll(t.sp[i]), t.pl[i], +t.sc[i].toFixed(3), +t.rot[i].toFixed(4)]);
    }
    const fp = t.fingerprint();
    return {
      schema: 'generative-planting/working-draft', version: '0.4', caseId: this.baseline.project.caseId, baseVersion: this.baseline.project.version,
      recipe: { from: d.from, scope: d.scope, ops: d.ops, locks: [...d.locks] },
      instanceDelta: { removedRows: compressRuns(removed), speciesChanged: changed, added, columns: ['row', 'x', 'y', 'speciesId', 'placementIndex', 'scale', 'rotation'] },
      instanceFingerprint: fp, placements: d.model.placements,
      note: 'Rebuild with GP.importDraft(this): replays recipe.ops on the reference and checks instanceFingerprint.',
    };
  }
  speciesByIndexAll(k) { const s = this.baseline.species.find((q) => q.index === k); return s ? s.id : null; }
  importDraft(obj) {
    if (!obj || !obj.recipe) return { ok: false, error: 'not a working-draft export' };
    const prev = this.draft; const prevScenario = this.scenario;
    const r = this.createDraft({ from: obj.recipe.from, scope: obj.recipe.scope, activate: false });
    if (!r.ok) { this.draft = prev; return r; }
    if (obj.recipe.ops && obj.recipe.ops.length) {
      const res = this.applyPatch(obj.recipe.ops);
      if (!res.ok) { this.draft = prev; this.setScenario(prevScenario); return { ok: false, error: 'replay failed', errors: res.errors }; }
    }
    (obj.recipe.locks || []).forEach((l) => this.draft.locks.add(l));
    const fp = this.draft.inst.fingerprint();
    const match = !obj.instanceFingerprint || (fp.hash === obj.instanceFingerprint.hash && fp.live === obj.instanceFingerprint.live);
    this.setScenario('working'); this._persist();
    return { ok: true, fingerprintMatches: match, fingerprint: fp };
  }
  // session persistence of the draft recipe (replayable); failures are silent by design
  _persist() {
    try {
      if (typeof localStorage === 'undefined') return;
      if (!this.draft) { localStorage.removeItem(PERSIST_KEY); return; }
      const d = this.draft;
      localStorage.setItem(PERSIST_KEY, JSON.stringify({ caseId: this.baseline.project.caseId, from: d.from, scope: d.scope, ops: d.ops, locks: [...d.locks], at: new Date().toISOString() }));
      d.saved = true;
    } catch { /* storage unavailable: draft lives for this session only */ }
  }
  restorePersisted() {
    try {
      const raw = typeof localStorage !== 'undefined' && localStorage.getItem(PERSIST_KEY); if (!raw) return null;
      const o = JSON.parse(raw); if (o.caseId !== this.baseline.project.caseId) return null;
      const r = this.importDraft({ recipe: { from: o.from, scope: o.scope, ops: o.ops, locks: o.locks } });
      if (!r.ok) { localStorage.removeItem(PERSIST_KEY); return null; }
      this.setScenario('reference');
      return this.draftInfo();
    } catch { return null; }
  }

  // ================================================================ view state (not the model)
  layerOf(o) { return o.type === 'tree' ? 'siteveg.trees' : o.layer; }
  layerVisible(id) {
    if (this.view.mode === 'terrain' && !TERRAIN_VISIBLE.has(id) && !(id || '').startsWith('analysis')) return false;
    if (this.view.mode === 'terrain' && id === 'topo.contours') return true;
    if (this.view.hidePlanting && PLANTING_LAYERS.has(id)) return false;
    let l = this.layers.get(id);
    while (l) { if (!this.layerState[l.id].visible) return false; l = l.parent ? this.layers.get(l.parent) : null; }
    return true;
  }
  layerLocked(id) {
    let l = this.layers.get(id);
    while (l) { if (this.layerState[l.id].locked) return true; l = l.parent ? this.layers.get(l.parent) : null; }
    return false;
  }
  setLayer(id, patch) {
    if (!this.layerState[id]) return false;
    const { external, ...p } = patch; Object.assign(this.layerState[id], p); this.emit('layers', { id, ...patch }); return true;
  }
  setViewState(patch) { Object.assign(this.view, patch); this.emit('layers', { view: true, external: true, ...patch }); }
  select(sel) {
    const same = JSON.stringify(sel) === JSON.stringify(this.selection);
    if (same) return;
    this.selection = sel; this.emit('selection', sel);
  }
  setHover(h) { if (JSON.stringify(h) === JSON.stringify(this.hover)) return; this.hover = h; this.emit('hover', h); }
}

const PERSIST_KEY = 'gp.workingDraft.v1';
// runtime layers: site trees separated from designed woody plants; bulb drifts as composition
const RUNTIME_LAYERS = [
  { id: 'siteveg', parent: null, name: 'Site vegetation', kind: 'group', order: 18.5, visible: true, locked: false, selectable: false, opacity: 1, status: 'available', runtime: true },
  { id: 'siteveg.trees', parent: 'siteveg', name: 'Existing tree canopy (NAIP)', kind: 'instances', order: 18.6, visible: true, locked: false, selectable: true, opacity: 1, status: 'available', runtime: true },
  { id: 'structure.bulbs', parent: 'structure', name: 'Bulb drifts / lines', kind: 'polygon', order: 16.5, visible: true, locked: false, selectable: true, opacity: 1, status: 'available', runtime: true },
];
const TERRAIN_VISIBLE = new Set(['topo', 'topo.surface', 'topo.contours', 'site', 'site.boundary']);
const PLANTING_LAYERS = new Set(['structure.patches', 'structure.bulbs', 'veg.trees', 'veg.shrubs', 'veg.grasses', 'veg.forbs', 'veg.bulbs']);

function cellKey(a, b) { return (a << 16) ^ (b & 0xffff); }
function summarize(c) { return { placementsAdded: c.added.slice(), placementsRemoved: c.removed.slice(), placementsModified: c.modified.slice(), instancesAdded: c.instancesAdded.slice(), instancesRemoved: c.instancesRemoved, instancesChanged: c.instancesChanged }; }
function compressRuns(a) { const out = []; for (let i = 0; i < a.length; i++) { const s = a[i]; while (i + 1 < a.length && a[i + 1] === a[i] + 1) i++; out.push(s === a[i] ? s : [s, a[i]]); } return out; }
// interior overlap test (edge contact alone is allowed: a patch may share a bed edge with a path).
// Exact: the area of A ∩ B (polygon-clipping, holes included) must exceed 1 cm². A bed that sits in a hole of the
// path polygon touches it and is allowed; a strip laid across a thin path overlaps it and is refused.
function areaOverlapsInterior(A, B) {
  const co = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  try { return areaOf({ type: 'MultiPolygon', coordinates: polygonClipping.intersection(co(A), co(B)) }) > 1e-4; } catch { return true; } // undecidable geometry: refuse, never guess
}
// distance between two geometries (for radius queries); 0 when they intersect
function geomDistanceFast(A, B) {
  if (intersects(A, B)) return 0;
  let d = Infinity;
  const verts = (g) => [...pointsOf(g), ...polysOf(g).flat().flat(), ...(g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.flat() : [])];
  for (const v of verts(A)) d = Math.min(d, distToGeom(B, v[0], v[1]));
  for (const v of verts(B)) d = Math.min(d, distToGeom(A, v[0], v[1]));
  return d;
}

export function speciesLayer(sp) {
  const t = sp.plantType;
  if (t === 'tree') return 'veg.trees';
  if (t === 'shrub') return 'veg.shrubs';
  if (t === 'grass' || t === 'sedge') return 'veg.grasses';
  if (t === 'bulb') return 'veg.bulbs';
  return 'veg.forbs';
}
export function placementLayer(p) {
  if ((p.role || '').startsWith('bulb')) return 'structure.bulbs';
  return 'structure.patches';
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
