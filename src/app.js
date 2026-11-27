// Generative Planting · Site setup — the spatial input module of the tool.
// One spatial canvas (Axo or Plan), one layers panel, one design selector. Detroit is a site preset, not the product.
//
// Two axes that never mix:
//   design = which planting you look at: Reference (read-only reconstruction) | Working design (editable)
//   view   = how you look at it: Axo | Plan · show Everything | Site only | Terrain · one layer alone (solo, in plan)
//            · exploded stack (optional explanation)
import { ModelStore } from './model.js';
import { Picker } from './picker.js';
import { Plan2D } from './plan2d.js';
import { TOK, speciesPlanColor, RAMPS } from './style.js';
import { GROUPS, GROUP, LAYER_NAME, groupVisible, groupLocked, setGroup } from './layers.js';
import { getRaster } from './paint.js';
import { renderInspector, renderAbout } from './inspector.js';
import { ComputeSpace } from './compute.js';
import { createConditions } from './conditions.js';
import { PlantLibrary } from './design/library.js';
import { DesignDoc } from './design/doc.js';
import { DesignOps, OPS } from './design/ops.js';
import { feedback, season, compareReference } from './design/feedback.js';
import { createDesignUI } from './design/ui.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const DEV = params.get('dev') === '1';
const EMBED = params.get('embed') === '1';
// Integrated Prototype: the Define → Structure → Compose → Explore workflow is the default; ?classic=1 opens the previous
// site-setup + brush prototype (kept, not in the main path)
const FLOW = params.get('classic') !== '1' && !EMBED;
const FALLBACK_PRESET = { id: 'detroit', name: 'Oudolf Garden Detroit', location: 'Belle Isle, Detroit, Michigan', base: 'data/detroit/' };

async function loadPreset() {
  let list = [FALLBACK_PRESET];
  try { const r = await fetch('data/presets.json'); if (r.ok) { const j = await r.json(); if (Array.isArray(j.presets) && j.presets.length) list = j.presets; } } catch { /* fall back */ }
  const want = params.get('site');
  return { preset: list.find((p) => p.id === want) || list[0], presets: list };
}

