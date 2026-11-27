// Define: one project (preselected — there is only one real site), intent → editable brief, knowledge sources in use.
import { esc } from '../ui.js';
import { MONTHS, SCOPE_LABEL } from '../knowledge.js';

export const STARTERS = [
  { id: 'season', text: 'A pollinator planting that flowers from spring to autumn.' },
  { id: 'corridor', text: 'Connected flower resources along the paths for bees and butterflies.' },
  { id: 'shade', text: 'Planting that suits the shade under the existing trees, with early-season flowers.' },
];
// Rules mode reading of the intent: keyword → objective, every match shown; nothing else is inferred
export function readIntent(text) {
  const t = String(text || '').toLowerCase(); const read = []; const unused = [];
  const o = { flowering: { on: true, months: [4, 5, 6, 7, 8, 9, 10] }, pollinators: { on: false }, continuity: { on: false }, suitability: { on: true } };
  if (/pollinat|bee|butterfl|insect|nectar|moth|hummingbird|wildlife|biodivers/.test(t)) { o.pollinators.on = true; read.push(['pollinator / bee / butterfly', 'Pollinator resources (groups)']); }
  let lo = null, hi = null;
  if (/early|spring/.test(t)) { lo = 3; read.push(['spring / early', 'flowering from March']); }
  if (/autumn|fall|late season|october/.test(t)) { hi = 10; read.push(['autumn / late', 'flowering to October']); }
  if (/summer/.test(t) && lo == null && hi == null) { lo = 6; hi = 8; read.push(['summer', 'flowering June–August']); }
  if (/all (year|season)|long season|continuous flower|season-long|whole season/.test(t)) { lo = lo ?? 3; hi = hi ?? 10; read.push(['long season', 'flowering March–October']); }
  if (lo != null || hi != null) { const a = lo ?? 4, b = hi ?? 9; o.flowering.months = Array.from({ length: b - a + 1 }, (_, i) => a + i); }
  if (/connect|corridor|continu(ous|ity) (along|across)|along the path|network|link/.test(t)) { o.continuity.on = true; read.push(['connected / corridor / along paths', 'Connected resources in space']); }
  if (/shade|tree|canopy|woodland/.test(t)) { o.suitability.on = true; read.push(['shade / trees', 'Plant suitability (light under existing crowns)']); }
  if (/low maintenance|maintenance|easy care/.test(t)) unused.push('maintenance (no maintenance data in the knowledge)');
  if (/native/.test(t)) unused.push('native origin (not recorded for these plants)');
  if (/\b(colou?rs?|purple|yellow|white|pink)\b/.test(t)) unused.push('flower colour (only a display colour exists, not evidence)');
  if (/\b(height|tall|low|short)\b/.test(t) && !/low maintenance/.test(t)) unused.push('height (only nominal display heights exist)');
  if (/\b(water|wet|dry|drought|rain)\b/.test(t)) unused.push('soil moisture (no data on this site)');
  if (/kid|child|play|privacy|seat/.test(t)) unused.push('uses of the space (outside this planting prototype)');
  return { objectives: o, read, unused, method: 'Rules mode: keyword matching, shown in full — not a language model' };
}

export function gate(F) {
  const b = F.P.state.brief;
  if (!b.interpreted && !b.confirmed) return { ok: false, reason: 'Write what this planting should do (or pick a starter) and read it into a brief first.' };
  const o = b.objectives; if (!['flowering', 'pollinators', 'continuity', 'suitability'].some((k) => o[k].on)) return { ok: false, reason: 'Keep at least one objective switched on.' };
  return { ok: true };
}
export function enter() {}

export function bottom(F) {
  const P = F.P; const b = P.state.brief; const g = gate(F);
  return { msg: b.interpreted ? '<b>Brief</b> ready: check the objectives and the knowledge in use.' : '<b>Define</b> what the planting should do.', next: { label: 'Continue to Structure →', enabled: g.ok && !F.u.resume, reason: F.u.resume ? 'Resume your saved design or start a new one.' : g.reason, run: () => { P.setBrief({ confirmed: true, confirmedAt: new Date().toISOString() }); F.go('structure'); } } };
}

