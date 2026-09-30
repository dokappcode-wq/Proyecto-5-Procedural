import { GameEvents } from '../core/GameEvents.js';

/**
 * CraftingSystem — fabricación a partir de recetas definidas en configuración
 * (GameConfig.RECIPES). Sin Three.js ni DOM.
 *
 * Las recetas están separadas de los objetos: una receta solo dice qué
 * ingredientes consume y qué objeto produce. Añadir una receta = añadir una
 * entrada en la configuración.
 *
 * La UI no llama a craft() directamente: emite CRAFT_REQUEST y este sistema
 * responde con ITEM_CRAFTED o con un mensaje.
 */
export class CraftingSystem {
  constructor({ recipes, items, inventory, events }) {
    this.name = 'crafting';
    this._recipes = recipes;
    this._items = items;
    this._inventory = inventory;
    this._events = events;
    events.on(GameEvents.CRAFT_REQUEST, ({ recipeId }) => this.craft(recipeId));
  }

  /** Lista de recetas con su disponibilidad actual (para la UI). */
  getRecipes() {
    return Object.entries(this._recipes).map(([id, r]) => ({
      id,
      result: r.RESULT,
      amount: r.AMOUNT,
      name: this._items[r.RESULT].NAME,
      icon: this._items[r.RESULT].ICON,
      ingredients: Object.entries(r.INGREDIENTS).map(([item, n]) => ({
        item,
        amount: n,
        have: this._inventory.getItemCount(item),
        name: this._items[item].NAME,
        icon: this._items[item].ICON,
      })),
      canCraft: this.canCraft(id),
    }));
  }

  canCraft(recipeId) {
    const r = this._recipes[recipeId];
    if (!r) return false;
    return Object.entries(r.INGREDIENTS).every(([item, n]) => this._inventory.hasItem(item, n));
  }

  /** @returns {boolean} */
  craft(recipeId) {
    const r = this._recipes[recipeId];
    if (!r) return false;
    if (!this.canCraft(recipeId)) {
      this._events.emit(GameEvents.UI_MESSAGE, { text: `Te faltan materiales para: ${this._items[r.RESULT].NAME}`, type: 'danger' });
      return false;
    }
    for (const [item, n] of Object.entries(r.INGREDIENTS)) this._inventory.removeItem(item, n);
    this._inventory.addItem(r.RESULT, r.AMOUNT);
    this._events.emit(GameEvents.ITEM_CRAFTED, { recipeId, result: r.RESULT, amount: r.AMOUNT });
    return true;
  }
}
