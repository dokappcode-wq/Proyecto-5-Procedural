import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { WorldSeed } from './WorldSeed.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TerrainMesher } from './TerrainMesher.js';
import { ChunkManager } from './ChunkManager.js';
import { createHeightColorizer } from './HeightColorizer.js';

/**
 * WorldGenerator — mundo procedural finito generado a partir de una seed.
 *
 * Implementa la interfaz de terreno que usan jugador y cámara:
 *   getHeightAt(x, z), getBounds(), getSpawnPoint(), describeAt(x, z)
 *
 * Responsabilidades:
 *   - Crear la WorldSeed y sus sub-seeds.
 *   - Crear el TerrainGenerator del perfil de planeta.
 *   - Guardar en caché los datos de altura por chunk (baratos en memoria).
 *   - Delegar las mallas visibles en ChunkManager.
 *   - Calcular la posición inicial a partir de la seed.
 *
 * El mismo objeto sobrevive a `generate(nuevaSeed)`: quien lo referencia
 * (controlador, cámara) no necesita actualizarse.
 */
export class WorldGenerator {
  constructor({ scene, config, planet, events }) {
    this.name = 'world';
    this._cfg = config;
    this._planet = planet;
    this._events = events;
    this._scene = scene;

    if (config.WORLD_SIZE % config.CHUNK_SIZE !== 0) {
      throw new Error('WORLD_SIZE debe ser múltiplo de CHUNK_SIZE');
    }
    this._half = config.WORLD_SIZE / 2;
    this._chunkCount = config.WORLD_SIZE / config.CHUNK_SIZE;
    this._res = config.CHUNK_RESOLUTION;
    this._spacing = config.CHUNK_SIZE / config.CHUNK_RESOLUTION;
    this._stride = this._res + 3;

    this._dataCache = new Map();
    this._focus = null;
    this.seed = null;
    this.terrain = null;
    this._spawn = { x: 0, z: 0 };
    this._stats = { generationMs: 0, chunkDataGenerated: 0 };

    this._material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this._mesher = new TerrainMesher({ colorizer: () => {} });
    this._chunks = new ChunkManager({
      scene,
      config,
      chunkCount: this._chunkCount,
      getChunkData: (cx, cz) => this.getChunkData(cx, cz),
      mesher: this._mesher,
      material: this._material,
    });

    this._buildSea();
  }

  /** Vector (por referencia) alrededor del cual se cargan los chunks. */
  follow(position) {
    this._focus = position;
  }

  /** (Re)genera el mundo con una seed. Emite WORLD_GENERATED. */
  generate(seedInput) {
    const t0 = performance.now();
    this.seed = new WorldSeed(seedInput, this._cfg.SUB_SEEDS);
    this.terrain = new TerrainGenerator({
      profile: this._planet.TERRAIN,
      seed: this.seed.sub.terrain,
      worldSize: this._cfg.WORLD_SIZE,
      edgeMargin: this._cfg.EDGE_MARGIN,
    });
    this._mesher.setColorizer(
      createHeightColorizer({
        colors: this._planet.COLORS,
        seaLevel: this._cfg.SEA_LEVEL,
        seed: this.seed.sub.terrain,
      }),
    );
    this._dataCache.clear();
    this._chunks.clear();
    this._stats.chunkDataGenerated = 0;
    this._spawn = this._findSpawn();
    this._stats.generationMs = performance.now() - t0;

    this._events.emit(GameEvents.WORLD_GENERATED, { seed: this.seed.text, spawn: { ...this._spawn } });
  }

  update() {
    if (!this._focus || !this.terrain) return;
    const cs = this._cfg.CHUNK_SIZE;
    this._chunks.update((this._focus.x + this._half) / cs, (this._focus.z + this._half) / cs);
  }

  // ---- Interfaz de terreno -------------------------------------------------

