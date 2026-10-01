import { GameEvents } from '../core/GameEvents.js';

/**
 * DiscoveryTracker — detecta descubrimientos naturales del jugador (sin
 * misiones): la primera vez que llega a cada fuente de agua y la primera vez
 * que ve cada especie animal. Solo emite eventos; UIManager los muestra.
 */
const CHECK_INTERVAL = 0.3; // s

export class DiscoveryTracker {
  constructor({ world, animals, target, events, waterDistance, animalDistance, species }) {
    this.name = 'discovery';
    this._world = world;
    this._animals = animals;
    this._target = target;
    this._events = events;
    this._waterDistance = waterDistance;
    this._animalDistance = animalDistance;
    this._species = species;
    this._timer = 0;
    this._reset();
    events.on(GameEvents.WORLD_GENERATED, () => this._reset());
  }

  _reset() {
    this._ponds = new Set();
    this._seenSpecies = new Set();
  }

  update(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = CHECK_INTERVAL;
    const p = this._target.position;

    const near = this._world.water.nearestPond(p.x, p.z);
    if (near && near.distance <= this._waterDistance && !this._ponds.has(near.pond.id)) {
      this._ponds.add(near.pond.id);
      this._events.emit(GameEvents.WATER_DISCOVERED, { pond: near.pond, first: this._ponds.size === 1 });
    }

    for (const a of this._animals.getAnimalsNear(p.x, p.z, this._animalDistance)) {
      if (this._seenSpecies.has(a.species)) continue;
      this._seenSpecies.add(a.species);
      const def = a.def ?? this._species[a.species];
      this._events.emit(GameEvents.ANIMAL_DISCOVERED, { species: a.species, name: def.NAME, namePlural: def.NAME_PLURAL });
    }
  }
}
