/**
 * P6 (v1.29): construcción y decoración — piedra y ladrillo, hastial, media pared, puerta
 * de valla, escalera de mano, barandilla, trampilla, ventanal, muebles, pozo, recolector
 * de lluvia, secadero, maniquí y giro libre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { ThirstSystem } from '../js/player/ThirstSystem.js';
import { SHAPES, snapXZ, surfaceAt, ladderAt, worldColliders } from '../js/construction/BuildRules.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { BUILD_MODELS } = await import('../js/construction/BuildModels.js');
const { ConstructionSystem } = await import('../js/construction/ConstructionSystem.js');
const { HomeSystem } = await import('../js/construction/HomeSystem.js');
const { PlayerController } = await import('../js/player/PlayerController.js');

const NEW = ['STONE_WALL', 'BRICK_WALL', 'STONE_FLOOR', 'BRICK_FLOOR', 'TILE_ROOF', 'STONE_STAIRS', 'STONE_PILLAR', 'HALF_WALL', 'STONE_HALF_WALL',
  'GABLE', 'BIG_WINDOW', 'FENCE_GATE', 'RAILING', 'LADDER', 'TRAPDOOR', 'TABLE', 'CHAIR', 'BENCH', 'BOOKSHELF', 'WARDROBE', 'BARREL', 'RUG', 'LAMP',
  'FLOWER_POT', 'WELL', 'RAIN_COLLECTOR', 'DRYING_RACK', 'MANNEQUIN'];

test('piezas nuevas: forma, modelo, objeto y receta; las de piedra aguantan más', () => {
  for (const t of NEW) {
    assert.ok(SHAPES[t], `forma ${t}`);
    assert.ok(BUILD_MODELS[t]().positions.length > 0, `modelo ${t}`);
    assert.ok(C.BUILD.PIECES[t] && C.ITEMS[`PIECE_${t}`] && C.RECIPES[`PIECE_${t}`], `pieza ${t}`);
    for (const ing of Object.keys(C.RECIPES[`PIECE_${t}`].INGREDIENTS)) assert.ok(C.ITEMS[ing], `${t}: ${ing}`);
    if (SHAPES[t].leaf) assert.ok(BUILD_MODELS[`${t}_LEAF`], `${t}: hoja`);
    if (SHAPES[t].glass) assert.ok(BUILD_MODELS[`${t}_GLASS`], `${t}: cristal`);
  }
  assert.equal(SHAPES.STONE_WALL, SHAPES.WALL, 'misma forma que la de madera');
  assert.ok(C.BUILD.PIECES.STONE_WALL.HARD > 1 && C.BUILD.PIECES.BRICK_WALL.HARD > 1);
  assert.equal(SHAPES.WARDROBE.storage, 18);
  assert.equal(SHAPES.BARREL.storage, 9);
  assert.equal(C.RECIPES.PIECE_TABLE.CATEGORY, 'FURNITURE');
  assert.equal(C.RECIPES.PIECE_DRYING_RACK.CATEGORY, 'STATIONS');
  assert.ok(Object.values(C.RECIPES).filter((r) => r.STATION === 'DRYING_RACK').length >= 3);
});

test('giro libre: los muebles giran de 15 en 15°, las paredes siguen de 90 en 90°', () => {
  const free = snapXZ('TABLE', 1.1, 2.3, { grid: 2, yaw: 0, rotSteps: 1 });
  assert.ok(Math.abs(free.rotation - Math.PI / 12) < 1e-9);
  assert.equal(free.x, 1);
  const wall = snapXZ('WALL', 1.1, 0.1, { grid: 2, yaw: 0, rotSteps: 1 });
  assert.ok(Math.abs(wall.rotation % (Math.PI / 2)) < 1e-9 || Math.abs((wall.rotation % (Math.PI / 2)) - Math.PI / 2) < 1e-9);
  // Una mesa girada 45° choca con una caja que la envuelve (un poco más grande).
  const box = worldColliders({ type: 'TABLE', x: 0, y: 0, z: 0, rotation: Math.PI / 4 })[0];
  assert.ok(box.maxX > 0.8 && box.maxX < 1.0);
});

test('trampilla: cerrada se pisa; abierta deja el hueco', () => {
  const t = { type: 'TRAPDOOR', x: 1, y: 2.4, z: 1, rotation: 0, open: false };
  assert.equal(surfaceAt(t, 1, 1).top, 2.6);
  t.open = true;
  assert.equal(surfaceAt(t, 1, 1), null);
});

function construction() {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const cs = new ConstructionSystem({
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), config: C.BUILD, world: {}, player: { position: new THREE.Vector3(), yaw: 0 },
    input: { wasPressed: () => false, isDown: () => false }, inventory, items: C.ITEMS, events, homeId: 'HOME',
  });
  return { cs, events, inventory };
}

test('puertas, puerta de valla y trampilla se abren con E; armario y barril guardan', () => {
  const { cs, events } = construction();
  const gate = cs.addPiece({ type: 'FENCE_GATE', x: 0, y: 0, z: 0, rotation: 0, slot: 'EDGEX:0:0' });
  assert.ok(gate.leaf, 'tiene hoja');
  assert.equal(worldColliders(gate).length, 3, 'cerrada bloquea');
  events.emit(GameEvents.STRUCTURE_INTERACT, { structure: gate });
  assert.equal(gate.open, true);
  assert.equal(worldColliders(gate).length, 2, 'abierta se pasa');
  const trap = cs.addPiece({ type: 'TRAPDOOR', x: 5, y: 2.4, z: 5, rotation: 0, slot: 'CELL:2:2' });
  events.emit(GameEvents.STRUCTURE_INTERACT, { structure: trap });
  assert.ok(Math.abs(trap.leaf.rotation.x - Math.PI / 2) < 1e-9, 'la hoja se levanta');
  assert.equal(cs.surfaceAt(5, 5, 10), null);
  const wardrobe = cs.addPiece({ type: 'WARDROBE', x: 9, y: 0, z: 9, rotation: 0.3, slot: null });
  const barrel = cs.addPiece({ type: 'BARREL', x: 12, y: 0, z: 9, rotation: 0, slot: null });
  assert.equal(wardrobe.data.slots.length, 18);
  assert.equal(barrel.data.slots.length, 9);
  const win = cs.addPiece({ type: 'BIG_WINDOW', x: 20, y: 0, z: 0, rotation: 0, slot: 'EDGEX:10:0' });
  assert.equal(win.object.children.length, 2, 'marco y cristal');
  // Las escaleras de mano se encuentran por su zona de trepar.
  cs.addPiece({ type: 'LADDER', x: 30, y: 0, z: 0, rotation: 0, slot: null });
  assert.ok(cs.ladderAt(30, 1, 0.3));
  assert.equal(cs.ladderAt(30, 1, -1), null, 'por detrás no');
  assert.equal(cs.ladderAt(30, 5, 0.3), null, 'por encima no');
});

test('escalera de mano: avanzando se sube; arriba se pasa a la plataforma', () => {
  const ladder = { type: 'LADDER', x: 0, y: 0, z: 0, rotation: 0 };
  // Plataforma detrás de la escalera, a 2,4 m.
  const structures = {
    ladderAt: (x, y, z) => ladderAt([ladder], x, y, z),
    surfaceAt: (x, z, maxY) => (z < -0.2 && maxY >= 2.4 ? 2.4 : null),
    blocksAt: () => false,
  };
  const keys = new Set(['FORWARD']);
  const input = { isDown: (k) => keys.has(k), wasPressed: () => false, getMouseDelta: () => ({ x: 0, y: 0 }), blocked: false };
  const player = {
    position: new THREE.Vector3(0, 0, 0.35), velocity: new THREE.Vector3(), yaw: 0, pitch: 0, bodyYaw: 0, height: 1.8,
    state: { onGround: true },
  };
  const ctrl = Object.create(PlayerController.prototype);
  Object.assign(ctrl, {
    _player: player, _structures: structures, _input: input, _cfg: C.PLAYER, _events: { emit() {} },
    _terrain: { getHeightAt: () => 0 }, _wish: new THREE.Vector3(0, 0, -1),
    _groundHeight: () => 0,
  });
  let steps = 0;
  while (steps++ < 400 && ctrl._updateLadder(0.05)) { /* sube */ }
  assert.ok(player.position.y >= 2.39, `arriba: ${player.position.y}`);
  assert.ok(player.position.z < -0.2, 'pasa a la plataforma');
  assert.equal(player.state.onLadder, false);
  // Sin avanzar hacia ella, no se agarra.
  player.position.set(0, 0, 0.35);
  ctrl._wish.set(1, 0, 0);
  assert.equal(ctrl._updateLadder(0.05), false);
});

