// Shared UI vocabulary of the Knowledge Workspace: escaping, botanical names, plant glyphs, marks for
// Preset / Mine / lead / excluded, month strips and icons. Views and the inspector build from these only,
// so every screen speaks the same visual language (see docs/knowledge/DESIGN_SYSTEM.md).

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function trim(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtN = n => (n ?? 0).toLocaleString('en');

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function fmtTime(iso) { try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } }
export function fmtDate(iso) { try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } }

/** Botanical name: Latin binomial in italics, cultivar epithet upright in quotes, common names upright. */
export function sci(name) {
  const n = String(name ?? '');
  const m = n.match(/^([A-Z][a-zë-]+(?:\s(?:×\s|x\s)?[a-z][a-zë-]+){0,2})(.*)$/);
  if (!m || /^[A-Z][a-z]+ [A-Z]/.test(n)) return esc(n);
  const rest = m[2];
  return `<i class="sci">${esc(m[1])}</i>${rest ? esc(rest).replace(/(&#39;|‘)([^&‘’]+)(&#39;|’)/g, '<span class="cv">‘$2’</span>') : ''}`;
}
/** Two-line plant label: common name (if any) over the scientific name. */
export function plantLabel(e, { short = false } = {}) {
  if (!e) return '';
  if (e.commonName && !short) return `<span class="pl-c">${esc(e.commonName)}</span><span class="pl-s">${sci(e.name)}</span>`;
  return `<span class="pl-s solo">${sci(e.name)}</span>`;
}

// ---------- plant glyphs (plan-symbol language; type from the record, never guessed) ----------
const G = {
  tree: '<path d="M12 22V13"/><circle cx="12" cy="8.6" r="5.6"/>',
  shrub: '<path d="M4.5 20.5C4.5 13.5 7.8 9 12 9s7.5 4.5 7.5 11.5"/><path d="M3 20.5h18"/><path d="M9 13.5c1 .8 2 .8 3 0M12 16c1 .8 2 .8 3 0"/>',
  forb: '<path d="M12 21.5V7.5M12 15l-4.2-5M12 13.6l4.4-5"/><circle cx="12" cy="6" r="1.7"/><circle cx="7.3" cy="8.8" r="1.5"/><circle cx="16.8" cy="7.6" r="1.5"/>',
  grass: '<path d="M12 21.5C11 15 8 10 4.5 7M12 21.5C11.5 14 10 8.5 8.5 4M12 21.5V3.5M12 21.5C12.5 14 14 8.5 15.5 4M12 21.5C13 15 16 10 19.5 7"/>',
  sedge: '<path d="M10 21.5 8 5M12 21.5V4M14 21.5 16 5"/><path d="M7.4 7.2 8 5l.9 2M11.4 6 12 4l.6 2M15.1 7l.9-2 .6 2.2"/>',
  bulb: '<path d="M3 12.5h18" class="ground"/><path d="M12 15c-3.2.6-3.6 5.6 0 6 3.6-.4 3.2-5.4 0-6Z"/><path d="M12 15V5.5"/><circle cx="12" cy="4.2" r="1.5"/>',
  fern: '<path d="M8 21.5C9 14 12 8 17.5 4"/><path d="M9.1 16.4 6.3 15M9.8 14l3-.6M10.6 12.2 8 10.4M11.8 10.4l2.8-.5M12.6 8.6l-2-1.9M14.3 7.2l2.5.2"/>',
  unknown: '<circle cx="12" cy="13" r="6" stroke-dasharray="2 2"/>',
};
export function glyph(type, size = 24, cls = '') {
  return `<svg class="glyph ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${G[type] || G.unknown}</svg>`;
}
export const PLANT_TYPES = { tree: 'Tree', shrub: 'Shrub', forb: 'Forb', grass: 'Grass', sedge: 'Sedge', bulb: 'Bulb', fern: 'Fern' };

/** The plant's visual: Plant Library illustration if one exists, otherwise its plan-symbol glyph. */
export function plantVisual(e, size = 64) {
  if (e?.seedSet === 'planting-db-10') return `<img class="illus" src="art/${esc(e.id)}.webp" width="${size}" height="${Math.round(size * 1.08)}" alt="" loading="lazy" decoding="async">`;
  return glyph(e?.plantType || (e?.type === 'cultivar' || e?.type === 'plant' ? 'unknown' : 'unknown'), Math.round(size * 0.62), 'pv');
}

