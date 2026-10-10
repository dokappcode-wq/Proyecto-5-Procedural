/**
 * Catalog — lo que el motor sabe construir. Es la ÚNICA lista de piezas que un
 * sistema solar importado puede elegir: generadores de terreno, plantillas de
 * flora y fauna, tipos de estrella, categorías de tamaño y límites duros.
 *
 * Un archivo importado nunca aporta comportamiento: solo elige entradas de este
 * catálogo y ajusta sus parámetros dentro de los rangos. Añadir una capacidad al
 * motor = añadir su entrada aquí; el esquema (Schema.js), el validador y el
 * prompt para creadores se derivan de este archivo.
 *
 * Sin Three.js ni DOM: lo usan el juego, los tests y los scripts de Node.
 */

export const SCHEMA_VERSION = '1.0';

/** Límites duros (seguridad y rendimiento). */
export const LIMITS = Object.freeze({
  FILE_BYTES: 256 * 1024,  // tamaño máximo del archivo
  MAX_DEPTH: 12,           // anidamiento máximo del JSON
  MAX_NODES: 20000,        // valores totales (objetos, listas, textos, números…)
  MAX_ERRORS: 50,          // errores que se informan como mucho
  PLANETS: 8,
  MOONS: 4,                // por planeta
  FLORA: 24,               // entradas de flora por cuerpo
  FAUNA: 8,                // entradas de fauna por cuerpo
  HERDS_PER_BODY: 150,     // rebaños en total por cuerpo
  PONDS: 200,              // charcas por cuerpo
  NAME_LENGTH: 40,
  TEXT_LENGTH: 400,
  LORE_LENGTH: 300,
  UNSUPPORTED: 20,         // peticiones no soportadas que se guardan
});

/** Categorías de tamaño: lado de la región caminable y radio por defecto visto desde el espacio. */
export const SIZE_CATEGORIES = Object.freeze({
  dwarf: { label: 'Enano', regionKm: 0.5, radiusKm: 250 },
  small: { label: 'Pequeño', regionKm: 1, radiusKm: 600 },
  medium: { label: 'Mediano', regionKm: 5, radiusKm: 1500 },
  large: { label: 'Grande', regionKm: 10, radiusKm: 3000 },
  huge: { label: 'Enorme', regionKm: 20, radiusKm: 6000 },
});

/** Lado de la región en metros (múltiplo del tamaño de chunk): 1 km → 1024 m. */
export function regionSize(regionKm, chunkSize = 64) {
  return Math.max(chunkSize * 4, Math.round((regionKm * 1024) / chunkSize) * chunkSize);
}

/** Tipos de estrella (color de la luz, para fases posteriores). */
export const STAR_TYPES = Object.freeze({
  yellow_dwarf: { label: 'Enana amarilla (como el Sol)', color: 0xfff1d0, radiusKm: 6000 },
  orange_dwarf: { label: 'Enana naranja', color: 0xffd2a0, radiusKm: 4500 },
  red_dwarf: { label: 'Enana roja', color: 0xffa27a, radiusKm: 3000 },
  white_dwarf: { label: 'Enana blanca', color: 0xeef4ff, radiusKm: 1200 },
  blue_giant: { label: 'Gigante azul', color: 0xb8ccff, radiusKm: 14000 },
  red_giant: { label: 'Gigante roja', color: 0xff8a5c, radiusKm: 20000 },
});

/**
 * Las zonas de bioma de cada cuerpo y su ranura interna. Las tres primeras están
 * siempre; las de `param` solo existen si el parámetro de terreno que las crea es
 * mayor que 0 (terrain.params.beaches / rivers / low_mountains).
 */
