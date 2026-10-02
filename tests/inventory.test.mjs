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
  assert.equal(C.RESOURCE_TYPES.TREE.HARVEST.CHOP_TIME, 15, '15 s con el puño');
  assert.ok(C.ITEMS.STONE_AXE.TOOL.CHOP_SPEED > 1, 'el hacha tala más deprisa');
  assert.ok(C.RECIPES.STONE_AXE, 'el hacha se fabrica');
  const rock = C.RESOURCE_TYPES.ROCK;
  assert.equal(rock.BREAK.TOOL, 'MINE_SPEED', 'las rocas solo se rompen con pico');
  assert.ok(rock.BREAK.FIST_DAMAGE > 0, 'a puñetazos duele');
  assert.equal(rock.HARVEST.REMOVE_WHEN_EMPTY, false, 'coger piedras sueltas no rompe la roca');
  assert.ok(C.ITEMS.STONE_PICKAXE.TOOL.MINE_SPEED > 0 && C.RECIPES.STONE_PICKAXE, 'el pico existe y se fabrica');
});

test('fabricación: categorías y cuántas veces se puede fabricar', async () => {
  const { CraftingSystem } = await import('../js/crafting/CraftingSystem.js');
  const { events, inv } = setup();
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory: inv, events });
  inv.addItem('REFINED_LEATHER', 7);
  const r = Object.fromEntries(crafting.getRecipes().map((x) => [x.id, x]));
  assert.equal(r.LEATHER_SHIRT.max, 2);
  assert.equal(r.LEATHER_GLOVES.max, 7);
  assert.equal(r.WATERSKIN.max, 0, 'falta madera');
  for (const id of ['LEATHER_CAP', 'LEATHER_SHIRT', 'LEATHER_PANTS', 'LEATHER_SHOES', 'LEATHER_GLOVES', 'WATERSKIN', 'REFINED_LEATHER']) {
    assert.equal(r[id].station, 'REFINERY', `${id} se hace en la mesa de refinería`);
  }
  for (const x of Object.values(r)) assert.ok(x.time > 0, `${x.id} tarda algo`);
  assert.deepEqual(C.RECIPES.REFINED_STONE.INGREDIENTS, { STONE: 4 });
  assert.deepEqual(C.RECIPES.REFINED_WOOD.INGREDIENTS, { WOOD: 2 });
  assert.deepEqual(C.RECIPES.REFINERY_KIT.INGREDIENTS, { REFINED_STONE: 4, REFINED_WOOD: 2 });
  assert.deepEqual(C.RECIPES.REFINED_LEATHER.INGREDIENTS, { LEATHER: 1 });
  assert.deepEqual(C.RECIPES.ROPE.INGREDIENTS, { SPIDER_SILK: 5 });
  for (const t of ['STONE_AXE', 'STONE_PICKAXE']) assert.deepEqual(C.RECIPES[t].INGREDIENTS, { REFINED_WOOD: 3, REFINED_STONE: 2, ROPE: 2 }, `${t}: 3 maderas y 2 piedras refinadas + 2 cuerdas`);
  for (const x of Object.values(r)) assert.ok(C.RECIPE_CATEGORIES[x.category], `${x.id}: categoría conocida`);
});

test('tirar: se saca de un hueco o de la mano', () => {
  const { inv } = setup();
  inv.addItem('STONE', 10);
  assert.deepEqual(inv.takeFromSlot(0, 3), { id: 'STONE', count: 3 });
  assert.equal(inv.getItemCount('STONE'), 7);
  inv.click(0);
  assert.deepEqual(inv.takeCursor(1), { id: 'STONE', count: 1 });
  assert.deepEqual(inv.takeCursor(), { id: 'STONE', count: 6 });
  assert.equal(inv.cursor, null);
  assert.equal(inv.getItemCount('STONE'), 0);
  assert.equal(inv.takeFromSlot(0, 1), null);
});

test('telarañas: entre dos árboles cercanos, dan 5–10 telarañas y con 5 se hace una cuerda', async () => {
  const { ResourceSystem } = await import('../js/world/ResourceSystem.js');
  const { loadSystem } = await import('../js/systemdata/SystemLoader.js');
  const fs = await import('node:fs');
  const eden = loadSystem(fs.readFileSync(new URL('../systems/jardin-del-eden.system.json', import.meta.url), 'utf8'), { seed: 1 });
  const res = new ResourceSystem({
    config: eden.system.bodies[0].profile.RESOURCES, types: C.RESOURCE_TYPES, seed: 4321,
    world: {
      chunkSize: 64, half: 512, chunkCount: 16, seaLevel: 0, spawn: { x: 9999, z: 9999 },
      heightAt: () => 5, sample: () => ({ biomes: { PLAINS: 0, FOREST: 1, FROZEN_MOUNTAINS: 0 } }), isWater: () => false,
    },
  });
  const webs = [];
  for (let c = 0; c < 16; c++) webs.push(...res.getChunk(c, 3).nodes.filter((n) => n.type === 'COBWEB'));
  assert.ok(webs.length > 0, 'hay telarañas en el bosque');
  for (const w of webs) {
    assert.ok(w.remaining >= 5 && w.remaining <= 10 && w.total === w.remaining, `${w.remaining} telarañas`);
    assert.equal(w.radius, 0, 'no estorban al pasar');
  }
  // Reproducible con la misma seed.
  const again = res.getChunk(0, 3).nodes.filter((n) => n.type === 'COBWEB').length;
  assert.equal(again, res.getChunk(0, 3).nodes.filter((n) => n.type === 'COBWEB').length);
  assert.deepEqual(C.RECIPES.ROPE.INGREDIENTS, { SPIDER_SILK: 5 });
});

test('herramientas: 15 s de fabricación y aguante que se gasta golpe a golpe hasta romperse', () => {
  const { events, inv } = setup();
  const broken = [];
  events.on(GameEvents.TOOL_BROKEN, (e) => broken.push(e.itemId));
  for (const t of ['STONE_AXE', 'STONE_PICKAXE']) {
    assert.equal(C.RECIPES[t].TIME, 15, `${t} tarda 15 s`);
    assert.ok(C.ITEMS[t].DURABILITY > 0, `${t} tiene aguante`);
  }
  const max = C.ITEMS.STONE_AXE.DURABILITY;
  inv.addItem('STONE_AXE', 1);
  assert.equal(inv.slots[0].dur, max, 'nueva, con todo el aguante');
  inv.wearSlot(0, 5);
  assert.equal(inv.slots[0].dur, max - 5);
  // Moverla con el ratón, de una en una o por Shift no la "repara".
  inv.click(0);
  inv.click(12);
  assert.equal(inv.slots[12].dur, max - 5);
  inv.click(12, { shift: true });
  assert.equal(inv.slots[0].dur, max - 5);
  inv.click(0);
  inv.returnCursor();
  assert.equal(inv.slots[0].dur, max - 5);
  // Tirarla y volver a cogerla conserva el aguante.
  const got = inv.takeFromSlot(0, 1);
  assert.equal(got.dur, max - 5);
  inv.addItem(got.id, 1, { dur: got.dur });
  assert.equal(inv.slots[0].dur, max - 5);
  // Guardar/viajar.
  const snap = inv.snapshot();
  inv.restore(snap);
  assert.equal(inv.slots[0].dur, max - 5);
  // Se rompe al llegar a 0.
  assert.equal(inv.wearSlot(0, max), true);
  assert.equal(inv.slots[0], null);
  assert.deepEqual(broken, ['STONE_AXE']);
});
