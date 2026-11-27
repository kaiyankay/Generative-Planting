// Mix: an editable, reusable community recipe. Members are plants with a functional role and a proportion of the planted
// INDIVIDUALS (not of area or canopy); proportions sum to 1. Density is a target count of plants per m² of usable cell
// area. A Mix has no geometry: it is assigned to cells. Every edit creates version + 1; a local variant references its source.
import { ROLES } from './knowledge.js';

export const MIX_SCHEMA = 'gp.mix/1';
export const DEFAULT_DENSITY = 4.5; // plants / m² — prototype assumption (typical perennial planting 3–7 / m²), editable
export const ROLE_ORDER = ['structure', 'seasonal', 'filler', 'matrix', 'ephemeral'];
// spacing multipliers of the arrangement by role (prototype defaults, see ALGORITHMS.md)
export const ROLE_RULES = {
  structure: { spacingK: 1.0, cluster: 1, note: 'placed first, as single plants, at full nominal spread' },
  seasonal: { spacingK: 0.8, cluster: 4, note: 'in small groups of about 3–5' },
  filler: { spacingK: 0.7, cluster: 2, note: 'pairs that fill between groups' },
  matrix: { spacingK: 0.7, cluster: 1, note: 'evenly through the cell, filling what is left' },
  ephemeral: { spacingK: 0.4, cluster: 6, note: 'bulbs in drifts among the others (own layer)' },
};
export const PALETTE = ['#7E9A6B', '#C08A5B', '#8E7AA6', '#5F8FA3', '#B5A050', '#A86F7E', '#6F8F7C', '#9C7C5A', '#7C86B0', '#B07A9E'];

export function validateMix(m, { knownPlant } = {}) {
  const errors = [], warnings = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['not an object'] };
  if (typeof m.name !== 'string' || !m.name.trim()) errors.push('name required');
  if (!Array.isArray(m.members) || !m.members.length) errors.push('at least one member');
  const seen = new Set(); let sum = 0;
  for (const [i, x] of (m.members || []).entries()) {
    if (!x || typeof x.plantId !== 'string') { errors.push(`member ${i + 1}: plantId`); continue; }
    if (knownPlant && !knownPlant(x.plantId)) errors.push(`member ${i + 1}: unknown plant ${x.plantId}`);
    if (seen.has(x.plantId)) errors.push(`member ${i + 1}: ${x.plantId} listed twice`); seen.add(x.plantId);
    if (!ROLES[x.role]) errors.push(`member ${i + 1}: role must be one of ${Object.keys(ROLES).join(', ')}`);
    if (!(x.proportion > 0 && x.proportion <= 1)) errors.push(`member ${i + 1}: proportion must be > 0 and ≤ 1`);
    else sum += x.proportion;
  }
  if (m.members && m.members.length && Math.abs(sum - 1) > 0.001) errors.push(`proportions sum to ${(sum * 100).toFixed(1)} %, not 100 %`);
  const d = m.density && m.density.value; if (!(d >= 0.2 && d <= 40)) errors.push('density must be 0.2–40 plants / m²');
  if (m.members && m.members.length > 60) warnings.push('more than 60 members: technical limit of the arrangement (species per cell placement is 64)');
  return { ok: !errors.length, errors, warnings, sum: +sum.toFixed(4) };
}
// normalise proportions to sum 1 (largest remainder at 0.1 % so the editor shows exact numbers)
export function normalize(members) {
  const s = members.reduce((a, m) => a + Math.max(0, m.proportion || 0), 0) || 1;
  const raw = members.map((m) => (Math.max(0, m.proportion || 0) / s) * 1000); const fl = raw.map(Math.floor); let rest = 1000 - fl.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (rest > 0) { fl[i]++; rest--; } });
  return members.map((m, i) => ({ ...m, proportion: fl[i] / 1000 }));
}
export function makeMix({ id, name, color, members, density = DEFAULT_DENSITY, origin = 'manual', rationale = [], knowledgeRefs = [], conditions = {}, uncertainty = [], sourceMixId = null, basis = null }) {
  return {
    schema: MIX_SCHEMA, id, version: 1, name, color, origin, sourceMixId, basis,
    members: normalize(members.map((m) => ({ plantId: m.plantId, role: m.role, proportion: m.proportion, constraints: m.constraints || {}, why: m.why || [] }))),
    density: { value: +(+density).toFixed(2), unit: 'plants/m²', basis: 'target individuals per m² of usable cell area' },
    spacing: { basis: 'nominal spread of each plant (display proxy unless a knowledge record gives a spread) × role factor', roleRules: Object.fromEntries(Object.entries(ROLE_RULES).map(([k, v]) => [k, v.spacingK])) },
    rules: {}, knowledgeRefs, rationale, conditions, uncertainty,
    history: [{ version: 1, at: new Date().toISOString(), summary: origin === 'rules' ? 'suggested in Rules mode and accepted' : origin === 'llm' ? 'suggested by the language model and accepted' : origin === 'reuse' ? 'reused from a recipe' : origin === 'variant' ? 'local variant created' : 'created' }],
  };
}
// apply a list of member changes (one undoable edit) → new version
export function editMix(mix, changes, summary) {
  let members = mix.members.map((m) => ({ ...m }));
  let density = mix.density.value; let name = mix.name;
  for (const c of changes) {
    if (c.op === 'add') { if (!members.some((m) => m.plantId === c.plantId)) members.push({ plantId: c.plantId, role: c.role || 'seasonal', proportion: c.proportion ?? 0.1, constraints: {}, why: c.why || [] }); }
    else if (c.op === 'remove') members = members.filter((m) => m.plantId !== c.plantId);
    else if (c.op === 'setProportion') { const m = members.find((q) => q.plantId === c.plantId); if (m) m.proportion = Math.max(0.001, c.proportion); }
    else if (c.op === 'scaleRole') { for (const m of members) if (m.role === c.role) m.proportion = Math.max(0.001, m.proportion * c.factor); }
    else if (c.op === 'setRole') { const m = members.find((q) => q.plantId === c.plantId); if (m) m.role = c.role; }
    else if (c.op === 'replace') { const m = members.find((q) => q.plantId === c.from); if (m && !members.some((q) => q.plantId === c.to)) m.plantId = c.to; }
    else if (c.op === 'setDensity') density = Math.max(0.2, Math.min(40, +c.value));
    else if (c.op === 'rename') name = String(c.name || name).slice(0, 60);
  }
  // fixed members keep their share; the others are rescaled so the sum is 1
  const fixed = new Set(changes.filter((c) => c.op === 'setProportion' && c.fix).map((c) => c.plantId));
  if (fixed.size) { const fs = members.filter((m) => fixed.has(m.plantId)).reduce((a, m) => a + m.proportion, 0); const rest = members.filter((m) => !fixed.has(m.plantId)); const rs = rest.reduce((a, m) => a + m.proportion, 0) || 1; for (const m of rest) m.proportion = (m.proportion / rs) * Math.max(0.001, 1 - fs); }
  members = normalize(members);
  const v = mix.version + 1;
  return { ...mix, name, version: v, members, density: { ...mix.density, value: +(+density).toFixed(2) }, history: [...mix.history, { version: v, at: new Date().toISOString(), summary: summary || describeChanges(changes) }] };
}
export function describeChanges(changes) {
  return changes.map((c) => c.op === 'add' ? `added ${c.plantId.replace(/^sp\.(m-)?/, '')}` : c.op === 'remove' ? `removed ${c.plantId.replace(/^sp\.(m-)?/, '')}` : c.op === 'setProportion' ? `${c.plantId.replace(/^sp\.(m-)?/, '')} → ${Math.round(c.proportion * 100)} %` : c.op === 'scaleRole' ? `${c.role} ×${c.factor}` : c.op === 'setRole' ? `${c.plantId.replace(/^sp\.(m-)?/, '')} as ${c.role}` : c.op === 'replace' ? `${c.from.replace(/^sp\.(m-)?/, '')} → ${c.to.replace(/^sp\.(m-)?/, '')}` : c.op === 'setDensity' ? `density ${c.value} / m²` : c.op === 'rename' ? `renamed` : c.op).join(', ');
}

