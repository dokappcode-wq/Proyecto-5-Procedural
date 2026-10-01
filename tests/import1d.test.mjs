/**
 * Bloque 1d: importar sistemas (almacén, vista previa, guía del formato).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SystemStore, importIdFromParam, makeSystemId, IMPORT_ID_RE, STORE_LIMITS } from '../js/systemdata/SystemStore.js';
import { loadSystem, errorReport } from '../js/systemdata/SystemLoader.js';
import { previewSystem } from '../js/systemdata/SystemPreview.js';
import { formatGuide, GUIDE_EXAMPLE } from '../js/systemdata/FormatGuide.js';
import { TERRAIN_GENERATORS, LIMITS } from '../js/systemdata/Catalog.js';

const KAPPA_TEXT = fs.readFileSync(new URL('../systems/kappa.system.json', import.meta.url), 'utf8');

test('?system=import:<id>: solo identificadores seguros', () => {
  assert.equal(importIdFromParam('import:sistema-kappa-0a1b'), 'sistema-kappa-0a1b');
  for (const bad of ['kappa', 'import:', 'import:../x', 'import:a/b', 'import:<script>', 'import:ABC', `import:${'a'.repeat(49)}`, null, 42]) {
    assert.equal(importIdFromParam(bad), null, String(bad));
  }
  const id = makeSystemId('Sistema Ñandú: «Ü»   2!', () => 0.5);
  assert.equal(id, 'sistema-nandu-u-2-8000');
  assert.ok(IMPORT_ID_RE.test(id));
  assert.ok(IMPORT_ID_RE.test(makeSystemId('<img src=x onerror=alert(1)>')));
  assert.ok(IMPORT_ID_RE.test(makeSystemId('')));
});

test('almacén (memoria): guardar, listar, leer y borrar', async () => {
  const store = new SystemStore({ indexedDB: null });
  assert.equal(store.persistent, false);
  const a = await store.save({ name: 'Sistema Kappa', description: 'd', planets: 4, text: KAPPA_TEXT });
  const b = await store.save({ name: 'Sistema Kappa', description: 'otra copia', planets: 4, text: KAPPA_TEXT });
  assert.notEqual(a.id, b.id, 'dos copias con el mismo nombre no se pisan');
  const list = await store.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].text, undefined, 'la lista no lleva el texto');
  const rec = await store.get(a.id);
  assert.equal(rec.text, KAPPA_TEXT);
  assert.equal(await store.get('../../etc'), null);
  await store.remove(a.id);
  assert.equal((await store.list()).length, 1);
  await assert.rejects(store.save({ name: 'X', text: 'x'.repeat(LIMITS.FILE_BYTES + 1) }), /demasiado grande/);
});

test('almacén: tope de sistemas guardados', async () => {
  const store = new SystemStore({ indexedDB: null });
  for (let i = 0; i < STORE_LIMITS.SYSTEMS; i++) await store.save({ name: `S${i}`, planets: 1, text: '{}' });
  await assert.rejects(store.save({ name: 'uno más', planets: 1, text: '{}' }), /borra alguno/);
});

test('vista previa: planetas, lunas, tamaños, generadores, avisos y peticiones no soportadas', () => {
  const p = previewSystem(loadSystem(KAPPA_TEXT));
  assert.equal(p.name, 'Sistema Kappa');
  assert.deepEqual(p.planets.map((x) => x.name), ['Aurora', 'Thalassa', 'Pontos', 'Ferrum']);
  assert.equal(p.moons, 4);
  const pontos = p.planets[2];
  assert.equal(pontos.generator, TERRAIN_GENERATORS.open_ocean.label);
  assert.equal(pontos.size, 'Mediano');
  assert.deepEqual(pontos.wave, { everyHours: 24, heightM: 20 });
  assert.equal(p.planets[3].breathable, false);
  assert.equal(p.planets[1].moons[0].name, 'Nerea');
  assert.ok(p.warnings.some((w) => w.includes('musica_ambiental')));
  assert.equal(p.unsupported.length, 1);
});

test('errores listos para Claude', () => {
  const r = loadSystem('{"name": "Malo", "planets": [{"name": "A", "size": "gigantesco", "physics": {"gravity": 9}}]}');
  assert.equal(r.ok, false);
  const report = errorReport(r);
  assert.match(report, /^Mi archivo de sistema solar para Mundo Cero tiene estos errores/);
  assert.match(report, /planets\[0\]\.size/);
  assert.match(report, /planets\[0\]\.physics\.gravity/);
  // Texto con HTML: se valida como texto, sin interpretarlo (el panel usa textContent).
  const html = loadSystem('{"name": "<img src=x onerror=alert(1)>", "planets": [{"name": "<script>alert(1)</script>"}]}');
  assert.equal(html.ok, true);
  assert.equal(previewSystem(html).planets[0].name, '<script>alert(1)</script>');
});

test('guía del formato: cubre todos los generadores y su ejemplo es válido', () => {
  const g = formatGuide();
  for (const id of Object.keys(TERRAIN_GENERATORS)) assert.ok(g.includes(`- ${id} (`), id);
  for (const key of ['planets[].water.giant_wave.height_m', 'planets[].moons[].name', 'unsupported_requests']) assert.ok(g.includes(key), key);
  assert.ok(g.length < LIMITS.FILE_BYTES);
  const r = loadSystem(GUIDE_EXAMPLE);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.warnings.length, 0, JSON.stringify(r.warnings));
});
