/**
 * Tests de las FASES 10 (temperatura) y 11 (día/noche) y del catálogo de lunas. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { TimeSystem } from '../js/time/TimeSystem.js';
import { TemperatureSystem } from '../js/player/TemperatureSystem.js';
import { createCelestialCatalog, orbitPosition } from '../js/celestial/CelestialCatalog.js';
import { WorldSeed } from '../js/world/WorldSeed.js';
import { EDEN, HOME } from './helpers/eden.mjs';

const T = GameConfig.TIME;
const C = GameConfig.TEMPERATURE;
const BIOMES = HOME.BIOMES;
const secondsPerHour = (T.DAY_LENGTH_MINUTES * 60) / 24;

// ---- Tiempo --------------------------------------------------------------------

test('el reloj empieza a START_HOUR y avanza según DAY_LENGTH_MINUTES', () => {
  const time = new TimeSystem({ config: T, events: new EventBus() });
  assert.equal(time.day, 1);
  assert.equal(time.hour, T.START_HOUR);
  for (let i = 0; i < 600; i++) time.update(secondsPerHour / 600); // una hora de juego
  assert.ok(Math.abs(time.hour - (T.START_HOUR + 1)) < 1e-6);
  assert.equal(time.clockText, `${String(T.START_HOUR + 1).padStart(2, '0')}:00`);
});

test('el sol está arriba de día y bajo el horizonte de noche; el día cambia a medianoche', () => {
  const time = new TimeSystem({ config: T, events: new EventBus() });
  time.setTime((T.SUNRISE_HOUR + T.SUNSET_HOUR) / 2);
  assert.ok(time.sunHeight > 0.8, 'mediodía: sol alto');
  assert.ok(time.daylight > 0.99 && time.nightFactor < 0.01);
  time.setTime(1);
  assert.ok(time.sunHeight < -0.5, 'madrugada: sol bajo el horizonte');
  assert.ok(time.daylight < 0.01 && time.nightFactor > 0.99 && time.isNight);
  time.setTime(23.5);
  time.advance(1);
  assert.equal(time.day, 2);
  assert.ok(Math.abs(time.hour - 0.5) < 1e-6);
  const dir = time.getSunDirection({});
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y, dir.z) - 1) < 1e-9, 'dirección unitaria');
});

test('dormir adelanta el reloj y los periodos del día se anuncian', () => {
  const events = new EventBus();
  const periods = [];
  events.on(GameEvents.TIME_PERIOD_CHANGED, ({ period }) => periods.push(period));
  const time = new TimeSystem({ config: T, events });
  time.setTime(12);
  events.emit(GameEvents.PLAYER_SLEPT, { hours: 8 });
  assert.equal(time.hour, 20);
  assert.equal(time.period, 'DUSK');
  for (let i = 0; i < 12 * 60; i++) time.update(secondsPerHour / 60); // 12 h, minuto a minuto
  assert.deepEqual(periods, ['DUSK', 'NIGHT', 'DAWN', 'DAY']);
});

// ---- Temperatura -----------------------------------------------------------------

function setupTemperature({ biome = 'PLAINS', y = 5, hour = 13, armor = false, shelter = null } = {}) {
  const events = new EventBus();
  const log = [];
  for (const e of [GameEvents.PLAYER_DAMAGED, GameEvents.TEMPERATURE_STATE_CHANGED]) events.on(e, (p) => log.push([e, p]));
  const time = new TimeSystem({ config: T, events });
  time.setTime(hour);
  const player = { position: { x: 0, y, z: 0 } };
  const weights = { PLAINS: 0, FOREST: 0, FROZEN_MOUNTAINS: 0, [biome]: 1 };
  const world = { seaLevel: 0, getBiomeAt: () => ({ weights }) };
  const equipment = { armor, getColdLossMultiplier: () => (equipment.armor ? GameConfig.EQUIPMENT.ARMOR_COLD_RESISTANCE : 1) };
  const temperature = new TemperatureSystem({
    config: C, biomes: BIOMES, world, time, player, equipment, events,
    shelter: shelter ? { getShelterAt: () => shelter } : null,
  });
  const run = (seconds, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) temperature.update(dt); };
  return { events, log, time, player, equipment, temperature, run, weights };
}

test('la temperatura ambiente = bioma − altura − noche + refugio', () => {
  const { temperature, time } = setupTemperature({ biome: 'PLAINS', y: 5, hour: 13 });
  assert.equal(temperature.sampleAmbient(0, 5, 0).ambient, BIOMES.PLAINS.TEMPERATURE);
  const high = temperature.sampleAmbient(0, 52, 0);
  assert.ok(Math.abs(high.altitude - (52 - C.ALTITUDE_REFERENCE) * C.ALTITUDE_LAPSE) < 1e-9);
  time.setTime(2);
  const night = temperature.sampleAmbient(0, 5, 0);
  assert.ok(Math.abs(night.night - T.NIGHT_TEMPERATURE_DROP) < 0.01, 'noche en la explanada');
});

test('las montañas de noche son especialmente frías', () => {
  const { temperature, time } = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 40, hour: 13 });
  const day = temperature.sampleAmbient(0, 40, 0).ambient;
  time.setTime(2);
  const night = temperature.sampleAmbient(0, 40, 0).ambient;
  assert.ok(day - night > T.NIGHT_TEMPERATURE_DROP + C.MOUNTAIN_NIGHT_EXTRA_DROP - 0.1);
});

test('en la explanada de día no hay frío; en la montaña de noche se pasa por los 4 estados poco a poco', () => {
  const warm = setupTemperature({ biome: 'PLAINS', hour: 13 });
  warm.run(120);
  assert.equal(warm.temperature.state, 'NORMAL');
  assert.equal(warm.log.length, 0);

  const { temperature, run, log } = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 60, hour: 2 });
  run(1);
  assert.equal(temperature.state, 'NORMAL', 'al llegar aún no hace efecto (gradual)');
  const states = [];
  let frostPrev = 0;
  let monotonic = true;
  for (let t = 0; t < 150; t += 0.1) {
    temperature.update(0.1);
    if (temperature.frost + 1e-9 < frostPrev) monotonic = false;
    frostPrev = temperature.frost;
    if (states.at(-1) !== temperature.state) states.push(temperature.state);
  }
  assert.deepEqual(states, ['NORMAL', 'COLD', 'FREEZING', 'CRITICAL']);
  assert.ok(monotonic, 'la escarcha crece de forma continua');
  assert.equal(temperature.frost, 1);
  assert.ok(temperature.visibility < 0.5);
  const damage = log.filter(([e]) => e === GameEvents.PLAYER_DAMAGED).map(([, p]) => p);
  assert.ok(damage.length > 0 && damage.every((d) => d.source === 'COLD' && d.amount > 0));
});

test('al volver al calor deja de doler y se recupera gradualmente', () => {
  const { temperature, run, log, weights, player, time } = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 60, hour: 2 });
  temperature.set(C.DAMAGE_THRESHOLD - 5);
  run(0.3);
  assert.equal(temperature.state, 'CRITICAL');
  // Baja a la explanada de día.
  weights.FROZEN_MOUNTAINS = 0;
  weights.PLAINS = 1;
  player.position.y = 5;
  time.setTime(13);
  const hitsBefore = log.filter(([e]) => e === GameEvents.PLAYER_DAMAGED).length;
  run(1);
  assert.notEqual(temperature.state, 'NORMAL', 'no se recupera de golpe');
  run(60);
  assert.equal(temperature.state, 'NORMAL');
  assert.equal(temperature.frost, 0);
  const hitsAfter = log.filter(([e]) => e === GameEvents.PLAYER_DAMAGED).length;
  assert.ok(hitsAfter - hitsBefore <= 1, 'como mucho un golpe pendiente al salir');
});

test('la armadura reduce la pérdida (ARMOR_COLD_RESISTANCE) y el refugio climatizado protege', () => {
  const bare = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 40, hour: 13 });
  const armored = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 40, hour: 13, armor: true });
  bare.run(20);
  armored.run(20);
  assert.ok(armored.temperature.value > bare.temperature.value, 'con armadura se enfría más despacio');
  assert.ok(armored.temperature.target > bare.temperature.target, 'y se queda en una temperatura menos extrema');
  const k = GameConfig.EQUIPMENT.ARMOR_COLD_RESISTANCE;
  const amb = bare.temperature.ambient;
  assert.ok(Math.abs(armored.temperature.target - (C.COMFORT - (C.COMFORT - amb) * k)) < 1e-9);

  const ship = setupTemperature({ biome: 'FROZEN_MOUNTAINS', y: 60, hour: 2, shelter: { factor: 1, heated: true } });
  ship.run(120);
  assert.equal(ship.temperature.state, 'NORMAL');
  assert.ok(ship.temperature.ambient >= C.HEATED_TEMPERATURE);
});

// ---- Lunas -------------------------------------------------------------------------

test('las dos lunas dependen de la seed (fase e inclinación) y del sistema solar (tamaño, distancia, velocidad)', () => {
  const cfg = GameConfig.CELESTIAL;
  const sub = (text) => new WorldSeed(text, GameConfig.WORLD.SUB_SEEDS).sub.celestial;
  const a = createCelestialCatalog(cfg, sub('mundo0'), EDEN);
  const b = createCelestialCatalog(cfg, sub('mundo0'), EDEN);
  const c = createCelestialCatalog(cfg, sub('otra'), EDEN);
  assert.deepEqual(a, b, 'misma seed → mismas lunas');
  assert.notEqual(a.bodies[0].phase, c.bodies[0].phase);
  const [A, B] = a.bodies;
  assert.equal(A.name, 'Luna A');
  assert.equal(B.name, 'Luna B');
  assert.equal(A.radiusKm, 620);
  assert.equal(B.distanceKm, 17000);
  assert.ok(A.radiusKm !== B.radiusKm && A.distanceKm !== B.distanceKm && A.speed !== B.speed, 'visualmente distintas');
  assert.ok(!A.visitable && !B.visitable, 'no visitables: falta el nodo espacial');
  // Órbita circular: la distancia al planeta se conserva y vuelve al inicio tras un periodo.
  const p0 = orbitPosition(A, 0, {});
  const p1 = orbitPosition(A, 17, {});
  const pT = orbitPosition(A, A.periodHours, {});
  assert.ok(Math.abs(Math.hypot(p1.x, p1.y, p1.z) - A.distanceKm) < 1e-6);
  assert.ok(Math.hypot(pT.x - p0.x, pT.y - p0.y, pT.z - p0.z) < 1e-6);
});
