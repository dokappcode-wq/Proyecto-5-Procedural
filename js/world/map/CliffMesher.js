import * as THREE from 'three';
import { SimplexNoise } from '../noise/SimplexNoise.js';
import { SURFACE } from './MapLegend.js';

/**
 * CliffMesher — paredes de roca de los mapas diseñados.
 *
 * El terreno es una rejilla de 2 m: un cortado de 7 m entre dos plataformas son una o dos filas
 * de triángulos estirados de color liso. Aquí se vuelven a teselar solo esas celdas empinadas
 * (desnivel entre esquinas > threshold), siguiendo exactamente los mismos dos triángulos de la
 * malla del terreno (diagonal b–d, como TerrainMesher), y cada vértice se abomba hacia fuera con
 * ruido: salientes y grietas de roca. Color por estratos horizontales (según la altura), más
 * oscuro en las grietas, con un borde de hierba arriba; arenisca naranja en el desierto.
 * Como la roca está encima de la superficie física (a lo sumo medio metro), andar, escalar y las
 * colisiones no cambian.
 */
const noise = new SimplexNoise(7331);
const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ROCK = { dark: new THREE.Color(0x6a6158), light: new THREE.Color(0x9a8f80), warm: new THREE.Color(0x8a6e55) };
const SAND = { dark: new THREE.Color(0xa45a2c), light: new THREE.Color(0xd9925a), warm: new THREE.Color(0xc06e3c) };
const ICE = { dark: new THREE.Color(0x6e7682), light: new THREE.Color(0xb6bec8), warm: new THREE.Color(0x8e96a2) };
const GRASS = new THREE.Color(0x5f9f3a);
const MOSS = new THREE.Color(0x4f7d36);

/** Ruido 0..1 continuo en el espacio (la misma roca a ambos lados de una costura). */
function n3(x, y, z) {
  return (noise.noise2D(x * 0.55 + y * 0.31, z * 0.55 - y * 0.12) + noise.noise2D(z * 0.5 - y * 0.27, x * 0.5 + 17.3)) * 0.25 + 0.5;
}

/**
 * Geometría de las paredes de un chunk (o null si no hay ninguna).
 * @param {MapData} map
 * @param {number} x0, z0 esquina del chunk; size lado (m); cell separación de la rejilla (m)
 * @param {{ holes?: (x,y,z)=>boolean, threshold?: number, sub?: number }} opts
 */
export function buildCliffGeometry(map, x0, z0, size, cell, { holes = null, threshold = 2.2, sub = 3 } = {}) {
  const res = Math.round(size / cell);
  const H = (k, l) => map.heightAt(x0 + k * cell, z0 + l * cell);
  const pos = [];
  const col = [];
  const tmp = new THREE.Color();
  const eps = 0.6;
  // Dirección hacia fuera de la pared: la normal del terreno en ese punto (continua entre celdas).
  const vertex = (x, y, z, top, pal, steepCell) => {
    const gx = (map.heightAt(x + eps, z) - map.heightAt(x - eps, z)) / (2 * eps);
    const gz = (map.heightAt(x, z + eps) - map.heightAt(x, z - eps)) / (2 * eps);
    const g = Math.hypot(gx, gz);
    const inv = 1 / Math.hypot(gx, 1, gz);
    const w = smooth(0.8, 1.5, g) * steepCell;
    const r = n3(x, y, z);
    const lip = smooth(top - 1.2, top, y);
    const d = w * (0.12 + 0.45 * r + 0.25 * lip);
    pos.push(x - gx * inv * d, y + inv * d * 0.3, z - gz * inv * d);
    // Estratos (bandas horizontales que ondulan un poco) y grietas más oscuras.
    const band = Math.sin(y * 1.15 + noise.noise2D(x / 18, z / 18) * 2.5) * 0.5 + 0.5;
    tmp.copy(pal.dark).lerp(pal.light, band * 0.85).lerp(pal.warm, smooth(0.55, 0.9, n3(x * 0.4, y * 0.8, z * 0.4)) * 0.5);
    tmp.multiplyScalar(0.72 + 0.42 * r);
    // Borde de hierba arriba (no en el desierto ni en la nieve) y musgo en los rellanos.
    if (pal === ROCK) {
      tmp.lerp(GRASS, lip * 0.85);
      if (g < 1.1) tmp.lerp(MOSS, 0.35);
    }
    col.push(tmp.r, tmp.g, tmp.b);
  };
  const tri = (A, B, C, top, pal) => {
    // Subdivisión del triángulo A, B, C en sub × sub triángulos.
    const P = (i, j) => {
      const u = i / sub;
      const v = j / sub;
      return [A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v, A[1] + (B[1] - A[1]) * u + (C[1] - A[1]) * v, A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v];
    };
    for (let i = 0; i < sub; i++) {
      for (let j = 0; j < sub - i; j++) {
        const p0 = P(i, j);
        const p1 = P(i + 1, j);
        const p2 = P(i, j + 1);
        for (const p of [p0, p1, p2]) vertex(p[0], p[1], p[2], top, pal, 1);
        if (i + j < sub - 1) {
          const p3 = P(i + 1, j + 1);
          for (const p of [p1, p3, p2]) vertex(p[0], p[1], p[2], top, pal, 1);
        }
      }
    }
  };
  for (let l = 0; l < res; l++) {
    for (let k = 0; k < res; k++) {
      const xa = x0 + k * cell;
      const za = z0 + l * cell;
      const ha = H(k, l);
      const hd = H(k + 1, l);
      const hb = H(k, l + 1);
      const hc = H(k + 1, l + 1);
      const lo = Math.min(ha, hb, hc, hd);
      const hi = Math.max(ha, hb, hc, hd);
      if (hi - lo < threshold) continue;
      const cx = xa + cell / 2;
      const cz = za + cell / 2;
      const wl = map.waterAt(cx, cz);
      if (wl !== null && wl > lo + 0.4) continue; // bajo el agua (cascadas y orillas): el terreno normal
      if (holes && (holes(cx, (lo + hi) / 2, cz) || holes(xa, ha, za) || holes(xa + cell, hc, za + cell))) continue; // boca de cueva
      const s = map.surfaceAt(cx, cz);
      const pal = s === SURFACE.SANDSTONE || s === SURFACE.DESERT ? SAND : s === SURFACE.SNOW || s === SURFACE.ICE || hi > 120 ? ICE : ROCK;
      const A = [xa, ha, za];
      const D = [xa + cell, hd, za];
      const B = [xa, hb, za + cell];
      const Cc = [xa + cell, hc, za + cell];
      tri(A, B, D, hi, pal);
      tri(B, Cc, D, hi, pal);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
