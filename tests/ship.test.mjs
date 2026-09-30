/**
 * Tests de la nave pequeña: forma (salas, rampa, colisiones), baterías y vuelo. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import * as L from '../js/ship/ShipLayout.js';
import { BatteryBank } from '../js/ship/BatteryBank.js';
import { ShipFlight } from '../js/ship/ShipFlight.js';

const SHIP = GameConfig.SHIP;
const B = SHIP.BATTERIES;

function newShip(over = {}) {
  return { x: 10, y: 3, z: -20, yaw: 0.7, hatch: 0, legs: 1, door: 0, legFeet: [0, 0, 0, 0], rampAngle: L.rampOpenAngle(0), pitch: 0, roll: 0, ...over };
}

// ---- Forma ---------------------------------------------------------------------------

test('coordenadas locales ↔ mundo con cualquier orientación', () => {
  const s = newShip();
  const [wx, wz] = L.toWorld(s, 1.5, -4);
  const [lx, lz] = L.toLocal(s, wx, wz);
  assert.ok(Math.abs(lx - 1.5) < 1e-9 && Math.abs(lz + 4) < 1e-9);
  // El morro (−Z local) apunta hacia donde mira un jugador con el mismo yaw.
  const [fx, fz] = L.dirToWorld(s, 0, -1);
  assert.ok(Math.abs(fx + Math.sin(s.yaw)) < 1e-9 && Math.abs(fz + Math.cos(s.yaw)) < 1e-9);
});

test('suelo interior caminable; la compuerta cerrada es suelo y abierta es una rampa hasta el suelo', () => {
  const s = newShip();
  const at = (lx, lz, maxY = Infinity) => {
    const [x, z] = L.toWorld(s, lx, lz);
    return L.surfaceAt(s, x, z, maxY);
  };
  // Sala de controles y laboratorio: suelo a FLOOR.
  assert.equal(at(0, -4, s.y + L.DIM.FLOOR + 0.1), s.y + L.DIM.FLOOR);
  assert.equal(at(-2, 3, s.y + L.DIM.FLOOR + 0.1), s.y + L.DIM.FLOOR);
  // Compuerta cerrada: suelo también sobre el hueco.
  assert.equal(at(0, 3, s.y + L.DIM.FLOOR + 0.1), s.y + L.DIM.FLOOR);
  // Abierta: rampa que baja desde la bisagra hasta y ≈ 0 al final.
  s.hatch = 1;
  const end = L.rampEnd(s);
  assert.ok(Math.abs(end.y) < 1e-6, 'la rampa llega al suelo');
  const mid = at(0, (L.HATCH.HINGE_Z + end.z) / 2, s.y + 3);
  assert.ok(Math.abs(mid - (s.y + L.DIM.FLOOR / 2)) < 1e-6, 'a mitad de rampa, mitad de altura');
  // Bajo el casco (fuera del hueco) no hay suelo al alcance de alguien en el suelo.
  assert.equal(at(2, 0, s.y + 0.45), null);
  // Se puede caminar por debajo del casco: el casco está por encima de la cabeza.
  const [ux, uz] = L.toWorld(s, 2, 0);
  assert.ok(!L.blocksAt(s, ux, uz, 0.35, s.y + 0.45, s.y + 1.8));
  assert.ok(L.ceilingAt(s, ux, uz, s.y + 1.5) >= s.y + L.DIM.BOTTOM);
});

test('las paredes, el tabique y la puerta cerrada bloquean; la puerta abierta deja pasar', () => {
  const s = newShip();
  const feet = s.y + L.DIM.FLOOR;
  const push = (lx, lz) => {
    const [x, z] = L.toWorld(s, lx, lz);
    const pos = { x, z };
    const hit = L.resolveCollisions(s, pos, 0.35, feet + 0.05, feet + 1.8);
    return { hit, local: L.toLocal(s, pos.x, pos.z) };
  };
  // Pared lateral izquierda.
  const wall = push(-3.0, 0);
  assert.ok(wall.hit);
  assert.ok(wall.local[0] >= -L.DIM.INNER + 0.35 - 1e-6, 'empujado fuera de la pared');
  // Puerta cerrada en el hueco del tabique.
  assert.ok(push(0, L.DIM.PARTITION_Z).hit);
  s.door = 1;
  assert.ok(!push(0, L.DIM.PARTITION_Z).hit, 'puerta abierta');
  // Alguien en el suelo, fuera, bajo el casco: solo le frenan las patas.
  const [lx, lz] = [L.LEGS[0].x, L.LEGS[0].z];
  const [x, z] = L.toWorld(s, lx, lz);
  const pos = { x, z };
  assert.ok(L.resolveCollisions(s, pos, 0.35, s.y + 0.05, s.y + 1.8), 'pata');
  const [ox, oz] = L.toWorld(s, 0, 0);
  assert.ok(!L.resolveCollisions(s, { x: ox, z: oz }, 0.35, s.y + 0.05, s.y + 1.8), 'bajo el centro del casco se pasa');
});

test('dentro de la nave = refugio; la huella detecta solapes', () => {
  const s = newShip();
  const [x, z] = L.toWorld(s, 0, 0);
  assert.ok(L.isInside(s, x, s.y + L.DIM.FLOOR, z));
  assert.ok(!L.isInside(s, x, s.y, z), 'debajo no es dentro');
  assert.ok(L.overlapsFootprint(s, { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 }));
  assert.ok(!L.overlapsFootprint(s, { minX: x + 30, maxX: x + 32, minZ: z, maxZ: z + 2 }));
});

// ---- Baterías ---------------------------------------------------------------------------

test('baterías plank pequeñas: empiezan llenas, se gastan en orden y se retiran llenas o vacías', () => {
  const bank = new BatteryBank(B);
  assert.equal(bank.slots.length, B.SLOTS);
  assert.equal(bank.total, B.SLOTS * B.CAPACITY);
  assert.equal(bank.ratio, 1);
  bank.drain(B.CAPACITY * 1.5);
  assert.equal(bank.slots[0].charge, 0);
  assert.equal(bank.slots[1].charge, B.CAPACITY / 2);
  assert.deepEqual(bank.remove(0), { ok: true, item: B.EMPTY_ITEM });
  assert.equal(bank.remove(1).ok, false, 'a medias no se retira');
  assert.deepEqual(bank.remove(2), { ok: true, item: B.ITEM });
  assert.equal(bank.insert(2, 'WOOD').ok, false);
  assert.ok(bank.insert(2, B.ITEM).ok);
  assert.equal(bank.slots[2].charge, B.CAPACITY);
  bank.drain(1e9);
  assert.ok(bank.empty);
});

// ---- Vuelo -------------------------------------------------------------------------------

function flightSetup({ ground = (x, z) => 3, water = () => false, blocked = () => null } = {}) {
  const ship = newShip({ y: 3 });
  const batteries = new BatteryBank(B);
  const events = [];
  const flight = new ShipFlight({
    config: SHIP,
    ship,
    batteries,
    terrain: { heightAt: ground, surfaceAt: ground, isWater: water, bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } },
    landingBlocked: blocked,
  });
  flight.onEvent = (type, data) => events.push([type, data]);
  const run = (seconds, controls = null, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) flight.update(dt, controls); };
  return { ship, batteries, flight, events, run };
}

test('despegar exige la compuerta cerrada; en el aire la compuerta también se abre', () => {
  const { flight, run, ship } = flightSetup();
  assert.ok(flight.command('TOGGLE_HATCH').ok);
  run(SHIP.HATCH_TIME + 0.1);
  assert.equal(ship.hatch, 1);
  assert.equal(flight.command('TAKEOFF').ok, false);
  assert.equal(flight.command('RETRACT_LEGS').ok, false, 'en tierra no se recogen las patas');
  flight.command('TOGGLE_HATCH');
  run(SHIP.HATCH_TIME + 0.1);
  assert.ok(flight.command('TAKEOFF').ok);
  run(5);
  assert.equal(flight.state, 'FLYING');
  assert.ok(ship.y >= 3 + SHIP.TAKEOFF_HEIGHT - L.DIM.BOTTOM - 0.01);
  assert.ok(flight.command('TOGGLE_HATCH').ok, 'en vuelo se puede abrir para saltar');
  run(SHIP.HATCH_TIME + 0.1);
  assert.equal(ship.hatch, 1);
  assert.equal(flight.state, 'FLYING');
});

test('sin piloto se queda flotando (gastando batería) y al saltar aterriza sola en un sitio despejado', () => {
  // Árboles en una franja bajo el despegue: debe buscar otro sitio.
  const trees = (s) => (Math.abs(s.x - 10) < 12 && Math.abs(s.z + 20) < 12 ? 'Hay árboles debajo' : null);
  const { flight, run, ship, batteries } = flightSetup({ blocked: trees });
  flight.command('TAKEOFF');
  run(5);
  run(2, { forward: 1, turn: 0, vertical: 0 });
  flight.hover();
  flight.autopilot = true;
  const pos = [ship.x, ship.z, ship.y];
  const charge = batteries.total;
  run(10);
  assert.equal(flight.state, 'FLYING');
  assert.ok(Math.hypot(ship.x - pos[0], ship.z - pos[1]) < 1e-6 && Math.abs(ship.y - pos[2]) < 1e-6, 'quieta en el aire');
  assert.ok(batteries.total < charge, 'flotando gasta batería');
  // El jugador salta: aterrizaje automático fuera de la zona con árboles.
  ship.x = 10;
  ship.z = -20;
  assert.ok(flight.autoLand());
  assert.ok(flight.autoTarget, 'ha elegido un sitio');
  assert.equal(trees({ x: flight.autoTarget.x, z: flight.autoTarget.z }), null);
  run(40);
  assert.equal(flight.state, 'LANDED');
  assert.equal(trees(ship), null, 'posada fuera de los árboles');
});

test('en vuelo: adelante, girar, subir; recoger y sacar patas; aterrizar gasta batería', () => {
  const { flight, run, ship, batteries, events } = flightSetup();
  flight.command('TAKEOFF');
  run(5);
  const x0 = ship.x;
  const z0 = ship.z;
  const y0 = ship.y;
  const yaw0 = ship.yaw;
  run(3, { forward: 1, turn: 0, vertical: 1, boost: false });
  const moved = Math.hypot(ship.x - x0, ship.z - z0);
  assert.ok(moved > 20, `avanza (${moved.toFixed(1)} m)`);
  // Avanza hacia el morro (−Z local).
  const dir = [(ship.x - x0) / moved, (ship.z - z0) / moved];
  assert.ok(dir[0] * -Math.sin(yaw0) + dir[1] * -Math.cos(yaw0) > 0.99);
  assert.ok(ship.y > y0 + 10, 'sube');
  run(1, { forward: 0, turn: 1, vertical: 0 });
  assert.ok(ship.yaw < yaw0, 'D gira a la derecha');
  assert.ok(flight.command('RETRACT_LEGS').ok);
  run(SHIP.LEGS_TIME + 0.1);
  assert.equal(ship.legs, 0);
  assert.equal(flight.command('LAND').ok, false, 'sin patas no aterriza');
  flight.command('DEPLOY_LEGS');
  run(SHIP.LEGS_TIME + 0.1);
  assert.ok(flight.command('LAND').ok);
  run(40);
  assert.equal(flight.state, 'LANDED');
  assert.ok(Math.abs(ship.y - 3) < 1e-6, 'posada sobre el terreno');
  assert.ok(batteries.total < batteries.capacity, 'ha gastado batería');
  assert.ok(events.some(([t]) => t === 'LANDED'));
});

test('no aterriza en el agua ni en terreno muy irregular; sin batería aterriza sola', () => {
  const wet = flightSetup({ water: () => true });
  wet.flight.command('TAKEOFF');
  wet.run(5);
  wet.flight.command('LAND');
  wet.run(20);
  assert.notEqual(wet.flight.state, 'LANDED');
  assert.ok(wet.events.some(([t, d]) => t === 'NOTICE' && /agua/.test(d.message)));

  const rough = flightSetup({ ground: (x) => 3 + x * 0.4 });
  rough.flight.command('TAKEOFF');
  rough.run(5);
  assert.match(rough.flight.checkLanding(), /irregular/);

  const empty = flightSetup();
  empty.flight.command('TAKEOFF');
  empty.run(5);
  empty.flight.command('RETRACT_LEGS');
  empty.run(2);
  empty.batteries.fillAll(0.001);
  empty.run(40);
  assert.ok(empty.events.some(([t]) => t === 'EMERGENCY'));
  assert.equal(empty.flight.state, 'LANDED', 'aterrizaje de emergencia con las patas fuera');
  assert.equal(empty.flight.command('TAKEOFF').ok, false, 'sin batería no despega');
});

test('la nave nunca baja del terreno en vuelo', () => {
  const { flight, run, ship } = flightSetup({ ground: (x, z) => 3 + Math.max(0, (x - 10) * 0.3) });
  flight.command('TAKEOFF');
  run(5);
  flight.command('RETRACT_LEGS');
  run(2);
  // Volar hacia +X (sube el terreno) bajando todo el rato.
  ship.yaw = -Math.PI / 2;
  for (let i = 0; i < 300; i++) {
    flight.update(1 / 30, { forward: 1, turn: 0, vertical: -1 });
    const ground = 3 + Math.max(0, (ship.x + 8 - 10) * 0.3); // punto más alto bajo la huella (aprox.)
    assert.ok(ship.y + L.LEG_RETRACTED_BOTTOM >= ground - 1.5, 'no atraviesa el terreno');
  }
});
