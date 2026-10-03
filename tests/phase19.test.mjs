/**
 * v1.19: historia (segunda parte) — mazmorra bajo el centro de investigación, gólem
 * gigante, receta de la mesa de elaboración y reparación de la nave.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { labLayout } from '../js/story/LabLayout.js';
import { EDEN } from './helpers/eden.mjs';

const { BossLogic, BOSS } = await import('../js/story/BossGolem.js');
const { CraftingSystem } = await import('../js/crafting/CraftingSystem.js');
const { InventorySystem } = await import('../js/inventory/InventorySystem.js');
const { EventBus } = await import('../js/core/EventBus.js');

const player = (o = {}) => ({ x: 0, y: 0, z: 10, alive: true, onGround: true, dodging: false, ...o });
const run = (b, p, s) => {
  const ev = [];
  for (let t = 0; t < s; t += 1 / 30) ev.push(...b.update(1 / 30, p));
  return ev;
};

test('gólem gigante: valores de la lista', () => {
  assert.equal(BOSS.HEALTH, 300);
  assert.equal(BOSS.SLAP_DAMAGE, 50);
  assert.equal(BOSS.SLAM_DAMAGE, 20);
  assert.deepEqual(BOSS.COVER_AT, [150, 100, 50]);
  assert.equal(BOSS.COVER_TIME, 10);
  assert.equal(BOSS.ADDS_AT.length * BOSS.ADDS_EACH, 4, '4 gólems en total');
  assert.equal(BOSS.STONES_PER_SLAM, 5);
});

test('gólem gigante: se levanta, golpea el suelo y la onda se salta o se esquiva', () => {
  const b = new BossLogic({ x: 0, y: 0, z: 0 });
  assert.equal(b.eyeOpen, false, 'dormido no se le daña');
  b.start();
  const risen = run(b, player(), BOSS.RISE_TIME + 0.1);
  assert.ok(risen.some((e) => e.type === 'risen'));
  assert.ok(b.fighting && b.eyeOpen);
  // En el suelo, la onda le alcanza.
  const ev = run(b, player({ z: 8 }), BOSS.SLAM_EVERY + 3);
  assert.ok(ev.some((e) => e.type === 'slam'));
  assert.equal(ev.filter((e) => e.type === 'waveHit').length >= 1, true);
  // Saltando (en el aire) o esquivando, no.
  const b2 = new BossLogic({ x: 0, y: 0, z: 0 });
  b2.start();
  run(b2, player(), BOSS.RISE_TIME + 0.1);
  const air = run(b2, player({ z: 8, onGround: false }), BOSS.SLAM_EVERY + 3);
  assert.ok(air.some((e) => e.type === 'slam'));
  assert.equal(air.filter((e) => e.type === 'waveHit').length, 0);
});

test('gólem gigante: solo el ojo, se tapa a 150/100/50 y ataca con la mano; refuerzos y muerte', () => {
  const b = new BossLogic({ x: 0, y: 0, z: 0 });
  b.start();
  run(b, player(), BOSS.RISE_TIME + 0.1);
  const all = [];
  let covers = 0;
  let blocked = 0;
  for (let i = 0; i < 400 && b.alive; i++) {
    const r = b.hitEye(10);
    if (!r.ok) blocked++;
    all.push(...r.events);
    if (r.events.some((e) => e.type === 'cover')) {
      covers++;
      assert.ok(!b.eyeOpen, 'tapado');
      // Mientras está tapado: manotazos (50) a quien está delante y cerca.
      const ev = run(b, player({ z: 6 }), BOSS.COVER_TIME + 0.2);
      assert.ok(ev.some((e) => e.type === 'slap' && e.hit));
      assert.ok(ev.some((e) => e.type === 'uncover'));
    }
  }
  assert.equal(covers, 3);
  assert.equal(all.filter((e) => e.type === 'adds').length, 2);
  assert.ok(all.some((e) => e.type === 'dead'));
  assert.equal(b.alive, false);
  assert.ok(blocked === 0, 'nunca se dispara con el ojo tapado en esta prueba (se espera a destaparlo)');
  b.reset();
  assert.equal(b.health, 300);
  assert.equal(b.state, 'DORMANT');
});

test('receta de la mesa de elaboración: bloqueada hasta que la da Nova', () => {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const crafting = new CraftingSystem({ recipes: C.RECIPES, items: C.ITEMS, inventory, events });
  inventory.addItem('REFINED_IRON', 5);
  inventory.addItem('REFINED_COPPER', 5);
  assert.equal(crafting.isUnlocked('PIECE_WORKBENCH'), false);
  assert.ok(!crafting.getRecipes().some((r) => r.id === 'PIECE_WORKBENCH'));
  assert.equal(crafting.craft('PIECE_WORKBENCH'), false);
  crafting.unlock('WORKBENCH');
  assert.ok(crafting.getRecipes().some((r) => r.id === 'PIECE_WORKBENCH'));
  assert.equal(crafting.craft('PIECE_WORKBENCH'), true);
  assert.ok(C.ITEMS.THRUSTER);
});

test('mazmorra: baja desde la trampilla del búnker, sin escalones, con dos cámaras y la gran sala al fondo', async () => {
  const THREE = await import('three');
  const { WorldManager } = await import('../js/world/WorldManager.js');
  const DUNGEON = (sites) => {
    const s = sites.RESEARCH_CENTER?.[0];
    const L = labLayout(s);
    return { x: L.hatch.x, z: L.hatch.z, yaw: L.heading };
  };
  for (const seed of ['42', '7']) {
    const worlds = new WorldManager({
      scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
      options: {
        config: C.WORLD, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
        landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: C.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
        homeRules: { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: C.SHIP.MOUNTAIN_LANDING_DISTANCE, CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS, DUNGEON },
      },
    });
    const w = worlds.home;
    w.generate(seed);
    const d = w.caves.dungeon;
    assert.ok(d, `mazmorra en la semilla ${seed}`);
    const site = w.getSites('RESEARCH_CENTER')[0];
    const hatch = labLayout(site).hatch;
    assert.ok(Math.hypot(d.nodes[0].x - hatch.x, d.nodes[0].z - hatch.z) < 0.01, 'empieza en la trampilla');
    assert.equal(d.chambers.length, 2);
    assert.ok(d.arenaStart > d.chambers[1]);
    const arena = d.nodes.slice(d.arenaStart);
    assert.ok(arena.length >= 4 && arena.every((n) => n.r >= 12), 'sala grande');
    assert.ok(d.nodes[0].floor - arena[0].floor > 30, 'honda');
    for (let i = 1; i < d.nodes.length; i++) assert.ok(Math.abs(d.nodes[i].floor - d.nodes[i - 1].floor) <= C.CAVES.STEP * 0.62 + 1e-6);
    for (let i = 0; i < d.nodes.length - 1; i++) {
      const a = d.nodes[i];
      const b = d.nodes[i + 1];
      for (let t = 0; t < 1; t += 0.25) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        assert.ok(w.caveFloorAt(x, z, a.floor + (b.floor - a.floor) * t + 0.3), `suelo en ${i}`);
      }
    }
    // Las cuevas normales no la cruzan.
    for (const c of w.caves.caves) {
      if (c === d) continue;
      for (const n of c.nodes) for (const m of d.nodes) assert.ok(Math.hypot(n.x - m.x, n.floor - m.floor, n.z - m.z) > n.r + m.r);
    }
  }
});
