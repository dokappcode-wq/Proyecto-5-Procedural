/**
 * AdminPanel — vista DOM del modo Admin. Solo dibuja herramientas agrupadas
 * por categoría; la lógica vive en cada herramienta registrada.
 */
export class AdminPanel {
  constructor({ container, onClose, onDeactivate, onToolError }) {
    this._onToolError = onToolError;
    this._infoNodes = [];
    this.isOpen = false;

    this.el = document.createElement('div');
    this.el.id = 'admin-panel';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <header>
        <span>ADMIN / DEBUG</span>
        <span class="admin-actions">
          <button data-act="off" title="Desactivar modo Admin">Desactivar</button>
          <button data-act="close" title="Cerrar (Esc)">✕</button>
        </span>
      </header>
      <div class="admin-body"></div>
      <footer>Escribe <b>admin</b> para mostrar/ocultar · Esc para cerrar</footer>`;
    this._body = this.el.querySelector('.admin-body');
    this.el.querySelector('[data-act="close"]').addEventListener('click', onClose);
    this.el.querySelector('[data-act="off"]').addEventListener('click', onDeactivate);
    // Evita que los clics del panel lleguen al canvas (que pediría pointer lock).
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());
    container.appendChild(this.el);
  }

  setOpen(open) {
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
    if (open) this.refreshInfo();
  }

  render(tools) {
    this._body.innerHTML = '';
    this._infoNodes = [];
    const byCategory = new Map();
    for (const t of tools) {
      if (!byCategory.has(t.category)) byCategory.set(t.category, []);
      byCategory.get(t.category).push(t);
    }
    for (const [category, list] of byCategory) {
      const section = document.createElement('section');
      section.innerHTML = `<h3>${escapeHtml(category)}</h3>`;
      for (const tool of list) section.appendChild(this._renderTool(tool));
      this._body.appendChild(section);
    }
    if (this.isOpen) this.refreshInfo();
  }

  refreshInfo() {
    for (const { tool, node } of this._infoNodes) {
      try {
        node.textContent = tool.read();
      } catch {
        node.textContent = '—';
      }
    }
  }

  _renderTool(tool) {
    const row = document.createElement('div');
    row.className = `admin-tool admin-${tool.type}`;

    if (tool.type === 'info') {
      row.innerHTML = `<span class="label">${escapeHtml(tool.label)}</span><span class="value"></span>`;
      this._infoNodes.push({ tool, node: row.querySelector('.value') });
    } else if (tool.type === 'input') {
      row.innerHTML = `<input type="text" placeholder="${escapeHtml(tool.placeholder ?? '')}"><button>${escapeHtml(tool.label)}</button>`;
      const field = row.querySelector('input');
      const go = () => this._safeRun(tool, () => tool.run(field.value));
      row.querySelector('button').addEventListener('click', go);
      field.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    } else {
      row.innerHTML = `<button>${escapeHtml(tool.label)}</button>`;
      row.querySelector('button').addEventListener('click', () => this._safeRun(tool, () => tool.run()));
    }
    return row;
  }

  _safeRun(tool, fn) {
    try {
      fn();
      this.refreshInfo();
    } catch (err) {
      console.error(err);
      this._onToolError?.(tool, err);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
