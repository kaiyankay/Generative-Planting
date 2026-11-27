// Derived analyses for the Knowledge Workspace. Pure functions over one KB state (no DOM, no invented values).
// Every view (Network, Profiles, Compare, Seasons, Composition, Survey, Research, Local, Personal, Connections) reads from here,
// so Preset / My knowledge / Combined differ only in which KB is passed in.

const cache = new WeakMap();
function memo(kb, key, fn) {
  let m = cache.get(kb.state); if (!m) { m = new Map(); cache.set(kb.state, m); }
  if (!m.has(key)) m.set(key, fn());
  return m.get(key);
}

// ---------- vocabulary ----------
export const THEMES = {
  water: { label: 'Water & soil', facets: ['water', 'soil'] },
  tolerance: { label: 'Tolerance', facets: ['stress', 'browsing'] },
  ecology: { label: 'Ecology', facets: ['ecology'] },
  light: { label: 'Light', facets: ['exposure'] },
  use: { label: 'Use & season', facets: ['use', 'interest'] },
};
const FACET_THEME = Object.fromEntries(Object.entries(THEMES).flatMap(([t, d]) => d.facets.map(f => [f, t])));

/** Knowledge types: what kind of professional knowledge a record contributes (used for coverage, never for scores). */
export const KTYPES = [
  ['form', 'Form & size'], ['site', 'Site'], ['tolerance', 'Tolerance'], ['ecology', 'Ecology'], ['season', 'Season'], ['use', 'Use & practice'],
  ['designers', 'Designers (survey)'], ['local', 'Local data'], ['research', 'Research lead'], ['recipes', 'Recipes'], ['mine', 'Mine'],
];
export const ATTRIBUTE_TYPES = ['form', 'site', 'tolerance', 'ecology', 'season', 'use'];
const PRED_TYPE = {
  mature_height: 'form', mature_spread: 'form', habit: 'form', form: 'form', texture: 'form', growth_rate: 'form', time_to_intended_size: 'form',
  exposure: 'site', water_drainage: 'site', soil_type: 'site', hardiness_zone: 'site',
  resistances: 'tolerance', pest_susceptibility: 'tolerance', invasive_status: 'tolerance', toxicity: 'tolerance',
  ecological_value: 'ecology', seasonal_interest: 'season',
  landscape_use: 'use', maintenance_level: 'use', behaviour_with_others: 'use', long_term_performance: 'use',
  vancouver_context: 'local', local_mature_size: 'local', in_vancouver_street_tree_list: 'local',
  has_observation: 'research', fills_role: 'recipes',
};
export const LOCAL_SOURCES = new Set(['eflora', 'cov_trees', 'inat', 'iscbc']);
export const isSurvey = r => (r.sourceRefs?.[0]?.sourceId || '').startsWith('survey-r') || r.layer === 'survey candidate';
export function ktypeOf(r) {
  if (r.origin === 'user') return 'mine';
  if (isSurvey(r)) return 'designers';
  const src = r.sourceRefs?.[0]?.sourceId;
  if (LOCAL_SOURCES.has(src) && PRED_TYPE[r.predicate] === 'local') return 'local';
  return PRED_TYPE[r.predicate] || null;
}
export const isLead = r => !!(r.taxonMatch && !r.taxonMatch.checked);

// ---------- indexes ----------
export function bySubject(kb) {
  return memo(kb, 'bySubject', () => {
    const m = new Map();
    for (const r of kb.state.records.values()) for (const s of r.subjects) { if (!m.has(s)) m.set(s, []); m.get(s).push(r); }
    return m;
  });
}
export const activeOf = (kb, id) => (bySubject(kb).get(id) || []).filter(r => r._eff.active);

/** cultivar → species (identity link only; records are never copied) */
export function speciesOf(kb, id) {
  return memo(kb, 'cultivarOf', () => {
    const m = new Map();
    for (const rel of kb.state.relations.values()) if (rel.predicate === 'cultivar_of' && rel._eff.active) m.set(rel.from, rel.to);
    return m;
  }).get(id) || null;
}
export function cultivarsOf(kb, id) {
  return memo(kb, 'cultivars', () => {
    const m = new Map();
    for (const rel of kb.state.relations.values()) if (rel.predicate === 'cultivar_of' && rel._eff.active) { if (!m.has(rel.to)) m.set(rel.to, []); m.get(rel.to).push(rel.from); }
    return m;
  }).get(id) || [];
}

export const isPlant = e => e && (e.type === 'plant' || e.type === 'cultivar');
export const surveySources = kb => [...kb.state.sources.values()].filter(s => s.id.startsWith('survey-r'));

