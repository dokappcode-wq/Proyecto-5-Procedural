import { GameEvents } from '../core/GameEvents.js';

/**
 * ShipWatchHUD — pantalla del "reloj de la nave" (se coge en la mesa del laboratorio).
 *
 * Al usar el reloj (SHIP_WATCH_TOGGLE) se muestra/oculta: hora del día, distancia
 * a la nave, una flecha que apunta hacia ella (relativa a donde mira el jugador),
 * sus coordenadas, si está en tierra o flotando, su altura y la batería.
 * Solo vista: lee jugador, nave y reloj (consultas de solo lectura).
 */
const STATE_TEXT = {
  LANDED: 'en tierra',
  TAKING_OFF: 'despegando',
  FLYING: 'en el aire',
  LANDING: 'aterrizando',
};

export class ShipWatchHUD {
  constructor({ container, events, player, ship, time, inventory, watchItem }) {
    this.name = 'shipWatchHUD';
    this._player = player;
    this._ship = ship;
    this._time = time;
    this._inventory = inventory;
    this._item = watchItem;
    this.visible = false;
    this._timer = 0;

    this.el = document.createElement('div');
    this.el.id = 'ship-watch';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="watch-face">
        <div class="watch-time"></div>
        <svg class="watch-arrow" viewBox="-10 -10 20 20" width="22" height="22" aria-hidden="true">
          <path d="M0,-9 L6.5,7 L0,3.5 L-6.5,7 Z" fill="#ffb070" stroke="#3a1c08" stroke-width="1"/>
        </svg>
        <div class="watch-dist"></div>
      </div>
      <div class="watch-info"></div>`;
    this._timeEl = this.el.querySelector('.watch-time');
    this._arrow = this.el.querySelector('.watch-arrow');
    this._dist = this.el.querySelector('.watch-dist');
    this._info = this.el.querySelector('.watch-info');
    container.appendChild(this.el);

    events.on(GameEvents.SHIP_WATCH_TOGGLE, () => this.setVisible(!this.visible));
    events.on(GameEvents.INVENTORY_CHANGED, () => {
      if (this.visible && !this._inventory.hasItem(this._item, 1)) this.setVisible(false);
    });
  }

  setVisible(visible) {
    this.visible = visible && this._inventory.hasItem(this._item, 1);
    this.el.classList.toggle('hidden', !this.visible);
    if (this.visible) this._render();
  }

  update(dt) {
    if (!this.visible) return;
    this._timer -= dt;
    if (this._timer > 0) return;
    this._timer = 0.1;
    this._render();
  }

  _render() {
    const p = this._player.position;
    const t = this._ship.getTelemetry();
    const dx = t.position.x - p.x;
    const dz = t.position.z - p.z;
    const dist = Math.hypot(dx, dz);
    this._timeEl.textContent = this._time.clockText;
    if (t.aboard) {
      this._arrow.style.visibility = 'hidden';
      this._dist.textContent = 'a bordo';
    } else {
      // yaw que miraría hacia la nave, relativo a la mirada del jugador (0 = de frente).
      const rel = Math.atan2(-dx, -dz) - this._player.yaw;
      this._arrow.style.visibility = 'visible';
      this._arrow.style.transform = `rotate(${-rel}rad)`;
      this._dist.textContent = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
    }
    const state = t.autopilot && t.flight === 'FLYING' ? 'flotando sin piloto' : STATE_TEXT[t.flight] ?? t.flight;
    const alt = t.flight === 'LANDED' ? '' : ` · ${Math.round(t.altitude)} m de altura`;
    this._info.textContent = `🚀 Nave ${state}${alt} · (${Math.round(t.position.x)}, ${Math.round(t.position.z)}) · 🔋 ${Math.round(t.charge * 100)} %`;
  }
}
