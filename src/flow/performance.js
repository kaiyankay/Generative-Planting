// Performance (Pollinator Support module first). Everything is derived from the PLACED instances and the known traits of
// their species — never from mix descriptions, never a score. Proxies, with their limits:
//   resource      a cell offers a known flower resource in month m if ≥ 1 placed species is known to flower in m and is not
//                 known to be wind-pollinated. Presence proxy — not nectar quantity, not pollinator abundance.
//   uncertain     no known resource that month but some placed species has unknown flowering (never "no resource")
//   groups        union of documented pollinator groups of the species flowering that month (association, not visitation)
//   continuity    connected components of resource cells over cell adjacency (shared boundary ≥ 0.3 m) and "near" links
//                 across a path (≤ 3 m). Potential continuity of resources, not insect movement.
//   seasonality   per instance: flowering / not / unknown in the month (actual known trait; no growth simulation)
//   adaptability  known plant requirement vs known cell condition: match / conflict / uncertain, with the reason
import { MONTHS } from './knowledge.js';
import { compatibility } from './compose.js';

export const PERF_VERSION = 'perf/1';

export function computePerformance({ cells, assignments, instances, mixes, K, brief, links = [] }) {
  const months = brief && brief.objectives.flowering.on ? brief.objectives.flowering.months : [3, 4, 5, 6, 7, 8, 9, 10];
  const mixById = new Map(mixes.map((m) => [m.id, m]));
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const species = new Set(); const perCell = {};
  let assignedArea = 0, totalArea = 0;
  for (const c of cells) {
    totalArea += c.areaM2;
    const a = assignments[c.id]; const inst = instances[c.id];
    if (!a || !a.mixId || !inst || !inst.plants.length) { perCell[c.id] = { status: a && a.empty ? 'empty' : 'unassigned', months: {} }; continue; }
    assignedArea += c.areaM2;
    const sp = new Map(); for (const p of inst.plants) { sp.set(p.plantId, (sp.get(p.plantId) || 0) + 1); species.add(p.plantId); }
    const mo = {};
    for (let m = 1; m <= 12; m++) {
      const yes = [], unk = []; let nYes = 0;
      for (const [id, n] of sp) { const r = K.resourceIn(id, m); if (r === 'yes') { yes.push(id); nYes += n; } else if (r === 'unknown') unk.push(id); }
      const groups = new Set(); let groupsUnknown = 0; for (const id of yes) { const t = K.traits(id); if (t.pollinators.status !== 'unknown') for (const g of t.pollinators.value) groups.add(g); else groupsUnknown++; }
      mo[m] = { state: yes.length ? 'resource' : unk.length ? 'uncertain' : 'none', species: yes, unknownSpecies: unk, instances: nYes, groups: [...groups].sort(), groupsUnknown };
    }
    const mix = mixById.get(a.mixId); const comp = mix ? compatibility(c, mix, K) : null;
    perCell[c.id] = { status: 'planted', mixId: a.mixId, plants: inst.plants.length, species: [...sp.keys()], months: mo, adaptability: comp ? { status: comp.status, conflicts: comp.soft, unknown: comp.unknown, match: comp.match } : null };
  }
  // adjacency for continuity
  const nb = new Map(cells.map((c) => [c.id, new Set(c.neighbors.map((n) => n.id))]));
  for (const l of links) { nb.get(l.a)?.add(l.b); nb.get(l.b)?.add(l.a); }
  const byMonth = {};
  for (let m = 1; m <= 12; m++) {
    const res = cells.filter((c) => perCell[c.id].months[m]?.state === 'resource');
    const unc = cells.filter((c) => perCell[c.id].months[m]?.state === 'uncertain');
    const groups = new Map(); for (const c of res) for (const g of perCell[c.id].months[m].groups) { const e = groups.get(g) || { cells: 0, species: new Set() }; e.cells++; for (const id of perCell[c.id].months[m].species) { const t = K.traits(id); if (t.pollinators.status !== 'unknown' && t.pollinators.value.includes(g)) e.species.add(id); } groups.set(g, e); }
    // connected components over resource cells
    const ids = new Set(res.map((c) => c.id)); const seen = new Set(); const comps = [];
    for (const c of res) { if (seen.has(c.id)) continue; const comp = []; const st = [c.id]; seen.add(c.id); while (st.length) { const x = st.pop(); comp.push(x); for (const y of nb.get(x) || []) if (ids.has(y) && !seen.has(y)) { seen.add(y); st.push(y); } } comps.push(comp); }
    comps.sort((a, b) => b.length - a.length);
    const area = (list) => list.reduce((s, id) => s + cellById.get(id).areaM2, 0);
    const resArea = area(res.map((c) => c.id));
    byMonth[m] = {
      month: m, label: MONTHS[m - 1], resourceCells: res.length, uncertainCells: unc.length, resourceAreaM2: +resArea.toFixed(1), assignedAreaM2: +assignedArea.toFixed(1),
      resourceShare: assignedArea ? +(resArea / assignedArea).toFixed(3) : null,
      groups: [...groups.entries()].map(([g, e]) => ({ group: g, cells: e.cells, species: [...e.species] })).sort((a, b) => a.group.localeCompare(b.group)),
      components: comps.map((cmp) => ({ cells: cmp.slice().sort(), areaM2: +area(cmp).toFixed(1) })), isolated: comps.filter((c) => c.length === 1).map((c) => c[0]),
      largestComponentShare: resArea ? +(area(comps[0] || []) / resArea).toFixed(3) : null,
    };
  }
  // trait coverage over the placed species (instance-weighted)
  let nInst = 0; const cov = { bloom: 0, pollinators: 0, light: 0, illustrative: 0 };
  for (const c of cells) { const inst = instances[c.id]; if (!inst || !assignments[c.id]?.mixId) continue; for (const p of inst.plants) { nInst++; const t = K.traits(p.plantId); if (t.bloom.status !== 'unknown') cov.bloom++; if (t.pollinators.status !== 'unknown' || t.windPollinated === true) cov.pollinators++; if (t.light.status !== 'unknown') cov.light++; if ([t.bloom, t.pollinators, t.light].some((x) => x.source === 'illustrative')) cov.illustrative++; } }
  const coverage = Object.fromEntries(Object.entries(cov).map(([k, v]) => [k, nInst ? +(v / nInst).toFixed(3) : null]));
  const issues = findIssues({ cells, perCell, byMonth, months, assignments, mixes, K, coverage });
  return { version: PERF_VERSION, inputVersion: K.version(), months, perCell, byMonth, coverage, instances: nInst, assignedAreaM2: +assignedArea.toFixed(1), totalAreaM2: +totalArea.toFixed(1), species: [...species].sort(), issues,
    definitions: {
      resource: 'cell has ≥ 1 placed species known to flower that month and not known to be wind-pollinated (presence proxy, not quantity)',
      share: 'resource cell area / assigned cell area', groups: 'documented pollinator groups of the flowering species (association, not visitation)',
      continuity: 'connected components of resource cells: shared boundary ≥ 0.3 m, or ≤ 3 m apart across a path (structural proxy, not flight)',
      adaptability: 'known light requirement vs crown above the cell (inference); soil moisture has no data → uncertain',
    } };
}

