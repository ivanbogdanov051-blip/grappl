import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash2, fbm, vnoise, smoothstep, clamp } from './noise.js';
import { makeCharacter, makeTextSprite, makeHookHead } from './models.js';
import { applyDetail, applyWind, HOLES, MAX_HOLES } from './realism.js';

export const CHUNK = 240;
export const SEED = 424242;
export const SPAWN = new THREE.Vector3(0, 40, 0);
export const SAFE_RADIUS = 72;
export const KILL_Y = -235;
export const G = 26;
const TAU = Math.PI * 2;

export function inSafeZone(p) {
  return p.x * p.x + p.z * p.z < SAFE_RADIUS * SAFE_RADIUS && p.y > SPAWN.y - 30 && p.y < SPAWN.y + 90;
}

const ck = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// ---------------------------------------------------------------- Island
export class Island {
  constructor(id, x, y, z, R, r, opt = {}) {
    this.id = id; this.x = x; this.y = y; this.z = z; this.R = R;
    this.kind = opt.kind || 'island';
    this.ph = [r() * TAU, r() * TAU, r() * TAU];
    const irr = opt.round ? 0.35 : 1;
    this.am = [0.11 * irr, 0.07 * irr, 0.035 * irr];
    this.hillAmp = opt.flat ? R * 0.012 : R * (0.05 + r() * 0.09);
    this.edgeDrop = 1.2 + r() * 2;
    this.depth = R * (0.75 + r() * 0.55) + 6;
    this.ns = Math.floor(r() * 1e6);
    this.lip = y - this.edgeDrop;
    this.maxR = R * (1 + this.am[0] + this.am[1] + this.am[2]) + 0.5;
    this.lake = null;
    this.fall = null;
    if (R > 26 && !opt.noLake && r() < 0.45) {
      const a = r() * TAU, d = r() * 0.3 * R;
      this.lake = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, r: R * (0.16 + r() * 0.12), level: y - 0.4 };
      if (r() < 0.55) {
        const L = this.lake;
        const fa = (d > 1 ? a : r() * TAU) + (r() - 0.5) * 0.7;
        const er = this.edgeR(fa);
        const x1 = x + Math.cos(fa) * (er + 4), z1 = z + Math.sin(fa) * (er + 4);
        this.fall = { a: fa, x0: L.x, z0: L.z, x1, z1, dx: x1 - L.x, dz: z1 - L.z, w: 2.2 + r() * 1.6 };
      }
    }
    this.trees = []; this.boxes = []; this.decoBoxes = []; this.deco = [];
    this.rocks = []; this.bushes = []; this.coins = []; this.shop = null; this.holes = [];
    this.yTop = y + this.hillAmp + 1;
    this.yBot = this.lip - this.depth * 1.25 - 4;
  }
  edgeR(a) {
    const p = this.ph, m = this.am;
    return this.R * (1 + m[0] * Math.sin(3 * a + p[0]) + m[1] * Math.sin(5 * a + p[1]) + m[2] * Math.sin(9 * a + p[2]));
  }
  hills(x, z) { return (fbm(x * 0.022, z * 0.022, 3, this.ns) * 0.5 + 0.5) * this.hillAmp; }
  topAt(x, z, t) {
    let h = this.y + this.hills(x, z) * (1 - t * t * t * t);
    const L = this.lake;
    if (L) {
      const ld = Math.hypot(x - L.x, z - L.z) / L.r;
      if (ld < 1) { const m = smoothstep(1, 0.5, ld); h += (L.level - 2.2 - h) * m; }
      const F = this.fall;
      if (F) {
        const px = x - F.x0, pz = z - F.z0;
        const u = clamp((px * F.dx + pz * F.dz) / (F.dx * F.dx + F.dz * F.dz), 0, 1);
        const qx = px - F.dx * u, qz = pz - F.dz * u;
        const dd = Math.sqrt(qx * qx + qz * qz);
        if (dd < F.w) { const m = smoothstep(F.w, F.w * 0.35, dd); h += (L.level - 1.1 - h) * m; }
      }
    }
    return h - smoothstep(0.8, 1, t) * this.edgeDrop;
  }
  bottomAt(x, z, t, a) {
    const p = this.ph;
    const shape = 0.78 + 0.22 * Math.sin(4 * a + p[1]) * Math.cos(2 * a + p[2]);
    const jag = vnoise(x * 0.12, z * 0.12, this.ns + 7) * 0.18;
    return this.lip - this.depth * Math.pow(1 - t, 0.75) * (shape + jag * (1 - t)) - (1 - t) * 1.5;
  }
  sample(x, z) {
    const dx = x - this.x, dz = z - this.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > this.maxR * this.maxR) return null;
    const a = Math.atan2(dz, dx);
    const er = this.edgeR(a);
    const d = Math.sqrt(d2);
    const t = d / er;
    if (t > 1) return null;
    const s = this._s || (this._s = {});
    s.t = t; s.a = a; s.er = er; s.d = d;
    s.top = this.topAt(x, z, t);
    s.bottom = this.bottomAt(x, z, t, a);
    // dug holes: the ground inside the lower half of each hole sphere is gone
    const H = this.holes;
    for (let i = 0; i < H.length; i++) {
      const h = H[i], dx = x - h.x, dz = z - h.z, q = h.r * h.r - dx * dx - dz * dz;
      if (q <= 0) continue;
      const lo = h.y - Math.sqrt(q);
      if (s.top > lo && s.top <= h.y + 0.02) s.top = lo;
    }
    if (H.length && s.top <= s.bottom + 0.15) return null; // dug right through
    return s;
  }
  pointAt(a, t, out = new THREE.Vector3()) {
    const er = this.edgeR(a);
    const x = this.x + Math.cos(a) * er * t, z = this.z + Math.sin(a) * er * t;
    return out.set(x, this.topAt(x, z, t), z);
  }
}

// ---------------------------------------------------------------- Generation
const STONES = [0x8f8a82, 0x9b968d, 0x7f7b75, 0xa39d92];
const stone = (r) => STONES[Math.floor(r() * STONES.length)];
const WOOD = 0x7a5634, PLASTER = 0xd3c6aa, ROOF = 0x8e3b2b;
const DARKWOOD = 0x4f3522, CRATE = 0xa47a45, SANDSTONE = 0xb9a77f, SLATE = 0x3b4a6b, BARNRED = 0x8e2f24, HAY = 0xd6b65a;
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
// surface pattern drawn by the structure shader: 0 plain, 1 stone blocks, 2 wood planks, 3 roof shingles
const STONEY = new Set([...STONES, 0x8f8b83, 0xb3a891, SANDSTONE]);
const WOODY = new Set([WOOD, DARKWOOD, CRATE, BARNRED, 0x8d6b48, 0x6b3a2a]);
export const surfOf = (c) => (STONEY.has(c) ? 1 : WOODY.has(c) ? 2 : 0);

function addBox(I, x, y, z, sx, sy, sz, color, solid = true, surf) {
  const b = { x, y: y + sy / 2, z, sx, sy, sz, color, surf: surf ?? surfOf(color) };
  (solid ? I.boxes : I.decoBoxes).push(b);
  return b;
}
function groundMin(I, x, z, hw, hd) {
  let m = Infinity;
  for (const [ox, oz] of [[0, 0], [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    const s = I.sample(x + ox, z + oz);
    m = Math.min(m, s ? s.top : I.lip);
  }
  return m;
}
const wet = (I, x, z, pad) => {
  if (!I.lake) return false;
  const s = I.sample(x, z);
  if (!s) return true;
  return Math.hypot(x - I.lake.x, z - I.lake.z) < I.lake.r + pad || s.top < I.lake.level + 0.6;
};

function buildSpawn(I) {
  const base = groundMin(I, I.x, I.z, 13, 13) - 0.4;
  addBox(I, I.x, base, I.z, 26, 0.8, 26, 0xb3a891);
  const top = base + 0.8;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const px = I.x + sx * 11, pz = I.z + sz * 11;
    addBox(I, px, top, pz, 1.6, 4.5, 1.6, 0xc9ced6);
    I.deco.push({ type: 'crystal', x: px, y: top + 5.8, z: pz, s: 0.8 });
  }
  I.spawnTop = top;
}
function buildRuins(I, r, x, z) {
  const base = groundMin(I, x, z, 7, 7) - 0.3;
  addBox(I, x, base, z, 15, 0.6, 15, 0x8f8b83);
  const n = 8, rad = 6.2;
  for (let i = 0; i < n; i++) {
    if (r() < 0.2) continue;
    const a = (i / n) * TAU;
    addBox(I, x + Math.cos(a) * rad, base + 0.6, z + Math.sin(a) * rad, 1.3, 2 + r() * 7, 1.3, stone(r));
  }
  for (let i = 0; i < 3; i++) {
    const a = r() * TAU, d = 3 + r() * 7;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const gy = groundMin(I, px, pz, 1, 1);
    addBox(I, px, gy - 0.2, pz, 1 + r() * 2.5, 0.8 + r(), 1 + r() * 1.5, stone(r));
  }
  I.coins.push({ x, y: base + 2, z });
}
function buildHouse(I, r, x, z, size = 8) {
  const w = size, d = size, h = size * 0.5, th = 0.5;
  const base = groundMin(I, x, z, w / 2, d / 2) - 0.2;
  const wall = r() < 0.5 ? PLASTER : WOOD;
  addBox(I, x, base, z, w + 0.6, 0.4, d + 0.6, stone(r));
  const fy = base + 0.4;
  addBox(I, x, fy, z - d / 2 + th / 2, w, h, th, wall);
  addBox(I, x - w / 2 + th / 2, fy, z, th, h, d, wall);
  addBox(I, x + w / 2 - th / 2, fy, z, th, h, d, wall);
  const seg = (w - 2) / 2;
  addBox(I, x - w / 2 + seg / 2, fy, z + d / 2 - th / 2, seg, h, th, wall);
  addBox(I, x + w / 2 - seg / 2, fy, z + d / 2 - th / 2, seg, h, th, wall);
  addBox(I, x, fy + 2.8, z + d / 2 - th / 2, 2, h - 2.8, th, wall);
  addBox(I, x, fy + h, z, w + 1, 0.3, d + 1, 0x6b3a2a);
  I.deco.push({ type: 'roof', x, y: fy + h + 0.3, z, r: (w + 1) * 0.72, h: 3.2, color: ROOF });
  addBox(I, x + w / 4, fy + h, z - d / 4, 0.9, 4.2, 0.9, stone(r), false);
  I.coins.push({ x, y: fy + 1, z });
}
function buildTower(I, r, x, z) {
  const s = 5, h = 14 + r() * 12;
  const base = groundMin(I, x, z, s / 2, s / 2) - 0.3;
  const c = stone(r);
  addBox(I, x, base, z, s, h, s, c);
  const top = base + h;
  addBox(I, x, top, z, 8, 0.8, 8, c);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) addBox(I, x + sx * 3.5, top + 0.8, z + sz * 3.5, 1, 1.2, 1, c);
  for (let i = 0; i < 3; i++) I.coins.push({ x: x + (i - 1) * 1.8, y: top + 2.1, z });
}
function buildArch(I, r, x, z) {
  const alongX = r() < 0.5, c = stone(r);
  const base = groundMin(I, x, z, 6, 6) - 0.3;
  const h = 7 + r() * 4;
  const ox = alongX ? 5 : 0, oz = alongX ? 0 : 5;
  addBox(I, x - ox, base, z - oz, 2, h, 2, c);
  addBox(I, x + ox, base, z + oz, 2, h, 2, c);
  addBox(I, x, base + h, z, alongX ? 12 : 2, 2, alongX ? 2 : 12, c);
  I.coins.push({ x, y: base + h + 3, z });
}
function buildShop(I, r, x, z) {
  // about 1 in 3 shops is a purple PASSIVE SHOP and about 1 in 6 a rare black-and-yellow HOOK SHOP
  // (decided from its position so every player gets the same world)
  const hv = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
  const passive = hv < 0.34, hook = !passive && hv < 0.52;
  const n0 = I.boxes.length;
  const base = groundMin(I, x, z, 4.5, 3.5) - 0.2;
  addBox(I, x, base, z, 9, 0.4, 7, 0x8d6b48);
  const fy = base + 0.4;
  addBox(I, x, fy, z + 1.2, 5, 1.1, 1.2, WOOD);
  for (const [px, pz] of [[-2.6, -1.6], [2.6, -1.6], [-2.6, 1.9], [2.6, 1.9]]) addBox(I, x + px, fy, z + pz, 0.3, 3.2, 0.3, WOOD);
  addBox(I, x, fy + 3.2, z + 0.15, 6, 0.25, 4.2, passive ? 0x7a3cd2 : hook ? 0xf2c230 : 0xd23c3c);
  for (let i = -2; i <= 2; i += 2) addBox(I, x + i * 1.0, fy + 3.45, z + 0.15, 0.8, 0.05, 4.2, hook ? 0x161616 : 0xf4f0e6, false);
  addBox(I, x, fy, z - 2.4, 5, 2.4, 0.4, WOOD);
  for (let i = n0; i < I.boxes.length; i++) I.boxes[i].noGrab = true;
  I.shop = { x, y: fy, z, I, passive, hook, type: passive ? 'passive' : hook ? 'hook' : 'normal' };
}

