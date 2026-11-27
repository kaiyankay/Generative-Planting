// Contextual inspector: opens only on a selection and narrows the canvas (never covers it). It reads the KB of the current
// layer, so Preset / My knowledge / Combined show the same object consistently. Technical detail stays folded under "Details".
import * as A from './analysis.js';
import { esc, sci, plantVisual, recItem, recMarks, mark, monthStrip, trim, icon, fmtTime, kindLabel, DIA } from './ui.js';
import { makeRevision } from './ingest.js';
import { provenance } from './kb.js';
import { cellRecords, COLS } from './views/compare.js';
import { NOTE_KINDS } from './ingest.js';

export class Inspector {
  constructor(el, app) { this.el = el; this.app = app; }

  render() {
    const A_ = this.app; const s = A_.sel;
    if (!s) { this.el.hidden = true; this.el.innerHTML = ''; return; }
    const kb = A_.kbv(); let out = null;
    try {
      if (s.kind === 'entity') out = this.entity(kb, s.id);
      else if (s.kind === 'record') out = this.record(kb, s.id);
      else if (s.kind === 'evidence') out = this.evidence(kb, s);
      else if (s.kind === 'cell') out = this.cell(kb, s);
      else if (s.kind === 'hub') out = this.hub(kb, s);
      else if (s.kind === 'source') out = this.source(kb, s.id);
      else if (s.kind === 'me') out = this.me(kb);
    } catch (e) { console.error(e); out = { kind: 'Error', title: esc(e.message), body: '' }; }
    if (!out) out = { kind: '', title: 'Not in the Preset', body: `<p class="note mine">This is your knowledge. <button class="btn small mine" data-act="layer">Show Combined</button></p>` };
    this.el.hidden = false;
    const back = A_.add.suspended ? `<button class="btn small quiet backask" data-act="resume">${icon('back', 14)} Back to your question</button>` : '';
    this.el.innerHTML = `${back}<div class="ihead"><h3>${out.title}</h3><button class="iconbtn" data-act="ask" title="Ask about this" aria-label="Ask about this">${icon('ask', 16)}</button><button class="iconbtn x" data-act="close" aria-label="Close inspector">${icon('close', 16)}</button></div><div class="ibody">${out.body}</div>`;
    this.bind();
  }

  bind() {
    const A_ = this.app;
    this.el.onclick = ev => {
      const t = ev.target.closest('[data-act],[data-rec],[data-ent],[data-src],[data-explore]'); if (!t) return;
      if (t.dataset.act) { ev.preventDefault(); return this.act(t.dataset.act, t.dataset, t); }
      if (t.dataset.explore) return A_.explore(t.dataset.explore);
      if (t.dataset.rec) return A_.select({ kind: 'record', id: t.dataset.rec });
      if (t.dataset.src) return A_.select({ kind: 'source', id: t.dataset.src });
      if (t.dataset.ent) { ev.preventDefault(); return A_.select({ kind: 'entity', id: t.dataset.ent }); }
    };
  }

  act(a, d, el) {
    const A_ = this.app; const kb = A_.kb;
    if (a === 'close') { if (A_.add.suspended) A_.add.close(); return A_.select(null); }
    if (a === 'ask') return A_.openAsk({ sel: A_.sel });
    if (a === 'resume') return A_.add.resume();
    if (a === 'layer') return A_.setLayer('combined');
    if (a === 'add') return A_.openAdd({ subjects: d.id ? [d.id] : [] });
    if (a === 'explore') return A_.explore(d.id);
    if (a === 'undo') return A_.commit({ type: 'undo', target: d.ev }, 'Undone');
    if (a === 'include') return A_.commit({ type: 'include', target: d.id, label: 'Restored ' + d.id }, 'Restored');
    if (a === 'restore-orig') { const by = kb.state.supersededBy.get(d.id); const rev = kb.state.records.get(by); if (rev?.eventId) A_.commit({ type: 'undo', target: rev.eventId }, 'Original restored'); return; }
    if (a === 'exclude') return this.excludeForm(d.id);
    if (a === 'revise') return this.reviseForm(d.id);
    if (a === 'personal') return A_.open('personal');
    if (a === 'dataset') { A_.open('research', 'visitors'); return; }
    if (a === 'recipe') { A_.col = 'recipes'; A_.sub = d.id; A_.view = 'composition'; A_.render(); A_.syncUrl(); return; }
  }

