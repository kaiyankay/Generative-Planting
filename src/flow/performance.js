// Performance (V2). Everything is derived from the PLACED instances (instances[cell].plants) and the known traits of their
// species — never from mix descriptions, never one ecological score. Denominators are stated. Proxies and their limits:
//   presence       a cell offers a known flower resource in month m if ≥ 1 placed plant is known to flower in m and is not
//                  known to be wind-pollinated. Presence only.
//   distribution   per cell and month: flowering instances (count), known flowering fraction = flowering instances /
//                  placed instances in the cell, flowering instances per m²; unknown instances counted apart (never 0,
//                  never "support"). Not nectar or pollen quantity.
//   groups         documented pollinator groups of the flowering instances (association, not visitation); unknown apart
//   continuity     resource units (cells with presence) linked by adjacency (shared boundary ≥ 0.3 m) or ≤ 3 m across a
//                  path; components and isolated units, for all units and for STRONG units (≥ strongPerM2 flowering
//                  plants / m² — prototype threshold). Potential resource connection, not insect flight.
//   adaptability   per placed plant: its recorded light vs the crown proxy at its own position (match / conflict /
//                  unknown); moisture has no site data → unknown. Members that could not be placed are a shortfall, not a conflict.
//   seasonality    per instance: flowering / not / unknown in the month (known months only; no growth model)
import { MONTHS } from './knowledge.js';

export const PERF_VERSION = 'perf/2';
export const PERF = { strongPerM2: 1.0 };

