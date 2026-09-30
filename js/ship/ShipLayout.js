/**
 * ShipLayout — forma de la nave pequeña en coordenadas LOCALES. Sin Three.js.
 *
 * Ejes locales: −Z = morro (hacia delante), +X = derecha, y = 0 = plano de
 * apoyo de las patas. La nave se coloca en el mundo con (x, y, z, yaw) igual
 * que un Object3D (rotation.y = yaw). Las colisiones y superficies se
 * resuelven en espacio local, así funcionan con cualquier orientación.
 *
 *   ┌──────────── morro (−Z) ────────────┐
 *   │  SALA DE CONTROLES                 │  consola + asiento del piloto,
 *   │  [ranura]   asiento   [ranura]     │  2 ranuras libres
 *   ├────────────┤ puerta ├──────────────┤  z = −2.35
 *   │  SALA DE ESTAR / LABORATORIO       │
 *   │  [mapa]                [carga]     │  tecnologías instaladas
 *   │  [ranura]   compuerta  [ranura]    │  2 ranuras libres
 *   │  sofá      (rampa)     mesa lab.   │
 *   └──────────── cola (+Z) ─────────────┘  botón exterior bajo la cola
 *
 * El casco está a BOTTOM m del suelo: se puede caminar por debajo hasta la
 * rampa de la compuerta, que baja desde el suelo del laboratorio.
 */
export const DIM = Object.freeze({
  BOTTOM: 2.2,     // parte inferior del casco
  FLOOR: 2.5,      // suelo interior (caminable)
  CEILING: 5.0,    // techo interior
  ROOF: 5.35,      // tejado exterior
  HALF_WIDTH: 3.4, // mitad del ancho exterior
  INNER: 3.1,      // cara interior de las paredes laterales
  FRONT: -7.0,     // pared delantera (parabrisas)
  REAR: 6.6,       // pared trasera
  NOSE: -8.3,      // punta del morro
  PARTITION_Z: -2.35,
  DOOR_HALF: 0.65,
  DOOR_TOP: 4.7,
});

/** Compuerta inferior: bisagra en HINGE_Z, se abre hacia la cola como rampa. */
export const HATCH = Object.freeze({ MIN_X: -1.0, MAX_X: 1.0, HINGE_Z: 1.2, LENGTH: 4.2, THICKNESS: 0.3 });

/** Patas de aterrizaje (x, z) y medio lado de la caja de colisión. */
export const LEGS = Object.freeze([
  { x: -2.6, z: 3.9 },
  { x: 2.6, z: 3.9 },
  { x: -2.3, z: -4.6 },
  { x: 2.3, z: -4.6 },
]);
export const LEG_HALF = 0.22;
export const LEG_RETRACTED_BOTTOM = DIM.BOTTOM - 0.35;

const box = (minX, maxX, minY, maxY, minZ, maxZ) => ({ minX, maxX, minY, maxY, minZ, maxZ });

/**
 * Ranuras de tecnología (qué hay instalado en cada una: GameConfig.SHIP.INSTALLED).
 * `collider` es la caja del mueble; `aim` el punto al que se apunta con la mira.
 */
export const SLOTS = Object.freeze({
  CONTROL_CONSOLE: { room: 'CONTROL', collider: box(-2.0, 2.0, DIM.FLOOR, 3.5, -6.7, -5.9), aim: [0, 3.6, -6.2], facing: 0 },
  LAB_1: { room: 'LAB', collider: box(-3.1, -2.4, DIM.FLOOR, 3.8, -1.5, -0.3), aim: [-2.35, 3.35, -0.9], facing: -Math.PI / 2 },
  LAB_2: { room: 'LAB', collider: box(2.4, 3.1, DIM.FLOOR, 3.8, -1.5, -0.3), aim: [2.35, 3.35, -0.9], facing: Math.PI / 2 },
  LAB_3: { room: 'LAB', collider: box(-3.1, -2.6, DIM.FLOOR, 3.2, 2.0, 3.2), aim: [-2.55, 3.3, 2.6], facing: -Math.PI / 2 },
  LAB_4: { room: 'LAB', collider: box(2.6, 3.1, DIM.FLOOR, 3.2, 2.0, 3.2), aim: [2.55, 3.3, 2.6], facing: Math.PI / 2 },
  CONTROL_1: { room: 'CONTROL', collider: box(-3.1, -2.6, DIM.FLOOR, 3.2, -4.2, -3.0), aim: [-2.55, 3.3, -3.6], facing: -Math.PI / 2 },
  CONTROL_2: { room: 'CONTROL', collider: box(2.6, 3.1, DIM.FLOOR, 3.2, -4.2, -3.0), aim: [2.55, 3.3, -3.6], facing: Math.PI / 2 },
});

