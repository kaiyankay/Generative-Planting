// Plant Library for design: the Detroit species of the spatial model joined to Planting Intelligence knowledge.
//
//   spatial species id (sp.*)  →  knowledge entity (species_map.json: matched / cultivar / same_taxon / placeholder …)
//   + site attributes with their source (data/<site>/design-library.json: hydrology zone printed on the meadow lists)
//   + the effective knowledge state (Base snapshot + the designer's personal events in IndexedDB 'gp-knowledge',
//     shared with the Knowledge workspace on the same site)
//
// Applicability: a record is used by a design rule only if its place relates to the project place in an accepted way
// (default: same place, a place inside it, or a region containing it). Records from elsewhere (Vancouver, UK, St. Louis)
// are listed but never applied automatically; the designer can apply one here explicitly, which is itself stored as a
// personal 'applies_in' record with its scope. Missing knowledge stays Unknown. Cultivars are never treated as synonyms
// of their species: species-level records are shown for a cultivar but not applied to it.
const SHADE = new Set(['exposure:part_sun_part_shade', 'exposure:part_shade', 'exposure:filtered_shade', 'exposure:shade', 'exposure:deep_shade']);
const EXPO_LABEL = { 'exposure:full_sun': 'full sun', 'exposure:sun': 'sun', 'exposure:part_sun_part_shade': 'part sun / part shade', 'exposure:part_shade': 'part shade', 'exposure:filtered_shade': 'filtered shade', 'exposure:shade': 'shade', 'exposure:deep_shade': 'deep shade', 'exposure:sheltered': 'sheltered' };
export const EXPOSURE_OPTIONS = ['exposure:full_sun', 'exposure:part_sun_part_shade', 'exposure:part_shade', 'exposure:shade'].map((id) => ({ id, label: EXPO_LABEL[id] }));
export const HYDRO = { dry: 'Upland (dry)', moist: 'Facultative wet (moist)', wet: 'Obligate wet' };
export const ACCEPT_LABEL = { same: 'recorded for Detroit', within: 'recorded inside Detroit', broader: 'recorded for a region containing Detroit (e.g. North America)', elsewhere: 'recorded elsewhere', unknown: 'place not stated' };

