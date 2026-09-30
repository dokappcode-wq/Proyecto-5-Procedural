/**
 * PlanetMapRenderer — dibuja el mapa de la región de un cuerpo visto desde arriba en un canvas.
 *
 * Muestrea el generador de terreno (altura + pesos de bioma) en una rejilla de
 * `resolution`² puntos que cubre todo el mundo (incluido el mar del borde) y
 * colorea por bioma, nieve, arena, charcas y mar, con sombreado del relieve.
 * Se genera por filas en varios frames (`step`) para no congelar el juego, y
 * se rehace al regenerar el mundo (`reset`).
 */
export class PlanetMapRenderer {
  constructor({ world, planet, worldSize, resolution }) {
    this.name = 'planetMap';
    this._world = world;
    this._planet = planet;
    this._size = worldSize;
    this.resolution = resolution;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = resolution;
    this._ctx = this.canvas.getContext('2d');
    this.onReady = null;
    this.reset();
  }

  get ready() {
    return this._row >= this.resolution;
  }

  get progress() {
    return Math.min(1, this._row / this.resolution);
  }

  reset() {
    const n = this.resolution;
    this._row = 0;
    this._heights = new Float32Array(n * n);
    this._colors = new Float32Array(n * n * 3);
    this._image = this._ctx.createImageData(n, n);
  }

  /** Bucle: unas filas por frame hasta terminar. */
  update() {
    if (!this.ready) this.step(6);
  }

  /** Mundo (x, z) → posición en el mapa (0..1). */
  toMap(x, z) {
    return [x / this._size + 0.5, z / this._size + 0.5];
  }

  /** Genera `rows` filas más. @returns {boolean} true al terminar */
  step(rows = 10) {
    const w = this._world;
    if (!w.terrain || this.ready) return this.ready;
    const n = this.resolution;
    const P = this._planet;
    const B = P.BIOMES;
    const ids = Object.keys(B);
    const cell = this._size / n;
    const sea = w.seaLevel;
    const end = Math.min(n, this._row + rows);
    for (let j = this._row; j < end; j++) {
      for (let i = 0; i < n; i++) {
        const x = -this._size / 2 + (i + 0.5) * cell;
        const z = -this._size / 2 + (j + 0.5) * cell;
        const s = w.terrain.sample(x, z);
        const h = s.height;
        const k = j * n + i;
        this._heights[k] = h;
        let r = 0;
        let g = 0;
        let b = 0;
        if (h < sea) {
          const depth = Math.min(1, (sea - h) / 9);
          [r, g, b] = mix(rgb(P.COLORS.SEA), [0.1, 0.25, 0.4], depth * 0.5);
        } else if (w.water.isWater(x, z)) {
          [r, g, b] = rgb(P.WATER.COLOR);
        } else if (h < sea + P.COLORS.SAND_HEIGHT) {
          [r, g, b] = rgb(P.COLORS.SAND);
        } else {
          for (const id of ids) {
            const wgt = s.biomes[id] ?? 0;
            if (!wgt) continue;
            const c = rgb(B[id].COLORS.GROUND);
            r += c[0] * wgt;
            g += c[1] * wgt;
            b += c[2] * wgt;
          }
          const snowH = B.FROZEN_MOUNTAINS?.SNOW_START_HEIGHT;
          if (snowH !== undefined && (s.biomes.FROZEN_MOUNTAINS ?? 0) > 0.4 && h > snowH) {
            [r, g, b] = mix([r, g, b], rgb(B.FROZEN_MOUNTAINS.COLORS.SNOW), Math.min(1, (h - snowH) / 8));
          }
        }
        this._colors[k * 3] = r;
        this._colors[k * 3 + 1] = g;
        this._colors[k * 3 + 2] = b;
      }
    }
    this._row = end;
    if (this.ready) this._paint();
    return this.ready;
  }

  /** Sombreado del relieve (luz del noroeste) y volcado al canvas. */
  _paint() {
    const n = this.resolution;
    const H = this._heights;
    const data = this._image.data;
    const cell = this._size / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const hl = H[j * n + Math.max(0, i - 1)];
        const hr = H[j * n + Math.min(n - 1, i + 1)];
        const hu = H[Math.max(0, j - 1) * n + i];
        const hd = H[Math.min(n - 1, j + 1) * n + i];
        const water = H[k] < this._world.seaLevel;
        const shade = water ? 1 : Math.max(0.55, Math.min(1.35, 1 + ((hl - hr) + (hu - hd)) / (cell * 2.2)));
        data[k * 4] = Math.min(255, this._colors[k * 3] * 255 * shade);
        data[k * 4 + 1] = Math.min(255, this._colors[k * 3 + 1] * 255 * shade);
        data[k * 4 + 2] = Math.min(255, this._colors[k * 3 + 2] * 255 * shade);
        data[k * 4 + 3] = 255;
      }
    }
    this._ctx.putImageData(this._image, 0, 0);
    this.onReady?.();
  }
}

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
