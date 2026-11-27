// Geometry helpers for the design layer: polygon booleans (vendored polygon-clipping), line buffers, curve smoothing,
// deterministic hashes. Everything is in the model's local metres (x east, y north).
import polygonClipping from '../../vendor/polygon-clipping/polygon-clipping.esm.js';
import { polysOf, areaOf, bboxOf, pointInGeom } from '../geom.js';

export { areaOf, bboxOf, pointInGeom, polysOf };
const C = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const MP = (c) => (c && c.length ? { type: 'MultiPolygon', coordinates: c } : null);

export function clip(a, b) { if (!a || !b) return null; return MP(polygonClipping.intersection(C(a), C(b))); }
export function diff(a, ...bs) { if (!a) return null; const L = bs.filter(Boolean); if (!L.length) return a.type === 'MultiPolygon' ? a : MP(C(a)); return MP(polygonClipping.difference(C(a), ...L.map(C))); }
export function union(list) { const L = list.filter(Boolean); if (!L.length) return null; if (L.length === 1) return L[0].type === 'MultiPolygon' ? L[0] : MP(C(L[0])); return MP(polygonClipping.union(...L.map(C))); }
export const area = (g) => (g ? areaOf(g) : 0);

// circle as a polygon (n sides)
export function disk(x, y, r, n = 24) { const ring = []; for (let k = 0; k <= n; k++) { const a = (k % n) / n * Math.PI * 2; ring.push([+(x + Math.cos(a) * r).toFixed(4), +(y + Math.sin(a) * r).toFixed(4)]); } return { type: 'Polygon', coordinates: [ring] }; }

// buffer of a polyline: union of one quad per segment and a round joint at every vertex (exact enough for planting bands)
export function bufferLine(coords, w) {
  const h = w / 2; const parts = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const [ax, ay] = coords[i], [bx, by] = coords[i + 1]; const L = Math.hypot(bx - ax, by - ay); if (L < 1e-6) continue;
    const nx = -(by - ay) / L * h, ny = (bx - ax) / L * h;
    parts.push({ type: 'Polygon', coordinates: [[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny], [ax + nx, ay + ny]]] });
  }
  for (const [x, y] of coords) parts.push(disk(x, y, h, 16));
  return union(parts);
}

// freehand input → a light, even polyline: drop near-duplicates, Chaikin smoothing, resample at a fixed step
export function smoothLine(pts, { step = 0.6, iterations = 2 } = {}) {
  let p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.05);
  if (p.length < 2) return p;
  for (let k = 0; k < iterations; k++) {
    const o = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    o.push(p[p.length - 1]); p = o;
  }
  return resample(p, step);
}
export function resample(p, step) {
  const out = [p[0]]; let carry = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); let t = step - carry;
    while (t <= L) { out.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]); t += step; }
    carry = L - (t - step);
  }
  const last = p[p.length - 1]; if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.3) out.push(last);
  return out.map((q) => [+q[0].toFixed(3), +q[1].toFixed(3)]);
}
export function lineLength(p) { let s = 0; for (let i = 0; i < p.length - 1; i++) s += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); return s; }
// point and unit tangent at arc length s along a polyline
export function along(p, s) {
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= L || i === p.length - 2) { const t = L ? Math.min(1, Math.max(0, s / L)) : 0; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx: L ? (b[0] - a[0]) / L : 1, ty: L ? (b[1] - a[1]) / L : 0 }; }
    s -= L;
  }
  return { x: p[0][0], y: p[0][1], tx: 1, ty: 0 };
}
// nearest point on a polyline: arc length, signed offset (left +), tangent
export function project(p, x, y) {
  let best = { d: Infinity }; let acc = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1]; const L2 = dx * dx + dy * dy; const L = Math.sqrt(L2);
    const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
    const qx = a[0] + dx * t, qy = a[1] + dy * t; const d = Math.hypot(x - qx, y - qy);
    if (d < best.d) { const side = Math.sign(dx * (y - a[1]) - dy * (x - a[0])) || 1; best = { d, s: acc + t * L, off: side * d, tx: L ? dx / L : 1, ty: L ? dy / L : 0 }; }
    acc += L;
  }
  return best;
}

// ---- deterministic hashes (world-anchored: the same place gives the same value in every assignment)
export function hash2(i, j, salt = 0) {
  let h = Math.imul((i | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((j | 0) + 0x5bd1e995, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
// R2 low-discrepancy dither over a 2D index, lightly broken up so it does not show as diagonal stripes
const A1 = 0.7548776662466927, A2 = 0.5698402909980532;
export function dither(i, j, salt = 0) { const v = 0.5 + i * A1 + j * A2 + (salt % 1000) * 0.0131 + 0.18 * (hash2(i, j, salt) - 0.5); return v - Math.floor(v); }
export function pick(weights, u) { let tot = 0; for (const w of weights) tot += w; if (!(tot > 0)) return -1; let t = u * tot; for (let k = 0; k < weights.length; k++) { t -= weights[k]; if (t < 0 && weights[k] > 0) return k; } for (let k = weights.length - 1; k >= 0; k--) if (weights[k] > 0) return k; return -1; }

export function fnv(arr) { let h = 2166136261 >>> 0; for (const v of arr) { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; } return h.toString(36); }
// a freehand ring may cross itself: union resolves it into valid (multi)polygons
export function clean(g) { if (!g) return null; try { return MP(polygonClipping.union(C(g))); } catch { return null; } }
export function ringFrom(pts) { const r = pts.map((q) => [+q[0].toFixed(3), +q[1].toFixed(3)]); if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0].slice()); return { type: 'Polygon', coordinates: [r] }; }
export function centroid(g) { let A = 0, cx = 0, cy = 0; for (const poly of polysOf(g)) { const r = poly[0]; for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; A += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; } } return A ? [cx / (3 * A), cy / (3 * A)] : null; }
