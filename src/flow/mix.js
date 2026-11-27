// Mix (gp.mix/2): an editable, reusable, LAYERED community recipe of one Planting System.
//
//   Objective ≠ Spatial Logic ≠ Planting System ≠ Mix ≠ Arrangement.
//   A Planting System (Matrix Based, True Meadow, Maximal Color, Under Trees — course slides P34, P41) names functional
//   roles. A Mix fills those roles with plants, in LAYERS that are computed independently:
//     base      basis 'area'  — members share the ground (shares sum to 100 % of the area); each member packs at its own
//                                spacing (hex packing: 1 / (0.866 s²) plants / m²); grain decides how the shares are
//                                distributed in space (fine = intermingled matrix, coarse = blocks / groups)
//     overlay   basis 'count' — an independent density (plants / m²) over the base; members split it by proportion
//                                (sum 100 %); emergents / fillers / colour themes; canopies may overlap the base, centres not
//     ephemeral basis 'drift' — bulbs: a coverage fraction of the area in drifts × a density inside the drift
//   Each layer is a separate 100 %: nothing forces base and overlays to share one total. Role = the plant's relation in
//   THIS mix / system, not a global species label. A Mix has no geometry; the fill engine (fill.js) turns it into
//   instances wherever it is painted. Every edit creates version + 1; a local variant references its source.
export const MIX_SCHEMA = 'gp.mix/2';
export const DEFAULT_DENSITY = 4.5; // V1 fallback only (plants / m²) — never applied to every layer / species in V2
export const PALETTE = ['#6F8F5E', '#C0864F', '#8E7AA6', '#4F86A0', '#B59B3E', '#A8687C', '#5E8C7A', '#9C7552', '#7480B0', '#B0729A'];

// functional roles (course slides P34 / P41); family = the V1 role family the knowledge layer can hint at
export const ROLE_DEF = {
  matrix: { name: 'Long-lived matrix', family: 'matrix', slot: 'base' },
  groundcover: { name: 'Groundcover', family: 'filler', slot: 'base' },
  cool: { name: 'Cool-season grower', family: 'matrix', slot: 'base' },
  warm: { name: 'Warm-season grower', family: 'matrix', slot: 'base' },
  fixer: { name: 'Nitrogen fixer', family: 'filler', slot: 'base' },
  block: { name: 'Base block', family: 'seasonal', slot: 'base' },
  clumping: { name: 'Clumping', family: 'structure', slot: 'base' },
  clonal: { name: 'Clonal spreading', family: 'matrix', slot: 'base' },
  winter: { name: 'Winter-present', family: 'structure', slot: 'base' },
  emergent: { name: 'Emergent forb', family: 'structure', slot: 'overlay' },
  filler: { name: 'Dynamic filler', family: 'filler', slot: 'overlay' },
  theme: { name: 'Colour theme', family: 'seasonal', slot: 'overlay' },
  structure: { name: 'Structure', family: 'structure', slot: 'overlay' },
  seasonal: { name: 'Seasonal', family: 'seasonal', slot: 'overlay' },
  ephemeral: { name: 'Ephemeral', family: 'ephemeral', slot: 'ephemeral' },
};
export const ROLE_ORDER = Object.keys(ROLE_DEF);
export const ROLE_RULES = { structure: { spacingK: 1 }, seasonal: { spacingK: 0.8 }, filler: { spacingK: 0.7 }, matrix: { spacingK: 0.7 }, ephemeral: { spacingK: 0.4 } }; // V1 (kept for old tests)
export const ARRANGEMENTS = {
  intermingled: { name: 'Intermingled', grainM: 0.5, note: 'species mixed plant by plant (matrix)' },
  matrix: { name: 'Matrix', grainM: 0.7, note: 'a fine, even matrix with small runs of one species' },
  groups: { name: 'Groups', grainM: 1.4, note: 'groups of one species, a few plants each' },
  blocks: { name: 'Blocks', grainM: 2.2, note: 'blocks of one species (paint-by-number masses)' },
  clusters: { name: 'Clusters', grainM: 1.0, note: 'small clusters of 3–5 among the base' },
  scatter: { name: 'Scatter', grainM: 0.0, note: 'single plants scattered through the base' },
  drift: { name: 'Drifts', grainM: 2.5, note: 'drifts covering part of the area' },
};

