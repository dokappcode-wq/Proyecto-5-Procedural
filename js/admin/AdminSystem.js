import { GameEvents } from '../core/GameEvents.js';
import { KeySequenceDetector } from './KeySequenceDetector.js';
import { AdminPanel } from './AdminPanel.js';

/**
 * AdminSystem — herramienta de desarrollo, fuera de la experiencia normal.
 *
 * - Se activa escribiendo ADMIN_SEQUENCE (a → d → m → i → n) con un máximo de
 *   ADMIN_KEY_TIMEOUT ms entre teclas. Repetir la secuencia muestra/oculta el panel.
 * - No conoce los demás sistemas: cada fase REGISTRA sus herramientas con
 *   `registerTool()`, de modo que añadir depuración nueva no modifica este archivo.
 *
 * Tipos de herramienta:
 *   { type: 'button', category, label, run() }
 *   { type: 'info',   category, label, read() → string }   (se refresca en vivo)
 *   { type: 'input',  category, label, placeholder?, run(value) }
 */
export class AdminSystem {
  constructor({ config, input, events, container }) {
    this.name = 'admin';
    this._input = input;
    this._events = events;
    this.active = false;
    this._tools = [];
    this._refreshTimer = 0;

    this._panel = new AdminPanel({
      container,
      onClose: () => this.setPanelOpen(false),
      onDeactivate: () => this.setActive(false),
      onToolError: (tool, err) => this._message(`Error en "${tool.label}": ${err.message}`, 'error'),
    });

    this._detector = new KeySequenceDetector({
      sequence: config.ADMIN_SEQUENCE,
      timeoutMs: config.ADMIN_KEY_TIMEOUT,
      onMatch: () => (this.active ? this.setPanelOpen(!this._panel.isOpen) : this.setActive(true)),
    });

    input.onRawKey((e) => {
      if (e.repeat) return;
      if (e.key === 'Escape' && this._panel.isOpen) {
        this.setPanelOpen(false);
        return;
      }
      this._detector.feed(e.key);
    });
  }

  /** @returns {() => void} función para eliminar la herramienta */
  registerTool(tool) {
    const entry = { category: 'General', type: 'button', ...tool };
    this._tools.push(entry);
    this._panel.render(this._tools);
    return () => {
      this._tools = this._tools.filter((t) => t !== entry);
      this._panel.render(this._tools);
    };
  }

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    this._events.emit(GameEvents.ADMIN_MODE_CHANGED, { active });
    this._message(active ? 'ADMIN MODE ACTIVADO' : 'Admin mode desactivado', 'admin');
    this.setPanelOpen(active);
  }

  setPanelOpen(open) {
    if (open && !this.active) return;
    if (this._panel.isOpen === open) return;
    this._panel.setOpen(open);
    // Con el panel abierto se libera el ratón y se congela la entrada de juego.
    this._input.setBlocked('admin-panel', open);
    if (open) this._input.exitPointerLock();
    this._events.emit(GameEvents.ADMIN_PANEL_TOGGLED, { open });
  }

  update(dt) {
    if (!this._panel.isOpen) return;
    this._refreshTimer -= dt;
    if (this._refreshTimer <= 0) {
      this._refreshTimer = 0.2;
      this._panel.refreshInfo();
    }
  }

  _message(text, type) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
