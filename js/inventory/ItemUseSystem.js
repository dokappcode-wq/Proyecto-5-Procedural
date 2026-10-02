import { GameEvents } from '../core/GameEvents.js';

/**
 * ItemUseSystem — "usar" (clic derecho / R) el objeto seleccionado en la barra.
 *
 * Solo decide QUÉ sistema se encarga según ITEMS.*.USE; las reglas viven en
 * cada sistema:
 *   EAT        → NutritionSystem.eat()          (carne, manzana)
 *   DRINK      → beber una unidad de agua       (agua del odre)
 *   WATERSKIN  → llenar mirando al agua / beber (odre)
 *   EQUIP      → EquipmentSystem.toggle()       (armadura de cuero)
 * (Las construcciones no son objetos: se colocan en el modo construcción, B.)
 */
const USE_COOLDOWN = 0.35;

export class ItemUseSystem {
  constructor({ items, equipmentConfig, input, hotbar, inventory, nutrition, equipment, interaction, thirst, events, capturesUse = () => false }) {
    this.name = 'itemUse';
    this._items = items;
    this._eqCfg = equipmentConfig;
    this._input = input;
    this._hotbar = hotbar;
    this._inventory = inventory;
    this._nutrition = nutrition;
    this._equipment = equipment;
    this._interaction = interaction;
    this._thirst = thirst;
    this._events = events;
    this._cooldown = 0;
    this._queued = false;
    this._capturesUse = capturesUse; // el clic derecho es del combate (bloquear, apuntar)
    // El agua solo se lleva en el odre: sin odres (o con menos), la que no cabe se pierde.
    events.on(GameEvents.INVENTORY_CHANGED, () => {
      const extra = this._inventory.getItemCount('WATER') - this.waterCapacity;
      if (extra > 0) this._inventory.removeItem('WATER', extra);
    });
  }

  update(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
    // Una pulsación durante el enfriamiento queda en cola (no se pierde).
    if (this._input.wasPressed('USE') && !this._capturesUse()) this._queued = true;
    if (this._cooldown > 0 || !this._queued) return;
    this._queued = false;
    const itemId = this._hotbar.selectedId;
    if (!itemId) {
      this._message('Selecciona un objeto con las teclas 1–9 para usarlo.');
      return;
    }
    this._cooldown = USE_COOLDOWN;
    this.use(itemId);
  }

  /** @returns {boolean} si se usó */
  use(itemId) {
    const def = this._items[itemId];
    if (!def || !this._inventory.hasItem(itemId)) return false;
    let ok = false;
    switch (def.USE) {
      case 'EAT':
        ok = this._eat(itemId);
        break;
      case 'DRINK':
        ok = this._drinkCarried();
        break;
      case 'WATERSKIN':
        ok = this._interaction.target?.kind === 'water' ? this._fillWaterskin() : this._drinkCarried();
        break;
      case 'EQUIP':
        this._equipment.toggle(itemId);
        ok = true;
        break;
      case 'WATCH':
        // Reloj de la nave: la UI muestra/oculta dónde está la nave.
        this._events.emit(GameEvents.SHIP_WATCH_TOGGLE, {});
        ok = true;
        break;
      case 'BUBBLE':
        this._events.emit(GameEvents.BUBBLE_PLACE_REQUEST, { itemId });
        ok = true;
        break;
      case 'BATTERY':
        this._events.emit(GameEvents.BATTERY_USE_REQUEST, { itemId });
        ok = true;
        break;
      case 'BUILD':
        // Una pieza (pared, mesa, antorcha…): se coloca en el modo construcción.
        this._events.emit(GameEvents.BUILD_PIECE_REQUEST, { pieceId: def.BUILD_PIECE });
        ok = true;
        break;
      case 'MAP':
        this._events.emit(GameEvents.MAP_OPEN_REQUEST, { itemId });
        ok = true;
        break;
      default:
        if (def.TOOL) this._message(`${def.NAME}: herramienta. Mantén el clic sobre ${def.TOOL.CHOP_SPEED ? 'un tronco para talar más deprisa' : 'una roca para picarla'}.`);
        else if (def.WEAPON) this._message(`${def.NAME}: ${def.WEAPON.DAMAGE} de daño. Clic para golpear${this._equipment.slots.OFFHAND ? '' : ' (con un escudo puesto, clic dcho bloquea)'}.`);
        else this._message(`${def.NAME}: sirve como material de fabricación (Tab).`);
    }
    if (ok) this._events.emit(GameEvents.ITEM_USED, { itemId, use: def.USE });
    return ok;
  }

  // ---- Capacidad del odre -----------------------------------------------------

  /** Agua máxima que se puede llevar: odres × capacidad. */
  get waterCapacity() {
    return this._inventory.getItemCount('WATERSKIN') * this._eqCfg.WATER_CAPACITY;
  }

  _eat(itemId) {
    const result = this._nutrition.eat(itemId);
    if (!result.ok) {
      if (result.reason === 'full') this._message('No tienes hambre.');
      return false;
    }
    this._inventory.removeItem(itemId, 1);
    return true;
  }

  _fillWaterskin() {
    const capacity = this.waterCapacity;
    const have = this._inventory.getItemCount('WATER');
    if (have >= capacity) {
      this._message('El odre ya está lleno.');
      return false;
    }
    this._inventory.addItem('WATER', capacity - have);
    this._message(`Has llenado el odre (${capacity}/${capacity}).`, 'pickup');
    return true;
  }

  _drinkCarried() {
    if (!this._inventory.hasItem('WATER')) {
      this._message(this._inventory.hasItem('WATERSKIN') ? 'El odre está vacío: llénalo mirando al agua.' : 'No llevas agua.');
      return false;
    }
    if (this._thirst.ratio >= 1) {
      this._message('No tienes sed.');
      return false;
    }
    this._inventory.removeItem('WATER', 1);
    this._events.emit(GameEvents.PLAYER_DRANK, { source: 'WATERSKIN' });
    return true;
  }

  _message(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
