import { GameEvents } from '../core/GameEvents.js';

/**
 * AchievementSystem — logros (P8). Escucha lo que pasa en el juego, lleva contadores
 * y desbloquea ACHIEVEMENTS.* una sola vez (aviso + ACHIEVEMENT_UNLOCKED con su XP).
 * Sin DOM. Se guarda: desbloqueados y contadores.
 */
export class AchievementSystem {
  constructor({ config, recipes = {}, events, inventory = null, day = () => 1 }) {
    this.name = 'achievements';
    this._cfg = config;
    this._events = events;
    this._inv = inventory;
    this._day = day;
    this.unlocked = new Set();
    this.counts = {};
    this._tick = 0;
    const on = (ev, fn) => events.on(ev, (d) => fn(d ?? {}));
    on(GameEvents.RESOURCE_HIT, ({ felled, material, node }) => {
      if (!felled) return;
      if (material === 'wood') this.unlock('FIRST_TREE');
      if (node?.type === 'DIAMOND_ORE') this.unlock('DIAMOND');
    });
    on(GameEvents.ITEM_CRAFTED, ({ recipeId }) => {
      const cat = recipes[recipeId]?.CATEGORY;
      if (cat === 'TOOLS') this.unlock('FIRST_TOOL');
      if (cat === 'COOKING') this.unlock('COOK');
    });
    on(GameEvents.STRUCTURE_PLACED, () => this.count('BUILDER'));
    on(GameEvents.FARM_CHANGED, ({ action }) => action === 'harvest' && this.count('FARMER'));
    on(GameEvents.ANIMAL_TAMED, () => this.unlock('TAMER'));
    on(GameEvents.FISH_CAUGHT, ({ item }) => {
      this.count('ANGLER');
      if (item === 'GOLDEN_FISH') this.unlock('GOLDEN_FISH');
    });
    on(GameEvents.ENEMY_KILLED, ({ enemy }) => {
      const t = enemy?.type;
      if (t === 'GOLEM') this.unlock('GOLEM');
      else if (t === 'WOLF') this.count('WOLVES');
      else if (t === 'SPIDER' || t === 'BAT') this.count('CAVE_DWELLER');
      else if (t === 'CRAB') this.unlock('CRAB');
      else if (t === 'GOBLIN_KING') this.unlock('GOBLIN_KING');
    });
    on(GameEvents.BASE_CLEARED, ({ base } = {}) => !base?.fortress && this.unlock('GOBLIN_BASE'));
    on(GameEvents.PLACE_CHANGED, ({ first }) => first && this.count('EXPLORER'));
    on(GameEvents.POTION_DRUNK, () => this.unlock('POTION'));
    on(GameEvents.TRADE_DONE, () => this.unlock('TRADER'));
    on(GameEvents.ORDER_DONE, () => this.count('ORDERS'));
    on(GameEvents.TREASURE_FOUND, () => this.unlock('TREASURE'));
    on(GameEvents.PLAYER_LEVEL_UP, ({ level }) => level >= 10 && this.unlock('LEVEL_10'));
    on(GameEvents.INVENTORY_EXPANDED, () => this.unlock('BACKPACK'));
    on(GameEvents.INVENTORY_CHANGED, () => this._inv && this._inv.getItemCount('COIN') >= 100 && this.unlock('RICH'));
  }

  /** Suma 1 al contador; al llegar a COUNT se desbloquea. */
  count(id, n = 1) {
    if (this.unlocked.has(id) || !this._cfg[id]) return;
    this.counts[id] = (this.counts[id] ?? 0) + n;
    if (this.counts[id] >= (this._cfg[id].COUNT ?? 1)) this.unlock(id);
  }

  unlock(id) {
    const def = this._cfg[id];
    if (!def || this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    this._events.emit(GameEvents.ACHIEVEMENT_UNLOCKED, { id, def });
    this._events.emit(GameEvents.UI_MESSAGE, { text: `🏆 Logro: ${def.ICON} ${def.NAME} — ${def.DESC}`, type: 'pickup' });
    return true;
  }

  /** Progreso de un logro con contador: [n, COUNT]. */
  progress(id) {
    const def = this._cfg[id];
    return [Math.min(def.COUNT ?? 1, this.unlocked.has(id) ? def.COUNT ?? 1 : this.counts[id] ?? 0), def.COUNT ?? 1];
  }

  update(dt) {
    this._tick -= dt;
    if (this._tick > 0) return;
    this._tick = 2;
    if (this._day() >= 11) this.unlock('SURVIVOR');
  }

  snapshot() {
    return { unlocked: [...this.unlocked], counts: { ...this.counts } };
  }

  restore(d) {
    this.unlocked = new Set((Array.isArray(d?.unlocked) ? d.unlocked : []).filter((id) => this._cfg[id]));
    this.counts = {};
    for (const [id, n] of Object.entries(d?.counts ?? {})) {
      if (this._cfg[id] && Number.isFinite(n)) this.counts[id] = Math.max(0, Math.min(1e6, Math.floor(n)));
    }
  }
}
