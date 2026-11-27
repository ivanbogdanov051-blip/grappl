// GROUND GRABBER: ripping pieces out of the world, carrying them, throwing them and letting them land as blocks.
// With STRUCTURE LIFTER a whole building comes out as one piece (a list of parts).
// Bosses (Stone Colossus) and the Boulder Toss ability throw pieces through the same system.
import * as THREE from 'three';
import { G, KILL_Y, pieceGeometry, inSafeZone, turnParts } from './world.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), _f = new V(), _d = new V(), _p = new V(), _v = new V();
let counter = 0;
const THROW_SPEED = 58;
const r2 = (v) => Math.round(v * 100) / 100;
// the parts list, rounded for the network / edit log
const packParts = (parts) => parts.map((q) => (q.roof
  ? { roof: 1, x: r2(q.x), y: r2(q.y), z: r2(q.z), r: r2(q.r), h: r2(q.h), color: q.color }
  : { x: r2(q.x), y: r2(q.y), z: r2(q.z), sx: r2(q.sx), sy: r2(q.sy), sz: r2(q.sz), color: q.color, surf: q.surf, ...(q.deco ? { deco: 1 } : {}) }));

export class Grab {
  constructor(game) {
    this.g = game;
    this.flying = [];
    this.heldMat = null;
    this.pv = null; this.pvT = 0;
  }
  mat() { return this.g.world.mats.struct; }
  makeMesh(P, translucent) {
    let m = this.mat();
    if (translucent) {
      if (!this.heldMat) { this.heldMat = m.clone(); this.heldMat.transparent = true; this.heldMat.opacity = 0.82; this.heldMat.onBeforeCompile = m.onBeforeCompile; this.heldMat.customProgramCacheKey = m.customProgramCacheKey; }
      m = this.heldMat;
    } else if (P.look === 'ice') m = this.g.world.iceMat();
    const mesh = new THREE.Mesh(pieceGeometry(P), m);
    mesh.castShadow = this.g.world.shadows;
    this.g.scene.add(mesh);
    return mesh;
  }
  dispose(c) { if (c && c.mesh) { this.g.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; } }

