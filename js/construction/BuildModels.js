import * as THREE from 'three';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Modelos low-poly de las piezas de construcción, en las mismas coordenadas
 * locales que BuildRules (base en y = 0, largo en X, frente hacia +Z).
 * Madera en tablas de dos tonos para que se lean las juntas entre piezas.
 */
const WOOD = 0x9a6a3f;
const WOOD_ALT = 0x8a5d36;
const WOOD_DARK = 0x6b4a2f;
const STONE = 0x8d8a86;
const STONE_DARK = 0x74716d;
const ROOF = 0x7a3f2c;
const ROOF_ALT = 0x8c4a33;
const WOOL = 0xf1ece0;
const BLANKET = 0x9c3d34;

const box = new THREE.BoxGeometry(1, 1, 1);

/** Tablas horizontales entre y0 e y1 a lo largo de X (x0..x1), grosor t. */
function planks(b, x0, x1, y0, y1, t = 0.2, n = null) {
  const count = n ?? Math.max(1, Math.round((y1 - y0) / 0.3));
  const h = (y1 - y0) / count;
  for (let i = 0; i < count; i++) {
    b.add(box, {
      position: [(x0 + x1) / 2, y0 + h * (i + 0.5), 0],
      scale: [x1 - x0, h * 0.96, t],
      color: i % 2 ? WOOD_ALT : WOOD,
    });
  }
}

const H = 2.4;

