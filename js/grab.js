// GROUND GRABBER: ripping pieces out of the world, carrying them, throwing them and letting them land as blocks.
import * as THREE from 'three';
import { G, KILL_Y, pieceGeometry, inSafeZone } from './world.js';

const V = THREE.Vector3;
const _a = new V(), _b = new V(), _f = new V(), _d = new V();
let counter = 0;

export class Grab {
  constructor(game) {
    this.g = game;
    this.flying = [];
    this.heldMat = null;
  }
  mat() { return this.g.world.mats.struct; }
  makeMesh(P, translucent) {
    let m = this.mat();
    if (translucent) {
      if (!this.heldMat) { this.heldMat = m.clone(); this.heldMat.transparent = true; this.heldMat.opacity = 0.82; this.heldMat.onBeforeCompile = m.onBeforeCompile; this.heldMat.customProgramCacheKey = m.customProgramCacheKey; }
      m = this.heldMat;
    }
    const mesh = new THREE.Mesh(pieceGeometry(P), m);
    mesh.castShadow = this.g.world.shadows;
    this.g.scene.add(mesh);
    return mesh;
  }
  dispose(c) { if (c && c.mesh) { this.g.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; } }

  // the hook bit into something: tear a piece out (returns the carried piece, or null)
  rip(hit, dir, p) {
    const g = this.g, w = g.world;
    const op = w.ripOp(hit, dir);
    if (!op) return null;
    const at = hit.point.clone();
    const P = g.edit(op);
    if (!P) return null;
    const c = { ...P, mesh: null };
    c.mesh = this.makeMesh(c, false);
    c.mesh.position.copy(at);
    const col = P.look === 'dirt' ? 0x6e5136 : P.color;
    g.particles.burst(at, col, 22, 8, 0.35);
    if (P.look === 'dirt') g.particles.burst(at, 0x5f8a35, 10, 6, 0.25);
    g.sfx.near('thunk', at);
    return c;
  }
  carryTo(c, pos) { if (c.mesh) c.mesh.position.copy(pos); }
  hold(p, c) {
    this.clearHeld(p);
    p.held = c;
    if (c.mesh) { this.g.scene.remove(c.mesh); c.mesh.geometry.dispose(); }
    c.mesh = this.makeMesh(c, true);
    c.mesh.renderOrder = 3;
    this.g.ui.toast(this.g.ui.touch ? '🟨 Got it! Tap THROW · ✕ drops it' : '🟨 Got it! Click to THROW · Q drops it here');
  }
  clearHeld(p) {
    if (p.hook && p.hook.carry) { this.dispose(p.hook.carry); p.hook.carry = null; }
    if (p.held) { this.dispose(p.held); p.held = null; }
  }
  // the held piece is lifted up over your head, in front of you (above the crosshair, clear of the ground)
  updateHeld(p) {
    const c = p.held;
    if (!c || !c.mesh) return;
    const cam = this.g.camera;
    _f.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    // shown a bit smaller than it really is, so it doesn't hide the sky
    const k = Math.min(1, 1.4 / Math.max(c.sx, c.sy, 0.5));
    c.mesh.scale.setScalar(k);
    c.mesh.position.copy(cam.position).addScaledVector(_f, 1.5 + (c.sz * k) / 2);
    c.mesh.position.y += c.sy * k * 0.5 + 0.35 + Math.sin(this.g.time * 3) * 0.03;
    c.mesh.rotation.set(Math.sin(this.g.time * 2.3) * 0.03, p.yaw, 0, 'YXZ');
  }
  // world-aligned size of a piece flying along `dir` (its long/flat side ends up across the throw)
  aligned(c, dir) {
    const alongX = Math.abs(dir.x) > Math.abs(dir.z);
    return alongX ? { sx: c.sz, sy: c.sy, sz: c.sx } : { sx: c.sx, sy: c.sy, sz: c.sz };
  }
  throwHeld(p) {
    const g = this.g, c = p.held;
    if (!c) return;
    const from = c.mesh ? c.mesh.position.clone() : p.eye();
    this.dispose(c); p.held = null;
    const f = p.forward(_f);
    // aim the arc so the chunk comes down where the crosshair points (it starts below your view)
    const cam = g.camera.position;
    const wh = g.world.raycast(cam, f, 90);
    let dist = wh ? wh.dist : 90;
    const eh = g.hitTestEntities(cam, f, dist, p.id, false);
    if (eh) dist = eh.dist;
    const D = cam.clone().addScaledVector(f, dist).sub(from);
    const t = Math.max(0.12, D.length() / 46);
    const vel = D.divideScalar(t); vel.y += 0.5 * G * t;
    vel.addScaledVector(p.vel, 0.3);
    const w = this.aligned(c, f);
    const pc = this.launch({ id: g.sid + '-pc' + counter++, pos: from, vel, w, look: c.look, color: c.color, surf: c.surf, owner: p.id, oname: g.name, remote: false });
    g.sfx.zip(); g.shake(0.2);
    if (g.net) g.net.send({ t: 'throw', id: pc.id, x: from.x, y: from.y, z: from.z, vx: vel.x, vy: vel.y, vz: vel.z, sx: w.sx, sy: w.sy, sz: w.sz, look: c.look, color: c.color, surf: c.surf, owner: p.id, oname: g.name });
  }
  // Q while holding: set it down right in front of you (or let it fall if there's nothing there)
  dropHeld(p) {
    const g = this.g, c = p.held;
    if (!c) return;
    const f = p.forward(_f); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const w = this.aligned(c, f);
    const dist = 1.4 + Math.max(w.sx, w.sz) / 2;
    const x = p.pos.x + f.x * dist, z = p.pos.z + f.z * dist;
    const sup = g.world.supportY(x, z, p.pos.y + 2.5, w.sx / 2, w.sz / 2);
    this.dispose(c); p.held = null;
    if (sup === null || p.pos.y - sup > 6 || inSafeZone(p.pos)) {
      const pos = new V(x, p.pos.y + 1.2, z);
      this.launch({ id: g.sid + '-pc' + counter++, pos, vel: new V(f.x * 4, 2, f.z * 4), w, look: c.look, color: c.color, surf: c.surf, owner: p.id, oname: g.name, remote: false });
      return;
    }
    this.settle({ id: g.sid + '-pc' + counter++, w, look: c.look, color: c.color, surf: c.surf, remote: false }, x, sup, z);
    g.sfx.thunk();
  }
  launch(o) {
    const pc = { ...o, hit: new Set(), smash: 0, t: 0, spin: (Math.random() - 0.5) * 2 };
    pc.mesh = this.makeMesh({ ...o.w, look: o.look, color: o.color, surf: o.surf }, false);
    pc.mesh.position.copy(o.pos);
    this.flying.push(pc);
    return pc;
  }
  fromNet(m) {
    if (this.flying.some((x) => x.id === m.id)) return;
    const n = (v) => (isFinite(v) ? +v : 0);
    const w = { sx: Math.min(8, Math.abs(n(m.sx)) || 1), sy: Math.min(8, Math.abs(n(m.sy)) || 1), sz: Math.min(8, Math.abs(n(m.sz)) || 1) };
    this.launch({ id: String(m.id), pos: new V(n(m.x), n(m.y), n(m.z)), vel: new V(n(m.vx), n(m.vy), n(m.vz)), w, look: String(m.look || 'box'), color: m.color | 0, surf: m.surf | 0, owner: m.owner, oname: String(m.oname || 'Player').slice(0, 16), remote: true });
  }
  // someone's block landed (their 'place' op): drop our copy of the flying piece
  landedRemote(pid) {
    const i = this.flying.findIndex((x) => x.id === pid);
    if (i >= 0) { this.dispose(this.flying[i]); this.flying.splice(i, 1); }
  }
  settle(pc, x, sup, z) {
    const g = this.g, w = pc.w;
    const y = sup + w.sy / 2;
    if (!pc.remote) g.edit({ o: 'place', pid: pc.id, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), sx: +w.sx.toFixed(2), sy: +w.sy.toFixed(2), sz: +w.sz.toFixed(2), look: pc.look, color: pc.color, surf: pc.surf });
    _a.set(x, sup + 0.2, z);
    g.particles.burst(_a, pc.look === 'dirt' ? 0x7a5c3e : 0x9a948a, 18, 7, 0.35);
    const d = _a.distanceTo(g.player.pos);
    if (d < 60) g.shake(0.35 * (1 - d / 60));
    g.sfx.near('thunk', _a);
  }
  // segment vs. entity spheres: a flying block hits anyone in its way
  hitEntities(pc, dir, len) {
    const g = this.g;
    const rad = Math.max(pc.w.sx, pc.w.sy, pc.w.sz) * 0.5;
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
      const dmg = Math.round(Math.max(18, Math.min(45, 14 + vol * 4)));
      const l = Math.hypot(dir.x, dir.z) || 1;
      g.deliverHit(ent.id, { mode: 'bump', dmg, k: 1.3, d: [dir.x / l, 0, dir.z / l], stun: 2.2, attacker: pc.owner, aname: pc.oname });
      if (pc.owner === g.player.id) { g.ui.hitMarker(); g.ui.toast(`💫 STUNNED ${ent.name}! (${dmg})`); }
      g.particles.burst(_a, 0xffe14a, 16, 7, 0.22);
      g.sfx.near('hit', _a);
      pc.vel.multiplyScalar(0.55);
    };
    if (pc.owner !== g.player.id) return; // the thrower's game decides who got hit
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
      if (!pc.remote) this.hitEntities(pc, _f, len);
      const rad = Math.max(pc.w.sx, pc.w.sy, pc.w.sz) * 0.45;
      const wh = w.raycast(pc.pos, _f, len + rad);
      let done = false;
      if (wh) {
        const smashable = (wh.type === 'box' || wh.type === 'placed' || wh.type === 'tree') && sp > 22 && pc.smash < 2;
        if (smashable && !pc.remote && w.canGrab(wh)) {
          // smash through: tear the wall / knock out the block or tree it hit
          const at = wh.point.clone();
          const op = w.ripOp(wh, _f);
          if (op) {
            g.edit(op);
            pc.smash++; pc.vel.multiplyScalar(0.5);
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
}
