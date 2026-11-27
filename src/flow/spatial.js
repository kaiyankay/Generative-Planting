// Spatial Logic engine: a pattern family the designer chooses (Honeycomb, Bands, Organic Patches) is generated inside the
// plantable geometry of one bed and adapted to the real context: candidate orientations / sizes / seed layouts are
// generated, checked for geometric validity and ranked by documented proxy criteria. The result is a set of numbered
// SpatialCells (stable ids, geometry, area, neighbours, sampled conditions). Cells are not plants and carry no mix.
//
// Units: model metres (x east, y north). Nothing here reads the planting design.
import polygonClipping from '../../vendor/polygon-clipping/polygon-clipping.esm.js';

export const LOGICS = {
  honeycomb: { id: 'honeycomb', name: 'Honeycomb', blurb: 'Even hexagonal cells', sizeLabel: 'Cell width', sizes: [3.5, 4.5, 5.5], minSize: 2, maxSize: 9 },
  bands: { id: 'bands', name: 'Bands', blurb: 'Parallel bands across the bed', sizeLabel: 'Band width', sizes: [2.5, 3.5, 5], minSize: 1.5, maxSize: 9 },
  organic: { id: 'organic', name: 'Organic patches', blurb: 'Irregular patches of similar size', sizeLabel: 'Patch size (√area)', sizes: [3.5, 4.5, 5.5], minSize: 2, maxSize: 9 },
};
// documented prototype defaults (see docs/integrated/ALGORITHMS.md)
export const RULES = {
  fragmentMergeFraction: 0.3,   // a fragment smaller than 30 % of a full cell is merged into its longest-shared neighbour
  minCellAreaM2: 1.0,           // an isolated fragment below 1 m² is dropped as an unusable sliver (area reported)
  adjacencyMinSharedM: 0.3,     // two cells are neighbours if they share ≥ 0.3 m of boundary
  nearAcrossPathM: 3.0,         // cells of different beds within 3 m (a path width) are "near" (structural proxy only)
  pathEdgeM: 2.0,               // a bed edge whose midpoint is within 2 m of a path is a path edge
  reliefForGradientM: 0.3,      // the elevation gradient is used as a reference direction only if relief ≥ 0.3 m
  sampleStepM: 1.0,             // condition sampling step inside a cell
  bandSegment: 3,               // a band is cut into segments 3 × its width long
};

const C = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const MP = (c) => ({ type: 'MultiPolygon', coordinates: c || [] });
export function ringArea(r) { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; }
export function polyArea(p) { let a = Math.abs(ringArea(p[0])); for (let k = 1; k < p.length; k++) a -= Math.abs(ringArea(p[k])); return a; }
export function mpArea(mp) { let a = 0; for (const p of C(mp)) a += polyArea(p); return a; }
export function bbox(mp) { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of C(mp)) for (const [x, y] of p[0]) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; } return b; }
function inRing(r, x, y) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
export function inside(mp, x, y) { for (const p of C(mp)) { if (!inRing(p[0], x, y)) continue; let hole = false; for (let k = 1; k < p.length; k++) if (inRing(p[k], x, y)) { hole = true; break; } if (!hole) return true; } return false; }
export function centroid(mp) {
  let A = 0, cx = 0, cy = 0;
  for (const p of C(mp)) for (let k = 0; k < p.length; k++) { const r = p[k]; const s = k === 0 ? 1 : -1; const a0 = ringArea(r); const sg = Math.sign(a0) * s;
    for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; A += f * sg; cx += (r[i][0] + r[i + 1][0]) * f * sg; cy += (r[i][1] + r[i + 1][1]) * f * sg; } }
  if (Math.abs(A) < 1e-9) { const b = bbox(mp); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [cx / (3 * A), cy / (3 * A)];
}
// a point guaranteed inside (centroid if inside, else the best grid sample)
export function labelPoint(mp) {
  const c = centroid(mp); if (inside(mp, c[0], c[1])) return c;
  const b = bbox(mp); let best = null, bd = -1;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const x = b[0] + (b[2] - b[0]) * i / 12, y = b[1] + (b[3] - b[1]) * j / 12; if (!inside(mp, x, y)) continue; const d = edgeDist(mp, x, y); if (d > bd) { bd = d; best = [x, y]; } }
  return best || c;
}
function segD(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; const L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
export function edgeDist(mp, x, y) { let d = Infinity; for (const p of C(mp)) for (const r of p) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segD(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1])); return d; }
const clipMP = (a, b) => { try { return MP(polygonClipping.intersection(C(a), C(b))); } catch { return MP([]); } };
const unionMP = (list) => { try { return MP(polygonClipping.union(...list.map(C))); } catch { return list[0]; } };
const round = (v, d = 3) => +(+v).toFixed(d);
const roundGeom = (mp) => MP(C(mp).map((p) => p.map((r) => r.map(([x, y]) => [round(x, 3), round(y, 3)]))));

