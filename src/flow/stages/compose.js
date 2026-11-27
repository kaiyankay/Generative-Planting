// Compose: understand the community first (a visual Mix palette), then design in space with ONE engine:
//   live Generative Brush (select a mix = brush on) · precise Cell Fill (select cells) · Auto Compose (preview → accept)
// all three write the same fragments and instances. The recipe editor changes layers (density / coverage / spacing /
// shares); a shared mix edit previews its impact and is applied to all its unfrozen fragments or as a local variant.
import { esc, plantName, num } from '../ui.js';
import { MONTHS } from '../knowledge.js';
import { SYSTEMS, ROLE_DEF, ARRANGEMENTS, editMix, makeMix, convertLegendRecipe, PALETTE, fromTemplate, layerDensity } from '../mix.js';
import { autoCompose } from '../compose.js';
import { suggestMixes, interpretEdit } from '../suggest.js';
import { mixCard, planPatch, ribbon, section, roleName } from '../mixviz.js';

export function gate(F) { const t = F.P.totals(); return t.plants > 0 ? { ok: true } : { ok: false, reason: 'Plant at least one area first (paint, fill or Auto Compose).' }; }
export function enter(F) {
  if (F.ctx.st.view !== 'plan') F.setMode('plan', { quiet: true });
  F.store.setViewState({ hidePlanting: false });
  if (!F.P.state.mixes.length) seedLibrary(F);
  if (!F.u.cells.size) F.focusBeds(Object.keys(F.P.state.beds));
}
const legend = (F) => ((F.ctx.mixFile && F.ctx.mixFile.mixes) || []).map((m, i) => convertLegendRecipe(m, { colorIndex: i, exists: (id) => !!F.store.getObject(id) }));
// the library starts with the Detroit legend recipe of each system the strategy uses (sourced, editable) — never invented
function seedLibrary(F) {
  const P = F.P; const sys = new Set((P.state.strategy ? P.state.strategy.zones : []).map((z) => z.system)); const lg = legend(F);
  for (const m of lg) if (sys.has(m.system) && !P.mix(m.id)) P.addMix(m, `reuse recipe ${m.name}`);
}
export function bottom(F) {
  const t = F.P.totals(); const g = gate(F);
  let msg = t.plants ? `<b>${num(t.plants)} plants</b> · ${t.species} species · ${t.assigned}/${t.cells} cells planted` : '<b>Compose</b>: pick a mix, then drag across the beds.';
  if (F.brush.active) msg = `Brush <b>${esc(F.brush.active.mixId ? (F.P.mix(F.brush.active.mixId) || {}).name : 'eraser')}</b> — drag across beds; paths are skipped; Esc cancels a stroke.`;
  if (F.u.autoPreview) msg = `Auto Compose proposes ${F.u.autoPreview.proposals.length} cells — accept or cancel.`;
  return { msg, next: { label: 'Continue to Explore →', enabled: g.ok, reason: g.reason, run: () => F.go('explore') } };
}
export function onCanvasClick(F, x, y, sel, { shift }) { const c = F.cellAt(x, y); if (c) F.selectCells([c.id], { add: shift }); else if (!shift) { F.u.cells.clear(); F.render(); } }

