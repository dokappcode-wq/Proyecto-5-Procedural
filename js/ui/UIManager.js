import { GameEvents } from '../core/GameEvents.js';

const MODE_LABELS = { FIRST_PERSON: '1ª persona', THIRD_PERSON: '3ª persona' };

/**
 * UIManager — HUD provisional en DOM.
 *
 * Solo MUESTRA información: reacciona a eventos del EventBus y a consultas de
 * solo lectura. No modifica el estado de otros sistemas (excepto pedir el
 * pointer lock al pulsar "Entrar", que es interacción de interfaz).
 *
 * Las barras de Vida/Hambre/Sed/Energía y los efectos de temperatura se
 * añadirán aquí en las fases 6 y 10, alimentados por eventos.
 */
export class UIManager {
  constructor({ config, gameInfo, events, input, canvas, root = document }) {
    this.name = 'ui';
    this._cfg = config;
    this._events = events;
    this._input = input;
    this._started = false;
    this._adminPanelOpen = false;

    const $ = (id) => root.getElementById(id);
    this.el = {
      startScreen: $('start-screen'),
      startButton: $('start-button'),
      title: $('game-title'),
      hud: $('hud'),
      crosshair: $('crosshair'),
      cameraMode: $('camera-mode'),
      help: $('help'),
      lockHint: $('lock-hint'),
      messages: $('messages'),
      version: $('version'),
    };

    this.el.title.textContent = gameInfo.TITLE;
    this.el.version.textContent = `${gameInfo.TITLE} · v${gameInfo.VERSION}`;

    this.el.startButton.addEventListener('click', () => this._start());
    // Clic en el juego = recuperar el control del ratón.
    canvas.addEventListener('mousedown', () => {
      if (this._started && !this._adminPanelOpen) input.requestPointerLock();
    });

    events.on(GameEvents.CAMERA_MODE_CHANGED, ({ mode }) => {
      this._setCameraLabel(mode);
      this.showMessage(`Cámara: ${MODE_LABELS[mode] ?? mode}`);
    });
    events.on(GameEvents.POINTER_LOCK_CHANGED, () => this._updateLockHint());
    events.on(GameEvents.ADMIN_PANEL_TOGGLED, ({ open }) => {
      this._adminPanelOpen = open;
      this._updateLockHint();
    });
    events.on(GameEvents.PLAYER_FLY_CHANGED, ({ flying }) =>
      this.showMessage(flying ? 'Vuelo activado (Espacio sube, C baja)' : 'Vuelo desactivado'),
    );
    events.on(GameEvents.UI_MESSAGE, ({ text, type }) => this.showMessage(text, type));
  }

  setInitialCameraMode(mode) {
    this._setCameraLabel(mode);
  }

  update() {
    if (this._input.wasPressed('TOGGLE_HELP')) this.el.help.classList.toggle('collapsed');
  }

  showMessage(text, type = 'info') {
    const node = document.createElement('div');
    node.className = `message message-${type}`;
    node.textContent = text;
    this.el.messages.appendChild(node);
    while (this.el.messages.children.length > this._cfg.MAX_MESSAGES) {
      this.el.messages.firstElementChild.remove();
    }
    // Aparición y desaparición graduales (transiciones CSS).
    requestAnimationFrame(() => node.classList.add('visible'));
    setTimeout(() => {
      node.classList.remove('visible');
      setTimeout(() => node.remove(), 600);
    }, this._cfg.MESSAGE_DURATION_MS);
  }

  _start() {
    if (this._started) return;
    this._started = true;
    this.el.startScreen.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this._input.requestPointerLock();
    this._events.emit(GameEvents.GAME_STARTED);
    this.showMessage('Bienvenido a MUNDO 0');
    this._updateLockHint();
  }

  _setCameraLabel(mode) {
    this.el.cameraMode.textContent = `Cámara: ${MODE_LABELS[mode] ?? mode} (V)`;
  }

  _updateLockHint() {
    const show = this._started && !this._adminPanelOpen && !this._input.isPointerLocked();
    this.el.lockHint.classList.toggle('hidden', !show);
  }
}
