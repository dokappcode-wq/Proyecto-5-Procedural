import { PALETTE } from '../world/map/MapColorizer.js';
import { SURFACE } from '../world/map/MapLegend.js';

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

  /** Inverso de toMap: (u, v) del mapa → (x, z) del mundo. */
  fromMap(u, v) {
    return [(u - 0.5) * this._size, (v - 0.5) * this._size];
  }

  /** Genera `rows` filas más. @returns {boolean} true al terminar */
  step(rows = 10) {
    const w = this._world;
    if (!w.terrain || this.ready) return this.ready;
    if (w.map) return this._authored();
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

/**
 * Mapa de un mundo diseñado: dibujado a más resolución, con los colores de cada suelo,
 * bosques, agua, caminos, relieve sombreado y los nombres de regiones, lagos y lugares.
 */
PlanetMapRenderer.prototype._authored = function _authored() {
  const M = this._world.map;
  const S = 900;
  const c = this.canvas;
  c.width = c.height = S;
  this.resolution = S;
  const ctx = this._ctx;
  const img = ctx.createImageData(S, S);
  const data = img.data;
  const size = this._size;
  const cell = size / S;
  const at = (i, j) => [-size / 2 + (i + 0.5) * cell, -size / 2 + (j + 0.5) * cell];
  const forest = [0.18, 0.36, 0.17];
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const [x, z] = at(i, j);
      const h = M.heightAt(x, z);
      const lv = M.waterAt(x, z);
      const surf = M.surfaceAt(x, z);
      let col;
      if (lv !== null && h < lv && surf !== SURFACE.ICE) col = [0.27, 0.55, 0.72];
      else if (h < 0) {
        const t = Math.min(1, -h / 16);
        col = [0.38 - t * 0.24, 0.64 - t * 0.33, 0.74 - t * 0.2];
      } else {
        col = rgb(PALETTE[surf]?.[0] ?? 0x7aab4a);
        const f = M.floraInfo(x, z);
        if (f.type && f.density > 0.3 && (f.type <= 3 || f.type === 12)) col = mix(col, forest, Math.min(0.7, f.density * 0.75));
      }
      // Relieve (luz del noroeste) y curvas de nivel suaves.
      const dh = (M.heightAt(x - cell, z - cell) - M.heightAt(x + cell, z + cell)) / (cell * 2);
      const shade = h < 0 ? 1 : Math.max(0.6, Math.min(1.35, 1 + dh * 0.9));
      const contour = h > 2 && Math.abs((h % 20) - 10) > 9.4 ? 0.88 : 1;
      const k = (j * S + i) * 4;
      data[k] = Math.min(255, col[0] * 255 * shade * contour);
      data[k + 1] = Math.min(255, col[1] * 255 * shade * contour);
      data[k + 2] = Math.min(255, col[2] * 255 * shade * contour);
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Copia sin rótulos (la textura del planeta visto desde el espacio).
  this.plainCanvas = document.createElement('canvas');
  this.plainCanvas.width = this.plainCanvas.height = S;
  this.plainCanvas.getContext('2d').putImageData(img, 0, 0);
  const meta = M.meta;
  const px = (x) => (x / size + 0.5) * S;
  // Caminos (línea discontinua).
  ctx.save();
  ctx.strokeStyle = 'rgba(120, 82, 46, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 3]);
  for (const r of meta.roads ?? []) {
    ctx.beginPath();
    r.points.forEach((p, k) => (k ? ctx.lineTo(px(p.x), px(p.z)) : ctx.moveTo(px(p.x), px(p.z))));
    ctx.stroke();
  }
  ctx.restore();
  const label = (text, x, z, { size: fs = 13, color = '#2b2418', italic = false, bold = false, halo = 'rgba(255, 250, 236, 0.85)' } = {}) => {
    ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fs}px Georgia, 'Times New Roman', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = halo;
    ctx.strokeText(text, px(x), px(z));
    ctx.fillStyle = color;
    ctx.fillText(text, px(x), px(z));
  };
  // Regiones.
  const seen = new Set();
  for (const r of meta.regions ?? []) {
    if (!r.center || seen.has(r.name)) continue;
    seen.add(r.name);
    label(r.name.toUpperCase(), r.center.x, r.center.z, { size: 12, color: '#3b2f1e', bold: true });
  }
  // Lagos, ríos y lugares.
  const lakeNames = new Set();
  for (const l of meta.lakes ?? []) {
    if (lakeNames.has(l.name) || l.points.length < 6) continue;
    lakeNames.add(l.name);
    let x = 0;
    let z = 0;
    for (const p of l.points) {
      x += p.x;
      z += p.z;
    }
    label(l.name, x / l.points.length, z / l.points.length + 34, { size: 11, color: '#1d4f73', italic: true });
  }
  for (const r of meta.rivers ?? []) {
    const p = r.points[Math.floor(r.points.length * 0.45)];
    if (p && r.points.length > 8) label(r.name, p.x + 40, p.z, { size: 10, color: '#1d4f73', italic: true });
  }
  for (const p of meta.pois ?? []) {
    ctx.fillStyle = '#5a2a1a';
    ctx.beginPath();
    ctx.arc(px(p.x), px(p.z), 2.6, 0, Math.PI * 2);
    ctx.fill();
    label(p.name, p.x, p.z - 26, { size: 10, color: '#5a2a1a' });
  }
  for (const cv of meta.caves ?? []) {
    ctx.fillStyle = '#2a2622';
    ctx.beginPath();
    ctx.moveTo(px(cv.mouth.x), px(cv.mouth.z) - 5);
    ctx.lineTo(px(cv.mouth.x) - 5, px(cv.mouth.z) + 4);
    ctx.lineTo(px(cv.mouth.x) + 5, px(cv.mouth.z) + 4);
    ctx.fill();
    label(cv.name, cv.mouth.x, cv.mouth.z + 24, { size: 10, color: '#2a2622', italic: true });
  }
  // Heights para quien los use (sombra del marcador): no hacen falta aquí.
  this._row = this.resolution;
  this.onReady?.();
  return true;
};

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
