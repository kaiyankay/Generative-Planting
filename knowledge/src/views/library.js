// Plant Library: Network (shared records), Profiles (plates), Compare, Seasons — over one scope chosen by four
// independent dimensions (coverage · origin · identity · contribution). Counts are per stable entity id.
import * as A from '../analysis.js';
import { esc, sci, plantVisual, fmtN, mark, glyph, THEME_COLOR, trim, icon, DIA } from '../ui.js';
import { bindCommon, h01, convexHull, smoothClosed, textW } from './common.js';
import { relax, placeLabels } from './graphkit.js';
import { compareTable } from './compare.js';
import { seasonsView } from './seasons.js';

const DIMS = [
  ['coverage', 'Coverage', A.COVERAGE_LEVEL],
  ['origin', 'Origin', { library: 'Plant Library', detroit: 'Detroit plan', survey: 'Survey', robertson: 'Robertson 1929', lists: 'My lists', mine: 'Added by me' }],
  ['status', 'Identity', { established: 'Established', provisional: 'Provisional', candidate: 'Unconfirmed', placeholder: 'Placeholder' }],
  ['contrib', 'Contribution', { preset: 'Preset', added: 'Added by me', annotated: 'With my knowledge' }],
];

export function scope(app) {
  const kb = app.kbv(); const facts = A.allPlants(kb);
  let list = A.filterPlants(facts, app.lib);
  let added = 0;
  if (app.lib.withMine && app.layer !== 'preset') { const have = new Set(list.map(f => f.id)); for (const f of facts) if (!have.has(f.id) && (f.contrib.has('added') || f.contrib.has('annotated'))) { list.push(f); added++; } }
  const rank = { full: 0, partial: 1, names: 2 };
  list.sort((a, b) => rank[a.coverage.level] - rank[b.coverage.level] || (b.mine - a.mine) || (a.entity.commonName || a.entity.name).localeCompare(b.entity.commonName || b.entity.name));
  return { facts, list, added };
}

export function head(app) {
  const { facts, list, added } = scope(app); const t = A.plantTally(list);
  const f = app.lib; const lab = DIMS.flatMap(([dim, , opts]) => [...f[dim]].map(k => opts[k]));
  const what = (lab.length ? lab.join(' · ') : 'all plants') + (added ? ` + ${added} of mine` : '');
  return { title: 'Plant Library', count: `${fmtN(list.length)}<span style="color:var(--ink-4)"> / ${fmtN(facts.length)}</span>`,
    scope: `${esc(what)} — ${t.species} species${t.cultivars ? `, ${t.cultivars} cultivars` : ''}${t.provisional ? ` (${t.provisional} provisional)` : ''}${t.candidates ? `, ${t.candidates} unconfirmed names` : ''}${t.placeholders ? `, ${t.placeholders} placeholders` : ''} · ${fmtN(t.records)} knowledge records (not observations)` };
}

export function contains(app, sel) { return sel?.kind === 'entity' && A.isPlant(app.kbv().state.entities.get(sel.id)); }

export function render(host, app) {
  const { facts, list } = scope(app);
  const bar = filterBar(app, facts);
  const ids = list.map(f => f.id);
  if (app.view === 'network') return network(host, app, list, bar);
  host.innerHTML = bar + (app.view === 'profiles' ? profiles(app, list) : app.view === 'compare' ? `<div class="pad" style="padding-top:4px">${compareTable(app, app.mineMode ? ids.filter(id => list.find(f => f.id === id).contrib.size > 1 || list.find(f => f.id === id).contrib.has('added')) : ids.slice(0, 80), { empty: app.mineMode ? 'Nothing of yours here yet.' : '' })}${ids.length > 80 && !app.mineMode ? `<p class="section-cap">First 80 of ${ids.length}.</p>` : ''}</div>`
    : seasonsView(app, ids.slice(0, 120)));
  bindFilters(host, app); bindCommon(host, app, { more: () => { app._plates = 1e9; app.renderBody(); } });
}

function layerNote() { return ''; }

