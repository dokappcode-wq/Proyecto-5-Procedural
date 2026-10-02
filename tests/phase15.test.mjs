/**
 * v1.15: construcción por objetos, cofres, horno, mesa de elaboración, armas, escudos y armaduras.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { CraftingSystem } from '../js/crafting/CraftingSystem.js';

const make = () => {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const equipment = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory, events });
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory, events });
  return { events, inventory, equipment, crafting };
};

test('cada pieza de construcción es un objeto con su receta y la pieza cuesta ese objeto', () => {
  for (const [type, def] of Object.entries(C.BUILD.PIECES)) {
    const [item, n] = Object.entries(def.COST)[0];
    assert.equal(n, 1, type);
    assert.equal(C.ITEMS[item].BUILD_PIECE, type, `${item} coloca ${type}`);
    assert.ok(Object.values(C.RECIPES).some((r) => r.RESULT === item), `${item} se fabrica`);
  }
  assert.deepEqual(C.RECIPES.PIECE_FURNACE.INGREDIENTS, { REFINED_STONE: 10, REFINED_WOOD: 2 });
  assert.deepEqual(C.RECIPES.PIECE_WORKBENCH.INGREDIENTS, { REFINED_IRON: 5, REFINED_COPPER: 5 });
});

test('recetas de la lista: armas, flechas, antorcha, placa de navegación y armaduras', () => {
  const R = C.RECIPES;
  assert.deepEqual(R.STONE_SWORD.INGREDIENTS, { REFINED_WOOD: 2, REFINED_STONE: 4, ROPE: 1 });
  assert.deepEqual(R.SLINGSHOT.INGREDIENTS, { REFINED_WOOD: 4, ROPE: 2 });
  assert.deepEqual(R.BOW.INGREDIENTS, { REFINED_WOOD: 6, ROPE: 4 });
  assert.deepEqual([R.ARROW.INGREDIENTS, R.ARROW.AMOUNT], [{ WOOD: 3, STONE: 1, SPIDER_SILK: 3 }, 3]);
  assert.deepEqual(R.TORCH.INGREDIENTS, { WOOD: 1, COAL: 1 });
  assert.deepEqual([R.NAV_PLATE.INGREDIENTS, R.NAV_PLATE.STATION], [{ GLASS: 20, REFINED_IRON: 5, REFINED_COPPER: 5 }, 'WORKBENCH']);
  assert.deepEqual(R.COPPER_SWORD.INGREDIENTS, { REFINED_WOOD: 2, REFINED_COPPER: 2 });
  assert.deepEqual(R.IRON_SWORD.INGREDIENTS, { REFINED_WOOD: 2, REFINED_IRON: 2 });
  assert.deepEqual(R.COPPER_SHIELD.INGREDIENTS, { REFINED_WOOD: 4, REFINED_COPPER: 1 });
  assert.deepEqual(R.IRON_SHIELD.INGREDIENTS, { REFINED_WOOD: 4, REFINED_IRON: 1 });
  const cu = ['COPPER_HELMET', 'COPPER_GLOVES', 'COPPER_BOOTS', 'COPPER_LEGS', 'COPPER_CHEST'].map((k) => R[k].INGREDIENTS.REFINED_COPPER);
  const fe = ['CHAIN_HELMET', 'CHAIN_GLOVES', 'CHAIN_BOOTS', 'CHAIN_LEGS', 'CHAIN_CHEST'].map((k) => R[k].INGREDIENTS.REFINED_IRON);
  assert.deepEqual(cu, [2, 1, 2, 4, 5]);
  assert.deepEqual(fe, [2, 1, 2, 4, 5]);
  const I = C.ITEMS;
  assert.deepEqual([I.STONE_SWORD.WEAPON.DAMAGE, I.STONE_SWORD.DURABILITY], [10, 400]);
  assert.deepEqual([I.COPPER_SWORD.WEAPON.DAMAGE, I.COPPER_SWORD.DURABILITY], [12, 600]);
  assert.deepEqual([I.IRON_SWORD.WEAPON.DAMAGE, I.IRON_SWORD.DURABILITY], [15, 400]);
  assert.deepEqual([I.SLINGSHOT.RANGED.DAMAGE, I.SLINGSHOT.DURABILITY, I.SLINGSHOT.RANGED.AMMO], [5, 400, ['STONE']]);
  assert.equal(I.BOW.DURABILITY, 400);
  assert.equal(I.ARROW.AMMO.DAMAGE, 10);
  assert.deepEqual([I.COPPER_SHIELD.DURABILITY, I.IRON_SHIELD.DURABILITY], [50, 100]);
  // Cada armadura mejor defiende más.
  const total = (ids) => ids.reduce((a, id) => a + I[id].DEFENSE, 0);
  const leather = total(['LEATHER_CAP', 'LEATHER_SHIRT', 'LEATHER_PANTS', 'LEATHER_SHOES', 'LEATHER_GLOVES']);
  const copper = total(['COPPER_HELMET', 'COPPER_CHEST', 'COPPER_LEGS', 'COPPER_BOOTS', 'COPPER_GLOVES']);
  const chain = total(['CHAIN_HELMET', 'CHAIN_CHEST', 'CHAIN_LEGS', 'CHAIN_BOOTS', 'CHAIN_GLOVES']);
  assert.ok(leather < copper && copper < chain, `${leather} < ${copper} < ${chain}`);
});

test('el horno funde con carbón y solo en el horno', () => {
  const { inventory, crafting } = make();
  inventory.addItem('IRON_ORE', 2);
  inventory.addItem('COAL', 1);
  assert.equal(crafting.craft('REFINED_IRON'), false, 'sin estar en el horno');
  assert.equal(crafting.craft('REFINED_IRON', { station: 'FURNACE' }), true);
  crafting.update(20);
  assert.equal(inventory.getItemCount('REFINED_IRON'), 2);
  assert.equal(inventory.getItemCount('COAL'), 0);
});

test('en un cuerpo sin madera las piezas se fabrican con piedra (y cancelar devuelve lo gastado)', () => {
  const { events, inventory, crafting } = make();
  events.emit('world:bodyChanged', { id: 'P1M1', planet: { BUILD_SUBSTITUTE: { WOOD: 'STONE' } } });
  inventory.addItem('STONE', 3);
  assert.deepEqual(crafting.ingredients('PIECE_WALL'), { STONE: 3 });
  assert.equal(crafting.craft('PIECE_WALL'), true);
  crafting.cancel(crafting.queue[0].uid);
  assert.equal(inventory.getItemCount('STONE'), 3);
});

test('cofre: clics y Shift+clic entre el cofre y el inventario', () => {
  const { inventory } = make();
  const chest = { slots: new Array(27).fill(null) };
  inventory.addItem('WOOD', 30);
  inventory.attachContainer(chest);
  inventory.click(0, { shift: true });
  assert.deepEqual(chest.slots[0], { id: 'WOOD', count: 30 });
  assert.equal(inventory.getItemCount('WOOD'), 0);
  inventory.click('c:0', { button: 2 }); // la mitad al cursor
  inventory.click(5);
  assert.equal(inventory.slots[5].count, 15);
  inventory.click('c:0', { shift: true });
  assert.equal(chest.slots[0], null);
  assert.equal(inventory.getItemCount('WOOD'), 30);
});

test('el escudo va en su ranura y conserva su aguante; al gastarse se rompe', () => {
  const { events, inventory, equipment } = make();
  let broken = null;
  events.on('inventory:toolBroken', ({ itemId }) => (broken = itemId));
  inventory.addItem('COPPER_SHIELD', 1);
  assert.equal(equipment.wear('COPPER_SHIELD'), true);
  assert.equal(equipment.slots.OFFHAND, 'COPPER_SHIELD');
  equipment.wearSlot('OFFHAND', 10);
  assert.equal(equipment.dur.OFFHAND, 40);
  equipment.takeOff('OFFHAND');
  assert.equal(inventory.slots.find((s) => s?.id === 'COPPER_SHIELD').dur, 40);
  equipment.wear('COPPER_SHIELD');
  assert.equal(equipment.dur.OFFHAND, 40);
  equipment.wearSlot('OFFHAND', 40);
  assert.equal(equipment.slots.OFFHAND, null);
  assert.equal(broken, 'COPPER_SHIELD');
});
