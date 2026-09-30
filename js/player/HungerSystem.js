import { GameEvents } from '../core/GameEvents.js';
import { VitalStat } from './VitalStat.js';

/**
 * HungerSystem — hambre (100 = saciado, 0 = famélico).
 *
 * - Baja con el tiempo (HUNGER_DECAY).
 * - A 0 hace daño periódico emitiendo PLAYER_DAMAGED (no toca la vida directamente).
 * - `eat(amount)` la recupera. Qué alimento da cuánto y el equilibrio
 *   animal/vegetal son de NutritionSystem (Fase 7), separado de este sistema.
 */
export class HungerSystem extends VitalStat {
  constructor({ config, events }) {
    super({
      id: 'HUNGER',
      max: config.MAX_HUNGER,
      lowRatio: config.LOW_RATIO,
      criticalRatio: config.CRITICAL_RATIO,
      events,
    });
    this.name = 'hunger';
    this._cfg = config;
    this._damageTimer = 0;
    this.paused = false;
  }

  eat(amount) {
    return this.add(amount);
  }

  update(dt) {
    if (this.paused) return;
    this.consume(this._cfg.HUNGER_DECAY * dt);
    this._damageTimer = starvationTick(this, dt, this._damageTimer, this._cfg.STARVING_DAMAGE, 'HUNGER', this._cfg, this._events);
  }
}

/** Daño periódico cuando una estadística llega a 0 (compartido con la sed). */
export function starvationTick(stat, dt, timer, damagePerSecond, source, cfg, events) {
  if (stat.value > 0) return 0;
  timer += dt;
  if (timer >= cfg.STAT_DAMAGE_TICK) {
    timer -= cfg.STAT_DAMAGE_TICK;
    events.emit(GameEvents.PLAYER_DAMAGED, { amount: damagePerSecond * cfg.STAT_DAMAGE_TICK, source });
  }
  return timer;
}