// deterministic RNG + hash
export function hash(...parts) { let h = 2166136261 >>> 0; for (const s of parts.join('|')) { h ^= s.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- reference directions from the real geometry
// principal axis of the bed (second moments of the outline vertices, length-weighted)
export function principalAxis(mp) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, w = 0;
  for (const p of C(mp)) { const r = p[0]; for (let i = 0; i < r.length - 1; i++) { const L = Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]); const x = (r[i][0] + r[i + 1][0]) / 2, y = (r[i][1] + r[i + 1][1]) / 2; sx += x * L; sy += y * L; sxx += x * x * L; syy += y * y * L; sxy += x * y * L; w += L; } }
  if (!w) return 0;
  const mx = sx / w, my = sy / w; const cxx = sxx / w - mx * mx, cyy = syy / w - my * my, cxy = sxy / w - mx * my;
  return normDeg((0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI);
}
const normDeg = (a) => ((a % 180) + 180) % 180; // undirected line orientation 0–180
const angDiff = (a, b) => { const d = Math.abs(normDeg(a) - normDeg(b)); return Math.min(d, 180 - d); }; // 0–90
// mean direction of the bed edges that run along a path (length-weighted, doubled-angle average); null if none
export function pathEdgeDirection(mp, ctx) {
  if (!ctx || !ctx.pathDist) return null;
  let c = 0, s = 0, L = 0;
  for (const p of C(mp)) { const r = p[0]; for (let i = 0; i < r.length - 1; i++) { const [ax, ay] = r[i], [bx, by] = r[i + 1]; const len = Math.hypot(bx - ax, by - ay); if (len < 0.2) continue;
    const d = ctx.pathDist((ax + bx) / 2, (ay + by) / 2); if (d == null || d > RULES.pathEdgeM) continue; const t = Math.atan2(by - ay, bx - ax) * 2; c += Math.cos(t) * len; s += Math.sin(t) * len; L += len; } }
  if (L < 1) return null;
  return { deg: normDeg((Math.atan2(s, c) / 2) * 180 / Math.PI), lengthM: round(L, 1), strength: Math.hypot(c, s) / L };
}
// contour direction (perpendicular to the mean elevation gradient), only where the relief is meaningful
export function contourDirection(mp, ctx) {
  if (!ctx || !ctx.elevation) return null;
  const b = bbox(mp); const pts = []; const step = Math.max(1, Math.sqrt((b[2] - b[0]) * (b[3] - b[1])) / 14);
  for (let x = b[0] + step / 2; x < b[2]; x += step) for (let y = b[1] + step / 2; y < b[3]; y += step) { if (!inside(mp, x, y)) continue; const z = ctx.elevation(x, y); if (z != null) pts.push([x, y, z]); }
  if (pts.length < 6) return null;
  const zs = pts.map((p) => p[2]); const relief = Math.max(...zs) - Math.min(...zs);
  // least-squares plane z = a x + b y + c
  let n = pts.length, Sx = 0, Sy = 0, Sz = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxz = 0, Syz = 0;
  for (const [x, y, z] of pts) { Sx += x; Sy += y; Sz += z; Sxx += x * x; Syy += y * y; Sxy += x * y; Sxz += x * z; Syz += y * z; }
  const mx = Sx / n, my = Sy / n, mz = Sz / n; const cxx = Sxx / n - mx * mx, cyy = Syy / n - my * my, cxy = Sxy / n - mx * my, cxz = Sxz / n - mx * mz, cyz = Syz / n - my * mz;
  const det = cxx * cyy - cxy * cxy; if (Math.abs(det) < 1e-9) return null;
  const a = (cxz * cyy - cyz * cxy) / det, bb = (cyz * cxx - cxz * cxy) / det;
  const grad = Math.hypot(a, bb); if (grad < 1e-6) return { relief: round(relief, 2), deg: null };
  return { relief: round(relief, 2), deg: normDeg((Math.atan2(bb, a) * 180) / Math.PI + 90), gradientPerM: round(grad, 4) };
}

