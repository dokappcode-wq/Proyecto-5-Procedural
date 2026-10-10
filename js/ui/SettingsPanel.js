import { ModalPanel } from './ModalPanel.js';
import { QUALITY, LIMITS } from '../settings/Settings.js';

/**
 * SettingsPanel — ajustes (tecla P o botón del reloj, P9): calidad gráfica, campo de visión,
 * sensibilidad del ratón, invertir Y y volúmenes. Cada cambio se aplica al momento.
 * Solo DOM con textContent.
 */
const VOLUMES = [['master', '🔊 General'], ['sfx', '💥 Efectos'], ['ambient', '🌲 Ambiente'], ['music', '🎵 Música']];

export class SettingsPanel extends ModalPanel {
  constructor({ container, input, events, settings, audio = null }) {
    super({ id: 'settings-panel', title: '⚙️ Ajustes', container, input, events, footer: '<kbd>P</kbd> o <kbd>Esc</kbd> cerrar · se guardan en este navegador' });
    this._settings = settings;
    this._audio = audio;
  }

  update(dt) {
    super.update(dt);
    if (this._input.wasPressed('SETTINGS') || (this.isOpen && this._keyToggle)) {
      this._keyToggle = false;
      this.setOpen(!this.isOpen);
    }
  }

  setOpen(open) {
    super.setOpen(open);
    // Con el panel abierto la entrada de juego está bloqueada: la P se lee aquí.
    if (open && !this._keyHook) {
      this._keyHook = true;
      this._input.onRawKey((e) => {
        if (this.isOpen && e.code === 'KeyP' && e.type === 'keydown') this._keyToggle = true;
      });
    }
  }

  render() {
    const S = this._settings;
    const b = this.body;
    b.replaceChildren();

    b.append(el('h3', 'sp-head', '🖥️ Gráficos'));
    const q = el('div', 'sp-choices');
    for (const [id, def] of Object.entries(QUALITY)) {
      const btn = el('button', `sp-choice${S.get('quality') === id ? ' active' : ''}`, def.NAME);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        S.set('quality', id);
        this.render();
      });
      q.append(btn);
    }
    b.append(row('Calidad', q), el('p', 'sp-hint', 'Baja: menos resolución y sin sombras (va más fluido). Alta: todo al máximo.'));
    b.append(slider('Campo de visión', LIMITS.fov[0], LIMITS.fov[1], 1, S.get('fov'), (v) => `${v}°`, (v) => S.set('fov', v)));

    b.append(el('h3', 'sp-head', '🖱️ Controles'));
    b.append(slider('Sensibilidad del ratón', LIMITS.sensitivity[0], LIMITS.sensitivity[1], 0.05, S.get('sensitivity'), (v) => `${Math.round(v * 100)} %`, (v) => S.set('sensitivity', v)));
    b.append(check('Invertir eje Y', S.get('invertY'), (v) => S.set('invertY', v)));

    if (this._audio) {
      const A = this._audio;
      b.append(el('h3', 'sp-head', '🔈 Sonido'));
      for (const [k, label] of VOLUMES) {
        b.append(slider(label, 0, 1, 0.05, A.volumes[k], (v) => `${Math.round(v * 100)} %`, (v) => A.setVolume(k, v)));
      }
      b.append(check('Silenciar (N)', A.muted, (v) => A.setMuted(v)));
    }

    const reset = el('button', 'sp-reset', '↺ Valores por defecto');
    reset.type = 'button';
    reset.addEventListener('click', () => {
      S.reset();
      this.render();
    });
    b.append(reset);
  }
}

function row(label, control) {
  const r = el('label', 'sp-row');
  r.append(el('span', 'sp-label', label), control);
  return r;
}

function slider(label, min, max, step, value, fmt, onInput) {
  const wrap = el('div', 'sp-slider');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  const out = el('span', 'sp-value', fmt(Number(value)));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    onInput(v);
  });
  wrap.append(input, out);
  return row(label, wrap);
}

function check(label, value, onChange) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = !!value;
  input.addEventListener('change', () => onChange(input.checked));
  return row(label, input);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
