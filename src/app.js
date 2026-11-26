import { ModelStore, centroidOf } from './model.js';
import { Picker } from './picker.js';
import { Plan2D } from './plan2d.js';
import { PAL, mix, speciesPlanColor, STATUS_LABEL } from './style.js';

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);

async function main() {
  const store = await ModelStore.load('data/detroit/');
  const picker = new Picker(store);
  const app = $('#app');
  const plan = new Plan2D($('#c2d'), store, picker);
  let scene = null;
  try {
    const { Scene3D } = await import('./scene3d.js');
    scene = new Scene3D($('#c3d'), store, picker, { labelRoot: $('#labels3d'), preserve: params.has('shot'), quality: params.get('q') || 'high' });
    scene.onRaster = (kind) => { plan._rasters ||= {}; if (!plan._rasters[kind]) { plan._raster(kind); } return plan._rasters[kind]; };
  } catch (err) {
    console.error('3D unavailable', err);
  }

  // ---------------------------------------------------------------- view switching
  let view = params.get('view') === 'plan' || !scene ? 'plan' : '3d';
  function setView(v) {
    view = v; app.dataset.view = v;
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.v === v)));
    plan.setActive(v === 'plan');
    if (scene) scene.setActive(v === '3d');
    if (v === 'plan' && !plan._fitted) { plan.fit(); plan._fitted = true; }
    const u = new URL(location.href); u.searchParams.set('view', v); history.replaceState(null, '', u);
  }
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
  $('#btnFit').addEventListener('click', () => (view === 'plan' ? plan.fit() : scene.home()));
  window.addEventListener('resize', () => { plan.resize(); if (scene) scene.resize(); if (view === 'plan') plan.request(); });

  // ---------------------------------------------------------------- coordinates readout
  const coords = $('#coords');
  const showXY = (x, y) => { const z = store.sampleElevation(x, y); coords.textContent = `x ${x.toFixed(2)}  y ${y.toFixed(2)}  z ${z == null ? '—' : z.toFixed(2)} m`; };
  plan.onCursor = showXY; if (scene) scene.onCursor = showXY;

  // ---------------------------------------------------------------- layers
  buildLayerTree(store);
  $('#ltoggle').addEventListener('click', () => { const L = $('#layers'); L.classList.toggle('collapsed'); $('#ltoggle').setAttribute('aria-expanded', String(!L.classList.contains('collapsed'))); });
  if (window.innerWidth < 760) { $('#layers').classList.add('collapsed'); $('#ltoggle').setAttribute('aria-expanded', 'false'); }

  // ---------------------------------------------------------------- inspector
  store.on('selection', (sel) => renderInspector(store, sel, { plan, scene, picker, getView: () => view }));
  store.on('model', () => renderInspector(store, store.selection, { plan, scene, picker, getView: () => view }));

  // ---------------------------------------------------------------- about
  $('#btnAbout').addEventListener('click', () => { const a = $('#about'); if (a.hidden) { renderAbout(store); a.hidden = false; $('#inspector').hidden = true; } else a.hidden = true; });

  // ---------------------------------------------------------------- keys
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'Escape') { if (!$('#about').hidden) { $('#about').hidden = true; return; } store.select(null); }
    else if (e.key === 'f' || e.key === 'F') { view === 'plan' ? plan.fit() : scene.home(); }
    else if (e.key === 'Backspace' || e.key === 'ArrowUp') { if (store.selection) { e.preventDefault(); picker.up(); } }
    else if (e.key === '1' && scene) setView('3d'); else if (e.key === '2') setView('plan');
  });

  // ---------------------------------------------------------------- AI-facing API (read / query / draft; no renderer access)
  window.GP = {
    version: store.model.project.version,
    model: store.model.project,
    getObject: (id) => store.getObject(id), getBedAt: (x, y) => store.getBedAt(x, y),
    queryObjects: (g, f) => store.queryObjects(g, f), sampleConditions: (x, y) => store.sampleConditions(x, y),
    getPlantingContext: (id) => store.getPlantingContext(id), applyPatch: (ops) => store.applyPatch(ops),
    resetDraft: () => store.resetDraft(), exportModel: (o) => store.exportModel(o), diffDraft: () => store.diffDraft(),
    select: (id) => store.select(id ? { id } : null), selection: () => store.selection,
    layers: () => Object.fromEntries(Object.entries(store.layerState).map(([k, v]) => [k, { ...v }])),
    setLayer: (id, p) => store.setLayer(id, p),
    _store: store, _plan: plan, _scene: scene, setView, view: () => view,
  };

  setView(view);
  $('#loading').classList.add('done');
  if (params.get('sel')) { store.select({ id: params.get('sel') }); }
  document.documentElement.dataset.ready = '1';
}