// ---------- plant identity: four independent dimensions ----------
/** Coverage of one taxon: knowledge types from its own records, and (for a cultivar) from its species — kept apart. */
export function coverage(kb, id) {
  const direct = {}; const via = {};
  for (const r of activeOf(kb, id)) { const t = ktypeOf(r); if (t) direct[t] = (direct[t] || 0) + 1; }
  const sp = speciesOf(kb, id);
  if (sp) for (const r of activeOf(kb, sp)) { const t = ktypeOf(r); if (t && t !== 'recipes') via[t] = (via[t] || 0) + 1; }
  const attrs = ATTRIBUTE_TYPES.filter(t => direct[t]).length;
  const attrsVia = ATTRIBUTE_TYPES.filter(t => via[t]).length;
  const level = attrs >= 4 ? 'full' : attrs >= 1 ? 'partial' : 'names';
  return { direct, via, species: sp, attrs, attrsVia, level, types: Object.keys(direct).length };
}

export const COVERAGE_LEVEL = { full: 'Full profile', partial: 'Some attributes', names: 'Name only' };
export const ORIGINS = { library: 'Plant Library (planting-db)', detroit: 'Detroit plan', survey: 'Named in the survey', robertson: 'Robertson 1929', lists: 'My lists & tables', mine: 'Added by me' };
export const STATUS = { established: 'Established name', provisional: 'Provisional (mine)', candidate: 'Survey name, unconfirmed', placeholder: 'Placeholder in a plan' };
export const CONTRIB = { preset: 'Preset', added: 'Added by me', annotated: 'With my knowledge' };

export function plantFacts(kb, id) {
  const e = kb.state.entities.get(id); if (!isPlant(e)) return null;
  const recs = bySubject(kb).get(id) || [];
  const act = recs.filter(r => r._eff.active);
  const origins = new Set();
  if (e.seedSet === 'planting-db-10' || e.layer === 'planting-db kg') origins.add('library');
  if ((e.spatialIds || []).length || act.some(r => r.predicate === 'fills_role')) origins.add('detroit');
  if (e.status === 'candidate' || act.some(isSurvey)) origins.add('survey');
  if (act.some(r => r.datasetId === 'ds:robertson-1929')) origins.add('robertson');
  if (act.some(r => r.origin === 'user' && r.datasetId)) origins.add('lists');
  if (e.origin === 'user') origins.add('mine');
  const cov = coverage(kb, id);
  const status = e.origin === 'user' ? 'provisional' : (e.status || 'established');
  const contrib = new Set([e.origin === 'user' ? 'added' : 'preset']);
  if (act.some(r => r.origin === 'user') || [...kb.state.excluded.keys()].some(x => recs.some(r => r.id === x))) contrib.add('annotated');
  return { id, entity: e, kind: e.type === 'cultivar' ? 'cultivar' : 'species', origins, status, contrib, coverage: cov, active: act.length,
    mine: act.filter(r => r.origin === 'user').length, plantType: e.plantType || null };
}

/** Every plant/cultivar with its four dimensions — counted once per stable entity id. */
export function allPlants(kb) {
  return memo(kb, 'allPlants', () => [...kb.state.entities.values()].filter(isPlant).map(e => plantFacts(kb, e.id)));
}

/** Plant counts with an explicit scope (species vs cultivars vs unconfirmed names vs records). */
export function plantTally(facts) {
  const t = { species: 0, cultivars: 0, placeholders: 0, candidates: 0, provisional: 0, total: facts.length, records: 0 };
  for (const f of facts) {
    if (f.status === 'candidate') t.candidates++;
    else if (f.status === 'placeholder') t.placeholders++;
    else if (f.kind === 'cultivar') t.cultivars++;
    else t.species++;
    if (f.status === 'provisional') t.provisional++;
    t.records += f.active;
  }
  return t;
}

export function filterPlants(facts, f) {
  return facts.filter(x => (!f.coverage?.size || f.coverage.has(x.coverage.level)) && (!f.origin?.size || [...f.origin].some(o => x.origins.has(o)))
    && (!f.status?.size || f.status.has(x.status)) && (!f.contrib?.size || [...f.contrib].some(c => x.contrib.has(c))));
}

// ---------- shared-record network (a Plant Library visualisation, not the graph's generation rule) ----------
/** Concepts that two or more plants in scope carry according to active records.
 *  commonFrac: concepts carried by at least this share of the scope are folded into "common ground" (expandable), never deleted. */
