import { GameEvents } from '../core/GameEvents.js';

/**
 * StarMapHUD — interfaz del mapa estelar 3D: etiquetas sobre MUNDO 0, las lunas
 * y la nave, y un panel con el cuerpo enfocado. Solo vista: pide cosas por eventos
 * (SPACE_FOCUS_REQUEST, STAR_MAP_REQUEST) y lee etiquetas de StarMap.
 */
const BODIES = [
  { id: 'MUNDO_0', key: '1', label: 'MUNDO 0' },
  { id: 'MOON_A', key: '2', label: 'Luna A' },
  { id: 'MOON_B', key: '3', label: 'Luna B' },
  { id: 'SHIP', key: '4', label: 'Tu nave' },
];
const PLACE = { MUNDO_0: 'en MUNDO 0', MOON_A: 'en la Luna A', MOON_B: 'en la Luna B', SPACE: 'en el espacio' };

export class StarMapHUD {
  constructor({ container, events, map, spaceNodeRequired }) {
    this.name = 'starMapHUD';
    this._map = map;
    this._locked = spaceNodeRequired;

    this.labels = document.createElement('div');
    this.labels.id = 'space-labels';
    this.labels.className = 'hidden';
    container.appendChild(this.labels);
    this._labelNodes = {};

    this.el = document.createElement('div');
    this.el.id = 'space-hud';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="space-title">🌌 Mapa estelar · sistema de MUNDO 0</div>
      <div class="space-bodies"></div>
      <div class="space-info"></div>
      <button type="button" class="space-return"><kbd>M</kbd> Cerrar mapa</button>
      <div class="space-hint">Ratón: girar · Rueda: acercar/alejar · <kbd>1</kbd>–<kbd>4</kbd> enfocar · <kbd>Esc</kbd> cerrar</div>`;
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
    this.el.querySelector('.space-return').addEventListener('click', () => events.emit(GameEvents.STAR_MAP_REQUEST, { open: false }));
    container.appendChild(this.el);

    events.on(GameEvents.STAR_MAP_TOGGLED, ({ open }) => {
      this.el.classList.toggle('hidden', !open);
      this.labels.classList.toggle('hidden', !open);
      document.body.classList.toggle('star-map', open);
      if (open) this._renderInfo();
    });
    events.on(GameEvents.SPACE_FOCUS_CHANGED, () => this._renderInfo());
  }

  _renderInfo() {
    const info = this._map.getFocusInfo();
    for (const [id, btn] of Object.entries(this._buttons)) btn.classList.toggle('active', id === info.id);
    const fmt = (n) => Math.round(n).toLocaleString('es-ES');
    if (info.home) {
      this._info.innerHTML = `<b>${info.name}</b> · radio ${fmt(info.radiusKm)} km<br>
        La isla del ecuador es la zona que conoces. El resto del planeta aún no se puede visitar.`;
    } else if (info.ship) {
      const where = PLACE[info.location?.body] ?? '';
      this._info.innerHTML = `<b>Tu nave</b> ${where}.`;
    } else {
      this._info.innerHTML = `<b>${info.name}</b> · radio ${fmt(info.radiusKm)} km · a ${fmt(info.distanceKm)} km<br>
        Una vuelta cada ${Math.round(info.periodHours)} h · inclinación ${((info.inclination * 180) / Math.PI).toFixed(1)}°`;
    }
  }

  update() {
    if (!this._map.active) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of this._map.getLabels(w, h)) {
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