export const BIOME_SLOTS = Object.freeze({
  low: { slot: 'PLAINS', label: 'zona baja y llana' },
  mid: { slot: 'FOREST', label: 'zona media ondulada' },
  high: { slot: 'FROZEN_MOUNTAINS', label: 'montañas (con nieve o polvo en las cumbres)' },
  beach: { slot: 'BEACH', label: 'playa: franja de arena junto al mar (necesita terrain.params.beaches > 0)', param: 'beaches' },
  river: { slot: 'RIVER', label: 'riberas de los ríos (necesita terrain.params.rivers > 0)', param: 'rivers' },
  mountain: { slot: 'MOUNTAINS', label: 'montañas bajas sin nieve (necesita terrain.params.low_mountains > 0)', param: 'low_mountains' },
});

/** Valores por defecto de las zonas opcionales (playa, río, montaña baja). */
export const EXTRA_BIOME_LOOK = Object.freeze({
  BIOME_NAMES: { beach: 'Playa', river: 'Río', mountain: 'Montaña' },
  TEMPERATURE_OFFSETS: { beach: 2, river: -1, mountain: -8 },
  SCALES: { beach: [0.12, 0.25], river: [0.45, 0.7], mountain: [1.0, 1.4] }, // [relieve, rugosidad]
});

/** Flora (y rocas): plantilla → tipo de recurso del motor. `density` = probabilidad por celda de 4×4 m. */
export const FLORA_TEMPLATES = Object.freeze({
  broadleaf_tree: { resource: 'TREE', label: 'Árbol de hoja ancha (da madera)', wood: true, colorKeys: ['LEAVES', 'LEAVES_ALT'] },
  pine: { resource: 'PINE', label: 'Pino / conífera (da madera)', wood: true, colorKeys: ['PINE_LEAVES'] },
  fruit_tree: { resource: 'APPLE_TREE', label: 'Árbol frutal (da fruta comestible)', colorKeys: ['APPLE_LEAVES'] },
  bush: { resource: 'BUSH', label: 'Arbusto (decorativo)', colorKeys: ['BUSH'] },
  rock: { resource: 'ROCK', label: 'Roca (da piedra)', colorKeys: ['ROCK'] },
  mineral_rock: { resource: 'MINERAL_ROCK', label: 'Veta de mineral (da mineral)', colorKeys: ['MINERAL'] },
  sand_pile: { resource: 'SAND_PILE', label: 'Montón de arena (da arena; mejor en la playa)', colorKeys: ['SAND'] },
});

/** Fauna: plantilla → especie del motor. */
export const FAUNA_TEMPLATES = Object.freeze({
  deer: { species: 'DEER', label: 'Herbívoro ágil de pradera (tipo ciervo): huye' },
  goat: { species: 'GOAT', label: 'Herbívoro lanudo (tipo cabra): da lana, a veces se defiende', wool: true },
  cow: { species: 'COW', label: 'Herbívoro grande y lento (tipo vaca): da cuero' },
  chicken: { species: 'CHICKEN', label: 'Ave pequeña de corral (tipo gallina): da plumas y, domesticada, huevos' },
});

// ---- Generadores de terreno -------------------------------------------------
// Cada uno parte de un relieve base (valores de ruido del motor) y de un
// "aspecto" (colores por defecto, nombres de bioma, pendientes...). Los
// parámetros son normalizados y amigables: 1 = el valor base.

const ISLAND_TERRAIN = Object.freeze({
  BASE_HEIGHT: 7,
  CONTINENT_FREQUENCY: 1 / 600,
  CONTINENT_AMPLITUDE: 6,
  HILL_FREQUENCY: 1 / 150,
  HILL_AMPLITUDE: 7,
  DETAIL_FREQUENCY: 1 / 22,
  DETAIL_AMPLITUDE: 0.5,
  MOUNTAIN_MASK_FREQUENCY: 1 / 480,
  MOUNTAIN_MASK_START: 0.1,
  MOUNTAIN_MASK_END: 0.45,
  MOUNTAIN_FREQUENCY: 1 / 230,
  MOUNTAIN_HEIGHT: 85,
  MOUNTAIN_OCTAVES: 4,
  MOUNTAIN_BASE_LIFT: 12,
  MOUNTAIN_COAST_FADE: 110,
  COAST_NOISE_FREQUENCY: 1 / 170,
  COAST_NOISE_AMPLITUDE: 22,
  COAST_SEA_WIDTH: 20,
  SEA_FLOOR: -9,
});

