import * as THREE from 'three';
import { PartsBuilder } from '../../render/PartsBuilder.js';
import { SeededRandom, hashString } from '../../core/SeededRandom.js';

/**
 * Landmarks — los lugares con nombre de un mapa diseñado (meta.pois), construidos sobre
 * el terreno: El Abuelo (árbol gigante), ruinas, faro, arco de roca, puente natural,
 * cantera, mirador, troncos quemados del choque, vapor de las termas y bruma de las
 * cascadas. Registra sus colisiones (StaticColliders) y anima el vapor y la bruma.
 */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 9),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 7),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
};
const STONE = [0xa29c90, 0x948e83, 0xb2ab9e, 0x8a857b];
const ROCK = [0x8a8378, 0x7b756b, 0x968f83];

export class Landmarks {
  constructor({ map, heightAt, colliders, root, isEnabled = () => true }) {
    this.name = 'landmarks';
    this._map = map;
    this._h = heightAt;
    this._col = colliders;
    this.group = new THREE.Group();
    this.group.name = 'Landmarks';
    root.add(this.group);
    this._enabled = isEnabled;
    this._puffs = [];
    this.hotSprings = [];
    this.waterfalls = [];
    this._solid = new PartsBuilder();
    this._t = 0;
    const meta = map.meta;
    for (const p of meta.pois ?? []) {
      const fn = BUILDERS[p.kind];
      if (fn) fn(this, p, new SeededRandom(hashString(`poi:${p.id}`)));
    }
    this._scarLogs(meta.scar ?? []);
    // Las pozas de las termas: vapor y calor.
    for (const l of meta.lakes ?? []) {
      if (!l.hot) continue;
      const c = centroid(l.points);
      this.hotSprings.push({ x: c.x, z: c.z, y: l.level, r: 9 });
      this._steam(c.x, l.level, c.z, 6, 0xffffff, 0.22);
    }
    const geo = this._solid.toGeometry();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** ¿Cerca de una poza caliente? (calienta como un refugio) */
  isWarmAt(x, y, z) {
    return this.hotSprings.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 6 && Math.abs(y - s.y) < 6);
  }

  update(dt) {
    if (!this._enabled()) return;
    this._t += dt;
    for (const p of this._puffs) {
      p.k = (p.k + dt * p.speed) % 1;
      const k = p.k;
      p.mesh.position.set(p.x + Math.sin(this._t * 0.3 + p.ph) * 0.6 * k, p.y + k * p.rise, p.z + Math.cos(this._t * 0.25 + p.ph) * 0.6 * k);
      p.mesh.scale.setScalar(p.size * (0.5 + k * 1.4));
      p.mesh.material.opacity = p.alpha * Math.sin(k * Math.PI);
    }
  }

  // ---- Utilidades ---------------------------------------------------------------

  _ground(x, z) {
    return this._h(x, z);
  }

  _add(geo, o) {
    this._solid.add(geo, o);
  }

  _steam(x, y, z, n, color, alpha, rise = 4.5, spread = 4) {
    const rng = new SeededRandom(hashString(`steam:${x},${z}`));
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, fog: true });
      const mesh = new THREE.Mesh(G.ico, mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this._puffs.push({
        mesh, x: x + (rng.next() - 0.5) * spread, y: y + 0.2, z: z + (rng.next() - 0.5) * spread,
        k: rng.next(), speed: 0.08 + rng.next() * 0.06, rise, size: 1.2 + rng.next() * 1.5, alpha, ph: rng.next() * 6,
      });
    }
  }

  _scarLogs(scar) {
    if (scar.length < 2) return;
    const rng = new SeededRandom(hashString('scarLogs'));
    for (let i = 0; i < scar.length - 1; i++) {
      const a = scar[i];
      const b = scar[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      for (let s = 8; s < len; s += 11 + rng.next() * 8) {
        const side = rng.next() < 0.5 ? -1 : 1;
        const off = (a.w + 2 + rng.next() * 3) * side;
        const x = a.x + dx * s - dz * off;
        const z = a.z + dz * s + dx * off;
        const y = this._ground(x, z);
        // Tronco tumbado (quemado), en la dirección del choque, y su tocón.
        const lenLog = 3 + rng.next() * 4;
        const ang = Math.atan2(dx, dz) + (rng.next() - 0.5) * 0.8;
        this._add(G.cyl6, { position: [x, y + 0.3, z], rotation: [Math.PI / 2, 0, -ang], scale: [0.5, lenLog, 0.5], color: rng.next() < 0.5 ? 0x2d2621 : 0x3d3128 });
        this._add(G.cyl6, { position: [x - Math.sin(ang) * lenLog * 0.55, y + 0.35, z - Math.cos(ang) * lenLog * 0.55], scale: [0.6, 0.7, 0.6], color: 0x2a231e });
      }
    }
  }
}

