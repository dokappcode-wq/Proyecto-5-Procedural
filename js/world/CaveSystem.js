import { SeededRandom, deriveSeed } from '../core/SeededRandom.js';

/**
 * CaveSystem — cuevas del planeta. Sin Three.js: datos, generación y consultas.
 *
 * Cada cueva es un túnel largo que serpentea y baja, con cámaras anchas cada
 * cierto tramo. Se describe con nodos { x, y, z, r, floor }: el centro del túnel,
 * su radio y la altura del suelo (plano: el túnel tiene el suelo aplanado).
 * Entre dos nodos el túnel es un tramo recto (radio y alturas interpolados).
 *
 *   - Subterráneas (UNDERGROUND): un agujero en el suelo de la explanada o el
 *     bosque; una rampa empinada baja hasta un túnel profundo.
 *   - De montaña (MOUNTAIN): la boca se abre en la ladera de una montaña y el
 *     túnel se mete dentro y baja.
 *
 * Contenido (nodos de recurso con altura propia, ver `nodesInChunk`): carbón en
 * la entrada, cobre por todo el túnel, hierro (menos) más adentro, diamante muy
 * raro al fondo y flores luminosas en las cámaras.
 *
 * Consultas (las usan jugador, cámara, terreno, recursos…):
 *   floorAt(x, z, feet)   { floor, ceil } del tramo que contiene ese punto, o null
 *   contains(x, y, z, m)  ¿el punto está dentro del hueco de una cueva?
 *   holeAt(x, y, z)       ¿el terreno en ese punto está "abierto" (boca de la cueva)?
 *   openAt(x, y, z)       igual, ajustado a la sección del túnel (para recortar la malla)
 */
const FLOOR_K = 0.7;  // suelo a 0,7·r bajo el centro
const CEIL_K = 0.85;  // techo a 0,85·r sobre el centro
const WALK_K = 0.7;   // anchura caminable: 0,7·r a cada lado del eje
const MAX_SLOPE = 0.62; // caída máxima del suelo por tramo (fracción de STEP): rampa caminable
const MIN_RADIUS = 1.8;
const MOUTH_WIDEN = [1.6, 1.45, 1.2];

export class CaveSystem {
  constructor({ config }) {
    this._cfg = config;
    this.caves = [];
    this._grid = new Map(); // celda → [{ cave, i }] tramos
    this._cell = 32;
  }

  /**
   * @param {object} p
   * @param {number} p.seed
   * @param {object} p.terrain   { sample(x, z) → { height, biomes, coast }, heightAt(x, z) }
   * @param {object} p.bounds    { minX, maxX, minZ, maxZ }
   * @param {object} p.spawn     { x, z }
   * @param {object[]} [p.avoid] zonas a evitar { x, z, r } (nave, cápsula…)
   * @param {Function} [p.isWater]
   */
  generate({ seed, terrain, bounds, spawn, avoid = [], isWater = () => false }) {
    const C = this._cfg;
    const rng = new SeededRandom(deriveSeed(seed, 'caves'));
    this.caves = [];
    this._grid.clear();
    const mouths = [];
    const farEnough = (x, z) =>
      Math.hypot(x - spawn.x, z - spawn.z) >= C.MIN_SPAWN_DISTANCE &&
      mouths.every((m) => Math.hypot(m.x - x, m.z - z) >= C.MIN_SPACING) &&
      avoid.every((a) => Math.hypot(a.x - x, a.z - z) >= a.r);
    const slopeAt = (x, z) => {
      const d = 2;
      const gx = (terrain.heightAt(x + d, z) - terrain.heightAt(x - d, z)) / (2 * d);
      const gz = (terrain.heightAt(x, z + d) - terrain.heightAt(x, z - d)) / (2 * d);
      return { gx, gz, m: Math.hypot(gx, gz) };
    };
    const inside = (x, z, margin) => x > bounds.minX + margin && x < bounds.maxX - margin && z > bounds.minZ + margin && z < bounds.maxZ - margin;

    for (const kind of ['UNDERGROUND', 'MOUNTAIN']) {
      const want = kind === 'UNDERGROUND' ? C.UNDERGROUND : C.MOUNTAIN;
      let made = 0;
      for (let attempt = 0; attempt < want * 120 && made < want; attempt++) {
        const x = rng.range(bounds.minX + 120, bounds.maxX - 120);
        const z = rng.range(bounds.minZ + 120, bounds.maxZ - 120);
        const s = terrain.sample(x, z);
        if (!farEnough(x, z) || isWater(x, z) || s.coast > 0.01 || s.height < 6) continue;
        const sl = slopeAt(x, z);
        let heading;
        if (kind === 'UNDERGROUND') {
          const lowland = (s.biomes.PLAINS ?? 0) + (s.biomes.FOREST ?? 0) + (s.biomes.MOUNTAINS ?? 0);
          if (lowland < 0.7 || sl.m > 0.25) continue;
          heading = rng.range(0, Math.PI * 2);
        } else {
          const mount = (s.biomes.MOUNTAINS ?? 0) + (s.biomes.FROZEN_MOUNTAINS ?? 0);
          if (mount < 0.6 || sl.m < 0.45 || sl.m > 1.4 || s.height < 12) continue;
          heading = Math.atan2(sl.gz, sl.gx); // cuesta arriba: hacia dentro de la montaña
        }
        const cave = this._carvePath({ kind, x, z, heading, rng: new SeededRandom(deriveSeed(seed, `cave:${kind}:${made}:${attempt}`)), terrain, inside });
        if (!cave) continue;
        cave.id = this.caves.length;
        this.caves.push(cave);
        mouths.push({ x, z });
        made++;
      }
    }
    for (const cave of this.caves) this._index(cave);
    for (const cave of this.caves) cave.content = this._content(cave, new SeededRandom(deriveSeed(seed, `caveContent:${cave.id}`)));
    return this.caves;
  }

