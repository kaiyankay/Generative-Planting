// Controlled tests of the workflow engine (flow-tests.html). Real Detroit model + labelled synthetic fixtures.
// Each test: { id, gate, name, ok, detail }. Fixtures are marked FIXTURE and never stand for project data.
import { ModelStore } from '../model.js';
import { ComputeSpace } from '../compute.js';
import { PlantLibrary } from '../design/library.js';
import polygonClipping from '../../vendor/polygon-clipping/polygon-clipping.esm.js';
import { generateCells, mpArea, inside, LOGICS } from './spatial.js';
import { ActiveKnowledge } from './knowledge.js';
import { Project, fingerprint, emptyState } from './project.js';
import { computePerformance } from './performance.js';
import { arrangeCell, largestRemainder } from './arrange.js';
import { makeMix, validateMix, normalize, editMix } from './mix.js';
import { suggestMixes, interpretEdit } from './suggest.js';
import { validateSuggestion } from './llm.js';
import { autoCompose } from './compose.js';
import { readIntent } from './stages/define.js';
import { candidates } from './fill.js';
import { Brush } from './brush.js';
import { convertLegendRecipe, SYSTEMS } from './mix.js';
import { proposeStrategy } from './strategy.js';

const R = []; const t0 = performance.now();
const test = async (id, gate, name, fn) => { try { const d = await fn(); R.push({ id, gate, name, ok: d === true || (d && d.ok !== false), detail: d === true ? '' : d }); } catch (e) { R.push({ id, gate, name, ok: false, detail: String(e && e.stack || e) }); } };
const C = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const MP = (c) => ({ type: 'MultiPolygon', coordinates: c });
const rect = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const angDiff = (a, b) => { const d = Math.abs(((a % 180) + 180) % 180 - ((b % 180) + 180) % 180); return Math.min(d, 180 - d); };

// geometry validity of a cell set against its plantable area
function validity(res, plantable) {
  const A = mpArea(plantable); const sum = res.cells.reduce((a, c) => a + mpArea(c.geometry), 0);
  let overlap = 0; for (let i = 0; i < res.cells.length; i++) for (let j = i + 1; j < res.cells.length; j++) { const x = polygonClipping.intersection(C(res.cells[i].geometry), C(res.cells[j].geometry)); overlap += x.length ? mpArea(MP(x)) : 0; }
  let outside = 0; for (const c of res.cells) { const d = polygonClipping.difference(C(c.geometry), C(plantable)); outside += d.length ? mpArea(MP(d)) : 0; }
  const positive = res.cells.every((c) => c.areaM2 > 0);
  return { A: +A.toFixed(2), sum: +sum.toFixed(2), dropped: res.adaptation.droppedM2, overlap: +overlap.toFixed(4), outside: +outside.toFixed(4), positive, ok: positive && overlap < 0.05 && outside < 0.05 && near(sum + res.adaptation.droppedM2, A, A * 0.003 + 0.05) };
}

