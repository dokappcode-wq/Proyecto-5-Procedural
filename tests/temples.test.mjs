/**
 * P12 (v1.35): templos de retos — la piedra, el portal, el recinto y las cinco pruebas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { AchievementSystem } from '../js/progress/AchievementSystem.js';
import { createChallenge, CHALLENGE_TYPES } from '../js/temples/Challenges.js';
import './helpers/three.mjs';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { TempleSystem } = await import('../js/temples/TempleSystem.js');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');

const T = C.TEMPLES;
const ctx = (over = {}) => ({ px: 0, pz: 0, alive: true, spawn: () => null, message() {}, ...over });

test('carrera: puntos en orden con tiempo límite', () => {
  const c = createChallenge('RACE', { cx: 0, cz: 0, cfg: T });
  assert.equal(c.points.length, T.RACE.POINTS + 1, 'y el último en el altar');
  for (const p of c.points.slice(0, -1)) assert.equal(c.update(0.5, ctx({ px: p.x, pz: p.z })), null);
  const last = c.points.at(-1);
  assert.equal(c.update(0.5, ctx({ px: last.x, pz: last.z })), 'won');
  const slow = createChallenge('RACE', { cx: 0, cz: 0, cfg: T });
  assert.equal(slow.update(T.RACE.TIME + 1, ctx({ px: 100, pz: 100 })), 'lost', 'se acaba el tiempo');
  const skip = createChallenge('RACE', { cx: 0, cz: 0, cfg: T });
  skip.update(0.1, ctx({ px: skip.points[3].x, pz: skip.points[3].z }));
  assert.equal(skip.next, 0, 'saltarse puntos no cuenta');
});

test('pelea: se gana cuando caen todos; si mueres, se pierde', () => {
  const spawned = [];
  const c = createChallenge('FIGHT', { cx: 0, cz: 0, cfg: T });
  c.start(ctx({ spawn: (type, x, z) => { const e = { type, x, z, alive: true }; spawned.push(e); return e; } }));
  assert.deepEqual(spawned.map((e) => e.type), T.FIGHT.ENEMIES);
  assert.equal(c.update(1, ctx()), null);
  spawned.forEach((e) => (e.alive = false));
  assert.equal(c.update(1, ctx()), 'won');
  const d = createChallenge('FIGHT', { cx: 0, cz: 0, cfg: T });
  d.start(ctx({ spawn: () => ({ alive: true }) }));
  assert.equal(d.update(1, ctx({ alive: false })), 'lost');
});

test('puzzle: runas 1, 2, 3; equivocarse reinicia; quedarse encima no cuenta dos veces', () => {
  const c = createChallenge('PUZZLE', { cx: 0, cz: 0, cfg: T });
  const on = (i) => ctx({ px: c.plates[i].x, pz: c.plates[i].z });
  const off = ctx({ px: 0, pz: 0 });
  assert.equal(c.update(0.1, on(0)), null);
  assert.equal(c.update(0.1, on(0)), null);
  assert.equal(c.step, 1);
  assert.ok(c.lit(0) && !c.lit(1));
  c.update(0.1, off);
  const msgs = [];
  c.update(0.1, { ...on(2), message: (t) => msgs.push(t) });
  assert.equal(c.step, 0, 'la 3 antes que la 2: vuelta a empezar');
  assert.equal(msgs.length, 1);
  for (const i of [0, 1]) {
    c.update(0.1, off);
    assert.equal(c.update(0.1, on(i)), null);
  }
  c.update(0.1, off);
  assert.equal(c.update(0.1, on(2)), 'won');
});

test('prueba del valle (TRIAL): primero las runas en orden, luego los guardianes', () => {
  const c = createChallenge('TRIAL', { cx: 0, cz: 0, cfg: T });
  assert.equal(c.type, 'TRIAL');
  const spawned = [];
  const ctx = { alive: true, px: 50, pz: 50, spawn: (type, x, z) => { const e = { type, x, z, alive: true }; spawned.push(e); return e; }, message() {} };
  const step = (p) => c.update(0.1, { ...ctx, px: p.x, pz: p.z });
  assert.equal(step({ x: 50, z: 50 }), null);
  assert.equal(c.lit(0), false);
  // Runa 2 primero: no cuenta.
  step(c.plates[1]);
  assert.equal(c.puzzle.step, 0);
  step({ x: 50, z: 50 });
  for (const i of [0, 1, 2]) {
    step(c.plates[i]);
    step({ x: 50, z: 50 });
  }
  assert.equal(c.phase, 'guardians');
  assert.ok([0, 1, 2].every((i) => c.lit(i)));
  assert.equal(spawned.length, T.TRIAL.ENEMIES.length);
  assert.match(c.status(), /Guardianes/);
  assert.equal(step({ x: 0, z: 0 }), null, 'quedan guardianes');
  spawned.forEach((e) => (e.alive = false));
  assert.equal(step({ x: 0, z: 0 }), 'won');
  // Morir lo pierde.
  const d = createChallenge('TRIAL', { cx: 0, cz: 0, cfg: T });
  assert.equal(d.update(0.1, { ...ctx, alive: false }), 'lost');
  assert.ok(CHALLENGE_TYPES.TRIAL.NAME);
});

test('supervivencia: oleadas cada pocos segundos; se gana aguantando', () => {
  const spawned = [];
  const c = createChallenge('SURVIVE', { cx: 0, cz: 0, cfg: T });
  const cx = ctx({ spawn: (type) => { const e = { type, alive: true }; spawned.push(e); return e; } });
  c.start(cx);
  assert.equal(spawned.length, T.SURVIVE.PER_WAVE);
  let res = null;
  for (let t = 0; t < T.SURVIVE.TIME + 1 && !res; t += 0.5) res = c.update(0.5, cx);
  assert.equal(res, 'won');
  assert.ok(spawned.length >= T.SURVIVE.PER_WAVE * Math.floor(T.SURVIVE.TIME / T.SURVIVE.EVERY));
  assert.ok(spawned.every((e) => e.type === T.SURVIVE.ENEMY));
  const d = createChallenge('SURVIVE', { cx: 0, cz: 0, cfg: T });
  d.start(cx);
  assert.equal(d.update(1, ctx({ alive: false })), 'lost');
});

test('exploración: reliquias que se cogen una vez', () => {
  const c = createChallenge('EXPLORE', { cx: 0, cz: 0, cfg: T });
  assert.equal(c.relics.length, T.EXPLORE.RELICS);
  for (const r of c.relics.slice(0, -1)) assert.ok(c.collect(r.id));
  assert.equal(c.collect(c.relics[0].id), false, 'ya cogida');
  assert.equal(c.collect('nope'), false);
  assert.equal(c.update(1, ctx()), null);
  c.collect(c.relics.at(-1).id);
  assert.equal(c.update(1, ctx()), 'won');
  assert.throws(() => createChallenge('SIGILO', { cx: 0, cz: 0, cfg: T }));
  for (const t of T.TYPES_BY_SITE) assert.ok(CHALLENGE_TYPES[t].NAME && CHALLENGE_TYPES[t].HINT);
});

function kit() {
  const events = new EventBus();
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const inventory = new InventorySystem({ items: C.ITEMS, events, config: C.INVENTORY });
  const player = { position: new THREE.Vector3(0, 10, 0) };
  const teleports = [];
  const spawned = [];
  const removed = [];
  let dead = false;
  const world = {
    getSites: (kind) => (kind === 'CHALLENGE_TEMPLE'
      ? [{ id: 'S0', x: 0, z: 0, yaw: 0 }, { id: 'S1', x: 500, z: 0, yaw: 0 }]
      : kind === 'CHALLENGE_ARENA' ? [{ id: 'A0', x: 30, z: 0 }, { id: 'A1', x: 530, z: 0 }] : []),
    getHeightAt: () => 10,
  };
  const temples = new TempleSystem({
    config: T, items: C.ITEMS, inventory, events, scene: new THREE.Scene(), player,
    enemies: { spawnAt: (type, x, z) => { const e = { type, x, z, alive: true }; spawned.push(e); return e; }, remove: (e) => removed.push(e) },
    teleport: (x, y, z) => { teleports.push({ x, y, z }); player.position.set(x, y, z); },
    isDead: () => dead, random: () => 0,
  });
  temples.setup(world);
  return { events, msgs, inventory, player, teleports, spawned, removed, temples, kill: () => (dead = true) };
}

test('templo: abrir la piedra, cruzar el portal, superar la carrera y volver fuera con la recompensa', () => {
  const k = kit();
  const ach = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events: k.events });
  const t = k.temples.get('RACE');
  assert.ok(t && t.type === T.TYPES_BY_SITE[0]);
  const stone = k.temples.getInteractablesNear(0, 10, 0, 3).find((i) => i.id.endsWith(':stone'));
  assert.equal(stone.action, 'Abrir');
  // Lejos del portal no se entra; cerca, sí.
  k.player.position.set(0, 10, 10);
  assert.ok(k.temples.interact(stone.id));
  k.temples.update(0.5);
  assert.equal(k.temples.current, null);
  k.player.position.set(0.5, 10, 0.5);
  k.temples.update(0.1);
  assert.equal(k.temples.current, t, 'dentro del templo');
  assert.ok(Math.hypot(k.player.position.x - t.arena.x, k.player.position.z - t.arena.z) < T.ARENA_RADIUS, 'teletransportado al recinto');
  assert.match(k.temples.status, /Carrera/);
  for (const p of t.challenge.points) {
    k.player.position.set(p.x, 10, p.z);
    k.temples.update(0.2);
  }
  assert.equal(t.done, true);
  assert.ok(k.inventory.getItemCount('COIN') >= T.REWARD.COIN[0]);
  assert.ok(ach.unlocked.has('TEMPLE'));
  k.temples.update(T.LEAVE_DELAY + 0.1);
  assert.equal(k.temples.current, null, 'el portal te devuelve fuera');
  assert.ok(Math.hypot(k.player.position.x - t.x, k.player.position.z - t.z) < 6);
  assert.equal(k.temples.getInteractablesNear(0, 10, 0, 3).find((i) => i.id.endsWith(':stone')).action, 'Superado');
  // Guardar y cargar.
  const snap = JSON.parse(JSON.stringify(k.temples.snapshot()));
  const k2 = kit();
  k2.temples.restore({ ...snap, done: [...snap.done, 'NOPE', 3] });
  assert.equal(k2.temples.get('RACE').done, true);
  assert.equal(k2.temples.temples.filter((x) => x.done).length, 1);
});

test('templo: pelea con enemigos de verdad; salir a medias los quita; morir dentro falla el reto', () => {
  const k = kit();
  const t = k.temples.temples[1];
  t.type = 'FIGHT';
  k.temples.enter(t);
  assert.equal(k.spawned.length, T.FIGHT.ENEMIES.length);
  const exit = k.temples.getInteractablesNear(k.player.position.x, 10, k.player.position.z, 3).find((i) => i.id.endsWith(':exit'));
  assert.ok(exit, 'el portal de salida está junto a donde apareces');
  k.temples.interact(exit.id);
  assert.equal(k.temples.current, null);
  assert.equal(k.removed.length, T.FIGHT.ENEMIES.length, 'los enemigos del reto desaparecen');
  assert.equal(t.done, false);
  // Morir dentro.
  const failed = [];
  k.events.on(GameEvents.TEMPLE_FAILED, (e) => failed.push(e.id));
  k.temples.enter(t);
  k.kill();
  k.temples.update(0.1);
  assert.deepEqual(failed, [t.id]);
  const before = k.teleports.length;
  k.temples.update(T.LEAVE_DELAY + 0.1);
  assert.equal(k.temples.current, null);
  assert.equal(k.teleports.length, before, 'muerto no se le mueve (reaparece en su cama)');
});

test('en el Edén: seis templos (cinco por la isla y el del valle del inicio), cada uno con su recinto llano y seco a unos 30 m', () => {
  const dir = new URL('../maps/eden/', import.meta.url);
  const map = MapData.fromFiles(JSON.parse(fs.readFileSync(new URL('eden.map.json', dir))), zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, maps: { [EDEN.homeId]: map }, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: 11, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS },
    },
  });
  const w = worlds.home;
  w.generate('42');
  const temples = new TempleSystem({ config: T, items: C.ITEMS, inventory: null, events: new EventBus(), scene: new THREE.Scene(), player: { position: new THREE.Vector3() }, teleport() {} });
  temples.setup(w);
  assert.equal(temples.temples.length, 6);
  assert.deepEqual(temples.temples.map((t) => t.type).sort(), [...T.TYPES_BY_SITE, 'TRIAL'].sort());
  for (const t of temples.temples) {
    const d = Math.hypot(t.x - t.arena.x, t.z - t.arena.z);
    assert.ok(d > 25 && d < 35, `${t.id}: recinto a ${d.toFixed(0)} m`);
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = 0; a < 16; a++) {
      for (const r of [5, 10, T.ARENA_RADIUS]) {
        const x = t.arena.x + Math.cos(a / 16 * Math.PI * 2) * r;
        const z = t.arena.z + Math.sin(a / 16 * Math.PI * 2) * r;
        assert.ok(!w.water?.isWater?.(x, z, 0.5), `${t.id}: sin agua en el recinto`);
        const h = w.getHeightAt(x, z);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    }
    assert.ok(hi - lo < 1.5, `${t.id}: recinto llano (${(hi - lo).toFixed(2)} m)`);
  }
});