function findIssues({ cells, perCell, byMonth, months, assignments, mixes, K, coverage }) {
  const out = []; const planted = cells.filter((c) => perCell[c.id].status === 'planted');
  if (!planted.length) return out;
  const mixArea = new Map(); for (const c of planted) mixArea.set(perCell[c.id].mixId, (mixArea.get(perCell[c.id].mixId) || 0) + c.areaM2);
  const mainMix = [...mixArea.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const m of months) {
    const b = byMonth[m];
    if (!b.resourceCells) out.push({ id: `gap.${m}`, type: 'gap', severity: b.uncertainCells ? 'uncertain' : 'gap', month: m, cells: b.uncertainCells ? planted.filter((c) => perCell[c.id].months[m].state === 'uncertain').map((c) => c.id) : [], mixId: mainMix, title: b.uncertainCells ? `${MONTHS[m - 1]}: flowering unknown` : `${MONTHS[m - 1]}: no known flower resource`, detail: b.uncertainCells ? `${b.uncertainCells} cell(s) have plants whose flowering months are unknown, none known to flower in ${MONTHS[m - 1]}.` : `No placed plant is known to flower in ${MONTHS[m - 1]} (a month of your brief).`, actions: ['editMix', 'knowledge'] });
    else if (b.isolated.length && b.resourceCells > 1) out.push({ id: `iso.${m}`, type: 'isolated', severity: 'gap', month: m, cells: b.isolated, title: `${MONTHS[m - 1]}: ${b.isolated.length} isolated resource cell${b.isolated.length === 1 ? '' : 's'}`, detail: `These cells flower in ${MONTHS[m - 1]} but no neighbouring cell does (continuity proxy).`, actions: ['reassign'] });
  }
  for (const c of planted) { const ad = perCell[c.id].adaptability; if (ad && ad.status === 'conflict') out.push({ id: `fit.${c.id}`, type: 'conflict', severity: 'conflict', cells: [c.id], mixId: perCell[c.id].mixId, species: ad.conflicts.map((x) => x.plantId), title: `${c.label}: light conflict`, detail: ad.conflicts.map((x) => x.msg).join('; '), actions: ['editMix', 'reassign'] }); }
  const un = cells.filter((c) => perCell[c.id].status === 'unassigned'); if (un.length) out.push({ id: 'unassigned', type: 'unassigned', severity: 'info', cells: un.map((c) => c.id), title: `${un.length} cell${un.length === 1 ? '' : 's'} without a mix`, detail: 'Assign a mix or mark them intentionally empty.', actions: ['reassign'] });
  if (coverage.bloom != null && coverage.bloom < 1) { const unk = [...new Set(planted.flatMap((c) => perCell[c.id].species))].filter((id) => K.traits(id).bloom.status === 'unknown'); if (unk.length) out.push({ id: 'unknown.bloom', type: 'unknown', severity: 'uncertain', species: unk, cells: planted.filter((c) => perCell[c.id].species.some((s) => unk.includes(s))).map((c) => c.id), title: `${unk.length} placed plant${unk.length === 1 ? '' : 's'} with unknown flowering`, detail: 'Their months show as uncertain, never as no resource. Add what you know in Knowledge.', actions: ['knowledge', 'editMix'] }); }
  return out;
}

// a compact summary for snapshots and comparison (same definitions only)
export function summarize(perf) {
  if (!perf) return null;
  return { version: perf.version, inputVersion: perf.inputVersion, instances: perf.instances, assignedAreaM2: perf.assignedAreaM2, coverage: perf.coverage,
    months: Object.fromEntries(Object.values(perf.byMonth).map((b) => [b.month, { resourceShare: b.resourceShare, resourceCells: b.resourceCells, uncertainCells: b.uncertainCells, groups: b.groups.length, components: b.components.length, isolated: b.isolated.length }])) };
}
