// Procedural plant form proxies. Each form is built once (unit size: height 1, spread ~1)
// and instanced. Vertex attributes: part (0 foliage .. 1 flower), shade (0 base .. 1 top).
import * as THREE from 'three';

function rand(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

class GB {
  constructor(seed = 1) { this.p = []; this.n = []; this.part = []; this.sh = []; this.r = rand(seed); }
  v(x, y, z, part, sh, nx, ny, nz) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.part.push(part); this.sh.push(sh); }
  // soft "foliage" normal: outward from axis + up
  sn(x, y, z, up = 1.2) { const l = Math.hypot(x, y * 0 + up, z) || 1; return [x / l, up / l, z / l]; }
  tri(a, b, c, part, soft = true) {
    for (const q of [a, b, c]) {
      const nn = soft ? this.sn(q[0], q[1], q[2]) : [0, 1, 0];
      this.v(q[0], q[1], q[2], part, Math.min(1, Math.max(0, q[1])), nn[0], nn[1], nn[2]);
    }
  }
  quad(a, b, c, d, part, soft) { this.tri(a, b, c, part, soft); this.tri(a, c, d, part, soft); }
  // curved tapering blade from base point, azimuth a, lean (0 upright .. 1 flat), length L, width w
  blade(bx, bz, a, lean, L, w, part = 0, segs = 3, by = 0) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = -sa, pz = ca; // width direction
    let prev = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ang = lean * t * 1.25; // arching
      const r = L * Math.sin(ang) * 0.9 * t + L * 0.12 * t;
      const y = by + L * Math.cos(ang * 0.85) * t;
      const ww = w * (1 - t * 0.92);
      const cx = bx + ca * r, cz = bz + sa * r;
      const cur = [[cx - px * ww, y, cz - pz * ww], [cx + px * ww, y, cz + pz * ww]];
      if (prev) this.quad(prev[0], prev[1], cur[1], cur[0], part);
      prev = cur;
    }
  }
  stem(x0, y0, z0, x1, y1, z1, w = 0.012, part = 0) {
    // two crossed thin quads
    this.quad([x0 - w, y0, z0], [x0 + w, y0, z0], [x1 + w, y1, z1], [x1 - w, y1, z1], part, false);
    this.quad([x0, y0, z0 - w], [x0, y0, z0 + w], [x1, y1, z1 + w], [x1, y1, z1 - w], part, false);
  }
  disc(cx, cy, cz, r, n = 7, part = 1, tilt = 0) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283;
      this.tri([cx, cy + r * 0.12, cz], [cx + Math.cos(a0) * r, cy - tilt * r, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, cy - tilt * r, cz + Math.sin(a1) * r], part);
    }
  }
  star(cx, cy, cz, r, n = 10, part = 1, droop = 0.1) { // daisy rays
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283; const ca = Math.cos(a), sa = Math.sin(a);
      const w = r * 0.16;
      this.tri([cx - sa * w * 0.6, cy, cz + ca * w * 0.6], [cx + sa * w * 0.6, cy, cz - ca * w * 0.6], [cx + ca * r, cy - droop * r, cz + sa * r], part);
    }
  }
  blob(cx, cy, cz, r, part = 0, sy = 1) { // low-poly octahedron-ish blob (8 faces)
    const t = [cx, cy + r * sy, cz], b = [cx, cy - r * sy * 0.7, cz];
    const ring = []; const off = this.r() * 6.28;
    for (let i = 0; i < 5; i++) { const a = off + (i / 5) * 6.283; ring.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]); }
    for (let i = 0; i < 5; i++) { const a = ring[i], c = ring[(i + 1) % 5]; this.tri(t, c, a, part); this.tri(b, a, c, part); }
  }
  cone(cx, cy, cz, r, h, part = 1, n = 5) {
    const tip = [cx, cy + h, cz];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * 6.283, a1 = ((i + 1) / n) * 6.283;
      this.tri([cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], tip, [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r], part);
    }
  }
  leafMound(n, rad, h, part = 0) { // basal leaves
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + this.r() * 0.5;
      const L = rad * (0.7 + this.r() * 0.5);
      this.blade(0, 0, a, 0.9 + this.r() * 0.3, L, L * 0.28, part, 2);
    }
    void h;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('part', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('shade', new THREE.Float32BufferAttribute(this.sh, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// All forms: unit height ~1 (y in 0..1), radius ~0.5.
const FORMS = {
  'grass-fine'(b) { for (let i = 0; i < 18; i++) b.blade(b.r() * 0.05, b.r() * 0.05, b.r() * 6.28, 0.55 + b.r() * 0.6, 0.75 + b.r() * 0.25, 0.018, 0, 3);
    for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.2 + b.r() * 0.2; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0.1, 0, x, 1.0 + b.r() * 0.2, z, 0.006, 0.6); b.blob(x, 1.05, z, 0.05, 1, 1.6); } },
  'grass-upright'(b) { for (let i = 0; i < 16; i++) b.blade(b.r() * 0.06, b.r() * 0.06, b.r() * 6.28, 0.12 + b.r() * 0.25, 0.85 + b.r() * 0.2, 0.016, i < 5 ? 0.55 : 0.08, 3); },
  'grass-haze'(b) { for (let i = 0; i < 14; i++) b.blade(0, 0, b.r() * 6.28, 0.7 + b.r() * 0.4, 0.45, 0.02, 0, 2);
    for (let i = 0; i < 16; i++) { const a = b.r() * 6.28, r = b.r() * 0.45; b.blob(Math.cos(a) * r, 0.55 + b.r() * 0.4, Math.sin(a) * r, 0.11 + b.r() * 0.06, 1, 0.7); } },
  'grass-tall-airy'(b) { for (let i = 0; i < 14; i++) b.blade(0, 0, b.r() * 6.28, 0.75 + b.r() * 0.3, 0.38, 0.02, 0, 2);
    for (let i = 0; i < 12; i++) { const a = b.r() * 6.28, r = 0.15 + b.r() * 0.3; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0.2, 0, x, 0.9 + b.r() * 0.1, z, 0.005, 0.7); b.blade(x, z, a, 0.1, 0.12, 0.03, 1, 1, 0.85); } },
  'grass-bottlebrush'(b) { for (let i = 0; i < 18; i++) b.blade(0, 0, b.r() * 6.28, 0.7 + b.r() * 0.4, 0.75, 0.018, 0, 3);
    for (let i = 0; i < 7; i++) { const a = b.r() * 6.28, r = 0.3 + b.r() * 0.15; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0.3, 0, x, 0.85, z, 0.006, 0.2); b.blob(x, 0.88, z, 0.045, 1, 2.0); } },
  daisy(b) { b.leafMound(6, 0.35, 0.2); for (let i = 0; i < 5; i++) { const a = b.r() * 6.28, r = 0.08 + b.r() * 0.22; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.8 + b.r() * 0.2; b.stem(0, 0.1, 0, x, y, z); b.star(x, y, z, 0.07, 10, 1, 0.35); b.cone(x, y, z, 0.025, 0.04, 0.0); } },
  'daisy-drooping'(b) { b.leafMound(5, 0.3, 0.2); for (let i = 0; i < 5; i++) { const a = b.r() * 6.28, r = 0.1 + b.r() * 0.2; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.85 + b.r() * 0.15; b.stem(0, 0.1, 0, x, y, z); b.star(x, y, z, 0.08, 9, 1, 1.0); b.cone(x, y, z, 0.02, 0.04, 0.0); } },
  'daisy-small'(b) { for (let i = 0; i < 6; i++) b.blob((b.r() - 0.5) * 0.5, 0.35 + b.r() * 0.25, (b.r() - 0.5) * 0.5, 0.18, 0); for (let i = 0; i < 26; i++) { const a = b.r() * 6.28, r = b.r() * 0.42; b.disc(Math.cos(a) * r, 0.5 + b.r() * 0.45, Math.sin(a) * r, 0.04, 5, 1); } },
  spike(b) { b.leafMound(6, 0.3, 0.2); for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.2; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.55 + b.r() * 0.15; b.stem(0, 0.1, 0, x, y, z, 0.012); b.cone(x, y, z, 0.035, 0.38 + b.r() * 0.1, 1, 4); } },
  'spike-short'(b) { for (let i = 0; i < 5; i++) b.blob((b.r() - 0.5) * 0.45, 0.25, (b.r() - 0.5) * 0.45, 0.16, 0, 0.8); for (let i = 0; i < 9; i++) { const a = b.r() * 6.28, r = b.r() * 0.3; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.5 + b.r() * 0.15; b.stem(x * 0.5, 0.2, z * 0.5, x, y, z, 0.01); b.cone(x, y, z, 0.035, 0.32, 1, 4); } },
  'spike-airy'(b) { b.leafMound(5, 0.25, 0.2); for (let i = 0; i < 9; i++) { const a = b.r() * 6.28, r = 0.1 + b.r() * 0.35; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + b.r() * 0.25; b.stem(0, 0.05, 0, x, y, z, 0.007, 0.15); for (let k = 0; k < 4; k++) { const t = 0.55 + k * 0.12; b.blob(x * t, y * t + 0.02, z * t, 0.025, 1, 1.4); } } },
  'spike-candelabra'(b) { b.leafMound(5, 0.25, 0.2); for (let i = 0; i < 4; i++) { const a = b.r() * 6.28, r = 0.08 + b.r() * 0.12; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0, 0, x, 0.7, z, 0.012); for (let k = 0; k < 3; k++) { const aa = a + (k - 1) * 0.7; const xx = x + Math.cos(aa) * 0.07, zz = z + Math.sin(aa) * 0.07; b.cone(xx, 0.68, zz, 0.025, 0.3, 1, 4); } for (let k = 1; k < 4; k++) b.star(x * k / 4, 0.18 * k, z * k / 4, 0.09, 5, 0, 0.1); } },
  'spike-tall'(b) { b.leafMound(6, 0.3, 0.2); for (let i = 0; i < 3; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.1; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0, 0, x, 1.0, z, 0.012); for (let k = 0; k < 6; k++) { const t = 0.45 + k * 0.1; b.disc(x * t + 0.03, t, z * t, 0.045, 5, 1, -0.2); } } },
  plume(b) { b.leafMound(7, 0.3, 0.2); for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = b.r() * 0.22; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0.1, 0, x, 0.55, z); b.cone(x, 0.5, z, 0.07, 0.42, 1, 5); } },
  globe(b) { b.leafMound(6, 0.32, 0.2); for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.25; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.82 + b.r() * 0.18; b.stem(0, 0.1, 0, x, y, z, 0.01); b.blob(x, y, z, 0.06, 1); } },
  'globe-small'(b) { for (let i = 0; i < 6; i++) b.blade(0, 0, b.r() * 6.28, 0.6, 0.35, 0.05, 0, 2); for (let i = 0; i < 10; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.3; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.7 + b.r() * 0.3; b.stem(x * 0.3, 0.2, z * 0.3, x, y, z, 0.008, 0.3); b.blob(x, y, z, 0.035, 1, 1.3); } },
  umbel(b) { b.leafMound(6, 0.3, 0.2); for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.25; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.85 + b.r() * 0.15; b.stem(0, 0.1, 0, x, y, z, 0.01); b.disc(x, y, z, 0.09, 7, 1, 0.15); } },
  'umbel-tall'(b) { b.leafMound(5, 0.25, 0.2); for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.08 + b.r() * 0.22; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.9 + b.r() * 0.1; b.stem(0, 0, 0, x, y, z, 0.012); for (let k = 1; k < 4; k++) b.blade(x * k / 4, z * k / 4, a + k, 0.9, 0.14, 0.035, 0, 1, y * k / 4); b.disc(x, y, z, 0.1, 7, 1, 0.1); } },
  cloud(b) { for (let i = 0; i < 7; i++) b.blob((b.r() - 0.5) * 0.6, 0.3 + b.r() * 0.2, (b.r() - 0.5) * 0.6, 0.2, 0, 0.75); for (let i = 0; i < 28; i++) { const a = b.r() * 6.28, r = b.r() * 0.48; b.disc(Math.cos(a) * r, 0.45 + b.r() * 0.45, Math.sin(a) * r, 0.03, 5, 1); } },
  'cloud-tall'(b) { b.leafMound(6, 0.3, 0.2); for (let i = 0; i < 5; i++) { const a = b.r() * 6.28, r = 0.1 + b.r() * 0.2; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0.1, 0, x, 0.85, z, 0.008); for (let k = 0; k < 6; k++) b.blob(x + (b.r() - 0.5) * 0.12, 0.85 + b.r() * 0.15, z + (b.r() - 0.5) * 0.12, 0.035, 1); } },
  'feather-mound'(b) { for (let i = 0; i < 26; i++) { const a = b.r() * 6.28; const x = Math.cos(a) * b.r() * 0.15, z = Math.sin(a) * b.r() * 0.15; b.stem(0, 0, 0, x * 3, 0.65 + b.r() * 0.3, z * 3, 0.01); for (let k = 0; k < 3; k++) b.blade(x * (1 + k), z * (1 + k), a + b.r(), 0.7, 0.18, 0.012, 0, 1, 0.25 + k * 0.18); } for (let i = 0; i < 8; i++) { const a = b.r() * 6.28, r = b.r() * 0.35; b.blob(Math.cos(a) * r, 0.88 + b.r() * 0.1, Math.sin(a) * r, 0.04, 1); } },
  saucer(b) { b.leafMound(7, 0.32, 0.2); for (let i = 0; i < 7; i++) { const a = b.r() * 6.28, r = 0.1 + b.r() * 0.3; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + b.r() * 0.25; b.stem(0, 0.1, 0, x, y, z, 0.007); b.disc(x, y, z, 0.05, 6, 1, -0.3); } },
  dome(b) { for (let i = 0; i < 5; i++) { const a = b.r() * 6.28, r = b.r() * 0.15; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0, 0, x, 0.7, z, 0.012); for (let k = 1; k < 4; k++) b.star(x * k / 4, 0.17 * k, z * k / 4, 0.1, 4, 0, 0.2); b.blob(x, 0.82, z, 0.13, 1, 0.8); } },
  whorl(b) { for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = b.r() * 0.25; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + b.r() * 0.2; b.stem(0, 0, 0, x, y, z, 0.01); b.star(x * 0.6, y * 0.55, z * 0.6, 0.08, 4, 0, 0.1); b.disc(x, y, z, 0.07, 7, 1, -0.3); } },
  'whorl-tall'(b) { b.leafMound(5, 0.35, 0.2); for (let i = 0; i < 4; i++) { const a = b.r() * 6.28, r = b.r() * 0.15; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0, 0, x, 1.0, z, 0.01); for (let k = 0; k < 4; k++) b.disc(x, 0.5 + k * 0.15, z, 0.06, 7, 1, -0.2); } },
  sword(b) { for (let i = 0; i < 14; i++) b.blade(0, 0, b.r() * 6.28, 0.18 + b.r() * 0.2, 0.75 + b.r() * 0.2, 0.035, 0, 2); for (let i = 0; i < 4; i++) { const a = b.r() * 6.28, r = b.r() * 0.15; const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(0, 0, 0, x, 0.95, z, 0.008); b.star(x, 0.95, z, 0.06, 6, 1, 0.5); } },
  cup(b) { b.leafMound(6, 0.35, 0.2); for (let i = 0; i < 4; i++) { const a = b.r() * 6.28, r = 0.05 + b.r() * 0.25; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + b.r() * 0.25; b.stem(0, 0.05, 0, x, y, z, 0.009); b.cone(x, y + 0.08, z, 0.07, -0.08, 1, 6); } },
  shrubby(b) { for (let i = 0; i < 12; i++) { const a = b.r() * 6.28, r = b.r() * 0.35; b.blob(Math.cos(a) * r, 0.35 + b.r() * 0.45, Math.sin(a) * r, 0.17, 0, 0.8); } for (let i = 0; i < 6; i++) { const a = b.r() * 6.28, r = 0.2 + b.r() * 0.2; b.cone(Math.cos(a) * r, 0.75, Math.sin(a) * r, 0.03, 0.25, 1, 4); } },
  bulb(b) { for (let i = 0; i < 4; i++) b.blade(0, 0, b.r() * 6.28, 0.35, 0.9, 0.06, 0.35, 2); },
  fern(b) { for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.28 + b.r() * 0.3; b.blade(0, 0, a, 0.75, 0.95, 0.11, 0, 4); } },
  'meadow-forb'(b) { b.leafMound(4, 0.25, 0.2); for (let i = 0; i < 4; i++) { const a = b.r() * 6.28, r = b.r() * 0.25; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 0.75 + b.r() * 0.25; b.stem(0, 0, 0, x, y, z, 0.01); b.blob(x, y, z, 0.05, 1, 1.2); } },
  shrub(b) { for (let i = 0; i < 4; i++) b.stem(0, 0, 0, (b.r() - 0.5) * 0.3, 0.4, (b.r() - 0.5) * 0.3, 0.02, 0); for (let i = 0; i < 16; i++) { const a = b.r() * 6.28, r = b.r() * 0.33; b.blob(Math.cos(a) * r, 0.45 + b.r() * 0.38, Math.sin(a) * r, 0.2, i % 5 === 0 ? 0.6 : 0, 0.8); } },
  'shrub-vase'(b) { for (let i = 0; i < 5; i++) { const a = b.r() * 6.28; b.stem(0, 0, 0, Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, 0.02, 0); } for (let i = 0; i < 16; i++) { const a = b.r() * 6.28, r = 0.15 + b.r() * 0.3; b.blob(Math.cos(a) * r, 0.55 + b.r() * 0.4, Math.sin(a) * r, 0.18, i % 6 === 0 ? 0.6 : 0, 0.8); } },
};
FORMS.tree = (b) => { b.stem(0, 0, 0, 0, 0.5, 0, 0.035, 0); b.stem(0, 0.35, 0, 0.12, 0.6, 0.05, 0.02, 0); for (let i = 0; i < 22; i++) { const a = b.r() * 6.28, r = b.r() * 0.36; b.blob(Math.cos(a) * r, 0.5 + b.r() * 0.38 + (0.36 - r) * 0.3, Math.sin(a) * r, 0.17, 0, 0.85); } };
FORMS['tree-small'] = (b) => { b.stem(0, 0, 0, 0, 0.4, 0, 0.03, 0); for (let i = 0; i < 16; i++) { const a = b.r() * 6.28, r = b.r() * 0.38; b.blob(Math.cos(a) * r, 0.45 + b.r() * 0.4, Math.sin(a) * r, 0.17, i % 5 === 0 ? 0.7 : 0, 0.8); } };
FORMS['tree-multistem'] = (b) => { for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.28 + 0.4; b.stem(0, 0, 0, Math.cos(a) * 0.16, 0.6, Math.sin(a) * 0.16, 0.02, 0.85); } for (let i = 0; i < 18; i++) { const a = b.r() * 6.28, r = b.r() * 0.38; b.blob(Math.cos(a) * r, 0.55 + b.r() * 0.38, Math.sin(a) * r, 0.15, 0, 0.8); } };

