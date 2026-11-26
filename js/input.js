// Keyboard + mouse (pointer lock) and touch (joystick, drag-look, buttons)
import { ABILITIES, abilityKey } from './upgrades.js';
const KEYMAP = {};
for (const A of ABILITIES) { const k = abilityKey(A); KEYMAP[/\d/.test(k) ? 'Digit' + k : 'Key' + k] = A.key; }
export class Input {
  constructor(game, canvas, isTouch) {
    this.game = game; this.canvas = canvas; this.touch = isTouch;
    this.keys = {};
    this.mx = 0; this.my = 0; this.run = false; this.stickMag = 0;
    this.jumpT = 0; this.runToggle = false; this.locked = false;
    this.stick = { x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      this.keys[e.code] = true;
      if (!game.running) return;
      if (e.code === 'Space') { this.jumpT = 0.15; e.preventDefault(); }
      if (e.code === 'KeyQ' || e.code === 'KeyX') game.cancelHook();
      if (e.code === 'KeyE') game.interact();
      if (e.code === 'KeyF') game.shootHook();
      const ak = KEYMAP[e.code];
      if (ak) game.useAbility(ak);
      if (e.code === 'KeyM') game.ui.toast(game.sfx.toggleMute() ? '🔇 Muted' : '🔊 Sound on');
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    canvas.addEventListener('click', () => {
      if (!this.touch && game.running && !game.shopOpen && !this.locked) this.lock();
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked || !game.running) return;
      if (e.button === 0) game.shootHook();
      else if (e.button === 2) game.cancelHook();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      let dx = e.movementX, dy = e.movementY;
      // some browsers report a huge bogus jump right after locking: ignore it
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      const s = 0.0022 * game.sens();
      game.look(dx * s, dy * s * (game.save.invertY ? -1 : 1));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      game.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; game.onLockError(); });
    if (isTouch) this.setupTouch();
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* ignore */ }
  }

  setupTouch() {
    const g = this.game;
    const layer = document.getElementById('touchLayer');
    const base = document.getElementById('stickBase');
    const knob = document.getElementById('stickKnob');
    let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
    const MAX = 55;
    const releaseStick = () => {
      stickId = null; this.stick.x = 0; this.stick.y = 0; this.stickMag = 0;
      base.classList.remove('active');
    };
    // A finger whose touchend got lost (notification, panel popping up, OS gesture...) used to keep
    // the look slot "taken" forever, so the camera stopped turning. Drop any id that is no longer on screen.
    const reconcile = (e) => {
      const alive = new Set([...e.touches].map((t) => t.identifier));
      if (lookId !== null && !alive.has(lookId)) lookId = null;
      if (stickId !== null && !alive.has(stickId)) releaseStick();
    };
    this.resetTouch = () => { lookId = null; releaseStick(); };
    addEventListener('blur', this.resetTouch);
    document.addEventListener('visibilitychange', this.resetTouch);
    // watch every touch on the page, not just the layer, so ends that land elsewhere are still seen
    document.addEventListener('touchend', reconcile, true);
    document.addEventListener('touchcancel', reconcile, true);
    layer.addEventListener('touchstart', (e) => {
      e.preventDefault();
      reconcile(e);
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          base.style.left = sx + 'px'; base.style.top = sy + 'px';
          base.classList.add('active');
          knob.style.transform = 'translate(-50%,-50%)';
        } else if (lookId === null) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: false });
    layer.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          const dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy), k = l > MAX ? MAX / l : 1;
          knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
          this.stick.x = (dx * k) / MAX;
          this.stick.y = (-dy * k) / MAX;
          this.stickMag = Math.min(1, l / MAX);
        } else if (lookId === null && t.identifier !== stickId && t.clientX >= innerWidth * 0.45) {
          lookId = t.identifier; lx = t.clientX; ly = t.clientY;
        } else if (t.identifier === lookId) {
          const s = 0.0058 * g.sens();
          g.look((t.clientX - lx) * s, (t.clientY - ly) * s * (g.save.invertY ? -1 : 1));
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) releaseStick();
        else if (t.identifier === lookId) lookId = null;
      }
      reconcile(e);
    };
    layer.addEventListener('touchend', end);
    layer.addEventListener('touchcancel', end);

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('pressed'); fn(); }, { passive: false });
      const up = (e) => { e.preventDefault(); el.classList.remove('pressed'); };
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
    };
    bind('btnShoot', () => g.shootHook());
    bind('btnCancel', () => g.cancelHook());
    bind('btnJump', () => { this.jumpT = 0.15; });
    bind('btnRun', () => {
      this.runToggle = !this.runToggle;
      document.getElementById('btnRun').classList.toggle('on', this.runToggle);
    });
    bind('btnShop', () => g.interact());
    bind('btnMenu', () => g.pause());
  }

  update(dt) {
    this.jumpT -= dt;
    const k = this.keys;
    const active = this.game.running && !this.game.shopOpen && (this.touch || this.locked);
    if (!active) { this.mx = 0; this.my = 0; this.run = false; return; }
    if (this.touch) {
      this.mx = this.stick.x; this.my = this.stick.y; this.run = this.runToggle;
    } else {
      this.mx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      this.my = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      this.run = !!(k.ShiftLeft || k.ShiftRight);
      this.stickMag = 0;
    }
  }
  consumeJump() {
    if (this.jumpT > 0) { this.jumpT = 0; return true; }
    return false;
  }
}