// ---------- marks: the same signs everywhere (never colour alone) ----------
/** The personal-knowledge sign: a drawn diamond (never a text glyph). */
export const DIA = '<svg class="dia" viewBox="0 0 8 8" width="7" height="7" aria-hidden="true"><path d="M4 .3 7.7 4 4 7.7.3 4Z"/></svg>';
export const mark = {
  mine: (t = 'Mine') => `<span class="mk mk-mine" title="Your knowledge (this browser)">${DIA}${t ? ' ' + esc(t) : ''}</span>`,
  revised: () => `<span class="mk mk-mine" title="Your version replaces this in the knowledge in effect">${DIA} my version</span>`,
  replaced: () => `<span class="mk mk-repl" title="Replaced by your version; kept unchanged in Preset">replaced by mine</span>`,
  excluded: () => `<span class="mk mk-excl" title="Left out of your knowledge in effect; kept in Preset">left out</span>`,
  lead: () => `<span class="mk mk-lead" title="Historical name matched by spelling only; taxonomy not checked">name match only</span>`,
  derived: () => `<span class="mk mk-der" title="Computed by a rule from records; not stated by a source">derived</span>`,
  provisional: () => `<span class="mk mk-prov" title="A name you added; nothing is known until a record supports it">provisional</span>`,
  candidate: () => `<span class="mk mk-cand" title="Named in the anonymous survey; identity not confirmed">unconfirmed name</span>`,
  placeholder: () => `<span class="mk mk-cand" title="Legend name that is not a resolvable taxon">placeholder</span>`,
  via: (sp) => `<span class="mk mk-via" title="Known for the species, not for this cultivar">via species${sp ? ' ' + esc(sp) : ''}</span>`,
};
export function recMarks(r, sources = null) {
  const out = [];
  if (sources && r.origin !== 'user') {
    const src = sources.get(r.sourceRefs?.[0]?.sourceId);
    if (src?.type === 'model') out.push(`<span class="mk mk-model" title="Written by a language model without an external source; never evidence">model inference</span>`);
    else if (/^claude/i.test(String(r.legacy?.fields?.recorded_by || '')) && r.evidenceStatus !== 'verified') out.push(`<span class="mk mk-read" title="Values read from the source page by a language model (planting-db T5); not checked by a person">model-read</span>`);
    else if (r.evidenceStatus === 'verified') out.push(`<span class="mk" title="Checked by a person against the source">checked</span>`);
  }
  if (r._eff && !r._eff.active) out.push(r._eff.why === 'revised' ? mark.replaced() : r._eff.why === 'excluded' ? mark.excluded() : `<span class="mk mk-excl">${esc(r._eff.why)}</span>`);
  if (r.origin === 'user') out.push(r.revises ? mark.revised() : mark.mine());
  if (r.taxonMatch && !r.taxonMatch.checked) out.push(mark.lead());
  return out.join('');
}

/** 12-month strip; counts[] (0..n) shade cells; cls 'mine' draws the personal colour. */
export function monthStrip(counts, { max = null, cls = '', w = 132, h = 10, labels = false } = {}) {
  const m = max ?? Math.max(1, ...counts); const cw = w / 12;
  let s = `<svg class="months ${cls}" width="${w}" height="${h + (labels ? 11 : 0)}" viewBox="0 0 ${w} ${h + (labels ? 11 : 0)}" aria-hidden="true">`;
  for (let i = 0; i < 12; i++) {
    const v = counts[i] || 0;
    s += `<rect x="${i * cw + .5}" y=".5" width="${cw - 1}" height="${h - 1}" class="${v ? 'on' : 'off'}" ${v ? `style="opacity:${(0.35 + 0.65 * v / m).toFixed(2)}"` : ''}/>`;
    if (labels) s += `<text x="${i * cw + cw / 2}" y="${h + 9}">${MONTHS[i][0]}</text>`;
  }
  return s + '</svg>';
}

