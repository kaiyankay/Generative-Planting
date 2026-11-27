// Data & access (kept off the designer's main surface): the retrieval call a future LLM tool would make, with traces and
// before/after comparison; sources and licences; what the Preset was built from.
import { esc, trim, fmtTime, icon } from './ui.js';
import { PLACE_NOTE } from './kb.js';

export class MoreDialog {
  constructor(dlg, app) { this.d = dlg; this.app = app; this.tab = 'llm'; }
  open(tab = this.tab) {
    this.tab = tab;
    this.d.innerHTML = `<div class="dhead"><h3>Data &amp; access</h3>
      <div class="dtabs">${[['llm', 'LLM access'], ['sources', 'Sources & licences'], ['about', 'About this data']].map(([k, l]) => `<button data-t="${k}" aria-pressed="${k === this.tab}">${l}</button>`).join('')}</div>
      <button class="iconbtn x" data-x aria-label="Close">${icon('close', 16)}</button></div><div class="dbody" id="mBody"></div>`;
    this.d.querySelector('[data-x]').onclick = () => this.d.close();
    this.d.querySelectorAll('[data-t]').forEach(b => b.onclick = () => this.open(b.dataset.t));
    if (!this.d.open) this.d.showModal();
    ({ llm: () => this.llm(), sources: () => this.sources(), about: () => this.about() })[this.tab]();
  }

