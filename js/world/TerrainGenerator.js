import { SimplexNoise } from './noise/SimplexNoise.js';
import { deriveSeed, hash2D } from '../core/SeededRandom.js';
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
 *   7. Cráteres (opcional, TERRAIN.CRATERS, p. ej. en las lunas): cuencos con
 *      borde elevado, uno como mucho por celda de una rejilla, según la seed.
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
    this._craterSeed = deriveSeed(seed, 'craters');
    // Capas opcionales (solo si el perfil las pide: el Edén no las usa).
    this._islands = p0(profile.ISLANDS) && new SimplexNoise(deriveSeed(seed, 'islands'));
    this._dunes = p0(profile.DUNES) && new SimplexNoise(deriveSeed(seed, 'dunes'));

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

    if (p.CRATERS) height += this._craters(x, z) * (1 - coast);
    if (p.DUNES) height += this._dunesAt(x, z) * (1 - mountain) * (1 - coast);
    if (p.TERRACES) height = terrace(height, p.TERRACES, p.BASE_HEIGHT) * (1 - coast) + height * coast;
    // Islas: el ruido hunde zonas enteras bajo el mar (archipiélagos, mundos oceánicos).
    // Cerca del centro siempre hay tierra (ahí se empieza y aterriza la nave).
    if (p.ISLANDS) {
      const I = p.ISLANDS;
      const n = this._islands.fbm(x, z, { frequency: I.FREQUENCY, octaves: 3 });
      // Sin tierra (NO_LAND): solo mar, con el fondo ondulado.
      const center = I.NO_LAND ? 0 : 1 - smoothstep(I.CENTER_RADIUS * 0.6, I.CENTER_RADIUS, Math.hypot(x, z));
      const land = I.NO_LAND ? 0 : smoothstep(I.THRESHOLD - 0.1, I.THRESHOLD + 0.1, n + center * 0.8);
      const seabed = I.FLOOR + n * (I.SEABED_RELIEF ?? 0);
      height = seabed + (height - seabed) * land;
    }

    // Costa: el terreno desciende hacia el fondo marino.
    height += (p.SEA_FLOOR - height) * coast;
    if (this._water) height = this._water.carve(x, z, height);

    const s = this._sample;
    s.height = height;
    s.mountain = mountain;
    s.coast = coast;
    return s;
  }

  /** Dunas: crestas alargadas en una dirección, deformadas por ruido (lado suave y lado empinado). */
  _dunesAt(x, z) {
    const D = this._p.DUNES;
    const along = x * Math.cos(D.ANGLE) + z * Math.sin(D.ANGLE);
    const warp = this._dunes.noise2D(x / (D.WAVELENGTH * 3), z / (D.WAVELENGTH * 3)) * D.WAVELENGTH * D.WARP;
    const t = ((along + warp) / D.WAVELENGTH) % 1;
    const f = t < 0 ? t + 1 : t;
    const profile = f < 0.75 ? f / 0.75 : (1 - f) / 0.25; // sube despacio, baja de golpe
    const strength = 0.55 + 0.45 * this._dunes.noise2D(x / (D.WAVELENGTH * 7) + 50, z / (D.WAVELENGTH * 7));
    return D.HEIGHT * profile * profile * (3 - 2 * profile) * strength;
  }

  /** Suma de los cráteres de las 3×3 celdas vecinas (cuenco + borde). */
  _craters(x, z) {
    const c = this._p.CRATERS;
    const cx = Math.floor(x / c.CELL);
    const cz = Math.floor(z / c.CELL);
    let dh = 0;
    for (let i = cx - 1; i <= cx + 1; i++) {
      for (let j = cz - 1; j <= cz + 1; j++) {
        const seed = this._craterSeed;
        if (hash2D(seed, i, j) > c.CHANCE) continue;
        const px = (i + hash2D(seed + 1, i, j)) * c.CELL;
        const pz = (j + hash2D(seed + 2, i, j)) * c.CELL;
        const r = c.RADIUS[0] + (c.RADIUS[1] - c.RADIUS[0]) * hash2D(seed + 3, i, j) ** 2;
        const d = Math.hypot(x - px, z - pz) / r;
        // Perfil continuo: cuenco que sube hasta el borde (d = 1) y baja fuera (d = 1.4).
        if (d < 1) dh += r * (-c.DEPTH * (1 - d * d) + c.RIM * d ** 4);
        else if (d < 1.4) dh += r * c.RIM * (1 - (d - 1) / 0.4) ** 2;
      }
    }
    return dh;
  }
}

function p0(v) {
  return v !== undefined && v !== null;
}

/** Mesetas escalonadas: casi planas y con un escalón corto (cortados). */
function terrace(h, T, base) {
  const rel = (h - base) / T.STEP;
  const i = Math.floor(rel);
  const t = rel - i;
  const k = Math.min(1, Math.max(0, (t - (1 - 1 / T.SHARPNESS)) * T.SHARPNESS));
  return base + (i + k * k * (3 - 2 * k)) * T.STEP;
}