// ---------- records as one-line items (inspector, lists) ----------
export function srcShort(kb, r) {
  const sid = r.sourceRefs?.[0]?.sourceId; if (!sid) return '—';
  if (sid === 'me') return 'me';
  if (sid === 'model') return 'language model (no source)';
  if (sid.startsWith('survey-r')) return 'designer survey';
  const s = kb.state.sources.get(sid);
  const map = { rhs: 'RHS', mobot: 'Missouri Bot. Garden', usda_plants: 'USDA PLANTS', osu: 'Oregon State Univ.', gpp: 'Great Plant Picks', eflora: 'E-Flora BC', cov_trees: 'Vancouver street trees', inat: 'iNaturalist', iscbc: 'ISC BC', 'robertson-1929': 'Robertson 1929' };
  return map[sid] || trim((s?.name || sid).split(/[,(—]/)[0], 34);
}
export function recItem(kb, r, { subject = false, compact = false } = {}) {
  const v = kb.formatValue(r); const st = String(r.statement || '');
  const place = r.context?.place ? kb.label(r.context.place) : '';
  const subj = subject ? r.subjects.map(s => kb.label(s)).join(', ') : '';
  const showV = v && v !== st && v.length < 90;
  return `<div class="ri ${r.origin === 'user' ? 'is-mine' : ''} ${r._eff?.active === false ? 'is-off' : ''}" data-rec="${esc(r.id)}" tabindex="0" role="button">
    ${subject && subj ? `<div class="ri-sub">${sci(subj)}</div>` : ''}
    ${showV ? `<div class="ri-v">${esc(v)}</div>` : ''}
    ${compact ? '' : `<div class="ri-s">${esc(trim(st, 200))}</div>`}
    <div class="ri-m"><span>${esc(srcShort(kb, r))}</span>${place ? `<span>${esc(place)}</span>` : ''}${recMarks(r, kb.state.sources)}</div></div>`;
}

// ---------- icons (1.25 px line) ----------
const I = {
  search: '<circle cx="8.5" cy="8.5" r="5.2"/><path d="m12.4 12.4 4.6 4.6"/>',
  plus: '<path d="M10 4v12M4 10h12"/>',
  close: '<path d="m5 5 10 10M15 5 5 15"/>',
  more: '<circle cx="4.5" cy="10" r=".9" fill="currentColor"/><circle cx="10" cy="10" r=".9" fill="currentColor"/><circle cx="15.5" cy="10" r=".9" fill="currentColor"/>',
  arrow: '<path d="M4 10h12M12 6l4 4-4 4"/>',
  back: '<path d="M16 10H4M8 6l-4 4 4 4"/>',
  graph: '<circle cx="10" cy="10" r="2.2"/><circle cx="3.5" cy="5" r="1.4"/><circle cx="16.5" cy="5" r="1.4"/><circle cx="4" cy="15.5" r="1.4"/><circle cx="16" cy="15.5" r="1.4"/><path d="m4.7 5.9 3.6 2.7M15.3 5.9l-3.6 2.7M5.1 14.7l3.2-3.2M14.9 14.7l-3.2-3.2"/>',
  undo: '<path d="M7 5 3.5 8.5 7 12"/><path d="M3.5 8.5H12a4.5 4.5 0 0 1 0 9H8"/>',
  ext: '<path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7"/>',
  chevron: '<path d="m7 4 6 6-6 6"/>',
  down: '<path d="m4 7 6 6 6-6"/>',
  file: '<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/>',
  ask: '<path d="M3.5 4.5h13v8.5H9.5L6 16v-3H3.5z"/>',
};
export function icon(n, s = 16) { return `<svg class="ic" viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true">${I[n] || ''}</svg>`; }

export const THEME_COLOR = { water: 'var(--c-water)', tolerance: 'var(--c-tol)', ecology: 'var(--c-eco)', light: 'var(--c-light)', use: 'var(--c-use)' };

export function kindLabel(e) {
  if (!e) return '';
  if (e.type === 'plant') return e.status === 'candidate' ? 'survey name' : e.origin === 'user' ? 'species (mine)' : 'species';
  if (e.type === 'cultivar') return e.status === 'placeholder' ? 'placeholder' : 'cultivar';
  if (e.type === 'concept') return e.facet === 'place' ? 'place' : 'attribute';
  return { planting_system: 'recipe', dataset: 'dataset', list: 'my list', topic: 'topic', role: 'drawing role' }[e.type] || e.type;
}
