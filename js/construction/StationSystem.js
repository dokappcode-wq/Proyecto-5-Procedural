import { GameEvents } from '../core/GameEvents.js';

/**
 * StationSystem — hace funcionar las estaciones construidas en las lunas:
 *
 *   Estación de carga (CHARGING_STATION): E con una batería plank vacía la
 *   coloca; se carga en CHARGER_TIME s (placas solares, también fuera de la
 *   luna activa); E otra vez la devuelve cargada.
 *   Estación de oxígeno (OXYGEN_STATION): E llena el depósito del traje.
 *
 * Escribe `piece.actionText` para que la mira muestre qué hará E.
 */
export class StationSystem {
  constructor({ construction, lifeSupport, inventory, events, config, batteries }) {
    this.name = 'stations';
    this._construction = construction;
    this._life = lifeSupport;
    this._inventory = inventory;
    this._events = events;
    this._cfg = config;     // LIFE_SUPPORT
    this._bat = batteries;  // SHIP.BATTERIES
    this._timer = 0;
    events.on(GameEvents.STRUCTURE_INTERACT, ({ structure }) => this.interact(structure));
    // Al quitar una estación con una batería dentro, se devuelve.
    events.on(GameEvents.STRUCTURE_REMOVED, ({ structure }) => {
      if (structure.type === 'CHARGING_STATION' && structure.battery) {
        inventory.addItem(structure.battery.charge >= 1 ? this._bat.ITEM : this._bat.EMPTY_ITEM, 1);
      }
    });
  }

  interact(piece) {
    if (piece.type === 'OXYGEN_STATION') {
      this._life.refillOxygen();
      return true;
    }
    if (piece.type !== 'CHARGING_STATION') return false;
    const inv = this._inventory;
    if (piece.battery) {
      if (piece.battery.charge < 1) {
        this._msg(`Cargando la batería… ${Math.round(piece.battery.charge * 100)} %`);
        return true;
      }
      inv.addItem(this._bat.ITEM, 1);
      piece.battery = null;
      this._msg('Coges la batería plank cargada.', 'biome');
    } else if (inv.hasItem(this._bat.EMPTY_ITEM, 1)) {
      inv.removeItem(this._bat.EMPTY_ITEM, 1);
      piece.battery = { charge: 0 };
      this._msg(`Batería vacía colocada: tardará ${this._cfg.CHARGER_TIME} s en cargarse.`, 'biome');
    } else {
      this._msg('Trae una batería plank vacía para cargarla.');
    }
    return true;
  }

  update(dt) {
    const rate = dt / this._cfg.CHARGER_TIME;
    for (const p of this._construction.allPieces()) {
      if (p.type === 'CHARGING_STATION') {
        if (p.battery && p.battery.charge < 1) {
          p.battery.charge = Math.min(1, p.battery.charge + rate);
          if (p.battery.charge === 1 && p.body === this._construction.bodyId) this._msg('🔌 Una batería plank está cargada.', 'biome');
        }
        p.actionText = p.battery
          ? p.battery.charge < 1 ? `Cargando ${Math.round(p.battery.charge * 100)} %` : 'Coger batería cargada'
          : 'Cargar batería vacía';
      } else if (p.type === 'OXYGEN_STATION') {
        p.actionText = 'Recargar oxígeno del traje';
      }
    }
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
