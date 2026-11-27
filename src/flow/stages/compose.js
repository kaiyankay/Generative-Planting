// Compose: create or reuse Mixes (assisted and manual paths write the same library), assign them to cells (paint or
// Auto Compose write the same CellAssignments), and see the actual plant instances appear.
import { esc, plantName, plainName, monthStrip, sourceTag, traitLine, ICON, pct } from '../ui.js';
import { ROLES, MONTHS, GROUPS, findPlant, parseNote } from '../knowledge.js';
import { makeMix, editMix, validateMix, normalize, convertLegendRecipe, PALETTE, DEFAULT_DENSITY } from '../mix.js';
import { recipeToMix, coverageOf } from '../suggest.js';
import { autoCompose, compatibility } from '../compose.js';

export function gate(F) { const t = F.P.totals(); return t.plants > 0 ? { ok: true } : { ok: false, reason: 'Assign a mix to at least one cell so that plants are placed.' }; }
export function enter(F, opts = {}) {
  if (F.ctx.st.view !== 'plan' && !opts.resumed && !opts.keepView) F.ctx.setObs('plan');
  if (opts.cells) { F.u.cells = new Set(opts.cells); F.focusCells(opts.cells); }
  else if (!opts.resumed && !opts.keepView) F.focusCells(F.P.allCells().map((c) => c.id));
  if (opts.editMix) openEditor(F, opts.editMix);
  if (opts.knowledge) F.u.knowledgeAdd = { plantId: opts.knowledge, text: '', parsed: null, scope: 'project' };
}
const unassigned = (F) => F.P.allCells().filter((c) => !(F.P.state.assignments[c.id] && F.P.state.assignments[c.id].mixId) && !F.P.state.acknowledged[c.id]);
export function bottom(F) {
  const P = F.P; const t = P.totals(); const un = unassigned(F).length; const g = gate(F);
  const msg = !P.state.mixes.length ? '<b>Compose</b>: create the first mix.' : F.u.paint ? `<b>Painting</b> — click or drag across cells; Esc to stop.` : `<b>${t.plants.toLocaleString('en-US')} plants</b> placed in ${t.assigned} of ${t.cells} cells, ${t.species} species${un ? ` · ${un} cell${un === 1 ? '' : 's'} without a mix` : ''}.`;
  return { msg, next: { label: 'Continue to Explore →', enabled: g.ok, reason: g.reason, run: () => {
    if (un) { F.u.confirm = { text: `${un} cell${un === 1 ? ' has' : 's have'} no mix.`, actions: [{ label: 'Leave them empty and continue', run: () => { F.P.clearCells(unassigned(F).map((c) => c.id), { empty: true }); F.go('explore'); } }, { label: 'Stay and assign', run: () => { F.selectCells(unassigned(F).map((c) => c.id)); } }] }; F.renderBottom(); return; }
    F.go('explore');
  } } };
}
export function onCanvasClick(F, x, y, sel, { shift }) { const c = F.cellAt(x, y); if (c) F.selectCells([c.id], { add: shift }); else if (!shift) { F.u.cells.clear(); F.render(); } }

// ---------------------------------------------------------------- painting (one gesture = one undoable assignment)
export function paintCells(F, ids) {
  const P = F.P; const mix = P.mix(F.u.paint.mixId); if (!mix) return;
  const r = P.assign(ids, mix.id, { origin: 'manual', label: `paint ${mix.name} → ${ids.map((i) => P.state.cells[i].label).join(', ')}` });
  if (r && r.ok === false) { F.toast(r.error, { err: true }); return; }
  const conf = ids.map((id) => ({ id, c: compatibility(P.state.cells[id], mix, F.K) })).filter((q) => q.c.status === 'conflict');
  const placed = ids.reduce((a, id) => a + (P.state.instances[id] ? P.state.instances[id].plants.length : 0), 0);
  if (conf.length) F.toast(`${placed} plants placed. ${conf.length} cell${conf.length === 1 ? '' : 's'} with a light conflict (marked !): select to review, keep or change.`, { ms: 6000 });
  else F.toast(`${placed} plants placed in ${ids.length} cell${ids.length === 1 ? '' : 's'} (undo: ⌘Z).`);
}

// ---------------------------------------------------------------- editor helpers
function openEditor(F, mixId) {
  const P = F.P; const m = mixId ? P.mix(mixId) : null;
  F.u.editor = { mixId: m ? m.id : null, draft: structuredClone(m || makeMix({ id: 'mix.mine.' + (P.state.mixes.length + 1), name: `Mix ${P.state.mixes.length + 1}`, color: PALETTE[P.state.mixes.length % PALETTE.length], members: [], origin: 'manual' })), proposal: null, save: null };
  if (!m) F.u.editor.draft.members = [];
  F.u.suggestion = null; F.setPaint(null);
}
const sumOf = (ms) => ms.reduce((a, m) => a + (+m.proportion || 0), 0);
function guessRole(F, id) { const t = F.K.traits(id); if (t.role.status !== 'unknown') return t.role.value; const tp = F.store.getObject(id)?.plantType; return tp === 'grass' || tp === 'sedge' ? 'matrix' : tp === 'bulb' ? 'ephemeral' : tp === 'shrub' ? 'structure' : 'seasonal'; }
const legendRecipes = (F) => ((F.ctx.mixFile && F.ctx.mixFile.mixes) || []).map((m, i) => convertLegendRecipe(m, { colorIndex: i + 3, exists: (id) => !!F.store.getObject(id) }));

