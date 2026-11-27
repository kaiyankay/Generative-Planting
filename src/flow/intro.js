// Introduction → Choose a landscape. Not a design stage: an entry. The plant pattern behind the title is drawn from the
// real reference instances of the model (positions + display colours), the landscape cards are axonometric drawings of
// real model geometry with ONE projection and ONE light for every card. Only cases with a real model can be opened; the
// others are shown as planned (no invented models). Short, skippable, reduced-motion aware.
import { esc } from './ui.js';

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// one axonometric projection for every landscape card: rotate 45°, foreshorten y
const AX = (x, y, z = 0) => [(x - y) * 0.7071, -(x + y) * 0.7071 * 0.56 - z];
const PLANNED = [
  { id: 'planned-1', name: 'Second case', place: 'model not built yet', note: 'Planned: a second real site will appear here once its model exists.' },
  { id: 'planned-2', name: 'Third case', place: 'model not built yet', note: 'Planned: no model, no card art — nothing is simulated.' },
];

function axoSvg(F, { w = 360, h = 220 } = {}) {
  const s = F.store; const objs = s.baseline ? s.baseline.objects : s.model.objects;
  const site = objs.find((o) => o.type === 'site'); const pick = (t) => objs.filter((o) => t.includes(o.type) && o.geometry && /Polygon/.test(o.geometry.type));
  const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  const all = [...pick(['bed']), ...pick(['path', 'boardwalk', 'water', 'lawn'])]; let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const o of all) for (const p of polys(o.geometry)) for (const [x, y] of p[0]) { const q = AX(x, y); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; }
  const k = Math.min((w - 20) / (b[2] - b[0]), (h - 30) / (b[3] - b[1])); const ox = (w - (b[2] - b[0]) * k) / 2 - b[0] * k, oy = (h - (b[3] - b[1]) * k) / 2 - b[1] * k + 6;
  const P = (x, y, z = 0) => { const q = AX(x, y, z); return `${(q[0] * k + ox).toFixed(1)},${(q[1] * k + oy).toFixed(1)}`; };
  const path = (g, z = 0) => polys(g).map((p) => p.map((r) => 'M' + r.map(([x, y]) => P(x, y, z)).join('L') + 'Z').join('')).join('');
  let out = `<svg class="axo" viewBox="0 0 ${w} ${h}" aria-hidden="true">`;
  if (site && site.geometry && /Polygon/.test(site.geometry.type)) out += `<path d="${path(site.geometry, -6 / k)}" fill="#D9D1BF"/><path d="${path(site.geometry)}" fill="#EFE9DB"/>`;
  for (const o of pick(['lawn'])) out += `<path d="${path(o.geometry)}" fill="#E3E6D3"/>`;
  for (const o of pick(['water'])) out += `<path d="${path(o.geometry)}" fill="#C9D8DA"/>`;
  for (const o of pick(['path', 'boardwalk'])) out += `<path d="${path(o.geometry)}" fill="#F7F3EA" stroke="#D9D1BF" stroke-width=".4"/>`;
  for (const o of pick(['bed'])) { out += `<path d="${path(o.geometry, -0.6 / k * 3)}" fill="#7F8C68"/><path d="${path(o.geometry)}" fill="#9DAA82" stroke="#5B6B4D" stroke-width=".5"/>`; }
  for (const o of objs.filter((q) => q.type === 'tree' && q.geometry && q.geometry.type === 'Point')) { const [x, y] = o.geometry.coordinates; const r = Math.max(1.8, ((o.props && (o.props.crownRadiusM || o.props.crownM / 2)) || 3) * k * 0.62); const [cx, cy] = P(x, y, 0).split(',').map(Number); out += `<ellipse cx="${cx + r * 0.3}" cy="${cy + r * 0.25}" rx="${r}" ry="${r * 0.56}" fill="rgba(39,36,31,.12)"/><circle cx="${cx}" cy="${cy - r * 0.9}" r="${r}" fill="#5E7352" stroke="#3B5538" stroke-width=".5"/>`; }
  return out + '</svg>';
}
function plannedSvg({ w = 360, h = 220 } = {}) {
  const c = [[-40, -40], [40, -40], [40, 40], [-40, 40]]; const k = 2.2; const ox = w / 2, oy = h / 2 + 4; const P = (x, y, z = 0) => { const q = AX(x, y, z); return `${(q[0] * k + ox).toFixed(1)},${(q[1] * k + oy).toFixed(1)}`; };
  return `<svg class="axo" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M${c.map(([x, y]) => P(x, y, -3)).join('L')}Z" fill="none" stroke="#C9C2B2" stroke-dasharray="4 4"/><path d="M${c.map(([x, y]) => P(x, y)).join('L')}Z" fill="rgba(239,233,219,.5)" stroke="#B7AF9C" stroke-dasharray="4 4"/></svg>`;
}

