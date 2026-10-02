import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';
import { durabilityBar } from './UIManager.js';

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
 * Tirar: dejar lo que se lleva con el ratón en la zona «Tirar al suelo» o hacer
 * clic fuera del menú (clic derecho: solo una unidad). Cae al suelo en una bolsa.
 * Solo vista: inventario, ropa y fabricación viven en sus sistemas. Todo el
 * texto se pinta con textContent.
 */
export const MenuTab = Object.freeze({ INVENTORY: 'INVENTORY', CRAFTING: 'CRAFTING', STATION: 'STATION', CHEST: 'CHEST' });
const KEY_TAB = { Tab: MenuTab.CRAFTING, KeyI: MenuTab.INVENTORY };

export class PlayerMenu extends ModalPanel {
  constructor({ container, input, events, inventory, equipment, crafting, items, categories, stats, time, hotbar, onDrop, stations = {}, progression = null, statDefs = {}, hasWatch = () => true }) {
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
    this._onDrop = onDrop ?? (() => {});
    this._stations = stations;   // { REFINERY: { NAME, ICON } }
    this.station = null;         // estación desde la que se ha abierto (o null)
    this._prog = progression;    // niveles y puntos (ProgressionSystem)
    this._statDefs = statDefs;   // PROGRESSION.STATS
    this._hasWatch = hasWatch;   // sin el reloj de pulsera solo se abre la mochila (no se fabrica)
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
    events.on(GameEvents.CRAFT_QUEUE_CHANGED, () => this.isOpen && this._renderQueue());
    events.on(GameEvents.PROGRESSION_CHANGED, () => this.isOpen && this._renderStats());
  }

  update(dt) {
    super.update(dt); // Esc
    if (this._keyRequest) {
      const want = this._keyRequest;
      this._keyRequest = null;
      if (want === this.tab || (want === MenuTab.CRAFTING && this.tab === MenuTab.STATION)) this.setOpen(false);
      else this.setTab(want);
      return;
    }
    if (this.isOpen) return;
    if (this._input.wasPressed('CRAFTING')) this.open(MenuTab.CRAFTING);
    else if (this._input.wasPressed('INVENTORY')) this.open(MenuTab.INVENTORY);
  }

  /** Sin reloj no se fabrica: aviso de dónde está. */
  _noWatch() {
    this._events.emit(GameEvents.UI_MESSAGE, { text: '⌚ Para fabricar necesitas tu reloj de pulsera: está en la cápsula estrellada (brilla). Cógelo con E.', type: 'warning' });
  }

  /** Actualiza pestañas y título según se lleve el reloj o no. */
  refreshWatch() {
    const has = this._hasWatch();
    this._tabButtons.CRAFTING.classList.toggle('hidden', !has);
    this.setTitle(has ? 'Reloj de pulsera' : 'Mochila');
    if (!has && this.tab !== MenuTab.INVENTORY) this.setTab(MenuTab.INVENTORY);
  }

  tick(dt) {
    this._statTimer -= dt;
    if (this._statTimer > 0) return;
    this._statTimer = 0.25;
    this._renderStats();
    this._renderQueue();
  }

  /** @param {string} tab @param {{ station?: string }} [opts] estación (mesa de refinería) */
  open(tab, { station = null } = {}) {
    if (tab !== MenuTab.INVENTORY && !this._hasWatch()) {
      this._noWatch();
      return;
    }
    this.station = station;
    const def = station ? this._stations[station] : null;
    this._tabButtons.STATION.classList.toggle('hidden', !def);
    if (def) this._tabButtons.STATION.textContent = def.NAME.replace(/^Mesa de /i, '');
    this.setTab(tab);
    this.setOpen(true);
  }

  setOpen(open) {
    if (!open) {
      this._closePlaceMenu();
      this._closeChest();
      if (this.tab === MenuTab.CHEST) this.tab = MenuTab.INVENTORY;
      this._inv.returnCursor();
      this.station = null;
      this._tabButtons.STATION.classList.add('hidden');
      if (this.tab === MenuTab.STATION) this.tab = MenuTab.CRAFTING;
    }
    if (this.isOpen === open) return;
    super.setOpen(open);
    this._cursorEl.classList.add('hidden');
    this._events.emit(GameEvents.CRAFTING_PANEL_TOGGLED, { open: open && this.tab !== MenuTab.INVENTORY });
  }

