// Explore: observe the real planting on the same canvas — Plan / Axo / Diagram / Performance from the dock, a month
// timeline, a short legend; numbers on demand. A problem area goes back to Compose with its selection; snapshots are
// compared with the same definitions, month, scope and knowledge version. Views never change the design.
import { esc, num, pct, download } from '../ui.js';
import { MONTHS, GROUPS } from '../knowledge.js';
import { fingerprint } from '../project.js';

const LENSES = [['planting', 'Planting'], ['performance', 'Flowering resource'], ['seasonality', 'Plants in flower'], ['adaptability', 'Light fit']];
export function gate() { return { ok: true }; }
export function enter(F) { const v = F.P.state.view.explore || 'performance'; setLens(F, v === 'planting' ? 'performance' : v); F.P.recompute(); }
function setLens(F, v) { F.P.setView({ explore: v }); if (v === 'performance') F.setMode('performance'); else if (F.mode() === 'performance' || F.mode() === 'diagram') F.setMode('plan'); F.applyPhenology(); }
export function bottom(F) {
  const b = F.P.perf && F.P.perf.byMonth[F.month()];
  const msg = b && b.placed ? `<b>${MONTHS[F.month() - 1]}</b>: ${num(b.floweringInstances)} of ${num(b.placed)} plants known in flower · ${b.components.length} resource group${b.components.length === 1 ? '' : 's'}` : '<b>Explore</b> the planting.';
  return { msg, next: { label: 'Save option', enabled: true, run: () => saveSnap(F) } };
}
export function onCanvasClick(F, x, y, sel, { shift }) { const c = F.cellAt(x, y); if (c) F.selectCells([c.id], { add: shift }); else { F.u.cells.clear(); F.render(); } }
function saveSnap(F) { const r = F.P.saveSnapshot(`Option ${String.fromCharCode(65 + F.P.snapshots().length % 26)}`); if (!r.ok) { F.toast(r.error, { err: true }); return; } const back = F.P.snapshots().find((s) => s.id === r.snapshot.id); F.toast(back && back.fingerprint === fingerprint(F.P.state.instances) ? `Saved “${r.snapshot.name}” (read back: ${back.fingerprint}).` : 'Saved, but the read-back differs — export the design to be safe.', { err: !back }); F.renderPanel(); }

