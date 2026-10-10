import { ModalPanel } from '../ui/ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * MerchantPanel — la tienda del mercader (P8): Comprar · Vender · Encargos.
 * Solo DOM con textContent. Se refresca al cambiar el inventario.
 */
const TABS = [['BUY', '🛒 Comprar'], ['SELL', '💰 Vender'], ['ORDERS', '📦 Encargos']];

export class MerchantPanel extends ModalPanel {
  constructor({ container, input, events, trade, items, inventory }) {
    super({ id: 'merchant-panel', title: trade._cfg.MERCHANT.NAME, container, input, events, footer: '<kbd>Clic</kbd> en un botón para comerciar · <kbd>Esc</kbd> cerrar' });
    this._trade = trade;
    this._items = items;
    this._inv = inventory;
    this.tab = 'BUY';
    events.on(GameEvents.TRADE_OPEN, () => this.setOpen(true));
    events.on(GameEvents.INVENTORY_CHANGED, () => this.isOpen && this.render());
  }

  render() {
    const T = this._trade;
    const b = this.body;
    b.replaceChildren();
    b.classList.add('merchant');
    const head = el('div', 'mp-head');
    head.append(el('span', 'mp-greet', '«¡Bienvenido! Tengo de todo un poco… y compro lo que traigas.»'), el('span', 'mp-coins', `🪙 ${T.coins}`));
    const tabs = el('nav', 'mp-tabs');
    for (const [id, label] of TABS) {
      const t = el('button', `mp-tab${this.tab === id ? ' active' : ''}`, label);
      t.type = 'button';
      t.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabs.append(t);
    }
    const list = el('div', 'mp-list');
    if (this.tab === 'BUY') {
      T._cfg.BUY.forEach((o, i) => {
        const price = T.buyPrice(o);
        const left = T.stock[i];
        list.append(this._row(o.ITEM, o.AMOUNT, `${price} 🪙`, left > 0 ? `quedan ${left}` : 'agotado', 'Comprar', left > 0 && T.coins >= price, () => T.buy(i)));
      });
    } else if (this.tab === 'SELL') {
      T._cfg.SELL.forEach((o, i) => {
        const have = this._inv.getItemCount(o.ITEM);
        list.append(this._row(o.ITEM, o.AMOUNT, `+${T.sellPrice(o)} 🪙`, `tienes ${have}`, 'Vender', have >= o.AMOUNT, () => T.sell(i)));
      });
    } else {
      list.append(el('p', 'mp-note', 'Encargos de Tomás: tráele lo que pide y te paga. Cada día cambia los que ya le hayas traído.'));
      T.orders.forEach((o, i) => {
        const have = this._inv.getItemCount(o.item);
        const row = this._row(o.item, o.amount, `+${o.reward} 🪙 · ${o.xp} XP`, o.done ? '✔ hecho' : `tienes ${Math.min(have, o.amount)}/${o.amount}`, o.done ? 'Hecho' : 'Entregar', !o.done && have >= o.amount, () => T.deliver(i));
        row.prepend(el('div', 'mp-quote', `«${o.text}»`));
        list.append(row);
      });
    }
    b.append(head, tabs, list);
  }

  _row(itemId, amount, price, info, action, enabled, fn) {
    const def = this._items[itemId];
    const row = el('div', 'mp-row');
    row.append(el('span', 'mp-icon', def.ICON), el('span', 'mp-name', `${def.NAME}${amount > 1 ? ` ×${amount}` : ''}`), el('span', 'mp-price', price), el('span', 'mp-info', info));
    const btn = el('button', 'mp-btn', action);
    btn.type = 'button';
    btn.disabled = !enabled;
    btn.addEventListener('click', () => {
      if (fn()) this.render();
    });
    row.append(btn);
    return row;
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
