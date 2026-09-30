/**
 * Tests de la IA de la nave (nodo de IA): nombre, datos y avisos. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { ShipAI } from '../js/ship/ShipAI.js';

function setup() {
  const events = new EventBus();
  const store = new Map();
  const ship = {
    installed: { ...GameConfig.SHIP.INSTALLED },
    hasSpaceNode: false,
    isExplorer: false,
    batteries: { ratio: 1 },
    getTelemetry: () => ({ flight: 'LANDED', charge: 0.8, hatch: 'CLOSED', legs: 'DEPLOYED', altitude: 0, airlock: 'PRESSURIZED' }),
  };
  const lifeSupport = { getState: () => ({ breathable: true, wearing: false, oxygen: 1, battery: 1, lungs: 1, powered: false }) };
  const worlds = { activeId: 'MUNDO_0', profile: (id = 'MUNDO_0') => GameConfig.PLANETS[id] };
  const ai = new ShipAI({
    events, planets: GameConfig.PLANETS, sources: { ship, lifeSupport, worlds, getCatalog: () => null, pickups: { get: () => null } },
    storage: { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) },
  });
  const said = [];
  events.on(GameEvents.AI_SAY, (m) => said.push(m));
  return { events, ai, said, store, ship };
}

test('la IA viene instalada en la nave y se le puede poner nombre (y se recuerda)', () => {
  const { ai, said, store } = setup();
  assert.equal(ai.online, true);
  assert.equal(ai.aiName, 'NOVA');
  assert.ok(ai.setName('  Hal <9000>  '));
  assert.equal(ai.aiName, 'Hal 9000');
  assert.equal(store.get('mundo0.aiName'), 'Hal 9000');
  assert.equal(said.at(-1).name, 'Hal 9000');
  assert.equal(ai.setName('   '), false);
});

test('datos del sistema: MUNDO 0 basado en carbono y con 2 lunas', () => {
  const { ai } = setup();
  const planet = ai.answer('PLANET').join(' ');
  assert.match(planet, /carbono/);
  assert.match(planet, /2 lunas/);
  const moons = ai.answer('MOONS').join(' ');
  assert.match(moons, /Luna A/);
  assert.match(moons, /Luna B/);
  assert.match(ai.answer('SHIP').join(' '), /batería 80 %/);
});

test('avisa sola de la batería baja (una vez por umbral) y de la llegada a una luna', () => {
  const { events, said } = setup();
  const bat = (r) => events.emit(GameEvents.SHIP_BATTERIES_CHANGED, { total: r * 400, capacity: 400 });
  bat(0.45);
  bat(0.44);
  bat(0.2);
  const texts = said.map((m) => m.text);
  assert.equal(texts.filter((t) => t.includes('50 %')).length, 1);
  assert.ok(texts.some((t) => t.includes('25 %')));
  events.emit(GameEvents.BODY_CHANGED, { id: 'MOON_A', previous: 'SPACE', planet: GameConfig.PLANETS.MOON_A });
  assert.match(said.at(-1).text, /Luna A/);
});
