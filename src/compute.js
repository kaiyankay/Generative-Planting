// Computational Space: the site as a space that can be sampled, queried, overlaid and classified.
//
// Five model levels, bottom to top (data relations, not pages):
//   1 base site            terrain (3DEP) + structures, paths, water           -> ModelStore baseline objects + terrain
//   2 planting framework   the real bed outlines (ids, areas, coordinates)      -> baseline objects of type 'bed'
//   3 environmental fields elevation, slope, distances, tree crowns, unknowns   -> FIELDS below (site properties)
//   4 computational space  lattice, bed domains, distributions, zones          -> this module
//   5 planting design      reference / working placements and plant symbols    -> ModelStore scenarios
// Levels 1–4 never read level 5: with every bed empty the space computes exactly the same.
//
// Lattice: one grid for the whole site, aligned with the DEM (a cell centre is a 3DEP sample point, 1 m cells).
// Domain:  the cells of one or more beds. Each cell is clipped to its bed (exact area) and keeps the bed id; a cell
//          that straddles two beds is two cell parts, one per bed. Bed outlines are never changed.
// Fields:  sampled at each cell part's representative point (the centroid of the part inside the bed).
// Zones:   cells classified by configurable thresholds on one or more fields, merged per bed and clipped back to
//          the bed outline (vector), so the zones of a bed tile it exactly and every zone carries its bed id.
//          A field whose range inside a bed is below the field's accuracy does not split that bed.

import polygonClipping from '../vendor/polygon-clipping/polygon-clipping.esm.js';
import { pointInGeom, pointInPoly, polysOf, linesOf, pointsOf, bboxOf, intersects, within, validateGeometry, segDist, areaOf } from './geom.js';

export const CS_VERSION = '0.1';

const FALLBACK_CONFIG = {
  lattice: { alignTo: 'field.elevation', cellSizeM: 1, minCellSizeM: 1 },
  fields: {
    'field.elevation': { name: 'Elevation', short: 'Elevation', units: 'm', decimals: 2, status: 'source', dataKind: 'source', source: 'S-3DEP', tolerance: 0.1 },
    'field.slope': { name: 'Slope', short: 'Slope', units: '°', decimals: 1, status: 'derived', dataKind: 'inferred', source: 'S-3DEP', baselineM: 2, tolerance: 1.5 },
    'field.distance-to-path': { name: 'Distance to path', short: 'To path', units: 'm', decimals: 1, status: 'derived', dataKind: 'inferred', source: 'S-OSM', tolerance: 0.5 },
    'field.distance-to-edge': { name: 'Distance to bed edge', short: 'To bed edge', units: 'm', decimals: 1, status: 'derived', dataKind: 'inferred', source: 'S-OSM', tolerance: 0.5 },
    'field.distance-to-obstacle': { name: 'Distance to wall or structure', short: 'To wall / structure', units: 'm', decimals: 1, status: 'derived', dataKind: 'inferred', source: 'S-OSM', layers: ['built.walls', 'built.structures'], tolerance: 0.5 },
    'field.canopy': { name: 'Existing tree crown above', short: 'Tree crown', units: null, decimals: 0, status: 'derived', dataKind: 'inferred', source: 'S-NAIP', categorical: true, classes: [{ value: 0, label: 'open' }, { value: 1, label: 'under a tree crown' }], tolerance: 0 },
    'field.sun': { name: 'Sun / shade', short: 'Sun / shade', units: null, status: 'unknown', dataKind: null },
    'field.moisture': { name: 'Soil moisture', short: 'Soil moisture', units: null, status: 'unknown', dataKind: null },
    'field.ph': { name: 'Soil pH', short: 'Soil pH', units: 'pH', status: 'unknown', dataKind: null },
  },
  hypothetical: {},
  experiments: { twoConditions: [{ field: 'field.slope', breaks: [2] }, { field: 'field.distance-to-path', breaks: [1.5] }] },
};
const MAX_RULES = 4;
const MAX_BREAKS = 6;

export class ComputeSpace {
  constructor(store, config = null) {
    this.s = store;
    this.config = config && config.fields ? config : FALLBACK_CONFIG;
    const m = store.terrain.meta;
    const L = this.config.lattice || {};
    // the lattice: cell (c, r) is centred on DEM node (c, r) when cellSize = the DEM cell size
    this.lattice = { ox: m.origin[0], oy: m.origin[1], cellSize: L.cellSizeM || m.cellSize, minCellSize: Math.max(L.minCellSizeM || 0, m.cellSize), alignedTo: L.alignTo || 'field.elevation', crs: store.baseline.project.coordinateSystem ? store.baseline.project.coordinateSystem.id : 'local' };
    this.fieldDefs = new Map();
    for (const [id, d] of Object.entries(this.config.fields)) this.fieldDefs.set(id, { id, ...d, hypothetical: false });
    this._domains = new Map(); // `${bedId}@${cs}` (+ region hash) -> bed domain
    this._pathIdx = new SegIndex(store.pathObjects().map((o) => o.geometry));
    const obsLayers = new Set((this.fieldDefs.get('field.distance-to-obstacle') || {}).layers || ['built.walls', 'built.structures']);
    this._obstacles = store.baseline.objects.filter((o) => obsLayers.has(o.layer) && o.geometry);
    this._obsIdx = new SegIndex(this._obstacles.map((o) => o.geometry));
    this._trees = store.baseline.objects.filter((o) => o.type === 'tree' && o.geometry && o.geometry.type === 'Point').map((o) => ({ id: o.id, x: o.geometry.coordinates[0], y: o.geometry.coordinates[1], r: (o.props && o.props.crownRadiusM) || 0 }));
    const blockL = new Set(store.caseCfg.nonPlantableLayers || ['built.paths', 'built.walks', 'site.water', 'site.context', 'built.structures']);
    this._blockers = store.baseline.objects.filter((o) => blockL.has(o.layer) && o.geometry && polysOf(o.geometry).length).map((o) => ({ id: o.id, g: o.geometry, bb: bboxOf(o.geometry) }));
    this._edgeIdx = new Map();
    for (const [id, d] of Object.entries(this.config.hypothetical || {})) if (d.method === 'relative-elevation-inverse') this._registerBuiltinHypothetical(id, d);
    this.current = null;      // the latest classification (zones)
    this.display = { mode: null, field: null, scope: [] }; // what the canvas shows (view state)
    this.revision = 0;
  }