// Planting System templates (slides P34): layers and roles; members are filled from a recipe or by the designer.
// Numbers are PROTOTYPE ASSUMPTIONS (editable, disclosed in ALGORITHMS_V2.md), not values from the slides.
export const SYSTEMS = {
  'matrix-based': { id: 'matrix-based', name: 'Matrix Based', blurb: 'A long-lived grass / sedge matrix with emergent forbs rising through it.', slides: 'P34–36',
    layers: [
      { id: 'base', slot: 'base', name: 'Matrix + groundcover', basis: 'area', arrangement: 'matrix', roles: ['matrix', 'groundcover'], shares: { matrix: 0.75, groundcover: 0.25 }, spacing: { matrix: 0.45, groundcover: 0.35 } },
      { id: 'emergent', slot: 'overlay', name: 'Emergent forbs', basis: 'count', arrangement: 'clusters', density: 1.2, roles: ['emergent'] },
      { id: 'filler', slot: 'overlay', name: 'Dynamic fillers', basis: 'count', arrangement: 'scatter', density: 0.3, roles: ['filler'] },
    ] },
  'true-meadow': { id: 'true-meadow', name: 'True Meadow', blurb: 'Cool- and warm-season growers intermingled, with nitrogen fixers and fillers.', slides: 'P34',
    layers: [
      { id: 'base', slot: 'base', name: 'Grasses + fixers', basis: 'area', arrangement: 'intermingled', roles: ['warm', 'cool', 'fixer'], shares: { warm: 0.5, cool: 0.35, fixer: 0.15 }, spacing: { warm: 0.45, cool: 0.4, fixer: 0.6 } },
      { id: 'filler', slot: 'overlay', name: 'Dynamic fillers', basis: 'count', arrangement: 'scatter', density: 0.8, roles: ['filler'] },
    ] },
  'maximal-color': { id: 'maximal-color', name: 'Maximal Color', blurb: 'Base blocks of colour, emergents for seasonal events, ephemerals in drifts.', slides: 'P34, P41',
    layers: [
      { id: 'base', slot: 'base', name: 'Base blocks', basis: 'area', arrangement: 'blocks', roles: ['block'], shares: { block: 1 }, spacing: { block: 0.45 } },
      { id: 'emergent', slot: 'overlay', name: 'Emergents', basis: 'count', arrangement: 'scatter', density: 0.8, roles: ['emergent'] },
      { id: 'ephemeral', slot: 'ephemeral', name: 'Ephemerals', basis: 'drift', arrangement: 'drift', coverage: 0.25, densityInDrift: 14, roles: ['ephemeral'] },
    ] },
  'under-trees': { id: 'under-trees', name: 'Under Trees', blurb: 'Clumping and clonal species, winter presence, a colour theme and spring ephemerals.', slides: 'P34',
    layers: [
      { id: 'base', slot: 'base', name: 'Clumping + clonal + winter', basis: 'area', arrangement: 'groups', roles: ['clumping', 'clonal', 'winter'], shares: { clumping: 0.3, clonal: 0.45, winter: 0.25 }, spacing: { clumping: 0.8, clonal: 0.4, winter: 0.45 } },
      { id: 'theme', slot: 'overlay', name: 'Colour theme', basis: 'count', arrangement: 'clusters', density: 0.8, roles: ['theme'] },
      { id: 'ephemeral', slot: 'ephemeral', name: 'Ephemerals', basis: 'drift', arrangement: 'drift', coverage: 0.3, densityInDrift: 12, roles: ['ephemeral'] },
    ] },
};
const LEGEND_SYSTEM = { 'matrix-based': 'matrix-based', 'maximal-color': 'maximal-color', 'true-meadow': 'true-meadow', 'under-trees': 'under-trees', custom: 'maximal-color' };

