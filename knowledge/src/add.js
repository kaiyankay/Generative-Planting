// Add / Ask — one composer in the right column, one text box. Add: the designer says what they know (a name, a sentence, a list,
// a table, a file); the panel shows, deterministically, what it can link and asks only for what that input needs. With Claude
// connected, "Understand with Claude" proposes an editable structured preview; nothing is saved until the designer confirms, and
// the raw words are kept with every record. Ask: retrieval here plus, when connected, Claude's answer with its citations.
import { esc, sci, trim, icon, kindLabel } from './ui.js';
import * as A from './analysis.js';
import { planAddPlant, detectSubjects, makeNote, NOTE_KINDS, parseCSV, parseJSONTable, guessNameColumn, planTableImport, planFile } from './ingest.js';
import { AskTab, LLM } from './ask.js';

const normWord = s => String(s || '').toLowerCase();
const KIND_CUES = [[/\b(prefer|favourite|favorite|like to use|love)\b|偏好|喜欢/i, 'preference'], [/\b(i saw|observed|noticed|measured|counted|in my garden)\b|观察|看到/i, 'observation'], [/\b(project|client|brief|site requirement)\b|项目/i, 'project_requirement'], [/\b(i use|we use|works|in my experience|always|never|tends to)\b|经验|使用/i, 'practice']];

export class AddDialog {
  constructor(el, app) { this.d = el; this.app = app; this.isOpen = false; this.suspended = false; this.tab = 'add'; }