  // ================================================================ levels, fields, scope
  levels() {
    const s = this.s; const units = this.designBeds();
    const d = s.draftInfo();
    return {
      baseSite: { terrain: { source: 'S-3DEP', cellSizeM: s.terrain.meta.cellSize, cols: s.terrain.meta.cols, rows: s.terrain.meta.rows, zMin: s.terrain.meta.zMin, zMax: s.terrain.meta.zMax }, structures: s.baseline.objects.filter((o) => (o.layer || '').startsWith('built.')).length, paths: s.pathObjects().length, ok: s.terrain.data.length > 0 },
      framework: { beds: s.baseline.objects.filter((o) => o.type === 'bed').length, mainBeds: s.baseline.objects.filter((o) => o.type === 'bed' && 'ABC'.includes(o.props.style)).length, designBeds: units.length, designAreaM2: round(units.reduce((a, b) => a + areaOf(b.geometry), 0), 1), ok: units.length > 0 },
      fields: [...this.fieldDefs.values()].map((f) => ({ id: f.id, name: f.name, status: f.status, hypothetical: f.hypothetical })),
      computation: { version: CS_VERSION, lattice: { ...this.lattice }, cachedDomains: this._domains.size, current: this.current ? this.current.id : null, readsPlanting: false, ok: true },
      design: { scenario: s.scenario, placements: s.model.placements.length, liveInstances: s.liveCount, draft: d ? { from: d.from, scope: d.scope } : null },
    };
  }
  fields() { return [...this.fieldDefs.values()].map((f) => ({ ...f, sample: undefined })); }
  field(id) { return this.fieldDefs.get(id) || null; }
  designBeds() { const s = this.s; return s.plantingUnits().filter((u) => u.type === 'bed'); }
  // 'bed.B1' | ['bed.B1', 'bed.A1'] | 'all' (every bed open to design) | 'main' (the 15 A/B/C beds) | { bedIds } | { geometry }
  resolveScope(scope) {
    const beds = this.designBeds(); const byId = new Map(beds.map((b) => [b.id, b]));
    let ids = null, region = null;
    if (scope === 'all' || scope === 'design') ids = beds.map((b) => b.id);
    else if (scope === 'main') ids = beds.filter((b) => 'ABC'.includes(b.props.style)).map((b) => b.id);
    else if (typeof scope === 'string') ids = [scope];
    else if (Array.isArray(scope)) ids = scope.slice();
    else if (scope && Array.isArray(scope.bedIds)) ids = scope.bedIds.slice();
    else if (scope && scope.geometry) {
      const v = validateGeometry(scope.geometry); if (!v.ok) return { ok: false, error: 'scope geometry: ' + v.error };
      if (!polysOf(scope.geometry).length) return { ok: false, error: 'scope geometry must be a (Multi)Polygon' };
      region = scope.geometry; ids = beds.filter((b) => intersects(b.geometry, region)).map((b) => b.id);
    }
    if (!ids) return { ok: false, error: "scope must be a bed id, a list of bed ids, 'all', 'main', {bedIds} or {geometry}" };
    ids = [...new Set(ids)];
    const bad = ids.filter((id) => !byId.has(id));
    if (bad.length) return { ok: false, error: 'not a bed open to design: ' + bad.join(', ') };
    if (!ids.length) return { ok: false, error: 'the scope contains no design bed' };
    return { ok: true, bedIds: ids, region, beds: ids.map((id) => byId.get(id)) };
  }
  _cellSize(v) {
    const cs = v == null ? this.lattice.cellSize : +v;
    if (!(cs > 0) || !Number.isFinite(cs)) return { error: 'cellSize must be a positive number of metres' };
    if (cs < this.lattice.minCellSize - 1e-9) return { error: `cellSize ${cs} m is finer than the terrain data (${this.lattice.minCellSize} m): refused, a finer grid would suggest a precision the sources do not have` };
    if (Math.abs(cs / this.lattice.minCellSize - Math.round(cs / this.lattice.minCellSize)) > 1e-9) return { error: `cellSize must be a whole multiple of ${this.lattice.minCellSize} m so cells stay aligned with the DEM` };
    return { cs };
  }

