// Design engine: turns one Design Assignment (a space that references a Mix, with local parameters) into planned plants.
//
//   space (fill / area / line / point)  ∩  planting beds  −  paths, structures, trunks
//   × fields of the Computational Space (elevation, distance to path / edge, tree crown, hypothetical wetness)
//   × plant knowledge (hydrology zone, shade tolerance — only records that apply in the project place)
//   × mix (roles, shares, densities, spacing, arrangement)  →  plants [x, y, z, species, role, spacing] + diagnostics
//
// Method (no random scatter): every position comes from a world-anchored lattice and every choice from a world-anchored
// dither, so the same place gives the same answer in any assignment — editing one area never re-shuffles another.
//   base roles  : one hex lattice at the finest base spacing; block / group seeds on a jittered grid (blue-noise like)
//                 claim lattice points (organic, anisotropic cells); matrix roles fill the rest plant by plant;
//                 roles with a wider spacing are thinned by "lowest hash wins" inside their spacing radius
//   overlay     : one emergent per cell of a grid sized by the density, snapped to the nearest base plant (it takes its place)
//   ephemerals  : elliptical drifts on their own grid, bulbs on a fine lattice inside each drift
//   rules       : environment changes weights (preference) or excludes (hard); a species that is excluded at a place is
//                 substituted by another species of the SAME role, otherwise the place stays unplanted with a reason.
// The analysis lattice (1 m) is never the planting lattice: fields are sampled exactly at every plant position.
import { clip, diff, union, area, disk, bufferLine, bboxOf, pointInGeom, polysOf, hash2, dither, pick, project, along, lineLength } from './geo.js';

export const ENGINE_VERSION = '0.2';
const SQ3 = Math.sqrt(3) / 2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const r3 = (v) => Math.round(v * 1000) / 1000;
export const REASONS = {
  blocked: 'inside a path, boardwalk or structure inside the bed',
  trunk: 'too close to an existing tree (approximate trunk position, from the NAIP crown centre)',
  crown: 'under an existing tree crown: no species of this role has shade tolerance recorded for this place',
  wet: 'hypothetical wetness scenario: no species of this role is listed for this hydrology class',
  outside: 'not a planting bed (path, lawn or outside the garden)',
  nospecies: 'the role has no species',
};

// ---------------------------------------------------------------- region of an assignment
export function regionOf(asg, env) {
  const beds = env.beds; const byId = new Map(beds.map((b) => [b.id, b]));
  const p = asg.params || {};
  switch (asg.type) {
    case 'fill': { const g = union((asg.bedIds || []).map((id) => byId.get(id)?.geometry)); return { geometry: g, drawnM2: area(g) }; }
    case 'area': case 'erase': case 'keep': return { geometry: asg.geometry, drawnM2: area(asg.geometry) };
    case 'line': { const w = Math.max(0.4, Math.min(12, +p.widthM || 2)); const g = bufferLine(asg.geometry.coordinates, w); return { geometry: g, drawnM2: area(g), line: asg.geometry.coordinates, widthM: w }; }
    case 'point': { const [x, y] = asg.geometry.coordinates; const n = Math.max(1, Math.min(60, p.count | 0 || 5)); const s = +p.spacingM || 0.6; const r = s * 0.6 * Math.sqrt(n) + s * 0.5; const g = disk(x, y, r, 28); return { geometry: g, drawnM2: area(g), center: [x, y], radius: r }; }
    default: return { geometry: null, drawnM2: 0 };
  }
}
export function partsOf(geometry, env) {
  const out = []; if (!geometry) return out; const gb = bboxOf(geometry);
  for (const b of env.beds) {
    const bb = env.bedBox(b.id); if (bb[2] < gb[0] || bb[0] > gb[2] || bb[3] < gb[1] || bb[1] > gb[3]) continue;
    const g = clip(b.geometry, geometry); const a = area(g); if (!(a > 0.02)) continue;
    out.push({ bedId: b.id, geom: g, bb: bboxOf(g), areaM2: a, blockers: env.unitBlockers(b.id) });
  }
  return out;
}

