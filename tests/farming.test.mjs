/**
 * P4 (v1.28): granja, pesca y animales — huerto (sembrar, regar, abonar, crecer,
 * cosechar), pesca con minijuego, domesticar, ordeñar, esquilar y gallinas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { SeededRandom } from '../js/core/SeededRandom.js';
import { FLORA_TABLE } from '../js/world/map/MapLegend.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { FarmSystem, buildCrop } = await import('../js/farming/FarmSystem.js');
const { RanchSystem } = await import('../js/animals/RanchSystem.js');
const { FishingSystem, FishState } = await import('../js/fishing/FishingSystem.js');
const { Cow } = await import('../js/animals/Cow.js');
const { Chicken } = await import('../js/animals/Chicken.js');
const { SHAPES } = await import('../js/construction/BuildRules.js');
const { BUILD_MODELS } = await import('../js/construction/BuildModels.js');
const { buildItemModel } = await import('../js/render/ItemModels.js');
const { PropMesher } = await import('../js/world/props/PropMesher.js');

/** Inventario real y una barra con un hueco seleccionado. */
function kit() {
  const events = new EventBus();
  const messages = [];
  events.on(GameEvents.UI_MESSAGE, (m) => messages.push(m.text));
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const hotbar = {
    selectedIndex: 0,
    get selectedId() {
      return inventory.slots[this.selectedIndex]?.id ?? null;
    },
  };
  const hold = (id, n = 1, opts) => {
    inventory.slots[0] = null;
    inventory.slots[0] = { id, count: n, ...(opts ?? {}) };
  };
  return { events, messages, inventory, hotbar, hold };
}

test('config P4: cultivos, semillas, peces, gallina y recetas', () => {
  for (const [id, crop] of Object.entries(C.FARM.CROPS)) {
    assert.ok(Object.values(C.ITEMS).some((d) => d.SEED === id), `${id}: algo lo siembra`);
    for (const item of Object.keys(crop.YIELD)) assert.ok(C.ITEMS[item], `${id}: ${item}`);
    for (let s = 0; s < 4; s++) assert.ok(buildCrop(id, s, crop.COLORS).positions.length > 0);
  }
  for (const c of C.FISHING.CATCHES) assert.ok(C.ITEMS[c.ITEM], c.ITEM);
  for (const [id, r] of Object.entries(C.RECIPES)) {
    for (const k of [r.RESULT, ...Object.keys(r.INGREDIENTS), ...Object.keys(r.RETURNS ?? {})]) assert.ok(C.ITEMS[k], `${id}: ${k}`);
  }
  assert.equal(SHAPES.FARM_PLOT.interact, 'FARM');
  assert.ok(BUILD_MODELS.FARM_PLOT().positions.length > 0);
  assert.ok(C.ANIMALS.SPECIES.CHICKEN.DROPS.FEATHER);
  assert.ok(Chicken.buildModel(C.ANIMALS.SPECIES.CHICKEN.COLORS).body.positions.length > 0);
  for (const id of ['FISHING_ROD', 'SHEARS', 'BUCKET_MILK']) assert.ok(buildItemModel(id, C.ITEMS), id);
  const mesher = new PropMesher({ colors: C.PROPS });
  for (const t of ['WILD_CARROT', 'WILD_POTATO', 'WILD_PUMPKIN']) {
    assert.ok(mesher.nodeGeometry({ type: t, variant: 0, tint: 0.5 }), t);
    assert.ok(Object.values(FLORA_TABLE).some((tb) => tb[t]), `${t} sale en el mapa`);
  }
});

function farmKit() {
  const k = kit();
  const plot = (x, z) => ({ id: x * 100 + z, type: 'FARM_PLOT', x, y: 0, z, data: null, object: new THREE.Group() });
  const pieces = [plot(0, 0), plot(2, 0), plot(10, 0)];
  const construction = { pieces, allPieces: () => pieces };
  const farm = new FarmSystem({ config: C.FARM, items: C.ITEMS, construction, inventory: k.inventory, hotbar: k.hotbar, events: k.events, random: () => 0.99 });
  return { ...k, farm, pieces };
}

