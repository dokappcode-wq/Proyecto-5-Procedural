/**
 * KeySequenceDetector — detecta una secuencia de teclas pulsadas en orden.
 *
 * - Una tecla incorrecta reinicia la secuencia (si esa tecla es el inicio
 *   de la secuencia, cuenta como primer paso).
 * - Si pasa más de `timeoutMs` entre dos teclas, la secuencia se reinicia.
 * - Independiente del DOM: se alimenta con `feed(key, timestampMs)`, lo que
 *   permite probarlo de forma aislada.
 */
export class KeySequenceDetector {
  constructor({ sequence, timeoutMs, onMatch }) {
    this._seq = sequence.map((k) => k.toLowerCase());
    this._timeout = timeoutMs;
    this._onMatch = onMatch;
    this._index = 0;
    this._lastTime = -Infinity;
  }

  reset() {
    this._index = 0;
  }

  /** @returns {boolean} true si la secuencia se ha completado con esta tecla */
  feed(key, now = performance.now()) {
    if (typeof key !== 'string' || key.length !== 1) {
      // Teclas modificadoras (Shift, etc.) se ignoran; el resto reinicia.
      if (!['Shift', 'CapsLock'].includes(key)) this.reset();
      return false;
    }
    const k = key.toLowerCase();

    if (this._index > 0 && now - this._lastTime > this._timeout) this._index = 0;
    this._lastTime = now;

    if (k === this._seq[this._index]) {
      this._index++;
    } else {
      this._index = k === this._seq[0] ? 1 : 0;
    }

    if (this._index === this._seq.length) {
      this._index = 0;
      this._onMatch?.();
      return true;
    }
    return false;
  }
}
