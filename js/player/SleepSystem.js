import { GameEvents } from '../core/GameEvents.js';

/**
 * SleepSystem — dormir en una cama. Sencillo: sin fatiga psicológica, sueños
 * ni ciclos biológicos.
 *
 * Al recibir SLEEP_REQUEST (E sobre una cama):
 *   1. Bloquea la entrada y emite PLAYER_SLEEP_STARTED (la UI funde a negro).
 *   2. A mitad del sueño aplica los efectos: recupera energía y gasta algo de
 *      hambre y sed (han pasado horas), y emite PLAYER_SLEPT { hours, bed }.
 *      TimeSystem escucha ese evento para adelantar el reloj.
 *   3. Devuelve el control.
 */
export class SleepSystem {
  constructor({ config, energy, hunger, thirst, input, events }) {
    this.name = 'sleep';
    this._cfg = config;
    this._energy = energy;
    this._hunger = hunger;
    this._thirst = thirst;
    this._input = input;
    this._events = events;
    this.sleeping = false;
    this._timer = 0;
    this._applied = false;
    this._bed = null;

    events.on(GameEvents.SLEEP_REQUEST, ({ bed }) => this.sleep(bed));
  }

  sleep(bed) {
    if (this.sleeping) return false;
    this.sleeping = true;
    this._timer = 0;
    this._applied = false;
    this._bed = bed;
    this._input.setBlocked('sleep', true);
    this._events.emit(GameEvents.PLAYER_SLEEP_STARTED, { bed, fadeTime: this._cfg.FADE_TIME });
    return true;
  }

  update(dt) {
    if (!this.sleeping) return;
    const c = this._cfg;
    this._timer += dt;
    if (!this._applied && this._timer >= c.FADE_TIME + c.DURATION / 2) {
      this._applied = true;
      this._energy.rest(c.ENERGY_RESTORED);
      this._hunger.consume(c.HUNGER_COST);
      this._thirst.consume(c.THIRST_COST);
    }
    if (this._timer >= c.FADE_TIME + c.DURATION) {
      this.sleeping = false;
      this._input.setBlocked('sleep', false);
      this._events.emit(GameEvents.PLAYER_SLEPT, { hours: c.HOURS, bed: this._bed, fadeTime: c.FADE_TIME });
    }
  }
}
