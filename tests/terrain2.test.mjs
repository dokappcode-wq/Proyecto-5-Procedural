/**
 * Relieve en terrazas (v1.36): plataformas llanas con cortados y paredes de roca.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { SURFACE } from '../js/world/map/MapLegend.js';
import './helpers/three.mjs';

const { buildCliffGeometry } = await import('../js/world/map/CliffMesher.js');
const { MapData } = await import('../js/world/map/MapData.js');

/** Mapa de prueba: llano a 10 m con un escalón de 7 m en x = 20 (2 m de rampa). */
const fakeMap = (step = true) => ({
  heightAt: (x) => (step ? 10 + 7 * Math.min(1, Math.max(0, (x - 19) / 2)) : 10),
  waterAt: () => null,
  surfaceAt: () => SURFACE.CLIFF,
});

test('paredes de roca: solo en las celdas empinadas, pegadas a la superficie y sin tapar bocas de cueva', () => {
  assert.equal(buildCliffGeometry(fakeMap(false), 0, 0, 64, 2), null, 'en llano no hay pared');
  const map = fakeMap();
  const geo = buildCliffGeometry(map, 0, 0, 64, 2);
  assert.ok(geo);
  const p = geo.attributes.position.array;
  assert.ok(p.length / 9 >= 32 * 2, 'una fila de celdas, subdividida');
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(p[i] > 16 && p[i] < 24, 'solo junto al escalón');
    // Distancia real a la superficie física (el perfil del escalón), no en vertical: en una pared
    // la roca se separa siguiendo su normal.
    let d = Infinity;
    for (let t = -2; t <= 2; t += 0.05) d = Math.min(d, Math.hypot(t, p[i + 1] - map.heightAt(p[i] + t)));
    assert.ok(d < 1.0, `la roca va pegada a la superficie: ${d.toFixed(2)} m`);
  }
  assert.equal(geo.attributes.color.count, geo.attributes.position.count);
  // Boca de cueva en medio: esas celdas no llevan pared.
  const withHole = buildCliffGeometry(map, 0, 0, 64, 2, { holes: (x, y, z) => z > 20 && z < 40 });
  assert.ok(withHole.attributes.position.count < geo.attributes.position.count);
  // Bajo el agua tampoco.
  assert.equal(buildCliffGeometry({ ...map, waterAt: () => 30 }, 0, 0, 64, 2), null);
});

test('el Edén en terrazas: llanuras partidas en plataformas con cortados, cimas casi llanas', () => {
  const dir = new URL('../maps/eden/', import.meta.url);
  const meta = JSON.parse(fs.readFileSync(new URL('eden.map.json', dir)));
  const map = MapData.fromFiles(meta, zlib.gunzipSync(fs.readFileSync(new URL('eden.map.bin.gz', dir))));
  // Muestra de la llanura central (Valle del Despertar), lejos de agua y caminos.
  let flat = 0;
  let cliff = 0;
  let mid = 0;
  for (let x = -500; x <= 300; x += 4) {
    for (let z = 150; z <= 900; z += 4) {
      if (map.waterAt(x, z) !== null) continue;
      const g = Math.hypot(map.heightAt(x + 1, z) - map.heightAt(x - 1, z), map.heightAt(x, z + 1) - map.heightAt(x, z - 1)) / 2;
      if (g < 0.15) flat++;
      else if (g > 1.2) cliff++;
      else if (g > 0.35 && g < 0.75) mid++;
    }
  }
  const total = flat + cliff + mid;
  assert.ok(flat / total > 0.6, `sobre todo llano para andar (${(flat / total * 100).toFixed(0)} %)`);
  assert.ok(cliff > 200, `con cortados entre plataformas (${cliff})`);
  assert.ok(mid / total < 0.12, `pocas cuestas incómodas de 20–35° (${(mid / total * 100).toFixed(1)} %)`);
  // La plataforma de inicio, más alta que lo que la rodea.
  const sp = meta.spawn;
  assert.ok(map.heightAt(sp.x, sp.z) - map.heightAt(sp.x, sp.z - 70) > 6, 'el inicio está sobre una plataforma con su cortado');
  assert.ok(Object.values(map.meta.sites ?? []).length > 0);
});
