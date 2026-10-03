import { GameEvents } from '../core/GameEvents.js';

/**
 * StoryUI — lo que la historia pone en pantalla (todo con textContent, nunca HTML):
 *   - configurar el reloj (nombre de la futura IA y color de la interfaz)
 *   - la transmisión que se corta ("Sample ha llegado al planeta Eden…")
 *   - preguntas con dos botones (¿tutorial o juego libre?)
 *   - diálogos (ermitaño, Nova…) que se pasan con E, Espacio o clic
 *   - la brújula de arriba (J la oculta) y la línea del objetivo
 *   - bandas de cine con un rótulo y el "fogonazo" al unir la clave al reloj
 */
export const WATCH_COLORS = [
  { id: 'BLUE', name: 'Azul', hex: '#4fb6ff' },
  { id: 'RED', name: 'Rojo', hex: '#ff4f4f' },
  { id: 'YELLOW', name: 'Amarillo', hex: '#ffd84a' },
  { id: 'GREEN', name: 'Verde', hex: '#56e07a' },
  { id: 'WHITE', name: 'Blanco', hex: '#f2f6fa' },
  { id: 'BLACK', name: 'Negro', hex: '#2a2d33' },
  { id: 'ORANGE', name: 'Naranja', hex: '#ff9a3c' },
  { id: 'PINK', name: 'Rosa', hex: '#ff7ac8' },
  { id: 'PURPLE', name: 'Morado', hex: '#a77bff' },
];

export function watchColor(id) {
  return WATCH_COLORS.find((c) => c.id === id) ?? WATCH_COLORS[0];
}