function filterBar(app, facts) {
  const f = app.lib;
  const count = (dim, k) => A.filterPlants(facts, { ...f, [dim]: new Set([k]) }).length;
  const active = DIMS.flatMap(([dim, label, opts]) => [...f[dim]].map(k => `<button class="chip" data-f="${dim}|${k}" title="Remove this filter">${esc(opts[k])} ×</button>`));
  const extra = app.layer !== 'preset' ? facts.filter(x => (x.contrib.has('added') || x.contrib.has('annotated')) && !A.filterPlants([x], f).length).length : 0;
  const mineChip = extra ? `<button class="chip ${f.withMine ? 'on' : 'off'}" data-f="withmine" aria-pressed="${f.withMine}" title="Plants you added or wrote about that the filter alone would leave out">+ mine ${extra}</button>` : '';
  const summary = `<div class="fbar" style="gap:6px 10px"><button class="btn small" data-f="toggle" aria-expanded="${!!f.open}">${icon('down', 13)} Filter</button>${active.join('')}${mineChip}</div>`;
  if (!f.open) return summary;
  return summary + `<div class="fbar" style="background:var(--wash)">${DIMS.map(([dim, label, opts]) => `<div class="fgrp"><span>${label}</span>${Object.entries(opts).map(([k, l]) => `<button class="fopt ${dim === 'contrib' && k !== 'preset' ? 'mine' : ''}" data-f="${dim}|${k}" aria-pressed="${f[dim].has(k)}">${l} <span class="num">${count(dim, k)}</span></button>`).join('')}</div>`).join('')}</div>`;
}
function bindFilters(host, app) {
  host.querySelectorAll('[data-f]').forEach(b => b.onclick = ev => {
    ev.stopPropagation();
    if (b.dataset.f === 'toggle') { app.lib.open = !app.lib.open; app.renderBody(); return; }
    if (b.dataset.f === 'withmine') { app.lib.withMine = !app.lib.withMine; app.renderHead(); app.renderBody(); return; }
    if (b.dataset.f === 'clear') { for (const k of ['coverage', 'origin', 'status', 'contrib']) app.lib[k] = new Set(); }
    else { const [d, k] = b.dataset.f.split('|'); const s = app.lib[d]; s.has(k) ? s.delete(k) : s.add(k); }
    app.renderHead(); app.renderBody();
  });
}

// ---------- Profiles ----------
function profiles(app, list) {
  const kb = app.kbv(); const lim = app._plates || 120;
  const show = app.mineMode ? list.filter(f => f.contrib.has('added') || f.contrib.has('annotated')) : list;
  const key = `<div class="covkey2"><div class="cov">${A.KTYPES.map(([k, l]) => `<span><i class="${k === 'mine' ? 'mine' : 'on'}"></i>${esc(l.replace(' (survey)', '').replace(' & ', ' · '))}</span>`).join('')}</div>
    <div class="leg"><span><i class="on"></i>has knowledge records of this kind</span><span><i class="via"></i>only for its species (a cultivar)</span><span><i class="lead"></i>name-match lead</span><span><i></i>none recorded</span></div></div>`;
  if (!show.length) return key + `<div class="empty">${app.mineMode ? 'Nothing of yours here yet.' : 'No plant matches these filters.'}</div>`;
  return key + `<div class="plates">${show.slice(0, lim).map(f => plate(kb, f, app)).join('')}</div>${show.length > lim ? `<div class="pad"><button class="btn box" data-act="more">Show all ${fmtN(show.length)}</button></div>` : ''}`;
}
function plate(kb, f, app) {
  const e = f.entity; const c = f.coverage;
  const strip = A.KTYPES.map(([k]) => { const d = c.direct[k] || 0; const v = c.via[k] || 0; const leadOnly = k === 'research' && d && A.activeOf(kb, f.id).filter(r => A.ktypeOf(r) === 'research').every(A.isLead);
    const cls = k === 'mine' ? (d ? 'mine' : '') : d ? (leadOnly ? 'lead' : 'on') : v ? 'via' : ''; return `<i class="${cls}" title="${esc(A.KTYPES.find(x => x[0] === k)[1])}: ${d}${v ? ` · species ${v}` : ''}"></i>`; }).join('');
  const st = f.status === 'candidate' ? mark.candidate() : f.status === 'placeholder' ? mark.placeholder() : f.status === 'provisional' ? mark.provisional() : '';
  const orig = [...f.origins].map(o => ({ library: 'Library', detroit: 'Detroit plan', survey: 'Survey', robertson: 'Robertson', lists: 'My list', mine: 'Mine' }[o])).join(' · ');
  const fresh = app.fresh.ids.has(f.id);
  return `<button class="plate ${f.mine || f.contrib.has('added') ? 'mine-touched' : ''}" data-ent="${esc(f.id)}" data-key="${esc(f.id)}" ${fresh ? 'style="box-shadow:inset 0 0 0 1.5px var(--mine)"' : ''}>
    <div class="vis">${plantVisual(e, 104)}</div>
    <div>${e.commonName ? `<span class="pl-c">${esc(e.commonName)}</span><span class="pl-s">${sci(e.name)}</span>` : `<span class="pl-s solo">${sci(e.name)}</span>`}</div>
    <div class="cov">${strip}</div>
    <div class="tags">${st}${f.mine ? `<span class="mk mk-mine">${DIA} ${f.mine}</span>` : ''}</div></button>`;
}

