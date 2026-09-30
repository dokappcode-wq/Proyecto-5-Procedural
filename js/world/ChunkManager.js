import * as THREE from 'three';

/**
 * ChunkManager — carga/descarga progresiva de MALLAS de terreno alrededor de
 * un punto (el jugador).
 *
 * - Solo existen mallas dentro de VIEW_DISTANCE_CHUNKS (radio circular).
 * - Se construyen como máximo CHUNKS_BUILT_PER_FRAME por frame, empezando por
 *   los más cercanos; los chunks inmediatos al jugador se construyen siempre
 *   al momento para que nunca falte suelo bajo sus pies.
 * - Las mallas se destruyen al superar VIEW_DISTANCE + 1 (histéresis, evita
 *   cargar/descargar en bucle en la frontera).
 * - Los DATOS de altura los proporciona `getChunkData(cx, cz)` (con caché en
 *   WorldGenerator); este módulo solo gestiona geometría y escena.
 */
export class ChunkManager {
  constructor({ scene, config, chunkCount, getChunkData, mesher, material }) {
    this._cfg = config;
    this._count = chunkCount;
    this._getChunkData = getChunkData;
    this._mesher = mesher;
    this._material = material;

    this.group = new THREE.Group();
    this.group.name = 'TerrainChunks';
    scene.add(this.group);

    this._meshes = new Map(); // key → Mesh
    this._queue = [];
    this._lastCenter = null;
  }

  get loadedCount() {
    return this._meshes.size;
  }

  get pendingCount() {
    return this._queue.length;
  }

  /** Destruye todas las mallas (p. ej. al regenerar el mundo con otra seed). */
  clear() {
    for (const mesh of this._meshes.values()) this._disposeMesh(mesh);
    this._meshes.clear();
    this._queue = [];
    this._lastCenter = null;
  }

  /** @param {number} fcx @param {number} fcz  coordenadas de chunk (fraccionarias) del foco */
  update(fcx, fcz) {
    const cx = Math.floor(fcx);
    const cz = Math.floor(fcz);
    const key = `${cx},${cz}`;

    if (key !== this._lastCenter) {
      this._lastCenter = key;
      this._refreshQueue(cx, cz);
      this._unloadFar(cx, cz);
    }

    // Suelo inmediato: sin límite de presupuesto.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) this._ensure(cx + dx, cz + dz);
    }

    let budget = this._cfg.CHUNKS_BUILT_PER_FRAME;
    while (budget > 0 && this._queue.length) {
      const [qx, qz] = this._queue.shift();
      if (this._ensure(qx, qz)) budget--;
    }
  }

  _refreshQueue(cx, cz) {
    const r = this._cfg.VIEW_DISTANCE_CHUNKS;
    const list = [];
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > r * r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (!this._inWorld(x, z) || this._meshes.has(`${x},${z}`)) continue;
        list.push([x, z, d2]);
      }
    }
    list.sort((a, b) => a[2] - b[2]);
    this._queue = list.map(([x, z]) => [x, z]);
  }

  _unloadFar(cx, cz) {
    const r = this._cfg.VIEW_DISTANCE_CHUNKS + 1;
    for (const [key, mesh] of this._meshes) {
      const { cx: x, cz: z } = mesh.userData;
      if ((x - cx) ** 2 + (z - cz) ** 2 > r * r) {
        this._disposeMesh(mesh);
        this._meshes.delete(key);
      }
    }
  }

  /** @returns {boolean} true si ha construido una malla nueva */
  _ensure(cx, cz) {
    if (!this._inWorld(cx, cz)) return false;
    const key = `${cx},${cz}`;
    if (this._meshes.has(key)) return false;
    const data = this._getChunkData(cx, cz);
    const mesh = new THREE.Mesh(this._mesher.build(data), this._material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.userData = { cx, cz };
    mesh.name = `chunk_${key}`;
    this.group.add(mesh);
    this._meshes.set(key, mesh);
    return true;
  }

  _inWorld(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this._count && cz < this._count;
  }

  _disposeMesh(mesh) {
    this.group.remove(mesh);
    // El índice es compartido entre chunks: no se libera aquí.
    const geo = mesh.geometry;
    geo.index = null;
    geo.dispose();
  }
}
