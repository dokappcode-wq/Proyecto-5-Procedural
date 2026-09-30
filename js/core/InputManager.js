import { GameEvents } from './GameEvents.js';

/**
 * InputManager — traduce eventos del navegador a un estado consultable.
 *
 * - Acciones con nombre (FORWARD, JUMP, TOGGLE_CAMERA...) según KEYBINDINGS.
 *   Los botones del ratón se nombran 'Mouse0' (izq.), 'Mouse1', 'Mouse2' y solo
 *   cuentan con el ratón capturado (el primer clic sirve para capturarlo).
 * - Movimiento del ratón acumulado por frame (solo con pointer lock).
 * - Rueda del ratón acumulada por frame.
 * - Los consumidores NO escuchan el DOM directamente: preguntan aquí.
 *
 * `setBlocked(reason, bool)` permite a otras capas (pantalla de inicio,
 * panel Admin, futuros menús) suspender la entrada de juego sin que los
 * sistemas lo sepan. Varias causas pueden coexistir sin pisarse.
 */
export class InputManager {
  constructor({ config, domElement, events }) {
    this.name = 'input';
    this._cfg = config;
    this._dom = domElement;
    this._events = events;

    this._down = new Set();          // event.code actualmente pulsados
    this._pressedThisFrame = new Set();
    this._mouseDX = 0;
    this._mouseDY = 0;
    this._wheel = 0;
    this._keyListeners = new Set();  // observadores de teclas crudas (secuencia Admin)
    this._blockers = new Set();

    this._codeToActions = new Map();
    for (const [action, codes] of Object.entries(config.KEYBINDINGS)) {
      for (const code of codes) {
        if (!this._codeToActions.has(code)) this._codeToActions.set(code, []);
        this._codeToActions.get(code).push(action);
      }
    }

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onBlur = () => this._down.clear();
    this._skipNextMouseMove = false;
    this._onPointerLockChange = () => {
      // Algunos navegadores envían un salto enorme en el primer mousemove tras bloquear.
      this._skipNextMouseMove = true;
      this._events.emit(GameEvents.POINTER_LOCK_CHANGED, { locked: this.isPointerLocked() });
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this._dom.addEventListener('wheel', this._onWheel, { passive: false });
  }

  // ---- Bloqueo -----------------------------------------------------------

  setBlocked(reason, blocked) {
    if (blocked) this._blockers.add(reason);
    else this._blockers.delete(reason);
    if (this.blocked) this._down.clear();
  }

  get blocked() {
    return this._blockers.size > 0;
  }

  // ---- Consultas ---------------------------------------------------------

  /** ¿Está pulsada alguna tecla asociada a la acción? */
  isDown(action) {
    if (this.blocked) return false;
    const codes = this._cfg.KEYBINDINGS[action];
    return !!codes && codes.some((c) => this._down.has(c));
  }

  /** ¿Se pulsó la acción en este frame? (flanco de subida) */
  wasPressed(action) {
    return !this.blocked && this._pressedThisFrame.has(action);
  }

  /** Delta del ratón del frame en píxeles. */
  getMouseDelta() {
    if (this.blocked) return { x: 0, y: 0 };
    return { x: this._mouseDX, y: this._mouseDY };
  }

  /** Pasos de rueda en el frame (positivo = alejar). */
  getWheel() {
    return this.blocked ? 0 : this._wheel;
  }

  isPointerLocked() {
    return document.pointerLockElement === this._dom;
  }

  requestPointerLock() {
    try {
      const p = this._dom.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* navegadores sin pointer lock: el teclado sigue funcionando */
    }
  }

  exitPointerLock() {
    if (this.isPointerLocked()) document.exitPointerLock();
  }

  /**
   * Suscribe un observador a TODAS las teclas pulsadas (aunque la entrada de
   * juego esté bloqueada). Lo usa el detector de secuencias del modo Admin.
   * @returns {() => void} cancelar suscripción
   */
  onRawKey(listener) {
    this._keyListeners.add(listener);
    return () => this._keyListeners.delete(listener);
  }

  // ---- Ciclo -------------------------------------------------------------

  lateUpdate() {
    this._pressedThisFrame.clear();
    this._mouseDX = 0;
    this._mouseDY = 0;
    this._wheel = 0;
  }

  // ---- DOM ---------------------------------------------------------------

  _isTypingTarget(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  _onKeyDown(e) {
    if (this._isTypingTarget(e)) return;
    for (const l of this._keyListeners) l(e);

    const actions = this._codeToActions.get(e.code);
    if (actions) {
      if (!e.repeat) actions.forEach((a) => this._pressedThisFrame.add(a));
      // Evita que Espacio/flechas desplacen la página o Ctrl dispare atajos.
      e.preventDefault();
    }
    this._down.add(e.code);
  }

  _onKeyUp(e) {
    this._down.delete(e.code);
  }

  _onMouseDown(e) {
    if (!this.isPointerLocked()) return;
    const code = `Mouse${e.button}`;
    this._codeToActions.get(code)?.forEach((a) => this._pressedThisFrame.add(a));
    this._down.add(code);
  }

  _onMouseUp(e) {
    this._down.delete(`Mouse${e.button}`);
  }

  _onMouseMove(e) {
    if (!this.isPointerLocked()) return;
    if (this._skipNextMouseMove) {
      this._skipNextMouseMove = false;
      return;
    }
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    // Descarta picos espurios (bug conocido de Chrome con pointer lock).
    if (Math.abs(dx) > this._cfg.MAX_MOUSE_EVENT_DELTA || Math.abs(dy) > this._cfg.MAX_MOUSE_EVENT_DELTA) return;
    this._mouseDX += dx;
    this._mouseDY += dy;
  }

  _onWheel(e) {
    e.preventDefault();
    this._wheel += Math.sign(e.deltaY);
  }
}
