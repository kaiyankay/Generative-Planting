// Small deterministic layout kit for the knowledge graphs: relaxation that keeps already-placed nodes where they are
// (so exploring adds to the picture instead of redrawing it) and greedy label placement that avoids discs, labels and edges.

/** nodes: [{id, x, y, r, w (label width), anchor (0..1: how strongly it stays put)}], links: [[idA, idB, rest]] */
export function relax(nodes, links, W, H, { iters = 160, pad = 10, gravity = 0.0015, clamp = true } = {}) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const cx = W / 2, cy = H / 2;
  for (let it = 0; it < iters; it++) {
    const cool = 1 - it / (iters + 20);
    const F = new Map(nodes.map(n => [n.id, [0, 0]]));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j]; let dx = a.x - b.x, dy = a.y - b.y; const d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + pad + Math.min(a.w || 0, b.w || 0) * 0.25;
      if (d < min * 1.15) { const f = (min * 1.15 - d) * 0.4; F.get(a.id)[0] += dx / d * f; F.get(a.id)[1] += dy / d * f; F.get(b.id)[0] -= dx / d * f; F.get(b.id)[1] -= dy / d * f; }
    }
    for (const [ia, ib, rest] of links) { const a = byId.get(ia), b = byId.get(ib); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - rest) * 0.02;
      F.get(a.id)[0] += dx / d * f; F.get(a.id)[1] += dy / d * f; F.get(b.id)[0] -= dx / d * f; F.get(b.id)[1] -= dy / d * f; }
    for (const n of nodes) {
      const f = F.get(n.id); const m = (1 - (n.anchor ?? 0)) * cool;
      n.x += Math.max(-10, Math.min(10, f[0] + (cx - n.x) * gravity)) * m; n.y += Math.max(-10, Math.min(10, f[1] + (cy - n.y) * gravity)) * m;
      if (clamp) { n.x = Math.max(n.r + 8, Math.min(W - n.r - 8, n.x)); n.y = Math.max(n.r + 8, Math.min(H - n.r - 22, n.y)); }
    }
  }
  return nodes;
}

/** Place each label to the right, left, below or above its node — whichever overlaps least; stays inside W×H. */
export function placeLabels(nodes, W, H, { prefer = null, bounds = null } = {}) {
  const B = bounds || { x0: 0, y0: 0, x1: W, y1: H };
  const boxes = nodes.map(n => ({ x0: n.x - n.r, y0: n.y - n.r, x1: n.x + n.r, y1: n.y + n.r }));
  const placed = [];
  const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const order = nodes.map((n, i) => i).sort((i, j) => (nodes[j].prio || 0) - (nodes[i].prio || 0));
  const out = new Array(nodes.length);
  for (const i of order) {
    const n = nodes[i]; const w = n.w || 0, h = n.h || 14; const g = n.r + 5;
    const opts = [
      { side: 'right', x0: n.x + g, y0: n.y - h / 2, anchor: 'start', tx: n.x + g, ty: n.y },
      { side: 'left', x0: n.x - g - w, y0: n.y - h / 2, anchor: 'end', tx: n.x - g, ty: n.y },
      { side: 'below', x0: n.x - w / 2, y0: n.y + g, anchor: 'middle', tx: n.x, ty: n.y + g + h / 2 },
      { side: 'above', x0: n.x - w / 2, y0: n.y - g - h, anchor: 'middle', tx: n.x, ty: n.y - g - h / 2 },
    ];
    if (prefer?.(n)) opts.sort((a, b) => (a.side === prefer(n) ? -1 : b.side === prefer(n) ? 1 : 0));
    let best = null, bestScore = Infinity;
    for (const [k, o] of opts.entries()) {
      const box = { x0: o.x0, y0: o.y0, x1: o.x0 + w, y1: o.y0 + h };
      let sc = k * 2;                                     // small preference for the earlier options
      if (box.x0 < B.x0 + 2 || box.x1 > B.x1 - 2 || box.y0 < B.y0 + 2 || box.y1 > B.y1 - 2) sc += 5000;
      for (const p of placed) sc += overlap(box, p) * 3;
      boxes.forEach((b, j) => { if (j !== i) sc += overlap(box, b) * 4; });
      if (sc < bestScore) { bestScore = sc; best = { ...o, box }; }
    }
    placed.push(best.box); out[i] = best;
  }
  return out;
}

export const textW = (s, px = 11) => String(s).length * px * 0.55;
