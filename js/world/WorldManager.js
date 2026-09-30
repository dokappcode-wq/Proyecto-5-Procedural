import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { deriveSeed } from '../core/SeededRandom.js';
import { WorldGenerator } from './WorldGenerator.js';

/**
 * WorldManager — los cuerpos que se pueden pisar: el planeta de inicio, sus
 * lunas y el espacio. Cada uno es un mundo propio con su terreno, recursos y estado, que se
 * conserva al irse y volver (lo talado, lo construido…).
 *
 * El resto de sistemas no sabe que hay varios: reciben `proxy`, un objeto que
 * reenvía todas las consultas (getHeightAt, resources, water, getBiomeAt…) al
 * cuerpo ACTIVO. Cambiar de cuerpo = `setActive(id)`: oculta la escena del
 * anterior, muestra la del nuevo y emite BODY_CHANGED.
 *
 * Las lunas se generan la primera vez que se visitan (sin emitir WORLD_GENERATED,
 * así no reinician nada) con una seed derivada de la del planeta de inicio.
 * Los perfiles de cada cuerpo vienen del sistema solar (SolarSystem.profiles).
 */
export class WorldManager {
  /**
   * @param {object} p.system   SolarSystem (perfiles por cuerpo y cuerpo de inicio)
   * @param {object} p.options  resto de parámetros de WorldGenerator (config, resourceTypes, propColors, landing…)
   */
  constructor({ scene, system, events, options }) {
    this.name = 'world';
    this._scene = scene;
    this._planets = system.profiles;
    this.homeId = system.homeId;
    this._events = events;
    this._opts = options;
    this._bodies = new Map(); // id → { world, root }
    this._extra = new Map();  // cuerpos sin terreno (el espacio): id → objeto con la misma interfaz
    this._focus = null;
    this.activeId = this.homeId;

    this._create(this.homeId);

    const self = this;
    this.proxy = new Proxy({}, {
      get(_, key) {
        // Regenerar (Admin: cambiar seed) siempre es el planeta de inicio.
        if (key === 'generate') return (seed, opts) => self.regenerateHome(seed, opts);
        const w = self.active;
        const v = w[key];
        return typeof v === 'function' ? v.bind(w) : v;
      },
    });

    // Nueva seed del planeta → las lunas cambian: se descartan y se regenerarán.
    events.on(GameEvents.WORLD_GENERATED, () => {
      for (const id of [...this._bodies.keys()]) if (id !== this.homeId) this._discard(id);
    });
  }

  get home() {
    return this._bodies.get(this.homeId).world;
  }

  get active() {
    return this._extra.get(this.activeId) ?? this._bodies.get(this.activeId).world;
  }

  /** Perfil del cuerpo activo (o del indicado). */
  profile(id = this.activeId) {
    return this._planets[id] ?? this._extra.get(id)?.planet ?? null;
  }

  /** Registra un cuerpo sin terreno (el espacio) con la interfaz de mundo. */
  registerExtra(id, world) {
    this._extra.set(id, world);
  }

  /** Mundo de un cuerpo (lo genera la primera vez). */
  get(id) {
    if (this._extra.has(id)) return this._extra.get(id);
    if (!this._bodies.has(id)) this._create(id);
    return this._bodies.get(id).world;
  }

  has(id) {
    return this._bodies.has(id) || this._extra.has(id);
  }

  setActive(id) {
    if (id === this.activeId) return;
    const previous = this.activeId;
    const world = this.get(id); // genera si hace falta
    const old = this._bodies.get(previous);
    if (old) old.root.visible = false;
    const next = this._bodies.get(id);
    if (next) next.root.visible = true;
    this.activeId = id;
    if (this._focus) world.follow?.(this._focus);
    this._events.emit(GameEvents.BODY_CHANGED, { id, previous, planet: this.profile(id) });
  }

  follow(position) {
    this._focus = position;
    for (const { world } of this._bodies.values()) world.follow(position);
  }

  regenerateHome(seed) {
    if (this.activeId !== this.homeId) this.setActive(this.homeId);
    this.home.generate(seed);
  }

  update(dt) {
    this.active.update?.(dt);
  }

  _create(id) {
    const planet = this._planets[id];
    if (!planet) throw new Error(`Cuerpo desconocido: ${id}`);
    const root = new THREE.Group();
    root.name = `World_${id}`;
    root.visible = id === this.activeId;
    this._scene.add(root);
    const o = this._opts;
    const world = new WorldGenerator({
      ...o,
      scene: root,
      planet,
      events: this._events,
      propColors: { ...o.propColors, ...(planet.PROP_COLORS ?? {}) },
    });
    if (this._focus) world.follow(this._focus);
    this._bodies.set(id, { world, root });
    const homeSeed = this._bodies.get(this.homeId)?.world?.seed;
    if (id !== this.homeId && homeSeed) {
      // Seed de la luna derivada de la del planeta (misma seed → mismas lunas).
      world.generate(`${homeSeed.text}/${id}:${deriveSeed(homeSeed.value, id)}`, { emitEvent: false });
    }
    return world;
  }

  _discard(id) {
    const b = this._bodies.get(id);
    if (!b) return;
    b.world.dispose();
    this._bodies.delete(id);
  }
}
