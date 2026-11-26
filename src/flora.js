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

// All forms: unit height ~1 (y in 0..1), radius ~0.5. Near LOD = botanical detail.
// helpers ---------------------------------------------------------------
function rosette(b, n, len, w, lean0 = 0.55, lean1 = 1.0) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + b.r() * 0.6; const big = w > 0.03; b.blade(0, 0, a, lean0 + b.r() * (lean1 - lean0), len * (big ? 1.3 : 1) * (0.75 + b.r() * 0.4), w * (big ? 1.7 : 1), 0, 3); } }
function stemTo(b, a, r, y, lean = 0.12) { const x = Math.cos(a) * r, z = Math.sin(a) * r; b.stem(x * lean, 0.05, z * lean, x, y, z, 0.007); return [x, y, z]; }
function nodeLeaves(b, x, y, z, k = 3, len = 0.12) { for (let i = 1; i <= k; i++) { const t = i / (k + 1); const a = b.r() * 6.28; b.blade(x * t, z * t, a, 0.95, len, len * 0.22, 0, 1, y * t); b.blade(x * t, z * t, a + 3.14, 0.95, len, len * 0.22, 0, 1, y * t); } }
function daisyHead(b, x, y, z, r, rays = 12, droop = 0.3) { b.star(x, y, z, r, rays, 1, droop); b.cone(x, y - 0.01, z, r * 0.32, r * 0.55, 0.0, 6); }
function umbelHead(b, x, y, z, r) { b.disc(x, y, z, r * 0.55, 6, 1, 0.1); for (let i = 0; i < 5; i++) { const a = (i / 5) * 6.283; b.disc(x + Math.cos(a) * r * 0.6, y - r * 0.18, z + Math.sin(a) * r * 0.6, r * 0.38, 5, 1, 0.1); } }
function spikeHead(b, x, y, z, r, h) { b.cone(x, y, z, r, h, 1, 6); }
function tinyDots(b, n, rad, y0, y1, r) { for (let i = 0; i < n; i++) { const a = b.r() * 6.28, rr = Math.sqrt(b.r()) * rad; b.disc(Math.cos(a) * rr, y0 + b.r() * (y1 - y0), Math.sin(a) * rr, r, 5, 1, 0.1); } }

