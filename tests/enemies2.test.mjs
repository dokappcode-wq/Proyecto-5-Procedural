/**
 * P10 (v1.33): arañas y murciélagos en las cuevas, lobos de noche, cangrejos gigantes en las
 * playas y la fortaleza del Rey Goblin (sin titán de hielo).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { SeededRandom } from '../js/core/SeededRandom.js';
import { Enemy, EnemyState } from '../js/enemies/Enemy.js';
import { AchievementSystem } from '../js/progress/AchievementSystem.js';
import './helpers/three.mjs';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { EnemySystem } = await import('../js/enemies/EnemySystem.js');
const { createEnemyView } = await import('../js/enemies/EnemyViews.js');
const { buildGoblinFortress, FORT_HALF } = await import('../js/enemies/FortressModel.js');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');

const T = C.ENEMIES.TYPES;
const flatEnv = (player, hits = []) => ({
  cfg: C.ENEMIES, player, groundAt: () => 0, isWalkable: () => true, resolveCollisions: () => false, onAttack: (e) => hits.push(e),
});
const step = (e, env, s) => {
  for (let t = 0; t < s; t += 1 / 30) e.update(1 / 30, env);
};

/** El Edén diseñado, con sus enemigos (lo caro: una vez para todos los tests). */
const dir = new URL('../maps/eden/', import.meta.url);
const map = MapData.fromFiles(JSON.parse(fs.readFileSync(new URL('eden.map.json', dir))), zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
const events = new EventBus();
const worlds = new WorldManager({
  scene: new THREE.Scene(), system: EDEN, events,
  options: {
    config: C.WORLD, maps: { [EDEN.homeId]: map }, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
    landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: 11, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
    homeRules: { CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS },
  },
});
const homeId = worlds.activeId;
const dropped = [];
const time = { isNight: false };
const player = { position: new THREE.Vector3(), yaw: 0 };
let crown = false;
const enemies = new EnemySystem({
  config: C.ENEMIES, safeRadius: C.SITES.SAFE_RADIUS, scene: new THREE.Scene(), worlds, homeId, player, events, time,
  pickups: { drop: (...a) => dropped.push(a) }, fires: () => [],
  damageScale: (e) => (crown && e.type.startsWith('GOBLIN') ? 0.85 : 1),
});
worlds.home.generate('42');
const w = worlds.home;
const sp = w.getSpawnPoint();

test('tipos nuevos: valores con sentido (el lobo no te alcanza corriendo; el rey es duro)', () => {
  for (const id of ['SPIDER', 'BAT', 'WOLF', 'CRAB', 'GOBLIN_KING']) {
    const d = T[id];
    assert.ok(d.NAME && d.HEALTH > 0 && d.DAMAGE > 0 && d.SPEED > 0 && d.RANGE > 0 && d.WINDUP > 0 && d.RADIUS > 0 && d.HEIGHT > 0, id);
    for (const item of Object.keys(d.DROPS)) assert.ok(C.ITEMS[item], `${id} suelta ${item}`);
  }
  assert.ok(T.WOLF.SPEED > C.PLAYER.WALK_SPEED && T.WOLF.SPEED < C.PLAYER.RUN_SPEED);
  assert.ok(T.GOBLIN_KING.HEALTH >= 4 * T.GOBLIN_BOSS.HEALTH);
  assert.ok(T.BAT.FLY > 0 && T.BAT.SLEEPS);
  assert.ok(!('ICE_TITAN' in T), 'sin titán de hielo');
  assert.equal(C.RECIPES.COOKED_CRAB.STATION, 'CAMPFIRE');
  assert.ok(C.RECIPES.CRAB_SHIELD.INGREDIENTS.CRAB_SHELL);
  assert.equal(C.ITEMS.KING_CROWN.SLOT, 'HEAD');
});

test('murciélago: cuelga dormido, la colonia despierta junta, vuela y vuelve a colgarse', () => {
  const p = { x: 0, y: 0, z: 30, alive: true };
  const hits = [];
  const env = flatEnv(p, hits);
  const group = { members: [] };
  const bats = [0, 1, 2].map((i) => {
    const b = new Enemy({ id: `b${i}`, type: 'BAT', def: T.BAT, x: i, z: 0, home: { x: i, z: 0, radius: 3, sleep: true }, rng: new SeededRandom(i + 1), dormant: true, group });
    group.members.push(b);
    return b;
  });
  step(bats[0], env, 1);
  assert.equal(bats[0].state, EnemyState.DORMANT);
  assert.ok(!bats[0].hittable);
  p.z = 6;
  step(bats[0], env, 0.2);
  assert.ok(bats.every((b) => b.state === EnemyState.ASSEMBLING), 'despierta toda la colonia');
  for (const b of bats) step(b, env, 4);
  assert.ok(bats[0].hittable && hits.length > 0, 'muerde');
  assert.ok(bats[0].aimY > bats[0].y + T.BAT.FLY * 0.8, 'se apunta arriba: vuela');
  p.alive = false;
  for (const b of bats) step(b, env, 20);
  assert.ok(bats.every((b) => b.state === EnemyState.DORMANT), 'vuelven a colgarse');
});

test('en el Edén: arañas y murciélagos en cuevas, cangrejos en la playa; nada cerca del inicio', () => {
  const of = (t) => enemies.enemies.filter((e) => e.type === t);
  assert.ok(of('SPIDER').length >= C.ENEMIES.CAVE_SPIDERS && of('SPIDER').every((e) => e.cave), `${of('SPIDER').length} arañas`);
  assert.ok(of('BAT').length >= C.ENEMIES.CAVE_BATS * C.ENEMIES.BAT_COLONY[0] && of('BAT').every((e) => e.cave && e.state === EnemyState.DORMANT), `${of('BAT').length} murciélagos`);
  for (const e of [...of('SPIDER'), ...of('BAT')]) assert.ok(w.caveFloorAt(e.x, e.z, e.y + 0.6), `${e.id} dentro de la cueva`);
  const crabs = of('CRAB');
  assert.ok(crabs.length >= 10, `${crabs.length} cangrejos`);
  for (const c of crabs) assert.equal(w.getBiomeAt(c.home.x, c.home.z).id, 'BEACH');
  for (const e of enemies.enemies) assert.ok(Math.hypot(e.x - sp.x, e.z - sp.z) >= C.SITES.SAFE_RADIUS, `${e.id} cerca del inicio`);
});

test('fortaleza del Rey Goblin: en el mapa, con murallas, puerta abierta, rey, capitanes y guardias', () => {
  assert.equal(w.getSites('GOBLIN_FORTRESS').length, 1);
  const f = enemies.bases.find((b) => b.fortress);
  assert.ok(f, 'la fortaleza está');
  assert.ok(Math.hypot(f.x - sp.x, f.z - sp.z) > 800, 'lejos del inicio');
  const types = f.members.map((m) => m.type).sort();
  assert.deepEqual(types, ['GOBLIN', 'GOBLIN', 'GOBLIN', 'GOBLIN', 'GOBLIN_BOSS', 'GOBLIN_BOSS', 'GOBLIN_KING']);
  assert.ok(f.king.scale > 1.4);
  assert.ok(Math.hypot(f.king.x - f.throne.x, f.king.z - f.throne.z) < 0.1, 'el rey en su trono');
  // Las murallas paran al jugador; por la puerta se entra.
  enemies.enabled = true;
  const yaw = w.getSites('GOBLIN_FORTRESS')[0].yaw;
  const side = { x: f.x + Math.cos(yaw) * FORT_HALF, z: f.z - Math.sin(yaw) * FORT_HALF }; // muralla izquierda/derecha
  const pos = { ...side };
  assert.ok(enemies.resolveCollisions(pos, 0.35, f.throne.y, f.throne.y + 1.8), 'la muralla empuja');
  const gate = { x: f.x + Math.sin(yaw) * FORT_HALF, z: f.z + Math.cos(yaw) * FORT_HALF };
  const g2 = { ...gate };
  enemies.resolveCollisions(g2, 0.35, f.throne.y, f.throne.y + 1.8);
  assert.ok(Math.hypot(g2.x - gate.x, g2.z - gate.z) < 0.01, 'la puerta está abierta');
});

test('el Rey Goblin: se enfurece a media vida y llama a su guardia; al caer, corona y tesoro', () => {
  const f = enemies.bases.find((b) => b.fortress);
  const king = f.king;
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const ach = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events });
  // Pelea: el jugador delante del trono.
  player.position.set(king.x + Math.sin(king.heading) * 4, king.y, king.z + Math.cos(king.heading) * 4);
  worlds.follow?.(player.position);
  enemies.update(0.1);
  assert.ok(king.hostile, 'el rey te ve y va a por ti');
  assert.ok(f.members.filter((m) => m.alive).every((m) => m.state !== EnemyState.IDLE), 'y toda la fortaleza');
  const before = f.members.length;
  enemies.hitAnimal(king, king.maxHealth * 0.55, player.position.x, player.position.z);
  enemies.update(0.05);
  assert.ok(king.enraged && king.def.SPEED > T.GOBLIN_KING.SPEED, 'enfurecido');
  assert.equal(f.members.length, before + C.ENEMIES.FORTRESS.SUMMON, 'llama a más goblins');
  assert.ok(msgs.some((t) => /enfurece/.test(t)));
  // Daño: el mazazo del rey, y con la corona los goblins pegan menos.
  const dmg = [];
  events.on(GameEvents.PLAYER_DAMAGED, (d) => dmg.push(d.amount));
  enemies._attack(king);
  crown = true;
  enemies._attack(king);
  crown = false;
  assert.deepEqual(dmg, [T.GOBLIN_KING.DAMAGE, Math.round(T.GOBLIN_KING.DAMAGE * 0.85)]);
  // Todos abajo.
  let drops = null;
  for (const m of f.members) {
    if (!m.alive) continue;
    m.state = EnemyState.CHASE;
    const r = enemies.hitAnimal(m, 9999, player.position.x, player.position.z);
    if (m === king) drops = r.drops;
  }
  assert.equal(drops.KING_CROWN, 1);
  assert.ok(f.cleared);
  assert.ok(dropped.some((d) => d[3] === 'COIN' && Math.hypot(d[1] - f.throne.x, d[2] - f.throne.z) < 0.1), 'tesoro junto al trono');
  assert.ok(ach.unlocked.has('GOBLIN_KING') && !ach.unlocked.has('GOBLIN_BASE'));
  const snap = enemies.snapshot();
  assert.ok(snap.dead.includes(king.id));
  assert.ok(!snap.dead.some((id) => id.includes('summon')), 'los llamados no se guardan');
  assert.ok(snap.cleared.includes(f.id));
});

