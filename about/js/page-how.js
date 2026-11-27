// About · How it works — ONE design (beds B1 + A1, Oudolf Garden Detroit) computed by the engine, read in four stages.
// The stage figure switches between Define · Structure · Compose · Explore (and their sub-views) without recomputing:
// every view reads the same case object (case.js). The sections below it take the same case apart.
import { mast, sec, fold, go, wait, routes, nm, nmTxt, tag, src, sci } from './parts.js';
import { esc, view, pd, ground, plants, allPlants, section, axo, scaleBar, north, svg, DEFS, LAYER_C, LAYER_N, MONTHS, boxOf, grow, centroid, swatch } from './figures.js';
import { LOGICS, RULES } from '../../src/flow/spatial.js';
import { PERF } from '../../src/flow/performance.js';
import { sys } from './page-project.js';

const STAGES = [['define', 'Define'], ['structure', 'Structure'], ['compose', 'Compose'], ['explore', 'Explore']];
const SUB = { structure: [['strategy', 'As the strategy chose'], ['honeycomb', 'Honeycomb'], ['bands', 'Bands'], ['organic', 'Organic patches']], compose: [['paint', 'Paint by number'], ['layers', 'Functional layers'], ['brush', 'One brush gesture']], explore: [['plan', 'Plan'], ['axo', 'Axo'], ['diagram', 'Diagram'], ['season', 'Seasonality'], ['perf', 'Performance']] };
let C = null; const ST = { stage: 'define', sub: { structure: 'strategy', compose: 'paint', explore: 'plan' }, month: 7, playing: 0 };
const W = 760; // figure width (px of the viewBox)
const n0 = (v) => Number(v).toLocaleString('en-US');

export function frame() {
  return `<div class="ab ab-how">
  ${mast('One design, computed in four stages.', 'Beds B1 and A1 of the Oudolf Garden Detroit, designed with the same commands as the Design workspace. Every cell, plant and count on this page is computed by the engine in your browser.', '<p class="ab-prov" id="gp-prov">Rules mode · no language model<br>computing…</p>')}
  <section class="ab-stage" id="figure" aria-label="The example in four stages">
    <div class="ab-tabs" role="tablist" aria-label="Stage">${STAGES.map(([k, l], i) => `<button type="button" role="tab" id="tab-${k}" data-stage="${k}" aria-controls="ab-stage-b" aria-selected="${k === ST.stage}" tabindex="${k === ST.stage ? 0 : -1}"><b>${i + 1}</b>${l}</button>`).join('')}</div>
    <div class="ab-stage-b" id="ab-stage-b" role="tabpanel" aria-labelledby="tab-${ST.stage}" tabindex="0">${wait(560)}</div>
  </section>
  <div id="gp-below"></div>
  </div>`;
}

export async function fill(c, { cached }) {
  C = c;
  const best = Object.entries(C.months).sort((a, b) => b[1].flowering - a[1].flowering)[0]; ST.month = +best[0];
  const q = new URLSearchParams(location.search); if (STAGES.some(([k]) => k === q.get('stage'))) ST.stage = q.get('stage'); for (const k of Object.keys(SUB)) if (q.get(k) && SUB[k].some(([v]) => v === q.get(k))) ST.sub[k] = q.get(k); if (+q.get('month') >= 1 && +q.get('month') <= 12) ST.month = +q.get('month');
  prov(); document.getElementById('gp-below').innerHTML = below();
  sync(); if (!wired) { wireStage(); wired = true; }
}
let wired = false, check = '';
function prov() {
  const plantsN = allPlants(C.inst).length;
  document.getElementById('gp-prov').innerHTML = `Rules mode · no language model<br>${C.meta.source === 'live' ? `computed in your browser in <b>${(C.meta.ms / 1000).toFixed(1)} s</b>` : 'the engine’s stored run of this example'} · <b>${n0(plantsN)}</b> plants<br>an in-memory project: nothing is saved<br><button type="button" class="gp-re" id="gp-re">Recompute in this browser</button>${check ? `<br><span class="gp-check">${check}</span>` : ''}`;
  document.getElementById('gp-re').onclick = async (ev) => { const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'The engine is running…'; const before = C.meta.fp;
    try { const { recompute } = await import('./shell.js'); const { C: L } = await recompute(); const same = L.meta.fp === before; check = same ? `identical to the stored run: fingerprint ${esc(L.meta.fp)}` : `differs from the stored run: ${esc(before)} → ${esc(L.meta.fp)}`; await fill(L, { cached: false }); }
    catch (e) { btn.disabled = false; btn.textContent = 'Recompute in this browser'; check = `could not recompute: ${esc(e.message)}`; prov(); } };
}

// ---------------------------------------------------------------- the stage
function sync(focus = false) {
  const root = document.getElementById('figure');
  for (const t of root.querySelectorAll('[role="tab"]')) { const on = t.dataset.stage === ST.stage; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); }
  const b = document.getElementById('ab-stage-b'); b.setAttribute('aria-labelledby', `tab-${ST.stage}`); b.innerHTML = stageHtml();
  const q = new URLSearchParams(location.search); q.set('stage', ST.stage); if (SUB[ST.stage]) q.set(ST.stage, ST.sub[ST.stage]); if (ST.stage === 'explore') q.set('month', ST.month); history.replaceState(null, '', `${location.pathname}?${q}${location.hash}`);
}
function wireStage() {
  const root = document.getElementById('figure');
  root.addEventListener('click', (ev) => {
    const t = ev.target.closest('[role="tab"]'); if (t) { stopPlay(); ST.stage = t.dataset.stage; sync(); return; }
    const s = ev.target.closest('[data-sub]'); if (s) { ST.sub[ST.stage] = s.dataset.sub; sync(); root.querySelector(`[data-sub="${s.dataset.sub}"]`)?.focus(); return; }
    const m = ev.target.closest('[data-month]'); if (m) { stopPlay(); ST.month = +m.dataset.month; sync(); root.querySelector(`[data-month="${ST.month}"]`)?.focus(); return; }
    if (ev.target.closest('[data-play]')) { if (ST.playing) stopPlay(); else { ST.playing = setInterval(() => { ST.month = (ST.month % 12) + 1; sync(); }, 900); sync(); } }
  });
  root.querySelector('[role="tablist"]').addEventListener('keydown', (ev) => { const i = STAGES.findIndex(([k]) => k === ST.stage); const to = ev.key === 'ArrowRight' ? (i + 1) % 4 : ev.key === 'ArrowLeft' ? (i + 3) % 4 : -1; if (to < 0) return; ev.preventDefault(); ST.stage = STAGES[to][0]; sync(true); });
}
function stopPlay() { if (ST.playing) { clearInterval(ST.playing); ST.playing = 0; } }