// ---------------------------------------------------------------- raw pattern geometry
function rot(x, y, deg) { const t = (deg * Math.PI) / 180; return [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)]; }
function hexRaw(mp, { size, angle, offset = [0, 0] }) {
  const b = bbox(mp); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; const R = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + size;
  const d = size; const u = rot(d, 0, angle), v = rot(d / 2, (d * Math.sqrt(3)) / 2, angle); const rad = d / Math.sqrt(3);
  const n = Math.ceil(R / d) + 2; const out = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const x = cx + offset[0] + i * u[0] + j * v[0], y = cy + offset[1] + i * u[1] + j * v[1];
    if (x < b[0] - d || x > b[2] + d || y < b[1] - d || y > b[3] + d) continue;
    const ring = []; for (let k = 0; k <= 6; k++) { const a = ((angle + 30 + (k % 6) * 60) * Math.PI) / 180; ring.push([x + rad * Math.cos(a), y + rad * Math.sin(a)]); }
    out.push({ key: `${i},${j}`, geom: MP([[ring]]), order: [i, j] });
  }
  return { tiles: out, fullArea: (Math.sqrt(3) / 2) * d * d };
}
function bandRaw(mp, { size, angle, offset = 0 }) {
  const b = bbox(mp); const pts = []; for (const p of C(mp)) for (const q of p[0]) pts.push(q);
  const n = rot(0, 1, angle), t = rot(1, 0, angle); // bands run along t, stack along n
  let lo = Infinity, hi = -Infinity, tlo = Infinity, thi = -Infinity;
  for (const [x, y] of pts) { const s = x * n[0] + y * n[1], q = x * t[0] + y * t[1]; lo = Math.min(lo, s); hi = Math.max(hi, s); tlo = Math.min(tlo, q); thi = Math.max(thi, q); }
  tlo -= 2; thi += 2; const out = []; let k = 0;
  for (let s = lo - (offset % size) - (offset ? size : 0); s < hi; s += size, k++) {
    const s1 = s + size; if (s1 <= lo) continue;
    const P = (q, ss) => [q * t[0] + ss * n[0], q * t[1] + ss * n[1]];
    // long bands are cut into segments of RULES.bandSegment × width along their length (numbered cells, not one strip)
    const seg = size * RULES.bandSegment; let j = 0;
    for (let q = tlo; q < thi; q += seg, j++) { const q1 = Math.min(thi, q + seg); const ring = [P(q, s), P(q1, s), P(q1, s1), P(q, s1), P(q, s)]; out.push({ key: `b${k}s${j}`, geom: MP([[ring]]), order: [k, j] }); }
  }
  return { tiles: out, fullArea: size * size * RULES.bandSegment, bandWidth: size, stackDir: n };
}
// clipped Voronoi with bounded Lloyd relaxation; seeds by deterministic dart throwing (bed shape) + context weighting
function clipHalf(poly, a, b, c) { // keep a x + b y <= c (convex poly ring, closed)
  const out = []; const r = poly; for (let i = 0; i < r.length - 1; i++) { const P = r[i], Q = r[i + 1]; const fp = a * P[0] + b * P[1] - c, fq = a * Q[0] + b * Q[1] - c;
    if (fp <= 0) out.push(P); if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const k = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); } }
  if (out.length) out.push(out[0]); return out;
}
function voronoiCells(seeds, b) {
  const box = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
  return seeds.map((s, i) => { let poly = box; for (let j = 0; j < seeds.length && poly.length > 3; j++) { if (j === i) continue; const o = seeds[j]; const a = o[0] - s[0], bb = o[1] - s[1]; const c = (o[0] * o[0] + o[1] * o[1] - s[0] * s[0] - s[1] * s[1]) / 2; poly = clipHalf(poly, a, bb, c); } return poly; });
}
function organicRaw(mp, { size, seed = 1, ctx, lloyd = 2 }) {
  const area = mpArea(mp); const n = Math.max(1, Math.round(area / (size * size))); const b = bbox(mp); const R = rng(seed);
  const minD = size * 0.7; const seeds = []; let tries = 0;
  while (seeds.length < n && tries < n * 400) { tries++; const x = b[0] + R() * (b[2] - b[0]), y = b[1] + R() * (b[3] - b[1]); if (!inside(mp, x, y)) continue; if (seeds.some((s) => Math.hypot(s[0] - x, s[1] - y) < minD * (tries > n * 200 ? 0.6 : 1))) continue; seeds.push([x, y]); }
  const eb = [b[0] - size, b[1] - size, b[2] + size, b[3] + size];
  let cur = seeds;
  for (let it = 0; it < lloyd; it++) { // bounded relaxation: move each seed to the centroid of its clipped cell (max 0.5 × size)
    const cells = voronoiCells(cur, eb).map((r) => clipMP(MP([[r]]), mp));
    cur = cur.map((s, i) => { const g = cells[i]; if (!C(g).length) return s; const c = centroid(g); const dx = c[0] - s[0], dy = c[1] - s[1]; const L = Math.hypot(dx, dy); const k = L > size * 0.5 ? (size * 0.5) / L : 1; return [s[0] + dx * k, s[1] + dy * k]; });
  }
  const rings = voronoiCells(cur, eb);
  return { tiles: rings.map((r, i) => ({ key: `p${i}`, geom: MP([[r]]), order: [cur[i][0], cur[i][1]], seed: cur[i] })), fullArea: size * size, seeds: cur };
}