  /** Recorrido de una cueva desde la boca. @returns {object|null} */
  _carvePath({ kind, x, z, heading, rng, terrain, inside }) {
    const C = this._cfg;
    const steps = Math.round(rng.range(C.LENGTH[0], C.LENGTH[1]));
    const depth = rng.range(C.DEPTH[0], C.DEPTH[1]);
    const surface0 = terrain.heightAt(x, z);
    const nodes = [];
    let px = x;
    let pz = z;
    let floor = surface0;
    let h = heading;
    const maxStep = C.STEP * MAX_SLOPE;
    const chamberEvery = C.CHAMBER_EVERY;
    const chamberAt = Math.floor(rng.range(3, chamberEvery));
    for (let i = 0; i <= steps; i++) {
      // Radio: pasillos y, cada cierto tramo, una cámara de tres nodos.
      const k = (i - chamberAt) % chamberEvery;
      const inChamber = i > 2 && k >= 0 && k < 3;
      const base = rng.range(C.RADIUS[0], C.RADIUS[1]);
      let r = inChamber ? (k === 1 ? rng.range(C.CHAMBER_RADIUS[0], C.CHAMBER_RADIUS[1]) : base * 1.7) : base;
      if (i < MOUTH_WIDEN.length) r *= MOUTH_WIDEN[i]; // boca más ancha: el agujero se ve de lejos
      if (i > 0) {
        h += rng.range(-C.TURN, C.TURN);
        px += Math.cos(h) * C.STEP;
        pz += Math.sin(h) * C.STEP;
        if (!inside(px, pz, 60)) break;
        const surface = terrain.heightAt(px, pz);
        if (surface < 4) break; // no bajo el mar ni los ríos
        // Suelo: rampa de bajada al principio; después busca la profundidad y ondula.
        const ramp = kind === 'UNDERGROUND' ? C.ENTRANCE_DROP : C.ENTRANCE_DROP * 0.15;
        let target;
        if (i <= C.ENTRANCE_STEPS) target = floor - C.STEP * ramp;
        else target = surface0 - depth + Math.sin(i * 0.7) * 1.5;
        const prev = floor;
        floor += Math.max(-maxStep, Math.min(C.STEP * 0.2, target - floor));
        // Siempre algo de roca encima (salvo en la boca). Sin escalones: si para eso el
        // suelo tendría que caer más que una rampa, el túnel se estrecha; si ni así, la
        // cueva termina ahí.
        if (i > 2) {
          const roof = surface - C.ROCK_ABOVE;
          floor = Math.max(prev - maxStep, Math.min(floor, roof - (FLOOR_K + CEIL_K) * r));
          r = Math.min(r, (roof - floor) / (FLOOR_K + CEIL_K));
          if (r < MIN_RADIUS) {
            if (i > C.ENTRANCE_STEPS) break;
            r = MIN_RADIUS;
          }
        }
        // No cruzarse con otra cueva.
        for (const other of this.caves) {
          for (const n of other.nodes) {
            if (Math.hypot(n.x - px, n.floor - floor, n.z - pz) < n.r + r + 3) return nodes.length >= C.MIN_STEPS ? this._finish(kind, nodes) : null;
          }
        }
      }
      nodes.push({ x: px, z: pz, floor, r, y: floor + FLOOR_K * r, chamber: inChamber && k === 1 && r > C.CHAMBER_RADIUS[0] * 0.8 });
    }
    return nodes.length >= C.MIN_STEPS ? this._finish(kind, nodes) : null;
  }

