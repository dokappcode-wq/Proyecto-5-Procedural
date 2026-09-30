import * as THREE from 'three';

/**
 * ChunkManager — carga/descarga progresiva de las MALLAS de cada chunk
 * alrededor de un punto (el jugador), organizadas en CAPAS.
 *
 * Una capa es { name, viewDistance, build(cx, cz) → Object3D|null, dispose(obj) }.
 * Ejemplos: terreno (radio 4) y recursos/hierba (radio 3). Añadir contenido
 * nuevo por chunk (estructuras, decoración...) = añadir una capa.
 *
 * - Solo existen mallas dentro del radio de cada capa (círculo).
 * - Se construyen como máximo CHUNKS_BUILT_PER_FRAME (chunk×capa) por frame,
 *   empezando por los más cercanos; el chunk del jugador y sus vecinos se
 *   construyen siempre al momento.
 * - Histéresis de 1 chunk al descargar (evita cargar/descargar en bucle).
 * - rebuild(cx, cz) reconstruye un chunk cargado (p. ej. al recoger un árbol).
 */
export class ChunkManager {
  constructor({ scene, config, chunkCount, layers }) {
    this._cfg = config;
    this._count = chunkCount;
    this._layers = layers;

    this.group = new THREE.Group();
    this.group.name = 'Chunks';
    scene.add(this.group);

    // Por capa: key → Object3D (o null si la capa no produjo nada para ese chunk)
    this._loaded = layers.map(() => new Map());
    this._queue = [];
    this._lastCenter = null;
    this._center = { cx: 0, cz: 0 };
  }

  get loadedCount() {
    return this._loaded[0].size;
  }

  get pendingCount() {
    return this._queue.length;
  }

  /** Destruye todas las mallas (p. ej. al regenerar el mundo con otra seed). */
  clear() {
    this._layers.forEach((layer, li) => {
      for (const obj of this._loaded[li].values()) this._dispose(layer, obj);
      this._loaded[li].clear();
    });
    this._queue = [];
    this._lastCenter = null;
  }

  /** Reconstruye todas las capas de un chunk si está cargado. */
  rebuild(cx, cz) {
    const key = `${cx},${cz}`;
    this._layers.forEach((layer, li) => {
      const map = this._loaded[li];
      if (!map.has(key)) return;
      this._dispose(layer, map.get(key));
      map.delete(key);
      this._build(li, cx, cz);
    });
  }

  /** @param {number} fcx @param {number} fcz  coordenadas de chunk (fraccionarias) del foco */
  update(fcx, fcz) {
    const cx = Math.floor(fcx);
    const cz = Math.floor(fcz);
    const key = `${cx},${cz}`;

    if (key !== this._lastCenter) {
      this._lastCenter = key;
      this._center = { cx, cz };
      this._refreshQueue(cx, cz);
      this._unloadFar(cx, cz);
    }

    // Suelo y objetos inmediatos: sin límite de presupuesto.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        this._layers.forEach((_, li) => this._ensure(li, cx + dx, cz + dz));
      }
    }

    let budget = this._cfg.CHUNKS_BUILT_PER_FRAME;
    while (budget > 0 && this._queue.length) {
      const [li, qx, qz] = this._queue.shift();
      if (this._ensure(li, qx, qz)) budget--;
    }
  }

  _refreshQueue(cx, cz) {
    const list = [];
    this._layers.forEach((layer, li) => {
      const r = layer.viewDistance;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (!this._inWorld(x, z) || this._loaded[li].has(`${x},${z}`)) continue;
          // El terreno va antes que los objetos a igual distancia.
          list.push([li, x, z, d2 + li * 0.5]);
        }
      }
    });
    list.sort((a, b) => a[3] - b[3]);
    this._queue = list.map(([li, x, z]) => [li, x, z]);
  }

  _unloadFar(cx, cz) {
    this._layers.forEach((layer, li) => {
      const r = layer.viewDistance + 1;
      for (const [key, obj] of this._loaded[li]) {
        const [x, z] = key.split(',').map(Number);
        if ((x - cx) ** 2 + (z - cz) ** 2 > r * r) {
          this._dispose(layer, obj);
          this._loaded[li].delete(key);
        }
      }
    });
  }

  /** @returns {boolean} true si ha construido algo nuevo */
  _ensure(li, cx, cz) {
    if (!this._inWorld(cx, cz) || this._loaded[li].has(`${cx},${cz}`)) return false;
    const r = this._layers[li].viewDistance + 1;
    if ((cx - this._center.cx) ** 2 + (cz - this._center.cz) ** 2 > r * r) return false;
    this._build(li, cx, cz);
    return true;
  }

  _build(li, cx, cz) {
    const obj = this._layers[li].build(cx, cz);
    if (obj) {
      obj.userData.chunk = { cx, cz };
      this.group.add(obj);
    }
    this._loaded[li].set(`${cx},${cz}`, obj);
  }

  _inWorld(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this._count && cz < this._count;
  }

  _dispose(layer, obj) {
    if (!obj) return;
    this.group.remove(obj);
    layer.dispose(obj);
  }
}
