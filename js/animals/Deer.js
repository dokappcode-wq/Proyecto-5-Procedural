import * as THREE from 'three';
import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Ciervo — el "animal de pradera" (plantilla "deer"). Da carne.
 * Esbelto y asustadizo: se alerta y huye desde lejos (valores en config).
 */
export class Deer extends Animal {
  static SPECIES = 'DEER';

  /** Modelo: frente hacia +Z; patas aparte (se animan). */
  static buildModel(C) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const body = new PartsBuilder()
      .add(box, { position: [0, 1.02, 0], scale: [0.46, 0.46, 1.05], color: C.BODY })
      .add(box, { position: [0, 0.86, 0], scale: [0.4, 0.16, 0.9], color: C.BELLY })
      .add(box, { position: [0, 1.3, 0.52], rotation: [-0.55, 0, 0], scale: [0.2, 0.5, 0.22], color: C.BODY })
      .add(box, { position: [0, 1.56, 0.7], scale: [0.22, 0.24, 0.4], color: C.BODY })
      .add(box, { position: [0, 1.52, 0.92], scale: [0.14, 0.14, 0.08], color: C.DARK })
      .add(box, { position: [-0.14, 1.72, 0.6], rotation: [0, 0, 0.5], scale: [0.06, 0.16, 0.1], color: C.BODY })
      .add(box, { position: [0.14, 1.72, 0.6], rotation: [0, 0, -0.5], scale: [0.06, 0.16, 0.1], color: C.BODY })
      .add(box, { position: [0, 1.12, -0.55], rotation: [0.5, 0, 0], scale: [0.12, 0.16, 0.08], color: C.BELLY })
      .build();
    const leg = new PartsBuilder()
      .add(box, { position: [0, -0.34, 0], scale: [0.1, 0.68, 0.1], color: C.BODY })
      .add(box, { position: [0, -0.74, 0], scale: [0.11, 0.1, 0.12], color: C.DARK })
      .build();
    const hips = [
      [-0.15, 0.8, 0.36],
      [0.15, 0.8, 0.36],
      [-0.15, 0.8, -0.38],
      [0.15, 0.8, -0.38],
    ];
    return { body, leg, hips };
  }

  _idleTime() {
    return this.rng.range(1.5, 5);
  }
}