// ---------------------------------------------------------------- panel
export function render(F) {
  const P = F.P, st = P.state, el = F.panel; const u = F.u;
  let h = `<h1>Compose</h1>`;
  if (u.knowledgeAdd) { el.innerHTML = h + knowledgeHtml(F); bindKnowledge(F, el); return; }
  if (u.editor) { el.innerHTML = h + editorHtml(F); bindEditor(F, el); return; }
  if (u.suggestion) { el.innerHTML = h + suggestionHtml(F); bindSuggestion(F, el); return; }
  const un = unassigned(F); const t = P.totals();
  h += `<p class="task">${!st.mixes.length ? 'Start with a mix: a reusable recipe of plants, roles and proportions. You will paint it into the numbered cells.' : un.length ? 'Pick a mix and paint cells, or let Auto compose fill the empty ones. Click a cell (without a brush) to inspect it.' : 'Every cell has a mix. Refine the recipes, repaint cells, or continue to Explore.'}</p>`;
  h += `<div class="row"><button class="${st.mixes.length ? 'btn-s' : 'btn-p'}" data-a="suggest">Suggest mixes</button><button class="btn-s" data-a="create">Create a mix</button><button class="lnk" data-a="reuse">Reuse a recipe…</button></div>
    <p class="f-modetag" style="margin-top:6px">${esc(F.R.label())} · ${Object.values(F.K.scopes).filter(Boolean).length} knowledge sources active</p>`;
  if (u.reuse) h += `<div class="cand"><h3>Detroit legend recipes</h3><p class="dim small">Roles and species from the planting plans; proportions converted from area shares (equal species weights — an assumption).</p>${legendRecipes(F).map((m, i) => `<div class="row sp small" style="padding:4px 0;border-bottom:1px solid var(--f-rule)"><span><span class="sw" style="display:inline-block;width:10px;height:10px;background:${m.color}"></span> <b>${esc(m.name)}</b> · ${m.members.length} plants · ${m.density.value} / m²</span><button class="lnk" data-reuse="${i}">Add to my mixes</button></div>`).join('')}<button class="lnk small" data-a="reuseclose">Close</button></div>`;
  if (st.mixes.length) {
    h += `<h2>Mixes <span class="aside">${st.mixes.length}</span></h2><div class="mixes">${st.mixes.map((m) => { const uses = P.usesOf(m.id).length; const tag = { rules: 'Rules', llm: 'AI', manual: 'mine', reuse: 'legend recipe', variant: 'local variant' }[m.origin] || m.origin; const cov = coverageOf(m.members.map((x) => x.plantId), F.K);
      return `<div class="mixcard${st.view.selectedMix === m.id ? ' sel' : ''}" data-mix="${m.id}"><span class="sw" style="background:${esc(m.color)}"></span><span><b>${esc(m.name)}</b> <span class="tag">${esc(tag)}</span><br><span class="meta">${m.members.length} plants · ${m.density.value}/m² · v${m.version} · ${uses ? `in ${uses} cell${uses === 1 ? '' : 's'}` : 'not used yet'}</span><br>${monthStrip(cov.months, { title: 'months with a known flower resource' })}</span><span class="acts"><button class="paintbtn" data-paint="${m.id}" aria-pressed="${!!(u.paint && u.paint.mixId === m.id)}" title="Paint this mix into cells">${ICON.brush}Paint</button><button class="lnk small" data-edit="${m.id}">Edit</button></span></div>`; }).join('')}</div>`;
    // auto compose
    const scopeSel = [...u.cells].filter((id) => !(st.assignments[id] && st.assignments[id].mixId));
    if (u.autoPreview) {
      const ap = u.autoPreview; const by = {}; for (const p of ap.proposals) by[p.mixId] = (by[p.mixId] || 0) + 1;
      h += `<div class="cand"><h3>Auto compose — preview</h3><p class="small">${ap.proposals.length} cell${ap.proposals.length === 1 ? '' : 's'} (${ap.scopeLabel}): ${Object.entries(by).map(([k, n]) => `${esc(P.mix(k).name)} × ${n}`).join(', ')}. Cells that already have a mix are not changed.</p>
        <details><summary>Why each cell</summary><ul>${ap.proposals.map((p) => `<li>${esc(st.cells[p.cellId].label)} → ${esc(P.mix(p.mixId).name)}: ${esc(p.reasons)}${p.conflicts.length ? ` <span class="tag warn">conflict</span>` : ''}</li>`).join('')}</ul><p class="dim xs">${esc(ap.rule)}${ap.groupsUsed ? '' : ' (pollinator groups off: flowering months only)'}.</p></details>
        <div class="row"><button class="btn-p" data-a="autoaccept">Accept ${ap.proposals.length}</button><button class="lnk" data-a="autocancel">Cancel</button></div></div>`;
    } else if (un.length) h += `<h2>Fill cells</h2><div class="row"><button class="btn-s" data-a="auto">Auto compose ${scopeSel.length ? `${scopeSel.length} selected` : `${un.length} empty`} cell${(scopeSel.length || un.length) === 1 ? '' : 's'}</button><span class="dim small">uses your objectives; preview first</span></div>`;
  }
  if (t.plants) h += `<h2>Plants placed <span class="aside">${t.plants.toLocaleString('en-US')}</span></h2><p class="small dim">Each dot in the plan and each form in 3D is one planned plant read from the same records. Positions: seeded, inside the cells, off paths and 0.6 m from tree trunks.</p>`;
  if (st.staleSince) h += `<div class="note">Brief or knowledge changed since mixes were made (${esc(st.staleSince.why)}). Existing mixes and plants are unchanged; <button class="lnk" data-a="suggest">suggest again</button> to compare.</div>`;
  el.innerHTML = h; bindPalette(F, el);
}
function bindPalette(F, el) {
  const P = F.P; const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  a('suggest', () => runSuggest(F)); a('create', () => { openEditor(F, null); F.render(); }); a('reuse', () => { F.u.reuse = true; F.render(); }); a('reuseclose', () => { F.u.reuse = false; F.render(); });
  el.querySelectorAll('[data-reuse]').forEach((x) => (x.onclick = () => { const m = legendRecipes(F)[+x.dataset.reuse]; const r = P.addMix(m, `reuse ${m.name}`); if (r.ok === false) F.toast(r.errors.join('; '), { err: true }); else { F.u.reuse = false; F.toast(`${m.name} added to your mixes.`); } F.render(); }));
  el.querySelectorAll('[data-mix]').forEach((x) => (x.onclick = (e) => { if (e.target.closest('button')) return; P.setView({ selectedMix: x.dataset.mix }); F.render(); }));
  el.querySelectorAll('[data-paint]').forEach((x) => (x.onclick = () => { const id = x.dataset.paint; P.setView({ selectedMix: id }); F.setPaint(F.u.paint && F.u.paint.mixId === id ? null : id); F.renderPanel(); }));
  el.querySelectorAll('[data-edit]').forEach((x) => (x.onclick = () => { openEditor(F, x.dataset.edit); F.render(); }));
  a('auto', () => {
    const st = P.state; const sel = [...F.u.cells].filter((id) => !(st.assignments[id] && st.assignments[id].mixId));
    const scope = sel.length ? sel.map((id) => st.cells[id]) : unassigned(F);
    const res = autoCompose({ scopeCells: scope, allCells: P.allCells(), assignments: st.assignments, mixes: st.mixes, K: F.K, brief: st.brief, links: P.links() });
    F.u.autoPreview = { ...res, scopeLabel: sel.length ? 'selected cells' : 'all cells without a mix' }; F.setPaint(null); F.render();
  });
  a('autoaccept', () => { const map = {}; for (const p of F.u.autoPreview.proposals) map[p.cellId] = p.mixId; const n = Object.keys(map).length; F.u.autoPreview = null; P.assignMany(map, { origin: 'auto' }); F.toast(`Auto compose: ${n} cells assigned, ${P.totals().plants.toLocaleString('en-US')} plants in the design (undo: ⌘Z).`); });
  a('autocancel', () => { F.u.autoPreview = null; F.render(); });
}

