import * as THREE from 'three';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { DIM, HATCH, LEGS, SLOTS, SEAT, EXT_BUTTON, INNER_BUTTON, WATCH_AIM, legBottoms, rampEnd } from './ShipLayout.js';

/**
 * ShipModel — modelo low-poly de la nave pequeña, en las coordenadas locales
 * de ShipLayout (−Z = morro, y = 0 = apoyo de las patas).
 *
 * Partes fijas fusionadas en pocas mallas (casco opaco, cristales, luces) y
 * partes móviles separadas: rampa de la compuerta, puerta corredera, patas,
 * luces de los motores y barras de carga de las baterías.
 * Solo es presentación: el estado lo decide ShipFlight / ShipSystem.
 */
const HULL = 0xd6dbe1;
const HULL_ALT = 0xc3c9d1;
const ACCENT = 0xe0782f;
const DARK = 0x3a4250;
const METAL = 0x7d8794;
const FLOOR = 0x5d6673;
const FLOOR_ALT = 0x535b67;
const WALL_IN = 0xaab3be;
const SOFA = 0x3d6f9e;
const SEAT_COLOR = 0xc8612a;
const GLOW_SCREEN = 0x4fe0a0;
const GLOW_LIGHT = 0xf4f1e2;
const GLOW_ENGINE = 0x8fd8ff;
const BATTERY = 0xf0c24a;

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);

/** Caja entre dos esquinas (coordenadas locales). */
function slab(b, x0, x1, y0, y1, z0, z1, color, jitter) {
  b.add(box, {
    position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    scale: [x1 - x0, y1 - y0, z1 - z0],
    color,
    jitter,
  });
}

export class ShipModel {
  constructor({ scene }) {
    this.root = new THREE.Group();
    this.root.name = 'Ship';
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);

    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this._glassMaterial = new THREE.MeshPhongMaterial({
      color: 0x86c9ee, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
    });

    this._buildHull();
    this._buildMoving();

    // Luces interiores (sin sombras), una por sala: se ven de noche y alumbran un poco alrededor.
    this.lights = [[0, 4.5, 1.8], [0, 4.5, -4.6]].map(([x, y, z]) => {
      const light = new THREE.PointLight(0xfff1d6, 22, 11, 1.4);
      light.position.set(x, y, z);
      this.root.add(light);
      return light;
    });

