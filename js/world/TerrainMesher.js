import * as THREE from 'three';

/**
 * TerrainMesher — convierte los datos de un chunk en geometría.
 *
 * Los datos incluyen un borde de 1 muestra (rejilla "padded") para calcular
 * normales y curvatura con diferencias centrales, lo que evita costuras de
 * iluminación y color entre chunks vecinos.
 *
 * Triangulación de cada celda (k = eje X, l = eje Z):
 *   a(k,l)  d(k+1,l)
 *   b(k,l+1) c(k+1,l+1)      triángulos (a,b,d) y (b,c,d)
 * WorldGenerator.getHeightAt interpola con esta misma diagonal, de modo que
 * la física coincide exactamente con lo que se ve.
 */
export class TerrainMesher {
  /**
   * @param {(ctx:object, out:THREE.Color) => void} colorizer ver BiomeColorizer
   */
  constructor({ colorizer }) {
    this._colorizer = colorizer;
    this._color = new THREE.Color();
    this._indexCache = new Map();
    this._ctx = { x: 0, z: 0, height: 0, normalY: 1, concavity: 0, shore: 0, weights: {} };
  }

  setColorizer(colorizer) {
    this._colorizer = colorizer;
  }

  build(chunk) {
    const { res, spacing, originX, originZ, heights, biomeWeights, shore } = chunk;
    const stride = res + 3;
    const n = res + 1;
    const positions = new Float32Array(n * n * 3);
    const normals = new Float32Array(n * n * 3);
    const colors = new Float32Array(n * n * 3);
    const c = this._color;
    const ctx = this._ctx;
    const ids = Object.keys(biomeWeights);

    let v = 0;
    for (let l = 0; l < n; l++) {
      for (let k = 0; k < n; k++) {
        const pi = (l + 1) * stride + (k + 1);
        const h = heights[pi];
        const x = originX + k * spacing;
        const z = originZ + l * spacing;
        const hL = heights[pi - 1];
        const hR = heights[pi + 1];
        const hD = heights[pi - stride];
        const hU = heights[pi + stride];

        // Normal por diferencias centrales: (hL - hR, 2s, hD - hU)
        let nx = hL - hR;
        let ny = 2 * spacing;
        let nz = hD - hU;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;

        positions[v] = x; positions[v + 1] = h; positions[v + 2] = z;
        normals[v] = nx; normals[v + 1] = ny; normals[v + 2] = nz;

        ctx.x = x;
        ctx.z = z;
        ctx.height = h;
        ctx.normalY = ny;
        ctx.concavity = (hL + hR + hD + hU) / 4 - h; // >0 hondonada, <0 cresta
        ctx.shore = shore ? shore[pi] : 0;
        for (const id of ids) ctx.weights[id] = biomeWeights[id][pi];
        this._colorizer(ctx, c);
        colors[v] = c.r; colors[v + 1] = c.g; colors[v + 2] = c.b;
        v += 3;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(this._getIndex(res));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  /** El índice es idéntico para todos los chunks de igual resolución: se comparte. */
  _getIndex(res) {
    if (this._indexCache.has(res)) return this._indexCache.get(res);
    const n = res + 1;
    const idx = new (n * n > 65535 ? Uint32Array : Uint16Array)(res * res * 6);
    let i = 0;
    for (let l = 0; l < res; l++) {
      for (let k = 0; k < res; k++) {
        const a = l * n + k;
        const b = a + n;
        const d = a + 1;
        const cc = b + 1;
        idx[i++] = a; idx[i++] = b; idx[i++] = d;
        idx[i++] = b; idx[i++] = cc; idx[i++] = d;
      }
    }
    const attr = new THREE.BufferAttribute(idx, 1);
    this._indexCache.set(res, attr);
    return attr;
  }
}
