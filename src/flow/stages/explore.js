// Explore (V3): the RESULT, in its own layout. A read-only projection of the finished design (result snapshot = design
// revision, fingerprint of the real instances, scope, knowledge version, performance version) — never a second editable
// state, never regenerated. The canvas shows only the design scope (site context on demand), the panel is closed, the
// bottom dock holds Plan · 3D · Diagram · Performance and the months. Clicking a real planted area opens the community
// inspector computed from the actual instance ids. Back to the design returns to Compose with its own camera and focus.
import { esc, num, pct, download } from '../ui.js';
import { MONTHS, GROUPS } from '../knowledge.js';
import { fingerprint } from '../project.js';
import { SYSTEMS, ROLE_DEF, ARRANGEMENTS } from '../mix.js';
import { LOGICS, bbox, inside } from '../spatial.js';
import { union, clip, bufferLine } from '../../design/geo.js';
import { tracePoly } from '../../style.js';

export function gate() { return { ok: true }; }
export function enter(F) {
  const P = F.P; const prev = F.u.result;
  F.u.result = { rev: P.state.rev || 0, fp: fingerprint(P.state.instances), at: new Date().toISOString(), scope: F.scopeBeds(), knowledgeVersion: F.K.version(), perfVersion: P.perf ? P.perf.version : null, prevRev: prev && prev.rev !== (P.state.rev || 0) ? prev.rev : null };
  F.u.inspect = null; F.u.panelOpen = false; F.u.cells.clear();
  setClip(F); F.applyPhenology(); fitResult(F, { animate: false });
}
export function leave(F) { F.plan.clipFn = null; F.u.inspect = null; if (F.scene && F.scene.setScopeFilter) F.scene.setScopeFilter(null); F.plan.request(); F.repaint(); }
// the design extent: scope beds' union, buffered 2 m so the real path gaps between beds stay readable
function scopeArea(F) {
  const ids = F.scopeBeds(); const key = ids.join(','); if (F._scopeArea && F._scopeArea.key === key) return F._scopeArea.g;
  const parts = []; for (const id of ids) { const g = F.bedGeom(id); if (!g) continue; parts.push(g); for (const poly of g.coordinates) { const ring = poly[0]; if (ring && ring.length > 2) { const b = bufferLine(ring.concat([ring[1]]), 4); if (b) parts.push(b); } } }
  let g = null; try { g = union(parts); } catch { g = null; } F._scopeArea = { key, g }; return g;
}
function setClip(F) {
  const g = F.u.context ? null : scopeArea(F); F.plan.clipFn = g ? (ctx, T) => { ctx.beginPath(); tracePoly(ctx, g, T); ctx.clip('nonzero'); } : null; F.plan.request();
  // 3D: the design's plants and the trees around them only (terrain and built forms stay as ground); the ground texture
  // outside the scope is veiled by the flow painter
  if (F.scene && F.scene.setScopeFilter) { const s = F.store; const b = F.boundsOf(F.scopeBeds().map((id) => F.bedGeom(id))); F.scene.setScopeFilter(g && b ? (i) => { if (s.inst.k[i] === 1) return true; const L = s.instanceLayer(i); if (L !== 'veg.trees' && L !== 'siteveg.trees') return false; const x = s.ix(i), y = s.iy(i); return x > b[0] - 4 && x < b[2] + 4 && y > b[1] - 4 && y < b[3] + 4; } : null); }
  F.repaint();
}
export function scopeVeil(F) { return F.u.context ? null : (F._scopeArea && F._scopeArea.g) || null; }
function fitResult(F, opts) { const b = F.boundsOf(F.scopeBeds().map((id) => F.bedGeom(id))); if (b) F.focusBounds(b, 3, opts); }