const pan = (h3, body) => `<div class="ab-pan">${h3 ? `<h3>${h3}</h3>` : ''}${body}</div>`;
const subBar = (k) => `<div class="st-seg gp-sub" role="group" aria-label="View">${SUB[k].map(([v, l]) => `<button type="button" data-sub="${v}" aria-pressed="${ST.sub[k] === v}">${l}</button>`).join('')}</div>`;
const metric = (n, l) => `<div><dd>${n}</dd><dt>${l}</dt></div>`;
const caseBox = () => grow(boxOf(C.site.beds.filter((b) => b.inCase).map((b) => b.geom)), 1.6);
const mixC = (id) => (C.mixes.find((m) => m.id === id) || {}).color || '#999';
const mixN = (id) => { const p = C.paint.find((q) => q.mix === id); return p ? p.n : null; };
const keyRow = (...items) => `<p class="gp-key">${items.map(([c, t, cls = '']) => `<span>${c ? swatch(c, cls) : ''}${t}</span>`).join('')}</p>`;

function stageHtml() {
  const V = view(caseBox(), W); const deco = scaleBar(V, 18, V.H - 16, 5) + north(V.W - 24, 24);
  if (ST.stage === 'define') {
    const z = C.define.strategy.zones; let h = ground(C, V);
    for (const zz of z) for (const b of zz.beds) { const bed = C.site.beds.find((q) => q.id === b); h += `<path d="${pd(bed.geom, V)}" fill="${zz.color}" fill-opacity=".16" stroke="${zz.color}" stroke-width="2.4"/>`; }
    for (const b of C.site.beds.filter((q) => q.inCase)) { const a = C.define.assume[b.id]; h += `<path d="${pd(b.plantable, V)}" fill="url(#${a ? 'h-assume' : 'h-unknown'})" stroke="none"/>`; const c = centroid(b.geom); h += `<text class="pl-lab" x="${V.X(c[0]).toFixed(1)}" y="${(V.Y(c[1]) + 22).toFixed(1)}" text-anchor="middle" style="font-size:11px;font-family:var(--pi-mono);font-weight:400">${a ? `light: ${esc(a)} · assumed` : 'light: unknown'}</text>`; }
    for (const b of C.site.beds.filter((q) => q.inCase)) { const c = centroid(b.geom); h += `<text class="pl-lab" x="${V.X(c[0]).toFixed(1)}" y="${V.Y(c[1]).toFixed(1)}" text-anchor="middle">${esc(b.code)}</text>`; }
    const S = C.define.sources || {}; const srcRow = (k, l) => { const s = S[k] || {}; return `<li><span>${l}</span><span>${s.on === false ? 'off' : k === 'illustrative' ? `${s.count} plants ${tag('illustrative')}` : s.count != null ? (s.count ? `${s.count} records` : 'empty') : 'on'}</span></li>`; };
    return `<figure class="ab-fig">${svg(V, h + deco, { label: 'Plan of beds B1 and A1 with the walks between them: strategy zones, light assumed in A1, unknown in B1' })}
      ${keyRow(...z.map((zz) => [zz.color, esc(zz.name)]), ['#b7894d', 'project assumption', 'line'], ['#9c9583', 'unknown', 'dot'])}</figure>
      ${pan('Scope, intent and strategy', `<blockquote class="gp-said">${esc(C.define.intent)}</blockquote>
        ${z.map((zz) => `<div class="gp-zone">${swatch(zz.color)}<b>${esc(zz.name)}</b> · ${esc(sys(zz.system))} · ${esc(LOGICS[zz.logic].name)}<p>${esc(zz.why[0] || '')}</p></div>`).join('')}
        <h4>Active knowledge</h4><ul class="gp-list">${srcRow('foundation', 'Foundation')}${srcRow('site', 'Site plant list')}${srcRow('project', 'Project')}${srcRow('personal', 'Personal (first use)')}${srcRow('illustrative', 'Teaching layer')}</ul>
        <p class="ab-note">Sun, soil moisture and pH: no data for Detroit, so they stay <b>unknown</b>. A1’s sun is a project assumption made for this example.</p>`)}`;
  }
  if (ST.stage === 'structure') {
    const mode = ST.sub.structure; const cellsFor = (b) => mode === 'strategy' ? C.logics[C.chosen[b]].beds[b].cells : C.logics[mode].beds[b].cells;
    let h = ground(C, V, { label: false }); let tot = 0;
    for (const b of C.site.beds.filter((q) => q.inCase)) { const cs = cellsFor(b.id); tot += cs.length; cs.forEach((c, i) => { h += `<path d="${pd(c.geom, V)}" fill="${i % 2 ? '#efe9db' : '#f8f4ea'}" stroke="#5c5648" stroke-width=".9"/>`; }); for (const c of cs) h += `<text class="pl-cell" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 3.5).toFixed(1)}" text-anchor="middle">${esc(c.label)}</text>`; h += `<path d="${pd(b.geom, V)}" fill="none" stroke="#27241f" stroke-width="1.3"/>`; }
    const rows = C.site.beds.filter((q) => q.inCase).map((b) => { const lg = mode === 'strategy' ? C.chosen[b.id] : mode; const r = C.logics[lg].beds[b.id]; const a = r.cells.reduce((s, c) => s + c.area, 0) / r.cells.length; return `<div class="gp-zone"><b>${esc(b.code)} · ${esc(LOGICS[lg].name)}</b> — ${r.cells.length} cells, mean ${a.toFixed(1)} m²<p>${esc(r.explanation || '')}</p>${(r.notes || []).filter((n) => !/^Sun, soil/.test(n)).slice(0, 1).map((n) => `<p class="gp-mono">${esc(n)}</p>`).join('')}</div>`; }).join('');
    return `<figure class="ab-fig">${subBar('structure')}${svg(V, h + deco, { label: `Numbered cells of B1 and A1, ${mode}` })}</figure>
      ${pan(`${tot} numbered cells`, `${rows}<p class="ab-note">A cell is a place, not a plant. The same input always gives the same cells and the same numbers.</p>`)}`;
  }
  if (ST.stage === 'compose') {
    const mode = ST.sub.compose; const list = allPlants(C.inst);
    if (mode === 'brush') return brushStage();
    let h = ground(C, V, { label: false });
    if (mode === 'paint') {
      for (const c of C.cells) { const a = C.assignments[c.id]; h += `<path d="${pd(c.geom, V)}" fill="${a ? mixC(a.mix) : '#eee'}" fill-opacity=".38" stroke="#5c5648" stroke-width=".8"/>`; }
      h += plants(list, V, C, { colour: 'species', alpha: 0.5, scale: 0.36 });
      for (const c of C.cells) { const a = C.assignments[c.id]; if (!a) continue; const n = mixN(a.mix); h += `<circle cx="${V.X(c.center[0]).toFixed(1)}" cy="${V.Y(c.center[1]).toFixed(1)}" r="9" fill="${mixC(a.mix)}" stroke="#fffdf8" stroke-width="1.5"/><text class="pl-num" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 4).toFixed(1)}" text-anchor="middle">${n || ''}</text>`; }
      const ms = C.paint.map((p) => { const m = C.mixes.find((q) => q.id === p.mix); return `<div class="gp-zone">${swatch(m.color, 'dot')}<b>${p.n} · ${esc(m.name)}</b><p>${esc(sys(m.system))} · ${m.density} plants/m² · ${p.cells.length} cells</p></div>`; }).join('');
      return `<figure class="ab-fig">${subBar('compose')}${svg(V, h + deco, { label: 'Cells painted by number with three mixes, and the plants each mix placed' })}</figure>
        ${pan('Painted by number', `${ms}<p class="ab-note">The spatial logic gives the numbers; a mix is a reusable recipe painted onto them. Each cell then fills itself with plants from its mix.</p>`)}`;
    }
    h += plants(list, V, C, { colour: 'layer', alpha: 0.85, scale: 0.36 });
    const by = { base: 0, overlay: 0, ephemeral: 0 }; for (const p of list) by[p.s]++; const area = C.perf.planted || C.cells.reduce((a, c) => a + c.area, 0);
    return `<figure class="ab-fig">${subBar('compose')}${svg(V, h + deco, { label: 'Placed plants coloured by functional layer' })}${keyRow([LAYER_C.base, 'Base', 'dot'], [LAYER_C.overlay, 'Overlay', 'dot'], [LAYER_C.ephemeral, 'Bulbs', 'dot'])}</figure>
      ${pan('Three layers, three rules', `<dl class="st-m">${metric(n0(by.base), 'Base plants · by area share and spacing')}${metric(n0(by.overlay), 'Overlay plants · by count per m²')}${metric(n0(by.ephemeral), 'Bulbs · in drifts, by cover')}${metric((list.length / area).toFixed(1), 'plants per m² planted, all layers')}</dl>
        <p class="ab-note">Each layer is its own 100 %. Overlay and bulbs are added to the base; they never share one percentage with it.</p>`)}`;
  }
  // explore
  return exploreStage(V, deco);
}

