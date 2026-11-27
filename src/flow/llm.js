// One adapter for mix reasoning. Two providers share the same structured request / response and the same validation:
//   rules  — offline, explicit rules (suggest.js). Always available. Labelled "Rules mode", never "AI".
//   live   — a language model behind a local server endpoint (tools/flow_server.py → /api/flow/llm/*). Only if that server
//            reports it is configured (SDK + credentials + explicit permission to spend). No key ever reaches the browser.
// A live answer is accepted only after validation: known plant ids, valid roles, proportions, evidence ids that were
// actually supplied in the request (an invented id is refused), no coordinates or metrics. On timeout / failure / invalid
// output the user's work is untouched and Rules mode stays available.
import { suggestMixes, interpretEdit } from './suggest.js';
import { ROLES } from './knowledge.js';
import { normalize } from './mix.js';

export class MixReasoner {
  constructor({ K, endpoint = 'api/flow/llm', timeoutMs = 45000 } = {}) {
    this.K = K; this.endpoint = endpoint; this.timeoutMs = timeoutMs;
    this.status = { mode: 'rules', live: false, checked: false, reasons: ['not checked yet'], model: null };
    this.log = []; // provider mode of every request (honest record)
  }
  async probe() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
      const r = await fetch(this.endpoint + '/status', { signal: ctl.signal, cache: 'no-store' }); clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      this.status = { mode: j.configured ? 'live' : 'rules', live: !!j.configured, checked: true, reasons: j.reasons || [], model: j.model || null };
    } catch (e) { this.status = { mode: 'rules', live: false, checked: true, reasons: ['no language-model server on this page (static hosting or not started)'], model: null }; }
    return this.status;
  }
  label() { return this.status.live ? `Language model (${this.status.model})` : 'Rules mode — offline, no language model'; }

  // structured context the model receives (and the rules use)
  request({ brief, cells, prefs, mixes, instruction, mix }) {
    const plants = this.K.catalogue().map((s) => { const t = this.K.traits(s.id); return { id: s.id, name: s.scientificName + (s.cultivar ? ` '${s.cultivar}'` : ''), type: s.plantType, bloom: t.bloom.status !== 'unknown' ? t.bloom.value : null, pollinators: t.pollinators.status !== 'unknown' ? t.pollinators.value : null, light: t.light.status !== 'unknown' ? t.light.value : null, moisture: t.moisture.status !== 'unknown' ? t.moisture.value : null, role: t.role.status !== 'unknown' ? t.role.value : null, evidence: [t.bloom, t.pollinators, t.light, t.moisture].flatMap((x) => (x.evidence || []).map((e) => e.id)).filter(Boolean), sources: [...new Set([t.bloom, t.pollinators, t.light, t.moisture].map((x) => x.source).filter(Boolean))] }; })
      .filter((p) => p.bloom || p.light || p.role);
    return { schema: 'gp.mixRequest/1', brief, cells: cells.map((c) => ({ id: c.id, areaM2: c.areaM2, conditions: c.conditions ? { canopy: c.conditions.canopy, pathEdge: c.conditions.pathEdge, unknown: (c.conditions.unknown || []).map((u) => u.field) } : null })), plants, preferences: prefs || [], existingMixes: (mixes || []).map((m) => ({ id: m.id, name: m.name, members: m.members })), mix: mix || null, instruction: instruction || null, roles: Object.keys(ROLES), rules: 'Use only plant ids and evidence ids given here. Proportions are shares of individual plants and sum to 1. Do not give coordinates, counts or metrics. List unknowns and suggested knowledge additions separately.' };
  }

  async suggest({ brief, cells, prefs, mixes }) {
    if (this.status.live) {
      const req = this.request({ brief, cells, prefs, mixes });
      const r = await this._post('/suggest', req);
      if (r.ok) { const v = validateSuggestion(r.body, req); this.log.push({ at: new Date().toISOString(), op: 'suggest', provider: 'live', valid: v.ok }); if (v.ok) return { ...v.value, mode: 'live', model: this.status.model }; return { ok: false, mode: 'live', error: 'The model answer was refused by validation: ' + v.errors.join('; '), fallback: suggestMixes({ brief, cells, K: this.K, prefs }) }; }
      this.log.push({ at: new Date().toISOString(), op: 'suggest', provider: 'live', error: r.error });
      return { ok: false, mode: 'live', error: r.error, fallback: suggestMixes({ brief, cells, K: this.K, prefs }) };
    }
    this.log.push({ at: new Date().toISOString(), op: 'suggest', provider: 'rules' });
    return suggestMixes({ brief, cells, K: this.K, prefs });
  }
  async edit({ text, mix, brief }) {
    if (this.status.live) {
      const req = this.request({ brief, cells: [], mix, instruction: text });
      const r = await this._post('/edit', req);
      if (r.ok) { const v = validateEdit(r.body, req, mix); this.log.push({ at: new Date().toISOString(), op: 'edit', provider: 'live', valid: v.ok }); if (v.ok) return v.value; return { ok: false, mode: 'live', error: 'The model answer was refused by validation: ' + v.errors.join('; ') }; }
      return { ok: false, mode: 'live', error: r.error };
    }
    this.log.push({ at: new Date().toISOString(), op: 'edit', provider: 'rules' });
    return interpretEdit(text, mix, { K: this.K, months: brief && brief.objectives.flowering.on ? brief.objectives.flowering.months : undefined });
  }
  async _post(path, body) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), this.timeoutMs);
      const r = await fetch(this.endpoint + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }); clearTimeout(t);
      const j = await r.json().catch(() => null);
      if (!r.ok) return { ok: false, error: (j && j.error) || 'HTTP ' + r.status };
      return { ok: true, body: j };
    } catch (e) { return { ok: false, error: e.name === 'AbortError' ? `no answer within ${Math.round(this.timeoutMs / 1000)} s` : String(e.message || e) }; }
  }
}

