import { SMALL } from './ShipBlueprints.js';

/**
 * ShipLayout — forma de una nave a partir de su plano (ShipBlueprints). Sin Three.js.
 *
 * `createShipLayout(blueprint)` devuelve un objeto con las medidas (DIM, HATCH,
 * LEGS, SLOTS…) y las consultas en coordenadas del mundo (surfaceAt, blocksAt,
 * ceilingAt, resolveCollisions, isInside…). La nave pequeña y la ampliada usan el
 * mismo código: solo cambia el plano.
 *
 * Ejes locales: −Z = morro, +X = derecha, y = 0 = apoyo de las patas. La nave se
 * coloca con (x, y, z, yaw) como un Object3D; las colisiones se resuelven en
 * espacio local, así funcionan con cualquier orientación.
 *
 * Estado variable que se lee de `ship`: hatch (0..1), rampAngle, legs (0..1),
 * legFeet[], doors { id: 0..1 } (0 cerrada, 1 abierta).
 */
const box = (minX, maxX, minY, maxY, minZ, maxZ) => ({ minX, maxX, minY, maxY, minZ, maxZ });
const WALL = 0.3;

// ---- Transformaciones (no dependen del plano) ------------------------------------

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

export function dirToWorld(ship, lx, lz) {
  const c = Math.cos(ship.yaw);
  const s = Math.sin(ship.yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

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

// ---- Fábrica ----------------------------------------------------------------------

export function createShipLayout(bp) {
  const D = Object.freeze({ ...bp.dim, PARTITION_Z: bp.partitions[0]?.z ?? 0, DOOR_HALF: 0.65, DOOR_TOP: 4.7 });
  const HATCH = Object.freeze({ ...bp.hatch });
  const LEGS = Object.freeze(bp.legs.map((l) => Object.freeze({ ...l })));
  const LEG_HALF = 0.22;
  const LEG_RETRACTED_BOTTOM = D.BOTTOM - 0.35;
  const W = D.HALF_WIDTH;
  const I = D.INNER;

  // Puertas (todas las de los tabiques), con su hoja cerrada como caja.
  const DOORS = [];
  for (const p of bp.partitions) {
    for (const d of p.doors) {
      DOORS.push({ ...d, z: p.z, leaf: box(d.x0, d.x1, D.FLOOR, D.DOOR_TOP, p.z - 0.1, p.z + 0.1), aim: [(d.x0 + d.x1) / 2, 3.6, p.z] });
    }
  }

  // Ranuras: la consola de vuelo es una ranura más (tecnología FLIGHT_SYSTEM).
  const SLOTS = { CONTROL_CONSOLE: { collider: bp.console, aim: [0, 3.6, (bp.console.minZ + bp.console.maxZ) / 2] } };
  for (const [id, s] of Object.entries(bp.slots)) SLOTS[id] = s;
  const SEAT = {
    x: bp.seat.x,
    z: bp.seat.z,
    collider: box(bp.seat.x - 0.45, bp.seat.x + 0.45, D.FLOOR, 3.7, bp.seat.z - 0.3, bp.seat.z + 0.35),
    aim: [bp.seat.x, 3.35, bp.seat.z],
    standUp: bp.standUp,
  };

  // Colisiones fijas: casco, tabiques (a ambos lados de cada puerta), muebles.
  const STATIC = [
    box(-W, -I, D.BOTTOM, D.ROOF, D.FRONT, D.REAR),
    box(I, W, D.BOTTOM, D.ROOF, D.FRONT, D.REAR),
    box(-W, W, D.BOTTOM, D.ROOF, D.REAR - WALL, D.REAR),
    box(-W, W, D.BOTTOM, D.ROOF, D.FRONT, D.FRONT + WALL),
    box(-W * 0.68, W * 0.68, D.BOTTOM, 4.8, D.NOSE, D.FRONT),
  ];
  for (const e of bp.engines) STATIC.push(box(e.x - e.r, e.x + e.r, e.y - e.r, e.y + e.r, D.REAR, D.REAR + 1.2));
  for (const p of bp.partitions) {
    const doors = [...p.doors].sort((a, b) => a.x0 - b.x0);
    let x = -I;
    for (const d of doors) {
      if (d.x0 > x) STATIC.push(box(x, d.x0, D.FLOOR, D.CEILING, p.z - 0.15, p.z + 0.15));
      STATIC.push(box(d.x0, d.x1, D.DOOR_TOP, D.CEILING, p.z - 0.15, p.z + 0.15)); // dintel
      x = d.x1;
    }
    if (x < I) STATIC.push(box(x, I, D.FLOOR, D.CEILING, p.z - 0.15, p.z + 0.15));
  }
  STATIC.push(SEAT.collider, bp.extButton.collider, bp.innerButton.collider);
  for (const f of bp.furniture) STATIC.push(f.box);
  for (const s of Object.values(SLOTS)) STATIC.push(s.collider);

  // Suelo interior alrededor del hueco de la compuerta; tejado.
  const FLOOR_RECTS = [
    { minX: -W, maxX: W, minZ: D.FRONT, maxZ: HATCH.HINGE_Z },
    { minX: -W, maxX: HATCH.MIN_X, minZ: HATCH.HINGE_Z, maxZ: D.REAR },
    { minX: HATCH.MAX_X, maxX: W, minZ: HATCH.HINGE_Z, maxZ: D.REAR },
    { minX: HATCH.MIN_X, maxX: HATCH.MAX_X, minZ: HATCH.HINGE_Z + HATCH.LENGTH, maxZ: D.REAR },
  ];
  const ROOF_RECT = { minX: -W, maxX: W, minZ: D.FRONT, maxZ: D.REAR };
  const FOOTPRINT = { minX: -(bp.wings ? bp.wings.span : W), maxX: bp.wings ? bp.wings.span : W, minZ: D.NOSE, maxZ: D.REAR + 1.2 };

  const GROUND_SAMPLES = [
    ...LEGS.map((l) => [l.x, l.z]),
    [0, 0], [-W, D.FRONT], [W, D.FRONT], [-W, D.REAR], [W, D.REAR],
    [0, D.NOSE], [0, D.REAR + 1.2], [-W, 0], [W, 0],
  ];
  const RAMP_FOOT_SAMPLE = [0, HATCH.HINGE_Z + HATCH.LENGTH * 0.8];

  // ---- Estado variable ----
  function rampOpenAngle(rampFootY = 0) {
    const drop = Math.min(HATCH.LENGTH, Math.max(0.3, D.FLOOR - rampFootY));
    return Math.asin(drop / HATCH.LENGTH);
  }
  function rampEnd(ship) {
    const a = (ship.hatch ?? 0) * (ship.rampAngle ?? rampOpenAngle(0));
    return { z: HATCH.HINGE_Z + HATCH.LENGTH * Math.cos(a), y: D.FLOOR - HATCH.LENGTH * Math.sin(a), angle: a };
  }
  function legBottoms(ship) {
    const r = ship.legs ?? 1;
    return LEGS.map((_, i) => {
      const deployed = ship.legFeet?.[i] ?? 0;
      return LEG_RETRACTED_BOTTOM + (deployed - LEG_RETRACTED_BOTTOM) * r;
    });
  }
  const doorValue = (ship, id) => ship.doors?.[id] ?? (id === DOORS[0]?.id ? ship.door ?? 0 : 0);
  function localColliders(ship) {
    const list = STATIC.slice();
    for (const d of DOORS) if (doorValue(ship, d.id) < 0.85) list.push(d.leaf);
    const bottoms = legBottoms(ship);
    LEGS.forEach((l, i) => list.push(box(l.x - LEG_HALF, l.x + LEG_HALF, bottoms[i], D.BOTTOM, l.z - LEG_HALF, l.z + LEG_HALF)));
    return list;
  }
  function localSurfaces(ship, lx, lz) {
    const out = [];
    const inside = (r) => lx >= r.minX && lx <= r.maxX && lz >= r.minZ && lz <= r.maxZ;
    for (const r of FLOOR_RECTS) if (inside(r)) out.push({ top: D.FLOOR, bottom: D.BOTTOM });
    if (inside(ROOF_RECT)) out.push({ top: D.ROOF, bottom: D.CEILING });
    if (lx >= HATCH.MIN_X && lx <= HATCH.MAX_X) {
      const end = rampEnd(ship);
      if (lz >= HATCH.HINGE_Z && lz <= end.z + 1e-6) {
        const top = D.FLOOR - (lz - HATCH.HINGE_Z) * Math.tan(end.angle);
        out.push({ top, bottom: top - HATCH.THICKNESS });
      }
    }
    return out;
  }

  // ---- Consultas en coordenadas del mundo ----
  function surfaceAt(ship, x, z, maxY) {
    const [lx, lz] = toLocal(ship, x, z);
    let best = null;
    for (const s of localSurfaces(ship, lx, lz)) {
      const top = ship.y + s.top;
      if (top <= maxY && (best === null || top > best)) best = top;
    }
    return best;
  }
  function blocksAt(ship, x, z, r, y0, y1) {
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const [lx, lz] = toLocal(ship, x + dx, z + dz);
      for (const s of localSurfaces(ship, lx, lz)) if (ship.y + s.top > y0 && ship.y + s.bottom < y1) return true;
    }
    return false;
  }
  function ceilingAt(ship, x, z, y) {
    const [lx, lz] = toLocal(ship, x, z);
    let c = Infinity;
    for (const s of localSurfaces(ship, lx, lz)) {
      const b = ship.y + s.bottom;
      if (b >= y && b < c) c = b;
    }
    return c;
  }
  function resolveCollisions(ship, pos, r, y0 = -Infinity, y1 = Infinity) {
    const [lx, lz] = toLocal(ship, pos.x, pos.z);
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
  function isInside(ship, x, y, z) {
    const [lx, lz] = toLocal(ship, x, z);
    const ly = y - ship.y;
    return lx > -I && lx < I && lz > D.FRONT && lz < D.REAR && ly > D.FLOOR - 0.6 && ly < D.CEILING;
  }
  /** Sala (del plano) en la que está un punto, o null. */
  function roomAt(ship, x, y, z) {
    if (!isInside(ship, x, y, z)) return null;
    const [, lz] = toLocal(ship, x, z);
    return bp.rooms.find((r) => lz >= r.z0 && lz < r.z1) ?? null;
  }
  function overlapsFootprint(ship, box2, margin = 0) {
    const pts = [
      [box2.minX, box2.minZ], [box2.maxX, box2.minZ], [box2.minX, box2.maxZ], [box2.maxX, box2.maxZ],
      [(box2.minX + box2.maxX) / 2, (box2.minZ + box2.maxZ) / 2],
    ];
    const W2 = D.HALF_WIDTH; // las alas quedan por encima: solo cuenta el casco
    return pts.some(([x, z]) => {
      const [lx, lz] = toLocal(ship, x, z);
      return lx >= -W2 - margin && lx <= W2 + margin && lz >= FOOTPRINT.minZ - margin && lz <= FOOTPRINT.maxZ + margin;
    });
  }

  return {
    blueprint: bp,
    DIM: D,
    HATCH,
    LEGS,
    LEG_HALF,
    LEG_RETRACTED_BOTTOM,
    SLOTS,
    SEAT,
    DOORS,
    EXT_BUTTON: bp.extButton,
    INNER_BUTTON: bp.innerButton,
    DOOR_AIM: DOORS[0]?.aim ?? [0, 3.6, 0],
    WATCH_AIM: bp.watch,
    FOOTPRINT,
    GROUND_SAMPLES,
    RAMP_FOOT_SAMPLE,
    RESPAWN: bp.respawn,
    toWorld,
    toLocal,
    dirToWorld,
    rampOpenAngle,
    rampEnd,
    legBottoms,
    localColliders,
    localSurfaces,
    surfaceAt,
    blocksAt,
    ceilingAt,
    resolveCollisions,
    isInside,
    roomAt,
    overlapsFootprint,
  };
}

// ---- Compatibilidad: la nave pequeña como exportaciones del módulo ----------------------
const S = createShipLayout(SMALL);
export const DIM = S.DIM;
export const HATCH = S.HATCH;
export const LEGS = S.LEGS;
export const LEG_HALF = S.LEG_HALF;
export const LEG_RETRACTED_BOTTOM = S.LEG_RETRACTED_BOTTOM;
export const SLOTS = S.SLOTS;
export const SEAT = S.SEAT;
export const EXT_BUTTON = S.EXT_BUTTON;
export const INNER_BUTTON = S.INNER_BUTTON;
export const DOOR_AIM = S.DOOR_AIM;
export const WATCH_AIM = S.WATCH_AIM;
export const FOOTPRINT = S.FOOTPRINT;
export const GROUND_SAMPLES = S.GROUND_SAMPLES;
export const RAMP_FOOT_SAMPLE = S.RAMP_FOOT_SAMPLE;
export const rampOpenAngle = S.rampOpenAngle;
export const rampEnd = S.rampEnd;
export const legBottoms = S.legBottoms;
export const localColliders = S.localColliders;
export const localSurfaces = S.localSurfaces;
export const surfaceAt = S.surfaceAt;
export const blocksAt = S.blocksAt;
export const ceilingAt = S.ceilingAt;
export const resolveCollisions = S.resolveCollisions;
export const isInside = S.isInside;
export const overlapsFootprint = S.overlapsFootprint;
