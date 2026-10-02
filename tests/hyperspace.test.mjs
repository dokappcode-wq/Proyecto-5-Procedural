/**
 * Hiperespacio: catálogo de sistemas, gasto de baterías y traspaso de la partida.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameConfig as cfg } from '../js/config/GameConfig.js';
import { parseSystemCatalog } from '../js/systemdata/SystemCatalog.js';
import { loadSystem } from '../js/systemdata/SystemLoader.js';
import { BatteryBank } from '../js/ship/BatteryBank.js';
import { captureState, saveHandoff, takeHandoff, applyState } from '../js/core/TravelHandoff.js';
import { EventBus } from '../js/core/EventBus.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';

test('el catálogo de systems/ es válido y cada entrada carga su sistema', () => {
  const { entries, errors } = parseSystemCatalog(fs.readFileSync(new URL('../systems/catalogo.json', import.meta.url), 'utf8'));
  assert.deepEqual(errors, []);
  assert.deepEqual(entries.map((e) => e.id), ['eden', 'kappa']);
  assert.equal(entries[0].file, cfg.CAMPAIGN.SYSTEM_FILE);
  for (const e of entries) {
    const r = loadSystem(fs.readFileSync(new URL(`../systems/${e.file}.system.json`, import.meta.url), 'utf8'));
    assert.equal(r.ok, true, e.file);
  }
});

test('el catálogo rechaza rutas, URLs y entradas raras sin romperse', () => {
  const text = JSON.stringify({ systems: [
    { id: 'ok', file: 'ok', name: 'Bien' },
    { id: 'url', file: 'https://evil.example/x', name: 'Mal' },
    { id: 'up', file: '../secreto', name: 'Mal' },
    { id: 'ok', file: 'otro', name: 'Repetido' },
    { id: 'Mayus', file: 'x', name: 'Mal' },
    'texto',
  ] });
  const { entries, errors } = parseSystemCatalog(text);
  assert.deepEqual(entries.map((e) => e.id), ['ok']);
  assert.equal(errors.length, 5);
  assert.equal(parseSystemCatalog('no es json').entries.length, 0);
});

test('un salto gasta una batería entera (la más llena primero)', () => {
  const bank = new BatteryBank(cfg.SHIP.BATTERIES);
  bank.slots[0].charge = 60;
  assert.equal(bank.spendWhole(1), true);
  assert.deepEqual(bank.slots.map((b) => b.charge), [60, 0, 100, 100]);
  bank.slots.forEach((b) => (b.charge = 30));
  assert.equal(bank.spendWhole(1), true, '4 × 30 = 120: alcanza');
  assert.equal(Math.round(bank.total), 20);
  assert.equal(bank.spendWhole(1), false, 'sin carga suficiente no hay salto');
  assert.equal(Math.round(bank.total), 20, 'y no se gasta nada');
});

function memoryStorage() {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), m };
}

function fakeGame() {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: cfg.ITEMS, events, config: cfg.INVENTORY });
  const stat = (v) => ({ value: v, set(x) { this.value = x; } });
  const installed = { ...cfg.SHIP.INSTALLED_EXPLORER };
  const ship = {
    isExplorer: false, installed, podsUsed: 0, batteries: new BatteryBank(cfg.SHIP.BATTERIES),
    upgrade() { this.isExplorer = true; }, installTech(slot, t) { this.installed[slot] = t; },
  };
  const equipment = new EquipmentSystem({ items: cfg.ITEMS, config: cfg.EQUIPMENT, inventory, events });
  const lifeSupport = { wearing: false, oxygen: 1, battery: 1, gas: 1, toggleSuit() { this.wearing = !this.wearing; } };
  return { inventory, equipment, health: stat(100), hunger: stat(100), thirst: stat(100), energy: stat(100), lifeSupport, ship, time: { totalHours: 8 } };
}

test('el traspaso lleva la partida al nuevo sistema (y solo una vez)', () => {
  const a = fakeGame();
  a.inventory.addItem('MINERAL', 7);
  a.inventory.addItem('LEATHER_SHIRT', 1);
  a.inventory.addItem('LEATHER_CAP', 1);
  a.equipment.wear('LEATHER_SHIRT');
  a.inventory.click(a.inventory.slots.findIndex((x) => x?.id === 'LEATHER_CAP')); // coger el gorro…
  a.inventory.click(20, {}); // …y dejarlo en la mochila
  a.hunger.set(40);
  a.lifeSupport.toggleSuit();
  a.lifeSupport.oxygen = 0.3;
  a.ship.isExplorer = true;
  a.ship.installed.CONTROL_2 = 'LIGHTSPEED_NODE';
  a.ship.batteries.spendWhole(1);
  a.time.totalHours = 55;
  const store = memoryStorage();
  saveHandoff(captureState({ systemName: 'Sistema del Edén', target: 'kappa', campaignSeed: 777, ...a }), store);

  assert.equal(takeHandoff('otro', store), null, 'un traspaso para otro sistema no se aplica');
  saveHandoff(captureState({ systemName: 'Sistema del Edén', target: 'kappa', campaignSeed: 777, ...a }), store);
  const s = takeHandoff('kappa', store);
  assert.equal(s.campaignSeed, 777);
  assert.equal(takeHandoff('kappa', store), null, 'un solo uso');

  const b = fakeGame();
  applyState(s, { items: cfg.ITEMS, techs: cfg.SHIP.TECHNOLOGIES, ...b });
  assert.equal(b.inventory.getItemCount('MINERAL'), 7);
  assert.equal(b.equipment.slots.CHEST, 'LEATHER_SHIRT');
  assert.equal(b.inventory.slots[20]?.id, 'LEATHER_CAP', 'cada objeto vuelve a su hueco');
  assert.equal(b.inventory.getItemCount('LEATHER_SHIRT'), 0, 'lo puesto no ocupa hueco');
  assert.equal(b.hunger.value, 40);
  assert.equal(b.lifeSupport.wearing, true);
  assert.equal(b.lifeSupport.oxygen, 0.3);
  assert.equal(b.ship.isExplorer, true);
  assert.equal(b.ship.installed.CONTROL_2, 'LIGHTSPEED_NODE');
  assert.equal(Math.round(b.ship.batteries.total), 300);
  assert.equal(b.time.totalHours, 55);
});

test('un traspaso manipulado no mete objetos ni tecnologías que no existen', () => {
  const store = memoryStorage();
  store.set('mundo0.hyperjump', JSON.stringify({
    v: 1, at: Date.now(), target: 'kappa',
    slots: [['NO_EXISTE', 5], ['__proto__', 1], ['MINERAL', 1e9], ['WOOD', 'mucho'], ['LEATHER_CAP', 7]],
    worn: { HEAD: 'MEAT', CHEST: 'NO_EXISTE', __proto__: { x: 1 }, FEET: 'LEATHER_SHOES' },
    ship: { installed: { CONTROL_2: 'ARMA_SECRETA', NO_SLOT: 'AI_NODE' }, batteries: [1e9, -5, 'x', null] },
    vitals: { health: -100 }, life: { oxygen: 99 },
  }));
  const b = fakeGame();
  applyState(takeHandoff('kappa', store), { items: cfg.ITEMS, techs: cfg.SHIP.TECHNOLOGIES, ...b });
  assert.deepEqual(b.inventory.getAll().map((i) => [i.id, i.count]), [['MINERAL', 100], ['LEATHER_CAP', 1]], 'como mucho una pila por hueco');
  assert.deepEqual(b.equipment.slots, { HEAD: null, CHEST: null, LEGS: null, FEET: 'LEATHER_SHOES', HANDS: null }, 'solo prendas en su ranura');
  assert.notEqual(b.ship.installed.CONTROL_2, 'ARMA_SECRETA');
  assert.equal(b.ship.installed.NO_SLOT, undefined);
  assert.deepEqual(b.ship.batteries.slots.map((x) => x && x.charge), [100, 0, 100, null]);
  assert.ok(b.health.value >= 1);
  assert.equal(b.lifeSupport.oxygen, 1);
  assert.equal(Object.prototype.polluted, undefined);
});
