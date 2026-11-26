// Rhino-like orthographic plan: vector canvas, pan / zoom, picking against the shared model.
import { PAL, mix, rgba, speciesPlanColor, tracePoly, traceLine, paintGround, paintContours } from './style.js';
import { speciesLayer, centroidOf, bboxOf } from './model.js';

export class Plan2D {
  constructor(canvas, store, picker) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.s = store; this.picker = picker;
    this.view = { cx: 0, cy: -2, scale: 8 }; // px per metre (CSS px)
    this.dirty = true; this.active = false;
    this._bind();
    store.on('layers', () => this.request());
    store.on('selection', () => this.request());
    store.on('hover', () => this.request());
    store.on('model', () => this.request());
  }
  setActive(a) { this.active = a; if (a) { this.resize(); this.request(); } }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.request();
  }
  request() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; if (this.active) this.draw(); }); }
  T = (x, y) => [this.w / 2 + (x - this.view.cx) * this.view.scale, this.h / 2 - (y - this.view.cy) * this.view.scale];
  inv(px, py) { return [this.view.cx + (px - this.w / 2) / this.view.scale, this.view.cy - (py - this.h / 2) / this.view.scale]; }

  fit(b = [-70, -48, 70, 40], pad = { l: 40, r: 40, t: 70, b: 50 }) {
    const W = Math.max(50, this.w - pad.l - pad.r), H = Math.max(50, this.h - pad.t - pad.b);
    this.view.scale = Math.min(W / (b[2] - b[0]), H / (b[3] - b[1]));
    this.view.cx = (b[0] + b[2]) / 2 - (pad.l - pad.r) / 2 / this.view.scale;
    this.view.cy = (b[1] + b[3]) / 2 + (pad.t - pad.b) / 2 / this.view.scale;
    this.request();
  }
  focus(id) {
    const o = this.s.getObject(id); if (!o) return;
    const g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null) || (o.position ? { type: 'Point', coordinates: o.position } : null);
    if (!g) return;
    let b = bboxOf(g); const m = Math.max(4, (b[2] - b[0]) * 0.25, (b[3] - b[1]) * 0.25);
    b = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    this.fit(b, { l: 300, r: 380, t: 80, b: 60 });
  }

  _bind() {
    const c = this.c;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy, moved: false }; });
    c.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        this.view.cx = drag.cx - dx / this.view.scale; this.view.cy = drag.cy + dy / this.view.scale;
        this.request();
      } else {
        const r = c.getBoundingClientRect();
        const [x, y] = this.inv(e.clientX - r.left, e.clientY - r.top);
        this.picker.hoverAt(x, y, this.view.scale);
        this.cursor = [x, y];
        this.onCursor && this.onCursor(x, y);
      }
    });
    c.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) {
        const r = c.getBoundingClientRect();
        const [x, y] = this.inv(e.clientX - r.left, e.clientY - r.top);
        this.picker.clickAt(x, y, this.view.scale, e);
      }
      drag = null;
    });
    c.addEventListener('pointerleave', () => this.s.setHover(null));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const [x, y] = this.inv(px, py);
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
      this.view.scale = Math.max(1.2, Math.min(400, this.view.scale * k));
      this.view.cx = x - (px - this.w / 2) / this.view.scale; this.view.cy = y + (py - this.h / 2) / this.view.scale;
      this.request();
    }, { passive: false });
  }

  draw() {
    const { ctx, s } = this; const T = this.T; const sc = this.view.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PAL.paper; ctx.fillRect(0, 0, this.w, this.h);
    this._grid();
    ctx.save();
    paintGround(ctx, s, T, { scale: sc });
    if (s.layerVisible('topo.contours')) paintContours(ctx, s, T, { scale: Math.min(sc, 30) * 0.4 });
    if (s.layerVisible('analysis.slope')) this._raster('slope');
    if (s.layerVisible('analysis.pathdist')) this._raster('pathdist');
    if (s.layerVisible('site.water')) this._waterHatch();
    const vis = (l) => s.layerVisible(l);

    // meadow stipple
    for (const id of ['bed.MW', 'bed.ME']) {
      const o = s.getObject(id); if (!o || !vis('structure.beds')) continue;
      ctx.save(); ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.clip('evenodd');
      ctx.strokeStyle = rgba('#8B8457', 0.35); ctx.lineWidth = 1;
      const b = bboxOf(o.geometry); const step = Math.max(1.6, 10 / sc);
      ctx.beginPath();
      for (let x = b[0]; x < b[2]; x += step) for (let y = b[1]; y < b[3]; y += step) {
        const jx = x + ((x * 13.7 + y * 7.1) % 1) * step * 0.6, jy = y + ((x * 3.3 + y * 11.9) % 1) * step * 0.6;
        const p = T(jx, jy); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + 0.6, p[1] - 3);
      }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.setLineDash([4, 3]); ctx.strokeStyle = rgba('#6B6F50', 0.8); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }

    // patches
    const showPatches = vis('structure.patches');
    const showBulbs = vis('veg.bulbs');
    const placements = s.model.placements;
    if (showPatches) {
      for (const p of placements) {
        if (p._removed) continue;
        const isBulb = (p.role || '').startsWith('bulb');
        if (isBulb) continue;
        if (p.kind === 'area' && p.role === 'matrix') {
          const g = s.placementGeom(p); if (!g) continue;
          ctx.beginPath(); tracePoly(ctx, g, T);
          const sp = p.speciesIds[0] ? s.getObject(p.speciesIds[0]) : null;
          ctx.fillStyle = sp ? mix(PAL.matrix, PAL.paper, 0.15) : mix('#C9C3A6', PAL.paper, 0.2); ctx.fill('evenodd');
        }
      }
      for (const p of placements) {
        if (p._removed || p.kind !== 'area' || p.role === 'matrix' || p.role === 'meadow' || (p.role || '').startsWith('bulb')) continue;
        const sp = s.getObject(p.speciesIds[0]);
        ctx.beginPath(); tracePoly(ctx, p.geometry, T);
        ctx.fillStyle = speciesPlanColor(sp); ctx.fill();
        if (sc > 3) { ctx.strokeStyle = rgba(PAL.ink, sc > 12 ? 0.55 : 0.3); ctx.lineWidth = sc > 20 ? 1 : 0.6; ctx.stroke(); }
        if (p.speciesIds.length > 1 && sc > 6) { // paired legend entries: second species hatched
          const sp2 = s.getObject(p.speciesIds[1]);
          ctx.save(); ctx.clip(); ctx.strokeStyle = rgba(sp2.displayFlower || sp2.displayLeaf, 0.55); ctx.lineWidth = 1.2;
          const b = bboxOf(p.geometry); const st = 0.35; ctx.beginPath();
          for (let k = b[0] - (b[3] - b[1]); k < b[2]; k += st) { const a = T(k, b[1]), c2 = T(k + (b[3] - b[1]), b[3]); ctx.moveTo(a[0], a[1]); ctx.lineTo(c2[0], c2[1]); }
          ctx.stroke(); ctx.restore();
        }
      }
    }
    // bulbs: dotted drift outlines
    if (showBulbs) {
      ctx.setLineDash([2, 2.5]); ctx.lineWidth = sc > 15 ? 1.3 : 0.9;
      for (const p of placements) {
        if (p._removed || !(p.role || '').startsWith('bulb') || !p.geometry) continue;
        const sp = s.getObject(p.speciesIds[0]);
        ctx.beginPath(); tracePoly(ctx, p.geometry, T); ctx.strokeStyle = rgba(mix(sp.displayFlower || '#888', PAL.ink, 0.25), 0.85); ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // plant instances
    this._instances(sc);

    // emergent / individual symbols
    if (showPatches) {
      for (const p of placements) {
        if (p._removed || p.kind !== 'point' || p.role === 'tree' || p.role === 'shrub' || p.role === 'hedgerow') continue;
        const sp = s.getObject(p.speciesIds[0]); const q = T(...p.geometry.coordinates);
        const r = Math.max(2.2, (p.symbolRadiusM || 0.3) * sc);
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7);
        ctx.fillStyle = rgba(PAL.paper, 0.75); ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.22); ctx.strokeStyle = mix(sp.displayFlower || sp.displayLeaf, PAL.ink, 0.15); ctx.stroke();
        if (r > 9) { ctx.fillStyle = PAL.ink; ctx.font = `${Math.min(11, r * 0.75)}px ui-sans-serif, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.legendCode, q[0], q[1] + 0.5); }
      }
    }

    // bed edging (steel) + walls
    if (vis('built.edging')) {
      ctx.strokeStyle = PAL.steel; ctx.lineWidth = Math.max(0.8, Math.min(2.2, sc * 0.08));
      for (const b of s.beds) { if (b.props.style === 'M') continue; ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.stroke(); }
    }
    if (vis('built.walls')) {
      for (const o of s.model.objects) if (o.type === 'wall') {
        ctx.beginPath(); traceLine(ctx, o.geometry, T); ctx.strokeStyle = PAL.limestone; ctx.lineWidth = Math.max(2, 0.5 * sc); ctx.lineCap = 'butt'; ctx.stroke();
        ctx.strokeStyle = rgba(PAL.ink, 0.6); ctx.lineWidth = 0.8; ctx.stroke();
      }
    }
    if (vis('built.structures')) this._structures(sc);
    // woody plants (crowns) on top
    this._woody(sc);
    if (vis('structure.labels')) this._labels(sc);
    ctx.restore();
    this._highlight();
    this._overlay();
  }

  _grid() {
    const { ctx } = this; const sc = this.view.scale;
    const step = sc > 40 ? 1 : sc > 6 ? 10 : 50;
    const [x0, y1] = this.inv(0, 0), [x1, y0] = this.inv(this.w, this.h);
    ctx.lineWidth = 1;
    for (const [st, a] of [[step, 0.06], [step * 5, 0.1]]) {
      ctx.strokeStyle = rgba(PAL.ink, a); ctx.beginPath();
      for (let x = Math.ceil(x0 / st) * st; x < x1; x += st) { const p = this.T(x, 0); ctx.moveTo(Math.round(p[0]) + 0.5, 0); ctx.lineTo(Math.round(p[0]) + 0.5, this.h); }
      for (let y = Math.ceil(y0 / st) * st; y < y1; y += st) { const p = this.T(0, y); ctx.moveTo(0, Math.round(p[1]) + 0.5); ctx.lineTo(this.w, Math.round(p[1]) + 0.5); }
      ctx.stroke();
    }
  }

  _waterHatch() {
    const { ctx, s } = this; const T = this.T;
    for (const id of ['water.lake-tacoma', 'water.carillon-moat']) {
      const o = s.getObject(id); ctx.save(); ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.clip('evenodd');
      ctx.strokeStyle = rgba('#FFFFFF', 0.45); ctx.lineWidth = 1; ctx.beginPath();
      const step = 14; for (let y = 0; y < this.h; y += step) { ctx.moveTo(0, y); ctx.lineTo(this.w, y + 6); }
      ctx.stroke(); ctx.restore();
      ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.strokeStyle = PAL.waterDeep; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  _instances(sc) {
    const { ctx, s } = this; const T = this.T;
    if (sc < 3) return;
    const [x0, y1] = this.inv(-20, -20), [x1, y0] = this.inv(this.w + 20, this.h + 20);
    const vis = {}; for (const l of ['veg.forbs', 'veg.grasses', 'veg.bulbs']) vis[l] = s.layerVisible(l);
    const detail = sc > 28;
    for (let i = 0; i < s.instanceCount; i++) {
      const x = s.ix(i), y = s.iy(i);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const sp = s.speciesByIndex[s.isp(i)];
      const L = speciesLayer(sp);
      if (L === 'veg.trees' || L === 'veg.shrubs' || !vis[L]) continue;
      const q = T(x, y);
      if (L === 'veg.bulbs') { ctx.fillStyle = rgba(mix(sp.displayFlower || '#999', PAL.ink, 0.3), 0.8); ctx.fillRect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6); continue; }
      const r = Math.max(0.9, sp.nominalSpreadM * 0.32 * s.iscale(i) * sc);
      if (L === 'veg.grasses') {
        ctx.strokeStyle = rgba(mix(sp.displayLeaf, PAL.ink, 0.25), 0.8); ctx.lineWidth = detail ? 1 : 0.7; ctx.beginPath();
        const n = detail ? 9 : 5; const rot = s.irot(i);
        for (let k = 0; k < n; k++) { const a = rot + (k / n) * 6.283; ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r); }
        ctx.stroke();
      } else {
        const col = sp.displayFlower || sp.displayLeaf;
        if (detail) {
          ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fillStyle = rgba(mix(sp.displayLeaf, PAL.paper, 0.2), 0.7); ctx.fill();
          ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(PAL.ink, 0.5); ctx.stroke();
          ctx.beginPath(); ctx.arc(q[0], q[1], r * 0.42, 0, 7); ctx.fillStyle = col; ctx.fill();
        } else { ctx.fillStyle = rgba(mix(col, PAL.ink, 0.2), 0.85); ctx.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
      }
    }
  }

  _woody(sc) {
    const { ctx, s } = this; const T = this.T;
    const showT = s.layerVisible('veg.trees'), showS = s.layerVisible('veg.shrubs');
    const items = [];
    for (let i = 0; i < s.instanceCount; i++) {
      const sp = s.speciesByIndex[s.isp(i)];
      const L = speciesLayer(sp);
      if ((L === 'veg.trees' && showT) || (L === 'veg.shrubs' && showS)) items.push([i, sp]);
    }
    items.sort((a, b) => a[1].nominalSpreadM - b[1].nominalSpreadM);
    for (const [i, sp] of items) {
      const q = T(s.ix(i), s.iy(i));
      const r = (sp.nominalSpreadM / 2) * s.iscale(i) * sc * (sp.id === 'sp.unidentified-tree' ? 1 : 0.9);
      // shadow offset to the NE->SW (sun from south-west in plan convention)
      ctx.beginPath(); ctx.arc(q[0] + r * 0.18, q[1] + r * 0.18, r, 0, 7); ctx.fillStyle = rgba('#3A4030', 0.12); ctx.fill();
      ctx.beginPath();
      const n = 14; const rot = s.irot(i);
      for (let k = 0; k <= n; k++) { const a = rot + (k / n) * 6.283; const rr = r * (0.9 + 0.1 * Math.sin(a * 5 + rot * 3)); const px = q[0] + Math.cos(a) * rr, py = q[1] + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      const base = sp.plantType === 'tree' ? '#7E9468' : '#8FA277';
      ctx.fillStyle = rgba(sp.displayFlower && sp.plantType !== 'tree' ? mix(base, sp.displayFlower, 0.25) : base, sp.plantType === 'tree' ? 0.62 : 0.82); ctx.fill();
      ctx.lineWidth = 0.9; ctx.strokeStyle = rgba('#2F3A26', 0.7); ctx.stroke();
      if (r > 5) { ctx.beginPath(); ctx.arc(q[0], q[1], 1.2, 0, 7); ctx.fillStyle = '#2F3A26'; ctx.fill(); }
    }
  }

  _structures(sc) {
    const { ctx, s } = this; const T = this.T;
    for (const o of s.model.objects) {
      if (o.type === 'tower' || (o.type === 'building' && o.layer === 'built.structures')) {
        ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.fillStyle = mix(PAL.limestone, PAL.paper, 0.2); ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (o.type === 'building' && s.layerVisible('site.context')) {
        ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.strokeStyle = rgba(PAL.ink, 0.7); ctx.lineWidth = 1; ctx.stroke();
        ctx.save(); ctx.clip(); ctx.strokeStyle = rgba(PAL.ink, 0.18); ctx.beginPath(); for (let k = -this.h; k < this.w; k += 6) { ctx.moveTo(k, 0); ctx.lineTo(k + this.h, this.h); } ctx.stroke(); ctx.restore();
      } else if (o.type === 'boardwalk') {
        ctx.beginPath(); tracePoly(ctx, o.geometry, T); ctx.strokeStyle = rgba('#5C4630', 0.9); ctx.lineWidth = 1; ctx.stroke();
      } else if (o.type === 'monument' || o.type === 'bench') {
        const q = T(...o.geometry.coordinates); const w = Math.max(3, (o.type === 'monument' ? 3.5 : 1.8) * sc), h = Math.max(1.5, 0.6 * sc);
        ctx.fillStyle = o.type === 'monument' ? '#E9E6DE' : '#A08A68'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 0.8;
        ctx.fillRect(q[0] - w / 2, q[1] - h / 2, w, h); ctx.strokeRect(q[0] - w / 2, q[1] - h / 2, w, h);
      } else if (o.type === 'swale') {
        ctx.beginPath(); traceLine(ctx, o.geometry, T); ctx.setLineDash([2, 3]); ctx.strokeStyle = '#7C8A92'; ctx.lineWidth = Math.max(2, 0.9 * sc); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  _labels(sc) {
    const { ctx, s } = this; const T = this.T;
    for (const b of s.beds) {
      const c = centroidOf(b.geometry); if (!c) continue;
      const q = T(c[0], c[1]);
      const code = b.id.replace('bed.', '');
      const st = b.props.style;
      const r = Math.max(9, Math.min(15, sc * 0.9));
      ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7);
      ctx.fillStyle = rgba(PAL.paper, 0.92); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = PAL.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${code.length > 2 ? Math.round(r * 0.7) : Math.round(r * 0.85)}px ui-sans-serif, system-ui, -apple-system`;
      ctx.fillText(code, q[0], q[1] + 0.5);
      if (sc > 14 && 'ABC'.includes(st)) {
        ctx.font = `500 10px ui-sans-serif, system-ui`; ctx.fillStyle = PAL.inkSoft;
        ctx.fillText(b.props.styleName.toUpperCase(), q[0], q[1] + r + 9);
      }
    }
  }

  _raster(kind) {
    const R = getRaster(this.s, kind);
    const a = this.T(R.x0, R.y1), b = this.T(R.x1, R.y0);
    this.ctx.save(); this.ctx.globalAlpha = 0.62; this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(R.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1]); this.ctx.restore();
  }

  _highlight() {
    const { ctx, s } = this; const T = this.T;
    const draw = (sel, color, w) => {
      if (!sel) return;
      const o = s.getObject(sel.id); if (!o) return;
      let g = o.geometry || (o.geometryRef ? s.getObject(o.geometryRef).geometry : null);
      if (o.type === 'plantInstance') g = { type: 'Point', coordinates: o.position };
      if (!g) return;
      ctx.lineWidth = w; ctx.strokeStyle = color;
      if (g.type === 'Point') {
        const q = T(...g.coordinates); const sp = o.speciesId ? s.getObject(o.speciesId) : null;
        const r = Math.max(6, (o.symbolRadiusM || (sp ? sp.nominalSpreadM * 0.4 : 0.4)) * this.view.scale + 3);
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.stroke();
      } else if (g.type === 'MultiPoint') {
        for (const c of g.coordinates) { const q = T(...c); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke(); }
      } else if (g.type.includes('Line')) { ctx.beginPath(); traceLine(ctx, g, T); ctx.stroke(); }
      else { ctx.beginPath(); tracePoly(ctx, g, T); ctx.stroke(); }
    };
    draw(s.hover, rgba(PAL.hover, 0.75), 1.6);
    if (s.selection) {
      ctx.save(); ctx.shadowColor = rgba(PAL.select, 0.35); ctx.shadowBlur = 6;
      draw(s.selection, PAL.select, 2.4); ctx.restore();
    }
  }

  _overlay() {
    const { ctx } = this; const sc = this.view.scale;
    // scale bar (bottom-left)
    const target = 120 / sc; const nice = [1, 2, 5, 10, 20, 25, 50, 100, 200].find((v) => v >= target * 0.6) || 200;
    const L = nice * sc; const x = 24, y = this.h - 30;
    ctx.fillStyle = PAL.ink; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1;
    ctx.fillRect(x, y, L / 2, 4); ctx.strokeRect(x + 0.5, y + 0.5, L, 4);
    ctx.font = '11px ui-sans-serif, system-ui'; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText('0', x - 2, y - 3); ctx.textAlign = 'center'; ctx.fillText(nice / 2, x + L / 2, y - 3); ctx.fillText(nice + ' m', x + L, y - 3);
    // north arrow (true north = +y)
    const nx = x + L + 44, ny = y - 4;
    ctx.beginPath(); ctx.moveTo(nx, ny - 26); ctx.lineTo(nx + 7, ny); ctx.lineTo(nx, ny - 6); ctx.closePath(); ctx.fillStyle = PAL.ink; ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny - 26); ctx.lineTo(nx - 7, ny); ctx.lineTo(nx, ny - 6); ctx.closePath(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText('N', nx, ny - 28);
  }
}

