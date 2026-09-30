import { GameEvents } from '../core/GameEvents.js';

/**
 * EquipmentSystem — equipamiento mínimo: una ranura (BODY) para la armadura.
 * Sin Three.js ni DOM. Nada de equipamiento avanzado.
 *
 * - El objeto equipado sigue contando en el inventario (no se "mueve").
 * - Si el objeto desaparece del inventario, se desequipa solo.
 * - getColdLossMultiplier(): lo usará TemperatureSystem (Fase 10). La armadura
 *   NO da inmunidad: solo reduce la velocidad a la que se pierde temperatura.
 */
export class EquipmentSystem {
  constructor({ items, config, inventory, events }) {
    this.name = 'equipment';
    this._items = items;
    this._cfg = config;
    this._inventory = inventory;
    this._events = events;
    this.slots = { BODY: null };

    events.on(GameEvents.INVENTORY_CHANGED, ({ itemId, count }) => {
      for (const slot in this.slots) if (this.slots[slot] === itemId && count === 0) this._set(slot, null);
    });
  }

  isEquipped(itemId) {
    return Object.values(this.slots).includes(itemId);
  }

  /** Equipa o quita el objeto. @returns {boolean} true si queda equipado */
  toggle(itemId) {
    const def = this._items[itemId];
    if (!def?.SLOT || !this._inventory.hasItem(itemId)) return false;
    const equipped = this.slots[def.SLOT] === itemId;
    this._set(def.SLOT, equipped ? null : itemId);
    return !equipped;
  }

  /** Multiplicador de pérdida de temperatura (1 = sin protección). */
  getColdLossMultiplier() {
    return this.slots.BODY === 'LEATHER_ARMOR' ? this._cfg.ARMOR_COLD_RESISTANCE : 1;
  }

  _set(slot, itemId) {
    if (this.slots[slot] === itemId) return;
    this.slots[slot] = itemId;
    this._events.emit(GameEvents.EQUIPMENT_CHANGED, { slot, itemId });
  }
}