// ---------------------------------------------------------------- derived quantities
export const hexDensity = (s) => 1 / (0.866 * Math.max(0.05, s) ** 2); // plants / m² of a hex packing at spacing s
// expected plants / m² of each member (area basis: share × hex density at its spacing; count: proportion × density;
// drift: proportion × coverage × density in the drift)
export function expectedDensity(layer, member) {
  if (layer.basis === 'area') return (member.share || 0) * hexDensity(member.spacingM || 0.45);
  if (layer.basis === 'drift') return (member.proportion || 0) * (layer.coverage || 0) * (layer.densityInDrift || 0);
  return (member.proportion || 0) * (layer.density || 0);
}
export function layerDensity(layer) { return layer.members.reduce((a, m) => a + expectedDensity(layer, m), 0); }
// flat members (compatibility view, used by knowledge / performance profiles): proportion = share of expected individuals
export function finalize(mix) {
  const flat = []; let tot = 0;
  for (const L of mix.layers) for (const m of L.members) { const d = expectedDensity(L, m); tot += d; const f = flat.find((q) => q.plantId === m.plantId); if (f) f.d += d; else flat.push({ plantId: m.plantId, role: m.role, layer: L.id, d }); }
  mix.members = flat.map((q) => ({ plantId: q.plantId, role: q.role, layer: q.layer, proportion: tot ? +(q.d / tot).toFixed(4) : 0 }));
  mix.density = { value: +tot.toFixed(2), unit: 'plants/m²', basis: 'expected individuals per m² summed over layers (each layer computed separately)' };
  mix.layerDensity = Object.fromEntries(mix.layers.map((L) => [L.id, +layerDensity(L).toFixed(2)]));
  return mix;
}
// normalise a list of numbers to sum 1 at 0.1 % (largest remainder)
function lr(vals) { const s = vals.reduce((a, v) => a + Math.max(0, v || 0), 0) || 1; const raw = vals.map((v) => (Math.max(0, v || 0) / s) * 1000); const fl = raw.map(Math.floor); let rest = 1000 - fl.reduce((a, b) => a + b, 0); raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } }); return fl.map((v) => v / 1000); }
export function normalize(members, key = 'proportion') { const v = lr(members.map((m) => m[key])); return members.map((m, i) => ({ ...m, [key]: v[i] })); }
export function normalizeLayer(L) { const key = L.basis === 'area' ? 'share' : 'proportion'; if (L.members.length) L.members = normalize(L.members, key); return L; }

// ---------------------------------------------------------------- validation
export function validateMix(m, { knownPlant } = {}) {
  const errors = [], warnings = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['not an object'] };
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('name required');
  if (!Array.isArray(m.layers) || !m.layers.length) errors.push('at least one layer');
  const seenLayer = new Set(); let members = 0;
  for (const L of m.layers || []) {
    if (seenLayer.has(L.id)) errors.push(`layer ${L.id} listed twice`); seenLayer.add(L.id);
    if (!['area', 'count', 'drift'].includes(L.basis)) errors.push(`${L.name || L.id}: basis must be area, count or drift`);
    if (L.basis === 'count' && !(L.density >= 0.05 && L.density <= 40)) errors.push(`${L.name}: density must be 0.05–40 plants / m²`);
    if (L.basis === 'drift' && !(L.coverage > 0 && L.coverage <= 1 && L.densityInDrift >= 1 && L.densityInDrift <= 80)) errors.push(`${L.name}: drift needs coverage 1–100 % and 1–80 plants / m² in the drift`);
    const key = L.basis === 'area' ? 'share' : 'proportion'; let sum = 0; const seen = new Set();
    for (const [i, x] of (L.members || []).entries()) {
      members++;
      if (!x || typeof x.plantId !== 'string') { errors.push(`${L.name} member ${i + 1}: plantId`); continue; }
      if (knownPlant && !knownPlant(x.plantId)) errors.push(`${L.name}: unknown plant ${x.plantId}`);
      if (seen.has(x.plantId)) errors.push(`${L.name}: ${x.plantId} listed twice`); seen.add(x.plantId);
      if (!ROLE_DEF[x.role]) errors.push(`${L.name}: role ${x.role} unknown`);
      if (!(x[key] > 0 && x[key] <= 1)) errors.push(`${L.name}: ${key} of ${x.plantId} must be > 0 and ≤ 100 %`); else sum += x[key];
      if (L.basis === 'area' && !(x.spacingM >= 0.1 && x.spacingM <= 3)) errors.push(`${L.name}: spacing of ${x.plantId} must be 0.1–3 m`);
    }
    if ((L.members || []).length && Math.abs(sum - 1) > 0.002) errors.push(`${L.name}: ${key === 'share' ? 'area shares' : 'proportions'} sum to ${(sum * 100).toFixed(1)} %, not 100 %`);
  }
  if (!members) errors.push('at least one plant in one layer');
  return { ok: !errors.length, errors, warnings };
}

