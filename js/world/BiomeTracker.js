import { GameEvents } from '../core/GameEvents.js';

/**
 * BiomeTracker — sabe en qué bioma está el jugador y avisa cuando cambia.
 *
 * - Consulta `world.getBiomeAt()` unas pocas veces por segundo (no cada frame).
 * - Histéresis: solo cambia de bioma cuando el nuevo supera SWITCH_WEIGHT,
 *   así no hay avisos repetidos al caminar por una frontera.
 * - Emite PLAYER_BIOME_CHANGED { biome }. UIManager lo muestra. (TemperatureSystem
 *   mezcla las temperaturas por pesos con world.getBiomeAt, sin histéresis.)
 */
const CHECK_INTERVAL = 0.4; // s
const SWITCH_WEIGHT = 0.65;

export class BiomeTracker {
  constructor({ world, target, events }) {
    this.name = 'biomeTracker';
    this._world = world;
    this._target = target;
    this._events = events;
    this._timer = 0;
    /** Último bioma confirmado: { id, name, weights, temperature } */
    this.current = null;

    events.on(GameEvents.BODY_CHANGED, () => {
      this.current = null;
      this._timer = 0;
    });
    events.on(GameEvents.WORLD_GENERATED, () => {
      this.current = null;
      this._timer = 0;
    });
  }

  update(dt) {
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = CHECK_INTERVAL;

    const p = this._target.position;
    const biome = this._world.getBiomeAt(p.x, p.z);
    const changed = !this.current || (biome.id !== this.current.id && biome.weights[biome.id] >= SWITCH_WEIGHT);
    if (changed) {
      const first = !this.current;
      this.current = biome;
      this._events.emit(GameEvents.PLAYER_BIOME_CHANGED, { biome, first });
    } else if (biome.id === this.current.id) {
      this.current = biome; // refresca pesos/temperatura
    }
  }
}
