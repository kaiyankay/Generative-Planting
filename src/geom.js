// Exact 2D predicates on GeoJSON-shaped geometry in local metres (no rendering, no DOM).
// Semantics: geometries are CLOSED sets. Boundary contact counts as intersecting ("touch = intersects").
// A point inside a polygon hole is outside the polygon; a point on a hole's edge is on the boundary (inside).
// Tolerance EPS = 1 mm, the snapping precision of the model.

export const EPS = 1e-3;

// ---------------------------------------------------------------- primitives
function orient(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay; const l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}
// segments intersect (closed, with tolerance)
export function segsIntersect(a, b, c, d) {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true;
  // touching / collinear cases within tolerance
  return segDist(c[0], c[1], a[0], a[1], b[0], b[1]) <= EPS || segDist(d[0], d[1], a[0], a[1], b[0], b[1]) <= EPS ||
    segDist(a[0], a[1], c[0], c[1], d[0], d[1]) <= EPS || segDist(b[0], b[1], c[0], c[1], d[0], d[1]) <= EPS;
}
// proper crossing only (interiors of both segments cross)
function segsCross(a, b, c, d) {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]), o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]), o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  const e = EPS * EPS;
  return ((o1 > e && o2 < -e) || (o1 < -e && o2 > e)) && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e));
}
function ringRaw(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function ringDist(ring, x, y) { let d = Infinity; for (let i = 0; i < ring.length - 1; i++) d = Math.min(d, segDist(x, y, ring[i][0], ring[i][1], ring[i + 1][0], ring[i + 1][1])); return d; }

// polygons of a geometry as [[outer, hole...], ...]
export function polysOf(g) { return !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
export function linesOf(g) { return !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []; }
export function pointsOf(g) { return !g ? [] : g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' ? g.coordinates : []; }
// every ring / line as a chain of segments
function chainsOf(g) { return [...polysOf(g).flat(), ...linesOf(g)]; }
function verticesOf(g) { return [...pointsOf(g), ...chainsOf(g).flat()]; }

// point vs polygon: 1 inside, 0 on boundary, -1 outside (holes respected)
export function pointInPoly(poly, x, y) {
  if (ringDist(poly[0], x, y) <= EPS) return 0;
  if (!ringRaw(poly[0], x, y)) return -1;
  for (let k = 1; k < poly.length; k++) {
    if (ringDist(poly[k], x, y) <= EPS) return 0;
    if (ringRaw(poly[k], x, y)) return -1;
  }
  return 1;
}
export function pointInGeom(g, x, y) { // closed: boundary counts
  for (const p of polysOf(g)) if (pointInPoly(p, x, y) >= 0) return true;
  return false;
}
export function distToGeom(g, x, y) {
  if (!g) return Infinity;
  if (polysOf(g).length && pointInGeom(g, x, y)) return 0;
  let best = Infinity;
  for (const c of pointsOf(g)) best = Math.min(best, Math.hypot(c[0] - x, c[1] - y));
  for (const r of chainsOf(g)) for (let i = 0; i < r.length - 1; i++) best = Math.min(best, segDist(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  return best;
}
export function bboxOf(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); };
  if (g && g.coordinates) walk(g.coordinates);
  return b;
}
export function bboxOverlap(a, b, pad = 0) { return !(a[2] + pad < b[0] || a[0] - pad > b[2] || a[3] + pad < b[1] || a[1] - pad > b[3]); }
export function bboxPolygon(q) { return { type: 'Polygon', coordinates: [[[q[0], q[1]], [q[2], q[1]], [q[2], q[3]], [q[0], q[3]], [q[0], q[1]]]] }; }

// ---------------------------------------------------------------- intersects (closed sets)
function chainsTouch(A, B) {
  for (const r of chainsOf(A)) for (const s of chainsOf(B))
    for (let i = 0; i < r.length - 1; i++) for (let j = 0; j < s.length - 1; j++) if (segsIntersect(r[i], r[i + 1], s[j], s[j + 1])) return true;
  return false;
}
export function intersects(A, B) {
  if (!A || !B) return false;
  if (!bboxOverlap(bboxOf(A), bboxOf(B), EPS)) return false;
  // any vertex / point of one inside the area of the other
  for (const v of verticesOf(A)) if (pointInGeom(B, v[0], v[1])) return true;
  for (const v of verticesOf(B)) if (pointInGeom(A, v[0], v[1])) return true;
  // points against lines (point on a line)
  for (const p of pointsOf(A)) for (const r of chainsOf(B)) if (ringDist(r, p[0], p[1]) <= EPS) return true;
  for (const p of pointsOf(B)) for (const r of chainsOf(A)) if (ringDist(r, p[0], p[1]) <= EPS) return true;
  for (const p of pointsOf(A)) for (const q of pointsOf(B)) if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= EPS) return true;
  // edges touching / crossing (covers thin objects crossing a selection with no vertex inside)
  return chainsTouch(A, B);
}
// A within B (every point of A in closed B, and A does not cross out of B)
export function within(A, B) {
  if (!A || !B || !polysOf(B).length) return false;
  for (const v of verticesOf(A)) if (!pointInGeom(B, v[0], v[1])) return false;
  for (const r of chainsOf(A)) for (const s of chainsOf(B))
    for (let i = 0; i < r.length - 1; i++) for (let j = 0; j < s.length - 1; j++) if (segsCross(r[i], r[i + 1], s[j], s[j + 1])) return false;
  // a hole of B strictly inside an area of A means A is not within B
  for (const pa of polysOf(A)) for (const pb of polysOf(B)) for (let k = 1; k < pb.length; k++) {
    const h = pb[k][0]; if (pointInPoly(pa, h[0], h[1]) > 0) return false;
  }
  // segment midpoints of A must not fall in a hole of B (edge runs across a hole)
  for (const r of chainsOf(A)) for (let i = 0; i < r.length - 1; i++) {
    const mx = (r[i][0] + r[i + 1][0]) / 2, my = (r[i][1] + r[i + 1][1]) / 2; if (!pointInGeom(B, mx, my)) return false;
  }
  return true;
}
// distance from geometry A to geometry B (0 if they intersect)
export function geomDistance(A, B) {
  if (intersects(A, B)) return 0;
  let d = Infinity;
  for (const v of verticesOf(A)) d = Math.min(d, distToGeom(B, v[0], v[1]));
  for (const v of verticesOf(B)) d = Math.min(d, distToGeom(A, v[0], v[1]));
  return d;
}

// ---------------------------------------------------------------- validation
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isXY = (c) => Array.isArray(c) && c.length >= 2 && isNum(c[0]) && isNum(c[1]);
export function validateGeometry(g) {
  const err = (m) => ({ ok: false, error: m });
  if (!g || typeof g !== 'object') return err('geometry missing');
  const ring = (r) => Array.isArray(r) && r.length >= 4 && r.every(isXY) && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  switch (g.type) {
    case 'Point': return isXY(g.coordinates) ? { ok: true } : err('Point needs [x, y]');
    case 'MultiPoint': return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every(isXY) ? { ok: true } : err('MultiPoint needs [[x, y], ...]');
    case 'LineString': return Array.isArray(g.coordinates) && g.coordinates.length >= 2 && g.coordinates.every(isXY) ? { ok: true } : err('LineString needs >= 2 points');
    case 'MultiLineString': return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every((l) => Array.isArray(l) && l.length >= 2 && l.every(isXY)) ? { ok: true } : err('MultiLineString malformed');
    case 'Polygon': return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every(ring) ? { ok: true } : err('Polygon rings must be closed, >= 4 points');
    case 'MultiPolygon': return Array.isArray(g.coordinates) && g.coordinates.length && g.coordinates.every((p) => Array.isArray(p) && p.length && p.every(ring)) ? { ok: true } : err('MultiPolygon malformed');
    default: return err('unsupported geometry type ' + g.type);
  }
}
export function areaOf(g) {
  let a = 0;
  for (const p of polysOf(g)) p.forEach((r, k) => { let s = 0; for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += (k ? -1 : 1) * Math.abs(s / 2); });
  return a;
}