// ---- more buildings
function buildCastle(I, r, x, z) {
  const S = 20, th = 1.2, h = 6, c = stone(r);
  const base = groundMin(I, x, z, S / 2 + 1, S / 2 + 1) - 0.4;
  addBox(I, x, base, z, S + 3, 0.8, S + 3, 0x8f8b83);
  const fy = base + 0.8;
  addBox(I, x, fy, z - S / 2, S, h, th, c);
  addBox(I, x, fy, z + S / 2, S, h, th, c);
  addBox(I, x + S / 2, fy, z, th, h, S, c);
  const seg = (S - 4) / 2;
  addBox(I, x - S / 2, fy, z - S / 2 + seg / 2, th, h, seg, c);
  addBox(I, x - S / 2, fy, z + S / 2 - seg / 2, th, h, seg, c);
  addBox(I, x - S / 2, fy + 4, z, th, h - 4, 4, c);
  for (let i = -S / 2 + 2.6; i <= S / 2 - 2.6; i += 2.4) {
    addBox(I, x + i, fy + h, z - S / 2, 1, 0.9, th, c);
    addBox(I, x + i, fy + h, z + S / 2, 1, 0.9, th, c);
    addBox(I, x + S / 2, fy + h, z + i, th, 0.9, 1, c);
    addBox(I, x - S / 2, fy + h, z + i, th, 0.9, 1, c);
  }
  for (const [sx, sz] of CORNERS) {
    const tx = x + (sx * S) / 2, tz = z + (sz * S) / 2;
    addBox(I, tx, fy, tz, 3.6, h + 4, 3.6, c);
    I.deco.push({ type: 'roof', x: tx, y: fy + h + 4, z: tz, r: 3.1, h: 3.4, color: SLATE });
  }
  addBox(I, x + 3.5, fy, z + 3.5, 6, 10, 6, c);
  addBox(I, x + 3.5, fy + 10, z + 3.5, 7, 0.5, 7, c);
  I.deco.push({ type: 'roof', x: x + 3.5, y: fy + 10.5, z: z + 3.5, r: 5, h: 4.5, color: SLATE });
  for (let i = 0; i < 3; i++) I.coins.push({ x: x - 5 + i * 2, y: fy + 1, z: z - 5 });
  I.coins.push({ x, y: fy + h + 1.4, z: z - S / 2 }, { x: x + S / 2, y: fy + h + 1.4, z });
}
function buildWindmill(I, r, x, z) {
  const base = groundMin(I, x, z, 2.6, 2.6) - 0.3, h = 11, a = Math.floor(r() * 4) * (Math.PI / 2);
  addBox(I, x, base, z, 5, h, 5, PLASTER);
  addBox(I, x, base + h, z, 5.6, 0.4, 5.6, WOOD);
  I.deco.push({ type: 'roof', x, y: base + h + 0.4, z, r: 4.2, h: 4, color: ROOF });
  const fx = Math.sin(a), fz = Math.cos(a);
  addBox(I, x + fx * 2.55, base, z + fz * 2.55, Math.abs(fz) * 1.4 + 0.12, 2.4, Math.abs(fx) * 1.4 + 0.12, DARKWOOD, false);
  I.deco.push({ type: 'blades', x: x + fx * 2.85, y: base + h - 1.6, z: z + fz * 2.85, a, r: 6.5 });
  I.coins.push({ x: x + fx * 4.5, y: base + 1.4, z: z + fz * 4.5 });
}
function buildLighthouse(I, r, x, z) {
  const base = groundMin(I, x, z, 3, 3) - 0.3;
  addBox(I, x, base, z, 6, 0.6, 6, stone(r));
  let y = base + 0.6;
  for (let i = 0; i < 7; i++) { const w = 4.2 - i * 0.2; addBox(I, x, y, z, w, 2.6, w, i % 2 ? 0xc8342a : 0xece6da, true, 1); y += 2.6; }
  addBox(I, x, y, z, 4.8, 0.4, 4.8, 0x34373b);
  for (const [sx, sz] of CORNERS) addBox(I, x + sx * 1.3, y + 0.4, z + sz * 1.3, 0.2, 2.4, 0.2, 0x34373b);
  addBox(I, x, y + 2.8, z, 3.4, 0.4, 3.4, 0x34373b);
  I.deco.push({ type: 'lamp', x, y: y + 1.5, z });
  I.deco.push({ type: 'roof', x, y: y + 3.2, z, r: 2.5, h: 2, color: 0xc8342a });
  I.coins.push({ x: x + 2.1, y: y + 1.6, z }, { x: x - 2.1, y: y + 1.6, z });
}
function buildWatchtower(I, r, x, z) {
  const base = groundMin(I, x, z, 2, 2) - 0.2, h = 7 + r() * 3;
  for (const [sx, sz] of CORNERS) addBox(I, x + sx * 1.6, base, z + sz * 1.6, 0.4, h, 0.4, DARKWOOD);
  addBox(I, x, base + h, z, 4.4, 0.3, 4.4, WOOD);
  const top = base + h + 0.3;
  addBox(I, x, top, z - 2.1, 4.4, 1, 0.15, WOOD);
  addBox(I, x, top, z + 2.1, 4.4, 1, 0.15, WOOD);
  addBox(I, x - 2.1, top, z, 0.15, 1, 4.4, WOOD);
  for (let k = 0.4; k < h; k += 0.7) addBox(I, x + 2.35, base + k, z, 0.12, 0.12, 1.1, DARKWOOD, false);
  for (const sz of [-0.55, 0.55]) addBox(I, x + 2.35, base, z + sz, 0.12, h + 1, 0.12, DARKWOOD, false);
  for (const [sx, sz] of CORNERS) addBox(I, x + sx * 2, top, z + sz * 2, 0.2, 2.4, 0.2, DARKWOOD);
  addBox(I, x, top + 2.4, z, 5, 0.25, 5, WOOD);
  I.deco.push({ type: 'roof', x, y: top + 2.65, z, r: 3.7, h: 2.2, color: ROOF });
  I.coins.push({ x, y: top + 1, z });
}
function buildTemple(I, r, x, z) {
  const base = groundMin(I, x, z, 8, 9) - 0.4, c = SANDSTONE;
  let y = base, w = 16;
  for (let i = 0; i < 4; i++) { addBox(I, x, y, z, w, 2, w, c); y += 2; w -= 3.6; }
  for (let k = 0; k < 16; k++) addBox(I, x, base, z + 8.4 - k * 0.4, 2.4, (k + 1) * 0.5, 0.4, c);
  const ty = base + 8;
  for (const [sx, sz] of CORNERS) addBox(I, x + sx * 1.8, ty, z + sz * 1.8, 0.6, 3, 0.6, c);
  addBox(I, x, ty + 3, z, 4.6, 0.5, 4.6, c);
  I.deco.push({ type: 'crystal', x, y: ty + 1.7, z, s: 0.6 });
  for (let i = -1; i <= 1; i++) I.coins.push({ x: x + i * 1.1, y: ty + 1, z: z + 1 });
}
function buildCrates(I, r, x, z) {
  const n = 4 + Math.floor(r() * 5);
  let top = 0;
  for (let i = 0; i < n; i++) {
    const s = 1.1 + r() * 0.5, px = x + (r() - 0.5) * 4, pz = z + (r() - 0.5) * 4;
    let gy = groundMin(I, px, pz, s / 2, s / 2) - 0.05;
    for (const b of I.boxes) if (b.crate && Math.abs(b.x - px) < (b.sx + s) / 2 && Math.abs(b.z - pz) < (b.sz + s) / 2) gy = Math.max(gy, b.y + b.sy / 2);
    const b = addBox(I, px, gy, pz, s, s, s, CRATE);
    b.crate = true; top = Math.max(top, gy + s);
  }
  I.coins.push({ x, y: top + 1, z });
}
function buildStatue(I, r, x, z) {
  const base = groundMin(I, x, z, 2, 2) - 0.3, c = stone(r);
  addBox(I, x, base, z, 4, 2, 4, c);
  addBox(I, x, base + 2, z, 3.4, 0.4, 3.4, c);
  const y0 = base + 2.4, s = 3;
  addBox(I, x, y0, z, s, s, s, 0xbdb7a8, true, 0);
  for (const sx of [-0.65, 0.65]) {
    addBox(I, x + sx, y0 + 1.6, z - s / 2 - 0.04, 0.72, 0.9, 0.08, 0xf2efe8, false);
    addBox(I, x + sx, y0 + 1.7, z - s / 2 - 0.09, 0.34, 0.42, 0.06, 0x2a2a2a, false);
  }
  I.coins.push({ x, y: y0 + s + 1.2, z });
}
function buildVillage(I, r, x, z) {
  const n = r() < 0.5 ? 3 : 2;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + r() * 0.5; buildHouse(I, r, x + Math.cos(a) * 8.5, z + Math.sin(a) * 8.5, 6); }
  const base = groundMin(I, x, z, 1.3, 1.3) - 0.2, c = stone(r);
  addBox(I, x, base, z - 1.05, 2.4, 1, 0.3, c); addBox(I, x, base, z + 1.05, 2.4, 1, 0.3, c);
  addBox(I, x - 1.05, base, z, 0.3, 1, 1.8, c); addBox(I, x + 1.05, base, z, 0.3, 1, 1.8, c);
  for (const sx of [-1.05, 1.05]) addBox(I, x + sx, base + 1, z, 0.2, 1.8, 0.2, DARKWOOD);
  addBox(I, x, base + 2.8, z, 2.8, 0.2, 2.2, WOOD);
  I.deco.push({ type: 'roof', x, y: base + 3, z, r: 2.1, h: 1.2, color: ROOF });
  I.coins.push({ x, y: base + 0.6, z });
}
function buildBarn(I, r, x, z) {
  const w = 12, d = 9, h = 5.5, th = 0.5, c = BARNRED;
  const base = groundMin(I, x, z, w / 2, d / 2) - 0.2;
  addBox(I, x, base, z, w + 0.6, 0.4, d + 0.6, stone(r));
  const fy = base + 0.4;
  addBox(I, x, fy, z - d / 2 + th / 2, w, h, th, c);
  addBox(I, x - w / 2 + th / 2, fy, z, th, h, d, c);
  addBox(I, x + w / 2 - th / 2, fy, z, th, h, d, c);
  const seg = (w - 4.4) / 2;
  addBox(I, x - w / 2 + seg / 2, fy, z + d / 2 - th / 2, seg, h, th, c);
  addBox(I, x + w / 2 - seg / 2, fy, z + d / 2 - th / 2, seg, h, th, c);
  addBox(I, x, fy + 4, z + d / 2 - th / 2, 4.4, h - 4, th, c);
  addBox(I, x, fy + h, z, w + 1, 0.3, d + 1, 0x6b3a2a);
  I.deco.push({ type: 'roof', x, y: fy + h + 0.3, z, r: (w + 1) * 0.72, h: 3.6, color: 0x5a3326 });
  for (let i = 0; i < 3; i++) { const b = addBox(I, x - 3.5 + (i % 2) * 1.3, fy + (i === 2 ? 1.3 : 0), z - 2.6, 1.3, 1.3, 1.3, CRATE); b.crate = true; }
  addBox(I, x + 3, fy, z - 2.5, 2, 1.2, 1.4, HAY, true, 0);
  addBox(I, x + 3, fy + 1.2, z - 2.5, 2, 1.2, 1.4, HAY, true, 0);
  I.coins.push({ x, y: fy + 1, z }, { x: x + 3, y: fy + 3.2, z: z - 2.5 });
}
// [builder, weight, footprint radius, min island radius, near the edge?]
const BUILDS = [
  [buildRuins, 9, 9, 0], [buildHouse, 9, 7, 0], [buildTower, 8, 6, 0], [buildArch, 6, 7, 0],
  [buildCastle, 7, 15, 48], [buildWindmill, 7, 7, 22], [buildLighthouse, 6, 5, 24, true], [buildWatchtower, 8, 4, 0],
  [buildTemple, 5, 11, 38], [buildCrates, 8, 4, 0], [buildStatue, 6, 4, 0], [buildVillage, 5, 14, 44], [buildBarn, 6, 9, 30],
];