/** Asiento del piloto, botones y puerta: puntos de interacción (además de las ranuras). */
export const SEAT = Object.freeze({ x: 0, z: -4.7, collider: box(-0.45, 0.45, DIM.FLOOR, 3.7, -5.0, -4.35), aim: [0, 3.35, -4.7], standUp: [1.1, -3.9] });
export const EXT_BUTTON = Object.freeze({ collider: box(-2.15, -1.65, 1.35, DIM.BOTTOM, 5.75, 6.1), aim: [-1.9, 1.75, 6.15] });
export const INNER_BUTTON = Object.freeze({ collider: box(1.3, 1.7, DIM.FLOOR, 3.4, 0.55, 0.95), aim: [1.5, 3.45, 0.75] });
export const DOOR_AIM = Object.freeze([0, 3.6, DIM.PARTITION_Z]);
/** Base del reloj de la nave, sobre la mesa del laboratorio. */
export const WATCH_AIM = Object.freeze([2.3, 3.45, 6.0]);

/** Muebles y casco que siempre bloquean (paredes, consola, sofá, motores...). */
const STATIC_COLLIDERS = Object.freeze([
  // Casco
  box(-DIM.HALF_WIDTH, -DIM.INNER, DIM.BOTTOM, DIM.ROOF, DIM.FRONT, DIM.REAR),  // pared izquierda
  box(DIM.INNER, DIM.HALF_WIDTH, DIM.BOTTOM, DIM.ROOF, DIM.FRONT, DIM.REAR),    // pared derecha
  box(-DIM.HALF_WIDTH, DIM.HALF_WIDTH, DIM.BOTTOM, DIM.ROOF, 6.3, DIM.REAR),    // pared trasera
  box(-DIM.HALF_WIDTH, DIM.HALF_WIDTH, DIM.BOTTOM, DIM.ROOF, DIM.FRONT, -6.7),  // parabrisas
  box(-2.3, 2.3, DIM.BOTTOM, 4.8, DIM.NOSE, DIM.FRONT),                        // morro
  box(-3.0, -1.8, 3.0, 4.4, DIM.REAR, 7.8),                                    // motor izquierdo
  box(1.8, 3.0, 3.0, 4.4, DIM.REAR, 7.8),                                      // motor derecho
  // Tabique entre salas (a ambos lados de la puerta) y dintel
  box(-DIM.INNER, -DIM.DOOR_HALF, DIM.FLOOR, DIM.CEILING, -2.5, -2.2),
  box(DIM.DOOR_HALF, DIM.INNER, DIM.FLOOR, DIM.CEILING, -2.5, -2.2),
  box(-DIM.DOOR_HALF, DIM.DOOR_HALF, DIM.DOOR_TOP, DIM.CEILING, -2.5, -2.2),
  // Muebles
  SEAT.collider,
  box(-3.1, -1.7, DIM.FLOOR, 3.4, 4.6, 6.3),  // sofá
  box(1.7, 3.1, DIM.FLOOR, 3.4, 4.6, 6.3),    // mesa de laboratorio
  INNER_BUTTON.collider,
  EXT_BUTTON.collider,
  ...Object.values(SLOTS).map((s) => s.collider),
]);

const DOOR_LEAF = box(-DIM.DOOR_HALF, DIM.DOOR_HALF, DIM.FLOOR, DIM.DOOR_TOP, -2.45, -2.25);

/** Suelo interior alrededor del hueco de la compuerta. */
const FLOOR_RECTS = Object.freeze([
  { minX: -DIM.HALF_WIDTH, maxX: DIM.HALF_WIDTH, minZ: DIM.FRONT, maxZ: HATCH.HINGE_Z },
  { minX: -DIM.HALF_WIDTH, maxX: HATCH.MIN_X, minZ: HATCH.HINGE_Z, maxZ: DIM.REAR },
  { minX: HATCH.MAX_X, maxX: DIM.HALF_WIDTH, minZ: HATCH.HINGE_Z, maxZ: DIM.REAR },
  { minX: HATCH.MIN_X, maxX: HATCH.MAX_X, minZ: HATCH.HINGE_Z + HATCH.LENGTH, maxZ: DIM.REAR },
]);
const ROOF_RECT = Object.freeze({ minX: -DIM.HALF_WIDTH, maxX: DIM.HALF_WIDTH, minZ: DIM.FRONT, maxZ: DIM.REAR });

