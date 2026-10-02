/**
 * v1.14: guardar partida, defensa de la armadura, herramientas de 400 golpes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { SaveGame } from '../js/core/SaveGame.js';
import { EventBus } from '../js/core/EventBus.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { EquipmentSystem } from '../js/inventory/EquipmentSystem.js';
import { HealthSystem } from '../js/player/HealthSystem.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { BiomeSystem } from '../js/world/BiomeSystem.js';
import { ResourceSystem } from '../js/world/ResourceSystem.js';
import { HOME_1KM as P } from './helpers/eden.mjs';

const memory = () => {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: (k) => m.delete(k) };
};

test('guardar y cargar: cada parte recibe lo suyo; lo inválido se ignora', () => {
  const storage = memory();
  const a = new SaveGame({ key: 'k', storage });
  let x = 5;
  a.register('x', { save: () => ({ x }), load: (d) => (x = d.x) });
  assert.equal(a.peek(), null);
  assert.equal(a.write({ file: 'jardin-del-eden', seed: 42, system: 'S', reason: 'manual' }), true);
  x = 0;
  const b = new SaveGame({ key: 'k', storage });
  b.register('x', { save: () => null, load: (d) => (x = d.x) });
  b.apply(b.read());
  assert.equal(x, 5);
  assert.equal(b.peek().seed, 42);
  storage.set('k', '{"v":99}');
  assert.equal(b.read(), null, 'otra versión no se carga');
  storage.set('k', 'no es json');
  assert.equal(b.read(), null);
});

test('la armadura quita daño de los ataques según su defensa', () => {
  const events = new EventBus();
  const inventory = new InventorySystem({ items: GameConfig.ITEMS, events, config: GameConfig.INVENTORY });
  const eq = new EquipmentSystem({ items: GameConfig.ITEMS, config: GameConfig.EQUIPMENT, inventory, events });
  for (const id of ['LEATHER_CAP', 'LEATHER_SHIRT', 'LEATHER_PANTS', 'LEATHER_SHOES', 'LEATHER_GLOVES']) {
    inventory.addItem(id, 1);
    eq.wear(id);
  }
  assert.equal(eq.defense, 8);
  assert.ok(Math.abs(eq.damageReduction - 0.12) < 1e-9);
  const health = new HealthSystem({ config: GameConfig.SURVIVAL, events });
  health.modifier = (d) => (d.fromX !== undefined ? d.amount * (1 - eq.damageReduction) : d.amount);
  events.emit('player:damaged', { amount: 50, source: 'GOLEM', fromX: 0, fromZ: 0 });
  assert.equal(Math.round(health.value), 56);
  events.emit('player:damaged', { amount: 10, source: 'FALL' });
  assert.equal(Math.round(health.value), 46, 'las caídas no las para la armadura');
});

test('hacha y pico: 400 golpes; talar con hacha 3 s y picar 3 s', () => {
  const I = GameConfig.ITEMS;
  const R = GameConfig.RESOURCE_TYPES;
  assert.equal(I.STONE_AXE.DURABILITY, 400);
  assert.equal(I.STONE_PICKAXE.DURABILITY, 400);
  assert.equal(R.TREE.HARVEST.CHOP_TIME / I.STONE_AXE.TOOL.CHOP_SPEED, 3);
  assert.equal(R.ROCK.BREAK.TIME / I.STONE_PICKAXE.TOOL.MINE_SPEED, 3);
  assert.equal(GameConfig.INTERACTION.PLAYER_HIT_DAMAGE, 2);
  const S = GameConfig.ANIMALS.SPECIES;
  assert.deepEqual([S.DEER.HEALTH, S.GOAT.HEALTH, S.COW.HEALTH], [10, 14, 16]);
});

test('recursos: lo talado y lo recogido se guarda y se recupera', () => {
  const W = GameConfig.WORLD;
  const make = () => {
    const seed = new WorldSeed('guardar', W.SUB_SEEDS);
    const biomes = new BiomeSystem({ definitions: P.BIOMES, distribution: P.BIOME_DISTRIBUTION, seed: seed.sub.biome });
    const terrain = new TerrainGenerator({ profile: P.TERRAIN, biomes, seed: seed.sub.terrain, worldSize: W.WORLD_SIZE, edgeMargin: W.EDGE_MARGIN });
    return new ResourceSystem({
      config: P.RESOURCES, types: GameConfig.RESOURCE_TYPES, seed: seed.sub.resource,
      world: {
        chunkSize: W.CHUNK_SIZE, half: W.WORLD_SIZE / 2, chunkCount: W.WORLD_SIZE / W.CHUNK_SIZE, seaLevel: W.SEA_LEVEL, spawn: { x: 0, z: 0 },
        heightAt: (x, z) => terrain.heightAt(x, z), sample: (x, z) => terrain.sample(x, z), isWater: () => false,
      },
    });
  };
  const a = make();
  const nodes = a.getChunk(5, 5).nodes.concat(a.getChunk(6, 6).nodes);
  const tree = nodes.find((n) => n.type === 'TREE');
  const rock = nodes.find((n) => n.type === 'ROCK');
  a.removeNode(tree.id);
  a.harvest(rock.id);
  const snap = JSON.parse(JSON.stringify(a.snapshot()));
  const b = make();
  b.restore(snap);
  const all = b.getChunk(5, 5).nodes.concat(b.getChunk(6, 6).nodes);
  assert.equal(all.find((n) => n.id === tree.id).removed, true);
  assert.equal(all.find((n) => n.id === rock.id).remaining, rock.remaining);
});
