// About · Research & Method — the course's planting knowledge (Generative Planting at Scale, ASLA 2024) and the knowledge research
// of this project, each redrawn on the computed Detroit example, with what the engine implements and what remains research.
// Course slides were read locally and are not reproduced: every drawing here is new, made from the example's data.
import { mast, sec, go, wait, routes, nm, nmTxt, tag, src } from './parts.js';
import { esc, view, pd, ground, plants, allPlants, section, axo, scaleBar, svg, DEFS, LAYER_C, LAYER_N, MONTHS, SRC_C, boxOf, grow, centroid, swatch, glyph } from './figures.js';
import { sys } from './page-project.js';

let C = null;
const n0 = (v) => Number(v).toLocaleString('en-US');
const STEPS = [['knowledge', 'From database to editable knowledge'], ['modules', 'Scalable modules and paint by number'], ['systems', 'Planting systems and functional roles'], ['layers', 'Functional layers and boundary overlap'], ['rules', 'Rules-based planting and layering constraints'], ['precedents', 'Land Kit, Pollinator Pathmaker and the result'], ['ai', 'Rules now, language models next']];
const course = (p) => `<p class="gp-course">Course source: <i>Generative Planting at Scale</i>, ASLA 2024 (Rainer, Liu, Landau) · ${esc(p)} · redrawn, not reproduced</p>`;
const ROLE_C = { matrix: '#55744f', groundcover: '#97ad83', cool: '#6f9a8a', warm: '#a39a52', fixer: '#4f86a0', block: '#7f9562', clumping: '#3f5f45', clonal: '#9bb486', winter: '#2f5d50', emergent: '#c0864f', filler: '#d4b26a', theme: '#a8687c', structure: '#6d5a43', seasonal: '#c79a5b', ephemeral: '#8e7aa6' };

export function frame() {
  return `<div class="ab ab-method">
  ${mast('From course knowledge to a computational method.', 'The planting ideas behind Generative Planting, each redrawn on the computed Detroit example, with what the engine does today and what remains research.', '<p class="ab-prov">Course slides read locally, not reproduced<br>Every drawing is new, made from the example<br><span class="gp-tag now">implemented</span> <span class="gp-tag concept">research direction</span></p>')}
  <ol class="ab-seven" aria-label="Seven parts">${STEPS.map(([id, n], i) => `<li class="v"><a href="#${id}"><b>${i + 1}</b><span>${esc(n)}</span></a></li>`).join('')}</ol>
  <section class="ab-sec wide" id="steps" style="border-top:0"><ol class="ab-steps" id="gp-steps">${wait(600)}</ol></section>
  </div>`;
}

export async function fill(c) {
  C = c;
  const S = [knowledge(), modules(), systems(), layers(), rules(), precedents(), ai()];
  document.getElementById('gp-steps').innerHTML = S.join('');
  document.getElementById('steps').insertAdjacentHTML('afterend', go([routes.how, 'How it works: the example in four stages'], [routes.data, 'Sources &amp; data']));
}

const step = (i, title, does, walk, more, figure, cap, { span = false, extra = '' } = {}) => `<li class="ab-step${span ? ' gp-spanstep' : ''}" id="${STEPS[i - 1][0]}"><div class="ab-step-n" aria-hidden="true">${i}</div>
  <div class="ab-step-b"><h3><span class="sr">Part ${i}: </span>${title}</h3>${does}<div class="ab-step-w"><span class="ab-step-wl">In the example</span>${walk}</div>${more ? `<details class="pi-more-d ab-step-d"><summary>Implemented, and still research</summary>${more}</details>` : ''}</div>
  <figure class="ab-fx${span ? ' gp-span' : ''}">${figure}${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>${extra}</li>`;
const now = (t) => `<p class="gp-imp">${tag('now', 'implemented')} ${t}</p>`;
const next = (t) => `<p class="gp-imp">${tag('concept', 'research direction')} ${t}</p>`;

