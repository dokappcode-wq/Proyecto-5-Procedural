import { HEIGHT_OFFSET, HEIGHT_SCALE, BIOME_IDS, SEA, SURFACE, FLORA } from './MapLegend.js';

/**
 * MapData — un mapa diseñado ya preparado (maps/<id>/<id>.map.json + .map.bin.gz):
 * rejillas de 2 m con la altura, el agua dulce, el suelo, el bioma, la región y la
 * vegetación de cada punto, y los datos del diseño (lugares, ríos, lagos, caminos…).
 *
 * Solo se cargan mapas del propio juego (nunca de un sistema importado): el archivo de
 * datos es binario y se lee como números; no se ejecuta nada.
 */
export class MapData {
  /** Carga en el navegador (fetch + DecompressionStream). */
  static async load(id, base = 'maps') {
    if (!/^[a-z0-9_-]+$/.test(id)) throw new Error(`mapa no válido: ${id}`);
    const [meta, bin] = await Promise.all([
      fetch(`${base}/${id}/${id}.map.json`).then((r) => {
        if (!r.ok) throw new Error(`no se pudo leer el mapa ${id} (${r.status})`);
        return r.json();
      }),
      fetch(`${base}/${id}/${id}.map.bin.gz`).then(async (r) => {
        if (!r.ok) throw new Error(`no se pudo leer el mapa ${id} (${r.status})`);
        const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer();
      }),
    ]);
    return new MapData(meta, bin);
  }

  /** Carga desde el disco (Node: tests y herramientas). */
  static fromFiles(meta, gunzipped) {
    const buf = gunzipped.buffer.slice(gunzipped.byteOffset, gunzipped.byteOffset + gunzipped.byteLength);
    return new MapData(meta, buf);
  }

  constructor(meta, buffer) {
    this.meta = meta;
    this.id = meta.id;
    this.name = meta.name;
    this.n = meta.n;
    this.half = meta.half;
    this.cell = meta.cell;
    this.size = meta.half * 2;
    const n = this.n;
    const L = meta.layout;
    const section = (name) => {
      const s = L[name];
      if (!s || s.offset + s.bytes > buffer.byteLength) throw new Error(`mapa ${meta.id}: falta la capa ${name}`);
      return s;
    };
    const decode = (name) => {
      const s = section(name);
      const d = new Int16Array(buffer, s.offset, s.bytes / 2);
      const out = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        let acc = 0;
        const row = j * n;
        for (let i = 0; i < n; i++) {
          acc = (acc + d[row + i]) & 0xffff;
          out[row + i] = acc === 0 ? NaN : acc / HEIGHT_SCALE - HEIGHT_OFFSET;
        }
      }
      return out;
    };
    const bytes = (name) => {
      const s = section(name);
      return new Uint8Array(buffer, s.offset, s.bytes);
    };
    this.heights = decode('height');
    this.water = decode('water');
    this.surface = bytes('surface');
    this.biome = bytes('biome');
    this.region = bytes('region');
    this.flora = bytes('flora');
    this.regions = meta.regions ?? [];
    this._w = {};
  }

  // ---- Índices ----------------------------------------------------------------------

  /** Índice de la muestra más cercana a (x, z). */
  index(x, z) {
    const n = this.n;
    const i = Math.min(n - 1, Math.max(0, Math.round((x + this.half) / this.cell)));
    const j = Math.min(n - 1, Math.max(0, Math.round((z + this.half) / this.cell)));
    return j * n + i;
  }

  /** Altura bilineal en (x, z) (fuera del mapa, la del borde). */
  heightAt(x, z) {
    const n = this.n;
    const fx = Math.min(n - 1.0001, Math.max(0, (x + this.half) / this.cell));
    const fz = Math.min(n - 1.0001, Math.max(0, (z + this.half) / this.cell));
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const h = this.heights;
    const k = j * n + i;
    const a = h[k] + (h[k + 1] - h[k]) * tx;
    const b = h[k + n] + (h[k + n + 1] - h[k + n]) * tx;
    return a + (b - a) * tz;
  }

  /** Nivel del agua dulce en (x, z) (río, lago, poza) o null. */
  waterAt(x, z) {
    const v = this.water[this.index(x, z)];
    return Number.isNaN(v) ? null : v;
  }

  surfaceAt(x, z) {
    return this.surface[this.index(x, z)];
  }

  floraAt(x, z) {
    return this.flora[this.index(x, z)];
  }

  /** Región con nombre en (x, z) ({ id, name, biome, … }) o null. */
  regionAt(x, z) {
    const r = this.region[this.index(x, z)];
    return r ? this.regions[r - 1] ?? null : null;
  }

  /**
   * Pesos de bioma en (x, z): la proporción de cada bioma en nueve puntos alrededor
   * (a ±6 m), así los cambios de bioma son graduales. El mar cuenta como playa.
   */
  biomeWeightsAt(x, z, out = this._w) {
    for (const id of BIOME_IDS) out[id] = 0;
    for (let dz = -6; dz <= 6; dz += 6) {
      for (let dx = -6; dx <= 6; dx += 6) {
        const b = this.biome[this.index(x + dx, z + dz)];
        out[b === SEA ? 'BEACH' : BIOME_IDS[b] ?? 'PLAINS'] += 1 / 9;
      }
    }
    return out;
  }

  /** ¿Lugar donde nada crece (agua, roca desnuda, nieve)? */
  isBare(x, z) {
    const s = this.surfaceAt(x, z);
    return s === SURFACE.SNOW || s === SURFACE.ICE || s === SURFACE.CLIFF || s === SURFACE.SEABED || s === SURFACE.PAVED;
  }

  /** Densidad de matas de hierba decorativa (0..1) según el suelo. */
  grassAt(x, z) {
    return GRASS_BY_SURFACE[this.surfaceAt(x, z)] ?? 0;
  }

  /** Vegetación: { type, density 0..1 } en (x, z). */
  floraInfo(x, z) {
    const b = this.floraAt(x, z);
    return { type: b >> 4, density: (b & 15) / 15 };
  }
}

const GRASS_BY_SURFACE = {
  [SURFACE.GRASS]: 0.85, [SURFACE.GRASS_LUSH]: 1, [SURFACE.FLOWERS]: 0.9, [SURFACE.GRASS_DRY]: 0.75, [SURFACE.FOREST_FLOOR]: 0.3,
  [SURFACE.PINE_FLOOR]: 0.12, [SURFACE.ALPINE]: 0.45, [SURFACE.DIRT]: 0.08, [SURFACE.MARSH]: 0.9, [SURFACE.HEATH]: 0.55,
  [SURFACE.MOSS]: 0.25, [SURFACE.SAND]: 0.03, [SURFACE.SCREE]: 0.05, [SURFACE.ROCK]: 0.04,
};

export { FLORA };
