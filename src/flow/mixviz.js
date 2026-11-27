// Mix visuals computed from the recipe itself: a plan patch produced by the SAME fill engine (lattice candidates of the
// mix on a 4 × 3 m patch), a section from the members' nominal heights (display proxy), a 12-month ribbon of the share
// of expected individuals known to flower (unknown hatched), and layer bars (each layer its own 100 %).
import { candidates } from './fill.js';
import { expectedDensity, layerDensity, SYSTEMS, ROLE_DEF } from './mix.js';
import { esc } from './ui.js';

const PW = 4, PH = 3; // patch metres
const col = (store, id) => { const sp = store.getObject(id); return (sp && (sp.displayFlower || sp.displayLeaf)) || '#8C9C82'; };
const leaf = (store, id) => { const sp = store.getObject(id); return (sp && sp.displayLeaf) || '#7D8F6A'; };
export function patchPoints(mix) { const pts = candidates(mix, [0, 0, PW, PH]); return pts; }
export function planPatch(F, mix, { w = 132, h = 99, cache = true } = {}) {
  const key = mix.id + '@' + mix.version; F._mixPatch ||= new Map(); let pts = cache && F._mixPatch.get(key); if (!pts) { pts = patchPoints(mix); F._mixPatch.set(key, pts); }
  const s = w / PW; let out = `<svg class="mv-plan" viewBox="0 0 ${w} ${h}" aria-label="Plan patch ${PW} × ${PH} m: ${pts.length} candidate plants">`;
  out += `<rect width="${w}" height="${h}" fill="#FFFDF8"/>`;
  for (let x = 1; x < PW; x++) out += `<path d="M${x * s} 0V${h}" stroke="rgba(39,36,31,.07)"/>`; for (let y = 1; y < PH; y++) out += `<path d="M0 ${y * s}H${w}" stroke="rgba(39,36,31,.07)"/>`;
  for (const p of pts.filter((q) => q.slot === 'base')) out += `<circle cx="${(p.x * s).toFixed(1)}" cy="${(h - p.y * s).toFixed(1)}" r="${Math.max(1.3, p.spacing * s * 0.42).toFixed(1)}" fill="${col(F.store, p.plantId)}" fill-opacity=".38"/>`;
  for (const p of pts.filter((q) => q.slot === 'overlay')) out += `<circle cx="${(p.x * s).toFixed(1)}" cy="${(h - p.y * s).toFixed(1)}" r="${Math.max(2, 0.18 * s).toFixed(1)}" fill="none" stroke="${col(F.store, p.plantId)}" stroke-width="1.6"/>`;
  for (const p of pts.filter((q) => q.slot === 'ephemeral')) out += `<circle cx="${(p.x * s).toFixed(1)}" cy="${(h - p.y * s).toFixed(1)}" r="1" fill="${col(F.store, p.plantId)}"/>`;
  return out + '</svg>';
}
export function section(F, mix, { w = 132, h = 44 } = {}) {
  const key = mix.id + '@' + mix.version; let pts = F._mixPatch && F._mixPatch.get(key); if (!pts) { pts = patchPoints(mix); F._mixPatch ||= new Map(); F._mixPatch.set(key, pts); }
  const strip = pts.filter((p) => p.y > 1.2 && p.y < 1.8).sort((a, b) => a.x - b.x); const s = w / PW; const maxH = 1.8; let out = `<svg class="mv-sec" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="M0 ${h - 2}H${w}" stroke="rgba(39,36,31,.4)"/>`;
  for (const p of strip) { const t = F.K.traits(p.plantId); const hh = Math.min(maxH, t.heightM || 0.5) / maxH * (h - 6); const x = p.x * s; const grassy = /grass|sedge/.test(t.plantType || '');
    if (p.slot === 'ephemeral') { out += `<path d="M${x.toFixed(1)} ${h - 2}v-${(hh * 0.5).toFixed(1)}" stroke="${leaf(F.store, p.plantId)}" stroke-width=".8"/>`; continue; }
    if (grassy) { for (const d of [-2.2, -1, 0, 1, 2.2]) out += `<path d="M${x.toFixed(1)} ${h - 2}q${d * 0.6} -${(hh * 0.6).toFixed(1)} ${d * 1.3} -${hh.toFixed(1)}" stroke="${leaf(F.store, p.plantId)}" stroke-width=".7" fill="none"/>`; }
    else { out += `<path d="M${x.toFixed(1)} ${h - 2}v-${hh.toFixed(1)}" stroke="${leaf(F.store, p.plantId)}" stroke-width="1"/><circle cx="${x.toFixed(1)}" cy="${(h - 2 - hh).toFixed(1)}" r="${p.slot === 'overlay' ? 2.6 : 1.8}" fill="${col(F.store, p.plantId)}"/>`; } }
  return out + '</svg>';
}
// share of expected individuals known to flower per month (unknown apart)
export function phenology(F, mix) {
  const out = []; for (let m = 1; m <= 12; m++) { let yes = 0, unk = 0, tot = 0; for (const L of mix.layers) for (const mm of L.members) { const d = expectedDensity(L, mm); tot += d; const f = F.K.floweringIn(mm.plantId, m); if (f === 'yes') yes += d; else if (f === 'unknown') unk += d; } out.push({ m, yes: tot ? yes / tot : 0, unk: tot ? unk / tot : 0 }); }
  return out;
}
export function ribbon(F, mix, { w = 132, h = 16 } = {}) {
  const ph = phenology(F, mix); const bw = w / 12; let out = `<svg class="mv-rib" viewBox="0 0 ${w} ${h}" aria-label="Months in flower (share of expected plants)">`;
  for (const q of ph) { const x = (q.m - 1) * bw; out += `<rect x="${x + 0.5}" y="0" width="${bw - 1}" height="${h}" fill="#EFE9DB"/>`; if (q.unk > 0.001) out += `<rect x="${x + 0.5}" y="${h * (1 - q.unk)}" width="${bw - 1}" height="${h * q.unk}" fill="url(#hatchU)"/>`; if (q.yes > 0.001) out += `<rect x="${x + 0.5}" y="${h * (1 - q.yes)}" width="${bw - 1}" height="${h * q.yes}" fill="#C56B33" fill-opacity="${0.35 + 0.65 * Math.min(1, q.yes * 2.5)}"/>`; }
  return out + `<defs><pattern id="hatchU" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V3" stroke="#8E897C" stroke-width="1"/></pattern></defs></svg>`;
}
export function layerBars(mix) {
  return `<div class="mv-layers">${mix.layers.map((L) => { const d = layerDensity(L); return `<div class="lyr" title="${esc(L.name)}: ${L.basis === 'area' ? 'area shares (100 %)' : L.basis === 'count' ? L.density + ' plants / m² split by proportion (100 %)' : Math.round(L.coverage * 100) + ' % of the area in drifts × ' + L.densityInDrift + ' / m²'}"><span class="ln">${esc(L.slot === 'base' ? 'Base' : L.slot === 'overlay' ? L.name : 'Bulbs')}</span><span class="lb">${L.members.map((m) => `<i style="flex:${(L.basis === 'area' ? m.share : m.proportion).toFixed(3)};background:${'var(--sw)'}" data-p="${esc(m.plantId)}"></i>`).join('')}</span><span class="num">${d.toFixed(1)}/m²</span></div>`; }).join('')}</div>`;
}
export function mixCard(F, mix, { active = false, compare = false, uses = 0 } = {}) {
  const S = SYSTEMS[mix.system]; const n = mix.layers.reduce((a, L) => a + L.members.length, 0);
  const ill = mix.members.filter((m) => [F.K.traits(m.plantId).bloom].some((x) => x.source === 'illustrative')).length;
  return `<article class="mixcard${active ? ' active' : ''}${compare ? ' cmp' : ''}" data-mix="${esc(mix.id)}" style="--mc:${esc(mix.color)}" tabindex="0" role="button" aria-pressed="${active}" title="Select to paint with ${esc(mix.name)}">
    <header><span class="sw"></span><b>${esc(mix.name)}</b><span class="v mono">v${mix.version}</span></header>
    <div class="mv">${planPatch(F, mix)}${section(F, mix)}</div>
    ${ribbon(F, mix)}
    ${lightProfile(F, mix)}
    ${active ? layerBars(mix) : ''}
    <footer><span class="sys">${esc(S ? S.name : 'Custom')}</span><span class="mono xs">${n} species · ${mix.density.value}/m²${uses ? ` · ${uses} cells` : ''}</span>${ill ? `<span class="tag illus" title="flowering of ${ill} members is an illustrative teaching value">illus. ${ill}</span>` : ''}</footer>
    <div class="acts"><button class="lnk xs" data-edit="${esc(mix.id)}">recipe</button><button class="lnk xs" data-cmp="${esc(mix.id)}" aria-pressed="${compare}">compare</button><button class="lnk xs" data-know="${esc(mix.id)}">plants</button></div>
  </article>`;
}
export function roleName(r) { return ROLE_DEF[r] ? ROLE_DEF[r].name : r; }