// ---------------------------------------------------------------- construction
const now = () => new Date().toISOString();
function historyLine(origin) { return origin === 'rules' ? 'suggested in Rules mode and accepted' : origin === 'llm' ? 'suggested by the language model and accepted' : origin === 'reuse' ? 'reused from a Detroit legend recipe' : origin === 'variant' ? 'local variant created' : origin === 'template' ? 'started from a system template' : 'created'; }
export function makeLayeredMix({ id, name, color, system, layers, origin = 'manual', rationale = [], knowledgeRefs = [], conditions = {}, uncertainty = [], sourceMixId = null, basis = null }) {
  const mix = { schema: MIX_SCHEMA, id, version: 1, name, color, system: system || null, origin, sourceMixId, basis,
    layers: layers.map((L) => normalizeLayer({ ...L, members: (L.members || []).map((m) => ({ ...m })) })),
    rules: { centreClearanceM: 0.12, nicheRule: 'substitute within the layer when a member is recorded for the other light; unknown stays unknown' },
    knowledgeRefs, rationale, conditions, uncertainty, history: [{ version: 1, at: now(), summary: historyLine(origin) }] };
  return finalize(mix);
}
// V1-compatible constructor: flat members with V1 roles → layers of the given (or inferred) system
export function makeMix({ id, name, color, members, density = DEFAULT_DENSITY, origin = 'manual', system = null, ...rest }) {
  return makeLayeredMix({ id, name, color, system: system || 'matrix-based', layers: layersFromFlat(members, density), origin, ...rest });
}
const FAMILY_LAYER = { matrix: 'base', filler: 'filler', structure: 'emergent', seasonal: 'emergent', ephemeral: 'ephemeral' };
export function layersFromFlat(members, density = DEFAULT_DENSITY) {
  const fam = (r) => (ROLE_DEF[r] ? ROLE_DEF[r].family : r);
  const by = { base: [], emergent: [], filler: [], ephemeral: [] };
  for (const m of members) by[FAMILY_LAYER[fam(m.role)] || 'emergent'].push(m);
  const tot = members.reduce((a, m) => a + (m.proportion || 0), 0) || 1; const part = (L) => L.reduce((a, m) => a + (m.proportion || 0), 0) / tot;
  const out = [];
  // the V1 density (all individuals) is split by role: the base keeps its share of individuals at a spacing that yields it
  if (by.base.length) { const d = Math.max(0.5, density * part(by.base)); const s = +Math.sqrt(1 / (0.866 * d)).toFixed(2); out.push({ id: 'base', slot: 'base', name: 'Matrix', basis: 'area', arrangement: 'matrix', members: by.base.map((m) => ({ plantId: m.plantId, role: 'matrix', share: m.proportion, spacingM: Math.min(1.2, s), why: m.why || [] })) }); }
  if (by.emergent.length) out.push({ id: 'emergent', slot: 'overlay', name: 'Emergents', basis: 'count', arrangement: 'clusters', density: +Math.max(0.1, density * part(by.emergent)).toFixed(2), members: by.emergent.map((m) => ({ plantId: m.plantId, role: 'emergent', proportion: m.proportion, why: m.why || [] })) });
  if (by.filler.length) out.push({ id: 'filler', slot: 'overlay', name: 'Fillers', basis: 'count', arrangement: 'scatter', density: +Math.max(0.05, density * part(by.filler)).toFixed(2), members: by.filler.map((m) => ({ plantId: m.plantId, role: 'filler', proportion: m.proportion, why: m.why || [] })) });
  if (by.ephemeral.length) out.push({ id: 'ephemeral', slot: 'ephemeral', name: 'Ephemerals', basis: 'drift', arrangement: 'drift', coverage: 0.25, densityInDrift: 12, members: by.ephemeral.map((m) => ({ plantId: m.plantId, role: 'ephemeral', proportion: m.proportion, why: m.why || [] })) });
  if (!by.base.length && out.length) { const first = out[0]; first.slot = 'base'; } // a mix without a matrix: its first layer is the ground
  return out;
}
// a system template filled with the given members per role (empty roles stay empty and are listed as missing)
export function fromTemplate(systemId, membersByRole = {}, { id, name, color, origin = 'template', basis = null } = {}) {
  const S = SYSTEMS[systemId]; const missing = [];
  const layers = S.layers.map((T) => {
    const members = [];
    for (const role of T.roles) {
      const list = membersByRole[role] || []; if (!list.length) { missing.push(ROLE_DEF[role].name); continue; }
      for (const p of list) members.push(T.basis === 'area' ? { plantId: p.plantId, role, share: (T.shares[role] || 1) / list.length, spacingM: p.spacingM || T.spacing[role] || 0.45 } : { plantId: p.plantId, role, proportion: 1 / list.length });
    }
    const { roles, shares, spacing, ...rest } = T; return { ...rest, members };
  }).filter((L) => L.members.length);
  return { mix: layers.length ? makeLayeredMix({ id, name: name || S.name, color, system: systemId, layers, origin, basis: basis || `Template ${S.name} (slides ${S.slides}); layer densities and spacings are prototype assumptions.`, uncertainty: missing.map((r) => `no plant chosen for “${r}”`) }) : null, missing };
}

