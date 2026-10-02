/**
 * BuildRules — reglas geométricas de las piezas de construcción. Sin Three.js:
 * testeable en Node y compartido por ConstructionSystem, el controlador del
 * jugador y los animales.
 *
 * Coordenadas LOCALES de cada pieza: base en y = 0, largo a lo largo de X,
 * "adelante" (lado del jugador al colocar) hacia +Z. Una pieza colocada es
 *   { id, type, x, y, z, rotation, open? }
 * con rotation en múltiplos de 90° (convención de Three.js: rotación en Y).
 *
 * Tipos de hueco (slot):
 *   CELL    ocupa una casilla de la rejilla (suelo, cimiento, escalera, tejado)
 *   EDGE    borde entre casillas (pared, puerta, ventana, valla)
 *   CORNER  esquina de la rejilla (pilar)
 *   FREE    posición libre cada 0,25 m (cama y futuros muebles)
 *
 * Cada forma declara:
 *   half        semiejes [x, z] de la huella
 *   top         altura de la cara superior (donde se apoya lo siguiente)
 *   colliders   cajas locales {x0,x1,z0,z1,y0,y1} que bloquean el paso
 *   surfaces    superficies caminables: flat {y, bottom} o ramp {rise, y0, bottom}
 *   groundTolerance  hueco máximo con el terreno para considerarse apoyada
 */
const H = 2.4; // altura de pared (un piso)

export const SHAPES = {
  FOUNDATION: {
    slot: 'CELL', half: [1, 1], top: 0.2, bottom: -1.5, groundTolerance: 1.6,
    colliders: [], surfaces: [{ kind: 'flat', y: 0.2, bottom: -1.5 }],
  },
  FLOOR: {
    slot: 'CELL', half: [1, 1], top: 0.2, bottom: 0,
    colliders: [], surfaces: [{ kind: 'flat', y: 0.2, bottom: 0 }],
  },
  WALL: {
    slot: 'EDGE', half: [1, 0.1], top: H,
    colliders: [{ x0: -1, x1: 1, z0: -0.1, z1: 0.1, y0: 0, y1: H }], surfaces: [],
  },
  DOOR: {
    slot: 'EDGE', half: [1, 0.1], top: H, interact: 'DOOR',
    colliders: [
      { x0: -1, x1: -0.5, z0: -0.1, z1: 0.1, y0: 0, y1: H },
      { x0: 0.5, x1: 1, z0: -0.1, z1: 0.1, y0: 0, y1: H },
      { x0: -0.5, x1: 0.5, z0: -0.1, z1: 0.1, y0: 2.0, y1: H },
    ],
    // Hoja de la puerta: solo bloquea cerrada.
    leafCollider: { x0: -0.5, x1: 0.5, z0: -0.06, z1: 0.06, y0: 0, y1: 2.0 },
    surfaces: [],
  },
  WINDOW: {
    slot: 'EDGE', half: [1, 0.1], top: H,
    colliders: [{ x0: -1, x1: 1, z0: -0.1, z1: 0.1, y0: 0, y1: H }], surfaces: [],
  },
  FENCE: {
    slot: 'EDGE', half: [1, 0.06], top: 1.1,
    colliders: [{ x0: -1, x1: 1, z0: -0.06, z1: 0.06, y0: 0, y1: 1.1 }], surfaces: [],
  },
  PILLAR: {
    slot: 'CORNER', half: [0.15, 0.15], top: H,
    colliders: [{ x0: -0.15, x1: 0.15, z0: -0.15, z1: 0.15, y0: 0, y1: H }], surfaces: [],
  },
  STAIRS: {
    // Sube hacia -Z local (alejándose del jugador que la coloca) hasta el piso siguiente.
    slot: 'CELL', half: [1, 1], top: H + 0.2,
    colliders: [], surfaces: [{ kind: 'ramp', rise: H + 0.2, y0: 0, bottom: 0 }],
  },
  ROOF: {
    slot: 'CELL', half: [1, 1], top: 1.35,
    colliders: [], surfaces: [{ kind: 'ramp', rise: 1.2, y0: 0.15, bottom: 0 }],
  },
  BED: {
    slot: 'FREE', half: [0.5, 1], top: 0.6, interact: 'SLEEP',
    colliders: [{ x0: -0.5, x1: 0.5, z0: -1, z1: 1, y0: 0, y1: 0.6 }], surfaces: [],
  },
  // Mesa de refinería: estación de fabricación (E abre sus recetas).
  REFINERY: {
    slot: 'FREE', half: [0.9, 0.5], top: 1.0, interact: 'CRAFT', station: 'REFINERY',
    colliders: [{ x0: -0.9, x1: 0.9, z0: -0.5, z1: 0.5, y0: 0, y1: 1.0 }], surfaces: [],
  },
  // Horno y mesa de elaboración: más estaciones de fabricación.
  FURNACE: {
    slot: 'FREE', half: [0.7, 0.7], top: 1.7, interact: 'CRAFT', station: 'FURNACE',
    colliders: [{ x0: -0.7, x1: 0.7, z0: -0.7, z1: 0.7, y0: 0, y1: 1.7 }], surfaces: [],
  },
  WORKBENCH: {
    slot: 'FREE', half: [0.95, 0.55], top: 1.0, interact: 'CRAFT', station: 'WORKBENCH',
    colliders: [{ x0: -0.95, x1: 0.95, z0: -0.55, z1: 0.55, y0: 0, y1: 1.0 }], surfaces: [],
  },
  // Cofre: guarda objetos (E para abrirlo).
  CHEST: {
    slot: 'FREE', half: [0.5, 0.35], top: 0.7, interact: 'STORAGE',
    colliders: [{ x0: -0.5, x1: 0.5, z0: -0.35, z1: 0.35, y0: 0, y1: 0.7 }], surfaces: [{ kind: 'flat', y: 0.7, bottom: 0 }],
  },
  // Antorcha clavada en el suelo: ilumina (no estorba el paso).
  TORCH: {
    slot: 'FREE', half: [0.12, 0.12], top: 1.1,
    colliders: [], surfaces: [],
  },
  // Lunas: estación de carga (baterías plank) y de oxígeno (traje). StationSystem las hace funcionar.
  CHARGING_STATION: {
    slot: 'FREE', half: [0.5, 0.4], top: 1.3, interact: 'STATION',
    colliders: [{ x0: -0.5, x1: 0.5, z0: -0.4, z1: 0.4, y0: 0, y1: 1.3 }], surfaces: [],
  },
  OXYGEN_STATION: {
    slot: 'FREE', half: [0.5, 0.5], top: 1.7, interact: 'STATION',
    colliders: [{ x0: -0.5, x1: 0.5, z0: -0.5, z1: 0.5, y0: 0, y1: 1.7 }], surfaces: [],
  },
};

