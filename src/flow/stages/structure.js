// Structure: select a bed, choose a spatial logic, preview the adaptive numbered cells on the real canvas, confirm.
// Other beds keep their design (or the reference planting). Changing a committed bed previews its consequences.
import { esc } from '../ui.js';
import { LOGICS, bbox } from '../spatial.js';

export function gate(F) { return F.P.allCells().length ? { ok: true } : { ok: false, reason: 'Confirm cells in at least one bed first.' }; }
export function enter(F, opts = {}) {
  if (F.ctx.st.view !== 'plan' && !opts.resumed) F.ctx.setObs('plan');
  if (opts.bed) selectBed(F, opts.bed);
  else if (!F.u.bed) F.ctx.fit();
}
export function bottom(F) {
  const P = F.P; const n = Object.keys(P.state.beds).length; const cells = P.allCells().length;
  let msg = n ? `<b>${n} bed${n === 1 ? '' : 's'}</b> structured, ${cells} cells.` : '<b>Structure</b>: select a bed on the canvas or in the list.';
  if (F.u.preview) msg = `Previewing <b>${esc(LOGICS[F.u.preview.logic].name)}</b> in ${esc(P.bedCode(F.u.preview.bedId))}: ${F.u.preview.cells.length} cells — confirm or adjust.`;
  const g = gate(F);
  return { msg, next: { label: 'Continue to Compose →', enabled: g.ok && !F.u.preview, reason: F.u.preview ? 'Confirm or cancel the preview first.' : g.reason, run: () => F.go('compose') } };
}
export function onCanvasClick(F, x, y) {
  const bed = F.P.eligibleBeds().find((b) => { const o = F.store.getObject(b.id); return o && pointIn(o.geometry, x, y); });
  if (bed && !F.u.preview) selectBed(F, bed.id); else if (bed && F.u.preview && bed.id !== F.u.preview.bedId) F.toast('Confirm or cancel the preview in ' + F.P.bedCode(F.u.preview.bedId) + ' first.');
}
function pointIn(g, x, y) { const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; for (const p of polys) { let c = false; const r = p[0]; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } if (c) return true; } return false; }

export function selectBed(F, bedId) {
  F.u.bed = bedId; F.u.preview = null; F.u.thumbs = null; F.u.logic = null; F.u.params = {};
  const cur = F.P.state.beds[bedId]; if (cur) { F.u.logic = cur.logic; }
  F.focusBed(bedId); F.render();
  // three real previews (same engine, same context) for the logic choice
  setTimeout(() => { if (F.u.bed !== bedId) return; F.u.thumbs = {}; for (const k of Object.keys(LOGICS)) { const r = F.P.previewCells(bedId, k, {}); F.u.thumbs[k] = r; } if (F.stage() === 'structure') F.renderPanel(); }, 30);
}
function choose(F, logic) { F.u.logic = logic; F.u.params = {}; F.u.preview = (F.u.thumbs && F.u.thumbs[logic]) || F.P.previewCells(F.u.bed, logic, {}); if (!F.u.preview.ok) { F.toast(F.u.preview.error, { err: true }); F.u.preview = null; } F.render(); }
function regen(F) { const r = F.P.previewCells(F.u.bed, F.u.logic, F.u.params); if (!r.ok) { F.toast(r.error, { err: true }); return; } F.u.preview = r; F.render(); }

function thumb(res, bedGeom) {
  const b = bbox(bedGeom.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [bedGeom.coordinates] } : bedGeom); const W = 110, H = 74; const s = Math.min((W - 6) / (b[2] - b[0]), (H - 6) / (b[3] - b[1]));
  const T = (x, y) => [((x - b[0]) * s + (W - (b[2] - b[0]) * s) / 2).toFixed(1), (H - ((y - b[1]) * s + (H - (b[3] - b[1]) * s) / 2)).toFixed(1)];
  const path = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => p.map((r) => 'M' + r.map(([x, y]) => T(x, y).join(',')).join('L') + 'Z').join('')).join('');
  if (!res || !res.ok) return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${path(bedGeom)}" fill="none" stroke="#B3B9B2"/></svg>`;
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">${res.cells.map((c, i) => `<path d="${path(c.geometry)}" fill="${i % 2 ? '#E9D9CE' : '#F1E6DE'}" stroke="#B66D48" stroke-width=".6"/>`).join('')}</svg>`;
}

