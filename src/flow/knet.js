// Knowledge workspace (parallel to the design, same page, same data). The V4.3 classified network is back:
//   X · Plants  →  Z · lens categories  →  Y · attributes / conditions
// with four relationship LENSES, each built only from real relations / records (no edge without a relation):
//   Spatial function       seed relations plant —suited_for→ spatial function —requires_trait→ trait (planting-db KG)
//   Community role         plant —role in mix (this project)→ role —belongs to→ Planting System (template)
//   Ecological association plant —documented group (flowering plants)→ pollinator group —flowering season→ season (derived)
//   Environment            plant —recorded light / moisture→ requirement —matches→ known site condition (crown proxy;
//                          moisture: no site data)
// Line types = provenance: source record · derived/inferred · candidate · project/personal · illustrative · conflict.
// Network, Matrix and Table share the selection and the data. Records added here go to the project (or the notebook for
// personal knowledge); their effect on mixes and performance is previewed and applied only on confirm.
import { esc } from './ui.js';
import { MONTHS, GROUPS } from './knowledge.js';
import { ROLE_DEF, SYSTEMS } from './mix.js';

const LENSES = {
  spatial: { name: 'Spatial function', z: 'Z · Spatial functions', zs: 'what a planting does in space', y: 'Y · Attributes', ys: 'traits a function requires' },
  role: { name: 'Community role', z: 'Z · Roles in your mixes', zs: 'the relation of a plant inside one mix', y: 'Y · Planting systems', ys: 'the system that names the role' },
  ecology: { name: 'Ecological association', z: 'Z · Pollinator groups', zs: 'documented association, not visitation', y: 'Y · Flowering season', ys: 'when the associated plants flower' },
  environment: { name: 'Environment', z: 'Z · Requirements', zs: 'recorded light and moisture needs', y: 'Y · Site conditions', ys: 'what is known on this site' },
};
const TYPES = { source: { name: 'source record', dash: '', col: '#3B5538' }, derived: { name: 'derived from records', dash: '6 4', col: '#B7894D' }, candidate: { name: 'candidate', dash: '2 3', col: '#8C9C82' }, project: { name: 'project / personal', dash: '', col: '#B04F36' }, illustrative: { name: 'illustrative (not verified)', dash: '1 3', col: '#7A5E92' }, conflict: { name: 'conflict between sources', dash: '7 3 1 3', col: '#9A3F26' } };
const typeOf = (src) => (src === 'illustrative' ? 'illustrative' : src === 'project' || src === 'personal' ? 'project' : src === 'derived' ? 'derived' : src === 'candidate' ? 'candidate' : 'source');
const SEASON = { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] };

