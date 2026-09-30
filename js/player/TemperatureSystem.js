import { GameEvents } from '../core/GameEvents.js';

/**
 * TemperatureSystem — temperatura OCULTA del jugador (Fase 10). Sin Three.js.
 *
 * Temperatura ambiente en la posición del jugador:
 *     bioma (media de BIOMES.*.TEMPERATURE por pesos)
 *   − altura (ALTITUDE_LAPSE por metro sobre ALTITUDE_REFERENCE)
 *   − noche (TimeSystem, más en las Montañas Heladas)
 *   + refugio (construcciones y nave; un interior climatizado nunca baja de HEATED_TEMPERATURE)
 *
 * La temperatura del jugador (`value`) se acerca a la ambiente poco a poco:
 * baja como mucho LOSS_RATE °C/s y se recupera a RECOVERY_RATE °C/s. Por debajo
 * de COMFORT la armadura multiplica la pérdida (EQUIPMENT.ARMOR_COLD_RESISTANCE):
 * el jugador se enfría más despacio y se queda en una temperatura menos extrema.
 *
 * Estados: NORMAL → COLD (escarcha) → FREEZING (más escarcha, peor visibilidad)
 * → CRITICAL (daño por el evento PLAYER_DAMAGED con source 'COLD'). Al volver a
 * una zona templada deja de doler en el acto y la temperatura se recupera poco a poco.
 *
 * No toca la UI ni la escena: emite TEMPERATURE_CHANGED (con `frost` 0..1 y
 * `visibility` continuos, para efectos graduales) y TEMPERATURE_STATE_CHANGED.
 */
export const TemperatureState = Object.freeze({
  NORMAL: 'NORMAL',
  COLD: 'COLD',
  FREEZING: 'FREEZING',
  CRITICAL: 'CRITICAL',
});

export class TemperatureSystem {
  /**
   * @param {object} p.config     sección TEMPERATURE
   * @param {object} p.biomes     PLANETS.*.BIOMES (temperatura base por bioma)
   * @param {object} p.world      { getBiomeAt(x, z) → { weights }, seaLevel }
   * @param {object} p.time       { nightTemperatureDrop, nightFactor }
   * @param {object} p.player     { position }
   * @param {object} p.equipment  { getColdLossMultiplier() }
   * @param {object} p.shelter    { getShelterAt(x, y, z) → { factor, heated } }
   */
  constructor({ config, biomes, world, time, player, equipment, shelter = null, events }) {
    this.name = 'temperature';
    this._cfg = config;
    this._biomes = biomes;
    this._world = world;
    this._time = time;
    this._player = player;
    this._equipment = equipment;
    this._shelter = shelter;
    this._events = events;

    this.paused = false;
    this.immune = false;       // herramienta Admin
    this.value = null;         // temperatura del jugador (°C); null hasta la primera muestra
    this.ambient = null;
    this.target = null;
    this.state = TemperatureState.NORMAL;
    this.details = null;       // desglose de la última muestra (Admin)
    this._sampleTimer = 0;
    this._damageTimer = 0;

    const reset = () => {
      this.value = null;
      this._damageTimer = 0;
      this._setState(TemperatureState.NORMAL, true);
    };
    events.on(GameEvents.PLAYER_RESPAWNED, reset);
    events.on(GameEvents.WORLD_GENERATED, reset);
  }

  /** Temperatura ambiente y su desglose en (x, y, z). */
  sampleAmbient(x, y, z) {
    const c = this._cfg;
    const info = this._world.getBiomeAt(x, z);
    const weights = info.weights;
    // La temperatura mezclada por pesos la da el mundo activo (el planeta o una luna).
    let biome = info.temperature;
    if (biome === undefined) {
      biome = 0;
      let total = 0;
      for (const [id, w] of Object.entries(weights)) {
        const def = this._biomes[id];
        if (!def || !(w > 0)) continue;
        biome += def.TEMPERATURE * w;
        total += w;
      }
      biome = total > 0 ? biome / total : 15;
    }
    const altitude = Math.max(0, Math.min(200, y - this._world.seaLevel - c.ALTITUDE_REFERENCE)) * c.ALTITUDE_LAPSE;
    const mountain = weights.FROZEN_MOUNTAINS ?? 0;
    const night = this._time.nightTemperatureDrop + this._time.nightFactor * c.MOUNTAIN_NIGHT_EXTRA_DROP * mountain;
    const shelter = this._shelter?.getShelterAt(x, y, z) ?? { factor: 0, heated: false };
    let ambient = biome - altitude - night + shelter.factor * c.SHELTER_BONUS;
    if (shelter.heated) ambient = Math.max(ambient, c.HEATED_TEMPERATURE);
    return { ambient, biome, altitude, night, shelter: shelter.factor, heated: !!shelter.heated };
  }

