// Ask Knowledge — opens on demand in the right column and shares the Add composer's text box.
// Retrieval runs here, on the knowledge in effect (the same index as window.GPK; no model). Claude is reached only through the
// local knowledge server (tools/knowledge/server.py) with the browser's own events and revision; without the server, the SDK,
// credentials or the designer's authorisation the page says "not connected" and shows no answer. Nothing here imitates a reply.
import { esc, sci, trim, recItem, icon } from './ui.js';
import * as A from './analysis.js';

export const LLM = {
  _st: null, _at: 0,
  /** What the local server reports: SDK, credentials, authorisation. { server:false } when the page is served without it. */
  async status(force = false) {
    if (!force && this._st && Date.now() - this._at < 20000) return this._st;
    let st = { server: false, connected: false };
    try {
      const r = await fetch('/api/llm/status', { cache: 'no-store' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) { const j = await r.json(); if (j && Array.isArray(j.checks)) st = { ...j, server: true }; }
    } catch { /* no server: stays "not connected" */ }
    this._st = st; this._at = Date.now(); return st;
  },
  async post(path, body) {
    try {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let j = null; try { j = await r.json(); } catch { /* not JSON */ }
      return { status: r.status, body: j };
    } catch (e) { return { status: 0, body: { error: 'the knowledge server did not answer (' + e.message + ')' } }; }
  },
};

const MODEL_NAME = m => /sonnet-5-5/.test(m || '') ? 'Claude Sonnet 5.5' : (m || 'Claude');

/** What the server needs to rebuild exactly the knowledge on screen. Preset = the untouched base, no events. */
export function knowledgeContext(app) {
  const kb = app.kbv();
  return { layer: app.layer, activeRevision: kb.activeRevision, events: app.layer === 'preset' ? [] : app.kb.events };
}

export function selectionLabel(app, s) {
  if (!s) return '';
  const kb = app.kbv();
  if (s.kind === 'record') return trim(kb.state.records.get(s.id)?.statement || s.id, 48);
  if (s.kind === 'entity' || s.kind === 'source') return kb.label(s.id);
  if (s.kind === 'me') return 'My knowledge';
  if (s.kind === 'cell') return `${kb.label(s.ent || '')} · ${s.col || ''}`.replace(/^ · /, '');
  return s.label || s.key || s.kind;
}

/** Turn an answer into HTML. [[record:ID]] becomes a numbered citation, [[entity:ID|name]] a link; ids the knowledge does not hold
 *  are shown as such, never linked. Pure: the browser tests feed it a parser fixture (not model output). */
export function renderAnswer(text, kb) {
  const cites = [];
  const inline = s => esc(s).replace(/\[\[(record|entity):([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (m, t, id, label) => {
    id = id.trim();
    if (t === 'record') {
      let n = cites.indexOf(id); if (n < 0) { cites.push(id); n = cites.length - 1; }
      return kb.state.records.has(id) ? `<a class="cite" href="#" data-rec="${id}" title="${esc(trim(kb.state.records.get(id).statement, 120))}">${n + 1}</a>` : `<span class="cite bad" title="${id} is not in this knowledge version">?</span>`;
    }
    const e = kb.state.entities.get(id);
    return e ? `<a class="eref" href="#" data-ent="${id}">${label || (A.isPlant(e) ? sci(e.name) : esc(e.name))}</a>` : `${label || id}<span class="cite bad" title="not in this knowledge version">?</span>`;
  }).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const out = []; let list = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const li = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (!line) continue;
    const h = line.match(/^#{1,4}\s+(.*)$/);
    out.push(h ? `<h5>${inline(h[1])}</h5>` : `<p>${inline(line)}</p>`);
  }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return { html: out.join(''), cites };
}

export function connectionHTML(st) {
  const what = `<details class="sent"><summary>What is sent to Anthropic</summary><p>Your question, the layer, the knowledge revision and the selected object's name. Claude then reads records through read-only tools — <b>including your own notes</b> when they match. Verbatim third-party quotes and the Robertson table rows stay on this machine. The API key stays in the local server; this page never sees it.</p></details>`;
  if (!st.server) return `<div class="conn off"><p><b>Claude · not connected</b></p><p>This page is open without the knowledge server, so nothing can reach Claude. Retrieval works here.</p><p class="dim">Start <code>python3 -I tools/knowledge/server.py</code> and open <code>127.0.0.1:8782/knowledge/</code>.</p>${what}</div>`;
  if (!st.connected) return `<div class="conn off"><p><b>${esc(MODEL_NAME(st.model))} · not connected</b></p><ul class="checks">${st.checks.map(c => `<li class="${c.ok ? 'ok' : 'no'}"><span aria-hidden="true">${c.ok ? '✓' : '✕'}</span> ${esc(c.detail)}</li>`).join('')}</ul>${what}</div>`;
  return `<div class="conn on"><p><b>${esc(MODEL_NAME(st.model))} · connected</b> <span class="dim">effort ${esc(st.effort || '')} · each question is billed to the API key on this machine</span></p>${what}</div>`;
}

export class AskTab {
  constructor(dlg, ctx = {}) { this.dlg = dlg; this.app = dlg.app; this.sel = ctx.sel === undefined ? dlg.app.sel : ctx.sel; this.place = ''; this.retr = null; this.res = null; this.busy = false; }

  render(out, text) {
    const app = this.app; const kb = app.kbv(); const q = text.trim();
    const places = [...kb.state.entities.values()].filter(e => e.facet === 'place');
    const layerName = { preset: 'Preset', mine: 'My knowledge + Preset', combined: 'Combined' }[app.layer];
    out.innerHTML = `<div class="ask">
      <div class="askctx" aria-label="Context sent with the question"><span class="chip ctx" title="the knowledge layer the question is asked against">${esc(layerName)}</span><span class="chip ctx mono" title="knowledge version: Preset ${esc(kb.baseVersion)} + your changes">${esc(kb.activeRevision.replace(/^base-/, '').slice(0, 26))}</span>${this.sel ? `<span class="chip ctx selc">${esc(selectionLabel(app, this.sel))}<button data-unsel aria-label="Ask without the selection">×</button></span>` : ''}
        <select id="askPlace" aria-label="Project place"><option value="">project place · not set</option>${places.map(p => `<option value="${esc(p.id)}" ${p.id === this.place ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="dfoot"><button class="btn box" data-retrieve ${q ? '' : 'disabled'} title="Keyword retrieval over the knowledge in effect — no model">Retrieve</button><button class="btn primary" data-ask disabled>${this.busy ? 'Asking Claude…' : 'Ask Claude'}</button></div>
      <div id="askConn"></div><div id="askOut"></div></div>`;
    out.querySelector('[data-unsel]')?.addEventListener('click', () => { this.sel = null; this.dlg.update(); });
    out.querySelector('#askPlace').onchange = e => { this.place = e.target.value; };
    out.querySelector('[data-retrieve]').onclick = () => this.retrieve(q);
    const askBtn = out.querySelector('[data-ask]');
    askBtn.onclick = () => this.ask(q);
    LLM.status().then(st => { const c = out.querySelector('#askConn'); if (!c) return; c.innerHTML = connectionHTML(st); askBtn.disabled = !(st.connected && q && !this.busy); askBtn.title = st.connected ? 'Claude answers from this knowledge, citing records' : 'Claude is not connected'; });
    this.paint(out.querySelector('#askOut'));
    out.querySelector('#askOut').onclick = ev => this.follow(ev);
  }

  /** Real local retrieval (the same index and scores as window.GPK and kq.py), plus the server's reading of the same version. */
  async retrieve(q) {
    const app = this.app; const kb = app.kbv();
    const r = kb.searchKnowledge({ query: q, projectContext: this.place ? { place: this.place } : null, limit: 12 });
    this.retr = { q, out: r, server: null }; this.res = null; this.dlg.update();
    const st = await LLM.status();
    if (st.server) {
      const s = await LLM.post('/api/retrieve', { query: q, projectPlace: this.place || null, limit: 12, ...knowledgeContext(app) });
      this.retr.server = s.status === 200 ? { same: JSON.stringify(s.body.returnedRecordIds) === JSON.stringify(r.returnedRecordIds), n: s.body.returnedRecordIds.length, rev: s.body.activeRevision } : { error: s.body?.error || 'HTTP ' + s.status };
      if (this.retr.q === q) this.dlg.update();
    }
  }

  async ask(q) {
    const app = this.app; if (!q || this.busy) return;
    if (!this.retr || this.retr.q !== q) await this.retrieve(q);
    this.busy = true; this.res = null; this.dlg.update();
    const s = this.sel;
    const body = { question: q, projectPlace: this.place || null, retrievedIds: this.retr?.out.returnedRecordIds || [], selection: s ? { kind: s.kind, id: s.id || s.key || null, label: selectionLabel(app, s) } : null, ...knowledgeContext(app) };
    const r = await LLM.post('/api/ask', body);
    this.busy = false;
    this.res = r.status === 200 ? r.body : { status: 'error', error: r.status === 409 ? `the server read a different knowledge version (${r.body?.server}) — reload the page` : (r.body?.error || 'HTTP ' + r.status) };
    if (this.res?.status === 'not_connected') LLM._st = { ...this.res.connection, server: true };
    this.dlg.update();
  }

  paint(host) {
    const kb = this.app.kbv(); let h = '';
    const res = this.res;
    if (this.busy) h += `<p class="dim" role="status">Claude is reading the knowledge…</p>`;
    if (res?.status === 'answered' || res?.status === 'refused') {
      const { html, cites } = renderAnswer(res.answer, kb);
      const retrieved = new Set(res.retrieved_record_ids || []);
      const notRetrieved = cites.filter(id => kb.state.records.has(id) && !retrieved.has(id));
      const unknown = cites.filter(id => !kb.state.records.has(id));
      h += `<section class="askblk answer" aria-label="Claude's answer"><h4>Answer <span class="dim">· ${esc(MODEL_NAME(res.model))}${res.status === 'refused' ? ' · declined' : ''}</span></h4>${html || '<p class="dim">No text returned.</p>'}
        <p class="meta">${esc(res.stop_reason || '')} · ${res.usage ? `${res.usage.input_tokens} in / ${res.usage.output_tokens} out tokens` : ''} · ${res.seconds ?? ''} s · ${esc(res.layer || '')} · <span class="mono">${esc(String(res.activeRevision || '').slice(5, 31))}</span></p></section>
        <section class="askblk"><h4>Cited · ${cites.length}${notRetrieved.length ? ` <span class="warnt">· ${notRetrieved.length} not retrieved by a tool</span>` : ''}${unknown.length ? ` <span class="warnt">· ${unknown.length} not in this knowledge</span>` : ''}</h4>
          <div class="rlist">${cites.filter(id => kb.state.records.has(id)).map((id, i) => `<div class="citem"><span class="cn">${cites.indexOf(id) + 1}</span>${recItem(kb, kb.state.records.get(id), { subject: true })}${retrieved.has(id) ? '' : '<span class="mk mk-lead">not retrieved by a tool</span>'}</div>`).join('') || '<p class="dim">No record cited.</p>'}</div></section>
        <section class="askblk"><details><summary>Retrieved by Claude's tools · ${retrieved.size} records · ${(res.tool_calls || []).length} tool calls</summary>
          <ol class="tcalls">${(res.tool_calls || []).map(t => `<li><span class="mono">${esc(t.name)}</span> ${esc(trim(JSON.stringify(t.input), 90))}</li>`).join('')}</ol>
          <div class="rlist">${[...retrieved].filter(id => kb.state.records.has(id) && !cites.includes(id)).slice(0, 40).map(id => recItem(kb, kb.state.records.get(id), { subject: true, compact: true })).join('')}</div></details></section>`;
    } else if (res?.status === 'not_connected') h += `<p class="note">Not asked: Claude is not connected.</p>`;
    else if (res?.status === 'error') h += `<p class="note warn">Claude could not answer: ${esc(res.error)}</p>`;
    if (this.retr) {
      const r = this.retr.out; const sv = this.retr.server;
      h += `<section class="askblk"><h4>Retrieved here · ${r.results.length} records <span class="dim">· keyword index, no model</span></h4>
        ${sv ? `<p class="dim srvchk">${sv.error ? 'Server: ' + esc(sv.error) : sv.same ? `Server read the same version and returned the same ${sv.n} records.` : `<span class="warnt">Server returned different records (${sv.n}).</span>`}</p>` : ''}
        ${r.missing?.length ? `<p class="dim">Known but empty: ${r.missing.map(m => sci(m.name)).join(', ')}</p>` : ''}
        <div class="rlist">${r.results.map(x => { const rec = kb.state.records.get(x.recordId); return rec ? recItem(kb, rec, { subject: true }) + (x.placeMatch && x.placeMatch !== 'same' ? `<span class="mk pm">${esc(x.placeNote)}</span>` : '') : ''; }).join('') || '<p class="dim">Nothing matches.</p>'}</div></section>`;
    }
    host.innerHTML = h;
  }

  /** A reference in the answer or a listed record locates it: canvas and inspector, with a way back to the answer. */
  follow(ev) {
    const t = ev.target.closest('[data-rec],[data-ent]'); if (!t) return;
    ev.preventDefault();
    const app = this.app; this.dlg.suspend();
    if (t.dataset.ent) { app.goTo(t.dataset.ent); return; }
    const r = app.kbv().state.records.get(t.dataset.rec);
    const subj = r?.subjects.find(s => A.isPlant(app.kb.state.entities.get(s)));
    if (subj && app.col === 'library' && app.view !== 'connections') app.ensureInScope(subj);
    app.goTo(t.dataset.rec, 'record'); app.render(); if (r) app.highlight(r.subjects);
  }
}