export function computePerformance({ cells, assignments, instances, mixes, K, brief, links = [] }) {
  const months = brief && brief.objectives.flowering.on ? brief.objectives.flowering.months : [3, 4, 5, 6, 7, 8, 9, 10];
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const species = new Set(); const perCell = {};
  let assignedArea = 0, totalArea = 0, nInst = 0;
  const groupsOf = (id) => { const t = K.traits(id); return t.pollinators.status !== 'unknown' ? t.pollinators.value : null; };
  for (const c of cells) {
    totalArea += c.areaM2;
    const a = assignments[c.id]; const inst = instances[c.id];
    if (!inst || !inst.plants.length) { perCell[c.id] = { status: a && a.empty ? 'empty' : 'unassigned', months: {}, plants: 0 }; continue; }
    assignedArea += c.areaM2; nInst += inst.plants.length;
    const sp = new Map(); for (const p of inst.plants) { sp.set(p.plantId, (sp.get(p.plantId) || 0) + 1); species.add(p.plantId); }
    const n = inst.plants.length; const mo = {};
    for (let m = 1; m <= 12; m++) {
      const yes = [], unk = []; let nYes = 0, nUnk = 0; const groups = new Map(); let gUnk = 0;
      for (const [id, k] of sp) { const r = K.resourceIn(id, m); if (r === 'yes') { yes.push(id); nYes += k; const g = groupsOf(id); if (g) for (const x of g) groups.set(x, (groups.get(x) || 0) + k); else gUnk += k; } else if (r === 'unknown') { unk.push(id); nUnk += k; } }
      mo[m] = { state: yes.length ? 'resource' : unk.length ? 'uncertain' : 'none', species: yes, unknownSpecies: unk, instances: nYes, unknownInstances: nUnk, placed: n,
        fraction: +(nYes / n).toFixed(3), unknownFraction: +(nUnk / n).toFixed(3), perM2: +(nYes / c.areaM2).toFixed(2),
        groups: [...groups.keys()].sort(), groupCounts: Object.fromEntries([...groups.entries()].sort()), groupsUnknownInstances: gUnk };
    }
    const fit = { match: 0, conflict: 0, unknown: 0, substituted: 0 }; const conflicts = new Map();
    for (const p of inst.plants) { fit[p.fit || 'unknown']++; if (p.sub) fit.substituted++; if (p.fit === 'conflict') conflicts.set(p.plantId, (conflicts.get(p.plantId) || 0) + 1); }
    const status = fit.conflict ? 'conflict' : fit.unknown === n ? 'uncertain' : fit.unknown ? 'partly uncertain' : 'match';
    perCell[c.id] = { status: 'planted', mixId: a && a.mixId, byMix: inst.byMix || {}, plants: n, species: [...sp.keys()], months: mo,
      adaptability: { status: status === 'partly uncertain' ? 'uncertain' : status, fit, conflicts: [...conflicts.entries()].map(([plantId, k]) => ({ plantId, instances: k, msg: `${K.traits(plantId).name}: ${k} plant${k === 1 ? '' : 's'} recorded for the other light than the crown proxy at their position` })), moisture: 'unknown (no site data)' } };
  }
  const nb = new Map(cells.map((c) => [c.id, new Set(c.neighbors.map((q) => q.id))]));
  for (const l of links) { nb.get(l.a)?.add(l.b); nb.get(l.b)?.add(l.a); }
  const comps = (ids) => { const set = new Set(ids); const seen = new Set(); const out = []; for (const id of ids) { if (seen.has(id)) continue; const cmp = []; const stack = [id]; seen.add(id); while (stack.length) { const x = stack.pop(); cmp.push(x); for (const y of nb.get(x) || []) if (set.has(y) && !seen.has(y)) { seen.add(y); stack.push(y); } } out.push(cmp.sort()); } return out.sort((a, b) => b.length - a.length); };
  const area = (list) => list.reduce((s, id) => s + cellById.get(id).areaM2, 0);
  const byMonth = {};
  for (let m = 1; m <= 12; m++) {
    const planted = cells.filter((c) => perCell[c.id].status === 'planted');
    const res = planted.filter((c) => perCell[c.id].months[m].state === 'resource').map((c) => c.id);
    const unc = planted.filter((c) => perCell[c.id].months[m].state === 'uncertain').map((c) => c.id);
    const strong = res.filter((id) => perCell[id].months[m].perM2 >= PERF.strongPerM2);
    let flowering = 0, unknownI = 0; const groups = new Map(); let gUnk = 0;
    for (const c of planted) { const q = perCell[c.id].months[m]; flowering += q.instances; unknownI += q.unknownInstances; gUnk += q.groupsUnknownInstances; for (const [g, k] of Object.entries(q.groupCounts)) { const e = groups.get(g) || { instances: 0, cells: 0, species: new Set() }; e.instances += k; e.cells++; for (const id of q.species) if ((groupsOf(id) || []).includes(g)) e.species.add(id); groups.set(g, e); } }
    const C = comps(res), CS = comps(strong); const resArea = area(res);
    byMonth[m] = {
      month: m, label: MONTHS[m - 1], designedAreaM2: +assignedArea.toFixed(1), placed: nInst,
      floweringInstances: flowering, floweringFraction: nInst ? +(flowering / nInst).toFixed(3) : null, unknownInstances: unknownI, unknownFraction: nInst ? +(unknownI / nInst).toFixed(3) : null,
      floweringPerM2: assignedArea ? +(flowering / assignedArea).toFixed(2) : null,
      resourceCells: res.length, uncertainCells: unc.length, strongCells: strong.length, resourceAreaM2: +resArea.toFixed(1), assignedAreaM2: +assignedArea.toFixed(1),
      resourceShare: assignedArea ? +(resArea / assignedArea).toFixed(3) : null,
      groups: [...groups.entries()].map(([g, e]) => ({ group: g, instances: e.instances, cells: e.cells, species: [...e.species] })).sort((a, b) => a.group.localeCompare(b.group)), groupsUnknownInstances: gUnk,
      components: C.map((cmp) => ({ cells: cmp, areaM2: +area(cmp).toFixed(1) })), isolated: C.filter((c) => c.length === 1 && res.length > 1).map((c) => c[0]),
      strongComponents: CS.map((cmp) => ({ cells: cmp, areaM2: +area(cmp).toFixed(1) })),
      largestComponentShare: resArea ? +(area(C[0] || []) / resArea).toFixed(3) : null,
    };
  }
  const cov = { bloom: 0, pollinators: 0, light: 0, illustrative: 0 };
  for (const c of cells) { const inst = instances[c.id]; if (!inst) continue; for (const p of inst.plants) { const t = K.traits(p.plantId); if (t.bloom.status !== 'unknown') cov.bloom++; if (t.pollinators.status !== 'unknown' || t.windPollinated === true) cov.pollinators++; if (t.light.status !== 'unknown') cov.light++; if ([t.bloom, t.pollinators, t.light].some((x) => x.source === 'illustrative')) cov.illustrative++; } }
  const coverage = Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, nInst ? +(v / nInst).toFixed(3) : null]));
  const issues = findIssues({ cells, perCell, byMonth, months, K, coverage });
  return { version: PERF_VERSION, inputVersion: K.version(), months, perCell, byMonth, coverage, instances: nInst, assignedAreaM2: +assignedArea.toFixed(1), totalAreaM2: +totalArea.toFixed(1), species: [...species].sort(), issues, thresholds: { ...PERF },
    definitions: {
      presence: 'cell has ≥ 1 placed plant known to flower that month and not known to be wind-pollinated (presence only)',
      distribution: 'flowering instances per cell; known flowering fraction = flowering instances / placed instances (denominator: placed plants in the designed cells); per m² of designed cell area; unknown counted apart',
      groups: 'documented pollinator groups of the flowering instances (association, not visitation)',
      continuity: `connected resource cells (shared boundary ≥ 0.3 m, or ≤ 3 m across a path); strong = ≥ ${PERF.strongPerM2} flowering plants / m² (prototype threshold). Potential connection, not flight`,
      adaptability: 'recorded light of each placed plant vs the crown proxy at its position; soil moisture has no data → unknown',
      scope: 'designed cells only; the reference planting outside the scope is not counted',
    } };
}

