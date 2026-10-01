import { ModalPanel } from './ModalPanel.js';
import { GameEvents } from '../core/GameEvents.js';
import { LIMITS } from '../systemdata/Catalog.js';
import { loadSystem, errorReport } from '../systemdata/SystemLoader.js';
import { previewSystem } from '../systemdata/SystemPreview.js';
import { formatGuide } from '../systemdata/FormatGuide.js';

/**
 * ImportPanel — importar sistemas solares (bloque 1d).
 *
 *   - El archivo llega por el selector, arrastrándolo o pegando el texto.
 *   - "Comprobar" lo pasa por el mismo camino que cualquier sistema: lector seguro
 *     (solo JSON, 256 KB) → migraciones → validador → compilador. Nunca se ejecuta
 *     nada del archivo y no se carga nada externo.
 *   - Vista previa con lo que se va a crear, avisos (claves ignoradas) y peticiones
 *     no soportadas. Los errores se pueden copiar en un texto listo para Claude.
 *   - Los sistemas guardados (IndexedDB) se pueden jugar o borrar; además salen
 *     como destino en la navegación hiperespacial.
 *
 * Todo el contenido del archivo se pinta con textContent (nunca como HTML).
 */
export class ImportPanel extends ModalPanel {
  /**
   * @param {object} p
   * @param {import('../systemdata/SystemStore.js').SystemStore} p.store
   * @param {(id: string) => void} p.play        abre el juego en ese sistema importado
   * @param {() => boolean} p.inGame             true si ya se está jugando (para recuperar el ratón al cerrar)
   * @param {() => void} [p.onChange]            la lista de guardados ha cambiado
   */
  constructor({ input, events, store, play, inGame, onChange }) {
    super({ id: 'import-panel', title: '📥 Importar sistema solar', container: document.body, input, events, footer: '<kbd>Esc</kbd> para cerrar' });
    this.el.classList.add('tech-panel');
    this._store = store;
    this._play = play;
    this._inGame = inGame;
    this._onChange = onChange ?? (() => {});
    this._onClose = null;
    this._text = '';
    this._result = null;
    this._saved = [];
    this._savedId = null; // id con el que se guardó el sistema que se está viendo
    this._statusMsg = null; // { text, bad } bajo los botones de la vista previa
    this._build();
    this.refreshList();
  }

  /** Abre el panel; `onClose` se llama al cerrarlo (p. ej. volver al panel de hiperespacio). */
  open(onClose = null) {
    this._onClose = onClose;
    this.setOpen(true);
  }

  setOpen(open) {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
    this._input.setBlocked(this._id, open);
    if (open) {
      this._input.exitPointerLock();
      this.render();
    } else if (this._inGame()) {
      this._input.requestPointerLock();
    }
    this._events.emit(GameEvents.UI_PANEL_TOGGLED, { id: this._id, open });
    if (!open && this._onClose) {
      const cb = this._onClose;
      this._onClose = null;
      cb();
    }
  }

  // ---- Construcción (una vez) -------------------------------------------------

  _build() {
    const intro = el('p', 'imp-intro', 'Pega el JSON que te ha dado Claude, arrastra aquí el archivo .json o elígelo. Se comprueba antes de guardarlo: nunca se ejecuta nada del archivo.');
    const guideBtn = button('📋 Copiar prompt para Claude (plantilla para rellenar + formato)', 'imp-secondary');
    guideBtn.addEventListener('click', () => this._copy(formatGuide(), guideBtn, 'Copiado: pégalo en el chat de Claude, rellena la parte de arriba y envíalo.'));

    // Zona de entrada: arrastrar + selector + texto.
    this._drop = el('div', 'imp-drop');
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json,application/json';
    file.className = 'imp-file';
    file.addEventListener('change', () => {
      if (file.files?.[0]) this._readFile(file.files[0]);
      file.value = '';
    });
    const pick = button('📂 Elegir archivo…', 'imp-secondary');
    pick.addEventListener('click', () => file.click());
    this._drop.append(el('span', null, 'Arrastra aquí un archivo .json  ·  '), pick, file);
    for (const type of ['dragenter', 'dragover']) {
      this._drop.addEventListener(type, (e) => {
        e.preventDefault();
        this._drop.classList.add('over');
      });
    }
    this._drop.addEventListener('dragleave', () => this._drop.classList.remove('over'));
    this._drop.addEventListener('drop', (e) => {
      e.preventDefault();
      this._drop.classList.remove('over');
      const f = e.dataTransfer?.files?.[0];
      if (f) this._readFile(f);
    });

    this._area = document.createElement('textarea');
    this._area.className = 'imp-text';
    this._area.rows = 8;
    this._area.spellcheck = false;
    this._area.placeholder = '{ "schema_version": "1.0", "name": "Mi sistema", "planets": [ { "name": "…" } ] }';
    this._area.maxLength = LIMITS.FILE_BYTES;
    this._area.addEventListener('input', () => {
      this._text = this._area.value;
      this._result = null;
      this._renderResult();
    });

    const check = button('🔎 Comprobar', 'imp-primary');
    check.addEventListener('click', () => this._check());
    const clear = button('Limpiar', 'imp-secondary');
    clear.addEventListener('click', () => {
      this._area.value = this._text = '';
      this._result = null;
      this._renderResult();
    });
    const actions = el('div', 'imp-actions');
    actions.append(check, clear);

    this._resultEl = el('div', 'imp-result');
    this._listEl = el('div', 'imp-saved');
    this.body.replaceChildren(intro, guideBtn, this._drop, this._area, actions, this._resultEl, this._listEl);
  }

