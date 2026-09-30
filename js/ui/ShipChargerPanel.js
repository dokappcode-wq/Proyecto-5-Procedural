import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * ShipChargerPanel — Tecnología 3 de la nave: el puesto de carga.
 *
 * Muestra las ranuras con sus "baterías plank pequeñas" y su carga, y pide
 * retirar/colocar baterías con SHIP_BATTERY_REQUEST (lo resuelve ShipSystem).
 * Solo vista.
 */
export class ShipChargerPanel extends ModalPanel {
  constructor({ container, input, events, ship, inventory, items, config }) {
    super({ id: 'ship-charger-panel', title: '🔌 Puesto de carga', container, input, events });
    this._ship = ship;
    this._inventory = inventory;
    this._items = items;
    this._cfg = config;
    events.on(GameEvents.SHIP_BATTERIES_CHANGED, () => this.isOpen && this.render());
    events.on(GameEvents.INVENTORY_CHANGED, () => this.isOpen && this.render());
  }

  render() {
    const B = this._cfg.BATTERIES;
    const snap = this._ship.batteries.snapshot();
    const full = this._inventory.getItemCount(B.ITEM);
    const empty = this._inventory.getItemCount(B.EMPTY_ITEM);
    const hover = snap.total / B.HOVER_DRAIN / 60;
    const cruise = snap.total / (B.HOVER_DRAIN + B.THRUST_DRAIN) / 60;
    const item = this._items[B.ITEM];

    this.body.replaceChildren();
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = `Combustible de la nave: ${item.ICON} ${item.NAME.toLowerCase()}s (nave pequeña). La nave consume la carga mientras está en el aire.`;
    const grid = document.createElement('div');
    grid.className = 'battery-grid';
    snap.slots.forEach((b, i) => {
      const card = document.createElement('div');
      card.className = `battery-slot${b ? '' : ' empty'}`;
      const pct = b ? Math.round(b.ratio * 100) : 0;
      card.innerHTML = `
        <div class="battery-name">Ranura ${i + 1}</div>
        <div class="battery-icon">${b ? (b.ratio > 0.01 ? '🔋' : '🪫') : '▫️'}</div>
        <div class="battery-bar"><span style="width:${pct}%"></span></div>
        <div class="battery-value">${b ? `${pct} %` : 'vacía'}</div>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      if (b) {
        btn.textContent = 'Retirar';
        btn.disabled = b.ratio > 0.005 && b.ratio < 0.995;
        if (btn.disabled) btn.title = 'Solo se retiran baterías llenas o vacías';
        btn.addEventListener('click', () => this._events.emit(GameEvents.SHIP_BATTERY_REQUEST, { slot: i, action: 'REMOVE' }));
      } else {
        btn.textContent = 'Colocar batería';
        btn.disabled = full + empty === 0;
        btn.addEventListener('click', () => this._events.emit(GameEvents.SHIP_BATTERY_REQUEST, { slot: i, action: 'INSERT' }));
      }
      card.appendChild(btn);
      grid.appendChild(card);
    });
    const summary = document.createElement('div');
    summary.className = 'battery-summary';
    summary.innerHTML = `
      <div><b>Carga total:</b> ${Math.round(snap.total)} / ${snap.capacity} (${Math.round((snap.total / snap.capacity) * 100)} %)</div>
      <div><b>Autonomía:</b> ~${Math.floor(hover)} min en el aire parada · ~${Math.floor(cruise)} min a toda velocidad</div>
      <div class="muted">En tu inventario: ${full} llena(s) · ${empty} vacía(s)</div>`;
    this.body.append(intro, grid, summary);
  }
}
