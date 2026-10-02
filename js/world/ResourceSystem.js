import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { LruCache } from '../core/LruCache.js';

/**
 * ResourceSystem — árboles, manzanos, pinos, rocas, arbustos (y hierba
 * decorativa) del mundo. Sin Three.js: solo datos y consultas.
 *
 * Colocación determinista POR CHUNK (sub-seed "resource" + coordenadas del
 * chunk): el contenido de un chunk no depende del orden en que se visita.
 * Rejilla con jitter (CELL_SIZE); en cada celda, la probabilidad de cada tipo
 * es la mezcla de las densidades de los biomas según sus pesos en ese punto.
 *
 * Recogida (Fase 5):
 *   - harvest(id) da 1 unidad del objeto del recurso (RESOURCE_TYPES[type].HARVEST)
 *     hasta agotarlo. Agotado: se retira (árboles, rocas) o queda sin fruto y
 *     rebrota tras REGROW_SECONDS (manzanos).
 *   - El estado se recuerda aunque el chunk se descargue; onChunkChanged avisa
 *     para reconstruir la malla del chunk.
 *
 * Colisiones: resolveCollisions(pos, radius) empuja un círculo fuera de
 * troncos y rocas (jugador y animales).
 */
export class ResourceSystem {
  /**
   * @param {object} p
   * @param {object} p.config      PLANETS.<planeta>.RESOURCES
   * @param {object} p.types       RESOURCE_TYPES
   * @param {number} p.seed        sub-seed de recursos
   * @param {object} p.world       { chunkSize, half, chunkCount, heightAt(x,z), sample(x,z), isWater(x,z,m), spawn, clearZones?, seaLevel }
   */
  constructor({ config, types, seed, world, maxCachedChunks = 1200 }) {
    this._cfg = config;
    this._types = types;
    this._seed = seed;
    this._world = world;
    // key → { nodes, grass, dirty }. En regiones grandes se descartan los chunks lejanos
    // sin cambios (se regeneran iguales); los que tienen algo talado o cogido se guardan.
    this._chunks = new LruCache(maxCachedChunks, { keep: (c) => c.dirty });
    this._removed = new Set();  // ids retirados
    this._regrowing = [];       // nodos agotados que volverán a dar fruto
    this.onChunkChanged = null; // (cx, cz) => void
  }

  /**
   * Recoge 1 unidad de un recurso.
   * @returns {{ node, item, amount, depleted, removed } | null}
   */
  harvest(id) {
    const node = this._findNode(id);
    const h = node && this._types[node.type].HARVEST;
    if (!h || node.removed || node.remaining <= 0) return null;
    node.remaining--;
    this._markDirty(id);
    let removed = false;
    if (node.remaining === 0) {
      if (h.REMOVE_WHEN_EMPTY) {
        removed = true;
        node.removed = true;
        this._removed.add(id);
      } else {
        node.depleted = true;
        node.regrowIn = h.REGROW_SECONDS;
        this._regrowing.push(node);
      }
      this._notify(id);
    }
    return { node, item: h.ITEM, amount: 1, depleted: node.remaining === 0, removed };
  }

  /** Avanza el rebrote de los recursos agotados (manzanos). */
  update(dt) {
    if (!this._regrowing.length) return;
    this._regrowing = this._regrowing.filter((node) => {
      node.regrowIn -= dt;
      if (node.regrowIn > 0) return true;
      node.depleted = false;
      node.remaining = this._types[node.type].HARVEST.AMOUNT;
      this._notify(node.id);
      return false;
    });
  }

  static key(cx, cz) {
    return cx * 65536 + cz;
  }

  /** Datos del chunk (se generan una vez y se guardan). */
  getChunk(cx, cz) {
    const key = ResourceSystem.key(cx, cz);
    let chunk = this._chunks.get(key);
    if (!chunk) {
      chunk = { nodes: this._generateNodes(cx, cz), grass: this._generateGrass(cx, cz) };
      this._chunks.set(key, chunk);
    }
    return chunk;
  }

  get cachedChunkCount() {
    return this._chunks.size;
  }

  /** Nodos (no retirados) en un radio. */
  getNodesNear(x, z, radius) {
    const out = [];
    this._forChunksAround(x, z, radius, (chunk) => {
      for (const n of chunk.nodes) {
        if (!n.removed && Math.hypot(n.x - x, n.z - z) <= radius) out.push(n);
      }
    });
    return out;
  }

  /** Retira un nodo por completo. @returns {object|null} el nodo retirado */
  removeNode(id) {
    const node = this._findNode(id);
    if (!node || node.removed) return null;
    this._markDirty(id);
    node.removed = true;
    this._removed.add(id);
    this._notify(id);
    return node;
  }

  _findNode(id) {
    const [cx, cz] = id.split(':').map(Number);
    return this.getChunk(cx, cz).nodes.find((n) => n.id === id) ?? null;
  }

  _markDirty(id) {
    const [cx, cz] = id.split(':').map(Number);
    this.getChunk(cx, cz).dirty = true;
  }

  _notify(id) {
    const [cx, cz] = id.split(':').map(Number);
    this.onChunkChanged?.(cx, cz);
  }

  /**
   * Empuja un círculo (x, z, radius) fuera de los obstáculos.
   * Modifica `pos` (necesita .x y .z). @returns {boolean} si hubo colisión
   */
  resolveCollisions(pos, radius) {
    let hit = false;
    this._forChunksAround(pos.x, pos.z, radius + 2, (chunk) => {
      for (const n of chunk.nodes) {
        if (n.removed || n.radius <= 0) continue;
        const dx = pos.x - n.x;
        const dz = pos.z - n.z;
        const min = n.radius + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-4;
        pos.x = n.x + (dx / d) * min;
        pos.z = n.z + (dz / d) * min;
        hit = true;
      }
    });
    return hit;
  }

