import { GameEvents } from '../core/GameEvents.js';
import { VitalStat } from './VitalStat.js';

/**
 * EnergySystem — energía para hacer esfuerzos (100 = descansado, 0 = agotado).
 *
 * - NO baja con el tiempo: se gasta al esforzarse
 *     correr (por segundo), nadar deprisa, escalar (y agarrarse a una pared),
 *     saltar, golpear, talar, picar y romper (por golpe).
 * - Se recupera sola al dejar de esforzarse (ENERGY_REGEN_DELAY s después), más
 *   despacio con hambre o sed bajas. Dormir la llena (`rest`, SleepSystem).
 * - Agotado (llega a 0): no se puede correr ni escalar hasta recuperar
 *   ENERGY_NO_RUN_RATIO, y se camina algo más despacio. Lo aplica el controlador
 *   con `getMovementModifiers()`, sin saber de dónde viene.
 */
export class EnergySystem extends VitalStat {
  constructor({ config, events, player, hunger = null, thirst = null }) {
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
    this._hunger = hunger;
    this._thirst = thirst;
    this.paused = false;
    this.exhausted = false;  // tras llegar a 0, hasta recuperar ENERGY_NO_RUN_RATIO
    this._restTimer = 0;     // s sin esfuerzo

    events.on(GameEvents.PLAYER_ACTION, ({ kind }) => {
      if (kind === 'hit' || kind === 'harvest') this.spend(config.ENERGY_ACTION_COST);
      else if (kind === 'chop') this.spend(config.ENERGY_CHOP_COST);
    });
    events.on(GameEvents.PLAYER_JUMPED, () => this.spend(config.ENERGY_JUMP_COST));
    events.on(GameEvents.PLAYER_DODGED, () => this.spend(config.ENERGY_DODGE_COST ?? 10));
  }

  /** Gasto puntual (un golpe, un salto): también reinicia la espera para recuperarse. */
  spend(amount) {
    this._restTimer = 0;
    this.consume(amount);
    this._checkExhausted();
  }

  rest(amount) {
    const r = this.add(amount);
    this._checkExhausted();
    return r;
  }

  /** ¿Queda energía para un esfuerzo (golpear, escalar)? */
  get canWork() {
    return this.value > 0;
  }

  getMovementModifiers() {
    if (this.value <= 0) this.exhausted = true;
    else if (this.ratio >= this._cfg.ENERGY_NO_RUN_RATIO) this.exhausted = false;
    return {
      canRun: !this.exhausted,
      canClimb: !this.exhausted && this.value > 0,
      speedMultiplier: this.exhausted ? this._cfg.EXHAUSTED_SPEED_MULTIPLIER : 1,
    };
  }

  update(dt) {
    if (this.paused) return;
    const c = this._cfg;
    const s = this._player.state;
    let cost = 0;
    if (s.isClimbing) cost = s.isMoving ? c.ENERGY_CLIMB_COST : c.ENERGY_CLIMB_HOLD_COST;
    else if (s.isRunning && s.isMoving) cost = s.isSwimming ? c.ENERGY_SWIM_RUN_COST : c.ENERGY_RUN_COST;
    if (cost > 0) {
      this._restTimer = 0;
      this.consume(cost * dt);
    } else {
      this._restTimer += dt;
      if (this._restTimer >= c.ENERGY_REGEN_DELAY && this.value < this.max) {
        const low = (st) => st && st.ratio < c.LOW_RATIO;
        const k = low(this._hunger) || low(this._thirst) ? c.ENERGY_REGEN_HUNGRY : 1;
        this.add(c.ENERGY_REGEN * k * (this.regenMultiplier ?? 1) * dt);
      }
    }
    this._checkExhausted();
  }

  _checkExhausted() {
    const was = this.exhausted;
    if (this.value <= 0) this.exhausted = true;
    else if (this.ratio >= this._cfg.ENERGY_NO_RUN_RATIO) this.exhausted = false;
    if (was !== this.exhausted) this.emitState(); // el controlador vuelve a leer los modificadores
  }
}
