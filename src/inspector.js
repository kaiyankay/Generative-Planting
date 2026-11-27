// Selection card + site sheet. Compact by default (what it is, which design, how certain); the full record,
// ids and sources only under Details. Words are the designer's: patch, plant symbol, mix — not placement / proxy / recipe.
import { speciesPlanColor, STATUS_LABEL } from './style.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROLE_LABEL = { block: 'block', emergent: 'emergent', matrix: 'matrix', group: 'group', individual: 'individual / small group', scatter: 'scatter', 'bulb-drift': 'bulb drift', 'bulb-cluster': 'bulb cluster', 'bulb-scatter': 'bulb scatter', 'bulb-line': 'bulb line', tree: 'tree', shrub: 'shrub', hedgerow: 'hedgerow', meadow: 'meadow mix' };
const TYPE_LABEL = { bed: 'Bed', path: 'Path', wall: 'Wall', water: 'Water', road: 'Road', parking: 'Parking', building: 'Building', tower: 'Carillon tower', monument: 'Memorial', bench: 'Bench', boardwalk: 'Boardwalk', swale: 'Cobble swale', lawn: 'Lawn', district: 'Garden area', site: 'Site', edging: 'Steel edging' };
function spName(sp) { return `<i>${esc(sp.scientificName)}</i>${sp.cultivar ? ` ‘${esc(sp.cultivar)}’` : ''}`; }
function fmt(n, d = 1) { return n == null ? '<span class="unk">unknown</span>' : (+n).toLocaleString('en-US', { maximumFractionDigits: d }); }
function sec(h, inner, cls = '') { return `<section class="sec ${cls}"><h4>${esc(h)}</h4>${inner}</section>`; }
function kv(rows) { return `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>`; }
function roleOrder(r) { return ['matrix', 'block', 'group', 'emergent', 'individual', 'scatter', 'bulb-drift', 'bulb-cluster', 'bulb-scatter', 'bulb-line'].indexOf(r) + 1 || 99; }
// a different cultivar in a later list is a possible substitution / version change, never silently the same plant
function aliasNote(sp) {
  if (!sp.aliases || !sp.aliases.length) return '';
  const syn = sp.aliases.filter((a) => !/\(2026 list\)/.test(a)), sub = sp.aliases.filter((a) => /\(2026 list\)/.test(a));
  return (syn.length ? `<p class="note">Same plant, other spelling: ${syn.map(esc).join('; ')}</p>` : '') +
    (sub.length ? `<p class="note">The Feb 2026 plant list has <b>${sub.map((a) => esc(a.replace(' (2026 list)', ''))).join('; ')}</b> instead — a different cultivar (possible substitution or version change), not a synonym. The model keeps the 2019/2020 plan name.</p>` : '');
}

