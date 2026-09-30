/**
 * Utilidades de aleatoriedad reproducible.
 *
 * Toda la generación del mundo usa estas funciones en lugar de Math.random(),
 * de forma que la misma seed produce siempre el mismo resultado.
 */

/** Hash de texto → entero sin signo de 32 bits (variante de cyrb53). */
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/** Deriva una sub-seed estable a partir de una seed y un nombre. */
export function deriveSeed(seed, name) {
  return hashString(`${seed >>> 0}:${name}`);
}

/** Hash rápido de coordenadas enteras → [0, 1). Útil para variaciones por punto. */
export function hash2D(seed, x, z) {
  let h = seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Generador pseudoaleatorio con seed (mulberry32). */
export class SeededRandom {
  constructor(seed) {
    this._state = seed >>> 0;
  }

  /** @returns {number} [0, 1) */
  next() {
    let t = (this._state = (this._state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }
}