  // ================================================================ domains (one per bed, cached; beds never change)
  _bedDomain(bed, cs, region) {
    const key = bed.id + '@' + cs + (region ? '#' + hashStr(JSON.stringify(region.coordinates)) : '');
    if (this._domains.has(key)) return this._domains.get(key);
    let geom = bed.geometry;
    if (region) {
      const inter = polygonClipping.intersection(coordsOf(bed.geometry), coordsOf(region));
      geom = { type: 'MultiPolygon', coordinates: inter };
    }
    const { ox, oy } = this.lattice;
    const bb = bboxOf(geom);
    const c0 = Math.floor((bb[0] - ox) / cs + 0.5), c1 = Math.floor((bb[2] - ox) / cs + 0.5);
    const r0 = Math.floor((bb[1] - oy) / cs + 0.5), r1 = Math.floor((bb[3] - oy) / cs + 0.5);
    const polys = polysOf(geom); const rings = polys.flat();
    // 1 · boundary cells: every cell a bed edge passes through (grid traversal); only these are clipped
    const edge = new Set();
    for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) traverse(ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1], ox, oy, cs, (a, b) => edge.add(cellKey(a, b)));
    const C = [], R = [], X = [], Y = [], A = [];
    for (let r = r0; r <= r1; r++) {
      // 2 · whole cells: in or out by the even–odd rule on the row's centre line (no edge crosses them)
      const yc = oy + r * cs; const xs = [];
      for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) { const a = ring[i], b = ring[i + 1]; if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + ((yc - a[1]) * (b[0] - a[0])) / (b[1] - a[1])); }
      xs.sort((p, q) => p - q);
      for (let c = c0; c <= c1; c++) {
        const x0 = ox + (c - 0.5) * cs, x1 = x0 + cs, y0 = yc - 0.5 * cs, y1 = y0 + cs;
        if (!edge.has(cellKey(c, r))) {
          const xc = ox + c * cs; let k = 0; while (k < xs.length && xs[k] < xc) k++;
          if (k % 2 === 1) { C.push(c); R.push(r); X.push(xc); Y.push(yc); A.push(cs * cs); }
          continue;
        }
        // 3 · boundary cell: clip the bed to the square (exact area, centroid of the part inside)
        let a = 0, mx = 0, my = 0;
        for (const p of polys) p.forEach((ring, k) => {
          const q = clipRing(ring, x0, y0, x1, y1); if (q.length < 3) return;
          const m = ringMoments(q); // S–H keeps the ring's orientation: outer adds, hole subtracts, whatever the winding
          const aa = Math.abs(m.a) * (k === 0 ? 1 : -1); a += aa; mx += m.cx * aa; my += m.cy * aa;
        });
        if (a < 1e-7 * cs * cs) continue;
        let px = mx / a, py = my / a;
        if (!pointInGeom(geom, px, py)) { // concave part: centroid fell outside, take an inside sub-point
          let found = false;
          for (let i = 1; i <= 5 && !found; i += 2) for (let j = 1; j <= 5 && !found; j += 2) { const tx = x0 + (i / 6) * cs, ty = y0 + (j / 6) * cs; if (pointInGeom(geom, tx, ty)) { px = tx; py = ty; found = true; } }
        }
        C.push(c); R.push(r); X.push(px); Y.push(py); A.push(Math.min(a, cs * cs));
      }
    }
    const n = C.length;
    const d = { key, bedId: bed.id, style: bed.props.style, geom, region: !!region, cs, n, c: Int32Array.from(C), r: Int32Array.from(R), x: Float64Array.from(X), y: Float64Array.from(Y), area: Float64Array.from(A), values: {}, plantable: null, edgeCells: edge.size };
    d.index = new Map(); for (let i = 0; i < n; i++) d.index.set(cellKey(d.c[i], d.r[i]), i);
    d.areaM2 = d.area.reduce((s, v) => s + v, 0);
    // non-plantable objects inside this bed (boardwalk, swale…), cut to the bed once
    d.blockers = [];
    for (const b of this._blockers) {
      if (!bboxTouch(b.bb, bb)) continue;
      const inter = polygonClipping.intersection(coordsOf(geom), coordsOf(b.g));
      const g = { type: 'MultiPolygon', coordinates: inter };
      if (inter.length && areaOf(g) > 1e-6) d.blockers.push({ id: b.id, g, bb: bboxOf(g) });
    }
    d.plantable = new Uint8Array(n);
    for (let i = 0; i < n; i++) d.plantable[i] = d.blockers.some((b) => d.x[i] >= b.bb[0] && d.x[i] <= b.bb[2] && d.y[i] >= b.bb[1] && d.y[i] <= b.bb[3] && pointInGeom(b.g, d.x[i], d.y[i])) ? 0 : 1;
    this._domains.set(key, d);
    return d;
  }
  _values(d, fid) {
    if (d.values[fid]) return d.values[fid];
    const f = this.fieldDefs.get(fid); const v = new Float64Array(d.n);
    for (let i = 0; i < d.n; i++) { const q = this._sampleField(f, d.x[i], d.y[i], d.bedId); v[i] = q == null ? NaN : q; }
    return (d.values[fid] = v);
  }
  domain(scope, { cellSize } = {}) {
    const sc = this.resolveScope(scope); if (!sc.ok) return sc;
    const cz = this._cellSize(cellSize); if (cz.error) return { ok: false, error: cz.error };
    const t0 = now();
    const parts = sc.beds.map((b) => this._bedDomain(b, cz.cs, sc.region));
    return {
      ok: true, scope: { bedIds: sc.bedIds, region: !!sc.region }, cellSize: cz.cs, lattice: { ...this.lattice, cellSize: cz.cs },
      areaM2: round(parts.reduce((a, d) => a + d.areaM2, 0), 3), cells: parts.reduce((a, d) => a + d.n, 0),
      wholeCells: parts.reduce((a, d) => a + d.area.filter((v) => v > cz.cs * cz.cs - 1e-6).length, 0),
      plantableAreaM2: round(parts.reduce((a, d) => a + d.area.reduce((s, v, i) => s + (d.plantable[i] ? v : 0), 0), 0), 3),
      byBed: parts.map((d) => ({ bedId: d.bedId, cells: d.n, areaM2: round(d.areaM2, 3), bedAreaM2: round(areaOf(this.s.getObject(d.bedId)?.geometry || d.geom), 3) })),
      ms: round(now() - t0, 1),
    };
  }
  // every cell of the scope as plain records (for clients that want the raw lattice)
  cells(scope, { cellSize, fields, limit = 20000 } = {}) {
    const sc = this.resolveScope(scope); if (!sc.ok) return sc;
    const cz = this._cellSize(cellSize); if (cz.error) return { ok: false, error: cz.error };
    const fids = fields || this._knownFieldIds();
    const out = [];
    for (const b of sc.beds) {
      const d = this._bedDomain(b, cz.cs, sc.region); const vals = fids.map((f) => [f, this.fieldDefs.has(f) ? this._values(d, f) : null]);
      for (let i = 0; i < d.n && out.length < limit; i++) {
        const v = {}; for (const [f, arr] of vals) v[f] = arr && !Number.isNaN(arr[i]) ? round(arr[i], 3) : null;
        out.push({ bedId: d.bedId, c: d.c[i], r: d.r[i], x: round(d.x[i], 3), y: round(d.y[i], 3), areaM2: round(d.area[i], 4), plantable: !!d.plantable[i], values: v });
      }
    }
    return { ok: true, cellSize: cz.cs, count: out.length, truncated: out.length >= limit, cells: out };
  }
  _knownFieldIds() { return [...this.fieldDefs.values()].filter((f) => f.status !== 'unknown').map((f) => f.id); }

  // ================================================================ field samplers (site properties only)
  _sampleField(f, x, y, bedId) {
    if (!f) return null;
    if (f.status === 'unknown') return null;
    if (f.hypothetical) return f.sample(x, y, { store: this.s, space: this, bedId });
    const s = this.s;
    switch (f.id) {
      case 'field.elevation': return s.sampleElevation(x, y);
      case 'field.slope': {
        const h = (f.baselineM || 2) / 2;
        const a = s.sampleElevation(x - h, y), b = s.sampleElevation(x + h, y), c = s.sampleElevation(x, y - h), d = s.sampleElevation(x, y + h);
        if ([a, b, c, d].some((v) => v == null)) return null;
        return (Math.atan(Math.hypot((b - a) / (2 * h), (d - c) / (2 * h))) * 180) / Math.PI;
      }
      case 'field.distance-to-path': { if (s.sampleElevation(x, y) == null) return null; const v = this._pathIdx.dist(x, y); return Number.isFinite(v) ? v : null; }
      case 'field.distance-to-edge': {
        const bed = bedId ? s.getObject(bedId) : s.getBedAt(x, y); if (!bed) return null;
        let idx = this._edgeIdx.get(bed.id); if (!idx) this._edgeIdx.set(bed.id, (idx = new SegIndex([ringsAsLines(bed.geometry)], 2)));
        return idx.dist(x, y);
      }
      case 'field.distance-to-obstacle': { const v = this._obsIdx.dist(x, y); return Number.isFinite(v) ? v : null; }
      case 'field.canopy': { for (const t of this._trees) if ((t.x - x) ** 2 + (t.y - y) ** 2 <= t.r * t.r) return 1; return 0; }
      default: return null;
    }
  }
  // exact value of every field at a point (not the cell value)
  _pointValues(x, y, bedId, fids = [...this.fieldDefs.keys()]) {
    const out = {};
    for (const fid of fids) { const f = this.fieldDefs.get(fid); const v = this._sampleField(f, x, y, bedId); out[fid] = v == null ? null : round(v, 4); }
    return out;
  }
  // hypothetical scenario fields: clearly flagged, never described as site data
  registerHypotheticalField(def) {
    if (!def || typeof def.id !== 'string' || !/^hyp\.[a-z0-9-]{1,40}$/.test(def.id)) return { ok: false, error: "id must match hyp.[a-z0-9-] — hypothetical fields are kept apart from site fields" };
    if (typeof def.sample !== 'function') return { ok: false, error: 'sample(x, y, ctx) function required' };
    this.fieldDefs.set(def.id, { name: def.name || def.id, short: def.short || def.name || def.id, units: def.units || null, decimals: def.decimals ?? 2, tolerance: def.tolerance || 0, note: def.note || 'Hypothetical scenario: not measured, not site data.', ...def, status: 'hypothetical', dataKind: 'hypothetical', hypothetical: true });
    for (const d of this._domains.values()) delete d.values[def.id];
    return { ok: true, field: def.id };
  }
  unregisterField(id) {
    const f = this.fieldDefs.get(id); if (!f || !f.hypothetical) return { ok: false, error: 'only hypothetical fields can be removed' };
    this.fieldDefs.delete(id); for (const d of this._domains.values()) delete d.values[id];
    return { ok: true };
  }
  _registerBuiltinHypothetical(id, d) {
    let lo = null, hi = null;
    const range = () => {
      if (lo != null) return;
      lo = Infinity; hi = -Infinity;
      for (const b of this.designBeds()) { const dom = this._bedDomain(b, this.lattice.minCellSize); const v = this._values(dom, 'field.elevation'); for (const z of v) if (!Number.isNaN(z)) { lo = Math.min(lo, z); hi = Math.max(hi, z); } }
    };
    this.registerHypotheticalField({ id, name: d.name, short: d.short, units: d.units, decimals: d.decimals, tolerance: d.tolerance, note: d.note, method: d.method,
      sample: (x, y, ctx) => { const z = ctx.store.sampleElevation(x, y); if (z == null) return null; range(); return Math.max(0, Math.min(1, (hi - z) / Math.max(1e-6, hi - lo))); } });
  }

  // ================================================================ distribution over an area (not a centre point)
  distribution(scope, { fields, cellSize, bins = 8 } = {}) {
    const sc = this.resolveScope(scope); if (!sc.ok) return sc;
    const cz = this._cellSize(cellSize); if (cz.error) return { ok: false, error: cz.error };
    const fids = fields || [...this.fieldDefs.keys()];
    const unknownIds = fids.filter((f) => !this.fieldDefs.has(f)); if (unknownIds.length) return { ok: false, error: 'unknown field: ' + unknownIds.join(', ') };
    const t0 = now();
    const doms = sc.beds.map((b) => this._bedDomain(b, cz.cs, sc.region));
    const areaM2 = doms.reduce((a, d) => a + d.areaM2, 0);
    const out = {};
    for (const fid of fids) {
      const f = this.fieldDefs.get(fid);
      const W = [], V = []; let unk = 0; const byBed = {};
      for (const d of doms) {
        if (f.status === 'unknown') { unk += d.areaM2; byBed[d.bedId] = { known: false }; continue; }
        const v = this._values(d, fid); let lo = Infinity, hi = -Infinity, sw = 0, sv = 0;
        for (let i = 0; i < d.n; i++) { if (Number.isNaN(v[i])) { unk += d.area[i]; continue; } W.push(d.area[i]); V.push(v[i]); lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); sw += d.area[i]; sv += d.area[i] * v[i]; }
        byBed[d.bedId] = sw ? { min: round(lo, 4), max: round(hi, 4), mean: round(sv / sw, 4), range: round(hi - lo, 4), uniform: hi - lo < (f.tolerance || 0) } : { known: false };
      }
      out[fid] = summarizeField(f, W, V, unk, bins);
      out[fid].byBed = byBed;
    }
    return { ok: true, scope: { bedIds: sc.bedIds, region: !!sc.region }, cellSize: cz.cs, areaM2: round(areaM2, 3), cells: doms.reduce((a, d) => a + d.n, 0), fields: out, readsPlanting: false, ms: round(now() - t0, 1) };
  }

  // ================================================================ classification: overlay of conditions -> zones per bed
  /**
   * spec: { rules: [{ field, breaks: [t1, t2…], labels? }], cellSize?, minRegionM2? }
   *   each rule splits a field into half-open classes [-∞,t1) [t1,t2) … [tn,∞); unknown values -> class '?'
   *   zone key = the class of every rule, e.g. '0|1'; zones are per bed, merged and clipped to the bed outline.
   *   A bed whose range of a field is below that field's accuracy (tolerance) is not split by it: all its cells take
   *   the class of the bed's mean value. minRegionM2 (default 0 = off) merges smaller pieces into their neighbour.
   */
  classify(scope, spec = {}) {
    const t0 = now();
    const sc = this.resolveScope(scope); if (!sc.ok) return sc;
    const cz = this._cellSize(spec.cellSize); if (cz.error) return { ok: false, error: cz.error };
    const rulesIn = spec.rules || this.config.experiments.twoConditions;
    if (!Array.isArray(rulesIn) || !rulesIn.length) return { ok: false, error: 'rules: a non-empty list of { field, breaks }' };
    if (rulesIn.length > MAX_RULES) return { ok: false, error: `at most ${MAX_RULES} conditions at once` };
    const rules = [];
    for (const [k, r] of rulesIn.entries()) {
      const f = r && this.fieldDefs.get(r.field);
      if (!f) return { ok: false, error: `rule ${k}: unknown field ${r && r.field}` };
      const br = Array.isArray(r.breaks) ? r.breaks.map(Number) : [Number(r.breaks)];
      if (f.status !== 'unknown' && (!br.length || br.length > MAX_BREAKS || br.some((v) => !Number.isFinite(v)))) return { ok: false, error: `rule ${k}: breaks must be 1–${MAX_BREAKS} finite numbers` };
      const breaks = [...new Set(br)].sort((a, b) => a - b);
      const labels = Array.isArray(r.labels) && r.labels.length === breaks.length + 1 ? r.labels.map(String) : autoLabels(f, breaks);
      rules.push({ field: f.id, name: f.name, short: f.short || f.name, units: f.units, status: f.status, dataKind: f.dataKind, hypothetical: !!f.hypothetical, tolerance: f.tolerance || 0, breaks, labels, uniformIn: [], uncertainAreaM2: 0, unknownAreaM2: 0 });
    }
    const minRegion = Math.max(0, +spec.minRegionM2 || 0);
    const zones = []; const perKey = new Map(); let smoothed = 0; let scopeArea = 0;
    for (const b of sc.beds) {
      const d = this._bedDomain(b, cz.cs, sc.region); scopeArea += d.areaM2;
      const keys = new Array(d.n);
      const cls = rules.map((rule) => {
        const f = this.fieldDefs.get(rule.field); const out = new Array(d.n);
        if (f.status === 'unknown') { out.fill('?'); rule.unknownAreaM2 += d.areaM2; return out; }
        const v = this._values(d, rule.field);
        let lo = Infinity, hi = -Infinity, sw = 0, sv = 0;
        for (let i = 0; i < d.n; i++) if (!Number.isNaN(v[i])) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); sw += d.area[i]; sv += d.area[i] * v[i]; }
        const uniform = sw > 0 && hi - lo < rule.tolerance;
        if (uniform) rule.uniformIn.push(d.bedId);
        const bedClass = sw > 0 ? classOf(sv / sw, rule.breaks) : '?';
        for (let i = 0; i < d.n; i++) {
          if (Number.isNaN(v[i])) { out[i] = '?'; rule.unknownAreaM2 += d.area[i]; continue; }
          out[i] = uniform ? bedClass : classOf(v[i], rule.breaks);
          if (!uniform && rule.tolerance > 0 && rule.breaks.some((t) => Math.abs(v[i] - t) < rule.tolerance / 2)) rule.uncertainAreaM2 += d.area[i];
        }
        return out;
      });
      for (let i = 0; i < d.n; i++) keys[i] = cls.map((c) => c[i]).join('|');
      if (minRegion > 0) smoothed += mergeSmallRegions(d, keys, minRegion);
      // zones of this bed: merge cells per key, clip to the bed outline
      const byKey = new Map();
      for (let i = 0; i < d.n; i++) { let a = byKey.get(keys[i]); if (!a) byKey.set(keys[i], (a = [])); a.push(i); }
      for (const [key, idx] of [...byKey.entries()].sort((p, q) => (p[0] < q[0] ? -1 : 1))) {
        const traced = traceCells(idx.map((i) => [d.c[i], d.r[i]]), this.lattice.ox, this.lattice.oy, cz.cs);
        let coords = traced.length ? polygonClipping.intersection(coordsOf(d.geom), traced) : [];
        const geometry = { type: 'MultiPolygon', coordinates: coords };
        const area = areaOf(geometry);
        const cellArea = idx.reduce((a, i) => a + d.area[i], 0);
        const stats = {};
        for (const rule of rules) {
          if (rule.status === 'unknown') { stats[rule.field] = null; continue; }
          const v = this._values(d, rule.field); let lo = Infinity, hi = -Infinity, sw = 0, sv = 0;
          for (const i of idx) if (!Number.isNaN(v[i])) { lo = Math.min(lo, v[i]); hi = Math.max(hi, v[i]); sw += d.area[i]; sv += d.area[i] * v[i]; }
          stats[rule.field] = sw ? { min: round(lo, 3), max: round(hi, 3), mean: round(sv / sw, 3) } : null;
        }
        const parts = key.split('|');
        const label = parts.map((p, k) => (p === '?' ? `${rules[k].short}: no data` : rules[k].labels[+p])).join(' · ');
        const z = {
          id: `zone.${d.bedId.replace(/^bed\./, '')}.${parts.join('-').replace(/\?/g, 'u')}`, bedId: d.bedId, key, label,
          classes: parts.map((p, k) => ({ field: rules[k].field, class: p === '?' ? null : +p, label: p === '?' ? 'no data' : rules[k].labels[+p] })),
          areaM2: round(area, 3), cellAreaM2: round(cellArea, 3), shareOfBed: round(area / d.areaM2, 4), cells: idx.length, regions: coords.length,
          geometry, stats, hypothetical: rules.some((r) => r.hypothetical),
        };
        zones.push(z);
        let agg = perKey.get(key); if (!agg) perKey.set(key, (agg = { key, label, areaM2: 0, beds: [] })); agg.areaM2 += area; agg.beds.push(d.bedId);
      }
    }
    rules.forEach((r) => { r.uncertainAreaM2 = round(r.uncertainAreaM2, 2); r.unknownAreaM2 = round(r.unknownAreaM2, 2); });
    const summary = [...perKey.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((a) => ({ ...a, areaM2: round(a.areaM2, 2), share: round(a.areaM2 / scopeArea, 4) }));
    const splits = {}; for (const z of zones) splits[z.bedId] = (splits[z.bedId] || 0) + 1;
    const notes = [];
    for (const r of rules) {
      if (r.status === 'unknown') notes.push(`${r.name}: no data in this site, so every cell is “no data” — not zero.`);
      if (r.uniformIn.length) notes.push(`${r.name} varies less than its accuracy (${fmtTol(r)}) in ${r.uniformIn.map((b) => b.replace('bed.', '')).join(', ')}: not split there.`);
      if (r.uncertainAreaM2 > 0) notes.push(`${r.uncertainAreaM2} m² lie within ±${fmtHalfTol(r)} of the ${r.name.toLowerCase()} threshold: their class is within the data's accuracy.`);
      if (r.hypothetical) notes.push(`${r.name} is a hypothetical test field, not site data.`);
    }
    const fp = fingerprintOf(zones, rules, cz.cs);
    const result = {
      ok: true, id: 'cmp.' + fp, version: CS_VERSION, scope: { bedIds: sc.bedIds, region: !!sc.region }, cellSize: cz.cs, minRegionM2: minRegion, smoothedCells: smoothed,
      rules, zones, summary, splits, areaM2: round(scopeArea, 3), hypothetical: rules.some((r) => r.hypothetical), readsPlanting: false,
      notes, fingerprint: fp, ms: round(now() - t0, 1),
    };
    return result;
  }
  // keep a classification as the current one (painted, queryable by zoneAt / queryZones)
  run(scope, spec) {
    const r = this.classify(scope, spec);
    if (!r.ok) return r;
    this.current = r; this.revision++;
    this.s.emit('compute', { type: 'zones', id: r.id });
    return r;
  }
  clear() { this.current = null; this.revision++; this.s.emit('compute', { type: 'clear' }); return { ok: true }; }

  // ================================================================ point sampling and queries
  sampleAt(x, y, { cellSize } = {}) {
    x = +x; y = +y; if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'x, y must be numbers' };
    const cz = this._cellSize(cellSize); if (cz.error) return { ok: false, error: cz.error };
    const bed = this.designBeds().find((b) => pointInGeom(b.geometry, x, y)) || null;
    const out = { ok: true, x: round(x, 3), y: round(y, 3), bedId: bed ? bed.id : null, point: this._pointValues(x, y, bed ? bed.id : null), cell: null, zone: null };
    if (bed) {
      const d = this._bedDomain(bed, cz.cs); const c = Math.round((x - this.lattice.ox) / cz.cs), r = Math.round((y - this.lattice.oy) / cz.cs);
      const i = d.index.get(cellKey(c, r));
      if (i != null) {
        const v = {}; for (const fid of this.fieldDefs.keys()) { const f = this.fieldDefs.get(fid); v[fid] = f.status === 'unknown' ? null : (Number.isNaN(this._values(d, fid)[i]) ? null : round(this._values(d, fid)[i], 4)); }
        out.cell = { c, r, cellSize: cz.cs, areaM2: round(d.area[i], 4), whole: d.area[i] > cz.cs * cz.cs - 1e-6, representativePoint: [round(d.x[i], 3), round(d.y[i], 3)], plantable: !!d.plantable[i], values: v };
      }
      const z = this.zoneAt(x, y); if (z) out.zone = { id: z.id, key: z.key, label: z.label, computation: this.current.id };
    }
    return out;
  }
  zoneAt(x, y, cmp = this.current) {
    if (!cmp) return null;
    for (const z of cmp.zones) { const bb = z._bb || (z._bb = bboxOf(z.geometry)); if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) continue; if (pointInGeom(z.geometry, x, y)) return z; }
    return null;
  }
  queryZones(geometry, { predicate = 'intersects', computation } = {}) {
    const cmp = computation || this.current; if (!cmp) return { ok: false, error: 'no computation: run(scope, spec) first' };
    const v = validateGeometry(geometry); if (!v.ok) return { ok: false, error: v.error };
    if (!['intersects', 'within'].includes(predicate)) return { ok: false, error: 'predicate must be intersects | within' };
    const res = cmp.zones.filter((z) => (predicate === 'within' ? within(z.geometry, geometry) : intersects(z.geometry, geometry)));
    return { ok: true, computation: cmp.id, predicate, zones: res.map(publicZone) };
  }
  // positions inside the scope for future point / group planting: grid, hex or jittered; plantable only by default
  samplePoints(scope, { spacing = 1, pattern = 'grid', seed = 1, plantableOnly = true, limit = 5000, fields } = {}) {
    const sc = this.resolveScope(scope); if (!sc.ok) return sc;
    spacing = +spacing; if (!(spacing >= 0.1 && spacing <= 50)) return { ok: false, error: 'spacing must be 0.1–50 m' };
    if (!['grid', 'hex', 'jitter'].includes(pattern)) return { ok: false, error: 'pattern must be grid | hex | jitter' };
    const rnd = mulberry(seed >>> 0 || 1); const pts = [];
    const fids = fields || this._knownFieldIds();
    for (const b of sc.beds) {
      const g = sc.region ? { type: 'MultiPolygon', coordinates: polygonClipping.intersection(coordsOf(b.geometry), coordsOf(sc.region)) } : b.geometry;
      const bb = bboxOf(g); const dy = pattern === 'hex' ? spacing * Math.sqrt(3) / 2 : spacing;
      const blk = this._blockers.filter((q) => bboxTouch(q.bb, bb));
      let row = 0;
      for (let y = Math.ceil(bb[1] / dy) * dy; y <= bb[3] && pts.length < limit; y += dy, row++) {
        for (let x = Math.ceil(bb[0] / spacing) * spacing + (pattern === 'hex' && row % 2 ? spacing / 2 : 0); x <= bb[2] && pts.length < limit; x += spacing) {
          let px = x, py = y; if (pattern === 'jitter') { px += (rnd() - 0.5) * spacing * 0.8; py += (rnd() - 0.5) * spacing * 0.8; }
          if (!pointInGeom(g, px, py)) continue;
          const plantable = !blk.some((q) => pointInGeom(q.g, px, py));
          if (plantableOnly && !plantable) continue;
          const z = this.zoneAt(px, py);
          pts.push({ x: round(px, 3), y: round(py, 3), bedId: b.id, plantable, zone: z ? z.key : null, values: this._pointValues(px, py, b.id, fids) });
        }
      }
    }
    return { ok: true, spacing, pattern, count: pts.length, truncated: pts.length >= limit, points: pts };
  }

  // ================================================================ display (view state of the canvas, not data)
  setDisplay(patch) {
    const d = { ...this.display, ...patch };
    if (d.mode && !['field', 'zones'].includes(d.mode)) d.mode = null;
    if (d.mode === 'field' && !this.fieldDefs.has(d.field)) d.mode = null;
    this.display = d; this.revision++;
    this.s.emit('compute', { type: 'display', display: { ...d } });
    return { ...d };
  }
  // cells of the displayed scope with the displayed field's values (for painters)
  displayCells() {
    const d = this.display; if (d.mode !== 'field' || !d.scope.length) return null;
    const f = this.fieldDefs.get(d.field); if (!f) return null;
    const key = this.revision + '|' + d.field + '|' + d.scope.join(',');
    if (this._dc && this._dc.key === key) return this._dc;
    const sc = this.resolveScope(d.scope); if (!sc.ok) return null;
    const cs = this.lattice.cellSize; const parts = [];
    let lo = Infinity, hi = -Infinity;
    for (const b of sc.beds) {
      const dom = this._bedDomain(b, cs);
      const v = f.status === 'unknown' ? null : this._values(dom, f.id);
      if (v) for (const q of v) if (!Number.isNaN(q)) { lo = Math.min(lo, q); hi = Math.max(hi, q); }
      parts.push({ dom, v });
    }
    const dist = Number.isFinite(lo) ? bandsFor(f, lo, hi) : null;
    return (this._dc = { key, field: f, parts, lo, hi, bands: dist, cs, ox: this.lattice.ox, oy: this.lattice.oy });
  }
}

