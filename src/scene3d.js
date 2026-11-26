// Botanical diorama: orthographic 3D view of the same model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PAL, paintGround, tracePoly } from './style.js';
import { speciesLayer, bboxOf, centroidOf } from './model.js';
import { formGeometry, plantMaterial } from './flora.js';

const BOARD = { x0: -125, x1: 115, y0: -118, y1: 72 };
const VEX = 1.6; // vertical exaggeration of terrain only (stated in the UI)

export class Scene3D {
  constructor(canvas, store, picker, opts = {}) {
    this.c = canvas; this.s = store; this.picker = picker; this.active = false;
    this.quality = opts.quality || 'high';
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!opts.preserve });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PAL.paper);
    this.z0 = store.terrain.meta.datumZ; // world y = (z - z0) * VEX
    this._camera();
    this._lights();
    this._terrain();
    this._water();
    this._built();
    this._plants();
    this._selectionLayer();
    this._labels(opts.labelRoot);
    this._bind();
    store.on('layers', () => this._applyLayers());
    store.on('selection', () => this._applySelection());
    store.on('hover', () => this._applyHover());
    this._applyLayers();
    this.frames = 0; this.fps = 0; this._fpsT = performance.now();
    this._loop = this._loop.bind(this);
  }

  // ---- coordinate mapping
  W(x, y, dz = 0) { const z = this.s.sampleElevation(x, y); return new THREE.Vector3(x, ((z == null ? this.z0 : z) - this.z0) * VEX + dz, -y); }
  hY(x, y) { const z = this.s.sampleElevation(x, y); return ((z == null ? this.z0 : z) - this.z0) * VEX; }

  _camera() {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000);
    this.cam = cam;
    this.controls = new OrbitControls(cam, this.c);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.12;
    this.controls.minZoom = 0.25; this.controls.maxZoom = 40;
    this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.minPolarAngle = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this._needsLabels = true; });
    this.home();
  }
  home() {
    const t = this.W(0, -12); t.y = 1.5;
    this.controls.target.copy(t);
    // from the south, north up like the plan: Carillon and meadows in front, the 15 beds behind
    const dir = new THREE.Vector3(0.14, 0.74, 0.66).normalize();
    this.cam.position.copy(t).addScaledVector(dir, 400);
    this.cam.up.set(0, 1, 0);
    this._frameWidth = this.w && this.w < 760 ? 120 : 150; this.cam.zoom = 1;
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
  focus(id) {
    const o = this.s.getObject(id); if (!o) return;
    let g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null);
    if (o.type === 'plantInstance') g = { type: 'Point', coordinates: o.position };
    if (!g) return;
    const b = bboxOf(g); const c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const size = Math.max(6, b[2] - b[0], b[3] - b[1]);
    const t = this.W(c[0], c[1]);
    const off = this.cam.position.clone().sub(this.controls.target);
    this._tween(t, (this.cam.top - this.cam.bottom) / (size * 2.1), off);
  }
  _tween(target, zoom, off) {
    const t0 = performance.now(), T0 = this.controls.target.clone(), Z0 = this.cam.zoom;
    zoom = Math.max(this.controls.minZoom, Math.min(this.controls.maxZoom, zoom));
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 650); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.controls.target.lerpVectors(T0, target, e);
      this.cam.position.copy(this.controls.target).add(off);
      this.cam.zoom = Z0 + (zoom - Z0) * e; this.cam.updateProjectionMatrix();
      this._needsLabels = true; this._dirty = true;
      if (k < 1) requestAnimationFrame(step); else { this._lastMove = performance.now(); this._lodDone = false; }
    };
    step();
  }

  _lights() {
    const hemi = new THREE.HemisphereLight(0xfffaf0, 0xb3b58f, 1.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    // afternoon sun from the south-west
    sun.position.set(-60, 90, 70);
    sun.target.position.set(0, 0, 10);
    sun.castShadow = true; this.r.shadowMap.type = THREE.PCFShadowMap;
    const sz = this.quality === 'high' ? 3072 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
  }

  _groundTexture() {
    const W = 4096, H = Math.round(W * (BOARD.y1 - BOARD.y0) / (BOARD.x1 - BOARD.x0));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const sx = W / (BOARD.x1 - BOARD.x0);
    const T = (x, y) => [(x - BOARD.x0) * sx, (BOARD.y1 - y) * sx];
    ctx.fillStyle = PAL.lawn; ctx.fillRect(0, 0, W, H);
    paintGround(ctx, this.s, T, { scale: sx, forTexture: true });
    // mown-lawn grain + gravel speckle (deterministic)
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#5f6e45';
    for (let i = 0; i < 90000; i++) ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
    ctx.globalAlpha = 1;
    // bed soil: darker rim + crumb
    ctx.save();
    for (const b of this.s.beds) {
      if (b.props.style === 'M') continue;
      ctx.beginPath(); tracePoly(ctx, b.geometry, T); ctx.clip();
    }
    ctx.restore();
    // meadow ground tint
    this.groundCanvas = cv;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return tex;
  }

  _terrain() {
    const nx = 240, ny = 190;
    const geo = new THREE.PlaneGeometry(BOARD.x1 - BOARD.x0, BOARD.y1 - BOARD.y0, nx, ny);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = (BOARD.x0 + BOARD.x1) / 2, cy = (BOARD.y0 + BOARD.y1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, y = -pos.getZ(i) + cy;
      pos.setXYZ(i, x, this.hY(x, y), -y);
    }
    geo.computeVertexNormals();
    const tex = this._groundTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.terrain = mesh; this.scene.add(mesh);
    // diorama skirt (soil section) around the board
    const skirtMat = new THREE.MeshLambertMaterial({ color: 0x8a7459 });
    const bandMat = new THREE.MeshLambertMaterial({ color: 0x6f5c46 });
    const depth = -7;
    const edges = [
      [[BOARD.x0, BOARD.y0], [BOARD.x1, BOARD.y0]], [[BOARD.x1, BOARD.y0], [BOARD.x1, BOARD.y1]],
      [[BOARD.x1, BOARD.y1], [BOARD.x0, BOARD.y1]], [[BOARD.x0, BOARD.y1], [BOARD.x0, BOARD.y0]],
    ];
    for (const [a, b] of edges) {
      const n = 120; const verts = []; const idx = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n; const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        verts.push(x, this.hY(x, y), -y, x, depth, -y);
        if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
      this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8b7559, side: THREE.DoubleSide })));
      // topsoil band
      const v2 = [];
      for (let i = 0; i <= n; i++) { const t = i / n; const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; const h = this.hY(x, y); v2.push(x, h + 0.01, -y, x, h - 0.9, -y); }
      const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(v2, 3)); g2.setIndex(idx); g2.computeVertexNormals();
      const band = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color: 0x5d4b38, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
      this.scene.add(band);
    }
    void skirtMat; void bandMat;
    // base plate shadow catcher
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.x1 - BOARD.x0 + 30, BOARD.y1 - BOARD.y0 + 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
    plate.rotateX(-Math.PI / 2); plate.position.set(cx, depth - 0.01, -cy);
    this.scene.add(plate);
  }

  _shape(geom, clip = true) { // polygon geometry -> THREE.Shape list in (x, y) local
    const out = [];
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const p of polys) {
      const sh = new THREE.Shape(p[0].map((q) => new THREE.Vector2(q[0], q[1])));
      for (let k = 1; k < p.length; k++) sh.holes.push(new THREE.Path(p[k].map((q) => new THREE.Vector2(q[0], q[1]))));
      out.push(sh);
    }
    void clip;
    return out;
  }

  _water() {
    const mat = new THREE.MeshPhongMaterial({ color: 0x8fb0ad, specular: 0xdde8e2, shininess: 60, transparent: true, opacity: 0.92 });
    this.water = [];
    for (const id of ['water.lake-tacoma', 'water.carillon-moat']) {
      const o = this.s.getObject(id);
      const shapes = this._shape(o.geometry);
      const g = new THREE.ShapeGeometry(shapes, 2);
      g.rotateX(-Math.PI / 2);
      // flat water level: lowest terrain sample along its outline
      let zmin = Infinity; const b = bboxOf(o.geometry);
      for (const c of (o.geometry.type === 'Polygon' ? o.geometry.coordinates[0] : o.geometry.coordinates.flatMap((p) => p[0]))) { const z = this.s.sampleElevation(c[0], c[1]); if (z != null) zmin = Math.min(zmin, z); }
      void b;
      const m = new THREE.Mesh(g, mat);
      m.position.y = (zmin - this.z0) * VEX + 0.06; m.renderOrder = 1;
      m.userData.layer = 'site.water';
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
        idx.push(j, j + 1, k, j + 1, k + 1, k); // side a
        idx.push(j + 2, k + 2, j + 3, j + 3, k + 2, k + 3); // side b
        idx.push(j + 1, j + 3, k + 1, j + 3, k + 3, k + 1); // top
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = true; m.userData.layer = layer;
    return m;
  }

  _built() {
    const s = this.s; const hY = (x, y) => this.hY(x, y);
    this.built = new THREE.Group(); this.scene.add(this.built);
    // steel edging on every main bed
    for (const b of s.beds) {
      if (b.props.style === 'M') continue;
      const ring = b.geometry.type === 'Polygon' ? b.geometry.coordinates[0] : b.geometry.coordinates[0][0];
      const m = this._ribbon(ring, 0.06, hY, 0.07, 0x3a3631, true, 'built.edging');
      m.castShadow = false; this.built.add(m);
    }
    // limestone retaining walls (height not published: display 0.6 m above grade)
    for (const o of s.model.objects) if (o.type === 'wall') {
      const m = this._ribbon(o.geometry.coordinates, 0.5, hY, 0.45, 0xcdbf9f, false, 'built.walls'); this.built.add(m);
    }
    // moat coping
    const moat = s.getObject('water.carillon-moat');
    for (const ring of moat.geometry.coordinates) { const m = this._ribbon(ring, 0.35, hY, 0.25, 0xd6d0c2, true, 'site.water'); m.castShadow = false; this.built.add(m); }
    // buildings
    for (const o of s.model.objects) {
      if (!(o.type === 'building' || o.type === 'tower') || !o.geometry) continue;
      const c = centroidOf(o.geometry); if (!c) continue;
      if (c[0] < BOARD.x0 || c[0] > BOARD.x1 || c[1] < BOARD.y0 || c[1] > BOARD.y1) continue;
      const shapes = this._shape(o.geometry);
      const base = Math.min(...(o.geometry.type === 'Polygon' ? o.geometry.coordinates[0] : o.geometry.coordinates[0][0]).map((q) => hY(q[0], q[1])));
      const hgt = o.props.heightM || 4;
      const isTower = o.type === 'tower' || /Carillon/.test(o.name);
      if (o.props.minLevel && isTower === false && o.layer === 'built.structures') continue; // building:part handled with tower
      const g = new THREE.ExtrudeGeometry(shapes, { depth: isTower ? hgt - 3 : hgt, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshLambertMaterial({ color: isTower ? 0xd9cdb4 : 0xe7e2d8 });
      const m = new THREE.Mesh(g, mat); m.position.y = base - 0.3; m.castShadow = true; m.receiveShadow = true;
      m.userData.layer = o.layer; this.built.add(m);
      if (isTower) { // crown + pinnacles (massing, not a survey)
        const g2 = new THREE.ExtrudeGeometry(shapes, { depth: 0.6, bevelEnabled: false }); g2.rotateX(-Math.PI / 2);
        const crown = new THREE.Mesh(g2, new THREE.MeshLambertMaterial({ color: 0xc8bb9f })); crown.position.y = base - 0.3 + hgt - 3; crown.castShadow = true; crown.userData.layer = o.layer; this.built.add(crown);
        const ring = o.geometry.coordinates[0];
        for (let i = 0; i < ring.length - 1; i++) {
          const p = ring[i]; const pin = new THREE.Mesh(new THREE.ConeGeometry(0.45, 3.4, 4), new THREE.MeshLambertMaterial({ color: 0xd9cdb4 }));
          pin.position.set(p[0], base - 0.3 + hgt - 2.4 + 1.7, -p[1]); pin.castShadow = true; pin.userData.layer = o.layer; this.built.add(pin);
        }
      }
    }
    // monument + benches
    for (const o of s.model.objects) {
      if (o.type !== 'monument' && o.type !== 'bench') continue;
      const [x, y] = o.geometry.coordinates; const isM = o.type === 'monument';
      const m = new THREE.Mesh(new THREE.BoxGeometry(isM ? 4.2 : 1.8, isM ? 0.9 : 0.45, isM ? 1.0 : 0.6), new THREE.MeshLambertMaterial({ color: isM ? 0xefebe3 : 0x9b8463 }));
      m.position.set(x, hY(x, y) + (isM ? 0.45 : 0.23), -y); m.castShadow = true; m.userData.layer = 'built.structures'; this.built.add(m);
    }
    // boardwalk deck
    const bw = s.getObject('built.east-meadow-boardwalk');
    if (bw) {
      const shapes = this._shape(bw.geometry); const g = new THREE.ExtrudeGeometry(shapes, { depth: 0.12, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
      const c = centroidOf(bw.geometry); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xa88760 }));
      m.position.y = hY(c[0], c[1]) + 0.35; m.castShadow = true; m.receiveShadow = true; m.userData.layer = 'built.structures'; this.built.add(m);
    }
  }

  _plants() {
    const s = this.s; const groups = new Map(); // key layer|form -> [i]
    const N = s.instanceCount;
    this.iMat = new Float32Array(N * 16); this.iLeaf = new Float32Array(N * 3); this.iFlower = new Float32Array(N * 3); this.iDim = new Float32Array(N);
    const dummy = new THREE.Object3D(); const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const sp = s.speciesByIndex[s.isp(i)];
      const x = s.ix(i), y = s.iy(i);
      if (x < BOARD.x0 || x > BOARD.x1 || y < BOARD.y0 || y > BOARD.y1) continue;
      const L = speciesLayer(sp); const k = L + '|' + sp.formProxy;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
      const sc = s.iscale(i); const woody = L === 'veg.trees' || L === 'veg.shrubs';
      // a visual proxy stands for ~2.4 real perennials: widen its spread so the cover reads correctly
      const spread = sp.nominalSpreadM * sc * (woody ? 1 : (L === 'veg.bulbs' ? 1 : 1.7));
      dummy.position.set(x, this.hY(x, y) - 0.03, -y);
      dummy.rotation.set(0, s.irot(i), 0);
      dummy.scale.set(spread, Math.max(0.05, sp.nominalHeightM * sc), spread);
      dummy.updateMatrix(); dummy.matrix.toArray(this.iMat, i * 16);
      const jit = 0.92 + (((i * 2654435761) >>> 0) % 1000) / 1000 * 0.16;
      col.set(sp.displayLeaf || '#6f8a4c'); this.iLeaf[i * 3] = col.r * jit; this.iLeaf[i * 3 + 1] = col.g * jit; this.iLeaf[i * 3 + 2] = col.b * jit;
      col.set(sp.displayFlower || sp.displayLeaf || '#6f8a4c'); this.iFlower[i * 3] = col.r; this.iFlower[i * 3 + 1] = col.g; this.iFlower[i * 3 + 2] = col.b;
    }
    this.plantMeshes = []; this.nearMeshes = [];
    const mat = plantMaterial();
    const make = (geo, cap, layer, form, lod) => {
      const g = geo.clone();
      g.setAttribute('iLeaf', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
      g.setAttribute('iFlower', new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3));
      g.setAttribute('iDim', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1));
      const m = new THREE.InstancedMesh(g, mat, cap);
      m.castShadow = layer !== 'veg.bulbs'; m.receiveShadow = true;
      m.userData = { layer, form, lod, list: [] };
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    for (const [k, list] of groups) {
      const [layer, form] = k.split('|');
      const woody = layer === 'veg.trees' || layer === 'veg.shrubs';
      const far = make(formGeometry(form, woody ? 'near' : 'far'), list.length, layer, form, woody ? 'all' : 'far');
      this._fill(far, list);
      this.plantMeshes.push(far);
      if (!woody && layer !== 'veg.bulbs') {
        const near = make(formGeometry(form, 'near'), Math.min(list.length, 1600), layer, form, 'near');
        near.count = 0; near.userData.all = list; near.visible = false;
        this.plantMeshes.push(near); this.nearMeshes.push(near);
      }
    }
    this.lodNear = false;
  }
  _fill(mesh, idxs) {
    const g = mesh.geometry; const L = g.attributes.iLeaf.array, F = g.attributes.iFlower.array, D = g.attributes.iDim.array; const M = mesh.instanceMatrix.array;
    const n = Math.min(idxs.length, M.length / 16);
    for (let j = 0; j < n; j++) {
      const i = idxs[j];
      M.set(this.iMat.subarray(i * 16, i * 16 + 16), j * 16);
      L[j * 3] = this.iLeaf[i * 3]; L[j * 3 + 1] = this.iLeaf[i * 3 + 1]; L[j * 3 + 2] = this.iLeaf[i * 3 + 2];
      F[j * 3] = this.iFlower[i * 3]; F[j * 3 + 1] = this.iFlower[i * 3 + 1]; F[j * 3 + 2] = this.iFlower[i * 3 + 2];
      D[j] = this.iDim[i];
    }
    mesh.count = n; mesh.userData.list = idxs.slice(0, n);
    mesh.instanceMatrix.needsUpdate = true; g.attributes.iLeaf.needsUpdate = true; g.attributes.iFlower.needsUpdate = true; g.attributes.iDim.needsUpdate = true;
  }
  // near LOD: detailed forms only for the plants inside the current view
  _updateLOD(force = false) {
    const ppm = this._pxPerM();
    const want = ppm > 26;
    if (!want && !this.lodNear && !force) return;
    if (!want) {
      this.lodNear = false;
      for (const m of this.plantMeshes) if (m.userData.lod === 'far') m.visible = this.s.layerVisible(m.userData.layer);
      for (const m of this.nearMeshes) m.visible = false;
      this._dirty = true; return;
    }
    // ground footprint of the screen (with margin)
    const pts = [];
    for (const [sx, sy] of [[-1.25, -1.25], [1.25, -1.25], [1.25, 1.25], [-1.25, 1.25]]) {
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(sx, sy), this.cam);
      const t = (this.controls.target.y - rc.ray.origin.y) / rc.ray.direction.y;
      const p = rc.ray.origin.clone().addScaledVector(rc.ray.direction, t); pts.push([p.x, -p.z]);
    }
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const area = (x1 - x0) * (y1 - y0);
    if (area > 9000) { // still too wide for detail: stay far
      if (this.lodNear) { this.lodNear = false; this._updateLOD(true); }
      return;
    }
    this.lodNear = true;
    const s = this.s;
    for (const m of this.nearMeshes) {
      const sel = m.userData.all.filter((i) => { const x = s.ix(i), y = s.iy(i); return x >= x0 && x <= x1 && y >= y0 && y <= y1; });
      this._fill(m, sel);
      m.visible = this.s.layerVisible(m.userData.layer);
    }
    for (const m of this.plantMeshes) if (m.userData.lod === 'far') m.visible = this.s.layerVisible(m.userData.layer) && m.userData.layer === 'veg.bulbs';
    this._dirty = true;
  }

  _selectionLayer() {
    this.selGroup = new THREE.Group(); this.scene.add(this.selGroup);
    this.hovGroup = new THREE.Group(); this.scene.add(this.hovGroup);
  }
  _outline(geom, color, width, group, lift = 0.25) {
    if (!geom) return;
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() :
      geom.type === 'LineString' ? [geom.coordinates] : [];
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
    const sel = s.selection;
    // dimming: focus the selected bed (or district)
    let focusBed = null;
    if (sel) {
      const o = s.getObject(sel.id); const k = s.kindOf(sel.id);
      if (k === 'instance') { focusBed = o.bedId; const sp = s.getObject(o.speciesId); this._marker(o.position[0], o.position[1], Math.max(0.25, sp.nominalSpreadM * 0.55), PAL.select, this.selGroup); }
      else if (k === 'placement') {
        focusBed = o.bedId;
        const g = s.placementGeom(o);
        if (g && g.type === 'Point') this._marker(g.coordinates[0], g.coordinates[1], o.symbolRadiusM || 0.4, PAL.select, this.selGroup);
        else if (g && g.type === 'MultiPoint') g.coordinates.forEach((c) => this._marker(c[0], c[1], 0.3, PAL.select, this.selGroup));
        else this._outline(g, PAL.select, 0.14, this.selGroup, o.role === 'matrix' ? 0.6 : 0.9);
      } else if (o) {
        if (o.type === 'bed') focusBed = o.id;
        if (o.geometry && o.geometry.type === 'Point') this._marker(o.geometry.coordinates[0], o.geometry.coordinates[1], 1.5, PAL.select, this.selGroup);
        else this._outline(o.geometry, PAL.select, 0.22, this.selGroup, 0.9);
      }
    }
    for (let i = 0; i < this.iDim.length; i++) {
      let d = 0;
      if (focusBed) { const p = s.placementByIndex[s.ipl(i)]; d = p && p.bedId === focusBed ? 0 : 0.8; }
      this.iDim[i] = d;
    }
    for (const mesh of this.plantMeshes) {
      const dim = mesh.geometry.attributes.iDim; const list = mesh.userData.list;
      for (let j = 0; j < list.length; j++) dim.array[j] = this.iDim[list[j]];
      dim.needsUpdate = true;
    }
    this._dirty = true;
  }
  _applyHover() {
    this._clear(this.hovGroup); this._dirty = true;
    const h = this.s.hover; if (!h) return;
    const o = this.s.getObject(h.id); if (!o) return;
    if (this.s.kindOf(h.id) === 'instance') { const sp = this.s.getObject(o.speciesId); this._marker(o.position[0], o.position[1], Math.max(0.25, sp.nominalSpreadM * 0.5), PAL.hover, this.hovGroup); return; }
    const g = o.geometry || (o.geometryRef ? this.s.getObject(o.geometryRef).geometry : null);
    if (g && g.type === 'Point') this._marker(g.coordinates[0], g.coordinates[1], o.symbolRadiusM || 1, PAL.hover, this.hovGroup);
    else if (g && g.type !== 'MultiPoint') this._outline(g, PAL.hover, 0.1, this.hovGroup, 0.9);
  }
  _applyLayers() {
    const s = this.s;
    for (const m of this.plantMeshes) {
      const lod = m.userData.lod;
      const on = lod === 'all' || (lod === 'far' && (!this.lodNear || m.userData.layer === 'veg.bulbs')) || (lod === 'near' && this.lodNear);
      m.visible = on && s.layerVisible(m.userData.layer);
    }
    this._dirty = true;
    this.built.children.forEach((m) => { if (m.userData.layer) m.visible = s.layerVisible(m.userData.layer); });
    this.water.forEach((m) => (m.visible = s.layerVisible('site.water')));
    // ground texture follows layer state (lawn, paths, context, water)
    const tex = this.terrain.material.map; const cv = this.groundCanvas; const ctx = cv.getContext('2d');
    const sx = cv.width / (BOARD.x1 - BOARD.x0); const T = (x, y) => [(x - BOARD.x0) * sx, (BOARD.y1 - y) * sx];
    ctx.fillStyle = s.layerVisible('veg.lawn') ? PAL.lawn : '#E7E2D4'; ctx.fillRect(0, 0, cv.width, cv.height);
    paintGround(ctx, s, T, { scale: sx, forTexture: true });
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.globalAlpha = 0.06; ctx.fillStyle = '#5f6e45'; for (let i = 0; i < 90000; i++) ctx.fillRect(rnd() * cv.width, rnd() * cv.height, 2, 2); ctx.globalAlpha = 1;
    if (s.layerVisible('analysis.slope') || s.layerVisible('analysis.pathdist')) {
      // analysis drapes over the ground in 3D as well
      const kind = s.layerVisible('analysis.slope') ? 'slope' : 'pathdist';
      if (this.onRaster) { const R = this.onRaster(kind); if (R) { const a = T(R.x0, R.y1), b = T(R.x1, R.y0); ctx.globalAlpha = 0.65; ctx.drawImage(R.canvas, a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.globalAlpha = 1; } }
    }
    tex.needsUpdate = true;
    if (this.labelEls) this.labelEls.forEach((e) => (e.el.style.display = s.layerVisible('structure.labels') ? '' : 'none'));
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
      this.labelEls.push({ el, p: this.W(c[0], c[1], b.props.style === 'M' ? 3 : 2.2) });
    }
    this._needsLabels = true;
  }
  _placeLabels() {
    if (!this.labelEls.length) return;
    const v = new THREE.Vector3();
    for (const L of this.labelEls) {
      v.copy(L.p).project(this.cam);
      const x = (v.x * 0.5 + 0.5) * this.w, y = (-v.y * 0.5 + 0.5) * this.h;
      L.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }

  _bind() {
    const c = this.c; let down = null;
    c.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    c.addEventListener('pointerup', (e) => {
      if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4; down = null;
      if (moved) return;
      const p = this._ground(e); if (!p) { this.s.select(null); return; }
      const hit = this._woodyHit(e);
      if (hit != null) { this.s.select({ id: 'pi.' + hit, at: [+p[0].toFixed(2), +p[1].toFixed(2)] }); return; }
      this.picker.clickAt(p[0], p[1], this._pxPerM());
    });
    c.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      if (this._hovT && performance.now() - this._hovT < 50) return; this._hovT = performance.now();
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
    const meshes = this.plantMeshes.filter((m) => m.visible && (m.userData.layer === 'veg.trees' || m.userData.layer === 'veg.shrubs'));
    const hit = rc.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    return hit.object.userData.list[hit.instanceId];
  }

  setActive(a) {
    const was = this.active; this.active = a;
    if (a) { this.resize(); this.controls.enabled = true; this._needsLabels = true; this._dirty = true; if (!was) requestAnimationFrame(this._loop); }
  }
  // render on demand: only when the camera, selection, layers or LOD changed
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
  // step quality down on slow GPUs (measured, not assumed)
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
  // force a synchronous render (tests / screenshots)
  renderNow() { this._updateLOD(true); this.r.render(this.scene, this.cam); this._placeLabels(); }
  stats() { const i = this.r.info; return { fps: +this.fps.toFixed(1), triangles: i.render.triangles, calls: i.render.calls, instances: this.iDim.length, dpr: this.r.getPixelRatio() }; }
}
