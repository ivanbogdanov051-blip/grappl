import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { World, SPAWN, CHUNK, inSafeZone } from './world.js';
import { Player, HOOK } from './player.js';
import { Enemy } from './enemy.js';
import { Remote } from './remote.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { Clouds } from './clouds.js';
import { Particles } from './particles.js';
import { makeGun, makeHookHead, Rope } from './models.js';
import { computeStats, COSTS, MAX_LEVEL, ABILITY } from './upgrades.js';
import { ENEMY_TYPES, ENEMY_KEYS } from './enemytypes.js';

window.__errs = [];
addEventListener('error', (e) => window.__errs.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__errs.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

const TAU = Math.PI * 2;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const SAVE_KEY = 'skygrapple_save_v1';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();

function loadSave() {
  const def = { name: '', coins: 0, up: {}, abil: {}, quality: isTouch ? 'low' : 'high' };
  try { return { ...def, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch (e) { return def; }
}
function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

class Game {
  constructor() {
    this.save = loadSave();
    this.stats = computeStats(this.save.up);
    this.quality = this.save.quality;
    const hi = this.quality === 'high';
    this.name = 'Player';
    this.sid = Math.random().toString(36).slice(2, 8);

    // renderer / scene
    this.canvas = document.getElementById('c');
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: hi, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1.25));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.85;
    r.shadowMap.enabled = hi;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.autoClear = false;
    this.scene = new THREE.Scene();
    this.fogColor = 0xbcd4ec;
    const loadR = hi ? 5 : 4;
    this.viewDist = loadR * CHUNK;
    this.scene.fog = new THREE.Fog(this.fogColor, this.viewDist * 0.28, this.viewDist * 0.95);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 5000);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.setupSky(hi);

    this.world = new World(this.scene, { loadRadius: loadR, shadows: hi });
    this.world.camera = this.camera;
    this.clouds = new Clouds(this.scene, hi, this.fogColor, this.viewDist);
    this.particles = new Particles(this.scene);
    this.sfx = new Sfx();
    this.ui = new UI(this, isTouch);
    this.player = new Player(this);
    this.enemies = [];
    this.remotes = new Map();
    this.setupHand();
    this.input = new Input(this, this.canvas, isTouch);

    this.net = null; this.running = false; this.shopOpen = false; this.nearShop = null;
    this.spawnTimer = 3; this.netTimer = 0; this.hudT = 0; this.frame = 0; this.time = 0;
    this.shakeAmt = 0; this.recoil = 0; this.bob = 0; this.swayX = 0; this.swayY = 0; this.hurtV = 0;
    this.crossT = 0; this.shopT = 0; this.roomLabel = '';

    this.world.preload(SPAWN, 1);
    this.addBeacon();
    this.player.respawn();
    this.save.abil = this.save.abil || {};
    this.ui.renderAbilities();
    addEventListener('resize', () => this.resize());
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.loop());
  }

  // ---------------------------------------------------------- setup
  setupSky(hi) {
    const sky = (this.sky = new Sky());
    sky.scale.setScalar(4000);
    const set = (s) => {
      const u = s.material.uniforms;
      u.turbidity.value = 2; u.rayleigh.value = 2.4; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.86;
      u.sunPosition.value.copy(this.sunDir);
    };
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(140));
    set(sky);
    this.scene.add(sky);
    // environment lighting from the sky
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000); set(sky2); envScene.add(sky2);
    this.envTex = pmrem.fromScene(envScene).texture;
    this.scene.environment = this.envTex;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5b6b4a, 0.55);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1dd, 2.6));
    sun.castShadow = hi;
    if (hi) {
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -90; c.right = 90; c.top = 90; c.bottom = -90; c.near = 1; c.far = 600;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.6;
    }
    this.scene.add(sun); this.scene.add(sun.target);
  }
  setupHand() {
    this.gunScene = new THREE.Scene();
    this.gunScene.environment = this.envTex;
    this.gunCam = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.gunScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(1, 2, 1);
    this.gunScene.add(dl);
    this.gun = makeGun(true);
    this.gun.group.scale.setScalar(0.72);
    this.gunScene.add(this.gun.group);
    this.hookMesh = makeHookHead();
    this.hookMesh.scale.setScalar(2.2);
    this.hookMesh.visible = false;
    this.scene.add(this.hookMesh);
    this.rope = new Rope(0x23262b, 0.03);
    this.scene.add(this.rope.mesh);
  }
  addBeacon() {
    const top = this.world.spawnTop();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 700, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x66bbff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })
    );
    beam.position.set(SPAWN.x, top + 380, SPAWN.z);
    this.scene.add(beam);
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = this.gunCam.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.gunCam.updateProjectionMatrix();
  }
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.save)); } catch (e) { /* ignore */ } }

  // ---------------------------------------------------------- flow
  start(mode, code) {
    this.name = (this.ui.name() || 'Player').slice(0, 16);
    this.save.name = this.name;
    this.persist();
    this.sfx.init();
    if (mode !== 'solo' && typeof window.Peer === 'undefined') {
      this.ui.menuStatus('Multiplayer library failed to load (offline?). Try Solo.');
      return;
    }
    this.running = true;
    this.ui.showMenu(false);
    this.ui.showHud(true);
    this.player.respawn();
    if (mode === 'solo') this.ui.net('');
    else {
      let room;
      if (mode === 'public') { room = 'skygrapple-public-v1'; this.roomLabel = 'Public lobby'; this.roomCode = null; }
      else { this.roomCode = mode === 'create' ? genCode() : code; room = 'skygrapple-room-' + this.roomCode; this.roomLabel = 'Room ' + this.roomCode; }
      this.startNet(room);
    }
    if (!isTouch) this.input.lock();
    else { try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
    this.ui.toast(isTouch ? 'Aim with the right side · SHOOT your hook, then PULL!' : 'Click to SHOOT your hook, click again to PULL!');
  }
  pause() { if (!this.running) return; this.ui.showPause(true); }
  resume() { this.ui.showPause(false); if (!isTouch) this.input.lock(); }
  onLockChange(locked) {
    if (!this.running || isTouch) return;
    if (locked) this.ui.showPause(false);
    else if (!this.shopOpen) this.ui.showPause(true);
  }

  // ---------------------------------------------------------- actions
  look(dx, dy) {
    if (this.shopOpen) return;
    const p = this.player;
    p.yaw -= dx;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch - dy));
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX - dx * 0.25));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY + dy * 0.25));
  }
  shootHook() { if (!this.running || this.shopOpen) return; this.sfx.init(); this.player.shoot(); }
  cancelHook() { if (!this.running) return; this.player.cancel(); }
  interact() {
    if (!this.running) return;
    if (this.shopOpen) { this.closeShop(); return; }
    if (!this.nearShop || this.player.dead) return;
    this.shopOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.openShop();
  }
  closeShop() {
    this.shopOpen = false;
    this.ui.closeShop();
    if (!isTouch) this.input.lock();
  }
  buy(key) {
    const lv = this.save.up[key] || 0;
    if (lv >= MAX_LEVEL) return;
    const cost = COSTS[lv];
    if (this.save.coins < cost) return;
    this.save.coins -= cost;
    this.save.up[key] = lv + 1;
    const oldMax = this.stats.health;
    this.stats = computeStats(this.save.up);
    if (key === 'health') this.player.hp += this.stats.health - oldMax;
    this.persist();
    this.sfx.buy();
    this.ui.renderShop();
  }
  buyAbility(key) {
    const A = ABILITY[key];
    if (!A || this.save.abil[key] || this.save.coins < A.cost) return;
    this.save.coins -= A.cost;
    this.save.abil[key] = true;
    this.persist();
    this.sfx.buy();
    this.ui.renderShop();
    this.ui.renderAbilities();
    this.ui.toast(A.icon + ' ' + A.name + ' unlocked! Use its button.');
  }
  useAbility(key) {
    if (!this.running || this.shopOpen || !this.save.abil[key]) return;
    this.sfx.init();
    this.player.useAbility(key);
  }
  bossSlam(e) {
    const c = e.pos;
    const hit = (ent) => {
      if (ent.dead) return;
      const dx = ent.pos.x - c.x, dy = ent.pos.y - c.y, dz = ent.pos.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 18) return;
      const l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: 25, d: [dx / l, 0, dz / l], k: 1.2 + 1.6 * (1 - d / 18), attacker: e.id, aname: e.name });
    };
    hit(this.player);
    for (const r of this.remotes.values()) if (r.kind === 'player') hit(r);
    _v.copy(c); _v.y += 0.5;
    this.particles.burst(_v, 0xff6a3a, 40, 18, 0.5);
    this.particles.burst(_v, 0x5a4a3a, 25, 12, 0.4);
    if (c.distanceTo(this.player.pos) < 60) this.shake(0.7);
    this.sfx.near('thunk', c); this.sfx.near('hurt', c);
  }
  explode(at, p) {
    const hit = (ent) => {
      if (ent.dead) return;
      const sc = ent.scale || 1;
      const dx = ent.pos.x - at.x, dy = ent.pos.y + 0.7 * sc - at.y, dz = ent.pos.z - at.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 9) return;
      const l = Math.hypot(dx, dz) || 1;
      const k = 0.8 + 1.8 * (1 - d / 9);
      if (ent === p) { // rocket jump: knockback but no self damage
        p.vel.x += (dx / l) * 9 * k; p.vel.z += (dz / l) * 9 * k; p.vel.y = Math.max(p.vel.y, 0) + 11 * k;
        p.onGround = false; p.braking = false; p.pos.y += 0.05;
        return;
      }
      this.deliverHit(ent.id, { mode: 'bump', dmg: Math.round(15 + 25 * (1 - d / 9)), d: [dx / l, 0, dz / l], k, attacker: p.id, aname: this.name });
    };
    hit(p);
    for (const e of this.enemies) hit(e);
    for (const r of this.remotes.values()) hit(r);
    this.particles.burst(at, 0xffb020, 34, 16, 0.45);
    this.particles.burst(at, 0xff4a1a, 22, 11, 0.35);
    this.particles.burst(at, 0x3a3a3a, 18, 7, 0.5);
    const dp = at.distanceTo(p.pos);
    if (dp < 40) this.shake(0.8 * (1 - dp / 40) + 0.2);
    this.sfx.thunk(); this.sfx.hurt(); this.sfx.hit();
  }
  shockwave(p) {
    const c = p.pos;
    const hit = (ent) => {
      if (ent.dead || ent === p) return;
      const dx = ent.pos.x - c.x, dy = ent.pos.y - c.y, dz = ent.pos.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 14) return;
      const l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: 20, d: [dx / l, 0, dz / l], k: 0.9 + 1.8 * (1 - d / 14), attacker: p.id, aname: this.name });
    };
    for (const e of this.enemies) hit(e);
    for (const r of this.remotes.values()) hit(r);
    _v.copy(c); _v.y += 0.4;
    this.particles.burst(_v, 0x9fd8ff, 40, 16, 0.3);
    this.particles.burst(_v, 0xffffff, 20, 10, 0.2);
    this.shake(0.6);
    this.sfx.hurt(); this.sfx.thunk();
  }
  addCoins(n, pickup) {
    this.save.coins += n;
    this.persist();
    if (pickup) this.sfx.coin();
  }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  hurtFlash() { this.hurtV = 0.6; }
  copyInvite() {
    if (!this.roomCode) return;
    const url = location.origin + location.pathname + '?room=' + this.roomCode;
    try { navigator.clipboard.writeText(url); this.ui.toast('📋 Invite link copied!'); } catch (e) { this.ui.toast('Room code: ' + this.roomCode); }
  }

  // muzzle of the first-person gun, expressed in world space
  muzzleWorld(out) {
    this.gun.group.updateMatrixWorld();
    this.gun.muzzle.getWorldPosition(_x);
    const L = _x.length();
    _y.copy(_x).project(this.gunCam);
    return out.set(_y.x, _y.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize().multiplyScalar(L).add(this.camera.position);
  }

  // ---------------------------------------------------------- entities
  getEntity(id) {
    if (id === this.player.id) return this.player;
    for (const e of this.enemies) if (e.id === id) return e;
    return this.remotes.get(id) || null;
  }
  hitTestEntities(o, dir, len, exclude, playersOnly) {
    let best = null, bd = len;
    const test = (ent) => {
      if (ent.dead || ent.id === exclude) return;
      const sc = ent.scale || 1;
      _w.copy(ent.pos); _w.y += 0.7 * sc;
      _v.subVectors(_w, o);
      const t = _v.dot(dir);
      if (t < -1.2 || t > bd + 1.2) return;
      const tt = Math.max(0, Math.min(bd, t));
      const px = o.x + dir.x * tt - _w.x, py = o.y + dir.y * tt - _w.y, pz = o.z + dir.z * tt - _w.z;
      if (px * px + py * py + pz * pz < 1.32 * sc * sc) { bd = tt; best = ent; }
    };
    test(this.player);
    if (!playersOnly) for (const e of this.enemies) test(e);
    for (const r of this.remotes.values()) if (!playersOnly || r.kind === 'player') test(r);
    return best ? { ent: best, dist: bd } : null;
  }
  findTarget(e, maxD) {
    let best = null, bd = maxD;
    const p = this.player;
    if (!p.dead && !inSafeZone(p.pos)) { const d = p.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = p; } }
    for (const r of this.remotes.values()) {
      if (r.kind !== 'player' || r.dead || inSafeZone(r.pos)) continue;
      const d = r.pos.distanceTo(e.pos);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }
  deliverHit(id, hit) {
    if (id === this.player.id) { this.player.applyHit(hit); return; }
    for (const e of this.enemies) if (e.id === id) { e.applyHit(hit); return; }
    const r = this.remotes.get(id);
    if (r) { r.model.hit(); if (this.net) this.net.send({ t: 'hit', target: id, ...hit }); }
  }
  onLocalDeath(p, msg) {
    this.sfx.death();
    this.ui.showDeath(msg);
    _v.copy(p.pos); _v.y += 0.7;
    this.particles.burst(_v, 0x2f7bff, 24, 9, 0.35);
    const la = p.lastAttacker;
    if (la && performance.now() - la.t < 12000) this.reportKill(la.id, la.name, this.name, 'player');
    else this.ui.feed(`☁️ ${this.name} fell`, 'me');
  }
  onEnemyDeath(e) {
    const la = e.lastAttacker;
    if (la && performance.now() - la.t < 12000) this.reportKill(la.id, la.name, e.name, 'enemy', e.T.reward);
    if (e.T.boss) this.ui.feed('👑 The Sky Titan has fallen!', 'me');
  }
  reportKill(killer, kname, vname, vkind, reward) {
    const m = { t: 'kill', killer, kname, vname, vkind, reward };
    this.handleKill(m);
    if (this.net) this.net.send(m);
  }
  handleKill(m) {
    const mine = m.killer === this.player.id;
    this.ui.feed(`${m.kname} ⚔ ${m.vname}`, mine ? 'me' : m.vkind === 'player' ? 'pk' : '');
    if (mine) {
      const reward = m.reward || (m.vkind === 'player' ? 50 : 30);
      this.addCoins(reward);
      this.sfx.kill();
      this.ui.toast(`+${reward} 🪙  ${m.vname} eliminated!`);
    }
  }
  manageEnemies() {
    const p = this.player;
    const cap = this.quality === 'high' ? 10 : 7;
    for (const e of this.enemies) if (e.pos.distanceTo(p.pos) > (e.T.boss ? 1100 : 750) && !e.dead) { e.dead = true; e.dispose(); }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (p.dead) return;
    // boss: roughly every 2-3 minutes, if none is around
    this.bossT = (this.bossT === undefined ? 70 : this.bossT) - 1.5;
    if (this.bossT <= 0) {
      this.bossT = 120 + Math.random() * 60;
      const has = this.enemies.some((e) => e.T.boss) || [...this.remotes.values()].some((r) => r.T && r.T.boss);
      const big = this.world.spawnCandidates(p.pos, 140, 450).filter((I) => I.R >= 40);
      if (!has && big.length) {
        const I = big[Math.floor(Math.random() * big.length)];
        const bp = I.pointAt(Math.random() * TAU, 0.3); bp.y += 2;
        this.enemies.push(new Enemy(this, bp, 'titan'));
        this.ui.toast('⚠️ A SKY TITAN has appeared!');
        this.ui.feed('👑 Sky Titan spotted nearby: 300 coins bounty', 'pk');
      }
    }
    let near = this.enemies.length;
    for (const r of this.remotes.values()) if (r.kind === 'enemy' && r.pos.distanceTo(p.pos) < 500) near++;
    if (near >= cap) return;
    const cands = this.world.spawnCandidates(p.pos, 110, 480);
    if (!cands.length) return;
    const I = cands[Math.floor(Math.random() * cands.length)];
    const pt = I.pointAt(Math.random() * TAU, Math.random() * 0.6);
    pt.y += 1;
    let roll = Math.random() * ENEMY_KEYS.reduce((a, k) => a + ENEMY_TYPES[k].spawn, 0), type = 'grappler';
    for (const k of ENEMY_KEYS) { roll -= ENEMY_TYPES[k].spawn; if (roll < 0) { type = k; break; } }
    this.enemies.push(new Enemy(this, pt, type));
  }

  // ---------------------------------------------------------- network
  startNet(room) {
    this.ui.net('Connecting…');
    this.net = new Net({
      onReady: (id) => { this.player.id = id; this.ui.toast(this.net.isHost ? '🌐 You are hosting' : '🌐 Connected!'); },
      onMessage: (m) => this.onNet(m),
      onLeave: (id) => this.removeOwner(id),
      onHostLost: () => { for (const id of [...this.remotes.keys()]) this.removeRemote(id); },
      onStatus: (s) => { this.netStatus = s; },
    });
    this.net.start(room);
  }
  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.dispose();
    this.remotes.delete(id);
  }
  removeOwner(owner) {
    const r = this.remotes.get(owner);
    if (r && r.kind === 'player') this.ui.feed(`${r.name} left`);
    for (const [id, x] of this.remotes) if (x.owner === owner) this.removeRemote(id);
  }
  onNet(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 's': {
        const ps = m.p;
        if (!ps || ps.id === this.player.id) return;
        let r = this.remotes.get(ps.id);
        if (!r) {
          r = new Remote(this, ps.id, 'player', String(ps.n || 'Player').slice(0, 16), ps.id);
          this.remotes.set(ps.id, r);
          this.ui.feed(`${r.name} joined`);
        }
        r.applyPlayer(ps);
        const seen = new Set();
        for (const es of m.e || []) {
          const id = es[0];
          seen.add(id);
          let re = this.remotes.get(id);
          if (!re) { re = new Remote(this, id, 'enemy', 'Grappler', ps.id, es[13]); this.remotes.set(id, re); }
          re.applyEnemy(es);
        }
        for (const [id, re] of this.remotes) {
          if (re.kind === 'enemy' && re.owner === ps.id && !seen.has(id)) {
            if (re.hp <= 25 && re.pos.distanceTo(this.player.pos) < 300) { _v.copy(re.pos); _v.y += 0.7; this.particles.burst(_v, 0xe2372f, 20, 9, 0.35); }
            this.removeRemote(id);
          }
        }
        break;
      }
      case 'hit': {
        if (m.target === this.player.id) this.player.applyHit(m);
        else for (const e of this.enemies) if (e.id === m.target) { e.applyHit(m); break; }
        break;
      }
      case 'kill': this.handleKill(m); break;
      case 'leave': this.removeOwner(m.id); break;
    }
  }
  sendState() {
    const p = this.player, h = p.hook;
    const r2 = (v) => Math.round(v * 100) / 100;
    const ps = {
      id: p.id, n: this.name, x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z),
      vx: r2(p.vel.x), vy: r2(p.vel.y), vz: r2(p.vel.z), yw: r2(p.yaw), pt: r2(p.pitch),
      hp: Math.round(p.hp), mh: this.stats.health, d: p.dead ? 1 : 0,
      hs: h.state, hx: r2(h.pos.x), hy: r2(h.pos.y), hz: r2(h.pos.z),
    };
    const es = [];
    for (const e of this.enemies) {
      if (e.dead) continue;
      const eh = e.hook;
      es.push([e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.vel.x), r2(e.vel.y), r2(e.vel.z), r2(e.yaw), Math.round(e.hp), eh.state, r2(eh.pos.x), r2(eh.pos.y), r2(eh.pos.z), e.type]);
    }
    this.net.send({ t: 's', p: ps, e: es });
  }

  // ---------------------------------------------------------- frame
  loop() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.frame++;
    try { this.step(dt); } catch (e) { console.error(e); window.__errs.push(String(e && e.stack || e)); }
  }
  step(dt) {
    const p = this.player, cam = this.camera;
    if (this.running) {
      this.input.update(dt);
      p.update(dt, this.input);
      for (const e of this.enemies) e.update(dt);
      if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
      const now = performance.now();
      for (const [id, r] of this.remotes) {
        if (now - r.lastSeen > 6000) { this.removeRemote(id); continue; }
        r.update(dt);
      }
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 1.5; this.manageEnemies(); }
      if (this.net && this.net.ready) {
        this.netTimer -= dt;
        if (this.netTimer <= 0) { this.netTimer = 1 / 12; this.sendState(); }
      }
      // camera
      p.eye(cam.position);
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
      const sk = this.shakeAmt * this.shakeAmt * 0.06;
      cam.rotation.set(p.pitch + (Math.random() - 0.5) * sk, p.yaw + (Math.random() - 0.5) * sk, 0);
      const sp = p.vel.length();
      const fov = 75 + Math.min(22, Math.max(0, sp - 12) * 0.4);
      cam.fov += (fov - cam.fov) * Math.min(1, 5 * dt);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      this.sfx.wind(p.dead ? 0 : sp);
      this.updateHand(dt);
    } else {
      // menu: slow orbit around spawn
      const a = this.time * 0.05, top = this.world.spawnTop();
      cam.position.set(Math.cos(a) * 90, top + 30, Math.sin(a) * 90);
      cam.lookAt(0, top + 5, 0);
      cam.updateMatrixWorld();
    }
    this.sfx.listener = cam.position;
    this.world.update(this.running ? p.pos : cam.position, dt);
    this.clouds.update(cam, this.time);
    this.particles.update(dt);
    this.sky.position.copy(cam.position);
    const focus = this.running ? p.pos : cam.position;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(focus);
    if (this.running) this.updateHud(dt);
    this.ui.whiteout(Math.min(1, Math.max(0, (-160 - cam.position.y) / 30)));

    const r = this.renderer;
    r.clear();
    r.render(this.scene, cam);
    if (this.running && !p.dead) { r.clearDepth(); r.render(this.gunScene, this.gunCam); }
  }

  updateHand(dt) {
    const p = this.player, h = p.hook, g = this.gun.group;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    this.bob += dt * (p.onGround ? hs * 0.9 : 0);
    const k = Math.min(1, hs / 8) * (p.onGround ? 1 : 0.2);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.swayX *= Math.max(0, 1 - dt * 8);
    this.swayY *= Math.max(0, 1 - dt * 8);
    g.position.set(0.3 + Math.sin(this.bob) * 0.014 * k + this.swayX, -0.3 - Math.abs(Math.cos(this.bob)) * 0.016 * k + this.swayY, -0.78 + this.recoil * 0.08);
    g.rotation.set(this.recoil * 0.25 + (p.onGround ? 0 : -0.05), 0.04, 0);
    if (h.state !== HOOK.IDLE && !p.dead) {
      this.gun.head.visible = false;
      this.muzzleWorld(_v);
      this.hookMesh.visible = true;
      this.hookMesh.position.copy(h.pos);
      this.hookMesh.lookAt(_v);
      this.rope.set(_v, h.pos);
    } else {
      this.gun.head.visible = true;
      this.hookMesh.visible = false;
      this.rope.hide();
    }
  }

  updateHud(dt) {
    const p = this.player, ui = this.ui;
    ui.setHook(p.hook.state);
    this.hurtV = Math.max(0, this.hurtV - dt * 1.5);
    ui.hurt(this.hurtV + (p.hp < this.stats.health * 0.3 && !p.dead ? 0.15 + Math.sin(this.time * 5) * 0.08 : 0));
    // crosshair: does the aim hit something in range?
    this.crossT -= dt;
    if (this.crossT <= 0 && !p.dead) {
      this.crossT = 0.06;
      if (p.hook.state === HOOK.IDLE) {
        const f = p.forward(_w);
        const wh = this.world.raycast(this.camera.position, f, this.stats.range);
        const eh = p.safe ? null : this.hitTestEntities(this.camera.position, f, wh ? wh.dist : this.stats.range, p.id, false);
        ui.crosshair(eh ? 'target' : wh ? 'ok' : '');
      } else ui.crosshair(p.hook.state === HOOK.ATTACHED || p.hook.state === HOOK.LATCHED ? 'pull' : '');
    }
    // shop proximity + compass
    this.shopT -= dt;
    if (this.shopT <= 0) {
      this.shopT = 0.25;
      const ns = this.world.nearestShop(p.pos);
      this.nearShop = ns && ns.dist < 7 ? ns.shop : null;
      ui.shopPrompt(!!this.nearShop && !this.shopOpen && !p.dead);
      if (ns && ns.dist > 7) {
        const dx = ns.shop.x - p.pos.x, dz = ns.shop.z - p.pos.z;
        const ff = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
        ui.shopArrow(ff - Math.atan2(dx, dz), ns.dist);
      } else ui.shopArrow(null);
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      ui.hud(p, this);
      let boss = null, bd = 220;
      for (const e of this.enemies) if (e.T.boss && !e.dead) { const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; boss = e; } }
      for (const r of this.remotes.values()) if (r.T && r.T.boss && !r.dead) { const d = r.pos.distanceTo(p.pos); if (d < bd) { bd = d; boss = r; } }
      ui.boss(boss ? boss.name : null, boss ? boss.hp / boss.maxHp : 0);
      ui.updateAbilities(p);
      if (this.net) {
        const players = 1 + [...this.remotes.values()].filter((r) => r.kind === 'player').length;
        const st = this.net.ready ? `${players} online${this.net.isHost ? ' · host' : ''}` : this.netStatus || 'Connecting…';
        ui.net(`🌐 ${this.roomLabel} · ${st}${this.roomCode ? ' · tap to copy invite' : ''}`);
      }
    }
  }
}