export class PlantLibrary {
  constructor(store, site = {}) {
    this.s = store; this.site = site; this.place = site.place || 'place:detroit';
    this.policy = { accept: new Set(['same', 'within', 'broader']) };
    this.kb = null; this.kstore = null; this.map = new Map(); this.rev = 0; this.listeners = new Set(); this.status = 'not loaded'; this._idx = null;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _changed(info) { this.rev++; this._idx = null; for (const fn of this.listeners) fn(info); }
  setAccept(list) { this.policy.accept = new Set(list.filter((x) => ['same', 'within', 'broader', 'elsewhere', 'unknown'].includes(x))); this._changed({ type: 'policy' }); return [...this.policy.accept]; }

  // ---- knowledge (lazy): seed + species map + personal events
  async loadKnowledge({ base = 'knowledge/', db } = {}) {
    if (this.kb) return { ok: true };
    this.status = 'loading';
    try {
      const [{ KB }, { Store }, seed, smap] = await Promise.all([
        import('../../knowledge/src/kb.js'), import('../../knowledge/src/store.js'),
        fetch(base + 'data/seed.json').then((r) => { if (!r.ok) throw new Error('seed ' + r.status); return r.json(); }),
        fetch(base + 'data/species_map.json').then((r) => (r.ok ? r.json() : { species: [] })),
      ]);
      for (const m of smap.species || []) this.map.set(m.spatialId, m);
      this.kb = new KB(seed, smap);
      this.kstore = await new Store(db || 'gp-knowledge').init();
      const events = await this.kstore.loadEvents().catch(() => []);
      if (events.length) this.kb.setEvents(events);
      this.kb.onChange(() => this._changed({ type: 'knowledge' }));
      this.status = 'loaded';
      this._changed({ type: 'loaded' });
      return { ok: true, records: this.kb.state.records.size, personalEvents: this.kb.events.length, revision: this.kb.activeRevision };
    } catch (e) { this.status = 'unavailable: ' + (e.message || e); return { ok: false, error: this.status }; }
  }
  get revision() { return `${this.rev}|${this.kb ? this.kb.activeRevision : 'nokb'}|${[...this.policy.accept].sort().join(',')}`; }

  entityOf(spId) { const m = this.map.get(spId); return m ? m.entityId : null; }
  mapping(spId) { return this.map.get(spId) || null; }
  _index() {
    if (this._idx) return this._idx;
    const by = new Map(); const appliesHere = new Map();
    if (this.kb) for (const r of this.kb.state.records.values()) {
      if (!r._eff || !r._eff.active) continue;
      for (const s of r.subjects || []) { let a = by.get(s); if (!a) by.set(s, (a = [])); a.push(r); }
      if (r.predicate === 'applies_in' && r.value && r.value.data && r.value.data.recordId && this.kb.placeRelation(r.value.data.place, this.place) === 'same') appliesHere.set(r.value.data.recordId, r.id);
    }
    return (this._idx = { by, appliesHere });
  }
  recordsOf(spId) { const e = this.entityOf(spId); return e ? (this._index().by.get(e) || []) : []; }
  // how a record relates to the project place, and whether a design rule may use it
  applicability(r) {
    const rel = this.kb ? this.kb.placeRelation(r.context && r.context.place, this.place) : 'unknown';
    const via = this._index().appliesHere.get(r.id) || null;
    return { rel, applies: this.policy.accept.has(rel) || !!via, via, label: ACCEPT_LABEL[rel] };
  }
  _split(recs) { const applied = [], notApplied = []; for (const r of recs) { const a = this.applicability(r); (a.applies ? applied : notApplied).push({ r, a }); } return { applied, notApplied }; }
  _speciesLevel(spId, pred) { // records of the species a cultivar belongs to: shown, never applied to the cultivar
    const m = this.mapping(spId); if (!m || m.status !== 'cultivar' || !m.cultivarOf || !this.kb) return [];
    return (this._index().by.get(m.cultivarOf) || []).filter(pred);
  }

  exposure(spId) {
    const isExpo = (r) => r.predicate === 'exposure' && (r.concepts || []).some((c) => c.startsWith('exposure:'));
    const { applied, notApplied } = this._split(this.recordsOf(spId).filter(isExpo));
    const vals = new Set(); for (const { r } of applied) for (const c of r.concepts || []) if (c.startsWith('exposure:')) vals.add(c);
    const status = !this.kb ? 'knowledge not loaded' : applied.length ? 'known' : notApplied.length ? 'not applicable here' : 'unknown';
    return { status, values: [...vals], labels: [...vals].map((v) => EXPO_LABEL[v] || v), shade: applied.length ? [...vals].some((v) => SHADE.has(v)) : null, applied, notApplied, speciesLevel: this._speciesLevel(spId, isExpo) };
  }
  shadeOK(spId) { const e = this.exposure(spId); return e.shade; }
  bloom(spId) {
    const isB = (r) => r.value && r.value.data && Array.isArray(r.value.data.flowering_months) && r.value.data.flowering_months.length;
    const { applied, notApplied } = this._split(this.recordsOf(spId).filter(isB));
    const months = new Set(); for (const { r } of applied) for (const m of r.value.data.flowering_months) months.add(m);
    return { status: !this.kb ? 'knowledge not loaded' : applied.length ? 'known' : notApplied.length ? 'not applicable here' : 'unknown', months: [...months].sort((a, b) => a - b), applied, notApplied, speciesLevel: this._speciesLevel(spId, isB) };
  }
  hydrology(spId) {
    // personal override (a record with value.data.hydrology that applies here) wins over the printed list
    const mine = this.recordsOf(spId).filter((r) => r.predicate === 'water_drainage' && r.value && r.value.data && r.value.data.hydrology).filter((r) => this.applicability(r).applies).sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
    if (mine) { const v = [].concat(mine.value.data.hydrology).filter((x) => HYDRO[x]); return { status: 'personal', range: v, class: v.length === 1 ? v[0] : null, recordId: mine.id, statement: mine.statement, place: mine.context && mine.context.place }; }
    const d = (this.site.library && this.site.library.species && this.site.library.species[spId]) || null;
    if (d && d.hydrology) return { status: 'source', range: d.hydrology.range, class: d.hydrology.class, printed: d.hydrology.printedByList, sourceRef: d.hydrology.sourceRef, note: d.hydrology.note || null };
    return { status: 'unknown', range: null, class: null };
  }
  height(spId) {
    const sp = this.s.getObject(spId);
    const recs = this.recordsOf(spId).filter((r) => r.predicate === 'mature_height' && r.value && r.value.data && r.value.data.max != null);
    const { applied } = this._split(recs);
    if (applied.length) { const r = applied[0].r; return { status: 'known', min: r.value.data.min ?? null, max: r.value.data.max, unit: r.value.data.unit || 'm', recordId: r.id }; }
    return { status: 'display only', value: sp ? sp.nominalHeightM : null, note: 'nominal height used to draw the 3D form (inferred, not a knowledge record)' };
  }
  roles(spId) { return this.recordsOf(spId).filter((r) => r.predicate === 'fills_role').map((r) => ({ recordId: r.id, legendCode: r.value.data.legendCode, role: r.value.data.drawingRole, statement: r.statement })); }
  pollinators(spId) { const r = this.recordsOf(spId).find((q) => q.predicate === 'has_observation' && q.value && q.value.data && q.value.data.listed_visitor_taxa != null); return r ? { taxa: r.value.data.listed_visitor_taxa, recordId: r.id, lead: true, note: 'historical record matched by name only (a research lead)' } : null; }
  profile(spId) {
    const sp = this.s.getObject(spId); if (!sp) return null; const m = this.mapping(spId);
    return { id: spId, name: sp.scientificName, cultivar: sp.cultivar, canonicalKey: sp.canonicalKey, plantType: sp.plantType, entityId: m ? m.entityId : null, mapStatus: m ? m.status : this.kb ? 'not mapped' : 'knowledge not loaded',
      hydrology: this.hydrology(spId), exposure: this.exposure(spId), bloom: this.bloom(spId), height: this.height(spId), roles: this.roles(spId), pollinators: this.pollinators(spId), records: this.recordsOf(spId).length };
  }
  // the knowledge one record needs for a design judgement, in plain words
  describe(r) { return { id: r.id, statement: r.statement, place: r.context && r.context.place, placeName: this.kb ? this.kb.label((r.context && r.context.place) || '') : null, source: (r.sourceRefs && r.sourceRefs[0] && r.sourceRefs[0].sourceId) || null, origin: r.origin, ...this.applicability(r) }; }

  // ---- writing personal knowledge (same event log as the Knowledge workspace)
  async _commit(ev) {
    if (!this.kb) throw new Error('knowledge is not loaded');
    const e = this.kb.apply(ev); if (this.kstore) await this.kstore.appendEvent(e).catch(() => {});
    return e;
  }
  async addRecord({ spId, kind, value, place = this.place, note = '' }) {
    if (!this.kb) return { ok: false, error: 'knowledge is not loaded' };
    const ent = this.entityOf(spId); if (!ent || !this.kb.state.entities.has(ent)) return { ok: false, error: 'no knowledge entity for ' + spId };
    const { newId } = await import('../../knowledge/src/kb.js');
    const sp = this.s.getObject(spId); const name = sp.canonicalKey; const day = new Date().toISOString().slice(0, 10);
    const placeName = this.kb.label(place || '') || 'no place';
    let rec;
    const ctx = { text: (note ? note + ' · ' : '') + 'scope: ' + placeName, place: place || null, time: [day], conditions: [], cultivar: null, scope: 'personal' };
    const base = { id: newId('my-rec'), subjects: [ent], objects: [], context: ctx, sourceRefs: [{ sourceId: 'me', sourceType: 'personal', locator: 'added in the Design workspace ' + new Date().toISOString().slice(0, 16).replace('T', ' ') }], knowledgeKind: 'observation', evidenceStatus: 'personal', extraction: 'not_run', layer: 'personal' };
    if (kind === 'exposure') { const vals = [].concat(value).filter((v) => EXPO_LABEL[v]); if (!vals.length) return { ok: false, error: 'exposure values required' }; rec = { ...base, predicate: 'exposure', value: { kind: 'categorical', data: vals, value_label: vals.map((v) => EXPO_LABEL[v]) }, concepts: vals, statement: `${name} — exposure: ${vals.map((v) => EXPO_LABEL[v]).join(', ')} (${placeName}; my observation${note ? ': ' + note : ''}).` }; }
    else if (kind === 'bloom') { const ms = [...new Set([].concat(value).map(Number).filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b); if (!ms.length) return { ok: false, error: 'months 1–12 required' }; rec = { ...base, predicate: 'seasonal_interest', value: { kind: 'quantitative', data: { flowering_months: ms } }, concepts: [], statement: `${name} — flowering months ${ms.join(', ')} (${placeName}; my observation${note ? ': ' + note : ''}).` }; }
    else if (kind === 'hydrology') { const v = [].concat(value).filter((x) => HYDRO[x]); if (!v.length) return { ok: false, error: 'hydrology dry | moist | wet' }; rec = { ...base, predicate: 'water_drainage', value: { kind: 'categorical', data: { hydrology: v } }, concepts: v.map((x) => 'water:' + x), statement: `${name} — hydrology: ${v.map((x) => HYDRO[x]).join(' to ')} (${placeName}; my judgement${note ? ': ' + note : ''}).` }; }
    else if (kind === 'note') { if (!String(value || '').trim()) return { ok: false, error: 'empty note' }; rec = { ...base, predicate: 'practitioner_note', value: { kind: 'text', data: String(value).trim() }, concepts: [], statement: String(value).trim() }; }
    else return { ok: false, error: 'kind must be exposure | bloom | hydrology | note' };
    const e = await this._commit({ type: 'add_record', label: `Design workspace: ${kind} of ${name}`, record: rec });
    return { ok: true, recordId: rec.id, eventId: e.id, revision: this.kb.activeRevision };
  }
  // explicitly widen the scope of one record to the project place (the designer's judgement, stored with its scope)
  async applyHere(recordId, why = '') {
    if (!this.kb) return { ok: false, error: 'knowledge is not loaded' };
    const r = this.kb.state.records.get(recordId); if (!r) return { ok: false, error: 'no record ' + recordId };
    const { newId } = await import('../../knowledge/src/kb.js');
    const rec = { id: newId('my-rec'), subjects: r.subjects.slice(), objects: [], predicate: 'applies_in', value: { kind: 'scope', data: { recordId, place: this.place } },
      statement: `I apply record ${recordId} (${this.kb.label(r.context?.place || '') || 'no place'}) to ${this.kb.label(this.place)}${why ? ': ' + why : ''}.`,
      context: { text: 'scope decision in the Design workspace', place: this.place, time: [new Date().toISOString().slice(0, 10)], conditions: [], cultivar: null, scope: 'personal' }, concepts: [],
      sourceRefs: [{ sourceId: 'me', sourceType: 'personal', locator: 'scope decision, Design workspace' }], respondsTo: recordId, knowledgeKind: 'practice', evidenceStatus: 'personal', extraction: 'not_run', layer: 'personal' };
    const e = await this._commit({ type: 'add_record', label: 'Design workspace: apply ' + recordId + ' in Detroit', record: rec });
    return { ok: true, recordId: rec.id, eventId: e.id };
  }
  async exclude(recordId, reason = '') { if (!this.kb) return { ok: false, error: 'knowledge is not loaded' }; const e = await this._commit({ type: 'exclude', target: recordId, reason, label: 'Left out ' + recordId }); return { ok: true, eventId: e.id }; }
  async undo(eventId) { if (!this.kb) return { ok: false }; const e = await this._commit({ type: 'undo', target: eventId, label: 'Undo ' + eventId }); return { ok: true, eventId: e.id }; }
  personalEvents() { return this.kb ? this.kb.events.slice() : []; }
}