// ---------- Network: shared records among the plants in scope ----------
const AREA = ['#EEF2EF', '#F4F2EB', '#EDF1F4', '#F3EEF1', '#F0F2EA'];
function network(host, app, list, bar) {
  const kb = app.kbv();
  const usable = list.filter(f => f.coverage.attrs > 0 || f.contrib.has('added') || f.mine).slice(0, 36);
  const ids = usable.map(f => f.id);
  const net = A.sharedNetwork(kb, ids, { themes: app.lib.themes, expandCommon: app.lib.expandCommon });
  host.classList.add('fill');
  const T = A.THEMES;
  const mineN = app.layer !== 'preset' ? usable.filter(f => f.mine || f.contrib.has('added')) : [];
  host.innerHTML = `<div class="netwrap">${bar}<div class="netbody" style="display:grid;grid-template-rows:auto 1fr auto">
    <div class="netbar"><div class="legend">${Object.entries(T).map(([k, t]) => `<button data-theme="${k}" aria-pressed="${app.lib.themes.includes(k)}" title="Show or hide attributes of this theme"><span class="sq" style="background:${THEME_COLOR[k]}"></span>${esc(t.label)}</button>`).join('')}
      <span style="margin-left:10px"><span class="sw" style="border-top-width:1px;width:10px"></span><span class="sw" style="border-top-width:3.5px;width:10px"></span>width = independent sources (not confidence)</span><span><span class="sw dashed"></span>listed together by a designer</span><span><span class="sq" style="background:#EEF2EF;border:1px solid var(--rule-2)"></span>group computed from shared records — not a community</span>${app.layer !== 'preset' ? `<span><span class="sw mine"></span>my knowledge</span><span><span class="sw dashed" style="border-color:var(--ink-4)"></span>Preset only (replaced or left out)</span>` : ''}</div></div>
    <div class="netcanvas" id="nc"></div>
    ${band(app, kb, net, usable)}</div></div>`;
  const nc = host.querySelector('#nc');
  const CW = Math.max(320, nc.clientWidth), CH = Math.max(280, nc.clientHeight);
  app.netFrame = app.netFrame || { W: Math.max(720, CW), H: Math.max(440, CH) }; const W = app.netFrame.W, H = app.netFrame.H;
  if (!ids.length) { nc.innerHTML = `<div class="empty">No plant in this scope has attribute records to share. Widen the filters, or open <b>Profiles</b>.</div>`; bindFilters(host, app); return; }
  const L = layout(app, net, ids, W, H);
  const sat = satellites(app, kb, ids, L, W, H);
  const mineMode = app.mineMode;
  const fresh = app.fresh.ids;
  let s = `<svg class="net" viewBox="0 0 ${W} ${H}" width="${CW}" height="${CH}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Network of shared records">`;
  // exploratory groups as areas (never links)
  net.groups.forEach((g, i) => {
    const pts = []; for (const p of g.plants) { const q = L.pos.get(p); for (let a = 0; a < 12; a++) pts.push([q[0] + 74 * Math.cos(a * Math.PI / 6), q[1] + 8 + 66 * Math.sin(a * Math.PI / 6)]); }
    const hull = convexHull(pts); const left = hull.reduce((m, p) => p[0] < m[0] ? p : m, hull[0]);
    s += `<path class="area" d="${smoothClosed(hull)}" fill="${AREA[i % AREA.length]}" data-grp="${i}"><title>Shares ${esc(g.sharedBy.map(h => kb.label(h)).join(' · ') || 'some attributes')} — grouped from the records in view, not a plant community</title></path>`;
  });
  // links that are in the Preset but not in effect for me (replaced or left out): ghosts, so the change is visible in place
  if (app.layer !== 'preset') {
    const bnet = A.sharedNetwork(app.kbBase, ids.filter(id => app.kbBase.state.entities.has(id)), { themes: app.lib.themes, expandCommon: app.lib.expandCommon });
    const have = new Set(net.hubs.flatMap(h => h.links.map(l => l.plant + '|' + h.id)));
    for (const h of bnet.hubs) for (const l of h.links) { if (have.has(l.plant + '|' + h.id)) continue; const hp = L.pos.get(h.id), pp = L.pos.get(l.plant); if (!hp || !pp) continue;
      s += `<line class="edge ghost" x1="${pp[0]}" y1="${pp[1]}" x2="${hp[0]}" y2="${hp[1]}" stroke="var(--ink-4)" stroke-width="1" stroke-dasharray="3 3"><title>In the Preset; replaced or left out in your knowledge</title></line>`; }
  }
  s += sat.edges;
  for (const c of net.colisted) { const a = L.pos.get(c.a), b = L.pos.get(c.b); if (!a || !b) continue; const mx = (a[0] + b[0]) / 2 + (a[1] - b[1]) * .12, my = (a[1] + b[1]) / 2 + (b[0] - a[0]) * .12;
    s += `<path class="edge dashed ${mineMode ? 'dim' : ''}" d="M${a[0]},${a[1]}Q${mx},${my} ${b[0]},${b[1]}" stroke="var(--ink-3)" stroke-width="1" data-p="${esc(c.a)} ${esc(c.b)}"/><path class="hit" d="M${a[0]},${a[1]}Q${mx},${my} ${b[0]},${b[1]}" data-ev="co|${esc(c.recordId)}"/>`; }
  for (const h of net.hubs) { const hp = L.pos.get(h.id); for (const l of h.links) { const p = L.pos.get(l.plant); if (!p) continue;
    const w = Math.min(4.5, 0.7 + 0.85 * (l.sources - 1)); const cls = `edge ${l.mine ? 'mine' : ''} ${mineMode && !l.mine ? 'dim' : ''}`;
    s += `<line class="${cls}" x1="${p[0]}" y1="${p[1]}" x2="${hp[0]}" y2="${hp[1]}" stroke="${THEME_COLOR[h.theme]}" stroke-width="${w.toFixed(2)}" data-p="${esc(l.plant)}" data-h="${esc(h.id)}"/>`
      + `<line class="hit" x1="${p[0]}" y1="${p[1]}" x2="${hp[0]}" y2="${hp[1]}" data-ev="${esc(l.plant)}|${esc(h.id)}"/>`; } }
  for (const h of net.hubs) { const [x, y] = L.pos.get(h.id); const w = textW(h.label) + 26; const n = h.plants.length;
    s += `<g class="node hub ${mineMode && !h.mine ? 'fade' : ''}" data-key="hub:${esc(h.id)}" data-hub="${esc(h.id)}" transform="translate(${x},${y})"><rect class="box" x="${-w / 2}" y="-9" width="${w}" height="18"/><line class="tick" x1="${-w / 2 + 2}" x2="${-w / 2 + 2}" y1="-6" y2="6" stroke="${THEME_COLOR[h.theme]}"/><text x="${-w / 2 + 9}" y="4">${esc(h.label)}</text><text class="n" x="${w / 2 - 3}" y="4" text-anchor="end">${n}</text></g>`; }
  for (const id of ids) { const p = L.pos.get(id); if (!p) continue; const f = usable.find(x => x.id === id); const e = f.entity; const [x, y] = p;
    const isMine = f.mine || f.contrib.has('added');
    s += `<g class="node plant ${mineMode && !isMine ? 'fade' : ''} ${isMine && app.layer !== 'preset' ? 'mine' : ''}" data-key="${esc(id)}" data-ent="${esc(id)}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${esc(e.commonName || e.name)}">
      ${app.netExp?.has(id) ? '<circle r="39" fill="none" stroke="var(--ink-3)" stroke-dasharray="2 3"/>' : ''}<circle class="ring" r="33" ${fresh.has(id) ? 'style="stroke:var(--mine);stroke-width:2"' : ''}/>${e.seedSet === 'planting-db-10' ? `<image href="art/${esc(id)}.webp" x="-27" y="-31" width="54" height="58" preserveAspectRatio="xMidYMid meet"/>` : `<g transform="translate(-15,-17) scale(1.25)" class="glyph">${glyph(e.plantType || 'unknown', 24).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`}
      <text class="lab-c halo-t" y="49" text-anchor="middle">${esc(e.commonName || '')}</text><text class="lab-s halo-t" y="${e.commonName ? 62 : 49}" text-anchor="middle">${esc(e.name)}</text>
      ${isMine && app.layer !== 'preset' ? `<path class="mine-dot" d="M30 -33l4 4-4 4-4-4z"/>${f.mine ? `<text class="mine-t halo-t" x="37" y="-25">${f.mine}</text>` : ''}` : ''}</g>`; }
  s += sat.nodes;
  s += `</svg><div class="tip" hidden></div>`;
  nc.innerHTML = s;
  const svg = nc.querySelector('svg'); const tip = nc.querySelector('.tip');
  const hl = (pid, hid) => {
    svg.querySelectorAll('.edge').forEach(el => { const on = (pid && (el.dataset.p || '').split(' ').includes(pid)) || (hid && el.dataset.h === hid); el.classList.toggle('fade', !!(pid || hid) && !on); });
    svg.querySelectorAll('.node').forEach(el => { const id = el.dataset.ent || el.dataset.hub; const on = !pid && !hid ? true : id === pid || id === hid || (pid && net.hubs.find(h => h.id === id)?.plants.includes(pid)) || (hid && net.hubs.find(h => h.id === hid)?.plants.includes(id)); el.classList.toggle('fade', !on && !(mineMode && el.classList.contains('fade'))); });
  };
  svg.addEventListener('mouseover', ev => {
    const g = ev.target.closest('.node'); if (!g) return;
    if (g.dataset.ent) { const f = usable.find(x => x.id === g.dataset.ent); const hubs = net.hubs.filter(h => h.plants.includes(f.id)).length; const uq = (net.unique.get(f.id) || []).length;
      showTip(tip, g, `<b>${esc(f.entity.commonName || f.entity.name)}</b><br>${hubs} shared · ${uq} only here · ${f.active} records${f.mine ? `<br><span style="color:var(--mine-ink)">${DIA} ${f.mine} mine</span>` : ''}`); hl(f.id, null); }
    else if (g.dataset.hub) { const h = net.hubs.find(x => x.id === g.dataset.hub); showTip(tip, g, `<b>${esc(h.label)}</b> · ${esc(A.THEMES[h.theme].label)}<br>${h.plants.length} plants · ${h.links.reduce((a, l) => a + l.records.length, 0)} records`); hl(null, h.id); }
  });
  svg.addEventListener('mouseout', ev => { if (!ev.relatedTarget?.closest?.('.node')) { tip.hidden = true; hl(null, null); } });
  svg.addEventListener('click', ev => {
    const hit = ev.target.closest('.hit'); const g = ev.target.closest('.node');
    if (g?.dataset.sat) { const id = g.dataset.sat; return app.select(id.startsWith('src:') ? { kind: 'source', id } : id.startsWith('rn:') ? { kind: 'record', id: id.slice(3) } : id === 'me' ? { kind: 'me', id } : { kind: 'entity', id }); }
    if (g?.dataset.ent) return app.select({ kind: 'entity', id: g.dataset.ent });
    if (g?.dataset.hub) { const h = net.hubs.find(x => x.id === g.dataset.hub); return app.select({ kind: 'hub', id: h.id, plants: h.plants, key: 'hub:' + h.id }); }
    if (hit) { const [a, b] = hit.dataset.ev.split('|');
      if (a === 'co') return app.select({ kind: 'record', id: b });
      const h = net.hubs.find(x => x.id === b); const l = h.links.find(x => x.plant === a);
      return app.select({ kind: 'evidence', title: `${kb.label(a)} — ${h.label}`, sub: `${l.records.length} record${l.records.length > 1 ? 's' : ''} from ${l.sources} source${l.sources > 1 ? 's' : ''}. A shared attribute does not make two plants compatible.`, recordIds: l.records, key: 'ev:' + a + '|' + b }); }
    if (!g && !hit) app.select(null);
  });
  svg.addEventListener('dblclick', ev => { const g = ev.target.closest('.node'); if (g?.dataset.ent) toggleExpand(app, g.dataset.ent); else if (g?.dataset.sat && !g.dataset.sat.startsWith('rn:')) app.explore(g.dataset.sat, { fresh: true }); });
  svg.addEventListener('keydown', ev => { const g = ev.target.closest('.node'); if (!g) return; if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (ev.shiftKey && g.dataset.ent) toggleExpand(app, g.dataset.ent); else g.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  host.querySelectorAll('[data-theme]').forEach(b => b.onclick = () => { const t = b.dataset.theme; const th = app.lib.themes; app.lib.themes = th.includes(t) ? th.filter(x => x !== t) : [...th, t]; app.renderBody(); });
  host.querySelector('[data-common]')?.addEventListener('click', () => { app.lib.expandCommon = !app.lib.expandCommon; app.renderBody(); });
  bindFilters(host, app);
  host.querySelectorAll('.foldbar [data-ent]').forEach(b => b.onclick = () => app.select({ kind: 'entity', id: b.dataset.ent }));
  host.querySelector('[data-collapse-all]')?.addEventListener('click', () => { app.netExp = new Set(); app.renderBody(); });
  if (app.sel) app.markSelection();
}
function showTip(tip, g, html) { const r = g.getBoundingClientRect(); const pr = tip.parentElement.getBoundingClientRect(); tip.innerHTML = html; tip.hidden = false; tip.style.left = Math.min(pr.width - 300, r.right - pr.left + 8) + 'px'; tip.style.top = (r.top - pr.top) + 'px'; }

function band(app, kb, net, usable) {
  const nm = id => { const e = kb.state.entities.get(id); return `<button data-ent="${esc(id)}">${e.commonName ? esc(e.commonName) : sci(e.name)}</button>`; };
  const parts = [];
  if (net.common.length) parts.push(`<span><span class="lab">${app.lib.expandCommon ? 'Shown' : 'Folded'}, on ≥ ${net.cut} of ${net.n}</span>${net.common.map(h => `${esc(h.label)} <span class="num">${h.plants.length}</span>`).join(' · ')} <button data-common>${app.lib.expandCommon ? 'fold' : 'show'}</button></span>`);
  if (net.isolated.length) parts.push(`<span><span class="lab">Not linked</span>${net.isolated.map(nm).join(', ')}</span>`);
  parts.push(`<span class="dim">Double-click a plant (Shift+Enter) to add its recipes, research, survey, places and notes here${app.netExp?.size ? ` · <button data-collapse-all>fold all ${app.netExp.size}</button>` : ''}</span>`);
  return `<div class="foldbar">${parts.join('')}</div>`;
}

function layout(app, net, ids, W, H) {
  app.netPos = app.netPos || new Map(); const prev = app.netPos;
  const pos = new Map(); const gOf = new Map(); net.groups.forEach((g, i) => g.plants.forEach(p => gOf.set(p, i)));
  const plants = ids.filter(id => !net.isolated.includes(id)).concat(net.isolated);
  const ungrouped = plants.filter(p => !gOf.has(p)); const ng = net.groups.length + (ungrouped.length ? 1 : 0) || 1; const cx = W / 2, cy = H / 2 - 6;
  const centres = [];
  for (let i = 0; i < ng; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / ng + (ng === 2 ? Math.PI / 2 : 0); centres.push(ng === 1 ? [cx, cy] : [cx + W * 0.27 * Math.cos(a), cy + H * 0.24 * Math.sin(a)]); }
  const members = new Map(); for (const p of plants) { const g = gOf.has(p) ? gOf.get(p) : net.groups.length; if (!members.has(g)) members.set(g, []); members.get(g).push(p); }
  for (const [g, ps] of members) { const r = ps.length === 1 ? 0 : 50 + 32 * Math.sqrt(ps.length); ps.forEach((p, i) => { const a = i * 2 * Math.PI / ps.length + h01(p) * .4; pos.set(p, [centres[g][0] + r * Math.cos(a), centres[g][1] + r * Math.sin(a)]); }); }
  for (const h of net.hubs) { let x = 0, y = 0; for (const p of h.plants) { x += pos.get(p)[0]; y += pos.get(p)[1]; } pos.set(h.id, [x / h.plants.length + (h01(h.id) - .5) * 40, y / h.plants.length + (h01(h.id + 'y') - .5) * 40]); }
  const kept = new Set();
  for (const id of pos.keys()) if (prev.has(id)) { const q = prev.get(id); pos.set(id, [q[0], q[1]]); kept.add(id); }
  if (kept.size === pos.size) return { pos };                           // every node already has its place: nothing moves
  const isHub = new Map(net.hubs.map(h => [h.id, h]));
  const rad = id => isHub.has(id) ? Math.max(24, textW(isHub.get(id).label) / 2 + 16) : 64;
  const nodes = [...pos.keys()];
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 340; const F = new Map(nodes.map(n => [n, [0, 0]]));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; const pa = pos.get(a), pb = pos.get(b);
      let dx = pa[0] - pb[0], dy = pa[1] - pb[1]; let d = Math.hypot(dx, dy) || .01; const min = rad(a) + rad(b);
      const f = (d < min * 1.25 ? (min * 1.25 - d) * .35 : 0) + 1400 / (d * d);
      F.get(a)[0] += dx / d * f; F.get(a)[1] += dy / d * f; F.get(b)[0] -= dx / d * f; F.get(b)[1] -= dy / d * f;
    }
    for (const h of net.hubs) for (const p of h.plants) { const ph = pos.get(h.id), pp = pos.get(p); const dx = pp[0] - ph[0], dy = pp[1] - ph[1]; const d = Math.hypot(dx, dy) || .01; const f = (d - 120) * .035;
      F.get(h.id)[0] += dx / d * f; F.get(h.id)[1] += dy / d * f; F.get(p)[0] -= dx / d * f * .4; F.get(p)[1] -= dy / d * f * .4; }
    for (const p of plants) { const g = gOf.has(p) ? gOf.get(p) : Math.min(net.groups.length, centres.length - 1); const c = centres[g]; const pp = pos.get(p); F.get(p)[0] += (c[0] - pp[0]) * .03; F.get(p)[1] += (c[1] - pp[1]) * .03; }
    for (const n of nodes) { const p = pos.get(n); const f = F.get(n); const m = kept.has(n) ? 0 : 1; p[0] += (Math.max(-12, Math.min(12, f[0])) * cool + (cx - p[0]) * .002) * m; p[1] += (Math.max(-12, Math.min(12, f[1])) * cool + (cy - p[1]) * .002) * m;
      const r = isHub.has(n) ? rad(n) : 46; p[0] = Math.max(r + 6, Math.min(W - r - 6, p[0])); p[1] = Math.max(isHub.has(n) ? 18 : 40, Math.min(H - (isHub.has(n) ? 18 : 70), p[1])); }
  }
  // final pass: hub labels never sit on a plant drawing or its name
  for (let it = 0; it < 80; it++) for (const h of net.hubs) { const ph = pos.get(h.id); const hw = textW(h.label) / 2 + 16;
    for (const p of plants) { const pp = pos.get(p); const box = [pp[0] - 58, pp[1] - 38, pp[0] + 58, pp[1] + 68];
      if (ph[0] + hw > box[0] && ph[0] - hw < box[2] && ph[1] + 10 > box[1] && ph[1] - 10 < box[3]) { const up = ph[1] - box[1] + 10, dn = box[3] - ph[1] + 10; ph[1] += up < dn ? -Math.min(up, 6) : Math.min(dn, 6); ph[0] += ph[0] < pp[0] ? -2 : 2; } }
    for (const o of net.hubs) { if (o === h) continue; const po = pos.get(o.id); const ow = textW(o.label) / 2 + 16; if (Math.abs(ph[0] - po[0]) < hw + ow - 4 && Math.abs(ph[1] - po[1]) < 20) { ph[1] += ph[1] <= po[1] ? -2 : 2; } }
    ph[1] = Math.max(14, Math.min(H - 14, ph[1])); }
  for (const [id, q] of pos) prev.set(id, [q[0], q[1]]);
  return { pos };
}

// ---------- expand in place: a plant's cross-collection neighbours join the network around it ----------
const SAT_GROUPS = ['My knowledge', 'Planting recipes', 'Research', 'Designers (survey)', 'Identity', 'Local data', 'Where it was recorded'];
function toggleExpand(app, id) { app.netExp = app.netExp || new Set(); app.netExp.has(id) ? app.netExp.delete(id) : app.netExp.add(id); app.select({ kind: 'entity', id }); app.renderBody(); }
function satellites(app, kb, ids, L, W, H) {
  const out = { edges: '', nodes: '' }; if (!app.netExp?.size) return out;
  app.netPos = app.netPos || new Map();
  const inNet = new Set(ids); const sats = new Map(); const links = [];
  for (const p of app.netExp) {
    if (!L.pos.has(p)) continue;
    const items = A.neighbours(kb, p).filter(x => SAT_GROUPS.includes(x.group)).sort((a, b) => SAT_GROUPS.indexOf(a.group) - SAT_GROUPS.indexOf(b.group) || b.weight - a.weight).slice(0, 9);
    for (const it of items) {
      links.push({ from: p, to: it.id, it });
      if (inNet.has(it.id)) continue;                                   // already a plant in this network: just draw the link
      if (!sats.has(it.id)) sats.set(it.id, { id: it.id, info: it.kind === 'record' ? { kind: 'record', name: it.name || 'note', mine: true } : A.nodeInfo(kb, it.id), parents: [] });
      sats.get(it.id).parents.push(p);
    }
  }
  const cx = W / 2, cy = H / 2; const P = new Map(L.pos);
  const placedNow = [];
  for (const s of sats.values()) {
    if (app.netPos.has('sat:' + s.id)) { P.set(s.id, app.netPos.get('sat:' + s.id).slice()); continue; }
    const [px, py] = L.pos.get(s.parents[0]); const k = placedNow.filter(x => x.parent === s.parents[0]).length;
    const out0 = Math.atan2(py - cy, px - cx) || 0; const a = out0 + (k - 4) * 0.5; const r = 128 + (k % 2) * 34;
    P.set(s.id, [Math.max(20, Math.min(W - 20, px + r * Math.cos(a))), Math.max(20, Math.min(H - 20, py + r * Math.sin(a)))]); placedNow.push({ id: s.id, parent: s.parents[0] });
  }
  // nudge new satellites off plant drawings and hub labels; existing nodes stay put
  const arr = [...P.entries()].map(([id, [x, y]]) => ({ id, x, y: inNet.has(id) ? y + 10 : y, r: sats.has(id) ? 9 : (inNet.has(id) ? 56 : 24), w: sats.has(id) ? 60 : 0, anchor: sats.has(id) && !placedNow.some(q => q.id === id) ? 1 : sats.has(id) ? 0 : 1 }));
  relax(arr, links.filter(l => sats.has(l.to)).map(l => [l.from, l.to, 100]), W, H, { iters: 80, gravity: 0 });
  for (const n of arr) if (sats.has(n.id)) { P.set(n.id, [n.x, n.y]); app.netPos.set('sat:' + n.id, [n.x, n.y]); }
  // labels avoid every plant drawing (with its name) and hub label, not only other satellites
  const obstacles = [...L.pos.entries()].map(([id, [x, y]]) => ({ id, x, y: inNet.has(id) ? y + 12 : y, r: inNet.has(id) ? 52 : 14, w: 0, h: 0, prio: -1 }));
  const satList = [...sats.values()];
  const lab = placeLabels([...satList.map(s => { const [x, y] = P.get(s.id); return { id: s.id, x, y, r: 9, w: textW(trim(s.info.short || s.info.common || s.info.name, 28)) + 4, h: 14, prio: 1 }; }), ...obstacles], W, H);
  for (const l of links) { const a = P.get(l.from), b = P.get(l.to); if (!a || !b) continue;
    out.edges += `<line class="edge sat ${l.it.style === 'dotted' ? 'dotted' : l.it.style === 'dashed' ? 'dashed' : l.it.style === 'identity' ? 'identity' : ''} ${l.it.mine ? 'mine' : ''}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="var(--ink-3)" stroke-width="1"><title>${esc(l.it.label)}</title></line>`; }
  [...sats.values()].forEach((s, i) => { const [x, y] = P.get(s.id); const sp = lab[i]; const name = trim(s.info.short || s.info.common || s.info.name, 28);
    out.nodes += `<g class="node sat" data-sat="${esc(s.id)}" data-key="${esc(s.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(name)}">${satShape(s.info)}<text class="halo-t ${s.info.mine ? 'mine-t' : ''}" x="${(sp.tx - x).toFixed(1)}" y="${(sp.ty - y + 4).toFixed(1)}" text-anchor="${sp.anchor}" style="font-size:10.5px">${esc(name)}</text></g>`; });
  return out;
}
function satShape(i) {
  const k = i.kind;
  if (k === 'planting_system') return '<polygon points="7,-4 7,4 0,8 -7,4 -7,-4 0,-8" fill="var(--paper)" stroke="var(--ink)"/>';
  if (k === 'dataset' || k === 'list') return `<rect x="-7" y="-5.5" width="14" height="11" fill="var(--paper)" stroke="${i.mine ? 'var(--mine)' : 'var(--ink-2)'}"/><path d="M-7 -1.5H7M-7 2H7" stroke="var(--ink-2)" stroke-width=".7"/>`;
  if (k === 'survey') return '<rect x="-6" y="-6" width="12" height="12" fill="var(--paper)" stroke="var(--ink-2)"/><circle cx="-2.5" cy="-2.5" r="1" fill="var(--ink-2)"/><circle cx="2.5" cy="2.5" r="1" fill="var(--ink-2)"/>';
  if (k === 'source') return '<rect x="-5" y="-5" width="10" height="10" fill="var(--paper)" stroke="var(--ink-2)"/>';
  if (k === 'place') return '<path d="M0 -7L6.3 4.9H-6.3Z" fill="var(--paper)" stroke="var(--ink-2)"/>';
  if (k === 'record' || k === 'me') return '<path d="M0 -6L6 0 0 6 -6 0Z" fill="var(--mine)"/>';
  if (k === 'plant' || k === 'cultivar') return `<circle r="9" fill="var(--paper)" stroke="var(--rule-2)"/><g transform="translate(-7,-7.5) scale(.6)" class="glyph">${glyph('forb').replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>`;
  return '<circle r="5" fill="var(--paper)" stroke="var(--ink-3)"/>';
}