// installable app (not inside the Claude preview)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.SKY_NO_ONLINE) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let deferred = null;
  const btn = document.getElementById('installBtn');
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.classList.remove('hidden'); });
  btn.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; btn.classList.add('hidden'); };
  addEventListener('appinstalled', () => btn.classList.add('hidden'));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  if (ios) document.getElementById('iosHint').classList.remove('hidden');
}

const game = new Game();
window.game = game;
window.Enemy = Enemy;

// automated smoke test: open index.html?autotest  (runs ~30 simulated seconds of game logic)
if (location.search.includes("autotest")) {
  const out = document.createElement("pre");
  out.id = "autotest";
  document.body.appendChild(out);
  setTimeout(() => {
    const p = game.player, log = {};
    game.start("solo");
    const realRender = game.renderer.render.bind(game.renderer);
    game.renderer.setAnimationLoop(null);
    game.renderer.render = () => {};
    const modes = {}, hits = {};
    const os = Enemy.prototype.shoot;
    Enemy.prototype.shoot = function (pt, mode) { modes[mode] = (modes[mode] || 0) + 1; return os.call(this, pt, mode); };
    const od = game.deliverHit.bind(game);
    game.deliverHit = (id, h) => { hits[h.mode] = (hits[h.mode] || 0) + 1; return od(id, h); };
    const sim = (sec) => { for (let i = 0; i < sec * 60; i++) { game.time += 1 / 60; game.frame++; game.step(1 / 60); } };
    const aim = (pt) => { const e = p.eye(); const dx = pt.x - e.x, dy = pt.y - e.y, dz = pt.z - e.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); sim(1 / 60); };
    sim(1);
    log.spawn = { y: +p.pos.y.toFixed(2), ground: p.onGround, safe: p.safe };
    // grapple to a visible island
    let isl = null, tgt = null;
    search: for (const A of game.world.spawnCandidates(p.pos, 100, 700)) {
      for (const I of game.world.islandsInRadius(A.x, A.z, 120)) {
        if (I === A || I.kind === "spawn") continue;
        const ang = Math.atan2(I.z - A.z, I.x - A.x);
        const st = A.pointAt(ang, 0.6);
        p.pos.set(st.x, st.y + 0.3, st.z); p.vel.set(0, 0, 0); sim(0.3);
        if (!p.onGround) continue;
        const e0 = p.eye();
        const pt = I.pointAt(ang + Math.PI, 0.45);
        const d = pt.clone().sub(e0); const L = d.length(); if (L > 85 || L < 30) continue;
        const h = game.world.raycast(e0, d.normalize(), L + 3);
        if (h && h.point.distanceTo(pt) < 4) { isl = I; tgt = pt; break search; }
      }
    }
    if (isl) {
      aim(tgt);
      p.shoot(); const s1 = p.hook.state;
      sim(1.2); const s2 = p.hook.state; const anchor = p.hook.anchor.toArray().map(Math.round);
      const from0 = p.pos.toArray().map(Math.round); p.shoot(); const s3 = p.hook.state; const vel0 = p.vel.toArray().map(Math.round);
      const tr = []; for (let k = 0; k < 20; k++) { sim(0.1); tr.push([...p.pos.toArray().map((v) => Math.round(v * 10) / 10), p.braking ? 1 : 0, p.hitWall ? 1 : 0, p.onGround ? 1 : 0]); }
      log.trace = { from0, vel0, tr };
      log.grapple = { target: tgt.toArray().map(Math.round), states: [s1, s2, s3], anchor, landed: p.pos.toArray().map(Math.round), onGround: p.onGround, onTarget: p.ground === isl, kind: isl.kind, R: Math.round(isl.R) };
    } else log.grapple = "no visible island";
    // hook an enemy and yank it
    {
      const c0 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      const st0 = c0.pointAt(0, 0.1); p.pos.set(st0.x, st0.y + 0.5, st0.z); p.vel.set(0, 0, 0); sim(0.5);
      const q = c0.pointAt(0, 0.1); q.x += 0; q.z += 0; const en = new Enemy(game, p.pos.clone().add(new THREE.Vector3(0, 0.2, -12))); en.cool = 99; en.think = 99; game.enemies.push(en); sim(0.5);
      const ec = en.pos.clone(); ec.y += 0.7; aim(ec);
      p.shoot(); sim(0.4); const ls = p.hook.state; const hpAfter = en.hp;
      p.shoot(); sim(0.3);
      log.attack = { latched: ls === 3, enemyHp: hpAfter, enemyVelAfterYank: Math.round(en.vel.length()), enemyDead: en.dead };
      en.think = 0; en.cool = 1;
    }
    // move to a normal island and let enemies fight
    const c = game.world.spawnCandidates(p.pos, 100, 600).sort((a, b) => b.R - a.R)[0];
    const st = c.pointAt(0, 0.1); p.pos.set(st.x, st.y + 1, st.z); p.vel.set(0, 0, 0);
    for (let i = 0; i < 5; i++) { const q = c.pointAt(i * 1.2, 0.55); q.y += 1; game.enemies.push(new Enemy(game, q)); }
    let deaths = 0; const od2 = game.onLocalDeath.bind(game); game.onLocalDeath = (a, b) => { deaths++; return od2(a, b); };
    sim(30);
    log.fight = { modes, hits, deaths, playerHp: Math.round(p.hp), dead: p.dead, enemies: game.enemies.map((e) => [Math.round(e.pos.y), e.hp, e.onGround ? 1 : 0]) };
    // abilities
    {
      for (const k of ['swap', 'leap', 'dash', 'shock', 'rewind']) game.save.abil[k] = true;
      game.ui.renderAbilities();
      const ab = {};
      const c2 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      const st2 = c2.pointAt(0, 0.1);
      p.dead = false; p.hp = 100; p.pos.set(st2.x, st2.y + 0.5, st2.z); p.vel.set(0, 0, 0); p.cd = {}; sim(0.5);
      // swap shot at a frozen enemy 15 m away
      const en = new Enemy(game, p.pos.clone().add(new THREE.Vector3(0, 0.3, -15))); en.think = 999; en.cool = 999; game.enemies.push(en); sim(0.5);
      const before = { me: p.pos.clone(), it: en.pos.clone() };
      const ec = en.pos.clone(); ec.y += 0.7; aim(ec);
      ab.swapUsed = p.useAbility('swap'); sim(1.5);
      ab.swap = { meMovedToward: Math.round(p.pos.distanceTo(before.it)), enemyMovedToward: Math.round(en.pos.distanceTo(before.me)), enemyHp: en.hp, cd: Math.round(p.cd.swap) };
      ab.swapAgainBlocked = !p.useAbility('swap');
      // shockwave: enemy next to us
      p.pos.copy(st2); p.pos.y += 0.5; p.vel.set(0, 0, 0); sim(0.5);
      en.pos.copy(p.pos).add(new THREE.Vector3(4, 0.3, 0)); en.vel.set(0, 0, 0); sim(0.3);
      const hp0 = en.hp; p.useAbility('shock'); sim(0.2);
      ab.shock = { enemySpeed: Math.round(en.vel.length()), dmg: hp0 - en.hp };
      // leap + super shot
      for (let t = 0.2; t < 0.9; t += 0.1) { const q = c2.pointAt(2, t); q.y += 0.5; if (!game.world.raycast(q, new THREE.Vector3(0, 1, 0), 60)) { p.pos.copy(q); p.vel.set(0, 0, 0); break; } }
      sim(1); const y0 = p.pos.y; p.useAbility('leap'); sim(0.9);
      ab.leap = { rose: Math.round(p.pos.y - y0), superReady: p.superShot > 0 };
      p.pitch = -0.6; p.shoot(); ab.leap.superShot = !!p.hook.super; p.cancel(); sim(2.5);
      // dash
      p.pos.copy(st2); p.pos.y += 0.5; p.vel.set(0, 0, 0); sim(0.5);
      p.pitch = 0; p.useAbility('dash'); sim(0.05); ab.dashSpeed = Math.round(p.vel.length());
      // rewind: walk off into the void then rewind
      sim(0.5); const safeSpot = p.pos.clone(); sim(1);
      p.pos.set(st2.x + 2000, 0, st2.z); p.vel.set(0, 0, 0); sim(1);
      p.cd.rewind = 0; ab.rewindUsed = p.useAbility('rewind'); sim(0.1);
      ab.rewindBackNear = Math.round(p.pos.distanceTo(safeSpot));
      ab.buttons = document.querySelectorAll('#abilities .ab').length;
      log.abilities = ab;
      p.hp = 40; p.lastHurt = game.time; sim(3); const r1 = Math.round(p.hp); sim(3); log.regen = { after3s: r1, after6s: Math.round(p.hp) };
    }
    // enemy types + boss
    {
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      const c3 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      const st3 = c3.pointAt(0, 0.05);
      p.dead = false; p.hp = 9999; p.pos.set(st3.x, st3.y + 0.5, st3.z); p.vel.set(0, 0, 0); sim(0.3);
      const per = {};
      const types = ['zipper', 'sniper', 'brute', 'titan'];
      types.forEach((t, i) => { const q = c3.pointAt(i * 1.5, 0.5); q.y += 2; const e = new Enemy(game, q, t); game.enemies.push(e); per[e.id] = t; });
      const shots = {}, slams = { n: 0 };
      const os2 = Enemy.prototype.shoot;
      Enemy.prototype.shoot = function (pt, mode) { const k = this.type + ':' + mode; shots[k] = (shots[k] || 0) + 1; return os2.call(this, pt, mode); };
      const obs = game.bossSlam.bind(game); game.bossSlam = (e) => { slams.n++; return obs(e); };
      game.spawnTimer = 999;
      for (let i = 0; i < 20; i++) { sim(1); if (p.dead) { p.respawn(); } p.hp = 9999; if (i % 4 === 0) { p.pos.set(st3.x, st3.y + 0.5, st3.z); p.vel.set(0, 0, 0); } }
      // bring the titan next to the player to test its slam
      const ti = game.enemies.find((e) => e.type === 'titan');
      if (ti) { ti.pos.copy(p.pos).add(new THREE.Vector3(6, 0.5, 0)); ti.slamCool = 0; ti.think = 0; ti.vel.set(0, 0, 0); sim(1.5); }
      log.types = { shots, slams: slams.n, alive: game.enemies.map((e) => e.type + ':' + e.hp + '/' + e.maxHp), bossBar: !document.getElementById('bossBar').classList.contains('hidden') };
      // a remote titan must render with the right type
      game.onNet({ t: 's', p: { id: 'fakepeer', n: 'Bob', x: st3.x + 30, y: st3.y, z: st3.z, vx: 0, vy: 0, vz: 0, yw: 0, pt: 0, hp: 100, mh: 100, d: 0, hs: 0, hx: 0, hy: 0, hz: 0 }, e: [['fakepeer#0', st3.x + 40, st3.y, st3.z, 0, 0, 0, 0, 500, 0, 0, 0, 0, 'titan']] });
      const rt = game.remotes.get('fakepeer#0');
      log.remoteTitan = rt ? [rt.name, rt.scale, rt.maxHp] : null;
      game.removeOwner('fakepeer');
      p.hp = 100;
    }
    // new abilities
    {
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      game.spawnTimer = 999;
      const c4 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      let st4 = null;
      for (let t = 0.1; t < 0.8; t += 0.05) { const q = c4.pointAt(2.5, t); q.y += 0.5; if (!game.world.raycast(q, new THREE.Vector3(0, 1, 0), 60)) { st4 = q; break; } }
      st4 = st4 || c4.pointAt(2.5, 0.3);
      const reset = () => { p.dead = false; p.hp = 100; p.pos.copy(st4); p.vel.set(0, 0, 0); p.cd = {}; sim(0.4); };
      const n = {};
      for (const k of ['magnet', 'shield', 'glide', 'bomb', 'heal']) game.save.abil[k] = true;
      game.ui.renderAbilities();
      n.buttons = document.querySelectorAll('#abilities .ab').length;
      // magnet: enemy 25 m away gets pulled to us
      reset();
      const en = new Enemy(game, p.pos.clone().add(new THREE.Vector3(0, 1, -25))); en.think = 999; en.cool = 999; game.enemies.push(en); sim(0.5);
      const d0 = en.pos.distanceTo(p.pos); p.useAbility('magnet'); sim(1.6);
      n.magnet = { before: Math.round(d0), after: Math.round(en.pos.distanceTo(p.pos)), dmg: 60 - en.hp };
      // shield: a hit while shielded does nothing
      reset(); p.useAbility('shield');
      p.applyHit({ mode: 'bump', dmg: 30, d: [1, 0, 0], attacker: 'x', aname: 'Test' });
      n.shield = { hpWhileShielded: p.hp }; sim(4.2);
      p.applyHit({ mode: 'bump', dmg: 30, d: [1, 0, 0], attacker: 'x', aname: 'Test' }); n.shield.hpAfterExpiry = p.hp;
      // glide: fall speed limited
      reset(); p.pos.y += 60; p.vel.set(0, 0, 0); sim(0.05); p.useAbility('glide'); sim(1.5);
      n.glideFallSpeed = Math.round(p.vel.y * 10) / 10;
      // bomb: enemy 20 m away, aim at it
      reset();
      en.pos.copy(p.pos).add(new THREE.Vector3(0, 0.3, -20)); en.vel.set(0, 0, 0); en.hp = 60; sim(0.4);
      const ec = en.pos.clone(); ec.y += 0.7; aim(ec);
      p.useAbility('bomb'); sim(0.4);
      n.bomb = { enemyDmg: 60 - en.hp, enemySpeed: Math.round(en.vel.length()) };
      // rocket jump: bomb at own feet
      reset(); p.pitch = -1.45; p.useAbility('bomb'); sim(0.15); n.rocketJumpVy = Math.round(p.vel.y); n.selfDmg = 100 - p.hp; sim(3);
      // heal
      reset(); p.hp = 30; p.useAbility('heal'); n.heal = p.hp;
      // remote player glow: see-through material
      game.onNet({ t: 's', p: { id: 'glowpeer', n: 'Glowy', x: st4.x + 10, y: st4.y, z: st4.z, vx: 0, vy: 0, vz: 0, yw: 0, pt: 0, hp: 100, mh: 100, d: 0, hs: 0, hx: 0, hy: 0, hz: 0 }, e: [] });
      const gp = game.remotes.get('glowpeer');
      let glow = false; gp.model.group.traverse((o) => { if (o.isMesh && o.material.depthTest === false && o.material.blending === THREE.AdditiveBlending) glow = true; });
      n.glow = glow;
      n.tagThroughWalls = gp.model.tag.material.depthTest === false;
      game.removeOwner('glowpeer');
      log.newAbilities = n;
    }
    log.coins = game.save.coins; log.chunks = game.world.built.size; log.errors = window.__errs;
    out.textContent = "AUTOTEST " + JSON.stringify(log);
    game.renderer.render = realRender;
  }, 500);
}

