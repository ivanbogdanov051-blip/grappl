import * as THREE from 'three';
import { integrate, launchTo, wallClimb } from './entity.js';
import { KILL_Y, SPAWN, inSafeZone } from './world.js';
import { ABILITY } from './upgrades.js';

const V = THREE.Vector3;
const TAU = Math.PI * 2;
export const HOOK = { IDLE: 0, FLYING: 1, ATTACHED: 2, LATCHED: 3, RETRACT: 4 };
const _a = new V(), _b = new V(), _c = new V(), _f = new V();

export class Player {
  constructor(game) {
    this.game = game;
    this.id = 'me';
    this.kind = 'player';
    this.pos = new V(0, SPAWN.y + 5, 0);
    this.vel = new V();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.55; this.height = 1.45; this.eyeH = 1.22;
    this.onGround = false; this.inWater = false; this.ground = null;
    this.climbT = 0; this.hitWall = false; this.wallN = { x: 0, z: 0 }; this.wallGap = 0;
    this.hp = 100; this.dead = false; this.deadT = 0; this.lastAttacker = null;
    this.hook = { state: HOOK.IDLE, pos: new V(), dir: new V(), dist: 0, target: null, anchor: new V() };
    this.safe = true;
    this.cd = {}; this.superShot = 0; this.hist = []; this.histT = 0;
  }
  get stats() { return this.game.stats; }
  eye(out = new V()) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  forward(out = new V()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  respawn() {
    const a = Math.random() * TAU, d = Math.random() * 5;
    this.pos.set(SPAWN.x + Math.cos(a) * d, this.game.world.spawnTop() + 1.5, SPAWN.z + Math.sin(a) * d);
    this.vel.set(0, 0, 0);
    this.hp = this.stats.health;
    this.braking = false;
    this.dead = false;
    this.hook.state = HOOK.IDLE;
    this.yaw = Math.random() * TAU;
    this.pitch = 0;
    this.lastAttacker = null;
    this.climbT = 0;
    this.hist.length = 0; this.superShot = 0;
    this.game.ui.hideDeath();
  }
  die(msg) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 5;
    this.hp = 0;
    this.hook.state = HOOK.IDLE;
    this.game.onLocalDeath(this, msg);
  }

  // ---- actions
  shoot() {
    if (this.dead) return;
    const g = this.game, s = this.stats, h = this.hook;
    if (h.state === HOOK.IDLE) {
      const o = _a.copy(g.camera.position);
      const f = this.forward(_f);
      // the hook travels exactly along the crosshair ray (rope is drawn from the gun muzzle)
      h.pos.copy(o).addScaledVector(f, 0.4);
      h.dir.copy(f);
      h.dist = 0.4; h.target = null; h.swap = false;
      h.super = this.superShot > 0 && !this.onGround;
      if (h.super) { this.superShot = 0; g.ui.toast('⚡ SUPER SHOT'); }
      h.state = HOOK.FLYING;
      g.sfx.shoot();
      g.recoil = 1;
    } else if (h.state === HOOK.ATTACHED) {
      _a.copy(this.pos); _a.y += 0.7;
      const mul = h.super ? 2 : 1;
      launchTo(this, _a, h.anchor, s.pull * mul, s.climbUp * mul, true, 1.6);
      this.climbT = 1.5;
      h.state = HOOK.IDLE;
      g.sfx.zip();
    } else if (h.state === HOOK.LATCHED) {
      const tg = g.getEntity(h.target);
      if (tg && !tg.dead) {
        _a.subVectors(this.pos, tg.pos); _a.y = 0;
        if (_a.lengthSq() < 1e-4) _a.set(0, 0, 1);
        _a.normalize();
        const pt = this.eye(_b).addScaledVector(_a, 5);
        pt.y += 1.5;
        g.deliverHit(tg.id, { mode: 'yank', dmg: Math.round(s.damage * 0.5), a: pt.toArray(), attacker: this.id, aname: g.name });
        g.sfx.zip();
      }
      h.state = HOOK.IDLE;
    }
  }
  cancel() {
    const h = this.hook;
    if (h.state === HOOK.FLYING || h.state === HOOK.ATTACHED || h.state === HOOK.LATCHED) {
      h.state = HOOK.RETRACT;
      this.game.sfx.cancel();
    }
  }

