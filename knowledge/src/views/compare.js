// Compare: fast reading across plants. Every column is a small chart with a real meaning (range, scale, months, count);
// the records behind a cell open in the inspector. A cultivar shows its species' knowledge only as "via species" (dashed / hatched).
import * as A from '../analysis.js';
import { esc, sci, plantVisual, monthStrip, mark, DIA } from '../ui.js';

export const COLS = [
  ['height', 'Height', 'mature, m · bar per source'],
  ['light', 'Light', 'sun · part · shade'],
  ['water', 'Water', 'dry → wet'],
  ['flower', 'Flowering', 'J F M A M J J A S O N D'],
  ['native', 'Origin', 'as recorded'],
  ['designers', 'Designers', 'respondents naming it'],
  ['visitors', 'Flower visitors', 'Robertson 1929 · lead'],
  ['recipes', 'Recipes', 'Detroit'],
  ['mine', 'Mine', 'my records'],
];

/** Records behind one compare cell (for the inspector). */
export function cellRecords(kb, id, col) {
  const sp = A.speciesOf(kb, id);
  const ids = [id, ...(sp ? [sp] : [])];
  const pred = {
    height: r => r.predicate === 'mature_height' || r.predicate === 'local_mature_size',
    light: r => (r.concepts || []).some(c => c.startsWith('exposure:')),
    water: r => (r.concepts || []).some(c => c.startsWith('water:')),
    flower: r => !!r.value?.data?.flowering_months,
    native: r => (r.concepts || []).includes('origin:native') || r.predicate === 'invasive_status',
    designers: r => A.isSurvey(r),
    visitors: r => r.datasetId === 'ds:robertson-1929',
    recipes: r => r.predicate === 'fills_role',
    mine: r => r.origin === 'user',
  }[col];
  const out = []; for (const x of ids) for (const r of A.activeOf(kb, x)) if (pred(r)) out.push(r);
  if (col === 'recipes') for (const c of A.cultivarsOf(kb, id)) for (const r of A.activeOf(kb, c)) if (pred(r)) out.push(r);
  return out;
}

