/**
 * GameConfig — única fuente de valores ajustables del prototipo.
 *
 * Convención:
 *  - Unidades de distancia en metros (1 unidad de Three.js = 1 m).
 *  - Tiempos en segundos salvo que el nombre indique lo contrario (_MS).
 *  - Cada sistema recibe SOLO su sección, nunca el objeto completo,
 *    para que las dependencias sean explícitas.
 *
 * Cada fase añade aquí su sección (WORLD, SURVIVAL, NUTRITION, TEMPERATURE,
 * TIME, CELESTIAL, SHIP...).
 */
// Perfil de luna: reutiliza las tres "ranuras" de bioma de MUNDO 0 (llanura, zona
// irregular y montes) con otros nombres, colores y relieve. Sin agua, sin aire,
// sin vida; con cráteres y poca gravedad. `tint` aclara u oscurece toda la luna.
function moonProfile({ name, tones, temperature, gravity, craterChance, seaFloor = 2, data }) {
  const [light, mid, dark, dust] = tones;
  return {
    NAME: name,
    DATA: data,
    KIND: 'MOON',
    HAS_SEA: false,
    BREATHABLE: false,
    GRAVITY_SCALE: gravity,
    // Sin árboles ni ovejas: en la luna las piezas de madera se hacen de piedra y la lana, de mineral.
    BUILD_SUBSTITUTE: { WOOD: 'STONE', WOOL: 'MINERAL' },
    TERRAIN: {
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
      SEA_FLOOR: seaFloor,          // el borde baja a una gran depresión (no hay mar)
      CRATERS: { CELL: 48, CHANCE: craterChance, RADIUS: [4, 19], DEPTH: 0.32, RIM: 0.12 },
    },
    COLORS: {
      SAND: mid, SEABED: dark, LOWLAND_ROCK: dark, SAND_HEIGHT: -10,
      ROCK_SLOPE_NORMAL_Y: 0.72, PATCH_FREQUENCY: 1 / 28, AO_STRENGTH: 0.4,
      SEA: 0x000000, SEA_OPACITY: 0,
    },
    BIOME_DISTRIBUTION: {
      MOUNTAIN_BIOME_START: 0.3, MOUNTAIN_BIOME_END: 0.6,
      FOREST_FREQUENCY: 1 / 260, FOREST_THRESHOLD: 0.1, FOREST_BLEND: 0.15,
      SPAWN_MIN_PLAINS: 0.7,
    },
    BIOMES: {
      PLAINS: { NAME: 'Llanura de regolito', TEMPERATURE: temperature, HILL_SCALE: 0.4, DETAIL_SCALE: 0.8,
        COLORS: { GROUND: light, GROUND_ALT: mid, ACCENT: dust } },
      FOREST: { NAME: 'Mar oscuro', TEMPERATURE: temperature - 5, HILL_SCALE: 0.8, DETAIL_SCALE: 1.2,
        COLORS: { GROUND: mid, GROUND_ALT: dark, ACCENT: light } },
      FROZEN_MOUNTAINS: { NAME: 'Montes lunares', TEMPERATURE: temperature - 12, HILL_SCALE: 1.0, DETAIL_SCALE: 1.4,
        SNOW_START_HEIGHT: 30, SNOW_MIN_NORMAL_Y: 0.5, COLORS: { GROUND: dark, GROUND_ALT: mid, SNOW: dust, ICE: light } },
    },
    WATER: {
      DISCOVERY_DISTANCE: 7, POND_COUNT: 0, RADIUS: [5, 10], DEPTH: 1, SHORE_WIDTH: 0.6, MIN_SPACING: 70,
      MAX_SLOPE: 0.18, BIOMES: [], NEAR_SPAWN_DISTANCE: [25, 55], COLOR: 0x000000, OPACITY: 0, MUD_COLOR: dark,
    },
    RESOURCES: {
      CELL_SIZE: 4, SPAWN_CLEAR_RADIUS: 8, MAX_SLOPE: 0.9, TREE_MAX_HEIGHT: -1,
      DENSITY: {
        PLAINS: { ROCK: 0.03, MINERAL_ROCK: 0.004 },
        FOREST: { ROCK: 0.05, MINERAL_ROCK: 0.006 },
        FROZEN_MOUNTAINS: { ROCK: 0.07, MINERAL_ROCK: 0.01 },
      },
      GRASS_TUFTS_PER_CHUNK: { PLAINS: 0, FOREST: 0, FROZEN_MOUNTAINS: 0 },
    },
    FAUNA: { HERDS: {}, HERD_RADIUS: 24, NEAR_SPAWN_DISTANCE: [35, 120] },
    PROP_COLORS: { ROCK: mid },
  };
}