// ======================================================================= layer tree
const EYE = '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="10" cy="10" r="2.4" fill="currentColor"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 20 20" width="15" height="15"><path d="M1.8 10s3-5.4 8.2-5.4 8.2 5.4 8.2 5.4-3 5.4-8.2 5.4S1.8 10 1.8 10Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M3 17 17 3" stroke="currentColor" stroke-width="1.4"/></svg>';
const LOCK = '<svg viewBox="0 0 20 20" width="14" height="14"><rect x="4.5" y="9" width="11" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const CHEV = '<svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const LAYER_SWATCH = { 'veg.trees': '#7E9468', 'veg.shrubs': '#8FA277', 'veg.grasses': '#C9B27F', 'veg.forbs': '#C2457C', 'veg.bulbs': '#9FB4D8',
  'veg.lawn': PAL.lawn, 'built.paths': PAL.gravel, 'built.walks': PAL.lawnDeep, 'built.walls': PAL.limestone, 'built.edging': PAL.steel,
  'site.water': PAL.water, 'structure.beds': PAL.soilLight, 'structure.patches': '#D77AB3', 'analysis.slope': '#E9B86B', 'analysis.pathdist': '#86B6B0' };

function buildLayerTree(store) {
  const root = document.getElementById('ltree');
  const collapsed = new Set(['topo', 'analysis', 'site']);
  const render = () => {
    root.innerHTML = '';
    for (const l of store.model.layers) {
      if (l.parent && collapsed.has(l.parent)) continue;
      const st = store.layerState[l.id];
      const row = document.createElement('div');
      const unavailable = l.status === 'unavailable';
      row.className = 'lrow ' + (l.parent ? 'child' : 'group') + (l.parent && !store.layerVisible(l.parent) ? ' dim' : '');
      row.dataset.layer = l.id;
      const sw = LAYER_SWATCH[l.id] ? `<span class="swatch" style="background:${LAYER_SWATCH[l.id]}"></span>` : '';
      row.innerHTML = (l.parent ? '<span></span>' : `<button class="chev" aria-expanded="${!collapsed.has(l.id)}" aria-label="Expand ${esc(l.name)}">${CHEV}</button>`) +
        `<span class="name" title="${esc(l.name)}">${sw}${esc(l.name)}</span>` +
        (unavailable ? '<span class="na" title="No data available — shown as unknown, not as zero">n/a</span>' :
          `<button class="tg eye ${st.visible ? '' : 'off'}" aria-pressed="${st.visible}" aria-label="Show ${esc(l.name)}">${st.visible ? EYE : EYE_OFF}</button>` +
          `<button class="tg lock ${st.locked ? 'on' : ''}" aria-pressed="${st.locked}" aria-label="Lock ${esc(l.name)}" title="${st.locked ? 'Locked: not selectable' : 'Unlocked'}">${LOCK}</button>`);
      root.appendChild(row);
      const chev = row.querySelector('.chev');
      if (chev) chev.addEventListener('click', () => { collapsed.has(l.id) ? collapsed.delete(l.id) : collapsed.add(l.id); render(); });
      const eye = row.querySelector('.eye');
      if (eye) eye.addEventListener('click', () => { store.setLayer(l.id, { visible: !st.visible }); render(); });
      const lock = row.querySelector('.lock');
      if (lock) lock.addEventListener('click', () => { store.setLayer(l.id, { locked: !st.locked }); render(); });
    }
  };
  render();
  store.on('layers', (e) => { if (e && e.external) render(); });
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

  const crumbFor = (id) => { const r = store.getObject(id); return r ? { id, label: r.name || r.id.replace('bed.', 'Bed ') } : null; };
  if (kind === 'instance') {
    const sp = store.getObject(o.speciesId); const pl = o.placementId ? store.getObject(o.placementId) : null;
    if (o.bedId) { const b = store.getObject(o.bedId); crumbs.push(crumbFor(b.parent), crumbFor(b.id)); }
    if (pl) crumbs.push({ id: pl.id, label: pl.legendCode ? `${ROLE_LABEL[pl.role] || pl.role} ${pl.legendCode}` : ROLE_LABEL[pl.role] || pl.role });
    title = sp.scientificName + (sp.cultivar ? ` ‘${sp.cultivar}’` : '');
    sub = `Plant instance · ${o.id} · ${sp.plantType}`;
    body += sec('Plant', kv([
      ['Species', `${spName(sp)}`], ['Plant type', esc(sp.plantType)], ['Form proxy', `${esc(sp.formProxy)} <span class="unk">(inferred)</span>`],
      ['Display height', `${fmt(sp.nominalHeightM * o.scale, 2)} m <span class="unk">nominal, not measured</span>`],
      ['Position', `<span class="mono">${o.position[0]}, ${o.position[1]}</span>`], ['Elevation', `${fmt(o.elevation, 2)} m`],
      ['Position source', esc(o.positionSource)],
    ]) + (sp.note ? `<p class="note">${esc(sp.note)}</p>` : '') + (sp.aliases && sp.aliases.length ? `<p class="note">Also listed as: ${sp.aliases.map(esc).join('; ')}</p>` : ''));
    if (pl) body += sec('Placement', kv([['Placement', `<span class="mono">${esc(pl.id)}</span>`], ['Role in recipe', esc(ROLE_LABEL[pl.role] || pl.role)], ['Legend code', esc(pl.legendCode || '—')], ['Recipe', esc(pl.recipeId)]]));
  } else if (kind === 'placement') {
    const b = o.bedId ? store.getObject(o.bedId) : null;
    if (b) crumbs.push(crumbFor(b.parent), crumbFor(b.id));
    const sps = (o.speciesIds || []).map((s) => store.getObject(s));
    title = sps.length ? sps.map((s) => s.scientificName + (s.cultivar ? ` ‘${s.cultivar}’` : '')).join(' + ') : 'Species not published';
    sub = `${o.kind === 'area' ? 'Patch' : o.kind === 'point' ? 'Symbol' : 'Scatter'} · ${ROLE_LABEL[o.role] || o.role}${o.legendCode ? ' · legend “' + o.legendCode + '”' : ''}`;
    body += sec('Placement', kv([
      ['Id', `<span class="mono">${esc(o.id)}</span>`], ['Geometry', esc(o.kind) + (o.geometryRef ? ` (= ${esc(o.geometryRef)})` : '')],
      ['Area', o.areaM2 != null ? `${fmt(o.areaM2)} m²` : '—'], ['Recipe', esc(o.recipeId)],
      ['Real plants (est.)', o.countEstimatedReal != null ? fmt(o.countEstimatedReal, 0) : '<span class="unk">not published</span>'],
      ['Visual proxies', fmt(o.countModelled, 0)], ['Position source', esc(o.positionSource)],
    ]) + `<p class="note">${esc(o.countBasis || '')}${o.note ? ' ' + esc(o.note) : ''}${o.bloomNote ? ' ' + esc(o.bloomNote) : ''}</p>`);
    if (sps.length) body += sec('Species', `<ul class="splist">${sps.map((s) => `<li><span class="swatch" style="background:${speciesPlanColor(s)}"></span><span>${spName(s)}</span><span class="role">${esc(s.plantType)}</span></li>`).join('')}</ul>`);
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
    body += sec(o.type === 'bed' ? 'Bed' : 'Object', kv(rows) + (P.codeNote ? `<p class="note">${esc(P.codeNote)}</p>` : '') + (P.note ? `<p class="note">${esc(P.note)}</p>` : ''));
    if (o.type === 'bed' && P.style !== 'M') {
      const ctxp = store.getPlantingContext(o.id);
      const pls = store.placementsByBed.get(o.id) || [];
      const bySp = new Map();
      for (const p of pls) for (const s of p.speciesIds || []) { const k = s + '|' + p.role; bySp.set(k, (bySp.get(k) || 0) + 1); }
      const items = [...bySp.entries()].map(([k, n]) => { const [s, role] = k.split('|'); return { sp: store.getObject(s), role, n }; })
        .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || b.n - a.n);
      const st = store.model.project.officialStatistics.mainGardenByStyle[P.style];
      if (st) body += sec('Official counts — whole style', kv([['Style total', `${fmt(st.plants, 0)} plants · ${st.varieties} varieties`], ['Forbs / grasses', `${fmt(st.forbs, 0)} / ${fmt(st.grasses, 0)}`], ['Bulbs', fmt(st.bulbs, 0)], ['As of', 'March 2023']]) + '<p class="note">Counts are published per style, not per bed. Per-patch numbers here are area-share estimates.</p>');
      body += sec(`Recipe in this bed · ${ctxp.placementCount} placements`, `<ul class="splist">${items.slice(0, 60).map((it) => `<li><span class="swatch" style="background:${speciesPlanColor(it.sp)}"></span><span>${spName(it.sp)}</span><span class="role">${esc(ROLE_LABEL[it.role] || it.role)}${it.n > 1 ? ' ×' + it.n : ''}</span></li>`).join('')}</ul>` +
        '<p class="note">Species and their role come from the legend of this style (2019 plans, 2020 bulb plans). Where each patch sits is generated, not traced.</p>');
    }
  }
  // conditions at the clicked point
  if (sel.at) {
    const c = store.sampleConditions(sel.at[0], sel.at[1]);
    const v = (k, d = 2) => (c[k].value == null ? `<span class="unk">${c[k].status === 'unknown' ? 'unknown — no data' : 'n/a'}</span>` : `${fmt(c[k].value, d)} ${esc(c[k].units)} <span class="unk">${c[k].status}</span>`);
    body += sec('Conditions at this point', kv([['Elevation', v('field.elevation')], ['Slope', v('field.slope', 1)], ['To nearest walk', v('field.distance-to-path')], ['Sun / shade', v('field.sun')], ['Soil moisture', v('field.moisture')], ['Soil pH', v('field.ph')]]));
  }
  const srcs = (kind === 'instance' ? (store.getObject(o.placementId)?.sourceRefs || ['S-NAIP']) : o.sourceRefs || []).map((s) => store.getObject(s)).filter(Boolean);
  if (srcs.length) body += sec('Sources', `<ul class="src">${srcs.map((s) => `<li>${s.url && /^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul>`);
  const cr = crumbs.filter(Boolean).map((c) => `<button data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('<span class="sep">›</span>');
  el.innerHTML = `<div class="ins-h"><button class="ins-x" aria-label="Close">×</button>${cr ? `<div class="crumbs">${cr}</div>` : ''}<div class="ins-title">${esc(title)}</div><div class="ins-sub">${esc(sub)}</div><div class="badges">${badge(status, dk)}</div></div>${body}
    <div class="actions"><button class="btn" data-act="focus">Zoom to</button><button class="btn" data-act="json">Copy JSON</button>${kind !== 'object' || o.type !== 'site' ? '<button class="btn" data-act="up">Select parent</button>' : ''}</div>`;
  el.hidden = false;
  el.querySelector('.ins-x').onclick = () => store.select(null);
  el.querySelectorAll('.crumbs button').forEach((b) => (b.onclick = () => store.select({ id: b.dataset.id })));
  el.querySelector('[data-act="focus"]').onclick = () => (ctx.getView() === 'plan' ? ctx.plan.focus(sel.id) : ctx.scene.focus(sel.id));
  el.querySelector('[data-act="json"]').onclick = async (e) => {
    const rec = kind === 'object' && o.type === 'bed' ? { ...o, plantingContext: store.getPlantingContext(o.id) } : o;
    try { await navigator.clipboard.writeText(JSON.stringify(rec, null, 2)); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
  };
  const up = el.querySelector('[data-act="up"]'); if (up) up.onclick = () => ctx.picker.up();
}
function roleOrder(r) { return ['matrix', 'block', 'group', 'emergent', 'individual', 'scatter', 'bulb-drift', 'bulb-cluster', 'bulb-scatter', 'bulb-line'].indexOf(r) + 1 || 99; }
function sec(h, inner) { return `<div class="sec"><h4>${esc(h)}</h4>${inner}</div>`; }
function kv(rows) { return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`; }

function renderAbout(store) {
  const P = store.model.project; const el = document.getElementById('about');
  const st = P.officialStatistics;
  const beds = store.beds.filter((b) => 'ABC'.includes(b.props.style));
  el.innerHTML = `<button class="ins-x" aria-label="Close" style="position:absolute;right:10px;top:10px">×</button>
  <h3>About this model</h3>
  <p>A computable reconstruction of Piet Oudolf's Main Garden, Rain Garden, Bird Border and Native Meadows on Belle Isle, Detroit, built as the spatial input for future AI-assisted planting research. One model drives both views.</p>
  <table><tr><th>Layer of evidence</th><th>Status</th></tr>
  <tr><td>15 main beds + 2 triangles + Rain Garden outlines (OSM, checked against USGS NAIP)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Bed codes A1–A4, B1–B5, C1–C4 (Oudolf's 2020 bulb plans) and style per bed (2019 key maps)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Species per style and their legend role (block / matrix / group / emergent / bulbs)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Patch shapes, symbol and plant positions inside beds</td><td><span class="badge schematic">Schematic</span></td></tr>
  <tr><td>Meadow outlines, Bird Border alignment, cobble swale route</td><td><span class="badge schematic">Schematic</span></td></tr>
  <tr><td>Terrain (USGS 3DEP 1 m), shown with ×1.6 vertical exaggeration in 3D</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Existing trees (crowns digitised from NAIP; species unknown)</td><td><span class="badge reconstructed">Reconstructed</span></td></tr>
  <tr><td>Sun, soil moisture, pH</td><td><span class="badge unknown">Unknown</span></td></tr></table>
  <p><b>Epoch.</b> ${esc(P.reconstructionEpoch.description)}</p>
  <p><b>Official counts</b> (as of March 2023): Main Garden ${st.site['Main Garden'].plants.toLocaleString()} plants, ${st.site['Main Garden'].varieties} varieties; whole garden ${st.site['Total Garden'].plants.toLocaleString()} plants. The model holds ${store.instanceCount.toLocaleString()} visual plant proxies (${beds.length} main beds).</p>
  <p><b>Coordinates.</b> ${esc(P.coordinateSystem.id)} — metres, x east, y north, origin ${P.coordinateSystem.origin.lat}, ${P.coordinateSystem.origin.lon}; elevation NAVD88.</p>
  <p><b>Credits.</b> ${P.attribution.map(esc).join(' · ')}. Planting design © Piet Oudolf; this model cites the published plans and lists but does not reproduce the drawings.</p>
  <p class="note">For agents: <span class="mono">window.GP</span> exposes getObject, getBedAt, queryObjects, sampleConditions, getPlantingContext, applyPatch / resetDraft (drafts never touch the baseline) and exportModel. Data: <a href="data/detroit/model.json">model.json</a>.</p>`;
  el.querySelector('.ins-x').onclick = () => (el.hidden = true);
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading'); l.innerHTML = `<span>Could not load the model: ${esc(e.message)}</span>`;
});
