// Generative Planting V3 shell: one app, one project state, one canvas — stages with their own working view.
//   Introduction → Choose landscape (entry) → Define → Structure → Compose → Explore (its own result layout)
// V3 rules:
//   * Observation state belongs to a stage (view.sv[stage]: mode, camera, focus). Month, Performance and the timeline exist
//     only in Explore; going back to an editing stage never carries them along.
//   * Design SCOPE (confirmed beds, P.state.brief.scopeBeds) ≠ FOCUS (what the camera looks at, F.u.focus). Focusing a bed
//     never shrinks the scope; Overview returns to the whole scope. A breadcrumb says which one is on screen.
//   * The live brush draws itself: a pointer move redraws only the swept region of the plan, the cursor / preview / chip
//     live on an overlay canvas; no panel or HUD markup is rebuilt while the button is held.
// Knowledge is a parallel workspace drawn over the design (the design stays mounted underneath, state untouched).
import { Project } from './project.js';
import { ActiveKnowledge, MONTHS } from './knowledge.js';
import { MixReasoner } from './llm.js';
import { inside, bbox } from './spatial.js';
import { esc, ICON } from './ui.js';
import { tracePoly, rgba } from '../style.js';
import { paintFlow, paintOverlay } from './paintflow.js';
import { Brush, BRUSH } from './brush.js';
import { showIntro } from './intro.js';
import { KnowledgeView } from './kview.js';
import * as Define from './stages/define.js';
import * as Structure from './stages/structure.js';
import * as Compose from './stages/compose.js';
import * as Explore from './stages/explore.js';