// ================================================================ 1 · knowledge
function knowledge() {
  const fr = C.followed; const A = fr.attrs; const S = C.define.sources || {};
  const ATTR = [['bloom', 'flowering'], ['light', 'light'], ['moisture', 'moisture'], ['pollinators', 'pollinators'], ['role', 'role']];
  const LAY = [['personal', 'Personal', S.personal && S.personal.count ? `${S.personal.count} records` : 'empty at first use'], ['project', 'Project', S.project && S.project.count ? `${S.project.count} records` : 'none in this example'], ['foundation', 'Foundation', 'shared base; mostly Metro Vancouver'], ['site', 'Site plant list', 'printed on the garden’s lists'], ['illustrative', 'Teaching layer', `${(S.illustrative && S.illustrative.count) || 0} plants · not verified`]];
  const W = 720, lw = 230, cw = (W - lw) / 5, rh = 44, top = 40; const H = top + LAY.length * rh + 92; let g = '';
  ATTR.forEach(([, l], j) => { g += `<text class="mk-h" x="${lw + j * cw + cw / 2}" y="22" text-anchor="middle">${l}</text>`; });
  LAY.forEach(([k, l, s], i) => { const y = top + i * rh; g += `<rect x="0" y="${y}" width="${W}" height="${rh - 6}" rx="6" fill="${i % 2 ? '#f6f1e6' : '#fbf8f1'}"/><text class="mk-l" x="12" y="${y + 18}">${l}</text><text class="mk-s" x="12" y="${y + 33}">${esc(s)}</text>`;
    ATTR.forEach(([a], j) => { const t = A[a]; if (!t) return; const cx = lw + j * cw + cw / 2, cy = y + (rh - 6) / 2; const chosen = t.source === k; const alt = (t.alt || []).find((q) => q.scope === k);
      if (chosen) g += `<circle cx="${cx}" cy="${cy}" r="9" fill="${SRC_C[k]}"/><text class="mk-v" x="${cx + 14}" y="${cy + 4}">${esc(fmt(a, t.value))}</text>`;
      else if (alt) g += `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${SRC_C[k]}" stroke-width="1.6" stroke-dasharray="3 2"/><text class="mk-v dim" x="${cx + 14}" y="${cy + 4}">${esc(fmt(a, alt.value))}</text>`; }); });
  const ay = top + LAY.length * rh + 14; g += `<line x1="0" x2="${W}" y1="${ay - 6}" y2="${ay - 6}" stroke="#27241f"/>`;
  g += `<text class="mk-l" x="12" y="${ay + 18}">Active value</text><text class="mk-s" x="12" y="${ay + 33}">what the engine reads</text>`;
  ATTR.forEach(([a], j) => { const t = A[a]; const cx = lw + j * cw + 6; const st = !t || t.status === 'unknown' ? 'unknown' : t.status === 'conflict' ? 'conflict' : t.source; g += `<text class="mk-a" x="${cx}" y="${ay + 18}">${esc(!t || t.status === 'unknown' ? 'unknown' : fmt(a, t.value))}</text><text class="mk-s" x="${cx}" y="${ay + 34}" fill="${SRC_C[st] || '#716b5c'}">${esc({ illustrative: 'illustrative', site: 'site list', conflict: 'disagreement kept', unknown: 'no record', project: 'project', personal: 'personal', foundation: 'foundation' }[st] || st)}</text>`; });
  g += `<text class="mk-s" x="${lw}" y="${H - 10}">● the value in use · ◌ a different value, kept beside it · order: personal › project › foundation › site list › teaching layer</text>`;
  const fig1 = `<svg class="fx gp-mk" viewBox="0 0 ${W} ${H}" role="img" aria-label="Where each attribute of ${esc(fr.name)} comes from, layer by layer">${g}</svg>`;
  const ch = C.change; const bIds = ch.before.recipe.members.map((q) => q.p), aIds = ch.after.recipe.members.map((q) => q.p);
  const li = (id, cls) => `<li class="${cls}"><span>${nm(C, id)}</span><span>${esc((C.phen[id] && C.phen[id].bloom && C.phen[id].bloom.value ? C.phen[id].bloom.value.map((m) => MONTHS[m - 1]).join(' ') : id === ch.plant ? (ch.after.bloom.value || []).map((m) => MONTHS[m - 1]).join(' ') : ''))}</span></li>`;
  const strip = (cov) => `<div class="gp-cov">${ch.months.map((m) => `<span class="${cov.months.includes(m) ? 'on' : ''}">${MONTHS[m - 1]}</span>`).join('')}</div>`;
  const change = `<div class="gp-ba"><div><h4>Before</h4>${strip(ch.before.coverage)}<ul class="gp-list">${bIds.map((id) => li(id, aIds.includes(id) ? '' : 'del')).join('')}</ul></div>
    <div><h4>After one project record ${tag('project', 'project record')}</h4>${strip(ch.after.coverage)}<ul class="gp-list">${aIds.map((id) => li(id, bIds.includes(id) ? '' : 'add')).join('')}</ul></div></div>
    <p class="gp-fcap">The engine’s Rules-mode suggestion for bed B1 (brief: flowering April–November), computed twice. The record says ${nm(C, ch.plant)} flowers again in October–November with bees and moths; it is written for this page, unverified, and never saved. November becomes covered and one member is replaced.</p>`;
  const walk = `<p>${nm(C, fr.id)} holds 72 % of the Dropseed matrix base. Its light (“sun”) and flowering are teaching values; its moisture is printed on the garden’s list and differs from the teaching value, so both are kept. In B1 light is unknown, so its sun record cannot be checked: the fit is <b>unknown</b>, never a pass. The engine placed <b>${n0(fr.placed)}</b> of it in ${fr.cells.length} cells.</p>`;
  const more = `${now('Five layers with a stated order; disagreements kept, never averaged; a designer can prefer a source per plant and attribute; a new record previews its effect on mixes and months before it is applied.')}
    ${next('A language model extracts entities and claims from notes, slides and sources, links them to plants, retrieves the records a question needs and reasons over them. The record stays the unit, with its source and standing.')}
    <p>First prototype: a sourced database of ten species, organised into relations between plant, function and space. It explained choices but could not learn from a designer. The knowledge is now editable and grows with each project: not every fact needs a three-part relation; a note, a month list or a preference is a record too.</p>`;
  return step(1, 'From database to editable knowledge', `<p>A planting design needs what databases know and what designers know. Knowledge is layered: shared <b>foundation</b> records, the garden’s <b>site list</b>, records made for one <b>project</b>, a designer’s <b>personal</b> knowledge, and a clearly marked <b>teaching layer</b>. A first-time user has no personal records and still starts from the rest.</p>`, walk, more, fig1, `One real record, ${esc(nmTxt(C, fr.id))}, as Active Knowledge resolves it. A grey column is a missing record, never a statement about the plant.`, { extra: `<div class="gp-span gp-after"><h4 class="gp-h4">One knowledge change, recomputed</h4>${change}</div>` });
}
const fmt = (a, v) => (v == null ? 'unknown' : a === 'bloom' ? (v.length ? `${MONTHS[v[0] - 1]}–${MONTHS[v[v.length - 1] - 1]}` : '—') : [].concat(v).join(', '));

