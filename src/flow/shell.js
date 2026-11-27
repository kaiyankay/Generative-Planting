// Integrated Prototype shell: one app, four stages (Define → Structure → Compose → Explore) over one canvas and one
// project state. Knowledge is a parallel workspace opened over the design (the design stays mounted underneath).
import { Project } from './project.js';
import { ActiveKnowledge } from './knowledge.js';
import { MixReasoner } from './llm.js';
import { inside, bbox } from './spatial.js';
import { esc, ICON } from './ui.js';
import { paintFlow } from './paintflow.js';
import * as Define from './stages/define.js';
import * as Structure from './stages/structure.js';
import * as Compose from './stages/compose.js';
import * as Explore from './stages/explore.js';

export const STAGES = [
  { id: 'define', name: 'Define', mod: Define },
  { id: 'structure', name: 'Structure', mod: Structure },
  { id: 'compose', name: 'Compose', mod: Compose },
  { id: 'explore', name: 'Explore', mod: Explore },
];
const ORDER = STAGES.map((s) => s.id);
const params = new URLSearchParams(location.search);

export async function startFlow(ctx) {
  const { store, plan, scene, library, preset, app } = ctx;
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'src/flow/flow.css'; document.head.appendChild(link);
  const fonts = document.createElement('link'); fonts.rel = 'stylesheet'; fonts.href = 'https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,300..700;1,62..125,300..700&family=DM+Mono:wght@400;500&display=swap'; document.head.appendChild(fonts);
  document.title = 'Generative Planting — Design';
  const teaching = await fetch(preset.base + 'teaching-traits.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let P = null; const K = new ActiveKnowledge({ store, library, teaching, project: () => (P ? P.state : null) });
  P = new Project({ store, cs: ctx.cs, K, site: preset });
  const R = new MixReasoner({ K }); R.probe().then(() => F.render());
  ctx.claimsSelection = () => true; // the workflow owns selection cards

  // ---------------------------------------------------------------- DOM
  const shell = document.createElement('div'); shell.className = 'f-shell'; shell.id = 'fshell';
  shell.innerHTML = `
    <header class="f-top">
      <span class="f-word">Generative Planting</span>
      <nav class="f-sections" aria-label="Workspace"><button data-ws="design" aria-pressed="true">Design</button><button data-ws="knowledge" aria-pressed="false">Knowledge</button></nav>
      <span class="f-proj"><span>${esc(preset.name)}</span><span aria-hidden="true">·</span><input id="fname" aria-label="Design name" maxlength="60"></span>
      <nav class="f-steps" aria-label="Workflow stages" id="fsteps"></nav>
      <span class="f-save" id="fsave" aria-live="polite"></span>
    </header>
    <aside class="f-panel" id="dpanel" aria-label="Current task"></aside>
    <div class="f-insp" id="finsp" hidden role="region" aria-label="Selection"></div>
    <div class="f-chip" id="fchip" hidden role="status"></div>
    <div class="f-tl" id="ftl" hidden role="radiogroup" aria-label="Month"></div>
    <div class="f-toast" id="ftoast" hidden role="status"></div>
    <footer class="f-bottom" id="fbottom">
      <button class="lnk" id="fback">← Back</button>
      <span class="ur"><button id="fundo" title="Undo (⌘Z)" aria-label="Undo">${ICON.undo}</button><button id="fredo" title="Redo (⇧⌘Z)" aria-label="Redo">${ICON.redo}</button></span>
      <span class="msg" id="fmsg" aria-live="polite"></span>
      <span id="fconfirm"></span>
      <button class="btn-p" id="fnext">Continue</button>
    </footer>
    <div class="f-know" id="fknow" hidden></div>`;
  app.appendChild(shell);
  const $ = (s) => shell.querySelector(s);

  const F = {
    ctx, store, plan, scene, P, K, R, library, preset, shell, $,
    panel: $('#dpanel'), insp: $('#finsp'),
    u: { bed: null, preview: null, logic: null, cells: new Set(), paint: null, hover: null, autoPreview: null, editor: null, suggestion: null, issue: null, confirm: null, knowledgeAdd: null, entry: true },
    stage() { return P.state.stage; },
    mod() { return STAGES.find((s) => s.id === P.state.stage).mod; },
    render() { renderSteps(); F.mod().render(F); renderBottom(); renderInsp(); renderChip(); renderTimeline(); F.repaint(); },
    renderPanel() { F.mod().render(F); renderBottom(); },
    renderBottom, renderInsp,
    repaint() { plan.request(); clearTimeout(F._rp); F._rp = setTimeout(() => { if (scene && scene.active !== false) store.emit('compute', { flow: true }); }, 60); },
    toast(msg, { err = false, ms = 4200 } = {}) { const t = $('#ftoast'); t.textContent = msg; t.className = 'f-toast' + (err ? ' err' : ''); t.hidden = false; clearTimeout(F._tt); F._tt = setTimeout(() => { t.hidden = true; }, ms); },
    go(stage, opts = {}) {
      if (!ORDER.includes(stage)) return false;
      const cur = ORDER.indexOf(P.state.stage), to = ORDER.indexOf(stage);
      if (to > cur) { for (let i = cur; i < to; i++) { const g = STAGES[i].mod.gate(F); if (!g.ok) { F.toast(g.reason); return false; } } }
      F.setPaint(null); F.u.autoPreview = null; F.u.preview = null; F.u.confirm = null; F.u.entry = false;
      P.setStage(stage);
      if (STAGES.find((s) => s.id === stage).mod.enter) STAGES.find((s) => s.id === stage).mod.enter(F, opts);
      F.render(); F.panel.scrollTop = 0; return true;
    },
    // cells under a world point (only committed cells)
    cellAt(x, y) { for (const c of P.allCells()) { const b = c._bb || (c._bb = bbox(c.geometry)); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (inside(c.geometry, x, y)) return c; } return null; },
    previewCellAt(x, y) { const pv = F.u.preview; if (!pv) return null; for (const c of pv.cells) if (inside(c.geometry, x, y)) return c; return null; },
    selectCells(ids, { add = false } = {}) { if (!add) F.u.cells.clear(); for (const id of ids) { if (add && F.u.cells.has(id)) F.u.cells.delete(id); else F.u.cells.add(id); } P.setView({ selectedCell: [...F.u.cells][0] || null }); F.render(); },
    focusCells(ids) {
      const cs = ids.map((id) => P.state.cells[id]).filter(Boolean); if (!cs.length) return;
      const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const c of cs) { const q = bbox(c.geometry); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); }
      const m = Math.max(4, (b[2] - b[0]) * 0.4, (b[3] - b[1]) * 0.4);
      if (ctx.st.view === 'plan') plan.fit([b[0] - m, b[1] - m, b[2] + m, b[3] + m], plan.padFor()); else if (scene && scene.setViewCenter) scene.setViewCenter((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(60, Math.max(6, 600 / Math.max(b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m))));
    },
    focusBed(bedId) { const o = store.getObject(bedId); if (!o) return; const b = bbox(o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry); const m = Math.max(5, (b[2] - b[0]) * 0.35); if (ctx.st.view === 'plan') plan.fit([b[0] - m, b[1] - m, b[2] + m, b[3] + m], plan.padFor()); else if (scene) scene.setViewCenter((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, Math.min(60, 560 / (b[2] - b[0] + 2 * m))); },
    // paint mode: one mix as the active brush (click or drag cells; one gesture = one undoable assignment)
    setPaint(mixId) {
      F.u.paint = mixId ? { mixId, stroke: null } : null; F.u.hover = null;
      const tool = mixId ? paintTool : null; plan.tool = tool; if (scene) scene.setTool(tool);
      document.getElementById('c2d').style.cursor = mixId ? 'crosshair' : ''; document.getElementById('c3d').style.cursor = mixId ? 'crosshair' : '';
      renderChip(); F.repaint();
    },
    openKnowledge(focus) { setWorkspace('knowledge', focus); },
    month() { return P.state.view.month || 6; },
  };
  ctx.flow = F; window.GPFlow = F;

  // paint tool: hover previews, a press-drag-release is one gesture
  const paintTool = {
    hover(x, y) { const c = x == null ? null : F.cellAt(x, y); const id = c ? c.id : null; if (id !== F.u.hover) { F.u.hover = id; F.repaint(); } },
    down(x, y) { if (x == null) return; F.u.paint.stroke = new Set(); const c = F.cellAt(x, y); if (c) F.u.paint.stroke.add(c.id); F.repaint(); },
    move(x, y) { if (!F.u.paint || !F.u.paint.stroke || x == null) return; const c = F.cellAt(x, y); if (c && !F.u.paint.stroke.has(c.id)) { F.u.paint.stroke.add(c.id); F.repaint(); } F.u.hover = c ? c.id : null; },
    up() { if (!F.u.paint || !F.u.paint.stroke) return; const ids = [...F.u.paint.stroke]; F.u.paint.stroke = null; if (ids.length) Compose.paintCells(F, ids); else F.repaint(); },
  };

  // ---------------------------------------------------------------- stepper, bottom bar, inspector, chip, timeline
  function renderSteps() {
    const cur = ORDER.indexOf(P.state.stage); const max = ORDER.indexOf(P.state.maxStage);
    $('#fsteps').innerHTML = STAGES.map((s, i) => `${i ? '<span class="sep" aria-hidden="true"></span>' : ''}<button data-st="${s.id}" class="${i < cur || (i <= max && i !== cur) ? 'done' : ''}" ${i === cur ? 'aria-current="step"' : ''} ${i > max + 1 ? 'disabled' : ''} title="${esc(s.name)}"><span class="n">${i + 1}</span><span class="lbl">${esc(s.name)}</span></button>`).join('');
    $('#fsteps').querySelectorAll('button').forEach((b) => (b.onclick = () => F.go(b.dataset.st)));
    const nm = $('#fname'); if (document.activeElement !== nm) nm.value = P.state.name;
  }
  function renderBottom() {
    const b = F.mod().bottom(F); const i = ORDER.indexOf(P.state.stage);
    $('#fback').hidden = i === 0; $('#fback').textContent = i ? `← ${STAGES[i - 1].name}` : '';
    $('#fmsg').innerHTML = b.msg || '';
    const n = $('#fnext'); n.textContent = b.next ? b.next.label : ''; n.hidden = !b.next; n.disabled = !!(b.next && !b.next.enabled); n.title = b.next && !b.next.enabled ? b.next.reason || '' : '';
    if (b.next && !b.next.enabled && b.next.reason) $('#fmsg').innerHTML = `${b.msg ? b.msg + ' · ' : ''}<span class="dim">${esc(b.next.reason)}</span>`;
    $('#fundo').disabled = !P.past.length; $('#fredo').disabled = !P.future.length;
    $('#fundo').title = P.past.length ? `Undo: ${P.past[P.past.length - 1].label} (⌘Z)` : 'Nothing to undo'; $('#fredo').title = P.future.length ? `Redo: ${P.future[P.future.length - 1].label}` : 'Nothing to redo';
    const cf = $('#fconfirm'); cf.innerHTML = '';
    if (F.u.confirm) { cf.innerHTML = `<span class="confirm"><span>${esc(F.u.confirm.text)}</span>${F.u.confirm.actions.map((a, k) => `<button class="${k ? 'lnk' : 'btn-s'}" data-k="${k}">${esc(a.label)}</button>`).join('')}</span>`; cf.querySelectorAll('button').forEach((x) => (x.onclick = () => { const a = F.u.confirm.actions[+x.dataset.k]; F.u.confirm = null; a.run(); renderBottom(); })); }
  }
  $('#fback').onclick = () => { const i = ORDER.indexOf(P.state.stage); if (i > 0) F.go(ORDER[i - 1]); };
  $('#fnext').onclick = () => { const b = F.mod().bottom(F); if (b.next && b.next.enabled) b.next.run(); };
  $('#fundo').onclick = () => { const l = P.undo(); if (l) F.toast('Undone: ' + l); };
  $('#fredo').onclick = () => { const l = P.redo(); if (l) F.toast('Redone: ' + l); };
  $('#fname').onchange = (e) => { P.state.name = e.target.value.trim() || 'Planting design'; P.save(); };
  function renderInsp() {
    const html = F.mod().inspector ? F.mod().inspector(F) : null;
    F.insp.hidden = !html; if (!html) return;
    F.insp.innerHTML = `<button class="x" aria-label="Close selection">${ICON.x}</button>` + html;
    F.insp.querySelector('.x').onclick = () => { F.u.cells.clear(); F.u.bedInspect = null; store.select(null); F.render(); };
    if (F.mod().bindInspector) F.mod().bindInspector(F, F.insp);
  }
  function renderChip() {
    const c = $('#fchip'); const pm = F.u.paint && P.mix(F.u.paint.mixId);
    c.hidden = !pm; if (!pm) return;
    c.innerHTML = `<span><span class="sw" style="background:${esc(pm.color)}"></span>Painting <b>${esc(pm.name)}</b> — click or drag across cells</span><button id="fchipx">Done (Esc)</button>`;
    c.querySelector('#fchipx').onclick = () => { F.setPaint(null); F.renderPanel(); };
  }
  function renderTimeline() {
    const t = $('#ftl'); const show = P.state.stage === 'explore' && P.state.view.explore !== 'planting';
    t.hidden = !show; if (!show) return;
    const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']; const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const tg = P.state.brief.objectives.flowering.on ? P.state.brief.objectives.flowering.months : [];
    t.innerHTML = M.map((m, i) => `<button role="radio" aria-checked="${F.month() === i + 1}" aria-pressed="${F.month() === i + 1}" class="${tg.includes(i + 1) ? 'tgt' : ''}" data-m="${i + 1}" title="${full[i]}${tg.includes(i + 1) ? ' (in your brief)' : ''}">${m}</button>`).join('');
    t.querySelectorAll('button').forEach((b) => (b.onclick = () => { P.setView({ month: +b.dataset.m }); F.render(); }));
  }

  // ---------------------------------------------------------------- canvas: paint hook (plan + 3D ground texture)
  store.flowPaint = (c2, T, o, phase) => paintFlow(F, c2, T, o, phase);
  // selection from the canvas: a click resolves to a cell (or a bed in Structure)
  store.on('selection', (sel) => {
    if (F.u.paint || !sel || !sel.at) { if (!sel && !F.u.paint && F.u.cells.size && F._clearOnNull) { F._clearOnNull = false; } return; }
    const [x, y] = sel.at; const mod = F.mod();
    if (mod.onCanvasClick) mod.onCanvasClick(F, x, y, sel, { shift: F._shift });
  });
  window.addEventListener('pointerdown', (e) => { F._shift = e.shiftKey || e.metaKey; }, true);

  // ---------------------------------------------------------------- Design | Knowledge (parallel workspace, same page)
  function setWorkspace(ws, focus) {
    shell.querySelectorAll('.f-sections button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ws === ws)));
    const k = $('#fknow');
    if (ws === 'knowledge') {
      if (!k.firstChild) {
        const kdb = params.get('kdb'); const fr = document.createElement('iframe'); fr.title = 'Knowledge workspace';
        fr.src = 'knowledge/index.html' + (kdb ? `?db=${encodeURIComponent(kdb)}` : ''); k.appendChild(fr);
        fr.addEventListener('load', () => { try { const d = fr.contentDocument; d.querySelectorAll('a[href="../index.html"], .wordmark').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); setWorkspace('design'); })); } catch { /* cross-origin */ } });
      }
      k.hidden = false; F._kFocus = focus || null;
    } else {
      if (!k.hidden) { k.hidden = true; reloadPersonal(); }
    }
  }
  async function reloadPersonal() { // the Knowledge workspace may have added personal records: re-read them, design untouched
    try { if (library.kstore && library.kb) { const ev = await library.kstore.loadEvents(); const before = library.kb.events.length; library.kb.setEvents(ev); if (ev.length !== before) { P.markStale('knowledge'); P.recompute(); F.toast(`Knowledge changed (${ev.length - before > 0 ? '+' : ''}${ev.length - before} personal change${Math.abs(ev.length - before) === 1 ? '' : 's'}): metrics recomputed; your mixes and plants are unchanged.`); } } } catch (e) { console.warn(e); }
    F.render();
  }
  shell.querySelectorAll('.f-sections button').forEach((b) => (b.onclick = () => setWorkspace(b.dataset.ws)));

  // ---------------------------------------------------------------- keyboard: Esc steps back; ⌘Z / ⇧⌘Z
  window.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.stopImmediatePropagation(); const l = e.shiftKey ? P.redo() : P.undo(); if (l) F.toast((e.shiftKey ? 'Redone: ' : 'Undone: ') + l); return; }
    if (e.key !== 'Escape' || typing) return;
    if (!$('#fknow').hidden) { e.stopImmediatePropagation(); setWorkspace('design'); return; }
    if (F.u.paint) { e.stopImmediatePropagation(); F.setPaint(null); F.renderPanel(); return; }
    if (F.u.confirm) { e.stopImmediatePropagation(); F.u.confirm = null; renderBottom(); return; }
    if (F.u.cells.size || F.u.bedInspect) { e.stopImmediatePropagation(); F.u.cells.clear(); F.u.bedInspect = null; store.select(null); F.render(); }
  }, true);

  // ---------------------------------------------------------------- state events
  P.on((type, d) => {
    if (type === 'change') { F.render(); }
    if (type === 'saved') { const s = $('#fsave'); s.className = 'f-save' + (d.ok && !d.error ? '' : ' err'); s.textContent = !d.ok ? 'Not saved' : d.error ? 'Saved (positions rebuilt)' : 'Saved in this browser'; s.title = d.error || (d.savedAt ? 'Saved ' + new Date(d.savedAt).toLocaleTimeString() : ''); }
    if (type === 'error') F.toast(d.message, { err: true, ms: 8000 });
  });
  K.onChange(() => { if (F._ready) { P.recompute(); F.renderPanel(); F.repaint(); } });
  plan.onCursor = () => {};

  // ---------------------------------------------------------------- start: resume or new (one project; it is preselected)
  const stored = params.get('fresh') === '1' ? null : Project.stored();
  F.u.resume = stored && stored.siteId === preset.id ? { name: stored.name, stage: stored.stage, savedAt: stored.savedAt, cells: Object.keys(stored.cells || {}).length, mixes: (stored.mixes || []).length } : null;
  F.resume = () => { const r = P.restore(stored); if (!r.ok) { F.toast(r.error, { err: true }); return; } F.u.entry = false; F.u.resume = null; const st = P.state.stage; if (P.state.view.obs) ctx.setObs(P.state.view.obs); if (P.state.view.plan && ctx.st.view === 'plan') { Object.assign(plan.view, P.state.view.plan); plan._fitted = true; plan.request(); } const mod = STAGES.find((s) => s.id === st).mod; if (mod.enter) mod.enter(F, { resumed: true }); F.render(); F.toast(`Resumed “${P.state.name}” at ${STAGES.find((s) => s.id === st).name}.`); };
  F.startNew = () => { P.reset(); F.u.resume = null; F.u.entry = true; F.u.cells.clear(); P.setStage('define'); F.render(); };
  if (params.get('resume') === '1' && stored) F.resume();
  // remember the camera (view state, not design)
  const remember = () => { P.state.view.obs = ctx.st.view === '3d' ? 'axo' : 'plan'; if (ctx.st.view === 'plan') P.state.view.plan = { ...plan.view }; P.saveSoon(); };
  document.getElementById('c2d').addEventListener('pointerup', remember); document.getElementById('c2d').addEventListener('wheel', () => { clearTimeout(F._wt); F._wt = setTimeout(remember, 300); }, { passive: true });
  document.querySelectorAll('.obs button').forEach((b) => b.addEventListener('click', () => setTimeout(remember, 50)));
  ctx.setObs(P.state.stage === 'define' ? '3d' : P.state.view.obs || 'plan');
  F._ready = true;
  // personal knowledge loads after the page is ready (app.js); re-render when it arrives
  library.onChange(() => { if (F._ready) F.renderPanel(); });
  F.render();
  return F;
}
