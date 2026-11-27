// Personal knowledge: what you added, revised, left out and restored — shown against the Preset it answers, with the
// effect on the knowledge in effect. Everything is reversible; the Preset is never written.
import * as A from '../analysis.js';
import { esc, sci, plantVisual, trim, fmtTime, fmtN, recMarks, download, DIA } from '../ui.js';
import { bindCommon } from './common.js';
import { exportWorkspace, importWorkspace } from '../store.js';

export function head(app) {
  return { title: 'Personal knowledge', count: app.mineCount() || '', countTitle: `changes in this browser · Preset ${app.kbBase.counts().active} → in effect ${app.kb.counts().active} records` };
}
export function contains(app, sel) { return !!sel; }

export function render(host, app) {
  const kb = app.kb; const S = kb.state; const d = kb.diff(); const base = app.kbBase;
  const { undone } = kb.liveEvents();
  const touched = new Map();
  const touch = (id, kind, item) => { if (!id) return; if (!touched.has(id)) touched.set(id, { added: false, notes: [], revised: [], excluded: [] }); const t = touched.get(id); if (kind === 'added') t.added = true; else t[kind].push(item); };
  for (const id of d.addedEntities) touch(id, 'added');
  for (const id of d.addedRecords) { const r = S.records.get(id); if (r?._eff.active) for (const s of r.subjects) touch(s, 'notes', r); }
  for (const x of d.revised) { const r = S.records.get(x.to); if (r?._eff.active) for (const s of r.subjects) touch(s, 'revised', { orig: S.records.get(x.from), mine: r }); }
  for (const x of d.excluded) { const r = S.records.get(x.id) || null; const rel = S.relations.get(x.id); if (r) for (const s of r.subjects) touch(s, 'excluded', { r, reason: x.reason }); else if (rel) touch(rel.from, 'excluded', { rel, reason: x.reason }); }
  let h = `<div class="pad">`;
  if (!kb.events.length) {
    h += `<div class="empty" style="padding-left:0">Nothing of yours yet. <button class="btn mine" data-act="add">${'Add knowledge'}</button></div>`;
  } else {
    h += `<h2 class="section-h">By plant</h2>`;
    for (const [id, t] of touched) {
      const e = S.entities.get(id); if (!e) continue;
      h += `<div class="stratum" style="grid-template-columns:220px minmax(0,1fr)" data-key="${esc(id)}"><div style="display:flex;gap:10px;align-items:flex-start;padding:12px 12px 10px 0"><div data-ent="${esc(id)}" style="cursor:pointer">${A.isPlant(e) ? plantVisual(e, 44) : ''}</div><div><b data-ent="${esc(id)}" style="cursor:pointer;font:600 13px var(--f-text)">${esc(e.commonName || '')}</b><span style="display:block">${A.isPlant(e) ? sci(e.name) : esc(e.name)}</span>${t.added ? `<span class="mk mk-mine">${DIA} added</span>` : ''}</div></div><div style="padding:10px 0">`;
      if (t.added && e.type === 'list') { const ds = S.datasets.get(e.datasetId); const n = [...S.records.values()].filter(r => r._eff.active && (r.objects || []).includes(id)).length; h += `<p style="margin:0 0 6px">${n} plant${n === 1 ? '' : 's'}${ds?.unmatched?.length ? ` · not linked: ${ds.unmatched.map(u => esc(u.raw || 'empty')).join(', ')}` : ''}</p>`; }
      else if (t.added && !t.notes.length && !t.revised.length) h += `<p class="dim" style="margin:0 0 6px">Name only — nothing known yet.</p>`;
      for (const r of t.notes) h += `<div class="ri is-mine" data-rec="${esc(r.id)}"><div class="ri-s" style="font-size:13px">${esc(trim(r.statement, 260))}</div><div class="ri-m"><span>${esc((r.knowledgeKind || 'note').replace('_', ' '))}</span>${r.context?.place ? `<span>${esc(kb.label(r.context.place))}</span>` : ''}<span>${esc(r.context?.scope === 'source' ? (kb.state.sources.get(r.sourceRefs?.[0]?.sourceId)?.name || '') : (r.context?.scope || ''))}</span>${recMarks(r)}</div></div>`;
      for (const x of t.revised) h += `<div class="vs" data-rec="${esc(x.mine.id)}" style="cursor:pointer"><div><h6>Preset · ${esc(srcName(kb, x.orig))}</h6><div class="orig" style="text-decoration:line-through;text-decoration-color:var(--ink-4)">${esc(trim(x.orig?.statement, 200))}</div></div><div><h6 style="color:var(--mine-ink)">${DIA} My version${x.mine.context?.place ? ' · ' + esc(kb.label(x.mine.context.place)) : ''}</h6><div class="mine">${esc(trim(x.mine.statement, 200))}</div></div></div>`;
      for (const x of t.excluded) h += x.r ? `<div class="ri is-off" data-rec="${esc(x.r.id)}"><div class="ri-s">${esc(trim(x.r.statement, 200))}</div><div class="ri-m"><span>${esc(srcName(kb, x.r))}</span><span class="mk mk-excl">left out</span>${x.reason ? `<span>“${esc(x.reason)}”</span>` : ''}</div></div>` : `<div class="ri is-off"><div class="ri-s">Relation ${esc(x.rel.predicate)} → ${esc(kb.label(x.rel.to))}</div><div class="ri-m"><span class="mk mk-excl">left out</span></div></div>`;
      h += `</div></div>`;
    }
    const unlinked = [...S.datasets.values()].filter(ds => ds.origin === 'user' && ds.unmatched?.length);
    h += `<h2 class="section-h">History</h2><div class="timeline">`;
    for (const e of kb.events.slice().reverse()) {
      const u = undone.has(e.id);
      h += `<div class="ev ${u ? 'undone' : ''}"><div class="when">${esc(fmtTime(e.at))}</div><div class="what"><b>${esc(describe(kb, e))}</b>${u ? ' <span class="dim">· undone</span>' : ''}</div>
        <div>${e.type === 'undo' ? '' : u ? `<button class="btn small" data-act="redo" data-id="${esc(e.id)}">Redo</button>` : `<button class="btn small" data-act="undo" data-id="${esc(e.id)}">Undo</button>`}</div></div>`;
    }
    h += `</div>`;
  }
  h += `<div class="iact" style="margin-top:28px;padding-top:14px;border-top:1px solid var(--rule)"><button class="btn" data-act="export">Export</button><label class="btn" style="cursor:pointer">Import<input type="file" accept=".json" data-imp hidden></label>${kb.events.length ? '<button class="btn quiet" data-act="clear">Clear…</button>' : ''}</div></div>`;
  host.innerHTML = h;
  bindCommon(host, app, {
    undo: b => app.commit({ type: 'undo', target: b.dataset.id }, 'Undone'),
    redo: b => { const u = kb.events.filter(x => x.type === 'undo' && x.target === b.dataset.id && !kb.liveEvents().undone.has(x.id)).pop(); if (u) app.commit({ type: 'undo', target: u.id }, 'Redone'); },
    export: async () => { const ws = await exportWorkspace(kb, app.store); download(`my-planting-knowledge-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(ws, null, 1)); app.toast(`Exported ${ws.events.length} changes`); },
    add: () => app.openAdd(),
    clear: async () => { if (!confirm('Remove all your changes from this browser? Export first if you want to keep them. The Preset is not affected.')) return; await app.store.clearAll(); kb.setEvents([]); kb.traces = []; app.render(); },
  });
  host.querySelector('[data-imp]')?.addEventListener('change', async ev => {
    const f = ev.target.files[0]; if (!f) return;
    try { const r = await importWorkspace(JSON.parse(await f.text()), kb, app.store, { mode: kb.events.length && !confirm('Replace your current layer with the file? (Cancel = merge both)') ? 'merge' : 'replace' }); app.render(); app.toast(`Imported ${r.events} changes${r.baseVersionMatches ? '' : ' (made on an earlier Preset ' + r.importedBase + ')'}`); }
    catch (err) { app.toast('Import failed: ' + err.message); }
  });
}
function srcName(kb, r) { const sid = r?.sourceRefs?.[0]?.sourceId; return sid ? (kb.state.sources.get(sid)?.name || sid).split(/[—(]/)[0].trim() : ''; }
export function describe(kb, e) {
  const L = id => kb.label(id);
  if (e.type === 'undo') { const t = kb.events.find(x => x.id === e.target); return 'Undo: ' + (t ? describe(kb, t) : e.target); }
  if (e.type === 'exclude') { const r = kb.state.records.get(e.target); return `Left out: ${r ? `${r.subjects.map(L).join(', ')} · ${kb.predicates[r.predicate]?.label || r.predicate} (${srcName(kb, r)})` : e.target}`; }
  if (e.type === 'include') { const r = kb.state.records.get(e.target); return `Restored: ${r ? `${r.subjects.map(L).join(', ')} · ${kb.predicates[r.predicate]?.label || r.predicate}` : e.target}`; }
  if (e.type === 'add_entity') return `Added ${e.entity.name} (provisional ${e.entity.type})`;
  if (e.type === 'add_record') return `${(e.record.knowledgeKind || 'Note').replace('_', ' ').replace(/^./, c => c.toUpperCase())}${e.record.subjects.length ? ' on ' + e.record.subjects.map(L).join(', ') : ''}: “${trim(e.record.statement, 90)}”`;
  if (e.type === 'revise_record') { const r = kb.state.records.get(e.target); return `My version of ${r ? `${r.subjects.map(L).join(', ')} · ${kb.predicates[r.predicate]?.label || r.predicate} (${srcName(kb, r)})` : e.target}`; }
  if (e.type === 'batch') return e.label || `${e.events.length} changes`;
  return e.label || e.type;
}
