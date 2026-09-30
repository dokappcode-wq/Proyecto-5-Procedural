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
  FLORA: 12,               // entradas de flora por cuerpo
  FAUNA: 8,                // entradas de fauna por cuerpo
  HERDS_PER_BODY: 60,      // rebaños en total por cuerpo
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

/** Tipos de estrella (color de la luz, para fases posteriores). */
export const STAR_TYPES = Object.freeze({
  yellow_dwarf: { label: 'Enana amarilla (como el Sol)', color: 0xfff1d0 },
  orange_dwarf: { label: 'Enana naranja', color: 0xffd2a0 },
  red_dwarf: { label: 'Enana roja', color: 0xffa27a },
  white_dwarf: { label: 'Enana blanca', color: 0xeef4ff },
  blue_giant: { label: 'Gigante azul', color: 0xb8ccff },
  red_giant: { label: 'Gigante roja', color: 0xff8a5c },
});

/** Las tres zonas de bioma de cada cuerpo (de abajo arriba) y su ranura interna. */
export const BIOME_SLOTS = Object.freeze({
  low: { slot: 'PLAINS', label: 'zona baja y llana' },
  mid: { slot: 'FOREST', label: 'zona media ondulada' },
  high: { slot: 'FROZEN_MOUNTAINS', label: 'montañas (con nieve o polvo en las cumbres)' },
});

/** Flora (y rocas): plantilla → tipo de recurso del motor. `density` = probabilidad por celda de 4×4 m. */
export const FLORA_TEMPLATES = Object.freeze({
  broadleaf_tree: { resource: 'TREE', label: 'Árbol de hoja ancha (da madera)', wood: true },
  pine: { resource: 'PINE', label: 'Pino / conífera (da madera)', wood: true },
  fruit_tree: { resource: 'APPLE_TREE', label: 'Árbol frutal (da fruta comestible)' },
  bush: { resource: 'BUSH', label: 'Arbusto (decorativo)' },
  rock: { resource: 'ROCK', label: 'Roca (da piedra)' },
  mineral_rock: { resource: 'MINERAL_ROCK', label: 'Veta de mineral (da mineral)' },
});

/** Fauna: plantilla → especie del motor. */
export const FAUNA_TEMPLATES = Object.freeze({
  deer: { species: 'DEER', label: 'Herbívoro ágil de pradera (tipo ciervo): huye' },
  goat: { species: 'GOAT', label: 'Herbívoro lanudo (tipo cabra): da lana, a veces se defiende', wool: true },
  cow: { species: 'COW', label: 'Herbívoro grande y lento (tipo vaca): da cuero' },
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
  return t;
}

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
  grass: { low: 520, mid: 220, high: 0 },
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
  MOON_KM: 1000,    // la distancia de una luna va en miles de km
});