/** Huella en planta (para aterrizar, despejar recursos y bloquear construcciones). */
export const FOOTPRINT = Object.freeze({ minX: -DIM.HALF_WIDTH, maxX: DIM.HALF_WIDTH, minZ: DIM.NOSE, maxZ: 7.8 });

// ---- Transformaciones ---------------------------------------------------------

export function toWorld(ship, lx, lz) {
  const c = Math.cos(ship.yaw);
  const s = Math.sin(ship.yaw);
  return [ship.x + lx * c + lz * s, ship.z - lx * s + lz * c];
}

export function toLocal(ship, wx, wz) {
  const dx = wx - ship.x;
  const dz = wz - ship.z;
  const c = Math.cos(ship.yaw);
  const s = Math.sin(ship.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Dirección local → mundo (sin traslación). */
export function dirToWorld(ship, lx, lz) {
  const c = Math.cos(ship.yaw);
  const s = Math.sin(ship.yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// ---- Estado variable: compuerta, puerta y patas --------------------------------

/**
 * Ángulo de la rampa (rad) con la compuerta abierta: la punta llega al suelo
 * que hay bajo ella (`rampFootY`, local, ≤ 0 si el terreno está más bajo).
 */
export function rampOpenAngle(rampFootY = 0) {
  const drop = Math.min(HATCH.LENGTH, Math.max(0.3, DIM.FLOOR - rampFootY));
  return Math.asin(drop / HATCH.LENGTH);
}

/** Punto (local) donde termina la rampa: { z, y }. */
export function rampEnd(ship) {
  const a = (ship.hatch ?? 0) * (ship.rampAngle ?? rampOpenAngle(0));
  return { z: HATCH.HINGE_Z + HATCH.LENGTH * Math.cos(a), y: DIM.FLOOR - HATCH.LENGTH * Math.sin(a), angle: a };
}

/** Parte inferior de cada pata (local), según lo desplegadas que estén. */
export function legBottoms(ship) {
  const r = ship.legs ?? 1;
  return LEGS.map((_, i) => {
    const deployed = ship.legFeet?.[i] ?? 0;
    return LEG_RETRACTED_BOTTOM + (deployed - LEG_RETRACTED_BOTTOM) * r;
  });
}

/** Cajas de colisión locales en el estado actual. */
export function localColliders(ship) {
  const list = STATIC_COLLIDERS.slice();
  if ((ship.door ?? 0) < 0.85) list.push(DOOR_LEAF);
  const bottoms = legBottoms(ship);
  LEGS.forEach((l, i) => list.push(box(l.x - LEG_HALF, l.x + LEG_HALF, bottoms[i], DIM.BOTTOM, l.z - LEG_HALF, l.z + LEG_HALF)));
  return list;
}

/** Superficie caminable local más alta en (lx, lz): { top, bottom } o null. Incluye el tejado. */
export function localSurfaces(ship, lx, lz) {
  const out = [];
  const inside = (r) => lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ;
  for (const r of FLOOR_RECTS) if (inside(r)) out.push({ top: DIM.FLOOR, bottom: DIM.BOTTOM });
  if (inside(ROOF_RECT)) out.push({ top: DIM.ROOF, bottom: DIM.CEILING });
  // Compuerta / rampa
  if (lx >= HATCH.MIN_X && lx <= HATCH.MAX_X) {
    const end = rampEnd(ship);
    if (lz >= HATCH.HINGE_Z && lz <= end.z + 1e-6) {
      const tan = Math.tan(end.angle);
      const top = DIM.FLOOR - (lz - HATCH.HINGE_Z) * tan;
      out.push({ top, bottom: top - HATCH.THICKNESS });
    }
  }
  return out;
}

// ---- Consultas en coordenadas del mundo ----------------------------------------

/** Superficie más alta en (x, z) que no supere maxY (mundo), o null. */
export function surfaceAt(ship, x, z, maxY) {
  const [lx, lz] = toLocal(ship, x, z);
  let best = null;
  for (const s of localSurfaces(ship, lx, lz)) {
    const top = ship.y + s.top;
    if (top <= maxY && (best === null || top > best)) best = top;
  }
  return best;
}

/** ¿Alguna superficie (borde de suelo) hace de muro entre y0 e y1 en el círculo? */
export function blocksAt(ship, x, z, r, y0, y1) {
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const [lx, lz] = toLocal(ship, x + dx, z + dz);
    for (const s of localSurfaces(ship, lx, lz)) {
      if (ship.y + s.top > y0 && ship.y + s.bottom < y1) return true;
    }
  }
  return false;
}

/** Parte inferior de la superficie más baja por encima de y, o Infinity. */
export function ceilingAt(ship, x, z, y) {
  const [lx, lz] = toLocal(ship, x, z);
  let c = Infinity;
  for (const s of localSurfaces(ship, lx, lz)) {
    const b = ship.y + s.bottom;
    if (b >= y && b < c) c = b;
  }
  return c;
}

/** Empuja un círculo (pos en el mundo, radio r) fuera de las cajas que cruzan [y0, y1]. */
export function resolveCollisions(ship, pos, r, y0 = -Infinity, y1 = Infinity) {
  const [lx, lz] = toLocal(ship, pos.x, pos.z);
  // Descarte rápido: lejos de la nave.
  if (lx < FOOTPRINT.minX - r - 1 || lx > FOOTPRINT.maxX + r + 1 || lz < FOOTPRINT.minZ - r - 1 || lz > FOOTPRINT.maxZ + r + 1) return false;
  const p = { x: lx, z: lz };
  let hit = false;
  for (const b of localColliders(ship)) {
    if (ship.y + b.maxY <= y0 || ship.y + b.minY >= y1) continue;
    if (pushOut(p, r, b)) hit = true;
  }
  if (hit) {
    const [wx, wz] = toWorld(ship, p.x, p.z);
    pos.x = wx;
    pos.z = wz;
  }
  return hit;
}

/** ¿Está el punto (mundo) dentro de las salas? */
export function isInside(ship, x, y, z) {
  const [lx, lz] = toLocal(ship, x, z);
  const ly = y - ship.y;
  return lx > -DIM.INNER && lx < DIM.INNER && lz > DIM.FRONT && lz < DIM.REAR && ly > DIM.FLOOR - 0.6 && ly < DIM.CEILING;
}

/** ¿Solapa un rectángulo del mundo (AABB en XZ) con la huella de la nave? */
export function overlapsFootprint(ship, box2, margin = 0) {
  // Se comprueba en local con las 4 esquinas y el centro de la caja (piezas pequeñas).
  const pts = [
    [box2.minX, box2.minZ], [box2.maxX, box2.minZ], [box2.minX, box2.maxZ], [box2.maxX, box2.maxZ],
    [(box2.minX + box2.maxX) / 2, (box2.minZ + box2.maxZ) / 2],
  ];
  return pts.some(([x, z]) => {
    const [lx, lz] = toLocal(ship, x, z);
    return lx >= FOOTPRINT.minX - margin && lx <= FOOTPRINT.maxX + margin && lz >= FOOTPRINT.minZ - margin && lz <= FOOTPRINT.maxZ + margin;
  });
}

/** Puntos (locales) de la huella en los que se mide el terreno al volar o aterrizar. */
export const GROUND_SAMPLES = Object.freeze([
  ...LEGS.map((l) => [l.x, l.z]),
  [0, 0], [-DIM.HALF_WIDTH, DIM.FRONT], [DIM.HALF_WIDTH, DIM.FRONT], [-DIM.HALF_WIDTH, DIM.REAR], [DIM.HALF_WIDTH, DIM.REAR],
  [0, DIM.NOSE], [0, 7.8], [-DIM.HALF_WIDTH, 0], [DIM.HALF_WIDTH, 0],
]);
export const RAMP_FOOT_SAMPLE = Object.freeze([0, HATCH.HINGE_Z + HATCH.LENGTH * 0.8]);

function pushOut(pos, r, b) {
  const cx = Math.min(Math.max(pos.x, b.minX), b.maxX);
  const cz = Math.min(Math.max(pos.z, b.minZ), b.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  } else {
    const exits = [
      [b.minX - r - pos.x, 0], [b.maxX + r - pos.x, 0],
      [0, b.minZ - r - pos.z], [0, b.maxZ + r - pos.z],
    ].sort((a, c) => Math.hypot(...a) - Math.hypot(...c))[0];
    pos.x += exits[0];
    pos.z += exits[1];
  }
  return true;
}