const CRATERED_TERRAIN = Object.freeze({
  BASE_HEIGHT: 8,
  CONTINENT_FREQUENCY: 1 / 500,
  CONTINENT_AMPLITUDE: 4,
  HILL_FREQUENCY: 1 / 120,
  HILL_AMPLITUDE: 5,
  DETAIL_FREQUENCY: 1 / 18,
  DETAIL_AMPLITUDE: 0.6,
  MOUNTAIN_MASK_FREQUENCY: 1 / 380,
  MOUNTAIN_MASK_START: 0.2,
  MOUNTAIN_MASK_END: 0.55,
  MOUNTAIN_FREQUENCY: 1 / 200,
  MOUNTAIN_HEIGHT: 38,
  MOUNTAIN_OCTAVES: 3,
  MOUNTAIN_BASE_LIFT: 6,
  MOUNTAIN_COAST_FADE: 90,
  COAST_NOISE_FREQUENCY: 1 / 150,
  COAST_NOISE_AMPLITUDE: 18,
  COAST_SEA_WIDTH: 20,
  SEA_FLOOR: 2,
});

const CRATER_SHAPE = Object.freeze({ CELL: 48, RADIUS: [4, 19], DEPTH: 0.32, RIM: 0.12 });

/** Parámetros comunes de los generadores (nombre → rango, por defecto y efecto). */
const TERRAIN_PARAMS = {
  relief: { min: 0, max: 2, default: 1, description: 'Colinas y ondulación general (0 = llano, 1 = normal, 2 = muy accidentado).' },
  mountains: { min: 0, max: 2, default: 1, description: 'Altura de las montañas (0 = sin montañas, 1 = normal, 2 = el doble).' },
  mountain_coverage: { min: 0, max: 1, default: 0.5, description: 'Cuánta superficie cubren las montañas (0 = casi nada, 1 = casi todo).' },
  roughness: { min: 0, max: 2, default: 1, description: 'Rugosidad del suelo a pequeña escala.' },
  craters: { min: 0, max: 1, default: 0, description: 'Densidad de cráteres (0 = ninguno, 1 = muchísimos).' },
  rivers: { min: 0, max: 1, default: 0, description: 'Ríos de agua dulce que cruzan las zonas bajas hasta el mar (0 = ninguno, 1 = muchos). Necesitan mar. Crean la zona "river".' },
  beaches: { min: 0, max: 1, default: 0, description: 'Anchura de las playas de arena de la costa (0 = sin playa, 1 = muy anchas). Crean la zona "beach".' },
  low_mountains: { min: 0, max: 1, default: 0, description: 'Montañas bajas, sin nieve, entre la zona baja y las montañas altas (0 = ninguna, 1 = muchas). Crean la zona "mountain".' },
};