// ---------------------------------------------------------------- clip, fragment rule, adjacency
function sharedLength(a, b, tol = 1e-3) {
  let L = 0; const segs = (g) => { const o = []; for (const p of C(g)) for (const r of p) for (let i = 0; i < r.length - 1; i++) o.push([r[i], r[i + 1]]); return o; };
  const A = segs(a), B = segs(b);
  for (const [p, q] of A) { const dx = q[0] - p[0], dy = q[1] - p[1]; const len = Math.hypot(dx, dy); if (len < 1e-6) continue; const ux = dx / len, uy = dy / len;
    for (const [r, s] of B) {
      const d1 = Math.abs((r[0] - p[0]) * uy - (r[1] - p[1]) * ux), d2 = Math.abs((s[0] - p[0]) * uy - (s[1] - p[1]) * ux); if (d1 > tol || d2 > tol) continue;
      const t1 = (r[0] - p[0]) * ux + (r[1] - p[1]) * uy, t2 = (s[0] - p[0]) * ux + (s[1] - p[1]) * uy;
      const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(len, Math.max(t1, t2)); if (hi > lo) L += hi - lo;
    } }
  return L;
}
export function minGap(a, b) { // smallest distance between two outlines (0 if touching)
  let d = Infinity; for (const p of C(a)) for (const r of p) for (const q of r) d = Math.min(d, edgeDist(b, q[0], q[1])); for (const p of C(b)) for (const r of p) for (const q of r) d = Math.min(d, edgeDist(a, q[0], q[1])); return d;
}
const bbOverlap = (a, b, m = 0) => !(a[2] + m < b[0] || b[2] + m < a[0] || a[3] + m < b[1] || b[3] + m < a[1]);

