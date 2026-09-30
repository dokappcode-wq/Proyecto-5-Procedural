/**
 * Tests de la FASE 12 (sol y dos lunas en el cielo). `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { TimeSystem } from '../js/time/TimeSystem.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { createCelestialCatalog, skyAngle, illumination } from '../js/celestial/CelestialCatalog.js';
import { EDEN } from './helpers/eden.mjs';

const catalog = createCelestialCatalog(GameConfig.CELESTIAL, new WorldSeed('mundo0', GameConfig.WORLD.SUB_SEEDS).sub.celestial, EDEN);

test('el sol y las lunas usan el mismo cielo: skyDirection(sunAngle) = dirección del sol', () => {
  const time = new TimeSystem({ config: GameConfig.TIME, events: new EventBus() });
  for (const h of [3, 7, 13, 19, 23]) {
    time.setTime(h);
    const a = time.getSunDirection({});
    const b = time.skyDirection(time.sunAngle, 0, {});
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-12);
  }
});

test('cada luna sale y se pone, y cada día sale más tarde (según su velocidad orbital)', () => {
  const time = new TimeSystem({ config: GameConfig.TIME, events: new EventBus() });
  for (const body of catalog.bodies) {
    // Horas de salida (cruce del horizonte hacia arriba) durante 16 días.
    const rises = [];
    let prev = null;
    for (let h = 0; h < 24 * 16; h += 0.05) {
      time.totalHours = h;
      const y = time.skyDirection(skyAngle(body, time.rotationAngle, h), body.inclination, {}).y;
      if (prev !== null && prev <= 0 && y > 0) rises.push(h);
      prev = y;
    }
    assert.ok(rises.length >= 3, `${body.name} sale varias veces`);
    const gap = rises[1] - rises[0];
    const expected = 24 / (1 - 24 * body.speed); // periodo sinódico
    assert.ok(Math.abs(gap - expected) < 0.2, `${body.name}: ${gap.toFixed(2)} h entre salidas (esperado ${expected.toFixed(2)})`);
  }
});

test('fase de la luna: llena frente al sol, nueva junto a él', () => {
  const sun = { x: 1, y: 0, z: 0 };
  assert.equal(illumination({ x: -1, y: 0, z: 0 }, sun), 1);
  assert.equal(illumination({ x: 1, y: 0, z: 0 }, sun), 0);
  assert.equal(illumination({ x: 0, y: 1, z: 0 }, sun), 0.5);
});

test('las dos lunas se ven distintas desde la superficie', () => {
  const [a, b] = catalog.bodies;
  assert.notEqual(a.skySizeDeg, b.skySizeDeg);
  assert.notEqual(a.color, b.color);
  assert.notEqual(a.speed, b.speed);
  assert.notEqual(a.inclination, b.inclination);
});
