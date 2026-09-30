import { GameEvents } from '../core/GameEvents.js';

/**
 * InventorySystem — inventario sencillo: cantidades por tipo de objeto.
 *
 * API (Fase 5):
 *   AddItem(id, n), RemoveItem(id, n), HasItem(id, n), GetItemCount(id)
 * (alias en camelCase: addItem, removeItem, hasItem, getItemCount)
 *
 * - Solo acepta objetos definidos en GameConfig.ITEMS.
 * - Sin peso, huecos, cofres ni equipamiento (fuera de alcance por ahora).
 * - Emite INVENTORY_CHANGED en cada cambio; la UI solo escucha el evento.
 * - Sin Three.js ni DOM: testeable en Node.
 */
export class InventorySystem {
  constructor({ items, events }) {
    this.name = 'inventory';
    this._defs = items;
    this._events = events;
    this._counts = new Map();
  }

  /** Definición de un objeto ({ NAME, ICON, FOOD? }). */
  getDefinition(id) {
    return this._defs[id] ?? null;
  }

  /** @returns {number} cantidad añadida */
  addItem(id, amount = 1) {
    this._assertItem(id);
    if (!(amount > 0)) return 0;
    const count = this.getItemCount(id) + amount;
    this._counts.set(id, count);
    this._emit(id, count, amount);
    return amount;
  }

  /** @returns {boolean} false (sin cambios) si no hay suficientes */
  removeItem(id, amount = 1) {
    this._assertItem(id);
    const have = this.getItemCount(id);
    if (!(amount > 0) || have < amount) return false;
    const count = have - amount;
    if (count === 0) this._counts.delete(id);
    else this._counts.set(id, count);
    this._emit(id, count, -amount);
    return true;
  }

  hasItem(id, amount = 1) {
    return this.getItemCount(id) >= amount;
  }

  getItemCount(id) {
    return this._counts.get(id) ?? 0;
  }

  /** Objetos con cantidad > 0, en el orden de GameConfig.ITEMS. */
  getAll() {
    return Object.keys(this._defs)
      .filter((id) => this._counts.has(id))
      .map((id) => ({ id, count: this._counts.get(id), ...this._defs[id] }));
  }

  clear() {
    const ids = [...this._counts.keys()];
    this._counts.clear();
    for (const id of ids) this._emit(id, 0, 0);
  }

  // Alias con los nombres de la especificación.
  AddItem(id, n) { return this.addItem(id, n); }
  RemoveItem(id, n) { return this.removeItem(id, n); }
  HasItem(id, n) { return this.hasItem(id, n); }
  GetItemCount(id) { return this.getItemCount(id); }

  _assertItem(id) {
    if (!this._defs[id]) throw new Error(`[Inventory] Objeto desconocido: ${id}`);
  }

  _emit(itemId, count, delta) {
    this._events?.emit(GameEvents.INVENTORY_CHANGED, { itemId, count, delta, items: this.getAll() });
  }
}
