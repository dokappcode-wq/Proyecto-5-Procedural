import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { G, limb } from './AnimalParts.js';

/**
 * Ciervo — el "animal de pradera" (plantilla "deer"). Da carne.
 * Esbelto y asustadizo: se alerta y huye desde lejos (valores en config).
 */
export class Deer extends Animal {
  static SPECIES = 'DEER';

  /**
   * Modelo: frente hacia +Z. Cuerpo, cabeza con cuello (pivote `neck`), cola y patas
   * de dos piezas (muslo y caña con pezuña), que se animan aparte.
   */
  static buildModel(C) {
    const ANTLER = 0xd8c8a8;
    const body = new PartsBuilder()
      .add(G.ball, { position: [0, 1.03, 0], scale: [0.24, 0.25, 0.5], color: C.BODY })
      .add(G.ball, { position: [0, 1.07, 0.32], scale: [0.23, 0.27, 0.24], color: C.BODY })
      .add(G.ball, { position: [0, 1.06, -0.36], scale: [0.22, 0.24, 0.2], color: C.BODY })
      .add(G.ball, { position: [0, 0.93, 0.02], scale: [0.19, 0.12, 0.42], color: C.BELLY })
      .add(G.ball, { position: [0, 1.07, -0.53], scale: [0.13, 0.14, 0.04], color: C.BELLY })
      .add(G.ball, { position: [0, 1.17, 0.42], scale: [0.11, 0.12, 0.12], color: C.BODY }) // base del cuello
      .build();
    const hb = new PartsBuilder();
    limb(hb, [0, -0.04, 0], [0, 0.36, 0.14], 0.085, C.BODY);
    hb.add(G.ball, { position: [0, 0.42, 0.2], rotation: [0.3, 0, 0], scale: [0.1, 0.11, 0.17], color: C.BODY })
      .add(G.ball, { position: [0, 0.37, 0.33], scale: [0.065, 0.065, 0.08], color: C.BELLY })
      .add(G.ball, { position: [0, 0.385, 0.4], scale: [0.03, 0.025, 0.02], color: C.DARK })
      .add(G.ball, { position: [-0.075, 0.45, 0.27], scale: [0.018, 0.022, 0.015], color: 0x1a1410 })
      .add(G.ball, { position: [0.075, 0.45, 0.27], scale: [0.018, 0.022, 0.015], color: 0x1a1410 })
      .add(G.cone, { position: [-0.1, 0.52, 0.14], rotation: [0, 0, 0.9], scale: [0.04, 0.13, 0.02], color: C.BODY })
      .add(G.cone, { position: [0.1, 0.52, 0.14], rotation: [0, 0, -0.9], scale: [0.04, 0.13, 0.02], color: C.BODY });
    for (const s of [-1, 1]) {
      // Cuernas: un tallo que sube y se abre, con dos puntas.
      limb(hb, [s * 0.04, 0.5, 0.16], [s * 0.13, 0.75, 0.1], 0.014, ANTLER);
      limb(hb, [s * 0.13, 0.75, 0.1], [s * 0.2, 0.92, 0.04], 0.012, ANTLER);
      limb(hb, [s * 0.1, 0.68, 0.11], [s * 0.08, 0.83, 0.2], 0.01, ANTLER);
      limb(hb, [s * 0.16, 0.84, 0.07], [s * 0.13, 0.95, 0.14], 0.009, ANTLER);
    }
    const tail = new PartsBuilder().add(G.ball, { position: [0, -0.07, 0], scale: [0.05, 0.09, 0.04], color: C.BELLY }).build();
    const lb = new PartsBuilder();
    lb.add(G.ball, { position: [0, -0.08, 0], scale: [0.085, 0.13, 0.1], color: C.BODY });
    limb(lb, [0, 0, 0], [0, -0.4, 0], 0.06, C.BODY, G.taper);
    const sb = new PartsBuilder();
    limb(sb, [0, 0.02, 0], [0, -0.35, 0], 0.033, C.BODY, G.taper);
    sb.add(G.ball, { position: [0, -0.37, 0.01], scale: [0.04, 0.035, 0.05], color: C.DARK });
    const hips = [
      [-0.13, 0.8, 0.33],
      [0.13, 0.8, 0.33],
      [-0.13, 0.8, -0.35],
      [0.13, 0.8, -0.35],
    ];
    return { body, head: hb.build(), tail, leg: lb.build(), shin: sb.build(), hips, thigh: 0.4, neck: [0, 1.18, 0.42], tailAt: [0, 1.13, -0.54] };
  }

  _idleTime() {
    return this.rng.range(1.5, 5);
  }
}
