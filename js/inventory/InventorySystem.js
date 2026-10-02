import { GameEvents } from '../core/GameEvents.js';

/**
 * InventorySystem — inventario por huecos.
 *
 *   Huecos 0–8:   barra rápida (teclas 1–9).
 *   Huecos 9–35:  mochila (9 × 3).
 *   Cada hueco: null o { id, count }. Como mucho MAX_STACK unidades por hueco
 *   (100 por defecto; ITEMS.*.STACK lo cambia, p. ej. la ropa no se apila).
 *
 * API por tipo de objeto (la usan recogida, fabricación, construcción…):
 *   addItem(id, n) → cantidad que ha cabido. Lo que no cabe se avisa con
 *   INVENTORY_FULL { itemId, amount } (el juego lo deja en el suelo en una bolsa).
 *   removeItem(id, n), hasItem(id, n), getItemCount(id), getAll()
 *
 * API por huecos (la usa el panel del inventario, tecla I):
 *   slots, cursor (lo que se lleva "en la mano" con el ratón),
 *   click(ref, { button, shift }) con ref = número de hueco o 'eq:HEAD'…
 *   (las ranuras de ropa las guarda EquipmentSystem: attachEquipment).
 *
 * Emite INVENTORY_CHANGED { itemId, count, delta, items, slots } en cada cambio.
 * Sin Three.js ni DOM: testeable en Node.
 */
export const HOTBAR_SIZE = 9;

export class InventorySystem {
  constructor({ items, events, config = {} }) {
    this.name = 'inventory';
    this._defs = items;
    this._events = events;
    this.hotbarSize = config.HOTBAR_SLOTS ?? HOTBAR_SIZE;
    this.mainSize = (config.MAIN_ROWS ?? 3) * (config.MAIN_COLUMNS ?? 9);
    this.maxStack = config.MAX_STACK ?? 100;
    this.slots = new Array(this.hotbarSize + this.mainSize).fill(null);
    this.cursor = null; // pila que se lleva con el ratón en el panel
    this._equipment = null;
  }

  /** Las ranuras de ropa (EquipmentSystem) entran en los clics del panel. */
  attachEquipment(equipment) {
    this._equipment = equipment;
  }

  /** Definición de un objeto ({ NAME, ICON, FOOD? }). */
  getDefinition(id) {
    return this._defs[id] ?? null;
  }

  /** Unidades de este objeto que caben en un hueco. */
  stackLimit(id) {
    return Math.max(1, this._defs[id]?.STACK ?? this.maxStack);
  }

  // ---- Por tipo de objeto ------------------------------------------------------

  /**
   * Mete `amount` unidades: primero completa las pilas que ya hay (barra y luego
   * mochila) y después ocupa huecos vacíos (barra y luego mochila).
   * @param {{ quiet?: boolean }} [opts] quiet: no avisar de lo que no cabe
   * @returns {number} cantidad que ha cabido
   */
  addItem(id, amount = 1, { quiet = false } = {}) {
    this._assertItem(id);
    amount = Math.floor(amount);
    if (!(amount > 0)) return 0;
    const added = this._insert(id, amount);
    if (added > 0) this._emit(id, added);
    if (added < amount && !quiet) this._events?.emit(GameEvents.INVENTORY_FULL, { itemId: id, amount: amount - added });
    return added;
  }

  /** Cuántas unidades de `id` cabrían ahora. */
  roomFor(id) {
    const lim = this.stackLimit(id);
    let room = 0;
    for (const s of this.slots) room += !s ? lim : s.id === id ? lim - s.count : 0;
    return room;
  }

