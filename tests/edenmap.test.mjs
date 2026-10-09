/**
 * v1.23–1.24: el Edén es un mapa diseñado (maps/eden). Siempre el mismo: relieve, agua,
 * lugares de la historia, cuevas con personalidad y lugares con nombre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { labLayout } from '../js/story/LabLayout.js';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { WorldManager } = await import('../js/world/WorldManager.js');
const { MapData } = await import('../js/world/map/MapData.js');
const { Landmarks } = await import('../js/world/map/Landmarks.js');
const { StaticColliders } = await import('../js/story/StaticColliders.js');

const dir = new URL('../maps/eden/', import.meta.url);
const map = MapData.fromFiles(JSON.parse(fs.readFileSync(new URL('eden.map.json', dir))), zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));

function eden(seed) {
  const DUNGEON = (sites) => {
    const L = labLayout(sites.RESEARCH_CENTER?.[0]);
    return { x: L.hatch.x, z: L.hatch.z, yaw: L.heading };
  };
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, maps: { [EDEN.homeId]: map }, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: 11, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS, DUNGEON },
    },
  });
  const w = worlds.home;
  w.generate(String(seed));
  return w;
}
const w = eden(42);

test('mapa: tamaño, alturas y el mismo mundo con cualquier semilla', () => {
  assert.equal(w.worldSize, 4096);
  const other = eden(999);
  for (const [x, z] of [[0, 0], [-500, -1200], [800, 300], [-1400, 600]]) assert.equal(w.getHeightAt(x, z), other.getHeightAt(x, z));
  assert.deepEqual(w.getSpawnPoint(), other.getSpawnPoint());
  assert.ok(map.meta.heightRange[1] > 150, 'hay montañas altas');
});

test('lugares de la historia en tierra firme, fuera del agua', () => {
  const sp = w.getSpawnPoint();
  assert.ok(w.getHeightAt(sp.x, sp.z) > 3);
  for (const kind of ['HERMIT_TOWER', 'NODE_ARENA', 'RESEARCH_CENTER', 'GOBLIN_BASE', 'GOLEMS']) {
    const list = w.getSites(kind);
    assert.ok(list.length > 0, kind);
    for (const s of list) {
      assert.ok(w.getHeightAt(s.x, s.z) > 1, `${kind} sobre el mar`);
      assert.ok(!w.isFreshWaterAt(s.x, s.z), `${kind} en el agua`);
    }
  }
  const L = w.getLandingSite();
  assert.ok(w.getHeightAt(L.x, L.z) > map.meta.snowLine - 20, 'la nave, en lo alto de la cordillera');
  assert.ok(w.caves.dungeon, 'la mazmorra bajo el centro de investigación');
});

test('agua dulce: lagos y ríos con su nivel; el lago helado se pisa', () => {
  assert.equal(w.waterSurfaceAt(40, -80), 14);
  assert.ok(w.isFreshWaterAt(40, -80));
  assert.ok(w.freshLevelNear(-150, -540, 6) > 40, 'el río baja de la montaña con su propio nivel');
  assert.equal(w.waterSurfaceAt(-250, -1010), null, 'el Lago Helado es hielo');
});

test('cuevas diseñadas: seis, con salas con nombre, roca encima y suelo transitable', () => {
  const groups = new Set(w.caves.caves.filter((c) => c.authored).map((c) => c.group));
  assert.equal(groups.size, 6);
  for (const c of w.caves.caves.filter((c) => c.authored)) {
    c.nodes.forEach((n, i) => {
      const f = w.caveFloorAt(n.x, n.z, n.floor + 0.2);
      assert.ok(f && Math.abs(f.floor - n.floor) < 0.6, `${c.group} nodo ${i}: suelo`);
      if (i >= 3 || c.kind === 'BRANCH') assert.ok(w.getHeightAt(n.x, n.z) - (n.floor + 1.55 * n.r) > 3, `${c.group} nodo ${i}: roca encima`);
    });
  }
  const rooms = w.caves.caves.flatMap((c) => c.nodes.filter((n) => n.name));
  assert.ok(rooms.length >= 15);
  const r = rooms.find((n) => n.name === 'Salón Amatista');
  assert.equal(w.caves.placeAt(r.x, r.floor + 1, r.z).room, 'Salón Amatista');
});

test('regiones con nombre y lugares con colisión', () => {
  assert.equal(w.getRegionAt(-120, 470).name, 'Valle del Despertar');
  assert.equal(w.getRegionAt(-900, 100).name, 'Bosque Antiguo');
  const col = new StaticColliders();
  const L = new Landmarks({ map, heightAt: (x, z) => w.getHeightAt(x, z), colliders: col, root: new THREE.Group() });
  assert.ok(col.get('poi:EL_ABUELO') && col.get('poi:FARO_ROTO') && col.get('poi:PUENTE'));
  assert.ok(col.surfaceAt(-60, -262, 200) > w.freshLevelNear(-60, -262, 3), 'el puente pasa por encima del río');
  assert.ok(L.isWarmAt(530, 53, -720), 'las termas calientan');
});
