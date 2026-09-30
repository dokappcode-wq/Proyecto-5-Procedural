import * as THREE from 'three';
import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';

/**
 * Vaca — da carne y CUERO (cuero → armadura de cuero / odre).
 * Grande, tranquila: pasta mucho tiempo y solo huye si te acercas mucho.
 */
export class Cow extends Animal {
  static SPECIES = 'COW';

  static buildModel(C) {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const b = new PartsBuilder()
      .add(box, { position: [0, 1.05, 0], scale: [0.72, 0.68, 1.45], color: C.BODY })
      // Manchas (ligeramente salientes)
      .add(box, { position: [0.362, 1.12, 0.2], scale: [0.02, 0.36, 0.5], color: C.BELLY })
      .add(box, { position: [-0.362, 1.0, -0.3], scale: [0.02, 0.4, 0.42], color: C.BELLY })
      .add(box, { position: [0.1, 1.392, -0.25], scale: [0.4, 0.02, 0.45], color: C.BELLY })
      // Cabeza, hocico, cuernos, orejas
      .add(box, { position: [0, 1.22, 0.9], scale: [0.4, 0.4, 0.46], color: C.BODY })
      .add(box, { position: [0, 1.1, 1.14], scale: [0.34, 0.2, 0.08], color: 0xd9a39a })
      .add(box, { position: [-0.24, 1.44, 0.86], rotation: [0, 0, 0.6], scale: [0.2, 0.06, 0.06], color: 0xe6dccb })
      .add(box, { position: [0.24, 1.44, 0.86], rotation: [0, 0, -0.6], scale: [0.2, 0.06, 0.06], color: 0xe6dccb })
      .add(box, { position: [-0.27, 1.3, 0.82], scale: [0.14, 0.08, 0.1], color: C.BELLY })
      .add(box, { position: [0.27, 1.3, 0.82], scale: [0.14, 0.08, 0.1], color: C.BELLY })
      // Ubre y cola
      .add(box, { position: [0, 0.68, -0.3], scale: [0.26, 0.12, 0.26], color: 0xe8b4b0 })
      .add(box, { position: [0, 1.0, -0.75], rotation: [0.25, 0, 0], scale: [0.06, 0.5, 0.06], color: C.BODY })
      .add(box, { position: [0, 0.74, -0.82], scale: [0.1, 0.12, 0.1], color: C.DARK });
    const leg = new PartsBuilder()
      .add(box, { position: [0, -0.3, 0], scale: [0.17, 0.6, 0.17], color: C.BODY })
      .add(box, { position: [0, -0.66, 0], scale: [0.18, 0.12, 0.19], color: C.DARK })
      .build();
    const hips = [
      [-0.24, 0.72, 0.5],
      [0.24, 0.72, 0.5],
      [-0.24, 0.72, -0.5],
      [0.24, 0.72, -0.5],
    ];
    return { body: b.build(), leg, hips };
  }

  _idleTime() {
    return this.rng.range(4, 10);
  }
}
