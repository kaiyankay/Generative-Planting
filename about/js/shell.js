// Generative Planting · About — the bar, the footer, the routes back into the app and the one computed example.
import { loadEngine, ROOT } from './engine.js';
import { buildCase } from './case.js';
import { esc } from './figures.js';

export { ROOT };
export const PAGES = [['project', 'Project', 'about/'], ['how', 'How it works', 'about/how-it-works/'], ['method', 'Research & Method', 'about/method/'], ['data', 'Sources & data', 'about/data/']];
export const url = (p) => ROOT + p;
// the visitor's saved design is only looked at (never written): it decides whether "Design" resumes it
export function savedDesign() { try { const raw = localStorage.getItem('gp.flow.project.v2'); if (!raw) return null; const o = JSON.parse(raw); return o && o.schema === 'gp.project/2' ? { name: o.name, stage: o.stage } : null; } catch { return null; } }
export const links = () => { const s = savedDesign(); return { design: url(s ? '?resume=1' : ''), knowledge: url(s ? '?resume=1&ws=knowledge' : '?intro=0&ws=knowledge'), saved: s }; };

export function mountTop(el, page) {
  const L = links(); el.className = 'pi-top';
  el.innerHTML = `<a class="pi-wordmark" href="${esc(url(''))}">Generative Planting</a>
    <nav class="pi-nav" aria-label="Workspace"><a href="${esc(L.design)}">Design</a><a href="${esc(L.knowledge)}">Knowledge</a><a href="${esc(url('about/'))}" aria-current="page">About</a></nav>
    <div class="pi-sub"><nav class="pi-subnav" aria-label="About">${PAGES.map(([k, l, p]) => `<a href="${esc(url(p))}"${k === page ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('')}</nav></div>
    <div class="pi-right">${L.saved ? `<a class="pi-return" href="${esc(L.design)}" title="Your design is saved in this browser and opens where you left it"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>Back to “${esc(L.saved.name || 'my design')}”</a>` : ''}</div>`;
}
export function footHtml() { return `<footer class="pi-foot"><span>Generative Planting · ARCH 540, UBC · research prototype</span>${PAGES.map(([, l, p]) => `<a href="${esc(url(p))}">${esc(l)}</a>`).join('')}<a href="https://github.com/kaiyankay/Generative-Planting" rel="noopener">Repository</a></footer>`; }

// the example. By default the pages read the stored run of the same engine (about/data/case.json, made by tools/about_build.py,
// so a projector opens instantly); "Recompute in this browser" runs the engine again here and compares the fingerprints.
// If the stored run is missing, the engine computes it on the spot. Nothing is written to the design's storage either way.
export async function theCase(onStep) {
  try { const r = await fetch(url('about/data/case.json'), { cache: 'no-cache' }); if (r.ok) { const C = await r.json(); C.meta.source = 'stored'; return { C, cached: true }; } } catch { /* compute instead */ }
  return recompute(onStep);
}
export async function recompute(onStep) {
  onStep && onStep('Loading the Detroit model and the plant knowledge…');
  const E = await loadEngine();
  onStep && onStep('The engine is computing the example: strategy, cells, mixes, plants, months…');
  await new Promise((r) => setTimeout(r, 30));
  const C = await buildCase(E); C.meta.source = 'live';
  return { C, cached: false, E };
}
export async function engineNow() { return loadEngine(); }
