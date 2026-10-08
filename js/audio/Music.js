import { mtof } from './AudioMath.js';

/**
 * Music — música generativa: acordes, bajo, melodía y ritmo se crean al vuelo (nunca
 * suena igual dos veces). Cada "estado de ánimo" tiene su tempo, sus acordes y su escala:
 *
 *   DAY    Fa mayor pentatónico, cálido (Fmaj7 · C · Dm · Bb), punteos
 *   NIGHT  La menor (Am · F · C · G), pad oscuro y campanas sueltas
 *   CAVE   zumbido grave y campanas con eco
 *   BOSS   Re menor a 132 ppm (Dm · Bb · C · A): bombo, caja, charles, bajo y arpegio
 *   SPACE  Do lidio, pad de cristal y destellos (también en el menú de inicio)
 *
 * Fuera de la pelea y del espacio, la música toca a ratos (frases de ~1 min) y descansa.
 * Al cambiar de ánimo, lo anterior se apaga poco a poco y lo nuevo entra suave.
 * Programa las notas con un poco de antelación sobre el reloj del AudioContext.
 */
export const MOODS = {
  DAY: {
    bpm: 78,
    // [bajo, voces…]
    chords: [[41, 57, 60, 64, 69], [36, 55, 60, 64, 67], [38, 57, 62, 65, 69], [34, 53, 58, 62, 65]],
    scale: [65, 67, 69, 72, 74, 77, 79, 81],
    bars: 2,
    pad: { type: 'triangle', cutoff: 1500, gain: 0.028 },
    lead: 'pluck',
    density: 0.3,
    swing: 0.06,
    play: [50, 80],
    rest: [18, 40],
    echo: 0.22,
  },
  NIGHT: {
    bpm: 58,
    chords: [[33, 57, 60, 64], [29, 57, 60, 65], [36, 55, 60, 64], [31, 55, 59, 62]],
    scale: [69, 72, 74, 76, 79, 81, 84],
    bars: 2,
    pad: { type: 'sawtooth', cutoff: 620, gain: 0.026 },
    lead: 'bell',
    density: 0.13,
    play: [50, 80],
    rest: [22, 45],
    echo: 0.35,
  },
  CAVE: {
    bpm: 48,
    drone: [38, 45, 50],
    scale: [62, 63, 67, 69, 70, 74],
    bars: 4,
    lead: 'bell',
    density: 0.09,
    play: [40, 70],
    rest: [15, 35],
    echo: 0.5,
  },
  BOSS: {
    bpm: 132,
    chords: [[38, 62, 65, 69], [34, 62, 65, 70], [36, 60, 64, 67], [33, 61, 64, 69]],
    scale: [62, 64, 65, 67, 69, 70, 72, 74],
    bars: 1,
    pad: { type: 'sawtooth', cutoff: 1000, gain: 0.012 },
    lead: 'arp',
    drums: true,
    bass: true,
    continuous: true,
    echo: 0.12,
  },
  SPACE: {
    bpm: 52,
    chords: [[36, 55, 62, 66, 71], [38, 57, 62, 66, 69], [31, 55, 59, 62, 66], [40, 55, 59, 64, 71]],
    scale: [74, 76, 78, 79, 81, 83, 86],
    bars: 2,
    pad: { type: 'sine', cutoff: 2600, gain: 0.016 },
    lead: 'twinkle',
    density: 0.12,
    continuous: true,
    echo: 0.45,
  },
};

const BAR = 8; // corcheas por compás
const rand = ([a, b]) => a + Math.random() * (b - a);

