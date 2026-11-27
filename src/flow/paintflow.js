// What the workflow draws on the shared canvas. Called by paint.js for the plan AND for the 3D ground texture (o.texture),
// so both views show the same cells and overlays. Plants themselves are drawn by the site painters from the model draft;
// the live brush's staged plants are drawn here (same symbol language) until pointer-up commits them.
// Diagram and Performance views are computed from the actual geometry and instances — never a texture or a decoration.
import { tracePoly, rgba } from '../style.js';
import { plantSymbol } from '../paint.js';
import { bbox, inside } from './spatial.js';

const INK = '#27241F', RUST = '#B04F36', CAR = '#B7894D', OLIVE = '#3B5538', PAPER = '#F7F3EA', WARN = '#9A3F26';
const RES_RAMP = ['#F3EEE4', '#F0D9A8', '#E2A85C', '#C56B33', '#8A3B1E'];
const SLOT_COL = { base: '#6F8F5E', overlay: '#B04F36', ephemeral: '#7A5E92' };

function hatch(c, T, g, color, step, lw = 1) {
  const b = g._bb || bbox(g); const p0 = T(b[0], b[3]), p1 = T(b[2], b[1]);
  c.save(); c.beginPath(); tracePoly(c, g, T); c.clip('evenodd'); c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  const w = p1[0] - p0[0], h = p1[1] - p0[1];
  for (let k = -h; k < w; k += step) { c.moveTo(p0[0] + k, p0[1] + h); c.lineTo(p0[0] + k + h, p0[1]); }
  c.stroke(); c.restore();
}
const fillG = (c, T, g, col) => { c.beginPath(); tracePoly(c, g, T); c.fillStyle = col; c.fill('evenodd'); };
const strokeG = (c, T, g, col, lw, dash) => { c.beginPath(); tracePoly(c, g, T); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); };
const inView = (o, g, pad = 2) => { if (!o.vb) return true; const b = g._bb || (g._bb = bbox(g)); return !(b[2] < o.vb[0] - pad || b[0] > o.vb[2] + pad || b[3] < o.vb[1] - pad || b[1] > o.vb[3] + pad); };
const bedGeom = (F, id) => { const o = F.store.getObject(id); if (!o) return null; return o.geometry.type === 'Polygon' ? { type: 'MultiPolygon', coordinates: [o.geometry.coordinates] } : o.geometry; };
// a label only when it fits inside its cell on screen (no overlapping numbers at low zoom)
function label(c, T, cell, sc, text, { color = INK, bg = 'rgba(255,253,248,.88)', min = 2.2, force = false } = {}) {
  if (sc < min && !force) return; const [x, y] = T(cell.center[0], cell.center[1]); const fs = Math.max(9, Math.min(13, sc * 0.9));
  c.font = `500 ${fs}px "DM Mono", ui-monospace, Menlo, monospace`; const w = c.measureText(text).width + 6;
  if (!force && Math.sqrt(cell.areaM2) * sc < w * 1.15) return;
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = bg; c.fillRect(x - w / 2, y - fs / 2 - 2, w, fs + 4); c.fillStyle = color; c.fillText(text, x, y + 0.5);
}
function tag(c, x, y, lines, { color = INK, bg = 'rgba(255,253,248,.94)', border = null } = {}) {
  c.font = '600 12px "DM Sans", system-ui, sans-serif'; const w1 = c.measureText(lines[0]).width; c.font = '500 10.5px "DM Mono", ui-monospace, monospace'; const w2 = lines[1] ? c.measureText(lines[1]).width : 0;
  const w = Math.max(w1, w2) + 14, h = lines[1] ? 34 : 20; c.fillStyle = bg; c.beginPath(); c.roundRect ? c.roundRect(x - w / 2, y - h / 2, w, h, 3) : c.rect(x - w / 2, y - h / 2, w, h); c.fill(); if (border) { c.strokeStyle = border; c.lineWidth = 1.5; c.stroke(); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = color; c.font = '600 12px "DM Sans", system-ui, sans-serif'; c.fillText(lines[0], x, y - (lines[1] ? 7 : 0)); if (lines[1]) { c.font = '500 10.5px "DM Mono", ui-monospace, monospace'; c.fillStyle = rgba(INK, 0.75); c.fillText(lines[1], x, y + 8); }
}
const veil = (c, a) => { c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = rgba(PAPER, a); c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); };

