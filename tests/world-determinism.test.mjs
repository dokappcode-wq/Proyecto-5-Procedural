/**
 * Tests de reproducibilidad del mundo (sin navegador): `npm test`.
 * Solo usan módulos puros (sin Three.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { BiomeSystem } from '../js/world/BiomeSystem.js';
import { KeySequenceDetector } from '../js/admin/KeySequenceDetector.js';

const W = GameConfig.WORLD;
const P = GameConfig.PLANETS.MUNDO_0;

function terrainFor(seedText) {
  const seed = new WorldSeed(seedText, W.SUB_SEEDS);
  const biomes = new BiomeSystem({ definitions: P.BIOMES, distribution: P.BIOME_DISTRIBUTION, seed: seed.sub.biome });
  const terrain = new TerrainGenerator({
    profile: P.TERRAIN,
    biomes,
    seed: seed.sub.terrain,
    worldSize: W.WORLD_SIZE,
    edgeMargin: W.EDGE_MARGIN,
  });
  return { seed, terrain, biomes };
}

/** Porcentaje de área jugable por bioma dominante. */
function biomeShares(seedText) {
  const { terrain, biomes } = terrainFor(seedText);
  const half = W.WORLD_SIZE / 2 - W.EDGE_MARGIN;
  const counts = Object.fromEntries(biomes.ids.map((id) => [id, 0]));
  let n = 0;
  for (let x = -half; x <= half; x += 16) {
    for (let z = -half; z <= half; z += 16) {
      counts[biomes.dominant(terrain.sample(x, z).biomes)]++;
      n++;
    }
  }
  for (const id in counts) counts[id] /= n;
  return counts;
}

function fingerprint(terrain) {
  const out = [];
  for (let x = -500; x <= 500; x += 50) for (let z = -500; z <= 500; z += 50) out.push(terrain.heightAt(x, z));
  return out;
}

test('la misma seed produce el mismo terreno y las mismas sub-seeds', () => {
  const a = terrainFor('mundo0');
  const b = terrainFor('mundo0');
  assert.deepEqual(a.seed.sub, b.seed.sub);
  assert.deepEqual(fingerprint(a.terrain), fingerprint(b.terrain));
});

test('seeds distintas producen terrenos distintos', () => {
  assert.notDeepEqual(fingerprint(terrainFor('mundo0').terrain), fingerprint(terrainFor('otra').terrain));
});

test('las sub-seeds son independientes entre sí', () => {
  const { seed } = terrainFor('mundo0');
  assert.equal(new Set(Object.values(seed.sub)).size, W.SUB_SEEDS.length);
});

test('el borde del mundo finito desciende al fondo marino', () => {
  const { terrain } = terrainFor('mundo0');
  const edge = W.WORLD_SIZE / 2 - 1;
  for (let t = -edge; t <= edge; t += 64) {
    assert.ok(terrain.heightAt(t, edge) < W.SEA_LEVEL);
    assert.ok(terrain.heightAt(edge, t) < W.SEA_LEVEL);
  }
});

test('los pesos de bioma suman 1 y la misma seed da los mismos biomas', () => {
  const a = terrainFor('mundo0');
  const b = terrainFor('mundo0');
  for (let x = -400; x <= 400; x += 40) {
    for (let z = -400; z <= 400; z += 40) {
      const wa = { ...a.terrain.sample(x, z).biomes };
      const wb = { ...b.terrain.sample(x, z).biomes };
      assert.deepEqual(wa, wb);
      const sum = wa.PLAINS + wa.FOREST + wa.FROZEN_MOUNTAINS;
      assert.ok(Math.abs(sum - 1) < 1e-9, `suma ${sum}`);
    }
  }
});

test('los tres biomas aparecen con una proporción razonable en varias seeds', () => {
  for (const seed of ['mundo0', 'otra', '12345', 'hola', 'planeta']) {
    const s = biomeShares(seed);
    for (const [id, share] of Object.entries(s)) {
      assert.ok(share > 0.05, `${seed}: ${id} solo ${(share * 100).toFixed(1)}%`);
    }
  }
});

test('las montañas heladas están más altas y más frías que la explanada', () => {
  const { terrain, biomes } = terrainFor('mundo0');
  const acc = { PLAINS: [0, 0], FROZEN_MOUNTAINS: [0, 0] };
  for (let x = -400; x <= 400; x += 10) {
    for (let z = -400; z <= 400; z += 10) {
      const s = terrain.sample(x, z);
      const id = biomes.dominant(s.biomes);
      if (acc[id]) { acc[id][0] += s.height; acc[id][1]++; }
    }
  }
  const avg = (id) => acc[id][0] / acc[id][1];
  assert.ok(avg('FROZEN_MOUNTAINS') > avg('PLAINS') + 15);
  assert.ok(biomes.get('FROZEN_MOUNTAINS').TEMPERATURE < biomes.get('PLAINS').TEMPERATURE);
});

test('la secuencia ADMIN se detecta, se reinicia con errores y caduca', () => {
  let hits = 0;
  const d = new KeySequenceDetector({ sequence: ['a', 'd', 'm', 'i', 'n'], timeoutMs: 2000, onMatch: () => hits++ });
  let t = 0;
  for (const k of 'admin') d.feed(k, (t += 100));
  assert.equal(hits, 1);
  for (const k of 'adxmin') d.feed(k, (t += 100));
  assert.equal(hits, 1);
  for (const k of 'adm') d.feed(k, (t += 100));
  t += 2500;
  for (const k of 'in') d.feed(k, (t += 100));
  assert.equal(hits, 1);
  for (const k of 'aadmin') d.feed(k, (t += 100));
  assert.equal(hits, 2);
});
