import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { applyWatchTheme, watchColor, sanitizeWatchName } from './StoryUI.js';
import { NovaBot } from './NovaBot.js';
import { Tutorial } from './Tutorial.js';
import { buildHermitTower, buildHermit, buildNodeArena, buildMiniNode, ARENA } from './StoryBuildings.js';
import { buildCapsule, buildCapsuleHatch } from '../render/CapsuleModel.js';

/**
 * StorySystem — la campaña del Edén (primera parte).
 *
 *   CRASH      la cápsula se estrella (animación la primera vez) y el reloj espera en ella
 *   SETUP      coger el reloj: nombre (el de la futura IA) y color; transmisión cortada;
 *              tutorial o juego libre
 *   TOWER      encontrar la torre del ermitaño (una luz cálida en el horizonte)
 *   NODE       con la clave A1 unida al reloj y la brújula (J), ir al nodo espacial
 *   ARENA      los cuatro gólems guardianes despiertan y los muros se levantan
 *   CAPSULE    cae otra cápsula: abrirla
 *   SCAN       Nova, la IA (con el nombre del reloj), escanea 24 h de juego buscando la nave
 *   (la segunda parte de la historia sigue en las etapas siguientes)
 *
 * Todo lo que pasa se guarda en `state` (parte "story" de la partida). Antes de cada
 * evento de la historia se guarda la partida sola. Los lugares salen de WorldSites (por
 * semilla y lejos del inicio).
 */
export const STAGES = ['CRASH', 'SETUP', 'TOWER', 'NODE', 'ARENA', 'CAPSULE', 'SCAN', 'SHIP', 'LAB', 'DUNGEON', 'BOSS', 'REPAIR', 'ESCAPE', 'POSTGAME'];

export function defaultStoryState() {
  return {
    stage: 'CRASH',
    watchName: 'NOVA',
    watchColor: 'BLUE',
    named: false,
    tutorial: 'off',
    tutStep: 0,
    hermitTalked: false,
    keyDropped: false,
    keyTaken: false,
    nodeTaken: false,
    arenaCleared: false,
    capsuleLanded: false,
    capsuleOpened: false,
    novaActive: false,
    scanStart: null,
  };
}

/** Limpia un estado cargado (solo claves conocidas y con su tipo). */
export function sanitizeStoryState(d) {
  const s = defaultStoryState();
  if (!d || typeof d !== 'object') return s;
  for (const [k, v] of Object.entries(s)) {
    const x = d[k];
    if (x === undefined) continue;
    if (typeof v === 'boolean' && typeof x === 'boolean') s[k] = x;
    else if (typeof v === 'number' && Number.isFinite(x)) s[k] = x;
    else if (v === null && (x === null || Number.isFinite(x))) s[k] = x;
    else if (typeof v === 'string' && typeof x === 'string') s[k] = x;
  }
  if (!STAGES.includes(s.stage)) s.stage = 'CRASH';
  s.watchName = sanitizeWatchName(s.watchName) ?? 'NOVA';
  s.watchColor = watchColor(s.watchColor).id;
  if (!['off', 'on', 'done'].includes(s.tutorial)) s.tutorial = 'off';
  // Campos de la segunda parte (los añade StoryPart2): se copian tal cual si son simples.
  for (const [k, x] of Object.entries(d)) {
    if (k in s) continue;
    if (typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) || (typeof x === 'string' && x.length < 40)) s[k] = x;
  }
  return s;
}

export function stageAtLeast(stage, ref) {
  return STAGES.indexOf(stage) >= STAGES.indexOf(ref);
}

const NOVA_COLOR = (s) => (s.watchColor === 'BLACK' ? '#9aa3ad' : watchColor(s.watchColor).hex);

export class StorySystem {
  constructor(deps) {
    this.name = 'story';
    Object.assign(this, { _d: deps });
    const d = deps;
    this._events = d.events;
    this._ui = d.ui;
    this._player = d.player;
    this._worlds = d.worlds;
    this._home = d.homeId;
    this._cam = d.camera;
    this._cfg = d.config;
    this.state = defaultStoryState();
    this._t = 0;
    this._seq = null;
    this._sites = {};
    this._built = null;
    this.nova = null;
    this._tutorial = new Tutorial({ story: this, ...d });
    this.darkness = 0; // oscuridad extra (habitación del ermitaño)
    this._remarkIn = 40;

    const ev = d.events;
    ev.on(GameEvents.WORLD_GENERATED, () => this._buildWorld());
    ev.on(GameEvents.PLAYER_DIED, () => this._onDeath());
    ev.on(GameEvents.PLAYER_DAMAGED, () => {
      if (this.nova && this.state.novaActive) this._faceFor('WORRIED', 2.5);
    });
    ev.on(GameEvents.ENEMY_KILLED, ({ enemy }) => this._onEnemyKilled(enemy));
    ev.on(GameEvents.ENEMY_ATTACKED, () => {
      if (this.nova && this.state.novaActive) this._faceFor('ANGRY', 2);
    });
  }

  get enabled() {
    return !!this._d.campaign;
  }

  /** La nave ya se ha localizado (segunda parte): su faro se enciende. */
  get shipRevealed() {
    return stageAtLeast(this.state.stage, 'SHIP');
  }

  get watchName() {
    return this.state.watchName;
  }

  // ---- Partida nueva / cargada --------------------------------------------------------

  /** Partida nueva de la campaña: la cápsula se estrella y se abre (primera vez). */
  startNewGame() {
    if (!this.enabled) return;
    this.state = defaultStoryState();
    this._d.part2?.onNewGame?.();
    this._applyTheme();
    this._refresh();
    this._playIntro();
  }

