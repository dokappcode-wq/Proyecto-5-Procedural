/**
 * v1.18: historia (primera parte) — reloj con nombre y color, torre del ermitaño,
 * clave A1 y brújula, arena del nodo espacial, cápsula 2 y Nova.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { StaticColliders } from '../js/story/StaticColliders.js';
import { WATCH_COLORS, sanitizeWatchName, watchColor } from '../js/story/StoryUI.js';
import { planSites } from '../js/world/WorldSites.js';

// Módulos con Three.js: después de registrar el resolvedor de 'three' (helpers/three.mjs).
const { defaultStoryState, sanitizeStoryState, stageAtLeast, STAGES } = await import('../js/story/StorySystem.js');
const { buildHermitTower, buildNodeArena, TOWER, ARENA } = await import('../js/story/StoryBuildings.js');

test('reloj: 9 colores y nombre saneado (solo texto, sin HTML)', () => {
  assert.deepEqual(WATCH_COLORS.map((c) => c.name), ['Azul', 'Rojo', 'Amarillo', 'Verde', 'Blanco', 'Negro', 'Naranja', 'Rosa', 'Morado']);
  assert.equal(sanitizeWatchName('  Nova  '), 'Nova');
  assert.equal(sanitizeWatchName('<b>Hal</b>9000'), 'bHalb9000');
  assert.equal(sanitizeWatchName('Ñandú 2'), 'Ñandú 2');
  assert.equal(sanitizeWatchName('a'.repeat(40)).length, 16);
  assert.equal(sanitizeWatchName('<>'), null);
  assert.equal(watchColor('NOPE').id, 'BLUE');
});

test('estado de la historia: por defecto, etapas en orden y carga saneada', () => {
  const s = defaultStoryState();
  assert.equal(s.stage, 'CRASH');
  assert.ok(stageAtLeast('SCAN', 'CAPSULE'));
  assert.ok(!stageAtLeast('TOWER', 'NODE'));
  assert.ok(STAGES.indexOf('POSTGAME') > STAGES.indexOf('BOSS'));
  const bad = sanitizeStoryState({ stage: 'HACK', watchName: '<script>', watchColor: 'X', keyTaken: 'yes', scanStart: 'x', extra: { a: 1 }, tutorial: 'maybe' });
  assert.equal(bad.stage, 'CRASH');
  assert.equal(bad.watchName, 'script');
  assert.equal(bad.watchColor, 'BLUE');
  assert.equal(bad.keyTaken, false);
  assert.equal(bad.scanStart, null);
  assert.equal(bad.tutorial, 'off');
  assert.equal(bad.extra, undefined, 'objetos desconocidos fuera');
  const ok = sanitizeStoryState({ stage: 'SCAN', watchName: 'Luna', watchColor: 'GREEN', novaActive: true, scanStart: 30 });
  assert.deepEqual([ok.stage, ok.watchName, ok.watchColor, ok.novaActive, ok.scanStart], ['SCAN', 'Luna', 'GREEN', true, 30]);
});

test('lugares de la historia: lejos del inicio (más de 4 chunks) y en su orden', () => {
  const terrain = { sample: () => ({ height: 12, biomes: { PLAINS: 1 }, coast: 0, river: 0 }), heightAt: () => 12 };
  const { sites } = planSites({ seed: 3, terrain, bounds: { minX: -2500, maxX: 2500, minZ: -2500, maxZ: 2500 }, spawn: { x: 0, z: 0 }, safeRadius: C.SITES.SAFE_RADIUS, requests: C.SITES.LIST });
  const d = (k) => Math.hypot(sites[k][0].x, sites[k][0].z);
  assert.ok(d('HERMIT_TOWER') >= C.SITES.SAFE_RADIUS && d('HERMIT_TOWER') <= 720);
  assert.ok(d('NODE_ARENA') > d('HERMIT_TOWER') - 100);
  assert.ok(d('RESEARCH_CENTER') >= 950);
});

test('colisiones estáticas: suelo, pared, techo y empuje', () => {
  const c = new StaticColliders();
  c.add('t', [
    { cx: 0, cz: 0, hx: 1, hz: 1, yaw: 0.5, y0: 0, y1: 0.4, walk: true },
    { x: 5, z: 0, r: 1, y0: 0, y1: 3, wall: true },
    { x: 10, z: 0, r: 2, y0: 3, y1: 4, roof: true },
  ]);
  assert.equal(c.surfaceAt(0, 0, 1), 0.4);
  assert.equal(c.surfaceAt(0, 0, 0.2), null, 'por encima de los pies + escalón no cuenta');
  assert.equal(c.surfaceAt(3, 3, 5), null);
  assert.ok(c.blocksAt(5.9, 0, 0.35, 0.5, 1.8));
  assert.ok(!c.blocksAt(7, 0, 0.35, 0.5, 1.8));
  assert.equal(c.ceilingAt(10, 0, 1), 3);
  const pos = { x: 5.5, z: 0 };
  assert.ok(c.resolveCollisions(pos, 0.35, 0.1, 1.8));
  assert.ok(Math.hypot(pos.x - 5, pos.z) >= 1.35 - 1e-6);
  c.get('t').enabled = false;
  assert.equal(c.surfaceAt(0, 0, 1), null, 'un grupo apagado no cuenta');
});

test('torre del ermitaño: la escalera se sube sin saltar hasta la habitación de arriba', () => {
  const site = { x: 0, z: 0, yaw: 0.3 };
  const tower = buildHermitTower(site, 10);
  const c = new StaticColliders();
  c.add('tower', tower.prims);
  // Recorrer la hélice por el centro de los escalones: cada paso sube como mucho un escalón.
  const rMid = (TOWER.STAIR_IN + TOWER.STAIR_OUT) / 2;
  let y = 10;
  const sweep = TOWER.TURNS * Math.PI * 2;
  for (let k = 0; k <= 400; k++) {
    const a = site.yaw + (k / 400) * sweep;
    const s = c.surfaceAt(Math.cos(a) * rMid, Math.sin(a) * rMid, y + C.PLAYER.MAX_STEP_HEIGHT);
    assert.ok(s !== null, `sin escalón en ${k}`);
    assert.ok(s - y <= C.PLAYER.MAX_STEP_HEIGHT + 1e-6, `escalón de ${(s - y).toFixed(2)} m`);
    y = Math.max(y, s);
  }
  assert.ok(Math.abs(y - tower.room.y) < 0.4, 'llega a la puerta de arriba');
  // Dentro de la habitación hay suelo y techo.
  assert.equal(c.surfaceAt(tower.room.x, tower.room.z, tower.room.y + 0.3), tower.room.y);
  assert.ok(c.ceilingAt(tower.room.x, tower.room.z, tower.room.y + 1) > tower.room.y + 2.5);
  assert.ok(Math.hypot(tower.hermitSpot.x - tower.room.x, tower.hermitSpot.z - tower.room.z) < tower.room.r);
});

test('arena del nodo: cuatro gólems dentro y muros que cierran el anillo', () => {
  const site = { x: 100, z: -50, yaw: 1 };
  const arena = buildNodeArena(site, 8, () => 8);
  assert.equal(arena.golemSpots.length, 4);
  for (const g of arena.golemSpots) assert.ok(Math.hypot(g.x - site.x, g.z - site.z) < ARENA.WALL_R - 3);
  assert.equal(arena.wallPrims.length, ARENA.WALLS);
  const c = new StaticColliders();
  c.add('walls', arena.wallPrims);
  // No se puede salir por ningún lado.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const blocked = [ARENA.WALL_R - 0.6, ARENA.WALL_R, ARENA.WALL_R + 0.6].some((r) => c.blocksAt(site.x + Math.cos(a) * r, site.z + Math.sin(a) * r, 0.35, 8.5, 9.8));
    assert.ok(blocked, `hueco en ${i * 10}°`);
  }
});
