/**
 * Sistema Kappa: mundo oceánico, desierto de dunas y "solo mar" con ola gigante.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSystem } from '../js/systemdata/SystemLoader.js';
import { waveState, waveHeightAt, waveProfile, WAVE_MARGIN } from '../js/world/WaveMath.js';

const KAPPA = loadSystem(fs.readFileSync(new URL('../systems/kappa.system.json', import.meta.url), 'utf8'), { seed: 7 });
const byName = (n) => KAPPA.system.bodies.find((b) => b.profile.NAME === n);

test('Kappa: Thalassa oceánica, Ferrum desierto de dunas, Pontos solo mar con ola', () => {
  assert.equal(KAPPA.ok, true);
  const thalassa = byName('Thalassa').profile;
  assert.ok(thalassa.TERRAIN.ISLANDS && !thalassa.TERRAIN.ISLANDS.NO_LAND, 'Thalassa tiene islas');
  const ferrum = byName('Ferrum').profile;
  assert.ok(ferrum.TERRAIN.DUNES, 'Ferrum tiene dunas');
  assert.equal(ferrum.BREATHABLE, false);
  assert.equal(ferrum.HAS_SEA, false);
  const pontos = byName('Pontos').profile;
  assert.equal(pontos.TERRAIN.ISLANDS.NO_LAND, true, 'Pontos: ni una isla');
  assert.equal(pontos.WAVE.PERIOD_HOURS, 24);
  assert.ok(!thalassa.WAVE && !ferrum.WAVE, 'solo Pontos tiene ola');
  // La clave desconocida se ignora con aviso; las peticiones no soportadas se conservan.
  assert.ok(KAPPA.warnings.some((w) => w.path.endsWith('musica_ambiental')));
  assert.equal(KAPPA.unsupported.length, 1);
});

test('la ola gigante: una vez por periodo, cruza la región y vuelve a la calma', () => {
  const W = { PERIOD_HOURS: 24, HOUR: 15, HEIGHT: 20, SPEED: 25, WARNING_HOURS: 1, ANGLE: 0 };
  const size = 5120;
  const hps = 24 / (20 * 60); // día de 20 minutos reales
  const before = waveState(W, 14.5, size, hps);
  assert.equal(before.active, false);
  assert.ok(Math.abs(before.untilHours - 0.5) < 1e-9);
  const start = waveState(W, 15, size, hps);
  assert.equal(start.active, true);
  assert.equal(start.crest, -(size / 2 + WAVE_MARGIN), 'entra por fuera de la región');
  // Cruza (size + 2·margen) m a 25 m/s reales.
  const crossHours = ((size + 2 * WAVE_MARGIN) / 25) * hps;
  const mid = waveState(W, 15 + crossHours / 2, size, hps);
  assert.ok(Math.abs(mid.crest) < 1e-6, 'a mitad de camino pasa por el centro');
  assert.ok(Math.abs(waveHeightAt(W, mid, 0, 0) - 20) < 1e-9, 'en la cresta el agua sube HEIGHT');
  assert.ok(waveHeightAt(W, mid, 200, 0) < 0.5, 'lejos del frente, calma');
  assert.equal(waveState(W, 15 + crossHours + 0.01, size, hps).active, false);
  // Se repite cada 24 h (también días después).
  assert.equal(waveState(W, 15 + 24 * 5 + crossHours / 2, size, hps).active, true);
  assert.equal(waveState(W, 15 + 24 * 5, size, hps).cycle, 5);
  // Frente empinado, espalda larga.
  assert.ok(waveProfile(20, 20) < waveProfile(-20, 20));
});
