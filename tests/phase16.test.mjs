/**
 * v1.16: cuevas subterráneas y de montaña, menas (carbón, cobre, hierro, diamante),
 * flores luminosas y oscuridad.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { CaveSystem } from '../js/world/CaveSystem.js';
import { EDEN } from './helpers/eden.mjs';

const homeWorld = async (seed) => {
  const THREE = await import('three');
  const { WorldManager } = await import('../js/world/WorldManager.js');
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: C.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: C.SHIP.MOUNTAIN_LANDING_DISTANCE, CAVES: C.CAVES },
    },
  });
  const w = worlds.home;
  w.generate(seed);
  return w;
};

const cache = new Map();
const world = (seed) => {
  if (!cache.has(seed)) cache.set(seed, homeWorld(seed));
  return cache.get(seed);
};

test('el Edén tiene cuevas subterráneas y de montaña, lejos del inicio', async () => {
  for (const seed of ['42', '7']) {
    const w = await world(seed);
    const caves = w.caves.caves;
    const kinds = { UNDERGROUND: 0, MOUNTAIN: 0 };
    for (const c of caves) kinds[c.kind]++;
    assert.ok(kinds.UNDERGROUND >= C.CAVES.UNDERGROUND * 0.75, `subterráneas: ${kinds.UNDERGROUND}`);
    assert.ok(kinds.MOUNTAIN >= C.CAVES.MOUNTAIN * 0.5, `de montaña: ${kinds.MOUNTAIN}`);
    const sp = w.getSpawnPoint();
    for (const c of caves) {
      assert.ok(Math.hypot(c.mouth.x - sp.x, c.mouth.z - sp.z) >= C.CAVES.MIN_SPAWN_DISTANCE, 'nada pegado al inicio');
      assert.ok(c.nodes.length >= C.CAVES.MIN_STEPS);
    }
    // Las de montaña empiezan en una ladera de montaña.
    for (const c of caves.filter((c) => c.kind === 'MOUNTAIN')) {
      const b = w.getBiomeAt(c.mouth.x, c.mouth.z).id;
      assert.ok(b === 'MOUNTAINS' || b === 'FROZEN_MOUNTAINS', `boca en ${b}`);
    }
  }
});

test('las cuevas son hondas, sin escalones y siempre con roca encima', async () => {
  const w = await world('42');
  const maxStep = C.CAVES.STEP * 0.62 + 1e-6;
  for (const c of w.caves.caves) {
    let deepest = Infinity;
    for (let i = 1; i < c.nodes.length; i++) {
      const a = c.nodes[i - 1];
      const b = c.nodes[i];
      assert.ok(Math.abs(b.floor - a.floor) <= maxStep, `cueva ${c.id}, tramo ${i}: ${(b.floor - a.floor).toFixed(2)} m`);
      deepest = Math.min(deepest, b.floor);
      if (i > C.CAVES.ENTRANCE_STEPS) {
        const rock = w.getHeightAt(b.x, b.z) - (b.y + 0.85 * b.r);
        assert.ok(rock > 1, `cueva ${c.id}, nodo ${i}: ${rock.toFixed(1)} m de roca`);
      }
    }
    assert.ok(c.nodes[0].floor - deepest >= 15, `cueva ${c.id}: ${(c.nodes[0].floor - deepest).toFixed(0)} m de hondo`);
  }
});

test('se puede bajar andando de la boca al fondo: siempre hay suelo bajo los pies', async () => {
  const w = await world('42');
  for (const c of w.caves.caves.slice(0, 6)) {
    for (let i = 0; i < c.nodes.length - 1; i++) {
      const a = c.nodes[i];
      const b = c.nodes[i + 1];
      for (let t = 0; t < 1; t += 0.2) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const f = a.floor + (b.floor - a.floor) * t;
        const hit = w.caveFloorAt(x, z, f + 0.3);
        assert.ok(hit, `cueva ${c.id}, tramo ${i}, t=${t.toFixed(1)}: sin suelo`);
        assert.ok(Math.abs(hit.floor - f) < 1, 'el suelo es el del túnel');
        assert.ok(hit.ceil - hit.floor > 2, 'cabe el jugador de pie');
        if (i > 1) assert.ok(w.inCave(x, f + 1, z), 'dentro de la cueva');
      }
    }
  }
});

test('la boca abre el terreno solo sobre el túnel (ni detrás de la boca ni lejos)', async () => {
  const w = await world('42');
  const caves = w.caves;
  for (const c of caves.caves.slice(0, 8)) {
    const [n0, n1, n2] = c.nodes;
    const ux = (n1.x - n0.x) / Math.hypot(n1.x - n0.x, n1.z - n0.z);
    const uz = (n1.z - n0.z) / Math.hypot(n1.x - n0.x, n1.z - n0.z);
    // detrás de la boca no hay túnel: el terreno sigue entero
    const bx = n0.x - ux * 2;
    const bz = n0.z - uz * 2;
    assert.equal(caves.openAt(bx, w.getHeightAt(bx, bz), bz), false);
    // a 15 m del eje, tampoco
    const fx = n1.x - uz * 15;
    const fz = n1.z + ux * 15;
    assert.equal(caves.openAt(fx, w.getHeightAt(fx, fz), fz), false);
    assert.equal(caves.holeAt(fx, w.getHeightAt(fx, fz), fz), false);
    // la boca sí está abierta en algún punto entre los primeros nodos
    let open = false;
    for (let t = 0.1; t <= 2 && !open; t += 0.1) {
      const a = t < 1 ? n0 : n1;
      const b = t < 1 ? n1 : n2;
      const k = t % 1;
      const x = a.x + (b.x - a.x) * k;
      const z = a.z + (b.z - a.z) * k;
      open = caves.openAt(x, w.getHeightAt(x, z), z);
    }
    assert.ok(open, `cueva ${c.id}: la boca se ve`);
    // lo recortado está siempre dentro de lo que cuenta como agujero
    for (let t = 0.1; t < 2; t += 0.1) {
      const a = t < 1 ? n0 : n1;
      const b = t < 1 ? n1 : n2;
      const x = a.x + (b.x - a.x) * (t % 1);
      const z = a.z + (b.z - a.z) * (t % 1);
      const y = w.getHeightAt(x, z);
      if (caves.openAt(x, y, z)) assert.ok(caves.holeAt(x, y, z));
    }
  }
});

test('contenido: carbón en la entrada, cobre más que hierro, diamante raro y flores luminosas', async () => {
  const total = { COAL_ORE: 0, COPPER_ORE: 0, IRON_ORE: 0, DIAMOND_ORE: 0, GLOW_FLOWER: 0, GOLD_ORE: 0, CRYSTAL_CLUSTER: 0 };
  for (const seed of ['42', '7']) {
    const w = await world(seed);
    for (const c of w.caves.caves) {
      const near = (o) => {
        let best = 0;
        let bd = Infinity;
        c.nodes.forEach((n, i) => {
          const d = Math.hypot(n.x - o.x, n.z - o.z);
          if (d < bd) { bd = d; best = i; }
        });
        return best;
      };
      for (const o of c.content) {
        assert.ok(o.type in total, o.type);
        total[o.type]++;
        if (o.type === 'COAL_ORE') assert.ok(near(o) <= 8, 'el carbón está cerca de la entrada');
        // dentro del túnel (no en la roca ni en el aire)
        const hit = w.caveFloorAt(o.x, o.z, o.y + 0.5);
        assert.ok(w.inCave(o.x, o.y + 0.5, o.z, -0.6) || hit, `${o.type} fuera del túnel`);
      }
    }
  }
  assert.ok(total.COAL_ORE > 20);
  assert.ok(total.COPPER_ORE > total.IRON_ORE * 1.5, `cobre ${total.COPPER_ORE} > hierro ${total.IRON_ORE}`);
  assert.ok(total.IRON_ORE > total.DIAMOND_ORE * 4, `hierro ${total.IRON_ORE} > diamante ${total.DIAMOND_ORE}`);
  assert.ok(total.DIAMOND_ORE >= 1);
  assert.ok(total.GOLD_ORE >= 1 && total.CRYSTAL_CLUSTER >= 1, `oro ${total.GOLD_ORE}, cristal ${total.CRYSTAL_CLUSTER} (P5)`);
  assert.ok(total.GOLD_ORE < total.COPPER_ORE, 'el oro es más raro que el cobre');
  assert.ok(total.GLOW_FLOWER > 40);
});

test('las menas son nodos de recurso de la cueva: se pican con pico y dan su material', async () => {
  const w = await world('42');
  const c = w.caves.caves[0];
  const ore = c.content.find((o) => o.type === 'COPPER_ORE');
  const node = w.resources.getNodesNear(ore.x, ore.z, 2).find((n) => n.type === 'COPPER_ORE');
  assert.ok(node, 'la mena es un nodo');
  assert.equal(node.cave, true);
  assert.ok(Math.abs(node.y - ore.y) < 0.01, 'a la altura de la cueva, no del terreno');
  const def = C.RESOURCE_TYPES.COPPER_ORE;
  assert.equal(def.BREAK.TOOL, 'MINE_SPEED');
  assert.equal(def.BREAK.ITEM, 'COPPER_ORE');
  assert.equal(C.RESOURCE_TYPES.COAL_ORE.BREAK.ITEM, 'COAL');
  assert.equal(C.RESOURCE_TYPES.IRON_ORE.BREAK.ITEM, 'IRON_ORE');
  assert.equal(C.RESOURCE_TYPES.DIAMOND_ORE.BREAK.ITEM, 'DIAMOND_ORE');
  assert.equal(C.RESOURCE_TYPES.GLOW_FLOWER.HARVEST.ITEM, 'GLOW_FLOWER');
  // Las colisiones de un nodo de la cueva no empujan a quien anda por la superficie.
  const surface = w.getHeightAt(node.x, node.z);
  const pos = { x: node.x + 0.1, y: surface, z: node.z };
  w.resources.resolveCollisions(pos, 0.4);
  assert.ok(Math.abs(pos.x - (node.x + 0.1)) < 1e-9, 'en la superficie no choca con la mena de abajo');
  const below = { x: node.x + 0.1, y: node.y, z: node.z };
  w.resources.resolveCollisions(below, 0.4);
  assert.ok(Math.hypot(below.x - node.x, below.z - node.z) > 0.3, 'en la cueva sí');
});

test('mismas cuevas con la misma semilla; otras con otra', async () => {
  const sum = (w) => w.caves.caves.map((c) => `${c.kind}:${c.mouth.x.toFixed(2)}:${c.nodes.length}`).join('|');
  const a = await world('42');
  const b = await homeWorld('42');
  assert.equal(sum(a), sum(b));
  assert.notEqual(sum(a), sum(await world('7')));
});

test('CaveSystem tolera un terreno sin sitios válidos (sin cuevas, sin colgarse)', () => {
  const caves = new CaveSystem({ config: C.CAVES });
  const flat = { sample: () => ({ height: 2, biomes: { PLAINS: 1 }, coast: 0 }), heightAt: () => 2 };
  const list = caves.generate({ seed: 1, terrain: flat, bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, spawn: { x: 0, z: 0 } });
  assert.equal(list.length, 0);
  assert.equal(caves.floorAt(10, 10, 0), null);
  assert.equal(caves.contains(10, 0, 10), false);
  assert.equal(caves.openAt(10, 2, 10), false);
});

test('la antorcha se fabrica con madera y carbón y se clava (una cada vez)', () => {
  assert.deepEqual(C.RECIPES.TORCH.INGREDIENTS, { WOOD: 1, COAL: 1 });
  assert.equal(C.ITEMS.TORCH.HOLD, true);
  assert.equal(C.ITEMS.TORCH.BUILD_PIECE, 'TORCH');
  assert.ok(C.BUILD.PIECES.TORCH);
});
