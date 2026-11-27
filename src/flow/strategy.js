// Site-wide planting strategy (Define). Rules mode: explicit, shown rules over the designer's words and the real site —
// no language model. Output = a confirmable Strategy: the scope, what is kept, and ZONES (groups of beds) each with a role,
// a Planting System, a Spatial Logic candidate, the reasons, evidence gaps and a priority. A strategy is a proposal: nothing
// in the design changes until it is confirmed, and Structure then previews every zone at once.
import { bbox, inside, mpArea } from './spatial.js';
import { SYSTEMS } from './mix.js';

// Rules mode reading of the intent: keyword → objective, every match shown; nothing else is inferred
export function readIntent(text) {
  const t = String(text || '').toLowerCase(); const read = []; const unused = [];
  const o = { flowering: { on: true, months: [4, 5, 6, 7, 8, 9, 10] }, pollinators: { on: false }, continuity: { on: false }, suitability: { on: true } };
  if (/pollinat|bee|butterfl|insect|nectar|moth|hummingbird|wildlife|biodivers/.test(t)) { o.pollinators.on = true; read.push(['pollinator / bee / butterfly', 'Pollinator resources (groups)']); }
  let lo = null, hi = null;
  if (/early|spring/.test(t)) { lo = 3; read.push(['spring / early', 'flowering from March']); }
  if (/autumn|fall|late season|october/.test(t)) { hi = 10; read.push(['autumn / late', 'flowering to October']); }
  if (/summer/.test(t) && lo == null && hi == null) { lo = 6; hi = 8; read.push(['summer', 'flowering June–August']); }
  if (/all (year|season)|long season|continuous flower|season-long|whole season|throughout the (season|year)/.test(t)) { lo = lo ?? 3; hi = hi ?? 10; read.push(['long season', 'flowering March–October']); }
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


export const STARTERS = [
  { id: 'v2', text: 'Keep the meadows, use a coherent matrix-based planting along the main garden paths, add early flowers beneath trees, and support pollinators throughout the season.' },
  { id: 'season', text: 'A pollinator planting that flowers from spring to autumn.' },
  { id: 'colour', text: 'Colour blocks in the block beds and a matrix along the paths.' },
];
export const SCOPES = [
  { id: 'main', name: 'Main Garden', test: (b) => /^(A|B|C)\d|^T[NE]$/.test(b.code) },
  { id: 'site', name: 'Whole site', test: () => true },
  { id: 'meadows', name: 'East + West Meadow', test: (b) => /^M[WE]$/.test(b.code) },
  { id: 'style', name: 'Block + Matrix beds', test: (b) => /^(A|B)\d/.test(b.code) },
  { id: 'custom', name: 'My selection', test: () => false },
];
export const ZONE_COLORS = ['#B0703F', '#5E7F52', '#7A5E92', '#3F7A8C', '#A88A2E', '#9A4F64'];

// crown share of a bed (NAIP crowns: probable shade proxy), sampled on a grid
export function crownShare(P, bedId) {
  P._crown ||= new Map(); if (P._crown.has(bedId)) return P._crown.get(bedId);
  const g = P.plantable(bedId); if (!g) return null; const b = bbox(g); const ctx = P.context(); let n = 0, k = 0, unk = 0;
  const st = Math.max(1, Math.sqrt(mpArea(g) / 60));
  for (let x = b[0] + st / 2; x < b[2]; x += st) for (let y = b[1] + st / 2; y < b[3]; y += st) { if (!inside(g, x, y)) continue; const v = ctx.sample(x, y); n++; if (v.canopy == null || !Number.isFinite(v.canopy)) unk++; else if (v.canopy >= 0.5) k++; }
  const r = n ? { share: +(k / Math.max(1, n - unk)).toFixed(2), unknown: unk === n } : null; P._crown.set(bedId, r); return r;
}

/**
 * Rules-mode strategy. input: intent text, scope id (+ custom bed ids), keep (bed ids kept as reference).
 * Every rule that fired is listed in `rules`, every word not used in `unused`.
 */
export function proposeStrategy(P, { intent = '', scope = 'main', customBeds = [], keep = [] } = {}) {
  const t = String(intent).toLowerCase(); const read = readIntent(intent); const rules = []; const unused = [...read.unused];
  const beds = P.eligibleBeds();
  let inScope = scope === 'custom' ? beds.filter((b) => customBeds.includes(b.id)) : beds.filter(SCOPES.find((s) => s.id === scope).test);
  const keepIds = new Set(keep);
  if (/keep (the )?meadow|meadows? (stay|as they are)|retain (the )?meadow/.test(t)) { for (const b of beds) if (/^M[WE]$/.test(b.code)) keepIds.add(b.id); rules.push(['“keep the meadows”', 'East and West Meadow stay as the reference planting']); }
  if (/keep (the )?rain garden/.test(t)) { for (const b of beds) if (b.code === 'RG') keepIds.add(b.id); rules.push(['“keep the rain garden”', 'Rain Garden stays as the reference planting']); }
  inScope = inScope.filter((b) => !keepIds.has(b.id));
  const wants = {
    matrix: /matrix|coherent|unif(y|ied)|grass(es)?/.test(t), path: /path|walk|along the (main )?(garden )?(path|walk)|edge/.test(t),
    trees: /tree|shade|canopy|woodland|beneath/.test(t), early: /early|spring|bulb|ephemeral/.test(t), colour: /colou?r|show|bloom|maximal|vivid/.test(t), meadow: /meadow|prairie/.test(t),
  };
  if (wants.matrix) rules.push(['matrix / coherent', 'Matrix Based system where a zone has no stronger rule']);
  if (wants.path) rules.push(['path / along the paths', 'beds along the main walks: curved bands that follow the path edge']);
  if (wants.trees) rules.push(['trees / shade / beneath', 'beds with ≥ 30 % crown above (NAIP crowns, probable shade): Under Trees system']);
  if (wants.early) rules.push(['early / spring', 'ephemeral (bulb) layer kept in the systems that have one; flowering from March']);
  if (wants.colour) rules.push(['colour / show', 'Maximal Color system for the block beds']);
  const zones = new Map(); const add = (key, def, bed, why) => { let z = zones.get(key); if (!z) { z = { id: 'z.' + key, ...def, bedIds: [], why: [], gaps: [], crown: [] }; zones.set(key, z); } z.bedIds.push(bed.id); if (why && !z.why.includes(why)) z.why.push(why); return z; };
  for (const b of inScope) {
    const cr = crownShare(P, b.id); const shaded = cr && cr.share >= 0.3;
    if (/^M[WE]$/.test(b.code)) { add('meadow', { name: 'Meadows', role: 'Open meadow: long-lived grasses with forbs, whole areas', system: 'true-meadow', logic: 'whole', priority: 3 }, b, 'meadow beds (lakeplain prairie on the plans) → True Meadow, not divided'); continue; }
    if (b.code === 'RG') { add('rain', { name: 'Rain Garden', role: 'Basin planting; wet tolerance cannot be checked (no moisture data)', system: 'true-meadow', logic: 'organic', priority: 3 }, b, 'rain garden basin → organic patches following its shape'); continue; }
    if (shaded && (wants.trees || !wants.matrix)) { const z = add('trees', { name: 'Under the trees', role: 'Shade-tolerant ground layer with early flowers beneath existing crowns', system: 'under-trees', logic: 'organic', priority: 1 }, b, `${b.code}: ${Math.round(cr.share * 100)} % of the bed under existing crowns (probable shade)`); z.crown.push(b.code); continue; }
    if (wants.path && /^B|^T/.test(b.code)) { add('path', { name: 'Path matrix', role: 'A coherent matrix that reads as one band system along the main walks', system: 'matrix-based', logic: 'bands', params: { guide: 'path' }, priority: 1 }, b, `${b.code} faces a main walk → bands following the path edge`); continue; }
    if (/^A/.test(b.code)) { add(wants.matrix && !wants.colour ? 'matrix' : 'blocks', wants.matrix && !wants.colour ? { name: 'Matrix beds', role: 'Matrix with emergent forbs', system: 'matrix-based', logic: 'honeycomb', priority: 2 } : { name: 'Colour blocks', role: 'Blocks of colour with emergents and bulbs', system: 'maximal-color', logic: 'honeycomb', priority: 2 }, b, `${b.code} is a block bed on the original plan`); continue; }
    if (/^C/.test(b.code)) { add(wants.matrix && !wants.colour && !wants.early ? 'matrix' : 'groups', wants.matrix && !wants.colour && !wants.early ? { name: 'Matrix beds', role: 'Matrix with emergent forbs', system: 'matrix-based', logic: 'organic', priority: 2 } : { name: 'Organic groups', role: wants.early ? 'Organic groups with early ephemerals in drifts' : 'Organic groups of forbs with emergents', system: 'maximal-color', logic: 'organic', priority: 2 }, b, `${b.code} is a grouping bed on the original plan`); continue; }
    add('matrix', { name: 'Matrix beds', role: 'Matrix with emergent forbs', system: 'matrix-based', logic: 'bands', params: { guide: 'path' }, priority: 2 }, b, `${b.code} is a matrix bed on the original plan`);
  }
  if (wants.trees) { const shares = inScope.map((b) => crownShare(P, b.id)).filter(Boolean).map((c) => c.share); const mx = shares.length ? Math.max(...shares) : 0; if (!zones.has('trees')) rules.push(['beneath trees', `no bed in the scope has ≥ 30 % crown above (largest ${Math.round(mx * 100)} %, NAIP crowns): Under Trees not applied; early flowers come from the ephemeral layers`]); }
  const list = [...zones.values()];
  list.forEach((z, i) => {
    z.color = ZONE_COLORS[i % ZONE_COLORS.length]; z.systemName = SYSTEMS[z.system].name;
    z.areaM2 = +z.bedIds.reduce((a, id) => a + (beds.find((b) => b.id === id).areaM2 || 0), 0).toFixed(1);
    z.gaps.push('soil moisture, sun hours and pH: no site data (unknown, never assumed)');
    if (z.system === 'under-trees') z.gaps.push('shade is inferred from crowns in aerial imagery, not measured');
    if (z.id === 'z.rain') z.gaps.push('wet tolerance of plants cannot be matched to the basin: no moisture data');
    z.why.push(`${SYSTEMS[z.system].name}: ${SYSTEMS[z.system].blurb}`);
  });
  list.sort((a, b) => a.priority - b.priority || b.areaM2 - a.areaM2);
  const kept = beds.filter((b) => keepIds.has(b.id)).map((b) => b.id);
  const outside = beds.filter((b) => !inScope.includes(b) && !keepIds.has(b.id)).map((b) => b.id);
  return {
    schema: 'gp.strategy/1', method: 'Rules mode — explicit rules over your words and the site (no language model)', intent, scope, customBeds, objectives: read.objectives, read: read.read, rules, unused,
    zones: list, kept, outside, areaM2: +list.reduce((a, z) => a + z.areaM2, 0).toFixed(1), beds: list.reduce((a, z) => a + z.bedIds.length, 0),
    trees: 'existing trees and their trunk clearances always stay', confirmed: false,
  };
}
// manual edit of a zone (system / logic / name) or moving a bed to another zone
export function editZone(strategy, zoneId, patch) { const s = structuredClone(strategy); const z = s.zones.find((q) => q.id === zoneId); if (!z) return s; Object.assign(z, patch); if (patch.system) z.systemName = SYSTEMS[patch.system].name; return s; }
export function moveBed(strategy, bedId, zoneId) { const s = structuredClone(strategy); for (const z of s.zones) z.bedIds = z.bedIds.filter((b) => b !== bedId); const z = s.zones.find((q) => q.id === zoneId); if (z) z.bedIds.push(bedId); s.zones = s.zones.filter((q) => q.bedIds.length); return s; }
