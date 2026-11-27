import { UPGRADES, COSTS, MAX_LEVEL, ABILITIES, abilityKey, PASSIVES, HOOKS, HOOK_DEF } from './upgrades.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game, isTouch) {
    this.g = game; this.touch = isTouch;
    this._hs = -1; this.toastT = 0; this.hmT = 0;
    document.body.classList.toggle('touch', isTouch);
    $('nameInput').value = game.save.name || 'Sky' + Math.floor(Math.random() * 900 + 100);
    $('quality').value = game.quality;
    for (const id of ['sens', 'sens2']) {
      const el = $(id);
      el.value = game.sens();
      el.oninput = () => {
        game.save.sens = Math.round(parseFloat(el.value) * 10) / 10;
        this.syncSens();
        game.persist();
      };
    }
    for (const id of ['musicVol', 'musicVol2']) {
      $(id).value = Math.round((game.save.musicVol ?? 0.5) * 100);
      $(id).oninput = (e) => {
        game.save.musicVol = e.target.value / 100;
        game.sfx.music.setVolume(game.save.musicVol);
        for (const o of ['musicVol', 'musicVol2']) $(o).value = e.target.value;
        for (const o of ['musicVal', 'musicVal2']) $(o).textContent = e.target.value + '%';
        game.persist();
      };
    }
    for (const o of ['musicVal', 'musicVal2']) $(o).textContent = Math.round((game.save.musicVol ?? 0.5) * 100) + '%';
    for (const id of ['invertY', 'invertY2']) {
      $(id).checked = !!game.save.invertY;
      $(id).onchange = (e) => { game.save.invertY = e.target.checked; this.syncSens(); game.persist(); };
    }
    this.syncSens();
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
  syncSens() {
    const v = this.g.sens();
    for (const id of ['sens', 'sens2']) $(id).value = v;
    for (const id of ['sensVal', 'sensVal2']) $(id).textContent = v.toFixed(1) + '×';
    for (const id of ['invertY', 'invertY2']) $(id).checked = !!this.g.save.invertY;
  }
  name() { return $('nameInput').value.trim(); }
  menuStatus(t) { $('menuStatus').textContent = t; }
  showMenu(v) { $('menu').classList.toggle('hidden', !v); }
  showHud(v) {
    $('hud').classList.toggle('hidden', !v);
    $('touch').classList.toggle('hidden', !(v && this.touch));
  }
  showPause(v) {
    $('pause').classList.toggle('hidden', !v);
    if (v && this.g.input && this.g.input.resetTouch) this.g.input.resetTouch();
  }

  setHook(st, kind = 'normal', held = false) {
    const key = st + kind + held;
    if (key === this._hs) return;
    this._hs = key;
    const b = $('btnShoot');
    const pull = st === 2 || st === 3;
    const light = kind === 'lightrope', grab = kind === 'grabber';
    const live = st === 1 && (kind === 'frost' || kind === 'boomerang'); // a second tap does something while it flies
    b.textContent = held ? 'THROW' : pull ? (st === 3 ? 'YANK' : 'PULL') : live ? (kind === 'frost' ? 'ICE' : 'CALL') : st === 1 || st === 4 ? '• • •' : grab ? 'GRAB' : kind === 'boomerang' ? 'THROW' : kind === 'warp' ? 'WARP' : 'SHOOT';
    b.classList.toggle('pull', pull || held || live);
    b.classList.toggle('busy', !held && !live && (st === 1 || st === 4));
    $('btnCancel').classList.toggle('hidden', !(st === 1 || pull || held));
    const T = this.touch;
    let tip = ['', 'Hook flying…', T ? 'Hooked! Tap PULL to launch · ✕ to cancel' : 'Hooked! Click to PULL · Right-click / Q to cancel', T ? 'Got one! Tap YANK to pull them in' : 'Got one! Click to YANK them · Q to let go', ''][st] || '';
    if (light && st === 2) tip = T ? '🪢 Swinging on the rope · PULL to zoom in · ✕ lets go' : '🪢 Swing on the rope! Click to PULL yourself in · Q lets go';
    if (light && st === 3) tip = T ? '🪢 Tied up! YANK to drag them in · ✕ lets go' : '🪢 They\'re tied to you! Click to YANK · Q lets go';
    if (kind === 'boomerang' && st === 1) tip = T ? '🪃 Boomerang out! Tap CALL to bring it back' : '🪃 Boomerang out! Click to call it back early';
    if (kind === 'frost' && st === 1) tip = T ? '❄️ Tap ICE to freeze a platform right there' : '❄️ Click again to freeze an ICE PLATFORM right there';
    const what = held === 'struct' ? '🏗️ Holding a whole building' : '🟨 Holding a chunk';
    if (held) tip = T ? `${what} · THROW it · ✕ puts it down` : `${what} · Click to THROW (the arc shows where it lands) · Q to put it down`;
    $('hookState').textContent = tip;
    $('hookState').classList.toggle('pull', pull || held);
  }
  hookLabel(kind, owned) {
    const H = HOOK_DEF[kind] || HOOK_DEF.normal;
    const el = $('hookName');
    el.textContent = `${H.icon} ${H.name}${owned > 1 ? (this.touch ? '' : '  ·  Tab to switch') : ''}`;
    el.className = 'hk-' + kind;
    el.classList.toggle('hidden', owned < 2 && kind === 'normal');
    const b = $('btnHook');
    b.classList.toggle('hidden', owned < 2);
    b.textContent = H.icon;
  }
  hookArrow(angle, dist) {
    const w = $('hookArrowWrap');
    if (angle === null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('hookArrow').style.transform = `rotate(${angle}rad)`;
    $('hookDist').textContent = `HOOKS ${Math.round(dist)}m`;
  }

  hud(p, g) {
    const max = g.stats.health;
    $('hpFill').style.width = Math.max(0, (p.hp / max) * 100) + '%';
    $('hpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${max}`;
    $('coinText').textContent = g.save.coins;
    $('gemText').textContent = g.save.gems || 0;
    $('speedo').textContent = `${Math.round(p.vel.length())} m/s · alt ${Math.round(p.pos.y)}m`;
    $('safeTag').classList.toggle('hidden', !p.safe);
    $('shieldFx').style.opacity = p.shieldT > 0 ? 1 : 0;
  }
  boss(name, frac) {
    const b = $('bossBar');
    b.classList.toggle('hidden', !name);
    if (!name) return;
    $('bossName').textContent = '👑 ' + name;
    $('bossFill').style.width = Math.max(0, frac * 100) + '%';
  }
  bossArrow(angle, dist) {
    const w = $('bossArrowWrap');
    if (angle === null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('bossArrow').style.transform = `rotate(${angle}rad)`;
    $('bossDist').textContent = `👑 BOSS ${Math.round(dist)}m`;
  }
  parry(on) { $('parryFx').style.opacity = on ? 1 : 0; }
  shopArrow(angle, dist) {
    const w = $('shopArrowWrap');
    if (angle === null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('shopArrow').style.transform = `rotate(${angle}rad)`;
    $('shopDist').textContent = `SHOP ${Math.round(dist)}m`;
  }
  passArrow(angle, dist) {
    const w = $('passArrowWrap');
    if (angle === null) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('passArrow').style.transform = `rotate(${angle}rad)`;
    $('passDist').textContent = `PASSIVES ${Math.round(dist)}m`;
  }
  shopPrompt(v, type) {
    $('shopPrompt').classList.toggle('hidden', !v);
    const name = type === 'passive' ? 'the Passive Shop' : type === 'hook' ? 'the Hook Shop' : 'the shop';
    const btn = type === 'passive' ? '✦ PASSIVES' : type === 'hook' ? '🪝 HOOKS' : '🛒 SHOP';
    if (v) $('shopPrompt').innerHTML = this.touch ? `Tap ${btn} to open ${name}` : `Press <b>E</b> to open ${name}`;
    $('btnShop').textContent = btn;
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
  deathCoins(n) {
    let el = $('deathCoins');
    if (!el) { el = document.createElement('div'); el.id = 'deathCoins'; $('deathMsg').after(el); }
    el.textContent = n > 0 ? `💰 You dropped ${n} coins! Follow the gold beam to grab them back before someone else does.` : '';
  }
  deathCount(n) { $('deathCount').textContent = n; }
  hideDeath() { $('death').classList.add('hidden'); }

  // the normal-ability button bar holds a limited number of buttons (10 on phones, 12 on PC; PARRY has its own spot)
  maxBar() { return this.touch ? 10 : 12; }
  onBar(A) { const s = this.g.save; return !!s.abil[A.key] && !A.rare && (A.key === 'parry' || !(s.hidden || {})[A.key]); }
  barCount() { return ABILITIES.filter((A) => A.key !== 'parry' && this.onBar(A)).length; }
  toggleBar(key) {
    const s = this.g.save; s.hidden = s.hidden || {};
    if (s.hidden[key]) {
      if (this.barCount() >= this.maxBar()) { this.toast(`Bar is full (${this.maxBar()}): take one off first`); return; }
      delete s.hidden[key];
    } else s.hidden[key] = true;
    this.g.persist(); this.renderShop(); this.renderAbilities();
  }
  fx(id, on) { const el = $(id); if (el) el.style.opacity = on ? 1 : 0; }
  renderAbilities() {
    const g = this.g, bar = $('abilities'), rareBar = $('rareAbilities');
    bar.innerHTML = ''; rareBar.innerHTML = '';
    this.abBtns = {};
    let shown = 0;
    ABILITIES.forEach((A) => {
      if (!g.save.abil[A.key]) return;
      if (!A.rare && !this.onBar(A)) return;
      if (!A.rare && A.key !== 'parry' && ++shown > this.maxBar()) { g.save.hidden[A.key] = true; return; }
      const b = document.createElement('button');
      b.className = 'ab ' + A.key;
      b.innerHTML = `<span class="ai">${A.icon}</span><span class="ak">${abilityKey(A)}</span><span class="acd"></span>`;
      b.title = A.name;
      const fire = (e) => { e.preventDefault(); e.stopPropagation(); g.useAbility(A.key); };
      b.addEventListener('touchstart', fire, { passive: false });
      b.addEventListener('mousedown', fire);
      (A.rare ? rareBar : bar).appendChild(b);
      if (A.rare) b.classList.add('rare');
      if (A.super) b.classList.add('super');
      this.abBtns[A.key] = { b, cd: b.querySelector('.acd'), max: A.cd };
    });
  }
  updateAbilities(p) {
    if (!this.abBtns) return;
    for (const k in this.abBtns) {
      const o = this.abBtns[k];
      const left = Math.max(0, p.cd[k] || 0);
      o.cd.style.height = (left / o.max) * 100 + '%';
      o.cd.textContent = left > 0 ? Math.ceil(left) : '';
      o.b.classList.toggle('ready', left <= 0);
      o.b.classList.toggle('charged', (k === 'leap' && p.superShot > 0) || (k === 'shield' && p.shieldT > 0) || (k === 'glide' && p.glideT > 0) || (k === 'parry' && p.parryT > 0) || (k === 'cloak' && p.cloakT > 0) || (k === 'jetpack' && p.jetT > 0) || (k === 'vampire' && p.vampT > 0) || (k === 'rage' && p.rageT > 0) || (k === 'timewarp' && this.g.warpT > 0) || (k === 'snipe' && p.snipeT > 0) || (k === 'laser' && p.laserT > 0));
    }
  }
  openShop() { this.renderShop(); $('shop').classList.remove('hidden'); }
  closeShop() { $('shop').classList.add('hidden'); }
  renderShop() {
    const g = this.g;
    $('shopCoins').textContent = `🪙 ${g.save.coins} coins  ·  💎 ${g.save.gems || 0} gems`;
    const list = $('shopList');
    list.innerHTML = '';
    const passive = g.shopMode === 'passive', hookShop = g.shopMode === 'hook';
    $('shopTitle').textContent = passive ? '✦ Passive Shop' : hookShop ? '🪝 Hook Shop' : '🛒 Grapple Shop';
    $('shop').classList.toggle('passive', passive);
    $('shop').classList.toggle('hookshop', hookShop);
    if (hookShop) {
      const h = document.createElement('h3');
      h.textContent = 'Grappling hooks: paid with 💎 GEMS + coins. Bosses drop 5 gems, players you take out drop 2.';
      list.appendChild(h);
      const cur = g.hookKind();
      for (const H of HOOKS) {
        const owned = H.key === 'normal' || !!(g.save.hooks || {})[H.key];
        const row = document.createElement('div');
        row.className = 'upg hookrow hk-' + H.key;
        const cost = H.key === 'normal' ? 'Free' : `💎 ${H.gems} + 🪙 ${H.cost}`;
        row.innerHTML = `<div class="uinfo"><div class="un">${H.icon} ${H.name} <span class="pips">${cost}</span></div><div class="ud"><i>${H.design}.</i> ${H.desc}${H.no ? `<br><span class="hkno">Doesn't work with: ${H.no}</span>` : ''}</div></div>`;
        const b = document.createElement('button');
        if (owned) {
          b.textContent = cur === H.key ? '✓ EQUIPPED' : 'EQUIP';
          b.disabled = cur === H.key;
          b.onclick = () => g.equipHook(H.key);
        } else {
          b.textContent = 'BUY';
          b.disabled = (g.save.gems || 0) < H.gems || g.save.coins < H.cost;
          b.title = b.disabled ? `Needs ${H.gems} gems and ${H.cost} coins` : '';
          b.onclick = () => g.buyHook(H.key);
        }
        row.appendChild(b);
        list.appendChild(row);
      }
      return;
    }
    if (passive) {
      const h = document.createElement('h3');
      h.textContent = 'Passives: buy once, always active. No button needed.';
      list.appendChild(h);
      for (const P of PASSIVES) {
        const owned = !!(g.save.passive || {})[P.key];
        const row = document.createElement('div');
        row.className = 'upg passive';
        row.innerHTML = `<div class="uinfo"><div class="un">${P.icon} ${P.name}</div><div class="ud">${P.desc}</div></div>`;
        const b = document.createElement('button');
        b.textContent = owned ? '✓ OWNED' : `🪙 ${P.cost}`;
        b.disabled = owned || g.save.coins < P.cost;
        b.onclick = () => g.buyPassive(P.key);
        row.appendChild(b);
        list.appendChild(row);
      }
      return;
    }
    const hint = document.createElement('div');
    hint.className = 'shopHint';
    hint.textContent = '✦ Passives (like RUNNER) are sold in the rare purple PASSIVE SHOPS. 🪝 New grappling hooks (paid with 💎 gems from bosses) are sold in the even rarer black-and-yellow HOOK SHOPS. Follow the arrows at the top.';
    list.appendChild(hint);
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
    const h = document.createElement('h3');
    h.textContent = `Abilities: buy once, then use their button. Button bar: ${this.barCount()}/${this.maxBar()}${this.touch ? '' : ' (PC: every owned ability works on its key)'}`;
    list.appendChild(h);
    ABILITIES.forEach((A) => {
      if (A.rare) return;
      const owned = !!g.save.abil[A.key];
      const row = document.createElement('div');
      row.className = 'upg ability' + (A.super ? ' super' : '');
      row.innerHTML = `<div class="uinfo"><div class="un">${A.icon} ${A.name} <span class="pips">key ${abilityKey(A)} · ${A.cd}s cooldown</span></div><div class="ud">${A.desc}</div></div>`;
      const b = document.createElement('button');
      if (owned && A.key !== 'parry') {
        const on = this.onBar(A);
        b.textContent = on ? '✓ ON BAR' : '+ ADD TO BAR';
        b.className = on ? 'onbar' : 'offbar';
        b.onclick = () => this.toggleBar(A.key);
      } else {
        b.textContent = owned ? 'OWNED' : `🪙 ${A.cost}`;
        b.disabled = owned || g.save.coins < A.cost;
        b.onclick = () => g.buyAbility(A.key);
      }
      row.appendChild(b);
      list.appendChild(row);
    });
    const h2 = document.createElement('h3');
    h2.textContent = '👑 Rare abilities: only dropped by bosses';
    list.appendChild(h2);
    for (const A of ABILITIES) {
      if (!A.rare) continue;
      const owned = !!g.save.abil[A.key];
      const row = document.createElement('div');
      row.className = 'upg ability rare';
      row.innerHTML = `<div class="uinfo"><div class="un">${A.icon} ${A.name} <span class="pips">key ${A.hk} · ${A.cd}s cooldown</span></div><div class="ud">${A.desc}</div></div>`;
      const b = document.createElement('button');
      b.textContent = owned ? 'OWNED' : 'Drops from ' + A.rare;
      b.disabled = true;
      row.appendChild(b);
      list.appendChild(row);
    }
  }
}
