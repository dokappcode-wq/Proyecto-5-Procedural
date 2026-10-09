import * as THREE from 'three';
import { PartsBuilder } from '../../render/PartsBuilder.js';
import { SeededRandom, hashString } from '../../core/SeededRandom.js';
import { caveField, CAVE_THEMES } from './CaveSurfaceMesher.js';

/**
 * CaveDecor — lo que da personalidad a cada cueva diseñada, pegado a su roca:
 *   roots     raíces colgando del techo y musgo en los rincones (Cueva del Rocío)
 *   mine      entibado de madera, raíles, faroles, una vagoneta y cajas (Mina Vieja)
 *   crystal   racimos de cristales que brillan en paredes y techo (Gruta de Cristal)
 *   ice       carámbanos, columnas de hielo y una cascada helada (Gruta de Hielo)
 *   mushroom  setas gigantes luminosas y una poza (Bosque de Setas)
 *   sea       algas, conchas y charcas (Cueva del Mar)
 * Todo se coloca fuera de la franja por la que se camina (no estorba).
 * Devuelve { group, lights: [{ x, y, z, color, distance, intensity }] }.
 */
const UP = new THREE.Vector3(0, 1, 0);
const geo = {
  cone: new THREE.ConeGeometry(0.5, 1, 5),
  cone8: new THREE.ConeGeometry(0.5, 1, 8),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  octa: new THREE.OctahedronGeometry(0.5, 0),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
  disc: new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2),
};