export const GameConfig = deepFreeze({
  GAME: {
    TITLE: 'MUNDO 0',
    VERSION: '1.0.0',
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

  // Iluminación base (a pleno día). TimeSystem + AtmosphereSystem la hacen variar
  // con la hora (Fase 11): ver TIME.PALETTE.
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
      USE: ['Mouse2', 'KeyR'],          // usar el objeto seleccionado · en modo construcción: quitar pieza
      ROTATE: ['KeyQ'],                 // girar la pieza antes de colocarla
      CRAFTING: ['Tab'],                // abrir/cerrar el panel de fabricación
      BUILD_MODE: ['KeyB'],             // entrar/salir del modo construcción
      SHIP_TAKEOFF: ['KeyT'],           // nave (a los mandos): despegar / aterrizar
      SHIP_HATCH: ['KeyG'],             // nave: abrir / cerrar la compuerta
      SHIP_LEGS: ['KeyL'],              // nave: recoger / sacar las patas de aterrizaje
      SHIP_ORBIT: ['KeyO'],             // nave: salir al espacio (en vuelo, a bastante altura)
      STAR_MAP: ['KeyM'],               // a los mandos: mapa estelar 3D
      HOTBAR_1: ['Digit1'], HOTBAR_2: ['Digit2'], HOTBAR_3: ['Digit3'],
      HOTBAR_4: ['Digit4'], HOTBAR_5: ['Digit5'], HOTBAR_6: ['Digit6'],
      HOTBAR_7: ['Digit7'], HOTBAR_8: ['Digit8'], HOTBAR_9: ['Digit9'],
      HOTBAR_10: ['Digit0'],
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
      KIND: 'PLANET',
      HAS_SEA: true,
      BREATHABLE: true,
      GRAVITY_SCALE: 1,
      // Lo que sabe la IA de la nave (nodo de IA).
      DATA: {
        LIFE: 'Mundo basado en carbono: la vida (árboles, hierba, ciervos, cabras y vacas) usa química del carbono y agua líquida.',
        ATMOSPHERE: 'Atmósfera de nitrógeno y oxígeno, respirable. Presión y gravedad estándar (1 g).',
        SURFACE: 'Una isla de 1 km rodeada de mar, con explanadas, bosques y montañas heladas.',
        MOONS: 'Tiene 2 lunas: la Luna A, grande y clara, y la Luna B, pequeña, rojiza y lejana.',
      },
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
          TEMPERATURE: 18,          // °C base del bioma (BIOME_TEMPERATURE → TemperatureSystem)
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
    // Las dos lunas (se visitan con la nave ampliada). La A es clara; la B, oscura y rojiza.
    MOON_A: moonProfile({
      name: 'Luna A', tones: [0xd9d6cf, 0xbdb9b1, 0x8f8b84, 0xf2efe8], temperature: -30, gravity: 0.35, craterChance: 0.5,
      data: {
        LIFE: 'Sin vida: roca de silicatos (anortosita) muy clara.',
        ATMOSPHERE: 'Sin atmósfera. Hace falta traje espacial u oxígeno.',
        SURFACE: 'Regolito claro, cráteres y rocas con cristales minerales. Gravedad 0,35 g, unos −30 °C.',
      },
    }),
    MOON_B: moonProfile({
      name: 'Luna B', tones: [0x8a5a44, 0x6e4636, 0x4a2f25, 0xa87458], temperature: -45, gravity: 0.25, craterChance: 0.65,
      data: {
        LIFE: 'Sin vida: roca rica en óxidos de hierro, de ahí su color rojizo.',
        ATMOSPHERE: 'Sin atmósfera. Hace falta traje espacial u oxígeno.',
        SURFACE: 'Muchos cráteres y minerales. Gravedad 0,25 g, unos −45 °C.',
      },
    }),
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
    MINERAL_ROCK: {
      NAME: 'Veta de mineral', COLLISION_RADIUS: 0.7, SCALE: [0.7, 1.2], AIM_HEIGHT: 0.5, AIM_RADIUS: 0.9,
      HARVEST: { ITEM: 'MINERAL', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Minar' },
    },
  },

  // Objetos del inventario. FOOD: tipo de comida para la nutrición (Fase 7).
  // USE: qué hace "usar" (clic derecho / R) con el objeto seleccionado:
  //   EAT (NutritionSystem), DRINK (agua del odre), WATERSKIN (llenar/beber),
  //   EQUIP (EquipmentSystem). Las construcciones NO son objetos: se colocan en el
  //   modo construcción (B) gastando materiales (ver BUILD).
  ITEMS: {
    WOOD: { NAME: 'Madera', ICON: '🪵' },
    STONE: { NAME: 'Piedra', ICON: '🪨' },
    WOOL: { NAME: 'Lana', ICON: '🧶' },
    MINERAL: { NAME: 'Mineral', ICON: '💎' },
    LEATHER: { NAME: 'Cuero', ICON: '🟫' },
    MEAT: { NAME: 'Carne', ICON: '🍖', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 'MEAT_NUTRITION' },
    APPLE: { NAME: 'Manzana', ICON: '🍎', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 'APPLE_NUTRITION' },
    WATER: { NAME: 'Agua', ICON: '💧', USE: 'DRINK' },
    WATERSKIN: { NAME: 'Odre', ICON: '🧴', USE: 'WATERSKIN' },
    LEATHER_ARMOR: { NAME: 'Armadura de cuero', ICON: '🦺', USE: 'EQUIP', SLOT: 'BODY' },
    // Combustible de la nave: se colocan en el puesto de carga (ver SHIP.BATTERIES).
    PLANK_BATTERY_SMALL: { NAME: 'Batería plank pequeña', ICON: '🔋', USE: 'BATTERY' },
    PLANK_BATTERY_SMALL_EMPTY: { NAME: 'Batería plank pequeña (vacía)', ICON: '🪫' },
    // Se coge en la nave (mesa del laboratorio). Usarlo muestra dónde está la nave.
    SHIP_WATCH: { NAME: 'Reloj de la nave', ICON: '⌚', USE: 'WATCH' },
    // Tecnologías que se encuentran en el mundo y se instalan en una ranura de la nave.
    SPACE_NODE: { NAME: 'Nodo espacial', ICON: '🔷' },
    // Mapa de papel con la señal del nodo espacial (usarlo abre el mapa).
    NODE_MAP: { NAME: 'Mapa de la señal', ICON: '📜', USE: 'MAP' },
    GALACTIC_NODE: { NAME: 'Nodo galáctico', ICON: '🌀' },
    // Se encuentra en el cofre de la primera luna: al usarla se despliega una burbuja con aire.
    OXYGEN_BUBBLE: { NAME: 'Burbuja de oxígeno', ICON: '🫧', USE: 'BUBBLE' },
  },

  // Alimentación (Fase 7). Equilibrio entre comida animal y vegetal.
  NUTRITION: {
    MEAT_NUTRITION: 30,        // hambre recuperada por unidad (ITEMS.MEAT.NUTRITION apunta aquí)
    APPLE_NUTRITION: 14,
    ANIMAL_FOOD_WEIGHT: 1,     // proporción deseada animal : vegetal (1 : 1)
    PLANT_FOOD_WEIGHT: 1,
    BALANCE_TOLERANCE: 0.2,    // desviación admitida respecto a la proporción deseada (0..1)
    DIET_MEMORY: 600,          // s: vida media de lo comido en el cálculo del equilibrio
    MIN_INTAKE_TO_JUDGE: 40,   // nutrición reciente mínima antes de juzgar la dieta
    UNBALANCED_HUNGER_DECAY_MULTIPLIER: 1.4, // el hambre baja más rápido con dieta desequilibrada
    UNBALANCED_BLOCKS_REGEN: true,          // sin dieta equilibrada no se regenera vida
  },

  // Equipamiento sencillo (Fase 8).
  EQUIPMENT: {
    ARMOR_COLD_RESISTANCE: 0.7, // multiplicador de pérdida de temperatura con armadura (1 = sin efecto)
    WATER_CAPACITY: 3,          // unidades de agua por odre
  },

  // Recetas (Fase 9): ingredientes → resultado. Solo configuración.
  // (La cama y las piezas de casa se construyen en el modo construcción: BUILD.)
  RECIPES: {
    WATERSKIN: { RESULT: 'WATERSKIN', AMOUNT: 1, INGREDIENTS: { LEATHER: 2, WOOD: 1 } },
    LEATHER_ARMOR: { RESULT: 'LEATHER_ARMOR', AMOUNT: 1, INGREDIENTS: { LEATHER: 4 } },
  },

  // Construcción modular (Fase 9): el jugador construye pieza a pieza.
  //   GRID: tamaño de casilla (m). Suelos/escaleras/tejados ocupan una casilla;
  //   paredes/puertas/ventanas/vallas van en los bordes; pilares en las esquinas;
  //   la cama se coloca libre. La forma, colisiones y superficies de cada pieza
  //   están en construction/BuildRules.js; aquí solo nombre, icono y coste.
  //   El orden de PIECES es el de las teclas 1, 2, … 9, 0.
  BUILD: {
    GRID: 2,
    RANGE: 7,               // m máximos desde el jugador
    REFUND: 1,              // fracción de materiales devuelta al quitar una pieza
    PIECES: {
      FOUNDATION: { NAME: 'Cimiento', ICON: '🪨', COST: { STONE: 4 } },
      FLOOR: { NAME: 'Suelo', ICON: '🟫', COST: { WOOD: 2 } },
      WALL: { NAME: 'Pared', ICON: '🧱', COST: { WOOD: 3 } },
      DOOR: { NAME: 'Puerta', ICON: '🚪', COST: { WOOD: 4 } },
      WINDOW: { NAME: 'Ventana', ICON: '🪟', COST: { WOOD: 3 } },
      FENCE: { NAME: 'Valla', ICON: '🚧', COST: { WOOD: 1 } },
      PILLAR: { NAME: 'Pilar', ICON: '🏛️', COST: { WOOD: 1 } },
      STAIRS: { NAME: 'Escalera', ICON: '🪜', COST: { WOOD: 4 } },
      ROOF: { NAME: 'Tejado', ICON: '🔺', COST: { WOOD: 3 } },
      BED: { NAME: 'Cama', ICON: '🛏️', COST: { WOOL: 3, WOOD: 3 } },
      // Solo en las lunas (BODIES): cargan baterías plank y rellenan el oxígeno del traje.
      CHARGING_STATION: { NAME: 'Estación de carga', ICON: '🔌', COST: { STONE: 4, MINERAL: 3 }, BODIES: 'MOON' },
      OXYGEN_STATION: { NAME: 'Estación de oxígeno', ICON: '🫧', COST: { STONE: 4, MINERAL: 4 }, BODIES: 'MOON' },
    },
    // Piezas que no se pueden hacer en las lunas (BODIES: 'HOME').
    HOME_ONLY: ['FENCE', 'BED'],
  },

  // Soporte vital (Etapa 4): aire, traje espacial y burbujas de oxígeno.
  //   Sin aire se aguanta la respiración LUNGS_TIME s; después, asfixia.
  //   El traje (taquilla del laboratorio) lleva oxígeno y una batería plank
  //   que lo mantiene funcionando (válvulas, calefacción, jetpack).
  LIFE_SUPPORT: {
    LUNGS_TIME: 15,              // s aguantando la respiración
    LUNGS_RECOVER: 25,           // % por segundo al volver a respirar
    SUFFOCATION_DAMAGE: 8,       // vida por segundo sin aire
    SUIT_OXYGEN_TIME: 300,       // s de oxígeno con el depósito lleno
    SUIT_BATTERY_TIME: 600,      // s que dura una batería plank en el traje
    JETPACK_TIME: 90,            // s de empuje del jetpack con el depósito de gas lleno
    LOW_RATIO: 0.25,             // aviso de oxígeno/batería bajos
    BUBBLE_RADIUS: 14,           // m de radio de la burbuja de oxígeno
    BUBBLE_BATTERY_TIME: 1800,   // s que dura una batería plank en la burbuja
    CHARGER_TIME: 60,            // s en cargar una batería plank en una estación de carga
    MOON_CHEST: [                // cofre de suministros de la primera luna
      { item: 'OXYGEN_BUBBLE', count: 1 },
      { item: 'PLANK_BATTERY_SMALL', count: 3 },
    ],
  },

  // Dormir (Fase 8). TimeSystem adelanta el reloj HOURS horas (Fase 11).
  SLEEP: {
    FADE_TIME: 1.2,        // s de fundido a negro
    DURATION: 2.5,         // s de pantalla negra
    HOURS: 8,              // horas que pasan al dormir
    ENERGY_RESTORED: 100,
    HUNGER_COST: 15,
    THIRST_COST: 20,
    SETS_RESPAWN: true,    // dormir en una cama la convierte en punto de reaparición
  },

  // Día y noche (Fase 11). El día dura DAY_LENGTH_MINUTES minutos reales.
  // El sol sale a SUNRISE_HOUR y se pone a SUNSET_HOUR (día más largo que la noche).
  TIME: {
    DAY_LENGTH_MINUTES: 24,   // 1 hora de juego = 1 minuto real
    START_HOUR: 8,
    SUNRISE_HOUR: 6,
    SUNSET_HOUR: 20,
    SUN_MAX_ELEVATION_DEG: 60, // altura máxima del sol a mediodía
    SUN_AZIMUTH_DEG: 25,       // giro del plano por el que se mueve el sol
    NIGHT_TEMPERATURE_DROP: 6, // °C menos en plena noche
    PERIOD_MESSAGES: true,     // "Amanece…", "Anochece…"
    // Colores por momento del día; AtmosphereSystem los mezcla según la altura del sol.
    PALETTE: {
      DAY: {
        ZENITH: 0x4f8fd6, HORIZON: 0xbfd9ec, GROUND: 0x9db8c9,
        SUN: 0xffe8c8, SUN_INTENSITY: 2.6,
        HEMI_SKY: 0xb9d7f0, HEMI_GROUND: 0x4c5842, HEMI_INTENSITY: 0.9,
      },
      TWILIGHT: {
        ZENITH: 0x46557f, HORIZON: 0xf2a56e, GROUND: 0x7b6a6a,
        SUN: 0xffa968,
      },
      NIGHT: {
        ZENITH: 0x060a18, HORIZON: 0x1b2540, GROUND: 0x0d1119,
        MOON_LIGHT: 0x9fb4e6, MOON_INTENSITY: 0.45,
        HEMI_SKY: 0x34487a, HEMI_GROUND: 0x10131a, HEMI_INTENSITY: 0.32,
        STARS: 1,
      },
    },
  },

  // Temperatura (Fase 10). Estadística OCULTA: el jugador solo ve sus efectos.
  //   Temperatura ambiente = temperatura del bioma (PLANETS.*.BIOMES.*.TEMPERATURE,
  //   mezclada por pesos) − penalización por altura − penalización nocturna
  //   + refugio (construcciones, nave).
  //   La temperatura del jugador se acerca poco a poco a la ambiente; con armadura
  //   la pérdida se multiplica por EQUIPMENT.ARMOR_COLD_RESISTANCE (0.7).
  //   Estados por la temperatura del jugador: Normal ≥ COLD_THRESHOLD > Frío ≥
  //   FREEZING_THRESHOLD > Congelación ≥ DAMAGE_THRESHOLD > Crítico (daño).
  TEMPERATURE: {
    COMFORT: 8,               // °C: por encima no se pierde calor
    ALTITUDE_REFERENCE: 12,   // m sobre el mar sin penalización
    ALTITUDE_LAPSE: 0.15,     // °C menos por metro por encima de la referencia
    MOUNTAIN_NIGHT_EXTRA_DROP: 8, // °C extra de noche en las Montañas Heladas (× peso del bioma)
    SHELTER_BONUS: 8,         // °C a cubierto (× factor de refugio 0..1)
    HEATED_TEMPERATURE: 20,   // °C mínimos en un interior climatizado (nave cerrada)
    COLD_THRESHOLD: 4,        // °C del jugador: por debajo → Frío (escarcha)
    FREEZING_THRESHOLD: -4,   // → Congelación (más escarcha, peor visibilidad)
    DAMAGE_THRESHOLD: -10,    // → Crítico (daño)
    MIN_TEMPERATURE: -30,
    LOSS_RATE: 0.35,          // °C/s máximos que baja la temperatura del jugador
    RECOVERY_RATE: 0.8,       // °C/s que sube al volver a una zona templada
    COLD_DAMAGE: 0.8,         // vida/s en estado crítico
    COLD_DAMAGE_PER_DEGREE: 0.08, // vida/s extra por cada °C por debajo de DAMAGE_THRESHOLD
    DAMAGE_TICK: 2,           // s entre golpes de daño por frío
    SAMPLE_INTERVAL: 0.25,    // s entre cálculos
    FREEZING_VISIBILITY: 0.45, // la distancia de visión baja hasta este factor al congelarse
  },

  // Cuerpos celestes (Fase 12): Luna A y Luna B en el cielo, en el mapa planetario y
  // en el espacio. La posición inicial, la inclinación y el aspecto dependen de la
  // sub-seed "celestial"; tamaño, distancia y velocidad son fijos aquí.
  CELESTIAL: {
    PLANET_NAME: 'MUNDO 0',
    PLANET_RADIUS_KM: 3200,
    MOON_A_SIZE: 620,          // km de radio
    MOON_B_SIZE: 240,
    MOON_A_DISTANCE: 42000,    // km al planeta
    MOON_B_DISTANCE: 17000,
    MOON_A_SPEED: 1 / 96,      // vueltas por hora de juego (1 vuelta cada 4 días)
    MOON_B_SPEED: 1 / 30,      // 1 vuelta cada 30 h
    MOON_A_COLOR: 0xd8d2c4,
    MOON_B_COLOR: 0xc98f6a,
    MAX_INCLINATION_DEG: 18,
    // Cómo se ven desde la superficie (tamaño aparente exagerado para que se lean bien).
    MOON_A_SKY_SIZE_DEG: 7,
    MOON_B_SKY_SIZE_DEG: 3.6,
    SKY_DISTANCE: 700,         // m: se dibujan a esta distancia de la cámara (dentro de RENDER.FAR)
    DAY_OPACITY: 0.55,         // de día las lunas se ven pálidas
    MOON_RISE_MESSAGES: true,  // "Sale la Luna A."
  },

  // Espacio explorable: se sube con la nave (con el nodo espacial). Distancias en km.
  // La escena del mapa estelar 3D usa PLANET_RADIUS, MOON_VISUAL_SCALE, STAR_COUNT…
  SPACE: {
    CRUISE_SPEED: 90,          // km/s
    BOOST_MULTIPLIER: 9,       // Shift: impulso (≈ 800 km/s)
    REVERSE_FACTOR: 0.3,
    ACCELERATION: 60,          // km/s²
    TURN_RATE: 0.9,            // rad/s
    PITCH_RATE: 0.7,           // rad/s (Espacio/C cabecean)
    MAX_PITCH: 1.2,
    MIN_APPROACH: 1.12,        // radios: no se puede estar más cerca del centro de un cuerpo
    APPROACH_FACTOR: 1.9,      // radios: por debajo se puede aterrizar / entrar en la atmósfera
    LAND_ALTITUDE: 700,        // km sobre la superficie: también se puede aterrizar
    PROXIMITY_BRAKE: 0.6,      // velocidad máx. (km/s) = altitud (km) × esto cerca de un cuerpo
    ZONE_RADIUS: 65000,        // km desde MUNDO 0: límite del sistema
    EXIT_ALTITUDE_KM: 900,     // al salir de MUNDO 0, km sobre la superficie
    MOON_EXIT_ALTITUDE_KM: 250,
    ARRIVAL_HEIGHT: 110,       // m sobre el suelo al llegar a un cuerpo
    VIEW_DISTANCE: 600,        // m: los cuerpos se dibujan a esta distancia con su tamaño aparente
    HOVER_DRAIN: 0.05,         // batería/s en el espacio
    THRUST_DRAIN: 0.25,        // batería/s extra a velocidad de crucero (×2 con impulso)
    ASTEROID_BELTS: 3,
    ASTEROIDS_PER_BELT: 140,
    DUST_COUNT: 260,
    FADE_TIME: 1.4,            // s de fundido al salir/entrar de la atmósfera
    PLANET_RADIUS: 60,         // unidades de la escena espacial (el resto se escala a partir de aquí)
    MOON_VISUAL_SCALE: 2.2,    // las lunas se ven más grandes que a escala real
    STAR_COUNT: 3500,
    CAMERA_FOV: 55,
    TEXTURE_WIDTH: 512,        // textura equirectangular del planeta (se genera al subir)
    ORBIT_MIN_ALTITUDE: 60,    // m sobre el suelo para poder salir al espacio con la nave
    ORBIT_COST: 12,            // carga de batería que cuesta salir de la atmósfera
    // Meteoritos (Etapa 5): aparecen de vez en cuando cerca del rumbo. La nave no puede
    // aterrizar en ellos: se detiene cerca y se baja con el traje y el jetpack de gas.
    METEORS: {
      FIRST_DELAY: 6,            // s en el espacio hasta que aparece el primero
      INTERVAL: [25, 50],        // s entre apariciones
      MAX: 2,                    // a la vez
      SPAWN_DISTANCE_KM: [18, 40],
      SPAWN_CONE: 0.6,           // rad alrededor del rumbo de la nave
      DESPAWN_KM: 250,
      STOP_DISTANCE_M: 120,      // el rumbo automático (tecla 4) se detiene a esta distancia de la superficie
      MIN_DISTANCE_M: 70,        // la nave nunca se acerca más (no se aterriza)
      APPROACH_RANGE_KM: 5,      // más cerca, la velocidad máxima baja
      GRAVITY: 2.2,              // m/s² hacia el centro del meteorito
      GRAVITY_RANGE_M: 100,      // m sobre la superficie en los que atrae
      RADIUS: [26, 48],          // m
      CRYSTALS: [5, 8],          // cúmulos de mineral
      YIELD: 3,                  // veces que se pica cada cúmulo
      MINERAL_PER_HIT: 2,
      VIEW_DISTANCE: 600,        // m a los que se dibuja como impostor si está más lejos
    },
    // Paseo espacial (EVA) con el traje y el jetpack de gas.
    EVA: {
      THRUST: 4,                 // m/s² del jetpack
      BOOST: 2,                  // ×Shift
      MAX_SPEED: 14,             // m/s
      DAMPING: 0.25,             // estabilizador del traje (1/s)
      WALK_SPEED: 3.2,           // m/s sobre un meteorito
      JUMP: 3.2,                 // m/s
      CAMERA_DISTANCE: 5.5,
    },
    ORBIT_SPIN_HOURS: 24,      // una vuelta del planeta por día
  },

  // Nave pequeña de MUNDO 0. La forma (salas, colisiones, suelos, rampa) está en
  // ship/ShipLayout.js; aquí el comportamiento, las tecnologías y las baterías.
  SHIP: {
    NAME: 'Nave exploradora',
    LANDING_DISTANCE: [22, 45],  // m del inicio del jugador donde aparece aterrizada
    CLEAR_RADIUS: 11,            // m sin árboles ni rocas alrededor del lugar de aterrizaje
    // Vuelo
    TAKEOFF_HEIGHT: 7,           // m sobre el suelo al terminar de despegar
    TAKEOFF_SPEED: 3,            // m/s de subida al despegar
    LANDING_SPEED: 3.5,          // m/s de bajada al aterrizar (frena cerca del suelo)
    MAX_SPEED: 26,               // m/s hacia delante
    BOOST_MULTIPLIER: 1.6,       // con Shift
    REVERSE_FACTOR: 0.4,         // velocidad marcha atrás = MAX_SPEED × esto
    ACCELERATION: 10,            // m/s²
    VERTICAL_SPEED: 9,           // m/s arriba/abajo
    TURN_RATE: 1.3,              // rad/s
    MAX_ALTITUDE: 220,           // m sobre el nivel del mar
    GROUND_CLEARANCE: 0.4,       // m mínimos entre la nave y el terreno en vuelo
    LANDING_MAX_UNEVENNESS: 1.2, // m de desnivel máximo bajo las patas
    AUTOLAND_SEARCH_RADIUS: 70,  // m en los que busca un sitio despejado para aterrizar sola
    AUTOLAND_SPEED: 7,           // m/s de desplazamiento hacia ese sitio
    HATCH_TIME: 1.6,             // s en abrir/cerrar la compuerta
    LEGS_TIME: 1.4,              // s en recoger/sacar las patas
    DOOR_TIME: 0.5,              // s de la puerta interior
    // Cámara a los mandos (3ª persona sobre la nave)
    CAMERA_DISTANCE: 24,
    CAMERA_MIN_DISTANCE: 11,
    CAMERA_MAX_DISTANCE: 45,
    CAMERA_PITCH: -0.3,
    WATCH_ITEM: 'SHIP_WATCH',    // reloj que se coge en la nave y localiza la nave
    SPACE_NODE_ITEM: 'SPACE_NODE',       // al instalarlo la nave crece (ShipBlueprints.EXPLORER)
    GALACTIC_NODE_ITEM: 'GALACTIC_NODE',
    AIRLOCK_TIME: 4,             // s en vaciar/llenar la cámara de descompresión
    // Combustible: baterías plank pequeñas en el puesto de carga.
    BATTERIES: {
      ITEM: 'PLANK_BATTERY_SMALL',
      EMPTY_ITEM: 'PLANK_BATTERY_SMALL_EMPTY',
      SLOTS: 4,
      CAPACITY: 100,             // carga de una batería llena
      START_CHARGE: 1,           // 1 = empiezan llenas
      HOVER_DRAIN: 0.07,         // carga/s solo por estar en el aire
      THRUST_DRAIN: 0.22,        // carga/s extra a velocidad máxima
      CLIMB_DRAIN: 0.08,         // carga/s extra subiendo
    },
    // Tecnologías instalables. Cada ranura de la nave (ShipLayout.SLOTS) tiene
    // una tecnología o está libre para tecnologías futuras.
    TECHNOLOGIES: {
      FLIGHT_SYSTEM: { NAME: 'Sistema de vuelo', ICON: '🕹️', DESCRIPTION: 'Asiento del piloto y mandos de la nave.' },
      PLANET_MAP: { NAME: 'Mapa', ICON: '🗺️', DESCRIPTION: 'Mapa de MUNDO 0 y mapa planetario.' },
      CHARGING_STATION: { NAME: 'Puesto de carga', ICON: '🔌', DESCRIPTION: 'Baterías plank: el combustible de la nave.' },
      SUIT_LOCKER: { NAME: 'Taquilla de trajes', ICON: '🧑‍🚀', DESCRIPTION: 'Traje espacial y jetpack de gas.' },
      OXYGEN_STATION: { NAME: 'Estación de oxígeno', ICON: '🫧', DESCRIPTION: 'Recarga el oxígeno del traje.' },
      SPACE_NODE: { NAME: 'Nodo espacial', ICON: '🔷', DESCRIPTION: 'Permite salir al espacio y viajar a las lunas.' },
      GALACTIC_NODE: { NAME: 'Nodo galáctico', ICON: '🌀', DESCRIPTION: 'Permitiría saltar fuera del sistema de MUNDO 0.' },
      AI_NODE: { NAME: 'Nodo de IA', ICON: '🤖', DESCRIPTION: 'IA de a bordo: datos del sistema y avisos de la nave.' },
    },
    INSTALLED: {
      CONTROL_CONSOLE: 'FLIGHT_SYSTEM',
      LAB_1: 'PLANET_MAP',
      LAB_2: 'CHARGING_STATION',
      LAB_3: null,
      LAB_4: null,
      CONTROL_1: 'AI_NODE',
      CONTROL_2: null,
    },
    // Nave ampliada (tras instalar el nodo espacial).
    INSTALLED_EXPLORER: {
      CONTROL_CONSOLE: 'FLIGHT_SYSTEM',
      LAB_1: 'PLANET_MAP',
      LAB_2: 'CHARGING_STATION',
      LAB_3: 'SUIT_LOCKER',
      LAB_4: 'OXYGEN_STATION',
      ENGINE_1: 'SPACE_NODE',
      CONTROL_1: 'AI_NODE',
      CONTROL_2: null,
      LOUNGE_1: null,
    },
    // Dónde cae el nodo espacial en MUNDO 0 (m desde el inicio del jugador).
    SPACE_NODE_DROP_DISTANCE: [160, 320],
    NODE_MAP_ITEM: 'NODE_MAP',   // se recibe al empezar: marca dónde cayó el nodo
    SPACE_NODE_REQUIRED: true,   // sin "nodo espacial" las lunas no se pueden visitar
    MAP_RESOLUTION: 160,         // píxeles por lado del mapa del planeta
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
    MINERAL: 0x5fd8ff,
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
