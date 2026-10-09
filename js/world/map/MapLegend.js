/**
 * MapLegend — qué significa cada valor de los mapas diseñados (maps/<id>/): tipos de
 * suelo, biomas y vegetación. Lo comparten la herramienta que prepara el mapa
 * (tools/map/bake.mjs) y el juego (que lo dibuja y lo usa).
 */

/** Suelos: el color, el detalle del dibujo y el sonido de los pasos dependen de esto. */
export const SURFACE = Object.freeze({
  GRASS: 0,        // pradera
  GRASS_LUSH: 1,   // hierba jugosa (riberas)
  FLOWERS: 2,      // pradera florida
  GRASS_DRY: 3,    // hierba dorada (colinas)
  FOREST_FLOOR: 4, // hojarasca y musgo
  PINE_FLOOR: 5,   // pinocha
  ALPINE: 6,       // pasto de montaña, corto
  DIRT: 7,         // tierra
  PATH: 8,         // senda
  SCORCHED: 9,     // tierra quemada (el choque)
  ROCK: 10,        // roca
  SCREE: 11,       // pedregal
  CLIFF: 12,       // pared de roca con estratos
  SAND: 13,
  WET_SAND: 14,
  MUD: 15,
  GRAVEL: 16,      // grava del cauce
  SNOW: 17,
  ICE: 18,
  PAVED: 19,       // losas (ruinas, explanadas de piedra)
  MARSH: 20,       // marisma: hierba húmeda y barro
  TRAVERTINE: 21,  // costras blancas de las termas
  SEABED: 22,
  HEATH: 23,       // brezo (acantilados)
  MOSS: 24,        // musgo espeso (bosque antiguo)
});
export const SURFACE_NAMES = Object.freeze(Object.fromEntries(Object.entries(SURFACE).map(([k, v]) => [v, k])));

/** Sonido de los pasos de cada suelo (AudioSystem). */
export const SURFACE_STEP = Object.freeze({
  [SURFACE.ROCK]: 'stone', [SURFACE.SCREE]: 'stone', [SURFACE.CLIFF]: 'stone', [SURFACE.PAVED]: 'stone', [SURFACE.TRAVERTINE]: 'stone', [SURFACE.GRAVEL]: 'stone',
  [SURFACE.SAND]: 'sand', [SURFACE.WET_SAND]: 'sand', [SURFACE.SEABED]: 'sand',
  [SURFACE.SNOW]: 'snow', [SURFACE.ICE]: 'snow',
  [SURFACE.MUD]: 'water', [SURFACE.MARSH]: 'water',
});

/** Biomas de juego (temperatura, animales, enemigos…). 255 = mar. */
export const BIOME_IDS = Object.freeze(['PLAINS', 'FOREST', 'FROZEN_MOUNTAINS', 'BEACH', 'RIVER', 'MOUNTAINS']);
export const BIOME_INDEX = Object.freeze(Object.fromEntries(BIOME_IDS.map((id, i) => [id, i])));
export const SEA = 255;

/**
 * Vegetación: tipo (4 bits altos) y densidad 0..15 (4 bits bajos) por celda. Cada tipo
 * dice la probabilidad de cada recurso en una celda de 4×4 m a densidad máxima.
 */
export const FLORA = Object.freeze({
  NONE: 0, OAK: 1, PINE: 2, MIXED: 3, ORCHARD: 4, MEADOW: 5, SAVANNA: 6, ALPINE: 7,
  MOUNTAIN: 8, SCRUB: 9, BEACH: 10, MARSH: 11, LAKESIDE: 12, ROCKS: 13,
});
export const FLORA_TABLE = Object.freeze({
  [FLORA.OAK]: { TREE: 0.42, APPLE_TREE: 0.03, BUSH: 0.1, ROCK: 0.012, MUSHROOM: 0.03, BERRY_BUSH: 0.02, BIRD_NEST: 0.007 },
  [FLORA.PINE]: { PINE: 0.4, TREE: 0.03, BUSH: 0.05, ROCK: 0.025, MUSHROOM: 0.025, BIRD_NEST: 0.005 },
  [FLORA.MIXED]: { TREE: 0.26, PINE: 0.1, APPLE_TREE: 0.02, BUSH: 0.08, ROCK: 0.012, MUSHROOM: 0.025, BERRY_BUSH: 0.025, BIRD_NEST: 0.006, WILD_FLOWERS: 0.006 },
  [FLORA.ORCHARD]: { APPLE_TREE: 0.16, TREE: 0.02, BUSH: 0.04, BERRY_BUSH: 0.035, WILD_WHEAT: 0.025, WILD_FLOWERS: 0.02 },
  [FLORA.MEADOW]: { TREE: 0.018, APPLE_TREE: 0.006, BUSH: 0.04, ROCK: 0.012, WILD_WHEAT: 0.035, BERRY_BUSH: 0.012, WILD_FLOWERS: 0.03 },
  [FLORA.SAVANNA]: { TREE: 0.01, BUSH: 0.03, ROCK: 0.02, WILD_WHEAT: 0.055 },
  [FLORA.ALPINE]: { PINE: 0.035, ROCK: 0.07 },
  [FLORA.MOUNTAIN]: { PINE: 0.09, TREE: 0.012, ROCK: 0.07, BUSH: 0.02 },
  [FLORA.SCRUB]: { BUSH: 0.09, ROCK: 0.03, TREE: 0.006 },
  [FLORA.BEACH]: { SAND_PILE: 0.03, ROCK: 0.01, BUSH: 0.012 },
  [FLORA.MARSH]: { BUSH: 0.1, TREE: 0.015, MUSHROOM: 0.012, CLAY_DEPOSIT: 0.03 },
  [FLORA.LAKESIDE]: { TREE: 0.08, APPLE_TREE: 0.02, BUSH: 0.08, BERRY_BUSH: 0.035, MUSHROOM: 0.012, CLAY_DEPOSIT: 0.035, WILD_FLOWERS: 0.012 },
  [FLORA.ROCKS]: { ROCK: 0.12 },
});
export const FLORA_BY_NAME = Object.freeze({
  oak: FLORA.OAK, pine: FLORA.PINE, mixed: FLORA.MIXED, orchard: FLORA.ORCHARD, meadow: FLORA.MEADOW, savanna: FLORA.SAVANNA,
  alpine: FLORA.ALPINE, mountain: FLORA.MOUNTAIN, scrub: FLORA.SCRUB, beach: FLORA.BEACH, marsh: FLORA.MARSH, lakeside: FLORA.LAKESIDE,
  rocks: FLORA.ROCKS, none: FLORA.NONE,
});

/** Codificación de alturas y niveles de agua en los binarios (centímetros, desplazados). */
export const HEIGHT_OFFSET = 100; // m: 0 en el archivo = −100 m
export const HEIGHT_SCALE = 100;  // por metro
export const NO_WATER = 0;        // en el mapa de agua: sin agua dulce
