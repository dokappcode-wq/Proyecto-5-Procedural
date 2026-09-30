import { GameEvents } from '../core/GameEvents.js';

const MODE_LABELS = { FIRST_PERSON: '1ª persona', THIRD_PERSON: '3ª persona' };

/**
 * UIManager — HUD provisional en DOM.
 *
 * Solo MUESTRA información: reacciona a eventos del EventBus y a consultas de
 * solo lectura. No modifica el estado de otros sistemas (excepto pedir el
 * pointer lock al pulsar "Entrar", que es interacción de interfaz).
 *
 * Barras de Vida/Hambre/Sed/Energía (PLAYER_STAT_CHANGED), avisos al cruzar
 * umbrales (PLAYER_STAT_LEVEL) y pantalla de muerte. Los efectos de
 * temperatura (Fase 10) se añadirán aquí, también alimentados por eventos.
 */
const STAT_UI = [
  { id: 'HEALTH', icon: '❤️', name: 'Vida' },
  { id: 'HUNGER', icon: '🍗', name: 'Hambre' },
  { id: 'THIRST', icon: '💧', name: 'Sed' },
  { id: 'ENERGY', icon: '⚡', name: 'Energía' },
];

const STAT_WARNINGS = {
  HEALTH: { low: 'Estás herido.', critical: 'Estás a punto de morir.' },
  HUNGER: { low: 'Tienes hambre.', critical: 'Te mueres de hambre.' },
  THIRST: { low: 'Tienes sed.', critical: 'Te estás deshidratando.' },
  ENERGY: { low: 'Estás cansado.', critical: 'Estás agotado: no puedes correr.' },
};

const LEVEL_ORDER = { ok: 0, low: 1, critical: 2 };
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
      stats: $('stats'),
      deathScreen: $('death-screen'),
      deathCause: $('death-cause'),
      respawnButton: $('respawn-button'),
    };
    this._statRows = this._buildStatBars();
    this._respawnTimer = 0;
    this.el.respawnButton.addEventListener('click', () => events.emit(GameEvents.PLAYER_RESPAWN_REQUEST));

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
    events.on(GameEvents.PLAYER_DAMAGED, ({ amount, source, sourceName }) => {
      if (!this.el.deathScreen.classList.contains('hidden')) return; // muerto: sin efectos
      this._flashDamage();
      const n = Math.round(amount);
      if (sourceName) this.showMessage(`${sourceName} te ha atacado (−${n})`, 'danger');
      else if (source === 'FALL') this.showMessage(`Te has hecho daño en la caída (−${n})`, 'danger');
    });
    events.on(GameEvents.PLAYER_STAT_CHANGED, (e) => this._updateStat(e));
    events.on(GameEvents.PLAYER_STAT_LEVEL, ({ stat, level, previous, value }) => {
      // Solo se avisa cuando la situación empeora (y no al morir: ya lo dice la pantalla de muerte).
      if (stat === 'HEALTH' && value <= 0) return;
      if (LEVEL_ORDER[level] > LEVEL_ORDER[previous]) this.showMessage(STAT_WARNINGS[stat][level], 'danger');
    });
    events.on(GameEvents.PLAYER_DRANK, () => this.showMessage('Bebes agua.', 'pickup'));
    events.on(GameEvents.PLAYER_DIED, ({ causeName, respawnDelay }) => {
      this.el.deathCause.textContent = `Causa: ${causeName}`;
      this.el.deathScreen.classList.remove('hidden');
      this._respawnTimer = respawnDelay;
      this._input.exitPointerLock();
      this._updateRespawnButton();
    });
    events.on(GameEvents.PLAYER_RESPAWNED, () => {
      this.el.deathScreen.classList.add('hidden');
      this.showMessage('Has reaparecido.');
      this._input.requestPointerLock();
    });
    events.on(GameEvents.ANIMAL_KILLED, ({ animal }) => this.showMessage(`Has abatido: ${animal.def.NAME}`));
    events.on(GameEvents.WORLD_EDGE_REACHED, () => this.showMessage('Has llegado al límite de MUNDO 0.'));
  }

  setInitialCameraMode(mode) {
    this._setCameraLabel(mode);
  }

  update(dt) {
    if (this._input.wasPressed('TOGGLE_HELP')) this.el.help.classList.toggle('collapsed');
    if (this._respawnTimer > 0) {
      this._respawnTimer = Math.max(0, this._respawnTimer - dt);
      this._updateRespawnButton();
    }
  }

  // ---- Estadísticas -----------------------------------------------------------

  _buildStatBars() {
    const rows = {};
    for (const s of STAT_UI) {
      const row = document.createElement('div');
      row.className = 'stat';
      row.dataset.level = 'ok';
      row.innerHTML = `<span class="stat-icon" aria-hidden="true"></span><span class="stat-name"></span>
        <span class="stat-bar"><span class="stat-fill"></span></span><span class="stat-value">100</span>`;
      row.querySelector('.stat-icon').textContent = s.icon;
      row.querySelector('.stat-name').textContent = s.name;
      row.dataset.stat = s.id;
      this.el.stats.appendChild(row);
      rows[s.id] = { row, fill: row.querySelector('.stat-fill'), value: row.querySelector('.stat-value') };
    }
    return rows;
  }

  _updateStat({ stat, value, ratio, level }) {
    const r = this._statRows[stat];
    if (!r) return;
    r.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    r.value.textContent = Math.ceil(value);
    r.row.dataset.level = level;
  }

  _updateRespawnButton() {
    const b = this.el.respawnButton;
    const wait = Math.ceil(this._respawnTimer);
    b.disabled = wait > 0;
    b.textContent = wait > 0 ? `Reaparecer (${wait})` : 'Reaparecer';
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