/** Nombre válido para el reloj / la IA: letras, números, espacios y guiones; 1–16. */
export function sanitizeWatchName(name) {
  const n = String(name ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n || null;
}

/** Color de la interfaz: variables CSS (el negro se aclara para que se lea). */
export function applyWatchTheme(colorId) {
  const c = watchColor(colorId);
  const root = document.documentElement;
  const ui = c.id === 'BLACK' ? '#9aa3ad' : c.hex;
  root.style.setProperty('--ui-accent', ui);
  root.style.setProperty('--watch-color', ui);
  root.style.setProperty('--watch-glow', `${ui}55`);
  document.body.dataset.watch = c.id;
}

export class StoryUI {
  constructor({ container, input, events }) {
    this._input = input;
    this._events = events;
    this._root = el('div', 'story-ui');
    container.appendChild(this._root);
    this._dialog = null;
    this._raw = null;
    this.compassVisible = false;
    this.compassHidden = false; // J
    // Teclas mientras hay un diálogo (la entrada de juego está bloqueada).
    input.onRawKey((e) => {
      if (e.type && e.type !== 'keydown') return;
      if (this._raw) this._raw(e);
    });
    this._buildHud();
  }

  // ---- Paneles modales ---------------------------------------------------------

  _modal(id, onClose) {
    const back = el('div', 'story-modal-back');
    const box = el('div', 'story-modal');
    back.appendChild(box);
    this._root.appendChild(back);
    this._input.setBlocked(id, true);
    this._input.exitPointerLock();
    this._events.emit(GameEvents.UI_PANEL_TOGGLED, { id, open: true });
    const close = () => {
      back.remove();
      this._input.setBlocked(id, false);
      this._events.emit(GameEvents.UI_PANEL_TOGGLED, { id, open: false });
      this._input.requestPointerLock();
      onClose?.();
    };
    return { back, box, close };
  }

  /**
   * Configurar el reloj: nombre (el de la futura IA) y color.
   * @param {{ name?: string, color?: string, title?: string, allowCancel?: boolean }} o
   * @param {(r: {name:string, color:string}) => void} done
   */
  watchSetup({ name = 'NOVA', color = 'BLUE', title = '⌚ Tu reloj de pulsera', allowCancel = false } = {}, done) {
    const m = this._modal('watch-setup');
    m.box.classList.add('watch-setup');
    m.box.append(el('h2', null, title));
    m.box.append(el('p', 'muted', 'El reloj se ha encendido y pide un nombre: será el de su inteligencia. El color será el de la pantalla y la interfaz (se cambia cuando quieras desde el reloj, columna «Tú»).'));
    const label = el('label', 'field');
    label.append(el('span', null, 'Nombre'));
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.value = name;
    input.autocomplete = 'off';
    input.spellcheck = false;
    label.append(input);
    m.box.append(label);
    const sw = el('div', 'swatches');
    let chosen = color;
    const preview = el('div', 'watch-preview');
    const pName = el('div', 'wp-name');
    const pClock = el('div', 'wp-clock', '08:00');
    preview.append(pClock, pName);
    const paint = () => {
      const c = watchColor(chosen);
      preview.style.setProperty('--c', c.id === 'BLACK' ? '#9aa3ad' : c.hex);
      pName.textContent = sanitizeWatchName(input.value) ?? '—';
      for (const b of sw.children) b.classList.toggle('on', b.dataset.id === chosen);
    };
    for (const c of WATCH_COLORS) {
      const b = el('button', 'swatch');
      b.type = 'button';
      b.title = c.name;
      b.dataset.id = c.id;
      b.style.background = c.hex;
      b.addEventListener('click', () => {
        chosen = c.id;
        paint();
      });
      sw.append(b);
    }
    input.addEventListener('input', paint);
    m.box.append(sw, preview);
    const row = el('div', 'buttons');
    const ok = el('button', 'primary', 'Confirmar');
    ok.type = 'button';
    const finish = () => {
      const n = sanitizeWatchName(input.value);
      if (!n) {
        input.focus();
        input.classList.add('bad');
        return;
      }
      m.close();
      done?.({ name: n, color: chosen });
    };
    ok.addEventListener('click', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish();
      e.stopPropagation();
    });
    if (allowCancel) {
      const cancel = el('button', null, 'Cancelar');
      cancel.type = 'button';
      cancel.addEventListener('click', () => m.close());
      row.append(cancel);
    }
    row.append(ok);
    m.box.append(row);
    paint();
    setTimeout(() => input.focus(), 50);
  }

  /** Pregunta con botones: options [{ id, label, hint }]. */
  choice({ title, text, options }, done) {
    const m = this._modal('story-choice');
    m.box.append(el('h2', null, title));
    if (text) m.box.append(el('p', 'muted', text));
    const row = el('div', 'choices');
    for (const o of options) {
      const b = el('button', 'choice');
      b.type = 'button';
      b.append(el('strong', null, o.label));
      if (o.hint) b.append(el('small', null, o.hint));
      b.addEventListener('click', () => {
        m.close();
        done?.(o.id);
      });
      row.append(b);
    }
    m.box.append(row);
  }

  /** Mensaje de radio que se escribe solo y se corta. */
  transmission({ header = '📻 TRANSMISIÓN ENTRANTE', text, cut = true }, done) {
    const box = el('div', 'transmission');
    const h = el('div', 'tx-head', header);
    const body = el('div', 'tx-body');
    const wave = el('div', 'tx-wave');
    for (let i = 0; i < 28; i++) wave.append(el('i'));
    box.append(h, wave, body);
    this._root.appendChild(box);
    let i = 0;
    const type = () => {
      if (i <= text.length) {
        body.textContent = text.slice(0, i);
        i++;
        setTimeout(type, text[i - 1] === ',' ? 220 : 42);
        return;
      }
      if (cut) {
        box.classList.add('cut');
        const end = el('div', 'tx-cut', '— SEÑAL PERDIDA —');
        box.append(end);
      }
      setTimeout(() => {
        box.classList.add('out');
        setTimeout(() => {
          box.remove();
          done?.();
        }, 700);
      }, cut ? 2600 : 1600);
    };
    setTimeout(type, 900);
  }

  /**
   * Diálogo: lines [{ speaker, text, color?, onShow? }]. Se pasa con E, Espacio, Intro
   * o clic. Mientras, no se mueve el jugador.
   */
  dialog(lines, done) {
    this._dialog?.finish(true);
    const box = el('div', 'story-dialog');
    const who = el('div', 'sd-who');
    const text = el('div', 'sd-text');
    const hint = el('div', 'sd-hint', 'E · Espacio · clic  ▶');
    box.append(who, text, hint);
    this._root.appendChild(box);
    this._input.setBlocked('story-dialog', true);
    let i = -1;
    let ready = 0;
    const next = () => {
      if (performance.now() < ready) return;
      i++;
      if (i >= lines.length) return finish();
      const l = lines[i];
      who.textContent = l.speaker ?? '';
      who.style.color = l.color ?? '';
      text.textContent = l.text;
      ready = performance.now() + 350;
      l.onShow?.();
    };
    const finish = (silent = false) => {
      box.remove();
      this._raw = null;
      this._dialog = null;
      this._input.setBlocked('story-dialog', false);
      if (!silent) done?.();
    };
    this._raw = (e) => {
      if (['KeyE', 'Space', 'Enter', 'NumpadEnter'].includes(e.code)) next();
    };
    box.addEventListener('click', next);
    this._dialog = { finish };
    next();
  }

  get dialogOpen() {
    return !!this._dialog;
  }

  // ---- Cine ---------------------------------------------------------------------

  letterbox(on, caption = '') {
    this._bars.classList.toggle('on', on);
    this._caption.textContent = caption;
  }

  caption(text) {
    this._caption.textContent = text ?? '';
  }

  /** Destello y el icono volando hasta el reloj (al unir la clave A1). */
  flyToWatch(icon) {
    const f = el('div', 'fly-icon', icon);
    this._root.appendChild(f);
    const flash = el('div', 'watch-flash');
    this._root.appendChild(flash);
    setTimeout(() => f.classList.add('go'), 30);
    setTimeout(() => {
      f.remove();
      flash.classList.add('go');
    }, 1300);
    setTimeout(() => flash.remove(), 2400);
  }

  /** Barra de vida del jefe (arriba). ratio null la oculta. */
  bossBar(name, ratio, note = '') {
    if (!this._boss) {
      this._boss = el('div', 'boss-bar hidden');
      this._bossName = el('div', 'bb-name');
      const track = el('div', 'bb-track');
      this._bossFill = el('div', 'bb-fill');
      track.append(this._bossFill);
      this._bossNote = el('div', 'bb-note');
      this._boss.append(this._bossName, track, this._bossNote);
      this._root.append(this._boss);
    }
    this._boss.classList.toggle('hidden', ratio === null);
    if (ratio === null) return;
    this._bossName.textContent = name;
    this._bossFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    this._bossNote.textContent = note;
  }

  /** Pantalla de fin de la demo: lines de texto y un botón para seguir jugando. */
  endScreen({ title, lines, button }, done) {
    const m = this._modal('demo-end');
    m.back.classList.add('demo-end');
    m.box.append(el('h2', null, title));
    for (const l of lines) m.box.append(el('p', 'muted', l));
    const b = el('button', 'primary', button);
    b.type = 'button';
    b.addEventListener('click', () => {
      m.close();
      done?.();
    });
    const row = el('div', 'buttons');
    row.append(b);
    m.box.append(row);
  }

  // ---- HUD: brújula y objetivo ----------------------------------------------------

  _buildHud() {
    this._compass = el('div', 'compass hidden');
    this._compassStrip = el('div', 'compass-strip');
    this._compass.append(this._compassStrip, el('div', 'compass-needle'));
    this._objective = el('div', 'story-objective hidden');
    this._bars = el('div', 'cine-bars');
    this._bars.append(el('div', 'cine-top'), el('div', 'cine-bottom'));
    this._caption = el('div', 'cine-caption');
    this._bars.append(this._caption);
    this._root.append(this._compass, this._objective, this._bars);
    this._marks = new Map();
  }

  setCompassVisible(v) {
    this.compassVisible = v;
    this._compass.classList.toggle('hidden', !v || this.compassHidden);
  }

  toggleCompass() {
    if (!this.compassVisible) return false;
    this.compassHidden = !this.compassHidden;
    this._compass.classList.toggle('hidden', this.compassHidden);
    return true;
  }

  /**
   * @param {number} yaw yaw del jugador (0 mira a −Z)
   * @param {{id, icon, x, z, label}[]} markers con su posición relativa ya calculada en `angle` (rad) y `dist` (m)
   */
  updateCompass(yaw, markers) {
    if (!this.compassVisible || this.compassHidden) return;
    const strip = this._compassStrip;
    const width = 420;
    const fov = Math.PI * 0.9;
    const place = (node, ang) => {
      // Ángulo relativo a donde mira el jugador.
      const rel = wrap(ang - (-yaw));
      node.style.display = Math.abs(rel) > fov / 2 ? 'none' : '';
      node.style.left = `${width / 2 + (rel / (fov / 2)) * (width / 2)}px`;
    };
    if (!this._cardinals) {
      this._cardinals = [['N', 0], ['NE', Math.PI / 4], ['E', Math.PI / 2], ['SE', (3 * Math.PI) / 4], ['S', Math.PI], ['SO', -(3 * Math.PI) / 4], ['O', -Math.PI / 2], ['NO', -Math.PI / 4]].map(([t, a]) => {
        const n = el('span', t.length === 1 ? 'card main' : 'card', t);
        strip.append(n);
        return { n, a };
      });
    }
    // Norte = −Z. Ángulo de una dirección (dx, dz): atan2(dx, −dz).
    for (const c of this._cardinals) place(c.n, c.a);
    const seen = new Set();
    for (const m of markers) {
      seen.add(m.id);
      let n = this._marks.get(m.id);
      if (!n) {
        n = el('span', 'mark');
        n.append(el('b'), el('small'));
        strip.append(n);
        this._marks.set(m.id, n);
      }
      n.firstChild.textContent = m.icon;
      n.lastChild.textContent = m.dist < 1000 ? `${Math.round(m.dist)} m` : `${(m.dist / 1000).toFixed(1)} km`;
      n.title = m.label ?? '';
      place(n, m.angle);
    }
    for (const [id, n] of this._marks) {
      if (seen.has(id)) continue;
      n.remove();
      this._marks.delete(id);
    }
  }

  setObjective(text) {
    this._objective.classList.toggle('hidden', !text);
    if (text !== this._objText) {
      this._objText = text;
      this._objective.textContent = text ? `🎯 ${text}` : '';
    }
  }
}

function el(tag, cls = null, text = null) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== null) n.textContent = text;
  return n;
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
