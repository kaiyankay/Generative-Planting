// Illustrated miniature model: orthographic 3D view of the same model as the plan.
// Plants are rebuilt from the ACTIVE scenario's instance table whenever the model changes (draft edits,
// scenario switch), so a species replacement changes real rendered geometry, not a label.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TOK, tracePoly, speciesLeaf, speciesFlower, rgba } from './style.js';
import { ORDER, paintGroup } from './paint.js';
import { bboxOf, centroidOf } from './model.js';
import { formGeometry, plantMaterial } from './flora.js';
import { GROUPS, GROUP } from './layers.js';

const BOARD = { x0: -125, x1: 115, y0: -118, y1: 72 };
const CROP = { x0: -72, x1: 74, y0: -52, y1: 42 }; // layers overview: Main Garden + Rain Garden + Bird Border
const PLATE_GAP = 17; // m between plates in the layers overview
const PLATES = ['terrain', 'infrastructure', 'siteveg', 'framework', 'composition', 'representation'];

// rAF animation that always lands its final frame: hidden tabs throttle rAF and headless virtual time may never run it
function animate(ms, frame) {
  const t0 = performance.now(); let done = false;
  const tick = () => { if (done) return; const k = Math.min(1, (performance.now() - t0) / ms); frame(k); if (k < 1) requestAnimationFrame(tick); else done = true; };
  setTimeout(() => { if (!done) { done = true; frame(1); } }, ms + 60);
  tick();
}
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export class Scene3D {
  constructor(canvas, store, picker, opts = {}) {
    this.c = canvas; this.s = store; this.picker = picker; this.active = false;
    // synthetic pointer events (automation, agents) have no active pointer: capture must not throw inside OrbitControls
    for (const k of ['setPointerCapture', 'releasePointerCapture']) canvas[k] = function (id) { try { Element.prototype[k].call(this, id); } catch { /* no active pointer */ } };
    this.quality = opts.quality || 'high';
    this.VEX = opts.vex || 1.6; // vertical exaggeration of TERRAIN only (stated in the UI); plants and buildings true size
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    this.r = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(TOK.paper);
    this.z0 = store.terrain.meta.datumZ;
    this.layersView = false; this.plateFocus = null; this._ex = 0;
    this._camera(); this._lights(); this._terrain(); this._water(); this._built(); this._plants();
    this._selectionLayer(); this._labels(opts.labelRoot); this._bind();
    store.on('layers', () => this._applyLayers());
    store.on('selection', () => this._applySelection());
    store.on('hover', () => this._applyHover());
    store.on('model', () => this._onModel());
    this._applyLayers();
    this.frames = 0; this.fps = 0; this._fpsT = performance.now();
    this._loop = this._loop.bind(this);
  }

  // ---- coordinate mapping
  W(x, y, dz = 0) { const z = this.s.sampleElevation(x, y); return new THREE.Vector3(x, ((z == null ? this.z0 : z) - this.z0) * this.VEX + dz, -y); }
  hY(x, y) { const z = this.s.sampleElevation(x, y); return ((z == null ? this.z0 : z) - this.z0) * this.VEX; }

  _camera() {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
    this.cam = cam;
    this.controls = new OrbitControls(cam, this.c);
    this.controls.enableDamping = !matchMedia('(prefers-reduced-motion: reduce)').matches; this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.25; this.controls.maxZoom = 40;
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.minPolarAngle = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this._needsLabels = true; });
    this.home();
  }
  home() {
    if (this.layersView) { this._layersCamera(true); return; }
    // whole garden as one miniature: beds, Rain Garden, both meadows, Carillon (phones: the beds)
    const narrow = this.w && this.w < 760;
    const t = narrow ? this.W(0, -12) : this.W(8, -28); t.y = 1.5;
    this.controls.target.copy(t);
    const dir = new THREE.Vector3(0.14, 0.74, 0.66).normalize();
    this.cam.position.copy(t).addScaledVector(dir, 400);
    this.cam.up.set(0, 1, 0);
    this._frameWidth = narrow ? 125 : 215; this.cam.zoom = 1;
    this.resize();
    this.controls.update();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.r.setSize(r.width, r.height, false);
    const aspect = r.width / Math.max(1, r.height);
    const fw = this._frameWidth || 122; const fh = fw / aspect;
    const hh = Math.max(fh, 62) / 2, hw = hh * aspect;
    Object.assign(this.cam, { left: -hw, right: hw, top: hh, bottom: -hh });
    this.cam.updateProjectionMatrix();
    this._dirty = true; this._lodDone = false; this._lastMove = performance.now();
  }
  focus(id, mul = 1, instant = false) {
    const o = this.s.getObject(id); if (!o) return;
    let g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null);
    if (o.type === 'plantInstance') g = { type: 'Point', coordinates: o.position };
    if (!g) return;
    const b = bboxOf(g); const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const size = Math.max(6, b[2] - b[0], b[3] - b[1]);
    const t = this.W(c[0], c[1]);
    const off = this.cam.position.clone().sub(this.controls.target);
    const zoom = Math.max(this.controls.minZoom, Math.min(this.controls.maxZoom, mul * (this.cam.top - this.cam.bottom) / (size * 2.1)));
    const ins = document.getElementById('inspector');
    const panel = ins && !ins.hidden && this.w > 760 ? ins.getBoundingClientRect().width + 16 : 0;
    if (panel) {
      const ppm = (this.h / (this.cam.top - this.cam.bottom)) * zoom;
      const right = new THREE.Vector3().setFromMatrixColumn(this.cam.matrixWorld, 0).normalize();
      t.addScaledVector(right, (panel / 2) / ppm);
    }
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.controls.target.copy(t); this.cam.position.copy(t).add(off); this.cam.zoom = zoom; this.cam.updateProjectionMatrix();
      this.controls.update(); this.cam.updateMatrixWorld(); this._updateLOD(true); this._needsLabels = true; this._dirty = true; return;
    }
    this._tween(t, zoom, off);
  }
  _tween(target, zoom, off, pos) {
    const t0 = performance.now(), T0 = this.controls.target.clone(), Z0 = this.cam.zoom, P0 = this.cam.position.clone();
    zoom = Math.max(this.controls.minZoom, Math.min(this.controls.maxZoom, zoom));
    void t0; const gen = (this._tweenGen = (this._tweenGen || 0) + 1);
    animate(650, (k) => {
      if (gen !== this._tweenGen) return; // a newer camera move supersedes this one
      const e = ease(k);
      this.controls.target.lerpVectors(T0, target, e);
      if (pos) this.cam.position.lerpVectors(P0, pos, e); else this.cam.position.copy(this.controls.target).add(off);
      this.cam.zoom = Z0 + (zoom - Z0) * e; this.cam.updateProjectionMatrix(); this.cam.lookAt(this.controls.target);
      this._needsLabels = true; this._dirty = true;
      if (k >= 1) { this.controls.update(); this._lastMove = performance.now(); this._lodDone = false; }
    });
  }

  _lights() {
    this.scene.add(new THREE.HemisphereLight(0xfbf6ea, 0xb9b79a, 1.75));
    const sun = new THREE.DirectionalLight(0xfff3e2, 1.9);
    sun.position.set(-60, 95, 70); sun.target.position.set(0, 0, 10);
    sun.castShadow = true;
    const sz = this.quality === 'high' ? 3072 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4; sun.shadow.intensity = 0.55;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
  }

  // ---------------------------------------------------------------- ground
  _paintGround(ctx, T, sx, region) {
    const o = { scale: sx, texture: true, vb: region };
    ctx.fillStyle = this.s.layerVisible('veg.lawn') ? '#C3C8AA' : TOK.paper2; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (this.s.view.mode === 'terrain') { ctx.fillStyle = TOK.paper2; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
    for (const [gid, phase] of ORDER) paintGroup(ctx, this.s, T, gid, phase, o);
    // fine grain: mown lawn / leaf litter (deterministic)
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#4f5a3c';
    for (let i = 0; i < 70000; i++) ctx.fillRect(rnd() * ctx.canvas.width, rnd() * ctx.canvas.height, 2, 2);
    ctx.globalAlpha = 1;
  }
  _groundTexture() {
    const W = 4096, H = Math.round(W * (BOARD.y1 - BOARD.y0) / (BOARD.x1 - BOARD.x0));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    this.groundCanvas = cv;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }
  _repaintGround() {
    const cv = this.groundCanvas; const ctx = cv.getContext('2d');
    const sx = cv.width / (BOARD.x1 - BOARD.x0); const T = (x, y) => [(x - BOARD.x0) * sx, (BOARD.y1 - y) * sx];
    this._paintGround(ctx, T, sx, [BOARD.x0, BOARD.y0, BOARD.x1, BOARD.y1]);
    this.terrain.material.map.needsUpdate = true; this._dirty = true;
  }
  _terrain() {
    const nx = 240, ny = 190;
    const geo = new THREE.PlaneGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, nx, ny);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = (BOARD.x0 + BOARD.x1) / 2, cy = (BOARD.y0 + BOARD.y1) / 2;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + cx, y = -pos.getZ(i) + cy; pos.setXYZ(i, x, this.hY(x, y), -y); }
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: this._groundTexture() }));
    mesh.receiveShadow = true; mesh.userData.world = true;
    this.terrain = mesh; this.scene.add(mesh);
    // section skirt: cut soil like a site section (warm grey, darker topsoil band), board edge in ink
    const depth = -6.5; this.skirt = new THREE.Group(); this.scene.add(this.skirt); this.skirt.userData.world = true;
    const edges = [[[BOARD.x0, BOARD.y0], [BOARD.x1, BOARD.y0]], [[BOARD.x1, BOARD.y0], [BOARD.x1, BOARD.y1]], [[BOARD.x1, BOARD.y1], [BOARD.x0, BOARD.y1]], [[BOARD.x0, BOARD.y1], [BOARD.x0, BOARD.y0]]];
    const soil = new THREE.MeshLambertMaterial({ color: 0xa59d8e, side: THREE.DoubleSide }), top = new THREE.MeshLambertMaterial({ color: 0x7c7262, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const [a, b] of edges) {
      const n = 120; const v1 = [], v2 = [], idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n; const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; const h = this.hY(x, y);
        v1.push(x, h, -y, x, depth, -y); v2.push(x, h + 0.01, -y, x, h - 0.8, -y);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      for (const [v, m] of [[v1, soil], [v2, top]]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex(idx); g.computeVertexNormals(); this.skirt.add(new THREE.Mesh(g, m)); }
    }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.x1 - BOARD.x0 + 30, BOARD.y1 - BOARD.y0 + 30), new THREE.ShadowMaterial({ opacity: 0.1 }));
    plate.rotateX(-Math.PI / 2); plate.position.set(cx, depth - 0.01, -cy); plate.receiveShadow = true; this.skirt.add(plate);
  }
  _shape(geom) {
    const out = [];
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const p of polys) {
      const sh = new THREE.Shape(p[0].map((q) => new THREE.Vector2(q[0], q[1])));
      for (let k = 1; k < p.length; k++) sh.holes.push(new THREE.Path(p[k].map((q) => new THREE.Vector2(q[0], q[1]))));
      out.push(sh);
    }
    return out;
  }
  _water() {
    const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -BOARD.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), BOARD.x1),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), -BOARD.y0), new THREE.Plane(new THREE.Vector3(0, 0, 1), BOARD.y1)];
    const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color(TOK.water), specular: 0xe8eee9, shininess: 40, transparent: true, opacity: 0.9, clippingPlanes: clip });
    this.water = [];
    for (const id of ['water.lake-tacoma', 'water.carillon-moat']) {
      const o = this.s.getObject(id);
      const g = new THREE.ShapeGeometry(this._shape(o.geometry), 2); g.rotateX(-Math.PI / 2);
      let zmin = Infinity;
      for (const c of (o.geometry.type === 'Polygon' ? o.geometry.coordinates[0] : o.geometry.coordinates.flatMap((p) => p[0]))) { const z = this.s.sampleElevation(c[0], c[1]); if (z != null) zmin = Math.min(zmin, z); }
      const m = new THREE.Mesh(g, mat);
      m.position.y = (zmin - this.z0) * this.VEX + 0.06; m.renderOrder = 1;
      m.userData.layer = 'site.water'; m.userData.world = true;
      this.scene.add(m); this.water.push(m);
    }
  }
  _ribbon(coords, width, h0fn, h1, color, closed = false, layer) {
    const pts = closed ? [...coords, coords[1]] : coords;
    const verts = []; const idx = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[i]; const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy * width / 2, ny = dx * width / 2;
      const base = h0fn(p[0], p[1]);
      for (const [sx, sy] of [[nx, ny], [-nx, -ny]]) { verts.push(p[0] + sx, base - 0.25, -(p[1] + sy), p[0] + sx, base + h1, -(p[1] + sy)); }
      if (i) {
        const k = i * 4, j = (i - 1) * 4;
        idx.push(j, j + 1, k, j + 1, k + 1, k); idx.push(j + 2, k + 2, j + 3, j + 3, k + 2, k + 3); idx.push(j + 1, j + 3, k + 1, j + 3, k + 3, k + 1);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true; m.userData.layer = layer;
    return m;
  }
  _edges(mesh, layer, opacity = 0.45) { // fine ink edges on built forms (illustration, not CAD)
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), new THREE.LineBasicMaterial({ color: new THREE.Color(TOK.inkDeep), transparent: true, opacity }));
    e.position.copy(mesh.position); e.rotation.copy(mesh.rotation); e.scale.copy(mesh.scale); e.userData.layer = layer; this.built.add(e);
  }
  _built() {
    const s = this.s; const hY = (x, y) => this.hY(x, y);
    this.built = new THREE.Group(); this.scene.add(this.built); this.built.userData.world = true;
    for (const b of s.beds) {
      if (b.props.style === 'M') continue;
      const ring = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates[0][0];
      const m = this._ribbon(ring, 0.05, hY, 0.06, new THREE.Color(TOK.steel), true, 'built.edging'); m.castShadow = false; this.built.add(m);
    }
    for (const o of s.model.objects) if (o.type === 'wall') { const m = this._ribbon(o.geometry.coordinates, 0.5, hY, 0.45, new THREE.Color(TOK.stone), false, 'built.walls'); this.built.add(m); }
    const moat = s.getObject('water.carillon-moat');
    for (const ring of moat.geometry.coordinates) { const m = this._ribbon(ring, 0.35, hY, 0.25, 0xe2ddd1, true, 'site.water'); m.castShadow = false; this.built.add(m); }
    for (const o of s.model.objects) {
      if (!(o.type === 'building' || o.type === 'tower') || !o.geometry) continue;
      const c = centroidOf(o.geometry); if (!c) continue;
      if (c[0] < BOARD.x0 || c[0] > BOARD.x1 || c[1] < BOARD.y0 || c[1] > BOARD.y1) continue;
      const base = Math.min(...(o.geometry.type === 'Polygon' ? o.geometry.coordinates[0] : o.geometry.coordinates[0][0]).map((q) => hY(q[0], q[1])));
      const hgt = o.props.heightM || 4;
      const isTower = o.type === 'tower' || /Carillon/.test(o.name);
      if (o.props.minLevel && isTower === false && o.layer === 'built.structures') continue;
      const g = new THREE.ExtrudeGeometry(this._shape(o.geometry), { depth: isTower ? hgt - 3 : hgt, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color(isTower ? '#DCD3C0' : '#E9E4D8') }));
      m.position.y = base - 0.3; m.castShadow = true; m.receiveShadow = true; m.userData.layer = o.layer; this.built.add(m);
      this._edges(m, o.layer, isTower ? 0.35 : 0.4);
      if (isTower) this._towerDetail(o, base - 0.3, hgt);
    }
    for (const o of s.model.objects) {
      if (o.type !== 'monument' && o.type !== 'bench') continue;
      const [x, y] = o.geometry.coordinates; const isM = o.type === 'monument';
      const m = new THREE.Mesh(new THREE.BoxGeometry(isM ? 4.2 : 1.8, isM ? 0.9 : 0.45, isM ? 1.0 : 0.6), new THREE.MeshLambertMaterial({ color: new THREE.Color(isM ? '#F0EDE6' : TOK.wood) }));
      m.position.set(x, hY(x, y) + (isM ? 0.45 : 0.23), -y); m.castShadow = true; m.userData.layer = 'built.structures'; this.built.add(m);
    }
    const bw = s.getObject('built.east-meadow-boardwalk');
    if (bw) {
      const g = new THREE.ExtrudeGeometry(this._shape(bw.geometry), { depth: 0.12, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
      const c = centroidOf(bw.geometry); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color(TOK.wood) }));
      m.position.y = hY(c[0], c[1]) + 0.35; m.castShadow = true; m.receiveShadow = true; m.userData.layer = 'built.structures'; this.built.add(m);
    }
  }
  // Carillon massing detail (illustrative articulation; height from OSM, details not surveyed)
  _towerDetail(o, y0, H) {
    const ring = o.geometry.coordinates[0].slice(0, -1);
    const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
    const stone = new THREE.MeshLambertMaterial({ color: 0xdcd2bd }), dark = new THREE.MeshLambertMaterial({ color: 0x5b5a52 }), trim = new THREE.MeshLambertMaterial({ color: 0xcdc2a8 });
    const add = (m) => { m.castShadow = true; m.receiveShadow = true; m.userData.layer = o.layer; this.built.add(m); return m; };
    const scaled = (k) => ring.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
    const prism = (pts, yb, h, mat) => { const sh = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.y = yb; add(m); this._edges(m, o.layer, 0.3); return m; };
    prism(scaled(1.22), y0, 1.4, trim); prism(scaled(1.08), y0 + H - 3.4, 0.7, trim); prism(scaled(1.1), y0 + H - 3.0, 0.5, trim);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const ex = b[0] - a[0], ey = b[1] - a[1]; const L = Math.hypot(ex, ey); const ux = ex / L, uy = ey / L;
      let nx = uy, ny = -ux; if ((a[0] + ex / 2 - cx) * nx + (a[1] + ey / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(-ny, nx);
      for (const [h0, h1, d] of [[0, 0.45, 0.75], [0.45, 0.8, 0.5]]) {
        const bx = new THREE.Mesh(new THREE.BoxGeometry(1.0, (h1 - h0) * (H - 3.4), 1.0 + d), stone);
        bx.position.set(a[0] + nx * d * 0.35, y0 + (h0 + h1) / 2 * (H - 3.4), -(a[1] + ny * d * 0.35)); bx.rotation.y = ang; add(bx);
      }
      for (const k of [-1.3, 0, 1.3]) {
        const px = a[0] + ux * (L / 2 + k) + nx * 0.06, py = a[1] + uy * (L / 2 + k) + ny * 0.06;
        const lan = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 0.14), dark); lan.position.set(px, y0 + H - 7, -py); lan.rotation.y = ang; add(lan);
      }
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, H * 0.42, 0.12), dark);
      win.position.set(a[0] + ux * L / 2 + nx * 0.05, y0 + H * 0.36, -(a[1] + uy * L / 2 + ny * 0.05)); win.rotation.y = ang; add(win);
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.0, 4), stone); pin.position.set(a[0], y0 + H - 1.0, -a[1]); pin.rotation.y = Math.PI / 4; add(pin);
    }
  }

  // ---------------------------------------------------------------- plants (from the active instance table)
  _plants() {
    const s = this.s; const t = s.inst; const groups = new Map();
    const N = t.n;
    this.iMat = new Float32Array(N * 16); this.iLeaf = new Float32Array(N * 3); this.iFlower = new Float32Array(N * 3); this.iDim = new Float32Array(N);
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      if (!t.alive[i]) continue;
      const sp = s.speciesByIndex[t.sp[i]];
      const x = t.x[i], y = t.y[i];
      if (x < BOARD.x0 || x > BOARD.x1 || y < BOARD.y0 || y > BOARD.y1) continue;
      const L = s.instanceLayer(i); const k = L + '|' + sp.formProxy;
      let g = groups.get(k); if (!g) groups.set(k, (g = [])); g.push(i);
      const sc = t.sc[i]; const woody = L === 'veg.trees' || L === 'veg.shrubs' || L === 'siteveg.trees';
      const spread = sp.nominalSpreadM * sc * (woody ? 1 : (L === 'veg.bulbs' ? 1 : 1.8));
      dummy.position.set(x, this.hY(x, y) - 0.03, -y);
      dummy.rotation.set(0, t.rot[i], 0);
      dummy.scale.set(spread, Math.max(0.05, sp.nominalHeightM * sc), spread);
      dummy.updateMatrix(); dummy.matrix.toArray(this.iMat, i * 16);
      const jit = 0.94 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.12;
      col.set(speciesLeaf(sp)); this.iLeaf[i * 3] = col.r * jit; this.iLeaf[i * 3 + 1] = col.g * jit; this.iLeaf[i * 3 + 2] = col.b * jit;
      col.set(speciesFlower(sp)); this.iFlower[i * 3] = col.r; this.iFlower[i * 3 + 1] = col.g; this.iFlower[i * 3 + 2] = col.b;
    }
    this.plantMeshes = []; this.nearMeshes = [];
    this.plantMat ||= plantMaterial();
    const make = (geo, cap, layer, form, lod) => {
      const g = geo.clone();
      g.setAttribute('iLeaf', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
      g.setAttribute('iFlower', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
      g.setAttribute('iDim', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const m = new THREE.InstancedMesh(g, this.plantMat, Math.max(1, cap));
      m.castShadow = layer !== 'veg.bulbs'; m.receiveShadow = true;
      m.userData = { layer, form, lod, list: [] };
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    for (const [k, list] of groups) {
      const [layer, form] = k.split('|');
      const woody = layer === 'veg.trees' || layer === 'veg.shrubs' || layer === 'siteveg.trees';
      const far = make(formGeometry(form, woody ? 'near' : 'far'), list.length, layer, form, woody ? 'all' : 'far');
      this._fill(far, list);
      this.plantMeshes.push(far);
      if (!woody && layer !== 'veg.bulbs') {
        const near = make(formGeometry(form, 'near'), list.length * 2, layer, form, 'near');
        near.count = 0; near.userData.all = list; near.visible = false;
        this.plantMeshes.push(near); this.nearMeshes.push(near);
      }
    }
    this.lodNear = false;
    this.plantBuildRev = s.revision;
  }
  _disposePlants() {
    for (const m of this.plantMeshes || []) { this.scene.remove(m); m.geometry.dispose(); m.dispose && m.dispose(); }
    this.plantMeshes = []; this.nearMeshes = [];
  }
  // model changed (draft patch, scenario switch): rebuild plant geometry + ground, keep camera / selection / view
  _onModel() {
    const t0 = performance.now();
    this._disposePlants(); this._plants();
    this._applyLayers(); this._applySelection(); this._applyExplodePositions(); if (this.layersView) this._cropFill(true);
    this._lodDone = false; this._lastMove = performance.now(); this._updateLOD(true);
    if (this._plates) this._repaintPlates();
    this.lastRebuildMs = performance.now() - t0; this._dirty = true;
  }
  _fill(mesh, idxs, twin = false) {
    const g = mesh.geometry; const L = g.attributes.iLeaf.array, F = g.attributes.iFlower.array, D = g.attributes.iDim.array; const M = mesh.instanceMatrix.array;
    if (twin) { const out = []; for (const i of idxs) out.push(i, -1 - i); idxs = out; }
    const n = Math.min(idxs.length, M.length / 16);
    const tmp = this._tmpM ||= new THREE.Matrix4(); const rot = this._tmpR ||= new THREE.Matrix4();
    for (let j = 0; j < n; j++) {
      let i = idxs[j];
      if (i < 0) {
        i = -1 - i;
        const h = ((i * 2654435761) >>> 0) / 4294967296, h2 = ((i * 2246822519) >>> 0) / 4294967296;
        tmp.fromArray(this.iMat, i * 16); const sx = Math.hypot(tmp.elements[0], tmp.elements[1], tmp.elements[2]);
        const d = sx * 0.42, a = h * 6.283;
        rot.makeRotationY(1.7 + h2 * 2.5); tmp.multiply(rot); tmp.scale(new THREE.Vector3(0.88, 0.9 + h2 * 0.2, 0.88));
        tmp.elements[12] += Math.cos(a) * d; tmp.elements[14] += Math.sin(a) * d;
        tmp.toArray(M, j * 16);
      } else M.set(this.iMat.subarray(i * 16, i * 16 + 16), j * 16);
      L[j * 3] = this.iLeaf[i * 3]; L[j * 3 + 1] = this.iLeaf[i * 3 + 1]; L[j * 3 + 2] = this.iLeaf[i * 3 + 2];
      F[j * 3] = this.iFlower[i * 3]; F[j * 3 + 1] = this.iFlower[i * 3 + 1]; F[j * 3 + 2] = this.iFlower[i * 3 + 2];
      D[j] = this.iDim[i];
    }
    mesh.count = n; mesh.userData.list = idxs.slice(0, n).map((i) => (i < 0 ? -1 - i : i));
    mesh.instanceMatrix.needsUpdate = true; g.attributes.iLeaf.needsUpdate = true; g.attributes.iFlower.needsUpdate = true; g.attributes.iDim.needsUpdate = true;
  }
  _updateLOD(force = false) {
    const ppm = this._pxPerM();
    let near = ppm > 10 && !this.layersView, box = null;
    if (near) {
      this.cam.updateMatrixWorld();
      const pts = [];
      for (const [sx, sy] of [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]) {
        const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(sx, sy), this.cam);
        const tt = (this.controls.target.y - rc.ray.origin.y) / rc.ray.direction.y;
        const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, tt); pts.push([p.x, -p.z]);
      }
      box = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
      let cnt = 0; const s = this.s;
      for (const m of this.nearMeshes) for (const i of m.userData.all) { const x = s.ix(i), y = s.iy(i); if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) cnt++; }
      this._nearCount = cnt;
      if (cnt > 2400) near = false;
    }
    if (!near) {
      if (this.lodNear || force) {
        this.lodNear = false;
        for (const m of this.plantMeshes) {
          if (m.userData.lod === 'far') m.visible = this._meshVisible(m);
          if (m.userData.lod === 'near') m.visible = false;
        }
        this._dirty = true;
      }
      return;
    }
    this.lodNear = true;
    const s = this.s;
    for (const m of this.nearMeshes) {
      const sel = m.userData.all.filter((i) => { const x = s.ix(i), y = s.iy(i); return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]; });
      this._fill(m, sel, true);
      m.visible = this._meshVisible(m);
    }
    for (const m of this.plantMeshes) if (m.userData.lod === 'far') m.visible = this._meshVisible(m) && m.userData.layer === 'veg.bulbs';
    this._dirty = true;
  }
  _meshVisible(m) { return this.s.layerVisible(m.userData.layer); }

  // ---------------------------------------------------------------- selection
  _selectionLayer() {
    this.selGroup = new THREE.Group(); this.scene.add(this.selGroup);
    this.hovGroup = new THREE.Group(); this.scene.add(this.hovGroup);
  }
  _outline(geom, color, width, group, lift = 0.25) {
    if (!geom) return;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : geom.type === 'LineString' ? [geom.coordinates] : [];
    for (const r of rings) {
      const pts = [];
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(L / 1.0));
        for (let k = 0; k < n; k++) { const t = k / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      pts.push(r[r.length - 1]);
      const m = this._ribbon(pts, width, (x, y) => this.hY(x, y) + lift + 0.25, 0.04, color, false, null);
      m.material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: true });
      m.castShadow = false; m.receiveShadow = false; m.renderOrder = 5;
      group.add(m);
    }
  }
  _marker(x, y, r, color, group) {
    const g = new THREE.RingGeometry(r, r + Math.max(0.08, r * 0.18), 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthTest: false, transparent: true }));
    m.position.set(x, this.hY(x, y) + 0.08, -y); m.renderOrder = 10; group.add(m);
  }
  _clear(g) { for (const c of [...g.children]) { g.remove(c); c.geometry && c.geometry.dispose(); } }
  _applySelection() {
    const s = this.s; this._clear(this.selGroup);
    const sel = s.selection; const C = new THREE.Color(TOK.select);
    let focusBed = null;
    if (sel) {
      const o = s.getObject(sel.id); const k = s.kindOf(sel.id);
      if (k === 'instance') { focusBed = o.bedId; const sp = s.getObject(o.speciesId); this._marker(o.position[0], o.position[1], Math.max(0.25, sp.nominalSpreadM * 0.55), C, this.selGroup); }
      else if (k === 'placement') {
        focusBed = o.bedId;
        const g = s.placementGeom(o);
        if (g && g.type === 'Point') this._marker(g.coordinates[0], g.coordinates[1], o.symbolRadiusM || 0.4, C, this.selGroup);
        else if (g && g.type === 'MultiPoint') g.coordinates.forEach((c) => this._marker(c[0], c[1], 0.3, C, this.selGroup));
        else this._outline(g, C, 0.14, this.selGroup, o.role === 'matrix' ? 0.6 : 0.9);
      } else if (o && !sel.point) {
        if (o.type === 'bed') focusBed = o.id;
        if (o.geometry && o.geometry.type === 'Point') this._marker(o.geometry.coordinates[0], o.geometry.coordinates[1], 1.5, C, this.selGroup);
        else if (o.type !== 'site') this._outline(o.geometry, C, 0.22, this.selGroup, 0.9);
      }
    }
    const t = s.inst;
    if (this.iDim.length < t.n) this.iDim = new Float32Array(t.n);
    for (let i = 0; i < t.n; i++) {
      let d = this.plateDim || 0;
      if (focusBed && !d) { const p = s.placementByIndex[t.pl[i]]; d = p && p.bedId === focusBed ? 0 : 0.7; }
      this.iDim[i] = d;
    }
    for (const mesh of this.plantMeshes) {
      const dim = mesh.geometry.attributes.iDim; const list = mesh.userData.list;
      const pd = this._plateDimFor(mesh);
      for (let j = 0; j < list.length; j++) dim.array[j] = pd != null ? pd : this.iDim[list[j]];
      dim.needsUpdate = true;
    }
    this._dirty = true;
  }
  _applyHover() {
    this._clear(this.hovGroup); this._dirty = true;
    const h = this.s.hover; if (!h) return;
    const o = this.s.getObject(h.id); if (!o) return;
    const C = new THREE.Color(TOK.hover);
    if (this.s.kindOf(h.id) === 'instance') { const sp = this.s.getObject(o.speciesId); this._marker(o.position[0], o.position[1], Math.max(0.25, sp.nominalSpreadM * 0.5), C, this.hovGroup); return; }
    const g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null);
    if (g && g.type === 'Point') this._marker(g.coordinates[0], g.coordinates[1], o.symbolRadiusM || 1, C, this.hovGroup);
    else if (g && g.type !== 'MultiPoint' && o.type !== 'site') this._outline(g, C, 0.1, this.hovGroup, 0.9);
  }
  _applyLayers() {
    const s = this.s;
    for (const m of this.plantMeshes) {
      const lod = m.userData.lod;
      const on = lod === 'all' || (lod === 'far' && (!this.lodNear || m.userData.layer === 'veg.bulbs')) || (lod === 'near' && this.lodNear);
      m.visible = on && this._meshVisible(m);
    }
    const world = !this.layersView;
    this.built.visible = world; this.skirt.visible = world; this.terrain.visible = world;
    this.built.children.forEach((m) => { if (m.userData.layer) m.visible = s.layerVisible(m.userData.layer); });
    this.water.forEach((m) => (m.visible = world && s.layerVisible('site.water')));
    this._repaintGround();
    if (this.labelEls) this.labelEls.forEach((e) => (e.el.style.display = s.layerVisible('structure.labels') && (world || this.plateFocus === 'framework' || !this.plateFocus) ? '' : 'none'));
    if (this._plates && this.layersView) this._repaintPlates();
    this._dirty = true;
  }

  // ---------------------------------------------------------------- layers overview (exploded plates)
  _plateY(gid) { return PLATES.indexOf(gid) * PLATE_GAP * this._ex; }
  _buildPlates() {
    this._plates = {}; this.plateRoot = new THREE.Group(); this.scene.add(this.plateRoot);
    const W = CROP.x1 - CROP.x0, H = CROP.y1 - CROP.y0;
    const ink = new THREE.Color(TOK.inkDeep);
    for (const gid of PLATES) {
      const grp = new THREE.Group(); grp.userData.gid = gid; this.plateRoot.add(grp);
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = Math.round(2048 * H / W);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      let mesh;
      if (gid === 'terrain') { // the real surface, cropped, with its own terrain drawing
        const g = new THREE.PlaneGeometry(W, H, 146, 94); g.rotateX(-Math.PI / 2);
        const pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + (CROP.x0 + CROP.x1) / 2, y = -pos.getZ(i) + (CROP.y0 + CROP.y1) / 2; pos.setXYZ(i, x, this.hY(x, y), -y); }
        g.computeVertexNormals();
        mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 1 }));
      } else {
        const g = new THREE.PlaneGeometry(W, H); g.rotateX(-Math.PI / 2); g.translate((CROP.x0 + CROP.x1) / 2, 0.4, -(CROP.y0 + CROP.y1) / 2);
        mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide }));
        mesh.renderOrder = 2 + PLATES.indexOf(gid);
      }
      mesh.userData.gid = gid; grp.add(mesh);
      const y = gid === 'terrain' ? this.hY(0, 0) + 0.05 : 0.4;
      const pts = [[CROP.x0, CROP.y0], [CROP.x1, CROP.y0], [CROP.x1, CROP.y1], [CROP.x0, CROP.y1], [CROP.x0, CROP.y0]].map(([x, yy]) => new THREE.Vector3(x, y, -yy));
      const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 }));
      grp.add(edge);
      // connector posts at the four corners: the stack reads as one model, not floating sheets
      this._plates[gid] = { grp, mesh, edge, cv, tex };
    }
    const postPts = [];
    for (const [x, y] of [[CROP.x0, CROP.y0], [CROP.x1, CROP.y0], [CROP.x1, CROP.y1], [CROP.x0, CROP.y1]]) postPts.push(new THREE.Vector3(x, 0, -y), new THREE.Vector3(x, 1, -y));
    this.posts = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(postPts), new THREE.LineDashedMaterial({ color: ink, transparent: true, opacity: 0.35, dashSize: 0.8, gapSize: 0.8 }));
    this.plateRoot.add(this.posts);
    this.plateRoot.visible = false;
    this._repaintPlates();
  }
  _repaintPlates() {
    const W = CROP.x1 - CROP.x0;
    for (const gid of PLATES) {
      const P = this._plates[gid]; const ctx = P.cv.getContext('2d'); const k = P.cv.width / W;
      const T = (x, y) => [(x - CROP.x0) * k, (CROP.y1 - y) * k];
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, P.cv.width, P.cv.height);
      const bg = { terrain: 1, infrastructure: 0.86, siteveg: 0.5, framework: 0.62, composition: 0.66, representation: 0.42 }[gid];
      ctx.fillStyle = rgba(TOK.paper, bg); ctx.fillRect(0, 0, P.cv.width, P.cv.height);
      const o = { scale: k, focus: gid, plate: true, vb: [CROP.x0, CROP.y0, CROP.x1, CROP.y1] };
      if (gid === 'representation') { // registration only: faint bed outlines under the lifted plants
        ctx.strokeStyle = rgba(TOK.ink, 0.35); ctx.lineWidth = 1.5;
        for (const b of this.s.beds) { ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.stroke(); }
      } else if (gid === 'siteveg') {
        paintGroup(ctx, this.s, T, 'siteveg', 'ground', o);
      } else {
        for (const [g, phase] of ORDER) if (g === gid) paintGroup(ctx, this.s, T, g, phase, { ...o, forceTerrain: true });
        if (gid === 'terrain' && !this.s.layerVisible('topo.contours')) { // contours always on the terrain plate
          const st = this.s.layerState['topo.contours'].visible; this.s.layerState['topo.contours'].visible = true;
          paintGroup(ctx, this.s, T, 'terrain', 'ground', o); this.s.layerState['topo.contours'].visible = st;
        }
      }
      P.tex.needsUpdate = true;
    }
    this._dirty = true;
  }
  _applyExplodePositions() {
    if (!this._plates) return;
    const e = this._ex;
    for (const gid of PLATES) this._plates[gid].grp.position.y = this._plateY(gid);
    this.plateRoot.visible = e > 0.001;
    // posts span the stack
    const top = this._plateY('representation') + 0.4; const p = this.posts.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) { p.setY(i, this.hY(0, 0)); p.setY(i + 1, top); }
    p.needsUpdate = true; this.posts.computeLineDistances();
    for (const m of this.plantMeshes) m.position.y = e < 0.001 ? 0 : this._plateY(m.userData.layer === 'siteveg.trees' ? 'siteveg' : 'representation');
    this.selGroup.position.y = this.hovGroup.position.y = this._plateY('composition');
    // plants outside the crop are clipped while the stack is shown (three: z = -y, so y >= y0  <=>  -z - y0 >= 0)
    const want = e > 0.001;
    if (want !== !!this.plantMat.clippingPlanes) {
      this.plantMat.clippingPlanes = want ? [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), -CROP.x0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), CROP.x1),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), -CROP.y0), new THREE.Plane(new THREE.Vector3(0, 0, 1), CROP.y1)] : null;
      this.plantMat.needsUpdate = true;
    }
    this._dirty = true; this._needsLabels = true;
  }
  _layersCamera(instant) {
    const narrow = this.w < 760; // phones: smaller stack, shifted left so the labels on the right stay clear
    const T1 = new THREE.Vector3((CROP.x0 + CROP.x1) / 2 + (narrow ? 34 : 6), PLATE_GAP * 2.6, -(CROP.y0 + CROP.y1) / 2);
    const P1 = T1.clone().addScaledVector(new THREE.Vector3(0.34, 0.3, 0.89).normalize(), 400);
    const needH = PLATE_GAP * 5 * 0.95 + 60, needW = narrow ? 250 : 175;
    const Z1 = Math.min((this.cam.top - this.cam.bottom) / needH, (this.cam.right - this.cam.left) / needW) * 0.98;
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) { this._tweenGen = (this._tweenGen || 0) + 1; this.controls.target.copy(T1); this.cam.position.copy(P1); this.cam.zoom = Z1; this.cam.updateProjectionMatrix(); this.cam.lookAt(T1); this.controls.update(); this._needsLabels = true; this._dirty = true; return; }
    this._tween(T1, Z1, null, P1);
  }
  // Layers overview on/off. Camera and layer state of the world view are restored on exit.
  setLayersView(on, instant = false) {
    if (!this._plates) this._buildPlates();
    if (on === this.layersView) return;
    this.layersView = on;
    if (on) { this._preEx = { p: this.cam.position.clone(), t: this.controls.target.clone(), z: this.cam.zoom }; this.sun.castShadow = false; }
    else { this.sun.castShadow = true; this.setPlateFocus(null); }
    const from = this._ex, to = on ? 1 : 0, t0 = performance.now();
    if (on) this._layersCamera(instant);
    else if (this._preEx) {
      if (instant) { this._tweenGen = (this._tweenGen || 0) + 1; this.controls.target.copy(this._preEx.t); this.cam.position.copy(this._preEx.p); this.cam.zoom = this._preEx.z; this.cam.updateProjectionMatrix(); this.controls.update(); }
      else this._tween(this._preEx.t, this._preEx.z, null, this._preEx.p);
    }
    this._applyLayers(); this._updateLOD(true); this._cropFill(on);
    void t0;
    const frame = (k) => {
      this._ex = from + (to - from) * ease(k);
      this._applyExplodePositions();
      if (this.onExplode) this.onExplode(this._ex);
      if (k >= 1) { this._lastMove = performance.now(); this._lodDone = false; this._applyLayers(); }
    };
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) frame(1); else animate(750, frame);
  }
  // overview shows the cropped garden only: proxies whose centre lies outside the plates are left out (not clipped in half)
  _cropFill(on) {
    const s = this.s; const inC = (i) => { const x = s.ix(i), y = s.iy(i); return x >= CROP.x0 && x <= CROP.x1 && y >= CROP.y0 && y <= CROP.y1; };
    for (const m of this.plantMeshes) {
      if (m.userData.lod === 'near') continue;
      m.userData.full ||= m.userData.list.slice();
      this._fill(m, on ? m.userData.full.filter(inC) : m.userData.full);
    }
    this._applySelection();
  }
  // compatibility: older URL / tests
  setExploded(on, instant) { this.setLayersView(on, instant); }
  get exploded() { return this.layersView; }
  get _structPlane() { return this._plates ? Object.assign(this._plates.framework.mesh, { visible: this.plateRoot.visible }) : null; }
  setPlateFocus(gid) {
    this.plateFocus = gid;
    if (!this._plates) return;
    for (const g of PLATES) {
      const P = this._plates[g]; const on = !gid || g === gid;
      P.mesh.material.opacity = on ? 1 : 0.16; P.edge.material.opacity = on ? (gid ? 0.95 : 0.55) : 0.15; P.edge.material.color.set(gid === g ? TOK.select : TOK.inkDeep);
    }
    this._applySelection(); this._applyLayers(); this._dirty = true; this._needsLabels = true;
  }
  _plateDimFor(mesh) {
    if (!this.layersView || !this.plateFocus) return null;
    const own = mesh.userData.layer === 'siteveg.trees' ? 'siteveg' : 'representation';
    return own === this.plateFocus ? 0 : 0.92;
  }
  plateAt(e) { // which plate is under the pointer (top-most first)
    if (!this.layersView || !this._plates) return null;
    const rc = this._ray(e); const meshes = PLATES.map((g) => this._plates[g].mesh);
    const hits = rc.intersectObjects(meshes, false);
    if (!hits.length) return null;
    hits.sort((a, b) => PLATES.indexOf(b.object.userData.gid) - PLATES.indexOf(a.object.userData.gid));
    // prefer the plate whose surface is nearest the camera along the ray among the top candidates
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0].object.userData.gid;
  }
  plateAnchor(gid) { // screen position of the plate's east edge midpoint (for labels)
    const y = gid === 'analysis' ? this._plateY('representation') + PLATE_GAP * 0.9 : this._plateY(gid) + (gid === 'terrain' ? this.hY(0, 0) : 0.4);
    const v = new THREE.Vector3(CROP.x1 + 2, y, -(CROP.y0 + CROP.y1) / 2).project(this.cam);
    return [(v.x * 0.5 + 0.5) * this.w, (-v.y * 0.5 + 0.5) * this.h];
  }

  _labels(root) {
    this.labelEls = [];
    if (!root) return;
    this.labelRoot = root;
    for (const b of this.s.beds) {
      const c = centroidOf(b.geometry); if (!c) continue;
      const el = document.createElement('div'); el.className = 'bedtag' + (b.props.style === 'M' ? ' wide' : '');
      el.textContent = b.props.style === 'M' ? b.name.replace(' planting', '') : b.id.replace('bed.', '');
      root.appendChild(el);
      this.labelEls.push({ el, p: this.W(c[0], c[1], b.props.style === 'M' ? 3 : 2.2), out: c[0] < CROP.x0 || c[0] > CROP.x1 || c[1] < CROP.y0 || c[1] > CROP.y1 });
    }
    this._needsLabels = true;
  }
  _placeLabels() {
    if (!this.labelEls.length) return;
    const v = new THREE.Vector3();
    for (const L of this.labelEls) {
      v.copy(L.p); v.y += this._ex > 0 ? this._plateY('framework') : 0; v.project(this.cam);
      const x = (v.x * 0.5 + 0.5) * this.w, y = (-v.y * 0.5 + 0.5) * this.h;
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      L.el.style.visibility = this._ex > 0.01 && L.out ? 'hidden' : '';
      L.el.classList.toggle('faint', this._ex > 0.01 && this.plateFocus && this.plateFocus !== 'framework');
    }
    if (this.onLabels) this.onLabels();
  }

  _bind() {
    const c = this.c; let down = null;
    c.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4; down = null;
      if (moved) return;
      if (this.layersView) { const g = this.plateAt(e); if (this.onPlateClick) this.onPlateClick(g, e); return; }
      const p = this._ground(e); if (!p) { this.s.select(null); return; }
      const hit = this._woodyHit(e);
      if (hit != null) { this.s.select({ id: 'pi.' + hit, at: [+p[0].toFixed(2), +p[1].toFixed(2)] }); return; }
      this.picker.clickAt(p[0], p[1], this._pxPerM());
    });
    c.addEventListener('dblclick', (e) => { if (this.layersView && this.onPlateOpen) { const g = this.plateAt(e); if (g) this.onPlateOpen(g); } });
    c.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      if (this._hovT && performance.now() - this._hovT < 50) return; this._hovT = performance.now();
      if (this.layersView) { const g = this.plateAt(e); if (g !== this._hovPlate) { this._hovPlate = g; this.onPlateHover && this.onPlateHover(g); c.style.cursor = g ? 'pointer' : ''; } return; }
      const p = this._ground(e); if (p) { this.picker.hoverAt(p[0], p[1], this._pxPerM()); this.onCursor && this.onCursor(p[0], p[1]); }
    });
    c.addEventListener('pointerleave', () => this.s.setHover(null));
  }
  _pxPerM() { return (this.h / (this.cam.top - this.cam.bottom)) * this.cam.zoom; }
  _ray(e) {
    const r = this.c.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.cam); return rc;
  }
  _ground(e) { const hit = this._ray(e).intersectObject(this.terrain)[0]; return hit ? [hit.point.x, -hit.point.z] : null; }
  _woodyHit(e) {
    const rc = this._ray(e);
    const meshes = this.plantMeshes.filter((m) => m.visible && ['veg.trees', 'veg.shrubs', 'siteveg.trees'].includes(m.userData.layer) && (this.picker._selectable ? this.picker._selectable(m.userData.layer) : true));
    const hit = rc.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return hit.object.userData.list[hit.instanceId];
  }

  setActive(a) {
    const was = this.active; this.active = a;
    if (a) { this.resize(); this.controls.enabled = true; this._needsLabels = true; this._dirty = true; if (!was) requestAnimationFrame(this._loop); }
  }
  _loop() {
    if (!this.active) return;
    const moved = this.controls.update();
    const now = performance.now();
    this._ticks = (this._ticks || 0) + 1;
    if (moved) { this._dirty = true; this._lastMove = now; }
    if (this._lastMove && now - this._lastMove > 160 && !this._lodDone) { this._updateLOD(); this._lodDone = true; }
    if (moved) this._lodDone = false;
    if (this._dirty) {
      const t0 = performance.now();
      this.r.render(this.scene, this.cam);
      this._placeLabels();
      this._dirty = false;
      this.frames++;
      this._frameMs = performance.now() - t0;
      if (now - this._fpsT > 1000) { this.fps = (this.frames * 1000) / (now - this._fpsT); this.frames = 0; this._fpsT = now; this._adapt(); }
    } else if (now - this._fpsT > 1000) { this.frames = 0; this._fpsT = now; }
    requestAnimationFrame(this._loop);
  }
  _adapt() {
    const ticks = this._ticks || 1; this._ticks = 0;
    if (this._adapted >= 2 || this.fps < 1) return;
    if (this.fps < 22 && this.fps / ticks > 0.75) {
      this._adapted = (this._adapted || 0) + 1;
      if (this._adapted === 1) this.r.setPixelRatio(1);
      else { this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.map && this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.resize(); this._dirty = true;
    }
  }
  requestRender() { this._dirty = true; }
  renderNow() { this._updateLOD(true); this.r.render(this.scene, this.cam); this._placeLabels(); }
  // live counts of what is actually rendered (tests compare these with the model)
  renderedSpeciesCounts() {
    const out = {};
    for (const m of this.plantMeshes) { if (m.userData.lod === 'near') continue; for (let j = 0; j < m.count; j++) { const i = m.userData.list[j]; const id = this.s.speciesByIndex[this.s.inst.sp[i]].id; out[id] = (out[id] || 0) + 1; } }
    return out;
  }
  renderedInstances() { let n = 0; for (const m of this.plantMeshes) if (m.userData.lod !== 'near') n += m.count; return n; }
  formOfInstance(i) { for (const m of this.plantMeshes) { if (m.userData.lod === 'near') continue; const j = m.userData.list.indexOf(i); if (j >= 0) return { form: m.userData.form, layer: m.userData.layer, leaf: [...m.geometry.attributes.iLeaf.array.slice(j * 3, j * 3 + 3)] }; } return null; }
  stats() { const i = this.r.info; return { fps: +this.fps.toFixed(1), triangles: i.render.triangles, calls: i.render.calls, instances: this.renderedInstances(), dpr: this.r.getPixelRatio(), rebuildMs: this.lastRebuildMs != null ? +this.lastRebuildMs.toFixed(1) : null }; }
}