const HALF_PI = Math.PI / 2;
const snapQuarter = (a) => Math.round(a / HALF_PI) * HALF_PI;

// ---- Transformaciones -----------------------------------------------------------

export function toWorld(piece, lx, lz) {
  const c = Math.cos(piece.rotation);
  const s = Math.sin(piece.rotation);
  return [piece.x + lx * c + lz * s, piece.z - lx * s + lz * c];
}

export function toLocal(piece, wx, wz) {
  const c = Math.cos(piece.rotation);
  const s = Math.sin(piece.rotation);
  const dx = wx - piece.x;
  const dz = wz - piece.z;
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Caja local → caja de mundo alineada con los ejes (rotaciones de 90°). */
export function boxToWorld(piece, b) {
  const pts = [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]].map(([x, z]) => toWorld(piece, x, z));
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
    minY: piece.y + b.y0, maxY: piece.y + b.y1,
  };
}

/** Cajas de colisión en coordenadas de mundo (la hoja de la puerta solo si está cerrada). */
export function worldColliders(piece) {
  const shape = SHAPES[piece.type];
  const boxes = shape.colliders.map((b) => boxToWorld(piece, b));
  if (shape.leafCollider && !piece.open) boxes.push(boxToWorld(piece, shape.leafCollider));
  return boxes;
}

