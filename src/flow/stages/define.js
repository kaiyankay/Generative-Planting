// Define: the design scope and the planting strategy for it.
// The map is the selector: click a bed (only that bed), Shift-click (add / remove), Shift-drag (box), or a preset (Main
// Garden, whole site, meadows, block + matrix beds). The candidate selection is drawn dashed until it is confirmed; beds
// outside it are quietened, kept areas hatched. A strategy (zones = role · system · spatial logic, Rules mode) is proposed
// for the candidate and confirmed in ONE step; confirming never clears a bed that already has a design.
import { esc, monthStrip } from '../ui.js';
import { MONTHS, SCOPE_LABEL } from '../knowledge.js';
import { SYSTEMS } from '../mix.js';
import { LOGICS, bbox, inside } from '../spatial.js';
import { proposeStrategy, editZone, SCOPES, STARTERS, readIntent } from '../strategy.js';
export { readIntent, STARTERS };

const STARTER_LABEL = { v2: 'Meadows kept · matrix along the paths', season: 'Flowers spring → autumn', colour: 'Colour blocks + path matrix' };
export function gate(F) { const s = F.P.state.strategy; return s && s.confirmed && s.zones.length && !F.u.strategy ? { ok: true } : { ok: false, reason: F.u.strategy ? 'Confirm the strategy for this selection.' : 'Confirm a scope and strategy first.' }; }
export function enter(F, opts = {}) {
  const st = F.P.state.strategy;
  if (opts.from || opts.fresh) F.u.strategy = null;
  if (!F.u.candidate || opts.fresh || opts.from) F.u.candidate = new Set(st ? F.scopeBeds() : F.P.eligibleBeds().filter(SCOPES[0].test).map((b) => b.id));
  F.u.scope = F.u.scope || (st && st.scope) || 'main'; F.u.scopeDirty = false;
  F.plan.tool = F.boxTool;
  F.store.setViewState({ hidePlanting: !F.u.showRef && !Object.keys(F.P.state.beds).length });
  if (!st && !F.u.strategy) propose(F, { quiet: true });
}
export function bottom(F) {
  const s = F.u.strategy || F.P.state.strategy; const g = gate(F);
  const msg = !s ? '' : F.u.strategy ? `<b>Not confirmed</b> · ${s.zones.length} zone${s.zones.length === 1 ? '' : 's'} · ${s.beds} beds` : `<b>Confirmed</b> · ${s.zones.length} zone${s.zones.length === 1 ? '' : 's'} · ${s.beds} beds · ${Math.round(s.areaM2).toLocaleString('en-US')} m²`;
  return { msg, next: { label: 'Continue to Structure →', enabled: g.ok, reason: g.ok ? '' : g.reason, run: () => F.go('structure') } };
}
// ---------------------------------------------------------------- selection on the map
export function onCanvasClick(F, x, y, sel, { shift }) {
  const b = F.bedAt(x, y); if (!b) return;
  if (shift) { if (F.u.candidate.has(b.id)) F.u.candidate.delete(b.id); else F.u.candidate.add(b.id); }
  else F.u.candidate = new Set([b.id]);
  F.u.scope = 'custom'; propose(F);
}
export function boxSelect(F, box) {
  let n = 0;
  for (const b of F.P.eligibleBeds()) { const g = F.bedGeom(b.id); if (!g) continue; const q = g._bb || (g._bb = bbox(g)); if (q[2] < box[0] || q[0] > box[2] || q[3] < box[1] || q[1] > box[3]) continue;
    const c = [(Math.max(q[0], box[0]) + Math.min(q[2], box[2])) / 2, (Math.max(q[1], box[1]) + Math.min(q[3], box[3])) / 2]; if (!(inside(g, c[0], c[1]) || (q[0] >= box[0] && q[2] <= box[2] && q[1] >= box[1] && q[3] <= box[3]))) continue;
    if (!F.u.candidate.has(b.id)) { F.u.candidate.add(b.id); n++; } }
  if (n) { F.u.scope = 'custom'; propose(F); F.toast(`${n} bed${n === 1 ? '' : 's'} added.`); }
}
export function hoverAt(F, x, y) {
  const b = F.bedAt(x, y); if (!b) return null; const on = F.u.candidate && F.u.candidate.has(b.id); const z = (F.u.strategy || F.P.state.strategy)?.zones.find((q) => q.bedIds.includes(b.id));
  return { key: b.id, geometry: F.bedGeom(b.id), chip: `<b>${esc(b.code)}</b> <span class="dim">${Math.round(b.areaM2)} m²${z && on ? ' · ' + esc(z.systemName) : ''}</span>${on ? '' : ' <span class="dim">· not selected</span>'}` };
}
function sameSet(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }
function propose(F, { quiet = false } = {}) {
  const P = F.P; const keep = F.u.keepMeadows ? P.eligibleBeds().filter((b) => /^M[WE]$/.test(b.code)).map((b) => b.id) : [];
  F.u.strategy = proposeStrategy(P, { intent: P.state.brief.intent, scope: 'custom', customBeds: [...F.u.candidate], keep });
  F.u.strategy.scope = F.u.scope; F.u.strategy.customBeds = [...F.u.candidate];
  if (F.u.strategy.kept.length) { F.u.keepMeadows = F.u.strategy.kept.some((id) => /M[WE]$/.test(id)); for (const id of F.u.strategy.kept) F.u.candidate.delete(id); }
  const conf = P.state.strategy; F.u.scopeDirty = !conf || !sameSet(new Set(conf.zones.flatMap((z) => z.bedIds)), new Set(F.u.strategy.zones.flatMap((z) => z.bedIds)));
  P.setBrief({ objectives: mergeObjectives(P.state.brief.objectives, F.u.strategy.objectives), interpreted: { read: F.u.strategy.read, unused: F.u.strategy.unused, method: F.u.strategy.method } });
  if (!quiet) F.render();
}
function mergeObjectives(cur, next) { const o = structuredClone(cur); for (const k of Object.keys(next)) o[k] = { ...o[k], ...next[k] }; return o; }