function findIssues({ cells, perCell, byMonth, months, K, coverage }) {
  const out = []; const planted = cells.filter((c) => perCell[c.id].status === 'planted');
  if (!planted.length) return out;
  for (const m of months) {
    const b = byMonth[m];
    if (!b.resourceCells) out.push({ id: `gap.${m}`, type: 'gap', severity: b.uncertainCells ? 'uncertain' : 'gap', month: m, cells: b.uncertainCells ? planted.filter((c) => perCell[c.id].months[m].state === 'uncertain').map((c) => c.id) : planted.map((c) => c.id), title: b.uncertainCells ? `${MONTHS[m - 1]}: flowering unknown` : `${MONTHS[m - 1]}: no known flower resource`, detail: b.uncertainCells ? `${b.unknownInstances} placed plants have unknown flowering; none is known to flower in ${MONTHS[m - 1]}.` : `No placed plant is known to flower in ${MONTHS[m - 1]} (a month of your brief).`, actions: ['editMix', 'knowledge'] });
    else {
      const weak = planted.filter((c) => perCell[c.id].months[m].state === 'resource' && perCell[c.id].months[m].perM2 < 0.25).map((c) => c.id);
      if (b.components.length > 1) out.push({ id: `split.${m}`, type: 'isolated', severity: 'gap', month: m, cells: b.components.slice(1).flatMap((x) => x.cells), title: `${MONTHS[m - 1]}: resources in ${b.components.length} separate groups`, detail: `The largest group holds ${Math.round(b.largestComponentShare * 100)} % of the resource area; the others are not adjacent (continuity proxy).`, actions: ['reassign'] });
      if (weak.length) out.push({ id: `weak.${m}`, type: 'weak', severity: 'info', month: m, cells: weak, title: `${MONTHS[m - 1]}: ${weak.length} cell${weak.length === 1 ? '' : 's'} with a thin resource`, detail: `Fewer than 0.25 flowering plants / m² — present, but sparse.`, actions: ['reassign', 'editMix'] });
    }
  }
  for (const c of planted) { const ad = perCell[c.id].adaptability; if (ad.fit.conflict) out.push({ id: `fit.${c.id}`, type: 'conflict', severity: 'conflict', cells: [c.id], mixId: perCell[c.id].mixId, species: ad.conflicts.map((x) => x.plantId), title: `${c.label}: ${ad.fit.conflict} plant${ad.fit.conflict === 1 ? '' : 's'} against the light proxy`, detail: ad.conflicts.map((x) => x.msg).join('; '), actions: ['editMix', 'reassign'] }); }
  const un = cells.filter((c) => perCell[c.id].status === 'unassigned'); if (un.length) out.push({ id: 'unassigned', type: 'unassigned', severity: 'info', cells: un.map((c) => c.id), title: `${un.length} cell${un.length === 1 ? '' : 's'} not planted yet`, detail: 'Paint, fill or Auto Compose them, or leave them empty on purpose.', actions: ['reassign'] });
  if (coverage.bloom != null && coverage.bloom < 1) { const unk = [...new Set(planted.flatMap((c) => perCell[c.id].species))].filter((id) => K.traits(id).bloom.status === 'unknown'); if (unk.length) out.push({ id: 'unknown.bloom', type: 'unknown', severity: 'uncertain', species: unk, cells: planted.filter((c) => perCell[c.id].species.some((s) => unk.includes(s))).map((c) => c.id), title: `${unk.length} placed species with unknown flowering`, detail: 'Their months stay unknown — never counted as no resource. Add what you know in Knowledge.', actions: ['knowledge', 'editMix'] }); }
  return out;
}

export function summarize(perf) {
  if (!perf) return null;
  return { version: perf.version, inputVersion: perf.inputVersion, instances: perf.instances, assignedAreaM2: perf.assignedAreaM2, coverage: perf.coverage,
    months: Object.fromEntries(Object.values(perf.byMonth).map((b) => [b.month, { resourceShare: b.resourceShare, resourceCells: b.resourceCells, uncertainCells: b.uncertainCells, floweringInstances: b.floweringInstances, floweringFraction: b.floweringFraction, floweringPerM2: b.floweringPerM2, unknownInstances: b.unknownInstances, groups: b.groups.length, components: b.components.length, strongComponents: b.strongComponents.length, isolated: b.isolated.length }])) };
}
