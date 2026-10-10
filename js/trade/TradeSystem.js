import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, hashString } from '../core/SeededRandom.js';

/**
 * TradeSystem — el mercader (P8). Sin DOM (la tienda la dibuja MerchantPanel).
 *
 *   buy(i)     compra la oferta i de TRADE.BUY (gasta monedas; cada oferta tiene existencias
 *              al día, STOCK)
 *   sell(i)    vende la oferta i de TRADE.SELL (te da monedas)
 *   deliver(i) entrega el encargo i (monedas y experiencia)
 * Los precios mejoran con la habilidad «Regateo» (perk('TRADE')). Cada día de juego se
 * reponen las existencias y los encargos cumplidos se cambian por otros nuevos.
 * En el mundo es un "provider" de InteractionSystem: E sobre el mercader abre la tienda.
 */
export class TradeSystem {
  constructor({ config, items, inventory, events, day = () => 1, perk = () => 0, seed = 1, isHome = () => true }) {
    this.name = 'trade';
    this._cfg = config;
    this._items = items;
    this._inv = inventory;
    this._events = events;
    this._day = day;
    this._perk = perk;
    this._seed = seed;
    this._isHome = isHome;
    this.npc = null;          // { x, y, z } (lo pone main al construir el puesto)
    this.view = null;         // { group, animate }
    this.day = 0;
    this.stock = [];
    this.orders = [];
    this.ordersDone = 0;
    this._orderSeq = 0;
    this._t = 0;
    this._talk = 0;
    this._refresh(true);
  }

  // ---- Precios -------------------------------------------------------------------------

  buyPrice(offer) {
    return Math.max(1, Math.round(offer.PRICE * (1 - this._perk('TRADE'))));
  }

  sellPrice(offer) {
    return Math.max(1, Math.round(offer.PRICE * (1 + this._perk('TRADE'))));
  }

  get coins() {
    return this._inv.getItemCount('COIN');
  }

  // ---- Comprar, vender, encargos ---------------------------------------------------------

  buy(i) {
    const o = this._cfg.BUY[i];
    if (!o) return this._fail('No existe esa oferta.');
    if (this.stock[i] <= 0) return this._fail('Se le ha acabado: vuelve mañana.');
    const price = this.buyPrice(o);
    if (this.coins < price) return this._fail(`Te faltan monedas (${price} 🪙).`);
    if (this._inv.roomFor(o.ITEM) < o.AMOUNT) return this._fail('No te cabe en la mochila.');
    this._inv.removeItem('COIN', price);
    this._inv.addItem(o.ITEM, o.AMOUNT);
    this.stock[i]--;
    this._done('BUY', o.ITEM, o.AMOUNT, price);
    return true;
  }

  sell(i) {
    const o = this._cfg.SELL[i];
    if (!o) return this._fail('No existe esa oferta.');
    if (this._inv.getItemCount(o.ITEM) < o.AMOUNT) return this._fail(`Necesitas ${o.AMOUNT} ${this._items[o.ITEM].NAME.toLowerCase()}.`);
    const price = this.sellPrice(o);
    this._inv.removeItem(o.ITEM, o.AMOUNT);
    this._inv.addItem('COIN', price);
    this._done('SELL', o.ITEM, o.AMOUNT, price);
    return true;
  }

  deliver(i) {
    const o = this.orders[i];
    if (!o || o.done) return this._fail('Ese encargo ya está hecho.');
    if (this._inv.getItemCount(o.item) < o.amount) return this._fail(`Te faltan ${o.amount - this._inv.getItemCount(o.item)} ${this._items[o.item].NAME.toLowerCase()}.`);
    this._inv.removeItem(o.item, o.amount);
    this._inv.addItem('COIN', o.reward);
    o.done = true;
    this.ordersDone++;
    this._talk = 2;
    this._events.emit(GameEvents.ORDER_DONE, { order: o });
    this._events.emit(GameEvents.UI_MESSAGE, { text: `📦 Encargo cumplido: +${o.reward} 🪙 y ${o.xp} de experiencia. «¡Gracias, amigo!»`, type: 'pickup' });
    return true;
  }

