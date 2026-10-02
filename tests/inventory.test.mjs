/**
 * Inventario por huecos: barra 9×1 + mochila 9×3, pilas de 100, ropa en 5 ranuras.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { HotbarSystem } from '../js/inventory/HotbarSystem.js';

function setup() {
  const events = new EventBus();
  const full = [];
  events.on(GameEvents.INVENTORY_FULL, (e) => full.push(e));
  const inv = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const eq = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory: inv, events });
  return { events, full, inv, eq };
}
const ids = (inv, from, to) => inv.slots.slice(from, to).map((s) => (s ? `${s.id}:${s.count}` : '-'));

test('36 huecos (9 de barra + 27 de mochila) y pilas de 100', () => {
  const { inv, full } = setup();
  assert.equal(inv.slots.length, 36);
  assert.equal(inv.hotbarSize, 9);
  assert.equal(inv.addItem('WOOD', 250), 250);
  assert.deepEqual(ids(inv, 0, 4), ['WOOD:100', 'WOOD:100', 'WOOD:50', '-']);
  inv.addItem('STONE', 10);
  inv.addItem('WOOD', 60);
  assert.deepEqual(ids(inv, 0, 5), ['WOOD:100', 'WOOD:100', 'WOOD:100', 'STONE:10', 'WOOD:10'], 'primero completa pilas, luego hueco libre');
  assert.equal(inv.getItemCount('WOOD'), 310);
  assert.equal(full.length, 0);
  // La ropa no se apila.
  inv.addItem('LEATHER_GLOVES', 2);
  assert.equal(inv.slots.filter((s) => s?.id === 'LEATHER_GLOVES').length, 2);
});

test('lleno: lo que no cabe se avisa (y el juego lo deja en una bolsa)', () => {
  const { inv, full } = setup();
  assert.equal(inv.addItem('STONE', 36 * 100 + 7), 3600);
  assert.deepEqual(full, [{ itemId: 'STONE', amount: 7 }]);
  assert.equal(inv.roomFor('STONE'), 0);
  assert.equal(inv.addItem('WOOD', 1, { quiet: true }), 0);
  assert.equal(full.length, 1, 'quiet: sin aviso');
});

test('gastar: primero de la mochila y de las pilas pequeñas (la barra se conserva)', () => {
  const { inv } = setup();
  inv.addItem('WOOD', 30); // hueco 0
  inv.slots[12] = { id: 'WOOD', count: 5 };
  assert.ok(inv.removeItem('WOOD', 8));
  assert.deepEqual([inv.slots[0].count, inv.slots[12]], [27, null]);
  assert.ok(!inv.removeItem('WOOD', 100), 'sin suficientes no se quita nada');
  assert.equal(inv.getItemCount('WOOD'), 27);
});

test('ratón: coger, dejar, juntar, cambiar, la mitad y de una en una', () => {
  const { inv } = setup();
  inv.addItem('WOOD', 90);
  inv.addItem('STONE', 7);
  inv.click(0); // coge la madera
  assert.deepEqual([inv.cursor, inv.slots[0]], [{ id: 'WOOD', count: 90 }, null]);
  inv.click(1); // la cambia por la piedra
  assert.deepEqual([inv.cursor.id, inv.slots[1].id], ['STONE', 'WOOD']);
  inv.click(20); // deja la piedra en la mochila
  assert.equal(inv.cursor, null);
  inv.click(1, { button: 2 }); // la mitad de la madera
  assert.deepEqual([inv.cursor.count, inv.slots[1].count], [45, 45]);
  inv.click(2, { button: 2 }); // deja una
  inv.click(2, { button: 2 }); // y otra
  assert.deepEqual([inv.cursor.count, inv.slots[2].count], [43, 2]);
  inv.addItem('WOOD', 55); // completa el hueco 1 (45 → 100)
  assert.equal(inv.slots[1].count, 100);
  inv.click(1); // juntar con un hueco lleno: se cambian
  assert.deepEqual([inv.slots[1].count, inv.cursor.count], [43, 100]);
  inv.click(2); // junta 98 en el hueco 2 (2 + 98 = 100)
  assert.deepEqual([inv.slots[2].count, inv.cursor.count], [100, 2]);
  inv.returnCursor();
  assert.equal(inv.cursor, null);
  assert.equal(inv.getItemCount('WOOD'), 90 + 55, 'no se pierde ni se duplica nada');
});

test('Shift + clic: barra ↔ mochila, y la ropa directa a su ranura', () => {
  const { inv, eq } = setup();
  inv.addItem('APPLE', 5); // hueco 0 (barra)
  inv.click(0, { shift: true });
  assert.equal(inv.slots[0], null);
  assert.equal(inv.slots[9].id, 'APPLE', 'a la mochila');
  inv.click(9, { shift: true });
  assert.equal(inv.slots[0].id, 'APPLE', 'y de vuelta a la barra');
  inv.addItem('LEATHER_PANTS', 1);
  inv.click(1, { shift: true });
  assert.equal(eq.slots.LEGS, 'LEATHER_PANTS');
  assert.equal(inv.getItemCount('LEATHER_PANTS'), 0);
  inv.click('eq:LEGS', { shift: true });
  assert.equal(eq.slots.LEGS, null);
  assert.equal(inv.getItemCount('LEATHER_PANTS'), 1, 'quitada, vuelve al inventario');
});

test('barra rápida: los huecos 1–9; el seleccionado sigue al contenido del hueco', () => {
  const { events, inv } = setup();
  const pressed = new Set();
  const hotbar = new HotbarSystem({ input: { wasPressed: (a) => pressed.has(a) }, inventory: inv, events });
  inv.addItem('MEAT', 3);
  pressed.add('HOTBAR_1');
  hotbar.update();
  assert.equal(hotbar.selectedId, 'MEAT');
  hotbar.update(); // la misma tecla otra vez deselecciona
  assert.equal(hotbar.selectedIndex, null);
  pressed.clear();
  pressed.add('HOTBAR_4');
  hotbar.update();
  assert.equal(hotbar.selectedId, null, 'hueco vacío');
  inv.click(0);
  inv.click(3);
  assert.equal(hotbar.selectedId, 'MEAT');
});

test('cinco prendas de cuero: fabricables y cada una en su ranura', () => {
  const pieces = { HEAD: 'LEATHER_CAP', CHEST: 'LEATHER_SHIRT', LEGS: 'LEATHER_PANTS', FEET: 'LEATHER_SHOES', HANDS: 'LEATHER_GLOVES' };
  assert.deepEqual(Object.keys(C.EQUIPMENT.SLOTS), Object.keys(pieces));
  for (const [slot, id] of Object.entries(pieces)) {
    assert.equal(C.ITEMS[id].SLOT, slot);
    assert.equal(C.ITEMS[id].STACK, 1);
    assert.ok(C.RECIPES[id], `${id} tiene receta`);
  }
});

test('árboles: más grandes, se talan a golpes (un trozo de madera por golpe)', () => {
  for (const id of ['TREE', 'PINE']) {
    const t = C.RESOURCE_TYPES[id];
    assert.equal(t.HARVEST.METHOD, 'HIT', `${id} se golpea`);
    assert.equal(t.HARVEST.ITEM, 'WOOD');
    assert.ok(t.SCALE[0] >= 1.5, `${id} es grande`);
    assert.ok(t.SCALE_COLLISION, `${id}: el tronco choca según su tamaño`);
  }
  assert.ok(!C.RESOURCE_TYPES.APPLE_TREE.HARVEST.METHOD, 'las manzanas se siguen cogiendo con E');
});

test('fabricación: categorías y cuántas veces se puede fabricar', async () => {
  const { CraftingSystem } = await import('../js/crafting/CraftingSystem.js');
  const { events, inv } = setup();
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory: inv, events });
  inv.addItem('LEATHER', 7);
  const r = Object.fromEntries(crafting.getRecipes().map((x) => [x.id, x]));
  assert.equal(r.LEATHER_SHIRT.max, 2);
  assert.equal(r.LEATHER_GLOVES.max, 7);
  assert.equal(r.WATERSKIN.max, 0, 'falta madera');
  for (const x of Object.values(r)) assert.ok(C.RECIPE_CATEGORIES[x.category], `${x.id}: categoría conocida`);
});
