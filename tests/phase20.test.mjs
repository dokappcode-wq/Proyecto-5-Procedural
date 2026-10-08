/**
 * v1.20: cuevas fáciles de recorrer (sin escalones invisibles en las uniones, paredes
 * que coinciden con la colisión), gólem gigante nuevo y modelos mejorados.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers/three.mjs';
import { GameConfig as C } from '../js/config/GameConfig.js';
import { labLayout } from '../js/story/LabLayout.js';
import { EDEN } from './helpers/eden.mjs';

const THREE = await import('three');
const { WorldManager } = await import('../js/world/WorldManager.js');

function campaignWorld(seed) {
  const DUNGEON = (sites) => {
    const L = labLayout(sites.RESEARCH_CENTER?.[0]);
    return { x: L.hatch.x, z: L.hatch.z, yaw: L.heading };
  };
  const worlds = new WorldManager({
    scene: new THREE.Scene(), system: EDEN, events: { on() {}, emit() {} },
    options: {
      config: C.WORLD, resourceTypes: C.RESOURCE_TYPES, propColors: C.PROPS,
      landing: { DISTANCE: C.SHIP.LANDING_DISTANCE, CLEAR_RADIUS: C.SHIP.CLEAR_RADIUS, HALF_WIDTH: 3.6, HALF_LENGTH: 8.3 },
      homeRules: { SPAWN_ANYWHERE: true, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: C.SHIP.MOUNTAIN_LANDING_DISTANCE, CAVES: C.CAVES, SITES: C.SITES.LIST, SAFE_RADIUS: C.SITES.SAFE_RADIUS, DUNGEON },
    },
  });
  worlds.home.generate(seed);
  return worlds.home;
}

/** Lado (perpendicular al túnel, en horizontal) en el nodo i: media de sus dos tramos. */
function side(n, i) {
  const seg = (k) => {
    const a = n[Math.max(0, Math.min(n.length - 2, k))];
    const b = n[Math.max(1, Math.min(n.length - 1, k + 1))];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l };
  };
  const p = seg(i - 1);
  const q = seg(i);
  const l = Math.hypot(p.x + q.x, p.z + q.z) || 1;
  return { x: (p.x + q.x) / l, z: (p.z + q.z) / l };
}

const worlds = { 42: campaignWorld('42'), 7: campaignWorld('7') };

test('cuevas: el suelo es continuo a lo largo del túnel (sin escalones en las uniones)', () => {
  for (const w of Object.values(worlds)) {
    for (const cave of w.caves.caves) {
      const n = cave.nodes;
      for (const lateral of [0, -0.45, 0.45]) {
        let prev = null;
        let px = 0;
        let pz = 0;
        for (let i = 0; i < n.length - 1; i++) {
          const a = n[i];
          const b = n[i + 1];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          // Camino continuo a un lado del eje: en cada nodo, el lado medio de sus dos tramos.
          const sa = side(n, i);
          const sb = side(n, i + 1);
          const tEnd = i === n.length - 2 ? 1 - 0.8 / len : 1; // el fondo es pared
          for (let t = 0; t < tEnd; t += 0.25 / len) {
            const r = a.r + (b.r - a.r) * t;
            const sx = sa.x + (sb.x - sa.x) * t;
            const sz = sa.z + (sb.z - sa.z) * t;
            const x = a.x + (b.x - a.x) * t + sx * lateral * r;
            const z = a.z + (b.z - a.z) * t + sz * lateral * r;
            const feet = prev ?? a.floor;
            const f = w.caveFloorAt(x, z, feet);
            if (i < 1 && !f) continue; // la boca: aún en el terreno
            assert.ok(f, `suelo en la cueva ${cave.id}, tramo ${i}`);
            // Lo que cambia el suelo, comparado con lo que se ha avanzado: como mucho una
            // rampa (por el lado de dentro de una curva se avanza menos que por el eje) más un
            // poco; nunca un escalón.
            const moved = prev === null ? 0 : Math.hypot(x - px, z - pz);
            if (prev !== null) assert.ok(Math.abs(f.floor - prev) <= 0.15 + 0.8 * moved, `escalón de ${(f.floor - prev).toFixed(2)} m en ${moved.toFixed(2)} m (cueva ${cave.id}, tramo ${i})`);
            prev = f.floor;
            px = x;
            pz = z;
          }
        }
      }
    }
  }
});

test('cuevas: las menas quedan metidas en la pared, sin estorbar el paso por el centro', () => {
  for (const w of Object.values(worlds)) {
    for (const cave of w.caves.caves) {
      for (const c of cave.content) {
        if (c.type === 'GLOW_FLOWER') continue;
        const near = w.caves._segmentsAt(c.x, c.z).filter((s) => s.cave === cave);
        if (!near.length) continue;
        const k = Math.min(...near.map((s) => s.d / s.r));
        const ore = C.RESOURCE_TYPES[c.type];
        const reach = (ore.COLLISION_RADIUS * ore.SCALE[1] * 0.45 + C.PLAYER.RADIUS) / Math.min(...near.map((s) => s.r));
        assert.ok(k - reach > 0.1, `${c.type} deja paso (${k.toFixed(2)} − ${reach.toFixed(2)})`);
      }
    }
  }
});

test('cuevas de montaña: la ladera de la boca se sube andando', () => {
  for (const w of Object.values(worlds)) {
    for (const cave of w.caves.caves.filter((c) => c.kind === 'MOUNTAIN')) {
      const m = cave.nodes[0];
      const d = 2;
      const gx = (w.getHeightAt(m.x + d, m.z) - w.getHeightAt(m.x - d, m.z)) / (2 * d);
      const gz = (w.getHeightAt(m.x, m.z + d) - w.getHeightAt(m.x, m.z - d)) / (2 * d);
      assert.ok(Math.hypot(gx, gz) < Math.tan((C.PLAYER.MAX_WALKABLE_SLOPE_DEG * Math.PI) / 180), `cueva ${cave.id}`);
    }
  }
});
