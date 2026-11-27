// Shared canvas behaviour: every clickable thing in a view names what it is (data-ent / data-rec / data-cell / data-explore),
// and one handler turns that into the shared selection — so Network, Profiles, Compare, Seasons and the inspector never disagree.
export function bindCommon(host, app, extra = {}) {
  host.onclick = ev => {
    const t = ev.target.closest('[data-explore],[data-cell],[data-rec],[data-ent],[data-src],[data-act]');
    if (!t || !host.contains(t)) return;
    if (t.dataset.act && extra[t.dataset.act]) { extra[t.dataset.act](t); return; }
    if (t.dataset.explore) { app.explore(t.dataset.explore); return; }
    if (t.dataset.cell) { const [entity, col] = t.dataset.cell.split('|'); app.select({ kind: 'cell', entity, col, key: 'cell:' + t.dataset.cell }); return; }
    if (t.dataset.rec) { app.select({ kind: 'record', id: t.dataset.rec }); return; }
    if (t.dataset.src) { app.select({ kind: 'source', id: t.dataset.src }); return; }
    if (t.dataset.ent) app.select({ kind: 'entity', id: t.dataset.ent });
  };
  host.ondblclick = ev => { const t = ev.target.closest('[data-ent]'); if (t && host.contains(t) && !t.closest('svg.net')) app.explore(t.dataset.ent); };
  host.onkeydown = ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target.closest('[data-explore],[data-cell],[data-rec],[data-ent],[data-src],[data-act]');
    if (!t || !host.contains(t) || t.tagName === 'BUTTON' || t.closest('svg.net')) return;
    ev.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  };
  // make the non-button targets reachable from the keyboard
  host.querySelectorAll('td[data-cell], [data-rec]:not(button):not(a), g[data-ent], tr[data-key] .tx, rect[data-rec], circle[data-cell], path[data-rec]').forEach(el => { if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); if (!el.getAttribute('role')) el.setAttribute('role', 'button'); } });
}

/** Deterministic pseudo-random in [0,1) from a string (layouts never reshuffle between renders). */
export function h01(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return (h % 100000) / 100000; }

export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** Closed smooth path through points (Catmull-Rom → Bézier). */
export function smoothClosed(pts) {
  const n = pts.length; if (n < 3) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
export const textW = (s, px = 11) => String(s).length * px * 0.56;
