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

test('gólem gigante: valores de la hoja de diseño', () => {
  assert.equal(BOSS.HEALTH, 300);
  assert.equal(BOSS.PHASE2_AT, 150);
  assert.equal(BOSS.SLAM.WAVE_DAMAGE, 20);
  assert.ok(BOSS.ROCK.DAMAGE > 0 && BOSS.LASER.DAMAGE > 0);
  for (const k of ['WINDUP']) assert.ok(BOSS.SLAM[k][1] < BOSS.SLAM[k][0], 'fase 2 más rápida');
  assert.ok(BOSS.COOLDOWN[1] < BOSS.COOLDOWN[0]);
});

const rise = (b) => {
  b.start();
  return run(b, player(), BOSS.RISE_TIME + 0.1);
};

test('gólem gigante: despierta, golpea el suelo y la onda se salta o se esquiva', () => {
  const b = new BossLogic({ x: 0, y: 0, z: 0 });
  assert.equal(b.hitCrystal(10).ok, false, 'dormido no se le daña');
  assert.ok(rise(b).some((e) => e.type === 'risen'));
  assert.ok(b.fighting);
  // Cerca: casi siempre golpea el suelo. En el suelo, la onda (o el puño) le alcanza.
  const ev = run(b, player({ z: 9 }), 20);
  assert.ok(ev.some((e) => e.type === 'slam'));
  assert.ok(ev.some((e) => e.type === 'waveHit' || e.type === 'slamHit'));
  // Saltando o esquivando, no.
  const b2 = new BossLogic({ x: 0, y: 0, z: 0 });
  rise(b2);
  const air = run(b2, player({ z: 9, onGround: false, dodging: true }), 20);
  assert.ok(air.some((e) => e.type === 'slam'));
  assert.equal(air.filter((e) => e.type === 'waveHit' || e.type === 'slamHit').length, 0);
});

test('gólem gigante: lanza rocas adonde va el jugador; un muro le cubre', () => {
  const far = player({ z: 16 }); // con un muro de 2 m a 1 m delante (z = 15)
  const hits = (env) => {
    const b = new BossLogic({ x: 0, y: 0, z: 0, env, seed: 3 });
    rise(b);
    const ev = run(b, far, 60);
    return { thrown: ev.filter((e) => e.type === 'rockThrow').length, hit: ev.filter((e) => e.type === 'rockHit').length, impacts: ev.filter((e) => e.type === 'rockImpact') };
  };
  const open = hits({});
  assert.ok(open.thrown >= 2, 'lanza rocas desde lejos');
  assert.ok(open.hit >= 1, 'quieto, le dan');
  assert.ok(open.impacts.every((e) => Math.hypot(e.x - far.x, e.z - far.z) < 3), 'caen donde está');
  // Con un muro entre los dos (cualquier segmento que cruce z = 15), no le dan.
  const wall = {
    blocked: (ax, ay, az, bx, by, bz) => (az - 15) * (bz - 15) < 0 && Math.min(ay, by) < 2,
    ray: (ox, oy, oz, dx, dy, dz, max) => {
      if (Math.abs(dz) < 1e-6) return null;
      const t = (15 - oz) / dz;
      return t > 0 && t < max && oy + dy * t < 2 ? t : null;
    },
  };
  assert.equal(hits(wall).hit, 0);
});

test('gólem gigante: el láser persigue al jugador; corriendo se escapa; luego el cristal queda al rojo', () => {
  const laser = (speed) => {
    const b = new BossLogic({ x: 0, y: 0, z: 0, seed: 5 });
    rise(b);
    // Forzar el láser.
    b.cooldown = 99;
    b._begin('LASER', []);
    const ev = [];
    let ang = 0;
    for (let t = 0; t < 5; t += 1 / 30) {
      ang += (speed / 14) / 30;
      const p = player({ x: Math.sin(ang) * 14, z: Math.cos(ang) * 14 });
      ev.push(...b.update(1 / 30, p));
    }
    return { b, hits: ev.filter((e) => e.type === 'laserHit').length, vent: ev.some((e) => e.type === 'vent') };
  };
  const still = laser(0);
  assert.ok(still.hits >= 3, `quieto le da (${still.hits})`);
  assert.ok(still.vent, 'después, al rojo');
  const run7 = laser(7.5);
  assert.ok(run7.hits < still.hits, `corriendo, menos (${run7.hits} < ${still.hits})`);
  // Al rojo hace más daño.
  const b = still.b;
  assert.equal(b.action, 'VENT');
  const h = b.health;
  b.hitCrystal(5);
  assert.equal(h - b.health, 5 * BOSS.CRYSTAL_MULT * BOSS.VENT_MULT);
});

test('gólem gigante: solo el cristal; fase 2 a la mitad (ruge y es más rápido); se rompe y cae', () => {
  const b = new BossLogic({ x: 0, y: 0, z: 0 });
  rise(b);
  const all = [];
  for (let i = 0; i < 400 && b.alive; i++) {
    const r = b.hitCrystal(5);
    all.push(...r.events);
    if (b.health <= BOSS.PHASE2_AT && b.phase === 2 && !all.some((e) => e.type === 'checked')) {
      all.push({ type: 'checked' });
      assert.equal(b.action, 'ROAR');
    }
  }
  assert.ok(all.some((e) => e.type === 'phase2'));
  assert.ok(all.filter((e) => e.type === 'crack').length >= 3, 'el cristal se agrieta');
  assert.ok(all.some((e) => e.type === 'dead'));
  assert.equal(b.alive, false);
  run(b, player(), BOSS.DEATH_TIME + 0.1);
  assert.equal(b.death, 1);
  b.reset();
  assert.equal(b.health, 300);
  assert.equal(b.state, 'DORMANT');
  assert.equal(b.phase, 1);
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