export function paintFlow(F, c, T, o, phase) {
  const P = F.P, st = P.state, u = F.u; const tex = !!o.texture; const sc = o.scale || 10; const lw = tex ? 2.2 : 1;
  const stage = st.stage; const cells = P.allCells(); const mode = F.mode();
  // ---------------------------------------------------------------- Diagram / Performance replace the site as protagonist (plan)
  if (!tex && phase === 'top' && (mode === 'performance' || mode === 'diagram') && cells.length) {
    veil(c, mode === 'diagram' ? 0.9 : 0.62);
    if (mode === 'performance') paintPerformance(F, c, T, o, sc); else paintDiagram(F, c, T, o, sc);
    for (const id of new Set([...F.u.cells, ...(F.u.issue && P.perf ? (P.perf.issues.find((x) => x.id === F.u.issue)?.cells || []) : [])])) { const c0 = st.cells[id]; if (c0) strokeG(c, T, c0.geometry, INK, 2.2); }
    if (stage === 'explore') paintInspectMark(F, c, T, sc);
    return;
  }
  if (stage === 'define') return paintDefine(F, c, T, o, phase, tex, sc);
  if (stage === 'structure') { paintStructure(F, c, T, o, phase, tex, sc, cells, lw); if (!tex && phase === 'top' && F.u.env) paintConditions(F, c, T, o, sc, 'light'); return; }
  if (stage === 'explore') return paintExplore(F, c, T, o, phase, tex, sc, cells);
  // compose: cells tinted by their dominant mix; unplanted hatched; frozen marked
  if (phase === 'ground') {
    for (const c0 of cells) {
      if (!inView(o, c0.geometry)) continue; const inst = st.instances[c0.id];
      if (inst && inst.plants.length) { const m = P.mix(inst.mixId); if (m) fillG(c, T, c0.geometry, rgba(m.color, tex ? 0.16 : 0.11)); }
      else if (st.acknowledged[c0.id]) fillG(c, T, c0.geometry, 'rgba(255,255,255,.55)');
      else hatch(c, T, c0.geometry, rgba(INK, tex ? 0.22 : 0.08), tex ? 10 : 7, tex ? 1.2 : 0.6);
    }
    if (u.autoPreview) for (const p of u.autoPreview.proposals) { const c0 = st.cells[p.cellId]; const m = P.mix(p.mixId); if (c0 && m) { fillG(c, T, c0.geometry, rgba(m.color, 0.42)); strokeG(c, T, c0.geometry, INK, tex ? 2.5 : 1.2, tex ? [] : [5, 3]); } }
    return;
  }
  // top
  if (!tex && F.u.env) { const mix = F.brush.active && F.brush.active.mixId ? P.mix(F.brush.active.mixId) : null; paintConditions(F, c, T, o, sc, mix && F.u.envView === 'fit' ? 'fit' : 'light', mix); }
  for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; strokeG(c, T, c0.geometry, rgba(INK, tex ? 0.55 : sc > 6 ? 0.3 : 0.2), tex ? 1.6 : 0.6); if (st.locks[c0.id] && !tex) { hatch(c, T, c0.geometry, rgba(OLIVE, 0.35), 9, 0.8); strokeG(c, T, c0.geometry, OLIVE, 1.6, [2, 3]); } }
  if (tex) return;
  // the focused beds read as the work: their outline is stronger, the rest of the scope stays quieter
  if (u.focus) for (const id of u.focus) { const g = bedGeom(F, id); if (g && inView(o, g)) strokeG(c, T, g, INK, 1.8); }
  for (const id of u.cells) { const c0 = st.cells[id]; if (!c0) continue; c.save(); c.globalAlpha = 0.18; strokeG(c, T, c0.geometry, INK, 7); c.restore(); strokeG(c, T, c0.geometry, INK, 2.2); }
  const iss = F.u.issue && P._perf ? P._perf.issues.find((x) => x.id === F.u.issue) : null; if (iss) for (const id of iss.cells) { const c0 = st.cells[id]; if (c0) strokeG(c, T, c0.geometry, WARN, 2.4); }
  // live brush: the staged plants (real, validated) — drawn here so a region redraw shows them; ring / ghost: overlay
  const B = F.brush;
  if (B && B.stroke) { const mixCol = (B.stroke.mixId && P.mix(B.stroke.mixId) || {}).color || INK; const vb = o.vb;
    for (const cs of B.stroke.cells.values()) { const cb = cs.cell._bb; if (vb && cb && (cb[2] < vb[0] || cb[0] > vb[2] || cb[3] < vb[1] || cb[1] > vb[3])) continue;
      for (const p of cs.add.values()) { if (vb && (p.x < vb[0] - 1 || p.x > vb[2] + 1 || p.y < vb[1] - 1 || p.y > vb[3] + 1)) continue; const q = T(p.x, p.y); if (sc < 3.2) { c.fillStyle = rgba(SLOT_COL[p.slot] || INK, 0.85); c.fillRect(q[0] - 1, q[1] - 1, 2, 2); continue; } const sp = F.store.getObject(p.plantId); const rr = Math.max(1.1, p.spacing * 0.47 * sc); plantSymbol(c, sp, q, rr, sc, { rot: (p.x * 7.3 + p.y * 3.1) % 6.28 }); if (sc > 7) { c.beginPath(); c.arc(q[0], q[1], rr + 1, 0, 7); c.strokeStyle = rgba(mixCol, 0.5); c.lineWidth = 1; c.stroke(); } } } }
  if (sc > 2.6) for (const c0 of cells) if (inView(o, c0.geometry) && (sc > 14 || u.cells.has(c0.id))) { const inst = st.instances[c0.id]; let conflict = 0; if (inst) for (const p of inst.plants) if (p.fit === 'conflict') { conflict++; break; } label(c, T, c0, sc, (st.locks[c0.id] ? '❄ ' : '') + (conflict ? '! ' : '') + c0.n, { color: conflict ? WARN : INK, min: 3.5 }); }
}