// ---------------------------------------------------------------- the engine
export function generate(asg, env) {
  const t0 = now();
  const { store, cs, lib } = env; const S = env.settings || {};
  const reg = regionOf(asg, env);
  const res = { ok: true, assignmentId: asg.id, type: asg.type, engine: ENGINE_VERSION, plants: newPlants(), region: reg.geometry, parts: [], unplanted: { x: [], y: [], r: [] }, diag: null };
  if (!reg.geometry) { res.ok = false; res.error = 'the assignment has no area'; return res; }
  const parts = partsOf(reg.geometry, env); res.parts = parts.map((p) => ({ bedId: p.bedId, geometry: p.geom, areaM2: r3(p.areaM2) }));
  const bedsM2 = parts.reduce((a, p) => a + p.areaM2, 0);
  const diag = res.diag = { regionM2: r3(reg.drawnM2), inBedsM2: r3(bedsM2), outsideBedsM2: r3(Math.max(0, reg.drawnM2 - bedsM2)), beds: parts.map((p) => p.bedId), roles: {}, species: {}, substitutions: {}, unplanted: {}, rules: [], fields: [], env: null, warnings: [], ms: 0 };
  if (asg.type === 'erase' || asg.type === 'keep') { diag.ms = r3(now() - t0); return res; }
  const mix = env.mix; if (!mix) { res.ok = false; res.error = 'no mix'; return res; }
  if (!parts.length) { diag.warnings.push('The space does not touch a planting bed open to design.'); diag.ms = r3(now() - t0); return res; }
  const p = asg.params || {}; const dens = Math.max(0.25, Math.min(4, +p.densityScale || 1));
  const roles = mix.roles.map((r, k) => ({ ...r, k, s: Math.max(0.12, (+r.spacingM || 0.45) / Math.sqrt(dens)), species: (r.species || []).filter((q) => q.weight > 0 && env.spIndex.has(q.id)) }));
  const base = roles.filter((r) => r.layer === 'base' && r.species.length);
  const over = roles.filter((r) => r.layer === 'overlay' && r.species.length);
  const eph = roles.filter((r) => r.layer === 'ephemeral' && r.species.length);
  for (const r of roles) if (!r.species.length) diag.warnings.push(`Role “${r.name}” has no species and is skipped.`);
  const salt = (asg.params && asg.params.seed) | 0;
  const trunkM = S.trunkM ?? 0.6;
  const trees = cs._trees || [];
  const fPath = cs.field('field.distance-to-path'), fEdge = cs.field('field.distance-to-edge'), fCan = cs.field('field.canopy');
  // HYPOTHETICAL scenario "lower ground is wetter", relative to THIS space: 1 at its lowest ground, 0 at its highest
  // (1 m sample over the space, real 3DEP elevation). A design experiment, never soil moisture; below the DEM accuracy
  // (0.1 m of relief) the space has no gradient and the scenario does nothing.
  let fWet = null, wetRange = null;
  if (S.scenarioWet) {
    let lo = Infinity, hi = -Infinity;
    for (const q of parts) for (let y = Math.ceil(q.bb[1]); y <= q.bb[3]; y++) for (let x = Math.ceil(q.bb[0]); x <= q.bb[2]; x++) { if (!pointInGeom(q.geom, x, y)) continue; const z = store.sampleElevation(x, y); if (z == null) continue; if (z < lo) lo = z; if (z > hi) hi = z; }
    if (hi - lo >= 0.1) { wetRange = [r3(lo), r3(hi)]; fWet = { id: 'hyp.low-ground-wetter (relative to this space)' }; }
    else diag.warnings.push('Hypothetical wetness: this space has less than 0.1 m of relief (the DEM accuracy), so it has no wet / dry gradient.');
  }
  const crownRule = mix.rules && mix.rules.crown === 'require-shade-knowledge';
  const needPath = roles.some((r) => r.rules && (r.rules.edge || r.rules.minPathM));
  // ---- exact field values at a position (never the 1 m cell value)
  const envAt = (x, y, bedId, withPath = needPath) => {
    const e = { canopy: 0, trunk: Infinity, dPath: null, wet: null };
    for (const t of trees) { const dx = t.x - x, dy = t.y - y; if (Math.abs(dx) > t.r + trunkM || Math.abs(dy) > t.r + trunkM) continue; const d = Math.hypot(dx, dy); if (d < e.trunk) e.trunk = d; if (d <= t.r) e.canopy = 1; }
    if (withPath) e.dPath = cs._sampleField(fPath, x, y, bedId);
    if (fWet) { const z = store.sampleElevation(x, y); e.wet = z == null ? null : Math.max(0, Math.min(1, (wetRange[1] - z) / (wetRange[1] - wetRange[0]))); }
    return e;
  };
  const wetClass = (w) => (w == null ? null : w < 1 / 3 ? 'dry' : w < 2 / 3 ? 'moist' : 'wet');
  const ORD = { dry: 0, moist: 1, wet: 2 };
  // species suitability at a place: 1 fits, (0,1) tolerated (preference), 0 excluded; reason for the exclusion
  const suitSp = (id, e) => {
    let s = 1, why = null;
    if (fWet && e.wet != null) {
      const h = lib.hydrology(id);
      if (h && h.range && h.range.length) { const c = wetClass(e.wet); if (!h.range.includes(c)) { const dmin = Math.min(...h.range.map((q) => Math.abs(ORD[q] - ORD[c]))); s *= dmin === 1 ? 0.12 : 0; if (!s) why = 'wet'; } }
    }
    if (crownRule && e.canopy) { if (lib.shadeOK(id) !== true) { s = 0; why = why || 'crown'; } }
    return { s, why };
  };
  const roleSuit = (r, e) => {
    let s = 1;
    const ru = r.rules || {};
    if (ru.edge && e.dPath != null) { const near = e.dPath <= (ru.edgeM ?? 1.2); s *= ru.edge === 'front' ? (near ? 3 : 0.35) : (near ? 0.35 : 3); }
    let best = 0, why = null; for (const q of r.species) { const v = suitSp(q.id, e); if (v.s > best) best = v.s; if (!v.s) why = why || v.why; }
    return { s: s * best, why: best ? null : why };
  };
  const chooseSp = (r, e, u, avoid) => {
    const w0 = r.species.map((q) => q.weight); const k0 = pick(w0, u);
    const ws = r.species.map((q) => q.weight * suitSp(q.id, e).s);
    let k = pick(ws, u);
    if (k >= 0 && avoid && avoid.size && r.species.length > 1) { let uu = u; for (let t = 0; t < 3 && avoid.has(r.species[k].id); t++) { uu = (uu + 0.6180339887) % 1; const kk = pick(ws, uu); if (kk >= 0) k = kk; } }
    let why = null; if (k < 0) { for (const q of r.species) { const v = suitSp(q.id, e); if (v.why) { why = v.why; break; } } }
    return { k, k0, why: why || (k < 0 ? 'nospecies' : null) };
  };
  const P = res.plants; const U = res.unplanted;
  const unplant = (x, y, why) => { U.x.push(r3(x)); U.y.push(r3(y)); U.r.push(why); diag.unplanted[why] = (diag.unplanted[why] || 0) + 1; };
  const sub = (r, from, to, why) => { const key = `${r.id}|${from}|${to}|${why}`; diag.substitutions[key] = (diag.substitutions[key] || 0) + 1; };
  const blockedAt = (part, x, y) => { for (const b of part.blockers) if (x >= b.bb[0] && x <= b.bb[2] && y >= b.bb[1] && y <= b.bb[3] && pointInGeom(b.g, x, y)) return true; return false; };
  const ptPart = (x, y) => { for (const q of parts) if (x >= q.bb[0] && x <= q.bb[2] && y >= q.bb[1] && y <= q.bb[3] && pointInGeom(q.geom, x, y)) return q; return null; };

  // the planting lattice: share-weighted spacing of the base roles; roles ≥ 1.3 × wider are thinned to their own spacing
  const shareTot = base.reduce((a, r) => a + (r.share || 0), 0);
  let s0 = base.length ? (shareTot > 0 ? base.reduce((a, r) => a + (r.share || 0) * r.s, 0) / shareTot : base[0].s) : 0.45;
  s0 = Math.min(s0, ...base.filter((r) => (r.share || 0) / (shareTot || 1) >= 0.5).map((r) => r.s)); // a dominant role is never planted wider than designed
  if (asg.type === 'point') pointCluster();
  else if (asg.type === 'line' && p.lineMode === 'rows') rows();
  else { if (base.length) baseLayer(); if (over.length && P.x.length) overlay(); }
  if (eph.length && asg.type !== 'point') ephemerals();
  validate();
  stats();
  diag.ms = r3(now() - t0);
  return res;

  // ================================================================ base layer
  function baseLayer() {
    const dy = s0 * SQ3; const cand = []; const key = (i, j) => i * 1000003 + j; const byKey = new Map();
    const lat = reg.line ? { line: reg.line, w: reg.widthM } : null;
    for (const part of parts) {
      const j0 = Math.floor(part.bb[1] / dy) - 1, j1 = Math.ceil(part.bb[3] / dy) + 1;
      for (let j = j0; j <= j1; j++) {
        const i0 = Math.floor(part.bb[0] / s0) - 1, i1 = Math.ceil(part.bb[2] / s0) + 1;
        for (let i = i0; i <= i1; i++) {
          const x = i * s0 + (j & 1) * s0 / 2 + (hash2(i, j, 7) - 0.5) * 0.26 * s0, y = j * dy + (hash2(i, j, 11) - 0.5) * 0.26 * s0;
          if (x < part.bb[0] || x > part.bb[2] || y < part.bb[1] || y > part.bb[3] || !pointInGeom(part.geom, x, y)) continue;
          if (byKey.has(key(i, j))) continue; // a lattice point on the shared edge of two parts belongs to the first
          if (blockedAt(part, x, y)) { unplant(x, y, 'blocked'); continue; }
          const dEdge = cs._sampleField(fEdge, x, y, part.bedId);
          if (dEdge != null && dEdge < Math.min(0.3, Math.max(0.1, s0 * 0.4))) continue; // stay inside the steel edging
          const e = envAt(x, y, part.bedId);
          if (e.trunk < trunkM) { unplant(x, y, 'trunk'); continue; }
          const c = { i, j, x, y, bed: part.bedId, e, h: hash2(i, j, 101 + salt), role: -1, sp: -1 };
          byKey.set(key(i, j), cand.length); cand.push(c);
        }
      }
    }
    const M = base.filter((r) => r.arrangement === 'matrix' || r.arrangement === 'intermingled');
    const PR = base.filter((r) => !M.includes(r));
    const seeds = new Map(); const SALT = 31 + salt * 7;
    let mode = lat ? 'line' : PR.length && M.length ? 'embedded' : PR.length ? 'tess' : 'mix';
    // seed grid
    let g = 1, wP = [];
    if (mode === 'embedded') { const n = PR.reduce((a, r) => a + r.share / Math.max(0.3, r.patchM2 || 2), 0); g = 1 / Math.sqrt(Math.max(1e-6, n)); wP = PR.map((r) => r.share / Math.max(0.3, r.patchM2 || 2)); }
    else if (mode === 'tess') { const tot = PR.reduce((a, r) => a + r.share, 0) || 1; const abar = PR.reduce((a, r) => a + (r.share / tot) * (r.patchM2 || 4), 0); g = Math.sqrt(Math.max(0.5, abar)); wP = PR.map((r) => r.share); }
    const initPick = (ci, cj) => { // a seed's role and species BEFORE neighbour avoidance (used by its neighbours)
      const k = `${ci},${cj}`; let sd = seeds.get(k); if (sd) return sd;
      const x = (ci + 0.5) * g + (hash2(ci, cj, SALT) - 0.5) * 0.7 * g, y = (cj + 0.5) * g + (hash2(ci, cj, SALT + 1) - 0.5) * 0.7 * g;
      const e = envAt(x, y, null);
      const rs = PR.map((r, q) => roleSuit(r, e)); const w = wP.map((v, q) => v * rs[q].s);
      const u = dither(ci, cj, SALT + 2); const rk = pick(w, u); const rk0 = pick(wP, u);
      const asp = 1 + hash2(ci, cj, SALT + 4) * 0.9; const th = hash2(ci, cj, SALT + 3) * Math.PI;
      sd = { x, y, e, rk, rk0, th, asp, u2: dither(cj, ci, SALT + 5), sp: -1, sp0: -1, why: rk < 0 ? (rs.find((q) => q.why)?.why || 'nospecies') : null };
      if (rk >= 0) { const r = PR[rk]; const c = chooseSp(r, e, sd.u2, null); sd.sp0 = c.k; }
      seeds.set(k, sd); return sd;
    };
    const finalPick = new Map();
    const seedAt = (ci, cj) => {
      const k = `${ci},${cj}`; if (finalPick.has(k)) return finalPick.get(k);
      const sd = initPick(ci, cj);
      if (sd.rk >= 0) {
        const r = PR[sd.rk]; const avoid = new Set();
        for (const [a, b] of [[-1, 0], [0, -1], [-1, -1], [1, -1]]) { const nb = initPick(ci + a, cj + b); if (nb.rk === sd.rk && nb.sp0 >= 0) avoid.add(r.species[nb.sp0].id); }
        const c = chooseSp(r, sd.e, sd.u2, avoid); sd.sp = c.k; if (c.k < 0) sd.why = c.why;
        if (sd.rk0 !== sd.rk && sd.rk0 >= 0) diag._roleShift = (diag._roleShift || 0) + 1;
      }
      finalPick.set(k, sd); return sd;
    };
    // line seeds: drifts along the curve, alternately left and right of the centre line
    let lseeds = null;
    if (mode === 'line') {
      const L = lineLength(lat.line); const tot = base.reduce((a, r) => a + r.share, 0) || 1;
      const abar = base.reduce((a, r) => a + (r.share / tot) * (r.patchM2 || 3), 0); const gl = Math.max(1, Math.sqrt(abar) * 1.25);
      lseeds = [];
      for (let k = 0, s = gl / 2; s < L; k++, s += gl) {
        const a = along(lat.line, s); const off = lat.w > 2.2 * Math.sqrt(abar) ? ((k & 1) ? 1 : -1) * lat.w * 0.2 : 0;
        const x = a.x - a.ty * off, y = a.y + a.tx * off; const e = envAt(x, y, null);
        const ws = base.map((r) => r.share * roleSuit(r, e).s); const u = dither(k, 3 * k + 1, SALT + 9);
        const rk = pick(ws, u); const rk0 = pick(base.map((r) => r.share), u);
        let sp = -1, why = null;
        if (rk >= 0) { const prev = lseeds[k - 1]; const avoid = new Set(prev && prev.rk === rk && prev.sp >= 0 ? [base[rk].species[prev.sp].id] : []); const c = chooseSp(base[rk], e, dither(3 * k + 2, k, SALT + 10), avoid); sp = c.k; why = c.why; }
        else why = 'nospecies';
        if (rk0 !== rk && rk0 >= 0) diag._roleShift = (diag._roleShift || 0) + 1;
        lseeds.push({ s, off, rk, sp, why });
      }
      lseeds.gl = gl;
    }
    for (const c of cand) {
      let r = null, k = -1, k0 = -1, why = null;
      if (mode === 'embedded' || mode === 'tess') {
        const ci = Math.floor(c.x / g), cj = Math.floor(c.y / g); let best = null, bd = Infinity;
        const noise = 1 + 0.2 * (hash2(c.i, c.j, 17) - 0.5);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const sd = initPick(ci + a, cj + b); const dx = c.x - sd.x, dy2 = c.y - sd.y;
          const co = Math.cos(sd.th), si = Math.sin(sd.th); const u = (dx * co + dy2 * si), v = (-dx * si + dy2 * co);
          let d;
          if (mode === 'embedded') { if (sd.rk < 0) continue; const R = Math.sqrt(Math.max(0.3, PR[sd.rk].patchM2 || 2) / Math.PI); d = Math.hypot(u / (R * Math.sqrt(sd.asp)), v / (R / Math.sqrt(sd.asp))) * noise; if (d > 1) continue; }
          else d = Math.hypot(u / Math.sqrt(sd.asp), v * Math.sqrt(sd.asp)) * noise;
          if (d < bd) { bd = d; best = [ci + a, cj + b]; }
        }
        if (best) { const sd = seedAt(best[0], best[1]); if (sd.rk >= 0 && sd.sp >= 0) { r = PR[sd.rk]; k = sd.sp; k0 = sd.sp0; } else if (mode === 'tess') { why = sd.why || 'nospecies'; } }
      } else if (mode === 'line') {
        const pr = project(lat.line, c.x, c.y); const kk = Math.max(0, Math.min(lseeds.length - 1, Math.floor(pr.s / lseeds.gl)));
        let best = -1, bd = Infinity;
        for (let q = Math.max(0, kk - 2); q <= Math.min(lseeds.length - 1, kk + 2); q++) { const sd = lseeds[q]; const d = Math.hypot((pr.s - sd.s) / (lseeds.gl * 0.7), (pr.off - sd.off) / Math.max(0.5, lat.w * 0.5)) * (1 + 0.25 * (hash2(c.i, c.j, 19) - 0.5)); if (d < bd) { bd = d; best = q; } }
        const sd = lseeds[best]; if (sd && sd.rk >= 0 && sd.sp >= 0) { r = base[sd.rk]; k = sd.sp; k0 = sd.sp; } else why = (sd && sd.why) || 'nospecies';
      }
      if (!r && !why && M.length) { // the matrix: role and species plant by plant
        const rs = M.map((q) => roleSuit(q, c.e)); const w = M.map((q, n) => q.share * rs[n].s);
        const u = dither(c.i, c.j, SALT + 21); const rk = pick(w, u);
        if (rk < 0) why = rs.find((q) => q.why)?.why || 'nospecies';
        else { r = M[rk]; const ch = chooseSp(r, c.e, dither(c.j, c.i, SALT + 22), null); k = ch.k; k0 = ch.k0; if (k < 0) { why = ch.why; r = null; } }
        if (rk >= 0 && pick(M.map((q) => q.share), u) !== rk) diag._roleShift = (diag._roleShift || 0) + 1;
      }
      if (r && k >= 0) { // a patch species can still be excluded at this very plant (crown edge, wet class) → same-role substitute
        const v = suitSp(r.species[k].id, c.e);
        if (!v.s) { const ch = chooseSp(r, c.e, dither(c.i, c.j, SALT + 23), null); if (ch.k >= 0) { sub(r, r.species[k].id, r.species[ch.k].id, v.why); k = ch.k; } else { why = v.why; r = null; } }
        else if (k0 >= 0 && k0 !== k) sub(r, r.species[k0].id, r.species[k].id, 'preference');
      }
      if (!r) { unplant(c.x, c.y, why || 'nospecies'); continue; }
      c.role = r.k; c.sp = k;
    }
    // wider-spaced roles: keep a lattice point only if its hash is the lowest of its role within the role's spacing
    const keep = new Uint8Array(cand.length).fill(1);
    for (let n = 0; n < cand.length; n++) {
      const c = cand[n]; if (c.role < 0) { keep[n] = 0; continue; }
      const r = roles[c.role]; if (r.s <= s0 * 1.3) continue;
      const R = r.s * 0.92; const di = Math.ceil(R / s0) + 1, dj = Math.ceil(R / dy) + 1;
      for (let a = -di; a <= di && keep[n]; a++) for (let b = -dj; b <= dj; b++) {
        const m = byKey.get(key(c.i + a, c.j + b)); if (m == null || m === n) continue; const q = cand[m];
        if (q.role !== c.role) continue; if (Math.hypot(q.x - c.x, q.y - c.y) < R && q.h < c.h) { keep[n] = 0; break; }
      }
    }
    for (let n = 0; n < cand.length; n++) if (keep[n]) { const c = cand[n]; const r = roles[c.role]; push(c.x, c.y, r.species[c.sp].id, c.role, r.s > s0 * 1.3 ? r.s : s0, c.bed); }
    diag.fields.push({ field: 'field.distance-to-edge', use: 'plants stay ≥ ' + r3(Math.min(0.3, Math.max(0.1, s0 * 0.4))) + ' m inside the bed outline' });
    diag.baseMode = mode; diag.latticeM = r3(s0);
  }

  // ================================================================ overlay (emergents / individuals): one per cell, takes a base plant's place
  function overlay() {
    const dTot = over.reduce((a, r) => a + (r.density || 0), 0) * dens; if (!(dTot > 0)) return;
    const g = 1 / Math.sqrt(dTot); const SALT = 61 + salt * 7;
    const grid = new Map(); const gk = (x, y) => `${Math.floor(x / s0)},${Math.floor(y / s0)}`;
    for (let n = 0; n < P.x.length; n++) { if (P.layer[n] !== 0) continue; const k = gk(P.x[n], P.y[n]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(n); }
    const near = (x, y, R) => { let best = -1, bd = R; const c0 = Math.floor((x - R) / s0), c1 = Math.floor((x + R) / s0), d0 = Math.floor((y - R) / s0), d1 = Math.floor((y + R) / s0); for (let a = c0; a <= c1; a++) for (let b = d0; b <= d1; b++) for (const n of grid.get(`${a},${b}`) || []) { const d = Math.hypot(P.x[n] - x, P.y[n] - y); if (d < bd) { bd = d; best = n; } } return best; };
    const bb = parts.reduce((a, q) => [Math.min(a[0], q.bb[0]), Math.min(a[1], q.bb[1]), Math.max(a[2], q.bb[2]), Math.max(a[3], q.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const wD = over.map((r) => r.density || 0); const init = new Map(); let offPath = 0, ruleSkip = 0;
    const initAt = (ci, cj) => { const k = `${ci},${cj}`; if (init.has(k)) return init.get(k); const u = dither(ci, cj, SALT); const rk = pick(wD, u); const v = { rk, sp0: rk >= 0 ? pick(over[rk].species.map((q) => q.weight), dither(cj, ci, SALT + 1)) : -1 }; init.set(k, v); return v; };
    const taken = [];
    for (let cj = Math.floor(bb[1] / g); cj <= Math.ceil(bb[3] / g); cj++) for (let ci = Math.floor(bb[0] / g); ci <= Math.ceil(bb[2] / g); ci++) {
      const iv = initAt(ci, cj); if (iv.rk < 0) continue; const r = over[iv.rk];
      const x = (ci + 0.5) * g + (hash2(ci, cj, SALT + 2) - 0.5) * 0.8 * g, y = (cj + 0.5) * g + (hash2(ci, cj, SALT + 3) - 0.5) * 0.8 * g;
      if (!ptPart(x, y)) continue; // the cell's own point decides, so narrow spaces get density × area, not more
      const n = near(x, y, g * 0.5); if (n < 0) continue;
      const bx = P.x[n], by = P.y[n]; const e = envAt(bx, by, P.bed[n]);
      const ru = r.rules || {};
      if (ru.minPathM) { const d = cs._sampleField(fPath, bx, by, P.bed[n]); if (d != null && d < ru.minPathM) { offPath++; continue; } }
      const avoid = new Set(); for (const [a, b] of [[-1, 0], [0, -1], [-1, -1], [1, -1]]) { const nb = initAt(ci + a, cj + b); if (nb.rk === iv.rk && nb.sp0 >= 0) avoid.add(r.species[nb.sp0].id); }
      const ch = chooseSp(r, e, dither(cj, ci, SALT + 1), avoid); if (ch.k < 0) { ruleSkip++; continue; }
      if (taken.some((t) => Math.hypot(t[0] - bx, t[1] - by) < Math.max(r.minDistM || 0, g * 0.45))) continue;
      taken.push([bx, by]);
      P.sp[n] = r.species[ch.k].id; P.role[n] = r.k; P.layer[n] = 1;
    }
    if (offPath) diag.rules.push({ rule: 'overlay-off-path', label: 'Emergents keep off the path edge', basis: over.map((r) => r.rules?.minPathBasis).filter(Boolean)[0] || 'role rule', field: 'field.distance-to-path', effect: `${offPath} emergent position${offPath === 1 ? '' : 's'} left as base planting` });
    if (ruleSkip) diag.rules.push({ rule: 'overlay-excluded', label: 'Emergent excluded by a site rule', field: fWet ? 'hyp.low-ground-wetter' : 'field.canopy', effect: `${ruleSkip} position${ruleSkip === 1 ? '' : 's'} left as base planting` });
  }

  // ================================================================ ephemerals: drifts with bulbs on a fine lattice
  function ephemerals() {
    eph.forEach((r, rn) => {
      const cov = Math.max(0, Math.min(0.9, (r.coverage || 0.1) * dens)); if (!cov) return;
      const a = Math.max(0.3, r.driftM2 || 2); const g = Math.sqrt(a / cov); const sb = Math.max(0.08, r.spacingM || 1 / Math.sqrt(r.densityInDrift || 16));
      const SALT = 401 + rn * 37 + salt * 7; const asp = 2.4; const ax = Math.sqrt(a * asp / Math.PI), bx = ax / asp;
      const bb = parts.reduce((q, t) => [Math.min(q[0], t.bb[0]), Math.min(q[1], t.bb[1]), Math.max(q[2], t.bb[2]), Math.max(q[3], t.bb[3])], [Infinity, Infinity, -Infinity, -Infinity]);
      const ang0 = ((mix.drift && mix.drift.angleDeg) || 0) * Math.PI / 180; const dyb = sb * SQ3;
      for (let cj = Math.floor(bb[1] / g) - 1; cj <= Math.ceil(bb[3] / g); cj++) for (let ci = Math.floor(bb[0] / g) - 1; ci <= Math.ceil(bb[2] / g); ci++) {
        const cx = (ci + 0.5) * g + (hash2(ci, cj, SALT) - 0.5) * 0.7 * g, cy = (cj + 0.5) * g + (hash2(ci, cj, SALT + 1) - 0.5) * 0.7 * g;
        let th = ang0 + (hash2(ci, cj, SALT + 2) - 0.5) * 0.7;
        if (reg.line) { const pr = project(reg.line, cx, cy); th = Math.atan2(pr.ty, pr.tx) + (hash2(ci, cj, SALT + 2) - 0.5) * 0.3; }
        const e = envAt(cx, cy, null, false); const ch = chooseSp(r, e, dither(ci, cj, SALT + 3), null); if (ch.k < 0) continue;
        const co = Math.cos(th), si = Math.sin(th); const R = ax + sb;
        for (let j = Math.floor((cy - R) / dyb); j <= Math.ceil((cy + R) / dyb); j++) for (let i = Math.floor((cx - R) / sb) - 1; i <= Math.ceil((cx + R) / sb); i++) {
          const x = i * sb + (j & 1) * sb / 2 + (hash2(i, j, SALT + 5) - 0.5) * 0.3 * sb, y = j * dyb + (hash2(i, j, SALT + 6) - 0.5) * 0.3 * sb;
          const u = (x - cx) * co + (y - cy) * si, v = -(x - cx) * si + (y - cy) * co;
          if ((u / ax) ** 2 + (v / bx) ** 2 > 1) continue;
          const part = ptPart(x, y); if (!part || blockedAt(part, x, y)) continue;
          const ee = envAt(x, y, part.bedId, false); if (ee.trunk < trunkM) continue;
          if (!suitSp(r.species[ch.k].id, ee).s) continue;
          push(x, y, r.species[ch.k].id, r.k, sb, part.bedId, 2);
        }
      }
    });
  }

  // ================================================================ point: a small group at a clicked position (phyllotaxis)
  function pointCluster() {
    const [cx, cy] = reg.center; const n = Math.max(1, Math.min(60, p.count | 0 || 5));
    const r = roles.find((q) => q.id === p.roleId && q.species.length) || over[0] || base[0]; if (!r) { diag.warnings.push('No role with species for a point.'); return; }
    const s = +p.spacingM || r.s; const list = p.speciesId ? [{ id: p.speciesId, weight: 1 }] : r.species;
    const rr = { ...r, species: list.filter((q) => env.spIndex.has(q.id)) }; if (!rr.species.length) return;
    const acc = [];
    for (let k = 0; acc.length < n && k < n * 4; k++) {
      const rad = s * 0.6 * Math.sqrt(k + 0.4), th = k * 2.399963 + hash2(Math.round(cx * 10), Math.round(cy * 10), 5) * 6.283;
      const x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad;
      const part = ptPart(x, y); if (!part) { if (k < n) unplant(x, y, 'outside'); continue; }
      if (blockedAt(part, x, y)) { unplant(x, y, 'blocked'); continue; }
      const e = envAt(x, y, part.bedId); if (e.trunk < trunkM) { unplant(x, y, 'trunk'); continue; }
      if (acc.some((q) => Math.hypot(q[0] - x, q[1] - y) < s * 0.85)) continue;
      const ch = chooseSp(rr, e, rr.species.length === 1 ? 0 : dither(k, k * 7 + 3, 71 + salt), null); if (ch.k < 0) { unplant(x, y, ch.why); continue; }
      acc.push([x, y]); push(x, y, rr.species[ch.k].id, r.k, s, part.bedId, r.layer === 'overlay' ? 1 : 0);
    }
    diag.point = { requested: n, placed: acc.length, roleId: r.id, speciesId: p.speciesId || null, spacingM: r3(s) };
  }

  // ================================================================ rows along a curve (layout plant row)
  function rows() {
    const L = lineLength(reg.line); const r0 = base[0] || over[0]; if (!r0) return;
    const s = +p.spacingM || r0.s; const n = Math.max(1, Math.round(reg.widthM / s)); const pool = base.length ? base : [r0];
    for (let m = 0; m < n; m++) {
      const off = (m - (n - 1) / 2) * s;
      for (let k = 0, t = (m & 1) * s / 2; t < L; k++, t += s) {
        const a = along(reg.line, t); const x = a.x - a.ty * off, y = a.y + a.tx * off;
        const part = ptPart(x, y); if (!part) { unplant(x, y, 'outside'); continue; }
        if (blockedAt(part, x, y)) { unplant(x, y, 'blocked'); continue; }
        const e = envAt(x, y, part.bedId); if (e.trunk < trunkM) { unplant(x, y, 'trunk'); continue; }
        const ws = pool.map((q) => q.share * roleSuit(q, e).s); const rk = pick(ws, dither(m, k, 81 + salt)); if (rk < 0) { unplant(x, y, 'nospecies'); continue; }
        const ch = chooseSp(pool[rk], e, dither(k, m, 82 + salt), null); if (ch.k < 0) { unplant(x, y, ch.why); continue; }
        push(x, y, pool[rk].species[ch.k].id, pool[rk].k, s, part.bedId, 0);
      }
    }
    diag.rows = { rows: n, spacingM: r3(s), lengthM: r3(L) };
  }

  function push(x, y, spId, roleK, size, bedId, layer = 0) {
    P.x.push(r3(x)); P.y.push(r3(y)); P.sp.push(spId); P.role.push(roleK); P.size.push(r3(size)); P.bed.push(bedId); P.layer.push(layer);
  }

  // ================================================================ validation: every plant is checked again, independently
  function validate() {
    const n = P.x.length; const bad = new Uint8Array(n); const why = {};
    const grid = new Map(); const cell = 0.5;
    for (let k = 0; k < n; k++) {
      const part = ptPart(P.x[k], P.y[k]);
      if (!part || part.bedId !== P.bed[k]) { bad[k] = 1; why.outside = (why.outside || 0) + 1; continue; }
      if (blockedAt(part, P.x[k], P.y[k])) { bad[k] = 1; why.blocked = (why.blocked || 0) + 1; continue; }
      if (P.layer[k] === 2) continue; // bulbs are a separate layer under the perennials
      const gx = Math.floor(P.x[k] / cell), gy = Math.floor(P.y[k] / cell); let clash = false;
      for (let a = -2; a <= 2 && !clash; a++) for (let b = -2; b <= 2; b++) for (const q of grid.get(`${gx + a},${gy + b}`) || []) { if (Math.hypot(P.x[q] - P.x[k], P.y[q] - P.y[k]) < 0.55 * Math.min(P.size[q], P.size[k])) { clash = true; break; } }
      if (clash) { bad[k] = 1; why.spacing = (why.spacing || 0) + 1; continue; }
      const kk = `${gx},${gy}`; let arr = grid.get(kk); if (!arr) grid.set(kk, (arr = [])); arr.push(k);
    }
    const dropped = bad.reduce((a, v) => a + v, 0);
    if (dropped) { for (const f of Object.keys(P)) P[f] = P[f].filter((_, k) => !bad[k]); }
    diag.validation = { checked: n, dropped, why, rule: 'inside its bed part · not in a path / structure · ≥ 0.55 × spacing from the nearest plant of the same layer' };
  }

  // ================================================================ numbers for feedback
  function stats() {
    const n = P.x.length; const planted = parts.reduce((a, q) => a + q.areaM2, 0);
    diag.plantedAreaM2 = r3(planted); diag.plants = n;
    const zs = []; let can = 0;
    for (let k = 0; k < n; k++) {
      const r = roles[P.role[k]]; const d = diag.roles[r.id] || (diag.roles[r.id] = { name: r.name, layer: r.layer, count: 0, areaM2: 0, target: r.layer === 'base' ? r.share : r.layer === 'overlay' ? r.density * dens : (r.coverage || 0) * dens, unit: r.layer === 'base' ? 'share of planted area' : r.layer === 'overlay' ? 'plants / m²' : 'drift coverage' });
      d.count++; d.areaM2 += P.layer[k] === 2 ? 0 : P.size[k] * P.size[k] * SQ3;
      diag.species[P.sp[k]] = (diag.species[P.sp[k]] || 0) + 1;
      const z = store.sampleElevation(P.x[k], P.y[k]); if (z != null) zs.push(z);
    }
    const baseArea = Object.values(diag.roles).filter((d) => d.layer !== 'ephemeral').reduce((a, d) => a + d.areaM2, 0) || 1;
    for (const [id, d] of Object.entries(diag.roles)) {
      d.areaM2 = r3(d.areaM2);
      const r = roles.find((q) => q.id === id);
      d.actual = d.layer === 'base' ? r3(d.areaM2 / baseArea) : d.layer === 'overlay' ? r3(d.count / Math.max(1e-6, planted)) : r3((d.count / Math.max(1, r.densityInDrift || 1 / (r.s * r.s * SQ3))) / Math.max(1e-6, planted));
    }
    for (const r of roles) if (!diag.roles[r.id] && r.species.length) diag.roles[r.id] = { name: r.name, layer: r.layer, count: 0, areaM2: 0, actual: 0, target: r.layer === 'base' ? r.share : r.layer === 'overlay' ? (r.density || 0) * dens : (r.coverage || 0) * dens, unit: r.layer === 'base' ? 'share of planted area' : r.layer === 'overlay' ? 'plants / m²' : 'drift coverage' };
    for (const t of trees) for (let k = 0; k < n; k++) if (Math.hypot(t.x - P.x[k], t.y - P.y[k]) <= t.r) can++;
    diag.env = { zMin: zs.length ? r3(Math.min(...zs)) : null, zMax: zs.length ? r3(Math.max(...zs)) : null, zSource: 'USGS 3DEP 1 m DEM, bilinear at each plant (NAVD88 m)', underCrown: can };
    diag.fields.unshift({ field: 'field.elevation', use: 'z of every plant: bilinear DEM at the plant position (display exaggeration never used)' });
    if (trees.length) diag.fields.push({ field: 'field.canopy', use: `existing tree positions: plants keep ${trunkM} m from crown centres${crownRule ? '; under crowns only species with applicable shade knowledge' : ''}` });
    if (needPath) diag.fields.push({ field: 'field.distance-to-path', use: 'role rules (edge preference / keep off the path)' });
    if (fWet) diag.fields.push({ field: 'hyp.low-ground-wetter', use: `HYPOTHETICAL scenario relative to this space (z ${wetRange[0]}–${wetRange[1]} m, 3DEP): lowest third wet, middle moist, highest third dry; species placed by the hydrology zone printed on the meadow lists`, hypothetical: true });
    if (diag._roleShift) { diag.rules.push({ rule: 'role-preference', label: 'Roles shifted by a site rule', effect: `${diag._roleShift} cell${diag._roleShift === 1 ? '' : 's'} took another role than without the rule` }); delete diag._roleShift; }
    if (crownRule) diag.rules.push({ rule: 'crown-shade-knowledge', label: 'Under tree crowns: shade knowledge required', basis: mix.rules.crownBasis, field: 'field.canopy', effect: `${can} plants under crowns; ${diag.unplanted.crown || 0} positions left unplanted` });
    if (fWet) { const sw = Object.entries(diag.substitutions).filter(([k]) => k.endsWith('|wet')).reduce((a, [, v]) => a + v, 0); diag.rules.push({ rule: 'hyp-wetness', label: 'Hypothetical: lower ground is wetter', basis: `hydrology zone per species, official meadow lists (S-OGD-MEADOW); wetness = relative elevation within the space (${wetRange ? wetRange.join('–') + ' m' : '—'}), NOT site data`, field: 'hyp.low-ground-wetter', hypothetical: true, effect: `${sw} same-role substitutions, ${diag.unplanted.wet || 0} positions unplanted` }); }
    const cell = s0 * s0 * SQ3; diag.unplantedAreaM2 = {}; for (const [k, v] of Object.entries(diag.unplanted)) diag.unplantedAreaM2[k] = r3(v * cell);
  }
}

function newPlants() { return { x: [], y: [], sp: [], role: [], size: [], bed: [], layer: [] }; }

// geometry of the assignment that can be drawn (fill = the beds, line = the band, point = the disk)
export function drawnGeometry(asg, env) { return regionOf(asg, env).geometry; }
export { union, diff, clip, area };
