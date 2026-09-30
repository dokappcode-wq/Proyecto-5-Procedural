import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * PodPanel — elegir el destino de la cápsula de escape (E sobre una cápsula).
 */
export class PodPanel extends ModalPanel {
  constructor({ container, input, events, escape }) {
    super({ id: 'pod-panel', title: '🛟 Cápsula de escape', container, input, events });
    this._escape = escape;
    events.on(GameEvents.ESCAPE_POD_REQUEST, () => this.setOpen(true));
  }

  render() {
    const esc = this._escape;
    const list = esc.destinations();
    const emergency = list.some((d) => d.reason?.startsWith('Sin energía'));
    const fmt = (km) => `${Math.round(km).toLocaleString('es-ES')} km`;
    this.body.innerHTML = `
      ${emergency ? '<p class="pod-alert">⚠️ Salto galáctico fallido. Evacuación de emergencia a MUNDO 0.</p>' : `<p class="muted">Cápsulas disponibles: ${esc.podsLeft}. Alcance: ${fmt(esc._cfg.POD_RANGE_KM)}. La IA traerá la nave detrás.</p>`}
      <div class="pod-list"></div>`;
    const box = this.body.querySelector('.pod-list');
    for (const d of list) {
      const row = document.createElement('div');
      row.className = 'pod-row';
      row.innerHTML = `<div><b></b><span class="muted"></span></div><button type="button"></button>`;
      row.querySelector('b').textContent = d.name;
      row.querySelector('.muted').textContent = ` · ${fmt(d.distanceKm)}${d.reason ? ` · ${d.reason}` : ''}`;
      const b = row.querySelector('button');
      b.textContent = emergency && d.reachable ? '🚨 Evacuar' : '🚀 Lanzar';
      b.disabled = !d.reachable;
      b.addEventListener('click', () => {
        if (esc.launch(d.id)) this.setOpen(false);
      });
      box.appendChild(row);
    }
  }
}

/**
 * EscapeOverlay — fundido del viaje en cápsula, alarma roja tras el salto fallido
 * y pantalla de fin de la demo.
 */
export class EscapeOverlay {
  constructor({ events, input }) {
    this._events = events;
    this._input = input;
    this.fade = document.createElement('div');
    this.fade.id = 'pod-fade';
    this.fade.innerHTML = '<span></span>';
    document.body.appendChild(this.fade);

    this.alarm = document.createElement('div');
    this.alarm.id = 'alarm-overlay';
    document.body.appendChild(this.alarm);

    this.end = document.createElement('div');
    this.end.id = 'demo-end';
    this.end.className = 'hidden';
    this.end.setAttribute('role', 'dialog');
    this.end.innerHTML = `
      <div class="demo-card">
        <h1>MUNDO 0</h1>
        <h2>Fin de la demo</h2>
        <p class="demo-text"></p>
        <ul class="demo-stats"></ul>
        <button type="button">Seguir explorando MUNDO 0</button>
      </div>`;
    document.body.appendChild(this.end);
    this.end.querySelector('button').addEventListener('click', () => this._close());

    events.on(GameEvents.ESCAPE_POD_LAUNCH, ({ name, emergency, time }) => {
      this.fade.style.transitionDuration = `${Math.min(1, time / 3)}s`;
      this.fade.querySelector('span').textContent = emergency ? `Evacuación de emergencia… rumbo a ${name}` : `Cápsula de escape en camino a ${name}…`;
      this.fade.classList.add('active');
    });
    events.on(GameEvents.ESCAPE_POD_ARRIVED, () => this.fade.classList.remove('active'));
    events.on(GameEvents.SHIP_CRIPPLED, ({ crippled }) => document.body.classList.toggle('ship-alarm', crippled));
    events.on(GameEvents.BODY_CHANGED, () => document.body.classList.remove('ship-alarm'));
    events.on(GameEvents.DEMO_END, ({ stats }) => this._open(stats));
  }

  _open(stats) {
    this._input.setBlocked('demo-end', true);
    this._input.exitPointerLock();
    this.end.querySelector('.demo-text').textContent =
      'El nodo galáctico no aguantó el salto y la nave quedó a la deriva en el borde del sistema. ' +
      'Has vuelto a MUNDO 0 en una cápsula de escape. La nave, con su nodo espacial, te espera en la zona de aterrizaje.';
    const ul = this.end.querySelector('.demo-stats');
    ul.replaceChildren();
    for (const [k, v] of stats) {
      const li = document.createElement('li');
      li.innerHTML = '<span></span><b></b>';
      li.querySelector('span').textContent = k;
      li.querySelector('b').textContent = v;
      ul.appendChild(li);
    }
    this.end.classList.remove('hidden');
  }

  _close() {
    this.end.classList.add('hidden');
    this._input.setBlocked('demo-end', false);
    this._input.requestPointerLock();
    this._events.emit(GameEvents.DEMO_RESTART, {});
  }
}
