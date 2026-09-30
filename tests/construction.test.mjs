/**
 * Tests de la construcción modular (reglas puras, sin Three.js). `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHAPES, snapXZ, slotKey, terrainBaseY, isSupported, worldColliders, surfaceAt, pushOutOfBox, shelterAt,
} from '../js/construction/BuildRules.js';

const G = 2;
const flat = () => 0;
const place = (type, x, z, y = 0, yaw = 0, rotSteps = 0) => {
  const s = snapXZ(type, x, z, { grid: G, yaw, rotSteps });
  return { type, ...s, y, id: Math.random() };
};

test('anclaje: suelos a la casilla, paredes al borde más cercano, pilares a la esquina', () => {
  const f = place('FLOOR', 3.3, 5.9);
  assert.deepEqual([f.x, f.z, f.slot], [3, 5, 'CELL:1:2']);
  const w1 = place('WALL', 3.3, 4.2); // cerca del borde z = 4
  assert.deepEqual([w1.x, w1.z, w1.rotation, w1.slot], [3, 4, 0, 'EDGEX:1:2']);
  const w2 = place('WALL', 3.9, 5.1); // cerca del borde x = 4
  assert.deepEqual([w2.x, w2.z, w2.slot], [4, 5, 'EDGEZ:2:2']);
  assert.ok(Math.abs(w2.rotation - Math.PI / 2) < 1e-9);
  const p = place('PILLAR', 3.8, 4.3);
  assert.deepEqual([p.x, p.z, p.slot], [4, 4, 'CORNER:2:2']);
  const bed = place('BED', 3.26, 5.74);
  assert.deepEqual([bed.x, bed.z, bed.slot], [3.25, 5.75, null]);
});

test('clave de hueco: misma posición y altura → misma clave; otro piso → distinta', () => {
  const a = place('WALL', 3.3, 4.2);
  const b = place('DOOR', 2.6, 3.9);
  assert.equal(slotKey(a.slot, 0.2), slotKey(b.slot, 0.2));
  assert.notEqual(slotKey(a.slot, 0.2), slotKey(a.slot, 2.8));
});

test('superficies: suelo plano y escalera que sube alejándose del jugador', () => {
  const floor = place('FLOOR', 1, 1, 0.5);
  assert.equal(surfaceAt(floor, 1.5, 0.5).top, 0.7);
  assert.equal(surfaceAt(floor, 3, 1), null);
  const stairs = place('STAIRS', 1, 1, 0); // jugador mirando a -Z (yaw 0)
  const near = surfaceAt(stairs, 1, 1.99).top; // lado +Z (jugador)
  const far = surfaceAt(stairs, 1, 0.01).top;
  assert.ok(near < 0.05 && far > 2.5, `${near} → ${far}`);
});

test('colisiones: la pared bloquea; la puerta solo con la hoja cerrada', () => {
  const wall = place('WALL', 1, 0.1);
  const pos = { x: 1, z: 0.05 };
  for (const b of worldColliders(wall)) pushOutOfBox(pos, 0.35, b);
  assert.ok(Math.abs(pos.z) >= 0.1 + 0.35 - 1e-6);
  const door = { ...place('DOOR', 1, 0.1), open: false };
  const inDoorway = () => worldColliders(door).some((b) => b.minX <= 1 && b.maxX >= 1 && b.minZ <= 0 && b.maxZ >= 0 && b.minY < 1);
  assert.ok(inDoorway(), 'cerrada bloquea el hueco');
  door.open = true;
  assert.ok(!inDoorway(), 'abierta deja pasar');
});

test('apoyo: en el suelo sí; flotando no; encima de una pared sí', () => {
  const wall = place('WALL', 1, 0.1, 0);
  assert.ok(isSupported(wall, [], flat, G));
  const floating = place('FLOOR', 1, 1, 3);
  assert.ok(!isSupported(floating, [], flat, G));
  const upper = place('FLOOR', 1, 1, SHAPES.WALL.top);
  assert.ok(isSupported(upper, [wall], flat, G));
  const beside = place('FLOOR', 3, 1, SHAPES.WALL.top);
  assert.ok(isSupported(beside, [upper], flat, G), 'se puede prolongar un suelo al mismo nivel');
});

test('altura sobre terreno inclinado: suelos por encima, paredes se hunden en lo alto', () => {
  const slope = (x) => x * 0.2;
  const floor = place('FLOOR', 1, 1);
  const wall = place('WALL', 1, 0.1);
  assert.ok(terrainBaseY(floor, slope) >= 0.4 - 1e-9);
  assert.ok(terrainBaseY(wall, slope) <= 0.0 + 1e-9);
});

test('refugio: techo encima y paredes en los bordes de la casilla', () => {
  const pieces = [
    place('FLOOR', 1, 1, 0),
    place('WALL', 1, 0.1, 0.2), place('WALL', 1, 1.9, 0.2), place('WALL', 0.1, 1, 0.2), place('DOOR', 1.9, 1, 0.2),
    place('FLOOR', 1, 1, 0.2 + SHAPES.WALL.top),
  ];
  const s = shelterAt(pieces, 1, 0.2, 1);
  assert.deepEqual([s.roofed, s.walls, s.factor], [true, 4, 1]);
  const outside = shelterAt(pieces, 12, 0, 12);
  assert.deepEqual([outside.roofed, outside.walls], [false, 0]);
  // Habitación más grande (2×1 casillas): desde una esquina se ven las 4 paredes.
  const big = [
    place('WALL', 1, 0.1, 0), place('WALL', 3, 0.1, 0), place('WALL', 1, 1.9, 0), place('WALL', 3, 1.9, 0),
    place('WALL', 0.1, 1, 0), place('WALL', 3.9, 1, 0),
  ];
  assert.equal(shelterAt(big, 0.8, 0, 1).walls, 4);
});
