import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { AnimalRenderer } from './AnimalRenderer.js';
import { Deer } from './Deer.js';
import { Goat } from './Goat.js';
import { Cow } from './Cow.js';
import { resolveSpecies } from './SpeciesVariants.js';
import { pickWeighted } from './Animal.js';

/** Registro de especies: añadir una especie = crear su clase y añadirla aquí + config. */
const SPECIES_CLASSES = { DEER: Deer, GOAT: Goat, COW: Cow };

/**
 * AnimalSystem — rebaños de animales del mundo.
 *
 * - Al generarse el mundo crea los rebaños con la sub-seed "animal": cada uno
 *   con su zona (centro + radio) en un bioma adecuado para la especie. Siempre
 *   hay un rebaño de cada especie cerca del punto de inicio.
 * - Solo se SIMULAN y DIBUJAN los animales a menos de ACTIVE_RADIUS del
 *   jugador (el resto queda congelado donde estaba).
 * - Temperamento (huir / curiosidad / neutral) y reacción al golpe (huir /
 *   defenderse) asignados al azar por animal, según las probabilidades de su
 *   especie y derivados de la seed.
 * - hitAnimal(): golpe del jugador. Si el animal muere emite ANIMAL_KILLED
 *   con lo que suelta (carne, lana, cuero). Los ataques de los animales
 *   emiten PLAYER_DAMAGED (lo consumirá HealthSystem en la Fase 6).
 */
export class AnimalSystem {
  constructor({ config, fauna, scene, world, player, events, hitKnockback, bodyId = null }) {
    this.name = 'animals';
    this._cfg = config;
    this._events = events;
    this._hitKnockback = hitKnockback;
    this._fauna = fauna;
    this._world = world;
    this._player = player;
    this.animals = [];
    this.herds = [];
    this.activeCount = 0;

    this._scene = scene;
    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    // Un dibujante por especie (las de un sistema solar pueden tener otro color): se crean al usarse.
    this._renderers = {};
    this._visible = {};
    for (const id of Object.keys(SPECIES_CLASSES)) this._rendererFor(id);

    // Entorno que consultan los animales (sin acoplarlos a WorldGenerator).
    const bounds = () => this._world.getBounds();
    this._env = {
      cfg: config,
      player: { x: 0, z: 0 },
      onAttack: (animal) =>
        events.emit(GameEvents.PLAYER_DAMAGED, {
          amount: animal.def.ATTACK_DAMAGE,
          source: animal.species,
          sourceName: animal.def.NAME,
          fromX: animal.x,
          fromZ: animal.z,
        }),
      playerRunning: false,
      turnSpeed: config.TURN_SPEED,
      groundAt: (x, z) => this._world.getHeightAt(x, z),
      // Recursos + obstáculos extra (paredes y vallas construidas: corrales).
      resolveCollisions: (pos, r, y0, y1) => {
        const a = this._world.resources.resolveCollisions(pos, r);
        const b = this._obstacles?.resolveCollisions(pos, r, y0, y1) ?? false;
        return a || b;
      },
      isWalkable: (x, z) => {
        const b = bounds();
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
        const world = this._world;
        if (world.water.isWater(x, z, 0.6)) return false;
        if (world.isCaveHole?.(x, z)) return false;
        const h = world.getHeightAt(x, z);
        if (h < world.seaLevel + 0.3) return false;
        const slope = Math.abs(world.getHeightAt(x + 0.7, z) - world.getHeightAt(x - 0.7, z)) +
          Math.abs(world.getHeightAt(x, z + 0.7) - world.getHeightAt(x, z - 0.7));
        return slope / 1.4 < config.MAX_SLOPE;
      },
    };

    // Rebaños de cada cuerpo (se generan la primera vez que se visita y se conservan).
    this.bodyId = bodyId;
    this._saved = new Map();
    events.on(GameEvents.WORLD_GENERATED, () => {
      this._saved.clear(); // nueva seed: los demás cuerpos se regenerarán
      this.generate();
    });
  }

