import * as THREE from 'three';

/**
 * CaveSurfaceMesher — malla de las cuevas de los mapas diseñados, por "surface nets":
 * el hueco de la cueva es la unión de todos sus tramos (la misma forma que usa la
 * colisión: sección elíptica con el suelo plano), así los ramales y las salas se unen
 * sin paredes en medio y lo que se ve coincide con lo que se pisa.
 *
 * Las paredes y el techo llevan relieve (ruido 3D) que solo se aleja del hueco
 * caminable; el suelo se queda plano. En la boca, lo que asoma sobre el terreno no se
 * dibuja (el terreno tiene ahí su agujero).
 */
const FLOOR_K = 0.7;
const CEIL_K = 0.85;
const H = 0.55; // m entre muestras
const B = 22;   // celdas por bloque

/** Colores de cada ambiente: [roca, roca oscura, suelo, acento]. */
export const CAVE_THEMES = {
  roots: { rock: 0x6f675c, dark: 0x4f4840, floor: 0x5b5040, accent: 0x5f7a3a, light: 0x9fe7c0 },
  mine: { rock: 0x786a5a, dark: 0x54493d, floor: 0x6a5a46, accent: 0xa66a3a, light: 0xffb060 },
  crystal: { rock: 0x5e5870, dark: 0x3d3850, floor: 0x4e4858, accent: 0xb48cff, light: 0xb890ff },
  ice: { rock: 0x9fc3d8, dark: 0x6f97b3, floor: 0xd8eaf4, accent: 0xe8f6ff, light: 0x9fdcff },
  mushroom: { rock: 0x5c5a52, dark: 0x3f3d37, floor: 0x4b4a3a, accent: 0x3fc7b0, light: 0x5fffd8 },
  sea: { rock: 0x6c7470, dark: 0x4c5452, floor: 0xb9a878, accent: 0x5a8a6a, light: 0x9fd4e0 },
  dungeon: { rock: 0x6b665f, dark: 0x4a4640, floor: 0x4f473e, accent: 0x6a6a72, light: 0x8fc0ff },
};

// Ruido de valor 3D (rápido y suficiente para el relieve de las paredes).
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const w = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  ) * 2 - 1;
}

/** Tramos de un grupo de cuevas (una cueva y sus ramales) con su caja. */
function segmentsOf(chains) {
  const segs = [];
  for (const c of chains) {
    for (let i = 0; i < c.nodes.length - 1; i++) {
      const a = c.nodes[i];
      const b = c.nodes[i + 1];
      const wr = Math.max(a.r * (a.w ?? 1), b.r * (b.w ?? 1));
      const r = Math.max(a.r, b.r);
      segs.push({
        a, b, dx: b.x - a.x, dz: b.z - a.z, len2: (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-6,
        minX: Math.min(a.x, b.x) - wr - 1.5, maxX: Math.max(a.x, b.x) + wr + 1.5,
        minZ: Math.min(a.z, b.z) - wr - 1.5, maxZ: Math.max(a.z, b.z) + wr + 1.5,
        minY: Math.min(a.floor, b.floor) - 1.5, maxY: Math.max(a.floor, b.floor) + (FLOOR_K + CEIL_K) * r * 1.25 + 1.5,
      });
    }
  }
  return segs;
}

/**
 * Campo de un grupo de cuevas con el relieve de las paredes: F(x, y, z) < 0 en el hueco,
 * > 0 en la roca (≈ metros). Lo usan la malla y la decoración (para pegarse a la roca).
 */
export function caveField(chains) {
  const segs = segmentsOf(chains);
  const F = (x, y, z) => {
    const f = field(segs, x, y, z);
    if (f.v > 2.5) return f.v;
    const up = Math.min(1, Math.max(0, (y - f.floor - 0.35) / 1.2));
    const n = vnoise(x * 0.32, y * 0.32, z * 0.32) * 0.75 + vnoise(x * 0.9 + 7, y * 0.9, z * 0.9) * 0.28;
    return f.v - Math.max(0, n) * up * 0.9;
  };
  return { F, segs };
}

/** Campo: negativo dentro del hueco, positivo en la roca (≈ metros). */
function field(segs, x, y, z) {
  let best = Infinity;
  let floorAt = -Infinity;
  for (const s of segs) {
    if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ || y < s.minY || y > s.maxY) continue;
    let t = ((x - s.a.x) * s.dx + (z - s.a.z) * s.dz) / s.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - s.a.x - s.dx * t, z - s.a.z - s.dz * t);
    const r = s.a.r + (s.b.r - s.a.r) * t;
    const wr = r * ((s.a.w ?? 1) + ((s.b.w ?? 1) - (s.a.w ?? 1)) * t);
    const floor = s.a.floor + (s.b.floor - s.a.floor) * t;
    const yc = floor + FLOOR_K * r;
    const dy = y - yc;
    const ey = dy >= 0 ? dy / (CEIL_K * r) : -dy / (FLOOR_K * r * 1.3);
    const ex = d / wr;
    let m = Math.sqrt(ex * ex + ey * ey);
    if (y < floor) m = Math.max(m, 1 + (floor - y) / r);
    const v = (m - 1) * Math.min(wr, r * 1.2);
    if (v < best) {
      best = v;
      floorAt = floor;
    }
  }
  if (best === Infinity) return { v: 3, floor: -Infinity };
  return { v: best, floor: floorAt };
}

