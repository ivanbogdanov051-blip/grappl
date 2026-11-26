import * as THREE from 'three';
import { integrate, launchTo, wallClimb } from './entity.js';
import { KILL_Y, SPAWN, G, inSafeZone } from './world.js';
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
    this.cd = {}; this.parryT = 0; this.parried = new Set(); this.shieldT = 0; this.glideT = 0; this.superShot = 0; this.hist = []; this.histT = 0;
    this.slowT = 0; this.cloakT = 0; this.jetT = 0; this.vampT = 0; this.rageT = 0; this.snipeT = 0;
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
    this.hist.length = 0; this.superShot = 0; this.parryT = 0; this.shieldT = 0; this.glideT = 0;
    this.slowT = 0; this.cloakT = 0; this.jetT = 0; this.vampT = 0; this.rageT = 0; this.snipeT = 0;
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
      h.dist = 0.4; h.target = null; h.swap = false; h.bomb = false;
      h.super = this.superShot > 0 && !this.onGround;
      h.snipe = this.snipeT > 0;
      if (h.snipe) { this.snipeT = 0; h.super = false; g.sfx.parry(); }
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
    if (this.snipeT > 0 && h.state === HOOK.IDLE) { this.snipeT = 0; this.game.ui.toast('🎯 Snipe cancelled'); return; }
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
        h.state = HOOK.FLYING; h.swap = true; h.bomb = false; h.super = false;
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
      case 'bomb': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        const h = this.hook;
        h.pos.copy(g.camera.position).addScaledVector(f, 0.4);
        h.dir.copy(f); h.dist = 0.4; h.target = null;
        h.state = HOOK.FLYING; h.bomb = true; h.swap = false; h.super = false;
        g.sfx.shoot(); g.recoil = 1;
        break;
      }
      case 'magnet': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        f.y = 0; f.normalize();
        const pt = this.eye(_b).addScaledVector(f, 3);
        let n = 0;
        const pull = (ent) => {
          if (ent.dead || ent === this || ent.pos.distanceTo(this.pos) > 35) return;
          g.deliverHit(ent.id, { mode: 'pull', dmg: 10, a: pt.toArray(), attacker: this.id, aname: g.name });
          n++;
        };
        g.enemies.forEach(pull);
        g.remotes.forEach(pull);
        _a.copy(this.pos); _a.y += 0.8;
        g.particles.burst(_a, 0xc77dff, 30, 12, 0.22);
        g.sfx.zip();
        g.ui.toast(n ? `🧲 Pulled in ${n}!` : '🧲 Nobody in range');
        break;
      }
      case 'titanslam':
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        g.shockwave(this, 18, 35, 1.5);
        _a.copy(this.pos); _a.y += 0.3;
        g.particles.burst(_a, 0xff7a2a, 40, 16, 0.4);
        g.shake(0.9);
        break;
      case 'thunder': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        const o = g.camera.position;
        const wh = g.world.raycast(o, f, 120);
        let pt = wh ? wh.point.clone() : o.clone().addScaledVector(f, 60);
        const eh = g.hitTestEntities(o, f, wh ? wh.dist : 120, this.id, false);
        if (eh) pt = o.clone().addScaledVector(f, eh.dist);
        g.addStrike(pt, 0.45, 7, 45, this, false);
        break;
      }
      case 'blackhole': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        const o = g.camera.position;
        const wh = g.world.raycast(o, f, 80);
        let pt = wh ? wh.point.clone() : o.clone().addScaledVector(f, 40);
        const eh = g.hitTestEntities(o, f, wh ? wh.dist : 80, this.id, false);
        if (eh) pt = o.clone().addScaledVector(f, eh.dist);
        pt.y += 2;
        g.addWell(pt, this);
        break;
      }
      case 'missiles':
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        if (!g.fireMissiles(this)) { g.ui.toast('🐝 No targets within 70 m'); return false; }
        break;
      case 'fireball': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        g.fireBolt(this, f);
        break;
      }
      case 'frost': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        let n = 0;
        const fr = (ent) => {
          if (ent.dead || ent === this || ent.pos.distanceTo(this.pos) > 16) return;
          const dx = ent.pos.x - this.pos.x, dz = ent.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
          g.deliverHit(ent.id, { mode: 'bump', dmg: 10, k: 0.3, d: [dx / l, 0, dz / l], freeze: 3, attacker: this.id, aname: g.name });
          n++;
        };
        g.enemies.forEach(fr); g.remotes.forEach(fr);
        _a.copy(this.pos); _a.y += 0.6;
        g.particles.burst(_a, 0xbfefff, 50, 16, 0.35); g.particles.burst(_a, 0xffffff, 20, 9, 0.25);
        g.sfx.parry(); g.ui.toast(n ? `❄️ Froze ${n}!` : '❄️ Nobody in range');
        break;
      }
      case 'cloak':
        this.cloakT = 5;
        _a.copy(this.pos); _a.y += 0.8; g.particles.burst(_a, 0xdddddd, 20, 5, 0.3);
        g.sfx.cancel(); g.ui.toast('👻 Invisible for 5 s');
        break;
      case 'chain':
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        if (!g.chainLightning(this)) { g.ui.toast('🌩️ No enemy within 35 m'); return false; }
        break;
      case 'tornado': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        let n = 0;
        const tw = (ent) => {
          if (ent.dead || ent === this || ent.pos.distanceTo(this.pos) > 14) return;
          const dx = ent.pos.x - this.pos.x, dz = ent.pos.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
          g.deliverHit(ent.id, { mode: 'bump', dmg: 12, k: 4.2, d: [dx / l * 0.18, 0, dz / l * 0.18], attacker: this.id, aname: g.name });
          n++;
        };
        g.enemies.forEach(tw); g.remotes.forEach(tw);
        for (let i = 0; i < 6; i++) { _a.copy(this.pos); _a.y += i * 1.5; g.particles.burst(_a, 0xd8e4ee, 12, 6 + i, 0.3); }
        g.sfx.zip(); g.shake(0.3); g.ui.toast(n ? `🌪️ Launched ${n}!` : '🌪️ Nobody in range');
        break;
      }
      case 'mine':
        if (this.safe) { g.ui.toast('🛡️ No mines in the safe zone'); return false; }
        g.placeMine(this);
        break;
      case 'timewarp':
        g.warpT = 5;
        g.sfx.parry(); g.ui.toast('⏳ Time slowed!');
        break;
      case 'jetpack':
        this.jetT = 2.5;
        if (this.onGround) { this.pos.y += 0.1; this.vel.y = 8; this.onGround = false; }
        this.braking = false;
        g.sfx.zip(); g.ui.toast('🚀 Jetpack! Look where you want to fly');
        break;
      case 'vampire':
        this.vampT = 6;
        _a.copy(this.pos); _a.y += 0.8; g.particles.burst(_a, 0xb0002a, 22, 6, 0.25);
        g.sfx.buy(); g.ui.toast('🩸 Vampire: hits heal you');
        break;
      case 'rage':
        this.rageT = 5;
        _a.copy(this.pos); _a.y += 0.8; g.particles.burst(_a, 0xff3a1a, 26, 8, 0.25);
        g.sfx.hurt(); g.shake(0.3); g.ui.toast('😡 RAGE: double damage!');
        break;
      case 'meteor': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        const o = g.camera.position;
        const wh = g.world.raycast(o, f, 120);
        let pt = wh ? wh.point.clone() : o.clone().addScaledVector(f, 60);
        const eh = g.hitTestEntities(o, f, wh ? wh.dist : 120, this.id, false);
        if (eh) pt = o.clone().addScaledVector(f, eh.dist);
        g.meteorRain(this, pt, 7, 9, false);
        break;
      }
      case 'snipe': {
        if (this.safe) { g.ui.toast('🛡️ No attacking from the safe zone'); return false; }
        if (this.hook.state !== HOOK.IDLE) this.hook.state = HOOK.IDLE;
        // lock onto the closest enemy / player in sniping range
        const maxD = this.stats.range * 3;
        let best = null, bd = maxD;
        const test = (ent) => { if (ent.dead || ent === this) return; const d = ent.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = ent; } };
        g.enemies.forEach(test); g.remotes.forEach(test);
        if (best) {
          const e = this.eye(_a), sc = best.scale || 1;
          const dx = best.pos.x - e.x, dy = best.pos.y + 0.7 * sc - e.y, dz = best.pos.z - e.z;
          this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        }
        this.snipeT = 8;
        g.sfx.cancel();
        g.ui.toast(best ? `🎯 Locked on ${best.name} (${Math.round(bd)} m). Shoot!` : '🎯 Sniper ready (no target in range). Shoot!');
        break;
      }
      case 'parry':
        this.parryT = 2; this.parried.clear();
        _a.copy(this.pos); _a.y += 0.8;
        g.particles.burst(_a, 0xffd23a, 24, 7, 0.2);
        g.sfx.parry(); g.ui.toast('⚔️ PARRY!');
        break;
      case 'shield':
        this.shieldT = 4;
        _a.copy(this.pos); _a.y += 0.8;
        g.particles.burst(_a, 0x6fd3ff, 24, 6, 0.2);
        g.sfx.buy();
        break;
      case 'glide':
        this.glideT = 6;
        if (this.vel.y < 0) this.vel.y *= 0.3;
        g.sfx.jump(); g.ui.toast('🪂 Gliding!');
        break;
      case 'heal':
        if (this.hp >= this.stats.health) { g.ui.toast('💚 Already at full health'); return false; }
        this.hp = Math.min(this.stats.health, this.hp + 50);
        _a.copy(this.pos); _a.y += 0.8;
        g.particles.burst(_a, 0x4dff88, 26, 6, 0.2);
        g.sfx.coin();
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
    if (this.parryT > 0) {
      if (hit.attacker && hit.attacker !== this.id && !this.parried.has(hit.attacker)) {
        this.parried.add(hit.attacker);
        const pt = this.eye(_b);
        g.deliverHit(hit.attacker, { mode: 'yank', spd: 120, dmg: 50, parry: true, a: pt.toArray(), attacker: this.id, aname: g.name });
        g.ui.toast(`⚔️ PARRIED ${hit.aname}!`); g.sfx.parry(); g.shake(0.4);
        _a.copy(this.pos); _a.y += 0.8; g.particles.burst(_a, 0xffd23a, 30, 12, 0.25);
      }
      return;
    }
    if (this.shieldT > 0) { g.ui.toast('🛡️ Blocked!'); _a.copy(this.pos); _a.y += 0.8; g.particles.burst(_a, 0x6fd3ff, 10, 5, 0.15); return; }
    this.lastAttacker = { id: hit.attacker, name: hit.aname, t: performance.now() };
    this.hp -= hit.dmg || 0;
    this.lastHurt = g.time;
    g.hurtFlash(); g.shake(0.5); g.sfx.hurt();
    if (hit.freeze) { this.slowT = Math.max(this.slowT, hit.freeze); g.ui.toast(`❄️ Frozen by ${hit.aname}! You're slowed`); }
    if (hit.mode === 'pull' || hit.mode === 'yank') {
      _a.fromArray(hit.a);
      launchTo(this, this.pos, _a, hit.spd || (hit.mode === 'yank' ? 44 : 38), hit.mode === 'yank' ? 1 : 3, hit.mode === 'pull' || !!hit.parry);
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
    const maxSp = (running ? s.speed : 7) * (this.slowT > 0 ? 0.45 : 1);
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
      const air = (this.glideT > 0 ? 34 : 16) * dt;
      const nvx = this.vel.x + wx * air, nvz = this.vel.z + wz * air;
      const nhs = Math.hypot(nvx, nvz), lim = Math.max(hs, this.glideT > 0 ? 24 : maxSp);
      if (nhs > lim && nhs > 0) { this.vel.x = (nvx / nhs) * lim; this.vel.z = (nvz / nhs) * lim; }
      else { this.vel.x = nvx; this.vel.z = nvz; }
      const drag = Math.max(0, 1 - 0.04 * dt);
      this.vel.x *= drag; this.vel.z *= drag;
      if (this.inWater && input.consumeJump()) this.vel.y = 8;
    }
    this.climbT -= dt;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.parryT > 0) this.parryT -= dt;
    for (const k of ['slowT', 'cloakT', 'vampT', 'rageT', 'snipeT']) if (this[k] > 0) this[k] -= dt;
    if (this.jetT > 0) {
      this.jetT -= dt;
      const jf = this.forward(_c);
      _a.set(jf.x * 27, Math.max(jf.y * 27, 3), jf.z * 27);
      this.vel.lerp(_a, Math.min(1, 3.5 * dt));
      this.vel.y += G * dt; // cancel gravity while the jets fire
      this.braking = false;
      if (Math.random() < dt * 40) { _b.copy(this.pos); g.particles.burst(_b, Math.random() < 0.5 ? 0xffb020 : 0xff5a1a, 2, 4, 0.2); }
    }
    if (this.glideT > 0) { this.glideT -= dt; if (this.onGround && this.glideT < 5.7) this.glideT = 0; else if (this.vel.y < -3.5) this.vel.y = -3.5; }
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
      const mul = h.snipe ? 3 : h.super ? 2 : 1;
      const step = s.hookSpeed * mul * dt;
      const wh = h.snipe ? null : g.world.raycast(h.pos, h.dir, step); // a snipe flies through walls
      const wd = wh ? wh.dist : Infinity;
      if (wh) _c.copy(wh.point);
      const eh = this.safe ? null : g.hitTestEntities(h.pos, h.dir, step, this.id, false);
      if (h.bomb && ((eh && eh.dist < wd) || wh)) {
        const at = eh && eh.dist < wd ? eh.ent.pos.clone().setY(eh.ent.pos.y + 0.7) : _c.clone();
        h.pos.copy(at); h.state = HOOK.RETRACT; h.bomb = false;
        g.explode(at, this);
      } else if (eh && eh.dist < wd && h.swap) {
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
        g.deliverHit(eh.ent.id, { mode: 'latch', dmg: Math.round(s.damage * (h.snipe ? 2.5 : 1)), attacker: this.id, aname: g.name });
        if (h.snipe) { g.ui.toast('🎯 SNIPED!'); g.particles.burst(h.pos, 0xff3a3a, 24, 10, 0.25); g.shake(0.3); }
        h.snipe = false;
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
        if (h.snipe) g.particles.burst(h.pos, 0xff5050, 1, 0.5, 0.25);
        if (h.dist >= s.range * mul) { h.state = HOOK.RETRACT; h.snipe = false; }
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
