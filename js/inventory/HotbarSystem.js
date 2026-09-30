import { GameEvents } from '../core/GameEvents.js';

/**
 * HotbarSystem — objeto seleccionado en la barra de inventario.
 *
 * - Teclas 1–9 seleccionan la posición N de la barra (orden de GameConfig.ITEMS).
 *   Pulsar la tecla del objeto ya seleccionado lo deselecciona.
 * - La selección se guarda por ID de objeto: si el orden cambia, se mantiene.
 * - Si el objeto seleccionado se acaba, la selección se vacía.
 */
export class HotbarSystem {
  constructor({ input, inventory, events }) {
    this.name = 'hotbar';
    this._input = input;
    this._inventory = inventory;
    this._events = events;
    this.selectedId = null;

    events.on(GameEvents.INVENTORY_CHANGED, ({ itemId, count }) => {
      if (itemId === this.selectedId && count === 0) this.select(null);
      else this._emit(); // la posición del seleccionado puede haber cambiado
    });
  }

  select(itemId) {
    if (itemId !== null && !this._inventory.hasItem(itemId)) return;
    this.selectedId = itemId;
    this._emit();
  }

  selectIndex(index) {
    const item = this._inventory.getAll()[index];
    if (!item) return;
    this.select(item.id === this.selectedId ? null : item.id);
  }

  update() {
    for (let i = 1; i <= 9; i++) {
      if (this._input.wasPressed(`HOTBAR_${i}`)) this.selectIndex(i - 1);
    }
  }

  _emit() {
    this._events.emit(GameEvents.HOTBAR_CHANGED, { selectedId: this.selectedId });
  }
}