export const STAGES = [
  { id: 'define', name: 'Define', mod: Define, task: 'Design scope and strategy' },
  { id: 'structure', name: 'Structure', mod: Structure, task: 'Spatial cells' },
  { id: 'compose', name: 'Compose', mod: Compose, task: 'Communities in space' },
  { id: 'explore', name: 'Explore', mod: Explore, task: 'The result' },
];
const ORDER = STAGES.map((s) => s.id);
const params = new URLSearchParams(location.search);
const MODES = [
  { id: 'plan', name: 'Plan', key: 'P', icon: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16"/></svg>' },
  { id: 'axo', name: '3D', key: 'A', icon: '<svg viewBox="0 0 24 24"><path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M12 13v8M12 13l9-5M12 13 3 8"/></svg>' },
  { id: 'diagram', name: 'Diagram', key: 'D', icon: '<svg viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><circle cx="17" cy="17" r="1.6"/><path d="M3 12h18M12 3v18" stroke-dasharray="1.5 2"/></svg>' },
  { id: 'performance', name: 'Performance', key: 'F', icon: '<svg viewBox="0 0 24 24"><path d="M12 20c-4-3-7-6-7-10a7 7 0 0 1 14 0c0 4-3 7-7 10z"/><path d="M12 8v6M9 11h6"/></svg>' },
];
// which observation modes each stage offers (Performance and months: Explore only)
const MODES_FOR = { define: ['plan', 'axo'], structure: ['plan', 'axo', 'diagram'], compose: ['plan', 'axo', 'diagram'], explore: ['plan', 'axo', 'diagram', 'performance'] };
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

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
    <nav class="f-crumb" id="fcrumb" aria-label="What the canvas shows"></nav>
    <aside class="f-panel" id="dpanel" aria-label="Current task"></aside>
    <div class="f-insp" id="finsp" hidden role="region" aria-label="Selection"></div>
    <div class="f-hud" id="fhud" hidden role="toolbar" aria-label="Brush"></div>
    <div class="f-chip" id="fchip" hidden aria-hidden="true"></div>
    <div class="f-legend" id="flegend" hidden></div>
    <div class="f-xbar" id="fxbar" hidden></div>
    <div class="f-toast" id="ftoast" hidden role="status"></div>
    <footer class="f-dock" id="fdock">
      <div class="d-views" role="radiogroup" aria-label="View" id="fviews"></div>
      <div class="d-tools" id="ftools"></div>
      <div class="d-time" id="ftime">
        <button class="d-play" id="fplay" aria-label="Play the months" title="Play / pause the months (Space)"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <div class="d-track" id="ftrack" role="slider" tabindex="0" aria-label="Month" aria-valuemin="1" aria-valuemax="12"></div>
        <span class="d-month" id="fmonth"></span>
      </div>
      <div class="d-act" id="fact">
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

  // ---------------------------------------------------------------- stage-owned observation state
  const svAll = () => (P.state.view.sv ||= {});
  const sv = (stage = P.state.stage) => { const o = svAll(); return (o[stage] ||= { mode: 'plan' }); };

  const F = {
    ctx, store, plan, scene, P, K, R, library, preset, shell, $, STAGES,
    panel: $('#dpanel'), insp: $('#finsp'),
    u: { bed: null, previews: null, cells: new Set(), hover: null, autoPreview: null, editor: null, issue: null, confirm: null, entry: true, playing: false, zone: null, focus: null, env: false, envView: 'light', group: null, context: false, panelOpen: false },
    stage() { return P.state.stage; },
    mod() { return STAGES.find((s) => s.id === P.state.stage).mod; },
    sv,
    render() { renderSteps(); F.mod().render(F); renderDock(); renderInsp(); renderHud(); renderLegend(); renderCrumb(); renderXbar(); F.repaint(); },
    renderPanel() { F.mod().render(F); renderDock(); renderLegend(); renderCrumb(); renderXbar(); },
    renderDock, renderInsp, renderHud, renderLegend, renderCrumb,
    repaint() { if (F._raf) return; F._raf = requestAnimationFrame(() => { F._raf = 0; plan.request(); clearTimeout(F._rp); F._rp = setTimeout(() => { if (scene && scene.active !== false) store.emit('compute', { flow: true }); }, 80); }); },
    toast(msg, { err = false, ms = 4200 } = {}) { const t = $('#ftoast'); t.innerHTML = msg; t.className = 'f-toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(F._tt); F._tt = setTimeout(() => { t.hidden = true; }, ms); },
    go(stage, opts = {}) {
      if (!ORDER.includes(stage)) return false;
      const from = P.state.stage; const cur = ORDER.indexOf(from), to = ORDER.indexOf(stage);
      if (to > cur && !opts.force) { for (let i = cur; i < to; i++) { const g = STAGES[i].mod.gate(F); if (!g.ok) { F.toast(esc(g.reason)); return false; } } }
      leaveStage(from); if (from === 'explore' && stage !== 'explore') { Explore.leave(F); shell.classList.remove('x-panel'); F.u.panelOpen = false; }
      F.setBrush(null); F.u.autoPreview = null; F.u.previews = null; F.u.confirm = null; F.u.entry = false; F.u.inspect = null; F.stopPlay();
      P.setStage(stage);
      F.u.focus = sv(stage).focus || null;
      const m = STAGES.find((s) => s.id === stage).mod;
      shell.classList.toggle('x-mode', stage === 'explore'); // before the camera fits: Explore frees the panel's width
      applyStageView(stage, from, opts);
      if (m.enter) m.enter(F, { ...opts, from });
      F.render(); F.panel.scrollTop = 0; return true;
    },
    cellAt(x, y) { for (const c of P.allCells()) { const b = c._bb || (c._bb = bbox(c.geometry)); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (inside(c.geometry, x, y)) return c; } return null; },
    bedAt(x, y) { return P.eligibleBeds().find((b) => { const g = bedGeom(b.id); if (!g) return false; const q = g._bb || (g._bb = bbox(g)); if (x < q[0] || x > q[2] || y < q[1] || y > q[3]) return false; return inside(g, x, y); }) || null; },
    bedGeom: (id) => bedGeom(id),
    selectCells(ids, { add = false } = {}) { if (!add) F.u.cells.clear(); for (const id of ids) { if (add && F.u.cells.has(id)) F.u.cells.delete(id); else F.u.cells.add(id); } P.setView({ selectedCell: [...F.u.cells][0] || null }); F.render(); },
    boundsOf(geoms) { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const g of geoms) { if (!g) continue; const q = bbox(g.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [g.coordinates] } : g); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); } return Number.isFinite(b[0]) ? b : null; },
    // camera: fit a world box into the free canvas (panel, dock, crumb, legend taken into account); animated unless reduced
    focusBounds(b, m = 6, { animate = true } = {}) {
      if (!b) return;
      const box = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
      if (ctx.st.view === 'plan') { flyPlan(box, animate); }
      else if (scene && scene.setViewCenter) scene.setViewCenter((box[0] + box[2]) / 2, (box[1] + box[3]) / 2, Math.min(60, Math.max(2, freeWidth() / Math.max(box[2] - box[0], (box[3] - box[1]) * 1.4))));
      sv().cam = null;
    },
    focusCells(ids) { F.focusBounds(F.boundsOf(ids.map((id) => P.state.cells[id] && P.state.cells[id].geometry)), 4); },
    focusBeds(bedIds, opts) { F.focusBounds(F.boundsOf(bedIds.map((id) => store.getObject(id)?.geometry)), bedIds.length === 1 ? 3 : 4, opts); },
    focusBed(bedId) { F.focusBeds([bedId]); },
    // scope (confirmed) and focus (camera only)
    scopeBeds() { const s = P.state.brief.scopeBeds; return s && s.length ? s.slice() : Object.keys(P.state.beds); },
    scopeName() { const st = P.state.strategy; const nm = st ? ({ main: 'Main Garden', site: 'Whole site', meadows: 'Meadows', style: 'Block + Matrix beds', custom: 'My selection' }[st.scope] || 'Design scope') : 'Design scope'; return nm; },
    fitScope(opts) { const ids = F.scopeBeds(); if (ids.length) F.focusBeds(ids, opts); },
    focusOn(bedIds, opts) { F.u.focus = bedIds && bedIds.length ? bedIds.slice() : null; sv().focus = F.u.focus; renderLegend(); if (F.u.focus) F.focusBeds(F.u.focus, opts); else F.fitScope(opts); renderCrumb(); F.repaint(); },
    overview() { F.focusOn(null); if (F.mod().onOverview) F.mod().onOverview(F); },
    // ---- live brush (Compose). mixId null = eraser
    brush: null,
    setBrush(opts) {
      document.getElementById('app').classList.toggle('brushing', !!opts);
      if (!opts) { if (F.brush.active || F.brush.stroke) { F.brush.stop(); plan.tool = null; if (scene) scene.setTool(null); document.getElementById('c2d').style.cursor = ''; hideChip(); renderHud(); plan.requestOverlay(); F.repaint(); } return; }
      F.brush.start(opts); plan.tool = brushTool; if (scene) scene.setTool(null);
      if (ctx.st.view !== 'plan') F.setMode('plan', { quiet: true });
      document.getElementById('c2d').style.cursor = 'none'; renderHud(); renderLegend(); renderInsp(); plan.requestOverlay();
    },
    setPaint(mixId) { F.setBrush(mixId ? { mixId, slots: null } : null); }, // V1 name
    openKnowledge(focus) { setWorkspace('knowledge', focus); },
    month() { return P.state.view.month || 6; },
    setMonth(m) { P.setView({ month: ((m - 1 + 12) % 12) + 1 }); applyPhenology(); renderTime(); renderLegend(); if (F.stage() === 'explore') { F.renderPanel(); renderInsp(); } F.repaint(); },
    mode() { const m = sv().mode || 'plan'; return MODES_FOR[P.state.stage].includes(m) ? m : 'plan'; },
    setMode(mode, { quiet = false } = {}) {
      if (!MODES_FOR[P.state.stage].includes(mode)) mode = 'plan';
      if (mode === 'axo' && !scene) { F.toast('3D is not available in this browser.'); mode = 'plan'; }
      if (mode === 'axo' && F.brush.active) { F.setBrush(null); if (!quiet) F.toast('3D shows the same plants. The brush paints in Plan.'); }
      sv().mode = mode; P.setView({ mode }); ctx.setObs(mode === 'axo' ? '3d' : 'plan'); applyPhenology(); renderDock(); renderLegend(); F.repaint();
    },
    play() { if (F.u.playing) return F.stopPlay(); F.u.playing = true; const step = () => { if (!F.u.playing) return; F.setMonth(F.month() + 1); F._pt = setTimeout(step, reduceMotion() ? 1600 : 1000); }; F._pt = setTimeout(step, 300); renderTime(); },
    stopPlay() { F.u.playing = false; clearTimeout(F._pt); renderTime(); },
    timelineOn() { return P.state.stage === 'explore'; },
  };
  F.brush = new Brush(F);
  F.diagramKey = (d) => Explore.diagramKey(F, d);
  ctx.flow = F; window.GPFlow = F;
  const bedGeomCache = new Map();
  function bedGeom(id) { if (bedGeomCache.has(id)) return bedGeomCache.get(id); const o = store.getObject(id); if (!o) return null; const g = o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry; bedGeomCache.set(id, g); return g; }

  // ---------------------------------------------------------------- camera
  function freeWidth() { const pd = plan.padFor ? plan.padFor() : { l: 40, r: 40 }; return Math.max(200, plan.w - pd.l - pd.r); }
  function fitView(b) {
    const pad = plan.padFor(); pad.t = Math.max(pad.t, 64); pad.b = Math.max(pad.b, 40);
    const lg = $('#flegend'); if (lg && !lg.hidden && plan.w > 760) pad.l = Math.max(pad.l, Math.min(300, lg.getBoundingClientRect().width + 28));
    const W = Math.max(50, plan.w - pad.l - pad.r), H = Math.max(50, plan.h - pad.t - pad.b);
    const scale = Math.max(1.2, Math.min(400, Math.min(W / (b[2] - b[0]), H / (b[3] - b[1]))));
    return { scale, cx: (b[0] + b[2]) / 2 - (pad.l - pad.r) / 2 / scale, cy: (b[1] + b[3]) / 2 + (pad.t - pad.b) / 2 / scale };
  }
  function flyPlan(b, animate) {
    if (!plan.w) plan.resize();
    const to = fitView(b); plan._fitted = true; cancelAnimationFrame(F._fly);
    const from = { ...plan.view };
    if (!animate || reduceMotion() || !from.scale) { Object.assign(plan.view, to); plan.request(); return; }
    const t0 = performance.now(), dur = 480; const ls = Math.log(from.scale), le = Math.log(to.scale);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur); const e = 1 - Math.pow(1 - k, 3); plan.view.scale = Math.exp(ls + (le - ls) * e); plan.view.cx = from.cx + (to.cx - from.cx) * e; plan.view.cy = from.cy + (to.cy - from.cy) * e; plan.request(); if (k < 1) F._fly = requestAnimationFrame(step); else { Object.assign(plan.view, to); plan.request(); } };
    F._fly = requestAnimationFrame(step);
  }
  F.fitView = fitView;
  // leaving a stage: remember its camera (plan) and focus; entering: its own view, never the last stage's
  function leaveStage(stage) { const v = sv(stage); if (ctx.st.view === 'plan' && plan._fitted) v.cam = { ...plan.view }; v.focus = F.u.focus; }
  function applyStageView(stage, from) {
    const v = sv(stage); let mode = v.mode || 'plan'; if (!MODES_FOR[stage].includes(mode)) mode = 'plan';
    if (stage !== 'explore') { store.setViewState({ month: null, phenology: null }); if (scene && scene.setPhenology) scene.setPhenology(null); }
    v.mode = mode; P.setView({ mode }); ctx.setObs(mode === 'axo' ? '3d' : 'plan');
    // camera policy
    if (stage === 'compose' && from === 'structure') { const fs = sv('structure').focus; F.u.focus = fs || null; v.focus = F.u.focus; if (fs) F.focusBeds(fs); else F.fitScope(); return; }
    if (stage === 'explore') { F.u.focus = null; return; } // Explore fits the result itself (Explore.enter)
    if (v.cam && ctx.st.view === 'plan' && from !== 'define') { Object.assign(plan.view, v.cam); plan._fitted = true; plan.request(); return; }
    if (stage === 'define') { if (v.cam && ctx.st.view === 'plan') { Object.assign(plan.view, v.cam); plan.request(); } return; }
    if (F.u.focus) F.focusBeds(F.u.focus); else F.fitScope();
  }

  // ---------------------------------------------------------------- the self-drawing brush tool on the plan canvas
  let cursor = null; let hoverAt = null; let hoverRaf = 0;
  const margin = (b) => [b[0] - 1.1, b[1] - 1.1, b[2] + 1.1, b[3] + 1.1];
  const brushTool = {
    selfDraw: true,
    hover(x, y) { cursor = x == null ? null : [x, y]; hoverAt = cursor; if (!hoverRaf) hoverRaf = requestAnimationFrame(() => { hoverRaf = 0; if (!F.brush.stroke) F.brush.hover(hoverAt ? hoverAt[0] : null, hoverAt ? hoverAt[1] : null); plan.drawOverlay(); }); },
    down(x, y) { cursor = [x, y]; const b = F.brush.down(x, y); if (b) plan.requestRegion(margin(b)); plan.requestOverlay(); },
    move(x, y) { cursor = [x, y]; const b = F.brush.move(x, y); if (b) plan.requestRegion(margin(b)); plan.requestOverlay(); },
    up() {
      const r = F.brush.up(); if (!r) return;
      if (r.ok === false && !r.empty) F.toast(esc(r.error || 'stroke not applied'), { err: true });
      else if (r.ok !== false) F.toast(strokeSummary(r));
      else if (r.empty) F.toast(r.rejected && r.rejected.light ? `Nothing planted: ${r.rejected.light} candidate${r.rejected.light === 1 ? '' : 's'} skipped for a known light conflict.` : 'Nothing changed here.');
      F.brush.hover(cursor ? cursor[0] : null, cursor ? cursor[1] : null); F.render();
    },
  };
  function strokeSummary(r) {
    const bits = [`<b>+${r.added}</b>`]; if (r.removed) bits.push(`${r.removed} replaced`); if (r.kept) bits.push(`${r.kept} other-layer kept`); if (r.fit.substituted) bits.push(`${r.fit.substituted} swapped for light`);
    if (r.rejected.light) bits.push(`${r.rejected.light} skipped (light)`); if (r.fit.conflict) bits.push(`${r.fit.conflict} kept against light`); if (r.fit.unknown) bits.push(`${r.fit.unknown} light unknown`);
    return `${bits.join(' · ')} — ${r.cells} cell${r.cells === 1 ? '' : 's'} in ${r.bedIds.map((b) => esc(P.bedCode(b))).join(', ')}. One undo step.`;
  }
  F.brushCursor = () => cursor;
  store.flowMask = () => (F.brush.stroke ? F.brush.stroke.removedPos : null);
  // overlay canvas: brush ring / footprint / hover preview / box selection / hover outline — cheap, every frame
  plan.overlayFn = (c, T, sc, o) => paintOverlay(F, c, T, sc, o, cursor);

  // a short chip next to the cursor: what is here and what the brush would do (no long text in a corner)
  const chip = $('#fchip'); let chipText = '';
  F.setChip = (html, cx, cy) => { if (html == null) return hideChip(); if (html !== chipText) { chip.innerHTML = html; chipText = html; } chip.hidden = false; const r = document.getElementById('c2d').getBoundingClientRect(); const w = chip.offsetWidth || 160; const x = Math.min(r.right - w - 8, r.left + cx + 18); chip.style.transform = `translate(${Math.round(x)}px, ${Math.round(r.top + cy + 14)}px)`; };
  function hideChip() { chip.hidden = true; chipText = ''; }
  F.hideChip = hideChip;

  // ---------------------------------------------------------------- phenology (Explore only): flowering / not / unknown
  function applyPhenology() {
    const on = P.state.stage === 'explore' && F.mode() !== 'diagram';
    if (!on) { if (store.view.phenology) store.setViewState({ month: null, phenology: null }); if (scene && scene.setPhenology) scene.setPhenology(null); return; }
    const m = F.month(); const ph = new Map(); for (const sp of store.model.species) { const f = K.floweringIn(sp.id, m); ph.set(sp.index, f === 'yes' ? true : f === 'no' ? false : null); }
    store.setViewState({ month: m, phenology: ph }); if (scene && scene.setPhenology) scene.setPhenology(ph);
  }
  F.applyPhenology = applyPhenology;

  // ---------------------------------------------------------------- top bar, crumb, dock, inspector, brush bar
  function renderSteps() {
    const cur = ORDER.indexOf(P.state.stage); const max = ORDER.indexOf(P.state.maxStage);
    $('#fsteps').innerHTML = STAGES.map((s, i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}<button data-st="${s.id}" class="${i < cur || (i <= max && i !== cur) ? 'done' : ''}" ${i === cur ? 'aria-current="step"' : ''} ${i > max + 1 ? 'disabled' : ''} title="${esc(s.task)}"><span class="n">${i + 1}</span><span class="lbl">${esc(s.name)}</span></button>`).join('');
    $('#fsteps').querySelectorAll('button').forEach((b) => (b.onclick = () => F.go(b.dataset.st)));
    const nm = $('#fname'); if (document.activeElement !== nm) nm.value = P.state.name;
  }
  function renderCrumb() {
    const el = $('#fcrumb'); const st = P.state.stage; if (st === 'explore' || !$('#fknow').hidden) { el.hidden = true; return; } el.hidden = false;
    const site = esc(preset.name.replace(/^Oudolf Garden /, ''));
    if (st === 'define') { const n = F.u.candidate ? F.u.candidate.size : F.scopeBeds().length; const area = (F.u.candidate ? [...F.u.candidate] : F.scopeBeds()).reduce((a, id) => a + (P.eligibleBeds().find((b) => b.id === id)?.areaM2 || 0), 0); el.innerHTML = `<span class="c0">${site}</span>${n ? `<span class="sep">/</span><b>${n} bed${n === 1 ? '' : 's'}</b><span class="mono">${Math.round(area).toLocaleString('en-US')} m²</span>` : ''}`; return; }
    const scope = F.scopeBeds(); const foc = F.u.focus;
    el.innerHTML = `<button class="c0" data-cr="site" title="Whole site">${site}</button><span class="sep">/</span><button data-cr="scope" class="${foc ? '' : 'on'}" title="The whole design scope">${esc(F.scopeName())} <span class="mono">${scope.length}</span></button>${foc ? `<span class="sep">/</span><b>${foc.map((b) => esc(P.bedCode(b))).join(' + ')}</b><button class="ov" data-cr="overview">Overview</button>` : ''}<select class="bedjump" aria-label="Focus a bed"><option value="">${foc ? 'Bed…' : 'Focus a bed…'}</option>${scope.map((b) => `<option value="${esc(b)}">${esc(P.bedCode(b))}</option>`).join('')}</select>`;
    el.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = () => { const k = b.dataset.cr; if (k === 'scope' || k === 'overview') F.overview(); else { F.u.focus = null; sv().focus = null; const gb = plan.gardenBounds(); F.focusBounds(gb, 0); renderCrumb(); } }));
    const sel = el.querySelector('.bedjump'); sel.onchange = () => { if (sel.value) { F.focusOn([sel.value]); if (F.mod().onFocus) F.mod().onFocus(F, sel.value); } };
  }
  function renderTime() {
    const show = F.timelineOn(); $('#ftime').hidden = !show; if (!show) return;
    const m = F.month(); const tg = P.state.brief.objectives.flowering.on ? P.state.brief.objectives.flowering.months : [];
    const tr = $('#ftrack'); tr.setAttribute('aria-valuenow', m); tr.setAttribute('aria-valuetext', MONTHS[m - 1]);
    const perf = P.state.stage === 'explore' ? P.perf : null; const series = perf ? Array.from({ length: 12 }, (_, i) => perf.byMonth[i + 1].floweringPerM2 || 0) : []; const mx = Math.max(0.01, ...series);
    tr.innerHTML = MONTHS.map((x, i) => `<button data-m="${i + 1}" class="${tg.includes(i + 1) ? 'tgt' : ''}${i + 1 === m ? ' on' : ''}" title="${MONTH_LONG[i]}${perf && perf.instances ? ` · ${perf.byMonth[i + 1].floweringInstances} plants known in flower` : ''}" tabindex="-1"><i style="height:${series.length ? Math.round(3 + 15 * (series[i] / mx)) : 3}px"></i><span>${x[0]}</span></button>`).join('') + `<span class="knob" style="left:calc(${((m - 0.5) / 12) * 100}% - 6px)"></span>`;
    tr.querySelectorAll('button').forEach((b) => (b.onclick = () => { F.stopPlay(); F.setMonth(+b.dataset.m); }));
    $('#fmonth').textContent = MONTH_LONG[m - 1];
    $('#fplay').innerHTML = F.u.playing ? '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
    $('#fplay').setAttribute('aria-label', F.u.playing ? 'Pause' : 'Play the months'); $('#fplay').setAttribute('aria-pressed', String(F.u.playing));
  }
  function renderDock() {
    const stage = P.state.stage; const mode = F.mode(); const avail = MODES_FOR[stage];
    $('#fviews').innerHTML = MODES.filter((m) => avail.includes(m.id)).map((m) => `<button role="radio" data-mode="${m.id}" aria-checked="${m.id === mode}" title="${esc(m.name)} (${m.key})"><span class="ic">${m.icon}</span><span class="lb">${m.name}</span></button>`).join('');
    $('#fviews').querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => F.setMode(b.dataset.mode)));
    const tools = []; if (stage !== 'explore') { tools.push(`<button class="d-tg" id="flayers" aria-pressed="${!document.getElementById('layers').hidden}" title="Site layers (L)"><span class="ic"><svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg></span><span class="lb">Layers</span></button>`); tools.push(`<button class="d-tg" id="fenv" aria-pressed="${!!F.u.env}" title="Light: crown proxy, your assumptions, unknown — and how the selected mix fits"><span class="ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg></span><span class="lb">Conditions</span></button>`); }
    $('#ftools').innerHTML = tools.join(''); $('#ftools').hidden = !tools.length;
    const fl = $('#flayers'); if (fl) fl.onclick = () => { document.getElementById('btnLayers')?.click(); setTimeout(renderDock, 30); };
    const fe = $('#fenv'); if (fe) fe.onclick = () => { F.u.env = !F.u.env; renderDock(); renderLegend(); if (F.u.env && ctx.st.view === 'plan' && P.state.stage !== 'define') F.focusOn(F.u.focus); F.repaint(); }; // the legend takes room: the work is re-framed beside it
    renderTime();
    $('#fact').hidden = stage === 'explore';
    if (stage === 'explore') return;
    const b = F.mod().bottom(F); const i = ORDER.indexOf(stage);
    $('#fback').hidden = i === 0; $('#fback').textContent = i ? `← ${STAGES[i - 1].name}` : '';
    $('#fmsg').innerHTML = b.msg || '';
    const n = $('#fnext'); n.textContent = b.next ? b.next.label : ''; n.hidden = !b.next; n.disabled = !!(b.next && !b.next.enabled); n.title = b.next && !b.next.enabled ? b.next.reason || '' : '';
    if (b.next && !b.next.enabled && b.next.reason) $('#fmsg').innerHTML = `${b.msg ? b.msg + ' · ' : ''}<span class="dim">${esc(b.next.reason)}</span>`;
    $('#fundo').disabled = !P.past.length; $('#fredo').disabled = !P.future.length;
    $('#fundo').title = P.past.length ? `Undo: ${P.past[P.past.length - 1].label} (⌘Z)` : 'Nothing to undo'; $('#fredo').title = P.future.length ? `Redo: ${P.future[P.future.length - 1].label}` : 'Nothing to redo';
    const cf = $('#fconfirm'); cf.innerHTML = '';
    if (F.u.confirm) { cf.innerHTML = `<span class="confirm"><span>${esc(F.u.confirm.text)}</span>${F.u.confirm.actions.map((a, k) => `<button class="${k ? 'lnk' : 'btn-s'}" data-k="${k}">${esc(a.label)}</button>`).join('')}</span>`; cf.querySelectorAll('button').forEach((x) => (x.onclick = () => { const a = F.u.confirm.actions[+x.dataset.k]; F.u.confirm = null; a.run(); renderDock(); })); }
  }
  // Explore chrome (top right): back to the design, the saved options, export, site context, details
  function renderXbar() {
    const el = $('#fxbar'); const on = P.state.stage === 'explore' && $('#fknow').hidden; el.hidden = !on; if (!on) return;
    el.innerHTML = Explore.xbar(F); if (Explore.bindXbar) Explore.bindXbar(F, el);
  }
  $('#fplay').onclick = () => F.play();
  $('#ftrack').addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { F.stopPlay(); F.setMonth(F.month() + 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { F.stopPlay(); F.setMonth(F.month() - 1); e.preventDefault(); } });
  $('#fback').onclick = () => { const i = ORDER.indexOf(P.state.stage); if (i > 0) F.go(ORDER[i - 1]); };
  $('#fnext').onclick = () => { const b = F.mod().bottom(F); if (b.next && b.next.enabled) b.next.run(); };
  $('#fundo').onclick = () => { const l = P.undo(); if (l) F.toast('Undone: ' + esc(l)); };
  $('#fredo').onclick = () => { const l = P.redo(); if (l) F.toast('Redone: ' + esc(l)); };
  $('#fname').onchange = (e) => { P.state.name = e.target.value.trim() || 'Planting design'; P.save(); };
  $('#fword').onclick = () => showIntro(F, { again: true });
  function renderInsp() {
    const html = F.mod().inspector ? F.mod().inspector(F) : null;
    F.insp.hidden = !html; F.insp.classList.toggle('wide', P.state.stage === 'explore'); if (!html) return;
    F.insp.innerHTML = `<button class="x" aria-label="Close">${ICON.x}</button>` + html;
    F.insp.querySelector('.x').onclick = () => { F.u.cells.clear(); F.u.bedInspect = null; F.u.inspect = null; store.select(null); if (F.mod().onCloseInspector) F.mod().onCloseInspector(F); F.render(); };
    if (F.mod().bindInspector) F.mod().bindInspector(F, F.insp);
  }
  // compact brush bar (top of the canvas): mix · layers · ⌀ m · edge · done. Rebuilt only when the brush changes.
  function renderHud() {
    const h = $('#fhud'); const a = F.brush.active; h.hidden = !a; if (!a) return;
    const m = a.mixId ? P.mix(a.mixId) : null;
    const slots = m ? [...new Set(m.layers.map((L) => L.slot))] : ['base', 'overlay', 'ephemeral'];
    const sel = a.slots && a.slots.length ? a.slots : slots; const nm = { base: 'Base', overlay: 'Overlay', ephemeral: 'Bulbs' };
    h.innerHTML = `<span class="sw" style="background:${m ? esc(m.color) : 'transparent'}"></span><b>${m ? esc(m.name) : 'Eraser'}</b>
      <span class="seg" role="group" aria-label="Layers the brush writes">${slots.map((x) => `<button data-slot="${x}" aria-pressed="${sel.includes(x)}">${nm[x]}</button>`).join('')}</span>
      <label class="rad"><input type="range" id="fbr" min="${BRUSH.minR * 2}" max="${BRUSH.maxR * 2}" step="0.2" value="${(a.r * 2).toFixed(1)}" aria-label="Brush diameter in metres"><span class="num">⌀ ${(a.r * 2).toFixed(1)} m</span></label>
      ${m ? `<span class="seg" role="group" aria-label="Edge of the stroke"><button data-edge="hard" aria-pressed="${a.edge !== 'soft'}" title="Replace inside the footprint">Replace</button><button data-edge="soft" aria-pressed="${a.edge === 'soft'}" title="Soft edge: the outer band mixes the old and the new community">Soft edge</button></span>
      <label class="ovr" title="Plant members with a known light conflict anyway (they stay flagged)"><input type="checkbox" id="fovr" ${a.override ? 'checked' : ''}> allow conflicts</label>` : ''}
      <span class="live num" id="flive"></span><button id="fbx" class="x" aria-label="Done (Esc)" title="Done (Esc)">${ICON.x}</button>`;
    h.querySelectorAll('[data-slot]').forEach((b) => (b.onclick = () => { const cur = new Set(sel); if (cur.has(b.dataset.slot) && cur.size > 1) cur.delete(b.dataset.slot); else cur.add(b.dataset.slot); F.brush.active.slots = slots.filter((x) => cur.has(x)); renderHud(); refreshHover(); }));
    h.querySelectorAll('[data-edge]').forEach((b) => (b.onclick = () => { F.brush.active.edge = b.dataset.edge; renderHud(); refreshHover(); }));
    const ov = h.querySelector('#fovr'); if (ov) ov.onchange = () => { F.brush.active.override = ov.checked; refreshHover(); };
    const r = h.querySelector('#fbr'); r.oninput = () => { F.brush.setRadius(+r.value / 2); r.nextElementSibling.textContent = '⌀ ' + (+r.value).toFixed(1) + ' m'; refreshHover(); };
    h.querySelector('#fbx').onclick = () => { F.setBrush(null); F.renderPanel(); };
  }
  function refreshHover() { if (cursor && !F.brush.stroke) { F.brush.hover(cursor[0], cursor[1]); plan.requestOverlay(); } }
  F.refreshHover = refreshHover;
  function renderLegend() { const el = $('#flegend'); const html = legendHtml(F); el.hidden = !html; el.innerHTML = html || ''; bindLegend(F, el); }

  // ---------------------------------------------------------------- canvas paint hook + clicks + hover outline
  store.flowPaint = (c2, T, o, phase) => paintFlow(F, c2, T, o, phase);
  for (const cv of [document.getElementById('c2d'), document.getElementById('c3d')]) {
    let down = null;
    cv.addEventListener('pointerdown', (e) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; }, true);
    cv.addEventListener('pointerup', (e) => {
      if (!down || F.brush.active || F._boxing || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; } down = null;
      let p = null;
      if (cv.id === 'c2d') { if (ctx.st.view !== 'plan') return; const r = cv.getBoundingClientRect(); p = plan.inv(e.clientX - r.left, e.clientY - r.top); }
      else { if (ctx.st.view === 'plan' || !scene) return; p = scene.groundAt(e.clientX, e.clientY); }
      if (!p) return; const mod = F.mod();
      setTimeout(() => { if (store.selection) store.select(null); if (mod.onCanvasClick) mod.onCanvasClick(F, p[0], p[1], null, { shift: e.shiftKey || e.metaKey }); }, 0);
    });
    cv.addEventListener('pointercancel', () => { if (F.brush.cancel()) { F.toast('Stroke cancelled.'); F.render(); } });
  }
  // hover outline of a bed / cell (Define, Structure, Explore) on the overlay, with a short chip
  document.getElementById('c2d').addEventListener('pointermove', (e) => {
    if (F.brush.active || ctx.st.view !== 'plan') return; const r = e.currentTarget.getBoundingClientRect(); const [x, y] = plan.inv(e.clientX - r.left, e.clientY - r.top);
    const mod = F.mod(); const h = mod.hoverAt ? mod.hoverAt(F, x, y) : null; const key = h ? h.key : null;
    if (key !== F.u.hoverKey) { F.u.hoverKey = key; F.u.hoverObj = h; plan.requestOverlay(); }
    if (h && h.chip) F.setChip(h.chip, e.clientX - r.left, e.clientY - r.top); else hideChip();
  });
  document.getElementById('c2d').addEventListener('pointerleave', () => { F.u.hoverKey = null; F.u.hoverObj = null; hideChip(); if (F.brush.active && !F.brush.stroke) { cursor = null; F.brush.ghost = null; } plan.requestOverlay(); });
  // wheel over the canvas with Alt: brush size (metres)
  document.getElementById('c2d').addEventListener('wheel', (e) => { if (!F.brush.active || !e.altKey) return; e.preventDefault(); e.stopPropagation(); F.brush.setRadius(F.brush.active.r * (e.deltaY > 0 ? 0.9 : 1.1)); renderHud(); refreshHover(); }, { capture: true, passive: false });
  // Define: shift + drag = box selection of beds (a plain drag still pans)
  const boxTool = {
    selfDraw: true, when: (e) => e.shiftKey && P.state.stage === 'define',
    down(x, y) { F._boxing = { a: [x, y], b: [x, y] }; plan.requestOverlay(); },
    move(x, y) { if (F._boxing) { F._boxing.b = [x, y]; plan.requestOverlay(); } },
    up(x, y) { const bx = F._boxing; setTimeout(() => { F._boxing = null; }, 0); if (!bx) return; const b = [Math.min(bx.a[0], bx.b[0]), Math.min(bx.a[1], bx.b[1]), Math.max(bx.a[0], bx.b[0]), Math.max(bx.a[1], bx.b[1])]; const px = (b[2] - b[0]) * plan.view.scale + (b[3] - b[1]) * plan.view.scale;
      if (px < 6) { Define.onCanvasClick(F, x ?? bx.a[0], y ?? bx.a[1], null, { shift: true }); plan.requestOverlay(); return; } // a Shift-click, not a box
      if (Define.boxSelect) Define.boxSelect(F, b); plan.requestOverlay(); },
  };
  F.boxTool = boxTool;

  // ---------------------------------------------------------------- Design | Knowledge
  const KV = new KnowledgeView(F, $('#fknow'));
  F.KV = KV;
  function setWorkspace(ws, focus) {
    shell.querySelectorAll('.f-sections button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ws === ws)));
    shell.classList.toggle('k-mode', ws === 'knowledge');
    if (ws === 'knowledge') { F.setBrush(null); KV.open(focus); } else KV.close();
    renderCrumb(); renderXbar();
  }
  F.setWorkspace = setWorkspace;
  shell.querySelectorAll('.f-sections button').forEach((b) => (b.onclick = () => setWorkspace(b.dataset.ws)));

  // ---------------------------------------------------------------- keyboard
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.stopImmediatePropagation(); if (F.brush.stroke) return; const l = e.shiftKey ? P.redo() : P.undo(); if (l) F.toast((e.shiftKey ? 'Redone: ' : 'Undone: ') + esc(l)); return; }
    if (typing) return;
    if (e.key === 'Escape') {
      if (F.brush.stroke) { e.stopImmediatePropagation(); F.brush.cancel(); F.toast('Stroke cancelled — nothing changed.'); F.render(); return; }
      if (!$('#fknow').hidden) { e.stopImmediatePropagation(); setWorkspace('design'); return; }
      if (document.getElementById('fintro')) return;
      if (F.brush.active) { e.stopImmediatePropagation(); F.setBrush(null); F.renderPanel(); return; }
      if (F.u.confirm) { e.stopImmediatePropagation(); F.u.confirm = null; renderDock(); return; }
      if (F.u.inspect) { e.stopImmediatePropagation(); F.u.inspect = null; if (Explore.onCloseInspector && P.state.stage === 'explore') Explore.onCloseInspector(F); F.render(); return; }
      if (F.u.cells.size || F.u.bedInspect) { e.stopImmediatePropagation(); F.u.cells.clear(); F.u.bedInspect = null; store.select(null); F.render(); return; }
      if (F.u.focus) { e.stopImmediatePropagation(); F.overview(); }
      return;
    }
    if (!$('#fknow').hidden || document.getElementById('fintro') || e.metaKey || e.ctrlKey || e.altKey) return;
    const md = MODES.find((m) => m.key === e.key.toUpperCase()); if (md && MODES_FOR[P.state.stage].includes(md.id)) { e.stopImmediatePropagation(); e.preventDefault(); F.setMode(md.id); return; }
    if (e.key === ' ' && F.timelineOn() && !e.target.closest('button')) { e.preventDefault(); F.play(); return; }
    if (F.brush.active && (e.key === '[' || e.key === ']')) { F.brush.setRadius(F.brush.active.r * (e.key === '[' ? 0.85 : 1.18)); renderHud(); refreshHover(); }
  }, true);

  // ---------------------------------------------------------------- state events
  P.on((type, d) => {
    if (type === 'change') F.render();
    if (type === 'saved') { const s = $('#fsave'); s.className = 'f-save' + (d.ok && !d.error ? '' : ' err'); s.textContent = !d.ok ? 'Not saved' : d.error ? 'Saved (positions rebuilt)' : 'Saved'; s.title = d.error || (d.savedAt ? 'Saved in this browser at ' + new Date(d.savedAt).toLocaleTimeString() : ''); }
    if (type === 'error') F.toast(esc(d.message), { err: true, ms: 8000 });
  });
  K.onChange(() => { if (F._ready) { P.invalidatePerf(); applyPhenology(); F.renderPanel(); F.repaint(); } });

  // ---------------------------------------------------------------- start: intro → landscape → resume or new
  const stored = params.get('fresh') === '1' ? null : Project.stored();
  F.u.resume = stored && stored.siteId === preset.id ? { name: stored.name, stage: stored.stage, savedAt: stored.savedAt, cells: Object.keys(stored.cells || {}).length, mixes: (stored.mixes || []).length, schema: stored.schema } : null;
  F.resume = () => {
    const r = P.restore(stored); if (!r.ok) { F.toast(esc(r.error), { err: true }); return; }
    F.u.entry = false; F.u.resume = null; const st = P.state.stage; F.u.focus = sv(st).focus || null;
    shell.classList.toggle('x-mode', st === 'explore');
    const mode = F.mode(); ctx.setObs(mode === 'axo' ? '3d' : 'plan');
    if (sv(st).cam && mode !== 'axo') { Object.assign(plan.view, sv(st).cam); plan._fitted = true; plan.request(); }
    const mod = STAGES.find((s) => s.id === st).mod; if (mod.enter) mod.enter(F, { resumed: true });
    applyPhenology(); F.render(); F.toast(`Resumed “${esc(P.state.name)}” at ${STAGES.find((s) => s.id === st).name}${r.migrated ? ' (migrated from V1: plant positions regenerated)' : ''}.`);
  };
  // explicit only (intro "Start a new design", Define "Start new"): the saved design is replaced by an empty one
  F.startNew = () => { P.reset(); F.u.resume = null; F.u.entry = true; F.u.cells.clear(); F.u.focus = null; shell.classList.remove('x-mode'); P.setStage('define'); sv('define').mode = 'plan'; ctx.setObs('plan'); Define.enter && Define.enter(F, { fresh: true }); F.render(); };
  const remember = () => { if (ctx.st.view === 'plan' && plan._fitted) sv().cam = { ...plan.view }; P.saveSoon(); };
  document.getElementById('c2d').addEventListener('pointerup', () => { if (!F.brush.active) remember(); }); document.getElementById('c2d').addEventListener('wheel', () => { clearTimeout(F._wt); F._wt = setTimeout(remember, 300); }, { passive: true });
  ctx.setObs('3d');
  F._ready = true;
  library.onChange(() => { if (F._ready) F.renderPanel(); });
  if (params.get('resume') === '1' && stored) F.resume(); else sv('define').mode = 'plan';
  F.render();
  if (params.get('intro') !== '0' && params.get('resume') !== '1') showIntro(F);
  else if (params.get('resume') !== '1') { F.u.entry = !!F.u.resume; P.setStage('define'); ctx.setObs('plan'); Define.enter(F, { fresh: true }); F.render(); F.focusBounds(plan.gardenBounds(), 0, { animate: false }); } // never wipes a saved design
  return F;
}

