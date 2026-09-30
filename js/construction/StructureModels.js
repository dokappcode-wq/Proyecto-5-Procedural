import * as THREE from 'three';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Modelos low-poly de las construcciones. Frente (lado abierto / pies de la
 * cama) hacia +Z local; el jugador coloca la construcción mirando hacia -Z,
 * de modo que el lado abierto queda hacia él.
 *
 * Añadir una construcción = añadir su constructor aquí + su entrada en
 * GameConfig.STRUCTURES (+ objeto y receta si se fabrica).
 */
const WOOD = 0x8a5f3a;
const WOOD_DARK = 0x6b4a2f;
const WOOL = 0xf1ece0;
const BLANKET = 0x9c3d34;
const THATCH = 0xb89a5a;

const box = new THREE.BoxGeometry(1, 1, 1);

export const STRUCTURE_MODELS = {
  BED() {
    const b = new PartsBuilder();
    // Estructura y patas
    b.add(box, { position: [0, 0.2, 0], scale: [1.05, 0.14, 2.1], color: WOOD });
    for (const [x, z] of [[-0.46, -0.98], [0.46, -0.98], [-0.46, 0.98], [0.46, 0.98]]) {
      b.add(box, { position: [x, 0.1, z], scale: [0.1, 0.2, 0.1], color: WOOD_DARK });
    }
    b.add(box, { position: [0, 0.45, -1.02], scale: [1.05, 0.55, 0.08], color: WOOD_DARK }); // cabecero
    // Colchón de lana, almohada y manta
    b.add(box, { position: [0, 0.35, 0.02], scale: [0.95, 0.18, 1.95], color: WOOL });
    b.add(box, { position: [0, 0.48, -0.72], scale: [0.72, 0.12, 0.34], color: 0xffffff });
    b.add(box, { position: [0, 0.46, 0.38], scale: [0.99, 0.06, 1.2], color: BLANKET });
    return b.build();
  },

  SHELTER() {
    const b = new PartsBuilder();
    const front = 2.5; // altura de los postes delanteros (lado abierto, +Z)
    const back = 1.7;
    const half = 1.35;
    // Suelo de tablas
    b.add(box, { position: [0, 0.04, 0], scale: [2.9, 0.08, 2.9], color: WOOD });
    // Postes
    for (const [x, z, h] of [[-half, half, front], [half, half, front], [-half, -half, back], [half, -half, back]]) {
      b.add(box, { position: [x, h / 2, z], scale: [0.2, h, 0.2], color: WOOD_DARK });
    }
    // Tejado inclinado (paja)
    const slope = Math.atan2(front - back, half * 2);
    const length = Math.hypot(half * 2, front - back) + 0.5;
    b.add(box, { position: [0, (front + back) / 2 + 0.1, 0], rotation: [slope, 0, 0], scale: [3.3, 0.14, length], color: THATCH });
    // Pared trasera y lateral izquierda (tablas)
    b.add(box, { position: [0, back / 2, -half], scale: [2.7, back - 0.05, 0.1], color: WOOD });
    b.add(box, { position: [-half, 0.75, 0], scale: [0.1, 1.5, 2.6], color: WOOD });
    // Travesaño delantero
    b.add(box, { position: [0, front - 0.1, half], scale: [2.9, 0.14, 0.14], color: WOOD_DARK });
    return b.build();
  },
};

/** Convierte { positions, colors } en BufferGeometry. */
export function toGeometry({ positions, colors }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
