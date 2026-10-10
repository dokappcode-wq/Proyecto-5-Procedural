import { GameEvents } from '../core/GameEvents.js';

/**
 * RanchSystem — domesticar y cuidar animales (P4).
 *
 *  - Con su comida en la mano (RANCH.SPECIES.*.FOOD), vacas, cabras y gallinas se acercan
 *    y te siguen (AnimalSystem: env.lure). E les da de comer; tras FEEDS veces son tuyos:
 *    ya no huyen y pasean alrededor de donde los dejes (llévalos con comida en la mano).
 *  - Vaca tuya + cubo vacío (E): cubo de leche, cada MILK_EVERY s.
 *  - Cabra + tijeras (E): lana, cada WOOL_EVERY s (una salvaje sale corriendo después).
 *  - Gallina tuya: pone un huevo cada EGG_EVERY s (cae al suelo junto a ella).
 * Se guarda en la partida por id de animal (los rebaños se generan siempre igual).
 */
export class RanchSystem {
  constructor({ config, items, animals, inventory, hotbar, events, pickups = null, homeId = null, isHome = () => true }) {
    this.name = 'ranch';
    this._cfg = config;
    this._items = items;
    this._animals = animals;
    this._inv = inventory;
    this._hotbar = hotbar;
    this._events = events;
    this._pickups = pickups;
    this._homeId = homeId;
    this._isHome = isHome;
    this._t = 0;
    this._state = new Map(); // id → { trust, tamed, home?, milkAt, woolAt, eggAt }
    this._pending = null;    // estado cargado que espera a que existan los animales
    this._lure = new Set();
    // Al generarse el mundo (o cargar la partida), se aplica lo guardado.
    events.on(GameEvents.WORLD_GENERATED, () => {
      if (!this._pending) this._state.clear(); // mundo nuevo sin partida cargada: nada es tuyo
      this._apply();
    });
  }

  // ---- Consultas ---------------------------------------------------------------------

  /** ¿Es una especie de corral? */
  rule(animal) {
    return animal ? this._cfg.SPECIES[animal.species] ?? null : null;
  }

  _st(animal) {
    let s = this._state.get(animal.id);
    if (!s) this._state.set(animal.id, (s = { trust: 0, tamed: false, milkAt: 0, woolAt: 0, eggAt: 0 }));
    return s;
  }

  /** Texto de la acción con E (o null: entonces se golpea con el clic). */
  actionText(animal, source = null) {
    if (source && source !== this._animals) return null; // enemigos
    const R = this.rule(animal);
    if (!R || !animal.alive) return null;
    const held = this._hotbar.selectedId;
    const s = this._st(animal);
    if (R.FOOD.includes(held)) return animal.tamed ? 'Dar de comer (te sigue)' : `Dar de comer (${s.trust}/${R.FEEDS})`;
    if (animal.species === 'COW' && held === 'BUCKET') return animal.tamed ? (this._t >= s.milkAt ? 'Ordeñar' : 'Ordeñar (aún no)') : 'Ordeñar (no se deja)';
    if (R.WOOL_EVERY && held === 'SHEARS') return this._t >= s.woolAt ? 'Esquilar' : 'Esquilar (aún no)';
    return null;
  }

  // ---- E sobre un animal -------------------------------------------------------------

  /** @returns {boolean} si ha hecho algo */
  interact(animal, source = null) {
    if (source && source !== this._animals) return false;
    const R = this.rule(animal);
    if (!R || !animal.alive) return false;
    const held = this._hotbar.selectedId;
    const s = this._st(animal);
    const name = animal.def.NAME.toLowerCase();
    if (R.FOOD.includes(held)) return this._feed(animal, R, s, held, name);
    if (animal.species === 'COW' && held === 'BUCKET') {
      if (!animal.tamed) return this._say(`🐄 La ${name} no se deja ordeñar: domestícala antes (dale ${this._foods(R)} de tu mano).`, 'warning');
      if (this._t < s.milkAt) return this._say(`🥛 Aún no tiene leche (en ${Math.ceil((s.milkAt - this._t) / 60)} min).`);
      this._swapSelected('BUCKET', 'BUCKET_MILK');
      s.milkAt = this._t + R.MILK_EVERY;
      this._events.emit(GameEvents.ANIMAL_CARE, { animal, action: 'milk' });
      return this._say('🥛 ¡Un cubo de leche!', 'pickup', true);
    }
    if (R.WOOL_EVERY && held === 'SHEARS') {
      if (this._t < s.woolAt) return this._say(`✂️ Aún no le ha crecido la lana (en ${Math.ceil((s.woolAt - this._t) / 60)} min).`);
      const [lo, hi] = R.WOOL;
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      this._inv.addItem('WOOL', n);
      s.woolAt = this._t + R.WOOL_EVERY;
      this._wearSelected();
      if (!animal.tamed) {
        // Una salvaje se asusta y se va.
        animal.state = 'FLEE';
        animal.timer = 3;
      }
      this._events.emit(GameEvents.ANIMAL_CARE, { animal, action: 'shear' });
      return this._say(`✂️ Esquilada: 🧶 ${n} de lana.`, 'pickup', true);
    }
    if (!animal.tamed) return this._say(`Para domesticar ${animal.species === 'COW' ? 'una vaca' : animal.species === 'GOAT' ? 'una cabra' : 'una gallina'}: ${this._foods(R)} en la mano y E (${R.FEEDS} veces).`);
    return false;
  }

