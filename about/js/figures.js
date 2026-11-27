// Generative Planting · About — figures drawn in code from the engine's own output (case.js) and its exported tables.
// Nothing here invents a plant position: plans, sections and axonometrics place the instances the engine placed. Drawings that
// are concepts (not computed) say so in their caption. One encoding everywhere:
//   mix          the engine's mix colour          layer   Base olive · Overlay caramel · Bulbs violet
//   knowledge    source record solid ink · illustrative caramel dashed · project record blue · unknown grey dotted
//   site         actual information solid · project assumption caramel hatch · unknown grey dots
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const LAYER_C = { base: '#5b7a57', overlay: '#b7894d', ephemeral: '#8e7aa6' };
export const LAYER_N = { base: 'Base', overlay: 'Overlay', ephemeral: 'Bulbs' };
export const SRC_C = { site: '#3b5538', foundation: '#3b5538', illustrative: '#b7894d', project: '#4f86a0', personal: '#4f86a0', unknown: '#b9b2a2', conflict: '#b04f36' };
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------- plan view: world metres → SVG
export function view(box, W) { const k = W / (box[2] - box[0]); return { box, k, W, H: (box[3] - box[1]) * k, X: (x) => (x - box[0]) * k, Y: (y) => (box[3] - y) * k }; }
export function pd(polys, V) { let d = ''; for (const poly of polys) for (const r of poly) { d += 'M' + r.map(([x, y]) => `${f1(V.X(x))},${f1(V.Y(y))}`).join('L') + 'Z'; } return d; }
export const centroid = (polys) => { let a = 0, cx = 0, cy = 0; for (const poly of polys) { const r = poly[0]; for (let i = 0; i < r.length - 1; i++) { const c = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += c; cx += (r[i][0] + r[i + 1][0]) * c; cy += (r[i][1] + r[i + 1][1]) * c; } } return a ? [cx / (3 * a), cy / (3 * a)] : polys[0][0][0]; };
export const boxOf = (polysList) => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const polys of polysList) for (const poly of polys) for (const [x, y] of poly[0]) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return b; };
export const grow = (b, m) => [b[0] - m, b[1] - m, b[2] + m, b[3] + m];

// shared defs: hatches for assumption / unknown / blocked
export const DEFS = `<defs>
  <pattern id="h-assume" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(183,137,77,.10)"/><line x1="0" y1="0" x2="0" y2="6" stroke="#b7894d" stroke-width="1.3" opacity=".55"/></pattern>
  <pattern id="h-unknown" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r=".9" fill="#9c9583" opacity=".55"/></pattern>
  <pattern id="h-path" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" fill="#ece6d8"/><line x1="0" y1="0" x2="0" y2="5" stroke="#d6cfbf" stroke-width="1"/></pattern>
  <pattern id="h-soft" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><line x1="0" y1="0" x2="0" y2="5" stroke="#27241f" stroke-width=".7" opacity=".35"/></pattern>
</defs>`;

/** the site under a case: walks, context beds, case beds (optionally hidden) */
export function ground(C, V, { beds = true, context = true, label = true, quiet = false } = {}) {
  let h = '';
  for (const p of C.site.paths) h += `<path d="${pd(p.geom, V)}" fill="url(#h-path)" stroke="none" fill-rule="evenodd"/>`;
  if (context) for (const b of C.site.beds.filter((q) => !q.inCase)) h += `<path d="${pd(b.geom, V)}" fill="#f1ecdf" stroke="#d8d1c1" stroke-width=".8" fill-rule="evenodd"/>`;
  if (beds) for (const b of C.site.beds.filter((q) => q.inCase)) h += `<path d="${pd(b.geom, V)}" fill="${quiet ? '#fbf8f1' : '#fffdf8'}" stroke="#27241f" stroke-width="1.1" fill-rule="evenodd"/>`;
  for (const t of C.site.trees) h += `<circle cx="${f1(V.X(t.x))}" cy="${f1(V.Y(t.y))}" r="${f1(3 * V.k)}" fill="none" stroke="#8c9c82" stroke-dasharray="2 3"/>`;
  if (label) for (const b of C.site.beds.filter((q) => q.inCase)) { const c = centroid(b.geom); h += `<text class="pl-lab" x="${f1(V.X(c[0]))}" y="${f1(V.Y(c[1]))}" text-anchor="middle">${esc(b.code)}</text>`; }
  return h;
}
export function scaleBar(V, x, y, m = 5) { const w = m * V.k; return `<g class="pl-dim"><line x1="${x}" y1="${y}" x2="${f1(x + w)}" y2="${y}"/><line x1="${x}" y1="${y - 4}" x2="${x}" y2="${y + 4}"/><line x1="${f1(x + w)}" y1="${y - 4}" x2="${f1(x + w)}" y2="${y + 4}"/><text x="${f1(x + w / 2)}" y="${y - 7}" text-anchor="middle">${m} m</text></g>`; }
export const north = (x, y) => `<g class="pl-dim"><path d="M${x} ${y + 12}L${x} ${y - 4}M${x - 4} ${y + 1}L${x} ${y - 5}L${x + 4} ${y + 1}" fill="none"/><text x="${x}" y="${y + 24}" text-anchor="middle">N</text></g>`;
export const svg = (V, inner, { cls = 'gp-plan', label = '', pad = 0, extraH = 0 } = {}) => `<svg class="${cls}" viewBox="${-pad} ${-pad} ${f1(V.W + 2 * pad)} ${f1(V.H + 2 * pad + extraH)}" role="img" aria-label="${esc(label)}">${DEFS}${inner}</svg>`;

