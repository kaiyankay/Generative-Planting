// Designer survey: professional judgement as evidence of practice — who answered (in aggregate), which plants they chose,
// why, what they observed, which plants they listed together. Anonymous respondent ids stay in the source details.
import * as A from '../analysis.js';
import { esc, sci, plantVisual, mark, trim } from '../ui.js';
import { bindCommon } from './common.js';

export function head(app) {
  const s = A.survey(app.kbv());
  return { title: 'Designer survey', count: s.respondents, countTitle: `${s.respondents} anonymous respondents · ${s.statements} statements on ${s.plants.length} plants · professional judgement, not measured traits` };
}
export function contains(app, sel) { return sel?.kind === 'entity' && A.survey(app.kbv()).plants.some(p => p.id === sel.id); }

export function render(host, app) {
  const kb = app.kbv(); const s = A.survey(kb);
  const reasons = ['Season & looks', 'Ecology / native', 'Fits Vancouver', 'Use in design', 'Behaviour with others', 'Reason (uncoded)', 'Practice note', 'Listed together'];
  const maxN = Math.max(...s.plants.map(p => p.n));
  let h = '';
  h += `<div class="pad">`;
  // 1 · who answered (aggregate only)
  const bars = (rows, total) => rows.map(([l, n]) => `<div style="display:grid;grid-template-columns:260px 1fr 30px;gap:10px;align-items:center;padding:3px 0"><span>${esc(l)}</span><span style="height:9px;background:var(--wash-2)"><span style="display:block;height:9px;width:${(100 * n / total).toFixed(1)}%;background:var(--ink-2)"></span></span><span class="num">${n}</span></div>`).join('');
  h += `<h2 class="section-h">Who answered</h2>
    <div class="cols2"><div>${bars(s.roles, s.respondents)}</div><div>${bars(s.experience, s.respondents)}</div></div>`;
  // 2 · plants and reasons (dot matrix)
  h += `<h2 class="section-h">Plants they chose, and why</h2><div class="ckey" style="padding:0 0 6px"><span><svg class="mini" width="40" height="14"><circle cx="6" cy="7" r="5.6" fill="var(--botanic)"/><circle cx="20" cy="7" r="6.7" fill="var(--botanic)"/><circle cx="34" cy="7" r="7.5" fill="var(--botanic)"/></svg> dot size = respondents giving that kind of reason (1 · 2 · 3)</span><span><svg class="mini" width="14" height="14"><circle cx="7" cy="7" r="5.6" fill="none" stroke="var(--botanic-ink)" stroke-dasharray="2 1.5"/></svg> listed together in one 5-plant list</span><span>? = name as typed, identity unconfirmed</span><span class="dim">bar = respondents naming the plant · statements are professional judgement, not measurements</span></div>`;
  const cw = 74;
  h += `<div class="chart" style="overflow:auto"><svg width="${260 + 110 + reasons.length * cw}" height="${s.plants.length * 26 + 70}">
    ${reasons.map((r, i) => `<text class="rl" transform="translate(${370 + i * cw + cw / 2},58) rotate(-28)" text-anchor="start">${esc(r)}</text>`).join('')}
    <text class="ax" x="260" y="60">respondents</text><line class="axis" x1="0" x2="${370 + reasons.length * cw}" y1="66" y2="66"/>
    ${s.plants.map((p, i) => {
      const e = kb.state.entities.get(p.id); const y = 70 + i * 26; const dim = app.mineMode && !A.activeOf(kb, p.id).some(r => r.origin === 'user');
      return `<g class="row" data-ent="${esc(p.id)}" data-key="${esc(p.id)}" style="${dim ? 'opacity:.3' : ''}"><rect class="bg" x="0" y="${y}" width="${370 + reasons.length * cw}" height="26"/>
        <text x="0" y="${y + 17}">${e?.commonName ? `<tspan font-weight="600">${esc(e.commonName)}</tspan> <tspan font-style="italic" fill="var(--ink-2)">${esc(e.name)}</tspan>` : `<tspan font-style="${e?.scientificName ? 'italic' : 'normal'}">${esc(trim(e?.name || p.id, 34))}</tspan>`}${p.status === 'candidate' ? ' <tspan fill="var(--ink-4)" font-size="10">?</tspan>' : ''}</text>
        <rect x="260" y="${y + 9}" width="${90 * p.n / maxN}" height="8" fill="var(--ink-2)"/><text class="ax" x="${264 + 90 * p.n / maxN}" y="${y + 17}">${p.n}</text>
        ${reasons.map((r, j) => { const n = p.reasons.get(r)?.size || 0; return n ? `<circle data-cell="${esc(p.id)}|reason:${esc(r)}" cx="${370 + j * cw + cw / 2}" cy="${y + 13}" r="${3 + 2.6 * Math.sqrt(n)}" fill="${r === 'Listed together' ? 'none' : 'var(--botanic)'}" stroke="var(--botanic-ink)" ${r === 'Listed together' ? 'stroke-dasharray="2 1.5"' : ''}><title>${n} respondent${n > 1 ? 's' : ''}</title></circle>` : `<line x1="${370 + j * cw + cw / 2 - 3}" x2="${370 + j * cw + cw / 2 + 3}" y1="${y + 13}" y2="${y + 13}" stroke="var(--rule-2)"/>`; }).join('')}</g>`;
    }).join('')}</svg></div>`;
  // 3 · observations (deduplicated quotes)
  const obs = s.plants.flatMap(p => p.quotes.filter(q => ['observation', 'warning', 'practitioner_note'].includes(q.kind)).map(q => ({ ...q, plant: p.id })));
  h += `<h2 class="section-h">What they observed</h2><div class="cols2">`;
  h += obs.map(q => `<div class="quote" style="margin:0 0 14px;cursor:pointer" data-rec="${esc(q.records[0])}"><span style="font-weight:600">${sci(kb.label(q.plant))}</span> — ${esc(q.text)}${q.records.length > 1 ? `<span class="who">${q.records.length} records, one answer</span>` : ''}</div>`).join('') + `</div>`;
  // 4 · listed together (arc diagram among the plants involved)
  const inv = [...new Set(s.pairs.flatMap(p => [p.a, p.b]))];
  const X = 40, step = Math.min(90, 820 / Math.max(1, inv.length - 1)); const base = 170;
  h += `<h2 class="section-h">Listed together</h2>
    <div class="chart"><svg width="${X * 2 + step * (inv.length - 1)}" height="${base + 56}">${s.pairs.map(p => { const a = X + step * inv.indexOf(p.a), b = X + step * inv.indexOf(p.b); const l = Math.min(a, b), r = Math.max(a, b); return `<path data-rec="${esc(p.recordId)}" d="M${l},${base}A${(r - l) / 2},${Math.min(150, (r - l) / 2)} 0 0 1 ${r},${base}" fill="none" stroke="var(--ink-2)" stroke-dasharray="3 2.5" style="cursor:pointer"/>`; }).join('')}
    ${inv.map((id, i) => { const e = kb.state.entities.get(id); return `<g data-ent="${esc(id)}" style="cursor:pointer"><circle cx="${X + step * i}" cy="${base}" r="3.5" fill="var(--ink)"/><text x="${X + step * i}" y="${base + 18}" text-anchor="middle" font-weight="600">${esc(trim(e?.commonName || e?.name || id, 16))}</text><text x="${X + step * i}" y="${base + 31}" text-anchor="middle" font-style="italic" fill="var(--ink-2)" font-size="10">${esc(trim(e?.name || '', 22))}</text></g>`; }).join('')}</svg></div>`;
  h += `</div>`;
  host.innerHTML = h;
  bindCommon(host, app);
}
