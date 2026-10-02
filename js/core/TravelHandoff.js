/**
 * TravelHandoff — lo que viaja contigo por el hiperespacio.
 *
 * Saltar a otro sistema recarga el juego con ese sistema (cada sistema es un
 * mundo nuevo con su semilla). Antes de recargar se guarda aquí el estado que
 * debe conservarse: inventario, armadura, vida y necesidades, traje, la nave
 * (ampliada, tecnologías, baterías), la hora y la semilla del Edén (para volver
 * al mismo Edén). Al arrancar, si hay un traspaso hacia este sistema, se aplica
 * y se borra (un solo uso).
 *
 * Es un objeto pequeño en localStorage. Al leerlo se trata como datos no fiables:
 * cada valor se comprueba y se limita (objetos que existen, números en rango).
 */
const KEY = 'mundo0.hyperjump';
const MAX_AGE_MS = 10 * 60 * 1000;

export function captureState({ systemName, target, campaignSeed, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression = null, hasWatch = true }) {
  return {
    v: 1,
    at: Date.now(),
    from: systemName,
    target,
    campaignSeed,
    totalHours: time.totalHours,
    slots: inventory.snapshot(),
    worn: { ...equipment.slots },
    wornDur: { ...(equipment.dur ?? {}) },
    progression: progression?.snapshot() ?? null,
    watch: !!hasWatch,
    vitals: { health: health.value, hunger: hunger.value, thirst: thirst.value, energy: energy.value },
    life: { wearing: lifeSupport.wearing, oxygen: lifeSupport.oxygen, battery: lifeSupport.battery, gas: lifeSupport.gas },
    ship: {
      explorer: ship.isExplorer,
      installed: { ...ship.installed },
      batteries: ship.batteries.slots.map((b) => (b ? b.charge : null)),
      podsUsed: ship.podsUsed,
    },
  };
}

export function saveHandoff(state, storage = safeStorage()) {
  storage.set(KEY, JSON.stringify(state));
}

/** El traspaso guardado hacia el sistema `target` (y lo borra), o null. */
export function takeHandoff(target, storage = safeStorage()) {
  const raw = storage.get(KEY);
  if (!raw) return null;
  storage.remove(KEY);
  try {
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || s.target !== target || !(Date.now() - s.at < MAX_AGE_MS)) return null;
    return s;
  } catch {
    return null;
  }
}

/**
 * Aplica un traspaso (ya en el nuevo sistema).
 * @param {object} deps { items, techs, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time }
 */
export function applyState(s, { items, techs, inventory, equipment, health, hunger, thirst, energy, lifeSupport, ship, time, progression = null }) {
  const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);
  const known = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(items, id);
  // Huecos del inventario tal cual (se comprueba cada uno) y la ropa puesta.
  inventory.restore(Array.isArray(s.slots) ? s.slots : []);
  for (const slot of Object.keys(equipment.slots)) equipment.equipDirect?.(slot, null);
  for (const [slot, id] of Object.entries(s.worn && typeof s.worn === 'object' ? s.worn : {})) {
    if (known(id) && Object.prototype.hasOwnProperty.call(equipment.slots, slot)) equipment.equipDirect(slot, id, num(s.wornDur?.[slot], 1, 1e6, undefined));
  }
  // Niveles antes que las vitales: la vida y la energía máximas dependen de ellos.
  if (progression && s.progression) progression.restore(s.progression);
  const v = s.vitals ?? {};
  for (const [stat, key] of [[health, 'health'], [hunger, 'hunger'], [thirst, 'thirst'], [energy, 'energy']]) {
    stat.set(num(v[key], 1, 1e6, stat.value));
  }
  const l = s.life ?? {};
  if (!!l.wearing !== lifeSupport.wearing) lifeSupport.toggleSuit();
  lifeSupport.oxygen = num(l.oxygen, 0, 1, 1);
  lifeSupport.battery = l.battery === null ? null : num(l.battery, 0, 1, 1);
  lifeSupport.gas = num(l.gas, 0, 1, 1);

  const sh = s.ship ?? {};
  if (sh.explorer && !ship.isExplorer) ship.upgrade();
  for (const [slot, tech] of Object.entries(sh.installed ?? {})) {
    if (!Object.prototype.hasOwnProperty.call(ship.installed, slot)) continue;
    if (tech === null || (typeof tech === 'string' && Object.prototype.hasOwnProperty.call(techs, tech))) ship.installTech(slot, tech);
  }
  if (Array.isArray(sh.batteries)) {
    const cap = ship.batteries._cfg.CAPACITY;
    ship.batteries.slots = ship.batteries.slots.map((_, i) => {
      const c = sh.batteries[i];
      return c === null ? null : { charge: num(c, 0, cap, cap) };
    });
  }
  ship.podsUsed = Math.floor(num(sh.podsUsed, 0, 99, 0));
  time.totalHours = num(s.totalHours, 0, 1e7, time.totalHours);
}

function safeStorage() {
  return {
    get(k) {
      try {
        return globalThis.localStorage?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        globalThis.localStorage?.setItem(k, v);
      } catch {
        /* sin almacenamiento: el salto llega sin la partida */
      }
    },
    remove(k) {
      try {
        globalThis.localStorage?.removeItem(k);
      } catch {
        /* nada */
      }
    },
  };
}
