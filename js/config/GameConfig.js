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
// Piezas de construcción (Fase 9 + 2). Cada pieza es un OBJETO que se fabrica en el reloj
// (o en su estación) con RECIPE y se coloca seleccionándolo en la barra (o "Colocar" desde la
// mochila). Al romperla vuelve al inventario. ITEM: objeto propio si ya existía (mesa de refinería).
const GOLEM_BIOMES = { MOUNTAINS: 0.4, PLAINS: 0.5, FOREST: 0.5, FROZEN_MOUNTAINS: 0.4 };
const BASE_BIOMES = { FOREST: 0.5, PLAINS: 0.6 };

const BUILD_PIECES = {
  FOUNDATION: { NAME: 'Cimiento', ICON: '🪨', RECIPE: { STONE: 4 }, TIME: 3 },
  FLOOR: { NAME: 'Suelo', ICON: '🟫', RECIPE: { WOOD: 2 }, TIME: 2 },
  WALL: { NAME: 'Pared', ICON: '🧱', RECIPE: { WOOD: 3 }, TIME: 3 },
  DOOR: { NAME: 'Puerta', ICON: '🚪', RECIPE: { WOOD: 4 }, TIME: 4 },
  WINDOW: { NAME: 'Ventana', ICON: '🪟', RECIPE: { WOOD: 3 }, TIME: 3 },
  FENCE: { NAME: 'Valla', ICON: '🚧', RECIPE: { WOOD: 1 }, TIME: 1 },
  PILLAR: { NAME: 'Pilar', ICON: '🏛️', RECIPE: { WOOD: 1 }, TIME: 1 },
  STAIRS: { NAME: 'Escalera', ICON: '🪜', RECIPE: { WOOD: 4 }, TIME: 4 },
  ROOF: { NAME: 'Tejado', ICON: '🔺', RECIPE: { WOOD: 3 }, TIME: 3 },
  BED: { NAME: 'Cama', ICON: '🛏️', RECIPE: { WOOL: 3, WOOD: 3 }, TIME: 8 },
  REFINERY: { NAME: 'Mesa de refinería', ICON: '🛠️', ITEM: 'REFINERY_KIT', STATION_PIECE: true },
  CHEST: { NAME: 'Cofre', ICON: '📦', RECIPE: { REFINED_WOOD: 6 }, TIME: 10, DESC: 'Guarda objetos: colócalo y E para abrirlo (27 huecos).' },
  FURNACE: { NAME: 'Horno', ICON: '🔥', RECIPE: { REFINED_STONE: 10, REFINED_WOOD: 2 }, TIME: 15, STATION_PIECE: true, DESC: 'Funde menas, diamante y arena con carbón (E para usarlo).' },
  WORKBENCH: { NAME: 'Mesa de elaboración', ICON: '🧰', RECIPE: { REFINED_IRON: 5, REFINED_COPPER: 5 }, TIME: 20, STATION_PIECE: true, LOCK: 'WORKBENCH', DESC: 'Recetas avanzadas: placa de navegación, armas y armaduras de metal (E para usarla).' },
  TORCH: { NAME: 'Antorcha', ICON: '🔥', ITEM: 'TORCH' },
  // Cocina (P2): la hoguera asa, da luz y calor y espanta a los slimes; la cocina guisa.
  CAMPFIRE: { NAME: 'Hoguera', ICON: '🔥', RECIPE: { WOOD: 3, STONE: 3 }, TIME: 4, STATION_PIECE: true, DESC: 'Asa carne, setas, huevos y manzanas (E). Da luz y calor, y los slimes no se acercan.' },
  KITCHEN: { NAME: 'Cocina con olla', ICON: '🍲', RECIPE: { REFINED_STONE: 6, REFINED_COPPER: 3 }, TIME: 15, STATION_PIECE: true, DESC: 'Fogón de piedra con olla de cobre: pan, estofado, sopa, mermelada y tarta (E).' },
  // Materiales y estaciones (P5): telar (tela y ropa de abrigo), curtidor (cuero y mochilas),
  // alquimia (pociones) y forja (acero, oro de las monedas, mejor fundición).
  LOOM: { NAME: 'Telar', ICON: '🧶', RECIPE: { REFINED_WOOD: 6, ROPE: 3 }, TIME: 15, STATION_PIECE: true, DESC: 'Teje fibra y lana: tela y ropa de abrigo (E).' },
  TANNER: { NAME: 'Curtidor', ICON: '🪣', RECIPE: { REFINED_WOOD: 4, REFINED_STONE: 2, RESIN: 2 }, TIME: 15, STATION_PIECE: true, DESC: 'Cuba y bastidor: cuero refinado con resina (más por piel), botas de piel y mochilas (E).' },
  ALCHEMY: { NAME: 'Mesa de alquimia', ICON: '⚗️', RECIPE: { REFINED_WOOD: 3, GLASS: 4, BRICK: 4 }, TIME: 20, STATION_PIECE: true, DESC: 'Alambique y frascos: pociones, polvo de diamante y manzana dorada (E).' },
  FORGE: { NAME: 'Forja', ICON: '⚒️', RECIPE: { BRICK: 12, REFINED_IRON: 4, REFINED_STONE: 4 }, TIME: 25, STATION_PIECE: true, DESC: 'Fragua de ladrillo con yunque: acero, oro de las monedas y fundición que rinde más (E). Da luz y calor.' },
  // Granja (P4): parcela de tierra labrada con borde de troncos. E con semillas para sembrar.
  FARM_PLOT: { NAME: 'Parcela de cultivo', ICON: '🌱', RECIPE: { WOOD: 2, FIBER: 2 }, TIME: 4, DESC: 'Tierra para sembrar (2×2 m). E con semillas: sembrar · con el cubo de agua: regar · con harina de hueso: abonar · madura: cosechar.' },
  // Construcción (P6). HARD: aguante al romperla a golpes (× BUILD.BREAK_TIME).
  STONE_WALL: { NAME: 'Pared de piedra', ICON: '🪨', RECIPE: { REFINED_STONE: 3 }, TIME: 5, HARD: 2.5, DESC: 'Sillares de piedra: aguanta mucho más que la madera.' },
  BRICK_WALL: { NAME: 'Pared de ladrillo', ICON: '🧱', RECIPE: { BRICK: 6 }, TIME: 5, HARD: 2, DESC: 'Ladrillo rojo con llagas de mortero.' },
  STONE_FLOOR: { NAME: 'Suelo de losas', ICON: '⬜', RECIPE: { REFINED_STONE: 2 }, TIME: 3, HARD: 2 },
  BRICK_FLOOR: { NAME: 'Suelo de baldosas', ICON: '🟥', RECIPE: { BRICK: 4 }, TIME: 3, HARD: 2, DESC: 'Baldosas de barro cocido en espiga.' },
  TILE_ROOF: { NAME: 'Tejado de tejas', ICON: '🔻', RECIPE: { BRICK: 4 }, TIME: 4, HARD: 1.5, DESC: 'Tejas curvas de barro cocido.' },
  STONE_STAIRS: { NAME: 'Escalera de piedra', ICON: '🪜', RECIPE: { REFINED_STONE: 4 }, TIME: 5, HARD: 2 },
  STONE_PILLAR: { NAME: 'Columna de piedra', ICON: '🏛️', RECIPE: { REFINED_STONE: 1 }, TIME: 2, HARD: 2.5 },
  HALF_WALL: { NAME: 'Media pared', ICON: '▭', RECIPE: { WOOD: 2 }, TIME: 2, DESC: 'Pared hasta la cintura: barras, porches y corrales.' },
  STONE_HALF_WALL: { NAME: 'Murete de piedra', ICON: '▭', RECIPE: { REFINED_STONE: 2 }, TIME: 3, HARD: 2.5 },
  GABLE: { NAME: 'Hastial', ICON: '🔺', RECIPE: { WOOD: 2 }, TIME: 2, DESC: 'Pared triangular encima de una pared: cierra el hueco bajo el tejado a dos aguas.' },
  BIG_WINDOW: { NAME: 'Ventanal', ICON: '🪟', RECIPE: { WOOD: 2, GLASS: 4 }, TIME: 5, DESC: 'Pared con un gran cristal: mucha luz y buenas vistas.' },
  FENCE_GATE: { NAME: 'Puerta de valla', ICON: '🚧', RECIPE: { WOOD: 2 }, TIME: 2, DESC: 'Se abre y se cierra (E): para corrales y huertos.' },
  RAILING: { NAME: 'Barandilla', ICON: '〰️', RECIPE: { WOOD: 1 }, TIME: 1, DESC: 'Para balcones, escaleras y pisos altos.' },
  LADDER: { NAME: 'Escalera de mano', ICON: '🪜', RECIPE: { WOOD: 3 }, TIME: 2, DESC: 'Avanza contra ella para subir (atrás: bajar, Espacio: soltarse).' },
  TRAPDOOR: { NAME: 'Trampilla', ICON: '🟫', RECIPE: { WOOD: 3 }, TIME: 3, DESC: 'Suelo que se abre (E): con una escalera de mano debajo se baja al piso de abajo.' },
  // Muebles (P6).
  TABLE: { NAME: 'Mesa', ICON: '🪑', RECIPE: { REFINED_WOOD: 3 }, TIME: 5, CATEGORY: 'FURNITURE', DESC: 'Encima se pueden poner lámparas, macetas…' },
  CHAIR: { NAME: 'Silla', ICON: '🪑', RECIPE: { REFINED_WOOD: 2 }, TIME: 4, CATEGORY: 'FURNITURE' },
  BENCH: { NAME: 'Banco', ICON: '🪵', RECIPE: { REFINED_WOOD: 2 }, TIME: 4, CATEGORY: 'FURNITURE' },
  BOOKSHELF: { NAME: 'Estantería', ICON: '📚', RECIPE: { REFINED_WOOD: 4, CLOTH: 1 }, TIME: 6, CATEGORY: 'FURNITURE' },
  WARDROBE: { NAME: 'Armario', ICON: '🚪', RECIPE: { REFINED_WOOD: 6 }, TIME: 8, CATEGORY: 'FURNITURE', DESC: 'Guarda objetos (18 huecos): E para abrirlo.' },
  BARREL: { NAME: 'Barril', ICON: '🛢️', RECIPE: { WOOD: 4, ROPE: 1 }, TIME: 4, CATEGORY: 'FURNITURE', DESC: 'Guarda objetos (9 huecos): E para abrirlo.' },
  RUG: { NAME: 'Alfombra', ICON: '🟥', RECIPE: { CLOTH: 3 }, TIME: 4, CATEGORY: 'FURNITURE', DESC: 'Se pone primero y encima los muebles.' },
  LAMP: { NAME: 'Lámpara de aceite', ICON: '🪔', RECIPE: { REFINED_IRON: 1, GLASS: 1, RESIN: 1 }, TIME: 4, CATEGORY: 'FURNITURE', DESC: 'Luz cálida para la casa (en el suelo, en una mesa o en una estantería).' },
  FLOWER_POT: { NAME: 'Maceta con flores', ICON: '🪴', RECIPE: { CLAY: 2, WILD_FLOWER: 2 }, TIME: 3, CATEGORY: 'FURNITURE' },
  // Útiles de casa (P6).
  WELL: { NAME: 'Pozo', ICON: '⛲', RECIPE: { REFINED_STONE: 8, ROPE: 2, BUCKET: 1 }, TIME: 15, CATEGORY: 'FURNITURE', DESC: 'Agua para siempre junto a casa: E para beber, llenar el cubo o el odre.' },
  RAIN_COLLECTOR: { NAME: 'Recolector de lluvia', ICON: '🌧️', RECIPE: { REFINED_WOOD: 4, CLOTH: 2 }, TIME: 8, CATEGORY: 'FURNITURE', DESC: 'Un toldo que recoge agua en un barril (más si llueve). E: beber o llenar.' },
  DRYING_RACK: { NAME: 'Secadero', ICON: '🥓', RECIPE: { WOOD: 4, ROPE: 2 }, TIME: 6, STATION_PIECE: true, DESC: 'Cecina, pescado seco y fruta seca: comida que alimenta y no sienta mal (E).' },
  MANNEQUIN: { NAME: 'Maniquí', ICON: '🧍', RECIPE: { WOOD: 3, FIBER: 2 }, TIME: 4, CATEGORY: 'FURNITURE', DESC: 'E: te cambias la armadura con la suya (guárdala vistosa).' },
  // Solo en las lunas (BODIES): cargan baterías plank y rellenan el oxígeno del traje.
  CHARGING_STATION: { NAME: 'Estación de carga', ICON: '🔌', RECIPE: { STONE: 4, MINERAL: 3 }, TIME: 8, BODIES: 'MOON' },
  OXYGEN_STATION: { NAME: 'Estación de oxígeno', ICON: '🫧', RECIPE: { STONE: 4, MINERAL: 4 }, TIME: 8, BODIES: 'MOON' },
};
const pieceItemId = (type) => BUILD_PIECES[type].ITEM ?? `PIECE_${type}`;
// Objetos de las piezas (los que no tienen objeto propio).
const PIECE_ITEMS = Object.fromEntries(Object.entries(BUILD_PIECES).filter(([, d]) => !d.ITEM).map(([type, d]) => [
  `PIECE_${type}`,
  { NAME: d.NAME, ICON: d.ICON, USE: 'BUILD', BUILD_PIECE: type, DESC: d.DESC ?? 'Pieza de construcción: selecciónala en la barra para colocarla (clic). Rompiéndola vuelve al inventario.' },
]));
const PIECE_RECIPES = Object.fromEntries(Object.entries(BUILD_PIECES).filter(([, d]) => d.RECIPE).map(([type, d]) => [
  `PIECE_${type}`,
  { RESULT: pieceItemId(type), AMOUNT: 1, CATEGORY: d.STATION_PIECE ? 'STATIONS' : d.CATEGORY ?? 'CONSTRUCTION', TIME: d.TIME ?? 3, INGREDIENTS: d.RECIPE, ...(d.LOCK ? { LOCK: d.LOCK } : {}) },
]));

