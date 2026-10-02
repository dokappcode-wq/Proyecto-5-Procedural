/**
 * SaveGame — guardar y cargar la partida en el navegador (localStorage).
 *
 * La partida es un objeto JSON. Cada sistema que tiene algo que guardar se
 * registra con un nombre (`register(name, { save, load })`): al guardar se llama
 * a `save()` de cada uno y al cargar a `load(datos)` con lo que devolvió.
 * Así las partes nuevas (historia, cofres, cuevas…) se añaden sin tocar esto.
 *
 * Lo cargado se trata como datos no fiables (puede venir editado a mano): cada
 * `load` comprueba lo que lee. Sin almacenamiento (modo privado), guardar
 * falla en silencio y devuelve false.
 */
export const SAVE_VERSION = 1;

export class SaveGame {
  constructor({ key, storage = safeStorage() }) {
    this._key = key;
    this._storage = storage;
    this._parts = new Map();
  }

  /** @param {string} name @param {{ save: () => any, load: (data: any) => void }} part */
  register(name, part) {
    this._parts.set(name, part);
  }

  /** ¿Hay una partida guardada? Devuelve su cabecera { at, file, seed, system, reason } o null. */
  peek() {
    const s = this.read();
    return s ? { at: s.at, file: s.file, seed: s.seed, system: s.system, reason: s.reason } : null;
  }

  /** Partida guardada (o null si no hay o no es válida). */
  read() {
    const text = this._storage.get(this._key);
    if (!text) return null;
    try {
      const s = JSON.parse(text);
      if (!s || s.v !== SAVE_VERSION || typeof s.file !== 'string' || !Number.isFinite(s.seed)) return null;
      return s;
    } catch {
      return null;
    }
  }

  /**
   * Guarda la partida. `header` = { file, seed, system, reason }.
   * @returns {boolean}
   */
  write(header) {
    const data = { v: SAVE_VERSION, at: Date.now(), ...header, parts: {} };
    for (const [name, part] of this._parts) {
      try {
        data.parts[name] = part.save();
      } catch (err) {
        console.warn(`[guardar] ${name}:`, err);
      }
    }
    return this._storage.set(this._key, JSON.stringify(data));
  }

  /** Aplica una partida leída: cada parte recibe lo suyo (las que falten no se tocan). */
  apply(save) {
    const parts = save?.parts && typeof save.parts === 'object' ? save.parts : {};
    for (const [name, part] of this._parts) {
      if (!(name in parts)) continue;
      try {
        part.load(parts[name]);
      } catch (err) {
        console.warn(`[cargar] ${name}:`, err);
      }
    }
  }

  clear() {
    this._storage.remove(this._key);
  }
}

/** Fecha de un guardado en texto corto ("hoy 18:42", "12/10 09:05"). */
export function saveDateText(at, now = Date.now()) {
  const d = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return new Date(now).toDateString() === d.toDateString() ? `hoy ${time}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${time}`;
}

export function safeStorage() {
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
        return true;
      } catch {
        return false;
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
