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
    for (const ev of ['layers', 'selection', 'hover', 'model', 'compute']) store.on(ev, () => this.request());
  }
  setActive(a) { this.active = a; if (this.oc) this.oc.hidden = !a; if (a) { this.resize(); this.request(); } }
  setIsolation(iso) { this.iso = iso; this.picker.scope = iso ? iso.group : null; this.request(); }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr; this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.request();
  }
  // full redraw on the next frame. V3: a design tool (live brush) asks for REGIONS instead (requestRegion) and draws its
  // cursor / preview on a separate overlay canvas (requestOverlay), so a pointer move never repaints the whole site.
  request() { this._full = true; this._schedule(); }
  requestRegion(b) { if (!b) return; const r = this._region; this._region = r ? [Math.min(r[0], b[0]), Math.min(r[1], b[1]), Math.max(r[2], b[2]), Math.max(r[3], b[3])] : b.slice(); this._schedule(); }
  requestOverlay() { this._ov = true; this._schedule(); }
  _schedule() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; if (!this.active) return; const full = this._full, reg = this._region, ov = this._ov; this._full = false; this._region = null; this._ov = false; if (full) this.draw(); else if (reg) this.drawRegion(reg); if (full || ov || reg) this.drawOverlay(); }); }
  drawNow() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } this._full = false; this._region = null; this._ov = false; this.draw(); this.drawOverlay(); }
  // overlay canvas: cursor ring, hover preview, clipped footprint — cleared and redrawn alone (cheap)
  _ensureOverlay() {
    if (this.oc) return this.oc; const oc = document.createElement('canvas'); oc.id = 'c2o'; oc.setAttribute('aria-hidden', 'true'); oc.className = 'plan-overlay';
    this.c.insertAdjacentElement('afterend', oc); this.oc = oc; this.octx = oc.getContext('2d'); return oc;
  }
  drawOverlay() {
    const oc = this._ensureOverlay(); const W = Math.round(this.w * this.dpr), H = Math.round(this.h * this.dpr);
    if (oc.width !== W || oc.height !== H) { oc.width = W; oc.height = H; }
    oc.hidden = !this.active; const c = this.octx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    if (!this.overlayFn || !this.active) return; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const t0 = performance.now(); this.overlayFn(c, this.T, this.view.scale, { vb: this.viewBox() }); this.lastOverlayMs = performance.now() - t0;
  }
  // redraw only a world rectangle (clipped): same painters, culled to the rectangle
  drawRegion(b) {
    const { ctx, s } = this; const T = this.T; const sc = this.view.scale; const t0 = performance.now();
    const p0 = T(b[0], b[3]), p1 = T(b[2], b[1]);
    const x0 = Math.max(0, Math.floor(p0[0]) - 1), y0 = Math.max(0, Math.floor(p0[1]) - 1), x1 = Math.min(this.w, Math.ceil(p1[0]) + 1), y1 = Math.min(this.h, Math.ceil(p1[1]) + 1);
    if (x1 <= x0 || y1 <= y0) return;
    if ((x1 - x0) * (y1 - y0) > this.w * this.h * 0.6) { this.draw(); return; }
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    ctx.fillStyle = TOK.paper; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (this.showGrid || (this.iso && sc > 6)) this._grid();
    const a = this.inv(x0, y1), c = this.inv(x1, y0); const m = 3 + 40 / sc; // cull with a margin so symbols / labels crossing the edge are drawn
    const o = { scale: sc, vb: [a[0] - m, a[1] - m, c[0] + m, c[1] + m], focus: this.iso ? this.iso.group : null, region: true };
    if (this.clipFn) this.clipFn(ctx, T, o);
    for (const [gid, phase] of ORDER) {
      if (!this.iso || gid === 'compute') { paintGroup(ctx, s, T, gid, phase, o); continue; }
      if (gid === this.iso.group) { paintGroup(ctx, s, T, gid, phase, o); continue; }
      const op = this.iso.overlays && this.iso.overlays[gid];
      if (op > 0) { ctx.save(); ctx.globalAlpha = op; paintGroup(ctx, s, T, gid, phase, { ...o, overlay: true }); ctx.restore(); }
    }
    if (this.decor) this.decor(ctx, T, sc, o);
    this._highlight(); this._overlay();
    ctx.restore(); this.lastRegionMs = performance.now() - t0; this.regionDraws = (this.regionDraws || 0) + 1;
  }
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
    const p = { ...this.pad };
    if (this.w < 760) { // phones: panels are bottom sheets, so fit into the space above them
      for (const id of ['layers', 'inspector', 'conditions']) { const e = document.getElementById(id); if (e && !e.hidden) p.b = Math.max(p.b, this.h - e.getBoundingClientRect().top + 10); }
      p.t = Math.max(p.t, 56); return p;
    }
    for (const id of ['layers', 'palette']) { const lg = document.getElementById(id); if (lg && !lg.hidden) p.l = Math.max(p.l, lg.getBoundingClientRect().right + 16); }
    for (const id of ['inspector', 'conditions', 'dpanel']) { const e = document.getElementById(id); if (e && !e.hidden && e.offsetParent !== null) { const r = e.getBoundingClientRect(); if (r.width) p.r = Math.max(p.r, this.w - r.left + 16); } }
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
    // a design tool (brush) takes the left button; pan stays on the right / middle button, Space or Alt + drag
    const world = (e) => { const r = c.getBoundingClientRect(); return this.inv(e.clientX - r.left, e.clientY - r.top); };
    let toolDown = false;
    c.addEventListener('pointerdown', (e) => {
      if (this.tool && e.button === 0 && !e.altKey && !this.spaceDown && (!this.tool.when || this.tool.when(e))) { try { c.setPointerCapture(e.pointerId); } catch { /* synthetic events */ } toolDown = true; const [x, y] = world(e); this.tool.down && this.tool.down(x, y, e); if (!this.tool.selfDraw) this.request(); return; }
      try { c.setPointerCapture(e.pointerId); } catch { /* synthetic / automation events have no active pointer */ } drag = { x: e.clientX, y: e.clientY, cx: this.view.cx, cy: this.view.cy, moved: false };
    });
    c.addEventListener('pointermove', (e) => {
      if (this.tool && (!this.tool.when || toolDown)) { const [x, y] = world(e); this.cursor = [x, y]; this.onCursor && this.onCursor(x, y); if (toolDown) { this.tool.move && this.tool.move(x, y, e); if (!this.tool.selfDraw) this.request(); return; } if (this.tool.hover) { this.tool.hover(x, y, e); if (!this.tool.selfDraw) this.request(); } if (this.tool.selfDraw && !drag) return; }
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
      if (toolDown) { toolDown = false; const [x, y] = world(e); this.tool && this.tool.up && this.tool.up(x, y, e); if (!(this.tool && this.tool.selfDraw)) this.request(); return; }
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
    ctx.save(); if (this.clipFn) this.clipFn(ctx, T, o);
    for (const [gid, phase] of ORDER) {
      if (!this.iso || gid === 'compute') { paintGroup(ctx, s, T, gid, phase, o); continue; }
      if (gid === this.iso.group) { paintGroup(ctx, s, T, gid, phase, o); continue; }
      const op = this.iso.overlays && this.iso.overlays[gid];
      if (op > 0) { ctx.save(); ctx.globalAlpha = op; paintGroup(ctx, s, T, gid, phase, { ...o, overlay: true }); ctx.restore(); }
    }
    if (this.decor) this.decor(ctx, T, sc, o);
    ctx.restore();
    this._highlight();
    this._overlay();
    this.lastDrawMs = performance.now() - t0; this.fullDraws = (this.fullDraws || 0) + 1;
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
