import { SeededRandom } from '../../core/SeededRandom.js';

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD_X = [1, -1, 1, -1, 1, -1, 0, 0];
const GRAD_Z = [1, 1, -1, -1, 0, 0, 1, -1];

/**
 * Ruido Simplex 2D con seed (basado en la implementación de dominio público
 * de Stefan Gustavson). Devuelve valores aproximadamente en [-1, 1].
 */
export class SimplexNoise {
  constructor(seed) {
    const rng = new SeededRandom(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this._perm = new Uint8Array(512);
    this._grad = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this._perm[i] = p[i & 255];
      this._grad[i] = this._perm[i] & 7;
    }
  }

  noise2D(x, z) {
    const perm = this._perm;
    const grad = this._grad;

    const s = (x + z) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(z + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const z0 = z - (j - t);

    const i1 = x0 > z0 ? 1 : 0;
    const j1 = x0 > z0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const z1 = z0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const z2 = z0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n = 0;
    let t0 = 0.5 - x0 * x0 - z0 * z0;
    if (t0 > 0) {
      const g = grad[ii + perm[jj]];
      t0 *= t0;
      n += t0 * t0 * (GRAD_X[g] * x0 + GRAD_Z[g] * z0);
    }
    let t1 = 0.5 - x1 * x1 - z1 * z1;
    if (t1 > 0) {
      const g = grad[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n += t1 * t1 * (GRAD_X[g] * x1 + GRAD_Z[g] * z1);
    }
    let t2 = 0.5 - x2 * x2 - z2 * z2;
    if (t2 > 0) {
      const g = grad[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n += t2 * t2 * (GRAD_X[g] * x2 + GRAD_Z[g] * z2);
    }
    return 70 * n;
  }

  /** Ruido fractal (fBm) normalizado a ~[-1, 1]. */
  fbm(x, z, { frequency, octaves = 4, lacunarity = 2, gain = 0.5 }) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = frequency;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2D(x * f, z * f);
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }

  /** Ruido "ridged" (crestas afiladas) normalizado a [0, 1]. Ideal para montañas. */
  ridged(x, z, { frequency, octaves = 5, lacunarity = 2, gain = 0.5 }) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = frequency;
    let weight = 1;
    for (let o = 0; o < octaves; o++) {
      let r = 1 - Math.abs(this.noise2D(x * f, z * f));
      r *= r * weight;
      weight = Math.min(1, Math.max(0, r * 2));
      sum += amp * r;
      norm += amp;
      amp *= gain;
      f *= lacunarity;
    }
    return sum / norm;
  }
}
