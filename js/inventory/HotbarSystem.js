import { GameEvents } from '../core/GameEvents.js';

/**
 * HotbarSystem — hueco seleccionado de la barra rápida (huecos 0–8 del inventario).
 *
 * - Teclas 1–9 seleccionan el hueco N. Pulsar la tecla del hueco ya
 *   seleccionado lo deselecciona.
 * - selectedId es el objeto que hay en ese hueco (null si está vacío): si el
 *   objeto se acaba o se mueve, el hueco sigue seleccionado pero ya no hay nada que usar.
 */
export class HotbarSystem {
  constructor({ input, inventory, events }) {
    this.name = 'hotbar';
    this._input = input;
    this._inventory = inventory;
    this._events = events;
    this.selectedIndex = null;
    this._lastId = null;

    events.on(GameEvents.INVENTORY_CHANGED, () => {
      if (this.selectedId !== this._lastId) this._emit();
    });
  }

  get size() {
    return this._inventory.hotbarSize;
  }

  /** Objeto del hueco seleccionado (o null). */
  get selectedId() {
    return this.selectedIndex === null ? null : this._inventory.slots[this.selectedIndex]?.id ?? null;
  }

  /** Selecciona el primer hueco de la barra con ese objeto (o deselecciona con null). */
  select(itemId) {
    if (itemId === null) return this.selectIndex(null);
    const i = this._inventory.slots.slice(0, this.size).findIndex((s) => s?.id === itemId);
    if (i >= 0) this.selectIndex(i);
  }

  /** @param {number|null} index hueco 0–8; el mismo otra vez lo deselecciona */
  selectIndex(index, { toggle = false } = {}) {
    if (index !== null && (index < 0 || index >= this.size)) return;
    this.selectedIndex = toggle && index === this.selectedIndex ? null : index;
    this._emit();
  }

  update() {
    for (let i = 1; i <= this.size; i++) {
      if (this._input.wasPressed(`HOTBAR_${i}`)) this.selectIndex(i - 1, { toggle: true });
    }
  }

  _emit() {
    this._lastId = this.selectedId;
    this._events.emit(GameEvents.HOTBAR_CHANGED, { selectedId: this.selectedId, selectedIndex: this.selectedIndex });
  }
}