function populate(I, r) {
  const occ = [];
  const free = (x, z, rad) => occ.every((o) => (o.x - x) ** 2 + (o.z - z) ** 2 > (o.r + rad) ** 2);
  const R = I.R;
  const p = new THREE.Vector3();
  if (I.kind === 'spawn') {
    buildSpawn(I);
    occ.push({ x: I.x, z: I.z, r: 18 });
  } else if (I.kind !== 'rock') {
    if (R >= 46 && r() < 0.42) {
      for (let tries = 0; tries < 6; tries++) {
        I.pointAt(r() * TAU, 0.2 + r() * 0.3, p);
        if (wet(I, p.x, p.z, 8)) continue;
        buildShop(I, r, p.x, p.z);
        occ.push({ x: p.x, z: p.z, r: 7 });
        break;
      }
    }
    const nStruct = R > 70 ? 4 : R > 45 ? 3 : R > 24 ? (r() < 0.75 ? 2 : 1) : R > 13 ? (r() < 0.55 ? 1 : 0) : 0;
    for (let k = 0; k < nStruct; k++) {
      const ok = BUILDS.filter((B) => R >= B[3] && B[2] < R * 0.75);
      let roll = r() * ok.reduce((a, B) => a + B[1], 0), B = ok[0];
      for (const b of ok) { roll -= b[1]; if (roll < 0) { B = b; break; } }
      const fp = B[2], tMax = Math.max(0.05, 0.86 - fp / R);
      for (let tries = 0; tries < 7; tries++) {
        I.pointAt(r() * TAU, B[4] ? Math.max(0, tMax - 0.12) + r() * 0.12 : r() * tMax, p);
        if (!free(p.x, p.z, fp) || wet(I, p.x, p.z, fp)) continue;
        B[0](I, r, p.x, p.z);
        occ.push({ x: p.x, z: p.z, r: fp });
        break;
      }
    }
  }
  // trees
  const nTrees = I.kind === 'spawn' ? 26 : I.kind === 'rock' ? (r() < 0.35 ? 1 : 0) : Math.min(110, Math.floor(R * R * 0.009 * (0.35 + r() * 0.9)));
  for (let i = 0; i < nTrees; i++) {
    const a = r() * TAU;
    const t = I.kind === 'spawn' ? 0.6 + r() * 0.27 : I.kind === 'rock' ? r() * 0.4 : Math.sqrt(r()) * 0.86;
    I.pointAt(a, t, p);
    const h = I.kind === 'rock' ? 3 + r() * 3 : 6 + r() * 10;
    const pine = r() < 0.55;
    const c = r();
    if (!free(p.x, p.z, 1.5)) continue;
    if (I.lake && p.y < I.lake.level + 0.7) continue;
    I.trees.push({ x: p.x, y: p.y - 0.2, z: p.z, h, r: 0.22 + h * 0.028, fr: pine ? h * 0.28 : h * 0.32, pine, c });
  }
  // boulders
  const nRocks = I.kind === 'rock' ? 0 : Math.floor((R / 9) * r());
  for (let i = 0; i < nRocks; i++) {
    I.pointAt(r() * TAU, Math.sqrt(r()) * 0.85, p);
    const s = 0.6 + r() * 1.8, rot = r() * TAU;
    if (!free(p.x, p.z, s) || wet(I, p.x, p.z, 0)) continue;
    I.rocks.push({ x: p.x, y: p.y, z: p.z, s, rot });
  }
  // bushes (decoration only)
  const nB = I.kind === 'rock' ? 1 : Math.floor((R / 2.5) * r());
  for (let i = 0; i < nB; i++) {
    I.pointAt(r() * TAU, Math.sqrt(r()) * 0.88, p);
    const s = 0.5 + r() * 0.9;
    if (!free(p.x, p.z, 0.5) || wet(I, p.x, p.z, 0)) continue;
    I.bushes.push({ x: p.x, y: p.y + s * 0.3, z: p.z, s, c: r() });
  }
  // coins
  const nCoins = I.kind === 'spawn' ? 0 : I.kind === 'rock' ? (r() < 0.5 ? 1 : 0) : Math.min(12, 2 + Math.floor(R / 14));
  for (let i = 0; i < nCoins; i++) {
    I.pointAt(r() * TAU, Math.sqrt(r()) * 0.85, p);
    if (wet(I, p.x, p.z, 0)) continue;
    I.coins.push({ x: p.x, y: p.y + 1.3, z: p.z });
  }
}

