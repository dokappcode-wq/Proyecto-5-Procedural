import { GameEvents } from '../core/GameEvents.js';

/**
 * CraftingPanel — panel de fabricación (Tab). Solo vista:
 * lee las recetas de CraftingSystem (consulta de solo lectura) y pide fabricar
 * emitiendo CRAFT_REQUEST.
 *
 * Mientras está abierto libera el ratón y bloquea la entrada de juego.
 */
export class CraftingPanel {
  constructor({ container, crafting, input, events }) {
    this.name = 'craftingPanel';
    this._crafting = crafting;
    this._input = input;
    this._events = events;
    this.isOpen = false;
    this._closeRequested = false;

    this.el = document.createElement('div');
    this.el.id = 'crafting-panel';
    this.el.className = 'hidden';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Fabricación');
    this.el.innerHTML = `
      <header><span>Fabricación</span><button type="button" class="close" aria-label="Cerrar">✕</button></header>
      <div class="recipes"></div>
      <footer><kbd>Tab</kbd> o <kbd>Esc</kbd> para cerrar</footer>`;
    this._list = this.el.querySelector('.recipes');
    this.el.querySelector('.close').addEventListener('click', () => this.setOpen(false));
    container.appendChild(this.el);

    // Cerrar con Tab/Esc aunque la entrada de juego esté bloqueada. Se aplica en
    // update() para que la misma pulsación de Tab no vuelva a abrir el panel.
    input.onRawKey((e) => {
      if (this.isOpen && (e.code === 'Tab' || e.code === 'Escape')) this._closeRequested = true;
    });
    events.on(GameEvents.INVENTORY_CHANGED, () => this.isOpen && this.render());
  }

  /** @returns {boolean} true si ha gestionado la entrada este frame */
  update() {
    if (this._closeRequested) {
      this._closeRequested = false;
      this.setOpen(false);
      return true;
    }
    if (this._input.wasPressed('CRAFTING')) {
      this.setOpen(!this.isOpen);
      return true;
    }
    return false;
  }

  setOpen(open) {
    if (this.isOpen === open) return;
    this.isOpen = open;
    this.el.classList.toggle('hidden', !open);
    this._input.setBlocked('crafting', open);
    if (open) {
      this._input.exitPointerLock();
      this.render();
    } else {
      this._input.requestPointerLock();
    }
    this._events.emit(GameEvents.CRAFTING_PANEL_TOGGLED, { open });
  }

  render() {
    this._list.replaceChildren();
    for (const r of this._crafting.getRecipes()) {
      const card = document.createElement('div');
      card.className = `recipe${r.canCraft ? ' ready' : ''}`;
      const title = document.createElement('div');
      title.className = 'recipe-title';
      title.textContent = `${r.icon} ${r.name}${r.amount > 1 ? ` ×${r.amount}` : ''}`;
      const ing = document.createElement('ul');
      ing.className = 'ingredients';
      for (const i of r.ingredients) {
        const li = document.createElement('li');
        li.className = i.have >= i.amount ? 'ok' : 'missing';
        li.textContent = `${i.icon} ${i.name} ${Math.min(i.have, i.amount)}/${i.amount}`;
        ing.appendChild(li);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Fabricar';
      btn.disabled = !r.canCraft;
      btn.addEventListener('click', () => this._events.emit(GameEvents.CRAFT_REQUEST, { recipeId: r.id }));
      card.append(title, ing, btn);
      this._list.appendChild(card);
    }
  }
}
