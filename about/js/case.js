// Generative Planting · About — ONE worked example, computed by the real engine on the real Detroit model.
//
// Beds B1 (Matrix bed) and A1 (Block bed) of the Oudolf Garden, side by side across a crushed-granite walk. The example is
// built exactly as a designer would build it in the Design workspace, through the same Project commands:
//   Define     proposeStrategy (Rules mode) on the two beds, confirmStrategy
//   Structure  previewCells for each spatial logic (Honeycomb · Bands · Organic) → the strategy's logic is committed
//   Compose    the five Detroit legend recipes become Mixes; cells are painted by number (assign); one Brush gesture
//              (soft edge, Base + Overlay) is applied with Brush.down / move / up — the function the live brush uses
//   Explore    computePerformance (perf/3) by month on the placed instances
// The project lives in memory only (engine.js): nothing is saved, the visitor's own design is never read or written.
import { proposeStrategy } from '../../src/flow/strategy.js';
import { convertLegendRecipe, SYSTEMS, ROLE_DEF, expectedDensity, ARRANGEMENTS } from '../../src/flow/mix.js';
import { LOGICS, bbox, mpArea } from '../../src/flow/spatial.js';
import { Brush, BRUSH, mixFitAt } from '../../src/flow/brush.js';
import { candidates, makeEnv, validate, PlantIndex, FILL } from '../../src/flow/fill.js';
import { suggestMixes, coverageOf } from '../../src/flow/suggest.js';
import { MONTHS } from '../../src/flow/knowledge.js';

