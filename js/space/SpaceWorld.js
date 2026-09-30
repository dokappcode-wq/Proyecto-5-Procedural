/**
 * SpaceWorld — el espacio como "cuerpo" con la misma interfaz que un mundo con
 * terreno (getHeightAt, getBounds, resources, water, getBiomeAt…), pero vacío:
 * no hay suelo. Lo único que se pisa es la nave (y los meteoritos, que tienen su
 * propia gravedad). Así jugador, cámara, construcción, interacción y temperatura
 * funcionan igual en el espacio sin saber que lo es.
 */
const NO_GROUND = -1e5;

export class SpaceWorld {
  constructor({ getSeed }) {
    this.name = 'spaceWorld';
    this._getSeed = getSeed;
    this.planet = { NAME: 'Espacio', KIND: 'SPACE', HAS_SEA: false, BREATHABLE: false, GRAVITY_SCALE: 1 };
    this.water = {
      ponds: [],
      isWater: () => false,
      nearestPond: () => null,
      getPondAt: () => null,
      shoreFactor: () => 0,
    };
    // Recursos de otros sistemas (meteoritos) se pueden conectar aquí.
    this.resources = {
      getNodesNear: () => [],
      resolveCollisions: () => false,
      harvest: () => null,
      update() {},
    };
    this.terrain = null;
  }

  get seed() {
    return this._getSeed();
  }

  get seaLevel() {
    return NO_GROUND;
  }

  getHeightAt() {
    return NO_GROUND;
  }

  getBounds() {
    return { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 };
  }

  getSpawnPoint() {
    return { x: 0, z: 0 };
  }

  getLandingSite() {
    return null;
  }

  getBiomeAt() {
    return { id: 'SPACE', name: 'Espacio', weights: {}, temperature: -120 };
  }

  describeAt() {
    return { generator: 'SpaceWorld', biome: 'Espacio', biomeInfo: this.getBiomeAt(), height: NO_GROUND, mountain: 0, coast: 0 };
  }

  findNearestBiome() {
    return null;
  }

  getInfo() {
    return { planet: 'Espacio', ponds: 0, resourceChunksCached: 0, seedText: this.seed?.text ?? '', worldSize: 0, chunkMeshesLoaded: 0 };
  }

  follow() {}

  update() {}
}
