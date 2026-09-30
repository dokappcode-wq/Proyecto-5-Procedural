/**
 * ShipBlueprints — planos de las naves (coordenadas locales: −Z morro, +X derecha,
 * y = 0 apoyo de las patas). ShipLayout los convierte en colisiones, suelos y
 * puntos de interacción; ShipModel, en el modelo 3D. Sin Three.js.
 *
 *   partitions  tabiques transversales (en z) con puertas (huecos con hoja corredera)
 *   furniture   muebles con caja de colisión y tipo (el modelo sabe dibujarlos)
 *   slots       ranuras de tecnología (qué hay en cada una: GameConfig.SHIP.INSTALLED*)
 *   interact    puntos con E: botones, asiento, cama, cápsulas, panel de descompresión…
 */
const box = (minX, maxX, minY, maxY, minZ, maxZ) => ({ minX, maxX, minY, maxY, minZ, maxZ });
const F = 2.5; // suelo interior

// ---- Nave pequeña (la inicial) ---------------------------------------------------------
export const SMALL = {
  id: 'SMALL',
  name: 'Nave exploradora',
  dim: { BOTTOM: 2.2, FLOOR: F, CEILING: 5.0, ROOF: 5.35, HALF_WIDTH: 3.4, INNER: 3.1, FRONT: -7.0, REAR: 6.6, NOSE: -8.3 },
  hatch: { MIN_X: -1.0, MAX_X: 1.0, HINGE_Z: 1.2, LENGTH: 4.2, THICKNESS: 0.3 },
  legs: [{ x: -2.6, z: 3.9 }, { x: 2.6, z: 3.9 }, { x: -2.3, z: -4.6 }, { x: 2.3, z: -4.6 }],
  partitions: [{ z: -2.35, doors: [{ id: 'CONTROL', x0: -0.65, x1: 0.65, label: 'Puerta de la sala de controles' }] }],
  engines: [{ x: -2.4, y: 3.7, r: 0.62 }, { x: 2.4, y: 3.7, r: 0.62 }],
  wings: false,
  rooms: [
    { name: 'Sala de controles', z0: -7.0, z1: -2.35 },
    { name: 'Sala de estar / laboratorio', z0: -2.35, z1: 6.6 },
  ],
  seat: { x: 0, z: -4.7 },
  standUp: [1.1, -3.9],
  respawn: [-1.6, 3.4],
  console: box(-2.0, 2.0, F, 3.5, -6.7, -5.9),
  extButton: { collider: box(-2.15, -1.65, 1.35, 2.2, 5.75, 6.1), aim: [-1.9, 1.75, 6.15] },
  innerButton: { collider: box(1.3, 1.7, F, 3.4, 0.55, 0.95), aim: [1.5, 3.45, 0.75] },
  watch: [2.3, 3.45, 6.0],
  furniture: [
    { type: 'SOFA', box: box(-3.1, -1.7, F, 3.4, 4.6, 6.3) },
    { type: 'LAB_TABLE', box: box(1.7, 3.1, F, 3.4, 4.6, 6.3) },
  ],
  slots: {
    LAB_1: { collider: box(-3.1, -2.4, F, 3.8, -1.5, -0.3), aim: [-2.35, 3.35, -0.9] },
    LAB_2: { collider: box(2.4, 3.1, F, 3.8, -1.5, -0.3), aim: [2.35, 3.35, -0.9] },
    LAB_3: { collider: box(-3.1, -2.6, F, 3.2, 2.0, 3.2), aim: [-2.55, 3.3, 2.6] },
    LAB_4: { collider: box(2.6, 3.1, F, 3.2, 2.0, 3.2), aim: [2.55, 3.3, 2.6] },
    CONTROL_1: { collider: box(-3.1, -2.6, F, 3.2, -4.2, -3.0), aim: [-2.55, 3.3, -3.6] },
    CONTROL_2: { collider: box(2.6, 3.1, F, 3.2, -4.2, -3.0), aim: [2.55, 3.3, -3.6] },
  },
  interact: [],
  lights: [[0, 4.5, 1.8], [0, 4.5, -4.6]],
  windows: [-7.0, -5.6, -4.2, -2.6, -0.2, 1.2, 3.6, 6.0],
};

