// One picking rule for both views: progressive drill-down Site/District -> Bed -> Patch -> Plant.
import { polyContains, distToGeom, speciesLayer } from './model.js';

export class Picker {
  constructor(store) { this.s = store; }

  _selectable(layer) { return this.s.layerVisible(layer) && !this.s.layerLocked(layer) && this.s.layers.get(layer)?.selectable !== false; }

  _woodyAt(x, y) {
    const s = this.s;
    const i = s.nearestInstance(x, y, 6, (k) => {
      const sp = s.speciesByIndex[s.isp(k)]; const L = speciesLayer(sp);
      if (L !== 'veg.trees' && L !== 'veg.shrubs') return false;
      if (!this._selectable(L)) return false;
      return Math.hypot(s.ix(k) - x, s.iy(k) - y) < (sp.nominalSpreadM / 2) * s.iscale(k) * 0.9;
    });
    return i >= 0 ? i : null;
  }
  _plantAt(x, y, scale) {
    const s = this.s;
    const r = Math.max(0.3, 6 / Math.max(1, scale));
    const i = s.nearestInstance(x, y, r, (k) => {
      const L = speciesLayer(s.speciesByIndex[s.isp(k)]);
      return L !== 'veg.trees' && L !== 'veg.shrubs' && this._selectable(L);
    });
    return i >= 0 ? i : null;
  }
  _patchAt(x, y, scale) {
    if (!this._selectable('structure.patches')) return null;
    const list = this.s.getPlacementsAt(x, y, { includeBulbs: false, tol: 4 / Math.max(1, scale) });
    return list[0] || null;
  }
  _objectAt(x, y) {
    const s = this.s;
    const bed = s.getBedAt(x, y);
    if (bed && this._selectable('structure.beds')) return bed;
    // structures, walls, paths, water, lawn, context — in priority order
    const order = ['monument', 'tower', 'building', 'boardwalk', 'wall', 'swale', 'bench', 'path', 'water', 'parking', 'road', 'lawn'];
    for (const t of order) {
      for (const o of s.model.objects) {
        if (o.type !== t || !o.geometry || !this._selectable(o.layer)) continue;
        const tol = t === 'wall' || t === 'swale' ? 0.8 : t === 'monument' ? 2.2 : t === 'bench' ? 1 : 0;
        if (o.geometry.type.includes('Polygon') ? polyContains(o.geometry, x, y) : distToGeom(o.geometry, x, y) <= tol) return o;
      }
    }
    for (const o of s.model.objects) if (o.type === 'district' && o.geometry && polyContains(o.geometry, x, y) && this._selectable(o.layer)) return o;
    return null;
  }

  // what a click would select now (used for hover feedback too)
  resolve(x, y, scale) {
    const s = this.s; const cur = s.selection;
    const w = this._woodyAt(x, y);
    if (w != null) return { id: 'pi.' + w };
    const bed = s.getBedAt(x, y);
    if (cur && bed) {
      const kind = s.kindOf(cur.id);
      const co = s.getObject(cur.id);
      if (kind === 'object' && co.id === bed.id) {
        const p = this._patchAt(x, y, scale); if (p) return { id: p.id };
        const pl = this._plantAt(x, y, scale); if (pl != null) return { id: 'pi.' + pl };
      }
      if (kind === 'placement' && co.bedId === bed.id) {
        const p = this._patchAt(x, y, scale);
        if (p && p.id === co.id) { const pl = this._plantAt(x, y, scale); if (pl != null) return { id: 'pi.' + pl }; }
        if (p) return { id: p.id };
      }
      if (kind === 'instance' && co.bedId === bed.id) {
        const pl = this._plantAt(x, y, scale); if (pl != null) return { id: 'pi.' + pl };
        const p = this._patchAt(x, y, scale); if (p) return { id: p.id };
      }
    }
    const o = this._objectAt(x, y);
    return o ? { id: o.id } : null;
  }
  hoverAt(x, y, scale) {
    const r = this.resolve(x, y, scale);
    this.s.setHover(r && (!this.s.selection || r.id !== this.s.selection.id) ? r : null);
  }
  clickAt(x, y, scale) {
    const r = this.resolve(x, y, scale);
    this.s.select(r ? { ...r, at: [+x.toFixed(2), +y.toFixed(2)] } : null);
  }
  up() {
    const s = this.s; const cur = s.selection; if (!cur) return;
    const o = s.getObject(cur.id); const k = s.kindOf(cur.id);
    if (k === 'instance') s.select(o.placementId ? { id: o.placementId, at: cur.at } : null);
    else if (k === 'placement') s.select(o.bedId ? { id: o.bedId, at: cur.at } : null);
    else s.select(null);
  }
}