  /**
   * Cambia al cuerpo `id` (su mundo y su fauna). Los animales del anterior se
   * guardan tal cual (heridos, muertos, dónde estaban) y los del nuevo se generan
   * la primera vez. Sin fauna, el sistema se apaga y no dibuja nada.
   */
  setBody(id, world, fauna) {
    if (id === this.bodyId) return;
    if (this.bodyId !== null) this._saved.set(this.bodyId, { animals: this.animals, herds: this.herds, world: this._world, fauna: this._fauna });
    this.bodyId = id;
    const saved = this._saved.get(id);
    this._world = world;
    this._fauna = fauna;
    if (saved && saved.world === world) {
      this.animals = saved.animals;
      this.herds = saved.herds;
    } else {
      this.animals = [];
      this.herds = [];
      if (world?.seed && fauna && Object.keys(fauna.HERDS).length) this.generate();
    }
    this.setActive(!!world && this.animals.length > 0);
  }

  /** Definición de una especie en el cuerpo actual (plantilla del motor o variante del sistema). */
  speciesDef(key) {
    return resolveSpecies(key, this._fauna, this._cfg.SPECIES)?.def ?? null;
  }

  _rendererFor(key) {
    if (this._renderers[key]) return this._renderers[key];
    const r = resolveSpecies(key, this._fauna, this._cfg.SPECIES);
    if (!r) return null;
    this._renderers[key] = new AnimalRenderer({
      scene: this._scene,
      model: SPECIES_CLASSES[r.base].buildModel(r.def.COLORS),
      maxInstances: this._cfg.MAX_PER_SPECIES,
      material: this._material,
    });
    this._visible[key] = [];
    return this._renderers[key];
  }

  /**
   * Sin animales (cuerpos sin fauna, el espacio) el sistema se pausa y no dibuja nada.
   */
  setActive(active) {
    this.enabled = active;
    for (const id in this._renderers) {
      this._renderers[id].body.visible = active;
      this._renderers[id].legs.visible = active;
    }
  }

  /** Obstáculos adicionales ({ resolveCollisions(pos, r, y0, y1) }), p. ej. construcciones. */
  setObstacles(obstacles) {
    this._obstacles = obstacles;
  }

  generate() {
    const w = this._world;
    const seed = w.seed.sub.animal;
    const rng = new SeededRandom(seed);
    const spawn = w.getSpawnPoint();
    const bounds = w.getBounds();
    const F = this._fauna;
    this.animals = [];
    this.herds = [];

    for (const [species, count] of Object.entries(F.HERDS)) {
      const def = this.speciesDef(species);
      if (!def || !this._rendererFor(species)) continue;
      for (let h = 0; h < count; h++) {
        const near = h === 0; // el primero de cada especie, cerca del inicio
        for (let attempt = 0; attempt < 120; attempt++) {
          let x;
          let z;
          if (near) {
            const a = rng.range(0, Math.PI * 2);
            const d = rng.range(F.NEAR_SPAWN_DISTANCE[0], F.NEAR_SPAWN_DISTANCE[1] + attempt);
            x = spawn.x + Math.cos(a) * d;
            z = spawn.z + Math.sin(a) * d;
          } else {
            x = rng.range(bounds.minX + 20, bounds.maxX - 20);
            z = rng.range(bounds.minZ + 20, bounds.maxZ - 20);
          }
          if (!this._isGoodHerdSpot(def, x, z)) continue;
          this._createHerd(species, def, x, z, rng, seed);
          break;
        }
      }
    }
  }

  _isGoodHerdSpot(def, x, z) {
    if (!this._env.isWalkable(x, z)) return false;
    const biome = this._world.getBiomeAt(x, z);
    if (!(def.BIOMES[biome.id] > 0) || biome.weights[biome.id] < 0.6) return false;
    for (const h of this.herds) if (Math.hypot(h.x - x, h.z - z) < this._fauna.HERD_RADIUS * 2) return false;
    return true;
  }

