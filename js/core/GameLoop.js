/**
 * GameLoop — bucle principal. NO contiene lógica de juego.
 *
 * Mantiene una lista ordenada de sistemas y llama a `update(dt, time)` en cada
 * frame. El orden de registro es el orden de actualización. Después llama a
 * `render()` y, por último, a `lateUpdate()` de los sistemas que lo tengan
 * (útil para limpiar estado por frame, p. ej. deltas del ratón).
 */
export class GameLoop {
  constructor({ maxDelta = 0.1, render }) {
    this._systems = [];
    this._maxDelta = maxDelta;
    this._render = render;
    this._running = false;
    this._lastTime = 0;
    this._elapsed = 0;
    this._frame = this._frame.bind(this);
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
    const dt = Math.max(0, Math.min((now - this._lastTime) / 1000, this._maxDelta));
    this._lastTime = now;
    this._elapsed += dt;

    for (const s of this._systems) if (s.enabled !== false) s.update?.(dt, this._elapsed);
    this._render();
    for (const s of this._systems) s.lateUpdate?.(dt, this._elapsed);

    requestAnimationFrame(this._frame);
  }
}