export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const sel = [...F.u.cells];
  const active = F.brush.active && F.brush.active.mixId; const cmp = F.u.compare || [];
  let h = `<header class="stage-head"><p class="kicker">3 · Compose</p><h1>Communities in space</h1><p class="task">Choose a mix to load the brush, then drag across the beds: plants grow while you move. Cells are filled by the same engine.</p></header>`;
  if (F.u.editor) { el.innerHTML = h + editorHtml(F); bindEditor(F, el); return; }
  h += `<section class="blk"><h2>Mix palette <span class="aside">${st.mixes.length} mix${st.mixes.length === 1 ? '' : 'es'}</span></h2><div class="palette">${st.mixes.map((m) => mixCard(F, m, { active: active === m.id, compare: cmp.includes(m.id), uses: P.usesOf(m.id).length })).join('') || '<p class="dim small">No mix yet — add one below.</p>'}</div>`;
  if (cmp.length === 2) h += compareHtml(F, cmp.map((id) => P.mix(id)).filter(Boolean));
  h += `</section>`;
  h += `<section class="blk tools"><h2>Design</h2><div class="toolrow">
    <button class="tool${F.brush.active && F.brush.active.mixId ? ' on' : ''}" data-a="brush" ${st.mixes.length ? '' : 'disabled'} title="Live brush with the selected mix (B)"><svg viewBox="0 0 24 24"><path d="M4 20c3 0 5-2 5-5l9-9a2 2 0 0 0-3-3l-9 9c-3 0-5 2-5 5z"/></svg>Brush</button>
    <button class="tool${F.brush.active && !F.brush.active.mixId ? ' on' : ''}" data-a="erase" title="Erase plants (target layers) under the brush"><svg viewBox="0 0 24 24"><path d="M4 16 13 7l6 6-7 7H7zM10 20h10"/></svg>Erase</button>
    <button class="tool" data-a="fill" ${sel.length && (P.state.view.selectedMix || active) ? '' : 'disabled'} title="Fill the selected cells completely with the selected mix"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16" stroke-dasharray="2 2"/></svg>Cell fill${sel.length ? ` (${sel.length})` : ''}</button>
    <button class="tool" data-a="auto" ${st.mixes.length ? '' : 'disabled'} title="Propose mixes for unplanted cells (preview first)"><svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>Auto compose</button></div>
    ${F.u.autoPreview ? autoHtml(F) : ''}
    <p class="xs dim">Brush ⌀ in metres (independent of zoom): <b>[</b> <b>]</b> or Alt + wheel. Paint in Plan; Axo shows the same plants.</p></section>`;
  h += `<section class="blk"><h2>Add a mix</h2>
    <p class="xs dim">Start from a Planting System (slides P34 / P41). Each template is filled from the Detroit legend recipe of that system where one exists.</p>
    <div class="systems">${Object.values(SYSTEMS).map((S) => `<button class="sysbtn" data-sys="${S.id}"><b>${esc(S.name)}</b><span class="xs">${esc(S.layers.map((L) => L.name).join(' · '))}</span></button>`).join('')}</div>
    <div class="row"><button class="btn-s" data-a="suggest">Suggest for ${sel.length ? 'the selected cells' : 'unplanted cells'} <span class="tag mode">Rules</span></button><details class="inline"><summary class="lnk">Reuse a legend recipe</summary>${legend(F).map((m) => `<button class="lnk xs" data-reuse="${esc(m.id)}">${esc(m.name)} (${esc(SYSTEMS[m.system].name)})</button>`).join('')}</details></div>
    ${F.u.suggestion ? suggestionHtml(F) : ''}</section>`;
  el.innerHTML = h; bind(F, el);
}
function compareHtml(F, [a, b]) {
  const row = (m) => { const pts = F._mixPatch && F._mixPatch.get(m.id + '@' + m.version); const n = pts ? pts.length : 0; return `<div class="cmpcol"><b style="color:${esc(m.color)}">${esc(m.name)}</b>${planPatch(F, m, { w: 150, h: 112 })}${section(F, m, { w: 150, h: 46 })}${ribbon(F, m, { w: 150 })}<p class="xs mono">${n} candidates / 12 m² · ${m.layers.map((L) => `${L.slot === 'base' ? 'base' : L.name.toLowerCase()} ${layerDensity(L).toFixed(1)}/m²`).join(' · ')}</p></div>`; };
  return `<div class="compare"><p class="xs dim">Same scale (4 × 3 m), same engine, same months.</p><div class="cmpgrid">${row(a)}${row(b)}</div></div>`;
}
function autoHtml(F) {
  const ap = F.u.autoPreview; const mixes = new Map(); for (const p of ap.proposals) mixes.set(p.mixId, (mixes.get(p.mixId) || 0) + 1);
  return `<div class="note"><b>Auto compose</b> — ${ap.proposals.length} cells (${esc(ap.scopeLabel)}): ${[...mixes.entries()].map(([id, n]) => `${esc(F.P.mix(id).name)} ${n}`).join(' · ')}<details><summary class="xs">Why, per cell</summary><ul class="xs">${ap.proposals.slice(0, 40).map((p) => `<li><b>${esc(F.P.state.cells[p.cellId].label)}</b> → ${esc(F.P.mix(p.mixId).name)}: ${esc(p.reasons)}</li>`).join('')}</ul><p class="xs dim">${esc(ap.rule)}</p></details><div class="row"><button class="btn-p" data-a="autoaccept">Accept · one undo step</button><button class="lnk" data-a="autocancel">Cancel</button></div></div>`;
}
function suggestionHtml(F) {
  const sg = F.u.suggestion; if (!sg.ok) return `<p class="note warn">${esc(sg.error || '')}</p>`;
  if (!sg.recipes.length) return `<div class="note">${esc(sg.guidance || 'No recipe could be proposed with the active knowledge.')}</div>`;
  return `<div class="sugg">${sg.mixes.map((m, i) => `<div class="sg"><b>${esc(m.name)}</b> <span class="xs dim">${esc(SYSTEMS[m.system].name)}</span>${ribbon(F, m)}<p class="xs">${esc((sg.recipes[i].gaps || []).slice(0, 2).join('; ') || 'covers the brief months with known flowering')}${sg.recipes[i].illustrativeMembers ? ` · <span class="tag illus">${sg.recipes[i].illustrativeMembers} illustrative</span>` : ''}</p><button class="btn-s" data-take="${i}">Add to palette</button></div>`).join('')}<p class="xs dim">Rules mode: greedy coverage of the brief months × groups from known traits — not a language model. Target: ${esc(sg.target.light)} light (${sg.target.cells} cells).</p></div>`;
}
function bind(F, el) {
  const P = F.P; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  el.querySelectorAll('.mixcard').forEach((c) => { const go = (e) => { if (e.target.closest('[data-edit],[data-cmp]')) return; const id = c.dataset.mix; P.setView({ selectedMix: id }); F.setBrush({ mixId: id, slots: null }); F.renderPanel(); }; c.onclick = go; c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(e); } }; });
  el.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { F.setBrush(null); F.u.editor = { mixId: b.dataset.edit, draft: structuredClone(P.mix(b.dataset.edit)), changes: [] }; F.renderPanel(); F.panel.scrollTop = 0; }));
  el.querySelectorAll('[data-cmp]').forEach((b) => (b.onclick = () => { const id = b.dataset.cmp; let c = F.u.compare || []; c = c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2); F.u.compare = c; F.renderPanel(); }));
  a('brush', () => { const id = P.state.view.selectedMix || (P.state.mixes[0] && P.state.mixes[0].id); if (id) F.setBrush({ mixId: id, slots: null }); F.renderPanel(); });
  a('erase', () => { F.setBrush({ mixId: null, slots: null }); F.renderPanel(); });
  a('fill', () => { const id = (F.brush.active && F.brush.active.mixId) || P.state.view.selectedMix; const ids = [...F.u.cells]; const r = P.assign(ids, id, { layers: F.brush.active && F.brush.active.slots }); if (r.ok === false) F.toast(r.error, { err: true }); else F.toast(`${P.mix(id).name} fills ${ids.length} cell${ids.length === 1 ? '' : 's'} — same engine as the brush.`); });
  a('auto', () => { const all = P.allCells(); const sel = [...F.u.cells]; const free = (c) => !(P.state.instances[c.id] && P.state.instances[c.id].plants.length) && !P.state.locks[c.id]; let scope = (sel.length ? sel.map((id) => P.state.cells[id]) : all).filter(free); let label = sel.length ? 'selected cells' : 'all unplanted cells'; if (!scope.length && sel.length) { scope = all.filter(free); label = 'all unplanted cells (the selection has none)'; } if (!scope.length) { F.toast('No unplanted, unfrozen cell left.'); return; } const r = autoCompose({ scopeCells: scope, allCells: all, assignments: P.state.assignments, mixes: P.state.mixes, K: F.K, brief: P.state.brief, links: P.links() }); F.u.autoPreview = { ...r, scopeLabel: label }; F.render(); });
  a('autoaccept', () => { const map = Object.fromEntries(F.u.autoPreview.proposals.map((p) => [p.cellId, p.mixId])); F.u.autoPreview = null; const r = P.assignMany(map); if (r.ok === false) F.toast(r.error, { err: true }); });
  a('autocancel', () => { F.u.autoPreview = null; F.render(); });
  el.querySelectorAll('[data-sys]').forEach((b) => (b.onclick = () => addFromSystem(F, b.dataset.sys)));
  el.querySelectorAll('[data-reuse]').forEach((b) => (b.onclick = () => { const m = legend(F).find((q) => q.id === b.dataset.reuse); const r = P.addMix(m, `reuse recipe ${m.name}`); if (r.ok === false) F.toast((r.errors || []).join('; '), { err: true }); }));
  a('suggest', () => suggest(F));
  el.querySelectorAll('[data-take]').forEach((b) => (b.onclick = () => { const m = F.u.suggestion.mixes[+b.dataset.take]; const r = P.addMix(m, `add suggested ${m.name}`); if (r.ok !== false) { F.u.suggestion = null; F.toast(`${m.name} added: select it to paint.`); } }));
}
function addFromSystem(F, sys) {
  const P = F.P; const src = legend(F).find((m) => m.system === sys);
  if (src) { const m = { ...structuredClone(src), id: `mix.${sys}.${P.state.mixes.length + 1}`, name: `${SYSTEMS[sys].name} (from ${src.name})`, color: PALETTE[P.state.mixes.length % PALETTE.length], origin: 'template', history: [{ version: 1, at: new Date().toISOString(), summary: `system template ${SYSTEMS[sys].name}, filled from the legend recipe ${src.name}` }] }; const r = P.addMix(m, `add ${m.name}`); if (r.ok !== false) { F.u.editor = { mixId: r.id, draft: structuredClone(P.mix(r.id)), changes: [] }; F.renderPanel(); } return; }
  F.toast(`No Detroit recipe for ${SYSTEMS[sys].name}: start from Suggest or add plants in the recipe editor.`);
  const t = fromTemplate(sys, {}, { id: `mix.${sys}.${P.state.mixes.length + 1}` }); if (!t.mix) F.toast(`Template ${SYSTEMS[sys].name} needs plants for: ${t.missing.join(', ')}.`);
}
function suggest(F) {
  const P = F.P; const sel = [...F.u.cells].map((id) => P.state.cells[id]).filter(Boolean); const cells = sel.length ? sel : P.allCells().filter((c) => !(P.state.instances[c.id] && P.state.instances[c.id].plants.length));
  const zone = cells.length ? P.zoneOf(cells[0].bedId) : null; const r = suggestMixes({ brief: P.state.brief, cells: cells.length ? cells : P.allCells(), K: F.K, prefs: P.state.knowledge.prefs, existingCount: P.state.mixes.length });
  r.mixes = (r.recipes || []).map((x, i) => makeMix({ id: `mix.rules.${P.state.mixes.length + i + 1}`, name: x.name, color: PALETTE[(P.state.mixes.length + i) % PALETTE.length], members: x.members, density: x.density, origin: 'rules', system: zone ? zone.system : 'matrix-based', rationale: x.rationale, uncertainty: [...(x.unknowns || []), ...(x.gaps || [])] }));
  F.u.suggestion = r; F.renderPanel();
}

