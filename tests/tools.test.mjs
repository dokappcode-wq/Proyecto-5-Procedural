/**
 * P3 (v1.26): herramientas y armas por niveles — picos y hachas de cobre, hierro y
 * diamante (qué mena pica cada uno), pala, hoz, martillo, cubo, catalejo, farol, lanza,
 * ballesta, maza, bomba de slime y flechas de fuego y de cristal.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { HotbarSystem } from '../js/inventory/HotbarSystem.js';
import { ItemUseSystem } from '../js/inventory/ItemUseSystem.js';
import { ThirstSystem } from '../js/player/ThirstSystem.js';
import './helpers/three.mjs';

const THREE = await import('three');
const { buildItemModel } = await import('../js/render/ItemModels.js');
const { CombatSystem } = await import('../js/combat/CombatSystem.js');
const { EnemySystem } = await import('../js/enemies/EnemySystem.js');

const NEW_ITEMS = [
  'COPPER_AXE', 'COPPER_PICKAXE', 'IRON_AXE', 'IRON_PICKAXE', 'DIAMOND_AXE', 'DIAMOND_PICKAXE', 'SHOVEL', 'SICKLE', 'HAMMER',
  'BUCKET', 'BUCKET_WATER', 'SPYGLASS', 'LANTERN', 'SPEAR', 'CROSSBOW', 'MACE', 'SLIME_BOMB', 'FIRE_ARROW', 'CRYSTAL_ARROW',
  'DIAMOND_SWORD', 'DIAMOND_HELMET', 'DIAMOND_CHEST', 'DIAMOND_LEGS', 'DIAMOND_BOOTS', 'DIAMOND_GLOVES',
];

test('objetos nuevos: receta válida, material de reparación y modelo 3D', () => {
  for (const id of NEW_ITEMS) {
    const def = C.ITEMS[id];
    assert.ok(def, id);
    if (id !== 'BUCKET_WATER') {
      const r = Object.values(C.RECIPES).find((rc) => rc.RESULT === id);
      assert.ok(r, `receta de ${id}`);
      for (const ing of Object.keys(r.INGREDIENTS)) assert.ok(C.ITEMS[ing], `${id}: ${ing}`);
    }
    if (def.REPAIR) assert.ok(C.ITEMS[def.REPAIR], `${id} se arregla con ${def.REPAIR}`);
    if (def.MODEL) assert.ok(buildItemModel(id, C.ITEMS)?.group.children.length > 0, `modelo de ${id}`);
  }
  for (const r of Object.values(C.RECIPES)) {
    assert.ok(C.ITEMS[r.RESULT], r.RESULT);
    for (const ing of Object.keys(r.INGREDIENTS)) assert.ok(C.ITEMS[ing], `${r.RESULT}: ${ing}`);
  }
  // Las armas a distancia usan munición que existe.
  for (const [id, def] of Object.entries(C.ITEMS)) if (def.RANGED) for (const a of def.RANGED.AMMO) assert.ok(C.ITEMS[a], `${id}: ${a}`);
  assert.ok(buildItemModel('LANTERN', C.ITEMS).light, 'el farol alumbra');
});

test('niveles: cada mena tiene un pico que la pica y otro que no', () => {
  const picks = Object.entries(C.ITEMS).filter(([, d]) => d.TOOL?.MINE_SPEED);
  for (const [id, r] of Object.entries(C.RESOURCE_TYPES)) {
    const tier = r.BREAK?.TIER;
    if (!tier) continue;
    assert.ok(picks.some(([, d]) => (d.TOOL.TIER ?? 1) >= tier), `${id}: algún pico`);
    assert.ok(picks.some(([, d]) => (d.TOOL.TIER ?? 1) < tier), `${id}: el de piedra no`);
  }
  assert.equal(C.RESOURCE_TYPES.IRON_ORE.BREAK.TIER, 2);
  assert.equal(C.RESOURCE_TYPES.DIAMOND_ORE.BREAK.TIER, 3);
  // Mejor material = más rápido.
  const speed = (id) => C.ITEMS[id].TOOL.MINE_SPEED;
  assert.ok(speed('STONE_PICKAXE') < speed('COPPER_PICKAXE') && speed('COPPER_PICKAXE') < speed('IRON_PICKAXE') && speed('IRON_PICKAXE') < speed('DIAMOND_PICKAXE'));
  assert.ok(C.ITEMS.MACE.WEAPON.VS.GOLEM > 1);
  assert.ok(C.ITEMS.SHOVEL.TOOL.HARVEST_BONUS.SAND_PILE > 0 && C.ITEMS.SICKLE.TOOL.HARVEST_BONUS.WILD_WHEAT > 0);
});

function kit() {
  const events = new EventBus();
  const messages = [];
  events.on(GameEvents.UI_MESSAGE, (m) => messages.push(m.text));
  const input = { blocked: false, wasPressed: () => false, isDown: () => false, setBlocked() {} };
  const inventory = new InventorySystem({ items: C.ITEMS, events });
  const thirst = new ThirstSystem({ config: C.SURVIVAL, events });
  const equipment = new EquipmentSystem({ items: C.ITEMS, config: C.EQUIPMENT, inventory, events });
  const hotbar = new HotbarSystem({ input, inventory, events });
  const interaction = { target: null };
  const itemUse = new ItemUseSystem({ items: C.ITEMS, equipmentConfig: C.EQUIPMENT, input, hotbar, inventory, nutrition: {}, equipment, interaction, thirst, events });
  return { events, messages, inventory, thirst, equipment, hotbar, interaction, itemUse };
}

test('martillo: arregla lo más gastado con 1 lingote de su material', () => {
  const k = kit();
  k.inventory.addItem('HAMMER', 1);
  k.inventory.addItem('IRON_PICKAXE', 1, { dur: 100 });
  k.inventory.addItem('STONE_AXE', 1, { dur: 300 });
  assert.equal(k.itemUse.use('HAMMER'), false, 'sin lingotes no arregla');
  assert.match(k.messages.at(-1), /hierro refinado/);
  k.inventory.addItem('REFINED_IRON', 1);
  assert.ok(k.itemUse.use('HAMMER'));
  const pick = k.inventory.slots.find((s) => s?.id === 'IRON_PICKAXE');
  assert.equal(pick.dur, 100 + Math.ceil(900 * 0.4));
  assert.equal(k.inventory.getItemCount('REFINED_IRON'), 0);
  // Lo único gastado que queda es el hacha de piedra (se arregla con piedra refinada).
  k.inventory.addItem('REFINED_STONE', 2);
  assert.ok(k.itemUse.use('HAMMER'));
  assert.equal(k.inventory.slots.find((s) => s?.id === 'STONE_AXE').dur, 400);
  assert.equal(k.itemUse.repairMaterial('LEATHER_CHEST') ?? 'REFINED_LEATHER', 'REFINED_LEATHER');
});

test('cubo: se llena mirando al agua y se bebe', () => {
  const k = kit();
  k.inventory.addItem('BUCKET', 1);
  k.hotbar.select('BUCKET');
  assert.equal(k.itemUse.use('BUCKET'), false);
  k.interaction.target = { kind: 'water' };
  assert.ok(k.itemUse.use('BUCKET'));
  assert.equal(k.inventory.getItemCount('BUCKET_WATER'), 1);
  assert.equal(k.inventory.getItemCount('BUCKET'), 0);
  assert.equal(k.hotbar.selectedId, 'BUCKET_WATER', 'en el mismo hueco');
  k.thirst.set(10);
  assert.ok(k.itemUse.use('BUCKET_WATER'));
  assert.ok(k.thirst.value > 10 + C.SURVIVAL.DRINK_AMOUNT, 'quita más sed que un trago');
  assert.equal(k.inventory.getItemCount('BUCKET'), 1);
});

/** Combate con el mínimo de piezas (sin navegador). */
function combat(creatures) {
  globalThis.document ??= { getElementById: () => null };
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events });
  const keys = new Set();
  const input = { blocked: false, isDown: (a) => keys.has(a), wasPressed: () => false };
  const hotbar = new HotbarSystem({ input, inventory, events });
  const player = {
    position: new THREE.Vector3(), yaw: 0, state: {}, model: {},
    getEyePosition: (v) => v.set(0, 1.6, 0),
  };
  const drops = [];
  const cs = new CombatSystem({
    input, items: C.ITEMS, inventory, hotbar, equipment: { slots: {}, dur: {} }, player, controller: {},
    camera: new THREE.PerspectiveCamera(), cameraSystem: { setAim() {} }, held: { setPose() {} },
    scene: new THREE.Scene(), world: { getHeightAt: () => 0 }, events, creatures,
    drop: (...a) => drops.push(a),
  });
  return { cs, inventory, hotbar, keys, drops, events };
}