// ---------------------------------------------------------------- Compose · one brush gesture (the live brush's own evaluation)
function brushBox() { const B = C.brush; const xs = [B.a[0], B.b[0]], ys = [B.a[1], B.b[1]]; const m = B.r + 3.2; return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m]; }
function cap(B, V) { const ang = Math.atan2(B.b[1] - B.a[1], B.b[0] - B.a[0]); const nx = -Math.sin(ang), ny = Math.cos(ang); const r = B.r; const A = (p, s) => [V.X(p[0] + nx * r * s), V.Y(p[1] + ny * r * s)]; const a1 = A(B.a, 1), b1 = A(B.b, 1), b2 = A(B.b, -1), a2 = A(B.a, -1); const R = r * V.k; return `M${a1}L${b1}A${R} ${R} 0 0 0 ${b2}L${a2}A${R} ${R} 0 0 0 ${a1}Z`; }
function brushLayers(V, { show = 'all' } = {}) {
  const B = C.brush; let h = ground(C, V, { label: false });
  const cellsIn = C.cells.filter((c) => c.geom.some((poly) => poly[0].some(([x, y]) => x > V.box[0] && x < V.box[2] && y > V.box[1] && y < V.box[3])));
  for (const c of cellsIn) { const a = C.assignments[c.id]; h += `<path d="${pd(c.geom, V)}" fill="${a ? mixC(a.mix) : '#eee'}" fill-opacity=".12" stroke="#a39c8c" stroke-width=".7"/>`; }
  return { h, cellsIn };
}
function brushStage() {
  const B = C.brush; const box = brushBox(); const V = view(box, W); const { h: g0, cellsIn } = brushLayers(V);
  const touched = new Set(Object.keys(C.inst)); let h = g0;
  const near = allPlants(Object.fromEntries(cellsIn.map((c) => [c.id, C.inst[c.id] || []])));
  h += plants(near, V, C, { colour: 'layer', alpha: 0.55, scale: 0.4 });
  h += `<path d="${cap(B, V)}" fill="rgba(39,36,31,.04)" stroke="#27241f" stroke-width="1.4" stroke-dasharray="6 4"/>`;
  const inner = { ...B, r: B.r * (1 - B.softBand) }; h += `<path d="${cap(inner, V)}" fill="none" stroke="#27241f" stroke-width=".8" stroke-dasharray="2 3"/>`;
  h += `<path d="M${B.samples.map((p) => `${V.X(p[0]).toFixed(1)},${V.Y(p[1]).toFixed(1)}`).join('L')}" fill="none" stroke="#b04f36" stroke-width="2.2" stroke-linecap="round"/>`;
  for (const p of B.staged) h += `<circle cx="${V.X(p.x).toFixed(1)}" cy="${V.Y(p.y).toFixed(1)}" r="${Math.max(2.6, p.sp * 0.42 * V.k).toFixed(1)}" fill="none" stroke="${LAYER_C[p.s]}" stroke-width="2"/>`;
  for (const k of B.removedPos) { const [x, y] = k.split(',').map(Number); const X = V.X(x), Y = V.Y(y); h += `<path d="M${X - 3} ${Y - 3}L${X + 3} ${Y + 3}M${X + 3} ${Y - 3}L${X - 3} ${Y + 3}" stroke="#b04f36" stroke-width="1.4"/>`; }
  for (const r of B.rejected) h += `<circle cx="${V.X(r.x).toFixed(1)}" cy="${V.Y(r.y).toFixed(1)}" r="2" fill="#b04f36" opacity=".55"/>`;
  const L = B.light; const res = B.result;
  return `<figure class="ab-fig">${subBar('compose')}${svg(V, h + scaleBar(V, 18, V.H - 16, 2), { label: 'One brush gesture across the walk from A1 into B1: footprint, soft rim, plants added, replaced and turned away' })}
    ${keyRow(['#b04f36', 'gesture', 'line'], ['#27241f', 'footprint · soft rim', 'line'], [LAYER_C.base, 'added, Base', 'dot'], [LAYER_C.overlay, 'added, Overlay', 'dot'], ['#b04f36', '× replaced · • turned away', 'dot'])}</figure>
    ${pan('One gesture, validated while you drag', `<dl class="st-m">${metric(res.added, 'plants added')}${metric(res.removed, 'plants replaced, same layers')}${metric(res.kept, 'bulbs kept underneath')}${metric(`${res.cells} · ${res.beds}`, 'cells · beds touched; the walk is skipped')}</dl>
      <ul class="gp-list"><li><span>Light in A1</span><span>${esc(L.a.value || 'unknown')} ${L.a.source ? tag('assumption', 'project assumption') : ''} → mix ${esc(L.fitA ? L.fitA.cat : '')}</span></li><li><span>Light in B1</span><span>unknown → mix ${esc(L.fitB ? L.fitB.cat : '')}</span></li><li><span>Turned away</span><span>${B.rej.edge} bed edge · ${B.rej.clearance} spacing · ${B.rej.light} light</span></li></ul>
      <p class="ab-note">${esc(C.mixes.find((m) => m.id === B.mixId).name)}, Base + Overlay, ⌀ ${(B.r * 2).toFixed(1)} m, soft edge. Hover, drag and release run one function, so the preview is the result. <a href="#brush">The seven steps</a></p>`)}`;
}

