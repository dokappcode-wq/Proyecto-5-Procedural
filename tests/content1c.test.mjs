/**
 * Bloque 1c: generadores de terreno nuevos, nadar/bucear y vida parametrizada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameConfig as cfg } from '../js/config/GameConfig.js';
import { loadSystem } from '../js/systemdata/SystemLoader.js';
import { regionSize, TERRAIN_GENERATORS } from '../js/systemdata/Catalog.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { TerrainGenerator } from '../js/world/TerrainGenerator.js';
import { BiomeSystem } from '../js/world/BiomeSystem.js';
import { resolveSpecies } from '../js/animals/SpeciesVariants.js';

const FIXTURE = loadSystem(fs.readFileSync(new URL('./fixtures/mundos-1c.system.json', import.meta.url), 'utf8'));

function terrainOf(body, seedText = '42') {
  const P = body.profile;
  const seed = new WorldSeed(seedText, cfg.WORLD.SUB_SEEDS);
  const biomes = new BiomeSystem({ definitions: P.BIOMES, distribution: P.BIOME_DISTRIBUTION, seed: seed.sub.biome });
  const ws = regionSize(body.regionKm);
  return { t: new TerrainGenerator({ profile: P.TERRAIN, biomes, seed: seed.sub.terrain, worldSize: ws, edgeMargin: cfg.WORLD.EDGE_MARGIN }), ws };
}

function landShare(body) {
  const { t, ws } = terrainOf(body);
  const half = ws / 2 - cfg.WORLD.EDGE_MARGIN;
  const step = ws / 100;
  let land = 0;
  let n = 0;
  for (let x = -half; x <= half; x += step) for (let z = -half; z <= half; z += step, n++) if (t.heightAt(x, z) > 0) land++;
  return { share: land / n, center: t.heightAt(0, 0) };
}

const planet = (generator, extra = {}) => loadSystem({ name: 'T', planets: [{ name: 'X', size: 'medium', terrain: { generator }, ...extra }] }).system.bodies[0];

test('los generadores del catálogo: cuánta tierra hay y siempre tierra en el centro', () => {
  assert.deepEqual(Object.keys(TERRAIN_GENERATORS).sort(), ['archipelago', 'cratered', 'dunes', 'highlands', 'island', 'ocean_world']);
  const arch = landShare(planet('archipelago'));
  const ocean = landShare(planet('ocean_world'));
  assert.ok(arch.share > 0.25 && arch.share < 0.6, `archipiélago ${arch.share}`);
  assert.ok(ocean.share < 0.25, `océano ${ocean.share}`);
  assert.ok(arch.center > 1 && ocean.center > 1, 'el centro (inicio y nave) es tierra');
  for (const g of ['island', 'highlands', 'dunes']) assert.ok(landShare(planet(g)).share > 0.95, g);
  const fewer = landShare(planet('archipelago', { terrain: { generator: 'archipelago', params: { land_fraction: 0.1 } } }));
  assert.ok(fewer.share < arch.share, 'land_fraction controla la tierra');
});

test('dunas: crestas regulares; altiplano: mesetas escalonadas', () => {
  const { t } = terrainOf(planet('dunes', { terrain: { generator: 'dunes', params: { relief: 0, mountains: 0, roughness: 0, dune_height: 10, dune_spacing: 40 } } }));
  const line = [];
  for (let d = -200; d <= 200; d += 2) line.push(t.heightAt(d * Math.cos(0.6), d * Math.sin(0.6)));
  const range = Math.max(...line) - Math.min(...line);
  assert.ok(range > 4, `las dunas tienen relieve (${range.toFixed(1)} m)`);
  const plateau = planet('highlands').profile.TERRAIN.TERRACES;
  assert.ok(plateau.STEP > 0 && plateau.SHARPNESS > 1);
  // Sin mar, las zonas hundidas del archipiélago quedan secas.
  assert.equal(planet('archipelago', { water: { sea: false } }).profile.TERRAIN.ISLANDS.FLOOR, 2);
});

test('el desierto de dunas es dorado si no se dan colores', () => {
  assert.equal(planet('dunes').profile.BIOMES.PLAINS.COLORS.GROUND, 0xe3c48a);
  assert.equal(planet('island').profile.BIOMES.PLAINS.COLORS.GROUND, 0x86b85a);
});

test('nadar y bucear: el archivo solo los activa y ajusta', () => {
  assert.equal(planet('island').profile.FLUID, undefined, 'sin ajustes: valores del motor (se nada y se bucea)');
  const [, , , hondo] = FIXTURE.system.bodies;
  assert.deepEqual(hondo.profile.FLUID, { SWIM: true, DIVE: false, VISIBILITY: 25 });
  assert.deepEqual(FIXTURE.system.bodies[0].profile.FLUID, { SWIM: true, DIVE: true, VISIBILITY: 40 });
});

test('fauna con nombre, tamaño, color, carácter y bioma propios', () => {
  assert.equal(FIXTURE.ok, true, JSON.stringify(FIXTURE.errors));
  const F = FIXTURE.system.bodies[0].profile.FAUNA;
  assert.deepEqual(Object.keys(F.HERDS), ['P1:GOAT:1', 'P1:COW:2', 'DEER'], 'las variantes tienen clave propia del cuerpo');
  const goat = resolveSpecies('P1:GOAT:1', F, cfg.ANIMALS.SPECIES);
  assert.equal(goat.base, 'GOAT');
  assert.equal(goat.def.NAME, 'Saltarrocas');
  assert.equal(goat.def.NAME_PLURAL, 'Saltarrocas');
  assert.equal(goat.def.COLORS.BODY, 0xd8b0f0);
  assert.ok(goat.def.SCALE[1] < cfg.ANIMALS.SPECIES.GOAT.SCALE[1]);
  assert.ok(goat.def.TEMPERAMENT_WEIGHTS.CURIOUS > 0.5);
  const cow = resolveSpecies('P1:COW:2', F, cfg.ANIMALS.SPECIES);
  assert.ok(cow.def.HEALTH > cfg.ANIMALS.SPECIES.COW.HEALTH);
  assert.ok(cow.def.HIT_REACTION_WEIGHTS.FIGHT > 0.8);
  assert.deepEqual(cow.def.BIOMES, { FOREST: 1, PLAINS: 0.3 });
  assert.equal(resolveSpecies('DEER', F, cfg.ANIMALS.SPECIES).def, cfg.ANIMALS.SPECIES.DEER, 'sin ajustes: la plantilla tal cual');
  assert.equal(cfg.ANIMALS.SPECIES.COW.NAME, 'Vaca', 'la configuración del motor no cambia');
});

test('flora con color y tamaño propios (y nada si no se piden)', () => {
  const p = FIXTURE.system.bodies[0].profile;
  assert.equal(p.PROP_COLORS.LEAVES, 0xd06a2a);
  assert.equal(p.PROP_COLORS.APPLE_LEAVES, 0x8a3fa0);
  assert.equal(p.PROP_COLORS.APPLE, 0xffd23a);
  assert.deepEqual(p.RESOURCES.SIZE, { TREE: 1.6 });
  const plain = planet('island').profile;
  assert.equal(plain.PROP_COLORS, undefined);
  assert.equal(plain.RESOURCES.SIZE, undefined);
});

test('errores claros en los campos nuevos', () => {
  const r = loadSystem({ name: 'T', planets: [{ name: 'X', fauna: [{ template: 'cow', herds: 2, temperament: 'feroz', size: 9 }], water: { visibility_m: 1 } }] });
  assert.equal(r.ok, false);
  const paths = r.errors.map((e) => e.path);
  for (const p of ['planets[0].fauna[0].temperament', 'planets[0].fauna[0].size', 'planets[0].water.visibility_m']) assert.ok(paths.includes(p), p);
  assert.match(r.errors.find((e) => e.path.endsWith('temperament')).message, /calm, shy, curious, aggressive/);
});
