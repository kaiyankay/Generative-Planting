// Planting Mix: the "paint" of the tool — a reusable, editable, versioned design object.
//   roles (community roles) × species (weights) × proportion (share / density / coverage, with its unit)
//   × spacing × arrangement (matrix, intermingled, blocks, groups, scatter, drift) × rules × colour, name, basis.
// Geometry (point / line / area) and arrangement and functional role are independent axes: any brush can carry any mix.
export const LAYERS = { base: 'Base (share of area)', overlay: 'Over the base (plants / m²)', ephemeral: 'Ephemeral drifts (coverage)' };
export const ARRANGEMENTS = {
  base: ['matrix', 'intermingled', 'blocks', 'groups'],
  overlay: ['scatter'],
  ephemeral: ['drift'],
};
export const SYSTEMS = { 'matrix-based': 'Matrix-based', 'true-meadow': 'True meadow', 'maximal-color': 'Maximal colour', 'under-trees': 'Under trees', custom: 'Custom' };
export const BASIS = { legend: 'from the plan legend', list: 'from the official list', assumption: 'design assumption', record: 'knowledge record' };
const COLORS = ['#B8AE72', '#B7A2C4', '#C79C70', '#8FA47A', '#6F8A86', '#C4877A', '#9AA9C2', '#A7956A', '#7E9C8E', '#C9B07A'];

export function nextColor(mixes) { const used = new Set(mixes.map((m) => m.color)); return COLORS.find((c) => !used.has(c)) || COLORS[mixes.length % COLORS.length]; }
export function slug(s) { return String(s || 'mix').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'mix'; }

// checks a mix; returns { ok, errors[], warnings[] } (warnings never block: a template may be incomplete)
export function validateMix(m, spIndex) {
  const errors = [], warnings = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['not a mix'], warnings };
  if (!/^mix\.[a-z0-9._-]{1,60}$/.test(m.id || '')) errors.push('id must look like mix.name');
  if (!String(m.name || '').trim()) errors.push('name required');
  if (!Array.isArray(m.roles) || !m.roles.length) errors.push('at least one role');
  const ids = new Set();
  for (const r of m.roles || []) {
    if (!r.id || ids.has(r.id)) errors.push('role ids must be unique: ' + r.id); ids.add(r.id);
    if (!LAYERS[r.layer]) errors.push(`role ${r.id}: layer must be base | overlay | ephemeral`);
    if (r.layer && ARRANGEMENTS[r.layer] && !ARRANGEMENTS[r.layer].includes(r.arrangement)) errors.push(`role ${r.id}: arrangement ${r.arrangement} not allowed in layer ${r.layer}`);
    if (!(r.spacingM > 0.05 && r.spacingM < 6)) errors.push(`role ${r.id}: spacing 0.05–6 m`);
    if (r.layer === 'base' && !(r.share >= 0 && r.share <= 1)) errors.push(`role ${r.id}: share 0–1`);
    if (r.layer === 'overlay' && !(r.density >= 0 && r.density <= 4)) errors.push(`role ${r.id}: density 0–4 plants / m²`);
    if (r.layer === 'ephemeral' && !(r.coverage >= 0 && r.coverage <= 0.9)) errors.push(`role ${r.id}: coverage 0–0.9`);
    for (const s of r.species || []) { if (spIndex && !spIndex.has(s.id)) errors.push(`role ${r.id}: unknown species ${s.id}`); if (!(s.weight >= 0)) errors.push(`role ${r.id}: weight ≥ 0`); }
    if (!(r.species || []).length) warnings.push(`Role “${r.name || r.id}” has no species yet.`);
    if (r.functionalBasis === 'assumption') warnings.push(`Role “${r.name || r.id}”: functional role is a design assumption.`);
  }
  const base = (m.roles || []).filter((r) => r.layer === 'base');
  const tot = base.reduce((a, r) => a + (+r.share || 0), 0);
  if (base.length && Math.abs(tot - 1) > 0.02) warnings.push(`Base shares add up to ${Math.round(tot * 100)} %; they are used as relative weights.`);
  if (!base.length) warnings.push('No base role: only overlay and drift plants will be placed.');
  return { ok: !errors.length, errors, warnings };
}

