import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { G, limb } from './AnimalParts.js';

/**
 * Cabra — da carne y LANA (lana → cama → dormir → energía).
 * Pequeña, lanuda, con cuernos y barba; algo nerviosa.
 */
export class Goat extends Animal {
  static SPECIES = 'GOAT';

  static buildModel(C) {
    // Lana: cuerpo con varios mechones redondos encima.
    const b = new PartsBuilder().add(G.ball, { position: [0, 0.72, 0], scale: [0.24, 0.21, 0.38], color: C.BODY });
    for (const [x, y, z, s] of [[-0.12, 0.8, 0.14, 0.16], [0.12, 0.8, 0.14, 0.16], [-0.12, 0.8, -0.16, 0.16], [0.12, 0.8, -0.16, 0.16], [0, 0.88, 0, 0.17], [0, 0.78, 0.26, 0.15], [0, 0.8, -0.27, 0.15], [-0.15, 0.68, 0, 0.13], [0.15, 0.68, 0, 0.13]]) {
      b.add(G.ball, { position: [x, y, z], scale: [s, s * 0.9, s], color: C.BELLY });
    }
    b.add(G.ball, { position: [0, 0.86, 0.33], scale: [0.08, 0.09, 0.09], color: C.BODY });
    const hb = new PartsBuilder();
    limb(hb, [0, -0.02, 0], [0, 0.18, 0.08], 0.06, C.BODY);
    hb.add(G.ball, { position: [0, 0.24, 0.16], rotation: [0.4, 0, 0], scale: [0.08, 0.09, 0.13], color: C.BODY })
      .add(G.ball, { position: [0, 0.2, 0.27], scale: [0.05, 0.05, 0.05], color: C.DARK })
      .add(G.cone, { position: [0, 0.11, 0.23], rotation: [Math.PI, 0, 0], scale: [0.035, 0.12, 0.03], color: C.BELLY }) // barba
      .add(G.ball, { position: [-0.06, 0.28, 0.22], scale: [0.015, 0.018, 0.012], color: 0x1a1410 })
      .add(G.ball, { position: [0.06, 0.28, 0.22], scale: [0.015, 0.018, 0.012], color: 0x1a1410 });
    for (const s of [-1, 1]) {
      hb.add(G.ball, { position: [s * 0.11, 0.26, 0.1], rotation: [0, 0, s * 0.4], scale: [0.07, 0.025, 0.035], color: C.BODY });
      // Cuernos curvados hacia atrás.
      limb(hb, [s * 0.035, 0.31, 0.12], [s * 0.06, 0.42, 0.04], 0.02, C.DARK, G.taper);
      limb(hb, [s * 0.06, 0.42, 0.04], [s * 0.08, 0.43, -0.07], 0.015, C.DARK, G.taper);
    }
    const tail = new PartsBuilder().add(G.ball, { position: [0, 0.03, -0.01], rotation: [-0.5, 0, 0], scale: [0.035, 0.06, 0.03], color: C.BELLY }).build();
    const lb = new PartsBuilder();
    lb.add(G.ball, { position: [0, -0.04, 0], scale: [0.07, 0.1, 0.08], color: C.BELLY });
    limb(lb, [0, 0, 0], [0, -0.26, 0], 0.045, C.BODY, G.taper);
    const sb = new PartsBuilder();
    limb(sb, [0, 0.02, 0], [0, -0.23, 0], 0.028, C.BODY, G.taper);
    sb.add(G.ball, { position: [0, -0.245, 0.01], scale: [0.035, 0.03, 0.045], color: C.DARK });
    const hips = [
      [-0.13, 0.52, 0.25],
      [0.13, 0.52, 0.25],
      [-0.13, 0.52, -0.26],
      [0.13, 0.52, -0.26],
    ];
    return { body: b.build(), head: hb.build(), tail, leg: lb.build(), shin: sb.build(), hips, thigh: 0.26, neck: [0, 0.88, 0.36], tailAt: [0, 0.86, -0.4] };
  }
}
