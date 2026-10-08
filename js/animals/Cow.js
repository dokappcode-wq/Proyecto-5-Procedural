import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { G, limb } from './AnimalParts.js';

/**
 * Vaca — da carne y CUERO (cuero → armadura de cuero / odre).
 * Grande, tranquila: pasta mucho tiempo y solo huye si te acercas mucho.
 */
export class Cow extends Animal {
  static SPECIES = 'COW';

  static buildModel(C) {
    const PINK = 0xd9a39a;
    const HORN = 0xe6dccb;
    const b = new PartsBuilder()
      .add(G.ball, { position: [0, 1.06, 0], scale: [0.38, 0.36, 0.72], color: C.BODY })
      .add(G.ball, { position: [0, 1.02, 0.5], scale: [0.33, 0.33, 0.3], color: C.BODY })
      .add(G.ball, { position: [0, 1.1, -0.5], scale: [0.35, 0.33, 0.28], color: C.BODY })
      // Manchas (asoman un poco).
      .add(G.ball, { position: [0.34, 1.12, 0.15], scale: [0.06, 0.22, 0.3], color: C.BELLY })
      .add(G.ball, { position: [-0.35, 1.0, -0.25], scale: [0.06, 0.25, 0.28], color: C.BELLY })
      .add(G.ball, { position: [0.05, 1.4, -0.2], scale: [0.2, 0.04, 0.25], color: C.BELLY })
      // Ubre.
      .add(G.ball, { position: [0, 0.73, -0.32], scale: [0.14, 0.08, 0.14], color: 0xe8b4b0 })
      .build();
    const hb = new PartsBuilder();
    limb(hb, [0, -0.05, -0.05], [0, 0.02, 0.22], 0.17, C.BODY);
    hb.add(G.ball, { position: [0, 0.02, 0.32], scale: [0.19, 0.19, 0.24], color: C.BODY })
      .add(G.ball, { position: [0, 0.11, 0.42], scale: [0.12, 0.05, 0.08], color: C.BELLY }) // frente
      .add(G.ball, { position: [0, -0.08, 0.52], scale: [0.15, 0.1, 0.08], color: PINK })
      .add(G.ball, { position: [-0.05, -0.07, 0.59], scale: [0.02, 0.02, 0.01], color: C.DARK })
      .add(G.ball, { position: [0.05, -0.07, 0.59], scale: [0.02, 0.02, 0.01], color: C.DARK })
      .add(G.ball, { position: [-0.13, 0.07, 0.48], scale: [0.025, 0.03, 0.02], color: 0x1a1410 })
      .add(G.ball, { position: [0.13, 0.07, 0.48], scale: [0.025, 0.03, 0.02], color: 0x1a1410 });
    for (const s of [-1, 1]) {
      hb.add(G.ball, { position: [s * 0.24, 0.06, 0.25], rotation: [0, 0, s * 0.3], scale: [0.11, 0.05, 0.07], color: C.BELLY });
      limb(hb, [s * 0.12, 0.15, 0.3], [s * 0.3, 0.24, 0.33], 0.035, HORN, G.taper);
    }
    const tb = new PartsBuilder();
    limb(tb, [0, 0, 0], [0, -0.5, 0], 0.025, C.BODY);
    tb.add(G.ball, { position: [0, -0.53, 0], scale: [0.05, 0.08, 0.05], color: C.DARK });
    const lb = new PartsBuilder();
    lb.add(G.ball, { position: [0, -0.06, 0], scale: [0.13, 0.15, 0.15], color: C.BODY });
    limb(lb, [0, 0, 0], [0, -0.36, 0], 0.1, C.BODY, G.taper);
    const sb = new PartsBuilder();
    limb(sb, [0, 0.02, 0], [0, -0.3, 0], 0.065, C.BODY, G.taper);
    sb.add(G.cyl, { position: [0, -0.32, 0.01], scale: [0.08, 0.06, 0.09], color: C.DARK });
    const hips = [
      [-0.22, 0.72, 0.48],
      [0.22, 0.72, 0.48],
      [-0.22, 0.72, -0.48],
      [0.22, 0.72, -0.48],
    ];
    return { body: b, head: hb.build(), tail: tb.build(), leg: lb.build(), shin: sb.build(), hips, thigh: 0.36, neck: [0, 1.2, 0.68], tailAt: [0, 1.28, -0.74] };
  }

  _idleTime() {
    return this.rng.range(4, 10);
  }
}
