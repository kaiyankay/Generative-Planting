// Generative Planting V2 shell: one app, one project state, one canvas.
//   Introduction → Choose landscape (entry, not a stage) → Define → Structure → Compose → Explore
//   Bottom view dock (one place): Plan · Axo · Diagram · Performance | Play + month timeline | undo · Back · Continue
// Knowledge is a parallel workspace drawn over the design (the design stays mounted underneath, state untouched).
import { Project } from './project.js';
import { ActiveKnowledge, MONTHS } from './knowledge.js';
import { MixReasoner } from './llm.js';
import { inside, bbox } from './spatial.js';
import { esc, ICON } from './ui.js';
import { paintFlow } from './paintflow.js';
import { Brush, BRUSH } from './brush.js';
import { showIntro } from './intro.js';
import { KnowledgeView } from './knet.js';
import * as Define from './stages/define.js';
import * as Structure from './stages/structure.js';
import * as Compose from './stages/compose.js';
import * as Explore from './stages/explore.js';

export const STAGES = [
  { id: 'define', name: 'Define', mod: Define, task: 'Strategy for the whole site' },
  { id: 'structure', name: 'Structure', mod: Structure, task: 'Spatial cells for every zone' },
  { id: 'compose', name: 'Compose', mod: Compose, task: 'Communities, painted in space' },
  { id: 'explore', name: 'Explore', mod: Explore, task: 'Observe, compare, return' },
];
const ORDER = STAGES.map((s) => s.id);
const params = new URLSearchParams(location.search);
const MODES = [
  { id: 'plan', name: 'Plan', key: 'P', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16"/></svg>', tip: 'Plan — the editing view (brush, cells, selection)' },
  { id: 'axo', name: 'Axo', key: 'A', icon: '<svg viewBox="0 0 24 24"><path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M12 13v8M12 13l9-5M12 13 3 8"/></svg>', tip: 'Axonometric 3D — observe the same plants (paint in Plan)' },
  { id: 'diagram', name: 'Diagram', key: 'D', icon: '<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="1.6"/><path d="M3 12h18M12 3v18" stroke-dasharray="1.5 2"/></svg>', tip: 'Computational diagram — structure, mix, arrangement drawn from the real data' },
  { id: 'performance', name: 'Performance', key: 'F', icon: '<svg viewBox="0 0 24 24"><path d="M12 20c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10z"/><path d="M12 8v6M9 11h6"/></svg>', tip: 'Performance — monthly flowering resource from the placed plants' },
];

export async function startFlow(ctx) {
  const { store, plan, scene, library, preset, app } = ctx;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'src/flow/flow.css'; document.head.appendChild(link);
  const fonts = document.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..700&family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=DM+Mono:wght@400;500&display=swap'; document.head.appendChild(fonts);
  document.title = 'Generative Planting — Design';
  const teaching = await fetch(preset.base + 'teaching-traits.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let P = null; const K = new ActiveKnowledge({ store, library, teaching, project: () => (P ? P.state : null) });
  P = new Project({ store, cs: ctx.cs, K, site: preset });
  const R = new MixReasoner({ K }); R.probe().then(() => F.renderPanel());
  ctx.claimsSelection = () => true;

  const shell = document.createElement('div'); shell.className = 'f-shell'; shell.id = 'fshell';
  shell.innerHTML = `
    <header class="f-top">
      <button class="f-word" id="fword" title="Introduction and landscapes">Generative Planting</button>
      <nav class="f-sections" aria-label="Workspace"><button data-ws="design" aria-pressed="true">Design</button><button data-ws="knowledge" aria-pressed="false">Knowledge</button></nav>
      <span class="f-proj"><span class="site">${esc(preset.name)}</span><input id="fname" aria-label="Design name" maxlength="60"></span>
      <nav class="f-steps" aria-label="Workflow stages" id="fsteps"></nav>
      <span class="f-save" id="fsave" aria-live="polite"></span>
    </header>
    <aside class="f-panel" id="dpanel" aria-label="Current task"></aside>
    <div class="f-insp" id="finsp" hidden role="region" aria-label="Selection"></div>
    <div class="f-hud" id="fhud" hidden role="status"></div>
    <div class="f-legend" id="flegend" hidden></div>
    <div class="f-toast" id="ftoast" hidden role="status"></div>
    <footer class="f-dock" id="fdock">
      <div class="d-views" role="radiogroup" aria-label="View">${MODES.map((m) => `<button role="radio" data-mode="${m.id}" aria-checked="false" title="${esc(m.tip)} (${m.key})"><span class="ic">${m.icon}</span><span class="lb">${m.name}</span></button>`).join('')}<button class="d-layers" id="flayers" title="Site layers (L)" aria-pressed="false"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg></span><span class="lb">Layers</span></button></div>
      <div class="d-time" id="ftime">
        <button class="d-play" id="fplay" aria-label="Play the months" title="Play / pause the months (Space)"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <div class="d-track" id="ftrack" role="slider" tabindex="0" aria-label="Month" aria-valuemin="1" aria-valuemax="12"></div>
        <span class="d-month" id="fmonth"></span>
      </div>
      <div class="d-act">
        <span class="ur"><button id="fundo" title="Undo (⌘Z)" aria-label="Undo">${ICON.undo}</button><button id="fredo" title="Redo (⇧⌘Z)" aria-label="Redo">${ICON.redo}</button></span>
        <span class="msg" id="fmsg" aria-live="polite"></span>
        <span id="fconfirm"></span>
        <button class="lnk" id="fback"></button>
        <button class="btn-p" id="fnext">Continue</button>
      </div>
    </footer>
    <div class="f-know" id="fknow" hidden></div>`;
  app.appendChild(shell);
  const $ = (s) => shell.querySelector(s);

  const F = {
    ctx, store, plan, scene, P, K, R, library, preset, shell, $, STAGES,
    panel: $('#dpanel'), insp: $('#finsp'),
    u: { bed: null, previews: null, cells: new Set(), hover: null, autoPreview: null, editor: null, issue: null, confirm: null, entry: true, playing: false, zone: null },
    stage() { return P.state.stage; },
    mod() { return STAGES.find((s) => s.id === P.state.stage).mod; },
    render() { renderSteps(); F.mod().render(F); renderDock(); renderInsp(); renderHud(); renderLegend(); F.repaint(); },
    renderPanel() { F.mod().render(F); renderDock(); renderLegend(); },
    renderDock, renderInsp, renderHud,
    repaint() { if (F._raf) return; F._raf = requestAnimationFrame(() => { F._raf = 0; plan.request(); clearTimeout(F._rp); F._rp = setTimeout(() => { if (scene && scene.active !== false) store.emit('compute', { flow: true }); }, 80); }); },
    toast(msg, { err = false, ms = 4200 } = {}) { const t = $('#ftoast'); t.textContent = msg; t.className = 'f-toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(F._tt); F._tt = setTimeout(() => { t.hidden = true; }, ms); },
    go(stage, opts = {}) {
      if (!ORDER.includes(stage)) return false;
      const cur = ORDER.indexOf(P.state.stage), to = ORDER.indexOf(stage);
      if (to > cur && !opts.force) { for (let i = cur; i < to; i++) { const g = STAGES[i].mod.gate(F); if (!g.ok) { F.toast(g.reason); return false; } } }
      F.setBrush(null); F.u.autoPreview = null; F.u.previews = null; F.u.confirm = null; F.u.entry = false; F.stopPlay();
      P.setStage(stage);
      const m = STAGES.find((s) => s.id === stage).mod; if (m.enter) m.enter(F, opts);
      F.render(); F.panel.scrollTop = 0; return true;
    },
    cellAt(x, y) { for (const c of P.allCells()) { const b = c._bb || (c._bb = bbox(c.geometry)); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (inside(c.geometry, x, y)) return c; } return null; },
    bedAt(x, y) { return P.eligibleBeds().find((b) => { const o = store.getObject(b.id); if (!o) return false; const g = o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry; return inside(g, x, y); }) || null; },
    selectCells(ids, { add = false } = {}) { if (!add) F.u.cells.clear(); for (const id of ids) { if (add && F.u.cells.has(id)) F.u.cells.delete(id); else F.u.cells.add(id); } P.setView({ selectedCell: [...F.u.cells][0] || null }); F.render(); },
    focusBounds(b, m = 6) { if (!b) return; if (ctx.st.view === 'plan') plan.fit([b[0] - m, b[1] - m, b[2] + m, b[3] + m], plan.padFor()); else if (scene && scene.setViewCenter) scene.setViewCenter((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(60, Math.max(4, 600 / Math.max(b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m)))); },
    boundsOf(geoms) { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const g of geoms) { if (!g) continue; const q = bbox(g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); } return Number.isFinite(b[0]) ? b : null; },
    focusCells(ids) { F.focusBounds(F.boundsOf(ids.map((id) => P.state.cells[id] && P.state.cells[id].geometry)), 4); },
    focusBeds(bedIds) { F.focusBounds(F.boundsOf(bedIds.map((id) => store.getObject(id)?.geometry)), 5); },
    focusBed(bedId) { F.focusBeds([bedId]); },
    // ---- live brush (Compose). mixId null = eraser
    brush: null,
    setBrush(opts) {
      if (!opts) { F.brush.stop(); plan.tool = null; if (scene) scene.setTool(null); document.getElementById('c2d').style.cursor = ''; renderHud(); F.repaint(); return; }
      F.brush.start(opts); plan.tool = brushTool; if (scene) scene.setTool(null);
      if (ctx.st.view !== 'plan') F.setMode('plan', { quiet: true });
      document.getElementById('c2d').style.cursor = 'none'; renderHud(); F.repaint();
    },
    setPaint(mixId) { F.setBrush(mixId ? { mixId, slots: null } : null); }, // V1 name
    openKnowledge(focus) { setWorkspace('knowledge', focus); },
    month() { return P.state.view.month || 6; },
    setMonth(m) { P.setView({ month: ((m - 1 + 12) % 12) + 1 }); applyPhenology(); renderTime(); renderLegend(); if (F.stage() === 'explore') F.renderPanel(); F.repaint(); },
    mode() { return P.state.view.mode || 'plan'; },
    setMode(mode, { quiet = false } = {}) {
      if (mode === 'axo' && !scene) { F.toast('3D is not available in this browser.'); mode = 'plan'; }
      if (mode === 'axo' && F.brush.active) { F.setBrush(null); if (!quiet) F.toast('Axo is for observing the same plants. The brush paints in Plan.'); }
      P.setView({ mode }); ctx.setObs(mode === 'axo' ? '3d' : 'plan'); applyPhenology(); renderDock(); renderLegend(); F.repaint();
    },
    play() { if (F.u.playing) return F.stopPlay(); F.u.playing = true; const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; const step = () => { if (!F.u.playing) return; F.setMonth(F.month() + 1); F._pt = setTimeout(step, reduce ? 1600 : 900); }; F._pt = setTimeout(step, 300); renderTime(); },
    stopPlay() { F.u.playing = false; clearTimeout(F._pt); renderTime(); },
    timelineOn() { return F.stage() === 'explore' || ['performance', 'diagram'].includes(F.mode()); },
  };
  F.brush = new Brush(F);
  ctx.flow = F; window.GPFlow = F;

  // ---------------------------------------------------------------- brush tool on the plan canvas
  let cursor = null;
  const brushTool = {
    hover(x, y) { cursor = x == null ? null : [x, y]; F.brush.hover(x, y); F.repaint(); },
    down(x, y) { cursor = [x, y]; F.brush.down(x, y); F.repaint(); },
    move(x, y) { cursor = [x, y]; F.brush.move(x, y); F._maskCache = null; F.repaint(); renderHud(); },
    up() { const r = F.brush.up(); F._maskCache = null; if (r && r.ok === false && !r.empty) F.toast(r.error || 'stroke not applied', { err: true }); else if (r && r.ok !== false) { F.toast(`${r.added - 0} plants in ${r.cells} cell${r.cells === 1 ? '' : 's'} across ${r.beds} bed${r.beds === 1 ? '' : 's'} — one undo step.`); } F.render(); },
  };
  F.brushCursor = () => cursor;
  store.flowMask = () => { if (!F.brush.stroke) return null; if (!F._maskCache || F._maskCache.n !== F.brush.stroke.removed) F._maskCache = { n: F.brush.stroke.removed, k: F.brush.removedKeys() }; return F._maskCache.k; };

  // ---------------------------------------------------------------- phenology on the plants themselves (plan): flowering / not / unknown
  function applyPhenology() {
    const on = F.timelineOn() && (F.mode() === 'performance' || (F.stage() === 'explore' && P.state.view.explore === 'seasonality'));
    if (!on) { if (store.view.phenology) store.setViewState({ month: null, phenology: null }); return; }
    const m = F.month(); const ph = new Map(); for (const sp of store.model.species) { const f = K.floweringIn(sp.id, m); ph.set(sp.index, f === 'yes' ? true : f === 'no' ? false : null); }
    store.setViewState({ month: m, phenology: ph });
  }
  F.applyPhenology = applyPhenology;

  // ---------------------------------------------------------------- top bar, dock, inspector, hud
  function renderSteps() {
    const cur = ORDER.indexOf(P.state.stage); const max = ORDER.indexOf(P.state.maxStage);
    $('#fsteps').innerHTML = STAGES.map((s, i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}<button data-st="${s.id}" class="${i < cur || (i <= max && i !== cur) ? 'done' : ''}" ${i === cur ? 'aria-current="step"' : ''} ${i > max + 1 ? 'disabled' : ''} title="${esc(s.task)}"><span class="n">${i + 1}</span><span class="lbl">${esc(s.name)}</span></button>`).join('');
    $('#fsteps').querySelectorAll('button').forEach((b) => (b.onclick = () => F.go(b.dataset.st)));
    const nm = $('#fname'); if (document.activeElement !== nm) nm.value = P.state.name;
  }
  function renderTime() {
    const show = F.timelineOn(); $('#ftime').classList.toggle('off', !show); $('#ftime').setAttribute('aria-hidden', String(!show));
    const m = F.month(); const tg = P.state.brief.objectives.flowering.on ? P.state.brief.objectives.flowering.months : [];
    const tr = $('#ftrack'); tr.setAttribute('aria-valuenow', m); tr.setAttribute('aria-valuetext', MONTHS[m - 1]);
    const series = P.perf ? Array.from({ length: 12 }, (_, i) => P.perf.byMonth[i + 1].floweringPerM2 || 0) : []; const mx = Math.max(0.01, ...series);
    tr.innerHTML = MONTHS.map((x, i) => `<button data-m="${i + 1}" class="${tg.includes(i + 1) ? 'tgt' : ''}${i + 1 === m ? ' on' : ''}" title="${x}${tg.includes(i + 1) ? ' · in your brief' : ''}${P.perf && P.perf.instances ? ` · ${P.perf.byMonth[i + 1].floweringInstances} flowering plants` : ''}" tabindex="-1"><i style="height:${series.length ? Math.round(3 + 15 * (series[i] / mx)) : 3}px"></i><span>${x[0]}</span></button>`).join('') + `<span class="knob" style="left:calc(${((m - 0.5) / 12) * 100}% - 6px)"></span>`;
    tr.querySelectorAll('button').forEach((b) => (b.onclick = () => { F.stopPlay(); F.setMonth(+b.dataset.m); }));
    $('#fmonth').textContent = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
    $('#fplay').innerHTML = F.u.playing ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    $('#fplay').setAttribute('aria-label', F.u.playing ? 'Pause' : 'Play the months'); $('#fplay').setAttribute('aria-pressed', String(F.u.playing));
  }
  function renderDock() {
    const mode = F.mode();
    shell.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
    $('#flayers').setAttribute('aria-pressed', String(!document.getElementById('layers').hidden));
    renderTime();
    const b = F.mod().bottom(F); const i = ORDER.indexOf(P.state.stage);
    $('#fback').hidden = i === 0; $('#fback').textContent = i ? `← ${STAGES[i - 1].name}` : '';
    $('#fmsg').innerHTML = b.msg || '';
    const n = $('#fnext'); n.textContent = b.next ? b.next.label : ''; n.hidden = !b.next; n.disabled = !!(b.next && !b.next.enabled); n.title = b.next && !b.next.enabled ? b.next.reason || '' : '';
    if (b.next && !b.next.enabled && b.next.reason) $('#fmsg').innerHTML = `${b.msg ? b.msg + ' · ' : ''}<span class="dim">${esc(b.next.reason)}</span>`;
    $('#fundo').disabled = !P.past.length; $('#fredo').disabled = !P.future.length;
    $('#fundo').title = P.past.length ? `Undo: ${P.past[P.past.length - 1].label} (⌘Z)` : 'Nothing to undo'; $('#fredo').title = P.future.length ? `Redo: ${P.future[P.future.length - 1].label}` : 'Nothing to redo';
    const cf = $('#fconfirm'); cf.innerHTML = '';
    if (F.u.confirm) { cf.innerHTML = `<span class="confirm"><span>${esc(F.u.confirm.text)}</span>${F.u.confirm.actions.map((a, k) => `<button class="${k ? 'lnk' : 'btn-s'}" data-k="${k}">${esc(a.label)}</button>`).join('')}</span>`; cf.querySelectorAll('button').forEach((x) => (x.onclick = () => { const a = F.u.confirm.actions[+x.dataset.k]; F.u.confirm = null; a.run(); renderDock(); })); }
  }
  shell.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => F.setMode(b.dataset.mode)));
  $('#flayers').onclick = () => { document.getElementById('btnLayers')?.click(); setTimeout(renderDock, 30); };
  $('#fplay').onclick = () => F.play();
  $('#ftrack').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { F.stopPlay(); F.setMonth(F.month() + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { F.stopPlay(); F.setMonth(F.month() - 1); e.preventDefault(); } });
  $('#fback').onclick = () => { const i = ORDER.indexOf(P.state.stage); if (i > 0) F.go(ORDER[i - 1]); };
  $('#fnext').onclick = () => { const b = F.mod().bottom(F); if (b.next && b.next.enabled) b.next.run(); };
  $('#fundo').onclick = () => { const l = P.undo(); if (l) F.toast('Undone: ' + l); };
  $('#fredo').onclick = () => { const l = P.redo(); if (l) F.toast('Redone: ' + l); };
  $('#fname').onchange = (e) => { P.state.name = e.target.value.trim() || 'Planting design'; P.save(); };
  $('#fword').onclick = () => showIntro(F, { again: true });
  function renderInsp() {
    const html = F.mod().inspector ? F.mod().inspector(F) : null;
    F.insp.hidden = !html; if (!html) return;
    F.insp.innerHTML = `<button class="x" aria-label="Close selection">${ICON.x}</button>` + html;
    F.insp.querySelector('.x').onclick = () => { F.u.cells.clear(); F.u.bedInspect = null; store.select(null); F.render(); };
    if (F.mod().bindInspector) F.mod().bindInspector(F, F.insp);
  }
  function renderHud() {
    const h = $('#fhud'); const a = F.brush.active; h.hidden = !a; if (!a) return;
    const m = a.mixId ? P.mix(a.mixId) : null; const s = F.brush.stroke;
    const slots = m ? [...new Set(m.layers.map((L) => L.slot))] : ['base', 'overlay', 'ephemeral'];
    const sel = a.slots && a.slots.length ? a.slots : slots;
    h.innerHTML = `<span class="sw" style="background:${m ? esc(m.color) : 'transparent'}"></span><b>${m ? esc(m.name) : 'Eraser'}</b>
      <span class="seg" role="group" aria-label="Layers the brush writes">${slots.map((x) => `<button data-slot="${x}" aria-pressed="${sel.includes(x)}" title="${x === 'base' ? 'base layer (matrix / blocks)' : x === 'overlay' ? 'overlay (emergents, fillers, theme)' : 'ephemerals (bulbs)'}">${x === 'base' ? 'Base' : x === 'overlay' ? 'Overlay' : 'Bulbs'}</button>`).join('')}</span>
      <label class="rad">⌀ <input type="range" id="fbr" min="${BRUSH.minR * 2}" max="${BRUSH.maxR * 2}" step="0.2" value="${(a.r * 2).toFixed(1)}" aria-label="Brush diameter in metres"><span class="num">${(a.r * 2).toFixed(1)} m</span></label>
      <span class="live num">${s ? `+${s.added} −${s.removed} · ${s.cells.size} cells` : 'hover to preview · drag to plant'}</span><button id="fbx" class="lnk">Done (Esc)</button>`;
    h.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => { const cur = new Set(sel); if (cur.has(b.dataset.slot) && cur.size > 1) cur.delete(b.dataset.slot); else cur.add(b.dataset.slot); F.brush.active.slots = slots.filter((x) => cur.has(x)); renderHud(); }));
    const r = h.querySelector('#fbr'); r.oninput = () => { F.brush.setRadius(+r.value / 2); r.nextElementSibling.textContent = (+r.value).toFixed(1) + ' m'; F.repaint(); };
    h.querySelector('#fbx').onclick = () => { F.setBrush(null); F.renderPanel(); };
  }
  function renderLegend() { const el = $('#flegend'); const html = legendHtml(F); el.hidden = !html; el.innerHTML = html || ''; el.querySelectorAll('[data-dg]').forEach((b) => (b.onclick = () => { P.setView({ diagram: b.dataset.dg }); renderLegend(); F.repaint(); })); }

  // ---------------------------------------------------------------- canvas paint hook + clicks
  store.flowPaint = (c2, T, o, phase) => paintFlow(F, c2, T, o, phase);
  for (const cv of [document.getElementById('c2d'), document.getElementById('c3d')]) {
    let down = null;
    cv.addEventListener('pointerdown', (e) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; }, true);
    cv.addEventListener('pointerup', (e) => {
      if (!down || F.brush.active || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; } down = null;
      let p = null;
      if (cv.id === 'c2d') { if (ctx.st.view !== 'plan') return; const r = cv.getBoundingClientRect(); p = plan.inv(e.clientX - r.left, e.clientY - r.top); }
      else { if (ctx.st.view === 'plan' || !scene) return; p = scene.groundAt(e.clientX, e.clientY); }
      if (!p) return; const mod = F.mod();
      setTimeout(() => { if (store.selection) store.select(null); if (mod.onCanvasClick) mod.onCanvasClick(F, p[0], p[1], null, { shift: e.shiftKey || e.metaKey }); }, 0);
    });
    cv.addEventListener('pointercancel', () => { if (F.brush.cancel()) { F.toast('Stroke cancelled.'); F.render(); } });
  }
  // wheel over the canvas with Alt: brush size (metres)
  document.getElementById('c2d').addEventListener('wheel', (e) => { if (!F.brush.active || !e.altKey) return; e.preventDefault(); e.stopPropagation(); F.brush.setRadius(F.brush.active.r * (e.deltaY > 0 ? 0.9 : 1.1)); renderHud(); F.repaint(); }, { capture: true, passive: false });

  // ---------------------------------------------------------------- Design | Knowledge
  const KV = new KnowledgeView(F, $('#fknow'));
  F.KV = KV;
  function setWorkspace(ws, focus) {
    shell.querySelectorAll('.f-sections button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ws === ws)));
    if (ws === 'knowledge') { F.setBrush(null); KV.open(focus); } else KV.close();
  }
  F.setWorkspace = setWorkspace;
  shell.querySelectorAll('.f-sections button').forEach((b) => (b.onclick = () => setWorkspace(b.dataset.ws)));

  // ---------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.stopImmediatePropagation(); if (F.brush.stroke) return; const l = e.shiftKey ? P.redo() : P.undo(); if (l) F.toast((e.shiftKey ? 'Redone: ' : 'Undone: ') + l); return; }
    if (typing) return;
    if (e.key === 'Escape') {
      if (F.brush.stroke) { e.stopImmediatePropagation(); F.brush.cancel(); F.toast('Stroke cancelled — nothing changed.'); F.render(); return; }
      if (!$('#fknow').hidden) { e.stopImmediatePropagation(); setWorkspace('design'); return; }
      if (document.getElementById('fintro')) return;
      if (F.brush.active) { e.stopImmediatePropagation(); F.setBrush(null); F.renderPanel(); return; }
      if (F.u.confirm) { e.stopImmediatePropagation(); F.u.confirm = null; renderDock(); return; }
      if (F.u.cells.size || F.u.bedInspect) { e.stopImmediatePropagation(); F.u.cells.clear(); F.u.bedInspect = null; store.select(null); F.render(); }
      return;
    }
    if (!$('#fknow').hidden || document.getElementById('fintro') || e.metaKey || e.ctrlKey || e.altKey) return;
    const md = MODES.find((m) => m.key === e.key.toUpperCase()); if (md) { e.stopImmediatePropagation(); e.preventDefault(); F.setMode(md.id); return; }
    if (e.key === ' ' && F.timelineOn() && !e.target.closest('button')) { e.preventDefault(); F.play(); return; }
    if (F.brush.active && (e.key === '[' || e.key === ']')) { F.brush.setRadius(F.brush.active.r * (e.key === '[' ? 0.85 : 1.18)); renderHud(); F.repaint(); }
  }, true);

  // ---------------------------------------------------------------- state events
  P.on((type, d) => {
    if (type === 'change') F.render();
    if (type === 'saved') { const s = $('#fsave'); s.className = 'f-save' + (d.ok && !d.error ? '' : ' err'); s.textContent = !d.ok ? 'Not saved' : d.error ? 'Saved (positions rebuilt)' : 'Saved in this browser'; s.title = d.error || (d.savedAt ? 'Saved ' + new Date(d.savedAt).toLocaleTimeString() : ''); }
    if (type === 'error') F.toast(d.message, { err: true, ms: 8000 });
  });
  K.onChange(() => { if (F._ready) { P.recompute(); applyPhenology(); F.renderPanel(); F.repaint(); } });

  // ---------------------------------------------------------------- start: intro → landscape → resume or new
  const stored = params.get('fresh') === '1' ? null : Project.stored();
  F.u.resume = stored && stored.siteId === preset.id ? { name: stored.name, stage: stored.stage, savedAt: stored.savedAt, cells: Object.keys(stored.cells || {}).length, mixes: (stored.mixes || []).length, schema: stored.schema } : null;
  F.resume = () => { const r = P.restore(stored); if (!r.ok) { F.toast(r.error, { err: true }); return; } F.u.entry = false; F.u.resume = null; const st = P.state.stage; if (P.state.view.plan && P.state.view.mode !== 'axo') { ctx.setObs('plan'); Object.assign(plan.view, P.state.view.plan); plan._fitted = true; plan.request(); } else ctx.setObs(P.state.view.mode === 'axo' ? '3d' : 'plan'); const mod = STAGES.find((s) => s.id === st).mod; if (mod.enter) mod.enter(F, { resumed: true }); applyPhenology(); F.render(); F.toast(`Resumed “${P.state.name}” at ${STAGES.find((s) => s.id === st).name}${r.migrated ? ' (migrated from V1: plant positions regenerated)' : ''}.`); };
  F.startNew = () => { P.reset(); F.u.resume = null; F.u.entry = true; F.u.cells.clear(); P.setStage('define'); Define.enter && Define.enter(F); F.render(); };
  const remember = () => { if (ctx.st.view === 'plan') P.state.view.plan = { ...plan.view }; P.saveSoon(); };
  document.getElementById('c2d').addEventListener('pointerup', remember); document.getElementById('c2d').addEventListener('wheel', () => { clearTimeout(F._wt); F._wt = setTimeout(remember, 300); }, { passive: true });
  ctx.setObs('3d');
  if (!P.state.view.mode) P.state.view.mode = 'axo';
  F._ready = true;
  library.onChange(() => { if (F._ready) F.renderPanel(); });
  if (params.get('resume') === '1' && stored) F.resume(); else { P.state.view.mode = 'axo'; }
  F.render();
  if (params.get('intro') !== '0' && params.get('resume') !== '1') showIntro(F);
  return F;
}

// a compact legend for the active view (data → colour), bottom-left of the canvas
function legendHtml(F) {
  const P = F.P, mode = F.mode(), st = P.state.stage;
  if (mode === 'performance' && P.allCells().length) {
    const m = F.month(); const b = P.perf && P.perf.byMonth[m];
    return `<b>Flowering resource · ${MONTHS[m - 1]}</b><div class="ramp"><i style="background:#F3EEE4"></i><i style="background:#F0D9A8"></i><i style="background:#E2A85C"></i><i style="background:#C56B33"></i><i style="background:#8A3B1E"></i></div><div class="rl"><span>0</span><span>flowering plants / m² (1 m pixels)</span><span>3+</span></div><div class="lg"><span class="sw hatch"></span>unknown flowering · <span class="sw ring"></span>planted, none known in flower</div>${b && b.placed ? `<div class="mono xs">${b.floweringInstances} of ${b.placed} placed plants known in flower (${Math.round((b.floweringFraction || 0) * 100)} %) · ${b.unknownInstances} unknown</div>` : ''}`;
  }
  if (mode === 'diagram' && P.allCells().length) {
    const d = P.state.view.diagram || 'arrangement';
    return `<b>Diagram · ${esc({ structure: 'Structure', mix: 'Mix', arrangement: 'Arrangement', layers: 'Layers' }[d])}</b><div class="dseg">${['structure', 'mix', 'arrangement', 'layers'].map((k) => `<button data-dg="${k}" aria-pressed="${k === d}">${{ structure: 'Structure', mix: 'Mix', arrangement: 'Arrangement', layers: 'Layers' }[k]}</button>`).join('')}</div><div class="xs dim">${d === 'structure' ? 'cell boundaries and numbers' : d === 'mix' ? 'one colour per mix; base vs overlay vs bulbs by symbol' : d === 'arrangement' ? 'actual x / y, mature spread proxy as circles, species colour' : 'layers apart: base · overlay · bulbs'}</div>`;
  }
  return '';
}
