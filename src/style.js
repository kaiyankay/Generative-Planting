// One visual language for plan, ground texture, exploded plates and 3D.
// Computational landscape illustration: warm paper, quiet context, subdued greens / ochres / blue-greys,
// fine ink lines, translucent plant symbols. Species colour, analysis colour and state colour never share a meaning:
//   species  -> muted flower / foliage hues (speciesPlanColor, speciesLeaf)
//   analysis -> dedicated ramps (RAMPS) shown with a legend
//   state    -> line style + text (selection solid + offset dashed ring, hover dashed, draft dotted) — never colour alone
export const TOK = {
  paper: '#F5F1E8', paper2: '#EEE9DD', context: '#DED8C9', contextLine: '#CBC3B0',
  meadow: '#C7C38A', lowVeg: '#AFBE9E', midVeg: '#859779', darkVeg: '#5E7464',
  ink: '#506B5F', inkDeep: '#33433A', inkSoft: '#80897F',
  water: '#BACBD0', waterEdge: '#8FA6AE', accent: '#B59CBB',
  path: '#FAF7EF', pathEdge: '#C9BFA9', lawn: '#D3D6BA', lawnDeep: '#C3C9A6',
  building: '#E6E0D2', stone: '#D8CFBC', wood: '#B49A74', steel: '#4B4F48',
  soil: '#B8BC9C', soil3d: '#7B8264',
  select: '#9A4F2E', hover: '#6F5F86', draft: '#8C6A2E',
};
// compatibility alias for older imports
export const PAL = {
  paper: TOK.paper, ink: TOK.inkDeep, inkSoft: TOK.inkSoft, lawn: TOK.lawn, lawnDeep: TOK.lawnDeep, meadow: TOK.meadow,
  gravel: TOK.path, concrete: TOK.path, road: TOK.context, parking: TOK.context, water: TOK.water, waterDeep: TOK.waterEdge,
  soil: TOK.soil3d, soilLight: TOK.soil, steel: TOK.steel, limestone: TOK.stone, building: TOK.building, wood: TOK.wood,
  select: TOK.select, hover: TOK.hover, matrix: TOK.meadow,
};

export const STATUS_LABEL = {
  documented: 'Documented', reconstructed: 'Reconstructed', schematic: 'Schematic', unknown: 'Unknown', draft: 'Draft', derived: 'Derived',
};

// ---------------------------------------------------------------- colour utilities
export function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgbToHex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
export function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(...A.map((v, i) => v + (B[i] - v) * t)); }
export function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function toHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map((v) => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function fromHsl(h, s, l) {
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  if (!s) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
}
// low-saturation versions of the species' display colours (one function for 2D and 3D)
const _cache = new Map();
export function muteFlower(hex) {
  if (!hex) return null; const k = 'f' + hex; if (_cache.has(k)) return _cache.get(k);
  const [h, s, l] = toHsl(hex);
  const v = fromHsl(h, Math.min(s * 0.62, 0.42), Math.max(0.5, Math.min(0.76, l * 0.8 + 0.16)));
  _cache.set(k, v); return v;
}
export function muteLeaf(hex) {
  if (!hex) return TOK.midVeg; const k = 'l' + hex; if (_cache.has(k)) return _cache.get(k);
  let [h, s, l] = toHsl(hex);
  h = h + (0.27 - h) * 0.35; // pull toward sage
  const v = fromHsl(h, Math.min(s * 0.55, 0.3), Math.max(0.34, Math.min(0.56, l)));
  _cache.set(k, v); return v;
}
// plan colour of a species: muted flower (if any), otherwise muted foliage / straw for grasses
export function speciesPlanColor(sp) {
  if (!sp) return TOK.inkSoft;
  const k = 'p' + sp.id; if (_cache.has(k)) return _cache.get(k);
  let v;
  if (sp.plantType === 'grass' || sp.plantType === 'sedge') v = mix(muteLeaf(sp.displayLeaf), TOK.meadow, 0.35);
  else if (sp.plantType === 'tree' || sp.plantType === 'shrub') v = mix(muteLeaf(sp.displayLeaf), TOK.midVeg, 0.4);
  else v = sp.displayFlower ? mix(muteFlower(sp.displayFlower), muteLeaf(sp.displayLeaf), 0.15) : muteLeaf(sp.displayLeaf);
  _cache.set(k, v); return v;
}
export function speciesLeaf(sp) { return muteLeaf(sp && sp.displayLeaf); }
export function speciesFlower(sp) { return sp && sp.displayFlower ? muteFlower(sp.displayFlower) : speciesLeaf(sp); }

// analysis ramps (distinct from any plant colour)
export const RAMPS = {
  elevation: ['#EFE9DC', '#DCD3BF', '#C6B99D', '#A8987A', '#857559'],
  slope: ['#F3EED9', '#E5D29A', '#CF9F5E', '#A3623C', '#6B3A2C'],
  pathdist: ['#3F6670', '#7FA2A6', '#BCD0CC', '#EDEFE6'],
};
export function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t)); const n = stops.length - 1; const k = Math.min(n - 1, Math.floor(t * n)); const f = t * n - k;
  const a = hexToRgb(stops[k]), b = hexToRgb(stops[k + 1]);
  return a.map((v, i) => Math.round(v + (b[i] - v) * f));
}

