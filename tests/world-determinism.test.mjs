/**
 * Tests de reproducibilidad del mundo (sin navegador): `npm test`.
 * Solo usan módulos puros (sin Three.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { KeySequenceDetector } from '../js/admin/KeySequenceDetector.js';

const W = GameConfig.WORLD;
const P = GameConfig.PLANETS.MUNDO_0;

function terrainFor(seedText) {
  const seed = new WorldSeed(seedText, W.SUB_SEEDS);
  const terrain = new TerrainGenerator({
    profile: P.TERRAIN,
    seed: seed.sub.terrain,
    worldSize: W.WORLD_SIZE,
    edgeMargin: W.EDGE_MARGIN,
  });
  return { seed, terrain };
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
