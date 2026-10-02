import { GameEvents } from '../core/GameEvents.js';

/**
 * CraftingSystem — fabricación a partir de recetas (GameConfig.RECIPES). Sin Three.js ni DOM.
 *
 * - Fabricar lleva tiempo (RECIPES.*.TIME s): al pedirlo se gastan los ingredientes y la
 *   receta entra en una cola; el objeto sale cuando termina (aunque se cierre el menú).
 *   Lo que está en cola se puede cancelar y se devuelven los ingredientes.
 * - Algunas recetas solo se hacen en una estación (RECIPES.*.STATION, p. ej. la mesa de
 *   refinería): `craft(id, { station })` con la estación desde la que se fabrica.
 *
 * La UI pide fabricar con craft() o emitiendo CRAFT_REQUEST; al terminar cada objeto se
 * emite ITEM_CRAFTED, y CRAFT_QUEUE_CHANGED cuando cambia la cola.
 */
export const MAX_QUEUE = 20;

export class CraftingSystem {
  constructor({ recipes, items, inventory, events }) {
    this.name = 'crafting';
    this._recipes = recipes;
    this._items = items;
    this._inventory = inventory;
    this._events = events;
    this.queue = [];   // [{ uid, recipeId, time, left, ingredients }]
    this._uid = 0;
    this._subs = {};   // cuerpo sin madera/lana: las piezas de construcción usan piedra/mineral
    events.on(GameEvents.BODY_CHANGED, ({ planet }) => (this._subs = planet?.BUILD_SUBSTITUTE ?? {}));
    events.on(GameEvents.CRAFT_REQUEST, ({ recipeId, station }) => this.craft(recipeId, { station }));
  }

  /** Ingredientes de una receta en el cuerpo actual (las piezas de construcción sustituyen materiales). */
  ingredients(recipeId) {
    const r = this._recipes[recipeId];
    if (!r) return {};
    if (r.CATEGORY !== 'CONSTRUCTION' || !Object.keys(this._subs).length) return r.INGREDIENTS;
    const out = {};
    for (const [item, n] of Object.entries(r.INGREDIENTS)) {
      const it = this._subs[item] ?? item;
      out[it] = (out[it] ?? 0) + n;
    }
    return out;
  }

  /** Lista de recetas con su disponibilidad actual (para la UI). */
  getRecipes() {
    return Object.entries(this._recipes).map(([id, r]) => ({
      id,
      result: r.RESULT,
      amount: r.AMOUNT,
      name: this._items[r.RESULT].NAME,
      icon: this._items[r.RESULT].ICON,
      ingredients: Object.entries(this.ingredients(id)).map(([item, n]) => ({
        item,
        amount: n,
        have: this._inventory.getItemCount(item),
        name: this._items[item].NAME,
        icon: this._items[item].ICON,
      })),
      canCraft: this.canCraft(id),
      max: this.maxCraftable(id),
      category: r.CATEGORY ?? 'OTHER',
      station: r.STATION ?? null,
      time: r.TIME ?? 0,
    }));
  }

  canCraft(recipeId) {
    const r = this._recipes[recipeId];
    if (!r) return false;
    return Object.entries(this.ingredients(recipeId)).every(([item, n]) => this._inventory.hasItem(item, n));
  }

  /** Cuántas veces se puede fabricar ahora con lo que se lleva. */
  maxCraftable(recipeId) {
    const r = this._recipes[recipeId];
    if (!r) return 0;
    return Math.min(...Object.entries(this.ingredients(recipeId)).map(([item, n]) => Math.floor(this._inventory.getItemCount(item) / n)));
  }

  /**
   * Pone una receta en la cola (gasta ya los ingredientes).
   * @param {{ station?: string|null }} [opts] estación desde la que se fabrica
   * @returns {boolean}
   */
  craft(recipeId, { station = null } = {}) {
    const r = this._recipes[recipeId];
    if (!r) return false;
    const name = this._items[r.RESULT].NAME;
    if (r.STATION && r.STATION !== station) {
      this._message(`${name} se fabrica en una estación (${r.STATION_NAME ?? r.STATION}).`, 'danger');
      return false;
    }
    if (!this.canCraft(recipeId)) {
      this._message(`Te faltan materiales para: ${name}`, 'danger');
      return false;
    }
    if (this.queue.length >= MAX_QUEUE) {
      this._message('La cola de fabricación está llena.', 'danger');
      return false;
    }
    const ingredients = { ...this.ingredients(recipeId) };
    for (const [item, n] of Object.entries(ingredients)) this._inventory.removeItem(item, n);
    const time = Math.max(0, r.TIME ?? 0);
    this.queue.push({ uid: ++this._uid, recipeId, time, left: time, ingredients });
    this._changed();
    if (time === 0) this.update(0);
    return true;
  }

  /** Cancela una entrada de la cola y devuelve los ingredientes. */
  cancel(uid) {
    const i = this.queue.findIndex((q) => q.uid === uid);
    if (i < 0) return false;
    const [q] = this.queue.splice(i, 1);
    for (const [item, n] of Object.entries(q.ingredients ?? this._recipes[q.recipeId].INGREDIENTS)) this._inventory.addItem(item, n);
    this._changed();
    return true;
  }

  /** Progreso (0..1) de lo que se está fabricando ahora. */
  get progress() {
    const q = this.queue[0];
    return q ? (q.time > 0 ? 1 - q.left / q.time : 1) : 0;
  }

  update(dt) {
    while (this.queue.length) {
      const q = this.queue[0];
      q.left -= dt;
      dt = 0;
      if (q.left > 0) return;
      this.queue.shift();
      const r = this._recipes[q.recipeId];
      this._inventory.addItem(r.RESULT, r.AMOUNT);
      this._events.emit(GameEvents.ITEM_CRAFTED, { recipeId: q.recipeId, result: r.RESULT, amount: r.AMOUNT });
      this._changed();
    }
  }

  clearQueue() {
    for (const q of [...this.queue]) this.cancel(q.uid);
  }

  _changed() {
    this._events.emit(GameEvents.CRAFT_QUEUE_CHANGED, { queue: this.queue.map((q) => ({ ...q })) });
  }

  _message(text, type) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
