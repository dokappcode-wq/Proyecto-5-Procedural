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
    VERSION: '0.1.0-fase1',
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
    FOG_NEAR: 60,
    FOG_FAR: 260,
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
    PITCH_LIMIT: Math.PI / 2 - 0.05,
    BODY_TURN_SPEED: 10,      // rad/s con que el cuerpo gira hacia la dirección de avance
    SPAWN: { x: 0, z: 6 },    // la Fase 2 lo sustituirá por una posición derivada de la seed
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

  // Mundo provisional de la Fase 1. La Fase 2 lo sustituye por la generación procedural.
  PLACEHOLDER_WORLD: {
    SIZE: 400,
    GRID_CELL: 2,
    GROUND_COLOR_A: 0x6fa650,
    GROUND_COLOR_B: 0x659a48,
    // Bloques de referencia para probar salto, escalones y cámara: [x, z, ancho, alto, fondo]
    BLOCKS: [
      // Escalera: peldaños de 0.4 m (se suben caminando, MAX_STEP_HEIGHT = 0.45)
      [6, 0, 2, 0.4, 2],
      [8, 0, 2, 0.8, 2],
      [10, 0, 2, 1.2, 2],
      // Bloques sueltos: 0.4 se sube caminando, 1.0 requiere saltar, 2.0 es una pared
      [6, 8, 2, 0.4, 2],
      [10, 8, 2, 1.0, 2],
      [14, 8, 2, 2.0, 2],
      [-8, -6, 3, 3, 3],
      [-14, 10, 4, 6, 4],
      [18, -18, 6, 1, 6],
      [0, -25, 12, 0.5, 12],
    ],
    BLOCK_COLOR: 0xa39a8c,
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