  /**
   * Altura del suelo, interpolada sobre la misma triangulación que la malla.
   * Fuera del mundo devuelve la altura del borde.
   */
  getHeightAt(x, z) {
    const cs = this._cfg.CHUNK_SIZE;
    const max = this._cfg.WORLD_SIZE - 1e-4;
    const wx = Math.min(max, Math.max(0, x + this._half));
    const wz = Math.min(max, Math.max(0, z + this._half));
    const cx = Math.floor(wx / cs);
    const cz = Math.floor(wz / cs);
    const data = this.getChunkData(cx, cz);

    const gx = (wx - cx * cs) / this._spacing;
    const gz = (wz - cz * cs) / this._spacing;
    const k = Math.min(this._res - 1, Math.floor(gx));
    const l = Math.min(this._res - 1, Math.floor(gz));
    const fx = gx - k;
    const fz = gz - l;

    const h = data.heights;
    const s = this._stride;
    const ia = (l + 1) * s + (k + 1);
    const ha = h[ia];          // (k,   l)
    const hd = h[ia + 1];      // (k+1, l)
    const hb = h[ia + s];      // (k,   l+1)
    const hc = h[ia + s + 1];  // (k+1, l+1)

    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  /** Área jugable (el mar del borde queda fuera). */
  getBounds() {
    const h = this._half - this._cfg.EDGE_MARGIN;
    return { minX: -h, maxX: h, minZ: -h, maxZ: h };
  }

  getSpawnPoint() {
    return { ...this._spawn };
  }

  describeAt(x, z) {
    const s = this.terrain.sample(x, z);
    return {
      generator: `WorldGenerator · ${this._planet.NAME}`,
      biome: 'Sin biomas (Fase 3)',
      height: this.getHeightAt(x, z),
      mountain: s.mountain,
      coast: s.coast,
    };
  }

  /** Información de depuración para el modo Admin. */
  getInfo() {
    return {
      planet: this._planet.NAME,
      seedText: this.seed.text,
      seedValue: this.seed.value,
      subSeeds: this.seed.sub,
      worldSize: this._cfg.WORLD_SIZE,
      chunkSize: this._cfg.CHUNK_SIZE,
      chunkCount: this._chunkCount * this._chunkCount,
      chunkDataCached: this._dataCache.size,
      chunkMeshesLoaded: this._chunks.loadedCount,
      chunkMeshesPending: this._chunks.pendingCount,
      generationMs: this._stats.generationMs,
      spawn: this._spawn,
    };
  }

  // ---- Datos por chunk -----------------------------------------------------

  /** Alturas de un chunk con borde de 1 muestra ((res+3)²). Se generan una vez y se guardan. */
  getChunkData(cx, cz) {
    const key = cx * 65536 + cz;
    let data = this._dataCache.get(key);
    if (data) return data;

    const res = this._res;
    const sp = this._spacing;
    const originX = -this._half + cx * this._cfg.CHUNK_SIZE;
    const originZ = -this._half + cz * this._cfg.CHUNK_SIZE;
    const s = this._stride;
    const heights = new Float32Array(s * s);
    for (let l = 0; l < s; l++) {
      for (let k = 0; k < s; k++) {
        heights[l * s + k] = this.terrain.heightAt(originX + (k - 1) * sp, originZ + (l - 1) * sp);
      }
    }
    data = { cx, cz, res, spacing: sp, originX, originZ, heights };
    this._dataCache.set(key, data);
    this._stats.chunkDataGenerated++;
    return data;
  }

  // ---- Interno -------------------------------------------------------------

  /** Posición inicial determinista: terreno seco, llano y fuera de las montañas. */
  _findSpawn() {
    const c = this._cfg;
    const rng = new SeededRandom(this.seed.sub.spawn);
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < c.SPAWN_ATTEMPTS; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = Math.sqrt(rng.next()) * c.SPAWN_SEARCH_RADIUS;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const s = this.terrain.sample(x, z);
      const h = s.height;
      const mountain = s.mountain;
      const slope = this._slopeAt(x, z);
      if (h < c.SEA_LEVEL + c.SPAWN_MIN_HEIGHT_ABOVE_SEA) continue;
      if (slope > c.SPAWN_MAX_SLOPE || mountain > 0.05) continue;
      // Preferir cerca del centro y terreno llano (la primera válida no siempre es la mejor).
      const score = -radius / c.SPAWN_SEARCH_RADIUS - slope * 2;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
      if (i > 40 && best) break;
    }
    return best ?? { x: 0, z: 0 };
  }

  _slopeAt(x, z) {
    const d = 1;
    const t = this.terrain;
    const dx = t.heightAt(x + d, z) - t.heightAt(x - d, z);
    const dz = t.heightAt(x, z + d) - t.heightAt(x, z - d);
    return Math.hypot(dx, dz) / (2 * d);
  }

  /** Mar visual alrededor del mundo finito (y en zonas bajas). Sin interacción aún. */
  _buildSea() {
    const size = this._cfg.WORLD_SIZE * 4;
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({
        color: this._planet.COLORS.SEA,
        transparent: true,
        opacity: this._planet.COLORS.SEA_OPACITY,
      }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = this._cfg.SEA_LEVEL;
    sea.name = 'sea';
    this._scene.add(sea);
  }
}