export function compareTable(app, ids, { roleOf = null, empty = '' } = {}) {
  const kb = app.kbv();
  const rows = ids.map(id => A.compareRow(kb, id));
  const maxH = Math.min(40, Math.max(5, ...rows.flatMap(r => [...(r.own.heights.length ? r.own.heights : r.viaSpecies?.heights || []).map(h => h.max), ...r.own.localH.map(h => h.p90 || h.median)])));
  const maxV = Math.max(1, ...rows.map(r => (r.own.robertson || r.viaSpecies?.robertson)?.taxa || 0));
  const mineOnly = app.mineMode;
  const UNIT = { height: `m · 0 — ${Math.round(maxH)}`, light: 'sun · part · shade', water: 'dry → wet', flower: 'J F M A M J J A S O N D', native: 'as recorded', designers: 'respondents', visitors: 'insect taxa · lead', recipes: 'Detroit', mine: 'my records' };
  const head = `<tr><th></th>${COLS.map(([k, l]) => `<th>${l}<small>${UNIT[k]}</small></th>`).join('')}</tr>`;
  const body = rows.map(r => {
    const e = kb.state.entities.get(r.id);
    const v = r.own; const via = r.viaSpecies;
    const pick = (f) => { const a = f(v); if (a) return { val: a, via: false }; if (via) { const b = f(via); if (b) return { val: b, via: true }; } return null; };
    const H = pick(x => x.heights.length || x.localH.length ? x : null);
    const L = pick(x => Object.keys(x.light).length ? x.light : null);
    const W = pick(x => x.water.length ? x.water : null);
    const F = pick(x => x.months.some(Boolean) ? x.months : null);
    const Rb = pick(x => x.robertson);
    const D = pick(x => x.respondents || null);
    const ORIG = { native_bc_west_of_cascades: 'native · coastal BC', native_north_america: 'native · N. America', non_native: 'not native' };
    const N = pick(x => x.originStatus ? ORIG[x.originStatus] || x.originStatus.replace(/_/g, ' ') : x.native ? 'native' : null);
    const dimRow = mineOnly && !r.mine;
    const cell = (k, html) => `<td class="c ${html ? '' : 'gap'}" data-cell="${esc(r.id)}|${k}">${html || '<span class="gap">—</span>'}</td>`;
    return `<tr data-key="${esc(r.id)}" class="${dimRow ? 'dimrow' : ''}" style="${dimRow ? 'opacity:.35' : ''}">
      <td><div class="tx" data-ent="${esc(r.id)}">${plantVisual(e, 30)}<div>${e.commonName ? `<span class="pl-c">${esc(e.commonName)}</span>` : ''}<span class="pl-s">${sci(e.name)}</span>
        <span class="dim" style="font-size:10.5px">${roleOf ? esc(roleOf(r.id)) : ''}${e.status === 'placeholder' ? ' ' + mark.placeholder() : e.status === 'candidate' ? ' ' + mark.candidate() : e.origin === 'user' ? ' ' + mark.provisional() : ''}</span></div></div></td>
      ${cell('height', H ? heightBars(H.val, maxH, H.via) : '')}
      ${cell('light', L ? lightMarks(L.val, L.via) : '')}
      ${cell('water', W ? waterScale(W.val, W.via) : '')}
      ${cell('flower', F ? monthStrip(F.val, { cls: F.via ? 'via' : '', w: 120, h: 9 })  : '')}
      ${cell('native', N ? `<span${N.via ? ' class="mk-via"' : ''}>${esc(N.val)}</span>` : '')}
      ${cell('designers', D ? dots(D.val, D.via) : '')}
      ${cell('visitors', Rb ? visitorBar(Rb.val, maxV, Rb.via) : '')}
      ${cell('recipes', r.recipes ? `<span class="num">${r.recipes}</span>` : '')}
      ${cell('mine', r.mine ? `<span class="mk mk-mine">${DIA} ${r.mine}</span>` : '')}</tr>`;
  }).join('');
  return `<table class="cmp"><thead>${head}</thead><tbody>${body || `<tr><td colspan="10" class="dim" style="padding:20px">${empty || 'No plants in this scope.'}</td></tr>`}</tbody></table>${compareKey()}`;
}

/** What each mark means — always visible under the table, drawn with the same marks. */
export function compareKey() {
  return `<div class="ckey">
    <span>${heightBars({ heights: [{ min: 1, max: 4 }], localH: [{ median: 3, p10: 2, p90: 4 }] }, 5, false)} height range per source; ring = Vancouver street-tree median (p10–p90)</span>
    <span>${lightMarks({ sun: 1, part: 1 }, false)} filled = at least one source says sun / part shade / shade</span>
    <span>${waterScale([{ c: 'water:average', sources: 1 }, { c: 'water:moist', sources: 3 }], false)} dry · average · moist · wet — larger dot = more sources</span>
    <span>${monthStrip([0, 0, 0, 1, 2, 3, 3, 1, 0, 0, 0, 0], { w: 60, h: 8 })} months listed for flowering; darker = more sources</span>
    <span>${dots(2, false)} one dot per survey respondent</span>
    <span><svg class="mini" width="26" height="9" aria-hidden="true"><rect x=".5" y=".5" width="24" height="8" fill="none" stroke="var(--botanic-ink)" stroke-dasharray="2 1.5"/></svg> Robertson 1929 visitor taxa (presence; name match only)</span>
    <span><svg class="mini" width="26" height="9" aria-hidden="true"><rect x=".5" y="2" width="24" height="5" fill="none" stroke="var(--botanic)" stroke-dasharray="1.5 1.5"/></svg> dashed / outlined = known only for the species of a cultivar</span>
    <span class="dim">counts are knowledge records or respondents, never field observations</span></div>`;
}

