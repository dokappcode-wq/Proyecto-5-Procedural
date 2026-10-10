import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { LruCache } from '../core/LruCache.js';
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
import { applyWind } from './Wind.js';
import { CaveSystem } from './CaveSystem.js';
import { buildCaveMeshes, markStencil, hideOverCaves } from './CaveMesher.js';
import { planSites } from './WorldSites.js';
import { AuthoredTerrain, AuthoredWater, buildWaterGeometry, createFreshWaterMaterial } from './map/AuthoredWorld.js';
import { createMapColorizer } from './map/MapColorizer.js';
import { caveSurfaceSteps } from './map/CaveSurfaceMesher.js';
import { buildCaveDecor } from './map/CaveDecor.js';
import { enhanceTerrainMaterial } from './map/TerrainDetail.js';
import { buildFarTerrain } from './map/FarTerrain.js';
import { FLORA_TABLE } from './map/MapLegend.js';
import { hashString } from '../core/SeededRandom.js';

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
  /**
   * @param {object} [p.rules] reglas del planeta de inicio de la campaña:
   *   { SPAWN_ANYWHERE: bool, LANDING_BIOME: 'FROZEN_MOUNTAINS', LANDING_DISTANCE: [min, max] m del inicio }
   */
  constructor({ scene, config, planet, events, resourceTypes, propColors, flatShading = false, landing = null, rules = null, map = null }) {
    // Mapa diseñado (MapData): el relieve, el agua y los lugares salen de él, no de la seed.
    this._map = map;
    if (map) {
      const snow = map.meta.snowLine ?? planet.BIOMES.FROZEN_MOUNTAINS.SNOW_START_HEIGHT;
      planet = {
        ...planet,
        BIOMES: { ...planet.BIOMES, FROZEN_MOUNTAINS: { ...planet.BIOMES.FROZEN_MOUNTAINS, SNOW_START_HEIGHT: snow } },
        RESOURCES: { ...planet.RESOURCES, TREE_MAX_HEIGHT: snow + 6 },
      };
      flatShading = false;
    }
    this.name = 'world';
    this._rules = rules;
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

    // Alturas por chunk: se descartan las menos usadas (una región de 20 km tiene 100 000 chunks).
    this._dataCache = new LruCache(config.CHUNK_DATA_CACHE ?? 900);
    this._focus = null;
    this.seed = null;
    this.terrain = null;
    this._spawn = { x: 0, z: 0 };
    this._stats = { generationMs: 0, chunkDataGenerated: 0 };

    this._resourceTypes = resourceTypes;
    this.water = new WaterSystem({ config: planet.WATER, seaLevel: config.SEA_LEVEL });
    this.resources = null;

    // ---- Capas de chunk -------------------------------------------------------
    this._material = markStencil(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading }), 0);
    if (map) enhanceTerrainMaterial(this._material);
    // Vegetación que se mece con el viento (P7).
    this._propMaterial = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 1);
    this._grassMaterial = applyWind(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), 6);
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
            // Chunks con la boca de una cueva: el terreno de la boca no se dibuja.
            const cs = config.CHUNK_SIZE;
            const x0 = -this._half + cx * cs;
            const z0 = -this._half + cz * cs;
            const holes = this.caves?.mouthNear(x0, z0, x0 + cs, z0 + cs) ? (x, y, z) => this.caves.openAt(x, y, z) : null;
            const mesh = new THREE.Mesh(this._mesher.build(this.getChunkData(cx, cz), holes), this._material);
            mesh.receiveShadow = mesh.castShadow = true;
            return mesh;
          },
          dispose: (mesh) => {
            if (mesh.geometry.index && mesh.geometry.index === this._mesher._indexCache.get(this._res)) mesh.geometry.index = null; // el índice es compartido entre chunks
            mesh.geometry.dispose();
          },
        },
        ...(map ? [{
          name: 'water',
          viewDistance: config.VIEW_DISTANCE_CHUNKS,
          build: (cx, cz) => {
            const cs = config.CHUNK_SIZE;
            const geo = buildWaterGeometry(this._map, -this._half + cx * cs, -this._half + cz * cs, cs, this._spacing);
            if (!geo) return null;
            const mesh = new THREE.Mesh(geo, this._freshMaterial);
            mesh.renderOrder = 2;
            return mesh;
          },
          dispose: (mesh) => mesh.geometry.dispose(),
        }] : []),
        {
          name: 'props',
          viewDistance: Math.min(config.PROPS_VIEW_DISTANCE_CHUNKS, config.VIEW_DISTANCE_CHUNKS),
          build: (cx, cz) => this._buildPropsLayer(cx, cz),
          dispose: (group) => group.children.forEach((m) => m.geometry.dispose()),
        },
      ],
    });

    if (map) {
      this._freshMaterial = createFreshWaterMaterial(planet.WATER.COLOR);
      // La isla entera en baja resolución: se ve a lo lejos.
      const far = buildFarTerrain(map, { nearRadius: config.VIEW_DISTANCE_CHUNKS * config.CHUNK_SIZE - 25 });
      markStencil(far.material, 0);
      scene.add(far);
    }
    this._pondGroup = new THREE.Group();
    this._pondGroup.name = 'Ponds';
    scene.add(this._pondGroup);
    this._buildSea();
  }

  /** Vector (por referencia) alrededor del cual se cargan los chunks. */
  follow(position) {
    this._focus = position;
  }

  /**
   * (Re)genera el mundo con una seed. Emite WORLD_GENERATED salvo con
   * `{ emitEvent: false }` (las lunas se generan en silencio: no reinician nada).
   */
  generate(seedInput, { emitEvent = true } = {}) {
    if (this._map) return this._generateAuthored(seedInput, { emitEvent });
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
    // La nave: en un monte helado (campaña) sobre una explanada aplanada, o cerca del inicio.
    this._landing = null;
    const pads = [];
    if (this._landingCfg && this._rules?.LANDING_BIOME) {
      this._landing = this._findBiomeLandingSite(this._landingCfg, this._rules);
      if (this._landing) {
        const L = this._landingCfg;
        pads.push({ x: this._landing.x, z: this._landing.z, radius: Math.max(L.HALF_LENGTH, L.CLEAR_RADIUS) + 1, height: this._landing.height, blend: 12 });
      }
    }
    // Lugares especiales (campaña): bases de goblins, gólems, lugares de la historia…
    // Lejos del inicio; algunos con su explanada y todos sin árboles encima.
    this.sites = {};
    let siteClear = [];
    if (this._rules?.SITES) {
      const plan = planSites({
        seed: this.seed.sub.spawn,
        requests: this._rules.SITES,
        terrain: this.terrain,
        bounds: this.getBounds(),
        spawn: this._spawn,
        safeRadius: this._rules.SAFE_RADIUS ?? 0,
        avoid: this._landing ? [{ x: this._landing.x, z: this._landing.z, r: 70 }] : [],
      });
      this.sites = plan.sites;
      pads.push(...plan.pads);
      siteClear = plan.clearZones;
    }
    if (pads.length) this.terrain.setPads(pads);
    this.water.generate({ seed: this.seed.sub.resource, terrain: this.terrain, spawn: this._spawn, bounds: this.getBounds() });
    this.terrain.setWater(this.water);
    this._buildPonds();
    if (this._landingCfg && !this._landing) this._landing = this._findLandingSite(this._landingCfg);
    // Zonas sin árboles ni rocas: alrededor del inicio (SPAWN_CLEAR_RADIUS) y de la nave.
    const clearZones = this._landing ? [{ x: this._landing.x, z: this._landing.z, r: this._landingCfg.CLEAR_RADIUS }] : [];
    clearZones.push(...siteClear);

    // Cuevas (campaña): túneles bajo el terreno, con su malla y sus minerales.
    this._caveGroup?.parent?.remove(this._caveGroup);
    this._caveGroup?.traverse((o) => o.geometry?.dispose?.());
    this._caveGroup = null;
    this.caves = null;
    if (this._rules?.CAVES) {
      this.caves = new CaveSystem({ config: this._rules.CAVES });
      this.caves.generate({
        seed: this.seed.sub.terrain,
        terrain: { sample: (x, z) => this.terrain.sample(x, z), heightAt: (x, z) => this.terrain.heightAt(x, z) },
        bounds: this.getBounds(),
        spawn: this._spawn,
        avoid: [
          ...(this._landing ? [{ x: this._landing.x, z: this._landing.z, r: 80 }] : []),
          ...Object.values(this.sites).flat().map((t) => ({ x: t.x, z: t.z, r: t.radius + 25 })),
        ],
        isWater: (x, z) => this.water.isWater(x, z, 8),
        // La mazmorra de la historia (si la campaña dice dónde empieza).
        dungeon: this._rules.DUNGEON?.(this.sites) ?? null,
      });
      this._caveGroup = buildCaveMeshes(this.caves.caves, (x, z) => this.terrain.heightAt(x, z), this._propMesher._colors);
      this._scene.add(this._caveGroup);
    }

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
        // Bocas de cueva: ahí no crece nada; dentro de las cuevas, sus minerales.
        isHole: this.caves ? (x, z) => this.caves.nearMouth(x, z, 4) : null, // ni árboles ni rocas en la boca
        extraNodes: this.caves ? (cx, cz) => this.caves.nodesInChunk(cx, cz, this._cfg.CHUNK_SIZE, this._half) : null,
      },
    });
    this.resources.onChunkChanged = (cx, cz) => this._chunks.rebuild(cx, cz);
    this._stats.generationMs = performance.now() - t0;

    if (emitEvent) this._events.emit(GameEvents.WORLD_GENERATED, { seed: this.seed.text, spawn: { ...this._spawn } });
  }

  /**
   * Mundo de un mapa diseñado: siempre el mismo relieve, agua, lugares, cuevas y
   * vegetación (la seed de la partida solo cambia lo que se mueve: animales, enemigos…).
   */
  _generateAuthored(seedInput, { emitEvent }) {
    const t0 = performance.now();
    const M = this._map;
    const fixed = hashString(`map:${M.id}`);
    this.seed = new WorldSeed(seedInput, this._cfg.SUB_SEEDS);
    this.biomes = new BiomeSystem({ definitions: this._planet.BIOMES, distribution: this._planet.BIOME_DISTRIBUTION, seed: this.seed.sub.biome });
    this.terrain = new AuthoredTerrain(M);
    this._mesher.setColorizer(createMapColorizer({ seed: fixed }));
    this._dataCache.clear();
    this._chunks.clear();
    this._stats.chunkDataGenerated = 0;
    const meta = M.meta;
    this._spawn = { x: meta.spawn.x, z: meta.spawn.z };
    this._spawnYaw = meta.spawn.yaw ?? 0;
    this._landing = meta.landing ? { x: meta.landing.x, z: meta.landing.z, yaw: meta.landing.yaw } : null;
    this.sites = {};
    const clearZones = [];
    for (const s of meta.sites ?? []) {
      const list = (this.sites[s.kind] ??= []);
      list.push({ id: `${s.kind}:${list.length}`, kind: s.kind, x: s.x, z: s.z, radius: s.r, height: s.height, yaw: s.yaw ?? 0, seed: deriveSeed(fixed, `site:${s.kind}:${list.length}`) });
      clearZones.push({ x: s.x, z: s.z, r: s.r + 2 });
    }
    if (this._landing) clearZones.push({ x: this._landing.x, z: this._landing.z, r: (this._landingCfg?.CLEAR_RADIUS ?? 11) + 4 });
    this.water = new AuthoredWater(M);
    this._buildPonds();

    this._caveGroup?.parent?.remove(this._caveGroup);
    this._caveGroup?.traverse((o) => o.geometry?.dispose?.());
    this._caveGroup = null;
    this.caves = null;
    if (this._rules?.CAVES) {
      this.caves = new CaveSystem({ config: this._rules.CAVES });
      this.caves.generate({
        seed: fixed,
        terrain: { sample: (x, z) => this.terrain.sample(x, z), heightAt: (x, z) => this.terrain.heightAt(x, z) },
        bounds: this.getBounds(),
        spawn: this._spawn,
        avoid: [
          ...(this._landing ? [{ x: this._landing.x, z: this._landing.z, r: 80 }] : []),
          ...Object.values(this.sites).flat().map((t) => ({ x: t.x, z: t.z, r: t.radius + 25 })),
        ],
        isWater: (x, z) => this.water.isWater(x, z, 8),
        dungeon: this._rules.DUNGEON?.(this.sites) ?? null,
        authored: meta.caves ?? [],
      });
      if (this.caves.dungeon) {
        Object.assign(this.caves.dungeon, { capped: true, theme: 'dungeon', group: 'MAZMORRA', name: 'La Mazmorra' });
        this.caves.dungeon.content = this.caves.dungeon.content ?? [];
      }
      // Mallas: una por cueva (con sus ramales), hechas cuando el jugador se acerca.
      this._caveGroup = new THREE.Group();
      this._caveGroup.name = 'Caves';
      this._scene.add(this._caveGroup);
      const groups = new Map();
      for (const c of this.caves.caves) {
        const key = c.group ?? `cave${c.id}`;
        if (!groups.has(key)) groups.set(key, { theme: c.theme ?? 'roots', chains: [], bbox: { ...c.bbox } });
        const g = groups.get(key);
        g.chains.push(c);
        g.bbox.minX = Math.min(g.bbox.minX, c.bbox.minX);
        g.bbox.maxX = Math.max(g.bbox.maxX, c.bbox.maxX);
        g.bbox.minZ = Math.min(g.bbox.minZ, c.bbox.minZ);
        g.bbox.maxZ = Math.max(g.bbox.maxZ, c.bbox.maxZ);
      }
      this._caveMeshes = [...groups.values()].map((g) => ({ ...g, mesh: null }));
      this.caveLights = [];
      this._caveMaterial ??= markStencil(new THREE.MeshLambertMaterial({ vertexColors: true }), 1);
    }
    this.resources = new ResourceSystem({
      config: this._planet.RESOURCES,
      types: this._resourceTypes,
      seed: deriveSeed(fixed, 'resources'),
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
        isHole: this.caves ? (x, z) => this.caves.nearMouth(x, z, 4) : null,
        extraNodes: this.caves ? (cx, cz) => this.caves.nodesInChunk(cx, cz, this._cfg.CHUNK_SIZE, this._half) : null,
        // Vegetación diseñada: qué crece en cada sitio y cuánta hierba hay.
        floraAt: (x, z) => {
          const f = M.floraInfo(x, z);
          return f.type ? { table: FLORA_TABLE[f.type], density: f.density } : null;
        },
        grassAt: (x, z) => M.grassAt(x, z),
      },
    });
    this.resources.onChunkChanged = (cx, cz) => this._chunks.rebuild(cx, cz);
    this._stats.generationMs = performance.now() - t0;
    if (emitEvent) this._events.emit(GameEvents.WORLD_GENERATED, { seed: this.seed.text, spawn: { ...this._spawn } });
  }

  /**
   * Construye las mallas de las cuevas a menos de 260 m del jugador, poco a poco (unos
   * milisegundos por fotograma, sin tirones). `budget` = ms (Infinity: de una vez).
   */
  _buildNearCaves(budget = 5) {
    const p = this._focus;
    const t0 = performance.now();
    for (const c of this._caveMeshes) {
      if (c.mesh) continue;
      const b = c.bbox;
      const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
      const dz = Math.max(b.minZ - p.z, 0, p.z - b.maxZ);
      if (Math.hypot(dx, dz) > 260 && !c.job) continue;
      c.job ??= caveSurfaceSteps(c.chains.map((ch) => ({ nodes: ch.nodes })), (x, z) => this.terrain.heightAt(x, z), c.theme);
      let r = c.job.next();
      while (!r.done && performance.now() - t0 < budget) r = c.job.next();
      if (!r.done) return;
      c.job = null;
      const geo = r.value;
      c.mesh = geo ? new THREE.Mesh(geo, this._caveMaterial) : new THREE.Group();
      c.mesh.receiveShadow = true;
      c.mesh.renderOrder = -1;
      this._caveGroup.add(c.mesh);
      // Decoración del ambiente de la cueva y sus luces.
      const decor = buildCaveDecor(c.chains.map((ch) => ({ nodes: ch.nodes, branch: ch.kind === 'BRANCH' })), c.theme, c.chains[0].group ?? '');
      c.mesh.add(decor.group);
      this.caveLights.push(...decor.lights);
      return;
    }
  }

  /** Construye ya todas las cuevas (herramientas y pruebas). */
  buildAllCaves() {
    if (!this._caveMeshes) return;
    const f = this._focus;
    for (const c of this._caveMeshes) {
      this._focus = { x: (c.bbox.minX + c.bbox.maxX) / 2, z: (c.bbox.minZ + c.bbox.maxZ) / 2 };
      while (!c.mesh) this._buildNearCaves(Infinity);
    }
    this._focus = f;
  }

  /** Luces de las cuevas (cristales, setas, faroles…) cerca de un punto: [{ x, y, z, color, distance, intensity, d }]. */
  caveLightsNear(x, y, z, r = 40) {
    if (!this.caveLights?.length) return [];
    const out = [];
    for (const l of this.caveLights) {
      const d = Math.hypot(l.x - x, l.z - z, (l.y - y) * 2);
      if (d < r) out.push({ ...l, d });
    }
    return out;
  }

  /** Región con nombre en (x, z) (solo en mapas diseñados): { id, name, … } o null. */
  getRegionAt(x, z) {
    return this._map?.regionAt(x, z) ?? null;
  }

  /** Mapa diseñado del cuerpo (o null). */
  get map() {
    return this._map;
  }

  /** Nivel del agua dulce más cercana (para apuntar a ella al beber): el del mar si no hay mapa. */
  freshLevelNear(x, z, r = 4) {
    if (!this._map) return this._cfg.SEA_LEVEL;
    let best = null;
    for (let a = 0; a <= 8; a++) {
      const d = a === 8 ? 0 : r;
      const lv = this._map.waterAt(x + Math.cos((a / 8) * Math.PI * 2) * d, z + Math.sin((a / 8) * Math.PI * 2) * d);
      if (lv !== null && (best === null || lv > best)) best = lv;
    }
    return best ?? this._cfg.SEA_LEVEL;
  }

  update(dt = 0) {
    this.resources?.update(dt);
    if (this._freshMaterial) this._freshMaterial.userData.time.value += dt;
    if (this._caveMeshes && this._focus) this._buildNearCaves();
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

  /** Malla suelta de un recurso (geometría + material de los recursos): árbol talado que cae. */
  propMesh(node) {
    const geo = this._propMesher.nodeGeometry(node);
    return geo ? new THREE.Mesh(geo, this._propMaterial) : null;
  }

  /** Lugares especiales de un tipo (WorldSites): [{ id, kind, x, z, radius, height, yaw, seed }]. */
  getSites(kind) {
    return this.sites?.[kind] ?? [];
  }

  get seaLevel() {
    return this._cfg.SEA_LEVEL;
  }

  /**
   * Altura de la superficie del agua en (x, z) si ahí hay agua (charca o mar), o null.
   * Lo usan el nado/buceo y la respiración bajo el agua.
   */
  waterSurfaceAt(x, z) {
    const pond = this.water.getPondAt(x, z);
    if (pond) return pond.level;
    if (this._planet.HAS_SEA !== false && this.getHeightAt(x, z) < this._cfg.SEA_LEVEL) return this._cfg.SEA_LEVEL;
    return null;
  }

  /** Cómo es el agua de este cuerpo: { swim, dive, visibility, seaColor, pondColor }. */
  get fluid() {
    const F = this._planet.FLUID ?? {};
    return {
      swim: F.SWIM ?? true,
      dive: F.DIVE ?? true,
      visibility: F.VISIBILITY ?? 25,
      seaColor: this._planet.COLORS.SEA,
      pondColor: this._planet.WATER.COLOR,
    };
  }

  /** Área jugable (el mar del borde queda fuera). */
  getBounds() {
    const h = this._half - this._cfg.EDGE_MARGIN;
    return { minX: -h, maxX: h, minZ: -h, maxZ: h };
  }

  getSpawnPoint() {
    return { ...this._spawn };
  }

  /** Perfil del planeta (GameConfig.PLANETS.*): nombre, gravedad, si hay aire… */
  get planet() {
    return this._planet;
  }

  /** Libera la memoria de GPU de este mundo (al descartar una luna). */
  dispose() {
    this._scene.traverse((o) => o.geometry?.dispose?.()); // el índice compartido es de este mundo
    this._scene.parent?.remove(this._scene);
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

  /** Partida cargada: aplica lo talado/recogido y rehace las mallas de los recursos. */
  reloadResources(snap) {
    this.resources?.restore(snap);
    this._chunks.clear();
  }

  // ---- Cuevas ---------------------------------------------------------------------

  /** Suelo de cueva bajo unos pies en (x, z): { floor, ceil } o null (fuera de las cuevas). */
  caveFloorAt(x, z, feet) {
    return this.caves?.floorAt(x, z, feet) ?? null;
  }

  /** ¿(x, y, z) está dentro de una cueva? */
  inCave(x, y, z, margin = 0) {
    return !!this.caves?.contains(x, y, z, margin);
  }

  /** ¿El terreno en (x, z) está abierto por la boca de una cueva? */
  isCaveHole(x, z) {
    return !!this.caves?.holeAt(x, this.getHeightAt(x, z), z);
  }

  /** ¿Hay agua dulce (un río) en (x, z)? El mar no se bebe; los ríos y las charcas sí. */
  isFreshWaterAt(x, z) {
    if (this.water.isWater(x, z)) return true;
    if (this._map) return false;
    return !!this.terrain?.sample(x, z).fresh && this.getHeightAt(x, z) < this._cfg.SEA_LEVEL;
  }

  /** Lado de la región (m). */
  get worldSize() {
    return this._cfg.WORLD_SIZE;
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
    const surface = this._map ? new Uint8Array(s * s) : null;
    for (let l = 0; l < s; l++) {
      for (let k = 0; k < s; k++) {
        const i = l * s + k;
        const x = originX + (k - 1) * sp;
        const z = originZ + (l - 1) * sp;
        const sample = this.terrain.sample(x, z);
        heights[i] = sample.height;
        for (const id in biomeWeights) biomeWeights[id][i] = sample.biomes[id];
        shore[i] = this.water.shoreFactor(x, z);
        if (surface) surface[i] = this._map.surfaceAt(x, z);
      }
    }
    data = { cx, cz, res, spacing: sp, originX, originZ, heights, biomeWeights, shore, surface };
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
    if (this._map) return; // el agua de los mapas diseñados se dibuja por chunks
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

  /**
   * Posición inicial determinista: terreno seco y llano en la Explanada, cerca del
   * centro (o, con SPAWN_ANYWHERE, cerca de un punto al azar de la región).
   */
  _findSpawn() {
    const c = this._cfg;
    const minPlains = this._planet.BIOME_DISTRIBUTION.SPAWN_MIN_PLAINS;
    const rng = new SeededRandom(this.seed.sub.spawn);
    let cx = 0;
    let cz = 0;
    if (this._rules?.SPAWN_ANYWHERE) {
      const r = this.getBounds().maxX * 0.6;
      cx = rng.range(-r, r);
      cz = rng.range(-r, r);
    }
    const maxRadius = this.getBounds().maxX - 16 + Math.hypot(cx, cz);
    // Rondas con radio creciente: si cerca del centro no hay explanada, se busca más lejos.
    for (let radiusLimit = c.SPAWN_SEARCH_RADIUS; ; radiusLimit = Math.min(maxRadius, radiusLimit * 1.6)) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < c.SPAWN_ATTEMPTS; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = Math.sqrt(rng.next()) * radiusLimit;
        const x = cx + Math.cos(angle) * radius;
        const z = cz + Math.sin(angle) * radius;
        const b = this.getBounds();
        if (x < b.minX + 16 || x > b.maxX - 16 || z < b.minZ + 16 || z > b.maxZ - 16) continue;
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

  /**
   * Lugar de la nave en un bioma concreto (el monte helado de la campaña): al azar
   * por la región, en lo alto (sobre la línea de nieve), a LANDING_DISTANCE m del
   * inicio y donde el terreno es menos irregular. Después se aplana (setPads).
   * @returns {{x, z, yaw, height} | null}
   */
  _findBiomeLandingSite({ HALF_WIDTH, HALF_LENGTH }, { LANDING_BIOME, LANDING_DISTANCE = [300, 1500] }) {
    const rng = new SeededRandom(deriveSeed(this.seed.sub.spawn, 'biomeLanding'));
    const sp = this._spawn;
    const b = this.getBounds();
    const snow = this._planet.BIOMES[LANDING_BIOME]?.SNOW_START_HEIGHT ?? 0;
    const reach = Math.max(HALF_WIDTH, HALF_LENGTH) + 4;
    let best = null;
    for (let i = 0; i < 4000; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = rng.range(LANDING_DISTANCE[0], LANDING_DISTANCE[1]);
      const x = sp.x + Math.cos(angle) * radius;
      const z = sp.z + Math.sin(angle) * radius;
      const yaw = rng.range(0, Math.PI * 2);
      if (x < b.minX + 60 || x > b.maxX - 60 || z < b.minZ + 60 || z > b.maxZ - 60) continue;
      const s = this.terrain.sample(x, z);
      if ((s.biomes[LANDING_BIOME] ?? 0) < 0.85 || s.height < snow + 6) continue;
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      let n = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const r of [reach * 0.5, reach]) {
          const h = this.terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
          min = Math.min(min, h);
          max = Math.max(max, h);
          sum += h;
          n++;
        }
      }
      const height = (sum / n + s.height) / 2;
      // Que no quede en una repisa con la ladera encima: mejor en una loma o cima (se ve de lejos).
      // Sin barrancos ni agua al lado: el terreno de alrededor tampoco cae en picado.
      let above = 0;
      let below = 0;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        for (const r of [reach * 2.2, reach * 3.5]) {
          const d = this.terrain.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) - height;
          above = Math.max(above, d);
          below = Math.max(below, -d);
        }
      }
      if (below > 14 || height - below < snow) continue;
      const score = max - min + Math.max(0, above) * 0.8;
      if (!best || score < best.score) best = { x, z, yaw, score, height };
      if (best.score < 4 && i > 600) break;
    }
    return best ? { x: best.x, z: best.z, yaw: best.yaw, height: best.height } : null;
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
      hideOverCaves(new THREE.MeshPhongMaterial({
        color: this._planet.COLORS.SEA,
        specular: 0x9fc4dd,
        shininess: 60,
        transparent: true,
        opacity: this._planet.COLORS.SEA_OPACITY,
      })),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = this._cfg.SEA_LEVEL;
    sea.name = 'sea';
    sea.visible = this._planet.HAS_SEA !== false; // las lunas no tienen mar
    this._scene.add(sea);
  }
}
