// Knowledge workspace (V3.1). One data model (ActiveKnowledge + project records + the notebook), several readings chosen
// by the question — not one forced three-column graph:
//   Plants        the project's real plants first: a comparable trait table (height, spread, light, moisture, flowering,
//                 groups, roles here, placed count) with the source of every value; a plant opens its profile.
//   Seasons       flowering calendar (plants × months, like the course's “season of bloom” chart): known months drawn,
//                 unknown rows hatched, sources marked.
//   Communities   Planting Systems (course slides P34 / P41) → their functional roles → the project's mixes and the plants
//                 that fill each role (a role is a relation inside a mix, not a species label).
//   Relations     graphs only where a relation really exists (focus a node, read an edge's evidence):
//                 pollinator groups (documented association), light / moisture requirement → what is known on this site,
//                 and the planting-db spatial-function records — Metro Vancouver base knowledge, labelled as another
//                 region and never shown as this Detroit project's knowledge.
//   Notebook      personal records (the same database), project records with edit.
// Adding knowledge: preview first (metrics month by month and how each mix using the plant fits the scope's beds, before →
// after), apply writes a project record (undoable); placed plants never move.
import { esc } from './ui.js';
import { MONTHS, GROUPS } from './knowledge.js';
import { ROLE_DEF, SYSTEMS } from './mix.js';
import { KnowledgeView as RelView, LENSES, TYPES, parseForm } from './knet.js';
import { mixFitAt } from './brush.js';

const VIEWS = [['plants', 'Plants'], ['seasons', 'Seasons'], ['communities', 'Communities'], ['relations', 'Relations'], ['notebook', 'Notebook']];
const REL = [['ecology', 'Pollinator groups'], ['environment', 'Light and moisture'], ['spatial', 'Spatial function']];
const SRC = { illustrative: ['illus', 'illustrative · not verified'], project: ['proj', 'this project'], personal: ['mine', 'my knowledge'], foundation: ['found', 'knowledge base'], site: ['found', 'site list'] };
const tagOf = (src) => (src ? `<span class="tag ${SRC[src] ? SRC[src][0] : ''}" title="${esc(SRC[src] ? SRC[src][1] : src)}">${esc(src === 'illustrative' ? 'illus.' : src === 'foundation' ? 'base' : src)}</span>` : '');

export class KnowledgeView {
  constructor(F, el) {
    this.F = F; this.el = el; this.view = 'plants'; this.scope = 'project'; this.q = ''; this.sel = null; this.rel = 'ecology'; this.regionOK = false;
    this.R = new RelView(F, document.createElement('div')); this.R.render = () => this.render();
  }
  open(focus) {
    this.el.hidden = false; this.from = this.F.stage();
    if (focus && focus.plants && focus.plants.length) { this.sel = focus.plants[0]; this.view = 'plants'; this.scope = 'project'; }
    else if (focus && focus.mix) { this.scope = 'mix'; }
    this.R.loadSeed().then(() => { if (this.view === 'relations') this.render(); }); this.render();
    setTimeout(() => { const s = this.el.querySelector('.k-search'); if (s && !this.sel) s.focus(); }, 30);
  }
  close() { if (this.el.hidden) return; this.el.hidden = true; this.F.render(); if (this.changed) { this.changed = false; this.F.toast('Back in the design. Your knowledge changes are in the metrics and in the mix fit; placed plants did not move.'); } }

  // ---------------------------------------------------------------- data in scope
  projectPlants() { const P = this.F.P; const s = new Map(); for (const m of P.state.mixes) for (const q of m.members) s.set(q.plantId, s.get(q.plantId) || 0); for (const i of Object.values(P.state.instances)) for (const p of i.plants) s.set(p.plantId, (s.get(p.plantId) || 0) + 1); return s; }
  ids() {
    const F = this.F, P = F.P; let ids;
    if (this.scope === 'mix') { const m = P.mix(P.state.view.selectedMix) || P.state.mixes[0]; ids = m ? [...new Set(m.members.map((q) => q.plantId))] : []; }
    else if (this.scope === 'project') ids = [...this.projectPlants().keys()];
    else ids = F.K.catalogue().map((s) => s.id);
    const q = this.q.trim().toLowerCase();
    if (q) ids = ids.filter((id) => { const t = F.K.traits(id); const hay = [t.name, t.cultivar || '', id, t.plantType || '', t.light.value ? t.light.value.join(' ') : '', t.pollinators.value ? t.pollinators.value.join(' ') : '', ...this.rolesOf(id).map((r) => r.role + ' ' + r.mix)].join(' ').toLowerCase(); return hay.includes(q); });
    return ids;
  }
  rolesOf(id) { const out = []; for (const m of this.F.P.state.mixes) for (const L of m.layers) for (const q of L.members) if (q.plantId === id) out.push({ mix: m.name, mixId: m.id, color: m.color, layer: L.name, slot: L.slot, role: ROLE_DEF[q.role] ? ROLE_DEF[q.role].name : q.role, share: L.basis === 'area' ? q.share : q.proportion, basis: L.basis }); return out; }