function home() {
  const { cs, events, inventory } = construction();
  const thirst = new ThirstSystem({ config: C.SURVIVAL, events });
  const equipment = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory, events });
  const hotbar = {
    selectedIndex: 0,
    get selectedId() {
      return inventory.slots[0]?.id ?? null;
    },
  };
  const hs = new HomeSystem({ config: C.BUILD.RAIN_COLLECTOR, items: C.ITEMS, construction: cs, inventory, hotbar, equipment, thirst, events, waterPerSkin: C.EQUIPMENT.WATER_CAPACITY });
  return { cs, events, inventory, thirst, equipment, hs };
}

test('pozo y recolector de lluvia: llenar el cubo, el odre o beber', () => {
  const k = home();
  const well = k.cs.addPiece({ type: 'WELL', x: 0, y: 0, z: 0, rotation: 0, slot: null });
  k.inventory.slots[0] = { id: 'BUCKET', count: 1 };
  assert.match(k.hs.actionText(well), /Llenar el cubo/);
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: well });
  assert.equal(k.inventory.slots[0].id, 'BUCKET_WATER');
  k.inventory.slots[0] = null;
  k.inventory.addItem('WATERSKIN', 1);
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: well });
  assert.equal(k.inventory.getItemCount('WATER'), C.EQUIPMENT.WATER_CAPACITY);
  k.thirst.set(10);
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: well });
  assert.ok(k.thirst.value > 10, 'bebe');
  // Recolector: se llena con el tiempo, hasta su capacidad, y se gasta.
  const rc = k.cs.addPiece({ type: 'RAIN_COLLECTOR', x: 5, y: 0, z: 0, rotation: 0, slot: null });
  assert.equal(k.hs.interact(rc), false, 'vacío');
  k.hs.update(C.BUILD.RAIN_COLLECTOR.EVERY * 10);
  assert.equal(rc.data.water, C.BUILD.RAIN_COLLECTOR.CAPACITY);
  k.thirst.set(10);
  k.hs.interact(rc);
  assert.equal(Math.round(rc.data.water), C.BUILD.RAIN_COLLECTOR.CAPACITY - 1);
});

