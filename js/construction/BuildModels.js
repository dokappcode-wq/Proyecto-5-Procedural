import * as THREE from 'three';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Modelos low-poly de las piezas de construcción, en las mismas coordenadas
 * locales que BuildRules (base en y = 0, largo en X, frente hacia +Z).
 *
 * Detalle sin salirse de la caja de colisión de cada pieza (así no hay paredes
 * que se atraviesan ni choques invisibles): tablas con juntas sobre un alma
 * oscura (las juntas no dejan ver a través), postes y vigas, clavos, piedra en
 * hiladas, tejas solapadas, herrajes de hierro…
 */
const WOOD = [0x9a6a3f, 0x8f6239, 0xa5744a, 0x87603a];
const WOOD_DARK = 0x6b4a2f;
const WOOD_CORE = 0x3e2a1a;
const STONE = [0x8d8a86, 0x86837e, 0x96928c, 0x7e7b76];
const STONE_DARK = 0x5f5c58;
const IRON = 0x4a4f55;
const ROOF = [0x7a3f2c, 0x8c4a33, 0x834530, 0x6f3a29];
const WOOL = 0xf1ece0;
const BLANKET = 0x9c3d34;
const ROPE = 0xb89a6a;

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const cone = new THREE.ConeGeometry(0.5, 1, 4);
const torus = new THREE.TorusGeometry(0.5, 0.12, 4, 10);
const ico = new THREE.IcosahedronGeometry(0.5, 0);

/** Generador fijo (mismo aspecto siempre). */
function rnd(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
const add = (b, geo, [x, y, z], [sx, sy, sz], color, rotation = [0, 0, 0], jitter) => b.add(geo, { position: [x, y, z], scale: [sx, sy, sz], rotation, color, jitter });

/** Tablas horizontales (a lo largo de X) entre y0 e y1, con juntas, sobre un alma oscura. */
function plankWall(b, r, x0, x1, y0, y1, t = 0.2, n = null) {
  const count = n ?? Math.max(1, Math.round((y1 - y0) / 0.3));
  const h = (y1 - y0) / count;
  add(b, box, [(x0 + x1) / 2, (y0 + y1) / 2, 0], [x1 - x0 - 0.02, y1 - y0, t * 0.55], WOOD_CORE);
  for (let i = 0; i < count; i++) {
    const dz = (r() - 0.5) * 0.008;
    add(b, box, [(x0 + x1) / 2, y0 + h * (i + 0.5), dz], [x1 - x0, h * 0.9, t - 0.01], pick(WOOD, r));
  }
}

/** Cabezas de clavo en las dos caras (a lo largo de un poste en x). */
function nails(b, x, y0, y1, step, zf) {
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    for (const z of [-zf, zf]) add(b, box, [x, y, z], [0.03, 0.03, 0.012], IRON);
  }
}

/** Poste de madera (con un collarín más claro arriba y abajo). */
function post(b, x, z, w, h, d, color = WOOD_DARK, y0 = 0) {
  add(b, box, [x, y0 + h / 2, z], [w, h, d], color);
}

const H = 2.4;