// ================================================================ 2 · modules and paint by number
function modules() {
  const bedsIn = C.site.beds.filter((b) => b.inCase); const box = grow(boxOf(bedsIn.map((b) => b.geom)), 1); const V = view(box, 150); const list = allPlants(C.inst);
  const mixC = (id) => (C.mixes.find((m) => m.id === id) || {}).color; const num = (id) => (C.paint.find((p) => p.mix === id) || {}).n;
  const g0 = ground(C, V, { label: false, context: false });
  const P1 = g0 + bedsIn.map((b) => `<path d="${pd(b.geom, V)}" fill="#fffdf8" stroke="#27241f" stroke-width="1.2"/>`).join('');
  const P2 = g0 + C.cells.map((c) => `<path d="${pd(c.geom, V)}" fill="#f8f4ea" stroke="#5c5648" stroke-width=".6"/><text class="pl-cell" style="font-size:6px" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 2).toFixed(1)}" text-anchor="middle">${esc(c.label.split('·')[1])}</text>`).join('');
  const P3 = g0 + C.cells.map((c) => { const a = C.assignments[c.id]; return `<path d="${pd(c.geom, V)}" fill="${a ? mixC(a.mix) : '#eee'}" fill-opacity=".6" stroke="#fffdf8" stroke-width=".7"/><text class="pl-cell" style="font-size:8px" x="${V.X(c.center[0]).toFixed(1)}" y="${(V.Y(c.center[1]) + 3).toFixed(1)}" text-anchor="middle">${a ? num(a.mix) : ''}</text>`; }).join('');
  const P4 = g0 + plants(list, V, C, { colour: 'species', scale: 0.55, min: 0.45, alpha: 0.95 });
  // the module: one validated 6 × 3 m sample of mix 2, then the same lattice running through A1
  const m2 = C.paint[1].mix; const sw = C.swatches[m2]; const MV = view([0, 0, sw.w, sw.h], 190);
  const mod = `<rect width="${MV.W}" height="${MV.H}" fill="#fffdf8" stroke="#27241f" stroke-width="1.6"/>` + plants(sw.plants, MV, C, { colour: (p, s) => (p.s === 'base' ? s.leaf : p.s === 'overlay' ? s.flower : '#b3a7c6'), scale: 0.55, alpha: 0.95 });
  const W = 1180, gap = 34; let g = `<svg x="0" y="30" width="${MV.W}" height="${MV.H}" viewBox="0 0 ${MV.W} ${MV.H}">${mod}</svg><text class="mk-h" x="0" y="18">Module · mix 2</text><text class="mk-s" x="0" y="${30 + MV.H + 18}">${esc(C.mixes.find((m) => m.id === m2).name)}, 6 × 3 m</text><text class="mk-s" x="0" y="${30 + MV.H + 34}">one validated sample</text>`;
  const ox = 240, pw = (W - ox - 3 * gap) / 4; const VV = view(box, pw);
  const panels = [['Framework', P1], ['Numbered cells', P2], ['Painted by number', P3], ['Functional cover', P4]];
  const Vs = view(box, pw); // re-scale each panel to pw
  panels.forEach(([t, inner], i) => { const x = ox + i * (pw + gap); g += `<text class="mk-h" x="${x}" y="18">${i + 1} · ${t}</text><svg x="${x}" y="30" width="${pw.toFixed(1)}" height="${Vs.H.toFixed(1)}" viewBox="0 0 ${V.W.toFixed(1)} ${V.H.toFixed(1)}">${inner}</svg>`; if (i < 3) g += `<path class="cv-arrow" d="M${x + pw + 4} ${30 + Vs.H / 2}h${gap - 10}m-5 -4l5 4l-5 4"/>`; });
  const H = 30 + Math.max(Vs.H, MV.H + 24) + 8;
  const fig = `<svg class="fx cv" viewBox="0 0 ${W} ${H}" role="img" aria-label="A planting module, then beds B1 and A1 as framework, numbered cells, cells painted by number and the cover of placed plants">${DEFS}${g}</svg>`;
  const walk = `<p>${C.cells.length} numbered cells; three mixes painted by number (1 · ${esc(C.mixes.find((m) => m.id === C.paint[0].mix).name)}, 2 · ${esc(C.mixes.find((m) => m.id === C.paint[1].mix).name)}, 3 · ${esc(C.mixes.find((m) => m.id === C.paint[2].mix).name)}). Each mix’s plants come from one lattice anchored to the site, so a module continues through every cell it is painted on: no seams at cell edges, no stacking when repainted.</p>`;
  const more = `${now('Spatial logics give a legible framework of numbered cells (Structure); a mix is assigned by number or by brush (Compose); the lattice makes any mix a scalable module.')}${next('A catalogue of tested modules per site type, and module sizes tuned to the bed rather than fixed by the mix.')}`;
  return step(2, 'Scalable modules and paint by number', `<p>The course contrasts the conventional <b>paint by number</b>, where every polygon gets one plant code, with <b>scalable modules</b>: a diverse, functional cover repeated inside a legible spatial framework. Generative Planting keeps the clarity of numbers and gives each number a community instead of a single plant.</p>`, walk, more, fig, 'A module of mix 2, then continuous plans of the example at one scale: framework, numbered cells, cells painted by number, the cover of placed plants.', { span: true }) .replace(/<\/li>$/, `${course('P24 scalable modules · P25 legible spatial framework, diverse functional cover · P26 paint by number')}</li>`);
}