// ---------------------------------------------------------------- Explore: the same plants, read by month
function monthRow() { return `<div class="gp-mrow" role="group" aria-label="Month"><button type="button" class="play" data-play aria-label="${ST.playing ? 'Pause' : 'Play the months'}">${ST.playing ? '❚❚' : '▶'}</button>${MONTHS.map((m, i) => `<button type="button" data-month="${i + 1}" aria-pressed="${ST.month === i + 1}">${m[0]}</button>`).join('')}</div>`; }
function exploreStage(V, deco) {
  const mode = ST.sub.explore; const list = allPlants(C.inst); const mo = ST.month; const M = C.months[mo];
  let fig = '';
  if (mode === 'plan') { const h = ground(C, V, { label: false }) + plants(list, V, C, { colour: 'species', month: mo, scale: 0.4, alpha: 0.92 }); fig = svg(V, h + deco, { label: `Plan of the placed plants in ${MONTHS[mo - 1]}: flowering plants in their flower colour` }) + keyRow(['#c46a3a', 'flowering (flower colour)', 'dot'], ['#7a8f4e', 'leaf only', 'dot'], ['#d9d4c8', 'flowering unknown', 'dot']); }
  else if (mode === 'axo') { const B = C.brush; const cx = (B.a[0] + B.b[0]) / 2, cy = (B.a[1] + B.b[1]) / 2; const box = [cx - 7.5, cy - 7.5, cx + 7.5, cy + 7.5]; fig = axo(C, list, box, { W, month: mo, label: `Axonometric of a 15 × 15 m piece across B1, the walk and A1 in ${MONTHS[mo - 1]}` }) + `<p class="gp-key"><span>15 × 15 m across the walk, at the brush gesture · plant forms at nominal height</span></p>`; }
  else if (mode === 'diagram') { let h = ground(C, V, { label: false }); for (const c of C.cells) { const a = C.assignments[c.id]; if (!a) continue; for (const f of a.fragments) { h += `<path d="${pd(f.geom || c.geom, V)}" fill="${mixC(f.mix)}" fill-opacity="${f.geom ? 0.55 : 0.32}" stroke="${f.edge === 'soft' ? '#27241f' : 'none'}" stroke-dasharray="3 3"/>`; if (f.edge === 'soft') h += `<path d="${pd(f.geom, V)}" fill="url(#h-soft)"/>`; } h += `<path d="${pd(c.geom, V)}" fill="none" stroke="#fffdf8" stroke-width="1.2"/>`; }
    fig = svg(V, h + deco, { label: 'Communities: each cell’s mix, and the brushed community that crosses the walk with a soft edge' }) + keyRow(...C.paint.map((p) => [mixC(p.mix), esc(C.mixes.find((m) => m.id === p.mix).name)]), ['#27241f', 'brushed, soft edge', 'line']); }
  else if (mode === 'season') fig = seasonChart(list, mo);
  else fig = perfChart(mo);
  const groups = (M.groups || []).filter((g) => g.n).sort((a, b) => b.n - a.n).slice(0, 5).map((g) => `${esc(g.g)} ${g.n}`).join(' · ') || 'none known';
  return `<figure class="ab-fig">${subBar('explore')}${fig}${monthRow()}</figure>
    ${pan(`${MONTHS[mo - 1]}: ${n0(M.flowering)} plants in flower`, `<dl class="st-m">${metric(M.perM2 ?? '—', 'flowering plants per m² planted')}${metric(`${M.resourceCells} / ${C.cells.length}`, 'cells with a known resource')}${metric(n0(M.unknown), 'plants with flowering unknown')}${metric(M.components, 'connected resource groups')}</dl>
      <ul class="gp-list"><li><span>Visitor groups recorded</span><span>${groups}</span></li><li><span>Strong cells (≥ ${PERF.strongPerM2} per m²)</span><span>${M.strongCells}</span></li></ul>
      <p class="ab-note">Counted from the placed plants, not from the recipe. Months show seasonal flowering, not growth or succession. Unknown is never counted as “no flowers”.</p>
      <p class="ab-note">In Design, an issue here opens the cell or mix behind it in Compose; changing the mix recomputes this view.</p>`)}`;
}
function seasonChart(list, mo) {
  const cnt = {}; for (const p of list) cnt[p.p] = (cnt[p.p] || 0) + 1;
  const known = Object.keys(cnt).filter((id) => C.phen[id].f.includes('yes')); const unk = Object.keys(cnt).filter((id) => !C.phen[id].f.includes('yes')); const unkN = unk.reduce((a, id) => a + cnt[id], 0);
  const ids = known.sort((a, b) => { const fa = C.phen[a].f.indexOf('yes'), fb = C.phen[b].f.indexOf('yes'); return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || cnt[b] - cnt[a]; });
  const rowH = 19, top = 26, lw = 250, cw = (W - lw - 60) / 12; const H = top + (ids.length + 2) * rowH + 10; let g = '';
  MONTHS.forEach((m, i) => { g += `<text class="pl-k" x="${lw + i * cw + cw / 2}" y="16" text-anchor="middle"${i + 1 === mo ? ' style="fill:#27241f;font-weight:600"' : ''}>${m[0]}</text>`; });
  g += `<rect x="${lw + (mo - 1) * cw}" y="20" width="${cw}" height="${H - 24}" fill="rgba(39,36,31,.05)"/>`;
  ids.forEach((id, r) => { const y = top + r * rowH; const s = C.species[id]; const ph = C.phen[id]; const src0 = ph.bloom ? ph.bloom.source : null;
    g += `<text x="0" y="${y + 13}" style="font:italic 500 12.5px var(--pi-sans);fill:#27241f">${esc(nmTxt(C, id).slice(0, 38))}</text><text class="pl-k" x="${lw - 8}" y="${y + 12}" text-anchor="end">${cnt[id]}</text>`;
    ph.f.forEach((v, i) => { if (v === 'yes') g += `<rect x="${(lw + i * cw + 1).toFixed(1)}" y="${y + 3}" width="${(cw - 2).toFixed(1)}" height="${rowH - 6}" rx="2" fill="${s.flower}" stroke="${src0 === 'illustrative' ? '#b7894d' : '#3b5538'}" stroke-dasharray="${src0 === 'illustrative' ? '3 2' : ''}" stroke-width=".8"/>`; else if (v === 'unknown') g += `<rect x="${(lw + i * cw + 1).toFixed(1)}" y="${y + 7}" width="${(cw - 2).toFixed(1)}" height="2" fill="#d9d4c8"/>`; }); });
  { const y = top + (ids.length + 0.6) * rowH; g += `<line x1="0" x2="${W - 60}" y1="${y - 4}" y2="${y - 4}" stroke="#e5dfd2"/><text x="0" y="${y + 12}" style="font:500 11.5px var(--pi-sans);fill:#716b5c">${unk.length} more species: flowering unknown</text><text class="pl-k" x="${lw - 8}" y="${y + 12}" text-anchor="end">${unkN}</text><rect x="${lw}" y="${y + 6}" width="${12 * cw}" height="2" fill="#d9d4c8"/>`; }
  return `<svg class="gp-plan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Season of bloom of the ${ids.length} species placed, with plant counts" style="max-height:none">${g}</svg>${keyRow(['#b7894d', 'illustrative value', 'line'], ['#3b5538', 'project or source record', 'line'], ['#d9d4c8', 'unknown', 'line'])}`;
}
function perfChart(mo) {
  const H = 350, top = 20, bot = 56, lw = 46, cw = (W - lw - 10) / 12; const mx = Math.max(...Object.values(C.months).map((m) => m.perM2 || 0)) || 1; let g = '';
  for (let t = 0; t <= 4; t++) { const v = (mx * t) / 4; const y = H - bot - ((H - top - bot) * t) / 4; g += `<line x1="${lw}" x2="${W}" y1="${y}" y2="${y}" stroke="#e5dfd2"/><text class="pl-k" x="${lw - 6}" y="${y + 4}" text-anchor="end">${v.toFixed(2)}</text>`; }
  for (let i = 1; i <= 12; i++) { const m = C.months[i]; const h = ((m.perM2 || 0) / mx) * (H - top - bot); const x = lw + (i - 1) * cw + 6; const uh = Math.min(H - top - bot, (m.unknown / Math.max(1, m.placed)) * (H - top - bot));
    g += `<rect x="${x}" y="${H - bot - h}" width="${cw - 12}" height="${h}" fill="${i === mo ? '#8a3b1e' : '#c56b33'}" opacity="${i === mo ? 1 : 0.7}"/>`;
    g += `<text class="pl-k" x="${x + (cw - 12) / 2}" y="${H - bot + 16}" text-anchor="middle"${i === mo ? ' style="fill:#27241f;font-weight:600"' : ''}>${MONTHS[i - 1]}</text><text class="pl-k" x="${x + (cw - 12) / 2}" y="${H - bot + 30}" text-anchor="middle">${m.resourceCells}</text><text class="pl-k" x="${x + (cw - 12) / 2}" y="${H - bot + 44}" text-anchor="middle">${Math.round((m.unknown / Math.max(1, m.placed)) * 100)} %</text>`; }
  g += `<text class="pl-k" x="${lw}" y="12">flowering plants per m² planted</text><text class="pl-k" x="${lw - 6}" y="${H - bot + 30}" text-anchor="end">cells</text><text class="pl-k" x="${lw - 6}" y="${H - bot + 44}" text-anchor="end">unk.</text>`;
  return `<svg class="gp-plan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Flowering plants per square metre by month, with the share of plants whose flowering is unknown" style="max-height:none">${DEFS}${g}</svg>${keyRow(['#c56b33', 'flowering plants per m²'], ['', 'cells: cells with a known resource · unk.: plants whose flowering is unknown'])}`;
}

