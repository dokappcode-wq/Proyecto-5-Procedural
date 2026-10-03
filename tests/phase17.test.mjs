/**
 * v1.17: enemigos (gólems, slimes, goblins, jefe goblin), bases de goblins, equipos de
 * exploración y lugares especiales lejos del inicio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { SeededRandom } from '../js/core/SeededRandom.js';
import { Enemy, EnemyState } from '../js/enemies/Enemy.js';
import { planSites } from '../js/world/WorldSites.js';
import { EDEN } from './helpers/eden.mjs';

const T = C.ENEMIES.TYPES;

const flatEnv = (player, hits = []) => ({
  cfg: C.ENEMIES,
  player,
  groundAt: () => 0,
  isWalkable: () => true,
  resolveCollisions: () => false,
  onAttack: (e) => hits.push(e.def.DAMAGE),
});

const step = (e, env, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 30) e.update(1 / 30, env);
};

test('valores de la lista: vida y daño de cada enemigo', () => {
  assert.deepEqual([T.GOLEM.HEALTH, T.GOLEM.DAMAGE], [30, 25]);
  assert.deepEqual([T.SLIME.HEALTH, T.SLIME.DAMAGE], [10, 10]);
  assert.deepEqual([T.GOBLIN.HEALTH, T.GOBLIN.DAMAGE], [20, 20]);
  assert.deepEqual([T.GOBLIN_BOSS.HEALTH, T.GOBLIN_BOSS.DAMAGE], [40, 30]);
  assert.equal(T.GOBLIN.SPEED, C.PLAYER.WALK_SPEED, 'los goblins corren a la velocidad del jugador andando');
  assert.ok(T.GOLEM.SPEED < C.PLAYER.WALK_SPEED / 2 && T.GOLEM.WINDUP >= 1, 'el gólem es lento andando y atacando');
  assert.ok(T.GOBLIN.WINDUP > 1, 'al goblin le cuesta atacar');
  assert.ok(C.ITEMS.SLIME && C.ITEMS.COIN);
});

test('el gólem duerme como un montón de piedras, se monta al acercarse y luego ataca', () => {
  const player = { x: 0, y: 0, z: 20, alive: true };
  const hits = [];
  const env = flatEnv(player, hits);
  const g = new Enemy({ id: 'g', type: 'GOLEM', def: T.GOLEM, x: 0, z: 0, home: { x: 0, z: 0, radius: 3, sleep: true }, rng: new SeededRandom(1), dormant: true });
  step(g, env, 2);
  assert.equal(g.state, EnemyState.DORMANT);
  assert.equal(g.hittable, false, 'dormido no se le golpea');
  player.z = 5;
  step(g, env, 0.5);
  assert.equal(g.state, EnemyState.ASSEMBLING);
  assert.ok(g.assemble > 0 && g.assemble < 1);
  step(g, env, T.GOLEM.ASSEMBLE_TIME);
  assert.equal(g.assemble, 1);
  assert.ok(g.hittable);
  step(g, env, 8);
  assert.ok(hits.length >= 1, 'golpea');
  assert.ok(hits.every((h) => h === 25));
});

test('el amago del golpe se puede esquivar alejándose a tiempo', () => {
  const player = { x: 0, y: 0, z: 1.5, alive: true };
  const hits = [];
  const env = flatEnv(player, hits);
  const gob = new Enemy({ id: 'b', type: 'GOBLIN', def: T.GOBLIN, x: 0, z: 0, home: { x: 0, z: 0, radius: 6 }, rng: new SeededRandom(2) });
  gob.alert();
  step(gob, env, 0.2);
  assert.equal(gob.state, EnemyState.WINDUP);
  player.z = 6; // un paso atrás largo
  step(gob, env, T.GOBLIN.WINDUP);
  assert.equal(hits.length, 0, 'fuera de alcance al bajar el mazo');
});

test('morir: drops de la lista (moneda goblin 1/3, mineral del gólem, jefe con hierro refinado)', () => {
  let coins = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    const g = new Enemy({ id: `g${i}`, type: 'GOBLIN', def: T.GOBLIN, x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(100 + i) });
    const d = g.rollDrops();
    assert.equal(d.LEATHER, 1);
    assert.ok(d.WOOD >= 1 && d.WOOD <= 2);
    if (d.COIN) coins++;
  }
  assert.ok(Math.abs(coins / N - 1 / 3) < 0.07, `monedas ${coins}/${N}`);
  const boss = new Enemy({ id: 'boss', type: 'GOBLIN_BOSS', def: T.GOBLIN_BOSS, x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(3) }).rollDrops();
  assert.deepEqual([boss.LEATHER, boss.COIN, boss.REFINED_IRON], [1, 1, 1]);
  assert.ok(boss.WOOD >= 1);
  let ore = 0;
  for (let i = 0; i < 200; i++) {
    const d = new Enemy({ id: `o${i}`, type: 'GOLEM', def: T.GOLEM, x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(500 + i) }).rollDrops();
    assert.ok(d.STONE >= 3);
    if (d.COPPER_ORE || d.IRON_ORE || d.COAL) ore++;
  }
  assert.ok(ore > 100 && ore < 200, 'casi siempre algún mineral sin refinar');
  const slime = new Enemy({ id: 's', type: 'SLIME', def: T.SLIME, x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(4) }).rollDrops();
  assert.ok(slime.SLIME >= 1);
});

test('un golpe enfada a todo su grupo', () => {
  const group = { members: [] };
  const mk = (id) => {
    const e = new Enemy({ id, type: 'GOBLIN', def: T.GOBLIN, x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(id.length), group });
    group.members.push(e);
    return e;
  };
  const [a, b, c] = [mk('a'), mk('bb'), mk('ccc')];
  a.takeHit(5, 10, 0);
  assert.ok([a, b, c].every((e) => e.state === EnemyState.CHASE));
  assert.equal(a.health, 15);
  const r = a.takeHit(100, 10, 0);
  assert.equal(r.killed, true);
  assert.equal(a.alive, false);
});

test('WorldSites: deterministas, lejos del inicio y separados', () => {
  const terrain = { sample: (x, z) => ({ height: 10 + Math.sin(x * 0.01) * 2, biomes: { PLAINS: 1 }, coast: 0, river: 0 }), heightAt: (x) => 10 + Math.sin(x * 0.01) * 2 };
  const args = { seed: 7, terrain, bounds: { minX: -2000, maxX: 2000, minZ: -2000, maxZ: 2000 }, spawn: { x: 0, z: 0 }, safeRadius: 256, requests: C.SITES.LIST };
  const a = planSites(args);
  const b = planSites(args);
  assert.deepEqual(a.sites, b.sites);
  const all = Object.values(a.sites).flat();
  assert.ok(a.sites.GOBLIN_BASE.length >= 5 && a.sites.GOLEMS.length >= 10);
  for (const s of all) assert.ok(Math.hypot(s.x, s.z) >= 256 + s.radius, `${s.id} demasiado cerca`);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z) > 20);
  const padded = C.SITES.LIST.filter((r) => r.pad).map((r) => r.kind ?? r.id);
  assert.equal(a.pads.length, padded.reduce((n, k, i) => n + (padded.indexOf(k) === i ? a.sites[k].length : 0), 0), 'las bases y los lugares de la historia tienen su explanada');
  for (const k of ['HERMIT_TOWER', 'NODE_ARENA', 'RESEARCH_CENTER']) assert.equal(a.sites[k].length, 1, k);
});

test('en el Edén: gólems, bases con 3–5 goblins y equipos con un jefe, nada cerca del inicio', async () => {
  const THREE = await import('three');
  const { WorldManager } = await import('../js/world/WorldManager.js');
  const { EnemySystem } = await import('../js/enemies/EnemySystem.js');
  const { EventBus } = await import('../js/core/EventBus.js');
  const events = new EventBus();
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events,
    options: {
      config: C.WORLD, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: C.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: C.SHIP.MOUNTAIN_LANDING_DISTANCE, CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS },
    },
  });
  const homeId = worlds.activeId;
  const dropped = [];
  const enemies = new EnemySystem({
    config: C.ENEMIES, safeRadius: C.SITES.SAFE_RADIUS, scene: new THREE.Scene(), worlds, homeId,
    player: { position: { x: 0, y: 0, z: 0 }, yaw: 0 }, events, time: { isNight: false },
    pickups: { drop: (...a) => dropped.push(a) },
  });
  worlds.home.generate('42');
  const sp = worlds.home.getSpawnPoint();
  const golems = enemies.enemies.filter((e) => e.type === 'GOLEM');
  assert.ok(golems.length >= 20 && golems.every((g) => g.state === 'DORMANT'));
  assert.ok(golems.some((g) => g.cave), 'también en las cuevas');
  assert.equal(enemies.bases.length, 7);
  for (const b of enemies.bases) assert.ok(b.members.length >= 3 && b.members.length <= 5);
  assert.equal(enemies.teams.length, C.ENEMIES.GOBLIN_TEAMS);
  for (const t of enemies.teams) assert.equal(t.members.filter((m) => m.type === 'GOBLIN_BOSS').length, 1);
  for (const e of enemies.enemies) assert.ok(Math.hypot(e.x - sp.x, e.z - sp.z) >= C.SITES.SAFE_RADIUS, `${e.id} cerca del inicio`);
  // Limpiar una base: botín en el suelo, guardado como limpia.
  const base = enemies.bases[0];
  enemies.enabled = true;
  for (const m of base.members) {
    m.state = 'CHASE';
    const r = enemies.hitAnimal(m, 999, m.x + 1, m.z);
    assert.equal(r.killed, true);
    assert.ok(r.drops.LEATHER >= 1);
  }
  assert.equal(base.cleared, true);
  assert.ok(dropped.some((d) => d[3] === 'COIN'));
  const snap = enemies.snapshot();
  assert.ok(snap.cleared.includes(base.id));
  assert.equal(snap.dead.length, base.members.length);
  // Al cargar: los muertos no vuelven.
  worlds.home.generate('42');
  enemies.restore(snap);
  assert.ok(enemies.bases.find((b) => b.id === base.id).cleared);
  assert.ok(enemies.enemies.filter((e) => snap.dead.includes(e.id)).every((e) => e.removed));
});
