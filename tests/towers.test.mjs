/**
 * P11 (v1.34): torres de reconocimiento y niebla del mapa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { FogOfWar } from '../js/world/map/FogOfWar.js';
import { AchievementSystem } from '../js/progress/AchievementSystem.js';
import './helpers/three.mjs';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { RecognitionTowers } = await import('../js/world/RecognitionTowers.js');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');

const R = C.RECON;

function kit(sites = [{ id: 'T1', x: 100, z: 100 }, { id: 'T2', x: 900, z: -300 }]) {
  const events = new EventBus();
  const msgs = [];
  events.on(GameEvents.UI_MESSAGE, (m) => msgs.push(m.text));
  const towers = new RecognitionTowers({ config: R, events, scene: new THREE.Scene() });
  const world = {
    getSites: (kind) => (kind === 'RECON_TOWER' ? sites : []),
    getHeightAt: () => 12,
    getSpawnPoint: () => ({ x: 0, z: 0 }),
  };
  towers.setup(world);
  return { events, msgs, towers };
}

test('niebla: revela círculos, no repite los que ya están dentro, valida lo guardado', () => {
  const f = new FogOfWar({ limit: 3 });
  assert.equal(f.isRevealed(0, 0), false);
  assert.ok(f.reveal(0, 0, 100));
  assert.equal(f.reveal(10, 10, 20), false, 'ya está dentro del primero');
  assert.ok(f.reveal(500, 0, 100));
  assert.ok(f.isRevealed(50, 50) && !f.isRevealed(300, 0));
  assert.equal(f.reveal(NaN, 0, 5), false);
  assert.equal(f.reveal(0, 0, -5), false);
  const v = f.version;
  f.restore([{ x: 1, z: 2, r: 50 }, { x: 'a', z: 0, r: 5 }, null, { x: 0, z: 0, r: 1e9 }, { x: 1e7, z: 0, r: 5 }]);
  assert.equal(f.circles.length, 2, 'los números raros se descartan');
  assert.equal(f.circles[1].r, 2000, 'el radio tiene tope');
  assert.ok(f.version > v);
  f.restore('no es una lista');
  assert.equal(f.circles.length, 0);
});

test('niebla: se dibuja sobre un canvas (solo se usan sus llamadas)', () => {
  const f = new FogOfWar();
  f.reveal(0, 0, 100);
  const calls = [];
  const grad = { addColorStop() {} };
  const ctxMock = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return k === 'createRadialGradient' ? grad : undefined; }), set: (t, k, v) => ((t[k] = v), true) });
  const scratch = { getContext: () => ctxMock() };
  const target = { drawImage: (c) => calls.push(c === scratch ? 'scratch' : 'other') };
  f.draw(target, (x, z) => [x + 128, z + 128], 256, scratch);
  assert.ok(calls.includes('fillRect') && calls.includes('arc') && calls.includes('scratch'));
});

test('torres: se activan con E, barren y revelan su zona; no se repiten; cuentan para el logro', () => {
  const { events, msgs, towers } = kit();
  const achievements = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events });
  const revealed = [];
  events.on(GameEvents.TOWER_REVEALED, (e) => revealed.push(e.id));
  // Al empezar solo se ve una zona pequeña alrededor del inicio (la cápsula): lo demás, en niebla.
  assert.ok(towers.fog.isRevealed(0, 0) && !towers.fog.isRevealed(R.START_REVEAL + 20, 0));
  assert.ok(!towers.fog.isRevealed(100, 100));
  const near = towers.getInteractablesNear(100, 12, 100, 2);
  assert.equal(near.length, 1, 'solo la torre cercana');
  assert.equal(near[0].action, 'Activar');
  assert.equal(towers.interact(near[0].id), true);
  assert.equal(towers.getInteractablesNear(100, 12, 100, 2)[0].action, 'Escaneando…');
  towers.update(R.SCAN_TIME / 2);
  assert.equal(revealed.length, 0, 'todavía escaneando');
  towers.update(R.SCAN_TIME);
  assert.deepEqual(revealed, ['T1']);
  assert.ok(towers.fog.isRevealed(100, 100 + R.SCAN_RADIUS - 20), 'la zona de la torre ya se ve');
  assert.ok(!towers.fog.isRevealed(900, -300), 'la otra torre sigue tapada');
  assert.equal(towers.getInteractablesNear(100, 12, 100, 2)[0].action, 'Ya escaneada');
  assert.equal(towers.interact(near[0].id), true);
  assert.match(msgs.at(-1), /ya escaneó/);
  assert.equal(towers.activeCount, 1);
  assert.ok(towers.marks().some((m) => m.id === 'T1' && m.active));
  assert.ok(towers.marks().some((m) => m.id === 'T2') === false, 'la torre tapada no sale en el mapa');
  // Logro de las cuatro torres.
  assert.equal(achievements.progress('SCOUT')[0], 1);
});

test('torres: guardar y cargar (datos raros fuera); con todas las torres llega el logro', () => {
  const sites = [{ id: 'A', x: 0, z: 0 }, { id: 'B', x: 800, z: 0 }, { id: 'C', x: 0, z: 800 }, { id: 'D', x: 800, z: 800 }, { id: 'E', x: 400, z: 400 }];
  const { events, towers } = kit(sites);
  const achievements = new AchievementSystem({ config: C.ACHIEVEMENTS, recipes: C.RECIPES, events });
  for (const s of sites) {
    towers.interact(`recon:${s.id}`);
    towers.update(R.SCAN_TIME + 0.1);
  }
  assert.equal(towers.activeCount, 5);
  assert.equal(C.ACHIEVEMENTS.SCOUT.COUNT, 5);
  assert.ok(achievements.unlocked.has('SCOUT'));
  const snap = JSON.parse(JSON.stringify(towers.snapshot()));
  const k2 = kit(sites);
  k2.towers.restore(snap);
  assert.equal(k2.towers.activeCount, 5);
  assert.ok(k2.towers.fog.isRevealed(800, 800));
  k2.towers.restore({ active: ['A', 'NO', 7, { x: 1 }], fog: [{ x: 5e6, z: 0, r: 3 }] });
  assert.equal(k2.towers.activeCount, 1, 'solo los ids conocidos');
  assert.equal(k2.towers.fog.circles.length, 0, 'círculo fuera de rango descartado');
  k2.towers.restore(null);
  assert.equal(k2.towers.activeCount, 1, 'sin datos no cambia nada');
});

test('en el Edén: cinco torres de reconocimiento, todas en tierra firme', () => {
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
  const sites = w.getSites('RECON_TOWER');
  assert.equal(sites.length, 5, 'cuatro por la isla y la del Valle del Despertar');
  for (const s of sites) {
    assert.ok(w.getHeightAt(s.x, s.z) > 4, `${s.id} sobre tierra`);
    assert.ok(!w.water?.isWater?.(s.x, s.z, 4), `${s.id} sin agua`);
  }
  const towers = new RecognitionTowers({ config: C.RECON, events: new EventBus(), scene: new THREE.Scene() });
  towers.setup(w);
  assert.equal(towers.towers.length, 5);
  const sp = w.getSpawnPoint();
  assert.ok(towers.fog.isRevealed(sp.x, sp.z), 'al empezar se ve la zona de la cápsula');
  const valleyTower = towers.towers.at(-1);
  assert.ok(Math.hypot(valleyTower.x - sp.x, valleyTower.z - sp.z) < 250, 'la torre del valle está cerca del inicio');
  assert.ok(!towers.fog.isRevealed(valleyTower.x, valleyTower.z), 'pero el resto del valle no, hasta activar su torre');
});
