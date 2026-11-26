// Group painters: one function per layer group and phase ('ground' under the planting, 'top' over it).
// The world plan, the isolated layer plan, the exploded plates and the 3D ground texture all call these,
// so every view draws the same objects with the same symbols.
import { TOK, mix, rgba, speciesPlanColor, speciesLeaf, speciesFlower, tracePoly, traceLine, RAMPS, ramp, SANS } from './style.js';
import { centroidOf, bboxOf } from './model.js';

// o: { scale: px per metre, vb: [x0,y0,x1,y1] visible metres, texture: bool (3D ground), focus: group id (isolated) }
export const ORDER = [
  ['terrain', 'ground'], ['infrastructure', 'ground'], ['siteveg', 'ground'], ['framework', 'ground'], ['analysis', 'ground'],
  ['composition', 'ground'], ['representation', 'ground'], ['framework', 'top'], ['infrastructure', 'top'], ['siteveg', 'top'], ['terrain', 'top'],
];
export function paintGroup(ctx, s, T, gid, phase, o) {
  const f = PAINTERS[gid] && PAINTERS[gid][phase];
  if (f) f(ctx, s, T, o);
}
const vis = (s, l) => s.layerVisible(l);
const fill = (ctx, T, g, c, rule = 'evenodd') => { ctx.beginPath(); tracePoly(ctx, g, T); ctx.fillStyle = c; ctx.fill(rule); };
const inView = (o, b, pad = 2) => !o.vb || !(b[2] < o.vb[0] - pad || b[0] > o.vb[2] + pad || b[3] < o.vb[1] - pad || b[1] > o.vb[3] + pad);

