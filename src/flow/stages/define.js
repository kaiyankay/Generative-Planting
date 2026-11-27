// Define: one strategy for the whole design scope — intent (words) or manual choices → a confirmable Design Brief and a
// Planting Strategy drawn on the map (zones = role · system · spatial logic, with reasons and evidence gaps).
// Rules mode only reads explicit words with listed rules; it never claims to understand arbitrary language.
import { esc, monthStrip } from '../ui.js';
import { MONTHS, SCOPE_LABEL } from '../knowledge.js';
import { SYSTEMS } from '../mix.js';
import { LOGICS } from '../spatial.js';
import { proposeStrategy, editZone, SCOPES, STARTERS, readIntent } from '../strategy.js';
export { readIntent, STARTERS };

export function gate(F) { const s = F.P.state.strategy; return s && s.confirmed && s.zones.length ? { ok: true } : { ok: false, reason: 'Confirm a planting strategy first (it takes one click).' }; }
export function enter(F) {
  F.u.scope = F.u.scope || (F.P.state.strategy && F.P.state.strategy.scope) || 'main'; F.u.customBeds = F.u.customBeds || new Set((F.P.state.strategy && F.P.state.strategy.customBeds) || []);
  quietMap(F, !F.u.showRef);
}
function quietMap(F, quiet) { F.store.setViewState({ hidePlanting: !!quiet && !Object.keys(F.P.state.beds).length }); }
export function bottom(F) {
  const s = F.u.strategy || F.P.state.strategy;
  const msg = !s ? '<b>Define</b> the planting for the whole scope — words or manual choices.' : s.confirmed && !F.u.strategy ? `<b>Strategy confirmed</b>: ${s.zones.length} zones, ${s.beds} beds, ${Math.round(s.areaM2).toLocaleString('en-US')} m².` : `<b>Strategy proposed</b>: ${s.zones.length} zones over ${s.beds} beds — check it on the map, then confirm.`;
  const g = gate(F);
  return { msg, next: { label: 'Continue to Structure →', enabled: g.ok && !F.u.strategy, reason: F.u.strategy ? 'Confirm the proposed strategy first.' : g.reason, run: () => F.go('structure') } };
}
export function onCanvasClick(F, x, y) {
  const b = F.bedAt(x, y); if (!b) return;
  F.u.scope = 'custom'; if (!F.u.customBeds.size && F.u.strategy) for (const z of F.u.strategy.zones) for (const id of z.bedIds) F.u.customBeds.add(id);
  if (F.u.customBeds.has(b.id)) F.u.customBeds.delete(b.id); else F.u.customBeds.add(b.id);
  if (F.u.strategy || F.P.state.strategy) propose(F); else F.render();
}
function propose(F) {
  const keep = F.u.keepMeadows ? F.P.eligibleBeds().filter((b) => /^M[WE]$/.test(b.code)).map((b) => b.id) : [];
  F.u.strategy = proposeStrategy(F.P, { intent: F.P.state.brief.intent, scope: F.u.scope, customBeds: [...F.u.customBeds], keep });
  if (F.u.strategy.kept.length) F.u.keepMeadows = F.u.strategy.kept.some((id) => /M[WE]$/.test(id));
  F.P.setBrief({ objectives: mergeObjectives(F.P.state.brief.objectives, F.u.strategy.objectives), interpreted: { read: F.u.strategy.read, unused: F.u.strategy.unused, method: F.u.strategy.method } });
  F.focusBeds(F.u.strategy.zones.flatMap((z) => z.bedIds)); F.render();
}
function mergeObjectives(cur, next) { const o = structuredClone(cur); for (const k of Object.keys(next)) o[k] = { ...o[k], ...next[k] }; return o; }

