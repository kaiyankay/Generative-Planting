// Generative Planting · About. One module for the four pages, named by <body data-about>:
//   project   the research position, the system from plant to planting (a cover drawn from the computed example), who decides what
//   how       How it works: ONE design (beds B1 + A1, Detroit) computed by the engine in four stages
//   method    Research & Method: the course's planting knowledge and how each idea became (or did not yet become) computation
//   data      Sources & data: knowledge layers, what is known, assumed, illustrative or unknown; the engine's own parameters
// Architecture, typography and components are inherited from the Planting Intelligence About (platform.css, about.css); the
// content is this project's. Every count and drawing of a plant is read from the engine's output in this browser.
import { mountTop, footHtml, theCase, links, url } from './shell.js';
import { esc } from './figures.js';

const page = document.body.dataset.about || 'project';
const TITLE = { project: 'About', how: 'How it works', method: 'Research & Method', data: 'Sources & data' };
const $ = (s) => document.querySelector(s);

(async function boot() {
  mountTop($('#top'), page); $('#foot').innerHTML = footHtml();
  document.title = `${TITLE[page]} · Generative Planting`;
  const mod = await import(`./page-${page}.js`);
  const app = $('#app');
  try {
    app.innerHTML = mod.frame ? mod.frame(links()) : '<p class="pi-loading">Loading…</p>';
    const say = (t) => { const el = document.getElementById('gp-wait'); if (el) el.textContent = t; };
    const { C, cached } = await theCase(say);
    window.about = { page, C, cached };
    await mod.fill(C, { links: links(), cached });
    document.body.dataset.ready = '1';
    wire();
    if (location.hash.length > 1) { const el = document.getElementById(location.hash.slice(1)); if (el) { if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView(); } }
  } catch (e) { console.error(e); app.insertAdjacentHTML('beforeend', `<p class="pi-loading">Could not compute this page: ${esc(e.message)}</p>`); }
})();

function wire() {
  const openHash = () => { const el = location.hash.length > 1 && document.getElementById(location.hash.slice(1)); if (el && el.tagName === 'DETAILS') { el.open = true; el.scrollIntoView(); } };
  window.addEventListener('hashchange', openHash);
  const toc = [...document.querySelectorAll('.ab-toc a[href^="#"], .ab-seven a[href^="#"]')]; if (!toc.length || !('IntersectionObserver' in window)) return;
  const byId = new Map(toc.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { toc.forEach((a) => a.removeAttribute('aria-current')); const a = byId.get(e.target.id); if (a) a.setAttribute('aria-current', 'true'); } }, { rootMargin: '-25% 0px -65% 0px' });
  for (const id of byId.keys()) { const el = document.getElementById(id); if (el) io.observe(el); }
}

