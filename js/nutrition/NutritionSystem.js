import { GameEvents } from '../core/GameEvents.js';

/**
 * NutritionSystem — qué se come y si la dieta está equilibrada. Sin Three.js.
 *
 * Separado de HungerSystem: el hambre es "cuánto" has comido; la nutrición es
 * "qué". Dos categorías (animal / vegetal) sin vitaminas, proteínas ni calorías.
 *
 * Modelo sencillo:
 *   - Cada alimento suma su valor nutritivo a un acumulador de su categoría.
 *   - Los acumuladores se olvidan poco a poco (vida media DIET_MEMORY), así que
 *     cuenta lo comido recientemente.
 *   - share = animal / (animal + vegetal) se compara con la proporción deseada
 *     ANIMAL_FOOD_WEIGHT / (ANIMAL_FOOD_WEIGHT + PLANT_FOOD_WEIGHT).
 *   - Dentro de ±BALANCE_TOLERANCE → BALANCED; fuera → TOO_MUCH_ANIMAL / TOO_MUCH_PLANT.
 *   - Con poca comida reciente (< MIN_INTAKE_TO_JUDGE) → UNKNOWN (sin efectos).
 *
 * Efectos (los aplica main.js leyendo `isUnbalanced`): el hambre baja más rápido
 * y la vida no se regenera.
 */
export const DietState = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  BALANCED: 'BALANCED',
  TOO_MUCH_ANIMAL: 'TOO_MUCH_ANIMAL',
  TOO_MUCH_PLANT: 'TOO_MUCH_PLANT',
});

export class NutritionSystem {
  constructor({ config, items, hunger, events }) {
    this.name = 'nutrition';
    this._cfg = config;
    this._items = items;
    this._hunger = hunger;
    this._events = events;
    this.animal = 0;
    this.plant = 0;
    this.state = DietState.UNKNOWN;
    this._decayRate = Math.LN2 / config.DIET_MEMORY;
    events.on(GameEvents.PLAYER_RESPAWNED, () => this.reset());
  }

  get targetShare() {
    const c = this._cfg;
    return c.ANIMAL_FOOD_WEIGHT / (c.ANIMAL_FOOD_WEIGHT + c.PLANT_FOOD_WEIGHT);
  }

  /** Proporción animal de lo comido recientemente (null si no hay datos). */
  get share() {
    const total = this.animal + this.plant;
    return total > 0 ? this.animal / total : null;
  }

  get isUnbalanced() {
    return this.state === DietState.TOO_MUCH_ANIMAL || this.state === DietState.TOO_MUCH_PLANT;
  }

  /** ¿Se puede comer este objeto? */
  isFood(itemId) {
    const def = this._items[itemId];
    return !!def?.FOOD && (typeof def.NUTRITION === 'number' || !!def.NUTRITION);
  }

  /**
   * Come una unidad (el inventario lo gestiona quien llama).
   * @returns {{ ok: boolean, reason?: string, hunger?: number }}
   */
  eat(itemId) {
    if (!this.isFood(itemId)) return { ok: false, reason: 'not-food' };
    if (this._hunger.ratio >= 1) return { ok: false, reason: 'full' };
    const def = this._items[itemId];
    const value = this.valueOf(itemId);
    const gained = this._hunger.eat(value);
    // Platos mixtos (estofado, tarta): mitad animal, mitad vegetal.
    if (def.FOOD === 'ANIMAL') this.animal += value;
    else if (def.FOOD === 'MIXED') {
      this.animal += value / 2;
      this.plant += value / 2;
    } else this.plant += value;
    this._events.emit(GameEvents.FOOD_EATEN, { itemId, foodType: def.FOOD, hunger: gained });
    this._evaluate();
    return { ok: true, hunger: gained };
  }

  /** Hambre que quita un alimento (número o clave de NUTRITION). */
  valueOf(itemId) {
    const n = this._items[itemId]?.NUTRITION;
    return typeof n === 'number' ? n : this._cfg[n] ?? 0;
  }

  reset() {
    this.animal = 0;
    this.plant = 0;
    this._evaluate();
  }

  update(dt) {
    if (this.animal + this.plant <= 0) return;
    const k = Math.exp(-this._decayRate * dt);
    this.animal *= k;
    this.plant *= k;
    this._evaluate();
  }

  _evaluate() {
    const c = this._cfg;
    let state = DietState.UNKNOWN;
    if (this.animal + this.plant >= c.MIN_INTAKE_TO_JUDGE) {
      const dev = this.share - this.targetShare;
      if (Math.abs(dev) <= c.BALANCE_TOLERANCE) state = DietState.BALANCED;
      else state = dev > 0 ? DietState.TOO_MUCH_ANIMAL : DietState.TOO_MUCH_PLANT;
    }
    if (state !== this.state) {
      this.state = state;
      this._events.emit(GameEvents.DIET_CHANGED, { state, share: this.share });
    }
  }
}
