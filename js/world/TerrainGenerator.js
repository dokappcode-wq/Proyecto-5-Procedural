import { SimplexNoise } from './noise/SimplexNoise.js';
import { deriveSeed } from '../core/SeededRandom.js';
import { smoothstep } from '../core/MathUtils.js';

/**
 * TerrainGenerator — función de altura determinista h(x, z).
 *
 * No depende de Three.js ni del render: solo matemáticas + seed. Esto permite
 * probarlo aislado y, en el futuro, moverlo a un Web Worker.
 *
 * Capas (parámetros en el perfil del planeta, GameConfig.PLANETS.*.TERRAIN):
 *   1. Continente: ondulación muy suave a gran escala.
 *   2. Colinas: relieve medio.
 *   3. Montañas: ruido "ridged" limitado por una máscara de regiones
 *      montañosas. `mountain` (0..1) se expone para que BiomeSystem (Fase 3)
 *      pueda situar las Montañas Heladas donde realmente hay montañas.
 *   4. Detalle fino.
 *   Las colinas y el detalle se escalan según los pesos de bioma que devuelve
 *   BiomeSystem (explanada más llana, bosque más ondulado).
 *   5. Costa: el terreno desciende hacia el fondo marino en el borde del
 *      mundo finito (línea de costa irregular). Las montañas se atenúan
 *      antes de llegar a la costa para que el borde sea siempre tierra baja.
 *   6. Charcas: si hay WaterSystem, excava las fuentes de agua.
 */
export class TerrainGenerator {
  constructor({ profile, biomes, seed, worldSize, edgeMargin }) {
    this._p = profile;
    this._biomes = biomes;
    this._hillScale = {};
    this._detailScale = {};
    for (const id of biomes.ids) {
      this._hillScale[id] = biomes.get(id).HILL_SCALE;
      this._detailScale[id] = biomes.get(id).DETAIL_SCALE;
    }
    this._half = worldSize / 2;
    this._edgeMargin = edgeMargin;

    // Un ruido independiente por capa, cada uno con su propia sub-seed.
    this._continent = new SimplexNoise(deriveSeed(seed, 'continent'));
    this._hills = new SimplexNoise(deriveSeed(seed, 'hills'));
    this._mountainMask = new SimplexNoise(deriveSeed(seed, 'mountainMask'));
    this._mountains = new SimplexNoise(deriveSeed(seed, 'mountains'));
    this._detail = new SimplexNoise(deriveSeed(seed, 'detail'));
    this._coast = new SimplexNoise(deriveSeed(seed, 'coast'));

    this._sample = { height: 0, mountain: 0, coast: 0, biomes: {} };
    this._water = null;
  }

  /**
   * Activa la excavación de charcas (WaterSystem.carve). Se llama después de
   * elegir las charcas, que a su vez se eligen sobre el terreno sin excavar.
   */
  setWater(water) {
    this._water = water;
  }

  heightAt(x, z) {
    return this.sample(x, z).height;
  }

  /**
   * Evalúa todas las capas en (x, z): { height, mountain, coast, biomes }.
   * Devuelve un objeto REUTILIZADO (copiar los valores si se necesitan guardar).
   */
  sample(x, z) {
    const p = this._p;

    const continent = this._continent.fbm(x, z, { frequency: p.CONTINENT_FREQUENCY, octaves: 3 });
    const hills = this._hills.fbm(x, z, { frequency: p.HILL_FREQUENCY, octaves: 4 });
    const detail = this._detail.noise2D(x * p.DETAIL_FREQUENCY, z * p.DETAIL_FREQUENCY);

    // Distancia al borde (mundo cuadrado) con línea de costa irregular.
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));
    const coastNoise = this._coast.noise2D(x * p.COAST_NOISE_FREQUENCY, z * p.COAST_NOISE_FREQUENCY);
    const coastStart = this._half - this._edgeMargin + coastNoise * p.COAST_NOISE_AMPLITUDE;
    const coastEnd = this._half - p.COAST_SEA_WIDTH;
    const coast = smoothstep(coastStart, coastEnd, edgeDist);
    // Tierra adentro de la costa las montañas se atenúan: el borde es siempre tierra baja.
    const inland = 1 - smoothstep(coastStart - p.MOUNTAIN_COAST_FADE, coastStart, edgeDist);

    const maskRaw = this._mountainMask.fbm(x, z, { frequency: p.MOUNTAIN_MASK_FREQUENCY, octaves: 2 });
    const mountain = smoothstep(p.MOUNTAIN_MASK_START, p.MOUNTAIN_MASK_END, maskRaw) * inland;
    let mountainHeight = 0;
    if (mountain > 0) {
      const ridges = this._mountains.ridged(x, z, { frequency: p.MOUNTAIN_FREQUENCY, octaves: p.MOUNTAIN_OCTAVES });
      mountainHeight = mountain * (p.MOUNTAIN_BASE_LIFT + ridges * p.MOUNTAIN_HEIGHT);
    }

    // Relieve modulado por bioma.
    const w = this._biomes.weightsAt(x, z, mountain, this._sample.biomes);
    let hillScale = 0;
    let detailScale = 0;
    for (const id in w) {
      hillScale += w[id] * this._hillScale[id];
      detailScale += w[id] * this._detailScale[id];
    }

    let height =
      p.BASE_HEIGHT +
      continent * p.CONTINENT_AMPLITUDE +
      hills * p.HILL_AMPLITUDE * hillScale * (1 - 0.5 * mountain) +
      detail * p.DETAIL_AMPLITUDE * detailScale +
      mountainHeight;

    // Costa: el terreno desciende hacia el fondo marino.
    height += (p.SEA_FLOOR - height) * coast;
    if (this._water) height = this._water.carve(x, z, height);

    const s = this._sample;
    s.height = height;
    s.mountain = mountain;
    s.coast = coast;
    return s;
  }
}