  // the hook bit into something: tear a piece out (returns the carried piece, or null)
  rip(hit, dir, p) {
    const g = this.g, w = g.world;
    const op = w.ripOp(hit, dir, { struct: !!(p && p.has && p.has('structgrab')) });
    if (!op) return null;
    const at = hit.point.clone();
    const P = g.edit(op);
    if (!P) return null;
    const c = { ...P, mesh: null };
    c.mesh = this.makeMesh(c, false);
    c.mesh.position.copy(at);
    if (P.parts) {
      // the whole building tears loose
      _a.fromArray(P.at);
      for (let i = 0; i < 4; i++) { _b.set(_a.x + (Math.random() - 0.5) * P.sx, _a.y - P.sy / 2 + 0.3, _a.z + (Math.random() - 0.5) * P.sz); g.particles.burst(_b, i % 2 ? 0x8a7a66 : P.color, 26, 10, 0.45); }
      g.shake(0.6); g.sfx.near('hurt', at);
      g.ui.toast('🏗️ The whole building came loose!');
    }
    const col = P.look === 'dirt' ? 0x6e5136 : P.color;
    g.particles.burst(at, col, 26, 9, 0.38);
    if (P.look === 'dirt') g.particles.burst(at, 0x5f8a35, 12, 6, 0.25);
    g.sfx.near('thunk', at);
    return c;
  }
  carryTo(c, pos) { if (c.mesh) c.mesh.position.copy(pos); }
  hold(p, c) {
    this.clearHeld(p);
    p.held = c;
    c.yaw0 = p.yaw;
    if (c.mesh) { this.g.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    c.mesh = this.makeMesh(c, true);
    c.mesh.renderOrder = 3;
    const what = c.parts ? 'a whole building' : 'it';
    this.g.ui.toast(this.g.ui.touch ? `🟨 Got ${what}! The arc shows where it lands · Tap THROW · ✕ sets it down` : `🟨 Got ${what}! The arc shows where it lands · Click to THROW · Q sets it down`);
  }
  clearHeld(p) {
    if (p.hook && p.hook.carry) { this.dispose(p.hook.carry); p.hook.carry = null; }
    if (p.held) { this.dispose(p.held); p.held = null; }
    this.hidePreview();
  }
  // quarter turns the held building has been turned by (it turns with you)
  turns(p, c) { return Math.round((p.yaw - (c.yaw0 || 0)) / (Math.PI / 2)); }
  // the held piece is lifted up over your head, in front of you (above the crosshair, clear of the ground)
  updateHeld(p) {
    const c = p.held;
    if (!c || !c.mesh) { this.hidePreview(); return; }
    const cam = this.g.camera;
    _f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    // shown a bit smaller than it really is, so it doesn't hide the sky
    // a whole building is carried as a small model, further out and higher up
    const k = c.parts ? Math.min(1, 1.3 / Math.max(c.sx, c.sy, c.sz, 0.5)) : Math.min(1, 1.4 / Math.max(c.sx, c.sy, 0.5));
    c.mesh.scale.setScalar(k);
    c.mesh.position.copy(cam.position).addScaledVector(_f, (c.parts ? 3.2 : 1.5) + (Math.max(c.sz, c.parts ? c.sx : 0) * k) / 2);
    c.mesh.position.y += c.sy * k * 0.5 + (c.parts ? 0.4 : 0.35) + Math.sin(this.g.time * 3) * 0.03;
    const ry = c.parts ? this.turns(p, c) * (Math.PI / 2) : p.yaw;
    c.mesh.rotation.set(Math.sin(this.g.time * 2.3) * 0.03, ry, 0, 'YXZ');
    this.updatePreview(p, c);
  }
  // world-aligned size of a piece flying along `dir` (its long/flat side ends up across the throw)
  aligned(c, dir) {
    const alongX = Math.abs(dir.x) > Math.abs(dir.z);
    return alongX ? { sx: c.sz, sy: c.sy, sz: c.sx } : { sx: c.sx, sy: c.sy, sz: c.sz };
  }
  // what a throw right now would look like: size and (for buildings) the turned parts
  throwShape(p, c) {
    if (c.parts) {
      const q = this.turns(p, c);
      const odd = Math.abs(q) % 2 === 1;
      return { w: odd ? { sx: c.sz, sy: c.sy, sz: c.sx } : { sx: c.sx, sy: c.sy, sz: c.sz }, parts: turnParts(c.parts, q) };
    }
    return { w: this.aligned(c, p.forward(_f)), parts: null };
  }
  throwVel(p, from) {
    const g = this.g, f = p.forward(_f);
    // aim the arc so the chunk comes down where the crosshair points (it starts below your view)
    const cam = g.camera.position;
    const wh = g.world.raycast(cam, f, 110);
    let dist = wh ? wh.dist : 110;
    const eh = g.hitTestEntities(cam, f, dist, p.id, false);
    if (eh) dist = eh.dist;
    const D = _d.copy(cam).addScaledVector(f, dist).sub(from);
    const t = Math.max(0.12, D.length() / THROW_SPEED);
    const vel = D.clone().divideScalar(t); vel.y += 0.5 * G * t;
    vel.addScaledVector(p.vel, 0.3);
    return vel;
  }
  throwHeld(p) {
    const g = this.g, c = p.held;
    if (!c) return;
    const from = c.mesh ? c.mesh.position.clone() : p.eye();
    const { w, parts } = this.throwShape(p, c);
    const vel = this.throwVel(p, from);
    this.dispose(c); p.held = null; this.hidePreview();
    this.launch({ id: g.sid + '-pc' + counter++, pos: from, vel, w, parts, look: c.look, color: c.color, surf: c.surf, owner: p.id, oname: g.name, remote: false }, true);
    g.sfx.zip(); g.shake(c.parts ? 0.45 : 0.2);
  }
  // Q while holding: set it down right in front of you (or let it fall if there's nothing there)
  dropHeld(p) {
    const g = this.g, c = p.held;
    if (!c) return;
    const f = p.forward(_f).clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const { w, parts } = this.throwShape(p, c);
    const dist = 1.4 + Math.max(w.sx, w.sz) / 2;
    const x = p.pos.x + f.x * dist, z = p.pos.z + f.z * dist;
    const sup = g.world.supportY(x, z, p.pos.y + 2.5, w.sx / 2, w.sz / 2);
    this.dispose(c); p.held = null; this.hidePreview();
    const o = { id: g.sid + '-pc' + counter++, w, parts, look: c.look, color: c.color, surf: c.surf, owner: p.id, oname: g.name, remote: false };
    if (sup === null || p.pos.y - sup > 6 || inSafeZone(p.pos)) {
      this.launch({ ...o, pos: new V(x, p.pos.y + 1.2, z), vel: new V(f.x * 4, 2, f.z * 4) }, true);
      return;
    }
    this.settle(o, x, sup, z);
    g.sfx.thunk();
  }
  // a boss (or the Boulder Toss ability) hurls a piece from `from` so it comes down on `to`
  toss(ent, from, to, w, o = {}) {
    const g = this.g;
    const D = _d.subVectors(to, from);
    const t = Math.max(0.35, D.length() / (o.speed || 42));
    const vel = D.clone().divideScalar(t); vel.y += 0.5 * G * t;
    const foe = ent !== g.player;
    return this.launch({ id: g.sid + '-pc' + counter++, pos: from.clone(), vel, w, parts: null, look: o.look || 'rock', color: o.color ?? 0x6f655c, surf: 0, owner: ent.id, oname: foe ? ent.name : g.name, remote: false, foe, dmg: o.dmg, stun: o.stun }, true);
  }
  launch(o, send) {
    const pc = { ...o, hit: new Set(), smash: 0, t: 0, spin: (Math.random() - 0.5) * 2 };
    pc.mesh = this.makeMesh({ ...o.w, parts: o.parts, look: o.look, color: o.color, surf: o.surf }, false);
    pc.mesh.position.copy(o.pos);
    this.flying.push(pc);
    const g = this.g;
    if (send && g.net) {
      const m = { t: 'throw', id: pc.id, x: r2(o.pos.x), y: r2(o.pos.y), z: r2(o.pos.z), vx: r2(o.vel.x), vy: r2(o.vel.y), vz: r2(o.vel.z), sx: r2(o.w.sx), sy: r2(o.w.sy), sz: r2(o.w.sz), look: o.look, color: o.color, surf: o.surf, owner: o.owner, oname: o.oname };
      if (o.parts) m.parts = packParts(o.parts);
      g.net.send(m);
    }
    return pc;
  }
  fromNet(m) {
    if (this.flying.some((x) => x.id === m.id)) return;
    const n = (v) => (isFinite(v) ? +v : 0);
    const big = Array.isArray(m.parts);
    const cap = big ? 40 : 8;
    const w = { sx: Math.min(cap, Math.abs(n(m.sx)) || 1), sy: Math.min(cap, Math.abs(n(m.sy)) || 1), sz: Math.min(cap, Math.abs(n(m.sz)) || 1) };
    let parts = null;
    if (big) {
      parts = m.parts.slice(0, 160).filter((q) => q && typeof q === 'object').map((q) => (q.roof
        ? { roof: 1, x: n(q.x), y: n(q.y), z: n(q.z), r: Math.min(20, Math.abs(n(q.r))), h: Math.min(12, Math.abs(n(q.h))), color: q.color | 0 }
        : { x: n(q.x), y: n(q.y), z: n(q.z), sx: Math.min(30, Math.abs(n(q.sx))), sy: Math.min(30, Math.abs(n(q.sy))), sz: Math.min(30, Math.abs(n(q.sz))), color: q.color | 0, surf: q.surf | 0, deco: q.deco ? 1 : 0 }));
    }
    this.launch({ id: String(m.id), pos: new V(n(m.x), n(m.y), n(m.z)), vel: new V(n(m.vx), n(m.vy), n(m.vz)), w, parts, look: String(m.look || 'box'), color: m.color | 0, surf: m.surf | 0, owner: m.owner, oname: String(m.oname || 'Player').slice(0, 16), remote: true }, false);
  }
  // someone's block landed (their 'place' op): drop our copy of the flying piece
  landedRemote(pid) {
    const i = this.flying.findIndex((x) => x.id === pid);
    if (i >= 0) { this.dispose(this.flying[i]); this.flying.splice(i, 1); }
  }
  settle(pc, x, sup, z) {
    const g = this.g, w = pc.w;
    const y = sup + w.sy / 2;
    if (!pc.remote) {
      const op = { o: 'place', pid: pc.id, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), sx: +w.sx.toFixed(2), sy: +w.sy.toFixed(2), sz: +w.sz.toFixed(2), look: pc.look, color: pc.color, surf: pc.surf };
      if (pc.parts) op.parts = packParts(pc.parts);
      g.edit(op);
    }
    _a.set(x, sup + 0.2, z);
    const big = !!pc.parts;
    g.particles.burst(_a, pc.look === 'dirt' ? 0x7a5c3e : 0x9a948a, big ? 50 : 18, big ? 14 : 7, 0.4);
    const d = _a.distanceTo(g.player.pos);
    if (d < (big ? 120 : 60)) g.shake((big ? 0.8 : 0.35) * (1 - d / (big ? 120 : 60)));
    g.sfx.near('thunk', _a);
    if (big) g.sfx.near('hurt', _a);
  }
  // segment vs. entity spheres: a flying block hits anyone in its way
  hitEntities(pc, dir, len) {
    const g = this.g;
    if (pc.remote) return; // the thrower's game decides who got hit
    const rad = Math.min(8, Math.max(pc.w.sx, pc.w.sy, pc.w.sz) * 0.5);
    const test = (ent) => {
      if (!ent || ent.dead || ent.id === pc.owner || pc.hit.has(ent.id)) return;
      if (ent.kind === 'player' && inSafeZone(ent.pos)) return;
      const sc = ent.scale || 1;
      _b.set(ent.pos.x, ent.pos.y + 0.7 * sc, ent.pos.z).sub(pc.pos);
      const t = Math.max(0, Math.min(len, _b.dot(dir)));
      _d.copy(pc.pos).addScaledVector(dir, t);
      const R = rad + 0.75 * sc;
      if (_d.distanceToSquared(_a.set(ent.pos.x, ent.pos.y + 0.7 * sc, ent.pos.z)) > R * R) return;
      pc.hit.add(ent.id);
      const vol = pc.w.sx * pc.w.sy * pc.w.sz;
      const dmg = pc.dmg || (pc.parts ? 60 : Math.round(Math.max(18, Math.min(45, 14 + vol * 4))));
      const stun = pc.stun || (pc.parts ? 3 : 2.2);
      const l = Math.hypot(dir.x, dir.z) || 1;
      g.deliverHit(ent.id, { mode: 'bump', dmg, k: pc.parts ? 2 : 1.3, d: [dir.x / l, 0, dir.z / l], stun, attacker: pc.owner, aname: pc.oname });
      if (pc.owner === g.player.id) { g.ui.hitMarker(); g.ui.toast(`💫 STUNNED ${ent.name}! (${dmg})`); }
      g.particles.burst(_a, 0xffe14a, 16, 7, 0.22);
      g.sfx.near('hit', _a);
      if (!pc.parts) pc.vel.multiplyScalar(0.55);
    };
    if (pc.foe) {
      // thrown by a bot: it only goes for players
      test(g.player);
      for (const r of g.remotes.values()) if (r.kind === 'player') test(r);
      return;
    }
    for (const e of g.enemies) test(e);
    for (const r of g.remotes.values()) test(r);
  }
  update(dt) {
    const g = this.g, w = g.world;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const pc = this.flying[i];
      pc.t += dt;
      pc.vel.y -= G * dt;
      const sp = pc.vel.length();
      const len = sp * dt;
      if (len < 1e-5) continue;
      _f.copy(pc.vel).divideScalar(sp);
      this.hitEntities(pc, _f, len);
      const rad = pc.parts ? 1.2 : Math.min(6, Math.max(pc.w.sx, pc.w.sy, pc.w.sz) * 0.45);
      const wh = w.raycast(pc.pos, _f, len + rad);
      let done = false;
      if (wh) {
        const maxSmash = pc.parts ? 6 : 2;
        const smashable = (wh.type === 'box' || wh.type === 'placed' || wh.type === 'tree') && sp > 22 && pc.smash < maxSmash;
        if (smashable && !pc.remote && w.canGrab(wh)) {
          // smash through: tear the wall / knock out the block or tree it hit
          const at = wh.point.clone();
          const op = w.ripOp(wh, _f, { cut: pc.parts ? 5 : 3.8 });
          if (op) {
            g.edit(op);
            pc.smash++; pc.vel.multiplyScalar(pc.parts ? 0.8 : 0.5);
            g.particles.burst(at, wh.type === 'tree' ? 0x5b3e27 : 0x9a948a, 30, 11, 0.4);
            const d = at.distanceTo(g.player.pos);
            if (d < 70) g.shake(0.5 * (1 - d / 70));
            g.sfx.near('hurt', at); g.sfx.near('thunk', at);
            pc.pos.addScaledVector(_f, len);
          } else done = true;
        } else if (smashable && pc.remote) {
          pc.pos.addScaledVector(_f, len); // the owner's edits will arrive
        } else done = true;
        if (done) {
          // stop at the surface, then find what it rests on
          pc.pos.copy(wh.point).addScaledVector(_f, -rad);
          const sup = w.supportY(pc.pos.x, pc.pos.z, pc.pos.y + 0.6, pc.w.sx / 2, pc.w.sz / 2);
          if (sup !== null && pc.pos.y - sup < 60) {
            this.settle(pc, pc.pos.x, sup, pc.pos.z);
            this.dispose(pc); this.flying.splice(i, 1);
            continue;
          }
          pc.vel.set(0, Math.min(pc.vel.y, 0), 0); // nothing under it here: drop straight down
        }
      } else pc.pos.addScaledVector(_f, len);
      if (pc.mesh) { pc.mesh.position.copy(pc.pos); pc.mesh.rotation.x = Math.sin(pc.t * 5) * 0.08 * pc.spin; pc.mesh.rotation.z = Math.cos(pc.t * 4) * 0.06 * pc.spin; }
      if (pc.pos.y < KILL_Y || pc.t > 20) { this.dispose(pc); this.flying.splice(i, 1); }
    }
  }

  // ---- aiming help: a dotted arc and a ghost box where the held piece would land
  makePreview() {
    const N = 64;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xffe14a, dashSize: 0.6, gapSize: 0.45, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    line.frustumCulled = false; line.renderOrder = 4;
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffe14a, fog: false }));
    ghost.add(edges);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2;
    this.g.scene.add(line, ghost, ring);
    this.pv = { line, ghost, ring, N, land: null, t: 0 };
    this.hidePreview();
  }
  hidePreview() { if (this.pv) { this.pv.line.visible = false; this.pv.ghost.visible = false; this.pv.ring.visible = false; this.pv.land = null; this.pv.t = 0; } }
  updatePreview(p, c) {
    if (!this.pv) this.makePreview();
    const g = this.g, w = g.world, pv = this.pv;
    // recomputed 20 times a second (it's a few dozen raycasts)
    if (g.time - pv.t < 0.05 && pv.line.visible) return;
    pv.t = g.time;
    const from = _p.copy(c.mesh.position);
    const vel = _v.copy(this.throwVel(p, from));
    const { w: sz } = this.throwShape(p, c);
    const rad = c.parts ? 1.2 : Math.min(6, Math.max(sz.sx, sz.sy, sz.sz) * 0.45);
    const arr = pv.line.geometry.attributes.position.array;
    const step = 1 / 30;
    let n = 0, land = null;
    const pos = _a.copy(from);
    for (let k = 0; k < pv.N - 1; k++) {
      arr[n * 3] = pos.x; arr[n * 3 + 1] = pos.y; arr[n * 3 + 2] = pos.z; n++;
      vel.y -= G * step;
      const sp = vel.length(), len = sp * step;
      _f.copy(vel).divideScalar(sp);
      const wh = w.raycast(pos, _f, len + rad);
      if (wh) {
        arr[n * 3] = wh.point.x; arr[n * 3 + 1] = wh.point.y; arr[n * 3 + 2] = wh.point.z; n++;
        pos.copy(wh.point).addScaledVector(_f, -rad);
        const sup = w.supportY(pos.x, pos.z, pos.y + 0.6, sz.sx / 2, sz.sz / 2);
        if (sup !== null && pos.y - sup < 60) land = new V(pos.x, sup, pos.z);
        break;
      }
      pos.addScaledVector(_f, len);
      if (pos.y < KILL_Y) break;
    }
    pv.line.geometry.setDrawRange(0, n);
    pv.line.geometry.attributes.position.needsUpdate = true;
    pv.line.geometry.computeBoundingSphere();
    pv.line.computeLineDistances();
    pv.line.visible = n > 1;
    pv.land = land;
    pv.ghost.visible = pv.ring.visible = !!land;
    if (land) {
      pv.ghost.scale.set(sz.sx, sz.sy, sz.sz);
      pv.ghost.position.set(land.x, land.y + sz.sy / 2, land.z);
      pv.ring.scale.setScalar(Math.max(sz.sx, sz.sz) * 0.75 + 0.6);
      pv.ring.position.set(land.x, land.y + 0.08, land.z);
    }
  }
}