/** Aplica los parámetros normalizados a un relieve base. */
function shapeTerrain(base, p) {
  const t = { ...base };
  t.CONTINENT_AMPLITUDE = base.CONTINENT_AMPLITUDE * p.relief;
  t.HILL_AMPLITUDE = base.HILL_AMPLITUDE * p.relief;
  t.DETAIL_AMPLITUDE = base.DETAIL_AMPLITUDE * p.roughness;
  t.MOUNTAIN_HEIGHT = base.MOUNTAIN_HEIGHT * p.mountains;
  t.MOUNTAIN_BASE_LIFT = base.MOUNTAIN_BASE_LIFT * p.mountains;
  const shift = (0.5 - p.mountain_coverage) * 0.8;
  t.MOUNTAIN_MASK_START = base.MOUNTAIN_MASK_START + shift;
  t.MOUNTAIN_MASK_END = base.MOUNTAIN_MASK_END + shift;
  if (p.craters > 0) t.CRATERS = { CELL: CRATER_SHAPE.CELL, CHANCE: p.craters, RADIUS: [...CRATER_SHAPE.RADIUS], DEPTH: CRATER_SHAPE.DEPTH, RIM: CRATER_SHAPE.RIM };
  // Capas opcionales (solo si se piden: así los cuerpos que no las usan no cambian).
  if (p.low_mountains > 0) {
    const shiftLow = (0.5 - p.low_mountains) * 0.7;
    t.HILLS = {
      MASK_FREQUENCY: 1 / 420, MASK_START: 0.05 + shiftLow, MASK_END: 0.35 + shiftLow,
      FREQUENCY: 1 / 160, HEIGHT: 24 * (p.mountains || 1), LIFT: 6 * (p.mountains || 1), OCTAVES: 3,
    };
  }
  if (p.rivers > 0) {
    t.RIVERS = {
      FREQUENCY: (1 / 1500) * (0.5 + p.rivers), WARP: 90, WIDTH: 5, DEPTH: 1.8,
      BANK_SLOPE: 0.22, BANK_BIOME: 22, MOUNTAIN_FADE: [0.05, 0.35],
    };
  }
  if (p.beaches > 0) t.BEACHES = { WIDTH: 16 + 44 * p.beaches, HEIGHT: 1.1, DUNE: 0.6 };
  return t;
}

// Parámetros extra de algunos generadores.
const ISLAND_PARAMS = {
  land_fraction: { min: 0.02, max: 0.9, default: 0.4, description: 'Cuánta superficie es tierra (0.05 = casi todo agua, 0.9 = casi todo tierra).' },
  island_size: { min: 0.3, max: 3, default: 1, description: 'Tamaño de las islas (0.5 = islotes pequeños, 2 = islas grandes).' },
  sea_depth: { min: 2, max: 60, default: 14, description: 'Profundidad del mar entre islas (m).' },
};

/** Capa de islas (ver TerrainGenerator): umbral según la fracción de tierra. */
function islandLayer(p, freq) {
  return { FREQUENCY: freq / p.island_size, THRESHOLD: 0.42 - 0.84 * p.land_fraction, CENTER_RADIUS: 70, DEPTH: p.sea_depth, FLOOR: -p.sea_depth };
}

const ISLAND_LOOK = {
  COLORS: { ROCK_SLOPE_NORMAL_Y: 0.8, PATCH_FREQUENCY: 1 / 20, AO_STRENGTH: 0.22 },
  BIOME_DISTRIBUTION: {
    MOUNTAIN_BIOME_START: 0.3, MOUNTAIN_BIOME_END: 0.6,
    FOREST_FREQUENCY: 1 / 320, FOREST_THRESHOLD: 0.0, FOREST_BLEND: 0.12, SPAWN_MIN_PLAINS: 0.8,
  },
  RESOURCES: { MAX_SLOPE: 0.75, TREE_MAX_HEIGHT: 38 },
  SNOW: { SNOW_START_HEIGHT: 24, SNOW_MIN_NORMAL_Y: 0.42 },
  TEMPERATURE_OFFSETS: { low: 0, mid: -4, high: -22 },
  SCALES: { low: [0.35, 0.6], mid: [1.15, 1.3], high: [1.0, 1.5] },
};