// ---------------------------------------------------------------- path tracing
export function tracePoly(ctx, geom, T) {
  if (!geom) return;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  for (const p of polys) for (const r of p) {
    for (let i = 0; i < r.length; i++) { const q = T(r[i][0], r[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.closePath();
  }
}
export function traceLine(ctx, geom, T) {
  if (!geom) return;
  const lines = geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'MultiLineString' ? geom.coordinates : [];
  for (const r of lines) for (let i = 0; i < r.length; i++) { const q = T(r[i][0], r[i][1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
}
export const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
export const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------- computational space (Phase 01.3)
// One-hue ordinal ramps for banded field display (7 steps, OKLCH L 0.73 → 0.36, validated with the data-viz
// ordinal checks against the paper: monotone lightness, ΔL ≥ 0.06, light end ≥ 2:1). Distinct from species colours
// and from the state colours (select = rust, hover = violet, draft = ochre).
export const FIELD_RAMPS = {
  'field.elevation': ['#BEA18C', '#AA8E7A', '#977C68', '#846A56', '#725845', '#604734', '#4F3724'],
  'field.slope': ['#C3A35F', '#AF904C', '#9C7D38', '#896B24', '#77590A', '#624902', '#4D3905'],
  'field.distance-to-path': ['#7AB3BA', '#67A0A6', '#548D93', '#427A80', '#2F686E', '#1C565D', '#03454B'],
  'field.distance-to-edge': ['#99B182', '#869E70', '#748B5E', '#62784C', '#51663B', '#40552A', '#30441A'],
  'field.distance-to-obstacle': ['#93AAC4', '#8097B0', '#6E859C', '#5C728A', '#4B6077', '#3A4F65', '#2A3E53'],
  hypothetical: ['#B5A0B2', '#A18D9F', '#8E7A8C', '#7B6879', '#695667', '#574555', '#463444'],
};
// zones: the first condition's classes take indigo steps (ordinal), the second adds hatching, the third stipple,
// so a zone is never told apart by colour alone and at most three colours meet on the map.
export const ZONE_RAMP = ['#98A4DE', '#8591C9', '#737EB5', '#616CA1', '#505A8E', '#40487B', '#303769'];
export function rampSteps(stops, n) {
  if (n <= 1) return [stops[Math.floor(stops.length / 2)]];
  if (n === 2) return [stops[1], stops[stops.length - 2]];
  return Array.from({ length: n }, (_, k) => stops[Math.round((k * (stops.length - 1)) / (n - 1))]);
}
export function fieldRamp(fieldId, hypothetical = false) { return FIELD_RAMPS[fieldId] || (hypothetical ? FIELD_RAMPS.hypothetical : FIELD_RAMPS['field.distance-to-obstacle']); }
