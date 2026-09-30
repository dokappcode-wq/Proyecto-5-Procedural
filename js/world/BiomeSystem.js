import { SimplexNoise } from './noise/SimplexNoise.js';
import { smoothstep } from '../core/MathUtils.js';

export const BiomeId = Object.freeze({
  PLAINS: 'PLAINS',
  FOREST: 'FOREST',
  FROZEN_MOUNTAINS: 'FROZEN_MOUNTAINS',
});

/**
 * BiomeSystem — decide qué bioma hay en cada punto. Sin Three.js.
 *
 * Cada punto tiene PESOS por bioma (suman 1) en lugar de un único bioma, lo
 * que permite transiciones suaves de relieve y color. El bioma "dominante"
 * es el de mayor peso.
 *
 *   - Montañas Heladas: siguen al relieve (factor montaña del terreno), de
 *     modo que el bioma coincide con las montañas reales.
 *   - Bosque / Explanada: se reparten con ruido de la sub-seed "biome".
 *
 * Los datos de cada bioma (nombre, temperatura, relieve, colores) están en
 * GameConfig.PLANETS.<planeta>.BIOMES. Añadir un bioma = añadir su definición
 * y su regla de peso aquí.
 */
export class BiomeSystem {
  constructor({ definitions, distribution, seed }) {
    this._defs = definitions;
    this._dist = distribution;
    this._forestNoise = new SimplexNoise(seed);
    this.ids = Object.keys(definitions);
  }

  get(id) {
    return this._defs[id];
  }

  /**
   * @param {number} mountainFactor factor montaña del terreno (0..1)
   * @param {object} out objeto a rellenar { PLAINS, FOREST, FROZEN_MOUNTAINS }
   */
  weightsAt(x, z, mountainFactor, out = {}) {
    const d = this._dist;
    const mountain = smoothstep(d.MOUNTAIN_BIOME_START, d.MOUNTAIN_BIOME_END, mountainFactor);
    const n = this._forestNoise.fbm(x, z, { frequency: d.FOREST_FREQUENCY, octaves: 3 });
    const forest = smoothstep(d.FOREST_THRESHOLD - d.FOREST_BLEND, d.FOREST_THRESHOLD + d.FOREST_BLEND, n) * (1 - mountain);
    out.FROZEN_MOUNTAINS = mountain;
    out.FOREST = forest;
    out.PLAINS = Math.max(0, 1 - mountain - forest);
    return out;
  }

  dominant(weights) {
    let best = this.ids[0];
    for (const id of this.ids) if (weights[id] > weights[best]) best = id;
    return best;
  }

  /** Mezcla ponderada de una propiedad numérica de los biomas (p. ej. TEMPERATURE). */
  blend(weights, property) {
    let v = 0;
    for (const id of this.ids) v += (weights[id] ?? 0) * this._defs[id][property];
    return v;
  }

  /** Descripción completa para gameplay y depuración. */
  describe(weights) {
    const id = this.dominant(weights);
    return {
      id,
      name: this._defs[id].NAME,
      weights: { ...weights },
      temperature: this.blend(weights, 'TEMPERATURE'),
    };
  }
}