// ---------------------------------------------------------------- editing (one undoable edit → version + 1)
export function editMix(mix, changes, summary) {
  const next = structuredClone(mix); let name = next.name;
  const layerOf = (c) => next.layers.find((L) => L.id === c.layer) || next.layers.find((L) => L.members.some((m) => m.plantId === c.plantId)) || null;
  for (const c of changes) {
    if (c.op === 'add') {
      if (next.layers.some((L) => L.members.some((m) => m.plantId === c.plantId) && (!c.layer || L.id === c.layer))) continue;
      const fam = ROLE_DEF[c.role] ? ROLE_DEF[c.role].slot : FAMILY_LAYER[c.role] === 'base' ? 'base' : FAMILY_LAYER[c.role] === 'ephemeral' ? 'ephemeral' : 'overlay';
      let L = c.layer ? next.layers.find((q) => q.id === c.layer) : next.layers.find((q) => q.slot === fam) || next.layers[0];
      if (!L) continue; const role = ROLE_DEF[c.role] && ROLE_DEF[c.role].slot === L.slot ? c.role : L.members[0] ? L.members[0].role : (L.slot === 'base' ? 'matrix' : L.slot === 'ephemeral' ? 'ephemeral' : 'emergent');
      L.members.push(L.basis === 'area' ? { plantId: c.plantId, role, share: c.proportion ?? 0.15, spacingM: c.spacingM || 0.45, why: c.why || [] } : { plantId: c.plantId, role, proportion: c.proportion ?? 0.15, why: c.why || [] });
    } else if (c.op === 'remove') { for (const L of next.layers) L.members = L.members.filter((m) => m.plantId !== c.plantId || (c.layer && L.id !== c.layer)); }
    else if (c.op === 'setProportion' || c.op === 'setShare') { const L = layerOf(c); const m = L && L.members.find((q) => q.plantId === c.plantId); if (m) { const k = L.basis === 'area' ? 'share' : 'proportion'; m[k] = Math.max(0.001, c.proportion ?? c.share); m._fix = !!c.fix; } }
    else if (c.op === 'scaleRole') { for (const L of next.layers) for (const m of L.members) if (m.role === c.role || (ROLE_DEF[m.role] && ROLE_DEF[m.role].family === c.role)) { const k = L.basis === 'area' ? 'share' : 'proportion'; m[k] = Math.max(0.001, m[k] * c.factor); } }
    else if (c.op === 'setRole') { const L = layerOf(c); const m = L && L.members.find((q) => q.plantId === c.plantId); if (m && ROLE_DEF[c.role]) m.role = c.role; }
    else if (c.op === 'replace') { for (const L of next.layers) { const m = L.members.find((q) => q.plantId === c.from); if (m && !L.members.some((q) => q.plantId === c.to)) m.plantId = c.to; } }
    else if (c.op === 'setSpacing') { const L = layerOf(c); const m = L && L.members.find((q) => q.plantId === c.plantId); if (m) m.spacingM = Math.max(0.1, Math.min(3, +c.value)); }
    else if (c.op === 'setLayer') { const L = next.layers.find((q) => q.id === c.layer); if (L) for (const k of ['density', 'coverage', 'densityInDrift', 'arrangement', 'grainM']) if (c[k] != null) L[k] = k === 'arrangement' ? c[k] : +c[k]; }
    else if (c.op === 'setDensity') { const f = +c.value / (mix.density.value || 1); for (const L of next.layers) { if (L.basis === 'count') L.density = +(L.density * f).toFixed(2); else if (L.basis === 'drift') L.densityInDrift = +(L.densityInDrift * f).toFixed(1); else for (const m of L.members) m.spacingM = +Math.max(0.1, Math.min(3, m.spacingM / Math.sqrt(f))).toFixed(3); } }
    else if (c.op === 'rename') name = String(c.name || name).slice(0, 60);
  }
  for (const L of next.layers) { // members marked fixed keep their share; the others are rescaled to make 100 %
    const k = L.basis === 'area' ? 'share' : 'proportion'; const fx = L.members.filter((m) => m._fix); const fs = fx.reduce((a, m) => a + m[k], 0); const rest = L.members.filter((m) => !m._fix); const rs = rest.reduce((a, m) => a + m[k], 0) || 1;
    if (fx.length && rest.length) for (const m of rest) m[k] = (m[k] / rs) * Math.max(0.001, 1 - fs);
    for (const m of L.members) delete m._fix; normalizeLayer(L);
  }
  next.layers = next.layers.filter((L) => L.members.length);
  next.name = name; next.version = mix.version + 1; next.history = [...mix.history, { version: next.version, at: now(), summary: summary || describeChanges(changes) }];
  return finalize(next);
}
const sh = (id) => String(id || '').replace(/^sp\.(m-)?/, '');
export function describeChanges(changes) {
  return changes.map((c) => c.op === 'add' ? `added ${sh(c.plantId)}` : c.op === 'remove' ? `removed ${sh(c.plantId)}` : c.op === 'setProportion' || c.op === 'setShare' ? `${sh(c.plantId)} → ${Math.round((c.proportion ?? c.share) * 100)} %` : c.op === 'scaleRole' ? `${c.role} ×${c.factor}` : c.op === 'setRole' ? `${sh(c.plantId)} as ${c.role}` : c.op === 'replace' ? `${sh(c.from)} → ${sh(c.to)}` : c.op === 'setDensity' ? `density ×${c.value}` : c.op === 'setSpacing' ? `${sh(c.plantId)} spacing ${c.value} m` : c.op === 'setLayer' ? `${c.layer}: ${['density', 'coverage', 'densityInDrift', 'arrangement', 'grainM'].filter((k) => c[k] != null).map((k) => `${k} ${c[k]}`).join(', ')}` : c.op === 'rename' ? 'renamed' : c.op).join(', ');
}

