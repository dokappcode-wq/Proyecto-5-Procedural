import { GameEvents } from '../core/GameEvents.js';

/**
 * EquipmentSystem — ropa y armadura: cinco ranuras (EQUIPMENT.SLOTS):
 *   HEAD (casco/gorro), CHEST (pechera/camiseta), LEGS (pantalones),
 *   FEET (calzado), HANDS (guantes).
 *
 * - Lo que se lleva puesto SALE del inventario (ocupa su ranura, no un hueco).
 * - Cada prenda dice en qué ranura va (ITEMS.*.SLOT) y cuánto protege del frío
 *   (ITEMS.*.COLD_PROTECTION, 0..1). Las protecciones se suman.
 * - getColdLossMultiplier(): lo usa TemperatureSystem. La ropa NO da inmunidad:
 *   solo reduce la velocidad a la que se pierde temperatura.
 * Sin Three.js ni DOM.
 */
export class EquipmentSystem {
  constructor({ items, config, inventory, events }) {
    this.name = 'equipment';
    this._items = items;
    this._cfg = config;
    this._inventory = inventory;
    this._events = events;
    this.slotDefs = config.SLOTS;
    this.slots = Object.fromEntries(Object.keys(config.SLOTS).map((k) => [k, null]));
    inventory.attachEquipment?.(this);
  }

  slotName(slot) {
    return this.slotDefs[slot]?.NAME?.toLowerCase() ?? slot;
  }

  canWear(slot, itemId) {
    return Object.prototype.hasOwnProperty.call(this.slots, slot) && this._items[itemId]?.SLOT === slot;
  }

  isEquipped(itemId) {
    return Object.values(this.slots).includes(itemId);
  }

  /**
   * Ponerse una prenda del inventario (si ya había otra en esa ranura, vuelve al inventario).
   * @returns {boolean}
   */
  wear(itemId) {
    const slot = this._items[itemId]?.SLOT;
    if (!slot || !this.canWear(slot, itemId) || !this._inventory.hasItem(itemId)) return false;
    const old = this.slots[slot];
    this._inventory.removeItem(itemId, 1);
    this._set(slot, itemId);
    if (old) this._inventory.addItem(old, 1);
    return true;
  }

  /** Quitarse la prenda de una ranura (vuelve al inventario; si no cabe, no se quita). */
  takeOff(slot) {
    const id = this.slots[slot];
    if (!id) return false;
    if (this._inventory.roomFor(id) < 1) {
      this._events.emit(GameEvents.UI_MESSAGE, { text: 'No te cabe en el inventario: haz hueco primero.', type: 'info' });
      return false;
    }
    this._set(slot, null);
    this._inventory.addItem(id, 1);
    return true;
  }

  /** Ponerse / quitarse (usar la prenda desde la barra rápida). @returns {boolean} true si queda puesta */
  toggle(itemId) {
    const slot = this._items[itemId]?.SLOT;
    if (!slot) return false;
    if (this.slots[slot] === itemId && !this._inventory.hasItem(itemId)) {
      this.takeOff(slot);
      return false;
    }
    return this.wear(itemId);
  }

  /** Ponerse algo directamente (al llegar por el hiperespacio). */
  equipDirect(slot, itemId) {
    if (itemId === null && Object.prototype.hasOwnProperty.call(this.slots, slot)) {
      this._set(slot, null);
      return true;
    }
    if (!this.canWear(slot, itemId)) return false;
    this._set(slot, itemId);
    return true;
  }

  /** Protección total contra el frío (0..1). */
  get coldProtection() {
    let p = 0;
    for (const id of Object.values(this.slots)) if (id) p += this._items[id]?.COLD_PROTECTION ?? 0;
    return Math.min(this._cfg.MAX_COLD_PROTECTION ?? 0.8, p);
  }

  /** Puntos de defensa de todo lo puesto (ITEMS.*.DEFENSE). */
  get defense() {
    let d = 0;
    for (const id of Object.values(this.slots)) if (id) d += this._items[id]?.DEFENSE ?? 0;
    return d;
  }

  /** Parte del daño de los ataques que quita la armadura (0..MAX_DEFENSE_REDUCTION). */
  get damageReduction() {
    return Math.min(this._cfg.MAX_DEFENSE_REDUCTION ?? 0.75, this.defense * (this._cfg.DEFENSE_PER_POINT ?? 0.015));
  }

  /** Multiplicador de pérdida de temperatura (1 = sin protección). */
  getColdLossMultiplier() {
    return 1 - this.coldProtection;
  }

  _set(slot, itemId) {
    if (this.slots[slot] === itemId) return;
    this.slots[slot] = itemId;
    this._events.emit(GameEvents.EQUIPMENT_CHANGED, { slot, itemId, slots: { ...this.slots } });
  }
}
