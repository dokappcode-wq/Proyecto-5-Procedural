import { GameEvents } from '../core/GameEvents.js';

/**
 * LifeSupportSystem — aire, traje espacial y oxígeno.
 *
 * Cada frame pregunta si se respira donde está el jugador (`isBreathableAt`,
 * inyectado: nave, burbujas de oxígeno, perfil del cuerpo):
 *   - con aire: los pulmones se recuperan y el depósito del traje no se gasta;
 *   - sin aire, con el traje funcionando (batería > 0) y oxígeno: gasta oxígeno;
 *   - sin aire y sin traje (o sin batería/oxígeno): se aguanta la respiración
 *     LUNGS_TIME s y después la asfixia quita vida.
 * El traje gasta su batería plank siempre que se lleva puesto (válvulas,
 * calefacción y, más adelante, el jetpack). Se coge y se deja en la taquilla del
 * laboratorio; el oxígeno se recarga en las estaciones de oxígeno.
 *
 * Emite LIFE_SUPPORT_CHANGED { wearing, powered, breathable, lungs, oxygen, battery }
 * (ratios 0..1) para la UI.
 */
export class LifeSupportSystem {
  constructor({ config, batteries, player, inventory, events, isBreathableAt }) {
    this.name = 'lifeSupport';
    this._cfg = config;
    this._bat = batteries; // SHIP.BATTERIES (objetos de batería llena/vacía)
    this._player = player;
    this._inventory = inventory;
    this._events = events;
    this._isBreathableAt = isBreathableAt;
    this.paused = false;
    this.reset();
    events.on(GameEvents.PLAYER_RESPAWNED, () => {
      this.lungs = 1;
      this.oxygen = Math.max(this.oxygen, 0.5);
      this._emit(true);
    });
    events.on(GameEvents.WORLD_GENERATED, () => this.reset());
  }

  reset() {
    this.wearing = false;
    this.oxygen = 1;   // depósito del traje (0..1)
    this.battery = 1;  // batería plank del traje (0..1); null = sin batería
    this.lungs = 1;    // aire retenido (0..1)
    this.breathable = true;
    this._damageTimer = 0;
    this._warned = {};
    this._emitTimer = 0;
    this._emit(true);
  }

  get powered() {
    return this.wearing && this.battery !== null && this.battery > 0;
  }

  // ---- Acciones -------------------------------------------------------------------

  /** Taquilla del laboratorio: ponerse o quitarse el traje (con su jetpack). */
  toggleSuit() {
    if (this.wearing) {
      if (!this._breathableHere()) return this._msg('Aquí no hay aire: no te quites el traje.', 'danger');
      this.wearing = false;
      this._msg('Dejas el traje espacial en la taquilla.');
    } else {
      this.wearing = true;
      this._msg(`Te pones el traje espacial (O₂ ${pct(this.oxygen)} · 🔋 ${this.battery === null ? 'sin batería' : pct(this.battery)}). Lleva un jetpack de gas.`, 'biome');
    }
    this._events.emit(GameEvents.SUIT_CHANGED, { wearing: this.wearing });
    this._emit(true);
    return true;
  }

  /** Estación de oxígeno: llena el depósito del traje. */
  refillOxygen() {
    if (!this.wearing) return this._msg('Ponte el traje (taquilla del laboratorio) para recargar su oxígeno.');
    this.oxygen = 1;
    this.lungs = 1;
    this._warned.oxygen = false;
    this._msg('Depósito de oxígeno del traje lleno.', 'biome');
    this._emit(true);
    return true;
  }

  /** Usar una batería plank con el traje puesto: la cambia por la del traje. */
  swapBattery() {
    const inv = this._inventory;
    if (!this.wearing) return this._msg('Las baterías plank se usan en la nave, en las estaciones de carga, en el traje o en una burbuja.');
    if (!inv.hasItem(this._bat.ITEM, 1)) return this._msg('No tienes baterías plank cargadas.', 'danger');
    if (this.battery !== null && this.battery > 0.9) return this._msg('La batería del traje aún está casi llena.');
    inv.removeItem(this._bat.ITEM, 1);
    if (this.battery !== null) inv.addItem(this.battery > 0.5 ? this._bat.ITEM : this._bat.EMPTY_ITEM, 1);
    this.battery = 1;
    this._warned.battery = false;
    this._msg('Batería del traje cambiada.', 'biome');
    this._emit(true);
    return true;
  }

  // ---- Bucle ------------------------------------------------------------------------

  update(dt) {
    if (this.paused) return;
    const c = this._cfg;
    this.breathable = this._breathableHere();
    if (this.wearing && this.battery !== null && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt / c.SUIT_BATTERY_TIME);
      if (this.battery === 0) this._msg('¡La batería del traje se ha agotado! El traje ya no da oxígeno ni calor.', 'danger');
    }
    let breathing = this.breathable;
    if (!breathing && this.powered && this.oxygen > 0) {
      this.oxygen = Math.max(0, this.oxygen - dt / c.SUIT_OXYGEN_TIME);
      breathing = true;
      if (this.oxygen === 0) this._msg('¡El traje se ha quedado sin oxígeno!', 'danger');
    }
    if (breathing) {
      this.lungs = Math.min(1, this.lungs + (c.LUNGS_RECOVER / 100) * dt);
      this._damageTimer = 0;
      this._warned.noAir = false;
    } else {
      if (!this._warned.noAir) {
        this._warned.noAir = true;
        this._msg(this.wearing ? '¡No te llega aire! Aguanta la respiración y busca oxígeno.' : '¡Aquí no hay aire! Aguanta la respiración: necesitas el traje espacial.', 'danger');
      }
      this.lungs = Math.max(0, this.lungs - dt / c.LUNGS_TIME);
      if (this.lungs === 0) {
        this._damageTimer -= dt;
        if (this._damageTimer <= 0) {
          this._damageTimer = 1;
          this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: c.SUFFOCATION_DAMAGE, source: 'SUFFOCATION' });
        }
      }
    }
    this._lowWarnings();
    this._emitTimer -= dt;
    if (this._emitTimer <= 0) this._emit(true);
  }

  _lowWarnings() {
    const low = this._cfg.LOW_RATIO;
    if (!this.wearing) return;
    if (this.oxygen < low && !this.breathable && !this._warned.oxygen) {
      this._warned.oxygen = true;
      this._msg(`Oxígeno del traje bajo (${pct(this.oxygen)}): vuelve a la nave, a una burbuja o a una estación de oxígeno.`, 'danger');
    }
    if (this.battery !== null && this.battery < low && !this._warned.battery) {
      this._warned.battery = true;
      this._msg(`Batería del traje baja (${pct(this.battery)}): usa una batería plank (clic dcho / R) para cambiarla.`, 'danger');
    }
  }

  _breathableHere() {
    const p = this._player.position;
    return this._isBreathableAt(p.x, p.y + 1.5, p.z);
  }

  getState() {
    return {
      wearing: this.wearing,
      powered: this.powered,
      breathable: this.breathable,
      lungs: this.lungs,
      oxygen: this.oxygen,
      battery: this.battery ?? 0,
    };
  }

  _emit() {
    this._emitTimer = 0.2;
    this._events.emit(GameEvents.LIFE_SUPPORT_CHANGED, this.getState());
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return false;
  }
}

const pct = (r) => `${Math.round(r * 100)} %`;