// ---------------------------------------------------------------- below the stage
function below() {
  return `${sec('chain', 'From bed to plant', 'The chain behind every cell of the example.', chain(), 'wide')}
  ${sec('five', 'Five decisions, kept apart', 'The core of the method: each is made by a different party and can change alone.', five())}
  ${sec('mix', 'One mix, read closely', `${esc(C.mixes[0].name)} in bed B1: the recipe, a plan sample and a section, all from placed plants.`, mixClose())}
  ${sec('brush', 'One gesture, seven steps', 'The live brush turns the rules into something like painting by number.', brushSteps(), 'wide')}
  <h2 class="ab-below">The rules behind each view</h2>
  ${rules()}
  ${go([routes.method, 'The research behind the method'], [routes.data, 'Where each value comes from'])}`;
}

// six small plans of the same two beds
function chain() {
  const box = caseBox(); const V = view(box, 220); const list = allPlants(C.inst); const inC = C.site.beds.filter((b) => b.inCase);
  const out = (inner) => svg(V, inner, { label: '' });
  const bedsOnly = ground(C, V, { label: false, context: false });
  const logic = (() => { let h = ground(C, V, { label: false, context: false }); for (const b of inC) { const lg = C.chosen[b.id]; for (const c of C.logics[lg].beds[b.id].cells) h += `<path d="${pd(c.geom, V)}" fill="none" stroke="#8a8373" stroke-width=".7" stroke-dasharray="3 2"/>`; const c0 = centroid(b.geom); h += `<text class="pl-k" x="${V.X(c0[0]).toFixed(1)}" y="${V.Y(c0[1]).toFixed(1)}" text-anchor="middle" style="fill:#27241f;font-size:11px">${esc(LOGICS[lg].name)}</text>`; } return h; })();
  const numbered = (() => { let h = ground(C, V, { label: false, context: false }); for (const c of C.cells) h += `<path d="${pd(c.geom, V)}" fill="#f8f4ea" stroke="#5c5648" stroke-width=".7"/><text class="pl-cell" style="font-size:7.5px" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 2.5).toFixed(1)}" text-anchor="middle">${esc(c.label.split('·')[1])}</text>`; return h; })();
  const mixes = (() => { let h = ground(C, V, { label: false, context: false }); for (const c of C.cells) { const a = C.assignments[c.id]; h += `<path d="${pd(c.geom, V)}" fill="${a ? mixC(a.mix) : '#eee'}" fill-opacity=".55" stroke="#fffdf8" stroke-width=".8"/><text class="pl-cell" style="font-size:8px" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 3).toFixed(1)}" text-anchor="middle">${a ? mixN(a.mix) || '' : ''}</text>`; } return h; })();
  const layers = bedsOnly + plants(list, V, C, { colour: 'layer', scale: 0.5, min: 0.55, alpha: 0.85 });
  const inst = bedsOnly + plants(list, V, C, { colour: 'species', scale: 0.5, min: 0.55, alpha: 0.9 });
  const P = [['Planting beds', `${inC.length} beds · ${inC.reduce((a, b) => a + b.area, 0).toFixed(0)} m²`, bedsOnly], ['Spatial logic', 'bands · honeycomb', logic], ['Numbered cells', `${C.cells.length} cells`, numbered], ['Planting mixes', `${C.paint.length} mixes by number`, mixes], ['Functional layers', 'base · overlay · bulbs', layers], ['Plant instances', `${n0(list.length)} plants`, inst]];
  return `<div class="gp-chain">${P.map(([t, s, h], i) => `<figure>${out(h)}<figcaption><b><span class="gp-n">${i + 1}</span>${t}</b><span>${s}</span></figcaption></figure>`).join('')}</div>`;
}