// the Detroit legend recipes (data/<site>/mixes.json, area shares + overlay densities) → reusable Mixes with individual
// proportions. Conversion (documented): base role count / m² = share / (0.866 × spacing²) (hex packing at the role
// spacing); overlay = its density; ephemeral = coverage × densityInDrift. Species of a role split by weight.
export function convertLegendRecipe(src, { colorIndex = 0, exists } = {}) {
  const per = [];
  for (const r of src.roles || []) {
    let c = 0;
    if (r.layer === 'base') c = (r.share || 0) / (0.866 * (r.spacingM || 0.6) ** 2);
    else if (r.layer === 'overlay') c = r.density || 0;
    else if (r.layer === 'ephemeral') c = (r.coverage || 0.15) * (r.densityInDrift || 20);
    const sp = (r.species || []).filter((s) => !exists || exists(s.id)); const ws = sp.reduce((a, s) => a + (s.weight || 1), 0) || 1;
    const role = r.layer === 'ephemeral' ? 'ephemeral' : r.arrangement === 'matrix' || r.id === 'matrix' || r.id === 'warm' || r.id === 'cool' ? 'matrix' : r.layer === 'overlay' ? 'structure' : r.id === 'fixers' || r.id === 'clonal' ? 'filler' : 'seasonal';
    for (const s of sp) per.push({ plantId: s.id, role, count: (c * (s.weight || 1)) / ws });
  }
  const total = per.reduce((a, p) => a + p.count, 0) || 1;
  const merged = new Map(); for (const p of per) { const m = merged.get(p.plantId); if (m) m.proportion += p.count / total; else merged.set(p.plantId, { plantId: p.plantId, role: p.role, proportion: p.count / total }); }
  return makeMix({
    id: 'mix.' + src.id.replace(/^mix\./, '') + '.legend', name: src.name, color: src.color || PALETTE[colorIndex % PALETTE.length], members: [...merged.values()], density: Math.min(12, +total.toFixed(2)), origin: 'reuse',
    basis: `Converted from the Detroit legend recipe "${src.name}" (data/detroit/mixes.json): roles and species from the plans; proportions converted from area shares and densities (status ${src.status || 'executable'}). Proportions were not published by the designer — the equal species weights are an assumption.`,
    rationale: [{ text: (src.basis && src.basis.summary) || 'Recipe from the Detroit planting legends.', refs: (src.basis && src.basis.sourceRefs) || [] }],
  });
}
