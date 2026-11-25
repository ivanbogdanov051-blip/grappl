import * as THREE from 'three';
import { integrate, launchTo, wallClimb } from './entity.js';
import { KILL_Y, SAFE_RADIUS, SPAWN } from './world.js';
import { makeCharacter, makeHookHead, Rope } from './models.js';
import { HOOK } from './player.js';
import { lerpAngle } from './noise.js';
import { ENEMY_TYPES } from './enemytypes.js';

const V = THREE.Vector3;
const TAU = Math.PI * 2;
const _a = new V(), _b = new V(), _c = new V();
let counter = 0;


// Behaviours: 1 walk (wander), 2 run (chase), 3 grapple-travel to other islands,
// 4 hook-attack (pulls you to them), 5 travel+attack swap (they fly to you, you get flung to their old spot).
export class Enemy {
  constructor(game, pos, type = 'grappler') {
    this.game = game;
    this.id = game.sid + '#' + counter++;
    this.kind = 'enemy';
    this.type = type;
    const T = (this.T = ENEMY_TYPES[type] || ENEMY_TYPES.grappler);
    const s = (this.scale = T.scale);
    this.name = T.name;
    this.pos = pos.clone();
    this.vel = new V();
    this.yaw = Math.random() * TAU; this.pitch = 0;
    this.radius = 0.6 * s; this.height = 1.45 * s;
    this.onGround = false; this.inWater = false; this.ground = null;
    this.climbT = 0; this.hitWall = false; this.wallN = { x: 0, z: 0 }; this.wallGap = 0;
    this.maxHp = T.hp; this.hp = T.hp; this.dead = false; this.lastAttacker = null;
    this.hook = { state: HOOK.IDLE, pos: new V(), dir: new V(), dist: 0, mode: null, anchor: new V(), t: 0, target: null };
    this.model = makeCharacter(T.color, { hp: true, angry: true, ghost: !!T.ghost, crown: !!T.boss, name: T.boss ? T.name : null, tagColor: '#ffd0d0' });
    this.model.group.scale.setScalar(s);
    game.scene.add(this.model.group);
    this.rope = new Rope(0x7a1a1a, 0.035);
    game.scene.add(this.rope.mesh);
    this.head = makeHookHead();
    this.head.scale.setScalar(2.2 * Math.max(1, s * 0.7));
    this.head.visible = false;
    game.scene.add(this.head);
    this.think = Math.random() * 0.5;
    this.cool = 2 + Math.random() * 2;
    this.bumpCool = 0; this.slamCool = 4; this.specialCool = 3 + Math.random() * 3;
    this.travelCool = 4 + Math.random() * 8;
    this.moveTarget = null; this.running = false; this.wanderT = 0; this.moving = false;
  }

  handPos(out) {
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const s = this.scale;
    return out.set(this.pos.x + (rx * 0.85 - Math.sin(this.yaw) * 0.6) * s, this.pos.y + 0.6 * s, this.pos.z + (rz * 0.85 - Math.cos(this.yaw) * 0.6) * s);
  }
  center(out) { return out.set(this.pos.x, this.pos.y + 0.8 * this.scale, this.pos.z); }
  edgeT() {
    if (!this.ground) return 1;
    const s = this.ground.sample(this.pos.x, this.pos.z);
    return s ? s.t : 1;
  }

  update(dt) {
    if (this.dead) return;
    this.cool -= dt; this.slamCool -= dt; this.specialCool -= dt;
    if (this.pulseN > 0) { this.pulseT -= dt; if (this.pulseT <= 0) { this.pulseT = 1; this.pulseN--; this.game.enemyMagnet(this, 45); } } this.think -= dt; this.climbT -= dt; this.bumpCool -= dt; this.travelCool -= dt; this.wanderT -= dt;
    if (this.think <= 0) { this.think = 0.25 + Math.random() * 0.35; this.decide(); }
    this.move(dt);
    integrate(this, dt, this.game.world);
    wallClimb(this, 9, 13);
    if (this.hitWall && this.onGround && this.moveTarget) this.vel.y = 8.5;
    this.updateHook(dt);
    if (this.pos.y < KILL_Y) this.die();
    // visuals
    const m = this.model;
    m.group.position.copy(this.pos);
    m.group.rotation.y = this.yaw;
    m.setHp(this.hp / this.maxHp);
    m.update(dt, this.game.camera, this.moving, this.pitch);
    const h = this.hook;
    m.gunHead.visible = h.state === HOOK.IDLE;
    if (h.state !== HOOK.IDLE) {
      this.handPos(_a);
      this.rope.set(_a, h.pos);
      this.head.visible = true;
      this.head.position.copy(h.pos);
      this.head.lookAt(_a);
    } else { this.rope.hide(); this.head.visible = false; }
  }

