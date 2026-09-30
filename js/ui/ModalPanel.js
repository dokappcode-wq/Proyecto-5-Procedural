import { GameEvents } from '../core/GameEvents.js';

/**
 * ModalPanel — base de los paneles que se abren sobre el juego (mapa, puesto
 * de carga...): liberan el ratón, bloquean la entrada de juego y se cierran con
 * Esc, con el botón ✕ o con la tecla indicada. Emiten UI_PANEL_TOGGLED para que
 * el HUD sepa que no debe pedir el control del ratón mientras están abiertos.
 *
 * Las subclases rellenan `this.body` en `render()`.
 */
export class ModalPanel {
  constructor({ id, title, container, input, events, footer = '<kbd>Esc</kbd> para cerrar' }) {
    this.name = id;
    this._id = id;
    this._input = input;
    this._events = events;
    this.isOpen = false;
    this._closeRequested = false;

    this.el = document.createElement('div');
    this.el.id = id;
    this.el.className = 'modal-panel hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', title);
    this.el.innerHTML = `
      <header><span class="panel-title"></span><button type="button" class="close" aria-label="Cerrar">✕</button></header>
      <div class="panel-body"></div>
      <footer>${footer}</footer>`;
    this.el.querySelector('.panel-title').textContent = title;
    this.body = this.el.querySelector('.panel-body');
    this.el.querySelector('.close').addEventListener('click', () => this.setOpen(false));
    container.appendChild(this.el);

    // Esc cierra aunque la entrada de juego esté bloqueada (se aplica en update()).
    input.onRawKey((e) => {
      if (this.isOpen && e.code === 'Escape') this._closeRequested = true;
    });
  }

  setTitle(title) {
    this.el.querySelector('.panel-title').textContent = title;
  }

  update(dt) {
    if (this._closeRequested) {
      this._closeRequested = false;
      this.setOpen(false);
    }
    if (this.isOpen) this.tick?.(dt);
  }

  setOpen(open) {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
    this._input.setBlocked(this._id, open);
    if (open) {
      this._input.exitPointerLock();
      this.render();
    } else {
      this._input.requestPointerLock();
    }
    this._events.emit(GameEvents.UI_PANEL_TOGGLED, { id: this._id, open });
  }

  render() {}
}