export const BUILD_MODELS = {
  FOUNDATION() {
    const b = new PartsBuilder();
    b.add(box, { position: [0, -0.65, 0], scale: [2, 1.7, 2], color: STONE_DARK });
    b.add(box, { position: [0, 0.1, 0], scale: [2, 0.2, 2], color: STONE });
    return b.build();
  },
  FLOOR() {
    const b = new PartsBuilder();
    for (let i = 0; i < 5; i++) {
      b.add(box, { position: [0, 0.1, -0.8 + i * 0.4], scale: [2, 0.2, 0.39], color: i % 2 ? WOOD_ALT : WOOD });
    }
    return b.build();
  },
  WALL() {
    const b = new PartsBuilder();
    planks(b, -1, 1, 0, H);
    b.add(box, { position: [-0.95, H / 2, 0], scale: [0.1, H, 0.24], color: WOOD_DARK });
    b.add(box, { position: [0.95, H / 2, 0], scale: [0.1, H, 0.24], color: WOOD_DARK });
    return b.build();
  },
  DOOR() {
    const b = new PartsBuilder();
    planks(b, -1, -0.5, 0, H, 0.2, 8);
    planks(b, 0.5, 1, 0, H, 0.2, 8);
    b.add(box, { position: [0, 2.2, 0], scale: [1, 0.4, 0.2], color: WOOD });
    b.add(box, { position: [-0.52, 1.05, 0], scale: [0.06, 2.1, 0.24], color: WOOD_DARK });
    b.add(box, { position: [0.52, 1.05, 0], scale: [0.06, 2.1, 0.24], color: WOOD_DARK });
    return b.build();
  },
  /** Hoja de la puerta, con la bisagra en x = 0 (se coloca en x = -0,5 de la pieza). */
  DOOR_LEAF() {
    const b = new PartsBuilder();
    for (let i = 0; i < 3; i++) {
      b.add(box, { position: [0.17 + i * 0.33, 1.0, 0], scale: [0.32, 2.0, 0.08], color: i % 2 ? WOOD : WOOD_ALT });
    }
    b.add(box, { position: [0.5, 1.6, 0], scale: [1, 0.12, 0.1], color: WOOD_DARK });
    b.add(box, { position: [0.5, 0.4, 0], scale: [1, 0.12, 0.1], color: WOOD_DARK });
    b.add(box, { position: [0.85, 1.0, 0.07], scale: [0.06, 0.06, 0.06], color: 0x3a3a3a }); // pomo
    return b.build();
  },
  WINDOW() {
    const b = new PartsBuilder();
    planks(b, -1, 1, 0, 1.0, 0.2, 3);
    planks(b, -1, 1, 1.8, H, 0.2, 2);
    planks(b, -1, -0.5, 1.0, 1.8, 0.2, 3);
    planks(b, 0.5, 1, 1.0, 1.8, 0.2, 3);
    b.add(box, { position: [0, 1.4, 0], scale: [0.06, 0.8, 0.08], color: WOOD_DARK }); // parteluz
    b.add(box, { position: [0, 1.4, 0], scale: [1, 0.06, 0.08], color: WOOD_DARK });
    b.add(box, { position: [0, 0.98, 0.08], scale: [1.1, 0.06, 0.2], color: WOOD_DARK }); // alféizar
    b.add(box, { position: [-0.95, H / 2, 0], scale: [0.1, H, 0.24], color: WOOD_DARK });
    b.add(box, { position: [0.95, H / 2, 0], scale: [0.1, H, 0.24], color: WOOD_DARK });
    return b.build();
  },
  FENCE() {
    const b = new PartsBuilder();
    for (const x of [-0.95, 0, 0.95]) b.add(box, { position: [x, 0.55, 0], scale: [0.12, 1.1, 0.12], color: WOOD_DARK });
    b.add(box, { position: [0, 0.85, 0], scale: [2, 0.1, 0.06], color: WOOD });
    b.add(box, { position: [0, 0.45, 0], scale: [2, 0.1, 0.06], color: WOOD_ALT });
    return b.build();
  },
  PILLAR() {
    const b = new PartsBuilder();
    b.add(box, { position: [0, H / 2, 0], scale: [0.3, H, 0.3], color: WOOD_DARK });
    b.add(box, { position: [0, H - 0.1, 0], scale: [0.38, 0.2, 0.38], color: WOOD });
    b.add(box, { position: [0, 0.1, 0], scale: [0.38, 0.2, 0.38], color: WOOD });
    return b.build();
  },
  STAIRS() {
    const b = new PartsBuilder();
    const steps = 8;
    const rise = H + 0.2;
    for (let i = 0; i < steps; i++) {
      const h = (rise * (i + 1)) / steps;
      b.add(box, {
        position: [0, h / 2, 1 - (2 / steps) * (i + 0.5)],
        scale: [1.8, h, 2 / steps],
        color: i % 2 ? WOOD_ALT : WOOD,
      });
    }
    return b.build();
  },
  ROOF() {
    const b = new PartsBuilder();
    const slope = Math.atan2(1.2, 2);
    const len = Math.hypot(2, 1.2) + 0.05;
    for (let i = 0; i < 4; i++) {
      b.add(box, {
        position: [-0.75 + i * 0.5, 0.75, 0],
        rotation: [slope, 0, 0],
        scale: [0.49, 0.14, len],
        color: i % 2 ? ROOF_ALT : ROOF,
      });
    }
    return b.build();
  },
  BED() {
    const b = new PartsBuilder();
    b.add(box, { position: [0, 0.2, 0], scale: [1.0, 0.14, 2.0], color: WOOD });
    for (const [x, z] of [[-0.44, -0.94], [0.44, -0.94], [-0.44, 0.94], [0.44, 0.94]]) {
      b.add(box, { position: [x, 0.1, z], scale: [0.1, 0.2, 0.1], color: WOOD_DARK });
    }
    b.add(box, { position: [0, 0.45, -0.97], scale: [1.0, 0.55, 0.08], color: WOOD_DARK });
    b.add(box, { position: [0, 0.35, 0.02], scale: [0.92, 0.18, 1.88], color: WOOL });
    b.add(box, { position: [0, 0.48, -0.68], scale: [0.7, 0.12, 0.32], color: 0xffffff });
    b.add(box, { position: [0, 0.46, 0.36], scale: [0.96, 0.06, 1.15], color: BLANKET });
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