/** plants as the engine placed them. colour: 'species' | 'layer' | 'mix' | fn(p) */
export function plants(list, V, C, { colour = 'species', month = null, only = null, scale = 0.42, min = 0.9, alpha = 0.9 } = {}) {
  let h = ''; const mixC = Object.fromEntries(C.mixes.map((m) => [m.id, m.color]));
  const order = { base: 0, overlay: 1, ephemeral: 2 };
  const ps = (only ? list.filter(only) : list).slice().sort((a, b) => order[a.s] - order[b.s]);
  for (const p of ps) {
    const s = C.species[p.p] || {}; let fill;
    if (typeof colour === 'function') fill = colour(p, s);
    else if (colour === 'layer') fill = LAYER_C[p.s];
    else if (colour === 'mix') fill = mixC[p.m] || '#888';
    else { const fl = month ? (C.phen[p.p] && C.phen[p.p].f[month - 1]) : null; fill = month ? (fl === 'yes' ? s.flower : fl === 'unknown' ? '#d9d4c8' : s.leaf) : s.leaf; }
    if (!fill) continue;
    const r = Math.max(min, (p.s === 'ephemeral' ? 0.13 : Math.min(p.sp || 0.45, Math.max(0.3, s.w || 0.45)) * scale) * V.k);
    h += `<circle cx="${f1(V.X(p.x))}" cy="${f1(V.Y(p.y))}" r="${f1(r)}" fill="${fill}" fill-opacity="${alpha}"${p.f === 'conflict' ? ' stroke="#b04f36"' : ''}/>`;
  }
  return h;
}
export const allPlants = (inst) => Object.values(inst).flat();

