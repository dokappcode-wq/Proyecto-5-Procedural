import { GameEvents } from '../core/GameEvents.js';

/**
 * SpaceHUD — interfaz del espacio (Fase 13): fundido al salir/entrar de la
 * atmósfera, etiquetas sobre MUNDO 0, las lunas y la nave, y un panel con el
 * cuerpo enfocado y el botón de regreso. Solo vista: pide cosas por eventos
 * (SPACE_FOCUS_REQUEST, SPACE_EXIT_REQUEST) y lee etiquetas de SpaceSystem.
 */
const BODIES = [
  { id: 'MUNDO_0', key: '1', label: 'MUNDO 0' },
  { id: 'MOON_A', key: '2', label: 'Luna A' },
  { id: 'MOON_B', key: '3', label: 'Luna B' },
  { id: 'SHIP', key: '4', label: 'Tu nave' },
];

export class SpaceHUD {
  constructor({ container, events, space, spaceNodeRequired }) {
    this.name = 'spaceHUD';
    this._space = space;
    this._locked = spaceNodeRequired;

    this.fade = document.createElement('div');
    this.fade.id = 'space-fade';
    this.fade.innerHTML = '<span></span>';
    document.body.appendChild(this.fade);

    this.labels = document.createElement('div');
    this.labels.id = 'space-labels';
    container.appendChild(this.labels);
    this._labelNodes = {};

    this.el = document.createElement('div');
    this.el.id = 'space-hud';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="space-title">🌌 Órbita de MUNDO 0</div>
      <div class="space-bodies"></div>
      <div class="space-info"></div>
      <button type="button" class="space-return"><kbd>T</kbd> Regresar a MUNDO 0</button>
      <div class="space-hint">Ratón: girar · Rueda: acercar/alejar · <kbd>1</kbd>–<kbd>4</kbd> enfocar · <kbd>Esc</kbd> soltar el ratón</div>`;
    const list = this.el.querySelector('.space-bodies');
    this._buttons = {};
    for (const b of BODIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<kbd>${b.key}</kbd> ${b.label}`;
      btn.addEventListener('click', () => events.emit(GameEvents.SPACE_FOCUS_REQUEST, { id: b.id }));
      list.appendChild(btn);
      this._buttons[b.id] = btn;
    }
    this._info = this.el.querySelector('.space-info');
    this.el.querySelector('.space-return').addEventListener('click', () => events.emit(GameEvents.SPACE_EXIT_REQUEST));
    container.appendChild(this.el);

    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state, fadeTime }) => this._onState(state, fadeTime));
    events.on(GameEvents.SPACE_FOCUS_CHANGED, () => this._renderInfo());
  }

  _onState(state, fadeTime) {
    const f = this.fade;
    f.style.transitionDuration = `${fadeTime}s`;
    const text = f.querySelector('span');
    if (state === 'ASCENDING') {
      text.textContent = 'Saliendo de la atmósfera…';
      f.classList.add('active');
    } else if (state === 'DESCENDING') {
      text.textContent = 'Entrando en la atmósfera de MUNDO 0…';
      f.classList.add('active');
    } else {
      f.classList.remove('active');
    }
    const inSpace = state === 'SPACE';
    this.el.classList.toggle('hidden', !inSpace);
    this.labels.classList.toggle('hidden', !inSpace);
    document.body.classList.toggle('in-space', state !== 'SURFACE');
    if (inSpace) this._renderInfo();
  }

  _renderInfo() {
    const info = this._space.getFocusInfo();
    for (const [id, btn] of Object.entries(this._buttons)) btn.classList.toggle('active', id === info.id);
    const fmt = (n) => n.toLocaleString('es-ES');
    if (info.home) {
      this._info.innerHTML = `<b>${info.name}</b> · radio ${fmt(info.radiusKm)} km<br>
        La isla del centro es la zona que has explorado. El resto del planeta aún no se puede visitar.`;
    } else if (info.ship) {
      this._info.innerHTML = '<b>Tu nave</b> en órbita baja sobre MUNDO 0.<br>Pulsa <kbd>T</kbd> para volver a bajar.';
    } else {
      this._info.innerHTML = `<b>${info.name}</b> · radio ${fmt(info.radiusKm)} km · a ${fmt(info.distanceKm)} km<br>
        Una vuelta cada ${Math.round(info.periodHours)} h · inclinación ${((info.inclination * 180) / Math.PI).toFixed(1)}°<br>
        ${this._locked ? '<span class="locked">🔒 No se puede visitar: falta el <b>nodo espacial</b>.</span>' : ''}`;
    }
  }

  update() {
    if (!this._space.active) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of this._space.getLabels(w, h)) {
      let node = this._labelNodes[l.id];
      if (!node) {
        node = document.createElement('div');
        node.className = 'space-label';
        this.labels.appendChild(node);
        this._labelNodes[l.id] = node;
      }
      node.textContent = l.name;
      node.style.display = l.visible ? 'block' : 'none';
      node.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -100%)`;
      node.classList.toggle('focused', l.focused);
    }
  }
}
