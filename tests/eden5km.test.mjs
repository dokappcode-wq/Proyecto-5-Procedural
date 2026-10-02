/**
 * v1.13: el Edén de 5 km con playas, ríos y montañas bajas; inicio en cualquier
 * punto; la nave en lo alto de las Montañas Heladas; el reloj en la cápsula.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig } from '../js/config/GameConfig.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { BiomeSystem } from '../js/world/BiomeSystem.js';
import { regionSize } from '../js/systemdata/Catalog.js';
import { loadSystem } from '../js/systemdata/SystemLoader.js';
import { captureState } from '../js/core/TravelHandoff.js';
import { EDEN, HOME } from './helpers/eden.mjs';

const W = GameConfig.WORLD;
const SIZE = regionSize(EDEN.home.regionKm);

function terrainFor(seedText) {
  const seed = new WorldSeed(seedText, W.SUB_SEEDS);
  const biomes = new BiomeSystem({ definitions: HOME.BIOMES, distribution: HOME.BIOME_DISTRIBUTION, seed: seed.sub.biome });
  const terrain = new TerrainGenerator({ profile: HOME.TERRAIN, biomes, seed: seed.sub.terrain, worldSize: SIZE, edgeMargin: W.EDGE_MARGIN });
  return { terrain, biomes };
}

test('el Edén mide 5 km y tiene seis biomas: explanada, bosque, montañas heladas, playa, río y montaña', () => {
  assert.equal(SIZE, 5120);
  assert.deepEqual(Object.keys(HOME.BIOMES).sort(), ['BEACH', 'FOREST', 'FROZEN_MOUNTAINS', 'MOUNTAINS', 'PLAINS', 'RIVER']);
  assert.equal(HOME.BIOMES.RIVER.NAME, 'Río');
  assert.equal(HOME.BIOMES.BEACH.NAME, 'Playa');
  assert.equal(HOME.BIOMES.MOUNTAINS.NAME, 'Montaña');
});

test('los pesos de los seis biomas suman 1 y todos aparecen', () => {
  for (const seed of ['mundo0', 'otra']) {
    const { terrain, biomes } = terrainFor(seed);
    const half = SIZE / 2 - W.EDGE_MARGIN;
    const counts = {};
    for (let x = -half; x <= half; x += 40) {
      for (let z = -half; z <= half; z += 40) {
        const w = terrain.sample(x, z).biomes;
        const sum = Object.values(w).reduce((a, b) => a + b, 0);
        assert.ok(Math.abs(sum - 1) < 1e-9, `suma ${sum}`);
        const id = biomes.dominant(w);
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    for (const id of biomes.ids) assert.ok(counts[id] > 20, `${seed}: casi no hay ${id} (${counts[id] ?? 0})`);
  }
});

test('montaña normal más baja que la helada y más alta que la explanada; playa baja junto al mar', () => {
  const { terrain, biomes } = terrainFor('mundo0');
  const acc = {};
  const half = SIZE / 2 - W.EDGE_MARGIN;
  for (let x = -half; x <= half; x += 24) {
    for (let z = -half; z <= half; z += 24) {
      const s = terrain.sample(x, z);
      const id = biomes.dominant(s.biomes);
      (acc[id] ??= []).push(s.height);
    }
  }
  const avg = (id) => acc[id].reduce((a, b) => a + b, 0) / acc[id].length;
  assert.ok(avg('MOUNTAINS') > avg('PLAINS') + 6, `montaña ${avg('MOUNTAINS')} vs explanada ${avg('PLAINS')}`);
  assert.ok(avg('FROZEN_MOUNTAINS') > avg('MOUNTAINS') + 10, `helada ${avg('FROZEN_MOUNTAINS')} vs montaña ${avg('MOUNTAINS')}`);
  assert.ok(avg('BEACH') < 3, `playa a ${avg('BEACH')} m`);
  assert.ok(biomes.get('MOUNTAINS').TEMPERATURE > biomes.get('FROZEN_MOUNTAINS').TEMPERATURE);
});

test('los ríos son agua dulce: cauce bajo el nivel del mar, de unos 10 m de ancho', () => {
  const { terrain } = terrainFor('mundo0');
  const half = SIZE / 2 - W.EDGE_MARGIN;
  const runs = [];
  for (let z = -half; z < half; z += 211) {
    let run = 0;
    for (let x = -half; x < half; x += 0.5) {
      const s = terrain.sample(x, z);
      if (s.fresh) {
        assert.ok(s.height < W.SEA_LEVEL, `agua de río sobre el suelo en ${x},${z}`);
        run += 0.5;
      } else if (run) {
        runs.push(run);
        run = 0;
      }
    }
  }
  assert.ok(runs.length > 20, `pocos ríos: ${runs.length}`);
  runs.sort((a, b) => a - b);
  const median = runs[runs.length >> 1];
  assert.ok(median >= 6 && median <= 16, `anchura mediana ${median} m`);
});

test('cuerpos sin las capas nuevas no cambian; una zona sin su parámetro se ignora con aviso', () => {
  const base = { schema_version: '1.0', name: 'P', planets: [{ name: 'Uno' }] };
  const plain = loadSystem(base).system.bodies[0].profile;
  assert.deepEqual(Object.keys(plain.BIOMES), ['PLAINS', 'FOREST', 'FROZEN_MOUNTAINS']);
  assert.equal(plain.TERRAIN.RIVERS, undefined);
  const r = loadSystem({ ...base, planets: [{ name: 'Uno', biomes: { river: { name: 'Arroyo' } }, flora: [{ template: 'bush', biome: 'beach', density: 0.1 }] }] });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /river/.test(w.path)));
  assert.ok(r.warnings.some((w) => /flora\[0\]/.test(w.path)));
  const withRivers = loadSystem({ ...base, planets: [{ name: 'Uno', terrain: { generator: 'island', params: { rivers: 0.5 } }, biomes: { river: { name: 'Arroyo' } } }] });
  assert.equal(withRivers.system.bodies[0].profile.BIOMES.RIVER.NAME, 'Arroyo');
});

test('la nave aparece en lo alto de las Montañas Heladas, sobre una explanada, lejos del inicio', async () => {
  const THREE = await import('three');
  const { WorldManager } = await import('../js/world/WorldManager.js');
  const cfg = GameConfig;
  for (const seed of ['1', '2', '3']) {
    const worlds = new WorldManager({
      scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
      options: {
        config: cfg.WORLD, resourceTypes: cfg.RESOURCE_TYPES, propColors: cfg.PROPS,
        landing: { DISTANCE: cfg.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: cfg.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
        homeRules: { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: cfg.SHIP.MOUNTAIN_LANDING_DISTANCE },
      },
    });
    const w = worlds.home;
    w.generate(seed);
    const sp = w.getSpawnPoint();
    const L = w.getLandingSite();
    assert.equal(w.getBiomeAt(sp.x, sp.z).id, 'PLAINS');
    assert.equal(w.getBiomeAt(L.x, L.z).id, 'FROZEN_MOUNTAINS', `seed ${seed}`);
    const d = Math.hypot(L.x - sp.x, L.z - sp.z);
    const [lo, hi] = cfg.SHIP.MOUNTAIN_LANDING_DISTANCE;
    assert.ok(d >= lo && d <= hi, `a ${d.toFixed(0)} m del inicio`);
    for (let a = 0; a < 8; a++) {
      const h = w.getHeightAt(L.x + Math.cos(a) * 7, L.z + Math.sin(a) * 7);
      assert.ok(Math.abs(h - w.getHeightAt(L.x, L.z)) < 0.2, 'la explanada de la nave es llana');
    }
    assert.ok(w.getHeightAt(L.x, L.z) > HOME.BIOMES.FROZEN_MOUNTAINS.SNOW_START_HEIGHT - 6, 'está en la zona nevada');
  }
});

test('el reloj de pulsera viaja por el hiperespacio', () => {
  const stub = { snapshot: () => [], slots: {}, value: 1, wearing: false, oxygen: 1, battery: 1, gas: 1, totalHours: 0 };
  const state = captureState({
    systemName: 'A', target: 'b', campaignSeed: 1, inventory: stub, equipment: stub, health: stub, hunger: stub, thirst: stub, energy: stub,
    lifeSupport: stub, time: stub, ship: { isExplorer: false, installed: {}, batteries: { slots: [] }, podsUsed: 0 }, hasWatch: false,
  });
  assert.equal(state.watch, false);
});
