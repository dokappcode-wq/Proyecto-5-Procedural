import { GameEvents } from '../core/GameEvents.js';
import { SHAPES } from '../construction/BuildRules.js';
import { Synth } from './Synth.js';
import { Music } from './Music.js';
import { parseVolumes, surfaceFor, strideLength, spatialize, chooseMood, VOLUME_KEYS } from './AudioMath.js';

/**
 * AudioSystem — todo el sonido del juego, generado con WebAudio (sin archivos de audio).
 *
 * - Efectos: pasos según el suelo (hierba, piedra, nieve, arena, madera, metal, agua),
 *   golpes (madera, piedra, carne), armas, comer y beber, fabricar, construir, puertas,
 *   daño, caídas, criaturas (gólems, goblins, slimes, vacas, cabras, ciervos) y el jefe.
 *   Los que suenan en el mundo son posicionales: panorama y volumen según la distancia.
 * - Ambiente: viento (más fuerte en lo alto y en la nieve), agua cercana (mar, ríos,
 *   charcas), cascadas de la sala del gólem, eco y goteo en las cuevas, pájaros de día,
 *   grillos y búhos de noche. Lluvia preparada (setWeather) para el clima.
 * - Música generativa (Music.js) según el sitio: día, noche, cueva, jefe, espacio.
 * - Bucear apaga los agudos; en las cuevas hay eco.
 *
 * El AudioContext se crea con el primer clic o tecla (los navegadores lo exigen).
 * Volúmenes: localStorage 'mundo0.audio' (JSON pequeño validado). N: silenciar.
 */