export function sharedNetwork(kb, ids, { themes = ['water', 'tolerance', 'ecology', 'light'], commonFrac = 0.8, expandCommon = false } = {}) {
  const S = kb.state; const inScope = new Set(ids);
  const sup = new Map();   // concept → plant → { sources:Set, recs:[], mine }
  for (const id of ids) for (const r of activeOf(kb, id)) {
    for (const c of r.concepts || []) {
      const ce = S.entities.get(c); const theme = FACET_THEME[ce?.facet]; if (!theme) continue;
      if (!sup.has(c)) sup.set(c, new Map());
      const by = sup.get(c); if (!by.has(id)) by.set(id, { sources: new Set(), recs: [], mine: false });
      const x = by.get(id); x.sources.add(r.sourceRefs?.[0]?.sourceId || '?'); x.recs.push(r.id); if (r.origin === 'user') x.mine = true;
    }
  }
  const n = ids.length; const cut = n >= 5 ? Math.max(3, Math.ceil(n * commonFrac)) : Infinity;
  const hubs = []; const common = []; const unique = new Map();
  for (const [c, by] of sup) {
    const ce = S.entities.get(c); const theme = FACET_THEME[ce.facet];
    const h = { id: c, label: ce.name, theme, facet: ce.facet, plants: [...by.keys()].sort(), links: [...by].map(([p, x]) => ({ plant: p, sources: x.sources.size, records: x.recs, mine: x.mine })),
      mine: [...by.values()].some(x => x.mine) };
    if (by.size >= cut) { common.push(h); if (!expandCommon) continue; }
    if (by.size === 1) { const p = h.plants[0]; if (!unique.has(p)) unique.set(p, []); unique.get(p).push(h); continue; }
    if (!themes.includes(theme) && !(expandCommon && by.size >= cut)) continue;
    hubs.push(h);
  }
  hubs.sort((a, b) => b.plants.length - a.plants.length || a.label.localeCompare(b.label));
  common.sort((a, b) => b.plants.length - a.plants.length || a.label.localeCompare(b.label));
  // designers listing two plants together (survey co-listing): a separate, dashed relation; never "compatibility"
  const colisted = [];
  for (const id of ids) for (const r of activeOf(kb, id)) if (r.predicate === 'co_listed') for (const o of r.objects || []) if (inScope.has(o)) colisted.push({ a: id, b: o, recordId: r.id });
  const connected = new Set(hubs.flatMap(h => h.plants));
  const isolated = ids.filter(id => !connected.has(id));
  const groups = clusterPlants(ids.filter(id => connected.has(id)), hubs);
  const gaps = [];
  for (const id of ids) for (const t of themes) if (!hubs.some(h => h.theme === t && h.plants.includes(id)) && !common.some(h => h.theme === t && h.plants.includes(id))) gaps.push({ plant: id, theme: t });
  return { hubs, common, unique, colisted, isolated, groups, gaps, cut, n };
}

/** Exploratory grouping: average-linkage on Jaccard similarity of shared concepts. The number of groups follows the data
 *  (merging stops when the best pair shares less than `minSim`); singletons stay ungrouped. Not an ecological community. */
export function clusterPlants(ids, hubs, minSim = 0.25) {
  const sets = new Map(ids.map(p => [p, new Set(hubs.filter(h => h.plants.includes(p)).map(h => h.id))]));
  const jac = (a, b) => { const A = sets.get(a), B = sets.get(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.max(1, A.size + B.size - i); };
  let groups = ids.map(p => [p]);
  for (;;) {
    let best = null, bs = -1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      let s = 0; for (const a of groups[i]) for (const b of groups[j]) s += jac(a, b);
      s /= groups[i].length * groups[j].length;
      if (s > bs) { bs = s; best = [i, j]; }
    }
    if (!best || bs < minSim) break;
    groups[best[0]] = groups[best[0]].concat(groups[best[1]]); groups.splice(best[1], 1);
  }
  return groups.filter(g => g.length > 1).sort((a, b) => b.length - a.length).map(g => {
    const cnt = new Map(); for (const p of g) for (const h of sets.get(p)) cnt.set(h, (cnt.get(h) || 0) + 1);
    const need = Math.max(2, Math.ceil(g.length * 0.6));
    return { plants: g, sharedBy: [...cnt].filter(([, k]) => k >= need).sort((a, b) => b[1] - a[1]).map(([h]) => h).slice(0, 4) };
  });
}

// ---------- phenology ----------
export function flowering(kb, id) {
  const S = kb.state;
  return activeOf(kb, id).filter(r => r.value?.data?.flowering_months?.length).map(r => {
    const sid = r.sourceRefs?.[0]?.sourceId;
    return { recordId: r.id, sourceId: sid, sourceName: S.sources.get(sid)?.name || sid, place: r.context?.place || null, placeName: r.context?.place ? kb.label(r.context.place) : 'place not stated',
      months: [...new Set(r.value.data.flowering_months)].sort((a, b) => a - b), origin: r.origin, n: r.value.data.annotated_n || null };
  }).sort((a, b) => (a.place || '').localeCompare(b.place || '') || a.sourceName.localeCompare(b.sourceName));
}
/** Flowering for a taxon: its own records, else its species' (marked via species). */
export function floweringOf(kb, id) {
  const own = flowering(kb, id); if (own.length) return { rows: own, via: null };
  const sp = speciesOf(kb, id); if (sp) { const v = flowering(kb, sp); if (v.length) return { rows: v, via: sp }; }
  return { rows: [], via: null };
}