// the recorded light of the members (share-weighted over all layers): what the mix is made for — data, not a label
export function lightProfile(F, mix) {
  const w = { sun: 0, part: 0, shade: 0, unknown: 0 }; let ill = 0, tot = 0;
  for (const L of mix.layers) { const key = L.basis === 'area' ? 'share' : 'proportion'; for (const m of L.members) { const x = (m[key] || 0) * (L.slot === 'base' ? 1 : 0.5); tot += x; const t = F.K.traits(m.plantId); if (t.light.status === 'unknown') { w.unknown += x; continue; } if (t.light.source === 'illustrative') ill += x; const v = t.light.value; for (const k of v) if (k in w) w[k] += x / v.length; } }
  if (!tot) return '';
  const seg = (k, c) => (w[k] > 0.005 ? `<i class="lp-${k}" style="flex:${(w[k] / tot).toFixed(3)}" title="${k} ${Math.round((100 * w[k]) / tot)} %"></i>` : '');
  return `<div class="lprof" aria-label="Recorded light of the members"><span class="lb">${seg('sun')}${seg('part')}${seg('shade')}${seg('unknown')}</span><span class="xs">${['sun', 'part', 'shade'].filter((k) => w[k] / tot > 0.08).map((k) => (k === 'part' ? 'part shade' : k)).join(' · ') || 'light unknown'}${ill / tot > 0.3 ? ' <span class="tag illus">illus.</span>' : ''}</span></div>`;
}