test('lobos: salen en manada de noche lejos del inicio, no se acercan al fuego y se van al amanecer', () => {
  const sys = new EnemySystem({
    config: C.ENEMIES, safeRadius: C.SITES.SAFE_RADIUS, scene: new THREE.Scene(), worlds, homeId, player, events, time,
    fires: () => fires,
  });
  let fires = [];
  sys.generate();
  // Un claro del bosque lejos del inicio.
  const rng = new SeededRandom(5);
  let spot = null;
  for (let i = 0; i < 4000 && !spot; i++) {
    const x = rng.range(-1500, 1500);
    const z = rng.range(-1500, 1500);
    if (Math.hypot(x - sp.x, z - sp.z) > 400 && w.getBiomeAt(x, z).id === 'FOREST' && sys._isWalkable(x, z, null) && !w.inCave?.(x, w.getHeightAt(x, z) + 1, z)) spot = { x, z };
  }
  assert.ok(spot);
  player.position.set(spot.x, w.getHeightAt(spot.x, spot.z), spot.z);
  time.isNight = true;
  for (let t = 0; t < 200 && !sys.enemies.some((e) => e.type === 'WOLF'); t += 0.5) sys.update(0.5);
  const wolves = sys.enemies.filter((e) => e.type === 'WOLF');
  assert.ok(wolves.length >= C.ENEMIES.WOLVES.SIZE[0], 'una manada');
  assert.ok(new Set(wolves.map((e) => e.group)).size === 1);
  assert.ok(wolves.every((e) => e.hostile), 'van a por ti');
  // Junto a una hoguera no entran en su círculo.
  fires = [{ x: player.position.x, z: player.position.z }];
  for (let i = 0; i < 60; i++) sys.update(0.1);
  for (const e of wolves) assert.ok(Math.hypot(e.x - player.position.x, e.z - player.position.z) >= C.BUILD.CAMPFIRE_SLIME_RADIUS - 0.01 || !e.alive);
  // Amanece: se marchan y desaparecen lejos.
  fires = [];
  time.isNight = false;
  for (let i = 0; i < 400 && sys.enemies.some((e) => e.type === 'WOLF'); i++) sys.update(0.1);
  assert.equal(sys.enemies.filter((e) => e.type === 'WOLF').length, 0, 'se han ido');
});