export function render(F) {
  const P = F.P, st = P.state, b = st.brief, K = F.K; const el = F.panel;
  const site = F.preset; const beds = P.eligibleBeds();
  let h = `<h1>Define</h1><p class="task">Say what this planting should do. The site is the existing model; you will choose beds in the next step.</p>`;
  h += `<dl class="kv"><dt>Site</dt><dd>${esc(site.name)} · ${esc(site.location || '')}</dd><dt>Plantable</dt><dd>${beds.length} beds and areas, ${Math.round(beds.reduce((a, x) => a + x.areaM2, 0)).toLocaleString('en-US')} m²; terrain 1 m (USGS 3DEP)</dd><dt>Not known</dt><dd>sun, soil moisture, pH — treated as unknown, never as zero</dd></dl>`;
  if (F.u.resume) {
    const r = F.u.resume;
    h += `<hr><h2>Saved design in this browser</h2><p><b>${esc(r.name)}</b> — at ${esc(r.stage)}, ${r.cells} cells, ${r.mixes} mix${r.mixes === 1 ? '' : 'es'}${r.savedAt ? `, saved ${esc(new Date(r.savedAt).toLocaleString())}` : ''}.</p>
      <div class="row"><button class="btn-p" data-a="resume">Resume this design</button><button class="lnk" data-a="new">Start a new design</button></div><p class="dim small">Starting new replaces the saved design in this browser. Export it first from Explore if you want to keep it.</p>`;
    el.innerHTML = h; el.querySelector('[data-a=resume]').onclick = () => F.resume(); el.querySelector('[data-a=new]').onclick = () => F.startNew(); return;
  }
  h += `<hr><h2>Intent</h2><textarea id="fintent" placeholder="e.g. A pollinator planting that flowers from spring to autumn, connected along the paths." aria-label="Planting intent">${esc(b.intent)}</textarea>
    <div class="chips" style="margin:8px 0">${STARTERS.map((s) => `<button class="chip small" data-s="${s.id}" aria-pressed="${b.starter === s.id}">${esc(s.text)}</button>`).join('')}</div>
    <div class="row sp"><button class="${b.interpreted ? 'btn-s' : 'btn-p'}" data-a="read">${b.interpreted ? 'Read again' : 'Read into a brief'}</button><span class="f-modetag" title="${esc(F.R.status.reasons.join('; '))}">Rules mode — offline, no language model</span></div>`;
  if (b.interpreted) {
    const it = b.interpreted;
    h += `<div class="note"><b>Read:</b> ${it.read.length ? it.read.map(([w, o]) => `“${esc(w)}” → ${esc(o)}`).join('; ') : 'no objective words found — defaults kept'}.${it.unused.length ? `<br><b>Not used:</b> ${esc(it.unused.join('; '))}.` : ''}<br><span class="dim">${esc(it.method)}</span></div>`;
    const o = b.objectives; const ms = o.flowering.months;
    h += `<h2>Objectives <span class="aside">edit freely</span></h2><div class="objs">
      <label><input type="checkbox" data-o="flowering" ${o.flowering.on ? 'checked' : ''}><span><b>Flowering continuity</b> <span class="mrange">from <select data-m="lo" aria-label="First month">${MONTHS.map((m, i) => `<option value="${i + 1}" ${ms[0] === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select> to <select data-m="hi" aria-label="Last month">${MONTHS.map((m, i) => `<option value="${i + 1}" ${ms[ms.length - 1] === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></span></span><span class="sub">Months with a known flower resource, from placed plants</span></label>
      <label><input type="checkbox" data-o="pollinators" ${o.pollinators.on ? 'checked' : ''}><span><b>Pollinator resources</b></span><span class="sub">Documented pollinator groups of the flowering plants (association, not visits)</span></label>
      <label><input type="checkbox" data-o="continuity" ${o.continuity.on ? 'checked' : ''}><span><b>Connected resources in space</b></span><span class="sub">Neighbouring cells flowering in the same month (structural proxy). Shapes cells along paths.</span></label>
      <label><input type="checkbox" data-o="suitability" ${o.suitability.on ? 'checked' : ''}><span><b>Plant suitability</b></span><span class="sub">Known light needs vs crowns above (inference); moisture unknown</span></label></div>`;
    h += `<h2>Constraints</h2><ul class="small" style="margin:0;padding-left:16px">${b.constraints.map((c) => `<li><span class="tag ${c.kind === 'hard' ? '' : 'mode'}">${c.kind}</span> ${esc(c.text)}</li>`).join('')}</ul>`;
    const S = K.sourcesStatus(); const sp = K.catalogue().map((s) => s.id); const cov = K.coverage(sp);
    h += `<h2>Knowledge in use <span class="aside"><button class="lnk" data-a="know">Open Knowledge</button></span></h2><ul class="sources">
      ${['foundation', 'site', 'project', 'personal', 'illustrative'].map((k) => `<li><input type="checkbox" data-k="${k}" ${S[k].on ? 'checked' : ''} ${S[k].status === 'absent' || S[k].status === 'unavailable' ? 'disabled' : ''} aria-label="${esc(SCOPE_LABEL[k])}"><span><b>${esc(SCOPE_LABEL[k])}</b>${k === 'illustrative' ? ' <span class="tag illus">not verified</span>' : ''}<br><span class="dim small">${esc(k === 'personal' ? (S[k].count ? `${S[k].count} personal change(s)` : 'empty — optional; add notes any time') : k === 'project' ? `${S[k].count} record(s) added in this project` : (S[k].note || ''))}</span></span><span class="dim xs">${esc(S[k].status)}</span></li>`).join('')}</ul>
      <p class="small">Coverage over the ${sp.length} plants of the site: flowering months <b>${Math.round(cov.bloom * 100)} %</b>, pollinator groups ${Math.round(cov.pollinators * 100)} %, light ${Math.round(cov.light * 100)} %, moisture ${Math.round(cov.moisture * 100)} %${cov.illustrative ? ` — ${Math.round(cov.illustrative * 100)} % of plants carry illustrative values` : ''}.</p>
      ${S.illustrative.on ? '<div class="note illus">The illustrative teaching layer fills flowering, pollinator, light and moisture values the knowledge does not have for Detroit plants. It is labelled wherever it is used. Switch it off to see what is really known.</div>' : '<div class="note">Illustrative values are off: most Detroit plants have unknown flowering and pollinator data, so suggestions and performance will mostly report unknowns.</div>'}`;
  }
  el.innerHTML = h;
  const ta = el.querySelector('#fintent');
  ta.oninput = () => { b.intent = ta.value; P.saveSoon(); };
  el.querySelectorAll('[data-s]').forEach((x) => (x.onclick = () => { const s = STARTERS.find((q) => q.id === x.dataset.s); b.starter = s.id; ta.value = s.text; b.intent = s.text; doRead(F); }));
  el.querySelector('[data-a=read]').onclick = () => { if (!ta.value.trim()) { F.toast('Write a sentence about what the planting should do, or pick one of the starters.'); ta.focus(); return; } b.intent = ta.value; doRead(F); };
  el.querySelectorAll('[data-o]').forEach((x) => (x.onchange = () => { const ob = { ...b.objectives }; ob[x.dataset.o] = { ...ob[x.dataset.o], on: x.checked }; P.setBrief({ objectives: ob }); F.render(); }));
  el.querySelectorAll('[data-m]').forEach((x) => (x.onchange = () => { const lo = +el.querySelector('[data-m=lo]').value, hi = +el.querySelector('[data-m=hi]').value; const a = Math.min(lo, hi), c = Math.max(lo, hi); const ob = { ...b.objectives, flowering: { ...b.objectives.flowering, months: Array.from({ length: c - a + 1 }, (_, i) => a + i) } }; P.setBrief({ objectives: ob }); F.render(); }));
  el.querySelectorAll('[data-k]').forEach((x) => (x.onchange = () => { K.setScope(x.dataset.k, x.checked); P.setBrief({ knowledgeScopes: { ...K.scopes } }); F.render(); }));
  const kb = el.querySelector('[data-a=know]'); if (kb) kb.onclick = () => F.openKnowledge();
  if (!b.interpreted && document.activeElement === document.body) ta.focus();
}
function doRead(F) {
  const P = F.P; const r = readIntent(P.state.brief.intent);
  const prev = P.state.brief.objectives; const ob = {}; for (const k of Object.keys(prev)) ob[k] = { ...prev[k], ...r.objectives[k] };
  P.setBrief({ interpreted: { read: r.read, unused: r.unused, method: r.method, at: new Date().toISOString() }, objectives: ob, knowledgeScopes: { ...F.K.scopes } });
  F.render();
}
