import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { smoothstep } from '../core/MathUtils.js';

/**
 * WaterSystem — fuentes de agua dulce (charcas) del mundo. Sin Three.js.
 *
 * Generación (determinista, sub-seed "resource"):
 *   1. Una charca obligatoria cerca del punto de inicio (el agua se descubre pronto).
 *   2. El resto repartidas por los biomas permitidos, en terreno casi llano y
 *      separadas entre sí.
 *   3. El nivel del agua queda por debajo del terreno circundante y la charca se
 *      EXCAVA en el relieve (TerrainGenerator llama a `carve()`), así que el agua
 *      nunca "flota" por encima del suelo.
 *
 * Consultas para otros sistemas (beber, llenar el odre, animales, recursos):
 *   getPondAt(x, z, margin), nearestPond(x, z), isWater(x, z, margin), shoreFactor(x, z)
 *
 * El mar del borde del mundo NO es agua potable (sistema distinto, visual).
 */
export class WaterSystem {
  constructor({ config, seaLevel }) {
    this._cfg = config;
    this._seaLevel = seaLevel;
    this.ponds = [];
  }

  /**
   * @param {object} p
   * @param {number} p.seed           sub-seed de recursos
   * @param {object} p.terrain        TerrainGenerator SIN charcas aún (sample(x, z))
   * @param {{x:number,z:number}} p.spawn
   * @param {{minX,maxX,minZ,maxZ}} p.bounds
   */
  generate({ seed, terrain, spawn, bounds }) {
    const c = this._cfg;
    const rng = new SeededRandom(deriveSeed(seed, 'water'));
    this.ponds = [];

    const tryPlace = (x, z) => {
      const radius = rng.range(c.RADIUS[0], c.RADIUS[1]);
      const pond = this._evaluate(terrain, x, z, radius, bounds);
      if (!pond) return false;
      for (const other of this.ponds) {
        if (Math.hypot(other.x - x, other.z - z) < c.MIN_SPACING) return false;
      }
      // No encima del punto de inicio.
      if (Math.hypot(spawn.x - x, spawn.z - z) < radius * (1 + c.SHORE_WIDTH) + 6) return false;
      pond.id = this.ponds.length;
      this.ponds.push(pond);
      return true;
    };

    // 1. Charca cercana al inicio.
    for (let i = 0; i < 200; i++) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(c.NEAR_SPAWN_DISTANCE[0], c.NEAR_SPAWN_DISTANCE[1] + i * 0.5);
      if (tryPlace(spawn.x + Math.cos(a) * d, spawn.z + Math.sin(a) * d)) break;
    }

    // 2. Resto del mundo.
    for (let i = 0; i < c.POND_COUNT * 60 && this.ponds.length < c.POND_COUNT; i++) {
      tryPlace(rng.range(bounds.minX, bounds.maxX), rng.range(bounds.minZ, bounds.maxZ));
    }
    return this.ponds;
  }

  /** Comprueba si cabe una charca en (x, z) y calcula su nivel de agua. */
  _evaluate(terrain, x, z, radius, bounds) {
    const c = this._cfg;
    const outer = radius * (1 + c.SHORE_WIDTH);
    if (x - outer < bounds.minX || x + outer > bounds.maxX || z - outer < bounds.minZ || z + outer > bounds.maxZ) {
      return null;
    }
    const center = terrain.sample(x, z);
    const dominant = Object.entries(center.biomes).sort((a, b) => b[1] - a[1])[0][0];
    if (!c.BIOMES.includes(dominant)) return null;

    // Terreno casi llano: el nivel del agua queda bajo el punto más bajo del borde.
    let min = center.height;
    let max = center.height;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const h = terrain.sample(x + Math.cos(a) * outer, z + Math.sin(a) * outer).height;
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
    if ((max - min) / (2 * outer) > c.MAX_SLOPE) return null;
    const level = min - 0.35;
    if (level < this._seaLevel + 0.8) return null;
    return { id: -1, x, z, radius, level, depth: c.DEPTH };
  }

  /**
   * Modifica una altura del terreno para excavar las charcas.
   * Dentro del radio: cuenco bajo el nivel del agua. En la orilla: bajada suave.
   */
  carve(x, z, height) {
    for (const p of this.ponds) {
      const dx = x - p.x;
      const dz = z - p.z;
      const outer = p.radius * (1 + this._cfg.SHORE_WIDTH);
      const d2 = dx * dx + dz * dz;
      if (d2 >= outer * outer) continue;
      const d = Math.sqrt(d2);
      if (d < p.radius) {
        const t = d / p.radius;
        height = Math.min(height, p.level - p.depth * (1 - t * t) - 0.05);
      } else {
        const t = (d - p.radius) / (outer - p.radius);
        const shore = p.level - 0.05 + (height - p.level) * smoothstep(0, 1, t);
        height = Math.min(height, shore);
      }
    }
    return height;
  }

  /** Charca que contiene (x, z) (con margen opcional en metros), o null. */
  getPondAt(x, z, margin = 0) {
    for (const p of this.ponds) {
      if (Math.hypot(x - p.x, z - p.z) <= p.radius + margin) return p;
    }
    return null;
  }

  /** @returns {{pond: object, distance: number} | null} distancia a la ORILLA (0 si dentro) */
  nearestPond(x, z) {
    let best = null;
    for (const p of this.ponds) {
      const d = Math.max(0, Math.hypot(x - p.x, z - p.z) - p.radius);
      if (!best || d < best.distance) best = { pond: p, distance: d };
    }
    return best;
  }

  isWater(x, z, margin = 0) {
    return this.getPondAt(x, z, margin) !== null;
  }

  /** 0..1: cercanía a la orilla, para colorear el barro húmedo. */
  shoreFactor(x, z) {
    let f = 0;
    for (const p of this.ponds) {
      const d = Math.hypot(x - p.x, z - p.z);
      const outer = p.radius * (1 + this._cfg.SHORE_WIDTH) + 1.5;
      if (d < outer) f = Math.max(f, 1 - smoothstep(p.radius, outer, d));
    }
    return f;
  }
}