  render() {
    this._renderResult();
    this._renderList();
  }

  // ---- Entrada -------------------------------------------------------------

  async _readFile(f) {
    // El tamaño se mira antes de leerlo: un archivo enorme no llega a cargarse.
    if (f.size > LIMITS.FILE_BYTES) {
      this._result = { ok: false, errors: [{ path: '', message: `El archivo pesa ${Math.round(f.size / 1024)} KB: el máximo es ${Math.round(LIMITS.FILE_BYTES / 1024)} KB.` }], warnings: [] };
      this._renderResult();
      return;
    }
    if (f.name && !/\.json$/i.test(f.name) && f.type && f.type !== 'application/json') {
      this._result = { ok: false, errors: [{ path: '', message: 'Solo se aceptan archivos .json.' }], warnings: [] };
      this._renderResult();
      return;
    }
    try {
      this._text = await f.text();
    } catch {
      this._result = { ok: false, errors: [{ path: '', message: 'No se pudo leer el archivo.' }], warnings: [] };
      this._renderResult();
      return;
    }
    this._area.value = this._text.slice(0, LIMITS.FILE_BYTES);
    this._check();
  }

  _check() {
    this._text = this._area.value;
    this._savedId = null;
    this._statusMsg = null;
    if (!this._text.trim()) {
      this._result = { ok: false, errors: [{ path: '', message: 'No hay nada que comprobar: pega el JSON o elige un archivo.' }], warnings: [] };
    } else {
      try {
        this._result = loadSystem(this._text);
      } catch (err) {
        // El cargador no debería lanzar nunca; si pasa, se informa como un error más.
        this._result = { ok: false, errors: [{ path: '', message: `Error inesperado al leerlo: ${String(err?.message ?? err).slice(0, 200)}` }], warnings: [] };
      }
    }
    this._renderResult();
  }

  // ---- Resultado -------------------------------------------------------------

  _renderResult() {
    const r = this._result;
    const box = this._resultEl;
    box.replaceChildren();
    box.className = 'imp-result';
    if (!r) return;
    if (!r.ok) {
      box.classList.add('bad');
      box.append(el('h3', null, `❌ El sistema no es válido (${r.errors.length} ${r.errors.length === 1 ? 'error' : 'errores'})`));
      const ul = el('ul', 'imp-errors');
      for (const e of r.errors) {
        const li = el('li');
        if (e.path) li.append(el('code', null, e.path), ': ');
        li.append(e.message);
        ul.append(li);
      }
      box.append(ul);
      const copy = button('📋 Copiar error para Claude', 'imp-primary');
      copy.addEventListener('click', () => this._copy(errorReport(r), copy, 'Copiado: pégalo en el chat de Claude para que lo corrija.'));
      box.append(copy);
      this._warnings(box, r.warnings ?? []);
      return;
    }

    const p = previewSystem(r);
    box.classList.add('good');
    box.append(el('h3', null, `✅ ${p.name}`));
    if (p.description) box.append(el('p', 'imp-desc', p.description));
    box.append(el('p', 'imp-meta', `${p.author ? `Autor: ${p.author} · ` : ''}Estrella: ${p.star.name} (${p.star.type}) · ${p.planets.length} ${p.planets.length === 1 ? 'planeta' : 'planetas'} · ${p.moons} ${p.moons === 1 ? 'luna' : 'lunas'}`));
    const ul = el('ul', 'imp-bodies');
    p.planets.forEach((pl, i) => {
      const li = el('li');
      li.append(el('b', null, `${i === 0 ? '🏁 ' : '🪐 '}${pl.name}`), ` — ${bodyLine(pl)}`);
      if (pl.moons.length) {
        const ml = el('ul');
        for (const m of pl.moons) {
          const mi = el('li');
          mi.append(el('b', null, `🌑 ${m.name}`), ` — ${bodyLine(m)}`);
          ml.append(mi);
        }
        li.append(ml);
      }
      ul.append(li);
    });
    box.append(ul, el('p', 'imp-meta', '🏁 = planeta de inicio. Todas las lunas se pueden visitar.'));
    this._warnings(box, p.warnings);
    if (p.unsupported.length) {
      const u = el('div', 'imp-unsupported');
      u.append(el('b', null, `💡 Ideas que el motor aún no permite (se ignoran por ahora):`));
      const ul2 = el('ul');
      for (const t of p.unsupported) ul2.append(el('li', null, t));
      u.append(ul2);
      box.append(u);
    }

    const actions = el('div', 'imp-actions');
    const save = button(this._savedId ? '✔ Guardado' : '💾 Guardar', 'imp-primary');
    save.disabled = !!this._savedId;
    save.addEventListener('click', () => this._save(p).then(() => this._renderResult()));
    const play = button('▶ Guardar y jugar', 'imp-primary');
    play.addEventListener('click', async () => {
      const id = this._savedId ?? (await this._save(p));
      if (id) this._play(id);
    });
    actions.append(save, play);
    this._status = el('p', 'imp-status');
    if (this._statusMsg) {
      this._status.textContent = this._statusMsg.text;
      this._status.classList.toggle('bad', this._statusMsg.bad);
    }
    box.append(actions, this._status);
  }

