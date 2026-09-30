import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';

/**
 * HyperspacePanel — navegación hiperespacial (nodo de velocidad-luz). Se abre al
 * llegar al borde del sistema: la IA de la nave pregunta a qué sistema ir y se
 * elige de la lista del catálogo (systems/catalogo.json). Cada salto gasta
 * baterías enteras de la nave. Todos los textos van como texto (nunca HTML).
 */
export class HyperspacePanel extends ModalPanel {
  /**
   * @param {object} p.sources { catalog: () => [{ id, file, name, description }], currentFile,
   *                             systemName, aiName: () => string, batteries, cost }
   */
  constructor({ container, input, events, sources }) {
    super({ id: 'hyperspace-panel', title: '⚡ Navegación hiperespacial', container, input, events, footer: '<kbd>Esc</kbd> quedarnos en este sistema' });
    this._src = sources;
    this.el.classList.add('tech-panel');
    events.on(GameEvents.HYPERSPACE_PANEL_REQUEST, () => this.setOpen(true));
  }

  render() {
    const s = this._src;
    const bank = s.batteries;
    const canJump = bank.canSpend(s.cost);
    const ai = el('div', 'hyper-ai');
    const who = el('b', null, `🤖 ${s.aiName()}`);
    ai.append(who, `: Estamos en el borde del ${s.systemName}. El nodo de velocidad-luz está listo. ¿A qué sistema quieres que vayamos?`);

    const status = el('div', `hyper-status${canJump ? '' : ' low'}`);
    const cells = bank.slots.map((b) => (b ? (b.charge >= bank._cfg.CAPACITY - 0.5 ? '▰' : b.charge > 0.5 ? '▱' : '·') : '_')).join(' ');
    status.textContent = `Baterías de la nave: ${cells}  ·  carga ${Math.round(bank.total)} / ${bank.capacity}  ·  cada salto gasta ${s.cost} ${s.cost === 1 ? 'batería' : 'baterías'}${canJump ? '' : '  ·  ¡NO HAY CARGA SUFICIENTE!'}`;

    const list = el('ul', 'hyper-list');
    const entries = s.catalog();
    if (!entries.length) list.append(el('li', 'hyper-empty', 'No hay ningún sistema en el catálogo de navegación.'));
    entries.forEach((e, i) => {
      const here = e.file === s.currentFile;
      const li = el('li', here ? 'here' : null);
      const info = el('div', 'hyper-info');
      info.append(el('span', 'hyper-index', String(i + 1).padStart(2, '0')), el('span', 'hyper-name', e.name));
      if (e.description) info.append(el('span', 'hyper-desc', e.description));
      const btn = el('button', null, here ? 'Estás aquí' : `Saltar · 🔋 −${s.cost}`);
      btn.type = 'button';
      btn.disabled = here || !canJump;
      btn.addEventListener('click', () => {
        this.setOpen(false);
        this._events.emit(GameEvents.HYPERSPACE_JUMP, { entry: e });
      });
      li.append(info, btn);
      list.append(li);
    });
    this.body.replaceChildren(ai, status, list);
  }
}

/**
 * WarpOverlay — el viaje por el hiperespacio: estrellas que se estiran desde el
 * centro de la pantalla (entrada) o que se frenan hasta pararse (salida).
 */
export class WarpOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'warp-overlay';
    this.canvas = document.createElement('canvas');
    this.label = el('div', 'warp-label');
    this.el.append(this.canvas, this.label);
    document.body.appendChild(this.el);
    this._stars = Array.from({ length: 420 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.4 + Math.random() }));
    this._raf = null;
  }

  /** Entrada al hiperespacio: acelera durante `seconds` y llama a `onDone`. */
  enter(text, seconds, onDone) {
    this._run(text, seconds, (t) => t * t, onDone, false);
  }

  /** Salida del hiperespacio: frena y se desvanece. */
  exit(text, seconds = 2.2) {
    this._run(text, seconds, (t) => 1 - t, () => this.el.classList.remove('active'), true);
  }

  _run(text, seconds, speedAt, onDone, fadeOut) {
    cancelAnimationFrame(this._raf);
    this.label.textContent = text;
    this.el.classList.add('active');
    this.el.style.opacity = '1';
    const c = this.canvas;
    const g = c.getContext('2d');
    const t0 = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / (seconds * 1000));
      c.width = window.innerWidth;
      c.height = window.innerHeight;
      const cx = c.width / 2;
      const cy = c.height / 2;
      const R = Math.hypot(cx, cy);
      const v = speedAt(t);
      g.fillStyle = `rgba(2, 6, 18, ${0.35 + 0.5 * v})`;
      g.fillRect(0, 0, c.width, c.height);
      // Túnel: brillo azulado en el centro.
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.6);
      glow.addColorStop(0, `rgba(120, 190, 255, ${0.35 * v})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, c.width, c.height);
      g.lineCap = 'round';
      for (const st of this._stars) {
        st.r += (0.002 + 0.05 * v) * st.s;
        if (st.r > 1.05) st.r = 0.02 + Math.random() * 0.1;
        const r0 = st.r * R;
        const r1 = Math.max(0, r0 - (4 + 260 * v * st.r) * st.s);
        g.strokeStyle = `rgba(${190 + 60 * v}, ${220 + 30 * v}, 255, ${0.35 + 0.6 * st.r})`;
        g.lineWidth = 0.6 + 1.8 * st.r * st.s;
        g.beginPath();
        g.moveTo(cx + Math.cos(st.a) * r1, cy + Math.sin(st.a) * r1);
        g.lineTo(cx + Math.cos(st.a) * r0, cy + Math.sin(st.a) * r0);
        g.stroke();
      }
      if (fadeOut && t > 0.6) this.el.style.opacity = String(1 - (t - 0.6) / 0.4);
      if (t < 1) this._raf = requestAnimationFrame(frame);
      else onDone?.();
    };
    this._raf = requestAnimationFrame(frame);
  }
}

function el(tag, className = null, text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null) n.textContent = text;
  return n;
}
