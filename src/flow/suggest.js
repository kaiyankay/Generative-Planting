// Rules mode (offline): explicit, deterministic mix suggestion and a bounded edit parser. Same structured output as the
// language-model path, validated by the same function. Nothing here pretends to be AI.
import { GROUPS, MONTHS, findPlant } from './knowledge.js';
import { makeMix, editMix, normalize, PALETTE, DEFAULT_DENSITY } from './mix.js';

export const SUGGESTION_SCHEMA = 'gp.mixSuggestion/1';

// what the target cells are like (from SpatialCell.conditions; unknowns stay unknown)
export function targetSummary(cells) {
  let A = 0, crown = 0, pathEdge = 0, known = 0;
  for (const c of cells) { A += c.areaM2; const cd = c.conditions; if (!cd) continue; if (cd.canopy && cd.canopy.fraction != null) { crown += cd.canopy.fraction * c.areaM2; known += c.areaM2; } if (cd.pathEdge != null) pathEdge += cd.pathEdge * c.areaM2; }
  const crownShare = known ? crown / known : null;
  return { cells: cells.length, areaM2: +A.toFixed(1), crownShare: crownShare == null ? null : +crownShare.toFixed(2), light: crownShare == null ? 'unknown' : crownShare >= 0.5 ? 'under crown' : crownShare > 0.05 ? 'mixed' : 'open', pathEdgeShare: A ? +(pathEdge / A).toFixed(2) : 0, moisture: 'unknown', note: 'Light is read from existing tree crowns (inference); soil moisture has no data.' };
}
// light fit of one plant for the target: 'fit' | 'conflict' | 'uncertain'
export function lightFit(t, light) {
  if (t.light.status === 'unknown' || light === 'unknown') return 'uncertain';
  const v = t.light.value; if (light === 'open') return v.includes('sun') || v.includes('part') ? 'fit' : 'conflict';
  if (light === 'under crown') return v.includes('shade') || v.includes('part') ? 'fit' : 'conflict';
  return v.includes('part') || (v.includes('sun') && v.includes('shade')) ? 'fit' : 'uncertain';
}
const evId = (tr) => (tr && tr.evidence && tr.evidence[0] ? tr.evidence[0].id : null);
const short = (id) => id.replace(/^sp\.(m-)?/, '');

