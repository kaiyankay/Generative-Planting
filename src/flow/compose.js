// Composition: compatibility of a mix with a cell, and Auto Compose (greedy, deterministic) — both produce proposals for
// the same CellAssignment objects that manual painting writes. Nothing is overwritten without an explicit scope.
import { MONTHS } from './knowledge.js';

// soft conflicts and unknowns of one mix in one cell (hard geometry exclusions are applied by the arrangement)
export function compatibility(cell, mix, K) {
  const soft = [], unknown = [], match = [];
  const cd = cell.conditions || {}; const canopy = cd.canopy || { status: 'unknown' };
  for (const m of mix.members) {
    const t = K.traits(m.plantId); const nm = t.name + (t.cultivar ? ` '${t.cultivar}'` : '');
    if (t.light.status === 'unknown') unknown.push({ attr: 'light', plantId: m.plantId, share: m.proportion, msg: `${nm}: light requirement unknown` });
    else if (canopy.status === 'unknown') unknown.push({ attr: 'light', plantId: m.plantId, share: m.proportion, msg: `${nm}: light of the cell unknown` });
    else {
      const v = t.light.value; const under = canopy.status === 'under crown' || (canopy.status === 'mixed' && canopy.fraction >= 0.5);
      const ok = under ? v.includes('shade') || v.includes('part') : v.includes('sun') || v.includes('part');
      if (ok) match.push({ attr: 'light', plantId: m.plantId, share: m.proportion });
      else soft.push({ attr: 'light', plantId: m.plantId, share: m.proportion, msg: `${nm} is recorded for ${v.join(' / ')}, the cell is ${under ? 'mostly under an existing tree crown' : 'open (no crown above)'}`, evidence: t.light.evidence.slice(0, 2), source: t.light.source, basis: 'crown above = probable shade (inference from aerial imagery)' });
    }
    if (t.moisture.status !== 'unknown') unknown.push({ attr: 'moisture', plantId: m.plantId, share: m.proportion, msg: `${nm}: needs ${t.moisture.value.join(' / ')} soil; the cell's soil moisture has no data` });
  }
  const softShare = soft.reduce((a, s) => a + s.share, 0); const unkShare = Math.min(1, unknown.filter((u) => u.attr === 'light').reduce((a, s) => a + s.share, 0));
  return { soft, unknown, match, softShare: +softShare.toFixed(3), unknownShare: +unkShare.toFixed(3), status: soft.length ? 'conflict' : unknown.length ? 'uncertain' : 'match' };
}

// resource profile of a mix: months in which it offers a known flower resource, and the groups per month
export function mixProfile(mix, K) {
  const months = new Map(); let unknownShare = 0;
  for (const m of mix.members) {
    const t = K.traits(m.plantId);
    if (t.bloom.status === 'unknown') { unknownShare += m.proportion; continue; }
    for (let mo = 1; mo <= 12; mo++) { if (K.resourceIn(m.plantId, mo) !== 'yes') continue; const e = months.get(mo) || { share: 0, groups: new Set() }; e.share += m.proportion; if (t.pollinators.status !== 'unknown') for (const g of t.pollinators.value) e.groups.add(g); months.set(mo, e); }
  }
  return { months, unknownShare };
}

/**
 * Auto Compose. Greedy over (cell, mix) pairs; each step takes the pair with the largest marginal gain, then updates
 * the state. Terms (documented in ALGORITHMS.md):
 *   coverage   new (month × pollinator group) pairs in the design, within the brief's months (months only if no groups)
 *   continuity for each month, neighbouring cells that already offer a resource that month and this mix does too (if the
 *              continuity objective is on)
 *   balance    months of the brief offered by < 20 % of assigned cells that this mix covers
 *   conflict   − 2 × share of members with a soft conflict here; − 0.5 × share with unknown light
 * Fixed assignments (manual, or kept) are never changed; only the scope cells that are unassigned are proposed.
 */
