// Fill engine (V2): ONE generative backend for the live brush, Cell Fill and Auto Compose.
// Land Kit-inspired order (independent JS implementation, no Land Kit code): Environment → Niche → region → system layers →
// counts → candidate placement → constrained validation → instance output.
//
//   Candidate positions are WORLD-ANCHORED lattices, one per (mix id @ version, layer, member for area layers):
//     area layer   member m packs on a hex lattice at its spacing s_m (density 1 / (0.866 s²)); a grain field (jittered
//                  seeds at the layer's grain, each seed choosing a member by area share) decides where each member grows:
//                  fine grain = intermingled matrix, coarse grain = groups / blocks
//     count layer  one hex lattice at the layer density; species by proportion — per point (scatter) or per cluster seed
//                  (clusters of ≈ 3–5, grain = 2.1 × lattice spacing)
//     drift layer  a hex lattice at the density inside the drift, kept only where a drift seed (grain 2.5 m) is "on"
//                  (each seed on with probability = coverage)
//   Because the lattices are anchored in the world, painting the same mix twice over the same ground yields the SAME
//   candidate ids (no stacking), a stroke can be extended live (each pointer move only reveals new lattice points) and a
//   whole-cell fill and a brush agree exactly.
//   Validation (hard): inside the region (cell ∩ footprint; cells exclude paths / water / structures), ≥ 0.08 m from the
//   cell edge, ≥ 0.6 m from existing tree trunks, not in a frozen cell, centre ≥ 0.12 m from any plant of another layer,
//   ≥ 0.6 × the smaller spacing from a plant of the same layer. A rejected candidate is counted (shortfall), never moved
//   into a constraint.
//   Niche (soft, Land Kit "Rule Restriction"): a member recorded for the other light than the local crown proxy at the
//   point is substituted by a member of the same layer recorded for that light (weighted by share); if none fits it is
//   kept and flagged 'conflict'. Unknown light or unknown crown stays 'unknown' — never treated as suitable.
import { hash, inside, bbox } from './spatial.js';
import { ROLE_DEF, hexDensity } from './mix.js';

export const FILL = { edgeInsetM: 0.08, trunkClearanceM: 0.6, centreClearanceM: 0.12, sameLayerK: 0.6, driftGrainM: 2.5, clusterK: 2.1 };
const SQ3 = Math.sqrt(3);
const u01 = (...p) => hash(...p) / 4294967296;

// hex lattice points inside a bbox: spacing a, world anchor from the salt, jitter ±0.17 a (deterministic per point)
function hexPoints(b, a, salt, cb) {
  const dy = a * SQ3 / 2; const ox = u01(salt, 'ox') * a, oy = u01(salt, 'oy') * dy;
  const j0 = Math.floor((b[1] - oy) / dy) - 1, j1 = Math.ceil((b[3] - oy) / dy) + 1;
  for (let j = j0; j <= j1; j++) {
    const sx = ox + (j & 1 ? a / 2 : 0); const i0 = Math.floor((b[0] - sx) / a) - 1, i1 = Math.ceil((b[2] - sx) / a) + 1;
    for (let i = i0; i <= i1; i++) {
      const h1 = u01(salt, i, j), h2 = u01(salt, j, i, 'y');
      const x = sx + i * a + (h1 - 0.5) * 0.34 * a, y = oy + j * dy + (h2 - 0.5) * 0.34 * a;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      cb(x, y, i, j);
    }
  }
}
// grain field: jittered square seeds at grain g; nearest seed (3 × 3 search) → its index key
function seedKey(x, y, g, salt) {
  const gi = Math.floor(x / g), gj = Math.floor(y / g); let best = null, bd = Infinity;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = gi + di, j = gj + dj; const sx = (i + 0.15 + 0.7 * u01(salt, 'gx', i, j)) * g, sy = (j + 0.15 + 0.7 * u01(salt, 'gy', i, j)) * g;
    const d = (sx - x) ** 2 + (sy - y) ** 2; if (d < bd) { bd = d; best = `${i},${j}`; }
  }
  return best;
}
function pickWeighted(list, key, u) { let tot = 0; for (const m of list) tot += m[key]; let t = u * tot; for (let k = 0; k < list.length; k++) { t -= list[k][key]; if (t <= 0) return k; } return list.length - 1; }

// light fit of a plant at a point: 'match' | 'conflict' | 'unknown'
function lightFit(t, shade) {
  if (!t || t.light.status === 'unknown' || shade == null) return 'unknown';
  const v = t.light.value; return (shade ? v.includes('shade') || v.includes('part') : v.includes('sun') || v.includes('part')) ? 'match' : 'conflict';
}

/**
 * Environment for a project: tree trunks, a crown sampler (probable shade proxy), frozen test. Built once per fill call.
 */