function centroid(points) {
  let x = 0;
  let z = 0;
  for (const p of points) {
    x += p.x;
    z += p.z;
  }
  return { x: x / points.length, z: z / points.length };
}

const pick = (arr, rng) => arr[Math.floor(rng.next() * arr.length)];

// ---- Cada tipo de lugar ------------------------------------------------------------

const BUILDERS = {
  /** El Abuelo: un árbol enorme, con raíces que asoman y una copa en capas. */
  bigTree(L, p, rng) {
    const y = L._ground(p.x, p.z);
    const H = 15;
    L._add(G.cyl, { position: [p.x, y + H / 2, p.z], scale: [4.4, H, 4.4], color: 0x5e4630, jitter: (i, v) => { v.x *= 1 - (v.y + 0.5) * 0.35; v.z *= 1 - (v.y + 0.5) * 0.35; } });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng.next() * 0.3;
      const r = 3 + rng.next() * 2;
      L._add(G.cone, { position: [p.x + Math.cos(a) * r * 0.6, y + 0.6, p.z + Math.sin(a) * r * 0.6], rotation: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25], scale: [1.2, r * 1.3, 1.2], color: 0x544029 });
    }
    // Ramas gruesas y copa.
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.4;
      L._add(G.cyl6, { position: [p.x + Math.cos(a) * 3.5, y + H - 1.5, p.z + Math.sin(a) * 3.5], rotation: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], scale: [1, 8, 1], color: 0x5a432d });
    }
    const greens = [0x2f6a2c, 0x3a7a32, 0x28592a, 0x447f38];
    for (let k = 0; k < 16; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.next() * 9;
      const s = 6 + rng.next() * 6;
      L._add(G.ico, { position: [p.x + Math.cos(a) * r, y + H + 2 + rng.next() * 7 - r * 0.25, p.z + Math.sin(a) * r], scale: [s, s * 0.7, s], color: pick(greens, rng) });
    }
    L._col.add(`poi:${p.id}`, [{ x: p.x, z: p.z, r: 2.4, y0: y - 1, y1: y + H, wall: true }]);
  },

  /** Ruinas: columnas rotas, muros bajos, un arco, una fuente seca y piezas caídas. */
  ruins(L, p, rng) {
    const prims = [];
    const R = p.r ?? 30;
    const y0 = L._ground(p.x, p.z);
    // Fuente seca en el centro.
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      L._add(G.box, { position: [p.x + Math.cos(a) * 3.2, y0 + 0.35, p.z + Math.sin(a) * 3.2], rotation: [0, -a, 0], scale: [1.8, 0.7, 0.45], color: pick(STONE, rng) });
    }
    L._add(G.cyl, { position: [p.x, y0 + 1, p.z], scale: [1, 2, 1], color: 0xb7b0a2 });
    L._add(G.ico0, { position: [p.x, y0 + 2.4, p.z], scale: [1.2, 0.9, 1.2], color: 0x9f988b });
    prims.push({ x: p.x, z: p.z, r: 3.6, y0: y0 - 1, y1: y0 + 0.7, walk: true, wall: true });
    // Columnatas en anillo (algunas rotas).
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const x = p.x + Math.cos(a) * R * 0.55;
      const z = p.z + Math.sin(a) * R * 0.55;
      const y = L._ground(x, z);
      const hgt = rng.next() < 0.35 ? 0.6 + rng.next() : 2.5 + rng.next() * 3;
      L._add(G.box, { position: [x, y + 0.2, z], scale: [1.3, 0.4, 1.3], color: pick(STONE, rng) });
      L._add(G.cyl, { position: [x, y + 0.4 + hgt / 2, z], scale: [0.8, hgt, 0.8], color: pick(STONE, rng), jitter: (i, v) => { if (v.y > 0.45) v.y += (Math.sin(i * 7.1) * 0.08); } });
      if (hgt > 3 && rng.next() < 0.4) L._add(G.box, { position: [x, y + 0.4 + hgt + 0.15, z], scale: [1.1, 0.3, 1.1], color: pick(STONE, rng) });
      prims.push({ x, z, r: 0.5, y0: y - 1, y1: y + 0.4 + hgt, wall: true, walk: hgt < 1.6 });
      // Pieza caída al lado.
      if (hgt < 2 && rng.next() < 0.6) {
        const fx = x + Math.cos(a + 1.3) * 2.2;
        const fz = z + Math.sin(a + 1.3) * 2.2;
        L._add(G.cyl, { position: [fx, L._ground(fx, fz) + 0.35, fz], rotation: [Math.PI / 2, 0, a], scale: [0.75, 2.4, 0.75], color: pick(STONE, rng) });
      }
    }
    // Muros bajos derruidos y un arco.
    for (let k = 0; k < 5; k++) {
      const a = rng.next() * Math.PI * 2;
      const d = R * (0.75 + rng.next() * 0.2);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const y = L._ground(x, z);
      const len = 4 + rng.next() * 5;
      const hgt = 0.6 + rng.next() * 1.2;
      for (let b = 0; b < len; b += 0.9) {
        const bx = x + Math.cos(a + Math.PI / 2) * (b - len / 2);
        const bz = z + Math.sin(a + Math.PI / 2) * (b - len / 2);
        const bh = hgt * (0.5 + rng.next() * 0.6);
        L._add(G.box, { position: [bx, L._ground(bx, bz) + bh / 2, bz], rotation: [0, -a, 0], scale: [0.85, bh, 0.6], color: pick(STONE, rng) });
      }
      prims.push({ cx: x, cz: z, hx: len / 2, hz: 0.3, yaw: -a + Math.PI / 2, y0: y - 1, y1: y + hgt, wall: true, walk: true });
    }
    const ax = p.x + R * 0.9;
    const az = p.z;
    const ay = L._ground(ax, az);
    for (const s of [-1, 1]) {
      L._add(G.box, { position: [ax, ay + 2, az + s * 1.8], scale: [1, 4, 0.9], color: pick(STONE, rng) });
      prims.push({ cx: ax, cz: az + s * 1.8, hx: 0.5, hz: 0.45, yaw: 0, y0: ay - 1, y1: ay + 4, wall: true });
    }
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * Math.PI;
      L._add(G.box, { position: [ax, ay + 4 + Math.sin(a) * 1.6, az + Math.cos(a) * 1.8], rotation: [a - Math.PI / 2, 0, 0], scale: [1, 0.55, 0.9], color: pick(STONE, rng) });
    }
    L._col.add(`poi:${p.id}`, prims);
  },

  /** Faro Roto: torre troncocónica con la cima rota, puerta y ventanas. */
  lighthouse(L, p, rng) {
    const y = L._ground(p.x, p.z);
    const H = 17;
    L._add(G.cyl, { position: [p.x, y + 0.5, p.z], scale: [8, 1.2, 8], color: 0x8f897d });
    L._add(G.cyl, {
      position: [p.x, y + H / 2, p.z], scale: [6, H, 6], color: 0xd8d2c4,
      jitter: (i, v) => {
        const k = 1 - (v.y + 0.5) * 0.25;
        v.x *= k;
        v.z *= k;
        if (v.y > 0.45) v.y -= Math.abs(Math.sin(Math.atan2(v.z, v.x) * 3)) * 0.12; // borde roto
      },
    });
    for (let b = 0; b < 4; b++) L._add(G.cyl, { position: [p.x, y + 2.5 + b * 4, p.z], scale: [6.1 - b * 0.35, 0.6, 6.1 - b * 0.35], color: 0xa8483a });
    L._add(G.box, { position: [p.x, y + 1.5, p.z + 2.9], scale: [1.3, 2.4, 0.4], color: 0x4a3524 });
    for (let k = 0; k < 4; k++) L._add(G.box, { position: [p.x + Math.sin(k * 1.6) * 2.7, y + 6 + k * 3, p.z + Math.cos(k * 1.6) * 2.7], rotation: [0, k * 1.6, 0], scale: [0.6, 1, 0.3], color: 0x2a3540 });
    for (let k = 0; k < 6; k++) {
      const a = rng.next() * Math.PI * 2;
      const r = 5 + rng.next() * 3;
      L._add(G.dodeca, { position: [p.x + Math.cos(a) * r, L._ground(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) + 0.3, p.z + Math.sin(a) * r], scale: 0.8 + rng.next(), color: 0xc9c3b5 });
    }
    L._col.add(`poi:${p.id}`, [{ x: p.x, z: p.z, r: 3, y0: y - 1, y1: y + H, wall: true }]);
  },

  /** Arco del Mar: dos pilares de roca unidos por un arco de bloques. */
  arch(L, p, rng) {
    const span = 22;
    const prims = [];
    const a0 = 0.3;
    const ux = Math.cos(a0);
    const uz = Math.sin(a0);
    const ends = [-1, 1].map((s) => ({ x: p.x + ux * span * 0.5 * s, z: p.z + uz * span * 0.5 * s }));
    for (const e of ends) {
      const y = L._ground(e.x, e.z);
      for (let k = 0; k < 5; k++) L._add(G.dodeca, { position: [e.x + (rng.next() - 0.5) * 2, y + k * 3, e.z + (rng.next() - 0.5) * 2], scale: [5.5 - k * 0.4, 4, 5.5 - k * 0.4], color: pick(ROCK, rng) });
      prims.push({ x: e.x, z: e.z, r: 2.6, y0: y - 3, y1: y + 14, wall: true });
    }
    const yA = L._ground(ends[0].x, ends[0].z);
    const yB = L._ground(ends[1].x, ends[1].z);
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const x = ends[0].x + (ends[1].x - ends[0].x) * t;
      const z = ends[0].z + (ends[1].z - ends[0].z) * t;
      const y = yA + (yB - yA) * t + 12 + Math.sin(t * Math.PI) * 5;
      L._add(G.dodeca, { position: [x, y, z], scale: [4.2, 3.6 + rng.next(), 4.2], color: pick(ROCK, rng) });
    }
    L._col.add(`poi:${p.id}`, prims);
  },

  /** Puente de Piedra: losa natural sobre el río, por la que se camina. */
  bridge(L, p, rng) {
    // Dirección del río en ese punto: el puente va de orilla a orilla (perpendicular).
    const lv = L._map.waterAt(p.x, p.z) ?? L._ground(p.x, p.z);
    let best = 0;
    let bestLen = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI;
      let len = 0;
      for (const s of [-1, 1]) {
        for (let d = 1; d < 30; d++) {
          if (L._map.waterAt(p.x + Math.cos(a) * d * s, p.z + Math.sin(a) * d * s) === null) {
            len += d;
            break;
          }
        }
      }
      if (len < bestLen) {
        bestLen = len;
        best = a;
      }
    }
    const half = Math.max(6, bestLen / 2 + 4);
    const ux = Math.cos(best);
    const uz = Math.sin(best);
    const yA = L._ground(p.x - ux * half, p.z - uz * half);
    const yB = L._ground(p.x + ux * half, p.z + uz * half);
    const deck = Math.max(yA, yB, lv + 2.5) + 0.3;
    const yaw = -best;
    L._add(G.box, { position: [p.x, deck - 0.6, p.z], rotation: [0, yaw, 0], scale: [half * 2 + 2, 1.2, 3.6], color: 0x8a8274 });
    for (let k = -half; k <= half; k += 2.2) {
      const x = p.x + ux * k;
      const z = p.z + uz * k;
      const below = Math.max(lv - 1, L._ground(x, z) - 1);
      const sag = Math.cos((k / half) * Math.PI * 0.5);
      L._add(G.dodeca, { position: [x, deck - 1.2 - sag * 0.8, z], scale: [2.4, 1.8, 4], color: pick(ROCK, rng) });
      if (Math.abs(k) > half * 0.6) L._add(G.dodeca, { position: [x, (below + deck) / 2 - 0.5, z], scale: [3, Math.max(1, deck - below), 4], color: pick(ROCK, rng) });
    }
    L._col.add(`poi:${p.id}`, [{ cx: p.x, cz: p.z, hx: half + 1, hz: 1.8, yaw, y0: deck - 1.2, y1: deck, walk: true, roof: true }]);
  },

  /** Cantera: bloques cortados, gradas y una grúa de madera. */
  quarry(L, p, rng) {
    const prims = [];
    const R = p.r ?? 40;
    for (let k = 0; k < 22; k++) {
      const a = rng.next() * Math.PI * 2;
      const d = R * (0.2 + rng.next() * 0.7);
      const x = p.x + Math.cos(a) * d;
      const z = p.z + Math.sin(a) * d;
      const y = L._ground(x, z);
      const sx = 1 + rng.next() * 1.6;
      const sy = 0.8 + rng.next() * 1.2;
      const sz = 1 + rng.next() * 1.4;
      const yaw = rng.next() * 3;
      L._add(G.box, { position: [x, y + sy / 2 - 0.1, z], rotation: [0, yaw, 0], scale: [sx, sy, sz], color: pick(STONE, rng) });
      prims.push({ cx: x, cz: z, hx: sx / 2, hz: sz / 2, yaw, y0: y - 1, y1: y + sy - 0.1, wall: true, walk: true });
    }
    const cy = L._ground(p.x, p.z);
    L._add(G.box, { position: [p.x, cy + 3, p.z], scale: [0.4, 6, 0.4], color: 0x6b4a2c });
    L._add(G.box, { position: [p.x + 2, cy + 5.8, p.z], rotation: [0, 0, -0.15], scale: [5, 0.3, 0.3], color: 0x6b4a2c });
    L._add(G.cyl6, { position: [p.x + 4.2, cy + 3.8, p.z], scale: [0.04, 3.6, 0.04], color: 0xb89a6a });
    L._add(G.box, { position: [p.x + 4.2, cy + 1.6, p.z], scale: [1.2, 0.9, 1.2], color: pick(STONE, rng) });
    prims.push({ x: p.x, z: p.z, r: 0.3, y0: cy - 1, y1: cy + 6, wall: true });
    L._col.add(`poi:${p.id}`, prims);
  },

  /** Mirador: un hito de piedras apiladas y un banco mirando al mar. */
  viewpoint(L, p, rng) {
    const y = L._ground(p.x, p.z);
    for (let k = 0; k < 6; k++) L._add(G.dodeca, { position: [p.x + (rng.next() - 0.5) * 0.3, y + 0.3 + k * 0.42, p.z + (rng.next() - 0.5) * 0.3], scale: [1.1 - k * 0.12, 0.45, 1.1 - k * 0.12], color: pick(STONE, rng) });
    L._add(G.box, { position: [p.x + 2.5, y + 0.45, p.z], scale: [0.5, 0.15, 2], color: 0x7a5a38 });
    for (const s of [-0.8, 0.8]) L._add(G.box, { position: [p.x + 2.5, y + 0.2, p.z + s], scale: [0.4, 0.45, 0.2], color: 0x8f897d });
    L._col.add(`poi:${p.id}`, [{ x: p.x, z: p.z, r: 0.6, y0: y - 1, y1: y + 2.5, wall: true }]);
  },

  /** Cascada: bruma al pie del salto. */
  waterfall(L, p) {
    const lv = L._map.waterAt(p.x, p.z);
    const y = lv ?? L._ground(p.x, p.z);
    // El pie: el punto más bajo con agua a menos de 30 m.
    let foot = { x: p.x, z: p.z, y };
    for (let a = 0; a < 16; a++) {
      for (const d of [10, 20, 30, 45, 60, 75]) {
        const x = p.x + Math.cos((a / 16) * Math.PI * 2) * d;
        const z = p.z + Math.sin((a / 16) * Math.PI * 2) * d;
        const w = L._map.waterAt(x, z);
        const h = w ?? (L._ground(x, z) < 0.3 ? 0 : null);
        if (h !== null && h < foot.y) foot = { x, z, y: h };
      }
    }
    L.waterfalls.push({ x: foot.x, y: foot.y, z: foot.z, top: y, name: p.name });
    L._steam(foot.x, foot.y, foot.z, 9, 0xf4fbff, 0.3, 6, 7);
  },

  /** Cala del fiordo: troncos varados y un bote roto. */
  cove(L, p, rng) {
    for (let k = 0; k < 5; k++) {
      const x = p.x + (rng.next() - 0.5) * 18;
      const z = p.z + (rng.next() - 0.5) * 12;
      L._add(G.cyl6, { position: [x, L._ground(x, z) + 0.2, z], rotation: [Math.PI / 2, 0, rng.next() * 3], scale: [0.35, 2 + rng.next() * 3, 0.35], color: 0xa89a80 });
    }
    const y = L._ground(p.x, p.z);
    L._add(G.box, { position: [p.x, y + 0.35, p.z], rotation: [0.2, 0.6, 0.35], scale: [1.4, 0.6, 3.6], color: 0x6b4a2c, jitter: (i, v) => { v.x *= 1 - Math.abs(v.z) * 0.9; } });
  },
};