  _feed(animal, R, s, held, name) {
    if (!this._inv.removeItem(held, 1)) return false;
    this._events.emit(GameEvents.ANIMAL_CARE, { animal, action: 'feed' });
    if (animal.tamed) {
      animal.health = Math.min(animal.def.HEALTH, animal.health + 4);
      return this._say(`❤️ La ${name} come contenta.`, 'pickup', true);
    }
    s.trust++;
    if (s.trust >= R.FEEDS) {
      this._tame(animal, s);
      this._events.emit(GameEvents.ANIMAL_TAMED, { animal });
      return this._say(`❤️ ¡La ${name} es tuya! Ya no huye; con comida en la mano te sigue y se queda donde la lleves.`, 'pickup', true);
    }
    return this._say(`❤️ La ${name} come de tu mano (${s.trust}/${R.FEEDS}).`, 'pickup', true);
  }

  _tame(animal, s) {
    s.tamed = true;
    animal.tamed = true;
    // Casa propia (deja el rebaño): pasea alrededor de donde esté.
    animal.home = { x: s.home?.x ?? animal.x, z: s.home?.z ?? animal.z, radius: this._cfg.HOME_RADIUS };
    animal.temperament = 'NEUTRAL';
    animal.hitReaction = 'FLEE';
    animal.state = 'IDLE';
    animal.timer = 1;
    if (animal.species === 'CHICKEN' && !s.eggAt) s.eggAt = this._t + this._cfg.SPECIES.CHICKEN.EGG_EVERY;
  }

  _foods(R) {
    return R.FOOD.map((id) => `${this._items[id].ICON} ${this._items[id].NAME.toLowerCase()}`).join(' o ');
  }

  _swapSelected(from, to) {
    const idx = this._hotbar.selectedIndex;
    const st = idx != null ? this._inv.slots[idx] : null;
    if (st?.id === from) {
      st.id = to;
      this._inv._emit?.(to, 0);
    } else if (this._inv.removeItem(from, 1)) this._inv.addItem(to, 1);
  }

  _wearSelected() {
    const idx = this._hotbar.selectedIndex;
    if (idx != null) this._inv.wearSlot(idx, 1);
  }

  _say(text, type = 'info', ok = false) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return ok;
  }

  // ---- Tiempo ------------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    const home = this._isHome();
    // Con comida en la mano, los de esa especie se acercan.
    this._lure.clear();
    const held = this._hotbar.selectedId;
    if (home && held) for (const [sp, R] of Object.entries(this._cfg.SPECIES)) if (R.FOOD.includes(held)) this._lure.add(sp);
    const env = this._animals._env;
    if (env) {
      env.lure = this._lure;
      env.lureDistance = this._cfg.LURE_DISTANCE;
    }
    if (!home) return;
    // Huevos de las gallinas domesticadas (y su casa, para guardarla).
    for (const a of this._animals.animals) {
      if (!a.tamed || !a.alive) continue;
      const s = this._st(a);
      s.home = { x: a.home.x, z: a.home.z };
      const R = this.rule(a);
      if (R?.EGG_EVERY && this._t >= s.eggAt) {
        s.eggAt = this._t + R.EGG_EVERY;
        this._pickups?.drop(this._homeId, a.x + 0.4, a.z + 0.3, 'EGG', 1);
        this._events.emit(GameEvents.ANIMAL_CARE, { animal: a, action: 'egg' });
      }
    }
  }

  /** Cuántos animales tuyos hay (por especie). */
  tamedCount(species = null) {
    return this._animals.animals.filter((a) => a.tamed && a.alive && (!species || a.species === species)).length;
  }

  // ---- Guardar ---------------------------------------------------------------------

  snapshot() {
    const out = {};
    const t = this._t;
    for (const [id, s] of this._state) {
      if (!s.trust && !s.tamed) continue;
      const a = this._animals.animals.find((an) => an.id === id);
      if (a && !a.alive) continue; // muerto: se olvida
      out[id] = {
        trust: s.trust, tamed: s.tamed,
        ...(s.home ? { x: Math.round(s.home.x * 10) / 10, z: Math.round(s.home.z * 10) / 10 } : {}),
        ...(a?.tamed ? { ax: Math.round(a.x * 10) / 10, az: Math.round(a.z * 10) / 10 } : {}),
        milk: Math.max(0, Math.round(s.milkAt - t)), wool: Math.max(0, Math.round(s.woolAt - t)), egg: Math.max(0, Math.round(s.eggAt - t)),
      };
    }
    return out;
  }

  /** Datos no fiables: solo números razonables y ids conocidos cuando se apliquen. */
  restore(d) {
    this._state.clear();
    this._pending = d && typeof d === 'object' ? d : null;
    this._apply();
  }

  _apply() {
    const d = this._pending;
    if (!d || !this._animals.animals.length) return;
    const num = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
    const coord = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e5;
    const byId = new Map(this._animals.animals.map((a) => [a.id, a]));
    for (const [id, e] of Object.entries(d)) {
      const a = byId.get(id);
      if (!a || !e || typeof e !== 'object' || !this.rule(a)) continue;
      const s = this._st(a);
      s.trust = Math.floor(num(e.trust, 99));
      s.milkAt = this._t + num(e.milk, 3600);
      s.woolAt = this._t + num(e.wool, 3600);
      s.eggAt = this._t + num(e.egg, 3600);
      if (coord(e.x) && coord(e.z)) s.home = { x: e.x, z: e.z };
      if (e.tamed === true) {
        this._tame(a, s);
        if (coord(e.ax) && coord(e.az)) {
          a.x = e.ax;
          a.z = e.az;
        }
      }
    }
    this._pending = null;
  }
}