  _createHerd(species, def, x, z, rng, seed) {
    const Cls = SPECIES_CLASSES[resolveSpecies(species, this._fauna, this._cfg.SPECIES).base];
    const herd = { id: this.herds.length, species, x, z, radius: this._fauna.HERD_RADIUS, members: [] };
    this.herds.push(herd);
    const size = rng.int(def.HERD_SIZE[0], def.HERD_SIZE[1]);
    for (let i = 0; i < size; i++) {
      let ax = x;
      let az = z;
      for (let t = 0; t < 10; t++) {
        const cx = x + rng.range(-6, 6);
        const cz = z + rng.range(-6, 6);
        if (this._env.isWalkable(cx, cz)) {
          ax = cx;
          az = cz;
          break;
        }
      }
      const id = `${species}-${herd.id}-${i}`;
      const animalRng = new SeededRandom(deriveSeed(seed, id));
      const animal = new Cls({
        id,
        species,
        def,
        x: ax,
        z: az,
        home: herd,
        rng: animalRng,
        scale: rng.range(def.SCALE[0], def.SCALE[1]),
        temperament: pickWeighted(def.TEMPERAMENT_WEIGHTS, animalRng.next()),
        hitReaction: pickWeighted(def.HIT_REACTION_WEIGHTS, animalRng.next()),
      });
      animal.y = this._world.getHeightAt(ax, az);
      herd.members.push(animal);
      this.animals.push(animal);
    }
  }

  update(dt) {
    const p = this._player.position;
    const env = this._env;
    env.player.x = p.x;
    env.player.z = p.z;
    env.playerRunning = this._player.state.isRunning;
    const r2 = this._cfg.ACTIVE_RADIUS ** 2;

    for (const id in this._visible) this._visible[id].length = 0;
    let active = 0;
    for (const a of this.animals) {
      if (a.removed) continue;
      const d2 = (a.x - p.x) ** 2 + (a.z - p.z) ** 2;
      if (d2 > r2) continue;
      a.update(dt, env);
      (this._visible[a.species] ??= []).push(a);
      active++;
    }
    this.activeCount = active;
    for (const id in this._renderers) this._renderers[id].update(this._visible[id] ?? [], dt);
  }

  // ---- Consultas ---------------------------------------------------------------

  /** Animales VIVOS en un radio. */
  getAnimalsNear(x, z, radius, species = null) {
    return this.animals.filter(
      (a) => a.alive && (!species || a.species === species) && Math.hypot(a.x - x, a.z - z) <= radius,
    );
  }

  /**
   * Golpe del jugador a un animal.
   * @returns {{ killed: boolean, drops: object|null }}
   */
  hitAnimal(animal, damage, fromX, fromZ) {
    if (!animal?.alive) return { killed: false, drops: null };
    const { killed } = animal.takeHit(damage, fromX, fromZ, this._cfg, this._hitKnockback);
    this._events.emit(GameEvents.ANIMAL_HIT, { animal, killed });
    if (!killed) return { killed: false, drops: null };
    this._events.emit(GameEvents.ANIMAL_KILLED, { animal, drops: animal.drops });
    return { killed: true, drops: animal.drops };
  }

  /** Retira un animal inmediatamente (depuración). */
  removeAnimal(id) {
    const a = this.animals.find((an) => an.id === id && !an.removed);
    if (a) a.removed = true;
    return a ?? null;
  }

  /** Recuento de temperamentos y reacciones (depuración). */
  getTemperamentStats() {
    const stats = { temperament: {}, hitReaction: {} };
    for (const a of this.animals) {
      if (a.removed) continue;
      stats.temperament[a.temperament] = (stats.temperament[a.temperament] ?? 0) + 1;
      stats.hitReaction[a.hitReaction] = (stats.hitReaction[a.hitReaction] ?? 0) + 1;
    }
    return stats;
  }

  /** Rebaño más cercano de una especie (depuración). */
  nearestHerd(species, x, z) {
    let best = null;
    for (const h of this.herds) {
      if (h.species !== species) continue;
      const d = Math.hypot(h.x - x, h.z - z);
      if (!best || d < best.distance) best = { herd: h, distance: d };
    }
    return best;
  }

  static get speciesIds() {
    return Object.keys(SPECIES_CLASSES);
  }
}