/**
 * Geometría de un grupo de cuevas. `heightAt` (terreno) recorta lo que asoma en la boca.
 * @returns {THREE.BufferGeometry|null}
 */
export function buildCaveSurface(chains, heightAt, themeId = 'roots') {
  const it = caveSurfaceSteps(chains, heightAt, themeId);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** Igual, por pasos (un bloque cada vez): para repartir el trabajo entre fotogramas. */
export function* caveSurfaceSteps(chains, heightAt, themeId = 'roots') {
  const T = CAVE_THEMES[themeId] ?? CAVE_THEMES.roots;
  const { F, segs } = caveField(chains);
  if (!segs.length) return null;
  const cRock = new THREE.Color(T.rock);
  const cDark = new THREE.Color(T.dark);
  const cFloor = new THREE.Color(T.floor);
  const cAcc = new THREE.Color(T.accent);
  const tmp = new THREE.Color();

  // Bloques que tocan algún tramo.
  const blocks = new Set();
  const S = B * H;
  for (const s of segs) {
    for (let bx = Math.floor(s.minX / S); bx <= Math.floor(s.maxX / S); bx++) {
      for (let by = Math.floor(s.minY / S); by <= Math.floor(s.maxY / S); by++) {
        for (let bz = Math.floor(s.minZ / S); bz <= Math.floor(s.maxZ / S); bz++) blocks.add(`${bx},${by},${bz}`);
      }
    }
  }
  const pos = [];
  const col = [];
  const nor = [];
  const idx = [];
  const P = B + 3; // puntos por lado (de -1 a B+1)
  const vals = new Float32Array(P * P * P);
  const cellV = new Int32Array((B + 2) * (B + 2) * (B + 2));
  const pi = (a, b, c) => (c * P + b) * P + a;
  const ci = (a, b, c) => (c * (B + 2) + b) * (B + 2) + a;
  const e = 0.3;
  for (const key of blocks) {
    yield;
    const [bx, by, bz] = key.split(',').map(Number);
    const gx0 = bx * B - 1;
    const gy0 = by * B - 1;
    const gz0 = bz * B - 1;
    let neg = false;
    let posi = false;
    for (let c = 0; c < P; c++) {
      for (let b = 0; b < P; b++) {
        for (let a = 0; a < P; a++) {
          const v = F((gx0 + a) * H, (gy0 + b) * H, (gz0 + c) * H);
          vals[pi(a, b, c)] = v;
          if (v < 0) neg = true;
          else posi = true;
        }
      }
    }
    if (!neg || !posi) continue;
    cellV.fill(-1);
    // Un vértice por celda con cambio de signo (media de los cortes de sus aristas).
    for (let c = 0; c < B + 2; c++) {
      for (let b = 0; b < B + 2; b++) {
        for (let a = 0; a < B + 2; a++) {
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let n = 0;
          for (const [a0, b0, c0, a1, b1, c1] of EDGES) {
            const v0 = vals[pi(a + a0, b + b0, c + c0)];
            const v1 = vals[pi(a + a1, b + b1, c + c1)];
            if (v0 < 0 === v1 < 0) continue;
            const t = v0 / (v0 - v1);
            sx += a0 + (a1 - a0) * t;
            sy += b0 + (b1 - b0) * t;
            sz += c0 + (c1 - c0) * t;
            n++;
          }
          if (!n) continue;
          const x = (gx0 + a + sx / n) * H;
          const y = (gy0 + b + sy / n) * H;
          const z = (gz0 + c + sz / n) * H;
          // Normal: hacia el hueco (−gradiente).
          let nx = F(x - e, y, z) - F(x + e, y, z);
          let ny = F(x, y - e, z) - F(x, y + e, z);
          let nz = F(x, y, z - e) - F(x, y, z + e);
          const nl = Math.hypot(nx, ny, nz) || 1;
          nx /= nl;
          ny /= nl;
          nz /= nl;
          cellV[ci(a, b, c)] = pos.length / 3;
          pos.push(x, y, z);
          nor.push(nx, ny, nz);
          // Color: suelo (mira arriba), techo y paredes con vetas y manchas.
          const spot = vnoise(x * 0.15, y * 0.15, z * 0.15);
          const vein = Math.abs(vnoise(x * 0.5 + 3, y * 1.6, z * 0.5));
          if (ny > 0.55) tmp.copy(cFloor).lerp(cDark, Math.max(0, spot) * 0.5);
          else tmp.copy(cRock).lerp(cDark, Math.max(0, -spot) * 0.8 + (ny < -0.5 ? 0.25 : 0));
          if (vein < 0.08) tmp.lerp(cAcc, (1 - vein / 0.08) * (themeId === 'crystal' || themeId === 'ice' ? 0.75 : 0.35));
          const k = 0.88 + 0.24 * hash3(Math.round(x * 3), Math.round(y * 3), Math.round(z * 3));
          col.push(tmp.r * k, tmp.g * k, tmp.b * k);
        }
      }
    }
    // Una cara por arista con cambio de signo (solo las aristas de este bloque).
    for (let c = 1; c <= B; c++) {
      for (let b = 1; b <= B; b++) {
        for (let a = 1; a <= B; a++) {
          const v0 = vals[pi(a, b, c)];
          for (let axis = 0; axis < 3; axis++) {
            const v1 = axis === 0 ? vals[pi(a + 1, b, c)] : axis === 1 ? vals[pi(a, b + 1, c)] : vals[pi(a, b, c + 1)];
            if (v0 < 0 === v1 < 0) continue;
            // Las cuatro celdas que comparten la arista.
            let q;
            if (axis === 0) q = [ci(a, b - 1, c - 1), ci(a, b, c - 1), ci(a, b, c), ci(a, b - 1, c)];
            else if (axis === 1) q = [ci(a - 1, b, c - 1), ci(a, b, c - 1), ci(a, b, c), ci(a - 1, b, c)];
            else q = [ci(a - 1, b - 1, c), ci(a, b - 1, c), ci(a, b, c), ci(a - 1, b, c)];
            const vq = q.map((k) => cellV[k]);
            if (vq.some((v) => v < 0)) continue;
            // Lo que asoma por encima del terreno (la boca) no se dibuja.
            const mx = (pos[vq[0] * 3] + pos[vq[2] * 3]) / 2;
            const my = (pos[vq[0] * 3 + 1] + pos[vq[2] * 3 + 1]) / 2;
            const mz = (pos[vq[0] * 3 + 2] + pos[vq[2] * 3 + 2]) / 2;
            if (my > heightAt(mx, mz) + 0.05) continue;
            const flip = (v0 < 0) === (axis === 1);
            if (flip) idx.push(vq[0], vq[1], vq[2], vq[0], vq[2], vq[3]);
            else idx.push(vq[0], vq[2], vq[1], vq[0], vq[3], vq[2]);
          }
        }
      }
    }
  }
  if (!idx.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

// Las 12 aristas de una celda: [a0, b0, c0, a1, b1, c1].
const EDGES = [
  [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
  [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
  [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1],
];