function clipTiles(plantable, raw) {
  const parts = [];
  for (const t of raw.tiles) {
    const g = clipMP(t.geom, plantable); for (const poly of C(g)) { const a = polyArea(poly); if (a > 1e-4) parts.push({ key: t.key, order: t.order, geom: MP([poly]), area: a }); }
  }
  // fragment rule: small parts merge into the neighbour with the longest shared boundary
  const minFull = RULES.fragmentMergeFraction * raw.fullArea; let merged = 0, dropped = 0, droppedArea = 0, mergedArea = 0;
  parts.sort((p, q) => p.area - q.area);
  const live = parts.slice();
  for (const f of parts) {
    if (f.area >= minFull || !live.includes(f)) continue;
    const fb = bbox(f.geom); let best = null, bl = 0;
    for (const o of live) { if (o === f) continue; const ob = bbox(o.geom); if (!bbOverlap(fb, ob, 1e-3)) continue; const L = sharedLength(f.geom, o.geom); if (L > bl) { bl = L; best = o; } }
    if (best && bl >= 0.05) { best.geom = unionMP([best.geom, f.geom]); best.area = mpArea(best.geom); live.splice(live.indexOf(f), 1); merged++; mergedArea += f.area; }
    else if (f.area < RULES.minCellAreaM2) { live.splice(live.indexOf(f), 1); dropped++; droppedArea += f.area; }
  }
  return { parts: live, merged, mergedArea, dropped, droppedArea };
}

// ---------------------------------------------------------------- conditions inside a cell (shared site query; unknown stays unknown)
export function sampleCell(geom, ctx, step = RULES.sampleStepM) {
  const b = bbox(geom); const area = mpArea(geom); let st = Math.max(0.35, Math.min(step, Math.sqrt(area / 12)));
  const pts = []; for (let x = b[0] + st / 2; x < b[2]; x += st) for (let y = b[1] + st / 2; y < b[3]; y += st) if (inside(geom, x, y)) pts.push([x, y]);
  if (!pts.length) pts.push(labelPoint(geom));
  const acc = { elevation: [], slope: [], pathDist: [], canopy: [] };
  for (const [x, y] of pts) { const v = ctx && ctx.sample ? ctx.sample(x, y) : {}; for (const k of Object.keys(acc)) if (v[k] != null && Number.isFinite(v[k])) acc[k].push(v[k]); }
  const stat = (a) => (a.length ? { min: round(Math.min(...a), 2), max: round(Math.max(...a), 2), mean: round(a.reduce((s, v) => s + v, 0) / a.length, 2), coverage: round(a.length / pts.length, 2) } : { coverage: 0 });
  const canopyF = acc.canopy.length ? acc.canopy.filter((v) => v >= 0.5).length / acc.canopy.length : null;
  const nearPath = acc.pathDist.length ? acc.pathDist.filter((v) => v <= 1).length / acc.pathDist.length : null;
  const unknown = (ctx && ctx.unknownFields) || ['sun', 'moisture', 'ph'];
  return {
    samples: pts.length, stepM: round(st, 2),
    elevation: stat(acc.elevation), slope: stat(acc.slope), pathDist: stat(acc.pathDist),
    canopy: canopyF == null ? { status: 'unknown', coverage: 0 } : { status: canopyF >= 0.95 ? 'under crown' : canopyF <= 0.05 ? 'open' : 'mixed', fraction: round(canopyF, 2), coverage: round(acc.canopy.length / pts.length, 2), basis: 'existing tree crown above (aerial imagery); shade is an inference' },
    pathEdge: nearPath == null ? null : round(nearPath, 2),
    unknown: unknown.map((k) => ({ field: k, status: 'unknown', coverage: 0 })),
  };
}
// share of the cell area whose context class differs from the cell's majority class (0 = homogeneous)
function heterogeneity(geom, ctx, classOf) {
  if (!ctx || !ctx.sample) return 0;
  const b = bbox(geom); const st = Math.max(0.5, Math.sqrt(mpArea(geom) / 16)); const tally = new Map(); let n = 0;
  for (let x = b[0] + st / 2; x < b[2]; x += st) for (let y = b[1] + st / 2; y < b[3]; y += st) { if (!inside(geom, x, y)) continue; const k = classOf(ctx.sample(x, y)); if (k == null) continue; tally.set(k, (tally.get(k) || 0) + 1); n++; }
  if (!n) return 0; return 1 - Math.max(...tally.values()) / n;
}

