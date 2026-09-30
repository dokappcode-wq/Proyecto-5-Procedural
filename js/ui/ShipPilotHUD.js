import { GameEvents } from '../core/GameEvents.js';

/**
 * ShipPilotHUD — panel de mandos que aparece al sentarse en el asiento del piloto.
 *
 * Muestra el estado de la nave (SHIP_STATE_CHANGED) y botones con su tecla:
 * despegar/aterrizar, compuerta, recoger/sacar patas, adelante, atrás, arriba,
 * abajo, girar y levantarse (en el aire la nave se queda flotando). Los botones emiten SHIP_COMMAND y, los de
 * movimiento, SHIP_CONTROL_HOLD mientras se mantienen pulsados. Con el ratón
 * capturado se usan las teclas; con Esc se libera el ratón para pulsar botones.
 */
const FLIGHT_LABELS = {
  LANDED: 'En tierra',
  TAKING_OFF: 'Despegando…',
  FLYING: 'En vuelo',
  LANDING: 'Aterrizando…',
};

export class ShipPilotHUD {
  constructor({ container, events, shipName }) {
    this.name = 'shipPilotHUD';
    this._events = events;
    this.el = document.createElement('div');
    this.el.id = 'ship-hud';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="ship-hud-title">🕹️ Sistema de vuelo · <span class="ship-name"></span></div>
      <div class="ship-telemetry">
        <span data-t="flight"></span><span data-t="alt"></span><span data-t="speed"></span>
        <span data-t="battery"></span><span data-t="legs"></span><span data-t="hatch"></span>
      </div>
      <div class="ship-controls">
        <button type="button" data-cmd="TAKEOFF_OR_LAND"><kbd>T</kbd> <span>Despegar</span></button>
        <button type="button" data-cmd="TOGGLE_HATCH"><kbd>G</kbd> <span>Abrir compuerta</span></button>
        <button type="button" data-cmd="RETRACT_LEGS"><kbd>L</kbd> Recoger patas</button>
        <button type="button" data-cmd="DEPLOY_LEGS"><kbd>L</kbd> Sacar patas</button>
        <button type="button" data-hold="FORWARD"><kbd>W</kbd> Adelante</button>
        <button type="button" data-hold="BACKWARD"><kbd>S</kbd> Atrás</button>
        <button type="button" data-hold="UP"><kbd>Espacio</kbd> Arriba</button>
        <button type="button" data-hold="DOWN"><kbd>C</kbd> Abajo</button>
        <button type="button" data-hold="LEFT"><kbd>A</kbd> Girar izq.</button>
        <button type="button" data-hold="RIGHT"><kbd>D</kbd> Girar dcha.</button>
        <button type="button" data-cmd="STAND_UP" class="wide"><kbd>E</kbd> Levantarse</button>
      </div>
      <div class="ship-hint">Ratón: girar la cámara · Rueda: distancia · <kbd>Shift</kbd> turbo · <kbd>Esc</kbd> soltar el ratón para usar los botones</div>`;
    this.el.querySelector('.ship-name').textContent = shipName;
    container.appendChild(this.el);

    this._t = {};
    this.el.querySelectorAll('[data-t]').forEach((n) => (this._t[n.dataset.t] = n));
    this._buttons = {};
    this.el.querySelectorAll('[data-cmd]').forEach((b) => {
      this._buttons[b.dataset.cmd] = b;
      b.addEventListener('click', () => events.emit(GameEvents.SHIP_COMMAND, { command: b.dataset.cmd }));
    });
    this.el.querySelectorAll('[data-hold]').forEach((b) => {
      const set = (active) => events.emit(GameEvents.SHIP_CONTROL_HOLD, { control: b.dataset.hold, active });
      b.addEventListener('pointerdown', (e) => {
        b.setPointerCapture?.(e.pointerId);
        set(true);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    });

    events.on(GameEvents.SHIP_PILOT_CHANGED, ({ piloting }) => this.el.classList.toggle('hidden', !piloting));
    events.on(GameEvents.SHIP_STATE_CHANGED, (t) => this._render(t));
  }

  _render(t) {
    if (!t.piloting) return;
    const landed = t.flight === 'LANDED';
    this._t.flight.textContent = FLIGHT_LABELS[t.flight] ?? t.flight;
    this._t.flight.dataset.state = t.flight;
    this._t.alt.textContent = `Altura ${t.altitude.toFixed(1)} m`;
    this._t.speed.textContent = `${Math.round(t.speed * 3.6)} km/h`;
    this._t.battery.textContent = `🔋 ${Math.round(t.charge * 100)} %`;
    this._t.battery.classList.toggle('low', t.charge < 0.15);
    this._t.legs.textContent = t.legs === 'DEPLOYED' ? 'Patas fuera' : 'Patas recogidas';
    this._t.hatch.textContent = t.hatch === 'OPEN' ? 'Compuerta abierta' : 'Compuerta cerrada';

    const b = this._buttons;
    b.TAKEOFF_OR_LAND.querySelector('span').textContent = landed ? 'Despegar' : 'Aterrizar';
    b.TAKEOFF_OR_LAND.disabled = t.flight === 'LANDING' || t.flight === 'TAKING_OFF';
    b.TOGGLE_HATCH.querySelector('span').textContent = t.hatch === 'OPEN' ? 'Cerrar compuerta' : 'Abrir compuerta';
    b.TOGGLE_HATCH.disabled = t.flight === 'TAKING_OFF';
    b.RETRACT_LEGS.disabled = landed || t.legs !== 'DEPLOYED';
    b.DEPLOY_LEGS.disabled = t.legs === 'DEPLOYED';
    b.STAND_UP.disabled = t.flight === 'TAKING_OFF' || t.flight === 'LANDING';
    this.el.querySelectorAll('[data-hold]').forEach((btn) => (btn.disabled = t.flight !== 'FLYING'));
  }
}
