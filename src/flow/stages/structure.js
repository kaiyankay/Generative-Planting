// Structure: the confirmed strategy is previewed for EVERY bed of the scope at once (no bed-by-bed confirmation). Zones
// share their parameters (size, a common guide direction and world anchor for straight bands; curved bands follow the
// path edge or a guide curve the designer draws). One click confirms all; clicking a bed refines it locally, with a
// remap / clear impact preview when it already has plants. Cells are places, not plants.
import { esc } from '../ui.js';
import { LOGICS, pathEdgeDirection, mpArea, bbox, inside } from '../spatial.js';

export function gate(F) { return F.P.allCells().length ? { ok: true } : { ok: false, reason: 'Confirm the cells first (one click for the whole scope).' }; }
const zoneParams = (F, z) => { F.u.zp ||= {}; return (F.u.zp[z.id] ||= { size: null, angle: null, curve: null }); };
export function enter(F) {
  F.u.bed = F.u.focus && F.u.focus.length === 1 ? F.u.focus[0] : null; F.u.drawGuide = null; F.store.setViewState({ hidePlanting: false });
  const s = F.P.state.strategy; if (!s) return;
  const todo = s.zones.flatMap((z) => z.bedIds).filter((id) => !F.P.state.beds[id]);
  if (todo.length) previewAll(F, todo); else F.u.previews = null;
}
export function onFocus(F, bedId) { F.u.bed = bedId; F.renderPanel(); }
export function onOverview(F) { F.u.bed = null; F.renderPanel(); }
// hover: the cell (number, area) or the bed under the pointer
export function hoverAt(F, x, y) {
  const pv = F.u.previews; let cell = null;
  if (pv) for (const r of pv.values()) { if (!r || !r.ok) continue; for (const c of r.cells) { const b = c._bb || (c._bb = bbox(c.geometry)); if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; if (inside(c.geometry, x, y)) { cell = c; break; } } if (cell) break; }
  if (!cell) cell = F.cellAt(x, y);
  if (cell) return { key: cell.id, geometry: cell.geometry, chip: `<b>${esc(F.P.bedCode(cell.bedId))}·${cell.n}</b> <span class="dim">${cell.areaM2} m² · ${esc(cell.logic)}</span>` };
  const b = F.bedAt(x, y); if (!b) return null; const inScope = F.scopeBeds().includes(b.id);
  return { key: b.id, geometry: F.bedGeom(b.id), chip: `<b>${esc(b.code)}</b> <span class="dim">${inScope ? 'click to focus' : 'outside the scope'}</span>` };
}
// shared direction of a zone: length-weighted doubled-angle mean of the path edges of its beds
function zoneDirection(F, z) { let c = 0, s = 0; for (const id of z.bedIds) { const d = pathEdgeDirection(F.P.plantable(id), F.P.context()); if (!d) continue; const t = (d.deg * Math.PI) / 90; c += Math.cos(t) * d.lengthM; s += Math.sin(t) * d.lengthM; } if (!c && !s) return null; return ((((Math.atan2(s, c) * 90) / Math.PI) % 180) + 180) % 180; }
function zoneAnchor(F, z) { const b = F.boundsOf(z.bedIds.map((id) => F.store.getObject(id)?.geometry)); return b ? [+(((b[0] + b[2]) / 2).toFixed(2)), +(((b[1] + b[3]) / 2).toFixed(2))] : null; }
export function paramsFor(F, z) {
  const zp = zoneParams(F, z); const p = { ...(z.params || {}) };
  if (zp.size) p.size = zp.size;
  if (z.logic === 'bands') { if (zp.curve) { p.curve = zp.curve; p.guide = 'curve'; } else if ((p.guide || 'path') === 'straight') { p.anchor = zoneAnchor(F, z); const a = zp.angle != null ? zp.angle : zoneDirection(F, z); if (a != null) p.angle = a; } }
  if (z.logic === 'honeycomb') { const a = zp.angle != null ? zp.angle : zoneDirection(F, z); if (a != null) p.angle = a; }
  return p;
}
// previews are computed in small batches so the page stays responsive; the canvas fills in as they arrive
function previewAll(F, bedIds) {
  const P = F.P; const s = P.state.strategy; F.u.previews = new Map(); F.u.pvBusy = bedIds.length; const t0 = performance.now(); const token = (F.u.pvToken = (F.u.pvToken || 0) + 1);
  const list = bedIds.slice(); const step = () => {
    if (F.u.pvToken !== token) return; const t = performance.now();
    while (list.length && performance.now() - t < 60) { const id = list.shift(); const z = s.zones.find((q) => q.bedIds.includes(id)); if (!z) continue; let r; try { r = P.previewCells(id, z.logic, paramsFor(F, z)); } catch (e) { console.error(e); r = { ok: false, bedId: id, error: e.message }; } r.zoneId = z.id; F.u.previews.set(id, r); F.u.pvBusy--; }
    F.u.pvMs = Math.round(performance.now() - t0); F.renderPanel(); F.repaint();
    if (list.length) setTimeout(step, 0); else F.u.pvBusy = 0;
  };
  setTimeout(step, 0);
}
function previewZone(F, z) { if (!F.u.previews) F.u.previews = new Map(); const ids = z.bedIds.filter((id) => !F.P.state.locks || !(F.P.state.beds[id]?.cellIds || []).some((c) => F.P.state.locks[c])); F.u.pvBusy = 0; for (const id of ids) { const r = F.P.previewCells(id, z.logic, paramsFor(F, z)); r.zoneId = z.id; F.u.previews.set(id, r); } F.render(); }
export function bottom(F) {
  const P = F.P; const n = Object.keys(P.state.beds).length; const cells = P.allCells().length; const pv = F.u.previews;
  let msg = n ? `<b>${n} beds</b> structured, ${cells} cells.` : '<b>Structure</b>: previews for the whole scope.';
  if (pv && pv.size) { const nc = [...pv.values()].reduce((a, r) => a + (r.ok ? r.cells.length : 0), 0); msg = F.u.pvBusy ? `Computing ${F.u.pvBusy} more bed${F.u.pvBusy === 1 ? '' : 's'}…` : `<b>Previewing ${pv.size} bed${pv.size === 1 ? '' : 's'}</b>: ${nc} cells — confirm all, or refine a zone or a bed.`; }
  const g = gate(F);
  return { msg, next: { label: 'Continue to Compose →', enabled: g.ok && !(pv && pv.size), reason: pv && pv.size ? 'Confirm or discard the preview first.' : g.reason, run: () => F.go('compose') } };
}
export function onCanvasClick(F, x, y) {
  if (F.u.drawGuide) { F.u.drawGuide.push([+x.toFixed(2), +y.toFixed(2)]); F.render(); return; }
  const b = F.bedAt(x, y); if (!b) return; if (!F.scopeBeds().includes(b.id)) { F.toast(`${esc(b.code)} is outside the design scope — add it in Define.`); return; }
  if (F.u.bed === b.id) return; F.u.bed = b.id; F.focusOn([b.id]); F.render(); // local focus: the scope stays as confirmed
}