export function bottom() { return { msg: '', next: null }; }
// ---------------------------------------------------------------- top-right chrome
export function xbar(F) {
  const P = F.P; const r = F.u.result || {}; const t = P.totals(); const perf = P.perf; const snaps = P.snapshots();
  return `<button class="btn-s back" data-x="back">← Design</button>
    <span class="xr"><b>${esc(P.state.name)}</b><span class="mono xs" title="Design revision of this result; it updates when you change the design and come back">r${r.rev}${r.prevRev != null ? ` · was r${r.prevRev}` : ''} · ${num(t.plants)} plants · ${perf ? Math.round(perf.plantedAreaM2 || perf.assignedAreaM2).toLocaleString('en-US') : '—'} m² planted</span></span>
    <span class="xg"><button class="lnk" data-x="save">Save option</button><button class="lnk" data-x="compare" aria-pressed="${!!F.u.cmpOpen}" ${snaps.length ? '' : 'disabled title="Save an option first"'}>Compare${snaps.length ? ` (${snaps.length})` : ''}</button><button class="lnk" data-x="export">Export</button></span>
    <span class="xg"><label class="chk sm" title="Show the site around the design"><input type="checkbox" data-x="context" ${F.u.context ? 'checked' : ''}> Site context</label><button class="lnk" data-x="details" aria-pressed="${!!F.u.panelOpen}">${F.u.panelOpen ? 'Hide details' : 'Details'}</button></span>`;
}
export function bindXbar(F, el) {
  const P = F.P; const x = (k, fn) => { const b = el.querySelector(`[data-x=${k}]`); if (b) b[k === 'context' ? 'onchange' : 'onclick'] = fn; };
  x('back', () => F.go('compose'));
  x('save', () => saveSnap(F));
  x('compare', () => { F.u.cmpOpen = !F.u.cmpOpen; F.u.panelOpen = F.u.cmpOpen || F.u.panelOpen; openPanel(F); });
  x('export', () => download(`${P.state.name.replace(/\W+/g, '-')}.gp.json`, { ...P.exportData(), result: F.u.result }));
  x('context', (e) => { F.u.context = e.target.checked; setClip(F); F.renderPanel(); });
  x('details', () => { F.u.panelOpen = !F.u.panelOpen; openPanel(F); });
}
function openPanel(F) { F.shell.classList.toggle('x-panel', !!F.u.panelOpen); F.render(); if (F.u.panelOpen) F.panel.scrollTop = 0; }
function saveSnap(F) { const r = F.P.saveSnapshot(`Option ${String.fromCharCode(65 + F.P.snapshots().length % 26)}`); if (!r.ok) { F.toast(esc(r.error), { err: true }); return; } const back = F.P.snapshots().find((s) => s.id === r.snapshot.id); F.toast(back && back.fingerprint === fingerprint(F.P.state.instances) ? `Saved “${esc(r.snapshot.name)}” (read back: ${back.fingerprint}).` : 'Saved, but the read-back differs — export the design to be safe.', { err: !back }); F.renderPanel(); }

// ---------------------------------------------------------------- canvas: click a real community, hover outline
export function onCanvasClick(F, x, y) {
  const g = community(F, x, y);
  if (!g) { if (F.u.inspect) closeInspect(F); return; }
  if (!F.u.inspect) F.u.returnCam = { ...F.plan.view };
  F.u.inspect = g; const b = g.bbox; const w = Math.max(14, b[2] - b[0], b[3] - b[1]); const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  F.focusBounds([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], 1); F.render();
}
export function onCloseInspector(F) { closeInspect(F, true); }
function closeInspect(F, quiet) { F.u.inspect = null; if (F.u.returnCam && F.ctx.st.view === 'plan') { const v = F.u.returnCam; F.u.returnCam = null; const b = [v.cx - F.plan.w / 2 / v.scale, v.cy - F.plan.h / 2 / v.scale, v.cx + F.plan.w / 2 / v.scale, v.cy + F.plan.h / 2 / v.scale]; Object.assign(F.plan.view, v); F.plan.request(); void b; } if (!quiet) F.render(); }
export function hoverAt(F, x, y) {
  const g = community(F, x, y, { light: true }); if (!g) return null;
  return { key: g.key, geometry: g.geometry, chip: `<b>${g.mixes.map((m) => esc(m.name)).join(' + ')}</b> <span class="dim">${num(g.plants.length)} plants · ${g.cellIds.length} cell${g.cellIds.length === 1 ? '' : 's'}</span>` };
}
// the planted group under a point: the fragments covering it (all layers), extended to the same gesture in other cells
export function community(F, x, y, { light = false } = {}) {
  const P = F.P, st = P.state; const cell = F.cellAt(x, y); if (!cell) return null;
  const a = st.assignments[cell.id]; const inst = st.instances[cell.id]; if (!a || !inst || !inst.plants.length) return null;
  const here = a.fragments.filter((f) => !f.geometry || inside(f.geometry, x, y)); if (!here.length) return null;
  // same gesture = same mix, origin and timestamp in other cells (a brush stroke or one Auto Compose / fill gesture)
  const sig = (f) => `${f.mixId}|${f.origin}|${f.at}`; const sigs = new Set(here.map(sig)); const frags = [];
  for (const [cid, aa] of Object.entries(st.assignments)) { if (!aa) continue; for (const f of aa.fragments) if (sigs.has(sig(f)) && (cid === cell.id || f.origin === 'brush')) frags.push({ cellId: cid, f }); }
  const fids = new Set(frags.map((q) => q.f.id)); const cellIds = [...new Set(frags.map((q) => q.cellId))];
  const key = [...fids].sort().join(','); if (light && F._comm && F._comm.key === key) return F._comm;
  const plants = []; for (const c of cellIds) for (const p of (st.instances[c] || { plants: [] }).plants) if (fids.has(p.frag)) plants.push({ ...p, cellId: c });
  const geoms = frags.map((q) => (q.f.geometry ? clip(st.cells[q.cellId].geometry, q.f.geometry) : st.cells[q.cellId].geometry)).filter(Boolean);
  let geometry = null; try { geometry = union(geoms); } catch { geometry = geoms[0] || null; }
  const area = frags.reduce((s, q) => s + ((st.instances[q.cellId].byFrag[q.f.id] || {}).areaM2 || 0), 0);
  const mixes = [...new Set(frags.map((q) => q.f.mixId))].map((id) => P.mix(id)).filter(Boolean);
  // other fragments of the same cell at this point (layers stacked or neighbouring communities)
  const others = a.fragments.filter((f) => !fids.has(f.id) && (!f.geometry || inside(f.geometry, x, y)));
  const g = { key, cell, frags, fids, cellIds, plants, geometry, bbox: geometry ? bbox(geometry) : bbox(cell.geometry), areaM2: +area.toFixed(1), mixes, others, at: [x, y] };
  F._comm = g; return g;
}