export class KnowledgeView {
  constructor(F, el) { this.F = F; this.el = el; this.tab = 'network'; this.lens = 'environment'; this.scope = 'project'; this.q = ''; this.focus = null; this.edge = null; this.seed = null; }
  async loadSeed() { if (this.seed !== null) return this.seed; try { this.seed = await fetch('knowledge/data/seed.json').then((r) => (r.ok ? r.json() : false)); } catch { this.seed = false; } return this.seed; }
  open(focus) {
    this.el.hidden = false; this.prev = { stage: this.F.stage(), cells: [...this.F.u.cells], mode: this.F.mode() };
    if (focus && focus.plants && focus.plants.length) { this.focus = { kind: 'x', id: focus.plants[0] }; this.lens = 'ecology'; this.scope = 'project'; }
    this.loadSeed().then(() => this.render()); this.render();
  }
  close() { if (this.el.hidden) return; this.el.hidden = true; this.F.render(); if (this.changed) { this.changed = false; this.F.toast('Back in the design: the knowledge changes you confirmed are in the metrics; mixes and plants are unchanged.'); } }
  // ---------------------------------------------------------------- data: the graph of the active lens
  plants() {
    const F = this.F, P = F.P; let ids;
    if (this.scope === 'mix') { const m = P.mix(P.state.view.selectedMix) || P.state.mixes[0]; ids = m ? m.members.map((q) => q.plantId) : []; }
    else if (this.scope === 'project') { const s = new Set(); for (const m of P.state.mixes) for (const q of m.members) s.add(q.plantId); for (const i of Object.values(P.state.instances)) for (const p of i.plants) s.add(p.plantId); ids = [...s]; }
    else ids = F.K.catalogue().map((s) => s.id);
    const q = this.q.trim().toLowerCase(); if (q) ids = ids.filter((id) => (F.K.traits(id).name + ' ' + (F.K.traits(id).cultivar || '') + ' ' + id).toLowerCase().includes(q));
    return ids;
  }
  graph() {
    const F = this.F, K = F.K, P = F.P; const X = new Map(), Z = new Map(), Y = new Map(); const E = [];
    const nm = (id) => { const t = K.traits(id); return t.name + (t.cultivar ? ` '${t.cultivar}'` : ''); };
    const addX = (id, sub) => { if (!X.has(id)) X.set(id, { id, label: nm(id), sub }); };
    if (this.lens === 'spatial') {
      const S = this.seed; if (!S) return { X: [], Z: [], Y: [], E: [], note: 'The knowledge base is loading (or unavailable on this host).' };
      const ent = new Map(S.entities.map((e) => [e.id, e])); const q = this.q.trim().toLowerCase();
      for (const r of S.relations) { if (r.predicate !== 'suited_for' || !String(r.to).startsWith('spatial:')) continue; const e = ent.get(r.from); const label = e ? e.name : r.from; if (q && !(label + r.from).toLowerCase().includes(q)) continue; if (!X.has(r.from)) X.set(r.from, { id: r.from, label: e && e.scientificName ? e.scientificName : label, sub: e ? (e.growthForm || e.type || '') : '' }); const z = ent.get(r.to); if (!Z.has(r.to)) Z.set(r.to, { id: r.to, label: z ? z.name : r.to }); E.push({ a: r.from, b: r.to, t: r.formation === 'documented' ? 'source' : r.formation === 'derived' ? 'derived' : 'candidate', ev: `${r.predicate} (${r.formation})${r.rule ? ' · rule ' + r.rule : ''}${r.supportingRecordIds && r.supportingRecordIds.length ? ' · records ' + r.supportingRecordIds.slice(0, 3).join(', ') : ''}`, src: 'Planting Intelligence knowledge base (planting-db KG, seed.json)' }); }
      for (const r of S.relations) { if (r.predicate !== 'requires_trait' || !Z.has(r.from)) continue; const y = ent.get(r.to); if (!Y.has(r.to)) Y.set(r.to, { id: r.to, label: y ? y.name : r.to, sub: y && y.facet ? y.facet.replace(/_/g, ' ') : '' }); E.push({ a: r.from, b: r.to, t: 'source', zy: true, ev: `function requires ${y ? y.name : r.to} (${r.formation})`, src: 'planting-db ontology' }); }
      return { X: [...X.values()], Z: [...Z.values()], Y: [...Y.values()], E, note: `${X.size} plants with recorded spatial functions (Metro Vancouver records). Detroit plants have no spatial-function records yet: nothing is drawn for them.` };
    }
    const ids = this.plants().slice(0, this.scope === 'all' ? 60 : 120);
    if (this.lens === 'role') {
      for (const m of P.state.mixes) for (const L of m.layers) for (const q of L.members) { if (!ids.includes(q.plantId)) continue; addX(q.plantId, K.traits(q.plantId).plantType || ''); const zid = 'role:' + q.role; if (!Z.has(zid)) Z.set(zid, { id: zid, label: ROLE_DEF[q.role] ? ROLE_DEF[q.role].name : q.role, sub: L.slot }); E.push({ a: q.plantId, b: zid, t: m.origin === 'reuse' ? 'source' : m.origin === 'rules' ? 'derived' : 'project', ev: `${m.name} v${m.version} · layer ${L.name} · ${L.basis === 'area' ? Math.round(q.share * 100) + ' % of the area' : Math.round(q.proportion * 100) + ' % of the layer'}`, src: m.basis || m.origin, mix: m.id }); }
      for (const z of Z.values()) { const role = z.id.slice(5); for (const S of Object.values(SYSTEMS)) if (S.layers.some((L) => L.roles.includes(role))) { const yid = 'sys:' + S.id; if (!Y.has(yid)) Y.set(yid, { id: yid, label: S.name, sub: 'slides ' + S.slides }); E.push({ a: z.id, b: yid, t: 'source', zy: true, ev: `${S.name} names the role “${z.label}”`, src: `course slides ${S.slides}` }); } }
      return { X: [...X.values()], Z: [...Z.values()], Y: [...Y.values()], E, note: 'A role holds inside one mix and system — not a global label of the species.' };
    }
    if (this.lens === 'ecology') {
      for (const id of ids) { const t = K.traits(id); if (t.bloom.status === 'unknown' && t.pollinators.status === 'unknown') continue; addX(id, t.bloom.status !== 'unknown' ? 'fl. ' + t.bloom.value.map((m) => MONTHS[m - 1][0]).join('') : 'flowering ?');
        if (t.pollinators.status !== 'unknown') for (const g of t.pollinators.value) { const zid = 'grp:' + g; if (!Z.has(zid)) Z.set(zid, { id: zid, label: g }); E.push({ a: id, b: zid, t: t.pollinators.status === 'conflict' ? 'conflict' : typeOf(t.pollinators.source), ev: (t.pollinators.evidence[0] && t.pollinators.evidence[0].statement) || `${g} (${t.pollinators.source})`, src: t.pollinators.source, alt: t.pollinators.alternatives }); } }
      for (const z of Z.values()) { const g = z.id.slice(4); for (const [s, ms] of Object.entries(SEASON)) { const k = E.filter((e) => e.b === z.id && K.traits(e.a).bloom.status !== 'unknown' && K.traits(e.a).bloom.value.some((m) => ms.includes(m))).length; if (!k) continue; const yid = 'season:' + s; if (!Y.has(yid)) Y.set(yid, { id: yid, label: s, sub: ms.map((m) => MONTHS[m - 1]).join(' ') }); E.push({ a: z.id, b: yid, t: 'derived', zy: true, ev: `${k} associated plant${k === 1 ? '' : 's'} flower in ${s} (derived from their flowering records)`, src: 'derived' }); } }
      return { X: [...X.values()], Z: [...Z.values()], Y: [...Y.values()], E, note: `${ids.length - X.size} of ${ids.length} plants have neither flowering nor groups recorded: not drawn (unknown, not absent).` };
    }
    // environment
    for (const id of ids) { const t = K.traits(id); let any = false;
      if (t.light.status !== 'unknown') for (const v of t.light.value) { any = true; const zid = 'light:' + v; if (!Z.has(zid)) Z.set(zid, { id: zid, label: { sun: 'Sun', part: 'Part shade', shade: 'Shade' }[v] || v, sub: 'light' }); E.push({ a: id, b: zid, t: t.light.status === 'conflict' ? 'conflict' : typeOf(t.light.source), ev: (t.light.evidence[0] && t.light.evidence[0].statement) || t.light.source, src: t.light.source, alt: t.light.alternatives }); }
      if (t.moisture.status !== 'unknown') for (const v of t.moisture.value) { any = true; const zid = 'moist:' + v; if (!Z.has(zid)) Z.set(zid, { id: zid, label: v + ' soil', sub: 'moisture' }); E.push({ a: id, b: zid, t: t.moisture.status === 'conflict' ? 'conflict' : typeOf(t.moisture.source), ev: (t.moisture.evidence[0] && t.moisture.evidence[0].statement) || t.moisture.source, src: t.moisture.source }); }
      if (any) addX(id, t.plantType || ''); }
    const Ysite = { 'site:open': ['Open (no crown above)', 'NAIP crowns'], 'site:crown': ['Under a crown (probable shade)', 'inference from aerial imagery'], 'site:moist': ['Soil moisture', 'no site data — unknown'] };
    for (const z of Z.values()) { const k = z.id.split(':')[1]; const to = k === 'sun' ? ['site:open'] : k === 'shade' ? ['site:crown'] : k === 'part' ? ['site:open', 'site:crown'] : ['site:moist']; for (const yid of to) { if (!Y.has(yid)) Y.set(yid, { id: yid, label: Ysite[yid][0], sub: Ysite[yid][1] }); E.push({ a: z.id, b: yid, t: yid === 'site:moist' ? 'candidate' : 'derived', zy: true, ev: yid === 'site:moist' ? 'cannot be matched: the site has no moisture data' : `${z.label} matches ${Ysite[yid][0].toLowerCase()} (rule of the fill engine)`, src: 'rule' }); } }
    return { X: [...X.values()], Z: [...Z.values()], Y: [...Y.values()], E, note: `${ids.length - X.size} of ${ids.length} plants have no recorded light or moisture: not drawn (unknown). Requirement ≠ site condition: the right column is what is known here.` };
  }
  // ---------------------------------------------------------------- render
  render() {
    if (this.el.hidden) return; const L = LENSES[this.lens]; const g = this.graph(); this._g = g;
    let h = `<header class="k-top"><button class="lnk" data-k="back">← Back to the design</button><h1>Knowledge</h1>
      <div class="seg" role="tablist">${['network', 'matrix', 'table', 'notebook'].map((t) => `<button role="tab" data-tab="${t}" aria-selected="${this.tab === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <input class="k-search" placeholder="Search a plant, a group, a trait" value="${esc(this.q)}" aria-label="Search"><span class="seg sm">${[['project', 'This project'], ['mix', 'Selected mix'], ['all', 'All plants']].map(([k, n]) => `<button data-scope="${k}" aria-pressed="${this.scope === k}">${n}</button>`).join('')}</span></header>`;
    if (this.tab === 'notebook') { h += `<div class="k-nb"><p class="xs dim">The knowledge notebook (records, sources, personal notes) — the same records the lenses read. Personal records you add there appear here when you come back.</p><iframe title="Knowledge notebook" src="knowledge/index.html"></iframe></div>`; this.el.innerHTML = h; this.bind(); return; }
    h += `<div class="k-lens">${Object.entries(LENSES).map(([k, v]) => `<button class="chip" data-lens="${k}" aria-pressed="${this.lens === k}">${v.name}</button>`).join('')}<span class="xs dim">${esc(g.note || '')}</span></div>`;
    h += `<div class="k-body"><div class="k-main">${this.tab === 'network' ? this.network(g, L) : this.tab === 'matrix' ? this.matrix(g) : this.table(g)}</div><aside class="k-side">${this.side(g)}</aside></div>`;
    h += `<footer class="k-legend">${Object.values(TYPES).map((t) => `<span><svg width="30" height="8"><path d="M1 4H29" stroke="${t.col}" stroke-width="2" stroke-dasharray="${t.dash}"/></svg>${t.name}</span>`).join('')}</footer>`;
    this.el.innerHTML = h; this.bind();
  }
  network(g, L) {
    const W = 1100, rowH = 30; const n = Math.max(g.X.length, g.Z.length * 1.6, g.Y.length, 6); const H = Math.min(2400, 90 + n * rowH);
    const col = (list, x) => { const step = (H - 90) / Math.max(1, list.length); const m = new Map(); list.forEach((v, i) => m.set(v.id, { ...v, x, y: 80 + step * (i + 0.5) })); return m; };
    const X = col(g.X, 300), Z = col(g.Z, 560), Y = col(g.Y, 800); const pos = (id) => X.get(id) || Z.get(id) || Y.get(id);
    const f = this.focus; const near = new Set(); if (f) { near.add(f.id); for (const e of g.E) { if (e.a === f.id) near.add(e.b); if (e.b === f.id) near.add(e.a); } for (const e of g.E) if (e.zy && near.has(e.a) && (X.has(f.id) || Z.has(f.id))) near.add(e.b); }
    const dim = (id) => f && !near.has(id);
    let s = `<svg class="k-net" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L.name)} network"><text x="300" y="34" class="hd" text-anchor="middle">X · Plants</text><text x="300" y="52" class="sh" text-anchor="middle">species, with their growth form</text><text x="560" y="34" class="hd" text-anchor="middle">${esc(L.z)}</text><text x="560" y="52" class="sh" text-anchor="middle">${esc(L.zs)}</text><text x="800" y="34" class="hd" text-anchor="start">${esc(L.y)}</text><text x="800" y="52" class="sh" text-anchor="start">${esc(L.ys)}</text>`;
    g.E.forEach((e, i) => { const a = pos(e.a), b = pos(e.b); if (!a || !b) return; const t = TYPES[e.t]; const on = !f || (near.has(e.a) && near.has(e.b)); const mx = (a.x + b.x) / 2; s += `<path class="e${on ? '' : ' dim'}${this.edge === i ? ' sel' : ''}" data-e="${i}" d="M${a.x + 8} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${b.x - 8} ${b.y}" stroke="${t.col}" stroke-dasharray="${t.dash}"/>`; });
    for (const [m, anchor, dx] of [[X, 'end', -14], [Z, 'middle', 0], [Y, 'start', 14]]) for (const v of m.values()) { const d = dim(v.id); s += `<g class="n${d ? ' dim' : ''}${f && f.id === v.id ? ' foc' : ''}" data-n="${esc(v.id)}" tabindex="0"><circle cx="${v.x}" cy="${v.y}" r="${m === Z ? 9 : 6}"/><text x="${v.x + dx}" y="${m === Z ? v.y + 22 : v.y - 1}" text-anchor="${anchor}" class="${m === X ? 'sci' : ''}">${esc(v.label)}</text>${v.sub ? `<text x="${v.x + dx}" y="${m === Z ? v.y + 34 : v.y + 11}" text-anchor="${anchor}" class="sub">${esc(v.sub)}</text>` : ''}<title>${esc(v.label)}${v.sub ? ' · ' + esc(v.sub) : ''} — ${g.E.filter((e) => e.a === v.id || e.b === v.id).length} relations</title></g>`; }
    return s + '</svg>';
  }
  matrix(g) {
    if (!g.X.length) return '<p class="dim">No relations in this lens for these plants.</p>';
    const cell = (x, z) => { const e = g.E.find((q) => q.a === x && q.b === z); return e ? `<td data-e="${g.E.indexOf(e)}" title="${esc(e.ev)}"><i style="background:${TYPES[e.t].col}" class="${e.t}"></i></td>` : '<td></td>'; };
    return `<table class="k-mx"><tr><th></th>${g.Z.map((z) => `<th><span>${esc(z.label)}</span></th>`).join('')}</tr>${g.X.map((x) => `<tr class="${this.focus && this.focus.id === x.id ? 'foc' : ''}"><th data-n="${esc(x.id)}" class="sci">${esc(x.label)}</th>${g.Z.map((z) => cell(x.id, z.id)).join('')}</tr>`).join('')}</table>`;
  }
  table(g) {
    const lab = (id) => (g.X.find((v) => v.id === id) || g.Z.find((v) => v.id === id) || g.Y.find((v) => v.id === id) || { label: id }).label;
    const rows = g.E.filter((e) => !this.focus || e.a === this.focus.id || e.b === this.focus.id);
    return `<table class="members k-tb"><tr><th>from</th><th>to</th><th>type</th><th>evidence</th></tr>${rows.slice(0, 400).map((e) => `<tr data-e="${g.E.indexOf(e)}"><td>${esc(lab(e.a))}</td><td>${esc(lab(e.b))}</td><td><span class="ln" style="border-color:${TYPES[e.t].col}"></span>${esc(TYPES[e.t].name)}</td><td class="xs">${esc(e.ev)}</td></tr>`).join('')}</table>`;
  }
  side(g) {
    const F = this.F; let h = '';
    if (this.edge != null && g.E[this.edge]) { const e = g.E[this.edge]; h += `<section class="blk"><h3>Relation</h3><p class="small">${esc(e.ev)}</p><p class="xs dim">source: ${esc(e.src || '—')} · ${esc(TYPES[e.t].name)}</p>${e.alt && e.alt.length ? `<p class="xs warn">Other sources say: ${e.alt.map((a) => `${esc(a.scope)} → ${esc(JSON.stringify(a.value))}`).join('; ')}</p>` : ''}</section>`; }
    const fid = this.focus && this.focus.id; const t = fid && (F.store.getObject(fid) || F.P.state.plants.some((p) => p.id === fid)) ? F.K.traits(fid) : null;
    if (t) {
      const uses = F.P.state.mixes.filter((m) => m.members.some((q) => q.plantId === fid)); const inst = Object.values(F.P.state.instances).reduce((a, i) => a + i.plants.filter((p) => p.plantId === fid).length, 0);
      h += `<section class="blk"><h3 class="sci">${esc(t.name)}${t.cultivar ? ` '${esc(t.cultivar)}'` : ''}</h3><p class="xs dim">${uses.length} mix${uses.length === 1 ? '' : 'es'} · ${inst} placed plants</p><dl class="kv">${['bloom', 'pollinators', 'light', 'moisture'].map((a) => `<dt>${a === 'bloom' ? 'flowering' : a}</dt><dd>${t[a].status === 'unknown' ? '<span class="dim">unknown</span>' : esc(a === 'bloom' ? t[a].value.map((m) => MONTHS[m - 1]).join(' ') : t[a].value.join(', '))} ${t[a].source ? `<span class="tag ${t[a].source === 'illustrative' ? 'illus' : t[a].source === 'project' ? 'proj' : 'found'}">${esc(t[a].source)}</span>` : ''}${t[a].status === 'conflict' ? ' <span class="tag warn">conflict</span>' : ''}</dd>`).join('')}</dl>`;
      h += this.addForm(fid) + '</section>';
      const recs = F.P.state.knowledge.records.filter((r) => r.plantId === fid);
      if (recs.length) h += `<section class="blk"><h3>Project records</h3><ul class="xs">${recs.map((r) => `<li>${esc(r.attr)} = ${esc(JSON.stringify(r.value))} <span class="dim">“${esc(r.original)}”</span> <button class="lnk" data-editrec="${r.id}">edit</button></li>`).join('')}</ul></section>`;
    } else if (!h) h = `<section class="blk"><p class="small">Select a node to focus it; a line shows its evidence. Add knowledge from a plant.</p><p class="xs dim">Personal knowledge can be empty — the design works with the foundation, the site list and the illustrative layer (switchable in Define).</p></section>`;
    if (this.pending) h += this.pendingHtml();
    return h;
  }
  addForm(fid) {
    return `<details class="kadd" ${this.pending ? '' : ''}><summary class="btn-s">Add / correct knowledge</summary><form data-add="${esc(fid)}"><label>Flowering months <input name="bloom" placeholder="e.g. 5-7 or May June"></label><label>Pollinator groups <input name="pollinators" placeholder="${GROUPS.slice(0, 3).join(', ')}"></label><label>Light <select name="light"><option value="">—</option><option>sun</option><option>part</option><option>shade</option><option value="sun,part">sun, part</option><option value="part,shade">part, shade</option></select></label><label>Your words (kept as written) <input name="original" placeholder="where it comes from"></label><label>Scope <select name="scope"><option value="project">this project</option></select></label><button class="btn-p">Preview the effect</button></form></details>`;
  }
  pendingHtml() {
    const p = this.pending; return `<section class="blk note"><h3>Effect before you apply</h3><p class="small">${esc(p.summary)}</p><ul class="xs">${p.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul><div class="row"><button class="btn-p" data-k="apply">Apply to the design</button><button class="lnk" data-k="cancel">Cancel</button></div></section>`;
  }
  // preview a project record: performance and mix profiles before / after (nothing is written)
  preview(plantId, claims, original, scope, editId = null) {
    const F = this.F, P = F.P; const recs = P.state.knowledge.records; const before = P.perf; const saved = recs.slice();
    if (editId) { const i = recs.findIndex((r) => r.id === editId); if (i >= 0) recs.splice(i, 1); }
    for (const c of claims) recs.push({ id: 'tmp', kind: 'fact', plantId, attr: c.attr, value: c.value, original, scope, source: 'project' });
    F.K.invalidate('preview'); const after = P.recompute();
    recs.length = 0; recs.push(...saved); F.K.invalidate('preview-end'); P.recompute();
    const mixes = P.state.mixes.filter((m) => m.members.some((q) => q.plantId === plantId)); const n = Object.values(P.state.instances).reduce((a, i) => a + i.plants.filter((p) => p.plantId === plantId).length, 0);
    const lines = []; const tm = P.state.brief.objectives.flowering.months;
    for (const m of tm) { const a = before.byMonth[m], b = after.byMonth[m]; if (a.floweringInstances !== b.floweringInstances || a.unknownInstances !== b.unknownInstances) lines.push(`${MONTHS[m - 1]}: plants in flower ${a.floweringInstances} → ${b.floweringInstances}, unknown ${a.unknownInstances} → ${b.unknownInstances}`); }
    if (!lines.length) lines.push('No metric changes for the brief months.');
    lines.push('Plant positions and mixes stay as they are; Rules suggestions will use the new value.');
    this.pending = { plantId, claims, original, scope, editId, summary: `${claims.map((c) => `${c.attr} = ${JSON.stringify(c.value)}`).join(', ')} for ${F.K.traits(plantId).name}: used by ${mixes.length} mix${mixes.length === 1 ? '' : 'es'} and ${n} placed plants.`, lines };
    this.render();
  }
  bind() {
    const el = this.el; const F = this.F; const k = (s, fn) => el.querySelectorAll(`[data-k=${s}]`).forEach((x) => (x.onclick = fn));
    k('back', () => F.setWorkspace('design'));
    el.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { this.tab = b.dataset.tab; this.render(); }));
    el.querySelectorAll('[data-lens]').forEach((b) => (b.onclick = () => { this.lens = b.dataset.lens; this.focus = null; this.edge = null; this.render(); }));
    el.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => { this.scope = b.dataset.scope; this.render(); }));
    const s = el.querySelector('.k-search'); if (s) s.oninput = () => { clearTimeout(this._q); this._q = setTimeout(() => { this.q = s.value; this.render(); const s2 = el.querySelector('.k-search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); };
    el.querySelectorAll('[data-n]').forEach((n) => { n.onclick = () => { this.focus = this.focus && this.focus.id === n.dataset.n ? null : { id: n.dataset.n }; this.edge = null; this.render(); }; n.onkeydown = (e) => { if (e.key === 'Enter') n.onclick(); }; });
    el.querySelectorAll('[data-e]').forEach((p) => (p.onclick = (e) => { e.stopPropagation(); this.edge = +p.dataset.e; this.render(); }));
    el.querySelectorAll('form[data-add]').forEach((f) => (f.onsubmit = (e) => { e.preventDefault(); const fd = new FormData(f); const claims = parseForm(fd); if (!claims.length) { F.toast('Nothing to add: give flowering months, groups or light.', { err: true }); return; } this.preview(f.dataset.add, claims, fd.get('original') || claims.map((c) => `${c.attr}: ${c.value}`).join('; '), fd.get('scope') || 'project', this._editId || null); this._editId = null; }));
    el.querySelectorAll('[data-editrec]').forEach((b) => (b.onclick = () => { const r = F.P.state.knowledge.records.find((q) => q.id === b.dataset.editrec); if (!r) return; this._editId = r.id; const d = el.querySelector('details.kadd'); if (d) { d.open = true; const f = d.querySelector('form'); if (r.attr === 'bloom') f.bloom.value = r.value.join(' '); if (r.attr === 'pollinators') f.pollinators.value = r.value.join(', '); if (r.attr === 'light') f.light.value = r.value.join(','); f.original.value = r.original || ''; } }));
    k('apply', () => { const p = this.pending; this.pending = null; if (p.editId) F.P.editProjectKnowledge(p.editId, { value: p.claims[0].value, attr: p.claims[0].attr, original: p.original }); else F.P.addProjectKnowledge({ plantId: p.plantId, claims: p.claims, original: p.original, scope: p.scope, label: `knowledge: ${F.K.traits(p.plantId).name}` }); F.K.invalidate('project'); this.changed = true; F.toast('Applied: metrics recomputed (undo in the design reverts it).'); this.render(); });
    k('cancel', () => { this.pending = null; this.render(); });
  }
}
function parseForm(fd) {
  const out = []; const b = String(fd.get('bloom') || '').trim(); const MO = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (b) { const ms = new Set(); const rng = b.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/); if (rng) for (let m = +rng[1]; m <= +rng[2]; m++) ms.add(m); for (const w of b.toLowerCase().split(/[\s,]+/)) { const i = MO.indexOf(w.slice(0, 3)); if (i >= 0) ms.add(i + 1); else if (/^\d{1,2}$/.test(w) && +w >= 1 && +w <= 12) ms.add(+w); } if (ms.size) out.push({ attr: 'bloom', value: [...ms].sort((x, y) => x - y) }); }
  const g = String(fd.get('pollinators') || '').toLowerCase().split(/[\s,]+/).filter((x) => GROUPS.includes(x)); if (g.length) out.push({ attr: 'pollinators', value: g });
  const l = String(fd.get('light') || '').split(',').filter(Boolean); if (l.length) out.push({ attr: 'light', value: l });
  return out;
}
