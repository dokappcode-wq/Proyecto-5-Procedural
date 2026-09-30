/**
 * GameConfig — única fuente de valores ajustables del prototipo.
 *
 * Convención:
 *  - Unidades de distancia en metros (1 unidad de Three.js = 1 m).
 *  - Tiempos en segundos salvo que el nombre indique lo contrario (_MS).
 *  - Cada sistema recibe SOLO su sección, nunca el objeto completo,
 *    para que las dependencias sean explícitas.
 *
 * Las fases futuras añadirán aquí sus secciones (WORLD, BIOMES, SURVIVAL,
 * NUTRITION, TEMPERATURE, TIME, CELESTIAL, ...).
 */
export const GameConfig = deepFreeze({
  GAME: {
    TITLE: 'MUNDO 0',
    VERSION: '0.2.0-fase2',
  },

  RENDER: {
    MAX_PIXEL_RATIO: 2,
    ANTIALIAS: true,
    SHADOWS: true,
    SHADOW_MAP_SIZE: 2048,
    SHADOW_AREA: 40,          // lado del área (m) cubierta por la sombra del sol, centrada en el jugador
    FOV: 70,
    NEAR: 0.1,
    FAR: 600,
    FOG_NEAR: 90,
    FOG_FAR: 250,             // ≈ VIEW_DISTANCE_CHUNKS × CHUNK_SIZE: oculta la aparición de chunks
    SKY_COLOR: 0x9fc9e8,
    MAX_DELTA: 0.1,           // limita saltos de tiempo (pestaña en segundo plano)
  },

  INPUT: {
    MOUSE_SENSITIVITY: 0.0022, // radianes por píxel
    INVERT_Y: false,
    MAX_MOUSE_EVENT_DELTA: 300, // px; movimientos mayores en un solo evento se descartan (picos espurios)
    // Movimiento: códigos físicos (event.code), independientes de la distribución del teclado.
    KEYBINDINGS: {
      FORWARD: ['KeyW', 'ArrowUp'],
      BACKWARD: ['KeyS', 'ArrowDown'],
      LEFT: ['KeyA', 'ArrowLeft'],
      RIGHT: ['KeyD', 'ArrowRight'],
      JUMP: ['Space'],
      RUN: ['ShiftLeft', 'ShiftRight'],
      DESCEND: ['KeyC', 'ControlLeft'], // solo en vuelo (debug)
      TOGGLE_CAMERA: ['KeyV'],
      TOGGLE_HELP: ['KeyH'],
      INTERACT: ['KeyE'],               // reservado para fases posteriores
    },
  },

  PLAYER: {
    HEIGHT: 1.8,
    EYE_HEIGHT: 1.62,
    RADIUS: 0.35,
    WALK_SPEED: 4.3,
    RUN_SPEED: 7.5,
    FLY_SPEED: 18,
    GROUND_ACCELERATION: 40,  // m/s² — respuesta en suelo
    AIR_ACCELERATION: 10,     // m/s² — control en el aire
    JUMP_VELOCITY: 5.6,       // ≈1.6 m de altura de salto con la gravedad por defecto
    GRAVITY: 9.81 * 1.0,
    TERMINAL_VELOCITY: 40,
    MAX_STEP_HEIGHT: 0.45,    // escalones que se suben sin saltar
    MAX_WALKABLE_SLOPE_DEG: 50, // pendientes más inclinadas no se pueden subir caminando
    PITCH_LIMIT: Math.PI / 2 - 0.05,
    BODY_TURN_SPEED: 10,      // rad/s con que el cuerpo gira hacia la dirección de avance
    COLORS: {
      SKIN: 0xe0ac86,
      SHIRT: 0x3f7fbf,
      PANTS: 0x3b3b56,
      BOOTS: 0x4a3222,
      HAIR: 0x4b2e1a,
    },
  },

  CAMERA: {
    DEFAULT_MODE: 'THIRD_PERSON',    // 'FIRST_PERSON' | 'THIRD_PERSON'
    TRANSITION_SPEED: 7,             // mayor = cambio más rápido; 0 = instantáneo
    THIRD_PERSON_DISTANCE: 4.5,
    THIRD_PERSON_MIN_DISTANCE: 2,
    THIRD_PERSON_MAX_DISTANCE: 10,
    THIRD_PERSON_ZOOM_STEP: 0.5,     // por paso de rueda del ratón
    THIRD_PERSON_HEIGHT_OFFSET: 0.35, // sobre los ojos
    THIRD_PERSON_SHOULDER_OFFSET: 0.6, // desplazamiento lateral (cámara "al hombro")
    MIN_HEIGHT_ABOVE_GROUND: 0.3,
    HIDE_BODY_BELOW_BLEND: 0.25,     // en la transición, por debajo de esto se oculta el cuerpo
  },

  // Parámetros generales de generación (comunes a cualquier planeta).
  WORLD: {
    DEFAULT_SEED: 'mundo0',   // también se puede pasar por URL: index.html?seed=loquesea
    SUB_SEEDS: ['terrain', 'biome', 'resource', 'animal', 'celestial', 'spawn'],
    WORLD_SIZE: 1024,         // lado del mundo finito (m); múltiplo de CHUNK_SIZE
    CHUNK_SIZE: 64,           // m
    CHUNK_RESOLUTION: 32,     // celdas por lado de chunk (→ 2 m entre vértices)
    VIEW_DISTANCE_CHUNKS: 4,  // radio de chunks con malla alrededor del jugador
    CHUNKS_BUILT_PER_FRAME: 2,
    EDGE_MARGIN: 96,          // franja del borde donde el terreno baja al mar (no jugable)
    SEA_LEVEL: 0,
    SPAWN_SEARCH_RADIUS: 160,
    SPAWN_ATTEMPTS: 300,
    SPAWN_MIN_HEIGHT_ABOVE_SEA: 1.5,
    SPAWN_MAX_SLOPE: 0.25,    // desnivel/distancia
  },

  // Perfiles de planeta: cada planeta futuro tendrá su propio perfil.
  PLANETS: {
    MUNDO_0: {
      NAME: 'MUNDO 0',
      TERRAIN: {
        BASE_HEIGHT: 7,
        CONTINENT_FREQUENCY: 1 / 600,
        CONTINENT_AMPLITUDE: 6,
        HILL_FREQUENCY: 1 / 150,
        HILL_AMPLITUDE: 7,
        DETAIL_FREQUENCY: 1 / 22,
        DETAIL_AMPLITUDE: 0.5,
        MOUNTAIN_MASK_FREQUENCY: 1 / 480,
        MOUNTAIN_MASK_START: 0.1,  // umbrales del ruido (−1..1) donde empiezan/culminan las montañas
        MOUNTAIN_MASK_END: 0.45,
        MOUNTAIN_FREQUENCY: 1 / 230,
        MOUNTAIN_HEIGHT: 85,
        MOUNTAIN_BASE_LIFT: 12,
        MOUNTAIN_COAST_FADE: 110, // m antes de la costa en los que las montañas se desvanecen
        COAST_NOISE_FREQUENCY: 1 / 170,
        COAST_NOISE_AMPLITUDE: 22,
        COAST_SEA_WIDTH: 20,      // m de mar abierto antes del borde absoluto
        SEA_FLOOR: -9,
      },
      COLORS: {
        SAND: 0xd8c98f,
        GRASS: 0x6fa650,
        GRASS_DARK: 0x4f7f3a,
        ROCK: 0x8a8580,
        SNOW: 0xf2f5f8,
        SEABED: 0x9c8f6a,
        SAND_HEIGHT: 1.2,
        ROCK_HEIGHT: 38,
        ROCK_SLOPE_NORMAL_Y: 0.78,
        SNOW_HEIGHT: 62,
        SEA: 0x2f6f9f,
        SEA_OPACITY: 0.82,
      },
    },
  },

  ADMIN: {
    ADMIN_SEQUENCE: ['a', 'd', 'm', 'i', 'n'],
    ADMIN_KEY_TIMEOUT: 2000, // ms máximos entre dos teclas de la secuencia
  },

  UI: {
    MESSAGE_DURATION_MS: 3500,
    MAX_MESSAGES: 5,
  },
});

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}
