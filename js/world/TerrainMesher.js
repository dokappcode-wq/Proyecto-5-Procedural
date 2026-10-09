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

  /**
   * @param {object} chunk datos del chunk
   * @param {Function} [holeTest] (x, y, z) → true si ese trozo de terreno está abierto (boca de una cueva):
   *   los triángulos cuyo centro cae dentro no se dibujan.
   */
  build(chunk, holeTest = null) {
    const { res, spacing, originX, originZ, heights, biomeWeights, shore, surface } = chunk;
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
        ctx.surface = surface ? surface[pi] : undefined;
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
    geo.setIndex(holeTest ? this._holeIndex(res, positions, holeTest) : this._getIndex(res));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }

  /** Índice propio sin los triángulos de la boca de una cueva. */
  _holeIndex(res, p, holeTest) {
    const n = res + 1;
    const out = [];
    // Solo se quita un triángulo si está entero dentro de la boca (sus tres vértices y
    // su centro): así el borde del agujero nunca deja ver el vacío.
    const open = new Uint8Array(n * n);
    for (let v = 0; v < n * n; v++) open[v] = holeTest(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]) ? 1 : 0;
    const hole = (i, j, k) => open[i] && open[j] && open[k] && holeTest(
      (p[i * 3] + p[j * 3] + p[k * 3]) / 3,
      (p[i * 3 + 1] + p[j * 3 + 1] + p[k * 3 + 1]) / 3,
      (p[i * 3 + 2] + p[j * 3 + 2] + p[k * 3 + 2]) / 3,
    );
    for (let l = 0; l < res; l++) {
      for (let k = 0; k < res; k++) {
        const a = l * n + k;
        const b = a + n;
        const d = a + 1;
        const cc = b + 1;
        if (!hole(a, b, d)) out.push(a, b, d);
        if (!hole(b, cc, d)) out.push(b, cc, d);
      }
    }
    return new THREE.BufferAttribute(new (n * n > 65535 ? Uint32Array : Uint16Array)(out), 1);
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
