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
import { computeStats, COSTS, MAX_LEVEL } from './upgrades.js';

window.__errs = [];
addEventListener('error', (e) => window.__errs.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__errs.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

const TAU = Math.PI * 2;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const SAVE_KEY = 'skygrapple_save_v1';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();

function loadSave() {
  const def = { name: '', coins: 0, up: {}, quality: isTouch ? 'low' : 'high' };
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
      _w.copy(ent.pos); _w.y += 0.7;
      _v.subVectors(_w, o);
      const t = _v.dot(dir);
      if (t < -1.2 || t > bd + 1.2) return;
      const tt = Math.max(0, Math.min(bd, t));
      const px = o.x + dir.x * tt - _w.x, py = o.y + dir.y * tt - _w.y, pz = o.z + dir.z * tt - _w.z;
      if (px * px + py * py + pz * pz < 1.15 * 1.15) { bd = tt; best = ent; }
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
    if (la && performance.now() - la.t < 12000) this.reportKill(la.id, la.name, 'Grappler', 'enemy');
  }
  reportKill(killer, kname, vname, vkind) {
    const m = { t: 'kill', killer, kname, vname, vkind };
    this.handleKill(m);
    if (this.net) this.net.send(m);
  }
  handleKill(m) {
    const mine = m.killer === this.player.id;
    this.ui.feed(`${m.kname} ⚔ ${m.vname}`, mine ? 'me' : m.vkind === 'player' ? 'pk' : '');
    if (mine) {
      const reward = m.vkind === 'player' ? 25 : 15;
      this.addCoins(reward);
      this.sfx.kill();
      this.ui.toast(`+${reward} 🪙  ${m.vkind === 'player' ? 'Player' : 'Grappler'} eliminated!`);
    }
  }
  manageEnemies() {
    const p = this.player;
    const cap = this.quality === 'high' ? 10 : 7;
    for (const e of this.enemies) if (e.pos.distanceTo(p.pos) > 750 && !e.dead) { e.dead = true; e.dispose(); }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (p.dead) return;
    let near = this.enemies.length;
    for (const r of this.remotes.values()) if (r.kind === 'enemy' && r.pos.distanceTo(p.pos) < 500) near++;
    if (near >= cap) return;
    const cands = this.world.spawnCandidates(p.pos, 110, 480);
    if (!cands.length) return;
    const I = cands[Math.floor(Math.random() * cands.length)];
    const pt = I.pointAt(Math.random() * TAU, Math.random() * 0.6);
    pt.y += 1;
    this.enemies.push(new Enemy(this, pt));
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
          if (!re) { re = new Remote(this, id, 'enemy', 'Grappler', ps.id); this.remotes.set(id, re); }
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
      es.push([e.id, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.vel.x), r2(e.vel.y), r2(e.vel.z), r2(e.yaw), Math.round(e.hp), eh.state, r2(eh.pos.x), r2(eh.pos.y), r2(eh.pos.z)]);
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
      if (this.net) {
        const players = 1 + [...this.remotes.values()].filter((r) => r.kind === 'player').length;
        const st = this.net.ready ? `${players} online${this.net.isHost ? ' · host' : ''}` : this.netStatus || 'Connecting…';
        ui.net(`🌐 ${this.roomLabel} · ${st}${this.roomCode ? ' · tap to copy invite' : ''}`);
      }
    }
  }
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