const FORMS = {
  'grass-fine'(b) { rosette(b, 30, 0.7, 0.012, 0.55, 1.2); for (let i = 0; i < 10; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.18 + b.r() * 0.25, 0.95 + b.r() * 0.15, 0.2); for (let k = 0; k < 3; k++) b.disc(x + (b.r() - 0.5) * 0.06, y - k * 0.05, z + (b.r() - 0.5) * 0.06, 0.025, 4, 0.7, -0.2); } },
  'grass-upright'(b) { for (let i = 0; i < 26; i++) b.blade(b.r() * 0.05, b.r() * 0.05, b.r() * 6.28, 0.08 + b.r() * 0.3, 0.8 + b.r() * 0.25, 0.013, i % 4 === 0 ? 0.6 : 0.12, 3); },
  'grass-haze'(b) { rosette(b, 20, 0.45, 0.014, 0.7, 1.2); tinyDots(b, 46, 0.46, 0.45, 0.95, 0.028); },
  'grass-tall-airy'(b) { rosette(b, 22, 0.42, 0.014, 0.65, 1.1); for (let i = 0; i < 14; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.12 + b.r() * 0.35, 0.85 + b.r() * 0.15, 0.25); for (let k = 0; k < 4; k++) b.disc(x + (b.r() - 0.5) * 0.08, y - k * 0.07, z + (b.r() - 0.5) * 0.08, 0.02, 4, 1, 0); } },
  'grass-bottlebrush'(b) { rosette(b, 26, 0.75, 0.014, 0.6, 1.2); for (let i = 0; i < 8; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.3 + b.r() * 0.15, 0.85, 0.3); b.cone(x, y - 0.06, z, 0.03, 0.14, 1, 5); } },
  daisy(b) { rosette(b, 10, 0.32, 0.06, 0.8, 1.2); for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.08 + b.r() * 0.22, 0.78 + b.r() * 0.2); nodeLeaves(b, x, y, z, 2, 0.12); daisyHead(b, x, y, z, 0.075, 13, 0.25); } },
  'daisy-drooping'(b) { rosette(b, 8, 0.3, 0.05, 0.8, 1.2); for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.1 + b.r() * 0.2, 0.85 + b.r() * 0.15); daisyHead(b, x, y, z, 0.085, 11, 1.1); } },
  'daisy-small'(b) { rosette(b, 12, 0.3, 0.05, 0.7, 1.1); for (let i = 0; i < 7; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.1 + b.r() * 0.3, 0.6 + b.r() * 0.35, 0.3); nodeLeaves(b, x, y, z, 2, 0.1); for (let k = 0; k < 5; k++) daisyHead(b, x + (b.r() - 0.5) * 0.14, y + (b.r() - 0.5) * 0.12, z + (b.r() - 0.5) * 0.14, 0.03, 8, 0.2); } },
  spike(b) { rosette(b, 10, 0.3, 0.05, 0.75, 1.15); for (let i = 0; i < 7; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.2, 0.55 + b.r() * 0.12); nodeLeaves(b, x, y, z, 2, 0.1); spikeHead(b, x, y, z, 0.03, 0.36 + b.r() * 0.1); } },
  'spike-short'(b) { rosette(b, 14, 0.3, 0.07, 0.8, 1.25); for (let i = 0; i < 10; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.3, 0.5 + b.r() * 0.15, 0.5); spikeHead(b, x, y, z, 0.03, 0.28); } },
  'spike-airy'(b) { rosette(b, 8, 0.25, 0.04, 0.7, 1.1); for (let i = 0; i < 10; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.12 + b.r() * 0.36, 0.75 + b.r() * 0.25, 0.1); for (let k = 0; k < 5; k++) { const t = 0.5 + k * 0.11; b.disc(x * t, y * t + 0.02, z * t, 0.022, 4, 1, -0.2); } } },
  'spike-candelabra'(b) { rosette(b, 6, 0.22, 0.05, 0.7, 1.0); for (let i = 0; i < 4; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.06 + b.r() * 0.12, 0.72, 0.4); for (let k = 1; k < 5; k++) b.star(x * k / 5, y * k / 5, z * k / 5, 0.09, 5, 0, 0.15); for (let k = 0; k < 4; k++) { const aa = (k / 4) * 6.28; spikeHead(b, x + Math.cos(aa) * 0.05, y - 0.02, z + Math.sin(aa) * 0.05, 0.02, 0.26); } spikeHead(b, x, y, z, 0.026, 0.3); } },
  'spike-tall'(b) { rosette(b, 8, 0.3, 0.08, 0.8, 1.2); for (let i = 0; i < 3; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.1, 1.0, 0.6); for (let k = 0; k < 7; k++) { const t = 0.42 + k * 0.08; b.disc(x * t + 0.03, y * t, z * t, 0.045, 6, 1, -0.25); } } },
  plume(b) { rosette(b, 10, 0.3, 0.07, 0.8, 1.2); for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.22, 0.5, 0.4); b.cone(x, y, z, 0.06, 0.45, 1, 6); } },
  globe(b) { rosette(b, 9, 0.34, 0.07, 0.75, 1.15); for (let i = 0; i < 7; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.25, 0.82 + b.r() * 0.18); nodeLeaves(b, x, y, z, 2, 0.13); b.blob(x, y, z, 0.055, 1); } },
  'globe-small'(b) { for (let i = 0; i < 8; i++) b.blade(0, 0, b.r() * 6.28, 0.55, 0.35, 0.04, 0, 2); for (let i = 0; i < 12; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.32, 0.65 + b.r() * 0.35, 0.3); b.star(x, y - 0.02, z, 0.05, 6, 0.6, 0.4); b.blob(x, y, z, 0.03, 1, 1.3); } },
  umbel(b) { rosette(b, 10, 0.3, 0.05, 0.8, 1.2); for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.24, 0.82 + b.r() * 0.16); nodeLeaves(b, x, y, z, 2, 0.1); umbelHead(b, x, y, z, 0.085); } },
  'umbel-tall'(b) { rosette(b, 6, 0.25, 0.05, 0.8, 1.1); for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.08 + b.r() * 0.22, 0.9 + b.r() * 0.1); nodeLeaves(b, x, y, z, 4, 0.14); umbelHead(b, x, y, z, 0.09); } },
  cloud(b) { rosette(b, 18, 0.42, 0.06, 0.85, 1.3); tinyDots(b, 44, 0.48, 0.3, 0.85, 0.026); },
  'cloud-tall'(b) { rosette(b, 8, 0.3, 0.07, 0.8, 1.2); for (let i = 0; i < 5; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.1 + b.r() * 0.2, 0.85); for (let k = 0; k < 8; k++) b.disc(x + (b.r() - 0.5) * 0.16, y + b.r() * 0.12, z + (b.r() - 0.5) * 0.16, 0.025, 5, 1); } },
  'feather-mound'(b) { for (let i = 0; i < 22; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.25 + b.r() * 0.2, 0.62 + b.r() * 0.3, 0.2); for (let k = 1; k <= 4; k++) { const t = k / 5; b.blade(x * t, z * t, b.r() * 6.28, 0.75, 0.16, 0.008, 0, 1, y * t); } } tinyDots(b, 10, 0.35, 0.85, 0.98, 0.03); },
  saucer(b) { rosette(b, 9, 0.32, 0.09, 0.8, 1.2); for (let i = 0; i < 8; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.1 + b.r() * 0.32, 0.72 + b.r() * 0.26, 0.2); b.disc(x, y, z, 0.045, 6, 1, -0.35); b.disc(x, y + 0.005, z, 0.014, 5, 0.0, 0); } },
  dome(b) { for (let i = 0; i < 6; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.16, 0.72, 0.5); for (let k = 1; k < 5; k++) b.star(x * k / 5, y * k / 5, z * k / 5, 0.1, 4, 0, 0.2); for (let k = 0; k < 6; k++) b.disc(x + (b.r() - 0.5) * 0.14, y + b.r() * 0.12, z + (b.r() - 0.5) * 0.14, 0.035, 5, 1, 0.1); } },
  whorl(b) { rosette(b, 6, 0.2, 0.05, 0.8, 1.1); for (let i = 0; i < 8; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.28, 0.72 + b.r() * 0.22, 0.4); b.star(x * 0.6, y * 0.55, z * 0.6, 0.08, 4, 0, 0.1); b.star(x, y, z, 0.06, 10, 1, -0.3); } },
  'whorl-tall'(b) { rosette(b, 7, 0.36, 0.1, 0.85, 1.2); for (let i = 0; i < 4; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.15, 1.0, 0.6); for (let k = 0; k < 4; k++) b.star(x * (0.5 + k * 0.15), y * (0.5 + k * 0.15), z * (0.5 + k * 0.15), 0.06, 10, 1, -0.25); } },
  sword(b) { for (let i = 0; i < 16; i++) b.blade(0, 0, b.r() * 6.28, 0.1 + b.r() * 0.2, 0.7 + b.r() * 0.25, 0.03, 0, 3); for (let i = 0; i < 4; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.15, 0.95, 0.5); b.star(x, y, z, 0.06, 6, 1, 0.55); b.star(x, y + 0.01, z, 0.04, 3, 1, -0.6); } },
  cup(b) { rosette(b, 9, 0.35, 0.09, 0.8, 1.2); for (let i = 0; i < 5; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.05 + b.r() * 0.25, 0.75 + b.r() * 0.25); b.cone(x, y + 0.08, z, 0.065, -0.08, 1, 7); b.disc(x, y + 0.075, z, 0.02, 5, 0.0); } },
  shrubby(b) { for (let i = 0; i < 9; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, 0.15 + b.r() * 0.25, 0.65 + b.r() * 0.2, 0.3); for (let k = 1; k <= 4; k++) b.star(x * k / 5, y * k / 5 + 0.1, z * k / 5, 0.09, 3, 0, 0.2); spikeHead(b, x, y, z, 0.025, 0.24); } },
  bulb(b) { for (let i = 0; i < 4; i++) b.blade(0, 0, b.r() * 6.28, 0.35, 0.9, 0.06, 0.35, 2); },
  fern(b) { for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283 + b.r() * 0.3; b.blade(0, 0, a, 0.75, 0.95, 0.11, 0, 4); } },
  'meadow-forb'(b) { rosette(b, 6, 0.25, 0.05, 0.8, 1.2); for (let i = 0; i < 4; i++) { const [x, y, z] = stemTo(b, b.r() * 6.28, b.r() * 0.25, 0.75 + b.r() * 0.25); nodeLeaves(b, x, y, z, 2, 0.1); b.blob(x, y, z, 0.045, 1, 1.2); } },
  shrub(b) { for (let i = 0; i < 4; i++) b.stem(0, 0, 0, (b.r() - 0.5) * 0.3, 0.4, (b.r() - 0.5) * 0.3, 0.02, 0); for (let i = 0; i < 34; i++) { const u = b.r(), v = b.r() * 6.283, rr = 0.36 * Math.sqrt(u); b.blob(Math.cos(v) * rr, 0.42 + (1 - u) * 0.38 + (b.r() - 0.5) * 0.1, Math.sin(v) * rr, 0.11, i % 7 === 0 ? 0.6 : 0, 0.8); } },
  'shrub-vase'(b) { for (let i = 0; i < 5; i++) { const a = b.r() * 6.28; b.stem(0, 0, 0, Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.3, 0.02, 0); } for (let i = 0; i < 32; i++) { const u = b.r(), v = b.r() * 6.283, rr = 0.15 + 0.3 * Math.sqrt(u); b.blob(Math.cos(v) * rr, 0.55 + (1 - u) * 0.38, Math.sin(v) * rr, 0.11, i % 8 === 0 ? 0.6 : 0, 0.8); } },
};
FORMS.tree = (b) => { b.stem(0, 0, 0, 0, 0.55, 0, 0.03, 0); b.stem(0, 0.3, 0, 0.14, 0.62, 0.05, 0.018, 0); b.stem(0, 0.36, 0, -0.12, 0.6, -0.06, 0.016, 0); for (let i = 0; i < 46; i++) { const u = b.r(), v = b.r() * 6.283, rr = 0.42 * Math.sqrt(u); const x = Math.cos(v) * rr, z = Math.sin(v) * rr; const y = 0.58 + (1 - u) * 0.3 + (b.r() - 0.5) * 0.12; b.blob(x, y, z, 0.1 + b.r() * 0.05, 0, 0.85); } };
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
  shrubby: (b) => FAR.forb(b, 'spike'), bulb: (b) => FAR.bulb(b), fern: (b) => FAR.grass(b), 'meadow-forb': (b) => FAR.forb(b, 'globe'),
  shrub: (b) => FAR.woody(b), 'shrub-vase': (b) => FAR.woody(b), tree: (b) => FAR.woody(b), 'tree-small': (b) => FAR.woody(b), 'tree-multistem': (b) => FAR.woody(b),
};

const BODY = new Set(['daisy', 'daisy-drooping', 'spike', 'spike-airy', 'spike-candelabra', 'spike-tall', 'plume', 'globe', 'globe-small',
  'umbel', 'umbel-tall', 'cloud-tall', 'saucer', 'dome', 'whorl', 'whorl-tall', 'cup', 'meadow-forb']);
function body(b) { for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + b.r(); b.blob(Math.cos(a) * 0.16, 0.2 + b.r() * 0.12, Math.sin(a) * 0.16, 0.2, 0, 0.75); } }

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
