// Knowledge base core: Base snapshot + personal event log → one effective state.
// No DOM. The Graph, Matrix, Table, Inspector, search and the LLM query API all read from KB.state.
//
//   const kb = new KB(seed, speciesMap); kb.setEvents(events); kb.state.records ...
//
// Events (the personal layer, append-only; nothing in the Base is ever written):
//   add_entity {entity}            new plant/topic; provisional; unknown attributes stay absent
//   add_record {record}            note, observation, preference, imported row, list membership …
//   revise_record {target, record} user copy of a record; the original stays in history (superseded in the effective view)
//   exclude {target, reason}       record or relation left out of the effective view (history keeps it)
//   include {target}               cancels an exclude
//   add_dataset {dataset} · add_source {source} · add_file {file}
//   undo {target}                  reverts an earlier event (an undo can itself be undone)

export const PERSONAL_SOURCE = { id: 'me', name: 'My knowledge (this browser)', type: 'personal', origin: 'user', layer: 'personal',
  licence: 'yours; stays in this browser unless you export it' };

export const PLACE_NOTE = { same: 'same place as the project', within: 'recorded inside the project region', broader: 'recorded for a larger region that contains the project place',
  elsewhere: 'recorded elsewhere — do not transfer without checking', unknown: 'place not stated' };