export const TERRAIN_GENERATORS = Object.freeze({
  island: {
    label: 'Isla',
    description: 'Una isla con explanadas, zonas onduladas y montañas, rodeada de mar (o de una gran depresión seca si no hay mar).',
    params: { ...TERRAIN_PARAMS },
    build: (p) => shapeTerrain(ISLAND_TERRAIN, p),
    look: {
      COLORS: { ROCK_SLOPE_NORMAL_Y: 0.8, PATCH_FREQUENCY: 1 / 20, AO_STRENGTH: 0.22 },
      BIOME_DISTRIBUTION: {
        MOUNTAIN_BIOME_START: 0.3, MOUNTAIN_BIOME_END: 0.6,
        FOREST_FREQUENCY: 1 / 320, FOREST_THRESHOLD: 0.0, FOREST_BLEND: 0.12, SPAWN_MIN_PLAINS: 0.8,
      },
      RESOURCES: { MAX_SLOPE: 0.75, TREE_MAX_HEIGHT: 38 },
      SNOW: { SNOW_START_HEIGHT: 24, SNOW_MIN_NORMAL_Y: 0.42 },
      BIOME_NAMES: { low: 'Explanada', mid: 'Bosque', high: 'Montañas Heladas' },
      TEMPERATURE_OFFSETS: { low: 0, mid: -4, high: -22 },
      SCALES: { low: [0.35, 0.6], mid: [1.15, 1.3], high: [1.0, 1.5] }, // [relieve, rugosidad]
    },
  },
  archipelago: {
    label: 'Archipiélago',
    description: 'Muchas islas separadas por brazos de mar. Siempre hay una isla en el centro (donde se empieza).',
    params: { ...TERRAIN_PARAMS, ...ISLAND_PARAMS, mountains: { ...TERRAIN_PARAMS.mountains, default: 0.6 } },
    build: (p) => ({ ...shapeTerrain(ISLAND_TERRAIN, p), ISLANDS: islandLayer(p, 1 / 260) }),
    look: { ...ISLAND_LOOK, BIOME_NAMES: { low: 'Playas', mid: 'Bosque isleño', high: 'Picos' } },
  },
  ocean_world: {
    label: 'Mundo oceánico',
    description: 'Casi todo es mar abierto y profundo, con pocas islas. Ideal para nadar y bucear.',
    params: {
      ...TERRAIN_PARAMS, ...ISLAND_PARAMS,
      land_fraction: { ...ISLAND_PARAMS.land_fraction, default: 0.12 },
      sea_depth: { ...ISLAND_PARAMS.sea_depth, default: 30 },
      mountains: { ...TERRAIN_PARAMS.mountains, default: 0.4 },
    },
    build: (p) => ({ ...shapeTerrain(ISLAND_TERRAIN, p), ISLANDS: islandLayer(p, 1 / 420) }),
    look: { ...ISLAND_LOOK, BIOME_NAMES: { low: 'Arenales', mid: 'Selva costera', high: 'Peñas' } },
  },
  open_ocean: {
    label: 'Solo mar',
    description: 'Un océano sin ninguna tierra: no hay suelo donde pisar, solo agua y el fondo marino. La nave amerriza y flota; se nada y se bucea.',
    params: {
      sea_depth: { min: 6, max: 120, default: 40, description: 'Profundidad media del mar (m).' },
      seabed_relief: { min: 0, max: 30, default: 8, description: 'Relieve del fondo marino (m).' },
    },
    build: (p) => ({
      ...shapeTerrain(ISLAND_TERRAIN, { relief: 0.3, mountains: 0, mountain_coverage: 0, roughness: 0.5, craters: 0 }),
      ISLANDS: { FREQUENCY: 1 / 300, THRESHOLD: 2, CENTER_RADIUS: 0, DEPTH: p.sea_depth, FLOOR: -p.sea_depth, SEABED_RELIEF: p.seabed_relief, NO_LAND: true },
    }),
    look: { ...ISLAND_LOOK, BIOME_NAMES: { low: 'Mar abierto', mid: 'Aguas profundas', high: 'Dorsales' }, NO_LAND: true },
  },
  highlands: {
    label: 'Altiplano',
    description: 'Mesetas altas en escalones con cortados, valles y cumbres. Fresco y con mucho relieve.',
    params: {
      ...TERRAIN_PARAMS,
      relief: { ...TERRAIN_PARAMS.relief, default: 1.6 },
      mountains: { ...TERRAIN_PARAMS.mountains, default: 1.2 },
      terrace_height: { min: 2, max: 20, default: 6, description: 'Altura de cada escalón de las mesetas (m).' },
    },
    build: (p) => {
      const t = shapeTerrain({ ...ISLAND_TERRAIN, BASE_HEIGHT: 22, MOUNTAIN_COAST_FADE: 160 }, p);
      t.TERRACES = { STEP: p.terrace_height, SHARPNESS: 7 };
      return t;
    },
    look: {
      ...ISLAND_LOOK,
      SNOW: { SNOW_START_HEIGHT: 48, SNOW_MIN_NORMAL_Y: 0.42 },
      RESOURCES: { MAX_SLOPE: 0.75, TREE_MAX_HEIGHT: 62 },
      BIOME_NAMES: { low: 'Mesetas', mid: 'Laderas', high: 'Cumbres' },
      TEMPERATURE_OFFSETS: { low: 0, mid: -5, high: -18 },
    },
  },
  dunes: {
    label: 'Desierto de dunas',
    description: 'Mares de dunas largas y onduladas, hondonadas y algún risco. Arena dorada si no se dan colores.',
    params: {
      ...TERRAIN_PARAMS,
      relief: { ...TERRAIN_PARAMS.relief, default: 0.4 },
      mountains: { ...TERRAIN_PARAMS.mountains, default: 0.35 },
      dune_height: { min: 0, max: 20, default: 7, description: 'Altura de las dunas (m).' },
      dune_spacing: { min: 15, max: 150, default: 45, description: 'Distancia entre crestas de dunas (m).' },
    },
    build: (p) => {
      const t = shapeTerrain(ISLAND_TERRAIN, p);
      t.DUNES = { HEIGHT: p.dune_height, WAVELENGTH: p.dune_spacing, ANGLE: 0.6, WARP: 0.6 };
      return t;
    },
    look: {
      ...ISLAND_LOOK,
      COLORS: { ROCK_SLOPE_NORMAL_Y: 0.7, PATCH_FREQUENCY: 1 / 30, AO_STRENGTH: 0.3 },
      BIOME_NAMES: { low: 'Dunas', mid: 'Hondonadas', high: 'Riscos' },
      TEMPERATURE_OFFSETS: { low: 0, mid: -2, high: -10 },
      PALETTE: { light: 0xe3c48a, mid: 0xc9a66b, dark: 0x9c7b4c, highlight: 0xf2dcae },
    },
  },
  cratered: {
    label: 'Desierto de cráteres',
    description: 'Llanuras de polvo y roca con cráteres, "mares" oscuros y montes suaves. El aspecto típico de una luna.',
    params: { ...TERRAIN_PARAMS, craters: { ...TERRAIN_PARAMS.craters, default: 0.5 } },
    build: (p) => shapeTerrain(CRATERED_TERRAIN, p),
    look: {
      COLORS: { ROCK_SLOPE_NORMAL_Y: 0.72, PATCH_FREQUENCY: 1 / 28, AO_STRENGTH: 0.4 },
      BIOME_DISTRIBUTION: {
        MOUNTAIN_BIOME_START: 0.3, MOUNTAIN_BIOME_END: 0.6,
        FOREST_FREQUENCY: 1 / 260, FOREST_THRESHOLD: 0.1, FOREST_BLEND: 0.15, SPAWN_MIN_PLAINS: 0.7,
      },
      RESOURCES: { MAX_SLOPE: 0.9, TREE_MAX_HEIGHT: -1 },
      SNOW: { SNOW_START_HEIGHT: 30, SNOW_MIN_NORMAL_Y: 0.5 },
      BIOME_NAMES: { low: 'Llanura de regolito', mid: 'Mar oscuro', high: 'Montes lunares' },
      TEMPERATURE_OFFSETS: { low: 0, mid: -5, high: -12 },
      SCALES: { low: [0.4, 0.8], mid: [0.8, 1.2], high: [1.0, 1.4] },
    },
  },
});