// ---------------------------------------------------------------- plant forms (section and axonometric), drawn from nominal size
// a glyph stands at (x, base) and is h px tall and w px wide; form follows the plant type of the model record
export function glyph(s, x, base, h, w, { flowering = null, mono = null } = {}) {
  const leaf = mono || s.leaf || '#7a8f4e', fl = mono || (flowering === 'yes' ? s.flower : flowering === 'unknown' ? '#cfc9bb' : null) || s.flower || '#c9a86a';
  const showF = flowering == null ? true : flowering === 'yes';
  const t = (s.type || 'forb').toLowerCase(); let g = '';
  if (/grass|sedge|rush/.test(t)) {
    const n = 9; for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5); const tx = x + a * w * 1.05, ty = base - h * (0.62 + 0.38 * (1 - Math.abs(a) * 1.4)); g += `<path d="M${f1(x + a * w * 0.18)} ${base}Q${f1(x + a * w * 0.35)} ${f1(base - h * 0.55)} ${f1(tx)} ${f1(ty)}" stroke="${leaf}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`; }
    if (showF) for (let i = 0; i < 4; i++) { const a = (i / 3 - 0.5) * 0.6; g += `<path d="M${f1(x + a * w * 0.2)} ${f1(base - h * 0.5)}L${f1(x + a * w * 0.55)} ${f1(base - h * 1.08)}" stroke="${fl}" stroke-width="1" stroke-dasharray="1.5 1.5"/>`; }
  } else if (/bulb/.test(t)) {
    g += `<path d="M${x} ${base}L${x} ${f1(base - h * 0.85)}" stroke="${leaf}" stroke-width="1.1"/><path d="M${f1(x - w * 0.6)} ${base}Q${f1(x - w * 0.3)} ${f1(base - h * 0.35)} ${x} ${f1(base - h * 0.15)}M${f1(x + w * 0.6)} ${base}Q${f1(x + w * 0.3)} ${f1(base - h * 0.4)} ${x} ${f1(base - h * 0.15)}" stroke="${leaf}" fill="none"/>`;
    if (showF) g += `<ellipse cx="${x}" cy="${f1(base - h * 0.9)}" rx="${f1(Math.max(2, w * 0.45))}" ry="${f1(Math.max(2.4, h * 0.12))}" fill="${fl}"/>`;
  } else if (/shrub|tree/.test(t)) {
    g += `<path d="M${x} ${base}L${x} ${f1(base - h * 0.35)}" stroke="#6d5a43" stroke-width="1.4"/><ellipse cx="${x}" cy="${f1(base - h * 0.6)}" rx="${f1(w / 2)}" ry="${f1(h * 0.42)}" fill="${leaf}" fill-opacity=".85"/>`;
    if (showF) for (let i = 0; i < 5; i++) g += `<circle cx="${f1(x + (i / 4 - 0.5) * w * 0.7)}" cy="${f1(base - h * (0.75 + 0.15 * Math.sin(i * 2)))}" r="1.8" fill="${fl}"/>`;
  } else if (/fern/.test(t)) {
    for (let i = 0; i < 6; i++) { const a = (i / 5 - 0.5); g += `<path d="M${x} ${base}Q${f1(x + a * w * 0.3)} ${f1(base - h * 0.7)} ${f1(x + a * w)} ${f1(base - h * (0.55 + 0.4 * (1 - Math.abs(a))))}" stroke="${leaf}" stroke-width="1.6" fill="none"/>`; }
  } else { // forb
    g += `<ellipse cx="${x}" cy="${f1(base - h * 0.16)}" rx="${f1(w * 0.42)}" ry="${f1(h * 0.17)}" fill="${leaf}" fill-opacity=".8"/>`;
    const n = Math.max(2, Math.min(5, Math.round(w / 6))); for (let i = 0; i < n; i++) { const a = n === 1 ? 0 : i / (n - 1) - 0.5; const tx = x + a * w * 0.6, ty = base - h * (0.86 + 0.14 * (1 - Math.abs(a) * 2)); g += `<path d="M${f1(x + a * w * 0.15)} ${f1(base - h * 0.2)}L${f1(tx)} ${f1(ty)}" stroke="${leaf}" stroke-width="1"/>`; if (showF) g += `<circle cx="${f1(tx)}" cy="${f1(ty)}" r="${f1(Math.max(1.8, w * 0.09))}" fill="${fl}"/>`; }
  }
  return g;
}

/** a section through placed plants: every instance within `band` metres of the line a→b, drawn at its nominal height */
export function section(C, list, a, b, { W = 900, H = 200, band = 0.6, vScale = null, month = null, label = '', mono = null, ground = true, marks = null } = {}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
  const k = W / L; const v = vScale || k; const base = H - 26; let g = '';
  const pts = []; for (const p of list) { const t = (p.x - a[0]) * ux + (p.y - a[1]) * uy; const d = -(p.x - a[0]) * uy + (p.y - a[1]) * ux; if (t < 0 || t > L || Math.abs(d) > band) continue; pts.push([t, d, p]); }
  pts.sort((p, q) => q[1] - p[1]);
  for (const [t, d, p] of pts) { const s = C.species[p.p] || {}; const fl = month ? (C.phen[p.p] && C.phen[p.p].f[month - 1]) : null; const hh = Math.min(H - 40, (s.h || 0.5) * v), ww = Math.max(4, (s.w || 0.4) * k * 0.9); g += `<g opacity="${(0.55 + 0.45 * (1 - Math.abs(d) / band)).toFixed(2)}">${glyph(s, t * k, base, hh, ww, { flowering: month ? fl : null, mono })}</g>`; }
  if (ground) g += `<line class="sx-ground" x1="0" y1="${base}" x2="${W}" y2="${base}"/>`;
  if (marks) for (const m of marks) g += `<line x1="${f1(m.t * k)}" y1="${base + 4}" x2="${f1(m.t * k)}" y2="${base + 12}" stroke="#716b5c"/><text class="sx-l" x="${f1(m.t * k)}" y="${base + 22}" text-anchor="${m.anchor || 'middle'}">${esc(m.text)}</text>`;
  return { svg: `<svg class="gp-sx" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`, n: pts.length };
}

