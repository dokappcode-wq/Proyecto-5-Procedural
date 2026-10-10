import { GameEvents } from '../core/GameEvents.js';

/**
 * InventorySystem — inventario por huecos.
 *
 *   Huecos 0–8:   barra rápida (teclas 1–9).
 *   Huecos 9–35:  mochila (9 × 3); las mochilas (P5) añaden filas de 9 al final
 *   (extraRows, como mucho MAX_EXTRA_ROWS).
 *   Cada hueco: null o { id, count, dur? }. Como mucho MAX_STACK unidades por hueco
 *   (100 por defecto; ITEMS.*.STACK lo cambia, p. ej. la ropa no se apila).
 *   Las herramientas (ITEMS.*.DURABILITY) llevan su aguante en `dur`: cada uso lo
 *   gasta (wearSlot) y al llegar a 0 se rompen (TOOL_BROKEN).
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
    this.columns = config.MAIN_COLUMNS ?? 9;
    this.mainSize = (config.MAIN_ROWS ?? 3) * this.columns;
    this.maxExtraRows = config.MAX_EXTRA_ROWS ?? 2;
    this.extraRows = 0;
    this.maxStack = config.MAX_STACK ?? 100;
    this.slots = new Array(this.hotbarSize + this.mainSize).fill(null);
    this.cursor = null; // pila que se lleva con el ratón en el panel
    this._equipment = null;
    this.container = null; // cofre abierto: { slots } (huecos 'c:0', 'c:1'…)
  }

  /**
   * Mochila (P5): amplía la mochila hasta `rows` filas extra (nunca la encoge).
   * @returns {boolean} si ha crecido
   */
  setExtraRows(rows) {
    const n = Math.max(0, Math.min(this.maxExtraRows, Math.floor(rows)));
    if (n <= this.extraRows) return false;
    this.extraRows = n;
    const size = this.hotbarSize + this.mainSize + n * this.columns;
    while (this.slots.length < size) this.slots.push(null);
    this._emit(null, 0);
    return true;
  }

  /** Cofre abierto en el panel (o null al cerrarlo). Sus huecos entran en los clics como 'c:N'. */
  attachContainer(container) {
    this.container = container;
    this._emit(null, 0);
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
   * @param {{ quiet?: boolean, dur?: number }} [opts] quiet: no avisar de lo que no cabe;
   *   dur: aguante de una herramienta ya usada (si no, nueva)
   * @returns {number} cantidad que ha cabido
   */
  addItem(id, amount = 1, { quiet = false, dur } = {}) {
    this._assertItem(id);
    amount = Math.floor(amount);
    if (!(amount > 0)) return 0;
    const added = this._insert(id, amount, dur);
    if (added > 0) this._emit(id, added);
    if (added < amount && !quiet) this._events?.emit(GameEvents.INVENTORY_FULL, { itemId: id, amount: amount - added, ...(dur != null ? { dur } : {}) });
    return added;
  }

  /** Aguante máximo de una herramienta (o null si no se gasta). */
  maxDurability(id) {
    return this._defs[id]?.DURABILITY ?? null;
  }

  /**
   * Gasta aguante de la herramienta de un hueco; si llega a 0, se rompe y desaparece.
   * @returns {boolean} true si se ha roto
   */
  wearSlot(index, amount = 1) {
    const st = this.slots[index];
    if (!st || st.dur == null) return false;
    st.dur = Math.max(0, st.dur - amount);
    if (st.dur > 0) {
      this._emit(null, 0);
      return false;
    }
    this.slots[index] = null;
    this._emit(st.id, -1);
    this._events?.emit(GameEvents.TOOL_BROKEN, { itemId: st.id, index });
    return true;
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

  /** Copia de los huecos (para guardar o viajar): [[id, count, dur?] | null, …]. */
  snapshot() {
    return this.slots.map((s) => (s ? (s.dur != null ? [s.id, s.count, s.dur] : [s.id, s.count]) : null));
  }

  /** Restaura huecos guardados (datos no fiables: se comprueba todo). */
  restore(list) {
    // Una partida con mochila trae más huecos: se recuperan sus filas.
    if (Array.isArray(list) && list.length > this.slots.length) {
      this.setExtraRows(Math.ceil((list.length - this.hotbarSize - this.mainSize) / this.columns));
    }
    this.slots.fill(null);
    this.cursor = null;
    (Array.isArray(list) ? list.slice(0, this.slots.length) : []).forEach((e, i) => {
      const [id, count, dur] = Array.isArray(e) ? e : [];
      if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(this._defs, id)) return;
      const n = Math.floor(Number(count));
      if (!(n > 0)) return;
      this.slots[i] = { id, count: Math.min(n, this.stackLimit(id)) };
      const max = this.maxDurability(id);
      if (max != null) this.slots[i].dur = Number.isFinite(dur) ? Math.min(max, Math.max(1, Math.round(dur))) : max;
    });
    this._emit(null, 0);
  }

  // ---- Por huecos (panel del inventario) -----------------------------------------

  /** Contenido de un hueco: número (inventario), 'c:N' (cofre abierto) o 'eq:SLOT' (ropa). */
  getRef(ref) {
    if (typeof ref === 'number') return this.slots[ref] ?? null;
    const c = this._loc(ref);
    if (c) return c[0][c[1]] ?? null;
    const slot = eqSlot(ref);
    const id = slot && this._equipment?.slots[slot];
    const dur = slot ? this._equipment?.dur?.[slot] : undefined;
    return id ? (dur != null ? { id, count: 1, dur } : { id, count: 1 }) : null;
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
    const loc = this._loc(ref);
    if (!loc) return false;
    if (shift && !this.cursor) return this._quickMove(ref);
    const [arr, idx] = loc;
    const here = arr[idx];
    const c = this.cursor;
    if (button === 2) {
      if (!c && here) {
        // Coger la mitad (redondeando hacia arriba).
        const take = Math.ceil(here.count / 2);
        if (take === here.count) {
          this.cursor = here; // todo el hueco (conserva el aguante de las herramientas)
          arr[idx] = null;
        } else {
          this.cursor = { id: here.id, count: take };
          here.count -= take;
        }
      } else if (c && (!here || (here.id === c.id && here.count < this.stackLimit(c.id)))) {
        // Dejar una unidad (si es la última, el mismo objeto: conserva el aguante).
        if (here) {
          here.count += 1;
          c.count -= 1;
          if (c.count === 0) this.cursor = null;
        } else if (c.count === 1) {
          arr[idx] = c;
          this.cursor = null;
        } else {
          arr[idx] = { id: c.id, count: 1 };
          c.count -= 1;
        }
      } else return false;
    } else if (!c) {
      if (!here) return false;
      this.cursor = here;
      arr[idx] = null;
    } else if (!here) {
      arr[idx] = c;
      this.cursor = null;
    } else if (here.id === c.id) {
      const move = Math.min(c.count, this.stackLimit(c.id) - here.count);
      if (move <= 0) [arr[idx], this.cursor] = [c, here];
      else {
        here.count += move;
        c.count -= move;
        if (c.count === 0) this.cursor = null;
      }
    } else {
      [arr[idx], this.cursor] = [c, here];
    }
    this._emit(null, 0);
    return true;
  }

  /**
   * Saca `amount` unidades de un hueco concreto (tirar al suelo).
   * @returns {{ id, count } | null} lo que se ha sacado
   */
  takeFromSlot(index, amount = 1) {
    const st = this.slots[index];
    if (!st || !(amount > 0)) return null;
    const n = Math.min(st.count, Math.floor(amount));
    st.count -= n;
    if (st.count === 0) this.slots[index] = null;
    this._emit(st.id, -n);
    return { id: st.id, count: n, ...(st.dur != null ? { dur: st.dur } : {}) };
  }

  /** Lo que se lleva con el ratón sale del inventario (para tirarlo): { id, count } o null. */
  takeCursor(amount = Infinity) {
    const c = this.cursor;
    if (!c) return null;
    const n = Math.min(c.count, amount);
    c.count -= n;
    if (c.count === 0) this.cursor = null;
    this._emit(null, 0);
    return { id: c.id, count: n, ...(c.dur != null ? { dur: c.dur } : {}) };
  }

  /** Devuelve al inventario lo que se lleva con el ratón (al cerrar el panel). */
  returnCursor() {
    const c = this.cursor;
    if (!c) return;
    this.cursor = null;
    this.addItem(c.id, c.count, { dur: c.dur });
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
        const dur = eq.dur?.[slot];
        eq._set(slot, null);
        this.addItem(worn, 1, { dur });
        return true;
      }
      const dur = eq.dur?.[slot];
      eq._set(slot, null);
      this.cursor = dur != null ? { id: worn, count: 1, dur } : { id: worn, count: 1 };
      this._emit(null, 0);
      return true;
    }
    if (c.count !== 1 || !eq.canWear(slot, c.id)) {
      this._events?.emit(GameEvents.UI_MESSAGE, { text: `${this._defs[c.id]?.NAME ?? c.id} no va en ${eq.slotName(slot)}.`, type: 'info' });
      return false;
    }
    const wornDur = eq.dur?.[slot];
    eq._set(slot, c.id, c.dur);
    this.cursor = worn ? (wornDur != null ? { id: worn, count: 1, dur: wornDur } : { id: worn, count: 1 }) : null;
    this._emit(null, 0);
    return true;
  }

  _quickMove(ref) {
    // Con un cofre abierto: inventario ↔ cofre.
    if (this.container) return this._quickMoveContainer(ref);
    const here = this.slots[ref];
    if (!here) return false;
    // Ropa: a su ranura si está libre.
    const eq = this._equipment;
    const wearSlot = this._defs[here.id]?.SLOT;
    if (eq && wearSlot && here.count === 1 && !eq.slots[wearSlot] && eq.canWear(wearSlot, here.id)) {
      this.slots[ref] = null;
      eq._set(wearSlot, here.id, here.dur);
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
          this.slots[i] = { ...here };
          here.count = 0;
        }
      }
    }
    if (here.count === 0) this.slots[ref] = null;
    this._emit(null, 0);
    return true;
  }

  /** Mover rápido entre el inventario y el cofre abierto (completa pilas, luego huecos vacíos). */
  _quickMoveContainer(ref) {
    const loc = this._loc(ref);
    if (!loc) return false;
    const [from, i] = loc;
    const here = from[i];
    if (!here) return false;
    const to = from === this.slots ? this.container.slots : this.slots;
    const lim = this.stackLimit(here.id);
    for (const pass of ['merge', 'empty']) {
      for (let k = 0; k < to.length && here.count > 0; k++) {
        const t = to[k];
        if (pass === 'merge' && t?.id === here.id && t.count < lim && here.dur == null && t.dur == null) {
          const move = Math.min(here.count, lim - t.count);
          t.count += move;
          here.count -= move;
        } else if (pass === 'empty' && !t) {
          to[k] = { ...here };
          here.count = 0;
        }
      }
    }
    if (here.count === 0) from[i] = null;
    this._emit(null, 0);
    return true;
  }

  // ---- Ordenar y guardar (P9) ---------------------------------------------------

  /**
   * Ordena los huecos [from, to) de `arr`: junta pilas iguales (sin aguante) y las coloca
   * por tipo de objeto (orden de ITEMS) y de más a menos; los huecos vacíos al final.
   */
  _sortRange(arr, from, to) {
    const order = this._order ??= new Map(Object.keys(this._defs).map((id, i) => [id, i]));
    const stacks = [];
    for (let i = from; i < to; i++) {
      const st = arr[i];
      if (!st) continue;
      const lim = this.stackLimit(st.id);
      let left = st.count;
      if (st.dur == null) {
        for (const t of stacks) {
          if (left === 0) break;
          if (t.id !== st.id || t.dur != null || t.count >= lim) continue;
          const move = Math.min(left, lim - t.count);
          t.count += move;
          left -= move;
        }
      }
      if (left > 0) stacks.push({ ...st, count: left });
    }
    stacks.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || b.count - a.count || (b.dur ?? 0) - (a.dur ?? 0));
    for (let i = from; i < to; i++) arr[i] = stacks[i - from] ?? null;
  }

  /** Ordena la mochila (la barra rápida no se toca). */
  sortBag() {
    this.returnCursor();
    this._sortRange(this.slots, this.hotbarSize, this.slots.length);
    this._emit(null, 0);
    return true;
  }

  /** Ordena el cofre abierto. */
  sortContainer() {
    if (!this.container) return false;
    this.returnCursor();
    this._sortRange(this.container.slots, 0, this.container.slots.length);
    this._emit(null, 0);
    return true;
  }

  /**
   * Guardar iguales: lo de la mochila que ya hay en el cofre abierto se mete en él
   * (completa sus pilas y luego huecos vacíos). La barra rápida no se toca.
   * @returns {number} unidades guardadas
   */
  quickStack() {
    const box = this.container?.slots;
    if (!box) return 0;
    const ids = new Set(box.filter(Boolean).map((t) => t.id));
    let moved = 0;
    for (let i = this.hotbarSize; i < this.slots.length; i++) {
      const here = this.slots[i];
      if (!here || !ids.has(here.id)) continue;
      moved += this._moveInto(here, box);
      if (here.count === 0) this.slots[i] = null;
    }
    if (moved) this._emit(null, 0);
    return moved;
  }

  /** Coger todo lo del cofre abierto (lo que quepa). @returns {number} unidades cogidas */
  takeAll() {
    const box = this.container?.slots;
    if (!box) return 0;
    let moved = 0;
    for (let i = 0; i < box.length; i++) {
      const here = box[i];
      if (!here) continue;
      moved += this._moveInto(here, this.slots);
      if (here.count === 0) box[i] = null;
    }
    if (moved) this._emit(null, 0);
    return moved;
  }

  /** Mueve la pila `here` a `to` (completa pilas iguales y luego huecos vacíos). */
  _moveInto(here, to) {
    const lim = this.stackLimit(here.id);
    const start = here.count;
    for (const pass of ['merge', 'empty']) {
      for (let k = 0; k < to.length && here.count > 0; k++) {
        const t = to[k];
        if (pass === 'merge' && t?.id === here.id && t.count < lim && here.dur == null && t.dur == null) {
          const move = Math.min(here.count, lim - t.count);
          t.count += move;
          here.count -= move;
        } else if (pass === 'empty' && !t) {
          to[k] = { ...here };
          here.count = 0;
        }
      }
    }
    return start - here.count;
  }

  /**
   * Vacía mochila, barra y lo que se lleva con el ratón (bolsa al morir, P9).
   * @param {(id: string) => boolean} [keep] objetos que se quedan (los de la historia)
   * @returns {Array<{ item, count, dur? }>}
   */
  takeEverything(keep = () => false) {
    this.returnCursor();
    const out = [];
    for (let i = 0; i < this.slots.length; i++) {
      const st = this.slots[i];
      if (!st || keep(st.id)) continue;
      out.push(st.dur == null ? { item: st.id, count: st.count } : { item: st.id, count: st.count, dur: st.dur });
      this.slots[i] = null;
    }
    if (out.length) this._emit(null, 0);
    return out;
  }

  /** [array, índice] de un hueco: número = inventario; 'c:N' = cofre abierto. */
  _loc(ref) {
    if (typeof ref === 'number') return ref >= 0 && ref < this.slots.length ? [this.slots, ref] : null;
    if (typeof ref === 'string' && ref.startsWith('c:') && this.container) {
      const i = Number(ref.slice(2));
      return Number.isInteger(i) && i >= 0 && i < this.container.slots.length ? [this.container.slots, i] : null;
    }
    return null;
  }

  // Alias con los nombres de la especificación.
  AddItem(id, n) { return this.addItem(id, n); }
  RemoveItem(id, n) { return this.removeItem(id, n); }
  HasItem(id, n) { return this.hasItem(id, n); }
  GetItemCount(id) { return this.getItemCount(id); }

  _insert(id, amount, dur) {
    const lim = this.stackLimit(id);
    const max = this.maxDurability(id);
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
      if (max != null) this.slots[i].dur = dur ?? max; // herramienta: nueva o con el aguante que traía
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
