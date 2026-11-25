// Tiny synthesized sound effects (no audio files needed)
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.vm = 1; this.listener = null; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(c.destination);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.windFilter = c.createBiquadFilter();
    this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.55; return this.muted; }
  tone(f0, f1, dur, type = 'sine', vol = 0.2, delay = 0) {
    const c = this.ctx; if (!c || this.muted) return;
    vol *= this.vm; if (vol < 0.002) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  hiss(dur, freq, vol = 0.2, q = 1) {
    const c = this.ctx; if (!c || this.muted) return;
    vol *= this.vm; if (vol < 0.002) return;
    const t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  shoot() { this.hiss(0.18, 2500, 0.3, 0.8); this.tone(900, 300, 0.12, 'square', 0.05); }
  thunk() { this.tone(160, 50, 0.15, 'triangle', 0.45); this.hiss(0.06, 1200, 0.25); }
  zip() { this.tone(180, 1100, 0.28, 'sawtooth', 0.07); this.hiss(0.3, 3000, 0.18, 0.5); }
  hit() { this.tone(520, 120, 0.18, 'square', 0.12); this.hiss(0.1, 800, 0.3); }
  hurt() { this.tone(240, 90, 0.3, 'sawtooth', 0.18); }
  coin() { this.tone(1046, 1046, 0.08, 'square', 0.05); this.tone(1568, 1568, 0.12, 'square', 0.05, 0.07); }
  buy() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.15, i * 0.07)); }
  death() { this.tone(440, 55, 1.0, 'sawtooth', 0.15); }
  cancel() { this.tone(400, 200, 0.1, 'triangle', 0.1); }
  jump() { this.tone(300, 500, 0.1, 'sine', 0.06); }
  kill() { this.tone(660, 990, 0.15, 'square', 0.08); this.tone(990, 1320, 0.2, 'square', 0.08, 0.1); }
  // play a sound with distance falloff from the listener position
  near(name, pos) {
    if (!this.listener) return;
    const d = this.listener.distanceTo(pos);
    if (d > 110) return;
    this.vm = Math.max(0, 1 - d / 110) * 0.8;
    this[name]();
    this.vm = 1;
  }
  wind(speed) {
    if (!this.ctx) return;
    const v = Math.min(1, Math.max(0, (speed - 14) / 45));
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(this.muted ? 0 : v * 0.35, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(400 + v * 1400, t, 0.2);
  }
}