export class Music {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} out bus de música
   * @param {import('./Synth.js').Synth} synth (sus ruidos y su `tone`/`noise`)
   */
  constructor(ctx, out, synth) {
    this.ctx = ctx;
    this.out = out;
    this.synth = synth;
    this.mood = null;
    this._voice = null;
    // Eco compartido: retardo con realimentación filtrada.
    this._echoIn = ctx.createGain();
    this._echo = ctx.createDelay(2);
    this._echo.delayTime.value = 0.5;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    this._echoIn.connect(this._echo).connect(lp).connect(fb).connect(this._echo);
    lp.connect(out);
  }

  /** Cambia el estado de ánimo (null = silencio). */
  setMood(id) {
    if (id === this.mood) return;
    const c = this.ctx;
    const t = c.currentTime;
    const old = this._voice;
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, 0.9);
      setTimeout(() => old.gain.disconnect(), 6000);
    }
    this.mood = id;
    const def = MOODS[id];
    if (!def) {
      this._voice = null;
      return;
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + (def.continuous ? 1.5 : 3));
    g.connect(this.out);
    const send = c.createGain();
    send.gain.value = def.echo ?? 0.2;
    g.connect(send).connect(this._echoIn);
    this._echo.delayTime.setTargetAtTime((60 / def.bpm) * 0.75, t, 0.2); // corchea con puntillo
    this._voice = {
      def, gain: g, step: 0, chordIdx: 0, chord: null, note: Math.floor(def.scale.length / 2),
      next: t + (def.continuous ? 0.4 : 2.5), until: t + rand(def.play ?? [60, 60]), resting: false, restUntil: 0,
    };
  }

  update() {
    const v = this._voice;
    if (!v) return;
    const now = this.ctx.currentTime;
    if (v.next < now - 0.4) v.next = now + 0.05; // la pestaña estuvo parada: no ponerse al día de golpe
    const sd = 60 / v.def.bpm / 2;
    while (v.next < now + 0.3) {
      this._step(v, v.next, sd);
      v.next += sd;
      v.step++;
    }
  }

  _step(v, t, sd) {
    const def = v.def;
    const cycle = BAR * def.bars;
    const pos = v.step % cycle;
    // Frases y descansos (la música no suena todo el rato).
    if (!def.continuous) {
      if (v.resting) {
        if (t < v.restUntil || pos) return;
        v.resting = false;
        v.until = t + rand(def.play);
        v.chordIdx = 0;
      } else if (pos === 0 && t > v.until) {
        v.resting = true;
        v.restUntil = t + rand(def.rest);
        return;
      }
    }
    if (pos === 0) {
      const ch = def.chords?.[v.chordIdx++ % def.chords.length] ?? null;
      v.chord = ch;
      const len = cycle * sd;
      if (def.drone) this._pad(v, def.drone, t, len, { type: 'sine', cutoff: 420, gain: 0.022, attack: 4, release: 4 });
      if (ch && def.pad) this._pad(v, ch.slice(1), t, len, def.pad);
      if (ch && !def.bass) this._softBass(v, ch[0], t, len);
      if (ch && def.lead === 'arp') this._stab(v, ch.slice(1), t);
    }
    if (def.drums) this._drums(v, pos, t);
    if (def.bass && v.chord) this._bass(v, v.chord[0], pos, t, sd);
    if (def.lead === 'arp' && v.chord) {
      const tones = v.chord.slice(1);
      const m = tones[(pos * 2 + (pos > 3 ? 1 : 0)) % tones.length] + 12;
      this.synth.tone(v.gain, { t, type: 'sawtooth', f: mtof(m), a: 0.004, d: sd * 0.8, gain: 0.03, filter: 1900, q: 2 });
    } else if (def.density) {
      const strong = pos % 2 === 0;
      if (Math.random() < def.density * (strong ? 1.35 : 0.55)) {
        const swing = strong ? 0 : (def.swing ?? 0) * sd * 2;
        this._lead(v, this._nextNote(v), t + swing);
      }
    }
  }

  /** Paseo por la escala; a veces cae en una nota del acorde. */
  _nextNote(v) {
    const sc = v.def.scale;
    const r = Math.random();
    const move = r < 0.3 ? -1 : r < 0.6 ? 1 : r < 0.75 ? -2 : r < 0.9 ? 2 : 0;
    v.note = Math.max(0, Math.min(sc.length - 1, v.note + move));
    let m = sc[v.note];
    if (v.chord && Math.random() < 0.35) {
      const pcs = v.chord.slice(1).map((n) => n % 12);
      for (let d = 0; d <= 2; d++) {
        if (pcs.includes((m + d) % 12)) { m += d; break; }
        if (pcs.includes((m - d + 12) % 12)) { m -= d; break; }
      }
    }
    return m;
  }

  _lead(v, m, t) {
    const s = this.synth;
    const f = mtof(m);
    const out = v.gain;
    switch (v.def.lead) {
      case 'bell':
        s.tone(out, { t, f, a: 0.003, d: 2.2, gain: 0.045 });
        s.tone(out, { t, f: f * 2.76, a: 0.002, d: 0.8, gain: 0.012 });
        s.tone(out, { t, f: f * 5.4, a: 0.002, d: 0.25, gain: 0.005 });
        break;
      case 'twinkle':
        s.tone(out, { t, f: f * 2, a: 0.01, d: 1.6, gain: 0.022 });
        s.tone(out, { t, type: 'triangle', f: f * 3, a: 0.005, d: 0.5, gain: 0.006 });
        break;
      default: // punteo
        s.tone(out, { t, type: 'triangle', f, a: 0.004, d: 0.9, gain: 0.06, filter: 2600 });
        s.tone(out, { t, f: f * 2, a: 0.003, d: 0.3, gain: 0.014 });
    }
  }

  /** Acorde sostenido (dos osciladores por nota, un poco desafinados). */
  _pad(v, notes, t, dur, { type = 'triangle', cutoff = 1200, gain = 0.03, attack = null, release = null }) {
    const c = this.ctx;
    const a = attack ?? Math.min(1.6, dur * 0.3);
    const rel = release ?? Math.min(2.5, dur * 0.4);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, t + Math.max(a, dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a, dur) + rel);
    f.connect(g).connect(v.gain);
    for (const m of notes) {
      for (const det of [-7, 7]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + Math.max(a, dur) + rel + 0.1);
      }
    }
  }

  _softBass(v, m, t, dur) {
    const s = this.synth;
    s.tone(v.gain, { t, f: mtof(m), a: 0.25, d: dur, gain: 0.06 });
    s.tone(v.gain, { t, type: 'triangle', f: mtof(m + 12), a: 0.2, d: dur * 0.6, gain: 0.018 });
  }

  _bass(v, m, pos, t, sd) {
    this.synth.tone(v.gain, { t, type: 'sawtooth', f: mtof(pos % 2 ? m + 12 : m), a: 0.005, d: sd * 0.9, gain: 0.07, filter: 520, q: 3 });
  }

  _stab(v, notes, t) {
    for (const m of notes) this.synth.tone(v.gain, { t, type: 'sawtooth', f: mtof(m), f2: mtof(m) * 0.995, a: 0.006, d: 0.32, gain: 0.025, filter: 2400, q: 1.5 });
  }

  _drums(v, pos, t) {
    const s = this.synth;
    const out = v.gain;
    if (pos === 0 || pos === 4 || (pos === 7 && Math.random() < 0.5)) s.tone(out, { t, f: 140, f2: 42, a: 0.002, d: 0.22, gain: 0.3 });
    if (pos === 2 || pos === 6) {
      s.noise(out, { t, d: 0.13, gain: 0.16, f: 1900, q: 0.8 });
      s.tone(out, { t, type: 'triangle', f: 190, f2: 150, d: 0.07, gain: 0.07 });
    }
    s.noise(out, { t, d: pos % 2 ? 0.05 : 0.03, gain: pos % 2 ? 0.05 : 0.03, type: 'highpass', f: 7500 });
  }
}
