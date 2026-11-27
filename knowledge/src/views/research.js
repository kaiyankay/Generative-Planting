// Research: original datasets and literature kept with their method, place and time.
//   Flower visitors — Robertson 1929 presence lists (name-match leads, rows as in the source)
//   Curated databases — which professional database documents which plant, and where it is from
//   Design literature — functional layers, height bands and spatial functions with their citations
import * as A from '../analysis.js';
import { esc, sci, plantVisual, trim, fmtN } from '../ui.js';
import { bindCommon } from './common.js';

export function head(app) {
  const kb = app.kbv();
  if (app.view === 'databases') return { title: 'Curated databases', count: A.sourceMatrix(kb, libIds(kb)).length };
  if (app.view === 'literature') return { title: 'Design literature', count: A.literature(kb).length, countTitle: 'cited relations' };
  const ds = kb.getDataset('ds:robertson-1929');
  return { title: 'Flower visitors · Robertson 1929', count: A.robertson(kb).length, countTitle: `${A.robertson(kb).length} plants · ${ds?.rows.length || ds?.rowsLocalOnly} of ${ds?.rowsInSource} rows${ds?.rows.length ? '' : ' (kept local)'} · Carlinville, Illinois, c. 1884–1916 · presence lists · plant names matched by spelling only` };
}
const libIds = kb => [...kb.state.entities.values()].filter(e => e.seedSet === 'planting-db-10').map(e => e.id);
export function contains(app, sel) { return sel?.kind === 'entity' && (app.view === 'visitors' ? A.robertson(app.kbv()).some(r => r.id === sel.id) : libIds(app.kbv()).includes(sel.id)); }

export function render(host, app) {
  const kb = app.kbv();
  host.innerHTML = app.view === 'databases' ? databases(app, kb) : app.view === 'literature' ? literature(app, kb) : visitors(app, kb);
  bindCommon(host, app);
}

