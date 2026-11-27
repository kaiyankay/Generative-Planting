// Local data: what is known *for Metro Vancouver* — the place hierarchy, the regional water rules (a calendar, not a score),
// and local evidence per plant from iNaturalist, the City's street-tree inventory, E-Flora BC, the survey and your own notes.
import * as A from '../analysis.js';
import { esc, sci, plantVisual, MONTHS, trim, fmtN, DIA } from '../ui.js';
import { bindCommon } from './common.js';

export function head(app) {
  const L = A.localData(app.kbv());
  return { title: 'Local data', count: L.records.length, countTitle: 'records within Metro Vancouver' };
}
export function contains(app, sel) { return sel?.kind === 'entity' && A.localData(app.kbv()).plants.has(sel.id); }

export function render(host, app) {
  const kb = app.kbv(); const L = A.localData(kb);
  let h = `<div class="pad">`;
  h += `<h2 class="section-h">Place</h2>
    <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;font-size:15px">${L.chain.slice().reverse().map((p, i, a) => `<button data-explore="${esc(p.id)}" style="${i === a.length - 1 ? 'font-weight:650' : 'color:var(--ink-2)'}">${esc(p.name)}</button>${i < a.length - 1 ? '<span class="dim">›</span>' : ''}`).join('')}
    ${L.children.length ? `<span class="dim" style="margin-left:14px;font-size:12px">contains ${L.children.map(c => `<button data-explore="${esc(c.id)}">${esc(c.name)}</button>`).join(', ')}</span>` : ''}</div>`;
  const sn = { cov_trees: 'City of Vancouver street trees', inat: 'iNaturalist', eflora: 'E-Flora BC', iscbc: 'Invasive Species Council of BC', survey: 'Designer survey', me: 'Me', 'mv-water-restrictions': 'Metro Vancouver water restrictions', 'mv-seasonal-lawn-care': 'Metro Vancouver lawn care' };
  const mx = Math.max(...L.bySource.map(x => x[1]));
  h += `<p class="cap" style="margin:12px 0 2px;color:var(--ink-3);font-size:12px">knowledge records within Metro Vancouver, by source</p><div style="max-width:620px">${L.bySource.map(([k, n]) => `<div style="display:grid;grid-template-columns:260px 1fr 34px;gap:10px;align-items:center;padding:3px 0;${k === 'me' ? 'color:var(--mine-ink)' : ''}"><span>${esc(sn[k] || kb.state.sources.get(k)?.name || k)}</span><span style="height:9px"><span style="display:block;height:9px;width:${(100 * n / mx).toFixed(1)}%;background:${k === 'me' ? 'var(--mine)' : 'var(--botanic)'}"></span></span><span class="num">${n}</span></div>`).join('')}</div>`;
  // water calendar
  const per = L.water.find(r => r.value?.kind === 'period');
  const W = 640, cw = W / 12;
  h += `<h2 class="section-h">Water rules</h2>
    <div class="chart"><svg width="${W + 20}" height="58"><g class="grid">${MONTHS.map((m, i) => `<line x1="${i * cw}" x2="${i * cw}" y1="14" y2="56"/><text class="ax" x="${i * cw + cw / 2}" y="10" text-anchor="middle">${m}</text>`).join('')}<line x1="${W}" x2="${W}" y1="14" y2="56"/></g>
    ${per ? (() => { const [sm, sd] = per.value.data.start.split('-').map(Number); const [em, ed] = per.value.data.end.split('-').map(Number); const x0 = (sm - 1 + (sd - 1) / 31) * cw, x1 = (em - 1 + ed / 31) * cw; return `<g data-rec="${esc(per.id)}" style="cursor:pointer"><rect x="${x0}" y="22" width="${x1 - x0}" height="16" fill="var(--c-water)" opacity=".85"/><text x="${x0 + 6}" y="34" fill="var(--paper)" font-size="11">Stage 1 · May 1 – Oct 15</text></g>`; })() : ''}
</svg></div>
    <div class="cols2">${L.water.map(r => `<div class="quote" data-rec="${esc(r.id)}" style="cursor:pointer;margin:0 0 12px">${esc(r.statement)}<span class="who">${esc((kb.state.sources.get(r.sourceRefs[0].sourceId)?.name || '').replace(/^Metro Vancouver — /, ''))}</span></div>`).join('')}</div>`;
  // local evidence per plant
  const plants = [...L.plants.keys()].filter(id => kb.state.entities.get(id)?.seedSet === 'planting-db-10' || L.plants.get(id).some(r => r.origin === 'user'));
  const col = (id, f) => L.plants.get(id).filter(f);
  h += `<h2 class="section-h">Plants here</h2>
    <table class="cmp"><thead><tr><th>Plant</th><th>iNaturalist<small>observations, as reported</small></th><th>Street trees<small>trees in the City inventory</small></th><th>E-Flora BC<small>knowledge records</small></th><th>Designers<small>statements</small></th><th>Flowering<small>months, iNaturalist annotations</small></th><th>Mine<small>my records</small></th></tr></thead><tbody>`;
  for (const id of plants) {
    const e = kb.state.entities.get(id);
    const inat = col(id, r => r.sourceRefs[0].sourceId === 'inat' && r.value?.data?.licensed_verifiable_observations != null)[0];
    const trees = col(id, r => r.sourceRefs[0].sourceId === 'cov_trees' && r.value?.data?.public_trees_count != null)[0];
    const ef = col(id, r => r.sourceRefs[0].sourceId === 'eflora').length;
    const sv = col(id, r => A.isSurvey(r)).length;
    const fl = col(id, r => r.sourceRefs[0].sourceId === 'inat' && r.value?.data?.flowering_months)[0];
    const mine = col(id, r => r.origin === 'user').length;
    const dim = app.mineMode && !mine;
    h += `<tr data-key="${esc(id)}" style="${dim ? 'opacity:.35' : ''}"><td><div class="tx" data-ent="${esc(id)}">${plantVisual(e, 28)}<div><span class="pl-c">${esc(e.commonName || '')}</span><span class="pl-s">${sci(e.name)}</span></div></div></td>
      <td class="c" ${inat ? `data-rec="${esc(inat.id)}"` : ''}>${inat ? `<span class="num">${fmtN(inat.value.data.licensed_verifiable_observations)}</span> <span class="dim">(${inat.value.data.research_grade} RG)</span>` : '<span class="gap">—</span>'}</td>
      <td class="c" ${trees ? `data-rec="${esc(trees.id)}"` : ''}>${trees ? `<span class="num">${fmtN(trees.value.data.public_trees_count)}</span>` : '<span class="gap">—</span>'}</td>
      <td class="num">${ef || '<span class="gap">—</span>'}</td><td class="num">${sv || '<span class="gap">—</span>'}</td>
      <td class="c" ${fl ? `data-rec="${esc(fl.id)}"` : ''}>${fl ? miniMonths(fl.value.data.flowering_months) + ` <span class="dim num">n=${fl.value.data.annotated_n}</span>` : '<span class="gap">—</span>'}</td>
      <td>${mine ? `<span class="mk mk-mine">${DIA} ${mine}</span>` : '<span class="gap">—</span>'}</td></tr>`;
  }
  h += `</tbody></table></div>`;
  host.innerHTML = h;
  bindCommon(host, app);
}
function miniMonths(ms) { return `<svg class="mini months" width="96" height="9" style="display:inline-block;vertical-align:middle">${MONTHS.map((m, i) => `<rect x="${i * 8 + .5}" y=".5" width="7" height="8" class="${ms.includes(i + 1) ? 'on' : 'off'}"/>`).join('')}</svg>`; }