  open(ctx = {}) {
    this.ctx = ctx; this.mode = null; this.forced = null; this.file = null; this.table = null; this.isOpen = true; this.suspended = false; this.preview = null;
    this.subjects = new Set(ctx.subjects || []); this.off = new Set(); this.kind = null; this.place = undefined; this.cite = null;
    this.tab = ctx.tab || 'add'; this.asker = new AskTab(this, ctx);
    this.d.innerHTML = `<div class="ahead"><div class="atabs" role="tablist" aria-label="Add or ask"><button role="tab" data-tab="add">Add knowledge</button><button role="tab" data-tab="ask">Ask</button></div><button class="iconbtn" data-x aria-label="Close">${icon('close', 16)}</button></div>
      <div class="abody"><div id="adAbout"></div>
        <textarea class="addbox" id="adText" aria-label="Your words"></textarea>
        <div class="adline"><label class="btn small quiet" id="adFileL" style="cursor:pointer">${icon('file', 14)} File<input type="file" id="adFile" hidden></label><span class="dim" id="adAs"></span></div>
        <div id="adOut"></div></div>`;
    this.d.querySelector('[data-x]').onclick = () => this.close();
    this.d.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => this.setTab(b.dataset.tab));
    this.ta = this.d.querySelector('#adText'); this.ta.value = ctx.text || '';
    this.ta.oninput = () => { this.file = null; this.table = null; if (this.forced === 'preview') this.preview = null; this.forced = null; this.update(); };
    this.ta.onkeydown = e => { if (this.tab === 'ask' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); this.d.querySelector('[data-retrieve]')?.click(); } };
    this.d.querySelector('#adFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; this.file = f;
      if (/\.(csv|tsv|json)$/i.test(f.name) || /csv|json/.test(f.type)) { const txt = await f.text(); try { this.table = /\.json$/i.test(f.name) ? parseJSONTable(txt) : parseCSV(/\.tsv$/i.test(f.name) ? txt.replace(/\t/g, ',') : txt); this.table.name = f.name; this.forced = 'table'; } catch (err) { this.forced = 'document'; this.err = err.message; } }
      else this.forced = 'document';
      this.update(); };
    this.app.renderInspector();
    this.update(); this.ta.focus();
  }
  /** Same text box, other job: what was typed stays. */
  setTab(t) { this.tab = t; if (t === 'ask') { this.forced = this.forced === 'preview' ? null : this.forced; this.app.highlight([]); } this.update(); this.ta.focus(); }
  close() { this.isOpen = false; this.suspended = false; this.d.hidden = true; this.app.highlight([]); this.app.renderInspector(); this.app.markSelection(); }
  /** Step aside for the inspector (a reference was followed) and keep everything for "Back". */
  suspend() { this.isOpen = false; this.suspended = true; this.d.hidden = true; }
  resume() { this.isOpen = true; this.suspended = false; this.app.renderInspector(); }

  /** What kind of input this is — by its form only (no language model). */
  interpret(text) {
    if (this.forced) return this.forced;
    const t = text.trim(); if (!t) return null;
    const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (lines.length >= 2 && (lines[0].split(',').length >= 2 || lines[0].includes('\t'))) return 'table';
    if (lines.length >= 3 && lines.every(l => l.length <= 60 && !/[.!?。]$/.test(l) && l.split(/\s+/).length <= 6)) return 'list';
    if (lines.length === 1 && t.length <= 60 && !/[.!?。,;:]/.test(t) && t.split(/\s+/).length <= 5) return 'plant';
    return 'note';
  }

  update() {
    this.d.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === this.tab)));
    const asking = this.tab === 'ask';
    this.ta.placeholder = asking ? 'Ask about plants, places, research or your own notes' : 'A plant name, a sentence from your practice, a plant list or a pasted table';
    this.ta.setAttribute('aria-label', asking ? 'Your question' : 'What you know');
    this.d.querySelector('#adFileL').hidden = asking;
    if (asking) { this.d.querySelector('#adAs').innerHTML = ''; this.d.querySelector('#adAbout').innerHTML = ''; this.asker.render(this.d.querySelector('#adOut'), this.ta.value); return; }
    if (this.forced === 'preview' && this.preview) { this.d.querySelector('#adAs').innerHTML = ''; return this.previewView(this.d.querySelector('#adOut')); }
    const kb = this.app.kb; const text = this.ta.value; const mode = this.interpret(text); this.mode = mode;
    const about = [...this.subjects].filter(id => kb.state.entities.has(id));
    this.d.querySelector('#adAbout').innerHTML = about.length && mode === 'document' ? `<div class="chips" style="margin-bottom:8px"><span class="dim" style="font-size:12px">About</span>${about.map(id => `<span class="chip on">${A.isPlant(kb.state.entities.get(id)) ? sci(kb.label(id)) : esc(kb.label(id))}</span>`).join('')}</div>` : '';
    const as = { plant: 'a plant name', note: 'a note', list: 'a list', table: 'a table', document: 'a document' }[mode] || '';
    const alt = mode && mode !== 'document' ? ['plant', 'note', 'list'].filter(m => m !== mode && (m !== 'list' || text.includes('\n'))).map(m => `<button class="btn small quiet" data-as="${m}" style="height:auto">${{ plant: 'plant name', note: 'note', list: 'list' }[m]}</button>`).join(' · ') : '';
    this.d.querySelector('#adAs').innerHTML = as ? `Read as ${as}${alt ? ' · or ' + alt : ''}` : '';
    this.d.querySelectorAll('[data-as]').forEach(b => b.onclick = () => { this.forced = b.dataset.as; this.update(); });
    const out = this.d.querySelector('#adOut');
    if (!mode) { out.innerHTML = ''; return; }
    ({ plant: () => this.plant(out, text), note: () => this.note(out, text), list: () => this.list(out, text), table: () => this.tableView(out), document: () => this.document(out) })[mode]();
  }

  // ---- a plant name ----
  plant(out, text) {
    const A_ = this.app; const p = planAddPlant(A_.kb, text);
    let h = `<div class="understood">`;
    if (p.status === 'exists') { const e = p.entity; const f = A.plantFacts(A_.kb, e.id);
      h += `<p style="margin:0 0 8px"><b>${e.commonName ? esc(e.commonName) + ' · ' : ''}${sci(e.name)}</b> is already here <span class="dim">· ${f ? f.active : 0} records</span></p>
        <div class="dfoot"><button class="btn primary mine" data-go="note" data-id="${esc(e.id)}">Write about it</button><button class="btn" data-open="${esc(e.id)}">Open</button></div>`; }
    else if (p.status === 'ambiguous') h += `<p style="margin:0 0 8px">Several plants match — ${p.matches.map(m => `<button class="btn small" data-open="${esc(m.id)}">${sci(m.name)} <span class="dim">${esc(kindLabel(m))}</span></button>`).join(' ')}</p>`;
    else if (p.status === 'new') h += `<p style="margin:0 0 8px"><b>${sci(p.event.entity.name)}</b> is new · <span class="mk mk-prov">provisional</span>. Nothing about it is known yet; nothing is looked up.</p>
      <div class="dfoot"><button class="btn primary mine" data-addplant>Add plant</button></div>`;
    out.innerHTML = h + '</div>';
    out.querySelector('[data-addplant]')?.addEventListener('click', () => { const e = A_.commit(p.event, `Added ${p.event.entity.name}`); if (!e) return; A_.goTo(p.event.entity.id); this.subjects = new Set([p.event.entity.id]); this.ta.value = ''; this.forced = 'note'; this.update(); this.ta.placeholder = `What do you know about ${p.event.entity.name}?`; this.ta.focus(); });
    out.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { this.close(); A_.goTo(b.dataset.open); });
    out.querySelector('[data-go]')?.addEventListener('click', ev => { this.subjects = new Set([ev.currentTarget.dataset.id]); this.ta.value = ''; this.forced = 'note'; this.update(); this.ta.focus(); });
  }

  // ---- knowledge in the designer's words ----
  note(out, text) {
    const A_ = this.app; const kb = A_.kb;
    const det = detectSubjects(kb, text);
    det.ambiguous = det.ambiguous.filter(a => a.ids.some(id => A.isPlant(kb.state.entities.get(id))));   // only ambiguous plant names are worth a word
    const ids = [...new Set([...this.subjects, ...det.subjects.map(x => x.entity.id)])];
    // candidate new plant names: Latin-looking binomials only (capitalised genus + lowercase epithet that is not an English word), never a known name
    const STOP = new Set(['for', 'and', 'the', 'with', 'into', 'from', 'that', 'this', 'when', 'once', 'needs', 'need', 'grows', 'does', 'did', 'was', 'were', 'are', 'has', 'have', 'had', 'can', 'will', 'self', 'seeds', 'plantings', 'planting', 'beds', 'gardens', 'garden', 'is', 'in', 'on', 'at', 'as', 'but', 'not', 'very', 'well', 'also', 'here', 'there', 'they', 'them', 'its', 'our', 'my', 'your', 'works', 'looks', 'likes', 'prefers']);
    const known = new Set(det.subjects.map(x => normWord(x.matched)));
    const unknown = [...new Set((text.match(/\b[A-Z][a-z]{2,} [a-z]{3,}(?: ['‘][^'’]+['’])?/g) || []).filter(n => { const [g, ep] = n.split(' '); return !STOP.has(ep) && /(us|um|a|ae|is|ii|i|ia|ens|ans|ata|ensis|oides|ifolia|iflora|osa|ana|ina)$/.test(ep) && kb.resolveName(g).status === 'none' && ![...known].some(k => k.includes(g.toLowerCase())) && kb.resolveName(n).status === 'none'; }))];
    const cue = KIND_CUES.find(([re]) => re.test(text)); const kind = this.kind || cue?.[1] || 'note';
    const places = [...kb.state.entities.values()].filter(e => e.facet === 'place');
    const placeHit = places.find(p => [p.name, ...(p.aliases || [])].some(a => a.length > 3 && new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)));
    const place = this.place !== undefined ? this.place : placeHit?.id || null;
    let h = `<div class="understood"><h4>About</h4><div class="chips">${ids.map(id => `<button class="chip ${this.off.has(id) ? 'off' : 'on'}" data-s="${esc(id)}" title="${this.off.has(id) ? 'not linked — click to link' : 'linked — click to unlink'}">${A.isPlant(kb.state.entities.get(id)) ? sci(kb.label(id)) : esc(kb.label(id))}</button>`).join('') || '<span class="dim" style="font-size:12px">none — general knowledge</span>'}
      ${unknown.map(n => `<button class="chip" data-new="${esc(n)}" title="add as a new provisional plant and link it">+ ${sci(n)}</button>`).join('')}</div>
      <div class="search" style="margin:8px 0 0;max-width:340px"><input id="adSubj" placeholder="+ Link a plant or topic"><div class="suggest" id="adSug" hidden></div></div>
      ${det.ambiguous.length ? `<p class="dim" style="font-size:12px;margin:6px 0 0">Not linked (ambiguous): ${det.ambiguous.map(a => esc(a.name)).join(', ')}</p>` : ''}
      <h4>This is</h4><div class="choice">${Object.entries(NOTE_KINDS).map(([k, l]) => `<button role="radio" data-k="${k}" aria-checked="${k === kind}">${esc(l.split(' (')[0])}</button>`).join('')}</div>${cue && !this.kind ? `<p class="dim" style="font-size:11px;margin:4px 0 0">from “${esc(text.match(cue[0])[0])}”</p>` : ''}
      <h4>Where</h4><select id="adPlace" style="border:0;border-bottom:1px solid var(--rule-2);padding:4px 0;min-width:240px"><option value="">not stated</option>${places.map(p => `<option value="${esc(p.id)}" ${p.id === place ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>${placeHit && this.place === undefined ? ` <span class="dim" style="font-size:11px">from your text</span>` : ''}
      <div style="margin-top:10px">${this.cite ? `<div class="form" style="grid-template-columns:1fr 1fr;display:grid;gap:10px"><label>Reference you rely on<input id="adCite" value="${esc(this.cite.text || '')}" placeholder="e.g. Rainer & West 2015, p. 112"></label><label>Link<input id="adCiteUrl" value="${esc(this.cite.url || '')}" placeholder="https://…"></label></div>` : `<button class="btn small quiet" data-cite>+ Reference</button>`}</div>
      <div class="dfoot"><button class="btn primary mine" data-save>Save</button><button class="btn box" data-understand disabled title="Claude proposes a structured preview of your words; nothing is saved until you confirm">Understand with Claude</button></div>
      <p class="dim xnote" id="adX"></p></div>`;
    out.innerHTML = h;
    const ub = out.querySelector('[data-understand]');
    LLM.status().then(st => { if (!ub.isConnected) return; ub.disabled = !st.connected; out.querySelector('#adX').textContent = st.connected ? '' : 'Claude is not connected — Save keeps your words as written. The Ask tab shows what is missing.'; });
    ub.onclick = () => this.understand(text);
    A_.highlight(ids.filter(id => !this.off.has(id)));
    out.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { const id = b.dataset.s; this.off.has(id) ? this.off.delete(id) : this.off.add(id); this.subjects.add(id); this.update(); });
    out.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { this.kind = b.dataset.k; this.update(); });
    out.querySelector('#adPlace').onchange = e => { this.place = e.target.value || null; };
    out.querySelector('[data-cite]')?.addEventListener('click', () => { this.cite = { text: '', url: '' }; this.update(); });
    out.querySelectorAll('[data-new]').forEach(b => b.onclick = () => { const p = planAddPlant(kb, b.dataset.new); if (p.status === 'new' && A_.commit(p.event, `Added ${p.event.entity.name}`)) { this.subjects.add(p.event.entity.id); this.update(); } });
    const inp = out.querySelector('#adSubj'); const sug = out.querySelector('#adSug');
    inp.oninput = () => { const r = kb.searchEntities(inp.value, { limit: 8, types: ['plant', 'cultivar', 'topic', 'planting_system', 'list'] }); sug.hidden = !inp.value.trim() || !r.length;
      sug.innerHTML = r.map(x => `<button data-id="${esc(x.id)}">${sci(x.name)}<span class="t">${esc(x.type)}</span></button>`).join('');
      sug.querySelectorAll('button').forEach(b => b.onclick = () => { this.subjects.add(b.dataset.id); this.off.delete(b.dataset.id); this.update(); }); };
    out.querySelector('[data-save]').onclick = () => {
      const subjects = ids.filter(id => !this.off.has(id));
      const cite = this.cite ? { text: out.querySelector('#adCite')?.value.trim(), url: out.querySelector('#adCiteUrl')?.value.trim() } : null;
      let ev; try { ev = makeNote(kb, { text, subjectIds: subjects, kind, place: out.querySelector('#adPlace').value || null }); } catch (e) { A_.toast(e.message); return; }
      if (cite?.text || cite?.url) ev.record.cites = cite;
      if (A_.commit(ev, 'Saved to your knowledge')) { this.close(); A_.select({ kind: 'record', id: ev.record.id }); }
    };
  }

  // ---- Claude-assisted understanding: an editable preview, saved only on confirmation ----
  async understand(text) {
    const out = this.d.querySelector('#adOut'); const x = out.querySelector('#adX'); const ub = out.querySelector('[data-understand]');
    ub.disabled = true; x.textContent = 'Claude is reading your words…';
    const r = await LLM.post('/api/ingest/extract', { text, layer: 'combined', activeRevision: this.app.kb.activeRevision, events: this.app.kb.events });
    if (r.status !== 200 || r.body?.status !== 'preview') { ub.disabled = false; x.textContent = r.body?.status === 'not_connected' ? 'Claude is not connected.' : 'Claude could not read it: ' + (r.body?.error || r.body?.status || 'HTTP ' + r.status); return; }
    this.showPreview(r.body);
  }
  /** Show a preview returned by the server (tests pass a labelled fixture). Unknown ids are cleared; nothing is applied here. */
  showPreview(res) {
    const kb = this.app.kb;
    const sts = (res.preview?.statements || []).map(s => ({ on: true, text: s.text || '', kind: NOTE_KINDS[s.kind] ? s.kind : 'note', place: kb.state.entities.has(s.place_id) ? s.place_id : '', time: s.time || '', conditions: (s.conditions || []).join('; '), summary: s.value || '', topic: s.topic || 'other', uncertain: (s.uncertain || []).slice(),
      subjects: (s.subjects || []).map(x => ({ name: x.name_as_written, id: kb.state.entities.has(x.entity_id) ? x.entity_id : '', on: !!kb.state.entities.has(x.entity_id), addNew: false })), orig: s }));
    this.preview = { res, sts }; this.forced = 'preview'; this.update();
  }
  previewView(out) {
    const A_ = this.app; const kb = A_.kb; const { res, sts } = this.preview;
    const places = [...kb.state.entities.values()].filter(e => e.facet === 'place');
    out.innerHTML = `<div class="understood xprev"><p class="note">Proposed by ${esc(res.model || 'Claude')} from your words. Edit anything; only what you confirm is saved, with your original text kept beside it.</p>
      ${sts.map((s, i) => `<div class="xst ${s.on ? '' : 'off'}" data-i="${i}">
        <label class="xon"><input type="checkbox" data-f="on" ${s.on ? 'checked' : ''}> Statement ${i + 1}</label>
        <textarea data-f="text" rows="2" aria-label="Statement ${i + 1} text">${esc(s.text)}</textarea>
        <h4>About</h4><div class="chips">${s.subjects.map((x, j) => x.id ? `<button class="chip ${x.on ? 'on' : 'off'}" data-subj="${j}" title="${x.on ? 'linked — click to unlink' : 'not linked — click to link'}">${A.isPlant(kb.state.entities.get(x.id)) ? sci(kb.label(x.id)) : esc(kb.label(x.id))}</button>` : `<button class="chip ${x.addNew ? 'on' : ''}" data-newp="${j}" title="not in the knowledge — click to add it as a new provisional plant">${x.addNew ? '' : '+ '}${sci(x.name)}${x.addNew ? ' · new' : ''}</button>`).join('') || '<span class="dim" style="font-size:12px">none</span>'}</div>
        <h4>This is</h4><div class="choice">${Object.entries(NOTE_KINDS).map(([k, l]) => `<button role="radio" data-kind="${k}" aria-checked="${k === s.kind}">${esc(l.split(' (')[0])}</button>`).join('')}</div>
        <div class="xgrid"><label>Where<select data-f="place"><option value="">not stated</option>${places.map(p => `<option value="${esc(p.id)}" ${p.id === s.place ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
          <label>When<input data-f="time" value="${esc(s.time)}" placeholder="not stated"></label>
          <label>Conditions<input data-f="conditions" value="${esc(s.conditions)}" placeholder="not stated"></label>
          <label>In short<input data-f="summary" value="${esc(s.summary)}" placeholder="optional"></label></div>
        ${s.uncertain.length ? `<p class="dim xunc">Left open: ${s.uncertain.map(esc).join('; ')}</p>` : ''}</div>`).join('')}
      <div class="dfoot"><button class="btn primary mine" data-confirm ${sts.some(s => s.on && s.text.trim()) ? '' : 'disabled'}>Confirm and save ${sts.filter(s => s.on).length}</button><button class="btn quiet" data-discard>Discard</button></div></div>`;
    const st = el => sts[+el.closest('.xst').dataset.i];
    out.querySelectorAll('[data-f]').forEach(el => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => {
      const s = st(el); const f = el.dataset.f; s[f] = el.type === 'checkbox' ? el.checked : el.value;
      if (f === 'on') this.update(); else out.querySelector('[data-confirm]').disabled = !sts.some(x => x.on && x.text.trim());
    }));
    out.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { st(b).kind = b.dataset.kind; this.update(); });
    out.querySelectorAll('[data-subj]').forEach(b => b.onclick = () => { const x = st(b).subjects[+b.dataset.subj]; x.on = !x.on; this.update(); });
    out.querySelectorAll('[data-newp]').forEach(b => b.onclick = () => { const x = st(b).subjects[+b.dataset.newp]; x.addNew = !x.addNew; this.update(); });
    out.querySelector('[data-discard]').onclick = () => { this.preview = null; this.forced = null; this.update(); };
    out.querySelector('[data-confirm]').onclick = () => this.confirmPreview();
    A_.highlight([...new Set(sts.filter(s => s.on).flatMap(s => s.subjects.filter(x => x.on && x.id).map(x => x.id)))]);
  }
  /** One event (a batch when there are several statements or new plants): Undo removes all of it. */
  confirmPreview() {
    const A_ = this.app; const kb = A_.kb; const { res, sts } = this.preview; const evs = []; const newIds = new Map();
    const at = new Date().toISOString();
    for (const s of sts.filter(s => s.on && s.text.trim())) {
      const ids = [];
      for (const x of s.subjects) {
        if (x.id && x.on) ids.push(x.id);
        else if (!x.id && x.addNew) {
          if (!newIds.has(x.name)) { const p = planAddPlant(kb, x.name); if (p.status === 'new') { evs.push(p.event); newIds.set(x.name, p.event.entity.id); } else if (p.status === 'exists') newIds.set(x.name, p.entity.id); }
          if (newIds.get(x.name)) ids.push(newIds.get(x.name));
        }
      }
      const ev = makeNote(kb, { text: s.text.trim(), subjectIds: [...new Set(ids)], kind: s.kind, place: s.place || null });
      const r = ev.record;
      if (s.time.trim()) r.context.time = [s.time.trim()];
      r.context.conditions = s.conditions.split(/[;\n]/).map(c => c.trim()).filter(Boolean);
      const edited = s.text !== s.orig.text || s.kind !== s.orig.kind || (s.place || '') !== (s.orig.place_id || '') || s.time !== (s.orig.time || '') || s.summary !== (s.orig.value || '');
      r.extraction = { method: 'claude', model: res.model || null, at, input: res.input, proposed: s.orig, summary: s.summary.trim() || null, topic: s.topic, confirmedBy: 'designer', edited };
      r.sourceRefs[0].locator = 'my words, structured with Claude and confirmed ' + at.slice(0, 16).replace('T', ' ');
      evs.push(ev);
    }
    if (!evs.length) return;
    const nRec = evs.filter(e => e.type === 'add_record').length;
    const ev = evs.length === 1 ? evs[0] : { type: 'batch', label: `${nRec} statement${nRec > 1 ? 's' : ''} from your words (structured with Claude)`, events: evs };
    const done = A_.commit(ev, nRec > 1 ? `Saved ${nRec} statements` : 'Saved to your knowledge');
    if (done) { const first = evs.find(e => e.type === 'add_record'); this.close(); A_.select({ kind: 'record', id: first.record.id }); }
  }

  // ---- lists and tables ----
  list(out, text) {
    const rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean).map(x => [x]);
    this.table = { name: 'pasted list', columns: ['plant name'], rows }; this.tableView(out, true);
  }
  tableView(out, isList = false) {
    const A_ = this.app; const t = this.table; if (!t) { out.innerHTML = ''; return; }
    const nc = this.nameCol && t.columns.includes(this.nameCol) ? this.nameCol : guessNameColumn(t.columns);
    out.innerHTML = `<div class="understood"><h4>${t.rows.length} rows${t.columns.length > 1 ? ` · ${t.columns.map(esc).join(', ')}` : ''}</h4>
      <div class="form" style="grid-template-columns:1fr 1fr;display:grid;gap:12px">
        <label>Title<input id="tTitle" value="${esc(this.tTitle ?? '')}" placeholder="Perennials for dry slopes" required></label>
        <label>Source<input id="tSrc" value="${esc(this.tSrc ?? '')}" placeholder="my nursery list 2025" required></label>
        ${t.columns.length > 1 ? `<label>Column with plant names<select id="tName">${t.columns.map(c => `<option ${c === nc ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>` : ''}
        ${t.columns.length > 1 ? `<label>Kind<select id="tMode"><option value="list">list</option><option value="observations" ${this.tMode === 'observations' ? 'selected' : ''}>observations</option></select></label>` : '<input type="hidden" id="tMode" value="list">'}</div>
      <div id="tPrev"></div>
      <div class="dfoot"><button class="btn primary mine" id="tGo" disabled>Import</button><span class="dim" id="tHint">title and source first</span></div></div>`;
    const prev = () => {
      this.tTitle = out.querySelector('#tTitle').value; this.tSrc = out.querySelector('#tSrc').value; this.tMode = out.querySelector('#tMode').value; this.nameCol = out.querySelector('#tName')?.value || t.columns[0];
      const plan = planTableImport(A_.kb, { fileName: t.name, columns: t.columns, rows: t.rows, nameColumn: this.nameCol, mode: this.tMode, title: this.tTitle.trim() || t.name, sourceName: this.tSrc.trim() });
      const c = { matched: 0, fresh: 0, un: plan.unmatched.length, dup: 0 }; for (const p of plan.preview) { if (p.status?.startsWith('matched')) c.matched++; else if (p.status?.startsWith('new (provisional')) c.fresh++; if (/same plant as row/.test(p.status || '')) c.dup++; }
      out.querySelector('#tPrev').innerHTML = `<p style="font-size:12px;margin:12px 0 4px">${c.matched} known · ${c.fresh} new · ${c.un ? `<b>${c.un} not linked</b>` : '0 not linked'}${c.dup ? ` · ${c.dup} repeat a plant` : ''}</p>
        <div class="prev"><table><thead><tr><th>#</th><th>${esc(this.nameCol)}</th><th></th></tr></thead><tbody>${plan.preview.slice(0, 120).map(p => `<tr><td class="dim">${p.row + 1}</td><td>${esc(p.raw)}</td><td>${p.entityId ? `${sci(A_.kb.label(p.entityId))} <span class="dim">${esc(p.status)}</span>` : `<span class="mk mk-excl">${esc(p.status)}</span>${p.candidates?.length ? ` <span class="dim">(${p.candidates.map(id => esc(A_.kb.label(id))).join(' / ')})</span>` : ''}`}</td></tr>`).join('')}</tbody></table></div>`;
      const ok = this.tTitle.trim() && this.tSrc.trim(); out.querySelector('#tGo').disabled = !ok; out.querySelector('#tHint').hidden = !!ok;
      this.plan = plan;
    };
    ['#tTitle', '#tSrc'].forEach(s => out.querySelector(s).oninput = prev); ['#tName', '#tMode'].forEach(s => { const el = out.querySelector(s); if (el && el.tagName === 'SELECT') el.onchange = prev; });
    prev();
    out.querySelector('#tGo').onclick = () => { const plan = this.plan; if (A_.commit(plan.events[0], `Imported ${this.tTitle.trim()}`)) { this.close(); const id = plan.listId || plan.datasetId; A_.select({ kind: 'entity', id }); } };
  }

  // ---- a document we cannot read here ----
  document(out) {
    const A_ = this.app; const f = this.file;
    if (!f) { out.innerHTML = ''; return; }
    out.innerHTML = `<div class="understood"><h4>${esc(f.name)} · ${Math.round(f.size / 1024)} KB</h4>${this.err ? `<p class="note warn">${esc(this.err)} — kept as a document instead.</p>` : ''}
      <p style="margin:0 0 8px;font-size:12px" class="dim">Stored in this browser; its contents are not read.</p>
      <div class="form"><label>What it is<input id="fNote" placeholder="Metro Vancouver drought plan 2023"></label></div>
      <div class="dfoot"><button class="btn primary mine" id="fGo">Attach</button></div></div>`;
    out.querySelector('#fGo').onclick = async () => {
      const plan = planFile(A_.kb, f, { subjectIds: [...this.subjects], note: out.querySelector('#fNote').value.trim() });
      await A_.store.putFile({ id: plan.fileId, name: f.name, type: f.type, size: f.size, blob: f });
      if (A_.commit(plan.event, 'Document attached')) this.close();
    };
  }
}
