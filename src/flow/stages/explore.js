// Explore: the same design, read through proxies derived from the placed plants (pollinator resources by month,
// seasonality, adaptability). Issues lead straight back to the cell or mix to change. Save, compare, export.
import { esc, plantName, pct, download, monthStrip } from '../ui.js';
import { MONTHS } from '../knowledge.js';
import { summarize } from '../performance.js';

const VIEWS = [['planting', 'Planting'], ['pollinator', 'Pollinators'], ['seasonality', 'Seasonality'], ['adaptability', 'Adaptability']];
export function gate() { return { ok: true }; }
export function enter(F) { if (!F.P.state.view.explore) F.P.setView({ explore: 'pollinator' }); F.P.recompute(); }
export function bottom(F) {
  const P = F.P; const t = P.totals(); const perf = P.perf; const m = F.month(); const b = perf && perf.byMonth[m];
  const msg = `<b>${t.plants.toLocaleString('en-US')} plants</b>, ${t.species} species in ${t.assigned} cells` + (b && P.state.view.explore !== 'planting' ? ` · ${MONTHS[m - 1]}: ${b.resourceCells} resource cell${b.resourceCells === 1 ? '' : 's'}, ${b.groups.length} pollinator group${b.groups.length === 1 ? '' : 's'}` : '') + (P.storage.ok ? '' : ' · <span style="color:var(--f-warn)">not saved</span>');
  return { msg, next: { label: 'Save snapshot', enabled: t.plants > 0, reason: 'Nothing to save yet.', run: () => saveSnap(F) } };
}
export function onCanvasClick(F, x, y, sel, { shift }) { const c = F.cellAt(x, y); if (c) F.selectCells([c.id], { add: shift }); else { F.u.cells.clear(); F.render(); } }
function saveSnap(F) {
  const name = (F.panel.querySelector('#snapname') || {}).value || `${F.P.state.name} — ${new Date().toLocaleString()}`;
  const r = F.P.saveSnapshot(name); if (!r.ok) { F.toast(r.error, { err: true }); return; }
  const back = F.P.snapshots().find((s) => s.id === r.snapshot.id); // read back from storage before saying it is saved
  F.toast(back ? `Snapshot “${back.name}” saved in this browser (${back.totals.plants.toLocaleString('en-US')} plants).` : 'Snapshot could not be read back — not saved.', { err: !back }); F.renderPanel();
}

