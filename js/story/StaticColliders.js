/**
 * StaticColliders — obstáculos y suelos de los edificios de la historia (torre del
 * ermitaño, muros de la arena del nodo, centro de investigación…), con la misma
 * interfaz que las construcciones (surfaceAt, blocksAt, ceilingAt, resolveCollisions,
 * raycastDistance), así el jugador, la cámara y los enemigos los tratan igual.
 *
 * Primitivas (todas en coordenadas del mundo):
 *   box  { cx, cz, hx, hz, yaw, y0, y1, walk?, wall?, roof? }  caja girada
 *   cyl  { x, z, r, y0, y1, walk?, wall?, roof? }              cilindro macizo
 *   walk: su cara de arriba es suelo (escalones, rellanos, suelos).
 *   wall: empuja al jugador (paredes, barandillas, el fuste de la torre).
 *   roof: su cara de abajo es techo.
 * `enabled` (o una función) permite activar/desactivar grupos (muros que suben).
 */
export class StaticColliders {
  constructor() {
    this.groups = [];
  }

  /** Añade un grupo de primitivas; devuelve el grupo (con `enabled`). */
  add(id, prims, { enabled = true } = {}) {
    const g = { id, prims: prims.map(prep), enabled, bounds: bounds(prims) };
    this.groups = this.groups.filter((o) => o.id !== id);
    this.groups.push(g);
    return g;
  }

  remove(id) {
    this.groups = this.groups.filter((g) => g.id !== id);
  }

  get(id) {
    return this.groups.find((g) => g.id === id) ?? null;
  }

  *_near(x, z, pad) {
    for (const g of this.groups) {
      const on = typeof g.enabled === 'function' ? g.enabled() : g.enabled;
      if (!on) continue;
      const b = g.bounds;
      if (x < b.minX - pad || x > b.maxX + pad || z < b.minZ - pad || z > b.maxZ + pad) continue;
      for (const p of g.prims) yield p;
    }
  }

  surfaceAt(x, z, maxY) {
    let best = null;
    for (const p of this._near(x, z, 0.1)) {
      if (!p.walk || p.y1 > maxY + 1e-3) continue;
      if (dist(p, x, z) > 0) continue;
      if (best === null || p.y1 > best) best = p.y1;
    }
    return best;
  }

  blocksAt(x, z, r, y0, y1) {
    for (const p of this._near(x, z, r + 0.1)) {
      if (p.y1 <= y0 || p.y0 >= y1) continue;
      if (dist(p, x, z) < r) return true;
    }
    return false;
  }

  ceilingAt(x, z, y) {
    let best = Infinity;
    for (const p of this._near(x, z, 0.1)) {
      if (!p.roof || p.y0 < y) continue;
      if (dist(p, x, z) > 0) continue;
      best = Math.min(best, p.y0);
    }
    return best;
  }

  resolveCollisions(pos, r, y0 = -Infinity, y1 = Infinity) {
    let hit = false;
    for (let pass = 0; pass < 2; pass++) {
      for (const p of this._near(pos.x, pos.z, r + 0.1)) {
        if (!p.wall || p.y1 <= y0 || p.y0 >= y1) continue;
        const push = pushOut(p, pos.x, pos.z, r);
        if (!push) continue;
        pos.x = push.x;
        pos.z = push.z;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Distancia a lo largo de un rayo hasta la primera pared (para la cámara).
   * `only`: lista de grupos a mirar (por defecto, todos).
   */
  raycastDistance(o, d, max, only = null) {
    let best = null;
    const steps = Math.ceil(max / 0.25);
    for (const g of this.groups) {
      if (only && !only.includes(g.id)) continue;
      const on = typeof g.enabled === 'function' ? g.enabled() : g.enabled;
      if (!on) continue;
      const b = g.bounds;
      const ex = o.x + d.x * max;
      const ez = o.z + d.z * max;
      if (Math.max(o.x, ex) < b.minX || Math.min(o.x, ex) > b.maxX || Math.max(o.z, ez) < b.minZ || Math.min(o.z, ez) > b.maxZ) continue;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * max;
        if (best !== null && t >= best) break;
        const x = o.x + d.x * t;
        const y = o.y + d.y * t;
        const z = o.z + d.z * t;
        if (g.prims.some((p) => (p.wall || p.roof || p.walk) && y > p.y0 && y < p.y1 && dist(p, x, z) <= 0)) {
          best = t;
          break;
        }
      }
    }
    return best;
  }

  /** Sombra/refugio: no se usa (los edificios no cuentan como refugio). */
  getShelterAt() {
    return null;
  }
}

function prep(p) {
  if (p.r !== undefined) return { ...p, kind: 'cyl' };
  const yaw = p.yaw ?? 0;
  return { ...p, kind: 'box', c: Math.cos(yaw), s: Math.sin(yaw) };
}

function bounds(prims) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of prims) {
    const x = p.x ?? p.cx;
    const z = p.z ?? p.cz;
    const e = p.r ?? Math.hypot(p.hx, p.hz);
    b.minX = Math.min(b.minX, x - e);
    b.maxX = Math.max(b.maxX, x + e);
    b.minZ = Math.min(b.minZ, z - e);
    b.maxZ = Math.max(b.maxZ, z + e);
  }
  return b;
}

/** Distancia horizontal de (x, z) a la primitiva (0 o negativa: dentro). */
function dist(p, x, z) {
  if (p.kind === 'cyl') return Math.hypot(x - p.x, z - p.z) - p.r;
  const dx = x - p.cx;
  const dz = z - p.cz;
  const lx = dx * p.c - dz * p.s;
  const lz = dx * p.s + dz * p.c;
  const ox = Math.abs(lx) - p.hx;
  const oz = Math.abs(lz) - p.hz;
  if (ox <= 0 && oz <= 0) return Math.max(ox, oz);
  return Math.hypot(Math.max(ox, 0), Math.max(oz, 0));
}

/** Empuja un círculo fuera de la primitiva; null si no se tocan. */
function pushOut(p, x, z, r) {
  if (p.kind === 'cyl') {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.r + r;
    if (d >= min) return null;
    if (d < 1e-6) return { x: p.x + min, z: p.z };
    return { x: p.x + (dx / d) * min, z: p.z + (dz / d) * min };
  }
  const dx = x - p.cx;
  const dz = z - p.cz;
  let lx = dx * p.c - dz * p.s;
  let lz = dx * p.s + dz * p.c;
  const qx = Math.max(-p.hx, Math.min(p.hx, lx));
  const qz = Math.max(-p.hz, Math.min(p.hz, lz));
  let ex = lx - qx;
  let ez = lz - qz;
  const d = Math.hypot(ex, ez);
  if (d >= r) return null;
  if (d > 1e-6) {
    lx = qx + (ex / d) * r;
    lz = qz + (ez / d) * r;
  } else {
    // Dentro: sale por la cara más cercana.
    const fx = p.hx - Math.abs(lx);
    const fz = p.hz - Math.abs(lz);
    if (fx < fz) lx = Math.sign(lx || 1) * (p.hx + r);
    else lz = Math.sign(lz || 1) * (p.hz + r);
  }
  // Volver a coordenadas del mundo (giro inverso).
  return { x: p.cx + lx * p.c + lz * p.s, z: p.cz - lx * p.s + lz * p.c };
}
