import { GameEvents } from '../core/GameEvents.js';

/**
 * StatusEffectsHUD — los estados por la comida junto a las barras: icono y tiempo que
 * queda (al pasar el ratón, qué hace). La indigestión, en rojo.
 */
export class StatusEffectsHUD {
  constructor({ container, events }) {
    this.el = document.createElement('div');
    this.el.className = 'status-effects';
    container?.appendChild(this.el);
    events.on(GameEvents.STATUS_EFFECTS_CHANGED, ({ effects }) => this._render(effects));
  }

  _render(effects) {
    this.el.replaceChildren(...effects.map((e) => {
      const chip = document.createElement('div');
      chip.className = `status-chip${e.bad ? ' bad' : ''}${e.left < 15 ? ' ending' : ''}`;
      chip.title = `${e.name}: ${e.desc}`;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = e.icon;
      const time = document.createElement('span');
      time.className = 'time';
      const s = Math.ceil(e.left);
      time.textContent = s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`;
      chip.append(icon, time);
      return chip;
    }));
  }
}
