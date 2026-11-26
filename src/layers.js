// Seven layer groups = UI categories over the model's own layer ids (no object is copied; a group only
// says which existing layers it shows). Shared by the layer index, the exploded overview and the isolated plan.

export const GROUPS = [
  { id: 'terrain', name: 'Terrain', short: 'Terrain', layers: ['topo.surface', 'topo.contours', 'site.boundary'],
    blurb: 'USGS 3DEP 1 m elevation, interpolated 0.25 m contours, garden boundary.', sources: ['S-3DEP', 'S-OSM'], physical: true },
  { id: 'infrastructure', name: 'Infrastructure', short: 'Infrastructure', layers: ['built.paths', 'built.walks', 'built.walls', 'built.structures', 'site.water', 'site.context'],
    blurb: 'Paths, walks, walls, Carillon and memorial, water, roads and buildings (OpenStreetMap).', sources: ['S-OSM', 'S-NAIP'], physical: true },
  { id: 'siteveg', name: 'Site Vegetation', short: 'Site vegetation', layers: ['siteveg.trees', 'veg.lawn'],
    blurb: 'Existing tree crowns digitised from NAIP (species unknown) and mown lawn. Kept by default, not proven protected.', sources: ['S-NAIP', 'S-OSM'], physical: true },
  { id: 'framework', name: 'Planting Framework', short: 'Framework', layers: ['structure.districts', 'structure.beds', 'built.edging', 'structure.labels'],
    blurb: 'As-built bed outlines (OSM) and Oudolf bed codes A1–A4, B1–B5, C1–C4 (2020 bulb plans). A design constraint, not terrain.', sources: ['S-OSM', 'S-OGD-BA-2020', 'S-OGD-BB-2020', 'S-OGD-BC-2020'], physical: true },
  { id: 'composition', name: 'Planting Composition', short: 'Composition', layers: ['structure.patches', 'structure.bulbs'],
    blurb: 'Blocks, matrix, groups, emergents and bulb drifts. Species and roles from the legends; positions are schematic.', sources: ['S-OGD-FA-2019', 'S-OGD-FB-2019', 'S-OGD-FC-2019', 'S-MODEL'], physical: true },
  { id: 'representation', name: 'Plant Representation', short: 'Plants', layers: ['veg.trees', 'veg.shrubs', 'veg.grasses', 'veg.forbs', 'veg.bulbs'],
    blurb: 'Visual plant proxies (≈0.42 per real perennial, 0.12 per bulb, 1 per woody plant). Not surveyed plants.', sources: ['S-MODEL'], physical: true },
  { id: 'analysis', name: 'Analysis', short: 'Analysis', layers: ['analysis.slope', 'analysis.pathdist', 'analysis.sun', 'analysis.moisture', 'analysis.ph'],
    blurb: 'Derived from real site data only: slope (3DEP) and distance to path (OSM). Sun, moisture and pH have no data.', sources: ['S-3DEP', 'S-OSM'], physical: false },
];
export const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
export const LAYER_NAME = {
  'topo.surface': 'Terrain surface (3DEP 1 m)', 'topo.contours': 'Contours 0.25 m (interpolated)', 'site.boundary': 'Garden boundary',
  'built.paths': 'Gravel paths & sidewalks', 'built.walks': 'Grass walks', 'built.walls': 'Limestone walls', 'built.structures': 'Carillon, memorial, boardwalk, benches',
  'site.water': 'Water', 'site.context': 'Roads, parking, buildings',
  'siteveg.trees': 'Existing tree crowns', 'veg.lawn': 'Lawn',
  'structure.districts': 'Districts', 'structure.beds': 'Bed outlines', 'built.edging': 'Steel edging', 'structure.labels': 'Bed codes',
  'structure.patches': 'Blocks · matrix · groups · emergents', 'structure.bulbs': 'Bulb drifts & lines',
  'veg.trees': 'Designed trees', 'veg.shrubs': 'Shrubs', 'veg.grasses': 'Grasses & sedges', 'veg.forbs': 'Forbs & ferns', 'veg.bulbs': 'Bulbs (positions)',
  'analysis.slope': 'Slope (derived)', 'analysis.pathdist': 'Distance to path (derived)', 'analysis.sun': 'Sun / shade', 'analysis.moisture': 'Soil moisture', 'analysis.ph': 'Soil pH',
};
export function groupOfLayer(id) { return GROUPS.find((g) => g.layers.includes(id)) || null; }
// visible = any member layer visible (respects view filters); toggling a group toggles its members
export function groupVisible(store, gid) { return GROUP[gid].layers.some((l) => store.layers.has(l) && store.layers.get(l).status !== 'unavailable' && store.layerVisible(l)); }
export function groupLocked(store, gid) { return GROUP[gid].layers.filter((l) => store.layers.has(l)).every((l) => store.layerLocked(l)); }
export function setGroup(store, gid, patch) {
  for (const l of GROUP[gid].layers) if (store.layers.has(l) && store.layers.get(l).status !== 'unavailable') {
    const ex = l === 'topo.contours' && patch.visible === true && !store.layerState[l].visible; // contours stay opt-in
    if (!ex) store.setLayer(l, patch);
  }
}