  useAbility(key) {
    const g = this.game, A = ABILITY[key];
    if (this.dead || !A) return false;
    if ((this.cd[key] || 0) > 0) return false;
    const f = this.forward(_f);
    switch (key) {
      case 'swap': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        const h = this.hook;
        h.pos.copy(g.camera.position).addScaledVector(f, 0.4);
        h.dir.copy(f); h.dist = 0.4; h.target = null;
        h.state = HOOK.FLYING; h.swap = true; h.super = false;
        g.sfx.shoot(); g.recoil = 1;
        break;
      }
      case 'leap':
        this.vel.y = 40; this.onGround = false; this.pos.y += 0.1; this.braking = false;
        this.superShot = 10;
        g.particles.burst(this.pos, 0xffd23a, 18, 8, 0.25);
        g.sfx.zip(); g.ui.toast('🦘 Next mid-air shot is ×2!');
        break;
      case 'dash':
        this.vel.set(f.x * 38, Math.max(f.y * 38, 0) + 5, f.z * 38);
        this.onGround = false; this.braking = false; this.pos.y += 0.05;
        g.sfx.zip(); g.shake(0.25);
        break;
      case 'shock':
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        g.shockwave(this);
        break;
      case 'rewind': {
        if (this.hist.length < 3) return false;
        _a.copy(this.pos); _a.y += 0.7;
        g.particles.burst(_a, 0x7fd4ff, 16, 6, 0.2);
        this.pos.copy(this.hist[0]);
        this.vel.set(0, 0, 0); this.braking = false; this.climbT = 0;
        this.hist.length = 0;
        this.hook.state = HOOK.IDLE;
        _a.copy(this.pos); _a.y += 0.7;
        g.particles.burst(_a, 0x7fd4ff, 16, 6, 0.2);
        g.sfx.buy();
        break;
      }
    }
    this.cd[key] = A.cd;
    return true;
  }

  applyHit(hit) {
    if (this.dead) return;
    const g = this.game;
    if (inSafeZone(this.pos)) { g.ui.toast('🛡️ Safe zone protected you'); return; }
    this.lastAttacker = { id: hit.attacker, name: hit.aname, t: performance.now() };
    this.hp -= hit.dmg || 0;
    this.lastHurt = g.time;
    g.hurtFlash(); g.shake(0.5); g.sfx.hurt();
    if (hit.mode === 'pull' || hit.mode === 'yank') {
      _a.fromArray(hit.a);
      launchTo(this, this.pos, _a, hit.mode === 'yank' ? 44 : 38, hit.mode === 'yank' ? 1 : 3, hit.mode === 'pull');
      this.climbT = 0;
      g.ui.toast(hit.mode === 'pull' ? `🪝 Hooked by ${hit.aname}!` : `🪝 Yanked by ${hit.aname}!`);
    } else if (hit.mode === 'swap') {
      _a.fromArray(hit.b);
      launchTo(this, this.pos, _a, 45, 2, true);
      this.climbT = 0;
      g.ui.toast(`🔄 SWAPPED by ${hit.aname}! Grapple to safety!`);
    } else if (hit.mode === 'bump') {
      const k = hit.k || 1;
      this.vel.x += hit.d[0] * 15 * k; this.vel.z += hit.d[2] * 15 * k; this.vel.y = 7 + 5 * (k - 1); this.braking = false;
      this.onGround = false;
    } else if (hit.mode === 'latch') {
      g.ui.toast(`⚠️ ${hit.aname} hooked you!`);
    }
    if (this.hp <= 0) this.die(`Taken out by ${hit.aname}`);
  }

  // ---- per frame
  update(dt, input) {
    const g = this.game;
    if (this.dead) {
      this.deadT -= dt;
      g.ui.deathCount(Math.max(0, Math.ceil(this.deadT)));
      if (this.deadT <= 0) this.respawn();
      return;
    }
    const s = this.stats;
    const mx = input.mx, my = input.my;
    let wx = -Math.sin(this.yaw) * my + Math.cos(this.yaw) * mx;
    let wz = -Math.cos(this.yaw) * my - Math.sin(this.yaw) * mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const running = input.run || input.stickMag > 0.92;
    const maxSp = running ? s.speed : 7;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround) {
      if (hs > maxSp + 1) {
        const k = Math.max(0, 1 - 3.5 * dt);
        this.vel.x *= k; this.vel.z *= k;
        this.vel.x += wx * 20 * dt; this.vel.z += wz * 20 * dt;
      } else {
        const k = Math.min(1, 14 * dt);
        this.vel.x += (wx * maxSp - this.vel.x) * k;
        this.vel.z += (wz * maxSp - this.vel.z) * k;
      }
      if (input.consumeJump()) { this.vel.y = 9.5; this.onGround = false; g.sfx.jump(); }
    } else {
      const air = 16 * dt;
      const nvx = this.vel.x + wx * air, nvz = this.vel.z + wz * air;
      const nhs = Math.hypot(nvx, nvz), lim = Math.max(hs, maxSp);
      if (nhs > lim && nhs > 0) { this.vel.x = (nvx / nhs) * lim; this.vel.z = (nvz / nhs) * lim; }
      else { this.vel.x = nvx; this.vel.z = nvz; }
      const drag = Math.max(0, 1 - 0.04 * dt);
      this.vel.x *= drag; this.vel.z *= drag;
      if (this.inWater && input.consumeJump()) this.vel.y = 8;
    }
    this.climbT -= dt;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.superShot > 0) { this.superShot -= dt; if (this.onGround && this.superShot < 9.5) this.superShot = 0; }
    this.histT -= dt;
    if (this.histT <= 0) { this.histT = 0.1; this.hist.push(this.pos.clone()); if (this.hist.length > 30) this.hist.shift(); }
    integrate(this, dt, g.world);
    wallClimb(this, s.climbReach, s.climbSpeed);
    this.updateHook(dt);
    this.safe = inSafeZone(this.pos);
    if (this.hp < s.health) {
      const calm = g.time - (this.lastHurt || -99) > 4;
      const rate = this.safe ? 15 : calm ? 6 : 0;
      this.hp = Math.min(s.health, this.hp + rate * dt);
    }
    const c = g.world.collectCoins(this.pos);
    if (c) g.addCoins(c * 2, true);
    if (this.pos.y < KILL_Y) this.die('You fell into the clouds!');
  }

  updateHook(dt) {
    const h = this.hook, g = this.game, s = this.stats;
    if (h.state === HOOK.FLYING) {
      const mul = h.super ? 2 : 1;
      const step = s.hookSpeed * mul * dt;
      const wh = g.world.raycast(h.pos, h.dir, step);
      const wd = wh ? wh.dist : Infinity;
      if (wh) _c.copy(wh.point);
      const eh = this.safe ? null : g.hitTestEntities(h.pos, h.dir, step, this.id, false);
      if (eh && eh.dist < wd && h.swap) {
        const tg = eh.ent;
        const mine = this.pos.clone(); mine.y += 0.5;
        const theirs = tg.pos.clone(); theirs.y += 1;
        g.deliverHit(tg.id, { mode: 'swap', dmg: 15, b: mine.toArray(), attacker: this.id, aname: g.name });
        launchTo(this, this.pos, theirs, 50, 3, true);
        this.climbT = 1;
        h.state = HOOK.RETRACT; h.swap = false;
        g.sfx.hit(); g.ui.hitMarker(); g.ui.toast('🔄 SWAPPED!');
        g.particles.burst(theirs, 0xb48bff, 16, 7, 0.2);
      } else if (eh && eh.dist < wd) {
        h.state = HOOK.LATCHED;
        h.target = eh.ent.id;
        h.pos.copy(eh.ent.pos); h.pos.y += 0.7;
        g.deliverHit(eh.ent.id, { mode: 'latch', dmg: s.damage, attacker: this.id, aname: g.name });
        g.sfx.hit(); g.ui.hitMarker();
        g.particles.burst(h.pos, 0xffffff, 10, 6, 0.15);
      } else if (wh && h.swap) {
        h.pos.copy(_c); h.state = HOOK.RETRACT; h.swap = false;
      } else if (wh) {
        h.pos.copy(_c); h.anchor.copy(_c);
        h.state = HOOK.ATTACHED;
        g.sfx.thunk();
        g.particles.burst(h.pos, 0x8b7b6a, 6, 4, 0.15);
      } else {
        h.pos.addScaledVector(h.dir, step);
        h.dist += step;
        if (h.dist >= s.range * mul) h.state = HOOK.RETRACT;
      }
    } else if (h.state === HOOK.LATCHED) {
      const tg = g.getEntity(h.target);
      if (!tg || tg.dead) h.state = HOOK.RETRACT;
      else {
        h.pos.copy(tg.pos); h.pos.y += 0.7;
        if (h.pos.distanceTo(this.pos) > s.range * 1.6) h.state = HOOK.RETRACT;
      }
    } else if (h.state === HOOK.RETRACT) {
      g.muzzleWorld(_a);
      _b.subVectors(_a, h.pos);
      const d = _b.length(), st = 240 * dt;
      if (d <= st) h.state = HOOK.IDLE;
      else h.pos.addScaledVector(_b, st / d);
    }
  }
}