export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const s = st.strategy; const pv = F.u.previews;
  let h = '';
  if (!s) { el.innerHTML = '<p class="note">Confirm a scope and strategy in Define first.</p>'; return; }
  if (F.u.bed) h += bedHtml(F);
  const zoneCells = (z) => { let n = 0, a = 0, drop = 0, curved = 0; for (const id of z.bedIds) { const r = pv && pv.get(id); if (r && r.ok) { n += r.cells.length; a += r.cells.reduce((q, c) => q + c.areaM2, 0); drop += r.adaptation.droppedM2 || 0; if (r.params.curved) curved++; } else if (st.beds[id]) { n += st.beds[id].cellIds.length; a += st.beds[id].cellIds.reduce((q, c) => q + (st.cells[c]?.areaM2 || 0), 0); } } return { n, a, drop, curved }; };
  h += '<div class="zones">';
  for (const z of s.zones) {
    const zs = zoneCells(z); const zp = zoneParams(F, z); const L = LOGICS[z.logic]; const done = z.bedIds.every((id) => st.beds[id]) && !(pv && z.bedIds.some((id) => pv.has(id)));
    if (F.u.bed && !z.bedIds.includes(F.u.bed)) continue; // focused on one bed: only its zone
    h += `<article class="zone${F.u.zone === z.id ? ' on' : ''}" data-zone="${z.id}" style="--zc:${z.color}"><header><span class="sw"></span><b>${esc(z.name)}</b><span class="mono xs">${z.bedIds.length} beds · ${zs.n} cells${done ? ' ✓' : ''}</span></header>
      <div class="logics sm">${['bands', 'honeycomb', 'organic', 'whole'].map((k) => `<button class="logic" data-zl="${z.id}:${k}" aria-pressed="${z.logic === k}" title="${esc(LOGICS[k].blurb)}">${glyph(k, z.logic === 'bands' && (z.params || {}).guide !== 'straight')}<span class="nm">${esc(k === 'bands' && (z.params || {}).guide !== 'straight' ? 'Curved bands' : LOGICS[k].name)}</span></button>`).join('')}</div>
      ${z.logic !== 'whole' ? `<div class="slider"><label>${esc(L.sizeLabel)}</label><input type="range" data-zsize="${z.id}" min="${L.minSize}" max="${L.maxSize}" step="0.5" value="${zp.size || (pv && pv.get(z.bedIds[0])?.params.size) || L.sizes[1] || 4}"><span class="num">${zp.size ? zp.size + ' m' : 'auto'}</span></div>` : ''}
      ${z.logic === 'bands' ? `<div class="row xs"><label class="chk sm"><input type="checkbox" data-zcurve="${z.id}" ${(z.params || {}).guide !== 'straight' ? 'checked' : ''}> follow the path edge (curved)</label><button class="lnk" data-zguide="${z.id}">${zp.curve ? 'Redraw guide curve' : 'Draw a guide curve'}</button>${zp.curve ? `<button class="lnk" data-zguideclear="${z.id}">clear curve</button>` : ''}</div>` : ''}
      ${z.logic === 'honeycomb' || (z.logic === 'bands' && (z.params || {}).guide === 'straight' && !zp.curve) ? `<div class="slider"><label>Shared direction</label><input type="range" data-zang="${z.id}" min="0" max="179" step="1" value="${Math.round(zp.angle != null ? zp.angle : zoneDirection(F, z) || 0)}"><span class="num">${zp.angle != null ? Math.round(zp.angle) + '°' : 'path'}</span></div>` : ''}
      <p class="xs dim">${Math.round(zs.a)} m² · ${zs.n ? (zs.a / zs.n).toFixed(1) : '—'} m² per cell${zs.drop ? ` · ${zs.drop.toFixed(1)} m² slivers left out` : ''}</p>
      ${F.u.zone === z.id ? notesHtml(F, z) : `<button class="lnk xs" data-zopen="${z.id}">How it adapts</button>`}</article>`;
  }
  h += '</div>';
  if (F.u.drawGuide) h += `<div class="note warn">Click points on the map to draw the guide curve for this zone (${F.u.drawGuide.length} points). <div class="row"><button class="btn-s" data-a="guideok" ${F.u.drawGuide.length < 2 ? 'disabled' : ''}>Use this curve</button><button class="lnk" data-a="guidecancel">Cancel</button></div></div>`;
  if (pv && pv.size) { const nc = [...pv.values()].reduce((a, r) => a + (r.ok ? r.cells.length : 0), 0); const changed = [...pv.keys()].filter((id) => st.beds[id]); const imp = changed.map((id) => P.structureImpact(id, pv.get(id))); const planted = imp.reduce((a, q) => a + q.assignedCells, 0);
    h += `<div class="sticky-cta">${planted ? `<p class="note warn xs">${planted} planted cells would be replaced: new cells overlapping an old one by half or more are re-filled with its mix; frozen beds are skipped.</p>` : ''}<button class="btn-p wide" data-a="confirmall" ${F.u.pvBusy ? 'disabled' : ''}>Confirm ${pv.size} bed${pv.size === 1 ? '' : 's'} · ${nc} cells</button>${planted ? '<button class="lnk" data-a="confirmclear">confirm and clear their mixes</button>' : ''}<button class="lnk" data-a="discard">discard preview</button><p class="xs dim">${F.u.pvMs ? `computed in ${(F.u.pvMs / 1000).toFixed(1)} s · ` : ''}one undo step</p></div>`; }
  else h += `<div class="row"><button class="btn-s" data-a="regen">Preview the whole scope again</button><label class="chk sm"><input type="checkbox" id="fnums" ${F.u.numbers !== false ? 'checked' : ''}> numbers</label></div>`;
  el.innerHTML = h; bind(F, el);
}
function notesHtml(F, z) {
  const pv = F.u.previews; const r = z.bedIds.map((id) => (pv && pv.get(id)) || null).find((q) => q && q.ok) || null; const st = F.P.state; const b = r ? null : st.beds[z.bedIds[0]];
  const ad = r ? r.adaptation : b ? b.adaptation : null; if (!ad) return '';
  return `<div class="xs"><p>${esc(ad.explanation)}</p><ul>${ad.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>${ad.ranking && ad.ranking.length ? `<details><summary>Candidates compared (${ad.candidates})</summary><table class="members"><tr><th>size</th><th>angle</th><th>cells</th><th>score ↓</th></tr>${ad.ranking.map((q, i) => `<tr${i ? '' : ' class="b"'}><td>${q.size} m</td><td>${q.angle == null ? '—' : q.angle + '°'}</td><td>${q.cells}</td><td class="num">${q.score}</td></tr>`).join('')}</table></details>` : ''}</div>`;
}
function bedHtml(F) {
  const P = F.P, st = P.state; const id = F.u.bed; const b = P.eligibleBeds().find((q) => q.id === id); const cur = st.beds[id]; const r = F.u.previews && F.u.previews.get(id); const frozen = cur && cur.cellIds.some((c) => st.locks[c]);
  const la = P.lightAssumption(id);
  let h = `<section class="blk bed"><h2>${esc(P.bedCode(id))} <span class="aside">${Math.round(b.areaM2)} m² · ${esc(b.style)}${cur ? ` · ${cur.cellIds.length} cells` : ''}</span></h2>
    <div class="row xs"><span class="dim">Light</span><span class="seg sm">${[['sun', 'Sun'], ['part', 'Part'], ['shade', 'Shade'], ['', 'Unknown']].map(([k, n]) => `<button data-bla="${k}" aria-pressed="${(la || '') === k}" title="${k ? 'Project assumption for this bed (labelled as an assumption; the crown proxy stays visible)' : 'No assumption: unknown unless under a crown'}">${n}</button>`).join('')}</span></div>`;
  if (frozen) return h + '<p class="note">This bed has frozen cells: its structure is kept. Unfreeze them in Compose to restructure it.</p></section>';
  h += `<div class="logics sm">${['bands', 'honeycomb', 'organic', 'whole'].map((k) => `<button class="logic" data-bl="${k}" aria-pressed="${(r ? r.logic : cur && cur.logic) === k}">${glyph(k)}<span class="nm">${esc(LOGICS[k].name)}</span></button>`).join('')}</div>`;
  if (r && cur) { const imp = P.structureImpact(id, r); h += `<p class="note warn xs">Replacing ${imp.oldCells} cells${imp.assignedCells ? `: ${imp.assignedCells} planted (${imp.plants} plants); ${imp.carried} new cells keep the mix of the cell they overlap ≥ 50 %` : ''}. Other beds are not touched.</p>`; }
  if (cur && !r) h += `<p class="row xs"><button class="lnk" data-a="unstructure">Give ${esc(P.bedCode(id))} back to the reference planting</button></p>`;
  return h + '</section>';
}
function glyph(k, curved) {
  const p = { bands: curved ? '<path d="M2 6c6-4 14-4 20 0M2 12c6-4 14-4 20 0M2 18c6-4 14-4 20 0"/>' : '<path d="M2 6h20M2 12h20M2 18h20"/>', honeycomb: '<path d="M7 3l4 2.3v4.6L7 12.2 3 9.9V5.3zM15 3l4 2.3v4.6l-4 2.3-4-2.3V5.3zM11 11.8l4 2.3v4.6l-4 2.3-4-2.3v-4.6z"/>', organic: '<path d="M3 4c5-2 9 2 8 7s-6 6-8 4-2-9 0-11zM13 3c4 0 8 3 7 8s-5 4-7 2-3-10 0-10zM9 15c3-1 8 0 9 3s-4 4-8 3-4-5-1-6z"/>', whole: '<rect x="3" y="4" width="18" height="16" rx="3"/>' }[k];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
}
function bind(F, el) {
  const P = F.P; const s = P.state.strategy; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  const zone = (id) => s.zones.find((z) => z.id === id);
  const restruct = (z) => { P.state.strategy = s; P.saveSoon(); previewZone(F, z); };
  el.querySelectorAll('[data-zl]').forEach((b) => (b.onclick = () => { const [id, k] = b.dataset.zl.split(':'); const z = zone(id); const curved = (z.params || {}).guide !== 'straight'; z.logic = k; z.params = k === 'bands' ? { guide: curved ? 'path' : 'straight' } : {}; restruct(z); }));
  el.querySelectorAll('[data-zsize]').forEach((r) => { r.oninput = () => (r.nextElementSibling.textContent = r.value + ' m'); r.onchange = () => { const z = zone(r.dataset.zsize); zoneParams(F, z).size = +r.value; restruct(z); }; });
  el.querySelectorAll('[data-zang]').forEach((r) => { r.oninput = () => (r.nextElementSibling.textContent = r.value + '°'); r.onchange = () => { const z = zone(r.dataset.zang); zoneParams(F, z).angle = +r.value; restruct(z); }; });
  el.querySelectorAll('[data-zcurve]').forEach((c) => (c.onchange = () => { const z = zone(c.dataset.zcurve); z.params = { guide: c.checked ? 'path' : 'straight' }; zoneParams(F, z).curve = null; restruct(z); }));
  el.querySelectorAll('[data-zguide]').forEach((b) => (b.onclick = () => { F.u.drawGuide = []; F.u.guideZone = b.dataset.zguide; F.toast('Click points along the line the bands should follow; then “Use this curve”.'); F.render(); }));
  el.querySelectorAll('[data-zguideclear]').forEach((b) => (b.onclick = () => { const z = zone(b.dataset.zguideclear); zoneParams(F, z).curve = null; s.guides = []; restruct(z); }));
  a('guideok', () => { const z = zone(F.u.guideZone); zoneParams(F, z).curve = F.u.drawGuide.slice(); z.params = { guide: 'curve' }; s.guides = [F.u.drawGuide.slice()]; F.u.drawGuide = null; restruct(z); });
  a('guidecancel', () => { F.u.drawGuide = null; F.render(); });
  el.querySelectorAll('[data-zopen]').forEach((b) => (b.onclick = () => { F.u.zone = b.dataset.zopen; F.focusBeds(zone(F.u.zone).bedIds); F.renderPanel(); }));
  el.querySelectorAll('[data-zone]').forEach((z) => z.addEventListener('mouseenter', () => { F.u.zone = z.dataset.zone; F.repaint(); }));
  el.querySelectorAll('[data-bl]').forEach((b) => (b.onclick = () => { if (!F.u.previews) F.u.previews = new Map(); const z = P.zoneOf(F.u.bed); const r = P.previewCells(F.u.bed, b.dataset.bl, b.dataset.bl === (z && z.logic) ? paramsFor(F, z) : {}); r.zoneId = z && z.id; F.u.previews.set(F.u.bed, r); F.render(); }));
  const commit = (remap) => { const list = [...F.u.previews.values()]; const r = P.commitStructureMany(list, { remap }); if (r.ok === false) { F.toast(r.error || 'not committed', { err: true }); return; } F.u.previews = null; F.u.bed = F.u.focus && F.u.focus.length === 1 ? F.u.focus[0] : null; F.toast(`${list.reduce((q, x) => q + (x.ok ? x.cells.length : 0), 0)} cells confirmed in ${list.length} beds — one undo step.${r.skipped && r.skipped.length ? ` Skipped (frozen): ${r.skipped.map((b) => P.bedCode(b)).join(', ')}.` : ''}`); F.render(); };
  a('confirmall', () => commit('overlap')); a('confirmclear', () => commit('none'));
  a('discard', () => { F.u.previews = null; F.u.pvToken++; F.render(); });
  a('regen', () => { previewAll(F, s.zones.flatMap((z) => z.bedIds).filter((id) => !(P.state.beds[id]?.cellIds || []).some((c) => P.state.locks[c]))); F.render(); });
  a('unstructure', () => { const b = F.u.bed; P.removeStructure(b); F.u.bed = null; F.overview(); F.toast(`${P.bedCode(b)} shows the reference planting again (undo restores your cells).`); F.render(); });
  const nums = el.querySelector('#fnums'); if (nums) nums.onchange = () => { F.u.numbers = nums.checked; F.repaint(); };
  el.querySelectorAll('[data-bla]').forEach((b) => (b.onclick = () => { const v = b.dataset.bla || null; P.setLightAssumption([F.u.bed], v); F.toast(v ? `Project assumption: <b>${v === 'part' ? 'part shade' : v}</b> in ${esc(P.bedCode(F.u.bed))}.` : `${esc(P.bedCode(F.u.bed))}: light unknown again.`); }));
}
export function inspector() { return null; }
export { mpArea };
