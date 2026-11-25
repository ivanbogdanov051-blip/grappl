import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, hash2, fbm, vnoise, smoothstep, clamp } from './noise.js';
import { makeCharacter, makeTextSprite } from './models.js';

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
    this.rocks = []; this.bushes = []; this.coins = []; this.shop = null;
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

function addBox(I, x, y, z, sx, sy, sz, color, solid = true) {
  const b = { x, y: y + sy / 2, z, sx, sy, sz, color };
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
function buildHouse(I, r, x, z) {
  const w = 8, d = 8, h = 4, th = 0.5;
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
  addBox(I, x + 2, fy + h, z - 2, 0.9, 4.2, 0.9, stone(r), false);
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
  const base = groundMin(I, x, z, 4.5, 3.5) - 0.2;
  addBox(I, x, base, z, 9, 0.4, 7, 0x8d6b48);
  const fy = base + 0.4;
  addBox(I, x, fy, z + 1.2, 5, 1.1, 1.2, WOOD);
  for (const [px, pz] of [[-2.6, -1.6], [2.6, -1.6], [-2.6, 1.9], [2.6, 1.9]]) addBox(I, x + px, fy, z + pz, 0.3, 3.2, 0.3, WOOD);
  addBox(I, x, fy + 3.2, z + 0.15, 6, 0.25, 4.2, 0xd23c3c);
  for (let i = -2; i <= 2; i += 2) addBox(I, x + i * 1.0, fy + 3.45, z + 0.15, 0.8, 0.05, 4.2, 0xf4f0e6, false);
  addBox(I, x, fy, z - 2.4, 5, 2.4, 0.4, WOOD);
  I.shop = { x, y: fy, z, I };
}

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
    const nStruct = R > 60 ? 2 : R > 20 && r() < 0.55 ? 1 : 0;
    for (let k = 0; k < nStruct; k++) {
      for (let tries = 0; tries < 6; tries++) {
        I.pointAt(r() * TAU, r() * 0.5, p);
        if (!free(p.x, p.z, 10) || wet(I, p.x, p.z, 9)) continue;
        const t = r();
        if (t < 0.3) buildRuins(I, r, p.x, p.z);
        else if (t < 0.55) buildHouse(I, r, p.x, p.z);
        else if (t < 0.8) buildTower(I, r, p.x, p.z);
        else buildArch(I, r, p.x, p.z);
        occ.push({ x: p.x, z: p.z, r: 9 });
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
function boxGeo(b) {
  const g = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
  const tint = 0.9 + (Math.sin(b.x * 12.9898 + b.z * 78.233 + b.y * 3.7) * 0.5 + 0.5) * 0.18;
  colorize(g, b.color, tint, true);
  g.translate(b.x, b.y, b.z);
  return g;
}
function roofGeo(d) {
  const g = new THREE.ConeGeometry(d.r, d.h, 4, 1);
  g.rotateY(Math.PI / 4);
  colorize(g, d.color, 1, false);
  g.translate(d.x, d.y + d.h / 2, d.z);
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
    leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x7c7770, roughness: 0.95, flatShading: true }),
    bush: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    struct: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2b6f8f, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.85, normalMap: waterNormalTex(), normalScale: new THREE.Vector2(0.5, 0.5) }),
    fall: new THREE.MeshBasicMaterial({ map: fallTex(), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    coin,
    crystal: new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x2299ff, emissiveIntensity: 1.6, roughness: 0.2 }),
  };
}
function makeGeos() {
  return {
    trunk: new THREE.CylinderGeometry(0.7, 1, 1, 7).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0),
    blob: new THREE.IcosahedronGeometry(1, 1),
    rock: new THREE.DodecahedronGeometry(1, 0),
    bush: new THREE.IcosahedronGeometry(1, 0),
    coin: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 18).rotateX(Math.PI / 2),
    crystal: new THREE.OctahedronGeometry(1, 0),
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _e = new THREE.Euler(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

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
    this.geos = makeGeos();
    this._near = [];
    this._rc = [];
    this._hit = { point: new THREE.Vector3(), dist: 0, kind: 0 };
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
        if (e.pos.y > t.y + t.h * 0.7 || e.pos.y + h < t.y) continue;
        const dx = e.pos.x - t.x, dz = e.pos.z - t.z, rr = t.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.pos.x += dx * k; e.pos.z += dz * k; }
      }
      // boulders
      for (const b of I.rocks) {
        const top = b.y + b.s * 0.75;
        if (e.pos.y > top + 0.3 || e.pos.y + h < b.y - b.s) continue;
        const dx = e.pos.x - b.x, dz = e.pos.z - b.z, rr = b.s * 0.8 + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        if (top - e.pos.y <= (wasGround ? 0.9 : 0.5)) { e.pos.y = top; if (e.vel.y < 0) e.vel.y = 0; e.onGround = true; e.ground = I; }
        else if (d2 > 1e-6) { const d = Math.sqrt(d2), k = (rr - d) / d; e.pos.x += dx * k; e.pos.z += dz * k; }
      }
      // boxes (structures)
      for (const b of I.boxes) {
        const hx = b.sx / 2 + r, hz = b.sz / 2 + r;
        const dx = e.pos.x - b.x, dz = e.pos.z - b.z;
        if (dx <= -hx || dx >= hx || dz <= -hz || dz >= hz) continue;
        const topY = b.y + b.sy / 2, botY = b.y - b.sy / 2 - h;
        const snap = wasGround && e.vel.y <= 0.1 ? 0.3 : 0;
        if (e.pos.y >= topY + snap || e.pos.y <= botY) continue;
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
    }
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
    if (!cands.length) return null;
    let best = far, kind = 0;
    let yMin = Infinity, yMax = -Infinity;
    for (const I of cands) {
      if (I.yBot < yMin) yMin = I.yBot;
      if (I.yTop + 30 > yMax) yMax = I.yTop + 30;
      for (const t of I.trees) {
        const fy = t.y + t.h * (t.pine ? 0.5 : 0.72), fr = t.fr * (t.pine ? 0.8 : 1);
        let s = raySphere(o, d, t.x, fy, t.z, fr);
        if (s >= 0 && s < best) { best = s; kind = 2; }
        s = rayCyl(o, d, t.x, t.z, t.r + 0.15, t.y, t.y + t.h * 0.75);
        if (s >= 0 && s < best) { best = s; kind = 2; }
      }
      for (const b of I.rocks) {
        const s = raySphere(o, d, b.x, b.y, b.z, b.s * 0.9);
        if (s >= 0 && s < best) { best = s; kind = 3; }
      }
      for (const b of I.boxes) {
        const s = rayBox(o, d, b);
        if (s >= 0 && s < best) { best = s; kind = 3; }
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
            if (hi < best) { best = hi; kind = 1; }
            break outer;
          }
        }
      }
    }
    if (!kind) return null;
    const h = this._hit;
    h.point.copy(o).addScaledVector(d, best);
    h.dist = best;
    h.kind = kind;
    return h;
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

  nearestShop(pos) {
    let best = null, bd = Infinity;
    for (const b of this.built.values()) {
      for (const I of this.getData(b.cx, b.cz).islands) {
        if (!I.shop) continue;
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
    }
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
        if (this.built.has(k)) continue;
        const dcx = d.cx - cx, dcz = d.cz - cz;
        if (dcx * dcx + dcz * dcz > (R + 3) ** 2) this.data.delete(k);
      }
    }
  }
  unbuild(b) {
    this.scene.remove(b.group);
    for (const x of b.disp) x.dispose();
    for (const k of b.keepers) k.dispose();
  }

  buildChunk(d) {
    const group = new THREE.Group();
    const disp = [], keepers = [], crystals = [];
    const M = this.mats, GE = this.geos, sh = this.shadows;
    const islands = d.islands;
    const rec = { cx: d.cx, cz: d.cz, group, disp, keepers, crystals };
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
      const pines = nP ? new THREE.InstancedMesh(GE.cone, M.leaf, nP * 2) : null;
      const blobs = nB ? new THREE.InstancedMesh(GE.blob, M.leaf, nB) : null;
      let it = 0, ip = 0, ib = 0;
      for (const I of islands) for (const t of I.trees) {
        _q.identity();
        _m.compose(_p.set(t.x, t.y, t.z), _q, _s.set(t.r, t.h * 0.72, t.r));
        trunks.setMatrixAt(it++, _m);
        if (t.pine) {
          _c.setHSL(0.3 + t.c * 0.05, 0.45, 0.17 + t.c * 0.07, THREE.SRGBColorSpace);
          _m.compose(_p.set(t.x, t.y + t.h * 0.25, t.z), _q, _s.set(t.fr, t.h * 0.55, t.fr));
          pines.setMatrixAt(ip, _m); pines.setColorAt(ip++, _c);
          _m.compose(_p.set(t.x, t.y + t.h * 0.55, t.z), _q, _s.set(t.fr * 0.7, t.h * 0.47, t.fr * 0.7));
          pines.setMatrixAt(ip, _m); pines.setColorAt(ip++, _c);
        } else {
          _c.setHSL(0.22 + t.c * 0.08, 0.5, 0.25 + t.c * 0.09, THREE.SRGBColorSpace);
          _q.setFromEuler(_e.set(0, t.c * TAU, 0));
          _m.compose(_p.set(t.x, t.y + t.h * 0.72, t.z), _q, _s.set(t.fr, t.fr * 0.85, t.fr));
          blobs.setMatrixAt(ib, _m); blobs.setColorAt(ib++, _c);
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
        rocks.setMatrixAt(i++, _m);
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

    // structures
    const sg = [];
    for (const I of islands) {
      for (const b of I.boxes) sg.push(boxGeo(b));
      for (const b of I.decoBoxes) sg.push(boxGeo(b));
      for (const dd of I.deco) {
        if (dd.type === 'roof') sg.push(roofGeo(dd));
        else if (dd.type === 'crystal') {
          const c = new THREE.Mesh(GE.crystal, M.crystal);
          c.scale.set(dd.s, dd.s * 1.6, dd.s);
          c.position.set(dd.x, dd.y, dd.z);
          c.userData.y = dd.y;
          group.add(c); crystals.push(c);
        }
      }
    }
    if (sg.length) {
      const g = mergeGeometries(sg);
      sg.forEach((x) => x.dispose());
      const m = new THREE.Mesh(g, M.struct);
      m.castShadow = sh; m.receiveShadow = true;
      group.add(m); disp.push(g);
    }

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
      const keeper = makeCharacter(0xf2c230, {});
      keeper.group.position.set(S.x, S.y, S.z - 0.5);
      keeper.group.rotation.y = Math.PI;
      group.add(keeper.group); keepers.push(keeper);
      const sign = makeTextSprite('SHOP', { bg: 'rgba(255,200,40,0.95)', color: '#3a2600', size: 1.6 });
      sign.position.set(S.x, S.y + 4.6, S.z + 0.2);
      group.add(sign);
      disp.push(sign.material.map, sign.material);
    }

    this.scene.add(group);
    return rec;
  }
}
