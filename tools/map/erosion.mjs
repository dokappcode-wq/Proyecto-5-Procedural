/**
 * Erosión hidráulica por gotas (como la lluvia: cada gota baja por la ladera, arranca
 * tierra donde corre deprisa y la deja donde se frena) y erosión térmica (los
 * desprendimientos de las laderas demasiado empinadas). Da al relieve sus barrancos,
 * cauces y conos de derrubios. Solo la usa la herramienta de mapas.
 *
 * Las alturas se tratan en unidades de celda (altura / tamaño de celda) para que las
 * pendientes tengan su valor real.
 */
import { SeededRandom } from '../../js/core/SeededRandom.js';

/**
 * @param {Float32Array} h alturas (m), N×N
 * @param {object} o
 * @param {number} o.n
 * @param {number} o.cell m entre muestras
 * @param {Float32Array} [o.mask] 0..1 cuánto se puede erosionar cada celda
 * @param {Float32Array} [o.flow] acumulador del agua que pasa (sale aquí)
 */
export function erode(h, { n, cell, drops = 600000, seed = 1, mask = null, flow = null, radius = 3, inertia = 0.06, capacity = 4,
  minCapacity = 0.01, erodeSpeed = 0.3, depositSpeed = 0.3, evaporate = 0.015, gravity = 4, lifetime = 45, startWater = 1, startSpeed = 1, onProgress = null }) {
  const rng = new SeededRandom(seed);
  const H = h;
  const inv = 1 / cell;
  for (let k = 0; k < H.length; k++) H[k] *= inv;

  // Pincel de erosión: celdas a menos de `radius` con su peso.
  const brushOff = [];
  const brushW = [];
  let wsum = 0;
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const w = 1 - d / radius;
      brushOff.push([dx, dz]);
      brushW.push(w);
      wsum += w;
    }
  }
  for (let i = 0; i < brushW.length; i++) brushW[i] /= wsum;

  const hg = { h: 0, gx: 0, gz: 0 };
  const heightGrad = (px, pz) => {
    const i = Math.floor(px);
    const j = Math.floor(pz);
    const u = px - i;
    const v = pz - j;
    const k = j * n + i;
    const a = H[k];
    const b = H[k + 1];
    const c = H[k + n];
    const d = H[k + n + 1];
    hg.gx = (b - a) * (1 - v) + (d - c) * v;
    hg.gz = (c - a) * (1 - u) + (d - b) * u;
    hg.h = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
    return hg;
  };

  for (let drop = 0; drop < drops; drop++) {
    if (onProgress && drop % 100000 === 0) onProgress(drop / drops);
    let px = rng.range(1, n - 2);
    let pz = rng.range(1, n - 2);
    let dx = 0;
    let dz = 0;
    let speed = startSpeed;
    let water = startWater;
    let sediment = 0;
    for (let life = 0; life < lifetime; life++) {
      const i = Math.floor(px);
      const j = Math.floor(pz);
      const u = px - i;
      const v = pz - j;
      const k = j * n + i;
      const g = heightGrad(px, pz);
      const h0 = g.h;
      dx = dx * inertia - g.gx * (1 - inertia);
      dz = dz * inertia - g.gz * (1 - inertia);
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) break;
      dx /= len;
      dz /= len;
      px += dx;
      pz += dz;
      if (px < 1 || px >= n - 2 || pz < 1 || pz >= n - 2) break;
      if (flow) flow[k] += water;
      const h1 = heightGrad(px, pz).h;
      const dh = h1 - h0;
      const m = mask ? mask[k] : 1;
      const cap = Math.max(-dh * speed * water * capacity, minCapacity);
      if (sediment > cap || dh > 0) {
        // Depositar en las cuatro esquinas de la celda.
        const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - cap) * depositSpeed;
        sediment -= amount;
        H[k] += amount * (1 - u) * (1 - v);
        H[k + 1] += amount * u * (1 - v);
        H[k + n] += amount * (1 - u) * v;
        H[k + n + 1] += amount * u * v;
      } else if (m > 0) {
        const amount = Math.min((cap - sediment) * erodeSpeed, -dh) * m;
        for (let b = 0; b < brushOff.length; b++) {
          const bi = i + brushOff[b][0];
          const bj = j + brushOff[b][1];
          if (bi < 0 || bj < 0 || bi >= n || bj >= n) continue;
          const bk = bj * n + bi;
          const mk = mask ? mask[bk] : 1;
          if (mk <= 0) continue;
          const w = amount * brushW[b] * mk;
          const take = H[bk] < w ? H[bk] : w;
          H[bk] -= take;
          sediment += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed + dh * gravity));
      water *= 1 - evaporate;
    }
  }
  for (let k = 0; k < H.length; k++) H[k] *= cell;
  return H;
}

/**
 * Erosión térmica: donde el desnivel con un vecino supera `talus` (m por celda), una
 * parte cae ladera abajo. Respeta `mask` (los acantilados diseñados se quedan).
 */
export function thermal(h, { n, talus, rate = 0.25, iterations = 6, mask = null }) {
  const nb = [1, -1, n, -n];
  for (let it = 0; it < iterations; it++) {
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const k = j * n + i;
        const m = mask ? mask[k] : 1;
        if (m <= 0) continue;
        let maxD = 0;
        let to = -1;
        for (const o of nb) {
          const d = h[k] - h[k + o];
          if (d > maxD) {
            maxD = d;
            to = k + o;
          }
        }
        if (to >= 0 && maxD > talus) {
          const move = (maxD - talus) * rate * m;
          h[k] -= move;
          h[to] += move;
        }
      }
    }
  }
  return h;
}
