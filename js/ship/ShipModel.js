import * as THREE from 'three';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * ShipModel — modelo low-poly de una nave a partir de su plano (ShipLayout).
 *
 * Partes fijas fusionadas en pocas mallas (casco opaco, cristales, luces) y
 * partes móviles separadas: rampa de la compuerta, puertas correderas, patas,
 * luces de los motores, barras de carga y reloj. Cada mueble y cada tecnología
 * instalada tiene su pequeño "constructor" por tipo. Solo presentación.
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
const POD = 0xe8ecef;
const CH = 0.55;     // bisel de las aristas de arriba del casco
const CH_Y = 4.85;   // altura donde empieza el bisel

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const sph = new THREE.SphereGeometry(0.5, 12, 8);

function slab(b, x0, x1, y0, y1, z0, z1, color, jitter) {
  b.add(box, { position: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], scale: [x1 - x0, y1 - y0, z1 - z0], color, jitter });
}
const slabBox = (b, k, color) => slab(b, k.minX, k.maxX, k.minY, k.maxY, k.minZ, k.maxZ, color);

export class ShipModel {
  /**
   * @param {object} p.layout     ShipLayout (createShipLayout)
   * @param {object} p.installed  { ranura: tecnología | null }
   */
  constructor({ scene, layout, installed = {} }) {
    this.root = new THREE.Group();
    this.root.name = 'Ship';
    this.root.rotation.order = 'YXZ';
    scene.add(this.root);
    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this._glassMaterial = new THREE.MeshPhongMaterial({
      color: 0x86c9ee, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide,
    });
    this._buttonMaterial = new THREE.MeshBasicMaterial({ color: 0xff4a3a });
    this._engineMaterial = new THREE.MeshBasicMaterial({ color: GLOW_ENGINE, transparent: true, opacity: 0.25 });
    this._batteryMaterial = new THREE.MeshLambertMaterial({ color: BATTERY, flatShading: true });
    this._barMaterial = new THREE.MeshBasicMaterial({ color: 0x6aff9a });
    this._mapScreenMaterial = new THREE.MeshBasicMaterial({ color: 0x1b3a2e });
    this._airlockMaterial = new THREE.MeshBasicMaterial({ color: 0x4dff7a });
    this._t = 0;
    this.build(layout, installed);
  }

