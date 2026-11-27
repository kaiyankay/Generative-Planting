// Arrangement: one CellAssignment (cell + mix version + seed) → actual plant instances.
//   target count   N = round(usable area × density)          (half up; usable = cell area minus trunk clearances)
//   per member     largest-remainder allocation of N by proportion (sum is exactly N)
//   order          structure → seasonal (small groups) → filler (pairs) → matrix (fills what is left) → ephemeral (own layer)
//   positions      seeded best-candidate sampling inside the cell polygon; hard: inside the cell, outside holes and
//                  blockers, ≥ trunk clearance from existing tree centres; soft: spacing = 0.5 × (s_i + s_j) × k with the
//                  role factor k (canopies may overlap: that is intended, not a failure). If a plant cannot be placed,
//                  the spacing is relaxed in two steps (recorded); if it still fails it is reported as not placed —
//                  counts are never reduced silently.
import { inside, bbox, mpArea, rng, hash, edgeDist } from './spatial.js';
import { ROLE_RULES, ROLE_ORDER } from './mix.js';

export const ARRANGE = { trunkClearanceM: 0.6, edgeInsetM: 0.12, candidates: 10, relax: [1, 0.75, 0.5], tries: 40 };

export function largestRemainder(n, members) {
  const raw = members.map((m) => n * m.proportion); const fl = raw.map(Math.floor); let rest = n - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
  return fl;
}

export function arrangeCell({ cell, mix, K, seed = 1, trees = [], blockers = [] }) {
  const g = cell.geometry; const bb = bbox(g);
  const clear = trees.filter((t) => t.x > bb[0] - 1 && t.x < bb[2] + 1 && t.y > bb[1] - 1 && t.y < bb[3] + 1 && inside(g, t.x, t.y));
  const usable = Math.max(0, mpArea(g) - clear.length * Math.PI * ARRANGE.trunkClearanceM ** 2);
  const N = Math.round(usable * mix.density.value + 1e-9);
  const counts = largestRemainder(N, mix.members);
  const R = rng(hash(cell.id, mix.id, mix.version, seed));
  const grid = new Map(); const cs = 0.5; const key = (x, y) => `${Math.floor(x / cs)},${Math.floor(y / cs)}`;
  const placed = []; const notes = []; const proxies = new Set(); let relaxed = 0;
  const spread = (id) => { const t = K.traits(id); if (t.proxy || t.sizeBasis) proxies.add(id); return Math.max(0.15, Math.min(2.5, t.spreadM || 0.5)); };
  const ok = (x, y, r, layer) => {
    if (!inside(g, x, y)) return false; if (edgeDist(g, x, y) < ARRANGE.edgeInsetM) return false;
    for (const t of clear) if ((t.x - x) ** 2 + (t.y - y) ** 2 < ARRANGE.trunkClearanceM ** 2) return false;
    for (const b of blockers) if (x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && b.test(x, y)) return false;
    const reach = Math.ceil((r + 1.3) / cs); const gx = Math.floor(x / cs), gy = Math.floor(y / cs);
    for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) { const a = grid.get(`${gx + i},${gy + j}`); if (!a) continue; for (const p of a) { if (p.layer !== layer) continue; const need = (r + p.r) * 0.5; if ((p.x - x) ** 2 + (p.y - y) ** 2 < need * need) return false; } }
    return true;
  };
  const put = (x, y, m, r, layer) => { const p = { x: +x.toFixed(3), y: +y.toFixed(3), plantId: m.plantId, role: m.role, r, layer, spacing: +(r).toFixed(3) }; placed.push(p); const k = key(x, y); (grid.get(k) || grid.set(k, []).get(k)).push(p); return p; };
  const randIn = () => { for (let t = 0; t < 60; t++) { const x = bb[0] + R() * (bb[2] - bb[0]), y = bb[1] + R() * (bb[3] - bb[1]); if (inside(g, x, y)) return [x, y]; } return null; };
  // best candidate: of k random candidates that are valid, the one farthest from same-layer plants
  const nearestD = (x, y, layer) => { let d = 9; const gx = Math.floor(x / cs), gy = Math.floor(y / cs); for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const a = grid.get(`${gx + i},${gy + j}`); if (a) for (const p of a) if (p.layer === layer) d = Math.min(d, Math.hypot(p.x - x, p.y - y)); } return d; };
  const placeOne = (m, r0, layer, around = null) => {
    for (const k of ARRANGE.relax) {
      const r = r0 * k; let best = null, bd = -1;
      for (let t = 0; t < ARRANGE.tries && (best == null || t < ARRANGE.candidates); t++) {
        let c; if (around) { const a = R() * Math.PI * 2, d = r * (0.8 + R() * 1.4); c = [around[0] + Math.cos(a) * d, around[1] + Math.sin(a) * d]; } else c = randIn();
        if (!c || !ok(c[0], c[1], r, layer)) continue; const d = nearestD(c[0], c[1], layer); if (d > bd) { bd = d; best = c; }
      }
      if (best) { if (k < 1) relaxed++; return put(best[0], best[1], m, r, layer); }
    }
    return null;
  };
  const byRole = ROLE_ORDER.flatMap((role) => mix.members.map((m, i) => ({ m, i })).filter((q) => q.m.role === role));
  const requested = {}, got = {};
  for (const { m, i } of byRole) {
    const n = counts[i]; requested[m.plantId] = n; got[m.plantId] = 0; if (!n) continue;
    const rr = ROLE_RULES[m.role] || ROLE_RULES.seasonal; const r0 = spread(m.plantId) * rr.spacingK; const layer = m.role === 'ephemeral' ? 1 : 0;
    let left = n;
    while (left > 0) {
      const lead = placeOne(m, r0, layer); if (!lead) break; got[m.plantId]++; left--;
      const k = Math.min(left, Math.max(0, Math.round(rr.cluster - 1 + (R() - 0.5) * 2)));
      let anchor = [lead.x, lead.y];
      for (let j = 0; j < k; j++) { const p = placeOne(m, r0, layer, anchor); if (!p) break; got[m.plantId]++; left--; anchor = R() < 0.5 ? [p.x, p.y] : anchor; }
    }
  }
  const missing = Object.entries(requested).filter(([id, n]) => got[id] < n).map(([id, n]) => ({ plantId: id, requested: n, placed: got[id] }));
  if (relaxed) notes.push(`${relaxed} plant${relaxed === 1 ? '' : 's'} placed with relaxed spacing (×0.75 or ×0.5)`);
  if (missing.length) notes.push(`capacity: ${missing.reduce((a, q) => a + q.requested - q.placed, 0)} plant(s) could not be placed at the spacing of their role — not removed from the target, reported`);
  if (clear.length) notes.push(`${clear.length} existing tree trunk${clear.length === 1 ? '' : 's'} kept clear (${ARRANGE.trunkClearanceM} m)`);
  return {
    cellId: cell.id, mixId: mix.id, mixVersion: mix.version, seed, usableM2: +usable.toFixed(2), target: N, requested, placed: got, missing, relaxed, notes,
    proxies: [...proxies], spacingBasis: 'nominal spread of the display proxy × role factor (no spread records for these plants)',
    plants: placed.map((p) => ({ x: p.x, y: p.y, plantId: p.plantId, role: p.role, spacing: p.spacing })),
  };
}
