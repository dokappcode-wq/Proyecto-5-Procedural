/**
 * GameLoop — bucle principal. NO contiene lógica de juego.
 *
 * Mantiene una lista ordenada de sistemas y llama a `update(dt, time)` en cada
 * frame. El orden de registro es el orden de actualización. Después llama a
 * `render()` y, por último, a `lateUpdate()` de los sistemas que lo tengan
 * (útil para limpiar estado por frame, p. ej. deltas del ratón).
 *
 * Un error en un sistema no congela el juego: se avisa (una vez por sistema, onError)
 * y los demás siguen funcionando en ese fotograma y en los siguientes.
 */
export class GameLoop {
  constructor({ maxDelta = 0.1, render, onError = null }) {
    this._onError = onError;
    this._failed = new Set();
    this._systems = [];
    this._maxDelta = maxDelta;
    this._render = render;
    this._running = false;
    this._lastTime = 0;
    this._elapsed = 0;
    this._frame = this._frame.bind(this);
    /** Fotogramas por segundo (media del último medio segundo); lo muestra el Admin. */
    this.fps = 0;
    this._fpsFrames = 0;
    this._fpsTime = 0;
  }

  /** @param {{name:string, update?:Function, lateUpdate?:Function}} system */
  add(system) {
    if (!system?.name) throw new Error('[GameLoop] Cada sistema necesita un "name".');
    this._systems.push(system);
    return system;
  }

  get(name) {
    return this._systems.find((s) => s.name === name);
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(this._frame);
  }

  stop() {
    this._running = false;
  }

  _frame(now) {
    if (!this._running) return;
    // El primer timestamp de requestAnimationFrame puede ser ANTERIOR al
    // performance.now() de start(): sin el Math.max, el primer dt sería negativo.
    const real = Math.max(0, (now - this._lastTime) / 1000);
    const dt = Math.min(real, this._maxDelta);
    this._lastTime = now;
    this._elapsed += dt;
    this._fpsFrames++;
    this._fpsTime += real; // tiempo real (dt está limitado)
    if (this._fpsTime >= 0.5) {
      this.fps = this._fpsFrames / this._fpsTime;
      this._fpsFrames = 0;
      this._fpsTime = 0;
    }

    // El siguiente fotograma se pide antes: pase lo que pase en este, el juego sigue.
    requestAnimationFrame(this._frame);
    for (const s of this._systems) if (s.enabled !== false) this._safe(s, 'update', dt);
    try {
      this._render();
    } catch (err) {
      this._report({ name: 'render' }, err);
    }
    for (const s of this._systems) if (s.lateUpdate) this._safe(s, 'lateUpdate', dt);
  }

  _safe(s, method, dt) {
    try {
      s[method]?.(dt, this._elapsed);
    } catch (err) {
      this._report(s, err);
    }
  }

  _report(s, err) {
    if (this._failed.has(s.name)) return;
    this._failed.add(s.name);
    console.error(`[GameLoop] Error en "${s.name}":`, err);
    this._onError?.(s.name, err);
  }
}
