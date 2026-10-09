/**
 * Utilidades de la herramienta de mapas (solo Node, no las usa el juego):
 * rejillas, curvas, polígonos, distancias (Jump Flooding), desenfoque y PNG.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Máximo suave (k = anchura de la mezcla). */
export const smax = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (a - b)) / k, 0, 1);
  return lerp(b, a, h) + k * h * (1 - h);
};
export const smin = (a, b, k) => -smax(-a, -b, k);

// ---- Curvas -------------------------------------------------------------------

/**
 * Catmull-Rom centrípeta por los puntos (abierta o cerrada) remuestreada cada `step` m.
 * Los puntos pueden llevar más datos (altura, anchura, tipo): se interpolan los números.
 */
export function spline(points, { step = 8, closed = false } = {}) {
  const P = points;
  const n = P.length;
  if (n < 2) return P.map((p) => ({ ...p }));
  const get = (i) => (closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)]);
  const out = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const len = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    const k = Math.max(1, Math.ceil(len / step));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      const t2 = t * t;
      const t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      const q = { ...p1 };
      for (const key of Object.keys(p1)) {
        const v1 = p1[key];
        if (typeof v1 !== 'number') continue;
        if (key === 'x' || key === 'z') q[key] = cr(p0[key], v1, p2[key], p3[key]);
        else if (typeof p2[key] === 'number') q[key] = lerp(v1, p2[key], t); // datos: lineal
      }
      out.push(q);
    }
  }
  if (!closed) out.push({ ...P[n - 1] });
  return out;
}

/** Longitudes acumuladas de una polilínea (añade `s` a cada punto). */
export function measure(line) {
  let s = 0;
  line[0].s = 0;
  for (let i = 1; i < line.length; i++) {
    s += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z);
    line[i].s = s;
  }
  return s;
}

/** Punto más cercano de una polilínea: { d, i, t, s } (i: tramo, t: 0..1 dentro del tramo). */
export function nearestOnLine(line, x, z) {
  let best = { d: Infinity, i: 0, t: 0, s: 0 };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1e-9;
    let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
    t = clamp(t, 0, 1);
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, i, t, s: (a.s ?? 0) + Math.sqrt(l2) * t };
  }
  return best;
}

/** Valor interpolado de un campo numérico de la polilínea en (i, t). */
export const lineValue = (line, i, t, key) => lerp(line[i][key], line[Math.min(line.length - 1, i + 1)][key], t);