  llm() {
    const A_ = this.app; const kb = A_.kb; const host = this.d.querySelector('#mBody');
    const places = [...kb.state.entities.values()].filter(e => e.facet === 'place');
    const last = this._rq || { query: 'Yarrow water irrigation Vancouver', place: 'place:vancouver' };
    host.innerHTML = `<p style="margin:0 0 12px;color:var(--ink-2)">What an LLM tool would receive from the knowledge in effect: records, sources, place match, flags. No model is connected. <span class="dim">window.GPK · tools/knowledge/kq.py</span></p>
      <div class="form" style="grid-template-columns:2fr 1fr auto;display:grid;align-items:end;gap:14px"><label>Query<input id="rqQ" value="${esc(last.query)}"></label>
        <label>Project place<select id="rqP"><option value="">none</option>${places.map(p => `<option value="${esc(p.id)}" ${p.id === last.place ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <button class="btn primary" id="rqGo">Run</button></div>
      <div style="margin-top:10px;font-size:12px" class="dim">Compare with <select id="rqCmp" style="border:0;border-bottom:1px solid var(--rule-2)"><option value="">—</option>${kb.traces.slice().reverse().map(t => `<option value="${esc(t.id)}">${esc(fmtTime(t.at))} · “${esc(trim(t.query, 28))}” · ${t.returnedRecordIds.length} ids</option>`).join('')}</select></div>
      <div id="rqOut"></div>`;
    const run = () => {
      this._rq = { query: host.querySelector('#rqQ').value, place: host.querySelector('#rqP').value };
      const out = kb.searchKnowledge({ query: this._rq.query, projectContext: this._rq.place ? { place: this._rq.place } : null, limit: 15 });
      const tr = kb.traces.find(t => t.id === out.traceId); if (tr) { tr.snapshot = out.results.map(r => ({ id: r.recordId, v: r.valueText, s: r.statement })); A_.store.saveTrace(tr); }
      this.show(out);
    };
    host.querySelector('#rqGo').onclick = run; host.querySelector('#rqQ').onkeydown = e => { if (e.key === 'Enter') run(); };
    host.querySelector('#rqCmp').onchange = () => this._last && this.show(this._last);
  }
  show(out) {
    this._last = out; const kb = this.app.kb; const host = this.d.querySelector('#mBody');
    const cmp = kb.traces.find(t => t.id === host.querySelector('#rqCmp').value);
    const prev = new Set(cmp?.returnedRecordIds || []); const now = new Set(out.returnedRecordIds);
    let h = `<p class="mono dim" style="margin:14px 0 6px">revision ${esc(out.activeRevision)} · trace ${esc(out.traceId)} · ${out.results.length} records</p>`;
    if (cmp) { const add = out.returnedRecordIds.filter(i => !prev.has(i)); const gone = [...prev].filter(i => !now.has(i));
      h += `<p class="note ${add.length || gone.length ? 'mine' : ''}">Compared with ${esc(fmtTime(cmp.at))} (revision ${esc(cmp.activeRevision)}): +${add.length} new · −${gone.length} no longer returned${cmp.query !== out.query ? ' · the earlier query text was different' : ''}</p>`
        + gone.map(id => { const r = kb.state.records.get(id); return `<div class="ri is-off"><div class="ri-s">${esc(trim(r?.statement || id, 160))}</div><div class="ri-m"><span>${esc(r && !r._eff.active ? r._eff.why : 'not returned')}</span></div></div>`; }).join(''); }
    h += `<table class="tbl"><thead><tr><th>Score</th><th>Record</th><th>Source</th><th>Place match</th><th>Flags</th></tr></thead><tbody>${out.results.map(r => `<tr class="${cmp && !prev.has(r.recordId) ? 'hl' : ''}"><td class="num">${r.score}</td><td><b style="font-weight:600">${esc(r.subjects.map(s => s.name).join(', ') || 'general')}</b> — ${esc(trim(r.statement, 140))}<br><span class="mono dim">${esc(r.recordId)}</span></td><td>${esc(trim(r.sourceRefs.map(s => s.sourceName).join('; '), 40))}</td><td>${r.placeMatch ? `${esc(r.placeMatch)}<br><span class="dim" style="font-size:10.5px">${esc(PLACE_NOTE[r.placeMatch] || '')}</span>` : '—'}</td><td style="font-size:11px">${r.flags.map(esc).join('<br>')}</td></tr>`).join('')}</tbody></table>`;
    if (out.missing.length) h += `<p class="dim">Known but empty: ${out.missing.map(m => esc(m.name)).join(', ')} — attributes unknown.</p>`;
    h += `<details class="details"><summary>Raw JSON returned (first 3 results)</summary><pre>${esc(JSON.stringify({ ...out, results: out.results.slice(0, 3) }, null, 1))}</pre></details>`;
    host.querySelector('#rqOut').innerHTML = h;
  }

  sources() {
    const kb = this.app.kb; const host = this.d.querySelector('#mBody');
    const used = new Map(); for (const r of kb.state.records.values()) { const s = r.sourceRefs?.[0]?.sourceId; if (s) used.set(s, (used.get(s) || 0) + 1); }
    const list = [...kb.state.sources.values()].filter(s => !s.id.startsWith('survey-r') && used.get(s.id)).sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0));
    host.innerHTML = `<table class="tbl"><thead><tr><th>Source</th><th>Records</th><th>Region</th><th>Licence / terms</th></tr></thead><tbody>${list.map(s => `<tr><td>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}<br><span class="dim">${esc(s.type || '')}</span></td><td class="num">${used.get(s.id)}</td><td>${esc((s.geo_specificity || '').replace(/_/g, ' '))}</td><td style="font-size:11.5px">${esc(trim(s.licence || s.use || '—', 220))}</td></tr>`).join('')}</tbody></table>
      <p class="note">Not for publication until confirmed: the digitised Robertson 1929 table (no licence file) and the verbatim Metro Vancouver quotes.</p>`;
  }

  about() {
    const A_ = this.app; const kb = A_.kb; const m = kb.seed.meta; const host = this.d.querySelector('#mBody');
    const c = kb.counts(); const b = A_.kbBase.counts();
    host.innerHTML = `<dl class="facts" style="grid-template-columns:200px 1fr"><dt>Preset version</dt><dd class="mono">${esc(kb.baseVersion)}</dd><dt>Built from</dt><dd>planting-db <span class="mono">${esc(m.plantingDb.sha.slice(0, 7))}</span> (claims, relations, ontology, survey candidates, knowledge-graph rules) · Detroit spatial model (species and recipes, read only) · Robertson 1929 subset · Metro Vancouver water pages</dd>
      <dt>Revision in effect</dt><dd class="mono">${esc(kb.activeRevision)}</dd><dt>Records</dt><dd>${b.records} in the Preset (${b.active} in effect) · ${c.active} in effect now</dd><dt>Your layer</dt><dd>${kb.events.length} changes in this browser (IndexedDB ${A_.store.available ? 'available' : 'unavailable — session only'})</dd>
      <dt>Built by</dt><dd class="mono">${esc(m.builtBy)}</dd></dl>
      <p style="color:var(--ink-2);margin-top:14px">The Preset is read-only. Edits are events in your layer: add, revise (your version supersedes the original in effect), leave out, restore, undo. Graph, profiles, compare, seasons, recipes and retrieval are all computed from the same effective state. Documentation: <span class="mono">docs/knowledge/</span>.</p>`;
  }
}