// visual preview for screenshots: index.html?shot=N
const shotM = location.search.match(/shot=(\d)/);
if (shotM) {
  setTimeout(() => {
    game.start('solo');
    const p = game.player, n = +shotM[1];
    if (n === 1) { p.yaw = 2.4; p.pitch = -0.05; }
    else if (n === 3) { game.save.coins = 85; game.save.abil = { swap: true, dash: true, leap: true }; game.ui.renderAbilities(); game.player.cd = { dash: 2.5 }; setTimeout(() => { game.shopOpen = true; game.ui.openShop(); }, 100); }
    else if (n === 9) { setTimeout(() => { game.running = false; game.ui.showHud(false); game.ui.showMenu(false); }, 50); }
    else {
      const c = game.world.spawnCandidates(p.pos, 150, 700).sort((a, b) => b.R - a.R)[n - 2] || game.world.spawnCandidates(p.pos, 150, 700)[0];
      const st = c.pointAt(0.3, 0.5); p.pos.set(st.x, st.y + 0.5, st.z); p.yaw = 1.2; p.pitch = -0.1;
      for (let i = 0; i < 3; i++) { const q = c.pointAt(0.3 + 0.25 * (i - 1), 0.75); q.y += 1; game.enemies.push(new Enemy(game, q)); }
      game.enemies.forEach((e) => { e.think = 99; e.yaw = -0.6; });
      p.yaw = Math.atan2(-(c.x - p.pos.x), -(c.z - p.pos.z)) + Math.PI + 0.9;
    }
    game.world.preload(p.pos, 2);
  }, 300);
}

// automated multiplayer join: index.html?autojoin=CODE
const aj = location.search.match(/autojoin=([A-Z0-9]+)/);
if (aj) setTimeout(() => game.start('join', aj[1]), 300);
