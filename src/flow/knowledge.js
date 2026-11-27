// Active Knowledge: one read interface over the knowledge scopes a design may use.
//
//   foundation   Planting Intelligence knowledge (knowledge/data/seed.json via PlantLibrary): only records whose place applies
//                to the project place (same / within / broader by default; "elsewhere" is listed, never applied)
//   site list    attributes printed on the site's own plant lists (data/<site>/design-library.json: meadow hydrology)
//   project      records the designer added for this project (stored in the project state; facts and preferences apart)
//   personal     the designer's personal notebook (IndexedDB 'gp-knowledge', shared with the Knowledge workspace)
//   illustrative teaching values (data/<site>/teaching-traits.json) — switchable, labelled, never evidence
//
// Each trait answer carries its status (known / unknown / conflict), the value used, the source scope, the evidence
// records and the alternatives that disagree. Precedence when sources disagree: personal > project > foundation >
// site list > illustrative, unless the designer chose another source for that trait in this project (a scoped choice,
// stored as a project preference — never a silent global overwrite).
export const GROUPS = ['bees', 'bumblebees', 'butterflies', 'moths', 'flies', 'beetles', 'wasps', 'hummingbirds'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const SCOPE_LABEL = { foundation: 'Foundation knowledge', site: 'Site plant list', project: 'This project', personal: 'My knowledge', illustrative: 'Illustrative (teaching) — not verified' };
const ORDER = ['personal', 'project', 'foundation', 'site', 'illustrative'];
const EXPO_TO_LIGHT = { 'exposure:full_sun': 'sun', 'exposure:sun': 'sun', 'exposure:part_sun_part_shade': 'part', 'exposure:part_shade': 'part', 'exposure:filtered_shade': 'part', 'exposure:shade': 'shade', 'exposure:deep_shade': 'shade' };
const HYD_TO_MOIST = { dry: 'dry', moist: 'moist', wet: 'wet' };
export const ROLES = { matrix: 'Matrix', structure: 'Structure', seasonal: 'Seasonal', filler: 'Filler', ephemeral: 'Ephemeral' };

export class ActiveKnowledge {
  constructor({ store, library, teaching, project }) {
    this.s = store; this.lib = library; this.teaching = teaching || null; this.project = project; // project: () => state
    this.scopes = { foundation: true, site: true, project: true, personal: true, illustrative: !!teaching };
    this._cache = new Map(); this.rev = 0; this.listeners = new Set();
    if (library) library.onChange(() => this.invalidate('library'));
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  invalidate(why) { this._cache.clear(); this.rev++; for (const f of this.listeners) f(why); }
  setScope(k, on) { if (!(k in this.scopes)) return; if (k === 'illustrative' && !this.teaching) on = false; this.scopes[k] = !!on; this.invalidate('scope'); }
  version() { const P = this.project(); const pk = P && P.knowledge ? P.knowledge.records.length + ':' + (P.knowledge.prefs || []).length : '0'; return `ak${this.rev}|${this.lib ? this.lib.revision : 'nolib'}|p${pk}|${Object.entries(this.scopes).filter(([, v]) => v).map(([k]) => k[0]).join('')}`; }
  sourcesStatus() {
    const P = this.project(); const lib = this.lib;
    return {
      foundation: { on: this.scopes.foundation, status: lib ? lib.status : 'unavailable', note: 'Planting Intelligence base: mostly Metro Vancouver plants; for Detroit species it holds legend roles, 37 Robertson 1929 visitor lists (Illinois) and one applicable light record. Applied only where its place fits Detroit.' },
      site: { on: this.scopes.site, status: 'loaded', note: 'Hydrology printed on the official meadow plant lists.' },
      project: { on: this.scopes.project, status: 'loaded', count: P && P.knowledge ? P.knowledge.records.length : 0 },
      personal: { on: this.scopes.personal, status: lib && lib.kb ? 'loaded' : 'unavailable', count: lib && lib.kb ? lib.kb.events.length : 0 },
      illustrative: { on: this.scopes.illustrative, status: this.teaching ? 'loaded' : 'absent', count: this.teaching ? Object.keys(this.teaching.species).length : 0, note: this.teaching ? `Teaching values (flowering, pollinators, light, moisture) for ${Object.keys(this.teaching.species).length} Detroit plants — not a survey, not checked against a source.` : null, statement: this.teaching ? this.teaching.statement : null },
    };
  }

  // ---------------------------------------------------------------- per-source raw values
  _foundation(spId) {
    const out = {}; const lib = this.lib; if (!lib || !lib.kb) return out;
    const b = lib.bloom(spId); if (b.status === 'known') out.bloom = { value: b.months, evidence: b.applied.map(({ r }) => lib.describe(r)), personal: b.applied.some(({ r }) => r.origin !== 'preset') };
    const e = lib.exposure(spId); if (e.status === 'known') { const v = [...new Set(e.values.map((x) => EXPO_TO_LIGHT[x]).filter(Boolean))]; if (v.length) out.light = { value: v, evidence: e.applied.map(({ r }) => lib.describe(r)), personal: e.applied.some(({ r }) => r.origin !== 'preset') }; }
    else if (e.status === 'not applicable here') out.lightElsewhere = e.notApplied.map(({ r }) => lib.describe(r));
    const pg = this._personalGroups(spId); if (pg) out.pollinators = pg;
    const ob = lib.pollinators(spId); if (ob) out.visitors = { taxa: ob.taxa, recordId: ob.recordId, note: 'Robertson (1929) lists insect taxa visiting this species near Carlinville, Illinois (historical, name-match lead): evidence of insect visitors, not of groups, abundance or Detroit.' };
    const h = lib.hydrology(spId); if (h.status === 'personal') out.moisturePersonal = { value: h.range.map((x) => HYD_TO_MOIST[x]).filter(Boolean), evidence: [{ id: h.recordId, statement: h.statement }] };
    else if (h.status === 'source') out.moistureSite = { value: h.range.map((x) => HYD_TO_MOIST[x]).filter(Boolean), evidence: [{ id: h.sourceRef, statement: `printed on the official meadow plant list (${h.sourceRef})` }] };
    return out;
  }
  _personalGroups(spId) {
    const lib = this.lib; if (!lib || !lib.kb) return null;
    const recs = lib.recordsOf(spId).filter((r) => r.value && r.value.data && Array.isArray(r.value.data.pollinator_groups) && r.value.data.pollinator_groups.length).filter((r) => lib.applicability(r).applies);
    if (!recs.length) return null; const g = new Set(); for (const r of recs) for (const x of r.value.data.pollinator_groups) g.add(x);
    return { value: [...g], evidence: recs.map((r) => lib.describe(r)), personal: recs.some((r) => r.origin !== 'preset') };
  }
  _project(spId) {
    const P = this.project(); const out = {}; if (!P || !P.knowledge) return out;
    for (const r of P.knowledge.records) { if (r.plantId !== spId || r.kind !== 'fact' || r.scope === 'mix') continue; out[r.attr] = { value: r.value, evidence: [{ id: r.id, statement: r.original || r.statement, source: 'project', at: r.at, uncertainty: r.uncertainty }] }; }
    return out;
  }
  _teach(spId) { const t = this.teaching && this.teaching.species[spId]; return t || null; }

  // ---------------------------------------------------------------- one trait
  _resolve(spId, attr, cands) {
    const P = this.project(); const pref = P && P.knowledge && (P.knowledge.prefs || []).find((p) => p.type === 'source' && p.plantId === spId && p.attr === attr);
    const avail = cands.filter((c) => c && c.value != null && (!Array.isArray(c.value) || c.value.length));
    if (!avail.length) return { status: 'unknown', value: null, source: null, evidence: [], alternatives: [] };
    let use = pref ? avail.find((c) => c.scope === pref.source) : null; if (!use) use = avail.slice().sort((a, b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope))[0];
    const key = (v) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v);
    const others = avail.filter((c) => c !== use && key(c.value) !== key(use.value));
    return { status: others.length ? 'conflict' : 'known', value: use.value, source: use.scope, chosen: !!(pref && use.scope === pref.source), evidence: use.evidence || [], alternatives: others.map((c) => ({ scope: c.scope, value: c.value, evidence: c.evidence || [] })) };
  }
  traits(spId) {
    const k = spId + '|' + this.version(); if (this._cache.has(k)) return this._cache.get(k);
    const sp = this.s.getObject(spId) || (this.project() && (this.project().plants || []).find((p) => p.id === spId)) || null;
    const S = this.scopes; const F = S.foundation ? this._foundation(spId) : {}; const Pj = S.project ? this._project(spId) : {}; const T = S.illustrative ? this._teach(spId) : null;
    const tagged = (scope, o) => (o ? { scope, ...o } : null);
    const personal = (o) => (o && o.personal ? o : null), preset = (o) => (o && !o.personal ? o : null);
    const teach = (field) => (T && T[field] != null ? { scope: 'illustrative', value: T[field], evidence: [{ id: 'teaching:' + spId + ':' + field, statement: 'Illustrative teaching value — not verified', source: 'illustrative' }] } : null);
    const res = {
      id: spId, name: sp ? sp.scientificName : spId, cultivar: sp ? sp.cultivar : null, plantType: sp ? sp.plantType : null,
      isNew: !!(sp && sp.runtime), proxy: !!(sp && sp.runtime),
      bloom: this._resolve(spId, 'bloom', [tagged('personal', S.personal ? personal(F.bloom) : null), tagged('project', Pj.bloom), tagged('foundation', preset(F.bloom)), teach('flowering_months')]),
      pollinators: this._resolve(spId, 'pollinators', [tagged('personal', S.personal ? personal(F.pollinators) : null), tagged('project', Pj.pollinators), tagged('foundation', preset(F.pollinators)), teach('pollinator_groups')]),
      resource: this._resolve(spId, 'resource', [tagged('project', Pj.resource), teach('flower_resource')]),
      light: this._resolve(spId, 'light', [tagged('personal', S.personal ? personal(F.light) : null), tagged('project', Pj.light), tagged('foundation', preset(F.light)), teach('light')]),
      moisture: this._resolve(spId, 'moisture', [tagged('personal', S.personal ? F.moisturePersonal : null), tagged('project', Pj.moisture), tagged('site', S.site ? F.moistureSite : null), teach('moisture')]),
      role: this._resolve(spId, 'role', [tagged('project', Pj.role), teach('role_hint')]),
      visitors: F.visitors || null, lightElsewhere: F.lightElsewhere || null,
      spreadM: sp ? (sp.nominalSpreadM || 0.5) : 0.5, heightM: sp ? (sp.nominalHeightM || 0.6) : 0.6, sizeBasis: 'nominal size of the display proxy (inferred, not a knowledge record)',
    };
    // flowering is a pollinator resource only if not wind-pollinated (known); groups need flowering to be meaningful
    res.windPollinated = res.resource.status !== 'unknown' && res.resource.value === 'wind' ? true : (res.plantType === 'grass' || res.plantType === 'sedge') && res.resource.status === 'unknown' ? null : false;
    this._cache.set(k, res); return res;
  }
  // flowering status of a species in a month: 'yes' | 'no' | 'unknown' ; resource = yes and not wind
  floweringIn(spId, m) { const t = this.traits(spId); if (t.bloom.status === 'unknown') return 'unknown'; return t.bloom.value.includes(m) ? 'yes' : 'no'; }
  resourceIn(spId, m) {
    const t = this.traits(spId); if (t.bloom.status === 'unknown') return 'unknown';
    if (!t.bloom.value.includes(m)) return 'no';
    if (t.windPollinated === true) return 'no';
    if (t.windPollinated === null) return 'unknown';
    return 'yes';
  }
  coverage(spIds) {
    const n = spIds.length || 1; const c = { bloom: 0, pollinators: 0, light: 0, moisture: 0, illustrative: 0 };
    for (const id of spIds) { const t = this.traits(id); for (const a of ['bloom', 'pollinators', 'light', 'moisture']) if (t[a].status !== 'unknown') c[a]++; if (['bloom', 'pollinators', 'light', 'moisture'].some((a) => t[a].source === 'illustrative')) c.illustrative++; }
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(v / n).toFixed(3)]));
  }
  // catalogue of plants a mix can use: the site's species (not trees, not lawn) + plants added in this project
  catalogue() {
    const P = this.project(); const list = this.s.model.species.filter((s) => s.plantType !== 'tree' && s.id !== 'sp.lawn' && !s.id.startsWith('sp.unidentified'));
    const extra = (P && P.plants) || []; return [...list, ...extra.filter((p) => !list.some((s) => s.id === p.id))];
  }
}

