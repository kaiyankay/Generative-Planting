// Generative Planting · About — the page vocabulary inherited from the Planting Intelligence About (.ab-*, .pi-*).
import { esc } from './figures.js';
import { url } from './shell.js';
export { esc };
// ---------------------------------------------------------------- shared page pieces (the PI About vocabulary)
export const mast = (h1, lede, side = '') => `<header class="ab-mast"><div><h1>${h1}</h1>${lede ? `<p class="ab-lede">${lede}</p>` : ''}</div>${side ? `<div class="ab-mast-s">${side}</div>` : ''}</header>`;
export const sec = (id, title, sub, body, cls = '') => `<section class="ab-sec ${cls}" id="${id}"><div class="ab-sec-h"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="ab-sec-b">${body}</div></section>`;
export const fold = (id, title, sub, body) => `<details class="ab-fold" id="${id}"><summary><span>${title}</span>${sub ? `<em>${sub}</em>` : ''}</summary><div class="ab-fold-b">${body}</div></details>`;
export const fig = (n, of, label) => `<div><dd>${n}${of != null ? `<small> / ${of}</small>` : ''}</dd><dt>${label}</dt></div>`;
export const go = (...ls) => `<p class="ab-go">${ls.map(([h, l]) => `<a href="${esc(h)}">${l}</a>`).join('')}</p>`;
export const sci = (s) => `<i class="ab-sci">${esc(s)}</i>`;
export const wait = (h = 360) => `<div class="gp-wait" style="min-height:${h}px"><span class="gp-dot"></span><span id="gp-wait">Computing with the engine…</span></div>`;
export const tag = (k, t) => `<span class="gp-tag ${esc(k)}">${esc(t || k)}</span>`;
export const src = (s) => tag(s || 'unknown', { site: 'site plant list', foundation: 'foundation', illustrative: 'illustrative', project: 'project record', personal: 'personal', unknown: 'unknown', conflict: 'sources disagree' }[s || 'unknown'] || s);
export const nm = (C, id, { short = false } = {}) => { const s = C.species[id]; if (!s) return esc(id); return `<i class="ab-sci">${esc(short ? s.name.split(' ').map((w, i) => (i ? w : w[0] + '.')).join(' ') : s.name)}</i>${s.cultivar ? ` ‘${esc(s.cultivar)}’` : ''}`; };
export const nmTxt = (C, id) => { const s = C.species[id]; return s ? s.name + (s.cultivar ? ` ‘${s.cultivar}’` : '') : id; };
export const routes = { project: url('about/'), how: url('about/how-it-works/'), method: url('about/method/'), data: url('about/data/') };