/**
 * Valores por defecto según el tipo de cuerpo. Una luna sin datos es un
 * desierto de cráteres gris claro (con un matiz que depende de la seed).
 */
export const BODY_DEFAULTS = Object.freeze({
  PLANET: {
    generator: 'island', gravity: 1, breathable: true, sea: true, temperature: 18, size: 'small',
    // Colores del Jardín del Edén (se usan si no hay paleta ni colores propios).
    colors: {
      surface: { sand: 0xdccb8e, seabed: 0x9c8f6a, rock: 0x8e8373 },
      low: { ground: 0x86b85a, ground_alt: 0xa9c766, accent: 0xd9d27a },
      mid: { ground: 0x4a7a35, ground_alt: 0x3a672f, accent: 0x5e6b33 },
      high: { ground: 0x6c737f, ground_alt: 0x5a616d, snow: 0xf1f5fa, ice: 0xb4dcf0 },
      beach: { ground: 0xe2d29a, ground_alt: 0xd3c086, accent: 0xf3ead0 },
      river: { ground: 0x5c9a44, ground_alt: 0x4d8a3b, accent: 0x8cbf63 },
      mountain: { ground: 0x7e7767, ground_alt: 0x657a46, accent: 0x9d9584 },
    },
  },
  MOON: {
    generator: 'cratered', gravity: 0.3, breathable: false, sea: false, temperature: -30, size: 'small',
    palette: { light: 0xd9d6cf, mid: 0xbdb9b1, dark: 0x8f8b84, highlight: 0xf2efe8 },
  },
});