// ---------- compare rows (values with real meaning; full text stays in the inspector) ----------
const WATER_ORDER = ['water:dry', 'water:average', 'water:moist', 'water:wet'];
const LIGHT = [['sun', ['exposure:full_sun', 'exposure:sun']], ['part', ['exposure:part_sun_part_shade', 'exposure:part_shade', 'exposure:filtered_shade']], ['shade', ['exposure:shade', 'exposure:deep_shade']]];
export function compareRow(kb, id) {
  const S = kb.state; const e = S.entities.get(id);
  const sp = speciesOf(kb, id);
  const pick = (pid) => {
    const recs = activeOf(kb, pid);
    const heights = recs.filter(r => r.predicate === 'mature_height' && r.value?.data?.unit === 'm' && 'max' in r.value.data)
      .map(r => ({ min: r.value.data.min ?? r.value.data.max, max: r.value.data.max, source: r.sourceRefs[0].sourceId, recordId: r.id, mine: r.origin === 'user' }));
    const localH = recs.filter(r => r.predicate === 'local_mature_size' && r.value?.data?.unit === 'm' && r.value.data.median != null && !r.value.data.subset).map(r => ({ median: r.value.data.median, p10: r.value.data.p10, p90: r.value.data.p90, n: r.value.data.n, recordId: r.id }));
    const water = new Map(); for (const r of recs) for (const c of r.concepts || []) if (c.startsWith('water:')) { if (!water.has(c)) water.set(c, new Set()); water.get(c).add(r.sourceRefs[0].sourceId); }
    const light = {}; for (const [k, cs] of LIGHT) { const src = new Set(); for (const r of recs) if ((r.concepts || []).some(c => cs.includes(c))) src.add(r.sourceRefs[0].sourceId); if (src.size) light[k] = src.size; }
    const months = new Array(12).fill(0); for (const f of flowering(kb, pid)) for (const m of f.months) months[m - 1]++;
    const respondents = new Set(recs.filter(isSurvey).map(r => r.sourceRefs[0].sourceId));
    const rob = recs.find(r => r.datasetId === 'ds:robertson-1929');
    const native = recs.some(r => (r.concepts || []).includes('origin:native')) || /^native/.test(S.entities.get(pid)?.legacy?.entity?.origin_status || '');
    return { heights, localH, water: [...water].map(([c, s]) => ({ c, label: kb.label(c), sources: s.size, order: WATER_ORDER.indexOf(c) })), light, months, flowerSources: flowering(kb, pid).length,
      respondents: respondents.size, robertson: rob ? { taxa: rob.value.data.listed_visitor_taxa, recordId: rob.id, lead: isLead(rob) } : null, native, originStatus: S.entities.get(pid)?.legacy?.entity?.origin_status || null, records: recs.length };
  };
  const own = pick(id); const spv = sp ? pick(sp) : null;
  const recipes = new Set(); for (const r of activeOf(kb, id)) if (r.predicate === 'fills_role') for (const o of r.objects) { const sys = S.entities.get(o)?.system; if (sys) recipes.add(sys); }
  for (const c of cultivarsOf(kb, id)) for (const r of activeOf(kb, c)) if (r.predicate === 'fills_role') for (const o of r.objects) { const sys = S.entities.get(o)?.system; if (sys) recipes.add(sys); }
  const mine = activeOf(kb, id).filter(r => r.origin === 'user').length + (sp ? activeOf(kb, sp).filter(r => r.origin === 'user').length : 0);
  return { id, name: e.name, common: e.commonName || null, type: e.type, status: e.status, plantType: e.plantType || null, species: sp, own, viaSpecies: spv, recipes: recipes.size, mine };
}