function five() {
  const ob = C.define.brief && C.define.brief.objectives || {}; const fl = ob.flowering && ob.flowering.on ? `flowering ${MONTHS[(ob.flowering.months || [4])[0] - 1]}–${MONTHS[(ob.flowering.months || [10]).slice(-1)[0] - 1]}` : null;
  const objs = [fl, ob.pollinators && ob.pollinators.on ? 'pollinators' : null, ob.continuity && ob.continuity.on ? 'spatial continuity' : null, ob.suitability && ob.suitability.on ? 'plant suitability' : null].filter(Boolean).join(' · ');
  const logics = C.site.beds.filter((b) => b.inCase).map((b) => `${b.code} ${LOGICS[C.chosen[b.id]].name} (${C.cells.filter((c) => c.bed === b.id).length} cells)`).join(' · ');
  const systems = [...new Set(C.paint.map((p) => sys(C.mixes.find((m) => m.id === p.mix).system)))].join(' · ');
  const rows = [
    ['Design Objective', 'What the planting should do.', 'the designer; Rules mode reads the words', objs || '—', ''],
    ['Spatial Logic', 'How a bed becomes numbered cells.', 'the engine, from edges, walks, slope and crowns', logics, 'core'],
    ['Planting System', 'The principles of a community: roles and layers.', 'a template from the course (P34)', systems, 'core'],
    ['Planting Mix', 'A concrete recipe: species, roles, shares, densities per layer.', 'the designer, from a template or a legend recipe', C.paint.map((p) => esc(C.mixes.find((m) => m.id === p.mix).name)).join(' · '), 'core'],
    ['Plant Arrangement', 'Where each plant stands, at what spacing, in which layer.', 'the arrangement engine, validated', `${n0(allPlants(C.inst).length)} plants, spacing checked across cells`, ''],
  ];
  return `<table class="gp-five"><thead class="sr"><tr><th>Decision</th><th>What it decides</th><th>Made by</th><th>In this example</th></tr></thead><tbody>${rows.map(([a, b, c, d, cls]) => `<tr class="${cls}"><th>${a}</th><td class="what">${b}<br><span class="gp-mono">${c}</span></td><td class="here">${d}</td></tr>`).join('')}</tbody></table>
    <p class="ab-note">Spatial logic makes the places; the system says what a community needs; the mix fills those needs with plants; the arrangement puts each plant down. Changing one never silently changes another.</p>`;
}