export const BUILD_MODELS = {
  FOUNDATION() {
    const b = new PartsBuilder();
    const r = rnd(11);
    // Alma de piedra y, por fuera, hiladas de sillares de tamaños distintos.
    add(b, box, [0, -0.65, 0], [1.96, 1.7, 1.96], STONE_DARK);
    const courses = [[-1.5, -1.12], [-1.12, -0.76], [-0.76, -0.4], [-0.4, 0.0]];
    courses.forEach(([y0, y1], ci) => {
      for (const side of [0, 1, 2, 3]) {
        let s = -1 + (ci % 2) * 0.25;
        while (s < 1) {
          const len = Math.min(1 - s, 0.38 + r() * 0.35);
          const mid = s + len / 2;
          const inset = 0.995 + r() * 0.01;
          const pos = side === 0 ? [mid, 0, inset] : side === 1 ? [mid, 0, -inset] : side === 2 ? [inset, 0, mid] : [-inset, 0, mid];
          const sc = side < 2 ? [len - 0.02, y1 - y0 - 0.025, 0.04] : [0.04, y1 - y0 - 0.025, len - 0.02];
          add(b, box, [pos[0], (y0 + y1) / 2, pos[2]], sc, pick(STONE, r));
          s += len;
        }
      }
    });
    // Losa de arriba con el canto biselado y juntas de losas.
    add(b, box, [0, 0.1, 0], [2, 0.2, 2], STONE[2], [0, 0, 0], (i, v) => {
      if (v.y > 0) {
        v.x *= 0.985;
        v.z *= 0.985;
      }
    });
    for (const p of [-0.33, 0.33]) {
      add(b, box, [p, 0.2005, 0], [0.025, 0.002, 1.96], STONE_DARK);
      add(b, box, [0, 0.2005, p], [1.96, 0.002, 0.025], STONE_DARK);
    }
    return b.build();
  },
  FLOOR() {
    const b = new PartsBuilder();
    const r = rnd(12);
    // Vigas debajo y tablas encima (con clavos en cada viga).
    for (const x of [-0.85, 0, 0.85]) add(b, box, [x, 0.065, 0], [0.14, 0.13, 1.98], WOOD_DARK);
    add(b, box, [0, 0.1, 0], [1.98, 0.06, 1.98], WOOD_CORE);
    for (let i = 0; i < 6; i++) {
      const z = -1 + (i + 0.5) * (2 / 6);
      add(b, box, [0, 0.165, z], [2, 0.07, 2 / 6 - 0.018], pick(WOOD, r));
      for (const x of [-0.85, 0, 0.85]) add(b, box, [x, 0.2005, z], [0.025, 0.002, 0.025], IRON);
    }
    return b.build();
  },
  WALL() {
    const b = new PartsBuilder();
    const r = rnd(13);
    plankWall(b, r, -0.92, 0.92, 0.1, H - 0.12);
    // Durmiente abajo, viga arriba y postes en los extremos (con clavos).
    add(b, box, [0, 0.05, 0], [2, 0.1, 0.22], WOOD_DARK);
    add(b, box, [0, H - 0.06, 0], [2, 0.12, 0.22], WOOD_DARK);
    post(b, -0.94, 0, 0.12, H, 0.22);
    post(b, 0.94, 0, 0.12, H, 0.22);
    nails(b, -0.94, 0.25, H - 0.25, 0.3, 0.111);
    nails(b, 0.94, 0.25, H - 0.25, 0.3, 0.111);
    // Riostra en diagonal (cara de dentro, −Z) que asoma muy poco.
    const ang = Math.atan2(H - 0.4, 1.7);
    add(b, box, [0, H / 2, -0.095], [Math.hypot(1.7, H - 0.4), 0.1, 0.03], WOOD_DARK, [0, 0, ang]);
    return b.build();
  },
  DOOR() {
    const b = new PartsBuilder();
    const r = rnd(14);
    plankWall(b, r, -0.92, -0.56, 0.1, H - 0.12, 0.2, 8);
    plankWall(b, r, 0.56, 0.92, 0.1, H - 0.12, 0.2, 8);
    plankWall(b, r, -0.56, 0.56, 2.12, H - 0.12, 0.2, 1);
    // Marco: jambas, dintel y umbral.
    add(b, box, [0, 0.05, 0], [2, 0.1, 0.22], WOOD_DARK);
    add(b, box, [0, H - 0.06, 0], [2, 0.12, 0.22], WOOD_DARK);
    post(b, -0.94, 0, 0.12, H, 0.22);
    post(b, 0.94, 0, 0.12, H, 0.22);
    post(b, -0.53, 0, 0.08, 2.1, 0.22, 0x5a3d26);
    post(b, 0.53, 0, 0.08, 2.1, 0.22, 0x5a3d26);
    add(b, box, [0, 2.06, 0], [1.14, 0.1, 0.22], 0x5a3d26);
    nails(b, -0.94, 0.25, H - 0.25, 0.3, 0.111);
    nails(b, 0.94, 0.25, H - 0.25, 0.3, 0.111);
    return b.build();
  },
  /** Hoja de la puerta, con la bisagra en x = 0 (se coloca en x = -0,5 de la pieza). */
  DOOR_LEAF() {
    const b = new PartsBuilder();
    const r = rnd(15);
    // Tablas verticales, travesaños en Z y bisagras y tirador de hierro.
    for (let i = 0; i < 4; i++) add(b, box, [0.125 + i * 0.25, 1.0, 0], [0.24, 1.98, 0.06], pick(WOOD, r));
    for (const y of [0.35, 1.65]) add(b, box, [0.5, y, 0.035], [0.94, 0.14, 0.03], WOOD_DARK);
    add(b, box, [0.5, 1.0, 0.035], [Math.hypot(0.8, 1.3), 0.12, 0.028], WOOD_DARK, [0, 0, -Math.atan2(1.3, 0.8)]);
    for (const y of [0.35, 1.65]) {
      add(b, box, [0.22, y, -0.035], [0.44, 0.06, 0.012], IRON);
      add(b, cyl, [0.0, y, 0], [0.05, 0.16, 0.05], IRON);
    }
    add(b, torus, [0.86, 1.0, 0.05], [0.09, 0.09, 0.09], IRON);
    add(b, torus, [0.86, 1.0, -0.05], [0.09, 0.09, 0.09], IRON);
    return b.build();
  },
  WINDOW() {
    const b = new PartsBuilder();
    const r = rnd(16);
    plankWall(b, r, -0.92, 0.92, 0.1, 0.95, 0.2, 3);
    plankWall(b, r, -0.92, 0.92, 1.85, H - 0.12, 0.2, 2);
    plankWall(b, r, -0.92, -0.52, 0.95, 1.85, 0.2, 3);
    plankWall(b, r, 0.52, 0.92, 0.95, 1.85, 0.2, 3);
    add(b, box, [0, 0.05, 0], [2, 0.1, 0.22], WOOD_DARK);
    add(b, box, [0, H - 0.06, 0], [2, 0.12, 0.22], WOOD_DARK);
    post(b, -0.94, 0, 0.12, H, 0.22);
    post(b, 0.94, 0, 0.12, H, 0.22);
    // Marco, cristales (cuatro paños) con parteluz y alféizar.
    for (const x of [-0.5, 0.5]) add(b, box, [x, 1.4, 0], [0.06, 0.92, 0.2], 0x5a3d26);
    add(b, box, [0, 1.86, 0], [1.06, 0.06, 0.2], 0x5a3d26);
    add(b, box, [0, 1.4, 0], [0.94, 0.86, 0.02], 0x9fc4d4);
    add(b, box, [0, 1.4, 0], [0.04, 0.86, 0.05], WOOD_DARK);
    add(b, box, [0, 1.4, 0], [0.94, 0.04, 0.05], WOOD_DARK);
    add(b, box, [0, 0.93, 0.03], [1.12, 0.06, 0.2], WOOD_DARK);
    // Contraventanas abiertas a los lados (fuera, +Z).
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) add(b, box, [s * (0.66 + i * 0.13), 1.4, 0.11], [0.12, 0.84, 0.02], pick(WOOD, r));
      add(b, box, [s * 0.72, 1.4, 0.123], [0.26, 0.06, 0.008], WOOD_DARK);
    }
    return b.build();
  },
  FENCE() {
    const b = new PartsBuilder();
    const r = rnd(17);
    // Postes con punta, dos travesaños algo irregulares y ataduras de cuerda.
    for (const x of [-0.94, 0, 0.94]) {
      post(b, x, 0, 0.11, 1.0, 0.11);
      add(b, cone, [x, 1.05, 0], [0.12, 0.12, 0.12], WOOD_DARK, [0, Math.PI / 4, 0]);
    }
    for (const [y, z] of [[0.85, 0.035], [0.42, -0.035]]) {
      add(b, box, [0, y, z], [1.98, 0.09, 0.045], pick(WOOD, r), [0, 0, (r() - 0.5) * 0.03]);
      for (const x of [-0.94, 0, 0.94]) add(b, box, [x, y, 0], [0.13, 0.04, 0.12], ROPE);
    }
    return b.build();
  },
  PILLAR() {
    const b = new PartsBuilder();
    // Fuste octogonal con basa, capitel y abrazaderas de hierro.
    add(b, box, [0, 0.08, 0], [0.3, 0.16, 0.3], WOOD);
    add(b, cyl, [0, H / 2, 0], [0.24, H - 0.3, 0.24], WOOD_DARK);
    add(b, box, [0, H - 0.08, 0], [0.3, 0.16, 0.3], WOOD);
    for (const y of [0.45, H - 0.45]) add(b, cyl, [0, y, 0], [0.26, 0.05, 0.26], IRON);
    return b.build();
  },
  STAIRS() {
    const b = new PartsBuilder();
    const r = rnd(18);
    const steps = 8;
    const rise = H + 0.2;
    const run = 2 / steps;
    // Peldaños (huella y tabica) entre dos zancas.
    for (let i = 0; i < steps; i++) {
      const h = (rise * (i + 1)) / steps;
      const z = 1 - run * (i + 0.5);
      add(b, box, [0, h - 0.04, z], [1.7, 0.08, run + 0.02], pick(WOOD, r));
      add(b, box, [0, h - rise / steps / 2 - 0.04, z + run / 2 - 0.02], [1.66, rise / steps - 0.06, 0.04], WOOD_CORE);
    }
    const ang = Math.atan2(rise, 2);
    const len = Math.hypot(rise, 2);
    for (const x of [-0.9, 0.9]) {
      add(b, box, [x, rise / 2 - 0.12, 0], [0.12, 0.34, len], WOOD_DARK, [ang, 0, 0]);
    }
    // Pasamanos en un lado con balaustres.
    add(b, box, [0.9, rise / 2 + 0.85, 0], [0.07, 0.07, len], WOOD, [ang, 0, 0]);
    for (let i = 0; i <= 4; i++) {
      const z = 1 - (i / 4) * 1.9 - 0.05;
      const y = ((1 - z) / 2) * rise;
      add(b, box, [0.9, y + 0.45, z], [0.05, 0.9, 0.05], WOOD_DARK);
    }
    return b.build();
  },
  ROOF() {
    const b = new PartsBuilder();
    const r = rnd(19);
    const slope = Math.atan2(1.2, 2);
    const len = Math.hypot(2, 1.2) + 0.05;
    // Tablero y, encima, hileras de tejas solapadas y desplazadas.
    add(b, box, [0, 0.72, 0], [2, 0.08, len], WOOD_CORE, [slope, 0, 0]);
    const rows = 7;
    const nx = Math.sin(slope);
    const ny = Math.cos(slope);
    for (let i = 0; i < rows; i++) {
      const s = (i + 0.5) / rows;
      const z = 1 - 2 * s;
      const y = 0.15 + 1.2 * s + 0.07;
      const off = i % 2 ? 0.165 : 0;
      for (let x = -1 + off; x < 1 - 0.05; x += 0.33) {
        const w = Math.min(0.32, 1 - x);
        add(b, box, [x + w / 2, y + ny * 0.02, z + nx * 0.02], [w - 0.012, 0.045, len / rows + 0.06], pick(ROOF, r), [slope + 0.06, 0, (r() - 0.5) * 0.04]);
      }
    }
    // Cumbrera arriba (en −Z) y alero abajo.
    add(b, box, [0, 1.36, -1], [2.02, 0.1, 0.14], WOOD_DARK);
    add(b, box, [0, 0.14, 1], [2.02, 0.08, 0.1], WOOD_DARK);
    return b.build();
  },
  BED() {
    const b = new PartsBuilder();
    // Armazón con patas y cabecero, colchón, almohada y manta doblada.
    for (const [x, z] of [[-0.44, -0.94], [0.44, -0.94], [-0.44, 0.94], [0.44, 0.94]]) post(b, x, z, 0.1, 0.32, 0.1);
    add(b, box, [0, 0.22, 0], [0.98, 0.1, 1.96], WOOD[0]);
    for (const x of [-0.46, 0.46]) add(b, box, [x, 0.3, 0], [0.06, 0.14, 1.96], WOOD_DARK);
    add(b, box, [0, 0.5, -0.96], [0.98, 0.5, 0.06], WOOD_DARK);
    add(b, box, [0, 0.76, -0.96], [1.0, 0.06, 0.09], WOOD[2]);
    add(b, box, [0, 0.36, 0.02], [0.9, 0.16, 1.86], WOOL);
    add(b, box, [0, 0.48, -0.66], [0.66, 0.1, 0.3], 0xffffff, [0, 0, 0], (i, v) => {
      if (Math.abs(v.x) > 0.49) v.y *= 0.6; // almohada abombada
    });
    add(b, box, [0, 0.455, 0.35], [0.94, 0.05, 1.12], BLANKET);
    add(b, box, [0, 0.48, -0.2], [0.94, 0.04, 0.16], 0xb44a40); // embozo
    return b.build();
  },
  REFINERY() {
    const b = new PartsBuilder();
    const wood = 0x8a5a32;
    const dark = 0x5e3b20;
    for (const [x, z] of [[-0.78, -0.4], [0.78, -0.4], [-0.78, 0.4], [0.78, 0.4]]) post(b, x, z, 0.12, 0.84, 0.12, dark);
    add(b, box, [0, 0.88, 0], [1.8, 0.1, 1.0], wood);
    add(b, box, [0, 0.3, 0], [1.6, 0.06, 0.85], dark);
    // Bastidor con un cuero tensado, piedra de afilar con manivela, cuchillos y tiras.
    for (const x of [0.05, 0.75]) post(b, x, -0.35, 0.05, 0.6, 0.05, dark, 0.93);
    add(b, box, [0.4, 1.5, -0.35], [0.75, 0.05, 0.05], dark);
    add(b, box, [0.4, 1.2, -0.34], [0.62, 0.5, 0.02], 0xb07a45);
    for (const x of [0.12, 0.68]) for (const y of [0.98, 1.43]) add(b, box, [x, y, -0.33], [0.03, 0.03, 0.03], ROPE);
    add(b, cyl, [-0.5, 1.08, 0.1], [0.36, 0.08, 0.36], 0x9a968f, [Math.PI / 2, 0, 0]);
    add(b, box, [-0.5, 0.97, 0.1], [0.1, 0.12, 0.2], dark);
    add(b, box, [-0.5, 1.08, 0.2], [0.03, 0.03, 0.12], IRON);
    add(b, box, [0.55, 0.945, 0.25], [0.3, 0.02, 0.05], 0x6a6f76);
    add(b, box, [0.33, 0.945, 0.25], [0.12, 0.03, 0.05], dark);
    add(b, box, [0, 0.38, 0.2], [0.5, 0.12, 0.3], 0xc9b089);
    return b.build();
  },
  FURNACE() {
    const b = new PartsBuilder();
    const r = rnd(20);
    // Cuerpo de sillares, boca con arco y brasas, cornisa y chimenea de ladrillo.
    add(b, box, [0, 0.55, 0], [1.3, 1.1, 1.3], STONE_DARK);
    for (let c = 0; c < 4; c++) {
      const y0 = c * 0.275;
      for (const side of [0, 1, 2, 3]) {
        let s = -0.68 + (c % 2) * 0.17;
        while (s < 0.68) {
          const len = Math.min(0.68 - s, 0.28 + r() * 0.16);
          const mid = s + len / 2;
          const pos = side === 0 ? [mid, 0.66] : side === 1 ? [mid, -0.66] : side === 2 ? [0.66, mid] : [-0.66, mid];
          const sc = side < 2 ? [len - 0.02, 0.255, 0.06] : [0.06, 0.255, len - 0.02];
          // Hueco de la boca (delante, +Z).
          const inMouth = side === 0 && Math.abs(mid) < 0.32 && c < 3;
          if (!inMouth) add(b, box, [pos[0], y0 + 0.14, pos[1]], sc, pick(STONE, r));
          s += len;
        }
      }
    }
    add(b, box, [0, 0.42, 0.62], [0.56, 0.72, 0.06], 0x1c1410);
    add(b, cyl, [0, 0.78, 0.62], [0.56, 0.06, 0.3], 0x1c1410, [Math.PI / 2, 0, 0]);
    add(b, box, [0, 0.13, 0.6], [0.5, 0.1, 0.08], 0xff7a2a);
    add(b, ico, [-0.12, 0.2, 0.58], [0.16, 0.08, 0.12], 0xffb347);
    add(b, ico, [0.12, 0.19, 0.57], [0.14, 0.07, 0.1], 0xff9a3a);
    add(b, box, [0, 0.82, 0.69], [0.7, 0.08, 0.04], STONE_DARK);
    add(b, box, [0, 1.16, 0], [1.4, 0.12, 1.4], STONE[2]);
    add(b, box, [0, 1.3, 0], [1.06, 0.16, 1.06], STONE_DARK);
    for (let c = 0; c < 3; c++) add(b, box, [0, 1.46 + c * 0.08, -0.1], [0.42, 0.075, 0.42], c % 2 ? 0x9a5a3e : 0x8a4e36);
    add(b, box, [0, 1.68, -0.1], [0.48, 0.04, 0.48], STONE_DARK);
    return b.build();
  },
  WORKBENCH() {
    const b = new PartsBuilder();
    const wood = 0x8a5a32;
    const dark = 0x5e3b20;
    const metal = 0x8f959c;
    for (const [x, z] of [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]]) post(b, x, z, 0.12, 0.84, 0.12, metal);
    for (const z of [-0.45, 0.45]) add(b, box, [0, 0.2, z], [1.6, 0.06, 0.06], metal);
    // Tablero de tablones, balda con cajas.
    for (let i = 0; i < 4; i++) add(b, box, [0, 0.88, -0.41 + i * 0.275], [1.9, 0.12, 0.26], i % 2 ? wood : 0x93623a);
    add(b, box, [0, 0.3, 0], [1.7, 0.06, 0.95], dark);
    add(b, box, [0.4, 0.4, 0.15], [0.5, 0.14, 0.32], 0xb87333);
    add(b, box, [-0.3, 0.42, -0.1], [0.4, 0.18, 0.3], wood);
    // Yunque (cuerpo, cintura y bigornia), tornillo de banco, martillo y sierra.
    add(b, box, [-0.5, 0.98, 0], [0.32, 0.08, 0.24], 0x3e4348);
    add(b, box, [-0.5, 1.05, 0], [0.18, 0.08, 0.14], 0x3e4348);
    add(b, box, [-0.5, 1.13, 0], [0.5, 0.08, 0.2], 0x4a4f55);
    add(b, cone, [-0.82, 1.13, 0], [0.14, 0.18, 0.14], 0x4a4f55, [0, 0, Math.PI / 2]);
    add(b, box, [0.62, 1.0, -0.3], [0.18, 0.14, 0.12], metal);
    add(b, box, [0.62, 1.0, -0.2], [0.2, 0.12, 0.04], metal);
    add(b, cyl, [0.62, 1.0, -0.12], [0.02, 0.22, 0.02], IRON, [0, 0, Math.PI / 2]);
    add(b, box, [0.2, 0.96, 0.2], [0.3, 0.035, 0.04], wood);
    add(b, box, [0.05, 0.96, 0.2], [0.07, 0.06, 0.06], 0x6a6f76);
    add(b, box, [0.45, 0.947, 0.32], [0.55, 0.01, 0.1], 0xb9bec4);
    add(b, box, [0.75, 0.96, 0.32], [0.1, 0.04, 0.08], dark);
    return b.build();
  },
  CHEST() {
    const b = new PartsBuilder();
    const r = rnd(21);
    // Tablas, tapa en arco, cantoneras y flejes de hierro y cerradura.
    for (let i = 0; i < 3; i++) add(b, box, [0, 0.09 + i * 0.165, 0], [1.0, 0.155, 0.7], pick(WOOD, r));
    add(b, box, [0, 0.27, 0], [0.96, 0.5, 0.66], WOOD_CORE);
    add(b, cyl, [0, 0.5, 0], [0.3, 1.0, 0.7], WOOD[1], [0, 0, Math.PI / 2], (i, v) => {
      if (v.x < 0) v.x = 0; // medio cilindro: solo la mitad de arriba
    });
    for (const x of [-0.42, 0.42]) {
      add(b, box, [x, 0.3, 0], [0.06, 0.6, 0.72], IRON);
      add(b, cyl, [x, 0.5, 0], [0.32, 0.065, 0.72], IRON, [0, 0, Math.PI / 2], (i, v) => {
        if (v.x < 0) v.x = 0;
      });
    }
    for (const x of [-0.49, 0.49]) for (const z of [-0.34, 0.34]) add(b, box, [x, 0.08, z], [0.04, 0.16, 0.04], IRON);
    add(b, box, [0, 0.52, 0.36], [0.14, 0.18, 0.04], 0xd9b75a);
    add(b, box, [0, 0.49, 0.38], [0.03, 0.06, 0.01], 0x2a2420);
    return b.build();
  },
  TORCH() {
    const b = new PartsBuilder();
    // Estaca con la punta clavada, trapo atado con cuerda y llama en capas.
    add(b, cone, [0, 0.04, 0], [0.07, 0.1, 0.07], 0x5e3b1f, [Math.PI, 0, 0]);
    add(b, cyl, [0, 0.47, 0], [0.065, 0.86, 0.065], 0x5e3b1f);
    add(b, cyl, [0, 0.93, 0], [0.12, 0.14, 0.12], 0x5a4a38);
    add(b, cyl, [0, 0.89, 0], [0.13, 0.025, 0.13], ROPE);
    add(b, cyl, [0, 1.0, 0], [0.125, 0.02, 0.125], 0x1f1a16);
    add(b, cone, [0, 1.1, 0], [0.16, 0.2, 0.16], 0xff8a2a, [0, 0.4, 0]);
    add(b, cone, [0, 1.08, 0], [0.1, 0.14, 0.1], 0xffd36a);
    return b.build();
  },
  CHARGING_STATION() {
    const b = new PartsBuilder();
    add(b, box, [0, 0.08, 0], [1.0, 0.16, 0.8], STONE_DARK);
    add(b, box, [0, 0.65, 0.1], [0.9, 1.0, 0.6], 0x5d6670, [0, 0, 0], (i, v) => {
      if (v.y > 0 && v.z < 0) v.z *= 0.6; // frente inclinado arriba
    });
    add(b, box, [0, 1.2, 0.1], [0.96, 0.1, 0.66], 0x3b434c);
    // Hueco de la batería, pantalla y cables.
    add(b, box, [0, 0.72, -0.19], [0.36, 0.5, 0.04], 0x20262c);
    add(b, box, [0, 0.72, -0.21], [0.26, 0.4, 0.02], 0x5fe08a);
    add(b, box, [0.3, 0.98, -0.18], [0.16, 0.1, 0.03], 0x7fd8ff);
    add(b, box, [-0.3, 0.98, -0.18], [0.05, 0.05, 0.03], 0xffd35a);
    for (const x of [-0.38, 0.38]) add(b, cyl, [x, 0.4, 0.38], [0.06, 0.6, 0.06], 0x20262c);
    for (const x of [-0.45, 0.45]) add(b, box, [x, 0.65, 0.1], [0.04, 0.9, 0.62], 0xe0782f);
    return b.build();
  },
  OXYGEN_STATION() {
    const b = new PartsBuilder();
    add(b, box, [0, 0.08, 0], [1.0, 0.16, 1.0], STONE_DARK);
    for (const [x, z] of [[-0.22, 0.12], [0.22, 0.12]]) {
      add(b, cyl, [x, 0.8, z], [0.36, 1.2, 0.36], 0xdfe8ef);
      add(b, ico, [x, 1.42, z], [0.36, 0.2, 0.36], 0xdfe8ef);
      add(b, cyl, [x, 1.54, z], [0.12, 0.1, 0.12], 0x4aa3df);
      add(b, cyl, [x, 0.9, z], [0.37, 0.06, 0.37], 0x4aa3df);
    }
    add(b, box, [0, 0.9, -0.3], [0.7, 0.5, 0.12], 0x3b434c);
    add(b, box, [0, 0.95, -0.37], [0.4, 0.2, 0.02], 0x7fd8ff);
    add(b, cyl, [0, 1.3, -0.1], [0.04, 0.5, 0.04], 0x20262c, [0, 0, Math.PI / 2]);
    return b.build();
  },
};

export function toGeometry({ positions, colors }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
