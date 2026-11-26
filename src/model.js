// Canonical model store: one source of truth for the 2D plan, the 3D scene and any future AI client.
// Geometry is in local metres (x east, y north). Nothing here knows about rendering.

const STRIDE = 16;

export class Emitter {
  constructor() { this._h = {}; }
  on(ev, fn) { (this._h[ev] ||= []).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { this._h[ev] = (this._h[ev] || []).filter((f) => f !== fn); }
  emit(ev, data) { (this._h[ev] || []).forEach((f) => f(data)); }
}

// ---------------------------------------------------------------- geometry helpers
export function ringContains(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function polyContains(geom, x, y) {
  if (!geom) return false;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const p of polys) {
    if (ringContains(p[0], x, y)) {
      let hole = false;
      for (let k = 1; k < p.length; k++) if (ringContains(p[k], x, y)) { hole = true; break; }
      if (!hole) return true;
    }
  }
  return false;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}
export function distToGeom(geom, x, y) {
  if (!geom) return Infinity;
  if (geom.type === 'Point') return Math.hypot(geom.coordinates[0] - x, geom.coordinates[1] - y);
  if ((geom.type === 'Polygon' || geom.type === 'MultiPolygon') && polyContains(geom, x, y)) return 0;
  let best = Infinity;
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() :
    geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates :
    geom.type === 'MultiPoint' ? geom.coordinates.map((c) => [c, c]) : [];
  for (const r of rings) for (let i = 0; i < r.length - 1; i++) best = Math.min(best, segDist(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  return best;
}
export function bboxOf(geom) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') { b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]); }
    else c.forEach(walk);
  };
  if (geom) walk(geom.coordinates);
  return b;
}
export function areaOfRing(r) { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
export function centroidOf(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return geom.coordinates.slice();
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : null;
  if (!polys) { const b = bboxOf(geom); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
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

// ---------------------------------------------------------------- store
export class ModelStore extends Emitter {
  static async load(base) {
    const [model, instBuf, terrBuf] = await Promise.all([
      fetch(base + 'model.json').then((r) => { if (!r.ok) throw new Error('model.json ' + r.status); return r.json(); }),
      fetch(base + 'instances.bin').then((r) => r.arrayBuffer()),
      fetch(base + 'terrain.bin').then((r) => r.arrayBuffer()),
    ]);
    return new ModelStore(model, instBuf, terrBuf);
  }

  constructor(model, instBuf, terrBuf) {
    super();
    this.baseline = deepFreeze(model);
    this.model = model; // working view = baseline until a draft exists
    this.draft = null;
    this.instView = new DataView(instBuf);
    this.instanceCount = instBuf.byteLength / STRIDE;
    const ef = model.fields.find((f) => f.id === 'field.elevation');
    this.terrain = { meta: ef, data: new Int16Array(terrBuf) };
    this._index();
    // layer state is UI state shared by every view
    this.layerState = {};
    for (const l of model.layers) this.layerState[l.id] = { visible: l.visible, locked: l.locked, opacity: l.opacity };
    this.selection = null; // {kind:'object'|'placement'|'instance'|'point', id, ...}
    this.hover = null;
  }

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
    this.layers = new Map(m.layers.map((l) => [l.id, l]));
    // instance spatial hash (2 m cells)
    this._grid = new Map();
    for (let i = 0; i < this.instanceCount; i++) {
      const x = this.ix(i), y = this.iy(i);
      const k = (Math.floor(x / 2) << 16) ^ (Math.floor(y / 2) & 0xffff);
      if (!this._grid.has(k)) this._grid.set(k, []);
      this._grid.get(k).push(i);
    }
  }

  // ---- instances
  ix(i) { return this.instView.getFloat32(i * STRIDE, true); }
  iy(i) { return this.instView.getFloat32(i * STRIDE + 4, true); }
  isp(i) { return this.instView.getUint16(i * STRIDE + 8, true); }
  ipl(i) { const v = this.instView.getUint16(i * STRIDE + 10, true); return v === 65535 ? -1 : v; }
  iscale(i) { return this.instView.getUint8(i * STRIDE + 12) / 100; }
  irot(i) { return (this.instView.getUint8(i * STRIDE + 13) / 255) * Math.PI * 2; }
  instanceRecord(i) {
    const sp = this.speciesByIndex[this.isp(i)];
    const pl = this.placementByIndex[this.ipl(i)];
    return {
      id: 'pi.' + i, type: 'plantInstance', speciesId: sp.id, placementId: pl ? pl.id : null,
      bedId: pl ? pl.bedId || null : null, recipeId: pl ? pl.recipeId : null,
      position: [+this.ix(i).toFixed(3), +this.iy(i).toFixed(3)], elevation: this.sampleElevation(this.ix(i), this.iy(i)),
      assetId: sp.formProxy, scale: this.iscale(i), sizeState: 'nominal (not measured)',
      positionSource: pl ? pl.positionSource : 'digitised', sampled: true,
      status: pl ? pl.status : 'reconstructed', dataKind: pl ? pl.dataKind : 'inferred',
    };
  }
  nearestInstance(x, y, r = 0.5, filter) {
    let best = -1, bd = r;
    const gx = Math.floor(x / 2), gy = Math.floor(y / 2);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gy - 1; b <= gy + 1; b++) {
      const arr = this._grid.get((a << 16) ^ (b & 0xffff));
      if (!arr) continue;
      for (const i of arr) {
        if (filter && !filter(i)) continue;
        const d = Math.hypot(this.ix(i) - x, this.iy(i) - y);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }

  // ---- terrain
  sampleElevation(x, y) {
    const m = this.terrain.meta;
    const fx = (x - m.origin[0]) / m.cellSize, fy = (y - m.origin[1]) / m.cellSize;
    if (fx < 0 || fy < 0 || fx > m.cols - 1 || fy > m.rows - 1) return null;
    const x0 = Math.min(m.cols - 2, Math.floor(fx)), y0 = Math.min(m.rows - 2, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0;
    const d = this.terrain.data;
    const g = (c, r) => d[r * m.cols + c];
    const v = [g(x0, y0), g(x0 + 1, y0), g(x0, y0 + 1), g(x0 + 1, y0 + 1)];
    if (v.some((q) => q === -32768)) return null;
    const z = (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
    return m.datumZ + z / 100;
  }
  // derived contour lines (marching squares on the 3DEP grid); cached per interval
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
    if (id && id.startsWith('pi.')) { const i = +id.slice(3); return i >= 0 && i < this.instanceCount ? this.instanceRecord(i) : null; }
    const e = this.byId.get(id);
    return e ? e.rec : null;
  }
  kindOf(id) { if (id && id.startsWith('pi.')) return 'instance'; const e = this.byId.get(id); return e ? e.kind : null; }
  getBedAt(x, y) {
    for (const b of this.beds) {
      const bb = this.bedBoxes.get(b.id);
      if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue;
      if (polyContains(b.geometry, x, y)) return b;
    }
    return null;
  }
  placementGeom(p) {
    if (p.geometry) return p.geometry;
    if (p.geometryRef) { const o = this.getObject(p.geometryRef); return o ? o.geometry : null; }
    return null;
  }
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
      else if (polyContains(g, x, y)) out.push(p);
    }
    // most specific first: points, then small areas, then matrix
    out.sort((a, b) => rank(a) - rank(b));
    return out;
    function rank(p) { const g = p.geometry; if (g && g.type === 'Point') return 0; if (p.role === 'matrix' || p.role === 'meadow') return 3; return 1 + (p.areaM2 || 0) / 1e4; }
  }
  queryObjects(geometry, filters = {}) {
    // geometry: {type:'Point',coordinates:[x,y], radius} | {type:'Polygon',...} | {bbox:[x0,y0,x1,y1]}
    const test = (g) => {
      if (!g) return false;
      if (geometry.bbox) { const b = bboxOf(g); const q = geometry.bbox; return !(b[2] < q[0] || b[0] > q[2] || b[3] < q[1] || b[1] > q[3]); }
      if (geometry.type === 'Point') return distToGeom(g, geometry.coordinates[0], geometry.coordinates[1]) <= (geometry.radius || 0);
      if (geometry.type === 'Polygon') { const c = centroidOf(g); return c && polyContains(geometry, c[0], c[1]); }
      return false;
    };
    const res = [];
    const pool = filters.collection === 'placements' ? this.model.placements : this.model.objects;
    for (const o of pool) {
      if (filters.type && o.type !== filters.type) continue;
      if (filters.layer && o.layer !== filters.layer) continue;
      if (filters.style && !(o.props && o.props.style === filters.style)) continue;
      if (filters.role && o.role !== filters.role) continue;
      if (filters.speciesId && !(o.speciesIds || []).includes(filters.speciesId)) continue;
      if (test(o.geometry || this.placementGeom(o))) res.push(o);
    }
    return res;
  }
  distanceToPath(x, y) {
    let best = Infinity;
    for (const id of ['built.gravel-walks', 'built.grass-walks', 'context.sidewalks']) {
      const o = this.getObject(id); if (o) best = Math.min(best, distToGeom(o.geometry, x, y));
    }
    return best;
  }
  sampleConditions(x, y) {
    const f = (id) => this.model.fields.find((q) => q.id === id);
    const out = { x: +x.toFixed(3), y: +y.toFixed(3) };
    const e = this.sampleElevation(x, y);
    out['field.elevation'] = { value: e == null ? null : +e.toFixed(2), units: 'm NAVD88', status: e == null ? 'unknown' : 'source' };
    const s = this.sampleSlope(x, y);
    out['field.slope'] = { value: s == null ? null : +s.toFixed(1), units: 'deg', status: s == null ? 'unknown' : 'derived' };
    const dp = this.distanceToPath(x, y);
    out['field.distance-to-path'] = { value: isFinite(dp) ? +dp.toFixed(2) : null, units: 'm', status: 'derived' };
    for (const id of ['field.sun', 'field.moisture', 'field.ph']) out[id] = { value: null, units: f(id).units, status: 'unknown', note: f(id).note };
    const bed = this.getBedAt(x, y);
    out.bedId = bed ? bed.id : null;
    out.placements = this.getPlacementsAt(x, y, { includeBulbs: true }).map((p) => p.id);
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
    const recipe = placements[0] ? this.getObject(placements[0].recipeId) : bed ? null : null;
    const speciesIds = [...new Set(placements.flatMap((p) => p.speciesIds || []))];
    const byRole = {};
    for (const p of placements) { byRole[p.role] = (byRole[p.role] || 0) + 1; }
    const c = bed ? centroidOf(bed.geometry) : null;
    return {
      id, kind, bedId: bed ? bed.id : null, style: bed && bed.props ? bed.props.style : null,
      recipeId: recipe ? recipe.id : null, placementCount: placements.length, placementsByRole: byRole,
      species: speciesIds.map((s) => { const r = this.getObject(s); return { id: s, name: r.canonicalKey, type: r.plantType }; }),
      conditionsAtCentroid: c ? this.sampleConditions(c[0], c[1]) : null,
    };
  }

  // ---- drafts: never mutate the baseline
  applyPatch(ops) {
    if (!this.draft) this.draft = { ops: [], model: structuredClone(this.baseline) };
    const m = this.draft.model;
    const find = (id) => m.objects.find((o) => o.id === id) || m.placements.find((p) => p.id === id);
    for (const op of ops) {
      const t = find(op.target);
      if (op.op === 'set') { if (!t) throw new Error('no target ' + op.target); setPath(t, op.path, op.value); }
      else if (op.op === 'remove') { if (!t) throw new Error('no target ' + op.target); t._removed = true; }
      else if (op.op === 'add') { (op.collection === 'placements' ? m.placements : m.objects).push(op.value); }
      else throw new Error('unknown op ' + op.op);
      this.draft.ops.push(op);
    }
    this.model = m; this._index();
    this.emit('model', { draft: true });
    return { ops: this.draft.ops.length };
  }
  resetDraft() { this.draft = null; this.model = this.baseline; this._index(); this.emit('model', { draft: false }); }
  exportModel({ draft = false } = {}) { return JSON.stringify(draft && this.draft ? this.draft.model : this.baseline); }
  diffDraft() { return this.draft ? this.draft.ops.slice() : []; }

  // ---- layer + selection state
  layerVisible(id) {
    let l = this.layers.get(id);
    while (l) { if (!this.layerState[l.id].visible) return false; l = l.parent ? this.layers.get(l.parent) : null; }
    return true;
  }
  layerLocked(id) {
    let l = this.layers.get(id);
    while (l) { if (this.layerState[l.id].locked) return true; l = l.parent ? this.layers.get(l.parent) : null; }
    return false;
  }
  setLayer(id, patch) { const { external, ...p } = patch; Object.assign(this.layerState[id], p); this.emit('layers', { id, ...patch }); }
  select(sel) {
    const same = JSON.stringify(sel) === JSON.stringify(this.selection);
    if (same) return;
    this.selection = sel; this.emit('selection', sel);
  }
  setHover(h) { if (JSON.stringify(h) === JSON.stringify(this.hover)) return; this.hover = h; this.emit('hover', h); }

  // which layer an instance belongs to
  instanceLayer(i) { return speciesLayer(this.speciesByIndex[this.isp(i)]); }
}

export function speciesLayer(sp) {
  const t = sp.plantType;
  if (t === 'tree') return 'veg.trees';
  if (t === 'shrub') return 'veg.shrubs';
  if (t === 'grass' || t === 'sedge') return 'veg.grasses';
  if (t === 'bulb') return 'veg.bulbs';
  return 'veg.forbs';
}
export function placementLayer(p, model) {
  if ((p.role || '').startsWith('bulb')) return 'veg.bulbs';
  return 'structure.patches';
}

function setPath(o, path, v) {
  const ks = path.split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]] ||= {};
  t[ks[ks.length - 1]] = v;
}
function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