test('huerto: sembrar, regar (y las de al lado), abonar, crecer y cosechar', () => {
  const k = farmKit();
  const [a, b, far] = k.pieces;
  assert.match(k.farm.actionText(a), /Vacía/);
  k.hold('WHEAT_SEEDS', 3);
  assert.match(k.farm.actionText(a), /Sembrar trigo/);
  assert.ok(k.farm.interact(a));
  assert.equal(k.inventory.getItemCount('WHEAT_SEEDS'), 2);
  assert.equal(k.farm.stateOf(a).crop, 'WHEAT');
  // Seca crece despacio.
  const G = C.FARM.CROPS.WHEAT.GROW;
  k.farm.advance(G * 0.5);
  assert.ok(Math.abs(k.farm.stateOf(a).growth - 0.5 * C.FARM.DRY_SPEED) < 1e-9);
  // Regar: también la de al lado, no la lejana; el cubo queda vacío.
  k.hold('BUCKET_WATER');
  assert.equal(k.farm.actionText(a), 'Regar');
  assert.ok(k.farm.interact(a));
  assert.equal(k.inventory.slots[0].id, 'BUCKET');
  assert.ok(k.farm.stateOf(b).water > 0 && k.farm.stateOf(far).water === 0);
  // Abonar y crecer hasta madurar.
  k.hold('BONE_MEAL', 2);
  assert.ok(k.farm.interact(a));
  assert.equal(k.farm.stateOf(a).fert, true);
  assert.equal(k.farm.interact(a), false, 'no se abona dos veces');
  k.farm.update(G); // regada y abonada: madura
  assert.equal(k.farm.stateOf(a).growth, 1);
  assert.equal(k.farm.stage(k.farm.stateOf(a)), 3);
  assert.ok(a.object.children.length > 0, 'se dibuja el cultivo');
  assert.match(k.farm.actionText(a), /Cosechar/);
  k.hold('STONE', 1);
  assert.ok(k.farm.interact(a));
  const [lo, hi] = C.FARM.CROPS.WHEAT.YIELD.WHEAT;
  assert.equal(k.inventory.getItemCount('WHEAT'), hi + C.FARM.FERT_BONUS, 'abonado da más');
  assert.ok(lo >= 1);
  assert.equal(k.farm.stateOf(a).crop, null);
});

test('huerto: durmiendo también crece; el estado va en la pieza (se guarda con lo construido)', () => {
  const k = farmKit();
  const [a] = k.pieces;
  k.hold('POTATO', 1);
  k.farm.interact(a);
  k.events.emit(GameEvents.PLAYER_SLEPT, { hours: 8 });
  const d = a.data;
  assert.ok(d.growth > 0);
  assert.deepEqual(Object.keys(d).sort(), ['crop', 'fert', 'growth', 'water']);
  // Datos raros (partida editada): se corrigen.
  a.data = { crop: 'ROSES', growth: 9, water: -3 };
  const s = k.farm.stateOf(a);
  assert.equal(s.crop, null);
  assert.equal(s.growth, 1);
  assert.equal(s.water, 0);
});

/** Animales falsos con la forma de los de AnimalSystem. */
function ranchKit() {
  const k = kit();
  const mk = (id, species, x) => ({ id, species, def: C.ANIMALS.SPECIES[species], x, z: 0, y: 0, alive: true, health: 5, home: { x, z: 0, radius: 20 }, tamed: false, state: 'IDLE' });
  const animals = { animals: [mk('COW-0-0', 'COW', 0), mk('GOAT-0-0', 'GOAT', 3), mk('CHICKEN-0-0', 'CHICKEN', 6), mk('DEER-0-0', 'DEER', 9)], _env: {} };
  const drops = [];
  const pickups = { drop: (...a) => drops.push(a) };
  const ranch = new RanchSystem({ config: C.RANCH, items: C.ITEMS, animals, inventory: k.inventory, hotbar: k.hotbar, events: k.events, pickups, homeId: 'HOME' });
  return { ...k, ranch, animals, drops, cow: animals.animals[0], goat: animals.animals[1], hen: animals.animals[2], deer: animals.animals[3] };
}