// ---------------------------------------------------------------- distribution summary
function summarizeField(f, W, V, unk, bins) {
  const base = { field: f.id, name: f.name, units: f.units, status: f.status, dataKind: f.dataKind, hypothetical: !!f.hypothetical, source: f.source || null, method: f.method || null, tolerance: f.tolerance || 0, toleranceBasis: f.toleranceBasis || null, note: f.note || null };
  const known = W.reduce((a, w) => a + w, 0);
  if (!known) return { ...base, known: false, areaKnownM2: 0, areaUnknownM2: round(unk, 3), min: null, max: null, mean: null, sd: null, uniform: null, histogram: null };
  const ord = V.map((v, i) => i).sort((a, b) => V[a] - V[b]);
  const q = (p) => { let acc = 0; const target = p * known; for (const i of ord) { acc += W[i]; if (acc >= target - 1e-12) return V[i]; } return V[ord[ord.length - 1]]; };
  let mean = 0; for (let i = 0; i < V.length; i++) mean += W[i] * V[i]; mean /= known;
  let varr = 0; for (let i = 0; i < V.length; i++) varr += W[i] * (V[i] - mean) ** 2; varr /= known;
  const lo = V[ord[0]], hi = V[ord[ord.length - 1]];
  let histogram;
  if (f.categorical) {
    histogram = { categorical: true, classes: (f.classes || []).map((c) => ({ value: c.value, label: c.label, areaM2: round(V.reduce((a, v, i) => a + (v === c.value ? W[i] : 0), 0), 3) })) };
  } else {
    const n = Math.max(1, Math.min(24, bins | 0)); const span = hi - lo || 1; const edges = Array.from({ length: n + 1 }, (_, k) => lo + (span * k) / n);
    const area = new Array(n).fill(0); for (let i = 0; i < V.length; i++) area[Math.min(n - 1, Math.floor(((V[i] - lo) / span) * n))] += W[i];
    histogram = { edges: edges.map((e) => round(e, 4)), areaM2: area.map((a) => round(a, 3)) };
  }
  return {
    ...base, known: true, areaKnownM2: round(known, 3), areaUnknownM2: round(unk, 3),
    min: round(lo, 4), max: round(hi, 4), range: round(hi - lo, 4), mean: round(mean, 4), sd: round(Math.sqrt(varr), 4),
    p10: round(q(0.1), 4), p50: round(q(0.5), 4), p90: round(q(0.9), 4),
    uniform: hi - lo < (f.tolerance || 0), histogram,
  };
}
// display bands: never finer than the field's accuracy, at most 7
function bandsFor(f, lo, hi) {
  if (f.categorical) return { categorical: true, lo, hi };
  const tol = f.tolerance || 0;
  if (hi - lo < tol) return { uniform: true, lo, hi, step: 0, n: 1 };
  const step = Math.max(tol, (hi - lo) / 7) || (hi - lo) / 7 || 1;
  const n = Math.max(1, Math.ceil((hi - lo) / step - 1e-9));
  return { uniform: false, lo, hi, step, n };
}
function classOf(v, breaks) { let k = 0; while (k < breaks.length && v >= breaks[k]) k++; return String(k); }
function autoLabels(f, breaks) {
  const u = f.units ? (f.units === '°' ? '°' : ' ' + f.units) : '';
  const dec = (v) => Math.min(3, Math.max(f.decimals ?? 2, (String(v).split('.')[1] || '').length)); // never round a threshold the user typed
  const d = (v) => `${+v.toFixed(dec(v))}${u}`;
  if (f.categorical && f.classes) return breaks.length === 1 && breaks[0] > 0 && breaks[0] <= 1 ? f.classes.map((c) => c.label) : [...breaks.map((b, k) => (k ? `${d(breaks[k - 1])}–${d(b)}` : `< ${d(b)}`)), `≥ ${d(breaks[breaks.length - 1])}`];
  return [...breaks.map((b, k) => (k ? `${d(breaks[k - 1])}–${d(b)}` : `${f.short || f.name} < ${d(b)}`)), `${f.short || f.name} ≥ ${d(breaks[breaks.length - 1])}`];
}
function fmtTol(r) { return `${r.tolerance}${r.units === '°' ? '°' : r.units ? ' ' + r.units : ''}`; }
function fmtHalfTol(r) { return `${+(r.tolerance / 2).toFixed(3)}${r.units === '°' ? '°' : r.units ? ' ' + r.units : ''}`; }
function publicZone(z) { const { _bb, ...rest } = z; return rest; }