  // ---------- plants and other entities ----------
  entity(kb, id) {
    const S = kb.state; const e = S.entities.get(id); if (!e) return null;
    if (A.isPlant(e)) return this.plant(kb, e);
    if (e.type === 'planting_system') return this.recipe(kb, e);
    if (e.type === 'dataset' || e.type === 'list') return this.dataset(kb, e);
    if (e.type === 'concept' && e.facet === 'place') return this.place(kb, e);
    const recs = kb.recordsOf(id);
    const plants = [...new Set(recs.flatMap(r => r.subjects).filter(s => s !== id && A.isPlant(S.entities.get(s))))];
    let b = `<div class="isec">${e.definition ? `<p style="margin:0 0 8px">${esc(e.definition)}</p>` : ''}<dl class="facts"><dt>Kind</dt><dd>${esc(kindLabel(e))}${e.facet ? ' · ' + esc(e.facet) : ''}</dd>${plants.length ? `<dt>Plants</dt><dd>${plants.length} with a record</dd>` : ''}<dt>Records</dt><dd>${recs.length} in effect</dd></dl>
      <div class="iact"><button class="btn small" data-act="explore" data-id="${esc(id)}">${icon('graph', 14)} Connections</button></div></div>`;
    if (plants.length) b += `<div class="isec"><h4>Plants <span class="num">${plants.length}</span></h4>${plants.slice(0, 40).map(p => `<div><button data-ent="${esc(p)}" class="btn small">${sci(kb.label(p))}</button></div>`).join('')}</div>`;
    b += `<div class="isec"><h4>Records <span class="num">${recs.length}</span></h4>${recs.slice(0, 30).map(r => recItem(kb, r, { subject: true })).join('')}</div>`;
    b += details({ id, aliases: e.aliases, layer: e.layer, legacyRef: e.legacyRef });
    return { kind: esc(kindLabel(e)), title: esc(e.name), body: b };
  }

