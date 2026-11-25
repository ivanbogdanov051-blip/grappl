import { UPGRADES, COSTS, MAX_LEVEL } from './upgrades.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, isTouch) {
    this.g = game; this.touch = isTouch;
    this._hs = -1; this.toastT = 0; this.hmT = 0;
    document.body.classList.toggle('touch', isTouch);
    $('nameInput').value = game.save.name || 'Sky' + Math.floor(Math.random() * 900 + 100);
    $('quality').value = game.quality;
    $('quality').onchange = (e) => { game.save.quality = e.target.value; game.persist(); location.reload(); };
    $('playSolo').onclick = () => game.start('solo');
    $('playPublic').onclick = () => game.start('public');
    $('createRoom').onclick = () => game.start('create');
    $('joinRoom').onclick = () => {
      const code = $('roomInput').value.trim().toUpperCase();
      if (code.length < 3) { this.menuStatus('Type the room code your friend gave you'); return; }
      game.start('join', code);
    };
    if (window.SKY_NO_ONLINE) {
      for (const id of ['playPublic', 'createRoom', 'joinRoom']) $(id).closest('.row, button').classList.add('hidden');
      $('playPublic').classList.add('hidden');
      $('createRoom').classList.add('hidden');
      this.menuStatus('Online play is off in this preview. Host the game folder to play with friends.');
    }
    const qs = new URLSearchParams(location.search).get('room');
    if (qs) $('roomInput').value = qs.toUpperCase();
    $('shopClose').onclick = () => game.closeShop();
    $('resume').onclick = () => game.resume();
    $('toMenu').onclick = () => location.reload();
    $('netInfo').onclick = () => game.copyInvite();
  }
  name() { return $('nameInput').value.trim(); }
  menuStatus(t) { $('menuStatus').textContent = t; }
  showMenu(v) { $('menu').classList.toggle('hidden', !v); }
  showHud(v) {
    $('hud').classList.toggle('hidden', !v);
    $('touch').classList.toggle('hidden', !(v && this.touch));
  }
  showPause(v) { $('pause').classList.toggle('hidden', !v); }

  setHook(st) {
    if (st === this._hs) return;
    this._hs = st;
    const b = $('btnShoot');
    const pull = st === 2 || st === 3;
    b.textContent = pull ? (st === 3 ? 'YANK' : 'PULL') : st === 1 ? '• • •' : 'SHOOT';
    b.classList.toggle('pull', pull);
    b.classList.toggle('busy', st === 1 || st === 4);
    $('btnCancel').classList.toggle('hidden', !(st === 1 || pull));
    const tips = this.touch
      ? ['', 'Hook flying…', 'Hooked! Tap PULL to launch · ✕ to cancel', 'Got one! Tap YANK to pull them in', '']
      : ['', 'Hook flying…', 'Hooked! Click to PULL · Right-click / Q to cancel', 'Got one! Click to YANK them · Q to let go', ''];
    $('hookState').textContent = tips[st] || '';
    $('hookState').classList.toggle('pull', pull);
  }

  hud(p, g) {
    const max = g.stats.health;
    $('hpFill').style.width = Math.max(0, (p.hp / max) * 100) + '%';
    $('hpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${max}`;
    $('coinText').textContent = g.save.coins;
    $('speedo').textContent = `${Math.round(p.vel.length())} m/s · alt ${Math.round(p.pos.y)}m`;
    $('safeTag').classList.toggle('hidden', !p.safe);
  }
  shopArrow(angle, dist) {
    const w = $('shopArrowWrap');
    if (angle === null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('shopArrow').style.transform = `rotate(${angle}rad)`;
    $('shopDist').textContent = `SHOP ${Math.round(dist)}m`;
  }
  shopPrompt(v) {
    $('shopPrompt').classList.toggle('hidden', !v);
    $('btnShop').classList.toggle('hidden', !v);
  }
  crosshair(cls) {
    const c = $('crosshair');
    if (c.dataset.s === cls) return;
    c.dataset.s = cls;
    c.className = cls;
  }
  hitMarker() {
    const c = $('hitmark');
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
  }
  net(text) { $('netInfo').textContent = text; $('netInfo').classList.toggle('hidden', !text); }

  toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }
  feed(text, cls = '') {
    const f = $('feed');
    const d = document.createElement('div');
    d.className = 'fi ' + cls;
    d.textContent = text;
    f.prepend(d);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), 6000);
    setTimeout(() => d.remove(), 7000);
  }
  hurt(v) { $('hurt').style.opacity = v; }
  whiteout(v) { $('whiteout').style.opacity = v; }

  showDeath(msg) {
    $('deathMsg').textContent = msg;
    $('death').classList.remove('hidden');
    this.deathCount(5);
  }
  deathCount(n) { $('deathCount').textContent = n; }
  hideDeath() { $('death').classList.add('hidden'); }

  openShop() { this.renderShop(); $('shop').classList.remove('hidden'); }
  closeShop() { $('shop').classList.add('hidden'); }
  renderShop() {
    const g = this.g;
    $('shopCoins').textContent = `🪙 ${g.save.coins} coins`;
    const list = $('shopList');
    list.innerHTML = '';
    for (const u of UPGRADES) {
      const lv = g.save.up[u.key] || 0;
      const max = lv >= MAX_LEVEL;
      const cost = COSTS[lv];
      const row = document.createElement('div');
      row.className = 'upg';
      const fmt = (l) => `${Math.round(u.val(l) * 10) / 10}${u.unit ? ' ' + u.unit : ''}`;
      row.innerHTML = `<div class="uinfo"><div class="un">${u.icon} ${u.name} <span class="pips">${'●'.repeat(lv)}${'○'.repeat(MAX_LEVEL - lv)}</span></div>
        <div class="ud">${u.desc}: <b>${fmt(lv)}</b>${max ? '' : ` → <b class="nx">${fmt(lv + 1)}</b>`}</div></div>`;
      const b = document.createElement('button');
      b.textContent = max ? 'MAX' : `🪙 ${cost}`;
      b.disabled = max || g.save.coins < cost;
      b.onclick = () => g.buy(u.key);
      row.appendChild(b);
      list.appendChild(row);
    }
  }
}