// ---------------------------------------------------------------- Explore: the result itself (scope only, context optional)
function paintExplore(F, c, T, o, phase, tex, sc, cells) {
  const P = F.P, st = P.state, u = F.u; const scope = F.scopeBeds();
  if (phase === 'ground') {
    if (tex) return;
    for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; const inst = st.instances[c0.id]; if (!(inst && inst.plants.length)) { if (st.acknowledged[c0.id]) fillG(c, T, c0.geometry, 'rgba(255,255,255,.6)'); else hatch(c, T, c0.geometry, rgba(INK, 0.1), 6, 0.6); } }
    return;
  }
  if (tex) return;
  for (const id of scope) { const g = bedGeom(F, id); if (g && inView(o, g)) strokeG(c, T, g, rgba(INK, 0.75), 1.2); }
  if (sc > 9) for (const c0 of cells) if (inView(o, c0.geometry)) strokeG(c, T, c0.geometry, rgba(INK, 0.14), 0.6);
  for (const c0 of cells) if (st.locks[c0.id] && inView(o, c0.geometry)) strokeG(c, T, c0.geometry, OLIVE, 1.4, [2, 3]);
  // bed codes come from the site painter (one label per bed)
  paintInspectMark(F, c, T, sc);
}
// the inspected community: its real footprint outlined, the rest of the result quietened
function paintInspectMark(F, c, T, sc) {
  const g = F.u.inspect && F.u.inspect.geometry; if (!g) return;
  c.save(); c.beginPath(); c.rect(-1e4, -1e4, 3e4, 3e4); tracePoly(c, g, T); c.fillStyle = rgba(PAPER, 0.5); c.fill('evenodd'); c.restore();
  c.save(); c.globalAlpha = 0.25; strokeG(c, T, g, RUST, 8); c.restore(); strokeG(c, T, g, RUST, 2.2);
}