const _rasterCache = new WeakMap();
export function getRaster(s, kind) {
  if (!_rasterCache.has(s)) _rasterCache.set(s, {});
  const c = _rasterCache.get(s);
  return (c[kind] ||= buildRaster(s, kind));
}
function buildRaster(s, kind) {
  const x0 = -90, x1 = 110, y0 = -100, y1 = 50, res = 1;
  const W = (x1 - x0) / res, H = (y1 - y0) / res;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d'); const img = cx.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * res, y = y1 - (j + 0.5) * res;
    let v = kind === 'slope' ? s.sampleSlope(x, y) : s.distanceToPath(x, y);
    const k = (j * W + i) * 4;
    if (v == null || !isFinite(v)) { img.data[k + 3] = 0; continue; }
    let t = kind === 'slope' ? Math.min(1, v / 12) : Math.min(1, v / 8);
    const c = kind === 'slope' ? ramp(['#F4EEC8', '#E9B86B', '#C2552B', '#6E2A3C'], t) : ramp(['#2F6F7A', '#86B6B0', '#F3EFE5'], t);
    img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2];
    img.data[k + 3] = kind === 'pathdist' ? (t >= 1 ? 0 : 210) : Math.round(230 * Math.min(1, t * 2.5));
  }
  cx.putImageData(img, 0, 0);
  return { canvas: cv, x0, x1, y0, y1 };
}
function ramp(stops, t) {
  const n = stops.length - 1; const k = Math.min(n - 1, Math.floor(t * n)); const f = t * n - k;
  const a = parseInt(stops[k].slice(1), 16), b = parseInt(stops[k + 1].slice(1), 16);
  return [16, 8, 0].map((sh) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f));
}
