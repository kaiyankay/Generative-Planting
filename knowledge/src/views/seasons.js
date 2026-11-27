// Seasons: flowering months exactly as each source records them, one line per source and place — never merged into
// one "flowering time". Regions differ (UK, St. Louis, Pacific Northwest, Greater Vancouver); the timeline keeps that visible.
import * as A from '../analysis.js';
import { esc, sci, plantVisual, MONTHS } from '../ui.js';

export function seasonsView(app, ids, { title = 'Flowering by source and place', note = '' } = {}) {
  const kb = app.kbv();
  const withData = []; const without = [];
  for (const id of ids) { const f = A.floweringOf(kb, id); (f.rows.length ? withData : without).push({ id, ...f }); }
  const W = 420; const cw = W / 12; const lh = 15;
  let h = `<div class="pad"><div class="ckey" style="padding:0 0 10px"><span><svg class="mini" width="26" height="9"><rect x="0" y="0" width="26" height="9" fill="var(--botanic)"/></svg> months one record lists for flowering, at the place it describes</span><span><svg class="mini" width="26" height="9"><rect x=".5" y=".5" width="25" height="8" fill="none" stroke="var(--botanic)" stroke-dasharray="2 1.5"/></svg> known only for the species</span><span><svg class="mini" width="26" height="9"><rect x="0" y="0" width="26" height="9" fill="var(--mine)"/></svg> mine</span><span class="dim">rows are never merged · n = annotated iNaturalist observations</span></div><div class="chart">`;
  h += `<div style="display:grid;grid-template-columns:230px ${W + 330}px;align-items:end;border-bottom:1px solid var(--ink);padding-bottom:4px"><span></span><svg width="${W + 330}" height="14">${MONTHS.map((m, i) => `<text class="ax" x="${i * cw + cw / 2}" y="11" text-anchor="middle">${m}</text>`).join('')}</svg></div>`;
  for (const p of withData) {
    const e = kb.state.entities.get(p.id);
    const mineDim = app.mineMode && !p.rows.some(r => r.origin === 'user');
    h += `<div class="srow" data-key="${esc(p.id)}" style="display:grid;grid-template-columns:230px ${W + 330}px;border-bottom:1px solid var(--rule);padding:8px 0;${mineDim ? 'opacity:.35' : ''}">
      <div class="tx" data-ent="${esc(p.id)}" style="display:flex;gap:8px;align-items:center;cursor:pointer">${plantVisual(e, 28)}<div>${e.commonName ? `<b style="display:block;font-weight:600">${esc(e.commonName)}</b>` : ''}<span class="dim">${sci(e.name)}</span>${p.via ? `<span class="mk mk-via" style="display:block">species</span>` : ''}</div></div>
      <svg width="${W + 330}" height="${p.rows.length * lh + 4}">${[...Array(13)].map((_, i) => `<line x1="${i * cw}" x2="${i * cw}" y1="0" y2="${p.rows.length * lh + 4}" stroke="var(--rule)"/>`).join('')}
      ${p.rows.map((r, j) => runs(r.months).map(([a, b]) => `<rect data-rec="${esc(r.recordId)}" x="${(a - 1) * cw + 1}" y="${j * lh + 3}" width="${(b - a + 1) * cw - 2}" height="9" fill="${p.via ? 'none' : r.origin === 'user' ? 'var(--mine)' : 'var(--botanic)'}" ${p.via ? 'stroke="var(--botanic)" stroke-dasharray="2 1.5"' : ''} style="cursor:pointer"><title>${esc(r.sourceName)} · ${esc(r.placeName)}</title></rect>`).join('')
        + `<text class="rl" x="${W + 10}" y="${j * lh + 11}">${esc(short(r.sourceName))} · ${esc(r.placeName)}${r.n ? ` · n=${r.n}` : ''}</text>`).join('')}</svg></div>`;
  }
  h += `</div>`;
  if (without.length) h += `<p class="section-cap">No record · ${without.length <= 12 ? without.map(x => sci(kb.label(x.id))).join(', ') : `${without.length} of ${ids.length}`}</p>`;
  return h + '</div>';
}
function runs(ms) { const out = []; for (const m of ms) { const l = out[out.length - 1]; if (l && m === l[1] + 1) l[1] = m; else out.push([m, m]); } return out; }
function short(n) { return String(n).replace(/ — .*$/, '').replace(/ \(.*\)$/, '').replace('Missouri Botanical Garden Plant Finder', 'Missouri Bot. Garden').replace('Royal Horticultural Society', 'RHS').replace(/^E-Flora BC.*$/, 'E-Flora BC').slice(0, 38); }