export function bbox(points, pad = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

export function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

// ---- Rejillas -----------------------------------------------------------------

/**
 * Rejilla de N×N muestras sobre el cuadrado [-half, half]² (separación `cell` m).
 * La muestra (i, j) está en x = -half + i·cell, z = -half + j·cell.
 */
export class Grid {
  constructor(n, half, Type = Float32Array) {
    this.n = n;
    this.half = half;
    this.cell = (2 * half) / (n - 1);
    this.data = new Type(n * n);
  }

  x(i) {
    return -this.half + i * this.cell;
  }

  z(j) {
    return -this.half + j * this.cell;
  }

  idx(i, j) {
    return j * this.n + i;
  }

  get(i, j) {
    const n = this.n;
    return this.data[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
  }

  /** Valor bilineal en coordenadas del mundo. */
  sample(x, z) {
    const n = this.n;
    const fx = clamp((x + this.half) / this.cell, 0, n - 1.0001);
    const fz = clamp((z + this.half) / this.cell, 0, n - 1.0001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const d = this.data;
    const k = j * n + i;
    return lerp(lerp(d[k], d[k + 1], tx), lerp(d[k + n], d[k + n + 1], tx), tz);
  }

  /** Recorre las muestras de una caja del mundo: fn(i, j, x, z, k). */
  forBox(box, fn) {
    const n = this.n;
    const i0 = clamp(Math.floor((box.minX + this.half) / this.cell), 0, n - 1);
    const i1 = clamp(Math.ceil((box.maxX + this.half) / this.cell), 0, n - 1);
    const j0 = clamp(Math.floor((box.minZ + this.half) / this.cell), 0, n - 1);
    const j1 = clamp(Math.ceil((box.maxZ + this.half) / this.cell), 0, n - 1);
    for (let j = j0; j <= j1; j++) {
      const z = this.z(j);
      for (let i = i0; i <= i1; i++) fn(i, j, this.x(i), z, j * n + i);
    }
  }

  forAll(fn) {
    const n = this.n;
    for (let j = 0; j < n; j++) {
      const z = this.z(j);
      for (let i = 0; i < n; i++) fn(i, j, this.x(i), z, j * n + i);
    }
  }

  clone(Type = this.data.constructor) {
    const g = new Grid(this.n, this.half, Type);
    g.data.set(this.data);
    return g;
  }
}

/** Desenfoque de caja separable (radio r muestras), opcionalmente solo donde mask > 0. */
export function blur(grid, r, passes = 1) {
  const n = grid.n;
  const tmp = new Float32Array(n * n);
  for (let p = 0; p < passes; p++) {
    const src = grid.data;
    for (let j = 0; j < n; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[j * n + clamp(i, 0, n - 1)];
      for (let i = 0; i < n; i++) {
        tmp[j * n + i] = acc / (2 * r + 1);
        acc += src[j * n + clamp(i + r + 1, 0, n - 1)] - src[j * n + clamp(i - r, 0, n - 1)];
      }
    }
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[clamp(j, 0, n - 1) * n + i];
      for (let j = 0; j < n; j++) {
        src[j * n + i] = acc / (2 * r + 1);
        acc += tmp[clamp(j + r + 1, 0, n - 1) * n + i] - tmp[clamp(j - r, 0, n - 1) * n + i];
      }
    }
  }
  return grid;
}

/**
 * Distancia a las "semillas" (celdas con seed[k] >= 0) por Jump Flooding.
 * Devuelve { dist: Float32Array (m), nearest: Int32Array (índice de la semilla) }.
 */
export function jumpFlood(n, cell, seeds) {
  let near = new Int32Array(n * n).fill(-1);
  for (let k = 0; k < n * n; k++) if (seeds[k] >= 0) near[k] = k;
  let next = new Int32Array(n * n);
  const d2 = (k, s) => {
    const dx = (k % n) - (s % n);
    const dz = ((k / n) | 0) - ((s / n) | 0);
    return dx * dx + dz * dz;
  };
  let step = 1;
  while (step < n) step <<= 1;
  for (step >>= 1; step >= 1; step >>= 1) {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let best = near[k];
        let bd = best >= 0 ? d2(k, best) : Infinity;
        for (let dj = -step; dj <= step; dj += step) {
          const jj = j + dj;
          if (jj < 0 || jj >= n) continue;
          for (let di = -step; di <= step; di += step) {
            const ii = i + di;
            if (ii < 0 || ii >= n || (di === 0 && dj === 0)) continue;
            const s = near[jj * n + ii];
            if (s < 0) continue;
            const dd = d2(k, s);
            if (dd < bd) {
              bd = dd;
              best = s;
            }
          }
        }
        next[k] = best;
      }
    }
    [near, next] = [next, near];
  }
  const dist = new Float32Array(n * n);
  for (let k = 0; k < n * n; k++) dist[k] = near[k] >= 0 ? Math.sqrt(d2(k, near[k])) * cell : Infinity;
  return { dist, nearest: near };
}

// ---- PNG ----------------------------------------------------------------------

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Guarda una imagen RGB (Uint8Array w·h·3) como PNG. */
export function writePNG(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(file, png);
}

/**
 * Índice de una polilínea para buscar rápido el punto más cercano: los tramos se
 * reparten en cubos de `cell` m. nearest(x, z) solo mira los cubos de alrededor
 * (hasta `reach` m); más lejos devuelve d = Infinity.
 */
export function lineIndex(line, reach, cell = 32) {
  const buckets = new Map();
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const x0 = Math.floor((Math.min(a.x, b.x) - reach) / cell);
    const x1 = Math.floor((Math.max(a.x, b.x) + reach) / cell);
    const z0 = Math.floor((Math.min(a.z, b.z) - reach) / cell);
    const z1 = Math.floor((Math.max(a.z, b.z) + reach) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const key = gx * 100003 + gz;
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(i);
      }
    }
  }
  const out = { d: Infinity, i: 0, t: 0, s: 0 };
  return function nearest(x, z) {
    out.d = Infinity;
    const list = buckets.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!list) return out;
    for (const i of list) {
      const a = line[i];
      const b = line[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1e-9;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < out.d) {
        out.d = d;
        out.i = i;
        out.t = t;
        out.s = (a.s ?? 0) + Math.sqrt(l2) * t;
      }
    }
    return out;
  };
}