// merge connected pieces (4-neighbour) smaller than minArea into the neighbouring class they share most edge with
function mergeSmallRegions(d, keys, minArea) {
  let changed = 0;
  for (let pass = 0; pass < 6; pass++) {
    const comp = new Int32Array(d.n).fill(-1); const comps = [];
    for (let i = 0; i < d.n; i++) {
      if (comp[i] >= 0) continue;
      const id = comps.length; const cells = [i]; comp[i] = id; let area = 0;
      for (let k = 0; k < cells.length; k++) {
        const j = cells[k]; area += d.area[j];
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = d.index.get(cellKey(d.c[j] + dc, d.r[j] + dr)); if (n != null && comp[n] < 0 && keys[n] === keys[i]) { comp[n] = id; cells.push(n); } }
      }
      comps.push({ cells, area, key: keys[i] });
    }
    let any = false;
    for (const cp of comps) {
      if (cp.area >= minArea - 1e-9) continue;
      const votes = new Map();
      for (const j of cp.cells) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = d.index.get(cellKey(d.c[j] + dc, d.r[j] + dr)); if (n != null && keys[n] !== cp.key) votes.set(keys[n], (votes.get(keys[n]) || 0) + 1); }
      if (!votes.size) continue;
      const to = [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
      for (const j of cp.cells) keys[j] = to; changed += cp.cells.length; any = true;
    }
    if (!any) break;
  }
  return changed;
}

