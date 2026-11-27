// Small shared vocabulary for the workflow panels (names, month strips, tags). No state here.
import { MONTHS, SCOPE_LABEL } from './knowledge.js';

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (v, d = 0) => (v == null ? '—' : (v * 100).toFixed(d) + ' %');
export const num = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'));
export function plantName(store, id, { short = false } = {}) {
  const s = store.getObject(id); if (!s) return esc(id);
  const sci = `<i>${esc(s.scientificName)}</i>`; const cv = s.cultivar ? ` <span class="cv">‘${esc(s.cultivar)}’</span>` : '';
  return short ? sci + cv : sci + cv + (s.runtime ? ' <span class="tag mine" title="Added in this project: generic display proxy">new</span>' : '');
}
export const plainName = (store, id) => { const s = store.getObject(id); return s ? s.scientificName + (s.cultivar ? ` '${s.cultivar}'` : '') : id; };
// 12 ruled month cells; on = known months, mark = highlighted month, unknown = dashed strip
export function monthStrip(months, { on = null, unknown = false, mark = null, title = '' } = {}) {
  const set = new Set(months || []);
  return `<span class="mstrip${unknown ? ' unk' : ''}" title="${esc(title || (unknown ? 'flowering months unknown' : 'flowering: ' + [...set].map((m) => MONTHS[m - 1]).join(', ')))}" role="img" aria-label="${esc(unknown ? 'flowering unknown' : 'flowering ' + [...set].map((m) => MONTHS[m - 1]).join(' '))}">${MONTHS.map((m, i) => `<i class="${set.has(i + 1) ? 'on' : ''}${on && on.includes(i + 1) ? ' tgt' : ''}${mark === i + 1 ? ' mk' : ''}"></i>`).join('')}</span>`;
}
export function sourceTag(src) {
  if (!src) return '<span class="tag unk">unknown</span>';
  const cls = { illustrative: 'illus', personal: 'mine', project: 'proj', foundation: 'found', site: 'found' }[src] || '';
  const txt = { illustrative: 'illustrative', personal: 'mine', project: 'project', foundation: 'knowledge', site: 'site list' }[src] || src;
  return `<span class="tag ${cls}" title="${esc(SCOPE_LABEL[src] || src)}">${txt}</span>`;
}
export function traitLine(K, store, id) {
  const t = K.traits(id);
  const g = t.pollinators.status !== 'unknown' ? t.pollinators.value.join(', ') : t.windPollinated === true ? 'wind-pollinated' : 'groups unknown';
  return `${monthStrip(t.bloom.value, { unknown: t.bloom.status === 'unknown' })} ${sourceTag(t.bloom.source)} <span class="dim small">${esc(g)}</span>`;
}
export const ICON = {
  undo: '<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12"/><path d="M4 8.5h7.5a4.5 4.5 0 0 1 0 9H9"/></svg>',
  redo: '<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M13 5l3.5 3.5L13 12"/><path d="M16 8.5H8.5a4.5 4.5 0 0 0 0 9H11"/></svg>',
  x: '<svg class="ic" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  brush: '<svg class="ic" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M13.5 3.5 16.5 6.5 9 14l-3-3z"/><path d="M6 11c-2 0-3 1.5-3 3.5 0 1-.5 1.8-1 2 2.8.4 5.5-.6 6-3"/></svg>',
  check: '<svg class="ic" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5"/></svg>',
};
export function download(name, obj) {
  try { window.__gpLastExport = { name, bytes: JSON.stringify(obj).length, at: new Date().toISOString() }; } catch { /* */ }
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
