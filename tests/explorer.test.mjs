/**
 * Tests de la nave ampliada (plano EXPLORER): salas, puertas, pasillo central,
 * compuerta de la cámara de descompresión y tecnologías instaladas. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { createShipLayout } from '../js/ship/ShipLayout.js';
import { BLUEPRINTS } from '../js/ship/ShipBlueprints.js';

const L = createShipLayout(BLUEPRINTS.EXPLORER);
const SMALL = createShipLayout(BLUEPRINTS.SMALL);

function newShip(over = {}) {
  return { x: -30, y: 4, z: 12, yaw: -1.1, hatch: 0, legs: 1, doors: {}, legFeet: L.LEGS.map(() => 0), rampAngle: L.rampOpenAngle(0), pitch: 0, roll: 0, ...over };
}
const world = (s, lx, lz) => L.toWorld(s, lx, lz);

test('la nave ampliada es más grande, con alas, más motores y cinco salas', () => {
  assert.ok(L.DIM.REAR - L.DIM.FRONT > (SMALL.DIM.REAR - SMALL.DIM.FRONT) * 1.8);
  assert.ok(L.DIM.HALF_WIDTH > SMALL.DIM.HALF_WIDTH);
  assert.ok(BLUEPRINTS.EXPLORER.wings && !BLUEPRINTS.SMALL.wings);
  assert.ok(BLUEPRINTS.EXPLORER.engines.length > BLUEPRINTS.SMALL.engines.length);
  const names = BLUEPRINTS.EXPLORER.rooms.map((r) => r.name);
  for (const n of ['Sala de mandos', 'Sala de estar', 'Laboratorio y sala de máquinas', 'Cápsulas de escape', 'Descompresión']) {
    assert.ok(names.includes(n), n);
  }
  // Salas contiguas de morro a cola.
  const rooms = BLUEPRINTS.EXPLORER.rooms;
  assert.equal(rooms[0].z0, L.DIM.FRONT);
  assert.equal(rooms.at(-1).z1, L.DIM.REAR);
  for (let i = 1; i < rooms.length; i++) assert.equal(rooms[i].z0, rooms[i - 1].z1);
});

test('roomAt identifica cada sala y la cámara de descompresión', () => {
  const s = newShip();
  const at = (lz) => {
    const [x, z] = world(s, 0, lz);
    return L.roomAt(s, x, s.y + L.DIM.FLOOR + 1, z);
  };
  assert.equal(at(-12).name, 'Sala de mandos');
  assert.equal(at(-6).name, 'Sala de estar');
  assert.equal(at(1).name, 'Laboratorio y sala de máquinas');
  assert.equal(at(7).name, 'Cápsulas de escape');
  assert.ok(at(11.5).airlock);
  const [ox, oz] = world(s, 0, 20);
  assert.equal(L.roomAt(s, ox, s.y + 3, oz), null);
});

test('pasillo central: las puertas cerradas bloquean y abiertas dejan pasar de la cámara a los mandos', () => {
  const walk = (ship) => {
    const [x0, z0] = world(ship, 0, 11.2);
    const pos = { x: x0, z: z0 };
    const [tx, tz] = world(ship, 0, -11.2);
    const y0 = ship.y + L.DIM.FLOOR;
    for (let i = 0; i < 600; i++) {
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.2) break;
      pos.x += (dx / d) * 0.08;
      pos.z += (dz / d) * 0.08;
      L.resolveCollisions(ship, pos, 0.35, y0 + 0.05, y0 + 1.8);
    }
    return L.toLocal(ship, pos.x, pos.z)[1];
  };
  // Cerradas: se queda delante de la puerta interior de la cámara (z = 9).
  assert.ok(walk(newShip()) > 9);
  const open = Object.fromEntries(L.DOORS.map((d) => [d.id, 1]));
  // Abiertas: llega a la sala de mandos.
  assert.ok(walk(newShip({ doors: open })) < -10.5);
});

test('ranuras, muebles e interruptores dentro del casco y fuera del pasillo central', () => {
  const bp = BLUEPRINTS.EXPLORER;
  const boxes = [...Object.values(bp.slots).map((s) => s.collider), ...bp.furniture.map((f) => f.box)];
  for (const b of boxes) {
    assert.ok(b.minX >= -L.DIM.INNER - 1e-9 && b.maxX <= L.DIM.INNER + 1e-9, JSON.stringify(b));
    assert.ok(b.minZ >= L.DIM.FRONT && b.maxZ <= L.DIM.REAR);
    assert.ok(b.maxX <= -0.9 || b.minX >= 0.9, `invade el pasillo: ${JSON.stringify(b)}`);
    // No atraviesa ningún tabique.
    for (const p of bp.partitions) assert.ok(b.maxZ <= p.z - 0.1 || b.minZ >= p.z + 0.1, `atraviesa el tabique ${p.z}`);
  }
  // Muebles con E: cama, dos cápsulas y panel de descompresión.
  const ids = bp.furniture.filter((f) => f.interact).map((f) => f.interact.id).sort();
  assert.deepEqual(ids, ['AIRLOCK', 'BED', 'POD_1', 'POD_2']);
});

test('la compuerta se abre en el suelo de la cámara de descompresión y su rampa llega al suelo', () => {
  const H = L.HATCH;
  const airlock = BLUEPRINTS.EXPLORER.rooms.find((r) => r.airlock);
  assert.ok(H.HINGE_Z >= airlock.z0 && H.HINGE_Z + H.LENGTH <= airlock.z1);
  const s = newShip({ hatch: 1 });
  const end = L.rampEnd(s);
  assert.ok(Math.abs(end.y) < 0.05, `la rampa acaba a ${end.y}`);
  // Abierta: sobre el hueco ya no hay suelo a la altura del piso.
  const [x, z] = world(s, 0, H.HINGE_Z + 1);
  assert.ok(L.surfaceAt(s, x, z, s.y + L.DIM.FLOOR + 0.1) < s.y + L.DIM.FLOOR - 0.1);
});

test('tecnologías de la nave ampliada: todas las ranuras existen y las tecnologías están definidas', () => {
  const S = GameConfig.SHIP;
  for (const [slot, tech] of Object.entries(S.INSTALLED_EXPLORER)) {
    assert.ok(L.SLOTS[slot], `ranura ${slot}`);
    if (tech) assert.ok(S.TECHNOLOGIES[tech], `tecnología ${tech}`);
  }
  for (const slot of Object.keys(L.SLOTS)) assert.ok(slot in S.INSTALLED_EXPLORER, `ranura sin asignar ${slot}`);
  assert.equal(S.INSTALLED_EXPLORER.LAB_3, 'SUIT_LOCKER');
  assert.equal(S.INSTALLED_EXPLORER.LAB_4, 'OXYGEN_STATION');
  assert.ok(GameConfig.ITEMS[S.SPACE_NODE_ITEM] && GameConfig.ITEMS[S.NODE_MAP_ITEM].USE === 'MAP');
});

test('las patas sostienen la nave y quedan fuera del pasillo', () => {
  assert.equal(L.LEGS.length, 6);
  for (const l of L.LEGS) {
    assert.ok(Math.abs(l.x) <= L.DIM.HALF_WIDTH && l.z > L.DIM.FRONT && l.z < L.DIM.REAR);
    // No bajo el hueco de la compuerta.
    assert.ok(!(Math.abs(l.x) < 1.3 && l.z > L.HATCH.HINGE_Z - 0.3 && l.z < L.HATCH.HINGE_Z + L.HATCH.LENGTH + 0.3));
  }
});
