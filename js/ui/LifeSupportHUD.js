import { GameEvents } from '../core/GameEvents.js';

/**
 * LifeSupportHUD — filas extra en el panel de estadísticas: aire (solo sin aire
 * o recuperándolo), oxígeno y batería del traje (solo con el traje puesto).
 * Solo vista.
 */
const ROWS = [
  { id: 'AIR', icon: '🫁', name: 'Aire' },
  { id: 'SUIT_O2', icon: '🧑‍🚀', name: 'O₂ traje' },
  { id: 'SUIT_BAT', icon: '🔋', name: 'Traje' },
  { id: 'GAS', icon: '💨', name: 'Jetpack' },
];

export class LifeSupportHUD {
  constructor({ container, events, lowRatio }) {
    this._low = lowRatio;
    this._rows = {};
    for (const r of ROWS) {
      const row = document.createElement('div');
      row.className = 'stat hidden';
      row.dataset.stat = r.id;
      row.dataset.level = 'ok';
      row.innerHTML = `<span class="stat-icon" aria-hidden="true">${r.icon}</span><span class="stat-name">${r.name}</span>
        <span class="stat-bar"><span class="stat-fill"></span></span><span class="stat-value">100</span>`;
      container.appendChild(row);
      this._rows[r.id] = { row, fill: row.querySelector('.stat-fill'), value: row.querySelector('.stat-value') };
    }
    events.on(GameEvents.LIFE_SUPPORT_CHANGED, (s) => this._render(s));
  }

  _render(s) {
    this._set('AIR', s.lungs, !s.breathable && !(s.powered && s.oxygen > 0) || s.lungs < 0.999);
    this._set('SUIT_O2', s.oxygen, s.wearing);
    this._set('SUIT_BAT', s.battery, s.wearing);
    this._set('GAS', s.gas, s.wearing);
  }

  _set(id, ratio, visible) {
    const r = this._rows[id];
    r.row.classList.toggle('hidden', !visible);
    if (!visible) return;
    r.fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    r.value.textContent = Math.ceil(ratio * 100);
    r.row.dataset.level = ratio <= this._low * 0.5 ? 'critical' : ratio <= this._low ? 'low' : 'ok';
  }
}
