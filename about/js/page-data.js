// About · Sources & data — where every value in the example comes from. Counted from the computed example and the engine's own
// exported parameters; nothing is typed in except the descriptions of the sources.
import { mast, sec, fig, go, routes, nm, nmTxt, tag } from './parts.js';
import { esc, allPlants, MONTHS } from './figures.js';
import { RULES, LOGICS } from '../../src/flow/spatial.js';
import { PERF } from '../../src/flow/performance.js';

const n0 = (v) => Number(v).toLocaleString('en-US');
const ATTR = [['bloom', 'flowering'], ['light', 'light'], ['moisture', 'moisture'], ['poll', 'pollinators'], ['role', 'role']];

export function frame() {
  return `<div class="ab ab-data">
  ${mast('Sources &amp; data.', 'Where each value in the example comes from: what is measured, what the designer assumes, what is only a teaching value, and what is not known. Every figure on this page is counted from the computed example.', '<p class="ab-prov" id="gp-prov">counting…</p>')}
  <div id="gp-data"></div></div>`;
}

export async function fill(C) {
  const list = allPlants(C.inst); const cnt = {}; for (const p of list) cnt[p.p] = (cnt[p.p] || 0) + 1; const ids = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  const cell = (id, k) => { const t = C.phen[id][k]; if (!t || t.status === 'unknown') return 'unknown'; if (t.status === 'conflict') return 'conflict'; return t.source; };
  const by = { site: 0, foundation: 0, illustrative: 0, project: 0, personal: 0, unknown: 0, conflict: 0 }; for (const id of ids) for (const [k] of ATTR) by[cell(id, k)]++; const tot = ids.length * ATTR.length;
  const plantsBy = (k, v) => list.filter((p) => cell(p.p, k) === v).length;
  const S = C.define.sources || {};
  document.getElementById('gp-prov').innerHTML = `Knowledge state <b>${esc(String(C.meta.knowledge).slice(0, 26))}…</b><br>engine ${esc(C.meta.engine)} · perf/3<br>computed ${esc(C.meta.computedAt.slice(0, 10))}, in this browser`;
  const grid = `<table class="gp-grid"><thead><tr><th></th>${ATTR.map(([, l]) => `<th>${l}</th>`).join('')}<th>plants</th></tr></thead><tbody>${ids.map((id) => `<tr><th>${esc(nmTxt(C, id))}</th>${ATTR.map(([k, l]) => { const v = cell(id, k); const t = C.phen[id][k]; return `<td><i class="${v}" title="${esc(`${nmTxt(C, id)} · ${l}: ${t && t.value != null ? [].concat(t.value).join(', ') : 'unknown'} (${v})`)}"></i></td>`; }).join('')}<td class="gp-mono">${cnt[id]}</td></tr>`).join('')}</tbody></table>`;
  const layers = [
    ['Foundation', 'foundation', 'The shared Planting Intelligence base: mostly Metro Vancouver plants. For Detroit species: legend roles, Robertson 1929 visitor lists (Illinois), one light record. Applied only where its place fits Detroit.', 'everyone'],
    ['Site plant list', 'site', 'What the garden’s own plans and plant lists print, such as meadow hydrology.', 'this site'],
    ['Project', 'project', 'Records made inside one design: a light assumption, a note, a correction. Previewed before they apply; undoable.', 'one design'],
    ['Personal', 'personal', 'A designer’s own knowledge, kept in their browser and carried across designs. Empty at first use.', 'one designer'],
    ['Teaching layer', 'illustrative', esc((S.illustrative && S.illustrative.statement) || 'Typical horticultural values written to teach the workflow. Not evidence.'), 'switchable'],
  ];
  const sys = C.systems.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.layers.map((L) => `${esc(L.name)}: ${L.basis === 'area' ? Object.entries(L.shares || {}).map(([r, v]) => `${esc(C.roles[r].name)} ${Math.round(v * 100)} % at ${L.spacing[r]} m`).join(', ') : L.basis === 'drift' ? `${Math.round(L.coverage * 100)} % cover, ${L.densityInDrift} per m² in drifts` : `${L.density} per m²`}`).join(' · ')}</td></tr>`).join('');
  const R = C.meta.rules;
  const params = [['Bed edge inset', `${R.edgeInsetM} m`, 'plant centres from the hard bed outline'], ['Trunk clearance', `${R.trunkClearanceM} m`, 'from an existing tree'], ['Same-layer spacing', `${R.sameLayerK} × spacing`, 'between plants of one layer, across cells'], ['Clearance between layers', `${R.centreClearanceM} m`, 'centre to centre'], ['Brush reach', `${R.reachM} m`, 'neighbours loaded for spacing'], ['Soft rim', `${Math.round(R.softBand * 100)} % of the radius`, 'mixed replacement band'], ['Fragment merge', `${Math.round(RULES.fragmentMergeFraction * 100)} % of a cell`, 'smaller pieces join a neighbour'], ['Adjacency', `${RULES.adjacencyMinSharedM} m shared · ${RULES.nearAcrossPathM} m across a walk`, 'potential connection, not a route'], ['Band segment', `${RULES.bandSegment} × band width`, 'curved bands are cut into cells'], ['Strong resource', `${PERF.strongPerM2} plant per m²`, 'flowering, not wind-pollinated']];
  document.getElementById('gp-data').innerHTML = `
  <dl class="ab-figs" aria-label="The example in figures">
    ${fig(ids.length, null, `species placed, ${n0(list.length)} plants`)}
    ${fig(by.illustrative, tot, 'plant values from the teaching layer, not verified')}
    ${fig(by.unknown, tot, 'plant values unknown')}
    ${fig(3, null, 'site conditions with no data: sun, moisture, pH')}
  </dl>
  ${sec('layers', 'Knowledge layers', 'Five layers, one order of precedence. Disagreements are kept, never averaged.', `
    <table class="gp-tbl"><thead><tr><th>Layer</th><th>What it holds</th><th>Shared with</th><th>In the example</th></tr></thead><tbody>${layers.map(([l, k, w, sh]) => `<tr><td>${tag(k, l)}</td><td>${w}</td><td>${sh}</td><td class="n">${k === 'illustrative' ? `${by.illustrative} values` : k === 'site' ? `${by.site} values` : k === 'foundation' ? `${by.foundation} values` : 'none'}</td></tr>`).join('')}</tbody></table>
    <p class="ab-note">Order of precedence: personal › project › foundation › site list › teaching layer. A designer can prefer one source for one plant and attribute. A first-time user has an empty personal layer and still designs from the rest.</p>`)}
  ${sec('coverage', 'Recorded, illustrative, unknown', 'A gap is a missing record, never a statement about the plant.', `
    <dl class="ab-figs in">${fig(n0(plantsBy('bloom', 'unknown')), n0(list.length), 'placed plants whose flowering is unknown')}${fig(n0(plantsBy('light', 'unknown')), n0(list.length), 'placed plants whose light is unknown')}${fig(by.conflict, null, 'values where sources disagree, both kept')}</dl>
    ${grid}
    <p class="gp-key"><span><i class="gp-sw" style="--c:#3b5538"></i>site list or foundation</span><span><i class="gp-sw" style="--c:#f1e3cb;outline:1px dashed #b7894d"></i>teaching layer</span><span><i class="gp-sw" style="--c:#4f86a0"></i>project record</span><span><i class="gp-sw" style="--c:#f2dcd4;outline:1px solid #b04f36"></i>sources disagree</span><span><i class="gp-sw" style="--c:transparent;outline:1px dotted #9c9583"></i>unknown</span></p>`)}
  ${sec('site', 'Site data', 'The Detroit model: measured, reconstructed, schematic and unknown, kept apart.', `
    <table class="gp-tbl"><thead><tr><th>Layer</th><th>Source</th><th>Standing</th></tr></thead><tbody>
      <tr><td>Bed outlines, walks, walls, roads, lake</td><td>OpenStreetMap, checked on USGS aerial imagery</td><td>${tag('actual', 'actual site information')}</td></tr>
      <tr><td>Bed codes and styles (Block A, Matrix B, Grouping C)</td><td>the garden’s planting plans, 2019 / 2020</td><td>${tag('actual', 'documented')}</td></tr>
      <tr><td>Terrain: elevation, slope</td><td>USGS 3DEP, 1 m</td><td>${tag('actual', 'actual site information')}</td></tr>
      <tr><td>Existing tree crowns</td><td>digitised from USGS NAIP; species unknown</td><td>${tag('assumption', 'reconstructed')}</td></tr>
      <tr><td>Reference planting inside the beds</td><td>generated from the documented structure, fixed seeds</td><td>${tag('assumption', 'schematic')}</td></tr>
      <tr><td>Sun, soil moisture, pH</td><td>none</td><td>${tag('unknown', 'unknown, never 0')}</td></tr>
      <tr><td>Light in A1 (this example)</td><td>set by the designer</td><td>${tag('assumption', 'project assumption')}</td></tr></tbody></table>`)}
  ${sec('assumptions', 'Computational assumptions', 'Prototype values, stated in the code and editable. None is a validated optimum.', `
    <table class="gp-tbl"><thead><tr><th>Parameter</th><th>Value</th><th>Applies to</th></tr></thead><tbody>${params.map(([a, b, c]) => `<tr><td>${a}</td><td class="n">${esc(b)}</td><td>${c}</td></tr>`).join('')}</tbody></table>
    <h3 class="ab-h3">Planting system templates</h3>
    <table class="gp-tbl"><thead><tr><th>System</th><th>Layers, as templated</th></tr></thead><tbody>${sys}</tbody></table>
    <p class="ab-note">Roles come from the course (P34, P41); the shares, spacings, densities and drift cover are the prototype’s. Cell sizes offered: Honeycomb ${LOGICS.honeycomb.sizes.join(' / ')} m, Bands ${LOGICS.bands.sizes.join(' / ')} m, Organic ${LOGICS.organic.sizes.join(' / ')} m.</p>`)}
  ${sec('course', 'Course and references', '', `
    <ul class="gp-list">
      <li><span><i>Generative Planting at Scale: Systems Design for Ecological Impact</i>, ASLA 2024 education session (Thomas Rainer, Xun Liu, Chris Landau)</span><span>P24–26 · P32 · P34–36 · P41 · P69–72 · P110 · P135</span></li>
      <li><span>Oudolf Garden Detroit planting plans and plant lists</span><span>beds, styles, legend recipes</span></li>
      <li><span>OpenStreetMap · USGS 3DEP · USGS NAIP</span><span>site model</span></li>
      <li><span>Planting Intelligence (the previous prototype): knowledge base and About pages</span><span>foundation knowledge, page design</span></li>
    </ul>
    <p class="ab-note">The course slides were read locally and are not published here; every course diagram on these pages is redrawn from the example, with its page cited. No reference image is reproduced.</p>`)}
  ${sec('limits', 'Limits', 'What a reader should not take from these pages.', `
    <ul class="ab-ticks no">
      <li>No teaching value is a fact about a Detroit plant. Replace the layer with sourced records before any real use.</li>
      <li>Light fit is only as good as the light assumed: Detroit has no sun data.</li>
      <li>Months show seasonal flowering; there is no model of growth, competition or succession.</li>
      <li>A potential connection between cells is a spatial proxy, not a pollinator route.</li>
      <li>No language model is called; every “suggestion” is a written rule.</li>
    </ul>
    ${go([routes.how, 'How it works'], [routes.method, 'Research &amp; Method'])}`)}`;
}