// ---------------------------------------------------------------- writing knowledge from the design (scoped)
let _n = 0;
export function newRecordId(prefix = 'pk') { return `${prefix}.${Date.now().toString(36)}${(++_n).toString(36)}`; }
// a bounded, explicit parser for short notes (Rules mode) — returns proposed structured claims for review, never saves
export function parseNote(text, catalogue) {
  const t = String(text || '').toLowerCase(); const out = []; const reasons = [];
  const plant = findPlant(t, catalogue);
  const mm = MONTHS.map((m, i) => [m.toLowerCase(), i + 1]);
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const monthsIn = (s) => { const found = new Set(); full.forEach((m, i) => { if (s.includes(m)) found.add(i + 1); }); mm.forEach(([m, i]) => { if (new RegExp(`\\b${m}\\b`).test(s)) found.add(i); }); return [...found].sort((a, b) => a - b); };
  const range = t.match(/(?:flowers?|blooms?|flowering)[^.]*?\b(?:from\s+)?([a-z]+)(?:\s+(?:to|until|through|till)\s+|\s*[–-]\s*)([a-z]+)/);
  const rangeOK = range && monthsIn(range[1]).length && monthsIn(range[2]).length;
  if (rangeOK) { const a = monthsIn(range[1]), b = monthsIn(range[2]); if (a.length && b.length) { const ms = []; for (let m = a[0]; ; m = (m % 12) + 1) { ms.push(m); if (m === b[0] || ms.length > 12) break; } out.push({ attr: 'bloom', value: ms }); reasons.push(`month range "${range[1]}–${range[2]}"`); } }
  else if (/flower|bloom/.test(t)) { const ms = monthsIn(t); if (ms.length) { out.push({ attr: 'bloom', value: ms }); reasons.push('months named with flowering'); } }
  const groups = GROUPS.filter((g) => t.includes(g.replace(/s$/, ''))); if (groups.length && /visit|pollinat|attract|feed|forag|bee|butterfl|moth|fly|flies|beetle|wasp|humming/.test(t)) { const g2 = groups.filter((g) => !(g === 'bees' && groups.includes('bumblebees') && !/\bbees?\b/.test(t.replace(/bumblebees?/g, '')))); out.push({ attr: 'pollinators', value: g2 }); reasons.push('pollinator group names'); }
  if (/\b(full sun|sunny|in sun)\b/.test(t)) { out.push({ attr: 'light', value: /part/.test(t) ? ['sun', 'part'] : ['sun'] }); reasons.push('light words'); }
  else if (/\b(part shade|half shade|partial shade|semi-shade|part sun)\b/.test(t)) { out.push({ attr: 'light', value: /deep shade|full shade|\bshade\b.*\bshade\b/.test(t) ? ['part', 'shade'] : ['part'] }); reasons.push('light words'); }
  else if (/\b(shade|shady)\b/.test(t)) { out.push({ attr: 'light', value: ['shade'] }); reasons.push('light words'); }
  if (/\b(wet|waterlogged|boggy)\b/.test(t)) { out.push({ attr: 'moisture', value: ['wet'] }); reasons.push('moisture words'); }
  else if (/\b(moist|damp)\b/.test(t)) { out.push({ attr: 'moisture', value: ['moist'] }); reasons.push('moisture words'); }
  else if (/\b(dry|drought)\b/.test(t)) { out.push({ attr: 'moisture', value: ['dry'] }); reasons.push('moisture words'); }
  let pref = null; if (/\b(avoid|don't use|do not use|never use|dislike)\b/.test(t)) pref = 'avoid'; else if (/\b(prefer|favour|favor|i like|use more)\b/.test(t)) pref = 'favour';
  return { plant, claims: out, preference: pref, method: 'rules: keyword and month-name matching (bounded parser, not a language model)', matched: reasons };
}
export function findPlant(t, catalogue) {
  t = String(t || '').toLowerCase(); let best = null, bl = 0;
  for (const s of catalogue) { const names = [s.scientificName, s.cultivar ? `${s.scientificName} ${s.cultivar}` : null, ...(s.aliases || [])].filter(Boolean).map((x) => x.toLowerCase()); for (const n of names) if (n.length > 3 && t.includes(n) && n.length > bl) { best = s; bl = n.length; } }
  if (!best) { for (const s of catalogue) { const g = s.scientificName.toLowerCase().split(' '); if (g.length >= 2 && t.includes(g[0]) && t.includes(g[1].slice(0, 5)) && g.join(' ').length > bl) { best = s; bl = g.join(' ').length; } } }
  return best ? best.id : null;
}