// ---------------------------------------------------------------- the legend card of the active view (bottom left)
// Conditions (light: assumption / crown proxy / unknown, and how the brush mix fits), Diagram sub-views, Performance ramp.
function legendHtml(F) {
  const P = F.P, mode = F.mode(), st = P.state.stage;
  if (st === 'explore') return F.u.legendOpen === false ? '' : (mode === 'performance' || mode === 'diagram') && P.allCells().length ? exploreLegend(F, mode) : '';
  if (mode === 'diagram' && P.allCells().length) return diagramLegend(F);
  if (!F.u.env) return '';
  const mix = F.brush.active && F.brush.active.mixId ? P.mix(F.brush.active.mixId) : null; const view = mix && F.u.envView === 'fit' ? 'fit' : 'light';
  const targets = envTargets(F);
  let h = `<header><b>Conditions</b>${mix ? `<span class="seg sm"><button data-ev="light" aria-pressed="${view === 'light'}">Light</button><button data-ev="fit" aria-pressed="${view === 'fit'}">Mix fit</button></span>` : ''}</header>`;
  if (view === 'light') h += `<ul class="lg"><li><i class="sw l-sun"></i>sun <span class="dim">· assumed</span></li><li><i class="sw l-part"></i>part shade <span class="dim">· assumed</span></li><li><i class="sw l-shade"></i>shade <span class="dim">· assumed</span></li><li title="NAIP crowns: probable shade, inferred"><i class="sw l-proxy"></i>under a crown <span class="dim">· proxy</span></li><li><i class="sw l-unk"></i>unknown</li></ul>`;
  else h += `<p class="xs"><b style="color:${esc(mix.color)}">${esc(mix.name)}</b></p><ul class="lg"><li title="No member with a light record conflicts here"><i class="sw f-match"></i>fits</li><li title="Some members conflict: they are swapped for a layer-mate or skipped; denser stripes = a larger share"><i class="sw f-partial"></i>partly</li><li title="No member with a light record fits: skipped unless you allow conflicts"><i class="sw f-conflict"></i>conflict</li><li title="No light here, or no member with a light record (the share of unrecorded members is in the chip)"><i class="sw f-unk"></i>unknown</li><li title="Path, frozen cell, outside the scope"><i class="sw f-blocked"></i>blocked</li></ul>`;
  if (targets.length && st !== 'define') { const cur = new Set(targets.map((b) => P.lightAssumption(b) || '')); const one = cur.size === 1 ? [...cur][0] : null; h += `<div class="assume"><span class="xs">Assume light in <b>${targets.map((b) => esc(P.bedCode(b))).join(', ')}</b></span><span class="seg sm">${[['sun', 'Sun'], ['part', 'Part'], ['shade', 'Shade'], ['', 'Unknown']].map(([k, n]) => `<button data-la="${k}" aria-pressed="${one === k}">${n}</button>`).join('')}</span></div>`; }
  else if (st !== 'define') h += '<p class="xs dim">Focus a bed to set a light assumption.</p>';
  return h;
}
function envTargets(F) { const P = F.P; if (F.u.focus && F.u.focus.length) return F.u.focus; if (F.u.cells.size) return [...new Set([...F.u.cells].map((c) => P.state.cells[c] && P.state.cells[c].bedId).filter(Boolean))]; if (F.u.bed) return [F.u.bed]; return []; }
function diagramLegend(F) {
  const d = F.P.state.view.diagram || 'arrangement'; const names = { structure: 'Structure', mix: 'Mix', arrangement: 'Arrangement', layers: 'Layers' };
  return `<header><b>Diagram</b></header><div class="dseg">${Object.keys(names).map((k) => `<button data-dg="${k}" aria-pressed="${k === d}">${names[k]}</button>`).join('')}</div>${F.diagramKey ? F.diagramKey(d) : ''}`;
}
function exploreLegend(F, mode) {
  if (mode === 'diagram') return diagramLegend(F);
  const P = F.P; const m = F.month(); const b = P.perf && P.perf.byMonth[m];
  return `<header><b>Flowering · ${MONTHS[m - 1]}</b></header><div class="ramp"><i style="background:#F3EEE4"></i><i style="background:#F0D9A8"></i><i style="background:#E2A85C"></i><i style="background:#C56B33"></i><i style="background:#8A3B1E"></i></div><div class="rl"><span>0</span><span>plants in flower / m²</span><span>3+</span></div><ul class="lg"><li><i class="sw hatch"></i>flowering unknown</li><li><i class="sw ring"></i>planted, none known in flower</li></ul>${b && b.placed ? `<p class="mono xs">${b.floweringInstances.toLocaleString('en-US')} of ${b.placed.toLocaleString('en-US')} known in flower · ${b.unknownInstances.toLocaleString('en-US')} unknown</p>` : ''}`;
}
function bindLegend(F, el) {
  el.querySelectorAll('[data-dg]').forEach((b) => (b.onclick = () => { F.P.setView({ diagram: b.dataset.dg }); F.renderLegend(); F.repaint(); }));
  el.querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => { F.u.envView = b.dataset.ev; F.renderLegend(); F.repaint(); }));
  el.querySelectorAll('[data-la]').forEach((b) => (b.onclick = () => { const t = envTargets(F); const r = F.P.setLightAssumption(t, b.dataset.la || null); if (r.ok !== false) F.toast(b.dataset.la ? `Project assumption: <b>${{ sun: 'sun', part: 'part shade', shade: 'shade' }[b.dataset.la]}</b> in ${t.map((x) => esc(F.P.bedCode(x))).join(', ')}. New plants use it; placed plants are not regenerated.` : `Light set back to unknown in ${t.map((x) => esc(F.P.bedCode(x))).join(', ')}.`); F.refreshHover && F.refreshHover(); }));
}
export { rgba, tracePoly };