export function render(F) {
  if (!F.u.customBeds) { F.u.scope = F.u.scope || (F.P.state.strategy && F.P.state.strategy.scope) || 'main'; F.u.customBeds = new Set((F.P.state.strategy && F.P.state.strategy.customBeds) || []); }
  const P = F.P, st = P.state, el = F.panel; const s = F.u.strategy || st.strategy; const beds = P.eligibleBeds(); const total = beds.reduce((a, b) => a + b.areaM2, 0);
  let h = `<header class="stage-head"><p class="kicker">1 · Define</p><h1>The planting strategy</h1><p class="task">Say what the whole site should become. A strategy is drawn on the map; nothing changes until you confirm it.</p></header>`;
  if (F.u.entry && F.u.resume) h += `<div class="note"><b>Saved design:</b> “${esc(F.u.resume.name)}” at ${esc(F.u.resume.stage)} (${F.u.resume.cells} cells, ${F.u.resume.mixes} mixes)${F.u.resume.schema === 'gp.project/1' ? ' · V1 — it will be migrated' : ''}. <div class="row"><button class="btn-s" data-a="resume">Resume</button><button class="lnk" data-a="fresh">Start a new design</button></div></div>`;
  h += `<section class="blk"><h2>Intent <span class="tag mode" title="${esc(F.R && F.R.status && F.R.status.configured ? 'A language model is configured on this server' : 'No language model: explicit rules only, shown in full')}">${F.R && F.R.status && F.R.status.configured ? 'Model available' : 'Rules mode · offline'}</span></h2>
    <textarea id="fintent" rows="4" placeholder="e.g. Keep the meadows, a coherent matrix along the main garden paths, early flowers beneath trees, pollinators all season.">${esc(st.brief.intent)}</textarea>
    <div class="starters">${STARTERS.map((x) => `<button class="starter" data-st="${x.id}">${esc(x.text)}</button>`).join('')}</div></section>`;
  h += `<section class="blk"><h2>Scope</h2><div class="chips">${SCOPES.map((x) => `<button class="chip" data-scope="${x.id}" aria-pressed="${F.u.scope === x.id}">${esc(x.name)}${x.id === 'custom' && F.u.customBeds.size ? ` · ${F.u.customBeds.size}` : ''}</button>`).join('')}</div>
    <label class="chk"><input type="checkbox" id="fkeep" ${F.u.keepMeadows ? 'checked' : ''}> Keep East + West Meadow as they are</label>
    <p class="xs dim">Click beds on the map to make your own selection. Existing trees always stay. ${Math.round(total).toLocaleString('en-US')} m² plantable in ${beds.length} beds and areas.</p>
    <div class="row"><button class="btn-p" data-a="read">${s ? 'Propose again' : 'Propose a strategy'}</button><label class="chk sm"><input type="checkbox" id="fref" ${F.u.showRef ? 'checked' : ''}> show the reference planting</label></div></section>`;
  if (s) {
    h += `<section class="blk"><h2>Strategy <span class="aside">${s.zones.length} zones · ${s.beds} beds · ${Math.round(s.areaM2).toLocaleString('en-US')} m²</span></h2><div class="zones">`;
    for (const z of s.zones) {
      h += `<article class="zone${F.u.zone === z.id ? ' on' : ''}" data-zone="${z.id}" style="--zc:${z.color}"><header><span class="sw"></span><b>${esc(z.name)}</b><span class="mono xs">${z.bedIds.map((id) => P.bedCode(id)).join(' ')}</span></header>
        <p class="small">${esc(z.role)}</p>
        <div class="zsel"><label>System <select data-zsys="${z.id}">${Object.values(SYSTEMS).map((x) => `<option value="${x.id}" ${x.id === z.system ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Spatial logic <select data-zlog="${z.id}">${['bands:path', 'bands:straight', 'honeycomb', 'organic', 'whole'].map((k) => { const [lg, gd] = k.split(':'); const on = z.logic === lg && (lg !== 'bands' || ((z.params && z.params.guide) || 'path') === gd); return `<option value="${k}" ${on ? 'selected' : ''}>${lg === 'bands' ? (gd === 'path' ? 'Curved bands (follow the path)' : 'Straight bands (shared axis)') : LOGICS[lg].name}</option>`; }).join('')}</select></label></div>
        <details><summary class="xs">Why · gaps</summary><ul class="xs">${z.why.map((w) => `<li>${esc(w)}</li>`).join('')}${z.gaps.map((w) => `<li class="gap">${esc(w)}</li>`).join('')}</ul></details></article>`;
    }
    h += `</div>${s.kept.length ? `<p class="small"><span class="tag found">kept</span> ${s.kept.map((id) => P.bedCode(id)).join(', ')} stay as the reference planting.</p>` : ''}</section>`;
    const o = st.brief.objectives; const mo = o.flowering.months;
    h += `<section class="blk"><h2>Design brief</h2><div class="objs">
      <label><input type="checkbox" data-obj="flowering" ${o.flowering.on ? 'checked' : ''}> Flowering ${esc(MONTHS[mo[0] - 1])}–${esc(MONTHS[mo[mo.length - 1] - 1])} <span class="mrange"><input type="number" min="1" max="12" id="fm0" value="${mo[0]}" aria-label="first month"> – <input type="number" min="1" max="12" id="fm1" value="${mo[mo.length - 1]}" aria-label="last month"></span></label>
      <label><input type="checkbox" data-obj="pollinators" ${o.pollinators.on ? 'checked' : ''}> Pollinator resources (documented groups)</label>
      <label><input type="checkbox" data-obj="continuity" ${o.continuity.on ? 'checked' : ''}> Connected resources along the paths</label>
      <label><input type="checkbox" data-obj="suitability" ${o.suitability.on ? 'checked' : ''}> Plant suitability (light vs crown proxy)</label></div>
      ${monthStrip(mo)}
      <ul class="xs dim cons">${st.brief.constraints.map((c) => `<li><span class="tag ${c.kind === 'hard' ? 'warn' : 'unk'}">${c.kind}</span> ${esc(c.text)}</li>`).join('')}</ul></section>`;
    const ks = F.K.sourcesStatus();
    h += `<section class="blk"><h2>Knowledge in use</h2><ul class="sources">${Object.entries(ks).map(([k, v]) => `<li><label><input type="checkbox" data-ks="${k}" ${v.on ? 'checked' : ''} ${k === 'illustrative' && v.status !== 'loaded' ? 'disabled' : ''}> ${esc(SCOPE_LABEL[k])}</label> <span class="xs dim">${esc(v.status)}${v.count != null ? ' · ' + v.count : ''}</span>${k === 'personal' && !v.count ? ' <span class="xs dim">(empty is fine)</span>' : ''}</li>`).join('')}</ul>
      <p class="xs dim">Sun hours, soil moisture and pH: no data on this site — unknown, never assumed.</p></section>`;
    h += `<section class="blk"><h2>What Rules mode read</h2><ul class="xs read">${[...s.read.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`), ...s.rules.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`)].join('') || '<li class="dim">no keyword matched: the scope rules alone shaped the zones</li>'}${s.unused.map((x) => `<li class="dim">not used: ${esc(x)}</li>`).join('')}</ul></section>`;
    h += F.u.strategy ? `<div class="sticky-cta"><button class="btn-p wide" data-a="confirm">Confirm strategy · ${s.zones.length} zones</button><p class="xs dim">Structure then previews every zone at once.</p></div>` : `<p class="small ok">Confirmed. Change the intent or a zone and propose again to revise it.</p>`;
  }
  el.innerHTML = h; bind(F, el);
}
function bind(F, el) {
  const P = F.P; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  a('resume', () => F.resume()); a('fresh', () => F.startNew());
  const ta = el.querySelector('#fintent'); ta.oninput = () => { P.state.brief.intent = ta.value; P.saveSoon(); };
  el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const x = STARTERS.find((q) => q.id === b.dataset.st); P.setBrief({ intent: x.text, starter: x.id }); if (/keep the meadows/i.test(x.text)) F.u.keepMeadows = true; propose(F); }));
  el.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => { F.u.scope = b.dataset.scope; if (F.u.scope !== 'custom') F.u.customBeds = new Set(); propose(F); }));
  el.querySelector('#fkeep').onchange = (e) => { F.u.keepMeadows = e.target.checked; if (F.u.strategy || P.state.strategy) propose(F); else F.render(); };
  el.querySelector('#fref').onchange = (e) => { F.u.showRef = e.target.checked; quietMap(F, !F.u.showRef); };
  a('read', () => { P.setBrief({ intent: ta.value }); propose(F); });
  a('confirm', () => { const s = F.u.strategy; s.objectives = P.state.brief.objectives; P.confirmStrategy(s); F.u.strategy = null; F.toast(`Strategy confirmed: ${s.zones.length} zones. Structure previews them all at once.`); F.render(); });
  el.querySelectorAll('[data-zone]').forEach((z) => z.addEventListener('mouseenter', () => { F.u.zone = z.dataset.zone; F.repaint(); }));
  el.querySelectorAll('[data-zone]').forEach((z) => z.addEventListener('click', (e) => { if (e.target.closest('select,summary')) return; const s = F.u.strategy || P.state.strategy; const zz = s.zones.find((q) => q.id === z.dataset.zone); if (zz) F.focusBeds(zz.bedIds); }));
  const editable = () => { if (!F.u.strategy) F.u.strategy = structuredClone(P.state.strategy); F.u.strategy.confirmed = false; return F.u.strategy; };
  el.querySelectorAll('[data-zsys]').forEach((s) => (s.onchange = () => { F.u.strategy = editZone(editable(), s.dataset.zsys, { system: s.value, manual: true }); F.render(); }));
  el.querySelectorAll('[data-zlog]').forEach((s) => (s.onchange = () => { const [lg, gd] = s.value.split(':'); F.u.strategy = editZone(editable(), s.dataset.zlog, { logic: lg, params: lg === 'bands' ? { guide: gd } : {}, manual: true }); F.render(); }));
  el.querySelectorAll('[data-obj]').forEach((c) => (c.onchange = () => { const o = structuredClone(P.state.brief.objectives); o[c.dataset.obj].on = c.checked; P.setBrief({ objectives: o }); F.renderPanel(); }));
  const m0 = el.querySelector('#fm0'), m1 = el.querySelector('#fm1'); if (m0) { const upd = () => { const x = Math.max(1, Math.min(12, +m0.value)), y = Math.max(x, Math.min(12, +m1.value)); const o = structuredClone(P.state.brief.objectives); o.flowering.months = Array.from({ length: y - x + 1 }, (_, i) => x + i); P.setBrief({ objectives: o }); F.render(); }; m0.onchange = upd; m1.onchange = upd; }
  el.querySelectorAll('[data-ks]').forEach((c) => (c.onchange = () => { F.K.setScope(c.dataset.ks, c.checked); P.state.brief.knowledgeScopes = { ...F.K.scopes }; P.save(); F.render(); }));
}
export function inspector() { return null; }