export const CASE = {
  beds: ['bed.B1', 'bed.A1'],
  intent: 'A coherent matrix-based planting along the paths that supports pollinators from spring to autumn.',
  assume: { 'bed.A1': 'sun' }, // a project assumption, stated as one: Detroit has no sun data
  followed: 'sp.sporobolus-heterolepis',
};
export const LAYER = { base: 'Base', overlay: 'Overlay', ephemeral: 'Bulbs' };
export const r2 = (n) => Math.round(n * 100) / 100;
const rings = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const roundGeom = (g) => rings(g).map((p) => p.map((r) => r.map(([x, y]) => [r2(x), r2(y)])));
const fp = (inst) => { let h = 2166136261 >>> 0, n = 0; for (const c of Object.keys(inst).sort()) for (const p of inst[c].plants) { n++; for (const ch of `${c}|${p.id}|${p.x}|${p.y};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return `${n}:${h.toString(16)}`; };

let _case = null;
export function getCase(E) { return (_case ||= buildCase(E)); }

export async function buildCase(E) {
  const t0 = performance.now(); const P = E.fresh(); const K = E.K; const store = E.store;
  const sp = (id) => { const o = store.getObject(id) || {}; const t = K.traits(id); return { id, name: o.scientificName || t.name || id, cultivar: o.cultivar || null, type: o.plantType || t.plantType || 'forb', form: o.formProxy || null, h: o.nominalHeightM || t.heightM || 0.5, w: o.nominalSpreadM || t.spreadM || 0.4, flower: o.displayFlower || '#c9a86a', leaf: o.displayLeaf || '#7a8f4e', inferred: o.inferredFields || [] }; };
  const species = new Map(); const keep = (id) => { if (!species.has(id)) species.set(id, sp(id)); return id; };

  // ---------------------------------------------------------------- site
  const box0 = CASE.beds.map((b) => bbox(P.plantable(b))).reduce((a, q) => [Math.min(a[0], q[0]), Math.min(a[1], q[1]), Math.max(a[2], q[2]), Math.max(a[3], q[3])]);
  const m = 2.5; const box = [box0[0] - m, box0[1] - m, box0[2] + m, box0[3] + m];
  const hit = (g) => { const q = bbox(g.type ? g : { type: 'MultiPolygon', coordinates: g }); return !(q[2] < box[0] || q[0] > box[2] || q[3] < box[1] || q[1] > box[3]); };
  const beds = P.eligibleBeds().filter((b) => hit(store.getObject(b.id).geometry)).map((b) => ({ id: b.id, code: b.code, name: b.name, style: b.style, area: b.areaM2, inCase: CASE.beds.includes(b.id), geom: roundGeom(store.getObject(b.id).geometry), plantable: CASE.beds.includes(b.id) ? roundGeom(P.plantable(b.id)) : null }));
  const paths = P.pathGeoms().filter((p) => hit(p.g)).map((p) => ({ id: p.id, name: p.name, geom: roundGeom(p.g) }));
  const trees = P.trees().filter((t) => t.x > box[0] - 6 && t.x < box[2] + 6 && t.y > box[1] - 6 && t.y < box[3] + 6);
  const ctx = P.context();
  const sample = (x, y) => ctx.sample(x, y);
  // site fields on a 1 m grid over the case (the real compute space: elevation, slope, path distance, crowns)
  const grid = []; for (let y = Math.ceil(box[1]); y <= box[3]; y += 1) for (let x = Math.ceil(box[0]); x <= box[2]; x += 1) { const v = sample(x, y); grid.push([x, y, v.elevation == null ? null : r2(v.elevation), v.slope == null ? null : r2(v.slope), v.pathDist == null ? null : r2(v.pathDist), v.canopy ?? null]); }

  // ---------------------------------------------------------------- Define
  const strategy = proposeStrategy(P, { intent: CASE.intent, scope: 'custom', customBeds: CASE.beds });
  P.confirmStrategy(strategy);
  const st = P.state.strategy;
  const sources = K.sourcesStatus ? K.sourcesStatus() : null;

  // ---------------------------------------------------------------- Structure: every logic previewed on both beds
  const logics = {};
  for (const logic of Object.keys(LOGICS)) {
    logics[logic] = { name: LOGICS[logic].name, beds: {} };
    for (const b of CASE.beds) { const r = P.previewCells(b, logic, logic === 'bands' ? { guide: 'path' } : {}); logics[logic].beds[b] = { ok: r.ok, params: r.params, explanation: r.adaptation && r.adaptation.explanation, notes: r.adaptation ? r.adaptation.notes : [], ranking: r.adaptation && r.adaptation.ranking ? r.adaptation.ranking.slice(0, 6).map((q) => ({ seed: q.seed, score: q.score, terms: q.terms })) : null, cells: r.cells.map((c) => ({ id: c.id, label: c.label, area: r2(c.areaM2), center: c.center.map(r2), geom: roundGeom(c.geometry), n: c.neighbors.length })) }; }
  }
  const chosen = st.zones.flatMap((z) => z.bedIds.map((id) => { const r = P.previewCells(id, z.logic, z.logic === 'bands' ? { guide: 'path' } : {}); r.zoneId = z.id; return r; }));
  P.commitStructureMany(chosen);
  const cellsOf = (b) => P.state.beds[b].cellIds;
  const cells = P.allCells().map((c) => ({ id: c.id, label: c.label, bed: c.bedId, area: r2(c.areaM2), center: c.center.map(r2), geom: roundGeom(c.geometry), neighbors: c.neighbors.map((n) => n.id), cond: { slope: c.conditions.slope && r2(c.conditions.slope.mean), pathDist: c.conditions.pathDist && r2(c.conditions.pathDist.mean), elevation: c.conditions.elevation && r2(c.conditions.elevation.mean), canopy: c.conditions.canopy && c.conditions.canopy.fraction, unknown: (c.conditions.unknown || []).map((u) => u.field) } }));

  // ---------------------------------------------------------------- Compose: the Detroit legend recipes as Mixes
  const legend = (E.legend && E.legend.mixes) || [];
  const LG = legend.map((mx, i) => convertLegendRecipe(mx, { colorIndex: i, exists: (id) => !!store.getObject(id) }));
  for (const mx of LG) P.addMix(mx);
  const mixOf = (sys) => P.state.mixes.find((q) => q.system === sys && !/organic/.test(q.id));
  const MIX = { matrix: mixOf('matrix-based'), blocks: P.state.mixes.find((q) => /block-colour/.test(q.id)), groups: P.state.mixes.find((q) => /organic-groups/.test(q.id)), meadow: mixOf('true-meadow'), trees: mixOf('under-trees') };
  for (const id of CASE.beds) if (CASE.assume[id]) P.setLightAssumption([id], CASE.assume[id]);
  // paint by number: B1 → mix 1, A1 → mix 2 except the cells nearest B1 → mix 3
  const b1 = cellsOf('bed.B1'), a1 = cellsOf('bed.A1');
  const cB1 = centroidOf(b1.map((id) => P.state.cells[id].center));
  const a1near = a1.slice().sort((p, q) => dist(P.state.cells[p].center, cB1) - dist(P.state.cells[q].center, cB1));
  const nGroups = Math.round(a1.length / 3); const groupsCells = a1near.slice(0, nGroups), blockCells = a1near.slice(nGroups);
  const paint = [[b1, MIX.matrix], [blockCells, MIX.blocks], [groupsCells, MIX.groups]];
  for (const [ids, mx] of paint) P.assign(ids, mx.id);
  const afterFill = snapshotInstances(P); const fpFill = fp(P.state.instances);

  // one brush gesture, the live brush's own evaluation: from A1 (assumed sun) across the walk into B1 (light unknown)
  const FB = { P, K, store, brushLog: [], cellAt: (x, y) => P.allCells().find((c) => insideCell(c, x, y)) || null };
  const B = new Brush(FB);
  const g0 = P.state.cells[groupsCells[0]].center, g1 = cB1;
  const a = lerp(g0, g1, 0.1), b = lerp(g0, g1, 0.86);
  const R = 1.6; B.start({ mixId: MIX.groups.id, slots: ['base', 'overlay'], r: R, edge: 'soft' });
  // hover at the start point: the same function, never written
  B.hover(a[0], a[1]); const hover = B.ghost ? { x: a[0], y: a[1], adds: B.ghost.adds.length, removes: B.ghost.removes.length, rejected: B.ghost.rejected.length, here: hereOf(B.ghost.here, P) } : null;
  const N = 14; const samples = [a]; B.down(a[0], a[1]);
  const frames = [];
  for (let k = 1; k <= N; k++) { const p = lerp(a, b, k / N); B.move(p[0], p[1]); samples.push(p); if (k % 2 === 0) frames.push({ k, added: B.stroke.added, removed: B.stroke.removed, kept: B.stroke.kept }); }
  const S = B.stroke; const staged = B.stagedPlants().map(slimPlant); const removedPos = [...S.removedPos];
  const rejectedAll = []; // what the stroke's validation turned away, re-evaluated for the figure on a fresh stage (same function)
  { const S2 = B._newStage(P.mix(MIX.groups.id), B.active); for (let k = 1; k <= N; k++) B._segment(S2, lerp(a, b, (k - 1) / N), lerp(a, b, k / N), { rejectedOut: rejectedAll }); }
  const lightCount = { ...S.fit }; const rej = { ...S.rej };
  const cand = candidates(P.mix(MIX.groups.id), [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R], { layers: ['base', 'overlay'] }).filter((q) => segD(q.x, q.y, a, b) <= R).map((q) => ({ x: r2(q.x), y: r2(q.y), s: q.slot, p: keep(q.plantId) }));
  const env = makeEnv(P); const lightA = env.lightAt(a[0], a[1], 'bed.A1'), lightB = env.lightAt(b[0], b[1], 'bed.B1');
  const fitA = mixFitAt(K, P.mix(MIX.groups.id), lightA, ['base', 'overlay']), fitB = mixFitAt(K, P.mix(MIX.groups.id), lightB, ['base', 'overlay']);
  const up = B.up();
  const brush = { mixId: MIX.groups.id, r: R, edge: 'soft', softBand: BRUSH.softBand, slots: ['base', 'overlay'], a, b, samples: samples.map((q) => q.map(r2)), hover, frames, candidates: cand, staged, removed: removedPos.length, removedPos: removedPos.slice(0, 4000), rejected: rejectedAll.map((q) => ({ x: r2(q.x), y: r2(q.y), why: q.why })), fit: lightCount, rej, light: { a: lightA, b: lightB, fitA: slimFit(fitA), fitB: slimFit(fitB) }, result: { added: up.added, removed: up.removed, kept: up.kept, cells: up.cells, beds: up.beds, ms: up.ms }, footprint: lastFootprint(P) };

  // ---------------------------------------------------------------- one validated 6 × 3 m sample of each legend mix (the Compose card's sample, validated)
  const swatches = {};
  for (const mx of P.state.mixes) { const O = [5000, 5000]; const w = 6, h = 3; const g = { type: 'MultiPolygon', coordinates: [[[[O[0], O[1]], [O[0] + w, O[1]], [O[0] + w, O[1] + h], [O[0], O[1] + h], [O[0], O[1]]]]] };
    const cell = { id: 'about.sample', bedId: 'about.sample', geometry: g, _bb: [O[0], O[1], O[0] + w, O[1] + h] };
    const env = { ...makeEnv(P), trees: [], hardEdge: () => g, lightAt: () => ({ value: null, source: null, proxy: null }) }; const index = new PlantIndex();
    const out = []; for (const slot of ['base', 'overlay', 'ephemeral']) { const cands = candidates(mx, [O[0], O[1], O[0] + w, O[1] + h], { layers: [slot] }); const v = validate(cands, { cell, mix: mx, env, index }); for (const q of v.plants) { index.add(q); out.push({ x: r2(q.x - O[0]), y: r2(q.y - O[1]), p: keep(q.plantId), s: q.slot, r: q.role, sp: q.spacing }); } }
    swatches[mx.id] = { w, h, plants: out }; }

  // ---------------------------------------------------------------- the design as placed
  const inst = snapshotInstances(P);
  for (const c of Object.values(inst)) for (const p of c) keep(p.p);
  for (const mx of P.state.mixes) for (const L of mx.layers) for (const mm of L.members) keep(mm.plantId);
  const mixes = P.state.mixes.map((mx) => ({ id: mx.id, name: mx.name, color: mx.color, system: mx.system, density: mx.density.value, layerDensity: mx.layerDensity, basis: mx.basis, layers: mx.layers.map((L) => ({ id: L.id, slot: L.slot, name: L.name, basis: L.basis, arrangement: L.arrangement, grain: (ARRANGEMENTS[L.arrangement] || {}).grainM, density: L.density, coverage: L.coverage, densityInDrift: L.densityInDrift, members: L.members.map((q) => ({ p: q.plantId, role: q.role, share: q.share, proportion: q.proportion, spacing: q.spacingM, d: r2(expectedDensity(L, q)) })) })), uses: P.usesOf ? P.usesOf(mx.id).length : null }));
  const assignments = Object.fromEntries(Object.entries(P.state.assignments).map(([c, x]) => [c, { mix: x.mixId, fragments: x.fragments.map((f) => ({ mix: f.mixId, slots: f.slots, edge: f.edge || 'hard', origin: f.origin, geom: f.geometry ? roundGeom(f.geometry) : null })) }]));

  // ---------------------------------------------------------------- Explore: by month, from the placed plants
  const perf = P.perf; const months = {};
  for (let mo = 1; mo <= 12; mo++) { const q = perf.byMonth[mo]; months[mo] = { placed: q.placed, flowering: q.floweringInstances, unknown: q.unknownInstances, perM2: q.floweringPerM2 != null ? r2(q.floweringPerM2) : null, resourceCells: q.resourceCells, uncertainCells: q.uncertainCells, strongCells: q.strongCells, components: q.components ? q.components.length : 0, largest: q.largestComponentShare, groups: (q.groups || []).map((g) => ({ g: g.group, n: g.instances ?? g.n ?? g.count })) }; }
  const phen = {}; for (const id of species.keys()) { phen[id] = { bloom: trait(K, id, 'bloom'), light: trait(K, id, 'light'), poll: trait(K, id, 'pollinators'), role: trait(K, id, 'role'), moisture: trait(K, id, 'moisture'), wind: !!K.traits(id).windPollinated, f: MONTHS.map((_, i) => K.floweringIn(id, i + 1)) }; }

  // ---------------------------------------------------------------- Knowledge: one record followed, one change made
  const followed = followRecord(K, P, CASE.followed, inst);
  const change = knowledgeChange(E, P);
  for (const q of [...change.before.recipe.members, ...change.after.recipe.members]) keep(q.p);
  for (const id of species.keys()) if (!phen[id]) phen[id] = { bloom: trait(K, id, 'bloom'), light: trait(K, id, 'light'), poll: trait(K, id, 'pollinators'), role: trait(K, id, 'role'), moisture: trait(K, id, 'moisture'), wind: !!K.traits(id).windPollinated, f: MONTHS.map((_, i) => K.floweringIn(id, i + 1)) };

  const out = {
    meta: { ms: Math.round(performance.now() - t0), fpFill, fp: fp(P.state.instances), knowledge: K.version(), engine: 'src/flow (V3.1)', computedAt: new Date().toISOString(), rules: { edgeInsetM: FILL.edgeInsetM, trunkClearanceM: FILL.trunkClearanceM, centreClearanceM: FILL.centreClearanceM, sameLayerK: FILL.sameLayerK, reachM: BRUSH.reachM, softBand: BRUSH.softBand } },
    site: { box: box.map(r2), beds, paths, trees, grid, unknown: ctx.unknownFields, label: ctx.label },
    define: { intent: CASE.intent, strategy: { zones: st.zones.map((z) => ({ id: z.id, name: z.name, system: z.system, logic: z.logic, beds: z.bedIds, role: z.role, why: z.why, color: z.color })), rules: strategy.rules, unused: strategy.unused, read: strategy.read, objectives: strategy.objectives }, assume: CASE.assume, sources, brief: P.state.brief },
    logics, cells, chosen: Object.fromEntries(st.zones.flatMap((z) => z.bedIds.map((b) => [b, z.logic]))),
    paint: paint.map(([ids, mx], i) => ({ n: i + 1, mix: mx.id, cells: ids })),
    mixes, MIX: Object.fromEntries(Object.entries(MIX).map(([k, v]) => [k, v && v.id])), assignments, fill: afterFill, inst, brush,
    months, perf: { planted: r2(perf.plantedAreaM2 || 0), assigned: r2(perf.assignedAreaM2 || 0), instances: perf.instances, coverage: perf.coverage, issues: (perf.issues || []).slice(0, 8).map((i) => ({ id: i.id, severity: i.severity, text: i.text || i.title || i.message })) },
    species: Object.fromEntries(species), phen, followed, change, swatches,
    systems: Object.values(SYSTEMS).map((S) => ({ id: S.id, name: S.name, slides: S.slides, blurb: S.blurb, layers: S.layers.map((L) => ({ id: L.id, slot: L.slot, name: L.name, basis: L.basis, arrangement: L.arrangement, roles: L.roles, shares: L.shares || null, spacing: L.spacing || null, density: L.density || null, coverage: L.coverage || null, densityInDrift: L.densityInDrift || null })) })),
    roles: ROLE_DEF, arrangements: ARRANGEMENTS,
  };
  return out;
}

// ---------------------------------------------------------------- helpers
function snapshotInstances(P) { const o = {}; for (const [c, i] of Object.entries(P.state.instances)) o[c] = i.plants.map(slimPlant); return o; }
function slimPlant(p) { return { x: r2(p.x), y: r2(p.y), p: p.plantId, s: p.slot, r: p.role, m: p.mixId, sp: p.spacing, f: p.fit, sub: p.sub ? 1 : 0, l: p.layerId }; }
function slimFit(f) { return f ? { cat: f.cat || f.category || f.state, known: f.known, conflicts: (f.conflicts || []).map((c) => ({ name: c.name, light: c.light, source: c.source })) } : null; }
function trait(K, id, k) { const t = K.traits(id)[k]; return t ? { status: t.status, value: t.value, source: t.source, ev: (t.evidence || []).slice(0, 3).map((e) => ({ id: e.id, s: e.statement, src: e.source })), alt: (t.alternatives || []).map((a) => ({ scope: a.scope, value: a.value })) } : null; }
function centroidOf(pts) { return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length]; }
function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
function segD(x, y, a, b) { const vx = b[0] - a[0], vy = b[1] - a[1]; const L2 = vx * vx + vy * vy; let t = L2 ? ((x - a[0]) * vx + (y - a[1]) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a[0] + t * vx - x, a[1] + t * vy - y); }
function insideCell(c, x, y) { const q = c._bb || (c._bb = bbox(c.geometry)); if (x < q[0] || x > q[2] || y < q[1] || y > q[3]) return false; for (const p of rings(c.geometry)) { let i = false; const r = p[0]; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { if ((r[a][1] > y) !== (r[b][1] > y) && x < ((r[b][0] - r[a][0]) * (y - r[a][1])) / (r[b][1] - r[a][1]) + r[a][0]) i = !i; } if (i) return true; } return false; }
function hereOf(h, P) { if (!h) return null; return { blocked: h.blocked || null, cell: h.cell ? h.cell.label : null, light: h.light || null, compat: h.compat ? slimFit(h.compat) : null }; }
function lastFootprint(P) { let best = null; for (const a of Object.values(P.state.assignments)) for (const f of a.fragments) if (f.geometry && f.origin !== 'manual' && (!best || (f.at || '') >= (best.at || ''))) best = f; return best && best.geometry ? roundGeom(best.geometry) : null; }

// one Detroit plant record, from its sources to the plants the engine placed
function followRecord(K, P, id, inst) {
  const t = K.traits(id); const attrs = ['bloom', 'light', 'moisture', 'pollinators', 'role'];
  const mixes = P.state.mixes.filter((mx) => mx.layers.some((L) => L.members.some((q) => q.plantId === id))).map((mx) => { const L = mx.layers.find((q) => q.members.some((z) => z.plantId === id)); const q = L.members.find((z) => z.plantId === id); return { id: mx.id, name: mx.name, color: mx.color, layer: L.id, slot: L.slot, basis: L.basis, role: q.role, share: q.share, proportion: q.proportion, spacing: q.spacingM }; });
  let placed = 0; const cells = new Set(); for (const [c, ps] of Object.entries(inst)) for (const p of ps) if (p.p === id) { placed++; cells.add(c); }
  return { id, name: t.name, attrs: Object.fromEntries(attrs.map((k) => [k, trait(K, id, k)])), spread: t.spreadM, height: t.heightM, sizeBasis: t.sizeBasis, mixes, placed, cells: [...cells] };
}

// a real knowledge change, made on a throw-away copy of the brief: the engine's Rules-mode suggestion before and after
function knowledgeChange(E, P0) {
  const K = E.K; const P = E.fresh(); // a second in-memory project: the record lives only there
  const brief = { objectives: { flowering: { on: true, months: [4, 5, 6, 7, 8, 9, 10, 11] }, pollinators: { on: true }, continuity: { on: false }, suitability: { on: true } } };
  const cellsB1 = P.previewCells('bed.B1', 'bands', { guide: 'path' }).cells;
  const id = 'sp.salvia-mainacht'; const before = suggestMixes({ brief, cells: cellsB1, K }); const tb = K.traits(id).bloom;
  const months = brief.objectives.flowering.months; const covB = coverageOf(before.recipes[0].members.map((q) => q.plantId), K, months);
  P.addProjectKnowledge({ plantId: id, claims: [{ attr: 'bloom', value: [10, 11] }, { attr: 'pollinators', value: ['bees', 'moths'] }, { attr: 'light', value: ['sun'] }], original: 'Example record for this page: flowers again in October and November after a hard cut in July; bees and moths visit.' });
  K.invalidate('about');
  const after = suggestMixes({ brief, cells: cellsB1, K }); const ta = K.traits(id).bloom; const covA = coverageOf(after.recipes[0].members.map((q) => q.plantId), K, months);
  const rec = (r) => ({ name: r.name, system: r.system || null, members: r.members.map((q) => ({ p: q.plantId, role: q.role, proportion: q.proportion })) });
  const res = { plant: id, name: K.traits(id).name, original: P.state.knowledge && P.state.knowledge.length ? P.state.knowledge[P.state.knowledge.length - 1].original : null, before: { bloom: tb, recipe: rec(before.recipes[0]), coverage: covB }, after: { bloom: ta, recipe: rec(after.recipes[0]), coverage: covA }, months };
  E.fresh(); // the record's project is dropped
  K.invalidate('about-restore');
  // put the case project back as the knowledge's project
  return res;
}
