import { hashString, deriveSeed } from '../core/SeededRandom.js';

/**
 * WorldSeed — seed del mundo y sus sub-seeds.
 *
 *   World Seed
 *   ├── terrain     relieve
 *   ├── biome       distribución de biomas         (Fase 3)
 *   ├── resource    recursos, árboles, agua        (Fase 4)
 *   ├── animal      animales                       (Fase 4)
 *   ├── celestial   lunas                          (Fase 12)
 *   └── spawn       posición inicial
 *
 * Cada sistema usa SOLO su sub-seed: así, añadir un árbol más no cambia el
 * relieve, y retocar el terreno no mueve a los animales de otra seed.
 * La seed puede ser cualquier texto ("mundo0", "12345"...).
 */
export class WorldSeed {
  constructor(input, subSeedNames) {
    this.text = String(input ?? '').trim() || '0';
    this.value = hashString(this.text);
    const sub = {};
    for (const name of subSeedNames) sub[name] = deriveSeed(this.value, name);
    this.sub = Object.freeze(sub);
  }

  /** Sub-seed para un nombre no previsto (extensiones futuras). */
  derive(name) {
    return this.sub[name] ?? deriveSeed(this.value, name);
  }

  /** Genera un texto de seed nuevo (fuera de la generación: aquí sí vale azar real). */
  static randomText() {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0].toString(36);
  }
}