  /** Temperatura a la que tiende el jugador con una temperatura ambiente dada. */
  targetFor(ambient) {
    const c = this._cfg;
    if (ambient >= c.COMFORT) return ambient;
    const loss = this._equipment.getColdLossMultiplier();
    return Math.max(c.MIN_TEMPERATURE, c.COMFORT - (c.COMFORT - ambient) * loss);
  }

  update(dt) {
    if (this.paused) return;
    const c = this._cfg;
    this._sampleTimer -= dt;
    const sample = this._sampleTimer <= 0 || this.value === null;
    if (sample) {
      this._sampleTimer = c.SAMPLE_INTERVAL;
      const p = this._player.position;
      this.details = this.sampleAmbient(p.x, p.y, p.z);
      this.ambient = this.details.ambient;
      this.target = this.immune ? Math.max(this.targetFor(this.ambient), c.COMFORT) : this.targetFor(this.ambient);
      if (this.value === null) this.value = Math.max(this.target, c.COLD_THRESHOLD + 1); // aparecer nunca congela
    }

    // Acercamiento gradual (nunca de golpe).
    const diff = this.target - this.value;
    if (diff < 0) {
      const rate = c.LOSS_RATE * this._equipment.getColdLossMultiplier();
      this.value = Math.max(this.target, this.value - rate * dt);
    } else if (diff > 0) {
      this.value = Math.min(this.target, this.value + c.RECOVERY_RATE * dt);
    }

    this._setState(this._stateFor(this.value));
    this._applyDamage(dt);
    if (sample) this._emitChanged();
  }

  /** Fija la temperatura del jugador (Admin). */
  set(value) {
    this.value = Math.max(this._cfg.MIN_TEMPERATURE, value);
    this._setState(this._stateFor(this.value));
    this._emitChanged();
  }

  /** Escarcha 0..1: 0 hasta COLD_THRESHOLD, 0.5 en FREEZING_THRESHOLD, 1 en DAMAGE_THRESHOLD. */
  get frost() {
    const c = this._cfg;
    const v = this.value ?? c.COMFORT;
    if (v >= c.COLD_THRESHOLD) return 0;
    if (v >= c.FREEZING_THRESHOLD) return (0.5 * (c.COLD_THRESHOLD - v)) / (c.COLD_THRESHOLD - c.FREEZING_THRESHOLD);
    if (v >= c.DAMAGE_THRESHOLD) return 0.5 + (0.5 * (c.FREEZING_THRESHOLD - v)) / (c.FREEZING_THRESHOLD - c.DAMAGE_THRESHOLD);
    return 1;
  }

  /** Factor de distancia de visión: 1 hasta FREEZING_THRESHOLD, baja hasta FREEZING_VISIBILITY. */
  get visibility() {
    const c = this._cfg;
    const v = this.value ?? c.COMFORT;
    const t = Math.min(1, Math.max(0, (c.FREEZING_THRESHOLD - v) / (c.FREEZING_THRESHOLD - c.DAMAGE_THRESHOLD)));
    return 1 - (1 - c.FREEZING_VISIBILITY) * t;
  }

  _stateFor(v) {
    const c = this._cfg;
    if (v >= c.COLD_THRESHOLD) return TemperatureState.NORMAL;
    if (v >= c.FREEZING_THRESHOLD) return TemperatureState.COLD;
    if (v >= c.DAMAGE_THRESHOLD) return TemperatureState.FREEZING;
    return TemperatureState.CRITICAL;
  }

  _setState(state, silent = false) {
    if (state === this.state) return;
    const previous = this.state;
    this.state = state;
    if (!silent) this._events.emit(GameEvents.TEMPERATURE_STATE_CHANGED, { state, previous });
  }

  _applyDamage(dt) {
    const c = this._cfg;
    // Solo duele mientras sigue expuesto: al volver al calor (se está recuperando) deja de doler.
    const recovering = this.target > this.value + 0.01;
    if (this.state !== TemperatureState.CRITICAL || this.immune || recovering) {
      this._damageTimer = 0;
      return;
    }
    this._damageTimer += dt;
    if (this._damageTimer < c.DAMAGE_TICK) return;
    this._damageTimer -= c.DAMAGE_TICK;
    const perSecond = c.COLD_DAMAGE + Math.max(0, c.DAMAGE_THRESHOLD - this.value) * c.COLD_DAMAGE_PER_DEGREE;
    this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: perSecond * c.DAMAGE_TICK, source: 'COLD' });
  }

  _emitChanged() {
    this._events.emit(GameEvents.TEMPERATURE_CHANGED, {
      value: this.value,
      ambient: this.ambient,
      target: this.target,
      state: this.state,
      frost: this.frost,
      visibility: this.visibility,
    });
  }
}