test('domesticar: con su comida se acercan; tras darles de comer son tuyos', () => {
  const k = ranchKit();
  k.hold('WHEAT', 5);
  k.ranch.update(0.1);
  assert.ok(k.animals._env.lure.has('COW') && k.animals._env.lure.has('GOAT') && !k.animals._env.lure.has('DEER'));
  assert.equal(k.ranch.actionText(k.deer), null, 'el ciervo no se domestica');
  assert.match(k.ranch.actionText(k.cow), /Dar de comer \(0\/3\)/);
  for (let i = 0; i < C.RANCH.SPECIES.COW.FEEDS; i++) assert.ok(k.ranch.interact(k.cow));
  assert.equal(k.cow.tamed, true);
  assert.equal(k.inventory.getItemCount('WHEAT'), 5 - C.RANCH.SPECIES.COW.FEEDS);
  assert.notEqual(k.cow.home, k.goat.home, 'casa propia');
  assert.equal(k.cow.temperament, 'NEUTRAL');
  // Los enemigos (otra fuente) no se tocan.
  assert.equal(k.ranch.actionText(k.cow, { other: true }), null);
});

test('ordeñar, esquilar y huevos; todo se guarda', () => {
  const k = ranchKit();
  // Vaca salvaje: no se deja.
  k.hold('BUCKET');
  assert.equal(k.ranch.interact(k.cow), false);
  k.ranch._tame(k.cow, k.ranch._st(k.cow));
  assert.ok(k.ranch.interact(k.cow));
  assert.equal(k.inventory.slots[0].id, 'BUCKET_MILK');
  k.hold('BUCKET');
  assert.equal(k.ranch.interact(k.cow), false, 'hay que esperar a que vuelva a tener leche');
  // Esquilar (también salvaje: luego huye).
  k.hold('SHEARS', 1, { dur: 250 });
  assert.ok(k.ranch.interact(k.goat));
  assert.ok(k.inventory.getItemCount('WOOL') >= C.RANCH.SPECIES.GOAT.WOOL[0]);
  assert.equal(k.inventory.slots[0].dur, 249);
  assert.equal(k.goat.state, 'FLEE');
  // Gallina tuya: pone huevos.
  k.hold('WHEAT_SEEDS', 5);
  k.ranch.interact(k.hen);
  k.ranch.interact(k.hen);
  assert.equal(k.hen.tamed, true);
  k.ranch.update(C.RANCH.SPECIES.CHICKEN.EGG_EVERY + 1);
  assert.equal(k.drops.length, 1);
  assert.equal(k.drops[0][3], 'EGG');
  // Guardar y cargar en otro mundo igual.
  const snap = JSON.parse(JSON.stringify(k.ranch.snapshot()));
  const k2 = ranchKit();
  k2.ranch.restore(snap);
  assert.equal(k2.cow.tamed, true);
  assert.equal(k2.hen.tamed, true);
  assert.equal(k2.goat.tamed, false);
  k2.hold('BUCKET');
  assert.equal(k2.ranch.interact(k2.cow), false, 'la espera de la leche también se guarda');
  // Datos basura: se ignoran.
  const k3 = ranchKit();
  k3.ranch.restore({ 'COW-0-0': { tamed: 'yes', trust: 1e9 }, nope: { tamed: true }, 'DEER-0-0': { tamed: true } });
  assert.equal(k3.cow.tamed, false);
  assert.equal(k3.deer.tamed, false);
});

test('animal real: con su comida en la mano se acerca en vez de huir; domesticado no huye', () => {
  const env = {
    cfg: C.ANIMALS, player: { x: 0, z: 0 }, playerRunning: false, turnSpeed: 3, lure: new Set(), lureDistance: 14,
    groundAt: () => 0, isWalkable: () => true, resolveCollisions: () => false, onAttack() {},
  };
  const def = { ...C.ANIMALS.SPECIES.COW, FLEE_DISTANCE: 8 };
  const cow = new Cow({ id: 'c', species: 'COW', def, x: 5, z: 0, home: { x: 5, z: 0, radius: 10 }, rng: new SeededRandom(1), scale: 1, temperament: 'FLEE', hitReaction: 'FLEE' });
  cow.update(0.1, env);
  assert.equal(cow.state, 'FLEE');
  env.lure.add('COW');
  cow._toIdle();
  for (let i = 0; i < 30; i++) cow.update(0.1, env);
  assert.equal(cow.state, 'CURIOUS');
  assert.ok(cow.x < 5, 'se acerca');
  env.lure.clear();
  cow.tamed = true;
  cow._toIdle();
  for (let i = 0; i < 10; i++) cow.update(0.1, env);
  assert.notEqual(cow.state, 'FLEE');
});

