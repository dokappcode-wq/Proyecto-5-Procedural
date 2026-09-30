/**
 * Tests del soporte vital (Etapa 4): aire, traje, oxígeno, batería y asfixia. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { LifeSupportSystem } from '../js/player/LifeSupportSystem.js';

const C = GameConfig.LIFE_SUPPORT;
const B = GameConfig.SHIP.BATTERIES;

function setup(air = false) {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: GameConfig.ITEMS, events });
  const state = { air };
  const life = new LifeSupportSystem({
    config: C, batteries: B, player: { position: { x: 0, y: 0, z: 0 } }, inventory, events, isBreathableAt: () => state.air,
  });
  const damage = [];
  events.on(GameEvents.PLAYER_DAMAGED, (d) => damage.push(d));
  const run = (s) => { for (let t = 0; t < s; t += 0.1) life.update(0.1); };
  return { events, inventory, life, state, damage, run };
}

test('sin aire y sin traje: se aguanta la respiración y después hay asfixia', () => {
  const { life, damage, run } = setup(false);
  run(C.LUNGS_TIME * 0.5);
  assert.ok(life.lungs > 0.4 && life.lungs < 0.6);
  assert.equal(damage.length, 0);
  run(C.LUNGS_TIME * 0.5 + 3);
  assert.ok(damage.length >= 3 && damage.every((d) => d.source === 'SUFFOCATION'));
});

test('con el traje se respira gastando oxígeno y batería; con aire el depósito no baja', () => {
  const { life, damage, run, state } = setup(false);
  life.toggleSuit();
  run(30);
  assert.equal(damage.length, 0);
  assert.equal(life.lungs, 1);
  assert.ok(Math.abs(life.oxygen - (1 - 30 / C.SUIT_OXYGEN_TIME)) < 0.01);
  assert.ok(life.battery < 1);
  state.air = true;
  const o2 = life.oxygen;
  run(10);
  assert.equal(life.oxygen, o2);
});

test('traje sin batería no da oxígeno; cambiar la batería lo arregla', () => {
  const { life, inventory, run } = setup(false);
  life.toggleSuit();
  life.battery = 0;
  run(C.LUNGS_TIME * 0.5);
  assert.ok(life.lungs < 0.6);
  inventory.addItem(B.ITEM, 1);
  assert.ok(life.swapBattery());
  assert.equal(inventory.getItemCount(B.EMPTY_ITEM), 1);
  run(5);
  assert.equal(life.powered, true);
  assert.ok(life.lungs > 0.9);
});

test('no se puede quitar el traje sin aire; la estación de oxígeno llena el depósito', () => {
  const { life, state } = setup(false);
  life.toggleSuit();
  assert.equal(life.toggleSuit(), false);
  assert.equal(life.wearing, true);
  life.oxygen = 0.1;
  life.refillOxygen();
  assert.equal(life.oxygen, 1);
  state.air = true;
  life.toggleSuit();
  assert.equal(life.wearing, false);
});

test('en las lunas la madera y la lana se cambian por piedra y mineral', () => {
  for (const id of ['MOON_A', 'MOON_B']) {
    const p = GameConfig.PLANETS[id];
    assert.equal(p.BREATHABLE, false);
    assert.deepEqual(p.BUILD_SUBSTITUTE, { WOOD: 'STONE', WOOL: 'MINERAL' });
  }
  for (const id of ['CHARGING_STATION', 'OXYGEN_STATION']) assert.equal(GameConfig.BUILD.PIECES[id].BODIES, 'MOON');
});