// ---------- planting recipes ----------
export const ROLE_ORDER = ['emergent', 'individual', 'shrub', 'hedgerow', 'scatter', 'group', 'block', 'matrix', 'meadow', 'bulb-scatter', 'bulb-cluster', 'bulb-line', 'bulb-drift'];
export function recipeComposition(kb, systemId) {
  const S = kb.state; const sys = S.entities.get(systemId); if (!sys) return null;
  const roles = new Map();
  for (const r of S.records.values()) {
    if (!r._eff.active || r.predicate !== 'fills_role') continue;
    const role = S.entities.get(r.objects[0]); if (role?.system !== systemId) continue;
    const rn = r.value.data.drawingRole;
    if (!roles.has(rn)) roles.set(rn, { role: rn, legends: [], members: [] });
    const R = roles.get(rn); R.legends.push({ code: r.value.data.legendCode, recordId: r.id, subjects: r.subjects });
    for (const s of r.subjects) if (!R.members.some(m => m.id === s)) R.members.push({ id: s, legend: r.value.data.legendCode, recordId: r.id });
  }
  const order = [...roles.keys()].sort((a, b) => (ROLE_ORDER.indexOf(a) + 1 || 99) - (ROLE_ORDER.indexOf(b) + 1 || 99));
  const all = new Set(); const out = [];
  for (const rn of order) {
    const R = roles.get(rn);
    R.members = R.members.map(m => { all.add(m.id); const f = plantFacts(kb, m.id); const sp = speciesOf(kb, m.id); return { ...m, name: kb.label(m.id), kind: f.kind, status: f.status, plantType: f.plantType,
      species: sp, speciesProfile: sp ? plantFacts(kb, sp)?.coverage.level === 'full' : f.coverage.level === 'full', cov: f.coverage, flowering: floweringOf(kb, m.id), mine: f.mine + (sp ? activeOf(kb, sp).filter(r => r.origin === 'user').length : 0),
      robertson: (activeOf(kb, m.id).find(r => r.datasetId === 'ds:robertson-1929') ? 'taxon' : sp && activeOf(kb, sp).find(r => r.datasetId === 'ds:robertson-1929') ? 'species' : null) }; });
    out.push(R);
  }
  const members = [...all].map(id => plantFacts(kb, id));
  return { system: sys, roles: out, members: [...all], tally: plantTally(members) };
}
export function recipes(kb) {
  return [...kb.state.entities.values()].filter(e => e.type === 'planting_system').map(e => ({ id: e.id, name: e.name, members: recipeComposition(kb, e.id).members.length, style: e.style, version: e.version }));
}

// ---------- survey (professional value; anonymous ids stay in source details) ----------
const REASON = { seasonal_interest: 'Season & looks', ecological_value: 'Ecology / native', vancouver_context: 'Fits Vancouver', landscape_use: 'Use in design', behaviour_with_others: 'Behaviour with others',
  selection_reason: 'Reason (uncoded)', practitioner_note: 'Practice note', co_listed: 'Listed together' };
