/**
 * Synth — sonidos generados con WebAudio (sin archivos): cada receta crea unos pocos
 * nodos (osciladores, ruido filtrado, envolventes) que se destruyen solos al acabar.
 *
 * Todas las recetas reciben `out` (el nodo al que conectarse: un panorama posicional o
 * el bus de efectos) y `k` (intensidad 0…1+). El tiempo es el del AudioContext.
 */
export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.white = makeNoise(ctx, 'white');
    this.brown = makeNoise(ctx, 'brown');
    this.pink = makeNoise(ctx, 'pink');
  }

  get now() {
    return this.ctx.currentTime;
  }

  // ---- Piezas ----------------------------------------------------------------------

  /** Envolvente: sube en `a` s hasta `peak` y cae exponencialmente en `d` s. */
  env(param, t, a, d, peak) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /** Oscilador con envolvente (y barrido de frecuencia opcional). */
  tone(out, { type = 'sine', f = 440, f2 = null, t = this.now, a = 0.005, d = 0.2, gain = 0.3, detune = 0, filter = null, q = 1 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + a + d);
    o.detune.value = detune;
    const g = c.createGain();
    this.env(g.gain, t, a, d, gain);
    let node = o;
    if (filter) {
      const fl = c.createBiquadFilter();
      fl.type = 'lowpass';
      fl.frequency.value = filter;
      fl.Q.value = q;
      o.connect(fl);
      node = fl;
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  /** Ruido filtrado con envolvente (y barrido del filtro opcional). */
  noise(out, { color = 'white', t = this.now, a = 0.002, d = 0.15, gain = 0.3, type = 'bandpass', f = 1200, f2 = null, q = 1, rate = 1 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this[color];
    src.loop = true; // los ruidos largos (truenos) no se quedan sin búfer
    src.playbackRate.value = rate;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + a + d);
    fl.Q.value = q;
    const g = c.createGain();
    this.env(g.gain, t, a, d, gain);
    src.connect(fl).connect(g).connect(out);
    const off = Math.random() * (src.buffer.duration - a - d - 0.1);
    src.start(t, Math.max(0, off));
    src.stop(t + a + d + 0.05);
    return src;
  }

  // ---- Recetas ---------------------------------------------------------------------

  /** Paso según la superficie. */
  step(out, surface, k = 1) {
    const t = this.now;
    const r = 0.85 + Math.random() * 0.3;
    switch (surface) {
      case 'stone':
        this.noise(out, { t, d: 0.06, gain: 0.22 * k, f: 2400 * r, q: 1.5 });
        this.tone(out, { t, type: 'triangle', f: 160 * r, f2: 90, d: 0.05, gain: 0.12 * k });
        break;
      case 'wood':
        this.tone(out, { t, type: 'sine', f: 130 * r, f2: 70, d: 0.09, gain: 0.15 * k });
        this.noise(out, { t, d: 0.05, gain: 0.06 * k, f: 900 * r, q: 2 });
        break;
      case 'metal':
        this.tone(out, { t, type: 'square', f: 220 * r, f2: 180, d: 0.08, gain: 0.09 * k, filter: 1600 });
        this.tone(out, { t, type: 'sine', f: 1240 * r, d: 0.18, gain: 0.04 * k });
        this.noise(out, { t, d: 0.04, gain: 0.14 * k, f: 3000, q: 2 });
        break;
      case 'snow':
        for (let i = 0; i < 3; i++) this.noise(out, { t: t + i * 0.018, d: 0.04, gain: 0.12 * k, type: 'highpass', f: 2500 * r, q: 0.7 });
        break;
      case 'sand':
        this.noise(out, { t, a: 0.01, d: 0.1, gain: 0.27 * k, type: 'bandpass', f: 1800 * r, q: 0.6 });
        break;
      case 'water':
        this.noise(out, { t, a: 0.01, d: 0.18, gain: 0.22 * k, f: 700 * r, f2: 2400, q: 1.2 });
        this.noise(out, { t: t + 0.05, d: 0.12, gain: 0.08 * k, type: 'highpass', f: 3000 });
        break;
      default: // hierba / tierra
        this.noise(out, { t, a: 0.006, d: 0.09, gain: 0.3 * k, type: 'lowpass', f: 1100 * r, q: 0.8 });
        this.noise(out, { t, d: 0.05, gain: 0.09 * k, type: 'highpass', f: 4000 * r });
    }
  }

  whoosh(out, k = 1) {
    this.noise(out, { a: 0.04, d: 0.18, gain: 0.36 * k, f: 500, f2: 2200, q: 1.4 });
  }

  /** Golpe sobre madera (talar), piedra (picar) o carne. */
  impact(out, material = 'wood', k = 1) {
    const t = this.now;
    const r = 0.9 + Math.random() * 0.2;
    if (material === 'stone') {
      this.tone(out, { t, type: 'triangle', f: 1900 * r, f2: 1500, d: 0.18, gain: 0.12 * k });
      this.tone(out, { t, type: 'sine', f: 2850 * r, d: 0.12, gain: 0.06 * k });
      this.noise(out, { t, d: 0.08, gain: 0.25 * k, f: 3200, q: 1.2 });
    } else if (material === 'flesh') {
      this.tone(out, { t, type: 'sine', f: 110 * r, f2: 55, d: 0.12, gain: 0.35 * k });
      this.noise(out, { t, d: 0.07, gain: 0.15 * k, type: 'lowpass', f: 800 });
    } else {
      this.tone(out, { t, type: 'sine', f: 190 * r, f2: 85, d: 0.14, gain: 0.4 * k });
      this.noise(out, { t, d: 0.09, gain: 0.2 * k, f: 1100 * r, q: 1.5 });
    }
  }

  /** Puño (sin herramienta): un golpe seco y un poco de aire. */
  punch(out, k = 1) {
    this.whoosh(out, 0.5 * k);
    this.tone(out, { t: this.now + 0.05, type: 'sine', f: 140, f2: 60, d: 0.08, gain: 0.25 * k });
  }

  bowRelease(out) {
    const t = this.now;
    this.tone(out, { t, type: 'triangle', f: 196, f2: 150, d: 0.25, gain: 0.18 });
    this.tone(out, { t, type: 'sine', f: 392, d: 0.15, gain: 0.06 });
    this.noise(out, { t, a: 0.01, d: 0.2, gain: 0.08, f: 1500, f2: 4000, q: 1 });
  }

  slingRelease(out) {
    const t = this.now;
    this.noise(out, { t, d: 0.05, gain: 0.25, f: 1800, q: 2 });
    this.tone(out, { t, type: 'sine', f: 320, f2: 120, d: 0.08, gain: 0.15 });
    this.noise(out, { t: t + 0.03, a: 0.02, d: 0.15, gain: 0.07, f: 800, f2: 3000 });
  }

  /** Daño recibido: golpe sordo y un quejido grave. */
  hurt(out, k = 1) {
    const t = this.now;
    this.tone(out, { t, type: 'sine', f: 90, f2: 50, d: 0.18, gain: 0.4 * k });
    this.tone(out, { t: t + 0.02, type: 'sawtooth', f: 180, f2: 140, a: 0.02, d: 0.22, gain: 0.08 * k, filter: 700 });
    this.noise(out, { t, d: 0.1, gain: 0.12 * k, type: 'lowpass', f: 600 });
  }

  land(out, k = 1) {
    this.tone(out, { type: 'sine', f: 95, f2: 45, d: 0.14, gain: 0.35 * k });
    this.noise(out, { d: 0.1, gain: 0.15 * k, type: 'lowpass', f: 900 });
  }

  jump(out) {
    this.noise(out, { a: 0.02, d: 0.12, gain: 0.05, f: 600, f2: 1400, q: 0.8 });
  }

  eat(out) {
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      this.noise(out, { t: t + i * 0.14, d: 0.06, gain: 0.18, f: 2200 + Math.random() * 800, q: 1 });
      this.noise(out, { t: t + i * 0.14 + 0.02, d: 0.05, gain: 0.08, type: 'lowpass', f: 500 });
    }
  }

  drink(out) {
    const t = this.now;
    for (let i = 0; i < 3; i++) this.tone(out, { t: t + i * 0.2, type: 'sine', f: 260 + i * 25, f2: 520 + i * 30, a: 0.01, d: 0.1, gain: 0.16 });
  }

  pickup(out) {
    const t = this.now;
    this.tone(out, { t, type: 'sine', f: 660, f2: 990, d: 0.08, gain: 0.12 });
    this.tone(out, { t: t + 0.05, type: 'triangle', f: 1320, d: 0.08, gain: 0.05 });
  }

  craft(out) {
    const t = this.now;
    this.tone(out, { t, type: 'triangle', f: 880, d: 0.35, gain: 0.08 });
    this.tone(out, { t: t + 0.09, type: 'triangle', f: 1320, d: 0.45, gain: 0.07 });
    this.noise(out, { t, d: 0.05, gain: 0.08, f: 3000, q: 2 });
  }

  click(out) {
    this.tone(out, { type: 'square', f: 1800, d: 0.02, gain: 0.03, filter: 3000 });
  }

  levelUp(out) {
    const t = this.now;
    [523, 659, 784, 1046].forEach((f, i) => this.tone(out, { t: t + i * 0.09, type: 'triangle', f, d: 0.4, gain: 0.08 }));
  }

  breakTool(out) {
    const t = this.now;
    this.noise(out, { t, d: 0.12, gain: 0.3, f: 2600, q: 0.8 });
    this.tone(out, { t, type: 'square', f: 300, f2: 90, d: 0.15, gain: 0.08, filter: 1500 });
  }

  build(out, stone = false) {
    if (stone) this.impact(out, 'stone', 0.8);
    else this.tone(out, { type: 'sine', f: 150, f2: 80, d: 0.16, gain: 0.35 });
    this.noise(out, { d: 0.12, gain: 0.12, type: 'lowpass', f: 1200 });
  }

  door(out, open = true) {
    const t = this.now;
    const o = this.tone(out, { t, type: 'sawtooth', f: open ? 95 : 120, f2: open ? 130 : 85, a: 0.05, d: 0.4, gain: 0.09, filter: 900, q: 6 });
    o.detune.setValueAtTime(0, t);
    o.detune.linearRampToValueAtTime(80, t + 0.3);
    this.tone(out, { t: t + 0.4, type: 'sine', f: 120, f2: 70, d: 0.08, gain: open ? 0.08 : 0.25 });
  }

  /** Escudo: golpe metálico y un zumbido corto. */
  clang(out, k = 1) {
    const t = this.now;
    this.tone(out, { t, type: 'triangle', f: 620, f2: 560, d: 0.35, gain: 0.1 * k });
    this.tone(out, { t, type: 'sine', f: 1470, d: 0.25, gain: 0.05 * k });
    this.noise(out, { t, d: 0.06, gain: 0.25 * k, f: 2800, q: 1 });
    this.tone(out, { t, type: 'sine', f: 120, f2: 60, d: 0.1, gain: 0.25 * k });
  }

  /** Chapuzón al entrar en el agua. */
  splash(out, k = 1) {
    const t = this.now;
    this.noise(out, { t, a: 0.005, d: 0.35, gain: 0.3 * k, f: 900, f2: 3500, q: 0.8 });
    this.noise(out, { t: t + 0.08, a: 0.02, d: 0.4, gain: 0.12 * k, type: 'highpass', f: 2500 });
    for (let i = 0; i < 4; i++) {
      const f = 500 + Math.random() * 900;
      this.tone(out, { t: t + 0.1 + Math.random() * 0.3, f, f2: f * 1.8, a: 0.003, d: 0.06, gain: 0.05 * k });
    }
  }

  /** Burbujas (bucear). */
  bubbles(out, k = 1) {
    const t = this.now;
    for (let i = 0; i < 3; i++) {
      const f = 300 + Math.random() * 500;
      this.tone(out, { t: t + i * 0.07 + Math.random() * 0.05, f, f2: f * 2.2, a: 0.004, d: 0.05, gain: 0.06 * k });
    }
  }

  /** Siseo (compuerta de la nave, cristal al rojo). */
  hiss(out, dur = 0.8, k = 1) {
    this.noise(out, { a: 0.03, d: dur, gain: 0.15 * k, type: 'highpass', f: 2500, f2: 5000 });
  }

  /** Pisada pesada (gólems). */
  thud(out, k = 1) {
    const t = this.now;
    this.tone(out, { t, f: 70 * (0.9 + Math.random() * 0.2), f2: 32, d: 0.3, gain: 0.5 * k });
    this.noise(out, { color: 'brown', t, d: 0.3, gain: 0.35 * k, type: 'lowpass', f: 300 });
    this.noise(out, { t: t + 0.02, d: 0.08, gain: 0.06 * k, f: 1800, q: 0.7 });
  }

  /** Rocas que se desmoronan (muere un gólem, se rompe una pieza de piedra). */
  crumble(out, k = 1) {
    const t = this.now;
    this.noise(out, { color: 'brown', t, a: 0.02, d: 0.9, gain: 0.5 * k, type: 'lowpass', f: 500, f2: 120 });
    for (let i = 0; i < 7; i++) {
      this.tone(out, { t: t + Math.random() * 0.6, type: 'triangle', f: 300 + Math.random() * 900, f2: 120, d: 0.08, gain: 0.07 * k });
      this.noise(out, { t: t + Math.random() * 0.6, d: 0.05, gain: 0.1 * k, f: 2000 + Math.random() * 2000, q: 1 });
    }
  }

  /** Madera que se rompe (una pieza construida, una puerta). */
  splinter(out, k = 1) {
    const t = this.now;
    for (let i = 0; i < 5; i++) this.noise(out, { t: t + i * 0.035 + Math.random() * 0.03, d: 0.05, gain: 0.2 * k, f: 1200 + Math.random() * 1500, q: 2 });
    this.tone(out, { t, f: 160, f2: 70, d: 0.2, gain: 0.3 * k });
  }

  /** Árbol que cae: crujido largo y golpe contra el suelo. */
  treeFall(out, k = 1) {
    const t = this.now;
    const o = this.tone(out, { t, type: 'sawtooth', f: 70, f2: 45, a: 0.3, d: 1.1, gain: 0.06 * k, filter: 500, q: 6 });
    o.detune.setValueAtTime(0, t);
    o.detune.linearRampToValueAtTime(300, t + 1.2);
    for (let i = 0; i < 6; i++) this.noise(out, { t: t + 0.1 + i * 0.16, d: 0.05, gain: 0.1 * k, f: 900 + Math.random() * 800, q: 3 });
    this.tone(out, { t: t + 1.4, f: 60, f2: 30, d: 0.5, gain: 0.55 * k });
    this.noise(out, { color: 'brown', t: t + 1.4, d: 0.6, gain: 0.5 * k, type: 'lowpass', f: 600 });
    this.noise(out, { t: t + 1.45, a: 0.05, d: 0.8, gain: 0.12 * k, type: 'highpass', f: 2000 }); // hojas
  }

  // ---- Criaturas ---------------------------------------------------------------------

  golem(out, k = 1) {
    const t = this.now;
    this.noise(out, { color: 'brown', t, a: 0.1, d: 0.7, gain: 0.5 * k, type: 'lowpass', f: 180, q: 0.8 });
    this.tone(out, { t, type: 'sine', f: 52, f2: 38, a: 0.08, d: 0.7, gain: 0.25 * k });
  }

  goblin(out, k = 1) {
    const t = this.now;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const f = 380 + Math.random() * 260;
      const o = this.tone(out, { t: t + i * 0.09, type: 'square', f, f2: f * (0.7 + Math.random() * 0.6), a: 0.01, d: 0.08, gain: 0.1 * k, filter: 1800, q: 3 });
      o.detune.value = Math.random() * 100;
    }
  }

  /** Chillido agudo (goblin herido o derrotado). */
  squeal(out, k = 1) {
    const f = 700 + Math.random() * 300;
    this.tone(out, { type: 'square', f, f2: f * 0.45, a: 0.01, d: 0.35, gain: 0.06 * k, filter: 2200, q: 4 });
  }

  /** Slime que revienta. */
  pop(out, k = 1) {
    this.noise(out, { color: 'pink', a: 0.005, d: 0.18, gain: 0.35 * k, type: 'lowpass', f: 2000, f2: 200, q: 6 });
    this.tone(out, { f: 220, f2: 600, a: 0.003, d: 0.08, gain: 0.12 * k });
  }

  slime(out, k = 1) {
    this.noise(out, { color: 'pink', a: 0.02, d: 0.25, gain: 0.25 * k, type: 'lowpass', f: 300, f2: 1400, q: 8 });
  }

  moo(out, k = 1) {
    const t = this.now;
    this.tone(out, { t, type: 'sawtooth', f: 120, f2: 95, a: 0.12, d: 0.9, gain: 0.12 * k, filter: 600, q: 4 });
    this.tone(out, { t, type: 'sawtooth', f: 121.5, f2: 96, a: 0.12, d: 0.9, gain: 0.06 * k, filter: 900, q: 2 });
  }

  bleat(out, k = 1, high = 1) {
    const t = this.now;
    const o = this.tone(out, { t, type: 'sawtooth', f: 330 * high, f2: 300 * high, a: 0.03, d: 0.45, gain: 0.11 * k, filter: 1400, q: 3 });
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 22;
    const lg = this.ctx.createGain();
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.5);
  }

  // ---- Jefe --------------------------------------------------------------------------

  boom(out, k = 1) {
    const t = this.now;
    this.tone(out, { t, type: 'sine', f: 70, f2: 28, d: 0.9, gain: 0.7 * k });
    this.noise(out, { color: 'brown', t, d: 1.0, gain: 0.6 * k, type: 'lowpass', f: 400, f2: 80 });
    this.noise(out, { t, d: 0.2, gain: 0.2 * k, f: 1500, q: 0.5 });
  }

  charge(out, dur = 1.5) {
    const t = this.now;
    this.tone(out, { t, type: 'sawtooth', f: 110, f2: 880, a: dur * 0.9, d: 0.15, gain: 0.08, filter: 2500, q: 4 });
    this.tone(out, { t, type: 'sine', f: 220, f2: 1760, a: dur * 0.9, d: 0.15, gain: 0.06 });
  }

  shatter(out) {
    const t = this.now;
    for (let i = 0; i < 14; i++) this.tone(out, { t: t + Math.random() * 0.25, type: 'sine', f: 1800 + Math.random() * 3500, d: 0.3 + Math.random() * 0.6, gain: 0.04 });
    this.noise(out, { t, d: 0.5, gain: 0.3, type: 'highpass', f: 3000 });
  }

  roar(out) {
    const t = this.now;
    this.tone(out, { t, type: 'sawtooth', f: 65, f2: 48, a: 0.2, d: 1.8, gain: 0.25, filter: 500, q: 2 });
    this.tone(out, { t, type: 'sawtooth', f: 98, f2: 72, a: 0.2, d: 1.8, gain: 0.12, filter: 700, q: 2 });
    this.noise(out, { color: 'brown', t, a: 0.3, d: 1.6, gain: 0.5, type: 'lowpass', f: 300 });
  }

  // ---- Ambiente puntual ---------------------------------------------------------------

  chirp(out) {
    const t = this.now;
    const base = 2600 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + Math.random() * 0.4);
      this.tone(out, { t: t + i * (0.07 + Math.random() * 0.05), type: 'sine', f, f2: f * (Math.random() < 0.5 ? 1.3 : 0.75), a: 0.005, d: 0.05, gain: 0.075 });
    }
  }

  cricket(out) {
    const t = this.now;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this.tone(out, { t: t + i * 0.045, type: 'sine', f, a: 0.003, d: 0.025, gain: 0.045 });
  }

  /** Búho: dos ululatos. */
  owl(out) {
    const t = this.now;
    const f = 360 + Math.random() * 40;
    this.tone(out, { t, f, f2: f * 0.92, a: 0.05, d: 0.35, gain: 0.08 });
    this.tone(out, { t: t + 0.55, f: f * 1.02, f2: f * 0.9, a: 0.06, d: 0.6, gain: 0.08 });
  }

  drip(out) {
    const f = 1100 + Math.random() * 1200;
    this.tone(out, { type: 'sine', f, f2: f * 1.6, a: 0.002, d: 0.12, gain: 0.07 });
  }

  thunder(out, k = 1) {
    const t = this.now;
    this.noise(out, { color: 'brown', t, a: 0.05, d: 2.8, gain: 0.8 * k, type: 'lowpass', f: 600, f2: 60 });
    this.noise(out, { color: 'brown', t: t + 0.3, a: 0.4, d: 2.2, gain: 0.4 * k, type: 'lowpass', f: 250 });
  }
}

/** Dos segundos de ruido blanco, rosa o marrón (para bucles y golpes). */
function makeNoise(ctx, color) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else d[i] = w;
  }
  return buf;
}
