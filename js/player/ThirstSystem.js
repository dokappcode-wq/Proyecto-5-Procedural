import { GameEvents } from '../core/GameEvents.js';
import { VitalStat } from './VitalStat.js';
import { starvationTick } from './HungerSystem.js';

/**
 * ThirstSystem — sed (100 = hidratado, 0 = deshidratado).
 *
 * - Baja con el tiempo (THIRST_DECAY), más deprisa que el hambre.
 * - A 0 hace daño periódico emitiendo PLAYER_DAMAGED.
 * - Beber: escucha PLAYER_DRANK (fuentes de agua; el odre de la Fase 8 usará el
 *   mismo camino) y recupera DRINK_AMOUNT.
 */
export class ThirstSystem extends VitalStat {
  constructor({ config, events }) {
    super({
      id: 'THIRST',
      max: config.MAX_THIRST,
      lowRatio: config.LOW_RATIO,
      criticalRatio: config.CRITICAL_RATIO,
      events,
    });
    this.name = 'thirst';
    this._cfg = config;
    this._damageTimer = 0;
    this.paused = false;
    events.on(GameEvents.PLAYER_DRANK, ({ amount }) => this.drink(amount ?? config.DRINK_AMOUNT));
  }

  drink(amount) {
    return this.add(amount);
  }

  update(dt) {
    if (this.paused) return;
    this.consume(this._cfg.THIRST_DECAY * dt);
    this._damageTimer = starvationTick(this, dt, this._damageTimer, this._cfg.DEHYDRATION_DAMAGE, 'THIRST', this._cfg, this._events);
  }
}
