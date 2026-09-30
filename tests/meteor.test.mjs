/**
 * Tests de los meteoritos (Etapa 5): forma procedural determinista y cristales. `npm test`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeteor, normalize } from '../js/space/Meteor.js';

test('misma seed, mismo meteorito; seeds distintas, formas distintas', () => {
  const a = createMeteor({ id: 'A', seed: 42, position: { x: 1, y: 2, z: 3 } });
  const b = createMeteor({ id: 'B', seed: 42, position: { x: 1, y: 2, z: 3 } });
  const c = createMeteor({ id: 'C', seed: 43, position: { x: 1, y: 2, z: 3 } });
  const d = normalize(0.3, 0.8, -0.5);
  assert.equal(a.radius, b.radius);
  assert.equal(a.surfaceRadius(d), b.surfaceRadius(d));
  assert.notEqual(a.surfaceRadius(d), c.surfaceRadius(d));
});

test('la superficie es continua y está cerca del radio base (se puede caminar alrededor)', () => {
  const m = createMeteor({ id: 'M', seed: 7, position: { x: 0, y: 0, z: 0 }, radiusRange: [30, 30] });
  let prev = null;
  for (let i = 0; i <= 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    const r = m.surfaceRadius(normalize(Math.cos(a), Math.sin(a) * 0.3, Math.sin(a)));
    assert.ok(r > 30 * 0.6 && r < 30 * 1.8, `radio ${r}`);
    if (prev !== null) assert.ok(Math.abs(r - prev) < 1.5, 'sin saltos');
    prev = r;
  }
});

test('tiene cúmulos de cristales con usos limitados', () => {
  const m = createMeteor({ id: 'M', seed: 9, position: { x: 0, y: 0, z: 0 }, crystals: [5, 8], yields: 3 });
  assert.ok(m.deposits.length >= 5 && m.deposits.length <= 8);
  assert.ok(m.deposits.every((d) => d.left === 3 && Math.abs(Math.hypot(d.dir.x, d.dir.y, d.dir.z) - 1) < 1e-9));
});
