// Add knowledge: turn what a designer gives (a name, a sentence, a table, a file) into events for the personal layer.
// Deterministic only. Nothing here guesses botany: unknown attributes stay absent, ambiguous names are not linked,
// free text is saved verbatim and marked "no extraction run" (no AI is connected in this phase).

import { normName, newId, slug, fold } from './kb.js';

const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export const NOTE_KINDS = {
  observation: 'Observation (I saw / measured this)',
  practice: 'Practice / experience (what works for me)',
  preference: 'Preference (what I like to use)',
  project_requirement: 'Project requirement (one project only)',
  note: 'Note / other knowledge',
};

/** Plant name → existing entity, ambiguity, or a provisional entity event. */
export function planAddPlant(kb, rawName) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name) return { status: 'empty' };
  const res = kb.resolveName(name);
  if (res.status === 'exact') return { status: 'exists', entity: res.matches[0] };
  if (res.status === 'ambiguous') return { status: 'ambiguous', matches: res.matches };
  const isCultivar = /['‘’"“”]/.test(name);
  const sci = /^[A-Z][a-z-]+ (x |× )?[a-z-]+/.test(name) ? name.replace(/\s*['‘’"“”].*$/, '') : null;
  const id = 'my:' + slug(name);
  if (kb.state.entities.has(id)) return { status: 'exists', entity: kb.state.entities.get(id) };
  return { status: 'new', event: { type: 'add_entity', label: `Added ${name}`, entity: { id, type: isCultivar ? 'cultivar' : 'plant', name, rawName: rawName, scientificName: sci,
    cultivar: isCultivar ? name.replace(/^[^'‘’"“”]*['‘’"“”]|['‘’"“”]$/g, '') : null, aliases: [], status: 'provisional', layer: 'personal',
    note: 'added by name only: no attributes are known until you or a source adds records' } } };
}

/** Find known plant / topic names inside a sentence (exact alias match on word boundaries; ambiguous names are reported, not linked). */
export function detectSubjects(kb, text) {
  const t = ' ' + normName(text).replace(/[^\p{L}\p{N}' ]+/gu, ' ') + ' ';
  const found = new Map(); const ambiguous = [];
  for (const [name, ids] of kb.state.names) {
    if (name.length < 4) continue;
    if (!t.includes(' ' + name + ' ')) continue;
    const ents = [...ids].map(id => kb.state.entities.get(id)).filter(e => e && ['plant', 'cultivar', 'topic', 'planting_system'].includes(e.type));
    if (ents.length === 1) found.set(ents[0].id, { entity: ents[0], matched: name });
    else if (ents.length > 1) ambiguous.push({ name, ids: ents.map(e => e.id) });
  }
  // keep the longest match when one name is inside another (e.g. a cultivar name containing its species)
  const list = [...found.values()];
  const keep = list.filter(a => !list.some(b => b !== a && b.matched.length > a.matched.length && b.matched.includes(a.matched) && b.entity.scientificName === a.entity.name));
  return { subjects: keep, ambiguous };
}

/** A free-text note → one record (verbatim). */
export function makeNote(kb, { text, subjectIds = [], kind = 'note', scope = 'personal', project = '', place = null, revisesId = null }) {
  const body = String(text || '').trim();
  if (!body) throw new Error('empty note');
  const id = newId('my-rec');
  const scopeText = scope === 'project' ? `project: ${project || 'unnamed project'}` : 'personal working knowledge';
  return {
    type: 'add_record', label: `${NOTE_KINDS[kind]?.split(' (')[0] || 'Note'}${subjectIds.length ? ' on ' + subjectIds.map(s => kb.label(s)).join(', ') : ''}`,
    record: { id, subjects: subjectIds, objects: [], predicate: kind, value: { kind: 'text', data: body }, statement: body,
      context: { text: scopeText + (place ? ' · ' + kb.label(place) : ''), place, time: [localDay()], conditions: [], cultivar: null, scope: scope === 'project' ? 'project:' + (project || 'unnamed') : 'personal' },
      concepts: [], sourceRefs: [{ sourceId: 'me', sourceType: 'personal', locator: 'typed in the Knowledge canvas ' + new Date().toISOString().slice(0, 16).replace('T', ' ') }],
      knowledgeKind: kind, evidenceStatus: 'personal', extraction: 'not_run', layer: 'personal', ...(revisesId ? { about: revisesId } : {}) },
  };
}

/** Your own version of an existing record. The original stays unchanged (superseded in the effective view, restorable).
 *  02A.1: a revision is YOUR statement. It starts from an empty context: it does not inherit the original's place, time, conditions,
 *  sources or knowledge kind. The original is linked as `respondsTo` (what you answered), never listed as a source of your words. */
export function makeRevision(kb, target, { statement, valueText, kind = 'observation', place = null, contextText = '', time = null, why = '', scope = 'personal', project = '' } = {}) {
  const r = kb.state.records.get(target);
  if (!r) throw new Error('no record ' + target);
  const id = newId('my-rev');
  const sameValue = valueText == null || valueText === kb.formatValue(r);
  const value = sameValue ? r.value : { kind: 'text', data: valueText, previous: r.value };
  const today = localDay();
  return { type: 'revise_record', target, label: `Revised ${kb.predicates[r.predicate]?.label || r.predicate} · ${r.subjects.map(x => kb.label(x)).join(', ')}`,
    record: { id, subjects: r.subjects.slice(), objects: (r.objects || []).slice(), edgePredicate: r.edgePredicate, predicate: r.predicate, value,
      statement: (statement ?? '').trim() || r.statement, concepts: sameValue ? (r.concepts || []).slice() : [],
      context: { text: contextText || (scope === 'project' ? 'project: ' + (project || 'unnamed project') : 'my practice'), place: place || null, time: time || [today], conditions: [], cultivar: null,
        scope: scope === 'project' ? 'project:' + (project || 'unnamed') : 'personal' },
      sourceRefs: [{ sourceId: 'me', sourceType: 'personal', locator: 'my revision of ' + target + (why ? ' — ' + why : '') }],
      respondsTo: target, knowledgeKind: kind, evidenceStatus: 'personal', extraction: 'not_run', layer: 'personal', why: why || '' } };
}

// ---------- tables ----------
export function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const clean = rows.filter(r => r.some(x => x.trim() !== ''));
  if (!clean.length) throw new Error('empty table');
  const columns = clean[0].map((h, i) => h.trim() || `column_${i + 1}`);
  return { columns, rows: clean.slice(1).map(r => columns.map((_, i) => (r[i] ?? '').trim())) };
}

export function parseJSONTable(text) {
  const d = JSON.parse(text);
  const arr = Array.isArray(d) ? d : Array.isArray(d?.rows) ? d.rows : Array.isArray(d?.data) ? d.data : null;
  if (!arr || !arr.length || typeof arr[0] !== 'object') throw new Error('JSON must be an array of objects (or {rows:[…]})');
  const columns = [...new Set(arr.flatMap(o => Object.keys(o)))];
  return { columns, rows: arr.map(o => columns.map(c => o[c] == null ? '' : typeof o[c] === 'object' ? JSON.stringify(o[c]) : String(o[c]))) };
}

export function guessNameColumn(columns) {
  const pri = [/scientific|species|taxon|botanical|latin/i, /plant|name/i];
  for (const re of pri) { const c = columns.find(x => re.test(x)); if (c) return c; }
  return columns[0];
}

const isNum = x => x !== '' && x != null && !isNaN(Number(String(x).replace(/[,\s]/g, '').replace(/\*$/, '')));

/** Preview + events for a table import. mode 'list' → one listed_in record per (plant, list) with every source row kept;
 *  'observations' → one has_observation record per matched row (values kept as typed).
 *  02A.1: rows whose name cannot be linked (ambiguous, empty) produce NO knowledge record — they stay in the dataset and in `unmatched`. */
export function planTableImport(kb, { fileName, columns, rows, nameColumn, mode = 'list', title, sourceName, sourceUrl, place = null, note = '', key: fixedKey = null }) {
  const key = fixedKey || slug(title || fileName || 'table') + '-' + Date.now().toString(36);
  const dsId = 'my-ds:' + key; const srcId = 'my-src:' + key; const listId = 'my-list:' + key;
  const ni = columns.indexOf(nameColumn);
  if (ni < 0) throw new Error('choose the column that holds plant names');
  const name = title || fileName;
  const events = []; const preview = []; const newByName = new Map(); const unmatched = [];
  events.push({ type: 'add_source', source: { id: srcId, name: sourceName || name, type: 'user dataset', url: sourceUrl || null, fileName, licence: 'as stated by you on import', layer: 'personal', note } });
  const ds = { id: dsId, title: name, sourceId: srcId, columns, rows, fileName, mode, origin: 'user', unmatched };
  events.push({ type: 'add_dataset', dataset: ds });
  events.push({ type: 'add_entity', entity: { id: mode === 'list' ? listId : dsId, type: mode === 'list' ? 'list' : 'dataset', name, aliases: [], status: 'provisional', layer: 'personal',
    note: mode === 'list' ? 'a named list: membership only — not co-occurrence, compatibility or tested adaptation' : 'a table of observations as imported; values kept as typed', datasetId: dsId } });
  const numericCols = columns.filter((c, i) => i !== ni && rows.some(r => isNum(r[i])) && rows.every(r => r[i] === '' || isNum(r[i])));
  const members = new Map();          // entityId → { rows: [i], raws: [name as typed], quals: [] }
  rows.forEach((r, i) => {
    const raw = (r[ni] || '').trim();
    if (!raw) { preview.push({ row: i, raw, status: 'empty' }); unmatched.push({ row: i, raw, why: 'empty' }); return; }
    const clean = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();       // "Ageratina altissima (woodland edge)" → name + kept qualifier
    const res = kb.resolveName(clean); let entityId = null; let status;
    if (res.status === 'exact') { entityId = res.matches[0].id; status = 'matched'; }
    else if (res.status === 'ambiguous') { status = 'ambiguous'; }
    else {
      const k = normName(clean);
      if (newByName.has(k)) { entityId = newByName.get(k); status = 'new (same name as an earlier row)'; }
      else {
        const p = planAddPlant(kb, clean);
        if (p.status === 'new') { entityId = p.event.entity.id; let n = 2; while (events.some(e => e.entity?.id === entityId)) entityId = p.event.entity.id + '-' + n++;
          events.push({ ...p.event, entity: { ...p.event.entity, id: entityId, note: `added from ${name}, row ${i + 1}; no attributes known` } }); newByName.set(k, entityId); status = 'new (provisional)'; }
        else if (p.status === 'exists') { entityId = p.entity.id; status = 'matched'; }
      }
    }
    preview.push({ row: i, raw, entityId, status, candidates: res.status === 'ambiguous' ? res.matches.map(m => m.id) : [] });
    if (!entityId) { unmatched.push({ row: i, raw, why: status, candidates: res.matches?.map(m => m.id) || [] }); return; }
    const rowObj = Object.fromEntries(columns.map((c, j) => [c, r[j]]));
    const qual = raw !== clean ? raw.slice(clean.length).trim() : '';
    if (mode === 'list') {
      if (!members.has(entityId)) members.set(entityId, { rows: [], raws: [], quals: [], rowObjs: [] });
      const m = members.get(entityId); m.rows.push(i); m.raws.push(raw); if (qual) m.quals.push(qual); m.rowObjs.push(rowObj);
      if (m.rows.length > 1) preview[preview.length - 1].status += ' · same plant as row ' + (m.rows[0] + 1);
    } else {
      const vals = Object.fromEntries(numericCols.map(c => [c, Number(String(rowObj[c]).replace(/[,\s]/g, '').replace(/\*$/, ''))]));
      const flagged = Object.fromEntries(numericCols.filter(c => /\*$/.test(rowObj[c])).map(c => [c, rowObj[c]]));
      events.push({ type: 'add_record', record: { subjects: [entityId], concepts: [], datasetId: dsId, datasetRows: [i], raw: rowObj,
        sourceRefs: [{ sourceId: srcId, sourceType: 'user dataset', locator: `${fileName || title} · row ${i + 2} (after header)`, datasetId: dsId, rows: [i] }],
        evidenceStatus: 'imported', layer: 'personal', id: `my-rec:${key}:${i}`, objects: [dsId], predicate: 'has_observation', value: { kind: 'table_row', data: rowObj, numeric: vals, flagged },
        statement: `${raw}: ${numericCols.map(c => `${c} = ${rowObj[c]}`).join('; ')} (${name}).`, context: { text: note || 'values as in the imported table', place, time: [], conditions: [], cultivar: null, scope: 'source' }, knowledgeKind: 'observation' } });
    }
  });
  for (const [entityId, m] of members) {
    events.push({ type: 'add_record', record: { id: `my-rec:${key}:${m.rows[0]}`, subjects: [entityId], objects: [listId], predicate: 'listed_in', concepts: [], datasetId: dsId, datasetRows: m.rows,
      raw: m.rowObjs.length === 1 ? m.rowObjs[0] : { rows: m.rowObjs }, value: { kind: 'membership', data: { list: name, qualifier: m.quals.join('; ') || null, rowsInList: m.rows.length } },
      statement: `${m.raws[0]} is listed in “${name}”${m.rows.length > 1 ? ` (${m.rows.length} rows: ${m.raws.join(' · ')})` : ''}.`,
      sourceRefs: [{ sourceId: srcId, sourceType: 'user dataset', locator: `${fileName || title} · row${m.rows.length > 1 ? 's' : ''} ${m.rows.map(x => x + 2).join(', ')} (after header)`, datasetId: dsId, rows: m.rows }],
      context: { text: note || 'list membership as imported', place, time: [], conditions: [], cultivar: null, scope: 'source' }, knowledgeKind: 'list_membership', evidenceStatus: 'imported', layer: 'personal' } });
  }
  return { events: [{ type: 'batch', label: `Imported ${name} (${rows.length} rows${unmatched.length ? `, ${unmatched.length} not linked` : ''})`, events }], preview, numericCols, datasetId: dsId,
    listId: mode === 'list' ? listId : null, unmatched, members: members.size };
}

/** A file we cannot parse here (PDF, image, docx…): stored in this browser, searchable by name, marked not extracted. */
export function planFile(kb, file, { subjectIds = [], note = '' } = {}) {
  const fid = newId('my-file');
  return { fileId: fid, event: { type: 'batch', label: `Attached ${file.name}`, events: [
    { type: 'add_file', file: { id: fid, name: file.name, type: file.type, size: file.size } },
    { type: 'add_record', record: { id: newId('my-rec'), subjects: subjectIds, objects: [], predicate: 'note', value: { kind: 'file', data: { fileId: fid, name: file.name, size: file.size } },
      statement: `Document “${file.name}” attached${note ? ': ' + note : ''}. Saved in this browser; its contents have not been extracted.`, context: { text: 'attached document', place: null, time: [], conditions: [], cultivar: null, scope: 'personal' },
      concepts: [], sourceRefs: [{ sourceId: 'me', sourceType: 'personal', locator: 'file ' + file.name }], knowledgeKind: 'document', evidenceStatus: 'personal', extraction: 'not_run', layer: 'personal' } }] } };
}

export { fold };
