import { Animal } from './Animal.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { G, limb } from './AnimalParts.js';

/**
 * Gallina (P4) — pequeña, de dos patas. Da carne y plumas; domesticada pone huevos.
 * Picotea a menudo (pastar = cabeza al suelo) y anda a saltitos cortos.
 */
export class Chicken extends Animal {
  static SPECIES = 'CHICKEN';

  static buildModel(C) {
    const LEG = 0xe8a23a;
    // Cuerpo redondo, pecho, alas pegadas y cola de plumas levantada.
    const b = new PartsBuilder()
      .add(G.ball, { position: [0, 0.3, 0], scale: [0.15, 0.14, 0.2], color: C.BODY })
      .add(G.ball, { position: [0, 0.29, 0.1], scale: [0.12, 0.12, 0.12], color: C.BELLY });
    for (const s of [-1, 1]) b.add(G.ball, { position: [s * 0.13, 0.31, -0.02], rotation: [0.2, 0, s * 0.2], scale: [0.04, 0.09, 0.15], color: C.BELLY });
    for (const [x, r] of [[-0.04, -0.3], [0, 0], [0.04, 0.3]]) {
      b.add(G.ball, { position: [x, 0.4, -0.2], rotation: [-0.9, r * 0.4, r], scale: [0.03, 0.12, 0.05], color: C.BODY });
    }
    // Cabeza: cresta y barbillas rojas, pico amarillo y ojos.
    const hb = new PartsBuilder()
      .add(G.ball, { position: [0, 0.07, 0.02], scale: [0.065, 0.075, 0.07], color: C.BODY })
      .add(G.cone, { position: [0, 0.06, 0.1], rotation: [Math.PI / 2, 0, 0], scale: [0.022, 0.05, 0.018], color: LEG });
    for (let i = 0; i < 3; i++) hb.add(G.ball, { position: [0, 0.14 + (i === 1 ? 0.01 : 0), -0.01 + i * 0.03], scale: [0.012, 0.03, 0.02], color: C.DARK });
    hb.add(G.ball, { position: [0, 0.02, 0.08], scale: [0.014, 0.025, 0.012], color: C.DARK });
    for (const s of [-1, 1]) hb.add(G.ball, { position: [s * 0.05, 0.09, 0.05], scale: [0.011, 0.012, 0.01], color: 0x1a1410 });
    // Pata: muslo emplumado y caña amarilla con dedos.
    const lb = new PartsBuilder();
    lb.add(G.ball, { position: [0, -0.02, 0], scale: [0.05, 0.06, 0.05], color: C.BELLY });
    limb(lb, [0, -0.02, 0], [0, -0.09, 0], 0.012, LEG);
    const sb = new PartsBuilder();
    limb(sb, [0, 0, 0], [0, -0.1, 0.01], 0.01, LEG);
    for (const a of [-0.5, 0, 0.5]) limb(sb, [0, -0.1, 0.01], [Math.sin(a) * 0.04, -0.105, 0.01 + Math.cos(a) * 0.04], 0.006, LEG);
    return {
      body: b.build(), head: hb.build(), leg: lb.build(), shin: sb.build(),
      hips: [[-0.06, 0.2, 0], [0.06, 0.2, 0]], thigh: 0.09, neck: [0, 0.4, 0.14],
    };
  }

  /** Picotea a ratos cortos. */
  _idleTime() {
    return this.rng.range(1, 3.5);
  }
}