async function main() {
  const { preset, presets } = await loadPreset();
  const store = await ModelStore.load(preset.base);
  // computational space (levels 1–4): built from the site, never from the planting design
  let csCfg = null; try { const r = await fetch('data/compute.json'); if (r.ok) csCfg = await r.json(); } catch { /* built-in defaults */ }
  const cs = new ComputeSpace(store, csCfg); store.compute = cs;
  // design layer: plant library (site attributes + Planting Intelligence knowledge), mixes, design document, operations
  const getJson = async (u) => { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } };
  const [mixFile, libFile] = await Promise.all([getJson(preset.base + 'mixes.json'), getJson(preset.base + 'design-library.json')]);
  const library = new PlantLibrary(store, { place: (libFile && libFile.place) || 'place:detroit', library: libFile });
  const doc = new DesignDoc({ store, cs, library, site: preset, initialMixes: (mixFile && mixFile.mixes) || [] });
  const dops = new DesignOps(doc);
  const picker = new Picker(store);
  const app = $('#app');
  if (EMBED) app.classList.add('embed');
  if (FLOW) app.classList.add('flow');
  $('#siteName').textContent = preset.name;
  const plan = new Plan2D($('#c2d'), store, picker);
  let scene = null;
  try {
    const { Scene3D } = await import('./scene3d.js');
    scene = new Scene3D($('#c3d'), store, picker, { labelRoot: $('#labels3d'), preserve: params.has('shot'), quality: params.get('q') || 'high', vex: params.get('vex') === '1' ? 1 : 1.6 });
  } catch (err) { console.error('3D unavailable', err); }

  const st = { view: scene ? '3d' : 'plan', explode: false, design: 'reference', filter: 'all', solo: null, soloFrom: null, autoOn: [], plateFocus: null, panel: false, inspectorOpen: false, entered: true };
  const ctx = { store, plan, scene, picker, st, dev: DEV, cs, app, doc, dops, library, preset, mixFile };
  const bus = new EventTarget();
  const emit = (type, detail) => { bus.dispatchEvent(new CustomEvent(type, { detail })); if (EMBED && window.parent !== window) { try { window.parent.postMessage({ gp: 'event', type, detail: JSON.parse(JSON.stringify(detail ?? null)) }, '*'); } catch { /* not serialisable */ } } };
  ctx.emit = emit;
  ctx.syncUrl = () => syncUrl();
  ctx.setFilter = (f) => setFilter(f);
  ctx.startBlank = (scope) => startBlank(scope);
  ctx.afterClose = () => { if (store.selection) renderInspector(store, store.selection, ctx); };
  const cond = createConditions(ctx);
  ctx.openConditions = (scope) => { const r = cond.open(scope); if (r.ok && plan) plan.request(); return r; };

  // ================================================================ canvas: Axo | Plan are two observations of one canvas
  function applyCanvas() {
    const v = st.explode ? 'layers' : st.view;
    app.dataset.view = v;
    document.querySelectorAll('.obs button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === st.view && !st.explode)));
    plan.setActive(v === 'plan');
    if (scene) { scene.setActive(v !== 'plan'); if (v !== 'plan') scene.setLayersView(st.explode); }
    $('#compass').hidden = v !== '3d';
    $('#coords').hidden = v !== 'plan';
    $('#btnExplode').setAttribute('aria-pressed', String(st.explode));
    renderPlateLabels(); renderStatus(); renderPanel(); syncUrl();
    emit('view', api.viewState());
  }
  // the same place and scale carry over between Axo and Plan
  function setObs(v, { keepSolo = false } = {}) {
    if (v === 'axo') v = '3d';
    if (v !== '3d' && v !== 'plan') v = 'plan';
    if (v === '3d' && !scene) v = 'plan';
    if (st.solo && !keepSolo && v === '3d') exitSolo({ silent: true });
    if (st.explode && v === 'plan' && !keepSolo) st.explode = false;
    const from = st.explode ? 'layers' : st.view;
    if (from === '3d' && v === 'plan' && scene) { const c = scene.viewCenter(); plan.resize(); Object.assign(plan.view, { cx: c.x, cy: c.y, scale: Math.max(1.2, Math.min(400, c.ppm)) }); plan._fitted = true; }
    if (from === 'plan' && v === '3d' && scene && plan._fitted) { scene.setLayersView(false); scene.setViewCenter(plan.view.cx, plan.view.cy, plan.view.scale); }
    st.view = v;
    if (v === 'plan' && !plan._fitted) { plan.resize(); plan.fit(); plan._fitted = true; }
    applyCanvas();
  }
  document.querySelectorAll('.obs button').forEach((b) => b.addEventListener('click', () => { if (st.explode) setExplode(false); setObs(b.dataset.v); }));
  const fit = () => { if (st.view === 'plan' && !st.explode) plan.fit(); else if (scene) scene.home(); };
  $('#btnFit').addEventListener('click', fit);
  window.addEventListener('resize', () => { plan.resize(); if (scene) scene.resize(); if (st.view === 'plan') plan.request(); });
  if (scene) scene.onLabels = () => { placePlateLabels(); const a = scene.northAngle(); $('#compass svg').style.transform = `rotate(${(a * 180 / Math.PI).toFixed(1)}deg)`; };

  // ================================================================ design: Reference | Working design
  function setDesign(d, { silent = false } = {}) {
    if (d === 'working' && !store.draft) { if (!silent) openDraftDialog(); return false; }
    st.design = d; app.dataset.design = d;
    const want = d === 'working' ? 'working' : 'reference';
    if (store.scenario !== want) store.setScenario(want);
    renderDesign(); renderStatus(); renderPanel(); syncUrl();
    document.querySelector('.where .module').textContent = d === 'working' && doc.active() ? 'Planting design' : 'Site setup';
    if (ctx.dui) ctx.dui.refresh();
    emit('design', { design: d, draft: store.draftInfo() });
    return true;
  }
  ctx.toggleReference = () => setDesign(st.design === 'working' ? 'reference' : 'working');
  function renderDesign() {
    const has = !!store.draft;
    document.querySelectorAll('.design .seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.d === st.design && (b.dataset.d === 'reference' || has))));
    const w = $('#btnWorking'); w.textContent = has ? 'Working design' : 'New design';
    w.title = has ? 'Your editable planting design' : 'Start a working design from the reference or from empty beds';
    w.classList.toggle('new', !has);
    $('#btnDesignMenu').hidden = !has;
  }
  document.querySelectorAll('.design .seg button').forEach((b) => b.addEventListener('click', () => setDesign(b.dataset.d)));
  const menu = $('#designMenu');
  const closeMenu = () => { menu.hidden = true; $('#btnDesignMenu').setAttribute('aria-expanded', 'false'); };
  $('#btnDesignMenu').addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; $('#btnDesignMenu').setAttribute('aria-expanded', String(!menu.hidden)); if (!menu.hidden) menu.querySelector('button').focus(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('#designMenu')) closeMenu(); });
  menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    closeMenu(); const a = b.dataset.a;
    if (a === 'reset') { if (confirm('Undo every change in this working design? It goes back to how it started. The reference is not affected.')) { if (doc.active()) doc.start({ from: store.draft.from, scope: store.draft.scope }); else store.resetDraft(); setDesign('working'); } }
    else if (a === 'export') exportDraft();
    else if (a === 'new') openDraftDialog();
    else if (a === 'discard') { if (confirm('Delete the working design? This cannot be undone unless you exported it. The reference is not affected.')) { store.discardDraft(); doc.discard(); setDesign('reference'); } }
    else if (a === 'knowledge') window.open('knowledge/index.html', '_blank', 'noopener');
  }));
  function exportDraft() {
    const data = store.exportDraft(); if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${preset.id}-working-design.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // start dialog: two equal choices, each starts at once; extra scope only on request; consequences in beds, not counts
  function openDraftDialog() {
    const dlg = $('#draftdlg'); const P = store.caseCfg.planting || {};
    const def = store.defaultBlankScope(); const opt = P.blankOptional || {};
    const dirty = store.draft && store.draft.ops.length;
    const selBeds = st.an.open ? st.an.scope.slice() : (bedOfSel(store.selection) ? [bedOfSel(store.selection)] : []);
    dlg.innerHTML = `<div class="dlg-in"><h3 id="dlgTitle">Start a working design</h3>
      <p class="sub">The reference stays as it is. Your design is kept in this browser and can be exported.</p>
      <div class="choices">
        <button class="choice" data-a="copy"><b>From the reference planting</b><span>Copy the reconstructed planting and change it.</span></button>
        <button class="choice" data-a="blank"><b>Blank beds</b><span>Empty the ${def.length} main beds. Bed outlines, paths, existing trees, lawn, Rain Garden and meadows stay.</span></button>
        ${selBeds.length ? `<button class="choice" data-a="blanksel"><b>Blank: ${esc(selBeds.map((b) => b.replace('bed.', '')).join(', '))} only</b><span>Empty only the selected bed${selBeds.length === 1 ? '' : 's'}; every other bed keeps the reference planting.</span></button>` : ''}
      </div>
      <details class="extra"><summary>Also empty…</summary><div class="opts">${Object.entries(opt).map(([u, n]) => `<label><input type="checkbox" data-u="${esc(u)}"> ${esc(n)}</label>`).join('')}</div></details>
      ${dirty ? `<p class="warn">This replaces your current working design (${store.draft.ops.length} change${store.draft.ops.length === 1 ? '' : 's'}). <button class="lnk" data-a="exp">Export it first</button></p>` : ''}
      <p class="err" role="alert" hidden></p>
      <div class="row"><button class="btn" data-a="cancel">Cancel</button></div></div>`;
    dlg.hidden = false;
    const exp = dlg.querySelector('[data-a=exp]'); if (exp) exp.onclick = exportDraft;
    dlg.querySelector('[data-a=cancel]').onclick = () => { dlg.hidden = true; renderDesign(); };
    const go = (from) => {
      const scope = from === 'blank' ? [...def, ...[...dlg.querySelectorAll('input[data-u]:checked')].map((i) => i.dataset.u)] : undefined;
      const r = doc.start({ from: from === 'blank' ? 'blank' : 'reference', scope });
      if (!r.ok) { const e = dlg.querySelector('.err'); e.textContent = `Could not start the design: ${r.error}`; e.hidden = false; return; }
      dlg.hidden = true; setDesign('working');
    };
    dlg.querySelector('[data-a=copy]').onclick = () => go('copy');
    dlg.querySelector('[data-a=blank]').onclick = () => go('blank');
    const bs = dlg.querySelector('[data-a=blanksel]'); if (bs) bs.onclick = () => { const r = doc.start({ from: 'blank', scope: selBeds }); if (!r.ok) { const e = dlg.querySelector('.err'); e.textContent = `Could not start the design: ${r.error}`; e.hidden = false; return; } dlg.hidden = true; setDesign('working'); };
    dlg.querySelector('[data-a=copy]').focus();
  }

  // ================================================================ show filter (view state, not a design)
  function setFilter(f) {
    if (!['all', 'site', 'terrain'].includes(f)) f = 'all';
    st.filter = f;
    store.setViewState({ mode: f === 'terrain' ? 'terrain' : 'normal', hidePlanting: f === 'site' });
    renderPanel(); renderStatus(); syncUrl(); emit('view', api.viewState());
    const hb = document.querySelector('#conditions [data-a=hide]'); if (hb) hb.checked = f !== 'all';
  }
  document.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.f)));

  // ================================================================ status (always says which design, and how certain)
  function renderStatus() {
    const n = $('#note'); const d = store.draftInfo();
    let t = st.design === 'working' && d ? (doc.active() ? `Working design, ${d.from === 'blank' ? 'started from blank beds' : 'started from the reference'}: ${doc.state.assignments.length} painted space${doc.state.assignments.length === 1 ? '' : 's'}, kept in this browser.` : `Working design, ${d.from === 'blank' ? 'started from blank beds' : 'started from the reference'}: ${d.changes} change${d.changes === 1 ? '' : 's'}, kept in this browser.`) : 'Reference: schematic reconstruction, not a survey.';
    if (st.filter === 'terrain') t += ' Showing terrain only.'; else if (st.filter === 'site') t += ' Planting hidden.';
    n.textContent = t;
  }
  store.on('model', () => { renderStatus(); renderDesign(); if (st.panel) renderPanel(); });
  store.on('draft', () => { renderStatus(); renderDesign(); });

  // ================================================================ layers panel: visibility, solo (2D), overlays, key, exploded
  const panelEl = $('#layers');
  function setPanel(open) {
    st.panel = open; panelEl.hidden = !open; $('#btnLayers').setAttribute('aria-pressed', String(open)); app.classList.toggle('panel-open', open);
    if (open) renderPanel();
    if (st.view === 'plan') { plan.resize(); plan.request(); }
    if (st.explode && scene) scene.home(); // re-frame the stack beside the panel
    syncUrl();
  }
  $('#btnLayers').addEventListener('click', () => setPanel(!st.panel));
  $('#btnLayersClose').addEventListener('click', () => setPanel(false));
  $('#btnExplode').addEventListener('click', () => setExplode(!st.explode));
  const ICON = {
    eye: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="10" r="2.3" fill="currentColor"/></svg>',
    eyeOff: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 17 17 3" stroke="currentColor" stroke-width="1.3"/></svg>',
    solo: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M3.5 6.5h13M3.5 10h13M3.5 13.5h13" stroke="currentColor" stroke-width="1.2" opacity=".35"/><path d="M3.5 10h13" stroke="currentColor" stroke-width="2.2"/></svg>',
    lock: '<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    chev: '<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const expanded = new Set();
  function renderPanel() {
    if (!st.panel) return;
    document.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === st.filter)));
    const root = $('#ltree'); root.innerHTML = '';
    for (const g of GROUPS) {
      const vis = groupVisible(store, g.id), solo = st.solo && st.solo.group === g.id, other = st.solo && !solo;
      const ov = other ? st.solo.overlays[g.id] || 0 : 0;
      const row = document.createElement('div'); row.className = 'lrow group' + (solo ? ' solo' : '') + (other && !ov ? ' dim' : ''); row.dataset.group = g.id; row.setAttribute('role', 'listitem');
      row.innerHTML = `<button class="chev" aria-expanded="${expanded.has(g.id)}" aria-label="Show the parts of ${esc(g.name)}">${ICON.chev}</button><span class="name" title="${esc(g.blurb)}">${esc(g.name)}</span>` +
        (other ? `<label class="ovr" title="Show under ${esc(GROUP[st.solo.group].name)} for reference"><input type="checkbox" data-ov ${ov > 0 ? 'checked' : ''} aria-label="Trace ${esc(g.name)} under the solo layer"><span>Trace</span></label>`
          : solo ? '<span class="tag">alone</span>' : `<button class="tg eye ${vis ? '' : 'off'}" aria-pressed="${vis}" aria-label="Show ${esc(g.name)}" title="${vis ? 'Visible' : 'Hidden'}">${vis ? ICON.eye : ICON.eyeOff}</button>`) +
        `<button class="tg solo" aria-pressed="${!!solo}" aria-label="Show ${esc(g.name)} alone in plan" title="${solo ? 'Back to all layers' : 'Show alone in plan'}">${ICON.solo}</button>`;
      root.appendChild(row);
      row.querySelector('.chev').onclick = () => { expanded.has(g.id) ? expanded.delete(g.id) : expanded.add(g.id); renderPanel(); };
      row.querySelector('.solo').onclick = () => (solo ? exitSolo() : openSolo(g.id));
      const eye = row.querySelector('.eye'); if (eye) eye.onclick = () => { setGroup(store, g.id, { visible: !vis }); markTouched(g.id); renderPanel(); };
      const cb = row.querySelector('[data-ov]'); if (cb) cb.onchange = () => { st.solo.overlays[g.id] = cb.checked ? 0.5 : 0; plan.setIsolation(st.solo); renderPanel(); syncUrl(); };
      if (ov > 0) {
        const r = document.createElement('div'); r.className = 'lrow opac';
        r.innerHTML = `<span></span><input type="range" min="10" max="100" step="5" value="${Math.round(ov * 100)}" aria-label="${esc(g.name)} trace opacity"><span class="num">${Math.round(ov * 100)}%</span>`;
        root.appendChild(r);
        const rg = r.querySelector('input'); rg.oninput = () => { st.solo.overlays[g.id] = rg.value / 100; r.querySelector('.num').textContent = rg.value + '%'; plan.request(); syncUrl(); };
      }
      if (!expanded.has(g.id)) continue;
      for (const l of g.layers) {
        const L = store.layers.get(l); if (!L) continue;
        const s = store.layerState[l]; const na = L.status === 'unavailable';
        const r = document.createElement('div'); r.className = 'lrow child' + (store.layerVisible(l) ? '' : ' dim'); r.dataset.layer = l;
        r.innerHTML = `<span></span><span class="name">${esc(LAYER_NAME[l] || L.name)}</span>` +
          (na ? '<span class="na" title="No data: shown as unknown, never as zero">no data</span>' :
            `<button class="tg eye ${s.visible ? '' : 'off'}" aria-pressed="${s.visible}" aria-label="Show ${esc(LAYER_NAME[l] || L.name)}">${s.visible ? ICON.eye : ICON.eyeOff}</button><button class="tg lock ${s.locked ? 'on' : ''}" aria-pressed="${s.locked}" aria-label="Lock ${esc(LAYER_NAME[l] || L.name)}" title="${s.locked ? 'Locked: cannot be selected' : 'Can be selected'}">${ICON.lock}</button>`);
        root.appendChild(r);
        const e = r.querySelector('.eye'); if (e) e.onclick = () => {
          const on = !s.visible; const otherR = { 'analysis.slope': 'analysis.pathdist', 'analysis.pathdist': 'analysis.slope' }[l]; // one analysis raster at a time
          if (on && otherR) store.setLayer(otherR, { visible: false });
          store.setLayer(l, { visible: on }); markTouched(l); renderPanel();
        };
        const k = r.querySelector('.lock'); if (k) k.onclick = () => { store.setLayer(l, { locked: !s.locked }); renderPanel(); };
      }
    }
    renderKey();
  }
  store.on('layers', (e) => { if (e && e.external && st.panel) renderPanel(); });

  // ---- solo: one layer group alone in plan (+ trace overlays). Layers the app had to switch on are switched back on exit.
  const markTouched = (id) => { st.autoOn = st.autoOn.filter((l) => l !== id && !(GROUP[id] && GROUP[id].layers.includes(l))); };
  function openSolo(gid, { overlays = {}, fromUrl = false } = {}) {
    if (!GROUP[gid]) return false;
    if (!st.solo) { st.soloFrom = fromUrl ? 'plan' : st.explode ? 'layers' : st.view; st.autoOn = []; }
    const turnOn = (l) => { if (!store.layerState[l].visible) { store.setLayer(l, { visible: true }); st.autoOn.push(l); } };
    if (gid === 'analysis') { if (!store.layerState['analysis.slope'].visible && !store.layerState['analysis.pathdist'].visible) turnOn('analysis.slope'); turnOn('analysis'); }
    else if (!groupVisible(store, gid)) for (const l of GROUP[gid].layers) if (store.layers.has(l) && store.layers.get(l).status !== 'unavailable' && l !== 'topo.contours') turnOn(l);
    st.solo = { group: gid, overlays: { ...overlays } };
    plan.setIsolation(st.solo); store.select(null);
    if (!st.panel) setPanel(true);
    if (st.explode) { st.explode = false; }
    setObs('plan', { keepSolo: true });
    if (!plan._soloFitted) { plan.fit(); plan._soloFitted = true; }
    renderSoloChip(); emit('solo', { group: gid });
    return true;
  }
  function exitSolo({ silent = false } = {}) {
    if (!st.solo) return;
    for (const l of st.autoOn) store.setLayer(l, { visible: false });
    st.autoOn = []; st.solo = null; plan.setIsolation(null); renderSoloChip();
    if (!silent) {
      if (st.soloFrom === 'layers') { st.explode = true; st.view = '3d'; applyCanvas(); if (st.plateFocus) focusPlate(st.plateFocus); }
      else if (st.soloFrom === '3d') setObs('3d');
      else applyCanvas();
    } else renderPanel();
    emit('solo', { group: null });
  }
  function renderSoloChip() {
    let c = $('#solochip');
    if (!st.solo) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.id = 'solochip'; c.className = 'solochip'; app.appendChild(c); }
    c.innerHTML = `<span>${esc(GROUP[st.solo.group].name)} alone, in plan</span><button class="lnk" data-a="back">Show all layers</button>`;
    c.querySelector('button').onclick = () => exitSolo();
  }

  // ---- key (legend): the soloed layer's key, or the key of what is on screen
  const legendEl = $('#legend');
  const sw = (c, cls = '') => `<span class="sw ${cls}" style="--c:${c}"></span>`;
  const rampCss = (stops) => `linear-gradient(90deg, ${stops.join(',')})`;
  function speciesInView(kind) {
    const vb = plan.viewBox(); const tally = new Map(); const s = store;
    if (kind === 'instances') {
      for (let i = 0; i < s.inst.n; i++) { if (!s.inst.alive[i] || s.inst.pl[i] < 0) continue; const x = s.inst.x[i], y = s.inst.y[i]; if (x < vb[0] || x > vb[2] || y < vb[1] || y > vb[3]) continue; const id = s.speciesByIndex[s.inst.sp[i]].id; tally.set(id, (tally.get(id) || 0) + 1); }
    } else {
      for (const p of s.model.placements) { if ((p.role || '').startsWith('bulb') || p.role === 'matrix' || p.role === 'meadow') continue; const b = s.placementBox(p); if (b[2] < vb[0] || b[0] > vb[2] || b[3] < vb[1] || b[1] > vb[3]) continue; for (const id of p.speciesIds) tally.set(id, (tally.get(id) || 0) + (p.areaM2 || 0.3)); }
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ sp: s.getObject(id), n }));
  }
  const spRows = (list, unit) => (list.length ? `<ul class="lg-sp">${list.map(({ sp, n }) => `<li>${sw(speciesPlanColor(sp), 'dot')}<span><i>${esc(sp.scientificName)}</i>${sp.cultivar ? ` ‘${esc(sp.cultivar)}’` : ''}</span><span class="num">${unit === 'm2' ? n.toFixed(0) + ' m²' : n}</span></li>`).join('')}</ul>` : '<p class="muted small">No planting in view.</p>');
  function groupKey(gid) {
    const g = GROUP[gid];
    const srcs = g.sources.map((id) => store.getObject(id)).filter(Boolean).map((s) => esc(s.title.split(' (')[0])).join('; ');
    let body = '';
    if (gid === 'terrain') {
      const R = getRaster(store, 'elevation');
      body = `<div class="ramp" style="background:${rampCss(RAMPS.elevation)}"></div><div class="ramp-l"><span>${R.lo.toFixed(1)} m</span><span>${R.hi.toFixed(1)} m NAVD88</span></div>
        <ul class="lg-keys"><li>${sw('#6E5F43', 'line')}Contour every 1 m</li><li>${sw('#6E5F43', 'line thin')}Every 0.25 m, interpolated from the 1 m grid</li><li>${sw(TOK.inkDeep, 'line dashdot')}Garden boundary</li>${st.filter === 'terrain' ? `<li><input type="checkbox" data-tout ${store.view.terrainOutline !== false ? 'checked' : ''} aria-label="Show bed outlines"><span>Bed outlines, for orientation</span></li>` : ''}</ul>
        <p class="muted small">USGS 3DEP, 1 m cells, about 0.1 m vertical accuracy. 3D relief is drawn ×${scene ? scene.VEX : 1.6}. <button class="lnk" data-a="vex">${scene && scene.VEX === 1 ? 'Exaggerate ×1.6' : 'Show true vertical scale'}</button></p>`;
    } else if (gid === 'infrastructure') {
      body = `<ul class="lg-keys"><li>${sw(TOK.path, 'box')}Gravel path, sidewalk</li><li>${sw(TOK.lawnDeep, 'box dashed')}Grass walk</li><li>${sw(TOK.stone, 'line thick')}Limestone wall</li><li>${sw(TOK.stone, 'box')}Carillon, memorial</li><li>${sw(TOK.building, 'box hatch')}Building nearby</li><li>${sw(TOK.water, 'box')}Water</li><li>${sw(TOK.context, 'box')}Road, parking</li></ul>`;
    } else if (gid === 'siteveg') {
      body = `<ul class="lg-keys"><li>${sw(TOK.midVeg, 'disc dashed')}Existing tree crown, digitised from aerial imagery; species unknown</li><li>${sw(TOK.lawn, 'box')}Mown lawn</li></ul><p class="muted small">Kept in every design by default. That is an assumption, not proof a tree is protected.</p>`;
    } else if (gid === 'framework') {
      body = `<ul class="lg-keys"><li>${sw(TOK.steel, 'line')}Bed outline (steel edging), ±0.5 m</li><li>${sw(TOK.ink, 'line dashed')}Meadow or garden-area boundary</li>${store.scenario === 'working' ? `<li>${sw(TOK.ink, 'box hatch')}Empty bed, open for planting</li>` : ''}</ul><p class="muted small">Bed codes from Oudolf's 2020 bulb plans: A block, B matrix, C grouping.</p>`;
    } else if (gid === 'composition') {
      body = `<ul class="lg-keys"><li>${sw('#B9A8C8', 'box')}Block or group, in species colour</li><li>${sw(TOK.meadow, 'box stipple')}Matrix, the continuous base</li><li>${sw('#9D7FA8', 'ring')}Emergent or individual</li><li>${sw('#8B7A55', 'box dotted')}Bulbs, independent of the perennials</li><li>${sw(TOK.darkVeg, 'ring cross')}Woody plant position</li>${store.scenario === 'working' ? `<li>${sw(TOK.draft, 'box dotted')}Changed in this design</li>` : ''}</ul>
        <h4>In view, by area</h4>${spRows(speciesInView('placements'), 'm2')}<p class="muted small">Species and roles from the legends; positions are schematic.</p>`;
    } else if (gid === 'representation') {
      body = `<ul class="lg-keys"><li>${sw('#B59CBB', 'halo')}Forb: flower core and spread</li><li>${sw('#8E9A6E', 'rays')}Grass or sedge</li><li>${sw('#7A6B57', 'dot small')}Bulb</li><li>${sw(TOK.darkVeg, 'disc')}Designed tree or shrub</li></ul>
        <h4>In view</h4>${spRows(speciesInView('instances'), 'n')}<p class="muted small">One symbol stands for about 2–3 perennials or 8 bulbs.</p>`;
    } else if (gid === 'analysis') {
      body = `<h4>Slope, from the terrain</h4><div class="ramp" style="background:${rampCss(RAMPS.slope)}"></div><div class="ramp-l"><span>0°</span><span>6°</span><span>12°+</span></div>
        <h4>Distance to the nearest path</h4><div class="ramp" style="background:${rampCss(RAMPS.pathdist)}"></div><div class="ramp-l"><span>0</span><span>4 m</span><span>8 m+</span></div>
        <h4>Not available</h4><ul class="lg-keys"><li><span class="na">no data</span>Sun / shade</li><li><span class="na">no data</span>Soil moisture</li><li><span class="na">no data</span>Soil pH</li></ul>
        <p class="muted small">Nothing is drawn for these; queries return them as unknown. Switch between slope and distance in the layer's parts.</p>`;
    }
    return `<h3>${esc(g.name)}</h3>${body}<p class="src small">Sources: ${srcs}</p>`;
  }
  function viewKey() {
    if (st.filter === 'terrain') return groupKey('terrain');
    const near = st.view === 'plan' && plan.view.scale > 6;
    return `<h3>Key</h3>` + (near ? `<h4>Planting in view, by area</h4>${spRows(speciesInView('placements'), 'm2')}` :
      `<ul class="lg-keys"><li>${sw('#B9A8C8', 'box')}A beds, block: blocks and emergents</li><li>${sw(TOK.meadow, 'box stipple')}B beds, matrix: grass base and groups</li><li>${sw('#A7B08F', 'box')}C beds, grouping: groups and individuals</li><li>${sw(TOK.midVeg, 'disc dashed')}Existing tree</li><li>${sw(TOK.path, 'box')}Path</li></ul>`);
  }
  function renderKey() {
    legendEl.hidden = false;
    legendEl.innerHTML = st.solo ? groupKey(st.solo.group) : viewKey();
    legendEl.querySelector('[data-tout]')?.addEventListener('change', (e) => store.setViewState({ terrainOutline: e.target.checked }));
    legendEl.querySelector('[data-a=vex]')?.addEventListener('click', () => { const u = new URL(location.href); if (scene && scene.VEX === 1) u.searchParams.delete('vex'); else u.searchParams.set('vex', '1'); location.href = u.toString(); });
  }
  let kT = 0; const keySoon = () => { clearTimeout(kT); kT = setTimeout(() => { if (st.panel && legendEl.querySelector('.lg-sp, .muted')) renderKey(); }, 200); };
  $('#c2d').addEventListener('wheel', keySoon, { passive: true }); $('#c2d').addEventListener('pointerup', keySoon);

  // ---- exploded: an optional explanation of how the layers stack (3D)
  function setExplode(on) {
    if (!scene) return false;
    if (on && st.solo) exitSolo({ silent: true });
    st.explode = on; if (!on) st.plateFocus = null;
    if (on && st.view === 'plan') st.view = '3d';
    if (scene) scene.setPlateFocus(null);
    applyCanvas();
    return true;
  }
  const plateLabels = $('#platelabels');
  function renderPlateLabels() {
    plateLabels.innerHTML = '';
    if (!st.explode) return;
    for (const g of GROUPS) {
      const d = document.createElement('div'); d.className = 'plabel' + (g.physical ? '' : ' virtual') + (st.plateFocus === g.id ? ' on' : st.plateFocus ? ' dim' : ''); d.dataset.g = g.id; d.setAttribute('role', 'listitem');
      d.innerHTML = `<button class="n" data-a="focus">${esc(g.name)}${g.physical ? '' : ' <span class="k">plan only</span>'}</button>` + (st.plateFocus === g.id || !g.physical ? `<button class="go" data-a="solo">Show alone in plan</button>` : '');
      d.querySelector('[data-a=focus]').onclick = () => (g.physical ? focusPlate(st.plateFocus === g.id ? null : g.id) : openSolo(g.id));
      const s = d.querySelector('[data-a=solo]'); if (s) s.onclick = () => openSolo(g.id);
      d.addEventListener('dblclick', () => openSolo(g.id));
      plateLabels.appendChild(d);
    }
    placePlateLabels();
  }
  function placePlateLabels() {
    if (!scene || !st.explode) return;
    for (const el of plateLabels.children) {
      const [x, y] = scene.plateAnchor(el.dataset.g);
      el.style.transform = `translate(${Math.min(x + 10, scene.w - el.offsetWidth - 12).toFixed(0)}px, ${y.toFixed(0)}px) translate(0, -50%)`;
    }
  }
  function focusPlate(gid) {
    st.plateFocus = gid; if (scene) scene.setPlateFocus(gid && GROUP[gid].physical ? gid : null);
    renderPlateLabels(); syncUrl();
  }
  if (scene) {
    scene.onPlateClick = (g) => focusPlate(g === st.plateFocus ? null : g);
    scene.onPlateOpen = (g) => openSolo(g);
    scene.onPlateHover = (g) => { for (const el of plateLabels.children) el.classList.toggle('hov', el.dataset.g === g); };
  }

  // ================================================================ selection card, hover, coordinates
  let shiftDown = false;
  window.addEventListener('pointerdown', (e) => { shiftDown = e.shiftKey; }, true);
  const bedOfSel = (sel) => { if (!sel) return null; const o = store.getObject(sel.id); if (!o) return null; const id = o.type === 'bed' ? o.id : o.bedId || null; return id && cs.designBeds().some((b) => b.id === id) ? id : null; };
  const showCard = (sel) => { if (st.an.open || (ctx.claimsSelection && ctx.claimsSelection(sel))) { $('#inspector').hidden = true; return; } renderInspector(store, sel, ctx); };
  store.on('selection', (sel) => {
    if (st.an.open && sel) {
      const b = bedOfSel(sel) || (sel.at ? (cs.designBeds().find((q) => store.getBedAt(sel.at[0], sel.at[1])?.id === q.id) || {}).id : null);
      if (b && shiftDown) cond.toggleBed(b); else if (b && !st.an.scope.includes(b)) cond.setScope([b]);
      cond.setPoint(sel.at || null);
    } else if (st.an.open) cond.setPoint(null);
    showCard(sel); emit('selection', sel);
  });
  store.on('model', () => { showCard(store.selection); if (st.an.open) cond.render(); });
  const coords = $('#coords');
  const showXY = (x, y) => { const z = store.sampleElevation(x, y); coords.textContent = `x ${x.toFixed(1)}  y ${y.toFixed(1)}  z ${z == null ? '—' : z.toFixed(2)} m`; };
  plan.onCursor = showXY;
  const tag = $('#hovertag'); let mx = 0, my = 0;
  app.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!tag.hidden) tag.style.transform = `translate(${mx + 14}px, ${my + 16}px)`; });
  store.on('hover', (h) => {
    if (!h) { tag.hidden = true; return; }
    const o = store.getObject(h.id); if (!o) { tag.hidden = true; return; }
    const k = store.kindOf(h.id); let txt;
    if (k === 'instance') { const sp = store.getObject(o.speciesId); txt = `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ' ‘' + esc(sp.cultivar) + '’' : ''}<span class="k">${o.placementId ? 'plant' : 'existing tree'}</span>`; }
    else if (k === 'placement') { const sp = o.speciesIds[0] ? store.getObject(o.speciesIds[0]) : null; txt = `${sp ? `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ' ‘' + esc(sp.cultivar) + '’' : ''}` : 'species not published'}<span class="k">${esc(o.role)}${o.status === 'draft' ? ', changed' : ''}</span>`; }
    else if (o.type === 'bed') txt = `${esc(o.name)}<span class="k">${esc(o.props.styleName)}</span>`;
    else txt = `${esc(o.name || o.id)}<span class="k">${esc(o.type)}</span>`;
    tag.innerHTML = txt; tag.hidden = false; tag.style.transform = `translate(${mx + 14}px, ${my + 16}px)`;
  });
  $('#btnSite').addEventListener('click', () => { const a = $('#about'); if (a.hidden) { renderAbout(store, preset); a.hidden = false; } else a.hidden = true; });

  // ================================================================ keys: Esc steps back one level at a time
  function goBack() {
    if (!$('#draftdlg').hidden) { $('#draftdlg').hidden = true; return true; }
    if (!menu.hidden) { closeMenu(); return true; }
    if (!$('#about').hidden) { $('#about').hidden = true; return true; }
    if (store.selection) { store.select(null); return true; }
    if (st.an.open) { cond.close(); return true; }
    if (st.solo) { exitSolo(); return true; }
    if (st.explode) { if (st.plateFocus) focusPlate(null); else setExplode(false); return true; }
    if (st.panel) { setPanel(false); return true; }
    return false;
  }
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') { goBack(); return; }
    if (!$('#draftdlg').hidden) return;
    if (e.key === 'Enter' && st.explode && st.plateFocus && !(e.target.closest && e.target.closest('button'))) openSolo(st.plateFocus);
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === 'Backspace' || e.key === 'ArrowUp') { if (store.selection) { e.preventDefault(); picker.up(); } }
    else if (e.key === '1' && scene) { if (st.explode) setExplode(false); setObs('3d'); }
    else if (e.key === '2') setObs('plan');
    else if (e.key === '3' && scene) setExplode(true);
    else if ((e.key === 'e' || e.key === 'E') && scene) setExplode(!st.explode);
    else if (e.key === 'l' || e.key === 'L') setPanel(!st.panel);
    else if (!FLOW && (e.key === 'c' || e.key === 'C')) { if (st.an.open) cond.close(); else { const b = bedOfSel(store.selection); if (b) ctx.openConditions([b]); } }
  });

  // ================================================================ URL state
  function syncUrl() {
    if (st._noSync) return;
    const u = new URL(location.href); const q = u.searchParams;
    q.set('view', st.explode ? 'layers' : st.view === '3d' ? 'axo' : 'plan');
    st.design === 'working' ? q.set('design', 'working') : q.delete('design');
    st.filter !== 'all' ? q.set('filter', st.filter) : q.delete('filter');
    st.solo ? q.set('solo', st.solo.group) : q.delete('solo');
    const ov = st.solo ? Object.entries(st.solo.overlays).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${(+v).toFixed(2)}`).join(',') : '';
    ov ? q.set('overlay', ov) : q.delete('overlay');
    st.explode && st.plateFocus ? q.set('layer', st.plateFocus) : q.delete('layer');
    st.panel ? q.set('panel', '1') : q.delete('panel');
    if (st.an && st.an.open) {
      q.set('cond', st.an.scope.length === cs.designBeds().length ? 'all' : st.an.scope.map((b) => b.replace(/^bed\./, '')).join(','));
      st.an.show ? q.set('show', st.an.show === 'zones' ? 'zones' : st.an.field.replace(/^(field|hyp)\./, (m, k) => (k === 'hyp' ? 'hyp.' : ''))) : q.delete('show');
      q.set('rules', st.an.rules.map((r) => `${r.field.replace(/^field\./, '')}:${r.breaks.join('/')}`).join(','));
    } else for (const k of ['cond', 'show', 'rules']) q.delete(k);
    for (const k of ['explode', 'draft', 'then', 'mode']) q.delete(k);
    history.replaceState(null, '', u);
  }

  // a blank working design in which only the given beds are empty (hiding the planting is a separate, view-only switch)
  function startBlank(scope, { confirmReplace = true } = {}) {
    const sc = cs.resolveScope(scope); if (!sc.ok) return sc;
    if (confirmReplace && store.draft && store.draft.ops.length && !confirm(`Replace your working design (${store.draft.ops.length} change${store.draft.ops.length === 1 ? '' : 's'}) with a new one in which ${sc.bedIds.map((b) => b.replace('bed.', '')).join(', ')} ${sc.bedIds.length === 1 ? 'is' : 'are'} empty? The reference is not affected.`)) return { ok: false, error: 'cancelled' };
    const r = doc.start({ from: 'blank', scope: sc.bedIds });
    if (r.ok) setDesign('working', { silent: true });
    if (st.an.open) cond.render();
    return r;
  }
  // entry: the site preset first (axonometric), then the same workspace with its tools
  function enterSite() {
    if (st.entered) return true;
    st.entered = true; app.classList.remove('at-entry'); $('#entry').hidden = true;
    emit('entered', { site: preset.id }); return true;
  }

  // ================================================================ API: same calls in the page (window.GP) and, embedded, over postMessage
  const api = {
    version: store.model.project.version, api: '0.6', component: 'site-setup',
    get model() { return store.model.project; },
    site: () => ({ ...preset }), sites: () => presets.map((p) => ({ ...p })),
    getObject: (id) => store.getObject(id), getBedAt: (x, y) => store.getBedAt(x, y),
    queryObjects: (g, f) => store.queryObjects(g, f), query: (g, f) => store.query(g, f), queryInstances: (g, f) => store.queryInstances(g, f),
    sampleConditions: (x, y) => store.sampleConditions(x, y), getPlantingContext: (id) => store.getPlantingContext(id),
    plantableAt: (x, y) => store.plantableAt(x, y), speciesTally: (f) => store.speciesTally(f), instancesOfPlacement: (id) => store.instancesOfPlacement(id).map((i) => 'pi.' + i),
    // design
    design: () => st.design, setDesign: (d) => setDesign(d === 'working' || d === 'canvas' ? 'working' : 'reference', { silent: true }),
    scenario: () => store.scenario, setScenario: (s) => setDesign(s === 'working' ? 'working' : 'reference', { silent: true }),
    createDraft: (o) => { const r = store.createDraft(o); if (r.ok) setDesign('working', { silent: true }); return r; },
    blankScopePreview: (scope) => store.blankScopePreview(scope), draftInfo: () => store.draftInfo(), draftSummary: () => store.draftSummary(),
    applyPatch: (ops, o) => { const r = store.applyPatch(ops, o); if (r.ok && !r.dryRun && st.design !== 'working') setDesign('working', { silent: true }); return r; },
    resetDraft: () => { const r = store.resetDraft(); if (!store.draft) setDesign('reference', { silent: true }); return r; },
    discardDraft: () => { const r = store.discardDraft(); setDesign('reference', { silent: true }); return r; },
    setEditLock: (id, on) => store.setEditLock(id, on),
    exportModel: (o) => store.exportModel(o), exportDraft: () => store.exportDraft(), importDraft: (o) => { const r = store.importDraft(o); if (r.ok) setDesign('working', { silent: true }); return r; },
    diffDraft: () => store.diffDraft(),
    // view
    viewState: () => ({ view: st.explode ? 'layers' : st.view === '3d' ? 'axo' : 'plan', design: st.design, filter: st.filter, solo: st.solo ? { ...st.solo, overlays: { ...st.solo.overlays } } : null, panel: st.panel, axoHome: scene ? scene.isHome() : null }),
    view: () => (st.explode ? 'layers' : st.view),
    setView: (v) => { if (v === 'layers') return setExplode(true); if (st.explode) setExplode(false); setObs(v); return true; },
    setViewFilter: (f) => setFilter(f), viewFilter: () => st.filter,
    setExploded: (on) => setExplode(!!on), setPanel: (on) => setPanel(!!on), fit,
    solo: (gid, o) => openSolo(gid, o || {}), openLayer: (gid, o) => openSolo(gid, o || {}), closeLayer: () => exitSolo(), exitSolo: () => exitSolo(),
    focusLayer: (gid) => { setExplode(true); focusPlate(gid); return true; }, back: goBack,
    isolation: () => (st.solo ? { group: st.solo.group, overlays: { ...st.solo.overlays } } : null),
    setOverlay: (gid, op) => { if (!st.solo || !GROUP[gid]) return false; st.solo.overlays[gid] = op; plan.setIsolation(st.solo); renderPanel(); syncUrl(); return true; },
    layerGroups: () => GROUPS.map((g) => ({ id: g.id, name: g.name, layers: g.layers.slice(), visible: groupVisible(store, g.id), locked: groupLocked(store, g.id) })),
    layers: () => Object.fromEntries(Object.entries(store.layerState).map(([k, v]) => [k, { ...v }])),
    setLayer: (id, p) => store.setLayer(id, { ...p, external: true }), setLayerGroup: (gid, p) => setGroup(store, gid, { ...p, external: true }),
    select: (id) => store.select(id ? { id } : null), selection: () => store.selection,
    on: (type, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); },
    // compatibility with Phase 01.1 (Reference / Canvas / Terrain were one switch)
    mode: () => (st.filter === 'terrain' ? 'terrain' : st.design === 'working' ? 'canvas' : 'reference'),
    setMode: (m) => (m === 'terrain' ? (setFilter('terrain'), true) : (setFilter('all'), setDesign(m === 'canvas' ? 'working' : 'reference', { silent: true }))),
    // computational space (levels 1–4; never reads the planting design)
    spatialModel: () => cs.levels(), fields: () => cs.fields(), field: (id) => { const f = cs.field(id); return f ? { ...f, sample: undefined } : null; },
    domain: (scope, o) => cs.domain(scope, o), cells: (scope, o) => cs.cells(scope, o), distribution: (scope, o) => cs.distribution(scope, o),
    classify: (scope, spec) => cs.classify(scope, spec), computeZones: (scope, spec) => cs.run(scope, spec), computation: () => cs.current, clearComputation: () => cs.clear(),
    zoneAt: (x, y) => { const z = cs.zoneAt(x, y); if (!z) return null; const { _bb, ...rest } = z; return rest; }, queryZones: (g, o) => cs.queryZones(g, o),
    sampleAt: (x, y, o) => cs.sampleAt(x, y, o), samplePoints: (scope, o) => cs.samplePoints(scope, o),
    registerHypotheticalField: (def) => cs.registerHypotheticalField(def), unregisterField: (id) => cs.unregisterField(id),
    // the Conditions panel (view state)
    openConditions: (scope) => ctx.openConditions(scope || (bedOfSel(store.selection) ? [bedOfSel(store.selection)] : 'bed.B1')), closeConditions: () => cond.close(),
    conditions: () => cond.state(), setConditionScope: (scope) => (st.an.open ? cond.setScope(scope) : ctx.openConditions(scope)),
    showField: (id) => cond.show(id ? 'field' : null, id), showZones: () => cond.show('zones'), hideConditionDisplay: () => cond.show(null),
    setConditionRules: (rules) => cond.setRules(rules), startBlank: (scope) => startBlank(scope, { confirmReplace: false }),
    enter: () => enterSite(), entered: () => st.entered,
    // ---- design (Integrated Design Prototype): mixes, assignments, brushes and AI share these calls
    _designNS: {
      start: (o) => { const r = doc.start(o || {}); if (r.ok) setDesign('working', { silent: true }); return r; },
      active: () => doc.active(), state: () => (doc.state ? JSON.parse(JSON.stringify(doc.state)) : null),
      operations: () => JSON.parse(JSON.stringify(OPS)),
      run: (ops, o) => { const r = dops.run(ops, o); if (r.ok && !r.preview && st.design !== 'working') setDesign('working', { silent: true }); if (r.preview) { const { comp, target, state, ...rest } = r; return { ...rest, plantsByPlacement: target.map((p) => [p.id, p.plants.length]) }; } return r; },
      preview: (ops) => api.design.run(ops, { preview: true }),
      runAsync: (ops) => dops.runAsync(ops),
      undo: () => doc.undo(), redo: () => doc.redo(), canUndo: () => doc.past.length > 0, canRedo: () => doc.future.length > 0,
      feedback: () => { const f = feedback(doc); f.open = f.open.map(({ geometry, ...o }) => o); return f; },
      season: (m) => season(doc, m), compare: (beds) => compareReference(doc, beds || cs.designBeds().filter((b) => 'ABC'.includes(b.props.style)).map((b) => b.id)),
      context: (o) => dops.context(o), assignments: () => (doc.state ? doc.state.assignments.map(({ snapshot, ...a }) => ({ ...a, frozenPlants: snapshot ? snapshot.plants.x.length : null })) : []),
      mixes: () => (doc.state ? JSON.parse(JSON.stringify(doc.state.mixes)) : JSON.parse(JSON.stringify((mixFile && mixFile.mixes) || []))),
      generated: (id) => { const a = doc.state && doc.state.assignments.find((q) => q.id === id); if (!a) return null; const g = doc.generated(a); return { diag: g.diag, plants: g.plants.x.length, region: g.region }; },
      plants: (id) => { const comp = doc.compose(); const c = comp.assignments.find((q) => q.a.id === id); if (!c) return null; const P = c.gen.plants; return c.keep.map((k) => ({ x: P.x[k], y: P.y[k], z: store.sampleElevation(P.x[k], P.y[k]), speciesId: P.sp[k], role: P.role[k], spacingM: P.size[k], bedId: P.bed[k], layer: P.layer[k] })); },
      library: { load: (o) => library.loadKnowledge(o), status: () => library.status, profile: (id) => library.profile(id), policy: () => [...library.policy.accept], setAccept: (l) => library.setAccept(l), revision: () => library.revision },
      _doc: doc, _ops: dops, _lib: library,
    },
    _store: store, _plan: plan, _scene: scene, _ui: st, _cs: cs,
  };
  // GP.design() still answers which design is shown ('reference' | 'working'); its properties are the design calls
  Object.assign(api.design, api._designNS); delete api._designNS;
  window.GP = api;
  ctx.api = api;
  ctx.dui = FLOW ? { refresh() {}, setTool() {}, flow: true } : createDesignUI(ctx);
  Object.assign(ctx, { setObs, fit, setPanel, renderPanel, setExplode, exitSolo, goBack });
  // embedded in a workflow: the parent calls the same API by message; only plain-data methods are exposed
  const BRIDGE = new Set(['site', 'sites', 'getObject', 'getBedAt', 'queryObjects', 'query', 'sampleConditions', 'getPlantingContext', 'plantableAt', 'speciesTally', 'instancesOfPlacement',
    'design', 'setDesign', 'createDraft', 'blankScopePreview', 'draftInfo', 'draftSummary', 'applyPatch', 'resetDraft', 'discardDraft', 'exportDraft', 'importDraft', 'diffDraft',
    'viewState', 'setView', 'setViewFilter', 'setExploded', 'setPanel', 'fit', 'solo', 'exitSolo', 'setOverlay', 'layerGroups', 'setLayerGroup', 'select', 'selection',
    'spatialModel', 'fields', 'field', 'domain', 'cells', 'distribution', 'classify', 'computeZones', 'computation', 'clearComputation', 'zoneAt', 'queryZones', 'sampleAt', 'samplePoints',
    'openConditions', 'closeConditions', 'conditions', 'setConditionScope', 'showField', 'showZones', 'hideConditionDisplay', 'setConditionRules', 'startBlank', 'entered']);
  window.addEventListener('message', (e) => {
    const m = e.data; if (!m || m.gp !== 'call' || e.source !== window.parent || window.parent === window) return;
    let reply;
    try { if (!BRIDGE.has(m.method)) throw new Error('not available: ' + m.method); reply = { gp: 'result', id: m.id, ok: true, value: JSON.parse(JSON.stringify(api[m.method](...(Array.isArray(m.args) ? m.args : [])) ?? null)) }; }
    catch (err) { reply = { gp: 'result', id: m.id, ok: false, error: String(err.message || err) }; }
    e.source.postMessage(reply, e.origin === 'null' ? '*' : e.origin);
  });

  // ================================================================ initial state (URL; Phase 01.1 URLs still work)
  const restored = FLOW ? null : store.restorePersisted(); // the workflow rebuilds the draft from its own project state
  if (!FLOW && store.draft) { const rr = doc.restore(); if (!rr.ok) console.warn('design document not restored', rr); }
  st._noSync = true;
  const pv = params.get('view'); const pm = params.get('mode');
  for (const tok of (params.get('layers') || '').split(',').filter(Boolean)) { const id = tok.replace(/^[+-]/, ''); if (store.layerState[id]) store.setLayer(id, { visible: !tok.startsWith('-'), external: true }); }
  const dq = params.get('draft');
  if (dq === 'blank' || dq === 'copy') store.createDraft({ from: dq === 'blank' ? 'blank' : 'reference', activate: false });
  if (dq === 'demo') demoDraft(store);
  const wantWorking = params.get('design') === 'working' || pm === 'canvas';
  setDesign(wantWorking && store.draft ? 'working' : 'reference', { silent: true });
  if (params.get('then') === 'reference') setDesign('reference', { silent: true });
  setFilter(params.get('filter') || (pm === 'terrain' ? 'terrain' : 'all'));
  setObs(pv === 'plan' || !scene ? 'plan' : '3d');
  if (params.get('panel') === '1' || params.get('lopen') === '1' || params.get('legend') === '1') setPanel(true);
  if ((pv === 'layers' || params.get('explode') === '1') && scene) setExplode(true);
  const solo = params.get('solo') || (pv === 'plan' && params.get('layer'));
  if (solo && GROUP[solo]) { const ov = {}; for (const t of (params.get('overlay') || '').split(',').filter(Boolean)) { const [g, v] = t.split(':'); if (GROUP[g]) ov[g] = Math.max(0.05, Math.min(1, +v || 0.5)); } openSolo(solo, { overlays: ov, fromUrl: true }); }
  else if (st.explode && params.get('layer') && GROUP[params.get('layer')]) focusPlate(params.get('layer'));
  if (params.get('sel')) { const at = (params.get('at') || '').split(',').map(Number); store.select({ id: params.get('sel'), ...(at.length === 2 && at.every(isFinite) ? { at } : {}) }); }
  if (params.get('details') === '1') { st.inspectorOpen = true; renderInspector(store, store.selection, ctx); }
  if (params.get('focus') === '1' && store.selection) {
    if (st.view === 'plan') { plan.focus(store.selection.id); if (params.get('z')) { plan.view.scale *= +params.get('z'); plan.request(); } }
    else if (scene) scene.focus(store.selection.id, +(params.get('z') || 1), true);
  }
  const cq = params.get('cond');
  if (cq) {
    const scope = cq === 'all' ? 'all' : cq.split(',').filter(Boolean).map((b) => (b.startsWith('bed.') ? b : 'bed.' + b));
    const rq = params.get('rules');
    if (rq) { const rules = rq.split(',').filter(Boolean).map((t) => { const [f, v] = t.split(':'); return { field: f.startsWith('hyp.') ? f : 'field.' + f, breaks: (v || '0').split('/').map(Number) }; }).filter((r) => cs.field(r.field)); if (rules.length) st.an.rules = rules; }
    if (ctx.openConditions(scope).ok) {
      if (params.get('zoom') === '1') cond.zoomTo();
      const sq = params.get('show');
      if (sq === 'zones') cond.show('zones'); else if (sq) cond.show('field', sq.startsWith('hyp.') ? sq : 'field.' + sq);
      if (params.get('at')) { const at = params.get('at').split(',').map(Number); if (at.length === 2 && at.every(isFinite)) cond.setPoint(at); }
    }
  }
  if (params.get('about') === '1') $('#btnSite').click();
  // first visit without any state in the URL: the site preset is shown first, then entered
  if (!FLOW && !EMBED && ![...params.keys()].filter((k) => !['kdb', 'knowledge', 'classic'].includes(k)).length) {
    st.entered = false; app.classList.add('at-entry'); // not 'entry': that is the card's own class
    const e = $('#entry'); const beds = cs.designBeds(); const main = beds.filter((b) => 'ABC'.includes(b.props.style)).length;
    e.innerHTML = `<p class="kicker">Site preset</p><h1>${esc(preset.name)}</h1><p class="loc">${esc(preset.location || '')}</p>
      <ul class="facts"><li><b>${main}</b> planting beds${beds.length > main ? `, plus ${beds.length - main} meadow, rain-garden and edge beds` : ''}</li><li><b>1 m</b> terrain grid (USGS 3DEP)</li><li>Reference planting, reconstructed from the designer's plans</li></ul>
      <p class="d-entry-q">Design on this site</p>
      <div class="d-entry-c"><button class="btn primary" id="btnStartBlank" title="The 15 main beds are emptied; terrain, paths, trees and bed outlines stay">Empty beds</button><button class="btn" id="btnStartRef" title="Start from the reconstructed planting and paint over it">From the reference</button></div>
      <button class="lnk" id="btnEnter">Open site</button>`;
    e.hidden = false; $('#btnEnter').onclick = enterSite; $('#btnStartBlank').focus();
    const startFrom = (from) => { enterSite(); const r = doc.start({ from }); if (r.ok) { setDesign('working', { silent: true }); setObs('plan'); fit(); ctx.dui.setTool('fill'); } };
    $('#btnStartBlank').onclick = () => startFrom('blank'); $('#btnStartRef').onclick = () => startFrom('reference');
  }
  if (params.get('newdesign') === '1') openDraftDialog();
  if (params.get('demo') === '1') {
    doc.start({ from: 'blank' });
    dops.run([{ op: 'fill', beds: ['bed.B1', 'bed.B2', 'bed.B3N', 'bed.B3S', 'bed.B4', 'bed.B5'], mix: 'mix.dropseed-matrix' }, { op: 'fill', beds: ['bed.A1', 'bed.A2', 'bed.A3N', 'bed.A3S', 'bed.A4', 'bed.C1', 'bed.C2', 'bed.C3', 'bed.C4'], mix: 'mix.block-colour' },
      { op: 'line', coordinates: [[-48, 6], [-42, 8.5], [-36, 9.5], [-30, 9], [-24, 10.5], [-18, 12], [-12, 12.5], [-6, 13]], widthM: 3, mode: 'drifts', mix: 'mix.organic-groups' }, { op: 'fill', beds: ['bed.TE'], mix: 'mix.under-trees' }], { label: 'demo design' });
    setDesign('working', { silent: true }); if (pv !== 'axo' && pv !== '3d') setObs('plan'); fit();
  }
  st._noSync = false; syncUrl();
  renderDesign(); renderStatus();
  if (restored && st.design === 'reference') $('#btnWorking').title = 'Your working design from last time is kept. Open it.';
  if (FLOW) { const { startFlow } = await import('./flow/shell.js'); await startFlow(ctx); }
  $('#loading').classList.add('done');
  document.documentElement.dataset.ready = '1';
  emit('ready', { site: preset.id, api: api.api });
  if (params.get('knowledge') !== '0') library.loadKnowledge({ db: params.get('kdb') || undefined }).then((r) => {
    document.documentElement.dataset.knowledge = r.ok ? 'loaded' : 'unavailable';
    if (!r.ok) { const k = document.querySelector('#designMenu [data-a=knowledge]'); if (k) k.hidden = true; } // a checkout without the knowledge module
    if (r.ok && doc.active()) doc.commit(doc.clone(), { label: 'plant knowledge loaded', history: false });
    emit('knowledge', r);
  });
}

// a reproducible demo change for screenshots (?draft=demo): one real B1 group replaced in a copy of the reference
function demoDraft(store) {
  store.createDraft({ from: 'reference', activate: false });
  const g = (store.baseline.placements.filter((p) => p.bedId === 'bed.B1' && p.role === 'group' && p.speciesIds.length === 1).sort((a, b) => b.areaM2 - a.areaM2))[0];
  if (g) { const r = store.applyPatch([{ op: 'replaceSpecies', target: g.id, speciesIds: ['sp.achillea-moonshine'] }]); if (!r.ok) console.warn('demo draft refused', r.errors); }
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading'); l.innerHTML = `<span>The site could not be loaded: ${esc(e.message)}. Check the connection and reload.</span>`;
});
