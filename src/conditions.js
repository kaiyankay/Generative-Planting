// Conditions panel: the computational space of the selected beds, shown in the same canvas (Plan or Axo).
// Scope = one bed, several beds (shift-click) or every bed open to design. One thing is drawn at a time:
// a field in bands no finer than its accuracy, or the zones of the current conditions. Nothing here reads the planting.
import { TOK, rgba, fieldRamp, rampSteps, ZONE_RAMP } from './style.js';
import { zoneStyle } from './paint.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SHOWN = ['field.elevation', 'field.slope', 'field.distance-to-path', 'field.distance-to-edge', 'field.distance-to-obstacle', 'field.canopy'];
const MAX_UI_RULES = 3;

export function createConditions(ctx) {
  const { store, cs, st, app } = ctx;
  const el = document.getElementById('conditions');
  const A = (st.an = {
    open: false, scope: [], show: null, field: null, point: null, dist: null, last: null, minRegion: 0,
    rules: cs.config.experiments.twoConditions.map((r) => ({ field: r.field, breaks: r.breaks.slice(0, 1) })),
  });
  const unitOf = (f) => (f.units === '°' ? '°' : f.units ? ' ' + f.units : '');
  const num = (f, v, extra = 0) => (v == null ? '—' : (+v).toFixed(Math.max(0, (f.decimals ?? 2) + extra)));
  const short = (id) => id.replace(/^bed\./, '');

  function open(scope = A.scope, { silent = false } = {}) {
    const sc = cs.resolveScope(scope);
    if (!sc.ok) return sc;
    A.open = true; el.hidden = false; app.classList.add('cond-open');
    document.getElementById('inspector').hidden = true;
    setScope(sc.bedIds, { silent: true });
    if (!silent) ctx.emit('conditions', state());
    return { ok: true, scope: A.scope.slice() };
  }
  function close() {
    A.open = false; A.show = null; A.point = null; el.hidden = true; app.classList.remove('cond-open');
    cs.hoverKey = null; cs.setDisplay({ mode: null, field: null, scope: [] });
    ctx.afterClose && ctx.afterClose();
    ctx.syncUrl(); ctx.emit('conditions', state());
    return true;
  }
  function setScope(ids, { silent = false } = {}) {
    const sc = cs.resolveScope(ids); if (!sc.ok) return sc;
    A.scope = sc.bedIds;
    A.dist = cs.distribution(A.scope, { bins: 10 });
    recompute();
    cs.setDisplay({ scope: A.scope.slice(), mode: A.show, field: A.field });
    render(); ctx.syncUrl();
    if (!silent) ctx.emit('conditions', state());
    return { ok: true, scope: A.scope.slice() };
  }
  function toggleBed(id) {
    const has = A.scope.includes(id);
    const next = has ? A.scope.filter((b) => b !== id) : [...A.scope, id];
    if (!next.length) return close();
    return setScope(next);
  }
  function show(mode, field = null) {
    if (mode === 'field' && !cs.field(field)) return false;
    A.show = mode || null; A.field = mode === 'field' ? field : null;
    if (A.show === 'zones') recompute();
    cs.setDisplay({ mode: A.show, field: A.field, scope: A.scope.slice() });
    render(); ctx.syncUrl(); ctx.emit('conditions', state());
    return true;
  }
  function setRules(rules) {
    if (!Array.isArray(rules) || !rules.length || rules.length > MAX_UI_RULES) return { ok: false, error: `1–${MAX_UI_RULES} conditions` };
    for (const r of rules) if (!r || !cs.field(r.field)) return { ok: false, error: 'unknown field ' + (r && r.field) };
    A.rules = rules.map((r) => ({ field: r.field, breaks: (Array.isArray(r.breaks) ? r.breaks : [r.breaks]).map(Number) }));
    const res = recompute(); render(); ctx.syncUrl(); ctx.emit('conditions', state());
    return res;
  }
  function recompute() {
    if (!A.scope.length) { A.last = null; return null; }
    A.last = cs.run(A.scope, { rules: A.rules, minRegionM2: A.minRegion });
    return A.last;
  }
  function state() {
    const c = A.last;
    return { open: A.open, scope: A.scope.slice(), show: A.show, field: A.field, rules: A.rules.map((r) => ({ field: r.field, breaks: r.breaks.slice() })), computation: c && c.ok ? { id: c.id, zones: c.zones.length, summary: c.summary, notes: c.notes } : null, point: A.point };
  }
  function setPoint(at) { A.point = at ? { x: at[0], y: at[1] } : null; renderPoint(); }

  // ---------------------------------------------------------------- rendering
  function histSvg(f, d, { w = 92, h = 18, mark = null, colored = false } = {}) {
    const H = d && d.histogram; if (!H || H.categorical) return '';
    const max = Math.max(...H.areaM2) || 1; const n = H.areaM2.length; const bw = w / n;
    const bands = colored && A.show === 'field' && A.field === f.id ? cs.displayCells() : null;
    let s = `<svg class="hist" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`;
    H.areaM2.forEach((a, k) => {
      const bh = a > 0 ? Math.max(1.5, (a / max) * (h - 2)) : 0; if (!bh) return;
      const mid = (H.edges[k] + H.edges[k + 1]) / 2;
      const col = bands && bands.bands ? bandColor(f, bands.bands, mid) : rgba(TOK.ink, 0.5);
      s += `<rect x="${(k * bw + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${col}"/>`;
    });
    if (mark != null && d.max > d.min) { const x = Math.max(0.5, Math.min(w - 0.5, ((mark - d.min) / (d.max - d.min)) * w)); s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="0" y2="${h}" stroke="${TOK.inkDeep}" stroke-width="1.5"/>`; }
    return s + '</svg>';
  }
  function bandColor(f, bands, v) {
    const R = fieldRamp(f.id, f.hypothetical);
    if (bands.uniform) return R[3];
    const k = Math.min(bands.n - 1, Math.max(0, Math.floor((v - bands.lo) / bands.step + 1e-9)));
    return rampSteps(R, bands.n)[k];
  }
  function zoneSwatch(cmp, key, k) {
    const z = zoneStyle(cmp, key); const id = `zs${k}`;
    const pat = z.hatch === 0 ? '' : `<pattern id="${id}h" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="${z.hatch === -1 ? TOK.inkSoft : TOK.inkDeep}" stroke-width="1"/>${z.hatch !== 1 ? `<line x1="0" y1="0" x2="5" y2="0" stroke="${z.hatch === -1 ? TOK.inkSoft : TOK.inkDeep}" stroke-width="1"/>` : ''}</pattern>`;
    const dot = z.dots === 0 ? '' : `<pattern id="${id}d" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="0.9" fill="${z.dots === -1 ? TOK.inkSoft : TOK.inkDeep}"/></pattern>`;
    return `<svg class="zsw" viewBox="0 0 22 16" width="22" height="16" aria-hidden="true"><defs>${pat}${dot}</defs><rect x="0.5" y="0.5" width="21" height="15" rx="2" fill="${z.fill}" stroke="${rgba(TOK.inkDeep, 0.35)}"/>${pat ? `<rect x="0.5" y="0.5" width="21" height="15" rx="2" fill="url(#${id}h)" opacity=".7"/>` : ''}${dot ? `<rect x="0.5" y="0.5" width="21" height="15" rx="2" fill="url(#${id}d)"/>` : ''}</svg>`;
  }
  function fieldLegend(f) {
    const dc = cs.displayCells(); if (!dc || !dc.bands) return '';
    const b = dc.bands; const R = fieldRamp(f.id, f.hypothetical); const u = unitOf(f);
    if (f.categorical) return `<div class="flegend"><span class="chip"><i style="--c:${R[4]}"></i>under a tree crown</span><span class="chip"><i style="--c:${TOK.paper}"></i>open</span></div>`;
    if (b.uniform) return `<div class="flegend"><span class="chip"><i style="--c:${R[3]}"></i>${num(f, b.lo)}–${num(f, b.hi)}${u}</span></div><p class="note">Uniform: it varies less than the data's accuracy (${f.tolerance}${u}), so it is drawn as one band.</p>`;
    const cols = rampSteps(R, b.n);
    return `<div class="fbar">${cols.map((c, k) => `<span style="--c:${c}" title="${num(f, b.lo + k * b.step)}–${num(f, Math.min(b.hi, b.lo + (k + 1) * b.step))}${u}"></span>`).join('')}</div><div class="fbar-l"><span>${num(f, b.lo)}${u}</span><span>${num(f, b.hi)}${u}</span></div><p class="note">${b.n} bands of ${+b.step.toFixed(3)}${u}: never finer than the data's accuracy (${f.tolerance}${u}).</p>`;
  }
  function render() {
    if (!A.open) return;
    const D = A.dist; const area = D && D.ok ? D.areaM2 : 0;
    const dom = cs.domain(A.scope);
    const fieldRow = (f) => {
      const d = D.fields[f.id]; const on = A.show === 'field' && A.field === f.id; const u = unitOf(f);
      if (!d || !d.known) return `<li class="frow na"><span class="fname">${esc(f.short || f.name)}</span><span class="na">no data</span></li>`;
      const crown = f.categorical ? d.histogram.classes.find((c) => c.value === 1)?.areaM2 || 0 : 0;
      const rng = f.categorical ? (crown ? `${crown.toFixed(0)} m² under` : 'none here') : `${num(f, d.min)}–${num(f, d.max)}${u}`;
      return `<li class="frow${on ? ' on' : ''}"><label><input type="radio" name="cshow" value="field:${esc(f.id)}" ${on ? 'checked' : ''}><span class="fname" title="${esc(f.method || f.note || '')}">${esc(f.short || f.name)}${f.hypothetical ? ' <span class="tag hyp">hypothetical</span>' : ''}</span><span class="frange">${rng}</span>${d.uniform ? '<span class="tag uni" title="Varies less than the data\'s accuracy: a histogram here would only show noise">uniform</span>' : histSvg(f, d, { colored: true })}</label>${on ? fieldLegend(f) : ''}</li>`;
    };
    const fs = cs.fields();
    const shownF = fs.filter((f) => SHOWN.includes(f.id));
    const unknown = fs.filter((f) => f.status === 'unknown');
    const hyp = fs.filter((f) => f.hypothetical);
    const c = A.last && A.last.ok ? A.last : null;
    const ruleRow = (r, k) => {
      const f = cs.field(r.field); const d = D.fields[r.field]; const u = unitOf(f);
      const opts = fs.filter((q) => !q.categorical).map((q) => `<option value="${esc(q.id)}" ${q.id === r.field ? 'selected' : ''}>${esc(q.short || q.name)}${q.status === 'unknown' ? ' (no data)' : q.hypothetical ? ' (hypothetical)' : ''}</option>`).join('');
      const known = d && d.known; const lo = known ? d.min : 0, hi = known ? d.max : 1; const step = Math.max(10 ** -((f.decimals ?? 2) + 1), (hi - lo) / 200 || 0.01);
      const rr = c ? c.rules[k] : null;
      return `<div class="rule" data-k="${k}">
        <div class="rtop"><select data-rf="${k}" aria-label="Condition ${k + 1} field">${opts}</select>${known ? `<span class="split">split at</span><input type="number" data-rn="${k}" value="${r.breaks[0]}" step="${(+step.toPrecision(1))}" aria-label="${esc(f.short || f.name)} threshold"><span class="u">${esc(u.trim())}</span>` : '<span class="na">no data</span>'}${A.rules.length > 1 ? `<button class="icon rx" data-rx="${k}" aria-label="Remove condition ${k + 1}"><svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button>` : ''}</div>
        ${known ? `<div class="rhist">${histSvg(f, d, { w: 248, h: 26, mark: r.breaks[0] })}<input type="range" data-rs="${k}" min="${lo}" max="${hi}" step="${step}" value="${Math.max(lo, Math.min(hi, r.breaks[0]))}" aria-label="${esc(f.short || f.name)} threshold slider"></div>
        <div class="rlab"><span>${num(f, lo)}${u}</span><span>${rr ? (rr.uniformIn.length === A.scope.length ? 'uniform here: no split' : rr.uniformIn.length ? `uniform in ${rr.uniformIn.map(short).join(', ')}` : '') : ''}</span><span>${num(f, hi)}${u}</span></div>` : ''}
      </div>`;
    };
    const zoneRows = c ? c.summary.map((z, k) => `<li class="zrow" data-key="${esc(z.key)}">${zoneSwatch(c, z.key, k)}<span class="zl">${esc(z.label)}</span><span class="za">${z.areaM2.toFixed(1)} m²<small>${(z.share * 100).toFixed(0)}%${A.scope.length > 1 ? ` · ${z.beds.length} bed${z.beds.length === 1 ? '' : 's'}` : ''}</small></span></li>`).join('') : '';
    const perBed = c && A.scope.length > 1 ? `<details class="perbed"><summary>Per bed</summary><table><tbody>${A.scope.map((b) => `<tr><th>${esc(short(b))}</th><td>${c.splits[b] || 0} zone${c.splits[b] === 1 ? '' : 's'}</td><td>${c.zones.filter((z) => z.bedId === b).map((z) => `${(z.shareOfBed * 100).toFixed(0)}%`).join(' / ')}</td></tr>`).join('')}</tbody></table></details>` : '';
    const hidden = st.filter !== 'all';
    const draft = store.draftInfo();
    el.innerHTML = `<div class="c-head"><h2 id="condTitle">Conditions</h2><button class="icon x" data-a="close" aria-label="Close conditions"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/></svg></button></div>
      <div class="c-body">
      <div class="c-scope"><div class="chips">${A.scope.length === cs.designBeds().length ? `<span class="bchip">All ${A.scope.length} design beds<button data-a="one" aria-label="Back to one bed">×</button></span>` : (A.scope.length > 6 ? A.scope.slice(0, 5) : A.scope).map((b) => `<span class="bchip">${esc(short(b))}<button data-rm="${esc(b)}" aria-label="Remove ${esc(short(b))} from the scope">×</button></span>`).join('') + (A.scope.length > 6 ? `<span class="bchip more" title="${esc(A.scope.slice(5).map(short).join(', '))}">+${A.scope.length - 5} beds</span>` : '')}</div>
        <p class="meta">${area.toFixed(1)} m² · ${dom.cells} cells on the 1 m terrain grid${dom.plantableAreaM2 < area - 0.05 ? ` · ${(area - dom.plantableAreaM2).toFixed(1)} m² not plantable` : ''}</p>
        <p class="hint">Shift-click beds to add · <button class="lnk" data-a="all">All design beds</button> · <button class="lnk" data-a="zoom">Zoom to</button></p></div>
      <div class="c-opts"><label><input type="checkbox" data-a="hide" ${hidden ? 'checked' : ''}> Hide planting</label>
        <button class="lnk" data-a="blank" title="A working design in which only these beds are empty; the reference is not changed">${draft && draft.from === 'blank' && JSON.stringify(draft.scope) === JSON.stringify(A.scope) ? 'Blank working design: these beds' : 'Empty these beds in a new design'}</button></div>
      <section class="c-sec" aria-labelledby="cfH"><h3 id="cfH">Fields <span class="sub">area per value</span>${A.show ? '<button class="lnk clear" data-a="none">Show nothing</button>' : ''}</h3>
        <ul class="flist" role="radiogroup" aria-labelledby="cfH">
          ${shownF.map(fieldRow).join('')}
          ${unknown.length ? `<li class="frow na" title="Unknown is never drawn or counted as zero"><span class="fname">No data: ${unknown.map((f) => esc((f.short || f.name).toLowerCase())).join(', ')}</span></li>` : ''}
        </ul>
        ${hyp.length ? `<details class="hyp" ${hyp.some((f) => f.id === A.field) || A.rules.some((r) => cs.field(r.field)?.hypothetical) ? 'open' : ''}><summary>Hypothetical test fields (not site data)</summary><ul class="flist">${hyp.map(fieldRow).join('')}</ul></details>` : ''}
      </section>
      <section class="c-sec" aria-labelledby="czH"><h3 id="czH"><label><input type="radio" name="cshow" value="zones" ${A.show === 'zones' ? 'checked' : ''}> Zones</label> <span class="sub">where conditions overlap</span></h3>
        ${A.rules.map(ruleRow).join('')}
        ${A.rules.length < MAX_UI_RULES ? '<button class="lnk add" data-a="addrule">Add a condition</button>' : ''}
        ${c ? `<ul class="zlist">${zoneRows}</ul>${perBed}${c.notes.length ? `<ul class="notes">${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}` : A.last && !A.last.ok ? `<p class="err">${esc(A.last.error)}</p>` : ''}
      </section>
      <section class="c-sec c-point" hidden></section>
      </div>`;
    bind(); renderPoint();
  }
  function renderPoint() {
    const sec = el.querySelector('.c-point'); if (!sec) return;
    if (!A.point) { sec.hidden = true; return; }
    const r = cs.sampleAt(A.point.x, A.point.y);
    if (!r.ok || !r.bedId || !A.scope.includes(r.bedId)) { sec.hidden = true; return; }
    const row = (id) => { const f = cs.field(id); const v = r.point[id]; return `<dt>${esc(f.short || f.name)}</dt><dd>${v == null ? '<span class="na">no data</span>' : f.categorical ? (v ? 'under a tree crown' : 'open') : num(f, v) + unitOf(f)}</dd>`; };
    sec.hidden = false;
    sec.innerHTML = `<h3>At this point <span class="sub">x ${r.x.toFixed(1)}, y ${r.y.toFixed(1)} · ${esc(short(r.bedId))}</span></h3><dl class="kv">${['field.elevation', 'field.slope', 'field.distance-to-path', 'field.distance-to-edge'].map(row).join('')}${r.zone ? `<dt>Zone</dt><dd>${esc(r.zone.label)}</dd>` : ''}</dl>`;
  }
  function bind() {
    el.querySelector('[data-a=close]').onclick = close;
    el.querySelector('[data-a=all]').onclick = () => setScope('all');
    el.querySelector('[data-a=zoom]').onclick = () => zoomTo();
    const cl = el.querySelector('[data-a=none]'); if (cl) cl.onclick = () => show(null);
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => toggleBed(b.dataset.rm)));
    const one = el.querySelector('[data-a=one]'); if (one) one.onclick = () => { const sel = store.selection && store.getObject(store.selection.id); const b = sel && (sel.type === 'bed' ? sel.id : sel.bedId); setScope(b && cs.designBeds().some((q) => q.id === b) ? [b] : [A.scope[0]]); };
    el.querySelector('[data-a=hide]').onchange = (e) => ctx.setFilter(e.target.checked ? 'site' : 'all');
    el.querySelector('[data-a=blank]').onclick = () => ctx.startBlank(A.scope.slice());
    el.querySelectorAll('input[name=cshow]').forEach((i) => (i.onchange = () => { const v = i.value; if (v === 'zones') show('zones'); else show('field', v.slice(6)); }));
    el.querySelectorAll('[data-rf]').forEach((s) => (s.onchange = () => {
      const k = +s.dataset.rf; const d = A.dist.fields[s.value]; const mid = d && d.known ? +((d.min + d.max) / 2).toFixed((cs.field(s.value).decimals ?? 2)) : 0;
      A.rules[k] = { field: s.value, breaks: [mid] }; recompute(); if (A.show !== 'zones') show('zones'); else { render(); ctx.syncUrl(); }
    }));
    const setBreak = (k, v, full) => { if (!Number.isFinite(v)) return; A.rules[k].breaks = [v]; recompute(); if (A.show !== 'zones') { A.show = 'zones'; cs.setDisplay({ mode: 'zones', field: null, scope: A.scope.slice() }); } if (full) { render(); ctx.syncUrl(); ctx.emit('conditions', state()); } else liveUpdate(k); };
    el.querySelectorAll('[data-rn]').forEach((i) => (i.onchange = () => setBreak(+i.dataset.rn, +i.value, true)));
    el.querySelectorAll('[data-rs]').forEach((i) => { i.oninput = () => setBreak(+i.dataset.rs, +(+i.value).toFixed((cs.field(A.rules[+i.dataset.rs].field).decimals ?? 2) + 1), false); i.onchange = () => setBreak(+i.dataset.rs, +(+i.value).toFixed((cs.field(A.rules[+i.dataset.rs].field).decimals ?? 2) + 1), true); });
    el.querySelectorAll('[data-rx]').forEach((b) => (b.onclick = () => { A.rules.splice(+b.dataset.rx, 1); recompute(); render(); ctx.syncUrl(); }));
    const add = el.querySelector('[data-a=addrule]');
    if (add) add.onclick = () => { const used = new Set(A.rules.map((r) => r.field)); const next = SHOWN.find((f) => !used.has(f) && !cs.field(f).categorical && A.dist.fields[f]?.known) || 'field.elevation'; const d = A.dist.fields[next]; A.rules.push({ field: next, breaks: [+((d.min + d.max) / 2).toFixed(cs.field(next).decimals ?? 2)] }); recompute(); render(); ctx.syncUrl(); };
    el.querySelectorAll('.zrow').forEach((r) => { r.onmouseenter = () => { cs.hoverKey = r.dataset.key; store.emit('compute', { type: 'hover' }); }; r.onmouseleave = () => { cs.hoverKey = null; store.emit('compute', { type: 'hover' }); }; });
  }
  // while dragging a threshold: update the zone list and the histogram mark without rebuilding the panel
  function liveUpdate(k) {
    const c = A.last; if (!c || !c.ok) return;
    const n = el.querySelector(`[data-rn="${k}"]`); if (n) n.value = A.rules[k].breaks[0];
    const box = el.querySelector(`.rule[data-k="${k}"] .rhist svg`);
    if (box) { const f = cs.field(A.rules[k].field); const d = A.dist.fields[f.id]; box.outerHTML = histSvg(f, d, { w: 248, h: 26, mark: A.rules[k].breaks[0] }); }
    const zl = el.querySelector('.zlist');
    if (zl) zl.innerHTML = c.summary.map((z, j) => `<li class="zrow" data-key="${esc(z.key)}">${zoneSwatch(c, z.key, j)}<span class="zl">${esc(z.label)}</span><span class="za">${z.areaM2.toFixed(1)} m²<small>${(z.share * 100).toFixed(0)}%${A.scope.length > 1 ? ` · ${z.beds.length} bed${z.beds.length === 1 ? '' : 's'}` : ''}</small></span></li>`).join('');
  }

  // frame the scope in the active view (plan: fit its beds; axo: centre on them at a matching scale)
  function zoomTo() {
    if (!A.scope.length) return false;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const id of A.scope) { const g = store.getObject(id).geometry; for (const p of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) for (const q of p[0]) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); } }
    const m = Math.max(4, (b[2] - b[0]) * 0.18, (b[3] - b[1]) * 0.18); const box = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    if (st.view === 'plan' || !ctx.scene) { ctx.plan.resize(); ctx.plan.fit(box); ctx.plan._fitted = true; }
    else { ctx.plan.resize(); ctx.plan.fit(box); ctx.scene.setViewCenter(ctx.plan.view.cx, ctx.plan.view.cy, ctx.plan.view.scale); }
    return true;
  }
  return { open, close, setScope, zoomTo, toggleBed, show, setRules, state, setPoint, render, get A() { return A; } };
}