function dummySource(list) {
  const hits = [];
  const fires = [];
  return {
    hits, fires,
    getAnimalsNear: (x, z, r) => list.filter((a) => Math.hypot(a.x - x, a.z - z) <= r),
    hitAnimal: (a, dmg) => {
      hits.push([a.id, dmg]);
      return { killed: false, drops: null };
    },
    ignite: (a, dps, time) => fires.push([a.id, dps, time]),
  };
}

test('lanza: golpea de cerca; apuntando, el clic la lanza (y se recupera)', () => {
  const k = combat([]);
  k.inventory.addItem('SPEAR', 1);
  k.hotbar.select('SPEAR');
  assert.equal(k.cs.suppressAttack, false, 'sin apuntar, golpe cuerpo a cuerpo');
  k.keys.add('USE');
  k.cs.update(0.016);
  assert.equal(k.cs.suppressAttack, true, 'apuntando, el clic es lanzar');
  k.cs.pull = 1;
  k.cs._fire(C.ITEMS.SPEAR.RANGED, k.cs.ammo());
  assert.equal(k.inventory.getItemCount('SPEAR'), 0, 'se lanza la propia lanza');
  const p = k.cs._projectiles[0];
  assert.ok(p.recover && p.damage >= C.ITEMS.SPEAR.RANGED.DAMAGE);
  for (let i = 0; i < 200 && k.cs._projectiles.length; i++) k.cs._updateProjectiles(0.05);
  assert.equal(k.drops.length, 1, 'queda en el suelo');
  assert.equal(k.drops[0][3], 'SPEAR');
});

