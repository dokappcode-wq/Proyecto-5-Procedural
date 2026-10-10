/**
 * P8 (v1.30): comercio, encargos, ruinas y mapas del tesoro, habilidades y logros.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { ProgressionSystem } from '../js/player/ProgressionSystem.js';
import { TradeSystem } from '../js/trade/TradeSystem.js';
import { AchievementSystem } from '../js/progress/AchievementSystem.js';
import './helpers/three.mjs';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { TreasureSystem } = await import('../js/trade/TreasureSystem.js');
const { buildMerchantStall, buildMerchant } = await import('../js/trade/MerchantModels.js');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');

function kit() {
  const events = new EventBus();
  const messages = [];
  events.on(GameEvents.UI_MESSAGE, (m) => messages.push(m.text));
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  let day = 1;
  const prog = new ProgressionSystem({ config: C.PROGRESSION, events });
  const trade = new TradeSystem({ config: C.TRADE, items: C.ITEMS, inventory, events, day: () => day, perk: (id) => prog.perk(id), seed: 7 });
  return { events, messages, inventory, trade, prog, setDay: (d) => (day = d) };
}

test('mercader: comprar y vender con monedas; existencias por día', () => {
  const k = kit();
  const i = C.TRADE.BUY.findIndex((o) => o.ITEM === 'ROPE');
  const o = C.TRADE.BUY[i];
  assert.equal(k.trade.buy(i), false, 'sin monedas no');
  k.inventory.addItem('COIN', 50);
  for (let n = 0; n < o.STOCK; n++) assert.ok(k.trade.buy(i));
  assert.equal(k.trade.buy(i), false, 'agotado');
  assert.equal(k.inventory.getItemCount('ROPE'), o.STOCK * o.AMOUNT);
  assert.equal(k.inventory.getItemCount('COIN'), 50 - o.STOCK * o.PRICE);
  k.setDay(2);
  k.trade.update(0.1);
  assert.equal(k.trade.stock[i], o.STOCK, 'al día siguiente hay más');
  // Vender.
  const s = C.TRADE.SELL.findIndex((x) => x.ITEM === 'WOOD');
  k.inventory.addItem('WOOD', 25);
  const before = k.inventory.getItemCount('COIN');
  assert.ok(k.trade.sell(s) && k.trade.sell(s));
  assert.equal(k.trade.sell(s), false, 'quedan 5: no llega');
  assert.equal(k.inventory.getItemCount('COIN'), before + 2 * C.TRADE.SELL[s].PRICE);
  // Regateo: más barato al comprar.
  const lantern = C.TRADE.BUY.find((x) => x.ITEM === 'LANTERN');
  k.prog.points = 5;
  for (let n = 0; n < 5; n++) k.prog.spend('TRADE');
  assert.equal(k.prog.spend('TRADE'), false, 'habilidad al máximo');
  assert.ok(k.trade.buyPrice(lantern) < lantern.PRICE);
});

test('encargos: tres a la vez; entregar paga y al día siguiente hay otro', () => {
  const k = kit();
  assert.equal(k.trade.orders.length, C.TRADE.ORDER_SLOTS);
  const o = k.trade.orders[0];
  assert.equal(k.trade.deliver(0), false);
  k.inventory.addItem(o.item, o.amount);
  const done = [];
  k.events.on(GameEvents.ORDER_DONE, (e) => done.push(e));
  assert.ok(k.trade.deliver(0));
  assert.equal(k.inventory.getItemCount('COIN'), o.reward);
  assert.equal(done.length, 1);
  assert.equal(k.trade.deliver(0), false, 'ya está hecho');
  k.setDay(2);
  k.trade.update(0.1);
  assert.equal(k.trade.orders.length, C.TRADE.ORDER_SLOTS);
  assert.ok(k.trade.orders.every((x) => !x.done), 'el hecho se cambia por otro');
  // Guardar y cargar (datos raros fuera).
  const snap = JSON.parse(JSON.stringify(k.trade.snapshot()));
  const k2 = kit();
  k2.setDay(2);
  k2.trade.restore(snap);
  assert.deepEqual(k2.trade.orders.map((x) => x.item), k.trade.orders.map((x) => x.item));
  k2.trade.restore({ orders: [{ item: 'DIAMOND_PICKAXE', amount: 1, reward: 1e9 }], stock: [1e9] });
  assert.ok(k2.trade.orders.every((x) => C.TRADE.ORDERS.some((t) => t.ITEM === x.item)));
  assert.ok(k2.trade.stock[0] <= C.TRADE.BUY[0].STOCK);
});

test('puesto y mercader: modelos y colisiones', () => {
  const stall = buildMerchantStall({ x: 10, z: 20, yaw: 1 }, () => 5);
  assert.ok(stall.group.children.length > 20);
  assert.equal(stall.prims.length, 2);
  assert.ok(Math.hypot(stall.npc.x - 10, stall.npc.z - 20) < 1);
  assert.ok(buildMerchant().group.children.length > 0);
});

test('tesoros en el Edén: ruinas en tierra; el mapa marca una y con la pala se desentierra', () => {
  const dir = new URL('../maps/eden/', import.meta.url);
  const map = MapData.fromFiles(JSON.parse(fs.readFileSync(new URL('eden.map.json', dir))), zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, maps: { [EDEN.homeId]: map }, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: 11, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS },
    },
  });
  const w = worlds.home;
  w.generate('42');
  assert.ok(w.getSites('MERCHANT').length === 1, 'el puesto del mercader está en el mapa');
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const hotbar = { selectedIndex: 0, get selectedId() { return inventory.slots[0]?.id ?? null; } };
  const added = [];
  const t = new TreasureSystem({ config: C.TREASURE, items: C.ITEMS, inventory, hotbar, events, scene: new THREE.Scene(), colliders: { add: (id, p) => added.push(...p) }, random: () => 0.99 });
  t.setPlayer({ position: new THREE.Vector3(w.getSpawnPoint().x, 0, w.getSpawnPoint().z) });
  t.setup(w);
  assert.ok(t.ruins.length >= C.TREASURE.RUINS, `${t.ruins.length} ruinas`);
  assert.ok(t.ruins.some((r) => r.id === 'garden'), 'las Ruinas del Viejo Jardín también');
  for (const r of t.ruins) assert.ok(!map.waterAt(r.x, r.z) && w.getHeightAt(r.x, r.z) > 2, `${r.id} en tierra`);
  assert.ok(added.length > 0, 'las ruinas tienen colisión');
  // Mismo sitio siempre.
  const t2 = new TreasureSystem({ config: C.TREASURE, items: C.ITEMS, inventory, hotbar, events, scene: new THREE.Scene() });
  t2.setup(w);
  assert.deepEqual(t2.ruins.map((r) => [Math.round(r.x), Math.round(r.z)]), t.ruins.map((r) => [Math.round(r.x), Math.round(r.z)]));
  // Leer un mapa y cavar.
  assert.ok(t.readMap());
  const r = t.ruins.find((x) => x.marked);
  assert.match(t.direction(r), /^al (norte|noreste|este|sureste|sur|suroeste|oeste|noroeste), a \d+ m$/);
  t.update(0.1);
  assert.ok(t.group.children.length > 0);
  const spot = t.getInteractablesNear(r.x, r.y, r.z, 3)[0];
  assert.equal(spot.action, 'Necesitas una pala');
  assert.equal(t.interact(r.id), false);
  inventory.slots[0] = { id: 'SHOVEL', count: 1, dur: 500 };
  const found = [];
  events.on(GameEvents.TREASURE_FOUND, (e) => found.push(e));
  assert.equal(t.interact(r.id), true);
  assert.ok(inventory.getItemCount('COIN') >= C.TREASURE.LOOT.COIN[0]);
  assert.equal(found.length, 1);
  assert.equal(t.getInteractablesNear(r.x, r.y, r.z, 3).length, 0);
  const snap = t.snapshot();
  t2.restore(snap);
  assert.equal(t2.ruins.find((x) => x.id === r.id).found, true);
});

test('logros: se desbloquean una vez, con contadores, y se guardan', () => {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const unlocked = [];
  events.on(GameEvents.ACHIEVEMENT_UNLOCKED, (e) => unlocked.push(e.id));
  const a = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events, inventory });
  events.emit(GameEvents.RESOURCE_HIT, { felled: true, material: 'wood', node: { type: 'TREE' } });
  events.emit(GameEvents.RESOURCE_HIT, { felled: true, material: 'wood', node: { type: 'TREE' } });
  events.emit(GameEvents.ITEM_CRAFTED, { recipeId: 'STONE_AXE' });
  events.emit(GameEvents.ITEM_CRAFTED, { recipeId: 'COOKED_MEAT' });
  for (let i = 0; i < 9; i++) events.emit(GameEvents.FISH_CAUGHT, { item: 'FISH' });
  assert.ok(!unlocked.includes('ANGLER'));
  assert.deepEqual(a.progress('ANGLER'), [9, 10]);
  events.emit(GameEvents.FISH_CAUGHT, { item: 'GOLDEN_FISH' });
  inventory.addItem('COIN', 100);
  assert.deepEqual(unlocked.sort(), ['ANGLER', 'COOK', 'FIRST_TOOL', 'FIRST_TREE', 'GOLDEN_FISH', 'RICH'].sort());
  const b = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events: new EventBus() });
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  assert.equal(b.unlocked.size, 6);
  b.restore({ unlocked: ['NOPE'], counts: { BUILDER: 1e12 } });
  assert.equal(b.unlocked.size, 0);
  assert.equal(b.counts.BUILDER, 1e6);
  for (const d of Object.values(C.ACHIEVEMENTS)) assert.ok(d.NAME && d.ICON && d.DESC);
});