/** Huella de la pieza en el mundo (para solapes y recursos). */
export function footprint(piece) {
  const [hx, hz] = SHAPES[piece.type].half;
  return boxToWorld(piece, { x0: -hx, x1: hx, z0: -hz, z1: hz, y0: 0, y1: SHAPES[piece.type].top });
}

/** Puntos de la huella donde se mide el terreno. */
export function footprintSamples(piece) {
  const [hx, hz] = SHAPES[piece.type].half;
  return [[0, 0], [-hx, -hz], [hx, -hz], [-hx, hz], [hx, hz]].map(([x, z]) => toWorld(piece, x, z));
}

// ---- Superficies caminables ----------------------------------------------------------

/**
 * Altura de la superficie de la pieza en (x, z), o null si no hay.
 * @returns {{ top: number, bottom: number } | null}
 */
export function surfaceAt(piece, x, z) {
  const shape = SHAPES[piece.type];
  if (!shape.surfaces.length) return null;
  const [lx, lz] = toLocal(piece, x, z);
  const [hx, hz] = shape.half;
  if (Math.abs(lx) > hx + 1e-6 || Math.abs(lz) > hz + 1e-6) return null;
  let best = null;
  for (const s of shape.surfaces) {
    let top;
    if (s.kind === 'flat') top = piece.y + s.y;
    else {
      const t = (1 - lz / hz) / 2; // 0 en el lado del jugador (+Z), 1 al fondo (-Z)
      top = piece.y + s.y0 + s.rise * t;
    }
    if (!best || top > best.top) best = { top, bottom: piece.y + s.bottom };
  }
  return best;
}

// ---- Colisiones ---------------------------------------------------------------------

/** Empuja el círculo (pos.x, pos.z, r) fuera de la caja si se solapan. */
export function pushOutOfBox(pos, r, box) {
  const cx = Math.min(Math.max(pos.x, box.minX), box.maxX);
  const cz = Math.min(Math.max(pos.z, box.minZ), box.maxZ);
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
  } else {
    // Centro dentro de la caja: salir por el lado más cercano.
    const exits = [
      [box.minX - r - pos.x, 0], [box.maxX + r - pos.x, 0],
      [0, box.minZ - r - pos.z], [0, box.maxZ + r - pos.z],
    ].sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0];
    pos.x += exits[0];
    pos.z += exits[1];
  }
  return true;
}