  _warnings(box, warnings) {
    if (!warnings.length) return;
    const w = el('div', 'imp-warnings');
    w.append(el('b', null, `⚠ ${warnings.length} ${warnings.length === 1 ? 'aviso' : 'avisos'} (no impiden jugar):`));
    const ul = el('ul');
    for (const t of warnings.slice(0, 30)) ul.append(el('li', null, typeof t === 'string' ? t : `${t.path || '(archivo)'}: ${t.message}`));
    if (warnings.length > 30) ul.append(el('li', null, `… y ${warnings.length - 30} más`));
    w.append(ul);
    box.append(w);
  }

  /** Guarda el sistema comprobado; devuelve su id (o null si falla). */
  async _save(p) {
    try {
      const rec = await this._store.save({ name: p.name, description: p.description, planets: p.planets.length, text: this._text });
      this._savedId = rec.id;
      await this.refreshList();
      this._setStatus(this._store.persistent ? `Guardado en este navegador como «${rec.name}».` : 'Guardado solo hasta que cierres la pestaña (este navegador no deja guardar datos).');
      return rec.id;
    } catch (err) {
      this._setStatus(`No se pudo guardar: ${String(err?.message ?? err).slice(0, 200)}`, true);
      return null;
    }
  }

  _setStatus(text, bad = false) {
    this._statusMsg = { text, bad };
    if (!this._status) return;
    this._status.textContent = text;
    this._status.classList.toggle('bad', bad);
  }

  // ---- Guardados -------------------------------------------------------------

  async refreshList() {
    try {
      this._saved = await this._store.list();
    } catch {
      this._saved = [];
    }
    this._renderList();
    this._onChange(this._saved);
    return this._saved;
  }

  get saved() {
    return this._saved;
  }

  _renderList() {
    const box = this._listEl;
    box.replaceChildren(el('h3', null, `💾 Sistemas guardados (${this._saved.length})`));
    if (!this._saved.length) {
      box.append(el('p', 'imp-meta', 'Todavía no hay ninguno. Los que guardes aparecen aquí y en la navegación hiperespacial.'));
      return;
    }
    const ul = el('ul', 'imp-list');
    for (const s of this._saved) {
      const li = el('li');
      const info = el('div', 'imp-info');
      info.append(el('span', 'imp-name', s.name), el('span', 'imp-meta', `${s.planets} ${s.planets === 1 ? 'planeta' : 'planetas'} · ${formatDate(s.savedAt)}`));
      if (s.description) info.append(el('span', 'imp-desc', s.description));
      const play = button('▶ Jugar', 'imp-primary');
      play.addEventListener('click', () => this._play(s.id));
      const del = button('🗑 Borrar', 'imp-danger');
      del.addEventListener('click', async () => {
        if (del.dataset.confirm !== '1') {
          del.dataset.confirm = '1';
          del.textContent = '¿Seguro? Pulsa otra vez';
          setTimeout(() => {
            del.dataset.confirm = '';
            del.textContent = '🗑 Borrar';
          }, 3000);
          return;
        }
        await this._store.remove(s.id);
        if (this._savedId === s.id) this._savedId = null;
        await this.refreshList();
        this._renderResult();
      });
      li.append(info, play, del);
      ul.append(li);
    }
    box.append(ul);
  }

  // ---- Portapapeles -------------------------------------------------------------

  async _copy(text, btn, okText) {
    const label = btn.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // Sin permiso de portapapeles: se deja el texto seleccionado para copiarlo a mano.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.className = 'imp-copy-fallback';
      btn.after(ta);
      ta.select();
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      if (ok) ta.remove();
    }
    btn.textContent = ok ? `✔ ${okText}` : 'No se pudo copiar solo: el texto está seleccionado debajo, cópialo con Ctrl+C.';
    setTimeout(() => (btn.textContent = label), 4000);
  }
}

function bodyLine(b) {
  const es = (n) => String(n).replace('.', ',');
  const parts = [`${b.size} (${es(b.regionKm)} km)`, b.generator, b.breathable ? 'con aire' : 'sin aire', `${es(b.gravity)} g`];
  if (b.kind === 'PLANET' || b.sea) parts.push(b.sea ? 'con mar' : 'sin mar');
  if (b.wave) parts.push(`🌊 ola gigante de ${Math.round(b.wave.heightM)} m cada ${b.wave.everyHours} h`);
  return parts.join(' · ');
}

function formatDate(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text, cls) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}
