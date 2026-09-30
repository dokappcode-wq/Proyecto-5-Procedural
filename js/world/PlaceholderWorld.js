import * as THREE from 'three';

/**
 * PlaceholderWorld — mundo provisional de la FASE 1.
 *
 * Implementa la interfaz de "proveedor de terreno" que usa el jugador:
 *
 *   getHeightAt(x, z) → altura del suelo (m) en ese punto
 *   getBounds()       → { minX, maxX, minZ, maxZ }
 *   getSpawnPoint()   → { x, z }
 *   describeAt(x, z)  → info de depuración (bioma, etc.)
 *
 * En la FASE 2 el WorldGenerator procedural implementará esta misma interfaz
 * y sustituirá a esta clase sin tocar PlayerController ni CameraSystem.
 */
export class PlaceholderWorld {
  constructor({ scene, config, spawn }) {
    this._cfg = config;
    this._spawn = spawn;
    this.group = new THREE.Group();
    this.group.name = 'PlaceholderWorld';
    scene.add(this.group);

    this._blocks = config.BLOCKS.map(([x, z, w, h, d]) => ({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      top: h, x, z, w, h, d,
    }));

    this._buildGround();
    this._buildBlocks();
  }

  // ---- Interfaz de proveedor de terreno ---------------------------------

  getHeightAt(x, z) {
    let h = 0;
    for (const b of this._blocks) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.top > h) h = b.top;
    }
    return h;
  }

  getBounds() {
    const half = this._cfg.SIZE / 2;
    return { minX: -half, maxX: half, minZ: -half, maxZ: half };
  }

  getSpawnPoint() {
    return { x: this._spawn.x, z: this._spawn.z };
  }

  describeAt() {
    return { biome: 'Provisional (Fase 1)', generator: 'PlaceholderWorld' };
  }

  // ---- Construcción visual ----------------------------------------------

  _buildGround() {
    const { SIZE, GRID_CELL, GROUND_COLOR_A, GROUND_COLOR_B } = this._cfg;

    // Textura de cuadrícula generada en canvas: da referencia visual de movimiento.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const a = '#' + new THREE.Color(GROUND_COLOR_A).getHexString();
    const b = '#' + new THREE.Color(GROUND_COLOR_B).getHexString();
    ctx.fillStyle = a; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = b; ctx.fillRect(0, 0, 32, 32); ctx.fillRect(32, 32, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.anisotropy = 4;
    const repeats = SIZE / (GRID_CELL * 2);
    tex.repeat.set(repeats, repeats);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.group.add(ground);
  }

  _buildBlocks() {
    // Una sola geometría y un solo material compartidos por todos los bloques.
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: this._cfg.BLOCK_COLOR });
    for (const b of this._blocks) {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(b.w, b.h, b.d);
      m.position.set(b.x, b.h / 2, b.z);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
  }
}