test('bomba de slime: estalla y daña a todo lo que hay cerca, menos de lejos', () => {
  const src = dummySource([{ id: 'a', x: 1, y: 0, z: 0 }, { id: 'b', x: 3, y: 0, z: 0 }, { id: 'c', x: 12, y: 0, z: 0 }]);
  const k = combat([src]);
  const seen = [];
  k.events.on(GameEvents.PROJECTILE_HIT, (e) => seen.push(e));
  k.cs._explode({ pos: new THREE.Vector3(0, 0, 0), damage: 26, explode: 3.8, hits: new Set() });
  const ids = src.hits.map(([id]) => id);
  assert.deepEqual(ids.sort(), ['a', 'b']);
  const dmg = Object.fromEntries(src.hits);
  assert.ok(dmg.a > dmg.b, 'más daño cerca del centro');
  assert.ok(seen[0].explosion);
});

test('ballesta, flecha de fuego y de cristal', () => {
  const src = dummySource([{ id: 'a', x: 0, y: 0, z: -3, aimY: 1.6 }, { id: 'b', x: 0, y: 0, z: -6, aimY: 1.6 }, { id: 'c', x: 0, y: 0, z: -9, aimY: 1.6 }, { id: 'd', x: 0, y: 0, z: -12, aimY: 1.6 }]);
  const k = combat([src]);
  // Cristal: atraviesa 2 y se queda en el tercero.
  const p = { pos: new THREE.Vector3(0, 1.6, -3), damage: 26, pierce: 2, hits: new Set(), from: { x: 0, z: 0 }, fire: null };
  assert.equal(k.cs._hitCreature(p), false, 'sigue volando');
  p.pos.z = -6;
  assert.equal(k.cs._hitCreature(p), false);
  p.pos.z = -9;
  assert.equal(k.cs._hitCreature(p), true, 'el tercero la para');
  assert.deepEqual(src.hits.map(([id]) => id), ['a', 'b', 'c']);
  // Fuego: prende al enemigo.
  const f = { pos: new THREE.Vector3(0, 1.6, -12), damage: 12, pierce: 0, hits: new Set(), from: { x: 0, z: 0 }, fire: C.ITEMS.FIRE_ARROW.AMMO.FIRE };
  assert.ok(k.cs._hitCreature(f));
  assert.deepEqual(src.fires, [['d', 4, 5]]);
  // Ballesta: la misma flecha hace 1,5 veces el daño que con el arco (a tope).
  k.inventory.addItem('CROSSBOW', 1);
  k.inventory.addItem('BOW', 1);
  k.inventory.addItem('ARROW', 2);
  k.hotbar.select('CROSSBOW');
  k.cs.pull = 1;
  k.cs._fire(C.ITEMS.CROSSBOW.RANGED, k.cs.ammo());
  k.hotbar.select('BOW');
  k.cs.pull = 1;
  k.cs._fire(C.ITEMS.BOW.RANGED, k.cs.ammo());
  const [xb, bow] = k.cs._projectiles.slice(-2);
  assert.ok(Math.abs(xb.damage / bow.damage - 1.5) < 1e-9);
  assert.ok(xb.vel.length() > bow.vel.length());
});

test('quemadura: daño por segundo hasta que se apaga; el botín cae al suelo', () => {
  const dropped = [];
  const enemy = { hittable: true, x: 5, y: 0, z: 5, health: 30 };
  const fake = {
    _pickups: { drop: (...a) => dropped.push(a) }, _homeId: 'HOME', _world: null,
    hitAnimal(e, dmg) {
      e.health -= dmg;
      if (e.health <= 0) {
        e.hittable = false;
        return { killed: true, drops: { STONE: 2 } };
      }
      return { killed: false, drops: null };
    },
  };
  EnemySystem.prototype.ignite.call(fake, enemy, 4, 5);
  assert.ok(enemy.burn);
  for (let i = 0; i < 20; i++) EnemySystem.prototype._burnTick.call(fake, enemy, 0.5);
  assert.equal(enemy.burn, null);
  assert.equal(enemy.health, 30 - 4 * 5, '5 s a 4 por segundo');
  // Si le mata el fuego, lo que suelta queda en el suelo.
  const weak = { hittable: true, x: 1, y: 0, z: 1, health: 3 };
  EnemySystem.prototype.ignite.call(fake, weak, 4, 5);
  EnemySystem.prototype._burnTick.call(fake, weak, 1);
  assert.equal(weak.burn, null);
  assert.deepEqual(dropped[0].slice(0, 5), ['HOME', 1, 1, 'STONE', 2]);
});
