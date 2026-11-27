// Design workspace UI: Mix palette (left), brushes in the canvas toolbar, a contextual panel (right: mix, space, plant,
// feedback), a status chip and an operations drawer. Every action goes through DesignOps (the same interface an AI uses).
import { TOK, rgba, mix as mixColor, tracePoly, traceLine, speciesPlanColor, SANS } from '../style.js';
import { smoothLine, ringFrom, clean, area, centroid, bboxOf, pointInGeom, union, diff } from './geo.js';
import { feedback, season, compareReference } from './feedback.js';
import { describeMix, SYSTEMS, BASIS, LAYERS, ARRANGEMENTS, changeMix } from './mixes.js';
import { REASONS } from './engine.js';
import { EXPOSURE_OPTIONS, HYDRO } from './library.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (v) => (v == null ? '—' : Math.round(v * 100) + ' %');
const n0 = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const f2 = (v) => (v == null ? '—' : (+v).toFixed(2));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TOOLS = [
  { id: 'select', key: 'v', label: 'Select', tip: 'Select and inspect (V)', icon: '<path d="M5 3l10 6-4.5 1.3L13 16l-2 1-2.4-5.6L5 14z" fill="currentColor"/>' },
  { id: 'fill', key: 'b', label: 'Fill', tip: 'Fill beds with the mix — click a bed, Shift-click several (B)', icon: '<path d="M4 9l6-6 6 6-6 6z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 9h12l-6 6z" fill="currentColor" opacity=".55"/><path d="M16.5 12.5c0 1-1.2 2-1.2 3a1.2 1.2 0 0 0 2.4 0c0-1-1.2-2-1.2-3z" fill="currentColor"/>' },
  { id: 'area', key: 'a', label: 'Area', tip: 'Paint any area — drag around it (A)', icon: '<path d="M4 12c-1-4 3-8 7-7s6 4 4 7-6 5-8 4-3-2-3-4z" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="1.3"/>' },
  { id: 'line', key: 'r', label: 'Curve', tip: 'Plant along a curve — drag the line (R)', icon: '<path d="M3 15c3-8 6 0 9-6s4-4 5-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { id: 'point', key: 'p', label: 'Point', tip: 'Place a small group — click (P)', icon: '<circle cx="10" cy="10" r="2.2" fill="currentColor"/><circle cx="6" cy="7" r="1.5" fill="currentColor" opacity=".6"/><circle cx="14" cy="7.5" r="1.5" fill="currentColor" opacity=".6"/><circle cx="12" cy="14" r="1.5" fill="currentColor" opacity=".6"/>' },
  { id: 'erase', key: 'x', label: 'Erase', tip: 'Erase an area, or click a space to remove it (X)', icon: '<path d="M4 13l6-7 6 5-5 5H7z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 16h8" stroke="currentColor" stroke-width="1.4"/>' },
  { id: 'keep', key: 'k', label: 'Keep', tip: 'Keep (freeze) what is inside an area, or click a space to freeze it (K)', icon: '<rect x="5" y="9" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7.5 9V6.8a2.5 2.5 0 0 1 5 0V9" fill="none" stroke="currentColor" stroke-width="1.4"/>' },
];
const ICO = (p, s = 16) => `<svg viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true">${p}</svg>`;

export function createDesignUI(ctx) {
  const { store, plan, scene, doc, dops, library, app, st } = ctx;
  const ui = { mixId: null, tool: 'select', colorBy: 'mix', beds: [], hoverBed: null, stroke: null, lineW: 2, lineMode: 'drifts', pointCount: 5, pointRole: '', panel: null, month: null, preview: null, fb: null, comp: null, pending: null, editMixId: null, busy: false, msg: '' };
  ctx.designUI = ui; store.view.colorBy = ui.colorBy;
  // ---------------------------------------------------------------- DOM
  const pal = el('aside', { id: 'palette', className: 'd-palette', hidden: true, 'aria-label': 'Planting mixes' }); app.appendChild(pal);
  const panel = el('aside', { id: 'dpanel', className: 'd-panel', hidden: true, 'aria-label': 'Design properties' }); app.appendChild(panel);
  const hint = el('div', { id: 'dhint', className: 'd-hint', hidden: true }); app.appendChild(hint);
  const chip = el('button', { id: 'dchip', className: 'd-chip', hidden: true, title: 'Feedback: numbers, proportions, unfilled space, season' }); app.appendChild(chip);
  const drawer = el('section', { id: 'ddrawer', className: 'd-drawer', hidden: true, 'aria-label': 'Design operations' }); app.appendChild(drawer);
  const ink = el('canvas', { id: 'dink', className: 'd-ink' }); app.appendChild(ink);
  const toast = el('div', { id: 'dtoast', className: 'd-toast', hidden: true, role: 'status' }); app.appendChild(toast);
  // toolbar: brushes between the view switch and Layers
  const tb = $('.toolbar'); const tgroup = el('div', { className: 'd-tools', role: 'radiogroup', 'aria-label': 'Brushes' });
  tgroup.innerHTML = TOOLS.map((t) => `<button class="tool d-tool" role="radio" data-tool="${t.id}" aria-checked="false" title="${esc(t.tip)}">${ICO(t.icon)}<span>${t.label}</span></button>`).join('');
  tb.insertBefore(tgroup, $('#btnLayers'));
  tgroup.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  // bar: undo / redo, feedback, operations
  const bar = el('div', { className: 'd-bar' });
  bar.innerHTML = `<button class="icon" id="dUndo" title="Undo (⌘Z)" aria-label="Undo">${ICO('<path d="M7 5L3 9l4 4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 9H12a4.5 4.5 0 0 1 0 9H9" fill="none" stroke="currentColor" stroke-width="1.5"/>')}</button>
    <button class="icon" id="dRedo" title="Redo (⇧⌘Z)" aria-label="Redo">${ICO('<path d="M13 5l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M16.5 9H8a4.5 4.5 0 0 0 0 9h3" fill="none" stroke="currentColor" stroke-width="1.5"/>')}</button>
    <button class="d-tb" id="dFeedback" aria-pressed="false">Feedback</button>
    <button class="d-tb" id="dOps" aria-pressed="false" title="Describe a change, or run structured design operations">Ask · Operate</button>`;
  $('#design').insertBefore(bar, $('#design').firstChild);
  $('#dUndo').onclick = () => undo(); $('#dRedo').onclick = () => redo();
  $('#dFeedback').onclick = () => openPanel(ui.panel === 'feedback' ? null : 'feedback');
  $('#dOps').onclick = () => toggleDrawer();
  chip.onclick = () => openPanel('feedback');

  // ---------------------------------------------------------------- state helpers
  const designing = () => st.design === 'working' && doc.active();
  const mixes = () => (doc.state ? doc.state.mixes : (ctx.mixFile && ctx.mixFile.mixes) || []);
  const curMix = () => mixes().find((m) => m.id === ui.mixId) || mixes().find((m) => m.status === 'executable') || mixes()[0];
  const spName = (id) => { const s = store.getObject(id); return s ? s.scientificName + (s.cultivar ? ` ‘${s.cultivar}’` : '') : id; };
  const spShort = (id) => { const s = store.getObject(id); if (!s) return id; const g = s.scientificName.split(' '); return (g.length > 1 ? g[0][0] + '. ' + g.slice(1).join(' ') : g[0]) + (s.cultivar ? ` ‘${s.cultivar}’` : ''); };
  function say(t, ms = 2600) { toast.textContent = t; toast.hidden = false; clearTimeout(say._t); say._t = setTimeout(() => { toast.hidden = true; }, ms); }
  function refreshNumbers() { if (!doc.active()) { ui.fb = null; ui.comp = null; return; } ui.comp = doc.compose(); ui.fb = feedback(doc, ui.comp); }

  // run operations: the mouse tools use exactly the interface an AI client uses
  function run(ops, label) {
    if (!doc.active()) { say('Start a working design first.'); return null; }
    ui.busy = true; app.classList.add('d-busy'); renderChip('Computing…');
    let r; const keepSel = selectedAssignment(); const selBed = keepSel && store.selection ? (store.getObject(store.selection.id) || {}).bedId : null;
    try { r = ctx.api.design.run(ops, { label }); } catch (e) { console.error(e); r = { ok: false, errors: [{ message: String(e.message || e) }] }; }
    ui.busy = false; app.classList.remove('d-busy');
    if (!r.ok) say('Not applied: ' + r.errors.map((e) => e.message).join('; '), 5200);
    else { const t = ui.fb ? ui.fb.totals : null; say(`${r.said.join(' · ')}${t ? ` — ${n0(t.perennials)} perennials + ${n0(t.bulbs)} bulbs in the design` : ''}`); }
    // the placement of a regenerated space gets a new id: keep the same space selected so its card stays open
    if (r.ok && keepSel && doc.state.assignments.some((a) => a.id === keepSel.id)) { const pl = store.model.placements.filter((p) => p.assignmentId === keepSel.id); const pick = pl.find((p) => p.bedId === selBed) || pl[0]; if (pick) store.select({ id: pick.id }); }
    return r;
  }
  function undo() { const r = doc.undo(); if (!r.ok) say(r.error); else say('Undone'); }
  function redo() { const r = doc.redo(); if (!r.ok) say(r.error); else say('Redone'); }

  // ---------------------------------------------------------------- palette
  function renderPalette() {
    pal.hidden = !designing();
    if (pal.hidden) return;
    const fbm = new Map((ui.fb ? ui.fb.mixes : []).map((m) => [m.id, m]));
    const cur = curMix(); if (cur) ui.mixId = cur.id;
    pal.innerHTML = `<div class="d-ph"><h2>Mixes</h2><button class="d-tb" data-a="new" title="Create a new mix">New</button></div>
      <div class="d-mixes" role="radiogroup" aria-label="Active mix">${mixes().map((m) => { const d = describeMix(m); const f = fbm.get(m.id);
        return `<div class="d-mix${m.id === ui.mixId ? ' on' : ''}" role="radio" tabindex="0" aria-checked="${m.id === ui.mixId}" data-mix="${esc(m.id)}" style="--c:${m.color}">
          <span class="d-sw" aria-hidden="true"></span>
          <span class="d-mt"><b>${esc(m.name)}</b><span class="d-ms">${esc(SYSTEMS[m.system] || m.system)} · v${m.version}${m.status === 'template' ? ' · <em>template</em>' : ''}</span>
          <span class="d-bars" aria-hidden="true">${d.roles.filter((r) => r.layer === 'base').map((r) => `<i style="flex:${r.value}"></i>`).join('')}${d.roles.filter((r) => r.layer !== 'base').map(() => '<i class="o"></i>').join('')}</span>
          ${f ? `<span class="d-mu">${n0(f.perennials)} plants · ${n0(f.areaM2)} m²</span>` : ''}</span>
          <button class="d-ed" data-edit="${esc(m.id)}" title="Edit mix" aria-label="Edit ${esc(m.name)}">${ICO('<path d="M4 14.5V16h1.5l8-8-1.5-1.5-8 8zM14.2 5.3l1.5 1.5 1-1-1.5-1.5z" fill="currentColor"/>', 14)}</button></div>`; }).join('')}</div>
      <div class="d-pf"><p>${ui.tool === 'select' ? 'Pick a mix to start painting.' : `Painting with <b>${esc(curMix().name)}</b>.`}</p>
        <div class="d-cb" role="radiogroup" aria-label="Colour the plants by"><span>Plants by</span>${[['species', 'species'], ['mix', 'mix'], ['hydrology', 'water']].map(([k, l]) => `<button role="radio" aria-checked="${ui.colorBy === k}" data-cb="${k}" title="${k === 'hydrology' ? 'Hydrology zone of the species (official meadow lists or your record): dry · moist · wet; grey = unknown' : 'Colour the plants by ' + l}">${l}</button>`).join('')}</div>
        ${ui.colorBy === 'hydrology' ? '<p class="d-key"><i style="--c:#C9A24E"></i>dry <i style="--c:#7FA36B"></i>moist <i style="--c:#4F7FA6"></i>wet <i style="--c:#C9C4B6"></i>unknown</p>' : ''}</div>`;
    pal.querySelectorAll('[data-mix]').forEach((e) => { const pickIt = () => { ui.mixId = e.dataset.mix; if (ui.tool === 'select') setTool('fill'); renderPalette(); renderHint(); }; e.addEventListener('click', (ev) => { if (ev.target.closest('[data-edit]')) return; pickIt(); }); e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pickIt(); } }); e.addEventListener('dblclick', () => openMixEditor(e.dataset.mix)); });
    pal.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openMixEditor(b.dataset.edit)));
    pal.querySelectorAll('[data-cb]').forEach((b) => b.addEventListener('click', () => setColorBy(b.dataset.cb)));
    pal.querySelector('[data-a=new]').onclick = () => { const r = run([{ op: 'createMix', name: 'My mix', system: 'custom' }]); if (r && r.ok) { ui.mixId = r.mixes[0]; openMixEditor(r.mixes[0]); } };
  }

  // ---------------------------------------------------------------- tools
  function setTool(t) {
    if (!designing() && t !== 'select') { say('Brushes paint the working design: start one first.'); return; }
    ui.tool = t; ui.stroke = null; if (t !== 'fill') ui.beds = [];
    tgroup.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === t)));
    const tool = t === 'select' ? null : toolHandler;
    plan.tool = tool; if (scene) scene.setTool(tool);
    app.dataset.tool = t; renderHint(); renderPalette(); plan.request();
  }
  const toolHandler = {
    down(x, y, e) { if (x == null) return; ui.stroke = { pts: [[x, y]], shift: e.shiftKey, t0: performance.now() }; },
    move(x, y) { if (!ui.stroke || x == null) return; const p = ui.stroke.pts; const q = p[p.length - 1]; if (Math.hypot(q[0] - x, q[1] - y) > 0.2) p.push([x, y]); drawInk(); },
    up(x, y, e) {
      const s = ui.stroke; ui.stroke = null; clearInk(); if (!s) return;
      const pts = s.pts; if (x != null) pts.push([x, y]);
      const len = pts.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
      const click = len < 0.6;
      const m = curMix();
      if (ui.tool === 'fill') {
        const b = bedAt(pts[0][0], pts[0][1]); if (!b) { say('Click inside a planting bed.'); return; }
        if (s.shift || e.shiftKey) { ui.beds = ui.beds.includes(b.id) ? ui.beds.filter((q) => q !== b.id) : [...ui.beds, b.id]; renderHint(); plan.request(); return; }
        if (ui.beds.length) { const beds = ui.beds.includes(b.id) ? ui.beds : [...ui.beds, b.id]; ui.beds = []; run([{ op: 'fill', beds, mix: m.id }]); renderHint(); return; }
        run([{ op: 'fill', beds: [b.id], mix: m.id }]); return;
      }
      if (ui.tool === 'point') { run([{ op: 'point', at: [+pts[0][0].toFixed(3), +pts[0][1].toFixed(3)], mix: m.id, count: ui.pointCount, ...(ui.pointRole ? { roleId: ui.pointRole } : {}) }]); return; }
      if ((ui.tool === 'erase' || ui.tool === 'keep') && click) {
        const a = assignmentAt(pts[0][0], pts[0][1]); if (!a) { say('Drag around an area, or click a painted space.'); return; }
        if (ui.tool === 'erase') run([{ op: 'remove', assignment: a.id }], 'remove ' + a.label);
        else if (a.type === 'keep') run([{ op: 'remove', assignment: a.id }], 'release kept area');
        else run([{ op: 'freeze', assignment: a.id, on: !a.frozen }]);
        return;
      }
      if (ui.tool === 'line') { if (len < 1) { say('Drag a longer curve.'); return; } const c = smoothLine(pts, { step: 0.5 }); run([{ op: 'line', coordinates: c, widthM: ui.lineW, mode: ui.lineMode, mix: m.id }]); return; }
      if (['area', 'erase', 'keep'].includes(ui.tool)) {
        if (click) { say('Drag a loop around the area, or drag across it for a rectangle.'); return; }
        let g = pts.length >= 3 ? clean(ringFrom(smoothLine(pts, { step: 0.35, iterations: 1 }))) : null;
        const a0 = pts[0], a1 = pts[pts.length - 1];
        if ((!g || area(g) < 0.15 * len * len / 4) && Math.abs(a1[0] - a0[0]) > 0.5 && Math.abs(a1[1] - a0[1]) > 0.5) g = ringFrom([[a0[0], a0[1]], [a1[0], a0[1]], [a1[0], a1[1]], [a0[0], a1[1]]]); // a straight drag → its rectangle
        if (!g || area(g) < 0.5) { say('That area is under 0.5 m²: drag a larger loop, or across the area for a rectangle.'); return; }
        if (ui.tool === 'area') run([{ op: 'paint', geometry: g, mix: m.id }]);
        else if (ui.tool === 'erase') run([{ op: 'erase', geometry: g }]);
        else run([{ op: 'keep', geometry: g }]);
      }
    },
    hover(x, y) { if (ui.tool === 'fill') { const b = bedAt(x, y); const id = b ? b.id : null; if (id !== ui.hoverBed) { ui.hoverBed = id; plan.request(); } } },
  };
  const bedAt = (x, y) => { const b = store.getBedAt(x, y); return b && ctx.cs.designBeds().some((q) => q.id === b.id) ? b : null; };
  function assignmentAt(x, y) {
    if (!ui.comp) refreshNumbers(); if (!ui.comp) return null;
    const list = ui.comp.assignments.slice().sort((a, b) => b.rank - a.rank);
    for (const c of list) for (const p of c.parts) if (pointInGeom(p.geometry, x, y)) return c.a;
    return null;
  }
  function renderHint() {
    hint.hidden = !designing() || ui.tool === 'select';
    if (hint.hidden) return;
    const m = curMix(); const sw = m ? `<span class="d-dot" style="--c:${m.color}"></span><b>${esc(m.name)}</b>` : '';
    let h = '';
    if (ui.tool === 'fill') h = ui.beds.length ? `${sw} · ${ui.beds.length} bed${ui.beds.length === 1 ? '' : 's'} selected <button class="btn primary small" data-a="fillsel">Fill ${ui.beds.map((b) => b.replace('bed.', '')).join(', ')}</button> <button class="lnk" data-a="clearsel">Clear</button>` : `${sw} · click a bed · Shift-click several · <button class="lnk" data-a="fillmain">Fill all 15 main beds</button>`;
    else if (ui.tool === 'area') h = `${sw} · drag around any area; paths inside it stay unplanted`;
    else if (ui.tool === 'line') h = `${sw} · drag a curve · width <input type="range" min="0.8" max="8" step="0.2" value="${ui.lineW}" data-k="lineW" aria-label="Band width"> <span class="num">${ui.lineW} m</span> · <select data-k="lineMode" aria-label="Arrangement along the curve"><option value="drifts"${ui.lineMode === 'drifts' ? ' selected' : ''}>drifts</option><option value="rows"${ui.lineMode === 'rows' ? ' selected' : ''}>rows</option></select>`;
    else if (ui.tool === 'point') h = `${sw} · click to place <select data-k="pointCount" aria-label="Plants per group">${[1, 3, 5, 7, 9, 12].map((k) => `<option${k === ui.pointCount ? ' selected' : ''}>${k}</option>`).join('')}</select> plants of <select data-k="pointRole" aria-label="Role"><option value="">${esc((m.roles.find((r) => r.layer === 'overlay') || m.roles[0]).name)}</option>${m.roles.map((r) => `<option value="${esc(r.id)}"${ui.pointRole === r.id ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`;
    else if (ui.tool === 'erase') h = 'Drag around an area to empty it (design plants and the existing planting there) · click a painted space to remove it';
    else if (ui.tool === 'keep') h = 'Drag around planting you are happy with to keep it as it is · click a space to freeze / unfreeze it';
    hint.innerHTML = h + ' <span class="d-hk">Pan: right-drag, or Space + drag</span>';
    hint.querySelector('[data-a=fillsel]')?.addEventListener('click', () => { const beds = ui.beds; ui.beds = []; run([{ op: 'fill', beds, mix: curMix().id }]); renderHint(); });
    hint.querySelector('[data-a=clearsel]')?.addEventListener('click', () => { ui.beds = []; renderHint(); plan.request(); });
    hint.querySelector('[data-a=fillmain]')?.addEventListener('click', () => run([{ op: 'fill', beds: 'main', mix: curMix().id }]));
    hint.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('input', () => { const k = i.dataset.k; ui[k] = k === 'lineW' || k === 'pointCount' ? +i.value : i.value; if (k === 'lineW') i.nextElementSibling.textContent = ui.lineW + ' m'; }));
  }

  // ---------------------------------------------------------------- plan decoration (spaces, selection, strokes, unfilled, preview)
  plan.decor = (g, T, sc) => {
    if (!designing()) return;
    const m = curMix();
    // open (unfilled) bed area of a blank design: fine hatch
    if (ui.fb && ui.fb.open.length) for (const o of ui.fb.open) { g.save(); g.beginPath(); tracePoly(g, o.geometry, T); g.clip('evenodd'); g.strokeStyle = rgba(TOK.ink, 0.18); g.lineWidth = 0.7; g.beginPath(); const bb = bboxOf(o.geometry); const [ax, ay] = T(bb[0], bb[3]), [bx, by] = T(bb[2], bb[1]); for (let k = ax - (by - ay); k < bx; k += 7) { g.moveTo(k, by); g.lineTo(k + (by - ay), ay); } g.stroke(); g.restore(); }
    // unplanted positions (constraint conflicts) as small crosses
    if (ui.comp && sc > 5) { g.strokeStyle = rgba('#A04A2A', 0.75); g.lineWidth = 1; g.beginPath(); const k = Math.min(3, sc * 0.08); for (const c of ui.comp.assignments) { const U = c.unplanted; for (let i = 0; i < U.x.length; i++) { if (U.r[i] === 'blocked') continue; const q = T(U.x[i], U.y[i]); g.moveTo(q[0] - k, q[1] - k); g.lineTo(q[0] + k, q[1] + k); g.moveTo(q[0] + k, q[1] - k); g.lineTo(q[0] - k, q[1] + k); } } g.stroke(); }
    // every painted space: a clear outline in its mix colour (on top of the plants) and, when there is room, its mix name
    if (ui.comp) { const placed = [];
      for (const c of ui.comp.assignments) { if (c.a.type === 'erase') continue; const mm = c.a.mixId ? doc.mix(c.a.mixId) : null; const col = mm ? mixColor(mm.color, TOK.inkDeep, 0.45) : TOK.inkDeep;
        for (const p of c.parts) { g.beginPath(); tracePoly(g, p.geometry, T); g.strokeStyle = rgba(col, 0.85); g.lineWidth = sc > 8 ? 1.4 : 1; g.setLineDash(c.a.type === 'line' || c.a.type === 'area' || c.a.type === 'point' ? [5, 3] : []); g.stroke(); g.setLineDash([]); }
        if (sc > 3.5 && mm) { const big = c.parts.slice().sort((a, b) => b.areaM2 - a.areaM2)[0]; const ce = big && centroid(big.geometry); if (ce) { const q = T(ce[0], ce[1] - 2.2); const t = mm.name + (c.a.frozen ? ' · kept' : ''); g.font = `600 10.5px ${SANS}`; const w = g.measureText(t).width + 12; const box = [q[0] - w / 2, q[1] - 9, q[0] + w / 2, q[1] + 9];
          if (!placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) { placed.push(box); g.fillStyle = rgba('#FAF8F2', 0.9); g.beginPath(); g.roundRect ? g.roundRect(box[0], box[1], w, 18, 9) : g.rect(box[0], box[1], w, 18); g.fill(); g.strokeStyle = rgba(col, 0.9); g.lineWidth = 1; g.stroke(); g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, q[0], q[1] + 0.5); } } } } }
    // frozen / kept spaces: solid outline with a lock tick
    if (ui.comp) for (const c of ui.comp.assignments) if (c.a.frozen || c.a.type === 'keep') for (const p of c.parts) { g.beginPath(); tracePoly(g, p.geometry, T); g.strokeStyle = rgba(TOK.inkDeep, 0.75); g.lineWidth = 1.6; g.setLineDash([]); g.stroke(); }
    // selected space
    const sa = selectedAssignment(); if (sa && ui.comp) { const c = ui.comp.assignments.find((q) => q.a.id === sa.id); if (c) for (const p of c.parts) { g.beginPath(); tracePoly(g, p.geometry, T); g.strokeStyle = TOK.select; g.lineWidth = 2.2; g.stroke(); } }
    // fill tool: hovered and selected beds
    if (ui.tool === 'fill') for (const id of new Set([...ui.beds, ui.hoverBed].filter(Boolean))) { const b = store.getObject(id); if (!b) continue; g.beginPath(); tracePoly(g, b.geometry, T); g.strokeStyle = m ? mixColor(m.color, TOK.inkDeep, 0.35) : TOK.ink; g.lineWidth = ui.beds.includes(id) ? 3 : 1.6; g.setLineDash(ui.beds.includes(id) ? [] : [5, 3]); g.stroke(); g.setLineDash([]); if (ui.beds.includes(id)) { g.fillStyle = rgba(m.color, 0.22); g.fill('evenodd'); } }
    // stroke in progress
    if (ui.stroke && ui.stroke.pts.length > 1) { const p = ui.stroke.pts; g.beginPath(); p.forEach((q, i) => { const s = T(q[0], q[1]); i ? g.lineTo(s[0], s[1]) : g.moveTo(s[0], s[1]); });
      if (ui.tool === 'line') { g.strokeStyle = rgba(m.color, 0.45); g.lineWidth = Math.max(2, ui.lineW * sc); g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); g.strokeStyle = mixColor(m.color, TOK.inkDeep, 0.4); g.lineWidth = 1.2; g.stroke(); }
      else { g.closePath(); g.fillStyle = rgba(ui.tool === 'erase' ? '#A04A2A' : ui.tool === 'keep' ? TOK.inkDeep : m.color, 0.18); g.fill(); g.strokeStyle = ui.tool === 'erase' ? '#A04A2A' : TOK.inkDeep; g.lineWidth = 1.3; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]); } }
    // preview: plants of the candidate state, hollow, in the mix colour
    if (ui.preview && ui.preview.target) { g.fillStyle = rgba(TOK.paper, 0.62); g.fillRect(0, 0, plan.w, plan.h); for (const p of ui.preview.target) { const c = p.color || '#888'; g.strokeStyle = rgba(mixColor(c, TOK.inkDeep, 0.55), 0.95); g.lineWidth = 0.9; g.beginPath(); for (const q of p.plants) { if (sc < 6 && q[3] < 0.3) continue; const s = T(q[0], q[1]); const r = Math.max(1.2, q[3] * 0.42 * sc); g.moveTo(s[0] + r, s[1]); g.arc(s[0], s[1], r, 0, 7); } g.stroke(); }
      const s = T(...(plan.viewBox().slice(0, 2))); g.font = `600 12px ${SANS}`; g.fillStyle = TOK.select; g.textAlign = 'left'; g.fillText('Preview — not applied yet', plan.padFor().l + 4, 80); }
  };
  // 3D: the stroke is drawn on a screen-space ink layer while dragging
  function drawInk() {
    if (!(st.view === '3d' && scene && ui.stroke)) return; const r = app.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1);
    if (ink.width !== Math.round(r.width * dpr)) { ink.width = Math.round(r.width * dpr); ink.height = Math.round(r.height * dpr); }
    const g = ink.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); const m = curMix();
    g.beginPath(); ui.stroke.pts.forEach((q, i) => { const s = scene.screenOf(q[0], q[1]); i ? g.lineTo(s[0] - r.left, s[1] - r.top) : g.moveTo(s[0] - r.left, s[1] - r.top); });
    g.strokeStyle = mixColor(m.color, TOK.inkDeep, 0.3); g.lineWidth = ui.tool === 'line' ? 6 : 2; g.lineCap = 'round'; g.stroke();
  }
  function clearInk() { const g = ink.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, ink.width, ink.height); }

  // ---------------------------------------------------------------- selection → contextual panel
  function selectedAssignment() {
    const sel = store.selection; if (!sel || !doc.state) return null;
    const o = store.getObject(sel.id); if (!o) return null;
    const pid = store.kindOf(sel.id) === 'instance' ? o.placementId : sel.id;
    const p = pid ? store.getObject(pid) : null;
    if (!p || p.kind !== 'plants') return null;
    return doc.state.assignments.find((a) => a.id === p.assignmentId) || null;
  }
  ctx.claimsSelection = (sel) => { if (!sel || !designing()) return false; const o = store.getObject(sel.id); if (!o) return false; const k = store.kindOf(sel.id); if (k === 'instance' && o.type === 'designPlant') return true; if (k === 'placement' && o.kind === 'plants') return true; return false; };
  store.on('selection', (sel) => { if (ctx.claimsSelection(sel)) { openPanel(store.kindOf(sel.id) === 'instance' ? 'plant' : 'space', { force: true }); } else if (sel && ui.panel) openPanel(null); else if (ui.panel === 'plant' || ui.panel === 'space') openPanel(null); plan.request(); });
  // in design mode a click on a painted space selects the space (then a plant of it), before the bed underneath
  ctx.picker.pre = (x, y, scale) => {
    if (!designing() || ui.tool !== 'select') return null;
    const a = assignmentAt(x, y); if (!a) return null;
    const pls = store.model.placements.filter((p) => p.assignmentId === a.id); if (!pls.length) return null;
    const bed = store.getBedAt(x, y); const pl = pls.find((p) => bed && p.bedId === bed.id) || pls[0];
    const cur = store.selection ? store.getObject(store.selection.id) : null;
    const curPl = cur ? (store.kindOf(store.selection.id) === 'instance' ? cur.placementId : cur.id) : null;
    if (curPl && pls.some((p) => p.id === curPl)) { const i = store.nearestInstance(x, y, Math.max(0.35, 6 / Math.max(1, scale)), (k) => store.inst.k[k] === 1 && pls.some((p) => p.index === store.inst.pl[k])); if (i >= 0) return { id: 'pi.' + i }; }
    return { id: pl.id };
  };

  function confirmDiscard() { if (ui.panel === 'mix' && ui.pending && ui.pending.length) { const m = doc.mix(ui.editMixId); return confirm(`Discard ${ui.pending.length} change${ui.pending.length === 1 ? '' : 's'} to ${m ? m.name : 'the mix'} that ${ui.pending.length === 1 ? 'is' : 'are'} not applied?`); } return true; }
  function openPanel(kind, { force = false } = {}) {
    if (!force && kind !== 'mix' && !confirmDiscard()) return false;
    ui.panel = kind; if (kind !== 'mix') { ui.pending = null; ui.editMixId = null; }
    if (kind !== 'mix' && ui.preview) { ui.preview = null; plan.request(); }
    $('#dFeedback').setAttribute('aria-pressed', String(kind === 'feedback'));
    renderPanel(); renderChip();
    return true;
  }
  function renderPanel() {
    panel.hidden = !designing() || !ui.panel;
    app.classList.toggle('d-panel-open', !panel.hidden);
    if (panel.hidden) { panel.innerHTML = ''; return; }
    if (ui.panel === 'feedback') return renderFeedback();
    if (ui.panel === 'mix') return renderMixEditor();
    if (ui.panel === 'space') return renderSpace();
    if (ui.panel === 'plant') return renderPlant();
  }
  const head = (title, sub = '') => `<div class="d-hd"><div><h3>${title}</h3>${sub ? `<p class="d-sub">${sub}</p>` : ''}</div><button class="icon x" data-a="close" aria-label="Close">${ICO('<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/>', 13)}</button></div>`;
  const bindClose = () => panel.querySelector('[data-a=close]')?.addEventListener('click', () => { if (ui.panel === 'space' || ui.panel === 'plant') store.select(null); openPanel(null); });
  const bar2 = (target, actual, color) => { const mx = Math.max(target || 0, actual || 0, 1e-9); return `<span class="d-tv"><i class="t" style="width:${(target / mx) * 100}%"></i><i class="a" style="width:${(actual / mx) * 100}%;--c:${color}"></i></span>`; };
  const roleRows = (roles, color) => roles.map((r) => `<tr><td>${esc(r.name)}</td><td>${bar2(r.target, r.actual, color)}</td><td class="num">${r.unit.startsWith('share') ? pct(r.target) + ' → ' + pct(r.actual) : f2(r.target) + ' → ' + f2(r.actual)}</td></tr>`).join('');

  // ---- feedback
  function renderFeedback() {
    const f = ui.fb; if (!f) { panel.innerHTML = head('Feedback') + '<p class="muted">Paint something first.</p>'; bindClose(); return; }
    const sz = ui.month ? season(doc, ui.month, ui.comp) : null;
    const cmp = compareReference(doc, ctx.cs.designBeds().filter((b) => 'ABC'.includes(b.props.style)).map((b) => b.id));
    const st2 = doc.state.settings;
    panel.innerHTML = head('Feedback', `${doc.last ? esc(doc.last.label) + ' · ' : ''}${doc.last && doc.last.ms != null ? doc.last.ms + ' ms' : ''}`) + `
      <div class="d-kpi"><div><b>${n0(f.totals.perennials)}</b><span>perennials</span></div><div><b>${n0(f.totals.bulbs)}</b><span>bulbs</span></div><div><b>${n0(f.totals.areaM2)}</b><span>m² painted</span></div><div><b>${f.totals.density.toFixed(1)}</b><span>per m²</span></div><div><b>${f.totals.species}</b><span>species</span></div></div>
      ${f.mixes.map((m) => `<section class="d-sec"><h4><span class="d-dot" style="--c:${m.color}"></span>${esc(m.name)} <span class="muted">v${m.version} · ${m.assignments} space${m.assignments === 1 ? '' : 's'} · ${n0(m.areaM2)} m²</span></h4><table class="d-tbl"><tbody>${roleRows(m.roles, m.color)}</tbody></table></section>`).join('')}<p class="d-note">Bars: grey is the target, colour the result. Base roles by planted area, over-the-base plants per m², drifts by coverage.</p>
      <section class="d-sec"><h4>Unfilled and conflicts</h4>
        ${f.open.length ? `<p>${n0(f.openM2)} m² of open bed not painted yet: ${f.open.map((o) => esc(o.bedId.replace('bed.', ''))).join(', ')} <button class="lnk" data-a="fillopen">Fill with ${esc(curMix().name)}</button></p>` : '<p class="muted">Every open bed is painted.</p>'}
        ${f.unplanted.filter((u) => u.why !== 'blocked').length ? `<ul class="d-list">${f.unplanted.filter((u) => u.why !== 'blocked').map((u) => `<li><b>${n0(u.count)}</b> positions — ${esc(u.label)}</li>`).join('')}</ul>` : '<p class="muted">No position was left unplanted by a rule.</p>'}
        ${f.outsideBedsM2 > 0.5 ? `<p class="d-note">${n0(f.outsideBedsM2)} m² of drawn space lies on paths or lawn and stays unplanted.</p>` : ''}
        <p class="d-note">Validation: ${f.conflicts} plant${f.conflicts === 1 ? '' : 's'} dropped (outside a bed, on a path, or too close).</p></section>
      ${f.rules.length || f.substitutions.length ? `<section class="d-sec"><h4>Site rules at work</h4><ul class="d-list">${dedupeRules(f.rules).map((r) => `<li><b>${esc(r.label)}</b>${r.hypothetical ? ' <span class="d-hyp">hypothetical</span>' : ''}: ${esc(r.effect)}${r.basis ? `<br><span class="d-note">${esc(r.basis)}</span>` : ''}</li>`).join('')}</ul>
        ${f.substitutions.filter((s) => s.why !== 'preference').length ? `<p class="d-note">Same-role substitutions: ${f.substitutions.filter((s) => s.why !== 'preference').slice(0, 5).map((s) => `${esc(spShort(s.from))} → ${esc(spShort(s.to))} ×${s.n} (${esc(s.why)})`).join('; ')}</p>` : ''}</section>` : ''}
      <section class="d-sec"><h4>Season</h4><div class="d-month"><input type="range" min="0" max="12" step="1" value="${ui.month || 0}" aria-label="Month" data-a="month"><span>${ui.month ? MONTHS[ui.month - 1] : 'off'}</span></div>
        ${sz ? `<p><b>${n0(sz.blooming)}</b> plants in flower · bloom known for <b>${pct(sz.coverage)}</b> of plants (${sz.speciesKnown} of ${sz.speciesKnown + sz.speciesUnknown} species).</p>${sz.flowering.length ? `<p class="d-note">${sz.flowering.slice(0, 6).map((q) => esc(spShort(q.id))).join(', ')}</p>` : ''}<p class="d-note">${esc(sz.note)}</p>${sz.coverage < 0.5 ? '<p class="d-note">To fill the gaps: select a plant on the plan and add its flowering months; the season view updates at once.</p>' : ''}` : '<p class="d-note">Choose a month: plants with a bloom record that applies here show their flower colour, plants without a record turn grey (unknown).</p>'}</section>
      <details class="d-sec"${st2.scenarioWet || library.policy.accept.size !== 3 ? ' open' : ''}><summary>Scenario and knowledge scope — these change the design</summary>
        <label class="d-chk"><input type="checkbox" data-a="wet" ${st2.scenarioWet ? 'checked' : ''}> <span><b>Hypothetical:</b> lower ground is wetter <span class="d-hyp">not site data</span><br><span class="d-note">Within each painted space its lowest ground counts as wet and its highest as dry; species follow the hydrology zone printed on the official meadow lists. Soil moisture itself stays unknown.</span></span></label>
        <div class="d-scope">Design rules use records ${['same', 'within', 'broader', 'elsewhere'].map((k) => `<label><input type="checkbox" data-scope="${k}" ${library.policy.accept.has(k) ? 'checked' : ''}> ${{ same: 'for Detroit', within: 'inside Detroit', broader: 'for a region containing it', elsewhere: 'from elsewhere' }[k]}</label>`).join('')}<span class="d-note">Knowledge: ${esc(library.status)}</span></div></details>
      <details class="d-sec"><summary>Compare with the reference (15 main beds)</summary><p>Reference: ${cmp.reference.species} species in ${cmp.reference.placements} patches (schematic) · Working: ${cmp.working.species} species, ${n0(cmp.working.plants)} plants · ${cmp.sharedSpecies} species in both.</p>
        <button class="btn small" data-a="ref">Show the reference</button> <span class="d-note">${esc(cmp.reference.note)}</span></details>`;
    bindClose();
    panel.querySelector('[data-a=month]').addEventListener('input', (e) => setMonth(+e.target.value || null));
    panel.querySelector('[data-a=wet]').addEventListener('change', (e) => run([{ op: 'setScenario', wet: e.target.checked }]));
    panel.querySelectorAll('[data-scope]').forEach((c) => c.addEventListener('change', async () => { const acc = [...panel.querySelectorAll('[data-scope]:checked')].map((q) => q.dataset.scope); const r = await dops.runAsync([{ op: 'setKnowledgePolicy', accept: acc }]); say('Knowledge scope: ' + acc.join(', ') + ' — ' + n0(r.plantsAfter) + ' plants'); }));
    panel.querySelector('[data-a=fillopen]')?.addEventListener('click', () => { const g = union(f.open.map((o) => o.geometry)); if (g) run([{ op: 'paint', geometry: g, mix: curMix().id }], 'fill the open beds'); });
    panel.querySelector('[data-a=ref]').addEventListener('click', () => ctx.toggleReference());
  }
  const dedupeRules = (rules) => { const m = new Map(); for (const r of rules) { const k = r.rule; const e = m.get(k); if (!e) m.set(k, { ...r, n: 1 }); else { e.n++; e.effect = e.n + ' spaces · ' + r.effect; } } return [...m.values()]; };
  function setColorBy(k) {
    ui.colorBy = k; store.view.colorBy = k;
    if (k === 'hydrology') { const h = new Map(); for (const sp of store.model.species) { const v = library.hydrology(sp.id); h.set(sp.index, v.range && v.range.length ? (v.range.length === 1 ? v.range[0] : v.range.includes('wet') && v.range.includes('dry') ? 'moist' : v.range[v.range.length - 1]) : null); } store.view.hydro = h; }
    renderPalette(); plan.request();
  }
  function setMonth(m) {
    ui.month = m; store.view.month = m || null;
    if (m) { const ph = new Map(); for (const sp of store.model.species) { const b = library.bloom(sp.id); ph.set(sp.index, b.status === 'known' ? b.months.includes(m) : null); } store.view.phenology = ph; } else store.view.phenology = null;
    plan.request(); if (ui.panel === 'feedback') renderFeedback(); renderChip();
  }

  // ---- a painted space (assignment)
  function renderSpace() {
    const a = selectedAssignment(); if (!a) { panel.innerHTML = head('Space') + '<p class="muted">Not a design space.</p>'; bindClose(); return; }
    const g = doc.generated(a); const d = g.diag || {}; const m = a.mixId ? doc.mix(a.mixId) : null; const c = ui.comp && ui.comp.assignments.find((q) => q.a.id === a.id);
    const fa = ui.fb && ui.fb.assignments.find((q) => q.id === a.id);
    const roles = m ? Object.entries(d.roles || {}).map(([id, r]) => ({ ...r, id })) : [];
    panel.innerHTML = head(esc(a.label || a.id), `${{ fill: 'Filled beds', area: 'Painted area', line: 'Curve band', point: 'Point group', keep: 'Kept planting', erase: 'Erased area' }[a.type]}${a.frozen ? ' · frozen' : ''}`) + `
      ${m ? `<div class="d-row"><span class="d-dot" style="--c:${m.color}"></span><select data-a="mix" aria-label="Mix of this space" ${a.frozen ? 'disabled' : ''}>${doc.state.mixes.map((q) => `<option value="${esc(q.id)}"${q.id === m.id ? ' selected' : ''}>${esc(q.name)} (v${q.version})</option>`).join('')}</select></div>` : ''}
      <div class="d-kpi"><div><b>${n0(fa ? fa.perennials : 0)}</b><span>perennials</span></div><div><b>${n0(fa ? fa.bulbs : 0)}</b><span>bulbs</span></div><div><b>${n0(fa ? fa.areaM2 : 0)}</b><span>m²</span></div><div><b>${fa ? fa.density.toFixed(1) : '—'}</b><span>per m²</span></div></div>
      <p class="d-note">Beds: ${(c ? c.parts : []).map((p) => esc(p.bedId.replace('bed.', ''))).join(', ') || '—'}${d.outsideBedsM2 > 0.3 ? ` · ${n0(d.outsideBedsM2)} m² of the drawn space is path or lawn (unplanted)` : ''} · z ${f2(d.env && d.env.zMin)}–${f2(d.env && d.env.zMax)} m (3DEP)</p>
      ${m && !a.frozen && a.type !== 'keep' ? `<section class="d-sec"><h4>Local parameters</h4>
        <label class="d-field">Density ×<input type="range" min="0.5" max="2" step="0.1" value="${a.params.densityScale || 1}" data-p="densityScale"><span class="num">${(a.params.densityScale || 1).toFixed(1)}</span></label>
        ${a.type === 'line' ? `<label class="d-field">Width<input type="range" min="0.8" max="8" step="0.2" value="${a.params.widthM}" data-p="widthM"><span class="num">${a.params.widthM} m</span></label><label class="d-field">Along the curve<select data-p="lineMode"><option value="drifts"${a.params.lineMode !== 'rows' ? ' selected' : ''}>drifts</option><option value="rows"${a.params.lineMode === 'rows' ? ' selected' : ''}>rows</option></select></label>` : ''}
        ${a.type === 'point' ? `<label class="d-field">Plants<input type="range" min="1" max="30" step="1" value="${a.params.count}" data-p="count"><span class="num">${a.params.count}</span></label>` : ''}
        <button class="btn small" data-a="seed" title="Another arrangement with the same rules and proportions">Variation</button></section>` : ''}
      ${roles.length ? `<section class="d-sec"><h4>Target and actual</h4><table class="d-tbl"><tbody>${roleRows(roles, m.color)}</tbody></table></section>` : ''}
      ${(d.rules || []).length || Object.keys(d.unplanted || {}).filter((k) => k !== 'blocked').length ? `<section class="d-sec"><h4>Why it looks like this</h4><ul class="d-list">${(d.rules || []).map((r) => `<li><b>${esc(r.label)}</b>${r.hypothetical ? ' <span class="d-hyp">hypothetical</span>' : ''}: ${esc(r.effect)}</li>`).join('')}${Object.entries(d.unplanted || {}).filter(([k]) => k !== 'blocked').map(([k, v]) => `<li><b>${n0(v)}</b> unplanted — ${esc(REASONS[k] || k)}</li>`).join('')}</ul></section>` : ''}
      <details class="d-sec"><summary>Fields and method</summary><ul class="d-list">${(d.fields || []).map((q) => `<li><span class="mono">${esc(q.field)}</span> — ${esc(q.use)}</li>`).join('')}</ul><p class="d-note">Lattice ${d.latticeM || '—'} m (${esc(d.baseMode || a.type)}) · engine ${esc(g.engine || '')} · ${d.ms != null ? d.ms + ' ms' : ''} · validation: ${d.validation ? d.validation.dropped + ' of ' + d.validation.checked + ' dropped' : '—'}</p></details>
      <div class="d-actions"><button class="btn small" data-a="freeze">${a.frozen || a.type === 'keep' ? 'Unfreeze' : 'Freeze'}</button><button class="btn small danger" data-a="remove">Remove</button>${m ? `<button class="btn small" data-a="editmix">Edit ${esc(m.name)}</button>` : ''}</div>`;
    bindClose();
    panel.querySelector('[data-a=mix]')?.addEventListener('change', (e) => run([{ op: 'setAssignment', assignment: a.id, mix: e.target.value }]));
    panel.querySelectorAll('[data-p]').forEach((i) => { const k = i.dataset.p; i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', () => { const sp = i.nextElementSibling; if (sp && sp.classList.contains('num')) sp.textContent = k === 'widthM' ? i.value + ' m' : (+i.value).toFixed(k === 'count' ? 0 : 1); });
      i.addEventListener('change', () => run([{ op: 'setAssignment', assignment: a.id, params: { [k]: i.tagName === 'SELECT' ? i.value : +i.value } }])); });
    panel.querySelector('[data-a=seed]')?.addEventListener('click', () => run([{ op: 'setAssignment', assignment: a.id, params: { seed: (a.params.seed || 0) + 1 } }], 'variation'));
    panel.querySelector('[data-a=freeze]').addEventListener('click', () => (a.type === 'keep' ? run([{ op: 'remove', assignment: a.id }], 'release kept area') : run([{ op: 'freeze', assignment: a.id, on: !a.frozen }])));
    panel.querySelector('[data-a=remove]').addEventListener('click', () => { store.select(null); run([{ op: 'remove', assignment: a.id }]); });
    panel.querySelector('[data-a=editmix]')?.addEventListener('click', () => openMixEditor(m.id));
  }

  // ---- a design plant + its knowledge
  function renderPlant() {
    const sel = store.selection; const o = sel && store.getObject(sel.id); if (!o) { openPanel(null); return; }
    const pr = library.profile(o.speciesId); const a = selectedAssignment(); const m = a && a.mixId ? doc.mix(a.mixId) : null;
    const role = m && o.role ? (m.roles.find((r) => r.id === o.role) || {}) : {};
    const ex = pr.exposure, bl = pr.bloom, hy = pr.hydrology;
    const recRow = ({ r, a: ap }, applied) => `<li class="${applied ? '' : 'na'}">${esc(r.statement || r.id)} <span class="d-note">${esc(ap.label)}${ap.via ? ' · applied here by you' : ''}</span>${!applied && library.kb ? ` <button class="lnk" data-apply="${esc(r.id)}">Apply in Detroit</button>` : ''}${applied && r.origin === 'user' ? ' <span class="d-mine">mine</span>' : ''}</li>`;
    panel.innerHTML = head(`<i>${esc(pr.name)}</i>${pr.cultivar ? ` ‘${esc(pr.cultivar)}’` : ''}`, `${esc(role.name || o.role || 'plant')} in ${esc(m ? m.name : 'kept planting')} · ${esc(pr.plantType)}`) + `
      <dl class="d-dl"><dt>Position</dt><dd class="mono">${o.position[0]}, ${o.position[1]} · z ${f2(o.elevation)} m</dd><dt>Spacing</dt><dd>${o.plannedSpacingM} m (design input)</dd><dt>Knowledge id</dt><dd class="mono">${esc(pr.entityId || '—')} <span class="d-note">${esc(pr.mapStatus)}</span></dd></dl>
      <section class="d-sec"><h4>Hydrology zone</h4><p>${hy.status === 'unknown' ? '<span class="d-unk">unknown</span>' : `${esc((hy.range || []).map((q) => HYDRO[q]).join(' to '))} <span class="d-note">${hy.status === 'personal' ? 'your record · ' + esc(hy.place || '') : 'printed on the official meadow list' + (hy.printed ? ': ' + esc(Object.entries(hy.printed).map(([k, v]) => k + ' ' + v).join(' / ')) : '')}</span>`}</p></section>
      <section class="d-sec"><h4>Light (exposure)</h4><p>${ex.status === 'known' ? esc(ex.labels.join(', ')) + (ex.shade ? ' — tolerates shade' : ' — no shade recorded') : `<span class="d-unk">${esc(ex.status)}</span>`}</p>
        ${ex.applied.length || ex.notApplied.length ? `<ul class="d-list small">${ex.applied.map((q) => recRow(q, true)).join('')}${ex.notApplied.map((q) => recRow(q, false)).join('')}</ul>` : ''}${ex.speciesLevel.length ? `<p class="d-note">${ex.speciesLevel.length} record(s) exist for the species; a cultivar is not the species, so they are not applied.</p>` : ''}</section>
      <section class="d-sec"><h4>Flowering</h4><p>${bl.status === 'known' ? bl.months.map((q) => MONTHS[q - 1]).join(', ') : `<span class="d-unk">${esc(bl.status)}</span>`}</p>${bl.notApplied.length ? `<ul class="d-list small">${bl.notApplied.map((q) => recRow(q, false)).join('')}</ul>` : ''}</section>
      ${pr.roles.length ? `<section class="d-sec"><h4>In the Detroit plans</h4><p class="d-note">${pr.roles.map((r) => esc(`${r.role} (“${r.legendCode}”)`)).join(', ')}</p></section>` : ''}
      ${pr.pollinators ? `<p class="d-note">Robertson 1929 lists ${pr.pollinators.taxa} visitor taxa — ${esc(pr.pollinators.note)}.</p>` : ''}
      <section class="d-sec d-add"><h4>Add what you know</h4>
        <div class="d-row"><select data-k="kind" aria-label="Kind of knowledge"><option value="exposure">Light</option><option value="bloom">Flowering months</option><option value="hydrology">Hydrology</option><option value="note">Note</option></select>
        <select data-k="place" aria-label="Where it applies"><option value="place:detroit">Detroit</option><option value="place:north_america">North America</option><option value="">place not stated</option></select></div>
        <div class="d-kv" data-k="vals"></div><input type="text" data-k="note" placeholder="Basis (e.g. my observation, 2025)" aria-label="Basis">
        <button class="btn small primary" data-a="add">Save to my knowledge</button><p class="d-note">Stored in this browser's personal knowledge layer, shared with the Knowledge workspace. Records without a place are kept but not used by design rules.</p></section>`;
    bindClose();
    const vals = panel.querySelector('[data-k=vals]'); const kindSel = panel.querySelector('[data-k=kind]');
    const drawVals = () => { const k = kindSel.value; vals.innerHTML = k === 'exposure' ? EXPOSURE_OPTIONS.map((q) => `<label><input type="checkbox" value="${q.id}"> ${q.label}</label>`).join('') : k === 'bloom' ? MONTHS.map((q, i) => `<label><input type="checkbox" value="${i + 1}"> ${q}</label>`).join('') : k === 'hydrology' ? Object.entries(HYDRO).map(([id, l]) => `<label><input type="checkbox" value="${id}"> ${l}</label>`).join('') : '<input type="text" data-k="text" placeholder="Note" aria-label="Note">'; };
    kindSel.addEventListener('change', drawVals); drawVals();
    panel.querySelector('[data-a=add]').addEventListener('click', async () => {
      const k = kindSel.value; const value = k === 'note' ? vals.querySelector('input').value : [...vals.querySelectorAll('input:checked')].map((i) => i.value);
      const r = await dops.runAsync([{ op: 'addKnowledge', speciesId: o.speciesId, kind: k, value, place: panel.querySelector('[data-k=place]').value || null, note: panel.querySelector('[data-k=note]').value }]);
      say(r.ok ? `Saved. The design re-read its knowledge: ${n0(r.plantsAfter)} plants.` : 'Not saved: ' + r.errors.map((e) => e.message).join('; '), 4200);
    });
    panel.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', async () => { const r = await dops.runAsync([{ op: 'applyRecordHere', recordId: b.dataset.apply, why: 'designer judgement in the Design workspace' }]); say(r.ok ? 'Record applied in Detroit (your scope decision).' : r.errors[0].message); }));
  }

  // ---- mix editor: pending changes → Preview → Apply (a shared mix updates every non-frozen space that uses it)
  function openMixEditor(id) { if (ui.editMixId !== id && !confirmDiscard()) return; ui.editMixId = id; ui.pending = []; ui.openRole = null; ui.preview = null; ui.panel = 'mix'; $('#dFeedback').setAttribute('aria-pressed', 'false'); renderPanel(); }
  function renderMixEditor() {
    const base = doc.mix(ui.editMixId); if (!base) { openPanel(null); return; }
    let m = base; for (const ch of ui.pending) { try { m = changeMix(m, ch).mix; } catch { /* shown on apply */ } }
    const uses = doc.state.assignments.filter((a) => a.mixId === base.id); const live = uses.filter((a) => !a.frozen).length;
    const kn = (id) => { const p = library.profile(id); const dot = (ok, t) => `<i class="${ok ? 'k' : 'u'}" title="${esc(t)}"></i>`; return `<span class="d-kn" title="knowledge: hydrology · light · flowering">${dot(p.hydrology.status !== 'unknown', 'hydrology ' + p.hydrology.status)}${dot(p.exposure.status === 'known', 'light ' + p.exposure.status)}${dot(p.bloom.status === 'known', 'flowering ' + p.bloom.status)}</span>`; };
    const allSp = store.model.species.filter((s) => s.plantType !== 'tree' && !s.id.startsWith('sp.unidentified') && s.id !== 'sp.lawn');
    const baseTot = m.roles.filter((r) => r.layer === 'base').reduce((a, r) => a + r.share, 0) || 1;
    const val = (r) => (r.layer === 'base' ? Math.round((r.share / baseTot) * 100) + ' %' : r.layer === 'overlay' ? (+r.density).toFixed(2) + ' / m²' : Math.round(r.coverage * 100) + ' % drifts');
    if (!ui.openRole || !m.roles.some((r) => r.id === ui.openRole)) ui.openRole = m.roles[0] && m.roles[0].id;
    const fm = ui.fb && ui.fb.mixes.find((x) => x.id === base.id);
    const pv = ui.preview && ui.preview.mixId === base.id ? ui.preview : null;
    const roleRow = (r) => { const open = r.id === ui.openRole; const now = fm && fm.roles.find((q) => q.id === r.id); const after = pv && pv.roles ? pv.roles[r.id] : null;
      return `<section class="d-role${open ? ' open' : ''}" data-role="${esc(r.id)}">
        <button class="d-rsum" data-open="${esc(r.id)}" aria-expanded="${open}"><span class="d-rnm">${esc(r.name)}</span><span class="d-rv">${esc(val(r))}</span><span class="d-rc">${r.species.length} sp · ${r.spacingM} m</span></button>
        ${pv ? `<p class="d-ba">${esc(r.layer === 'base' ? 'planted area' : r.layer === 'overlay' ? 'plants / m²' : 'drift coverage')}: ${now ? (r.layer === 'base' ? pct(now.actual) : f2(now.actual)) : '—'} → <b>${after == null ? '—' : r.layer === 'base' ? pct(after) : f2(after)}</b></p>` : ''}
        ${open ? `<div class="d-rbody"><div class="d-rh"><input class="d-rn" value="${esc(r.name)}" data-rp="name" aria-label="Role name"><span class="d-lay">${esc(LAYERS[r.layer])}</span></div>
          <div class="d-rg">
            <label>${r.layer === 'base' ? 'Share of area %' : r.layer === 'overlay' ? 'Plants per m²' : 'Drift coverage %'}<input type="number" step="${r.layer === 'overlay' ? 0.01 : 1}" min="0" max="${r.layer === 'overlay' ? 4 : 100}" value="${r.layer === 'base' ? Math.round((r.share / baseTot) * 100) : r.layer === 'overlay' ? r.density : Math.round(r.coverage * 100)}" data-share="${esc(r.id)}" data-layer="${r.layer}"></label>
            <label>Spacing m<input type="number" step="0.05" min="0.1" max="3" value="${r.spacingM}" data-sp="${esc(r.id)}"></label>
            <label>Arrangement<select data-arr="${esc(r.id)}">${ARRANGEMENTS[r.layer].map((x) => `<option${x === r.arrangement ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
            ${['blocks', 'groups'].includes(r.arrangement) ? `<label>Patch m²<input type="number" step="0.5" min="0.5" max="20" value="${r.patchM2 || 2}" data-patch="${esc(r.id)}"></label>` : ''}
          </div>
          <p class="d-fr">Community role <b>${esc(r.functionalRole || '—')}</b> <span class="d-bas ${esc(r.functionalBasis || '')}">${esc(BASIS[r.functionalBasis] || 'unknown')}</span>${r.designRole ? ` · plan role <b>${esc(r.designRole)}</b> <span class="d-bas legend">${esc(BASIS[r.designRoleBasis] || '')}</span>` : ''}${r.rules && r.rules.minPathM ? ` · keeps ${r.rules.minPathM} m off paths` : ''}</p>
          <ul class="d-sps">${r.species.map((q) => `<li><span class="d-dot" style="--c:${speciesPlanColor(store.getObject(q.id))}"></span><span class="d-spn" title="${esc(spName(q.id))}">${esc(spShort(q.id))}</span>${kn(q.id)}<input type="number" min="0" max="10" step="0.5" value="${q.weight}" data-w="${esc(r.id)}|${esc(q.id)}" aria-label="Weight of ${esc(spShort(q.id))}"><button class="lnk" data-rs="${esc(r.id)}|${esc(q.id)}" aria-label="Remove ${esc(spShort(q.id))}">×</button></li>`).join('')}</ul>
          <div class="d-row"><input list="dsplist" placeholder="Add a species…" data-add="${esc(r.id)}" aria-label="Add a species to ${esc(r.name)}"><button class="lnk" data-rm="${esc(r.id)}">Remove role</button></div></div>` : ''}</section>`; };
    panel.innerHTML = head(`<input type="color" value="${m.color}" data-c="color" aria-label="Mix colour"> <input class="d-name" value="${esc(m.name)}" data-c="name" aria-label="Mix name">`, `${esc(SYSTEMS[m.system] || m.system)} · v${base.version} · used by ${uses.length} space${uses.length === 1 ? '' : 's'}${uses.length - live ? `, ${uses.length - live} frozen (kept as they are)` : ''}${m.status === 'template' ? ' · template' : ''}`) + `
      <div class="d-bars d-big" aria-hidden="true" style="--c:${m.color}">${m.roles.filter((r) => r.layer === 'base').map((r) => `<i style="flex:${r.share / baseTot}" title="${esc(r.name)}"></i>`).join('')}</div>
      ${m.roles.map(roleRow).join('')}
      <datalist id="dsplist">${allSp.map((s) => `<option value="${esc(s.canonicalKey)}"></option>`).join('')}</datalist>
      <div class="d-row"><select data-k="newlayer" aria-label="Layer of the new role"><option value="base">base</option><option value="overlay">over the base</option><option value="ephemeral">ephemeral drift</option></select><button class="btn small" data-a="addrole">Add role</button></div>
      <label class="d-chk small"><input type="checkbox" data-a="crown" ${m.rules && m.rules.crown ? 'checked' : ''}> Under existing tree crowns, plant only species with shade knowledge</label>
      <details class="d-sec"><summary>Basis and sources</summary><p class="d-note">${esc(m.basis && m.basis.summary)}</p>${(m.basis && m.basis.notes || []).map((t) => `<p class="d-note">${esc(t)}</p>`).join('')}<p class="d-note">Sources: ${esc((m.basis && m.basis.sourceRefs || []).join(', ') || '—')}</p></details>
      <details class="d-sec"><summary>Versions</summary><ol class="d-list small">${(base.history || []).slice().reverse().map((h) => `<li>v${h.version} — ${esc(h.summary)}</li>`).join('')}</ol></details>
      <div class="d-actions"><button class="btn small" data-a="dup">Duplicate</button><button class="btn small" data-a="paint">Paint with it</button></div>
      ${ui.pending.length ? `<section class="d-pend" aria-live="polite"><h4>${ui.pending.length} change${ui.pending.length === 1 ? '' : 's'} not applied yet</h4><ol class="d-list small">${ui.pending.map((c, i) => { let s = c.op; try { s = changeMix(i ? ui.pending.slice(0, i).reduce((x, y) => changeMix(x, y).mix, base) : base, c).summary; } catch (e) { s = c.op + ' — ' + e.message; } return `<li>${esc(s)}</li>`; }).join('')}</ol>
        ${pv ? `<p class="d-note">Preview: ${n0(pv.before)} → <b>${n0(pv.after)}</b> plants in ${live} space${live === 1 ? '' : 's'}; the new plants are outlined on the plan.</p>` : ''}
        <div class="d-actions"><button class="btn small${pv ? '' : ' primary'}" data-a="preview">Preview</button><button class="btn small${pv ? ' primary' : ''}" data-a="apply">Apply to ${live} space${live === 1 ? '' : 's'}</button><button class="lnk" data-a="discard">Discard</button></div></section>` : ''}`;
    bindClose();
    const push = (ch) => { ui.pending.push(ch); ui.preview = null; plan.request(); renderMixEditor(); };
    panel.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => { ui.openRole = b.dataset.open; renderMixEditor(); }));
    panel.querySelector('[data-c=color]').addEventListener('change', (e) => push({ op: 'setColor', color: e.target.value }));
    panel.querySelector('[data-c=name]').addEventListener('change', (e) => push({ op: 'rename', name: e.target.value }));
    panel.querySelectorAll('[data-share]').forEach((i) => i.addEventListener('change', () => { const L = i.dataset.layer; const v = L === 'overlay' ? +i.value : +i.value / 100; push({ op: 'setShare', roleId: i.dataset.share, value: v, rebalance: true }); }));
    panel.querySelectorAll('[data-sp]').forEach((i) => i.addEventListener('change', () => push({ op: 'setSpacing', roleId: i.dataset.sp, value: +i.value })));
    panel.querySelectorAll('[data-arr]').forEach((i) => i.addEventListener('change', () => push({ op: 'setRoleParam', roleId: i.dataset.arr, key: 'arrangement', value: i.value })));
    panel.querySelectorAll('[data-patch]').forEach((i) => i.addEventListener('change', () => push({ op: 'setRoleParam', roleId: i.dataset.patch, key: 'patchM2', value: +i.value })));
    panel.querySelectorAll('[data-rp=name]').forEach((i) => i.addEventListener('change', () => push({ op: 'setRoleParam', roleId: i.closest('[data-role]').dataset.role, key: 'name', value: i.value })));
    panel.querySelectorAll('[data-w]').forEach((i) => i.addEventListener('change', () => { const [r, s] = i.dataset.w.split('|'); push({ op: 'setWeight', roleId: r, speciesId: s, value: +i.value }); }));
    panel.querySelectorAll('[data-rs]').forEach((b) => b.addEventListener('click', () => { const [r, s] = b.dataset.rs.split('|'); push({ op: 'removeSpecies', roleId: r, speciesId: s }); }));
    panel.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => push({ op: 'removeRole', roleId: b.dataset.rm })));
    panel.querySelectorAll('[data-add]').forEach((i) => i.addEventListener('change', () => { const s = allSp.find((q) => q.canonicalKey === i.value); if (!s) { say('Pick a species from the list.'); return; } push({ op: 'addSpecies', roleId: i.dataset.add, speciesId: s.id }); }));
    panel.querySelector('[data-a=addrole]').addEventListener('click', () => { const layer = panel.querySelector('[data-k=newlayer]').value; push({ op: 'addRole', role: { name: layer === 'base' ? 'New base role' : layer === 'overlay' ? 'New emergents' : 'New ephemerals', layer } }); ui.openRole = null; });
    panel.querySelector('[data-a=crown]').addEventListener('change', (e) => push({ op: 'setRule', key: 'crown', value: e.target.checked ? 'require-shade-knowledge' : null }));
    panel.querySelector('[data-a=preview]')?.addEventListener('click', () => {
      const r = ctx.api.design._ops.run([{ op: 'editMix', mix: base.id, changes: ui.pending }], { preview: true }); if (!r.ok) { say(r.errors.map((e) => e.message).join('; '), 5000); return; }
      const ids = new Set(doc.state.assignments.filter((a) => a.mixId === base.id && !a.frozen).map((a) => a.id));
      // role shares of the previewed state, for the before → after line of every role
      const nm = r.state.mixes.find((x) => x.id === base.id); const area = {}, count = {}; let A = 0, planted = 0;
      for (const c of r.comp.assignments) { if (c.a.mixId !== base.id) continue; planted += c.parts.reduce((s, p) => s + p.areaM2, 0); const P = c.gen.plants; for (const k of c.keep) { const rr = nm.roles[P.role[k]]; if (!rr) continue; count[rr.id] = (count[rr.id] || 0) + 1; if (P.layer[k] !== 2) { const a = P.size[k] * P.size[k] * 0.866; area[rr.id] = (area[rr.id] || 0) + a; A += a; } } }
      const roles = {}; for (const rr of nm.roles) roles[rr.id] = rr.layer === 'base' ? (area[rr.id] || 0) / (A || 1) : rr.layer === 'overlay' ? (count[rr.id] || 0) / (planted || 1) : (count[rr.id] || 0) / Math.max(1, rr.densityInDrift || 16) / (planted || 1);
      ui.preview = { mixId: base.id, before: r.plantsBefore, after: r.plantsAfter, roles, target: r.target.filter((p) => ids.has(p.assignmentId)) }; plan.request(); renderMixEditor();
    });
    panel.querySelector('[data-a=apply]')?.addEventListener('click', () => { const ch = ui.pending; ui.pending = []; ui.preview = null; const r = run([{ op: 'editMix', mix: base.id, changes: ch }]); if (r && !r.ok) ui.pending = ch; renderMixEditor(); });
    panel.querySelector('[data-a=discard]')?.addEventListener('click', () => { ui.pending = []; ui.preview = null; plan.request(); renderMixEditor(); });
    panel.querySelector('[data-a=dup]').addEventListener('click', () => { if (!confirmDiscard()) return; const r = run([{ op: 'createMix', from: base.id, name: base.name + ' copy' }]); if (r && r.ok) openMixEditor(r.mixes[0]); });
    panel.querySelector('[data-a=paint]').addEventListener('click', () => { ui.mixId = base.id; setTool('fill'); renderPalette(); });
  }

  // ---------------------------------------------------------------- operations drawer (language → AI, when connected; JSON ops always)
  function toggleDrawer(open = drawer.hidden) {
    drawer.hidden = !open; $('#dOps').setAttribute('aria-pressed', String(open)); app.classList.toggle('d-drawer-open', open);
    if (open) renderDrawer();
  }
  function exampleOps() {
    const m = curMix(); const a = selectedAssignment();
    if (a) return [{ op: 'setAssignment', assignment: a.id, params: { densityScale: 1.2 } }];
    return [{ op: 'fill', beds: ['bed.B4', 'bed.B5'], mix: m ? m.id : 'mix.dropseed-matrix' }, { op: 'editMix', mix: m ? m.id : 'mix.dropseed-matrix', changes: [{ op: 'setShare', roleId: (m && m.roles[0].id) || 'matrix', value: 0.6, rebalance: true }] }];
  }
  function renderDrawer() {
    drawer.innerHTML = `<div class="d-dh"><h3>Ask · Operate</h3><button class="icon x" data-a="close" aria-label="Close">${ICO('<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.5"/>', 13)}</button></div>
      <div class="d-dgrid"><div><label class="d-lab" for="dAsk">Describe a change</label><textarea id="dAsk" rows="3" placeholder="e.g. make the matrix in B4 and B5 lighter and add more emergents along the path"></textarea>
        <button class="btn small" data-a="ask">Ask</button><p class="d-note" id="dAskOut">No language model is connected in this prototype (no authorised API key, no paid calls). Your words are not interpreted. A connected model would read the design context and propose the operations on the right; the engine checks and executes them.</p>
        <button class="lnk" data-a="ctx">Copy design context (JSON)</button></div>
      <div><label class="d-lab" for="dJson">Design operations (JSON) — the same interface the brushes use</label><textarea id="dJson" rows="8" spellcheck="false" placeholder='[{ "op": "fill", "beds": ["bed.B4"], "mix": "mix.dropseed-matrix" }]'></textarea>
        <div class="d-actions"><button class="btn small primary" data-a="prev">Preview</button><button class="btn small" data-a="apply" disabled title="Preview first">Apply</button><button class="btn small" data-a="undo">Undo</button><button class="lnk" data-a="ex">Insert an example</button><button class="lnk" data-a="ref">Operations reference</button></div><pre class="d-out" id="dOut"></pre></div></div>`;
    drawer.querySelector('[data-a=close]').onclick = () => toggleDrawer(false);
    const out = drawer.querySelector('#dOut'); const parse = () => { try { return JSON.parse(drawer.querySelector('#dJson').value); } catch (e) { out.textContent = 'Not valid JSON: ' + e.message; return null; } };
    drawer.querySelector('[data-a=ask]').onclick = () => { drawer.querySelector('#dAskOut').innerHTML = '<b>Not interpreted.</b> No language model is connected, so the request was not turned into operations. Write them on the right, or copy the context to an external model and paste its operations back.'; };
    drawer.querySelector('[data-a=ctx]').onclick = async () => { const c = JSON.stringify(dops.context({ selection: store.selection }), null, 1); try { await navigator.clipboard.writeText(c); say('Design context copied (' + Math.round(c.length / 1024) + ' kB).'); } catch { out.textContent = c.slice(0, 4000) + '\n…'; } };
    const ta = drawer.querySelector('#dJson'); const applyB = drawer.querySelector('[data-a=apply]'); let previewed = null;
    ta.addEventListener('input', () => { if (ta.value !== previewed) { applyB.disabled = true; applyB.classList.remove('primary'); } });
    drawer.querySelector('[data-a=ex]').onclick = () => { ta.value = JSON.stringify(exampleOps(), null, 1); ta.dispatchEvent(new Event('input')); };
    drawer.querySelector('[data-a=prev]').onclick = () => { const ops = parse(); if (!ops) return; const kOps = ops.some((o) => ['addKnowledge', 'applyRecordHere', 'setKnowledgePolicy'].includes(o.op)); if (kOps) { previewed = ta.value; applyB.disabled = false; out.textContent = 'Knowledge operations write your personal knowledge layer and cannot be previewed; Apply runs them.'; return; } const r = dops.run(ops, { preview: true }); if (!r.ok) { out.textContent = 'Refused:\n' + r.errors.map((e) => `#${e.index} ${e.op || ''}: ${e.message}`).join('\n'); return; } ui.preview = { target: r.target, before: r.plantsBefore, after: r.plantsAfter }; plan.request(); previewed = ta.value; applyB.disabled = false; applyB.classList.add('primary'); out.textContent = `Preview (not applied): ${r.said.join(' · ')}\nplants ${r.plantsBefore} → ${r.plantsAfter}${r.warnings.length ? '\n' + r.warnings.join('\n') : ''}`; };
    drawer.querySelector('[data-a=apply]').onclick = async () => { const ops = parse(); if (!ops) return; ui.preview = null; const kOps = ops.some((o) => ['addKnowledge', 'applyRecordHere', 'setKnowledgePolicy'].includes(o.op)); const r = kOps ? await dops.runAsync(ops) : run(ops); if (!r) return; out.textContent = r.ok ? `Applied: ${r.said.join(' · ')}\nplants ${r.plantsBefore ?? ''} → ${r.plantsAfter}` : 'Refused:\n' + r.errors.map((e) => `#${e.index} ${e.op || ''}: ${e.message}`).join('\n'); };
    drawer.querySelector('[data-a=undo]').onclick = () => { undo(); };
    drawer.querySelector('[data-a=ref]').onclick = () => { out.textContent = Object.entries(ctx.api.design.operations()).map(([k, v]) => `${k}(${v.args}) — ${v.does}`).join('\n'); };
  }

  // ---------------------------------------------------------------- chip, global refresh, keys
  function renderChip(busyText) {
    chip.hidden = !designing() || (!!ui.panel && !busyText); if (!designing()) return;
    const f = ui.fb; const u = f ? f.unplanted.filter((q) => q.why !== 'blocked').reduce((a, q) => a + q.count, 0) : 0;
    chip.innerHTML = busyText ? `<span class="d-spin"></span>${busyText}` : f && f.totals.assignments ? `<b>${n0(f.totals.perennials)}</b> plants · ${n0(f.totals.areaM2)} m² · ${f.totals.density.toFixed(1)}/m²${f.openM2 > 0.5 ? ` · <span class="d-open">${n0(f.openM2)} m² open</span>` : ''}${u ? ` · <span class="d-warn">${n0(u)} unplanted</span>` : ''}${ui.month ? ` · ${MONTHS[ui.month - 1]}` : ''}` : 'Pick a mix and fill a bed';
    $('#dUndo').disabled = !doc.past.length; $('#dRedo').disabled = !doc.future.length;
  }
  function refresh() {
    app.classList.toggle('designing', designing()); store.view.designing = designing();
    $('.d-bar').hidden = !designing();
    tgroup.hidden = !designing();
    if (!designing()) { if (ui.tool !== 'select') { plan.tool = null; if (scene) scene.setTool(null); } hint.hidden = true; }
    else if (!plan.tool && ui.tool !== 'select') setTool(ui.tool);
    refreshNumbers(); if (ui.month) setMonth(ui.month);
    renderPalette(); renderHint(); renderChip(); renderPanel(); plan.request();
    if (scene && scene.repaintGroundNow) { clearTimeout(refresh._g); refresh._g = setTimeout(() => scene.repaintGroundNow(), 60); }
  }
  doc.on(() => refresh());
  library.onChange(() => { if (ui.month) setMonth(ui.month); if (ui.colorBy === 'hydrology') setColorBy('hydrology'); if (ui.panel) renderPanel(); });
  store.on('model', () => { if (!doc.active()) refresh(); });
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) { if (!designing()) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.key === ' ') { plan.spaceDown = true; }
    if (e.key === 'Escape' && designing() && !ui.stroke && !ui.beds.length) {
      if (!drawer.hidden) { toggleDrawer(false); e.stopImmediatePropagation(); return; }
      if (ui.panel) { if (ui.panel === 'space' || ui.panel === 'plant') { store.select(null); } else openPanel(null); e.stopImmediatePropagation(); return; }
      if (ui.tool !== 'select') { setTool('select'); e.stopImmediatePropagation(); return; }
    }
    if (!designing() || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = TOOLS.find((q) => q.key === e.key.toLowerCase()); if (t) { setTool(t.id); return; }
    if (e.key === 'Enter' && ui.tool === 'fill' && ui.beds.length) { const beds = ui.beds; ui.beds = []; run([{ op: 'fill', beds, mix: curMix().id }]); }
    if (e.key === 'Escape' && (ui.stroke || ui.beds.length)) { ui.stroke = null; ui.beds = []; renderHint(); plan.request(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e) => { if (e.key === ' ') plan.spaceDown = false; });

  return { refresh, setTool, openPanel, openMixEditor, toggleDrawer, setMonth, setColorBy, ui, run };
}

function el(tag, props) { const e = document.createElement(tag); for (const [k, v] of Object.entries(props || {})) { if (k === 'className') e.className = v; else if (k === 'hidden') e.hidden = v; else if (k === 'id') e.id = v; else e.setAttribute(k, v); } return e; }