// ================================================================ 3 · planting systems
function systems() {
  const BY = { 'matrix-based': C.MIX.matrix, 'true-meadow': C.MIX.meadow, 'maximal-color': C.MIX.blocks, 'under-trees': C.MIX.trees };
  const COURSE = { 'matrix-based': ['Long-lived matrix', 'Emergent forbs', 'Groundcovers', 'Dynamic fillers'], 'true-meadow': ['Cool season growers', 'Warm season growers', 'Nitrogen fixers', 'Dynamic fillers'], 'maximal-color': ['Base blocks', 'Emergents', 'Ephemerals'], 'under-trees': ['Clumping species', 'Clonal spreading species', 'Winter present species', 'Color theme plants', 'Ephemerals'] };
  const cols = C.systems.map((S) => {
    const mx = C.mixes.find((m) => m.id === BY[S.id]); const sw = mx && C.swatches[mx.id]; const V = view([0, 0, 6, 3], 260);
    const roleOfMix = new Map(); if (mx) for (const L of mx.layers) for (const q of L.members) roleOfMix.set(q.role, (roleOfMix.get(q.role) || 0) + 1);
    const cid = `sw-${S.id}`; const plan = sw ? svg(V, `<clipPath id="${cid}"><rect width="${V.W}" height="${V.H}"/></clipPath><rect width="${V.W}" height="${V.H}" fill="#fffdf8"/><g clip-path="url(#${cid})">` + plants(sw.plants, V, C, { colour: (p) => ROLE_C[p.r] || LAYER_C[p.s], scale: 0.5, alpha: 0.95 }) + `</g><rect width="${V.W}" height="${V.H}" fill="none" stroke="#bdb5a3"/>`, { label: `Plan sample of ${S.name}` }) : '';
    const sx = sw ? section(C, sw.plants, [0, 1.5], [6, 1.5], { W: 260, H: 120, band: 0.75, label: `Section of ${S.name}` }) : null;
    const sxCol = sw ? (() => { const L = 6; const k = 260 / L; let g = ''; const pts = sw.plants.filter((p) => Math.abs(p.y - 1.5) <= 0.75).sort((a, b) => b.y - a.y); for (const p of pts) { const s = C.species[p.p] || {}; g += glyph(s, p.x * k, 100, Math.min(90, (s.h || 0.5) * k * 0.9), Math.max(4, (s.w || 0.4) * k * 0.85), { mono: ROLE_C[p.r] || LAYER_C[p.s] }); } return `<svg class="gp-sx" viewBox="0 0 260 112" aria-hidden="true">${g}<line class="sx-ground" x1="0" x2="260" y1="100" y2="100"/></svg>`; })() : '';
    const roles = S.layers.flatMap((L) => L.roles.map((r) => ({ r, L }))).map(({ r, L }) => `<li>${swatch(ROLE_C[r] || '#999', 'dot')}${esc(C.roles[r].name)} <span class="gp-tag l-${L.slot}" style="font-size:10px;padding:0 5px">${LAYER_N[L.slot]}</span><em>${roleOfMix.get(r) ? `${roleOfMix.get(r)} sp.` : 'no plant'}</em></li>`).join('');
    const rule = S.layers.map((L) => `${LAYER_N[L.slot]}: ${L.basis === 'area' ? `${L.arrangement}, by area` : L.basis === 'drift' ? `drifts ${Math.round(L.coverage * 100)} %` : `${L.density}/m²`}`).join(' · ');
    return `<div><h4>${esc(S.name)}</h4><p class="gp-course-roles">${COURSE[S.id].map(esc).join(' · ')}</p>${plan}${sxCol}<ul class="gp-roles">${roles}</ul><p class="gp-mixn">${mx ? `sample: ${esc(mx.name)} (legend recipe)` : 'no legend recipe'}<br>template: ${esc(rule)}</p></div>`;
  }).join('');
  const fig = `<div class="gp-sys">${cols}</div>`;
  const walk = `<p>Both zones of the strategy are <b>Matrix Based</b>; the three painted mixes are one Matrix Based and two Maximal Color recipes. A system decides the roles and layers a mix must fill; a mix fills them with Detroit plants; a missing role is listed, never filled silently.</p>`;
  const more = `${now('Four templates with the course’s roles, each role assigned to a layer (Base, Overlay, Bulbs) with its own rule. Layer shares, densities and drift cover are prototype assumptions, not values from the slides.')}${next('Roles read from knowledge (cool- and warm-season growth, nitrogen fixing, winter presence) instead of being chosen by hand; dynamic fillers that self-seed over years are not simulated.')}`;
  return step(3, 'Planting systems and functional roles', `<p>The course organises planting <b>layers by functional role</b>, with four systems. A system is not a palette: it is a set of roles a community needs, each with its own spatial behaviour. Matrix Based starts from long-lived grasses; True Meadow intermingles cool- and warm-season growers with nitrogen fixers; Maximal Color sets base blocks, emergents and ephemerals; Under Trees combines clumping, clonal and winter-present plants with a colour theme.</p>`, walk, more, fig, 'Each column: a validated 6 × 3 m sample of the Detroit legend recipe for that system, in plan and section, coloured by role; roles as the course names them, then as the template layers them.', { span: true }).replace(/<\/li>$/, `${course('P34 planting layers by functional roles · P35 matrix-based mix · P36 long-lived stable perennials, season of bloom')}</li>`);
}