// ---------------------------------------------------------------- lattice -> vector: union of cells as rings
// cells = [[c, r]…]; cell (c, r) spans corners (c, r)–(c+1, r+1) in corner space; world x = ox + (i − ½)·cs.
// Boundary edges are directed with the set on the left; at a corner touched diagonally the walk turns left, so
// diagonal neighbours stay separate rings (4-connectivity). Returns polygon-clipping MultiPolygon coordinates.
export function traceCells(cells, ox, oy, cs) {
  if (!cells.length) return [];
  const S = new Set(cells.map(([c, r]) => cellKey(c, r)));
  const has = (c, r) => S.has(cellKey(c, r));
  const out = new Map(); const edges = [];
  const add = (i0, j0, i1, j1, dir) => { const e = { i0, j0, i1, j1, dir, used: false }; edges.push(e); const k = cellKey(i0, j0); let a = out.get(k); if (!a) out.set(k, (a = [])); a.push(e); };
  for (const [c, r] of cells) {
    if (!has(c, r - 1)) add(c, r, c + 1, r, 0);
    if (!has(c + 1, r)) add(c + 1, r, c + 1, r + 1, 1);
    if (!has(c, r + 1)) add(c + 1, r + 1, c, r + 1, 2);
    if (!has(c - 1, r)) add(c, r + 1, c, r, 3);
  }
  const rings = [];
  for (const start of edges) {
    if (start.used) continue;
    const pts = []; let e = start;
    for (let guard = 0; guard < edges.length + 4; guard++) {
      e.used = true; pts.push([e.i0, e.j0]);
      const cand = out.get(cellKey(e.i1, e.j1)) || [];
      let next = null;
      for (const pref of [(e.dir + 1) % 4, e.dir, (e.dir + 3) % 4]) { next = cand.find((q) => q.dir === pref); if (next) break; }
      if (!next || next === start) break;
      e = next;
    }
    // drop collinear corners
    const simp = pts.filter((p, k) => { const a = pts[(k - 1 + pts.length) % pts.length], b = pts[(k + 1) % pts.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0; });
    const world = simp.map(([i, j]) => [ox + (i - 0.5) * cs, oy + (j - 0.5) * cs]);
    world.push(world[0].slice());
    rings.push({ ring: world, a: ringMoments(world).a, probe: probeOf(start, ox, oy, cs) });
  }
  const outers = rings.filter((r) => r.a > 0).sort((a, b) => a.a - b.a);
  const holes = rings.filter((r) => r.a < 0);
  const polys = outers.map((o) => ({ o, holes: [] }));
  for (const h of holes) { const host = polys.find((p) => pointInPoly([p.o.ring], h.probe[0], h.probe[1]) > 0); if (host) host.holes.push(h.ring); }
  return polys.map((p) => [p.o.ring, ...p.holes]);
}
// a point just outside the set, on the right of a hole edge (used to find the outer ring holding the hole)
function probeOf(e, ox, oy, cs) {
  const mx = (e.i0 + e.i1) / 2, my = (e.j0 + e.j1) / 2; const off = 0.25;
  const n = [[0, -off], [off, 0], [0, off], [-off, 0]][e.dir];
  return [ox + (mx + n[0] - 0.5) * cs, oy + (my + n[1] - 0.5) * cs];
}

// ---------------------------------------------------------------- exact distance to a set of geometries
class SegIndex {
  constructor(geoms, bucket = 4) {
    this.b = bucket; this.cells = new Map(); this.polys = []; this.n = 0;
    const segs = [];
    const ring = (r) => { for (let i = 0; i < r.length - 1; i++) segs.push([r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]]); };
    for (const g of geoms) {
      if (!g) continue;
      for (const p of polysOf(g)) { this.polys.push({ p, bb: bboxOf({ type: 'Polygon', coordinates: p }) }); p.forEach(ring); }
      for (const l of linesOf(g)) ring(l);
      for (const q of pointsOf(g)) segs.push([q[0], q[1], q[0], q[1]]);
    }
    this.segs = segs; this.stamp = new Uint32Array(segs.length); this.tick = 0;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    segs.forEach((s, k) => {
      const a0 = Math.floor(Math.min(s[0], s[2]) / bucket), a1 = Math.floor(Math.max(s[0], s[2]) / bucket), b0 = Math.floor(Math.min(s[1], s[3]) / bucket), b1 = Math.floor(Math.max(s[1], s[3]) / bucket);
      gx0 = Math.min(gx0, a0); gx1 = Math.max(gx1, a1); gy0 = Math.min(gy0, b0); gy1 = Math.max(gy1, b1);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) { const key = cellKey(a, b); let arr = this.cells.get(key); if (!arr) this.cells.set(key, (arr = [])); arr.push(k); }
    });
    this.ext = [gx0, gy0, gx1, gy1];
  }
  dist(x, y) {
    for (const P of this.polys) if (x >= P.bb[0] && x <= P.bb[2] && y >= P.bb[1] && y <= P.bb[3] && pointInPoly(P.p, x, y) >= 0) return 0; // -1 out, 0 edge, 1 in
    if (!this.segs.length) return Infinity;
    const b = this.b; const gx = Math.floor(x / b), gy = Math.floor(y / b);
    const [ex0, ey0, ex1, ey1] = this.ext;
    const kmax = Math.max(Math.abs(gx - ex0), Math.abs(gx - ex1), Math.abs(gy - ey0), Math.abs(gy - ey1)) + 1;
    let best = Infinity; const t = ++this.tick;
    const visit = (a, c) => { const arr = this.cells.get(cellKey(a, c)); if (!arr) return; for (const k of arr) { if (this.stamp[k] === t) continue; this.stamp[k] = t; const s = this.segs[k]; const d = segDist(x, y, s[0], s[1], s[2], s[3]); if (d < best) best = d; } };
    for (let k = 0; k <= kmax; k++) {
      if (k === 0) visit(gx, gy);
      else { for (let a = gx - k; a <= gx + k; a++) { visit(a, gy - k); visit(a, gy + k); } for (let c = gy - k + 1; c <= gy + k - 1; c++) { visit(gx - k, c); visit(gx + k, c); } }
      if (best <= k * b) break;
    }
    return best;
  }
}