function mixClose() {
  const m = C.mixes.find((q) => q.id === C.MIX.matrix) || C.mixes[0]; const bedCells = C.cells.filter((c) => c.bed === 'bed.B1'); const list = bedCells.flatMap((c) => C.inst[c.id] || []);
  const rows = m.layers.map((L) => { const tot = L.members.reduce((a, q) => a + (L.basis === 'area' ? q.share : q.proportion), 0) || 1; let x = 0; const bar = L.members.map((q) => { const w = ((L.basis === 'area' ? q.share : q.proportion) / tot) * 100; const sp = C.species[q.p] || {}; const r = `<rect x="${x.toFixed(2)}" y="0" width="${Math.max(0.3, w - 0.4).toFixed(2)}" height="14" fill="${L.slot === 'base' ? sp.leaf : sp.flower}"/>`; x += w; return r; }).join('');
    return `<div class="gp-layer"><p><span class="gp-tag l-${L.slot}">${LAYER_N[L.slot]}</span> <b>${m.layerDensity[L.id]} plants/m²</b> <span class="gp-mono">${L.basis === 'area' ? 'shares of the area, each at its own spacing' : L.basis === 'drift' ? `drifts over ${Math.round(L.coverage * 100)} % of the area, ${L.densityInDrift} per m² inside` : `${L.density} per m² over the base`}</span></p>
      <svg viewBox="0 0 100 14" preserveAspectRatio="none" class="gp-bar" aria-hidden="true">${bar}</svg>
      <p class="gp-names">${L.members.map((q) => `${nm(C, q.p)} <span class="gp-mono">${L.basis === 'area' ? `${Math.round(q.share * 1000) / 10} % · ${q.spacing} m` : `${Math.round(q.proportion * 100)} %`}</span>`).join(' · ')}</p></div>`; }).join('');
  // plan sample 6 × 4 m around the middle cell of B1, and a section through it
  const mid = bedCells[Math.floor(bedCells.length / 2)].center; const box = [mid[0] - 3, mid[1] - 2, mid[0] + 3, mid[1] + 2]; const V = view(box, 420);
  const inBox = list.filter((p) => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3]);
  const plan = svg(V, `<rect width="${V.W}" height="${V.H}" fill="#fffdf8"/>` + plants(inBox, V, C, { colour: (p, s) => (p.s === 'base' ? s.leaf : p.s === 'overlay' ? s.flower : '#b3a7c6'), scale: 0.5, alpha: 0.9 }) + `<line x1="0" y1="${V.H / 2}" x2="${V.W}" y2="${V.H / 2}" stroke="#b04f36" stroke-dasharray="5 4"/><text class="pl-k" x="6" y="${V.H / 2 - 6}" style="fill:#b04f36">section</text>` + scaleBar(V, 12, V.H - 10, 1), { label: 'A 6 by 4 metre plan sample of placed plants in bed B1' });
  const sx = section(C, list, [box[0], mid[1]], [box[2], mid[1]], { W: 420, H: 170, band: 0.7, label: 'Section through the plan sample' });
  return `<div class="ab-two"><div>${rows}</div>
    <div><figure class="gp-wide">${plan}${sx.svg}<figcaption>6 × 4 m of B1 as placed: ${inBox.length} plants; the section shows the ${sx.n} within 0.7 m of the line, at nominal heights.</figcaption></figure></div></div>`;
}

// the seven steps of one gesture, from the stroke the engine actually evaluated
function brushSteps() {
  const B = C.brush; const box = brushBox(); const V = view(box, 210); const { h: base, cellsIn } = brushLayers(V);
  const clipId = 'gp-cells'; const clip = `<clipPath id="${clipId}"><path d="${cellsIn.map((c) => pd(c.geom, V)).join('')}"/></clipPath>`;
  const foot = `<path d="${cap(B, V)}" fill="rgba(39,36,31,.06)" stroke="#27241f" stroke-width="1.1" stroke-dasharray="5 3"/>`;
  const line = `<path d="M${B.samples.map((p) => `${V.X(p[0]).toFixed(1)},${V.Y(p[1]).toFixed(1)}`).join('L')}" fill="none" stroke="#b04f36" stroke-width="2.2" stroke-linecap="round"/>`;
  const dots = B.samples.map((p) => `<circle cx="${V.X(p[0]).toFixed(1)}" cy="${V.Y(p[1]).toFixed(1)}" r="1.8" fill="#b04f36"/>`).join('');
  const plantable = `<g clip-path="url(#${clipId})"><path d="${cap(B, V)}" fill="#5b7a57" fill-opacity=".32"/></g>${foot}`;
  const envH = (() => { let h = ''; for (const b of C.site.beds.filter((q) => q.inCase)) h += `<g clip-path="url(#${clipId})"><path d="${pd(b.plantable, V)}" fill="url(#${C.define.assume[b.id] ? 'h-assume' : 'h-unknown'})"/></g>`; return h + foot; })();
  const cand = foot + B.candidates.map((q) => `<circle cx="${V.X(q.x).toFixed(1)}" cy="${V.Y(q.y).toFixed(1)}" r="1.5" fill="${LAYER_C[q.s]}"/>`).join('');
  const valid = foot + B.staged.map((p) => `<circle cx="${V.X(p.x).toFixed(1)}" cy="${V.Y(p.y).toFixed(1)}" r="1.8" fill="${LAYER_C[p.s]}"/>`).join('') + B.rejected.map((r) => `<circle cx="${V.X(r.x).toFixed(1)}" cy="${V.Y(r.y).toFixed(1)}" r="2.3" fill="none" stroke="#b04f36" stroke-width="1.1"/>`).join('');
  const placed = (() => { const near = allPlants(Object.fromEntries(cellsIn.map((c) => [c.id, C.inst[c.id] || []]))); return plants(near, V, C, { colour: 'species', scale: 0.45, alpha: 0.95 }); })();
  const S = [
    ['User gesture', `${B.samples.length} pointer samples`, line + dots],
    ['Brush footprint', `⌀ ${(B.r * 2).toFixed(1)} m · soft rim ${Math.round(B.softBand * 100)} %`, foot + line],
    ['Plantable area', `${B.result.cells} cells; walk and edges cut`, plantable],
    ['Environment and niche', 'A1 sun, assumed · B1 unknown', envH],
    ['Candidate plants', `${B.candidates.length} lattice points of the mix`, cand],
    ['Spatial validation', `${B.rej.edge} edge · ${B.rej.clearance} spacing · ${B.rej.light} light`, valid],
    ['Actual placement', `+${B.result.added} · replaced ${B.result.removed}`, placed + foot],
  ];
  return `<div class="gp-chain seven">${S.map(([t, s, h], i) => `<figure>${svg(V, `<defs>${clip}</defs>` + base + h, { label: t })}<figcaption><b><span class="gp-n">${i + 1}</span>${t}</b><span>${esc(s)}</span></figcaption></figure>`).join('')}</div>
  <p class="gp-fcap">The same function runs on hover (a preview at the cursor), on every pointer move while the button is held (plants appear as you drag) and on release (the staged plants are committed, nothing is regenerated). A designer paints; the engine checks edges, trunks, spacing across cells, light and layers at every step.</p>`;
}

