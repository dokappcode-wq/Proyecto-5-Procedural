import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * JournalPanel — el diario (tecla K, P8): encargos del mercader, tesoros marcados,
 * habilidades (árbol ampliado: se suben con los puntos de nivel) y logros.
 * Solo DOM con textContent.
 */
const TABS = [['ORDERS', '📦 Encargos'], ['TREASURE', '🗺️ Tesoros'], ['SKILLS', '⭐ Habilidades'], ['ACHIEVEMENTS', '🏆 Logros']];

export class JournalPanel extends ModalPanel {
  constructor({ container, input, events, trade, treasure, progression, statDefs, achievements, achievementDefs, items, inventory, places = null }) {
    super({ id: 'journal-panel', title: '📔 Diario', container, input, events, footer: '<kbd>K</kbd> o <kbd>Esc</kbd> cerrar' });
    this._trade = trade;
    this._treasure = treasure;
    this._prog = progression;
    this._statDefs = statDefs;
    this._ach = achievements;
    this._achDefs = achievementDefs;
    this._items = items;
    this._inv = inventory;
    this._places = places;
    this.tab = 'ORDERS';
    for (const ev of [GameEvents.PROGRESSION_CHANGED, GameEvents.ACHIEVEMENT_UNLOCKED, GameEvents.INVENTORY_CHANGED, GameEvents.TREASURE_MARKED, GameEvents.TREASURE_FOUND, GameEvents.ORDER_DONE]) {
      events.on(ev, () => this.isOpen && this.render());
    }
  }

  update(dt) {
    super.update(dt);
    if (this._input.wasPressed('JOURNAL') || (this.isOpen && this._keyToggle)) {
      this._keyToggle = false;
      this.setOpen(!this.isOpen);
    }
  }

  setOpen(open) {
    super.setOpen(open);
    // Con el panel abierto la entrada de juego está bloqueada: la K se lee aquí.
    if (open && !this._keyHook) {
      this._keyHook = true;
      this._input.onRawKey((e) => {
        if (this.isOpen && e.code === 'KeyK' && e.type === 'keydown') this._keyToggle = true;
      });
    }
  }

  render() {
    const b = this.body;
    b.replaceChildren();
    const tabs = el('nav', 'jp-tabs');
    for (const [id, label] of TABS) {
      const t = el('button', `jp-tab${this.tab === id ? ' active' : ''}`, label);
      t.type = 'button';
      t.addEventListener('click', () => {
        this.tab = id;
        this.render();
      });
      tabs.append(t);
    }
    const sec = el('section', 'jp-section');
    if (this.tab === 'ORDERS') this._orders(sec);
    else if (this.tab === 'TREASURE') this._treasures(sec);
    else if (this.tab === 'SKILLS') this._skills(sec);
    else this._achievements(sec);
    b.append(tabs, sec);
  }

  _orders(sec) {
    sec.append(el('h3', null, `Encargos de ${this._trade._cfg.MERCHANT.NAME}`), el('p', 'mp-note', 'Su puesto está junto al Camino Real, cerca de donde llegaste. Cada día cambia los encargos que ya le hayas cumplido.'));
    for (const o of this._trade.orders) {
      const def = this._items[o.item];
      const have = Math.min(o.amount, this._inv.getItemCount(o.item));
      const row = el('div', 'mp-row');
      row.append(el('span', 'mp-icon', def.ICON), el('span', 'mp-name', `${def.NAME} ×${o.amount}`), el('span', 'mp-price', `+${o.reward} 🪙`), el('span', 'mp-info', o.done ? '✔ hecho' : `${have}/${o.amount}`), el('span'));
      sec.append(row);
    }
    sec.append(el('p', 'mp-note', `Encargos cumplidos: ${this._trade.ordersDone} · Monedas: ${this._inv.getItemCount('COIN')} 🪙`));
  }

  _treasures(sec) {
    const T = this._treasure;
    const marked = T.ruins.filter((r) => r.marked && !r.found);
    const found = T.ruins.filter((r) => r.found).length;
    sec.append(el('h3', null, 'Mapas del tesoro'));
    if (!marked.length) sec.append(el('p', 'mp-note', 'No tienes tesoros marcados. Los mapas del tesoro se compran al mercader o salen en las bases goblin; úsalos con clic dcho.'));
    for (const r of marked) sec.append(el('p', null, `❌ Ruinas ${r.name ? `(${r.name}) ` : ''}${T.direction(r)} — cava con la pala en la X.`));
    sec.append(el('p', 'mp-note', `Tesoros desenterrados: ${found} de ${T.ruins.length}.`));
    if (this._places) sec.append(el('p', 'mp-note', `Lugares descubiertos: ${this._places.discovered?.size ?? 0}.`));
  }

  _skills(sec) {
    const P = this._prog;
    sec.append(el('h3', null, `Nivel ${P.level} · ${P.points} ${P.points === 1 ? 'punto' : 'puntos'} para repartir`));
    sec.append(el('p', 'mp-note', 'Cada nivel da un punto. Vida, estamina, daño y velocidad se suben en el reloj; aquí, las habilidades (como mucho 5 puntos cada una).'));
    for (const [id, d] of Object.entries(this._statDefs)) {
      if (!d.PERK) continue;
      const lv = P.stats[id] ?? 0;
      const row = el('div', 'mp-row');
      const pct = Math.round(lv * d.PER_POINT * 100);
      row.append(el('span', 'mp-icon', d.ICON), el('span', 'mp-name', `${d.NAME} — ${d.DESC}`), el('span', 'mp-price', `${'●'.repeat(lv)}${'○'.repeat(d.MAX - lv)}`), el('span', 'mp-info', `+${pct} %`));
      const btn = el('button', 'mp-btn', '+');
      btn.type = 'button';
      btn.disabled = P.points <= 0 || lv >= d.MAX;
      btn.addEventListener('click', () => P.spend(id));
      row.append(btn);
      sec.append(row);
    }
  }

  _achievements(sec) {
    const A = this._ach;
    sec.append(el('h3', null, `Logros: ${A.unlocked.size} de ${Object.keys(this._achDefs).length}`));
    const grid = el('div', 'jp-ach');
    for (const [id, d] of Object.entries(this._achDefs)) {
      const done = A.unlocked.has(id);
      const box = el('div', done ? 'done' : 'locked');
      const [n, max] = A.progress(id);
      box.append(el('b', null, `${d.ICON} ${d.NAME}`), el('span', null, `${d.DESC}${max > 1 && !done ? ` (${n}/${max})` : ''}`));
      grid.append(box);
    }
    sec.append(grid);
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
