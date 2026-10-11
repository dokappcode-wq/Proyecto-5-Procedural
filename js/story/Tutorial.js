import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * Tutorial — si el jugador lo elige al empezar: pasos con instrucciones y una flecha que
 * señala dónde ir (una flecha flotando sobre el objetivo y otra en pantalla que gira
 * hacia él). Cada paso se completa solo al hacerlo. K lo salta.
 *
 * Primero, en el Valle del Despertar (la zona inicial, como en la lámina de referencia):
 *   moverse → saltar → trepar → registrar los restos de la nave → combate (slimes) →
 *   torre de reconocimiento → templo de desafío → salida del valle
 * y después, ya fuera: madera → piedras → fabricar → telaraña → manzanas → guardar →
 *   torre del ermitaño → subir y hablar con él.
 * Los pasos del valle se saltan si no hay valle o si ya se salió de él (partidas antiguas).
 */
export const STEPS = [
  { id: 'MOVE', valley: true, text: 'Muévete con WASD y mira con el ratón (Shift corre). Sigue la flecha hasta las piedras.' },
  { id: 'JUMP', valley: true, text: 'Salta con Espacio de piedra en piedra hasta lo alto de la Peña de los Saltos.' },
  { id: 'CLIMB', valley: true, text: 'Las paredes con lianas se trepan: camina contra ella (gasta energía). Sube a la Roca de los Restos.' },
  { id: 'SEARCH', valley: true, text: 'Registra los restos de la nave con E: recursos, mejoras y un registro de la nave.' },
  { id: 'FIGHT', valley: true, text: 'Hay slimes en las ruinas, cruzando el puente. Ataca con clic izquierdo y esquiva con un toque de Shift.' },
  { id: 'TOWER_SCAN', valley: true, text: 'Activa la torre de reconocimiento del valle con E y mira el mapa (M): se revela la zona.' },
  { id: 'TEMPLE', valley: true, text: 'Abre el templo de desafío del este (E en el monolito), cruza el portal y supera la prueba.' },
  { id: 'EXIT', valley: true, text: 'La losa del sur se ha apartado: sal del valle por la garganta hasta el mirador.' },
  { id: 'WOOD', text: 'Golpea un tronco manteniendo el clic hasta tener 4 maderas.', target: ['TREE', 'PINE'] },
  { id: 'STONE', text: 'Coge piedras sueltas de una roca con E (4 piedras).', target: ['ROCK'] },
  { id: 'CRAFT', text: 'Abre el reloj con Tab y fabrica una Madera refinada (Materiales).' },
  { id: 'SILK', text: 'Golpea una telaraña: su telaraña sirve para cuerdas y flechas.', target: ['COBWEB'], optional: true },
  { id: 'FOOD', text: 'Coge 2 manzanas de un manzano (E). Selecciónalas y clic derecho para comer.', target: ['APPLE_TREE'], optional: true },
  { id: 'SAVE', text: 'Guarda la partida en el reloj (Tab o I, columna «Tú») 💾 o con E en tu cápsula. De noche salen slimes: ¡cuidado!' },
  { id: 'TOWER', text: 'Sigue la flecha: a lo lejos hay una torre con una luz cálida.' },
  { id: 'HERMIT', text: 'Sube por la escalera de la torre y habla con quien vive arriba (E).' },
];

/** Pasos de las partidas de antes del valle (se guardaba el número de paso). */
const OLD_STEPS = ['MOVE', 'WOOD', 'STONE', 'CRAFT', 'SILK', 'FOOD', 'SAVE', 'TOWER', 'HERMIT'];