function genChunk(cx, cz) {
  const r = rng(hash2(cx, cz, SEED));
  const ox = cx * CHUNK, oz = cz * CHUNK;
  const list = [];
  let n = 0;
  const mk = (x, y, z, R, opt) => {
    const I = new Island(`${cx}_${cz}_${n++}`, x, y, z, R, r, opt);
    list.push(I);
    return I;
  };
  const baseH = fbm(cx * 0.21 + 3.1, cz * 0.21 - 7.3, 3, SEED + 5) * 70 + 25;
  if (cx === 0 && cz === 0) {
    mk(0, SPAWN.y, 0, 56, { flat: true, noLake: true, round: true, kind: 'spawn' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + r() * 0.4, d = 78 + r() * 25;
      mk(Math.cos(a) * d, SPAWN.y - 15 + r() * 45, Math.sin(a) * d, 4 + r() * 6, { noLake: true, kind: 'rock' });
    }
  } else {
    const roll = r();
    if (roll < 0.2) {
      const R = 62 + r() * 33;
      const m = Math.max(0, CHUNK / 2 - R * 1.22);
      mk(ox + (r() * 2 - 1) * m, baseH + (r() - 0.5) * 50, oz + (r() * 2 - 1) * m, R, {});
    } else {
      const count = roll < 0.45 ? 2 : roll < 0.78 ? 3 : 4;
      const slots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = slots[i]; slots[i] = slots[j]; slots[j] = t;
      }
      for (let i = 0; i < count; i++) {
        const R = r() < 0.28 ? 32 + r() * 16 : 11 + r() * 18;
        const q = CHUNK / 4, m = Math.max(0, q - R * 1.22);
        mk(ox + slots[i][0] * q + (r() * 2 - 1) * m, baseH + (r() - 0.5) * 80, oz + slots[i][1] * q + (r() * 2 - 1) * m, R, {});
      }
    }
    const rocks = 4 + Math.floor(r() * 5);
    for (let i = 0; i < rocks; i++) {
      const x = ox + (r() - 0.5) * CHUNK * 0.9, z = oz + (r() - 0.5) * CHUNK * 0.9;
      const y = baseH + (r() - 0.5) * 100, R = 3 + r() * 6;
      let ok = true;
      for (const I of list) {
        if (Math.hypot(x - I.x, z - I.z) < I.maxR + R * 1.3 + 4 && y < I.y + 25 && y > I.yBot - 15) { ok = false; break; }
      }
      if (ok) mk(x, y, z, R, { noLake: true, kind: 'rock' });
    }
  }
  for (const I of list) populate(I, r);
  return list;
}

// ---------------------------------------------------------------- Mesh building
const col = (h) => new THREE.Color(h);
const GRASS1 = col(0x44752a), GRASS2 = col(0x7aa43e), DIRT = col(0x6e5136), SAND = col(0xc2b083);
const WETSAND = col(0x8c7b58), ROCK1 = col(0x6f655c), ROCK2 = col(0x4a4541), MOSS = col(0x5f7a45);

function topColor(I, x, y, z, t, out) {
  const n = vnoise(x * 0.07, z * 0.07, I.ns + 3) * 0.5 + 0.5;
  const n2 = vnoise(x * 0.31, z * 0.31, I.ns + 9) * 0.5 + 0.5;
  if (I.kind === 'rock') out.copy(ROCK1).lerp(MOSS, n * 0.8);
  else { out.copy(GRASS1).lerp(GRASS2, n); out.multiplyScalar(0.86 + n2 * 0.22); }
  out.lerp(DIRT, smoothstep(0.9, 0.99, t));
  if (I.lake && y < I.lake.level + 0.45) out.copy(y < I.lake.level - 0.6 ? WETSAND : SAND).multiplyScalar(0.9 + n2 * 0.15);
  const hr = (y - I.y) / (I.hillAmp + 0.01);
  if (hr > 0.82 && I.hillAmp > 4) out.lerp(ROCK1, Math.min(1, (hr - 0.82) * 3));
}
function bottomColor(I, x, y, z, out) {
  const f = clamp((I.lip - y) / I.depth, 0, 1);
  out.copy(DIRT).lerp(ROCK1, smoothstep(0.02, 0.25, f)).lerp(ROCK2, smoothstep(0.4, 1, f));
  const s = Math.sin(y * 0.7 + vnoise(x * 0.05, z * 0.05, I.ns) * 3) * 0.07;
  out.multiplyScalar(0.93 + s);
}

