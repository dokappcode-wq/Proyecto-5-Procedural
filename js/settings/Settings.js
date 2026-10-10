/**
 * Settings — ajustes del jugador (P9): calidad gráfica, campo de visión, sensibilidad del
 * ratón e invertir Y. Se guardan en el navegador (localStorage), no en la partida.
 * El volumen lo guarda AudioSystem aparte (mundo0.audio).
 *
 * Datos no fiables (lo que haya en localStorage): solo JSON, tamaño máximo, solo las claves
 * conocidas y valores dentro de sus límites; lo demás se ignora.
 */
export const SETTINGS_KEY = 'mundo0.settings';
const MAX_BYTES = 2048;

export const QUALITY = Object.freeze({
  LOW: { NAME: 'Baja', PIXEL_RATIO: 0.6, SHADOWS: false, SHADOW_MAP: 0 },
  MEDIUM: { NAME: 'Media', PIXEL_RATIO: 0.85, SHADOWS: true, SHADOW_MAP: 1024 },
  HIGH: { NAME: 'Alta', PIXEL_RATIO: 1, SHADOWS: true, SHADOW_MAP: 2048 },
});

export const LIMITS = Object.freeze({
  fov: [55, 100],
  sensitivity: [0.2, 3],
});

export const DEFAULTS = Object.freeze({ quality: 'HIGH', fov: 70, sensitivity: 1, invertY: false });

const clamp = (v, [a, b]) => Math.min(b, Math.max(a, v));

/** Ajustes válidos a partir de cualquier cosa (texto JSON u objeto). */
export function parseSettings(raw, defaults = DEFAULTS) {
  const out = { ...defaults };
  let d = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_BYTES) return out;
    try {
      d = JSON.parse(raw);
    } catch {
      return out;
    }
  }
  if (!d || typeof d !== 'object' || Array.isArray(d)) return out;
  if (typeof d.quality === 'string' && Object.hasOwn(QUALITY, d.quality)) out.quality = d.quality;
  if (Number.isFinite(d.fov)) out.fov = Math.round(clamp(d.fov, LIMITS.fov));
  if (Number.isFinite(d.sensitivity)) out.sensitivity = Math.round(clamp(d.sensitivity, LIMITS.sensitivity) * 100) / 100;
  if (typeof d.invertY === 'boolean') out.invertY = d.invertY;
  return out;
}

export class Settings {
  /**
   * @param {object} p.defaults valores de partida (FOV e invertir Y salen de la configuración)
   * @param {Storage} [p.storage] localStorage (o un sustituto en las pruebas)
   */
  constructor({ defaults = DEFAULTS, storage = globalThis.localStorage } = {}) {
    this._defaults = { ...DEFAULTS, ...defaults };
    this._storage = storage;
    this._listeners = [];
    let raw = null;
    try {
      raw = storage?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      /* almacenamiento no disponible */
    }
    this.values = parseSettings(raw ?? {}, this._defaults);
  }

  get(key) {
    return this.values[key];
  }

  /** Cambia un ajuste (validado), lo guarda y avisa. */
  set(key, value) {
    if (!Object.hasOwn(DEFAULTS, key)) return false;
    const next = parseSettings({ ...this.values, [key]: value }, this._defaults);
    if (next[key] === this.values[key]) return false;
    this.values = next;
    this._save();
    for (const fn of this._listeners) fn(this.values, key);
    return true;
  }

  reset() {
    this.values = { ...this._defaults };
    this._save();
    for (const fn of this._listeners) fn(this.values, null);
  }

  /** fn(values, key) en cada cambio (key null = todos). */
  onChange(fn) {
    this._listeners.push(fn);
  }

  _save() {
    try {
      this._storage?.setItem(SETTINGS_KEY, JSON.stringify(this.values));
    } catch {
      /* almacenamiento no disponible: no pasa nada */
    }
  }
}