// ---------------------------------------------------------------- validation shared by both providers
const BANNED_KEYS = ['x', 'y', 'z', 'coordinates', 'position', 'count', 'counts', 'score', 'metrics'];
function scanBanned(o, path = '', out = []) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (BANNED_KEYS.includes(k)) out.push(`${path}${k}`); scanBanned(v, `${path}${k}.`, out); } return out; }
export function validateSuggestion(body, req) {
  const errors = []; const plantIds = new Set(req.plants.map((p) => p.id)); const ev = new Set(req.plants.flatMap((p) => p.evidence));
  if (!body || !Array.isArray(body.recipes)) return { ok: false, errors: ['no recipes array'] };
  const banned = scanBanned(body.recipes); if (banned.length) errors.push('contains computed values the model must not give: ' + banned.slice(0, 4).join(', '));
  const recipes = [];
  body.recipes.forEach((r, i) => {
    if (!r || typeof r.name !== 'string' || !Array.isArray(r.members) || !r.members.length) { errors.push(`recipe ${i + 1}: name and members required`); return; }
    for (const m of r.members) { if (!plantIds.has(m.plantId)) errors.push(`recipe ${i + 1}: unknown plant id ${m.plantId}`); if (!ROLES[m.role]) errors.push(`recipe ${i + 1}: unknown role ${m.role}`); if (!(m.proportion > 0)) errors.push(`recipe ${i + 1}: proportion of ${m.plantId}`); }
    const s = r.members.reduce((a, m) => a + (m.proportion || 0), 0); if (Math.abs(s - 1) > 0.02) errors.push(`recipe ${i + 1}: proportions sum to ${s.toFixed(3)}`);
    for (const ra of r.rationale || []) for (const ref of ra.refs || []) if (!ev.has(ref)) errors.push(`recipe ${i + 1}: evidence id ${ref} was not supplied (invented reference)`);
    recipes.push({ key: 'live' + i, name: r.name.slice(0, 60), members: normalize(r.members.map((m) => ({ plantId: m.plantId, role: m.role, proportion: m.proportion, why: (m.why || []).filter((x) => ev.has(x)) }))), density: Math.max(0.5, Math.min(12, +r.density || 4.5)), rationale: (r.rationale || []).map((x) => ({ text: String(x.text || '').slice(0, 400), refs: x.refs || [] })), unknowns: (r.unknowns || []).map(String), gaps: (r.gaps || []).map(String), coverage: null });
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { schema: 'gp.mixSuggestion/1', ok: true, recipes, uncertainCandidates: [], knowledgeSuggestions: (body.knowledgeSuggestions || []).filter((k) => plantIds.has(k.plantId)) } };
}
export function validateEdit(body, req, mix) {
  const errors = []; const plantIds = new Set(req.plants.map((p) => p.id));
  if (!body || !Array.isArray(body.changes)) return { ok: false, errors: ['no changes array'] };
  for (const c of body.changes) { if (!['add', 'remove', 'setProportion', 'scaleRole', 'setRole', 'replace', 'setDensity'].includes(c.op)) errors.push('unknown op ' + c.op); for (const k of ['plantId', 'to']) if (c[k] && !plantIds.has(c[k])) errors.push('unknown plant ' + c[k]); if (c.role && !ROLES[c.role]) errors.push('unknown role ' + c.role); }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { ok: true, mode: 'live', changes: body.changes, matched: [String(body.explanation || '').slice(0, 300)] } };
}