// ---------------------------------------------------------------- panel
export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const s = F.u.strategy || st.strategy; const cand = F.u.candidate || new Set();
  const area = [...cand].reduce((a, id) => a + (P.eligibleBeds().find((b) => b.id === id)?.areaM2 || 0), 0);
  let h = '';
  if (F.u.entry && F.u.resume) h += `<div class="note resume"><b>${esc(F.u.resume.name)}</b> <span class="dim">saved at ${esc(F.u.resume.stage)} · ${F.u.resume.cells} cells</span><div class="row"><button class="btn-s" data-a="resume">Resume</button><button class="lnk" data-a="fresh">Start new</button></div></div>`;
  if (st.maxStage === 'explore' && !F.u.entry) h += `<button class="lnk back-result" data-a="result">View the current result →</button>`;
  // scope
  const preset = SCOPES.filter((x) => x.id !== 'custom').find((x) => { const ids = new Set(P.eligibleBeds().filter(x.test).map((b) => b.id)); for (const k of (s && s.kept) || []) ids.delete(k); return sameSet(ids, cand); });
  h += `<section class="blk scope"><h2>Scope</h2>
    <div class="bigline"><b class="num big">${cand.size}</b><span>bed${cand.size === 1 ? '' : 's'}</span><b class="num big">${Math.round(area).toLocaleString('en-US')}</b><span>m²</span></div>
    <div class="chips">${SCOPES.filter((x) => x.id !== 'custom').map((x) => `<button class="chip" data-scope="${x.id}" aria-pressed="${!!preset && preset.id === x.id}">${esc(x.name)}</button>`).join('')}</div>
    <p class="keys"><kbd>click</kbd> one bed <kbd>⇧ click</kbd> add / remove <kbd>⇧ drag</kbd> box</p>
    <label class="chk sm"><input type="checkbox" id="fkeep" ${F.u.keepMeadows ? 'checked' : ''}> keep East + West Meadow as they are</label></section>`;
  // intent
  h += `<section class="blk"><h2>Intent <span class="tag mode" title="${esc(F.R && F.R.status && F.R.status.configured ? 'A language model is configured on this server' : 'No language model: explicit keyword rules, listed under “What the rules read”')}">${F.R && F.R.status && F.R.status.configured ? 'Model' : 'Rules'}</span></h2>
    <textarea id="fintent" rows="3" placeholder="What should these beds become?">${esc(st.brief.intent)}</textarea>
    <div class="chips starters">${STARTERS.map((x) => `<button class="chip" data-st="${x.id}" title="${esc(x.text)}" aria-pressed="${st.brief.starter === x.id && st.brief.intent === x.text}">${esc(STARTER_LABEL[x.id] || x.text)}</button>`).join('')}</div></section>`;
  if (s) {
    h += `<section class="blk"><h2>Strategy</h2><div class="zones">`;
    for (const z of s.zones) {
      h += `<article class="zone${F.u.zone === z.id ? ' on' : ''}" data-zone="${z.id}" style="--zc:${z.color}"><header><span class="sw"></span><b>${esc(z.name)}</b><span class="mono xs">${z.bedIds.map((id) => P.bedCode(id)).join(' ')}</span></header>
        <div class="zsel"><select data-zsys="${z.id}" aria-label="Planting system">${Object.values(SYSTEMS).map((x) => `<option value="${x.id}" ${x.id === z.system ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
        <select data-zlog="${z.id}" aria-label="Spatial logic">${['bands:path', 'bands:straight', 'honeycomb', 'organic', 'whole'].map((k) => { const [lg, gd] = k.split(':'); const on = z.logic === lg && (lg !== 'bands' || ((z.params && z.params.guide) || 'path') === gd); return `<option value="${k}" ${on ? 'selected' : ''}>${lg === 'bands' ? (gd === 'path' ? 'Curved bands' : 'Straight bands') : LOGICS[lg].name}</option>`; }).join('')}</select></div>
        <details><summary class="xs">${esc(z.role)}</summary><ul class="xs">${z.why.map((w) => `<li>${esc(w)}</li>`).join('')}${z.gaps.map((w) => `<li class="gap">${esc(w)}</li>`).join('')}</ul></details></article>`;
    }
    h += `</div>${s.kept.length ? `<p class="xs"><span class="tag found">kept</span> ${s.kept.map((id) => P.bedCode(id)).join(', ')} — reference planting</p>` : ''}</section>`;
    const o = st.brief.objectives; const mo = o.flowering.months; const ks = F.K.sourcesStatus();
    h += `<details class="blk more"><summary><h2>Brief and sources</h2></summary><div class="objs">
      <label><input type="checkbox" data-obj="flowering" ${o.flowering.on ? 'checked' : ''}> Flowering <span class="mrange"><input type="number" min="1" max="12" id="fm0" value="${mo[0]}" aria-label="first month"> – <input type="number" min="1" max="12" id="fm1" value="${mo[mo.length - 1]}" aria-label="last month"></span></label>
      <label><input type="checkbox" data-obj="pollinators" ${o.pollinators.on ? 'checked' : ''}> Pollinator groups</label>
      <label><input type="checkbox" data-obj="continuity" ${o.continuity.on ? 'checked' : ''}> Connected along the paths</label>
      <label><input type="checkbox" data-obj="suitability" ${o.suitability.on ? 'checked' : ''}> Light suitability</label></div>
      ${monthStrip(mo)}
      <h3>Knowledge in use</h3><ul class="sources">${Object.entries(ks).map(([k, v]) => `<li><label><input type="checkbox" data-ks="${k}" ${v.on ? 'checked' : ''} ${k === 'illustrative' && v.status !== 'loaded' ? 'disabled' : ''}> ${esc(SCOPE_LABEL[k])}</label> <span class="xs dim">${v.count != null ? v.count : esc(v.status)}</span></li>`).join('')}</ul>
      <p class="xs dim">No sun hours, soil moisture or pH on this site — unknown unless you state a light assumption (Conditions).</p>
      <h3>What the rules read</h3><ul class="xs read">${[...s.read.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`), ...s.rules.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`)].join('') || '<li class="dim">no keyword matched: scope rules only</li>'}${s.unused.map((x) => `<li class="dim">not used: ${esc(x)}</li>`).join('')}</ul>
      <ul class="xs dim cons">${st.brief.constraints.map((c) => `<li><span class="tag ${c.kind === 'hard' ? 'warn' : 'unk'}">${c.kind}</span> ${esc(c.text)}</li>`).join('')}</ul></details>`;
    if (F.u.strategy) {
      const conf = st.strategy; const now = new Set(s.zones.flatMap((z) => z.bedIds)); const was = new Set(conf ? conf.zones.flatMap((z) => z.bedIds) : []);
      const add = [...now].filter((b) => !was.has(b)), rm = [...was].filter((b) => !now.has(b)); const keptDesign = rm.filter((b) => st.beds[b]);
      h += `<div class="sticky-cta">${conf ? `<p class="xs">${add.length ? `<b>+${add.length}</b> ${add.map((b) => P.bedCode(b)).join(' ')} ` : ''}${rm.length ? `<b>−${rm.length}</b> ${rm.map((b) => P.bedCode(b)).join(' ')}` : ''}${!add.length && !rm.length ? 'Same beds, revised zones.' : ''}${keptDesign.length ? `<br><span class="dim">${keptDesign.map((b) => P.bedCode(b)).join(', ')} already ${keptDesign.length === 1 ? 'has' : 'have'} cells — kept in the scope.</span>` : ''}</p>` : ''}
        <button class="btn-p wide" data-a="confirm" ${cand.size ? '' : 'disabled'}>Confirm · ${s.zones.length} zone${s.zones.length === 1 ? '' : 's'} · ${s.beds} beds</button>${conf ? '<button class="lnk" data-a="revert">keep the confirmed scope</button>' : ''}</div>`;
    }
  }
  el.innerHTML = h; bind(F, el);
}
function bind(F, el) {
  const P = F.P; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  a('resume', () => F.resume()); a('fresh', () => { if (confirm(`Replace “${F.u.resume ? F.u.resume.name : 'the saved design'}” with a new, empty design?`)) F.startNew(); }); a('result', () => F.go('explore'));
  const ta = el.querySelector('#fintent'); ta.oninput = () => { P.state.brief.intent = ta.value; P.saveSoon(); clearTimeout(F._it); F._it = setTimeout(() => { if (F.stage() === 'define') propose(F); }, 700); };
  el.querySelectorAll('[data-st]').forEach((b) => (b.onclick = () => { const x = STARTERS.find((q) => q.id === b.dataset.st); P.setBrief({ intent: x.text, starter: x.id }); if (/keep the meadows/i.test(x.text)) F.u.keepMeadows = true; propose(F); }));
  el.querySelectorAll('[data-scope]').forEach((b) => (b.onclick = () => { const sc = SCOPES.find((q) => q.id === b.dataset.scope); F.u.scope = sc.id; F.u.candidate = new Set(P.eligibleBeds().filter(sc.test).map((q) => q.id)); propose(F); F.focusBeds([...F.u.candidate]); }));
  el.querySelector('#fkeep').onchange = (e) => { F.u.keepMeadows = e.target.checked; if (!e.target.checked) for (const b of P.eligibleBeds()) if (/^M[WE]$/.test(b.code) && F.u.scope === 'site') F.u.candidate.add(b.id); propose(F); };
  a('confirm', () => { const s = F.u.strategy; s.objectives = P.state.brief.objectives; P.confirmStrategy(s); F.u.strategy = null; F.u.scopeDirty = false; F.u.candidate = new Set(F.scopeBeds()); F.toast(`Scope confirmed: ${s.beds} beds in ${s.zones.length} zone${s.zones.length === 1 ? '' : 's'}.`); F.render(); });
  a('revert', () => { F.u.strategy = null; F.u.scopeDirty = false; F.u.candidate = new Set(F.scopeBeds()); F.u.scope = (P.state.strategy && P.state.strategy.scope) || 'custom'; F.render(); });
  el.querySelectorAll('[data-zone]').forEach((z) => z.addEventListener('mouseenter', () => { F.u.zone = z.dataset.zone; F.repaint(); }));
  el.querySelectorAll('[data-zone]').forEach((z) => z.addEventListener('click', (e) => { if (e.target.closest('select,summary,details')) return; const s = F.u.strategy || P.state.strategy; const zz = s.zones.find((q) => q.id === z.dataset.zone); if (zz) F.focusBeds(zz.bedIds); }));
  const editable = () => { if (!F.u.strategy) F.u.strategy = structuredClone(P.state.strategy); F.u.strategy.confirmed = false; return F.u.strategy; };
  el.querySelectorAll('[data-zsys]').forEach((s) => (s.onchange = () => { F.u.strategy = editZone(editable(), s.dataset.zsys, { system: s.value, manual: true }); F.render(); }));
  el.querySelectorAll('[data-zlog]').forEach((s) => (s.onchange = () => { const [lg, gd] = s.value.split(':'); F.u.strategy = editZone(editable(), s.dataset.zlog, { logic: lg, params: lg === 'bands' ? { guide: gd } : {}, manual: true }); F.render(); }));
  el.querySelectorAll('[data-obj]').forEach((c) => (c.onchange = () => { const o = structuredClone(P.state.brief.objectives); o[c.dataset.obj].on = c.checked; P.setBrief({ objectives: o }); F.renderPanel(); }));
  const m0 = el.querySelector('#fm0'), m1 = el.querySelector('#fm1'); if (m0) { const upd = () => { const x = Math.max(1, Math.min(12, +m0.value)), y = Math.max(x, Math.min(12, +m1.value)); const o = structuredClone(P.state.brief.objectives); o.flowering.months = Array.from({ length: y - x + 1 }, (_, i) => x + i); P.setBrief({ objectives: o }); F.render(); }; m0.onchange = upd; m1.onchange = upd; }
  el.querySelectorAll('[data-ks]').forEach((c) => (c.onchange = () => { F.K.setScope(c.dataset.ks, c.checked); P.state.brief.knowledgeScopes = { ...F.K.scopes }; P.save(); F.render(); }));
}
export function inspector() { return null; }
