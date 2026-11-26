import { ModelStore, centroidOf } from './model.js';
import { Picker } from './picker.js';
import { Plan2D } from './plan2d.js';
import { TOK, speciesPlanColor, speciesFlower, STATUS_LABEL, RAMPS } from './style.js';
import { GROUPS, GROUP, LAYER_NAME, groupVisible, groupLocked, setGroup } from './layers.js';
import { getRaster } from './paint.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
const DEV = params.get('dev') === '1';

async function main() {
  const store = await ModelStore.load('data/detroit/');
  const picker = new Picker(store);
  const app = $('#app');
  const plan = new Plan2D($('#c2d'), store, picker);
  let scene = null;
  try {
    const { Scene3D } = await import('./scene3d.js');
    scene = new Scene3D($('#c3d'), store, picker, { labelRoot: $('#labels3d'), preserve: params.has('shot'), quality: params.get('q') || 'high', vex: params.get('vex') === '1' ? 1 : 1.6 });
  } catch (err) { console.error('3D unavailable', err); }

  // ================================================================ state
  // view  = how you look (World 3D / Plan / Layers overview)
  // mode  = which design state you look at (Reference / Canvas / Terrain)
  // iso   = isolated plan of one layer group (+ overlays); plateFocus = focused group in the Layers overview
  const st = { view: 'plan', mode: 'reference', iso: null, plateFocus: null, layersSnapshot: null, legendOpen: false };
  const ctx = { store, plan, scene, picker, st };

  // ---------------------------------------------------------------- views
  function setView(v, { keepIso = false } = {}) {
    if (v !== 'plan' && v !== '3d' && v !== 'layers') v = 'plan';
    if ((v === '3d' || v === 'layers') && !scene) v = 'plan';
    if (!keepIso && st.iso) exitIso(false);
    st.view = v; app.dataset.view = v;
    document.querySelectorAll('.views button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
    plan.setActive(v === 'plan');
    if (scene) { scene.setActive(v !== 'plan'); if (v !== 'plan') scene.setLayersView(v === 'layers'); } // in Plan the 3D view keeps its pose for the way back
    if (v === 'plan' && !plan._fitted) { plan.fit(); plan._fitted = true; }
    if (v !== 'layers') { st.plateFocus = null; $('#platecard').hidden = true; }
    else renderPlateLabels();
    updateCrumbs(); renderLegend(); syncUrl();
  }
  document.querySelectorAll('.views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
  $('#btnFit').addEventListener('click', () => fit());
  const fit = () => { if (st.view === 'plan') plan.fit(); else scene.home(); };
  window.addEventListener('resize', () => { plan.resize(); if (scene) scene.resize(); if (st.view === 'plan') plan.request(); });

  // ---------------------------------------------------------------- modes (design states)
  function setMode(m, { silent = false } = {}) {
    if (m === 'canvas' && !store.draft) { if (!silent) openDraftDialog(); return false; }
    st.mode = m; app.dataset.mode = m;
    document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.m === m)));
    if (m === 'reference') { if (store.scenario !== 'reference') store.setScenario('reference'); }
    if (m === 'canvas') { if (store.scenario !== 'working') store.setScenario('working'); }
    store.setViewState({ mode: m, hidePlanting: m === 'reference' ? store.view.hidePlanting : false });
    renderStatus(); renderLegend(); syncUrl();
    return true;
  }
  document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));

  // ---------------------------------------------------------------- status line (state is always named, never colour only)
  function renderStatus() {
    const n = $('#note'); const d = store.draftInfo();
    if (st.mode === 'terrain') {
      n.innerHTML = `<b>Terrain</b> · USGS 3DEP 1 m<span class="long"> · contours every 0.25 m are interpolated, not a finer survey</span> · 3D relief ×${scene ? scene.VEX : 1.6} <button class="lnk" data-a="vex">${scene && scene.VEX === 1 ? 'Show ×1.6' : 'True scale'}</button>`;
    } else if (st.mode === 'canvas' && d) {
      n.innerHTML = `<b>Canvas</b> · working design (${d.from === 'blank' ? 'blank planting' : 'copy of reference'}) · ${d.changes} change${d.changes === 1 ? '' : 's'} · ${d.saved ? 'kept in this browser' : 'not saved'} <button class="lnk" data-a="reset">Reset</button><button class="lnk" data-a="export">Export</button><button class="lnk" data-a="new">New…</button>`;
    } else {
      n.innerHTML = `<b>Reference</b> · Schematic reconstruction · not a survey<span class="long"> · bed outlines as built (OSM), planting inside beds generated from Oudolf's legends</span> <button class="lnk" data-a="hide" aria-pressed="${store.view.hidePlanting}">${store.view.hidePlanting ? 'Show planting' : 'Hide planting'}</button>`;
    }
    n.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => statusAction(b.dataset.a)));
  }
  function statusAction(a) {
    if (a === 'hide') { store.setViewState({ hidePlanting: !store.view.hidePlanting }); renderStatus(); }
    else if (a === 'reset') { if (confirm('Reset the working design to where it started? Your changes in this draft are removed; the reference is not affected.')) { store.resetDraft(); setMode('canvas'); } }
    else if (a === 'export') exportDraft();
    else if (a === 'new') openDraftDialog();
    else if (a === 'vex') { const u = new URL(location.href); if (scene && scene.VEX === 1) u.searchParams.delete('vex'); else u.searchParams.set('vex', '1'); location.href = u.toString(); }
  }
  function exportDraft() {
    const data = store.exportDraft(); if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'working-design.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  store.on('model', () => { renderStatus(); renderLegend(); if (st.view === 'layers') renderPlateCard(); });
  store.on('draft', () => renderStatus());

  // ---------------------------------------------------------------- draft dialog: preview the scope BEFORE anything is cleared
  function openDraftDialog() {
    const dlg = $('#draftdlg'); const P = store.caseCfg.planting || {};
    const def = store.defaultBlankScope(); const opt = P.blankOptional || {};
    const dirty = store.draft && store.draft.ops.length;
    const render = () => {
      const scope = [...def, ...[...dlg.querySelectorAll('input[data-u]:checked')].map((i) => i.dataset.u)];
      const pv = store.blankScopePreview(scope);
      dlg.querySelector('.pv').innerHTML = `Clears <b>${pv.clears.placements.toLocaleString()}</b> placements and <b>${pv.clears.instances.toLocaleString()}</b> plant proxies in <b>${scope.length}</b> planting units. Keeps terrain, paths, walls, bed outlines and codes, existing trees, lawn${pv.keeps.otherUnits.length ? ` and ${pv.keeps.otherUnits.length} other units` : ''}. The reference is never changed.`;
      return scope;
    };
    dlg.innerHTML = `<div class="dlg-in"><h3 id="dlgTitle">Start a planting design</h3>
      <p class="sub">A working design shares the site with the reference. Choose where it starts.</p>
      <label class="opt"><input type="radio" name="from" value="blank" checked> <span><b>Blank planting canvas</b><br><span class="muted">Empty A, B and C beds (15). The bed framework stays as a constraint.</span></span></label>
      <div class="extra">${Object.entries(opt).map(([u, n]) => `<label><input type="checkbox" data-u="${esc(u)}"> also clear ${esc(n)}</label>`).join('')}</div>
      <div class="pv"></div>
      <label class="opt"><input type="radio" name="from" value="reference"> <span><b>Copy of the reference</b><br><span class="muted">Start from the schematic reconstruction and change it.</span></span></label>
      ${dirty ? `<p class="warn">The current working design has ${store.draft.ops.length} change(s). Starting a new one replaces it. <button class="lnk" data-a="exp">Export it first</button></p>` : ''}
      <div class="row"><button class="btn" data-a="cancel">Cancel</button><button class="btn primary" data-a="go">Start design</button></div></div>`;
    dlg.hidden = false; render();
    dlg.querySelectorAll('input[data-u]').forEach((i) => i.addEventListener('change', render));
    dlg.querySelectorAll('input[name=from]').forEach((i) => i.addEventListener('change', () => dlg.querySelector('.extra').classList.toggle('off', i.value === 'reference' && i.checked)));
    const exp = dlg.querySelector('[data-a=exp]'); if (exp) exp.onclick = exportDraft;
    dlg.querySelector('[data-a=cancel]').onclick = () => { dlg.hidden = true; };
    dlg.querySelector('[data-a=go]').onclick = () => {
      const from = dlg.querySelector('input[name=from]:checked').value;
      const r = store.createDraft({ from, scope: from === 'blank' ? render() : undefined });
      dlg.hidden = true; if (r.ok) setMode('canvas'); else alert(r.error);
    };
    dlg.querySelector('[data-a=go]').focus();
  }

  // ---------------------------------------------------------------- layers overview (plates) + isolated plan
  const plateLabels = $('#platelabels');
  function renderPlateLabels() {
    plateLabels.innerHTML = '';
    for (const g of GROUPS) {
      const b = document.createElement('button'); b.className = 'plabel' + (g.physical ? '' : ' virtual'); b.dataset.g = g.id; b.setAttribute('role', 'listitem');
      b.innerHTML = `<span class="n">${esc(g.name)}</span>${g.physical ? '' : '<span class="k">plan only</span>'}`;
      b.addEventListener('click', () => focusPlate(st.plateFocus === g.id ? null : g.id));
      b.addEventListener('dblclick', () => openIso(g.id));
      b.addEventListener('mouseenter', () => b.classList.add('hov')); b.addEventListener('mouseleave', () => b.classList.remove('hov'));
      plateLabels.appendChild(b);
    }
    placePlateLabels();
  }
  function placePlateLabels() {
    if (!scene || st.view !== 'layers') return;
    for (const el of plateLabels.children) {
      const [x, y] = scene.plateAnchor(el.dataset.g);
      el.style.transform = `translate(${Math.min(x + 10, scene.w - el.offsetWidth - 12).toFixed(0)}px, ${y.toFixed(0)}px) translate(0, -50%)`;
      el.classList.toggle('on', st.plateFocus === el.dataset.g); el.classList.toggle('dim', !!st.plateFocus && st.plateFocus !== el.dataset.g);
    }
  }
  if (scene) {
    scene.onLabels = placePlateLabels;
    scene.onPlateClick = (g) => focusPlate(g === st.plateFocus ? st.plateFocus : g);
    scene.onPlateOpen = (g) => openIso(g);
    scene.onPlateHover = (g) => { for (const el of plateLabels.children) el.classList.toggle('hov', el.dataset.g === g); };
  }
  function focusPlate(gid) {
    st.plateFocus = gid; if (scene) scene.setPlateFocus(gid && GROUP[gid].physical ? gid : null);
    placePlateLabels(); renderPlateCard(); updateCrumbs(); syncUrl();
  }
  function groupStats(gid) {
    const s = store; const L = new Set(GROUP[gid].layers); let objects = 0, placements = 0, plants = 0;
    for (const o of s.model.objects) if (L.has(s.layerOf(o))) objects++;
    if (gid === 'composition') placements = s.model.placements.length;
    if (gid === 'representation' || gid === 'siteveg') for (let i = 0; i < s.inst.n; i++) if (s.inst.alive[i] && L.has(s.instanceLayer(i))) plants++;
    return { objects, placements, plants };
  }
  function renderPlateCard() {
    const card = $('#platecard'); const gid = st.plateFocus;
    if (st.view !== 'layers' || !gid) { card.hidden = true; return; }
    const g = GROUP[gid]; const n = groupStats(gid);
    const unavailable = g.layers.filter((l) => store.layers.get(l)?.status === 'unavailable');
    const facts = [n.objects ? `${n.objects} objects` : '', n.placements ? `${n.placements.toLocaleString()} placements` : '', n.plants ? `${n.plants.toLocaleString()} plant proxies` : ''].filter(Boolean).join(' · ');
    card.innerHTML = `<div class="pc-k">Layer group · ${store.scenario === 'working' ? 'working design' : 'reference'}</div><h3>${esc(g.name)}</h3>
      <p>${esc(g.blurb)}</p>${facts ? `<p class="muted">${facts}</p>` : ''}${unavailable.length ? `<p class="muted">No data: ${unavailable.map((l) => esc(LAYER_NAME[l])).join(', ')}</p>` : ''}
      <div class="row"><button class="btn primary" data-a="open">Open in Plan <span class="kbd">↵</span></button><button class="btn" data-a="clear">All layers</button></div>`;
    card.hidden = false;
    card.querySelector('[data-a=open]').onclick = () => openIso(gid);
    card.querySelector('[data-a=clear]').onclick = () => focusPlate(null);
  }
  function openIso(gid, { overlays = {}, fromUrl = false } = {}) {
    if (!st.layersSnapshot) st.layersSnapshot = JSON.parse(JSON.stringify(store.layerState));
    if (!st.iso) st.isoFrom = fromUrl ? (st.isoFrom || 'layers') : st.view; // switching layer inside the isolated plan keeps where Back returns to
    st.iso = { group: gid, overlays: { ...overlays } };
    if (gid === 'analysis') { // one derived raster at a time: slope by default
      if (!store.layerState['analysis.pathdist'].visible || store.layerState['analysis.slope'].visible) { store.setLayer('analysis.slope', { visible: true }); store.setLayer('analysis.pathdist', { visible: false }); }
      store.setLayer('analysis', { visible: true });
    } else if (!groupVisible(store, gid)) setGroup(store, gid, { visible: true });
    plan.setIsolation(st.iso);
    store.select(null);
    setView('plan', { keepIso: true });
    st.legendOpen = true; renderLegend(); updateCrumbs(); syncUrl();
    if (!plan._isoFitted) { plan.fit(); plan._isoFitted = true; }
  }
  function exitIso(goBack = true) {
    if (!st.iso) return;
    const from = st.isoFrom || 'layers';
    st.iso = null; plan.setIsolation(null);
    if (st.layersSnapshot) { for (const [k, v] of Object.entries(st.layersSnapshot)) Object.assign(store.layerState[k], v); st.layersSnapshot = null; store.emit('layers', { external: true }); }
    if (goBack) setView(from === 'plan' ? 'plan' : from === '3d' ? '3d' : 'layers');
    st.legendOpen = false; renderLegend(); updateCrumbs(); syncUrl();
    if (goBack && from === 'layers' && st.plateFocus) focusPlate(st.plateFocus);
  }
  function updateCrumbs() {
    const c = $('#crumbs');
    const parts = [];
    if (st.iso) parts.push(['garden', 'Garden'], ['layers', 'Layers'], [null, GROUP[st.iso.group].name]);
    else if (st.view === 'layers') parts.push(['garden', 'Garden'], [null, st.plateFocus ? `Layers · ${GROUP[st.plateFocus].name}` : 'Layers']);
    if (!parts.length) { c.hidden = true; c.innerHTML = ''; return; }
    c.hidden = false;
    c.innerHTML = `<button class="back" data-a="back" title="Back (Esc)" aria-label="Back"><svg viewBox="0 0 16 16" width="13" height="13"><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>Back</button>` +
      parts.map(([k, t], i) => (k ? `<button class="crumb" data-a="${k}">${esc(t)}</button>` : `<span class="crumb cur" aria-current="page">${esc(t)}</span>`) + (i < parts.length - 1 ? '<span class="sep">/</span>' : '')).join('') +
      (st.iso ? `<button class="crumb fitb" data-a="fit">Fit</button>` : '');
    c.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'back') goBack();
      else if (a === 'garden') { exitIso(false); setView(scene ? '3d' : 'plan'); }
      else if (a === 'layers') { if (st.iso) exitIso(true); else focusPlate(null); if (st.view !== 'layers') setView('layers'); }
      else if (a === 'fit') plan.fit();
    });
  }
  function goBack() {
    if (st.iso) { exitIso(true); return; }
    if (st.view === 'layers') { if (st.plateFocus) focusPlate(null); else setView('3d'); }
  }

  // ---------------------------------------------------------------- legend (depends on layer group, zoom, view, mode)
  const legendEl = $('#legend');
  function renderLegend() {
    const show = st.legendOpen || st.iso || st.mode === 'terrain';
    if (!show || st.view === 'layers') { legendEl.hidden = true; return; }
    const gid = st.iso ? st.iso.group : st.mode === 'terrain' ? 'terrain' : null;
    const wasHidden = legendEl.hidden; legendEl.hidden = false;
    if (wasHidden && window.innerWidth < 760) legendEl.classList.add('min'); // phones: the model first, legend on demand
    legendEl.innerHTML = gid ? groupLegend(gid) : worldLegend();
    wireLegend();
  }
  const sw = (c, cls = '') => `<span class="sw ${cls}" style="--c:${c}"></span>`;
  const rampCss = (stops) => `linear-gradient(90deg, ${stops.join(',')})`;
  function speciesInView(kind) {
    const vb = plan.viewBox(); const tally = new Map(); const s = store;
    if (kind === 'instances') {
      for (let i = 0; i < s.inst.n; i++) { if (!s.inst.alive[i] || s.inst.pl[i] < 0) continue; const x = s.inst.x[i], y = s.inst.y[i]; if (x < vb[0] || x > vb[2] || y < vb[1] || y > vb[3]) continue; const id = s.speciesByIndex[s.inst.sp[i]].id; tally.set(id, (tally.get(id) || 0) + 1); }
    } else {
      for (const p of s.model.placements) { if ((p.role || '').startsWith('bulb') || p.role === 'matrix' || p.role === 'meadow') continue; const b = s.placementBox(p); if (b[2] < vb[0] || b[0] > vb[2] || b[3] < vb[1] || b[1] > vb[3]) continue; for (const id of p.speciesIds) tally.set(id, (tally.get(id) || 0) + (p.areaM2 || 0.3)); }
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([id, n]) => ({ sp: s.getObject(id), n }));
  }
  function spRows(list, unit) { return list.length ? `<ul class="lg-sp">${list.map(({ sp, n }) => `<li>${sw(speciesPlanColor(sp), 'dot')}<span><i>${esc(sp.scientificName)}</i>${sp.cultivar ? ` ‘${esc(sp.cultivar)}’` : ''}</span><span class="num">${unit === 'm2' ? n.toFixed(0) + ' m²' : n}</span></li>`).join('')}</ul>` : '<p class="muted">No planting in view.</p>'; }
  function sublayerRows(gid) {
    return `<ul class="lg-sub">${GROUP[gid].layers.filter((l) => store.layers.has(l)).map((l) => {
      const L = store.layers.get(l); const na = L.status === 'unavailable'; const on = store.layerState[l].visible;
      return `<li>${na ? '<span class="na">no data</span>' : `<button class="eye ${on ? '' : 'off'}" data-l="${l}" aria-pressed="${on}" aria-label="Show ${esc(LAYER_NAME[l])}">${on ? '●' : '○'}</button>`}<span class="${na ? 'muted' : ''}">${esc(LAYER_NAME[l] || L.name)}</span></li>`;
    }).join('')}</ul>`;
  }
  function overlayRows(gid) {
    return `<div class="lg-ov"><div class="lg-h">Reference overlays</div>${GROUPS.filter((g) => g.id !== gid).map((g) => {
      const op = st.iso && st.iso.overlays[g.id] || 0;
      return `<label class="ovr"><input type="checkbox" data-ov="${g.id}" ${op > 0 ? 'checked' : ''}><span>${esc(g.short)}</span><input type="range" min="10" max="100" step="5" value="${Math.round((op || 0.5) * 100)}" data-op="${g.id}" aria-label="${esc(g.short)} overlay opacity" ${op > 0 ? '' : 'disabled'}></label>`;
    }).join('')}<p class="muted small">Overlays are for reference only: they are not selectable and do not change locks.</p></div>`;
  }
  function groupLegend(gid) {
    const g = GROUP[gid]; let body = '';
    const srcs = g.sources.map((id) => store.getObject(id)).filter(Boolean).map((s) => esc(s.title.split(' (')[0])).join(' · ');
    if (gid === 'terrain') {
      const R = getRaster(store, 'elevation');
      body = `<div class="ramp" style="background:${rampCss(RAMPS.elevation)}"></div><div class="ramp-l"><span>${R.lo.toFixed(1)}</span><span>m NAVD88</span><span>${R.hi.toFixed(1)}</span></div>
        <ul class="lg-keys"><li>${sw('#6E5F43', 'line')}Contour 1 m (major)</li><li>${sw('#6E5F43', 'line thin')}0.25 m, interpolated from the 1 m grid</li><li>${sw(TOK.inkDeep, 'line dashdot')}Garden boundary</li>${st.mode === 'terrain' ? `<li><input type="checkbox" data-tout ${store.view.terrainOutline !== false ? 'checked' : ''} aria-label="Show bed outlines"><span>Bed outlines (reference, for orientation)</span></li>` : ''}</ul>
        <p class="muted small">Resolution 1 m; vertical accuracy ~0.1 m. Relief ${store.terrain.meta.zMin.toFixed(2)}–${store.terrain.meta.zMax.toFixed(2)} m over the whole extent. Hillshade relief ×3 for legibility only.</p>`;
    } else if (gid === 'infrastructure') {
      body = `<ul class="lg-keys"><li>${sw(TOK.path, 'box')}Gravel path / sidewalk</li><li>${sw(TOK.lawnDeep, 'box dashed')}Grass walk</li><li>${sw(TOK.stone, 'line thick')}Limestone wall</li><li>${sw(TOK.stone, 'box')}Carillon, memorial</li><li>${sw(TOK.building, 'box hatch')}Building (context)</li><li>${sw(TOK.water, 'box')}Water</li><li>${sw(TOK.context, 'box')}Road, parking</li></ul>`;
    } else if (gid === 'siteveg') {
      const n = groupStats('siteveg').plants;
      body = `<ul class="lg-keys"><li>${sw(TOK.midVeg, 'disc dashed')}Existing tree crown (${n}), digitised from NAIP; species and height unknown</li><li>${sw(TOK.lawn, 'box')}Mown lawn</li></ul><p class="muted small">Kept by default in every design; this is an assumption, not proof that a tree is protected.</p>`;
    } else if (gid === 'framework') {
      const by = { A: 0, B: 0, C: 0 }; store.beds.forEach((b) => { if (by[b.props.style] != null) by[b.props.style]++; });
      body = `<ul class="lg-keys"><li>${sw(TOK.steel, 'line')}Steel edging = bed outline (OSM, ±0.5 m)</li><li>${sw(TOK.ink, 'line dashed')}Meadow / district boundary</li>${store.scenario === 'working' ? `<li>${sw(TOK.ink, 'box hatch')}Open bed in this working design</li>` : ''}</ul>
        <p class="muted small">Codes from Oudolf's 2020 bulb plans: ${by.A} A (block), ${by.B} B (matrix), ${by.C} C (grouping) beds; A3 and B3 are split north/south.</p>`;
    } else if (gid === 'composition') {
      body = `<ul class="lg-keys"><li>${sw('#B9A8C8', 'box')}Block / group (species colour)</li><li>${sw(TOK.meadow, 'box stipple')}Matrix (continuous base)</li><li>${sw('#9D7FA8', 'ring')}Emergent / individual</li><li>${sw('#8B7A55', 'box dotted')}Bulb drift, independent of the perennials</li><li>${sw(TOK.darkVeg, 'ring cross')}Woody plant position</li>${store.scenario === 'working' ? `<li>${sw(TOK.draft, 'box dotted')}Draft placement</li>` : ''}</ul>
        <div class="lg-h">Species in view (by area)</div>${spRows(speciesInView('placements'), 'm2')}<p class="muted small">Species and roles: Oudolf legends 2019/2020. Patch shapes and positions are schematic.</p>`;
    } else if (gid === 'representation') {
      body = `<ul class="lg-keys"><li>${sw('#B59CBB', 'halo')}Forb: core + translucent spread</li><li>${sw('#8E9A6E', 'rays')}Grass / sedge</li><li>${sw('#7A6B57', 'dot small')}Bulb</li><li>${sw(TOK.darkVeg, 'disc')}Designed tree / shrub</li></ul>
        <div class="lg-h">Proxies in view</div>${spRows(speciesInView('instances'), 'n')}<p class="muted small">Proxies, not plants: ≈0.42 per perennial, 0.12 per bulb, 1 per woody plant.</p>`;
    } else if (gid === 'analysis') {
      body = `<div class="lg-h">Slope (3DEP, ±1 m)</div><div class="ramp" style="background:${rampCss(RAMPS.slope)}"></div><div class="ramp-l"><span>0°</span><span>6°</span><span>≥12°</span></div>
        <div class="lg-h">Distance to path (OSM)</div><div class="ramp" style="background:${rampCss(RAMPS.pathdist)}"></div><div class="ramp-l"><span>0</span><span>4 m</span><span>≥8 m</span></div>
        <p class="muted small">Sun / shade, soil moisture and pH: no data. Nothing is drawn for them, and queries return null + unknown.</p>`;
    }
    return `<div class="lg-head"><div><div class="lg-k">Layer</div><div class="lg-t">${esc(g.name)}</div></div><button class="ins-x" data-a="close" aria-label="Close legend">×</button></div>${body}${st.iso ? sublayerRows(gid) + overlayRows(gid) : ''}<p class="src small">Sources: ${srcs}</p>`;
  }
  function worldLegend() {
    const sc = plan.view.scale;
    const near = st.view === 'plan' && sc > 6;
    return `<div class="lg-head"><div><div class="lg-k">Legend · ${st.mode === 'canvas' ? 'working design' : 'reference'}</div><div class="lg-t">${near ? 'Planting in view' : 'Garden'}</div></div><button class="ins-x" data-a="close" aria-label="Close legend">×</button></div>` +
      (near ? spRows(speciesInView('placements'), 'm2') : `<ul class="lg-keys"><li>${sw('#B9A8C8', 'box')}A · Block: blocks + emergents</li><li>${sw(TOK.meadow, 'box stipple')}B · Matrix: Sporobolus base + groups</li><li>${sw('#A7B08F', 'box')}C · Grouping: groups + individuals</li><li>${sw(TOK.midVeg, 'disc dashed')}Existing tree</li><li>${sw(TOK.path, 'box')}Path</li></ul>`) +
      '<p class="muted small">Schematic reconstruction · not a survey.</p>';
  }
  function wireLegend() {
    legendEl.querySelector('[data-a=close]')?.addEventListener('click', () => { if (st.iso || st.mode === 'terrain') { legendEl.classList.toggle('min'); return; } st.legendOpen = false; renderLegend(); });
    legendEl.querySelector('.lg-head')?.addEventListener('click', (e) => { if (legendEl.classList.contains('min') && !e.target.closest('button')) legendEl.classList.remove('min'); });
    legendEl.querySelector('[data-tout]')?.addEventListener('change', (e) => { store.setViewState({ terrainOutline: e.target.checked }); });
    legendEl.querySelectorAll('.eye').forEach((b) => b.addEventListener('click', () => {
      const l = b.dataset.l; const on = !store.layerState[l].visible;
      const other = { 'analysis.slope': 'analysis.pathdist', 'analysis.pathdist': 'analysis.slope' }[l]; // analysis rasters are exclusive
      if (on && other) store.setLayer(other, { visible: false });
      store.setLayer(l, { visible: on, external: true }); renderLegend();
    }));
    legendEl.querySelectorAll('input[data-ov]').forEach((i) => i.addEventListener('change', () => { const g = i.dataset.ov; const r = legendEl.querySelector(`input[data-op="${g}"]`); st.iso.overlays[g] = i.checked ? r.value / 100 : 0; r.disabled = !i.checked; plan.setIsolation(st.iso); syncUrl(); }));
    legendEl.querySelectorAll('input[data-op]').forEach((r) => r.addEventListener('input', () => { st.iso.overlays[r.dataset.op] = r.value / 100; plan.request(); syncUrl(); }));
  }
  let lgT = 0; const legendSoon = () => { clearTimeout(lgT); lgT = setTimeout(() => { if (!legendEl.hidden && legendEl.querySelector('.lg-sp')) renderLegend(); }, 180); };
  $('#c2d').addEventListener('wheel', legendSoon, { passive: true }); $('#c2d').addEventListener('pointerup', legendSoon);

  // ---------------------------------------------------------------- coordinates + hover tag
  const coords = $('#coords');
  const showXY = (x, y) => { const z = store.sampleElevation(x, y); coords.textContent = `x ${x.toFixed(2)}  y ${y.toFixed(2)}  z ${z == null ? '—' : z.toFixed(2)} m`; };
  plan.onCursor = showXY; if (scene) scene.onCursor = showXY;
  const tag = $('#hovertag'); let mx = 0, my = 0;
  app.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (!tag.hidden) tag.style.transform = `translate(${mx + 14}px, ${my + 16}px)`; });
  store.on('hover', (h) => {
    if (!h) { tag.hidden = true; return; }
    const o = store.getObject(h.id); if (!o) { tag.hidden = true; return; }
    const k = store.kindOf(h.id); let txt;
    if (k === 'instance') { const sp = store.getObject(o.speciesId); txt = `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ' ‘' + esc(sp.cultivar) + '’' : ''}<span class="k">${o.placementId ? 'plant proxy' : 'existing tree'}</span>`; }
    else if (k === 'placement') { const sp = o.speciesIds[0] ? store.getObject(o.speciesIds[0]) : null; txt = `${sp ? `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ' ‘' + esc(sp.cultivar) + '’' : ''}` : 'species not published'}<span class="k">${esc(o.role)}${o.status === 'draft' ? ' · draft' : ''}</span>`; }
    else if (o.type === 'bed') txt = `${esc(o.name)}<span class="k">${esc(o.props.styleName)}</span>`;
    else txt = `${esc(o.name || o.id)}<span class="k">${esc(o.type)}</span>`;
    tag.innerHTML = txt; tag.hidden = false; tag.style.transform = `translate(${mx + 14}px, ${my + 16}px)`;
  });

  // ---------------------------------------------------------------- layer index
  buildLayerTree(store, { openIso: (g) => { if (st.view === 'layers' || st.iso) openIso(g); else openIso(g); } });
  $('#ltoggle').addEventListener('click', () => { const L = $('#layers'); L.classList.toggle('collapsed'); $('#ltoggle').setAttribute('aria-expanded', String(!L.classList.contains('collapsed'))); try { localStorage.setItem('gp.layersOpen', L.classList.contains('collapsed') ? '0' : '1'); } catch {} });
  let lopen = false; try { lopen = localStorage.getItem('gp.layersOpen') === '1'; } catch {}
  if (lopen && window.innerWidth >= 760) { $('#layers').classList.remove('collapsed'); $('#ltoggle').setAttribute('aria-expanded', 'true'); }

  // ---------------------------------------------------------------- inspector
  store.on('selection', (sel) => renderInspector(store, sel, ctx));
  store.on('model', () => renderInspector(store, store.selection, ctx));
  $('#btnAbout').addEventListener('click', () => { const a = $('#about'); if (a.hidden) { renderAbout(store); a.hidden = false; $('#inspector').hidden = true; } else a.hidden = true; });

  // ---------------------------------------------------------------- keys
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (!$('#draftdlg').hidden) { if (e.key === 'Escape') $('#draftdlg').hidden = true; return; }
    if (e.key === 'Escape') {
      if (!$('#about').hidden) { $('#about').hidden = true; return; }
      if (store.selection) { store.select(null); return; }
      goBack();
    } else if (e.key === 'Enter' && st.view === 'layers' && st.plateFocus && !(e.target.closest && e.target.closest('button'))) { openIso(st.plateFocus); }
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === 'Backspace' || e.key === 'ArrowUp') { if (store.selection) { e.preventDefault(); picker.up(); } }
    else if (e.key === '1' && scene) setView('3d'); else if (e.key === '2') setView('plan'); else if (e.key === '3' && scene) setView('layers');
    else if ((e.key === 'e' || e.key === 'E') && scene) setView(st.view === 'layers' ? '3d' : 'layers');
    else if (e.key === 'l' || e.key === 'L') { st.legendOpen = !st.legendOpen; renderLegend(); }
  });

  // ---------------------------------------------------------------- URL state (screenshots, links)
  function syncUrl() {
    if (st._noSync) return;
    const u = new URL(location.href);
    u.searchParams.set('view', st.view);
    st.mode !== 'reference' ? u.searchParams.set('mode', st.mode) : u.searchParams.delete('mode');
    const layer = st.iso ? st.iso.group : st.view === 'layers' ? st.plateFocus : null;
    layer ? u.searchParams.set('layer', layer) : u.searchParams.delete('layer');
    const ov = st.iso ? Object.entries(st.iso.overlays).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${(+v).toFixed(2)}`).join(',') : '';
    ov ? u.searchParams.set('overlay', ov) : u.searchParams.delete('overlay');
    for (const k of ['explode', 'draft', 'then']) u.searchParams.delete(k);
    history.replaceState(null, '', u);
  }

  // ---------------------------------------------------------------- AI-facing API (read / query / draft; no renderer access needed)
  window.GP = {
    version: store.model.project.version, api: '0.4',
    get model() { return store.model.project; },
    getObject: (id) => store.getObject(id), getBedAt: (x, y) => store.getBedAt(x, y),
    queryObjects: (g, f) => store.queryObjects(g, f), query: (g, f) => store.query(g, f), queryInstances: (g, f) => store.queryInstances(g, f),
    sampleConditions: (x, y) => store.sampleConditions(x, y), getPlantingContext: (id) => store.getPlantingContext(id),
    plantableAt: (x, y) => store.plantableAt(x, y), speciesTally: (f) => store.speciesTally(f), instancesOfPlacement: (id) => store.instancesOfPlacement(id).map((i) => 'pi.' + i),
    scenario: () => store.scenario, setScenario: (s) => { const ok = s === 'reference' ? setMode('reference', { silent: true }) : s === 'working' ? setMode('canvas', { silent: true }) : false; return !!ok; },
    mode: () => st.mode, setMode: (m) => setMode(m, { silent: true }),
    createDraft: (o) => { const r = store.createDraft(o); if (r.ok) setMode('canvas', { silent: true }); return r; },
    blankScopePreview: (scope) => store.blankScopePreview(scope), draftInfo: () => store.draftInfo(), draftSummary: () => store.draftSummary(),
    applyPatch: (ops, o) => { const r = store.applyPatch(ops, o); if (r.ok && !r.dryRun && st.mode !== 'canvas') setMode('canvas', { silent: true }); return r; },
    resetDraft: () => { const r = store.resetDraft(); if (!store.draft) setMode('reference', { silent: true }); return r; },
    discardDraft: () => { const r = store.discardDraft(); setMode('reference', { silent: true }); return r; },
    setEditLock: (id, on) => store.setEditLock(id, on),
    exportModel: (o) => store.exportModel(o), exportDraft: () => store.exportDraft(), importDraft: (o) => { const r = store.importDraft(o); if (r.ok) setMode('canvas', { silent: true }); return r; },
    diffDraft: () => store.diffDraft(),
    select: (id) => store.select(id ? { id } : null), selection: () => store.selection,
    layers: () => Object.fromEntries(Object.entries(store.layerState).map(([k, v]) => [k, { ...v }])),
    layerGroups: () => GROUPS.map((g) => ({ id: g.id, name: g.name, layers: g.layers.slice(), visible: groupVisible(store, g.id), locked: groupLocked(store, g.id) })),
    setLayer: (id, p) => store.setLayer(id, { ...p, external: true }), setLayerGroup: (gid, p) => setGroup(store, gid, { ...p, external: true }),
    view: () => st.view, setView, openLayer: (gid, o) => openIso(gid, o || {}), closeLayer: () => exitIso(true), focusLayer: (gid) => { if (st.view !== 'layers') setView('layers'); focusPlate(gid); }, back: goBack,
    isolation: () => (st.iso ? { group: st.iso.group, overlays: { ...st.iso.overlays } } : null), setOverlay: (gid, op) => { if (!st.iso) return false; st.iso.overlays[gid] = op; plan.setIsolation(st.iso); renderLegend(); return true; },
    _store: store, _plan: plan, _scene: scene, _ui: st,
  };

  // ---------------------------------------------------------------- initial state
  const restored = store.restorePersisted();
  st._noSync = true;
  setView(params.get('view') === '3d' && scene ? '3d' : params.get('view') === 'layers' && scene ? 'layers' : params.get('view') === 'plan' ? 'plan' : scene ? '3d' : 'plan');
  for (const tok of (params.get('layers') || '').split(',').filter(Boolean)) { const id = tok.replace(/^[+-]/, ''); if (store.layerState[id]) store.setLayer(id, { visible: !tok.startsWith('-'), external: true }); }
  const dq = params.get('draft');
  if (dq === 'blank' || dq === 'copy') store.createDraft({ from: dq === 'blank' ? 'blank' : 'reference', activate: false });
  if (dq === 'demo') demoDraft(store);
  const m = params.get('mode'); if (m === 'canvas' || m === 'terrain') setMode(m, { silent: true }); else setMode('reference', { silent: true });
  if (params.get('then') === 'reference') setMode('reference', { silent: true });
  if (params.get('lopen') === '1') { $('#layers').classList.remove('collapsed'); $('#ltoggle').setAttribute('aria-expanded', 'true'); }
  if (params.get('explode') === '1' && scene) setView('layers');
  const lay = params.get('layer');
  if (lay && GROUP[lay]) {
    if (st.view === 'layers') focusPlate(lay);
    else { const ov = {}; for (const t of (params.get('overlay') || '').split(',').filter(Boolean)) { const [g, v] = t.split(':'); if (GROUP[g]) ov[g] = Math.max(0.05, Math.min(1, +v || 0.5)); } openIso(lay, { overlays: ov, fromUrl: true }); }
  }
  if (params.get('sel')) { const at = (params.get('at') || '').split(',').map(Number); store.select({ id: params.get('sel'), ...(at.length === 2 && at.every(isFinite) ? { at } : {}) }); }
  if (params.get('focus') === '1' && store.selection) {
    if (st.view === 'plan') { plan.focus(store.selection.id); if (params.get('z')) { plan.view.scale *= +params.get('z'); plan.request(); } }
    else if (scene) scene.focus(store.selection.id, +(params.get('z') || 1), true);
  }
  if (params.get('legend') === '1') { st.legendOpen = true; renderLegend(); }
  if (params.get('about') === '1') $('#btnAbout').click();
  st._noSync = false; syncUrl();
  renderStatus(); renderLegend();
  if (restored && st.mode === 'reference') $('#note').insertAdjacentHTML('beforeend', ' <span class="pill">working design restored · open Canvas</span>');
  $('#loading').classList.add('done');
  document.documentElement.dataset.ready = '1';
}

// a reproducible demo change for screenshots (?draft=demo): one real B1 group replaced in a copy of the reference
function demoDraft(store) {
  store.createDraft({ from: 'reference', activate: false });
  const g = (store.baseline.placements.filter((p) => p.bedId === 'bed.B1' && p.role === 'group' && p.speciesIds.length === 1).sort((a, b) => b.areaM2 - a.areaM2))[0];
  if (g) { const r = store.applyPatch([{ op: 'replaceSpecies', target: g.id, speciesIds: ['sp.achillea-moonshine'] }]); if (!r.ok) console.warn('demo draft refused', r.errors); }
}

// ======================================================================= layer index (seven groups)
const EYE = '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="10" cy="10" r="2.3" fill="currentColor"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 17 17 3" stroke="currentColor" stroke-width="1.3"/></svg>';
const LOCK = '<svg viewBox="0 0 20 20" width="13" height="13"><rect x="4.5" y="9" width="11" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
const CHEV = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const OPEN = '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 10l4-4M7 6h3v3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
function buildLayerTree(store, { openIso }) {
  const root = document.getElementById('ltree');
  const open = new Set();
  const render = () => {
    root.innerHTML = '';
    for (const g of GROUPS) {
      const vis = groupVisible(store, g.id), lk = groupLocked(store, g.id);
      const row = document.createElement('div'); row.className = 'lrow group'; row.dataset.group = g.id;
      row.innerHTML = `<button class="chev" aria-expanded="${open.has(g.id)}" aria-label="Expand ${esc(g.name)}">${CHEV}</button><span class="name" title="${esc(g.blurb)}">${esc(g.name)}</span>` +
        `<button class="tg go" title="Open ${esc(g.name)} in Plan" aria-label="Open ${esc(g.name)} in Plan">${OPEN}</button>` +
        `<button class="tg eye ${vis ? '' : 'off'}" aria-pressed="${vis}" aria-label="Show ${esc(g.name)}" title="Visible">${vis ? EYE : EYE_OFF}</button>` +
        `<button class="tg lock ${lk ? 'on' : ''}" aria-pressed="${lk}" aria-label="Lock ${esc(g.name)}" title="${lk ? 'Locked: not selectable' : 'Unlocked'}">${LOCK}</button>`;
      root.appendChild(row);
      row.querySelector('.chev').onclick = () => { open.has(g.id) ? open.delete(g.id) : open.add(g.id); render(); };
      row.querySelector('.go').onclick = () => openIso(g.id);
      row.querySelector('.eye').onclick = () => { setGroup(store, g.id, { visible: !vis }); render(); };
      row.querySelector('.lock').onclick = () => { setGroup(store, g.id, { locked: !lk }); render(); };
      if (!open.has(g.id)) continue;
      for (const l of g.layers) {
        const L = store.layers.get(l); if (!L) continue;
        const s = store.layerState[l]; const na = L.status === 'unavailable';
        const r = document.createElement('div'); r.className = 'lrow child' + (store.layerVisible(l) ? '' : ' dim'); r.dataset.layer = l;
        r.innerHTML = `<span></span><span class="name" title="${esc(L.name)}">${esc(LAYER_NAME[l] || L.name)}</span><span></span>` +
          (na ? '<span class="na" title="No data available — unknown, not zero">no data</span>' :
            `<button class="tg eye ${s.visible ? '' : 'off'}" aria-pressed="${s.visible}" aria-label="Show ${esc(LAYER_NAME[l] || L.name)}">${s.visible ? EYE : EYE_OFF}</button><button class="tg lock ${s.locked ? 'on' : ''}" aria-pressed="${s.locked}" aria-label="Lock ${esc(LAYER_NAME[l] || L.name)}">${LOCK}</button>`);
        root.appendChild(r);
        const e = r.querySelector('.eye'); if (e) e.onclick = () => { store.setLayer(l, { visible: !s.visible }); render(); };
        const k = r.querySelector('.lock'); if (k) k.onclick = () => { store.setLayer(l, { locked: !s.locked }); render(); };
      }
    }
  };
  render();
  store.on('layers', (e) => { if (e && e.external) render(); });
  store.on('model', render);
}

// ======================================================================= inspector
function badge(status, dataKind) {
  let h = '';
  if (status) h += `<span class="badge ${esc(status)}" title="Evidence status">${esc(STATUS_LABEL[status] || status)}</span>`;
  if (dataKind) h += `<span class="badge kind" title="dataKind">${esc(dataKind)}</span>`;
  return h;
}
function spName(sp) { return `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ` ‘${esc(sp.cultivar)}’` : ''}`; }
function fmt(n, d = 1) { return n == null ? '<span class="unk">unknown</span>' : (+n).toLocaleString('en-US', { maximumFractionDigits: d }); }
const ROLE_LABEL = { block: 'block', emergent: 'emergent', matrix: 'matrix', group: 'group', individual: 'individual / small group', scatter: 'scatter', 'bulb-drift': 'bulb drift', 'bulb-cluster': 'bulb cluster', 'bulb-scatter': 'bulb scatter', 'bulb-line': 'bulb line', tree: 'tree', shrub: 'shrub', hedgerow: 'hedgerow', meadow: 'meadow mix' };

function renderInspector(store, sel, ctx) {
  const el = document.getElementById('inspector');
  if (!sel) { el.hidden = true; el.innerHTML = ''; return; }
  document.getElementById('about').hidden = true;
  const o = store.getObject(sel.id);
  if (!o) { el.hidden = true; return; }
  const kind = store.kindOf(sel.id);
  const crumbs = [];
  let title = '', sub = '', body = '', status = o.status, dk = o.dataKind;
  const scen = store.scenario === 'working' ? '<span class="badge draftb" title="You are looking at the working design">Working design</span>' : '<span class="badge refb" title="Read-only reference">Reference</span>';
  const crumbFor = (id) => { const r = store.getObject(id); return r ? { id, label: r.name || r.id.replace('bed.', 'Bed ') } : null; };
  if (sel.point) {
    title = 'Point on the site'; sub = `x ${sel.at ? sel.at[0] : '—'} · y ${sel.at ? sel.at[1] : '—'}`; status = null; dk = null;
  } else if (kind === 'instance') {
    const sp = store.getObject(o.speciesId); const pl = o.placementId ? store.getObject(o.placementId) : null;
    if (o.bedId) { const b = store.getObject(o.bedId); crumbs.push(crumbFor(b.parent), crumbFor(b.id)); }
    if (pl) crumbs.push({ id: pl.id, label: pl.legendCode ? `${ROLE_LABEL[pl.role] || pl.role} ${pl.legendCode}` : ROLE_LABEL[pl.role] || pl.role });
    title = sp.scientificName + (sp.cultivar ? ` ‘${sp.cultivar}’` : '');
    sub = `${pl ? 'Plant proxy' : 'Existing tree (site vegetation)'} · ${o.id} · ${sp.plantType}`;
    body += sec('Plant', kv([
      ['Species', spName(sp)], ['Plant type', esc(sp.plantType)], ['Form proxy', `${esc(sp.formProxy)} <span class="unk">(inferred)</span>`],
      ['Display height', `${fmt(sp.nominalHeightM * o.scale, 2)} m <span class="unk">nominal, not measured</span>`],
      ['Position', `<span class="mono">${o.position[0]}, ${o.position[1]}</span>`], ['Elevation', `${fmt(o.elevation, 2)} m`], ['Position source', esc(o.positionSource)],
    ]) + `<p class="note">${esc(o.note)}</p>` + aliasNote(sp));
    if (pl) body += sec('Placement', kv([['Placement', `<span class="mono">${esc(pl.id)}</span>`], ['Role in recipe', esc(ROLE_LABEL[pl.role] || pl.role)], ['Legend code', esc(pl.legendCode || '—')], ['Recipe', esc(pl.recipeId || '—')]]));
  } else if (kind === 'placement') {
    const b = o.bedId ? store.getObject(o.bedId) : null;
    if (b) crumbs.push(crumbFor(b.parent), crumbFor(b.id));
    const sps = (o.speciesIds || []).map((s) => store.getObject(s));
    const rows = store.instancesOfPlacement(o.id);
    title = sps.length ? sps.map((s) => s.scientificName + (s.cultivar ? ` ‘${s.cultivar}’` : '')).join(' + ') : 'Species not published';
    sub = `${o.kind === 'area' ? 'Patch' : o.kind === 'point' ? 'Symbol' : 'Scatter'} · ${ROLE_LABEL[o.role] || o.role}${o.legendCode ? ' · legend “' + o.legendCode + '”' : ''}`;
    body += sec('Placement', kv([
      ['Id', `<span class="mono">${esc(o.id)}</span>`], ['Geometry', esc(o.kind) + (o.geometryRef ? ` (= ${esc(o.geometryRef)})` : '')],
      ['Area', o.areaM2 != null ? `${fmt(o.areaM2)} m²` : '—'], ['Recipe', esc(o.recipeId || '—')],
      ['Real plants (est.)', o.countEstimatedReal != null ? fmt(o.countEstimatedReal, 0) : '<span class="unk">not published</span>'],
      ['Visual proxies', `${rows.length.toLocaleString()} <span class="unk">live in this scenario</span>`], ['Position source', esc(o.positionSource)],
      ...(o.replaced ? [['Replaced', `${o.replaced.speciesIds.map((id) => { const r = store.getObject(id); return r ? spName(r) : esc(id); }).join(' + ')}${o.replaced.legendCode ? ` (legend “${esc(o.replaced.legendCode)}”)` : ''} <span class="unk">in this working design</span>`]] : []),
    ]) + `<p class="note">${esc(o.countBasis || '')}${o.note ? ' ' + esc(o.note) : ''}${o.bloomNote ? ' ' + esc(o.bloomNote) : ''}</p>`);
    if (sps.length) body += sec('Species', `<ul class="splist">${sps.map((s) => `<li><span class="swatch" style="background:${speciesPlanColor(s)}"></span><span>${spName(s)}</span><span class="role">${esc(s.plantType)}</span></li>`).join('')}</ul>`);
    if (DEV && store.scenario === 'working') body += devEditor(store, o);
  } else {
    if (o.parent) { const p = store.getObject(o.parent); if (p && p.parent) crumbs.push(crumbFor(p.parent)); if (p) crumbs.push(crumbFor(p.id)); }
    title = o.name || o.id; sub = `${o.type}${o.props && o.props.styleName ? ' · ' + o.props.styleName : ''} · ${o.id}`;
    const P = o.props || {};
    const rows = [];
    if (o.type === 'bed') {
      rows.push(['Planting style', `${esc(P.styleName)}${P.style && 'ABC'.includes(P.style) ? ` (${P.style})` : ''}`]);
      rows.push(['Original code', P.originalCode ? `<b>${esc(P.originalCode)}</b>` : '<span class="unk">none published</span>']);
      if (P.column) rows.push(['Position', `column ${P.column} of 8 (W→E), ${P.row === 'N' ? 'north' : 'south'} row`]);
      rows.push(['Area', `${fmt(P.areaM2)} m²`]);
      if (P.osm) rows.push(['Outline', `OSM ${esc(P.osm)}`]);
    } else {
      for (const [k, v] of Object.entries(P)) { if (v == null || typeof v === 'object' || k === 'note' || k === 'codeNote') continue; rows.push([k.replace(/([A-Z])/g, ' $1').toLowerCase(), esc(v)]); }
    }
    body += sec(o.type === 'bed' ? 'Bed (framework)' : 'Object', kv(rows) + (P.codeNote ? `<p class="note">${esc(P.codeNote)}</p>` : '') + (P.note ? `<p class="note">${esc(P.note)}</p>` : ''));
    if (o.type === 'bed' && P.style !== 'M') {
      const ctxp = store.getPlantingContext(o.id);
      const pls = store.placementsByBed.get(o.id) || [];
      const bySp = new Map();
      for (const p of pls) for (const s of p.speciesIds || []) { const k = s + '|' + p.role; bySp.set(k, (bySp.get(k) || 0) + 1); }
      const items = [...bySp.entries()].map(([k, n]) => { const [s, role] = k.split('|'); return { sp: store.getObject(s), role, n }; }).sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || b.n - a.n);
      const stt = store.model.project.officialStatistics.mainGardenByStyle[P.style];
      if (stt && store.scenario === 'reference') body += sec('Official counts — whole style', kv([['Style total', `${fmt(stt.plants, 0)} plants · ${stt.varieties} varieties`], ['Forbs / grasses', `${fmt(stt.forbs, 0)} / ${fmt(stt.grasses, 0)}`], ['Bulbs', fmt(stt.bulbs, 0)], ['As of', 'March 2023']]) + '<p class="note">Counts are published per style, not per bed.</p>');
      body += sec(`${store.scenario === 'working' ? 'Working design' : 'Reference recipe'} in this bed · ${ctxp.placementCount} placements · ${ctxp.instanceCount.toLocaleString()} proxies`, (items.length ? `<ul class="splist">${items.slice(0, 60).map((it) => `<li><span class="swatch" style="background:${speciesPlanColor(it.sp)}"></span><span>${spName(it.sp)}</span><span class="role">${esc(ROLE_LABEL[it.role] || it.role)}${it.n > 1 ? ' ×' + it.n : ''}</span></li>`).join('')}</ul>` : '<p class="note">Empty in this working design — open for planting.</p>') +
        (store.scenario === 'reference' ? '<p class="note">Species and roles: legends of this style (2019 plans, 2020 bulb plans). Positions are generated, not traced.</p>' : ''));
    }
  }
  if (sel.at) {
    const c = store.sampleConditions(sel.at[0], sel.at[1]);
    const v = (k, d = 2) => (c[k].value == null ? `<span class="unk">${c[k].status === 'unknown' ? 'unknown — no data' : 'n/a'}</span>` : `${fmt(c[k].value, d)} ${esc(c[k].units)} <span class="unk">${c[k].status}</span>`);
    const pa = c.constraints.plantable;
    body += sec('Conditions at this point', kv([['Elevation', v('field.elevation')], ['Slope', v('field.slope', 1)], ['To nearest path', v('field.distance-to-path')], ['Sun / shade', v('field.sun')], ['Soil moisture', v('field.moisture')], ['Soil pH', v('field.ph')], ['Plantable', pa.value ? `yes · ${esc(pa.unitId)}${pa.editLocked ? ' (edit-locked)' : ''}` : `no <span class="unk">${esc(pa.reason)}</span>`], ['Planting here', `${c.placements.length} placement${c.placements.length === 1 ? '' : 's'} overlap`]]));
  }
  const srcs = (kind === 'instance' ? (store.getObject(o.placementId)?.sourceRefs || ['S-NAIP']) : o.sourceRefs || []).map((s) => store.getObject(s)).filter(Boolean);
  if (srcs.length) body += sec('Sources', `<ul class="src">${srcs.map((s) => `<li>${s.url && /^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul>`);
  const cr = crumbs.filter(Boolean).map((c) => `<button data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('<span class="sep">›</span>');
  el.innerHTML = `<div class="ins-h"><button class="ins-x" aria-label="Close">×</button>${cr ? `<div class="crumbs">${cr}</div>` : ''}<div class="ins-title">${esc(title)}</div><div class="ins-sub">${esc(sub)}</div><div class="badges">${scen}${badge(status, dk)}</div></div>${body}
    <div class="actions"><button class="btn" data-act="focus">Zoom to</button><button class="btn" data-act="json">Copy JSON</button>${kind !== 'object' || o.type !== 'site' ? '<button class="btn" data-act="up">Select parent</button>' : ''}</div>`;
  el.hidden = false;
  el.querySelector('.ins-x').onclick = () => store.select(null);
  el.querySelectorAll('.crumbs button').forEach((b) => (b.onclick = () => store.select({ id: b.dataset.id })));
  el.querySelector('[data-act="focus"]').onclick = () => (ctx.st.view === 'plan' ? ctx.plan.focus(sel.id) : ctx.scene.focus(sel.id));
  el.querySelector('[data-act="json"]').onclick = async (e) => {
    const rec = kind === 'object' && o.type === 'bed' ? { ...o, plantingContext: store.getPlantingContext(o.id) } : o;
    try { await navigator.clipboard.writeText(JSON.stringify(rec, null, 2)); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
  };
  const up = el.querySelector('[data-act="up"]'); if (up) up.onclick = () => ctx.picker.up();
  el.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => devAction(store, o, b.dataset.dev, el)));
}
// developer test entry (?dev=1, working design only): exercises the same validated patch API an AI client would use
function devEditor(store, o) {
  const same = store.model.species.filter((s) => s.plantType !== 'tree' && s.plantType !== 'bulb').sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  return sec('Developer test · patch API', `<label class="small">Replace species <select data-sel>${same.map((s) => `<option value="${s.id}" ${o.speciesIds[0] === s.id ? 'selected' : ''}>${esc(s.scientificName)}${s.cultivar ? ' ‘' + esc(s.cultivar) + '’' : ''}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" data-dev="replace">Apply</button><button class="btn" data-dev="remove">Remove placement</button></div><p class="note" data-out></p>`);
}
function devAction(store, o, a, el) {
  const out = el.querySelector('[data-out]');
  const r = a === 'replace' ? store.applyPatch([{ op: 'replaceSpecies', target: o.id, speciesIds: [el.querySelector('[data-sel]').value] }]) : store.applyPatch([{ op: 'remove', target: o.id }]);
  if (out) out.textContent = r.ok ? `ok · ${JSON.stringify(r.changes)}` : r.errors.map((e) => e.message).join('; ');
}
// a different cultivar in a later list is a possible substitution / version change, never silently the same plant
function aliasNote(sp) {
  if (!sp.aliases || !sp.aliases.length) return '';
  const syn = sp.aliases.filter((a) => !/\(2026 list\)/.test(a)), sub = sp.aliases.filter((a) => /\(2026 list\)/.test(a));
  return (syn.length ? `<p class="note">Same plant, other spelling: ${syn.map(esc).join('; ')}</p>` : '') +
    (sub.length ? `<p class="note">The Feb 2026 plant list has <b>${sub.map((a) => esc(a.replace(' (2026 list)', ''))).join('; ')}</b> instead — a different cultivar (possible substitution or version change), not a synonym. The model keeps the 2019/2020 plan name.</p>` : '');
}
function roleOrder(r) { return ['matrix', 'block', 'group', 'emergent', 'individual', 'scatter', 'bulb-drift', 'bulb-cluster', 'bulb-scatter', 'bulb-line'].indexOf(r) + 1 || 99; }
function sec(h, inner) { return `<div class="sec"><h4>${esc(h)}</h4>${inner}</div>`; }
function kv(rows) { return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`; }

function renderAbout(store) {
  const P = store.baseline.project; const el = document.getElementById('about');
  const st = P.officialStatistics;
  const beds = store.beds.filter((b) => 'ABC'.includes(b.props.style));
  el.innerHTML = `<button class="ins-x" aria-label="Close" style="position:absolute;right:10px;top:10px">×</button>
  <h3>Detroit · Spatial Laboratory</h3>
  <p>A computable model of Oudolf Garden Detroit (Main Garden, Rain Garden, Bird Border, Native Meadows, Belle Isle), built as the spatial input for future AI-assisted planting research. One model drives the plan, the 3D model and the layer overview.</p>
  <p><b>Three design states share one site.</b> <i>Reference</i> is a frozen schematic reconstruction (never edited). <i>Canvas</i> is your working design — a copy of the reference or a blank planting inside the bed framework. <i>Terrain</i> is a view of the ground only; nothing is deleted.</p>
  <table><tr><th>Evidence</th><th>Status</th></tr>
  <tr><td>15 main beds + 2 triangles + Rain Garden outlines (OSM, checked against USGS NAIP)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Bed codes A1–A4, B1–B5, C1–C4 (Oudolf 2020 bulb plans), style per bed (2019 key maps)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Species per style and their legend role (block / matrix / group / emergent / bulbs)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Patch shapes, symbol and plant positions inside beds</td><td><span class="badge schematic">Schematic</span></td></tr>
  <tr><td>Meadow outlines, Bird Border alignment, cobble swale route</td><td><span class="badge schematic">Schematic</span></td></tr>
  <tr><td>Terrain (USGS 3DEP 1 m); 3D relief shown ×1.6 unless “true scale”</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Existing trees (crowns digitised from NAIP; species unknown)</td><td><span class="badge reconstructed">Reconstructed</span></td></tr>
  <tr><td>Sun, soil moisture, pH</td><td><span class="badge unknown">Unknown</span></td></tr></table>
  <p><b>Epoch.</b> ${esc(P.reconstructionEpoch.description)}</p>
  <p><b>Official counts</b> (March 2023): Main Garden ${st.site['Main Garden'].plants.toLocaleString()} plants, ${st.site['Main Garden'].varieties} varieties. The reference holds ${store.refInstCount.toLocaleString()} visual plant proxies (${beds.length} main beds).</p>
  <p><b>Coordinates.</b> ${esc(P.coordinateSystem.id)} — metres, x east, y north, origin ${P.coordinateSystem.origin.lat}, ${P.coordinateSystem.origin.lon}; elevation NAVD88.</p>
  <p><b>Credits.</b> ${P.attribution.map(esc).join(' · ')}. Planting design © Piet Oudolf; this model cites the published plans and lists but does not reproduce the drawings. Visual language informed by landscape research drawings (UBC SALA, <i>Landscape as Laboratory</i>, 2024); nothing is copied from them.</p>
  <p class="note">For agents: <span class="mono">window.GP</span> — getObject, query / queryObjects (exact geometry), sampleConditions, plantableAt, getPlantingContext, createDraft, applyPatch (validated, atomic), resetDraft, exportDraft / importDraft, layerGroups, openLayer. Data: <a href="data/detroit/model.json">model.json</a>, <a href="data/detroit/case.json">case.json</a>. Contract: <a href="docs/MODEL_CONTRACT.md">MODEL_CONTRACT.md</a>.</p>`;
  el.querySelector('.ins-x').onclick = () => (el.hidden = true);
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading'); l.innerHTML = `<span>Could not load the model: ${esc(e.message)}</span>`;
});