// ---------------------------------------------------------------- Detroit legend recipes (data/detroit/mixes.json) → layered mixes
// The legend gives layers with area shares and spacings (base), overlay densities and drift coverage — kept as they are.
// Species of one legend role split its share equally (the designer published no per-species proportions: assumption).
const LEGEND_ROLE = { matrix: 'matrix', groups: 'block', blocks: 'block', emergents: 'emergent', individuals: 'emergent', bulbs: 'ephemeral', ephemerals: 'ephemeral', warm: 'warm', cool: 'cool', fixers: 'fixer', forbs: 'block', clumping: 'clumping', clonal: 'clonal', winter: 'winter' };
export function convertLegendRecipe(src, { colorIndex = 0, exists } = {}) {
  const system = LEGEND_SYSTEM[src.system] || 'maximal-color';
  const base = [], overlays = [], ephem = [];
  for (const r of src.roles || []) {
    const sp = (r.species || []).filter((s) => !exists || exists(s.id)); if (!sp.length) continue;
    const role = LEGEND_ROLE[r.id] || (r.layer === 'overlay' ? 'emergent' : r.layer === 'ephemeral' ? 'ephemeral' : 'block');
    const ws = sp.reduce((a, s) => a + (s.weight || 1), 0) || 1;
    if (r.layer === 'base') for (const s of sp) base.push({ plantId: s.id, role, share: (r.share || 0) * (s.weight || 1) / ws, spacingM: r.spacingM || 0.45, arrangement: r.arrangement });
    else if (r.layer === 'overlay') overlays.push({ id: r.id, slot: 'overlay', name: r.id === 'individuals' ? 'Individuals' : 'Emergents', basis: 'count', arrangement: r.arrangement === 'scatter' ? 'scatter' : 'clusters', density: r.density || 0.15, members: sp.map((s) => ({ plantId: s.id, role, proportion: (s.weight || 1) / ws })) });
    else ephem.push({ id: 'ephemeral', slot: 'ephemeral', name: 'Ephemerals (bulbs)', basis: 'drift', arrangement: 'drift', coverage: r.coverage || 0.15, densityInDrift: r.densityInDrift || 12, members: sp.map((s) => ({ plantId: s.id, role: 'ephemeral', proportion: (s.weight || 1) / ws })) });
  }
  const arr = base.some((b) => b.arrangement === 'blocks') ? 'blocks' : base.some((b) => b.arrangement === 'groups') ? (base.some((b) => b.arrangement === 'matrix') ? 'matrix' : 'groups') : base.some((b) => b.arrangement === 'intermingled') ? 'intermingled' : 'matrix';
  const layers = []; if (base.length) layers.push({ id: 'base', slot: 'base', name: 'Base', basis: 'area', arrangement: arr, members: base.map(({ arrangement, ...m }) => m) });
  layers.push(...overlays, ...ephem.slice(0, 1));
  const merged = []; for (const L of layers) { const seen = new Map(); L.members = L.members.filter((m) => { if (seen.has(m.plantId)) { const k = L.basis === 'area' ? 'share' : 'proportion'; seen.get(m.plantId)[k] += m[k]; return false; } seen.set(m.plantId, m); return true; }); merged.push(L); }
  return makeLayeredMix({
    id: 'mix.' + src.id.replace(/^mix\./, '') + '.legend', name: src.name, color: src.color || PALETTE[colorIndex % PALETTE.length], system, layers: merged, origin: 'reuse',
    basis: `Detroit legend recipe “${src.name}” (data/detroit/mixes.json, status ${src.status || 'executable'}): layers, area shares, spacings and overlay densities as recorded; species of one legend role split it equally (assumption).`,
    rationale: [{ text: (src.basis && src.basis.summary) || 'Recipe from the Detroit planting legends.', refs: (src.basis && src.basis.sourceRefs) || [] }],
  });
}
// a V1 mix (gp.mix/1: flat members) → V2 (migration of saved projects)
export function migrateMix(m) {
  if (m && m.schema === MIX_SCHEMA && Array.isArray(m.layers)) return m;
  const mx = makeMix({ id: m.id, name: m.name, color: m.color, members: m.members, density: (m.density && m.density.value) || DEFAULT_DENSITY, origin: m.origin || 'manual', rationale: m.rationale || [], knowledgeRefs: m.knowledgeRefs || [], uncertainty: m.uncertainty || [], sourceMixId: m.sourceMixId || null, basis: m.basis || null });
  return { ...mx, version: m.version || 1, history: [...(m.history || []), { version: m.version || 1, at: now(), summary: 'migrated from gp.mix/1 (flat members → layers by role family)' }], migratedFrom: 'gp.mix/1' };
}
