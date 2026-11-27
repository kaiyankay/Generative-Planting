// Feedback that serves the next design move: counts, area, density, target vs actual proportions, unfilled space and
// its reasons, rule effects, and seasonal state from the phenology records that exist (coverage shown, unknown stays unknown).
import { area, union, diff, clip } from './geo.js';
import { REASONS } from './engine.js';

const SQ3 = Math.sqrt(3) / 2;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

export function feedback(doc, comp = doc.compose()) {
  const st = doc.state; const lib = doc.lib;
  const tot = { perennials: 0, bulbs: 0, areaM2: 0, species: new Set() };
  const byMix = new Map(); const byAsg = []; const unplanted = {}; const rules = []; const subs = {};
  for (const c of comp.assignments) {
    const a = c.a; const g = c.gen; const P = g.plants; const m = a.mixId ? doc.mix(a.mixId) : null;
    const areaM2 = c.parts.reduce((s, p) => s + p.areaM2, 0);
    let per = 0, bulbs = 0; const roleCount = {}, roleArea = {};
    for (const k of c.keep) { if (P.layer[k] === 2) bulbs++; else per++; tot.species.add(P.sp[k]); const rid = m && m.roles[P.role[k]] ? m.roles[P.role[k]].id : String(P.role[k]); roleCount[rid] = (roleCount[rid] || 0) + 1; if (P.layer[k] !== 2) roleArea[rid] = (roleArea[rid] || 0) + P.size[k] * P.size[k] * SQ3; }
    if (a.type !== 'erase') { tot.perennials += per; tot.bulbs += bulbs; tot.areaM2 += areaM2; }
    for (let k = 0; k < c.unplanted.r.length; k++) { const w = c.unplanted.r[k]; unplanted[w] = (unplanted[w] || 0) + 1; }
    if (g.diag) { for (const r of g.diag.rules || []) rules.push({ ...r, assignmentId: a.id }); for (const [k, v] of Object.entries(g.diag.substitutions || {})) subs[k] = (subs[k] || 0) + v; }
    byAsg.push({ id: a.id, type: a.type, label: a.label, mixId: a.mixId, frozen: !!a.frozen, areaM2: r1(areaM2), perennials: per, bulbs, density: areaM2 ? r3(per / areaM2) : 0, beds: c.parts.map((p) => p.bedId), outsideBedsM2: g.diag ? g.diag.outsideBedsM2 : 0, validation: g.diag ? g.diag.validation : null, ms: g.diag ? g.diag.ms : null });
    if (m) {
      let e = byMix.get(m.id); if (!e) byMix.set(m.id, (e = { id: m.id, name: m.name, color: m.color, version: m.version, assignments: 0, areaM2: 0, perennials: 0, bulbs: 0, roleCount: {}, roleArea: {}, species: {} }));
      e.assignments++; e.areaM2 += areaM2; e.perennials += per; e.bulbs += bulbs;
      for (const [k, v] of Object.entries(roleCount)) e.roleCount[k] = (e.roleCount[k] || 0) + v;
      for (const [k, v] of Object.entries(roleArea)) e.roleArea[k] = (e.roleArea[k] || 0) + v;
      for (const k of c.keep) e.species[P.sp[k]] = (e.species[P.sp[k]] || 0) + 1;
    }
  }
  // target vs actual per mix and role (units follow the role's layer)
  const mixes = [...byMix.values()].map((e) => {
    const m = doc.mix(e.id); const baseRoles = m.roles.filter((r) => r.layer === 'base'); const tb = baseRoles.reduce((s, r) => s + r.share, 0) || 1;
    const baseArea = baseRoles.reduce((s, r) => s + (e.roleArea[r.id] || 0), 0) + m.roles.filter((r) => r.layer === 'overlay').reduce((s, r) => s + (e.roleArea[r.id] || 0), 0) || 1;
    const roles = m.roles.map((r) => {
      const n = e.roleCount[r.id] || 0;
      if (r.layer === 'base') return { id: r.id, name: r.name, layer: r.layer, unit: 'share of planted area', target: r3(r.share / tb), actual: r3((e.roleArea[r.id] || 0) / baseArea), count: n };
      if (r.layer === 'overlay') return { id: r.id, name: r.name, layer: r.layer, unit: 'plants / m²', target: r.density, actual: e.areaM2 ? r3(n / e.areaM2) : 0, count: n };
      return { id: r.id, name: r.name, layer: r.layer, unit: 'drift coverage', target: r.coverage, actual: e.areaM2 ? r3(n / Math.max(1, r.densityInDrift || 16) / e.areaM2) : 0, count: n };
    });
    const sp = Object.entries(e.species).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, name: doc.s.getObject(id)?.canonicalKey || id }));
    return { ...e, areaM2: r1(e.areaM2), density: e.areaM2 ? r3(e.perennials / e.areaM2) : 0, roles, species: sp };
  });
  // unfilled: open beds of a blank design (and cleared areas) not covered by any space
  const covered = union(comp.assignments.filter((c) => c.a.type !== 'erase').flatMap((c) => c.parts.map((p) => p.geometry)));
  const open = [];
  const scope = st.base.from === 'blank' ? st.base.scope : [];
  for (const id of scope) { const b = doc.s.getObject(id); if (!b) continue; const left = covered ? diff(b.geometry, covered) : b.geometry; const a = area(left); if (a > 0.5) open.push({ bedId: id, areaM2: r1(a), share: r3(a / area(b.geometry)), geometry: left }); }
  const effClears = doc.effClears ? doc.effClears(st) : st.clears;
  if (effClears.length) { const cl = union(effClears.map((c) => c.geometry)); const left = covered ? diff(cl, covered) : cl; const a = area(left); if (a > 0.5) open.push({ bedId: 'cleared', areaM2: r1(a), geometry: left }); }
  const cell = (k) => 0.45 * 0.45 * SQ3;
  const unplantedList = Object.entries(unplanted).map(([why, n]) => ({ why, label: REASONS[why] || why, count: n, approxM2: r1(n * cell(why)) })).sort((a, b) => b.count - a.count);
  const substitutions = Object.entries(subs).map(([k, n]) => { const [role, from, to, why] = k.split('|'); return { role, from, to, why, n }; }).sort((a, b) => b.n - a.n);
  return {
    totals: { perennials: tot.perennials, bulbs: tot.bulbs, areaM2: r1(tot.areaM2), density: tot.areaM2 ? r3(tot.perennials / tot.areaM2) : 0, species: tot.species.size, assignments: comp.assignments.length },
    mixes, assignments: byAsg, open, openM2: r1(open.reduce((s, o) => s + o.areaM2, 0)), unplanted: unplantedList, substitutions, rules,
    conflicts: byAsg.reduce((s, a) => s + (a.validation ? a.validation.dropped : 0), 0), outsideBedsM2: r1(byAsg.reduce((s, a) => s + (a.outsideBedsM2 || 0), 0)),
  };
}