  plant(kb, e) {
    const S = kb.state; const id = e.id; const f = A.plantFacts(kb, id); const c = f.coverage; const sp = c.species;
    const recs = A.activeOf(kb, id); const hist = (A.bySubject(kb).get(id) || []).filter(r => !r._eff.active);
    const kindTxt = '';
    const statusMark = f.status === 'candidate' ? mark.candidate() : f.status === 'placeholder' ? mark.placeholder() : f.status === 'provisional' ? mark.provisional() : '';
    const facts = [];
    if (sp) facts.push(['Species', `<button data-ent="${esc(sp)}" class="btn small" style="height:auto">${sci(kb.label(sp))}</button>`]);
    if (f.status !== 'established') facts.push(['Identity', `${statusMark}`]);
    if (e.plantType && !e.seedSet) facts.push(['Type', esc(e.plantType)]);
    let b = `<div class="isec"><div class="ipic">${plantVisual(e, 112)}${facts.length ? `<dl class="facts" style="grid-template-columns:62px 1fr">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}</div>
      ${covStrip(kb, f)}
      <div class="iact"><button class="btn small mine" data-act="add" data-id="${esc(id)}">${icon('plus', 13)} Add knowledge</button><button class="btn small" data-act="explore" data-id="${esc(id)}">${icon('graph', 14)} Connections</button>${e.origin === 'user' && e.eventId ? `<button class="btn small quiet" data-act="undo" data-ev="${esc(e.eventId)}">Remove</button>` : ''}</div></div>`;
    if (f.status === 'provisional' && !recs.length) b += `<p class="dim" style="font-size:12px">Name only — nothing known yet.</p>`;
    // knowledge this plant alone carries among the plants in view (Plant Library network scope)
    if (this.app.col === 'library') {
      const ids = this.scopeIds?.() || [];
      if (ids.includes(id)) { const u = A.sharedNetwork(kb, ids, { themes: Object.keys(A.THEMES) }).unique.get(id) || [];
        if (u.length) b += `<div class="isec"><h4>Only here <span class="num">${u.length}</span></h4><p style="margin:0;font-size:12px">${u.map(h => esc(h.label)).join(' · ')}</p></div>`; }
    }
    // at a glance (same values as Compare)
    const row = A.compareRow(kb, id); const own = row.own; const via = row.viaSpecies;
    const glance = [];
    const H = own.heights.length ? own.heights : []; if (H.length) glance.push(['Height', H.map(h => `${h.min === h.max ? h.max : `${h.min}–${h.max}`} m <span class="dim">${esc(srcSh(h.source))}</span>`).join('<br>')]);
    if (own.localH.length) glance.push(['Vancouver trees', own.localH.map(h => `median ${h.median} m <span class="dim">(n=${h.n}, street-tree inventory)</span>`).join('<br>')]);
    if (own.water.length) glance.push(['Water', own.water.sort((a, b) => a.order - b.order).map(w => `${esc(w.label)} <span class="dim">${w.sources} src</span>`).join(' · ')]);
    if (Object.keys(own.light).length) glance.push(['Light', Object.entries(own.light).map(([k, n]) => `${k} <span class="dim">${n} src</span>`).join(' · ')]);
    if (glance.length) b += `<div class="isec"><h4>At a glance</h4><dl class="facts">${glance.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
    // phenology, direct or via species
    const fl = A.floweringOf(kb, id);
    if (fl.rows.length) b += `<div class="isec"><h4>Flowering${fl.via ? ` <span class="mk mk-via">species</span>` : ''}</h4>${fl.rows.map(r => `<div style="display:grid;grid-template-columns:120px 1fr;gap:8px;align-items:center;padding:2px 0;cursor:pointer" data-rec="${esc(r.recordId)}">${monthStrip(r.months.reduce((a, m) => (a[m - 1] = 1, a), new Array(12).fill(0)), { w: 120, h: 8, cls: fl.via ? 'via' : r.origin === 'user' ? 'mine' : '' })}<span class="dim" style="font-size:10.5px">${esc(srcSh(r.sourceId))} · ${esc(r.placeName)}</span></div>`).join('')}</div>`;
    // designers (deduplicated quotes)
    const sv = A.survey(kb).plants.find(p => p.id === id);
    if (sv) b += `<div class="isec"><h4>Designers <span class="num">${sv.n}</span></h4>${sv.quotes.map(q => `<div class="quote" data-rec="${esc(q.records[0])}" style="cursor:pointer">${esc(q.text)}${q.records.length > 1 ? `<span class="who">${q.records.length} records, one answer</span>` : ''}</div>`).join('')}</div>`;
    // mine
    const mine = recs.filter(r => r.origin === 'user'); const excl = hist.filter(r => r._eff.why === 'excluded');
    if (mine.length || excl.length) b += `<div class="isec"><h4 style="color:var(--mine-ink)">Mine <span class="num">${mine.length}</span></h4>${mine.map(r => recItem(kb, r)).join('')}${excl.map(r => recItem(kb, r)).join('')}</div>`;
    // records grouped by kind of knowledge
    const groups = new Map(); for (const r of recs) { if (r.origin === 'user') continue; const k = A.ktypeOf(r) || 'other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const order = A.KTYPES.map(x => x[0]).concat('other');
    b += `<div class="isec"><h4>Records <span class="num">${recs.length}</span></h4>`;
    for (const k of order) { const rs = groups.get(k); if (!rs) continue; const lab = A.KTYPES.find(x => x[0] === k)?.[1] || 'Other';
      b += `<details class="details"><summary>${esc(lab)} · ${rs.length}</summary>${rs.slice(0, 40).map(r => recItem(kb, r)).join('')}</details>`; }
    if (hist.filter(r => r._eff.why === 'revised').length) b += `<details class="details"><summary>Replaced by my versions · ${hist.filter(r => r._eff.why === 'revised').length}</summary>${hist.filter(r => r._eff.why === 'revised').map(r => recItem(kb, r)).join('')}</details>`;
    b += `</div>`;
    if (sp) { const sr = A.activeOf(kb, sp); b += `<div class="isec"><h4>Species <span class="num">${sr.length}</span></h4>${sr.slice(0, 6).map(r => recItem(kb, r, { compact: false })).join('')}${sr.length > 6 ? `<button class="btn small" data-ent="${esc(sp)}">All on ${sci(kb.label(sp))}</button>` : ''}</div>`; }
    const cvs = A.cultivarsOf(kb, id); if (cvs.length) b += `<div class="isec"><h4>Cultivars <span class="num">${cvs.length}</span></h4>${cvs.map(cv => `<div><button class="btn small" data-ent="${esc(cv)}">${sci(kb.label(cv))}</button></div>`).join('')}</div>`;
    const sm = this.app.kb.speciesMap?.species.filter(r => r.entityId === id) || [];
    b += details({ id, origin: [...f.origins].map(o => A.ORIGINS[o]).join(' · '), coverage: A.COVERAGE_LEVEL[c.level], aliases: e.aliases, 'spatial model ids': sm.map(r => `${r.spatialId} (${r.status})`), layer: e.layer, legacyRef: e.legacyRef, note: e.note, typedAs: e.rawName });
    const title = e.commonName ? `${esc(e.commonName)}<span class="pl-s">${sci(e.name)}</span>` : `<span class="pl-s solo">${sci(e.name)}</span>`;
    return { kind: esc(kindTxt), title, body: b };
  }

  recipe(kb, e) {
    const c = A.recipeComposition(kb, e.id);
    const srcs = [...new Set(c.roles.flatMap(R => R.legends.map(l => kb.state.records.get(l.recordId)?.sourceRefs.map(s => s.sourceId) || []).flat()))];
    const b = `<div class="isec"><p style="margin:0 0 8px">${esc(e.note || '')}</p><dl class="facts"><dt>Version</dt><dd>${esc(e.version || '—')}</dd><dt>Members</dt><dd>${c.tally.total} taxa (${c.tally.species} species, ${c.tally.cultivars} cultivars${c.tally.placeholders ? `, ${c.tally.placeholders} placeholders` : ''})</dd><dt>Roles</dt><dd>${c.roles.map(R => `${esc(R.role)} ${R.members.length}`).join(' · ') || '—'}</dd><dt>Place</dt><dd>Detroit, Michigan (Belle Isle)</dd></dl>
      <div class="iact"><button class="btn small" data-act="recipe" data-id="${esc(e.id)}">Open composition</button><button class="btn small" data-act="explore" data-id="${esc(e.id)}">${icon('graph', 14)} Connections</button></div></div>
      <div class="isec"><h4>Sources</h4>${srcs.map(s => `<div><button class="btn small" data-src="src:${esc(s)}">${esc(trim(kb.state.sources.get(s)?.name || s, 60))}</button></div>`).join('')}</div>` + details({ id: e.id, spatialRecipeId: e.spatialRecipeId, layer: e.layer });
    return { kind: 'Planting recipe · Detroit', title: esc(e.name), body: b };
  }

  dataset(kb, e) {
    const S = kb.state; const ds = S.datasets.get(e.datasetId || e.id);
    const recs = [...S.records.values()].filter(r => (r.objects || []).includes(e.id) && r._eff.active);
    let b = `<div class="isec"><p style="margin:0 0 8px">${esc(ds?.note || e.note || '')}</p><dl class="facts"><dt>Rows</dt><dd>${ds?.rows?.length || ds?.rowsLocalOnly || (ds ? 0 : '—')}${ds?.rowsInSource ? ` of ${ds.rowsInSource} in the source` : ''}${ds && !ds.rows?.length && ds.rowsLocalOnly ? ' · kept in the local research copy' : ''}</dd><dt>Plants</dt><dd>${new Set(recs.flatMap(r => r.subjects)).size}</dd>${ds?.unmatched?.length ? `<dt>Not linked</dt><dd>${ds.unmatched.map(u => esc(u.raw || '(empty)')).join(', ')} <span class="dim">— kept in the table only</span></dd>` : ''}${e.origin === 'user' ? `<dt>Layer</dt><dd>${mark.mine('my import')}</dd>` : ''}</dl>
      <div class="iact"><button class="btn small" data-act="explore" data-id="${esc(e.id)}">${icon('graph', 14)} Connections</button>${e.id === 'ds:robertson-1929' ? '<button class="btn small" data-act="dataset">Open chart and rows</button>' : ''}${e.origin === 'user' && e.eventId ? `<button class="btn small quiet" data-act="undo" data-ev="${esc(e.eventId)}">Undo the import</button>` : ''}</div></div>`;
    b += `<div class="isec"><h4>Members <span class="num">${recs.length}</span></h4>${recs.slice(0, 40).map(r => recItem(kb, r, { subject: true, compact: true })).join('')}</div>`;
    const src = S.sources.get(ds?.sourceId); if (src) b += `<div class="isec"><h4>Source</h4><p style="margin:0">${esc(src.name)}</p>${src.licence ? `<p class="note warn">${esc(src.licence)}</p>` : ''}</div>`;
    b += details({ id: e.id, columns: ds?.columns, fileName: ds?.fileName });
    return { kind: e.type === 'list' ? 'My list' : 'Dataset', title: esc(e.name), body: b };
  }

  place(kb, e) {
    const chain = kb.placeChain(e.id).map(p => kb.label(p)).reverse();
    const recs = [...kb.state.records.values()].filter(r => r._eff.active && r.context?.place === e.id);
    const b = `<div class="isec"><p style="margin:0 0 8px">${esc(e.definition || '')}</p><dl class="facts"><dt>Within</dt><dd>${chain.map(esc).join(' › ')}</dd><dt>Records here</dt><dd>${recs.length}</dd></dl><div class="iact"><button class="btn small" data-act="explore" data-id="${esc(e.id)}">${icon('graph', 14)} Connections</button></div></div>
      <div class="isec"><h4>Recorded here <span class="num">${recs.length}</span></h4>${recs.slice(0, 25).map(r => recItem(kb, r, { subject: true, compact: true })).join('')}</div>` + details({ id: e.id, aliases: e.aliases });
    return { kind: 'Place', title: esc(e.name), body: b };
  }

  // ---------- one record: read, edit my version, leave out, restore ----------
  record(kb, id) {
    const S = kb.state; const r = S.records.get(id); if (!r) return null;
    const eff = r._eff; const pl = kb.predicates[r.predicate]?.label || r.predicate;
    const src = r.sourceRefs?.[0]; const so = src ? S.sources.get(src.sourceId) : null;
    let b = '';
    if (!eff.active) b += `<div class="note">${eff.why === 'revised' ? `Replaced by <button class="btn small mine" data-rec="${esc(eff.by)}">my version</button>` : eff.why === 'excluded' ? `Left out${eff.reason ? ` — “${esc(eff.reason)}”` : ''}` : 'Not in effect: ' + esc(eff.why)}</div>`;
    if (r.revises) { const o = S.records.get(r.revises); b += `<div class="vs"><div><h6>Preset · ${esc(srcShName(kb, o))}</h6><div class="orig" data-rec="${esc(r.revises)}" style="cursor:pointer;text-decoration:line-through;text-decoration-color:var(--ink-4)">${esc(trim(o?.statement, 220))}</div></div><div><h6 style="color:var(--mine-ink)">${DIA} My version</h6><div class="mine">${esc(r.statement)}</div></div></div>`; }
    const v = kb.formatValue(r);
    if (!r.revises) b += `<div class="isec">${v && v !== r.statement && v.length < 140 ? `<p style="margin:0 0 4px;font-weight:600">${esc(v)}</p>` : ''}<p style="margin:0">${esc(r.statement)}</p>${r.quote ? `<div class="quote">“${esc(r.quote)}”</div>` : ''}<div class="ri-m" style="margin-top:6px">${recMarks(r)}</div></div>`;
    const placeName = r.context?.place ? kb.label(r.context.place) : null;
    b += `<div class="isec"><dl class="facts">
      <dt>About</dt><dd>${r.subjects.length ? r.subjects.map(s => `<button data-ent="${esc(s)}" class="btn small" style="height:auto">${A.isPlant(S.entities.get(s)) ? sci(kb.label(s)) : esc(kb.label(s))}</button>`).join(', ') : '<span class="dim">no subject (general knowledge)</span>'}</dd>
      <dt>Kind</dt><dd>${esc(pl)} · ${esc((r.knowledgeKind || '').replace('_', ' '))}</dd>
      <dt>Source</dt><dd>${r.origin === 'user' ? mark.mine('me (this browser)') : so ? `<button class="btn small" style="height:auto;text-align:left;white-space:normal" data-src="src:${esc(src.sourceId.startsWith('survey-r') ? 'survey' : src.sourceId)}">${esc(trim(so.name || src.sourceId, 70))}</button>` : esc(src?.sourceId || '—')}${so?.url ? ` <a href="${esc(so.url)}" target="_blank" rel="noopener" title="open the source">${icon('ext', 12)}</a>` : ''}</dd>
      <dt>Place</dt><dd>${placeName ? esc(placeName) : '<span class="dim">not stated</span>'}</dd>
      ${r.context?.time?.length ? `<dt>Time</dt><dd>${esc(r.context.time.join(', ').replace(/month:(\d+)/g, (m, x) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x - 1]))}</dd>` : ''}
      <dt>Applies to</dt><dd>${esc(r.context?.text || r.context?.scope || '—')}</dd>
      <dt>Evidence</dt><dd>${evidenceLine(r, kb, this.app.kb.aiChecks[id])}</dd>
      ${r.respondsTo && !r.revises ? `<dt>Answers</dt><dd><button class="btn small" data-rec="${esc(r.respondsTo)}">preset record</button></dd>` : ''}
      ${r.why ? `<dt>Why</dt><dd>${esc(r.why)}</dd>` : ''}</dl></div>`;
    if (r.taxonMatch) b += `<p class="note">Name matched by spelling only; taxonomy not checked.</p>`;
    // actions
    const acts = [];
    if (eff.active && r.origin !== 'user') acts.push(`<button class="btn small mine" data-act="revise" data-id="${esc(id)}">Edit my version</button>`, `<button class="btn small" data-act="exclude" data-id="${esc(id)}">Leave out</button>`);
    if (eff.active && r.origin === 'user') acts.push(`<button class="btn small mine" data-act="revise" data-id="${esc(id)}">Edit</button>`, r.eventId ? `<button class="btn small" data-act="undo" data-ev="${esc(r.eventId)}">${r.revises ? 'Restore the original' : 'Remove'}</button>` : '');
    if (eff.why === 'excluded') acts.push(`<button class="btn small" data-act="include" data-id="${esc(id)}">Restore</button>`);
    if (eff.why === 'revised') acts.push(`<button class="btn small" data-act="restore-orig" data-id="${esc(id)}">Restore the original</button>`);
    if (r.datasetId === 'ds:robertson-1929') acts.push(`<button class="btn small" data-act="dataset">Open the dataset rows</button>`);
    if (this.app.layer === 'preset' && acts.length) b += `<div class="iact"><button class="btn small mine" data-act="layer">Edit in Combined</button></div>`;
    else if (acts.length) b += `<div class="iact" style="margin:0 0 6px">${acts.join('')}</div><div id="editHost"></div>`;
    const ai = this.app.kb.aiChecks[id];
    b += details({ 'record id': id, 'original id': r.legacyRef, locator: src?.locator, accessed: src?.accessed, licence: so?.licence, layer: r.layer, 'saved': r.at ? fmtTime(r.at) : null, extraction: r.extraction === 'not_run' ? 'not run (no AI is connected in this phase)' : null,
      'AI source check (not verification)': ai ? `${ai.result}${ai.risk ? ' · risk ' + ai.risk : ''} — ${trim(ai.explanation, 300)}` : null, 'row as imported': r.raw ? JSON.stringify(r.raw) : null, 'original fields': r.legacy ? JSON.stringify(r.legacy.fields).slice(0, 1200) : null });
    const subj = r.subjects.map(s => kb.label(s)).join(', ') || 'General knowledge';
    return { kind: '', title: r.subjects.length === 1 && A.isPlant(S.entities.get(r.subjects[0])) ? sci(subj) : esc(subj), body: b };
  }

