/**
 * LruCache — caché con límite: al pasarse de `max` entradas descarta las menos
 * usadas recientemente. `keep(value)` puede proteger entradas que no se deben
 * perder (p. ej. chunks con árboles talados): esas no se descartan nunca.
 *
 * Se apoya en el orden de inserción de Map: leer una entrada la mueve al final.
 */
export class LruCache {
  constructor(max, { keep = null } = {}) {
    this.max = max;
    this._keep = keep;
    this._map = new Map();
    this.evicted = 0;
  }

  get size() {
    return this._map.size;
  }

  get(key) {
    const v = this._map.get(key);
    if (v === undefined) return undefined;
    this._map.delete(key);
    this._map.set(key, v);
    return v;
  }

  has(key) {
    return this._map.has(key);
  }

  set(key, value) {
    this._map.delete(key);
    this._map.set(key, value);
    if (this._map.size > this.max) this._trim();
    return this;
  }

  delete(key) {
    return this._map.delete(key);
  }

  clear() {
    this._map.clear();
  }

  values() {
    return this._map.values();
  }

  _trim() {
    for (const [k, v] of this._map) {
      if (this._map.size <= this.max) break;
      if (this._keep?.(v)) continue;
      this._map.delete(k);
      this.evicted++;
    }
  }
}