function visitors(app, kb) {
  const rob = A.robertson(kb); const mx = Math.max(...rob.map(r => r.taxa)); const W = 230;
  const sel = app.sel?.kind === 'entity' ? rob.find(r => r.id === app.sel.id) : null;
  const ds = kb.getDataset('ds:robertson-1929');
  let h = `<div class="pad"><div class="cols2" style="grid-template-columns:minmax(0,470px) minmax(0,1fr);gap:0 36px"><div class="chart" style="min-width:0"><h3>Visitor taxa per plant <span class="mk mk-lead" style="font-weight:400">name match only</span></h3>
    <p class="cap">insect taxa Robertson listed as flower visitors — presence lists, not visit counts · dashed = plant name matched by spelling only</p>
    <svg viewBox="0 0 ${W + 240} ${rob.length * 18 + 30}" style="width:100%;max-width:${W + 240}px;height:auto;display:block" role="group" aria-label="Visitor taxa per plant"><g class="grid">${[0, .25, .5, .75, 1].map(t => `<line x1="${210 + W * t}" x2="${210 + W * t}" y1="0" y2="${rob.length * 18}"/><text class="ax" x="${210 + W * t}" y="${rob.length * 18 + 14}" text-anchor="middle">${Math.round(mx * t)}</text>`).join('')}</g>
    ${rob.map((r, i) => `<g class="row ${sel?.id === r.id ? 'sel' : ''}" data-ent="${esc(r.id)}" data-key="${esc(r.id)}" tabindex="0" role="button" aria-label="${esc(r.name)}: ${r.taxa} visitor taxa"><rect class="bg" x="0" y="${i * 18}" width="${W + 240}" height="18"/><text x="0" y="${i * 18 + 13}" font-style="italic">${esc(trim(r.name, 30))}</text>
<rect class="bar lead" x="210" y="${i * 18 + 4}" width="${W * r.taxa / mx}" height="10"/><text class="ax" x="${210 + W * r.taxa / mx + 5}" y="${i * 18 + 13}">${r.taxa}</text></g>`).join('')}</svg></div>`;
  // original rows for the selected plant
  const rows = sel ? ds.rows.filter(row => row[ds.columns.indexOf('sourceTaxonName')] === sel.name) : [];
  const cols = ['targetTaxonName', 'interactionTypeName'].filter(c => ds.columns.includes(c));
  const localOnly = !ds.rows.length && ds.rowsLocalOnly;
  h += `<div class="chart" style="min-width:0"><h3>${sel && !localOnly ? `<i>${esc(sel.name)}</i> · ${rows.length} rows` : 'Rows'}</h3>${localOnly ? `<p class="cap rowsLocal">The digitised rows are not in this copy. The table's licence is not cleared, so its ${ds.rowsLocalOnly} rows stay in the local research copy; the counts in the chart are kept.</p>` : `<p class="cap">one row = one insect taxon listed on this plant, as in the digitised table · local research copy, not for publication</p>`}
    ${localOnly ? '' : sel ? `<div style="max-height:560px;overflow:auto"><table class="tbl"><thead><tr>${cols.map(c => `<th>${esc({ targetTaxonName: 'insect taxon (as listed)', interactionTypeName: 'interaction' }[c] || c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 300).map(r => `<tr>${cols.map(c => `<td>${esc(trim(String(r[ds.columns.indexOf(c)]).replace(/^https?:\/\/eol\.org\/schema\/terms\//, ''), 60))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}</div></div></div>`;
  return h;
}

function databases(app, kb) {
  const ids = libIds(kb); const M = A.sourceMatrix(kb, ids); const max = Math.max(...M.flatMap(m => [...m.counts.values()]));
  const cw = 66;
  let h = `<div class="pad"><div class="ckey" style="padding:0 0 8px"><span><svg class="mini" width="14" height="14"><rect x="1" y="1" width="12" height="12" fill="var(--botanic)"/></svg> square area = knowledge records the source holds about the plant (not observations)</span><span>· = none here</span></div><div class="chart">
    <table class="cmp" style="width:auto"><thead><tr><th>Source</th>${ids.map(id => { const e = kb.state.entities.get(id); return `<th style="width:${cw}px;text-align:center;white-space:normal;vertical-align:bottom" data-ent="${esc(id)}"><div style="display:flex;justify-content:center">${plantVisual(e, 34)}</div><small style="font-size:10px;line-height:1.15;color:var(--ink)">${esc(e.commonName)}</small></th>`; }).join('')}<th>Total</th></tr></thead><tbody>`;
  for (const m of M) {
    const s = m.source; const geo = s.geo_specificity || '';
    h += `<tr><td style="min-width:220px"><b style="font-weight:600">${esc(trim(s.name, 48))}</b><br><span class="dim">${esc(s.type || '')}${geo ? ' · ' + esc(geo.replace(/_/g, ' ')) : ''}</span></td>
      ${ids.map(id => { const n = m.counts.get(id) || 0; const r = n ? 3 + 11 * Math.sqrt(n / max) : 0; return `<td class="c" style="text-align:center" ${n ? `data-cell="${esc(id)}|src:${esc(s.id)}"` : ''}>${n ? `<svg width="30" height="30" style="display:block;margin:auto"><rect x="${15 - r}" y="${15 - r}" width="${2 * r}" height="${2 * r}" fill="var(--botanic)"/></svg><span class="num dim">${n}</span>` : '<span class="gap">·</span>'}</td>`; }).join('')}
      <td class="num">${m.total}</td></tr>`;
  }
  return h + `</tbody></table></div></div>`;
}

function literature(app, kb) {
  const L = A.literature(kb); const S = kb.state;
  const layers = ['layer:canopy', 'layer:understorey', 'layer:shrub', 'layer:ground'];
  const rel = (p, from) => L.filter(r => r.predicate === p && r.from === from);
  const occ = new Map(); for (const r of S.relations.values()) if (r.predicate === 'occupies_layer' && r._eff.active) { if (!occ.has(r.to)) occ.set(r.to, []); occ.get(r.to).push(r); }
  const cite = b => b ? esc(trim(b.replace(/^brief [\d-]+; /, ''), 90)) : '';
  let h = `<div class="pad"><h2 class="section-h">Functional layers <span class="mk mk-der" style="font:400 11px var(--f-text)" title="Plant placements are derived from mature-height records by a rule, not stated by a source">placements derived</span></h2><div class="comp">`;
  for (const l of layers) {
    const forms = rel('typically_formed_by', l); const bands = rel('corresponds_to', l); const ps = (occ.get(l) || []).map(r => r.from);
    h += `<div class="stratum" style="grid-template-columns:200px 260px minmax(0,1fr)"><div class="rl"><b>${esc(kb.label(l))}</b><span>${bands.map(b => esc(b.toName)).join(' · ')}</span></div>
      <div style="padding:12px 16px 10px 0;font-size:12px">${forms.map(f => esc(f.toName)).join(', ') || '—'}<br><span class="dim" style="font-size:10.5px">${cite(forms[0]?.basis || bands[0]?.basis)}</span></div>
      <div class="mem">${ps.map(id => { const e = S.entities.get(id); return `<button class="m" data-ent="${esc(id)}" data-key="${esc(id)}">${plantVisual(e, 38)}<span class="nm">${esc(e.commonName || e.name)}</span></button>`; }).join('') || ''}</div></div>`;
  }
  h += `</div><h2 class="section-h">Spatial functions</h2><table class="tbl"><thead><tr><th>Function</th><th>Requires</th><th>Database labels</th><th>Basis</th></tr></thead><tbody>`;
  const fns = [...new Set(L.filter(r => r.predicate === 'requires_trait' || r.predicate === 'maps_to').map(r => r.predicate === 'maps_to' ? r.to : r.from))];
  for (const f of fns) { const req = L.filter(r => r.predicate === 'requires_trait' && r.from === f); const mp = L.filter(r => r.predicate === 'maps_to' && r.to === f);
    h += `<tr><td><b style="font-weight:600">${esc(kb.label(f))}</b></td><td>${req.map(r => esc(r.toName)).join(' · ') || '<span class="dim">—</span>'}</td><td>${mp.map(r => esc(r.fromName)).join(' · ') || '<span class="dim">—</span>'}</td><td class="dim" style="font-size:11px">${[...new Set(req.map(r => cite(r.basis)))].join('; ')}</td></tr>`; }
  return h + `</tbody></table></div>`;
}