  reviseForm(id) {
    const A_ = this.app; const kb = A_.kb; const r = kb.state.records.get(id); const host = this.el.querySelector('#editHost'); if (!host) return;
    const places = [...kb.state.entities.values()].filter(e => e.facet === 'place').sort((a, b) => kb.placeChain(a.id).length - kb.placeChain(b.id).length);
    const mineOwn = r.origin === 'user';
    host.innerHTML = `<div class="form" style="border-top:1px solid var(--ink);padding-top:12px;margin-top:6px">

      <label>Your version<textarea id="rvText" autofocus>${esc(mineOwn ? r.statement : '')}</textarea></label>
      <div><div class="choice" id="rvKind">${Object.entries(NOTE_KINDS).map(([k, l]) => `<button type="button" role="radio" data-k="${k}" aria-checked="${k === (mineOwn ? r.knowledgeKind : 'observation')}">${esc(l.split(' (')[0])}</button>`).join('')}</div></div>
      <label>Where<select id="rvPlace"><option value="">not stated</option>${places.map(p => `<option value="${esc(p.id)}" ${mineOwn && r.context?.place === p.id ? 'selected' : ''}>${'· '.repeat(Math.max(0, kb.placeChain(p.id).length - 1))}${esc(p.name)}</option>`).join('')}</select></label>
      <label>Why<input id="rvWhy" placeholder="three Vancouver projects, 2022–25"></label>
      <div class="iact"><button class="btn primary mine small" id="rvOk">Save</button><button class="btn small" id="rvNo">Cancel</button></div></div>`;
    let kind = mineOwn ? r.knowledgeKind : 'observation';
    host.querySelectorAll('#rvKind button').forEach(b => b.onclick = () => { kind = b.dataset.k; host.querySelectorAll('#rvKind button').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    host.querySelector('#rvNo').onclick = () => { host.innerHTML = ''; };
    host.querySelector('#rvOk').onclick = () => {
      const text = host.querySelector('#rvText').value.trim(); if (!text) { host.querySelector('#rvText').focus(); return; }
      const ev = makeRevision(kb, id, { statement: text, valueText: text, kind, place: host.querySelector('#rvPlace').value || null, why: host.querySelector('#rvWhy').value.trim() });
      if (A_.commit(ev, 'Your version is in effect')) A_.select({ kind: 'record', id: ev.record.id });
    };
    host.querySelector('#rvText').focus();
  }

  excludeForm(id) {
    const host = this.el.querySelector('#editHost'); if (!host) return;
    host.innerHTML = `<div class="form" style="border-top:1px solid var(--ink);padding-top:12px;margin-top:6px"><label>Why<input id="exWhy" placeholder="UK nursery practice; not how it behaves on the coast"></label>
      <div class="iact"><button class="btn primary small" id="exOk">Leave out</button><button class="btn small" id="exNo">Cancel</button></div></div>`;
    host.querySelector('#exOk').onclick = () => this.app.commit({ type: 'exclude', target: id, reason: host.querySelector('#exWhy').value.trim(), label: 'Left out ' + id }, 'Left out');
    host.querySelector('#exNo').onclick = () => { host.innerHTML = ''; };
    host.querySelector('#exWhy').focus();
  }

  // ---------- evidence behind a link, a cell, an attribute ----------
  evidence(kb, s) {
    const recs = s.recordIds.map(id => kb.state.records.get(id)).filter(Boolean);
    return { kind: '', title: esc(s.title), body: `${recs.map(r => recItem(kb, r, { subject: true })).join('') || '<p class="dim">No record in this layer.</p>'}` };
  }
  cell(kb, s) {
    let recs; let title;
    if (s.col.startsWith('reason:')) { const reason = s.col.slice(7); recs = A.activeOf(kb, s.entity).filter(r => A.isSurvey(r) && A.reasonOf(r) === reason); title = reason; }
    else if (s.col.startsWith('src:')) { const sid = s.col.slice(4); recs = A.activeOf(kb, s.entity).filter(r => r.sourceRefs?.[0]?.sourceId === sid); title = kb.state.sources.get(sid)?.name || sid; }
    else { recs = cellRecords(kb, s.entity, s.col); title = COLS.find(c => c[0] === s.col)?.[1] || s.col; }
    const sp = A.speciesOf(kb, s.entity);
    const own = recs.filter(r => r.subjects.includes(s.entity)); const via = recs.filter(r => !r.subjects.includes(s.entity));
    let b = recs.length ? '' : `<p class="dim" style="margin:0 0 8px;font-size:12px">Not recorded.</p>`;
    b += own.map(r => recItem(kb, r)).join('');
    if (via.length) b += `<div class="isec"><h4>Species · ${sci(kb.label(sp))} <span class="num">${via.length}</span></h4>${via.map(r => recItem(kb, r)).join('')}</div>`;
    b += `<div class="iact"><button class="btn small mine" data-act="add" data-id="${esc(s.entity)}">${icon('plus', 13)} Add knowledge</button></div>`;
    const e = kb.state.entities.get(s.entity);
    return { kind: `${esc(title)}`, title: e?.commonName ? `${esc(e.commonName)}<span class="pl-s">${sci(e.name)}</span>` : `<span class="pl-s solo">${sci(e?.name || s.entity)}</span>`, body: b };
  }
  hub(kb, s) {
    const e = kb.state.entities.get(s.id);
    const by = s.plants.map(p => ({ p, recs: A.activeOf(kb, p).filter(r => (r.concepts || []).includes(s.id)) }));
    const b = `${by.map(x => `<div class="isec"><h4><button class="btn small" data-ent="${esc(x.p)}" style="height:auto">${esc(kb.state.entities.get(x.p)?.commonName || '')} ${sci(kb.label(x.p))}</button><span class="num">${x.recs.length}</span></h4>${x.recs.map(r => recItem(kb, r, { compact: true })).join('')}</div>`).join('')}
      <div class="iact"><button class="btn small" data-act="explore" data-id="${esc(s.id)}">${icon('graph', 14)} Connections</button></div>`;
    return { kind: 'Shared attribute', title: esc(e?.name || s.id), body: b };
  }
  source(kb, id) {
    const sid = id.slice(4);
    if (sid === 'survey') { const sv = A.survey(kb); return { kind: 'Source · anonymous survey', title: 'Designer survey', body: `<dl class="facts"><dt>Respondents</dt><dd>${sv.respondents} (anonymous)</dd><dt>Statements</dt><dd>${sv.statements}</dd><dt>Plants</dt><dd>${sv.plants.length}</dd><dt>Place</dt><dd>Metro Vancouver</dd></dl><div class="iact"><button class="btn small" data-act="explore" data-id="src:survey">${icon('graph', 14)} Connections</button></div>` + details({ respondents: A.surveySources(kb).map(s => `${s.id}: ${(s.roles || []).join(', ')} · ${(s.experience || []).join(', ')}`) }) }; }
    const s = kb.state.sources.get(sid); if (!s) return null;
    const recs = [...kb.state.records.values()].filter(r => r._eff.active && r.sourceRefs?.[0]?.sourceId === sid);
    const plants = [...new Set(recs.flatMap(r => r.subjects))];
    return { kind: `Source · ${esc(s.type || '')}`, title: esc(s.name), body: `<dl class="facts"><dt>Describes</dt><dd>${esc((s.geo_specificity || '—').replace(/_/g, ' '))}</dd><dt>Records</dt><dd>${recs.length} in effect</dd><dt>Subjects</dt><dd>${plants.length}</dd>${s.url ? `<dt>Link</dt><dd><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(trim(s.url, 48))}</a></dd>` : ''}</dl>
      <div class="iact"><button class="btn small" data-act="explore" data-id="${esc(id)}">${icon('graph', 14)} Connections</button></div>
      <div class="isec" style="margin-top:10px"><h4>Subjects <span class="num">${plants.length}</span></h4>${plants.slice(0, 40).map(p => `<div><button class="btn small" data-ent="${esc(p)}">${A.isPlant(kb.state.entities.get(p)) ? sci(kb.label(p)) : esc(kb.label(p))}</button></div>`).join('')}</div>` + details({ id: sid, licence: s.licence, accessed: s.accessed, publisher: s.publisher, note: s.note }) };
  }
  me(kb) {
    const d = this.app.kb.diff();
    return { kind: '', title: 'My knowledge', body: `<dl class="facts"><dt>Added</dt><dd>${d.addedEntities.length} entities</dd><dt>Notes &amp; rows</dt><dd>${d.addedRecords.length}</dd><dt>Revised</dt><dd>${d.revised.length}</dd><dt>Left out</dt><dd>${d.excluded.length}</dd></dl><div class="iact"><button class="btn small mine" data-act="personal">Open Personal knowledge</button></div>` };
  }
}

function covStrip(kb, f) {
  const c = f.coverage;
  return `<div style="display:grid;grid-template-columns:repeat(11,1fr);gap:2px;margin-top:10px">${A.KTYPES.map(([k, l]) => { const d = c.direct[k] || 0; const v = c.via[k] || 0;
    const bg = k === 'mine' ? (d ? 'var(--mine)' : 'var(--wash-2)') : d ? 'var(--botanic)' : v ? 'transparent;box-shadow:inset 0 0 0 1px var(--botanic)' : 'var(--wash-2)';
    return `<div title="${esc(l)}: ${d}${v ? ` · species ${v}` : ''}"><div style="height:7px;background:${bg}"></div></div>`; }).join('')}</div>`;
}
function srcSh(sid) { return { rhs: 'RHS', mobot: 'MOBOT', usda_plants: 'USDA', osu: 'OSU', gpp: 'GPP', eflora: 'E-Flora', cov_trees: 'Vancouver trees', inat: 'iNaturalist', iscbc: 'ISCBC', me: 'me' }[sid] || (sid?.startsWith('survey-r') ? 'survey' : sid); }
function srcShName(kb, r) { const sid = r?.sourceRefs?.[0]?.sourceId; return sid ? (kb.state.sources.get(sid)?.name || sid).split(/[—(]/)[0].trim() : ''; }
function details(obj) {
  const rows = Object.entries(obj).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!rows.length) return '';
  return `<details class="details"><summary>Details</summary><dl class="facts" style="grid-template-columns:110px 1fr;margin-top:6px">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="${/id$|ref$|Ref$/.test(k) ? 'mono' : ''}" style="word-break:break-word">${Array.isArray(v) ? v.map(esc).join('<br>') : esc(v)}</dd>`).join('')}</dl></details>`;
}

const SRC_TYPE = { database: 'professional plant database', municipal: 'municipal data', practitioner: 'designer survey', literature: 'literature', 'spatial-model source': 'plan drawings', 'user dataset': 'your imported table' };
const AI_RESULT = { supported_by_source: 'supported', partially_supported: 'partly supported', conflicting_evidence: 'conflicting' };
/** Evidence class in words: what kind of source, who read the value, whether a person checked it — never merged into one score. */
function evidenceLine(r, kb, ai) {
  const pv = provenance(r, kb.state.sources);
  if (pv.cls === 'personal') return 'your knowledge — not externally checked';
  if (pv.cls === 'model-inference') return '<span class="mk mk-model">language-model inference</span> — no external source; not evidence';
  const parts = [esc(SRC_TYPE[pv.sourceType] || pv.sourceType || 'source')];
  if (pv.extractedBy === 'language model') parts.push('<span class="mk mk-read">value read by a language model</span>');
  else if (pv.extractedBy === 'script') parts.push('converted by a script');
  parts.push(pv.humanChecked ? 'checked by a person' : 'not checked by a person');
  if (ai) parts.push(`AI re-read the page: ${esc(AI_RESULT[ai.result] || ai.result)} <span class="dim">(not verification)</span>`);
  if (r.taxonMatch && !r.taxonMatch.checked) parts.push('name match only');
  return parts.join(' · ');
}