export const reasonOf = r => REASON[r.predicate] || REASON[r.knowledgeKind] || 'Other';
export function stripLead(text, names) {
  let t = String(text || '').replace(/^.*?derived from the respondent's note:\s*/i, '');
  for (const n of names) { const re = new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[—:–-]\\s*', 'i'); t = t.replace(re, ''); }
  return t.replace(/\s*…$/, '').trim();
}
export function survey(kb) {
  return memo(kb, 'survey', () => {
    const S = kb.state; const srcs = surveySources(kb);
    const recs = [...S.records.values()].filter(r => r._eff.active && isSurvey(r));
    const roles = new Map(); const exp = new Map();
    for (const s of srcs) { for (const x of s.roles || []) roles.set(x, (roles.get(x) || 0) + 1); for (const x of s.experience || []) exp.set(x, (exp.get(x) || 0) + 1); }
    const plants = new Map();
    for (const r of recs) for (const p of r.subjects) {
      if (!plants.has(p)) plants.set(p, { id: p, respondents: new Set(), reasons: new Map(), statements: [] });
      const x = plants.get(p); const rid = r.sourceRefs[0].sourceId; x.respondents.add(rid);
      const reason = reasonOf(r);
      if (!x.reasons.has(reason)) x.reasons.set(reason, new Set()); x.reasons.get(reason).add(rid);
      if (r.predicate !== 'co_listed') x.statements.push(r);
    }
    // one quote, several records (planting-db keeps the same answer under several fields): show once, say so
    for (const x of plants.values()) {
      const e = S.entities.get(x.id); const names = [e?.name, e?.commonName, ...(e?.aliases || [])].filter(Boolean).sort((a, b) => b.length - a.length);
      const groups = [];
      for (const r of x.statements) {
        const t = stripLead(r.statement, names); const k = t.toLowerCase();
        const g = groups.find(g => g.respondent === r.sourceRefs[0].sourceId && (g.key === k || g.key.startsWith(k) || k.startsWith(g.key)));
        if (g) { g.records.push(r.id); if (k.length > g.key.length) { g.key = k; g.text = t; } } else groups.push({ respondent: r.sourceRefs[0].sourceId, key: k, text: t, records: [r.id], kind: r.knowledgeKind });
      }
      x.quotes = groups;
    }
    const list = [...plants.values()].map(x => ({ ...x, n: x.respondents.size, inLibrary: S.entities.get(x.id)?.seedSet === 'planting-db-10', status: S.entities.get(x.id)?.status }))
      .sort((a, b) => b.n - a.n || kb.label(a.id).localeCompare(kb.label(b.id)));
    const pairs = recs.filter(r => r.predicate === 'co_listed').map(r => ({ a: r.subjects[0], b: r.objects[0], respondent: r.sourceRefs[0].sourceId, recordId: r.id }));
    return { respondents: srcs.length, answering: new Set(recs.map(r => r.sourceRefs[0].sourceId)).size, roles: [...roles].sort((a, b) => b[1] - a[1]), experience: [...exp].sort((a, b) => b[1] - a[1]),
      statements: recs.length, plants: list, pairs, reasons: Object.values(REASON) };
  });
}

// ---------- research ----------
export function robertson(kb) {
  const S = kb.state; const out = [];
  for (const r of S.records.values()) if (r._eff.active && r.datasetId === 'ds:robertson-1929' && r.origin !== 'user') {
    const id = r.subjects[0]; const f = plantFacts(kb, id);
    const inRecipes = new Set(); for (const x of [id, ...cultivarsOf(kb, id)]) for (const q of activeOf(kb, x)) if (q.predicate === 'fills_role') inRecipes.add(S.entities.get(q.objects[0])?.system);
    out.push({ id, name: kb.label(id), taxa: r.value.data.listed_visitor_taxa, rows: r.value.data.rows, recordId: r.id, lead: isLead(r), library: f?.origins.has('library'), recipes: [...inRecipes].filter(Boolean) });
  }
  return out.sort((a, b) => b.taxa - a.taxa);
}
export function sourceMatrix(kb, ids) {
  const S = kb.state; const cols = new Map();
  for (const id of ids) for (const r of activeOf(kb, id)) {
    const sid = r.sourceRefs?.[0]?.sourceId; if (!sid || isSurvey(r) || r.origin === 'user') continue;
    if (!cols.has(sid)) cols.set(sid, new Map()); const m = cols.get(sid); m.set(id, (m.get(id) || 0) + 1);
  }
  return [...cols].map(([sid, m]) => ({ source: S.sources.get(sid) || { id: sid, name: sid }, counts: m, total: [...m.values()].reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
}
export function literature(kb) {
  const S = kb.state; const P = ['typically_formed_by', 'corresponds_to', 'requires_trait', 'maps_to'];
  return [...S.relations.values()].filter(r => P.includes(r.predicate) && r._eff.active).map(r => ({ id: r.id, predicate: r.predicate, from: r.from, to: r.to, fromName: kb.label(r.from), toName: kb.label(r.to),
    basis: r.basis?.source || r.basis?.basis || null, formation: r.formation }));
}

// ---------- local ----------
export function localData(kb, place = 'place:vancouver') {
  const S = kb.state;
  const within = p => !!p && (p === place || kb.placeChain(p).includes(place));
  const recs = [...S.records.values()].filter(r => r._eff.active && within(r.context?.place));
  const bySource = new Map(); for (const r of recs) { const s = r.sourceRefs?.[0]?.sourceId || '?'; const k = isSurvey(r) ? 'survey' : r.origin === 'user' ? 'me' : s; bySource.set(k, (bySource.get(k) || 0) + 1); }
  const water = recs.filter(r => r.predicate === 'has_water_rule' || r.predicate === 'has_water_guidance');
  const plants = new Map(); for (const r of recs) for (const s of r.subjects) if (isPlant(S.entities.get(s))) { if (!plants.has(s)) plants.set(s, []); plants.get(s).push(r); }
  const chain = kb.placeChain(place).map(p => ({ id: p, name: kb.label(p) }));
  const children = [...S.placeParent].filter(([, par]) => par === place).map(([c]) => ({ id: c, name: kb.label(c) }));
  return { place, chain, children, records: recs, bySource: [...bySource].sort((a, b) => b[1] - a[1]), water, plants };
}

// ---------- the cross-collection neighbourhood of any object ----------
/** Grounded neighbours of a node, grouped by kind of relation. Every item carries the records (or relations) behind it. */
export function neighbours(kb, id) {
  const S = kb.state; const out = []; const push = (group, nid, kind, edge) => out.push({ group, id: nid, kind, ...edge });
  const e = S.entities.get(id);
  if (id === 'me') {
    for (const x of S.entities.values()) if (x.origin === 'user') push('Added by me', x.id, x.type, { label: 'added', recordIds: [], mine: true });
    for (const r of S.records.values()) if (r.origin === 'user' && r._eff.active) for (const s of r.subjects) push('My records about', s, S.entities.get(s)?.type, { label: r.revises ? 'my revision' : 'my note', recordIds: [r.id], mine: true });
    for (const [t] of S.excluded) { const r = S.records.get(t); if (r) for (const s of r.subjects) push('Left out by me', s, S.entities.get(s)?.type, { label: 'excluded a record', recordIds: [t], mine: true, style: 'excluded' }); }
    return merge(out);
  }
  if (id.startsWith('src:')) {
    const sid = id.slice(4); const isSv = sid === 'survey';
    for (const r of S.records.values()) if (r._eff.active && (isSv ? isSurvey(r) : r.sourceRefs?.[0]?.sourceId === sid)) for (const s of r.subjects) push(isPlant(S.entities.get(s)) ? 'Plants' : 'Topics', s, S.entities.get(s)?.type, { label: isSv ? 'named by designers' : 'documented by', recordIds: [r.id] });
    return merge(out);
  }
  if (!e) return [];
  const recs = bySubject(kb).get(id) || [];
  if (isPlant(e)) {
    for (const r of recs) {
      if (!r._eff.active) continue;
      const sid = r.sourceRefs?.[0]?.sourceId;
      if (r.origin === 'user') {
        if (r.objects?.length) for (const o of r.objects) push('My knowledge', o, S.entities.get(o)?.type, { label: kb.predicates[r.edgePredicate || r.predicate]?.label || r.predicate, recordIds: [r.id], mine: true });
        else push('My knowledge', 'rn:' + r.id, 'record', { label: r.revises ? 'my revision' : (r.knowledgeKind || 'note'), recordIds: [r.id], mine: true, name: (r.statement || '').slice(0, 48) });
        continue;
      }
      if (isSurvey(r)) { if (r.predicate === 'co_listed') for (const o of r.objects) push('Designers (survey)', o, 'plant', { label: 'listed together by a designer', recordIds: [r.id], style: 'dashed' }); else push('Designers (survey)', 'src:survey', 'survey', { label: 'statements by designers', recordIds: [r.id] }); continue; }
      if (r.predicate === 'fills_role') { for (const o of r.objects) { const sys = S.entities.get(o)?.system; if (sys) push('Planting recipes', sys, 'planting_system', { label: 'drawn as ' + (S.entities.get(o)?.roleName || 'role'), recordIds: [r.id] }); } continue; }
      if (r.datasetId === 'ds:robertson-1929') { push('Research', 'ds:robertson-1929', 'dataset', { label: 'flower visitors listed (name match only)', recordIds: [r.id], style: isLead(r) ? 'dotted' : null }); continue; }
      if (LOCAL_SOURCES.has(sid) || ktypeOf(r) === 'local') push('Local data', 'src:' + sid, 'source', { label: 'recorded by', recordIds: [r.id] });
      for (const c of r.concepts || []) { const ce = S.entities.get(c); if (!ce) continue; const th = FACET_THEME[ce.facet]; push(th ? 'Attributes · ' + THEMES[th].label : 'Attributes · other', c, 'concept', { label: kb.relFor(r, c).replace(/_/g, ' '), recordIds: [r.id] }); }
      if (!LOCAL_SOURCES.has(sid) && sid) push('Sources', 'src:' + sid, 'source', { label: 'documented by', recordIds: [r.id] });
    }
    const sp = speciesOf(kb, id); if (sp) push('Identity', sp, 'plant', { label: 'cultivar of (identity only)', recordIds: [], style: 'identity' });
    for (const c of cultivarsOf(kb, id)) {
      push('Identity', c, 'cultivar', { label: 'has cultivar (identity only)', recordIds: [], style: 'identity' });
      for (const r of activeOf(kb, c)) if (r.predicate === 'fills_role') for (const o of r.objects) { const sys = S.entities.get(o)?.system; if (sys) push('Planting recipes', sys, 'planting_system', { label: `via ${kb.label(c)}`, recordIds: [r.id], via: c }); }
    }
    for (const r of recs) if (r._eff.active && r.origin !== 'user' && r.context?.place) push('Where it was recorded', r.context.place, 'place', { label: 'recorded in', recordIds: [r.id] });
    // incoming: plants that co-list this one
    for (const r of S.records.values()) if (r._eff.active && r.predicate === 'co_listed' && (r.objects || []).includes(id)) push('Designers (survey)', r.subjects[0], 'plant', { label: 'listed together by a designer', recordIds: [r.id], style: 'dashed' });
    return merge(out);
  }
  if (e.type === 'planting_system') {
    const comp = recipeComposition(kb, id);
    for (const R of comp.roles) for (const m of R.members) push('Role · ' + R.role, m.id, S.entities.get(m.id)?.type, { label: `drawn as ${R.role} (legend ${m.legend})`, recordIds: [m.recordId] });
    push('Where it was recorded', 'place:detroit', 'place', { label: 'planted in', recordIds: comp.roles.flatMap(R => R.legends.map(l => l.recordId)).slice(0, 1) });
    return merge(out);
  }
  if (e.type === 'dataset' || e.type === 'list') {
    for (const r of S.records.values()) if (r._eff.active && (r.objects || []).includes(id)) for (const s of r.subjects) push('Plants', s, S.entities.get(s)?.type, { label: r.predicate === 'listed_in' ? 'listed in' : 'observed in', recordIds: [r.id], style: isLead(r) ? 'dotted' : null, mine: r.origin === 'user' });
    return merge(out);
  }
  if (e.type === 'concept' && e.facet === 'place') {
    const par = S.placeParent.get(id); if (par) push('Places', par, 'place', { label: 'part of', recordIds: [] });
    for (const [c, p] of S.placeParent) if (p === id) push('Places', c, 'place', { label: 'contains', recordIds: [] });
    for (const r of S.records.values()) if (r._eff.active && r.context?.place === id) for (const s of r.subjects) { const se = S.entities.get(s); push(isPlant(se) ? 'Plants recorded here' : 'Topics & rules', s, se?.type, { label: 'recorded here', recordIds: [r.id], mine: r.origin === 'user' }); }
    return merge(out);
  }
  if (e.type === 'concept') {
    for (const r of S.records.values()) if (r._eff.active && (r.concepts || []).includes(id)) for (const s of r.subjects) push('Plants', s, S.entities.get(s)?.type, { label: kb.relFor(r, id).replace(/_/g, ' '), recordIds: [r.id], mine: r.origin === 'user' });
    return merge(out);
  }
  if (e.type === 'topic') {
    for (const r of recs) if (r._eff.active) { if (r.context?.place) push('Applies in', r.context.place, 'place', { label: 'applies in', recordIds: [r.id] }); push('Sources', 'src:' + r.sourceRefs[0].sourceId, 'source', { label: 'stated by', recordIds: [r.id] }); }
    return merge(out);
  }
  if (e.type === 'role') { for (const r of S.records.values()) if (r._eff.active && (r.objects || []).includes(id)) for (const s of r.subjects) push('Plants', s, S.entities.get(s)?.type, { label: 'drawn in this role', recordIds: [r.id] }); if (e.system) push('Recipe', e.system, 'planting_system', { label: 'role in', recordIds: [] }); return merge(out); }
  return merge(out);
}
function merge(items) {
  const m = new Map();
  for (const it of items) {
    const k = it.group + '|' + it.id;
    if (!m.has(k)) m.set(k, { ...it, recordIds: [...it.recordIds], labels: new Set([it.label]) });
    else { const x = m.get(k); x.recordIds.push(...it.recordIds); x.labels.add(it.label); if (it.mine) x.mine = true; }
  }
  return [...m.values()].map(x => ({ ...x, recordIds: [...new Set(x.recordIds)], label: [...x.labels].join(' · '), weight: new Set(x.recordIds).size }));
}

/** Node display info for any id used in the graph (entities, sources, record nodes). */
export function nodeInfo(kb, id) {
  const S = kb.state;
  if (id === 'me') return { id, kind: 'me', name: 'My knowledge', mine: true };
  if (id.startsWith('src:')) { const sid = id.slice(4); if (sid === 'survey') return { id, kind: 'survey', name: 'Designer survey' }; const s = S.sources.get(sid); return { id, kind: 'source', name: s?.name || sid, short: shortSource(s, sid) }; }
  if (id.startsWith('rn:')) { const r = S.records.get(id.slice(3)); return { id, kind: 'record', name: (r?.statement || '').slice(0, 60), mine: true, recordId: id.slice(3) }; }
  const e = S.entities.get(id); if (!e) return { id, kind: 'unknown', name: id };
  return { id, kind: e.type === 'concept' && e.facet === 'place' ? 'place' : e.type, name: e.name, common: e.commonName || null, mine: e.origin === 'user', status: e.status, plantType: e.plantType || null,
    art: e.seedSet === 'planting-db-10' ? e.id : null, sci: isPlant(e) };
}
export function shortSource(s, sid) {
  const map = { rhs: 'RHS', mobot: 'Missouri Botanical Garden', usda_plants: 'USDA PLANTS', osu: 'Oregon State Univ.', gpp: 'Great Plant Picks', eflora: 'E-Flora BC', cov_trees: 'Vancouver street trees', inat: 'iNaturalist', iscbc: 'Invasive Species Council BC', me: 'Me' };
  return map[sid] || (s?.name || sid).split(/[,(:—]/)[0].trim().slice(0, 32);
}