// seasonal state of the design plants for a month (1–12): from phenology records that apply here; unknown is counted
export function season(doc, month, comp = doc.compose()) {
  const lib = doc.lib; const cache = new Map(); const B = (id) => { if (!cache.has(id)) cache.set(id, lib.bloom(id)); return cache.get(id); };
  let bloom = 0, known = 0, total = 0; const flowering = new Map(); const unknownSp = new Set(); const knownSp = new Set();
  for (const c of comp.assignments) { const P = c.gen.plants; for (const k of c.keep) { total++; const b = B(P.sp[k]); if (b.status === 'known') { known++; knownSp.add(P.sp[k]); if (b.months.includes(month)) { bloom++; flowering.set(P.sp[k], (flowering.get(P.sp[k]) || 0) + 1); } } else unknownSp.add(P.sp[k]); } }
  return { month, total, known, coverage: total ? r3(known / total) : 0, blooming: bloom, flowering: [...flowering.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n, name: doc.s.getObject(id)?.canonicalKey || id })), speciesKnown: knownSp.size, speciesUnknown: unknownSp.size, unknownSpecies: [...unknownSp].slice(0, 40),
    note: 'Bloom months only from records that apply in Detroit (or that you applied here). Plants without such a record are counted as unknown, never as not flowering.' };
}

// the reference planting next to the working design (proxies are not plants: the reference is compared by area and species)
export function compareReference(doc, beds) {
  const s = doc.s; const ref = s.baseline; const ids = new Set(beds);
  const refSpecies = new Map(); let refArea = 0; const refRoles = {};
  for (const p of ref.placements) { if (!ids.has(p.bedId)) continue; const a = p.areaM2 || 0; refArea += a; refRoles[p.role] = (refRoles[p.role] || 0) + (p.kind === 'point' ? 1 : a); for (const id of p.speciesIds) refSpecies.set(id, (refSpecies.get(id) || 0) + (p.kind === 'point' ? 0.3 : a / p.speciesIds.length)); }
  const comp = doc.compose(); const work = new Map(); let plants = 0;
  for (const c of comp.assignments) { const P = c.gen.plants; for (const k of c.keep) { if (!ids.has(P.bed[k])) continue; plants++; work.set(P.sp[k], (work.get(P.sp[k]) || 0) + 1); } }
  const shared = [...work.keys()].filter((id) => refSpecies.has(id));
  return { beds: [...ids], reference: { species: refSpecies.size, placements: ref.placements.filter((p) => ids.has(p.bedId)).length, roles: refRoles, note: 'schematic reconstruction: areas and legend roles; its plant symbols are proxies (≈ 0.42 per real perennial)' },
    working: { species: work.size, plants }, sharedSpecies: shared.length, onlyReference: [...refSpecies.keys()].filter((id) => !work.has(id)).length, onlyWorking: [...work.keys()].filter((id) => !refSpecies.has(id)).length };
}