  /** Partida cargada: se rehace el mundo de la historia según lo que ya ha pasado. */
  restore(data) {
    this.state = sanitizeStoryState(data);
    const s = this.state;
    // Guardada a mitad de un evento: se retoma desde su principio.
    if (s.stage === 'SETUP') s.stage = s.named ? 'TOWER' : 'CRASH';
    if (s.stage === 'ARENA' && !s.arenaCleared) {
      s.stage = 'NODE';
      s.nodeTaken = false;
    }
    if (s.stage === 'CAPSULE') s.capsuleLanded = true;
    if (s.capsuleOpened && !s.novaActive) {
      s.novaActive = true;
      s.stage = 'SCAN';
      s.scanStart ??= this._absHours();
    }
    this._applyTheme();
    this._setAIName(this.state.watchName);
    this._refresh();
    this._d.part2?.onRestore?.();
    if (this.state.tutorial === 'on') this._tutorial.start(this.state.tutStep);
  }

  snapshot() {
    return { ...this.state, tutStep: this._tutorial.step ?? this.state.tutStep };
  }

  /** El nombre del reloj es el de la IA de la nave (sin que la IA lo anuncie). */
  _setAIName(name) {
    const ai = this._d.shipAI;
    if (!ai || ai.aiName === name) return;
    const say = ai.say;
    ai.say = () => {};
    ai.setName(name);
    ai.say = say;
  }

  _applyTheme() {
    applyWatchTheme(this.state.watchColor);
    const hex = NOVA_COLOR(this.state);
    this._player.model.setWatchColor?.(hex);
    this.nova?.setColor(hex);
  }

  /** Cambiar el color del reloj (desde el menú, cuando se quiera). */
  setWatchColor(id) {
    this.state.watchColor = watchColor(id).id;
    this._applyTheme();
  }

  openWatchSettings() {
    this._ui.watchSetup({ name: this.state.watchName, color: this.state.watchColor, title: '⌚ Ajustes del reloj', allowCancel: true }, ({ name, color }) => {
      this.state.watchName = name;
      this.state.watchColor = color;
      this._setAIName(name);
      this._applyTheme();
      this._refresh();
    });
  }

  // ---- El mundo de la historia ------------------------------------------------------------

  _site(kind) {
    return this._worlds.get(this._home)?.getSites?.(kind)?.[0] ?? null;
  }