// ---------------------------------------------------------------- recipe editor (layers)
function editorHtml(F) {
  const P = F.P; const ed = F.u.editor; const m = ed.draft; const base = P.mix(ed.mixId); const uses = P.usesOf(ed.mixId); const changed = m.version !== base.version || JSON.stringify(m.layers) !== JSON.stringify(base.layers);
  let h = `<div class="editor"><button class="lnk" data-a="close">← Mix palette</button><h2><span class="sw" style="background:${esc(m.color)}"></span>${esc(m.name)} <span class="aside">${esc(SYSTEMS[m.system] ? SYSTEMS[m.system].name : 'Custom')} · v${base.version}</span></h2>
    <div class="mv wide">${planPatch(F, m, { w: 200, h: 150, cache: false })}${section(F, m, { w: 200, h: 60 })}</div>${ribbon(F, m, { w: 200 })}
    <p class="xs dim">${esc(m.basis || '')}</p>`;
  for (const L of m.layers) {
    const key = L.basis === 'area' ? 'share' : 'proportion';
    h += `<section class="layer" data-layer="${L.id}"><header><b>${esc(L.name)}</b><span class="tag">${L.slot}</span><span class="xs dim">${L.basis === 'area' ? 'area shares · each at its own spacing' : L.basis === 'count' ? 'independent density over the base' : 'drifts: coverage × density in the drift'}</span><span class="num xs">${layerDensity(L).toFixed(2)} plants/m²</span></header>
      <div class="lparams"><label>Arrangement <select data-larr="${L.id}">${Object.entries(ARRANGEMENTS).map(([k, v]) => `<option value="${k}" ${L.arrangement === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
      ${L.basis === 'count' ? `<label>Density <input type="number" step="0.05" min="0.05" max="40" value="${L.density}" data-lden="${L.id}"> /m²</label>` : ''}
      ${L.basis === 'drift' ? `<label>Coverage <input type="number" step="5" min="1" max="100" value="${Math.round(L.coverage * 100)}" data-lcov="${L.id}"> %</label><label>In drift <input type="number" step="1" min="1" max="80" value="${L.densityInDrift}" data-ldd="${L.id}"> /m²</label>` : ''}</div>
      <table class="members"><tr><th>plant</th><th>role</th><th>${L.basis === 'area' ? 'area %' : '%'}</th>${L.basis === 'area' ? '<th>spacing</th>' : ''}<th></th></tr>${L.members.map((q) => `<tr><td>${plantName(F.store, q.plantId, { short: true })}<div class="xs dim">${traitBits(F, q.plantId)}</div></td><td><select data-role="${L.id}|${q.plantId}">${Object.entries(ROLE_DEF).filter(([, d]) => d.slot === L.slot || (L.slot === 'base' && d.slot === 'base')).map(([k, d]) => `<option value="${k}" ${q.role === k ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></td><td><input type="number" min="1" max="100" step="1" value="${Math.round(q[key] * 100)}" data-prop="${L.id}|${q.plantId}" aria-label="share"></td>${L.basis === 'area' ? `<td><input type="number" min="0.1" max="3" step="0.05" value="${q.spacingM}" data-sp="${L.id}|${q.plantId}" aria-label="spacing m"></td>` : ''}<td><button class="lnk xs" data-rm="${L.id}|${q.plantId}" aria-label="remove">×</button></td></tr>`).join('')}</table>
      <div class="row xs"><input list="fcat" placeholder="add a plant to ${esc(L.name)}…" data-addto="${L.id}" class="addp"></div></section>`;
  }
  h += `<datalist id="fcat">${F.K.catalogue().slice(0, 400).map((s) => `<option value="${esc(s.scientificName + (s.cultivar ? ` '${s.cultivar}'` : ''))}">`).join('')}</datalist>`;
  h += `<div class="ask"><input id="fask" placeholder="Ask for a change, e.g. “more spring bloom”, “less grass”"><button class="btn-s" data-a="ask">Apply <span class="tag mode">Rules</span></button></div>`;
  if (changed) {
    const pv = ed.preview || (ed.preview = P.previewMixEdit(ed.mixId, finalizeDraft(m, base)));
    const sel = [...F.u.cells].filter((c) => uses.includes(c));
    h += `<div class="note"><b>Impact</b>: ${uses.length} cells use this mix${pv.frozen.length ? ` (${pv.frozen.length} frozen — unchanged)` : ''}; its plants ${num(pv.before)} → <b>${num(pv.after)}</b>. Only fragments of this mix are re-filled; other mixes, other layers and frozen cells keep their plants.
      <div class="row"><button class="btn-p" data-a="applyall">Update all (${pv.uses.length} cells)</button><button class="btn-s" data-a="variant" ${sel.length ? '' : 'disabled'} title="${sel.length ? '' : 'Select the cells that should get the variant'}">Local variant for ${sel.length} selected</button><button class="lnk" data-a="revert">Revert</button></div></div>`;
  }
  return h + `<details><summary class="xs">History</summary><ul class="xs">${base.history.map((x) => `<li>v${x.version}: ${esc(x.summary)}</li>`).join('')}</ul></details></div>`;
}
function traitBits(F, id) { const t = F.K.traits(id); const b = t.bloom.status === 'unknown' ? 'flowering ?' : 'fl. ' + t.bloom.value.map((m) => MONTHS[m - 1]).join(' '); return esc(`${b} · light ${t.light.status === 'unknown' ? '?' : t.light.value.join('/')}${t.bloom.source === 'illustrative' ? ' · illustrative' : ''}`); }
function finalizeDraft(m, base) { return editMix({ ...base, layers: structuredClone(m.layers), name: m.name }, [], F_summary(base, m)); }
function F_summary(base, m) { const parts = []; for (const L of m.layers) { const B = base.layers.find((q) => q.id === L.id); if (!B) { parts.push(`+ layer ${L.name}`); continue; } if (B.density !== L.density) parts.push(`${L.name} density ${B.density} → ${L.density}`); if (B.coverage !== L.coverage) parts.push(`${L.name} coverage ${B.coverage} → ${L.coverage}`); if (B.arrangement !== L.arrangement) parts.push(`${L.name} ${B.arrangement} → ${L.arrangement}`); const bm = new Map(B.members.map((q) => [q.plantId, q])); for (const q of L.members) { const o = bm.get(q.plantId); if (!o) parts.push(`+ ${q.plantId.replace(/^sp\.(m-)?/, '')}`); else { const k = L.basis === 'area' ? 'share' : 'proportion'; if (Math.abs(o[k] - q[k]) > 0.0005) parts.push(`${q.plantId.replace(/^sp\.(m-)?/, '')} ${Math.round(o[k] * 100)} → ${Math.round(q[k] * 100)} %`); if (o.spacingM !== q.spacingM) parts.push(`${q.plantId.replace(/^sp\.(m-)?/, '')} spacing ${o.spacingM} → ${q.spacingM} m`); } } for (const id of bm.keys()) if (!L.members.some((q) => q.plantId === id)) parts.push(`− ${id.replace(/^sp\.(m-)?/, '')}`); } return parts.join(', ') || 'edited'; }
function bindEditor(F, el) {
  const P = F.P; const ed = F.u.editor; const m = ed.draft; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  const redo = (changes) => { const base = P.mix(ed.mixId); const cur = { ...base, layers: structuredClone(m.layers), version: base.version }; ed.draft = editMix(cur, changes); ed.draft.version = base.version; ed.preview = null; F.renderPanel(); };
  const Lid = (s) => s.split('|');
  el.querySelectorAll('[data-prop]').forEach((i) => (i.onchange = () => { const [L, id] = Lid(i.dataset.prop); redo([{ op: 'setProportion', layer: L, plantId: id, proportion: Math.max(1, +i.value) / 100, fix: true }]); }));
  el.querySelectorAll('[data-sp]').forEach((i) => (i.onchange = () => { const [L, id] = Lid(i.dataset.sp); redo([{ op: 'setSpacing', layer: L, plantId: id, value: +i.value }]); }));
  el.querySelectorAll('[data-role]').forEach((i) => (i.onchange = () => { const [L, id] = Lid(i.dataset.role); redo([{ op: 'setRole', layer: L, plantId: id, role: i.value }]); }));
  el.querySelectorAll('[data-rm]').forEach((i) => (i.onclick = () => { const [L, id] = Lid(i.dataset.rm); redo([{ op: 'remove', layer: L, plantId: id }]); }));
  el.querySelectorAll('[data-lden]').forEach((i) => (i.onchange = () => redo([{ op: 'setLayer', layer: i.dataset.lden, density: Math.max(0.05, +i.value) }])));
  el.querySelectorAll('[data-lcov]').forEach((i) => (i.onchange = () => redo([{ op: 'setLayer', layer: i.dataset.lcov, coverage: Math.max(0.01, Math.min(1, +i.value / 100)) }])));
  el.querySelectorAll('[data-ldd]').forEach((i) => (i.onchange = () => redo([{ op: 'setLayer', layer: i.dataset.ldd, densityInDrift: Math.max(1, +i.value) }])));
  el.querySelectorAll('[data-larr]').forEach((i) => (i.onchange = () => redo([{ op: 'setLayer', layer: i.dataset.larr, arrangement: i.value }])));
  el.querySelectorAll('[data-addto]').forEach((i) => (i.onchange = () => { const name = i.value.trim().toLowerCase(); const sp = F.K.catalogue().find((s) => (s.scientificName + (s.cultivar ? ` '${s.cultivar}'` : '')).toLowerCase() === name); if (!sp) { F.toast('Not in the catalogue: add new plants in Knowledge.', { err: true }); return; } const L = m.layers.find((q) => q.id === i.dataset.addto); redo([{ op: 'add', layer: L.id, plantId: sp.id, role: L.members[0] ? L.members[0].role : undefined, proportion: 0.15, spacingM: Math.max(0.25, Math.min(1.2, (sp.nominalSpreadM || 0.5) * 0.9)) }]); }));
  a('ask', () => { const t = el.querySelector('#fask').value; const r = interpretEdit(t, { ...P.mix(ed.mixId), layers: m.layers }, { K: F.K, months: P.state.brief.objectives.flowering.months }); if (!r.ok) { F.toast(r.error, { err: true, ms: 9000 }); return; } redo(r.changes); F.toast(`${r.method} Read: ${r.matched.join(', ')}`); });
  a('close', () => { F.u.editor = null; F.renderPanel(); });
  a('revert', () => { ed.draft = structuredClone(P.mix(ed.mixId)); ed.preview = null; F.renderPanel(); });
  const final = () => finalizeDraft(m, P.mix(ed.mixId));
  a('applyall', () => { const r = P.applyMixEdit(ed.mixId, final(), { scope: 'all' }); if (r.ok === false) { F.toast((r.errors || [r.error]).join('; '), { err: true }); return; } F.u.editor = { mixId: ed.mixId, draft: structuredClone(P.mix(ed.mixId)) }; F.toast('Mix updated: only its unfrozen fragments were re-filled.'); });
  a('variant', () => { const cells = [...F.u.cells].filter((c) => P.usesOf(ed.mixId).includes(c)); const r = P.applyMixEdit(ed.mixId, final(), { scope: 'variant', cells }); if (r.ok === false) { F.toast((r.errors || [r.error]).join('; '), { err: true }); return; } F.u.editor = null; F.toast(`Local variant for ${cells.length} cells; the shared mix is unchanged.`); });
}

// ---------------------------------------------------------------- selection inspector (cells)
export function inspector(F) {
  const P = F.P; const ids = [...F.u.cells]; if (!ids.length) return null;
  const cells = ids.map((id) => P.state.cells[id]).filter(Boolean); if (!cells.length) return null;
  if (cells.length > 1) { const n = cells.reduce((a, c) => a + ((P.state.instances[c.id] || {}).plants || []).length, 0); return `<h3>${cells.length} cells</h3><p class="small">${Math.round(cells.reduce((a, c) => a + c.areaM2, 0))} m² · ${num(n)} plants</p>${actions(F, cells)}`; }
  const c = cells[0]; const inst = P.state.instances[c.id]; const a = P.state.assignments[c.id]; const pc = P.perf && P.perf.perCell[c.id]; const cd = c.conditions || {};
  let h = `<h3>${esc(c.label)} <span class="aside">${c.areaM2} m² · ${esc(c.logic)}</span></h3><p class="xs dim">crown above: ${esc(cd.canopy ? cd.canopy.status : 'unknown')}${cd.canopy && cd.canopy.fraction != null ? ` (${Math.round(cd.canopy.fraction * 100)} %)` : ''} · path edge ${cd.pathEdge != null ? Math.round(cd.pathEdge * 100) + ' %' : '?'} · sun / moisture / pH unknown</p>`;
  if (inst && inst.plants.length) {
    const bySlot = {}; for (const p of inst.plants) bySlot[p.slot] = (bySlot[p.slot] || 0) + 1;
    h += `<p class="small"><b>${inst.plants.length}</b> plants (target ≈ ${Math.round(inst.target)}) · ${Object.entries(bySlot).map(([k, v]) => `${k} ${v}`).join(' · ')}</p>`;
    h += `<ul class="xs frags">${a.fragments.map((f) => { const m = P.mix(f.mixId); const q = inst.byFrag[f.id]; return `<li><span class="sw" style="background:${esc(m ? m.color : '#999')}"></span>${esc(m ? m.name : f.mixId)} v${f.mixVersion} · ${f.slots.join('+')} · ${f.geometry ? `${(q && q.areaM2) || '?'} m² ${f.origin}` : 'whole cell'} · ${q ? `${q.placed}/${Math.round(q.target)}` : ''}</li>`; }).join('')}</ul>`;
    if (pc && pc.adaptability) { const ft = pc.adaptability.fit; h += `<p class="xs">Light vs crown proxy: ${ft.match} match · ${ft.conflict} conflict · ${ft.unknown} unknown${ft.substituted ? ` · ${ft.substituted} swapped for a layer-mate` : ''}</p>`; }
    if (inst.notes.length) h += `<p class="xs dim">${esc(inst.notes.join(' · '))}</p>`;
  } else h += `<p class="small dim">${P.state.acknowledged[c.id] ? 'Left empty on purpose.' : 'Not planted yet.'}</p>`;
  return h + actions(F, cells);
}
function actions(F, cells) {
  const P = F.P; const frozen = cells.every((c) => P.state.locks[c.id]); const mid = (F.brush.active && F.brush.active.mixId) || P.state.view.selectedMix; const m = mid && P.mix(mid);
  return `<div class="row wrap">${m && !frozen ? `<button class="btn-s" data-i="fill">Fill with ${esc(m.name)}</button>` : ''}<button class="btn-s" data-i="freeze">${frozen ? 'Unfreeze' : 'Freeze'}</button>${!frozen ? '<button class="lnk" data-i="reseed">new arrangement</button><button class="lnk" data-i="clear">clear</button><button class="lnk" data-i="empty">leave empty</button>' : ''}</div>`;
}
export function bindInspector(F, el) {
  const P = F.P; const ids = [...F.u.cells]; const a = (k, fn) => { const x = el.querySelector(`[data-i=${k}]`); if (x) x.onclick = fn; };
  a('fill', () => { const mid = (F.brush.active && F.brush.active.mixId) || P.state.view.selectedMix; P.assign(ids, mid); });
  a('freeze', () => { const frozen = ids.every((c) => P.state.locks[c]); P.setLock(ids, !frozen); F.toast(frozen ? 'Unfrozen.' : `${ids.length} cell${ids.length === 1 ? '' : 's'} frozen: brush, fill, mix edits and restructuring skip them.`); });
  a('reseed', () => { for (const c of ids) P.reseed(c); });
  a('clear', () => P.clearCells(ids)); a('empty', () => P.clearCells(ids, { empty: true }));
}
export function paintCells(F, ids) { const mid = (F.brush.active && F.brush.active.mixId) || F.P.state.view.selectedMix; return F.P.assign(ids, mid); }