const PAINTERS = {
  terrain: {
    ground(ctx, s, T, o) {
      const iso = o.focus === 'terrain' || s.view.mode === 'terrain';
      if (iso && vis(s, 'topo.surface')) { drawRaster(ctx, s, T, 'elevation', 0.9); drawRaster(ctx, s, T, 'hillshade', 0.55); }
      if (vis(s, 'topo.contours')) paintContours(ctx, s, T, { scale: o.texture ? 26 : Math.min(o.scale, 30) * 0.4, strong: iso, texture: o.texture });
    },
    top(ctx, s, T, o) {
      if (s.view.mode === 'terrain' && s.view.terrainOutline !== false && !o.plate) { // optional reference outline of the bed framework
        ctx.save(); ctx.setLineDash(o.texture ? [10, 8] : [3, 3]); ctx.strokeStyle = rgba(TOK.inkDeep, o.texture ? 0.5 : 0.38); ctx.lineWidth = o.texture ? 2.2 : 0.8;
        for (const b of s.beds) { ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.stroke(); }
        ctx.restore();
      }
      if (o.texture || !vis(s, 'site.boundary')) return;
      const site = s.getObject('site.oudolf-garden-detroit'); if (!site) return;
      ctx.beginPath(); tracePoly(ctx, site.geometry, T); ctx.setLineDash([7, 4, 1.5, 4]); ctx.strokeStyle = rgba(TOK.inkDeep, o.focus === 'terrain' || s.view.mode === 'terrain' ? 0.75 : 0.35); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    },
  },
  infrastructure: {
    ground(ctx, s, T, o) {
      const O = (id) => s.getObject(id);
      if (vis(s, 'site.context')) {
        for (const id of ['context.parking', 'context.roads']) { const g = O(id)?.geometry; if (!g) continue; fill(ctx, T, g, TOK.context); if (!o.texture) { ctx.strokeStyle = rgba(TOK.contextLine, 0.9); ctx.lineWidth = 0.7; ctx.stroke(); } }
      }
      if (vis(s, 'site.water')) for (const id of ['water.lake-tacoma', 'water.carillon-moat']) {
        const g = O(id)?.geometry; if (!g) continue; fill(ctx, T, g, TOK.water);
        if (!o.texture) {
          ctx.save(); ctx.clip('evenodd'); ctx.strokeStyle = rgba('#FFFFFF', 0.5); ctx.lineWidth = 0.8; ctx.beginPath();
          const b = bboxOf(g); const st = Math.max(3, 2.2 * o.scale);
          const [ax, ay] = T(b[0], b[3]), [bx, by] = T(b[2], b[1]);
          for (let y = ay; y < by; y += st) { ctx.moveTo(ax, y); ctx.lineTo(bx, y); }
          ctx.stroke(); ctx.restore();
          ctx.beginPath(); tracePoly(ctx, g, T); ctx.strokeStyle = TOK.waterEdge; ctx.lineWidth = 0.9; ctx.stroke();
        }
      }
      if (vis(s, 'built.paths')) for (const id of ['context.sidewalks', 'built.gravel-walks']) {
        const g = O(id)?.geometry; if (!g) continue; fill(ctx, T, g, o.texture ? '#E9E3D3' : TOK.path);
        if (!o.texture) { ctx.strokeStyle = rgba(TOK.pathEdge, 0.95); ctx.lineWidth = 0.7; ctx.stroke(); }
      }
      if (vis(s, 'built.walks')) { const g = O('built.grass-walks')?.geometry; if (g) { fill(ctx, T, g, o.texture ? '#B8BF9C' : TOK.lawnDeep); if (!o.texture && o.scale > 3) { ctx.setLineDash([2, 3]); ctx.strokeStyle = rgba(TOK.ink, 0.35); ctx.lineWidth = 0.6; ctx.stroke(); ctx.setLineDash([]); } } }
      for (const ob of s.model.objects) {
        if ((ob.type === 'building' || ob.type === 'tower') && ob.geometry && vis(s, ob.layer)) fill(ctx, T, ob.geometry, ob.layer === 'built.structures' ? TOK.stone : TOK.building);
        if (ob.type === 'boardwalk' && vis(s, 'built.structures')) fill(ctx, T, ob.geometry, TOK.wood);
      }
    },
    top(ctx, s, T, o) {
      if (o.texture) return;
      const sc = o.scale;
      if (vis(s, 'built.walls')) for (const ob of s.model.objects) if (ob.type === 'wall') {
        ctx.beginPath(); traceLine(ctx, ob.geometry, T); ctx.lineCap = 'butt';
        ctx.strokeStyle = TOK.stone; ctx.lineWidth = Math.max(1.6, 0.5 * sc); ctx.stroke();
        ctx.strokeStyle = rgba(TOK.inkDeep, 0.7); ctx.lineWidth = 0.7; ctx.stroke();
      }
      for (const ob of s.model.objects) {
        if (!ob.geometry) continue;
        if ((ob.type === 'tower' || ob.type === 'building') && vis(s, ob.layer)) {
          ctx.beginPath(); tracePoly(ctx, ob.geometry, T); ctx.strokeStyle = rgba(TOK.inkDeep, ob.layer === 'built.structures' ? 0.85 : 0.5); ctx.lineWidth = ob.layer === 'built.structures' ? 1.1 : 0.7; ctx.stroke();
          if (ob.layer !== 'built.structures') { ctx.save(); ctx.clip(); ctx.strokeStyle = rgba(TOK.inkDeep, 0.13); ctx.lineWidth = 0.7; ctx.beginPath(); const b = bboxOf(ob.geometry); const [ax, ay] = T(b[0], b[3]), [bx, by] = T(b[2], b[1]); for (let k = ax - (by - ay); k < bx; k += 5) { ctx.moveTo(k, by); ctx.lineTo(k + (by - ay), ay); } ctx.stroke(); ctx.restore(); }
        } else if (ob.type === 'boardwalk' && vis(s, 'built.structures')) {
          ctx.beginPath(); tracePoly(ctx, ob.geometry, T); ctx.strokeStyle = rgba('#6F5A40', 0.85); ctx.lineWidth = 0.8; ctx.stroke();
        } else if ((ob.type === 'monument' || ob.type === 'bench') && vis(s, 'built.structures')) {
          const q = T(...ob.geometry.coordinates); const w = Math.max(3, (ob.type === 'monument' ? 3.5 : 1.8) * sc), h = Math.max(1.5, 0.6 * sc);
          ctx.fillStyle = ob.type === 'monument' ? '#F1EEE6' : TOK.wood; ctx.strokeStyle = rgba(TOK.inkDeep, 0.8); ctx.lineWidth = 0.7;
          ctx.fillRect(q[0] - w / 2, q[1] - h / 2, w, h); ctx.strokeRect(q[0] - w / 2, q[1] - h / 2, w, h);
        } else if (ob.type === 'swale' && vis(s, 'built.structures')) {
          ctx.beginPath(); traceLine(ctx, ob.geometry, T); ctx.setLineDash([1.5, 3]); ctx.strokeStyle = TOK.waterEdge; ctx.lineWidth = Math.max(1.5, 0.8 * sc); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    },
  },
  siteveg: {
    ground(ctx, s, T, o) {
      if (!vis(s, 'veg.lawn')) return;
      for (const id of ['veg.lawn', 'veg.carillon-island']) { const g = s.getObject(id)?.geometry; if (g) fill(ctx, T, g, o.texture ? (id === 'veg.lawn' ? '#C3C8AA' : '#B9C09F') : id === 'veg.lawn' ? TOK.lawn : TOK.lawnDeep); }
    },
    top(ctx, s, T, o) {
      if (o.texture || !vis(s, 'siteveg.trees')) return;
      paintCanopies(ctx, s, T, o, (i) => s.inst.pl[i] < 0, true);
    },
  },
  framework: {
    ground(ctx, s, T, o) {
      if (!vis(s, 'structure.beds') && !(o.texture && s.view.mode !== 'terrain')) return; // 3D ground keeps bed soil unless the view is Terrain
      for (const b of s.beds) {
        const st = b.props.style;
        if (st === 'M') { fill(ctx, T, b.geometry, o.texture ? '#B9BA8A' : mix(TOK.meadow, TOK.paper, 0.35)); continue; }
        fill(ctx, T, b.geometry, o.texture ? TOK.soil3d : mix(TOK.soil, TOK.paper, 0.25));
      }
      if (s.scenario === 'working' && s.draft) paintOpenBeds(ctx, s, T, o);
    },
    top(ctx, s, T, o) {
      if (o.texture) return;
      if (vis(s, 'structure.districts') && (o.focus === 'framework')) {
        for (const ob of s.model.objects) if (ob.type === 'district') { ctx.beginPath(); tracePoly(ctx, ob.geometry, T); ctx.setLineDash([5, 4]); ctx.strokeStyle = rgba(TOK.ink, 0.55); ctx.lineWidth = 0.8; ctx.stroke(); ctx.setLineDash([]); }
      }
      if (vis(s, 'structure.beds')) for (const b of s.beds) {
        if (b.props.style === 'M') { ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.setLineDash([4, 3]); ctx.strokeStyle = rgba(TOK.ink, 0.55); ctx.lineWidth = 0.8; ctx.stroke(); ctx.setLineDash([]); }
      }
      if (vis(s, 'built.edging')) {
        ctx.strokeStyle = TOK.steel; ctx.lineWidth = Math.max(0.7, Math.min(1.8, o.scale * 0.07));
        for (const b of s.beds) { if (b.props.style === 'M') continue; ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.stroke(); }
      }
      if (vis(s, 'structure.labels')) paintBedLabels(ctx, s, T, o);
    },
  },
  composition: {
    ground(ctx, s, T, o) {
      const sc = o.scale; const P = s.model.placements;
      if (o.texture) { // 3D understorey: patches read as leaf shade under the proxies
        if (!vis(s, 'structure.patches') && !vis(s, 'veg.forbs')) return;
        for (const p of P) {
          if (p.kind !== 'area' || (p.role || '').startsWith('bulb') || !p.geometry) continue;
          const sp = s.getObject(p.speciesIds[0]); if (!sp) continue;
          ctx.globalAlpha = 0.5; fill(ctx, T, p.geometry, mix(speciesLeaf(sp), '#3A4433', 0.28), 'nonzero'); ctx.globalAlpha = 1;
        }
        return;
      }
      if (vis(s, 'structure.patches')) {
        const iso = o.focus === 'composition';
        for (const p of P) { // matrix / meadow base
          if (p.kind !== 'area' || !(p.role === 'matrix' || p.role === 'meadow')) continue;
          const g = s.placementGeom(p); if (!g || !inView(o, s.placementBox(p))) continue;
          fill(ctx, T, g, rgba(TOK.meadow, iso ? 0.55 : 0.45));
          if (sc > 5) stipple(ctx, T, g, sc, rgba('#7E7A4A', 0.45), 1.1);
        }
        const fillA = iso ? 0.72 : sc > 12 ? 0.5 : 0.62;
        for (const p of P) { // blocks and groups
          if (p.kind !== 'area' || p.role === 'matrix' || p.role === 'meadow' || (p.role || '').startsWith('bulb')) continue;
          const b = s.placementBox(p); if (!inView(o, b)) continue;
          const sp = s.getObject(p.speciesIds[0]);
          ctx.beginPath(); tracePoly(ctx, p.geometry, T); ctx.fillStyle = rgba(speciesPlanColor(sp), fillA); ctx.fill();
          if (sc > 3) { ctx.strokeStyle = rgba(TOK.inkDeep, sc > 14 ? 0.5 : 0.28); ctx.lineWidth = sc > 20 ? 0.9 : 0.6; ctx.stroke(); }
          if (p.speciesIds.length > 1 && sc > 6) { // paired legend entry: second species as fine hatch
            const sp2 = s.getObject(p.speciesIds[1]);
            ctx.save(); ctx.clip(); ctx.strokeStyle = rgba(mix(speciesPlanColor(sp2), TOK.inkDeep, 0.25), 0.6); ctx.lineWidth = 0.8;
            ctx.beginPath(); const st = Math.max(3, 0.45 * sc); const [ax, ay] = T(b[0], b[3]), [bx, by] = T(b[2], b[1]);
            for (let k = ax - (by - ay); k < bx; k += st) { ctx.moveTo(k, by); ctx.lineTo(k + (by - ay), ay); }
            ctx.stroke(); ctx.restore();
          }
          if (p.status === 'draft') draftMark(ctx, T, p.geometry);
        }
        // emergent / individual / woody positions: open circles, species-coloured rim
        for (const p of P) {
          if (p.kind !== 'point' || sc < 3.2) continue; // emergents appear progressively with zoom
          const q = T(...p.geometry.coordinates); if (o.vb && !inView(o, [p.geometry.coordinates[0], p.geometry.coordinates[1], p.geometry.coordinates[0], p.geometry.coordinates[1]])) continue;
          const sp = s.getObject(p.speciesIds[0]); const woody = p.role === 'tree' || p.role === 'shrub' || p.role === 'hedgerow';
          const r = Math.max(woody ? 1.6 : 2, (woody ? 0.45 : (p.symbolRadiusM || 0.3)) * sc);
          ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7);
          if (woody) { ctx.strokeStyle = rgba(TOK.darkVeg, 0.9); ctx.lineWidth = 0.9; ctx.stroke(); ctx.beginPath(); ctx.moveTo(q[0] - r * 0.6, q[1]); ctx.lineTo(q[0] + r * 0.6, q[1]); ctx.moveTo(q[0], q[1] - r * 0.6); ctx.lineTo(q[0], q[1] + r * 0.6); ctx.stroke(); }
          else {
            ctx.fillStyle = rgba(TOK.paper, 0.6); ctx.fill(); ctx.lineWidth = Math.max(0.9, r * 0.2); ctx.strokeStyle = mix(speciesFlower(sp), TOK.inkDeep, 0.25); ctx.stroke();
            if (r > 9) { ctx.fillStyle = TOK.inkDeep; ctx.font = `${Math.min(11, r * 0.72)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.legendCode || '', q[0], q[1] + 0.5); }
          }
          if (p.status === 'draft') { ctx.beginPath(); ctx.arc(q[0], q[1], r + 3, 0, 7); ctx.setLineDash([1.5, 2.5]); ctx.strokeStyle = TOK.draft; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
        }
        for (const p of P) { // scatter (MultiPoint): small crosses
          if (p.kind !== 'scatter' || !p.geometry || p.geometry.type !== 'MultiPoint' || sc < 6) continue;
          const k = Math.min(3, sc * 0.12); ctx.strokeStyle = rgba(TOK.inkDeep, 0.42); ctx.lineWidth = 0.7; ctx.beginPath();
          for (const c of p.geometry.coordinates) { const q = T(c[0], c[1]); ctx.moveTo(q[0] - k, q[1] - k); ctx.lineTo(q[0] + k, q[1] + k); ctx.moveTo(q[0] + k, q[1] - k); ctx.lineTo(q[0] - k, q[1] + k); }
          ctx.stroke();
        }
      }
      if (vis(s, 'structure.bulbs') && (o.focus === 'composition' || sc > 6)) {
        for (const p of P) { // bulbs: independent dotted outline + point stipple (they overlap the perennials)
          if (!(p.role || '').startsWith('bulb') || !p.geometry) continue;
          if (!inView(o, s.placementBox(p))) continue;
          const sp = s.getObject(p.speciesIds[0]); const c = mix(speciesFlower(sp), TOK.inkDeep, 0.3);
          ctx.beginPath(); tracePoly(ctx, p.geometry, T); ctx.setLineDash([1.5, 2.2]); ctx.strokeStyle = rgba(c, 0.85); ctx.lineWidth = sc > 15 ? 1.1 : 0.8; ctx.stroke(); ctx.setLineDash([]);
          if (sc > 9) stipple(ctx, T, p.geometry, sc, rgba(c, 0.7), 0.9, true);
        }
      }
    },
  },
  representation: {
    ground(ctx, s, T, o) {
      if (o.texture) return;
      paintInstances(ctx, s, T, o);
      paintCanopies(ctx, s, T, o, (i) => s.inst.pl[i] >= 0, false);
    },
  },
  analysis: {
    ground(ctx, s, T, o) {
      if (o.texture) { if (vis(s, 'analysis.slope')) drawRaster(ctx, s, T, 'slope', 0.65); else if (vis(s, 'analysis.pathdist')) drawRaster(ctx, s, T, 'pathdist', 0.65); return; }
      if (vis(s, 'analysis.slope')) drawRaster(ctx, s, T, 'slope', o.focus === 'analysis' ? 0.85 : 0.6);
      if (vis(s, 'analysis.pathdist') && !vis(s, 'analysis.slope')) drawRaster(ctx, s, T, 'pathdist', o.focus === 'analysis' ? 0.7 : 0.5);
    },
  },
};

// ---------------------------------------------------------------- symbols
function draftMark(ctx, T, g) { ctx.beginPath(); tracePoly(ctx, g, T); ctx.setLineDash([1.5, 2.5]); ctx.strokeStyle = TOK.draft; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]); }
function stipple(ctx, T, g, sc, color, size, dots = false) {
  const b = bboxOf(g); const step = Math.max(0.35, 9 / sc);
  ctx.save(); ctx.beginPath(); tracePoly(ctx, g, T); ctx.clip('evenodd'); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 0.7; ctx.beginPath();
  for (let x = Math.floor(b[0] / step) * step; x < b[2]; x += step) for (let y = Math.floor(b[1] / step) * step; y < b[3]; y += step) {
    const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; const fx = h - Math.floor(h), h2 = Math.sin(x * 4.1 + y * 7.7) * 9631.1; const fy = h2 - Math.floor(h2);
    const p = T(x + fx * step, y + fy * step);
    if (dots) { ctx.moveTo(p[0] + size, p[1]); ctx.arc(p[0], p[1], size, 0, 7); } else { ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.5, p[1] - 2.6); }
  }
  dots ? ctx.fill() : ctx.stroke(); ctx.restore();
}
// open (editable, empty) beds of a blank canvas: fine hatch so "empty" never reads as "missing data"
function paintOpenBeds(ctx, s, T, o) {
  const occupied = new Set(s.model.placements.map((p) => p.bedId || p.districtId));
  for (const id of s.draft.scope) {
    if (occupied.has(id)) continue; const b = s.getObject(id); if (!b) continue;
    ctx.save(); ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.fillStyle = o.texture ? '#B4AE95' : rgba(TOK.paper, 0.55); ctx.fill('evenodd'); ctx.clip('evenodd');
    ctx.strokeStyle = rgba(o.texture ? '#7C7660' : TOK.ink, o.texture ? 0.35 : 0.22); ctx.lineWidth = o.texture ? 2 : 0.7; ctx.beginPath();
    const bb = bboxOf(b.geometry); const [ax, ay] = T(bb[0], bb[3]), [bx, by] = T(bb[2], bb[1]); const st = o.texture ? Math.max(8, o.scale * 0.8) : 6;
    for (let k = ax - (by - ay); k < bx; k += st) { ctx.moveTo(k, by); ctx.lineTo(k + (by - ay), ay); }
    ctx.stroke(); ctx.restore();
  }
}
function paintBedLabels(ctx, s, T, o) {
  const sc = o.scale; const placed = [];
  const beds = s.beds.slice().sort((a, b) => (b.props.areaM2 || 0) - (a.props.areaM2 || 0));
  for (const b of beds) {
    const c = centroidOf(b.geometry); if (!c) continue;
    const q = T(c[0], c[1]);
    const code = b.props.style === 'M' ? b.name.replace(' planting', '') : b.id.replace('bed.', '');
    const big = 'ABC'.includes(b.props.style);
    const fs = b.props.style === 'M' ? 11 : Math.max(9.5, Math.min(14, 6 + sc * 0.6));
    ctx.font = `${big ? 600 : 500} ${fs}px ${SANS}`;
    const w = ctx.measureText(code).width + 10, h = fs + 6;
    const box = [q[0] - w / 2, q[1] - h / 2, q[0] + w / 2, q[1] + h / 2];
    if (placed.some((p) => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
    // bed too small on screen to carry its own label -> skip (progressive reveal)
    const bb = bboxOf(b.geometry); if ((bb[2] - bb[0]) * sc < w * 0.6 && b.props.style !== 'M') continue;
    placed.push(box);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = rgba(TOK.paper, 0.92); ctx.strokeText(code, q[0], q[1]);
    ctx.fillStyle = b.props.style === 'M' ? TOK.ink : TOK.inkDeep; ctx.fillText(code, q[0], q[1]);
    if (sc > 12 && big) {
      ctx.font = `500 9.5px ${SANS}`; const t = b.props.styleName.toUpperCase();
      ctx.strokeText(t, q[0], q[1] + fs * 0.95); ctx.fillStyle = TOK.ink; ctx.fillText(t, q[0], q[1] + fs * 0.95);
    }
  }
}
// herbaceous proxies: Experimental-Plots style — solid core + translucent halo; grasses as fine radiating strokes
export function paintInstances(ctx, s, T, o) {
  const sc = o.scale; if (sc < 3.2) return;
  const t = s.inst; const vb = o.vb || [-1e9, -1e9, 1e9, 1e9];
  const show = {}; for (const l of ['veg.forbs', 'veg.grasses', 'veg.bulbs']) show[l] = s.layerVisible(l);
  if (!show['veg.forbs'] && !show['veg.grasses'] && !show['veg.bulbs']) return;
  const close = sc > 22, mid = sc > 7;
  const haloA = o.focus === 'representation' ? 0.32 : 0.22;
  // colour strings per species (built once per draw, not per proxy)
  const C = new Map(); const col = (sp) => { let c = C.get(sp.index); if (!c) { const pc = speciesPlanColor(sp); c = { halo: rgba(pc, haloA), haloG: rgba(pc, haloA * 0.8), ring: rgba(mix(pc, TOK.inkDeep, 0.4), 0.5), core: mix(speciesFlower(sp), TOK.inkDeep, close ? 0.08 : 0.15), grass: rgba(mix(speciesLeaf(sp), TOK.inkDeep, 0.3), close ? 0.75 : 0.55), bulb: rgba(mix(speciesFlower(sp), TOK.inkDeep, 0.35), 0.8) }; C.set(sp.index, c); } return c; };
  for (let i = 0; i < t.n; i++) {
    if (!t.alive[i] || t.pl[i] < 0) continue;
    const x = t.x[i], y = t.y[i]; if (x < vb[0] - 2 || x > vb[2] + 2 || y < vb[1] - 2 || y > vb[3] + 2) continue;
    const sp = s.speciesByIndex[t.sp[i]]; const L = speciesLayerOf(sp);
    if (L === 'veg.trees' || L === 'veg.shrubs' || !show[L]) continue;
    const q = T(x, y);
    const cc = col(sp);
    if (L === 'veg.bulbs') { if (!mid) continue; ctx.fillStyle = cc.bulb; ctx.beginPath(); ctx.arc(q[0], q[1], close ? 1.4 : 0.9, 0, 7); ctx.fill(); continue; }
    const r = Math.max(1.1, sp.nominalSpreadM * 0.42 * t.sc[i] * sc);
    if (L === 'veg.grasses') {
      if (mid) { ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = cc.haloG; ctx.fill(); }
      ctx.strokeStyle = cc.grass; ctx.lineWidth = close ? 0.8 : 0.6; ctx.beginPath();
      const n = close ? 11 : mid ? 7 : 4; const rot = t.rot[i];
      for (let k = 0; k < n; k++) { const a = rot + (k / n) * 6.283; const rr = r * (0.75 + 0.25 * ((k * 7) % 3) / 2); ctx.moveTo(q[0] + Math.cos(a) * r * 0.15, q[1] + Math.sin(a) * r * 0.15); ctx.lineTo(q[0] + Math.cos(a) * rr, q[1] + Math.sin(a) * rr); }
      ctx.stroke();
    } else {
      if (mid) { ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = cc.halo; ctx.fill(); }
      if (close) { ctx.lineWidth = 0.6; ctx.strokeStyle = cc.ring; ctx.stroke(); }
      const cr = Math.max(0.9, Math.min(r * 0.36, close ? 4.5 : 2.4));
      ctx.beginPath(); ctx.arc(q[0], q[1], cr, 0, 7); ctx.fillStyle = cc.core; ctx.fill();
    }
  }
}
// tree / shrub crowns: translucent canopy, fine edge, soft offset shadow; existing crowns dashed (digitised), designed solid
function paintCanopies(ctx, s, T, o, pick, existing) {
  const t = s.inst; const sc = o.scale; const items = [];
  const lay = existing ? ['siteveg.trees'] : ['veg.trees', 'veg.shrubs'];
  for (let i = 0; i < t.n; i++) {
    if (!t.alive[i] || !pick(i)) continue;
    const L = s.instanceLayer(i); if (!lay.includes(L) || !s.layerVisible(L)) continue;
    items.push(i);
  }
  items.sort((a, b) => s.speciesByIndex[t.sp[a]].nominalSpreadM - s.speciesByIndex[t.sp[b]].nominalSpreadM);
  for (const i of items) {
    const sp = s.speciesByIndex[t.sp[i]]; const q = T(t.x[i], t.y[i]);
    const r = (sp.nominalSpreadM / 2) * t.sc[i] * sc * (existing ? 1 : 0.9);
    if (r < 0.8) continue;
    ctx.beginPath(); ctx.arc(q[0] + r * 0.16, q[1] + r * 0.16, r, 0, 7); ctx.fillStyle = rgba('#3F4A3C', existing ? 0.08 : 0.1); ctx.fill();
    ctx.beginPath(); const n = 18; const rot = t.rot[i];
    for (let k = 0; k <= n; k++) { const a = rot + (k / n) * 6.283; const rr = r * (0.92 + 0.08 * Math.sin(a * 5 + rot * 3)); const px = q[0] + Math.cos(a) * rr, py = q[1] + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    const base = sp.plantType === 'tree' ? (existing ? TOK.midVeg : TOK.darkVeg) : mix(TOK.midVeg, speciesPlanColor(sp), 0.3);
    ctx.fillStyle = rgba(base, existing ? 0.42 : sp.plantType === 'tree' ? 0.5 : 0.62); ctx.fill();
    if (existing) ctx.setLineDash([3, 2]);
    ctx.lineWidth = 0.7; ctx.strokeStyle = rgba(TOK.inkDeep, 0.6); ctx.stroke(); ctx.setLineDash([]);
    if (r > 5) { ctx.beginPath(); ctx.arc(q[0], q[1], 1, 0, 7); ctx.fillStyle = TOK.inkDeep; ctx.fill(); }
  }
}
function speciesLayerOf(sp) {
  const t = sp.plantType;
  return t === 'tree' ? 'veg.trees' : t === 'shrub' ? 'veg.shrubs' : t === 'grass' || t === 'sedge' ? 'veg.grasses' : t === 'bulb' ? 'veg.bulbs' : 'veg.forbs';
}

export function paintContours(ctx, store, T, { scale = 10, strong = false, texture = false } = {}) {
  const lines = store.contours(0.25);
  for (const L of lines) {
    ctx.beginPath();
    const s = L.segs;
    for (let i = 0; i < s.length; i += 4) { const a = T(s[i], s[i + 1]), b = T(s[i + 2], s[i + 3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.strokeStyle = rgba(texture ? '#5A5038' : '#6E5F43', (L.major ? 0.72 : 0.34) * (strong ? 1 : 0.85));
    ctx.lineWidth = L.major ? Math.max(0.9, scale * 0.085) : Math.max(0.5, scale * 0.045);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- rasters (derived from real data only)
const _rasterCache = new WeakMap();
export function getRaster(s, kind) {
  if (!_rasterCache.has(s)) _rasterCache.set(s, {});
  const c = _rasterCache.get(s);
  return (c[kind] ||= buildRaster(s, kind));
}
export function drawRaster(ctx, s, T, kind, alpha) {
  const R = getRaster(s, kind); const a = T(R.x0, R.y1), b = T(R.x1, R.y0);
  ctx.save(); ctx.globalAlpha = alpha; ctx.imageSmoothingEnabled = kind === 'elevation' || kind === 'hillshade'; // analysis shows its real 1 m cells
  ctx.drawImage(R.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.restore();
}
function buildRaster(s, kind) {
  const m = s.terrain.meta;
  const full = kind === 'elevation' || kind === 'hillshade';
  const x0 = full ? m.origin[0] : -90, y0 = full ? m.origin[1] : -100;
  const x1 = full ? m.origin[0] + (m.cols - 1) * m.cellSize : 110, y1 = full ? m.origin[1] + (m.rows - 1) * m.cellSize : 50;
  const res = 1; const W = Math.round((x1 - x0) / res), H = Math.round((y1 - y0) / res);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'); const img = cx.createImageData(W, H);
  const lo = m.zMin, hi = Math.min(m.zMax, m.zMin + 6);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * res, y = y1 - (j + 0.5) * res; const k = (j * W + i) * 4;
    let v, c, a;
    if (kind === 'elevation') { v = s.sampleElevation(x, y); if (v == null) { img.data[k + 3] = 0; continue; } c = ramp(RAMPS.elevation, (v - lo) / (hi - lo)); a = 255; }
    else if (kind === 'hillshade') {
      const e = s.sampleElevation(x - 1, y), w = s.sampleElevation(x + 1, y), n = s.sampleElevation(x, y + 1), so = s.sampleElevation(x, y - 1);
      if ([e, w, n, so].some((q) => q == null)) { img.data[k + 3] = 0; continue; }
      const dx = (w - e) / 2 * 3, dy = (n - so) / 2 * 3; // ×3 relief for legibility of the shade only
      const L = [-0.5, 0.5, 0.7]; const nz = 1 / Math.hypot(dx, dy, 1); const sh = (-dx * L[0] - dy * L[1] + L[2]) * nz / Math.hypot(...L);
      const g = Math.round(255 * Math.max(0, Math.min(1, sh))); c = [g, g, g]; a = Math.round(140 * Math.max(0, 0.85 - sh));
    } else if (kind === 'slope') { v = s.sampleSlope(x, y); if (v == null) { img.data[k + 3] = 0; continue; } const t = Math.min(1, v / 12); c = ramp(RAMPS.slope, t); a = Math.round(235 * Math.min(1, 0.15 + t * 2.2)); }
    else { v = s.distanceToPath(x, y); if (!isFinite(v)) { img.data[k + 3] = 0; continue; } const t = Math.min(1, v / 8); c = ramp(RAMPS.pathdist, t); a = t >= 1 ? 0 : 215; }
    img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = a;
  }
  cx.putImageData(img, 0, 0);
  return { canvas: cv, x0, x1, y0, y1, lo, hi };
}