function rules() {
  const R = C.meta.rules; const strat = C.define.strategy;
  return [
    fold('r-define', 'Define', 'What Rules mode read in the words, and what it left alone.', `<table class="gp-tbl"><thead><tr><th>Read</th><th>Rule applied</th></tr></thead><tbody>${(strat.rules || []).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>
      <p>Scope = the confirmed beds; focus is only the camera. Light at a point: the designer’s project assumption for the bed, else the tree-crown proxy (probable shade), else unknown. Open ground is never treated as verified sun.</p>${tag('now', 'implemented')} <span class="gp-mono">src/flow/strategy.js · fill.js makeEnv</span>`),
    fold('r-structure', 'Structure', 'Three spatial logics; adaptive, deterministic, numbered.', `<table class="gp-tbl"><thead><tr><th>Logic</th><th>How it adapts</th><th>Sizes (m)</th></tr></thead><tbody>
      <tr><td>Honeycomb</td><td>Hexagonal cells; the lattice rotation is chosen per bed from candidate angles.</td><td class="n">${LOGICS.honeycomb.sizes.join(' · ')}</td></tr>
      <tr><td>Bands</td><td>Curved distance bands from the bed edge along a walk, cut into segments ${RULES.bandSegment} × the band width; straight bands turn to the contours where relief ≥ ${RULES.reliefForGradientM} m.</td><td class="n">${LOGICS.bands.sizes.join(' · ')}</td></tr>
      <tr><td>Organic patches</td><td>Clipped Voronoi with Lloyd relaxation; of six seed layouts, the one mixing the fewest known conditions (crown, path edge, elevation) wins.</td><td class="n">${LOGICS.organic.sizes.join(' · ')}</td></tr></tbody></table>
      <p>Fragments under ${Math.round(RULES.fragmentMergeFraction * 100)} % of a cell merge into a neighbour; neighbours share ≥ ${RULES.adjacencyMinSharedM} m of edge; conditions are sampled every ${RULES.sampleStepM} m.</p>${tag('now', 'implemented')} <span class="gp-mono">src/flow/spatial.js generateCells</span>`),
    fold('r-compose', 'Compose', 'Layers, lattice, validation, light, soft edge.', `<p>Base members take shares of the area, each on a hex lattice at its own spacing (density = share ÷ (0.866 × spacing²)); Overlay members are counted per m² over the base; Bulbs fill drifts that cover part of the area. Candidates come from a world-anchored lattice per mix and layer, so repainting the same mix stacks nothing.</p>
      <table class="gp-tbl"><tbody><tr><td>Bed edge inset</td><td class="n">${R.edgeInsetM} m</td><td>hard outline only; internal cell edges are not inset</td></tr><tr><td>Trunk clearance</td><td class="n">${R.trunkClearanceM} m</td><td>existing trees</td></tr><tr><td>Same-layer spacing</td><td class="n">${R.sameLayerK} × spacing</td><td>checked across cell edges</td></tr><tr><td>Other layers</td><td class="n">${R.centreClearanceM} m</td><td>centre to centre</td></tr><tr><td>Brush reach</td><td class="n">${R.reachM} m</td><td>neighbouring plants loaded for spacing</td></tr><tr><td>Soft rim</td><td class="n">${Math.round(R.softBand * 100)} %</td><td>outer part of the radius; replacement falls off linearly</td></tr></tbody></table>
      <p>A conflicting plant (recorded light ≠ the light here) is swapped for a layer-mate that fits, or skipped. All values above are prototype assumptions, stated in the code.</p>${tag('now', 'implemented')} <span class="gp-mono">src/flow/fill.js · brush.js · mix.js</span>`),
    fold('r-explore', 'Explore', 'Flowering and resources, counted from placed plants.', `<p>Per month, a placed plant counts as flowering when its record says so; a <b>resource</b> when it flowers and is not wind-pollinated; unknown stays apart from both. Per-m² values use the planted area. A cell is <b>strong</b> above ${PERF.strongPerM2} resource plant per m²; adjacent cells (≥ 0.3 m shared edge, ≤ 3 m across a walk) form a potential connection, never a pollinator route.</p>
      <p>Seasonality shows phenology only. No growth, competition or succession is modelled.</p>${tag('now', 'implemented')} <span class="gp-mono">src/flow/performance.js (perf/3)</span>`),
  ].join('');
}