// ---------------------------------------------------------------- small geometry helpers
// grid traversal (Amanatides–Woo): every lattice cell whose interior a segment passes through
function traverse(ax, ay, bx, by, ox, oy, cs, mark) {
  const u0 = (ax - ox) / cs + 0.5, v0 = (ay - oy) / cs + 0.5, u1 = (bx - ox) / cs + 0.5, v1 = (by - oy) / cs + 0.5;
  let i = Math.floor(u0), j = Math.floor(v0); mark(i, j);
  const du = u1 - u0, dv = v1 - v0; const si = Math.sign(du), sj = Math.sign(dv);
  const tdx = si ? Math.abs(1 / du) : Infinity, tdy = sj ? Math.abs(1 / dv) : Infinity;
  let tmx = si > 0 ? (Math.floor(u0) + 1 - u0) * tdx : si < 0 ? (u0 - Math.floor(u0)) * tdx : Infinity;
  let tmy = sj > 0 ? (Math.floor(v0) + 1 - v0) * tdy : sj < 0 ? (v0 - Math.floor(v0)) * tdy : Infinity;
  for (let guard = 0; guard < 1e6; guard++) {
    if (Math.min(tmx, tmy) > 1) break;
    if (tmx < tmy) { i += si; tmx += tdx; } else if (tmy < tmx) { j += sj; tmy += tdy; } else { mark(i + si, j); mark(i, j + sj); i += si; j += sj; tmx += tdx; tmy += tdy; }
    mark(i, j);
  }
}
function clipRing(ring, x0, y0, x1, y1) { // Sutherland–Hodgman against an axis-aligned rectangle (convex)
  let pts = ring.slice(0, ring.length - (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? 1 : 0));
  const clip = (inside, cross) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]; const ia = inside(a), ib = inside(b);
      if (ia) out.push(a);
      if (ia !== ib) out.push(cross(a, b));
    }
    pts = out;
  };
  const lerpX = (a, b, X) => [X, a[1] + ((b[1] - a[1]) * (X - a[0])) / (b[0] - a[0])];
  const lerpY = (a, b, Y) => [a[0] + ((b[0] - a[0]) * (Y - a[1])) / (b[1] - a[1]), Y];
  clip((p) => p[0] >= x0, (a, b) => lerpX(a, b, x0)); if (pts.length < 3) return [];
  clip((p) => p[0] <= x1, (a, b) => lerpX(a, b, x1)); if (pts.length < 3) return [];
  clip((p) => p[1] >= y0, (a, b) => lerpY(a, b, y0)); if (pts.length < 3) return [];
  clip((p) => p[1] <= y1, (a, b) => lerpY(a, b, y1));
  return pts.length < 3 ? [] : pts;
}
function ringMoments(pts) { // signed area and centroid (open or closed ring)
  let a = 0, cx = 0, cy = 0; const n = pts.length;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; const f = p[0] * q[1] - q[0] * p[1]; a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; }
  a /= 2; return { a, cx: a ? cx / (6 * a) : pts[0][0], cy: a ? cy / (6 * a) : pts[0][1] };
}
function coordsOf(g) { return g.type === 'Polygon' ? [g.coordinates] : g.coordinates; }
function ringsAsLines(g) { return { type: 'MultiLineString', coordinates: polysOf(g).flat() }; }
function bboxTouch(a, b) { return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]); }
function cellKey(a, b) { return a * 100003 + b; }
function round(v, d) { const k = 10 ** d; return Math.round(v * k) / k; }
function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); }
function fingerprintOf(zones, rules, cs) {
  return hashStr(JSON.stringify([cs, rules.map((r) => [r.field, r.breaks]), zones.map((z) => [z.bedId, z.key, z.cells, Math.round(z.areaM2 * 100)])]));
}
function mulberry(seed) { let s = seed; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