// ---- far LOD: 6–24 triangles, tuned to read as coloured tufts from the overview
function farTuft(b, n, lean, part = 0) { for (let i = 0; i < n; i++) b.blade(0, 0, (i / n) * 6.283 + b.r() * 0.4, lean, 1.0, 0.16, part, 1); }
function farCap(b, kind) {
  if (kind === 'spike') { for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; b.cone(Math.cos(a) * 0.16, 0.55, Math.sin(a) * 0.16, 0.05, 0.42, 1, 3); } }
  else if (kind === 'disc') { b.disc(0.06, 0.88, 0, 0.2, 6, 1, 0.12); b.disc(-0.12, 0.8, 0.1, 0.16, 5, 1, 0.12); }
  else if (kind === 'dots') { b.disc(0, 0.72, 0, 0.3, 5, 0.55, 0.2); }
  else if (kind === 'globe') { b.blob(0.12, 0.85, 0, 0.1, 1); b.blob(-0.14, 0.8, 0.08, 0.09, 1); }
}
const FAR = {
  grass: (b) => { b.blob(0, 0.22, 0, 0.3, 0, 0.8); farTuft(b, 6, 0.6, 0.15); },
  'grass-upright': (b) => { b.blob(0, 0.3, 0, 0.22, 0, 1.2); farTuft(b, 6, 0.25, 0.35); },
  haze: (b) => { farTuft(b, 4, 0.7); b.blob(0, 0.65, 0, 0.38, 1, 0.55); },
  airy: (b) => { farTuft(b, 4, 0.75); for (let i = 0; i < 3; i++) { const a = (i / 3) * 6.283; b.blade(Math.cos(a) * 0.1, Math.sin(a) * 0.1, a, 0.15, 1.0, 0.05, 1, 1); } },
  forb: (b, cap) => { b.blob(0, 0.34, 0, 0.44, 0, 0.8); b.blob(0.16, 0.5, -0.1, 0.24, 0, 0.9); farCap(b, cap); },
  sword: (b) => { farTuft(b, 5, 0.2); b.disc(0, 0.92, 0, 0.18, 5, 1, 0.3); },
  woody: (b) => { b.stem(0, 0, 0, 0, 0.5, 0, 0.04, 0); b.blob(0, 0.62, 0, 0.42, 0, 0.9); b.blob(0.18, 0.75, 0.1, 0.3, 0, 0.9); b.blob(-0.2, 0.7, -0.12, 0.3, 0.3, 0.9); },
  bulb: (b) => { b.quad([-0.5, 0.05, -0.15], [0.5, 0.05, -0.15], [0.5, 0.05, 0.15], [-0.5, 0.05, 0.15], 0.5, false); },
};
const FAR_OF = {
  'grass-fine': (b) => FAR.grass(b), 'grass-upright': (b) => FAR['grass-upright'](b), 'grass-haze': (b) => FAR.haze(b),
  'grass-tall-airy': (b) => FAR.airy(b), 'grass-bottlebrush': (b) => { FAR.grass(b); b.blob(0, 0.85, 0, 0.12, 1, 1.4); },
  daisy: (b) => FAR.forb(b, 'disc'), 'daisy-drooping': (b) => FAR.forb(b, 'disc'), 'daisy-small': (b) => FAR.forb(b, 'dots'),
  spike: (b) => FAR.forb(b, 'spike'), 'spike-short': (b) => FAR.forb(b, 'spike'), 'spike-airy': (b) => FAR.forb(b, 'spike'),
  'spike-candelabra': (b) => FAR.forb(b, 'spike'), 'spike-tall': (b) => FAR.forb(b, 'spike'), plume: (b) => FAR.forb(b, 'spike'),
  globe: (b) => FAR.forb(b, 'globe'), 'globe-small': (b) => FAR.forb(b, 'globe'), umbel: (b) => FAR.forb(b, 'disc'),
  'umbel-tall': (b) => FAR.forb(b, 'disc'), cloud: (b) => FAR.forb(b, 'dots'), 'cloud-tall': (b) => FAR.forb(b, 'dots'),
  'feather-mound': (b) => FAR.forb(b, 'dots'), saucer: (b) => FAR.forb(b, 'dots'), dome: (b) => FAR.forb(b, 'globe'),
  whorl: (b) => FAR.forb(b, 'disc'), 'whorl-tall': (b) => FAR.forb(b, 'spike'), sword: (b) => FAR.sword(b), cup: (b) => FAR.forb(b, 'disc'),
  shrubby: (b) => FAR.forb(b, 'spike'), bulb: (b) => FAR.bulb(b), fern: (b) => FAR.grass(b), 'meadow-forb': (b) => FAR.forb(b, 'dots'),
  shrub: (b) => FAR.woody(b), 'shrub-vase': (b) => FAR.woody(b), tree: (b) => FAR.woody(b), 'tree-small': (b) => FAR.woody(b), 'tree-multistem': (b) => FAR.woody(b),
};

const cache = new Map();
export function formGeometry(form, lod = 'near') {
  const key = form + '|' + lod;
  if (!cache.has(key)) {
    const b = new GB(hash(form));
    if (lod === 'far') (FAR_OF[form] || FAR_OF.umbel)(b);
    else (FORMS[form] || FORMS.umbel)(b);
    cache.set(key, b.geometry());
  }
  return cache.get(key);
}
export const FORM_NAMES = Object.keys(FORMS);
function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

// Material: per-instance leaf / flower colours, dimming, soft base darkening.
export function plantMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float part; attribute float shade; attribute vec3 iLeaf; attribute vec3 iFlower; attribute float iDim;
varying vec3 vTint;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 c = mix(iLeaf, iFlower, clamp(part, 0.0, 1.0));
c *= mix(0.66, 1.06, smoothstep(0.0, 0.9, shade));
float g = dot(c, vec3(0.3, 0.59, 0.11));
vec3 quiet = mix(vec3(g) * vec3(0.98, 1.0, 0.94), vec3(0.62, 0.62, 0.56), 0.35);
vTint = mix(c, quiet, iDim);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTint;`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vTint, opacity );')
      .replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;');
  };
  return m;
}