export function autoCompose({ scopeCells, allCells, assignments, mixes, K, brief, links = [] }) {
  const months = brief.objectives.flowering.on ? brief.objectives.flowering.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const useGroups = brief.objectives.pollinators.on; const cont = brief.objectives.continuity.on; const suit = brief.objectives.suitability.on;
  const prof = new Map(mixes.map((m) => [m.id, mixProfile(m, K)]));
  const cellById = new Map(allCells.map((c) => [c.id, c]));
  const nb = new Map(allCells.map((c) => [c.id, new Set(c.neighbors.map((n) => n.id))])); for (const l of links) { nb.get(l.a)?.add(l.b); nb.get(l.b)?.add(l.a); }
  const assign = new Map(Object.entries(assignments).filter(([, a]) => a && a.mixId).map(([k, a]) => [k, a.mixId]));
  const covered = new Set(); const monthCells = new Map();
  const addCov = (cellId, mixId) => { const p = prof.get(mixId); if (!p) return; for (const [m, e] of p.months) { if (!months.includes(m)) continue; (monthCells.get(m) || monthCells.set(m, new Set()).get(m)).add(cellId); if (useGroups && e.groups.size) for (const g of e.groups) covered.add(m + ':' + g); else covered.add(m + ':*'); } };
  for (const [c, m] of assign) addCov(c, m);
  const todo = scopeCells.filter((c) => !assign.has(c.id)).map((c) => c.id).sort();
  const compat = new Map(); const C = (cid, mid) => { const k = cid + '|' + mid; if (!compat.has(k)) compat.set(k, compatibility(cellById.get(cid), mixes.find((m) => m.id === mid), K)); return compat.get(k); };
  const proposals = [];
  while (todo.length) {
    let best = null;
    const nAssigned = assign.size;
    for (const cid of todo) for (const mix of mixes) {
      const p = prof.get(mix.id); const terms = { coverage: 0, continuity: 0, balance: 0, variety: 0, conflict: 0 };
      for (const [m, e] of p.months) { if (!months.includes(m)) continue;
        if (useGroups && e.groups.size) { for (const g of e.groups) if (!covered.has(m + ':' + g)) terms.coverage += 1; } else if (!covered.has(m + ':*')) terms.coverage += 1;
        if (cont) { let k = 0; for (const n of nb.get(cid) || []) if (monthCells.get(m)?.has(n)) k++; terms.continuity += 0.15 * k; }
        const share = (monthCells.get(m)?.size || 0) / Math.max(1, nAssigned); if (share < 0.2) terms.balance += 0.3;
      }
      // variety: when gains are equal, prefer the less used mix (weight 0.2 × unused share of assigned cells)
      { let used = 0; for (const m2 of assign.values()) if (m2 === mix.id) used++; terms.variety = 0.2 * (1 - used / Math.max(1, assign.size)); }
      const cp = C(cid, mix.id); terms.conflict = suit ? -(2 * cp.softShare + 0.5 * cp.unknownShare) : -(0.5 * cp.softShare);
      const score = terms.coverage + terms.continuity + terms.balance + terms.variety + terms.conflict;
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && (cid < best.cellId || (cid === best.cellId && mix.id < best.mixId)))) best = { cellId: cid, mixId: mix.id, score: +score.toFixed(4), terms: Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, +v.toFixed(3)])) };
    }
    if (!best) break;
    const cp = C(best.cellId, best.mixId);
    proposals.push({ ...best, status: cp.status, conflicts: cp.soft.map((s) => s.msg), reasons: reasonText(best, months) });
    assign.set(best.cellId, best.mixId); addCov(best.cellId, best.mixId); todo.splice(todo.indexOf(best.cellId), 1);
  }
  return { proposals, rule: 'greedy marginal gain: coverage + continuity + balance + variety − conflict; ties by cell id, then mix id', months, groupsUsed: useGroups };
}
function reasonText(p, months) {
  const t = p.terms; const parts = [];
  if (t.coverage > 0) parts.push(`adds ${t.coverage} new month × group resource${t.coverage === 1 ? '' : 's'}`);
  if (t.continuity > 0) parts.push(`connects to neighbouring resource cells (${(t.continuity / 0.15).toFixed(0)} month-links)`);
  if (t.balance > 0) parts.push('covers months few cells offer');
  if (t.conflict < 0) parts.push('has conflicts or unknown light here');
  if (!parts.length) parts.push(`no gain left within ${MONTHS[months[0] - 1]}–${MONTHS[months[months.length - 1] - 1]}; lowest penalty`);
  return parts.join('; ');
}