function islandGeometry(I) {
  const N = clamp(Math.round(I.R / 3), 4, 36), M = clamp(Math.round(I.R * 1.15), 14, 120);
  const pos = [], cols = [], idx = [];
  const c = new THREE.Color();
  const add = (x, y, z) => { pos.push(x, y, z); cols.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const cosA = [], sinA = [], ers = [], angs = [];
  for (let j = 0; j < M; j++) {
    const a = (j / M) * TAU;
    angs.push(a); cosA.push(Math.cos(a)); sinA.push(Math.sin(a)); ers.push(I.edgeR(a));
  }
  const top = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, row = [];
    if (i === 0) {
      const y = I.topAt(I.x, I.z, 0);
      topColor(I, I.x, y, I.z, 0, c);
      const v = add(I.x, y, I.z);
      for (let j = 0; j < M; j++) row.push(v);
    } else {
      for (let j = 0; j < M; j++) {
        const x = I.x + cosA[j] * ers[j] * t, z = I.z + sinA[j] * ers[j] * t;
        const y = I.topAt(x, z, t);
        topColor(I, x, y, z, t, c);
        row.push(add(x, y, z));
      }
    }
    top.push(row);
  }
  const bot = [top[N]];
  for (let k = 1; k <= N; k++) {
    const t = 1 - k / N, row = [];
    if (k === N) {
      const y = I.bottomAt(I.x, I.z, 0, 0);
      bottomColor(I, I.x, y, I.z, c);
      const v = add(I.x, y, I.z);
      for (let j = 0; j < M; j++) row.push(v);
    } else {
      for (let j = 0; j < M; j++) {
        const x = I.x + cosA[j] * ers[j] * t, z = I.z + sinA[j] * ers[j] * t;
        const y = I.bottomAt(x, z, t, angs[j]);
        bottomColor(I, x, y, z, c);
        row.push(add(x, y, z));
      }
    }
    bot.push(row);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M;
    const a = top[i][j], b = top[i][j1], cc = top[i + 1][j], d = top[i + 1][j1];
    idx.push(a, d, cc);
    if (i > 0) idx.push(a, b, d);
  }
  for (let k = 0; k < N; k++) for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M;
    const o = bot[k][j], o1 = bot[k][j1], n = bot[k + 1][j], n1 = bot[k + 1][j1];
    idx.push(n, o, o1);
    if (k + 1 < N) idx.push(n, o1, n1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // steep slopes show bare rock instead of grass (only the top surface: the first top-row vertices)
  const nTop = 1 + (N - 1) * M + M, nr = g.attributes.normal, ca = g.attributes.color;
  for (let i = 0; i < nTop; i++) {
    const k = smoothstep(0.9, 0.62, nr.getY(i)) * (I.kind === 'rock' ? 0.5 : 0.85);
    if (k <= 0) continue;
    c.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)).lerp(ROCK1, k);
    ca.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

const _bc = new THREE.Color();
function colorize(g, color, tint, aoBottom) {
  g.deleteAttribute('uv');
  _bc.set(color);
  const p = g.attributes.position;
  const arr = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const ao = aoBottom && p.getY(i) < 0 ? 0.78 : 1;
    arr[i * 3] = _bc.r * tint * ao; arr[i * 3 + 1] = _bc.g * tint * ao; arr[i * 3 + 2] = _bc.b * tint * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const setSurf = (g, v) => g.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
function boxGeo(b) {
  const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
  const tint = 0.9 + (Math.sin(b.x * 12.9898 + b.z * 78.233 + b.y * 3.7) * 0.5 + 0.5) * 0.18;
  colorize(g, b.color, tint, true);
  setSurf(g, b.surf ?? surfOf(b.color));
  g.translate(b.x, b.y, b.z);
  return g;
}
function roofGeo(d) {
  const g = new THREE.ConeGeometry(d.r, d.h, 4, 1);
  g.rotateY(Math.PI / 4);
  colorize(g, d.color, 1, false);
  setSurf(g, 3);
  g.translate(d.x, d.y + d.h / 2, d.z);
  return g;
}
// A loose piece of the world (dug-out ground, a chunk of wall, a boulder, a log), centred on the origin.
export function pieceGeometry(P) {
  const g = new THREE.BoxGeometry(P.sx, P.sy, P.sz);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count, arr = new Float32Array(n * 3), c = new THREE.Color(P.color);
  const top = P.look === 'dirt' ? new THREE.Color().copy(GRASS1).lerp(GRASS2, 0.4) : c;
  for (let i = 0; i < n; i++) {
    const face = Math.floor(i / 4); // px nx py ny pz nz
    const col = face === 2 ? top : c, k = face === 3 ? 0.7 : 1;
    arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  setSurf(g, P.surf || 0);
  return g;
}

function waterNormalTex() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const hgt = (x, y) => {
    const u = (x / S) * TAU, v = (y / S) * TAU;
    return Math.sin(u * 3 + Math.sin(v * 2)) + Math.sin(v * 5 + u * 2) * 0.6 + Math.sin((u + v) * 7) * 0.3 + Math.sin((u - 2 * v) * 4) * 0.4;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = hgt(x + 1, y) - hgt(x - 1, y), dy = hgt(x, y + 1) - hgt(x, y - 1);
    let nx = -dx * 1.5, ny = -dy * 1.5, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * S + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}
function fallTex() {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(190,225,255,0.55)';
  ctx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 64, y = Math.random() * 256, l = 20 + Math.random() * 80;
    const g = ctx.createLinearGradient(0, y, 0, y + l);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 1 + Math.random() * 3, l);
    ctx.fillRect(x, y - 256, 1 + Math.random() * 3, l);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeMaterials(uTime) {
  const coin = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.9, roughness: 0.25, emissive: 0x5a3a00, emissiveIntensity: 0.7 });
  coin.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { float ca = cos(uTime*2.5), sa = sin(uTime*2.5); objectNormal.xz = mat2(ca,-sa,sa,ca)*objectNormal.xz; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ca = cos(uTime*2.5), sa = sin(uTime*2.5); transformed.xz = mat2(ca,-sa,sa,ca)*transformed.xz; transformed.y += sin(uTime*2.0)*0.15; }`);
  };
  return {
    terrain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5b3e27, roughness: 1 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x7c7770, roughness: 0.95, flatShading: true }),
    bush: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    struct: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    bowl: new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 1, side: THREE.DoubleSide }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffd76a, emissiveIntensity: 2.2, roughness: 0.3 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    sail: new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.9, side: THREE.DoubleSide }),
    blade: new THREE.MeshStandardMaterial({ color: 0x5b3e27, roughness: 0.9 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2b6f8f, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.85, normalMap: waterNormalTex(), normalScale: new THREE.Vector2(0.5, 0.5) }),
    fall: new THREE.MeshBasicMaterial({ map: fallTex(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    coin,
    crystal: new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2299ff, emissiveIntensity: 1.6, roughness: 0.2 }),
  };
}
function rockGeometry() {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + vnoise(x * 2.1 + 7, z * 2.1 + y * 1.7, 99) * 0.22 + vnoise(x * 5 + 3, y * 5 - z, 77) * 0.07;
    p.setXYZ(i, x * k, y * k * 0.8, z * k);
  }
  g.computeVertexNormals();
  return g;
}
function makeGeos() {
  return {
    trunk: new THREE.CylinderGeometry(0.7, 1, 1, 7).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    blob: new THREE.IcosahedronGeometry(1, 1),
    rock: rockGeometry(),
    bush: new THREE.IcosahedronGeometry(1, 0),
    coin: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18).rotateX(Math.PI / 2),
    crystal: new THREE.OctahedronGeometry(1, 0),
    bowl: new THREE.SphereGeometry(1, 22, 8, 0, TAU, Math.PI / 2, Math.PI / 2),
    beam: new THREE.ConeGeometry(2.2, 40, 16, 1, true).rotateX(-Math.PI / 2).translate(0, 0, 20),
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _e = new THREE.Euler(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const boxGeoUnit = new THREE.BoxGeometry(1, 1, 1);

// ray helpers (d normalized) -> distance or -1
function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = -b - Math.sqrt(disc);
  return s >= 0 ? s : -1;
}
function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return -1;
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const s = (-b - Math.sqrt(disc)) / a;
  if (s < 0) return -1;
  const y = o.y + d.y * s;
  return y < y0 || y > y1 ? -1 : s;
}
function rayBox(o, d, b) {
  let tmin = -Infinity, tmax = Infinity;
  const ax = [[o.x, d.x, b.x, b.sx], [o.y, d.y, b.y, b.sy], [o.z, d.z, b.z, b.sz]];
  for (let i = 0; i < 3; i++) {
    const [oo, dd, c, s] = ax[i];
    const lo = c - s / 2, hi = c + s / 2;
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return -1; continue; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin >= 0 ? tmin : -1;
}

function boxPush(e, b, h, r, wasGround, I) {
  const hx = b.sx / 2 + r, hz = b.sz / 2 + r;
  const dx = e.pos.x - b.x, dz = e.pos.z - b.z;
  if (dx <= -hx || dx >= hx || dz <= -hz || dz >= hz) return;
  const topY = b.y + b.sy / 2, botY = b.y - b.sy / 2 - h;
  const snap = wasGround && e.vel.y <= 0.1 ? 0.3 : 0;
  if (e.pos.y >= topY + snap || e.pos.y <= botY) return;
  const up = topY - e.pos.y;
  const stepMax = e.climbT > 0 ? 1.6 : wasGround ? 0.65 : 0.4;
  const pxm = dx + hx, pxp = hx - dx, pzm = dz + hz, pzp = hz - dz, down = e.pos.y - botY;
  const m = Math.min(pxm, pxp, pzm, pzp, down, up);
  if (up <= stepMax || m === up) {
    e.pos.y = topY; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; e.ground = I;
  } else if (m === down) {
    e.pos.y = botY - 0.01; if (e.vel.y > 0) e.vel.y = 0;
  } else {
    let nx = 0, nz = 0;
    if (m === pxm) { e.pos.x -= pxm; nx = -1; } else if (m === pxp) { e.pos.x += pxp; nx = 1; } else if (m === pzm) { e.pos.z -= pzm; nz = -1; } else { e.pos.z += pzp; nz = 1; }
    const vn = e.vel.x * nx + e.vel.z * nz;
    if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
    e.hitWall = true; e.wallN.x = nx; e.wallN.z = nz; e.wallGap = up;
  }
}
// box minus a cut-out box -> up to 6 leftover boxes (tiny slivers are dropped) plus the cut piece
function subtractBox(b, cx0, cx1, cy0, cy1, cz0, cz1) {
  const bx0 = b.x - b.sx / 2, bx1 = b.x + b.sx / 2, by0 = b.y - b.sy / 2, by1 = b.y + b.sy / 2, bz0 = b.z - b.sz / 2, bz1 = b.z + b.sz / 2;
  const ix0 = Math.max(bx0, cx0), ix1 = Math.min(bx1, cx1), iy0 = Math.max(by0, cy0), iy1 = Math.min(by1, cy1), iz0 = Math.max(bz0, cz0), iz1 = Math.min(bz1, cz1);
  if (ix0 >= ix1 || iy0 >= iy1 || iz0 >= iz1) return null;
  const mk = (x0, x1, y0, y1, z0, z1) => ({ ...b, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: x1 - x0, sy: y1 - y0, sz: z1 - z0 });
  const rest = [];
  if (ix0 > bx0) rest.push(mk(bx0, ix0, by0, by1, bz0, bz1));
  if (ix1 < bx1) rest.push(mk(ix1, bx1, by0, by1, bz0, bz1));
  if (iy0 > by0) rest.push(mk(ix0, ix1, by0, iy0, bz0, bz1));
  if (iy1 < by1) rest.push(mk(ix0, ix1, iy1, by1, bz0, bz1));
  if (iz0 > bz0) rest.push(mk(ix0, ix1, iy0, iy1, bz0, iz0));
  if (iz1 < bz1) rest.push(mk(ix0, ix1, iy0, iy1, iz1, bz1));
  return { rest: rest.filter((q) => Math.min(q.sx, q.sy, q.sz) > 0.12), piece: mk(ix0, ix1, iy0, iy1, iz0, iz1) };
}
const near = (a, b) => Math.abs(a - b) < 0.02;

// ---------------------------------------------------------------- World
export class World {
  constructor(scene, opts) {
    this.scene = scene;
    this.loadR = opts.loadRadius;
    this.shadows = opts.shadows;
    this.camera = null;
    this.data = new Map();
    this.built = new Map();
    this.queue = [];
    this.lastC = null;
    this.time = 0;
    this.uTime = { value: 0 };
    this.mats = makeMaterials(this.uTime);
    applyDetail(this.mats.terrain, 0.5, { holes: true, holeK: 0.985 });
    applyDetail(this.mats.struct, 0.35, { bricks: true });
    applyDetail(this.mats.bowl, 0.5, { holes: true, holeK: 0.96 });
    applyWind(this.mats.leaf, this.uTime, 0.035, 1.0);
    applyWind(this.mats.bush, this.uTime, 0.03, 1.0);
    this.geos = makeGeos();
    this._near = [];
    this._rc = [];
    this._hit = { point: new THREE.Vector3(), dist: 0, kind: 0 };
    this.holes = []; this.placed = []; this.holeT = 0;
    this.holeGroup = new THREE.Group(); scene.add(this.holeGroup);
    this.placedGroup = new THREE.Group(); scene.add(this.placedGroup);
  }

  getData(cx, cz) {
    const k = ck(cx, cz);
    let d = this.data.get(k);
    if (!d) { d = { cx, cz, k, islands: genChunk(cx, cz) }; this.data.set(k, d); }
    return d;
  }
  spawnTop() { return this.getData(0, 0).islands[0].spawnTop; }

  islandsNear(x, z, margin = 2) {
    const out = this._near;
    out.length = 0;
    const cx = Math.round(x / CHUNK), cz = Math.round(z / CHUNK);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const isl = this.getData(cx + dx, cz + dz).islands;
      for (let i = 0; i < isl.length; i++) {
        const I = isl[i];
        const ddx = x - I.x, ddz = z - I.z, rr = I.maxR + margin;
        if (ddx * ddx + ddz * ddz < rr * rr) out.push(I);
      }
    }
    return out;
  }
  islandsInBox(minx, minz, maxx, maxz, out = []) {
    out.length = 0;
    const ax = Math.round(minx / CHUNK), bx = Math.round(maxx / CHUNK);
    const az = Math.round(minz / CHUNK), bz = Math.round(maxz / CHUNK);
    for (let cx = ax; cx <= bx; cx++) for (let cz = az; cz <= bz; cz++) {
      for (const I of this.getData(cx, cz).islands) {
        const m = I.maxR;
        if (I.x + m >= minx && I.x - m <= maxx && I.z + m >= minz && I.z - m <= maxz) out.push(I);
      }
    }
    return out;
  }
  islandsInRadius(x, z, rad) {
    return this.islandsInBox(x - rad, z - rad, x + rad, z + rad, []).filter((I) => Math.hypot(I.x - x, I.z - z) < rad + I.maxR);
  }
  groundAt(x, yMax, z) {
    let best = null;
    for (const I of this.islandsNear(x, z, 0)) {
      const s = I.sample(x, z);
      if (s && s.top <= yMax && (best === null || s.top > best)) best = s.top;
    }
    return best;
  }
  islandUnder(p) {
    for (const I of this.islandsNear(p.x, p.z, 0)) {
      const s = I.sample(p.x, p.z);
      if (s && p.y >= s.top - 1.5 && p.y - s.top < 5) return I;
    }
    return null;
  }

  // -------- collision for an entity {pos (feet), vel, radius, height, onGround, climbT}
  collide(e) {
    const h = e.height, r = e.radius;
    const wasGround = e.onGround;
    e.onGround = false;
    e.inWater = false;
    e.ground = null;
    const isl = this.islandsNear(e.pos.x, e.pos.z, r + 2);
    for (let ii = 0; ii < isl.length; ii++) {
      const I = isl[ii];
      const s = I.sample(e.pos.x, e.pos.z);
      if (s) {
        const feet = e.pos.y, head = feet + h;
        const snap = wasGround && e.vel.y <= 0.1 ? 0.45 : 0.02;
        if (feet <= s.top + snap && head >= s.bottom) {
          const up = s.top - feet;
          const down = head - s.bottom;
          const side = (1 - s.t) * s.er + r;
          const stepMax = e.climbT > 0 ? 2.2 : wasGround ? 1.0 : 0.6;
          if (up <= stepMax || (up < side && up < down)) {
            e.pos.y = s.top;
            if (e.vel.y < 0) e.vel.y = 0;
            e.onGround = true;
            e.ground = I;
          } else if (down < side) {
            e.pos.y = s.bottom - h - 0.01;
            if (e.vel.y > 0) e.vel.y = 0;
          } else if (s.d > 1e-4) {
            const nx = (e.pos.x - I.x) / s.d, nz = (e.pos.z - I.z) / s.d;
            e.pos.x += nx * side; e.pos.z += nz * side;
            const vn = e.vel.x * nx + e.vel.z * nz;
            if (vn < 0) { e.vel.x -= vn * nx; e.vel.z -= vn * nz; }
            e.hitWall = true; e.wallN.x = nx; e.wallN.z = nz; e.wallGap = up;
          }
        }
        const L = I.lake;
        if (L && e.pos.y < L.level && e.pos.y > L.level - 4 && Math.hypot(e.pos.x - L.x, e.pos.z - L.z) < L.r) e.inWater = true;
      }
      // trees (trunks)
      for (const t of I.trees) {
        if (t.gone || e.pos.y > t.y + t.h * 0.7 || e.pos.y + h < t.y) continue;
        const dx = e.pos.x - t.x, dz = e.pos.z - t.z, rr = t.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.pos.x += dx * k; e.pos.z += dz * k; }
      }
      // boulders
      for (const b of I.rocks) {
        if (b.gone) continue;
        const top = b.y + b.s * 0.75;
        if (e.pos.y > top + 0.3 || e.pos.y + h < b.y - b.s) continue;
        const dx = e.pos.x - b.x, dz = e.pos.z - b.z, rr = b.s * 0.8 + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (top - e.pos.y <= (wasGround ? 0.9 : 0.5)) { e.pos.y = top; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; e.ground = I; }
        else if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.pos.x += dx * k; e.pos.z += dz * k; }
      }
      // boxes (structures)
      for (const b of I.boxes) boxPush(e, b, h, r, wasGround, I);
    }
    // blocks thrown around with the Ground Grabber
    for (const b of this.placed) boxPush(e, b, h, r, wasGround, b.I || e.ground);
  }

  solidAt(cands, x, y, z) {
    for (const I of cands) {
      if (y > I.yTop || y < I.yBot) continue;
      const s = I.sample(x, z);
      if (s && y <= s.top && y >= s.bottom) return true;
    }
    return false;
  }

  // Analytic raycast against terrain, trees, rocks and structures. Returns shared hit object or null.
  raycast(o, d, far) {
    const ex = o.x + d.x * far, ez = o.z + d.z * far;
    const cands = this.islandsInBox(Math.min(o.x, ex) - 1, Math.min(o.z, ez) - 1, Math.max(o.x, ex) + 1, Math.max(o.z, ez) + 1, this._rc);
    let best = far, kind = 0, obj = null, oI = null, type = null;
    for (const b of this.placed) {
      const s = rayBox(o, d, b);
      if (s >= 0 && s < best) { best = s; kind = 3; obj = b; oI = b.I; type = 'placed'; }
    }
    if (!cands.length && !kind) return null;
    let yMin = Infinity, yMax = -Infinity;
    for (const I of cands) {
      if (I.yBot < yMin) yMin = I.yBot;
      if (I.yTop + 30 > yMax) yMax = I.yTop + 30;
      for (const t of I.trees) {
        if (t.gone) continue;
        const fy = t.y + t.h * (t.pine ? 0.5 : 0.72), fr = t.fr * (t.pine ? 0.8 : 1);
        let s = raySphere(o, d, t.x, fy, t.z, fr);
        if (s >= 0 && s < best) { best = s; kind = 2; obj = t; oI = I; type = 'tree'; }
        s = rayCyl(o, d, t.x, t.z, t.r + 0.15, t.y, t.y + t.h * 0.75);
        if (s >= 0 && s < best) { best = s; kind = 2; obj = t; oI = I; type = 'tree'; }
      }
      for (const b of I.rocks) {
        if (b.gone) continue;
        const s = raySphere(o, d, b.x, b.y, b.z, b.s * 0.9);
        if (s >= 0 && s < best) { best = s; kind = 3; obj = b; oI = I; type = 'rock'; }
      }
      for (const b of I.boxes) {
        const s = rayBox(o, d, b);
        if (s >= 0 && s < best) { best = s; kind = 3; obj = b; oI = I; type = 'box'; }
      }
    }
    const step = 0.5;
    const y0 = o.y, y1 = o.y + d.y * best;
    if (!(Math.max(y0, y1) < yMin || Math.min(y0, y1) > yMax)) {
      outer: for (let s = 0; s <= best; s += step) {
        const py = o.y + d.y * s;
        if (py < yMin || py > yMax) continue;
        const px = o.x + d.x * s, pz = o.z + d.z * s;
        for (const I of cands) {
          if (py > I.yTop || py < I.yBot) continue;
          const q = I.sample(px, pz);
          if (q && py <= q.top && py >= q.bottom) {
            let lo = Math.max(0, s - step), hi = s;
            for (let k = 0; k < 7; k++) {
              const mid = (lo + hi) / 2;
              if (this.solidAt(cands, o.x + d.x * mid, o.y + d.y * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
            }
            if (hi < best) { best = hi; kind = 1; obj = null; oI = I; type = 'ground'; }
            break outer;
          }
        }
      }
    }
    if (!kind) return null;
    const h = this._hit;
    h.point.copy(o).addScaledVector(d, best);
    h.dist = best;
    h.kind = kind; h.obj = obj; h.I = oI; h.type = type;
    return h;
  }

  // ---------------------------------------------------------------- editing (Ground Grabber)
  // Every change is an "op" so it can be replayed on other players' machines (and for late joiners).
  islandById(id) {
    const [cx, cz] = String(id).split('_').map(Number);
    if (!isFinite(cx) || !isFinite(cz)) return null;
    return this.getData(cx, cz).islands.find((I) => I.id === id) || null;
  }
  // can this hit be ripped out? (not the spawn island, the safe zone or shops)
  canGrab(hit) {
    if (!hit || inSafeZone(hit.point)) return false;
    if (hit.I && hit.I.kind === 'spawn') return false;
    if (hit.type === 'box' && hit.obj.noGrab) return false;
    if (hit.I && hit.I.shop && Math.hypot(hit.point.x - hit.I.shop.x, hit.point.z - hit.I.shop.z) < 7) return false;
    return !!hit.type;
  }
  // turn a hit into an op that removes a piece (returns null if nothing can be taken)
  ripOp(hit, dir) {
    if (!this.canGrab(hit)) return null;
    const P = hit.point, I = hit.I;
    if (hit.type === 'ground') return { o: 'dig', I: I.id, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), r: 2.3 };
    if (hit.type === 'tree') return { o: 'tree', I: I.id, i: I.trees.indexOf(hit.obj) };
    if (hit.type === 'rock') return { o: 'rock', I: I.id, i: I.rocks.indexOf(hit.obj) };
    if (hit.type === 'placed') return { o: 'unplace', pid: hit.obj.id };
    if (hit.type === 'box') {
      const b = hit.obj, q = P.clone().addScaledVector(dir, 0.4);
      return { o: 'cut', I: I.id, b: [b.x, b.y, b.z, b.sx, b.sy, b.sz].map((v) => +v.toFixed(3)), c: [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), 2.6] };
    }
    return null;
  }
  // apply an op; returns the removed piece { sx, sy, sz, look, color, surf } when it removed one
  applyOp(op) {
    if (!op || typeof op !== 'object') return null;
    if (op.o === 'place') return this.place(op), null;
    if (op.o === 'unplace') {
      const i = this.placed.findIndex((b) => b.id === op.pid);
      if (i < 0) return null;
      const b = this.placed[i];
      this.placed.splice(i, 1);
      this.placedGroup.remove(b.mesh); b.mesh.geometry.dispose();
      return { sx: b.sx, sy: b.sy, sz: b.sz, look: b.look, color: b.color, surf: b.surf };
    }
    const I = this.islandById(op.I);
    if (!I) return null;
    this.getData(...String(op.I).split('_').slice(0, 2).map(Number)).modded = true;
    if (op.o === 'dig') {
      const h = { x: +op.x, y: +op.y, z: +op.z, r: Math.min(4, +op.r || 2.3), I };
      if (![h.x, h.y, h.z].every(isFinite)) return null;
      I.holes.push(h); this.holes.push(h);
      const m = new THREE.Mesh(this.geos.bowl, this.mats.bowl);
      m.position.set(h.x, h.y, h.z); m.scale.setScalar(h.r); m.receiveShadow = true;
      this.holeGroup.add(m); h.mesh = m;
      if (this.holes.length > 400) { const old = this.holes.shift(); old.I.holes.splice(old.I.holes.indexOf(old), 1); this.holeGroup.remove(old.mesh); }
      this.holeT = 0;
      const rock = I.kind === 'rock';
      return { sx: 1.9, sy: 1.9, sz: 1.9, look: rock ? 'rock' : 'dirt', color: rock ? 0x6f655c : 0x6e5136, surf: 0 };
    }
    if (op.o === 'tree') {
      const t = I.trees[op.i];
      if (!t || t.gone) return null;
      t.gone = true;
      if (t._tm) { t._tm.setMatrixAt(t._ti, _zero); t._tm.instanceMatrix.needsUpdate = true; }
      if (t._lm) { for (let k = 0; k < 3; k++) t._lm.setMatrixAt(t._li + k, _zero); t._lm.instanceMatrix.needsUpdate = true; }
      return { sx: 0.9, sy: 0.9, sz: Math.min(6, t.h * 0.75), look: 'log', color: 0x5b3e27, surf: 2 };
    }
    if (op.o === 'rock') {
      const b = I.rocks[op.i];
      if (!b || b.gone) return null;
      b.gone = true;
      if (b._rm) { b._rm.setMatrixAt(b._ri, _zero); b._rm.instanceMatrix.needsUpdate = true; }
      const s = Math.min(2.6, b.s * 1.4);
      return { sx: s, sy: s * 0.8, sz: s, look: 'rock', color: 0x7c7770, surf: 0 };
    }
    if (op.o === 'cut') {
      const [bx, by, bz, bsx, bsy, bsz] = op.b || [], [qx, qy, qz, qs] = op.c || [];
      const bi = I.boxes.findIndex((b) => near(b.x, bx) && near(b.y, by) && near(b.z, bz) && near(b.sx, bsx) && near(b.sy, bsy) && near(b.sz, bsz));
      if (bi < 0 || !isFinite(qs)) return null;
      const h = Math.min(3, qs) / 2;
      const res = subtractBox(I.boxes[bi], qx - h, qx + h, qy - h, qy + h, qz - h, qz + h);
      if (!res) return null;
      I.boxes.splice(bi, 1, ...res.rest);
      this.rebuildStruct(I);
      const p = res.piece;
      // carry it with the broad side facing you: local x = width, z = thickness
      const thinX = p.sx < p.sz;
      return { sx: thinX ? p.sz : p.sx, sy: p.sy, sz: thinX ? p.sx : p.sz, look: 'box', color: p.color, surf: p.surf };
    }
    return null;
  }
  // a thrown piece came to rest: it becomes a solid block
  place(op) {
    if (this.placed.some((b) => b.id === op.pid)) return;
    const b = { id: op.pid, x: +op.x, y: +op.y, z: +op.z, sx: Math.min(8, +op.sx), sy: Math.min(8, +op.sy), sz: Math.min(8, +op.sz), look: op.look, color: op.color | 0, surf: op.surf | 0 };
    if (![b.x, b.y, b.z, b.sx, b.sy, b.sz].every(isFinite)) return;
    b.I = this.islandUnder({ x: b.x, y: b.y - b.sy / 2, z: b.z }) || null;
    const m = new THREE.Mesh(pieceGeometry(b), this.mats.struct);
    m.position.set(b.x, b.y, b.z); m.castShadow = this.shadows; m.receiveShadow = true;
    this.placedGroup.add(m); b.mesh = m;
    this.placed.push(b);
    if (this.placed.length > 150) { const old = this.placed.shift(); this.placedGroup.remove(old.mesh); old.mesh.geometry.dispose(); }
  }
  // highest surface under a footprint (terrain, structures, placed blocks), or null over the void
  supportY(x, z, yMax, hx, hz, ignore) {
    let best = null;
    for (const I of this.islandsNear(x, z, Math.max(hx, hz))) {
      for (const [ox, oz] of [[0, 0], [-hx * 0.7, -hz * 0.7], [hx * 0.7, hz * 0.7], [-hx * 0.7, hz * 0.7], [hx * 0.7, -hz * 0.7]]) {
        const s = I.sample(x + ox, z + oz);
        if (s && s.top <= yMax && (best === null || s.top > best)) best = s.top;
      }
      for (const b of I.boxes) {
        if (Math.abs(b.x - x) >= (b.sx / 2 + hx) * 0.9 || Math.abs(b.z - z) >= (b.sz / 2 + hz) * 0.9) continue;
        const t = b.y + b.sy / 2;
        if (t <= yMax && (best === null || t > best)) best = t;
      }
    }
    for (const b of this.placed) {
      if (b === ignore || Math.abs(b.x - x) >= (b.sx / 2 + hx) * 0.9 || Math.abs(b.z - z) >= (b.sz / 2 + hz) * 0.9) continue;
      const t = b.y + b.sy / 2;
      if (t <= yMax && (best === null || t > best)) best = t;
    }
    return best;
  }
  rebuildStruct(I) {
    const [cx, cz] = String(I.id).split('_').map(Number);
    const rec = this.built.get(ck(cx, cz));
    if (!rec || !rec.structMesh) return;
    const g = this.structGeometry(this.getData(cx, cz).islands);
    rec.structMesh.geometry.dispose();
    rec.structMesh.geometry = g || new THREE.BufferGeometry();
  }
  structGeometry(islands) {
    const sg = [];
    for (const I of islands) {
      for (const b of I.boxes) sg.push(boxGeo(b));
      for (const b of I.decoBoxes) sg.push(boxGeo(b));
      for (const dd of I.deco) if (dd.type === 'roof') sg.push(roofGeo(dd));
    }
    if (!sg.length) return null;
    const g = mergeGeometries(sg);
    sg.forEach((x) => x.dispose());
    return g;
  }
  // nearest holes go to the GPU (terrain + grass are cut away inside them)
  updateHoles(cam) {
    const L = HOLES.list.value;
    let list = this.holes;
    if (list.length > MAX_HOLES) list = [...list].sort((a, b) => (a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 - (b.x - cam.x) ** 2 - (b.z - cam.z) ** 2).slice(0, MAX_HOLES);
    for (let i = 0; i < list.length; i++) L[i].set(list[i].x, list[i].y, list[i].z, list[i].r);
    HOLES.n.value = list.length;
  }

  collectCoins(pos, rad = 1.9) {
    let n = 0;
    const cy = pos.y + 0.7;
    for (const I of this.islandsNear(pos.x, pos.z, 2)) {
      for (const c of I.coins) {
        if (c.taken) continue;
        const dx = c.x - pos.x, dy = c.y - cy, dz = c.z - pos.z;
        if (dx * dx + dy * dy + dz * dz < rad * rad) {
          c.taken = true; n++;
          if (c._mesh) { c._mesh.setMatrixAt(c._i, _zero); c._mesh.instanceMatrix.needsUpdate = true; }
        }
      }
    }
    return n;
  }

  nearestShop(pos, kind) {
    let best = null, bd = Infinity;
    for (const b of this.built.values()) {
      for (const I of this.getData(b.cx, b.cz).islands) {
        if (!I.shop) continue;
        if (kind && I.shop.type !== kind) continue;
        const d = Math.hypot(I.shop.x - pos.x, I.shop.y - pos.y, I.shop.z - pos.z);
        if (d < bd) { bd = d; best = I.shop; }
      }
    }
    return best ? { shop: best, dist: bd } : null;
  }

  spawnCandidates(pos, minD, maxD) {
    const out = [];
    for (const b of this.built.values()) {
      for (const I of this.getData(b.cx, b.cz).islands) {
        if (I.kind !== 'island' || I.R < 14) continue;
        if (Math.hypot(I.x, I.z) < SAFE_RADIUS + 110) continue;
        const d = Math.hypot(I.x - pos.x, I.z - pos.z);
        if (d >= minD && d <= maxD) out.push(I);
      }
    }
    return out;
  }

  // -------- streaming
  preload(pos, rad) {
    const cx = Math.round(pos.x / CHUNK), cz = Math.round(pos.z / CHUNK);
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      const k = ck(cx + dx, cz + dz);
      if (!this.built.has(k)) this.built.set(k, this.buildChunk(this.getData(cx + dx, cz + dz)));
    }
  }
  update(focus, dt) {
    this.time += dt;
    this.uTime.value = this.time;
    this.mats.water.normalMap.offset.set(this.time * 0.02, this.time * 0.013);
    this.mats.fall.map.offset.y = this.time * 1.4;
    const cx = Math.round(focus.x / CHUNK), cz = Math.round(focus.z / CHUNK);
    const key = ck(cx, cz);
    if (key !== this.lastC) { this.lastC = key; this.refresh(cx, cz); }
    let budget = this.queue.length > 12 ? 2 : 1;
    while (budget-- > 0 && this.queue.length) {
      const q = this.queue.shift();
      if (!this.built.has(q.k)) this.built.set(q.k, this.buildChunk(this.getData(q.cx, q.cz)));
    }
    for (const b of this.built.values()) {
      for (const k of b.keepers) k.update(dt, this.camera, false, 0);
      for (const c of b.crystals) { c.rotation.y += dt; c.position.y = c.userData.y + Math.sin(this.time * 2) * 0.25; }
      for (const sp of b.spinners) sp.rotation[sp.userData.axis] += dt * sp.userData.speed;
    }
    this.holeT -= dt;
    if (this.holeT <= 0 && this.camera) { this.holeT = 0.4; this.updateHoles(this.camera.position); }
  }
  refresh(cx, cz) {
    const R = this.loadR, need = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      if (dx * dx + dz * dz > (R + 0.5) ** 2) continue;
      need.push({ cx: cx + dx, cz: cz + dz, k: ck(cx + dx, cz + dz), d: dx * dx + dz * dz });
    }
    need.sort((a, b) => a.d - b.d);
    this.queue = need.filter((n) => !this.built.has(n.k));
    for (const [k, b] of this.built) {
      const dcx = b.cx - cx, dcz = b.cz - cz;
      if (dcx * dcx + dcz * dcz > (R + 1.5) ** 2) { this.unbuild(b); this.built.delete(k); }
    }
    if (this.data.size > 400) {
      for (const [k, d] of this.data) {
        if (this.built.has(k) || d.modded) continue;
        const dcx = d.cx - cx, dcz = d.cz - cz;
        if (dcx * dcx + dcz * dcz > (R + 3) ** 2) this.data.delete(k);
      }
    }
  }
  unbuild(b) {
    this.scene.remove(b.group);
    for (const x of b.disp) x.dispose();
    if (b.structMesh) b.structMesh.geometry.dispose();
    for (const k of b.keepers) k.dispose();
  }

  buildChunk(d) {
    const group = new THREE.Group();
    const disp = [], keepers = [], crystals = [], spinners = [];
    const M = this.mats, GE = this.geos, sh = this.shadows;
    const islands = d.islands;
    const rec = { cx: d.cx, cz: d.cz, group, disp, keepers, crystals, spinners };
    if (!islands.length) { this.scene.add(group); return rec; }

    // terrain (one merged mesh per chunk)
    const tg = islands.map(islandGeometry);
    const terr = tg.length === 1 ? tg[0] : mergeGeometries(tg);
    if (tg.length > 1) tg.forEach((g) => g.dispose());
    const tm = new THREE.Mesh(terr, M.terrain);
    tm.castShadow = sh; tm.receiveShadow = true;
    group.add(tm); disp.push(terr);

    let nT = 0, nP = 0, nB = 0, nR = 0, nBu = 0, nC = 0;
    for (const I of islands) {
      nT += I.trees.length;
      for (const t of I.trees) t.pine ? nP++ : nB++;
      nR += I.rocks.length; nBu += I.bushes.length; nC += I.coins.length;
    }
    const addInst = (mesh) => { mesh.castShadow = sh; mesh.receiveShadow = true; group.add(mesh); disp.push(mesh); };
    _q.identity();
    if (nT) {
      const trunks = new THREE.InstancedMesh(GE.trunk, M.trunk, nT);
      const pines = nP ? new THREE.InstancedMesh(GE.cone, M.leaf, nP * 3) : null;
      const blobs = nB ? new THREE.InstancedMesh(GE.blob, M.leaf, nB * 3) : null;
      let it = 0, ip = 0, ib = 0;
      for (const I of islands) for (const t of I.trees) {
        _q.identity();
        _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.r, t.h * 0.72, t.r));
        t._tm = trunks; t._ti = it; t._lm = t.pine ? pines : blobs; t._li = t.pine ? ip : ib;
        trunks.setMatrixAt(it++, t.gone ? _zero : _m);
        if (t.gone) { const L = t.pine ? pines : blobs; for (let k = 0; k < 3; k++) L.setMatrixAt(t.pine ? ip++ : ib++, _zero); continue; }
        if (t.pine) {
          _c.setHSL(0.3 + t.c * 0.05, 0.45, 0.17 + t.c * 0.07, THREE.SRGBColorSpace);
          _m.compose(_p.set(t.x, t.y + t.h * 0.25, t.z), _q, _s.set(t.fr, t.h * 0.55, t.fr));
          pines.setMatrixAt(ip, _m); pines.setColorAt(ip++, _c);
          _m.compose(_p.set(t.x, t.y + t.h * 0.5, t.z), _q, _s.set(t.fr * 0.74, t.h * 0.42, t.fr * 0.74));
          pines.setMatrixAt(ip, _m); pines.setColorAt(ip++, _c.multiplyScalar(1.08));
          _m.compose(_p.set(t.x, t.y + t.h * 0.72, t.z), _q, _s.set(t.fr * 0.45, t.h * 0.32, t.fr * 0.45));
          pines.setMatrixAt(ip, _m); pines.setColorAt(ip++, _c.multiplyScalar(1.08));
        } else {
          _c.setHSL(0.22 + t.c * 0.08, 0.5, 0.25 + t.c * 0.09, THREE.SRGBColorSpace);
          _q.setFromEuler(_e.set(0, t.c * TAU, 0));
          _m.compose(_p.set(t.x, t.y + t.h * 0.72, t.z), _q, _s.set(t.fr, t.fr * 0.85, t.fr));
          blobs.setMatrixAt(ib, _m); blobs.setColorAt(ib++, _c);
          const oa = t.c * TAU;
          _m.compose(_p.set(t.x + Math.cos(oa) * t.fr * 0.6, t.y + t.h * 0.62, t.z + Math.sin(oa) * t.fr * 0.6), _q, _s.set(t.fr * 0.7, t.fr * 0.6, t.fr * 0.7));
          blobs.setMatrixAt(ib, _m); blobs.setColorAt(ib++, _c.multiplyScalar(0.9));
          _m.compose(_p.set(t.x - Math.cos(oa) * t.fr * 0.45, t.y + t.h * 0.86, t.z - Math.sin(oa) * t.fr * 0.45), _q, _s.set(t.fr * 0.62, t.fr * 0.55, t.fr * 0.62));
          blobs.setMatrixAt(ib, _m); blobs.setColorAt(ib++, _c.multiplyScalar(1.25));
        }
      }
      addInst(trunks);
      if (pines) addInst(pines);
      if (blobs) addInst(blobs);
    }
    if (nR) {
      const rocks = new THREE.InstancedMesh(GE.rock, M.rock, nR);
      let i = 0;
      for (const I of islands) for (const b of I.rocks) {
        _q.setFromEuler(_e.set(b.rot, b.rot * 2, b.rot * 0.5));
        _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.s, b.s * 0.8, b.s));
        b._rm = rocks; b._ri = i;
        rocks.setMatrixAt(i++, b.gone ? _zero : _m);
      }
      addInst(rocks);
    }
    if (nBu) {
      const bushes = new THREE.InstancedMesh(GE.bush, M.bush, nBu);
      let i = 0;
      for (const I of islands) for (const b of I.bushes) {
        _q.setFromEuler(_e.set(0, b.c * TAU, 0));
        _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.s * 1.3, b.s, b.s * 1.3));
        bushes.setMatrixAt(i, _m);
        bushes.setColorAt(i++, _c.setHSL(0.25 + b.c * 0.06, 0.5, 0.2 + b.c * 0.1, THREE.SRGBColorSpace));
      }
      bushes.castShadow = false; bushes.receiveShadow = true; group.add(bushes); disp.push(bushes);
    }

    // structures (one merged mesh per chunk, rebuilt when the Ground Grabber rips a piece out)
    for (const I of islands) {
      for (const dd of I.deco) {
        if (dd.type === 'crystal') {
          const c = new THREE.Mesh(GE.crystal, M.crystal);
          c.scale.set(dd.s, dd.s * 1.6, dd.s);
          c.position.set(dd.x, dd.y, dd.z);
          c.userData.y = dd.y;
          group.add(c); crystals.push(c);
        } else if (dd.type === 'blades') {
          const hub = new THREE.Group();
          hub.position.set(dd.x, dd.y, dd.z); hub.rotation.y = dd.a;
          const rotor = new THREE.Group(); hub.add(rotor);
          for (let k = 0; k < 4; k++) {
            const arm = new THREE.Group(); arm.rotation.z = (k / 4) * TAU; rotor.add(arm);
            const spar = new THREE.Mesh(GE.trunk, M.blade); spar.scale.set(0.12, dd.r, 0.12); spar.castShadow = sh; arm.add(spar);
            const sail = new THREE.Mesh(boxGeoUnit, M.sail); sail.scale.set(1.3, dd.r * 0.78, 0.05); sail.position.set(0.72, dd.r * 0.55, 0); sail.castShadow = sh; arm.add(sail);
          }
          const cap = new THREE.Mesh(GE.blob, M.blade); cap.scale.setScalar(0.45); rotor.add(cap);
          rotor.userData = { axis: 'z', speed: 0.9 };
          group.add(hub); spinners.push(rotor);
        } else if (dd.type === 'lamp') {
          const lamp = new THREE.Mesh(GE.crystal, M.lamp); lamp.scale.set(0.7, 0.9, 0.7); lamp.position.set(dd.x, dd.y, dd.z);
          group.add(lamp);
          const rot = new THREE.Group(); rot.position.set(dd.x, dd.y, dd.z);
          for (const a of [0, Math.PI]) { const b = new THREE.Mesh(GE.beam, M.beam); b.rotation.y = a; rot.add(b); }
          rot.userData = { axis: 'y', speed: 0.8 };
          group.add(rot); spinners.push(rot);
        }
      }
    }
    const sgeo = this.structGeometry(islands);
    const smesh = new THREE.Mesh(sgeo || new THREE.BufferGeometry(), M.struct);
    smesh.castShadow = sh; smesh.receiveShadow = true;
    group.add(smesh); rec.structMesh = smesh;

    // water: lakes, streams, waterfalls
    const wg = [], fg = [];
    for (const I of islands) {
      const L = I.lake;
      if (!L) continue;
      const g = new THREE.CircleGeometry(L.r, 40);
      g.rotateX(-Math.PI / 2); g.translate(L.x, L.level, L.z);
      wg.push(g);
      const F = I.fall;
      if (F) {
        const er = I.edgeR(F.a);
        const ex = I.x + Math.cos(F.a) * er * 0.985, ez = I.z + Math.sin(F.a) * er * 0.985;
        const len = Math.hypot(ex - L.x, ez - L.z), beta = Math.atan2(ez - L.z, ex - L.x);
        const rg = new THREE.PlaneGeometry(len, F.w * 1.3);
        rg.rotateX(-Math.PI / 2); rg.rotateY(-beta); rg.translate((ex + L.x) / 2, L.level - 0.05, (ez + L.z) / 2);
        wg.push(rg);
        const H = I.depth + 90, W = F.w * 1.3;
        const pg = new THREE.PlaneGeometry(W, H);
        const uv = pg.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W / 6), uv.getY(i) * (H / 18));
        const fx = I.x + Math.cos(F.a) * (er + 0.4), fz = I.z + Math.sin(F.a) * (er + 0.4);
        _m.makeRotationY(Math.atan2(Math.cos(F.a), Math.sin(F.a))).setPosition(fx, L.level - H / 2, fz);
        pg.applyMatrix4(_m);
        fg.push(pg);
      }
    }
    if (wg.length) {
      const g = mergeGeometries(wg); wg.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, M.water); m.receiveShadow = true; m.renderOrder = 1;
      group.add(m); disp.push(g);
    }
    if (fg.length) {
      const g = mergeGeometries(fg); fg.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, M.fall); m.renderOrder = 2;
      group.add(m); disp.push(g);
    }

    // coins
    if (nC) {
      const cm = new THREE.InstancedMesh(GE.coin, M.coin, nC);
      let ic = 0;
      _q.identity();
      for (const I of islands) for (const c of I.coins) {
        c._mesh = cm; c._i = ic;
        if (c.taken) cm.setMatrixAt(ic++, _zero);
        else { _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(1, 1, 1)); cm.setMatrixAt(ic++, _m); }
      }
      cm.frustumCulled = false;
      group.add(cm); disp.push(cm);
    }

    // shops
    for (const I of islands) {
      if (!I.shop) continue;
      const S = I.shop;
      const keeper = makeCharacter(S.passive ? 0xb07aff : S.hook ? 0xff8a1a : 0xf2c230, {});
      keeper.group.position.set(S.x, S.y, S.z - 0.5);
      keeper.group.rotation.y = Math.PI;
      group.add(keeper.group); keepers.push(keeper);
      const sign = S.passive ? makeTextSprite('PASSIVES', { bg: 'rgba(150,80,255,0.95)', color: '#fff', size: 1.6 }) : S.hook ? makeTextSprite('🪝 HOOKS', { bg: 'rgba(20,20,20,0.95)', color: '#ffd23a', size: 1.6 }) : makeTextSprite('SHOP', { bg: 'rgba(255,200,40,0.95)', color: '#3a2600', size: 1.6 });
      if (S.hook) {
        const big = makeHookHead('grabber');
        big.scale.setScalar(7); big.rotation.x = Math.PI / 2;
        const holder = new THREE.Group(); holder.add(big);
        holder.position.set(S.x, S.y + 7.4, S.z + 0.2); holder.userData.y = S.y + 7.4;
        group.add(holder); crystals.push(holder);
      }
      sign.position.set(S.x, S.y + 4.6, S.z + 0.2);
      group.add(sign);
      disp.push(sign.material.map, sign.material);
    }

    this.scene.add(group);
    return rec;
  }
}
