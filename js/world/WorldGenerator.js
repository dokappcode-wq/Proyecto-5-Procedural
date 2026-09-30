import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';
import { WorldSeed } from './WorldSeed.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TerrainMesher } from './TerrainMesher.js';
import { ChunkManager } from './ChunkManager.js';
import { createBiomeColorizer } from './BiomeColorizer.js';
import { BiomeSystem } from './BiomeSystem.js';
import { WaterSystem } from './WaterSystem.js';
import { ResourceSystem } from './ResourceSystem.js';
import { PropMesher } from './props/PropMesher.js';

/**
 * WorldGenerator — mundo procedural finito generado a partir de una seed.
 *
 * Implementa la interfaz de terreno que usan jugador y cámara:
 *   getHeightAt(x, z), getBounds(), getSpawnPoint(), describeAt(x, z)
 * y consultas para otros sistemas:
 *   getBiomeAt(x, z) → { id, name, weights, temperature }
 *   water      → WaterSystem (charcas: beber, llenar el odre...)
 *   resources  → ResourceSystem (árboles, rocas...: recoger, colisiones)
 *
 * Responsabilidades:
 *   - Crear la WorldSeed y sus sub-seeds.
 *   - Crear el BiomeSystem (sub-seed "biome") y el TerrainGenerator (sub-seed
 *     "terrain") del perfil de planeta.
 *   - Crear WaterSystem y ResourceSystem (sub-seed "resource").
 *   - Guardar en caché los datos de altura por chunk (baratos en memoria).
 *   - Delegar las mallas visibles en ChunkManager (capas: terreno, recursos).
 *   - Calcular la posición inicial a partir de la seed.
 *
 * El mismo objeto sobrevive a `generate(nuevaSeed)`: quien lo referencia
 * (controlador, cámara) no necesita actualizarse.
 */
