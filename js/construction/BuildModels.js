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
const BRICK = [0xa54a32, 0x9a4430, 0xb05538, 0x8f3f2c];
const MORTAR = 0xcfc6b4;
const TILE = [0xb8552f, 0xc4603a, 0xa94c2c, 0xb35a33];

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

/**
 * Muro de sillares o ladrillos en hiladas (a lo largo de X entre x0 y x1, de y0 a y1),
 * por las dos caras, sobre un alma del color de la junta.
 */
function masonry(b, r, x0, x1, y0, y1, palette, courseH, [minLen, maxLen], t, joint) {
  add(b, box, [(x0 + x1) / 2, (y0 + y1) / 2, 0], [x1 - x0, y1 - y0, t * 0.8], joint);
  const courses = Math.max(1, Math.round((y1 - y0) / courseH));
  const h = (y1 - y0) / courses;
  for (let c = 0; c < courses; c++) {
    let x = x0 - (c % 2 ? (minLen + maxLen) / 4 : 0);
    while (x < x1) {
      const len = minLen + r() * (maxLen - minLen);
      const a = Math.max(x0, x);
      const e = Math.min(x1, x + len);
      if (e - a > 0.03) {
        for (const zf of [-1, 1]) add(b, box, [(a + e) / 2, y0 + h * (c + 0.5), zf * (t / 2 - 0.02)], [e - a - 0.015, h - 0.015, 0.05], pick(palette, r));
      }
      x += len;
    }
  }
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
  CAMPFIRE() {
    const b = new PartsBuilder();
    const r = rnd(31);
    // Anillo de piedras, ceniza, troncos cruzados y llamas en capas.
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * Math.PI * 2;
      add(b, ico, [Math.cos(a) * 0.62, 0.12, Math.sin(a) * 0.62], [0.26 + r() * 0.08, 0.2 + r() * 0.06, 0.24], pick(STONE, r), [r() * 2, r() * 3, 0]);
    }
    add(b, cyl, [0, 0.03, 0], [0.95, 0.04, 0.95], 0x2b2522);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      add(b, cyl, [Math.cos(a) * 0.2, 0.2, Math.sin(a) * 0.2], [0.12, 0.85, 0.12], k % 2 ? 0x5e3b1f : 0x4a2f19, [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1]);
    }
    add(b, ico, [0, 0.18, 0], [0.3, 0.12, 0.3], 0xff5a1a);
    add(b, cone, [0, 0.5, 0], [0.42, 0.65, 0.42], 0xff7a22, [0, 0.3, 0]);
    add(b, cone, [0.08, 0.45, -0.05], [0.26, 0.5, 0.26], 0xffb240, [0.1, 0.9, 0]);
    add(b, cone, [-0.05, 0.42, 0.06], [0.16, 0.42, 0.16], 0xffe08a);
    return b.build();
  },
  KITCHEN() {
    const b = new PartsBuilder();
    const r = rnd(32);
    // Fogón de piedra con boca encendida, encimera, olla de cobre con tapa y cucharón.
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 4; k++) add(b, box, [-0.7 + k * 0.47, 0.15 + c * 0.3, 0], [0.45, 0.28, 1.25], pick(STONE, r));
    }
    add(b, box, [0, 0.33, 0.63], [0.6, 0.42, 0.04], 0x1c1410);
    add(b, box, [0, 0.2, 0.6], [0.48, 0.1, 0.06], 0xff7a2a);
    add(b, ico, [0, 0.27, 0.58], [0.18, 0.1, 0.06], 0xffc060);
    add(b, box, [0, 0.95, 0], [1.9, 0.1, 1.3], STONE_DARK);
    add(b, cyl, [-0.35, 1.18, 0], [0.62, 0.42, 0.62], 0xb87333, [0, 0, 0], (i, v) => { v.x *= 1 + (0.5 - Math.abs(v.y)) * 0.15; v.z *= 1 + (0.5 - Math.abs(v.y)) * 0.15; });
    add(b, cyl, [-0.35, 1.41, 0], [0.64, 0.05, 0.64], 0x8f5a2a);
    add(b, ico, [-0.35, 1.47, 0], [0.08, 0.05, 0.08], 0x5a3a1c);
    for (const s of [-1, 1]) add(b, box, [-0.35 + s * 0.36, 1.25, 0], [0.08, 0.05, 0.14], 0x8f5a2a);
    add(b, cyl, [0.25, 1.32, 0.12], [0.03, 0.55, 0.03], 0x6b4a2c, [0, 0, -0.5]);
    add(b, box, [0.55, 1.04, -0.25], [0.5, 0.06, 0.35], 0x8a5a32);
    add(b, ico, [0.5, 1.12, -0.25], [0.12, 0.08, 0.1], 0xd4b25a);
    add(b, ico, [0.66, 1.12, -0.2], [0.1, 0.1, 0.1], 0xc8302a);
    return b.build();
  },
  FARM_PLOT() {
    const b = new PartsBuilder();
    const r = rnd(51);
    // Borde de troncos, tierra labrada en surcos y unas piedrecitas.
    for (const s of [-1, 1]) {
      add(b, cyl, [0, 0.1, s * 0.92], [0.16, 2.0, 0.16], pick(WOOD, r), [0, 0, Math.PI / 2]);
      add(b, cyl, [s * 0.92, 0.1, 0], [0.16, 1.68, 0.16], pick(WOOD, r), [Math.PI / 2, 0, 0]);
    }
    add(b, box, [0, 0.09, 0], [1.72, 0.2, 1.72], 0x4a3322);
    for (let i = 0; i < 5; i++) add(b, box, [-0.68 + i * 0.34, 0.2, 0], [0.18, 0.05, 1.66], i % 2 ? 0x5a3e28 : 0x553a25);
    for (let i = 0; i < 4; i++) add(b, ico, [(r() - 0.5) * 1.5, 0.21, (r() - 0.5) * 1.5], [0.05, 0.03, 0.04], STONE[1]);
    return b.build();
  },
  // ---- Estaciones de la P5 -------------------------------------------------------
  LOOM() {
    const b = new PartsBuilder();
    const r = rnd(41);
    // Telar de bastidor: patas, travesaños, rodillos, urdimbre tensada, tela tejida y lanzadera.
    for (const x of [-0.82, 0.82]) {
      post(b, x, -0.45, 0.1, 1.55, 0.1);
      post(b, x, 0.45, 0.1, 0.95, 0.1);
      add(b, box, [x, 0.92, 0], [0.09, 0.08, 1.0], WOOD_DARK);
      add(b, box, [x, 0.15, 0], [0.08, 0.08, 1.0], WOOD_DARK);
    }
    add(b, cyl, [0, 1.48, -0.45], [0.09, 1.7, 0.09], pick(WOOD, r), [0, 0, Math.PI / 2]);
    add(b, cyl, [0, 0.86, 0.45], [0.11, 1.7, 0.11], pick(WOOD, r), [0, 0, Math.PI / 2]);
    add(b, cyl, [0, 0.86, 0.45], [0.16, 1.4, 0.16], 0x3f6aa8, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 22; i++) {
      const x = -0.66 + i * (1.32 / 21);
      add(b, box, [x, 1.17, 0], [0.008, 0.008, 1.0], 0xe8e2d0, [0.57, 0, 0]);
    }
    // Tela a medio tejer (franjas).
    for (let k = 0; k < 5; k++) add(b, box, [0, 0.98 + k * 0.03, 0.25 - k * 0.05], [1.36, 0.028, 0.06], k % 2 ? 0x3f6aa8 : 0xd9c9a0, [0.57, 0, 0]);
    add(b, box, [0, 1.1, 0.1], [1.5, 0.05, 0.05], WOOD_DARK, [0.57, 0, 0]);
    add(b, box, [0.3, 1.06, 0.12], [0.3, 0.04, 0.06], 0x8a5a32, [0.57, 0, 0]);
    // Ovillos y cesto.
    add(b, cyl, [-0.55, 0.12, 0.35], [0.36, 0.24, 0.36], 0x8a6a42);
    add(b, ico, [-0.6, 0.27, 0.35], [0.14, 0.13, 0.14], 0xb8433a);
    add(b, ico, [-0.48, 0.27, 0.3], [0.12, 0.11, 0.12], 0xf1ece0);
    return b.build();
  },
  TANNER() {
    const b = new PartsBuilder();
    const r = rnd(42);
    // Cuba de curtir (duelas y aros), bastidor con una piel tensada y banco de raspar.
    const cx = -0.5;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      add(b, box, [cx + Math.cos(a) * 0.4, 0.38, Math.sin(a) * 0.4], [0.18, 0.76, 0.05], pick(WOOD, r), [0, -a + Math.PI / 2, 0]);
    }
    for (const y of [0.15, 0.62]) add(b, torus, [cx, y, 0], [0.86, 0.86, 0.6], IRON, [Math.PI / 2, 0, 0]);
    add(b, cyl, [cx, 0.66, 0], [0.74, 0.02, 0.74], 0x6a4a2a);
    add(b, box, [cx + 0.1, 0.8, 0.05], [0.04, 0.4, 0.04], WOOD_DARK, [0.3, 0, 0.4]);
    // Bastidor.
    const fx = 0.5;
    for (const x of [fx - 0.42, fx + 0.42]) post(b, x, -0.4, 0.08, 1.45, 0.08);
    for (const y of [0.35, 1.38]) add(b, box, [fx, y, -0.4], [0.92, 0.07, 0.07], WOOD_DARK);
    add(b, box, [fx, 0.86, -0.4], [0.7, 0.9, 0.02], 0xa9784a, [0, 0, 0], (i, v) => { v.x *= 1 - Math.abs(v.y) * 0.25; });
    for (let k = 0; k < 6; k++) {
      const y = 0.45 + k * 0.17;
      for (const s of [-1, 1]) add(b, box, [fx + s * 0.39, y, -0.4], [0.06, 0.01, 0.01], ROPE);
    }
    // Banco de raspar con cuchilla y pieles apiladas.
    add(b, box, [fx, 0.3, 0.3], [0.9, 0.08, 0.35], pick(WOOD, r), [0, 0, 0.12]);
    for (const x of [fx - 0.35, fx + 0.35]) post(b, x, 0.3, 0.07, x < fx ? 0.24 : 0.34, 0.07);
    add(b, box, [fx + 0.05, 0.38, 0.3], [0.3, 0.02, 0.04], 0xb9bec4, [0, 0, 0.12]);
    for (let k = 0; k < 3; k++) add(b, box, [0.75, 0.04 + k * 0.05, 0.45], [0.42 - k * 0.04, 0.04, 0.3], k % 2 ? 0x8b5a2b : 0x7a4a24);
    return b.build();
  },
  ALCHEMY() {
    const b = new PartsBuilder();
    const r = rnd(43);
    // Mesa de tablones sobre patas de ladrillo, alambique de cobre con serpentín, frascos,
    // mortero, libro abierto y velas.
    for (const x of [-0.8, 0.8]) for (let c = 0; c < 4; c++) add(b, box, [x, 0.11 + c * 0.22, 0], [0.26, 0.2, 0.9], c % 2 ? 0x9a5a3e : 0x8a4e36);
    for (let i = 0; i < 4; i++) add(b, box, [0, 0.93, -0.36 + i * 0.24], [1.9, 0.1, 0.22], pick(WOOD, r));
    add(b, box, [0, 0.4, 0], [1.4, 0.05, 0.8], WOOD_DARK);
    for (let i = 0; i < 5; i++) add(b, cyl, [-0.55 + i * 0.27, 0.53, 0.1], [0.12, 0.2, 0.12], [0x9c7bff, 0xff4f7a, 0x62c24a, 0xff9a2a, 0x7fe0ff][i]);
    // Alambique.
    add(b, cyl, [-0.5, 1.05, -0.15], [0.3, 0.12, 0.3], 0x3e4348);
    add(b, ico, [-0.5, 1.28, -0.15], [0.42, 0.38, 0.42], 0xb87333);
    add(b, cone, [-0.5, 1.52, -0.15], [0.16, 0.22, 0.16], 0xb87333);
    add(b, cyl, [-0.22, 1.52, -0.15], [0.03, 0.6, 0.03], 0xb87333, [0, 0, 1.3]);
    add(b, torus, [0.1, 1.22, -0.15], [0.3, 0.3, 0.4], 0xc78a4a, [Math.PI / 2, 0, 0]);
    add(b, torus, [0.1, 1.12, -0.15], [0.3, 0.3, 0.4], 0xc78a4a, [Math.PI / 2, 0, 0]);
    add(b, ico, [0.1, 1.06, -0.15], [0.12, 0.1, 0.12], 0xff6a2a);
    // Frascos en la mesa.
    const vials = [[0.35, 0.2, 0xff4f7a], [0.5, 0.25, 0x62c24a], [0.62, 0.18, 0x9c7bff], [0.75, 0.22, 0xffd34a]];
    for (const [x, h, c] of vials) {
      add(b, cyl, [x, 0.98 + h / 2, 0.15], [0.09, h, 0.09], c);
      add(b, cyl, [x, 1.0 + h, 0.15], [0.04, 0.06, 0.04], 0xdfe8ef);
    }
    // Mortero, libro y vela.
    add(b, cyl, [0.6, 1.03, -0.25], [0.18, 0.1, 0.18], STONE[0]);
    add(b, cyl, [0.63, 1.12, -0.25], [0.03, 0.18, 0.03], STONE_DARK, [0, 0, -0.5]);
    add(b, box, [0.15, 0.99, 0.28], [0.36, 0.03, 0.26], 0xeee6d2, [0, 0.2, 0]);
    add(b, box, [0.15, 0.975, 0.28], [0.38, 0.02, 0.28], 0x6b2a2a, [0, 0.2, 0]);
    add(b, cyl, [-0.8, 1.05, 0.3], [0.05, 0.14, 0.05], 0xf1ece0);
    add(b, cone, [-0.8, 1.16, 0.3], [0.03, 0.07, 0.03], 0xffd36a);
    return b.build();
  },
  FORGE() {
    const b = new PartsBuilder();
    const r = rnd(44);
    // Fragua de ladrillo con brasas y campana con chimenea, fuelle y yunque con martillo.
    const brick = [0x9a5a3e, 0x8a4e36, 0xa5653f, 0x7f4730];
    for (let c = 0; c < 4; c++) {
      for (let k = 0; k < 4; k++) add(b, box, [-0.62 + k * 0.26 + (c % 2) * 0.05, 0.12 + c * 0.24, -0.3], [0.24, 0.22, 0.95], pick(brick, r));
    }
    add(b, box, [-0.6, 1.0, -0.3], [1.05, 0.06, 1.0], STONE_DARK);
    add(b, box, [-0.6, 1.05, -0.3], [0.7, 0.06, 0.6], 0x1c1410);
    add(b, ico, [-0.6, 1.1, -0.3], [0.5, 0.1, 0.4], 0xff6a1a);
    add(b, ico, [-0.5, 1.13, -0.2], [0.25, 0.08, 0.2], 0xffb347);
    // Campana y chimenea.
    add(b, box, [-0.6, 1.62, -0.45], [0.9, 0.5, 0.6], 0x6a4a3a, [0, 0, 0], (i, v) => { if (v.y > 0) { v.x *= 0.45; v.z *= 0.45; } });
    for (let c = 0; c < 3; c++) add(b, box, [-0.6, 1.95 + c * 0.1, -0.45], [0.36, 0.09, 0.36], pick(brick, r));
    // Fuelle.
    add(b, box, [-1.0, 0.75, 0.3], [0.2, 0.08, 0.45], 0x7a4a24, [0.25, 0, 0]);
    add(b, box, [-1.0, 0.85, 0.3], [0.18, 0.04, 0.42], WOOD_DARK, [0.4, 0, 0]);
    add(b, cyl, [-1.0, 0.82, 0.06], [0.04, 0.3, 0.04], IRON, [Math.PI / 2, 0, 0]);
    // Yunque sobre tocón y martillo; tenazas y barras de acero.
    add(b, cyl, [0.6, 0.3, 0.2], [0.5, 0.6, 0.5], 0x6b4a2f);
    add(b, box, [0.6, 0.66, 0.2], [0.3, 0.12, 0.22], 0x3e4348);
    add(b, box, [0.6, 0.75, 0.2], [0.18, 0.08, 0.14], 0x3e4348);
    add(b, box, [0.6, 0.84, 0.2], [0.58, 0.1, 0.22], 0x4a4f55);
    add(b, cone, [0.98, 0.84, 0.2], [0.16, 0.2, 0.16], 0x4a4f55, [0, 0, -Math.PI / 2]);
    add(b, cyl, [0.5, 0.93, 0.35], [0.025, 0.3, 0.025], 0x6b4a2c, [Math.PI / 2, 0, 0.3]);
    add(b, box, [0.5, 0.94, 0.2], [0.1, 0.07, 0.07], IRON);
    for (let k = 0; k < 3; k++) add(b, box, [0.75, 0.04 + k * 0.05, -0.5], [0.5, 0.04, 0.08], k === 2 ? 0xff8a3a : 0xc7cdd4);
    return b.build();
  },
  // ---- P6: piedra y ladrillo ------------------------------------------------------------
  STONE_WALL() {
    const b = new PartsBuilder();
    masonry(b, rnd(61), -1, 1, 0, H, STONE, 0.3, [0.32, 0.6], 0.2, STONE_DARK);
    add(b, box, [0, H - 0.04, 0], [2, 0.08, 0.22], STONE[2]);
    return b.build();
  },
  BRICK_WALL() {
    const b = new PartsBuilder();
    masonry(b, rnd(62), -1, 1, 0, H, BRICK, 0.15, [0.3, 0.3], 0.2, MORTAR);
    add(b, box, [0, 0.06, 0], [2, 0.12, 0.22], STONE_DARK);
    add(b, box, [0, H - 0.05, 0], [2, 0.1, 0.22], STONE[2]);
    return b.build();
  },
  STONE_HALF_WALL() {
    const b = new PartsBuilder();
    masonry(b, rnd(63), -1, 1, 0, 1.2, STONE, 0.3, [0.32, 0.6], 0.2, STONE_DARK);
    add(b, box, [0, 1.16, 0], [2.02, 0.08, 0.24], STONE[2]);
    return b.build();
  },
  STONE_FLOOR() {
    const b = new PartsBuilder();
    const r = rnd(64);
    add(b, box, [0, 0.08, 0], [1.98, 0.16, 1.98], STONE_DARK);
    // Losas irregulares en hileras.
    for (let j = 0; j < 4; j++) {
      let x = -1 + (j % 2) * 0.22;
      const z = -1 + (j + 0.5) * 0.5;
      add(b, box, [-1 + 0.11 * (j % 2), 0.185, z], [0.22 * (j % 2), 0.03, 0.47], pick(STONE, r));
      while (x < 1) {
        const w = Math.min(1 - x, 0.4 + r() * 0.3);
        add(b, box, [x + w / 2, 0.185 + r() * 0.006, z], [w - 0.03, 0.03, 0.47], pick(STONE, r));
        x += w;
      }
    }
    return b.build();
  },
  BRICK_FLOOR() {
    const b = new PartsBuilder();
    const r = rnd(65);
    add(b, box, [0, 0.08, 0], [1.98, 0.16, 1.98], MORTAR);
    // Baldosas en espiga.
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const along = (i + j) % 2 === 0;
        add(b, box, [-0.875 + i * 0.25, 0.18, -0.875 + j * 0.25], along ? [0.23, 0.03, 0.11] : [0.11, 0.03, 0.23], pick(BRICK, r));
        add(b, box, [-0.875 + i * 0.25 + (along ? 0 : 0.06), 0.18, -0.875 + j * 0.25 + (along ? 0.06 : 0)], along ? [0.23, 0.03, 0.1] : [0.1, 0.03, 0.23], pick(BRICK, r));
      }
    }
    return b.build();
  },
  TILE_ROOF() {
    const b = new PartsBuilder();
    const r = rnd(66);
    const slope = Math.atan2(1.2, 2);
    const len = Math.hypot(2, 1.2) + 0.05;
    add(b, box, [0, 0.72, 0], [2, 0.08, len], WOOD_CORE, [slope, 0, 0]);
    // Tejas curvas (medias cañas) en hileras, alternando cóncava y convexa.
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const s = (i + 0.5) / rows;
      const z = 1 - 2 * s;
      const y = 0.15 + 1.2 * s + 0.08;
      for (let k = 0; k < 9; k++) {
        const x = -0.89 + k * 0.222;
        add(b, cyl, [x, y + (k % 2 ? 0.035 : 0), z], [0.12, len / rows + 0.05, 0.08], pick(TILE, r), [slope + Math.PI / 2, 0, 0], (n, v) => {
          if (k % 2 ? v.z > 0 : v.z < 0) v.z *= 0.2; // media caña
        });
      }
    }
    add(b, cyl, [0, 1.38, -1], [0.16, 2.02, 0.16], TILE[0], [0, 0, Math.PI / 2]);
    add(b, box, [0, 0.14, 1], [2.02, 0.08, 0.1], WOOD_DARK);
    return b.build();
  },
  STONE_STAIRS() {
    const b = new PartsBuilder();
    const r = rnd(67);
    const steps = 8;
    const rise = H + 0.2;
    const run = 2 / steps;
    for (let i = 0; i < steps; i++) {
      const h = (rise * (i + 1)) / steps;
      const z = 1 - run * (i + 0.5);
      add(b, box, [0, h / 2, z], [1.9, h, run + 0.01], pick(STONE, r));
      add(b, box, [0, h - 0.015, z + 0.02], [1.94, 0.04, run + 0.04], STONE[2]);
    }
    return b.build();
  },
  STONE_PILLAR() {
    const b = new PartsBuilder();
    const r = rnd(68);
    add(b, box, [0, 0.1, 0], [0.3, 0.2, 0.3], STONE[2]);
    for (let i = 0; i < 6; i++) add(b, cyl, [0, 0.2 + i * 0.34 + 0.17, 0], [0.24, 0.33, 0.24], pick(STONE, r), [0, i * 0.4, 0]);
    add(b, box, [0, H - 0.1, 0], [0.3, 0.2, 0.3], STONE[2]);
    return b.build();
  },
  // ---- P6: piezas nuevas de madera -------------------------------------------------------
  HALF_WALL() {
    const b = new PartsBuilder();
    const r = rnd(69);
    plankWall(b, r, -0.92, 0.92, 0.1, 1.08, 0.2, 3);
    add(b, box, [0, 0.05, 0], [2, 0.1, 0.22], WOOD_DARK);
    add(b, box, [0, 1.14, 0], [2.04, 0.12, 0.26], WOOD[2]);
    post(b, -0.94, 0, 0.12, 1.1, 0.22);
    post(b, 0.94, 0, 0.12, 1.1, 0.22);
    return b.build();
  },
  GABLE() {
    const b = new PartsBuilder();
    const r = rnd(70);
    // Tablas horizontales cada vez más cortas (triángulo) y el borde inclinado.
    const rows = 6;
    for (let i = 0; i < rows; i++) {
      const y = (i + 0.5) * (1.2 / rows);
      const w = 2 * (1 - (y + 0.1) / 1.2);
      if (w > 0.05) add(b, box, [0, y, 0], [w, 1.2 / rows - 0.02, 0.16], pick(WOOD, r));
    }
    const ang = Math.atan2(1.2, 1);
    for (const s of [-1, 1]) add(b, box, [s * 0.5, 0.6, 0], [Math.hypot(1, 1.2), 0.1, 0.2], WOOD_DARK, [0, 0, -s * ang]);
    return b.build();
  },
  BIG_WINDOW() {
    const b = new PartsBuilder();
    // Marco grueso, parteluces y alféizar (el cristal va aparte, transparente).
    add(b, box, [0, 0.05, 0], [2, 0.1, 0.22], WOOD_DARK);
    add(b, box, [0, 0.35, 0], [2, 0.5, 0.2], WOOD[1]);
    add(b, box, [0, H - 0.1, 0], [2, 0.2, 0.22], WOOD_DARK);
    post(b, -0.94, 0, 0.12, H, 0.22);
    post(b, 0.94, 0, 0.12, H, 0.22);
    for (const x of [-0.31, 0.31]) add(b, box, [x, 1.45, 0], [0.06, 1.7, 0.1], WOOD_DARK);
    add(b, box, [0, 1.45, 0], [1.76, 0.06, 0.1], WOOD_DARK);
    add(b, box, [0, 0.62, 0.06], [2.02, 0.06, 0.28], WOOD[2]);
    return b.build();
  },
  BIG_WINDOW_GLASS() {
    const b = new PartsBuilder();
    add(b, box, [0, 1.45, 0], [1.78, 1.68, 0.02], 0xa9d8ee);
    return b.build();
  },
  FENCE_GATE() {
    const b = new PartsBuilder();
    for (const x of [-0.96, 0.96]) {
      post(b, x, 0, 0.12, 1.2, 0.12);
      add(b, cone, [x, 1.26, 0], [0.13, 0.12, 0.13], WOOD_DARK, [0, Math.PI / 4, 0]);
    }
    return b.build();
  },
  /** Hoja de la puerta de valla (bisagra en x = 0; se coloca en x = -0,9). */
  FENCE_GATE_LEAF() {
    const b = new PartsBuilder();
    const r = rnd(71);
    for (const y of [0.25, 0.85]) add(b, box, [0.9, y, 0], [1.8, 0.09, 0.05], pick(WOOD, r));
    for (const x of [0.05, 0.6, 1.2, 1.75]) add(b, box, [x, 0.55, 0], [0.08, 0.9, 0.05], pick(WOOD, r));
    add(b, box, [0.9, 0.55, 0.03], [Math.hypot(1.7, 0.6), 0.08, 0.03], WOOD_DARK, [0, 0, Math.atan2(0.6, 1.7)]);
    for (const y of [0.25, 0.85]) add(b, cyl, [0, y, 0], [0.04, 0.12, 0.04], IRON);
    return b.build();
  },
  RAILING() {
    const b = new PartsBuilder();
    const r = rnd(72);
    add(b, box, [0, 0.96, 0], [2, 0.08, 0.1], pick(WOOD, r));
    add(b, box, [0, 0.06, 0], [2, 0.06, 0.08], WOOD_DARK);
    for (let i = 0; i < 9; i++) add(b, cyl, [-0.88 + i * 0.22, 0.5, 0], [0.04, 0.84, 0.04], i === 0 || i === 8 ? WOOD_DARK : pick(WOOD, r));
    return b.build();
  },
  LADDER() {
    const b = new PartsBuilder();
    const r = rnd(73);
    for (const x of [-0.38, 0.38]) add(b, box, [x, H / 2, 0], [0.07, H, 0.07], WOOD_DARK);
    for (let i = 0; i < 8; i++) add(b, cyl, [0, 0.25 + i * 0.29, 0.01], [0.035, 0.76, 0.035], pick(WOOD, r), [0, 0, Math.PI / 2]);
    return b.build();
  },
  TRAPDOOR() {
    const b = new PartsBuilder();
    const r = rnd(74);
    // Marco de suelo alrededor del hueco.
    for (const s of [-1, 1]) {
      add(b, box, [0, 0.1, s * 0.925], [2, 0.2, 0.15], pick(WOOD, r));
      add(b, box, [s * 0.925, 0.1, 0], [0.15, 0.2, 1.7], pick(WOOD, r));
    }
    return b.build();
  },
  /** Hoja de la trampilla (bisagra en z = 0, se abre hacia arriba; se coloca en z = -0,85). */
  TRAPDOOR_LEAF() {
    const b = new PartsBuilder();
    const r = rnd(75);
    for (let i = 0; i < 6; i++) add(b, box, [-0.71 + i * 0.284, -0.04, 0.85], [0.27, 0.07, 1.68], pick(WOOD, r));
    for (const z of [0.35, 1.35]) add(b, box, [0, -0.09, z], [1.6, 0.03, 0.1], IRON);
    add(b, torus, [0, 0.0, 1.55], [0.1, 0.1, 0.1], IRON, [Math.PI / 2, 0, 0]);
    return b.build();
  },
  // ---- P6: muebles -------------------------------------------------------------------------
  TABLE() {
    const b = new PartsBuilder();
    const r = rnd(76);
    for (const [x, z] of [[-0.68, -0.38], [0.68, -0.38], [-0.68, 0.38], [0.68, 0.38]]) {
      add(b, cyl, [x, 0.37, z], [0.08, 0.74, 0.08], WOOD_DARK);
    }
    for (const z of [-0.38, 0.38]) add(b, box, [0, 0.62, z], [1.36, 0.08, 0.05], WOOD_DARK);
    for (let i = 0; i < 4; i++) add(b, box, [0, 0.77, -0.375 + i * 0.25], [1.6, 0.06, 0.24], pick(WOOD, r));
    return b.build();
  },
  CHAIR() {
    const b = new PartsBuilder();
    const r = rnd(77);
    for (const [x, z] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) post(b, x, z, 0.05, 0.44, 0.05, WOOD_DARK);
    add(b, box, [0, 0.46, 0], [0.5, 0.05, 0.5], pick(WOOD, r));
    // Respaldo (atrás, −Z) con dos travesaños.
    for (const x of [-0.21, 0.21]) post(b, x, -0.22, 0.05, 0.55, 0.05, WOOD_DARK, 0.48);
    for (const y of [0.7, 0.92]) add(b, box, [0, y, -0.22], [0.44, 0.08, 0.04], pick(WOOD, r));
    return b.build();
  },
  BENCH() {
    const b = new PartsBuilder();
    const r = rnd(78);
    for (const x of [-0.65, 0.65]) add(b, box, [x, 0.21, 0], [0.08, 0.42, 0.36], WOOD_DARK);
    add(b, box, [0, 0.43, 0], [1.6, 0.06, 0.42], pick(WOOD, r));
    add(b, box, [0, 0.15, 0], [1.3, 0.05, 0.06], WOOD_DARK);
    return b.build();
  },
  BOOKSHELF() {
    const b = new PartsBuilder();
    const r = rnd(79);
    const BOOKS = [0x8c2f2a, 0x2f5a8c, 0x3a7a3a, 0xc7a14a, 0x6b3f7a, 0x7a5a3a, 0xd9d2c0];
    for (const x of [-0.58, 0.58]) add(b, box, [x, 0.95, 0], [0.04, 1.9, 0.34], WOOD_DARK);
    add(b, box, [0, 0.95, -0.16], [1.12, 1.9, 0.02], WOOD_CORE);
    for (let i = 0; i < 5; i++) add(b, box, [0, 0.04 + i * 0.45, 0], [1.14, 0.04, 0.34], pick(WOOD, r));
    // Libros de alturas y colores distintos en cada balda (alguno tumbado).
    for (let i = 0; i < 4; i++) {
      let x = -0.54;
      while (x < 0.5) {
        const w = 0.04 + r() * 0.04;
        const h = 0.24 + r() * 0.13;
        if (r() < 0.1) {
          add(b, box, [x + 0.12, 0.06 + i * 0.45 + 0.025, 0.02], [0.24, 0.05, 0.22], pick(BOOKS, r));
          x += 0.26;
        } else {
          add(b, box, [x + w / 2, 0.06 + i * 0.45 + h / 2, 0.02], [w - 0.004, h, 0.22], pick(BOOKS, r), [0, 0, (r() - 0.5) * 0.06]);
          x += w;
        }
      }
    }
    return b.build();
  },
  WARDROBE() {
    const b = new PartsBuilder();
    const r = rnd(80);
    add(b, box, [0, 1.0, 0], [1.2, 1.9, 0.62], WOOD_DARK);
    add(b, box, [0, 1.96, 0], [1.26, 0.08, 0.66], pick(WOOD, r));
    add(b, box, [0, 0.05, 0], [1.24, 0.1, 0.66], WOOD_DARK);
    // Dos puertas con cuarterones y tiradores.
    for (const s of [-1, 1]) {
      add(b, box, [s * 0.295, 1.0, 0.315], [0.57, 1.78, 0.02], pick(WOOD, r));
      for (const y of [0.55, 1.45]) add(b, box, [s * 0.295, y, 0.33], [0.42, 0.62, 0.012], WOOD[3]);
      add(b, cyl, [s * 0.04, 1.0, 0.34], [0.025, 0.12, 0.025], IRON);
    }
    return b.build();
  },
  BARREL() {
    const b = new PartsBuilder();
    const r = rnd(81);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      add(b, box, [Math.cos(a) * 0.29, 0.47, Math.sin(a) * 0.29], [0.155, 0.92, 0.05], pick(WOOD, r), [0, -a + Math.PI / 2, 0], (i, v) => {
        v.z *= 1; // duela
        const bulge = 1 - Math.abs(v.y) * 0.25;
        v.x *= 1;
        v.z += 0;
        v.y *= 1;
        v.x *= bulge;
      });
    }
    for (const y of [0.15, 0.78]) add(b, torus, [0, y, 0], [0.63, 0.63, 0.5], IRON, [Math.PI / 2, 0, 0]);
    add(b, cyl, [0, 0.9, 0], [0.56, 0.04, 0.56], WOOD[1]);
    return b.build();
  },
  RUG() {
    const b = new PartsBuilder();
    // Alfombra tejida: fondo rojo, cenefa clara y rombo central.
    add(b, box, [0, 0.008, 0], [2, 0.016, 1.4], 0x9c3d34);
    add(b, box, [0, 0.012, 0], [1.8, 0.016, 1.2], 0xd9c9a0);
    add(b, box, [0, 0.016, 0], [1.66, 0.016, 1.06], 0xa8443a);
    add(b, box, [0, 0.02, 0], [0.6, 0.016, 0.6], 0x3f6aa8, [0, Math.PI / 4, 0]);
    for (const x of [-1.02, 1.02]) for (let i = 0; i < 10; i++) add(b, box, [x, 0.006, -0.63 + i * 0.14], [0.06, 0.008, 0.02], 0xe8dcc0);
    return b.build();
  },
  LAMP() {
    const b = new PartsBuilder();
    // Base de hierro, depósito, llama y tubo de cristal con asa.
    add(b, cyl, [0, 0.03, 0], [0.24, 0.06, 0.24], IRON);
    add(b, cyl, [0, 0.14, 0], [0.16, 0.16, 0.16], 0xb87333);
    add(b, cyl, [0, 0.36, 0], [0.16, 0.3, 0.16], 0xe8f4ff);
    add(b, cone, [0, 0.33, 0], [0.05, 0.12, 0.05], 0xffc060);
    add(b, cyl, [0, 0.53, 0], [0.18, 0.03, 0.18], IRON);
    add(b, torus, [0, 0.56, 0], [0.1, 0.1, 0.1], IRON);
    return b.build();
  },
  FLOWER_POT() {
    const b = new PartsBuilder();
    const r = rnd(82);
    add(b, cyl, [0, 0.16, 0], [0.32, 0.32, 0.32], 0xb5643a, [0, 0, 0], (i, v) => {
      if (v.y < 0) {
        v.x *= 0.75;
        v.z *= 0.75;
      }
    });
    add(b, cyl, [0, 0.31, 0], [0.34, 0.05, 0.34], 0xa55a33);
    add(b, cyl, [0, 0.31, 0], [0.28, 0.02, 0.28], 0x4a3322);
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const rr = r() * 0.1;
      const h = 0.15 + r() * 0.18;
      add(b, box, [Math.cos(a) * rr, 0.32 + h / 2, Math.sin(a) * rr], [0.015, h, 0.015], 0x4f8a3a, [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3]);
      add(b, ico, [Math.cos(a) * (rr + 0.04), 0.33 + h, Math.sin(a) * (rr + 0.04)], [0.05, 0.03, 0.05], pick([0xffd84a, 0xd84a9a, 0xa66cff, 0xffffff], r));
    }
    return b.build();
  },
  // ---- P6: útiles de casa -----------------------------------------------------------------
  WELL() {
    const b = new PartsBuilder();
    const r = rnd(83);
    // Brocal redondo de piedra, agua oscura, dos postes, tejadillo, torno y cubo.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      for (let c = 0; c < 3; c++) add(b, box, [Math.cos(a + c * 0.2) * 0.72, 0.14 + c * 0.27, Math.sin(a + c * 0.2) * 0.72], [0.34, 0.26, 0.22], pick(STONE, r), [0, -a - c * 0.2 + Math.PI / 2, 0]);
    }
    add(b, cyl, [0, 0.55, 0], [1.2, 0.02, 1.2], 0x1d3a4a);
    for (const x of [-0.78, 0.78]) post(b, x, 0, 0.12, 1.95, 0.12, WOOD_DARK);
    add(b, cyl, [0, 1.45, 0], [0.09, 1.5, 0.09], pick(WOOD, r), [0, 0, Math.PI / 2]);
    add(b, cyl, [0, 1.45, 0], [0.12, 0.5, 0.12], ROPE, [0, 0, Math.PI / 2]);
    add(b, box, [0.88, 1.45, 0.12], [0.04, 0.04, 0.24], IRON);
    add(b, cyl, [0, 1.1, 0], [0.02, 0.6, 0.02], ROPE);
    add(b, cyl, [0, 0.78, 0], [0.22, 0.2, 0.22], 0x8f949a);
    const slope = 0.6;
    for (const s of [-1, 1]) add(b, box, [0, 2.05, s * 0.33], [1.9, 0.06, 0.78], pick(ROOF, r), [-s * slope, 0, 0]);
    add(b, box, [0, 2.27, 0], [1.94, 0.08, 0.1], WOOD_DARK);
    return b.build();
  },
  RAIN_COLLECTOR() {
    const b = new PartsBuilder();
    const r = rnd(84);
    // Barril con aros y, encima, un toldo de tela en embudo sobre cuatro palos.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      add(b, box, [Math.cos(a) * 0.33, 0.45, Math.sin(a) * 0.33], [0.175, 0.9, 0.05], pick(WOOD, r), [0, -a + Math.PI / 2, 0]);
    }
    for (const y of [0.15, 0.75]) add(b, torus, [0, y, 0], [0.72, 0.72, 0.5], IRON, [Math.PI / 2, 0, 0]);
    add(b, cyl, [0, 0.86, 0], [0.62, 0.02, 0.62], 0x3a8fc0);
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) post(b, x, z, 0.06, 1.85, 0.06, WOOD_DARK);
    add(b, cone, [0, 1.55, 0], [1.6, 0.5, 1.6], 0xd9c9a0, [Math.PI, Math.PI / 4, 0]);
    return b.build();
  },
  DRYING_RACK() {
    const b = new PartsBuilder();
    const r = rnd(85);
    // Caballetes en A, tres varales y tiras colgando (carne, pescado, hierbas).
    for (const x of [-0.85, 0.85]) {
      for (const s of [-1, 1]) add(b, box, [x, 0.78, s * 0.17], [0.07, 1.62, 0.07], WOOD_DARK, [s * 0.22, 0, 0]);
    }
    for (const y of [0.85, 1.25, 1.55]) add(b, cyl, [0, y, 0], [0.04, 1.8, 0.04], pick(WOOD, r), [0, 0, Math.PI / 2]);
    for (let i = 0; i < 9; i++) {
      const x = -0.7 + i * 0.175;
      const y = [0.85, 1.25, 1.55][i % 3];
      const kind = i % 3;
      add(b, box, [x, y - 0.17, 0], [0.09, 0.3, 0.02], kind === 0 ? 0x8c3a2a : kind === 1 ? 0xb9b0a0 : 0x6a8a3a, [0, 0, (r() - 0.5) * 0.2]);
      add(b, box, [x, y - 0.02, 0], [0.03, 0.04, 0.03], ROPE);
    }
    return b.build();
  },
  MANNEQUIN() {
    const b = new PartsBuilder();
    // Base de madera, poste, torso de tela y brazos en cruz (la armadura se dibuja encima).
    add(b, cyl, [0, 0.04, 0], [0.5, 0.08, 0.5], WOOD_DARK);
    add(b, cyl, [0, 0.55, 0], [0.06, 1.0, 0.06], WOOD[0]);
    add(b, box, [0, 1.3, 0], [0.38, 0.55, 0.22], 0xd9c9a0);
    add(b, cyl, [0, 1.62, 0], [0.08, 0.1, 0.08], WOOD[0]);
    add(b, ico, [0, 1.76, 0], [0.13, 0.15, 0.13], 0xd9c9a0);
    add(b, cyl, [0, 1.48, 0], [0.04, 0.84, 0.04], WOOD[0], [0, 0, Math.PI / 2]);
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
