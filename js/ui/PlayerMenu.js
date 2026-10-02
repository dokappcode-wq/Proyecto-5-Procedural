import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * PlayerMenu — el menú del reloj de pulsera (estilo panel tecnológico):
 *
 *   ┌ INVENTARIO · FABRICACIÓN ─────────────────────┬ TÚ ─────────────┐
 *   │ buscar · categoría                             │ ropa (5 ranuras) │
 *   │ mochila 9×3 + barra 9×1   |  recetas en rejilla│ día, hora        │
 *   │ detalle del objeto / receta                    │ vida, hambre…    │
 *   └────────────────────────────────────────────────┴──────────────────┘
 *
 * Tab abre FABRICACIÓN e I abre INVENTARIO (la misma tecla lo cierra; la otra
 * cambia de pestaña; Esc cierra). Al abrirse, la cámara se acerca al reloj de la
 * muñeca (main.js escucha UI_PANEL_TOGGLED de 'player-menu').
 *
 * Ratón en los huecos: clic coger/dejar · clic derecho la mitad/una · Shift+clic
 * mover rápido o ponerse la ropa. Recetas: clic selecciona, doble clic fabrica.
 * Solo vista: inventario, ropa y fabricación viven en sus sistemas. Todo el
 * texto se pinta con textContent.
 */
export const MenuTab = Object.freeze({ INVENTORY: 'INVENTORY', CRAFTING: 'CRAFTING' });
const KEY_TAB = { Tab: MenuTab.CRAFTING, KeyI: MenuTab.INVENTORY };

export class PlayerMenu extends ModalPanel {
  constructor({ container, input, events, inventory, equipment, crafting, items, categories, stats, time, hotbar }) {
    super({
      id: 'player-menu', title: 'Reloj de pulsera', container, input, events,
      footer: '<kbd>Clic</kbd> coger / dejar · <kbd>Clic dcho</kbd> la mitad / una · <kbd>Shift</kbd>+<kbd>Clic</kbd> mover rápido · <kbd>Doble clic</kbd> fabricar · <kbd>Esc</kbd> cerrar',
    });
    this.el.classList.add('pm');
    this._inv = inventory;
    this._eq = equipment;
    this._crafting = crafting;
    this._items = items;
    this._categories = categories;
    this._stats = stats;     // { health, hunger, thirst, energy, lifeSupport? }
    this._time = time;
    this._hotbar = hotbar;
    this.tab = MenuTab.CRAFTING;
    this._hover = null;
    this._recipe = null;      // receta seleccionada
    this._query = '';
    this._category = 'ALL';
    this._keyRequest = null;
    this._statTimer = 0;
    this._build();

    // Con el menú abierto la entrada de juego está bloqueada: Tab / I llegan aquí.
    input.onRawKey((e) => {
      if (!this.isOpen) return;
      if (KEY_TAB[e.code]) this._keyRequest = KEY_TAB[e.code];
    });
    const redraw = () => this.isOpen && this.render();
    events.on(GameEvents.INVENTORY_CHANGED, redraw);
    events.on(GameEvents.EQUIPMENT_CHANGED, redraw);
    events.on(GameEvents.HOTBAR_CHANGED, redraw);
  }

  update(dt) {
    super.update(dt); // Esc
    if (this._keyRequest) {
      const want = this._keyRequest;
      this._keyRequest = null;
      if (want === this.tab) this.setOpen(false);
      else this.setTab(want);
      return;
    }
    if (this.isOpen) return;
    if (this._input.wasPressed('CRAFTING')) this.open(MenuTab.CRAFTING);
    else if (this._input.wasPressed('INVENTORY')) this.open(MenuTab.INVENTORY);
  }

  tick(dt) {
    this._statTimer -= dt;
    if (this._statTimer > 0) return;
    this._statTimer = 0.25;
    this._renderStats();
  }

  open(tab) {
    this.setTab(tab);
    this.setOpen(true);
  }

  setOpen(open) {
    if (!open) this._inv.returnCursor();
    if (this.isOpen === open) return;
    super.setOpen(open);
    this._cursorEl.classList.add('hidden');
    this._events.emit(GameEvents.CRAFTING_PANEL_TOGGLED, { open: open && this.tab === MenuTab.CRAFTING });
  }

