import { GameEvents } from '../core/GameEvents.js';

/**
 * SpaceHUD — interfaz del vuelo por el espacio: fundido al salir/entrar de una
 * atmósfera, panel de navegación (velocidad, distancia a cada cuerpo, aviso de
 * aterrizaje, batería) y etiquetas sobre MUNDO 0 y las lunas. Solo vista.
 */
export class SpaceHUD {
  constructor({ container, events, travel }) {
    this.name = 'spaceHUD';
    this._travel = travel;
    this._dist = {};

    this.fade = document.createElement('div');
    this.fade.id = 'space-fade';
    this.fade.innerHTML = '<span></span>';
    document.body.appendChild(this.fade);

    this.labels = document.createElement('div');
    this.labels.id = 'nav-labels';
    this.labels.className = 'hidden';
    container.appendChild(this.labels);
    this._labelNodes = {};

    this.el = document.createElement('div');
    this.el.id = 'nav-hud';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="nav-title">🌌 Espacio · sistema de MUNDO 0</div>
      <div class="nav-speed"></div>
      <div class="nav-auto"></div>
      <div class="nav-bodies"></div>
      <div class="nav-land hidden"></div>
      <div class="nav-warn hidden"></div>`;
    this._speed = this.el.querySelector('.nav-speed');
    this._auto = this.el.querySelector('.nav-auto');
    this._bodies = this.el.querySelector('.nav-bodies');
    this._land = this.el.querySelector('.nav-land');
    this._warn = this.el.querySelector('.nav-warn');
    container.appendChild(this.el);

    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state, previous, fadeTime }) => this._onState(state, previous, fadeTime));
    events.on(GameEvents.SPACE_NAV_UPDATE, (n) => this._render(n));
  }

  _onState(state, previous, fadeTime) {
    const f = this.fade;
    f.style.transitionDuration = `${fadeTime}s`;
    const text = f.querySelector('span');
    if (state === 'ASCENDING') {
      text.textContent = 'Saliendo de la atmósfera…';
      f.classList.add('active');
    } else if (state === 'DESCENDING') {
      text.textContent = 'Aproximación y descenso…';
      f.classList.add('active');
    } else {
      f.classList.remove('active');
    }
    const inSpace = state === 'SPACE';
    this.el.classList.toggle('hidden', !inSpace);
    this.labels.classList.toggle('hidden', !inSpace);
    document.body.classList.toggle('in-space', inSpace);
    void previous;
  }

  _render(n) {
    const kmh = Math.abs(n.speed);
    this._speed.textContent = `Velocidad ${kmh < 10 ? kmh.toFixed(1) : Math.round(kmh)} km/s · 🔋 ${Math.round(n.charge * 100)} %${n.powered ? '' : ' · SIN BATERÍA'}`;
    this._speed.classList.toggle('low', !n.powered || n.charge < 0.15);
    const names = { MUNDO_0: 'MUNDO 0', MOON_A: 'Luna A', MOON_B: 'Luna B' };
    this._auto.innerHTML = n.autopilot
      ? `🧭 Rumbo automático: <b>${names[n.autopilot] ?? 'meteorito'}</b> (A/D/Espacio/C lo cancelan)`
      : `🧭 Rumbo: <kbd>1</kbd> MUNDO 0 · <kbd>2</kbd> Luna A · <kbd>3</kbd> Luna B${n.meteor ? ' · <kbd>4</kbd> meteorito' : ''}`;
    const fmt = (km) => (km >= 10000 ? `${(km / 1000).toFixed(1)} mil km` : `${Math.round(km).toLocaleString('es-ES')} km`);
    this._bodies.innerHTML = n.bodies.map((b) => `<div><span>${b.name}</span><span>${fmt(Math.max(0, b.altitude))}</span></div>`).join('');
    for (const b of n.bodies) this._dist[b.id] = b.altitude;
    this._land.classList.toggle('hidden', !n.landable);
    if (n.landable) this._land.innerHTML = `<kbd>T</kbd> ${n.landable.id === 'MUNDO_0' ? 'Entrar en la atmósfera de MUNDO 0' : `Aterrizar en la ${n.landable.name}`}`;
    this._warn.classList.toggle('hidden', !n.zoneWarning);
    this._warn.textContent = 'Te acercas al límite del sistema.';
  }

  /** Paseo espacial: marca la nave en pantalla con su distancia. */
  setEVA(eva, ship, camera) {
    this._eva = eva;
    this._ship = ship;
    this._camera = camera;
  }

  update() {
    if (!this._travel.inSpace) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const labels = this._travel.bodyScreenPositions(w, h);
    if (this._eva?.active) {
      const s = this._ship.ship;
      const v = { x: s.x, y: s.y + 4, z: s.z };
      const p = this._project(v, w, h);
      labels.push({ id: 'SHIP', text: `🚀 Nave · ${Math.round(this._eva.distanceToShip())} m`, ...p });
    }
    const seen = new Set();
    for (const l of labels) {
      seen.add(l.id);
      let node = this._labelNodes[l.id];
      if (!node) {
        node = document.createElement('div');
        node.className = 'space-label';
        this.labels.appendChild(node);
        this._labelNodes[l.id] = node;
      }
      const d = this._dist[l.id];
      node.textContent = l.text ?? (d === undefined ? l.name : `${l.name} · ${Math.round(Math.max(0, d)).toLocaleString('es-ES')} km`);
      node.style.display = l.visible ? 'block' : 'none';
      node.style.transform = `translate(${l.x}px, ${l.y}px) translate(-50%, -100%)`;
    }
    for (const [id, node] of Object.entries(this._labelNodes)) if (!seen.has(id)) node.style.display = 'none';
  }

  _project(v, w, h) {
    const cam = this._camera;
    const vec = { x: v.x, y: v.y, z: v.z };
    // Proyección sin crear objetos de Three.js (vector temporal de la cámara).
    this._tmp ??= cam.position.clone();
    this._tmp.set(vec.x, vec.y, vec.z).project(cam);
    return {
      x: (this._tmp.x * 0.5 + 0.5) * w,
      y: (-this._tmp.y * 0.5 + 0.5) * h,
      visible: this._tmp.z < 1 && Math.abs(this._tmp.x) < 1.1 && Math.abs(this._tmp.y) < 1.1,
    };
  }
}
