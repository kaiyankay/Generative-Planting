// Planting recipes: a recipe's real members, drawn by the roles of its plan legend (emergent, group, matrix, bulbs …).
// Strata are the legend's drawing roles in their documented order — not heights, densities or ecological functions.
import * as A from '../analysis.js';
import { esc, sci, glyph, plantVisual, fmtN, mark, DIA, trim } from '../ui.js';
import { bindCommon } from './common.js';
import { compareTable } from './compare.js';
import { seasonsView } from './seasons.js';

const FIELD = new Set(['matrix', 'meadow']);

export function head(app) {
  const kb = app.kbv(); const c = A.recipeComposition(kb, app.sub);
  if (!c) return { title: 'Planting recipes' };
  const t = c.tally;
  return { title: esc(c.system.name), count: t.total, countTitle: `${t.total} members: ${t.species} species, ${t.cultivars} cultivars${t.placeholders ? `, ${t.placeholders} placeholders` : ''} · ${c.roles.reduce((a, R) => a + R.legends.length, 0)} legend entries · roles as drawn in the plan, not ecological roles` };
}
export function contains(app, sel) { if (sel?.kind !== 'entity') return false; const c = A.recipeComposition(app.kbv(), app.sub); return !!c?.members.includes(sel.id); }

export function render(host, app) {
  const kb = app.kbv(); const c = A.recipeComposition(kb, app.sub);
  if (!c) { host.innerHTML = '<div class="empty">Choose a recipe on the left.</div>'; return; }
  if (!c.members.length) { host.innerHTML = `<div class="empty">No legend entries for this recipe in the plan.</div>`; return; }
  const roleOf = id => c.roles.filter(R => R.members.some(m => m.id === id)).map(R => R.role).join(', ');
  if (app.view === 'compare') {
    // members with knowledge beyond their plan role first; the rest one click away
    const kn = id => { const r = A.compareRow(kb, id); const v = [r.own, r.viaSpecies].filter(Boolean); return v.reduce((a, x) => a + (x.heights.length ? 1 : 0) + (x.water.length ? 1 : 0) + (Object.keys(x.light).length ? 1 : 0) + (x.months.some(Boolean) ? 1 : 0) + (x.respondents ? 1 : 0) + (x.robertson ? 1 : 0), 0) + r.mine; };
    const scored = c.members.map(id => [id, kn(id)]).sort((a, b) => b[1] - a[1]);
    const withK = scored.filter(x => x[1] > 0).map(x => x[0]); const all = app._recipeAll;
    host.innerHTML = `<div class="fbar"><span class="choice" role="radiogroup"><button role="radio" data-act="known" aria-checked="${!all}">With knowledge ${withK.length}</button><button role="radio" data-act="all" aria-checked="${!!all}">All members ${c.members.length}</button></span><span class="dim">ordered by how much is recorded</span></div><div class="pad" style="padding-top:4px">${compareTable(app, all ? scored.map(x => x[0]) : withK, { roleOf })}</div>`;
    bindCommon(host, app, { known: () => { app._recipeAll = false; app.renderBody(); }, all: () => { app._recipeAll = true; app.renderBody(); } });
    return;
  }
  else if (app.view === 'seasons') host.innerHTML = seasonsView(app, c.members);
  else host.innerHTML = composition(app, kb, c);
  bindCommon(host, app);
}