const SINGLE_VALUED = new Set(['water_drainage', 'growth_rate', 'form', 'habit', 'maintenance_level', 'texture', 'invasive_status']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------- small utilities (mirrored in tools/knowledge/kq.py — keep in step) ----------
export function fold(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
export function tokens(s) {
  const out = [];
  const t = fold(s);
  for (const m of t.matchAll(/[a-z0-9]+|[㐀-鿿]/g)) {
    let w = m[0];
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
    if (w.length > 1 || /[㐀-鿿0-9]/.test(w)) out.push(w);
  }
  return out;
}
export function normName(s) {
  return fold(s).replace(/[‘’'"“”`]/g, "'").replace(/\s+/g, ' ').replace(/\s*'\s*/g, "'").trim();
}
function hash(str) {          // FNV-1a, 32 bit, hex
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export function newId(prefix) {
  const r = (globalThis.crypto?.getRandomValues ? Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 10));
  return `${prefix}-${Date.now().toString(36)}-${r}`;
}
export function slug(s) { return fold(s).replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

// ---------- provenance: who produced a record's value, separately from where it was published ----------
// Mirrored in tools/knowledge/kq.py (provenance) — keep in step.
//   cls: personal · model-inference (a language model, no source) · source (a published source)
//   extractedBy: 'language model' (planting-db T5 assisted extraction) · 'script' (structured data converted by a tool) · 'person' · null
//   humanChecked: evidenceStatus === 'verified'
export function provenance(r, sources) {
  if (r.origin === 'user') return { cls: 'personal', extractedBy: 'person', humanChecked: false };
  const src = sources.get(r.sourceRefs?.[0]?.sourceId);
  if (src?.type === 'model') return { cls: 'model-inference', extractedBy: 'language model', humanChecked: false, sourceType: 'model' };
  const rb = String(r.legacy?.fields?.recorded_by || '');
  const extractedBy = /^claude/i.test(rb) ? 'language model' : /\.py\b|export/i.test(rb) ? 'script' : rb ? 'person' : null;
  return { cls: 'source', sourceType: src?.type || null, extractedBy, humanChecked: r.evidenceStatus === 'verified' };
}

// ---------- the knowledge base ----------
export class KB {
  constructor(seed, speciesMap = null) {
    this.seed = seed;
    this.speciesMap = speciesMap;
    this.baseVersion = seed.meta.baseVersion;
    this.copy = seed.meta.copy || 'full';              // 'public' = published copy without the licence-restricted rows and quotes
    this.predicates = seed.predicates;
    this.sourcesBase = new Map(seed.sources.map(s => [s.id, s]));
    this.aiChecks = seed.aiChecks || {};
    this.events = [];
    this.traces = [];
    this.listeners = new Set();
    this.rebuild();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  setEvents(events) { this.events = events.slice(); this.rebuild(); this.emit({ type: 'reset' }); }
  emit(info) { for (const fn of this.listeners) fn(info); }

  /** Append an event (already validated by the caller) and recompute the effective state. */
  apply(ev) {
    const e = { id: ev.id || newId('ev'), at: ev.at || new Date().toISOString(), ...ev };
    this.validate(e);
    this.events.push(e);
    this.rebuild();
    this.emit({ type: 'event', event: e });
    return e;
  }

  validate(e) {
    const T = ['add_entity', 'add_record', 'revise_record', 'exclude', 'include', 'add_dataset', 'add_source', 'add_file', 'undo', 'batch'];
    if (!T.includes(e.type)) throw new Error('unknown event type ' + e.type);
    const st = this.state;
    if (e.type === 'add_entity') {
      if (!e.entity?.id || !e.entity.name) throw new Error('entity needs id and name');
      if (st.entities.has(e.entity.id)) throw new Error('entity id exists: ' + e.entity.id);
    }
    if (e.type === 'add_record' || e.type === 'revise_record') {
      const r = e.record;
      if (!r?.id || !Array.isArray(r.subjects)) throw new Error('record needs id and subjects[]');
      if (st.records.has(r.id)) throw new Error('record id exists: ' + r.id);
      for (const s of [...r.subjects, ...(r.objects || [])]) if (!st.entities.has(s)) throw new Error('unknown entity ' + s);
      if (e.type === 'revise_record' && !st.records.has(e.target)) throw new Error('nothing to revise: ' + e.target);
    }
    if ((e.type === 'exclude' || e.type === 'include') && !st.records.has(e.target) && !st.relations.has(e.target)) throw new Error('unknown target ' + e.target);
    if (e.type === 'undo' && !this.events.some(x => x.id === e.target)) throw new Error('unknown event ' + e.target);
    if (e.type === 'batch') {
      if (!Array.isArray(e.events) || !e.events.length) throw new Error('empty batch');
      const ids = new Set();
      for (const c of e.events) {
        if (c.type === 'batch' || c.type === 'undo') throw new Error('nested batch/undo');
        const nid = c.entity ? 'e:' + c.entity.id : c.record ? 'r:' + c.record.id : c.dataset ? 'd:' + c.dataset.id : c.source ? 's:' + c.source.id : null;
        if (nid && (ids.has(nid) || (c.entity && st.entities.has(c.entity.id)) || (c.record && st.records.has(c.record.id)))) throw new Error('duplicate id in batch ' + nid);
        if (nid) ids.add(nid);
        for (const s of [...(c.record?.subjects || []), ...(c.record?.objects || [])]) if (!st.entities.has(s) && !ids.has('e:' + s)) throw new Error('unknown entity ' + s);
      }
    }
  }

  liveEvents() {
    const undone = new Set();
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.type === 'undo' && !undone.has(e.id)) undone.add(e.target);
    }
    return { live: this.events.filter(e => e.type !== 'undo' && !undone.has(e.id)), undone };
  }

  rebuild() {
    const { live, undone } = this.liveEvents();
    const S = {
      entities: new Map(), records: new Map(), relations: new Map(), datasets: new Map(), sources: new Map(this.sourcesBase),
      excluded: new Map(), supersededBy: new Map(), files: new Map(), undone,
    };
    S.sources.set('me', PERSONAL_SOURCE);
    for (const e of this.seed.entities) S.entities.set(e.id, e);
    for (const r of this.seed.records) S.records.set(r.id, { ...r });        // own copies: the seed objects are never written
    for (const r of this.seed.relations) S.relations.set(r.id, { ...r });
    for (const d of this.seed.datasets) S.datasets.set(d.id, d);
    this.state = S;
    const flat = [];
    for (const e of live) {
      if (e.type === 'batch') e.events.forEach((c, i) => flat.push({ ...c, id: `${e.id}#${i}`, at: e.at, batchId: e.id, label: e.label }));
      else flat.push(e);
    }
    for (const e of flat) {
      const tag = { eventId: e.batchId || e.id, at: e.at };
      switch (e.type) {
        case 'add_entity': if (!S.entities.has(e.entity.id)) S.entities.set(e.entity.id, { ...e.entity, origin: 'user', ...tag }); break;
        case 'add_source': S.sources.set(e.source.id, { ...e.source, origin: 'user', ...tag }); break;
        case 'add_dataset': S.datasets.set(e.dataset.id, { ...e.dataset, origin: 'user', ...tag }); break;
        case 'add_file': S.files.set(e.file.id, { ...e.file, ...tag }); break;
        case 'add_record': if (!S.records.has(e.record.id)) S.records.set(e.record.id, { active: true, ...e.record, origin: 'user', ...tag }); break;
        case 'revise_record':
          if (!S.records.has(e.record.id)) {
            S.records.set(e.record.id, { active: true, ...e.record, origin: 'user', revises: e.target, ...tag });
            S.supersededBy.set(e.target, e.record.id);
          }
          break;
        case 'exclude': S.excluded.set(e.target, { reason: e.reason || '', ...tag }); break;
        case 'include': S.excluded.delete(e.target); break;
      }
    }
    // effective status of every record
    for (const r of S.records.values()) r._eff = this.recordState(r, S);
    for (const rel of S.relations.values()) rel._eff = this.relationState(rel, S);
    S.placeParent = new Map();
    for (const rel of S.relations.values()) if (rel.predicate === 'narrower_than' && rel.from.startsWith('place:') && rel.to.startsWith('place:')) S.placeParent.set(rel.from, rel.to);
    this.activeRevision = `${this.baseVersion}+${live.length}e:${hash(this.events.map(e => e.id).join('|'))}`;
    this.project(S);
    this.index(S);
  }

  recordState(r, S) {
    if (S.excluded.has(r.id)) return { active: false, why: 'excluded', ...S.excluded.get(r.id) };
    if (S.supersededBy.has(r.id)) return { active: false, why: 'revised', by: S.supersededBy.get(r.id) };
    if (r.active === false) return { active: false, why: r.evidenceStatus === 'retired' ? 'retired in source' : 'inactive' };
    return { active: true };
  }

  relationState(rel, S) {
    if (S.excluded.has(rel.id)) return { active: false, why: 'excluded' };
    const sup = rel.supportingRecordIds || [];
    if (!sup.length) return { active: true };
    const liveSup = sup.filter(id => S.records.get(id)?._eff?.active);
    return liveSup.length ? { active: true, liveSupport: liveSup } : { active: false, why: 'support withdrawn (all supporting records inactive)' };
  }

  relFor(rec, conceptId) {
    const v = this.seed.edgeVocabulary;
    if (v.fieldRel[rec.predicate]) return v.fieldRel[rec.predicate];
    const c = this.state.entities.get(conceptId);
    return (c && v.catRel[c.category]) || 'has_trait';
  }

  // ---------- graph projection ----------
  project(S) {
    const edges = new Map();
    S.recNodes = new Map();
    const add = (from, to, predicate, info) => {
      if (!S.entities.has(from) || !(S.entities.has(to) || S.recNodes.has(to)) || from === to) return;
      const key = `${from}|${predicate}|${to}`;
      let e = edges.get(key);
      if (!e) { e = { id: key, from, to, predicate, recordIds: [], relationIds: [], formation: info.formation || 'documented', origins: new Set(), statuses: new Set() }; edges.set(key, e); }
      if (info.recordId) e.recordIds.push(info.recordId);
      if (info.relationId) e.relationIds.push(info.relationId);
      if (info.origin) e.origins.add(info.origin);
      if (info.status) e.statuses.add(info.status);
      if (info.formation === 'documented') e.formation = 'documented';
    };
    for (const r of S.records.values()) {
      if (!r._eff.active) continue;
      const info = { recordId: r.id, origin: r.origin, status: r.evidenceStatus, formation: r.formation || 'documented' };
      const bare = !(r.concepts || []).length && !(r.objects || []).length;
      if (bare && r.origin === 'user' && r.subjects.length) {        // your notes become visible record nodes on their subjects
        const nid = 'rn:' + r.id;
        S.recNodes.set(nid, { id: nid, type: 'record', recordId: r.id, name: (r.statement || '').slice(0, 60) + ((r.statement || '').length > 60 ? '…' : ''), origin: 'user', status: r.knowledgeKind });
        for (const s of r.subjects) add(s, nid, r.predicate, info);
        continue;
      }
      for (const s of r.subjects) {
        for (const c of r.concepts || []) add(s, c, this.relFor(r, c), info);
        for (const o of r.objects || []) add(s, o, r.edgePredicate || r.predicate, info);
      }
    }
    for (const rel of S.relations.values()) {
      if (!rel._eff.active) continue;
      add(rel.from, rel.to, rel.predicate, { relationId: rel.id, origin: rel.origin, formation: rel.formation, status: rel.formation });
    }
    const adj = new Map();
    for (const e of edges.values()) {
      e.userTouched = e.origins.has('user');
      for (const n of [e.from, e.to]) { if (!adj.has(n)) adj.set(n, []); adj.get(n).push(e); }
    }
    S.edges = edges; S.adj = adj;
  }

  // ---------- search index (records + entities) ----------
  docText(r, S) {
    // canonical search text — mirrored exactly in tools/knowledge/kq.py (doc_text); keep both in step
    const parts = [r.statement, r.quote, r.context?.text, this.predicates[r.predicate]?.label || r.predicate, r.knowledgeKind];
    for (const id of [...r.subjects, ...(r.objects || []), ...(r.concepts || [])]) {
      const e = S.entities.get(id); if (e) parts.push(e.name, ...(e.aliases || []));
    }
    if (r.context?.place) parts.push(S.entities.get(r.context.place)?.name || r.context.place);
    flatten(r.value, x => parts.push(typeof x === 'string' && S.entities.has(x) ? S.entities.get(x).name : String(x)));
    for (const sr of r.sourceRefs || []) parts.push(S.sources.get(sr.sourceId)?.name || sr.sourceId);
    if (r.raw) flatten(r.raw, x => parts.push(String(x)));
    return parts.filter(x => x != null && x !== '').join(' ');
  }

  index(S) {
    const post = new Map(); const docs = [];
    const addDoc = (key, text) => {
      const tf = new Set(tokens(text));
      docs.push({ key, n: tf.size });
      for (const t of tf) { if (!post.has(t)) post.set(t, []); post.get(t).push(key); }
    };
    for (const r of S.records.values()) addDoc('r:' + r.id, this.docText(r, S));
    S.index = { post, N: docs.length };
    const names = new Map();
    const put = (k, id) => { k = normName(k); if (!k) return; if (!names.has(k)) names.set(k, new Set()); names.get(k).add(id); };
    for (const e of S.entities.values()) {
      if (e.type === 'concept' && e.level !== 'concept') continue;
      put(e.name, e.id); for (const a of e.aliases || []) put(a, e.id);
      if (e.scientificName && e.type !== 'cultivar') put(e.scientificName, e.id);
    }
    S.names = names;
  }

  // ---------- places: one hierarchy (planting-db narrower_than + the 02A.1 additions) ----------
  placeChain(p, S = this.state) { const out = []; let x = p; while (x && out.length < 12) { out.push(x); x = S.placeParent.get(x); } return out; }
  /** How a record's place relates to a project place. same · within (narrower, inside the project area) · broader (a region containing it) · elsewhere · unknown */
  placeRelation(recordPlace, projectPlace, S = this.state) {
    if (!recordPlace) return 'unknown';
    if (recordPlace === projectPlace) return 'same';
    if (this.placeChain(recordPlace, S).includes(projectPlace)) return 'within';
    if (this.placeChain(projectPlace, S).includes(recordPlace)) return 'broader';
    return 'elsewhere';
  }

  // ---------- formatting ----------
  label(id) { return this.state.entities.get(id)?.name || id; }

  formatValue(r, S = this.state) {
    const v = r.value; if (!v) return '';
    const d = v.data;
    const lab = x => (typeof x === 'string' && S.entities.has(x)) ? S.entities.get(x).name : (typeof x === 'string' ? x.replace(/^[a-z_]+:/, '').replace(/_/g, ' ') : String(x));
    if (d == null) return 'unknown';
    if (typeof d === 'string') return lab(d);
    if (typeof d === 'number' || typeof d === 'boolean') return String(d) + (v.unit ? ' ' + v.unit : '');
    if (Array.isArray(d)) return d.map(lab).join(', ');
    if (typeof d === 'object') {
      if ('min' in d || 'max' in d) return `${d.min ?? '?'}–${d.max ?? '?'} ${d.unit || ''}`.trim();
      if ('median' in d) return `median ${d.median} ${d.unit || ''}`.trim();
      if ('listed_visitor_taxa' in d) return `${d.listed_visitor_taxa} visitor taxa listed`;
      if (d.flowering_months) return 'flowers ' + monthRange(d.flowering_months) + (d.flower_colour ? ' · ' + [].concat(d.flower_colour).join('/') : '');
      if ('drawingRole' in d) return `drawn as ${d.drawingRole} (legend ${d.legendCode}); ecological role ${d.ecologicalRole || 'unknown'}`;
      if ('direction' in d) return d.direction;
      return Object.entries(d).filter(([, x]) => x != null && x !== '').slice(0, 4).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(x) ? x.join(', ') : typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ');
    }
    return String(d);
  }

  // ---------- queries used by the views ----------
  recordsOf(entityId, { includeHistory = false } = {}) {
    const out = [];
    for (const r of this.state.records.values()) {
      if (!includeHistory && !r._eff.active) continue;
      if (r.subjects.includes(entityId) || (r.objects || []).includes(entityId) || (r.concepts || []).includes(entityId) || r.context?.place === entityId) out.push(r);
    }
    return out;
  }

  counts() {
    const S = this.state; let active = 0, user = 0, excluded = 0, revised = 0, plants = 0, userEntities = 0;
    for (const r of S.records.values()) { if (r._eff.active) active++; if (r.origin === 'user') user++; }
    for (const id of S.excluded.keys()) if (S.records.has(id) || S.relations.has(id)) excluded++;
    revised = S.supersededBy.size;
    for (const e of S.entities.values()) { if (e.type === 'plant' && e.status !== 'candidate') plants++; if (e.origin === 'user') userEntities++; }
    const seedSet = [...S.entities.values()].filter(e => e.seedSet === 'planting-db-10' || (e.origin === 'user' && e.type === 'plant')).length;
    let activeEdges = 0; for (const e of S.edges.values()) activeEdges++;
    return { entities: S.entities.size, plants, seedSetPlusMine: seedSet, records: S.records.size, active, user, userEntities, excluded, revised, edges: activeEdges,
      events: this.events.length, activeRevision: this.activeRevision };
  }

  /** Diff of the effective state against the Base: what the personal layer changed. */
  diff() {
    const S = this.state; const out = { addedEntities: [], addedRecords: [], revised: [], excluded: [], relationsLost: [], files: [...S.files.values()] };
    for (const e of S.entities.values()) if (e.origin === 'user') out.addedEntities.push(e.id);
    for (const r of S.records.values()) { if (r.origin === 'user' && !r.revises) out.addedRecords.push(r.id); if (r.revises) out.revised.push({ from: r.revises, to: r.id }); }
    for (const [id, x] of S.excluded) out.excluded.push({ id, reason: x.reason });
    for (const rel of S.relations.values()) if (!rel._eff.active && rel._eff.why?.startsWith('support')) out.relationsLost.push(rel.id);
    return out;
  }

  /** Matrix cell: every active record about (entity, predicate), with an honest state. */
  cell(entityId, predicate) {
    const recs = this.recordsOf(entityId).filter(r => r.predicate === predicate && r.subjects.includes(entityId)).sort((a, b) => (b.origin === 'user') - (a.origin === 'user'));
    const hist = this.recordsOf(entityId, { includeHistory: true }).filter(r => r.predicate === predicate && r.subjects.includes(entityId) && !r._eff.active);
    if (!recs.length) return { state: 'none', records: [], history: hist };
    const statuses = new Set(recs.map(r => r.evidenceStatus));
    const values = [...new Set(recs.map(r => this.formatValue(r)))];
    let state = statuses.has('verified') ? 'verified' : statuses.has('documented') ? 'documented' : 'unverified';
    if (SINGLE_VALUED.has(predicate)) {
      const sets = new Set(recs.map(r => JSON.stringify([].concat(r.value?.data ?? null).sort())));
      if (sets.size > 1) state = 'conflict';
    }
    if (predicate === 'mature_height' || predicate === 'mature_spread') {
      const iv = recs.map(r => r.value?.data).filter(d => d && typeof d === 'object' && 'max' in d && d.unit === 'm');
      if (iv.length > 1 && Math.max(...iv.map(d => d.min ?? 0)) > Math.min(...iv.map(d => d.max))) state = 'conflict';
    }
    const mine = recs.filter(r => r.origin === 'user');
    const preset = recs.filter(r => r.origin !== 'user');
    if (!preset.length) state = 'mine';                   // only your knowledge: never summarised as a source state
    else { const ps = new Set(preset.map(r => r.evidenceStatus)); if (state !== 'conflict') state = ps.has('verified') ? 'verified' : ps.has('documented') ? 'documented' : 'unverified'; }
    return { state, user: mine.length > 0, mine: mine.map(r => ({ id: r.id, revises: r.revises || null, kind: r.knowledgeKind })), records: recs, history: hist, values };
  }

  // ---------- name resolution (Add plant, CSV import, resolveSpecies) ----------
  resolveName(name) {
    const k = normName(name);
    if (!k) return { status: 'empty', matches: [] };
    const hits = [...(this.state.names.get(k) || [])].map(id => this.state.entities.get(id)).filter(Boolean);
    const plants = hits.filter(e => ['plant', 'cultivar'].includes(e.type));
    const use = plants.length ? plants : hits;
    if (use.length === 1) return { status: 'exact', matches: use };
    if (use.length > 1) return { status: 'ambiguous', matches: use };
    return { status: 'none', matches: [] };
  }

  // ======================================================================
  // LLM-facing query API (docs/knowledge/RETRIEVAL_API.md). Structured data only; no summaries are generated.
  // ======================================================================
  getEntity(id) {
    const e = this.state.entities.get(id); if (!e) return null;
    const recs = this.recordsOf(id, { includeHistory: true });
    return { entity: strip(e), activeRecordIds: recs.filter(r => r._eff.active).map(r => r.id), historyRecordIds: recs.filter(r => !r._eff.active).map(r => r.id),
      edges: (this.state.adj.get(id) || []).map(edgeOut), activeRevision: this.activeRevision };
  }

  searchEntities(query, { limit = 20, types = null } = {}) {
    const q = normName(query); if (!q) return [];
    const out = [];
    for (const e of this.state.entities.values()) {
      if (types && !types.includes(e.type)) continue;
      if (e.type === 'concept' && e.level !== 'concept') continue;
      const names = [e.name, e.scientificName, ...(e.aliases || [])].filter(Boolean).map(normName);
      let score = 0;
      for (const n of names) score = Math.max(score, n === q ? 3 : n.startsWith(q) ? 2 : n.includes(q) ? 1 : 0);
      if (score) out.push({ id: e.id, name: e.name, type: e.type, status: e.status, origin: e.origin, score });
    }
    const pri = { plant: 0, cultivar: 1, topic: 2, planting_system: 2, dataset: 3, role: 4, concept: 5 };
    return out.sort((a, b) => b.score - a.score || (pri[a.type] ?? 9) - (pri[b.type] ?? 9) || a.name.localeCompare(b.name)).slice(0, limit);
  }

  getRecords({ subjectIds = null, predicate = null, place = null, includeHistory = false } = {}) {
    const out = [];
    for (const r of this.state.records.values()) {
      if (!includeHistory && !r._eff.active) continue;
      if (subjectIds && !r.subjects.some(s => subjectIds.includes(s))) continue;
      if (predicate && r.predicate !== predicate) continue;
      if (place && r.context?.place !== place) continue;
      out.push(this.recordOut(r));
    }
    return { activeRevision: this.activeRevision, records: out };
  }

  recordOut(r) {
    const S = this.state;
    const o = {
      recordId: r.id, subjects: r.subjects.map(id => ({ id, name: this.label(id) })), objects: (r.objects || []).map(id => ({ id, name: this.label(id) })),
      predicate: r.predicate, value: r.value ?? null, valueText: this.formatValue(r), statement: r.statement, quote: r.quote,
      context: r.context, concepts: r.concepts || [], sourceRefs: (r.sourceRefs || []).map(s => ({ ...s, sourceName: S.sources.get(s.sourceId)?.name || s.sourceId })),
      origin: r.origin, knowledgeKind: r.knowledgeKind, evidenceStatus: r.evidenceStatus, verificationScope: r.verificationScope ?? null,
      state: r._eff, revises: r.revises || null, supersededBy: S.supersededBy.get(r.id) || null,
    };
    const flags = [];
    if (r.origin === 'user') flags.push('personal knowledge (designer-provided; not externally verified)');
    if (['selection_reason', 'practitioner_note', 'preference', 'practice'].includes(r.knowledgeKind)) flags.push('experience or preference — use as a lead, not as a measured trait');
    if (r.extraction === 'not_run') flags.push('free text; no extraction was run');
    if (r.extraction?.method === 'claude') flags.push('structured by a language model from the designer\'s words; every field confirmed by the designer');
    const pv = provenance(r, S.sources); o.provenance = pv;
    if (pv.cls === 'model-inference') flags.push('language-model inference with no external source — not evidence');
    else if (pv.extractedBy === 'language model' && !pv.humanChecked) flags.push('values read from the source by a language model; not checked by a person');
    else if (r.evidenceStatus === 'unverified') flags.push('not checked by a person against the source');
    if (r.taxonMatch && !r.taxonMatch.checked) flags.push('historical plant name matched by spelling only; taxonomy not checked — a research lead, not established evidence');
    if (this.aiChecks[r.id]) o.aiSourceCheck = { ...this.aiChecks[r.id], note: 'an AI read the cited source; this is not human verification' };
    o.flags = flags;
    return o;
  }

  /** Keyword + alias retrieval over the effective records; returns record ids, values, sources, context and missing data. */
  searchKnowledge({ query, projectContext = null, limit = 20, includeHistory = false, subjectIds = null, record = true } = {}) {
    const S = this.state; const qt = [...new Set(tokens(query))].sort();
    const scores = new Map();
    for (const t of qt) {
      const p = S.index.post.get(t); if (!p) continue;
      const idf = Math.log(1 + S.index.N / p.length);
      for (const key of p) scores.set(key, (scores.get(key) || 0) + idf);
    }
    // entity names in the query widen the match to that entity's records (alias route, like tools/retrieve.py)
    const named = new Set();
    for (const [name, ids] of S.names) if (name.length > 3 && fold(query).includes(name)) for (const id of ids) named.add(id);
    let hits = [];
    for (const [key, sc] of scores) {
      const r = S.records.get(key.slice(2)); if (!r) continue;
      if (!includeHistory && !r._eff.active) continue;
      if (subjectIds && !r.subjects.some(s => subjectIds.includes(s))) continue;
      const bonus = r.subjects.some(s => named.has(s)) ? 2 : 0;
      hits.push({ r, score: Math.round((sc + bonus) * 1e6) / 1e6 });
    }
    hits.sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? -1 : 1));
    hits = hits.slice(0, limit);
    const place = projectContext?.place || null;
    const results = hits.map(({ r, score }) => {
      const o = this.recordOut(r); o.score = score;
      if (place) { o.placeMatch = this.placeRelation(r.context?.place, place); o.placeNote = PLACE_NOTE[o.placeMatch]; }
      return o;
    });
    const missing = [];
    for (const id of named) {
      const e = S.entities.get(id);
      if (e && ['plant', 'cultivar'].includes(e.type) && !this.recordsOf(id).length) missing.push({ entityId: id, name: e.name, note: 'entity known but no active records: attributes unknown' });
    }
    const out = { query, projectContext, activeRevision: this.activeRevision, at: new Date().toISOString(), returnedRecordIds: results.map(x => x.recordId), results, missing,
      method: 'keyword + alias index over effective records (no embeddings, no LLM)' };
    if (record) { const t = { id: newId('trace'), query, projectContext, limit, activeRevision: this.activeRevision, at: out.at, returnedRecordIds: out.returnedRecordIds };
      this.traces.push(t); out.traceId = t.id; this.emit({ type: 'trace', trace: t }); }
    return out;
  }

  getDataset(id) { const d = this.state.datasets.get(id); return d ? { ...d } : null; }

  getEvidence(recordIds) {
    const S = this.state;
    return recordIds.map(id => S.records.get(id)).filter(Boolean).map(r => ({ ...this.recordOut(r), sources: (r.sourceRefs || []).map(s => S.sources.get(s.sourceId)).filter(Boolean),
      legacyRef: r.legacyRef || null, ...this.rowsOf(r) }));
  }

  rowsOf(r) {                                          // dataset rows behind a record, or why they are not in this copy
    const ds = r.datasetRows ? this.state.datasets.get(r.datasetId) : null;
    if (!ds) return { datasetRows: null };
    if (!ds.rows.length && ds.rowsLocalOnly) return { datasetRows: null, datasetRowsNote: ds.restricted };
    return { datasetRows: r.datasetRows.slice(0, 200).map(i => ds.rows[i]) };
  }

  getNeighborhood({ entityId, depth = 1, limit = 80, includeConcepts = true } = {}) {
    const S = this.state; const seen = new Set([entityId]); let frontier = [entityId]; const edges = new Map();
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const n of frontier) for (const e of S.adj.get(n) || []) {
        const o = e.from === n ? e.to : e.from;
        const oe = S.entities.get(o);
        if (!includeConcepts && oe?.type === 'concept') continue;
        if (seen.size >= limit && !seen.has(o)) continue;
        edges.set(e.id, e);
        if (!seen.has(o)) { seen.add(o); next.push(o); }
      }
      frontier = next;
    }
    return { activeRevision: this.activeRevision, nodes: [...seen].map(id => strip(S.entities.get(id) || S.recNodes.get(id))), edges: [...edges.values()].map(edgeOut) };
  }

  resolveSpecies({ canonicalKey = null, scientificName = null, cultivar = null } = {}) {
    const key = canonicalKey || (cultivar ? `${scientificName} '${cultivar}'` : scientificName);
    const sm = this.speciesMap?.species?.filter(r => r.canonicalKey === key) || [];
    const res = this.resolveName(key);
    const entity = res.status === 'exact' ? res.matches[0] : null;
    let cultivarOf = null;
    if (entity?.type === 'cultivar' || cultivar) {
      const base = this.resolveName(scientificName || (key || '').replace(/\s*'.*$/, ''));
      if (base.status === 'exact' && base.matches[0].id !== entity?.id) cultivarOf = base.matches[0].id;
    }
    return { query: key, status: res.status, entityId: entity?.id || null, candidates: res.status === 'ambiguous' ? res.matches.map(m => m.id) : [], cultivarOf,
      spatialIds: sm.map(r => r.spatialId), note: 'cultivars and placeholders are never merged with a species; cultivarOf is an identity link only' };
  }
}

export function flatten(v, push) {      // string/number leaves in key order; booleans and nulls skipped
  if (v == null || typeof v === 'boolean') return;
  if (typeof v === 'string' || typeof v === 'number') { push(v); return; }
  if (Array.isArray(v)) { for (const x of v) flatten(x, push); return; }
  if (typeof v === 'object') for (const k of Object.keys(v)) flatten(v[k], push);
}

function strip(e) { if (!e) return e; const { legacy, ...rest } = e; return rest; }
function edgeOut(e) { return { id: e.id, from: e.from, to: e.to, predicate: e.predicate, formation: e.formation, recordIds: e.recordIds, relationIds: e.relationIds, origins: [...e.origins], userTouched: e.userTouched }; }

export function monthRange(ms) {
  if (!ms?.length) return 'months unknown';
  const s = [...new Set(ms)].sort((a, b) => a - b);
  return s.length === 1 ? MONTHS[s[0] - 1] : `${MONTHS[s[0] - 1]}–${MONTHS[s[s.length - 1] - 1]}`;
}
export { MONTHS };