export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const perf = P.perf; const m = F.month(); const b = perf && perf.byMonth[m]; const lens = st.view.explore || 'performance';
  let h = `<header class="stage-head"><p class="kicker">4 · Explore</p><h1>Observe and return</h1><p class="task">The canvas shows the placed plants. Play the months, pick a problem, go back and change it.</p></header>`;
  h += `<div class="chips lens">${LENSES.map(([k, n]) => `<button class="chip" data-lens="${k}" aria-pressed="${lens === k}">${n}</button>`).join('')}</div>`;
  if (!perf || !perf.instances) { el.innerHTML = h + '<p class="note">No plants yet: compose first.</p>'; bind(F, el); return; }
  const groups = b.groups; const grp = st.view.group || null;
  h += `<section class="blk kpi"><h2>${MONTHS[m - 1]} <span class="aside">designed cells only · ${Math.round(perf.assignedAreaM2).toLocaleString('en-US')} m² of ${Math.round(perf.totalAreaM2).toLocaleString('en-US')} m² structured</span></h2>
    <div class="kgrid"><div><b class="big">${num(b.floweringInstances)}</b><span>plants known in flower</span></div><div><b class="big">${pct(b.floweringFraction)}</b><span>of ${num(b.placed)} placed (denominator)</span></div><div><b class="big">${b.floweringPerM2}</b><span>flowering / m²</span></div><div><b class="big">${num(b.unknownInstances)}</b><span>unknown flowering (apart)</span></div></div>
    <p class="small">Presence in <b>${b.resourceCells}</b> cells · ${b.strongCells} with ≥ ${perf.thresholds.strongPerM2} / m² · resources in <b>${b.components.length}</b> connected group${b.components.length === 1 ? '' : 's'} (${b.strongComponents.length} strong)${b.isolated.length ? ` · ${b.isolated.length} isolated` : ''}</p>
    <div class="chips sm">${groups.length ? `<button class="chip" data-grp="" aria-pressed="${!grp}">all groups</button>` + groups.map((g) => `<button class="chip" data-grp="${g.group}" aria-pressed="${grp === g.group}" title="${g.species.length} species, ${g.instances} plants">${esc(g.group)} ${g.instances}</button>`).join('') : '<span class="xs dim">no documented pollinator group for the flowering plants this month</span>'}${b.groupsUnknownInstances ? ` <span class="xs dim">· ${b.groupsUnknownInstances} flowering plants with unknown groups</span>` : ''}</div>
    ${monthBars(F, perf)}
    <details><summary class="xs">Definitions</summary><ul class="xs">${Object.entries(perf.definitions).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul><p class="xs">Trait coverage of placed plants: flowering ${pct(perf.coverage.bloom)}, groups ${pct(perf.coverage.pollinators)}, light ${pct(perf.coverage.light)}; illustrative values used by ${pct(perf.coverage.illustrative)}.</p></details></section>`;
  if (F.u.cells.size > 1) h += regionTable(F);
  h += `<section class="blk"><h2>To look at <span class="aside">${perf.issues.length}</span></h2><ul class="issues">${perf.issues.slice(0, 14).map((i) => `<li class="${i.severity}${F.u.issue === i.id ? ' on' : ''}"><button class="lnk b" data-issue="${esc(i.id)}">${esc(i.title)}</button><p class="xs dim">${esc(i.detail)}</p><span class="row xs">${i.actions.map((a) => `<button class="lnk" data-act="${a}|${esc(i.id)}">${{ editMix: 'Edit the mix', reassign: 'Repaint these cells', knowledge: 'Add knowledge' }[a]}</button>`).join('')}</span></li>`).join('') || '<li class="dim small">Nothing flagged.</li>'}</ul></section>`;
  const snaps = P.snapshots();
  h += `<section class="blk"><h2>Options <span class="aside">${snaps.length}</span></h2><div class="row"><button class="btn-s" data-a="snap">Save this option</button><button class="lnk" data-a="export">Export JSON</button></div>
    ${snaps.length ? `<ul class="snaps">${snaps.map((s) => `<li><b>${esc(s.name)}</b> <span class="xs dim">${new Date(s.at).toLocaleString()} · ${num(s.totals.plants)} plants</span><span class="row xs"><button class="lnk" data-cmp="${s.id}" aria-pressed="${F.u.cmp === s.id}">compare</button><button class="lnk" data-restore="${s.id}">restore</button></span></li>`).join('')}</ul>` : '<p class="xs dim">Save an option, change the design, then compare both with the same definitions.</p>'}
    ${F.u.cmp ? compareHtml(F, snaps.find((s) => s.id === F.u.cmp)) : ''}
    <p class="xs dim">The reconstructed reference planting has no per-plant traits: it can be compared visually (Layers), not with these metrics.</p></section>`;
  el.innerHTML = h; bind(F, el);
}
function monthBars(F, perf) {
  const mx = Math.max(0.01, ...Object.values(perf.byMonth).map((b) => b.floweringPerM2 + (b.unknownInstances / Math.max(1, perf.assignedAreaM2)))); const tg = F.P.state.brief.objectives.flowering.months;
  return `<div class="bars" role="group" aria-label="Flowering plants per m² by month">${Object.values(perf.byMonth).map((b) => { const u = b.unknownInstances / Math.max(1, perf.assignedAreaM2); return `<button data-m="${b.month}" aria-pressed="${b.month === F.month()}" title="${b.label}: ${b.floweringInstances} flowering, ${b.unknownInstances} unknown" class="${tg.includes(b.month) ? 'tgt' : ''}"><span style="height:${(100 * b.floweringPerM2) / mx}%"></span><span class="u" style="height:${(100 * u) / mx}%;bottom:${(100 * b.floweringPerM2) / mx}%"></span></button>`; }).join('')}</div><div class="barlab">${MONTHS.map((x) => `<span>${x[0]}</span>`).join('')}</div>`;
}
// regions (beds) of the selection, side by side — same month, same definitions
function regionTable(F) {
  const P = F.P; const m = F.month(); const by = new Map();
  for (const id of F.u.cells) { const c = P.state.cells[id]; const pc = P.perf.perCell[id]; if (!c || !pc || pc.status !== 'planted') continue; const e = by.get(c.bedId) || { area: 0, plants: 0, fl: 0, unk: 0, presence: 0, cells: 0, groups: new Set() }; const q = pc.months[m]; e.area += c.areaM2; e.plants += pc.plants; e.fl += q.instances; e.unk += q.unknownInstances; e.presence += q.state === 'resource' ? 1 : 0; e.cells++; for (const g of q.groups) e.groups.add(g); by.set(c.bedId, e); }
  if (!by.size) return '';
  return `<section class="blk"><h2>Selected areas · ${MONTHS[m - 1]}</h2><table class="members"><tr><th>bed</th><th>m²</th><th>plants</th><th>presence</th><th>in flower</th><th>fraction</th><th>/m²</th><th>unknown</th><th>groups</th></tr>${[...by.entries()].map(([b, e]) => `<tr><td>${esc(P.bedCode(b))}</td><td class="num">${Math.round(e.area)}</td><td class="num">${e.plants}</td><td class="num">${e.presence}/${e.cells}</td><td class="num"><b>${e.fl}</b></td><td class="num">${pct(e.fl / e.plants)}</td><td class="num">${(e.fl / e.area).toFixed(2)}</td><td class="num">${e.unk}</td><td class="num">${e.groups.size}</td></tr>`).join('')}</table><p class="xs dim">Fraction = plants known in flower / placed plants of that area. Presence counts cells with ≥ 1.</p></section>`;
}
function compareHtml(F, s) {
  if (!s) return ''; const P = F.P; const m = F.month();
  const sameK = s.knowledgeVersion === F.K.version(); const other = P.perfOf(s.design); const cur = P.perf; const a = other.byMonth[m], b = cur.byMonth[m];
  const row = (k, f) => `<tr><td>${k}</td><td class="num">${f(a)}</td><td class="num">${f(b)}</td></tr>`;
  return `<div class="compare"><p class="xs">${sameK ? 'Same knowledge version.' : '<b>Knowledge changed since this option was saved</b>: both are recomputed NOW with the current knowledge, so the numbers are comparable.'} Month ${MONTHS[m - 1]}; designed cells only.</p>
    <table class="members"><tr><th></th><th>${esc(s.name)}</th><th>current</th></tr>${row('designed m²', (x) => Math.round(x.designedAreaM2))}${row('placed plants', (x) => num(x.placed))}${row('plants in flower', (x) => num(x.floweringInstances))}${row('fraction in flower', (x) => pct(x.floweringFraction))}${row('flowering / m²', (x) => x.floweringPerM2)}${row('unknown', (x) => num(x.unknownInstances))}${row('presence cells', (x) => x.resourceCells)}${row('resource groups', (x) => x.components.length)}${row('pollinator groups', (x) => x.groups.length)}</table>
    <div class="dual">${Object.keys(cur.byMonth).map((k) => { const x = other.byMonth[k].floweringPerM2, y = cur.byMonth[k].floweringPerM2; const mx = Math.max(0.01, ...Object.values(other.byMonth).map((q) => q.floweringPerM2), ...Object.values(cur.byMonth).map((q) => q.floweringPerM2)); return `<span title="${MONTHS[k - 1]}: ${x} vs ${y}"><i style="height:${(100 * x) / mx}%"></i><i class="c" style="height:${(100 * y) / mx}%"></i></span>`; }).join('')}</div><p class="xs dim">flowering / m² by month: <i class="sw a"></i> ${esc(s.name)} · <i class="sw c"></i> current</p></div>`;
}
function bind(F, el) {
  const P = F.P; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  el.querySelectorAll('[data-lens]').forEach((b) => (b.onclick = () => { setLens(F, b.dataset.lens); F.render(); }));
  el.querySelectorAll('[data-grp]').forEach((b) => (b.onclick = () => { P.setView({ group: b.dataset.grp || null }); F.render(); }));
  el.querySelectorAll('.bars [data-m]').forEach((b) => (b.onclick = () => F.setMonth(+b.dataset.m)));
  el.querySelectorAll('[data-issue]').forEach((b) => (b.onclick = () => { const i = P.perf.issues.find((x) => x.id === b.dataset.issue); F.u.issue = F.u.issue === i.id ? null : i.id; if (i.month) P.setView({ month: i.month }); if (i.cells.length) F.focusCells(i.cells); F.render(); }));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => { const [act, id] = b.dataset.act.split('|'); const i = P.perf.issues.find((x) => x.id === id); act2(F, act, i); }));
  a('snap', () => saveSnap(F)); a('export', () => download(`${P.state.name.replace(/\W+/g, '-')}.gp.json`, P.exportData()));
  el.querySelectorAll('[data-cmp]').forEach((b) => (b.onclick = () => { F.u.cmp = F.u.cmp === b.dataset.cmp ? null : b.dataset.cmp; F.renderPanel(); }));
  el.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = () => { const r = P.restoreSnapshot(b.dataset.restore); if (r.ok === false) F.toast(r.error, { err: true }); else F.toast('Option restored (undo returns to the previous design).'); }));
}
// a problem → back to Compose with its selection (camera, month, timeline kept)
export function act2(F, act, i) {
  const P = F.P;
  if (act === 'knowledge') { F.openKnowledge({ plants: i.species || [], issue: i.id }); return; }
  F.u.cells = new Set(i.cells.slice(0, 60)); F.go('compose');
  if (act === 'editMix') { const mid = i.mixId || (i.cells[0] && P.state.assignments[i.cells[0]] && P.state.assignments[i.cells[0]].mixId) || (P.state.mixes[0] && P.state.mixes[0].id); if (mid) { F.u.editor = { mixId: mid, draft: structuredClone(P.mix(mid)), changes: [] }; F.renderPanel(); } }
  else F.toast(`${i.cells.length} cell${i.cells.length === 1 ? '' : 's'} selected: paint over them, fill them or Auto Compose.`);
}
export function inspector(F) {
  const P = F.P; const ids = [...F.u.cells]; if (ids.length !== 1) return null; const c = P.state.cells[ids[0]]; const pc = P.perf && P.perf.perCell[ids[0]]; if (!c || !pc) return null; const m = F.month();
  if (pc.status !== 'planted') return `<h3>${esc(c.label)}</h3><p class="small dim">Not planted.</p><button class="btn-s" data-i="compose">Plant it in Compose</button>`;
  const q = pc.months[m];
  return `<h3>${esc(c.label)} <span class="aside">${c.areaM2} m² · ${MONTHS[m - 1]}</span></h3><p class="small"><b>${q.instances}</b> of ${pc.plants} plants known in flower (${pct(q.fraction)}) · ${q.perM2} / m² · ${q.unknownInstances} unknown</p><p class="xs">${q.species.map((s) => esc(F.K.traits(s).name)).join(', ') || '—'}</p><p class="xs dim">groups: ${q.groups.join(', ') || 'none documented'} · light: ${pc.adaptability.fit.match} match / ${pc.adaptability.fit.conflict} conflict / ${pc.adaptability.fit.unknown} unknown</p><div class="row"><button class="btn-s" data-i="compose">Change it in Compose</button></div>`;
}
export function bindInspector(F, el) { const x = el.querySelector('[data-i=compose]'); if (x) x.onclick = () => { F.go('compose'); }; }
export { GROUPS };