function fishKit({ where = 'SEA', seed = 3 } = {}) {
  const k = kit();
  const rng = new SeededRandom(seed);
  const keys = new Set();
  const pressed = new Set();
  const input = { blocked: false, isDown: (a) => keys.has(a), wasPressed: (a) => pressed.has(a) };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 0, -10);
  const world = {
    getHeightAt: (x, z) => (z < -3 ? -2 : 1),
    seaLevel: 0,
    map: where === 'SEA' ? null : { waterAt: (x, z) => (z < -3 ? 0.5 : null) },
    water: { ponds: where === 'LAKE' ? [{ x: 0, z: -8, radius: 8 }] : [] },
  };
  const player = { position: new THREE.Vector3(0, 0, 0), yaw: 0, state: {} };
  const fishing = new FishingSystem({ config: C.FISHING, items: C.ITEMS, input, hotbar: k.hotbar, inventory: k.inventory, player, camera, world, scene: new THREE.Scene(), events: k.events, random: () => rng.next() });
  const press = (a) => {
    pressed.add(a);
    fishing.update(0.016);
    pressed.delete(a);
  };
  return { ...k, fishing, keys, press, player };
}

test('pesca: lanzar al agua, picar, minijuego y pescado (o se escapa)', () => {
  for (const where of ['SEA', 'RIVER', 'LAKE']) assert.equal(fishKit({ where }).fishing.findWater()?.where, where, where);
  const k = fishKit();
  k.hold('FISHING_ROD', 1, { dur: 200 });
  assert.ok(k.fishing.capturesUse);
  k.press('USE');
  assert.equal(k.fishing.state, FishState.CAST);
  assert.ok(k.fishing.busy);
  for (let i = 0; i < 1000 && k.fishing.state !== FishState.BITE; i++) k.fishing.update(0.05);
  assert.equal(k.fishing.state, FishState.BITE);
  k.press('ATTACK');
  assert.equal(k.fishing.state, FishState.REEL);
  // Jugador listo: mantiene el clic si la zona está por debajo del pez.
  for (let i = 0; i < 4000 && k.fishing.state === FishState.REEL; i++) {
    const g = k.fishing.game;
    if (g.zone + g.size * 0.5 < g.fish) k.keys.add('ATTACK');
    else k.keys.delete('ATTACK');
    k.fishing.update(0.016);
  }
  k.keys.delete('ATTACK');
  assert.equal(k.fishing.state, FishState.IDLE);
  const caught = [...new Set(C.FISHING.CATCHES.map((c) => c.ITEM))].filter((id) => k.inventory.getItemCount(id) > 0);
  assert.equal(caught.length, 1, 'algo se ha pescado');
  assert.equal(k.inventory.slots[0].dur, 199, 'la caña se gasta');
  // Sin tocar nada durante el minijuego: se escapa.
  const k2 = fishKit({ seed: 9 });
  k2.hold('FISHING_ROD', 1, { dur: 200 });
  k2.press('USE');
  for (let i = 0; i < 1000 && k2.fishing.state !== FishState.BITE; i++) k2.fishing.update(0.05);
  k2.press('ATTACK');
  k2.fishing.game.fish = 0.95;
  k2.fishing.game.target = 0.95;
  for (let i = 0; i < 2000 && k2.fishing.state === FishState.REEL; i++) {
    k2.fishing.game.target = 0.95;
    k2.fishing.game.retarget = 10;
    k2.fishing.update(0.016);
  }
  assert.equal(k2.fishing.state, FishState.IDLE);
  assert.ok(k2.messages.some((m) => /escapado/.test(m)));
  // Mirando a tierra no se lanza; alejarse rompe el sedal.
  const k3 = fishKit();
  k3.hold('FISHING_ROD', 1, { dur: 200 });
  k3.press('USE');
  k3.player.position.set(0, 0, 20);
  k3.fishing.update(0.016);
  assert.equal(k3.fishing.state, FishState.IDLE);
});