export function showIntro(F, { again = false } = {}) {
  if (document.getElementById('fintro')) return;
  const el = document.createElement('div'); el.id = 'fintro'; el.className = 'f-intro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Generative Planting — introduction');
  el.innerHTML = `<canvas class="i-field" aria-hidden="true"></canvas>
    <section class="i-hero"><p class="kicker">Research prototype · Rules mode, no paid AI</p><h1 class="i-title">Generative<br>Planting</h1>
      <p class="i-lede">Design planting with knowledge, space and plant communities together — say what you want, shape the site, then paint living mixes that grow under the brush.</p>
      <div class="row"><button class="btn-p big" data-i="start">Start</button>${again ? '<button class="lnk" data-i="close">Back to the design</button>' : '<button class="lnk" data-i="skip">Skip the introduction</button>'}</div></section>
    <section class="i-pick" hidden><p class="kicker">Choose a landscape</p><h2>Where do you want to design?</h2><div class="cards">
      <button class="lcard" data-site="${esc(F.preset.id)}"><div class="art">${axoSvg(F)}</div><b>${esc(F.preset.name)}</b><span class="xs">Belle Isle, Detroit · ${F.P.eligibleBeds().length} beds and areas · terrain 1 m · real model</span><span class="go">Enter →</span></button>
      ${PLANNED.map((p) => `<div class="lcard off" aria-disabled="true" title="${esc(p.note)}"><div class="art">${plannedSvg()}</div><b>${esc(p.name)}</b><span class="xs">${esc(p.place)}</span><span class="go">Planned</span></div>`).join('')}
    </div>${F.u.resume ? `<p class="small resume">Saved: “${esc(F.u.resume.name)}” at ${esc(F.u.resume.stage)}. <button class="btn-s" data-i="resume">Resume it</button></p>` : ''}<p class="xs dim">Other cases appear when their real models exist; none is simulated.</p></section>`;
  document.getElementById('app').appendChild(el);
  // the plant field: real reference instances, coloured by their display flower / leaf, appearing in reading order
  const cv = el.querySelector('.i-field'); const ctx = cv.getContext('2d'); const dpr = Math.min(2, devicePixelRatio || 1);
  const fit = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; };
  fit(); const t = F.store.inst; const pts = []; const sp = F.store.speciesByIndex || [];
  if (t) for (let i = 0; i < t.n; i += 3) { if (!t.alive[i]) continue; const s = sp[t.sp[i]]; if (!s || s.plantType === 'tree') continue; pts.push([t.x[i], t.y[i], (s.displayFlower || s.displayLeaf || '#8C9C82'), s.nominalSpreadM || 0.4]); }
  let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of pts) b = [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])];
  const k = Math.min(cv.width / (b[2] - b[0]), cv.height / (b[3] - b[1])) * 0.95; const ox = (cv.width - (b[2] - b[0]) * k) / 2, oy = (cv.height - (b[3] - b[1]) * k) / 2;
  pts.sort((p, q) => (p[0] + p[1] * 0.3) - (q[0] + q[1] * 0.3));
  let n = 0; const T0 = performance.now(); const dur = reduce() ? 0 : 2600;
  const draw = () => { const upto = dur ? Math.min(pts.length, Math.floor(pts.length * Math.min(1, (performance.now() - T0) / dur))) : pts.length;
    for (; n < upto; n++) { const [x, y, c, r] = pts[n]; ctx.beginPath(); ctx.arc(ox + (x - b[0]) * k, cv.height - (oy + (y - b[1]) * k), Math.max(1.8 * dpr, r * k * 0.5), 0, 7); ctx.fillStyle = c; ctx.globalAlpha = 0.72; ctx.fill(); }
    if (n < pts.length && !el._stop) requestAnimationFrame(draw); };
  if (pts.length) requestAnimationFrame(draw);
  const close = (fn) => { el._stop = true; const done = () => { el.remove(); if (fn) fn(); }; if (reduce()) done(); else { el.classList.add('leaving'); setTimeout(done, 520); } };
  const pick = () => { el.querySelector('.i-hero').hidden = true; el.querySelector('.i-pick').hidden = false; el.classList.add('picking'); el.querySelector('.lcard:not(.off)').focus(); };
  el.querySelector('[data-i=start]').onclick = pick;
  const sk = el.querySelector('[data-i=skip]'); if (sk) sk.onclick = pick;
  const cl = el.querySelector('[data-i=close]'); if (cl) cl.onclick = () => close();
  el.querySelector('.lcard:not(.off)').onclick = (e) => { const card = e.currentTarget; card.classList.add('chosen'); close(() => { if (!again) { F.startNew(); F.setMode('axo', { quiet: true }); F.ctx.fit && F.ctx.fit(); } F.toast(again ? 'Back in the design.' : 'Define the strategy: write an intent or pick one, then choose the scope.'); }); };
  const rs = el.querySelector('[data-i=resume]'); if (rs) rs.onclick = () => close(() => F.resume());
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!el.querySelector('.i-pick').hidden) close(); else pick(); } });
  setTimeout(() => el.querySelector('[data-i=start]').focus(), 50);
}