  _done(kind, item, amount, price) {
    this._talk = 1.5;
    this._events.emit(GameEvents.TRADE_DONE, { kind, item, amount, price });
    return true;
  }

  _fail(text) {
    this._events.emit(GameEvents.UI_MESSAGE, { text: `💬 ${text}`, type: 'warning' });
    return false;
  }

  // ---- Días ----------------------------------------------------------------------------

  /** Nuevo día: existencias llenas y encargos cumplidos cambiados por otros. */
  _refresh(first = false) {
    this.day = this._day();
    this.stock = this._cfg.BUY.map((o) => o.STOCK);
    const keep = first ? [] : this.orders.filter((o) => !o.done);
    const rng = new SeededRandom(this._seed + this.day * 7919);
    const pool = this._cfg.ORDERS.filter((t) => !keep.some((o) => o.item === t.ITEM));
    while (keep.length < this._cfg.ORDER_SLOTS && pool.length) {
      const t = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      const amount = t.AMOUNT[0] + Math.floor(rng.next() * (t.AMOUNT[1] - t.AMOUNT[0] + 1));
      const reward = t.REWARD[0] + Math.floor(rng.next() * (t.REWARD[1] - t.REWARD[0] + 1));
      keep.push({ id: ++this._orderSeq, item: t.ITEM, amount, reward, xp: t.XP, text: t.TEXT, done: false });
    }
    this.orders = keep;
  }

  update(dt) {
    this._t += dt;
    this._talk = Math.max(0, this._talk - dt);
    if (this._day() !== this.day) this._refresh();
    if (this.view) {
      this.view.group.visible = this._isHome();
      if (this.view.group.visible) this.view.animate(this._t, this._talk > 0);
    }
  }

  // ---- Interacción (provider) --------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    const n = this.npc;
    if (!n || !this._isHome() || Math.hypot(n.x - x, n.z - z) > range + 3) return [];
    return [{ id: 'merchant', x: n.x, y: n.y + 1.3, z: n.z, aimRadius: 0.9, reach: 1.8, label: this._cfg.MERCHANT.NAME, action: 'Comerciar', key: 'E' }];
  }

  interact() {
    this._talk = 1.2;
    this._events.emit(GameEvents.TRADE_OPEN, {});
    return true;
  }

  // ---- Guardar ----------------------------------------------------------------------------

  snapshot() {
    return { day: this.day, stock: [...this.stock], orders: this.orders.map((o) => ({ ...o })), done: this.ordersDone, seq: this._orderSeq };
  }

  /** Datos no fiables: solo encargos de la lista y números razonables. */
  restore(d) {
    if (!d || typeof d !== 'object') return;
    const int = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
    this.day = int(d.day, 1e6);
    this.stock = this._cfg.BUY.map((o, i) => Math.min(o.STOCK, int(d.stock?.[i], o.STOCK)));
    this.ordersDone = int(d.done, 1e6);
    this._orderSeq = int(d.seq, 1e9);
    const valid = new Set(this._cfg.ORDERS.map((t) => t.ITEM));
    this.orders = (Array.isArray(d.orders) ? d.orders : []).filter((o) => o && valid.has(o.item)).slice(0, this._cfg.ORDER_SLOTS).map((o) => {
      const t = this._cfg.ORDERS.find((x) => x.ITEM === o.item);
      return { id: int(o.id, 1e9), item: o.item, amount: Math.max(1, int(o.amount, 999)), reward: Math.max(1, int(o.reward, 999)), xp: t.XP, text: t.TEXT, done: !!o.done };
    });
    if (this._day() !== this.day || this.orders.length < this._cfg.ORDER_SLOTS) this._refresh();
  }
}

/** Semilla del mercader para una partida. */
export const tradeSeed = (worldSeed) => hashString(`trade:${worldSeed}`);
