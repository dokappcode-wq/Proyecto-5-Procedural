import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';
import { AI_TOPICS } from '../ship/ShipAI.js';

/**
 * AIPanel — hablar con la IA de la nave (E sobre el nodo de IA): ponerle nombre,
 * preguntarle por temas y ver sus últimos mensajes. Solo vista + órdenes a ShipAI.
 */
export class AIPanel extends ModalPanel {
  constructor({ container, input, events, ai }) {
    super({ id: 'ai-panel', title: '🤖 IA de la nave', container, input, events });
    this._ai = ai;
    this.body.innerHTML = `
      <form class="ai-name">
        <label>Nombre de la IA <input type="text" maxlength="20" autocomplete="off" spellcheck="false"></label>
        <button type="submit">Poner nombre</button>
      </form>
      <div class="ai-topics"></div>
      <div class="ai-log" aria-live="polite"></div>`;
    this._nameField = this.body.querySelector('.ai-name input');
    this._log = this.body.querySelector('.ai-log');
    this.body.querySelector('.ai-name').addEventListener('submit', (e) => {
      e.preventDefault();
      if (ai.setName(this._nameField.value)) this.render();
    });
    const topics = this.body.querySelector('.ai-topics');
    for (const t of AI_TOPICS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t.label;
      b.addEventListener('click', () => ai.answer(t.id));
      topics.appendChild(b);
    }
    events.on(GameEvents.AI_SAY, () => this.isOpen && this._renderLog());
    events.on(GameEvents.AI_PANEL_REQUEST, () => this.setOpen(true));
  }

  render() {
    this.setTitle(`🤖 ${this._ai.aiName} · IA de la nave`);
    this._nameField.value = this._ai.aiName;
    this._renderLog();
    if (!this._ai.named) this._nameField.focus();
  }

  _renderLog() {
    this._log.replaceChildren();
    const lines = this._ai.log.slice(-14);
    if (!lines.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Pregúntame lo que quieras saber del sistema de MUNDO 0 o de la nave.';
      this._log.appendChild(p);
    }
    for (const l of lines) {
      const p = document.createElement('p');
      p.className = l.type === 'ai-warn' ? 'warn' : '';
      p.textContent = l.text;
      this._log.appendChild(p);
    }
    this._log.scrollTop = this._log.scrollHeight;
  }
}
