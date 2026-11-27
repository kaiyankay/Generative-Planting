// About · Project — the research position, one cover drawn from the computed example, who decides what.
import { sec, go, wait, routes, nmTxt } from './parts.js';
import { esc, view, pd, plants, section, MONTHS, LAYER_C, LAYER_N, SRC_C, boxOf, grow, centroid } from './figures.js';

export function frame(L) {
  return `<div class="ab ab-project">
  <header class="ab-mast ab-hero"><div><h1>From plant knowledge to spatial design.</h1>
    <p class="ab-lede gp-q">How can plant knowledge become part of spatial design decisions through AI and computational methods?</p>
    <p class="ab-enter"><a class="pi-btn primary" href="${esc(L.design)}">${L.saved ? 'Back to Design' : 'Open Design'}</a><a class="pi-btn" href="${esc(L.knowledge)}">Explore Knowledge</a><a class="pi-btn" href="${esc(routes.how)}">How it works</a></p></div></header>
  <figure class="ab-plate gp-cover" id="cover">${wait(520)}</figure>
  ${sec('position', 'Research position', '', `
    <div class="ab-three">
      <div><h3>Not a finished plan</h3><p>The tool never asks an AI for a planting plan. It turns plant knowledge, the designer’s intent, professional planting rules and the site into a spatial process the designer steers.</p></div>
      <div><h3>Land Kit, without Grasshopper</h3><p>Give designers the computational capabilities of tools like Land Kit without requiring them to build their own Grasshopper definitions.</p></div>
      <div><h3>Knowledge that grows</h3><p>Plant knowledge is a living layer: a first-time user starts from shared foundation knowledge; project and personal records join it, and every placed plant can be followed back.</p></div>
    </div>`)}
  ${sec('agents', 'Who decides what', 'Four parties, one design. The language model calls the engine; it never places a plant.', `<figure class="ab-fx gp-agents" id="agents-fig">${agents()}</figure>`)}
  ${sec('ways', 'Three ways in', '', `
    <ul class="ab-ways">
      <li><a href="${esc(L.design)}"><b>Design</b><span>Define a scope and strategy, structure the beds into numbered cells, compose with mixes and the brush, explore the result by month.</span></a></li>
      <li><a href="${esc(L.knowledge)}"><b>Knowledge</b><span>The project’s plants, seasons, communities and relations; add what you know and see what it changes.</span></a></li>
      <li><a href="${esc(routes.how)}"><b>About</b><span>How the engine computes one design, the research behind the method, and where every value comes from.</span></a></li>
    </ul>`)}
  ${sec('limits', 'What it is, and is not', 'A research prototype for a method.', `
    <div class="ab-two">
      <div><h3>It can</h3><ul class="ab-ticks">
        <li>Read a real site model: Oudolf Garden Detroit, its beds, walks, terrain and tree crowns.</li>
        <li>Turn beds into numbered cells with three spatial logics that respond to edges, paths and slope.</li>
        <li>Compose layered planting mixes from four planting systems and place real plant instances with a live brush.</li>
        <li>Show flowering resources month by month, and send every issue back to the cell or mix behind it.</li>
      </ul></div>
      <div><h3>It cannot</h3><ul class="ab-ticks no">
        <li>Know Detroit’s sun, soil moisture or pH: there is no data, so they stay unknown.</li>
        <li>Vouch for flowering, pollinator and light values: most come from an illustrative teaching layer.</li>
        <li>Predict growth or succession: months show seasonal flowering only.</li>
        <li>Call a language model: the public prototype runs written rules offline.</li>
      </ul></div>
    </div>
    ${go([routes.how, 'How it works'], [routes.method, 'Research &amp; Method'], [routes.data, 'Sources &amp; data'])}`)}
  </div>`;
}

export async function fill(C) {
  const el = document.getElementById('cover');
  el.innerHTML = `${cover(C)}<figcaption>From one plant to one planting, on the computed example: ${esc(nmTxt(C, C.followed.id))} as recorded, the rules that read it, the mix that holds it, the cells of bed B1 and the ${C.followed.placed.toLocaleString('en-US')} plants the engine placed. Dashed: illustrative teaching values; grey: unknown. The plant form is drawn from the model’s nominal size, not a portrait. <a href="${esc(routes.method)}#knowledge">Follow this record</a></figcaption>`;
}

