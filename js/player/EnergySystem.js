import { GameEvents } from '../core/GameEvents.js';
import { VitalStat } from './VitalStat.js';

/**
 * EnergySystem — cansancio (100 = descansado, 0 = agotado).
 *
 * - Baja con el tiempo (ENERGY_DECAY) y con la actividad: correr (por segundo),
 *   saltar, golpear y recoger (por acción).
 * - Efectos: por debajo de ENERGY_NO_RUN_RATIO no se puede correr; a 0 se camina
 *   más despacio. Se exponen con `getMovementModifiers()`; el controlador los
 *   aplica sin saber de dónde vienen.
 * - `rest(amount)`: recuperación (la usa SleepSystem al dormir).
 */
export class EnergySystem extends VitalStat {
  constructor({ config, events, player }) {
    super({
      id: 'ENERGY',
      max: config.MAX_ENERGY,
      lowRatio: config.LOW_RATIO,
      criticalRatio: config.CRITICAL_RATIO,
      events,
    });
    this.name = 'energy';
    this._cfg = config;
    this._player = player;
    this.paused = false;

    events.on(GameEvents.PLAYER_ACTION, ({ kind }) => {
      if (kind === 'hit' || kind === 'harvest') this.consume(config.ENERGY_ACTION_COST);
    });
    events.on(GameEvents.PLAYER_JUMPED, () => this.consume(config.ENERGY_JUMP_COST));
  }

  rest(amount) {
    return this.add(amount);
  }

  getMovementModifiers() {
    return {
      canRun: this.ratio > this._cfg.ENERGY_NO_RUN_RATIO,
      speedMultiplier: this.value <= 0 ? this._cfg.EXHAUSTED_SPEED_MULTIPLIER : 1,
    };
  }

  update(dt) {
    if (this.paused) return;
    let drain = this._cfg.ENERGY_DECAY;
    if (this._player.state.isRunning) drain += this._cfg.ENERGY_RUN_EXTRA;
    this.consume(drain * dt);
  }
}