// ---------------------------------------------------------------- suggestions (Rules mode or a language model, same schema)
async function runSuggest(F) {
  const P = F.P; const st = P.state; const sel = [...F.u.cells]; const cells = sel.length ? sel.map((id) => st.cells[id]) : P.allCells();
  F.u.suggestion = { loading: true, scope: sel.length ? `${sel.length} selected cell${sel.length === 1 ? '' : 's'}` : `all ${cells.length} cells` }; F.render();
  const res = await F.R.suggest({ brief: st.brief, cells, prefs: st.knowledge.prefs, mixes: st.mixes });
  F.u.suggestion = { ...F.u.suggestion, loading: false, res, knowledgeVersion: F.K.version() }; if (st.staleSince) { st.staleSince = null; P.save(); } F.render();
}
function suggestionHtml(F) {
  const S = F.u.suggestion; const P = F.P;
  if (S.loading) return `<p class="task">Looking for compatible recipes for ${esc(S.scope)}…</p>`;
  let r = S.res; let h = '';
  if (r.ok === false) { h += `<div class="note warn">${esc(r.error)}. Your work is unchanged; the rules below are offered instead.</div>`; r = r.fallback; }
  h += `<p class="task">Candidate mixes for ${esc(S.scope)}. Accept one as it is, edit it first, or reject.</p><p class="f-modetag">${r.mode === 'live' ? 'Language model: ' + esc(r.model) + ' — validated against the supplied knowledge' : 'Rules mode — explicit ranking of known flowering months and pollinator groups; not a language model'}</p>`;
  if (r.target) h += `<p class="small dim">Target cells: ${r.target.cells}, ${Math.round(r.target.areaM2)} m², ${esc(r.target.light)}; ${esc(r.target.note)}</p>`;
  if (!r.recipes.length) h += `<div class="note">${esc(r.guidance || 'No recipe could be proposed.')}</div>`;
  r.recipes.forEach((rc, i) => {
    h += `<div class="cand"><h3>${esc(rc.name)}</h3>${rc.coverage ? `<div class="small">${monthStrip(rc.coverage.months, { on: P.state.brief.objectives.flowering.months })} <span class="dim">known flower months</span></div>` : ''}
      <table class="members"><tr><th>plant</th><th>role</th><th>%</th><th>flowering · source</th></tr>${rc.members.map((m) => `<tr><td>${plantName(F.store, m.plantId, { short: true })}</td><td>${esc(ROLES[m.role])}</td><td class="num">${Math.round(m.proportion * 100)}</td><td>${traitLine(F.K, F.store, m.plantId)}</td></tr>`).join('')}</table>
      <p class="small">Density ${rc.density} plants / m² (prototype assumption).</p>
      <details><summary>Rationale, gaps and unknowns</summary><ul>${rc.rationale.map((x) => `<li>${esc(x.text)}</li>`).join('')}${(rc.gaps || []).map((g) => `<li class="dim">Gap — ${esc(g)}</li>`).join('')}${(rc.unknowns || []).map((g) => `<li class="dim">Unknown — ${esc(g)}</li>`).join('')}</ul></details>
      ${rc.illustrativeMembers ? `<p class="xs" style="color:var(--f-illus)">${rc.illustrativeMembers} of ${rc.members.length} plants are ranked with illustrative (not verified) values.</p>` : ''}
      <div class="row"><button class="btn-p" data-acc="${i}">Accept</button><button class="btn-s" data-ed="${i}">Edit first</button><button class="lnk" data-rej="${i}">Reject</button></div></div>`;
  });
  if (r.uncertainCandidates && r.uncertainCandidates.length) h += `<details><summary>${r.uncertainCandidates.length} plants left out because data are missing</summary><ul class="small">${r.uncertainCandidates.map((c) => `<li>${plantName(F.store, c.plantId, { short: true })} — missing ${esc(c.missing.join(', ') || 'light fit')} <button class="lnk" data-kn="${esc(c.plantId)}">add what you know</button></li>`).join('')}</ul></details>`;
  h += `<div class="row" style="margin-top:10px"><button class="lnk" data-a="close">Back to mixes</button></div>`;
  return h;
}
function bindSuggestion(F, el) {
  if (F.u.suggestion.loading) return;
  const P = F.P; const r0 = F.u.suggestion.res; const r = r0.ok === false ? r0.fallback : r0;
  const take = (i, edit) => { const rc = r.recipes[i]; const mix = recipeToMix(rc, { id: 'mix.' + rc.key + '.' + (P.state.mixes.length + 1), colorIndex: P.state.mixes.length, origin: r0.mode === 'live' && r0.ok !== false ? 'llm' : 'rules' }); const res = P.addMix(mix, `accept ${rc.name}`); if (res.ok === false) { F.toast(res.errors.join('; '), { err: true }); return; } r.recipes.splice(i, 1); if (edit) { openEditor(F, res.id); } else if (!r.recipes.length) F.u.suggestion = null; F.toast(`${rc.name} added to your mixes${edit ? ' — editing' : ''}.`); F.render(); };
  el.querySelectorAll('[data-acc]').forEach((x) => (x.onclick = () => take(+x.dataset.acc, false)));
  el.querySelectorAll('[data-ed]').forEach((x) => (x.onclick = () => take(+x.dataset.ed, true)));
  el.querySelectorAll('[data-rej]').forEach((x) => (x.onclick = () => { r.recipes.splice(+x.dataset.rej, 1); F.render(); }));
  el.querySelectorAll('[data-kn]').forEach((x) => (x.onclick = () => { F.u.knowledgeAdd = { plantId: x.dataset.kn, text: '', parsed: null, scope: 'project', back: 'suggestion' }; F.render(); }));
  el.querySelector('[data-a=close]').onclick = () => { F.u.suggestion = null; F.render(); };
}

