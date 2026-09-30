/**
 * Tests de la FASE 6: vida, hambre, sed y energía. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { HealthSystem } from '../js/player/HealthSystem.js';
import { HungerSystem } from '../js/player/HungerSystem.js';
import { ThirstSystem } from '../js/player/ThirstSystem.js';
import { EnergySystem } from '../js/player/EnergySystem.js';

const S = GameConfig.SURVIVAL;
const run = (sys, seconds, dt = 0.1) => { for (let t = 0; t < seconds; t += dt) sys.update(dt); };

function setup() {
  const events = new EventBus();
  const log = [];
  for (const e of [GameEvents.PLAYER_DAMAGED, GameEvents.PLAYER_DIED, GameEvents.PLAYER_RESPAWNED, GameEvents.PLAYER_STAT_LEVEL]) {
    events.on(e, (p) => log.push([e, p]));
  }
  const player = { state: { isRunning: false } };
  const hunger = new HungerSystem({ config: S, events });
  const thirst = new ThirstSystem({ config: S, events });
  const energy = new EnergySystem({ config: S, events, player });
  const health = new HealthSystem({
    config: S,
    events,
    canRegenerate: () => hunger.ratio >= S.HEALTH_REGEN_MIN_RATIO && thirst.ratio >= S.HEALTH_REGEN_MIN_RATIO,
  });
  return { events, log, player, hunger, thirst, energy, health };
}

test('hambre y sed bajan con el tiempo según la configuración', () => {
  const { hunger, thirst } = setup();
  run(hunger, 60);
  run(thirst, 60);
  assert.ok(Math.abs(hunger.value - (100 - S.HUNGER_DECAY * 60)) < 0.5);
  assert.ok(Math.abs(thirst.value - (100 - S.THIRST_DECAY * 60)) < 0.5);
  assert.ok(thirst.value < hunger.value, 'la sed baja más rápido');
});

test('con hambre a 0 se pierde vida (vía evento) hasta morir', () => {
  const { hunger, health, log } = setup();
  hunger.set(0);
  for (let t = 0; t < 400 && !health.dead; t += 0.1) { hunger.update(0.1); health.update(0.1); }
  assert.ok(health.dead);
  const died = log.find(([e]) => e === GameEvents.PLAYER_DIED)[1];
  assert.equal(died.cause, 'HUNGER');
  assert.ok(log.some(([e, p]) => e === GameEvents.PLAYER_DAMAGED && p.source === 'HUNGER'));
});

test('beber (evento PLAYER_DRANK) recupera sed', () => {
  const { events, thirst } = setup();
  thirst.set(30);
  events.emit(GameEvents.PLAYER_DRANK, { source: 'POND' });
  assert.equal(thirst.value, 30 + S.DRINK_AMOUNT);
});

test('la vida se cura solo sin daño reciente y con hambre/sed suficientes', () => {
  const { health, hunger } = setup();
  health.damage(40, 'TEST');
  run(health, S.HEALTH_REGEN_DELAY - 1);
  assert.equal(health.value, 60, 'aún no se cura');
  run(health, 5);
  assert.ok(health.value > 60, 'se cura');
  const before = health.value;
  hunger.set(S.HEALTH_REGEN_MIN_RATIO * 100 - 10);
  run(health, 10);
  assert.equal(health.value, before, 'con hambre no se cura');
});

test('caída desde gran altura hace daño; una pequeña no', () => {
  const { events, health } = setup();
  events.emit(GameEvents.PLAYER_LANDED, { fallSpeed: S.FALL_DAMAGE_MIN_SPEED - 1 });
  assert.equal(health.value, 100);
  events.emit(GameEvents.PLAYER_LANDED, { fallSpeed: S.FALL_DAMAGE_MIN_SPEED + 3 });
  assert.equal(health.value, 100 - Math.round(3 * S.FALL_DAMAGE_PER_MS));
});

test('muerte y reaparición: hay espera y después se restablece la vida', () => {
  const { events, health, log } = setup();
  events.emit(GameEvents.PLAYER_DAMAGED, { amount: 500, source: 'COW', sourceName: 'Vaca' });
  assert.ok(health.dead);
  assert.ok(!health.respawn(), 'no se puede reaparecer al instante');
  health.damage(10); // ignorado estando muerto
  run(health, S.RESPAWN_DELAY + 0.2);
  events.emit(GameEvents.PLAYER_RESPAWN_REQUEST);
  assert.ok(!health.dead);
  assert.equal(health.value, S.RESPAWN_VALUES.HEALTH);
  assert.ok(log.some(([e]) => e === GameEvents.PLAYER_RESPAWNED));
});

test('invulnerable: el daño no afecta', () => {
  const { health } = setup();
  health.invulnerable = true;
  health.damage(50);
  assert.equal(health.value, 100);
});

test('energía: correr y actuar la gastan; agotado no se corre y se camina más lento', () => {
  const { events, energy, player } = setup();
  run(energy, 10);
  const idle = 100 - energy.value;
  energy.fill();
  player.state.isRunning = true;
  run(energy, 10);
  assert.ok(100 - energy.value > idle * 2, 'correr cansa más');
  const v = energy.value;
  events.emit(GameEvents.PLAYER_ACTION, { kind: 'hit' });
  assert.ok(Math.abs(v - energy.value - S.ENERGY_ACTION_COST) < 1e-9);
  assert.deepEqual(energy.getMovementModifiers(), { canRun: true, speedMultiplier: 1 });
  energy.set(S.ENERGY_NO_RUN_RATIO * 100 - 1);
  assert.equal(energy.getMovementModifiers().canRun, false);
  energy.set(0);
  assert.equal(energy.getMovementModifiers().speedMultiplier, S.EXHAUSTED_SPEED_MULTIPLIER);
});

test('los avisos de umbral se emiten al cruzar low y critical', () => {
  const { thirst, log } = setup();
  thirst.set(S.LOW_RATIO * 100 - 1);
  thirst.set(S.CRITICAL_RATIO * 100 - 1);
  thirst.set(80);
  const levels = log.filter(([e, p]) => e === GameEvents.PLAYER_STAT_LEVEL && p.stat === 'THIRST').map(([, p]) => p.level);
  assert.deepEqual(levels, ['low', 'critical', 'ok']);
});