// ---------------------------------------------------------------- candidates and ranking
function contextClassifier(plantable, ctx) {
  // known site classes only: crown above (yes / no), path edge (≤ 1 m), elevation tercile (only if relief ≥ 0.3 m)
  let lo = null, hi = null; const cd = contourDirection(plantable, ctx);
  if (cd && cd.relief >= RULES.reliefForGradientM && ctx.elevation) { const b = bbox(plantable); const zs = []; for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) { const x = b[0] + (b[2] - b[0]) * i / 10, y = b[1] + (b[3] - b[1]) * j / 10; if (inside(plantable, x, y)) { const z = ctx.elevation(x, y); if (z != null) zs.push(z); } } zs.sort((a, b2) => a - b2); if (zs.length > 5) { lo = zs[Math.floor(zs.length / 3)]; hi = zs[Math.floor((2 * zs.length) / 3)]; } }
  return (v) => { if (!v) return null; const parts = [v.canopy == null ? 'c?' : v.canopy >= 0.5 ? 'c1' : 'c0', v.pathDist == null ? 'p?' : v.pathDist <= 1 ? 'p1' : 'p0']; if (lo != null && v.elevation != null) parts.push(v.elevation < lo ? 'z0' : v.elevation < hi ? 'z1' : 'z2'); return parts.join(''); };
}

/**
 * Generate cells for one bed.
 * input: { bedId, bedCode, plantable (MultiPolygon), logic, params: { size?, angle? (manual) , seed? }, context, objectives: { continuity, suitability } }
 * context: { sample(x,y) -> {elevation, slope, pathDist, canopy}, pathDist(x,y), elevation(x,y), label }
 */