  setTab(tab) {
    if (!MenuTab[tab]) return;
    if (tab !== this.tab) this._inv.returnCursor();
    this.tab = tab;
    for (const [t, b] of Object.entries(this._tabButtons)) b.classList.toggle('active', t === tab);
    this._invSection.classList.toggle('hidden', tab !== MenuTab.INVENTORY);
    this._craftSection.classList.toggle('hidden', tab !== MenuTab.CRAFTING);
    this._toolbar.classList.toggle('hidden', tab !== MenuTab.CRAFTING);
    if (this.isOpen) this.render();
  }

  // ---- Construcción ---------------------------------------------------------------

  _build() {
    const main = el('div', 'pm-main');

    // Pestañas.
    const tabs = el('nav', 'pm-tabs');
    this._tabButtons = {};
    for (const [tab, label] of [[MenuTab.INVENTORY, 'Inventario'], [MenuTab.CRAFTING, 'Fabricación']]) {
      const b = button(label, 'pm-tab');
      b.addEventListener('click', () => this.setTab(tab));
      this._tabButtons[tab] = b;
      tabs.append(b);
    }
    const close = button('✕', 'pm-close');
    close.setAttribute('aria-label', 'Cerrar');
    close.addEventListener('click', () => this.setOpen(false));
    tabs.append(close);

    // Barra de búsqueda y categoría (fabricación).
    this._toolbar = el('div', 'pm-toolbar');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = '🔍 Buscar…';
    search.maxLength = 40;
    search.className = 'pm-search';
    search.addEventListener('input', () => {
      this._query = search.value.trim().toLowerCase();
      this._renderRecipes();
    });
    // En el buscador las teclas son texto: Esc / Tab cierran desde aquí.
    search.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Tab') {
        e.preventDefault();
        search.blur();
        this.setOpen(false);
      }
    });
    const cat = document.createElement('select');
    cat.className = 'pm-category';
    for (const [k, label] of [['ALL', 'Todos los objetos'], ...Object.entries(this._categories), ['READY', 'Se pueden fabricar ya']]) {
      const o = document.createElement('option');
      o.value = k;
      o.textContent = label;
      cat.append(o);
    }
    cat.addEventListener('change', () => {
      this._category = cat.value;
      this._renderRecipes();
    });
    this._toolbar.append(search, cat);

    // Inventario: mochila + barra.
    this._invSection = el('section', 'pm-inventory');
    const grid = el('div', 'pm-grid pm-bag');
    this._mainSlots = [];
    for (let i = this._inv.hotbarSize; i < this._inv.slots.length; i++) {
      const s = this._slotEl(i);
      this._mainSlots.push(s);
      grid.append(s);
    }
    const bar = el('div', 'pm-grid pm-bar');
    this._barSlots = [];
    for (let i = 0; i < this._inv.hotbarSize; i++) {
      const s = this._slotEl(i);
      s.append(el('span', 'key', String(i + 1)));
      this._barSlots.push(s);
      bar.append(s);
    }
    this._invSection.append(el('h3', 'pm-sub', 'Mochila'), grid, el('h3', 'pm-sub', 'Barra rápida · 1–9'), bar);

    // Fabricación: rejilla de recetas.
    this._craftSection = el('section', 'pm-crafting');
    this._recipeGrid = el('div', 'pm-grid pm-recipes');
    this._craftSection.append(this._recipeGrid);

    // Detalle (objeto señalado o receta seleccionada).
    this._detail = el('div', 'pm-detail');

    main.append(tabs, this._toolbar, this._invSection, this._craftSection, this._detail);

    // Columna "TÚ".
    const you = el('aside', 'pm-you');
    you.append(el('h2', 'pm-you-title', 'Tú'));
    const gear = el('div', 'pm-gear');
    this._gearSlots = {};
    for (const [slot, def] of Object.entries(this._eq.slotDefs)) {
      const s = this._slotEl(`eq:${slot}`);
      s.classList.add('gear');
      s.dataset.empty = def.ICON;
      s.append(el('span', 'pm-gear-label', def.NAME));
      this._gearSlots[slot] = s;
      gear.append(s);
    }
    this._clock = el('div', 'pm-clock');
    this._statList = el('ul', 'pm-stats');
    you.append(gear, this._clock, this._statList);

    const wrap = el('div', 'pm-layout');
    wrap.append(main, you);
    this.body.append(wrap);

    // Lo que se lleva con el ratón.
    this._cursorEl = el('div', 'pm-slot pm-cursor hidden');
    this._cursorEl.append(el('span', 'icon'), el('span', 'count'));
    document.body.appendChild(this._cursorEl);
    window.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      this._cursorEl.style.left = `${e.clientX}px`;
      this._cursorEl.style.top = `${e.clientY}px`;
    });
  }

  _slotEl(ref) {
    const s = el('div', 'pm-slot');
    s.dataset.ref = String(ref);
    s.append(el('span', 'icon'), el('span', 'count'));
    s.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._inv.click(ref, { button: e.button, shift: e.shiftKey });
    });
    s.addEventListener('contextmenu', (e) => e.preventDefault());
    s.addEventListener('mouseenter', () => {
      this._hover = ref;
      this._renderDetail();
    });
    s.addEventListener('mouseleave', () => {
      if (this._hover === ref) this._hover = null;
      this._renderDetail();
    });
    return s;
  }

  // ---- Pintado ---------------------------------------------------------------------

  render() {
    const inv = this._inv;
    const paint = (s, stack) => {
      const def = stack ? this._items[stack.id] : null;
      s.querySelector('.icon').textContent = def ? def.ICON : s.dataset.empty ?? '';
      s.querySelector('.count').textContent = stack && stack.count > 1 ? String(stack.count) : '';
      s.classList.toggle('empty', !stack);
    };
    if (this.tab === MenuTab.INVENTORY) {
      this._mainSlots.forEach((s, k) => paint(s, inv.slots[inv.hotbarSize + k]));
      this._barSlots.forEach((s, i) => {
        paint(s, inv.slots[i]);
        s.classList.toggle('selected', i === this._hotbar?.selectedIndex);
      });
    } else {
      this._renderRecipes();
    }
    for (const [slot, s] of Object.entries(this._gearSlots)) {
      const id = this._eq.slots[slot];
      paint(s, id ? { id, count: 1 } : null);
    }
    const c = inv.cursor;
    this._cursorEl.classList.toggle('hidden', !c);
    if (c) {
      this._cursorEl.querySelector('.icon').textContent = this._items[c.id]?.ICON ?? '?';
      this._cursorEl.querySelector('.count').textContent = c.count > 1 ? String(c.count) : '';
    }
    this._renderStats();
    this._renderDetail();
  }

  _recipeList() {
    return this._crafting.getRecipes().filter((r) => {
      if (this._category === 'READY' && !r.canCraft) return false;
      if (this._category !== 'ALL' && this._category !== 'READY' && r.category !== this._category) return false;
      return !this._query || r.name.toLowerCase().includes(this._query);
    });
  }

  _renderRecipes() {
    const list = this._recipeList();
    if (!list.some((r) => r.id === this._recipe)) this._recipe = list.find((r) => r.canCraft)?.id ?? list[0]?.id ?? null;
    this._recipeGrid.replaceChildren();
    if (!list.length) this._recipeGrid.append(el('p', 'pm-empty', 'No hay recetas con ese filtro.'));
    for (const r of list) {
      const tile = el('div', `pm-slot pm-recipe${r.canCraft ? ' ready' : ''}${r.id === this._recipe ? ' selected' : ''}`);
      tile.append(el('span', 'icon', r.icon), el('span', 'pm-recipe-name', r.name));
      if (r.canCraft) tile.append(el('span', 'pm-badge', `×${r.max}`));
      tile.addEventListener('click', () => {
        this._recipe = r.id;
        this._renderRecipes();
        this._renderDetail();
      });
      tile.addEventListener('dblclick', () => this._craft(r.id, 1));
      this._recipeGrid.append(tile);
    }
    this._renderDetail();
  }

  _craft(id, times) {
    for (let i = 0; i < times; i++) if (!this._crafting.craft(id)) break;
  }

  /** Abajo: el objeto bajo el ratón o, en fabricación, la receta seleccionada. */
  _renderDetail() {
    const d = this._detail;
    d.replaceChildren();
    const stack = this._hover === null ? null : this._inv.getRef(this._hover);
    if (stack) return this._itemDetail(d, stack.id, stack.count);
    if (typeof this._hover === 'string') {
      const slot = this._eq.slotDefs[this._hover.slice(3)];
      d.append(el('p', 'pm-hint', `Ranura de ropa: ${slot?.NAME.toLowerCase() ?? ''}. Coge una prenda con clic y déjala aquí (o Shift+clic sobre ella).`));
      return;
    }
    if (this.tab === MenuTab.CRAFTING && this._recipe) return this._recipeDetail(d);
    d.append(el('p', 'pm-hint', this._inv.cursor ? 'Haz clic en un hueco para dejarlo.' : 'Pasa el ratón sobre un objeto para ver qué es.'));
  }

  _itemDetail(d, id, count) {
    const def = this._items[id];
    d.append(el('span', 'pm-detail-icon', def.ICON));
    const info = el('div', 'pm-detail-info');
    info.append(el('b', null, `${def.NAME}${count > 1 ? ` ×${count}` : ''}`));
    const parts = [];
    if (def.SLOT) parts.push(`Se pone en: ${this._eq.slotDefs[def.SLOT]?.NAME.toLowerCase()} · abriga ${Math.round((def.COLD_PROTECTION ?? 0) * 100)} %`);
    if (def.DESC) parts.push(def.DESC);
    if (parts.length) info.append(el('span', null, parts.join(' · ')));
    d.append(info);
  }

  _recipeDetail(d) {
    const r = this._crafting.getRecipes().find((x) => x.id === this._recipe);
    if (!r) return;
    const def = this._items[r.result];
    d.append(el('span', 'pm-detail-icon', r.icon));
    const info = el('div', 'pm-detail-info');
    info.append(el('b', null, `${r.name}${r.amount > 1 ? ` ×${r.amount}` : ''}`));
    if (def?.DESC) info.append(el('span', null, def.DESC));
    const ing = el('ul', 'pm-ingredients');
    for (const i of r.ingredients) {
      ing.append(el('li', i.have >= i.amount ? 'ok' : 'missing', `${i.icon} ${i.name} ${i.have}/${i.amount}`));
    }
    info.append(ing);
    const actions = el('div', 'pm-actions');
    const one = button('Fabricar', 'pm-craft');
    one.disabled = !r.canCraft;
    one.addEventListener('click', () => this._craft(r.id, 1));
    const five = button(`×${Math.min(5, Math.max(1, r.max))}`, 'pm-craft');
    five.disabled = !r.canCraft;
    five.title = 'Fabricar varios';
    five.addEventListener('click', () => this._craft(r.id, Math.min(5, r.max)));
    actions.append(one, five);
    d.append(info, actions);
  }

  _renderStats() {
    if (!this.isOpen) return;
    const t = this._time;
    this._clock.textContent = t ? `Día ${t.day} · ${t.clockText}` : '';
    const S = this._stats;
    const rows = [
      ['❤️', 'Vida', S.health],
      ['🍗', 'Hambre', S.hunger],
      ['💧', 'Sed', S.thirst],
      ['⚡', 'Energía', S.energy],
    ];
    this._statList.replaceChildren();
    for (const [icon, name, stat] of rows) {
      if (!stat) continue;
      const li = el('li');
      const bar = el('span', 'pm-meter');
      const fill = el('span', 'pm-fill');
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, stat.ratio)) * 100)}%`;
      bar.append(fill);
      li.append(el('span', 'pm-stat-name', `${icon} ${name}`), el('span', 'pm-stat-value', String(Math.round(stat.value))), bar);
      this._statList.append(li);
    }
    const cold = el('li', 'pm-cold');
    cold.append(el('span', 'pm-stat-name', '🌡️ Protección frío'), el('span', 'pm-stat-value', `${Math.round(this._eq.coldProtection * 100)} %`));
    this._statList.append(cold);
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, cls) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
