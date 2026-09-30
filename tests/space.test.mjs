/**
 * Tests del espacio explorable: navegación entre MUNDO 0 y las lunas. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { SpaceNavigation } from '../js/space/SpaceNavigation.js';

const C = GameConfig.SPACE;
const bodies = [
  { id: 'MUNDO_0', name: 'MUNDO 0', radiusKm: 3200, position: { x: 0, y: 0, z: 0 } },
  { id: 'MOON_B', name: 'Luna B', radiusKm: 240, position: { x: 17000, y: 1500, z: 0 } },
];
const nav = () => new SpaceNavigation({ config: C, bodies: () => bodies });
const run = (n, seconds, ctl, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) n.update(dt, ctl); };
const idle = { forward: 0, turn: 0, vertical: 0, boost: false };

test('la nave sale mirando hacia fuera del cuerpo y avanza hacia el morro', () => {
  const n = nav();
  n.placeNear(bodies[0], { x: 1, y: 0, z: 0 }, 900);
  assert.ok(Math.abs(n.pos.x - 4100) < 1e-6);
  const f = n.forward;
  assert.ok(f.x > 0.99, 'mira hacia fuera');
  run(n, 2, { ...idle, forward: 1 });
  assert.ok(n.pos.x > 4100 + 50, 'se aleja');
  assert.ok(n.speed > 0 && n.speed <= C.CRUISE_SPEED);
});

test('no se puede atravesar un cuerpo ni salir de la zona del sistema', () => {
  const n = nav();
  n.placeNear(bodies[0], { x: 1, y: 0, z: 0 }, 900);
  n.yaw += Math.PI; // hacia el planeta
  run(n, 20, { ...idle, forward: 1, boost: true });
  const d = Math.hypot(n.pos.x, n.pos.y, n.pos.z);
  assert.ok(d >= 3200 * C.MIN_APPROACH - 1e-6, `se queda fuera (${d.toFixed(0)} km)`);
  n.pos = { x: C.ZONE_RADIUS * 1.2, y: 0, z: 0 };
  assert.ok(n.outsideZone);
  assert.ok(n.clampToZone());
  assert.ok(!n.outsideZone);
});

test('el rumbo automático lleva a la Luna B y el frenado de proximidad permite aterrizar', () => {
  const n = nav();
  n.placeNear(bodies[0], { x: 0, y: 0, z: 1 }, 900);
  n.autopilotTarget = 'MOON_B';
  let landable = null;
  for (let t = 0; t < 120 && !landable; t += 1 / 30) {
    n.update(1 / 30, { ...idle, forward: 1, boost: true });
    landable = n.survey().landable;
    if (landable?.id === 'MUNDO_0') landable = null;
  }
  assert.equal(landable?.id, 'MOON_B');
  assert.ok(n.survey().bodies.find((b) => b.id === 'MOON_B').altitude > 0, 'no ha chocado');
});

test('girar a mano cancela el rumbo automático', () => {
  const n = nav();
  n.autopilotTarget = 'MOON_B';
  n.update(0.1, { ...idle, turn: 1 });
  assert.equal(n.autopilotTarget, null);
});

test('rumbo automático a un meteorito: se detiene a su lado sin atravesarlo', async () => {
  const { SpaceNavigation } = await import('../js/space/SpaceNavigation.js');
  const { GameConfig } = await import('../js/config/GameConfig.js');
  const C = GameConfig.SPACE;
  const meteor = { id: 'M1', name: 'Meteorito', position: { x: 12, y: 3, z: -30 }, radiusKm: 0.04, stopKm: 0.12, minKm: 0.07 };
  const nav = new SpaceNavigation({ config: C, bodies: () => [{ id: 'MUNDO_0', name: 'MUNDO 0', radiusKm: 1, position: { x: 5000, y: 0, z: 0 } }], extras: () => [meteor] });
  const events = [];
  nav.onEvent = (t) => events.push(t);
  nav.setAutopilot('M1');
  for (let i = 0; i < 60 * 120 && nav.autopilotTarget; i++) nav.update(1 / 60, { forward: 1, turn: 0, vertical: 0, boost: false });
  const d = Math.hypot(nav.pos.x - 12, nav.pos.y - 3, nav.pos.z + 30) - meteor.radiusKm;
  assert.ok(events.includes('EXTRA_ARRIVED'), 'llega');
  assert.ok(d > meteor.minKm - 1e-6 && d < meteor.stopKm + 0.03, `distancia a la superficie ${d} km`);
  // Empujar hacia él no lo atraviesa.
  for (let i = 0; i < 600; i++) nav.update(1 / 60, { forward: 1, turn: 0, vertical: 0, boost: true });
  const d2 = Math.hypot(nav.pos.x - 12, nav.pos.y - 3, nav.pos.z + 30) - meteor.radiusKm;
  assert.ok(d2 >= meteor.minKm - 1e-6, `no atraviesa: ${d2}`);
});
