/**
 * Niveles: experiencia, puntos y estadísticas (vida, estamina, daño, velocidad).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { EventBus } from '../js/core/EventBus.js';
import { GameEvents } from '../js/core/GameEvents.js';
import { ProgressionSystem } from '../js/player/ProgressionSystem.js';
import { HealthSystem } from '../js/player/HealthSystem.js';
import { EnergySystem } from '../js/player/EnergySystem.js';

function setup() {
  const events = new EventBus();
  const ups = [];
  events.on(GameEvents.PLAYER_LEVEL_UP, (e) => ups.push(e.level));
  const health = new HealthSystem({ config: C.SURVIVAL, events, canRegenerate: () => false });
  const energy = new EnergySystem({ config: C.SURVIVAL, events, player: { state: {} } });
  const prog = new ProgressionSystem({ config: C.PROGRESSION, events });
  prog.applyTo({ health, energy });
  return { events, ups, health, energy, prog };
}

test('la experiencia sube de nivel y da puntos', () => {
  const { prog, ups } = setup();
  const P = C.PROGRESSION;
  assert.equal(prog.level, 1);
  prog.addXp(P.XP_BASE - 1);
  assert.equal(prog.level, 1);
  prog.addXp(1);
  assert.equal(prog.level, 2);
  assert.equal(prog.points, P.POINTS_PER_LEVEL);
  assert.equal(prog.xpToNext(), P.XP_BASE + P.XP_GROWTH, 'cada nivel pide más');
  prog.addXp(10000); // varios niveles de golpe
  assert.ok(prog.level > 5);
  assert.equal(prog.points, (prog.level - 1) * P.POINTS_PER_LEVEL);
  assert.equal(ups.at(-1), prog.level);
});

test('los puntos suben vida, estamina, daño y velocidad', () => {
  const { prog, health, energy } = setup();
  const S = C.PROGRESSION.STATS;
  prog.addXp(100000);
  const h0 = health.max;
  assert.ok(prog.spend('HEALTH'));
  assert.equal(health.max, h0 + S.HEALTH.PER_POINT);
  assert.equal(health.value, health.max, 'la vida nueva se llena');
  const e0 = energy.max;
  prog.spend('STAMINA');
  assert.equal(energy.max, e0 + S.STAMINA.PER_POINT);
  prog.spend('DAMAGE');
  assert.ok(Math.abs(prog.damageMultiplier - (1 + S.DAMAGE.PER_POINT)) < 1e-9);
  prog.spend('SPEED');
  assert.ok(Math.abs(prog.speedMultiplier - (1 + S.SPEED.PER_POINT)) < 1e-9);
  assert.ok(!prog.spend('NO_EXISTE'));
  const { prog: p2 } = setup();
  assert.ok(!p2.spend('HEALTH'), 'sin puntos no se puede');
});

test('viajar conserva el nivel; un traspaso manipulado no da puntos de más', () => {
  const a = setup();
  a.prog.addXp(500);
  a.prog.spend('HEALTH');
  const b = setup();
  b.prog.restore(a.prog.snapshot());
  assert.deepEqual(b.prog.snapshot(), a.prog.snapshot());
  assert.equal(b.health.max, a.health.max);
  const c = setup();
  c.prog.restore({ level: 3, xp: 1e9, points: 999, stats: { HEALTH: 50, SPEED: 'x' } });
  const spent = Object.values(c.prog.stats).reduce((x, y) => x + y, 0);
  assert.ok(spent + c.prog.points <= (c.prog.level - 1) * C.PROGRESSION.POINTS_PER_LEVEL);
  assert.ok(c.prog.xp < c.prog.xpToNext());
});
