import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * HomeSystem — útiles de casa (P6). Su estado va en piece.data (se guarda con lo construido).
 *
 *   Pozo (WELL): agua sin fin. E con el cubo vacío en la mano: llenarlo; si llevas odres
 *     sin llenar: llenarlos; si no: beber.
 *   Recolector de lluvia (RAIN_COLLECTOR): junta agua poco a poco (más si llueve), hasta
 *     CAPACITY. E igual que el pozo, pero gasta 1 unidad del barril.
 *   Maniquí (MANNEQUIN): E cambia tu armadura (cabeza, pecho, piernas, pies y manos) por la
 *     que tiene él; la que lleva puesta se dibuja encima con su color.
 */
const ARMOR_SLOTS = ['HEAD', 'CHEST', 'LEGS', 'FEET', 'HANDS'];

export class HomeSystem {
  constructor({ config, items, construction, inventory, hotbar, equipment, thirst, events, waterPerSkin = 3, isRaining = () => false }) {
    this.name = 'home';
    this._cfg = config;       // BUILD.RAIN_COLLECTOR
    this._items = items;
    this._construction = construction;
    this._inv = inventory;
    this._hotbar = hotbar;
    this._eq = equipment;
    this._thirst = thirst;
    this._events = events;
    this._waterPerSkin = waterPerSkin;
    this._isRaining = isRaining;
    this._views = new Map(); // maniquí → { group, key }
    events.on(GameEvents.STRUCTURE_INTERACT, ({ structure }) => this.interact(structure));
    events.on(GameEvents.STRUCTURE_REMOVED, ({ structure }) => this._removed(structure));
    events.on(GameEvents.STRUCTURE_RESTORED, ({ structure }) => this._restored(structure));
  }

  // ---- Letrero y E ---------------------------------------------------------------------

  actionText(piece) {
    const held = this._hotbar.selectedId;
    if (piece.type === 'WELL') return held === 'BUCKET' ? 'Llenar el cubo' : this._skinRoom() > 0 ? 'Llenar el odre' : 'Beber';
    if (piece.type === 'RAIN_COLLECTOR') {
      const n = Math.floor(this._data(piece).water);
      return `${held === 'BUCKET' ? 'Llenar el cubo' : this._skinRoom() > 0 ? 'Llenar el odre' : 'Beber'} · 💧 ${n}/${this._cfg.CAPACITY}`;
    }
    if (piece.type === 'MANNEQUIN') {
      const has = ARMOR_SLOTS.some((s) => this._data(piece).armor[s]);
      return has ? 'Cambiarte la armadura' : 'Dejarle tu armadura';
    }
    return null;
  }

  interact(piece) {
    if (!piece) return false;
    if (piece.type === 'WELL') return this._water(piece, Infinity);
    if (piece.type === 'RAIN_COLLECTOR') return this._water(piece, Math.floor(this._data(piece).water));
    if (piece.type === 'MANNEQUIN') return this._swapArmor(piece);
    return false;
  }

  /** Pozo o recolector: llenar el cubo, el odre o beber. `stock`: agua disponible. */
  _water(piece, stock) {
    if (stock < 1) return this._say('🌧️ El barril está vacío: espera a que se llene (con lluvia, antes).');
    const held = this._hotbar.selectedId;
    const take = () => {
      if (Number.isFinite(stock)) this._data(piece).water -= 1;
      this._events.emit(GameEvents.WELL_USE, { piece, source: piece.type === 'WELL' ? 'WELL' : 'COLLECTOR' });
    };
    if (held === 'BUCKET') {
      const st = this._inv.slots[this._hotbar.selectedIndex];
      st.id = 'BUCKET_WATER';
      this._inv._emit?.('BUCKET_WATER', 0);
      take();
      return this._say('🪣 Cubo lleno de agua.', 'pickup', true);
    }
    const room = this._skinRoom();
    if (room > 0) {
      const n = Math.min(room, Number.isFinite(stock) ? stock : room);
      this._inv.addItem('WATER', n);
      if (Number.isFinite(stock)) this._data(piece).water -= n - 1;
      take();
      return this._say(`🧴 Odre lleno (+${n} de agua).`, 'pickup', true);
    }
    if (this._thirst && this._thirst.ratio >= 1) return this._say('No tienes sed.');
    take();
    this._events.emit(GameEvents.PLAYER_DRANK, { source: piece.type });
    return true;
  }

  /** Agua que aún cabe en los odres que llevas. */
  _skinRoom() {
    return Math.max(0, this._inv.getItemCount('WATERSKIN') * this._waterPerSkin - this._inv.getItemCount('WATER'));
  }

