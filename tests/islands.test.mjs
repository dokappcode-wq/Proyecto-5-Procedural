/**
 * Islas flotantes (v1.37): decorado del Edén según las láminas.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import './helpers/three.mjs';

const THREE = await import('three');
const { buildIslandBody, buildFallRibbon, FloatingIslands } = await import('../js/world/map/FloatingIslands.js');
const { MapData } = await import('../js/world/map/MapData.js');

const dir = new URL('../maps/eden/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('eden.map.json', dir)));
const map = MapData.fromFiles(meta, zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));

test('islas: cima hacia arriba, panza de roca hacia fuera y acabada en punta', () => {
  const isl = { id: 'T', x: 0, z: 0, y: 80, r: 12 };
  const { geo, depth } = buildIslandBody(isl);
  const p = geo.attributes.position.array;
  assert.equal(geo.attributes.color.count, geo.attributes.position.count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let up = 0;
  let out = 0;
  let wrong = 0;
  let minY = Infinity;
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    minY = Math.min(minY, a.y, b.y, c.y);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-9) continue;
    const m = a.clone().add(b).add(c).divideScalar(3);
    if (m.y > -0.05) {
      if (n.y > 0) up++;
      else wrong++;
    } else {
      // Hacia fuera: lejos del eje (o hacia abajo cerca de la punta).
      if (n.x * m.x + n.z * m.z > 0 || n.y < 0) out++;
      else wrong++;
    }
  }
  assert.ok(up > 20 && out > 100, `caras: ${up} arriba, ${out} fuera`);
  assert.ok(wrong <= (up + out) * 0.03, `casi ninguna cara del revés (${wrong})`);
  assert.ok(minY < -isl.r * 1.2 && Math.abs(minY + depth + 0.8) < 1.5, 'la punta de roca está bien abajo');
});

test('cascada de isla: cae la longitud pedida y se deshace (transparente) abajo', () => {
  const geo = buildFallRibbon(0, 10, 50);
  const pos = geo.attributes.position;
  const col = geo.attributes.color;
  assert.equal(col.itemSize, 4, 'color con alfa');
  let minY = Infinity;
  for (let i = 0; i < pos.count; i++) minY = Math.min(minY, pos.getY(i));
  assert.ok(Math.abs(minY + 50) < 1, `cae 50 m (${minY.toFixed(1)})`);
  assert.ok(col.getW(0) > 0.8, 'arriba se ve');
  assert.ok(col.getW(pos.count - 1) < 0.02, 'abajo se ha deshecho en bruma');
  // Sale del borde hacia fuera (x > radio).
  for (let i = 0; i < pos.count; i++) assert.ok(pos.getX(i) > 10);
});

test('el Edén: islas flotando sobre el terreno, sin tocarlo, y se mecen', () => {
  const islands = meta.floatingIslands;
  assert.ok(islands.length >= 8, 'varias islas');
  for (const isl of islands) {
    const { depth } = buildIslandBody(isl);
    for (let a = 0; a < 16; a++) {
      for (const rel of [0, 0.5, 1, 1.6]) {
        const x = isl.x + Math.cos(a / 16 * Math.PI * 2) * isl.r * rel;
        const z = isl.z + Math.sin(a / 16 * Math.PI * 2) * isl.r * rel;
        assert.ok(isl.y - depth - 2 > map.heightAt(x, z) + 8, `${isl.id} no toca el suelo`);
      }
    }
  }
  // Desde el inicio, la del Alba está a la vista (a menos de 220 m, dentro de la niebla).
  const alba = islands.find((i) => i.id === 'ISLA_ALBA');
  assert.ok(Math.hypot(alba.x - meta.spawn.x, alba.z - meta.spawn.z) < 220);
  const root = new THREE.Group();
  let on = true;
  const fi = new FloatingIslands({ map, root, isEnabled: () => on });
  assert.equal(fi.islands.length, islands.length);
  assert.ok(root.children.includes(fi.group));
  const g = fi.islands[0].group;
  const y0 = g.position.y;
  for (let i = 0; i < 40; i++) fi.update(0.5);
  assert.ok(Math.abs(g.position.y - fi.islands[0].data.y) <= 0.81, 'se mece poco');
  assert.notEqual(g.position.y, y0);
  on = false;
  const y1 = g.position.y;
  fi.update(1);
  assert.equal(g.position.y, y1, 'fuera del Edén no se anima');
});
