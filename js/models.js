import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const planeGeo = new THREE.PlaneGeometry(1, 1);
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.25 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x343a42, metalness: 0.85, roughness: 0.35 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd4, metalness: 1, roughness: 0.22 });
const glowMat = new THREE.MeshStandardMaterial({ color: 0x55ccff, emissive: 0x1d8fff, emissiveIntensity: 0.9, roughness: 0.3 });
const gloveMat = new THREE.MeshStandardMaterial({ color: 0x2f7bff, roughness: 0.5 });
// still cubes, just with slightly softened edges so they catch the light like real objects
const bodyGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.07);
function stripeTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d');
  x.fillStyle = '#f2c230'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#151515';
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 16 + 64, 64); x.lineTo(i + 64, 64); x.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
const stripeMat = new THREE.MeshStandardMaterial({ map: stripeTexture(), metalness: 0.35, roughness: 0.45 });
const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf2c230, metalness: 0.4, roughness: 0.4 });
const greyMat = new THREE.MeshStandardMaterial({ color: 0x8d939a, metalness: 0.8, roughness: 0.3 });
const inkMat = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.35 });
const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.45, metalness: 0.2 });
const iceMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x2a8fd0, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.9 });
const purpleMat = new THREE.MeshStandardMaterial({ color: 0x7a3cff, emissive: 0x4a1aa0, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3 });
const windMat = new THREE.MeshStandardMaterial({ color: 0xe9fffa, emissive: 0x2fc9a8, emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.2 });
const boltMat = new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffb000, emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 });
const sparkMat = new THREE.MeshStandardMaterial({ color: 0x7fd0ff, emissive: 0x2a8fff, emissiveIntensity: 1.2, roughness: 0.2 });
const portalMat = new THREE.MeshBasicMaterial({ color: 0x5ff2ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(cv);
  return blobTex;
}

// shared gun / hook geometries (created once)
const GG = {
  body: new THREE.CylinderGeometry(0.07, 0.085, 0.42, 16),
  ring: new THREE.TorusGeometry(0.082, 0.016, 8, 24),
  barrel: new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12),
  spool: new THREE.CylinderGeometry(0.05, 0.05, 0.07, 14),
  tank: new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10),
  cone: new THREE.ConeGeometry(0.045, 0.13, 10),
  collar: new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10),
  gBody: new THREE.CylinderGeometry(0.075, 0.09, 0.15, 16),
  sleeve: new THREE.CylinderGeometry(0.092, 0.092, 0.2, 16, 1, true),
  lCone: new THREE.ConeGeometry(0.028, 0.1, 8),
  lSpool: new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16),
  wRing: new THREE.TorusGeometry(0.075, 0.018, 10, 28),
  wDisc: new THREE.CircleGeometry(0.062, 24),
  fCrystal: new THREE.OctahedronGeometry(0.06, 0),
  wTorus: new THREE.TorusGeometry(0.05, 0.012, 8, 20),
};
const ropeGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function makeTextSprite(text, o = {}) {
  const fs = 44, pad = 18;
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const font = `bold ${fs}px system-ui, Segoe UI, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  cv.width = w; cv.height = fs + pad;
  ctx.font = font;
  ctx.fillStyle = o.bg || 'rgba(0,0,0,0.5)';
  roundRect(ctx, 0, 0, w, cv.height, 14);
  ctx.fill();
  ctx.fillStyle = o.color || '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  const h = o.size || 0.45;
  s.scale.set((h * w) / cv.height, h, 1);
  s.renderOrder = 5;
  return s;
}

// three hook designs: the normal steel hook, the GROUND GRABBER (big striped yellow-black claw)
// and the LIGHTROPE (small grey hook with black prongs)
export function makeHookHead(variant = 'normal') {
  const h = new THREE.Group();
  if (variant === 'grabber') {
    const body = new THREE.Mesh(GG.gBody, stripeMat);
    body.rotation.x = Math.PI / 2; body.position.z = 0.03; h.add(body);
    const nose = new THREE.Mesh(GG.collar, inkMat); nose.scale.set(1.4, 1, 1.4); nose.rotation.x = Math.PI / 2; nose.position.z = -0.06; h.add(nose);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i / 4) * TAU + Math.PI / 4; h.add(arm);
      const p = new THREE.Mesh(boxGeo, i % 2 ? yellowMat : inkMat);
      p.scale.set(0.04, 0.04, 0.2); p.position.set(0, 0.085, -0.05); p.rotation.x = -0.55; arm.add(p);
      const tip = new THREE.Mesh(boxGeo, i % 2 ? inkMat : yellowMat);
      tip.scale.set(0.04, 0.09, 0.04); tip.position.set(0, 0.105, -0.155); tip.rotation.x = 0.6; arm.add(tip);
    }
    return h;
  }
  if (variant === 'boomerang') {
    // a flat V blade: lies in the XZ plane so it can spin flat through the air
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(boxGeo, s > 0 ? orangeMat : whiteMat);
      wing.scale.set(0.2, 0.022, 0.05); wing.position.set(s * 0.07, 0, -0.04); wing.rotation.y = s * 0.55; h.add(wing);
      const tip = new THREE.Mesh(boxGeo, s > 0 ? whiteMat : orangeMat);
      tip.scale.set(0.05, 0.024, 0.052); tip.position.set(s * 0.155, 0, -0.1); tip.rotation.y = s * 0.55; h.add(tip);
    }
    return h;
  }
  if (variant === 'frost') {
    const core = new THREE.Mesh(GG.fCrystal, iceMat); core.scale.set(0.8, 0.8, 1.6); core.position.z = -0.05; h.add(core);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i / 3) * TAU; h.add(arm);
      const p = new THREE.Mesh(GG.fCrystal, iceMat); p.scale.set(0.3, 0.3, 1.4); p.position.set(0, 0.05, 0.02); p.rotation.x = -0.7; arm.add(p);
    }
    return h;
  }
  if (variant === 'warp') {
    const ring = new THREE.Mesh(GG.wRing, purpleMat); h.add(ring);
    const disc = new THREE.Mesh(GG.wDisc, portalMat); h.add(disc);
    const nub = new THREE.Mesh(GG.collar, purpleMat); nub.scale.set(0.6, 1, 0.6); nub.rotation.x = Math.PI / 2; nub.position.z = 0.04; h.add(nub);
    return h;
  }
  if (variant === 'wind') {
    // a fan of three curved blades around a swirl ring
    const ring = new THREE.Mesh(GG.wTorus, windMat); h.add(ring);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i / 3) * TAU; h.add(arm);
      const b = new THREE.Mesh(boxGeo, i ? windMat : sparkMat); b.scale.set(0.05, 0.11, 0.012); b.position.set(0.03, 0.07, -0.02); b.rotation.set(-0.4, 0, 0.5); arm.add(b);
    }
    const nose = new THREE.Mesh(GG.lCone, windMat); nose.rotation.x = -Math.PI / 2; nose.position.z = -0.06; h.add(nose);
    return h;
  }
  if (variant === 'thunder') {
    // a zig-zag bolt with electric prongs
    const parts = [[0.02, 0.04, 0.3], [-0.02, -0.01, -0.3], [0.015, -0.06, 0.3]];
    parts.forEach(([x, y, r], i) => { const s = new THREE.Mesh(boxGeo, boltMat); s.scale.set(0.03, 0.07, 0.03); s.position.set(x, y, -0.03 - i * 0.03); s.rotation.z = r; h.add(s); });
    const tip = new THREE.Mesh(GG.cone, boltMat); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.1; tip.scale.setScalar(0.8); h.add(tip);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i / 3) * TAU; h.add(arm);
      const p = new THREE.Mesh(boxGeo, sparkMat); p.scale.set(0.014, 0.014, 0.1); p.position.set(0, 0.04, 0.02); p.rotation.x = -0.7; arm.add(p);
    }
    return h;
  }
  if (variant === 'lightrope') {
    const core = new THREE.Mesh(GG.lCone, greyMat); core.rotation.x = -Math.PI / 2; core.position.z = -0.04; h.add(core);
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Group(); arm.rotation.z = (i / 3) * TAU; h.add(arm);
      const p = new THREE.Mesh(boxGeo, inkMat); p.scale.set(0.012, 0.012, 0.09); p.position.set(0, 0.03, 0.02); p.rotation.x = -0.8; arm.add(p);
    }
    return h;
  }
  const core = new THREE.Mesh(GG.cone, steelMat);
  core.rotation.x = -Math.PI / 2;
  core.position.z = -0.05;
  h.add(core);
  const collar = new THREE.Mesh(GG.collar, metalMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.02;
  h.add(collar);
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.z = (i / 3) * TAU;
    h.add(arm);
    const p = new THREE.Mesh(boxGeo, steelMat);
    p.scale.set(0.018, 0.018, 0.13);
    p.position.set(0, 0.045, 0.03);
    p.rotation.x = -0.7;
    arm.add(p);
  }
  return h;
}

export function makeGun(withHand) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(GG.body, metalMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const r1 = new THREE.Mesh(GG.ring, glowMat);
  r1.position.z = -0.08;
  g.add(r1);
  const r2 = new THREE.Mesh(GG.ring, glowMat);
  r2.position.z = 0.07;
  g.add(r2);
  const barrel = new THREE.Mesh(GG.barrel, steelMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.28;
  g.add(barrel);
  const spool = new THREE.Mesh(GG.spool, steelMat);
  spool.rotation.z = Math.PI / 2;
  spool.position.set(0, 0.085, 0.04);
  g.add(spool);
  const grip = new THREE.Mesh(boxGeo, metalMat);
  grip.scale.set(0.055, 0.17, 0.08);
  grip.position.set(0, -0.12, 0.1);
  grip.rotation.x = 0.25;
  g.add(grip);
  const tank = new THREE.Mesh(GG.tank, glowMat);
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0.078, 0.03, 0.02);
  g.add(tank);
  const heads = {};
  for (const k of ['normal', 'grabber', 'lightrope', 'boomerang', 'frost', 'warp', 'wind', 'thunder']) heads[k] = makeHookHead(k);
  for (const k in heads) { heads[k].position.z = -0.38; heads[k].visible = k === 'normal'; g.add(heads[k]); }
  heads.grabber.scale.setScalar(1.5);
  const head = heads.normal;
  // skins: striped sleeve for the Ground Grabber, a big grey spool for the Lightrope
  const sleeve = new THREE.Mesh(GG.sleeve, stripeMat); sleeve.rotation.x = Math.PI / 2; sleeve.visible = false; g.add(sleeve);
  const spool2 = new THREE.Mesh(GG.lSpool, greyMat); spool2.rotation.z = Math.PI / 2; spool2.position.set(0, 0.1, 0.04); spool2.visible = false; g.add(spool2);
  // coloured rings for the other hooks
  const skinRing = { boomerang: orangeMat, frost: iceMat, warp: purpleMat, wind: windMat, thunder: boltMat };
  const rings = [r1, r2], ringMat = r1.material;
  const muzzle = new THREE.Object3D();
  muzzle.position.z = -0.38;
  g.add(muzzle);
  if (withHand) {
    const hand = new THREE.Mesh(boxGeo, gloveMat);
    hand.scale.set(0.13, 0.12, 0.15);
    hand.position.set(0, -0.16, 0.13);
    hand.rotation.x = 0.25;
    g.add(hand);
  }
  const gun = {
    group: g, head, heads, muzzle, variant: 'normal',
    setVariant(v) {
      if (!heads[v]) v = 'normal';
      const shown = this.head.visible;
      for (const k in heads) heads[k].visible = false;
      this.head = heads[v]; this.head.visible = shown; this.variant = v;
      sleeve.visible = v === 'grabber'; spool2.visible = v === 'lightrope';
      for (const r of rings) r.material = skinRing[v] || ringMat;
    },
  };
  return gun;
}

// A cube with eyes. Feet at y = 0, faces -Z.
export function makeCharacter(color, o = {}) {
  const g = new THREE.Group();
  const bodyG = new THREE.Group();
  g.add(bodyG);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, emissive: 0x000000 });
  if (o.ghost) { mat.transparent = true; mat.opacity = 0.55; mat.emissive.set(0x1a2266); }
  const body = new THREE.Mesh(bodyGeo, mat);
  body.scale.setScalar(1.4);
  body.position.y = 0.7;
  body.castShadow = true;
  body.receiveShadow = true;
  bodyG.add(body);
  const face = new THREE.Group();
  face.position.set(0, 0.95, -0.705);
  bodyG.add(face);
  const eyes = [];
  for (const sx of [-0.3, 0.3]) {
    const w = new THREE.Mesh(boxGeo, whiteMat);
    w.scale.set(0.34, 0.42, 0.04);
    w.position.x = sx;
    face.add(w);
    const p = new THREE.Mesh(boxGeo, blackMat);
    p.scale.set(0.16, 0.2, 0.03);
    p.position.set(sx, -0.04, -0.025);
    face.add(p);
    eyes.push({ w, p });
  }
  if (o.angry) {
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(boxGeo, blackMat);
      b.scale.set(0.4, 0.08, 0.04);
      b.position.set(sx * 0.3, 0.29, -0.01);
      b.rotation.z = sx * 0.38;
      face.add(b);
    }
  }
  if (o.crown) {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 1, roughness: 0.25, emissive: 0x553300 });
    const band = new THREE.Mesh(boxGeo, gold);
    band.scale.set(1.1, 0.16, 1.1); band.position.y = 1.5;
    bodyG.add(band);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) {
      const sp = new THREE.Mesh(boxGeo, gold);
      sp.scale.set(0.14, 0.3, 0.14); sp.position.set(x, 1.68, z);
      bodyG.add(sp);
    }
  }
  // soft contact shadow on the ground under the cube (works even with shadows off)
  const blob = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 1 }));
  blob.rotation.x = -Math.PI / 2; blob.scale.setScalar(2.1); blob.position.y = 0.04; blob.renderOrder = 1;
  if (!o.noBlob) g.add(blob);
  const gun = makeGun(false);
  gun.group.scale.setScalar(1.7);
  gun.group.position.set(0.85, 0.55, -0.25);
  bodyG.add(gun.group);

  let glow = null;
  if (o.glow) {
    const gm = new THREE.MeshBasicMaterial({ color: o.glow, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    glow = new THREE.Mesh(boxGeo, gm);
    glow.scale.setScalar(1.62);
    glow.position.y = 0.7;
    glow.renderOrder = 20;
    bodyG.add(glow);
    const core = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color: o.glow, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, fog: false }));
    core.scale.setScalar(1.42);
    core.position.y = 0.7;
    core.renderOrder = 19;
    bodyG.add(core);
    glow.userData.core = core;
  }
  let hp = null;
  if (o.hp) {
    const hg = new THREE.Group();
    hg.position.y = o.name ? 1.85 : 1.95;
    const bg = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: 0x220000, transparent: true, opacity: 0.7, depthWrite: false }));
    bg.scale.set(1.2, 0.13, 1);
    const fill = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ color: o.hpColor || 0xff4040, depthWrite: false }));
    fill.scale.set(1.16, 0.09, 1);
    fill.position.z = 0.002;
    hg.add(bg, fill);
    g.add(hg);
    hp = { group: hg, fill, bg };
  }
  let tag = null;
  if (o.name) {
    tag = makeTextSprite(o.name, { color: o.tagColor || '#fff', size: o.glow ? 0.65 : 0.45 });
    tag.position.y = 2.25;
    if (o.glow) { tag.material.depthTest = false; tag.material.fog = false; tag.renderOrder = 21; }
    g.add(tag);
  }

  return {
    group: g, mat, bodyG, gun, gunHead: gun.head, gunMuzzle: gun.muzzle, hp, tag, blob,
    setHook(v) { if (gun.variant !== v) { gun.setVariant(v); this.gunHead = gun.head; } },
    // where the ground is below the feet (null = over the void): moves + fades the contact shadow
    setGround(dy) {
      if (dy === null || dy === undefined || dy > 30) { blob.visible = false; return; }
      blob.visible = true;
      const sc = g.scale.x || 1;
      blob.position.y = 0.04 - dy / sc;
      blob.material.opacity = Math.max(0, 1 - dy / 14);
      blob.scale.setScalar(2.1 * (1 + dy * 0.04));
    },
    blinkT: 2 + Math.random() * 3, flash: 0, t: Math.random() * 10,
    setHp(f) {
      if (!hp) return;
      f = clamp(f, 0, 1);
      hp.fill.scale.x = Math.max(0.001, 1.16 * f);
      hp.fill.position.x = -(1.16 * (1 - f)) / 2;
    },
    setName(name) {
      if (!tag) return;
      const n = makeTextSprite(name, { color: o.tagColor || '#fff', size: o.glow ? 0.65 : 0.45 });
      tag.material.map.dispose(); tag.material.dispose();
      if (o.glow) { n.material.depthTest = false; n.material.fog = false; }
      tag.material = n.material; tag.scale.copy(n.scale);
    },
    hit() { this.flash = 1; },
    update(dt, cam, moving, pitch) {
      this.t += dt;
      bodyG.position.y = moving ? Math.abs(Math.sin(this.t * 11)) * 0.12 : 0;
      this.blinkT -= dt;
      const bl = this.blinkT < 0.12 ? 0.1 : 1;
      if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
      for (const e of eyes) {
        e.w.scale.y = 0.42 * bl;
        e.p.scale.y = 0.2 * bl;
        e.p.position.y = -0.04 + clamp(pitch || 0, -1, 1) * 0.09;
      }
      if (this.flash > 0) {
        this.flash -= dt * 4;
        mat.emissive.setRGB(Math.max(0, this.flash) * 0.9, Math.max(0, this.flash) * 0.1, o.ghost ? 0.4 : 0);
      }
      if (glow) { const pulse = 0.5 + Math.sin(this.t * 4) * 0.15; glow.material.opacity = pulse; }
      if (hp && cam) hp.group.quaternion.copy(g.quaternion).invert().multiply(cam.quaternion);
    },
    dispose() {
      mat.dispose(); blob.material.dispose();
      if (hp) { hp.fill.material.dispose(); hp.bg.material.dispose(); }
      if (tag) { tag.material.map.dispose(); tag.material.dispose(); }
      if (glow) { glow.material.dispose(); glow.userData.core.material.dispose(); }
    },
  };
}

// Rope drawn as a curve: hangs down when it has slack (the Lightrope is a real, loose rope).
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rc = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4(), _rs = new THREE.Vector3();
export class SagRope {
  constructor(color = 0x2a2a2a, thick = 0.03, n = 18) {
    this.n = n; this.thick = thick;
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.mesh = new THREE.InstancedMesh(ropeGeo, this.mat, n);
    this.mesh.frustumCulled = false; this.mesh.visible = false;
  }
  setStyle(color, thick) { this.mat.color.set(color); this.thick = thick; }
  set(a, b, sag = 0) {
    const len = a.distanceTo(b);
    if (len < 1e-3) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    _rc.addVectors(a, b).multiplyScalar(0.5); _rc.y -= 2 * Math.min(sag, len * 0.45);
    _ra.copy(a);
    for (let i = 1; i <= this.n; i++) {
      const t = i / this.n, u = 1 - t;
      _rb.set(u * u * a.x + 2 * u * t * _rc.x + t * t * b.x, u * u * a.y + 2 * u * t * _rc.y + t * t * b.y, u * u * a.z + 2 * u * t * _rc.z + t * t * b.z);
      _d.subVectors(_rb, _ra);
      const l = _d.length() || 1e-4;
      _rq.setFromUnitVectors(UP, _d.divideScalar(l));
      _rm.compose(_ra, _rq, _rs.set(this.thick, l, this.thick));
      this.mesh.setMatrixAt(i - 1, _rm);
      _ra.copy(_rb);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  hide() { this.mesh.visible = false; }
  dispose() { this.mat.dispose(); }
}
// sag of a rope of length L hung between two points d apart (parabola approximation of the catenary)
export const ropeSag = (L, d) => (L > d ? Math.sqrt((3 * d * (L - d)) / 8) : 0);

export class Rope {
  constructor(color = 0x2a2a2a, thick = 0.03) {
    this.mesh = new THREE.Mesh(ropeGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.thick = thick;
  }
  set(a, b) {
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 1e-3) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    this.mesh.position.copy(a);
    this.mesh.quaternion.setFromUnitVectors(UP, _d.divideScalar(len));
    this.mesh.scale.set(this.thick, len, this.thick);
  }
  hide() { this.mesh.visible = false; }
  dispose() { this.mesh.material.dispose(); }
}
