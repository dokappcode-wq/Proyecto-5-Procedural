/**
 * Tests de las FASES 7–9: nutrición, fabricación, equipamiento, odre, barra
 * rápida y sueño. Sin navegador: `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { HungerSystem } from '../js/player/HungerSystem.js';
import { ThirstSystem } from '../js/player/ThirstSystem.js';
import { EnergySystem } from '../js/player/EnergySystem.js';
import { NutritionSystem, DietState } from '../js/nutrition/NutritionSystem.js';
import { CraftingSystem } from '../js/crafting/CraftingSystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { HotbarSystem } from '../js/inventory/HotbarSystem.js';
import { ItemUseSystem } from '../js/inventory/ItemUseSystem.js';
import { SleepSystem } from '../js/player/SleepSystem.js';
import { SHAPES } from '../js/construction/BuildRules.js';

const C = GameConfig;

function world() {
  const events = new EventBus();
  const messages = [];
  events.on(GameEvents.UI_MESSAGE, (m) => messages.push(m.text));
  const pressed = new Set();
  const input = {
    blocked: false,
    blockers: new Set(),
    wasPressed: (a) => pressed.has(a),
    setBlocked(r, b) { if (b) this.blockers.add(r); else this.blockers.delete(r); },
  };
  const inventory = new InventorySystem({ items: C.ITEMS, events });
  const hunger = new HungerSystem({ config: C.SURVIVAL, events });
  const thirst = new ThirstSystem({ config: C.SURVIVAL, events });
  const energy = new EnergySystem({ config: C.SURVIVAL, events, player: { state: { isRunning: false } } });
  const nutrition = new NutritionSystem({ config: C.NUTRITION, items: C.ITEMS, hunger, events });
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory, events });
  const equipment = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory, events });
  const hotbar = new HotbarSystem({ input, inventory, events });
  const interaction = { target: null };
  const itemUse = new ItemUseSystem({
    items: C.ITEMS, equipmentConfig: C.EQUIPMENT, input, hotbar, inventory, nutrition, equipment,
    interaction, thirst, events,
  });
  return { events, messages, pressed, input, inventory, hunger, thirst, energy, nutrition, crafting, equipment, hotbar, interaction, itemUse };
}

// ---- Fase 7: alimentación ------------------------------------------------------

test('comer recupera hambre según MEAT_NUTRITION / APPLE_NUTRITION y consume el objeto', () => {
  const w = world();
  w.hunger.set(40);
  w.inventory.addItem('MEAT', 2);
  w.inventory.addItem('APPLE', 1);
  assert.ok(w.itemUse.use('MEAT'));
  assert.equal(w.hunger.value, 40 + C.NUTRITION.MEAT_NUTRITION);
  assert.ok(w.itemUse.use('APPLE'));
  assert.equal(w.hunger.value, 40 + C.NUTRITION.MEAT_NUTRITION + C.NUTRITION.APPLE_NUTRITION);
  assert.equal(w.inventory.getItemCount('MEAT'), 1);
  assert.equal(w.inventory.getItemCount('APPLE'), 0);
});

test('con el hambre llena no se come ni se gasta comida', () => {
  const w = world();
  w.inventory.addItem('APPLE', 1);
  assert.ok(!w.itemUse.use('APPLE'));
  assert.equal(w.inventory.getItemCount('APPLE'), 1);
  assert.ok(w.messages.includes('No tienes hambre.'));
});

test('dieta: solo carne → desequilibrada; mezclada → equilibrada', () => {
  const w = world();
  const eat = (id, n) => { for (let i = 0; i < n; i++) { w.hunger.set(0); w.nutrition.eat(id); } };
  eat('MEAT', 3);
  assert.equal(w.nutrition.state, DietState.TOO_MUCH_ANIMAL);
  assert.ok(w.nutrition.isUnbalanced);
  eat('APPLE', 6); // 90 animal vs 84 vegetal
  assert.equal(w.nutrition.state, DietState.BALANCED);
  eat('APPLE', 10);
  assert.equal(w.nutrition.state, DietState.TOO_MUCH_PLANT);
});

test('dieta: poca comida reciente no se juzga y el tiempo la olvida', () => {
  const w = world();
  w.hunger.set(0);
  w.nutrition.eat('APPLE');
  assert.equal(w.nutrition.state, DietState.UNKNOWN);
  for (let i = 0; i < 4; i++) { w.hunger.set(0); w.nutrition.eat('MEAT'); }
  assert.equal(w.nutrition.state, DietState.TOO_MUCH_ANIMAL);
  w.nutrition.update(C.NUTRITION.DIET_MEMORY * 5);
  assert.equal(w.nutrition.state, DietState.UNKNOWN);
});

// ---- Fase 9: fabricación ----------------------------------------------------------

test('fabricar consume los ingredientes, tarda su tiempo y da el resultado', () => {
  const w = world();
  assert.ok(!w.crafting.canCraft('REFINED_WOOD'));
  w.inventory.addItem('WOOD', 5);
  w.events.emit(GameEvents.CRAFT_REQUEST, { recipeId: 'REFINED_WOOD' });
  assert.equal(w.inventory.getItemCount('WOOD'), 3, 'los ingredientes se gastan al empezar');
  assert.equal(w.inventory.getItemCount('REFINED_WOOD'), 0, 'todavía no está hecho');
  w.crafting.update(C.RECIPES.REFINED_WOOD.TIME - 0.1);
  assert.equal(w.inventory.getItemCount('REFINED_WOOD'), 0);
  w.crafting.update(0.2);
  assert.equal(w.inventory.getItemCount('REFINED_WOOD'), 1, 'sale al terminar');
  // Cola y cancelar.
  assert.ok(w.crafting.craft('REFINED_WOOD'));
  assert.ok(!w.crafting.craft('REFINED_STONE'), 'sin materiales no fabrica');
  w.crafting.cancel(w.crafting.queue[0].uid);
  assert.equal(w.inventory.getItemCount('WOOD'), 3, 'cancelar devuelve los materiales');
  // Recetas de estación: solo en la mesa de refinería.
  w.inventory.addItem('LEATHER', 2);
  assert.ok(!w.crafting.craft('REFINED_LEATHER'), 'fuera de la mesa no');
  assert.ok(w.crafting.craft('REFINED_LEATHER', { station: 'REFINERY' }));
  w.crafting.update(C.RECIPES.REFINED_LEATHER.TIME + 0.1);
  assert.equal(w.inventory.getItemCount('REFINED_LEATHER'), 1);
});

test('todas las recetas producen objetos definidos con ingredientes definidos', () => {
  for (const [id, r] of Object.entries(C.RECIPES)) {
    assert.ok(C.ITEMS[r.RESULT], `${id}: resultado desconocido`);
    for (const ing of Object.keys(r.INGREDIENTS)) assert.ok(C.ITEMS[ing], `${id}: ingrediente ${ing}`);
  }
  for (const [id, piece] of Object.entries(C.BUILD.PIECES)) {
    assert.ok(SHAPES[id], `${id}: pieza sin forma en BuildRules`);
    for (const item of Object.keys(piece.COST)) assert.ok(C.ITEMS[item], `${id}: material ${item}`);
  }
});

// ---- Fase 8: armadura y odre -----------------------------------------------------

test('ropa: cinco ranuras, sale del inventario al ponérsela y abriga sumando', () => {
  const w = world();
  assert.deepEqual(Object.keys(w.equipment.slots), ['HEAD', 'CHEST', 'LEGS', 'FEET', 'HANDS']);
  assert.equal(w.equipment.getColdLossMultiplier(), 1);
  assert.ok(!w.equipment.wear('LEATHER_SHIRT'), 'no se pone sin tenerla');
  for (const id of ['LEATHER_CAP', 'LEATHER_SHIRT', 'LEATHER_PANTS', 'LEATHER_SHOES', 'LEATHER_GLOVES']) {
    w.inventory.addItem(id, 1);
    assert.ok(w.itemUse.use(id));
    assert.equal(w.inventory.getItemCount(id), 0, `${id}: puesto, ya no ocupa hueco`);
  }
  assert.deepEqual(w.equipment.slots, { HEAD: 'LEATHER_CAP', CHEST: 'LEATHER_SHIRT', LEGS: 'LEATHER_PANTS', FEET: 'LEATHER_SHOES', HANDS: 'LEATHER_GLOVES' });
  assert.ok(Math.abs(w.equipment.getColdLossMultiplier() - 0.7) < 1e-9, 'el conjunto entero abriga un 30 %');
  // Usarla otra vez la quita (vuelve al inventario).
  w.itemUse.use('LEATHER_CAP');
  assert.equal(w.equipment.slots.HEAD, 'LEATHER_CAP', 'sin otra en el inventario no se puede "usar"');
  assert.ok(w.equipment.takeOff('HEAD'));
  assert.equal(w.inventory.getItemCount('LEATHER_CAP'), 1);
  // Una prenda no va en otra ranura; la mano (cursor) la cambia por la puesta.
  w.inventory.addItem('LEATHER_SHIRT', 1);
  const i = w.inventory.slots.findIndex((s) => s?.id === 'LEATHER_SHIRT');
  w.inventory.click(i);
  assert.ok(!w.inventory.click('eq:HEAD'), 'la camiseta no va en la cabeza');
  assert.ok(w.inventory.click('eq:CHEST'));
  assert.equal(w.inventory.cursor.id, 'LEATHER_SHIRT', 'se cambia por la que llevaba');
  w.inventory.returnCursor();
  assert.equal(w.inventory.cursor, null);
});

test('odre: se llena mirando al agua hasta su capacidad y se bebe de él', () => {
  const w = world();
  w.inventory.addItem('WATER', 2);
  assert.equal(w.inventory.getItemCount('WATER'), 0, 'sin odre el agua no se puede llevar');
  w.inventory.addItem('WATERSKIN', 1);
  w.itemUse.use('WATERSKIN');
  assert.ok(w.messages.at(-1).includes('vacío'));
  w.interaction.target = { kind: 'water' };
  w.itemUse.use('WATERSKIN');
  assert.equal(w.inventory.getItemCount('WATER'), C.EQUIPMENT.WATER_CAPACITY);
  w.itemUse.use('WATERSKIN');
  assert.equal(w.inventory.getItemCount('WATER'), C.EQUIPMENT.WATER_CAPACITY, 'no se desborda');
  w.interaction.target = null;
  w.thirst.set(10);
  w.itemUse.use('WATERSKIN');
  assert.equal(w.thirst.value, 10 + C.SURVIVAL.DRINK_AMOUNT);
  assert.equal(w.inventory.getItemCount('WATER'), C.EQUIPMENT.WATER_CAPACITY - 1);
});

// ---- Barra rápida ------------------------------------------------------------------

test('barra rápida: teclas 1–9 seleccionan; se vacía al acabarse el objeto', () => {
  const w = world();
  w.inventory.addItem('WOOD', 2);
  w.inventory.addItem('APPLE', 1);
  w.pressed.add('HOTBAR_2');
  w.hotbar.update();
  assert.equal(w.hotbar.selectedId, 'APPLE');
  w.inventory.removeItem('APPLE', 1);
  assert.equal(w.hotbar.selectedId, null);
});

// ---- Sueño -------------------------------------------------------------------------

test('dormir: bloquea la entrada, recupera energía, gasta hambre/sed y avisa las horas', () => {
  const w = world();
  const sleep = new SleepSystem({ config: C.SLEEP, energy: w.energy, hunger: w.hunger, thirst: w.thirst, input: w.input, events: w.events });
  let slept = null;
  w.events.on(GameEvents.PLAYER_SLEPT, (e) => (slept = e));
  w.energy.set(10);
  const bed = { id: 1 };
  w.events.emit(GameEvents.SLEEP_REQUEST, { bed });
  assert.ok(w.input.blockers.has('sleep'));
  for (let t = 0; t < C.SLEEP.FADE_TIME + C.SLEEP.DURATION + 0.2; t += 0.1) sleep.update(0.1);
  assert.equal(w.energy.value, 100);
  assert.equal(w.hunger.value, 100 - C.SLEEP.HUNGER_COST);
  assert.equal(w.thirst.value, 100 - C.SLEEP.THIRST_COST);
  assert.deepEqual([slept.hours, slept.bed], [C.SLEEP.HOURS, bed]);
  assert.ok(!w.input.blockers.has('sleep'));
});