test('modelos: cada enemigo nuevo se dibuja y anima en todos sus estados', () => {
  for (const type of ['SPIDER', 'BAT', 'WOLF', 'CRAB', 'GOBLIN_KING']) {
    const e = new Enemy({ id: type, type, def: T[type], x: 0, z: 0, home: { x: 0, z: 0 }, rng: new SeededRandom(3), dormant: type === 'BAT' });
    const v = createEnemyView(e);
    let meshes = 0;
    v.root.traverse((o) => o.isMesh && meshes++);
    assert.ok(meshes >= 8, `${type}: ${meshes} piezas`);
    for (const st of [() => {}, () => { e.assemble = 1; e.speed = 3; e.gait = 2; }, () => { e.windup = 0.6; }, () => { e.windup = 0; e.strike = 0.2; e.hitFlash = 0.2; }, () => { e.state = 'DEAD'; e.deathProgress = 0.8; }]) {
      st();
      v.update(e, 1.3, 1 / 60);
    }
    const box = new THREE.Box3().setFromObject(v.root);
    assert.ok(box.max.y > 0.2 && box.max.y < 6, `${type} de tamaño razonable`);
  }
  const fort = buildGoblinFortress({ id: 'f', x: 0, z: 0, yaw: 0.7, height: 10 }, () => 10);
  assert.ok(fort.colliders.length > 60 && fort.fires.length === 3);
  assert.ok(!fort.colliders.some((c) => Math.hypot(c.x - fort.gate.x, c.z - fort.gate.z) < 2.5), 'nada tapa la puerta');
});