function composition(app, kb, c) {
  const members = c.members.map(id => A.plantFacts(kb, id));
  const known = k => members.filter(f => (f.coverage.direct[k] || 0) > 0).length;
  const via = k => members.filter(f => !(f.coverage.direct[k]) && (f.coverage.via[k] || 0) > 0).length;
  let firstBulb = true;
  let h = `<div class="pad">${layersDiagram(app, kb, c)}<div class="ckey" style="padding:10px 0 16px">${['forb', 'grass', 'sedge', 'bulb', 'shrub', 'tree', 'fern'].map(t => `<span>${glyph(t, 16)} ${t}</span>`).join('')}<span class="dim">symbol = plant type from the plan's species list</span>
    <span><span class="inkrow"><i class="k0"></i><i class="k1"></i><i class="k2"></i><i class="k3"></i></span> ink = kinds of knowledge recorded (profile, flowering, survey, Robertson): none → three or more</span><span>${DIA} mine</span></div><div class="comp">`;
  for (const R of c.roles) {
    const isBulb = R.role.startsWith('bulb'); const gl = isBulb && firstBulb; if (isBulb) firstBulb = false;
    h += `<div class="stratum ${FIELD.has(R.role) ? 'field' : ''} ${gl ? 'ground-line' : ''}"><div class="rl"><b>${esc(R.role.replace('bulb-', 'bulbs · '))}</b><span class="num">${R.members.length}</span></div><div class="mem">`;
    for (const m of R.members) {
      const e = kb.state.entities.get(m.id); const f = A.plantFacts(kb, m.id); const cov = f.coverage;
      // how much is known about this plant (own or species): shown as the glyph's ink, details on hover and in the inspector
      const known = [cov.level === 'full' || (m.species && A.plantFacts(kb, m.species)?.coverage.level === 'full'), m.flowering.rows.length > 0, !!(cov.direct.designers || cov.via.designers), !!m.robertson].filter(Boolean).length;
      const dim = app.mineMode && !m.mine ? 'dim' : '';
      const tip = `${e.name} · legend ${m.legend}${known ? '' : ' · nothing recorded beyond the plan'}${m.flowering.rows.length ? ' · flowering' + (m.flowering.via ? ' (species)' : '') : ''}${m.robertson ? ' · Robertson lead' + (m.robertson === 'species' ? ' (species)' : '') : ''}`;
      h += `<button class="m k${Math.min(3, known)} ${e.status === 'placeholder' ? 'placeholder' : ''} ${dim}" data-ent="${esc(m.id)}" data-key="${esc(m.id)}" title="${esc(tip)}">
        ${plantVisual(e, 34)}<span class="nm">${short(e)}</span>${m.mine ? `<span class="mine-m">${DIA}</span>` : ''}</button>`;
    }
    h += `</div></div>`;
  }
  h += `</div>`;
  // what this recipe's members are known for — the coverage, counted honestly
  const rows = [['Full profile (Plant Library)', members.filter(f => f.coverage.level === 'full').length, members.filter(f => f.coverage.level !== 'full' && f.coverage.species && A.plantFacts(kb, f.coverage.species)?.coverage.level === 'full').length],
    ['Flowering months', members.filter(f => A.flowering(kb, f.id).length).length, members.filter(f => !A.flowering(kb, f.id).length && A.floweringOf(kb, f.id).via).length],
    ['Designer survey', known('designers'), via('designers')], ['Robertson 1929 (name match)', members.filter(f => A.activeOf(kb, f.id).some(r => r.datasetId === 'ds:robertson-1929')).length, members.filter(f => !A.activeOf(kb, f.id).some(r => r.datasetId === 'ds:robertson-1929') && f.coverage.species && A.activeOf(kb, f.coverage.species).some(r => r.datasetId === 'ds:robertson-1929')).length],
    ['Ecological role', 0, 0], ['My knowledge', members.filter(f => f.mine).length, 0]];
  const N = members.length; const W = 300;
  h += `<div class="cols2" style="margin-top:26px"><div class="chart"><h3>Known for the ${N} members</h3>
    <svg width="${W + 220}" height="${rows.length * 24 + 24}"><g class="grid">${[0, .25, .5, .75, 1].map(t => `<line x1="${200 + W * t}" x2="${200 + W * t}" y1="0" y2="${rows.length * 24}"/><text class="ax" x="${200 + W * t}" y="${rows.length * 24 + 14}" text-anchor="middle">${Math.round(N * t)}</text>`).join('')}</g>
    ${rows.map(([l, d, v], i) => `<text x="0" y="${i * 24 + 15}">${esc(l)}</text><rect x="200" y="${i * 24 + 6}" width="${W * d / N}" height="12" fill="${l === 'My knowledge' ? 'var(--mine)' : 'var(--botanic)'}"/><rect x="${200 + W * d / N}" y="${i * 24 + 6}" width="${W * v / N}" height="12" fill="url(#hatch)"/><text class="ax" x="${200 + W * (d + v) / N + 6}" y="${i * 24 + 16}">${d}${v ? ' + ' + v : ''}</text>`).join('')}
    <defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="var(--botanic)" stroke-width="1.4"/></pattern></defs></svg></div>`;
  // Robertson leads among the members
  const rob = [];
  for (const id of c.members) { const own = A.activeOf(kb, id).find(r => r.datasetId === 'ds:robertson-1929'); const sp = A.speciesOf(kb, id); const vr = !own && sp ? A.activeOf(kb, sp).find(r => r.datasetId === 'ds:robertson-1929') : null; const r = own || vr; if (r) rob.push({ id, name: kb.label(id), taxa: r.value.data.listed_visitor_taxa, via: !own, recordId: r.id }); }
  rob.sort((a, b) => b.taxa - a.taxa);
  const mx = Math.max(1, ...rob.map(x => x.taxa));
  h += `<div class="chart"><h3>Flower visitors · Robertson 1929 <span class="mk mk-lead" style="font-weight:400">name match only</span></h3>
    ${rob.length ? `<svg width="${W + 220}" height="${rob.length * 20 + 22}">${rob.map((x, i) => `<g class="row" data-rec="${esc(x.recordId)}"><rect class="bg" x="0" y="${i * 20}" width="${W + 220}" height="20"/><text x="0" y="${i * 20 + 14}">${esc(x.name.length > 30 ? x.name.slice(0, 29) + '…' : x.name)}</text><rect class="bar lead" x="200" y="${i * 20 + 4}" width="${W * x.taxa / mx}" height="11"/><text class="ax" x="${200 + W * x.taxa / mx + 6}" y="${i * 20 + 14}">${x.taxa}${x.via ? ' · species' : ''}</text></g>`).join('')}</svg>` : '<p class="dim">None.</p>'}</div></div></div>`;
  return h;
}
function short(e) {
  const n = e.name; const m = n.match(/^([A-Z])[a-z]+ ([a-z-]+)(.*)$/);
  return m ? `<i class="sci">${m[1]}. ${esc(m[2])}</i>${esc(m[3]).replace(/&#39;([^&]+)&#39;/, '<br>‘$1’')}` : sci(n);
}

