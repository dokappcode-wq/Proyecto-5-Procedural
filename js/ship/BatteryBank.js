/**
 * BatteryBank — puesto de carga de la nave: ranuras con "baterías plank pequeñas".
 * Sin Three.js ni DOM.
 *
 * Cada ranura está vacía (null) o tiene una batería { charge } (0..CAPACITY).
 * La nave consume de la primera batería con carga. Una batería llena o vacía
 * se puede retirar al inventario (objetos distintos); una a medio gastar se
 * queda en el puesto (el inventario no guarda la carga de cada unidad).
 */
export class BatteryBank {
  constructor(config) {
    this._cfg = config;
    this.slots = [];
    this.fillAll(config.START_CHARGE);
  }

  get capacity() {
    return this._cfg.SLOTS * this._cfg.CAPACITY;
  }

  /** Carga total disponible. */
  get total() {
    return this.slots.reduce((sum, b) => sum + (b ? b.charge : 0), 0);
  }

  /** Carga total / capacidad de las baterías colocadas (0..1). */
  get ratio() {
    const installed = this.slots.filter(Boolean).length * this._cfg.CAPACITY;
    return installed > 0 ? this.total / installed : 0;
  }

  get empty() {
    return this.total <= 1e-6;
  }

  /** Pone una batería en todas las ranuras con la carga indicada (0..1). */
  fillAll(ratio = 1) {
    this.slots = Array.from({ length: this._cfg.SLOTS }, () => ({ charge: this._cfg.CAPACITY * ratio }));
  }

  /** Consume carga. @returns {number} carga realmente consumida */
  drain(amount) {
    let left = amount;
    for (const b of this.slots) {
      if (!b || left <= 0) continue;
      const used = Math.min(b.charge, left);
      b.charge -= used;
      left -= used;
    }
    return amount - left;
  }

  /** ¿Hay carga para gastar `count` baterías enteras? */
  canSpend(count = 1) {
    return this.total >= this._cfg.CAPACITY * count - 1e-6;
  }

  /**
   * Gasta `count` baterías enteras (el hiperespacio): empieza por la más llena y,
   * si no estaba completa, lo que falta sale de las demás.
   * @returns {boolean} false (sin cambios) si no hay carga suficiente
   */
  spendWhole(count = 1) {
    if (!this.canSpend(count)) return false;
    for (let i = 0; i < count; i++) {
      const fullest = this.slots.filter(Boolean).sort((a, b) => b.charge - a.charge)[0];
      let left = this._cfg.CAPACITY - fullest.charge;
      fullest.charge = 0;
      for (const b of this.slots) {
        if (!b || left <= 0 || b === fullest) continue;
        const used = Math.min(b.charge, left);
        b.charge -= used;
        left -= used;
      }
    }
    return true;
  }

  /** Baterías colocadas con carga completa. */
  get fullCount() {
    return this.slots.filter((b) => b && b.charge >= this._cfg.CAPACITY - 0.5).length;
  }

  /**
   * Retira la batería de una ranura.
   * @returns {{ ok: boolean, item?: string, reason?: string }}
   */
  remove(slot) {
    const b = this.slots[slot];
    if (!b) return { ok: false, reason: 'La ranura está vacía' };
    const cap = this._cfg.CAPACITY;
    if (b.charge >= cap - 0.5) {
      this.slots[slot] = null;
      return { ok: true, item: this._cfg.ITEM };
    }
    if (b.charge <= 0.5) {
      this.slots[slot] = null;
      return { ok: true, item: this._cfg.EMPTY_ITEM };
    }
    return { ok: false, reason: 'No se puede retirar una batería a medio gastar' };
  }

  /**
   * Coloca una batería del inventario en una ranura vacía.
   * @param {string} item ITEM (llena) o EMPTY_ITEM (vacía)
   */
  insert(slot, item) {
    if (slot < 0 || slot >= this.slots.length) return { ok: false, reason: 'Ranura no válida' };
    if (this.slots[slot]) return { ok: false, reason: 'La ranura ya tiene una batería' };
    if (item !== this._cfg.ITEM && item !== this._cfg.EMPTY_ITEM) return { ok: false, reason: 'Eso no es una batería plank pequeña' };
    this.slots[slot] = { charge: item === this._cfg.ITEM ? this._cfg.CAPACITY : 0 };
    return { ok: true };
  }

  /** Estado para la UI: [{ charge, ratio } | null]. */
  snapshot() {
    return {
      slots: this.slots.map((b) => (b ? { charge: b.charge, ratio: b.charge / this._cfg.CAPACITY } : null)),
      total: this.total,
      capacity: this.capacity,
      ratio: this.ratio,
    };
  }
}