// ---------------------------------------------------------------- the community inspector (actual instances, Rules mode)
export function inspector(F) {
  const g = F.u.inspect; if (!g) return null; const P = F.P, K = F.K, st = P.state; const m = F.month();
  const roleRows = new Map(); const bySp = new Map(); const byLayer = new Map();
  for (const p of g.plants) { bySp.set(p.plantId, (bySp.get(p.plantId) || 0) + 1); const lk = `${p.mixId}|${p.layerId}`; const L = byLayer.get(lk) || { mixId: p.mixId, layerId: p.layerId, slot: p.slot, n: 0, sp: new Map(), fit: { match: 0, conflict: 0, unknown: 0 }, sub: 0, ls: { a: 0, p: 0 } }; L.n++; L.sp.set(p.plantId, (L.sp.get(p.plantId) || 0) + 1); L.fit[p.fit || 'unknown']++; if (p.sub) L.sub++; if (p.ls) L.ls[p.ls]++; byLayer.set(lk, L); roleRows.set(p.role, (roleRows.get(p.role) || 0) + 1); }
  const flower = { yes: 0, no: 0, unk: 0 }; for (const [id, n] of bySp) { const f = K.floweringIn(id, m); if (f === 'yes') flower.yes += n; else if (f === 'no') flower.no += n; else flower.unk += n; }
  const target = g.frags.reduce((s, q) => s + ((st.instances[q.cellId].byFrag[q.f.id] || {}).target || 0), 0);
  const origin = { brush: 'brush stroke', manual: 'cell fill', auto: 'Auto Compose', remap: 'kept through a restructure', migrated: 'migrated' }[g.frags[0].f.origin] || g.frags[0].f.origin;
  const mix0 = g.mixes[0]; const S = mix0 && SYSTEMS[mix0.system];
  let h = `<header class="ci-head"><h3>${g.mixes.map((x) => `<span class="sw" style="background:${esc(x.color)}"></span>${esc(x.name)} <span class="mono xs">v${x.version}</span>`).join(' + ')}</h3>
    <p class="xs dim">${esc(S ? S.name : 'Custom')} · ${esc(origin)} · ${g.cellIds.map((c) => esc(st.cells[c].label)).slice(0, 4).join(', ')}${g.cellIds.length > 4 ? ` +${g.cellIds.length - 4}` : ''} · ${g.areaM2} m²</p></header>`;
  h += `<div class="ci-grid"><div class="ci-sample">${sampleSvg(F, g)}${sectionSvg(F, g)}<p class="xs dim">4 × 3 m around your click · real positions · heights: nominal display values</p></div>
    <div class="ci-nums"><b class="big num">${num(g.plants.length)}</b><span>plants placed</span><span class="xs dim">target ≈ ${Math.round(target)} · ${(g.plants.length / Math.max(0.01, g.areaM2)).toFixed(1)} / m²</span>
    <div class="ci-month"><b>${MONTHS[m - 1]}</b> ${bar([[flower.yes, 'f-yes', 'known in flower'], [flower.no, 'f-no', 'known not in flower'], [flower.unk, 'f-unk', 'unknown']])}<span class="xs">${flower.yes} in flower · ${flower.unk} unknown</span></div></div></div>`;
  // layers: planned vs actual composition, density, spacing, light
  h += '<section class="ci-layers">';
  for (const L of byLayer.values()) {
    const mix = P.mix(L.mixId); const Ld = mix && mix.layers.find((q) => q.id === L.layerId); if (!Ld) continue; const key = Ld.basis === 'area' ? 'share' : 'proportion';
    const rows = Ld.members.map((q) => ({ id: q.plantId, plan: q[key] || 0, act: (L.sp.get(q.plantId) || 0) / L.n, n: L.sp.get(q.plantId) || 0, role: q.role, sp: q.spacingM }));
    for (const [id, n] of L.sp) if (!rows.some((r) => r.id === id)) rows.push({ id, plan: 0, act: n / L.n, n, role: '(swapped in)', extra: true });
    const area = g.frags.filter((q) => q.f.mixId === L.mixId).reduce((s, q) => s + ((st.instances[q.cellId].byFrag[q.f.id] || {}).areaM2 || 0), 0) || g.areaM2;
    h += `<details ${byLayer.size <= 2 ? 'open' : ''}><summary>${g.mixes.length > 1 ? `<span class="sw" style="background:${esc(mix.color)}" title="${esc(mix.name)}"></span>` : ''}<b>${esc(Ld.name)}</b> <span class="tag">${L.slot}</span> <span class="mono xs">${L.n} · ${(L.n / Math.max(0.01, area)).toFixed(2)} / m² · ${esc((ARRANGEMENTS[Ld.arrangement] || {}).name || Ld.arrangement)}</span></summary>
      <table class="members compact"><tr><th>plant</th><th>role</th><th>planned</th><th>placed</th><th class="num">n</th></tr>${rows.sort((a, b) => b.n - a.n).map((r) => `<tr${r.extra ? ' class="dim"' : ''}><td><i>${esc(K.traits(r.id).name)}</i></td><td class="xs">${esc(ROLE_DEF[r.role] ? ROLE_DEF[r.role].name : r.role)}</td><td>${pbar(r.plan)}</td><td>${pbar(r.act, r.act + 0.06 < r.plan ? 'short' : '')}</td><td class="num">${r.n}</td></tr>`).join('')}</table>
      <p class="xs dim">light: ${L.fit.match} fit · ${L.fit.conflict} conflict · ${L.fit.unknown} unknown${L.sub ? ` · ${L.sub} swapped for a layer-mate` : ''}${L.ls.a ? ' · from your assumption' : L.ls.p ? ' · from the crown proxy' : ''}</p></details>`;
  }
  h += '</section>';
  h += `<section class="ci-why"><h4>Why it is like this <span class="tag mode" title="Explanations are assembled from the recipe, the strategy rules and the knowledge records — not a language model">Rules</span></h4><ul class="xs">${whyLines(F, g, { roleRows, flower }).map((l) => `<li>${l}</li>`).join('')}</ul></section>`;
  h += `<div class="row wrap ci-act"><button class="btn-s" data-i="compose">Edit in Compose</button><button class="lnk" data-i="mix">Open the recipe</button><button class="lnk" data-i="know">Plants in Knowledge</button></div>`;
  return h;
}
function pbar(v, cls = '') { return `<span class="pbar ${cls}" title="${Math.round(v * 100)} %"><i style="width:${Math.max(1, Math.round(Math.min(1, v) * 46))}px"></i><em>${Math.round(v * 100)}</em></span>`; }
function bar(parts) { const tot = parts.reduce((s, p) => s + p[0], 0) || 1; return `<span class="sbar">${parts.map(([n, c, t]) => (n ? `<i class="${c}" style="flex:${n / tot}" title="${t}: ${n}"></i>` : '')).join('')}</span>`; }
// each line ties the area to its real configuration and to a record or rule — or says unknown
function whyLines(F, g, { roleRows, flower }) {
  const P = F.P, st = P.state, K = F.K; const out = []; const mix = g.mixes[0]; if (!mix) return out;
  const zone = P.zoneOf(g.cell.bedId); const S = SYSTEMS[mix.system];
  if (zone) out.push(`<b>${esc(S ? S.name : mix.system)}</b> because the strategy zone “${esc(zone.name)}” (Define) chose it${zone.why.length ? `: ${esc(zone.why[0])}` : ''}. <span class="src">strategy rule</span>`);
  else out.push(`<b>${esc(S ? S.name : mix.system)}</b> is the system of the mix you painted here. <span class="src">recipe v${mix.version}</span>`);
  if (S) { const present = S.layers.map((L) => ({ L, roles: L.roles.filter((r) => roleRows.has(r)) })); const has = present.filter((x) => x.roles.length).map((x) => `${esc(x.L.name)} (${x.roles.map((r) => `${esc(ROLE_DEF[r].name)} ${roleRows.get(r)}`).join(', ')})`); const missing = present.filter((x) => !x.roles.length).map((x) => esc(x.L.name));
    out.push(`Roles that really grow here: ${has.join('; ') || 'none of the system’s named roles'}${missing.length ? `. Not present: ${missing.join(', ')}` : ''}. <span class="src">course slides ${esc(S.slides)} · counted from the placed plants</span>`); }
  const lg = st.beds[g.cell.bedId]; if (lg) { const base = mix.layers.find((L) => L.slot === 'base'); out.push(`Space: ${esc(LOGICS[lg.logic] ? LOGICS[lg.logic].name.toLowerCase() : lg.logic)} cells (${esc(st.cells[g.cellIds[0]].label)} is ${st.cells[g.cellIds[0]].areaM2} m²)${base ? `; the base is arranged as “${esc((ARRANGEMENTS[base.arrangement] || {}).name || base.arrangement)}” with a ${base.grainM || (ARRANGEMENTS[base.arrangement] || {}).grainM || '?'} m grain — ${esc((ARRANGEMENTS[base.arrangement] || {}).note || '')}` : ''}. <span class="src">structure + recipe</span>`); }
  const brushFrag = g.frags.find((q) => q.f.origin === 'brush');
  if (g.others.length) out.push(`Overlap: ${g.others.map((f) => { const m2 = P.mix(f.mixId); return `${esc(m2 ? m2.name : f.mixId)} ${esc(f.slots.join('+'))}`; }).join(', ')} also grow${g.others.length === 1 ? 's' : ''} at this point — ${g.others.some((f) => f.slots.some((s) => g.frags.some((q) => q.f.slots.includes(s)))) ? 'same layer: a transition (soft edge) or a partial replacement' : 'other layers stacked on the same ground (layering, not replacement)'}. <span class="src">fragments of this cell</span>`);
  else if (brushFrag) out.push(`${brushFrag.f.edge === 'soft' ? 'Soft-edged stroke: towards its rim part of the previous community was kept.' : `The stroke replaced the ${esc(brushFrag.f.slots.join(' + '))} layer inside its footprint only; other layers and the ground outside were not touched.`} <span class="src">brush fragment</span>`);
  const tm = st.brief.objectives.flowering.on ? st.brief.objectives.flowering.months : []; if (tm.length) { const sp = [...new Set(g.plants.map((p) => p.plantId))]; const cov = tm.map((mm) => (sp.some((id) => K.floweringIn(id, mm) === 'yes') ? 'yes' : sp.some((id) => K.floweringIn(id, mm) === 'unknown') ? 'unk' : 'no')); const gaps = tm.filter((_, i) => cov[i] === 'no'); const unk = tm.filter((_, i) => cov[i] === 'unk');
    out.push(`Brief months: ${tm.length - gaps.length - unk.length} of ${tm.length} with a known flowering plant here${gaps.length ? `; none known in ${gaps.map((x) => MONTHS[x - 1]).join(', ')}` : ''}${unk.length ? `; unknown in ${unk.map((x) => MONTHS[x - 1]).join(', ')}` : ''}. <span class="src">${sp.some((id) => K.traits(id).bloom.source === 'illustrative') ? 'illustrative teaching layer — not verified' : 'knowledge records'}</span>`); }
  const conflicts = g.plants.filter((p) => p.fit === 'conflict').length; const unknown = g.plants.filter((p) => p.fit !== 'match' && p.fit !== 'conflict').length;
  out.push(conflicts ? `${conflicts} plant${conflicts === 1 ? '' : 's'} kept against the recorded light (you allowed conflicts). <span class="src">light rule</span>` : unknown === g.plants.length ? 'Light fit unknown: no light value for this ground (no assumption, no crown) or no light record for the plants. <span class="src">unknown, not assumed</span>' : `No known light conflict${unknown ? ` · ${unknown} unknown` : ''}. <span class="src">light rule</span>`);
  return out;
}
function sampleSvg(F, g) {
  const [x0, y0] = g.at; const W = 4, H = 3; const w = 200, h = 150; const s = w / W; const st = F.P.state; let out = `<svg class="ci-plan" viewBox="0 0 ${w} ${h}" aria-label="Real plants in a 4 by 3 metre window">`;
  out += `<rect width="${w}" height="${h}" fill="#FFFDF8"/>`; for (let i = 1; i < W; i++) out += `<path d="M${i * s} 0V${h}" stroke="rgba(39,36,31,.06)"/>`; for (let j = 1; j < H; j++) out += `<path d="M0 ${j * s}H${w}" stroke="rgba(39,36,31,.06)"/>`;
  const cells = F.P.allCells().filter((c) => { const b = c._bb || (c._bb = bbox(c.geometry)); return !(b[2] < x0 - W / 2 || b[0] > x0 + W / 2 || b[3] < y0 - H / 2 || b[1] > y0 + H / 2); });
  const pts = []; for (const c of cells) for (const p of (st.instances[c.id] || { plants: [] }).plants) if (Math.abs(p.x - x0) <= W / 2 && Math.abs(p.y - y0) <= H / 2) pts.push(p);
  const order = { base: 0, overlay: 1, ephemeral: 2 }; pts.sort((a, b) => order[a.slot] - order[b.slot]);
  for (const p of pts) { const sp = F.store.getObject(p.plantId); const col = (sp && (sp.displayFlower || sp.displayLeaf)) || '#8C9C82'; const cx = ((p.x - x0 + W / 2) * s).toFixed(1), cy = (h - (p.y - y0 + H / 2) * s).toFixed(1); const mine = g.fids.has(p.frag);
    out += p.slot === 'base' ? `<circle cx="${cx}" cy="${cy}" r="${Math.max(1.4, p.spacing * s * 0.42).toFixed(1)}" fill="${col}" fill-opacity="${mine ? 0.5 : 0.18}"/>` : p.slot === 'overlay' ? `<circle cx="${cx}" cy="${cy}" r="${Math.max(2.2, 0.16 * s).toFixed(1)}" fill="none" stroke="${col}" stroke-opacity="${mine ? 1 : 0.35}" stroke-width="1.6"/>` : `<circle cx="${cx}" cy="${cy}" r="1.2" fill="${col}"/>`; }
  return out + `<path d="M${w / 2 - 4} ${h / 2}h8M${w / 2} ${h / 2 - 4}v8" stroke="#B04F36"/></svg>`;
}
function sectionSvg(F, g) {
  const [x0, y0] = g.at; const W = 4; const w = 200, h = 54; const s = w / W; const maxH = 1.8; let out = `<svg class="ci-sec" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M0 ${h - 2}H${w}" stroke="rgba(39,36,31,.4)"/>`;
  const strip = g.plants.filter((p) => Math.abs(p.y - y0) < 0.35 && Math.abs(p.x - x0) <= W / 2).sort((a, b) => a.x - b.x);
  for (const p of strip) { const t = F.K.traits(p.plantId); const hh = (Math.min(maxH, t.heightM || 0.5) / maxH) * (h - 8); const x = (p.x - x0 + W / 2) * s; const sp = F.store.getObject(p.plantId); const lf = (sp && sp.displayLeaf) || '#7D8F6A'; const fl = (sp && sp.displayFlower) || lf; const grassy = /grass|sedge/.test(t.plantType || '');
    if (grassy) for (const d of [-2, 0, 2]) out += `<path d="M${x.toFixed(1)} ${h - 2}q${d * 0.6} -${(hh * 0.6).toFixed(1)} ${d * 1.3} -${hh.toFixed(1)}" stroke="${lf}" fill="none" stroke-width=".8"/>`;
    else out += `<path d="M${x.toFixed(1)} ${h - 2}v-${hh.toFixed(1)}" stroke="${lf}"/><circle cx="${x.toFixed(1)}" cy="${(h - 2 - hh).toFixed(1)}" r="${p.slot === 'overlay' ? 2.6 : 1.8}" fill="${F.K.floweringIn(p.plantId, F.month()) === 'yes' ? fl : F.K.floweringIn(p.plantId, F.month()) === 'no' ? lf : '#C9C4B6'}"/>`; }
  return out + '</svg>';
}
export function bindInspector(F, el) {
  const P = F.P; const g = F.u.inspect; if (!g) return; const x = (k, fn) => { const b = el.querySelector(`[data-i=${k}]`); if (b) b.onclick = fn; };
  x('compose', () => { const bed = g.cell.bedId; F.sv('compose').focus = [bed]; F.sv('compose').cam = null; F.u.cells = new Set(g.cellIds); P.setView({ selectedMix: g.mixes[0] && g.mixes[0].id }); F.go('compose'); F.focusOn([bed]); F.toast(`${esc(P.bedCode(bed))}: ${g.cellIds.length} cell${g.cellIds.length === 1 ? '' : 's'} of this community selected.`); });
  x('mix', () => { const id = g.mixes[0] && g.mixes[0].id; F.go('compose'); if (id) { F.u.editor = { mixId: id, draft: structuredClone(P.mix(id)), changes: [] }; F.renderPanel(); } });
  x('know', () => F.openKnowledge({ plants: [...new Set(g.plants.map((p) => p.plantId))], from: 'explore' }));
}

