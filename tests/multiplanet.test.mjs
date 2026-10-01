/**
 * Bloque 1b: regiones de tamaño real, varios planetas, estrella y crucero interplanetario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameConfig as cfg } from '../js/config/GameConfig.js';
import { loadSystem } from '../js/systemdata/SystemLoader.js';
import { SolarSystem } from '../js/systemdata/SolarSystem.js';
import { createSystemLayout, bodyPositions } from '../js/celestial/SystemLayout.js';
import { SpaceNavigation } from '../js/space/SpaceNavigation.js';
import { LruCache } from '../js/core/LruCache.js';
import { regionSize } from '../js/systemdata/Catalog.js';
import { EDEN } from './helpers/eden.mjs';

const KAPPA = new SolarSystem(loadSystem(fs.readFileSync(new URL('../systems/kappa.system.json', import.meta.url), 'utf8'), { seed: 42 }).system);
const layoutOf = (sys) => createSystemLayout({ ...cfg.CELESTIAL, ZONE_MARGIN_KM: cfg.SPACE.ZONE_MARGIN_KM }, 12345, sys, cfg.SPACE.SUN_DIRECTION);

test('cada categoría de tamaño tiene su lado de región', () => {
  assert.deepEqual([0.5, 1, 5, 10, 20].map((k) => regionSize(k)), [512, 1024, 5120, 10240, 20480]);
  assert.deepEqual(KAPPA.planets.map((p) => p.regionKm), [0.5, 5, 5, 20]);
});

test('la caché LRU descarta lo menos usado pero nunca lo protegido', () => {
  const c = new LruCache(3, { keep: (v) => v.dirty });
  c.set(1, { dirty: true });
  c.set(2, {});
  c.set(3, {});
  c.get(2);
  c.set(4, {});
  c.set(5, {});
  assert.ok(c.has(1), 'el chunk con cambios se conserva');
  assert.ok(c.has(5) && c.has(4));
  assert.equal(c.has(3), false);
  assert.ok(c.size <= 4);
});

test('todos los planetas y lunas son visitables; teclas de rumbo por grupo', () => {
  assert.deepEqual(KAPPA.visitable.map((b) => b.name), ['Aurora', 'Guijarro', 'Thalassa', 'Nerea', 'Coral', 'Pontos', 'Ancla', 'Ferrum']);
  assert.equal(KAPPA.planetOf('P2M1'), 'P2');
  assert.deepEqual(KAPPA.autopilotTargets('P2M2').map((t) => t.name), ['Aurora', 'Thalassa', 'Pontos', 'Ferrum', 'Nerea', 'Coral', 'meteorito']);
  assert.deepEqual(EDEN.autopilotTargets().map((t) => t.key + t.id), ['1P1', '2P1M1', '3P1M2', '4METEOR'], 'el Edén no cambia');
});

test('el planeta de inicio está en el origen, la estrella hacia el sol y los demás en su órbita', () => {
  const L = layoutOf(KAPPA);
  const b = Object.fromEntries(bodyPositions(L, 10).map((x) => [x.id, x]));
  assert.deepEqual(b.P1.position, { x: 0, y: 0, z: 0 });
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  assert.ok(Math.abs(dist(b.STAR.position, b.P1.position) - 250000) < 1);
  assert.ok(Math.abs(dist(b.STAR.position, b.P2.position) - 550000) < 1);
  assert.ok(Math.abs(dist(b.P2.position, b.P2M1.position) - 25000) < 1, 'las lunas giran alrededor de su planeta');
  assert.equal(b.STAR.landable, false);
  assert.ok(L.zoneRadiusKm > 1000000);
  // Edén: la zona sigue estando a ~65 000 km del planeta, alejándose de la estrella.
  const E = layoutOf(EDEN);
  assert.equal(E.zoneRadiusKm - 250000, 65000);
});

function trip(sys, from, target, dir) {
  const L = layoutOf(sys);
  const nav = new SpaceNavigation({ config: cfg.SPACE, bodies: () => bodyPositions(L, 10) });
  nav.zone = { center: L.star.position, radius: L.zoneRadiusKm };
  const bodies = bodyPositions(L, 10);
  const a = bodies.find((x) => x.id === from);
  const b = bodies.find((x) => x.id === target);
  const d = dir ?? { x: 0, y: 0, z: 1 };
  nav.placeNear(a, d(a, b) ?? d, 900);
  nav.setAutopilot(target);
  let cruised = false;
  for (let t = 0; t < 60 * 90; t++) {
    nav.update(1 / 60, { forward: 1, turn: 0, vertical: 0, boost: true });
    cruised ||= nav.cruising;
    if (nav.survey().landable?.id === target) return { seconds: t / 60, cruised };
  }
  return { seconds: Infinity, cruised };
}

test('crucero interplanetario: de un planeta a otro en menos de 40 s', () => {
  const r = trip(KAPPA, 'P1', 'P2', () => ({ x: 0, y: 0, z: 1 }));
  assert.ok(r.cruised);
  assert.ok(r.seconds < 40, `${r.seconds} s`);
});

test('el rumbo automático rodea un planeta que se interpone', () => {
  const away = (a, b) => {
    const v = { x: a.position.x - b.position.x, y: a.position.y - b.position.y, z: a.position.z - b.position.z };
    const l = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
  const r = trip(KAPPA, 'P2', 'P3', away);
  assert.ok(r.seconds < 45, `${r.seconds} s`);
});

test('sin impulso no hay crucero (el vuelo cerca de los cuerpos es como antes)', () => {
  const L = layoutOf(EDEN);
  const nav = new SpaceNavigation({ config: cfg.SPACE, bodies: () => bodyPositions(L, 0) });
  nav.placeNear(bodyPositions(L, 0)[1], { x: 0, y: 0, z: 1 }, 30000);
  for (let t = 0; t < 600; t++) nav.update(1 / 60, { forward: 1, turn: 0, vertical: 0, boost: false });
  assert.equal(nav.cruising, false);
  assert.ok(nav.speed <= cfg.SPACE.CRUISE_SPEED + 1e-9);
});