  /**
   * Quita `amount` unidades (de la mochila antes que de la barra, y de las pilas
   * más pequeñas antes, para no vaciar la barra rápida sin necesidad).
   * @returns {boolean} false (sin cambios) si no hay suficientes
   */
  removeItem(id, amount = 1) {
    this._assertItem(id);
    amount = Math.floor(amount);
    if (!(amount > 0) || this.getItemCount(id) < amount) return false;
    const order = this.slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s?.id === id)
      .sort((a, b) => (b.i >= this.hotbarSize) - (a.i >= this.hotbarSize) || a.s.count - b.s.count);
    let left = amount;
    for (const { s, i } of order) {
      const take = Math.min(left, s.count);
      s.count -= take;
      left -= take;
      if (s.count === 0) this.slots[i] = null;
      if (left === 0) break;
    }
    this._emit(id, -amount);
    return true;
  }

  hasItem(id, amount = 1) {
    return this.getItemCount(id) >= amount;
  }

  getItemCount(id) {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  /** Objetos que se llevan (sumando huecos), en el orden de GameConfig.ITEMS. */
  getAll() {
    const counts = new Map();
    for (const s of this.slots) if (s) counts.set(s.id, (counts.get(s.id) ?? 0) + s.count);
    return Object.keys(this._defs)
      .filter((id) => counts.has(id))
      .map((id) => ({ id, count: counts.get(id), ...this._defs[id] }));
  }

  clear() {
    const ids = new Set(this.slots.filter(Boolean).map((s) => s.id));
    this.slots.fill(null);
    for (const id of ids) this._emit(id, 0);
    if (!ids.size) this._emit(null, 0);
  }

  /** Copia de los huecos (para guardar o viajar): [[id, count] | null, …]. */
  snapshot() {
    return this.slots.map((s) => (s ? [s.id, s.count] : null));
  }

  /** Restaura huecos guardados (datos no fiables: se comprueba todo). */
  restore(list) {
    this.slots.fill(null);
    this.cursor = null;
    (Array.isArray(list) ? list.slice(0, this.slots.length) : []).forEach((e, i) => {
      const [id, count] = Array.isArray(e) ? e : [];
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(this._defs, id)) return;
      const n = Math.floor(Number(count));
      if (n > 0) this.slots[i] = { id, count: Math.min(n, this.stackLimit(id)) };
    });
    this._emit(null, 0);
  }

  // ---- Por huecos (panel del inventario) -----------------------------------------

  /** Contenido de un hueco: número (inventario) o 'eq:SLOT' (ropa). */
  getRef(ref) {
    if (typeof ref === 'number') return this.slots[ref] ?? null;
    const slot = eqSlot(ref);
    const id = slot && this._equipment?.slots[slot];
    return id ? { id, count: 1 } : null;
  }

  /**
   * Clic en un hueco del panel.
   *   Clic izquierdo: coger la pila / dejar la que se lleva / juntarlas / cambiarlas.
   *   Clic derecho:   coger la mitad / dejar una sola unidad.
   *   Shift + clic:   mover rápido (barra ↔ mochila; la ropa, a su ranura y de vuelta).
   * @returns {boolean} si ha cambiado algo
   */
  click(ref, { button = 0, shift = false } = {}) {
    const slot = eqSlot(ref);
    if (slot) return this._clickEquipment(slot, shift);
    if (typeof ref !== 'number' || ref < 0 || ref >= this.slots.length) return false;
    if (shift && !this.cursor) return this._quickMove(ref);
    const here = this.slots[ref];
    const c = this.cursor;
    if (button === 2) {
      if (!c && here) {
        // Coger la mitad (redondeando hacia arriba).
        const take = Math.ceil(here.count / 2);
        this.cursor = { id: here.id, count: take };
        here.count -= take;
        if (here.count === 0) this.slots[ref] = null;
      } else if (c && (!here || (here.id === c.id && here.count < this.stackLimit(c.id)))) {
        // Dejar una unidad.
        if (here) here.count += 1;
        else this.slots[ref] = { id: c.id, count: 1 };
        c.count -= 1;
        if (c.count === 0) this.cursor = null;
      } else return false;
    } else if (!c) {
      if (!here) return false;
      this.cursor = here;
      this.slots[ref] = null;
    } else if (!here) {
      this.slots[ref] = c;
      this.cursor = null;
    } else if (here.id === c.id) {
      const move = Math.min(c.count, this.stackLimit(c.id) - here.count);
      if (move <= 0) [this.slots[ref], this.cursor] = [c, here];
      else {
        here.count += move;
        c.count -= move;
        if (c.count === 0) this.cursor = null;
      }
    } else {
      [this.slots[ref], this.cursor] = [c, here];
    }
    this._emit(null, 0);
    return true;
  }

  /** Devuelve al inventario lo que se lleva con el ratón (al cerrar el panel). */
  returnCursor() {
    const c = this.cursor;
    if (!c) return;
    this.cursor = null;
    this.addItem(c.id, c.count);
  }

  _clickEquipment(slot, shift) {
    const eq = this._equipment;
    if (!eq) return false;
    const worn = eq.slots[slot];
    const c = this.cursor;
    if (!c) {
      if (!worn) return false;
      if (shift) {
        // Quitársela directamente a la mochila.
        if (this.roomFor(worn) < 1) return false;
        eq._set(slot, null);
        this.addItem(worn, 1);
        return true;
      }
      eq._set(slot, null);
      this.cursor = { id: worn, count: 1 };
      this._emit(null, 0);
      return true;
    }
    if (c.count !== 1 || !eq.canWear(slot, c.id)) {
      this._events?.emit(GameEvents.UI_MESSAGE, { text: `${this._defs[c.id]?.NAME ?? c.id} no va en ${eq.slotName(slot)}.`, type: 'info' });
      return false;
    }
    eq._set(slot, c.id);
    this.cursor = worn ? { id: worn, count: 1 } : null;
    this._emit(null, 0);
    return true;
  }

  _quickMove(ref) {
    const here = this.slots[ref];
    if (!here) return false;
    // Ropa: a su ranura si está libre.
    const eq = this._equipment;
    const wearSlot = this._defs[here.id]?.SLOT;
    if (eq && wearSlot && here.count === 1 && !eq.slots[wearSlot] && eq.canWear(wearSlot, here.id)) {
      this.slots[ref] = null;
      eq._set(wearSlot, here.id);
      this._emit(null, 0);
      return true;
    }
    // Barra ↔ mochila: primero completa pilas iguales, luego huecos vacíos.
    const toHotbar = ref >= this.hotbarSize;
    const range = toHotbar ? [0, this.hotbarSize] : [this.hotbarSize, this.slots.length];
    const lim = this.stackLimit(here.id);
    for (const pass of ['merge', 'empty']) {
      for (let i = range[0]; i < range[1] && here.count > 0; i++) {
        const t = this.slots[i];
        if (pass === 'merge' && t?.id === here.id && t.count < lim) {
          const move = Math.min(here.count, lim - t.count);
          t.count += move;
          here.count -= move;
        } else if (pass === 'empty' && !t) {
          this.slots[i] = { id: here.id, count: here.count };
          here.count = 0;
        }
      }
    }
    if (here.count === 0) this.slots[ref] = null;
    this._emit(null, 0);
    return true;
  }

  // Alias con los nombres de la especificación.
  AddItem(id, n) { return this.addItem(id, n); }
  RemoveItem(id, n) { return this.removeItem(id, n); }
  HasItem(id, n) { return this.hasItem(id, n); }
  GetItemCount(id) { return this.getItemCount(id); }

  _insert(id, amount) {
    const lim = this.stackLimit(id);
    let left = amount;
    for (const s of this.slots) {
      if (left === 0) break;
      if (s?.id !== id || s.count >= lim) continue;
      const move = Math.min(left, lim - s.count);
      s.count += move;
      left -= move;
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const move = Math.min(left, lim);
      this.slots[i] = { id, count: move };
      left -= move;
    }
    return amount - left;
  }

  _assertItem(id) {
    if (!this._defs[id]) throw new Error(`[Inventory] Objeto desconocido: ${id}`);
  }

  _emit(itemId, delta) {
    this._events?.emit(GameEvents.INVENTORY_CHANGED, {
      itemId, count: itemId ? this.getItemCount(itemId) : 0, delta, items: this.getAll(), slots: this.slots, cursor: this.cursor,
    });
  }
}

function eqSlot(ref) {
  return typeof ref === 'string' && ref.startsWith('eq:') ? ref.slice(3) : null;
}