// ---------------------------------------------------------------- the cover: plant form → knowledge → rules → recipe → space → result
function cover(C) {
  const W = 1180, H = 540, GY = 452; const fr = C.followed; const sp = C.species[fr.id];
  let g = '';
  const cols = [[0, 175], [205, 395], [425, 600], [630, 805], [835, 995], [1015, 1180]];
  const cap = (i, t, s) => `<text class="cv-h" x="${cols[i][0]}" y="${GY + 34}">${i + 1}</text><text class="cv-t" x="${cols[i][0] + 18}" y="${GY + 34}">${esc(t)}</text><text class="cv-k" x="${cols[i][0]}" y="${GY + 54}">${esc(s)}</text>`;
  // 1 · plant form: a dense specimen of the followed grass, at its nominal size (the model's display proxy)
  g += specimen(sp, 88, GY, 250, 168);
  g += `<text class="cv-name" x="0" y="${GY - 300}"><tspan font-style="italic">${esc(sp.name)}</tspan></text><text class="cv-k" x="0" y="${GY - 283}">prairie dropseed</text>`;
  // 2 · knowledge: the record, field by field, styled by where each value comes from
  const A = fr.attrs; const rows = [
    ['flowering', A.bloom], ['light', A.light], ['moisture', A.moisture], ['pollinators', A.pollinators], ['role', A.role],
  ];
  const val = (k, t) => { if (!t || t.status === 'unknown') return 'unknown'; if (k === 'flowering') return t.value.map((m) => MONTHS[m - 1]).join('–'); return [].concat(t.value).join(', '); };
  const y0 = 112, dy = 60; const rx = cols[1][0], rw = cols[1][1] - cols[1][0];
  rows.forEach(([k, t], i) => { const y = y0 + i * dy; const s = !t || t.status === 'unknown' ? 'unknown' : t.status === 'conflict' ? 'conflict' : t.source;
    g += `<text class="cv-k" x="${rx}" y="${y}">${esc(k)}</text><text class="cv-s${s === 'unknown' ? ' dim' : ''}" x="${rx}" y="${y + 18}">${esc(val(k, t))}</text>`;
    g += `<line x1="${rx}" y1="${y + 27}" x2="${rx + rw}" y2="${y + 27}" class="cv-st ${esc(s)}"/>`;
    g += `<text class="cv-src" x="${rx + rw}" y="${y + 18}" text-anchor="end">${esc({ illustrative: 'illustrative', site: 'site list', conflict: 'site list ≠ illustrative', unknown: '' }[s] || s)}</text>`; });
  // 3 · relations and rules: the fields the engine actually reads
  const R = [['Light fit', 'assumed › proxy › unknown', [1]], ['Functional role', 'matrix → Base, by area', [4]], ['Flowering month', 'counted per plant', [0, 3]], ['Spacing', `${fr.mixes[0] ? fr.mixes[0].spacing : 0.45} m in its layer`, []]];
  const nx = cols[2][0] + 24; R.forEach(([t, s, from], i) => { const y = 134 + i * 74; g += `<circle class="cv-node v" cx="${nx}" cy="${y}" r="6"/><text class="cv-t sm" x="${nx + 14}" y="${y + 4}">${esc(t)}</text><text class="cv-k" x="${nx + 14}" y="${y + 21}">${esc(s)}</text>`;
    for (const f of from) { const fy = y0 + f * dy + 27; const st = rows[f][1]; const dash = !st || st.status === 'unknown' ? 'dot' : st.source === 'illustrative' ? 'dash' : ''; g += `<path class="cv-line ${dash}" d="M${rx + rw} ${fy}C${rx + rw + 22} ${fy} ${nx - 26} ${y} ${nx - 6} ${y}"/>`; } });
  // 4 · community recipe: the mix the record sits in, three independent layers
  const mx = C.mixes.find((m) => m.id === (fr.mixes[0] && fr.mixes[0].id)) || C.mixes[0];
  const bx = cols[3][0], bw = cols[3][1] - cols[3][0];
  g += `<text class="cv-name" x="${bx}" y="112">${esc(mx.name)}</text><text class="cv-k" x="${bx}" y="129">${esc(sys(mx.system))} · ${mx.density}/m²</text>`;
  mx.layers.forEach((L, i) => { const y = 160 + i * 86; const tot = L.members.reduce((a, q) => a + (L.basis === 'area' ? q.share : q.proportion), 0) || 1; let x = bx;
    g += `<text class="cv-k" x="${bx}" y="${y}" fill="${LAYER_C[L.slot]}">${esc(LAYER_N[L.slot])}</text><text class="cv-k" x="${bx + bw}" y="${y}" text-anchor="end">${esc(L.basis === 'area' ? 'by area · 100 %' : L.basis === 'drift' ? `drifts · ${Math.round(L.coverage * 100)} % cover` : `${L.density} per m²`)}</text>`;
    for (const q of L.members) { const w = ((L.basis === 'area' ? q.share : q.proportion) / tot) * bw; const s = C.species[q.p] || {}; const on = q.p === fr.id; g += `<rect x="${x.toFixed(1)}" y="${y + 8}" width="${Math.max(0.6, w - 1).toFixed(1)}" height="${on ? 22 : 16}" fill="${s.leaf || '#999'}" fill-opacity="${on ? 1 : 0.55}"${on ? ' stroke="#27241f"' : ''}/>`; x += w; }
    if (L.members.some((q) => q.p === fr.id)) { const q = L.members.find((z) => z.p === fr.id); g += `<text class="cv-s" x="${bx}" y="${y + 48}">${esc(sp.name.split(' ')[0])} ${Math.round(q.share * 100)} % of the base</text>`; }
    else g += `<text class="cv-k" x="${bx}" y="${y + 44}">${L.members.length} species</text>`; });
  // 5 · space and 6 · result: bed B1 at one scale — cells, then plants (and a section under the ground line)
  const bed = C.site.beds.find((b) => b.code === 'B1'); const cb = C.cells.filter((c) => c.bed === bed.id); const box = grow(boxOf([bed.geom]), 0.4);
  const fitW = Math.min(cols[4][1] - cols[4][0], ((GY - 100) / (box[3] - box[1])) * (box[2] - box[0])); const V = view(box, fitW);
  const ox5 = cols[4][0] + ((cols[4][1] - cols[4][0]) - V.W) / 2, ox6 = cols[5][0] + ((cols[5][1] - cols[5][0]) - V.W) / 2, oy = GY - 30 - V.H;
  const mixOf = (cid) => (C.assignments[cid] ? C.mixes.find((m) => m.id === C.assignments[cid].mix) : null);
  let s5 = `<path d="${pd(bed.geom, V)}" fill="#fffdf8" stroke="#27241f" stroke-width="1"/>`; for (const c of cb) { const m = mixOf(c.id); s5 += `<path d="${pd(c.geom, V)}" fill="${m ? m.color : '#eee'}" fill-opacity=".28" stroke="#8a8373" stroke-width=".7"/><text class="cv-cell" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 3).toFixed(1)}" text-anchor="middle">${esc(c.label.split('·')[1])}</text>`; }
  g += `<g transform="translate(${ox5.toFixed(1)} ${oy.toFixed(1)})">${s5}</g><text class="cv-k" x="${cols[4][0]}" y="${oy - 24}">bed B1 · ${cb.length} cells</text><text class="cv-k" x="${cols[4][0]}" y="${oy - 9}">bands along the walk</text>`;
  const list = cb.flatMap((c) => C.inst[c.id] || []);
  let s6 = `<path d="${pd(bed.geom, V)}" fill="#fffdf8" stroke="#27241f" stroke-width="1"/>` + plants(list, V, C, { colour: (p, s) => (p.p === fr.id ? s.leaf : p.s === 'overlay' ? s.flower : p.s === 'ephemeral' ? '#b3a7c6' : s.leaf), scale: 0.5, min: 0.7, alpha: 0.85 });
  g += `<g transform="translate(${ox6.toFixed(1)} ${oy.toFixed(1)})">${s6}</g><text class="cv-k" x="${cols[5][0]}" y="${oy - 24}">${list.length.toLocaleString('en-US')} plants</text><text class="cv-k" x="${cols[5][0]}" y="${oy - 9}">as placed</text>`;
  // arrows between columns and the ground line
  for (const i of [0, 2, 3, 4]) { const x1 = cols[i][1] + 4, x2 = cols[i + 1][0] - 4, y = i === 0 ? GY - 130 : GY - 180; g += `<path class="cv-arrow" d="M${x1} ${y}H${x2}m-6 -4l6 4l-6 4"/>`; }
  g += `<line class="cv-ground" x1="0" y1="${GY}" x2="${W}" y2="${GY}"/>`;
  g += cap(0, 'Plant form', 'nominal form') + cap(1, 'Plant knowledge', 'five fields') + cap(2, 'Relations and rules', 'read by the engine') + cap(3, 'Community recipe', `${mx.layers.length} layers · ${new Set(mx.layers.flatMap((L) => L.members.map((q) => q.p))).size} species`) + cap(4, 'Spatial configuration', 'numbered cells') + cap(5, 'Design result', 'real coordinates');
  return `<svg class="cv fx" viewBox="0 0 ${W} ${H}" role="img" aria-label="From plant form to design result: the followed plant, its record, the rules, the mix, the cells of bed B1 and the placed plants">${g}</svg>`;
}
export const sys = (id) => ({ 'matrix-based': 'Matrix Based', 'true-meadow': 'True Meadow', 'maximal-color': 'Maximal Color', 'under-trees': 'Under Trees' }[id] || id || 'custom');

