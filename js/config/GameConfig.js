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
    VERSION: '0.6.0-fase6',
  },

  RENDER: {
    MAX_PIXEL_RATIO: 2,
    ANTIALIAS: true,
    SHADOWS: true,
    SHADOW_MAP_SIZE: 2048,
    SHADOW_AREA: 60,          // lado del área (m) cubierta por la sombra del sol, centrada en el jugador
    FOV: 70,
    NEAR: 0.1,
    FAR: 900,
    FOG_NEAR: 90,
    FOG_FAR: 250,             // ≈ VIEW_DISTANCE_CHUNKS × CHUNK_SIZE: oculta la aparición de chunks
    TONE_MAPPING_EXPOSURE: 1.0,
    TERRAIN_FLAT_SHADING: true, // estilo low-poly facetado (coherente con el personaje de bloques)
    MAX_DELTA: 0.1,           // limita saltos de tiempo (pestaña en segundo plano)
  },

  // Cielo (degradado + disco solar). La niebla usa HORIZON_COLOR para fundirse con él.
  SKY: {
    ZENITH_COLOR: 0x4f8fd6,
    HORIZON_COLOR: 0xbfd9ec,
    GROUND_COLOR: 0x9db8c9,
    SUN_COLOR: 0xfff1d0,
    SUN_SIZE: 0.9994,         // coseno del radio angular del disco solar
    SUN_GLOW: 0.35,
  },

  // Iluminación base (en la Fase 11 TimeSystem la hará variar con la hora).
  LIGHTING: {
    SUN_DIRECTION: { x: 0.55, y: 0.55, z: 0.3 }, // hacia el sol; sol bajo = más relieve
    SUN_COLOR: 0xffe8c8,
    SUN_INTENSITY: 2.6,
    HEMI_SKY_COLOR: 0xb9d7f0,
    HEMI_GROUND_COLOR: 0x4c5842,
    HEMI_INTENSITY: 0.9,
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
      INTERACT: ['KeyE'],               // recoger / interactuar
      ATTACK: ['Mouse0', 'KeyF'],       // golpear (clic izquierdo con el ratón capturado)
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
    PROPS_VIEW_DISTANCE_CHUNKS: 3, // radio con árboles/rocas/hierba (≤ VIEW_DISTANCE_CHUNKS)
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
        MOUNTAIN_OCTAVES: 4,      // menos octavas = crestas menos dentadas
        MOUNTAIN_BASE_LIFT: 12,
        MOUNTAIN_COAST_FADE: 110, // m antes de la costa en los que las montañas se desvanecen
        COAST_NOISE_FREQUENCY: 1 / 170,
        COAST_NOISE_AMPLITUDE: 22,
        COAST_SEA_WIDTH: 20,      // m de mar abierto antes del borde absoluto
        SEA_FLOOR: -9,
      },
      // Colores comunes a todos los biomas.
      COLORS: {
        SAND: 0xdccb8e,
        SEABED: 0x9c8f6a,
        LOWLAND_ROCK: 0x8e8373,   // roca en pendientes fuertes fuera de las montañas
        SAND_HEIGHT: 1.2,
        ROCK_SLOPE_NORMAL_Y: 0.8, // por debajo de esta componente vertical de la normal → roca
        PATCH_FREQUENCY: 1 / 20,  // tamaño de las manchas de color del suelo
        AO_STRENGTH: 0.22,        // oscurecimiento de valles/hondonadas (oclusión aproximada)
        SEA: 0x2d6f98,
        SEA_OPACITY: 0.85,
      },

      // Reparto de biomas. Las montañas heladas siguen al relieve (factor montaña del
      // terreno); bosque/explanada se reparten con ruido de la sub-seed "biome".
      BIOME_DISTRIBUTION: {
        MOUNTAIN_BIOME_START: 0.3,  // factor montaña del terreno donde empieza el bioma
        MOUNTAIN_BIOME_END: 0.6,
        FOREST_FREQUENCY: 1 / 320,
        FOREST_THRESHOLD: 0.0,      // −1..1: más alto = menos bosque
        FOREST_BLEND: 0.12,         // anchura de la transición bosque/explanada
        SPAWN_MIN_PLAINS: 0.8,      // el jugador aparece siempre en explanada
      },

      BIOMES: {
        PLAINS: {
          NAME: 'Explanada',
          TEMPERATURE: 18,          // °C base (lo usará TemperatureSystem en la Fase 10)
          HILL_SCALE: 0.35,         // relieve: explanada casi llana
          DETAIL_SCALE: 0.6,
          COLORS: { GROUND: 0x86b85a, GROUND_ALT: 0xa9c766, ACCENT: 0xd9d27a },
        },
        FOREST: {
          NAME: 'Bosque',
          TEMPERATURE: 14,
          HILL_SCALE: 1.15,         // relieve: más ondulado
          DETAIL_SCALE: 1.3,
          COLORS: { GROUND: 0x4a7a35, GROUND_ALT: 0x3a672f, ACCENT: 0x5e6b33 },
        },
        FROZEN_MOUNTAINS: {
          NAME: 'Montañas Heladas',
          TEMPERATURE: -4,
          HILL_SCALE: 1.0,
          DETAIL_SCALE: 1.5,
          SNOW_START_HEIGHT: 24,    // m: por encima empieza la nieve (con variación)
          SNOW_MIN_NORMAL_Y: 0.42,  // pendientes más verticales que esto quedan en roca
          COLORS: { GROUND: 0x6c737f, GROUND_ALT: 0x5a616d, SNOW: 0xf1f5fa, ICE: 0xb4dcf0 },
        },
      },

      // Charcas de agua dulce (fuentes de agua). Sub-seed "resource".
      WATER: {
        DISCOVERY_DISTANCE: 7,      // m a la orilla: "Has encontrado agua."
        POND_COUNT: 16,
        RADIUS: [5, 10],            // m (radio de la lámina de agua)
        DEPTH: 1.4,                 // m en el centro
        SHORE_WIDTH: 0.6,           // fracción del radio con orilla en pendiente suave
        MIN_SPACING: 70,            // m entre charcas
        MAX_SLOPE: 0.18,            // solo en terreno casi llano
        BIOMES: ['PLAINS', 'FOREST'],
        NEAR_SPAWN_DISTANCE: [25, 55], // siempre hay una charca cerca del inicio
        COLOR: 0x3a7fa8,
        OPACITY: 0.82,
        MUD_COLOR: 0x7a6b4c,        // orilla húmeda
      },

      // Recursos por bioma: probabilidad de que una celda de CELL_SIZE² contenga cada tipo.
      RESOURCES: {
        CELL_SIZE: 4,
        SPAWN_CLEAR_RADIUS: 8,
        MAX_SLOPE: 0.75,
        TREE_MAX_HEIGHT: 38,        // sin árboles por encima (zona de nieve)
        DENSITY: {
          PLAINS: { TREE: 0.01, APPLE_TREE: 0.008, BUSH: 0.05, ROCK: 0.025 },
          FOREST: { TREE: 0.26, PINE: 0.07, APPLE_TREE: 0.045, BUSH: 0.09, ROCK: 0.02 },
          FROZEN_MOUNTAINS: { PINE: 0.025, ROCK: 0.07 },
        },
        GRASS_TUFTS_PER_CHUNK: { PLAINS: 520, FOREST: 220, FROZEN_MOUNTAINS: 0 },
      },

      // Rebaños por especie (sub-seed "animal"). Especies en GameConfig.ANIMALS.
      FAUNA: {
        HERDS: { DEER: 10, GOAT: 10, COW: 9 },
        HERD_RADIUS: 24,            // m: zona en la que se mueve cada rebaño
        NEAR_SPAWN_DISTANCE: [35, 120], // un rebaño de cada especie cerca del inicio
      },
    },
  },

  // Supervivencia (Fase 6). Valores por segundo de juego.
  // Duraciones aproximadas de 100 → 0: hambre 25 min, sed 15 min, energía 40 min.
  SURVIVAL: {
    MAX_HEALTH: 100,
    MAX_HUNGER: 100,
    MAX_THIRST: 100,
    MAX_ENERGY: 100,

    HUNGER_DECAY: 100 / 1500,
    THIRST_DECAY: 100 / 900,
    ENERGY_DECAY: 100 / 2400,

    STARVING_DAMAGE: 0.8,           // vida/s con hambre a 0
    DEHYDRATION_DAMAGE: 1.2,        // vida/s con sed a 0
    STAT_DAMAGE_TICK: 2,            // s entre golpes de daño por hambre/sed

    HEALTH_REGEN: 0.4,              // vida/s si hambre y sed están bien
    HEALTH_REGEN_DELAY: 6,          // s sin recibir daño antes de curarse
    HEALTH_REGEN_MIN_RATIO: 0.4,    // hambre y sed por encima de este % para curarse

    FALL_DAMAGE_MIN_SPEED: 13,      // m/s de caída a partir de los que duele (~8.6 m)
    FALL_DAMAGE_PER_MS: 6,          // vida por cada m/s por encima del mínimo

    DRINK_AMOUNT: 20,               // sed recuperada por trago en una fuente

    ENERGY_RUN_EXTRA: 0.35,         // energía/s extra corriendo
    ENERGY_ACTION_COST: 0.6,        // por golpear o recoger
    ENERGY_JUMP_COST: 0.3,
    ENERGY_NO_RUN_RATIO: 0.15,      // por debajo no se puede correr
    EXHAUSTED_SPEED_MULTIPLIER: 0.7, // velocidad con energía a 0

    LOW_RATIO: 0.25,                // aviso "tienes sed/hambre/estás cansado"
    CRITICAL_RATIO: 0.1,            // aviso más fuerte y barra parpadeando

    RESPAWN_DELAY: 3,               // s antes de poder reaparecer
    RESPAWN_VALUES: { HEALTH: 100, HUNGER: 70, THIRST: 70, ENERGY: 70 },
    KEEP_INVENTORY_ON_DEATH: true,
  },

  // Tipos de recurso: qué dan al recogerlos, colisión y tamaño.
  // HARVEST: cada acción de recoger da 1 ITEM hasta agotar AMOUNT. Si REMOVE_WHEN_EMPTY,
  // el recurso desaparece; si no, vuelve a dar fruto tras REGROW_SECONDS.
  // AIM_HEIGHT / AIM_RADIUS: dónde y con qué tolerancia apunta la mira al recurso.
  RESOURCE_TYPES: {
    TREE: {
      NAME: 'Árbol', COLLISION_RADIUS: 0.35, SCALE: [0.85, 1.3], AIM_HEIGHT: 1.3, AIM_RADIUS: 0.8,
      HARVEST: { ITEM: 'WOOD', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Talar' },
    },
    PINE: {
      NAME: 'Pino', COLLISION_RADIUS: 0.3, SCALE: [0.8, 1.35], AIM_HEIGHT: 1.3, AIM_RADIUS: 0.8,
      HARVEST: { ITEM: 'WOOD', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Talar' },
    },
    APPLE_TREE: {
      NAME: 'Manzano', COLLISION_RADIUS: 0.3, SCALE: [0.85, 1.1], AIM_HEIGHT: 1.8, AIM_RADIUS: 1.3,
      HARVEST: { ITEM: 'APPLE', AMOUNT: 3, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 180, VERB: 'Coger manzana' },
    },
    ROCK: {
      NAME: 'Roca', COLLISION_RADIUS: 0.75, SCALE: [0.5, 1.4], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.9,
      HARVEST: { ITEM: 'STONE', AMOUNT: 2, REMOVE_WHEN_EMPTY: true, VERB: 'Picar' },
    },
    BUSH: { NAME: 'Arbusto', COLLISION_RADIUS: 0, SCALE: [0.7, 1.3], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.6, HARVEST: null },
  },

  // Objetos del inventario. FOOD: tipo de comida para la nutrición (Fase 7).
  ITEMS: {
    WOOD: { NAME: 'Madera', ICON: '🪵' },
    STONE: { NAME: 'Piedra', ICON: '🪨' },
    WOOL: { NAME: 'Lana', ICON: '🧶' },
    LEATHER: { NAME: 'Cuero', ICON: '🟫' },
    MEAT: { NAME: 'Carne', ICON: '🍖', FOOD: 'ANIMAL' },
    APPLE: { NAME: 'Manzana', ICON: '🍎', FOOD: 'PLANT' },
    WATER: { NAME: 'Agua', ICON: '💧' },
  },

  // Interacción del jugador con el mundo (recoger, golpear).
  INTERACTION: {
    RANGE: 2.8,                 // m desde el jugador hasta el borde del objetivo
    ACTION_COOLDOWN: 0.45,      // s entre acciones (recoger o golpear)
    PLAYER_HIT_DAMAGE: 1,       // daño de un puñetazo
    HIT_KNOCKBACK: 3,           // m/s de empuje al animal golpeado
    DAMAGE_KNOCKBACK: 6,        // m/s de empuje al jugador cuando un animal le ataca
  },

  // Colores de los elementos del mundo (estilo low-poly con color por vértice).
  PROPS: {
    TRUNK: 0x6b4a2f,
    LEAVES: 0x4f8a3a,
    LEAVES_ALT: 0x5f9a3f,
    PINE_LEAVES: 0x2f5f3a,
    APPLE_LEAVES: 0x6aa446,
    APPLE: 0xc8302a,
    ROCK: 0x8d8b88,
    BUSH: 0x4d8a3c,
    GRASS: 0x7fb050,
    GRASS_TIP: 0xb9cf6a,
    COLOR_JITTER: 0.12,
  },

  // Especies animales. Comportamiento sencillo: pastar, pasear, mirar, huir.
  // Cada animal recibe al nacer (al azar, derivado de la seed):
  //   TEMPERAMENT ante el jugador: FLEE (huye), CURIOUS (se acerca), NEUTRAL (lo ignora)
  //   HIT_REACTION al ser golpeado: FLEE (huye) o FIGHT (se defiende y ataca)
  // Las probabilidades de cada especie están en TEMPERAMENT_WEIGHTS / HIT_REACTION_WEIGHTS.
  ANIMALS: {
    CURIOUS_STOP_DISTANCE: 2.4,   // m: los curiosos se paran a esta distancia
    CURIOUS_INTEREST_TIME: [8, 18], // s que dura la curiosidad antes de perder interés
    CURIOUS_COOLDOWN: [15, 30],   // s sin interés después
    HIT_FLEE_TIME: [6, 10],       // s huyendo tras un golpe
    AGGRO_TIME: 14,               // s persiguiendo al jugador tras un golpe
    AGGRO_MAX_DISTANCE: 30,       // m: deja de perseguir si el jugador se aleja más
    ATTACK_RANGE: 1.7,            // m
    DEATH_TIME: 1.6,              // s de animación antes de desaparecer
    DISCOVERY_DISTANCE: 28,       // m: aviso "Has encontrado cabras." la primera vez
    ACTIVE_RADIUS: 170,           // m: solo se simulan y dibujan animales cercanos
    MAX_PER_SPECIES: 80,
    TURN_SPEED: 3,                // rad/s
    MAX_SLOPE: 0.6,
    SPECIES: {
      DEER: {
        NAME: 'Ciervo',            // "animal de pradera"
        NAME_PLURAL: 'Ciervos',
        DROPS: { MEAT: 2 },
        HEALTH: 3,
        ATTACK_DAMAGE: 5,
        ATTACK_COOLDOWN: 1.2,
        TEMPERAMENT_WEIGHTS: { FLEE: 0.6, CURIOUS: 0.2, NEUTRAL: 0.2 },
        HIT_REACTION_WEIGHTS: { FLEE: 0.75, FIGHT: 0.25 },
        WALK_SPEED: 1.3,
        FLEE_SPEED: 7,
        ALERT_DISTANCE: 22,         // m: temperamento FLEE: se queda mirando / CURIOUS: se acerca
        FLEE_DISTANCE: 13,          // m: temperamento FLEE: huye (×1.6 si el jugador corre)
        HERD_SIZE: [3, 5],
        BIOMES: { PLAINS: 1, FOREST: 0.8 },
        SCALE: [0.9, 1.1],
        COLORS: { BODY: 0x9a6a3e, BELLY: 0xd9c3a0, DARK: 0x4a3423 },
      },
      GOAT: {
        NAME: 'Cabra',
        NAME_PLURAL: 'Cabras',
        DROPS: { MEAT: 1, WOOL: 2 },
        HEALTH: 3,
        ATTACK_DAMAGE: 6,
        ATTACK_COOLDOWN: 1.1,
        TEMPERAMENT_WEIGHTS: { FLEE: 0.35, CURIOUS: 0.35, NEUTRAL: 0.3 },
        HIT_REACTION_WEIGHTS: { FLEE: 0.4, FIGHT: 0.6 },
        WALK_SPEED: 1.1,
        FLEE_SPEED: 5.5,
        ALERT_DISTANCE: 16,
        FLEE_DISTANCE: 9,
        HERD_SIZE: [3, 6],
        BIOMES: { PLAINS: 1 },
        SCALE: [0.9, 1.1],
        COLORS: { BODY: 0xe8e2d4, BELLY: 0xd2c9b6, DARK: 0x5b5048 },
      },
      COW: {
        NAME: 'Vaca',
        NAME_PLURAL: 'Vacas',
        DROPS: { MEAT: 3, LEATHER: 2 },
        HEALTH: 5,
        ATTACK_DAMAGE: 10,
        ATTACK_COOLDOWN: 1.6,
        TEMPERAMENT_WEIGHTS: { FLEE: 0.2, CURIOUS: 0.3, NEUTRAL: 0.5 },
        HIT_REACTION_WEIGHTS: { FLEE: 0.5, FIGHT: 0.5 },
        WALK_SPEED: 0.8,
        FLEE_SPEED: 3.5,
        ALERT_DISTANCE: 10,
        FLEE_DISTANCE: 4.5,
        HERD_SIZE: [2, 4],
        BIOMES: { PLAINS: 1 },
        SCALE: [0.95, 1.1],
        COLORS: { BODY: 0xf2eee6, BELLY: 0x3b3230, DARK: 0x2b2522 },
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