export function renderInspector(store, sel, ctx) {
  const el = document.getElementById('inspector');
  if (!sel) { el.hidden = true; el.innerHTML = ''; return; }
  document.getElementById('about').hidden = true;
  const o = store.getObject(sel.id);
  if (!o) { el.hidden = true; return; }
  const kind = store.kindOf(sel.id);
  const crumbs = [];
  let title = '', what = '', fact = '', body = '', status = o.status, cond = '', canCond = false;
  const data = []; // ids, files and machine detail: only under Details › Data & sources
  const crumbFor = (id) => { const r = store.getObject(id); return r ? { id, label: r.name || r.id.replace('bed.', 'Bed ') } : null; };
  if (sel.point) {
    title = 'Point on the site'; what = 'Conditions at this point'; status = null;
  } else if (kind === 'instance') {
    const sp = store.getObject(o.speciesId); const pl = o.placementId ? store.getObject(o.placementId) : null;
    if (o.bedId) { const b = store.getObject(o.bedId); crumbs.push(crumbFor(b.id)); }
    if (pl) crumbs.push({ id: pl.id, label: `${ROLE_LABEL[pl.role] || pl.role} patch` });
    title = sp.scientificName + (sp.cultivar ? ` ‘${sp.cultivar}’` : '');
    what = pl ? `Plant symbol · ${sp.plantType}` : 'Existing tree · species unknown';
    fact = `${fmt(sp.nominalHeightM * o.scale, 1)} m tall (nominal)`;
    body += sec('Plant', kv([
      ['Species', spName(sp)], ['Plant type', esc(sp.plantType)], ['Drawn as', `${esc(sp.formProxy)} form <span class="unk">inferred</span>`],
      ['Display height', `${fmt(sp.nominalHeightM * o.scale, 2)} m <span class="unk">nominal, not measured</span>`], ['Elevation', `${fmt(o.elevation, 2)} m`],
    ]) + `<p class="note">A plant symbol stands for about 2–3 real perennials (8 bulbs, 1 woody plant). It is not a surveyed plant.</p>` + aliasNote(sp));
    data.push(['Symbol id', `<span class="mono">${esc(o.id)}</span>`], ['Position (m)', `<span class="mono">${o.position[0]}, ${o.position[1]}</span>`], ['Position from', esc(o.positionSource)]);
    if (pl) data.push(['Patch id', `<span class="mono">${esc(pl.id)}</span>`], ['Mix', esc(pl.recipeId || '—')]);
  } else if (kind === 'placement') {
    const b = o.bedId ? store.getObject(o.bedId) : null;
    if (b) crumbs.push(crumbFor(b.id));
    const sps = (o.speciesIds || []).map((s) => store.getObject(s));
    const rows = store.instancesOfPlacement(o.id);
    title = sps.length ? sps.map((s) => s.scientificName + (s.cultivar ? ` ‘${s.cultivar}’` : '')).join(' + ') : 'Species not published';
    what = `${(ROLE_LABEL[o.role] || o.role).replace(/^./, (c) => c.toUpperCase())} ${o.kind === 'point' ? 'position' : 'patch'}${b ? ' in ' + (b.name || b.id) : ''}`;
    fact = o.areaM2 != null ? `${fmt(o.areaM2)} m² · ${rows.length} plant symbols` : `${rows.length} plant symbol${rows.length === 1 ? '' : 's'}`;
    body += sec('Patch', kv([
      ['Role in the mix', esc(ROLE_LABEL[o.role] || o.role)], ['Legend code', o.legendCode ? esc(o.legendCode) : '<span class="unk">none</span>'],
      ['Area', o.areaM2 != null ? `${fmt(o.areaM2)} m²` : '—'],
      ['Real plants', o.countEstimatedReal != null ? fmt(o.countEstimatedReal, 0) : '<span class="unk">not published</span>'],
      ['Plant symbols', rows.length.toLocaleString()],
      ...(o.replaced ? [['Replaced', `${o.replaced.speciesIds.map((id) => { const r = store.getObject(id); return r ? spName(r) : esc(id); }).join(' + ')}${o.replaced.legendCode ? ` (legend “${esc(o.replaced.legendCode)}”)` : ''} <span class="unk">in this working design</span>`]] : []),
    ]) + `<p class="note">${esc(o.countBasis || '')}${o.note ? ' ' + esc(o.note) : ''}${o.bloomNote ? ' ' + esc(o.bloomNote) : ''}</p>`);
    if (sps.length) body += sec('Species', `<ul class="splist">${sps.map((s) => `<li><span class="swatch" style="background:${speciesPlanColor(s)}"></span><span>${spName(s)}</span><span class="role">${esc(s.plantType)}</span></li>`).join('')}</ul>`);
    data.push(['Patch id', `<span class="mono">${esc(o.id)}</span>`], ['Geometry', esc(o.kind) + (o.geometryRef ? ` (= ${esc(o.geometryRef)})` : '')], ['Mix', esc(o.recipeId || '—')], ['Position from', esc(o.positionSource)]);
    if (ctx.dev && store.scenario === 'working') body += devEditor(store, o);
  } else {
    if (o.parent) { const p = store.getObject(o.parent); if (p && p.type !== 'site') crumbs.push(crumbFor(p.id)); }
    title = o.name || o.id;
    const P = o.props || {};
    what = o.type === 'bed' ? `Bed · ${P.styleName || ''}${P.style && 'ABC'.includes(P.style) ? ` (${P.style})` : ''}` : TYPE_LABEL[o.type] || o.type;
    const rows = [];
    if (o.type === 'bed') {
      fact = `${fmt(P.areaM2)} m²${P.originalCode ? ` · code ${esc(P.originalCode)}` : ''}`;
      rows.push(['Planting style', `${esc(P.styleName)}${P.style && 'ABC'.includes(P.style) ? ` (${P.style})` : ''}`]);
      rows.push(['Original code', P.originalCode ? `<b>${esc(P.originalCode)}</b>` : '<span class="unk">none published</span>']);
      if (P.column) rows.push(['Position', `column ${P.column} of 8 (west to east), ${P.row === 'N' ? 'north' : 'south'} row`]);
      rows.push(['Area', `${fmt(P.areaM2)} m²`]);
      if (P.osm) data.push(['Outline', `OpenStreetMap ${esc(P.osm)}`]);
    } else {
      for (const [k, v] of Object.entries(P)) { if (v == null || typeof v === 'object' || k === 'note' || k === 'codeNote') continue; rows.push([k.replace(/([A-Z])/g, ' $1').toLowerCase(), esc(v)]); }
    }
    data.push(['Id', `<span class="mono">${esc(o.id)}</span>`]);
    if (rows.length || P.note || P.codeNote) body += sec(o.type === 'bed' ? 'Bed' : 'Properties', kv(rows) + (P.codeNote ? `<p class="note">${esc(P.codeNote)}</p>` : '') + (P.note ? `<p class="note">${esc(P.note)}</p>` : ''));
    if (o.type === 'bed' && ctx.cs && ctx.cs.designBeds().some((b) => b.id === o.id)) {
      const D = ctx.cs.distribution(o.id, { fields: ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.distance-to-edge'] });
      if (D.ok) {
        const F = D.fields; const r = (f, d, u) => (f.known ? `${fmt(f.min, d)}–${fmt(f.max, d)}${u}` : '<span class="unk">no data</span>');
        cond = `Elevation ${r(F['field.elevation'], 2, ' m')} · slope ${r(F['field.slope'], 1, '°')} · ${r(F['field.distance-to-path'], 1, ' m')} to path`;
        canCond = true;
        const row = (f, d, u) => `<tr><th>${esc(f.name)}</th><td>${f.known ? `${fmt(f.min, d)}` : '—'}</td><td>${f.known ? fmt(f.p50, d) : '—'}</td><td>${f.known ? fmt(f.max, d) : '—'}${f.known ? esc(u) : ''}${f.uniform ? ' <span class="unk">uniform</span>' : ''}</td></tr>`;
        body += sec('Conditions in this bed', `<table class="dist"><thead><tr><th></th><th>min</th><th>median</th><th>max</th></tr></thead><tbody>${row(F['field.elevation'], 2, ' m')}${row(F['field.slope'], 1, '°')}${row(F['field.distance-to-path'], 1, ' m')}${row(F['field.distance-to-edge'], 1, ' m')}</tbody></table><p class="note">Over the whole bed, area-weighted on the 1 m terrain grid (${D.cells} cells) — not a single centre point. Sun, soil moisture and pH: no data.</p>`);
      }
    }
    if (o.type === 'bed' && P.style !== 'M') {
      const ctxp = store.getPlantingContext(o.id);
      const pls = store.placementsByBed.get(o.id) || [];
      const bySp = new Map();
      for (const p of pls) for (const s of p.speciesIds || []) { const k = s + '|' + p.role; bySp.set(k, (bySp.get(k) || 0) + 1); }
      const items = [...bySp.entries()].map(([k, n]) => { const [s, role] = k.split('|'); return { sp: store.getObject(s), role, n }; }).sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || b.n - a.n);
      fact += ` · ${ctxp.placementCount ? `${ctxp.placementCount} patches` : 'empty, open for planting'}`;
      body += sec(`Planting in this bed (${store.scenario === 'working' ? 'working design' : 'reference'})`, (items.length ? `<ul class="splist">${items.slice(0, 60).map((it) => `<li><span class="swatch" style="background:${speciesPlanColor(it.sp)}"></span><span>${spName(it.sp)}</span><span class="role">${esc(ROLE_LABEL[it.role] || it.role)}${it.n > 1 ? ' ×' + it.n : ''}</span></li>`).join('')}</ul>` : '<p class="note">Empty in this working design — open for planting.</p>') +
        (store.scenario === 'reference' ? '<p class="note">Species and roles come from the legends of this style (2019 plans, 2020 bulb plans). Where each patch sits is generated, not traced.</p>' : ''));
      const stt = store.model.project.officialStatistics.mainGardenByStyle[P.style];
      if (stt && store.scenario === 'reference') body += sec('Published counts for the whole style', kv([['Style total', `${fmt(stt.plants, 0)} plants, ${stt.varieties} varieties`], ['Forbs / grasses', `${fmt(stt.forbs, 0)} / ${fmt(stt.grasses, 0)}`], ['Bulbs', fmt(stt.bulbs, 0)], ['As of', 'March 2023']]) + '<p class="note">Published per style, not per bed.</p>');
    }
  }
  if (sel.at) {
    const c = store.sampleConditions(sel.at[0], sel.at[1]);
    const v = (k, d = 2) => (c[k].value == null ? '<span class="unk">no data</span>' : `${fmt(c[k].value, d)} ${esc(c[k].units)}`);
    const pa = c.constraints.plantable;
    body += sec('Conditions here', kv([['Elevation', v('field.elevation')], ['Slope', v('field.slope', 1)], ['To nearest path', v('field.distance-to-path')], ['Sun / shade', v('field.sun')], ['Soil moisture', v('field.moisture')], ['Soil pH', v('field.ph')], ['Plantable', pa.value ? `yes${pa.editLocked ? ' (locked for editing)' : ''}` : `no <span class="unk">${esc(pa.reason)}</span>`], ['Overlapping patches', String(c.placements.length)]]));
    data.push(['Clicked at (m)', `<span class="mono">${sel.at[0]}, ${sel.at[1]}</span>`]);
  }
  const srcs = (kind === 'instance' ? (store.getObject(o.placementId)?.sourceRefs || ['S-NAIP']) : o.sourceRefs || []).map((s) => store.getObject(s)).filter(Boolean);
  body += sec('Data & sources', kv(data) + (srcs.length ? `<ul class="src">${srcs.map((s) => `<li>${s.url && /^https?:/.test(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</li>`).join('')}</ul>` : '') +
    `<div class="row"><button class="btn" data-act="json">Copy JSON</button></div>`, 'data');
  const design = store.scenario === 'working' ? '<span class="badge draftb">Working design</span>' : '<span class="badge refb">Reference</span>';
  const ev = status ? `<span class="badge ${esc(status)}" title="How certain this is">${esc(STATUS_LABEL[status] || status)}</span>` : '';
  const cr = crumbs.filter(Boolean).map((c) => `<button data-id="${esc(c.id)}">${esc(c.label)}</button>`).join('<span class="sep">›</span>');
  const open = !!ctx.st.inspectorOpen;
  el.classList.toggle('compact', !open);
  el.innerHTML = `<div class="ins-h"><button class="ins-x" aria-label="Clear selection" title="Clear selection (Esc)"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>${cr ? `<div class="crumbs">${cr}</div>` : ''}<div class="ins-title">${esc(title)}</div><div class="ins-sub">${esc(what)}${fact ? `<span class="fact">${fact}</span>` : ''}</div>${cond ? `<p class="ins-cond">${cond}</p>` : ''}<div class="badges">${design}${ev}</div>
    <div class="actions">${canCond ? '<button class="btn primary" data-act="cond" title="Fields and zones inside this bed (C)">Conditions</button>' : ''}<button class="btn" data-act="more" aria-expanded="${open}">${open ? 'Less' : 'Details'}</button><button class="btn" data-act="focus">Zoom to</button>${kind !== 'object' || (o.type !== 'site' && o.parent) ? '<button class="btn" data-act="up" title="Select what contains it (Backspace)">Up</button>' : ''}</div></div>
    <div class="ins-body">${body}</div>`;
  el.hidden = false;
  el.querySelector('.ins-x').onclick = () => store.select(null);
  el.querySelectorAll('.crumbs button').forEach((b) => (b.onclick = () => store.select({ id: b.dataset.id })));
  el.querySelector('[data-act="more"]').onclick = () => { ctx.st.inspectorOpen = !open; renderInspector(store, sel, ctx); };
  el.querySelector('[data-act="focus"]').onclick = () => (ctx.st.view === 'plan' ? ctx.plan.focus(sel.id) : ctx.scene.focus(sel.id));
  el.querySelector('[data-act="json"]').onclick = async (e) => {
    const rec = kind === 'object' && o.type === 'bed' ? { ...o, plantingContext: store.getPlantingContext(o.id) } : o;
    try { await navigator.clipboard.writeText(JSON.stringify(rec, null, 2)); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Copy failed'; }
  };
  const up = el.querySelector('[data-act="up"]'); if (up) up.onclick = () => ctx.picker.up();
  const cb = el.querySelector('[data-act="cond"]'); if (cb) cb.onclick = () => ctx.openConditions([o.id]);
  el.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => devAction(store, o, b.dataset.dev, el)));
}
// developer test entry (?dev=1, working design only): exercises the same validated patch API an AI client would use
function devEditor(store, o) {
  const same = store.model.species.filter((s) => s.plantType !== 'tree' && s.plantType !== 'bulb').sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  return sec('Developer test · patch API', `<label class="small">Replace species <select data-sel>${same.map((s) => `<option value="${s.id}" ${o.speciesIds[0] === s.id ? 'selected' : ''}>${esc(s.scientificName)}${s.cultivar ? ' ‘' + esc(s.cultivar) + '’' : ''}</option>`).join('')}</select></label>
    <div class="row"><button class="btn" data-dev="replace">Apply</button><button class="btn" data-dev="remove">Remove patch</button></div><p class="note" data-out></p>`);
}
function devAction(store, o, a, el) {
  const out = el.querySelector('[data-out]');
  const r = a === 'replace' ? store.applyPatch([{ op: 'replaceSpecies', target: o.id, speciesIds: [el.querySelector('[data-sel]').value] }]) : store.applyPatch([{ op: 'remove', target: o.id }]);
  if (out) out.textContent = r.ok ? `ok · ${JSON.stringify(r.changes)}` : r.errors.map((e) => e.message).join('; ');
}

// site sheet: what this preset is, how certain each part is, credits, and how other parts of the tool connect
export function renderAbout(store, preset) {
  const P = store.baseline.project; const el = document.getElementById('about');
  const st = P.officialStatistics;
  el.innerHTML = `<button class="ins-x" aria-label="Close"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>
  <h3>${esc(preset.name)}</h3>
  <p class="lede">${esc(preset.location)}. Site preset for <b>Site setup</b>, the spatial input of Generative Planting: the site, its terrain and bed framework, and the planting you start from.</p>
  <table><tr><th>What</th><th>How certain</th></tr>
  <tr><td>Bed outlines, paths, walls, water, buildings (OpenStreetMap, checked on USGS aerial)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Bed codes A1–A4, B1–B5, C1–C4 and the style of each bed (Oudolf 2019/2020 plans)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Species of each style and their role in the mix</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Terrain, USGS 3DEP 1 m (3D relief drawn ×1.6)</td><td><span class="badge documented">Documented</span></td></tr>
  <tr><td>Existing tree crowns, digitised from USGS NAIP; species unknown</td><td><span class="badge reconstructed">Reconstructed</span></td></tr>
  <tr><td>Patch shapes and plant positions inside beds; meadow outlines</td><td><span class="badge schematic">Schematic</span></td></tr>
  <tr><td>Sun, soil moisture, pH</td><td><span class="badge unknown">Unknown</span></td></tr></table>
  <p><b>Reference</b> is the original planting reconstructed from the published plans and kept read-only. A <b>working design</b> starts from the reference or from empty beds; the reference never changes.</p>
  <p><b>Dates.</b> ${esc(P.reconstructionEpoch.description)} Published counts (March 2023): Main Garden ${st.site['Main Garden'].plants.toLocaleString()} plants, ${st.site['Main Garden'].varieties} varieties.</p>
  <p><b>Credits.</b> ${P.attribution.map(esc).join(' · ')}. Planting design © Piet Oudolf; the plans and lists are cited, not reproduced. Map data © OpenStreetMap contributors (ODbL).</p>
  <details><summary>For developers</summary><p class="note">Coordinates ${esc(P.coordinateSystem.id)}: metres, x east, y north, origin ${P.coordinateSystem.origin.lat}, ${P.coordinateSystem.origin.lon}; elevation NAVD88. <span class="mono">window.GP</span> exposes queries, patches and view control; embedded, the same calls work over <span class="mono">postMessage</span>. See <a href="docs/MODEL_CONTRACT.md">MODEL_CONTRACT.md</a>, data <a href="${esc(preset.base)}model.json">model.json</a>.</p></details>`;
  el.querySelector('.ins-x').onclick = () => (el.hidden = true);
}