/** Agua: mar y charcas. */
export const WATER_DEFAULTS = Object.freeze({
  SEA_COLOR: 0x2d6f98, SEA_OPACITY: 0.85, SAND_HEIGHT: 1.2,
  POND_COLOR: 0x3a7fa8, POND_OPACITY: 0.82, POND_DEPTH: 1.4, MUD_COLOR: 0x7a6b4c,
  PONDS_BREATHABLE: 16,
});

/** Flora y fauna por defecto de un planeta con aire (la del Jardín del Edén). */
export const DEFAULT_LIFE = Object.freeze({
  flora: [
    { template: 'broadleaf_tree', biome: 'low', density: 0.01 },
    { template: 'fruit_tree', biome: 'low', density: 0.008 },
    { template: 'bush', biome: 'low', density: 0.05 },
    { template: 'rock', biome: 'low', density: 0.025 },
    { template: 'broadleaf_tree', biome: 'mid', density: 0.26 },
    { template: 'pine', biome: 'mid', density: 0.07 },
    { template: 'fruit_tree', biome: 'mid', density: 0.045 },
    { template: 'bush', biome: 'mid', density: 0.09 },
    { template: 'rock', biome: 'mid', density: 0.02 },
    { template: 'pine', biome: 'high', density: 0.025 },
    { template: 'rock', biome: 'high', density: 0.07 },
  ],
  grass: { low: 520, mid: 220, high: 0, beach: 25, river: 640, mountain: 140 },
  fauna: [
    { template: 'deer', herds: 10 },
    { template: 'goat', herds: 10 },
    { template: 'cow', herds: 9 },
  ],
});

/** Flora de un cuerpo sin aire: solo rocas y vetas de mineral. */
export const BARREN_FLORA = Object.freeze([
  { template: 'rock', biome: 'low', density: 0.03 },
  { template: 'mineral_rock', biome: 'low', density: 0.004 },
  { template: 'rock', biome: 'mid', density: 0.05 },
  { template: 'mineral_rock', biome: 'mid', density: 0.006 },
  { template: 'rock', biome: 'high', density: 0.07 },
  { template: 'mineral_rock', biome: 'high', density: 0.01 },
]);

/** Órbitas: unidades del archivo → km. */
export const ORBIT_UNITS = Object.freeze({
  MOON_KM: 1000,       // la distancia de una luna va en miles de km
  PLANET_KM: 250000,   // la de un planeta, en unidades de 250 000 km (distancias comprimidas)
});