  /** (Re)construye el modelo para un plano (al ampliar la nave). */
  build(layout, installed) {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      c.traverse?.((o) => o.geometry?.dispose?.());
    }
    this.L = layout;
    this.installed = installed;
    this.batteries = [];
    this.nodeCore = null;
    this.aiEye = null;
    this.lightspeedCore = null;
    this.lightspeedRing = null;
    this._buildHull();
    this._buildMoving();
    this.lights = layout.blueprint.lights.map(([x, y, z]) => {
      const light = new THREE.PointLight(0xfff1d6, 20, 11, 1.4);
      light.position.set(x, y, z);
      this.root.add(light);
      return light;
    });
    this.root.traverse((o) => {
      if (o.isMesh && o.material === this._material) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    if (this._mapTexture) this.setMapTexture(this._mapTexture);
  }

  // ---- Casco, salas y muebles ------------------------------------------------------

  _buildHull() {
    const L = this.L;
    const bp = L.blueprint;
    const D = L.DIM;
    const H = L.HATCH;
    const b = new PartsBuilder();
    const g = new PartsBuilder();
    const glass = new PartsBuilder();
    const W = D.HALF_WIDTH;
    const I = D.INNER;

    // Suelo con el hueco de la compuerta y franjas de aviso.
    [[-W, W, D.FRONT, H.HINGE_Z], [-W, H.MIN_X, H.HINGE_Z, D.REAR], [H.MAX_X, W, H.HINGE_Z, D.REAR], [H.MIN_X, H.MAX_X, H.HINGE_Z + H.LENGTH, D.REAR]]
      .forEach(([x0, x1, z0, z1], i) => slab(b, x0, x1, D.BOTTOM, D.FLOOR, z0, z1, i % 2 ? FLOOR_ALT : FLOOR));
    slab(b, H.MIN_X - 0.12, H.MIN_X, D.FLOOR, D.FLOOR + 0.02, H.HINGE_Z, H.HINGE_Z + H.LENGTH, ACCENT);
    slab(b, H.MAX_X, H.MAX_X + 0.12, D.FLOOR, D.FLOOR + 0.02, H.HINGE_Z, H.HINGE_Z + H.LENGTH, ACCENT);

    // Paredes laterales con ventanas.
    const winLow = 3.35;
    const winHigh = 4.3;
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -W : I;
      const x1 = side < 0 ? -I : W;
      // Bisel también abajo (la panza se recoge hacia dentro).
      b.add(box, {
        position: [(x0 + x1) / 2, D.BOTTOM + 0.25, (D.FRONT + D.REAR) / 2],
        scale: [x1 - x0, 0.5, D.REAR - D.FRONT],
        color: HULL_ALT,
        jitter: (i, v) => {
          if (v.y < 0 && v.x * side > 0) v.x = side * (0.5 - 0.28 / (x1 - x0));
        },
      });
      slab(b, x0, x1, D.BOTTOM + 0.5, winLow, D.FRONT, D.REAR, HULL);
      slab(b, x0, x1, winHigh, CH_Y, D.FRONT, D.REAR, HULL);
      // Arista de arriba biselada (el casco no es una caja).
      b.add(box, {
        position: [(x0 + x1) / 2 + side * 0, (CH_Y + D.ROOF) / 2, (D.FRONT + D.REAR) / 2],
        scale: [x1 - x0, D.ROOF - CH_Y, D.REAR - D.FRONT],
        color: HULL,
        jitter: (i, v) => {
          if (v.y > 0 && v.x * side > 0) v.x = side * (0.5 - CH / (x1 - x0));
        },
      });
      // Líneas de paneles y una segunda franja oscura.
      const xo = side < 0 ? -W - 0.012 : W;
      for (let z = D.FRONT + 1.6; z < D.REAR - 0.5; z += 2.4) slab(b, xo, xo + 0.012, D.BOTTOM + 0.1, winLow - 0.15, z, z + 0.04, HULL_ALT);
      slab(b, xo, xo + 0.012, 2.55, 2.68, D.FRONT, D.REAR, DARK);
      // Ventanas sueltas (ojos de buey cuadrados), no una franja corrida.
      const wins = [];
      for (let z = D.FRONT + 1.2; z < D.REAR - 1.0; z += 2.3) wins.push(z);
      let zc = D.FRONT;
      for (const z of wins) {
        slab(b, x0, x1, winLow, winHigh, zc, z, HULL);
        zc = z + 0.85;
        const xo = side < 0 ? -W - 0.03 : W;
        slab(b, xo, xo + 0.03, winLow - 0.06, winLow, z - 0.06, zc + 0.06, DARK);
        slab(b, xo, xo + 0.03, winHigh, winHigh + 0.06, z - 0.06, zc + 0.06, DARK);
      }
      slab(b, x0, x1, winLow, winHigh, zc, D.REAR, HULL);
      glass.add(box, { position: [(x0 + x1) / 2, (winLow + winHigh) / 2, (D.FRONT + D.REAR) / 2], scale: [0.06, winHigh - winLow, D.REAR - D.FRONT] });
      const xs = side < 0 ? -W - 0.02 : W;
      slab(b, xs, xs + 0.02, 2.75, 2.95, D.FRONT, D.REAR, ACCENT);
    }
    // Trasera, parabrisas, techo con espina y luces (las esquinas de arriba, biseladas).
    const chamfer = (y0, z0, z1, color = HULL) => b.add(box, {
      position: [0, (y0 + D.ROOF) / 2, (z0 + z1) / 2],
      scale: [2 * W, D.ROOF - y0, z1 - z0],
      color,
      jitter: (i, v) => {
        if (v.y > 0) v.x = Math.sign(v.x) * (0.5 - CH / (2 * W));
      },
    });
    slab(b, -W, W, D.BOTTOM, CH_Y, D.REAR - 0.3, D.REAR, HULL);
    chamfer(CH_Y, D.REAR - 0.3, D.REAR);
    slab(b, -W, W, D.BOTTOM, 3.3, D.FRONT, D.FRONT + 0.3, HULL);
    slab(b, -W, W, 4.7, CH_Y, D.FRONT, D.FRONT + 0.3, HULL);
    chamfer(CH_Y, D.FRONT, D.FRONT + 0.3);
    for (const x of [-W, -0.15, W - 0.4]) slab(b, x, x + 0.4, 3.3, 4.7, D.FRONT, D.FRONT + 0.3, HULL_ALT);
    glass.add(box, { position: [0, 4.0, D.FRONT + 0.15], scale: [2 * W, 1.4, 0.06] });
    slab(b, -(W - CH), W - CH, D.CEILING, D.ROOF, D.FRONT, D.REAR, HULL);
    slab(b, -I, I, D.CEILING - 0.04, D.CEILING, D.FRONT + 0.3, D.REAR - 0.3, WALL_IN);
    slab(b, -1.2, 1.2, D.ROOF, D.ROOF + 0.25, D.FRONT + 1, D.REAR - 1.1, HULL_ALT);
    slab(b, -0.3, 0.3, D.ROOF + 0.25, D.ROOF + 0.3, D.FRONT + 2, D.REAR - 2.1, ACCENT);
    for (const [x, y, z] of bp.lights) slab(g, x - 0.8, x + 0.8, D.CEILING - 0.06, D.CEILING - 0.04, z - 0.5, z + 0.5, GLOW_LIGHT);
    // Morro afilado bajo el parabrisas (como el capó de un caza), con una arista en el centro.
    const tip = D.NOSE - 1.1;
    b.add(new THREE.BoxGeometry(1, 1, 1, 2, 1, 1), {
      position: [0, (D.BOTTOM + 3.3) / 2, (tip + D.FRONT) / 2],
      scale: [2 * W, 3.3 - D.BOTTOM, D.FRONT - tip],
      color: HULL,
      jitter: (i, v) => {
        const front = v.z < 0;
        if (front) {
          v.x *= 0.1;
          v.y = v.y > 0 ? 0.0 : -0.32;
        }
        if (v.y > 0 && Math.abs(v.x) < 0.01) v.y += 0.12; // arista
      },
    });
    // Panza del morro (más oscura) y marco del parabrisas.
    b.add(box, {
      position: [0, D.BOTTOM + 0.05, (tip + D.FRONT) / 2 + 0.3],
      scale: [2 * W * 0.9, 0.12, D.FRONT - tip - 0.6],
      color: DARK,
      jitter: (i, v) => {
        if (v.z < 0) v.x *= 0.15;
      },
    });
    for (const sx of [-1, 1]) slab(b, sx < 0 ? -W - 0.02 : W - 0.18, sx < 0 ? -W + 0.18 : W + 0.02, 3.25, 4.75, D.FRONT - 0.03, D.FRONT + 0.05, DARK);
    slab(b, -W, W, 4.7, 4.82, D.FRONT - 0.03, D.FRONT + 0.05, DARK);
    // Alerones cortos en los costados (nave pequeña) con luces de posición.
    this._navLights = [];
    if (!bp.wings) {
      for (const side of [-1, 1]) {
        b.add(box, {
          position: [side * (W + 1.25), 3.05, 1.8],
          scale: [2.5, 0.28, 4.4],
          color: HULL,
          jitter: (i, v) => {
            if (v.x * side > 0) {
              v.z = v.z * 0.4 + 0.3; // flecha: la punta retrasada y estrecha
              v.y *= 0.5;
            }
          },
        });
        slab(b, side < 0 ? -W - 2.3 : W + 2.0, side < 0 ? -W - 2.0 : W + 2.3, 3.16, 3.2, 2.4, 3.6, ACCENT);
        const nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff3a3a : 0x3aff6a }));
        nav.position.set(side * (W + 2.45), 3.08, 3.2);
        this.root.add(nav);
        this._navLights.push(nav);
      }
    }
    // Deriva de cola sobre el techo (en flecha) con su luz blanca.
    b.add(box, {
      position: [0, D.ROOF + 0.8, D.REAR - 1.6],
      scale: [0.2, 1.6, 3.4],
      color: HULL,
      jitter: (i, v) => {
        if (v.y > 0) {
          v.z = v.z * 0.45 + 0.28;
          v.x *= 0.6;
        }
      },
    });
    slab(b, -0.11, 0.11, D.ROOF + 1.05, D.ROOF + 1.25, D.REAR - 1.3, D.REAR - 0.2, ACCENT);
    this._strobe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this._strobe.position.set(0, D.ROOF + 1.65, D.REAR - 0.25);
    this.root.add(this._strobe);
    // Matrícula en los costados.
    const plate = registrationTexture('MZ-0');
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.45), new THREE.MeshBasicMaterial({ map: plate, transparent: true, depthWrite: false }));
      m.position.set(side * (W + 0.02), 4.58, D.REAR - 2.6);
      m.rotation.y = side * Math.PI / 2;
      this.root.add(m);
    }
    // Motores traseros.
    // Motores traseros: carenado, anillo y tobera acampanada.
    const bell = new THREE.CylinderGeometry(0.6, 0.42, 1, 14, 1, true);
    const bellIn = new THREE.CylinderGeometry(0.56, 0.38, 1, 14, 1, true);
    bellIn.scale(-1, 1, 1); // caras hacia dentro
    for (const e of bp.engines) {
      b.add(cyl, { position: [e.x, e.y, D.REAR + 0.5], rotation: [Math.PI / 2, 0, 0], scale: [e.r * 2.2, 1.0, e.r * 2.2], color: METAL });
      b.add(cyl, { position: [e.x, e.y, D.REAR + 0.05], rotation: [Math.PI / 2, 0, 0], scale: [e.r * 2.45, 0.2, e.r * 2.45], color: ACCENT });
      b.add(cyl, { position: [e.x, e.y, D.REAR + 1.02], rotation: [Math.PI / 2, 0, 0], scale: [e.r * 2.3, 0.06, e.r * 2.3], color: DARK });
      b.add(bell, { position: [e.x, e.y, D.REAR + 1.45], rotation: [Math.PI / 2, 0, 0], scale: [e.r * 2, 0.8, e.r * 2], color: 0x4a515c });
      b.add(bellIn, { position: [e.x, e.y, D.REAR + 1.45], rotation: [Math.PI / 2, 0, 0], scale: [e.r * 2, 0.8, e.r * 2], color: 0x23272e });
    }
    // Alas con propulsores en las puntas (nave ampliada).
    if (bp.wings) {
      const wg = bp.wings;
      for (const side of [-1, 1]) {
        b.add(box, {
          position: [side * (W + wg.span) / 2, wg.y, (wg.z0 + wg.z1) / 2],
          scale: [wg.span - W, 0.35, wg.z1 - wg.z0],
          color: HULL,
          jitter: (i, v) => {
            // Flecha: la punta del ala retrasada y más estrecha.
            const outer = v.x * side > 0;
            if (outer) {
              v.z = v.z * 0.45 + 0.25;
              v.y *= 0.6;
            }
          },
        });
        slab(b, side < 0 ? -wg.span + 0.6 : wg.span - 0.8, side < 0 ? -wg.span + 0.8 : wg.span - 0.6, wg.y + 0.18, wg.y + 0.2, wg.z0 + 3, wg.z1 - 0.5, ACCENT);
        if (wg.thrusters) {
          const tx = side * (wg.span - 0.4);
          b.add(cyl, { position: [tx, wg.y, wg.z1 + 0.2], rotation: [Math.PI / 2, 0, 0], scale: [1.1, 2.6, 1.1], color: METAL });
          b.add(cyl, { position: [tx, wg.y, wg.z1 + 1.6], rotation: [Math.PI / 2, 0, 0], scale: [1.25, 0.3, 1.25], color: DARK });
        }
      }
    }
    // Panel de acceso exterior bajo la cola y botón interior.
    const e = L.EXT_BUTTON.collider;
    slabBox(b, e, DARK);
    slab(b, e.minX - 0.05, e.maxX + 0.05, e.minY - 0.05, e.minY, e.minZ - 0.05, e.maxZ + 0.05, ACCENT);
    const ib = L.INNER_BUTTON.collider;
    slab(b, ib.minX, ib.maxX, ib.minY, ib.maxY - 0.1, ib.minZ, ib.maxZ, DARK);

    // Tabiques con marcos de puerta.
    for (const p of bp.partitions) {
      const doors = [...p.doors].sort((a, c) => a.x0 - c.x0);
      let x = -I;
      for (const d of doors) {
        if (d.x0 > x) slab(b, x, d.x0, D.FLOOR, D.CEILING, p.z - 0.15, p.z + 0.15, WALL_IN);
        slab(b, d.x0, d.x1, D.DOOR_TOP, D.CEILING, p.z - 0.15, p.z + 0.15, WALL_IN);
        slab(b, d.x0 - 0.1, d.x0, D.FLOOR, D.DOOR_TOP, p.z - 0.2, p.z + 0.2, d.airlock ? 0xffc23a : ACCENT);
        slab(b, d.x1, d.x1 + 0.1, D.FLOOR, D.DOOR_TOP, p.z - 0.2, p.z + 0.2, d.airlock ? 0xffc23a : ACCENT);
        x = d.x1;
      }
      if (x < I) slab(b, x, I, D.FLOOR, D.CEILING, p.z - 0.15, p.z + 0.15, WALL_IN);
    }

    // Consola de vuelo y asiento del piloto.
    const c = bp.console;
    slab(b, c.minX, c.maxX, c.minY, c.maxY - 0.3, c.minZ, c.maxZ, DARK);
    const cz = (c.minZ + c.maxZ) / 2;
    b.add(box, { position: [0, c.maxY - 0.15, cz], rotation: [-0.5, 0, 0], scale: [c.maxX - c.minX, 0.12, 0.9], color: METAL });
    for (const x of [-1.3, 0, 1.3]) {
      g.add(box, { position: [x, c.maxY - 0.07, cz], rotation: [-0.5, 0, 0], scale: [1.0, 0.04, 0.6], color: x === 0 ? 0x62c7ff : GLOW_SCREEN });
    }
    const s = L.SEAT.collider;
    const sz = L.SEAT.z;
    slab(b, -0.15, 0.15, D.FLOOR, 2.95, sz - 0.15, sz + 0.15, METAL);
    slab(b, s.minX, s.maxX, 2.95, 3.15, s.minZ, s.maxZ, SEAT_COLOR);
    slab(b, s.minX, s.maxX, 3.15, s.maxY, s.maxZ - 0.15, s.maxZ, SEAT_COLOR);
    slab(b, s.minX - 0.1, s.minX, 3.1, 3.35, s.minZ, s.maxZ, DARK);
    slab(b, s.maxX, s.maxX + 0.1, 3.1, 3.35, s.minZ, s.maxZ, DARK);

    for (const f of bp.furniture) this._furniture(b, g, f);
    for (const [id, slot] of Object.entries(L.SLOTS)) {
      if (id !== 'CONTROL_CONSOLE') this._slot(b, g, id, slot, this.installed[id] ?? null);
    }

    this._add(b, this._material, 'ShipHull');
    this._add(g, this._glowMaterial, 'ShipLights');
    this._add(glass, this._glassMaterial, 'ShipGlass');
  }

  /** Muebles por tipo. */
  _furniture(b, g, f) {
    const k = f.box;
    const D = this.L.DIM;
    switch (f.type) {
      case 'SOFA':
        slab(b, k.minX, k.maxX, D.FLOOR, 2.95, k.minZ, k.maxZ, DARK);
        slab(b, k.minX, k.maxX, 2.95, 3.1, k.minZ, k.maxZ, SOFA);
        slab(b, k.minX, k.minX + 0.35, 3.1, k.maxY, k.minZ, k.maxZ, SOFA);
        slab(b, k.minX, k.maxX, 3.1, k.maxY, k.maxZ - 0.3, k.maxZ, SOFA);
        break;
      case 'SOFA_BED': // sofá cama: base, colchón claro, respaldo y almohada
        slab(b, k.minX, k.maxX, D.FLOOR, 2.9, k.minZ, k.maxZ, DARK);
        slab(b, k.minX, k.maxX, 2.9, 3.05, k.minZ, k.maxZ, 0xe9e3d5);
        slab(b, k.minX, k.minX + 0.35, 3.05, k.maxY, k.minZ, k.maxZ, SOFA);
        slab(b, k.minX + 0.4, k.minX + 1.0, 3.05, 3.2, k.minZ + 0.2, k.minZ + 1.0, 0xffffff);
        slab(b, k.minX + 0.35, k.maxX, 3.05, 3.12, k.minZ + 1.3, k.maxZ - 0.1, SOFA);
        break;
      case 'LAB_TABLE':
      case 'LOUNGE_TABLE':
        slab(b, k.minX, k.maxX, k.maxY - 0.15, k.maxY, k.minZ, k.maxZ, METAL);
        for (const [x, z] of [[k.minX + 0.1, k.minZ + 0.1], [k.maxX - 0.1, k.minZ + 0.1], [k.minX + 0.1, k.maxZ - 0.1], [k.maxX - 0.1, k.maxZ - 0.1]]) {
          slab(b, x - 0.05, x + 0.05, D.FLOOR, k.maxY - 0.15, z - 0.05, z + 0.05, DARK);
        }
        if (f.type === 'LAB_TABLE') {
          for (const [dx, dz, col] of [[0.3, 0.3, 0x7cf0b0], [0.8, 0.7, 0xc58cff], [1.15, 0.2, 0x7fd8ff]]) {
            g.add(cyl, { position: [k.minX + dx, k.maxY + 0.15, k.minZ + dz], scale: [0.18, 0.3, 0.18], color: col });
          }
        }
        break;
      case 'ENGINE_BLOCK': // sala de máquinas: bloque con tuberías y luces
        slabBox(b, { ...k, maxY: k.maxY - 0.4 }, METAL);
        for (let z = k.minZ + 0.3; z < k.maxZ - 0.2; z += 0.6) {
          b.add(cyl, { position: [k.minX - 0.1, k.maxY - 0.2, z], rotation: [0, 0, Math.PI / 2], scale: [0.18, k.maxX - k.minX, 0.18], color: DARK });
        }
        g.add(box, { position: [k.minX - 0.02, 3.4, (k.minZ + k.maxZ) / 2], scale: [0.03, 0.2, (k.maxZ - k.minZ) * 0.7], color: 0xff9a4a });
        break;
      case 'POD': { // cápsula de escape: cilindro vertical con escotilla
        const cx = (k.minX + k.maxX) / 2;
        const cz = (k.minZ + k.maxZ) / 2;
        b.add(cyl, { position: [cx, (k.minY + k.maxY) / 2, cz], scale: [k.maxX - k.minX, k.maxY - k.minY, k.maxZ - k.minZ], color: POD });
        b.add(sph, { position: [cx, k.maxY, cz], scale: [k.maxX - k.minX, 0.8, k.maxZ - k.minZ], color: POD });
        const face = cx < 0 ? k.maxX : k.minX;
        slab(b, face - 0.06, face + 0.06, 2.8, 4.2, cz - 0.5, cz + 0.5, ACCENT);
        g.add(box, { position: [face, 4.35, cz], scale: [0.08, 0.12, 0.3], color: 0x4dff7a });
        break;
      }
      case 'AIRLOCK_PANEL': {
        slabBox(b, k, DARK);
        const cz = (k.minZ + k.maxZ) / 2;
        slab(b, k.maxX, k.maxX + 0.02, 3.0, 3.9, cz - 0.45, cz + 0.45, 0xffc23a);
        this.airlockLight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.6), this._airlockMaterial);
        this.airlockLight.position.set(k.maxX + 0.03, 3.45, cz);
        this.root.add(this.airlockLight);
        break;
      }
      default:
        slabBox(b, k, METAL);
    }
  }

  /** Ranuras de tecnología según lo instalado. */
  _slot(b, g, id, slot, tech) {
    const k = slot.collider;
    const I = this.L.DIM.INNER;
    const dir = Math.sign((k.minX + k.maxX) / 2) || -1; // −1 pared izquierda, +1 derecha
    const face = dir < 0 ? k.maxX : k.minX;
    const cz = (k.minZ + k.maxZ) / 2;
    switch (tech) {
      case 'PLANET_MAP':
        slab(b, k.minX, k.maxX, k.minY, 3.05, k.minZ, k.maxZ, DARK);
        slab(b, dir < 0 ? -I : I - 0.15, dir < 0 ? -I + 0.15 : I, 3.05, k.maxY, k.minZ, k.maxZ, METAL);
        this.mapScreen = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(1.1, k.maxZ - k.minZ - 0.1), 0.72), this._mapScreenMaterial);
        this.mapScreen.position.set(dir < 0 ? -I + 0.17 : I - 0.17, 3.45, cz);
        this.mapScreen.rotation.y = dir < 0 ? Math.PI / 2 : -Math.PI / 2;
        this.root.add(this.mapScreen);
        break;
      case 'CHARGING_STATION': {
        slabBox(b, k, DARK);
        slab(b, face - 0.02 * dir, face, 2.7, 3.6, k.minZ + 0.1, k.maxZ - 0.1, METAL);
        g.add(box, { position: [face - 0.03 * dir, k.maxY - 0.1, cz], scale: [0.02, 0.08, 1.0], color: 0x6ad0ff });
        const n = 4;
        for (let i = 0; i < n; i++) {
          const z = k.minZ + 0.25 + i * ((k.maxZ - k.minZ - 0.5) / (n - 1));
          const cell = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.2), this._batteryMaterial);
          cell.position.set(face - 0.1 * dir, 3.15, z);
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.12), this._barMaterial);
          bar.position.set(face - 0.22 * dir, 3.15, z);
          this.root.add(cell, bar);
          this.batteries.push({ cell, bar });
        }
        break;
      }
      case 'SUIT_LOCKER': // taquilla con el traje espacial
        slabBox(b, { ...k, maxY: 4.4 }, METAL);
        slab(b, face - 0.02 * dir, face, 2.7, 4.3, k.minZ + 0.1, k.maxZ - 0.1, 0xe8ecef);
        b.add(sph, { position: [face - 0.25 * dir, 4.0, cz], scale: 0.45, color: 0xf2f2f2 });
        g.add(box, { position: [face - 0.02 * dir, 4.0, cz], scale: [0.03, 0.18, 0.3], color: 0x7fd8ff });
        break;
      case 'OXYGEN_STATION':
        slabBox(b, k, DARK);
        for (const dz of [-0.3, 0.3]) b.add(cyl, { position: [face - 0.25 * dir, 3.4, cz + dz], scale: [0.35, 1.0, 0.35], color: 0x5fa8ff });
        g.add(box, { position: [face - 0.02 * dir, 3.9, cz], scale: [0.03, 0.12, 0.8], color: 0x7fd8ff });
        break;
      case 'SPACE_NODE': // el nodo espacial: núcleo que brilla entre los motores
        slabBox(b, { ...k, maxY: 2.9 }, DARK);
        this.nodeCore = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
        this.nodeCore.position.set((k.minX + k.maxX) / 2, 3.4, cz);
        this.root.add(this.nodeCore);
        break;
      case 'LIGHTSPEED_NODE': { // nodo de velocidad-luz: anillo violeta con un núcleo dorado
        slabBox(b, { ...k, maxY: 2.9 }, DARK);
        const c = new THREE.Vector3((k.minX + k.maxX) / 2, 3.5, cz);
        this.lightspeedCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0xffd36a }));
        this.lightspeedCore.position.copy(c);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xc07bff }));
        ring.position.copy(c);
        this.lightspeedRing = ring;
        this.root.add(this.lightspeedCore, ring);
        break;
      }
      case 'AI_NODE': { // nodo de IA: consola con un "ojo" que late
        slabBox(b, k, DARK);
        slab(b, dir < 0 ? -I : I - 0.1, dir < 0 ? -I + 0.1 : I, k.maxY, 4.5, k.minZ, k.maxZ, METAL);
        this.aiEye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff7ad9 }));
        this.aiEye.position.set(dir < 0 ? -I + 0.2 : I - 0.2, 3.95, cz);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x8a96a6 }));
        ring.position.copy(this.aiEye.position);
        ring.rotation.y = Math.PI / 2;
        this.root.add(this.aiEye, ring);
        break;
      }
      default: { // ranura libre: pedestal y panel con "+"
        slabBox(b, k, METAL);
        slab(b, dir < 0 ? -I : I - 0.08, dir < 0 ? -I + 0.08 : I, k.maxY, 4.4, k.minZ, k.maxZ, DARK);
        const px = dir < 0 ? -I + 0.09 : I - 0.09;
        g.add(box, { position: [px, 3.85, cz], scale: [0.02, 0.5, 0.08], color: 0x8a96a6 });
        g.add(box, { position: [px, 3.85, cz], scale: [0.02, 0.08, 0.5], color: 0x8a96a6 });
      }
    }
  }

  _buildMoving() {
    const L = this.L;
    const D = L.DIM;
    const H = L.HATCH;
    // Rampa de la compuerta.
    this.hatchPivot = new THREE.Group();
    this.hatchPivot.position.set(0, D.FLOOR, H.HINGE_Z);
    const rb = new PartsBuilder();
    const w = H.MAX_X - H.MIN_X;
    for (let i = 0; i < 7; i++) {
      const z0 = (H.LENGTH / 7) * i;
      slab(rb, -w / 2, w / 2, -H.THICKNESS, 0, z0, z0 + H.LENGTH / 7 - 0.02, i % 2 ? FLOOR_ALT : METAL);
    }
    slab(rb, -w / 2, -w / 2 + 0.1, 0, 0.03, 0, H.LENGTH, ACCENT);
    slab(rb, w / 2 - 0.1, w / 2, 0, 0.03, 0, H.LENGTH, ACCENT);
    this.hatchPivot.add(new THREE.Mesh(rb.toGeometry(), this._material));
    this.root.add(this.hatchPivot);

    // Puertas correderas (una por hueco).
    this.doors = {};
    for (const d of L.DOORS) {
      const db = new PartsBuilder();
      slab(db, d.leaf.minX, d.leaf.maxX, d.leaf.minY, d.leaf.maxY, d.leaf.minZ, d.leaf.maxZ, d.airlock ? 0xb9a466 : HULL_ALT);
      slab(db, (d.x0 + d.x1) / 2 - 0.08, (d.x0 + d.x1) / 2 + 0.08, 3.4, 3.8, d.leaf.minZ - 0.02, d.leaf.maxZ + 0.02, ACCENT);
      const mesh = new THREE.Mesh(db.toGeometry(), this._material);
      this.root.add(mesh);
      this.doors[d.id] = { mesh, width: d.x1 - d.x0 };
    }

    // Patas.
    this.legs = L.LEGS.map((l) => {
      const group = new THREE.Group();
      group.position.set(l.x, D.BOTTOM, l.z);
      // Pata telescópica: funda arriba, vástago que sale y pie ancho con cuatro dedos.
      const strut = new THREE.Mesh(toColored(new THREE.CylinderGeometry(0.4, 0.4, 1, 10), 0xb7bec7), this._material);
      const sleeve = new THREE.Mesh(toColored(new THREE.CylinderGeometry(0.26, 0.24, 0.7, 10), METAL), this._material);
      sleeve.position.y = -0.35;
      const hinge = new THREE.Mesh(toColored(box, DARK), this._material);
      hinge.scale.set(0.62, 0.26, 0.62);
      hinge.position.y = -0.1;
      const foot = new THREE.Group();
      const pad = new THREE.Mesh(toColored(new THREE.CylinderGeometry(0.42, 0.58, 0.16, 10), DARK), this._material);
      foot.add(pad);
      for (let k = 0; k < 4; k++) {
        const toe = new THREE.Mesh(toColored(box, METAL), this._material);
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        toe.scale.set(0.16, 0.1, 0.42);
        toe.position.set(Math.sin(a) * 0.55, -0.02, Math.cos(a) * 0.55);
        toe.rotation.y = a;
        foot.add(toe);
      }
      group.add(strut, sleeve, foot, hinge);
      this.root.add(group);
      return { group, strut, foot };
    });

    // Botones (rojo cerrado / verde abierto).
    const e = L.EXT_BUTTON.collider;
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.05), this._buttonMaterial);
    btn.position.set((e.minX + e.maxX) / 2, 1.8, e.maxZ + 0.02);
    const ib = L.INNER_BUTTON.collider;
    const btn2 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), this._buttonMaterial);
    btn2.position.set((ib.minX + ib.maxX) / 2, ib.maxY - 0.07, (ib.minZ + ib.maxZ) / 2);
    this.root.add(btn, btn2);

    // Toberas (motores traseros y de las alas).
    const bp = L.blueprint;
    const nozzles = bp.engines.map((en) => [en.x, en.y, D.REAR + 1.3, en.r * 0.85]);
    if (bp.wings?.thrusters) for (const side of [-1, 1]) nozzles.push([side * (bp.wings.span - 0.4), bp.wings.y, bp.wings.z1 + 1.76, 0.5]);
    for (const [x, y, z, r] of nozzles) {
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 12), this._engineMaterial);
      glow.position.set(x, y, z);
      this.root.add(glow);
    }

    // Reloj de la nave (base + reloj que se oculta cuando lo lleva el jugador).
    const [wx, wy, wz] = L.WATCH_AIM;
    const dock = new THREE.Mesh(toColored(new THREE.BoxGeometry(0.34, 0.06, 0.34), DARK), this._material);
    dock.position.set(wx, wy - 0.07, wz);
    this.watch = new THREE.Group();
    const strap = new THREE.Mesh(toColored(new THREE.BoxGeometry(0.1, 0.03, 0.34), 0x2b2f38), this._material);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12), new THREE.MeshBasicMaterial({ color: 0x7fe0ff }));
    face.position.y = 0.03;
    this.watch.add(strap, face);
    this.watch.position.set(wx, wy - 0.03, wz);
    this.root.add(dock, this.watch);
  }

  _add(builder, material, name) {
    const mesh = new THREE.Mesh(builder.toGeometry(), material);
    mesh.name = name;
    this.root.add(mesh);
    return mesh;
  }

  setMapTexture(texture) {
    this._mapTexture = texture;
    this._mapScreenMaterial.map = texture;
    this._mapScreenMaterial.color.set(0xffffff);
    this._mapScreenMaterial.needsUpdate = true;
  }

  // ---- Actualización ----------------------------------------------------------------

  /**
   * @param {object} ship   estado ({ x, y, z, yaw, pitch, roll, hatch, legs, legFeet, doors })
   * @param {object} extra  { airborne, thrust (0..1), batteries: [{ ratio }|null], airlock: 'PRESSURIZED'|'DEPRESSURIZED'|'CYCLING' }
   */
  update(ship, dt, { airborne = false, thrust = 0, batteries = null, airlock = null } = {}) {
    this._t += dt;
    const bob = airborne && ship.y > -1000 ? Math.sin(this._t * 1.7) * 0.06 : 0;
    this.root.position.set(ship.x, ship.y + bob, ship.z);
    this.root.rotation.set(ship.pitch ?? 0, ship.yaw, ship.roll ?? 0);
    this.hatchPivot.rotation.x = this.L.rampEnd(ship).angle;
    for (const [id, d] of Object.entries(this.doors)) {
      const v = ship.doors?.[id] ?? (id === this.L.DOORS[0]?.id ? ship.door ?? 0 : 0);
      d.mesh.position.x = v * d.width;
    }
    const bottoms = this.L.legBottoms(ship);
    this.legs.forEach((leg, i) => {
      const len = Math.max(0.2, this.L.DIM.BOTTOM - bottoms[i]);
      leg.strut.scale.set(0.28, len, 0.28);
      leg.strut.position.y = -len / 2;
      leg.foot.position.y = -len + 0.09;
      leg.foot.visible = (ship.legs ?? 1) > 0.15;
    });
    this._buttonMaterial.color.set((ship.hatch ?? 0) > 0.01 ? 0x4dff7a : 0xff4a3a);
    // Luces de posición (fijas) y estroboscópica (destello cada segundo y medio).
    if (this._strobe) this._strobe.visible = this._t % 1.5 < 0.12;
    for (const n of this._navLights ?? []) n.visible = this._t % 2 < 1.6;
    this._engineMaterial.opacity = airborne ? 0.55 + 0.4 * thrust + Math.sin(this._t * 30) * 0.05 : 0.2;
    if (this.aiEye) this.aiEye.scale.setScalar(0.85 + Math.sin(this._t * 2.4) * 0.15);
    if (this.nodeCore) {
      this.nodeCore.rotation.y += dt * 1.2;
      this.nodeCore.rotation.x += dt * 0.7;
    }
    if (this.lightspeedCore) {
      this.lightspeedCore.rotation.y += dt * 2.5;
      this.lightspeedRing.rotation.x += dt * 1.6;
      this.lightspeedRing.rotation.y += dt * 0.9;
    }
    if (airlock) this._airlockMaterial.color.set(airlock === 'PRESSURIZED' ? 0x4dff7a : airlock === 'CYCLING' ? 0xffc23a : 0xff4a3a);
    if (batteries) {
      batteries.forEach((bt, i) => {
        const v = this.batteries[i];
        if (!v) return;
        v.cell.visible = !!bt;
        v.bar.visible = !!bt && bt.ratio > 0.01;
        if (bt) {
          v.bar.scale.y = Math.max(0.02, bt.ratio) * 0.4;
          v.bar.position.y = 2.95 + v.bar.scale.y / 2;
        }
      });
    }
    this.root.updateMatrixWorld(true);
  }
}

/** Matrícula pintada (texto oscuro con borde naranja) para los costados. */
function registrationTexture(text) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e0782f';
  x.fillRect(0, 6, 10, 52);
  x.fillStyle = '#2f3540';
  x.font = 'bold 46px sans-serif';
  x.textBaseline = 'middle';
  x.fillText(text, 22, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function toColored(geometry, color) {
  const b = new PartsBuilder();
  b.add(geometry, { color });
  return b.toGeometry();
}