// ---------------------------------------------------------------- details panel (closed by default): month, issues, options
export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const perf = P.perf; const m = F.month(); const b = perf && perf.byMonth[m];
  if (!perf || !perf.instances) { el.innerHTML = '<p class="note">No plants yet: compose first.</p>'; return; }
  let h = `<section class="blk kpi"><h2>${MONTHS[m - 1]}</h2>
    <div class="kgrid"><div><b class="big">${num(b.floweringInstances)}</b><span>known in flower</span></div><div><b class="big">${pct(b.floweringFraction)}</b><span>of ${num(b.placed)} placed</span></div><div><b class="big">${b.floweringPerM2 ?? '—'}</b><span>/ m² planted</span></div><div><b class="big">${num(b.unknownInstances)}</b><span>unknown</span></div></div>
    <p class="xs dim">Denominators: ${num(b.placed)} placed plants · ${Math.round(perf.plantedAreaM2).toLocaleString('en-US')} m² actually planted (footprint) of ${Math.round(perf.totalAreaM2).toLocaleString('en-US')} m² structured. Resource in ${b.resourceCells} cells · ${b.components.length} connected group${b.components.length === 1 ? '' : 's'} (largest ${pct(b.largestComponentShare)} of the resource area).</p>
    ${monthBars(F, perf)}
    <details><summary class="xs">Definitions · versions</summary><ul class="xs">${Object.entries(perf.definitions).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}<li><b>versions</b>: ${esc(perf.version)} · knowledge ${esc(perf.inputVersion)} · result r${F.u.result ? F.u.result.rev : '?'}</li></ul><p class="xs">Trait coverage of placed plants: flowering ${pct(perf.coverage.bloom)}, groups ${pct(perf.coverage.pollinators)}, light ${pct(perf.coverage.light)}; illustrative values used by ${pct(perf.coverage.illustrative)}.</p></details></section>`;
  h += `<section class="blk"><h2>To look at</h2><ul class="issues">${perf.issues.slice(0, 12).map((i) => `<li class="${i.severity}${F.u.issue === i.id ? ' on' : ''}"><button class="lnk b" data-issue="${esc(i.id)}">${esc(i.title)}</button><p class="xs dim">${esc(i.detail)}</p><span class="row xs">${i.actions.map((a) => `<button class="lnk" data-act="${a}|${esc(i.id)}">${{ editMix: 'Edit the mix', reassign: 'Repaint these cells', knowledge: 'Add knowledge' }[a]}</button>`).join('')}</span></li>`).join('') || '<li class="dim small">Nothing flagged.</li>'}</ul></section>`;
  const snaps = P.snapshots();
  h += `<section class="blk"><h2>Options</h2>${snaps.length ? `<ul class="snaps">${snaps.map((s) => `<li><b>${esc(s.name)}</b> <span class="xs dim">${new Date(s.at).toLocaleString()} · ${num(s.totals.plants)} plants</span><span class="row xs"><button class="lnk" data-cmp="${s.id}" aria-pressed="${F.u.cmp === s.id}">compare</button><button class="lnk" data-restore="${s.id}">restore</button></span></li>`).join('')}</ul>` : '<p class="xs dim">Save this result as an option to compare it later.</p>'}
    ${F.u.cmp ? compareHtml(F, snaps.find((s) => s.id === F.u.cmp)) : ''}</section>`;
  el.innerHTML = h; bind(F, el);
}
function monthBars(F, perf) {
  const area = Math.max(1, perf.plantedAreaM2 || perf.assignedAreaM2);
  const mx = Math.max(0.01, ...Object.values(perf.byMonth).map((b) => (b.floweringPerM2 || 0) + b.unknownInstances / area)); const tg = F.P.state.brief.objectives.flowering.months;
  return `<div class="bars" role="group" aria-label="Plants in flower per m² by month">${Object.values(perf.byMonth).map((b) => { const u = b.unknownInstances / area; return `<button data-m="${b.month}" aria-pressed="${b.month === F.month()}" title="${b.label}: ${b.floweringInstances} in flower, ${b.unknownInstances} unknown" class="${tg.includes(b.month) ? 'tgt' : ''}"><span style="height:${(100 * (b.floweringPerM2 || 0)) / mx}%"></span><span class="u" style="height:${(100 * u) / mx}%;bottom:${(100 * (b.floweringPerM2 || 0)) / mx}%"></span></button>`; }).join('')}</div><div class="barlab">${MONTHS.map((x) => `<span>${x[0]}</span>`).join('')}</div>`;
}
function compareHtml(F, s) {
  if (!s) return ''; const P = F.P; const m = F.month();
  const sameK = s.knowledgeVersion === F.K.version(); const other = P.perfOf(s.design); const cur = P.perf; const a = other.byMonth[m], b = cur.byMonth[m];
  const row = (k, f) => `<tr><td>${k}</td><td class="num">${f(a, other)}</td><td class="num">${f(b, cur)}</td></tr>`;
  return `<div class="compare"><p class="xs">${sameK ? 'Same knowledge version.' : '<b>Knowledge changed since this option was saved</b>: both recomputed now with the current knowledge.'} ${MONTHS[m - 1]} · design scope only.</p>
    <table class="members"><tr><th></th><th>${esc(s.name)}</th><th>current</th></tr>${row('planted m²', (x, p) => Math.round(p.plantedAreaM2))}${row('placed plants', (x) => num(x.placed))}${row('in flower', (x) => num(x.floweringInstances))}${row('fraction', (x) => pct(x.floweringFraction))}${row('/ m² planted', (x) => x.floweringPerM2)}${row('unknown', (x) => num(x.unknownInstances))}${row('resource groups', (x) => x.components.length)}</table></div>`;
}
function bind(F, el) {
  const P = F.P;
  el.querySelectorAll('.bars [data-m]').forEach((b) => (b.onclick = () => F.setMonth(+b.dataset.m)));
  el.querySelectorAll('[data-issue]').forEach((b) => (b.onclick = () => { const i = P.perf.issues.find((x) => x.id === b.dataset.issue); F.u.issue = F.u.issue === i.id ? null : i.id; if (i.month) P.setView({ month: i.month }); if (i.cells.length) F.focusCells(i.cells); F.render(); }));
  el.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => { const [act, id] = b.dataset.act.split('|'); const i = P.perf.issues.find((x) => x.id === id); act2(F, act, i); }));
  el.querySelectorAll('[data-cmp]').forEach((b) => (b.onclick = () => { F.u.cmp = F.u.cmp === b.dataset.cmp ? null : b.dataset.cmp; F.renderPanel(); }));
  el.querySelectorAll('[data-restore]').forEach((b) => (b.onclick = () => { const r = P.restoreSnapshot(b.dataset.restore); if (r.ok === false) F.toast(esc(r.error), { err: true }); else F.toast('Option restored (undo returns to the previous design).'); }));
}
// a problem → back to Compose with its selection
export function act2(F, act, i) {
  const P = F.P;
  if (act === 'knowledge') { F.openKnowledge({ plants: i.species || [], issue: i.id }); return; }
  F.u.cells = new Set(i.cells.slice(0, 60)); F.go('compose');
  if (act === 'editMix') { const mid = i.mixId || (i.cells[0] && P.state.assignments[i.cells[0]] && P.state.assignments[i.cells[0]].mixId) || (P.state.mixes[0] && P.state.mixes[0].id); if (mid) { F.u.editor = { mixId: mid, draft: structuredClone(P.mix(mid)), changes: [] }; F.renderPanel(); } }
  else F.toast(`${i.cells.length} cell${i.cells.length === 1 ? '' : 's'} selected: paint over them, fill them or Auto Compose.`);
}
// diagram key: real counts of what the active sub-view draws
export function diagramKey(F, d) {
  const P = F.P; const cells = P.allCells(); let n = 0; const bySlot = { base: 0, overlay: 0, ephemeral: 0 }; const byMix = new Map();
  for (const c of cells) for (const p of (P.state.instances[c.id] || { plants: [] }).plants) { n++; bySlot[p.slot] = (bySlot[p.slot] || 0) + 1; byMix.set(p.mixId, (byMix.get(p.mixId) || 0) + 1); }
  if (d === 'structure') { const a = cells.reduce((s, c) => s + c.areaM2, 0); return `<p class="xs mono">${cells.length} cells · mean ${(a / Math.max(1, cells.length)).toFixed(1)} m²</p>`; }
  if (d === 'mix') return `<ul class="lg">${[...byMix.entries()].map(([id, k]) => { const m = P.mix(id); return `<li><i class="sw" style="background:${esc(m ? m.color : '#999')}"></i>${esc(m ? m.name : id)} <span class="mono">${num(k)}</span></li>`; }).join('')}</ul><p class="xs dim">filled = base · ring = overlay · dot = bulbs</p>`;
  if (d === 'layers') return `<ul class="lg"><li><i class="sw" style="background:#6F8F5E"></i>Base <span class="mono">${num(bySlot.base)}</span></li><li><i class="sw" style="background:#B04F36"></i>Overlay <span class="mono">${num(bySlot.overlay)}</span></li><li><i class="sw" style="background:#7A5E92"></i>Bulbs <span class="mono">${num(bySlot.ephemeral)}</span></li></ul>`;
  return `<p class="xs">${num(n)} plants at their real x / y · circle = mature spread (display proxy)</p>`;
}
export { GROUPS };