  /** Maniquí: tu armadura por la suya, ranura a ranura (con su aguante). */
  _swapArmor(piece) {
    const d = this._data(piece);
    let moved = 0;
    for (const slot of ARMOR_SLOTS) {
      const mine = this._eq.slots[slot] ? { id: this._eq.slots[slot], dur: this._eq.dur?.[slot] } : null;
      const his = d.armor[slot];
      if (!mine && !his) continue;
      this._eq.equipDirect(slot, his?.id ?? null, his?.dur);
      d.armor[slot] = mine ? { id: mine.id, ...(mine.dur != null ? { dur: mine.dur } : {}) } : null;
      moved++;
    }
    if (!moved) return this._say('🧍 Ni tú ni el maniquí lleváis armadura.');
    this._events.emit(GameEvents.EQUIPMENT_CHANGED, { slot: null, itemId: null, slots: { ...this._eq.slots } });
    return this._say('🧍 Os habéis cambiado la armadura.', 'pickup', true);
  }

  // ---- Estado ------------------------------------------------------------------------

  _data(piece) {
    const d = piece.data && typeof piece.data === 'object' ? piece.data : (piece.data = {});
    if (piece.type === 'RAIN_COLLECTOR') d.water = Math.max(0, Math.min(this._cfg.CAPACITY, Number(d.water) || 0));
    if (piece.type === 'MANNEQUIN' && (!d.armor || typeof d.armor !== 'object')) d.armor = {};
    return d;
  }

  /** Partida cargada: solo armadura que existe y en su ranura. */
  _restored(piece) {
    if (piece.type !== 'MANNEQUIN') return;
    const d = this._data(piece);
    const clean = {};
    for (const slot of ARMOR_SLOTS) {
      const e = d.armor[slot];
      const def = e && this._items[e.id];
      if (!def || def.SLOT !== slot) continue;
      const max = def.DURABILITY;
      clean[slot] = { id: e.id, ...(max && Number.isFinite(e.dur) ? { dur: Math.min(max, Math.max(1, Math.round(e.dur))) } : {}) };
    }
    d.armor = clean;
  }

  /** Al romper un maniquí, su armadura vuelve al inventario. */
  _removed(piece) {
    if (piece?.type === 'MANNEQUIN') {
      for (const e of Object.values(this._data(piece).armor)) if (e) this._inv.addItem(e.id, 1, { dur: e.dur });
    }
    const v = this._views.get(piece);
    if (v) {
      v.group.removeFromParent();
      this._views.delete(piece);
    }
  }

  update(dt) {
    const rate = this._isRaining() ? this._cfg.RAIN_EVERY : this._cfg.EVERY;
    for (const piece of this._construction.allPieces()) {
      if (piece.type === 'RAIN_COLLECTOR') {
        const d = this._data(piece);
        d.water = Math.min(this._cfg.CAPACITY, d.water + dt / rate);
      }
    }
    for (const piece of this._construction.pieces) if (piece.type === 'MANNEQUIN') this._drawMannequin(piece);
  }

  // ---- Dibujo del maniquí -------------------------------------------------------------

  _drawMannequin(piece) {
    const armor = this._data(piece).armor;
    const key = ARMOR_SLOTS.map((s) => armor[s]?.id ?? '').join('|');
    let v = this._views.get(piece);
    if (v?.key === key) return;
    if (!v) {
      v = { group: new THREE.Group(), key: null };
      piece.object.add(v.group);
      this._views.set(piece, v);
    }
    v.key = key;
    v.group.clear();
    // Cada pieza de armadura: una caja del color de la prenda en su sitio del cuerpo.
    const parts = { HEAD: [[0, 1.78, 0], [0.32, 0.26, 0.32]], CHEST: [[0, 1.3, 0], [0.46, 0.6, 0.3]], LEGS: [[0, 0.8, 0], [0.36, 0.45, 0.24]], FEET: [[0, 0.16, 0.04], [0.36, 0.14, 0.32]], HANDS: [[0, 1.48, 0], [1.0, 0.1, 0.1]] };
    for (const slot of ARMOR_SLOTS) {
      const e = armor[slot];
      if (!e) continue;
      const [[x, y, z], [sx, sy, sz]] = parts[slot];
      const m = new THREE.Mesh(this._box ??= new THREE.BoxGeometry(1, 1, 1), this._mat(this._items[e.id]?.COLOR ?? 0x8a8f96));
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.userData.pieceId = piece.id;
      v.group.add(m);
    }
  }

  _mat(color) {
    this._mats ??= new Map();
    if (!this._mats.has(color)) this._mats.set(color, new THREE.MeshLambertMaterial({ color, flatShading: true }));
    return this._mats.get(color);
  }

  _say(text, type = 'info', ok = false) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return ok;
  }
}
