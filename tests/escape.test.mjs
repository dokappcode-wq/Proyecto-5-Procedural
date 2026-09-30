/**
 * Tests de las cápsulas de escape (Etapa 6): destinos según distancia y evacuación de emergencia. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { EscapeSystem } from '../js/space/EscapeSystem.js';
import { EDEN } from './helpers/eden.mjs';

function setup({ body = 'SPACE', crippled = false, navPos = { x: 5000, y: 0, z: 0 }, moonB = { x: 17000, y: 0, z: 0 } } = {}) {
  const events = new EventBus();
  const ship = { body, crippled, podsUsed: 0, piloting: false, relocated: null, relocateTo(id) { this.relocated = id; } };
  const worlds = {
    activeId: body,
    setActive(id) { this.activeId = id; },
    get: () => ({ getLandingSite: () => ({ x: 0, z: 0, yaw: 0 }), getSpawnPoint: () => ({ x: 0, z: 0 }) }),
  };
  const travel = { state: body === 'SPACE' ? 'SPACE' : 'SURFACE', nav: { pos: navPos }, abandonShip(id) { worlds.setActive(id); this.state = 'SURFACE'; } };
  const bodies = () => [
    { id: 'P1', name: 'MUNDO 0', radiusKm: 3200, position: { x: 0, y: 0, z: 0 } },
    { id: 'P1M1', name: 'Luna A', radiusKm: 620, position: { x: -42000, y: 0, z: 0 } },
    { id: 'P1M2', name: 'Luna B', radiusKm: 240, position: moonB },
  ];
  const blocked = new Set();
  const input = { setBlocked: (r, on) => (on ? blocked.add(r) : blocked.delete(r)) };
  const escape = new EscapeSystem({
    config: GameConfig.SPACE.ESCAPE, system: EDEN, events, worlds, ship, travel, controller: { placeAt() {} }, input, getBodies: bodies,
  });
  return { events, ship, worlds, travel, escape, blocked };
}

test('destinos alcanzables según la distancia (las lunas lejanas no)', () => {
  const { escape } = setup({ navPos: { x: 30000, y: 0, z: 0 }, moonB: { x: 17000, y: 0, z: 0 } });
  const d = Object.fromEntries(escape.destinations().map((x) => [x.id, x]));
  assert.equal(d.P1M2.reachable, true);
  assert.equal(d.P1.reachable, true);
  assert.equal(d.P1M1.reachable, false); // a ~71 000 km
});

test('una cápsula lleva al destino, gasta una cápsula y la IA trae la nave', () => {
  const { escape, ship, worlds, blocked } = setup();
  assert.ok(escape.launch('P1'));
  assert.ok(blocked.has('pod'));
  for (let i = 0; i < 400; i++) escape.update(1 / 60);
  assert.equal(worlds.activeId, 'P1');
  assert.equal(ship.relocated, 'P1');
  assert.equal(escape.podsLeft, GameConfig.SPACE.ESCAPE.PODS - 1);
  assert.equal(blocked.size, 0);
});

test('tras el salto fallido solo se puede evacuar al planeta de inicio y al llegar termina la demo', () => {
  const { escape, events, ship } = setup({ crippled: true, navPos: { x: 64000, y: 0, z: 0 } });
  const d = Object.fromEntries(escape.destinations().map((x) => [x.id, x]));
  assert.equal(d.P1.reachable, true); // aunque esté más lejos que el alcance
  assert.equal(d.P1M2.reachable, false);
  let arrived = null;
  events.on(GameEvents.ESCAPE_POD_ARRIVED, (e) => (arrived = e));
  escape.launch('P1');
  for (let i = 0; i < 400; i++) escape.update(1 / 60);
  assert.deepEqual(arrived, { target: 'P1', emergency: true });
  assert.equal(ship.relocated, null); // la restauración la hace el fin de la demo
});