// ---------------------------------------------------------------- mix editor (direct edits + bounded / model edit patches)
function editorHtml(F) {
  const E = F.u.editor; const d = E.draft; const P = F.P; const uses = E.mixId ? P.usesOf(E.mixId) : [];
  const sum = sumOf(d.members); const v = validateMix({ ...d, members: d.members.length ? d.members : [] }, { knownPlant: P.knownPlant });
  let h = `<p class="task">${E.mixId ? `Editing <b>${esc(P.mix(E.mixId).name)}</b> v${P.mix(E.mixId).version}${uses.length ? ` — used in ${uses.length} cell${uses.length === 1 ? '' : 's'}` : ''}.` : 'A new mix: add plants, give each a role and a share of the plants.'}</p>`;
  h += `<div class="row"><input type="text" id="mxname" value="${esc(d.name)}" aria-label="Mix name" style="flex:1"><input type="color" id="mxcolor" value="${esc(d.color)}" aria-label="Mix colour" style="width:34px;height:30px;padding:0;border:1px solid var(--f-rule-2)"></div>`;
  h += `<table class="members" style="margin-top:8px"><tr><th>plant</th><th>role</th><th title="share of the planted individuals">% plants</th><th></th></tr>${d.members.map((m, i) => { const t = F.K.traits(m.plantId);
    return `<tr><td>${plantName(F.store, m.plantId, { short: true })}<br>${monthStrip(t.bloom.value, { unknown: t.bloom.status === 'unknown' })} ${sourceTag(t.bloom.source)}${t.bloom.status === 'conflict' || t.light.status === 'conflict' ? ' <span class="tag warn" title="sources disagree">conflict</span>' : ''}</td>
      <td><select data-role="${i}" aria-label="Role">${Object.entries(ROLES).map(([k, n]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${n}</option>`).join('')}</select></td>
      <td><input type="number" min="0.1" max="100" step="0.5" data-prop="${i}" value="${+(m.proportion * 100).toFixed(1)}" aria-label="Percent of plants"></td>
      <td><button data-rm="${i}" aria-label="Remove">${ICON.x}</button></td></tr>`; }).join('')}</table>`;
  h += `<div class="row sp small" style="margin:6px 0"><span>Total <b class="num">${(sum * 100).toFixed(1)} %</b>${Math.abs(sum - 1) > 0.001 && d.members.length ? ' — must be 100 %' : ''}</span>${Math.abs(sum - 1) > 0.001 && d.members.length ? '<button class="lnk" data-a="balance">Balance to 100 %</button>' : ''}</div>`;
  h += `<div class="row"><input type="text" id="mxadd" list="mxcat" placeholder="Add a plant: type a name" aria-label="Add a plant" style="flex:1"><datalist id="mxcat">${F.K.catalogue().map((s) => `<option value="${esc(plainName(F.store, s.id))}">`).join('')}</datalist><button class="btn-s" data-a="add">Add</button></div>`;
  h += `<div class="slider"><label for="mxdens">Density</label><input id="mxdens" type="range" min="1" max="12" step="0.5" value="${d.density.value}"><span class="num">${d.density.value} / m²</span></div><p class="dim xs">Target individuals per m² of usable cell area (prototype default ${DEFAULT_DENSITY}). Spacing uses each plant's nominal display size × role factor.</p>`;
  // natural-language edit → proposed patch
  h += `<h2>Ask for a change <span class="aside">${esc(F.R.status.live ? 'language model' : 'Rules mode')}</span></h2><textarea id="mxask" placeholder="e.g. keep the grass matrix, increase spring bloom" aria-label="Change request">${esc(E.ask || '')}</textarea><div class="row"><button class="btn-s" data-a="propose">Propose a change</button></div>`;
  if (E.proposal) {
    const pr = E.proposal;
    if (!pr.ok) h += `<div class="note warn">${esc(pr.error)}</div>`;
    else { const before = new Map(d.members.map((m) => [m.plantId, m.proportion])); const after = new Map(pr.proposed.members.map((m) => [m.plantId, m.proportion]));
      h += `<div class="cand diff"><h3>Proposed patch</h3><p class="xs dim">${esc(pr.method || '')}</p><ul>${pr.matched.map((x) => `<li>${esc(x)}</li>`).join('')}</ul><ul>${[...new Set([...before.keys(), ...after.keys()])].map((id) => { const b = before.get(id), a = after.get(id); return b == null ? `<li class="add">+ ${plantName(F.store, id, { short: true })} ${Math.round(a * 100)} %</li>` : a == null ? `<li class="rem">− ${plantName(F.store, id, { short: true })}</li>` : Math.abs(a - b) > 0.0005 ? `<li>${plantName(F.store, id, { short: true })} ${Math.round(b * 100)} → ${Math.round(a * 100)} %</li>` : ''; }).join('')}</ul><div class="row"><button class="btn-s" data-a="applyprop">Apply to this draft</button><button class="lnk" data-a="dropprop">Discard</button></div></div>`; }
  }
  h += `<details><summary>Evidence and knowledge for each plant</summary>${d.members.map((m) => evidenceHtml(F, m.plantId)).join('')}</details>`;
  if (!v.ok && d.members.length) h += `<p class="small" style="color:var(--f-warn)">${esc(v.errors.join('; '))}</p>`;
  // save choices
  if (E.save) {
    const pv = E.save.preview; h += `<div class="cand"><h3>Save changes to a shared mix</h3><p class="small">${uses.length} cell${uses.length === 1 ? '' : 's'} use this mix: ${pv.before.toLocaleString('en-US')} plants now → <b>${pv.after.toLocaleString('en-US')}</b> after the change (only these cells are rearranged).</p>${perfDelta(pv)}
      <div class="row"><button class="btn-p" data-a="saveall">Update all ${uses.length} cells</button>${E.save.selUses.length ? `<button class="btn-s" data-a="savevar">Local variant for ${E.save.selUses.length} selected cell${E.save.selUses.length === 1 ? '' : 's'}</button>` : ''}<button class="lnk" data-a="savecancel">Back</button></div>${E.save.selUses.length ? '' : '<p class="dim xs">To make a local variant, select the cells that should change first (other cells keep the shared mix).</p>'}</div>`;
  } else h += `<div class="row" style="margin-top:12px"><button class="btn-p" data-a="save" ${!v.ok ? 'disabled' : ''}>${E.mixId ? 'Save changes' : 'Save mix'}</button><button class="lnk" data-a="cancel">Cancel</button>${E.mixId && !uses.length ? '<button class="lnk" data-a="delete" style="margin-left:auto">Delete mix</button>' : ''}</div>`;
  return h;
}
function perfDelta(pv) {
  if (!pv.perfBefore || !pv.perfAfter) return '';
  const rows = Object.keys(pv.perfAfter.months).filter((m) => { const a = pv.perfBefore.months[m], b = pv.perfAfter.months[m]; return a.resourceCells !== b.resourceCells || a.groups !== b.groups; });
  if (!rows.length) return '<p class="small dim">Flower-resource months and pollinator groups: no change.</p>';
  return `<p class="small">Resource cells by month (before → after): ${rows.map((m) => `${MONTHS[m - 1]} ${pv.perfBefore.months[m].resourceCells}→${pv.perfAfter.months[m].resourceCells}${pv.perfBefore.months[m].groups !== pv.perfAfter.months[m].groups ? ` (groups ${pv.perfBefore.months[m].groups}→${pv.perfAfter.months[m].groups})` : ''}`).join(', ')}.</p>`;
}
function evidenceHtml(F, id) {
  const t = F.K.traits(id); const row = (lab, tr, fmt) => `<tr><td class="dim">${lab}</td><td>${tr.status === 'unknown' ? '<span class="tag unk">unknown</span>' : esc(fmt(tr.value))} ${sourceTag(tr.source)}${tr.alternatives && tr.alternatives.length ? tr.alternatives.map((a) => ` <span class="small dim">or ${esc(fmt(a.value))} (${esc(a.scope)})</span> <button class="lnk xs" data-src="${esc(id)}|${lab === 'flowering' ? 'bloom' : lab}|${a.scope}">use this</button>`).join('') : ''}${tr.evidence && tr.evidence[0] ? `<br><span class="xs dim">${esc((tr.evidence[0].statement || '').slice(0, 160))}</span>` : ''}</td></tr>`;
  return `<div style="border-top:1px solid var(--f-rule);padding:6px 0"><div class="row sp"><span>${plantName(F.store, id)}</span><button class="lnk xs" data-kn="${esc(id)}">add what you know</button></div><table class="members">${row('flowering', t.bloom, (v) => v.map((m) => MONTHS[m - 1]).join(' '))}${row('pollinators', t.pollinators, (v) => v.join(', '))}${row('light', t.light, (v) => v.join(' / '))}${row('moisture', t.moisture, (v) => v.join(' / '))}</table>${t.visitors ? `<p class="xs dim">${esc(t.visitors.note)} (${t.visitors.taxa} taxa)</p>` : ''}${t.proxy ? '<p class="xs dim">Added in this project: generic display proxy for size and form.</p>' : ''}</div>`;
}
function bindEditor(F, el) {
  const E = F.u.editor; const d = E.draft; const P = F.P;
  const a = (k, fn) => el.querySelectorAll(`[data-a=${k}]`).forEach((x) => (x.onclick = fn));
  el.querySelector('#mxname').onchange = (e) => { d.name = e.target.value.trim() || d.name; };
  el.querySelector('#mxcolor').onchange = (e) => { d.color = e.target.value; };
  el.querySelectorAll('[data-role]').forEach((x) => (x.onchange = () => { d.members[+x.dataset.role].role = x.value; }));
  el.querySelectorAll('[data-prop]').forEach((x) => (x.onchange = () => { d.members[+x.dataset.prop].proportion = Math.max(0.001, (+x.value || 0) / 100); F.renderPanel(); }));
  el.querySelectorAll('[data-rm]').forEach((x) => (x.onclick = () => { d.members.splice(+x.dataset.rm, 1); F.renderPanel(); }));
  a('balance', () => { d.members = normalize(d.members); F.renderPanel(); });
  const add = () => {
    const v = el.querySelector('#mxadd').value.trim(); if (!v) return;
    const id = F.K.catalogue().find((s) => plainName(F.store, s.id).toLowerCase() === v.toLowerCase())?.id || findPlant(v, F.K.catalogue());
    if (!id) { F.u.knowledgeAdd = { newPlant: v, text: '', parsed: null, scope: 'project', back: 'editor' }; F.render(); return; }
    if (d.members.some((m) => m.plantId === id)) { F.toast('Already in the mix.'); return; }
    d.members.push({ plantId: id, role: guessRole(F, id), proportion: d.members.length ? 0.1 : 1, constraints: {}, why: [] }); F.renderPanel();
  };
  a('add', add); el.querySelector('#mxadd').onkeydown = (e) => { if (e.key === 'Enter') add(); };
  const dens = el.querySelector('#mxdens'); dens.oninput = () => (dens.nextElementSibling.textContent = dens.value + ' / m²'); dens.onchange = () => { d.density = { ...d.density, value: +dens.value }; };
  a('propose', async () => { E.ask = el.querySelector('#mxask').value; if (!d.members.length) { F.toast('Add plants first.'); return; } const r = await F.R.edit({ text: E.ask, mix: { ...d, members: normalize(d.members) }, brief: P.state.brief }); if (r.ok && !r.proposed && r.changes) r.proposed = editMix({ ...d, members: normalize(d.members) }, r.changes, 'model edit'); E.proposal = r; F.renderPanel(); });
  a('applyprop', () => { E.draft.members = E.proposal.proposed.members.map((m) => ({ ...m })); E.draft.density = E.proposal.proposed.density; E.draft._edits = [...(E.draft._edits || []), ...(E.proposal.matched || [])]; E.proposal = null; F.renderPanel(); });
  a('dropprop', () => { E.proposal = null; F.renderPanel(); });
  el.querySelectorAll('[data-kn]').forEach((x) => (x.onclick = () => { F.u.knowledgeAdd = { plantId: x.dataset.kn, text: '', parsed: null, scope: 'project', back: 'editor' }; F.render(); }));
  el.querySelectorAll('[data-src]').forEach((x) => (x.onclick = () => { const [pid, attr, src] = x.dataset.src.split('|'); P.chooseSource(pid, attr, src); F.toast(`For this project, ${attr} of ${plainName(F.store, pid)} now comes from ${src}.`); F.renderPanel(); }));
  a('cancel', () => { F.u.editor = null; F.render(); });
  a('delete', () => { const r = P.deleteMix(E.mixId); if (r.ok === false) F.toast(r.error, { err: true }); else { F.u.editor = null; F.render(); } });
  a('save', () => {
    const v = validateMix(d, { knownPlant: P.knownPlant }); if (!v.ok) { F.toast(v.errors.join('; '), { err: true }); return; }
    const summary = (d._edits && d._edits.length ? d._edits.join('; ') : 'edited in the mix editor');
    if (!E.mixId) { const { _edits, ...clean } = d; const r = P.addMix({ ...clean, history: [{ version: 1, at: new Date().toISOString(), summary: 'created' }] }, `create ${d.name}`); if (r.ok === false) { F.toast(r.errors.join('; '), { err: true }); return; } F.u.editor = null; F.toast(`${d.name} saved. Paint it into cells or use Auto compose.`); F.render(); return; }
    const cur = P.mix(E.mixId); const next = { ...editMix(cur, [], summary), name: d.name, color: d.color, members: d.members.map((m) => ({ ...m })), density: { ...cur.density, value: d.density.value } };
    const uses = P.usesOf(E.mixId);
    if (!uses.length) { P.applyMixEdit(E.mixId, next, { scope: 'all' }); F.u.editor = null; F.toast(`${next.name} v${next.version} saved.`); F.render(); return; }
    E.save = { next, preview: P.previewMixEdit(E.mixId, next), selUses: [...F.u.cells].filter((c) => uses.includes(c)) }; F.renderPanel();
    const box = [...F.panel.querySelectorAll('.cand')].pop(); if (box) box.scrollIntoView({ block: 'nearest' });
  });
  a('saveall', () => { const r = P.applyMixEdit(E.mixId, E.save.next, { scope: 'all' }); if (r.ok === false) { F.toast(r.errors.join('; '), { err: true }); return; } const n = E.save.next; F.u.editor = null; F.toast(`${n.name} v${n.version}: ${P.usesOf(n.id).length} cells rearranged; other cells unchanged.`); F.render(); });
  a('savevar', () => { const sel = E.save.selUses; const r = P.applyMixEdit(E.mixId, E.save.next, { scope: 'variant', cells: sel }); if (r.ok === false) { F.toast(r.errors.join('; '), { err: true }); return; } F.u.editor = null; F.toast(`Local variant applied to ${sel.length} cell${sel.length === 1 ? '' : 's'}; the shared mix and its other cells are unchanged.`); F.render(); });
  a('savecancel', () => { E.save = null; F.renderPanel(); });
}

