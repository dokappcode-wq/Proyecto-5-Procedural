import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * InventoryPanel — el inventario completo (tecla I):
 *   - Ropa: 5 ranuras (cabeza, pecho, piernas, pies, manos) y la protección contra el frío.
 *   - Mochila 9 × 3 y, debajo, la barra rápida 9 × 1 (teclas 1–9).
 *
 * Ratón (como en otros juegos de supervivencia):
 *   clic: coger / dejar / juntar / cambiar · clic derecho: coger la mitad / dejar una
 *   Shift + clic: mover rápido (barra ↔ mochila; la ropa a su ranura y de vuelta).
 * Lo que se lleva con el ratón sigue al puntero; al cerrar, vuelve al inventario.
 * Solo vista: toda la lógica está en InventorySystem.click().
 */
export class InventoryPanel extends ModalPanel {
  constructor({ container, input, events, inventory, equipment, items }) {
    super({
      id: 'inventory-panel', title: '🎒 Inventario', container, input, events,
      footer: '<kbd>Clic</kbd> coger / dejar · <kbd>Clic dcho</kbd> la mitad / una · <kbd>Shift</kbd>+<kbd>Clic</kbd> mover rápido · <kbd>I</kbd> o <kbd>Esc</kbd> cerrar',
    });
    this._inv = inventory;
    this._eq = equipment;
    this._items = items;
    this._hover = null;
    this._build();

    // I cierra aunque la entrada de juego esté bloqueada (se aplica en update()).
    input.onRawKey((e) => {
      if (this.isOpen && e.code === 'KeyI') this._closeRequested = true;
    });
    events.on(GameEvents.INVENTORY_CHANGED, () => this.isOpen && this.render());
    events.on(GameEvents.EQUIPMENT_CHANGED, () => this.isOpen && this.render());
    events.on(GameEvents.HOTBAR_CHANGED, () => this.isOpen && this.render());
  }

  update(dt) {
    const wasOpen = this.isOpen;
    super.update(dt);
    if (!wasOpen && this._input.wasPressed('INVENTORY')) this.setOpen(true);
  }

  setOpen(open) {
    if (!open) this._inv.returnCursor();
    super.setOpen(open);
    this._cursorEl.classList.toggle('hidden', true);
  }

  _build() {
    const wrap = el('div', 'inv-layout');

    // Ropa.
    const gear = el('div', 'inv-gear');
    gear.append(el('h3', null, 'Ropa'));
    this._gearSlots = {};
    for (const [slot, def] of Object.entries(this._eq.slotDefs)) {
      const row = el('div', 'inv-gear-row');
      const s = this._slotEl(`eq:${slot}`);
      s.classList.add('gear');
      s.dataset.empty = def.ICON;
      this._gearSlots[slot] = s;
      row.append(s, el('span', 'inv-gear-name', def.NAME));
      gear.append(row);
    }
    this._protection = el('p', 'inv-protection');
    gear.append(this._protection);

    // Mochila + barra.
    const bag = el('div', 'inv-bag');
    bag.append(el('h3', null, 'Mochila'));
    const main = el('div', 'inv-grid');
    this._mainSlots = [];
    for (let i = this._inv.hotbarSize; i < this._inv.slots.length; i++) {
      const s = this._slotEl(i);
      this._mainSlots.push(s);
      main.append(s);
    }
    const bar = el('div', 'inv-grid inv-hotbar');
    this._barSlots = [];
    for (let i = 0; i < this._inv.hotbarSize; i++) {
      const s = this._slotEl(i);
      s.append(el('span', 'key', String(i + 1)));
      this._barSlots.push(s);
      bar.append(s);
    }
    this._info = el('p', 'inv-info', ' ');
    bag.append(main, el('h3', null, 'Barra rápida (1–9)'), bar, this._info);

    wrap.append(gear, bag);
    this.body.append(wrap);

    // Lo que se lleva con el ratón.
    this._cursorEl = el('div', 'inv-slot inv-cursor hidden');
    this._cursorEl.append(el('span', 'icon'), el('span', 'count'));
    document.body.appendChild(this._cursorEl);
    window.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      this._cursorEl.style.left = `${e.clientX}px`;
      this._cursorEl.style.top = `${e.clientY}px`;
    });
  }

  _slotEl(ref) {
    const s = el('div', 'inv-slot');
    s.dataset.ref = String(ref);
    s.append(el('span', 'icon'), el('span', 'count'));
    s.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._inv.click(ref, { button: e.button, shift: e.shiftKey });
    });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('mouseenter', () => {
      this._hover = ref;
      this._renderInfo();
    });
    s.addEventListener('mouseleave', () => {
      if (this._hover === ref) this._hover = null;
      this._renderInfo();
    });
    return s;
  }

  render() {
    const inv = this._inv;
    const paint = (s, stack) => {
      const def = stack ? this._items[stack.id] : null;
      s.querySelector('.icon').textContent = def ? def.ICON : s.dataset.empty ?? '';
      s.querySelector('.count').textContent = stack && stack.count > 1 ? String(stack.count) : '';
      s.classList.toggle('empty', !stack);
      s.title = def ? def.NAME : '';
    };
    this._mainSlots.forEach((s, k) => paint(s, inv.slots[inv.hotbarSize + k]));
    this._barSlots.forEach((s, i) => paint(s, inv.slots[i]));
    for (const [slot, s] of Object.entries(this._gearSlots)) {
      const id = this._eq.slots[slot];
      paint(s, id ? { id, count: 1 } : null);
    }
    const sel = this._hotbarIndex();
    this._barSlots.forEach((s, i) => s.classList.toggle('selected', i === sel));
    const pct = Math.round(this._eq.coldProtection * 100);
    this._protection.textContent = `🌡️ Protección contra el frío: ${pct} %`;

    const c = inv.cursor;
    this._cursorEl.classList.toggle('hidden', !c);
    if (c) {
      this._cursorEl.querySelector('.icon').textContent = this._items[c.id]?.ICON ?? '?';
      this._cursorEl.querySelector('.count').textContent = c.count > 1 ? String(c.count) : '';
    }
    this._renderInfo();
  }

  _hotbarIndex() {
    return this._hotbarRef?.selectedIndex ?? null;
  }

  /** La barra rápida (para marcar el hueco seleccionado). */
  setHotbar(hotbar) {
    this._hotbarRef = hotbar;
  }

  _renderInfo() {
    const stack = this._hover === null ? null : this._inv.getRef(this._hover);
    const def = stack ? this._items[stack.id] : null;
    if (!def) {
      const slot = typeof this._hover === 'string' ? this._eq.slotDefs[this._hover.slice(3)] : null;
      this._info.textContent = slot ? `Ranura: ${slot.NAME.toLowerCase()}` : this._inv.cursor ? 'Haz clic en un hueco para dejarlo.' : ' ';
      return;
    }
    const parts = [`${def.ICON} ${def.NAME}`];
    if (stack.count > 1) parts.push(`×${stack.count}`);
    if (def.SLOT) parts.push(`se pone en: ${this._eq.slotDefs[def.SLOT]?.NAME.toLowerCase()}`, `abriga ${Math.round((def.COLD_PROTECTION ?? 0) * 100)} %`);
    if (def.DESC) parts.push(def.DESC);
    this._info.textContent = parts.join(' · ');
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