export function buildCaveDecor(chains, themeId, name = '') {
  const T = CAVE_THEMES[themeId] ?? CAVE_THEMES.roots;
  const { F } = caveField(chains);
  const rng = new SeededRandom(hashString(`decor:${name}:${themeId}`));
  const solid = new PartsBuilder();
  const glow = new PartsBuilder();
  const lights = [];
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const rot = (dir) => {
    q.setFromUnitVectors(UP, dir);
    eul.setFromQuaternion(q);
    return [eul.x, eul.y, eul.z];
  };
  // Punto de la roca en una dirección desde dentro del hueco, con su normal (hacia el hueco).
  const hit = (ox, oy, oz, dx, dy, dz, max = 16) => {
    for (let t = 0.2; t < max; t += 0.15) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      const z = oz + dz * t;
      if (F(x, y, z) > 0) {
        const e = 0.25;
        const n = new THREE.Vector3(F(x - e, y, z) - F(x + e, y, z), F(x, y - e, z) - F(x, y + e, z), F(x, y, z - e) - F(x, y, z + e)).normalize();
        return { x, y, z, n };
      }
    }
    return null;
  };

  // Recorrido: cada `step` m de cada tramo, con su centro, su lado y si es sala.
  const samples = [];
  for (const ch of chains) {
    const nodes = ch.nodes;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.round(len / 2.2));
      const sx = -(b.z - a.z) / (len || 1);
      const sz = (b.x - a.x) / (len || 1);
      for (let k = 0; k < n; k++) {
        const t = (k + rng.next() * 0.6) / n;
        const r = a.r + (b.r - a.r) * t;
        const floor = a.floor + (b.floor - a.floor) * t;
        samples.push({
          x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, floor, r, yc: floor + 0.7 * r, sx, sz, i, branch: !!ch.branch,
          room: (a.chamber && t < 0.5) || (b.chamber && t >= 0.5), roomName: t < 0.5 ? a.name : b.name, dir: [(b.x - a.x) / (len || 1), (b.z - a.z) / (len || 1)], mouth: !ch.branch && i < 2,
        });
      }
    }
  }
  const ceilingAt = (s, lateral = 0) => hit(s.x + s.sx * lateral, s.yc, s.z + s.sz * lateral, 0, 1, 0);
  const cornerAt = (s, side) => hit(s.x, s.floor + 0.15, s.z, s.sx * side, 0, s.sz * side);
  const wallAt = (s, side, up) => {
    const c = Math.cos(up);
    const d = new THREE.Vector3(s.sx * side * c, Math.sin(up), s.sz * side * c).normalize();
    return hit(s.x, s.yc, s.z, d.x, d.y, d.z);
  };
  const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

  switch (themeId) {
    case 'roots': {
      for (const s of samples) {
        const count = s.mouth ? 3 : s.room ? 2 : rng.next() < 0.5 ? 1 : 0;
        for (let c = 0; c < count; c++) {
          const h = ceilingAt(s, (rng.next() - 0.5) * s.r * 1.1);
          if (!h) continue;
          const len = 0.6 + rng.next() * (s.mouth ? 2.4 : 1.6);
          solid.add(geo.cone, { position: [h.x, h.y - len / 2 + 0.1, h.z], rotation: [Math.PI, rng.next() * 3, (rng.next() - 0.5) * 0.3], scale: [0.09 + rng.next() * 0.07, len, 0.09], color: shade(0x6b4b2e, 0.8 + rng.next() * 0.4) });
        }
        for (const side of [-1, 1]) {
          if (rng.next() > 0.45) continue;
          const h = cornerAt(s, side);
          if (h) solid.add(geo.sphere, { position: [h.x, h.y - 0.1, h.z], scale: [0.7 + rng.next() * 0.6, 0.25 + rng.next() * 0.2, 0.7 + rng.next() * 0.6], color: shade(T.accent, 0.8 + rng.next() * 0.4) });
        }
      }
      break;
    }
    case 'mine': {
      let k = 0;
      for (const s of samples) {
        k++;
        // Raíles: dos carriles y traviesas por el centro del suelo.
        if (!s.branch || rng.next() < 0.7) {
          const ang = Math.atan2(s.dir[0], s.dir[1]);
          for (const off of [-0.45, 0.45]) solid.add(geo.box, { position: [s.x + s.sx * off, s.floor + 0.06, s.z + s.sz * off], rotation: [0, ang, 0], scale: [0.07, 0.07, 2.3], color: 0x55595e });
          solid.add(geo.box, { position: [s.x, s.floor + 0.03, s.z], rotation: [0, ang, 0], scale: [1.3, 0.06, 0.22], color: 0x5c4129 });
        }
        if (s.room || k % 2) continue;
        // Entibado: dos postes en los rincones y una viga bajo el techo.
        const L = cornerAt(s, -1);
        const R = cornerAt(s, 1);
        const top = ceilingAt(s);
        if (!L || !R || !top) continue;
        const beamY = Math.min(top.y - 0.25, s.floor + 2.9);
        for (const p of [L, R]) {
          const px = p.x - s.sx * Math.sign((p.x - s.x) * s.sx + (p.z - s.z) * s.sz) * 0.15;
          const pz = p.z - s.sz * Math.sign((p.x - s.x) * s.sx + (p.z - s.z) * s.sz) * 0.15;
          solid.add(geo.box, { position: [px, (s.floor + beamY) / 2, pz], scale: [0.22, beamY - s.floor, 0.22], color: shade(0x7a5532, 0.85 + rng.next() * 0.3) });
        }
        const bl = Math.hypot(R.x - L.x, R.z - L.z);
        solid.add(geo.box, { position: [(L.x + R.x) / 2, beamY, (L.z + R.z) / 2], rotation: [0, Math.atan2(s.dir[0], s.dir[1]), 0], scale: [bl, 0.24, 0.26], color: 0x6b4a2c });
        if (k % 4 === 0) {
          const lx = (L.x + R.x) / 2 + s.sx * bl * 0.25;
          const lz = (L.z + R.z) / 2 + s.sz * bl * 0.25;
          solid.add(geo.cyl, { position: [lx, beamY - 0.3, lz], scale: [0.02, 0.35, 0.02], color: 0x2a2a2a });
          glow.add(geo.box, { position: [lx, beamY - 0.6, lz], scale: [0.18, 0.24, 0.18], color: 0xffc070 });
          lights.push({ x: lx, y: beamY - 0.7, z: lz, color: 0xffa040, distance: 9, intensity: 1.4 });
        }
      }
      // Vagoneta y cajas en las salas.
      for (const s of samples.filter((v) => v.room)) {
        if (rng.next() > 0.35) continue;
        const h = cornerAt(s, rng.next() < 0.5 ? -1 : 1);
        if (!h) continue;
        const x = h.x + h.n.x * 0.9;
        const z = h.z + h.n.z * 0.9;
        if (s.roomName === 'Sala de la Vagoneta' && !lights.some((l) => l.cart)) {
          solid.add(geo.box, { position: [x, s.floor + 0.55, z], rotation: [0, Math.atan2(s.dir[0], s.dir[1]), 0], scale: [0.9, 0.6, 1.4], color: 0x5d6168 });
          solid.add(geo.box, { position: [x, s.floor + 0.9, z], rotation: [0, Math.atan2(s.dir[0], s.dir[1]), 0], scale: [0.75, 0.2, 1.2], color: 0x3a3226 });
          lights.push({ x, y: s.floor + 2, z, color: 0xffa040, distance: 0.1, intensity: 0, cart: true });
        } else {
          const sz = 0.5 + rng.next() * 0.3;
          solid.add(geo.box, { position: [x, s.floor + sz / 2, z], rotation: [0, rng.next() * 3, 0], scale: [sz, sz, sz], color: shade(0x8a6238, 0.8 + rng.next() * 0.3) });
        }
      }
      break;
    }
    case 'crystal': {
      const palette = [0xb48cff, 0x7fe3ff, 0xff9ee6, 0xd6c2ff];
      for (const s of samples) {
        const n = s.room ? 4 : rng.next() < 0.6 ? 1 : 0;
        for (let c = 0; c < n; c++) {
          const h = wallAt(s, rng.next() < 0.5 ? -1 : 1, (rng.next() * 1.5 - 0.15));
          if (!h) continue;
          const col = palette[Math.floor(rng.next() * palette.length)];
          const big = s.room ? 1 + rng.next() * 1.4 : 0.6 + rng.next() * 0.6;
          const shards = 3 + Math.floor(rng.next() * 4);
          for (let k = 0; k < shards; k++) {
            const d = h.n.clone().add(new THREE.Vector3(rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5).multiplyScalar(0.9)).normalize();
            const len = big * (0.5 + rng.next() * 0.9);
            glow.add(geo.octa, { position: [h.x + d.x * len * 0.35, h.y + d.y * len * 0.35, h.z + d.z * len * 0.35], rotation: rot(d), scale: [0.18 * big, len, 0.18 * big], color: shade(col, 0.7 + rng.next() * 0.4) });
          }
        }
        if (s.room && rng.next() < 0.3) lights.push({ x: s.x, y: s.yc + 1, z: s.z, color: rng.next() < 0.5 ? 0xb48cff : 0x7fe3ff, distance: 14, intensity: 1.6 });
      }
      break;
    }
    case 'ice': {
      for (const s of samples) {
        const n = s.room ? 6 : 2 + Math.floor(rng.next() * 2);
        for (let c = 0; c < n; c++) {
          const h = ceilingAt(s, (rng.next() - 0.5) * s.r * 1.2);
          if (!h) continue;
          const len = 0.4 + rng.next() * (s.room ? 2.2 : 1.1);
          glow.add(geo.cone8, { position: [h.x, h.y - len / 2 + 0.05, h.z], rotation: [Math.PI, 0, 0], scale: [0.16 + rng.next() * 0.16, len, 0.16 + rng.next() * 0.16], color: shade(0xbfe6ff, 0.75 + rng.next() * 0.3) });
        }
        for (const side of [-1, 1]) {
          if (rng.next() > (s.room ? 0.5 : 0.2)) continue;
          const h = cornerAt(s, side);
          if (!h) continue;
          const tall = 0.8 + rng.next() * (s.room ? 2.5 : 1.2);
          glow.add(geo.octa, { position: [h.x, s.floor + tall / 2, h.z], rotation: [0, rng.next() * 3, (rng.next() - 0.5) * 0.3], scale: [0.4, tall, 0.4], color: shade(0xd9f2ff, 0.7 + rng.next() * 0.3) });
        }
        if (s.room && rng.next() < 0.25) lights.push({ x: s.x, y: s.yc + 1, z: s.z, color: 0x9fdcff, distance: 13, intensity: 1.2 });
      }
      // Cascada helada: una cortina de hielo en la pared del fondo de su sala.
      const fall = samples.filter((s) => s.roomName === 'Cascada Helada').pop();
      if (fall) {
        const h = hit(fall.x, fall.floor + 0.3, fall.z, fall.dir[0], 0, fall.dir[1], 20);
        if (h) {
          for (let k = 0; k < 9; k++) {
            const o = (k - 4) * 0.55;
            const hh = 2.5 + rng.next() * 2.5;
            glow.add(geo.cone8, { position: [h.x + fall.sx * o - fall.dir[0] * 0.3, fall.floor + hh / 2, h.z + fall.sz * o - fall.dir[1] * 0.3], rotation: [Math.PI, 0, 0], scale: [0.5, hh, 0.35], color: shade(0xcdeeff, 0.8 + rng.next() * 0.2) });
          }
          lights.push({ x: h.x - fall.dir[0] * 2, y: fall.floor + 2.5, z: h.z - fall.dir[1] * 2, color: 0xaee6ff, distance: 12, intensity: 1.6 });
        }
      }
      break;
    }
    case 'mushroom': {
      const caps = [0x3fe0c0, 0x8f7bff, 0x5fd0ff, 0xb2ff7a];
      for (const s of samples) {
        for (const side of [-1, 1]) {
          const big = s.room && rng.next() < 0.55;
          if (!big && rng.next() > 0.4) continue;
          const h = cornerAt(s, side);
          if (!h) continue;
          const x = h.x + h.n.x * (big ? 0.5 : 0.2);
          const z = h.z + h.n.z * (big ? 0.5 : 0.2);
          const hgt = big ? 1.8 + rng.next() * 2.4 : 0.25 + rng.next() * 0.4;
          const capR = big ? 1.1 + rng.next() * 1.2 : 0.2 + rng.next() * 0.2;
          const col = caps[Math.floor(rng.next() * caps.length)];
          solid.add(geo.cyl, { position: [x, s.floor + hgt / 2, z], rotation: [(rng.next() - 0.5) * 0.2, 0, (rng.next() - 0.5) * 0.2], scale: [capR * 0.22, hgt, capR * 0.22], color: 0xd8d2bc });
          glow.add(geo.sphere, { position: [x, s.floor + hgt - 0.05, z], scale: [capR * 2, capR * 0.9, capR * 2], color: col });
          if (big && rng.next() < 0.35) lights.push({ x, y: s.floor + hgt + 0.4, z, color: col, distance: 11, intensity: 1.3 });
        }
      }
      const lake = samples.filter((s) => s.roomName === 'Lago Escondido');
      if (lake.length) {
        const s = lake[Math.floor(lake.length / 2)];
        glow.add(geo.disc, { position: [s.x, s.floor + 0.04, s.z], scale: [s.r * 1.1, 1, s.r * 0.8], color: 0x2a8fa0 });
        lights.push({ x: s.x, y: s.floor + 1.5, z: s.z, color: 0x4fe0ff, distance: 12, intensity: 1.2 });
      }
      break;
    }
    case 'sea': {
      for (const s of samples) {
        for (const side of [-1, 1]) {
          if (rng.next() > 0.6) continue;
          const h = cornerAt(s, side);
          if (!h) continue;
          const n = 2 + Math.floor(rng.next() * 4);
          for (let k = 0; k < n; k++) {
            const tall = 0.4 + rng.next() * 1.1;
            solid.add(geo.cone, { position: [h.x + (rng.next() - 0.5) * 0.6, s.floor + tall / 2, h.z + (rng.next() - 0.5) * 0.6], rotation: [(rng.next() - 0.5) * 0.4, 0, (rng.next() - 0.5) * 0.4], scale: [0.08, tall, 0.08], color: shade(0x3f7a4a, 0.7 + rng.next() * 0.5) });
          }
          if (rng.next() < 0.5) solid.add(geo.cone, { position: [h.x + h.n.x * 0.5, s.floor + 0.06, h.z + h.n.z * 0.5], rotation: [Math.PI / 2, rng.next() * 3, 0], scale: [0.12, 0.2, 0.12], color: 0xf1e3cf });
        }
        if (s.room && rng.next() < 0.5) glow.add(geo.disc, { position: [s.x + s.sx * (rng.next() - 0.5) * s.r, s.floor + 0.03, s.z + s.sz * (rng.next() - 0.5) * s.r], scale: [1.4 + rng.next() * 1.6, 1, 1 + rng.next()], color: 0x2f7f96 });
      }
      break;
    }
    default:
      break;
  }

  const group = new THREE.Group();
  group.name = `decor_${name}`;
  const mk = (pb, mat) => {
    const g = pb.toGeometry();
    if (!g.attributes.position.count) return;
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -1;
    group.add(m);
  };
  mk(solid, solidMaterial());
  mk(glow, glowMaterial());
  return { group, lights: lights.filter((l) => l.intensity > 0) };
}

let _solid;
let _glow;
function solidMaterial() {
  return (_solid ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
/** Lo que brilla (cristales, setas, faroles, hielo): no le afecta la oscuridad de la cueva. */
function glowMaterial() {
  return (_glow ??= new THREE.MeshBasicMaterial({ vertexColors: true }));
}
