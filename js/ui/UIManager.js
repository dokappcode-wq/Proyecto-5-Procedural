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
  constructor({ config, gameInfo, items, events, input, canvas, root = document }) {
    this.name = 'ui';
    this._cfg = config;
    this._events = events;
    this._input = input;
    this._started = false;
    this._adminPanelOpen = false;
    this._items = items;

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
      seed: $('seed'),
      biome: $('biome'),
      prompt: $('interaction-prompt'),
      inventory: $('inventory-bar'),
      damageFlash: $('damage-flash'),
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
    events.on(GameEvents.WORLD_GENERATED, ({ seed }) => {
      this.el.seed.textContent = `Seed: ${seed}`;
      if (this._started) this.showMessage(`Mundo generado · seed "${seed}"`);
    });
    events.on(GameEvents.PLAYER_BIOME_CHANGED, ({ biome, first }) => {
      this.el.biome.textContent = biome.name;
      this.el.biome.dataset.biome = biome.id;
      if (!first && this._started) this.showMessage(`Has entrado en: ${biome.name}`, 'biome');
    });
    events.on(GameEvents.WATER_DISCOVERED, ({ first }) =>
      this.showMessage(first ? 'Has encontrado agua.' : 'Has encontrado otra fuente de agua.', 'biome'),
    );
    events.on(GameEvents.ANIMAL_DISCOVERED, ({ namePlural }) =>
      this.showMessage(`Has encontrado ${namePlural.toLowerCase()}.`, 'biome'),
    );
    events.on(GameEvents.INTERACTION_TARGET_CHANGED, ({ target }) => this._showTarget(target));
    events.on(GameEvents.PLAYER_ACTION, () => this._pulseCrosshair());
    events.on(GameEvents.INVENTORY_CHANGED, (e) => this._renderInventory(e));
    events.on(GameEvents.PLAYER_DAMAGED, ({ amount, sourceName }) => {
      this._flashDamage();
      this.showMessage(`${sourceName ?? 'Algo'} te ha atacado (−${amount})`, 'danger');
    });
    events.on(GameEvents.ANIMAL_KILLED, ({ animal }) => this.showMessage(`Has abatido: ${animal.def.NAME}`));
    events.on(GameEvents.WORLD_EDGE_REACHED, () => this.showMessage('Has llegado al límite de MUNDO 0.'));
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

  _showTarget(target) {
    const el = this.el.prompt;
    this.el.crosshair.classList.toggle('has-target', !!target?.action);
    if (!target) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.replaceChildren();
    const name = document.createElement('span');
    name.className = 'target-name';
    name.textContent = target.label;
    el.appendChild(name);
    if (target.action) {
      const action = document.createElement('span');
      action.className = 'target-action';
      action.textContent = `[${target.key}] ${target.action}`;
      el.appendChild(action);
    }
    if (target.remaining) {
      const count = document.createElement('span');
      count.className = 'target-count';
      count.textContent = `(${target.remaining})`;
      el.appendChild(count);
    }
  }

  _renderInventory({ itemId, delta, items }) {
    const bar = this.el.inventory;
    bar.replaceChildren();
    for (const it of items) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.title = it.NAME;
      slot.innerHTML = `<span class="label"></span><span class="icon"></span><span class="count"></span>`;
      slot.querySelector('.label').textContent = it.NAME;
      slot.querySelector('.icon').textContent = it.ICON;
      slot.querySelector('.count').textContent = it.count;
      if (it.id === itemId && delta > 0) {
        slot.classList.add('bump');
        setTimeout(() => slot.classList.remove('bump'), 200);
      }
      bar.appendChild(slot);
    }
    if (delta > 0) {
      const def = this._items[itemId];
      this.showMessage(`+${delta} ${def.ICON} ${def.NAME}`, 'pickup');
    }
  }

  _pulseCrosshair() {
    const c = this.el.crosshair;
    c.classList.remove('pulse');
    void c.offsetWidth; // reinicia la animación CSS
    c.classList.add('pulse');
  }

  _flashDamage() {
    const f = this.el.damageFlash;
    f.classList.add('active');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('active')));
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