export function makeEnv(P, { frozen = null } = {}) {
  const ctx = P.context(); const trees = P.trees();
  return {
    trees, K: P.K,
    shadeAt: (x, y) => { const v = ctx.sample(x, y); return v && v.canopy != null && Number.isFinite(v.canopy) ? v.canopy >= 0.5 : null; },
    frozen: frozen || ((cellId) => !!(P.state.locks && P.state.locks[cellId])),
  };
}

// a simple spatial hash of existing plants for clearance checks
export class PlantIndex {
  constructor(cs = 0.6) { this.cs = cs; this.g = new Map(); }
  key(x, y) { return `${Math.floor(x / this.cs)},${Math.floor(y / this.cs)}`; }
  add(p) { const k = this.key(p.x, p.y); let a = this.g.get(k); if (!a) this.g.set(k, (a = [])); a.push(p); }
  remove(p) { const a = this.g.get(this.key(p.x, p.y)); if (a) { const i = a.indexOf(p); if (i >= 0) a.splice(i, 1); } }
  near(x, y, r, cb) { const n = Math.ceil(r / this.cs); const gx = Math.floor(x / this.cs), gy = Math.floor(y / this.cs); for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) { const a = this.g.get(`${gx + i},${gy + j}`); if (a) for (const p of a) if (cb(p) === false) return; } }
}

/**
 * Candidate plants of a mix inside a bbox (unvalidated), in a deterministic order.
 * layers: array of layer ids to use (null = all). Returns [{key, x, y, plantId, role, slot, layerId, spacing}]
 */
// a layer's signature: its own parameters only, so editing one layer never moves the plants of the others
export function layerSig(L) { const o = { b: L.basis, a: L.arrangement, g: L.grainM || 0, d: L.density || 0, c: L.coverage || 0, dd: L.densityInDrift || 0, m: L.members.map((m) => [m.plantId, +(m.share || m.proportion || 0).toFixed(4), m.spacingM || 0]) }; return hash(JSON.stringify(o)).toString(36); }
export function candidates(mix, b, { layers = null, seed = 1 } = {}) {
  const out = [];
  for (const L of mix.layers) {
    if (layers && !layers.includes(L.id) && !layers.includes(L.slot)) continue;
    if (!L.members.length) continue;
    const sig = layerSig(L); const mk = `${mix.id}|${sig}` + (seed > 1 ? `#${seed}` : '');
    if (L.basis === 'area') {
      const g = L.grainM || ({ intermingled: 0.5, matrix: 0.7, groups: 1.4, blocks: 2.2 }[L.arrangement] || 0.8);
      const owner = new Map(); const ownerOf = (x, y) => { const k = seedKey(x, y, g, mk + L.id); let v = owner.get(k); if (v == null) { v = pickWeighted(L.members, 'share', u01(mk, L.id, 'seed', k)); owner.set(k, v); } return v; };
      L.members.forEach((m, mi) => {
        const a = m.spacingM || 0.45; const salt = `${mk}|${L.id}|${m.plantId}`;
        hexPoints(b, a, salt, (x, y, i, j) => { if (ownerOf(x, y) !== mi) return; out.push({ key: `${L.id}/${mi}/${i},${j}`, x, y, mi, plantId: m.plantId, role: m.role, slot: L.slot, layerId: L.id, sig, spacing: a }); });
      });
    } else if (L.basis === 'count') {
      const a = Math.sqrt(1 / (0.866 * Math.max(0.02, L.density))); const salt = `${mk}|${L.id}`; const clusters = L.arrangement === 'clusters';
      const g = clusters ? (L.grainM || a * FILL.clusterK) : 0; const memo = new Map();
      hexPoints(b, a, salt, (x, y, i, j) => {
        let mi; if (clusters) { const k = seedKey(x, y, g, salt); mi = memo.get(k); if (mi == null) { mi = pickWeighted(L.members, 'proportion', u01(salt, 'c', k)); memo.set(k, mi); } }
        else mi = pickWeighted(L.members, 'proportion', u01(salt, 'p', i, j));
        const m = L.members[mi]; out.push({ key: `${L.id}/${i},${j}`, x, y, mi, plantId: m.plantId, role: m.role, slot: L.slot, layerId: L.id, sig, spacing: Math.min(a, 0.9) });
      });
    } else if (L.basis === 'drift') {
      const a = Math.sqrt(1 / (0.866 * Math.max(0.5, L.densityInDrift))); const salt = `${mk}|${L.id}`; const g = L.grainM || FILL.driftGrainM; const on = new Map();
      hexPoints(b, a, salt, (x, y, i, j) => {
        const k = seedKey(x, y, g, salt + 'd'); let v = on.get(k); if (v == null) { const u = u01(salt, 'on', k); v = u < (L.coverage || 0) ? pickWeighted(L.members, 'proportion', u01(salt, 'sp', k)) : -1; on.set(k, v); }
        if (v < 0) return; const m = L.members[v]; out.push({ key: `${L.id}/${i},${j}`, x, y, mi: v, plantId: m.plantId, role: m.role, slot: L.slot, layerId: L.id, sig, spacing: Math.max(0.08, Math.min(a, 0.3)) });
      });
    }
  }
  return out;
}