export class WorldGenerator {
  /**
   * @param {object} [p.landing] lugar de aterrizaje de la nave inicial:
   *   { DISTANCE: [min, max] m del spawn, CLEAR_RADIUS, HALF_WIDTH, HALF_LENGTH }
   */
  constructor({ scene, config, planet, events, resourceTypes, propColors, flatShading = false, landing = null }) {
    this.name = 'world';
    this._landingCfg = landing;
    this._landing = null;
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

    this._resourceTypes = resourceTypes;
    this.water = new WaterSystem({ config: planet.WATER, seaLevel: config.SEA_LEVEL });
    this.resources = null;

    // ---- Capas de chunk -------------------------------------------------------
    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading });
    this._propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._grassMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this._mesher = new TerrainMesher({ colorizer: () => {} });
    this._propMesher = new PropMesher({ colors: propColors });
    this._chunks = new ChunkManager({
      scene,
      config,
      chunkCount: this._chunkCount,
      layers: [
        {
          name: 'terrain',
          viewDistance: config.VIEW_DISTANCE_CHUNKS,
          build: (cx, cz) => {
            const mesh = new THREE.Mesh(this._mesher.build(this.getChunkData(cx, cz)), this._material);
            mesh.receiveShadow = mesh.castShadow = true;
            return mesh;
          },
          dispose: (mesh) => {
            mesh.geometry.index = null; // el índice es compartido entre chunks
            mesh.geometry.dispose();
          },
        },
        {
          name: 'props',
          viewDistance: Math.min(config.PROPS_VIEW_DISTANCE_CHUNKS, config.VIEW_DISTANCE_CHUNKS),
          build: (cx, cz) => this._buildPropsLayer(cx, cz),
          dispose: (group) => group.children.forEach((m) => m.geometry.dispose()),
        },
      ],
    });

    this._pondGroup = new THREE.Group();
    this._pondGroup.name = 'Ponds';
    scene.add(this._pondGroup);
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
    this.biomes = new BiomeSystem({
      definitions: this._planet.BIOMES,
      distribution: this._planet.BIOME_DISTRIBUTION,
      seed: this.seed.sub.biome,
    });
    this.terrain = new TerrainGenerator({
      profile: this._planet.TERRAIN,
      biomes: this.biomes,
      seed: this.seed.sub.terrain,
      worldSize: this._cfg.WORLD_SIZE,
      edgeMargin: this._cfg.EDGE_MARGIN,
    });
    this._mesher.setColorizer(
      createBiomeColorizer({ planet: this._planet, seaLevel: this._cfg.SEA_LEVEL, seed: this.seed.sub.biome }),
    );
    this._dataCache.clear();
    this._chunks.clear();
    this._stats.chunkDataGenerated = 0;

    // Orden: spawn y charcas se eligen sobre el terreno sin excavar; después se
    // activa la excavación (la caché de alturas está vacía, así que todo lo que
    // se genere a partir de aquí ya incluye las charcas).
    this._spawn = this._findSpawn();
    this.water.generate({ seed: this.seed.sub.resource, terrain: this.terrain, spawn: this._spawn, bounds: this.getBounds() });
    this.terrain.setWater(this.water);
    this._buildPonds();
    this._landing = this._landingCfg ? this._findLandingSite(this._landingCfg) : null;
    // Zonas sin árboles ni rocas: alrededor del inicio (SPAWN_CLEAR_RADIUS) y de la nave.
    const clearZones = this._landing ? [{ x: this._landing.x, z: this._landing.z, r: this._landingCfg.CLEAR_RADIUS }] : [];

    this.resources = new ResourceSystem({
      config: this._planet.RESOURCES,
      types: this._resourceTypes,
      seed: this.seed.sub.resource,
      world: {
        chunkSize: this._cfg.CHUNK_SIZE,
        half: this._half,
        chunkCount: this._chunkCount,
        seaLevel: this._cfg.SEA_LEVEL,
        spawn: this._spawn,
        clearZones,
        heightAt: (x, z) => this.getHeightAt(x, z),
        sample: (x, z) => this.terrain.sample(x, z),
        isWater: (x, z, m) => this.water.isWater(x, z, m),
      },
    });
    this.resources.onChunkChanged = (cx, cz) => this._chunks.rebuild(cx, cz);
    this._stats.generationMs = performance.now() - t0;

    this._events.emit(GameEvents.WORLD_GENERATED, { seed: this.seed.text, spawn: { ...this._spawn } });
  }

  update(dt = 0) {
    this.resources?.update(dt);
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

  get seaLevel() {
    return this._cfg.SEA_LEVEL;
  }

  /** Área jugable (el mar del borde queda fuera). */
  getBounds() {
    const h = this._half - this._cfg.EDGE_MARGIN;
    return { minX: -h, maxX: h, minZ: -h, maxZ: h };
  }

  getSpawnPoint() {
    return { ...this._spawn };
  }

  /** Lugar donde aparece aterrizada la nave: { x, z, yaw } (o null). */
  getLandingSite() {
    return this._landing ? { ...this._landing } : null;
  }

  /** Bioma en (x, z): { id, name, weights, temperature }. */
  getBiomeAt(x, z) {
    return this.biomes.describe(this.terrain.sample(x, z).biomes);
  }

  describeAt(x, z) {
    const s = this.terrain.sample(x, z);
    const mountain = s.mountain;
    const coast = s.coast;
    const biome = this.biomes.describe(s.biomes);
    return {
      generator: `WorldGenerator · ${this._planet.NAME}`,
      biome: biome.name,
      biomeInfo: biome,
      height: this.getHeightAt(x, z),
      mountain,
      coast,
    };
  }

  /**
   * Busca el punto jugable más cercano (espiral) donde domine un bioma.
   * Herramienta de depuración: no forma parte de la generación.
   */
  findNearestBiome(biomeId, fromX, fromZ, { step = 24, maxRadius = 600, minWeight = 0.9 } = {}) {
    const b = this.getBounds();
    for (let r = 0; r <= maxRadius; r += step) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const x = fromX + Math.cos(a) * r;
        const z = fromZ + Math.sin(a) * r;
        if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        const s = this.terrain.sample(x, z);
        if (s.height > this._cfg.SEA_LEVEL + 1 && s.biomes[biomeId] >= minWeight) return { x, z };
      }
    }
    return null;
  }

  /** Información de depuración para el modo Admin. */
  getInfo() {
    return {
      planet: this._planet.NAME,
      ponds: this.water.ponds.length,
      resourceChunksCached: this.resources.cachedChunkCount,
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
      landing: this._landing,
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
    const biomeWeights = {};
    for (const id of this.biomes.ids) biomeWeights[id] = new Float32Array(s * s);
    const shore = new Float32Array(s * s);
    for (let l = 0; l < s; l++) {
      for (let k = 0; k < s; k++) {
        const i = l * s + k;
        const x = originX + (k - 1) * sp;
        const z = originZ + (l - 1) * sp;
        const sample = this.terrain.sample(x, z);
        heights[i] = sample.height;
        for (const id in biomeWeights) biomeWeights[id][i] = sample.biomes[id];
        shore[i] = this.water.shoreFactor(x, z);
      }
    }
    data = { cx, cz, res, spacing: sp, originX, originZ, heights, biomeWeights, shore };
    this._dataCache.set(key, data);
    this._stats.chunkDataGenerated++;
    return data;
  }

  // ---- Interno -------------------------------------------------------------

  _buildPropsLayer(cx, cz) {
    const { props, grass } = this._propMesher.build(this.resources.getChunk(cx, cz));
    if (!props && !grass) return null;
    const group = new THREE.Group();
    if (props) {
      const mesh = new THREE.Mesh(props, this._propMaterial);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (grass) {
      const mesh = new THREE.Mesh(grass, this._grassMaterial);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** Láminas de agua de las charcas (disco low-poly al nivel del agua). */
  _buildPonds() {
    for (const m of this._pondGroup.children) m.geometry.dispose();
    this._pondGroup.clear();
    const W = this._planet.WATER;
    this._pondMaterial ??= new THREE.MeshPhongMaterial({
      color: W.COLOR,
      specular: 0xaad4ee,
      shininess: 80,
      transparent: true,
      opacity: W.OPACITY,
      flatShading: true,
    });
    for (const p of this.water.ponds) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(p.radius + 0.4, 14), this._pondMaterial);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(p.x, p.level, p.z);
      disc.receiveShadow = true;
      disc.name = `pond_${p.id}`;
      this._pondGroup.add(disc);
    }
  }

  /** Posición inicial determinista: terreno seco y llano en la Explanada. */
  _findSpawn() {
    const c = this._cfg;
    const minPlains = this._planet.BIOME_DISTRIBUTION.SPAWN_MIN_PLAINS;
    const maxRadius = this.getBounds().maxX - 16;
    const rng = new SeededRandom(this.seed.sub.spawn);
    // Rondas con radio creciente: si cerca del centro no hay explanada, se busca más lejos.
    for (let radiusLimit = c.SPAWN_SEARCH_RADIUS; ; radiusLimit = Math.min(maxRadius, radiusLimit * 1.6)) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < c.SPAWN_ATTEMPTS; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = Math.sqrt(rng.next()) * radiusLimit;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const s = this.terrain.sample(x, z);
        if (s.height < c.SEA_LEVEL + c.SPAWN_MIN_HEIGHT_ABOVE_SEA || s.biomes.PLAINS < minPlains) continue;
        const slope = this._slopeAt(x, z);
        if (slope > c.SPAWN_MAX_SLOPE) continue;
        // Preferir cerca del centro y terreno llano (la primera válida no siempre es la mejor).
        const score = -radius / radiusLimit - slope * 2;
        if (score > bestScore) {
          bestScore = score;
          best = { x, z };
        }
        if (i > 40 && best) break;
      }
      if (best) return best;
      if (radiusLimit >= maxRadius) return { x: 0, z: 0 };
    }
  }

  /**
   * Lugar de aterrizaje determinista (sub-seed "spawn" → "landing"): seco, llano,
   * sin charcas, fuera de las montañas, a DISTANCE m del inicio y con la cola
   * (la rampa) mirando hacia el jugador.
   */
  _findLandingSite({ DISTANCE, HALF_WIDTH, HALF_LENGTH }) {
    const rng = new SeededRandom(deriveSeed(this.seed.sub.spawn, 'landing'));
    const sp = this._spawn;
    const b = this.getBounds();
    let best = null;
    for (let i = 0; i < 240; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = rng.range(DISTANCE[0], DISTANCE[1]);
      const x = sp.x + Math.cos(angle) * radius;
      const z = sp.z + Math.sin(angle) * radius;
      if (x < b.minX + 30 || x > b.maxX - 30 || z < b.minZ + 30 || z > b.maxZ - 30) continue;
      // La cola (+Z local) apunta al inicio: (sin yaw, cos yaw) ∥ (spawn − lugar).
      const yaw = Math.atan2(sp.x - x, sp.z - z) + rng.range(-0.3, 0.3);
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      let min = Infinity;
      let max = -Infinity;
      let ok = true;
      for (let u = -1; u <= 1 && ok; u += 0.5) {
        for (let v = -1; v <= 1 && ok; v += 0.25) {
          const lx = u * HALF_WIDTH;
          const lz = v * HALF_LENGTH;
          const px = x + lx * c + lz * s;
          const pz = z - lx * s + lz * c;
          const sample = this.terrain.sample(px, pz);
          const h = this.terrain.heightAt(px, pz);
          if (h < this._cfg.SEA_LEVEL + 1.2 || this.water.isWater(px, pz, 4) || (sample.biomes.FROZEN_MOUNTAINS ?? 0) > 0.2) ok = false;
          min = Math.min(min, h);
          max = Math.max(max, h);
        }
      }
      if (!ok) continue;
      const uneven = max - min;
      if (!best || uneven < best.uneven) best = { x, z, yaw, uneven };
      if (best.uneven < 0.25 && i > 30) break;
    }
    if (best) return { x: best.x, z: best.z, yaw: best.yaw };
    return { x: sp.x + 25, z: sp.z, yaw: Math.PI / 2 };
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
      new THREE.MeshPhongMaterial({
        color: this._planet.COLORS.SEA,
        specular: 0x9fc4dd,
        shininess: 60,
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