  setTab(tab) {
    if (!MenuTab[tab] || (tab === MenuTab.STATION && !this.station)) return;
    if (tab !== MenuTab.INVENTORY && !this._hasWatch()) {
      if (this.isOpen) this._noWatch();
      return;
    }
    if (tab === MenuTab.CHEST && !this._inv.container) return;
    if (tab !== this.tab) this._inv.returnCursor();
    if (tab !== MenuTab.CHEST && this.tab === MenuTab.CHEST) this._closeChest();
    this.tab = tab;
    const crafting = tab !== MenuTab.INVENTORY && tab !== MenuTab.CHEST;
    this._chestSection.classList.toggle('hidden', tab !== MenuTab.CHEST);
    for (const [t, b] of Object.entries(this._tabButtons)) b.classList.toggle('active', t === tab);
    this._invSection.classList.toggle('hidden', crafting);
    this._craftSection.classList.toggle('hidden', !crafting);
    this._toolbar.classList.toggle('hidden', !crafting);
    if (this.isOpen) this.render();
  }

  // ---- Construcción ---------------------------------------------------------------

  _build() {
    const main = el('div', 'pm-main');

    // Pestañas.
    const tabs = el('nav', 'pm-tabs');
    this._tabButtons = {};
    for (const [tab, label] of [[MenuTab.INVENTORY, 'Inventario'], [MenuTab.CRAFTING, 'Fabricación'], [MenuTab.STATION, 'Estación'], [MenuTab.CHEST, 'Cofre']]) {
      const b = button(label, 'pm-tab');
      b.addEventListener('click', () => this.setTab(tab));
      this._tabButtons[tab] = b;
      tabs.append(b);
    }
    this._tabButtons.STATION.classList.add('hidden');
    this._tabButtons.CHEST.classList.add('hidden');
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
    // Tirar al suelo.
    const drop = el('div', 'pm-drop', '🗑 Tirar al suelo · deja aquí lo que llevas (clic: todo · clic dcho: uno) · o pulsa Q en el juego');
    drop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._dropCursor(e.button === 2 ? 1 : Infinity);
    });
    drop.addEventListener('contextmenu', (e) => e.preventDefault());
    this._invSection.append(el('h3', 'pm-sub', 'Mochila'), grid, el('h3', 'pm-sub', 'Barra rápida · 1–9'), bar, drop);

    // Cofre abierto: sus huecos ('c:N') encima de la mochila.
    this._chestSection = el('section', 'pm-chest hidden');
    const cgrid = el('div', 'pm-grid pm-bag');
    this._chestSlots = [];
    for (let i = 0; i < 27; i++) {
      const s = this._slotEl(`c:${i}`);
      this._chestSlots.push(s);
      cgrid.append(s);
    }
    this._chestSection.append(el('h3', 'pm-sub', 'Cofre · Shift+clic mueve entre el cofre y tu inventario'), cgrid);

    // Fabricación: rejilla de recetas.
    this._craftSection = el('section', 'pm-crafting');
    this._recipeGrid = el('div', 'pm-grid pm-recipes');
    // Cola de fabricación: lo que se está haciendo (con tiempo); clic para cancelar.
    this._queueEl = el('div', 'pm-queue');
    this._craftSection.append(this._recipeGrid, this._queueEl);

    // Detalle (objeto señalado o receta seleccionada).
    this._detail = el('div', 'pm-detail');

    main.append(tabs, this._toolbar, this._chestSection, this._invSection, this._craftSection, this._detail);

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
    // Guardar la partida (también se guarda sola cada pocos minutos).
    const save = el('button', 'pm-save', '💾 Guardar partida');
    save.type = 'button';
    save.addEventListener('click', () => this._events.emit(GameEvents.GAME_SAVE_REQUEST, { reason: 'manual' }));
    this._saveInfo = el('div', 'pm-save-info', '');
    you.append(gear, this._clock, this._statList, save, this._saveInfo);
    this._events.on(GameEvents.GAME_SAVED, ({ at }) => {
      const d = new Date(at);
      this._saveInfo.textContent = `Guardada a las ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });

    const wrap = el('div', 'pm-layout');
    wrap.append(main, you);
    this.body.append(wrap);

    // Lo que se lleva con el ratón.
    this._cursorEl = el('div', 'pm-slot pm-cursor hidden');
    this._cursorEl.append(el('span', 'icon'), el('span', 'count'));
    document.body.appendChild(this._cursorEl);
    // Clic fuera del menú con algo en la mano: se tira.
    window.addEventListener('mousedown', (e) => {
      if (!this.isOpen || !this._inv.cursor || this.el.contains(e.target)) return;
      e.preventDefault();
      this._dropCursor(e.button === 2 ? 1 : Infinity);
    }, true);
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
      // Una pieza de construcción en la mochila: ¿colocarla o moverla?
      const st = typeof ref === 'number' && ref >= this._inv.hotbarSize ? this._inv.slots[ref] : null;
      if (st && e.button === 0 && !e.shiftKey && !this._inv.cursor && this._items[st.id]?.USE === 'BUILD') {
        this._placeMenu(e, ref, st);
        return;
      }
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

  /** Menú pequeño junto al ratón: colocar la pieza o moverla. */
  _placeMenu(e, ref, st) {
    this._closePlaceMenu();
    const m = el('div', 'pm-popup');
    const def = this._items[st.id];
    const place = button(`🔨 Colocar ${def.NAME.toLowerCase()}`, 'pm-popup-btn');
    place.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._closePlaceMenu();
      this.setOpen(false);
      this._events.emit(GameEvents.BUILD_PIECE_REQUEST, { pieceId: def.BUILD_PIECE });
    });
    const move = button('✋ Moverla', 'pm-popup-btn');
    move.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._closePlaceMenu();
      this._inv.click(ref, { button: 0 });
    });
    m.append(place, move);
    m.style.left = `${e.clientX + 6}px`;
    m.style.top = `${e.clientY + 6}px`;
    document.body.appendChild(m);
    this._popup = m;
    this._popupClose = (ev) => {
      if (!m.contains(ev.target)) this._closePlaceMenu();
    };
    setTimeout(() => window.addEventListener('mousedown', this._popupClose, true), 0);
  }

  _closePlaceMenu() {
    if (!this._popup) return;
    this._popup.remove();
    this._popup = null;
    window.removeEventListener('mousedown', this._popupClose, true);
  }

  /** Abre el menú con un cofre: sus huecos y tu inventario. */
  openChest(container) {
    this._inv.attachContainer(container);
    this._tabButtons.CHEST.classList.remove('hidden');
    this.setTab(MenuTab.CHEST);
    this.setOpen(true);
  }

  _closeChest() {
    if (!this._inv.container) return;
    this._inv.returnCursor();
    this._inv.attachContainer(null);
    this._tabButtons.CHEST.classList.add('hidden');
  }

  // ---- Pintado ---------------------------------------------------------------------

  render() {
    const inv = this._inv;
    const paint = (s, stack) => {
      const def = stack ? this._items[stack.id] : null;
      s.querySelector('.icon').textContent = def ? def.ICON : s.dataset.empty ?? '';
      s.querySelector('.count').textContent = stack && stack.count > 1 ? String(stack.count) : '';
      s.classList.toggle('empty', !stack);
      s.querySelector('.dur')?.remove();
      if (stack?.dur != null && def?.DURABILITY) s.append(durabilityBar(stack.dur / def.DURABILITY));
    };
    if (this.tab === MenuTab.CHEST && inv.container) this._chestSlots.forEach((s, k) => paint(s, inv.container.slots[k]));
    if (this.tab === MenuTab.INVENTORY || this.tab === MenuTab.CHEST) {
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
      paint(s, id ? { id, count: 1, dur: this._eq.dur?.[slot] } : null);
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
    // En la pestaña de la estación, sus recetas; en Fabricación, todas (las de estación, bloqueadas).
    const atStation = this.tab === MenuTab.STATION;
    return this._crafting.getRecipes().filter((r) => {
      if (atStation && r.station !== this.station) return false;
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
      const locked = this._locked(r);
      const tile = el('div', `pm-slot pm-recipe${r.canCraft && !locked ? ' ready' : ''}${locked ? ' locked' : ''}${r.id === this._recipe ? ' selected' : ''}`);
      tile.append(el('span', 'icon', r.icon), el('span', 'pm-recipe-name', r.name));
      if (locked) tile.append(el('span', 'pm-badge pm-lock', this._stations[r.station]?.ICON ?? '🔒'));
      else if (r.canCraft) tile.append(el('span', 'pm-badge', `×${r.max}`));
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

  _dropCursor(amount) {
    const got = this._inv.takeCursor(amount);
    if (got) this._onDrop(got.id, got.count, got.dur);
  }

  /** Receta de una estación vista fuera de ella. */
  _locked(r) {
    return !!r.station && r.station !== this.station;
  }

  _craft(id, times) {
    for (let i = 0; i < times; i++) if (!this._crafting.craft(id, { station: this.station })) break;
    this._renderQueue();
  }

  /** Cola de fabricación: el primero con barra de progreso y el tiempo que le queda. */
  _renderQueue() {
    const box = this._queueEl;
    if (!box) return;
    const q = this._crafting.queue;
    box.replaceChildren();
    box.classList.toggle('hidden', !q.length);
    if (!q.length) return;
    box.append(el('span', 'pm-sub', 'Fabricando'));
    q.forEach((entry, i) => {
      const r = this._crafting.getRecipes().find((x) => x.id === entry.recipeId);
      const item = el('button', `pm-queue-item${i === 0 ? ' active' : ''}`);
      item.type = 'button';
      item.title = 'Clic: cancelar (se devuelven los materiales)';
      item.append(el('span', 'icon', r?.icon ?? '?'));
      if (i === 0) {
        const bar = el('span', 'pm-queue-bar');
        const fill = el('span');
        fill.style.width = `${Math.round(this._crafting.progress * 100)}%`;
        bar.append(fill);
        item.append(bar, el('span', 'pm-queue-time', `${Math.ceil(Math.max(0, entry.left))} s`));
      }
      item.addEventListener('click', () => this._crafting.cancel(entry.uid));
      box.append(item);
    });
  }

  /** Abajo: el objeto bajo el ratón o, en fabricación, la receta seleccionada. */
  _renderDetail() {
    const d = this._detail;
    d.replaceChildren();
    const stack = this._hover === null ? null : this._inv.getRef(this._hover);
    if (stack) return this._itemDetail(d, stack.id, stack.count, stack.dur);
    if (typeof this._hover === 'string' && this._hover.startsWith('eq:')) {
      const slot = this._eq.slotDefs[this._hover.slice(3)];
      d.append(el('p', 'pm-hint', `Ranura de ropa: ${slot?.NAME.toLowerCase() ?? ''}. Coge una prenda con clic y déjala aquí (o Shift+clic sobre ella).`));
      return;
    }
    if (this.tab !== MenuTab.INVENTORY && this._recipe) return this._recipeDetail(d);
    d.append(el('p', 'pm-hint', this._inv.cursor ? 'Haz clic en un hueco para dejarlo.' : 'Pasa el ratón sobre un objeto para ver qué es.'));
  }

  _itemDetail(d, id, count, dur) {
    const def = this._items[id];
    d.append(el('span', 'pm-detail-icon', def.ICON));
    const info = el('div', 'pm-detail-info');
    info.append(el('b', null, `${def.NAME}${count > 1 ? ` ×${count}` : ''}`));
    const parts = [];
    if (dur != null && def.DURABILITY) parts.push(`Aguante: ${dur}/${def.DURABILITY} golpes`);
    if (def.SLOT) parts.push(`Se pone en: ${this._eq.slotDefs[def.SLOT]?.NAME.toLowerCase()}${def.DEFENSE ? ` · defensa ${def.DEFENSE}` : ''}${def.COLD_PROTECTION ? ` · abriga ${Math.round(def.COLD_PROTECTION * 100)} %` : ''}`);
    if (def.WEAPON) parts.push(`Daño ${def.WEAPON.DAMAGE}`);
    if (def.AMMO) parts.push(`Munición · daño ${def.AMMO.DAMAGE}`);
    if (def.USE === 'BUILD' && !def.HOLD) parts.push('Selecciónala en la barra para colocarla · en la mochila, clic → Colocar');
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
    const locked = this._locked(r);
    info.append(el('span', 'pm-time', `⏱ ${r.time} s${locked ? ` · se fabrica en: ${this._stations[r.station]?.ICON ?? ''} ${this._stations[r.station]?.NAME ?? r.station}` : ''}`));
    const actions = el('div', 'pm-actions');
    const one = button('Fabricar', 'pm-craft');
    one.disabled = !r.canCraft || locked;
    one.addEventListener('click', () => this._craft(r.id, 1));
    const five = button(`×${Math.min(5, Math.max(1, r.max))}`, 'pm-craft');
    five.disabled = !r.canCraft || locked;
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
    const P = this._prog;
    const D = this._statDefs;
    this._statList.replaceChildren();

    // Nivel y experiencia.
    if (P) {
      const lv = el('li', 'pm-level');
      lv.append(el('span', 'pm-stat-name', `⭐ Nivel ${P.level}`), el('span', 'pm-stat-value', P.maxed ? 'máx.' : `${Math.floor(P.xp)} / ${P.xpToNext()} XP`));
      lv.append(meter(P.maxed ? 1 : P.xp / P.xpToNext(), 'xp'));
      if (P.points > 0) lv.append(el('span', 'pm-points', `${P.points} ${P.points === 1 ? 'punto' : 'puntos'} para repartir: pulsa + en una estadística`));
      this._statList.append(lv);
    }
    const plus = (stat) => {
      if (!P || P.points <= 0) return null;
      const b = button('+', 'pm-plus');
      b.title = `Subir ${D[stat]?.NAME.toLowerCase()} (${this._bonusText(stat, 1)})`;
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        P.spend(stat);
      });
      return b;
    };
    const row = (icon, name, valueText, ratio, stat = null) => {
      const li = el('li');
      const head = el('span', 'pm-stat-name', `${icon} ${name}`);
      const value = el('span', 'pm-stat-value', valueText);
      const p = stat ? plus(stat) : null;
      if (p) value.append(p);
      li.append(head, value);
      if (ratio !== null) li.append(meter(ratio));
      this._statList.append(li);
    };
    if (S.health) row(D.HEALTH?.ICON ?? '❤️', 'Vida', `${Math.round(S.health.value)} / ${S.health.max}`, S.health.ratio, 'HEALTH');
    if (S.energy) row(D.STAMINA?.ICON ?? '⚡', 'Estamina', `${Math.round(S.energy.value)} / ${S.energy.max}`, S.energy.ratio, 'STAMINA');
    if (S.hunger) row('🍗', 'Hambre', String(Math.round(S.hunger.value)), S.hunger.ratio);
    if (S.thirst) row('💧', 'Sed', String(Math.round(S.thirst.value)), S.thirst.ratio);
    if (P) {
      row(D.DAMAGE?.ICON ?? '👊', 'Daño', `${Math.round(P.damageMultiplier * 100)} %`, null, 'DAMAGE');
      row(D.SPEED?.ICON ?? '👟', 'Velocidad', `${Math.round(P.speedMultiplier * 100)} %`, null, 'SPEED');
    }
    const def = el('li', 'pm-cold');
    def.append(el('span', 'pm-stat-name', '🛡️ Defensa'), el('span', 'pm-stat-value', `${this._eq.defense ?? 0} (−${Math.round((this._eq.damageReduction ?? 0) * 100)} % daño)`));
    const cold = el('li', 'pm-cold');
    cold.append(el('span', 'pm-stat-name', '🌡️ Protección frío'), el('span', 'pm-stat-value', `${Math.round(this._eq.coldProtection * 100)} %`));
    this._statList.append(def, cold);
  }

  /** "+10" o "+8 %" de un punto en esa estadística. */
  _bonusText(stat, points) {
    const d = this._statDefs[stat];
    if (!d) return '';
    return d.UNIT === '%' ? `+${Math.round(d.PER_POINT * points * 100)} %` : `+${d.PER_POINT * points}`;
  }
}

function meter(ratio, cls = '') {
  const bar = el('span', `pm-meter${cls ? ` ${cls}` : ''}`);
  const fill = el('span', 'pm-fill');
  fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  bar.append(fill);
  return bar;
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
