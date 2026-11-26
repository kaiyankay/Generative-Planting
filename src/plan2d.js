// Orthographic plan: vector canvas, pan / zoom, picking against the shared model.
// World plan = every group; isolated plan = one group at full strength + optional reference overlays (opacity),
// same coordinates, same selection, same camera.
import { TOK, rgba, tracePoly, traceLine, SANS } from './style.js';
import { bboxOf } from './model.js';
import { ORDER, paintGroup, getRaster } from './paint.js';
export { getRaster };

export class Plan2D {
  constructor(canvas, store, picker) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.s = store; this.picker = picker;
    this.view = { cx: 0, cy: -2, scale: 8 }; // px per metre (CSS px)
    this.iso = null; // { group, overlays: { gid: opacity } }
    this.pad = { l: 40, r: 40, t: 70, b: 76 };
    this.active = false;
    this._bind();
    for (const ev of ['layers', 'selection', 'hover', 'model']) store.on(ev, () => this.request());
  }
  setActive(a) { this.active = a; if (a) { this.resize(); this.request(); } }
  setIsolation(iso) { this.iso = iso; this.picker.scope = iso ? iso.group : null; this.request(); }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.request();
  }
  request() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; if (this.active) this.draw(); }); }
  drawNow() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } this.draw(); }
  T = (x, y) => [this.w / 2 + (x - this.view.cx) * this.view.scale, this.h / 2 - (y - this.view.cy) * this.view.scale];
  inv(px, py) { return [this.view.cx + (px - this.w / 2) / this.view.scale, this.view.cy - (py - this.h / 2) / this.view.scale]; }
  viewBox() { const [x0, y1] = this.inv(0, 0), [x1, y0] = this.inv(this.w, this.h); return [x0, y0, x1, y1]; }

  // default frame = the designed garden (A/B/C beds, triangles, Rain Garden) + margin, from the data
  gardenBounds() {
    if (this._gb) return this._gb;
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const bed of this.s.beds) { if (bed.props.style === 'M') continue; const q = bboxOf(bed.geometry); b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); }
    return (this._gb = [b[0] - 6, b[1] - 8, b[2] + 6, b[3] + 6]);
  }
  fit(b = this.gardenBounds(), pad = this.padFor()) {
    const W = Math.max(50, this.w - pad.l - pad.r), H = Math.max(50, this.h - pad.t - pad.b);
    this.view.scale = Math.min(W / (b[2] - b[0]), H / (b[3] - b[1]));
    this.view.cx = (b[0] + b[2]) / 2 - (pad.l - pad.r) / 2 / this.view.scale;
    this.view.cy = (b[1] + b[3]) / 2 + (pad.t - pad.b) / 2 / this.view.scale;
    this.request();
  }
  // keep fitted content clear of the panels that are open (legend left, inspector right)
  padFor() {
    const p = { ...this.pad }; if (this.w < 760) return p;
    const lg = document.getElementById('layers'); if (lg && !lg.hidden) p.l = Math.max(p.l, lg.getBoundingClientRect().right + 16);
    const ins = document.getElementById('inspector'); if (ins && !ins.hidden) p.r = Math.max(p.r, this.w - ins.getBoundingClientRect().left + 16);
    return p;
  }
  focus(id) {
    const o = this.s.getObject(id); if (!o) return;
    const g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null) || (o.position ? { type: 'Point', coordinates: o.position } : null);
    if (!g) return;
    let b = bboxOf(g); const m = Math.max(4, (b[2] - b[0]) * 0.25, (b[3] - b[1]) * 0.25);
    b = [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    const ins = document.getElementById('inspector'); const right = ins && !ins.hidden && this.w > 760 ? ins.getBoundingClientRect().width + 40 : 60;
    this.fit(b, { l: this.w > 760 ? 280 : 20, r: right, t: 90, b: 70 });
  }

  _bind() {
    const c = this.c;
    let drag = null;
    c.addEventListener('pointerdown', (e) => { try { c.setPointerCapture(e.pointerId); } catch { /* synthetic / automation events have no active pointer */ } drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy, moved: false }; });
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
    const t0 = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = TOK.paper; ctx.fillRect(0, 0, this.w, this.h);
    if (this.showGrid || (this.iso && sc > 6)) this._grid();
    const o = { scale: sc, vb: this.viewBox(), focus: this.iso ? this.iso.group : null };
    for (const [gid, phase] of ORDER) {
      if (!this.iso) { paintGroup(ctx, s, T, gid, phase, o); continue; }
      if (gid === this.iso.group) { paintGroup(ctx, s, T, gid, phase, o); continue; }
      const op = this.iso.overlays && this.iso.overlays[gid];
      if (op > 0) { ctx.save(); ctx.globalAlpha = op; paintGroup(ctx, s, T, gid, phase, { ...o, overlay: true }); ctx.restore(); }
    }
    this._highlight();
    this._overlay();
    this.lastDrawMs = performance.now() - t0;
  }

  _grid() {
    const { ctx } = this; const sc = this.view.scale;
    const step = sc > 40 ? 1 : sc > 6 ? 10 : 50;
    const [x0, y1] = this.inv(0, 0), [x1, y0] = this.inv(this.w, this.h);
    ctx.lineWidth = 1;
    for (const [st, a] of [[step, 0.05], [step * 5, 0.09]]) {
      ctx.strokeStyle = rgba(TOK.ink, a); ctx.beginPath();
      for (let x = Math.ceil(x0 / st) * st; x < x1; x += st) { const p = this.T(x, 0); ctx.moveTo(Math.round(p[0]) + 0.5, 0); ctx.lineTo(Math.round(p[0]) + 0.5, this.h); }
      for (let y = Math.ceil(y0 / st) * st; y < y1; y += st) { const p = this.T(0, y); ctx.moveTo(0, Math.round(p[1]) + 0.5); ctx.lineTo(this.w, Math.round(p[1]) + 0.5); }
      ctx.stroke();
    }
  }

  // state = line style + offset ring, never colour alone: selection solid 2 px + dashed outer ring, hover dashed
  _highlight() {
    const { ctx, s } = this; const T = this.T;
    const draw = (sel, color, w, dash, ring) => {
      if (!sel) return;
      const o = s.getObject(sel.id); if (!o) return;
      let g = o.geometry || (o.geometryRef ? s.getObject(o.geometryRef)?.geometry : null);
      if (o.type === 'plantInstance') g = { type: 'Point', coordinates: o.position };
      if (!g) return;
      ctx.lineWidth = w; ctx.strokeStyle = color; ctx.setLineDash(dash);
      if (g.type === 'Point') {
        const q = T(...g.coordinates); const sp = o.speciesId ? s.getObject(o.speciesId) : null;
        const r = Math.max(6, (o.symbolRadiusM || (sp ? sp.nominalSpreadM * 0.4 : 0.4)) * this.view.scale + 3);
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.stroke();
        if (ring) { ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q[0], q[1], r + 4, 0, 7); ctx.stroke(); }
      } else if (g.type === 'MultiPoint') {
        for (const c of g.coordinates) { const q = T(...c); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 7); ctx.stroke(); }
      } else if (g.type.includes('Line')) { ctx.beginPath(); traceLine(ctx, g, T); ctx.stroke(); }
      else {
        ctx.beginPath(); tracePoly(ctx, g, T);
        if (ring) { ctx.save(); ctx.lineWidth = w + 6; ctx.strokeStyle = rgba(color, 0.16); ctx.stroke(); ctx.restore(); }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    draw(s.hover, rgba(TOK.hover, 0.9), 1.3, [4, 3], false);
    if (s.selection) {
      ctx.save(); ctx.shadowColor = rgba(TOK.paper, 0.95); ctx.shadowBlur = 4; draw(s.selection, TOK.select, 2.2, [], true); ctx.restore();
    }
  }

  _overlay() {
    const { ctx } = this; const sc = this.view.scale;
    // scale bar (bottom-left), recomputed per zoom; true north = +y
    const target = 120 / sc; const nice = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200].find((v) => v >= target * 0.6) || 200;
    const L = nice * sc; const x = 24, y = this.h - 34;
    ctx.fillStyle = TOK.inkDeep; ctx.strokeStyle = TOK.inkDeep; ctx.lineWidth = 1;
    ctx.fillRect(x, y, L / 2, 3); ctx.strokeRect(x + 0.5, y + 0.5, L, 3);
    ctx.font = `10.5px ${SANS}`; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.fillText('0', x - 2, y - 3); ctx.textAlign = 'center'; ctx.fillText(String(nice / 2), x + L / 2, y - 3); ctx.fillText(nice + ' m', x + L, y - 3);
    const nx = x + L + 40, ny = y + 3;
    ctx.beginPath(); ctx.moveTo(nx, ny - 24); ctx.lineTo(nx + 6, ny); ctx.lineTo(nx, ny - 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx, ny - 24); ctx.lineTo(nx - 6, ny); ctx.lineTo(nx, ny - 6); ctx.closePath(); ctx.stroke();
    ctx.textAlign = 'center'; ctx.fillText('N', nx, ny - 26);
  }
}