// ---------------------------------------------------------------- Conditions: light (assumption · crown proxy · unknown) or Mix fit
const L_COL = { sun: '#E7B84A', part: '#C9A84E', shade: '#5F7A8C' };
function paintConditions(F, c, T, o, sc, view, mix = null) {
  const P = F.P, st = P.state; const cells = P.allCells();
  const beds = st.stage === 'define' ? (F.u.candidate ? [...F.u.candidate] : F.scopeBeds()) : F.scopeBeds();
  if (view === 'fit' && mix) {
    const fit = F.fitMap ? F.fitMap(mix) : null; if (!fit) return;
    for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; const f = fit.get(c0.id); if (!f) continue; texture(c, T, c0.geometry, f.cat, sc); if (f.cat !== 'unknown' && f.cat !== 'blocked' && f.known < 0.5) dots(c, T, c0.geometry, rgba(INK, 0.3), 7); }
    // blocked: the paths inside the scope's extent and frozen cells (a separate code from a light conflict)
    const vb = o.vb; for (const p of P.pathGeoms()) { const b = p.g._bb || (p.g._bb = bbox(p.g)); if (vb && (b[2] < vb[0] || b[0] > vb[2] || b[3] < vb[1] || b[1] > vb[3])) continue; texture(c, T, p.g, 'blocked', sc); }
    return;
  }
  for (const id of beds) { const g = bedGeom(F, id); if (!g || !inView(o, g)) continue; const a = P.lightAssumption(id); if (a) texture(c, T, g, 'l-' + a, sc); else texture(c, T, g, 'l-unk', sc); }
  // crown proxy: the real crowns (NAIP) as probable shade — drawn over everything, never replaced by an assumption
  for (const t of F.ctx.cs._trees || []) { const q = T(t.x, t.y); const r = (t.r || 3) * sc; if (o.vb && (t.x + t.r < o.vb[0] || t.x - t.r > o.vb[2] || t.y + t.r < o.vb[1] || t.y - t.r > o.vb[3])) continue; c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fillStyle = rgba(L_COL.shade, 0.12); c.fill(); c.setLineDash([3, 3]); c.strokeStyle = rgba(L_COL.shade, 0.8); c.lineWidth = 1; c.stroke(); c.setLineDash([]); }
}
// one texture per state so the map never relies on colour alone
function texture(c, T, g, k, sc) {
  switch (k) {
    case 'match': fillG(c, T, g, rgba(OLIVE, 0.3)); break;
    case 'partial': fillG(c, T, g, rgba(OLIVE, 0.16)); hatch(c, T, g, rgba(RUST, 0.55), 9, 1.4); break;
    case 'conflict': fillG(c, T, g, rgba(RUST, 0.26)); hatch(c, T, g, rgba(RUST, 0.7), 6, 1); hatchX(c, T, g, rgba(RUST, 0.7), 6, 1); break;
    case 'unknown': dots(c, T, g, rgba(INK, 0.35), 7); break;
    case 'blocked': fillG(c, T, g, rgba(INK, 0.12)); hatch(c, T, g, rgba(INK, 0.45), 4, 0.9); break;
    case 'l-sun': fillG(c, T, g, rgba(L_COL.sun, 0.3)); break;
    case 'l-part': fillG(c, T, g, rgba(L_COL.sun, 0.16)); hatch(c, T, g, rgba(L_COL.shade, 0.5), 7, 1); break;
    case 'l-shade': fillG(c, T, g, rgba(L_COL.shade, 0.3)); hatch(c, T, g, rgba(L_COL.shade, 0.6), 4, 0.9); break;
    case 'l-unk': dots(c, T, g, rgba(INK, 0.3), 8); break;
    default: break;
  }
}
function hatchX(c, T, g, color, step, lw = 1) {
  const b = g._bb || bbox(g); const p0 = T(b[0], b[3]), p1 = T(b[2], b[1]);
  c.save(); c.beginPath(); tracePoly(c, g, T); c.clip('evenodd'); c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  const w = p1[0] - p0[0], h = p1[1] - p0[1]; for (let k = 0; k < w + h; k += step) { c.moveTo(p0[0] + k, p0[1]); c.lineTo(p0[0] + k - h, p0[1] + h); }
  c.stroke(); c.restore();
}
function dots(c, T, g, color, step) {
  const b = g._bb || bbox(g); const p0 = T(b[0], b[3]), p1 = T(b[2], b[1]);
  c.save(); c.beginPath(); tracePoly(c, g, T); c.clip('evenodd'); c.fillStyle = color; c.beginPath();
  for (let x = p0[0]; x < p1[0]; x += step) for (let y = p0[1]; y < p1[1]; y += step) { const ox = ((Math.floor(y / step)) % 2) * step / 2; c.moveTo(x + ox + 1, y); c.arc(x + ox, y, 1, 0, 7); }
  c.fill(); c.restore();
}

