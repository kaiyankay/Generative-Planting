// One picking rule for both views: progressive drill-down Site/District -> Bed -> Patch -> Plant.
// In an isolated layer (scope = group id) only that group's objects are pickable; overlays never steal a click.
import { polyContains, distToGeom } from './model.js';
import { GROUP } from './layers.js';

export class Picker {
  constructor(store) { this.s = store; this.scope = null; }

  _inScope(layer) { return !this.scope || GROUP[this.scope].layers.includes(layer); }
  _selectable(layer) { return this._inScope(layer) && this.s.layerVisible(layer) && !this.s.layerLocked(layer) && this.s.layers.get(layer)?.selectable !== false; }

  _woodyAt(x, y) {
    const s = this.s;
    const i = s.nearestInstance(x, y, 8, (k) => {
      const L = s.instanceLayer(k);
      if (L !== 'veg.trees' && L !== 'veg.shrubs' && L !== 'siteveg.trees') return false;
      if (!this._selectable(L)) return false;
      const sp = s.speciesByIndex[s.isp(k)];
      return Math.hypot(s.ix(k) - x, s.iy(k) - y) < (sp.nominalSpreadM / 2) * s.iscale(k) * 0.9;
    });
    return i >= 0 ? i : null;
  }
  _plantAt(x, y, scale) {
    const s = this.s;
    const r = Math.max(0.3, 6 / Math.max(1, scale));
    const i = s.nearestInstance(x, y, r, (k) => {
      const L = s.instanceLayer(k);
      return L !== 'veg.trees' && L !== 'veg.shrubs' && L !== 'siteveg.trees' && this._selectable(L);
    });
    return i >= 0 ? i : null;
  }
  _patchAt(x, y, scale, bulbs = false) {
    if (!this._selectable('structure.patches') && !(bulbs && this._selectable('structure.bulbs'))) return null;
    const list = this.s.getPlacementsAt(x, y, { includeBulbs: bulbs, tol: 4 / Math.max(1, scale) })
      .filter((p) => this._selectable((p.role || '').startsWith('bulb') ? 'structure.bulbs' : 'structure.patches'));
    return list[0] || null;
  }
  _objectAt(x, y, types) {
    const s = this.s;
    const bed = s.getBedAt(x, y);
    if (bed && this._selectable('structure.beds') && (!types || types.includes('bed'))) return bed;
    const order = types || ['monument', 'tower', 'building', 'boardwalk', 'wall', 'swale', 'bench', 'path', 'water', 'parking', 'road', 'lawn'];
    for (const t of order) {
      for (const o of s.model.objects) {
        if (o.type !== t || !o.geometry || !this._selectable(s.layerOf(o))) continue;
        const tol = t === 'wall' || t === 'swale' ? 0.8 : t === 'monument' ? 2.2 : t === 'bench' ? 1 : 0;
        if (o.geometry.type.includes('Polygon') ? polyContains(o.geometry, x, y) : distToGeom(o.geometry, x, y) <= tol) return o;
      }
    }
    if (!types) for (const o of s.model.objects) if (o.type === 'district' && o.geometry && polyContains(o.geometry, x, y) && this._selectable(o.layer)) return o;
    return null;
  }

  // what a click would select now (used for hover feedback too)
  resolve(x, y, scale) {
    const s = this.s; const cur = s.selection;
    if (this.scope) return this._resolveScoped(x, y, scale);
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
  _resolveScoped(x, y, scale) {
    const s = this.s;
    switch (this.scope) {
      case 'composition': { const p = this._patchAt(x, y, scale, true); return p ? { id: p.id } : null; }
      case 'representation': {
        const w = this._woodyAt(x, y); if (w != null) return { id: 'pi.' + w };
        const pl = this._plantAt(x, y, scale); return pl != null ? { id: 'pi.' + pl } : null;
      }
      case 'siteveg': { const w = this._woodyAt(x, y); if (w != null) return { id: 'pi.' + w }; const o = this._objectAt(x, y, ['lawn']); return o ? { id: o.id } : null; }
      case 'framework': { const o = this._objectAt(x, y, ['bed']); if (o) return { id: o.id }; const d = s.model.objects.find((q) => q.type === 'district' && polyContains(q.geometry, x, y) && this._selectable(q.layer)); return d ? { id: d.id } : null; }
      case 'infrastructure': { const o = this._objectAt(x, y, ['monument', 'tower', 'building', 'boardwalk', 'wall', 'swale', 'bench', 'path', 'water', 'parking', 'road']); return o ? { id: o.id } : null; }
      default: { // terrain / analysis: the site, with conditions sampled at the click point
        const e = s.sampleElevation(x, y); return e == null ? null : { id: 'site.oudolf-garden-detroit', point: true };
      }
    }
  }
  hoverAt(x, y, scale) {
    const r = this.resolve(x, y, scale);
    this.s.setHover(r && (!this.s.selection || r.id !== this.s.selection.id) && !r.point ? r : null);
  }
  clickAt(x, y, scale) {
    const r = this.resolve(x, y, scale);
    this.s.select(r ? { id: r.id, at: [+x.toFixed(2), +y.toFixed(2)] } : null);
  }
  up() {
    const s = this.s; const cur = s.selection; if (!cur) return;
    const o = s.getObject(cur.id); const k = s.kindOf(cur.id);
    if (k === 'instance') s.select(o.placementId ? { id: o.placementId, at: cur.at } : null);
    else if (k === 'placement') s.select(o.bedId ? { id: o.bedId, at: cur.at } : null);
    else s.select(null);
  }
}
