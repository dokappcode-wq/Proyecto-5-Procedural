import { GameEvents } from '../core/GameEvents.js';

/**
 * StatusEffects — estados pasajeros por lo que se come (P2). Sin Three.js ni DOM.
 *
 *   WELL_FED     bien alimentado: el hambre baja más despacio, la vida se recupera el doble
 *   WARM         comida caliente: se pierde calor mucho más despacio
 *   ENERGIZED    con energía: la energía se recupera mucho más deprisa
 *   INDIGESTION  indigestión (algo crudo): no se recupera vida y la energía, despacio
 * Pociones (P5): REGENERATION, STRENGTH (daño), SWIFT (velocidad), WARMTH (frío),
 *   NIGHT_VISION (oscuridad) y LEAP (salto y caídas). Llegan con POTION_DRUNK.
 *
 * Cada alimento dice qué estados da y cuánto duran (ITEMS.*.EFFECTS) y si crudo puede
 * sentar mal (RAW_RISK). Volver a comer alarga el estado (no se acumula). Los efectos los
 * aplica main.js leyendo los multiplicadores de aquí. Emite STATUS_EFFECTS_CHANGED.
 */
export class StatusEffects {
  constructor({ config, items, events, hunger = null, thirst = null, random = Math.random }) {
    this.name = 'statusEffects';
    this._cfg = config;
    this._items = items;
    this._events = events;
    this._hunger = hunger;
    this._thirst = thirst;
    this._random = random;
    this.active = new Map(); // id → s que quedan
    this._tick = 0;
    events.on(GameEvents.FOOD_EATEN, ({ itemId }) => this._onFood(itemId));
    events.on(GameEvents.POTION_DRUNK, ({ itemId }) => this._onFood(itemId));
    events.on(GameEvents.PLAYER_RESPAWNED, () => this.clear());
  }

  has(id) {
    return (this.active.get(id) ?? 0) > 0;
  }

  /** Aplica (o alarga) un estado durante `seconds`. */
  apply(id, seconds) {
    if (!this._cfg[id] || !(seconds > 0)) return;
    const was = this.active.get(id) ?? 0;
    this.active.set(id, Math.max(was, seconds));
    this._emit();
  }

  clear() {
    this.active.clear();
    this._emit();
  }

  // ---- Multiplicadores para los demás sistemas -------------------------------------------

  get hungerMultiplier() {
    return this.has('WELL_FED') ? this._cfg.WELL_FED.HUNGER : 1;
  }

  get regenMultiplier() {
    return this._k('WELL_FED', 'REGEN') * this._k('REGENERATION', 'REGEN');
  }

  /** Valor `key` del estado `id` si está activo; si no, 1. */
  _k(id, key) {
    return this.has(id) ? this._cfg[id]?.[key] ?? 1 : 1;
  }

  get damageMultiplier() {
    return this._k('STRENGTH', 'DAMAGE');
  }

  get speedMultiplier() {
    return this._k('SWIFT', 'SPEED');
  }

  get jumpMultiplier() {
    return this._k('LEAP', 'JUMP');
  }

  get fallMultiplier() {
    return this._k('LEAP', 'FALL');
  }

  get nightVision() {
    return this.has('NIGHT_VISION');
  }

  get blocksRegen() {
    return this.has('INDIGESTION');
  }

  get coldMultiplier() {
    return this._k('WARM', 'COLD') * this._k('WARMTH', 'COLD');
  }

  get energyMultiplier() {
    let k = 1;
    if (this.has('ENERGIZED')) k *= this._cfg.ENERGIZED.ENERGY;
    if (this.has('INDIGESTION')) k *= this._cfg.INDIGESTION.ENERGY;
    return k;
  }

  update(dt) {
    if (!this.active.size) return;
    let ended = false;
    for (const [id, t] of this.active) {
      const left = t - dt;
      if (left <= 0) {
        this.active.delete(id);
        ended = true;
        this._events.emit(GameEvents.UI_MESSAGE, { text: `${this._cfg[id].ICON} Se te ha pasado: ${this._cfg[id].NAME.toLowerCase()}.`, type: 'info' });
      } else this.active.set(id, left);
    }
    this._tick -= dt;
    if (ended || this._tick <= 0) {
      this._tick = 1;
      this._emit();
    }
  }

  /** Lista para la interfaz: [{ id, name, icon, desc, left }]. */
  list() {
    return [...this.active].map(([id, left]) => ({ id, name: this._cfg[id].NAME, icon: this._cfg[id].ICON, desc: this._cfg[id].DESC, left, bad: id === 'INDIGESTION' }));
  }

  snapshot() {
    return Object.fromEntries(this.active);
  }

  restore(d) {
    this.active.clear();
    for (const [id, t] of Object.entries(d ?? {})) {
      if (this._cfg[id] && typeof t === 'number' && t > 0 && t < 3600) this.active.set(id, t);
    }
    this._emit();
  }

  _onFood(itemId) {
    const def = this._items[itemId];
    if (!def) return;
    for (const [id, seconds] of Object.entries(def.EFFECTS ?? {})) {
      const isNew = !this.has(id);
      this.apply(id, seconds);
      if (isNew) this._events.emit(GameEvents.UI_MESSAGE, { text: `${this._cfg[id].ICON} ${this._cfg[id].NAME}: ${this._cfg[id].DESC}`, type: 'pickup' });
    }
    if (def.THIRST) this._thirst?.drink(def.THIRST);
    if (def.RAW_RISK && this._random() < def.RAW_RISK) {
      const I = this._cfg.INDIGESTION;
      this.apply('INDIGESTION', I.TIME);
      this._hunger?.consume?.(I.HUNGER_LOSS);
      this._events.emit(GameEvents.UI_MESSAGE, { text: `${I.ICON} ¡Te ha sentado mal! (${def.NAME.toLowerCase()}) Cocinada no pasa.`, type: 'warning' });
    }
  }

  _emit() {
    this._events.emit(GameEvents.STATUS_EFFECTS_CHANGED, { effects: this.list() });
  }
}