  // ---------------------------------------------------------------- render
  render() {
    if (this.el.hidden) return; const F = this.F;
    const scopeLabel = { project: 'This project', mix: 'Selected mix', all: 'All Detroit plants' };
    let h = `<header class="k-top"><button class="lnk" data-k="back">← Design</button>
      <input class="k-search" placeholder="Find a plant, a role, a trait" value="${esc(this.q)}" aria-label="Search">
      <span class="seg sm" role="radiogroup" aria-label="Which plants">${Object.entries(scopeLabel).map(([k, n]) => `<button data-scope="${k}" aria-pressed="${this.scope === k}">${n}</button>`).join('')}</span>
      <nav class="seg k-views" role="tablist">${VIEWS.map(([k, n]) => `<button role="tab" data-view="${k}" aria-selected="${this.view === k}">${n}</button>`).join('')}</nav></header>`;
    const body = this.view === 'plants' ? this.plantsView() : this.view === 'seasons' ? this.seasonsView() : this.view === 'communities' ? this.communitiesView() : this.view === 'relations' ? this.relationsView() : this.notebookView();
    const side = this.sel && this.view !== 'notebook' ? this.profile(this.sel) : '';
    h += `<div class="k-body${side ? ' with-side' : ''}"><div class="k-main">${body}</div>${side ? `<aside class="k-side">${side}</aside>` : ''}</div>`;
    this.el.innerHTML = h; this.bind();
  }
  empty(msg) { return `<div class="k-empty"><p>${msg}</p>${this.scope !== 'all' ? '<button class="btn-s" data-scope="all">Show all Detroit plants</button>' : ''}</div>`; }
  plantsView() {
    const F = this.F, K = F.K; const ids = this.ids(); const counts = this.projectPlants();
    if (!ids.length) return this.empty(this.q ? `No plant matches “${esc(this.q)}” here.` : this.scope === 'project' ? 'This design has no mix or plant yet.' : 'This mix has no members.');
    const rows = ids.map((id) => ({ id, t: K.traits(id), n: counts.get(id) || 0 })).sort((a, b) => b.n - a.n || a.t.name.localeCompare(b.t.name)).slice(0, 300);
    const cellv = (x, f) => (x.status === 'unknown' ? '<span class="unk">unknown</span>' : `${f(x.value)} ${tagOf(x.source)}${x.status === 'conflict' ? ' <span class="tag warn" title="sources disagree — open the plant">conflict</span>' : ''}`);
    return `<table class="k-table"><thead><tr><th>Plant</th><th>Form</th><th class="num">H · W m</th><th>Light</th><th>Moisture</th><th>Flowering</th><th>Groups</th><th>Role here</th>${this.scope === 'all' ? '' : '<th class="num">Placed</th>'}</tr></thead><tbody>${rows.map(({ id, t, n }) => `<tr data-p="${esc(id)}" class="${this.sel === id ? 'on' : ''}" tabindex="0">
      <td><i>${esc(t.name)}</i>${t.cultivar ? ` <span class="cv">‘${esc(t.cultivar)}’</span>` : ''}</td><td class="xs">${esc(t.plantType || '—')}</td><td class="num xs" title="${esc(t.sizeBasis)}">${t.heightM.toFixed(1)} · ${t.spreadM.toFixed(1)}</td>
      <td>${cellv(t.light, (v) => v.map((x) => `<span class="lchip l-${x}">${x === 'part' ? 'part' : x}</span>`).join(''))}</td><td class="xs">${cellv(t.moisture, (v) => esc(v.join(', ')))}</td>
      <td>${t.bloom.status === 'unknown' ? '<span class="mcal unk" title="flowering unknown"></span>' : `<span class="mcal">${MONTHS.map((_, i) => `<i class="${t.bloom.value.includes(i + 1) ? 'on' : ''}"></i>`).join('')}</span> ${tagOf(t.bloom.source)}`}</td>
      <td class="xs">${t.pollinators.status === 'unknown' ? (t.windPollinated === true ? 'wind' : '<span class="unk">unknown</span>') : esc(t.pollinators.value.join(', '))}</td>
      <td class="xs">${this.rolesOf(id).slice(0, 2).map((r) => `<span class="rchip" style="--mc:${esc(r.color)}">${esc(r.role)}</span>`).join(' ') || '<span class="dim">—</span>'}</td>${this.scope === 'all' ? '' : `<td class="num">${n ? n.toLocaleString('en-US') : '—'}</td>`}</tr>`).join('')}</tbody></table>
      <p class="xs dim k-foot">${rows.length} plant${rows.length === 1 ? '' : 's'} · height and width are nominal display sizes, not records · <span class="tag illus">illus.</span> = illustrative teaching layer (switch it off in Define → Brief and sources)</p>`;
  }
  seasonsView() {
    const F = this.F, K = F.K, P = F.P; const ids = this.ids(); if (!ids.length) return this.empty('No plants here.');
    const counts = this.projectPlants(); const tm = P.state.brief.objectives.flowering.on ? P.state.brief.objectives.flowering.months : [];
    const rows = ids.map((id) => ({ id, t: K.traits(id), n: counts.get(id) || 0 })).sort((a, b) => { const fa = a.t.bloom.status === 'unknown' ? 99 : Math.min(...a.t.bloom.value), fb = b.t.bloom.status === 'unknown' ? 99 : Math.min(...b.t.bloom.value); return fa - fb || b.n - a.n; });
    const known = rows.filter((r) => r.t.bloom.status !== 'unknown').length;
    let h = `<div class="k-cal"><div class="k-cal-h"><span></span>${MONTHS.map((m, i) => `<span class="${tm.includes(i + 1) ? 'tgt' : ''}">${m}</span>`).join('')}</div>`;
    for (const { id, t, n } of rows.slice(0, 160)) { const sp = F.store.getObject(id); const col = (sp && (sp.displayFlower || sp.displayLeaf)) || '#C56B33';
      h += `<div class="k-cal-r${this.sel === id ? ' on' : ''}" data-p="${esc(id)}" tabindex="0"><span class="nm"><i>${esc(t.name)}</i>${t.cultivar ? ` ‘${esc(t.cultivar)}’` : ''} ${tagOf(t.bloom.source)}${n && this.scope !== 'all' ? ` <span class="mono xs dim">${n}</span>` : ''}</span>${t.bloom.status === 'unknown' ? '<span class="unkrow">flowering unknown</span>' : MONTHS.map((_, i) => `<i style="${t.bloom.value.includes(i + 1) ? `background:${esc(col)}` : ''}"></i>`).join('')}</div>`; }
    return h + `</div><p class="xs dim k-foot">${known} of ${rows.length} with known flowering months · shaded months = the brief · a hatched row is unknown, not “no flowers”</p>`;
  }
  communitiesView() {
    const F = this.F, P = F.P, K = F.K; const mixes = this.scope === 'mix' ? [P.mix(P.state.view.selectedMix) || P.state.mixes[0]].filter(Boolean) : P.state.mixes;
    let h = '<div class="k-sys">';
    for (const S of Object.values(SYSTEMS)) {
      const mine = mixes.filter((m) => m.system === S.id);
      h += `<section class="k-sys-col${mine.length ? '' : ' off'}"><header><b>${esc(S.name)}</b><span class="xs dim">slides ${esc(S.slides)}</span></header>`;
      for (const L of S.layers) {
        h += `<div class="k-role"><span class="ln">${esc(L.name)}</span><span class="xs dim">${L.roles.map((r) => esc(ROLE_DEF[r].name)).join(' · ')}</span>`;
        for (const m of mine) { const ML = m.layers.find((x) => x.slot === L.slot && x.members.some((q) => L.roles.includes(q.role))) || m.layers.find((x) => x.id === L.id); if (!ML) { h += `<p class="xs unk">${esc(m.name)}: not filled</p>`; continue; } const key = ML.basis === 'area' ? 'share' : 'proportion';
          h += `<div class="k-comp" style="--mc:${esc(m.color)}"><span class="mn">${esc(m.name)}</span><span class="cbar">${ML.members.map((q) => { const sp = F.store.getObject(q.plantId); return `<i data-p="${esc(q.plantId)}" style="flex:${(q[key] || 0).toFixed(3)};background:${esc((sp && (sp.displayFlower || sp.displayLeaf)) || '#8C9C82')}" title="${esc(K.traits(q.plantId).name)} · ${esc(ROLE_DEF[q.role] ? ROLE_DEF[q.role].name : q.role)} · ${Math.round((q[key] || 0) * 100)} %"></i>`; }).join('')}</span>
            <ul class="xs">${ML.members.slice().sort((a, b) => (b[key] || 0) - (a[key] || 0)).map((q) => `<li data-p="${esc(q.plantId)}"><i>${esc(K.traits(q.plantId).name)}</i> <span class="mono">${Math.round((q[key] || 0) * 100)} %</span></li>`).join('')}</ul></div>`; }
        h += '</div>';
      }
      if (!mine.length) h += `<p class="xs dim">No mix of this system in ${this.scope === 'mix' ? 'the selected mix' : 'this design'}.</p>`;
      h += '</section>';
    }
    return h + '</div><p class="xs dim k-foot">Systems and role names: course slides P34 (planting layers by functional roles) and P41 (blocks · emergents · ephemerals). Shares are the recipe’s; a role belongs to the plant inside that mix only.</p>';
  }
  relationsView() {
    const R = this.R; R.lens = this.rel; R.scope = this.scope === 'mix' ? 'mix' : this.scope === 'all' ? 'all' : 'project'; R.q = this.q; if (this.sel !== this._relSel) { this._relSel = this.sel; R.focus = this.sel ? { id: this.sel } : null; } // a newly selected plant focuses the graph; a clicked node keeps its own focus
    this.relTab ||= 'graph';
    let h = `<div class="k-lens">${REL.map(([k, n]) => `<button class="chip" data-rel="${k}" aria-pressed="${this.rel === k}">${n}</button>`).join('')}<span class="seg sm k-reltab">${[['graph', 'Graph'], ['matrix', 'Matrix'], ['table', 'Table']].map(([k, n]) => `<button data-reltab="${k}" aria-pressed="${this.relTab === k}">${n}</button>`).join('')}</span></div>`;
    if (this.rel === 'spatial' && !this.regionOK) return h + `<div class="k-empty"><p>No spatial-function records for ${this.scope === 'all' ? 'the Detroit plants' : 'this project’s plants'}. The knowledge base holds spatial functions for Metro Vancouver plants only — another region, other species.</p><button class="btn-s" data-k="region">Show the Metro Vancouver base records</button></div>`;
    const g = R.graph(); R._g = g;
    if (R.focus && !g.E.some((e) => e.a === R.focus.id || e.b === R.focus.id)) R.focus = null; // a plant with no relation in this lens does not empty the view
    if (!g.X.length) return h + `<div class="k-empty"><p>${esc(g.note || 'No relation recorded for these plants.')}</p></div>`;
    const banner = this.rel === 'spatial' ? '<p class="k-banner">Metro Vancouver base knowledge — not Detroit records, not used by this design.</p>' : '';
    h += banner + `<div class="k-graph">${this.relTab === 'matrix' ? R.matrix(g) : this.relTab === 'table' ? R.table(g) : R.network(g, LENSES[this.rel])}</div><footer class="k-legend">${Object.values(TYPES).map((t) => `<span><svg width="30" height="8"><path d="M1 4H29" stroke="${t.col}" stroke-width="2" stroke-dasharray="${t.dash}"/></svg>${t.name}</span>`).join('')}</footer>`;
    if (R.edge != null && g.E[R.edge]) { const e = g.E[R.edge]; h += `<div class="k-edge"><b>Relation</b> ${esc(e.ev)} <span class="xs dim">· ${esc(e.src || '—')} · ${esc(TYPES[e.t].name)}</span>${e.alt && e.alt.length ? `<p class="xs warn">Other sources: ${e.alt.map((a) => `${esc(a.scope)} → ${esc(JSON.stringify(a.value))}`).join('; ')}</p>` : ''}</div>`; }
    return h;
  }
  notebookView() {
    const P = this.F.P; const recs = P.state.knowledge.records;
    return `<div class="k-nb"><section><h3>Project records <span class="mono xs">${recs.length}</span></h3>${recs.length ? `<ul class="k-recs">${recs.map((r) => `<li><b><i>${esc(this.F.K.traits(r.plantId).name)}</i></b> ${esc(r.attr)} = ${esc(JSON.stringify(r.value))} <span class="dim">“${esc(r.original)}”</span> <span class="xs dim">${new Date(r.at).toLocaleDateString()}</span> <button class="lnk" data-p="${esc(r.plantId)}">open</button></li>`).join('')}</ul>` : '<p class="xs dim">None yet — open a plant and add what you know.</p>'}</section><iframe title="Knowledge notebook (personal records)" src="knowledge/index.html"></iframe></div>`;
  }
  // ---------------------------------------------------------------- plant profile (side)
  profile(id) {
    const F = this.F, P = F.P, K = F.K; const t = K.traits(id); const roles = this.rolesOf(id); const placed = Object.values(P.state.instances).reduce((a, i) => a + i.plants.filter((p) => p.plantId === id).length, 0);
    const row = (lab, x, f) => `<dt>${lab}</dt><dd>${x.status === 'unknown' ? '<span class="unk">unknown</span>' : `${f(x.value)} ${tagOf(x.source)}`}${x.status === 'conflict' ? ` <span class="tag warn">conflict</span><div class="xs">${x.alternatives.map((a) => `${esc(a.scope)}: ${esc(JSON.stringify(a.value))} <button class="lnk" data-choose="${esc(id)}|${a.scope}|${lab === 'Flowering' ? 'bloom' : lab.toLowerCase()}">use</button>`).join(' · ')}</div>` : ''}</dd>`;
    let h = `<header><h3><i>${esc(t.name)}</i>${t.cultivar ? ` ‘${esc(t.cultivar)}’` : ''}</h3><button class="x lnk" data-k="unsel" aria-label="Close">×</button></header>
      <p class="xs dim">${esc(t.plantType || 'plant')} · ${t.heightM.toFixed(1)} m × ${t.spreadM.toFixed(1)} m (display size) · ${placed ? `${placed.toLocaleString('en-US')} placed` : 'not placed'}</p>
      <dl class="kv">${row('Flowering', t.bloom, (v) => `<span class="mcal">${MONTHS.map((_, i) => `<i class="${v.includes(i + 1) ? 'on' : ''}"></i>`).join('')}</span>`)}${row('Light', t.light, (v) => v.map((x) => `<span class="lchip l-${x}">${x}</span>`).join(''))}${row('Moisture', t.moisture, (v) => esc(v.join(', ')))}${row('Pollinators', t.pollinators, (v) => esc(v.join(', ')))}</dl>
      ${t.visitors ? `<p class="xs dim">Insect visitors recorded by Robertson (1929, Illinois): evidence of visitors, not of Detroit groups.</p>` : ''}`;
    h += `<h4>Role in this design</h4>${roles.length ? `<ul class="xs k-roles">${roles.map((r) => `<li><span class="sw" style="background:${esc(r.color)}"></span>${esc(r.mix)} · ${esc(r.layer)} · <b>${esc(r.role)}</b> <span class="mono">${Math.round(r.share * 100)} %${r.basis === 'area' ? ' of the area' : ''}</span></li>`).join('')}</ul>` : '<p class="xs dim">Not in a mix of this design.</p>'}`;
    const fit = this.fitHere(id); if (fit) h += `<h4>Light here</h4><p class="xs">${fit}</p>`;
    h += `<details class="kadd"${this.R.pending ? ' open' : ''}><summary class="btn-s">Add or correct</summary>${this.R.addForm(id).replace(/^<details[^>]*><summary[^>]*>[^<]*<\/summary>/, '').replace(/<\/details>$/, '')}</details>`;
    const recs = P.state.knowledge.records.filter((r) => r.plantId === id);
    if (recs.length) h += `<h4>Project records</h4><ul class="xs">${recs.map((r) => `<li>${esc(r.attr)} = ${esc(JSON.stringify(r.value))} <span class="dim">“${esc(r.original)}”</span> <button class="lnk" data-editrec="${r.id}">edit</button></li>`).join('')}</ul>`;
    if (this.R.pending && this.R.pending.plantId === id) h += this.pendingHtml();
    return h;
  }
  // how the plant's recorded light meets the scope's beds: assumption > crown proxy > unknown (counts of beds)
  fitHere(id) {
    const F = this.F, P = F.P; const t = F.K.traits(id); const beds = F.scopeBeds(); if (!beds.length) return '';
    if (t.light.status === 'unknown') return 'Unknown: no light record for this plant.';
    const by = { match: [], conflict: [], unknown: [] };
    for (const b of beds) { const a = P.lightAssumption(b); const crown = P.allCells().some((c) => c.bedId === b && c.conditions && c.conditions.canopy && c.conditions.canopy.fraction >= 0.5); const v = a || (crown ? 'shade' : null); const f = !v ? 'unknown' : t.light.value.includes(v) ? 'match' : 'conflict'; by[f].push(P.bedCode(b) + (a ? '' : v ? '*' : '')); }
    return `${by.match.length ? `fits ${esc(by.match.join(', '))}` : ''}${by.conflict.length ? `${by.match.length ? ' · ' : ''}<span class="warn">conflict ${esc(by.conflict.join(', '))}</span>` : ''}${by.unknown.length ? `${by.match.length || by.conflict.length ? ' · ' : ''}<span class="dim">unknown in ${by.unknown.length} bed${by.unknown.length === 1 ? '' : 's'} (no assumption, no crown)</span>` : ''}${[...by.match, ...by.conflict].some((x) => x.endsWith('*')) ? ' <span class="dim">· * crown proxy</span>' : ''}`;
  }
  // preview = the V2 metric preview + how each mix using the plant fits the scope's beds, before → after
  previewWithFit(plantId, claims, original, scope, editId) {
    const F = this.F, P = F.P; const mixes = P.state.mixes.filter((m) => m.members.some((q) => q.plantId === plantId)); const beds = F.scopeBeds();
    const fitCount = () => mixes.map((m) => { const c = { match: 0, partial: 0, conflict: 0, unknown: 0 }; for (const b of beds) { const a = P.lightAssumption(b); const v = a || (P.allCells().some((x) => x.bedId === b && x.conditions && x.conditions.canopy && x.conditions.canopy.fraction >= 0.5) ? 'shade' : null); c[mixFitAt(F.K, m, { value: v }).cat]++; } return c; });
    const before = fitCount();
    const recs = P.state.knowledge.records; const saved = recs.slice(); for (const c of claims) recs.push({ id: 'tmp', kind: 'fact', plantId, attr: c.attr, value: c.value, original, scope, source: 'project' }); F.K.invalidate('preview-fit'); const after = fitCount(); recs.length = 0; recs.push(...saved); F.K.invalidate('preview-fit-end');
    this.R.preview(plantId, claims, original, scope, editId);
    const p = this.R.pending; if (!p) return;
    const fmt = (c) => `${c.match} fit · ${c.partial} partly · ${c.conflict} conflict · ${c.unknown} unknown`;
    mixes.forEach((m, i) => { if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) p.lines.splice(p.lines.length - 1, 0, `${m.name} over the ${beds.length} beds: ${fmt(before[i])} → ${fmt(after[i])}`); });
    if (mixes.length && !mixes.some((m, i) => JSON.stringify(before[i]) !== JSON.stringify(after[i]))) p.lines.splice(p.lines.length - 1, 0, `Mix fit over the ${beds.length} beds unchanged (light of these beds is ${beds.some((b) => P.lightAssumption(b)) ? 'partly assumed' : 'unknown unless under a crown'}).`);
    this.render();
  }
  pendingHtml() { const p = this.R.pending; return `<section class="note k-pending"><h4>Before you apply</h4><p class="xs">${esc(p.summary)}</p><ul class="xs">${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="row"><button class="btn-p" data-k="apply">Apply to this project</button><button class="lnk" data-k="cancel">Cancel</button></div></section>`; }

  bind() {
    const el = this.el, F = this.F, R = this.R; const k = (s, fn) => el.querySelectorAll(`[data-k=${s}]`).forEach((x) => (x.onclick = fn));
    k('back', () => F.setWorkspace('design')); k('unsel', () => { this.sel = null; R.pending = null; this.render(); }); k('region', () => { this.regionOK = true; this.render(); });
    el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { this.view = b.dataset.view; this.render(); }));
    el.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => { this.scope = b.dataset.scope; this.render(); }));
    el.querySelectorAll('[data-rel]').forEach((b) => (b.onclick = () => { this.rel = b.dataset.rel; R.focus = null; R.edge = null; this.render(); }));
    el.querySelectorAll('[data-reltab]').forEach((b) => (b.onclick = () => { this.relTab = b.dataset.reltab; this.render(); }));
    const s = el.querySelector('.k-search'); if (s) s.oninput = () => { clearTimeout(this._q); this._q = setTimeout(() => { this.q = s.value; this.render(); const s2 = el.querySelector('.k-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 220); };
    el.querySelectorAll('[data-p]').forEach((r) => { const go = () => { this.sel = this.sel === r.dataset.p && this.view !== 'notebook' ? null : r.dataset.p; if (this.view === 'notebook') this.view = 'plants'; R.pending = null; R.focus = this.sel ? { id: this.sel } : null; this.render(); }; r.onclick = (e) => { e.stopPropagation(); go(); }; r.onkeydown = (e) => { if (e.key === 'Enter') go(); }; });
    // relation graph: node focus and edge evidence (V4.3 interaction kept)
    el.querySelectorAll('.k-graph [data-n]').forEach((n) => { n.onclick = () => { const id = n.dataset.n; R.focus = R.focus && R.focus.id === id ? null : { id }; R.edge = null; if (F.store.getObject(id) && id.startsWith('sp.')) this.sel = R.focus ? id : this.sel; this.render(); }; });
    el.querySelectorAll('.k-graph [data-e]').forEach((p) => (p.onclick = (e) => { e.stopPropagation(); R.edge = +p.dataset.e; this.render(); }));
    el.querySelectorAll('[data-choose]').forEach((b) => (b.onclick = () => { const [id, src, attr] = b.dataset.choose.split('|'); F.P.chooseSource(id, attr, src); F.K.invalidate('choose'); this.changed = true; this.render(); }));
    el.querySelectorAll('form[data-add]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(f); const claims = parseForm(fd); if (!claims.length) { F.toast('Nothing to add: give flowering months, groups or light.', { err: true }); return; } this.previewWithFit(f.dataset.add, claims, fd.get('original') || claims.map((c) => `${c.attr}: ${c.value}`).join('; '), fd.get('scope') || 'project', this._editId || null); this._editId = null; }));
    el.querySelectorAll('[data-editrec]').forEach((b) => (b.onclick = () => { const r = F.P.state.knowledge.records.find((q) => q.id === b.dataset.editrec); if (!r) return; this._editId = r.id; const d = el.querySelector('details.kadd'); if (d) { d.open = true; const f = d.querySelector('form'); if (r.attr === 'bloom') f.bloom.value = r.value.join(' '); if (r.attr === 'pollinators') f.pollinators.value = r.value.join(', '); if (r.attr === 'light') f.light.value = r.value.join(','); f.original.value = r.original || ''; } }));
    k('apply', () => { const p = R.pending; R.pending = null; if (p.editId) F.P.editProjectKnowledge(p.editId, { value: p.claims[0].value, attr: p.claims[0].attr, original: p.original }); else F.P.addProjectKnowledge({ plantId: p.plantId, claims: p.claims, original: p.original, scope: p.scope, label: `knowledge: ${F.K.traits(p.plantId).name}` }); F.K.invalidate('project'); F._fit = null; this.changed = true; this.lastApplied = { plantId: p.plantId, lines: p.lines, at: new Date().toISOString() }; F.toast('Applied to this project: metrics and mix fit recomputed (undo in the design reverts it).'); this.render(); });
    k('cancel', () => { R.pending = null; this.render(); });
  }
}
export { GROUPS };
