import * as THREE from 'three';
import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Cabra — da carne y LANA (lana → cama → dormir → energía).
 * Pequeña, lanuda, con cuernos y barba; algo nerviosa.
 */
export class Goat extends Animal {
  static SPECIES = 'GOAT';

  static buildModel(C) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const body = new PartsBuilder()
      // Lana: cuerpo más ancho y "mullido" (dos cajas superpuestas)
      .add(box, { position: [0, 0.72, 0], scale: [0.5, 0.44, 0.78], color: C.BODY })
      .add(box, { position: [0, 0.78, -0.05], scale: [0.54, 0.34, 0.66], color: C.BELLY })
      .add(box, { position: [0, 0.98, 0.42], rotation: [-0.4, 0, 0], scale: [0.18, 0.3, 0.2], color: C.BODY })
      .add(box, { position: [0, 1.1, 0.56], scale: [0.2, 0.22, 0.3], color: C.BODY })
      .add(box, { position: [0, 1.05, 0.72], scale: [0.14, 0.13, 0.06], color: C.DARK })
      .add(box, { position: [0, 0.94, 0.62], scale: [0.06, 0.14, 0.06], color: C.BELLY }) // barba
      .add(box, { position: [-0.07, 1.27, 0.48], rotation: [-0.7, 0, 0.15], scale: [0.05, 0.2, 0.05], color: C.DARK })
      .add(box, { position: [0.07, 1.27, 0.48], rotation: [-0.7, 0, -0.15], scale: [0.05, 0.2, 0.05], color: C.DARK })
      .add(box, { position: [0, 0.86, -0.42], rotation: [0.6, 0, 0], scale: [0.08, 0.14, 0.06], color: C.BODY })
      .build();
    const leg = new PartsBuilder()
      .add(box, { position: [0, -0.22, 0], scale: [0.09, 0.44, 0.09], color: C.BELLY })
      .add(box, { position: [0, -0.48, 0], scale: [0.1, 0.08, 0.11], color: C.DARK })
      .build();
    const hips = [
      [-0.14, 0.52, 0.26],
      [0.14, 0.52, 0.26],
      [-0.14, 0.52, -0.27],
      [0.14, 0.52, -0.27],
    ];
    return { body, leg, hips };
  }
}
