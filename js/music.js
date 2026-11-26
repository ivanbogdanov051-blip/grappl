// Procedural soundtrack: fast (150 BPM), epic, D minor. No audio files.
// One pass through the arrangement is about 2.5 minutes. Every time it loops, the
// melodies are generated again, so the music keeps changing instead of repeating exactly.
const BPM = 150;
const STEP = 60 / BPM / 4; // one 16th note
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// chords as [semitones above D, minor?]
const P_EPIC = [[0, 1], [-4, 0], [3, 0], [-2, 0]]; // Dm  Bb  F   C
const P_DARK = [[0, 1], [5, 1], [-4, 0], [-5, 0]]; // Dm  Gm  Bb  A
const P_RISE = [[-4, 0], [-2, 0], [0, 1], [0, 1]]; // Bb  C   Dm  Dm
const SCALE = [0, 2, 3, 5, 7, 8, 10]; // natural minor

// arrangement: bars per section and which parts play
const SECTIONS = [
  { name: 'intro', bars: 8, prog: P_RISE, pad: 1, arp: 0.5, hats: 'late', riser: 1 },
  { name: 'verse', bars: 16, prog: P_EPIC, pad: 1, arp: 1, kick: 1, snare: 1, hats: 8, bass: 8 },
  { name: 'pre', bars: 8, prog: P_DARK, pad: 1, arp: 1, kick: 1, snare: 1, hats: 8, bass: 8, lead: 0.6, roll: 1 },
  { name: 'chorus', bars: 16, prog: P_EPIC, pad: 1, arp: 1, kick: 1, snare: 1, hats: 16, bass: 16, lead: 1, crash: 1 },
  { name: 'verse2', bars: 16, prog: P_DARK, pad: 1, arp: 1, kick: 1, snare: 1, hats: 16, bass: 8, lead: 0.5 },
  { name: 'break', bars: 8, prog: P_RISE, pad: 1, lead: 0.7 },
  { name: 'build', bars: 8, prog: P_EPIC, arp: 1, kick: 1, roll: 2, bass: 8, riser: 1, sweep: 1 },
  { name: 'chorus2', bars: 16, prog: P_EPIC, pad: 1, arp: 1, kick: 1, snare: 1, hats: 16, bass: 16, lead: 1, crash: 1, key: 2 },
  { name: 'outro', bars: 8, prog: P_RISE, pad: 1, arp: 1, kick: 1, snare: 1, hats: 8, bass: 8, lead: 0.8, key: 2 },
];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export class Music {
  constructor() { this.ctx = null; this.vol = 0.5; this.playing = false; this.loop = 0; }

  setup(ctx, dest, noise) {
    if (this.ctx) return;
    this.ctx = ctx; this.noise = noise;
    this.out = ctx.createGain(); this.out.gain.value = this.vol * 1.6;
    this.out.connect(dest);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.15;
    comp.connect(this.out);
    this.bus = ctx.createGain(); this.bus.gain.value = 0.55; this.bus.connect(comp);
    // echo for lead + arp
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.3;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 3000;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(wet).connect(this.bus);
    this.arpFilter = ctx.createBiquadFilter(); this.arpFilter.type = 'lowpass'; this.arpFilter.frequency.value = 2600; this.arpFilter.Q.value = 4;
    this.arpFilter.connect(this.bus); this.arpFilter.connect(this.delay);
    this.newLoop();
  }

  setVolume(v) { this.vol = v; if (this.out) this.out.gain.setTargetAtTime(v * 1.6, this.ctx.currentTime, 0.1); }

  start() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.t = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.pump(), 40);
  }
  stop() { this.playing = false; clearInterval(this.timer); }

  // build the melodies for one pass through the arrangement
  newLoop() {
    const r = rng(9001 + this.loop * 7919);
    this.sec = 0; this.bar = 0; this.step = 0;
    this.melodies = SECTIONS.map((S) => (S.lead ? this.genLead(r, S) : null));
  }
  genLead(r, S) {
    // rhythm: two one-bar patterns (A, B), played A B A B'
    const rhy = () => { const o = []; for (let s = 0; s < 16; s++) if (r() < (s % 4 === 0 ? 0.9 : s % 2 === 0 ? 0.5 : 0.14)) o.push(s); return o; };
    const A = rhy(), B = rhy(), B2 = rhy();
    let cur = 69;
    const scaleNotes = [];
    for (let m = 57; m <= 86; m++) if (SCALE.includes(((m - 62) % 12 + 12) % 12)) scaleNotes.push(m);
    const phrase = (variant) => {
      const bars = [];
      for (let b = 0; b < 4; b++) {
        const pat = b % 2 === 0 ? A : b === 3 && variant ? B2 : B;
        const [root, minor] = S.prog[b % 4];
        const tones = [0, minor ? 3 : 4, 7].map((x) => (((62 + root + x) % 12) + 12) % 12);
        const notes = [];
        pat.forEach((s, i) => {
          const len = Math.min(4, (pat[i + 1] ?? 16) - s);
          if (s % 4 === 0) {
            // strong beat: nearest chord tone, sometimes leap
            let best = cur, bd = 99;
            for (const m of scaleNotes) {
              if (!tones.includes(m % 12)) continue;
              const d = Math.abs(m - cur) + (r() < 0.25 ? r() * 8 : 0);
              if (d < bd) { bd = d; best = m; }
            }
            cur = best;
          } else {
            let k = scaleNotes.indexOf(cur); if (k < 0) k = scaleNotes.findIndex((m) => m > cur);
            k = Math.max(0, Math.min(scaleNotes.length - 1, k + (r() < 0.5 ? -1 : 1) * (r() < 0.75 ? 1 : 2)));
            cur = scaleNotes[k];
          }
          if (cur > 81) cur -= 12; if (cur < 62) cur += 12;
          notes.push([s, cur, len]);
        });
        bars.push(notes);
      }
      return bars;
    };
    const p1 = phrase(false), p2 = phrase(true);
    const out = [];
    for (let b = 0; b < S.bars; b++) out.push((Math.floor(b / 4) % 2 ? p2 : p1)[b % 4]);
    return out;
  }

  pump() {
    const c = this.ctx;
    if (!this.playing || !c) return;
    if (this.t < c.currentTime - 0.3) this.t = c.currentTime + 0.05; // tab was asleep: resync
    while (this.t < c.currentTime + 0.3) { this.playStep(this.t); this.t += STEP; this.advance(); }
  }
  advance() {
    if (++this.step >= 16) {
      this.step = 0;
      if (++this.bar >= SECTIONS[this.sec].bars) {
        this.bar = 0;
        if (++this.sec >= SECTIONS.length) { this.loop++; this.newLoop(); }
      }
    }
  }

  playStep(t) {
    const S = SECTIONS[this.sec], s = this.step, bar = this.bar, key = S.key || 0;
    const [root, minor] = S.prog[bar % 4];
    const R = 62 + root + key; // chord root, octave 4
    const third = minor ? 3 : 4;
    const lastBar = bar === S.bars - 1;
    // ---- drums
    if (S.crash && bar === 0 && s === 0) this.cymbal(t, 1.4, 0.16);
    if (S.kick && s % 4 === 0 && !(S.roll && lastBar && s > 8)) this.kick(t, 0.95);
    if (S.kick && S.name.startsWith('chorus') && s === 14 && bar % 2 === 1) this.kick(t, 0.6);
    if (S.snare && (s === 4 || s === 12)) this.snare(t, 0.4);
    if (S.roll) {
      const n = S.bars, from = S.roll === 2 ? 0 : n - 2;
      if (bar >= from) {
        const prog = (bar - from + s / 16) / (n - from);
        const every = prog < 0.5 ? 4 : prog < 0.8 ? 2 : 1;
        if (s % every === 0) this.snare(t, 0.12 + 0.3 * prog);
      }
    }
    if (S.hats === 8 && s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.09 : 0.05, 0.04);
    if (S.hats === 16) this.hat(t, s % 4 === 2 ? 0.11 : 0.04, s % 4 === 2 ? 0.12 : 0.03);
    if (S.hats === 'late' && bar >= 4 && s % 2 === 0) this.hat(t, 0.04, 0.03);
    if (S.riser && lastBar && s === 0) this.riser(t, STEP * 16);
    // ---- pad
    if (S.pad && s === 0) this.pad(t, [R - 12, R - 12 + third, R - 12 + 7, R], STEP * 16);
    // ---- bass
    if (S.bass === 8 && s % 2 === 0) this.bass(t, midi(R - 24 + (s === 6 || s === 14 ? 12 : 0)), STEP * 1.8);
    if (S.bass === 16) this.bass(t, midi(R - 24 + (s % 4 === 2 ? 12 : 0)), STEP * 0.9);
    // ---- arpeggio (up-down over two octaves)
    if (S.arp) {
      const seq = [0, third, 7, 12, 12 + third, 19, 12 + third, 12, 7, third, 0, 7, 12, 7, 12 + third, 19];
      this.arp(t, midi(R + seq[s]), 0.045 * S.arp);
      if (S.sweep) this.arpFilter.frequency.setTargetAtTime(500 + 3500 * ((bar + s / 16) / S.bars), t, 0.05);
      else if (s === 0 && bar === 0) this.arpFilter.frequency.setTargetAtTime(2600, t, 0.2);
    }
    // ---- lead melody
    const mel = this.melodies[this.sec];
    if (mel) for (const [ns, m, len] of mel[bar]) if (ns === s) this.lead(t, midi(m + key), STEP * len * 0.95, 0.07 * S.lead);
  }

  // ---------------- instruments
  env(t, g, vol, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  osc(type, f, t, dur, vol, a, dest, detune = 0) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    this.env(t, g, vol, a, dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }
  kick(t, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    this.env(t, g, vol, 0.003, 0.28);
    o.connect(g).connect(this.bus);
    o.start(t); o.stop(t + 0.35);
  }
  noiseHit(t, dur, vol, type, freq, q = 1, dest = this.bus) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(t, g, vol, 0.002, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  snare(t, vol) { this.noiseHit(t, 0.16, vol, 'bandpass', 1900, 0.8); this.osc('triangle', 190, t, 0.08, vol * 0.5, 0.002, this.bus); }
  hat(t, vol, dur) { this.noiseHit(t, dur, vol, 'highpass', 8000, 0.7); }
  cymbal(t, dur, vol) { this.noiseHit(t, dur, vol, 'highpass', 5500, 0.5); }
  riser(t, dur) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.loop = true; f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t); s.stop(t + dur + 0.1);
  }
  bass(t, f, dur) {
    const c = this.ctx, lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(1400, t); lp.frequency.exponentialRampToValueAtTime(260, t + dur);
    lp.connect(this.bus);
    this.osc('sawtooth', f, t, dur, 0.2, 0.004, lp);
    this.osc('square', f / 2, t, dur, 0.1, 0.004, lp);
  }
  arp(t, f, vol) { this.osc('square', f, t, STEP * 0.9, vol, 0.003, this.arpFilter); }
  pad(t, notes, dur) {
    const c = this.ctx, lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300;
    lp.connect(this.bus);
    for (const m of notes) for (const dt of [-9, 9]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = midi(m); o.detune.value = dt;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.25);
      g.gain.setValueAtTime(0.022, t + dur - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(g).connect(lp);
      o.start(t); o.stop(t + dur + 0.15);
    }
  }
  lead(t, f, dur, vol) {
    const c = this.ctx, lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(1800, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol * 0.8, t + Math.max(0.02, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    lp.connect(g); g.connect(this.bus); g.connect(this.delay);
    for (const [type, det] of [['sawtooth', -7], ['sawtooth', 7], ['square', 0]]) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = det;
      // a little vibrato on longer notes
      if (dur > STEP * 2.5) {
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 6; lg.gain.value = 9;
        lfo.connect(lg).connect(o.detune); lfo.start(t + 0.12); lfo.stop(t + dur + 0.1);
      }
      o.connect(lp);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }
}
export const MUSIC_LENGTH = SECTIONS.reduce((a, S) => a + S.bars, 0) * 16 * STEP;