/** Functional layers of this recipe as its plan legend draws them: one band per drawing role, in the documented order, ground line
 *  before bulbs, one symbol per member. Schematic: band spacing, symbol spacing and order within a band carry no height, density,
 *  ecological function or position. Every symbol and band is selectable. */
function layersDiagram(app, kb, c) {
  const W = 1000, lh = 40, labW = 150;
  const roles = c.roles; let y = 8; let gl = null;
  let s = `<svg class="layers" viewBox="0 0 ${W} ${roles.length * lh + 34}" role="group" aria-label="Layers in the plan legend">`;
  roles.forEach((R, i) => {
    if (R.role.startsWith('bulb') && gl === null) { gl = y - 4; }
    const field = ['matrix', 'meadow'].includes(R.role);
    const roleId = `role:${c.system.spatialRecipeId}:${R.role}`;
    s += `<g class="band" data-ent="${esc(roleId)}" data-key="${esc(roleId)}" tabindex="0" role="button" aria-label="${esc(R.role)}: ${R.members.length} taxa">
      <rect x="${labW}" y="${y}" width="${W - labW}" height="${lh - 6}" class="${field ? 'fieldband' : 'bandbg'}"/>
      <text x="0" y="${y + 15}" class="bl">${esc(R.role.replace('bulb-', 'bulbs · '))}</text><text x="0" y="${y + 28}" class="bn">${R.members.length} taxa · ${R.legends.length} legend entr${R.legends.length === 1 ? 'y' : 'ies'}</text></g>`;
    const n = R.members.length; const step = Math.min(44, (W - labW - 20) / Math.max(1, n));
    R.members.forEach((m, j) => {
      const e = kb.state.entities.get(m.id); const x = labW + 14 + j * step; const f = A.plantFacts(kb, m.id); const cov = f.coverage;
      const known = [cov.level === 'full' || (m.species && A.plantFacts(kb, m.species)?.coverage.level === 'full'), m.flowering.rows.length > 0, !!(cov.direct.designers || cov.via.designers), !!m.robertson].filter(Boolean).length;
      s += `<g class="lm k${Math.min(3, known)} ${m.mine ? 'mine' : ''}" data-ent="${esc(m.id)}" data-key="${esc(m.id)}" transform="translate(${x.toFixed(1)},${y + 4})" tabindex="0" role="button" aria-label="${esc(e.name)} — ${esc(R.role)}"><title>${esc(e.name)} · ${esc(R.role)} · legend ${esc(m.legend)}</title><rect x="-2" y="-2" width="30" height="30" class="hitbox"/>${glyph(e.plantType || 'unknown', 26).replace('<svg ', '<svg x="0" y="0" ')}</g>`;
    });
    y += lh;
  });
  if (gl !== null) s += `<line x1="0" x2="${W}" y1="${gl}" y2="${gl}" stroke="var(--ink)" stroke-width="1.5"/><text x="${W - 6}" y="${gl + 14}" text-anchor="end" class="bn">ground line — bulbs below</text>`;
  s += `<text x="0" y="${y + 18}" class="bn">schematic: roles in the order the plan legend lists them; spacing, order and band height are not heights, densities, functions or positions</text></svg>`;
  return `<div class="chart" style="margin-bottom:6px"><h3>Layers in the plan legend</h3>${s}</div>`;
}