    this.root.traverse((o) => {
      if (o.isMesh && o.material !== this._glassMaterial && o.material !== this._glowMaterial) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    this._t = 0;
  }

  // ---- Construcción ---------------------------------------------------------

  _buildHull() {
    const b = new PartsBuilder();
    const g = new PartsBuilder(); // luces y pantallas
    const glass = new PartsBuilder();
    const W = DIM.HALF_WIDTH;
    const I = DIM.INNER;

    // Suelo alrededor del hueco de la compuerta (tablas de dos tonos).
    const floorRects = [
      [-W, W, DIM.FRONT, HATCH.HINGE_Z],
      [-W, HATCH.MIN_X, HATCH.HINGE_Z, DIM.REAR],
      [HATCH.MAX_X, W, HATCH.HINGE_Z, DIM.REAR],
      [HATCH.MIN_X, HATCH.MAX_X, HATCH.HINGE_Z + HATCH.LENGTH, DIM.REAR],
    ];
    floorRects.forEach(([x0, x1, z0, z1], i) => slab(b, x0, x1, DIM.BOTTOM, DIM.FLOOR, z0, z1, i % 2 ? FLOOR_ALT : FLOOR));
    // Marco del hueco de la compuerta (franjas de aviso).
    slab(b, HATCH.MIN_X - 0.12, HATCH.MIN_X, DIM.FLOOR, DIM.FLOOR + 0.02, HATCH.HINGE_Z, HATCH.HINGE_Z + HATCH.LENGTH, ACCENT);
    slab(b, HATCH.MAX_X, HATCH.MAX_X + 0.12, DIM.FLOOR, DIM.FLOOR + 0.02, HATCH.HINGE_Z, HATCH.HINGE_Z + HATCH.LENGTH, ACCENT);

    // Paredes laterales con ventanas (banda baja, banda alta y montantes).
    const winLow = 3.35;
    const winHigh = 4.3;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -W : I;
      const x1 = side < 0 ? -I : W;
      slab(b, x0, x1, DIM.BOTTOM, winLow, DIM.FRONT, DIM.REAR, HULL);
      slab(b, x0, x1, winHigh, DIM.ROOF, DIM.FRONT, DIM.REAR, HULL);
      // Montantes: las ventanas quedan entre ellos.
      for (const z of [-7.0, -5.6, -4.2, -2.6, -0.2, 1.2, 3.6, 6.0]) slab(b, x0, x1, winLow, winHigh, z, z + 0.6, HULL_ALT);
      glass.add(box, { position: [(x0 + x1) / 2, (winLow + winHigh) / 2, (DIM.FRONT + DIM.REAR) / 2], scale: [0.06, winHigh - winLow, DIM.REAR - DIM.FRONT] });
      // Franja naranja exterior.
      const xs = side < 0 ? -W - 0.02 : W;
      slab(b, xs, xs + 0.02, 2.75, 2.95, DIM.FRONT, DIM.REAR, ACCENT);
    }
    // Pared trasera y parabrisas.
    slab(b, -W, W, DIM.BOTTOM, DIM.ROOF, 6.3, DIM.REAR, HULL);
    slab(b, -W, W, DIM.BOTTOM, 3.3, DIM.FRONT, -6.7, HULL);
    slab(b, -W, W, 4.7, DIM.ROOF, DIM.FRONT, -6.7, HULL);
    for (const x of [-W, -0.15, W - 0.4]) slab(b, x, x + 0.4, 3.3, 4.7, DIM.FRONT, -6.7, HULL_ALT);
    glass.add(box, { position: [0, 4.0, -6.85], scale: [2 * W, 1.4, 0.06] });
    // Techo con espina central y luces interiores.
    slab(b, -W, W, DIM.CEILING, DIM.ROOF, DIM.FRONT, DIM.REAR, HULL);
    slab(b, -1.2, 1.2, DIM.ROOF, DIM.ROOF + 0.25, -6.0, 5.5, HULL_ALT);
    slab(b, -0.3, 0.3, DIM.ROOF + 0.25, DIM.ROOF + 0.3, -5.0, 4.5, ACCENT);
    slab(b, -I, I, DIM.CEILING - 0.04, DIM.CEILING, DIM.FRONT + 0.3, 6.3, WALL_IN); // techo interior claro
    for (const z of [-4.6, -0.8, 3.2]) slab(g, -0.8, 0.8, DIM.CEILING - 0.06, DIM.CEILING - 0.04, z - 0.5, z + 0.5, GLOW_LIGHT);
    // Morro en cuña.
    b.add(box, {
      position: [0, 3.5, (DIM.NOSE + DIM.FRONT) / 2],
      scale: [4.6, 2.6, DIM.FRONT - DIM.NOSE],
      color: HULL,
      jitter: (i, v) => {
        if (v.z < 0) {
          v.x *= 0.55;
          if (v.y > 0) v.y = -0.05;
        }
      },
    });
    slab(b, -1.6, 1.6, DIM.BOTTOM, 2.6, DIM.NOSE + 0.4, DIM.FRONT, HULL_ALT);
    // Motores traseros con toberas.
    for (const sx of [-2.4, 2.4]) {
      b.add(cyl, { position: [sx, 3.7, 7.2], rotation: [Math.PI / 2, 0, 0], scale: [1.25, 1.2, 1.25], color: METAL });
      b.add(cyl, { position: [sx, 3.7, 6.75], rotation: [Math.PI / 2, 0, 0], scale: [1.45, 0.3, 1.45], color: DARK });
    }
    // Panel de acceso exterior (botón de la compuerta) bajo la cola.
    const e = EXT_BUTTON.collider;
    slab(b, e.minX, e.maxX, e.minY, e.maxY, e.minZ, e.maxZ, DARK);
    slab(b, e.minX - 0.05, e.maxX + 0.05, e.minY - 0.05, e.minY, e.minZ - 0.05, e.maxZ + 0.05, ACCENT);

    // Tabique entre salas (la puerta es móvil) con marco.
    slab(b, -I, -DIM.DOOR_HALF, DIM.FLOOR, DIM.CEILING, -2.5, -2.2, WALL_IN);
    slab(b, DIM.DOOR_HALF, I, DIM.FLOOR, DIM.CEILING, -2.5, -2.2, WALL_IN);
    slab(b, -DIM.DOOR_HALF, DIM.DOOR_HALF, DIM.DOOR_TOP, DIM.CEILING, -2.5, -2.2, WALL_IN);
    slab(b, -DIM.DOOR_HALF - 0.1, -DIM.DOOR_HALF, DIM.FLOOR, DIM.DOOR_TOP, -2.55, -2.15, ACCENT);
    slab(b, DIM.DOOR_HALF, DIM.DOOR_HALF + 0.1, DIM.FLOOR, DIM.DOOR_TOP, -2.55, -2.15, ACCENT);

    // ---- Sala de controles ----
    // Consola de vuelo (Tecnología 1) con pantallas.
    const c = SLOTS.CONTROL_CONSOLE.collider;
    slab(b, c.minX, c.maxX, c.minY, c.maxY - 0.3, c.minZ, c.maxZ, DARK);
    b.add(box, { position: [0, c.maxY - 0.15, -6.2], rotation: [-0.5, 0, 0], scale: [4, 0.12, 0.9], color: METAL });
    for (const x of [-1.3, 0, 1.3]) {
      g.add(box, { position: [x, c.maxY - 0.07, -6.2], rotation: [-0.5, 0, 0], scale: [1.0, 0.04, 0.6], color: x === 0 ? 0x62c7ff : GLOW_SCREEN });
    }
    // Asiento del piloto (mira al morro).
    const s = SEAT.collider;
    slab(b, -0.15, 0.15, DIM.FLOOR, 2.95, SEAT.z - 0.15, SEAT.z + 0.15, METAL);
    slab(b, s.minX, s.maxX, 2.95, 3.15, s.minZ, s.maxZ, SEAT_COLOR);
    slab(b, s.minX, s.maxX, 3.15, s.maxY, s.maxZ - 0.15, s.maxZ, SEAT_COLOR);
    slab(b, s.minX - 0.1, s.minX, 3.1, 3.35, s.minZ, s.maxZ, DARK);
    slab(b, s.maxX, s.maxX + 0.1, 3.1, 3.35, s.minZ, s.maxZ, DARK);

    // ---- Sala de estar / laboratorio ----
    // Sofá (rincón trasero izquierdo).
    slab(b, -3.1, -1.7, DIM.FLOOR, 2.95, 4.6, 6.3, DARK);
    slab(b, -3.1, -1.7, 2.95, 3.1, 4.6, 6.3, SOFA);
    slab(b, -3.1, -2.75, 3.1, 3.4, 4.6, 6.3, SOFA);
    slab(b, -3.1, -1.7, 3.1, 3.4, 6.0, 6.3, SOFA);
    // Mesa de laboratorio con frascos (rincón trasero derecho).
    slab(b, 1.7, 3.1, 3.2, 3.35, 4.6, 6.3, METAL);
    for (const [x, z] of [[1.8, 4.7], [3.0, 4.7], [1.8, 6.2], [3.0, 6.2]]) slab(b, x - 0.05, x + 0.05, DIM.FLOOR, 3.2, z - 0.05, z + 0.05, DARK);
    for (const [x, z, col] of [[2.1, 5.0, 0x7cf0b0], [2.5, 5.3, 0xc58cff], [2.85, 4.9, 0x7fd8ff]]) {
      g.add(cyl, { position: [x, 3.5, z], scale: [0.18, 0.3, 0.18], color: col });
    }
    // Botón interior de la compuerta.
    const ib = INNER_BUTTON.collider;
    slab(b, ib.minX, ib.maxX, ib.minY, ib.maxY - 0.1, ib.minZ, ib.maxZ, DARK);

    // Ranuras de tecnología (muebles). Las libres llevan un panel con "+".
    for (const [id, slot] of Object.entries(SLOTS)) {
      if (id === 'CONTROL_CONSOLE') continue;
      const k = slot.collider;
      const dir = Math.sign((k.minX + k.maxX) / 2); // −1 pared izquierda, +1 derecha
      const face = dir < 0 ? k.maxX : k.minX;       // cara que mira a la sala
      if (id === 'LAB_1') {
        // Consola del mapa: pedestal + pantalla (textura del mapa, ver setMapTexture).
        slab(b, k.minX, k.maxX, k.minY, 3.05, k.minZ, k.maxZ, DARK);
        slab(b, dir < 0 ? -I : I - 0.15, dir < 0 ? -I + 0.15 : I, 3.05, k.maxY, k.minZ, k.maxZ, METAL);
      } else if (id === 'LAB_2') {
        // Puesto de carga: armario con 4 bahías (las baterías son móviles).
        slab(b, k.minX, k.maxX, k.minY, k.maxY, k.minZ, k.maxZ, DARK);
        slab(b, face - 0.02 * dir, face, 2.7, 3.6, k.minZ + 0.1, k.maxZ - 0.1, METAL);
        g.add(box, { position: [face - 0.03 * dir, k.maxY - 0.1, (k.minZ + k.maxZ) / 2], scale: [0.02, 0.08, 1.0], color: 0x6ad0ff });
      } else {
        slab(b, k.minX, k.maxX, k.minY, k.maxY, k.minZ, k.maxZ, METAL);
        slab(b, dir < 0 ? -I : I - 0.08, dir < 0 ? -I + 0.08 : I, k.maxY, 4.4, k.minZ, k.maxZ, DARK);
        const px = dir < 0 ? -I + 0.09 : I - 0.09;
        const cz = (k.minZ + k.maxZ) / 2;
        g.add(box, { position: [px, 3.85, cz], scale: [0.02, 0.5, 0.08], color: 0x8a96a6 });
        g.add(box, { position: [px, 3.85, cz], scale: [0.02, 0.08, 0.5], color: 0x8a96a6 });
      }
    }

    this._addMesh(b, this._material, 'ShipHull');
    this._addMesh(g, this._glowMaterial, 'ShipLights');
    this._addMesh(glass, this._glassMaterial, 'ShipGlass');

    // Pantalla del mapa (Tecnología 2): plano que mira a la sala.
    const k = SLOTS.LAB_1.collider;
    this._mapScreenMaterial = new THREE.MeshBasicMaterial({ color: 0x1b3a2e });
    this.mapScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.72), this._mapScreenMaterial);
    this.mapScreen.position.set(-I + 0.17, 3.45, (k.minZ + k.maxZ) / 2);
    this.mapScreen.rotation.y = Math.PI / 2;
    this.root.add(this.mapScreen);
  }

  _buildMoving() {
    // Rampa de la compuerta: pivota en la bisagra; al girar baja hacia la cola.
    this.hatchPivot = new THREE.Group();
    this.hatchPivot.position.set(0, DIM.FLOOR, HATCH.HINGE_Z);
    const rb = new PartsBuilder();
    const w = HATCH.MAX_X - HATCH.MIN_X;
    for (let i = 0; i < 7; i++) {
      const z0 = (HATCH.LENGTH / 7) * i;
      slab(rb, -w / 2, w / 2, -HATCH.THICKNESS, 0, z0, z0 + HATCH.LENGTH / 7 - 0.02, i % 2 ? FLOOR_ALT : METAL);
    }
    slab(rb, -w / 2, -w / 2 + 0.1, 0, 0.03, 0, HATCH.LENGTH, ACCENT);
    slab(rb, w / 2 - 0.1, w / 2, 0, 0.03, 0, HATCH.LENGTH, ACCENT);
    this.hatchPivot.add(this._mesh(rb, this._material));
    this.root.add(this.hatchPivot);

    // Puerta corredera entre salas.
    const db = new PartsBuilder();
    slab(db, -DIM.DOOR_HALF, DIM.DOOR_HALF, DIM.FLOOR, DIM.DOOR_TOP, -2.45, -2.25, HULL_ALT);
    slab(db, -0.08, 0.08, 3.4, 3.8, -2.47, -2.23, ACCENT);
    this.door = this._mesh(db, this._material);
    this.root.add(this.door);

    // Patas: puntal que se estira hacia abajo + pie.
    this.legs = LEGS.map((l) => {
      const group = new THREE.Group();
      group.position.set(l.x, DIM.BOTTOM, l.z);
      const strut = new THREE.Mesh(box, this._material);
      strut.geometry = toColored(box, METAL);
      const foot = new THREE.Mesh(toColored(new THREE.CylinderGeometry(0.42, 0.5, 0.18, 8), DARK), this._material);
      const hinge = new THREE.Mesh(toColored(box, DARK), this._material);
      hinge.scale.set(0.6, 0.3, 0.6);
      hinge.position.y = -0.15;
      group.add(strut, foot, hinge);
      this.root.add(group);
      return { group, strut, foot };
    });

    // Luces: botón exterior (rojo cerrado / verde abierto) y toberas.
    this._buttonMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
    const e = EXT_BUTTON.collider;
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), this._buttonMaterial);
    btn.position.set((e.minX + e.maxX) / 2, 1.8, e.maxZ + 0.02);
    this.root.add(btn);
    const ib = INNER_BUTTON.collider;
    const btn2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), this._buttonMaterial);
    btn2.position.set((ib.minX + ib.maxX) / 2, ib.maxY - 0.07, (ib.minZ + ib.maxZ) / 2);
    this.root.add(btn2);

    // Base del reloj (siempre) y reloj (se oculta cuando lo lleva el jugador).
    const [wx, wy, wz] = WATCH_AIM;
    const dock = new THREE.Mesh(toColored(new THREE.BoxGeometry(0.34, 0.06, 0.34), DARK), this._material);
    dock.position.set(wx, 3.38, wz);
    this.root.add(dock);
    this.watch = new THREE.Group();
    const strap = new THREE.Mesh(toColored(new THREE.BoxGeometry(0.1, 0.03, 0.34), 0x2b2f38), this._material);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0x7fe0ff }));
    face.position.y = 0.03;
    this.watch.add(strap, face);
    this.watch.position.set(wx, wy - 0.03, wz);
    this.root.add(this.watch);

    this._engineMaterial = new THREE.MeshBasicMaterial({ color: GLOW_ENGINE, transparent: true, opacity: 0.25 });
    for (const sx of [-2.4, 2.4]) {
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), this._engineMaterial);
      glow.position.set(sx, 3.7, 7.81);
      this.root.add(glow);
    }

    // Baterías del puesto de carga: una caja por ranura + barra de carga.
    const k = SLOTS.LAB_2.collider;
    this._batteryMaterial = new THREE.MeshLambertMaterial({ color: BATTERY, flatShading: true });
    this._barMaterial = new THREE.MeshBasicMaterial({ color: 0x6aff9a });
    this.batteries = [0, 1, 2, 3].map((i) => {
      const z = k.minZ + 0.25 + i * 0.28;
      const cell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.2), this._batteryMaterial);
      cell.position.set(k.minX - 0.02, 3.15, z);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.12), this._barMaterial);
      bar.position.set(k.minX - 0.14, 3.15, z);
      this.root.add(cell, bar);
      return { cell, bar };
    });
  }

  _mesh(builder, material) {
    const mesh = new THREE.Mesh(builder.toGeometry(), material);
    return mesh;
  }

  _addMesh(builder, material, name) {
    const mesh = this._mesh(builder, material);
    mesh.name = name;
    this.root.add(mesh);
    return mesh;
  }

  /** Muestra el mapa del planeta en la pantalla del laboratorio. */
  setMapTexture(texture) {
    this._mapScreenMaterial.map = texture;
    this._mapScreenMaterial.color.set(0xffffff);
    this._mapScreenMaterial.needsUpdate = true;
  }

  // ---- Actualización ----------------------------------------------------------

  /**
   * @param {object} ship   estado (ShipLayout / ShipFlight)
   * @param {object} extra  { airborne, thrust (0..1), batteries: [{ ratio }|null] }
   */
  update(ship, dt, { airborne = false, thrust = 0, batteries = null } = {}) {
    this._t += dt;
    const bob = airborne ? Math.sin(this._t * 1.7) * 0.06 : 0;
    this.root.position.set(ship.x, ship.y + bob, ship.z);
    this.root.rotation.set(ship.pitch ?? 0, ship.yaw, ship.roll ?? 0);

    this.hatchPivot.rotation.x = rampEnd(ship).angle;
    this.door.position.x = (ship.door ?? 0) * (DIM.DOOR_HALF * 2);

    const bottoms = legBottoms(ship);
    this.legs.forEach((leg, i) => {
      const len = Math.max(0.2, DIM.BOTTOM - bottoms[i]);
      leg.strut.scale.set(0.28, len, 0.28);
      leg.strut.position.y = -len / 2;
      leg.foot.position.y = -len + 0.09;
      leg.foot.visible = (ship.legs ?? 1) > 0.15;
    });

    this._buttonMaterial.color.set((ship.hatch ?? 0) > 0.01 ? 0x4dff7a : 0xff4a3a);
    this._engineMaterial.opacity = airborne ? 0.55 + 0.4 * thrust + Math.sin(this._t * 30) * 0.05 : 0.2;

    if (batteries) {
      batteries.forEach((b, i) => {
        const v = this.batteries[i];
        if (!v) return;
        v.cell.visible = !!b;
        v.bar.visible = !!b && b.ratio > 0.01;
        if (b) {
          v.bar.scale.y = Math.max(0.02, b.ratio) * 0.4;
          v.bar.position.y = 2.95 + v.bar.scale.y / 2;
        }
      });
    }
    this.root.updateMatrixWorld(true);
  }
}

/** Copia de una geometría con color por vértice uniforme. */
function toColored(geometry, color) {
  const b = new PartsBuilder();
  b.add(geometry, { color });
  return b.toGeometry();
}