// ================================================================ 4 · functional layers and boundary overlap
function layers() {
  const B = C.brush; const cx = (B.a[0] + B.b[0]) / 2, cy = (B.a[1] + B.b[1]) / 2; const box = [cx - 5, cy - 5, cx + 5, cy + 5]; const list = allPlants(C.inst);
  const ex = axo(C, list, box, { W: 700, explode: { base: 0, overlay: 2.4, ephemeral: 4.8 }, layerPlates: true, beds: true, padR: 90, label: 'Exploded axonometric of 10 × 10 m across the walk: Base, Overlay and Bulbs layers of the placed plants', hScale: 0.9 });
  // the boundary: plan + section across the soft edge, from B1's matrix into the brushed groups
  const pbox = [Math.min(B.a[0], B.b[0]) - 3, Math.min(B.a[1], B.b[1]) - 3.5, Math.max(B.a[0], B.b[0]) + 3, Math.max(B.a[1], B.b[1]) + 3.5]; const V = view(pbox, 340);
  const mixC = (id) => (C.mixes.find((m) => m.id === id) || {}).color;
  let ph = ground(C, V, { label: false }); for (const c of C.cells) { const a = C.assignments[c.id]; if (!a) continue; for (const f of a.fragments) { ph += `<path d="${pd(f.geom || c.geom, V)}" fill="${mixC(f.mix)}" fill-opacity="${f.geom ? 0.35 : 0.18}"/>`; if (f.edge === 'soft') ph += `<path d="${pd(f.geom, V)}" fill="url(#h-soft)"/>`; } }
  ph += plants(list, V, C, { colour: 'mix', scale: 0.42, alpha: 0.9 }); ph += `<line x1="${V.X(B.a[0])}" y1="${V.Y(B.a[1])}" x2="${V.X(B.b[0])}" y2="${V.Y(B.b[1])}" stroke="#27241f" stroke-dasharray="5 4"/>` + scaleBar(V, 12, V.H - 10, 2);
  const sx = section(C, list, B.a, B.b, { W: 340, H: 150, band: 0.6, label: 'Section along the brush gesture' });
  const fig = `<div class="gp-two-fig"><div>${ex}<p class="gp-key"><span>${swatch(LAYER_C.ephemeral)}Bulbs · drifts</span><span>${swatch(LAYER_C.overlay)}Overlay · count per m²</span><span>${swatch(LAYER_C.base)}Base · area shares</span></p></div><div>${svg(V, ph, { label: 'Plan of the soft boundary' })}${sx.svg}<p class="gp-key">${C.paint.map((p) => `<span>${swatch(mixC(p.mix), 'dot')}${esc(C.mixes.find((m) => m.id === p.mix).name)}</span>`).join('')}<span>${swatch('#27241f', 'line')}section</span></p></div></div>`;
  const dens = (id) => { const m = C.mixes.find((q) => q.id === id); return m ? m.layers.map((L) => `${LAYER_N[L.slot]} ${m.layerDensity[L.id]}`).join(' · ') : ''; };
  const walk = `<p>Dropseed matrix: ${esc(dens(C.MIX.matrix))} plants/m², each layer computed on its own. The brush gesture replaced Base and Overlay only: the ${C.brush.result.kept} bulbs underneath stayed. On the soft rim (outer ${Math.round(C.brush.softBand * 100)} % of the brush) old and new plants mix; a conflicting plant is swapped for a member of the same layer.</p>`;
  const more = `${now('Base, Overlay and Bulbs with independent density, cover and spacing; layer-only strokes; same-layer replacement; soft edges; same-layer substitution when light conflicts (the course’s “substitute species, keep layers and roles”).')}${next('Design layers by season (early, mid, late summer, autumn) as their own spatial layers; overlap between communities that changes over years.')}`;
  return step(4, 'Functional layers and boundary overlap', `<p>The course stacks <b>blocks, emergents and ephemerals</b> as layers based on seasonal events, and keeps the functional layers when a species is substituted. In the engine these are <b>Base</b>, <b>Overlay</b> and <b>Bulbs</b>. They do not share one 100 %: Base divides the area, Overlay is counted per m² over it, Bulbs fill drifts that cover part of it. Communities meet with a hard edge or a soft, mixed one.</p>`, walk, more, fig, 'Left: the placed plants of a 10 × 10 m piece across the walk, pulled apart by layer. Right: the same boundary in plan (cells coloured by mix, hatched where the brush made a soft edge) and in section along the gesture.', { span: true }).replace(/<\/li>$/, `${course('P41 layers based on seasonal events (blocks, emergents, ephemerals) · P32 substitute species, keep functional layers and roles')}</li>`);
}

