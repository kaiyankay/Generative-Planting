// One visual language for plan, ground texture and 3D.
export const PAL = {
  paper: '#F3EFE5',
  ink: '#2E3328',
  inkSoft: '#6B6F60',
  lawn: '#CBD4A6',
  lawnDeep: '#B9C58F',
  meadow: '#D9D3A8',
  gravel: '#E9E1CF',
  concrete: '#E4E1D9',
  road: '#D9D5CB',
  parking: '#DEDAD1',
  water: '#AFC4C2',
  waterDeep: '#93AEAD',
  soil: '#54493A',
  soilLight: '#8A7457',
  steel: '#3A3631',
  limestone: '#C9BC9E',
  building: '#D8D1C4',
  wood: '#A8875E',
  select: '#C2552B',
  hover: '#8A5A9E',
  matrix: '#E6D79A',
};

export const STATUS_LABEL = {
  documented: 'Documented', reconstructed: 'Reconstructed', schematic: 'Schematic', unknown: 'Unknown',
};

export function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }

// species colour for plan fills: flower colour (if any) softened toward paper, else foliage
export function speciesPlanColor(sp) {
  if (!sp) return '#9a9a8a';
  const base = sp.displayFlower || sp.displayLeaf || '#7a8a5a';
  return mix(base, PAL.paper, 0.28);
}

// trace a GeoJSON-like polygon into a canvas path with a transform fn
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

export function paintContours(ctx, store, T, { scale = 10, alpha = 1 } = {}) {
  const lines = store.contours(0.25);
  for (const L of lines) {
    ctx.beginPath();
    const s = L.segs;
    for (let i = 0; i < s.length; i += 4) { const a = T(s[i], s[i + 1]), b = T(s[i + 2], s[i + 3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.strokeStyle = rgba('#6B5A3A', (L.major ? 0.75 : 0.38) * alpha);
    ctx.lineWidth = L.major ? Math.max(1, scale * 0.09) : Math.max(0.6, scale * 0.05);
    ctx.stroke();
  }
}

// paint the ground (shared by plan and the 3D terrain texture)
export function paintGround(ctx, store, T, { scale = 10, forTexture = false } = {}) {
  const O = (id) => store.getObject(id);
  const vis = (l) => store.layerVisible(l);
  const fill = (geom, color) => { ctx.beginPath(); tracePoly(ctx, geom, T); ctx.fillStyle = color; ctx.fill('evenodd'); };
  if (vis('veg.lawn')) {
    fill(O('veg.lawn').geometry, PAL.lawn);
    fill(O('veg.carillon-island').geometry, PAL.lawnDeep);
  }
  if (vis('site.context')) {
    fill(O('context.parking').geometry, PAL.parking);
    fill(O('context.roads').geometry, PAL.road);
  }
  for (const id of ['district.west-meadow', 'district.east-meadow']) {
    const o = O(id); if (!o) continue;
    fill(o.geometry, forTexture ? PAL.lawnDeep : PAL.meadow);
  }
  if (vis('site.water')) {
    fill(O('water.lake-tacoma').geometry, PAL.water);
    fill(O('water.carillon-moat').geometry, PAL.water);
  }
  if (vis('built.paths')) {
    fill(O('context.sidewalks').geometry, PAL.concrete);
    fill(O('built.gravel-walks').geometry, PAL.gravel);
  }
  if (vis('built.walks')) fill(O('built.grass-walks').geometry, PAL.lawnDeep);
  // bed soil
  if (vis('structure.beds') || forTexture) {
    for (const b of store.beds) {
      if (b.props.style === 'M') continue;
      fill(b.geometry, forTexture ? PAL.soil : mix(PAL.soilLight, PAL.paper, 0.55));
    }
  }
  // structures footprints
  for (const o of store.model.objects) {
    if ((o.type === 'building' || o.type === 'tower') && o.geometry && vis(o.layer)) fill(o.geometry, PAL.building);
    if (o.type === 'boardwalk' && vis('built.structures')) fill(o.geometry, PAL.wood);
  }
}