export function suggestMixes({ brief, cells, K, prefs = [], max = 3, existingCount = 0 }) {
  const target = targetSummary(cells);
  const months = brief.objectives.flowering && brief.objectives.flowering.on ? brief.objectives.flowering.months : [4, 5, 6, 7, 8, 9, 10];
  const wantGroups = brief.objectives.pollinators && brief.objectives.pollinators.on;
  const avoid = new Set(prefs.filter((p) => p.type === 'avoid').map((p) => p.plantId)); const favour = new Set(prefs.filter((p) => p.type === 'favour').map((p) => p.plantId));
  // Rules mode proposes herbaceous mixes: woody plants (shrubs, spread > 1.2 m) are left to the designer, because their
  // individual share would take most of a cell's area (they can be added by hand in the editor)
  const pool = K.catalogue().filter((s) => !avoid.has(s.id) && s.plantType !== 'shrub' && s.plantType !== 'tree' && (s.nominalSpreadM || 0.5) <= 1.2);
  const known = [], uncertain = [];
  for (const s of pool) {
    const t = K.traits(s.id); const lf = lightFit(t, target.light);
    if (lf === 'conflict') continue;
    const bloomOK = t.bloom.status !== 'unknown';
    const entry = { id: s.id, t, lf, role: t.role.status !== 'unknown' ? t.role.value : s.plantType === 'grass' || s.plantType === 'sedge' ? 'matrix' : s.plantType === 'bulb' ? 'ephemeral' : s.plantType === 'shrub' ? 'structure' : 'seasonal', favour: favour.has(s.id) };
    if (bloomOK && lf === 'fit') known.push(entry); else if (bloomOK || t.light.status !== 'unknown') uncertain.push({ ...entry, missing: [!bloomOK && 'flowering months', t.light.status === 'unknown' && 'light', t.pollinators.status === 'unknown' && 'pollinator groups'].filter(Boolean) });
  }
  const flowering = known.filter((e) => e.role !== 'matrix' && e.t.windPollinated !== true && e.t.bloom.value.some((m) => months.includes(m)));
  if (flowering.length < 3) {
    return { schema: SUGGESTION_SCHEMA, mode: 'rules', ok: true, recipes: [], target, months, guidance: `Only ${flowering.length} plant${flowering.length === 1 ? '' : 's'} with known flowering months fit these cells in the active knowledge. Create a mix yourself, switch on more knowledge sources, or add flowering months for the plants you want to use.`, uncertainCandidates: uncertain.slice(0, 12).map(publicCand), knowledgeSuggestions: suggestKnowledge(uncertain) };
  }
  const matrix = known.filter((e) => e.role === 'matrix').sort((a, b) => (b.favour - a.favour) || (lightScore(b, target) - lightScore(a, target)) || a.id.localeCompare(b.id));
  const variants = [
    { key: 'season', name: 'Season-long pollinator mix', weight: () => 1, structureFirst: 0, n: 7, matrix: 1 },
    { key: 'edges', name: 'Early and late season mix', weight: (m) => (m <= Math.min(...months) + 1 || m >= Math.max(...months) - 1 ? 2 : 1), structureFirst: 0, n: 7, matrix: 1 },
    { key: 'structure', name: 'Structure-led mix', weight: () => 1, structureFirst: 2, n: 6, matrix: 2 },
  ];
  const recipes = []; const sigs = new Set();
  for (const v of variants) {
    const chosen = []; const covered = new Set();
    const pairsOf = (e) => { const out = []; const gs = e.t.pollinators.status !== 'unknown' ? e.t.pollinators.value : ['?']; for (const m of e.t.bloom.value) if (months.includes(m)) for (const g of gs) out.push([m, g]); return out; };
    const gain = (e) => { let s = 0; for (const [m, g] of pairsOf(e)) { const k = m + ':' + g; if (covered.has(k)) continue; s += v.weight(m) * (g === '?' ? 0.4 : wantGroups ? 1 : 0.6); } if (!wantGroups) { const ms = new Set([...covered].map((k) => +k.split(':')[0])); for (const m of e.t.bloom.value) if (months.includes(m) && !ms.has(m)) s += v.weight(m); } return s + (e.favour ? 0.5 : 0); };
    const take = (e) => { chosen.push(e); for (const [m, g] of pairsOf(e)) covered.add(m + ':' + g); };
    if (v.structureFirst) { for (const e of flowering.filter((q) => q.role === 'structure').sort((a, b) => gain(b) - gain(a) || a.id.localeCompare(b.id)).slice(0, v.structureFirst)) take(e); }
    while (chosen.length < v.n) {
      let best = null, bg = 0; for (const e of flowering) { if (chosen.includes(e) || chosen.some((c) => sameTaxon(c.id, e.id))) continue; const g = gain(e); if (g > bg + 1e-9 || (Math.abs(g - bg) < 1e-9 && best && e.id < best.id)) { best = e; bg = g; } }
      if (!best || bg <= 0.0001) break; take(best);
    }
    const mx = matrix.filter((e) => !chosen.some((c) => sameTaxon(c.id, e.id))).slice(0, v.matrix);
    const sig = [...chosen, ...mx].map((e) => e.id).sort().join(','); if (sigs.has(sig) || chosen.length < 3) continue; sigs.add(sig);
    const members = [];
    const mShare = mx.length ? 0.35 : 0; for (const e of mx) members.push({ plantId: e.id, role: 'matrix', proportion: mShare / mx.length, why: [evId(e.t.role) || evId(e.t.light)].filter(Boolean) });
    const rest = chosen; const w = rest.map((e) => (e.role === 'structure' ? 0.6 : e.role === 'ephemeral' ? 0.4 : 1)); const ws = w.reduce((a, b) => a + b, 0) || 1;
    rest.forEach((e, i) => members.push({ plantId: e.id, role: e.role === 'matrix' ? 'seasonal' : e.role, proportion: ((1 - mShare) * w[i]) / ws, why: [evId(e.t.bloom), evId(e.t.pollinators), evId(e.t.light)].filter(Boolean) }));
    const cov = coverageOf([...chosen, ...mx].map((e) => e.id), K, months);
    const rationale = [
      { text: `Chosen by greedy coverage of ${wantGroups ? 'flowering month × pollinator group' : 'flowering months'} in ${MONTHS[months[0] - 1]}–${MONTHS[months[months.length - 1] - 1]}${v.key === 'edges' ? ', with early and late months weighted twice' : ''}${v.structureFirst ? ', starting from the two structural plants that add the most' : ''}.`, refs: [] },
      { text: `Light: the target cells are ${target.light}${target.crownShare != null ? ` (${Math.round(target.crownShare * 100)} % under existing crowns)` : ''}; plants recorded for conflicting light were left out.`, refs: [] },
      ...(mx.length ? [{ text: `Matrix ${mx.map((e) => short(e.id)).join(', ')} at ${Math.round(mShare * 100)} % of plants (wind-pollinated: structure and continuity, no flower resource).`, refs: mx.map((e) => evId(e.t.role)).filter(Boolean) }] : []),
    ];
    const gaps = months.filter((m) => !cov.months.includes(m)).map((m) => `${MONTHS[m - 1]}: no known flowering member`);
    const unknowns = [...chosen, ...mx].filter((e) => e.t.pollinators.status === 'unknown' && e.t.windPollinated !== true).map((e) => `${short(e.id)}: pollinator groups unknown`).concat(['Soil moisture of the cells is unknown: moisture fit not checked.']);
    const illus = [...chosen, ...mx].filter((e) => ['bloom', 'pollinators', 'light'].some((a) => e.t[a].source === 'illustrative')).length;
    recipes.push({ key: v.key, name: v.name, members: normalize(members), density: DEFAULT_DENSITY, rationale, coverage: cov, gaps, unknowns, illustrativeMembers: illus });
    if (recipes.length >= max) break;
  }
  return { schema: SUGGESTION_SCHEMA, mode: 'rules', ok: true, recipes, target, months, uncertainCandidates: uncertain.slice(0, 12).map(publicCand), knowledgeSuggestions: suggestKnowledge(uncertain) };
}
const lightScore = (e, target) => (e.t.light.status === 'unknown' ? 0 : target.light === 'under crown' ? (e.t.light.value.includes('shade') ? 2 : 1) : e.t.light.value.includes('sun') ? 2 : 1);
const sameTaxon = (a, b) => a.replace(/^sp\.(m-)?/, '') === b.replace(/^sp\.(m-)?/, '');
const publicCand = (e) => ({ plantId: e.id, missing: e.missing || [], light: e.lf });
function suggestKnowledge(uncertain) { return uncertain.filter((e) => e.missing && e.missing.includes('flowering months')).slice(0, 5).map((e) => ({ plantId: e.id, attr: 'bloom', why: 'flowering months unknown: the plant cannot be ranked' })); }