function heightBars(v, maxH, via) {
  const W = 120; const rows = v.heights.slice(0, 5); const h = Math.max(8, rows.length * 5 + (v.localH.length ? 6 : 0));
  let s = `<svg class="mini" width="${W}" height="${h}" aria-hidden="true">`;
  rows.forEach((x, i) => { const x0 = W * x.min / maxH, x1 = W * Math.min(x.max, maxH) / maxH; s += `<rect x="${x0}" y="${i * 5}" width="${Math.max(2, x1 - x0)}" height="3" fill="${x.mine ? 'var(--mine)' : via ? 'none' : 'var(--botanic)'}" ${via ? 'stroke="var(--botanic)" stroke-width=".8" stroke-dasharray="1.5 1.5"' : ''}/>`; });
  for (const l of v.localH) { const y = rows.length * 5 + 2; s += `<line x1="${W * (l.p10 || l.median) / maxH}" x2="${W * Math.min(l.p90 || l.median, maxH) / maxH}" y1="${y}" y2="${y}" stroke="var(--ink-2)"/><circle cx="${W * l.median / maxH}" cy="${y}" r="2.2" fill="var(--paper)" stroke="var(--ink)"/>`; }
  return s + '</svg>';
}
function lightMarks(l, via) {
  const m = [['sun', 'Sun'], ['part', 'Part'], ['shade', 'Shade']];
  return `<svg class="mini" width="58" height="12" aria-hidden="true">${m.map(([k], i) => { const n = l[k] || 0; const x = 6 + i * 20; return k === 'sun' ? `<circle cx="${x}" cy="6" r="4.5" ${n ? `fill="${via ? 'none' : 'var(--c-light)'}" stroke="var(--c-light)"` : 'fill="none" stroke="var(--rule-2)"'} ${via ? 'stroke-dasharray="1.5 1.5"' : ''}/>` : k === 'part' ? `<circle cx="${x}" cy="6" r="4.5" fill="none" stroke="${n ? 'var(--ink-2)' : 'var(--rule-2)'}"/>${n ? `<path d="M${x} 1.5a4.5 4.5 0 0 1 0 9z" fill="${via ? 'none' : 'var(--ink-2)'}"/>` : ''}` : `<circle cx="${x}" cy="6" r="4.5" ${n ? `fill="${via ? 'none' : 'var(--ink)'}" stroke="var(--ink)"` : 'fill="none" stroke="var(--rule-2)"'}/>`; }).join('')}</svg>`;
}
function waterScale(w, via) {
  const steps = ['dry', 'average', 'moist', 'wet']; const wide = w.some(x => x.c === 'water:wide_range');
  return `<svg class="mini" width="74" height="12" aria-hidden="true"><line x1="4" x2="70" y1="6" y2="6" stroke="var(--rule-2)"/>${steps.map((s, i) => { const x = 4 + i * 22; const hit = w.find(q => q.c === 'water:' + s); return `<circle cx="${x}" cy="6" r="${hit ? 2.5 + Math.min(3, hit.sources) : 2}" fill="${hit ? (via ? 'var(--paper)' : 'var(--c-water)') : 'var(--paper)'}" stroke="${hit ? 'var(--c-water)' : 'var(--rule-2)'}" ${via && hit ? 'stroke-dasharray="1.5 1.5"' : ''}/>`; }).join('')}${wide ? '<path d="M4 11h66" stroke="var(--c-water)" stroke-dasharray="2 2"/>' : ''}</svg>`;
}
function dots(n, via) { return `<svg class="mini" width="${Math.min(15, n) * 7 + 2}" height="10" aria-hidden="true">${Array.from({ length: Math.min(15, n) }, (_, i) => `<circle cx="${4 + i * 7}" cy="5" r="2.6" fill="${via ? 'none' : 'var(--ink-2)'}" stroke="var(--ink-2)"/>`).join('')}</svg><span class="num dim"> ${n}</span>`; }
function visitorBar(r, max, via) { const w = Math.max(2, 70 * r.taxa / max); return `<svg class="mini" width="74" height="9" aria-hidden="true"><rect x=".5" y=".5" width="${w}" height="8" fill="none" stroke="var(--botanic-ink)" stroke-dasharray="2 1.5"/></svg><span class="num"> ${r.taxa}</span>`; }
