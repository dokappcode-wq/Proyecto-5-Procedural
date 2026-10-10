/**
 * P2 (v1.25): cocina y comida — hoguera y cocina, comida silvestre, crudo/cocinado,
 * platos y estados (bien alimentado, comida caliente, con energía, indigestión).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { StatusEffects } from '../js/player/StatusEffects.js';
import { NutritionSystem } from '../js/nutrition/NutritionSystem.js';
import { HungerSystem } from '../js/player/HungerSystem.js';
import { FLORA_TABLE } from '../js/world/map/MapLegend.js';
import './helpers/three.mjs';

const { SHAPES } = await import('../js/construction/BuildRules.js');
const { BUILD_MODELS } = await import('../js/construction/BuildModels.js');

test('recetas de cocina: ingredientes y resultados existen, cada una en su estación', () => {
  const cooking = Object.entries(C.RECIPES).filter(([, r]) => r.CATEGORY === 'COOKING');
  assert.ok(cooking.length >= 10);
  for (const [id, r] of cooking) {
    assert.ok(C.ITEMS[r.RESULT], id);
    assert.ok(['CAMPFIRE', 'KITCHEN', 'DRYING_RACK'].includes(r.STATION), id);
    for (const it of Object.keys(r.INGREDIENTS)) assert.ok(C.ITEMS[it], `${id}: ${it}`);
  }
  for (const piece of ['CAMPFIRE', 'KITCHEN']) {
    assert.equal(SHAPES[piece].interact, 'CRAFT');
    assert.equal(SHAPES[piece].station, piece);
    assert.ok(C.STATIONS[piece] && C.ITEMS[`PIECE_${piece}`] && C.RECIPES[`PIECE_${piece}`]);
    assert.ok(BUILD_MODELS[piece]().positions.length > 0);
  }
});

test('comida silvestre: recursos, objetos y vegetación del mapa', () => {
  for (const [res, item] of [['BERRY_BUSH', 'BERRIES'], ['MUSHROOM', 'MUSHROOM'], ['WILD_WHEAT', 'WHEAT'], ['BIRD_NEST', 'EGG']]) {
    assert.equal(C.RESOURCE_TYPES[res].HARVEST.ITEM, item);
    assert.ok(C.ITEMS[item]);
  }
  for (const table of Object.values(FLORA_TABLE)) for (const t of Object.keys(table)) assert.ok(C.RESOURCE_TYPES[t], t);
  // Cocinado alimenta más que crudo y no sienta mal.
  assert.ok(C.ITEMS.COOKED_MEAT.NUTRITION > C.NUTRITION.MEAT_NUTRITION);
  assert.ok(C.ITEMS.MEAT.RAW_RISK > 0 && !C.ITEMS.COOKED_MEAT.RAW_RISK);
});

test('platos mixtos: mitad animal y mitad vegetal en la dieta', () => {
  const events = new EventBus();
  const hunger = new HungerSystem({ config: C.SURVIVAL, events });
  hunger.set(10);
  const n = new NutritionSystem({ config: C.NUTRITION, items: C.ITEMS, hunger, events });
  assert.ok(n.eat('STEW').ok);
  assert.equal(n.animal, C.ITEMS.STEW.NUTRITION / 2);
  assert.equal(n.plant, C.ITEMS.STEW.NUTRITION / 2);
  assert.ok(n.eat('BERRIES').ok);
  assert.equal(n.valueOf('MEAT'), C.NUTRITION.MEAT_NUTRITION);
});

test('estados: comer los da, se alargan, caducan y se guardan', () => {
  const events = new EventBus();
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const fx = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events, random: () => 1 });
  events.emit(GameEvents.FOOD_EATEN, { itemId: 'STEW' });
  assert.ok(fx.has('WELL_FED') && fx.has('WARM'));
  assert.ok(fx.hungerMultiplier < 1 && fx.regenMultiplier > 1 && fx.coldMultiplier < 1);
  events.emit(GameEvents.FOOD_EATEN, { itemId: 'JAM' });
  assert.ok(fx.energyMultiplier > 1);
  fx.update(200);
  assert.ok(!fx.has('ENERGIZED'), 'la mermelada dura 3 min');
  assert.ok(fx.has('WELL_FED'));
  const snap = fx.snapshot();
  const fx2 = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events: new EventBus() });
  fx2.restore({ ...snap, HACK: 99, WARM: 'x' });
  assert.ok(fx2.has('WELL_FED') && !fx2.has('HACK') && !fx2.has('WARM'));
});

test('crudo: a veces indigestión (sin curación, menos energía, algo de hambre)', () => {
  const events = new EventBus();
  const hunger = new HungerSystem({ config: C.SURVIVAL, events });
  hunger.set(80);
  const sick = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events, hunger, random: () => 0 });
  events.emit(GameEvents.FOOD_EATEN, { itemId: 'MEAT' });
  assert.ok(sick.has('INDIGESTION') && sick.blocksRegen && sick.energyMultiplier < 1);
  assert.ok(hunger.value < 80);
  const events2 = new EventBus();
  const ok = new StatusEffects({ config: C.STATUS_EFFECTS, items: C.ITEMS, events: events2, random: () => 0 });
  events2.emit(GameEvents.FOOD_EATEN, { itemId: 'COOKED_MEAT' });
  assert.ok(!ok.has('INDIGESTION') && ok.has('WARM'));
});