// ================================================================ 5 · rules-based planting and constraints
function rules() {
  const box = C.site.box; const grid = C.site.grid; const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2; const c30 = Math.cos(Math.PI / 6);
  const P = (x, y, z) => [((x - cx) - (y - cy)) * c30, -((x - cx) + (y - cy)) * 0.5 - z];
  const plates = [
    ['Proximity', 'distance to a walk', 'actual', (v) => (v[4] == null ? null : ramp(Math.min(1, v[4] / 6), ['#3f6e8c', '#cfe0e6']))],
    ['Elevation', 'USGS 3DEP, 1 m', 'actual', (() => { const e = grid.map((v) => v[2]).filter((x) => x != null); const lo = Math.min(...e), hi = Math.max(...e); return (v) => (v[2] == null ? null : ramp((v[2] - lo) / Math.max(0.01, hi - lo), ['#efe3c8', '#8a6a3e'])); })()],
    ['Sun exposure', 'A1 assumed, B1 unknown', 'assumption', null],
    ['Slope', 'from the terrain', 'actual', (v) => (v[3] == null ? null : ramp(Math.min(1, v[3] / 8), ['#f4efe4', '#c8873f']))],
    ['Plants', `${n0(allPlants(C.inst).length)} placed`, 'computed', null],
  ];
  const W = 980; const span = Math.max(box[2] - box[0], box[3] - box[1]); const gapZ = span * 0.2; const zs = plates.map((_, i) => i * gapZ);
  const all = []; for (const z of zs) for (const [x, y] of [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]) all.push(P(x, y, z));
  const minX = Math.min(...all.map((q) => q[0])), maxX = Math.max(...all.map((q) => q[0])), minY = Math.min(...all.map((q) => q[1])) - 2, maxY = Math.max(...all.map((q) => q[1]));
  const LW = 300; const k = (W - LW) / (maxX - minX); const T = (q) => [(q[0] - minX) * k, (q[1] - minY) * k]; const H = (maxY - minY) * k + 10;
  const poly = (pts) => 'M' + pts.map((q) => T(q).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
  const bedsIn = C.site.beds.filter((b) => b.inCase); let g = '';
  plates.forEach(([name, sub, status, col], i) => { const z = zs[i];
    g += `<path d="${poly([[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map(([x, y]) => P(x, y, z)))}" fill="rgba(255,253,248,.92)" stroke="#bdb5a3"/>`;
    if (col) for (const v of grid) { const c = col(v); if (!c) continue; g += `<path d="${poly([[v[0] - 0.5, v[1] - 0.5], [v[0] + 0.5, v[1] - 0.5], [v[0] + 0.5, v[1] + 0.5], [v[0] - 0.5, v[1] + 0.5]].map(([x, y]) => P(x, y, z)))}" fill="${c}"/>`; }
    if (name === 'Sun exposure') for (const b of bedsIn) for (const pl of b.geom) g += `<path d="${poly(pl[0].map(([x, y]) => P(x, y, z)))}" fill="url(#${C.define.assume[b.id] ? 'h-assume' : 'h-unknown'})" stroke="none"/>`;
    for (const b of bedsIn) for (const pl of b.geom) g += `<path d="${poly(pl[0].map(([x, y]) => P(x, y, z)))}" fill="none" stroke="#27241f" stroke-width=".8"/>`;
    if (name === 'Plants') for (const p of allPlants(C.inst)) { if (Math.random() < 0) continue; const [X, Y] = T(P(p.x, p.y, z)); g += `<circle cx="${X.toFixed(1)}" cy="${Y.toFixed(1)}" r="${p.s === 'ephemeral' ? 0.6 : 1}" fill="${(C.species[p.p] || {}).leaf || '#7a8f4e'}"/>`; }
    const lab = T(P(box[0], box[3], z)); g += `<text class="mk-l" x="${(W - LW + 14).toFixed(1)}" y="${(lab[1] - 2).toFixed(1)}">${name}</text><text class="mk-s" x="${(W - LW + 14).toFixed(1)}" y="${(lab[1] + 13).toFixed(1)}">${esc(sub)}</text><text class="mk-s" x="${(W - LW + 14).toFixed(1)}" y="${(lab[1] + 27).toFixed(1)}" fill="${status === 'actual' ? '#3b5538' : status === 'assumption' ? '#8a5f1c' : '#716b5c'}">${status === 'actual' ? 'actual site information' : status === 'assumption' ? 'assumption / unknown' : 'computed by the engine'}</text>`; });
  const stack = `<svg class="fx" viewBox="0 0 ${W} ${H.toFixed(0)}" role="img" aria-label="Layered analysis over beds B1 and A1: proximity to walks, elevation, sun exposure, slope and placed plants">${DEFS}${g}</svg>`;
  // what the plant list can answer: species of the example with a light, moisture or pH record (the course's Venn)
  const ids = Object.keys(C.phen).filter((id) => allPlants(C.inst).some((p) => p.p === id)); const has = (id, k) => C.phen[id][k] && C.phen[id][k].status !== 'unknown';
  const L = ids.filter((id) => has(id, 'light')).length, M = ids.filter((id) => has(id, 'moisture')).length, LM = ids.filter((id) => has(id, 'light') && has(id, 'moisture')).length;
  const venn = `<svg class="fx gp-venn" viewBox="0 0 330 230" role="img" aria-label="Of ${ids.length} species placed: ${L} with a light record, ${M} with a moisture record, ${LM} with both, none with a pH record">
    <circle cx="120" cy="95" r="76" fill="rgba(183,137,77,.16)" stroke="#b7894d"/><circle cx="205" cy="95" r="76" fill="rgba(79,134,160,.14)" stroke="#4f86a0"/><circle cx="162" cy="165" r="62" fill="none" stroke="#b9b2a2" stroke-dasharray="3 4"/>
    <text class="mk-l" x="70" y="60">Light</text><text class="mk-l" x="222" y="60">Moisture</text><text class="mk-l" x="140" y="216">pH</text>
    <text class="mk-big" x="85" y="105">${L - LM}</text><text class="mk-big" x="150" y="105">${LM}</text><text class="mk-big" x="220" y="105">${M - LM}</text><text class="mk-s" x="150" y="190">0 records</text></svg>`;
  const rows = [['Bed edges, walks', 'OpenStreetMap, checked on aerial imagery', 'actual', 'hard boundary of every cell and plant'], ['Existing trees', 'crowns digitised from NAIP; species unknown', 'actual', 'trunk clearance; under a crown = probable shade (proxy)'], ['Elevation, slope', 'USGS 3DEP 1 m', 'actual', 'turns bands to the contours; ranks organic layouts'], ['Distance to walk', 'from the walks', 'actual', 'bands follow the walk; cell conditions'], ['Sun / shade', 'no data', 'unknown', 'light fit when the designer states a project assumption'], ['Soil moisture', 'no data', 'unknown', 'recorded for plants; not used for placement'], ['pH', 'no data', 'unknown', 'no plant record either'], ['Plant light, flowering', 'mostly the teaching layer', 'illustrative', 'light fit, substitution, monthly resources']];
  const tbl = `<table class="gp-tbl"><thead><tr><th>Constraint</th><th>Detroit data</th><th>Standing</th><th>What the engine does with it now</th></tr></thead><tbody>${rows.map(([a, b, c, d]) => `<tr><td>${a}</td><td>${b}</td><td>${tag(c === 'actual' ? 'actual' : c, { actual: 'actual site information', unknown: 'unknown', illustrative: 'illustrative plant knowledge' }[c])}</td><td>${d}</td></tr>`).join('')}</tbody></table>`;
  const walk = `<p>Of the ${ids.length} species placed, ${L} have a light record and ${M} a moisture record; none has pH. Detroit has no sun, moisture or pH data at all. Adding an analysis layer therefore asks for more plant knowledge: the gap is shown, not filled.</p>`;
  const more = `${now('Hard boundaries, trunk clearance, crown shade proxy, project light assumptions, light fit with same-layer substitution, slope- and walk-aware cell shapes.')}${next('Sun hours from a 3D shadow study, a wetness index from the terrain, soil tests: each would join as a layer with its own standing, read by the same fit rule.')}`;
  return step(5, 'Rules-based planting and layering constraints', `<p>In rules-based planting each layer of analysis changes where a plant may go, and more layers demand more from the plant list. Here every layer keeps its <b>standing</b>: actual site information, a project assumption, illustrative plant knowledge, or unknown. Nothing unknown is drawn as if it were measured.</p>`, walk, more, `${stack}<div class="gp-two-fig b"><div>${venn}</div><div>${tbl}</div></div>`, 'Layers computed on a 1 m grid over the example from the site model; sun is hatched where assumed (A1) and dotted where unknown (B1). The circles count the species actually placed.', { span: true }).replace(/<\/li>$/, `${course('P69 Rhino › Grasshopper › Land Kit: topo, site, paving, planting, performance · P71 rules-based planting · P72 layering constraints: plants, slope, sun exposure, elevation, proximity')}</li>`);
}
function ramp(t, [a, b]) { const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); const A = h(a), B = h(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

// ================================================================ 6 · precedents
function precedents() {
  const fig = `<div class="ab-three gp-prec">
    <div><h3>Land Kit</h3><p>Rhino › Grasshopper › Land Kit stacks site, topography, paving, planting and performance as computational layers. Generative Planting keeps the layers and the rules, and replaces the Grasshopper definition with a brush and numbered cells.</p></div>
    <div><h3>Pollinator Pathmaker</h3><p>A garden designed by an algorithm for pollinators, read through time. Explore follows it: the result in the centre, observed month by month, every count made from the plants actually placed.</p></div>
    <div><h3>Landscape as Laboratory</h3><p>The reference for reading one result in several drawings at once: plan, axonometric and diagram of the same plants, compared on the same measures, and sent back for revision.</p></div></div>`;
  const walk = `<p>The example is read as Plan, Axo, Diagram, Seasonality and Performance in <a href="${esc(routes.how)}?stage=explore">How it works · Explore</a>, all from the same ${n0(allPlants(C.inst).length)} plants.</p>`;
  return step(6, 'Land Kit, Pollinator Pathmaker and the result', `<p>Three precedents set the ambition: the computational depth of a Grasshopper toolkit, the time-based reading of a pollinator garden, and the habit of reading a landscape result as an experiment. Reference images are not reproduced here.</p>`, walk, '', fig, '', { span: true });
}

// ================================================================ 7 · AI
function ai() {
  const W = 700, H = 330; let g = '';
  const col = (x, title, items, cls) => `<g class="ai-c ${cls}"><text class="mk-l" x="${x}" y="22">${title}</text>${items.map((t, i) => `<text class="mk-v" x="${x}" y="${50 + i * 22}">${esc(t)}</text>`).join('')}</g>`;
  g += col(0, 'Rule-based generative design', ['deterministic controls', 'predictable result', 'define and execute a procedure', 'adaptable parametric rules'], 'r');
  g += col(370, 'Generative AI', ['indeterminate outcomes', 'unpredictable response', 'train, learn and create', 'statistical model weights'], 'a');
  g += `<line x1="0" x2="${W}" y1="150" y2="150" stroke="#27241f"/>`;
  // the loop: words → LLM → operation → engine validates → result → designer
  const box = (x, y, w, t, s, cls) => `<rect x="${x}" y="${y}" width="${w}" height="56" rx="8" class="ai-b ${cls}"/><text class="mk-l" x="${x + 12}" y="${y + 23}">${t}</text><text class="mk-s" x="${x + 12}" y="${y + 41}">${esc(s)}</text>`;
  g += box(0, 196, 150, 'Designer', 'words · gestures', 'd');
  g += box(185, 196, 160, 'Language model', 'intent · retrieval', 'p');
  g += box(380, 196, 150, 'Operation', 'assign · edit · assume', 'p');
  g += box(560, 196, 140, 'Rules engine', 'execute · validate', 'n');
  const ar = (x1, x2, y, cls) => `<path d="M${x1} ${y}H${x2}" class="ai-a ${cls}" marker-end="url(#ai-${cls})"/>`;
  g += `<defs><marker id="ai-n" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3b5538"/></marker><marker id="ai-p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#b7894d"/></marker></defs>`;
  g += ar(150, 183, 224, 'p') + ar(345, 378, 224, 'p') + ar(530, 558, 224, 'p');
  g += `<path d="M630 252V290H75V254" class="ai-a n" marker-end="url(#ai-n)"/><text class="mk-s" x="352" y="306" text-anchor="middle">cells, plants and checks · the same result whoever asked</text>`;
  g += `<path d="M75 196V176H630V194" class="ai-a n" marker-end="url(#ai-n)"/><text class="mk-s" x="352" y="170" text-anchor="middle">today: the designer’s gesture goes straight to the engine</text>`;
  const fig = `<svg class="fx gp-ai" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rule-based generative design compared with generative AI, and the planned loop: designer, language model, operation, rules engine, result">${g}</svg>`;
  const walk = `<p>No language model is called in this prototype. The operations a model would call already exist and are validated: a suggested recipe or edit is checked against known plant ids and evidence, and rejected if it invents one. The brush, the cells and every coordinate stay deterministic.</p>`;
  const more = `${now('Offline rules engine: Rules-mode intent reading and mix suggestion; validation of any structured suggestion; a server gate for a model that stays closed without a key and an explicit permission to spend.')}${next('LLM-assisted reasoning: understanding intent, extracting and linking knowledge from notes and sources, retrieving what a question needs, explaining trade-offs and proposing executable operations. It calls the engine; it never sets a plant’s coordinates and is not part of each mouse move.')}`;
  return step(7, 'Rules now, language models next', `<p>The course contrasts rule-based generative design with generative AI, and asks for accuracy, function and time beyond appearance. This project combines them in a fixed order: the model may read, retrieve and propose; the rules engine executes and validates; the designer decides.</p>`, walk, more, fig, 'Top: the course’s comparison, restated. Bottom: the planned loop (caramel, dashed) beside today’s direct path (green).').replace(/<\/li>$/, `${course('P110 rule-based vs data-driven methods · P122 accuracy, functionality, time · P135 rule-based generative design and generative AI')}</li>`);
}