test('maniquí: te cambias la armadura con él; al romperlo, vuelve al inventario', () => {
  const k = home();
  const m = k.cs.addPiece({ type: 'MANNEQUIN', x: 0, y: 0, z: 0, rotation: 0, slot: null });
  k.equipment.equipDirect('CHEST', 'IRON_SHIELD'); // no es de pecho: no se pone
  k.equipment.equipDirect('CHEST', 'CHAIN_CHEST');
  k.equipment.equipDirect('HEAD', 'WOOL_HAT');
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: m });
  assert.equal(k.equipment.slots.CHEST, null);
  assert.equal(m.data.armor.CHEST.id, 'CHAIN_CHEST');
  k.hs.update(0.1);
  assert.ok(m.object.children.some((c) => c.children?.length === 2), 'se dibuja la armadura encima');
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: m });
  assert.equal(k.equipment.slots.CHEST, 'CHAIN_CHEST');
  assert.equal(k.equipment.slots.HEAD, 'WOOL_HAT');
  k.events.emit(GameEvents.STRUCTURE_INTERACT, { structure: m });
  k.events.emit(GameEvents.STRUCTURE_REMOVED, { structure: m });
  assert.equal(k.inventory.getItemCount('CHAIN_CHEST'), 1);
  // Partida editada: armadura que no es de su ranura, fuera.
  const m2 = k.cs.addPiece({ type: 'MANNEQUIN', x: 3, y: 0, z: 0, rotation: 0, slot: null });
  m2.data = { armor: { HEAD: { id: 'CHAIN_CHEST' }, CHEST: { id: 'CHAIN_CHEST', dur: 1e9 }, LEGS: { id: 'NOPE' } } };
  k.events.emit(GameEvents.STRUCTURE_RESTORED, { structure: m2 });
  assert.deepEqual(Object.keys(m2.data.armor), ['CHEST']);
});