// ---- Nave ampliada (con el nodo espacial) ------------------------------------------------
//   z −16.5 morro · −15..−9 sala de mandos · −9..−3 sala de estar (sofá cama) ·
//   −3..5 laboratorio + sala de máquinas · 5..9 cápsulas de escape ·
//   9..14 descompresión (compuerta inferior con rampa) · 14.. motores
export const EXPLORER = {
  id: 'EXPLORER',
  name: 'Nave exploradora (nodo espacial)',
  dim: { BOTTOM: 2.2, FLOOR: F, CEILING: 5.0, ROOF: 5.35, HALF_WIDTH: 5.0, INNER: 4.7, FRONT: -15.0, REAR: 14.0, NOSE: -16.6 },
  hatch: { MIN_X: -1.0, MAX_X: 1.0, HINGE_Z: 9.4, LENGTH: 4.2, THICKNESS: 0.3 },
  legs: [{ x: -4.0, z: 11.8 }, { x: 4.0, z: 11.8 }, { x: -4.3, z: 0.5 }, { x: 4.3, z: 0.5 }, { x: -3.5, z: -12.0 }, { x: 3.5, z: -12.0 }],
  partitions: [
    { z: -9.0, doors: [{ id: 'CONTROL', x0: -0.65, x1: 0.65, label: 'Puerta de la sala de mandos' }] },
    { z: -3.0, doors: [{ id: 'LOUNGE', x0: -0.65, x1: 0.65, label: 'Puerta de la sala de estar' }] },
    { z: 5.0, doors: [{ id: 'PODS', x0: -0.65, x1: 0.65, label: 'Puerta de las cápsulas de escape' }] },
    { z: 9.0, doors: [{ id: 'AIRLOCK', x0: -0.65, x1: 0.65, label: 'Puerta interior de descompresión', airlock: true }] },
  ],
  engines: [
    { x: -3.4, y: 3.7, r: 0.8 }, { x: 3.4, y: 3.7, r: 0.8 },
    { x: -1.2, y: 4.3, r: 0.55 }, { x: 1.2, y: 4.3, r: 0.55 },
  ],
  wings: { span: 12.5, z0: -5, z1: 7, y: 3.1, thrusters: true },
  rooms: [
    { name: 'Sala de mandos', z0: -15.0, z1: -9.0 },
    { name: 'Sala de estar', z0: -9.0, z1: -3.0 },
    { name: 'Laboratorio y sala de máquinas', z0: -3.0, z1: 5.0 },
    { name: 'Cápsulas de escape', z0: 5.0, z1: 9.0 },
    { name: 'Descompresión', z0: 9.0, z1: 14.0, airlock: true },
  ],
  seat: { x: 0, z: -12.2 },
  standUp: [1.2, -11.3],
  respawn: [-1.5, -6.0],
  console: box(-2.6, 2.6, F, 3.5, -14.7, -13.9),
  extButton: { collider: box(-2.65, -2.15, 1.35, 2.2, 13.2, 13.55), aim: [-2.4, 1.75, 13.6] },
  innerButton: { collider: box(1.5, 1.9, F, 3.4, 11.3, 11.7), aim: [1.7, 3.45, 11.5] },
  watch: [2.6, 3.45, -5.2],
  furniture: [
    { type: 'SOFA_BED', box: box(-4.7, -2.4, F, 3.3, -8.6, -5.0), interact: { id: 'BED', aim: [-3.5, 3.1, -6.8], label: 'Sofá cama', action: 'Dormir' } },
    { type: 'LOUNGE_TABLE', box: box(1.8, 3.4, F, 3.3, -6.2, -4.3) },
    { type: 'ENGINE_BLOCK', box: box(2.6, 4.7, F, 4.6, -2.6, 0.8) },
    { type: 'ENGINE_BLOCK', box: box(2.6, 4.7, F, 4.6, 3.0, 4.7) },
    { type: 'POD', box: box(-4.7, -2.3, F, 4.8, 5.4, 8.6), interact: { id: 'POD_1', aim: [-2.2, 3.6, 7.0], label: 'Cápsula de escape 1', action: 'Subir' } },
    { type: 'POD', box: box(2.3, 4.7, F, 4.8, 5.4, 8.6), interact: { id: 'POD_2', aim: [2.2, 3.6, 7.0], label: 'Cápsula de escape 2', action: 'Subir' } },
    { type: 'AIRLOCK_PANEL', box: box(-4.7, -4.3, F, 4.0, 10.6, 11.8), interact: { id: 'AIRLOCK', aim: [-4.25, 3.5, 11.2], label: 'Panel de descompresión', action: 'Descomprimir / presurizar' } },
  ],
  slots: {
    LAB_1: { collider: box(-4.7, -4.0, F, 3.8, -2.6, -1.4), aim: [-3.95, 3.35, -2.0] },
    LAB_2: { collider: box(-4.7, -4.0, F, 3.8, -0.9, 0.3), aim: [-3.95, 3.35, -0.3] },
    LAB_3: { collider: box(-4.7, -4.0, F, 3.8, 0.8, 2.0), aim: [-3.95, 3.35, 1.4] },
    LAB_4: { collider: box(-4.7, -4.0, F, 3.8, 2.5, 3.7), aim: [-3.95, 3.35, 3.1] },
    ENGINE_1: { collider: box(2.9, 4.7, F, 3.4, 1.2, 2.6), aim: [2.85, 3.5, 1.9] },
    CONTROL_1: { collider: box(-4.7, -4.2, F, 3.2, -11.6, -10.4), aim: [-4.15, 3.3, -11.0] },
    CONTROL_2: { collider: box(4.2, 4.7, F, 3.2, -11.6, -10.4), aim: [4.15, 3.3, -11.0] },
    LOUNGE_1: { collider: box(4.2, 4.7, F, 3.2, -8.6, -7.4), aim: [4.15, 3.3, -8.0] },
  },
  interact: [],
  lights: [[0, 4.5, -12], [0, 4.5, -6], [0, 4.5, 1], [0, 4.5, 11]],
  windows: [-15, -12.6, -10.2, -9.2, -7.4, -5, -3.2, -1, 1.4, 3.6, 4.8, 7, 8.8, 11, 13.4],
};

export const BLUEPRINTS = { SMALL, EXPLORER };