export class Tutorial {
  constructor({ story, events, input, inventory, worlds, homeId, player, ui }) {
    this._story = story;
    this._events = events;
    this._inv = inventory;
    this._worlds = worlds;
    this._home = homeId;
    this._player = player;
    this._ui = ui;
    this.active = false;
    this.step = 0;
    this._moved = 0;
    this._last = null;
    this._timer = 0;
    this._crafted = false;
    this._saved = false;
    // Flecha 3D sobre el objetivo.
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.9, depthTest: false });
    this._arrow = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 12), mat);
    cone.rotation.x = Math.PI;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 8), mat);
    stem.position.y = 0.8;
    this._arrow.add(cone, stem);
    this._arrow.renderOrder = 10;
    this._arrow.visible = false;
    this._arrowMat = mat;
    // Flecha en pantalla.
    this._hud = document.createElement('div');
    this._hud.className = 'tut-arrow hidden';
    this._hudIcon = document.createElement('div');
    this._hudIcon.className = 'tut-arrow-icon';
    this._hudIcon.textContent = '➤';
    this._hudDist = document.createElement('small');
    this._hud.append(this._hudIcon, this._hudDist);
    document.body.appendChild(this._hud);
    events.on(GameEvents.ITEM_CRAFTED, ({ recipeId }) => {
      if (recipeId === 'REFINED_WOOD') this._crafted = true;
    });
    events.on(GameEvents.GAME_SAVED, () => (this._saved = true));
    input.onRawKey((e) => {
      if (this.active && e.code === 'KeyK') this.skip();
    });
  }

  /** Empieza en un paso (su id, o el número de paso de una partida antigua). */
  start(step = 0) {
    this.active = true;
    const id = typeof step === 'string' ? step : OLD_STEPS[Math.max(0, Math.min(OLD_STEPS.length - 1, Math.floor(step) || 0))];
    this.step = Math.max(0, STEPS.findIndex((s) => s.id === id));
    this._enter();
    if (!this._arrow.parent) this._worlds.rootOf(this._home)?.add(this._arrow);
  }

  get stepId() {
    return STEPS[this.step]?.id ?? null;
  }

  skip() {
    const v = this._valley;
    this._finish(v && !v.open
      ? '⏭️ Tutorial saltado. Para salir del valle, supera la prueba del templo del este; luego busca la torre del ermitaño.'
      : '⏭️ Tutorial saltado. Busca la torre del ermitaño: una luz cálida a lo lejos.');
  }

  /** El Valle del Despertar (si lo hay). */
  get _valley() {
    return this._story._d?.valley ?? null;
  }

  /** ¿Toca hacer este paso? (los del valle, solo si hay valle y aún no se ha salido de él) */
  _applies(s) {
    if (!s.valley) return true;
    const v = this._valley;
    return !!v && !v.state.vista;
  }

  /** Avisos de la historia (p. ej. la clave ya cogida). */
  onStory(what) {
    if (this.active && what === 'KEY') this._finish('🎓 ¡Tutorial completado!');
  }

  _finish(text) {
    if (!this.active) return;
    this.active = false;
    this._arrow.visible = false;
    this._hud.classList.add('hidden');
    this._events.emit(GameEvents.UI_MESSAGE, { text, type: 'info' });
    this._story.tutorialDone();
  }

  _enter() {
    while (this.step < STEPS.length - 1 && !this._applies(STEPS[this.step])) this.step++;
    const s = STEPS[this.step];
    this._timer = 0;
    this._target = null;
    this._retarget = 0;
    this._ui.setObjective(`(${this.step + 1}/${STEPS.length}) ${s.text}  · K saltar`);
    this._events.emit(GameEvents.UI_MESSAGE, { text: `🧭 ${s.text}`, type: 'biome' });
  }

  _next() {
    this.step++;
    while (this.step < STEPS.length && !this._applies(STEPS[this.step])) this.step++;
    this._story.state.tutStep = this.step;
    if (this.step >= STEPS.length) return this._finish('🎓 ¡Tutorial completado!');
    this._story.state.tutStepId = STEPS[this.step].id;
    this._enter();
  }

  _count(id) {
    return this._inv.getItemCount(id);
  }

  _near(t, r) {
    return !!t && Math.hypot(t.x - this._player.position.x, t.z - this._player.position.z) < r;
  }

  _done(s) {
    const v = this._valley;
    switch (s.id) {
      case 'MOVE': return v ? this._near(v.targets.stones, 5) || this._moved > 70 : this._moved > 8;
      case 'JUMP': return !v || v.onMesa('PENA_SALTOS');
      case 'CLIMB': return !v || v.onMesa('ROCA_RESTOS');
      case 'SEARCH': return !v || v.state.debris;
      case 'FIGHT': return !v || v.slimesBeaten;
      case 'TOWER_SCAN': return !v || !!this._valleyTower()?.active;
      case 'TEMPLE': return !v || v.open;
      case 'EXIT': return !v || v.state.vista;
      case 'WOOD': return this._count('WOOD') >= 4;
      case 'STONE': return this._count('STONE') >= 4;
      case 'CRAFT': return this._crafted || this._count('REFINED_WOOD') > 0;
      case 'SILK': return this._count('SPIDER_SILK') > 0 || (!this._target && this._timer > 4);
      case 'FOOD': return this._count('APPLE') >= 2 || (!this._target && this._timer > 4);
      case 'SAVE': return this._saved || this._timer > 14;
      case 'TOWER': {
        const t = this._story.tutorialTarget;
        return !t || Math.hypot(t.x - this._player.position.x, t.z - this._player.position.z) < 18;
      }
      case 'HERMIT': return false; // se completa al coger la clave (onStory)
      default: return false;
    }
  }

  update(dt) {
    if (!this.active) return;
    this._timer += dt;
    const p = this._player.position;
    if (this._last) this._moved += Math.hypot(p.x - this._last.x, p.z - this._last.z);
    this._last = { x: p.x, z: p.z };
    const s = STEPS[this.step];
    // Objetivo de la flecha.
    this._retarget -= dt;
    if (this._retarget <= 0) {
      this._retarget = 1.5;
      this._target = this._findTarget(s);
    }
    if (this._done(s)) this._next();
    this._updateArrow();
  }

  /** La torre de reconocimiento del valle. */
  _valleyTower() {
    const v = this._valley;
    return v ? this._story._d?.recon?.towers?.find((t) => v.contains(t.x, t.z)) ?? null : null;
  }

  _findTarget(s) {
    const v = this._valley;
    if (s.valley && v) {
      const T = v.targets;
      switch (s.id) {
        case 'MOVE': return T.stones;
        case 'JUMP': return T.shelf;
        case 'CLIMB': return this._near(T.climb, 6) ? T.climbTop : T.climb;
        case 'SEARCH': return T.debris;
        case 'FIGHT': return T.ruins;
        case 'TOWER_SCAN': {
          const t = this._valleyTower();
          return t ? { x: t.x, y: t.y + 4, z: t.z } : null;
        }
        case 'TEMPLE': {
          const temples = this._story._d?.temples;
          if (temples?.current) return null; // dentro del recinto
          const t = temples?.get?.('TRIAL');
          return t ? { x: t.x, y: t.y + 4, z: t.z } : null;
        }
        case 'EXIT': return v.contains(this._player.position.x, this._player.position.z) ? T.gate : T.balcony;
        default: return null;
      }
    }
    if (s.id === 'TOWER' || s.id === 'HERMIT') return this._story.tutorialTarget;
    if (!s.target) return null;
    const w = this._worlds.get(this._home);
    const p = this._player.position;
    let best = null;
    for (const r of [40, 90, 160]) {
      for (const n of w?.resources?.getNodesNear(p.x, p.z, r) ?? []) {
        if (n.removed || !s.target.includes(n.type) || n.cave) continue;
        if (s.id === 'STONE' && !(n.remaining > 0)) continue;
        if (s.id === 'FOOD' && !(n.remaining > 0)) continue;
        const d = Math.hypot(n.x - p.x, n.z - p.z);
        if (!best || d < best.d) best = { d, x: n.x, y: n.y + (n.type === 'COBWEB' ? 1.5 : n.type === 'ROCK' ? 1.6 : 3.2), z: n.z };
      }
      if (best) break;
    }
    return best;
  }

  _updateArrow() {
    const t = this._target;
    const p = this._player.position;
    if (!t || this._worlds.activeId !== this._home) {
      this._arrow.visible = false;
      this._hud.classList.add('hidden');
      return;
    }
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    this._arrow.visible = d < 120;
    const bob = Math.sin(performance.now() / 260) * 0.25;
    this._arrow.position.set(t.x, t.y + 1.2 + bob, t.z);
    this._arrow.scale.setScalar(Math.max(1, d / 25));
    this._arrowMat.color.set(getComputedStyle(document.documentElement).getPropertyValue('--watch-color').trim() || '#ffd84a');
    // Flecha de pantalla: dirección relativa a donde mira el jugador.
    const yaw = this._player.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const ang = Math.atan2(fx * (t.z - p.z) - fz * (t.x - p.x), fx * (t.x - p.x) + fz * (t.z - p.z));
    this._hud.classList.toggle('hidden', d < 6);
    this._hudIcon.style.transform = `rotate(${-90 + (ang * 180) / Math.PI}deg)`;
    this._hudDist.textContent = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
  }
}