const STORE_KEY = 'mundo0.audio';
const ENV_INTERVAL = 0.5; // s entre muestreos del entorno (agua, cueva, bioma…)
const WATER_RINGS = [[0, 1], [5, 1], [11, 0.55], [18, 0.3]]; // [radio, peso]
const WATER_DIRS = 10;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class AudioSystem {
  constructor({ events, input = null, player, camera, worlds, homeId, construction = null, ship = null, enemies = null, animals = null, time = null, story2 = null, items = {}, waterfalls = () => [] }) {
    this.name = 'audio';
    this._events = events;
    this._input = input;
    this._player = player;
    this._camera = camera;
    this._worlds = worlds;
    this._homeId = homeId;
    this._construction = construction;
    this._ship = ship;
    this._enemies = enemies;
    this._animals = animals;
    this._time = time;
    this._story2 = story2;
    this._items = items;
    this._waterfalls = waterfalls;
    this.volumes = parseVolumes(readStore());
    this.ctx = null;

    this._listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
    this._env = { fire: 0, fireX: 0, fireZ: 0, cave: false, water: 0, sea: 0, falls: 0, altitude: 0, snow: false, breathable: true, biome: '', aboard: false, outdoors: true };
    this._weather = { rain: 0, wind: 0 };
    this._envT = 0;
    this._last = null;     // última posición (pasos)
    this._stride = 0;
    this._started = false; // ya se ha empezado a jugar (antes: menú de inicio)
    this._space = 'SURFACE';
    this._dead = false;
    this._swimming = false;
    this._underwater = false;
    this._shipT = null;    // última telemetría de la nave
    this._hotbarIdx = null;
    this._throttle = new Map();
    this._t = { bird: 3, cricket: 1, owl: 25, drip: 2, creature: 1, bubble: 1, golemStep: new Map(), bossStep: 0 };

    if (typeof window !== 'undefined') {
      const unlock = () => this._unlock();
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
      // Pestaña oculta: el sonido se pausa (el juego también).
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend().catch(() => {});
        else this.ctx.resume().catch(() => {});
      });
    }
    this._bind();
  }

  // ---- Volumen ---------------------------------------------------------------------

  get muted() {
    return this.volumes.muted;
  }

  setVolume(kind, value) {
    if (!VOLUME_KEYS.includes(kind)) return;
    this.volumes[kind] = clamp01(Number(value) || 0);
    this._applyVolumes();
    this._save();
  }

  setMuted(muted) {
    this.volumes.muted = !!muted;
    this._applyVolumes();
    this._save();
  }

  toggleMute() {
    this.setMuted(!this.volumes.muted);
    this._events.emit(GameEvents.UI_MESSAGE, { text: this.volumes.muted ? '🔇 Sonido desactivado (N)' : '🔊 Sonido activado (N)', type: 'info' });
  }

  /** Clima (P7): lluvia y viento extra, 0…1. */
  setWeather({ rain = 0, wind = 0 } = {}) {
    this._weather.rain = clamp01(rain);
    this._weather.wind = clamp01(wind);
  }

  _save() {
    try {
      const { master, sfx, ambient, music, muted } = this.volumes;
      localStorage.setItem(STORE_KEY, JSON.stringify({ master, sfx, ambient, music, muted }));
    } catch {
      /* almacenamiento no disponible: no pasa nada */
    }
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const v = this.volumes;
    const t = this.ctx.currentTime;
    this._master.gain.setTargetAtTime(v.muted ? 0 : v.master, t, 0.05);
    this._sfx.gain.setTargetAtTime(v.sfx, t, 0.05);
    this._amb.gain.setTargetAtTime(v.ambient, t, 0.05);
    this._mus.gain.setTargetAtTime(v.music * 0.8, t, 0.05);
  }

  // ---- Puesta en marcha ------------------------------------------------------------

  _unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    this._build();
  }

  _build() {
    const c = this.ctx;
    this.synth = new Synth(c);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    comp.connect(c.destination);
    this._master = c.createGain();
    this._master.connect(comp);
    // Bucear: sin agudos (efectos y ambiente; la música no).
    this._muffle = c.createBiquadFilter();
    this._muffle.type = 'lowpass';
    this._muffle.frequency.value = 20000;
    this._muffle.connect(this._master);
    this._sfx = c.createGain();
    this._sfx.connect(this._muffle);
    this._amb = c.createGain();
    this._amb.connect(this._muffle);
    this._mus = c.createGain();
    this._mus.connect(this._master);
    // Eco de cueva: dos retardos con realimentación, solo dentro de las cuevas.
    this._caveSend = c.createGain();
    this._caveSend.gain.value = 0;
    this._sfx.connect(this._caveSend);
    const verbOut = c.createBiquadFilter();
    verbOut.type = 'lowpass';
    verbOut.frequency.value = 2400;
    verbOut.connect(this._muffle);
    for (const [time, fb] of [[0.11, 0.42], [0.19, 0.38]]) {
      const d = c.createDelay(1);
      d.delayTime.value = time;
      const g = c.createGain();
      g.gain.value = fb;
      this._caveSend.connect(d);
      d.connect(g).connect(d);
      d.connect(verbOut);
    }
    this._applyVolumes();

    // Bucles de ambiente (siempre en marcha; su volumen sube y baja).
    const S = this.synth;
    this._loops = {
      wind: this._loop(S.pink, { type: 'bandpass', f: 500, q: 0.7, lfo: [0.07, 300] }),
      gust: this._loop(S.white, { type: 'highpass', f: 2800, q: 0.5, lfo: [0.13, 900] }),
      water: this._loop(S.pink, { type: 'lowpass', f: 900, q: 0.4, lfo: [0.11, 250] }),
      sea: this._loop(S.brown, { type: 'lowpass', f: 700, q: 0.3, amp: [0.09, 0.8] }),
      falls: this._loop(S.white, { type: 'lowpass', f: 1600, q: 0.3 }),
      cave: this._loop(S.brown, { type: 'lowpass', f: 160, q: 0.8 }),
      rain: this._loop(S.white, { type: 'bandpass', f: 4200, q: 0.4 }),
      fire: this._loop(S.brown, { type: 'lowpass', f: 700, q: 0.6, amp: [0.7, 0.5] }),
    };
    this._engine = this._engineLoop();
    this._laser = this._laserLoop();
    this.music = new Music(c, this._mus, this.synth);
  }

  /** Ruido en bucle → filtro (con LFO opcional) → volumen (con trémolo opcional) → ambiente. */
  _loop(buffer, { type, f, q = 1, lfo = null, amp = null }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    let out = g;
    if (lfo) {
      const o = c.createOscillator();
      o.frequency.value = lfo[0];
      const d = c.createGain();
      d.gain.value = lfo[1];
      o.connect(d).connect(fl.frequency);
      o.start();
    }
    if (amp) {
      // Olas: el volumen sube y baja despacio.
      const trem = c.createGain();
      trem.gain.value = 1 - amp[1] / 2;
      const o = c.createOscillator();
      o.frequency.value = amp[0];
      const d = c.createGain();
      d.gain.value = amp[1] / 2;
      o.connect(d).connect(trem.gain);
      o.start();
      g.connect(trem);
      out = trem;
    }
    const pan = c.createStereoPanner();
    src.connect(fl).connect(g);
    out.connect(pan).connect(this._amb);
    src.start(0, Math.random() * 1.5);
    return { gain: g, filter: fl, pan };
  }

  /** Motor de la nave: zumbido grave y ruido sordo. */
  _engineLoop() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const pan = c.createStereoPanner();
    g.connect(pan).connect(this._sfx);
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = 320;
    fl.Q.value = 2;
    fl.connect(g);
    const oscs = [46, 92.6, 139].map((f, i) => {
      const o = c.createOscillator();
      o.type = i ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      const og = c.createGain();
      og.gain.value = i ? 0.25 : 0.6;
      o.connect(og).connect(fl);
      o.start();
      return o;
    });
    const src = c.createBufferSource();
    src.buffer = this.synth.brown;
    src.loop = true;
    const ng = c.createGain();
    ng.gain.value = 1.4;
    src.connect(ng).connect(fl);
    src.start();
    return { gain: g, filter: fl, pan, oscs };
  }

  /** Láser del cristal: zumbido eléctrico con trémolo rápido. */
  _laserLoop() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0;
    const pan = c.createStereoPanner();
    g.connect(pan).connect(this._sfx);
    const trem = c.createGain();
    trem.gain.value = 0.7;
    const lfo = c.createOscillator();
    lfo.frequency.value = 17;
    const ld = c.createGain();
    ld.gain.value = 0.3;
    lfo.connect(ld).connect(trem.gain);
    lfo.start();
    const fl = c.createBiquadFilter();
    fl.type = 'bandpass';
    fl.frequency.value = 1100;
    fl.Q.value = 2.5;
    fl.connect(trem).connect(g);
    for (const [type, f] of [['sawtooth', 110], ['square', 220.7], ['sawtooth', 331]]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.connect(fl);
      o.start();
    }
    return { gain: g, pan };
  }

  // ---- Reproducir --------------------------------------------------------------------

  get ready() {
    return !!this.ctx && !this.volumes.muted && this.ctx.state === 'running';
  }

  /** Nodo de salida para un sonido en (x, z): panorama y volumen por distancia (o null si no se oye). */
  _at(x, z, { ref = 7, max = 55, k = 1 } = {}) {
    const L = this._listener;
    const sp = spatialize(x - L.x, z - L.z, L.fx, L.fz, { ref, max });
    const gain = sp.gain * k;
    if (gain < 0.008) return null;
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    const p = c.createStereoPanner();
    p.pan.value = sp.pan;
    g.connect(p).connect(this._sfx);
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
    }, 6000);
    return g;
  }

  /** Sonido del propio jugador (sin posición). */
  play(fn) {
    if (!this.ready) return;
    fn(this.synth, this._sfx);
  }

  /** Sonido en un punto del mundo. */
  playAt(x, z, fn, opts) {
    if (!this.ready) return;
    const out = this._at(x, z, opts);
    if (out) fn(this.synth, out);
  }

  /** No repetir el mismo sonido más de una vez cada `gap` s. */
  _once(key, gap) {
    const now = performance.now();
    if (now - (this._throttle.get(key) ?? -1e9) < gap * 1000) return false;
    this._throttle.set(key, now);
    return true;
  }

  // ---- Eventos ---------------------------------------------------------------------

  _bind() {
    const E = GameEvents;
    const on = (ev, fn) => this._events.on(ev, (d) => {
      if (this.ready) fn(d ?? {});
    });
    // Siempre (aunque no haya sonido): estado que se usa después.
    this._events.on(E.GAME_STARTED, () => (this._started = true));
    this._events.on(E.SPACE_STATE_CHANGED, ({ state }) => (this._space = state));
    this._events.on(E.PLAYER_DIED, () => (this._dead = true));
    this._events.on(E.PLAYER_RESPAWNED, () => (this._dead = false));
    this._events.on(E.SHIP_STATE_CHANGED, (t) => {
      const prev = this._shipT;
      this._shipT = t;
      if (this.ready && prev && prev.hatch !== t.hatch) this._shipSound((S, o) => {
        S.hiss(o, 1.1, 1);
        S.tone(o, { type: 'sawtooth', f: 70, f2: 95, a: 0.2, d: 1.2, gain: 0.05, filter: 400 });
      });
      if (this.ready && prev && prev.legs !== t.legs) this._shipSound((S, o) => S.tone(o, { type: 'sawtooth', f: 60, f2: 80, a: 0.1, d: 0.9, gain: 0.05, filter: 300 }));
    });
    this._events.on(E.PLAYER_SWIM_CHANGED, ({ swimming, underwater }) => {
      const wasSwimming = this._swimming;
      this._swimming = !!swimming;
      this._underwater = !!underwater;
      if (this.ctx) this._muffle.frequency.setTargetAtTime(underwater ? 650 : 20000, this.ctx.currentTime, 0.08);
      if (this.ready && swimming && !wasSwimming) this.play((S, o) => S.splash(o, 1));
    });

    on(E.PLAYER_ACTION, ({ kind, weapon }) => {
      if (kind === 'chop' || kind === 'hit' || kind === 'miss') this.play((S, o) => S.whoosh(o, kind === 'miss' ? 0.8 : 0.6));
      else if (kind === 'harvest') this.play((S, o) => S.noise(o, { a: 0.02, d: 0.22, gain: 0.14, type: 'lowpass', f: 1600, q: 0.6 }));
      else if (kind === 'shoot') this.play((S, o) => (String(weapon).includes('BOW') ? S.bowRelease(o) : S.slingRelease(o)));
      else if (kind === 'block') this.play((S, o) => S.noise(o, { a: 0.03, d: 0.12, gain: 0.07, type: 'lowpass', f: 900 }));
      else if (kind === 'land') this.play((S, o) => S.land(o, 0.7));
    });
    on(E.PLAYER_DODGED, () => this.play((S, o) => S.whoosh(o, 1.2)));
    on(E.PLAYER_JUMPED, () => this.play((S, o) => S.jump(o)));
    on(E.PLAYER_LANDED, ({ fallSpeed = 0 }) => {
      if (fallSpeed < 3.5) return;
      const k = Math.min(1.3, 0.35 + (fallSpeed - 3.5) / 9);
      this.play((S, o) => {
        S.land(o, k);
        S.step(o, this._surface(), 1);
      });
      this._stride = 0;
    });
    on(E.PLAYER_DAMAGED, ({ amount = 0, source }) => {
      if (source === 'COLD' || source === 'SUFFOCATION' || source === 'DECOMPRESSION') {
        if (this._once('hurtSoft', 1.5)) this.play((S, o) => S.hurt(o, 0.45));
        return;
      }
      if (amount <= 0 || !this._once('hurt', 0.2)) return;
      this.play((S, o) => S.hurt(o, Math.min(1.3, 0.5 + amount / 20)));
    });
    on(E.PLAYER_BLOCKED, () => this.play((S, o) => S.clang(o, 1)));
    on(E.PLAYER_DIED, () => this.play((S, o) => {
      S.hurt(o, 1.3);
      S.tone(o, { t: S.now + 0.2, type: 'sine', f: 110, f2: 55, a: 0.3, d: 2.5, gain: 0.12 });
    }));
    on(E.FOOD_EATEN, () => this.play((S, o) => S.eat(o)));
    on(E.PLAYER_DRANK, () => this.play((S, o) => S.drink(o)));
    on(E.ITEM_REPAIRED, () => this.play((S, o) => {
      S.clang(o, 0.7);
      S.clang(o, 0.5);
    }));
    on(E.ITEM_CRAFTED, () => this._once('craft', 0.1) && this.play((S, o) => S.craft(o)));
    on(E.PICKUP_TAKEN, () => this._once('pickup', 0.06) && this.play((S, o) => S.pickup(o)));
    on(E.RESOURCE_HARVESTED, () => this._once('pickup', 0.06) && this.play((S, o) => S.pickup(o)));
    on(E.PLAYER_LEVEL_UP, () => this.play((S, o) => S.levelUp(o)));
    on(E.TOOL_BROKEN, () => this.play((S, o) => S.breakTool(o)));
    on(E.UI_PANEL_TOGGLED, () => this._once('click', 0.05) && this.play((S, o) => S.click(o)));
    on(E.CRAFTING_PANEL_TOGGLED, () => this._once('click', 0.05) && this.play((S, o) => S.click(o)));
    on(E.BUILD_MODE_CHANGED, () => this._once('click', 0.05) && this.play((S, o) => S.click(o)));
    on(E.HOTBAR_CHANGED, ({ selectedIndex }) => {
      if (selectedIndex === this._hotbarIdx) return;
      const first = this._hotbarIdx === null;
      this._hotbarIdx = selectedIndex;
      if (!first) this.play((S, o) => S.tone(o, { type: 'triangle', f: 1300, d: 0.03, gain: 0.025 }));
    });

    on(E.RESOURCE_HIT, ({ x, z, material, felled, small }) => {
      const mat = material === 'stone' ? 'stone' : material === 'web' ? 'web' : 'wood';
      this.playAt(x, z, (S, o) => {
        if (mat === 'web') S.noise(o, { a: 0.01, d: 0.15, gain: 0.12, type: 'highpass', f: 2000 });
        else S.impact(o, mat, small ? 0.6 : 1);
        if (felled && mat === 'wood') S.treeFall(o, 1);
        else if (felled && mat === 'stone') S.crumble(o, 0.7);
      });
    });
    on(E.ANIMAL_HIT, ({ animal, killed, enemy }) => {
      if (!animal) return;
      const ax = animal.x;
      const az = animal.z;
      if (enemy) {
        const type = animal.type;
        this.playAt(ax, az, (S, o) => {
          if (type === 'GOLEM') S.impact(o, 'stone', 1);
          else if (type === 'SLIME') S.slime(o, 1);
          else {
            S.impact(o, 'flesh', 1);
            if (!killed) S.squeal(o, 0.7);
          }
        });
        return;
      }
      this.playAt(ax, az, (S, o) => {
        S.impact(o, 'flesh', 1);
        this._animalVoice(S, o, animal.species, killed ? 1.2 : 1);
      });
    });
    on(E.ENEMY_KILLED, ({ enemy }) => {
      if (!enemy) return;
      this.playAt(enemy.x, enemy.z, (S, o) => {
        if (enemy.type === 'GOLEM') S.crumble(o, 1.1);
        else if (enemy.type === 'SLIME') S.pop(o, 1);
        else S.squeal(o, 1.3);
      });
    });
    on(E.ENEMY_ATTACKED, ({ enemy }) => {
      if (!enemy) return;
      this.playAt(enemy.x, enemy.z, (S, o) => {
        if (enemy.type === 'GOLEM') {
          S.golem(o, 0.8);
          S.whoosh(o, 1.4);
        } else if (enemy.type === 'SLIME') S.slime(o, 1.2);
        else {
          S.goblin(o, 1.3);
          S.whoosh(o, 0.9);
        }
      });
    });
    on(E.PROJECTILE_HIT, ({ x, z, target, explosion }) => {
      this.playAt(x, z, (S, o) => {
        if (explosion) {
          S.boom(o, 0.8);
          S.slime(o, 1.4);
        } else if (target?.boss === 'crystal') {
          S.tone(o, { type: 'sine', f: 2100, d: 0.5, gain: 0.1 });
          S.tone(o, { type: 'sine', f: 3170, d: 0.35, gain: 0.05 });
        } else if (target?.boss || target?.type === 'GOLEM') S.impact(o, 'stone', 0.8);
        else if (target) S.impact(o, 'flesh', 0.8);
        else S.impact(o, 'wood', 0.35);
      });
    });
    on(E.STRUCTURE_PLACED, ({ structure }) => structure && this.playAt(structure.x, structure.z, (S, o) => S.build(o, this._stony(structure))));
    on(E.STRUCTURE_REMOVED, ({ structure }) => structure && this.playAt(structure.x, structure.z, (S, o) => (this._stony(structure) ? S.crumble(o, 0.5) : S.splinter(o, 1))));
    on(E.STRUCTURE_INTERACT, ({ structure }) => {
      if (!structure || SHAPES[structure.type]?.interact !== 'DOOR') return;
      this.playAt(structure.x, structure.z, (S, o) => S.door(o, !!structure.open));
    });
    on(E.CHEST_OPEN, ({ piece }) => piece && this.playAt(piece.x, piece.z, (S, o) => S.door(o, true)));
    on(E.SHIP_COMMAND, ({ command }) => {
      if (command === 'TAKEOFF') this._shipSound((S, o) => S.charge(o, 1.2));
    });
    on(E.BOSS_EVENT, (ev) => this._bossSound(ev));
  }

  _stony(piece) {
    const cost = piece.cost ?? this._construction?.costOf?.(piece.type) ?? {};
    return Object.keys(cost).some((k) => k === 'STONE' || k === 'MINERAL' || k.includes('BRICK'));
  }

  _animalVoice(S, o, species, k = 1) {
    if (species === 'COW') S.moo(o, k);
    else if (species === 'GOAT') S.bleat(o, k, 1);
    else S.bleat(o, k * 0.7, 1.7);
  }

  _shipSound(fn) {
    const s = this._ship?.ship;
    if (!s) return;
    if (this._ship.isAboard?.()) this.play(fn);
    else this.playAt(s.x, s.z, fn, { ref: 10, max: 90 });
  }

  _bossSound(ev) {
    const x = ev.x ?? this._story2?.boss?.x;
    const z = ev.z ?? this._story2?.boss?.z;
    if (x === undefined) return;
    const big = { ref: 14, max: 120 };
    switch (ev.type) {
      case 'awake':
        this.playAt(x, z, (S, o) => {
          S.golem(o, 1.5);
          S.crumble(o, 1);
        }, big);
        break;
      case 'risen':
      case 'phase2':
        this.playAt(x, z, (S, o) => S.roar(o), big);
        break;
      case 'crack':
        this.playAt(x, z, (S, o) => {
          S.noise(o, { d: 0.25, gain: 0.25, type: 'highpass', f: 3500 });
          S.tone(o, { type: 'sine', f: 2400, f2: 1900, d: 0.4, gain: 0.08 });
        }, big);
        break;
      case 'slamWindup':
      case 'rockWindup':
        this.playAt(x, z, (S, o) => S.golem(o, 1.2), big);
        break;
      case 'slam':
        this.playAt(x, z, (S, o) => S.boom(o, 1.2), big);
        break;
      case 'rockPick':
        this.playAt(x, z, (S, o) => S.crumble(o, 0.6), big);
        break;
      case 'rockThrow':
        this.playAt(x, z, (S, o) => S.whoosh(o, 2), big);
        break;
      case 'rockImpact':
        this.playAt(x, z, (S, o) => {
          S.boom(o, 0.6);
          S.crumble(o, 0.6);
        }, big);
        break;
      case 'laserCharge':
        this.playAt(x, z, (S, o) => S.charge(o, 1.4), big);
        break;
      case 'laserFire':
        this.playAt(x, z, (S, o) => S.boom(o, 0.5), big);
        break;
      case 'vent':
        this.playAt(x, z, (S, o) => S.hiss(o, 2.5, 1.5), big);
        break;
      case 'crystalHit':
        this.playAt(x, z, (S, o) => {
          S.tone(o, { type: 'sine', f: 1760, d: 0.6, gain: 0.12 });
          S.tone(o, { type: 'sine', f: 2637, d: 0.4, gain: 0.06 });
        }, big);
        break;
      case 'dead':
        this.playAt(x, z, (S, o) => {
          S.shatter(o);
          S.crumble(o, 1.5);
          S.boom(o, 1);
        }, big);
        break;
      default:
        break;
    }
  }

  // ---- Bucle -----------------------------------------------------------------------

  update(dt) {
    if (this._input?.wasPressed?.('MUTE')) {
      this._unlock();
      this.toggleMute();
    }
    if (!this.ctx || this.ctx.state !== 'running') return;
    this._updateListener();
    this._envT -= dt;
    if (this._envT <= 0) {
      this._envT = ENV_INTERVAL;
      this._sampleEnv();
    }
    const live = !this.volumes.muted;
    if (live) {
      this._footsteps();
      this._ambientShots(dt);
      this._creatures(dt);
    }
    this._ambientLoops();
    this._continuous();
    this.music.setMood(this._dead ? null : chooseMood({
      title: !this._started,
      space: this._space === 'SPACE' || this._space === 'ASCENDING',
      boss: !!this._story2?.bossActive,
      cave: this._env.cave,
      night: !!this._time?.isNight,
    }));
    if (live) this.music.update();
  }

  _updateListener() {
    const cam = this._camera;
    const L = this._listener;
    if (!cam) {
      const p = this._player.position;
      L.x = p.x;
      L.y = p.y;
      L.z = p.z;
      return;
    }
    const e = cam.matrixWorld.elements;
    L.x = e[12];
    L.y = e[13];
    L.z = e[14];
    // La cámara mira hacia −Z local.
    L.fx = -e[8];
    L.fz = -e[10];
    if (Math.hypot(L.fx, L.fz) < 1e-3) {
      L.fx = 0;
      L.fz = -1;
    }
  }

  get _world() {
    return this._worlds.proxy ?? this._worlds;
  }

  _onHome() {
    return (this._worlds.activeId ?? this._homeId) === this._homeId;
  }

  _surface() {
    const p = this._player.position;
    const st = this._player.state;
    const w = this._world;
    let structure = null;
    const piece = this._construction?.pieceUnder?.(p.x, p.z, p.y + 0.3);
    if (piece && p.y - piece.top < 0.3) structure = this._stony(piece.piece) ? 'stone' : 'wood';
    return surfaceFor({
      swimming: st.isSwimming,
      aboard: !!this._ship?.isAboard?.(),
      structure,
      inCave: this._env.cave,
      biome: this._env.biome || w.getBiomeAt?.(p.x, p.z)?.id,
    });
  }

  _footsteps() {
    const p = this._player.position;
    const st = this._player.state;
    if (!this._last) {
      this._last = { x: p.x, z: p.z };
      return;
    }
    const d = Math.hypot(p.x - this._last.x, p.z - this._last.z);
    this._last.x = p.x;
    this._last.z = p.z;
    if (d > 3 || st.isFlying || this._dead || this._space === 'SPACE') return; // teletransporte, vuelo
    const grounded = st.onGround || st.isSwimming || st.isClimbing;
    if (!grounded) return;
    this._stride += d;
    const stride = strideLength({ running: st.isRunning, crouching: st.isCrouching, swimming: st.isSwimming });
    if (this._stride < stride) return;
    this._stride = 0;
    const k = st.isCrouching ? 0.45 : st.isRunning ? 1.15 : 0.85;
    const surface = this._surface();
    this.play((S, o) => {
      if (surface === 'water' && this._underwater) S.bubbles(o, 0.6);
      else S.step(o, surface, k);
    });
  }

  /** Cueva, agua cercana, altura, bioma: unas pocas veces por segundo. */
  _sampleEnv() {
    const env = this._env;
    const w = this._world;
    const p = this._player.position;
    const home = this._onHome();
    env.cave = !!w.inCave?.(p.x, p.y + 0.8, p.z);
    env.aboard = !!this._ship?.isAboard?.();
    const planet = w.planet ?? null;
    env.breathable = this._space === 'SURFACE' && planet?.BREATHABLE !== false;
    const biome = w.getBiomeAt?.(p.x, p.z);
    env.biome = biome?.id ?? '';
    env.snow = /SNOW|ICE|FROZEN/.test(env.biome);
    const sea = w.seaLevel ?? 0;
    env.altitude = clamp01((p.y - sea - 25) / 70);
    // Agua alrededor: muestras en anillos; el mar con olas, los ríos y charcas más suaves.
    let fresh = 0;
    let salt = 0;
    let total = 0;
    if (!env.cave && this._space === 'SURFACE' && w.waterSurfaceAt) {
      for (const [r, wt] of WATER_RINGS) {
        const n = r === 0 ? 1 : WATER_DIRS;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = p.x + Math.cos(a) * r;
          const z = p.z + Math.sin(a) * r;
          total += wt;
          if (w.waterSurfaceAt(x, z) === null) continue;
          if (w.isFreshWaterAt?.(x, z)) fresh += wt;
          else salt += wt;
        }
      }
    }
    env.water = total ? clamp01((fresh / total) * 3.5) : 0;
    env.sea = total ? clamp01((salt / total) * 2.5) : 0;
    // Cascadas de la sala del gólem.
    const arena = home ? this._story2?.built?.dungeon?.arena : null;
    if (arena && env.cave) {
      const c = arena.center;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      env.falls = clamp01(1.2 - d / ((arena.len ?? 40) * 0.9));
    } else env.falls = 0;
    // Hogueras y cocinas: crepitar al acercarse.
    env.fire = 0;
    for (const pc of this._construction?.pieces ?? []) {
      if (pc.type !== 'CAMPFIRE' && pc.type !== 'KITCHEN') continue;
      const d = Math.hypot(p.x - pc.x, p.z - pc.z);
      const k = clamp01(1.1 - d / (pc.type === 'KITCHEN' ? 9 : 16));
      if (k > env.fire) {
        env.fire = k;
        env.fireX = pc.x;
        env.fireZ = pc.z;
      }
    }
    // Cascadas del mapa (rugido al acercarse).
    if (home && !env.cave) {
      for (const f of this._waterfalls()) {
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        env.falls = Math.max(env.falls, clamp01(1.15 - d / 80));
      }
    }
  }

  _ambientLoops() {
    const L = this._loops;
    const env = this._env;
    const t = this.ctx.currentTime;
    const set = (loop, v, tc = 0.8) => loop.gain.gain.setTargetAtTime(v, t, tc);
    const air = env.breathable && !this._dead;
    const shelter = env.aboard ? 0.25 : 1;
    const windK = air && !env.cave ? (0.05 + env.altitude * 0.12 + (env.snow ? 0.05 : 0) + this._weather.wind * 0.18) * shelter : 0;
    set(L.wind, windK);
    set(L.gust, windK * (0.25 + this._weather.wind * 0.6));
    L.wind.filter.Q.value = 0.7 + env.altitude;
    set(L.water, air ? env.water * 0.16 * shelter : 0);
    set(L.sea, air ? env.sea * 0.28 * shelter : 0);
    set(L.falls, env.falls * 0.22, 0.5);
    set(L.cave, env.cave ? 0.18 : 0, 1.2);
    set(L.rain, air && !env.cave ? this._weather.rain * 0.22 * shelter : 0, 1.5);
    set(L.fire, env.fire * 0.12, 0.4);
    this._caveSend.gain.setTargetAtTime(env.cave ? 0.32 : 0, t, 0.4);
  }

  /** Pájaros, grillos, búhos y gotas: sonidos sueltos alrededor. */
  _ambientShots(dt) {
    const env = this._env;
    const T = this._t;
    const L = this._listener;
    const around = (r0, r1) => {
      const a = Math.random() * Math.PI * 2;
      const r = rand(r0, r1);
      return [L.x + Math.cos(a) * r, L.z + Math.sin(a) * r];
    };
    const outdoors = env.breathable && !env.cave && !env.aboard && this._started;
    const night = !!this._time?.isNight;
    const rainK = 1 - this._weather.rain * 0.8;
    if (outdoors && !night && (T.bird -= dt) <= 0) {
      T.bird = rand(2.5, 8) / (env.snow || /SAND|DESERT|BEACH/.test(env.biome) ? 0.35 : 1);
      if (Math.random() < rainK) {
        const [x, z] = around(10, 32);
        this.playAt(x, z, (S, o) => S.chirp(o), { ref: 12, max: 45, k: 0.8 });
      }
    }
    if (outdoors && night && !env.snow && (T.cricket -= dt) <= 0) {
      T.cricket = rand(0.25, 1.1);
      const [x, z] = around(4, 20);
      this.playAt(x, z, (S, o) => S.cricket(o), { ref: 8, max: 30, k: rainK });
    }
    if (outdoors && night && (T.owl -= dt) <= 0) {
      T.owl = rand(25, 70);
      const [x, z] = around(20, 40);
      this.playAt(x, z, (S, o) => S.owl(o), { ref: 15, max: 60 });
    }
    if (env.cave && (T.drip -= dt) <= 0) {
      T.drip = rand(1.2, 4.5);
      const [x, z] = around(2, 12);
      this.playAt(x, z, (S, o) => S.drip(o), { ref: 6, max: 25 });
    }
    if (env.fire > 0.05 && (T.crackle = (T.crackle ?? 0) - dt) <= 0) {
      T.crackle = rand(0.08, 0.5);
      this.playAt(env.fireX, env.fireZ, (S, o) => S.crackle(o, 0.8), { ref: 4, max: 20 });
    }
    if (this._underwater && (T.bubble -= dt) <= 0) {
      T.bubble = rand(1.5, 4);
      this.play((S, o) => S.bubbles(o, 0.5));
    }
  }

  /** Voces de las criaturas cercanas y pisadas de los gólems. */
  _creatures(dt) {
    const T = this._t;
    const p = this._player.position;
    // Pisadas: gólems que se mueven cerca (y el gólem gigante).
    const en = this._enemies?.enabled !== false ? this._enemies?.enemies ?? [] : [];
    for (const e of en) {
      if (e.type !== 'GOLEM' || !e.alive || (e.state !== 'CHASE' && e.state !== 'RETURN' && e.state !== 'WANDER')) continue;
      if (Math.abs(e.x - p.x) > 30 || Math.abs(e.z - p.z) > 30) continue;
      const left = (T.golemStep.get(e.id) ?? 0) - dt;
      if (left > 0) {
        T.golemStep.set(e.id, left);
        continue;
      }
      T.golemStep.set(e.id, e.state === 'CHASE' ? 0.55 : 0.8);
      this.playAt(e.x, e.z, (S, o) => S.thud(o, 0.5 * (e.scale ?? 1)), { ref: 6, max: 35 });
    }
    if (T.golemStep.size > 40) T.golemStep.clear();
    const B = this._story2?.bossActive ? this._story2.boss : null;
    if (B?.walking && (T.bossStep -= dt) <= 0) {
      T.bossStep = 0.75;
      this.playAt(B.x, B.z, (S, o) => S.thud(o, 1.4), { ref: 14, max: 100 });
    }
    // Voces: una criatura cercana al azar de vez en cuando.
    if ((T.creature -= dt) > 0) return;
    T.creature = rand(0.6, 1.2);
    const near = en.filter((e) => e.alive && e.state !== 'DORMANT' && Math.abs(e.x - p.x) < 28 && Math.abs(e.z - p.z) < 28);
    if (near.length) {
      const e = near[(Math.random() * near.length) | 0];
      const chasing = e.state === 'CHASE';
      if (e.type === 'GOBLIN' && Math.random() < (chasing ? 0.45 : 0.12)) this.playAt(e.x, e.z, (S, o) => S.goblin(o, 1));
      else if (e.type === 'SLIME' && Math.random() < 0.25) this.playAt(e.x, e.z, (S, o) => S.slime(o, 0.7));
      else if (e.type === 'GOLEM' && Math.random() < (chasing ? 0.2 : 0.05)) this.playAt(e.x, e.z, (S, o) => S.golem(o, 0.7));
    }
    const animals = this._animals?.getAnimalsNear?.(p.x, p.z, 32) ?? [];
    if (animals.length) {
      const a = animals[(Math.random() * animals.length) | 0];
      if (a.state === 'DEAD') return;
      const fleeing = a.state === 'FLEE';
      const chance = a.species === 'DEER' ? 0.02 : fleeing ? 0.2 : 0.07;
      if (Math.random() < chance) this.playAt(a.x, a.z, (S, o) => this._animalVoice(S, o, a.species, 0.9), { ref: 9, max: 45 });
    }
  }

  /** Motor de la nave y láser del jefe. */
  _continuous() {
    const t = this.ctx.currentTime;
    const live = !this.volumes.muted;
    // Motor.
    const s = this._ship?.ship;
    const tel = this._shipT;
    let eng = 0;
    let pan = 0;
    if (live && s && tel?.present !== false) {
      const f = tel?.flight ?? 'LANDED';
      const base = f === 'TAKING_OFF' || f === 'LANDING' ? 0.3 : f === 'FLYING' ? 0.22 : f === 'SPACE' ? 0.12 : 0;
      if (base > 0) {
        if (this._ship.isAboard?.()) eng = base;
        else {
          const L = this._listener;
          const sp = spatialize(s.x - L.x, s.z - L.z, L.fx, L.fz, { ref: 14, max: 160 });
          eng = base * sp.gain * 2;
          pan = sp.pan;
        }
        const speed = Math.min(1, (tel?.speed ?? 0) / 40);
        this._engine.filter.frequency.setTargetAtTime(260 + speed * 500 + (f === 'TAKING_OFF' ? 250 : 0), t, 0.3);
        this._engine.oscs.forEach((o, i) => o.detune.setTargetAtTime(speed * 300 + (i ? 7 : 0), t, 0.4));
      }
    }
    this._engine.gain.gain.setTargetAtTime(eng, t, 0.35);
    this._engine.pan.pan.setTargetAtTime(pan, t, 0.1);
    // Láser.
    const B = this._story2?.bossActive ? this._story2.boss : null;
    let las = 0;
    let lpan = 0;
    if (live && B?.laser?.phase === 'FIRE') {
      const L = this._listener;
      const sp = spatialize(B.x - L.x, B.z - L.z, L.fx, L.fz, { ref: 14, max: 100 });
      las = 0.14 * Math.max(0.35, sp.gain);
      lpan = sp.pan;
    }
    this._laser.gain.gain.setTargetAtTime(las, t, 0.06);
    this._laser.pan.pan.setTargetAtTime(lpan, t, 0.1);
  }
}

function readStore() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}