// ---------------------------------------------------------------- scoped knowledge from the design (review before save)
function knowledgeHtml(F) {
  const A = F.u.knowledgeAdd; const P = F.P;
  let h = `<p class="task">${A.newPlant ? `<b>${esc(A.newPlant)}</b> is not in the catalogue. Add it as a new plant with what you know.` : `Add what you know about ${plantName(F.store, A.plantId)}.`} Your words are kept; the claims below are what the tool will use.</p>`;
  if (A.newPlant) h += `<div class="row small"><label>Type <select id="knType">${['forb', 'grass', 'sedge', 'shrub', 'bulb', 'fern'].map((t) => `<option ${A.plantType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>Spread (m) <input type="number" id="knSpread" step="0.1" min="0.1" max="3" value="${A.spread || ''}" placeholder="unknown" style="width:70px"></label></div><p class="xs dim">Without a spread, a generic 0.5 m proxy is used and labelled.</p>`;
  h += `<textarea id="kntext" placeholder="e.g. In my garden it flowers from May to June and bumblebees visit it; it does well in part shade.">${esc(A.text)}</textarea><div class="row"><button class="btn-s" data-a="read">Read my note</button><span class="f-modetag">Rules mode: month, group, light and moisture words</span></div>`;
  const c = A.claims || {};
  h += `<h2>Claims to save</h2><p class="small">Flowering months</p><div class="chips">${MONTHS.map((m, i) => `<label class="chip xs"><input type="checkbox" data-km="${i + 1}" ${c.bloom && c.bloom.includes(i + 1) ? 'checked' : ''}> ${m}</label>`).join('')}</div>
    <p class="small">Pollinator groups</p><div class="chips">${GROUPS.map((g) => `<label class="chip xs"><input type="checkbox" data-kg="${g}" ${c.pollinators && c.pollinators.includes(g) ? 'checked' : ''}> ${g}</label>`).join('')}</div>
    <p class="small">Light</p><div class="chips">${['sun', 'part', 'shade'].map((g) => `<label class="chip xs"><input type="checkbox" data-kl="${g}" ${c.light && c.light.includes(g) ? 'checked' : ''}> ${g}</label>`).join('')}</div>
    <p class="small">Preference (not a fact)</p><div class="chips">${['none', 'favour', 'avoid'].map((g) => `<label class="chip xs"><input type="radio" name="kpref" value="${g}" ${(A.preference || 'none') === g ? 'checked' : ''}> ${g}</label>`).join('')}</div>
    ${A.parsedNote ? `<p class="xs dim">${esc(A.parsedNote)}</p>` : ''}
    <h2>Scope</h2><div class="objs">
      <label><input type="radio" name="kscope" value="project" ${A.scope === 'project' ? 'checked' : ''}><span><b>This project</b></span><span class="sub">Used by suggestions and metrics of this design; saved with the project</span></label>
      <label><input type="radio" name="kscope" value="personal" ${A.scope === 'personal' ? 'checked' : ''} ${A.newPlant || !F.library.kb ? 'disabled' : ''}><span><b>My knowledge (all projects)</b></span><span class="sub">${A.newPlant ? 'New plants stay in the project for now' : 'Saved to your personal notebook, visible in Knowledge; scope Detroit'}</span></label>
      <label><input type="radio" name="kscope" value="mix" ${A.scope === 'mix' ? 'checked' : ''} ${A.newPlant ? 'disabled' : ''}><span><b>Note on this mix only</b></span><span class="sub">Kept with the mix rationale; not used in calculations</span></label></div>
    <p class="xs dim">Saved as your observation (not verified). Committed mixes and plants do not change; suggestions and metrics are re-evaluated.</p>
    <div class="row"><button class="btn-p mine" data-a="save">Save</button><button class="lnk" data-a="cancel">Cancel</button></div>`;
  return h;
}
function bindKnowledge(F, el) {
  const A = F.u.knowledgeAdd; const P = F.P; A.claims = A.claims || {};
  const collect = () => { A.text = el.querySelector('#kntext').value; A.claims = { bloom: [...el.querySelectorAll('[data-km]:checked')].map((x) => +x.dataset.km), pollinators: [...el.querySelectorAll('[data-kg]:checked')].map((x) => x.dataset.kg), light: [...el.querySelectorAll('[data-kl]:checked')].map((x) => x.dataset.kl) }; A.preference = (el.querySelector('[name=kpref]:checked') || {}).value; A.scope = (el.querySelector('[name=kscope]:checked') || {}).value || 'project'; if (A.newPlant) { A.plantType = el.querySelector('#knType').value; A.spread = +el.querySelector('#knSpread').value || null; } };
  el.querySelector('[data-a=read]').onclick = () => { collect(); const r = parseNote(A.text, F.K.catalogue()); for (const c of r.claims) A.claims[c.attr === 'bloom' ? 'bloom' : c.attr] = c.value; if (r.preference) A.preference = r.preference; A.parsedNote = r.claims.length || r.preference ? `Read: ${r.matched.join(', ') || 'preference words'} — check and correct below.` : 'Nothing recognised: tick the claims yourself.'; F.renderPanel(); };
  el.querySelector('[data-a=cancel]').onclick = () => { const back = A.back; F.u.knowledgeAdd = null; if (back !== 'editor' && back !== 'suggestion') { /* back to palette */ } F.render(); };
  el.querySelector('[data-a=save]').onclick = async () => {
    collect(); const claims = []; if (A.claims.bloom.length) claims.push({ attr: 'bloom', value: A.claims.bloom }); if (A.claims.pollinators.length) claims.push({ attr: 'pollinators', value: A.claims.pollinators }); if (A.claims.light.length) claims.push({ attr: 'light', value: A.claims.light });
    const pref = A.preference && A.preference !== 'none' ? A.preference : null;
    if (!claims.length && !pref && !A.newPlant) { F.toast('Tick at least one claim or a preference — or cancel.'); return; }
    let pid = A.plantId;
    if (A.newPlant) { const r = P.addPlant({ name: A.newPlant, plantType: A.plantType || 'forb', spreadM: A.spread, original: A.text }); if (r.ok === false) { F.toast(r.error, { err: true }); return; } pid = r.id; }
    if (A.scope === 'personal') {
      const lib = F.library; const out = [];
      if (A.claims.bloom.length) out.push(await lib.addRecord({ spId: pid, kind: 'bloom', value: A.claims.bloom, note: A.text }));
      if (A.claims.pollinators.length) out.push(await lib.addRecord({ spId: pid, kind: 'pollinators', value: A.claims.pollinators, note: A.text }));
      if (A.claims.light.length) out.push(await lib.addRecord({ spId: pid, kind: 'exposure', value: A.claims.light.map((l) => ({ sun: 'exposure:full_sun', part: 'exposure:part_shade', shade: 'exposure:shade' }[l])), note: A.text }));
      if (!claims.length && A.text.trim()) out.push(await lib.addRecord({ spId: pid, kind: 'note', value: A.text }));
      const bad = out.find((r) => !r.ok); if (bad) { F.toast('Not saved to your knowledge: ' + bad.error, { err: true }); return; }
      if (pref) P.addProjectKnowledge({ plantId: pid, preference: pref, original: A.text, label: 'add preference' });
      F.K.invalidate('personal'); P.recompute();
      F.toast(`Saved to your knowledge (${out.length} record${out.length === 1 ? '' : 's'}, visible in Knowledge). Committed mixes and plants are unchanged; metrics recomputed.`, { ms: 6500 });
    } else if (A.scope === 'mix') {
      const ed = F.u.editor; if (ed) ed.draft.rationale = [...(ed.draft.rationale || []), { text: `Note on ${plainName(F.store, pid)}: ${A.text}`, refs: [] }];
      F.toast('Kept as a note on this mix (not used in calculations).');
    } else {
      P.addProjectKnowledge({ plantId: pid, claims, preference: pref, original: A.text }); F.K.invalidate('project');
      F.toast(`Saved to this project${A.newPlant ? ` with the new plant ${A.newPlant}` : ''}. Committed mixes and plants are unchanged; metrics recomputed — suggest again to compare.`, { ms: 6500 });
    }
    if (A.back === 'editor' && F.u.editor && A.newPlant && !F.u.editor.draft.members.some((m) => m.plantId === pid)) F.u.editor.draft.members.push({ plantId: pid, role: guessRole(F, pid), proportion: 0.1, constraints: {}, why: [] });
    F.P.state.staleSince = F.P.state.staleSince || { why: 'knowledge', at: new Date().toISOString() };
    F.u.knowledgeAdd = null; if (A.back === 'suggestion') F.u.suggestion = null; F.render();
  };
}

// ---------------------------------------------------------------- inspector: only on selection
export function inspector(F) {
  const P = F.P, st = P.state; const ids = [...F.u.cells].filter((id) => st.cells[id]); if (!ids.length) return null;
  if (ids.length > 1) { const area = ids.reduce((a, id) => a + st.cells[id].areaM2, 0); const asg = ids.filter((id) => st.assignments[id] && st.assignments[id].mixId).length; const sm = st.view.selectedMix && P.mix(st.view.selectedMix);
    return `<h3>${ids.length} cells</h3><p class="small">${Math.round(area)} m², ${asg} with a mix. Shift-click adds or removes cells.</p><div class="row">${sm ? `<button class="btn-s" data-i="assign">Assign ${esc(sm.name)}</button>` : ''}<button class="lnk" data-i="clear">Clear</button><button class="lnk" data-i="empty">Leave empty</button></div>`; }
  const c = st.cells[ids[0]]; const a = st.assignments[c.id]; const inst = st.instances[c.id]; const cd = c.conditions || {}; const mix = a && a.mixId ? P.mix(a.mixId) : null;
  let h = `<h3>Cell ${esc(c.label)}</h3><p class="xs dim">${esc(c.logic)} · ${c.areaM2} m² · ${c.neighbors.length} neighbours</p>`;
  h += `<dl class="kv"><dt>Tree crown</dt><dd>${esc(cd.canopy ? (cd.canopy.status === 'unknown' ? 'unknown' : `${cd.canopy.status}${cd.canopy.fraction ? ` (${Math.round(cd.canopy.fraction * 100)} %)` : ''}`) : '—')}</dd><dt>Path edge</dt><dd>${cd.pathEdge != null ? pct(cd.pathEdge) + ' within 1 m of a path' : '—'}</dd><dt>Elevation</dt><dd class="num">${cd.elevation && cd.elevation.min != null ? `${cd.elevation.min}–${cd.elevation.max} m` : '—'}</dd><dt>Sun, moisture, pH</dt><dd class="dim">no data</dd></dl>`;
  if (mix) {
    const comp = compatibility(c, mix, F.K); const over = (a.overrides || []).length;
    h += `<hr style="margin:8px 0"><p><span class="sw" style="display:inline-block;width:10px;height:10px;background:${esc(mix.color)}"></span> <b>${esc(mix.name)}</b> v${a.mixVersion} <span class="tag">${esc(a.origin)}</span></p>`;
    if (inst) { const top = Object.entries(inst.placed).filter(([, n]) => n).sort((x, y) => y[1] - x[1]); h += `<p class="small">${inst.plants.length} of ${inst.target} plants placed (${(inst.plants.length / c.areaM2).toFixed(1)} / m²).</p><ul class="small" style="margin:2px 0;padding-left:16px">${top.slice(0, 6).map(([id, n]) => `<li>${plantName(F.store, id, { short: true })} ${n}${inst.requested[id] !== n ? ` <span class="dim">of ${inst.requested[id]}</span>` : ''}</li>`).join('')}${top.length > 6 ? `<li class="dim">+ ${top.length - 6} more</li>` : ''}</ul>${inst.notes.map((n) => `<p class="xs dim">${esc(n)}</p>`).join('')}`; }
    if (comp.soft.length) h += `<div class="note warn"><b>Light conflict</b> — ${comp.soft.map((s) => esc(s.msg)).join('; ')}. <span class="xs">${esc(comp.soft[0].basis)}</span>${over ? '<br>Kept by you (override recorded).' : `<br><button class="lnk" data-i="override">Keep anyway</button>`}</div>`;
    if (comp.unknown.some((x) => x.attr === 'light')) h += `<p class="xs dim">Light fit unknown for ${comp.unknown.filter((x) => x.attr === 'light').length} plant(s).</p>`;
    h += `<div class="row"><button class="lnk" data-i="edit">Edit mix</button><button class="lnk" data-i="reseed">New arrangement</button><button class="lnk" data-i="clear">Clear</button></div>`;
  } else h += `<p class="small">${st.acknowledged[c.id] ? 'Left empty on purpose.' : 'No mix yet.'}</p>`;
  if (st.mixes.length) h += `<div class="row small"><label>${mix ? 'Replace with' : 'Assign'} <select data-i="replace"><option value="">choose a mix…</option>${st.mixes.filter((m) => !mix || m.id !== mix.id).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>${!mix && !st.acknowledged[c.id] ? '<button class="lnk" data-i="empty">Leave empty</button>' : ''}</div>`;
  return h;
}
export function bindInspector(F, el) {
  const P = F.P; const ids = [...F.u.cells]; const a = (k, fn) => { const x = el.querySelector(`[data-i=${k}]`); if (x) x[x.tagName === 'SELECT' ? 'onchange' : 'onclick'] = fn; };
  a('assign', () => P.assign(ids, P.state.view.selectedMix)); a('clear', () => P.clearCells(ids)); a('empty', () => P.clearCells(ids, { empty: true }));
  a('reseed', () => P.reseed(ids[0])); a('edit', () => { const m = P.state.assignments[ids[0]].mixId; openEditor(F, m); F.render(); });
  a('override', () => { const c = P.state.cells[ids[0]]; const m = P.mix(P.state.assignments[c.id].mixId); P.overrideConflict(c.id, compatibility(c, m, F.K).soft.map((s) => ({ type: s.attr, plantId: s.plantId }))); F.toast('Kept: the conflict stays visible in Explore as an accepted override.'); });
  a('replace', (e) => { if (e.target.value) P.assign(ids, e.target.value); });
}
