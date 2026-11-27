import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Grass, Dust, HOLES } from './realism.js';
import { World, SPAWN, CHUNK, KILL_Y, inSafeZone } from './world.js';
import { Player, HOOK } from './player.js';
import { Enemy } from './enemy.js';
import { Remote } from './remote.js';
import { Net } from './net.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Sfx } from './audio.js';
import { Clouds } from './clouds.js';
import { Particles } from './particles.js';
import { makeGun, makeHookHead, Rope, SagRope, ropeSag, makeCharacter, makeTextSprite } from './models.js';
import { computeStats, COSTS, MAX_LEVEL, ABILITY, ABILITIES, PASSIVE, HOOKS, HOOK_DEF } from './upgrades.js';
import { Grab } from './grab.js';
import { applyTether } from './entity.js';
import { ENEMY_TYPES, ENEMY_KEYS, BOSS_KEYS } from './enemytypes.js';

window.__errs = [];
addEventListener('error', (e) => window.__errs.push(String(e.message)));
addEventListener('unhandledrejection', (e) => window.__errs.push('promise: ' + String(e.reason && e.reason.message || e.reason)));

const TAU = Math.PI * 2;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const SAVE_KEY = 'skygrapple_save_v1';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();
const HOOK_KINDS = ['normal', 'grabber', 'lightrope'];
const ROPE_STYLE = { normal: [0x23262b, 0.03], grab: [0x1a1a1a, 0.055], light: [0xcfd3d8, 0.016] };

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
    this.stats = computeStats(this.save.up, this.save.passive);
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
    r.toneMappingExposure = 0.74;
    r.shadowMap.enabled = hi;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.autoClear = false;
    this.scene = new THREE.Scene();
    this.fogColor = 0xbcd4ec;
    const loadR = hi ? 5 : 4;
    this.viewDist = loadR * CHUNK;
    this.scene.fog = new THREE.FogExp2(this.fogColor, 1.35 / this.viewDist);
    if (hi) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, null));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.16, 0.4, 1.0));
      this.composer.addPass(new OutputPass());
    }
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 5000);
    this.camera.rotation.order = 'YXZ';
    if (this.composer) this.composer.passes[0].camera = this.camera;
    this.scene.add(this.camera);
    this.setupSky(hi);

    this.world = new World(this.scene, { loadRadius: loadR, shadows: hi });
    this.world.camera = this.camera;
    this.clouds = new Clouds(this.scene, hi, this.fogColor, this.viewDist);
    this.particles = new Particles(this.scene);
    this.grass = new Grass(this.scene, this.world, hi, CHUNK);
    this.dust = new Dust(this.scene, hi ? 350 : 160);
    this.grab = new Grab(this);
    this.editLog = []; this.editSeen = new Set();
    this.camDip = 0; this.stepT = 0;
    this.strikes = []; this.wells = []; this.missiles = []; this.loot = []; this.zaps = []; this.mines = []; this.spawnQueue = []; this.dots = []; this.bags = []; this.decoys = []; this.warpT = 0;
    this.fxGeo = { ring: new THREE.RingGeometry(0.78, 1, 40), bolt: new THREE.CylinderGeometry(0.35, 0.7, 240, 8, 1, true), ball: new THREE.SphereGeometry(1, 16, 12), mine: new THREE.CylinderGeometry(0.55, 0.65, 0.22, 16), gem: new THREE.OctahedronGeometry(1, 0), beam: new THREE.CylinderGeometry(0.8, 0.8, 90, 10, 1, true) };
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
    this.save.hidden = this.save.hidden || {};
    this.save.passive = this.save.passive || {};
    this.save.gems = this.save.gems || 0;
    this.save.hooks = this.save.hooks || {};
    this.gun.setVariant(this.hookKind());
    this.ui.hookLabel(this.hookKind(), this.ownedHooks().length);
    if (this.save.musicVol === undefined) this.save.musicVol = 0.5;
    this.sfx.music.setVolume(this.save.musicVol);
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

    this.hemi = new THREE.HemisphereLight(0xc6dcff, 0x4f5a3c, 0.42);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffe6c8, 3.1));
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
    this.hookMeshes = {};
    for (const [k, sc] of [['normal', 2.2], ['grabber', 3.4], ['lightrope', 1.6]]) {
      const m = makeHookHead(k); m.scale.setScalar(sc); m.visible = false;
      this.scene.add(m); this.hookMeshes[k] = m;
    }
    this.hookMesh = this.hookMeshes.normal;
    this.rope = new SagRope(0x23262b, 0.03);
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
    if (this.composer) this.composer.setSize(innerWidth, innerHeight);
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
    this.sfx.playMusic();
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
  sens() { return this.save.sens || 1; }
  pause() { if (!this.running) return; this.ui.showPause(true); }
  onLockError() {
    // browsers refuse to re-lock the mouse for ~1s after Esc: keep the pause menu up so Resume can be clicked again
    if (!this.running || isTouch || this.shopOpen) return;
    this.ui.showPause(true);
    this.ui.toast('Click Resume again to look around');
  }
  resume() { this.ui.showPause(false); if (!isTouch) this.input.lock(); }
  onLockChange(locked) {
    if (!this.running || isTouch) return;
    if (locked) this.ui.showPause(false);
    else if (!this.shopOpen) this.ui.showPause(true);
  }

  // ---------------------------------------------------------- actions
  look(dx, dy) {
    if (this.shopOpen || !this.running) return;
    const p = this.player;
    if (p.snipeT > 0) { dx *= 0.4; dy *= 0.4; }
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
    this.shopMode = this.nearShop.type || (this.nearShop.passive ? 'passive' : 'normal');
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
    this.stats = computeStats(this.save.up, this.save.passive);
    if (key === 'health') this.player.hp += this.stats.health - oldMax;
    this.persist();
    this.sfx.buy();
    this.ui.renderShop();
  }
  buyPassive(key) {
    const P = PASSIVE[key];
    if (!P || this.save.passive[key] || this.save.coins < P.cost) return;
    this.save.coins -= P.cost;
    this.save.passive[key] = true;
    this.stats = computeStats(this.save.up, this.save.passive);
    this.persist();
    this.sfx.buy(); this.sfx.kill();
    this.ui.renderShop();
    this.ui.toast(`${P.icon} ${P.name} is now always active!`);
  }
  // ---- grappling hooks (bought with gems in HOOK SHOPS)
  hookKind() { const k = this.save.hookSel; return k && k !== 'normal' && this.save.hooks && this.save.hooks[k] ? k : 'normal'; }
  ownedHooks() { return HOOKS.filter((H) => H.key === 'normal' || (this.save.hooks || {})[H.key]).map((H) => H.key); }
  equipHook(key, quiet) {
    if (key !== 'normal' && !this.save.hooks[key]) return;
    const p = this.player;
    if (p.held) this.grab.dropHeld(p);
    if (p.hook.state !== HOOK.IDLE) p.hook.state = HOOK.RETRACT;
    this.save.hookSel = key; this.persist();
    this.gun.setVariant(key);
    this.ui.hookLabel(key, this.ownedHooks().length);
    if (!quiet) { const H = HOOK_DEF[key]; this.ui.toast(`${H.icon} ${H.name} equipped`); this.sfx.cancel(); }
    if (this.shopOpen) this.ui.renderShop();
  }
  cycleHook() {
    if (!this.running || this.shopOpen) return;
    const o = this.ownedHooks();
    if (o.length < 2) { this.ui.toast('🪝 Get new hooks with 💎 gems at a HOOK SHOP (black-and-yellow roof)'); return; }
    this.equipHook(o[(o.indexOf(this.hookKind()) + 1) % o.length]);
  }
  buyHook(key) {
    const H = HOOK_DEF[key];
    if (!H || key === 'normal' || this.save.hooks[key]) return;
    if (this.save.gems < H.gems || this.save.coins < H.cost) return;
    this.save.gems -= H.gems; this.save.coins -= H.cost; this.save.hooks[key] = true;
    this.persist();
    this.sfx.buy(); this.sfx.kill();
    this.equipHook(key, true);
    this.ui.renderShop();
    this.ui.toast(`${H.icon} ${H.name} is yours and equipped! ${this.ui.touch ? 'The 🪝 button' : 'Tab / mouse wheel'} switches hooks`);
  }
  addGems(n) { this.save.gems = (this.save.gems || 0) + n; this.persist(); }
  // Lightrope: keep whatever is on the end of the rope within reach
  tetherEntity(p, tg, L) {
    if (tg.T && tg.T.boss) { applyTether(p, tg.pos, L, 0); return; } // too heavy: the boss drags YOU around
    if (this.enemies.includes(tg)) { tg.applyHit({ mode: 'tether', a: p.pos.toArray(), L, attacker: p.id, aname: this.name }); return; }
    if (this.remotes.has(tg.id) && this.net && this.time - (this.lastTeth || 0) > 0.1) {
      this.lastTeth = this.time;
      const r2 = (v) => Math.round(v * 100) / 100;
      this.net.send({ t: 'hit', target: tg.id, mode: 'tether', a: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], L: r2(L), attacker: p.id, aname: this.name });
    }
  }
  // ---- world edits (Ground Grabber): applied here, sent to everyone, kept for players who join later
  edit(op) {
    op.id = op.id || this.sid + '-e' + (this.editN = (this.editN || 0) + 1);
    this.editSeen.add(op.id); this.editLog.push(op);
    if (this.editLog.length > 600) this.editLog.shift();
    const res = this.world.applyOp(op);
    if (this.net) this.net.send({ t: 'wed', op });
    return res;
  }
  remoteEdit(op) {
    if (!op || typeof op !== 'object' || !op.id || this.editSeen.has(op.id)) return;
    this.editSeen.add(op.id); this.editLog.push(op);
    if (this.editLog.length > 600) this.editLog.shift();
    if (op.o === 'place') this.grab.landedRemote(op.pid);
    this.world.applyOp(op);
    const at = op.o === 'dig' ? [op.x, op.y, op.z] : op.o === 'cut' && Array.isArray(op.c) ? op.c : null;
    if (at && at.every(isFinite)) { _v.set(+at[0], +at[1], +at[2]); if (_v.distanceTo(this.player.pos) < 120) this.particles.burst(_v, 0x8a7a66, 16, 7, 0.3); }
  }
  buyAbility(key) {
    const A = ABILITY[key];
    if (!A || this.save.abil[key] || this.save.coins < A.cost) return;
    this.save.coins -= A.cost;
    this.save.abil[key] = true;
    const full = key !== 'parry' && this.ui.barCount() >= this.ui.maxBar();
    if (full) this.save.hidden[key] = true; else delete this.save.hidden[key];
    this.persist();
    this.sfx.buy();
    this.ui.renderShop();
    this.ui.renderAbilities();
    this.ui.toast(A.icon + ' ' + A.name + (full ? ' unlocked! Your button bar is full: swap it on in the shop' + (isTouch ? '' : ' (key works anyway)') : ' unlocked! Use its button.'));
  }
  useAbility(key) {
    if (!this.running || this.shopOpen || !this.save.abil[key]) return;
    this.sfx.init();
    this.player.useAbility(key);
  }
  enemyExplode(at, e, R = 8) {
    const hit = (ent) => {
      if (ent.dead) return;
      const dx = ent.pos.x - at.x, dy = ent.pos.y + 0.7 - at.y, dz = ent.pos.z - at.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) return;
      const l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: Math.round(10 + 22 * (1 - d / R)), d: [dx / l, 0, dz / l], k: 0.8 + 1.4 * (1 - d / R), attacker: e.id, aname: e.name });
    };
    hit(this.player);
    for (const r of this.remotes.values()) if (r.kind === 'player') hit(r);
    this.particles.burst(at, 0xffb020, 28, 14, 0.4);
    this.particles.burst(at, 0x3a3a3a, 14, 7, 0.45);
    const dp = at.distanceTo(this.player.pos);
    if (dp < 35) this.shake(0.6 * (1 - dp / 35) + 0.15);
    this.sfx.near('thunk', at); this.sfx.near('hurt', at);
  }
  enemyMagnet(e, R = 32) {
    const to = e.pos.clone(); to.y += 1.2;
    const pull = (ent) => {
      if (ent.dead || ent.pos.distanceTo(e.pos) > R) return;
      this.deliverHit(ent.id, { mode: 'pull', dmg: 8, a: to.toArray(), attacker: e.id, aname: e.name });
    };
    pull(this.player);
    for (const r of this.remotes.values()) if (r.kind === 'player') pull(r);
    this.particles.burst(to, 0xc77dff, 26, 12, 0.22);
    this.sfx.near('zip', e.pos);
  }
  // ---------------- boss & rare-ability effects
  blast(at, owner, R, DMG, hitPlayers, hitEnemies, KM = 1) {
    const hit = (ent) => {
      if (ent.dead || ent.id === owner.id) return;
      const sc = ent.scale || 1;
      const dx = ent.pos.x - at.x, dy = ent.pos.y + 0.7 * sc - at.y, dz = ent.pos.z - at.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R + sc * 0.6) return;
      const f = Math.max(0, 1 - d / (R + sc * 0.6));
      const l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: Math.round(DMG * (0.5 + 0.5 * f)), d: [dx / l, 0, dz / l], k: (0.8 + 1.4 * f) * KM, attacker: owner.id, aname: owner.name });
    };
    if (hitPlayers) { hit(this.player); for (const r of this.remotes.values()) if (r.kind === 'player') hit(r); }
    if (hitEnemies) { for (const e of this.enemies) hit(e); for (const r of this.remotes.values()) if (r.kind === 'enemy') hit(r); }
  }
  ownerOf(ent) { return { id: ent.id, name: ent === this.player ? this.name : ent.name, enemy: ent !== this.player }; }
  addStrike(pos, delay, R, DMG, ownerEnt, fromEnemy, fire = false) {
    const gy = this.world.groundAt(pos.x, pos.y + 3, pos.z);
    const y = gy !== null && pos.y - gy < 8 ? gy : pos.y;
    const ring = new THREE.Mesh(this.fxGeo.ring, new THREE.MeshBasicMaterial({ color: fromEnemy ? 0xff3030 : fire ? 0xffa040 : 0x66ccff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.scale.setScalar(R); ring.position.set(pos.x, y + 0.2, pos.z);
    this.scene.add(ring);
    this.strikes.push({ pos: new THREE.Vector3(pos.x, y + 1, pos.z), t: delay, R, DMG, owner: this.ownerOf(ownerEnt), fromEnemy, fire, ring, bolt: null, bt: 0 });
  }
  // ---------------- round 5: new enemy powers + abilities
  meteorRain(ownerEnt, at, n, spread, fromEnemy) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, r = i === 0 ? 0 : Math.sqrt(Math.random()) * spread;
      const q = new THREE.Vector3(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r);
      this.addStrike(q, 0.9 + i * 0.18, fromEnemy ? 4.5 : 5, fromEnemy ? 24 : 30, ownerEnt, fromEnemy, true);
    }
    this.sfx.near('zip', ownerEnt.pos);
  }
  landSlam(e) {
    const big = !!e.T.boss;
    this.blast(e.pos, this.ownerOf(e), big ? 10 : 5, big ? 30 : 16, true, false, big ? 1.6 : 1);
    _v.copy(e.pos); _v.y += 0.4;
    this.particles.burst(_v, e.T.color, big ? 40 : 18, big ? 16 : 9, 0.35);
    this.particles.burst(_v, 0x6a5a4a, big ? 24 : 10, big ? 10 : 6, 0.4);
    const dp = e.pos.distanceTo(this.player.pos);
    if (dp < 40) this.shake((big ? 0.8 : 0.4) * (1 - dp / 40));
    this.sfx.near('thunk', e.pos);
  }
  enemyHeal(e) {
    let n = 0;
    for (const o of this.enemies) {
      if (o.dead || o === e || o.hp >= o.maxHp || o.pos.distanceTo(e.pos) > 25) continue;
      o.hp = Math.min(o.maxHp, o.hp + (o.T.boss ? 40 : 20)); n++;
      o.center(_v); this.particles.burst(_v, 0x4dff88, 14, 5, 0.25);
    }
    if (n) { e.center(_v); this.particles.burst(_v, 0x4dff88, 20, 8, 0.25); this.sfx.near('coin', e.pos); }
    return n > 0;
  }
  fireBolt(p, f, o = {}) {
    const m = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshBasicMaterial({ color: o.color || 0xff7a2a }));
    m.scale.setScalar(o.size || 0.45);
    if (o.size) m.scale.set(o.size * 0.5, o.size * 0.5, o.size * 4);
    const start = this.camera.position.clone().addScaledVector(f, 1.2);
    m.position.copy(start);
    this.scene.add(m);
    if (o.size) m.lookAt(start.clone().add(f));
    this.missiles.push({ pos: start, vel: f.clone().multiplyScalar(o.speed || 80), straight: true, t: 2.2, owner: this.ownerOf(p), mesh: m, trail: 0, R: o.R || 5, DMG: o.DMG || 35, col: o.color || 0xff7a2a, spear: !!o.size });
    this.sfx.shoot(); this.recoil = 1;
  }
  chainLightning(p) {
    const all = [];
    for (const e of this.enemies) if (!e.dead) all.push(e);
    for (const r of this.remotes.values()) if (!r.dead) all.push(r);
    const hitIds = new Set();
    let from = p.eye(), cur = null, range = 35, n = 0;
    for (let k = 0; k < 4; k++) {
      let best = null, bd = range;
      for (const e of all) {
        if (hitIds.has(e.id)) continue;
        const d = e.pos.distanceTo(cur ? cur.pos : p.pos);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hitIds.add(best.id);
      const to = best.pos.clone(); to.y += 0.8 * (best.scale || 1);
      this.addZap(from, to);
      const dx = best.pos.x - from.x, dz = best.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
      this.deliverHit(best.id, { mode: 'bump', dmg: 25, k: 0.5, d: [dx / l, 0, dz / l], attacker: p.id, aname: this.name });
      this.particles.burst(to, 0xbfe4ff, 14, 8, 0.2);
      from = to; cur = best; range = 15; n++;
    }
    if (n) { this.sfx.near('hit', p.pos); this.sfx.near('zip', p.pos); this.ui.hitMarker(); }
    return n;
  }
  addZap(a, b) {
    const pts = [];
    const segs = 10;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, j = i === 0 || i === segs ? 0 : 1.1;
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * j, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * j, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * j));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.scene.add(line);
    this.zaps.push({ line, t: 0.3 });
  }
  placeMine(p) {
    const mine = this.mines.filter((m) => m.owner.id === p.id);
    if (mine.length >= 3) this.removeMine(mine[0]);
    const gy = this.world.groundAt(p.pos.x, p.pos.y + 1, p.pos.z);
    const pos = new THREE.Vector3(p.pos.x, (gy !== null && p.pos.y - gy < 3 ? gy : p.pos.y) + 0.12, p.pos.z);
    const mesh = new THREE.Mesh(this.fxGeo.mine, new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0xff2a00, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 }));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.mines.push({ pos, t: 25, arm: 0.6, owner: this.ownerOf(p), mesh });
    this.sfx.thunk();
  }
  nuke(p, at) {
    this.addStrike(at, 2.2, 24, 160, p, false, true);
    // aftershock: a ring of meteors right after the main blast
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + Math.random() * 0.4, r = 10 + Math.random() * 12;
      this.addStrike(new THREE.Vector3(at.x + Math.cos(ang) * r, at.y, at.z + Math.sin(ang) * r), 2.45 + i * 0.12, 5, 30, p, false, true);
    }
    this.ui.toast('☢️ NUKE INCOMING!');
    this.sfx.parry();
  }
  updateLaser(p, dt) {
    if (!(p.laserT > 0) || p.dead) { if (this.laserMesh) this.laserMesh.visible = false; return; }
    p.laserT -= dt;
    if (!this.laserMesh) {
      const geo = new THREE.CylinderGeometry(0.35, 0.025, 1, 10, 1, true); geo.translate(0, 0.5, 0);
      this.laserMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff1a1a, transparent: true, opacity: 0.8, depthWrite: false, fog: false, toneMapped: false }));
      this.laserCore = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffeeee, depthWrite: false, fog: false, toneMapped: false }));
      this.laserCore.scale.set(0.4, 1, 0.4);
      this.laserMesh.add(this.laserCore);
      this.laserMesh.frustumCulled = false; this.laserCore.frustumCulled = false;
      this.scene.add(this.laserMesh);
    }
    const lv = this._lv || (this._lv = [0, 1, 2, 3].map(() => new THREE.Vector3()));
    const o = this.camera.position, f = p.forward(lv[0]);
    const wh = this.world.raycast(o, f, 200);
    let dist = wh ? wh.dist : 200;
    const eh = this.hitTestEntities(o, f, dist, p.id, false);
    if (eh) dist = eh.dist;
    const end = lv[1].copy(o).addScaledVector(f, dist);
    const start = this.muzzleWorld(lv[2]);
    const dir = lv[3].subVectors(end, start); const len = dir.length();
    const L = this.laserMesh;
    L.visible = true;
    L.position.copy(start);
    L.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len || 1));
    const wob = 1 + Math.sin(this.time * 60) * 0.25;
    L.scale.set(wob * (1 + Math.min(1, p.laserT) * 0.5), len, wob * (1 + Math.min(1, p.laserT) * 0.5));
    if (Math.random() < dt * 40) this.particles.burst(end, Math.random() < 0.5 ? 0xff4a1a : 0xffd23a, 3, 6, 0.2);
    p.laserTick -= dt;
    if (p.laserTick <= 0) {
      p.laserTick = 0.1;
      if (eh) {
        const dx = eh.ent.pos.x - p.pos.x, dz = eh.ent.pos.z - p.pos.z, l = Math.hypot(dx, dz) || 1;
        this.deliverHit(eh.ent.id, { mode: 'burn', dmg: 10, attacker: p.id, aname: this.name });
        this.ui.hitMarker();
      }
      this.shake(0.12);
    }
    if (p.laserT <= 0) L.visible = false;
  }
  enemyFrostNova(e, R) {
    const hit = (ent) => {
      if (ent.dead || ent.pos.distanceTo(e.pos) > R) return;
      const dx = ent.pos.x - e.pos.x, dz = ent.pos.z - e.pos.z, l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: 18, k: 0.6, d: [dx / l, 0, dz / l], freeze: 3, attacker: e.id, aname: e.name });
    };
    hit(this.player);
    for (const r of this.remotes.values()) if (r.kind === 'player') hit(r);
    e.center(_v);
    for (let k = 0; k < 3; k++) this.particles.burst(_v, k ? 0xbfefff : 0xffffff, 40, 10 + k * 7, 0.45);
    if (e.pos.distanceTo(this.player.pos) < 50) this.shake(0.4);
    this.sfx.near('parry', e.pos);
  }
  addDot(id, owner, ticks, dmg) { this.dots.push({ id, owner, n: ticks, dmg, t: 0.5 }); }
  dropCoinBag(pos, n, id, remote, kind = 'coin') {
    const g = new THREE.Group();
    const gem = kind === 'gem';
    if (gem) {
      // a cluster of glowing gems
      const gm = new THREE.MeshStandardMaterial({ color: 0x7af0ff, emissive: 0x2a9cff, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.15 });
      const spin = new THREE.Group(); g.add(spin);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(this.fxGeo.gem, gm);
        const a = (i / 4) * TAU;
        c.scale.set(0.32, 0.55, 0.32); c.position.set(i ? Math.cos(a) * 0.45 : 0, i ? 0.45 : 0.9, i ? Math.sin(a) * 0.45 : 0); c.rotation.z = i ? 0.4 : 0;
        spin.add(c);
      }
    } else {
      const sack = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshStandardMaterial({ color: 0xc9a050, roughness: 0.8 }));
      sack.scale.set(0.7, 0.6, 0.7); sack.position.y = 0.55; g.add(sack);
      const knot = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshStandardMaterial({ color: 0x8a6a30, roughness: 0.8 }));
      knot.scale.setScalar(0.22); knot.position.y = 1.15; g.add(knot);
      const coin = new THREE.Mesh(this.fxGeo.mine, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xaa7700, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3 }));
      coin.scale.set(0.8, 0.6, 0.8); coin.rotation.x = Math.PI / 2; coin.position.set(0, 0.65, 0.62); g.add(coin);
    }
    const label = makeTextSprite(gem ? `💎 ${n}` : `💰 ${n}`, { bg: gem ? 'rgba(0,30,50,0.75)' : 'rgba(40,30,0,0.75)', color: gem ? '#7af0ff' : '#ffd23a', size: 1 });
    label.position.y = 2.2; g.add(label);
    const beam = new THREE.Mesh(this.fxGeo.beam, new THREE.MeshBasicMaterial({ color: gem ? 0x5ae0ff : 0xffd23a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.scale.set(0.5, 1, 0.5); beam.position.y = 45; g.add(beam);
    g.position.copy(pos);
    this.scene.add(g);
    const bag = { id: id || this.sid + '-bag-' + Math.floor(Math.random() * 1e9), pos: pos.clone(), n, g, t: 180, kind: gem ? 'gem' : 'coin' };
    this.bags.push(bag);
    if (!remote && this.net) this.net.send({ t: 'bag', id: bag.id, x: pos.x, y: pos.y, z: pos.z, n, k: bag.kind });
    return bag;
  }
  removeBag(bag) {
    this.scene.remove(bag.g);
    bag.g.traverse((o) => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    this.bags.splice(this.bags.indexOf(bag), 1);
  }
  addDecoy(p) {
    const m = makeCharacter(0x2f7bff, { name: this.name, tagColor: '#cfe2ff' });
    const pos = p.pos.clone();
    m.group.position.copy(pos); m.group.rotation.y = p.yaw;
    this.scene.add(m.group);
    this.decoys.push({ id: 'decoy' + Math.random(), kind: 'player', name: this.name, pos, vel: new THREE.Vector3(), ground: p.ground, scale: 1, dead: false, t: 7, model: m });
    _v.copy(pos); _v.y += 0.8; this.particles.burst(_v, 0x6fb0ff, 20, 6, 0.25);
  }
  removeMine(m) {
    this.scene.remove(m.mesh); m.mesh.material.dispose();
    this.mines.splice(this.mines.indexOf(m), 1);
  }
  enemyLightning(e, tg) {
    const targets = [this.player, ...[...this.remotes.values()].filter((r) => r.kind === 'player')];
    for (const pl of targets) {
      if (pl.dead || inSafeZone(pl.pos) || pl.pos.distanceTo(e.pos) > 90) continue;
      const q = pl.pos.clone(); q.x += (Math.random() - 0.5) * 3; q.z += (Math.random() - 0.5) * 3;
      this.addStrike(q, 1.3, 5, 28, e, true);
    }
    for (let i = 0; i < 2; i++) {
      const q = tg.pos.clone(); q.x += (Math.random() - 0.5) * 14; q.z += (Math.random() - 0.5) * 14;
      this.addStrike(q, 1.0 + Math.random() * 0.8, 5, 28, e, true);
    }
    this.sfx.near('zip', e.pos);
  }
  hiveSummon(e, types = ['zipper', 'bomber']) {
    e.minions = (e.minions || []).filter((m) => !m.dead);
    if (e.minions.length >= 5) return;
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU;
      const x = e.pos.x + Math.cos(a) * 6, z = e.pos.z + Math.sin(a) * 6;
      const gy = this.world.groundAt(x, e.pos.y + 4, z);
      if (gy === null) continue;
      const m = new Enemy(this, new THREE.Vector3(x, gy + 0.5, z), types[Math.floor(Math.random() * types.length)]);
      this.enemies.push(m); e.minions.push(m);
      this.particles.burst(m.pos, 0xffd23a, 14, 6, 0.2);
    }
    this.sfx.near('buy', e.pos);
  }
  addWell(pos, ownerEnt) {
    const core = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshBasicMaterial({ color: 0x050008 }));
    core.scale.setScalar(1.3);
    const halo = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.copy(pos); halo.position.copy(pos);
    this.scene.add(core, halo);
    this.wells.push({ pos: pos.clone(), t: 3, pulse: 0, owner: this.ownerOf(ownerEnt), core, halo });
    this.sfx.zip();
  }
  fireMissiles(p, o = {}) {
    const targets = o.targets || 4, per = o.per || 1, maxD = o.maxD || 70;
    const list = [];
    for (const e of this.enemies) if (!e.dead) list.push(e);
    for (const r of this.remotes.values()) if (!r.dead) list.push(r);
    const near = list.map((e) => [e, e.pos.distanceTo(p.pos)]).filter((x) => x[1] < maxD).sort((a, b) => a[1] - b[1]).slice(0, targets);
    const shots = [];
    for (let k = 0; k < per; k++) for (const n of near) shots.push(n[0]);
    shots.forEach((e, i) => {
      const m = new THREE.Mesh(this.fxGeo.ball, new THREE.MeshBasicMaterial({ color: o.color || 0xffd23a }));
      m.scale.setScalar(o.DMG ? 0.45 : 0.35);
      const start = p.eye(); start.y += 0.3;
      m.position.copy(start);
      this.scene.add(m);
      const c = (shots.length - 1) / 2;
      const v = new THREE.Vector3((i - c) * (per > 1 ? 4 : 9), 14 + (i % 3) * 3, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      this.missiles.push({ pos: start, vel: v, target: e.id, t: 6, owner: this.ownerOf(p), mesh: m, trail: 0, R: o.R, DMG: o.DMG });
    });
    if (near.length) this.sfx.shoot();
    return near.length;
  }
  spawnLoot(key, at) {
    const A = ABILITY[key];
    if (!A) return;
    if (this.save.abil[key]) { this.addCoins(150); this.ui.toast(`👑 Boss loot: +150 🪙 (you already have ${A.name})`); return; }
    const p = this.player;
    let pos = at ? new THREE.Vector3().fromArray(at) : null;
    if (pos) { const gy = this.world.groundAt(pos.x, pos.y + 3, pos.z); if (gy === null) pos = null; else pos.y = gy; }
    if (!pos) { const f = p.forward(); f.y = 0; f.normalize(); pos = p.pos.clone().addScaledVector(f, 4); }
    pos.y += 1.4;
    const gem = new THREE.Mesh(this.fxGeo.gem, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xff9a00, emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.2 }));
    gem.scale.set(0.8, 1.2, 0.8); gem.position.copy(pos);
    const beam = new THREE.Mesh(this.fxGeo.beam, new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
    beam.position.set(pos.x, pos.y + 45, pos.z);
    this.scene.add(gem, beam);
    this.loot.push({ key, pos, gem, beam });
    this.ui.toast(`👑 RARE DROP: ${A.icon} ${A.name}! Grab the golden gem`);
    this.ui.feed(`👑 ${A.name} dropped (follow the gold beam)`, 'me');
  }
  updateFx(dt) {
    const p = this.player;
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      s.t -= dt;
      if (!s.bolt) {
        s.ring.material.opacity = 0.3 + 0.4 * Math.abs(Math.sin(this.time * 14));
        if (s.t <= 0) {
          s.bolt = new THREE.Mesh(this.fxGeo.bolt, new THREE.MeshBasicMaterial({ color: s.fire ? 0xff7a2a : 0xcfe8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
          s.bolt.position.set(s.pos.x, s.pos.y + 119, s.pos.z);
          this.scene.add(s.bolt);
          s.bt = 0.3;
          this.blast(s.pos, s.owner, s.R, s.DMG, true, !s.fromEnemy, 1.2);
          this.particles.burst(s.pos, s.fire ? 0xff8a3a : 0xbfe4ff, 30, 14, 0.25);
          if (s.fire) this.particles.burst(s.pos, 0x3a2a2a, 14, 8, 0.4);
          if (s.R >= 20) {
            for (let k = 0; k < 4; k++) { _w.copy(s.pos); _w.y += k * 6; this.particles.burst(_w, k % 2 ? 0xffd23a : 0xff5a1a, 60, 26 + k * 6, 0.7); }
            this.particles.burst(s.pos, 0x2a2020, 50, 14, 0.9);
            const dn = s.pos.distanceTo(p.pos);
            if (dn < 150) { this.shake(1.2 * (1 - dn / 150) + 0.3); this.hurtV = Math.max(this.hurtV, 0.3); }
            this.ui.whiteFlash && this.ui.whiteFlash();
          }
          const dp = s.pos.distanceTo(p.pos);
          if (dp < 60) this.shake(0.7 * (1 - dp / 60));
          this.hurtV = Math.max(this.hurtV, dp < 40 ? 0.15 : 0);
          this.sfx.near('thunk', s.pos); this.sfx.near('hit', s.pos);
        }
      } else {
        s.bt -= dt;
        s.bolt.material.opacity = Math.max(0, s.bt / 0.3);
        s.bolt.scale.x = s.bolt.scale.z = 0.6 + Math.random() * 0.8;
        if (s.bt <= 0) {
          this.scene.remove(s.ring, s.bolt);
          s.ring.material.dispose(); s.bolt.material.dispose();
          this.strikes.splice(i, 1);
        }
      }
    }
    for (let i = this.wells.length - 1; i >= 0; i--) {
      const w = this.wells[i];
      w.t -= dt; w.pulse -= dt;
      w.halo.scale.setScalar(3.5 + Math.sin(this.time * 9) * 0.6);
      w.core.rotation.y += dt * 4;
      if (w.pulse <= 0 && w.t > 0) {
        w.pulse = 0.5;
        const to = w.pos.toArray();
        const pull = (ent) => {
          if (ent.dead || ent.id === w.owner.id || ent.pos.distanceTo(w.pos) > 25) return;
          this.deliverHit(ent.id, { mode: 'pull', dmg: 6, a: to, attacker: w.owner.id, aname: w.owner.name });
        };
        for (const e of this.enemies) pull(e);
        for (const r of this.remotes.values()) pull(r);
        this.particles.burst(w.pos, 0x9b4dff, 14, 9, 0.18);
      }
      if (w.t <= 0) {
        this.blast(w.pos, w.owner, 7, 25, true, true, 1.4);
        this.particles.burst(w.pos, 0xc77dff, 36, 16, 0.3);
        this.scene.remove(w.core, w.halo);
        w.core.material.dispose(); w.halo.material.dispose();
        this.wells.splice(i, 1);
        this.sfx.thunk();
      }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t -= dt;
      if (m.straight) {
        let boom2 = m.t <= 0;
        if (!boom2) {
          const len = m.vel.length() * dt;
          const dir = _y.copy(m.vel).normalize();
          const wh = this.world.raycast(m.pos, dir, len);
          const whd = wh ? wh.dist : 1e9;
          const eh = this.hitTestEntities(m.pos, dir, len, m.owner.id, false);
          if (wh || eh) { m.pos.addScaledVector(dir, Math.min(whd, eh ? eh.dist : 1e9)); boom2 = true; }
          else {
            m.pos.addScaledVector(m.vel, dt); m.mesh.position.copy(m.pos);
            m.trail -= dt;
            if (m.trail <= 0) { m.trail = 0.03; this.particles.burst(m.pos, m.spear ? 0xffffff : Math.random() < 0.5 ? 0xffb020 : 0xff4a1a, m.spear ? 1 : 2, 2, 0.15); }
          }
        }
        if (boom2) {
          this.blast(m.pos, m.owner, m.R, m.DMG, true, true, m.spear ? 0.7 : 1.2);
          if (m.spear) this.particles.burst(m.pos, 0xdfe6ee, 18, 8, 0.2);
          else { this.particles.burst(m.pos, 0xff7a2a, 26, 12, 0.3); this.particles.burst(m.pos, 0x3a2a2a, 10, 6, 0.4); }
          this.sfx.near('thunk', m.pos);
          this.scene.remove(m.mesh); m.mesh.material.dispose();
          this.missiles.splice(i, 1);
        }
        continue;
      }
      const tg = this.getEntity(m.target);
      let boom = m.t <= 0 || !tg || tg.dead;
      if (!boom) {
        _v.copy(tg.pos); _v.y += 0.7 * (tg.scale || 1);
        _w.subVectors(_v, m.pos);
        const d = _w.length();
        if (d < 1.4 + (tg.scale || 1) * 0.5) boom = true;
        else {
          _w.multiplyScalar(60 / d);
          m.vel.lerp(_w, Math.min(1, 4 * dt));
          m.pos.addScaledVector(m.vel, dt);
          m.mesh.position.copy(m.pos);
          m.trail -= dt;
          if (m.trail <= 0) { m.trail = 0.05; this.particles.burst(m.pos, 0xffb020, 1, 1, 0.12); }
        }
      }
      if (boom) {
        this.blast(m.pos, m.owner, m.R || 4.5, m.DMG || 30, true, true);
        this.particles.burst(m.pos, 0xffb020, 16, 9, 0.25);
        this.sfx.near('thunk', m.pos);
        this.scene.remove(m.mesh); m.mesh.material.dispose();
        this.missiles.splice(i, 1);
      }
    }
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      d.t -= dt;
      if (d.t > 0) continue;
      d.t = 0.5; d.n--;
      const ent = this.getEntity(d.id);
      if (!ent || ent.dead || d.n < 0) { this.dots.splice(i, 1); continue; }
      this.deliverHit(d.id, { mode: 'burn', dmg: d.dmg, attacker: d.owner.id, aname: d.owner.name });
      _v.copy(ent.pos); _v.y += 0.8 * (ent.scale || 1); this.particles.burst(_v, Math.random() < 0.5 ? 0xff7a2a : 0xffd23a, 6, 4, 0.25);
    }
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const b = this.bags[i];
      b.t -= dt;
      b.g.children[0].rotation.y += dt;
      b.g.position.y = b.pos.y + Math.abs(Math.sin(this.time * 3)) * 0.25;
      const reach = p.has('coinmagnet') ? 12 : 2.6;
      if (!p.dead && p.pos.distanceTo(b.pos) < reach) {
        if (b.kind === 'gem') { this.addGems(b.n); this.ui.toast(`💎 Picked up ${b.n} gems! Spend them at a HOOK SHOP`); }
        else { this.save.coins += b.n; this.persist(); this.ui.toast(`💰 Picked up ${b.n} coins!`); }
        this.sfx.buy(); this.sfx.coin();
        _v.copy(b.pos); _v.y += 0.8; this.particles.burst(_v, b.kind === 'gem' ? 0x7af0ff : 0xffd23a, 30, 8, 0.3);
        if (this.net) this.net.send({ t: 'bagTake', id: b.id });
        this.removeBag(b);
      } else if (b.t <= 0) this.removeBag(b);
    }
    for (let i = this.decoys.length - 1; i >= 0; i--) {
      const d = this.decoys[i];
      d.t -= dt;
      d.model.update(dt, this.camera, false, 0);
      if (d.t <= 0) {
        d.dead = true;
        _v.copy(d.pos); _v.y += 0.8; this.particles.burst(_v, 0x6fb0ff, 24, 7, 0.25);
        this.scene.remove(d.model.group); d.model.dispose();
        this.decoys.splice(i, 1);
      }
    }
    if (p.blizT > 0 && !p.dead) {
      p.blizT -= dt; p.blizTick -= dt;
      for (let k = 0; k < 6; k++) { const a = Math.random() * TAU, r = Math.random() * 22; _v.set(p.pos.x + Math.cos(a) * r, p.pos.y + Math.random() * 8, p.pos.z + Math.sin(a) * r); this.particles.burst(_v, 0xffffff, 1, 3, 0.4); }
      if (p.blizTick <= 0) {
        p.blizTick = 0.5;
        const hit = (ent) => {
          if (ent.dead || ent === p || ent.pos.distanceTo(p.pos) > 22) return;
          this.deliverHit(ent.id, { mode: 'burn', dmg: 8, freeze: 1, attacker: p.id, aname: this.name });
        };
        this.enemies.forEach(hit); this.remotes.forEach(hit);
      }
    }
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.t -= dt; z.line.material.opacity = Math.max(0, z.t / 0.3);
      if (z.t <= 0) { this.scene.remove(z.line); z.line.geometry.dispose(); z.line.material.dispose(); this.zaps.splice(i, 1); }
    }
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.t -= dt; m.arm -= dt;
      m.mesh.material.emissiveIntensity = m.arm > 0 ? 0.2 : 0.4 + 0.8 * (Math.sin(this.time * 8) > 0 ? 1 : 0);
      let trig = false;
      if (m.arm <= 0) {
        const near = (ent) => !ent.dead && ent.id !== m.owner.id && ent.pos.distanceTo(m.pos) < 3.2 + (ent.scale || 1) * 0.5;
        trig = this.enemies.some(near) || [...this.remotes.values()].some(near);
      }
      if (trig || m.t <= 0) {
        if (trig) {
          _v.copy(m.pos); _v.y += 0.6;
          this.blast(_v, m.owner, 6, 45, true, true, 1.4);
          this.particles.burst(_v, 0xffb020, 30, 14, 0.4); this.particles.burst(_v, 0x3a3a3a, 14, 7, 0.45);
          this.sfx.near('thunk', m.pos); this.sfx.near('hurt', m.pos);
        }
        this.removeMine(m);
      }
    }
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.gem.rotation.y += dt * 2;
      L.gem.position.y = L.pos.y + Math.sin(this.time * 2.5) * 0.3;
      if (!p.dead && p.pos.distanceTo(L.pos) < 3.2) {
        const A = ABILITY[L.key];
        this.save.abil[L.key] = true;
        this.persist();
        this.ui.renderAbilities();
        this.ui.toast(`${A.icon} RARE ABILITY UNLOCKED: ${A.name}! (key ${A.hk})`);
        this.sfx.buy(); this.sfx.kill();
        this.particles.burst(L.pos, 0xffd23a, 40, 10, 0.25);
        this.scene.remove(L.gem, L.beam);
        L.gem.material.dispose(); L.beam.material.dispose();
        this.loot.splice(i, 1);
      }
    }
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
  shockwave(p, R = 14, DMG = 20, KM = 1) {
    const c = p.pos;
    const hit = (ent) => {
      if (ent.dead || ent === p) return;
      const dx = ent.pos.x - c.x, dy = ent.pos.y - c.y, dz = ent.pos.z - c.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) return;
      const l = Math.hypot(dx, dz) || 1;
      this.deliverHit(ent.id, { mode: 'bump', dmg: DMG, d: [dx / l, 0, dz / l], k: (0.9 + 1.8 * (1 - d / R)) * KM, attacker: p.id, aname: this.name });
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
    if (this.player && this.player.has('goldrush')) n = Math.round(n * 1.5);
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
    for (const d of this.decoys) if (d.id === id) return d;
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
    if (!p.dead && !inSafeZone(p.pos) && !(p.cloakT > 0)) { const d = p.pos.distanceTo(e.pos); if (d < bd) { bd = d; best = p; } }
    for (const r of this.remotes.values()) {
      if (r.kind !== 'player' || r.dead || inSafeZone(r.pos)) continue;
      const d = r.pos.distanceTo(e.pos);
      if (d < bd) { bd = d; best = r; }
    }
    // decoys are more tempting than the real thing
    for (const dc of this.decoys) { const d = dc.pos.distanceTo(e.pos) * 0.6; if (d < bd) { bd = d; best = dc; } }
    return best;
  }
  deliverHit(id, hit) {
    const me = this.player;
    if (hit.attacker === me.id && id !== me.id && hit.dmg) {
      if (me.rageT > 0) hit = { ...hit, dmg: Math.round(hit.dmg * 2) };
      if (me.has('adrenaline') && me.hp < this.stats.health * 0.3) hit = { ...hit, dmg: Math.round(hit.dmg * 1.5) };
      if (me.parryT > 0 && !hit.parry) hit = { ...hit, dmg: 0 };
      else {
        if (me.vampT > 0 && !me.dead) me.hp = Math.min(this.stats.health, me.hp + hit.dmg * 0.5);
        if (me.has('lifesteal') && !me.dead) me.hp = Math.min(this.stats.health, me.hp + hit.dmg * 0.15);
      }
    }
    if (id === this.player.id) { this.player.applyHit(hit); return; }
    for (const e of this.enemies) if (e.id === id) { e.applyHit(hit); return; }
    const r = this.remotes.get(id);
    if (r) { r.model.hit(); if (this.net) this.net.send({ t: 'hit', target: id, ...hit }); }
  }
  onLocalDeath(p, msg) {
    this.sfx.death();
    this.ui.showDeath(msg);
    // you drop ALL your coins where you died (or where you fell from)
    const n = this.save.coins;
    let at = null;
    if (p.pos.y > KILL_Y + 20) { const gy = this.world.groundAt(p.pos.x, p.pos.y + 2, p.pos.z); if (gy !== null && p.pos.y - gy < 30) at = new THREE.Vector3(p.pos.x, gy, p.pos.z); }
    if (!at && p.lastGround) at = p.lastGround.clone();
    if (!at) at = p.pos.clone();
    if (n > 0) {
      this.save.coins = 0; this.persist();
      this.dropCoinBag(at, n);
      this.ui.deathCoins(n);
    } else this.ui.deathCoins(0);
    _v.copy(p.pos); _v.y += 0.7;
    this.particles.burst(_v, 0x2f7bff, 24, 9, 0.35);
    const la = p.lastAttacker;
    // taken out by another player: 2 gems drop for them to grab
    const killerR = la && performance.now() - la.t < 12000 ? this.remotes.get(la.id) : null;
    if (killerR && killerR.kind === 'player') { const ga = at.clone(); ga.x += 1.5; this.dropCoinBag(ga, 2, null, false, 'gem'); }
    if (la && performance.now() - la.t < 12000) this.reportKill(la.id, la.name, this.name, 'player');
    else this.ui.feed(`☁️ ${this.name} fell`, 'me');
  }
  onEnemyDeath(e) {
    const la = e.lastAttacker;
    const drop = e.T.drop ? { k: e.T.drop, at: e.pos.y > KILL_Y + 25 ? e.pos.toArray() : null } : null;
    const fell = e.pos.y <= KILL_Y + 25;
    if (la && performance.now() - la.t < 12000) this.reportKill(la.id, la.name, e.name, 'enemy', e.T.reward, drop, e.T.boss && fell ? 10 : 0);
    if (e.T.boss) {
      this.ui.feed(`👑 ${e.name} has fallen!`, 'me');
      if (!fell) {
        // every boss drops 10 gems where it died (anyone can grab them)
        const gy = this.world.groundAt(e.pos.x, e.pos.y + 2, e.pos.z);
        const at = new THREE.Vector3(e.pos.x + 2, gy !== null && e.pos.y - gy < 25 ? gy : e.pos.y, e.pos.z);
        this.dropCoinBag(at, 10, null, false, 'gem');
        this.ui.feed('💎 10 gems dropped (follow the cyan beam)', 'me');
      }
    }
  }
  reportKill(killer, kname, vname, vkind, reward, drop, gems = 0) {
    const m = { t: 'kill', killer, kname, vname, vkind, reward, drop, gems };
    this.handleKill(m);
    if (this.net) this.net.send(m);
  }
  handleKill(m) {
    const mine = m.killer === this.player.id;
    this.ui.feed(`${m.kname} ⚔ ${m.vname}`, mine ? 'me' : m.vkind === 'player' ? 'pk' : '');
    if (mine) {
      let reward = m.reward || (m.vkind === 'player' ? 50 : 30);
      if (this.player.has('bounty')) reward += m.drop ? 150 : 25;
      if (this.player.has('bloodlust') && !this.player.dead) this.player.hp = Math.min(this.stats.health, this.player.hp + 30);
      this.addCoins(reward);
      this.sfx.kill();
      this.ui.toast(`+${reward} 🪙  ${m.vname} eliminated!`);
      if (m.drop) this.spawnLoot(m.drop.k, m.drop.at);
      if (m.gems > 0) { const gn = Math.min(50, m.gems | 0); this.addGems(gn); this.ui.feed(`💎 +${gn} gems`, 'me'); }
    }
  }
  manageEnemies() {
    const p = this.player;
    const cap = this.quality === 'high' ? 16 : 11;
    for (const e of this.enemies) if (e.pos.distanceTo(p.pos) > (e.T.boss ? 1100 : 750) && !e.dead) { e.dead = true; e.dispose(); }
    this.enemies = this.enemies.filter((e) => !e.dead);
    if (p.dead) return;
    // boss: roughly every 2-3 minutes, if none is around
    this.bossT = (this.bossT === undefined ? 25 : this.bossT) - 0.8;
    if (this.bossT <= 0) {
      this.bossT = 60 + Math.random() * 40;
      const has = this.enemies.some((e) => e.T.boss) || [...this.remotes.values()].some((r) => r.T && r.T.boss);
      const big = this.world.spawnCandidates(p.pos, 90, 320).filter((I) => I.R >= 30);
      if (!has && big.length) {
        const I = big[Math.floor(Math.random() * big.length)];
        const bp = I.pointAt(Math.random() * TAU, 0.3); bp.y += 2;
        const bk = BOSS_KEYS[Math.floor(Math.random() * BOSS_KEYS.length)], BT = ENEMY_TYPES[bk];
        this.enemies.push(new Enemy(this, bp, bk));
        this.ui.toast(`⚠️ ${BT.name} has appeared!`);
        this.ui.feed(`👑 ${BT.name} spotted: ${BT.reward} 🪙 + rare ability`, 'pk');
      }
    }
    let near = this.enemies.length;
    for (const r of this.remotes.values()) if (r.kind === 'enemy' && r.pos.distanceTo(p.pos) < 500) near++;
    if (near >= cap) return;
    const cands = this.world.spawnCandidates(p.pos, 70, 380);
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
          // catch them up on every hole, ripped wall and thrown block so far
          if (this.editLog.length && this.net) this.net.send({ t: 'wlog', ops: this.editLog.slice(-400) });
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
      case 'bag': if (!this.bags.some((b) => b.id === m.id) && isFinite(m.x) && m.n > 0) this.dropCoinBag(new THREE.Vector3(m.x, m.y, m.z), Math.min(m.k === 'gem' ? 50 : 1e7, Math.floor(m.n)), String(m.id), true, m.k === 'gem' ? 'gem' : 'coin'); break;
      case 'wed': this.remoteEdit(m.op); break;
      case 'wlog': if (Array.isArray(m.ops)) for (const op of m.ops.slice(0, 600)) this.remoteEdit(op); break;
      case 'throw': if (m.owner !== this.player.id) this.grab.fromNet(m); break;
      case 'bagTake': { const b = this.bags.find((x) => x.id === m.id); if (b) this.removeBag(b); break; }
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
      hs: h.state, hx: r2(h.pos.x), hy: r2(h.pos.y), hz: r2(h.pos.z), hk: HOOK_KINDS.indexOf(this.hookKind()),
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
      const vy0 = p.vel.y, air0 = !p.onGround;
      p.update(dt, this.input);
      if (air0 && p.onGround && vy0 < -9 && !p.dead) {
        // landing: the camera dips and dust kicks up
        this.camDip = Math.min(0.5, -vy0 * 0.012);
        _v.copy(p.pos); _v.y += 0.15; this.particles.burst(_v, 0xb9a88a, Math.min(16, Math.round(-vy0 * 0.4)), 4, 0.22);
      }
      this.updateLaser(p, dt);
      if (this.warpT > 0) this.warpT -= dt;
      const edt = this.warpT > 0 ? dt * 0.3 : dt;
      for (const e of this.enemies) e.update(edt);
      if (this.spawnQueue.length) { const q = this.spawnQueue.splice(0); for (const fn of q) fn(); }
      if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
      const now = performance.now();
      for (const [id, r] of this.remotes) {
        if (now - r.lastSeen > 6000) { this.removeRemote(id); continue; }
        r.update(dt);
      }
      this.updateFx(dt);
      this.grab.update(dt);
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnTimer = 0.8; this.manageEnemies(); }
      if (this.net && this.net.ready) {
        this.netTimer -= dt;
        if (this.netTimer <= 0) { this.netTimer = 1 / 12; this.sendState(); }
      }
      // camera
      p.eye(cam.position);
      // head bob while running, dip on landing, dust from your feet
      const hsp = Math.hypot(p.vel.x, p.vel.z);
      this.camDip *= Math.exp(-7 * dt);
      cam.position.y -= this.camDip;
      if (p.onGround && hsp > 2) {
        cam.position.y += Math.sin(this.bob * 2) * 0.035 * Math.min(1, hsp / 12);
        this.stepT -= dt * hsp;
        if (hsp > 9 && this.stepT <= 0) { this.stepT = 2.4; _v.copy(p.pos); _v.y += 0.1; this.particles.burst(_v, 0xb9a88a, 2, 1.5, 0.14); }
      }
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 1.5);
      const sk = this.shakeAmt * this.shakeAmt * 0.06;
      cam.rotation.set(p.pitch + (Math.random() - 0.5) * sk, p.yaw + (Math.random() - 0.5) * sk, 0);
      const sp = p.vel.length();
      const fov = p.snipeT > 0 ? 28 : 75 + Math.min(22, Math.max(0, sp - 12) * 0.4);
      cam.fov += (fov - cam.fov) * Math.min(1, (p.snipeT > 0 ? 10 : 5) * dt);
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
    this.grass.update(this.running ? p.pos : cam.position, dt);
    this.dust.update(cam, this.time);
    this.sky.position.copy(cam.position);
    const focus = this.running ? p.pos : cam.position;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 300);
    this.sun.target.position.copy(focus);
    if (this.running) this.updateHud(dt);
    this.ui.whiteout(Math.min(1, Math.max(0, (-160 - cam.position.y) / 30)));

    const r = this.renderer;
    if (this.composer) this.composer.render();
    else { r.clear(); r.render(this.scene, cam); }
    if (this.running && !p.dead && !(p.snipeT > 0)) { r.clearDepth(); r.render(this.gunScene, this.gunCam); }
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
      const hk = h.kind === 'grab' ? 'grabber' : h.kind === 'light' ? 'lightrope' : 'normal';
      for (const k in this.hookMeshes) this.hookMeshes[k].visible = k === hk;
      const hm = (this.hookMesh = this.hookMeshes[hk]);
      hm.position.copy(h.pos);
      hm.lookAt(_v);
      const st = ROPE_STYLE[h.kind || 'normal'] || ROPE_STYLE.normal;
      this.rope.setStyle(st[0], st[1]);
      // ropes hang: a little while paying out, a lot when the Lightrope is slack
      const d = _v.distanceTo(h.pos);
      let sag = h.state === HOOK.FLYING ? d * 0.025 : h.state === HOOK.RETRACT ? d * 0.06 : 0;
      if (h.kind === 'light' && (h.state === HOOK.ATTACHED || h.state === HOOK.LATCHED)) {
        sag = ropeSag(h.L + 0.9, d);
        // a slack rope lies on the ground instead of sinking into it
        _w.addVectors(_v, h.pos).multiplyScalar(0.5);
        const gy = sag > 0.1 ? this.world.groundAt(_w.x, _w.y + 0.5, _w.z) : null;
        if (gy !== null) sag = Math.min(sag, Math.max(0, _w.y - gy - 0.06));
      }
      this.rope.set(_v, h.pos, sag);
    } else {
      this.gun.head.visible = !p.held;
      for (const k in this.hookMeshes) this.hookMeshes[k].visible = false;
      this.rope.hide();
    }
    this.grab.updateHeld(p);
  }

  updateHud(dt) {
    const p = this.player, ui = this.ui;
    ui.setHook(p.hook.state, this.hookKind(), !!p.held);
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
      ui.shopPrompt(!!this.nearShop && !this.shopOpen && !p.dead, this.nearShop && (this.nearShop.type || (this.nearShop.passive ? 'passive' : 'normal')));
      const ff = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
      const nn = this.world.nearestShop(p.pos, 'normal');
      if (nn && nn.dist > 7) ui.shopArrow(ff - Math.atan2(nn.shop.x - p.pos.x, nn.shop.z - p.pos.z), nn.dist);
      else ui.shopArrow(null);
      const np = this.world.nearestShop(p.pos, 'passive');
      if (np && np.dist > 7) ui.passArrow(ff - Math.atan2(np.shop.x - p.pos.x, np.shop.z - p.pos.z), np.dist);
      else ui.passArrow(null);
      const nh = this.world.nearestShop(p.pos, 'hook');
      if (nh && nh.dist > 7) ui.hookArrow(ff - Math.atan2(nh.shop.x - p.pos.x, nh.shop.z - p.pos.z), nh.dist);
      else ui.hookArrow(null);
    }
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      ui.hud(p, this);
      let boss = null, bd = 220;
      for (const e of this.enemies) if (e.T.boss && !e.dead) { const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; boss = e; } }
      for (const r of this.remotes.values()) if (r.T && r.T.boss && !r.dead) { const d = r.pos.distanceTo(p.pos); if (d < bd) { bd = d; boss = r; } }
      ui.boss(boss ? boss.name : null, boss ? boss.hp / boss.maxHp : 0);
      let anyBoss = null, ad = Infinity;
      for (const e of this.enemies) if (e.T.boss && !e.dead) { const d = e.pos.distanceTo(p.pos); if (d < ad) { ad = d; anyBoss = e; } }
      for (const r of this.remotes.values()) if (r.T && r.T.boss && !r.dead) { const d = r.pos.distanceTo(p.pos); if (d < ad) { ad = d; anyBoss = r; } }
      if (!this.bossBeam) {
        this.bossBeam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 600, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3b2b, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
        this.scene.add(this.bossBeam);
      }
      this.bossBeam.visible = !!anyBoss;
      if (anyBoss) {
        this.bossBeam.position.set(anyBoss.pos.x, anyBoss.pos.y + 310, anyBoss.pos.z);
        const dx = anyBoss.pos.x - p.pos.x, dz = anyBoss.pos.z - p.pos.z;
        const ff = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
        ui.bossArrow(ff - Math.atan2(dx, dz), ad);
      } else ui.bossArrow(null);
      ui.parry(p.parryT > 0);
      ui.fx('frostFx', p.slowT > 0); ui.fx('cloakFx', p.cloakT > 0); ui.fx('warpFx', this.warpT > 0); ui.fx('rageFx', p.rageT > 0 || p.vampT > 0); ui.fx('scopeFx', p.snipeT > 0); ui.fx('runFx', p.runT > 0); ui.fx('stunFx', p.stunT > 0);
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
window.__holesN = () => HOLES.n.value;
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
    const HOLES_N = () => window.__holesN ? window.__holesN() : -1;
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
    // round 3: new enemies, boss finder, parry
    {
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      game.spawnTimer = 999;
      const c5 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      const st5 = c5.pointAt(1, 0.15); st5.y += 0.5;
      const reset = () => { p.dead = false; p.hp = 9999; p.pos.copy(st5); p.vel.set(0, 0, 0); p.cd = {}; p.parryT = 0; p.shieldT = 0; sim(0.3); };
      const z = {};
      const hitsOnMe = {};
      const oa = p.applyHit.bind(p);
      p.applyHit = (h) => { hitsOnMe[h.aname + ':' + h.mode] = (hitsOnMe[h.aname + ':' + h.mode] || 0) + 1; return oa(h); };
      // each new type fights the player for 12 s
      for (const t of ['bomber', 'magnetron', 'phantom']) {
        reset();
        const q = c5.pointAt(1 + Math.PI, 0.55); q.y += 1.5;
        const e = new Enemy(game, q, t); e.cool = 0.5; e.specialCool = 0.5; game.enemies.push(e);
        for (let i = 0; i < 12; i++) { sim(1); if (p.dead) p.respawn(); p.hp = 9999; if (i % 3 === 0) { p.pos.copy(st5); p.vel.set(0, 0, 0); } }
        e.dead = true; e.dispose(); game.enemies = [];
      }
      z.hitsOnMe = hitsOnMe;
      // parry: an enemy pulls me while parrying -> it flies at me and takes 50
      reset();
      game.save.abil.parry = true; game.ui.renderAbilities();
      const en = new Enemy(game, p.pos.clone().add(new THREE.Vector3(0, 0.5, -30)), 'grappler'); en.think = 999; game.enemies.push(en); sim(0.3);
      p.hp = 100;
      p.useAbility('parry');
      const hpBefore = en.hp, dBefore = en.pos.distanceTo(p.pos);
      p.applyHit({ mode: 'pull', dmg: 10, a: en.pos.toArray(), attacker: en.id, aname: en.name });
      sim(0.05);
      z.parry = { myHp: p.hp, enemyDmg: hpBefore - en.hp, enemySpeed: Math.round(en.vel.length()) };
      sim(0.5); z.parry.enemyDistAfter = Math.round(en.pos.distanceTo(p.pos)); z.parry.distBefore = Math.round(dBefore);
      // no damage dealt during parry
      en.hp = 60; game.deliverHit(en.id, { mode: 'latch', dmg: 20, attacker: p.id, aname: 'me' });
      z.parry.myDmgWhileParrying = 60 - en.hp;
      sim(2); en.hp = 60; game.deliverHit(en.id, { mode: 'latch', dmg: 20, attacker: p.id, aname: 'me' });
      z.parry.myDmgAfterParry = 60 - en.hp;
      z.parry.cooldown = Math.round(p.cd.parry);
      z.parryButton = !!document.querySelector('#abilities .ab.parry');
      en.dead = true; en.dispose(); game.enemies = [];
      // boss arrow + beam
      const far = p.pos.clone().add(new THREE.Vector3(400, 0, 0));
      const boss = new Enemy(game, far, 'titan'); boss.think = 999; game.enemies.push(boss);
      game.hudT = 0; sim(0.2);
      z.bossArrow = !document.getElementById('bossArrowWrap').classList.contains('hidden') && document.getElementById('bossDist').textContent;
      z.bossBeam = !!(game.bossBeam && game.bossBeam.visible);
      boss.dead = true; boss.dispose(); game.enemies = [];
      p.applyHit = oa; p.hp = 100;
      log.round3 = z;
    }
    // round 4: bosses, loot, rare abilities, grass
    {
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      game.spawnTimer = 999;
      const c6 = game.world.spawnCandidates(p.pos, 100, 900).sort((a, b) => b.R - a.R)[0];
      const st6 = c6.pointAt(0.5, 0.1); st6.y += 0.5;
      const reset = () => { p.dead = false; p.hp = 9999; p.pos.copy(st6); p.vel.set(0, 0, 0); p.cd = {}; sim(0.3); };
      const r4 = { bosses: {} };
      const hitsOnMe = {};
      const oa = p.applyHit.bind(p);
      p.applyHit = (h) => { hitsOnMe[h.aname + ':' + h.mode] = (hitsOnMe[h.aname + ':' + h.mode] || 0) + 1; return oa(h); };
      for (const bk of ['thunder', 'voidmaw', 'hive']) {
        reset();
        const q = c6.pointAt(0.5 + Math.PI, 0.4); q.y += 2;
        const b = new Enemy(game, q, bk); b.specialCool = 0.5; game.enemies.push(b);
        for (let i = 0; i < 14; i++) { sim(1); if (p.dead) p.respawn(); p.hp = 9999; if (i % 3 === 0) { p.pos.copy(st6); p.vel.set(0, 0, 0); } }
        r4.bosses[bk] = { minions: game.enemies.length - 1, strikesSeen: game.strikes.length };
        // kill it as the player -> loot drop
        b.lastAttacker = { id: p.id, name: 'me', t: performance.now() }; b.hp = 1;
        const coins0 = game.save.coins;
        b.applyHit({ mode: 'latch', dmg: 5, attacker: p.id, aname: 'me' });
        r4.bosses[bk].reward = game.save.coins - coins0;
        r4.bosses[bk].lootSpawned = game.loot.length;
        game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
        // walk into loot
        if (game.loot.length) { p.pos.copy(game.loot[0].pos); p.pos.y -= 1.2; sim(0.2); }
        r4.bosses[bk].unlocked = !!game.save.abil[b.T.drop];
      }
      r4.hitsOnMe = hitsOnMe;
      r4.rareButtons = document.querySelectorAll('#rareAbilities .ab').length;
      // rare abilities in action
      game.save.abil.titanslam = true;
      const clearOff = (dist) => {
        for (let a = 0; a < 6.28; a += 0.4) {
          const off = new THREE.Vector3(Math.sin(a) * dist, 0, Math.cos(a) * dist);
          const tp = p.pos.clone().add(off);
          const gy = game.world.groundAt(tp.x, p.pos.y + 4, tp.z);
          if (gy === null || Math.abs(gy - p.pos.y) > 3) continue;
          const e0 = p.eye(); const tc = new THREE.Vector3(tp.x, gy + 1.2, tp.z); const dd = tc.clone().sub(e0); const L = dd.length();
          if (!game.world.raycast(e0, dd.normalize(), L)) return new THREE.Vector3(off.x, gy - p.pos.y + 0.3, off.z);
        }
        return new THREE.Vector3(0, 0.3, -dist);
      };
      const mk = (off) => { const e = new Enemy(game, p.pos.clone().add(off), 'brute'); e.think = 999; game.enemies.push(e); return e; };
      reset(); let e1 = mk(new THREE.Vector3(6, 0.3, 0)); sim(0.3); p.useAbility('titanslam'); sim(0.1);
      r4.titanslam = { dmg: 160 - e1.hp, speed: Math.round(e1.vel.length()) };
      reset(); e1.dead = true; e1.dispose(); game.enemies = [];
      e1 = mk(clearOff(25)); sim(0.3); const tgt = e1.pos.clone(); tgt.y += 1.2; aim(tgt); const blasts = []; const ob = game.blast.bind(game); game.blast = (at, ow, R, D, hp, he, k) => { blasts.push([at.toArray().map(Math.round), ow.id, R, D, hp, he, game.enemies.map((e) => [e.id, e.pos.toArray().map(Math.round), e.dead, e.hp])]); const dh = game.deliverHit; return ob(at, ow, R, D, hp, he, k); }; r4.blasts = blasts; const tu = p.useAbility('thunder'); const sk = game.strikes.map((x) => [x.pos.toArray().map(Math.round), x.t, x.R]); r4.thunderDbg = { tu, sk, e1: e1.pos.toArray().map(Math.round), cd: p.cd.thunder, safe: p.safe, dead: p.dead }; sim(0.2); r4.thunderDbg.after = game.strikes.map((x) => [x.t.toFixed(2), !!x.bolt]); sim(0.6);
      r4.thunder = { dmg: 160 - e1.hp };
      e1.dead = true; e1.dispose(); game.enemies = [];
      reset(); const o30 = clearOff(30); e1 = mk(o30); const e2 = mk(o30.clone().add(new THREE.Vector3(o30.z * 0.35, 0, -o30.x * 0.35))); sim(0.3);
      const before = e2.pos.distanceTo(e1.pos);
      const ap = e1.pos.clone(); ap.y += 1.2; aim(ap); p.useAbility('blackhole'); sim(1.5);
      r4.blackhole = { pulledCloser: Math.round(before) + '->' + Math.round(e2.pos.distanceTo(e1.pos)), wells: game.wells.length };
      sim(2.5); r4.blackhole.burstDmg = (160 - e1.hp) + '/' + (160 - e2.hp);
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      reset(); const ms = [mk(new THREE.Vector3(20, 0.3, 0)), mk(new THREE.Vector3(-20, 0.3, 0)), mk(new THREE.Vector3(0, 0.3, 25))];
      sim(0.3); r4.missilesFired = game.fireMissiles(p); sim(3);
      r4.missileDmg = ms.map((e) => 160 - e.hp);
      game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
      r4.grassChunks = game.grass.built.size;
      r4.grassBlades = [...game.grass.built.values()].reduce((a, m) => a + m.count, 0);
      p.applyHit = oa; p.hp = 100;
      log.round4 = r4;
      // ---- round 5: anti-stuck, new enemy types, inferno boss, new abilities
      const r5 = {};
      const clearAll = () => { game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = []; };
      clearAll(); reset();
      // (a) a bot that is wedged (can't walk) and never gets to attack must still reach you
      {
        const o = clearOff(30); const e = new Enemy(game, p.pos.clone().add(o), 'brute'); game.enemies.push(e);
        e.move = function () { this.moving = false; };
        const d0 = e.pos.distanceTo(p.pos);
        for (let i = 0; i < 10; i++) { e.cool = 99; sim(1); p.hp = 9999; p.pos.copy(st6); p.vel.set(0, 0, 0); }
        r5.wedged = { d0: Math.round(d0), d1: Math.round(e.pos.distanceTo(p.pos)), unsticks: e.stuckCount || 0 };
        clearAll();
      }
      // (b) new enemy types in a fight
      {
        reset();
        const hitsOnMe = {}; let slowSeen = 0, landSlams = 0, heals = 0;
        const oa = p.applyHit.bind(p);
        p.applyHit = (h) => { hitsOnMe[h.aname + ':' + h.mode] = (hitsOnMe[h.aname + ':' + h.mode] || 0) + 1; return oa(h); };
        const ols = game.landSlam.bind(game); game.landSlam = (e) => { landSlams++; return ols(e); };
        const oh = game.enemyHeal.bind(game); game.enemyHeal = (e) => { const r = oh(e); if (r) heals++; return r; };
        const made = ['frost', 'leaper', 'splitter', 'medic', 'kamikaze'].map((t, i) => { const q = c6.pointAt(i * 1.2, 0.45); q.y += 2; const e = new Enemy(game, q, t); game.enemies.push(e); return e; });
        for (let i = 0; i < 16; i++) {
          sim(1); if (p.dead) p.respawn(); p.hp = 9999; if (p.slowT > 0) slowSeen++;
          if (i % 3 === 0) { p.pos.copy(st6); p.vel.set(0, 0, 0); }
          for (const e of game.enemies) if (e.type !== 'medic' && !e.dead && e.hp === e.maxHp) e.hp = e.maxHp - 30;
        }
        const sp = made.find((e) => e.type === 'splitter');
        if (sp && !sp.dead) { sp.lastAttacker = { id: p.id, name: 'me', t: performance.now() }; sp.hp = 1; sp.applyHit({ mode: 'latch', dmg: 5, attacker: p.id, aname: 'me' }); sim(0.1); }
        const minis = game.enemies.filter((e) => e.type === 'mini' && !e.dead).length;
        r5.types = { hitsOnMe, slowSeen, landSlams, heals, minis, splitterDead: sp.dead, kamikazeGone: made[4].dead, stuckFixes: made.map((e) => e.type + ':' + (e.stuckCount || 0)) };
        p.applyHit = oa; game.landSlam = ols; game.enemyHeal = oh;
        clearAll();
      }
      // (c) INFERNO LORD
      {
        reset();
        const q = c6.pointAt(0.5 + Math.PI, 0.4); q.y += 2;
        const b = new Enemy(game, q, 'inferno'); b.specialCool = 0.5; game.enemies.push(b);
        let fireStrikes = 0; const oas = game.addStrike.bind(game);
        game.addStrike = (...a) => { if (a[6]) fireStrikes++; return oas(...a); };
        let minD = 1e9;
        for (let i = 0; i < 14; i++) { sim(1); minD = Math.min(minD, b.pos.distanceTo(p.pos)); if (p.dead) p.respawn(); p.hp = 9999; if (i % 3 === 0) { p.pos.copy(st6); p.vel.set(0, 0, 0); } }
        game.addStrike = oas;
        b.lastAttacker = { id: p.id, name: 'me', t: performance.now() }; b.hp = 1;
        const c0 = game.save.coins;
        b.applyHit({ mode: 'latch', dmg: 5, attacker: p.id, aname: 'me' });
        const reward = game.save.coins - c0;
        clearAll();
        if (game.loot.length) { p.pos.copy(game.loot[0].pos); p.pos.y -= 1.2; sim(0.2); }
        r5.inferno = { fireStrikes, closest: Math.round(minD), reward, unlocked: !!game.save.abil.meteor };
      }
      // (d) new abilities
      {
        for (const k of ['fireball', 'frost', 'cloak', 'chain', 'tornado', 'mine', 'timewarp', 'jetpack', 'vampire', 'rage']) game.save.abil[k] = true;
        game.ui.renderAbilities();
        const A = {};
        const mk2 = (off) => { const e = new Enemy(game, p.pos.clone().add(off), 'brute'); e.think = 999; e.wdT = 999; game.enemies.push(e); return e; };
        reset(); let e = mk2(clearOff(20)); sim(0.3); let t = e.pos.clone(); t.y += 1.2; aim(t); p.useAbility('fireball'); sim(1); A.fireball = 160 - e.hp; clearAll();
        reset(); e = mk2(clearOff(8)); sim(0.3); p.useAbility('frost'); sim(0.1); A.frost = { dmg: 160 - e.hp, frozen: +e.frozenT.toFixed(1) }; clearAll();
        reset(); e = new Enemy(game, p.pos.clone().add(clearOff(15)), 'grappler'); game.enemies.push(e); p.useAbility('cloak'); sim(0.1); A.cloak = { seen: !!game.findTarget(e, 150) }; sim(5.2); A.cloak.seenAfter = !!game.findTarget(e, 150); clearAll();
        reset(); const b12 = clearOff(12); const es = [mk2(b12), mk2(b12.clone().add(new THREE.Vector3(3, 0, 3))), mk2(b12.clone().add(new THREE.Vector3(-3, 0, 3)))]; sim(0.3); p.useAbility('chain'); sim(0.1); A.chain = es.map((x) => 160 - x.hp); A.zaps = game.zaps.length; clearAll();
        reset(); e = mk2(clearOff(6)); sim(0.3); p.useAbility('tornado'); sim(0.05); A.tornadoVy = Math.round(e.vel.y); clearAll();
        reset(); p.useAbility('mine'); sim(1); const mines = game.mines.length; e = mk2(new THREE.Vector3(1.5, 0.3, 0)); sim(0.2); A.mine = { placed: mines, dmg: 160 - e.hp, left: game.mines.length }; clearAll();
        reset(); p.useAbility('timewarp'); A.timewarp = +game.warpT.toFixed(1); sim(5.2); A.timewarpAfter = +Math.max(0, game.warpT).toFixed(1);
        reset(); const j0 = p.pos.clone(); p.pitch = 0.3; p.useAbility('jetpack'); sim(2.5); A.jetpack = { moved: Math.round(p.pos.distanceTo(j0)), rose: Math.round(p.pos.y - j0.y) };
        reset(); e = mk2(clearOff(10)); p.hp = 50; p.lastHurt = game.time; p.useAbility('vampire'); game.deliverHit(e.id, { mode: 'latch', dmg: 20, attacker: p.id, aname: 'me' }); A.vampire = Math.round(p.hp - 50); clearAll();
        reset(); e = mk2(clearOff(10)); p.useAbility('rage'); game.deliverHit(e.id, { mode: 'latch', dmg: 20, attacker: p.id, aname: 'me' }); A.rage = 160 - e.hp; clearAll();
        reset(); game.save.abil.meteor = true; game.ui.renderAbilities(); e = mk2(clearOff(25)); sim(0.3); t = e.pos.clone(); t.y += 1.2; aim(t); p.useAbility('meteor'); sim(2.5); A.meteor = 160 - e.hp; clearAll();
        A.barButtons = document.querySelectorAll('#abilities .ab').length;
        A.rareButtons = document.querySelectorAll('#rareAbilities .ab').length;
        reset(); p.cd = {}; p.rageT = 0; dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK' })); A.keyK = p.rageT > 0;
        r5.abilities = A;
      }
      p.hp = 100;
      log.round5 = r5;
      {
        // SNIPE: lock on through a wall, 3x range, damage x2.5
        const sn = {};
        game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
        reset(); p.yaw += 2; game.save.abil.snipe = true; game.ui.renderAbilities();
        const e = new Enemy(game, p.pos.clone().add(clearOff(40)), 'brute'); e.think = 999; e.wdT = 999; game.enemies.push(e); sim(0.2);
        const yaw0 = p.yaw;
        sn.used = p.useAbility('snipe'); sim(0.5);
        sn.turned = Math.abs(yaw0 - p.yaw) > 0.5; sn.fov = Math.round(game.camera.fov);
        p.shoot(); sim(0.4);
        sn.dmg = 160 - e.hp; sn.hookState = p.hook.state;
        // a snipe into a wall must do nothing (no anchor, no pull)
        p.cancel(); sim(0.5); p.cd = {}; p.useAbility('snipe'); sim(0.2);
        const orc = game.world.raycast.bind(game.world);
        game.world.raycast = (o, d, len) => ({ point: o.clone().addScaledVector(d, Math.min(len, 1)), dist: Math.min(len, 1) });
        p.shoot(); sim(0.1);
        game.world.raycast = orc;
        sn.wallState = p.hook.state; sn.wallDmg = 160 - e.hp - sn.dmg; sn.armedAfterWall = p.snipeT > 0;
        sim(1); sn.fovAfter = Math.round(game.camera.fov);
        sn.button = !!document.querySelector('#abilities .ab.snipe');
        p.cancel(); sim(0.5);
        e.dead = true; e.dispose(); game.enemies = [];
        log.snipe = sn;
      }
      {
        const su = {};
        const clr = () => { game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = []; };
        const mk3 = (off) => { const e = new Enemy(game, p.pos.clone().add(off), 'brute'); e.think = 999; e.wdT = 999; game.enemies.push(e); return e; };
        for (const k of ['barrage', 'laser', 'nuke']) game.save.abil[k] = true;
        game.ui.renderAbilities();
        // explosive snipe splash: a second enemy next to the target takes damage too
        clr(); reset(); game.save.abil.snipe = true;
        const o40 = clearOff(35); const a1 = mk3(o40), a2 = mk3(o40.clone().add(new THREE.Vector3(2.5, 0, 0))); sim(0.2);
        p.useAbility('snipe'); sim(0.3); const lockedA1 = Math.abs(a1.hp - 160) === 0; const t1 = a1.pos.clone(); t1.y += 1.2; aim(t1); p.shoot(); sim(0.6);
        su.snipeExplosive = { target: 160 - a1.hp, splash: 160 - a2.hp, cd: ABILITY.snipe.cd };
        clr();
        reset(); const bs = [mk3(clearOff(30)), mk3(clearOff(45)), mk3(clearOff(60))]; sim(0.2);
        su.barrageFired = p.useAbility('barrage') && game.missiles.length; sim(4); su.barrageDmg = bs.map((e) => e.dead ? 'dead' : 160 - e.hp); clr();
        reset(); const le = mk3(clearOff(40)); sim(0.2); const lt = le.pos.clone(); lt.y += 1.2; aim(lt); p.useAbility('laser');
        for (let i = 0; i < 60; i++) { if (!le.dead) { const q = le.pos.clone(); q.y += 1.2; aim(q); } sim(0.04); }
        su.laser = { ticks: Math.round(3.5 / 0.1), dmg: le.dead ? 'dead' : 160 - le.hp, beam: !!(game.laserMesh && game.laserMesh.visible) }; sim(2); su.laser.beamAfter = game.laserMesh.visible; clr();
        reset(); const ne = [mk3(clearOff(40)), mk3(clearOff(40).add(new THREE.Vector3(8, 0, 0)))]; sim(0.2); const nt = ne[0].pos.clone(); nt.y += 1; aim(nt);
        const hp0 = p.hp; p.useAbility('nuke'); sim(4.5); su.nuke = { dmg: ne.map((e) => e.dead ? 'dead' : 160 - e.hp), meHurt: hp0 - p.hp }; clr();
        su.keyMinus = (() => { reset(); p.cd = {}; mk3(clearOff(30)); sim(0.1); dispatchEvent(new KeyboardEvent('keydown', { code: 'Minus' })); return (p.cd.barrage || 0) > 0; })(); clr();
        su.superButtons = document.querySelectorAll('#abilities .ab.super').length;
        log.superAbilities = su;
      }
      {
        // passives
        const pa = {};
        const clr = () => { game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = []; };
        game.save.passive = {};
        reset();
        // runner: land at speed -> super speed for 2 s
        game.save.passive.runner = true;
        p.pos.y += 4; p.vel.set(20, 0, 0); p.onGround = false; sim(0.6);
        pa.runner = { runT: +p.runT.toFixed(1), speed: Math.round(Math.hypot(p.vel.x, p.vel.z)) }; sim(2.2); pa.runner.after = Math.round(Math.hypot(p.vel.x, p.vel.z));
        // double jump
        reset(); game.save.passive.doublejump = true; game.input.jumpT = 0.15; sim(0.05); const vy1 = p.vel.y; sim(0.3); game.input.jumpT = 0.15; sim(0.02); pa.doubleJump = { first: Math.round(vy1), second: Math.round(p.vel.y), used: p.dj };
        // iron skin + thorns
        reset(); game.save.passive.ironskin = true; game.save.passive.thorns = true;
        const at = new Enemy(game, p.pos.clone().add(clearOff(10)), 'brute'); at.think = 999; at.wdT = 999; game.enemies.push(at);
        p.hp = 100; p.applyHit({ mode: 'burn', dmg: 40, attacker: at.id, aname: 'Brute' }); pa.ironskin = 100 - p.hp; pa.thorns = 160 - at.hp; clr();
        // gold rush
        const c0 = game.save.coins; game.save.passive.goldrush = true; game.addCoins(100); pa.goldrush = game.save.coins - c0;
        // quick charge
        reset(); game.save.passive.quickcharge = true; game.save.abil.dash = true; p.useAbility('dash'); pa.quickcharge = +p.cd.dash.toFixed(2);
        // lifesteal + explosive hook
        reset(); game.save.passive.lifesteal = true; game.save.passive.explosive = true;
        const o12 = clearOff(15); const le = new Enemy(game, p.pos.clone().add(o12), 'brute'); le.think = 999; le.wdT = 999; game.enemies.push(le);
        const le2 = new Enemy(game, p.pos.clone().add(o12).add(new THREE.Vector3(2, 0, 0)), 'brute'); le2.think = 999; le2.wdT = 999; game.enemies.push(le2); sim(0.2);
        p.hp = 50; p.lastHurt = game.time; const lt = le.pos.clone(); lt.y += 1.2; aim(lt); p.shoot(); sim(0.4);
        pa.lifesteal = Math.round((p.hp - 50) * 10) / 10; pa.explosiveSplash = 160 - le2.hp; clr();
        // guardian angel
        reset(); game.save.passive.angel = true; sim(0.5); const lg = p.lastGround && p.lastGround.clone();
        p.pos.y -= 80; p.vel.set(0, -30, 0); p.onGround = false; sim(0.05);
        pa.angel = { saved: lg ? p.pos.distanceTo(lg) < 3 : 'no ground', cd: Math.round(p.angelCd) };
        // regen
        reset(); game.save.passive.regen = true; p.hp = 40; p.lastHurt = game.time; sim(3); pa.regen3s = Math.round(p.hp);
        // passive shop UI
        game.shopMode = 'passive'; game.ui.renderShop(); pa.shopRows = document.querySelectorAll('#shopList .upg.passive').length; pa.shopTitle = document.getElementById('shopTitle').textContent;
        game.shopMode = 'normal'; game.ui.renderShop();
        pa.passiveShopsLoaded = (() => { let n = 0, t = 0; for (const b of game.world.built.values()) for (const I of game.world.getData(b.cx, b.cz).islands) if (I.shop) { t++; if (I.shop.passive) n++; } return n + '/' + t; })();
        game.save.passive = {}; p.hp = 100;
        log.passives = pa;
      }
      {
        const r7 = {};
        const clr = () => { game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = []; };
        const mk4 = (off, t = 'brute') => { const e = new Enemy(game, p.pos.clone().add(off), t); e.think = 999; e.wdT = 999; game.enemies.push(e); return e; };
        // ---- death drops all coins, picking the bag up gives them back
        reset(); game.save.coins = 777; const deathAt = p.pos.clone(); p.die('test');
        r7.death = { coinsAfterDeath: game.save.coins, bags: game.bags.length, bagN: game.bags[0] && game.bags[0].n, bagNearDeath: game.bags[0] ? Math.round(game.bags[0].pos.distanceTo(deathAt)) : -1, msg: (document.getElementById('deathCoins') || {}).textContent };
        p.respawn(); reset(); if (game.bags[0]) { p.pos.copy(game.bags[0].pos); sim(0.2); } r7.death.coinsBack = game.save.coins; r7.death.bagsLeft = game.bags.length;
        // fall death: bag goes to where you fell from
        reset(); sim(0.5); game.save.coins = 300; const lg = p.lastGround.clone(); p.pos.y = -400; p.vel.set(0, -60, 0); sim(0.1);
        r7.fallBag = { dead: p.dead, nearLedge: game.bags.length ? Math.round(game.bags[0].pos.distanceTo(lg)) : -1 };
        p.respawn(); reset(); if (game.bags.length) { p.pos.copy(game.bags[0].pos); sim(0.2); }
        // ---- bosses
        for (const bk of ['frostqueen', 'reaper']) {
          reset(); const hitsOnMe = {};
          const oa = p.applyHit.bind(p); p.applyHit = (h) => { hitsOnMe[h.mode + (h.freeze ? '+freeze' : '')] = (hitsOnMe[h.mode + (h.freeze ? '+freeze' : '')] || 0) + 1; return oa(h); };
          const q = c6.pointAt(0.5 + Math.PI, 0.4); q.y += 2;
          const b = new Enemy(game, q, bk); b.specialCool = 0.5; game.enemies.push(b);
          let closest = 1e9;
          for (let i = 0; i < 16; i++) { sim(1); closest = Math.min(closest, b.pos.distanceTo(p.pos)); if (p.dead) p.respawn(); p.hp = 9999; if (i % 3 === 0) { p.pos.copy(st6); p.vel.set(0, 0, 0); } }
          p.applyHit = oa;
          const minions = game.enemies.filter((e) => e !== b && !e.dead).map((e) => e.type);
          b.lastAttacker = { id: p.id, name: 'me', t: performance.now() }; b.hp = 1; const c0 = game.save.coins;
          b.applyHit({ mode: 'latch', dmg: 5, attacker: p.id, aname: 'me' });
          const reward = game.save.coins - c0; clr();
          if (game.loot.length) { p.pos.copy(game.loot[0].pos); p.pos.y -= 1.2; sim(0.2); }
          r7[bk] = { hitsOnMe, closest: Math.round(closest), minions, reward, unlocked: !!game.save.abil[b.T.drop] };
        }
        // ---- new abilities
        const A = {};
        for (const k of ['spear', 'decoy', 'anchor', 'overcharge', 'blink']) game.save.abil[k] = true;
        reset(); let e = mk4(clearOff(30)); sim(0.2); let t = e.pos.clone(); t.y += 1.2; aim(t); p.useAbility('spear'); sim(0.6); A.spear = 160 - e.hp; clr();
        reset(); e = new Enemy(game, p.pos.clone().add(clearOff(25)), 'grappler'); game.enemies.push(e); p.useAbility('decoy'); sim(0.1); const ft = game.findTarget(e, 150); A.decoy = { targetIsDecoy: !!ft && ft.id.startsWith('decoy') }; sim(7.2); A.decoy.gone = game.decoys.length === 0; clr();
        reset(); const ea = mk4(clearOff(6)); sim(0.2); p.useAbility('anchor'); sim(2); A.anchor = { dmg: 160 - ea.hp, slamming: p.slamming }; clr();
        reset(); p.cd = { spear: 5, blink: 4, dash: 3 }; p.useAbility('overcharge'); A.overcharge = { spear: p.cd.spear, blink: p.cd.blink, own: Math.round(p.cd.overcharge) };
        reset(); p.pitch = 0; const b0 = p.pos.clone(); for (let a = 0; a < 6.3; a += 0.5) { p.yaw = a; const o = p.eye(); const f = p.forward(); if (!game.world.raycast(o, f, 22)) break; } const okB = p.useAbility('blink'); A.blink = { ok: okB, moved: Math.round(p.pos.distanceTo(b0)) };
        game.save.abil.blizzard = true; game.save.abil.shadowstep = true;
        reset(); const bz = [mk4(clearOff(10)), mk4(clearOff(18))]; sim(0.2); p.useAbility('blizzard'); sim(4.2); A.blizzard = bz.map((x) => ({ dmg: 160 - x.hp }));  clr();
        reset(); e = mk4(clearOff(30)); sim(0.2); t = e.pos.clone(); t.y += 1.2; aim(t); p.useAbility('shadowstep'); A.shadowstep = { dmg: 160 - e.hp, distAfter: Math.round(p.pos.distanceTo(e.pos)) }; clr();
        r7.abilities = A;
        // ---- new passives
        const P = {};
        game.save.passive = {};
        const s0 = { ...game.stats };
        for (const k of ['longarm', 'turbopull', 'wallrunner']) game.save.passive[k] = true;
        game.stats = computeStats(game.save.up, game.save.passive);
        P.stats = { range: Math.round(game.stats.range / s0.range * 100) + '%', pull: Math.round(game.stats.pull / s0.pull * 100) + '%', climb: game.stats.climbReach - s0.climbReach };
        reset(); game.save.passive.laststand = true; p.hp = 20; p.applyHit({ mode: 'burn', dmg: 999, attacker: 'x', aname: 'X' }); P.laststand = { hp: p.hp, dead: p.dead, shield: p.shieldT > 0 }; p.applyHit({ mode: 'burn', dmg: 999, attacker: 'x', aname: 'X' }); p.shieldT = 0; p.applyHit({ mode: 'burn', dmg: 999, attacker: 'x', aname: 'X' }); P.laststand.secondHitKills = p.dead; p.respawn();
        reset(); game.save.passive.burning = true; e = mk4(clearOff(15)); sim(0.2); t = e.pos.clone(); t.y += 1.2; aim(t); p.shoot(); sim(0.3); const hb = 160 - e.hp; sim(4.5); P.burning = { hookDmg: hb, burnDmg: 160 - e.hp - hb }; p.cancel(); clr();
        reset(); game.save.passive.bloodlust = true; game.save.passive.bounty = true; p.hp = 40; const cb = game.save.coins; game.handleKill({ killer: p.id, kname: 'me', vname: 'Dummy', vkind: 'enemy', reward: 30 }); P.bloodlust = Math.round(p.hp - 40); P.bounty = game.save.coins - cb;
        reset(); game.save.passive.adrenaline = true; p.hp = 20; e = mk4(clearOff(10)); game.deliverHit(e.id, { mode: 'latch', dmg: 20, attacker: p.id, aname: 'me' }); P.adrenalineDmg = 160 - e.hp; clr();
        reset(); game.save.passive.aircontrol = true; game.save.passive.coinmagnet = true; P.shopRows = (() => { game.shopMode = 'passive'; game.ui.renderShop(); const n = document.querySelectorAll('#shopList .upg.passive').length; game.shopMode = 'normal'; return n; })();
        game.save.passive = {}; game.stats = computeStats(game.save.up, {}); p.hp = 100;
        r7.passives = P;
        log.round7 = r7;
        // ================= round 8: buildings, gems, hook shop, Ground Grabber, Lightrope
        try {
          const r8 = {};
          const W = game.world;
          // ---- structures across a wide area
          const kinds = {}; let shops = { normal: 0, passive: 0, hook: 0 }, hookShop = null;
          for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) for (const I of W.getData(cx, cz).islands) {
            for (const d of I.deco) kinds[d.type] = (kinds[d.type] || 0) + 1;
            if (I.boxes.some((b) => b.crate)) kinds.crates = (kinds.crates || 0) + 1;
            if (I.boxes.some((b) => b.color === 0xb9a77f)) kinds.temple = (kinds.temple || 0) + 1;
            if (I.boxes.some((b) => b.color === 0x8e2f24)) kinds.barn = (kinds.barn || 0) + 1;
            if (I.shop) { shops[I.shop.type]++; if (I.shop.hook && !hookShop) hookShop = I.shop; }
          }
          r8.structures = kinds; r8.shops = shops;
          // ---- gems from a boss
          reset(); game.save.gems = 0;
          const bq = c6.pointAt(0.5, 0.25); bq.y += 1;
          const boss = new Enemy(game, bq, 'titan'); boss.think = 999; boss.wdT = 999; game.enemies.push(boss); sim(0.5);
          boss.lastAttacker = { id: p.id, name: 'me', t: performance.now() }; boss.hp = 1;
          boss.applyHit({ mode: 'latch', dmg: 5, attacker: p.id, aname: 'me' }); sim(0.1);
          const gb = game.bags.find((b) => b.kind === 'gem');
          r8.bossGems = { bag: gb ? gb.n : 0 };
          if (gb) { p.pos.copy(gb.pos); sim(0.3); }
          r8.bossGems.picked = game.save.gems;
          game.loot.forEach((L) => { game.scene.remove(L.gem, L.beam); }); game.loot = [];
          game.enemies.forEach((e) => { e.dead = true; e.dispose(); }); game.enemies = [];
          // ---- hook shop UI + buying
          game.save.coins = 10000; game.save.gems = 15; game.save.hooks = {};
          game.shopMode = 'hook'; game.ui.renderShop();
          r8.hookShopRows = document.querySelectorAll('#shopList .hookrow').length;
          game.buyHook('grabber'); const afterG = { gems: game.save.gems, coins: game.save.coins, sel: game.hookKind() };
          game.buyHook('lightrope'); r8.buy = { afterGrabber: afterG, afterLight: { gems: game.save.gems, coins: game.save.coins, sel: game.hookKind() }, tooPoor: (() => { game.save.hooks = {}; game.save.gems = 3; game.buyHook('lightrope'); return !game.save.hooks.lightrope; })() };
          game.save.hooks = { grabber: true, lightrope: true }; game.save.gems = 0;
          game.shopMode = 'normal'; game.ui.renderShop();
          game.equipHook('normal', true); game.cycleHook(); const c1 = game.hookKind(); game.cycleHook(); const c2 = game.hookKind(); game.cycleHook(); r8.cycle = [c1, c2, game.hookKind()];
          r8.gunVariant = game.gun.variant;
          // ---- GROUND GRABBER: dig the ground under our feet
          game.equipHook('grabber', true);
          reset(); { const da = c6.pointAt(2.4, 0.5); p.pos.set(da.x, da.y + 0.3, da.z); p.vel.set(0, 0, 0); sim(0.3); } p.pitch = -1.2; p.yaw = 0.3; sim(0.05);
          const tBefore = (() => { const f0 = p.forward(); const h0 = W.raycast(game.camera.position, f0, 40); return h0 ? h0.point.clone() : null; })();
          p.shoot(); sim(1.2);
          const dug = W.holes.length, holdDig = p.held ? p.held.look : null;
          let groundDrop = null;
          if (tBefore && dug) { const I0 = W.islandsNear(tBefore.x, tBefore.z, 0)[0]; const s0 = I0 && I0.sample(tBefore.x, tBefore.z); groundDrop = s0 ? +(tBefore.y - s0.top).toFixed(2) : 'through'; }
          r8.dig = { holes: dug, held: holdDig, groundLoweredBy: groundDrop, holeUniforms: (W.updateHoles(game.camera.position), HOLES_N()) };
          // throw it at an enemy: stun + damage, then it lands as a block
          r8.dig.fellIntoOwnPit = p.pos.y < c6.pointAt(2.4, 0.5).y - 0.8;
          reset(); const o20 = clearOff(18); const te = new Enemy(game, p.pos.clone().add(o20), 'brute'); te.think = 999; te.wdT = 999; game.enemies.push(te); sim(0.3);
          const tc = te.pos.clone(); tc.y += 1.2; aim(tc);
          const placed0 = W.placed.length;
          p.shoot(); let stunSeen = 0; for (let i = 0; i < 90; i++) { sim(1 / 60); stunSeen = Math.max(stunSeen, te.stunT); }
          sim(2);
          r8.throw = { dmg: 160 - te.hp, stun: +stunSeen.toFixed(2), heldAfter: !!p.held, placed: W.placed.length - placed0, flying: game.grab.flying.length };
          const blk = W.placed[W.placed.length - 1];
          if (blk) {
            // the block is solid: stand on it
            p.pos.set(blk.x, blk.y + blk.sy / 2 + 2, blk.z); p.vel.set(0, 0, 0); sim(0.6);
            r8.throw.standOnBlock = Math.abs(p.pos.y - (blk.y + blk.sy / 2)) < 0.1 && p.onGround;
            // grab the block again
            reset(); const bc = new THREE.Vector3(blk.x, blk.y, blk.z); aim(bc); p.shoot(); sim(1.5);
            r8.throw.regrab = { held: !!p.held, placedLeft: W.placed.indexOf(blk) };
            if (p.held) p.cancel(); sim(0.2);
            r8.throw.dropQ = { held: !!p.held, placed: W.placed.length };
          }
          te.dead = true; te.dispose(); game.enemies = [];
          // rip a chunk out of a wall
          let wall = null, wallI = null;
          for (const I of W.islandsInRadius(p.pos.x, p.pos.z, 400)) { if (I.kind === 'spawn') continue; const b = I.boxes.find((b) => !b.noGrab && b.sy > 3 && (b.sx > 3 || b.sz > 3)); if (b) { wall = b; wallI = I; break; } }
          if (wall) {
            const n0 = wallI.boxes.length;
            const side = wall.sx > wall.sz ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
            const at = new THREE.Vector3(wall.x, wall.y, wall.z);
            const hit = W.raycast(at.clone().addScaledVector(side, 8), side.clone().negate(), 12);
            const before = JSON.stringify([wall.x, wall.y, wall.z]);
            const piece = hit && hit.type === 'box' ? game.grab.rip(hit, side.clone().negate(), p) : null;
            r8.wall = { hitType: hit && hit.type, piece: piece ? [piece.sx, piece.sy, piece.sz].map((v) => +v.toFixed(2)) : null, boxesBefore: n0, boxesAfter: wallI.boxes.length, stillThere: wallI.boxes.some((b) => JSON.stringify([b.x, b.y, b.z]) === before) };
            if (piece) game.grab.dispose(piece);
          }
          // uproot a tree
          let tree = null, treeI = null;
          for (const I of W.islandsInRadius(p.pos.x, p.pos.z, 300)) { if (I.kind === 'spawn') continue; const t = I.trees.find((t) => !t.gone); if (t) { tree = t; treeI = I; break; } }
          if (tree) {
            const from = new THREE.Vector3(tree.x + 6, tree.y + tree.h * 0.4, tree.z);
            const hit = W.raycast(from, new THREE.Vector3(-1, 0, 0), 10);
            const piece = hit && hit.type === 'tree' ? game.grab.rip(hit, new THREE.Vector3(-1, 0, 0), p) : null;
            const again = W.raycast(from, new THREE.Vector3(-1, 0, 0), 10);
            r8.tree = { ripped: !!piece, gone: tree.gone, look: piece && piece.look, rayNowHits: again ? again.type : null };
            if (piece) game.grab.dispose(piece);
          }
          // safe zone and shops are protected
          { const sp = W.getData(0, 0).islands[0]; const h0 = W.raycast(new THREE.Vector3(sp.x + 3, sp.y + 20, sp.z + 3), new THREE.Vector3(0, -1, 0), 40); r8.safeProtected = !W.canGrab(h0); }
          // edits travel over the network: a remote dig + a late-join log replay
          const nh0 = W.holes.length;
          const anyI = W.islandsInRadius(p.pos.x, p.pos.z, 200).find((I) => I.kind === 'island' && I !== c6);
          if (anyI) {
            const q = anyI.pointAt(1, 0.3);
            game.onNet({ t: 'wed', op: { id: 'peerX-e1', o: 'dig', I: anyI.id, x: q.x, y: q.y, z: q.z, r: 2.3 } });
            game.onNet({ t: 'wed', op: { id: 'peerX-e1', o: 'dig', I: anyI.id, x: q.x, y: q.y, z: q.z, r: 2.3 } });
            game.onNet({ t: 'wlog', ops: [{ id: 'peerX-e2', o: 'place', pid: 'peerX-pc1', x: q.x, y: q.y + 3, z: q.z, sx: 2, sy: 2, sz: 2, look: 'dirt', color: 0x6e5136, surf: 0 }] });
            game.onNet({ t: 'throw', id: 'peerX-pc9', x: q.x, y: q.y + 30, z: q.z, vx: 0, vy: 0, vz: 0, sx: 1, sy: 1, sz: 1, look: 'rock', color: 0x777777, surf: 0, owner: 'peerX', oname: 'X' });
            r8.net = { remoteHoles: W.holes.length - nh0, remotePlaced: W.placed.some((b) => b.id === 'peerX-pc1'), remoteFlying: game.grab.flying.some((x) => x.id === 'peerX-pc9'), logged: game.editLog.length };
            game.grab.landedRemote('peerX-pc9');
          }
          // grabber blocks Snipe / Swap
          game.save.abil.snipe = true; reset(); r8.snipeBlocked = p.useAbility('snipe') === false;
          // ---- LIGHTROPE: swing on a wall rope
          game.equipHook('lightrope', true);
          reset();
          let anchorOk = false;
          for (let a = 0; a < 6.3 && !anchorOk; a += 0.3) {
            p.yaw = a; p.pitch = 0.35; sim(1 / 60);
            const hh = W.raycast(game.camera.position, p.forward(), 60);
            if (hh && hh.dist > 8) anchorOk = true;
          }
          if (!anchorOk) { p.pitch = -0.5; }
          p.shoot(); sim(0.8);
          const lr = { state: p.hook.state, L: p.hook.L && +p.hook.L.toFixed(1) };
          if (p.hook.state === 2) {
            // walk/fall away: the rope never gets longer than L
            let maxD = 0; p.vel.set(0, 0, 0);
            for (let i = 0; i < 120; i++) { p.vel.x += Math.sin(p.yaw) * 2; p.vel.z += Math.cos(p.yaw) * 2; sim(1 / 60); _v.copy(p.pos); _v.y += 0.8; maxD = Math.max(maxD, _v.distanceTo(p.hook.anchor)); }
            lr.maxDist = +maxD.toFixed(2); lr.held = p.hook.state === 2;
            p.shoot(); sim(0.1); lr.pulled = p.hook.state === 0 && p.vel.length() > 10;
          }
          r8.lightWall = lr;
          // tie an enemy to us: it can't run away, yank keeps it on a short leash
          for (const b of [...W.placed]) W.applyOp({ o: 'unplace', pid: b.id });
          reset(); p.hook.state = 0;
          const le = new Enemy(game, p.pos.clone().add(clearOff(14)), 'grappler'); le.think = 999; le.wdT = 999; le.cool = 999; game.enemies.push(le); sim(0.3);
          const lc = le.pos.clone(); lc.y += 1.2; aim(lc); p.shoot(); sim(0.5);
          const lat = { state: p.hook.state, L: p.hook.L && +p.hook.L.toFixed(1), dmg: 60 - le.hp };
          let far = 0;
          for (let i = 0; i < 90; i++) { _v.subVectors(le.pos, p.pos).setY(0).normalize(); le.vel.x = _v.x * 12; le.vel.z = _v.z * 12; sim(1 / 60); far = Math.max(far, le.pos.distanceTo(p.pos)); }
          lat.maxEnemyDist = +far.toFixed(1);
          p.shoot(); sim(0.6); lat.afterYank = { state: p.hook.state, L: p.hook.L, dist: +le.pos.distanceTo(p.pos).toFixed(1) };
          p.cancel(); sim(0.5); lat.released = p.hook.state === 0;
          r8.lightEnemy = lat;
          le.dead = true; le.dispose(); game.enemies = [];
          // being tied up by another player's Lightrope (network message)
          reset(); const a0 = p.pos.clone().add(new THREE.Vector3(5, 0, 0));
          for (let i = 0; i < 30; i++) { game.onNet({ t: 'hit', target: p.id, mode: 'tether', a: a0.toArray(), L: 5, attacker: 'peerX', aname: 'X' }); p.vel.set(-15, 0, 0); sim(1 / 30); }
          r8.tetheredByPlayer = +p.pos.distanceTo(a0).toFixed(1);
          // stun on the player
          reset(); p.applyHit({ mode: 'bump', dmg: 5, d: [1, 0, 0], k: 0.1, stun: 1, attacker: 'x', aname: 'X' }); const stunShoot = (p.shoot(), p.hook.state); r8.playerStun = { stunT: +p.stunT.toFixed(2), couldShoot: stunShoot !== 0 }; sim(1.2); r8.playerStun.after = +p.stunT.toFixed(2);
          // PvP gem drop
          reset(); game.remotes.set('peerX', { kind: 'player', id: 'peerX', name: 'X', dead: false, pos: new THREE.Vector3(), dispose() {}, update() {}, lastSeen: performance.now() + 1e9, model: { hit() {} } });
          const gb0 = game.bags.filter((b) => b.kind === 'gem').length;
          p.lastAttacker = { id: 'peerX', name: 'X', t: performance.now() }; p.die('test');
          r8.pvpGems = game.bags.filter((b) => b.kind === 'gem').length - gb0;
          game.remotes.delete('peerX'); p.respawn();
          game.equipHook('normal', true); game.save.hooks = {}; game.save.gems = 0;
          r8.hud = { gemText: document.getElementById('gemText').textContent, hookName: document.getElementById('hookName').textContent };
          log.round8 = r8;
        } catch (err) { log.round8 = 'ERR ' + err.stack; }
        // music: render 6 s offline and measure it
        try {
          const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const oc = new OC(1, 44100 * 6, 44100);
          const nb = oc.createBuffer(1, 44100 * 2, 44100); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
          const Mus = game.sfx.music.constructor; const mu = new Mus();
          mu.setup(oc, oc.destination, nb);
          mu.sec = 3; mu.bar = 0; mu.step = 0; // jump to the chorus
          mu.t = 0.05; while (mu.t < 5.8) { mu.playStep(mu.t); mu.t += 0.1; mu.advance(); }
          window.__musicPromise = oc.startRendering().then((buf) => {
            const d = buf.getChannelData(0); let sq = 0, pk = 0; for (let i = 0; i < d.length; i++) { sq += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
            return { rms: +Math.sqrt(sq / d.length).toFixed(3), peak: +pk.toFixed(2), loopMinutes: +((88 * 16 * 0.1) / 60).toFixed(2) };
          });
        } catch (err) { log.music = 'ERR ' + err.message; }
      }
    }
    log.coins = game.save.coins; log.chunks = game.world.built.size; log.errors = window.__errs;
    if (window.__musicPromise) window.__musicPromise.then((m) => { log.music = m; out.textContent = "AUTOTEST " + JSON.stringify(log); }, (e) => { log.music = 'ERR ' + e.message; out.textContent = "AUTOTEST " + JSON.stringify(log); });
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