  _finish(kind, nodes) {
    // Sin escalones: entre dos nodos el suelo no sube ni baja más que una rampa caminable.
    const maxStep = this._cfg.STEP * MAX_SLOPE;
    // Solo se baja suelo (nunca se sube: así no se pierde la roca de encima). La boca
    // (nodo 0) se queda a ras del terreno. Se repite hasta que no cambia nada.
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let i = 0; i < nodes.length - 1; i++) {
        const lim = nodes[i].floor + maxStep;
        if (nodes[i + 1].floor > lim) { nodes[i + 1].floor = lim; changed = true; }
      }
      for (let i = nodes.length - 2; i >= 1; i--) {
        const lim = nodes[i + 1].floor + maxStep;
        if (nodes[i].floor > lim) { nodes[i].floor = lim; changed = true; }
      }
      if (!changed) break;
    }
    for (const n of nodes) n.y = n.floor + FLOOR_K * n.r;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minZ = Math.min(minZ, n.z - n.r);
      maxZ = Math.max(maxZ, n.z + n.r);
    }
    return { kind, nodes, mouth: { x: nodes[0].x, z: nodes[0].z, y: nodes[0].floor }, bbox: { minX, maxX, minZ, maxZ } };
  }

  /** Reparte los tramos en una rejilla para consultar rápido. */
  _index(cave) {
    const cs = this._cell;
    for (let i = 0; i < cave.nodes.length - 1; i++) {
      const a = cave.nodes[i];
      const b = cave.nodes[i + 1];
      const r = Math.max(a.r, b.r) + 1;
      const x0 = Math.floor((Math.min(a.x, b.x) - r) / cs);
      const x1 = Math.floor((Math.max(a.x, b.x) + r) / cs);
      const z0 = Math.floor((Math.min(a.z, b.z) - r) / cs);
      const z1 = Math.floor((Math.max(a.z, b.z) + r) / cs);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gz = z0; gz <= z1; gz++) {
          const key = `${gx},${gz}`;
          if (!this._grid.has(key)) this._grid.set(key, []);
          this._grid.get(key).push({ cave, i });
        }
      }
    }
  }

  /** Tramos cerca de (x, z) con su parámetro y distancia: [{ cave, i, t, d, r, y, floor }] */
  _segmentsAt(x, z) {
    const list = this._grid.get(`${Math.floor(x / this._cell)},${Math.floor(z / this._cell)}`);
    if (!list) return EMPTY;
    const out = [];
    for (const { cave, i } of list) {
      const a = cave.nodes[i];
      const b = cave.nodes[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      const d = Math.hypot(x - cx, z - cz);
      const r = a.r + (b.r - a.r) * t;
      if (d > r * 1.05) continue;
      const floor = a.floor + (b.floor - a.floor) * t;
      out.push({ cave, i, t, d, r, floor, y: floor + FLOOR_K * r });
    }
    return out;
  }

  /**
   * Suelo de cueva bajo los pies en (x, z): el tramo en el que se puede estar a esa
   * altura (caminable y con los pies entre el suelo y el techo).
   * @returns {{ floor: number, ceil: number } | null}
   */
  floorAt(x, z, feet, step = 0.6) {
    let best = null;
    for (const s of this._segmentsAt(x, z)) {
      if (s.d > s.r * WALK_K) continue;
      const ceil = s.y + CEIL_K * s.r;
      if (feet < s.floor - 1.5 || feet > ceil - 0.4) continue;
      if (s.floor > feet + step) continue;
      if (!best || s.floor > best.floor) best = { floor: s.floor, ceil, r: s.r, cave: s.cave };
    }
    return best;
  }

  /** ¿(x, y, z) está dentro del hueco de alguna cueva (con un margen hacia dentro)? */
  contains(x, y, z, margin = 0) {
    // Sección del túnel: elipse (con el radio pequeño del relieve de las paredes) y
    // el suelo aplanado. Una caja se saldría por las esquinas de arriba.
    for (const s of this._segmentsAt(x, z)) {
      if (y < s.floor - 0.1) continue;
      const hx = s.d / Math.max(0.1, s.r * 0.84 - margin);
      const hy = Math.max(0, y - s.y) / Math.max(0.1, s.r * 0.84 * CEIL_K - margin);
      if (hx * hx + hy * hy <= 1) return true;
    }
    return false;
  }

  /** ¿El terreno en (x, y=altura del terreno, z) queda abierto por la boca de una cueva? */
  holeAt(x, y, z) {
    for (const s of this._segmentsAt(x, z)) {
      if (s.i > 4 || (s.i === 0 && s.t <= 0) || s.d > s.r * 0.98) continue;
      if (y > s.floor - 0.4 && y < s.y + CEIL_K * s.r + 0.3) return true;
    }
    return false;
  }

  /**
   * Como holeAt, pero ajustado a la sección real del túnel (elipse, con el radio más
   * pequeño del relieve de las paredes): para recortar el terreno sin que por el
   * borde del agujero se vea el vacío.
   */
  openAt(x, y, z) {
    for (const s of this._segmentsAt(x, z)) {
      if (s.i > 4 || (s.i === 0 && s.t <= 0)) continue; // detrás de la boca no hay túnel
      const dy = y - s.y;
      if (dy < -FLOOR_K * s.r) continue;
      const hx = s.d / (s.r * 0.78);
      const hy = Math.max(0, dy) / (s.r * 0.78 * CEIL_K);
      if (hx * hx + hy * hy < 1) return true;
    }
    return false;
  }

  /** ¿(x, z) está junto a la boca de una cueva (a menos de `pad` m del túnel)? Ahí no crecen árboles ni rocas. */
  nearMouth(x, z, pad = 4) {
    for (const c of this.caves) {
      for (let i = 0; i < Math.min(4, c.nodes.length); i++) {
        const n = c.nodes[i];
        if (Math.hypot(n.x - x, n.z - z) < n.r + pad) return true;
      }
    }
    return false;
  }

  /** ¿Hay alguna cueva cuya boca esté cerca de (x, z)? (para trocear el terreno solo donde hace falta) */
  mouthNear(x0, z0, x1, z1) {
    return this.caves.some((c) => {
      const m = c.nodes.slice(0, 6);
      return m.some((n) => n.x + n.r > x0 && n.x - n.r < x1 && n.z + n.r > z0 && n.z - n.r < z1);
    });
  }

  // ---- Contenido -------------------------------------------------------------------

  /**
   * Menas, carbón, diamante y flores luminosas de una cueva: [{ type, x, y, z }].
   * En la pared (a un lado del eje) y sobre el suelo.
   */
  _content(cave, rng) {
    const C = this._cfg.CONTENT;
    const out = [];
    const n = cave.nodes.length;
    const along = (i, side, f = 0.55) => {
      const a = cave.nodes[i];
      const b = cave.nodes[Math.min(n - 1, i + 1)];
      const hx = b.x - a.x;
      const hz = b.z - a.z;
      const len = Math.hypot(hx, hz) || 1;
      const t = rng.next();
      const r = a.r + (b.r - a.r) * t;
      const off = side * r * f;
      const x = a.x + hx * t - (hz / len) * off;
      const z = a.z + hz * t + (hx / len) * off;
      return { x, z, y: a.floor + (b.floor - a.floor) * t };
    };
    // Carbón: en la boca (fuera y dentro de la entrada).
    const coal = Math.round(rng.range(C.COAL[0], C.COAL[1]));
    for (let k = 0; k < coal; k++) out.push({ type: 'COAL_ORE', ...along(Math.min(n - 2, Math.floor(rng.range(0, 4))), rng.next() < 0.5 ? -1 : 1) });
    for (let i = 2; i < n - 1; i++) {
      const deep = i / n;
      const side = () => (rng.next() < 0.5 ? -1 : 1);
      if (rng.next() < C.COPPER_PER_NODE) out.push({ type: 'COPPER_ORE', ...along(i, side()) });
      if (deep > 0.3 && rng.next() < C.IRON_PER_NODE) out.push({ type: 'IRON_ORE', ...along(i, side()) });
      if (deep > 0.6 && rng.next() < C.DIAMOND_PER_NODE) out.push({ type: 'DIAMOND_ORE', ...along(i, side(), 0.5) });
      if (cave.nodes[i].chamber) {
        const flowers = Math.round(rng.range(C.GLOW_FLOWERS[0], C.GLOW_FLOWERS[1]));
        for (let k = 0; k < flowers; k++) out.push({ type: 'GLOW_FLOWER', ...along(i, side(), rng.range(0.1, 0.6)) });
      }
    }
    return out;
  }

  /** Contenido de las cuevas que cae en el chunk (cx, cz) del mundo. */
  nodesInChunk(cx, cz, chunkSize, half) {
    const x0 = -half + cx * chunkSize;
    const z0 = -half + cz * chunkSize;
    const out = [];
    for (const cave of this.caves) {
      const b = cave.bbox;
      if (b.maxX < x0 || b.minX > x0 + chunkSize || b.maxZ < z0 || b.minZ > z0 + chunkSize) continue;
      cave.content.forEach((c, k) => {
        if (c.x >= x0 && c.x < x0 + chunkSize && c.z >= z0 && c.z < z0 + chunkSize) out.push({ ...c, key: `${cave.id}.${k}` });
      });
    }
    return out;
  }
}

const EMPTY = [];
