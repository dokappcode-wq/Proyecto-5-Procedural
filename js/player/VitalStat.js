import { GameEvents } from '../core/GameEvents.js';

/**
 * VitalStat — base común de las estadísticas del jugador (vida, hambre, sed,
 * energía). Sin Three.js ni DOM.
 *
 * - Valor acotado entre 0 y `max`.
 * - Emite PLAYER_STAT_CHANGED en cada cambio y PLAYER_STAT_LEVEL al cruzar los
 *   umbrales 'ok' → 'low' → 'critical' (y de vuelta), para que la UI muestre
 *   avisos sin consultar nada.
 * - Cada sistema concreto (HealthSystem, HungerSystem...) añade sus reglas en
 *   `update(dt)` y escucha los eventos que le interesan.
 */
export class VitalStat {
  constructor({ id, max, initial = max, lowRatio, criticalRatio, events }) {
    this.statId = id;
    this.max = max;
    this._value = initial;
    this._low = lowRatio;
    this._critical = criticalRatio;
    this._events = events;
    this._level = this._levelFor(initial / max);
  }

  get value() {
    return this._value;
  }

  get ratio() {
    return this._value / this.max;
  }

  get level() {
    return this._level;
  }

  set(value) {
    const v = Math.min(this.max, Math.max(0, value));
    const delta = v - this._value;
    if (delta === 0) return 0;
    this._value = v;
    const previous = this._level;
    this._level = this._levelFor(this.ratio);
    this.emitState(delta);
    if (this._level !== previous) {
      this._events.emit(GameEvents.PLAYER_STAT_LEVEL, { stat: this.statId, level: this._level, previous, value: v });
    }
    return delta;
  }

  add(amount) {
    return this.set(this._value + amount);
  }

  consume(amount) {
    return -this.set(this._value - amount);
  }

  fill() {
    return this.set(this.max);
  }

  /** Emite el estado actual (p. ej. para que la UI se pinte al arrancar). */
  emitState(delta = 0) {
    this._events.emit(GameEvents.PLAYER_STAT_CHANGED, {
      stat: this.statId,
      value: this._value,
      max: this.max,
      ratio: this.ratio,
      level: this._level,
      delta,
    });
  }

  _levelFor(ratio) {
    if (ratio <= this._critical) return 'critical';
    if (ratio <= this._low) return 'low';
    return 'ok';
  }
}
