// What the workflow draws on the shared canvas. Called by paint.js for the plan AND for the 3D ground texture (o.texture),
// so both views show the same cells and overlays. Plants themselves are drawn by the site painters from the model.
import { tracePoly, rgba } from '../style.js';
import { bbox } from './spatial.js';

const INK = '#252A25', PROP = '#B66D48', BOT = '#56694F', WARN = '#9A4F2E';
const GROUP_RAMP = ['#DDE7D6', '#B9CFAE', '#8FB07F', '#5F8A55', '#3E6638'];

function hatch(c, T, g, color, step, lw = 1) {
  const b = bbox(g); const p0 = T(b[0], b[3]), p1 = T(b[2], b[1]);
  c.save(); c.beginPath(); tracePoly(c, g, T); c.clip('evenodd'); c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  const w = p1[0] - p0[0], h = p1[1] - p0[1];
  for (let k = -h; k < w; k += step) { c.moveTo(p0[0] + k, p0[1] + h); c.lineTo(p0[0] + k + h, p0[1]); }
  c.stroke(); c.restore();
}
const fillG = (c, T, g, col) => { c.beginPath(); tracePoly(c, g, T); c.fillStyle = col; c.fill('evenodd'); };
const strokeG = (c, T, g, col, lw, dash) => { c.beginPath(); tracePoly(c, g, T); c.strokeStyle = col; c.lineWidth = lw; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); };
const inView = (o, g, pad = 2) => { if (!o.vb) return true; const b = g._bb || bbox(g); return !(b[2] < o.vb[0] - pad || b[0] > o.vb[2] + pad || b[3] < o.vb[1] - pad || b[1] > o.vb[3] + pad); };
function label(c, T, cell, sc, text, { color = INK, bg = 'rgba(255,255,255,.82)' } = {}) {
  if (sc < 2.2) return; const [x, y] = T(cell.center[0], cell.center[1]); const fs = Math.max(9, Math.min(13, sc * 0.9));
  c.font = `500 ${fs}px "DM Mono", ui-monospace, Menlo, monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 6; c.fillStyle = bg; c.fillRect(x - w / 2, y - fs / 2 - 2, w, fs + 4); c.fillStyle = color; c.fillText(text, x, y + 0.5);
}

export function paintFlow(F, c, T, o, phase) {
  const P = F.P, st = P.state, u = F.u; const tex = !!o.texture; const sc = o.scale || 10; const lw = tex ? 2.2 : 1;
  const stage = st.stage; const cells = P.allCells();
  if (stage === 'define') {
    if (phase === 'ground' && !tex) for (const c0 of cells) strokeG(c, T, c0.geometry, rgba(INK, 0.35), 0.6);
    return;
  }
  if (stage === 'structure') {
    if (phase === 'ground') {
      if (!u.bed && !tex) for (const b of P.eligibleBeds()) { const o2 = F.store.getObject(b.id); if (o2) strokeG(c, T, o2.geometry, rgba(PROP, st.beds[b.id] ? 0 : 0.75), 1.2, [5, 4]); }
      for (const c0 of cells) { if (u.preview && c0.bedId === u.preview.bedId) continue; if (!inView(o, c0.geometry)) continue; fillG(c, T, c0.geometry, rgba(BOT, 0.07)); strokeG(c, T, c0.geometry, rgba(INK, 0.55), lw); }
      if (u.bed) { const o2 = F.store.getObject(u.bed); if (o2) strokeG(c, T, o2.geometry, INK, tex ? 4 : 2); }
    } else {
      // the preview is drawn above the existing plants, over a light veil of the bed, so the proposed cells read clearly
      if (u.preview) { const o2 = F.store.getObject(u.preview.bedId); if (o2) fillG(c, T, o2.geometry, 'rgba(255,255,255,.62)'); for (const c0 of u.preview.cells) { fillG(c, T, c0.geometry, rgba(PROP, c0.n % 2 ? 0.14 : 0.26)); strokeG(c, T, c0.geometry, PROP, tex ? 2.5 : 1.4); } if (o2) strokeG(c, T, o2.geometry, INK, tex ? 4 : 2); }
      if (tex) return;
      if (u.preview) for (const c0 of u.preview.cells) label(c, T, c0, sc, String(c0.n), { color: WARN });
      else for (const c0 of cells) if (inView(o, c0.geometry)) label(c, T, c0, sc, String(c0.n));
    }
    return;
  }
  const assigned = st.assignments; const perf = P.perf;
  if (stage === 'compose') {
    if (phase === 'ground') {
      for (const c0 of cells) {
        if (!inView(o, c0.geometry)) continue; const a = assigned[c0.id];
        if (a && a.mixId) { const m = P.mix(a.mixId); if (m) fillG(c, T, c0.geometry, rgba(m.color, tex ? 0.18 : 0.26)); }
        if (!a || !a.mixId) { if (st.acknowledged[c0.id]) { fillG(c, T, c0.geometry, 'rgba(255,255,255,.55)'); } else hatch(c, T, c0.geometry, rgba(INK, tex ? 0.35 : 0.22), tex ? 10 : 6, tex ? 1.6 : 0.8); }
      }
      if (u.autoPreview) for (const p of u.autoPreview.proposals) { const c0 = st.cells[p.cellId]; const m = P.mix(p.mixId); if (c0 && m) { fillG(c, T, c0.geometry, rgba(m.color, 0.42)); strokeG(c, T, c0.geometry, INK, tex ? 2.5 : 1.2, tex ? [] : [5, 3]); } }
      if (u.paint) { const m = P.mix(u.paint.mixId); const ids = new Set([...(u.paint.stroke || []), ...(u.hover ? [u.hover] : [])]); for (const id of ids) { const c0 = st.cells[id]; if (c0 && m) { fillG(c, T, c0.geometry, rgba(m.color, u.paint.stroke && u.paint.stroke.has(id) ? 0.6 : 0.38)); strokeG(c, T, c0.geometry, INK, tex ? 3 : 1.6); } } }
    } else {
      for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; strokeG(c, T, c0.geometry, rgba(INK, tex ? 0.6 : 0.45), tex ? 1.6 : 0.7); }
      for (const id of u.cells) { const c0 = st.cells[id]; if (!c0) continue; if (!tex) { c.save(); c.globalAlpha = 0.18; strokeG(c, T, c0.geometry, INK, 7); c.restore(); } strokeG(c, T, c0.geometry, INK, tex ? 4 : 2.2); }
      if (!tex) for (const c0 of cells) { if (!inView(o, c0.geometry)) continue; const pc = perf && perf.perCell[c0.id]; const conflict = pc && pc.adaptability && pc.adaptability.status === 'conflict'; label(c, T, c0, sc, (conflict ? '! ' : '') + c0.n, { color: conflict ? WARN : INK }); }
    }
    return;
  }
  if (stage === 'explore') {
    const view = st.view.explore || 'planting'; const m = F.month();
    if (phase === 'ground') {
      for (const c0 of cells) {
        if (!inView(o, c0.geometry)) continue; const pc = perf && perf.perCell[c0.id]; if (!pc || pc.status !== 'planted') { if (view !== 'planting') hatch(c, T, c0.geometry, rgba(INK, 0.12), tex ? 12 : 7, tex ? 1.2 : 0.6); continue; }
        if (view === 'pollinator') { const s = pc.months[m]; if (s.state === 'resource') fillG(c, T, c0.geometry, rgba(GROUP_RAMP[Math.min(4, Math.max(0, s.groups.length ? Math.ceil(s.groups.length / 1.5) : 0))], 0.82)); else if (s.state === 'uncertain') { fillG(c, T, c0.geometry, 'rgba(255,255,255,.6)'); hatch(c, T, c0.geometry, rgba(INK, 0.5), tex ? 9 : 5, tex ? 1.6 : 0.8); } else fillG(c, T, c0.geometry, 'rgba(236,231,222,.85)'); }
        else if (view === 'adaptability') { const a = pc.adaptability; if (!a) continue; if (a.status === 'match') fillG(c, T, c0.geometry, rgba('#8FB07F', 0.7)); else if (a.status === 'conflict') fillG(c, T, c0.geometry, rgba(PROP, 0.7)); else { fillG(c, T, c0.geometry, 'rgba(255,255,255,.55)'); hatch(c, T, c0.geometry, rgba(INK, 0.45), tex ? 9 : 5, tex ? 1.6 : 0.8); } }
        else if (view === 'seasonality') fillG(c, T, c0.geometry, 'rgba(255,255,255,.35)');
      }
    } else {
      for (const c0 of cells) if (inView(o, c0.geometry)) strokeG(c, T, c0.geometry, rgba(INK, 0.4), tex ? 1.6 : 0.7);
      if (view === 'pollinator' && perf) { // continuity proxy: links between neighbouring resource cells of the month
        const b = perf.byMonth[m]; const res = new Set(b.components.flatMap((x) => x.cells)); const links = P.links(); c.strokeStyle = INK; c.lineWidth = tex ? 3 : 1.4; c.beginPath();
        for (const c0 of cells) { if (!res.has(c0.id)) continue; for (const n of c0.neighbors) { if (n.id < c0.id || !res.has(n.id)) continue; const q = st.cells[n.id]; const p1 = T(...c0.center), p2 = T(...q.center); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); } }
        c.stroke(); c.setLineDash(tex ? [] : [3, 3]); c.beginPath();
        for (const l of links) { if (!res.has(l.a) || !res.has(l.b)) continue; const p1 = T(...st.cells[l.a].center), p2 = T(...st.cells[l.b].center); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); }
        c.stroke(); c.setLineDash([]);
        for (const id of b.isolated) { const q = st.cells[id]; if (!q) continue; const p = T(...q.center); c.beginPath(); c.arc(p[0], p[1], tex ? 12 : 7, 0, 7); c.strokeStyle = WARN; c.lineWidth = tex ? 3 : 1.6; c.stroke(); }
      }
      if (view === 'seasonality' && perf && (!tex ? sc > 3 : true)) { // each placed plant: flowering / not / unknown this month (known traits only)
        const K = F.K;
        for (const c0 of cells) { const inst = st.instances[c0.id]; if (!inst || !st.assignments[c0.id] || !inView(o, c0.geometry)) continue;
          for (const p of inst.plants) { const q = T(p.x, p.y); const f = K.floweringIn(p.plantId, m); const r = Math.max(tex ? 2 : 1.6, p.spacing * 0.32 * sc);
            c.beginPath(); c.arc(q[0], q[1], r, 0, 7);
            if (f === 'yes') { const sp = F.store.getObject(p.plantId); c.fillStyle = (sp && sp.displayFlower) || '#C9A0D0'; c.fill(); c.strokeStyle = rgba(INK, 0.5); c.lineWidth = 0.5; c.stroke(); }
            else if (f === 'no') { c.fillStyle = 'rgba(120,132,110,.55)'; c.fill(); }
            else { c.strokeStyle = rgba(INK, 0.7); c.lineWidth = 0.8; c.setLineDash([1.5, 1.5]); c.stroke(); c.setLineDash([]); } } }
      }
      const iss = F.u.issue && perf ? perf.issues.find((x) => x.id === F.u.issue) : null;
      for (const id of new Set([...(iss ? iss.cells : []), ...F.u.cells])) { const c0 = st.cells[id]; if (c0) strokeG(c, T, c0.geometry, iss && iss.cells.includes(id) ? WARN : INK, tex ? 4 : 2.2); }
      if (!tex && view !== 'seasonality') for (const c0 of cells) if (inView(o, c0.geometry)) label(c, T, c0, sc, String(c0.n));
    }
  }
}