export function coverageOf(ids, K, months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  const ms = new Set(); const groupsByMonth = {}; let unknown = 0;
  for (const id of ids) { const t = K.traits(id); if (t.bloom.status === 'unknown') { unknown++; continue; } for (const m of t.bloom.value) { if (!months.includes(m)) continue; if (K.resourceIn(id, m) !== 'yes') continue; ms.add(m); if (t.pollinators.status !== 'unknown') for (const g of t.pollinators.value) (groupsByMonth[m] ||= new Set()).add(g); } }
  return { months: [...ms].sort((a, b) => a - b), groups: Object.fromEntries(Object.entries(groupsByMonth).map(([m, s]) => [m, [...s].sort()])), unknownBloom: unknown };
}

export function recipeToMix(r, { id, colorIndex = 0, origin = 'rules' }) {
  return makeMix({ id, name: r.name, color: PALETTE[colorIndex % PALETTE.length], members: r.members, density: r.density || DEFAULT_DENSITY, origin, rationale: r.rationale, knowledgeRefs: [...new Set(r.members.flatMap((m) => m.why || []))], uncertainty: [...(r.unknowns || []), ...(r.gaps || [])], conditions: { months: r.coverage ? r.coverage.months : [] } });
}

// ---------------------------------------------------------------- bounded edit parser (Rules mode)
const SEASON = { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10], fall: [9, 10], early: [3, 4, 5], late: [9, 10] };
export function interpretEdit(text, mix, { K, months = [4, 5, 6, 7, 8, 9, 10] } = {}) {
  const t = String(text || '').toLowerCase().trim(); const changes = []; const matched = []; let lockMatrix = false;
  if (!t) return { ok: false, mode: 'rules', error: 'empty instruction' };
  if (/\b(keep|retain|preserve|don't touch|leave)\b[^.]*\b(grass|matrix)\b/.test(t)) { lockMatrix = true; matched.push('keep the matrix: matrix members are not changed'); }
  const cat = K.catalogue(); const inMix = new Set(mix.members.map((m) => m.plantId));
  // add / remove / replace a named plant
  const rep = t.match(/replace\s+(.+?)\s+(?:with|by)\s+(.+)/);
  if (rep) { const a = findPlant(rep[1], mix.members.map((m) => ({ id: m.plantId, ...(K.s.getObject(m.plantId) || {}) })).filter((x) => x.scientificName)), b = findPlant(rep[2], cat); if (a && b) { changes.push({ op: 'replace', from: a, to: b }); matched.push(`replace ${short(a)} with ${short(b)}`); } }
  for (const m of t.matchAll(/\b(?:add|include)\s+([a-z][a-z .'-]+?)(?:\s+(?:to|in|at)\b|,|$)/g)) { const id = findPlant(m[1], cat); if (id && !inMix.has(id)) { const tr = K.traits(id); changes.push({ op: 'add', plantId: id, role: tr.role.status !== 'unknown' ? tr.role.value : 'seasonal', proportion: 0.08 }); matched.push(`add ${short(id)}`); } }
  for (const m of t.matchAll(/\b(?:remove|drop|without|take out)\s+([a-z][a-z .'-]+?)(?:\s+(?:from)\b|,|$)/g)) { const id = findPlant(m[1], mix.members.map((q) => ({ id: q.plantId, ...(K.s.getObject(q.plantId) || {}) })).filter((x) => x.scientificName)); if (id) { changes.push({ op: 'remove', plantId: id }); matched.push(`remove ${short(id)}`); } }
  // more / less grass
  if (!lockMatrix && /\b(more|increase|denser|stronger)\b[^.]*\b(grass|matrix)\b/.test(t)) { changes.push({ op: 'scaleRole', role: 'matrix', factor: 1.3 }); matched.push('matrix share ×1.3'); }
  if (!lockMatrix && /\b(less|fewer|reduce|decrease|lighter)\b[^.]*\b(grass|matrix)\b/.test(t)) { changes.push({ op: 'scaleRole', role: 'matrix', factor: 0.7 }); matched.push('matrix share ×0.7'); }
  // more bloom in a season / more for a pollinator group
  const season = Object.keys(SEASON).find((k) => new RegExp(`\\b${k}\\b`).test(t));
  const group = GROUPS.find((g) => t.includes(g.replace(/s$/, '')));
  if (/\b(more|increase|extend|add|longer|stronger)\b/.test(t) && (season || group || /\b(bloom|flower|pollinator|nectar)\b/.test(t))) {
    const want = season ? SEASON[season] : months; const cov = coverageOf(mix.members.map((m) => m.plantId), K, months);
    const score = (id) => { const tr = K.traits(id); if (tr.bloom.status === 'unknown' || tr.windPollinated === true) return 0; let s = 0; for (const m of tr.bloom.value) if (want.includes(m)) s += cov.months.includes(m) ? 0.5 : 1.5; if (group && tr.pollinators.status !== 'unknown' && tr.pollinators.value.includes(group)) s += 2; return s; };
    const already = [...inMix].filter((id) => score(id) > 0);
    const herb = (id) => { const o = cat.find((s) => s.id === id); return o && o.plantType !== 'shrub' && o.plantType !== 'tree' && (o.nominalSpreadM || 0.5) <= 1.2; }; // automatic additions stay herbaceous (named additions are not limited)
    const cand = cat.map((s) => s.id).filter((id) => herb(id) && !inMix.has(id) && !changes.some((c) => c.plantId === id) && ![...inMix].some((x) => sameTaxon(x, id))).map((id) => [id, score(id)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (cand.length) { const id = cand[0][0]; const tr = K.traits(id); changes.push({ op: 'add', plantId: id, role: tr.role.status !== 'unknown' && tr.role.value !== 'matrix' ? tr.role.value : 'seasonal', proportion: 0.1 }); matched.push(`${season ? season + ' bloom' : group ? group : 'more flowering'}: add ${short(id)} (known flowering ${tr.bloom.value.map((m) => MONTHS[m - 1]).join(', ')}${group ? `, ${tr.pollinators.status !== 'unknown' ? tr.pollinators.value.join(', ') : 'groups unknown'}` : ''}; source ${tr.bloom.source})`); }
    for (const id of already.filter((id) => { const tr = K.traits(id); return tr.bloom.value.some((m) => want.includes(m)); }).slice(0, 3)) changes.push({ op: 'setProportion', plantId: id, proportion: (mix.members.find((m) => m.plantId === id).proportion) * 1.25 });
    if (already.length) matched.push(`members already flowering then raised ×1.25`);
    if (!cand.length && !already.length) matched.push(`no plant with known flowering in ${season || 'those months'} is available`);
  }
  if (lockMatrix) { for (const c of changes) if (c.op === 'setProportion' || c.op === 'add') c.fixMatrix = true; }
  if (!changes.length) return { ok: false, mode: 'rules', error: 'Not interpreted in Rules mode. Rules mode understands: add / remove / replace a plant by name, more or less grass (matrix), keep the matrix, more spring / summer / autumn bloom, more for bees / butterflies / … — or edit the members directly.', matched };
  // proposed patch: preview only, nothing applied here
  let next = editMix(mix, changes.map(({ fixMatrix, ...c }) => c), 'Rules-mode edit: ' + matched.join('; '));
  if (lockMatrix) { const before = new Map(mix.members.filter((m) => m.role === 'matrix').map((m) => [m.plantId, m.proportion])); const fixed = next.members.map((m) => (before.has(m.plantId) ? { ...m, proportion: before.get(m.plantId), _fix: true } : m)); const fs = fixed.filter((m) => m._fix).reduce((a, m) => a + m.proportion, 0); const rs = fixed.filter((m) => !m._fix).reduce((a, m) => a + m.proportion, 0) || 1; next = { ...next, members: normalize(fixed.map(({ _fix, ...m }) => (_fix ? m : { ...m, proportion: (m.proportion / rs) * (1 - fs) }))) }; }
  return { ok: true, mode: 'rules', changes, matched, method: 'Rules mode: fixed patterns, deterministic; not a language model.', proposed: next };
}
