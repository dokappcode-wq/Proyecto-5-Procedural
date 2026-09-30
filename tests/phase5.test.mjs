/**
 * Tests de la FASE 5: inventario, recogida y comportamiento animal. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { SeededRandom } from '../js/core/SeededRandom.js';
import { InventorySystem } from '../js/inventory/InventorySystem.js';
import { ResourceSystem } from '../js/world/ResourceSystem.js';
import { Animal, AnimalState, Temperament, HitReaction, pickWeighted } from '../js/animals/Animal.js';
import { HOME } from './helpers/eden.mjs';

// ---- Inventario ---------------------------------------------------------------

test('inventario: AddItem / RemoveItem / HasItem / GetItemCount', () => {
  const events = new EventBus();
  const changes = [];
  events.on(GameEvents.INVENTORY_CHANGED, (e) => changes.push(e));
  const inv = new InventorySystem({ items: GameConfig.ITEMS, events });

  assert.equal(inv.GetItemCount('WOOD'), 0);
  assert.equal(inv.AddItem('WOOD', 3), 3);
  assert.ok(inv.HasItem('WOOD', 3));
  assert.ok(!inv.HasItem('WOOD', 4));
  assert.equal(inv.RemoveItem('WOOD', 5), false, 'no se puede quitar más de lo que hay');
  assert.equal(inv.GetItemCount('WOOD'), 3);
  assert.ok(inv.RemoveItem('WOOD', 2));
  assert.equal(inv.GetItemCount('WOOD'), 1);
  assert.throws(() => inv.addItem('DIAMANTE', 1));
  assert.deepEqual(changes.map((c) => c.delta), [3, -2]);
  assert.deepEqual(inv.getAll().map((i) => [i.id, i.count]), [['WOOD', 1]]);
});

// ---- Recogida -------------------------------------------------------------------

function flatResources() {
  // Terreno llano de bosque, sin agua: suficiente para probar la recogida.
  return new ResourceSystem({
    config: HOME.RESOURCES,
    types: GameConfig.RESOURCE_TYPES,
    seed: 1234,
    world: {
      chunkSize: 64, half: 512, chunkCount: 16, seaLevel: 0, spawn: { x: 9999, z: 9999 },
      heightAt: () => 5,
      sample: () => ({ biomes: { PLAINS: 0, FOREST: 1, FROZEN_MOUNTAINS: 0 } }),
      isWater: () => false,
    },
  });
}

test('recogida: los árboles se agotan y desaparecen', () => {
  const res = flatResources();
  const tree = res.getChunk(5, 5).nodes.find((n) => n.type === 'TREE');
  const amount = GameConfig.RESOURCE_TYPES.TREE.HARVEST.AMOUNT;
  let changed = 0;
  res.onChunkChanged = () => changed++;
  for (let i = 0; i < amount; i++) assert.equal(res.harvest(tree.id).item, 'WOOD');
  assert.ok(tree.removed);
  assert.equal(res.harvest(tree.id), null);
  assert.equal(changed, 1, 'solo se reconstruye el chunk al agotarse');
});

test('recogida: los manzanos se quedan sin manzanas y rebrotan', () => {
  const res = flatResources();
  let apple = null;
  for (let c = 0; c < 16 && !apple; c++) apple = res.getChunk(c, 5).nodes.find((n) => n.type === 'APPLE_TREE');
  const h = GameConfig.RESOURCE_TYPES.APPLE_TREE.HARVEST;
  for (let i = 0; i < h.AMOUNT; i++) assert.equal(res.harvest(apple.id).item, 'APPLE');
  assert.ok(apple.depleted && !apple.removed);
  assert.equal(res.harvest(apple.id), null);
  res.update(h.REGROW_SECONDS + 1);
  assert.ok(!apple.depleted);
  assert.equal(apple.remaining, h.AMOUNT);
});

// ---- Animales -------------------------------------------------------------------

const CFG = GameConfig.ANIMALS;

function makeAnimal({ temperament, hitReaction, species = 'GOAT', x = 0, z = 0 }) {
  return new Animal({
    id: 'test', species, def: CFG.SPECIES[species], x, z,
    home: { x: 0, z: 0, radius: 200 }, rng: new SeededRandom(7), scale: 1, temperament, hitReaction,
  });
}

function makeEnv(player, attacks = []) {
  return {
    cfg: CFG,
    player,
    playerRunning: false,
    turnSpeed: CFG.TURN_SPEED,
    groundAt: () => 0,
    isWalkable: () => true,
    resolveCollisions: () => false,
    onAttack: (a) => attacks.push(a),
  };
}

const dist = (a, p) => Math.hypot(a.x - p.x, a.z - p.z);
const run = (a, env, seconds) => { for (let i = 0; i < seconds * 60; i++) a.update(1 / 60, env); };

test('temperamento FLEE: se aleja del jugador', () => {
  const a = makeAnimal({ temperament: Temperament.FLEE, hitReaction: HitReaction.FLEE });
  const player = { x: 4, z: 0 };
  run(a, makeEnv(player), 3);
  assert.equal(a.state, AnimalState.FLEE);
  assert.ok(dist(a, player) > 8);
});

test('temperamento CURIOUS: se acerca y se detiene cerca', () => {
  const a = makeAnimal({ temperament: Temperament.CURIOUS, hitReaction: HitReaction.FLEE });
  const player = { x: 12, z: 0 };
  run(a, makeEnv(player), 8);
  assert.equal(a.state, AnimalState.CURIOUS);
  const d = dist(a, player);
  assert.ok(d < 4 && d > 1.5, `distancia ${d.toFixed(2)}`);
});

test('temperamento NEUTRAL: no reacciona al jugador', () => {
  const a = makeAnimal({ temperament: Temperament.NEUTRAL, hitReaction: HitReaction.FLEE });
  const player = { x: 2, z: 0 };
  for (let i = 0; i < 300; i++) {
    a.update(1 / 60, makeEnv(player));
    assert.ok([AnimalState.IDLE, AnimalState.WALK].includes(a.state), a.state);
  }
});

test('golpe con reacción FLEE: huye aunque sea neutral', () => {
  const a = makeAnimal({ temperament: Temperament.NEUTRAL, hitReaction: HitReaction.FLEE });
  const player = { x: 1.5, z: 0 };
  a.takeHit(1, player.x, player.z, CFG, 3);
  run(a, makeEnv(player), 2);
  assert.equal(a.state, AnimalState.FLEE);
  assert.ok(dist(a, player) > 6);
});

test('golpe con reacción FIGHT: persigue y ataca al jugador', () => {
  const a = makeAnimal({ temperament: Temperament.FLEE, hitReaction: HitReaction.FIGHT });
  const attacks = [];
  const player = { x: 6, z: 0 };
  a.takeHit(1, player.x, player.z, CFG, 3);
  run(a, makeEnv(player, attacks), 4);
  assert.equal(a.state, AnimalState.ATTACK);
  assert.ok(attacks.length >= 2, `${attacks.length} ataques`);
  assert.ok(dist(a, player) <= CFG.ATTACK_RANGE + 0.2);
});

test('muerte: al agotar la vida muere, suelta recursos y desaparece', () => {
  const a = makeAnimal({ temperament: Temperament.NEUTRAL, hitReaction: HitReaction.FIGHT, species: 'COW' });
  let result;
  for (let i = 0; i < CFG.SPECIES.COW.HEALTH; i++) result = a.takeHit(1, 3, 0, CFG, 3);
  assert.ok(result.killed);
  assert.equal(a.state, AnimalState.DEAD);
  assert.deepEqual(a.drops, { MEAT: 3, LEATHER: 2 });
  run(a, makeEnv({ x: 3, z: 0 }), CFG.DEATH_TIME + 0.1);
  assert.ok(a.removed);
});

test('asignación aleatoria ponderada: todas las opciones posibles y reproducible', () => {
  const rng = new SeededRandom(99);
  const seen = {};
  for (let i = 0; i < 2000; i++) {
    const t = pickWeighted(CFG.SPECIES.GOAT.TEMPERAMENT_WEIGHTS, rng.next());
    seen[t] = (seen[t] ?? 0) + 1;
  }
  assert.deepEqual(Object.keys(seen).sort(), ['CURIOUS', 'FLEE', 'NEUTRAL']);
  const again = new SeededRandom(99);
  assert.equal(pickWeighted(CFG.SPECIES.GOAT.TEMPERAMENT_WEIGHTS, again.next()), pickWeighted(CFG.SPECIES.GOAT.TEMPERAMENT_WEIGHTS, new SeededRandom(99).next()));
});