export function generateCells({ bedId, bedCode, plantable, logic, params = {}, context = null, objectives = {} }) {
  const L = LOGICS[logic]; if (!L) return { ok: false, error: 'unknown logic ' + logic };
  if (!plantable || !C(plantable).length || mpArea(plantable) < 2) return { ok: false, error: 'no plantable area in this bed' };
  const t0 = performance.now();
  const area = mpArea(plantable);
  const axis = principalAxis(plantable); const pathDir = pathEdgeDirection(plantable, context); const contour = contourDirection(plantable, context);
  const classOf = contextClassifier(plantable, context);
  const userSize = Number.isFinite(params.size) ? Math.max(L.minSize, Math.min(L.maxSize, params.size)) : null;
  const userAngle = Number.isFinite(params.angle) ? normDeg(params.angle) : null;
  const sizes = userSize ? [userSize] : L.sizes.filter((s) => area / (s * s) >= 2.5).slice(0, 3); if (!sizes.length) sizes.push(Math.max(L.minSize, Math.sqrt(area / 3)));
  const refs = []; // reference directions with their reason
  if (pathDir) refs.push({ deg: round(pathDir.deg, 1), why: `parallel to the path along the bed (${pathDir.lengthM} m of path edge)`, kind: 'path' });
  refs.push({ deg: round(axis, 1), why: 'along the long axis of the bed', kind: 'axis' });
  if (contour && contour.deg != null && contour.relief >= RULES.reliefForGradientM) refs.push({ deg: round(contour.deg, 1), why: `along the contours (relief ${contour.relief} m in the bed)`, kind: 'contour' });
  let angles;
  if (userAngle != null) angles = [{ deg: userAngle, why: 'set by you', kind: 'manual' }];
  else if (logic === 'honeycomb') { angles = refs.slice(); for (const a of [0, 15, 30, 45]) if (!angles.some((r) => angDiff(r.deg, a) < 3 || Math.abs(((r.deg - a) % 60 + 60) % 60) < 3)) angles.push({ deg: a, why: 'lattice rotation candidate', kind: 'grid' }); }
  else if (logic === 'bands') { angles = refs.slice(); }
  else angles = [{ deg: 0, why: 'orientation-free', kind: 'none' }];
  const seeds = logic === 'organic' ? (Number.isFinite(params.seed) ? [params.seed] : [1, 2, 3, 4, 5, 6]) : [0];
  const offsets = logic === 'honeycomb' ? [[0, 0], [0.5, 0], [0.25, 0.433]] : logic === 'bands' ? [0, 0.5] : [0];
  const cands = [];
  for (const size of sizes) for (const a of angles) for (const off of offsets) for (const sd of seeds) {
    const raw = logic === 'honeycomb' ? hexRaw(plantable, { size, angle: a.deg, offset: [off[0] * size, off[1] * size] }) : logic === 'bands' ? bandRaw(plantable, { size, angle: a.deg, offset: off * size }) : organicRaw(plantable, { size, seed: hash(bedId, sd), ctx: context });
    const cl = clipTiles(plantable, raw);
    if (!cl.parts.length) continue;
    const areas = cl.parts.map((p) => p.area); const mean = areas.reduce((s, v) => s + v, 0) / areas.length; const cv = Math.sqrt(areas.reduce((s, v) => s + (v - mean) ** 2, 0) / areas.length) / mean;
    const het = cl.parts.reduce((s, p) => s + heterogeneity(p.geom, context, classOf) * p.area, 0) / area;
    const sliver = (cl.mergedArea + cl.droppedArea) / area;
    const align = pathDir && logic !== 'organic' ? angDiff(a.deg, pathDir.deg) / 90 : 0;
    const targetN = area / (size * size * (logic === 'bands' ? RULES.bandSegment : 1)); const countDev = Math.abs(cl.parts.length - targetN) / Math.max(1, targetN); // a band's area is width × length: no count target
    const w = { sliver: 2, regularity: 0.6, mixedConditions: objectives.suitability === false ? 0.3 : 1.2, pathAlignment: objectives.continuity ? 1.5 : 0.25, count: 0.3 };
    const terms = { sliver: round(sliver, 4), regularity: round(cv, 4), mixedConditions: round(het, 4), pathAlignment: round(align, 4), count: round(countDev, 4) };
    const score = Object.entries(terms).reduce((s, [k, v]) => s + w[k] * v, 0);
    cands.push({ size, angle: a, offset: off, seed: sd, raw, cl, terms, weights: w, score: round(score, 4) });
  }
  if (!cands.length) return { ok: false, error: 'the pattern produced no cells inside this bed: make the cells smaller' };
  cands.sort((p, q) => p.score - q.score || p.size - q.size || p.angle.deg - q.angle.deg || String(p.offset).localeCompare(String(q.offset)) || p.seed - q.seed);
  const best = cands[0];
  // number cells in reading order along the pattern (stable for the same input)
  const ordered = best.cl.parts.map((p) => { const c = labelPoint(p.geom); const r = rot(c[0], c[1], -(logic === 'organic' ? 0 : best.angle.deg)); return { p, c, k: logic === 'bands' ? [p.order[0], r[0]] : [-Math.round(r[1] / (best.size * 0.5)), r[0]] }; })
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1]);
  const cells = ordered.map(({ p, c }, i) => {
    const geom = roundGeom(p.geom);
    return { id: `c.${bedCode}.${i + 1}`, n: i + 1, label: `${bedCode}·${i + 1}`, bedId, logic, geometry: geom, areaM2: round(mpArea(geom), 2), center: [round(c[0], 2), round(c[1], 2)], neighbors: [], conditions: context ? sampleCell(geom, context) : null };
  });
  // adjacency inside the bed: shared boundary ≥ tolerance
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const a = cells[i], b = cells[j]; if (!bbOverlap(bbox(a.geometry), bbox(b.geometry), 0.01)) continue;
    const Ls = sharedLength(a.geometry, b.geometry, 0.01); if (Ls >= RULES.adjacencyMinSharedM) { a.neighbors.push({ id: b.id, sharedM: round(Ls, 2) }); b.neighbors.push({ id: a.id, sharedM: round(Ls, 2) }); }
  }
  const chosen = { size: best.size, angle: logic === 'organic' ? null : best.angle.deg, offset: best.offset, seed: logic === 'organic' ? best.seed : null };
  const reason = logic === 'organic'
    ? `${cells.length} patches from a clipped Voronoi partition (Lloyd relaxation, 2 steps) of seed layout ${best.seed} of ${seeds.length}: the layout whose patches mix the fewest known site conditions (tree crown, path edge${contour && contour.relief >= RULES.reliefForGradientM ? ', elevation tercile' : ''}) and leave the fewest slivers.`
    : `${logic === 'bands' ? 'Bands' : 'Cells'} ${best.angle.why} (${round(best.angle.deg, 0)}°), ${best.size} m ${logic === 'bands' ? `wide, cut every ${round(best.size * RULES.bandSegment, 1)} m along their length` : 'across'}.`;
  const notes = [];
  if (!pathDir && logic !== 'organic') notes.push('No path runs along this bed: orientation follows the bed shape.');
  if (!(contour && contour.relief >= RULES.reliefForGradientM)) notes.push(`Relief in the bed is ${contour ? contour.relief : '?'} m: elevation is not used to orient or classify.`);
  notes.push('Sun, soil moisture and pH have no data here: they do not shape the cells.');
  if (best.cl.merged) notes.push(`${best.cl.merged} edge fragment${best.cl.merged === 1 ? '' : 's'} (< ${Math.round(RULES.fragmentMergeFraction * 100)} % of a cell) merged into a neighbour.`);
  if (best.cl.dropped) notes.push(`${round(best.cl.droppedArea, 1)} m² of slivers (< ${RULES.minCellAreaM2} m², no neighbour) left out.`);
  return {
    ok: true, bedId, logic, cells,
    params: { size: chosen.size, angle: chosen.angle, seed: chosen.seed, offset: chosen.offset, mode: userAngle != null || userSize != null ? 'manual' : 'auto' },
    adaptation: {
      chosen, explanation: reason, notes, references: refs.map((r) => ({ ...r, deg: round(r.deg, 1) })), unusedFields: ['sun', 'moisture', 'ph'],
      objectivesUsed: { continuity: !!objectives.continuity, suitability: objectives.suitability !== false },
      ranking: cands.slice(0, 6).map((c) => ({ size: c.size, angle: logic === 'organic' ? null : round(c.angle.deg, 1), angleWhy: c.angle.kind, seed: logic === 'organic' ? c.seed : undefined, cells: c.cl.parts.length, score: c.score, terms: c.terms })),
      candidates: cands.length, weights: best.weights, areaM2: round(area, 2), droppedM2: round(best.cl.droppedArea, 2), ms: Math.round(performance.now() - t0),
    },
  };
}

// cells of different beds that are close (across a path): structural proxy for resource continuity, never "flight"
export function linkAcrossBeds(cells, maxGap = RULES.nearAcrossPathM) {
  const out = []; const bb = cells.map((c) => bbox(c.geometry));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    if (cells[i].bedId === cells[j].bedId || !bbOverlap(bb[i], bb[j], maxGap)) continue;
    const g = minGap(cells[i].geometry, cells[j].geometry); if (g <= maxGap) out.push({ a: cells[i].id, b: cells[j].id, gapM: round(g, 2) });
  }
  return out;
}

// largest overlap of each old cell with the new cells (for an explicit remap preview)
export function overlapMap(oldCells, newCells) {
  const res = {};
  for (const o of oldCells) {
    let best = null, ba = 0;
    for (const n of newCells) { if (!bbOverlap(bbox(o.geometry), bbox(n.geometry))) continue; const a = mpArea(clipMP(o.geometry, n.geometry)); if (a > ba) { ba = a; best = n.id; } }
    res[o.id] = { to: best, overlapM2: round(ba, 2), share: round(ba / Math.max(1e-9, o.areaM2), 3) };
  }
  return res;
}