/** axonometric (30° isometric) of placed plants, back to front, with an optional vertical offset per layer (exploded) */
export function axo(C, list, box, { W = 900, explode = null, month = null, label = '', beds = true, mono = null, layerPlates = false, hScale = 1, padR = 0 } = {}) {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2; const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  const P = (x, y, z = 0) => [((x - cx) - (y - cy)) * c30, -((x - cx) + (y - cy)) * s30 - z];
  const corners = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => P(x, y));
  const zMax = explode ? Math.max(...Object.values(explode)) : 0;
  const minX = Math.min(...corners.map((q) => q[0])), maxX = Math.max(...corners.map((q) => q[0])), minY = Math.min(...corners.map((q) => q[1])) - zMax - 3.5, maxY = Math.max(...corners.map((q) => q[1])) + 1;
  const k = (W - padR) / (maxX - minX); const H = (maxY - minY) * k; const T = (q) => [(q[0] - minX) * k, (q[1] - minY) * k];
  const poly = (pts) => 'M' + pts.map((q) => T(q).map(f1).join(',')).join('L') + 'Z';
  let g = '';
  const zOf = (slot) => (explode ? explode[slot] || 0 : 0);
  const slots = explode ? Object.keys(explode).sort((a, b) => explode[a] - explode[b]) : [null];
  for (const slot of slots) {
    const z = slot ? zOf(slot) : 0;
    if (layerPlates || slot === slots[0]) { const plate = [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => P(x, y, z)); g += `<path d="${poly(plate)}" fill="${slot && layerPlates ? (slot === slots[0] ? '#f4efe4' : 'rgba(255,253,248,.38)') : '#f4efe4'}" stroke="${slot && layerPlates ? LAYER_C[slot] : '#cfc7b6'}" stroke-width="${slot && layerPlates ? 1.1 : 0.8}"/>`; }
    if (beds && (!slot || slot === slots[0])) for (const b of C.site.beds) { if (!b.inCase && slot) continue; for (const pl of b.geom) { const r = pl[0].filter(([x, y]) => x >= box[0] - 3 && x <= box[2] + 3 && y >= box[1] - 3 && y <= box[3] + 3); if (r.length < 3) continue; g += `<path d="${poly(pl[0].map(([x, y]) => P(Math.max(box[0], Math.min(box[2], x)), Math.max(box[1], Math.min(box[3], y)), z)))}" fill="${b.inCase ? '#fffdf8' : '#eee8da'}" stroke="${b.inCase ? '#8a8373' : '#d8d1c1'}" stroke-width=".8"/>`; } }
    if (slot && layerPlates) { const lp = T(P(box[2], box[1], z)); g += `<text class="ax-l" x="${f1(lp[0] + 12)}" y="${f1(lp[1] + 5)}" fill="${LAYER_C[slot]}">${esc(LAYER_N[slot])}</text>`; }
    const ps = list.filter((p) => (!slot || p.s === slot) && p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3]).map((p) => ({ p, q: P(p.x, p.y, z) })).sort((a, b) => a.q[1] - b.q[1]);
    for (const { p, q } of ps) { const s = C.species[p.p] || {}; const [X, Y] = T(q); const fl = month ? (C.phen[p.p] && C.phen[p.p].f[month - 1]) : null; const hh = (s.h || 0.5) * k * 0.95 * hScale, ww = Math.max(3, (s.w || 0.4) * k * 0.85); g += glyph(s, X, Y, hh, ww, { flowering: month ? fl : null, mono: mono || (explode && layerPlates ? LAYER_C[p.s] : null) }); }
  }
  return `<svg class="gp-axo" viewBox="0 0 ${f1(W)} ${f1(H)}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

// ---------------------------------------------------------------- small shared marks
export const swatch = (c, cls = '') => `<i class="gp-sw ${cls}" style="--c:${c}"></i>`;
export const statusMark = (s) => `<i class="gp-st ${esc(s)}"></i>`;
export function monthStrip(f, { w = 12, h = 12, gap = 2 } = {}) { return `<svg class="gp-ms" viewBox="0 0 ${12 * (w + gap)} ${h}" width="${12 * (w + gap)}" height="${h}" aria-hidden="true">${f.map((v, i) => `<rect x="${i * (w + gap)}" y="0" width="${w}" height="${h}" rx="2" class="m-${v}"/>`).join('')}</svg>`; }