export const GameConfig = deepFreeze({
  GAME: {
    TITLE: 'Mundo Cero',
    VERSION: '1.30.0',
  },

  RENDER: {
    MAX_PIXEL_RATIO: 2,
    ANTIALIAS: true,
    SHADOWS: true,
    SHADOW_MAP_SIZE: 2048,
    SHADOW_AREA: 60,          // lado del área (m) cubierta por la sombra del sol, centrada en el jugador
    FOV: 70,
    NEAR: 0.1,
    FAR: 1700,
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
      DESCEND: ['KeyC', 'ControlLeft'], // bucear, bajar (nave, vuelo)
      CROUCH: ['KeyC'],                 // a pie: agacharse / levantarse
      TOGGLE_CAMERA: ['KeyV'],
      TOGGLE_HELP: ['KeyH'],
      JOURNAL: ['KeyK'],                // diario: encargos, tesoros, habilidades y logros (P8)
      INTERACT: ['KeyE'],               // recoger / interactuar
      ATTACK: ['Mouse0', 'KeyF'],       // golpear (clic izquierdo con el ratón capturado)
      USE: ['Mouse2', 'KeyR'],          // usar el objeto seleccionado · en modo construcción: quitar pieza
      AMMO_NEXT: ['KeyX'],              // arco: cambiar de tipo de flecha
      COMPASS: ['KeyJ'],                // historia: mostrar / ocultar la brújula
      ROTATE: ['KeyQ'],                 // girar la pieza antes de colocarla
      CRAFTING: ['Tab'],                // abrir/cerrar el panel de fabricación
      INVENTORY: ['KeyI'],              // abrir/cerrar el inventario (mochila 9×3 + barra + ropa)
      DROP: ['KeyQ'],                   // tirar al suelo una unidad del objeto seleccionado (fuera del modo construcción)
      BUILD_MODE: ['KeyB'],             // entrar/salir del modo construcción
      SHIP_TAKEOFF: ['KeyT'],           // nave (a los mandos): despegar / aterrizar
      SHIP_HATCH: ['KeyG'],             // nave: abrir / cerrar la compuerta
      SHIP_LEGS: ['KeyL'],              // nave: recoger / sacar las patas de aterrizaje
      SHIP_ORBIT: ['KeyO'],             // nave: salir al espacio (en vuelo, a bastante altura)
      STAR_MAP: ['KeyM'],               // a los mandos: mapa estelar 3D
      MUTE: ['KeyN'],                   // silenciar / activar el sonido
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
    // Nadar y bucear (en el mar o en una charca más honda que ENTER_DEPTH).
    SWIM: {
      SPEED: 2.4,               // m/s
      RUN_SPEED: 3.6,           // con Shift
      VERTICAL_SPEED: 2.2,      // Espacio sube, C bucea
      ENTER_DEPTH: 1.15,        // m de agua sobre los pies a partir de los que se nada
      FLOAT_DEPTH: 1.3,         // pies bajo la superficie al flotar (la cabeza queda fuera)
      BUOYANCY: 2.5,            // lo deprisa que se vuelve a flotar sin pulsar nada
      ENTRY_DAMPING: 0.25,      // al caer al agua la velocidad vertical se reduce a esto
    },
    FLY_SPEED: 18,
    GROUND_ACCELERATION: 40,  // m/s² — respuesta en suelo
    AIR_ACCELERATION: 10,     // m/s² — control en el aire
    JUMP_VELOCITY: 5.6,       // ≈1.6 m de altura de salto con la gravedad por defecto
    GRAVITY: 9.81 * 1.0,
    TERMINAL_VELOCITY: 40,
    MAX_STEP_HEIGHT: 0.45,    // escalones que se suben sin saltar
    MAX_WALKABLE_SLOPE_DEG: 40, // pendientes más inclinadas no se suben caminando: se escalan
    // Escalada: al avanzar contra una pendiente de más de START_SLOPE_DEG el personaje trepa
    // (gasta energía: ENERGY_CLIMB_COST). Sin energía no puede y resbala pendiente abajo.
    CLIMB: {
      START_SLOPE_DEG: 40,
      SPEED: 3.2,             // m/s a lo largo de la pendiente
      SLIDE_SPEED: 3.5,       // m/s resbalando agotado
    },
    PITCH_LIMIT: Math.PI / 2 - 0.05,
    // Agacharse (C, se alterna): más bajo y más lento.
    CROUCH: { HEIGHT: 1.25, EYE_HEIGHT: 1.1, SPEED_MULTIPLIER: 0.45 },
    // Esquivar: un toque corto de Shift lanza al jugador hacia donde pulsa WASD (atrás si no pulsa nada).
    // Durante INVULNERABLE s no le alcanzan los ataques.
    DODGE: { TAP_TIME: 0.22, SPEED: 11, TIME: 0.26, COOLDOWN: 0.7, INVULNERABLE: 0.32 },
    BODY_TURN_SPEED: 10,      // rad/s con que el cuerpo gira hacia la dirección de avance
    // Se empieza desnudo: sin ropa, el cuerpo es del color de la piel y tres hojas
    // tapan pecho y entrepierna (desaparecen al ponerse camiseta o pantalones).
    COLORS: {
      SKIN: 0xe0ac86,
      HAIR: 0x4b2e1a,
      LEAF: 0x4f9a3a,
      WATCH: 0x2b3440,         // correa y caja del reloj de pulsera
      WATCH_SCREEN: 0x4fe0ff,  // pantalla del reloj (brilla)
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
    SUB_SEEDS: ['terrain', 'biome', 'resource', 'animal', 'celestial', 'spawn'],
    WORLD_SIZE: 1024,         // lado de una región "pequeña" (m); cada cuerpo usa el de su tamaño (0,5–20 km)
    CHUNK_SIZE: 64,           // m
    CHUNK_RESOLUTION: 32,     // celdas por lado de chunk (→ 2 m entre vértices)
    VIEW_DISTANCE_CHUNKS: 4,  // radio de chunks con malla alrededor del jugador
    CHUNKS_BUILT_PER_FRAME: 2,
    CHUNK_DATA_CACHE: 900,    // chunks de alturas en memoria (los menos usados se descartan y se regeneran iguales)
    EDGE_MARGIN: 96,          // franja del borde donde el terreno baja al mar (no jugable)
    SEA_LEVEL: 0,
    PROPS_VIEW_DISTANCE_CHUNKS: 3, // radio con árboles/rocas/hierba (≤ VIEW_DISTANCE_CHUNKS)
    SPAWN_SEARCH_RADIUS: 160,
    SPAWN_ATTEMPTS: 300,
    SPAWN_MIN_HEIGHT_ABOVE_SEA: 1.5,
    SPAWN_MAX_SLOPE: 0.25,    // desnivel/distancia
  },

  // La campaña: el sistema solar en el que se empieza. Los planetas y lunas (relieve,
  // biomas, flora, fauna, órbitas…) se describen en JSON (systems/*.system.json) y
  // pasan por el mismo validador y compilador que un sistema importado (js/systemdata).
  CAMPAIGN: {
    SYSTEM_FILE: 'jardin-del-eden',          // systems/<archivo>.system.json: el tutorial
    CATALOG_URL: 'systems/catalogo.json',    // sistemas a los que se salta con el nodo de velocidad-luz
    // Mapas diseñados (maps/<id>/): cuerpo del sistema de la campaña → mapa. Solo los del
    // juego; los sistemas importados siguen siendo procedurales.
    MAPS: { 0: 'eden' },                     // índice del planeta en el sistema → mapa
  },

  // Supervivencia (Fase 6). Valores por segundo de juego.
  // Duraciones aproximadas de 100 → 0: hambre 25 min, sed 15 min. La energía no baja con el
  // tiempo: se gasta al esforzarse y se recupera descansando (EnergySystem).
  SURVIVAL: {
    MAX_HEALTH: 100,
    MAX_HUNGER: 100,
    MAX_THIRST: 100,
    MAX_ENERGY: 100,

    HUNGER_DECAY: 100 / 1500,
    THIRST_DECAY: 100 / 900,

    STARVING_DAMAGE: 0.8,           // vida/s con hambre a 0
    DEHYDRATION_DAMAGE: 1.2,        // vida/s con sed a 0
    STAT_DAMAGE_TICK: 2,            // s entre golpes de daño por hambre/sed

    HEALTH_REGEN: 0.4,              // vida/s si hambre y sed están bien
    HEALTH_REGEN_DELAY: 6,          // s sin recibir daño antes de curarse
    HEALTH_REGEN_MIN_RATIO: 0.4,    // hambre y sed por encima de este % para curarse

    FALL_DAMAGE_MIN_SPEED: 13,      // m/s de caída a partir de los que duele (~8.6 m)
    FALL_DAMAGE_PER_MS: 6,          // vida por cada m/s por encima del mínimo

    DRINK_AMOUNT: 20,               // sed recuperada por trago en una fuente

    // Energía (esfuerzo): gastos por segundo o por acción, y recuperación al descansar.
    ENERGY_RUN_COST: 5,             // /s corriendo (20 s de carrera con la energía llena)
    ENERGY_SWIM_RUN_COST: 7,        // /s nadando deprisa
    ENERGY_CLIMB_COST: 9,           // /s escalando una pendiente
    ENERGY_CLIMB_HOLD_COST: 3,      // /s agarrado a la pendiente sin moverse
    ENERGY_ACTION_COST: 4,          // por golpear (animales, rocas) o recoger
    ENERGY_CHOP_COST: 2.5,          // por golpe al talar, picar o romper
    ENERGY_JUMP_COST: 4,
    ENERGY_DODGE_COST: 10,
    ENERGY_REGEN: 10,               // /s recuperada al descansar
    ENERGY_REGEN_DELAY: 1.5,        // s sin esfuerzo antes de empezar a recuperarse
    ENERGY_REGEN_HUNGRY: 0.5,       // la recuperación se reduce con hambre o sed bajas
    ENERGY_NO_RUN_RATIO: 0.25,      // agotado: no se corre ni escala hasta recuperar este %
    EXHAUSTED_SPEED_MULTIPLIER: 0.8, // velocidad agotado

    LOW_RATIO: 0.25,                // aviso "tienes sed/hambre/estás cansado"
    CRITICAL_RATIO: 0.1,            // aviso más fuerte y barra parpadeando

    RESPAWN_DELAY: 3,               // s antes de poder reaparecer
    RESPAWN_VALUES: { HEALTH: 100, HUNGER: 70, THIRST: 70, ENERGY: 70 },
    KEEP_INVENTORY_ON_DEATH: true,
  },

  // Niveles: la experiencia (XP) se gana recogiendo, talando, picando, fabricando y cazando.
  // Cada nivel da POINTS_PER_LEVEL puntos para subir una estadística (menú del reloj → «Tú»).
  PROGRESSION: {
    MAX_LEVEL: 100,
    POINTS_PER_LEVEL: 1,
    XP_BASE: 50,          // XP para pasar del nivel 1 al 2
    XP_GROWTH: 25,        // cada nivel pide esto más que el anterior
    XP: {
      HARVEST: 1,         // por cada unidad recogida (madera, piedra, fruta, telaraña…)
      FELL_TREE: 12,      // árbol talado
      BREAK_ROCK: 12,     // roca rota con el pico
      COBWEB: 4,          // telaraña recogida entera
      CRAFT_PER_SECOND: 0.6, // por cada segundo de fabricación de la receta
      KILL: 20,           // animal abatido
    },
    // Estadísticas que se suben con los puntos (de momento estas cuatro).
    STATS: {
      HEALTH: { NAME: 'Vida', ICON: '❤️', PER_POINT: 10, UNIT: '' },        // +10 de vida máxima
      STAMINA: { NAME: 'Estamina', ICON: '⚡', PER_POINT: 10, UNIT: '' },   // +10 de energía máxima
      DAMAGE: { NAME: 'Daño', ICON: '👊', PER_POINT: 0.08, UNIT: '%' },     // +8 % de daño y de rapidez al talar/picar
      SPEED: { NAME: 'Velocidad', ICON: '👟', PER_POINT: 0.03, UNIT: '%' }, // +3 % de velocidad al moverse
      // Habilidades (P8): se suben en el diario (K), como mucho MAX puntos cada una.
      GATHER: { NAME: 'Recolección', ICON: '🧺', PER_POINT: 0.1, UNIT: '%', MAX: 5, PERK: true, DESC: 'Probabilidad de sacar una unidad más al recoger.' },
      CRAFT: { NAME: 'Oficio', ICON: '🪓', PER_POINT: 0.08, UNIT: '%', MAX: 5, PERK: true, DESC: 'Talas, picas y rompes más deprisa.' },
      ANGLER: { NAME: 'Pesca', ICON: '🎣', PER_POINT: 0.07, UNIT: '%', MAX: 5, PERK: true, DESC: 'La zona verde de la pesca es más grande.' },
      TRADE: { NAME: 'Regateo', ICON: '💰', PER_POINT: 0.05, UNIT: '%', MAX: 5, PERK: true, DESC: 'Compras más barato y vendes más caro.' },
      SURVIVAL: { NAME: 'Aguante', ICON: '🍖', PER_POINT: 0.05, UNIT: '%', MAX: 5, PERK: true, DESC: 'El hambre y la sed bajan más despacio.' },
    },
  },

  // Inventario por huecos: barra rápida 9 × 1 (teclas 1–9) + mochila 9 × 3 (tecla I).
  INVENTORY: {
    HOTBAR_SLOTS: 9,
    MAIN_ROWS: 3,
    MAIN_COLUMNS: 9,
    MAX_STACK: 100,           // unidades por hueco (ITEMS.*.STACK lo cambia; la ropa no se apila)
    MAX_EXTRA_ROWS: 2,        // filas que añaden las mochilas (P5)
  },

  // Tipos de recurso: qué dan al recogerlos, colisión y tamaño.
  // HARVEST: cada acción de recoger da 1 ITEM hasta agotar AMOUNT. Si REMOVE_WHEN_EMPTY,
  // el recurso desaparece; si no, vuelve a dar fruto tras REGROW_SECONDS.
  // METHOD 'HIT': se saca golpeando (clic / F, o manteniéndolo), no con E (los troncos).
  //   CHOP_TIME: segundos de golpes con el puño para talarlo entero; una herramienta
  //   (ITEMS.*.TOOL.CHOP_SPEED) lo acorta: el árbol cae antes, pero da la misma madera.
  // SCALE_COLLISION: el radio de colisión crece con el tamaño del ejemplar.
  // AIM_HEIGHT / AIM_RADIUS: dónde y con qué tolerancia apunta la mira al recurso.
  RESOURCE_TYPES: {
    TREE: {
      NAME: 'Árbol', COLLISION_RADIUS: 0.24, SCALE_COLLISION: true, SCALE: [1.7, 2.4], AIM_HEIGHT: 0.6, AIM_RADIUS: 0.5,
      HARVEST: { ITEM: 'WOOD', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Talar (mantén el clic)', METHOD: 'HIT', CHOP_TIME: 15 },
    },
    PINE: {
      NAME: 'Pino', COLLISION_RADIUS: 0.22, SCALE_COLLISION: true, SCALE: [1.6, 2.5], AIM_HEIGHT: 0.6, AIM_RADIUS: 0.5,
      HARVEST: { ITEM: 'WOOD', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Talar (mantén el clic)', METHOD: 'HIT', CHOP_TIME: 15, BONUS: { RESIN: [1, 2] } },
    },
    APPLE_TREE: {
      NAME: 'Manzano', COLLISION_RADIUS: 0.3, SCALE: [0.85, 1.1], AIM_HEIGHT: 1.8, AIM_RADIUS: 1.3,
      HARVEST: { ITEM: 'APPLE', AMOUNT: 3, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 180, VERB: 'Coger manzana' },
    },
    ROCK: {
      NAME: 'Roca', COLLISION_RADIUS: 0.75, SCALE: [0.5, 1.4], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.9,
      // Con E se cogen las piedras sueltas de alrededor (vuelven a aparecer con el tiempo).
      HARVEST: { ITEM: 'STONE', AMOUNT: 2, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 600, VERB: 'Coger piedra suelta' },
      // Romperla entera: solo con un pico (TOOL.MINE_SPEED); a puñetazos no se rompe y duele.
      BREAK: { ITEM: 'STONE', AMOUNT: 5, TIME: 6, TOOL: 'MINE_SPEED', FIST_DAMAGE: 6, VERB: 'Picar (mantén el clic)' },
    },
    // Telarañas: aparecen tendidas entre dos árboles cercanos (SPAWN). Se rompen a golpes
    // (1,5 s con el puño) y dan entre 5 y 10 telarañas.
    COBWEB: {
      NAME: 'Telaraña', COLLISION_RADIUS: 0, SCALE: [1, 1], AIM_HEIGHT: 0, AIM_RADIUS: 0.8,
      HARVEST: { ITEM: 'SPIDER_SILK', AMOUNT: 5, AMOUNT_RANGE: [5, 10], REMOVE_WHEN_EMPTY: true, VERB: 'Recoger', METHOD: 'HIT', CHOP_TIME: 1.5, MATERIAL: 'web' },
      SPAWN: { BETWEEN: ['TREE', 'PINE'], MIN_GAP: 2.0, MAX_GAP: 5.0, CHANCE: 0.06, HEIGHT: 1.7, MAX_SIZE: 1.5 },
    },
    // Arbusto: con E se arranca fibra (vuelve a crecer). P5.
    BUSH: {
      NAME: 'Arbusto', COLLISION_RADIUS: 0, SCALE: [0.7, 1.3], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.6,
      HARVEST: { ITEM: 'FIBER', AMOUNT: 2, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 240, VERB: 'Arrancar fibra' },
    },
    // P5: arcilla en las orillas de lagos y marismas, flores en las praderas.
    // CELL_ID: su identificador va por celda (no cambia el de los recursos que ya había).
    CLAY_DEPOSIT: {
      NAME: 'Arcilla', COLLISION_RADIUS: 0, SCALE: [0.8, 1.25], AIM_HEIGHT: 0.08, AIM_RADIUS: 0.75, CELL_ID: true,
      HARVEST: { ITEM: 'CLAY', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Sacar arcilla' },
    },
    // P4: hortalizas silvestres (de ellas salen las primeras para sembrar).
    WILD_CARROT: {
      NAME: 'Zanahorias silvestres', COLLISION_RADIUS: 0, SCALE: [0.85, 1.15], AIM_HEIGHT: 0.15, AIM_RADIUS: 0.55, CELL_ID: true,
      HARVEST: { ITEM: 'CARROT', AMOUNT: 2, REMOVE_WHEN_EMPTY: true, VERB: 'Arrancar zanahorias' },
    },
    WILD_POTATO: {
      NAME: 'Patatas silvestres', COLLISION_RADIUS: 0, SCALE: [0.85, 1.15], AIM_HEIGHT: 0.15, AIM_RADIUS: 0.55, CELL_ID: true,
      HARVEST: { ITEM: 'POTATO', AMOUNT: 2, REMOVE_WHEN_EMPTY: true, VERB: 'Sacar patatas' },
    },
    WILD_PUMPKIN: {
      NAME: 'Calabaza silvestre', COLLISION_RADIUS: 0, SCALE: [0.85, 1.2], AIM_HEIGHT: 0.25, AIM_RADIUS: 0.7, CELL_ID: true,
      HARVEST: { ITEM: 'PUMPKIN', AMOUNT: 1, REMOVE_WHEN_EMPTY: true, VERB: 'Coger calabaza' },
    },
    WILD_FLOWERS: {
      NAME: 'Flores silvestres', COLLISION_RADIUS: 0, SCALE: [0.8, 1.2], AIM_HEIGHT: 0.25, AIM_RADIUS: 0.55, CELL_ID: true,
      HARVEST: { ITEM: 'WILD_FLOWER', AMOUNT: 2, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 420, VERB: 'Coger flores' },
    },
    // Comida silvestre (P2): bayas, setas, trigo y huevos de los nidos.
    BERRY_BUSH: {
      NAME: 'Zarzal', COLLISION_RADIUS: 0, SCALE: [0.8, 1.2], AIM_HEIGHT: 0.45, AIM_RADIUS: 0.75,
      HARVEST: { ITEM: 'BERRIES', AMOUNT: 3, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 300, VERB: 'Coger bayas' },
    },
    MUSHROOM: {
      NAME: 'Setas', COLLISION_RADIUS: 0, SCALE: [0.9, 1.4], AIM_HEIGHT: 0.12, AIM_RADIUS: 0.5,
      HARVEST: { ITEM: 'MUSHROOM', AMOUNT: 2, REMOVE_WHEN_EMPTY: true, VERB: 'Coger setas' },
    },
    WILD_WHEAT: {
      NAME: 'Trigo silvestre', COLLISION_RADIUS: 0, SCALE: [0.85, 1.2], AIM_HEIGHT: 0.5, AIM_RADIUS: 0.6,
      HARVEST: { ITEM: 'WHEAT', AMOUNT: 2, REMOVE_WHEN_EMPTY: true, VERB: 'Segar trigo' },
    },
    BIRD_NEST: {
      NAME: 'Nido', COLLISION_RADIUS: 0, SCALE: [0.9, 1.2], AIM_HEIGHT: 0.1, AIM_RADIUS: 0.45,
      HARVEST: { ITEM: 'EGG', AMOUNT: 2, REMOVE_WHEN_EMPTY: false, REGROW_SECONDS: 600, VERB: 'Coger huevos' },
    },
    // Cuevas: vetas que solo se rompen con pico (como las rocas) y flores luminosas (E).
    COAL_ORE: {
      NAME: 'Veta de carbón', COLLISION_RADIUS: 0.5, SCALE: [0.8, 1.1], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.8, CAVE: true,
      HARVEST: { ITEM: 'COAL', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'COAL', AMOUNT: 3, TIME: 5, TOOL: 'MINE_SPEED', FIST_DAMAGE: 6, VERB: 'Picar carbón' },
    },
    COPPER_ORE: {
      NAME: 'Mena de cobre', COLLISION_RADIUS: 0.55, SCALE: [0.8, 1.2], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.85, CAVE: true,
      HARVEST: { ITEM: 'COPPER_ORE', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'COPPER_ORE', AMOUNT: 3, TIME: 6, TOOL: 'MINE_SPEED', FIST_DAMAGE: 6, VERB: 'Picar cobre' },
    },
    IRON_ORE: {
      NAME: 'Mena de hierro', COLLISION_RADIUS: 0.55, SCALE: [0.8, 1.2], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.85, CAVE: true,
      HARVEST: { ITEM: 'IRON_ORE', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'IRON_ORE', AMOUNT: 2, TIME: 8, TOOL: 'MINE_SPEED', TIER: 2, FIST_DAMAGE: 6, VERB: 'Picar hierro' },
    },
    DIAMOND_ORE: {
      NAME: 'Veta de diamante', COLLISION_RADIUS: 0.45, SCALE: [0.7, 1.0], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.8, CAVE: true,
      HARVEST: { ITEM: 'DIAMOND_ORE', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'DIAMOND_ORE', AMOUNT: 1, TIME: 12, TOOL: 'MINE_SPEED', TIER: 3, FIST_DAMAGE: 6, VERB: 'Picar diamante' },
    },
    GOLD_ORE: {
      NAME: 'Veta de oro', COLLISION_RADIUS: 0.5, SCALE: [0.75, 1.05], AIM_HEIGHT: 0.4, AIM_RADIUS: 0.8, CAVE: true,
      HARVEST: { ITEM: 'GOLD_ORE', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'GOLD_ORE', AMOUNT: 2, TIME: 8, TOOL: 'MINE_SPEED', TIER: 2, FIST_DAMAGE: 6, VERB: 'Picar oro' },
    },
    CRYSTAL_CLUSTER: {
      NAME: 'Drusa de cristal', COLLISION_RADIUS: 0.45, SCALE: [0.8, 1.3], AIM_HEIGHT: 0.5, AIM_RADIUS: 0.85, CAVE: true, LIGHT: 0xb48cff,
      HARVEST: { ITEM: 'CRYSTAL_SHARD', AMOUNT: 0, REMOVE_WHEN_EMPTY: false, VERB: 'Coger' },
      BREAK: { ITEM: 'CRYSTAL_SHARD', AMOUNT: 3, TIME: 7, TOOL: 'MINE_SPEED', TIER: 2, FIST_DAMAGE: 6, VERB: 'Picar cristales' },
    },
    GLOW_FLOWER: {
      NAME: 'Flor luminosa', COLLISION_RADIUS: 0, SCALE: [0.8, 1.2], AIM_HEIGHT: 0.5, AIM_RADIUS: 0.6, CAVE: true, LIGHT: 0x7fffd0,
      HARVEST: { ITEM: 'GLOW_FLOWER', AMOUNT: 1, REMOVE_WHEN_EMPTY: true, VERB: 'Coger' },
    },
    // Playa: montones de arena (E) para fundir cristal en el horno.
    SAND_PILE: {
      NAME: 'Montón de arena', COLLISION_RADIUS: 0, SCALE: [0.8, 1.3], AIM_HEIGHT: 0.1, AIM_RADIUS: 0.8,
      HARVEST: { ITEM: 'SAND', AMOUNT: 3, REMOVE_WHEN_EMPTY: true, VERB: 'Recoger arena' },
    },
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
    WOOD: { NAME: 'Madera', ICON: '🪵', DESC: 'Trozos de madera: golpea el tronco de un árbol para sacarlos.' },
    STONE: { NAME: 'Piedra', ICON: '🪨' },
    WOOL: { NAME: 'Lana', ICON: '🧶' },
    SPIDER_SILK: { NAME: 'Telaraña', ICON: '🕸️', DESC: 'Se saca golpeando las telarañas que hay entre algunos árboles. Con 5 se hace una cuerda.' },
    ROPE: { NAME: 'Cuerda', ICON: '🪢', DESC: 'Hecha con 5 telarañas.' },
    MINERAL: { NAME: 'Mineral', ICON: '💎' },
    SLIME: { NAME: 'Slime', ICON: '🟢', DESC: 'Baba pegajosa. La sueltan los slimes que salen de noche.' },
    COIN: { NAME: 'Moneda goblin', ICON: '🪙', DESC: 'Moneda tosca de los goblins.' },
    THRUSTER: { NAME: 'Propulsor', ICON: '🔥', DESC: 'Propulsor de nave. Los de la tuya quedaron destrozados.' },
    LEATHER: { NAME: 'Cuero', ICON: '🟫', DESC: 'Se refina en la mesa de refinería.' },
    REFINED_LEATHER: { NAME: 'Cuero refinado', ICON: '🟤', DESC: 'Cuero curtido en la mesa de refinería: para la ropa y el odre.' },
    REFINED_STONE: { NAME: 'Piedra refinada', ICON: '⬜', DESC: 'Bloque de piedra tallada (4 piedras).' },
    REFINED_WOOD: { NAME: 'Madera refinada', ICON: '🟧', DESC: 'Tabla de madera trabajada (2 de madera).' },
    REFINERY_KIT: { NAME: 'Mesa de refinería', ICON: '🛠️', STACK: 1, USE: 'BUILD', BUILD_PIECE: 'REFINERY', DESC: 'Selecciónala en la barra para colocarla. Con E en ella: cuero refinado, ropa de cuero y odre.' },
    // Fase 2: minerales (en las cuevas), arena (playa) y lo que sale del horno.
    COPPER_ORE: { NAME: 'Mena de cobre', ICON: '🔶', DESC: 'Se pica en las menas de cobre de las cuevas. Se funde en el horno.' },
    IRON_ORE: { NAME: 'Mena de hierro', ICON: '🔘', DESC: 'Dentro de las cuevas (menos que el cobre). Se funde en el horno.' },
    COAL: { NAME: 'Carbón', ICON: '⚫', DESC: 'En las entradas de las cuevas. Combustible del horno y de las antorchas.' },
    DIAMOND_ORE: { NAME: 'Diamante en bruto', ICON: '🔹', DESC: 'Muy raro, en lo hondo de las cuevas. Se talla en el horno.' },
    GLOW_FLOWER: { NAME: 'Flor luminosa', ICON: '🌼', DESC: 'La sueltan las flores luminosas de las cuevas.' },
    SAND: { NAME: 'Arena', ICON: '🟨', DESC: 'Se recoge en los montones de arena de la playa (E). En el horno se convierte en cristal.' },
    REFINED_COPPER: { NAME: 'Cobre refinado', ICON: '🥉', DESC: 'Lingote de cobre (horno).' },
    REFINED_IRON: { NAME: 'Hierro refinado', ICON: '🔩', DESC: 'Lingote de hierro (horno).' },
    REFINED_DIAMOND: { NAME: 'Diamante tallado', ICON: '💠', DESC: 'Diamante pulido (horno).' },
    GLASS: { NAME: 'Cristal', ICON: '🧊', DESC: 'Arena fundida en el horno.' },
    // Materiales (P5).
    CLAY: { NAME: 'Arcilla', ICON: '🟤', DESC: 'En las orillas de lagos, charcas y marismas (E). En el horno se cuece en ladrillos.' },
    BRICK: { NAME: 'Ladrillo', ICON: '🧱', DESC: 'Arcilla cocida (horno). Para la forja y la mesa de alquimia.' },
    FIBER: { NAME: 'Fibra vegetal', ICON: '🌿', DESC: 'Se arranca de los arbustos (E). Con 4: una cuerda o tela en el telar.' },
    CLOTH: { NAME: 'Tela', ICON: '🧵', DESC: 'Tejida en el telar (fibra o lana). Para la ropa de abrigo y las mochilas.' },
    RESIN: { NAME: 'Resina', ICON: '🟠', DESC: 'Sale al talar pinos. Antorchas que duran, cola, curtidor y pociones.' },
    BONE: { NAME: 'Hueso', ICON: '🦴', DESC: 'De los animales y los goblins. Flechas de hueso y poción de fuerza.' },
    GOLD_ORE: { NAME: 'Oro en bruto', ICON: '🟡', DESC: 'Vetas de oro de las cuevas (pico de cobre o mejor). Se funde en el horno.' },
    GOLD_INGOT: { NAME: 'Lingote de oro', ICON: '🥇', DESC: 'Del horno, o fundiendo 8 monedas goblin en la forja. Elixir dorado y manzana dorada.' },
    STEEL: { NAME: 'Acero', ICON: '⛓️', DESC: 'Hierro y carbón en la forja. Espada y escudo de acero, mochila grande.' },
    CRYSTAL_SHARD: { NAME: 'Fragmento de cristal', ICON: '🔮', DESC: 'De las drusas que brillan en las cuevas. Flechas de cristal y visión nocturna.' },
    WILD_FLOWER: { NAME: 'Flores silvestres', ICON: '🌸', DESC: 'De las praderas floridas. Para las pociones.' },
    GLUE: { NAME: 'Cola de slime', ICON: '🫙', DESC: 'Slime y resina: pega fuerte. Para las mochilas.' },
    GLASS_BOTTLE: { NAME: 'Frasco', ICON: '🧪', DESC: 'Frasco de cristal (horno). Vuelve vacío al beber una poción.' },
    DIAMOND_DUST: { NAME: 'Polvo de diamante', ICON: '✨', DESC: 'Diamante molido en la mesa de alquimia: fuerza y elixir dorado.' },
    NAV_PLATE: { NAME: 'Placa de navegación', ICON: '📟', STACK: 1, DESC: 'Placa base de navegación de la nave. Se fabrica en la mesa de elaboración.' },
    // Armas. WEAPON.DAMAGE: daño por golpe (con el nivel de daño). DURABILITY: golpes o disparos.
    STONE_SWORD: { NAME: 'Espada básica', ICON: '🗡️', STACK: 1, DURABILITY: 400, WEAPON: { DAMAGE: 10 }, MODEL: { TYPE: 'sword', BLADE: 0x9b9fa5, GUARD: 0x6b4a2f, LENGTH: 0.62 }, DESC: '10 de daño. Aguanta 400 golpes.' },
    COPPER_SWORD: { NAME: 'Espada de cobre', ICON: '⚔️', STACK: 1, DURABILITY: 600, WEAPON: { DAMAGE: 12 }, MODEL: { TYPE: 'sword', BLADE: 0xd08a4e, GUARD: 0x8a5a32, LENGTH: 0.7 }, DESC: '12 de daño. Aguanta 600 golpes.' },
    IRON_SWORD: { NAME: 'Espada de hierro', ICON: '🔪', STACK: 1, DURABILITY: 400, WEAPON: { DAMAGE: 15 }, MODEL: { TYPE: 'sword', BLADE: 0xc8ccd2, GUARD: 0x3b3f45, LENGTH: 0.78 }, DESC: '15 de daño. Aguanta 400 golpes.' },
    // A distancia: clic derecho mantenido apunta, clic izquierdo mantenido tensa y al soltar dispara.
    SLINGSHOT: { NAME: 'Tirachinas', ICON: '🪃', STACK: 1, DURABILITY: 400, RANGED: { AMMO: ['STONE'], DAMAGE: 5, SPEED: 32, DRAW_TIME: 0.45 }, MODEL: { TYPE: 'slingshot' }, DESC: 'Dispara piedras (5 de daño). Clic dcho apuntar · clic tensar y soltar. 400 disparos.' },
    BOW: { NAME: 'Arco', ICON: '🏹', STACK: 1, DURABILITY: 400, RANGED: { AMMO: ['ARROW', 'BONE_ARROW', 'COPPER_ARROW', 'IRON_ARROW', 'FIRE_ARROW', 'CRYSTAL_ARROW'], SPEED: 48, DRAW_TIME: 0.8 }, MODEL: { TYPE: 'bow' }, DESC: 'El daño depende de la flecha. X cambia de flecha. Clic dcho apuntar · clic tensar y soltar. 400 disparos.' },
    ARROW: { NAME: 'Flecha', ICON: '➹', AMMO: { DAMAGE: 10 }, MODEL: { TYPE: 'arrow', TIP: 0x8d8f93 }, DESC: '10 de daño. Se gasta al dispararla.' },
    COPPER_ARROW: { NAME: 'Flecha de cobre', ICON: '➶', AMMO: { DAMAGE: 15 }, MODEL: { TYPE: 'arrow', TIP: 0xd08a4e }, DESC: '15 de daño (mesa de elaboración).' },
    IRON_ARROW: { NAME: 'Flecha de hierro', ICON: '➵', AMMO: { DAMAGE: 20 }, MODEL: { TYPE: 'arrow', TIP: 0xc8ccd2 }, DESC: '20 de daño (mesa de elaboración).' },
    BONE_ARROW: { NAME: 'Flecha de hueso', ICON: '➴', AMMO: { DAMAGE: 13 }, MODEL: { TYPE: 'arrow', TIP: 0xece4cf }, DESC: '13 de daño. Con huesos, en el reloj.' },
    STEEL_SWORD: { NAME: 'Espada de acero', ICON: '🗡️', STACK: 1, DURABILITY: 1000, WEAPON: { DAMAGE: 18 }, REPAIR: 'STEEL', MODEL: { TYPE: 'sword', BLADE: 0xdde3ea, GUARD: 0x2e3238, LENGTH: 0.82 }, DESC: '18 de daño. Aguanta 1000 golpes (forja).' },
    STEEL_SHIELD: { NAME: 'Escudo de acero', ICON: '🛡️', USE: 'EQUIP', SLOT: 'OFFHAND', STACK: 1, DURABILITY: 170, SHIELD: true, REPAIR: 'STEEL', MODEL: { TYPE: 'shield', FACE: 0xc7cdd4, RIM: 0x3b4046 }, DESC: 'Clic dcho mantenido: bloquear. Aguanta 170 golpes (forja).' },
    // Escudos (mano izquierda, ranura ESCUDO): clic derecho mantenido para bloquear. Aguante = golpes parados.
    COPPER_SHIELD: { NAME: 'Escudo de cobre', ICON: '🛡️', USE: 'EQUIP', SLOT: 'OFFHAND', STACK: 1, DURABILITY: 50, SHIELD: true, MODEL: { TYPE: 'shield', FACE: 0xb87333, RIM: 0x6e4a2a }, DESC: 'Clic dcho mantenido: bloquear (no se puede atacar a la vez). Aguanta 50 golpes.' },
    IRON_SHIELD: { NAME: 'Escudo de hierro', ICON: '🔰', USE: 'EQUIP', SLOT: 'OFFHAND', STACK: 1, DURABILITY: 100, SHIELD: true, MODEL: { TYPE: 'shield', FACE: 0xa9aeb5, RIM: 0x4a4f55 }, DESC: 'Clic dcho mantenido: bloquear. Aguanta 100 golpes.' },
    TORCH: { NAME: 'Antorcha', ICON: '🔥', USE: 'BUILD', BUILD_PIECE: 'TORCH', HOLD: true, MODEL: { TYPE: 'torch' }, DESC: 'En la mano ilumina. Clic dcho / R para clavarla en el suelo.' },
    ...PIECE_ITEMS,
    // Comida. NUTRITION: hambre que quita (o la clave de NUTRITION). FOOD: ANIMAL, PLANT o MIXED.
    // EFFECTS: estados al comerla (s). RAW_RISK: probabilidad de indigestión (crudo). THIRST: sed que quita.
    MEAT: { NAME: 'Carne cruda', ICON: '🥩', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 'MEAT_NUTRITION', RAW_RISK: 0.45, DESC: 'Cruda puede sentar mal (indigestión). Ásala en una hoguera.' },
    APPLE: { NAME: 'Manzana', ICON: '🍎', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 'APPLE_NUTRITION' },
    COOKED_MEAT: { NAME: 'Carne asada', ICON: '🍖', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 42, EFFECTS: { WARM: 180 }, DESC: 'Alimenta más que cruda y da calor (comida caliente, 3 min).' },
    BERRIES: { NAME: 'Bayas', ICON: '🫐', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 7, DESC: 'De los zarzales. Con 6 se hace mermelada.' },
    MUSHROOM: { NAME: 'Setas', ICON: '🍄', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 6, RAW_RISK: 0.2, DESC: 'Mejor asadas o en sopa.' },
    ROASTED_MUSHROOM: { NAME: 'Setas asadas', ICON: '🍢', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 15, EFFECTS: { WARM: 90 } },
    EGG: { NAME: 'Huevo', ICON: '🥚', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 8, RAW_RISK: 0.35, DESC: 'De los nidos al pie de los árboles.' },
    FRIED_EGG: { NAME: 'Huevo frito', ICON: '🍳', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 18, EFFECTS: { WARM: 90 } },
    BAKED_APPLE: { NAME: 'Manzana asada', ICON: '🍏', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 20, EFFECTS: { WARM: 90 } },
    SKEWER: { NAME: 'Brocheta', ICON: '🍡', USE: 'EAT', FOOD: 'MIXED', NUTRITION: 46, EFFECTS: { WARM: 180 }, DESC: 'Carne y setas al fuego: de todo un poco.' },
    WHEAT: { NAME: 'Trigo', ICON: '🌾', DESC: 'Trigo silvestre de las praderas. Para el pan y la tarta (cocina).' },
    BREAD: { NAME: 'Pan', ICON: '🍞', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 30, EFFECTS: { WELL_FED: 240 } },
    STEW: { NAME: 'Estofado', ICON: '🍲', USE: 'EAT', FOOD: 'MIXED', NUTRITION: 56, EFFECTS: { WELL_FED: 360, WARM: 300 }, DESC: 'Bien alimentado y caliente durante un buen rato.' },
    MUSHROOM_SOUP: { NAME: 'Sopa de setas', ICON: '🥣', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 32, THIRST: 25, EFFECTS: { WARM: 300 }, DESC: 'Calienta y quita la sed.' },
    JAM: { NAME: 'Mermelada', ICON: '🍯', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 22, EFFECTS: { ENERGIZED: 180 }, DESC: 'La energía se recupera mucho más deprisa (3 min).' },
    APPLE_PIE: { NAME: 'Tarta de manzana', ICON: '🥧', USE: 'EAT', FOOD: 'MIXED', NUTRITION: 60, EFFECTS: { WELL_FED: 480, ENERGIZED: 120 }, DESC: 'El mejor plato del Edén.' },
    GOLDEN_APPLE: { NAME: 'Manzana dorada', ICON: '🌕', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 30, HEAL: 30, EFFECTS: { REGENERATION: 40 }, DESC: 'Cura 30 y regenera la vida un rato (mesa de alquimia).' },
    // Pociones (P5, mesa de alquimia). USE 'POTION': se bebe y devuelve el frasco vacío.
    // HEAL: vida al momento. EFFECTS: estados (STATUS_EFFECTS) y su duración en s.
    HEALING_POTION: { NAME: 'Poción de curación', ICON: '💗', STACK: 10, USE: 'POTION', HEAL: 45, EFFECTS: { REGENERATION: 20 }, MODEL: { TYPE: 'potion', COLOR: 0xff4f7a }, DESC: 'Cura 45 de vida al momento y regenera 20 s.' },
    STRENGTH_POTION: { NAME: 'Poción de fuerza', ICON: '💪', STACK: 10, USE: 'POTION', EFFECTS: { STRENGTH: 180 }, MODEL: { TYPE: 'potion', COLOR: 0xd0402a }, DESC: 'Golpes y disparos un 35 % más fuertes (3 min).' },
    SWIFT_POTION: { NAME: 'Poción de rapidez', ICON: '💨', STACK: 10, USE: 'POTION', EFFECTS: { SWIFT: 180 }, MODEL: { TYPE: 'potion', COLOR: 0x7fe0ff }, DESC: 'Caminas y corres un 25 % más deprisa (3 min).' },
    WARMTH_POTION: { NAME: 'Poción de calor', ICON: '🌡️', STACK: 10, USE: 'POTION', EFFECTS: { WARMTH: 300 }, MODEL: { TYPE: 'potion', COLOR: 0xff9a2a }, DESC: 'El frío casi no te afecta (5 min): para las montañas heladas.' },
    NIGHT_VISION_POTION: { NAME: 'Poción de visión nocturna', ICON: '👁️', STACK: 10, USE: 'POTION', EFFECTS: { NIGHT_VISION: 240 }, MODEL: { TYPE: 'potion', COLOR: 0x9c7bff }, DESC: 'Ves en la oscuridad de las cuevas y de la noche (4 min).' },
    LEAP_POTION: { NAME: 'Poción de salto', ICON: '🐸', STACK: 10, USE: 'POTION', EFFECTS: { LEAP: 150 }, MODEL: { TYPE: 'potion', COLOR: 0x62c24a }, DESC: 'Saltas mucho más alto y las caídas duelen la mitad (2,5 min).' },
    GOLDEN_ELIXIR: { NAME: 'Elixir dorado', ICON: '🌟', STACK: 5, USE: 'POTION', HEAL: 100, EFFECTS: { REGENERATION: 60, STRENGTH: 90, SWIFT: 90, WARMTH: 90 }, MODEL: { TYPE: 'potion', COLOR: 0xffd34a }, DESC: 'Cura del todo y da fuerza, rapidez, calor y regeneración (1,5 min).' },
    // Granja (P4): semillas y cosecha. SEED: qué cultivo se siembra con él (FARM.CROPS).
    WHEAT_SEEDS: { NAME: 'Semillas de trigo', ICON: '🌰', SEED: 'WHEAT', DESC: 'Con E sobre una parcela: sembrar trigo. Salen del trigo (reloj).' },
    CARROT: { NAME: 'Zanahoria', ICON: '🥕', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 9, SEED: 'CARROT', DESC: 'Se come cruda. Con E sobre una parcela: sembrarla.' },
    POTATO: { NAME: 'Patata', ICON: '🥔', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 6, RAW_RISK: 0.25, SEED: 'POTATO', DESC: 'Mejor asada. Con E sobre una parcela: sembrarla.' },
    PUMPKIN: { NAME: 'Calabaza', ICON: '🎃', DESC: 'Para la tarta de calabaza y semillas (reloj).' },
    PUMPKIN_SEEDS: { NAME: 'Pipas de calabaza', ICON: '🫘', SEED: 'PUMPKIN', DESC: 'Con E sobre una parcela: sembrar calabaza.' },
    BONE_MEAL: { NAME: 'Harina de hueso', ICON: '🦴', FERTILIZER: true, DESC: 'Abono: con E sobre una parcela sembrada, crece más deprisa y da más.' },
    JERKY: { NAME: 'Cecina', ICON: '🥓', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 30, DESC: 'Carne curada al aire (secadero): no sienta mal.' },
    DRIED_FISH: { NAME: 'Pescado seco', ICON: '🐟', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 24 },
    DRIED_FRUIT: { NAME: 'Fruta seca', ICON: '🍇', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 22, EFFECTS: { ENERGIZED: 90 } },
    BAKED_POTATO: { NAME: 'Patata asada', ICON: '🥔', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 20, EFFECTS: { WARM: 120 } },
    PUMPKIN_PIE: { NAME: 'Tarta de calabaza', ICON: '🥧', USE: 'EAT', FOOD: 'MIXED', NUTRITION: 55, EFFECTS: { WELL_FED: 420 } },
    VEGETABLE_STEW: { NAME: 'Guiso de verduras', ICON: '🍲', USE: 'EAT', FOOD: 'PLANT', NUTRITION: 44, EFFECTS: { WELL_FED: 300, WARM: 240 } },
    CHEESE: { NAME: 'Queso', ICON: '🧀', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 22, DESC: 'De la leche, en la cocina.' },
    BUCKET_MILK: { NAME: 'Cubo de leche', ICON: '🥛', STACK: 1, USE: 'BUCKET', FOOD: 'ANIMAL', NUTRITION: 16, THIRST: 30, MODEL: { TYPE: 'bucket', MILK: true }, DESC: 'Clic dcho / R: beber (quita hambre y sed). En la cocina: queso.' },
    // Pesca (P4).
    FISHING_ROD: { NAME: 'Caña de pescar', ICON: '🎣', STACK: 1, DURABILITY: 200, USE: 'FISH', REPAIR: 'REFINED_WOOD', MODEL: { TYPE: 'rod' }, DESC: 'Clic dcho mirando al agua: lanzar. Cuando pique, clic; luego mantén el clic para que el pez no se escape.' },
    SMALL_FISH: { NAME: 'Pescadito', ICON: '🐟', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 6, RAW_RISK: 0.4, DESC: 'Percas y sardinas. Fritos en la hoguera.' },
    FISH: { NAME: 'Pescado', ICON: '🐠', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 10, RAW_RISK: 0.4, DESC: 'Truchas, carpas y lubinas. A la brasa en la hoguera.' },
    GOLDEN_FISH: { NAME: 'Pez dorado', ICON: '🐡', DESC: 'Rarísimo. Asado da un buen festín.' },
    FRIED_FISH: { NAME: 'Pescaditos fritos', ICON: '🍤', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 24, EFFECTS: { WARM: 90 } },
    GRILLED_FISH: { NAME: 'Pescado a la brasa', ICON: '🍣', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 34, EFFECTS: { WARM: 120 } },
    FISH_SOUP: { NAME: 'Sopa de pescado', ICON: '🥣', USE: 'EAT', FOOD: 'MIXED', NUTRITION: 46, THIRST: 25, EFFECTS: { WARM: 300, WELL_FED: 240 } },
    ROAST_GOLDEN_FISH: { NAME: 'Pez dorado asado', ICON: '🌟', USE: 'EAT', FOOD: 'ANIMAL', NUTRITION: 60, HEAL: 40, EFFECTS: { WELL_FED: 600, REGENERATION: 60 } },
    // Animales (P4).
    FEATHER: { NAME: 'Pluma', ICON: '🪶', DESC: 'De las gallinas. Flechas mejores y más baratas.' },
    SHEARS: { NAME: 'Tijeras de esquilar', ICON: '✂️', STACK: 1, DURABILITY: 250, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'shears' }, DESC: 'Con E sobre una cabra: esquilarla (lana, sin hacerle daño).' },
    // Tesoros (P8).
    TREASURE_MAP: { NAME: 'Mapa del tesoro', ICON: '🗺️', USE: 'TREASURE', DESC: 'Úsalo (clic dcho / R): marca unas ruinas con un tesoro enterrado. Se cava con la pala (E en la X).' },
    WATER: { NAME: 'Agua', ICON: '💧', USE: 'DRINK' },
    WATERSKIN: { NAME: 'Odre', ICON: '🧴', USE: 'WATERSKIN', DESC: 'Lleva agua: úsalo mirando al agua para llenarlo y otra vez para beber.' },
    // Ropa (EQUIPMENT.SLOTS): no se apila; COLD_PROTECTION se suma (todo el conjunto: 30 %).
    // Herramientas: TOOL.CHOP_SPEED acelera la tala cuando se lleva seleccionada en la barra.
    //   DURABILITY: golpes que aguanta (cada golpe con ella a un tronco, roca o pieza gasta 1);
    //   al llegar a 0 se rompe. Un árbol con el hacha son ~10 golpes; una roca con el pico, ~10.
    // Hacha: un árbol en 3 s (15 s con el puño). Pico: una roca en 3 s. Aguantan 400 golpes.
    STONE_PICKAXE: { NAME: 'Pico de piedra', ICON: '⛏️', STACK: 1, DURABILITY: 400, TOOL: { MINE_SPEED: 2, TIER: 1 }, REPAIR: 'REFINED_STONE', MODEL: { TYPE: 'pickaxe' }, DESC: 'Pica rocas, carbón y cobre. Para el hierro hace falta uno de cobre.' },
    STONE_AXE: { NAME: 'Hacha de piedra', ICON: '🪓', STACK: 1, DURABILITY: 400, TOOL: { CHOP_SPEED: 5, TIER: 1 }, REPAIR: 'REFINED_STONE', MODEL: { TYPE: 'axe' }, DESC: 'Selecciónala en la barra para talar: el árbol cae antes (da la misma madera).' },
    // Herramientas por niveles (P3): cobre, hierro y diamante. TIER: qué menas pica (hierro: cobre; diamante: hierro).
    COPPER_AXE: { NAME: 'Hacha de cobre', ICON: '🪓', STACK: 1, DURABILITY: 600, TOOL: { CHOP_SPEED: 7, TIER: 2 }, REPAIR: 'REFINED_COPPER', MODEL: { TYPE: 'axe', METAL: 0xc47a3e }, DESC: 'Tala más deprisa que la de piedra. 600 golpes.' },
    COPPER_PICKAXE: { NAME: 'Pico de cobre', ICON: '⛏️', STACK: 1, DURABILITY: 600, TOOL: { MINE_SPEED: 3, TIER: 2 }, REPAIR: 'REFINED_COPPER', MODEL: { TYPE: 'pickaxe', METAL: 0xc47a3e }, DESC: 'Ya pica el hierro. 600 golpes.' },
    IRON_AXE: { NAME: 'Hacha de hierro', ICON: '🪓', STACK: 1, DURABILITY: 900, TOOL: { CHOP_SPEED: 10, TIER: 3 }, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'axe', METAL: 0xb9bec4 }, DESC: 'Un árbol en dos golpes. 900 golpes.' },
    IRON_PICKAXE: { NAME: 'Pico de hierro', ICON: '⛏️', STACK: 1, DURABILITY: 900, TOOL: { MINE_SPEED: 4.5, TIER: 3 }, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'pickaxe', METAL: 0xb9bec4 }, DESC: 'Ya pica el diamante. 900 golpes.' },
    DIAMOND_AXE: { NAME: 'Hacha de diamante', ICON: '🪓', STACK: 1, DURABILITY: 1600, TOOL: { CHOP_SPEED: 15, TIER: 4 }, REPAIR: 'REFINED_DIAMOND', MODEL: { TYPE: 'axe', METAL: 0x8fe6f5 }, DESC: 'La mejor hacha. 1600 golpes.' },
    DIAMOND_PICKAXE: { NAME: 'Pico de diamante', ICON: '⛏️', STACK: 1, DURABILITY: 1600, TOOL: { MINE_SPEED: 7, TIER: 4 }, REPAIR: 'REFINED_DIAMOND', MODEL: { TYPE: 'pickaxe', METAL: 0x8fe6f5 }, DESC: 'Pica cualquier cosa en un suspiro. 1600 golpes.' },
    // Herramientas nuevas.
    SHOVEL: { NAME: 'Pala', ICON: '🪏', STACK: 1, DURABILITY: 500, TOOL: { HARVEST_BONUS: { SAND_PILE: 2, MUSHROOM: 1, CLAY_DEPOSIT: 2 } }, REPAIR: 'REFINED_STONE', MODEL: { TYPE: 'shovel' }, DESC: 'Seleccionada, saca más arena, arcilla y setas.' },
    SICKLE: { NAME: 'Hoz', ICON: '🌙', STACK: 1, DURABILITY: 500, TOOL: { HARVEST_BONUS: { WILD_WHEAT: 2, BERRY_BUSH: 1, BUSH: 1, WILD_FLOWERS: 1 } }, REPAIR: 'REFINED_COPPER', MODEL: { TYPE: 'sickle' }, DESC: 'Seleccionada, siegas más trigo y fibra y coges más bayas y flores.' },
    HAMMER: { NAME: 'Martillo', ICON: '🔨', STACK: 1, DURABILITY: 600, USE: 'REPAIR', TOOL: { DISMANTLE: 12 }, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'hammer' }, DESC: 'Golpeando desmonta lo construido al momento (lo recuperas). Clic dcho / R: arregla la herramienta o arma más gastada que lleves con 1 lingote de su material.' },
    BUCKET: { NAME: 'Cubo', ICON: '🪣', STACK: 1, USE: 'BUCKET', MODEL: { TYPE: 'bucket' }, DESC: 'Clic dcho / R mirando al agua: llenarlo.' },
    BUCKET_WATER: { NAME: 'Cubo de agua', ICON: '🪣', STACK: 1, USE: 'BUCKET', MODEL: { TYPE: 'bucket', WATER: true }, DESC: 'Clic dcho / R: beber (quita mucha sed). Servirá para regar.' },
    SPYGLASS: { NAME: 'Catalejo', ICON: '🔭', STACK: 1, USE: 'SPYGLASS', MODEL: { TYPE: 'spyglass' }, DESC: 'Mantén el clic dcho para mirar lejos.' },
    LANTERN: { NAME: 'Farol', ICON: '🏮', USE: 'EQUIP', SLOT: 'OFFHAND', STACK: 1, LIGHT: true, MODEL: { TYPE: 'lantern' }, DESC: 'En la mano izquierda (ranura del escudo): ilumina siempre, con las manos libres.' },
    // Armas nuevas. RANGED.THROWN: se lanza la propia arma (la lanza se recoge; la bomba estalla).
    SPEAR: { NAME: 'Lanza', ICON: '🔱', STACK: 1, DURABILITY: 300, WEAPON: { DAMAGE: 13 }, RANGED: { AMMO: ['SPEAR'], THROWN: true, RECOVER: true, DAMAGE: 24, SPEED: 28, DRAW_TIME: 0.55 }, REPAIR: 'REFINED_STONE', MODEL: { TYPE: 'spear' }, DESC: '13 de daño de cerca. Clic dcho apuntar + clic: lanzarla (24 de daño); luego hay que recogerla.' },
    CROSSBOW: { NAME: 'Ballesta', ICON: '🏹', STACK: 1, DURABILITY: 500, RANGED: { AMMO: ['ARROW', 'BONE_ARROW', 'COPPER_ARROW', 'IRON_ARROW', 'FIRE_ARROW', 'CRYSTAL_ARROW'], DAMAGE_MULT: 1.5, SPEED: 66, DRAW_TIME: 1.3 }, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'crossbow' }, DESC: 'Flechas a más velocidad y con 1,5 veces su daño, pero tarda en cargar.' },
    MACE: { NAME: 'Maza', ICON: '🔨', STACK: 1, DURABILITY: 700, WEAPON: { DAMAGE: 16, VS: { GOLEM: 2.2 } }, REPAIR: 'REFINED_IRON', MODEL: { TYPE: 'mace' }, DESC: '16 de daño; contra los gólems de roca, más del doble.' },
    SLIME_BOMB: { NAME: 'Bomba de slime', ICON: '🟢', RANGED: { AMMO: ['SLIME_BOMB'], THROWN: true, DAMAGE: 26, EXPLODE: 3.8, SPEED: 19, DRAW_TIME: 0.4 }, MODEL: { TYPE: 'bomb' }, DESC: 'Clic dcho apuntar + clic: lanzarla. Estalla y daña a todo lo que esté cerca (26).' },
    FIRE_ARROW: { NAME: 'Flecha de fuego', ICON: '🔥', AMMO: { DAMAGE: 12, FIRE: { DPS: 4, TIME: 5 } }, MODEL: { TYPE: 'arrow', TIP: 0xff6a2a }, DESC: '12 de daño y quema al enemigo (4 por segundo, 5 s).' },
    CRYSTAL_ARROW: { NAME: 'Flecha de cristal', ICON: '💎', AMMO: { DAMAGE: 26, PIERCE: 2 }, MODEL: { TYPE: 'arrow', TIP: 0xb48cff }, DESC: '26 de daño y atraviesa hasta 2 enemigos.' },
    DIAMOND_SWORD: { NAME: 'Espada de diamante', ICON: '🗡️', STACK: 1, DURABILITY: 1500, WEAPON: { DAMAGE: 22 }, REPAIR: 'REFINED_DIAMOND', MODEL: { TYPE: 'sword', BLADE: 0x8fe6f5, GUARD: 0x3b3f45, LENGTH: 0.84 }, DESC: '22 de daño. Aguanta 1500 golpes.' },
    LEATHER_CAP: { NAME: 'Gorro de cuero', ICON: '🧢', USE: 'EQUIP', SLOT: 'HEAD', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.06, COLOR: 0x7a4a24, DESC: 'Abriga la cabeza.' },
    LEATHER_SHIRT: { NAME: 'Camiseta de cuero', ICON: '👕', USE: 'EQUIP', SLOT: 'CHEST', STACK: 1, DEFENSE: 3, COLD_PROTECTION: 0.12, COLOR: 0x8b5a2b, DESC: 'La prenda que más abriga.' },
    LEATHER_PANTS: { NAME: 'Pantalones de cuero', ICON: '👖', USE: 'EQUIP', SLOT: 'LEGS', STACK: 1, DEFENSE: 2, COLD_PROTECTION: 0.07, COLOR: 0x6b4423, DESC: 'Protegen las piernas del frío.' },
    LEATHER_SHOES: { NAME: 'Zapatillas de cuero', ICON: '👟', USE: 'EQUIP', SLOT: 'FEET', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.03, COLOR: 0x4a2f18, DESC: 'Pies calientes y secos.' },
    // Ropa de abrigo (P5, telar y curtidor): abriga mucho más que el cuero, defiende poco.
    WOOL_HAT: { NAME: 'Gorro de lana', ICON: '🧶', USE: 'EQUIP', SLOT: 'HEAD', STACK: 1, DEFENSE: 0, COLD_PROTECTION: 0.1, COLOR: 0xb8433a, DESC: 'Abriga mucho la cabeza.' },
    WOOL_SWEATER: { NAME: 'Jersey de lana', ICON: '🧥', USE: 'EQUIP', SLOT: 'CHEST', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.22, COLOR: 0x3f6aa8, DESC: 'La prenda que más abriga.' },
    WOOL_TROUSERS: { NAME: 'Calzas de lana', ICON: '👖', USE: 'EQUIP', SLOT: 'LEGS', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.13, COLOR: 0x5a4a6e, DESC: 'Piernas calientes.' },
    WOOL_MITTENS: { NAME: 'Manoplas de lana', ICON: '🧤', USE: 'EQUIP', SLOT: 'HANDS', STACK: 1, DEFENSE: 0, COLD_PROTECTION: 0.06, COLOR: 0xd9c9a0, DESC: 'Manos calientes.' },
    FUR_BOOTS: { NAME: 'Botas de piel', ICON: '🥾', USE: 'EQUIP', SLOT: 'FEET', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.08, COLOR: 0x8a6a4a, DESC: 'Forradas de lana: pies calientes en la nieve.' },
    // Mochilas (P5, curtidor): al usarlas se cosen a la espalda y amplían la mochila (+1 fila de 9).
    BACKPACK: { NAME: 'Mochila', ICON: '🎒', STACK: 1, USE: 'BACKPACK', ROWS: 1, DESC: 'Úsala (clic dcho / R) para llevar 9 huecos más. Es para siempre.' },
    LARGE_BACKPACK: { NAME: 'Mochila grande', ICON: '🎒', STACK: 1, USE: 'BACKPACK', ROWS: 2, DESC: 'Con la mochila ya puesta, úsala para llevar otros 9 huecos más (36 en total en la mochila).' },
    LEATHER_GLOVES: { NAME: 'Guantes de cuero', ICON: '🧤', USE: 'EQUIP', SLOT: 'HANDS', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.02, COLOR: 0x5c3a1c, DESC: 'Manos protegidas.' },
    // Armaduras de metal (mesa de elaboración). DEFENSE: puntos de defensa.
    COPPER_HELMET: { NAME: 'Casco de cobre', ICON: '⛑️', USE: 'EQUIP', SLOT: 'HEAD', STACK: 1, DEFENSE: 2, COLD_PROTECTION: 0.03, COLOR: 0xb87333, DESC: 'Defensa 2.' },
    COPPER_CHEST: { NAME: 'Pechera de cobre', ICON: '🦺', USE: 'EQUIP', SLOT: 'CHEST', STACK: 1, DEFENSE: 6, COLD_PROTECTION: 0.05, COLOR: 0xc07a3c, DESC: 'Defensa 6.' },
    COPPER_LEGS: { NAME: 'Grebas de cobre', ICON: '🦿', USE: 'EQUIP', SLOT: 'LEGS', STACK: 1, DEFENSE: 4, COLD_PROTECTION: 0.04, COLOR: 0xa86a32, DESC: 'Defensa 4.' },
    COPPER_BOOTS: { NAME: 'Botas de cobre', ICON: '🥾', USE: 'EQUIP', SLOT: 'FEET', STACK: 1, DEFENSE: 2, COLD_PROTECTION: 0.02, COLOR: 0x8f5a2a, DESC: 'Defensa 2.' },
    COPPER_GLOVES: { NAME: 'Guanteletes de cobre', ICON: '🧤', USE: 'EQUIP', SLOT: 'HANDS', STACK: 1, DEFENSE: 1, COLD_PROTECTION: 0.01, COLOR: 0xb87333, DESC: 'Defensa 1.' },
    CHAIN_HELMET: { NAME: 'Cofia de malla', ICON: '⛑️', USE: 'EQUIP', SLOT: 'HEAD', STACK: 1, DEFENSE: 3, COLD_PROTECTION: 0.03, COLOR: 0x9ea4aa, DESC: 'Defensa 3.' },
    CHAIN_CHEST: { NAME: 'Cota de malla', ICON: '🦺', USE: 'EQUIP', SLOT: 'CHEST', STACK: 1, DEFENSE: 9, COLD_PROTECTION: 0.05, COLOR: 0x8e959c, DESC: 'Defensa 9.' },
    CHAIN_LEGS: { NAME: 'Calzas de malla', ICON: '🦿', USE: 'EQUIP', SLOT: 'LEGS', STACK: 1, DEFENSE: 6, COLD_PROTECTION: 0.04, COLOR: 0x7f868d, DESC: 'Defensa 6.' },
    CHAIN_BOOTS: { NAME: 'Botas de malla', ICON: '🥾', USE: 'EQUIP', SLOT: 'FEET', STACK: 1, DEFENSE: 3, COLD_PROTECTION: 0.02, COLOR: 0x6f767d, DESC: 'Defensa 3.' },
    CHAIN_GLOVES: { NAME: 'Guantes de malla', ICON: '🧤', USE: 'EQUIP', SLOT: 'HANDS', STACK: 1, DEFENSE: 2, COLD_PROTECTION: 0.01, COLOR: 0x9ea4aa, DESC: 'Defensa 2.' },
    DIAMOND_HELMET: { NAME: 'Yelmo de diamante', ICON: '⛑️', USE: 'EQUIP', SLOT: 'HEAD', STACK: 1, DEFENSE: 4, COLD_PROTECTION: 0.04, COLOR: 0x8fe0f0, DESC: 'Defensa 4.' },
    DIAMOND_CHEST: { NAME: 'Coraza de diamante', ICON: '🦺', USE: 'EQUIP', SLOT: 'CHEST', STACK: 1, DEFENSE: 12, COLD_PROTECTION: 0.06, COLOR: 0x7fd6ea, DESC: 'Defensa 12.' },
    DIAMOND_LEGS: { NAME: 'Grebas de diamante', ICON: '🦿', USE: 'EQUIP', SLOT: 'LEGS', STACK: 1, DEFENSE: 8, COLD_PROTECTION: 0.05, COLOR: 0x72c8de, DESC: 'Defensa 8.' },
    DIAMOND_BOOTS: { NAME: 'Botas de diamante', ICON: '🥾', USE: 'EQUIP', SLOT: 'FEET', STACK: 1, DEFENSE: 4, COLD_PROTECTION: 0.03, COLOR: 0x66b8cc, DESC: 'Defensa 4.' },
    DIAMOND_GLOVES: { NAME: 'Guanteletes de diamante', ICON: '🧤', USE: 'EQUIP', SLOT: 'HANDS', STACK: 1, DEFENSE: 3, COLD_PROTECTION: 0.02, COLOR: 0x8fe0f0, DESC: 'Defensa 3.' },
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

  // Estados por la comida (P2): duración en s la da cada alimento (ITEMS.*.EFFECTS).
  STATUS_EFFECTS: {
    WELL_FED: { NAME: 'Bien alimentado', ICON: '🍽️', DESC: 'El hambre baja más despacio y la vida se recupera el doble.', HUNGER: 0.65, REGEN: 2 },
    WARM: { NAME: 'Comida caliente', ICON: '♨️', DESC: 'Se pierde calor mucho más despacio.', COLD: 0.45 },
    ENERGIZED: { NAME: 'Con energía', ICON: '⚡', DESC: 'La energía se recupera mucho más deprisa.', ENERGY: 1.9 },
    // Pociones (P5).
    REGENERATION: { NAME: 'Regeneración', ICON: '💗', DESC: 'La vida se recupera muy deprisa.', REGEN: 3 },
    STRENGTH: { NAME: 'Fuerza', ICON: '💪', DESC: 'Golpes y disparos un 35 % más fuertes.', DAMAGE: 1.35 },
    SWIFT: { NAME: 'Rapidez', ICON: '💨', DESC: 'Te mueves un 25 % más deprisa.', SPEED: 1.25 },
    WARMTH: { NAME: 'Calor', ICON: '🌡️', DESC: 'El frío casi no te afecta.', COLD: 0.15 },
    NIGHT_VISION: { NAME: 'Visión nocturna', ICON: '👁️', DESC: 'Ves en la oscuridad.', NIGHT: true },
    LEAP: { NAME: 'Salto', ICON: '🐸', DESC: 'Saltas mucho más alto; las caídas duelen la mitad.', JUMP: 1.45, FALL: 0.5 },
    INDIGESTION: { NAME: 'Indigestión', ICON: '🤢', DESC: 'Algo crudo te ha sentado mal: no recuperas vida y te cansas.', ENERGY: 0.4, NO_REGEN: true, HUNGER_LOSS: 12, TIME: 75 },
  },

  // Equipamiento sencillo (Fase 8).
  EQUIPMENT: {
    // Ranuras de ropa/armadura (en este orden en el panel del inventario).
    SLOTS: {
      HEAD: { NAME: 'Cabeza', ICON: '🪖' },
      CHEST: { NAME: 'Pecho', ICON: '🦺' },
      LEGS: { NAME: 'Piernas', ICON: '👖' },
      FEET: { NAME: 'Pies', ICON: '🥾' },
      HANDS: { NAME: 'Manos', ICON: '🧤' },
      OFFHAND: { NAME: 'Escudo', ICON: '🛡️' },
    },
    MAX_COLD_PROTECTION: 0.8,   // la ropa nunca quita más del 80 % de la pérdida de calor
    // Defensa (ITEMS.*.DEFENSE, se suma): cada punto quita un 1,5 % del daño de los ataques
    // (no de caídas, hambre, frío…). Cuero 8 puntos (12 %), cobre 15 (22 %), malla 23 (35 %).
    DEFENSE_PER_POINT: 0.015,
    MAX_DEFENSE_REDUCTION: 0.75,
    WATER_CAPACITY: 3,          // unidades de agua por odre
  },

  // Recetas (Fase 9): ingredientes → resultado. Solo configuración.
  // (La cama y las piezas de casa se construyen en el modo construcción: BUILD.)
  //   CATEGORY agrupa las recetas en el menú de fabricación (RECIPE_CATEGORIES).
  //   TIME: segundos que tarda en fabricarse (va a una cola; sigue aunque se cierre el menú).
  //   STATION: solo se fabrica usando esa estación (E sobre ella), p. ej. la mesa de refinería.
  RECIPES: {
    REFINED_STONE: { RESULT: 'REFINED_STONE', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 5, INGREDIENTS: { STONE: 4 } },
    REFINED_WOOD: { RESULT: 'REFINED_WOOD', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 4, INGREDIENTS: { WOOD: 2 } },
    ROPE: { RESULT: 'ROPE', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 4, INGREDIENTS: { SPIDER_SILK: 5 } },
    ROPE_FIBER: { RESULT: 'ROPE', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 4, INGREDIENTS: { FIBER: 4 } },
    GLUE: { RESULT: 'GLUE', AMOUNT: 2, CATEGORY: 'MATERIALS', TIME: 4, INGREDIENTS: { SLIME: 1, RESIN: 1 } },
    TORCH_RESIN: { RESULT: 'TORCH', AMOUNT: 2, CATEGORY: 'SURVIVAL', TIME: 3, INGREDIENTS: { WOOD: 1, RESIN: 1 } },
    BONE_ARROW: { RESULT: 'BONE_ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 6, INGREDIENTS: { WOOD: 2, BONE: 1, SPIDER_SILK: 2 } },
    STONE_AXE: { RESULT: 'STONE_AXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 15, INGREDIENTS: { REFINED_WOOD: 3, REFINED_STONE: 2, ROPE: 2 } },
    STONE_PICKAXE: { RESULT: 'STONE_PICKAXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 15, INGREDIENTS: { REFINED_WOOD: 3, REFINED_STONE: 2, ROPE: 2 } },
    PIECE_REFINERY: { RESULT: 'REFINERY_KIT', AMOUNT: 1, CATEGORY: 'STATIONS', TIME: 15, INGREDIENTS: { REFINED_STONE: 4, REFINED_WOOD: 2 } },
    // Mesa de refinería.
    REFINED_LEATHER: { RESULT: 'REFINED_LEATHER', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 8, STATION: 'REFINERY', INGREDIENTS: { LEATHER: 1 } },
    WATERSKIN: { RESULT: 'WATERSKIN', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 8, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 2, WOOD: 1 } },
    LEATHER_CAP: { RESULT: 'LEATHER_CAP', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 6, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 1 } },
    LEATHER_SHIRT: { RESULT: 'LEATHER_SHIRT', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 12, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 3 } },
    LEATHER_PANTS: { RESULT: 'LEATHER_PANTS', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 10, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 2 } },
    LEATHER_SHOES: { RESULT: 'LEATHER_SHOES', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 8, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 2 } },
    LEATHER_GLOVES: { RESULT: 'LEATHER_GLOVES', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 5, STATION: 'REFINERY', INGREDIENTS: { REFINED_LEATHER: 1 } },
    // Armas y antorchas (en el reloj).
    STONE_SWORD: { RESULT: 'STONE_SWORD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 12, INGREDIENTS: { REFINED_WOOD: 2, REFINED_STONE: 4, ROPE: 1 } },
    SLINGSHOT: { RESULT: 'SLINGSHOT', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 10, INGREDIENTS: { REFINED_WOOD: 4, ROPE: 2 } },
    BOW: { RESULT: 'BOW', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 15, INGREDIENTS: { REFINED_WOOD: 6, ROPE: 4 } },
    ARROW: { RESULT: 'ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 6, INGREDIENTS: { WOOD: 3, STONE: 1, SPIDER_SILK: 3 } },
    TORCH: { RESULT: 'TORCH', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 2, INGREDIENTS: { WOOD: 1, COAL: 1 } },
    // Horno: el carbón es el combustible.
    REFINED_COPPER: { RESULT: 'REFINED_COPPER', AMOUNT: 2, CATEGORY: 'MATERIALS', TIME: 10, STATION: 'FURNACE', INGREDIENTS: { COPPER_ORE: 2, COAL: 1 } },
    REFINED_IRON: { RESULT: 'REFINED_IRON', AMOUNT: 2, CATEGORY: 'MATERIALS', TIME: 12, STATION: 'FURNACE', INGREDIENTS: { IRON_ORE: 2, COAL: 1 } },
    REFINED_DIAMOND: { RESULT: 'REFINED_DIAMOND', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 15, STATION: 'FURNACE', INGREDIENTS: { DIAMOND_ORE: 1, COAL: 1 } },
    GLASS: { RESULT: 'GLASS', AMOUNT: 4, CATEGORY: 'MATERIALS', TIME: 8, STATION: 'FURNACE', INGREDIENTS: { SAND: 4, COAL: 1 } },
    BRICK: { RESULT: 'BRICK', AMOUNT: 4, CATEGORY: 'MATERIALS', TIME: 10, STATION: 'FURNACE', INGREDIENTS: { CLAY: 4, COAL: 1 } },
    GOLD_INGOT: { RESULT: 'GOLD_INGOT', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 12, STATION: 'FURNACE', INGREDIENTS: { GOLD_ORE: 2, COAL: 1 } },
    GLASS_BOTTLE: { RESULT: 'GLASS_BOTTLE', AMOUNT: 3, CATEGORY: 'MATERIALS', TIME: 6, STATION: 'FURNACE', INGREDIENTS: { GLASS: 2 } },
    // Granja, pesca y animales (P4).
    WHEAT_SEEDS: { RESULT: 'WHEAT_SEEDS', AMOUNT: 3, CATEGORY: 'FARMING', TIME: 2, INGREDIENTS: { WHEAT: 1 } },
    PUMPKIN_SEEDS: { RESULT: 'PUMPKIN_SEEDS', AMOUNT: 4, CATEGORY: 'FARMING', TIME: 3, INGREDIENTS: { PUMPKIN: 1 } },
    BONE_MEAL: { RESULT: 'BONE_MEAL', AMOUNT: 3, CATEGORY: 'FARMING', TIME: 3, INGREDIENTS: { BONE: 1 } },
    FISHING_ROD: { RESULT: 'FISHING_ROD', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 10, INGREDIENTS: { REFINED_WOOD: 2, ROPE: 1, SPIDER_SILK: 3 } },
    SHEARS: { RESULT: 'SHEARS', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 10, INGREDIENTS: { REFINED_IRON: 2 } },
    ARROW_FEATHER: { RESULT: 'ARROW', AMOUNT: 5, CATEGORY: 'WEAPONS', TIME: 6, INGREDIENTS: { WOOD: 3, STONE: 1, FEATHER: 2 } },
    BAKED_POTATO: { RESULT: 'BAKED_POTATO', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 6, STATION: 'CAMPFIRE', INGREDIENTS: { POTATO: 1 } },
    FRIED_FISH: { RESULT: 'FRIED_FISH', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 6, STATION: 'CAMPFIRE', INGREDIENTS: { SMALL_FISH: 2 } },
    GRILLED_FISH: { RESULT: 'GRILLED_FISH', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 8, STATION: 'CAMPFIRE', INGREDIENTS: { FISH: 1 } },
    ROAST_GOLDEN_FISH: { RESULT: 'ROAST_GOLDEN_FISH', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 10, STATION: 'CAMPFIRE', INGREDIENTS: { GOLDEN_FISH: 1 } },
    PUMPKIN_PIE: { RESULT: 'PUMPKIN_PIE', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 20, STATION: 'KITCHEN', INGREDIENTS: { PUMPKIN: 1, WHEAT: 2, EGG: 1 } },
    VEGETABLE_STEW: { RESULT: 'VEGETABLE_STEW', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 16, STATION: 'KITCHEN', INGREDIENTS: { CARROT: 2, POTATO: 2, MUSHROOM: 1 } },
    FISH_SOUP: { RESULT: 'FISH_SOUP', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 16, STATION: 'KITCHEN', INGREDIENTS: { FISH: 1, POTATO: 1, CARROT: 1 } },
    CHEESE: { RESULT: 'CHEESE', AMOUNT: 3, CATEGORY: 'COOKING', TIME: 20, STATION: 'KITCHEN', INGREDIENTS: { BUCKET_MILK: 1 }, RETURNS: { BUCKET: 1 } },
    // Secadero (P6): lento, pero lo curado alimenta bien y no sienta mal.
    JERKY: { RESULT: 'JERKY', AMOUNT: 2, CATEGORY: 'COOKING', TIME: 60, STATION: 'DRYING_RACK', INGREDIENTS: { MEAT: 2, RESIN: 1 } },
    DRIED_FISH: { RESULT: 'DRIED_FISH', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 45, STATION: 'DRYING_RACK', INGREDIENTS: { FISH: 1 } },
    DRIED_FISH_SMALL: { RESULT: 'DRIED_FISH', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 45, STATION: 'DRYING_RACK', INGREDIENTS: { SMALL_FISH: 2 } },
    DRIED_FRUIT: { RESULT: 'DRIED_FRUIT', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 50, STATION: 'DRYING_RACK', INGREDIENTS: { APPLE: 1, BERRIES: 3 } },
    // Telar.
    CLOTH: { RESULT: 'CLOTH', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 6, STATION: 'LOOM', INGREDIENTS: { FIBER: 4 } },
    CLOTH_WOOL: { RESULT: 'CLOTH', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 6, STATION: 'LOOM', INGREDIENTS: { WOOL: 2 } },
    WOOL_HAT: { RESULT: 'WOOL_HAT', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 10, STATION: 'LOOM', INGREDIENTS: { CLOTH: 1, WOOL: 2 } },
    WOOL_SWEATER: { RESULT: 'WOOL_SWEATER', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 18, STATION: 'LOOM', INGREDIENTS: { CLOTH: 2, WOOL: 4 } },
    WOOL_TROUSERS: { RESULT: 'WOOL_TROUSERS', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 14, STATION: 'LOOM', INGREDIENTS: { CLOTH: 2, WOOL: 3 } },
    WOOL_MITTENS: { RESULT: 'WOOL_MITTENS', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 8, STATION: 'LOOM', INGREDIENTS: { CLOTH: 1, WOOL: 2 } },
    // Curtidor.
    REFINED_LEATHER_TAN: { RESULT: 'REFINED_LEATHER', AMOUNT: 3, CATEGORY: 'MATERIALS', TIME: 10, STATION: 'TANNER', INGREDIENTS: { LEATHER: 2, RESIN: 1 } },
    FUR_BOOTS: { RESULT: 'FUR_BOOTS', AMOUNT: 1, CATEGORY: 'CLOTHING', TIME: 12, STATION: 'TANNER', INGREDIENTS: { REFINED_LEATHER: 2, WOOL: 2 } },
    BACKPACK: { RESULT: 'BACKPACK', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 20, STATION: 'TANNER', INGREDIENTS: { REFINED_LEATHER: 4, CLOTH: 2, ROPE: 2, GLUE: 1 } },
    LARGE_BACKPACK: { RESULT: 'LARGE_BACKPACK', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 30, STATION: 'TANNER', INGREDIENTS: { REFINED_LEATHER: 6, CLOTH: 4, STEEL: 1, GLUE: 2 } },
    // Mesa de alquimia.
    DIAMOND_DUST: { RESULT: 'DIAMOND_DUST', AMOUNT: 3, CATEGORY: 'MATERIALS', TIME: 8, STATION: 'ALCHEMY', INGREDIENTS: { REFINED_DIAMOND: 1 } },
    HEALING_POTION: { RESULT: 'HEALING_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 10, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, BERRIES: 3, WILD_FLOWER: 2 } },
    STRENGTH_POTION: { RESULT: 'STRENGTH_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 12, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, BONE: 2, DIAMOND_DUST: 1 } },
    SWIFT_POTION: { RESULT: 'SWIFT_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 10, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, WILD_FLOWER: 3, SPIDER_SILK: 1 } },
    WARMTH_POTION: { RESULT: 'WARMTH_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 10, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, COAL: 1, MUSHROOM: 2, RESIN: 1 } },
    NIGHT_VISION_POTION: { RESULT: 'NIGHT_VISION_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 12, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, GLOW_FLOWER: 2, CRYSTAL_SHARD: 1 } },
    LEAP_POTION: { RESULT: 'LEAP_POTION', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 10, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, SLIME: 3 } },
    GOLDEN_ELIXIR: { RESULT: 'GOLDEN_ELIXIR', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 20, STATION: 'ALCHEMY', INGREDIENTS: { GLASS_BOTTLE: 1, GOLD_INGOT: 1, GLOW_FLOWER: 1, DIAMOND_DUST: 1 } },
    GOLDEN_APPLE: { RESULT: 'GOLDEN_APPLE', AMOUNT: 1, CATEGORY: 'ALCHEMY', TIME: 10, STATION: 'ALCHEMY', INGREDIENTS: { APPLE: 1, GOLD_INGOT: 1 } },
    // Forja.
    STEEL: { RESULT: 'STEEL', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 14, STATION: 'FORGE', INGREDIENTS: { REFINED_IRON: 2, COAL: 2 } },
    GOLD_FROM_COINS: { RESULT: 'GOLD_INGOT', AMOUNT: 1, CATEGORY: 'MATERIALS', TIME: 8, STATION: 'FORGE', INGREDIENTS: { COIN: 8 } },
    REFINED_IRON_FORGE: { RESULT: 'REFINED_IRON', AMOUNT: 4, CATEGORY: 'MATERIALS', TIME: 14, STATION: 'FORGE', INGREDIENTS: { IRON_ORE: 3, COAL: 1 } },
    REFINED_COPPER_FORGE: { RESULT: 'REFINED_COPPER', AMOUNT: 4, CATEGORY: 'MATERIALS', TIME: 12, STATION: 'FORGE', INGREDIENTS: { COPPER_ORE: 3, COAL: 1 } },
    STEEL_SWORD: { RESULT: 'STEEL_SWORD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 24, STATION: 'FORGE', INGREDIENTS: { REFINED_WOOD: 1, STEEL: 3 } },
    STEEL_SHIELD: { RESULT: 'STEEL_SHIELD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 20, STATION: 'FORGE', INGREDIENTS: { REFINED_WOOD: 2, STEEL: 2 } },
    // Mesa de elaboración.
    NAV_PLATE: { RESULT: 'NAV_PLATE', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 30, STATION: 'WORKBENCH', INGREDIENTS: { GLASS: 20, REFINED_IRON: 5, REFINED_COPPER: 5 } },
    COPPER_SWORD: { RESULT: 'COPPER_SWORD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 15, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_COPPER: 2 } },
    IRON_SWORD: { RESULT: 'IRON_SWORD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 18, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_IRON: 2 } },
    COPPER_SHIELD: { RESULT: 'COPPER_SHIELD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 12, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 4, REFINED_COPPER: 1 } },
    IRON_SHIELD: { RESULT: 'IRON_SHIELD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 15, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 4, REFINED_IRON: 1 } },
    COPPER_ARROW: { RESULT: 'COPPER_ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 6, STATION: 'WORKBENCH', INGREDIENTS: { WOOD: 3, REFINED_COPPER: 1, SPIDER_SILK: 3 } },
    IRON_ARROW: { RESULT: 'IRON_ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 6, STATION: 'WORKBENCH', INGREDIENTS: { WOOD: 3, REFINED_IRON: 1, SPIDER_SILK: 3 } },
    COPPER_HELMET: { RESULT: 'COPPER_HELMET', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 10, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_COPPER: 2 } },
    COPPER_GLOVES: { RESULT: 'COPPER_GLOVES', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 6, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_COPPER: 1 } },
    COPPER_BOOTS: { RESULT: 'COPPER_BOOTS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 10, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_COPPER: 2 } },
    COPPER_LEGS: { RESULT: 'COPPER_LEGS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 14, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_COPPER: 4 } },
    COPPER_CHEST: { RESULT: 'COPPER_CHEST', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 18, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_COPPER: 5 } },
    CHAIN_HELMET: { RESULT: 'CHAIN_HELMET', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 12, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_IRON: 2 } },
    CHAIN_GLOVES: { RESULT: 'CHAIN_GLOVES', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 8, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_IRON: 1 } },
    CHAIN_BOOTS: { RESULT: 'CHAIN_BOOTS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 12, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_IRON: 2 } },
    CHAIN_LEGS: { RESULT: 'CHAIN_LEGS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 16, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_IRON: 4 } },
    CHAIN_CHEST: { RESULT: 'CHAIN_CHEST', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 20, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_IRON: 5 } },
    // Herramientas y armas por niveles (P3).
    COPPER_AXE: { RESULT: 'COPPER_AXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 18, INGREDIENTS: { REFINED_WOOD: 2, REFINED_COPPER: 3, ROPE: 1 } },
    COPPER_PICKAXE: { RESULT: 'COPPER_PICKAXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 18, INGREDIENTS: { REFINED_WOOD: 2, REFINED_COPPER: 3, ROPE: 1 } },
    IRON_AXE: { RESULT: 'IRON_AXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 22, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_IRON: 3, ROPE: 1 } },
    IRON_PICKAXE: { RESULT: 'IRON_PICKAXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 22, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_IRON: 3, ROPE: 1 } },
    DIAMOND_AXE: { RESULT: 'DIAMOND_AXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 30, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_DIAMOND: 3, REFINED_IRON: 1 } },
    DIAMOND_PICKAXE: { RESULT: 'DIAMOND_PICKAXE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 30, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_DIAMOND: 3, REFINED_IRON: 1 } },
    SHOVEL: { RESULT: 'SHOVEL', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 10, INGREDIENTS: { REFINED_WOOD: 2, REFINED_STONE: 1, ROPE: 1 } },
    SICKLE: { RESULT: 'SICKLE', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 10, INGREDIENTS: { REFINED_WOOD: 1, REFINED_COPPER: 1 } },
    HAMMER: { RESULT: 'HAMMER', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 12, INGREDIENTS: { REFINED_WOOD: 2, REFINED_IRON: 1 } },
    BUCKET: { RESULT: 'BUCKET', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 10, INGREDIENTS: { REFINED_IRON: 2 } },
    SPYGLASS: { RESULT: 'SPYGLASS', AMOUNT: 1, CATEGORY: 'TOOLS', TIME: 14, INGREDIENTS: { GLASS: 2, REFINED_COPPER: 2 } },
    LANTERN: { RESULT: 'LANTERN', AMOUNT: 1, CATEGORY: 'SURVIVAL', TIME: 10, INGREDIENTS: { REFINED_IRON: 1, GLASS: 1, COAL: 2 } },
    SPEAR: { RESULT: 'SPEAR', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 10, INGREDIENTS: { REFINED_WOOD: 2, REFINED_STONE: 1, ROPE: 1 } },
    SLIME_BOMB: { RESULT: 'SLIME_BOMB', AMOUNT: 2, CATEGORY: 'WEAPONS', TIME: 6, INGREDIENTS: { SLIME: 3, COAL: 1 } },
    FIRE_ARROW: { RESULT: 'FIRE_ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 6, INGREDIENTS: { ARROW: 3, COAL: 1, SPIDER_SILK: 1 } },
    CROSSBOW: { RESULT: 'CROSSBOW', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 22, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 4, REFINED_IRON: 2, ROPE: 3 } },
    MACE: { RESULT: 'MACE', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 18, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_IRON: 3 } },
    CRYSTAL_ARROW: { RESULT: 'CRYSTAL_ARROW', AMOUNT: 3, CATEGORY: 'WEAPONS', TIME: 8, STATION: 'WORKBENCH', INGREDIENTS: { WOOD: 3, CRYSTAL_SHARD: 1, SPIDER_SILK: 3 } },
    DIAMOND_SWORD: { RESULT: 'DIAMOND_SWORD', AMOUNT: 1, CATEGORY: 'WEAPONS', TIME: 30, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_WOOD: 2, REFINED_DIAMOND: 3 } },
    DIAMOND_HELMET: { RESULT: 'DIAMOND_HELMET', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 20, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_DIAMOND: 2, REFINED_IRON: 1 } },
    DIAMOND_GLOVES: { RESULT: 'DIAMOND_GLOVES', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 14, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_DIAMOND: 1, REFINED_IRON: 1 } },
    DIAMOND_BOOTS: { RESULT: 'DIAMOND_BOOTS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 20, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_DIAMOND: 2, REFINED_IRON: 1 } },
    DIAMOND_LEGS: { RESULT: 'DIAMOND_LEGS', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 26, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_DIAMOND: 4, REFINED_IRON: 1 } },
    DIAMOND_CHEST: { RESULT: 'DIAMOND_CHEST', AMOUNT: 1, CATEGORY: 'ARMOR', TIME: 32, STATION: 'WORKBENCH', INGREDIENTS: { REFINED_DIAMOND: 5, REFINED_IRON: 2 } },
    // Hoguera: asar.
    COOKED_MEAT: { RESULT: 'COOKED_MEAT', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 8, STATION: 'CAMPFIRE', INGREDIENTS: { MEAT: 1 } },
    ROASTED_MUSHROOM: { RESULT: 'ROASTED_MUSHROOM', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 5, STATION: 'CAMPFIRE', INGREDIENTS: { MUSHROOM: 1 } },
    FRIED_EGG: { RESULT: 'FRIED_EGG', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 5, STATION: 'CAMPFIRE', INGREDIENTS: { EGG: 1 } },
    BAKED_APPLE: { RESULT: 'BAKED_APPLE', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 5, STATION: 'CAMPFIRE', INGREDIENTS: { APPLE: 1 } },
    SKEWER: { RESULT: 'SKEWER', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 10, STATION: 'CAMPFIRE', INGREDIENTS: { MEAT: 1, MUSHROOM: 2 } },
    // Cocina con olla: guisar y hornear.
    BREAD: { RESULT: 'BREAD', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 12, STATION: 'KITCHEN', INGREDIENTS: { WHEAT: 3 } },
    STEW: { RESULT: 'STEW', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 18, STATION: 'KITCHEN', INGREDIENTS: { MEAT: 1, MUSHROOM: 2, WHEAT: 1 } },
    MUSHROOM_SOUP: { RESULT: 'MUSHROOM_SOUP', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 12, STATION: 'KITCHEN', INGREDIENTS: { MUSHROOM: 3 } },
    JAM: { RESULT: 'JAM', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 10, STATION: 'KITCHEN', INGREDIENTS: { BERRIES: 6 } },
    APPLE_PIE: { RESULT: 'APPLE_PIE', AMOUNT: 1, CATEGORY: 'COOKING', TIME: 20, STATION: 'KITCHEN', INGREDIENTS: { APPLE: 3, WHEAT: 2, EGG: 1 } },
    COOKED_MEAT_POT: { RESULT: 'COOKED_MEAT', AMOUNT: 2, CATEGORY: 'COOKING', TIME: 12, STATION: 'KITCHEN', INGREDIENTS: { MEAT: 2 } },
    // Piezas de construcción (estaciones incluidas).
    ...PIECE_RECIPES,
  },
  // Estaciones de fabricación (piezas construidas que se usan con E).
  STATIONS: {
    REFINERY: { NAME: 'Mesa de refinería', ICON: '🛠️' },
    FURNACE: { NAME: 'Horno', ICON: '🔥' },
    WORKBENCH: { NAME: 'Mesa de elaboración', ICON: '🧰' },
    CAMPFIRE: { NAME: 'Hoguera', ICON: '🔥' },
    KITCHEN: { NAME: 'Cocina con olla', ICON: '🍲' },
    DRYING_RACK: { NAME: 'Secadero', ICON: '🥓' },
    LOOM: { NAME: 'Telar', ICON: '🧶' },
    TANNER: { NAME: 'Curtidor', ICON: '🪣' },
    ALCHEMY: { NAME: 'Mesa de alquimia', ICON: '⚗️' },
    FORGE: { NAME: 'Forja', ICON: '⚒️' },
  },
  RECIPE_CATEGORIES: {
    MATERIALS: 'Materiales',
    STATIONS: 'Estaciones',
    CONSTRUCTION: 'Construcción',
    TOOLS: 'Herramientas',
    WEAPONS: 'Armas',
    CLOTHING: 'Ropa',
    ARMOR: 'Armaduras',
    SURVIVAL: 'Supervivencia',
    COOKING: 'Cocina',
    ALCHEMY: 'Pociones',
    FARMING: 'Granja',
    FURNITURE: 'Muebles y hogar',
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
    BREAK_TIME: 3,          // s de golpes (manteniendo el clic) para romper una pieza fuera del modo construcción; un hacha o un pico lo reducen a la mitad
    // Coste de cada pieza = su objeto (ver BUILD_PIECES arriba).
    PIECES: Object.fromEntries(Object.entries(BUILD_PIECES).map(([type, d]) => [
      type, { NAME: d.NAME, ICON: d.ICON, COST: { [pieceItemId(type)]: 1 }, ...(d.BODIES ? { BODIES: d.BODIES } : {}), ...(d.HARD ? { HARD: d.HARD } : {}) },
    ])),
    // Piezas que no se pueden hacer en las lunas (BODIES: 'HOME').
    HOME_ONLY: ['FENCE', 'BED', 'CHEST', 'FURNACE', 'WORKBENCH', 'TORCH', 'REFINERY', 'CAMPFIRE', 'KITCHEN', 'LOOM', 'TANNER', 'ALCHEMY', 'FORGE', 'FARM_PLOT',
      'TABLE', 'CHAIR', 'BENCH', 'BOOKSHELF', 'WARDROBE', 'BARREL', 'RUG', 'LAMP', 'FLOWER_POT', 'WELL', 'RAIN_COLLECTOR', 'DRYING_RACK', 'MANNEQUIN'],
    RAIN_COLLECTOR: { CAPACITY: 4, EVERY: 150, RAIN_EVERY: 25 }, // unidades de agua; s por unidad (con lluvia, más deprisa)
    CAMPFIRE_WARM_RADIUS: 5,   // m: cerca de una hoguera (o de la cocina) se está caliente
    CAMPFIRE_SLIME_RADIUS: 9,  // m: los slimes no se acercan a una hoguera
    CHEST_SLOTS: 27,
    TORCH_LIGHTS: 6,        // antorchas clavadas que iluminan a la vez (las más cercanas)
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

  // Cuerpos celestes (Fase 12): las lunas en el cielo, en el mapa planetario y en el
  // espacio. Tamaño, distancia, velocidad, color y tamaño en el cielo vienen del
  // sistema solar (JSON); la posición inicial, la inclinación y el aspecto dependen
  // de la sub-seed "celestial".
  CELESTIAL: {
    MAX_INCLINATION_DEG: 18,
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
    ZONE_RADIUS: 65000,        // km: límite por defecto (el sistema calcula el suyo desde la estrella)
    ZONE_MARGIN_KM: 65000,     // km más allá de la órbita del planeta más lejano: límite del sistema
    SUN_DIRECTION: { x: 1, y: 0.12, z: 0.08 }, // desde el planeta de inicio hacia la estrella
    // Crucero interplanetario: con Shift y lejos de todos los cuerpos (distancias comprimidas:
    // un planeta está a 250 000 km por unidad de órbita).
    CRUISE: {
      MIN_ALTITUDE_KM: 3000,   // más cerca de un cuerpo no se entra en crucero
      MAX_SPEED: 90000,        // km/s
      ACCEL_RATE: 1.5,         // la velocidad se multiplica ~e^1.5 por segundo
      BRAKE_RATE: 4,           // y se frena más deprisa (el frenado de proximidad manda)
      PROXIMITY_BRAKE: 1.5,    // con impulso, velocidad máx. = altitud × esto (sin impulso, PROXIMITY_BRAKE)
    },
    EXIT_ALTITUDE_KM: 900,     // al salir del planeta, km sobre la superficie
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
      FIRST_DELAY: 2,            // s en el espacio hasta que se detecta el primero
      INTERVAL: [20, 40],        // s entre apariciones
      MAX: 3,                    // a la vez
      SPAWN_DISTANCE_KM: [250, 700], // se detectan lejos: da tiempo a fijar rumbo (tecla 4)
      SPAWN_CONE: 0.6,           // rad alrededor del rumbo de la nave
      DESPAWN_KM: 2500,          // se siguen detectando aunque se hayan dejado atrás
      MIN_APPARENT_M: 3,         // tamaño mínimo del punto lejano (a VIEW_DISTANCE) para que se vea
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
    // Hiperespacio: con el nodo de velocidad-luz, al llegar al borde del sistema la IA
    // pregunta a qué sistema ir. Cada salto gasta baterías enteras de la nave.
    HYPERSPACE: {
      BATTERY_COST: 1,           // baterías plank que consume un salto
      JUMP_TIME: 3.5,            // s de viaje por el hiperespacio (animación)
      REPROMPT_MARGIN_KM: 8000,  // hay que volver a entrar esto en el sistema para que vuelva a preguntar
    },
    // Cápsulas de escape (Etapa 6): llevan al jugador a un cuerpo cercano; la IA trae la nave después.
    ESCAPE: {
      POD_RANGE_KM: 45000,       // alcance máximo (de superficie a superficie)
      LAUNCH_TIME: 3,            // s del viaje (fundido)
      PODS: 2,
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

  // Nave pequeña. La forma (salas, colisiones, suelos, rampa) está en
  // ship/ShipLayout.js; aquí el comportamiento, las tecnologías y las baterías.
  SHIP: {
    NAME: 'Nave exploradora',
    LANDING_DISTANCE: [22, 45],  // m del inicio del jugador donde aparece aterrizada
    CLEAR_RADIUS: 11,            // m sin árboles ni rocas alrededor del lugar de aterrizaje
    MOUNTAIN_LANDING_DISTANCE: [350, 1300], // campaña: la nave está en un monte helado a esta distancia (m) del inicio
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
      PLANET_MAP: { NAME: 'Mapa', ICON: '🗺️', DESCRIPTION: 'Mapa de la región y mapa planetario.' },
      CHARGING_STATION: { NAME: 'Puesto de carga', ICON: '🔌', DESCRIPTION: 'Baterías plank: el combustible de la nave.' },
      SUIT_LOCKER: { NAME: 'Taquilla de trajes', ICON: '🧑‍🚀', DESCRIPTION: 'Traje espacial y jetpack de gas.' },
      OXYGEN_STATION: { NAME: 'Estación de oxígeno', ICON: '🫧', DESCRIPTION: 'Recarga el oxígeno del traje.' },
      SPACE_NODE: { NAME: 'Nodo espacial', ICON: '🔷', DESCRIPTION: 'Permite salir al espacio y viajar a las lunas.' },
      GALACTIC_NODE: { NAME: 'Nodo galáctico', ICON: '🌀', DESCRIPTION: 'Permitiría saltar fuera del sistema solar.' },
      AI_NODE: { NAME: 'Nodo de IA', ICON: '🤖', DESCRIPTION: 'IA de a bordo: datos del sistema y avisos de la nave.' },
      LIGHTSPEED_NODE: { NAME: 'Nodo de velocidad-luz', ICON: '⚡', DESCRIPTION: 'Salto por el hiperespacio a otros sistemas solares (desde el borde del sistema).' },
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
    // Dónde cae el nodo espacial en el planeta de inicio (m desde el inicio del jugador).
    SPACE_NODE_DROP_DISTANCE: [160, 320],
    GALACTIC_NODE_DROP_DISTANCE: [70, 160], // en una de las lunas (según la seed), desde su zona de aterrizaje
    NODE_MAP_ITEM: 'NODE_MAP',   // se recibe al empezar: marca dónde cayó el nodo
    SPACE_NODE_REQUIRED: true,   // sin "nodo espacial" las lunas no se pueden visitar
    MAP_RESOLUTION: 160,         // píxeles por lado del mapa del planeta
  },

  // Interacción del jugador con el mundo (recoger, golpear).
  INTERACTION: {
    RANGE: 2.8,                 // m desde el jugador hasta el borde del objetivo
    CHOP_SWING: 0.6,            // s entre golpes al talar manteniendo el clic
    ACTION_COOLDOWN: 0.45,      // s entre acciones (recoger o golpear)
    PLAYER_HIT_DAMAGE: 2,       // daño de un puñetazo
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
    SAND: 0xe2cf96,
    COAL: 0x26282b,
    COPPER: 0xd0803e,
    IRON: 0xc9b8a4,
    DIAMOND: 0xbff6ff,
    GLOW: 0x8dffd8,
    GLOW_STEM: 0x3f8f6a,
    CAVE_ROCK: 0x6b665f,
    GRASS: 0x7fb050,
    GRASS_TIP: 0xb9cf6a,
    COLOR_JITTER: 0.12,
  },

  // Especies animales. Comportamiento sencillo: pastar, pasear, mirar, huir.
  // Cada animal recibe al nacer (al azar, derivado de la seed):
  //   TEMPERAMENT ante el jugador: FLEE (huye), CURIOUS (se acerca), NEUTRAL (lo ignora)
  //   HIT_REACTION al ser golpeado: FLEE (huye) o FIGHT (se defiende y ataca)
  // Las probabilidades de cada especie están en TEMPERAMENT_WEIGHTS / HIT_REACTION_WEIGHTS.
  // Lugares especiales del Edén (campaña, WorldSites): alrededor del inicio no hay nada.
  SITES: {
    SAFE_RADIUS: 256, // m (4 chunks): a partir de aquí aparecen enemigos y lugares
    LIST: [
      // Lugares de la historia (primero: así añadir otros después no los mueve).
      { id: 'HERMIT_TOWER', count: 1, distance: [380, 700], biomes: { PLAINS: 0.6, FOREST: 0.5 }, radius: 9, spacing: 200, maxRelief: 6, minHeight: 5, pad: true, padBlend: 8 },
      { id: 'NODE_ARENA', count: 1, distance: [650, 1150], biomes: { PLAINS: 0.6, FOREST: 0.5, MOUNTAINS: 0.5 }, radius: 19, spacing: 300, maxRelief: 8, minHeight: 5, pad: true, padBlend: 12 },
      { id: 'RESEARCH_CENTER', count: 1, distance: [950, 1700], biomes: { PLAINS: 0.6, FOREST: 0.5 }, radius: 24, spacing: 300, maxRelief: 8, minHeight: 7, pad: true, padBlend: 14 },
      // Algunos a media distancia (para encontrarlos pronto) y el resto por todo el planeta.
      { id: 'GOLEMS_NEAR', kind: 'GOLEMS', count: 4, distance: [290, 650], biomes: GOLEM_BIOMES, radius: 5, spacing: 120, maxRelief: 4, minHeight: 4 },
      { id: 'GOBLIN_BASE_NEAR', kind: 'GOBLIN_BASE', count: 2, distance: [380, 850], biomes: BASE_BIOMES, radius: 16, spacing: 220, maxRelief: 5, minHeight: 4, pad: true, padBlend: 10 },
      { id: 'GOBLIN_BASE', count: 5, biomes: BASE_BIOMES, radius: 16, spacing: 220, maxRelief: 5, minHeight: 4, pad: true, padBlend: 10 },
      { id: 'GOLEMS', count: 16, biomes: GOLEM_BIOMES, radius: 5, spacing: 120, maxRelief: 4, minHeight: 4 },
    ],
  },

  // Enemigos (EnemySystem). Todos atacan con un amago antes del golpe: se puede esquivar o bloquear.
  ENEMIES: {
    ACTIVE_RADIUS: 110,     // m: solo se simulan y dibujan los cercanos
    DEATH_TIME: 1.8,
    LEASH: 45,              // m de su casa: más lejos, se vuelven
    GOLEMS_PER_SITE: [1, 3],
    CAVE_GOLEMS: 14,        // gólems dormidos en las cámaras de las cuevas
    GOBLINS_PER_BASE: [3, 5],
    GOBLIN_TEAMS: 4,        // equipos de exploración (con un jefe goblin cada uno)
    TEAM_SIZE: [3, 4],
    BASE_LOOT: { COIN: [2, 4], LEATHER: [1, 2], REFINED_WOOD: [1, 3], TREASURE_MAP: [0, 1] },
    SLIMES: { MAX: 4, EVERY: [10, 22], DISTANCE: [20, 34] }, // de noche, alrededor del jugador
    TYPES: {
      GOLEM: {
        NAME: 'Gólem', HEALTH: 30, DAMAGE: 25, SPEED: 1.5, RANGE: 2.2, WINDUP: 1.3, COOLDOWN: 2.6, AGGRO: 24,
        WAKE_DISTANCE: 7, ASSEMBLE_TIME: 2.2, RADIUS: 0.65, HEIGHT: 2.4, KNOCKBACK: 0.15,
        DROPS: { STONE: [3, 5] }, ORE_DROP: { CHANCE: 0.75, TYPES: { COPPER_ORE: 0.4, IRON_ORE: 0.28, COAL: 0.22, GOLD_ORE: 0.1 }, AMOUNT: [1, 2] },
      },
      SLIME: {
        NAME: 'Slime', HEALTH: 10, DAMAGE: 10, SPEED: 2.6, RANGE: 1.5, WINDUP: 0.55, COOLDOWN: 1.7, AGGRO: 32,
        RADIUS: 0.45, HEIGHT: 1.55, KNOCKBACK: 1.2, DROPS: { SLIME: [1, 2] },
      },
      GOBLIN: {
        NAME: 'Goblin', HEALTH: 20, DAMAGE: 20, SPEED: 4.3, RANGE: 1.9, WINDUP: 1.25, COOLDOWN: 2.4, AGGRO: 20,
        RADIUS: 0.45, HEIGHT: 1.45, KNOCKBACK: 0.8, DROPS: { LEATHER: [1, 1], WOOD: [1, 2], BONE: [0, 1] }, COIN_CHANCE: 1 / 3,
      },
      GOBLIN_BOSS: {
        NAME: 'Jefe goblin', HEALTH: 40, DAMAGE: 30, SPEED: 4.3, RANGE: 2.1, WINDUP: 1.05, COOLDOWN: 2.2, AGGRO: 26,
        RADIUS: 0.55, HEIGHT: 1.8, KNOCKBACK: 0.5, DROPS: { LEATHER: [1, 1], WOOD: [1, 2], COIN: [1, 1], REFINED_IRON: [1, 1] },
      },
    },
  },

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
        DROPS: { MEAT: 2, LEATHER: 1, BONE: 1 },
        HEALTH: 10,                 // animal genérico
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
        DROPS: { MEAT: 1, WOOL: 2, BONE: 1 },
        HEALTH: 14,
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
      CHICKEN: {
        NAME: 'Gallina',
        NAME_PLURAL: 'Gallinas',
        DROPS: { MEAT: 1, FEATHER: 2 },
        HEALTH: 4,
        ATTACK_DAMAGE: 1,
        ATTACK_COOLDOWN: 1.5,
        TEMPERAMENT_WEIGHTS: { FLEE: 0.55, CURIOUS: 0.15, NEUTRAL: 0.3 },
        HIT_REACTION_WEIGHTS: { FLEE: 1, FIGHT: 0 },
        WALK_SPEED: 0.9,
        FLEE_SPEED: 4.8,
        ALERT_DISTANCE: 9,
        FLEE_DISTANCE: 4,
        HERD_SIZE: [4, 7],
        BIOMES: { PLAINS: 1, FOREST: 0.6 },
        SCALE: [0.9, 1.1],
        COLORS: { BODY: 0xf2ede2, BELLY: 0xe0d6c2, DARK: 0xd23a2a },
      },
      COW: {
        NAME: 'Vaca',
        NAME_PLURAL: 'Vacas',
        DROPS: { MEAT: 3, LEATHER: 2, BONE: 2 },
        HEALTH: 16,
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

  // Granja (P4): cultivos de las parcelas. GROW: s de crecimiento regado (seco, ×DRY_SPEED);
  // abonado crece ×FERT_SPEED y da FERT_BONUS más. YIELD: lo que da al cosechar [mín, máx].
  FARM: {
    DRY_SPEED: 0.35,          // sin regar crece mucho más despacio
    WATER_TIME: 900,          // s que dura regada una parcela
    WATER_RADIUS: 3.2,        // un cubo riega también las parcelas de al lado
    FERT_SPEED: 1.6,
    FERT_BONUS: 1,
    CROPS: {
      WHEAT: { NAME: 'Trigo', GROW: 420, YIELD: { WHEAT: [2, 4], WHEAT_SEEDS: [1, 2] }, COLORS: [0x6fae3a, 0xd9be5c] },
      CARROT: { NAME: 'Zanahorias', GROW: 360, YIELD: { CARROT: [3, 5] }, COLORS: [0x5aa83a, 0xec7a24] },
      POTATO: { NAME: 'Patatas', GROW: 480, YIELD: { POTATO: [3, 6] }, COLORS: [0x4f9a3a, 0xc9a66a] },
      PUMPKIN: { NAME: 'Calabazas', GROW: 640, YIELD: { PUMPKIN: [1, 2], PUMPKIN_SEEDS: [0, 2] }, COLORS: [0x4f8f32, 0xe8862a] },
    },
  },

  // Pesca (P4). Dónde se pesca cada pez (RIVER, LAKE, SEA), su peso y su dificultad (0..1).
  FISHING: {
    RANGE: 16,                // m: hasta dónde llega el lanzamiento
    BITE_TIME: [4, 11],       // s esperando a que pique
    BITE_WINDOW: 1.3,         // s para clicar cuando pica
    CATCH_TIME: 3.5,          // s con el pez dentro de la zona para sacarlo
    ESCAPE_TIME: 4,           // s fuera de la zona (en total) y se escapa
    MAX_DISTANCE: 7,          // m: si el jugador se aleja del sitio, se rompe el sedal
    CATCHES: [
      { ITEM: 'SMALL_FISH', NAME: 'una perca', WHERE: ['LAKE', 'RIVER'], WEIGHT: 5, LEVEL: 0.15 },
      { ITEM: 'FISH', NAME: 'una trucha', WHERE: ['RIVER'], WEIGHT: 4, LEVEL: 0.45 },
      { ITEM: 'FISH', NAME: 'una carpa', WHERE: ['LAKE'], WEIGHT: 3, LEVEL: 0.35 },
      { ITEM: 'SMALL_FISH', NAME: 'unas sardinas', WHERE: ['SEA'], WEIGHT: 5, LEVEL: 0.2 },
      { ITEM: 'FISH', NAME: 'una lubina', WHERE: ['SEA'], WEIGHT: 3, LEVEL: 0.55 },
      { ITEM: 'GOLDEN_FISH', NAME: '¡un pez dorado!', WHERE: ['LAKE', 'RIVER', 'SEA'], WEIGHT: 0.35, LEVEL: 0.85 },
      { ITEM: 'WOOD', NAME: 'una rama vieja', WHERE: ['LAKE', 'RIVER', 'SEA'], WEIGHT: 0.6, LEVEL: 0.05 },
      { ITEM: 'COIN', NAME: 'una moneda goblin perdida', WHERE: ['LAKE', 'RIVER', 'SEA'], WEIGHT: 0.3, LEVEL: 0.1 },
    ],
  },

  // Domesticar y cuidar animales (P4). FOOD: lo que comen de tu mano; FEEDS: veces para domesticarlos.
  RANCH: {
    LURE_DISTANCE: 14,        // m: con su comida en la mano, se acercan y te siguen
    HOME_RADIUS: 6,           // m que pasean alrededor de donde los dejaste
    SPECIES: {
      COW: { FOOD: ['WHEAT', 'CARROT'], FEEDS: 3, MILK_EVERY: 300 },
      GOAT: { FOOD: ['WHEAT', 'CARROT', 'BERRIES'], FEEDS: 3, WOOL_EVERY: 420, WOOL: [2, 3] },
      CHICKEN: { FOOD: ['WHEAT_SEEDS', 'PUMPKIN_SEEDS'], FEEDS: 2, EGG_EVERY: 280 },
    },
  },

  // Comercio (P8): el mercader del Camino Real. Precios en monedas goblin.
  //   BUY: lo que vende él ({ ITEM, AMOUNT por compra, PRICE, STOCK al día }).
  //   SELL: lo que te compra ({ ITEM, AMOUNT que le das, PRICE que te paga }).
  //   ORDERS: encargos (3 a la vez); se renuevan los entregados cada día de juego.
  TRADE: {
    MERCHANT: { NAME: 'Tomás el buhonero', SITE: 'MERCHANT' },
    BUY: [
      { ITEM: 'WHEAT_SEEDS', AMOUNT: 4, PRICE: 1, STOCK: 6 },
      { ITEM: 'CARROT', AMOUNT: 2, PRICE: 1, STOCK: 5 },
      { ITEM: 'POTATO', AMOUNT: 2, PRICE: 1, STOCK: 5 },
      { ITEM: 'PUMPKIN_SEEDS', AMOUNT: 3, PRICE: 2, STOCK: 3 },
      { ITEM: 'BREAD', AMOUNT: 1, PRICE: 3, STOCK: 5 },
      { ITEM: 'ROPE', AMOUNT: 2, PRICE: 2, STOCK: 6 },
      { ITEM: 'COAL', AMOUNT: 3, PRICE: 1, STOCK: 8 },
      { ITEM: 'GLASS', AMOUNT: 2, PRICE: 2, STOCK: 6 },
      { ITEM: 'REFINED_IRON', AMOUNT: 1, PRICE: 4, STOCK: 4 },
      { ITEM: 'ARROW', AMOUNT: 5, PRICE: 2, STOCK: 6 },
      { ITEM: 'GLASS_BOTTLE', AMOUNT: 2, PRICE: 2, STOCK: 4 },
      { ITEM: 'HEALING_POTION', AMOUNT: 1, PRICE: 9, STOCK: 2 },
      { ITEM: 'FISHING_ROD', AMOUNT: 1, PRICE: 7, STOCK: 1 },
      { ITEM: 'SHEARS', AMOUNT: 1, PRICE: 7, STOCK: 1 },
      { ITEM: 'LANTERN', AMOUNT: 1, PRICE: 10, STOCK: 1 },
      { ITEM: 'TREASURE_MAP', AMOUNT: 1, PRICE: 8, STOCK: 2 },
      { ITEM: 'BACKPACK', AMOUNT: 1, PRICE: 30, STOCK: 1 },
    ],
    SELL: [
      { ITEM: 'WOOD', AMOUNT: 10, PRICE: 1 },
      { ITEM: 'STONE', AMOUNT: 10, PRICE: 1 },
      { ITEM: 'LEATHER', AMOUNT: 1, PRICE: 1 },
      { ITEM: 'WOOL', AMOUNT: 2, PRICE: 1 },
      { ITEM: 'FEATHER', AMOUNT: 5, PRICE: 1 },
      { ITEM: 'EGG', AMOUNT: 3, PRICE: 1 },
      { ITEM: 'WHEAT', AMOUNT: 4, PRICE: 1 },
      { ITEM: 'PUMPKIN', AMOUNT: 1, PRICE: 2 },
      { ITEM: 'FISH', AMOUNT: 1, PRICE: 1 },
      { ITEM: 'GOLDEN_FISH', AMOUNT: 1, PRICE: 15 },
      { ITEM: 'CHEESE', AMOUNT: 1, PRICE: 2 },
      { ITEM: 'JERKY', AMOUNT: 1, PRICE: 2 },
      { ITEM: 'BREAD', AMOUNT: 1, PRICE: 1 },
      { ITEM: 'CRYSTAL_SHARD', AMOUNT: 1, PRICE: 2 },
      { ITEM: 'GOLD_INGOT', AMOUNT: 1, PRICE: 7 },
      { ITEM: 'REFINED_DIAMOND', AMOUNT: 1, PRICE: 12 },
      { ITEM: 'SLIME', AMOUNT: 3, PRICE: 1 },
    ],
    ORDERS: [
      { ITEM: 'WOOD', AMOUNT: [20, 40], REWARD: [3, 5], XP: 30, TEXT: 'Necesito madera para arreglar el carro.' },
      { ITEM: 'LEATHER', AMOUNT: [3, 6], REWARD: [4, 7], XP: 35, TEXT: 'Me piden cuero en el puerto.' },
      { ITEM: 'WOOL', AMOUNT: [4, 8], REWARD: [3, 6], XP: 30, TEXT: 'Lana para unas mantas, que vienen fríos.' },
      { ITEM: 'FISH', AMOUNT: [2, 4], REWARD: [3, 6], XP: 35, TEXT: 'Pescado fresco para el mercado.' },
      { ITEM: 'BREAD', AMOUNT: [2, 4], REWARD: [4, 7], XP: 40, TEXT: 'Pan para el camino.' },
      { ITEM: 'COPPER_ORE', AMOUNT: [4, 8], REWARD: [4, 7], XP: 40, TEXT: 'Mena de cobre para el herrero.' },
      { ITEM: 'IRON_ORE', AMOUNT: [3, 6], REWARD: [6, 9], XP: 50, TEXT: 'Mena de hierro, de la buena.' },
      { ITEM: 'EGG', AMOUNT: [4, 8], REWARD: [3, 5], XP: 30, TEXT: 'Huevos, y que no estén rotos.' },
      { ITEM: 'PUMPKIN', AMOUNT: [1, 3], REWARD: [4, 7], XP: 40, TEXT: 'Calabazas para la fiesta de la cosecha.' },
      { ITEM: 'CHEESE', AMOUNT: [1, 3], REWARD: [5, 8], XP: 45, TEXT: 'Un buen queso del Edén.' },
      { ITEM: 'SLIME', AMOUNT: [4, 8], REWARD: [4, 6], XP: 35, TEXT: 'Baba de slime para un alquimista.' },
      { ITEM: 'GLOW_FLOWER', AMOUNT: [2, 4], REWARD: [5, 8], XP: 45, TEXT: 'Flores luminosas de las cuevas.' },
      { ITEM: 'COOKED_MEAT', AMOUNT: [3, 5], REWARD: [4, 6], XP: 35, TEXT: 'Carne asada para mis hijos.' },
      { ITEM: 'GOLD_INGOT', AMOUNT: [1, 2], REWARD: [10, 14], XP: 60, TEXT: 'Oro, aunque sea poco.' },
    ],
    ORDER_SLOTS: 3,
  },

  // Tesoros (P8): ruinas con un tesoro enterrado; los mapas del tesoro las marcan.
  TREASURE: {
    RUINS: 9,                 // ruinas repartidas por la isla (además de las Ruinas del Viejo Jardín)
    MIN_FROM_SPAWN: 250,
    DIG_RADIUS: 2.5,          // m: con la pala, E cerca de la X
    LOOT: { COIN: [6, 14], GOLD_INGOT: [0, 2], REFINED_DIAMOND: [0, 1], HEALING_POTION: [0, 1], CRYSTAL_SHARD: [1, 3], REFINED_IRON: [1, 3] },
  },

  // Logros (P8): EVENT + condición (contador `COUNT` o comprobación propia en AchievementSystem).
  ACHIEVEMENTS: {
    FIRST_TREE: { NAME: 'Leñador', ICON: '🌲', DESC: 'Tala tu primer árbol.', XP: 20 },
    FIRST_TOOL: { NAME: 'Manos a la obra', ICON: '🛠️', DESC: 'Fabrica una herramienta.', XP: 20 },
    COOK: { NAME: 'Cocinillas', ICON: '🍳', DESC: 'Cocina algo en la hoguera o la cocina.', XP: 25 },
    BUILDER: { NAME: 'Constructor', ICON: '🏠', DESC: 'Coloca 30 piezas de construcción.', XP: 60, COUNT: 30 },
    FARMER: { NAME: 'Agricultor', ICON: '🌾', DESC: 'Cosecha 5 parcelas.', XP: 50, COUNT: 5 },
    TAMER: { NAME: 'Amigo de los animales', ICON: '🐄', DESC: 'Domestica un animal.', XP: 40 },
    ANGLER: { NAME: 'Pescador', ICON: '🎣', DESC: 'Pesca 10 veces.', XP: 50, COUNT: 10 },
    GOLDEN_FISH: { NAME: 'Pez dorado', ICON: '🐡', DESC: 'Pesca un pez dorado.', XP: 100 },
    GOLEM: { NAME: 'Rompepiedras', ICON: '🗿', DESC: 'Derrota a un gólem.', XP: 50 },
    GOBLIN_BASE: { NAME: 'Limpieza', ICON: '🏴', DESC: 'Despeja una base goblin.', XP: 80 },
    DIAMOND: { NAME: '¡Diamantes!', ICON: '💎', DESC: 'Pica una veta de diamante.', XP: 60 },
    EXPLORER: { NAME: 'Explorador', ICON: '🧭', DESC: 'Descubre 10 lugares con nombre.', XP: 80, COUNT: 10 },
    POTION: { NAME: 'Alquimista', ICON: '⚗️', DESC: 'Bébete una poción.', XP: 30 },
    TRADER: { NAME: 'Trato hecho', ICON: '🤝', DESC: 'Compra o vende algo al mercader.', XP: 20 },
    ORDERS: { NAME: 'Recadero', ICON: '📦', DESC: 'Cumple 5 encargos del mercader.', XP: 80, COUNT: 5 },
    TREASURE: { NAME: 'Cazatesoros', ICON: '💰', DESC: 'Desentierra un tesoro.', XP: 60 },
    RICH: { NAME: 'Rico', ICON: '🪙', DESC: 'Junta 100 monedas a la vez.', XP: 60 },
    LEVEL_10: { NAME: 'Veterano', ICON: '⭐', DESC: 'Llega al nivel 10.', XP: 0 },
    BACKPACK: { NAME: 'Bien equipado', ICON: '🎒', DESC: 'Cósete una mochila.', XP: 30 },
    SURVIVOR: { NAME: 'Superviviente', ICON: '🌅', DESC: 'Sobrevive 10 días.', XP: 100 },
  },

  ADMIN: {
    ADMIN_SEQUENCE: ['a', 'd', 'm', 'i', 'n'],
    ADMIN_KEY_TIMEOUT: 2000, // ms máximos entre dos teclas de la secuencia
  },

  // Cuevas (planeta de inicio de la campaña): subterráneas (agujero en el suelo con rampa) y
  // de montaña (boca en la ladera). Túneles que bajan, con cámaras; minerales dentro.
  CAVES: {
    UNDERGROUND: 12,
    MOUNTAIN: 8,
    MIN_SPAWN_DISTANCE: 180,     // m: alrededor del inicio no hay cuevas
    MIN_SPACING: 260,            // m entre bocas
    STEP: 5,                     // m entre nodos del túnel
    LENGTH: [34, 48],            // nodos (≈ 170–240 m de túnel)
    MIN_STEPS: 16,
    DEPTH: [22, 34],             // m que baja el suelo respecto a la boca
    RADIUS: [2.5, 3.2],          // m de los pasillos
    CHAMBER_RADIUS: [6, 8.5],    // m de las cámaras
    CHAMBER_EVERY: 8,            // nodos entre cámaras
    TURN: 0.32,                  // rad de giro máximo por nodo
    ENTRANCE_STEPS: 4,           // nodos de rampa en la entrada
    ENTRANCE_DROP: 0.6,          // pendiente de la rampa (m por m)
    ROCK_ABOVE: 3,               // m de roca mínima sobre el techo
    CONTENT: {
      COAL: [3, 5],              // vetas de carbón en la boca
      COPPER_PER_NODE: 0.45,
      IRON_PER_NODE: 0.22,       // menos que cobre, y más adentro
      DIAMOND_PER_NODE: 0.035,   // muy raro, al fondo
      GLOW_FLOWERS: [2, 4],      // por cámara
      GOLD_PER_NODE: 0.05,       // P5: vetas de oro (pico de cobre)
      CRYSTAL_PER_NODE: 0.04,    // P5: drusas de cristal que brillan, en las cámaras hondas
    },
    DARKNESS_DEPTH: 6,           // m bajo la superficie a partir de los que la cueva es negra
  },

  // Guardar partida (localStorage del navegador): manual desde el reloj y automática.
  SAVE: {
    KEY: 'mundo0.save.v2', // v2: el Edén es un mapa diseñado (las partidas de antes no valen)
    AUTOSAVE_SECONDS: 300,      // cada 5 min de juego en el planeta de inicio
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
