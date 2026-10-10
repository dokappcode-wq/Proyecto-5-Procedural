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
 *   REPAIR     → martillo: arregla lo más gastado con 1 lingote de su material
 *   BUCKET     → cubo: llenarlo mirando al agua / beberse el cubo de agua
 *   SPYGLASS   → catalejo (el zoom lo hace main mientras se mantiene el clic dcho)
 *   POTION     → se bebe (StatusEffects aplica sus estados; main cura HEAL) y deja el frasco
 *   BACKPACK   → se cose a la espalda: la mochila gana una fila (para siempre)
 * (Las construcciones no son objetos: se colocan en el modo construcción, B.)
 */
const USE_COOLDOWN = 0.35;
/** Material con el que se arregla lo que no dice REPAIR (por el prefijo del id). */
const REPAIR_BY_PREFIX = [['DIAMOND_', 'REFINED_DIAMOND'], ['IRON_', 'REFINED_IRON'], ['COPPER_', 'REFINED_COPPER'], ['STONE_', 'REFINED_STONE'], ['LEATHER_', 'REFINED_LEATHER']];
const REPAIR_FRACTION = 0.4; // cada lingote devuelve el 40 % del aguante
const BUCKET_DRINK = 3;      // un cubo de agua quita la sed de 3 tragos

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
        this._events.emit(GameEvents.BUILD_PIECE_REQUEST, { pieceId: def.BUILD_PIECE, once: !!def.HOLD }); // la antorcha: una y vuelve a la mano
        ok = true;
        break;
      case 'REPAIR':
        ok = this._repair();
        break;
      case 'BUCKET':
        ok = this._bucket(itemId);
        break;
      case 'SPYGLASS':
        ok = true;
        break;
      case 'POTION':
        this._inventory.removeItem(itemId, 1);
        this._inventory.addItem('GLASS_BOTTLE', 1);
        this._events.emit(GameEvents.POTION_DRUNK, { itemId });
        ok = true;
        break;
      case 'TREASURE':
        // Mapa del tesoro (P8): marca unas ruinas; se gasta solo si ha marcado algo.
        ok = !!this.treasure?.readMap();
        if (ok) this._inventory.removeItem(itemId, 1);
        break;
      case 'BACKPACK':
        ok = this._backpack(itemId, def);
        break;
      case 'MAP':
        this._events.emit(GameEvents.MAP_OPEN_REQUEST, { itemId });
        ok = true;
        break;
      default:
        if (def.SEED) this._message(`${def.NAME}: ponte delante de una 🌱 parcela de cultivo y pulsa E para sembrar.`);
        else if (def.FERTILIZER) this._message(`${def.NAME}: con E sobre una parcela sembrada, la abonas (crece más deprisa y da más).`);
        else if (itemId === 'SHEARS') this._message('✂️ Tijeras: con E sobre una cabra la esquilas (lana).');
        else if (def.TOOL) this._message(`${def.NAME}: herramienta. Mantén el clic sobre ${def.TOOL.CHOP_SPEED ? 'un tronco para talar más deprisa' : 'una roca para picarla'}.`);
        else if (def.WEAPON) this._message(`${def.NAME}: ${def.WEAPON.DAMAGE} de daño. Clic para golpear${this._items[this._equipment.slots.OFFHAND]?.SHIELD ? '' : ' (con un escudo puesto, clic dcho bloquea)'}.`);
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

  // ---- Martillo ----------------------------------------------------------------

  /** Material que arregla un objeto (REPAIR o, si no lo dice, el de su nombre). */
  repairMaterial(id) {
    const def = this._items[id];
    if (!def?.DURABILITY) return null;
    if (def.REPAIR) return def.REPAIR;
    return REPAIR_BY_PREFIX.find(([pre]) => id.startsWith(pre))?.[1] ?? null;
  }

  /**
   * Arregla lo más gastado (por proporción) de lo que se lleva o se tiene puesto y tenga
   * material en el inventario: gasta 1 lingote y devuelve REPAIR_FRACTION del aguante.
   */
  _repair() {
    const inv = this._inventory;
    const cands = [];
    inv.slots.forEach((st, i) => {
      if (!st || st.dur == null) return;
      const max = inv.maxDurability(st.id);
      if (max && st.dur < max) cands.push({ id: st.id, ratio: st.dur / max, max, get: () => st.dur, set: (v) => { st.dur = v; } });
    });
    const eq = this._equipment;
    for (const [slot, id] of Object.entries(eq?.slots ?? {})) {
      const max = this._items[id]?.DURABILITY;
      const dur = eq.dur?.[slot];
      if (id && max && dur != null && dur < max) cands.push({ id, ratio: dur / max, max, get: () => eq.dur[slot], set: (v) => { eq.dur[slot] = v; } });
    }
    if (!cands.length) {
      this._message('🔨 No llevas nada gastado que arreglar.');
      return false;
    }
    cands.sort((a, b) => a.ratio - b.ratio);
    const fix = cands.find((c) => {
      const mat = this.repairMaterial(c.id);
      return mat && inv.hasItem(mat);
    });
    if (!fix) {
      const c = cands[0];
      const mat = this._items[this.repairMaterial(c.id)];
      this._message(`🔨 Para arreglar ${this._items[c.id].NAME.toLowerCase()} necesitas ${mat ? `${mat.ICON} ${mat.NAME.toLowerCase()}` : 'su material'}.`, 'warning');
      return false;
    }
    const mat = this.repairMaterial(fix.id);
    inv.removeItem(mat, 1);
    const now = Math.min(fix.max, fix.get() + Math.ceil(fix.max * REPAIR_FRACTION));
    fix.set(now);
    inv._emit?.(fix.id, 0); // refrescar las barras de aguante
    this._events.emit(GameEvents.ITEM_REPAIRED, { itemId: fix.id, dur: now, max: fix.max });
    this._message(`🔨 ${this._items[fix.id].NAME} arreglado: ${now}/${fix.max}.`, 'pickup');
    return true;
  }

  // ---- Mochilas ----------------------------------------------------------------

  _backpack(itemId, def) {
    const inv = this._inventory;
    const rows = def.ROWS ?? 1;
    if (inv.extraRows >= rows) {
      this._message(`🎒 Ya llevas ${rows > 1 ? 'la mochila grande' : 'mochila'}.`);
      return false;
    }
    if (inv.extraRows < rows - 1) {
      this._message('🎒 Primero cóse la mochila normal: la grande va encima.', 'warning');
      return false;
    }
    inv.removeItem(itemId, 1);
    inv.setExtraRows(rows);
    this._message(`🎒 ${def.NAME} puesta: ahora llevas ${inv.mainSize + inv.extraRows * inv.columns} huecos en la mochila.`, 'pickup');
    this._events.emit(GameEvents.INVENTORY_EXPANDED, { rows: inv.extraRows });
    return true;
  }

  // ---- Cubo --------------------------------------------------------------------

  _bucket(itemId) {
    const idx = this._hotbar.selectedIndex;
    const swap = (to) => {
      const st = this._inventory.slots[idx];
      if (st?.id === itemId) {
        st.id = to;
        this._inventory._emit?.(to, 0);
      } else if (this._inventory.removeItem(itemId, 1)) this._inventory.addItem(to, 1);
    };
    if (itemId === 'BUCKET_MILK') {
      // Leche (P4): alimenta y quita sed; el cubo queda vacío.
      const r = this._nutrition.eat?.(itemId);
      if (!r?.ok) {
        this._message('No tienes hambre.');
        return false;
      }
      swap('BUCKET');
      return true;
    }
    if (itemId === 'BUCKET') {
      if (this._interaction.target?.kind !== 'water') {
        this._message('🪣 Mira al agua (lago, río o charca) para llenar el cubo.');
        return false;
      }
      swap('BUCKET_WATER');
      this._message('🪣 Has llenado el cubo.', 'pickup');
      return true;
    }
    if (this._thirst.ratio >= 1) {
      this._message('No tienes sed.');
      return false;
    }
    swap('BUCKET');
    this._events.emit(GameEvents.PLAYER_DRANK, { source: 'BUCKET', amount: (this._thirst.max ?? 100) * 0.12 * BUCKET_DRINK });
    return true;
  }

  _message(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