const KEYS = ['gp.flow.project.v1', 'gp.flow.snapshots.v1', 'gp.flow.project.v2', 'gp.flow.snapshots.v2', 'gp.workingDraft.v1'];
// the tests never leave their project in the browser: the visitor's own saved design is put back afterwards
export async function run() {
  const saved = Object.fromEntries(KEYS.map((k) => { try { return [k, localStorage.getItem(k)]; } catch { return [k, null]; } }));
  try { return await runAll(); } finally { for (const [k, v] of Object.entries(saved)) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage unavailable */ } } }
}
async function runAll() {
  const store = await ModelStore.load('data/detroit/');
  const cs = new ComputeSpace(store, await fetch('data/compute.json').then((r) => r.json()).catch(() => null)); store.compute = cs;
  const lib = new PlantLibrary(store, { place: 'place:detroit', library: await fetch('data/detroit/design-library.json').then((r) => r.json()) });
  await lib.loadKnowledge({ db: 'gp-knowledge-flowtests-' + Date.now() });
  const teaching = await fetch('data/detroit/teaching-traits.json').then((r) => r.json());
  let P = null; const K = new ActiveKnowledge({ store, library: lib, teaching, project: () => (P ? P.state : null) });
  P = new Project({ store, cs, K, site: { id: 'detroit', name: 'Oudolf Garden Detroit' } });
  const baseCount = store.baseline.placements.length; const baseFp = store.baseline.placements.map((p) => p.id).join('|').length;

  // ================================================================ Gate 2 · spatial logic on the real site
  for (const logic of Object.keys(LOGICS)) {
    await test(`S1-${logic}`, 'G2', `${LOGICS[logic].name} in B1: valid cells (coverage, no overlap, inside, positive)`, () => { const pl = P.plantable('bed.B1'); const r = P.previewCells('bed.B1', logic); if (!r.ok) return { ok: false, err: r.error }; return { ...validity(r, pl), cells: r.cells.length, explanation: r.adaptation.explanation }; });
    await test(`S2-${logic}`, 'G2', `${LOGICS[logic].name}: same input gives identical cells and ids`, () => { const a = P.previewCells('bed.A2', logic), b = P.previewCells('bed.A2', logic); return { ok: JSON.stringify(a.cells.map((c) => [c.id, c.geometry])) === JSON.stringify(b.cells.map((c) => [c.id, c.geometry])), cells: a.cells.length }; });
  }
  await test('S3', 'G2', 'Cells exclude a path inside a bed (holes): no cell contains a blocker point', () => {
    let checked = 0, bad = 0; for (const bed of ['bed.MW', 'bed.ME', 'bed.TE', 'bed.RG']) { const bl = store.unitBlockers(bed); if (!bl.length) continue; const r = P.previewCells(bed, 'honeycomb', { size: 6 }); for (const b of bl) for (const p of C(b.g)) { const [x, y] = p[0].reduce((a, q) => [a[0] + q[0] / p[0].length, a[1] + q[1] / p[0].length], [0, 0]); if (!inside(b.g, x, y)) continue; checked++; if (r.cells.some((c) => inside(c.geometry, x, y))) bad++; } }
    return { ok: checked > 0 && bad === 0, checked, bad };
  });
  // FIXTURE: a 30 × 8 m bed with a 2 × 2 m hole; a path along the WEST (short) edge; flat ground; no crowns
  const fixture = (pathSide, { canopy = null, relief = 0, hole = true, h = 8 } = {}) => {
    const g = MP(hole ? [[...rect(0, 0, 30, h), rect(14, 3, 16, 5)[0].slice().reverse()]] : [rect(0, 0, 30, h)]);
    const pd = (x, y) => (pathSide === 'west' ? x : pathSide === 'north' ? h - y : 99);
    return { g, ctx: { label: 'FIXTURE', pathDist: (x, y) => (pd(x, y) <= 0.05 ? 0 : pd(x, y)), elevation: (x, y) => 100 + relief * (x / 30), sample: (x, y) => ({ elevation: 100 + relief * (x / 30), slope: 0, pathDist: pd(x, y), canopy: canopy ? ((x - canopy[0]) ** 2 + (y - canopy[1]) ** 2 <= canopy[2] ** 2 ? 1 : 0) : 0 }) } };
  };
  await test('S4', 'G2', 'FIXTURE: hole is excluded and total area is conserved (bands, honeycomb, organic)', () => { const f = fixture('north'); const out = {}; let ok = true; for (const l of Object.keys(LOGICS)) { const r = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: f.g, logic: l, context: f.ctx, objectives: {} }); const v = validity(r, f.g); const inHole = r.cells.some((c) => inside(c.geometry, 15, 4)); out[l] = { ...v, inHole }; ok = ok && v.ok && !inHole; } return { ok, ...out }; });
  await test('S5', 'G2', 'FIXTURE (30 × 7.5 m, path on the short west edge): straight bands (V2: guide "straight"; curved is the default) — continuity ON → parallel to the path (90°), OFF → along the long axis (0°)', () => {
    const f = fixture('west', { hole: false, h: 7.5 }); const on = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: f.g, logic: 'bands', params: { guide: 'straight' }, context: f.ctx, objectives: { continuity: true } }); const off = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: f.g, logic: 'bands', params: { guide: 'straight' }, context: f.ctx, objectives: { continuity: false } });
    return { ok: angDiff(on.params.angle, 90) < 5 && angDiff(off.params.angle, 0) < 5, on: [on.params.angle, on.adaptation.explanation], off: [off.params.angle, off.adaptation.explanation] };
  });
  await test('S6', 'G2', 'FIXTURE: context changes geometry — a 0.6 m slope across the bed turns bands to the contours; flat ground does not', () => {
    const flat = fixture('none'); const slope = fixture('none', { relief: 0.6 });
    const a = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: flat.g, logic: 'bands', context: flat.ctx, objectives: {} }); const b = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: slope.g, logic: 'bands', context: slope.ctx, objectives: {} });
    return { ok: angDiff(a.params.angle, 0) < 5 && angDiff(b.params.angle, 90) < 5, flat: [a.params.angle, a.adaptation.explanation], sloped: [b.params.angle, b.adaptation.explanation] };
  });
  await test('S7', 'G2', 'FIXTURE: a tree crown changes the organic layout ranking (fewer cells mixing crown and open ground)', () => {
    const open = fixture('none'); const crown = fixture('none', { canopy: [7, 4, 3.2] });
    const a = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: open.g, logic: 'organic', context: open.ctx, objectives: {} }); const b = generateCells({ bedId: 'fx', bedCode: 'FX', plantable: crown.g, logic: 'organic', context: crown.ctx, objectives: {} });
    const mixedWorst = Math.max(...b.adaptation.ranking.map((r) => r.terms.mixedConditions)); const mixedBest = b.adaptation.ranking[0].terms.mixedConditions;
    return { ok: mixedBest <= mixedWorst && (a.params.seed !== b.params.seed || mixedBest < mixedWorst), seedOpen: a.params.seed, seedCrown: b.params.seed, mixedBest, mixedWorst };
  });
  await test('S8', 'G2', 'Adjacency: neighbours share ≥ 0.3 m of boundary and are symmetric', () => { const r = P.previewCells('bed.B2', 'honeycomb'); const by = new Map(r.cells.map((c) => [c.id, c])); let ok = true; for (const c of r.cells) for (const n of c.neighbors) { if (n.sharedM < 0.3 || !by.get(n.id).neighbors.some((q) => q.id === c.id)) ok = false; } return { ok, cells: r.cells.length, links: r.cells.reduce((a, c) => a + c.neighbors.length, 0) / 2 }; });
  await test('S9', 'G2', 'Unknown site fields (sun, moisture, pH) stay unknown in cell conditions', () => { const r = P.previewCells('bed.B1', 'bands'); const u = r.cells[0].conditions.unknown.map((x) => x.field + ':' + x.status); return { ok: u.join() === 'sun:unknown,moisture:unknown,ph:unknown', u }; });

  // ================================================================ arrangement
  await test('A1', 'G2', 'Largest remainder: counts sum exactly to the target', () => { const ms = normalize([{ proportion: 0.333 }, { proportion: 0.333 }, { proportion: 0.334 }]); const c = largestRemainder(37, ms); return { ok: c.reduce((a, b) => a + b, 0) === 37, c }; });
  const pv = P.previewCells('bed.TE', 'honeycomb'); const teCell = pv.cells.slice().sort((a, b) => b.areaM2 - a.areaM2)[0];
  const testMix = makeMix({ id: 'mix.test', name: 'Test', color: '#888888', members: [{ plantId: 'sp.m-echinacea-purpurea', role: 'seasonal', proportion: 0.5 }, { plantId: 'sp.sporobolus-heterolepis', role: 'matrix', proportion: 0.4 }, { plantId: 'sp.cornus-sericea', role: 'structure', proportion: 0.1 }], density: 4 });
  await test('A2', 'G2', 'Arrangement in a real cell: target = round(area × density), all plants inside the cell, off trunks, deterministic', () => {
    const trees = P.trees(); const a = arrangeCell({ cell: teCell, mix: testMix, K, seed: 1, trees }); const b = arrangeCell({ cell: teCell, mix: testMix, K, seed: 1, trees });
    const req = Object.values(a.requested).reduce((x, y) => x + y, 0); const inCell = a.plants.every((p) => inside(teCell.geometry, p.x, p.y)); const offTrunk = a.plants.every((p) => trees.every((t) => (t.x - p.x) ** 2 + (t.y - p.y) ** 2 >= 0.36 - 1e-9));
    return { ok: req === a.target && a.target === Math.round(a.usableM2 * 4) && inCell && offTrunk && JSON.stringify(a.plants) === JSON.stringify(b.plants) && a.plants.length <= a.target, target: a.target, placed: a.plants.length, missing: a.missing, notes: a.notes };
  });

  // ================================================================ Gate 4 · performance: known example (FIXTURE traits)
  const fakeK = (traits) => ({ traits: (id) => traits[id], resourceIn: (id, m) => { const t = traits[id]; if (t.bloom.status === 'unknown') return 'unknown'; return t.bloom.value.includes(m) ? 'yes' : 'no'; }, floweringIn: (id, m) => (traits[id].bloom.status === 'unknown' ? 'unknown' : traits[id].bloom.value.includes(m) ? 'yes' : 'no'), version: () => 'fixture', catalogue: () => [] });
  const T = (bloom, groups, light = ['sun']) => ({ bloom: bloom ? { status: 'known', value: bloom, evidence: [{ id: 'fx' }] } : { status: 'unknown', value: null, evidence: [] }, pollinators: groups ? { status: 'known', value: groups, evidence: [] } : { status: 'unknown', value: null, evidence: [] }, light: light ? { status: 'known', value: light, evidence: [] } : { status: 'unknown', value: null, evidence: [] }, moisture: { status: 'unknown', value: null }, role: { status: 'unknown' }, windPollinated: false, name: 'fx', spreadM: 0.5 });
  const FK = fakeK({ A: T([4, 5], ['bees']), B: T([6, 7], ['butterflies']), U: T(null, null) });
  const cA = { id: 'c1', label: 'FX·1', areaM2: 10, center: [0, 0], neighbors: [{ id: 'c2', sharedM: 3 }], conditions: { canopy: { status: 'open', fraction: 0 } }, geometry: MP(rect(0, 0, 3, 3)) };
  const cB = { id: 'c2', label: 'FX·2', areaM2: 10, center: [4, 0], neighbors: [{ id: 'c1', sharedM: 3 }], conditions: { canopy: { status: 'open', fraction: 0 } }, geometry: MP(rect(3, 0, 6, 3)) };
  const brief = { objectives: { flowering: { on: true, months: [4, 5, 6, 7, 8] }, pollinators: { on: true }, continuity: { on: true }, suitability: { on: true } } };
  const mixes = [{ id: 'mA', members: [{ plantId: 'A', proportion: 1, role: 'seasonal' }] }, { id: 'mB', members: [{ plantId: 'B', proportion: 1, role: 'seasonal' }] }, { id: 'mU', members: [{ plantId: 'U', proportion: 1, role: 'seasonal' }] }];
  const inst = (id) => ({ plants: [{ plantId: id, x: 0, y: 0, spacing: 0.5 }] });
  const perfOf = (a, b, links) => computePerformance({ cells: [cA, cB].map((c) => ({ ...c, neighbors: links === false ? [] : c.neighbors })), assignments: { c1: { mixId: a }, c2: { mixId: b } }, instances: { c1: inst(a.slice(1)), c2: inst(b.slice(1)) }, mixes, K: FK, brief });
  await test('P1', 'G4', 'FIXTURE known example: A {Apr,May} bees, B {Jun,Jul} butterflies → April bees only, June butterflies only, August no known flowering (traits complete)', () => {
    const p = perfOf('mA', 'mB'); const apr = p.byMonth[4], jun = p.byMonth[6], aug = p.byMonth[8];
    return { ok: apr.resourceCells === 1 && apr.groups.map((g) => g.group).join() === 'bees' && jun.resourceCells === 1 && jun.groups.map((g) => g.group).join() === 'butterflies' && aug.resourceCells === 0 && aug.uncertainCells === 0 && p.perCell.c2.months[8].state === 'none' && p.issues.some((i) => i.id === 'gap.8' && i.severity === 'gap'), apr: [apr.resourceCells, apr.groups], jun: [jun.resourceCells, jun.groups], aug: [aug.resourceCells, aug.uncertainCells] };
  });
  await test('P2', 'G4', 'FIXTURE: replacing B by A changes month and group coverage (June gone, April both cells)', () => { const p = perfOf('mA', 'mA'); return { ok: p.byMonth[6].resourceCells === 0 && p.byMonth[4].resourceCells === 2 && p.byMonth[4].components.length === 1, apr: p.byMonth[4].resourceCells, jun: p.byMonth[6].resourceCells }; });
  await test('P3', 'G4', 'FIXTURE: unknown flowering → uncertain, never "no resource"', () => { const p = perfOf('mA', 'mU'); return { ok: p.perCell.c2.months[6].state === 'uncertain' && p.byMonth[6].uncertainCells === 1 && p.issues.some((i) => i.id === 'gap.6' && i.severity === 'uncertain'), state: p.perCell.c2.months[6].state }; });
  await test('P4', 'G4', 'FIXTURE: adjacent resource cells form 1 component; separated cells 2 isolated', () => { const a = perfOf('mA', 'mA'); const b = perfOf('mA', 'mA', false); return { ok: a.byMonth[4].components.length === 1 && b.byMonth[4].components.length === 2 && b.byMonth[4].isolated.length === 2, adjacent: a.byMonth[4].components.length, separated: b.byMonth[4].components.length }; });
  await test('P5', 'G4', 'Empty design and no data: no error, no fabricated values', () => { const p = computePerformance({ cells: [cA, cB], assignments: {}, instances: {}, mixes: [], K: FK, brief }); return { ok: p.instances === 0 && p.byMonth[6].resourceShare === null && p.coverage.bloom === null && p.issues.length === 0, share: p.byMonth[6].resourceShare }; });
  await test('P6', 'G4', 'FIXTURE adaptability (V2: per placed plant): a sun plant placed under a crown is a conflict; unknown light stays uncertain', () => {
    const K2 = fakeK({ S: T([6], ['bees'], ['sun']), N: T([6], ['bees'], null) }); const under = { ...cA, conditions: { canopy: { status: 'under crown', fraction: 1 } } };
    const mk = (id, fit) => ({ ...inst(id), plants: inst(id).plants.map((p) => ({ ...p, fit })) });
    const p1 = computePerformance({ cells: [under], assignments: { c1: { mixId: 's' } }, instances: { c1: mk('S', 'conflict') }, mixes: [], K: K2, brief });
    const p2 = computePerformance({ cells: [under], assignments: { c1: { mixId: 'n' } }, instances: { c1: mk('N', 'unknown') }, mixes: [], K: K2, brief });
    return { ok: p1.perCell.c1.adaptability.status === 'conflict' && p2.perCell.c1.adaptability.status === 'uncertain', known: p1.perCell.c1.adaptability.status, unknown: p2.perCell.c1.adaptability.status };
  });

  // ================================================================ Gate 3 · knowledge integration (real knowledge + project scope)
  const cellsB1 = P.previewCells('bed.B1', 'bands').cells;
  const brief2 = { objectives: { flowering: { on: true, months: [4, 5, 6, 7, 8, 9, 10, 11] }, pollinators: { on: true }, continuity: { on: false }, suitability: { on: true } } };
  await test('K1', 'G3', 'First use works with an empty personal layer (Rules mode suggests recipes from foundation + site + illustrative)', () => { const r = suggestMixes({ brief: brief2, cells: cellsB1, K }); return { ok: r.mode === 'rules' && r.recipes.length > 0, recipes: r.recipes.map((x) => x.name), personal: lib.kb.events.length }; });
  await test('K2', 'G3', 'Changing a known flowering month changes the suggestion: a TEST project record "Salvia Mainacht flowers Oct–Nov, bees, moths" (a month no known plant covers) puts it into the recipe', async () => {
    const id = 'sp.salvia-mainacht'; const before = suggestMixes({ brief: brief2, cells: cellsB1, K }).recipes[0].members.map((m) => m.plantId);
    P.addProjectKnowledge({ plantId: id, claims: [{ attr: 'bloom', value: [10, 11] }, { attr: 'pollinators', value: ['bees', 'moths'] }, { attr: 'light', value: ['sun'] }], original: 'TEST FIXTURE: flowers October to November, bees and moths visit' }); K.invalidate('test');
    const after = suggestMixes({ brief: brief2, cells: cellsB1, K }).recipes[0].members.map((m) => m.plantId);
    return { ok: !before.includes(id) && after.includes(id), before, after, trait: K.traits(id).bloom };
  });
  await test('K3', 'G3', 'Scope isolation: the project record is not visible to another project; illustrative off → value unknown', () => {
    const other = { ...emptyState({ id: 'detroit', name: 'x' }) }; const K2 = new ActiveKnowledge({ store, library: lib, teaching, project: () => other }); const t = K2.traits('sp.salvia-mainacht').bloom; K2.setScope('illustrative', false); const u = K2.traits('sp.m-echinacea-purpurea').bloom;
    return { ok: t.status === 'unknown' && u.status === 'unknown' && K.traits('sp.salvia-mainacht').bloom.source === 'project', other: t.status, illustrativeOff: u.status };
  });
  await test('K4', 'G3', 'Personal note saved without external verification, visible in the shared knowledge store, used by the design', async () => {
    const r = await lib.addRecord({ spId: 'sp.m-zizia-aurea', kind: 'pollinators', value: ['flies', 'bees'], note: 'TEST: I saw hoverflies on it' }); K.invalidate('t');
    const t = K.traits('sp.m-zizia-aurea').pollinators; const rec = lib.kb.state.records.get(r.recordId);
    return { ok: r.ok && t.source === 'personal' && !!rec && rec.context.text.includes('hoverflies'), source: t.source, statement: rec && rec.statement };
  });
  await test('K5', 'G3', 'Conflicting sources stay visible and a scoped choice selects one (no silent overwrite)', () => {
    P.addProjectKnowledge({ plantId: 'sp.m-echinacea-purpurea', claims: [{ attr: 'bloom', value: [7, 8, 9] }], original: 'TEST: later here' }); K.invalidate('t');
    const t1 = K.traits('sp.m-echinacea-purpurea').bloom; P.chooseSource('sp.m-echinacea-purpurea', 'bloom', 'illustrative'); K.invalidate('t'); const t2 = K.traits('sp.m-echinacea-purpurea').bloom;
    return { ok: t1.status === 'conflict' && t1.source === 'project' && t2.source === 'illustrative' && t2.alternatives.length === 1, before: [t1.status, t1.source, t1.value], after: [t2.source, t2.value] };
  });
  await test('K6', 'G3', 'Rules-mode intent reading is explicit and does not invent (unused words reported)', () => { const r = readIntent('Low maintenance pollinator planting from spring to autumn along the paths'); return { ok: r.objectives.pollinators.on && r.objectives.continuity.on && r.objectives.flowering.months[0] === 3 && r.unused.some((u) => u.startsWith('maintenance')), read: r.read, unused: r.unused }; });
  await test('K7', 'G3', 'Rules-mode edit: "keep the grass matrix, increase spring bloom" adds a spring plant and leaves matrix shares unchanged', () => {
    const mix = makeMix({ id: 'm', name: 'm', color: '#888', members: [{ plantId: 'sp.sporobolus-heterolepis', role: 'matrix', proportion: 0.5 }, { plantId: 'sp.m-echinacea-purpurea', role: 'seasonal', proportion: 0.5 }] });
    const r = interpretEdit('keep the grass matrix, increase spring bloom', mix, { K }); const base = r.proposed && r.proposed.layers.find((L) => L.slot === 'base'); const mat = base && base.members.find((m) => m.plantId === 'sp.sporobolus-heterolepis'); const mat0 = mix.layers.find((L) => L.slot === 'base').members.find((m) => m.plantId === 'sp.sporobolus-heterolepis');
    const added = r.proposed ? r.proposed.members.filter((m) => !mix.members.some((q) => q.plantId === m.plantId)) : [];
    return { ok: r.ok && mat && Math.abs(mat.share - mat0.share) < 0.002 && added.length === 1 && K.traits(added[0].plantId).bloom.value.some((m) => m <= 5), matched: r.matched, added: added.map((a) => a.plantId) };
  });
  await test('K8', 'G3', 'Unrecognised edit request is refused in Rules mode, not faked', () => { const mix = makeMix({ id: 'm', name: 'm', color: '#888', members: [{ plantId: 'sp.sporobolus-heterolepis', role: 'matrix', proportion: 1 }] }); const r = interpretEdit('make it feel more romantic', mix, { K }); return { ok: r.ok === false && /Not interpreted/.test(r.error), error: r.error }; });
  await test('L1', 'G3', 'Model answers are validated: invented evidence id, unknown plant, coordinates and bad sums are refused; a valid answer passes', () => {
    const req = { plants: [{ id: 'sp.a', evidence: ['e1'] }, { id: 'sp.b', evidence: [] }] };
    const good = { recipes: [{ name: 'x', members: [{ plantId: 'sp.a', role: 'seasonal', proportion: 0.6 }, { plantId: 'sp.b', role: 'matrix', proportion: 0.4 }], rationale: [{ text: 'r', refs: ['e1'] }] }] };
    const bad1 = { recipes: [{ ...good.recipes[0], rationale: [{ text: 'r', refs: ['e-invented'] }] }] };
    const bad2 = { recipes: [{ ...good.recipes[0], members: [{ plantId: 'sp.zzz', role: 'seasonal', proportion: 1 }] }] };
    const bad3 = { recipes: [{ ...good.recipes[0], members: [{ plantId: 'sp.a', role: 'seasonal', proportion: 1, x: 3 }] }] };
    const bad4 = { recipes: [{ ...good.recipes[0], members: [{ plantId: 'sp.a', role: 'seasonal', proportion: 0.3 }] }] };
    const v = [good, bad1, bad2, bad3, bad4].map((b) => validateSuggestion(b, req).ok);
    return { ok: v.join() === 'true,false,false,false,false', results: v, note: 'TEST FIXTURE — not model output' };
  });
  await test('L2', 'G3', 'No language model on a static page: the adapter reports Rules mode; no key in the client', async () => { const { MixReasoner } = await import('./llm.js'); const m = new MixReasoner({ K, endpoint: 'api/flow/llm-absent' }); const s = await m.probe(); const src = await fetch('src/flow/llm.js').then((r) => r.text()); return { ok: s.mode === 'rules' && !s.live && !/sk-ant|ANTHROPIC_API_KEY\s*=/.test(src), status: s }; });

  // ================================================================ Gate 2 · mixes, assignments, undo, variants (real project state)
  await test('M1', 'G2', 'Mix validation (V2 layers): a layer\'s proportions must sum to 100 %, density in range; normalise is exact', () => { const bad = validateMix({ name: 'x', layers: [{ id: 'emergent', slot: 'overlay', basis: 'count', density: 1, members: [{ plantId: 'sp.a', role: 'emergent', proportion: 0.5 }, { plantId: 'sp.b', role: 'emergent', proportion: 0.3 }] }] }); const n = normalize([{ proportion: 1 }, { proportion: 1 }, { proportion: 1 }]); return { ok: !bad.ok && bad.errors.some((e) => /sum/.test(e)) && n.reduce((a, m) => a + m.proportion, 0) === 1, errors: bad.errors, n: n.map((m) => m.proportion) }; });
  const prv = P.previewCells('bed.B2', 'honeycomb'); P.commitStructure('bed.B2', prv);
  const ids = P.state.beds['bed.B2'].cellIds; P.addMix(testMix);
  const mixB = makeMix({ id: 'mix.b', name: 'B', color: '#aa8866', members: [{ plantId: 'sp.m-monarda-fistulosa', role: 'seasonal', proportion: 0.6 }, { plantId: 'sp.eragrostis-spectabilis', role: 'matrix', proportion: 0.4 }] }); P.addMix(mixB);
  await test('D1', 'G2', 'One paint gesture across several cells is one undo step; undo and redo restore the same plants', () => {
    const f0 = fingerprint(P.state.instances); P.assign(ids.slice(0, 4), 'mix.test'); const f1 = fingerprint(P.state.instances); P.undo(); const f2 = fingerprint(P.state.instances); P.redo(); const f3 = fingerprint(P.state.instances);
    const draftRows = store.model.placements.filter((p) => p.kind === 'plants').reduce((a, p) => a + p.countModelled, 0);
    return { ok: f0 === f2 && f1 === f3 && f1 !== f0 && draftRows === +f1.split(':')[0], f0, f1, f2, f3, draftRows };
  });
  await test('D2', 'G2', 'Auto compose only fills the scope and never changes assigned cells', () => { const before = JSON.stringify(ids.slice(0, 4).map((c) => P.state.assignments[c].mixId)); const r = autoCompose({ scopeCells: ids.map((c) => P.state.cells[c]), allCells: P.allCells(), assignments: P.state.assignments, mixes: P.state.mixes, K, brief: P.state.brief, links: P.links() }); const touched = r.proposals.filter((p) => ids.slice(0, 4).includes(p.cellId)); const map = {}; for (const p of r.proposals) map[p.cellId] = p.mixId; P.assignMany(map); return { ok: !touched.length && r.proposals.length === ids.length - 4 && JSON.stringify(ids.slice(0, 4).map((c) => P.state.assignments[c].mixId)) === before, proposals: r.proposals.length }; });
  await test('D3', 'G2', 'Edit shared mix → update all uses rearranges only cells of that mix', () => {
    const usesA = P.usesOf('mix.test'), usesB = P.usesOf('mix.b'); const keepB = JSON.stringify(usesB.map((c) => P.state.instances[c].plants)); const prevA = JSON.stringify(usesA.map((c) => P.state.instances[c].plants));
    const next = editMix(P.mix('mix.test'), [{ op: 'setProportion', plantId: 'sp.m-echinacea-purpurea', proportion: 0.7, fix: true }]); P.applyMixEdit('mix.test', next, { scope: 'all' });
    return { ok: usesA.length > 0 && JSON.stringify(usesB.map((c) => P.state.instances[c].plants)) === keepB && JSON.stringify(usesA.map((c) => P.state.instances[c].plants)) !== prevA && usesA.every((c) => P.state.assignments[c].mixVersion === next.version), usesA: usesA.length, usesB: usesB.length, version: next.version };
  });
  await test('D4', 'G2', 'Local variant changes only the chosen cells; other cells of the shared mix are unchanged', () => {
    const uses = P.usesOf('mix.test'); const target = uses.slice(0, 1); const others = uses.slice(1); const keep = JSON.stringify(others.map((c) => P.state.instances[c].plants));
    const next = editMix(P.mix('mix.test'), [{ op: 'remove', plantId: 'sp.cornus-sericea' }]); P.applyMixEdit('mix.test', next, { scope: 'variant', cells: target });
    const v = P.mix(P.state.assignments[target[0]].mixId);
    return { ok: v.sourceMixId === 'mix.test' && JSON.stringify(others.map((c) => P.state.instances[c].plants)) === keep && !P.state.instances[target[0]].plants.some((p) => p.plantId === 'sp.cornus-sericea'), variant: v.id, others: others.length };
  });
  await test('D5', 'G2', 'Changing a bed\'s logic keeps the other bed and remaps by overlap; cancel = no change', () => {
    const p1 = P.previewCells('bed.B1', 'bands'); P.commitStructure('bed.B1', p1); P.assign(P.state.beds['bed.B1'].cellIds, 'mix.b');
    const keepB2 = fingerprint(Object.fromEntries(ids.map((c) => [c, P.state.instances[c]]).filter(([, v]) => v)));
    const before = fingerprint(P.state.instances); const p2 = P.previewCells('bed.B1', 'organic'); const imp = P.structureImpact('bed.B1', p2); const unchanged = fingerprint(P.state.instances) === before; // preview only
    P.commitStructure('bed.B1', p2, { remap: 'overlap' });
    const afterB2 = fingerprint(Object.fromEntries(ids.map((c) => [c, P.state.instances[c]]).filter(([, v]) => v)));
    const remapped = P.state.beds['bed.B1'].cellIds.filter((c) => P.state.assignments[c] && P.state.assignments[c].origin === 'remap').length;
    return { ok: unchanged && keepB2 === afterB2 && remapped === imp.carried && remapped > 0, carried: imp.carried, affected: imp.assignedCells };
  });
  await test('D6', 'G1', 'Reference planting is not overwritten; base model unchanged', () => { const d = store.baseline.placements; return { ok: d.length === baseCount && !d.some((p) => p.id.startsWith('pl.dz.')) && d.map((p) => p.id).join('|').length === baseFp && store.draft.model.placements.some((p) => p.id.startsWith('pl.dz.')), baseline: d.length }; });
  await test('D7', 'G1', 'Export holds brief, site units, cell geometry, recipes, quantities, plant x/y/z, performance and caveats', () => { const e = P.exportData(); const i = e.instances[0]; return { ok: e.site.units.includes('m') && e.cells.length > 0 && e.cells[0].geometry && e.mixes.length >= 2 && e.quantities.length > 0 && i && Number.isFinite(i.x) && Number.isFinite(i.z) && e.performance && e.performance.definitions && e.caveats.length >= 4, instances: e.instances.length, z: i && i.z }; });
  await test('D8', 'G1', 'Storage refused → save reports "not saved" and the design stays in memory', () => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; let r; try { r = P.save(); } finally { Storage.prototype.setItem = orig; } return { ok: r.ok === false && /not saved/.test(r.error) && P.totals().plants > 0, storage: r }; });
  await test('D9', 'G4', 'Timeline / view changes never change the design', () => { const f = fingerprint(P.state.instances); for (let m = 1; m <= 12; m++) P.setView({ month: m, explore: m % 2 ? 'pollinator' : 'adaptability' }); return { ok: fingerprint(P.state.instances) === f, f }; });
  await test('D10', 'G2', 'A plant beyond the catalogue can be added (generic proxy, labelled) and placed', () => {
    const r = P.addPlant({ name: 'Pycnanthemum tenuifolium', plantType: 'forb', original: 'TEST: slender mountain mint' }); P.addProjectKnowledge({ plantId: r.id, claims: [{ attr: 'bloom', value: [7, 8] }], original: 'TEST' }); K.invalidate('t');
    const m = editMix(P.mix('mix.b'), [{ op: 'add', plantId: r.id, role: 'seasonal', proportion: 0.2 }]); P.applyMixEdit('mix.b', m, { scope: 'all' });
    const placed = Object.values(P.state.instances).reduce((a, i) => a + i.plants.filter((p) => p.plantId === r.id).length, 0); const sp = store.getObject(r.id);
    return { ok: r.ok && sp && sp.runtime && placed > 0 && K.traits(r.id).proxy, id: r.id, placed };
  });

  // ================================================================ V2 · strategy, multi-bed structure, fill engine, live brush, layers
  const legendFile = await fetch('data/detroit/mixes.json').then((r) => r.json());
  const LG = legendFile.mixes.map((m, i) => convertLegendRecipe(m, { colorIndex: i, exists: (id) => !!store.getObject(id) }));
  const V = new Project({ store, cs, K, site: { id: 'detroit', name: 'Oudolf Garden Detroit' } }); P = V; // the knowledge reads this project from here on
  const fpOf = (inst, keep = () => true) => { let h = 2166136261 >>> 0, n = 0; for (const c of Object.keys(inst).sort()) for (const p of inst[c].plants) { if (!keep(p, c)) continue; n++; for (const ch of `${c}|${p.id}|${p.x}|${p.y};`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } } return `${n}:${h.toString(16)}`; };
  await test('V1', 'V2-B', 'Strategy (Rules mode): the V2 intent over Main Garden gives ≥ 3 zones with different systems / logics; meadows kept; ≥ 15 beds; one confirm', () => {
    const s = proposeStrategy(V, { intent: 'Keep the meadows, use a coherent matrix-based planting along the main garden paths, add early flowers beneath trees, and support pollinators throughout the season.', scope: 'site' });
    const sys = new Set(s.zones.map((z) => z.system)), lg = new Set(s.zones.map((z) => z.logic)); const past = V.past.length; V.confirmStrategy(s);
    return { ok: s.zones.length >= 3 && sys.size >= 2 && lg.size >= 2 && s.kept.length === 2 && s.beds >= 15 && V.past.length === past + 1, zones: s.zones.map((z) => [z.name, z.system, z.logic, z.bedIds.length]), kept: s.kept, rules: s.rules.map((r) => r[0]) };
  });
  const zones = V.state.strategy.zones; const pzone = zones.find((z) => z.logic === 'bands');
  const previews = zones.flatMap((z) => z.bedIds.map((id) => { const r = V.previewCells(id, z.logic, z.logic === 'bands' ? { guide: 'path' } : {}); r.zoneId = z.id; return r; }));
  await test('V2', 'V2-C', 'Structure: every bed of the strategy previewed and committed in ONE undo step; cells valid (no overlap, inside plantable)', () => {
    const past = V.past.length; const r = V.commitStructureMany(previews); let bad = []; for (const pv of previews) { if (!pv.ok) { bad.push(pv.bedId + ': ' + pv.error); continue; } const v = validity(pv, V.plantable(pv.bedId)); if (!v.ok) bad.push(pv.bedId + JSON.stringify(v)); }
    return { ok: r.ok !== false && V.past.length === past + 1 && Object.keys(V.state.beds).length === previews.length && !bad.length, beds: Object.keys(V.state.beds).length, cells: V.allCells().length, bad: bad.slice(0, 4) };
  });
  await test('V3', 'V2-C', 'Curved bands follow the path edge on real beds (curved flag, ≥ 2 cells) and size changes the candidates', () => {
    const b = pzone.bedIds[0]; const a = V.previewCells(b, 'bands', { guide: 'path', size: 2.5 }), c = V.previewCells(b, 'bands', { guide: 'path', size: 4.5 });
    return { ok: a.ok && a.params.curved && a.cells.length >= 2 && c.cells.length !== a.cells.length, bed: b, curved: a.params.curved, n25: a.cells.length, n45: c.cells.length, note: a.adaptation.notes[0] };
  });
  await test('V4', 'V2-C', 'Straight bands of a zone share one world anchor: the band phase across two beds is identical (continues across the path)', () => {
    const [b1, b2] = pzone.bedIds; const angle = 20; const anchor = [0, 0]; const r1 = V.previewCells(b1, 'bands', { guide: 'straight', angle, size: 3, anchor }), r2 = V.previewCells(b2, 'bands', { guide: 'straight', angle, size: 3, anchor });
    const n = [-Math.sin(angle * Math.PI / 180), Math.cos(angle * Math.PI / 180)]; const ph = (r) => { const vals = []; for (const c of r.cells) for (const p of C(c.geometry)) for (const [x, y] of p[0]) vals.push(((x * n[0] + y * n[1]) % 3 + 3) % 3); return vals; };
    const near0 = (v) => Math.min(v, 3 - v) < 0.02; const s1 = ph(r1).filter(near0).length, s2 = ph(r2).filter(near0).length;
    return { ok: r1.ok && r2.ok && s1 > 3 && s2 > 3 && r1.params.angle === angle && r2.params.angle === angle, s1, s2 };
  });
  for (const m of LG) V.addMix(m);
  const matrix = V.mix(LG.find((m) => m.system === 'matrix-based').id), colour = V.mix(LG.find((m) => m.system === 'maximal-color').id);
  await test('V5', 'V2-D', 'Layered mixes: base (area shares + spacing), overlay (own density), drift (coverage); each layer is its own 100 %; 4 system templates exist', () => {
    const L = (m, s) => m.layers.filter((q) => q.slot === s); const sum = (q, k) => q.members.reduce((a, x) => a + x[k], 0);
    return { ok: L(matrix, 'base').length === 1 && L(matrix, 'overlay').length >= 1 && Math.abs(sum(L(matrix, 'base')[0], 'share') - 1) < 0.002 && Math.abs(sum(L(matrix, 'overlay')[0], 'proportion') - 1) < 0.002 && Object.keys(SYSTEMS).length === 4 && matrix.density.value !== 4.5, layers: matrix.layers.map((q) => [q.id, q.basis, q.members.length]), density: matrix.layerDensity };
  });
  await test('V6', 'V2-D', 'World-anchored lattice: the same mix gives identical candidates (ids and x/y) in overlapping windows; two mixes differ', () => {
    const a = candidates(matrix, [0, 0, 6, 6]), b = candidates(matrix, [3, 3, 9, 9]); const inB = new Map(b.map((q) => [q.key, q])); const shared = a.filter((q) => q.x >= 3.5 && q.y >= 3.5 && q.x <= 5.5 && q.y <= 5.5);
    const same = shared.every((q) => inB.has(q.key) && inB.get(q.key).x === q.x && inB.get(q.key).y === q.y); const c = candidates(colour, [0, 0, 6, 6]);
    return { ok: shared.length > 10 && same && JSON.stringify(c.slice(0, 5)) !== JSON.stringify(a.slice(0, 5)), shared: shared.length };
  });
  const cellsOf = (bed) => V.state.beds[bed].cellIds; const bedA = pzone.bedIds[0];
  await test('V7', 'V2-D', 'Cell Fill: counts follow each layer (base ≈ area × Σ share × hex density, overlay ≈ area × density); changing the overlay density changes overlay plants only', () => {
    const c = cellsOf(bedA)[0]; V.assign([c], matrix.id); const inst = V.state.instances[c]; const n = (s) => inst.plants.filter((p) => p.slot === s).length; const baseBefore = fpOf(V.state.instances, (p, cc) => cc === c && p.slot === 'base');
    const ov = matrix.layers.find((q) => q.slot === 'overlay'); const next = editMix(matrix, [{ op: 'setLayer', layer: ov.id, density: ov.density * 6 }]); const o0 = n('overlay'); V.applyMixEdit(matrix.id, next, { scope: 'all' }); const inst2 = V.state.instances[c]; const o1 = inst2.plants.filter((p) => p.slot === 'overlay').length;
    const baseAfter = fpOf(V.state.instances, (p, cc) => cc === c && p.slot === 'base'); const area = V.state.cells[c].areaM2;
    return { ok: n('base') > 0 && o1 > o0 && baseBefore.split(':')[0] === baseAfter.split(':')[0] && Math.abs(inst.target - inst.placed) / inst.target < 0.35, area, base: n('base'), overlayBefore: o0, overlayAfter: o1, target: inst.target, placed: inst.placed };
  });
  const allIn = () => Object.entries(V.state.instances).every(([c, i]) => i.plants.every((p) => inside(V.state.cells[c].geometry, p.x, p.y)));
  // a stroke across two beds of the path zone (centre to centre crosses the walk between them)
  const cen = (bed) => { const cs2 = cellsOf(bed).map((i) => V.state.cells[i].center); return [cs2.reduce((a, q) => a + q[0], 0) / cs2.length, cs2.reduce((a, q) => a + q[1], 0) / cs2.length]; };
  const nearestOther = (bed) => { const a = cen(bed); return Object.keys(V.state.beds).filter((b) => b !== bed).map((b) => [b, Math.hypot(cen(b)[0] - a[0], cen(b)[1] - a[1])]).sort((x, y) => x[1] - y[1])[0][0]; };
  const bed1 = 'bed.B1', bed2 = 'bed.B2'; const p1 = cen(bed1), p2 = cen(bed2);
  const FB = { P: V, brushLog: [] }; FB.P = V; const B = new Brush(FB); Object.defineProperty(FB, 'P', { value: V });
  const stroke = (mixId, slots = null, n = 24, r = 1.4) => { B.start({ mixId, slots, r }); B.down(p1[0], p1[1]); const seen = []; for (let k = 1; k <= n; k++) { B.move(p1[0] + (p2[0] - p1[0]) * k / n, p1[1] + (p2[1] - p1[1]) * k / n); seen.push(B.stroke.added); } return seen; };
  await test('V8', 'V2-E', 'Live brush: staged instances grow DURING the drag (before pointer-up), the stroke crosses two beds and the walk, the commit is one undo step, no plant outside a cell', () => {
    const before = fpOf(V.state.instances); const past = V.past.length; const seen = stroke(colour.id); const staged = B.stagedPlants().length; const persistedBefore = fpOf(V.state.instances) === before;
    const r = B.up(); const grew = seen.filter((v, i) => i && v > seen[i - 1]).length;
    return { ok: staged > 50 && persistedBefore && grew >= 6 && r.ok && r.beds === 2 && V.past.length === past + 1 && allIn(), staged, grewSteps: grew, committedAdded: r.added, beds: r.beds, cells: r.cells, meanMoveMs: r.meanMoveMs };
  });
  await test('V9', 'V2-E', 'Repeating the same stroke adds nothing (same lattice ids, no stacking); Esc cancel leaves the state unchanged; undo / redo one stroke', () => {
    const f0 = fpOf(V.state.instances); stroke(colour.id); const again = B.up(); const f1 = fpOf(V.state.instances);
    stroke(matrix.id); B.cancel(); const f2 = fpOf(V.state.instances); V.undo(); const f3 = fpOf(V.state.instances); V.redo(); const f4 = fpOf(V.state.instances);
    return { ok: f1 === f0 && f2 === f1 && f4 === f1, repeatAdded: again.added, f0, f1, f2, undone: f3, redone: f4 };
  });
  await test('V10', 'V2-F', 'Brush affects only its footprint: plants of the same cells outside the stroke keep their coordinates; other beds untouched', () => {
    const cells = Object.keys(V.state.instances); const fpOutside = fpOf(V.state.instances, (p) => Math.hypot(p.x - (p1[0] + p2[0]) / 2, p.y - (p1[1] + p2[1]) / 2) > 30);
    const fill = cellsOf(bed1).slice(0, 6); V.assign(fill, matrix.id); const keep = fpOf(V.state.instances, (p, c) => fill.includes(c) && segDist(p.x, p.y) > 2.2);
    stroke(colour.id); B.up(); const keep2 = fpOf(V.state.instances, (p, c) => fill.includes(c) && segDist(p.x, p.y) > 2.2);
    return { ok: keep === keep2 && fpOutside === fpOf(V.state.instances, (p) => Math.hypot(p.x - (p1[0] + p2[0]) / 2, p.y - (p1[1] + p2[1]) / 2) > 30), keep, keep2, cells: cells.length };
  });
  function segDist(x, y) { const vx = p2[0] - p1[0], vy = p2[1] - p1[1]; const L2 = vx * vx + vy * vy; let t = ((x - p1[0]) * vx + (y - p1[1]) * vy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p1[0] + t * vx - x, p1[1] + t * vy - y); }
  await test('V11', 'V2-F', 'Overlay-only stroke: the existing matrix (base) under the stroke is kept, only overlay plants change', () => {
    const fill = cellsOf(bed1); V.assign(fill, matrix.id); const base0 = fpOf(V.state.instances, (p, c) => fill.includes(c) && p.slot === 'base'); const ov0 = fpOf(V.state.instances, (p, c) => fill.includes(c) && p.slot === 'overlay');
    stroke(colour.id, ['overlay']); const r = B.up(); const base1 = fpOf(V.state.instances, (p, c) => fill.includes(c) && p.slot === 'base'); const ov1 = fpOf(V.state.instances, (p, c) => fill.includes(c) && p.slot === 'overlay');
    return { ok: base0 === base1 && ov0 !== ov1 && r.ok, base0, base1, ov0, ov1 };
  });
  await test('V12', 'V2-F', 'Freeze: a frozen cell is skipped by the brush, by Cell Fill and by a shared mix edit', () => {
    const c = cellsOf(bed1)[0]; V.setLock([c]); const f0 = fpOf(V.state.instances, (p, cc) => cc === c); stroke(colour.id); B.up(); V.assign([c], colour.id); const e = editMix(V.mix(matrix.id), [{ op: 'setDensity', value: V.mix(matrix.id).density.value * 1.3 }]); V.applyMixEdit(matrix.id, e, { scope: 'all' }); const f1 = fpOf(V.state.instances, (p, cc) => cc === c); V.setLock([c], false);
    return { ok: f0 === f1, f0, f1 };
  });
  await test('V13', 'V2-F', 'Local variant changes only the selected cells; Auto Compose fills only unplanted cells with the same engine (plants carry lattice ids)', () => {
    const used = V.usesOf(matrix.id); const sel = used.slice(0, 2); const other = used.slice(2); const f0 = fpOf(V.state.instances, (p, c) => other.includes(c)); const v = editMix(V.mix(matrix.id), [{ op: 'setDensity', value: V.mix(matrix.id).density.value * 0.7 }]); V.applyMixEdit(matrix.id, v, { scope: 'variant', cells: sel }); const f1 = fpOf(V.state.instances, (p, c) => other.includes(c));
    const scope = V.allCells().filter((c) => !(V.state.instances[c.id] && V.state.instances[c.id].plants.length)).slice(0, 6); const planted0 = fpOf(V.state.instances); const ac = autoCompose({ scopeCells: scope, allCells: V.allCells(), assignments: V.state.assignments, mixes: V.state.mixes, K, brief: V.state.brief, links: V.links() }); V.assignMany(Object.fromEntries(ac.proposals.map((q) => [q.cellId, q.mixId])));
    const newOnes = scope.every((c) => V.state.instances[c.id] && V.state.instances[c.id].plants.every((p) => /\//.test(p.id)));
    return { ok: f0 === f1 && sel.every((c) => V.state.assignments[c].fragments.some((f) => f.mixId.includes('.v'))) && newOnes && ac.proposals.length === scope.length, variantCells: sel.length, auto: ac.proposals.length };
  });
  await test('V14', 'V2-G', 'FIXTURE distribution: same area, same plant count, same presence — different flowering counts give different fraction and per m² (unknown counted apart)', () => {
    const FK = fakeK({ A: T([6], ['bees']), B: T([9], ['bees']), U: T(null, null) }); const cell = (id, x) => ({ ...cA, id, label: id, neighbors: [], geometry: MP(rect(x, 0, x + 4, 4)), areaM2: 16, center: [x + 2, 2] });
    const mk = (ids) => ({ plants: ids.map((id, i) => ({ id: id + i, x: i % 4 + 0.5, y: Math.floor(i / 4) + 0.5, plantId: id, slot: 'base', fit: 'unknown' })) });
    const x = cell('x', 0), y = cell('y', 10); const ix = mk(['A', 'A', 'A', 'A', 'A', 'A', 'B', 'B', 'U', 'U', 'B', 'B']), iy = mk(['A', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'U', 'U', 'B']);
    const p = computePerformance({ cells: [x, y], assignments: { x: { mixId: 'm' }, y: { mixId: 'm' } }, instances: { x: ix, y: iy }, mixes: [], K: FK, brief }); const a = p.perCell.x.months[6], b = p.perCell.y.months[6];
    return { ok: a.state === 'resource' && b.state === 'resource' && a.instances === 6 && b.instances === 1 && a.fraction !== b.fraction && a.unknownInstances === 2 && b.unknownInstances === 2 && p.byMonth[6].placed === 24, x: [a.instances, a.fraction, a.perM2], y: [b.instances, b.fraction, b.perM2] };
  });
  await test('V15', 'V2-J', 'Save → reload (restore) keeps fragments, layers, plant ids / x / y, locks and strategy; export has z per plant and assumptions', () => {
    V.setLock([cellsOf(bed1)[1]]); V.save(); const o = Project.stored(); const W = new Project({ store, cs, K, site: { id: 'detroit', name: 'Oudolf Garden Detroit' } }); W.restore(o);
    const e = V.exportData(); const i = e.instances[0]; P = V;
    return { ok: fpOf(W.state.instances) === fpOf(V.state.instances) && JSON.stringify(W.state.locks) === JSON.stringify(V.state.locks) && !!W.state.strategy && e.cells.some((c) => c.fragments.length) && Number.isFinite(i.z) && i.slot && e.assumptions.length >= 2, plants: e.instances.length, fp: fpOf(W.state.instances) };
  });
  await test('V16', 'V2-L', 'Base model unchanged by the V2 design (baseline placements identical)', () => { const d = store.baseline.placements; return { ok: d.length === baseCount && !d.some((p) => p.id.startsWith('pl.dz.')), n: d.length }; });
  return { tests: R, passed: R.filter((x) => x.ok).length, failed: R.filter((x) => !x.ok).length, ms: Math.round(performance.now() - t0), when: new Date().toISOString() };
}