// a structured change to a mix: returns a new mix (version + 1) and a one-line summary
export function changeMix(m, change, spName = (id) => id) {
  const n = structuredClone(m); const role = (id) => n.roles.find((r) => r.id === id);
  let s;
  switch (change.op) {
    case 'rename': n.name = String(change.name || '').slice(0, 60) || n.name; s = `renamed to ${n.name}`; break;
    case 'setColor': if (/^#[0-9a-fA-F]{6}$/.test(change.color || '')) { n.color = change.color; s = 'colour ' + change.color; } else throw new Error('colour must be #rrggbb'); break;
    case 'setShare': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); const key = r.layer === 'base' ? 'share' : r.layer === 'overlay' ? 'density' : 'coverage'; const v = +change.value; if (!Number.isFinite(v) || v < 0) throw new Error('value ≥ 0'); s = `${r.name}: ${key} ${fmt(r[key])} → ${fmt(v)}`; r[key] = v; if (change.rebalance && r.layer === 'base') rebalance(n, r.id); break; }
    case 'setSpacing': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); s = `${r.name}: spacing ${r.spacingM} → ${change.value} m`; r.spacingM = +change.value; break; }
    case 'setRoleParam': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); if (!['patchM2', 'minDistM', 'driftM2', 'densityInDrift', 'arrangement', 'name', 'functionalRole'].includes(change.key)) throw new Error('param not editable: ' + change.key); s = `${r.name}: ${change.key} ${r[change.key]} → ${change.value}`; r[change.key] = ['arrangement', 'name', 'functionalRole'].includes(change.key) ? String(change.value) : +change.value; if (change.key === 'functionalRole') r.functionalBasis = 'assumption'; break; }
    case 'setRule': { const r = change.roleId ? role(change.roleId) : null; const tgt = r ? (r.rules ||= {}) : (n.rules ||= {}); if (change.value == null) delete tgt[change.key]; else tgt[change.key] = change.value; s = `${r ? r.name : 'mix'}: rule ${change.key} = ${change.value == null ? 'off' : JSON.stringify(change.value)}`; break; }
    case 'addSpecies': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); if (r.species.some((q) => q.id === change.speciesId)) throw new Error('already in the role'); r.species.push({ id: change.speciesId, weight: change.weight ?? 1 }); s = `${r.name}: + ${spName(change.speciesId)}`; break; }
    case 'removeSpecies': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); const k = r.species.findIndex((q) => q.id === change.speciesId); if (k < 0) throw new Error('not in the role'); r.species.splice(k, 1); s = `${r.name}: − ${spName(change.speciesId)}`; break; }
    case 'replaceSpecies': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); const q = r.species.find((x) => x.id === change.from); if (!q) throw new Error('not in the role: ' + change.from); if (r.species.some((x) => x.id === change.to)) throw new Error('already in the role: ' + change.to); q.id = change.to; s = `${r.name}: ${spName(change.from)} → ${spName(change.to)}${change.reason ? ' (' + change.reason + ')' : ''}`; break; }
    case 'setWeight': { const r = role(change.roleId); if (!r) throw new Error('no role ' + change.roleId); const q = r.species.find((x) => x.id === change.speciesId); if (!q) throw new Error('not in the role'); s = `${r.name}: ${spName(change.speciesId)} weight ${q.weight} → ${change.value}`; q.weight = Math.max(0, +change.value); break; }
    case 'addRole': { const def = change.role || {}; const id = def.id || slugRole(def.name || 'role', n.roles); if (n.roles.some((r) => r.id === id)) throw new Error('role exists ' + id); const layer = def.layer || 'base';
      n.roles.push({ id, name: def.name || id, layer, arrangement: def.arrangement || ARRANGEMENTS[layer][0], share: layer === 'base' ? def.share ?? 0.2 : undefined, density: layer === 'overlay' ? def.density ?? 0.1 : undefined, coverage: layer === 'ephemeral' ? def.coverage ?? 0.1 : undefined, densityInDrift: layer === 'ephemeral' ? 16 : undefined, driftM2: layer === 'ephemeral' ? 2 : undefined, spacingM: def.spacingM || (layer === 'ephemeral' ? 0.25 : layer === 'overlay' ? 0.6 : 0.45), patchM2: def.patchM2 || (def.arrangement === 'blocks' ? 5 : 2), minDistM: layer === 'overlay' ? 1.4 : undefined, functionalRole: def.functionalRole || def.name || id, functionalBasis: 'assumption', designRole: null, designRoleBasis: null, species: (def.species || []).map((x) => (typeof x === 'string' ? { id: x, weight: 1 } : x)), rules: {} });
      s = `+ role ${def.name || id}`; break; }
    case 'removeRole': { const k = n.roles.findIndex((r) => r.id === change.roleId); if (k < 0) throw new Error('no role ' + change.roleId); s = `− role ${n.roles[k].name}`; n.roles.splice(k, 1); break; }
    default: throw new Error('unknown mix change ' + change.op);
  }
  n.version = (m.version || 1) + 1;
  n.history = [...(m.history || []), { version: n.version, at: new Date().toISOString(), summary: s }].slice(-40);
  if (n.status === 'template' && (change.op === 'addSpecies' || change.op === 'replaceSpecies')) n.status = 'template';
  return { mix: n, summary: s };
}
function rebalance(n, keepId) { // keep base shares adding up to 1: the other base roles scale proportionally
  const base = n.roles.filter((r) => r.layer === 'base'); const fixed = base.find((r) => r.id === keepId); const others = base.filter((r) => r !== fixed);
  const rest = Math.max(0, 1 - Math.min(1, fixed.share)); const tot = others.reduce((a, r) => a + r.share, 0);
  for (const r of others) r.share = tot > 0 ? +(r.share / tot * rest).toFixed(4) : +(rest / others.length).toFixed(4);
}
function slugRole(name, roles) { let b = slug(name); let id = b; let k = 2; while (roles.some((r) => r.id === id)) id = b + '-' + k++; return id; }
function fmt(v) { return v == null ? '—' : +(+v).toFixed(3); }

export function describeMix(m) {
  const base = m.roles.filter((r) => r.layer === 'base'); const tot = base.reduce((a, r) => a + r.share, 0) || 1;
  return { id: m.id, name: m.name, version: m.version, system: m.system, status: m.status, species: new Set(m.roles.flatMap((r) => r.species.map((s) => s.id))).size,
    roles: m.roles.map((r) => ({ id: r.id, name: r.name, layer: r.layer, arrangement: r.arrangement, value: r.layer === 'base' ? +(r.share / tot).toFixed(3) : r.layer === 'overlay' ? r.density : r.coverage, unit: r.layer === 'base' ? 'share' : r.layer === 'overlay' ? '/m²' : 'coverage', spacingM: r.spacingM, species: r.species.length, functionalRole: r.functionalRole, functionalBasis: r.functionalBasis, designRole: r.designRole, designRoleBasis: r.designRoleBasis })) };
}