  _buildWorld() {
    this._disposeWorld();
    if (!this.enabled) return;
    const w = this._worlds.get(this._home);
    const root = this._worlds.rootOf(this._home);
    const built = (this._built = { root: new THREE.Group() });
    built.root.name = 'Story';
    root.add(built.root);
    const col = this._d.colliders;
    // Torre del ermitaño.
    const ts = this._site('HERMIT_TOWER');
    if (ts) {
      const tower = buildHermitTower(ts, w.getHeightAt(ts.x, ts.z));
      built.root.add(tower.group);
      col.add('tower', tower.prims, { enabled: () => this._worlds.activeId === this._home });
      const hermit = buildHermit();
      hermit.group.position.set(tower.hermitSpot.x, tower.hermitSpot.y, tower.hermitSpot.z);
      hermit.group.rotation.y = Math.atan2(tower.room.x - tower.hermitSpot.x, tower.room.z - tower.hermitSpot.z);
      built.root.add(hermit.group);
      // Faro: una luz cálida sobre la torre que se ve de lejos (hasta tener la clave).
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 1.6, 180, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      );
      beam.position.set(ts.x, tower.room.y + 95, ts.z);
      built.root.add(beam);
      built.tower = { ...tower, site: ts, hermit, beam };
    }
    // Arena del nodo espacial.
    const ns = this._site('NODE_ARENA');
    if (ns) {
      const g = w.getHeightAt(ns.x, ns.z);
      const arena = buildNodeArena(ns, g, (x, z) => w.getHeightAt(x, z));
      built.root.add(arena.group);
      col.add('arena', arena.staticPrims, { enabled: () => this._worlds.activeId === this._home });
      col.add('arenaWalls', arena.wallPrims, { enabled: () => this._worlds.activeId === this._home && this._wallsUp > 0.5 });
      built.arena = { ...arena, site: ns };
      built.capsuleSpot = this._findCapsuleSpot(ns, w);
    }
    this._wallsUp = 0;
    this._refresh();
  }

  _disposeWorld() {
    if (!this._built) return;
    this._built.root.parent?.remove(this._built.root);
    this._built.root.traverse((o) => o.geometry?.dispose?.());
    for (const id of ['tower', 'arena', 'arenaWalls', 'capsule2']) this._d.colliders.remove(id);
    this._built = null;
  }

  _findCapsuleSpot(site, w) {
    const rng = new SeededRandom(deriveSeed(site.seed, 'capsule2'));
    for (let i = 0; i < 60; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(36, 55);
      const x = site.x + Math.cos(a) * d;
      const z = site.z + Math.sin(a) * d;
      if (w.water?.isWater(x, z, 3) || w.isCaveHole?.(x, z)) continue;
      const h = w.getHeightAt(x, z);
      const slope = Math.abs(w.getHeightAt(x + 2, z) - w.getHeightAt(x - 2, z)) + Math.abs(w.getHeightAt(x, z + 2) - w.getHeightAt(x, z - 2));
      if (slope > 1.6 || h < w.seaLevel + 1) continue;
      return { x, z, y: h };
    }
    return { x: site.x + 40, z: site.z, y: w.getHeightAt(site.x + 40, site.z) };
  }

  /** Pone el mundo de la historia en el estado actual (clave, nodo, muros, cápsula, Nova). */
  _refresh() {
    const s = this.state;
    const b = this._built;
    if (b?.tower) b.tower.beam.visible = s.stage === 'TOWER' || s.stage === 'SETUP';
    // Clave A1 en el suelo (si el ermitaño ya la soltó y no se ha cogido).
    if (b?.tower) {
      if (s.keyDropped && !s.keyTaken) {
        if (!b.key) {
          b.key = buildMiniNode();
          const r = b.tower.room;
          const hs = b.tower.hermitSpot;
          b.key.position.set((hs.x + r.x) / 2, r.y + 0.9, (hs.z + r.z) / 2);
          b.root.add(b.key);
        }
      } else if (b.key) {
        b.root.remove(b.key);
        b.key = null;
      }
    }
    // Cápsula 2.
    if (b?.arena && s.capsuleLanded && !b.capsule) this._placeCapsule2(s.capsuleOpened);
    // Nova.
    if (s.novaActive && !this.nova) this._spawnNova(this._player.position.clone().add(new THREE.Vector3(1.5, 1.6, 1.5)));
    this._ui.setCompassVisible(s.keyTaken && this.enabled);
    if (this._tutorial.active) return;
    this._ui.setObjective(this.objective());
  }

  // ---- Objetivo y brújula ------------------------------------------------------------

  objective() {
    const s = this.state;
    if (!this.enabled) return '';
    switch (s.stage) {
      case 'CRASH': return 'Coge tu reloj de pulsera de la cápsula (E)';
      case 'SETUP': return '';
      case 'TOWER': return 'Explora: busca la torre del ermitaño (una luz cálida a lo lejos)';
      case 'NODE': return 'Lleva la clave A1 al nodo espacial (sigue la brújula)';
      case 'ARENA': return `¡Derrota a los gólems guardianes! (${this._arenaLeft()} de 4)`;
      case 'CAPSULE': return 'Abre la cápsula que ha caído del cielo';
      case 'SCAN': return `Escáner de ${s.watchName}: buscando la nave… quedan ${Math.ceil(this.scanLeft())} h`;
      default: return this._d.part2?.objective?.() ?? '';
    }
  }

  markers() {
    const s = this.state;
    const out = [];
    const b = this._built;
    if (!b) return out;
    if ((s.stage === 'NODE' || s.stage === 'ARENA') && b.arena) out.push({ id: 'node', icon: '🔷', x: b.arena.center.x, z: b.arena.center.z, label: 'Nodo espacial' });
    if (s.stage === 'CAPSULE' && b.capsuleSpot) out.push({ id: 'cap2', icon: '🚀', x: b.capsuleSpot.x, z: b.capsuleSpot.z, label: 'Cápsula' });
    for (const m of this._d.part2?.markers?.() ?? []) out.push(m);
    return out;
  }

  // ---- Bucle -----------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    if (!this.enabled) return;
    const t = this._t;
    const p = this._player.position;
    const b = this._built;
    const onHome = this._worlds.activeId === this._home;
    // Secuencia de cine en curso y temporizadores.
    this._runTimers(dt);
    if (this._seq) this._runSeq(dt);
    // Animaciones del mundo.
    if (b?.arena) {
      b.arena.animate(t, this.state.nodeTaken);
      const goal = this.state.stage === 'ARENA' && this.state.nodeTaken ? 1 : 0;
      this._wallsUp += Math.sign(goal - this._wallsUp) * Math.min(Math.abs(goal - this._wallsUp), dt / 2.2);
      b.arena.setWalls(this._wallsUp);
    }
    if (b?.key) {
      b.key.userData.spin(t);
      b.key.position.y += Math.sin(t * 2) * 0.002;
    }
    if (b?.tower) {
      const h = b.tower.hermit;
      h.crystal.rotation.y = t;
      // El ermitaño mira al jugador cuando está cerca.
      const dx = p.x - h.group.position.x;
      const dz = p.z - h.group.position.z;
      if (Math.hypot(dx, dz) < 6) h.group.rotation.y += (Math.atan2(dx, dz) - h.group.rotation.y) * Math.min(1, dt * 2);
      b.tower.flag.rotation.y = Math.sin(t * 1.3) * 0.3;
      if (b.tower.beam.visible) b.tower.beam.material.opacity = 0.12 + Math.sin(t * 1.5) * 0.04;
      // Habitación de arriba: a oscuras.
      const r = b.tower.room;
      const inside = onHome && Math.hypot(p.x - r.x, p.z - r.z) < r.r + 0.3 && p.y > r.y - 0.5 && p.y < r.y + r.h;
      this.darkness += ((inside ? 0.72 : 0) - this.darkness) * Math.min(1, dt * 3);
      if (inside && !this.state.hermitTalked && !this._hermitHint) {
        this._hermitHint = true;
        this._msg('🕯️ Está muy oscuro… alguien respira en un rincón.', 'info');
      }
    }
    if (b?.capsule) this._updateCapsule(dt);
    if (this.nova) this._updateNova(dt);
    // Etapas que avanzan solas.
    if (this.state.stage === 'SCAN' && this.scanLeft() <= 0) this._d.part2?.onScanDone?.();
    this._d.part2?.update?.(dt);
    this._tutorial.update(dt);
    // HUD.
    if (!this._tutorial.active) this._ui.setObjective(this._seq ? '' : this.objective());
    if (this.state.keyTaken && onHome) {
      const yaw = this._player.yaw;
      const marks = this.markers().map((m) => {
        const dx = m.x - p.x;
        const dz = m.z - p.z;
        return { ...m, angle: Math.atan2(dx, -dz), dist: Math.hypot(dx, dz) };
      });
      this._ui.updateCompass(yaw, marks);
    }
  }

  // ---- Secuencias (cine) ---------------------------------------------------------

  /** steps: [{ at, run }] (segundos) + tick(dt, t) opcional; al acabar, done(). */
  _sequence(steps, { tick, duration, done } = {}) {
    this._seq = { t: 0, steps: steps.slice().sort((a, b) => a.at - b.at), tick, duration: duration ?? Math.max(...steps.map((s) => s.at)), done };
  }

  _runSeq(dt) {
    const q = this._seq;
    q.t += dt;
    while (q.steps.length && q.steps[0].at <= q.t) q.steps.shift().run();
    q.tick?.(dt, q.t);
    if (q.t >= q.duration && !q.steps.length) {
      this._seq = null;
      q.done?.();
    }
  }

  /** Llama a fn tras `seconds` de juego (no de reloj real: respeta pausas). */
  _after(seconds, fn) {
    (this._timers ??= []).push({ t: seconds, fn });
  }

  _runTimers(dt) {
    if (!this._timers?.length) return;
    const due = [];
    this._timers = this._timers.filter((x) => {
      x.t -= dt;
      if (x.t > 0) return true;
      due.push(x.fn);
      return false;
    });
    for (const fn of due) fn();
  }

  _lock(on) {
    this._d.lock('story', on);
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }

  _autosave(what) {
    this._events.emit(GameEvents.GAME_SAVE_REQUEST, { reason: 'story', silent: true });
    this._msg(`💾 Guardado automático: ${what}`, 'info');
  }

  // ---- 0. La cápsula se estrella y se abre ---------------------------------------------

  _playIntro() {
    const cs = this._d.crashSite;
    if (!cs?.group) return;
    const P = this._player;
    const spawn = P.position.clone();
    const door = cs.doorWorld?.() ?? cs.watchSpot.clone();
    const out = new THREE.Vector3(cs.facing.x, 0, cs.facing.z);
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const camPos = new THREE.Vector3().copy(cs.watchSpot).addScaledVector(out, 7.5).addScaledVector(side, 4).add(new THREE.Vector3(0, 2.6, 0));
    const look = cs.watchSpot.clone().add(new THREE.Vector3(0, 0.3, 0));
    this._lock(true);
    P.model.setHidden(true);
    cs.closeHatch?.();
    this._ui.letterbox(true, '');
    this._cam.setCinematic(() => ({ pos: camPos, look }), { speed: 50 });
    let jumpFrom = null;
    this._sequence([
      { at: 0.6, run: () => cs.rattleHatch?.(1.2) },
      { at: 1.9, run: () => cs.blowHatch?.() },
      { at: 3.0, run: () => {
        P.model.setHidden(false);
        jumpFrom = door.clone();
        this._ui.caption('…');
      } },
      { at: 4.6, run: () => this._ui.caption('') },
    ], {
      duration: 5.4,
      tick: (dt, t) => {
        if (!jumpFrom) return;
        // Sale de la cápsula de un salto y se queda junto a ella.
        const k = Math.min(1, (t - 3.0) / 1.1);
        P.position.lerpVectors(jumpFrom, spawn, k);
        P.position.y += Math.sin(k * Math.PI) * 0.9;
        P.velocity.set(0, 0, 0);
        P.bodyYaw = P.yaw = this._d.crashSite.spawnYaw;
      },
      done: () => {
        P.position.copy(spawn);
        this._cam.setCinematic(null, { speed: 2.5 });
        this._ui.letterbox(false);
        this._lock(false);
        this._msg('💥 La cápsula se ha estrellado. Tu reloj de pulsera ha quedado en la compuerta (el que brilla): cógelo con E.', 'warning');
      },
    });
  }

  // ---- 1. El reloj ---------------------------------------------------------------------

  /** Al coger el reloj de la cápsula. */
  onWatchTaken() {
    if (!this.enabled || this.state.stage !== 'CRASH') return false;
    this.state.stage = 'SETUP';
    this._lock(true);
    setTimeout(() => {
      this._ui.watchSetup({ name: this.state.watchName, color: this.state.watchColor }, ({ name, color }) => {
        this.state.watchName = name;
        this.state.watchColor = color;
        this.state.named = true;
        this._setAIName(name);
        this._applyTheme();
        this._ui.transmission({ text: 'Sample ha llegado al planeta Eden, comenzando evacuación del person---' }, () => this._askTutorial());
      });
    }, 600);
    return true;
  }

  _askTutorial() {
    this._ui.choice({
      title: '¿Cómo quieres empezar?',
      text: 'El tutorial te irá indicando qué hacer con flechas e instrucciones. En el juego libre te las arreglas solo.',
      options: [
        { id: 'tutorial', label: '🧭 Tutorial', hint: 'Recomendado la primera vez' },
        { id: 'free', label: '🌲 Juego libre', hint: 'Sin indicaciones' },
      ],
    }, (id) => {
      this.state.stage = 'TOWER';
      this.state.tutorial = id === 'tutorial' ? 'on' : 'off';
      this._lock(false);
      this._refresh();
      if (id === 'tutorial') this._tutorial.start(0);
      else this._msg('🌲 Juego libre. A lo lejos se ve una luz cálida sobre una torre…', 'info');
    });
  }

  /** El tutorial terminó o se saltó. */
  tutorialDone() {
    this.state.tutorial = 'done';
    this._refresh();
  }

  get tutorialTarget() {
    const b = this._built;
    return b?.tower ? { x: b.tower.bottom.x, y: this._worlds.get(this._home).getHeightAt(b.tower.bottom.x, b.tower.bottom.z) + 2.5, z: b.tower.bottom.z } : null;
  }

  // ---- Interacción (provider) ------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    const out = [];
    const b = this._built;
    if (!this.enabled || !b || this._seq || this._worlds.activeId !== this._home) return out;
    const s = this.state;
    const near = (p, r = range + 2) => Math.hypot(p.x - x, p.z - z) < r && Math.abs(p.y - y) < 4;
    if (b.tower) {
      const h = b.tower.hermit.group.position;
      if (near(h)) out.push({ id: 'hermit', x: h.x, y: h.y + 1.3, z: h.z, aimRadius: 0.7, reach: 0.6, label: '🧙 Ermitaño', action: 'Hablar', key: 'E' });
    }
    if (b.key && near(b.key.position)) out.push({ id: 'key', x: b.key.position.x, y: b.key.position.y, z: b.key.position.z, aimRadius: 0.5, reach: 0.6, label: '🔑 Mini-nodo A1', action: 'Coger', key: 'E' });
    if (b.arena && !s.nodeTaken) {
      const n = b.arena.node.position;
      if (Math.hypot(n.x - x, n.z - z) < range + 2.5) out.push({ id: 'node', x: n.x, y: n.y, z: n.z, aimRadius: 0.9, reach: 2.4, label: '🔷 Nodo espacial', action: s.keyTaken ? 'Coger' : 'Sellado: falta la clave A1', key: 'E' });
    }
    if (b.capsule && !s.capsuleOpened && s.capsuleLanded) {
      const c = b.capsule.door;
      if (near(c, range + 3)) out.push({ id: 'capsule2', x: c.x, y: c.y, z: c.z, aimRadius: 1.0, reach: 1.2, label: '🚀 Cápsula de escape', action: 'Abrir', key: 'E' });
    }
    for (const it of this._d.part2?.interactables?.(x, y, z, range) ?? []) out.push(it);
    return out;
  }

  interact(id) {
    switch (id) {
      case 'hermit': return this._talkHermit();
      case 'key': return this._takeKey();
      case 'node': return this._takeNode();
      case 'capsule2': return this._openCapsule2();
      default: return this._d.part2?.interact?.(id);
    }
  }

  // ---- 2. La torre del ermitaño --------------------------------------------------------

  _talkHermit() {
    const s = this.state;
    const H = '🧙 Ermitaño';
    const color = '#ffd99a';
    const dir = this._dirName(this._built.arena?.center);
    if (!s.hermitTalked) this._autosave('la torre del ermitaño');
    const lines = s.hermitTalked
      ? [{ speaker: H, color, text: s.keyTaken ? `El nodo duerme ${dir}. Las piedras que lo guardan no son piedras, recuérdalo.` : 'La llave sigue ahí, a mis pies. Cógela.' }]
      : [
        { speaker: H, color, text: '¿Quién anda ahí…? Hacía muchos inviernos que nadie subía estos escalones.' },
        { speaker: H, color, text: 'Vienes del cielo. Lo sé por cómo te tiembla la voz… y por esa cosa que brilla en tu muñeca.' },
        { speaker: H, color, text: 'Hace mucho, gente con batas blancas trajo cajas que flotaban. Una se quedó aquí, sobre un pedestal de piedra.' },
        { speaker: H, color, text: 'Me dieron esto antes de irse. Dijeron: «A1. Sin ella el nodo no despierta». Nunca entendí para qué servía.' },
        { speaker: H, color, text: `El nodo está ${dir}. Pero cuidado: lo vigilan piedras que no son piedras.` },
        { speaker: H, color, text: 'Toma la llave. Tu cacharro de la muñeca sabrá qué hacer con ella.', onShow: () => {
          s.keyDropped = true;
          this._refresh();
        } },
      ];
    this._ui.dialog(lines, () => {
      s.hermitTalked = true;
      s.keyDropped = true;
      this._refresh();
    });
  }

  _takeKey() {
    const s = this.state;
    s.keyTaken = true;
    s.keyDropped = true;
    if (s.stage === 'TOWER' || s.stage === 'SETUP') s.stage = 'NODE';
    this._ui.flyToWatch('🔑');
    this._refresh();
    this._after(1.4, () => {
      this._msg(`🔑 El mini-nodo A1 se une a tu reloj. ${s.watchName}: brújula activada (J para ocultarla).`, 'pickup');
      this._ui.setCompassVisible(true);
    });
    this._tutorial.onStory('KEY');
  }

  toggleCompass() {
    if (!this._ui.toggleCompass()) return;
    this._msg(this._ui.compassHidden ? '🧭 Brújula oculta (J para verla)' : '🧭 Brújula visible', 'info');
  }

  _dirName(p) {
    if (!p || !this._built?.tower) return 'lejos de aquí';
    const t = this._built.tower.site;
    const a = Math.atan2(p.x - t.x, -(p.z - t.z)); // 0 = norte (−Z)
    const names = ['al norte', 'al noreste', 'al este', 'al sureste', 'al sur', 'al suroeste', 'al oeste', 'al noroeste'];
    const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    const km = Math.hypot(p.x - t.x, p.z - t.z) / 1000;
    return `${names[i]}, a ${km < 1 ? `${Math.round(km * 1000)} metros` : `${km.toFixed(1)} km`}`;
  }

  // ---- 3. El nodo espacial y los gólems ---------------------------------------------------

  _takeNode() {
    const s = this.state;
    const b = this._built;
    if (!s.keyTaken) {
      this._msg('🔒 El nodo está sellado: hace falta la clave A1. Dicen que un ermitaño vive en una torre…', 'warning');
      return;
    }
    if (s.nodeTaken) return;
    this._autosave('el nodo espacial');
    s.nodeTaken = true;
    s.stage = 'ARENA';
    const c = b.arena.center;
    // Los cuatro guardianes (si no se derrotaron ya).
    this._arenaGolems = this._d.enemies.storyGolems('arena', b.arena.golemSpots, { leash: ARENA.WALL_R + 6 });
    this._lock(true);
    this._ui.letterbox(true, '¡Los guardianes despiertan!');
    let ang = Math.atan2(this._player.position.x - c.x, this._player.position.z - c.z);
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3(c.x, c.y + 1.5, c.z);
    pos.set(c.x + Math.sin(ang) * 15, c.y + 7.5, c.z + Math.cos(ang) * 15);
    this._cam.setCinematic(() => ({ pos, look }), { speed: 4 });
    this._sequence([
      { at: 0.4, run: () => this._arenaGolems.forEach((g, i) => this._after(i * 0.35, () => g.alert())) },
      { at: 1.6, run: () => this._ui.caption('Los muros se levantan…') },
    ], {
      duration: 5,
      tick: (dt) => {
        ang += dt * 0.5;
        pos.set(c.x + Math.sin(ang) * 15, c.y + 7.5, c.z + Math.cos(ang) * 15);
        this._cam.setCinematic(() => ({ pos, look }), { speed: 4 });
      },
      done: () => {
        this._cam.setCinematic(null, { speed: 2.5 });
        this._ui.letterbox(false);
        this._lock(false);
        this._msg('🪨 ¡Los gólems guardianes! Derrótalos para que bajen los muros.', 'warning');
      },
    });
  }

  _arenaLeft() {
    return (this._arenaGolems ?? []).filter((g) => g.alive).length;
  }

  _onEnemyKilled(e) {
    if (this.state.stage !== 'ARENA' || !this._arenaGolems?.includes(e)) return;
    if (this._arenaLeft() > 0) return;
    this.state.arenaCleared = true;
    this._d.inventory.addItem('SPACE_NODE', 1);
    this._msg('🔷 ¡Gólems derrotados! El nodo espacial es tuyo. Los muros bajan…', 'pickup');
    this.state.stage = 'CAPSULE';
    this._after(3.5, () => this._capsuleFall());
  }

  _onDeath() {
    // Morir en la arena: todo vuelve a empezar (el nodo vuelve al pedestal).
    if (this.state.stage === 'ARENA' && !this.state.arenaCleared) {
      this.state.stage = 'NODE';
      this.state.nodeTaken = false;
      this._d.enemies.resetStoryGolems('arena');
      this._arenaGolems = null;
    }
    if (this.nova) this._faceFor('SAD', 6);
  }

  // ---- 4. Cae otra cápsula ------------------------------------------------------------

  _capsuleFall() {
    const b = this._built;
    const spot = b.capsuleSpot;
    const P = this._player;
    this._lock(true);
    this._ui.letterbox(true, '¿Qué es eso…?');
    const start = new THREE.Vector3(spot.x + 140, spot.y + 260, spot.z - 90);
    const end = new THREE.Vector3(spot.x, spot.y + 0.5, spot.z);
    const fall = this._fallingCapsule(start);
    const cam = new THREE.Vector3();
    const eye = new THREE.Vector3();
    this._sequence([
      { at: 5.2, run: () => {
        fall.impact();
        this._ui.caption('');
        this.state.capsuleLanded = true;
        this._placeCapsule2(false);
      } },
      { at: 6.4, run: () => this._ui.caption('¡Otra cápsula de salvamento!') },
    ], {
      duration: 8,
      tick: (dt, t) => {
        const k = Math.min(1, t / 5.2);
        fall.set(start.clone().lerp(end, k * k), k < 1);
        // El jugador mira cómo cae.
        P.getEyePosition?.(eye) ?? eye.copy(P.position).add(new THREE.Vector3(0, 1.6, 0));
        const target = fall.position;
        P.yaw = P.bodyYaw = Math.atan2(-(target.x - P.position.x), -(target.z - P.position.z));
        P.pitch = Math.max(-0.4, Math.min(0.7, Math.atan2(target.y - eye.y, Math.hypot(target.x - eye.x, target.z - eye.z))));
        // Cámara por detrás y abajo del jugador, mirando a la cápsula.
        const back = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
        cam.copy(P.position).addScaledVector(back, 4.2).add(new THREE.Vector3(0.8, 1.1, 0));
        const look = target.clone().lerp(eye, 0.25);
        this._cam.setCinematic(() => ({ pos: cam, look }), { speed: 3 });
        if (t > 5.2 && t < 6.2) this._cam._camera.position.y += (Math.random() - 0.5) * 0.25 * (6.2 - t); // temblor
      },
      done: () => {
        fall.dispose();
        this._cam.setCinematic(null, { speed: 2.5 });
        this._ui.letterbox(false);
        this._lock(false);
        this._refresh();
        this._msg('🚀 Ha caído otra cápsula de salvamento cerca. Ve a abrirla (sigue la brújula).', 'warning');
      },
    });
  }

  _fallingCapsule(at) {
    const root = this._built.root;
    const g = new THREE.Group();
    const cap = buildCapsule({ crashed: true });
    cap.group.scale.setScalar(1.35);
    cap.group.rotation.x = Math.PI; // el escudo térmico delante
    g.add(cap.group);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    fire.position.y = 8;
    const core = new THREE.Mesh(new THREE.ConeGeometry(1.2, 9, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    core.position.y = 5;
    g.add(fire, core);
    const light = new THREE.PointLight(0xff9a50, 4, 120, 1.5);
    g.add(light);
    g.position.copy(at);
    root.add(g);
    const dust = new THREE.Mesh(new THREE.RingGeometry(0.5, 2, 32), new THREE.MeshBasicMaterial({ color: 0xc8b89a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    dust.rotation.x = -Math.PI / 2;
    root.add(dust);
    let dustT = -1;
    let prev = at.clone();
    return {
      position: g.position,
      set(p, flying) {
        const dir = p.clone().sub(prev);
        if (dir.lengthSq() > 1e-6) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize().negate());
        prev = p.clone();
        g.position.copy(p);
        fire.visible = core.visible = flying;
        fire.scale.y = 0.9 + Math.random() * 0.2;
        if (dustT >= 0) {
          dustT += 1 / 60;
          dust.scale.setScalar(1 + dustT * 14);
          dust.material.opacity = Math.max(0, 0.7 - dustT * 0.5);
        }
      },
      impact() {
        g.visible = false;
        light.intensity = 0;
        dust.position.set(p0(g).x, p0(g).y + 0.2, p0(g).z);
        dustT = 0;
      },
      dispose() {
        root.remove(g);
        root.remove(dust);
      },
    };
  }

  _placeCapsule2(opened) {
    const b = this._built;
    const spot = b.capsuleSpot;
    const cap = buildCapsule({ crashed: true });
    const g = cap.group;
    g.scale.setScalar(1.35);
    // Clavada de pie, algo inclinada, con la compuerta mirando a la arena.
    const toArena = Math.atan2(b.arena.center.x - spot.x, b.arena.center.z - spot.z);
    g.rotation.set(0.28, toArena, 0, 'YXZ');
    g.position.set(spot.x, spot.y - 0.5, spot.z);
    b.root.add(g);
    const hatch = buildCapsuleHatch();
    const doorLocal = new THREE.Vector3(0, 1.05 * 1.35, 1.05 * 1.35);
    g.updateMatrixWorld(true);
    const door = doorLocal.clone().applyMatrix4(g.matrixWorld);
    // Compuerta cerrada (hasta abrirla).
    hatch.position.copy(door);
    hatch.quaternion.copy(g.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
    hatch.scale.setScalar(1.35);
    b.root.add(hatch);
    const smoke = new THREE.Group();
    b.capsule = { group: g, hatch, door: { x: door.x, y: door.y, z: door.z }, smoke, hatchV: null, light: cap.interiorLight };
    this._d.colliders.add('capsule2', [{ x: spot.x, z: spot.z, r: 1.5, y0: spot.y - 1, y1: spot.y + 3, wall: true }], { enabled: () => this._worlds.activeId === this._home });
    if (opened) {
      hatch.position.set(door.x + Math.sin(toArena) * 2.5, this._worlds.get(this._home).getHeightAt(door.x, door.z) + 0.05, door.z + Math.cos(toArena) * 2.5);
      hatch.rotation.set(0.1, toArena, 0);
    }
  }

  _updateCapsule(dt) {
    const c = this._built.capsule;
    if (c.hatchV) {
      c.hatch.position.addScaledVector(c.hatchV, dt);
      c.hatchV.y -= 9.8 * dt;
      c.hatch.rotation.x += dt * 6;
      const gy = this._worlds.get(this._home).getHeightAt(c.hatch.position.x, c.hatch.position.z) + 0.05;
      if (c.hatch.position.y <= gy) {
        c.hatch.position.y = gy;
        c.hatch.rotation.set(0.1, c.hatch.rotation.y, 0);
        c.hatchV = null;
      }
    }
    if (c.light) c.light.intensity = 1 + Math.sin(this._t * 9) * 0.2;
  }

  // ---- 5. Nova -----------------------------------------------------------------------

  _openCapsule2() {
    const s = this.state;
    const b = this._built;
    if (s.capsuleOpened) return;
    this._autosave('la cápsula');
    s.capsuleOpened = true;
    const c = b.capsule;
    const out = new THREE.Vector3(c.door.x - b.capsuleSpot.x, 0, c.door.z - b.capsuleSpot.z).normalize();
    c.hatchV = out.clone().multiplyScalar(5).add(new THREE.Vector3(0, 4, 0));
    this._lock(true);
    const P = this._player;
    const start = new THREE.Vector3(c.door.x, c.door.y, c.door.z).addScaledVector(out, -0.4);
    this._spawnNova(start);
    const nova = this.nova;
    nova.speed = 1.6;
    const eye = new THREE.Vector3();
    nova.lookAt = eye;
    const camPos = new THREE.Vector3();
    this._ui.letterbox(true, '');
    this._sequence([
      { at: 0.2, run: () => nova.setFace('SCAN') },
      { at: 1.2, run: () => nova.setFace('NORMAL') },
    ], {
      duration: 3.2,
      tick: () => {
        eye.copy(P.position).add(new THREE.Vector3(0, 1.6, 0));
        nova.target.copy(P.position).add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(new THREE.Vector3(c.door.x - P.position.x, 0, c.door.z - P.position.z).normalize(), 1.6);
        const side = new THREE.Vector3(-(nova.position.z - P.position.z), 0, nova.position.x - P.position.x).normalize();
        camPos.copy(P.position).add(nova.position).multiplyScalar(0.5).addScaledVector(side, 3.2).add(new THREE.Vector3(0, 1.2, 0));
        this._cam.setCinematic(() => ({ pos: camPos, look: nova.position.clone().lerp(eye, 0.5) }), { speed: 3 });
      },
      done: () => this._novaIntro(),
    });
  }

  _novaIntro() {
    const s = this.state;
    const N = `🤖 ${s.watchName}`;
    const color = NOVA_COLOR(s);
    const nova = this.nova;
    const say = (text, face) => ({ speaker: N, color, text, onShow: () => nova.setFace(face) });
    this._ui.dialog([
      say('Sistemas… en línea. ¡Oh! ¡Hola!', 'HAPPY'),
      say(`Llevas mi reloj: por eso tengo este nombre. Soy ${s.watchName}, la IA de la nave Sample. Mi núcleo viajaba en esta cápsula de emergencia.`, 'NORMAL'),
      say('La nave se partió al entrar en la atmósfera. No sé dónde ha caído… ni si queda alguien más.', 'WORRIED'),
      say('Quieto un momento, voy a escanearte.', 'NORMAL'),
    ], () => {
      nova.setFace('SCAN');
      nova.scan(this._player.position, 3.5);
      this._after(3.6, () => {
        this._ui.dialog([
          say('Constantes vitales estables. Contusiones leves. Vivirás.', 'HAPPY'),
          say('Voy a lanzar un escáner de largo alcance para encontrar la nave. Tardará 24 horas.', 'NORMAL'),
          say('Mientras tanto, te acompaño. Si algo se acerca, te aviso.', 'HAPPY'),
        ], () => {
          s.novaActive = true;
          s.stage = 'SCAN';
          s.scanStart = this._absHours();
          this._cam.setCinematic(null, { speed: 2.5 });
          this._ui.letterbox(false);
          this._lock(false);
          this.nova.speed = 4;
          this._refresh();
          this._msg(`📡 ${s.watchName} está buscando la nave: 24 horas de juego.`, 'info');
          this._autosave(`${s.watchName} se une a ti`);
        });
      });
    });
  }

  _absHours() {
    const time = this._d.time;
    return time.day * 24 + time.hour;
  }

  scanLeft() {
    if (this.state.scanStart === null) return 24;
    return Math.max(0, 24 - (this._absHours() - this.state.scanStart));
  }

  _spawnNova(at) {
    if (!this.nova) {
      this.nova = new NovaBot({ scene: this._worlds.rootOf(this._home), color: NOVA_COLOR(this.state) });
    }
    this.nova.position.copy(at);
    this.nova.target.copy(at);
    this.nova.setVisible(true);
  }

  _faceFor(face, seconds) {
    if (!this.nova || this._seq) return;
    this.nova.setFace(face);
    this._faceTimer = seconds;
  }

  /** Nova flota junto al jugador (o donde la historia diga) y comenta cosas. */
  _updateNova(dt) {
    const nova = this.nova;
    nova.setVisible(this._worlds.activeId === this._home && !this._d.part2?.novaDocked?.());
    if (!nova.group.visible) return;
    const P = this._player;
    if (!this._seq && this.state.novaActive && !this._d.part2?.novaBusy?.()) {
      const behind = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));
      const side = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      nova.target.copy(P.position).addScaledVector(behind, 1.4).addScaledVector(side, 1.1).add(new THREE.Vector3(0, 1.9 + Math.sin(this._t * 0.8) * 0.15, 0));
      // Si el jugador se aleja mucho de golpe (teletransporte, caída), Nova aparece junto a él.
      if (nova.position.distanceTo(P.position) > 30) nova.position.copy(nova.target);
      nova.lookAt = P.position.clone().add(new THREE.Vector3(0, 1.5, 0));
      if (this._faceTimer !== undefined) {
        this._faceTimer -= dt;
        if (this._faceTimer <= 0) {
          this._faceTimer = undefined;
          nova.setFace(this._d.time.isNight ? 'WORRIED' : 'NORMAL');
        }
      }
      this._remarkIn -= dt;
      if (this._remarkIn <= 0 && !this._ui.dialogOpen) {
        this._remarkIn = 70 + Math.random() * 60;
        this._novaRemark();
      }
    }
    nova.update(dt);
  }

  _novaRemark() {
    const s = this.state;
    const n = s.watchName;
    const lines = this._d.time.isNight
      ? ['De noche salen slimes. Mantente cerca de la luz.', 'Mis sensores detectan movimiento entre los árboles… cuidado.']
      : s.stage === 'SCAN'
        ? [`Escáner al ${Math.round(100 - (this.scanLeft() / 24) * 100)} %. Paciencia.`, 'Este planeta tiene una flora fascinante. Lástima que también tenga gólems.', '¿Has comido? Los humanos funcionáis mal sin comida.']
        : this._d.part2?.remarks?.() ?? ['Sigo aquí.'];
    const text = lines[Math.floor(Math.random() * lines.length)];
    this._msg(`🤖 ${n}: ${text}`, 'ai');
    this._faceFor(this._d.time.isNight ? 'WORRIED' : 'HAPPY', 4);
  }
}

function p0(g) {
  return g.position;
}