// ---------------------------------------------------------------- overlay canvas (every frame, cheap): brush, box, hover
export function paintOverlay(F, c, T, sc, o, cursor) {
  const P = F.P, st = P.state; const B = F.brush;
  // hover outline (bed or cell) from the stage's hoverAt
  const h = F.u.hoverObj; if (h && h.geometry && !B.active) { c.save(); c.globalAlpha = 0.2; strokeG(c, T, h.geometry, INK, 6); c.restore(); strokeG(c, T, h.geometry, INK, 1.6); }
  if (F._boxing) { const a = T(...F._boxing.a), b = T(...F._boxing.b); c.fillStyle = rgba(RUST, 0.08); c.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); c.strokeStyle = RUST; c.lineWidth = 1.2; c.setLineDash([5, 3]); c.strokeRect(Math.min(a[0], b[0]) + 0.5, Math.min(a[1], b[1]) + 0.5, Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); c.setLineDash([]); }
  if (!B || !B.active || !cursor) { if (B && B.active) F.hideChip(); return; }
  const m = B.active.mixId ? P.mix(B.active.mixId) : null; const r = B.active.r; const q = T(cursor[0], cursor[1]); const R = r * sc;
  const g = B.stroke ? null : B.ghost;
  if (g) {
    // the footprint: editable part tinted, the rest (path, frozen, outside the scope) hatched as clipped
    c.save(); c.beginPath(); c.arc(q[0], q[1], R, 0, 7); c.clip();
    c.fillStyle = rgba(INK, 0.1); c.fillRect(q[0] - R, q[1] - R, 2 * R, 2 * R);
    c.strokeStyle = rgba(INK, 0.35); c.lineWidth = 1; c.beginPath(); for (let k = -2 * R; k < 2 * R; k += 5) { c.moveTo(q[0] + k, q[1] + R); c.lineTo(q[0] + k + 2 * R, q[1] - R); } c.stroke();
    c.beginPath(); for (const id of g.cells) { const c0 = st.cells[id]; if (c0) tracePoly(c, c0.geometry, T); } c.fillStyle = PAPER; c.fill('nonzero'); c.fillStyle = rgba(m ? m.color : RUST, 0.16); c.fill('nonzero');
    c.restore();
    // what the stroke would do: plants that would appear, plants it would replace, candidates it would skip
    for (const p of g.removes) { const s = T(p.x, p.y); const k = Math.max(2, Math.min(5, p.spacing * 0.3 * sc)); c.strokeStyle = rgba(RUST, 0.75); c.lineWidth = 1.2; c.beginPath(); c.moveTo(s[0] - k, s[1] - k); c.lineTo(s[0] + k, s[1] + k); c.moveTo(s[0] + k, s[1] - k); c.lineTo(s[0] - k, s[1] + k); c.stroke(); }
    for (const p of g.adds) { const s = T(p.x, p.y); const rr = Math.max(1.6, Math.min(8, p.spacing * 0.42 * sc)); c.beginPath(); c.arc(s[0], s[1], rr, 0, 7); c.fillStyle = rgba(SLOT_COL[p.slot] || INK, p.fit === 'unknown' ? 0.28 : 0.55); c.fill(); if (p.fit === 'unknown' && sc > 8) { c.strokeStyle = rgba(INK, 0.5); c.lineWidth = 0.8; c.setLineDash([2, 2]); c.stroke(); c.setLineDash([]); } if (p.sub) { c.strokeStyle = CAR; c.lineWidth = 1.2; c.stroke(); } }
    for (const p of g.rejected) { if (p.why !== 'light') continue; const s = T(p.x, p.y); c.beginPath(); c.arc(s[0], s[1], Math.max(2, Math.min(5, 0.12 * sc)), 0, 7); c.strokeStyle = rgba(WARN, 0.85); c.lineWidth = 1; c.stroke(); }
  }
  c.beginPath(); c.arc(q[0], q[1], R, 0, 7); c.strokeStyle = m ? m.color : RUST; c.lineWidth = 2; c.setLineDash(B.active.mixId ? [] : [4, 3]); c.stroke(); c.setLineDash([]);
  if (B.active.edge === 'soft' && m) { c.beginPath(); c.arc(q[0], q[1], R * 0.55, 0, 7); c.strokeStyle = rgba(m.color, 0.6); c.lineWidth = 1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]); }
  c.beginPath(); c.arc(q[0], q[1], 2, 0, 7); c.fillStyle = INK; c.fill();
  // chip next to the cursor + live count in the brush bar
  const S = B.stroke; const live = document.getElementById('flive');
  if (S) { if (live) live.textContent = `+${S.added}${S.removed ? ` −${S.removed}` : ''}${S.rej.light ? ` · ${S.rej.light} skipped` : ''}`; F.setChip(`<b>+${S.added}</b>${S.removed ? ` · ${S.removed} replaced` : ''}${S.fit.substituted ? ` · ${S.fit.substituted} swapped` : ''}${S.rej.light ? ` · ${S.rej.light} skipped` : ''}`, q[0], q[1] + R * 0.2); return; }
  if (live) live.textContent = '';
  if (!g) { F.hideChip(); return; }
  F.setChip(chipFor(F, g, m), q[0], q[1] + R * 0.2);
}
function chipFor(F, g, m) {
  const P = F.P; const hh = g.here || {};
  if (!g.cells.length) return `<span class="bl">${esc(hh.blocked ? cap(hh.blocked) : 'Not plantable')}</span>${hh.name ? ` <span class="dim">${esc(hh.name)}</span>` : ''}`;
  const where = g.beds.length ? g.beds.map((b) => esc(P.bedCode(b))).join(' + ') : ''; const cell = hh.cell ? `·${hh.cell.n}` : '';
  const lt = hh.light ? (hh.light.value ? `${hh.light.value === 'part' ? 'part shade' : hh.light.value}${hh.light.source === 'assumption' ? ' (assumed)' : ' (crown proxy)'}` : 'light unknown') : '';
  const fit = hh.compat ? ({ match: '<span class="ok">fits</span>', partial: '<span class="pt">fits partly</span>', conflict: '<span class="bl">conflict</span>', unknown: '<span class="dim">fit unknown</span>' }[hh.compat.cat]) + (hh.compat.cat !== 'unknown' && hh.compat.known < 1 ? ` <span class="dim">(${Math.round(hh.compat.known * 100)} % of the recipe known)</span>` : '') : '';
  const S = g.stage; const parts = []; if (m) parts.push(`<b>+${g.adds.length}</b>`); if (g.removes.length) parts.push(`${g.removes.length} replaced`); if (S && S.kept) parts.push(`${S.kept} kept`); if (S && S.rej.light) parts.push(`${S.rej.light} skipped`);
  return `<b>${where}</b><span class="dim">${cell}</span>${lt ? ` <span class="dim">· ${esc(lt)}</span>` : ''}${fit ? ` · ${fit}` : ''}${hh.blocked ? ` <span class="bl">centre: ${esc(hh.blocked)}</span>` : ''}<br>${parts.join(' · ') || '<span class="dim">nothing to change here</span>'}`;
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------------------------------------------------------------- Define: candidate scope, strategy zones, kept areas
// candidate (not yet confirmed) = dashed rust outline; confirmed scope = solid ink outline; beds outside = quietened;
// kept reference planting = hatched. The selection reads from the map; the panel only confirms it.
function paintDefine(F, c, T, o, phase, tex, sc) {
  const P = F.P; const s = F.u.strategy || P.state.strategy; const cand = F.u.candidate || new Set(F.scopeBeds()); const pending = !!F.u.strategy || F.u.scopeDirty;
  const zoneOf = (id) => (s ? s.zones.find((z) => z.bedIds.includes(id)) : null);
  if (phase === 'ground') {
    for (const id of cand) { const g = bedGeom(F, id); if (!g) continue; const z = zoneOf(id); fillG(c, T, g, rgba(z ? z.color : RUST, tex ? 0.5 : 0.3)); if (F.u.zone && z && F.u.zone === z.id && !tex) fillG(c, T, g, rgba(z.color, 0.25)); }
    for (const id of (s && s.kept) || []) { const g = bedGeom(F, id); if (g) hatch(c, T, g, rgba(OLIVE, tex ? 0.5 : 0.4), tex ? 14 : 8, tex ? 2 : 1); }
    return;
  }
  if (tex) { for (const id of cand) { const g = bedGeom(F, id); if (g) strokeG(c, T, g, INK, 4); } return; }
  if (F.u.env) paintConditions(F, c, T, o, sc, 'light');
  // quieten every bed that is not in the selection (still visible, still clickable)
  for (const b of P.eligibleBeds()) { if (cand.has(b.id) || ((s && s.kept) || []).includes(b.id)) continue; const g = bedGeom(F, b.id); if (g && inView(o, g)) { fillG(c, T, g, rgba(PAPER, 0.5)); strokeG(c, T, g, rgba(INK, 0.25), 0.8, [3, 3]); } }
  for (const id of cand) { const g = bedGeom(F, id); if (!g || !inView(o, g)) continue; strokeG(c, T, g, pending ? RUST : INK, 1.8, pending ? [6, 4] : []); }
  if (sc > 2.2) for (const id of cand) { const g = bedGeom(F, id); if (!g || !inView(o, g)) continue; const b = g._bb || (g._bb = bbox(g)); const q = T((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); const a = P.eligibleBeds().find((x) => x.id === id); tag(c, q[0], q[1], sc > 4.5 ? [P.bedCode(id), `${Math.round(a ? a.areaM2 : 0)} m²`] : [P.bedCode(id)], { border: pending ? RUST : null }); }
  else if (s) for (const z of s.zones) { // far away: one tag per zone at its largest bed
    const big = z.bedIds.filter((id) => cand.has(id)).map((id) => ({ id, a: P.eligibleBeds().find((b) => b.id === id)?.areaM2 || 0 })).sort((a, b) => b.a - a.a)[0]; const g = big && bedGeom(F, big.id); if (!g) continue; const b = bbox(g); const q = T((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    tag(c, q[0], q[1], [z.name, `${z.systemName} · ${z.bedIds.length} beds`], { border: z.color });
  }
  for (const id of (s && s.kept) || []) { const g = bedGeom(F, id); if (!g) continue; const b = bbox(g); const q = T((b[0] + b[2]) / 2, (b[1] + b[3]) / 2); tag(c, q[0], q[1], ['Kept', 'reference planting'], { color: OLIVE }); }
}

// ---------------------------------------------------------------- Structure: every zone previewed at once
function paintStructure(F, c, T, o, phase, tex, sc, cells, lw) {
  const P = F.P, st = P.state, u = F.u; const pv = u.previews; const pvBeds = new Set(pv ? [...pv.keys()] : []);
  if (phase === 'ground') {
    for (const c0 of cells) { if (pvBeds.has(c0.bedId) || !inView(o, c0.geometry)) continue; const z = P.zoneOf(c0.bedId); fillG(c, T, c0.geometry, rgba(z ? z.color : OLIVE, c0.n % 2 ? 0.1 : 0.18)); strokeG(c, T, c0.geometry, rgba(INK, 0.5), lw); }
    if (!pv && st.strategy) for (const z of st.strategy.zones) for (const id of z.bedIds) if (!st.beds[id]) { const g = bedGeom(F, id); if (g) strokeG(c, T, g, rgba(z.color, 0.9), tex ? 3 : 1.4, [5, 4]); }
    return;
  }
  if (pv) for (const [bedId, r] of pv) {
    if (!r || !r.ok) continue; const z = P.zoneOf(bedId); const col = z ? z.color : RUST; const g = bedGeom(F, bedId);
    if (g && !tex) fillG(c, T, g, 'rgba(255,253,248,.6)');
    for (const c0 of r.cells) { if (!inView(o, c0.geometry)) continue; fillG(c, T, c0.geometry, rgba(col, c0.n % 2 ? 0.2 : 0.36)); strokeG(c, T, c0.geometry, col, tex ? 2.5 : 1.2); }
    if (g) strokeG(c, T, g, u.bed === bedId ? INK : rgba(INK, 0.6), tex ? 4 : u.bed === bedId ? 2.4 : 1.2);
  }
  if (tex) return;
  if (st.strategy && st.strategy.guides) for (const gd of st.strategy.guides) { c.beginPath(); gd.forEach(([x, y], i) => { const q = T(x, y); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.strokeStyle = RUST; c.lineWidth = 2.5; c.setLineDash([8, 5]); c.stroke(); c.setLineDash([]); }
  if (u.drawGuide && u.drawGuide.length > 1) { c.beginPath(); u.drawGuide.forEach(([x, y], i) => { const q = T(x, y); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.strokeStyle = RUST; c.lineWidth = 2.5; c.stroke(); }
  if (u.numbers !== false) {
    if (pv) for (const [, r] of pv) if (r && r.ok) for (const c0 of r.cells) if (inView(o, c0.geometry)) label(c, T, c0, sc, String(c0.n), { color: WARN, min: 3 });
    for (const c0 of cells) if (!pvBeds.has(c0.bedId) && inView(o, c0.geometry)) label(c, T, c0, sc, String(c0.n), { min: 3 });
  }
  if (u.bed) { const g = bedGeom(F, u.bed); if (g) strokeG(c, T, g, INK, 2.6); }
}

// ---------------------------------------------------------------- Performance: 1 m pixels of flowering plants per m² (month)
function paintPerformance(F, c, T, o, sc) {
  const P = F.P, st = P.state, K = F.K; const m = F.month(); const grp = st.view.group || null; const cells = P.allCells();
  const pix = new Map(); const unk = new Map(); const any = new Map(); const key = (x, y) => `${Math.floor(x)},${Math.floor(y)}`;
  for (const c0 of cells) { const inst = st.instances[c0.id]; if (!inst || !inView(o, c0.geometry)) continue;
    for (const p of inst.plants) { const k = key(p.x, p.y); any.set(k, (any.get(k) || 0) + 1); const r = K.resourceIn(p.plantId, m);
      if (r === 'yes') { if (grp) { const t = K.traits(p.plantId); if (t.pollinators.status === 'unknown' || !t.pollinators.value.includes(grp)) continue; } pix.set(k, (pix.get(k) || 0) + 1); } else if (r === 'unknown') unk.set(k, (unk.get(k) || 0) + 1); } }
  const col = (n) => RES_RAMP[n <= 0 ? 0 : n < 1 ? 1 : n < 2 ? 2 : n < 3 ? 3 : 4];
  const px = sc; const gap = sc > 8 ? 1 : 0;
  for (const [k, n] of any) { const [i, j] = k.split(',').map(Number); const q = T(i, j + 1); const f = pix.get(k) || 0; const u2 = unk.get(k) || 0;
    if (f) { c.fillStyle = col(f); c.fillRect(q[0] + gap / 2, q[1] + gap / 2, px - gap, px - gap); }
    else if (u2 >= n / 2) { c.fillStyle = 'rgba(255,253,248,.9)'; c.fillRect(q[0] + gap / 2, q[1] + gap / 2, px - gap, px - gap); c.strokeStyle = rgba(INK, 0.45); c.lineWidth = 0.7; c.beginPath(); c.moveTo(q[0] + 1, q[1] + px - 1); c.lineTo(q[0] + px - 1, q[1] + 1); c.stroke(); }
    else { c.fillStyle = RES_RAMP[0]; c.fillRect(q[0] + gap / 2, q[1] + gap / 2, px - gap, px - gap); if (sc > 6) { c.strokeStyle = rgba(INK, 0.18); c.lineWidth = 0.6; c.strokeRect(q[0] + 1.5, q[1] + 1.5, px - 3, px - 3); } } }
  for (const c0 of cells) if (inView(o, c0.geometry)) strokeG(c, T, c0.geometry, rgba(INK, 0.45), 0.8);
  // continuity proxy: resource cells linked (solid: shared boundary; dashed: across a path ≤ 3 m); separate groups and isolated ringed
  const b = P.perf && P.perf.byMonth[m]; if (!b) return;
  const comp = new Map(); b.components.forEach((cp, i) => cp.cells.forEach((id) => comp.set(id, i)));
  c.strokeStyle = rgba(INK, 0.7); c.lineWidth = 1.3; c.beginPath();
  for (const c0 of cells) { if (!comp.has(c0.id)) continue; for (const n of c0.neighbors) { if (n.id < c0.id || !comp.has(n.id)) continue; const q = st.cells[n.id]; const p1 = T(...c0.center), p2 = T(...q.center); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); } }
  c.stroke(); c.setLineDash([3, 3]); c.beginPath();
  for (const l of P.links()) { if (!comp.has(l.a) || !comp.has(l.b)) continue; const p1 = T(...st.cells[l.a].center), p2 = T(...st.cells[l.b].center); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); }
  c.stroke(); c.setLineDash([]);
  for (const c0 of cells) { if (!comp.has(c0.id)) continue; const q = T(...c0.center); const i = comp.get(c0.id); c.beginPath(); c.arc(q[0], q[1], 3, 0, 7); c.fillStyle = i === 0 ? INK : WARN; c.fill(); if (i > 0) { c.beginPath(); c.arc(q[0], q[1], 8, 0, 7); c.strokeStyle = WARN; c.lineWidth = 1.4; c.stroke(); } }
}

// ---------------------------------------------------------------- Diagram: structure · mix · arrangement · layers (actual data)
function paintDiagram(F, c, T, o, sc) {
  const P = F.P, st = P.state, K = F.K; const d = st.view.diagram || 'arrangement'; const cells = P.allCells();
  // reference grid (1 m, 5 m emphasised) under everything, in world coordinates
  if (o.vb && sc > 4) { const vb = o.vb; c.lineWidth = 0.5; for (let x = Math.floor(vb[0]); x <= vb[2]; x++) { if (sc < 9 && x % 5) continue; const a = T(x, vb[1]), b2 = T(x, vb[3]); c.strokeStyle = x % 5 ? 'rgba(39,36,31,.05)' : 'rgba(39,36,31,.11)'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); } for (let y = Math.floor(vb[1]); y <= vb[3]; y++) { if (sc < 9 && y % 5) continue; const a = T(vb[0], y), b2 = T(vb[2], y); c.strokeStyle = y % 5 ? 'rgba(39,36,31,.05)' : 'rgba(39,36,31,.11)'; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b2[0], b2[1]); c.stroke(); } }
  for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; const z = P.zoneOf(c0.bedId);
    if (d === 'structure') { fillG(c, T, c0.geometry, rgba(z ? z.color : OLIVE, c0.n % 2 ? 0.14 : 0.26)); strokeG(c, T, c0.geometry, z ? z.color : OLIVE, 1.3); }
    else strokeG(c, T, c0.geometry, rgba(INK, 0.35), 0.8); }
  if (d === 'structure') { for (const c0 of cells) if (inView(o, c0.geometry)) label(c, T, c0, sc, c0.label, { min: 4 }); return; }
  for (const c0 of cells) { const inst = st.instances[c0.id]; if (!inst || !inView(o, c0.geometry)) continue;
    for (const p of inst.plants) { const q = T(p.x, p.y); if (o.vb && (p.x < o.vb[0] - 1 || p.x > o.vb[2] + 1 || p.y < o.vb[1] - 1 || p.y > o.vb[3] + 1)) continue;
      if (d === 'mix') { const m = P.mix(p.mixId); const col = m ? m.color : '#999'; const r = p.slot === 'base' ? Math.max(1.2, 0.16 * sc) : p.slot === 'overlay' ? Math.max(2, 0.26 * sc) : Math.max(0.8, 0.08 * sc);
        c.beginPath(); c.arc(q[0], q[1], r, 0, 7); if (p.slot === 'overlay') { c.strokeStyle = col; c.lineWidth = Math.max(1, sc * 0.05); c.stroke(); } else { c.fillStyle = rgba(col, p.slot === 'ephemeral' ? 0.9 : 0.75); c.fill(); } }
      else if (d === 'layers') { const r = p.slot === 'base' ? Math.max(1, 0.12 * sc) : p.slot === 'overlay' ? Math.max(1.8, 0.2 * sc) : Math.max(0.7, 0.06 * sc); c.beginPath(); c.arc(q[0], q[1], r, 0, 7); c.fillStyle = rgba(SLOT_COL[p.slot] || INK, p.slot === 'overlay' ? 0.85 : 0.6); c.fill(); }
      else { // arrangement: actual x / y, circle = mature spread proxy (labelled as proxy), species colour
        const sp = F.store.getObject(p.plantId); const t = K.traits(p.plantId); const R = Math.max(0.6, (t.spreadM || 0.5) / 2 * sc); const col = (sp && (sp.displayFlower || sp.displayLeaf)) || '#8C9C82';
        c.beginPath(); c.arc(q[0], q[1], R, 0, 7); c.fillStyle = rgba(col, p.slot === 'base' ? 0.18 : 0.32); c.fill(); c.strokeStyle = rgba(col, 0.75); c.lineWidth = 0.6; c.stroke();
        c.beginPath(); c.arc(q[0], q[1], Math.max(0.9, Math.min(2.6, sc * 0.08)), 0, 7); c.fillStyle = rgba(INK, 0.8); c.fill(); }
    } }
}
