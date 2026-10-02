/**
 * Tests del mundo vivo (FASE 4): charcas y recursos. Sin navegador: `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { BiomeSystem } from '../js/world/BiomeSystem.js';
import { WaterSystem } from '../js/world/WaterSystem.js';
import { ResourceSystem } from '../js/world/ResourceSystem.js';
import { HOME_1KM as HOME } from './helpers/eden.mjs';

const W = GameConfig.WORLD;
const P = HOME;
const HALF = W.WORLD_SIZE / 2 - W.EDGE_MARGIN;
const BOUNDS = { minX: -HALF, maxX: HALF, minZ: -HALF, maxZ: HALF };

/** Mundo mínimo sin Three.js (misma secuencia que WorldGenerator.generate). */
function buildWorld(seedText) {
  const seed = new WorldSeed(seedText, W.SUB_SEEDS);
  const biomes = new BiomeSystem({ definitions: P.BIOMES, distribution: P.BIOME_DISTRIBUTION, seed: seed.sub.biome });
  const terrain = new TerrainGenerator({
    profile: P.TERRAIN, biomes, seed: seed.sub.terrain, worldSize: W.WORLD_SIZE, edgeMargin: W.EDGE_MARGIN,
  });
  // Spawn aproximado: primer punto de explanada cerca del centro.
  let spawn = { x: 0, z: 0 };
  for (let r = 0; r < 300; r += 8) {
    const s = terrain.sample(r, 0);
    if (s.biomes.PLAINS > 0.8 && s.height > 2) { spawn = { x: r, z: 0 }; break; }
  }
  const water = new WaterSystem({ config: P.WATER, seaLevel: W.SEA_LEVEL });
  water.generate({ seed: seed.sub.resource, terrain, spawn, bounds: BOUNDS });
  terrain.setWater(water);
  const resources = new ResourceSystem({
    config: P.RESOURCES,
    types: GameConfig.RESOURCE_TYPES,
    seed: seed.sub.resource,
    world: {
      chunkSize: W.CHUNK_SIZE, half: W.WORLD_SIZE / 2, chunkCount: W.WORLD_SIZE / W.CHUNK_SIZE,
      seaLevel: W.SEA_LEVEL, spawn,
      heightAt: (x, z) => terrain.heightAt(x, z),
      sample: (x, z) => terrain.sample(x, z),
      isWater: (x, z, m) => water.isWater(x, z, m),
    },
  });
  return { terrain, water, resources, spawn };
}

test('charcas: deterministas, separadas y una cerca del inicio', () => {
  const a = buildWorld('mundo0');
  const b = buildWorld('mundo0');
  assert.deepEqual(a.water.ponds, b.water.ponds);
  assert.ok(a.water.ponds.length >= 8, `solo ${a.water.ponds.length} charcas`);
  const near = a.water.nearestPond(a.spawn.x, a.spawn.z);
  assert.ok(near.distance <= P.WATER.NEAR_SPAWN_DISTANCE[1] + 10, `charca más cercana a ${near.distance.toFixed(0)} m`);
  for (const p of a.water.ponds) {
    for (const q of a.water.ponds) if (p !== q) assert.ok(Math.hypot(p.x - q.x, p.z - q.z) >= P.WATER.MIN_SPACING);
  }
});

test('charcas: el agua queda excavada (fondo bajo el nivel, orilla por encima)', () => {
  const { terrain, water } = buildWorld('mundo0');
  for (const p of water.ponds) {
    assert.ok(terrain.heightAt(p.x, p.z) < p.level - 0.5, 'el centro debe estar bajo el agua');
    const outer = p.radius * (1 + P.WATER.SHORE_WIDTH) + 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      assert.ok(terrain.heightAt(p.x + Math.cos(a) * outer, p.z + Math.sin(a) * outer) > p.level, 'la orilla contiene el agua');
    }
  }
});

test('recursos: deterministas e independientes del orden de visita', () => {
  const a = buildWorld('mundo0').resources;
  const b = buildWorld('mundo0').resources;
  const strip = (c) => c.nodes.map(({ id, type, x, z, scale }) => [id, type, x, z, scale]);
  a.getChunk(3, 3);
  const a88 = strip(a.getChunk(8, 8));
  const b88 = strip(b.getChunk(8, 8)); // b visita (8,8) primero
  assert.deepEqual(a88, b88);
});

test('recursos: el bosque tiene árboles y manzanos; nada crece en el agua', () => {
  const { resources, water, terrain } = buildWorld('mundo0');
  const counts = {};
  for (let cx = 2; cx < 14; cx++) {
    for (let cz = 2; cz < 14; cz++) {
      for (const n of resources.getChunk(cx, cz).nodes) {
        counts[n.type] = (counts[n.type] ?? 0) + 1;
        assert.ok(!water.isWater(n.x, n.z), `${n.type} dentro del agua`);
        if (n.type === 'TREE') {
          const biome = terrain.sample(n.x, n.z).biomes;
          // Solo puede aparecer donde bosque o explanada tienen algo de peso (fronteras incluidas).
          assert.ok(biome.FOREST + biome.PLAINS > 0, 'árbol de hoja ancha en plena montaña helada');
        }
      }
    }
  }
  for (const t of ['TREE', 'APPLE_TREE', 'PINE', 'ROCK', 'BUSH']) assert.ok(counts[t] > 10, `pocos ${t}: ${counts[t]}`);
});

test('recursos: retirar un nodo lo recuerda y notifica el chunk', () => {
  const { resources } = buildWorld('mundo0');
  const node = resources.getChunk(8, 8).nodes[0];
  let changed = null;
  resources.onChunkChanged = (cx, cz) => (changed = [cx, cz]);
  assert.equal(resources.removeNode(node.id), node);
  assert.deepEqual(changed, [8, 8]);
  assert.ok(!resources.getNodesNear(node.x, node.z, 0.1).includes(node));
  assert.equal(resources.removeNode(node.id), null);
});

test('recursos: las colisiones empujan fuera de troncos y rocas', () => {
  const { resources } = buildWorld('mundo0');
  const node = resources.getChunk(8, 8).nodes.find((n) => n.radius > 0);
  const pos = { x: node.x + 0.1, z: node.z };
  assert.ok(resources.resolveCollisions(pos, 0.35));
  assert.ok(Math.hypot(pos.x - node.x, pos.z - node.z) >= node.radius + 0.35 - 1e-6);
});
