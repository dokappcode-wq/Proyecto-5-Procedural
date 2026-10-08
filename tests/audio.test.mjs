/**
 * v1.22 (P1): sonido procedural. Partes puras: volúmenes guardados (entrada no fiable),
 * superficie de los pasos, sonido posicional y música según el sitio.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVolumes, DEFAULT_VOLUMES, biomeSurface, surfaceFor, strideLength, spatialize, chooseMood, mtof } from '../js/audio/AudioMath.js';
import { MOODS } from '../js/audio/Music.js';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { GameEvents } from '../js/core/GameEvents.js';

test('volúmenes: JSON válido, claves conocidas y valores 0…1', () => {
  const v = parseVolumes('{"master":0.5,"sfx":2,"music":-1,"ambient":"x","muted":true,"evil":"<script>"}');
  assert.equal(v.master, 0.5);
  assert.equal(v.sfx, 1);
  assert.equal(v.music, 0);
  assert.equal(v.ambient, DEFAULT_VOLUMES.ambient);
  assert.equal(v.muted, true);
  assert.equal('evil' in v, false);
});

test('volúmenes: entrada rota, enorme o de otro tipo → valores por defecto', () => {
  for (const bad of [null, undefined, '', '{', '[1,2]', 'null', '42', '"texto"', `{"master":${'9'.repeat(600)}}`, '{"master":NaN}', '{"__proto__":{"master":0}}']) {
    const v = parseVolumes(bad);
    for (const k of ['master', 'sfx', 'ambient', 'music']) {
      assert.ok(v[k] >= 0 && v[k] <= 1, `${bad} → ${k}`);
    }
    assert.equal(typeof v.muted, 'boolean');
  }
  assert.deepEqual(parseVolumes('{"master":Infinity}'), { ...DEFAULT_VOLUMES });
});

test('pasos: superficie según agua, nave, construcción, cueva y bioma', () => {
  assert.equal(surfaceFor({ swimming: true, aboard: true }), 'water');
  assert.equal(surfaceFor({ aboard: true, inCave: true }), 'metal');
  assert.equal(surfaceFor({ structure: 'wood', inCave: true }), 'wood');
  assert.equal(surfaceFor({ inCave: true, biome: 'PLAINS' }), 'stone');
  assert.equal(surfaceFor({ biome: 'FROZEN_MOUNTAINS' }), 'snow');
  assert.equal(surfaceFor({ biome: 'BEACH' }), 'sand');
  assert.equal(surfaceFor({ biome: 'MOUNTAINS' }), 'stone');
  assert.equal(surfaceFor({ biome: 'FOREST' }), 'grass');
  // Biomas de sistemas importados: por el nombre.
  assert.equal(biomeSurface('RED_DUNES'), 'sand');
  assert.equal(biomeSurface('ice_shelf'), 'snow');
  assert.equal(biomeSurface('BASALT_FIELDS'), 'stone');
  assert.equal(biomeSurface(undefined), 'grass');
  assert.ok(strideLength({ running: true }) > strideLength({}));
  assert.ok(strideLength({ crouching: true }) < strideLength({}));
});

test('sonido posicional: lado, caída con la distancia y silencio lejos', () => {
  // Mirando hacia −Z: +X está a la derecha.
  const right = spatialize(10, 0, 0, -1);
  const left = spatialize(-10, 0, 0, -1);
  assert.ok(right.pan > 0.5 && left.pan < -0.5);
  // Mirando hacia +X: +Z está a la derecha.
  assert.ok(spatialize(0, 10, 1, 0).pan > 0.5);
  const near = spatialize(2, 0, 0, -1).gain;
  const mid = spatialize(15, 0, 0, -1).gain;
  assert.ok(near > mid && mid > 0);
  assert.equal(spatialize(80, 0, 0, -1, { max: 60 }).gain, 0);
  assert.equal(spatialize(0, 0, 0, -1).pan, 0);
  assert.ok(Number.isFinite(spatialize(5, 5, 0, 0).pan)); // mirada nula: sin NaN
});

test('música: ánimo según el sitio y definiciones completas', () => {
  assert.equal(chooseMood({ boss: true, cave: true, night: true }), 'BOSS');
  assert.equal(chooseMood({ space: true }), 'SPACE');
  assert.equal(chooseMood({ title: true }), 'SPACE');
  assert.equal(chooseMood({ cave: true, night: true }), 'CAVE');
  assert.equal(chooseMood({ night: true }), 'NIGHT');
  assert.equal(chooseMood({}), 'DAY');
  for (const [id, m] of Object.entries(MOODS)) {
    assert.ok(m.bpm > 30 && m.bpm < 200, id);
    assert.ok(m.scale.length >= 5, id);
    assert.ok(m.chords || m.drone, id);
    if (!m.continuous) assert.ok(m.play && m.rest, `${id}: frases y descansos`);
  }
  assert.ok(Math.abs(mtof(69) - 440) < 1e-9);
  assert.ok(Math.abs(mtof(81) - 880) < 1e-9);
});

test('tecla N para silenciar y evento del jefe', () => {
  assert.deepEqual(C.INPUT.KEYBINDINGS.MUTE, ['KeyN']);
  const used = Object.entries(C.INPUT.KEYBINDINGS).filter(([k, v]) => k !== 'MUTE' && v.includes('KeyN'));
  assert.deepEqual(used, []);
  assert.equal(typeof GameEvents.BOSS_EVENT, 'string');
});