  move(dt) {
    let wx = 0, wz = 0;
    if (this.moveTarget && this.onGround) {
      const dx = this.moveTarget.x - this.pos.x, dz = this.moveTarget.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.4) {
        wx = dx / d; wz = dz / d;
        const gnd = this.game.world.groundAt(this.pos.x + wx * 2.2, this.pos.y + 1.5, this.pos.z + wz * 2.2);
        if (gnd === null || gnd < this.pos.y - 2.5) { wx = 0; wz = 0; this.moveTarget = null; }
      } else this.moveTarget = null;
    }
    const sp = this.running ? this.T.run : this.T.walk;
    if (this.onGround) {
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (hs > sp + 1.5) {
        const k = Math.max(0, 1 - 3.5 * dt);
        this.vel.x *= k; this.vel.z *= k;
      } else {
        const k = Math.min(1, 12 * dt);
        this.vel.x += (wx * sp - this.vel.x) * k;
        this.vel.z += (wz * sp - this.vel.z) * k;
      }
      if (wx || wz) this.yaw = lerpAngle(this.yaw, Math.atan2(-wx, -wz), 10 * dt);
    }
    this.moving = !!(wx || wz) && this.onGround;
  }

  los(tg) {
    this.center(_a);
    _b.copy(tg.pos); _b.y += 0.7;
    _c.subVectors(_b, _a);
    const d = _c.length();
    if (d < 2) return true;
    _c.divideScalar(d);
    return !this.game.world.raycast(_a, _c, d - 1.5);
  }

  aimAt(tg) {
    this.handPos(_a);
    const d = _a.distanceTo(tg.pos);
    const t = d / this.T.hookSpeed;
    const p = new V().copy(tg.pos).addScaledVector(tg.vel, t * 0.85);
    p.y += 0.7;
    const spread = (0.5 + d * 0.035) * (this.T.accuracy || 1);
    p.x += (Math.random() - 0.5) * 2 * spread;
    p.y += (Math.random() - 0.5) * 2 * spread * 0.6;
    p.z += (Math.random() - 0.5) * 2 * spread;
    return p;
  }

  // a landing point on another island (facing us), optionally the one closest to `toward`
  findIslandPoint(toward, recovery) {
    const w = this.game.world;
    const me = this.pos;
    let best = null, bestScore = Infinity;
    for (const I of w.islandsInRadius(me.x, me.z, this.T.range)) {
      if (I === this.ground && !recovery) continue;
      if (I.kind === 'spawn' || Math.hypot(I.x - SPAWN.x, I.z - SPAWN.z) < SAFE_RADIUS + 25) continue;
      const a = Math.atan2(me.z - I.z, me.x - I.x);
      const p = I.pointAt(a, I.R < 9 ? 0.3 : 0.72);
      p.y += 0.6;
      const d = p.distanceTo(me);
      if (d > this.T.range * 0.95 || d < 6) continue;
      const score = toward ? p.distanceTo(toward) : recovery ? d + Math.max(0, me.y - p.y) * 0.3 : Math.random() * 100;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  decide() {
    const g = this.game, w = g.world, me = this.pos;
    const h = this.hook;
    // falling into the void? try to grapple back to safety
    if (!this.onGround && this.vel.y < -5 && h.state === HOOK.IDLE) {
      const below = w.groundAt(me.x, me.y, me.z);
      if ((below === null || me.y - below > 25) && Math.random() < 0.7) {
        const p = this.findIslandPoint(null, true);
        if (p) { this.shoot(p, 'travel'); return; }
      }
    }
    if (!this.onGround) return;
    const tg = g.findTarget(this, 150);
    if (tg) {
      this.targetId = tg.id;
      _a.subVectors(tg.pos, me);
      const d = _a.length();
      this.yaw = Math.atan2(-_a.x, -_a.z);
      this.pitch = Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
      const T = this.T;
      if (T.bossKind === 'titan' && this.slamCool <= 0 && d < 17) { this.slamCool = 5 + Math.random() * 3; g.bossSlam(this); return; }
      if (T.bossKind === 'thunder' && this.specialCool <= 0 && d < 90) { this.specialCool = 4.5; g.enemyLightning(this, tg); return; }
      if (T.bossKind === 'void' && this.specialCool <= 0 && d < 45) { this.specialCool = 7; this.pulseN = 3; this.pulseT = 0; }
      if (T.bossKind === 'hive' && this.specialCool <= 0) { this.specialCool = 10; g.hiveSummon(this); }
      if (T.special === 'magnet' && this.specialCool <= 0 && d < 32) { this.specialCool = T.specialCd; g.enemyMagnet(this); return; }
      if (T.special === 'blink' && this.specialCool <= 0 && d < 70 && d > 6 && tg.ground) {
        // teleport right behind the target, then shove them
        _b.subVectors(tg.pos, me).setY(0).normalize();
        const bx = tg.pos.x + _b.x * 3, bz = tg.pos.z + _b.z * 3;
        const gy = w.groundAt(bx, tg.pos.y + 3, bz);
        if (gy !== null && Math.abs(gy - tg.pos.y) < 4) {
          this.specialCool = T.specialCd;
          _c.copy(me); _c.y += 0.7; g.particles.burst(_c, 0x8a9bff, 16, 6, 0.2);
          me.set(bx, gy + 0.2, bz); this.vel.set(0, 0, 0);
          _c.copy(me); _c.y += 0.7; g.particles.burst(_c, 0x8a9bff, 16, 6, 0.2);
          this.yaw = Math.atan2(_b.x, _b.z);
          this.bumpCool = 0; this.think = 0.15;
          g.sfx.near('cancel', me);
          return;
        }
      }
      if (d < 2.4 + 0.8 * this.scale && this.bumpCool <= 0) {
        _a.y = 0; _a.normalize();
        g.deliverHit(tg.id, { mode: 'bump', dmg: T.bumpDmg, k: T.bumpK, d: _a.toArray(), attacker: this.id, aname: this.name });
        this.bumpCool = 1.3;
        return;
      }
      const tgIsland = tg.ground || null;
      const sameIsland = tgIsland && tgIsland === this.ground;
      if (h.state === HOOK.IDLE && this.cool <= 0 && d < this.T.range * 0.95 && this.los(tg)) {
        const risky = this.edgeT() > 0.72;
        const W = T.w;
        const opts = [['pull', W.pull], ['swap', W.swap * (risky ? 1.6 : 1)], ['bomb', d > 10 ? W.bomb || 0 : 0], ['approach', W.approach]];
        let r = Math.random() * opts.reduce((a, o) => a + o[1], 0);
        let mode = null;
        if (!sameIsland || d > 16) { for (const [m, wgt] of opts) { r -= wgt; if (r < 0) { mode = m; break; } } }
        else if (Math.random() < 0.3) mode = W.swap > W.pull ? 'swap' : 'pull';
        if (mode === 'pull' || mode === 'swap' || mode === 'bomb') {
          this.shoot(this.aimAt(tg), mode);
          this.cool = T.cool[0] + Math.random() * (T.cool[1] - T.cool[0]);
          return;
        }
        if (mode === 'approach' && tgIsland && tgIsland.kind !== 'spawn') {
          const a = Math.atan2(me.z - tgIsland.z, me.x - tgIsland.x);
          const p = tgIsland.pointAt(a + (Math.random() - 0.5) * 0.6, 0.65);
          p.y += 0.6;
          if (p.distanceTo(me) < this.T.range * 0.95) { this.shoot(p, 'travel'); this.cool = 1.2; return; }
        }
      }
      if (T.keepAway && d < T.keepAway && h.state === HOOK.IDLE && this.travelCool <= 0) {
        const away = me.clone().addScaledVector(_b.subVectors(me, tg.pos).setY(0).normalize(), 90);
        const p = this.findIslandPoint(away, false);
        this.travelCool = 4;
        if (p) { this.shoot(p, 'travel'); return; }
      }
      if (sameIsland && !T.keepAway) { this.moveTarget = tg.pos.clone(); this.running = true; }
      else if (h.state === HOOK.IDLE && this.travelCool <= 0) {
        const p = this.findIslandPoint(tg.pos, false);
        if (p && p.distanceTo(tg.pos) < me.distanceTo(tg.pos) - 10) { this.shoot(p, 'travel'); this.travelCool = 3 + Math.random() * 3; return; }
        this.travelCool = 1.5;
      }
    } else {
      this.targetId = null;
      this.running = false;
      if (h.state !== HOOK.IDLE) return;
      const nearSpawn = Math.hypot(me.x - SPAWN.x, me.z - SPAWN.z) < SAFE_RADIUS + 30;
      if ((nearSpawn || this.travelCool <= 0) && (nearSpawn || Math.random() < 0.45)) {
        this.travelCool = 9 + Math.random() * 12;
        const p = this.findIslandPoint(null, false);
        if (p) { this.shoot(p, 'travel'); return; }
      }
      if (!this.moveTarget || this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 5;
        if (this.ground) this.moveTarget = this.ground.pointAt(Math.random() * TAU, Math.random() * 0.7);
      }
    }
  }

  shoot(point, mode) {
    const h = this.hook;
    this.handPos(h.pos);
    h.dir.subVectors(point, h.pos).normalize();
    h.state = HOOK.FLYING; h.mode = mode; h.dist = 0; h.t = 0;
    this.yaw = Math.atan2(-h.dir.x, -h.dir.z);
    this.moveTarget = null;
    this.game.sfx.near('shoot', this.pos);
  }

  updateHook(dt) {
    const h = this.hook, g = this.game;
    if (h.state === HOOK.FLYING) {
      const step = this.T.hookSpeed * dt;
      const eh = h.mode !== 'travel' ? g.hitTestEntities(h.pos, h.dir, step, this.id, true) : null;
      const wh = g.world.raycast(h.pos, h.dir, step);
      if (h.mode === 'bomb' && (eh || wh)) {
        const at = eh && (!wh || eh.dist < wh.dist) ? eh.ent.pos.clone().setY(eh.ent.pos.y + 0.7) : wh.point.clone();
        h.pos.copy(at); h.state = HOOK.RETRACT;
        g.enemyExplode(at, this);
      } else if (eh && (!wh || eh.dist < wh.dist)) this.onHookHit(eh.ent);
      else if (wh) {
        h.pos.copy(wh.point);
        if (h.mode === 'travel') { h.state = HOOK.ATTACHED; h.t = 0; h.anchor.copy(wh.point); }
        else h.state = HOOK.RETRACT;
      } else {
        h.pos.addScaledVector(h.dir, step);
        h.dist += step;
        if (h.dist > this.T.range) h.state = HOOK.RETRACT;
      }
    } else if (h.state === HOOK.ATTACHED) {
      h.t += dt;
      if (h.t > 0.15) {
        _a.copy(this.pos); _a.y += 0.7;
        launchTo(this, _a, h.anchor, 40, 5, true, 1.6);
        this.climbT = 1.4;
        h.state = HOOK.IDLE;
        this.moveTarget = null;
        g.sfx.near('zip', this.pos);
      }
    } else if (h.state === HOOK.LATCHED) {
      h.t += dt;
      const tg = g.getEntity(h.target);
      if (tg) { h.pos.copy(tg.pos); h.pos.y += 0.7; }
      if (h.t > 0.35 || !tg) h.state = HOOK.RETRACT;
    } else if (h.state === HOOK.RETRACT) {
      this.handPos(_b);
      _a.subVectors(_b, h.pos);
      const d = _a.length(), st = 160 * dt;
      if (d <= st) h.state = HOOK.IDLE;
      else h.pos.addScaledVector(_a, st / d);
    }
  }

  onHookHit(ent) {
    const h = this.hook, g = this.game;
    h.state = HOOK.LATCHED; h.target = ent.id; h.t = 0;
    if (h.mode === 'pull') {
      _a.copy(this.pos); _a.y += 1.2;
      g.deliverHit(ent.id, { mode: 'pull', dmg: Math.round(10 * this.T.dmg), a: _a.toArray(), attacker: this.id, aname: this.name });
    } else if (h.mode === 'swap') {
      const mine = this.pos.clone(); mine.y += 0.5;
      const theirs = ent.pos.clone(); theirs.y += 1;
      g.deliverHit(ent.id, { mode: 'swap', dmg: Math.round(15 * this.T.dmg), b: mine.toArray(), attacker: this.id, aname: this.name });
      launchTo(this, this.pos, theirs, 45, 3, true);
      this.climbT = 1;
    }
    g.sfx.near('hit', this.pos);
  }

  applyHit(hit) {
    if (this.dead) return;
    this.lastAttacker = { id: hit.attacker, name: hit.aname, t: performance.now() };
    this.hp -= hit.dmg || 0;
    this.model.hit();
    this.cool = Math.min(this.cool, 0.6);
    if (this.T.boss) { /* immovable */ } else if (hit.mode === 'yank' || hit.mode === 'pull') {
      _a.fromArray(hit.a);
      launchTo(this, this.pos, _a, hit.spd || 44, 1, hit.mode === 'pull' || !!hit.parry);
      this.climbT = 0; this.moveTarget = null;
    } else if (hit.mode === 'swap') {
      _a.fromArray(hit.b);
      launchTo(this, this.pos, _a, 45, 2, true);
    } else if (hit.mode === 'bump') {
      const k = hit.k || 1;
      this.vel.x += hit.d[0] * 15 * k; this.vel.z += hit.d[2] * 15 * k; this.vel.y = 7 + 5 * (k - 1); this.braking = false;
      this.onGround = false;
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    _a.copy(this.pos); _a.y += 0.7;
    this.game.particles.burst(_a, 0xe2372f, 26, 9, 0.35);
    this.game.onEnemyDeath(this);
    this.dispose();
  }
  dispose() {
    const s = this.game.scene;
    s.remove(this.model.group); s.remove(this.rope.mesh); s.remove(this.head);
    this.model.dispose(); this.rope.dispose();
  }
}