// a fine grass drawn at nominal size: a fountain of blades and airy panicles (deterministic, from the record's numbers)
function specimen(s, cx, base, h, w) {
  let g = ''; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) { const a = (rnd() - 0.5) * 2; const len = h * (0.55 + 0.3 * rnd()) * (1 - Math.abs(a) * 0.25); const tx = cx + a * w * 0.62, ty = base - len; const mx = cx + a * w * 0.12 + (rnd() - 0.5) * 8; g += `<path d="M${(cx + a * 6).toFixed(1)} ${base}Q${mx.toFixed(1)} ${(base - len * 0.7).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="${s.leaf}" stroke-width="${(0.7 + rnd() * 0.6).toFixed(2)}" fill="none" stroke-linecap="round" opacity="${(0.6 + rnd() * 0.4).toFixed(2)}"/>`; }
  for (let i = 0; i < 16; i++) { const a = (rnd() - 0.5) * 1.4; const top = base - h * (0.95 + rnd() * 0.18); const tx = cx + a * w * 0.42; g += `<path d="M${(cx + a * 10).toFixed(1)} ${(base - h * 0.3).toFixed(1)}Q${(cx + a * w * 0.2).toFixed(1)} ${(base - h * 0.7).toFixed(1)} ${tx.toFixed(1)} ${top.toFixed(1)}" stroke="#a89a6c" stroke-width=".6" fill="none"/>`; for (let j = 0; j < 7; j++) { const t = j / 7; g += `<circle cx="${(tx + (rnd() - 0.5) * 9).toFixed(1)}" cy="${(top + t * h * 0.16).toFixed(1)}" r="${(1 + rnd() * 0.9).toFixed(1)}" fill="${s.flower}" opacity=".85"/>`; } }
  return g;
}