export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const beds = P.eligibleBeds();
  let h = `<h1>Structure</h1><p class="task">Divide the beds you redesign into numbered cells. Cells are places, not plants: mixes are painted into them next.</p>`;
  const groups = [['A', 'Block beds'], ['B', 'Matrix beds'], ['C', 'Grouping beds'], ['other', 'Triangles, rain garden, meadows']];
  h += F.u.bed ? `<details class="bedlist"><summary>Beds — ${Object.keys(st.beds).length} structured; choose another bed</summary>` : `<h2>Beds <span class="aside">${Object.keys(st.beds).length} structured</span></h2>`;
  for (const [g, name] of groups) {
    const list = beds.filter((b) => (g === 'other' ? !'ABC'.includes(b.code[0]) || b.code === 'RG' : b.code[0] === g && b.code !== 'RG')); if (!list.length) continue;
    h += `<p class="dim xs" style="margin:6px 0 3px">${esc(name)}</p><div class="beds">${list.map((b) => `<button class="chip${st.beds[b.id] ? ' done' : ''}" data-bed="${b.id}" aria-pressed="${F.u.bed === b.id}" title="${esc(b.name)} · ${esc(b.style)}"><span>${esc(b.code)}${st.beds[b.id] ? ' ✓' : ''}</span><span class="num">${Math.round(b.areaM2)} m²</span></button>`).join('')}</div>`;
  }
  if (F.u.bed) h += '</details>';
  if (!F.u.bed) { h += `<p class="note">Select a bed in the list or click one on the canvas (dashed outlines). Beds you leave alone keep the existing reference planting.</p>`; el.innerHTML = h; bind(F, el); return; }
  const bed = beds.find((b) => b.id === F.u.bed); const cur = st.beds[F.u.bed]; const o = F.store.getObject(F.u.bed);
  h += `<hr><h2>${esc(bed.name)} <span class="aside">${Math.round(bed.areaM2)} m² · ${esc(bed.style)}</span></h2>`;
  if (cur && !F.u.preview) h += `<p class="small">Now: <b>${esc(LOGICS[cur.logic].name)}</b>, ${cur.cellIds.length} cells. ${esc(cur.adaptation.explanation)}</p>`;
  h += `<p class="small dim">${cur ? 'Choose a logic to preview a change' : 'Choose a spatial logic'}:</p><div class="logics">${Object.values(LOGICS).map((L) => { const r = F.u.thumbs && F.u.thumbs[L.id]; return `<button class="logic" data-logic="${L.id}" aria-pressed="${F.u.logic === L.id && (!!F.u.preview || (cur && cur.logic === L.id))}">${r ? thumb(r, o.geometry) : '<svg viewBox="0 0 110 74"></svg>'}<span class="nm">${esc(L.name)}</span><span class="ct">${r ? (r.ok ? `${r.cells.length} cells` : 'no cells') : 'computing…'}</span></button>`; }).join('')}</div>`;
  const pv = F.u.preview;
  if (pv) {
    const L = LOGICS[pv.logic]; const ad = pv.adaptation;
    h += `<h2>How it adapts</h2><p class="small">${esc(ad.explanation)}</p><ul class="small dim" style="margin:4px 0;padding-left:16px">${ad.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    const size = pv.params.size; const auto = pv.params.mode === 'auto';
    h += `<div class="slider"><label for="fsize">${esc(L.sizeLabel)}</label><input id="fsize" type="range" min="${L.minSize}" max="${L.maxSize}" step="0.5" value="${size}"><span class="num">${size} m</span></div>`;
    if (pv.logic !== 'organic') h += `<div class="slider"><label for="fang">Direction</label><input id="fang" type="range" min="0" max="179" step="1" value="${Math.round(pv.params.angle)}"><span class="num">${Math.round(pv.params.angle)}°</span></div>`;
    else h += `<div class="row small"><span>Layout</span><button class="lnk" data-a="reseed">Try another seed layout</button><span class="dim">seed ${pv.params.seed}</span></div>`;
    h += `<p class="row small"><span class="dim">${auto ? 'Chosen automatically' : 'Set by you'}</span>${auto ? '' : '<button class="lnk" data-a="auto">Back to automatic</button>'}<span class="dim">· ${pv.cells.length} cells, ${Math.round(pv.cells.reduce((a, c) => a + c.areaM2, 0))} m²</span></p>`;
    h += `<details><summary>Candidates compared (${ad.candidates})</summary><table class="members"><tr><th>size</th><th>angle</th><th>cells</th><th title="lower is better">score</th><th>mixed site conditions</th></tr>${ad.ranking.map((r, i) => `<tr${i === 0 ? ' style="font-weight:600"' : ''}><td>${r.size} m</td><td>${r.angle == null ? '—' : r.angle + '° ' + esc(r.angleWhy)}</td><td>${r.cells}</td><td class="num">${r.score}</td><td class="num">${Math.round(r.terms.mixedConditions * 100)} %</td></tr>`).join('')}</table><p class="dim xs">Score = 2 × slivers + 0.6 × size irregularity + w × share of cell area mixing known site conditions + v × misalignment with the path + 0.3 × count deviation (w, v depend on your objectives).</p></details>`;
    if (cur) {
      const imp = P.structureImpact(F.u.bed, pv);
      h += `<div class="note warn">Replacing ${imp.oldCells} cells${imp.assignedCells ? `: ${imp.assignedCells} have mixes (${imp.plants.toLocaleString('en-US')} plants). New cells that overlap an old cell by half or more keep its mix (${imp.carried} cells); the rest start unassigned.` : '.'} Other beds are not touched.</div>
        <div class="row"><button class="btn-p" data-a="confirm">Replace cells</button>${imp.assignedCells ? '<button class="btn-s" data-a="confirmclear">Replace and clear mixes</button>' : ''}<button class="lnk" data-a="cancel">Cancel</button></div>`;
    } else h += `<div class="row" style="margin-top:10px"><button class="btn-p" data-a="confirm">Confirm ${pv.cells.length} cells</button><button class="lnk" data-a="cancel">Cancel</button></div>`;
  } else if (cur) h += `<p class="row small" style="margin-top:10px"><button class="lnk" data-a="unstructure">Give this bed back to the reference planting</button></p>`;
  el.innerHTML = h; bind(F, el);
}
function bind(F, el) {
  el.querySelectorAll('[data-bed]').forEach((b) => (b.onclick = () => { if (F.u.preview && F.u.preview.bedId !== b.dataset.bed) { F.toast('Confirm or cancel the preview first.'); return; } selectBed(F, b.dataset.bed); }));
  el.querySelectorAll('[data-logic]').forEach((b) => (b.onclick = () => choose(F, b.dataset.logic)));
  const sz = el.querySelector('#fsize'); if (sz) { sz.oninput = () => (sz.nextElementSibling.textContent = sz.value + ' m'); sz.onchange = () => { F.u.params = { ...F.u.params, size: +sz.value, angle: F.u.preview && F.u.preview.params.mode === 'manual' ? F.u.preview.params.angle : F.u.params.angle }; regen(F); }; }
  const an = el.querySelector('#fang'); if (an) { an.oninput = () => (an.nextElementSibling.textContent = an.value + '°'); an.onchange = () => { F.u.params = { ...F.u.params, angle: +an.value, size: F.u.preview.params.size }; regen(F); }; }
  const a = (k, fn) => { const x = el.querySelector(`[data-a=${k}]`); if (x) x.onclick = fn; };
  a('reseed', () => { F.u.params = { ...F.u.params, seed: (F.u.preview.params.seed || 1) + 6 }; regen(F); });
  a('auto', () => { F.u.params = {}; regen(F); });
  a('cancel', () => { F.u.preview = null; F.u.logic = F.P.state.beds[F.u.bed] ? F.P.state.beds[F.u.bed].logic : null; F.render(); });
  const commit = (remap) => { const pv = F.u.preview; const r = F.P.commitStructure(F.u.bed, pv, { remap }); if (r && r.ok === false) { F.toast(r.error || 'not committed', { err: true }); return; } F.u.preview = null; F.u.thumbs = null; F.toast(`${pv.cells.length} cells confirmed in ${F.P.bedCode(pv.bedId)}. Select another bed or continue.`); F.u.bed = null; F.ctx.fit(); F.render(); };
  a('confirm', () => commit('overlap')); a('confirmclear', () => commit('none'));
  a('unstructure', () => { const b = F.u.bed; F.P.removeStructure(b); F.u.bed = null; F.toast(`${F.P.bedCode(b)} shows the reference planting again (undo to restore your cells).`); F.render(); });
}
export function inspector() { return null; }
