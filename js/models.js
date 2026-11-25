import * as THREE from 'three';

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

// shared gun / hook geometries (created once)
const GG = {
  body: new THREE.CylinderGeometry(0.07, 0.085, 0.42, 16),
  ring: new THREE.TorusGeometry(0.082, 0.016, 8, 24),
  barrel: new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12),
  spool: new THREE.CylinderGeometry(0.05, 0.05, 0.07, 14),
  tank: new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10),
  cone: new THREE.ConeGeometry(0.045, 0.13, 10),
  collar: new THREE.CylinderGeometry(0.04, 0.04, 0.05, 10),
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

export function makeHookHead() {
  const h = new THREE.Group();
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
  const head = makeHookHead();
  head.position.z = -0.38;
  g.add(head);
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
  return { group: g, head, muzzle };
}

// A cube with eyes. Feet at y = 0, faces -Z.
export function makeCharacter(color, o = {}) {
  const g = new THREE.Group();
  const bodyG = new THREE.Group();
  g.add(bodyG);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05, emissive: 0x000000 });
  const body = new THREE.Mesh(boxGeo, mat);
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
    group: g, mat, bodyG, gunHead: gun.head, gunMuzzle: gun.muzzle, hp, tag,
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
        mat.emissive.setRGB(Math.max(0, this.flash) * 0.9, Math.max(0, this.flash) * 0.1, 0);
      }
      if (glow) { const pulse = 0.5 + Math.sin(this.t * 4) * 0.15; glow.material.opacity = pulse; }
      if (hp && cam) hp.group.quaternion.copy(g.quaternion).invert().multiply(cam.quaternion);
    },
    dispose() {
      mat.dispose();
      if (hp) { hp.fill.material.dispose(); hp.bg.material.dispose(); }
      if (tag) { tag.material.map.dispose(); tag.material.dispose(); }
      if (glow) { glow.material.dispose(); glow.userData.core.material.dispose(); }
    },
  };
}

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