// ---------------------------------------------------------------- who decides what (implemented now vs planned)
function agents() {
  const W = 1000, H = 430; let g = '';
  const box = (x, y, w, h, title, items, cls) => `<g class="ag ${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/><text class="ag-t" x="${x + 18}" y="${y + 30}">${esc(title)}</text>${items.map((t, i) => `<text class="ag-i" x="${x + 18}" y="${y + 56 + i * 20}">${esc(t)}</text>`).join('')}</g>`;
  g += box(20, 150, 210, 150, 'Designer', ['intent and choices', 'gestures with the brush', 'personal experience'], 'des');
  g += box(375, 20, 260, 150, 'Language model', ['understands intent', 'extracts and retrieves knowledge', 'reasons, proposes operations'], 'llm');
  g += box(375, 260, 260, 150, 'Computational engine', ['spatial cells, suitability', 'plant arrangement', 'constraint checks, performance'], 'eng');
  g += box(770, 150, 210, 150, 'Knowledge', ['attributes, tolerances', 'community roles', 'records with sources'], 'kno');
  const arr = (d, cls, label, lx, ly, anchor = 'middle') => `<path class="ag-a ${cls}" d="${d}" marker-end="url(#ag-${cls})"/><text class="ag-l ${cls}" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(label)}</text>`;
  g += `<defs><marker id="ag-now" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3b5538"/></marker><marker id="ag-plan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b7894d"/></marker></defs>`;
  g += arr('M230 268 C290 300 320 320 372 326', 'now', 'gestures, choices', 292, 326);
  g += arr('M375 352 C310 352 270 330 232 292', 'now', 'cells, plants, checks', 296, 384);
  g += arr('M770 268 C710 300 690 320 638 326', 'now', 'traits by source', 712, 330);
  g += arr('M230 190 C280 150 320 110 372 100', 'plan', 'intent in words', 262, 132);
  g += arr('M770 190 C720 150 690 120 638 104', 'plan', 'extract, relate, retrieve', 742, 132);
  g += arr('M505 172 L505 256', 'plan', 'calls engine operations', 515, 220, 'start');
  g += `<text class="ag-n" x="505" y="242" text-anchor="end" dx="-12">never coordinates</text>`;
  g += `<g class="ag-key"><line x1="20" y1="18" x2="56" y2="18" class="ag-a now"/><text x="64" y="22">Implemented now — offline rules engine</text><line x1="20" y1="42" x2="56" y2="42" class="ag-a plan"/><text x="64" y="46">Planned integration — LLM-assisted reasoning</text></g>`;
  return `<svg class="gp-ag" viewBox="0 0 ${W} ${H}" role="img" aria-label="Designer, knowledge, language model and computational engine. Implemented now: designer and knowledge feed the rules engine, which returns cells, plants and checks. Planned: the language model reads intent, extracts and retrieves knowledge, and calls engine operations without setting coordinates.">${g}</svg>`;
}
