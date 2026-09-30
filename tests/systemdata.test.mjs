/**
 * Sistemas solares como datos (bloque 1a): parser seguro, validador,
 * migraciones, compilador y el Jardín del Edén en JSON.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSystem, errorReport } from '../js/systemdata/SystemLoader.js';
import { parseJsonSafely } from '../js/systemdata/SafeJson.js';
import { SYSTEM_SCHEMA, toJsonSchema } from '../js/systemdata/Schema.js';
import { LIMITS } from '../js/systemdata/Catalog.js';

const EDEN_TEXT = fs.readFileSync(new URL('../systems/jardin-del-eden.system.json', import.meta.url), 'utf8');
const LEGACY = JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-profiles.json', import.meta.url), 'utf8'));
const LEGACY_ID = { P1: 'MUNDO_0', P1M1: 'MOON_A', P1M2: 'MOON_B' };

const minimal = (extra = {}) => ({ schema_version: '1.0', name: 'Prueba', planets: [{ name: 'Uno', moons: [{ name: 'Satélite' }] }], ...extra });
const paths = (r) => r.errors.map((e) => e.path);

test('el Jardín del Edén se carga sin errores ni avisos', () => {
  const r = loadSystem(EDEN_TEXT);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.system.bodies.map((b) => [b.id, b.kind, b.name]), [
    ['P1', 'PLANET', 'El Jardín del Edén'], ['P1M1', 'MOON', 'Luna A'], ['P1M2', 'MOON', 'Luna B'],
  ]);
  assert.equal(r.system.homeId, 'P1');
});

test('el Edén en JSON reproduce exactamente los perfiles del planeta y las lunas de antes', () => {
  const { system } = loadSystem(EDEN_TEXT);
  for (const b of system.bodies) {
    const legacy = { ...LEGACY.PLANETS[LEGACY_ID[b.id]] };
    const compiled = JSON.parse(JSON.stringify(b.profile));
    for (const k of ['NAME', 'DATA']) {
      delete legacy[k];
      delete compiled[k];
    }
    assert.deepEqual(compiled, legacy, b.id);
    // El orden importa: los recursos y los rebaños se generan en este orden.
    for (const slot of Object.keys(legacy.RESOURCES.DENSITY)) {
      assert.deepEqual(Object.keys(compiled.RESOURCES.DENSITY[slot]), Object.keys(legacy.RESOURCES.DENSITY[slot]), `${b.id} ${slot}`);
    }
    assert.deepEqual(Object.keys(compiled.FAUNA.HERDS), Object.keys(legacy.FAUNA.HERDS));
  }
  // Las lunas en el cielo y en el espacio: mismo tamaño, distancia, velocidad y color.
  const C = LEGACY.CELESTIAL;
  const [, a, b] = system.bodies;
  assert.equal(system.bodies[0].radiusKm, C.PLANET_RADIUS_KM);
  for (const [m, p] of [[a, 'MOON_A'], [b, 'MOON_B']]) {
    assert.equal(m.radiusKm, C[`${p}_SIZE`]);
    assert.equal(m.orbit.distanceKm, C[`${p}_DISTANCE`]);
    assert.equal(m.orbit.speed, C[`${p}_SPEED`]);
    assert.equal(m.color, C[`${p}_COLOR`]);
    assert.equal(m.skySizeDeg, C[`${p}_SKY_SIZE_DEG`]);
  }
});

test('un sistema mínimo usa los valores por defecto (luna = desierto de cráteres)', () => {
  const r = loadSystem(minimal());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const [planet, moon] = r.system.bodies;
  assert.equal(planet.profile.BREATHABLE, true);
  assert.equal(planet.profile.HAS_SEA, true);
  assert.ok(planet.profile.FAUNA.HERDS.DEER > 0, 'un planeta con aire tiene la vida del Edén');
  assert.equal(moon.profile.KIND, 'MOON');
  assert.equal(moon.profile.BREATHABLE, false);
  assert.equal(moon.profile.HAS_SEA, false);
  assert.ok(moon.profile.TERRAIN.CRATERS.CHANCE > 0);
  assert.deepEqual(moon.profile.FAUNA.HERDS, {});
  assert.deepEqual(moon.profile.BUILD_SUBSTITUTE, { WOOD: 'STONE', WOOL: 'MINERAL' });
  assert.ok(moon.orbit.distanceKm > 0 && moon.orbit.periodHours > 0);
  assert.match(planet.profile.DATA.MOONS, /Satélite/);
});

test('la misma semilla da el mismo sistema; otra semilla cambia el matiz de las lunas por defecto', () => {
  const a = loadSystem(minimal({ seed: 7 })).system;
  const b = loadSystem(minimal({ seed: 7 })).system;
  const c = loadSystem(minimal({ seed: 8 })).system;
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.notEqual(a.bodies[1].profile.BIOMES.PLAINS.COLORS.GROUND, c.bodies[1].profile.BIOMES.PLAINS.COLORS.GROUND);
  assert.equal(loadSystem(minimal({ seed: 7 }), { seed: 99 }).system.seed, 99, 'la campaña impone su semilla');
});

test('las claves desconocidas se ignoran con un aviso (el archivo se usa igual)', () => {
  const data = minimal({ musica: 'gravedad al ritmo' });
  data.planets[0].physics = { gravity: 1, gravedad_musical: true };
  data.planets[0].Name2 = 'x';
  data.planets[0].sizee = 'huge';
  const r = loadSystem(data);
  assert.equal(r.ok, true);
  const w = r.warnings.map((x) => x.path);
  assert.ok(w.includes('musica'));
  assert.ok(w.includes('planets[0].physics.gravedad_musical'));
  assert.equal(r.system.bodies[0].profile.GRAVITY_SCALE, 1);
  assert.equal(r.data.musica, undefined, 'lo desconocido no pasa al sistema');
  const typo = r.warnings.find((x) => x.path === 'planets[0].sizee');
  assert.match(typo.message, /¿Querías decir "size"\?/);
});

test('los errores dicen dónde están y qué se esperaba', () => {
  const data = minimal();
  data.planets[0].physics = { gravity: 9, breathable: 'sí' };
  data.planets[0].terrain = { generator: 'volcanic', params: {} };
  data.planets[0].moons[0].orbit = { distance: '40' };
  data.planets[0].biomes = { low: { colors: { ground: 'verde' } } };
  data.planets[0].flora = [{ template: 'pine', biome: 'low' }];
  const r = loadSystem(data);
  assert.equal(r.ok, false);
  const p = paths(r);
  for (const path of [
    'planets[0].physics.gravity', 'planets[0].physics.breathable', 'planets[0].terrain.generator',
    'planets[0].moons[0].orbit.distance', 'planets[0].biomes.low.colors.ground', 'planets[0].flora[0].density',
  ]) assert.ok(p.includes(path), `falta el error en ${path}: ${p.join(' | ')}`);
  const g = r.errors.find((e) => e.path === 'planets[0].physics.gravity');
  assert.match(g.message, /entre 0\.05 y 3/);
  assert.match(r.errors.find((e) => e.path.endsWith('orbit.distance')).message, /quita las comillas/);
  const report = errorReport(r);
  assert.match(report, /planets\[0\]\.physics\.gravity/);
});

test('campos obligatorios y listas con límites', () => {
  assert.deepEqual(paths(loadSystem({ schema_version: '1.0', planets: [{ name: 'x' }] })), ['name']);
  assert.ok(paths(loadSystem({ name: 'x', planets: [] })).includes('planets'));
  const many = minimal();
  many.planets[0].moons = Array.from({ length: LIMITS.MOONS + 1 }, (_, i) => ({ name: `L${i}` }));
  assert.ok(paths(loadSystem(many)).includes('planets[0].moons'));
  const long = minimal();
  long.planets[0].name = 'x'.repeat(LIMITS.NAME_LENGTH + 1);
  assert.ok(paths(loadSystem(long)).includes('planets[0].name'));
});

test('versiones del formato', () => {
  const r = loadSystem({ name: 'x', planets: [{ name: 'y' }] });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.path === 'schema_version'));
  assert.equal(loadSystem(minimal({ schema_version: '2.0' })).ok, false);
  assert.equal(loadSystem(minimal({ schema_version: 1 })).ok, true);
  assert.equal(loadSystem(minimal({ schema_version: 'uno' })).ok, false);
});

// ---- Corpus malicioso -------------------------------------------------------

test('prototype pollution: __proto__ y constructor se descartan', () => {
  const text = '{"name":"x","__proto__":{"polluted":1},"planets":[{"name":"y","constructor":{"prototype":{"polluted":2}}}]}';
  const r = loadSystem(text);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  assert.ok(r.warnings.some((w) => /__proto__/.test(w.message)));
});

test('solo JSON: código, JSON5 y textos sueltos se rechazan sin ejecutarse', () => {
  globalThis.__pwned = false;
  for (const text of [
    '(() => { globalThis.__pwned = true; return {} })()',
    '{ name: "x", planets: [] }',
    "{'name':'x'}",
    'Aquí tienes tu sistema: {"name":"x"}',
    '{"name":"x","planets":[{"name":"y"}]} // comentario',
    '{"name": function(){ return 1 }}',
    '',
    '[1,2,3]',
  ]) {
    const r = loadSystem(text);
    assert.equal(r.ok, false, text);
    assert.ok(r.errors[0].message.length > 5);
  }
  assert.equal(globalThis.__pwned, false);
});

test('los textos con HTML o URLs siguen siendo texto (no se interpretan)', () => {
  const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const r = loadSystem(minimal({ description: evil, planets: [{ name: '<b>Edén</b>', description: 'https://evil.example/x.js' }] }));
  assert.equal(r.ok, true);
  assert.equal(r.system.description, evil);
  assert.equal(r.system.bodies[0].name, '<b>Edén</b>');
});

test('el bloque ```json que añade Claude se quita con un aviso', () => {
  const r = loadSystem('```json\n{"name":"x","planets":[{"name":"y"}]}\n```');
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /```/.test(w.message)));
});

test('archivos extremos se rechazan rápido y sin colgarse', () => {
  const t0 = Date.now();
  const big = `{"name":"x","description":"${'a'.repeat(LIMITS.FILE_BYTES)}","planets":[{"name":"y"}]}`;
  assert.match(loadSystem(big).errors[0].message, /KB/);
  const deep = `{"name":"x","planets":[{"name":"y"}],"z":${'['.repeat(100000)}${']'.repeat(100000)}}`;
  assert.match(parseJsonSafely(deep, { ...LIMITS, FILE_BYTES: 1e7 }).errors[0].message, /anidado/);
  const wide = `{"name":"x","planets":[{"name":"y"}],"z":[${Array(30000).fill(0).join(',')}]}`;
  assert.match(loadSystem(wide).errors[0].message, /Demasiados datos/);
  assert.equal(loadSystem('{"name":"x","planets":[{"name":"y","radius_km":1e400}]}').ok, false, 'Infinity');
  assert.ok(Date.now() - t0 < 2000);
});

test('el sistema más grande permitido se compila deprisa', () => {
  const flora = Array.from({ length: LIMITS.FLORA }, (_, i) => ({ template: 'broadleaf_tree', biome: ['low', 'mid', 'high'][i % 3], density: 0.4 }));
  const fauna = Array.from({ length: LIMITS.FAUNA }, () => ({ template: 'deer', herds: 30 }));
  const body = (name) => ({ name, size: 'huge', flora, fauna });
  const data = {
    schema_version: '1.0', name: 'Grande', seed: 1,
    planets: Array.from({ length: LIMITS.PLANETS }, (_, i) => ({ ...body(`P${i}`), moons: Array.from({ length: LIMITS.MOONS }, (_, j) => body(`L${i}${j}`)) })),
  };
  const t0 = Date.now();
  const r = loadSystem(JSON.stringify(data));
  assert.equal(r.ok, true, JSON.stringify(r.errors.slice(0, 3)));
  assert.equal(r.system.bodies.length, LIMITS.PLANETS * (1 + LIMITS.MOONS));
  for (const b of r.system.bodies) assert.ok(Object.values(b.profile.FAUNA.HERDS).reduce((a, n) => a + n, 0) <= LIMITS.HERDS_PER_BODY);
  assert.ok(Date.now() - t0 < 500);
});

test('el esquema se exporta a JSON Schema cerrado', () => {
  const js = toJsonSchema(SYSTEM_SCHEMA);
  assert.equal(js.additionalProperties, false);
  assert.deepEqual(js.required, ['name', 'planets']);
  const planet = js.properties.planets.items;
  assert.equal(planet.additionalProperties, false);
  assert.ok(planet.properties.terrain.properties.generator.enum.includes('island'));
  assert.equal(planet.properties.moons.maxItems, LIMITS.MOONS);
});

// ---- Juego dirigido por el sistema (sin identificadores fijos) ----------------

test('ningún módulo del juego usa los identificadores fijos de antes', async () => {
  const { readdirSync, readFileSync, statSync } = fs;
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = `${dir}/${f}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) files.push(p);
    }
  };
  walk(new URL('../js', import.meta.url).pathname);
  for (const f of files) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(code, /['"`](MUNDO_0|MOON_A|MOON_B)['"`]|MUNDO 0/, f);
  }
});

test('nombres con preposición y teclas de rumbo según el sistema', async () => {
  const { withPrep, SolarSystem } = await import('../js/systemdata/SolarSystem.js');
  assert.equal(withPrep('en', 'El Jardín del Edén'), 'en el Jardín del Edén');
  assert.equal(withPrep('de', 'El Jardín del Edén'), 'del Jardín del Edén');
  assert.equal(withPrep('a', 'El Jardín del Edén'), 'al Jardín del Edén');
  assert.equal(withPrep('en', 'Luna A'), 'en la Luna A');
  assert.equal(withPrep('a', 'Nerea'), 'a Nerea');
  assert.equal(withPrep('', 'La Roja'), 'la Roja');
  const eden = new SolarSystem(loadSystem(EDEN_TEXT).system);
  assert.deepEqual(eden.autopilotTargets().map((t) => `${t.key}:${t.id}`), ['1:P1', '2:P1M1', '3:P1M2', '4:METEOR']);
  const lonely = new SolarSystem(loadSystem({ name: 'x', planets: [{ name: 'Solo' }] }).system);
  assert.deepEqual(lonely.autopilotTargets().map((t) => t.id), ['P1', 'METEOR']);
  assert.equal(lonely.moons.length, 0);
});