export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const perf = P.perf; const view = st.view.explore || 'planting'; const m = F.month(); const t = P.totals();
  let h = `<h1>Explore</h1><p class="task">Read the design you made. Months and views change what you see, never the design.</p>`;
  h += `<div class="seg2" role="radiogroup" aria-label="View">${VIEWS.map(([k, n]) => `<button role="radio" aria-checked="${view === k}" aria-pressed="${view === k}" data-v="${k}">${n}</button>`).join('')}</div>`;
  if (!perf || !t.plants) { h += `<div class="note">No plants yet. Go back to Compose and assign a mix.</div>`; el.innerHTML = h; bind(F, el); return; }
  const b = perf.byMonth[m]; const cov = perf.coverage;
  if (view === 'planting') {
    const top = Object.entries(t.bySpecies).sort((a, c) => c[1] - a[1]);
    h += `<h2>Planting <span class="aside">${t.plants.toLocaleString('en-US')} plants</span></h2><table class="members"><tr><th>plant</th><th class="num">count</th><th>flowering</th></tr>${top.slice(0, 14).map(([id, n]) => { const tr = F.K.traits(id); return `<tr><td>${plantName(F.store, id, { short: true })}</td><td class="num">${n}</td><td>${monthStrip(tr.bloom.value, { unknown: tr.bloom.status === 'unknown' })}</td></tr>`; }).join('')}</table>${top.length > 14 ? `<p class="xs dim">+ ${top.length - 14} more species (all in the export)</p>` : ''}`;
    h += `<p class="small dim">Mixes: ${st.mixes.filter((x) => P.usesOf(x.id).length).map((x) => `${esc(x.name)} (${P.usesOf(x.id).length})`).join(', ')}.</p>`;
  } else {
    // month bars: share of assigned area with a known flower resource (uncertain hatched on top)
    h += `<h2>${view === 'pollinator' ? 'Flower resources by month' : view === 'seasonality' ? 'Flowering by month' : 'Suitability'} <span class="aside">${MONTHS[m - 1]}</span></h2>`;
    if (view !== 'adaptability') {
      h += `<div class="bars" role="radiogroup" aria-label="Month">${Object.values(perf.byMonth).map((x) => { const r = x.resourceShare || 0; const uc = x.uncertainCells / Math.max(1, t.assigned); return `<button role="radio" aria-pressed="${x.month === m}" aria-checked="${x.month === m}" data-m="${x.month}" class="${x.uncertainCells ? 'unc' : ''}" title="${x.label}: ${x.resourceCells} resource cells (${pct(x.resourceShare)} of planted area), ${x.uncertainCells} uncertain"><span style="height:${Math.round(r * 100)}%"></span>${x.uncertainCells ? `<span class="u" style="bottom:${Math.round(r * 100)}%;height:${Math.round(Math.min(1 - r, uc) * 100)}%"></span>` : ''}</button>`; }).join('')}</div><div class="barlab">${MONTHS.map((x) => `<span>${x[0]}</span>`).join('')}</div>`;
      h += `<p class="xs dim">Bar = share of the planted cell area with ≥ 1 placed plant known to flower that month (wind-pollinated grasses excluded); hatched = flowering unknown. Not nectar quantity.</p>`;
    }
    if (view === 'pollinator') {
      h += `<ul class="legend"><li><span class="sw" style="background:#3E6638"></span>known flower resource — darker = more documented pollinator groups</li><li><span class="sw hatch"></span>uncertain: flowering of some plants unknown</li><li><span class="sw" style="background:#ECE7DE"></span>planted, no known flowering this month</li><li><span class="sw" style="background:#fff;border:1.4px solid #252A25"></span>— links between neighbouring resource cells (dashed: across a path ≤ 3 m); ring = isolated</li></ul>`;
      h += `<dl class="kv"><dt>${MONTHS[m - 1]}</dt><dd>${b.resourceCells} of ${t.assigned} planted cells (${pct(b.resourceShare)} of ${Math.round(b.assignedAreaM2)} m²)</dd><dt>Groups</dt><dd>${b.groups.length ? b.groups.map((g) => `${esc(g.group)} <span class="dim">(${g.cells})</span>`).join(', ') : '<span class="dim">none documented</span>'}</dd><dt>Continuity</dt><dd>${b.components.length} connected group${b.components.length === 1 ? '' : 's'} of cells${b.largestComponentShare != null ? `, largest ${pct(b.largestComponentShare)} of resource area` : ''}${b.isolated.length ? `, ${b.isolated.length} isolated` : ''}</dd></dl>`;
    } else if (view === 'seasonality') {
      const fl = new Map(); for (const [id, n] of Object.entries(t.bySpecies)) { const f = F.K.floweringIn(id, m); fl.set(f, (fl.get(f) || 0) + n); }
      h += `<ul class="legend"><li><span class="sw" style="background:#C9A0D0"></span>in flower (plant's display colour): ${(fl.get('yes') || 0).toLocaleString('en-US')} plants</li><li><span class="sw" style="background:rgba(120,132,110,.55)"></span>not in flower: ${(fl.get('no') || 0).toLocaleString('en-US')}</li><li><span class="sw" style="background:#fff;border:1px dashed #252A25"></span>unknown: ${(fl.get('unknown') || 0).toLocaleString('en-US')}</li></ul><p class="xs dim">From known flowering months only; no growth simulation. Zoom in to see each plant.</p>`;
    } else {
      const cnt = { match: 0, conflict: 0, uncertain: 0 }; for (const pc of Object.values(perf.perCell)) if (pc.adaptability) cnt[pc.adaptability.status]++;
      h += `<ul class="legend"><li><span class="sw" style="background:#8FB07F"></span>known match (light): ${cnt.match} cells</li><li><span class="sw" style="background:#B66D48"></span>known conflict: ${cnt.conflict} cells</li><li><span class="sw hatch"></span>uncertain (missing plant or site data): ${cnt.uncertain} cells</li></ul><p class="xs dim">Light: plant records vs an existing crown above (shade is an inference). Soil moisture has no site data, so moisture fit is never claimed.</p>`;
    }
  }
  h += `<p class="xs dim">Trait coverage of placed plants: flowering ${pct(cov.bloom)}, pollinator groups ${pct(cov.pollinators)}, light ${pct(cov.light)}${cov.illustrative ? ` · <span style="color:var(--f-illus)">${pct(cov.illustrative)} use illustrative (not verified) values</span>` : ''}.</p>`;
  // issues
  const iss = perf.issues;
  h += `<h2>Issues <span class="aside">${iss.length}</span></h2>`;
  if (!iss.length) h += `<p class="small dim">No gaps, isolated cells or known conflicts for your objectives.</p>`;
  else h += `<ul class="issues">${iss.map((x) => `<li class="${F.u.issue === x.id ? 'sel' : ''}"><button data-iss="${esc(x.id)}"><span class="dot ${esc(x.severity)}"></span><span><b>${esc(x.title)}</b>${F.u.issue === x.id ? `<br><span class="small">${esc(x.detail)}</span>${x.species ? `<br><span class="small">${x.species.slice(0, 5).map((s) => plantName(F.store, s, { short: true })).join(', ')}</span>` : ''}` : ''}</span></button>${F.u.issue === x.id ? `<div class="row small" style="padding:6px 0 8px 18px">${x.actions.includes('editMix') && x.mixId ? `<button class="btn-s" data-act="editMix">Edit mix</button>` : ''}${x.actions.includes('reassign') && x.cells.length ? `<button class="btn-s" data-act="reassign">Reassign cell${x.cells.length === 1 ? '' : 's'}</button>` : ''}${x.actions.includes('knowledge') ? `<button class="lnk" data-act="knowledge">Add knowledge</button>` : ''}${x.cells.length ? `<button class="lnk" data-act="structure">Change structure</button>` : ''}</div>` : ''}</li>`).join('')}</ul>`;
  // save / compare / export
  const snaps = P.snapshots();
  h += `<h2>Save and compare</h2><div class="row"><input type="text" id="snapname" placeholder="Snapshot name" style="flex:1" aria-label="Snapshot name"><button class="btn-s" data-a="snap">Save snapshot</button></div>`;
  if (snaps.length) h += `<ul class="issues">${snaps.map((s) => `<li><div class="row sp small" style="padding:5px 0;border-bottom:1px solid var(--f-rule)"><span><b>${esc(s.name)}</b><br><span class="dim xs">${esc(new Date(s.at).toLocaleString())} · ${s.totals.plants.toLocaleString('en-US')} plants</span></span><span class="row"><button class="lnk" data-cmp="${s.id}">Compare</button><button class="lnk" data-rst="${s.id}">Restore</button></span></div></li>`).join('')}</ul>`;
  if (F.u.compare) h += compareHtml(F, snaps.find((s) => s.id === F.u.compare));
  h += `<div class="row" style="margin-top:12px"><button class="btn-s" data-a="export">Export planting data (JSON)</button><button class="lnk" data-a="new">Start a new design</button></div><p class="xs dim">Export: brief, site and units, cell geometry, mixes, quantities, every plant with x, y, z, performance with definitions, caveats.</p>`;
  el.innerHTML = h; bind(F, el);
}
function compareHtml(F, s) {
  if (!s) return ''; const now = summarize(F.P.perf); const was = s.perf; const T = F.P.totals();
  const same = was && now && was.version === now.version; const kSame = s.knowledgeVersion === F.K.version();
  const row = (lab, a, b) => `<tr><td>${lab}</td><td class="num">${a}</td><td class="num">${b}</td></tr>`;
  const months = F.P.state.brief.objectives.flowering.months;
  const resM = (p) => (p ? months.filter((m) => p.months[m] && p.months[m].resourceCells > 0).length : '—');
  const grp = (p) => (p ? (months.reduce((a, m) => a + (p.months[m] ? p.months[m].groups : 0), 0) / months.length).toFixed(1) : '—');
  return `<div class="cand"><h3>Now vs “${esc(s.name)}”</h3>${!same ? '<p class="note warn">Different metric definitions: comparison not shown.</p>' : `<table class="members"><tr><th></th><th class="num">snapshot</th><th class="num">now</th></tr>${row('plants', s.totals.plants.toLocaleString('en-US'), T.plants.toLocaleString('en-US'))}${row('species', s.totals.species, T.species)}${row('brief months with a resource', `${resM(was)} / ${months.length}`, `${resM(now)} / ${months.length}`)}${row('pollinator groups per month (mean)', grp(was), grp(now))}${row('flowering known (plants)', pct(was.coverage.bloom), pct(now.coverage.bloom))}</table>${kSame ? '' : '<p class="xs" style="color:var(--f-warn)">The knowledge in use differs from the snapshot\'s: some differences come from knowledge, not design.</p>'}`}<button class="lnk small" data-a="cmpclose">Close</button></div>`;
}
function bind(F, el) {
  const P = F.P;
  el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { P.setView({ explore: b.dataset.v }); F.render(); }));
  el.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { P.setView({ month: +b.dataset.m }); F.render(); }));
  el.querySelectorAll('[data-iss]').forEach((b) => (b.onclick = () => { const id = b.dataset.iss; F.u.issue = F.u.issue === id ? null : id; const x = P.perf.issues.find((q) => q.id === id); if (F.u.issue && x) { if (x.month) P.setView({ month: x.month, explore: x.type === 'conflict' ? 'adaptability' : P.state.view.explore === 'planting' ? 'pollinator' : P.state.view.explore }); if (x.cells.length) F.focusCells(x.cells); } F.render(); }));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const x = P.perf.issues.find((q) => q.id === F.u.issue); if (!x) return; const act = b.dataset.act;
    if (act === 'editMix') F.go('compose', { editMix: x.mixId, cells: x.cells, keepView: true });
    else if (act === 'reassign') F.go('compose', { cells: x.cells, keepView: true });
    else if (act === 'knowledge') F.go('compose', { knowledge: (x.species && x.species[0]) || (P.mix(x.mixId) && P.mix(x.mixId).members[0].plantId), keepView: true });
    else if (act === 'structure') F.go('structure', { bed: P.state.cells[x.cells[0]].bedId });
  }));
  const a = (k, fn) => { const x = el.querySelector(`[data-a=${k}]`); if (x) x.onclick = fn; };
  a('snap', () => saveSnap(F));
  a('export', () => { const d = P.exportData(); download(`${P.state.siteId}-${P.state.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.json`, d); F.u.lastExport = { plants: d.instances.length, cells: d.cells.length, mixes: d.mixes.length }; F.toast(`Exported ${d.instances.length.toLocaleString('en-US')} plants in ${d.quantities.length} cells, ${d.mixes.length} mixes, with performance and caveats.`); });
  a('new', () => { F.u.confirm = { text: 'Start a new design? The current one stays only in your snapshots and exports.', actions: [{ label: 'Start new', run: () => F.startNew() }, { label: 'Cancel', run: () => {} }] }; F.renderBottom(); });
  el.querySelectorAll('[data-cmp]').forEach((b) => (b.onclick = () => { F.u.compare = F.u.compare === b.dataset.cmp ? null : b.dataset.cmp; F.renderPanel(); }));
  el.querySelectorAll('[data-rst]').forEach((b) => (b.onclick = () => { const r = P.restoreSnapshot(b.dataset.rst); F.toast(r.ok === false ? r.error : 'Snapshot restored (undo: ⌘Z).', { err: r.ok === false }); }));
  a('cmpclose', () => { F.u.compare = null; F.renderPanel(); });
}
export function inspector(F) {
  const P = F.P; const id = [...F.u.cells][0]; const c = id && P.state.cells[id]; if (!c) return null;
  const pc = P.perf && P.perf.perCell[c.id]; const m = F.month(); const mix = P.state.assignments[c.id] && P.mix(P.state.assignments[c.id].mixId);
  let h = `<h3>Cell ${esc(c.label)}</h3>`;
  if (!pc || pc.status !== 'planted') return h + `<p class="small">${pc && pc.status === 'empty' ? 'Left empty on purpose.' : 'No plants.'}</p><div class="row"><button class="btn-s" data-i="reassign">Assign in Compose</button></div>`;
  const s = pc.months[m];
  h += `<p class="small"><span class="sw" style="display:inline-block;width:10px;height:10px;background:${esc(mix.color)}"></span> ${esc(mix.name)} · ${pc.plants} plants</p><p class="small"><b>${MONTHS[m - 1]}</b>: ${s.state === 'resource' ? `${s.species.length} species known to flower (${s.instances} plants)` : s.state === 'uncertain' ? `no known flowering; ${s.unknownSpecies.length} species with unknown months` : 'no placed plant known to flower'}.</p>`;
  if (s.species.length) h += `<p class="small">${s.species.slice(0, 5).map((x) => plantName(F.store, x, { short: true })).join(', ')}</p>`;
  if (s.groups.length) h += `<p class="small">Groups: ${esc(s.groups.join(', '))}${s.groupsUnknown ? ` <span class="dim">(+${s.groupsUnknown} species with unknown groups)</span>` : ''}</p>`;
  if (pc.adaptability) h += `<p class="small">Suitability: <b>${esc(pc.adaptability.status)}</b>${pc.adaptability.conflicts.length ? ' — ' + esc(pc.adaptability.conflicts.map((x) => x.msg).join('; ')) : ''}</p>`;
  h += `<div class="row"><button class="btn-s" data-i="edit">Edit mix</button><button class="lnk" data-i="reassign">Reassign cell</button></div>`;
  return h;
}
export function bindInspector(F, el) {
  const id = [...F.u.cells][0]; const a = (k, fn) => { const x = el.querySelector(`[data-i=${k}]`); if (x) x.onclick = fn; };
  a('edit', () => F.go('compose', { editMix: F.P.state.assignments[id].mixId, cells: [id], keepView: true }));
  a('reassign', () => F.go('compose', { cells: [id], keepView: true }));
}