  // ---- Generación ------------------------------------------------------------

  _generateNodes(cx, cz) {
    const c = this._cfg;
    const w = this._world;
    const rng = new SeededRandom(deriveSeed(this._seed, `nodes:${cx},${cz}`));
    const originX = -w.half + cx * w.chunkSize;
    const originZ = -w.half + cz * w.chunkSize;
    const cells = Math.floor(w.chunkSize / c.CELL_SIZE);
    const nodes = [];
    let index = 0;

    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        // Siempre se consumen los mismos números por celda: el resultado de una
        // celda no depende de lo que haya pasado en las anteriores.
        const rx = rng.next();
        const rz = rng.next();
        const roll = rng.next();
        const rScale = rng.next();
        const rRot = rng.next();
        const rVar = rng.next();
        const rTint = rng.next();

        const x = originX + (i + 0.15 + rx * 0.7) * c.CELL_SIZE;
        const z = originZ + (j + 0.15 + rz * 0.7) * c.CELL_SIZE;
        const type = this._pickType(x, z, roll);
        if (!type) continue;

        const y = w.heightAt(x, z);
        if (!this._isValidSpot(type, x, z, y)) continue;

        const def = this._types[type];
        const size = this._cfg.SIZE?.[type] ?? 1; // tamaño propio del sistema solar
        const scale = (def.SCALE[0] + (def.SCALE[1] - def.SCALE[0]) * rScale) * size;
        const id = `${cx}:${cz}:${index++}`;
        nodes.push({
          id,
          type,
          x,
          y,
          z,
          scale,
          rotation: rRot * Math.PI * 2,
          variant: Math.floor(rVar * 3),
          tint: rTint,
          radius: def.COLLISION_RADIUS * (type === 'ROCK' || def.SCALE_COLLISION ? scale : size),
          remaining: def.HARVEST ? def.HARVEST.AMOUNT : 0,
          depleted: false,
          removed: this._removed.has(id),
        });
      }
    }
    return nodes;
  }

  _pickType(x, z, roll) {
    const weights = this._world.sample(x, z).biomes;
    const probs = {};
    for (const biome in weights) {
      const density = this._cfg.DENSITY[biome];
      if (!density) continue;
      for (const type in density) probs[type] = (probs[type] ?? 0) + density[type] * weights[biome];
    }
    let acc = 0;
    for (const type in probs) {
      acc += probs[type];
      if (roll < acc) return type;
    }
    return null;
  }

  _isValidSpot(type, x, z, y) {
    const c = this._cfg;
    const w = this._world;
    if (y < w.seaLevel + 0.6) return false;
    if (w.isWater(x, z, 1.5)) return false;
    if (Math.hypot(x - w.spawn.x, z - w.spawn.z) < c.SPAWN_CLEAR_RADIUS) return false;
    for (const zone of w.clearZones ?? []) if (Math.hypot(x - zone.x, z - zone.z) < zone.r) return false;
    const isTree = type === 'TREE' || type === 'PINE' || type === 'APPLE_TREE';
    if (isTree && y > c.TREE_MAX_HEIGHT) return false;
    const d = 1;
    const slope = Math.hypot(w.heightAt(x + d, z) - w.heightAt(x - d, z), w.heightAt(x, z + d) - w.heightAt(x, z - d)) / (2 * d);
    return slope <= c.MAX_SLOPE * (isTree ? 1 : 1.3);
  }

  _generateGrass(cx, cz) {
    const w = this._world;
    const perChunk = this._cfg.GRASS_TUFTS_PER_CHUNK;
    const maxDensity = Math.max(...Object.values(perChunk));
    const rng = new SeededRandom(deriveSeed(this._seed, `grass:${cx},${cz}`));
    const originX = -w.half + cx * w.chunkSize;
    const originZ = -w.half + cz * w.chunkSize;
    const tufts = [];
    // Se prueban `maxDensity` puntos y cada uno se acepta según la densidad del bioma local.
    for (let i = 0; i < maxDensity; i++) {
      const x = originX + rng.next() * w.chunkSize;
      const z = originZ + rng.next() * w.chunkSize;
      const keep = rng.next();
      const scale = 0.7 + rng.next() * 0.7;
      const rotation = rng.next() * Math.PI * 2;
      const tint = rng.next();
      const bw = w.sample(x, z).biomes;
      let density = 0;
      for (const b in bw) density += (perChunk[b] ?? 0) * bw[b];
      if (keep >= density / maxDensity) continue;
      const y = w.heightAt(x, z);
      if (y < w.seaLevel + 0.8 || w.isWater(x, z, 0.5)) continue;
      tufts.push({ x, y, z, scale, rotation, tint });
    }
    return tufts;
  }

  _forChunksAround(x, z, radius, fn) {
    const w = this._world;
    const x0 = Math.floor((x - radius + w.half) / w.chunkSize);
    const x1 = Math.floor((x + radius + w.half) / w.chunkSize);
    const z0 = Math.floor((z - radius + w.half) / w.chunkSize);
    const z1 = Math.floor((z + radius + w.half) / w.chunkSize);
    for (let cz = Math.max(0, z0); cz <= Math.min(w.chunkCount - 1, z1); cz++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(w.chunkCount - 1, x1); cx++) {
        fn(this.getChunk(cx, cz));
      }
    }
  }
}