export function circleOverlapsBox(x, z, r, box) {
  const cx = Math.min(Math.max(x, box.minX), box.maxX);
  const cz = Math.min(Math.max(z, box.minZ), box.maxZ);
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

export function boxesOverlap(a, b, margin = 0) {
  return a.minX < b.maxX - margin && a.maxX > b.minX + margin &&
    a.minZ < b.maxZ - margin && a.maxZ > b.minZ + margin &&
    a.minY < b.maxY - margin && a.maxY > b.minY + margin;
}

// ---- Anclaje a la rejilla -----------------------------------------------------------

/**
 * Posición horizontal, rotación y hueco de una pieza a partir del punto apuntado.
 * @param {string} type
 * @param {number} x @param {number} z  punto apuntado
 * @param {object} o { grid, yaw (del jugador), rotSteps (pulsaciones de Q) }
 * @returns {{ x, z, rotation, slot: string|null }}
 */
export function snapXZ(type, x, z, { grid, yaw, rotSteps }) {
  const slot = SHAPES[type].slot;
  const facing = snapQuarter(yaw) + rotSteps * HALF_PI;
  if (slot === 'CELL') {
    const gx = Math.floor(x / grid);
    const gz = Math.floor(z / grid);
    return { x: (gx + 0.5) * grid, z: (gz + 0.5) * grid, rotation: facing, slot: `CELL:${gx}:${gz}` };
  }
  if (slot === 'EDGE') {
    const gx = Math.floor(x / grid);
    const gz = Math.floor(z / grid);
    const fx = x / grid - gx;
    const fz = z / grid - gz;
    const flip = (rotSteps % 2) * Math.PI; // Q da la vuelta (lado de apertura de la puerta)
    const d = [fz, 1 - fz, fx, 1 - fx];
    const i = d.indexOf(Math.min(...d));
    if (i < 2) {
      const line = gz + i; // borde paralelo a X en z = line·grid
      return { x: (gx + 0.5) * grid, z: line * grid, rotation: flip, slot: `EDGEX:${gx}:${line}` };
    }
    const line = gx + (i - 2); // borde paralelo a Z en x = line·grid
    return { x: line * grid, z: (gz + 0.5) * grid, rotation: HALF_PI + flip, slot: `EDGEZ:${line}:${gz}` };
  }
  if (slot === 'CORNER') {
    const ix = Math.round(x / grid);
    const iz = Math.round(z / grid);
    return { x: ix * grid, z: iz * grid, rotation: 0, slot: `CORNER:${ix}:${iz}` };
  }
  // Libre cada 0,25 m: permite arrimar muebles a las paredes.
  return { x: Math.round(x * 4) / 4, z: Math.round(z * 4) / 4, rotation: facing, slot: null };
}

/** Clave de hueco con altura: dos piezas no pueden compartirla. */
export function slotKey(slot, y) {
  return slot ? `${slot}:${Math.round(y * 20)}` : null;
}

/** Altura base sobre el terreno según el tipo de hueco. */
export function terrainBaseY(piece, heightAt) {
  const hs = footprintSamples(piece).map(([x, z]) => heightAt(x, z));
  const slot = SHAPES[piece.type].slot;
  // Suelos y muebles por encima del punto más alto; paredes y pilares se hunden en lo alto.
  const y = slot === 'EDGE' || slot === 'CORNER' ? Math.min(...hs) : Math.max(...hs);
  return Math.round(y * 20) / 20;
}

// ---- Apoyo ----------------------------------------------------------------------------

/**
 * ¿Tiene apoyo? Sí si toca el terreno (según groundTolerance), si descansa sobre
 * la cara superior de otra pieza cercana, o si continúa otra pieza al mismo nivel.
 */
export function isSupported(piece, others, heightAt, grid) {
  const shape = SHAPES[piece.type];
  const minTerrain = Math.min(...footprintSamples(piece).map(([x, z]) => heightAt(x, z)));
  if (piece.y - minTerrain <= (shape.groundTolerance ?? 0.7)) return true;
  for (const o of others) {
    const d = Math.hypot(o.x - piece.x, o.z - piece.z);
    if (d > grid * 1.2) continue;
    const oTop = o.y + SHAPES[o.type].top;
    if (Math.abs(oTop - piece.y) < 0.06) return true;           // encima de otra pieza
    if (Math.abs(o.y - piece.y) < 0.06 && d <= grid + 0.05) return true; // continúa al mismo nivel
  }
  return false;
}

// ---- Refugio (Fase 10) -------------------------------------------------------------------

const WALL_TYPES = new Set(['WALL', 'DOOR', 'WINDOW']);
const SHELTER_RAY = 8; // m

/**
 * Protección en (x, y, z), válida para habitaciones de cualquier tamaño:
 *   roofed  hay un suelo/tejado/cimiento por encima de la cabeza (a menos de 6 m)
 *   walls   en cuántas de las 4 direcciones (±X, ±Z) hay una pared, puerta o
 *           ventana a menos de 8 m a la altura del pecho
 *   factor  0..1 (techo 0,5 + 0,125 por pared)
 */
export function shelterAt(pieces, x, y, z, headHeight = 1.8) {
  let roofed = false;
  for (const p of pieces) {
    if (SHAPES[p.type].slot !== 'CELL') continue;
    const s = surfaceAt(p, x, z);
    if (s && s.bottom >= y + headHeight - 0.1 && s.bottom <= y + 6) roofed = true;
  }
  const chest = y + 1.2;
  const boxes = pieces.filter((p) => WALL_TYPES.has(p.type)).flatMap((p) => worldColliders({ ...p, open: false }))
    .filter((b) => b.minY <= chest && b.maxY >= chest);
  let walls = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let t = 0.25; t <= SHELTER_RAY; t += 0.25) {
      const px = x + dx * t;
      const pz = z + dz * t;
      if (boxes.some((b) => px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ)) {
        walls++;
        break;
      }
    }
  }
  return { roofed, walls, factor: Math.min(1, (roofed ? 0.5 : 0) + walls * 0.125) };
}
