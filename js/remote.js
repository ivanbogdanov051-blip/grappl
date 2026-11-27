import * as THREE from 'three';
import { makeCharacter, makeHookHead, Rope } from './models.js';
const HOOK_KINDS = ['normal', 'grabber', 'lightrope', 'boomerang', 'frost', 'warp'];
const HOOK_STYLE = { normal: [0x1d4d24, 0.035, 2.2], grabber: [0x1a1a1a, 0.06, 3.4], lightrope: [0xc9ccd0, 0.02, 1.6], boomerang: [0xff7a1a, 0.02, 4.2], frost: [0x9fe0ff, 0.03, 2.4], warp: [0x9b6bff, 0.016, 3] };
import { lerpAngle } from './noise.js';
import { ENEMY_TYPES } from './enemytypes.js';

const V = THREE.Vector3;
const _a = new V();

// A player or enemy simulated on another peer's machine; we only display + interpolate it.
export class Remote {
  constructor(game, id, kind, name, owner, type) {
    this.game = game;
    this.id = id; this.kind = kind; this.name = name; this.owner = owner;
    const isP = kind === 'player';
    const T = (this.T = isP ? null : ENEMY_TYPES[type] || ENEMY_TYPES.grappler);
    this.scale = T ? T.scale : 1;
    if (T) this.name = T.name;
    this.model = makeCharacter(isP ? 0x2fd05a : T.color, { name: isP ? name : T.boss ? T.name : null, hp: true, angry: !isP, ghost: !!(T && T.ghost), crown: !!(T && T.boss), glow: isP ? 0x3dff6a : null, hpColor: isP ? 0x6dff7a : 0xff4040, tagColor: isP ? '#fff' : '#ffd0d0' });
    this.model.group.scale.setScalar(this.scale);
    game.scene.add(this.model.group);
    this.rope = new Rope(isP ? 0x1d4d24 : 0x7a1a1a, 0.035);
    game.scene.add(this.rope.mesh);
    this.head = makeHookHead();
    this.head.scale.setScalar(2.2 * Math.max(1, this.scale * 0.7));
    this.head.visible = false;
    game.scene.add(this.head);
    this.pos = new V(); this.target = new V(); this.vel = new V();
    this.yaw = 0; this.yawT = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100; this.dead = false;
    this.hookState = 0; this.hookPos = new V(); this.hookDisp = new V();
    this.init = false; this.lastSeen = performance.now(); this.ground = null; this.hookKind = 'normal'; this.gyT = 0; this.gy = null;
  }
  setHookKind(k) {
    if (!HOOK_STYLE[k] || k === this.hookKind) return;
    this.hookKind = k;
    this.model.setHook(k);
    const vis = this.head.visible;
    this.game.scene.remove(this.head);
    this.head = makeHookHead(k);
    this.head.scale.setScalar(HOOK_STYLE[k][2]); this.head.visible = vis;
    this.game.scene.add(this.head);
    this.rope.mesh.material.color.set(HOOK_STYLE[k][0]); this.rope.thick = HOOK_STYLE[k][1];
  }
  applyPlayer(s) {
    this.target.set(s.x, s.y, s.z);
    this.vel.set(s.vx, s.vy, s.vz);
    this.yawT = s.yw; this.pitch = s.pt;
    this.hp = s.hp; this.maxHp = s.mh || 100;
    this.dead = !!s.d;
    this.setHook(s.hs, s.hx, s.hy, s.hz);
    this.setHookKind(HOOK_KINDS[s.hk | 0] || 'normal');
    if (s.n && s.n !== this.name) { this.name = s.n; this.model.setName(s.n); }
    this.seen();
  }
  applyEnemy(a) {
    // [id, x,y,z, vx,vy,vz, yaw, hp, hookState, hx,hy,hz]
    this.target.set(a[1], a[2], a[3]);
    this.vel.set(a[4], a[5], a[6]);
    this.yawT = a[7]; this.hp = a[8]; this.maxHp = this.T ? this.T.hp : 60;
    this.setHook(a[9], a[10], a[11], a[12]);
    this.seen();
  }
  setHook(st, x, y, z) {
    if (st && !this.hookState) this.hookDisp.set(x, y, z);
    this.hookState = st;
    this.hookPos.set(x, y, z);
  }
  seen() {
    if (!this.init) { this.pos.copy(this.target); this.init = true; }
    this.lastSeen = performance.now();
  }
  update(dt) {
    this.target.addScaledVector(this.vel, dt);
    if (this.pos.distanceToSquared(this.target) > 400) this.pos.copy(this.target);
    else this.pos.lerp(this.target, 1 - Math.exp(-12 * dt));
    this.yaw = lerpAngle(this.yaw, this.yawT, 12 * dt);
    const m = this.model;
    m.group.visible = !this.dead;
    m.group.position.copy(this.pos);
    m.group.rotation.y = this.yaw;
    m.setHp(this.hp / this.maxHp);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    m.update(dt, this.game.camera, hs > 1 && Math.abs(this.vel.y) < 1, this.pitch);
    this.ground = this.game.world.islandUnder(this.pos);
    this.gyT -= dt;
    if (this.gyT <= 0) { this.gyT = 0.15; this.gy = this.game.world.groundAt(this.pos.x, this.pos.y + 0.5, this.pos.z); }
    m.setGround(this.gy === null ? null : Math.max(0, this.pos.y - this.gy));
    if (this.hookState && !this.dead) {
      this.hookDisp.lerp(this.hookPos, 1 - Math.exp(-15 * dt));
      m.group.updateMatrixWorld();
      m.gunMuzzle.getWorldPosition(_a);
      if (this.hookKind === 'boomerang') this.rope.hide(); else this.rope.set(_a, this.hookDisp);
      this.head.visible = true;
      this.head.position.copy(this.hookDisp);
      if (this.hookKind === 'boomerang') this.head.rotation.set(0, performance.now() * 0.022, 0.25); else this.head.lookAt(_a);
      m.gunHead.visible = false;
    } else {
      this.rope.hide(); this.head.visible = false; m.gunHead.visible = true;
    }
  }
  dispose() {
    const s = this.game.scene;
    s.remove(this.model.group); s.remove(this.rope.mesh); s.remove(this.head);
    this.model.dispose(); this.rope.dispose();
  }
}
