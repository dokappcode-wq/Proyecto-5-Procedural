import { GameEvents } from '../core/GameEvents.js';
import { withPrep } from '../systemdata/SolarSystem.js';

/**
 * StarMapHUD — interfaz del mapa estelar 3D: etiquetas sobre el planeta, las
 * lunas y la nave, y un panel con el cuerpo enfocado. Solo vista: pide cosas por
 * eventos (SPACE_FOCUS_REQUEST, STAR_MAP_REQUEST) y lee etiquetas de StarMap.
 * Los nombres vienen del sistema solar (pueden ser importados): siempre como texto.
 */
export class StarMapHUD {
  constructor({ container, events, map, system, spaceNodeRequired }) {
    this.name = 'starMapHUD';
    this._map = map;
    this._system = system;

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
      <div class="space-title">🌌 Mapa estelar · <span class="space-system"></span></div>
      <div class="space-bodies"></div>
      <div class="space-info"></div>
      <button type="button" class="space-return"><kbd>M</kbd> Cerrar mapa</button>
      <div class="space-hint">Ratón: girar · Rueda: acercar/alejar · <kbd>1</kbd>–<kbd class="space-lastkey"></kbd> enfocar · <kbd>Esc</kbd> cerrar</div>`;
    this.el.querySelector('.space-system').textContent = system.name;
    this._list = this.el.querySelector('.space-bodies');
    this._events = events;
    this._buttons = {};
    this._info = this.el.querySelector('.space-info');
    this.el.querySelector('.space-return').addEventListener('click', () => events.emit(GameEvents.STAR_MAP_REQUEST, { open: false }));
    container.appendChild(this.el);

    events.on(GameEvents.STAR_MAP_TOGGLED, ({ open }) => {
      this.el.classList.toggle('hidden', !open);
      this.labels.classList.toggle('hidden', !open);
      document.body.classList.toggle('star-map', open);
      if (open) {
        this._renderButtons();
        this._renderInfo();
      }
    });
    events.on(GameEvents.SPACE_FOCUS_CHANGED, () => this._renderInfo());
  }

  /** Un botón por cuerpo del grupo que muestra el mapa (planeta, lunas) y la nave. */
  _renderButtons() {
    const keys = this._map.focusKeys;
    this._buttons = {};
    this._list.replaceChildren(...keys.map((id, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const kbd = document.createElement('kbd');
      kbd.textContent = String(i + 1);
      btn.append(kbd, ` ${id === 'SHIP' ? 'Tu nave' : this._system.nameOf(id)}`);
      btn.addEventListener('click', () => this._events.emit(GameEvents.SPACE_FOCUS_REQUEST, { id }));
      this._buttons[id] = btn;
      return btn;
    }));
    this.el.querySelector('.space-lastkey').textContent = String(keys.length);
  }

  _renderInfo() {
    const info = this._map.getFocusInfo();
    for (const [id, btn] of Object.entries(this._buttons)) btn.classList.toggle('active', id === info.id);
    const fmt = (n) => Math.round(n).toLocaleString('es-ES');
    if (info.home) {
      this._setInfo(info.name, ` · radio ${fmt(info.radiusKm)} km`,
        'La región del ecuador es la zona que conoces. El resto del planeta aún no se puede visitar.');
    } else if (info.ship) {
      const body = info.location?.body;
      const where = body === 'SPACE' ? 'en el espacio' : body ? withPrep('en', this._system.nameOf(body)) : '';
      this._setInfo('Tu nave', ` ${where}.`);
    } else {
      this._setInfo(info.name, ` · radio ${fmt(info.radiusKm)} km · a ${fmt(info.distanceKm)} km`,
        `Una vuelta cada ${Math.round(info.periodHours)} h · inclinación ${((info.inclination * 180) / Math.PI).toFixed(1)}°`);
    }
  }

  /** Título en negrita + texto + segunda línea (todo como texto, nunca HTML). */
  _setInfo(title, rest, line2 = null) {
    const b = document.createElement('b');
    b.textContent = title;
    this._info.replaceChildren(b, rest);
    if (line2) this._info.append(document.createElement('br'), line2);
  }

  update() {
    if (!this._map.active) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set();
    for (const l of this._map.getLabels(w, h)) {
      seen.add(l.id);
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
    for (const [id, node] of Object.entries(this._labelNodes)) if (!seen.has(id)) node.style.display = 'none';
  }
}