/**
 * Validate candidates into plants for one cell (region = cell geometry, optionally ∩ a footprint test).
 * index: PlantIndex of plants that stay (other layers / outside the footprint); accepted plants are added to it.
 * Returns { plants, rejected: {edge, trunk, clearance}, niche: {match, conflict, unknown, substituted} }
 */
export function validate(cands, { cell, mix, env, index, within = null, fragId = null, existingKeys = null, seed = 1 }) {
  const plants = []; const rej = { edge: 0, trunk: 0, clearance: 0 }; const niche = { match: 0, conflict: 0, unknown: 0, substituted: 0 };
  const g = cell.geometry; const cb = cell._bb || (cell._bb = bbox(g));
  const trees = env.trees.filter((t) => t.x > cb[0] - 1 && t.x < cb[2] + 1 && t.y > cb[1] - 1 && t.y < cb[3] + 1);
  const K = env.K; const layerById = new Map(mix.layers.map((L) => [L.id, L]));
  const lightKnown = mix.layers.some((L) => L.members.some((m) => K.traits(m.plantId).light.status !== 'unknown'));
  for (const c of cands) {
    if (c.x < cb[0] || c.x > cb[2] || c.y < cb[1] || c.y > cb[3]) continue;
    if (!inside(g, c.x, c.y)) continue; if (within && !within(c.x, c.y)) continue;
    const id = `${mix.id}/${c.sig}${seed > 1 ? '#' + seed : ''}/${c.key}`;
    if (existingKeys && existingKeys.has(id)) continue; // already there (same lattice point): no stacking
    if (edgeNear(g, c.x, c.y, FILL.edgeInsetM)) { rej.edge++; continue; }
    if (trees.some((t) => (t.x - c.x) ** 2 + (t.y - c.y) ** 2 < FILL.trunkClearanceM ** 2)) { rej.trunk++; continue; }
    let clash = false; const reach = Math.max(FILL.centreClearanceM, c.spacing);
    index.near(c.x, c.y, reach, (p) => { const d2 = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; const need = p.slot === c.slot ? FILL.sameLayerK * Math.min(p.spacing, c.spacing) : FILL.centreClearanceM; if (d2 < need * need) { clash = true; return false; } return true; });
    if (clash) { rej.clearance++; continue; }
    // niche: local probable shade vs the member's recorded light
    let plantId = c.plantId, role = c.role, fit = 'unknown', sub = false;
    if (lightKnown) {
      const shade = env.shadeAt(c.x, c.y); fit = lightFit(K.traits(plantId), shade);
      if (fit === 'conflict') {
        const L = layerById.get(c.layerId); const key = L.basis === 'area' ? 'share' : 'proportion';
        const ok = L.members.filter((m) => lightFit(K.traits(m.plantId), shade) === 'match');
        if (ok.length) { const m = ok[pickWeighted(ok, key, u01(id, 'sub'))]; plantId = m.plantId; role = m.role; fit = 'match'; sub = true; }
      }
    }
    niche[fit]++; if (sub) niche.substituted++;
    const p = { id, x: +c.x.toFixed(3), y: +c.y.toFixed(3), plantId, role, slot: c.slot, layerId: c.layerId, mixId: mix.id, mixVersion: mix.version, spacing: +c.spacing.toFixed(3), fit, frag: fragId };
    if (sub) p.sub = c.plantId;
    plants.push(p); index.add(p);
  }
  return { plants, rejected: rej, niche };
}
function edgeNear(g, x, y, d) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; const d2 = d * d;
  for (const p of polys) for (const r of p) for (let i = 0; i < r.length - 1; i++) { const [ax, ay] = r[i], [bx, by] = r[i + 1]; const vx = bx - ax, vy = by - ay; const L2 = vx * vx + vy * vy; let t = L2 ? ((x - ax) * vx + (y - ay) * vy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = ax + t * vx - x, ey = ay + t * vy - y; if (ex * ex + ey * ey < d2) return true; }
  return false;
}
// target count of a mix over an area for the given layers (expected individuals, before validation)
export function targetCount(mix, areaM2, layers = null) {
  let n = 0; for (const L of mix.layers) { if (layers && !layers.includes(L.id) && !layers.includes(L.slot)) continue; for (const m of L.members) n += areaM2 * (L.basis === 'area' ? (m.share || 0) * hexDensity(m.spacingM || 0.45) : L.basis === 'drift' ? (m.proportion || 0) * (L.coverage || 0) * (L.densityInDrift || 0) : (m.proportion || 0) * (L.density || 0)); }
  return n;
}
export const slotOfRole = (r) => (ROLE_DEF[r] ? ROLE_DEF[r].slot : r === 'ephemeral' ? 'ephemeral' : r === 'matrix' ? 'base' : 'overlay');
