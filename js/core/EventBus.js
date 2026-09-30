/**
 * EventBus — publicación/suscripción mínima.
 *
 * Los sistemas se comunican emitiendo eventos en lugar de llamarse entre sí
 * (p. ej. TemperatureSystem emitirá su estado y UIManager lo mostrará).
 * Nombres de evento con formato 'dominio:accion' (ver GameEvents.js).
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /** @returns {() => void} función para cancelar la suscripción */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error en manejador de "${event}":`, err);
      }
    }
  }
}
