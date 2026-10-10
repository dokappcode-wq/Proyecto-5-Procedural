import * as THREE from 'three';

/**
 * FortressModel — la fortaleza del Rey Goblin (P10): patio cuadrado amurallado con almenas,
 * cuatro torres con tejado y estandarte, puerta con portones abiertos y calaveras, estacas
 * fuera, tiendas y una hoguera en el patio, y al fondo el estrado con el trono entre dos
 * braseros.
 *
 * Coordenadas locales: la puerta mira a +Z; el sitio gira con `site.yaw`. Las murallas bajan
 * hasta por debajo del suelo más bajo (el terreno no está allanado).
 * @returns {{ group, colliders: {x,z,r,h}[], fire, fires: THREE.Object3D[], throne, gate, spots }}
 */
export const FORT_HALF = 15;     // m: medio lado del patio
const WALL_H = 5.5;
const WALL_T = 1.4;
const GATE_W = 5;

export function buildGoblinFortress(site, groundAt, rng = Math.random) {
  const group = new THREE.Group();
  group.name = `goblinFortress_${site.id}`;
  const cx = site.x;
  const cz = site.z;
  const yaw = site.yaw ?? 0;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  // Local → mundo (igual que rotation.y = yaw).
  const W = (lx, lz) => ({ x: cx + lx * cos + lz * sin, z: cz - lx * sin + lz * cos });
  const gy = (lx, lz) => {
    const p = W(lx, lz);
    return groundAt(p.x, p.z);
  };
  const base = site.height ?? groundAt(cx, cz);
  const root = new THREE.Group();
  root.position.set(cx, base, cz);
  root.rotation.y = yaw;
  group.add(root);

  const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });
  const stone = [lam(0x6f6a62), lam(0x7d776d), lam(0x5f5a53)];
  const dark = lam(0x403c37);
  const wood = lam(0x6a4a2a);
  const woodDark = lam(0x4a321c);
  const roof = lam(0x7a2a22);
  const banner = lam(0x8a1d2a, { side: THREE.DoubleSide });
  const gold = lam(0xe0b030, { emissive: 0x3a2800 });
  const bone = lam(0xe6dcc4);
  const hide = lam(0x8a6a48, { side: THREE.DoubleSide });
  const flameA = new THREE.MeshBasicMaterial({ color: 0xff7a1e });
  const flameB = new THREE.MeshBasicMaterial({ color: 0xffd04a });
  const colliders = [];
  const add = (geo, mat, x, y, z, ry = 0, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    root.add(m);
    return m;
  };
  const collide = (lx, lz, r, h) => {
    const p = W(lx, lz);
    colliders.push({ x: p.x, z: p.z, r, h });
  };
  // Lo más bajo del suelo bajo un tramo (para que la piedra no quede flotando).
  const lowest = (pts) => Math.min(...pts.map(([x, z]) => gy(x, z))) - base - 1.2;

  // ---- Murallas -------------------------------------------------------------------------
  const H = FORT_HALF;
  const segLen = 3;
  const wall = (x0, z0, x1, z1, skipGate = false) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.round(len / segLen);
    const dx = (x1 - x0) / n;
    const dz = (z1 - z0) / n;
    const ang = Math.atan2(dx, dz);
    for (let i = 0; i < n; i++) {
      const mx = x0 + dx * (i + 0.5);
      const mz = z0 + dz * (i + 0.5);
      if (skipGate && Math.abs(mx) < GATE_W / 2 + 0.6) continue;
      const bottom = lowest([[x0 + dx * i, z0 + dz * i], [mx, mz], [x0 + dx * (i + 1), z0 + dz * (i + 1)]]);
      const h = WALL_H - bottom;
      add(new THREE.BoxGeometry(WALL_T, h, segLen + 0.02), stone[i % 3], mx, bottom + h / 2, mz, ang);
      // Almenas (merlones) y paseo de ronda.
      for (const k of [-0.25, 0.25]) {
        const ox = mx + Math.sin(ang) * k * segLen;
        const oz = mz + Math.cos(ang) * k * segLen;
        add(new THREE.BoxGeometry(WALL_T * 0.45, 0.8, 0.8), stone[(i + 1) % 3], ox + Math.cos(ang) * WALL_T * 0.3, WALL_H + 0.4, oz - Math.sin(ang) * WALL_T * 0.3, ang);
      }
      // Hileras de sillares (líneas oscuras) para que no sea un bloque liso.
      add(new THREE.BoxGeometry(WALL_T + 0.04, 0.08, segLen), dark, mx, 2.2, mz, ang, false);
      for (let k = 0; k < 3; k++) collide(mx + dx * (k - 1) / 3, mz + dz * (k - 1) / 3, 0.95, WALL_H);
    }
  };
  wall(-H, -H, H, -H);      // fondo
  wall(-H, -H, -H, H);      // izquierda
  wall(H, -H, H, H);        // derecha
  wall(-H, H, H, H, true);  // delante, con la puerta

  // ---- Torres ---------------------------------------------------------------------------
  const tower = (x, z, r, h, withRoof = true) => {
    const bottom = lowest([[x, z], [x + r, z], [x - r, z], [x, z + r], [x, z - r]]);
    const th = h - bottom;
    add(new THREE.CylinderGeometry(r, r * 1.08, th, 8), stone[1], x, bottom + th / 2, z);
    add(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.5, 8), stone[2], x, h + 0.25, z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      add(new THREE.BoxGeometry(0.7, 0.8, 0.5), stone[0], x + Math.cos(a) * r, h + 0.9, z + Math.sin(a) * r, -a);
    }
    // Saeteras.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.18, 1.1, 0.2), dark, x + Math.cos(a) * (r + 0.02), h * 0.6, z + Math.sin(a) * (r + 0.02), -a, false);
    }
    if (withRoof) {
      add(new THREE.ConeGeometry(r * 1.25, r * 1.4, 8), roof, x, h + 1.3 + r * 0.7, z);
      // Mástil y estandarte.
      add(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 5), woodDark, x, h + 2.4 + r * 1.4, z);
      const flag = add(new THREE.PlaneGeometry(1.4, 0.8), banner, x + 0.7, h + 3.1 + r * 1.4, z);
      flag.userData.flag = true;
    }
    collide(x, z, r + 0.3, h);
  };
  for (const [x, z] of [[-H, -H], [H, -H], [-H, H], [H, H]]) tower(x, z, 2.6, WALL_H + 3.5);
  // Torreones de la puerta.
  tower(-GATE_W / 2 - 1.3, H, 1.5, WALL_H + 1.5, false);
  tower(GATE_W / 2 + 1.3, H, 1.5, WALL_H + 1.5, false);

  // ---- Puerta ---------------------------------------------------------------------------
  add(new THREE.BoxGeometry(GATE_W + 1.6, 0.8, WALL_T + 0.3), woodDark, 0, WALL_H - 0.7, H);
  for (const s of [-1, 1]) {
    // Portones abiertos de par en par hacia dentro (pegados al muro de cada lado).
    const doorH = WALL_H - 1.3;
    const dx = s * (GATE_W / 2 - 0.15);
    const dzz = H - WALL_T / 2 - GATE_W / 4;
    add(new THREE.BoxGeometry(0.25, doorH, GATE_W / 2), wood, dx, gy(dx, dzz) - base + doorH / 2, dzz);
    for (const y of [1, 3]) add(new THREE.BoxGeometry(0.3, 0.16, GATE_W / 2 + 0.02), dark, dx, gy(dx, dzz) - base + y, dzz, 0, false);
  }
  // Calaveras sobre la puerta.
  for (let k = -1; k <= 1; k++) {
    add(new THREE.SphereGeometry(0.28, 7, 5), bone, k * 1.2, WALL_H + 0.05, H + 0.8);
    add(new THREE.BoxGeometry(0.3, 0.12, 0.12), dark, k * 1.2, WALL_H - 0.08, H + 1.04, 0, false);
  }

  // ---- Fuego (hoguera del patio y braseros) ------------------------------------------------
  const fires = [];
  const makeFire = (x, y, z, k = 1) => {
    const f = new THREE.Group();
    f.position.set(x, y, z);
    const flames = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22 * k, 0.8 * k, 5), i % 2 ? flameA : flameB);
      const a = (i / 5) * Math.PI * 2;
      fl.position.set(Math.cos(a) * 0.18 * k, 0.4 * k, Math.sin(a) * 0.18 * k);
      flames.add(fl);
    }
    f.add(flames);
    f.userData.flames = flames;
    root.add(f);
    fires.push(f);
    return f;
  };
  // Hoguera con piedras.
  const campY = gy(0, 2) - base;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    add(new THREE.DodecahedronGeometry(0.3, 0), stone[k % 3], Math.cos(a) * 0.9, campY + 0.1, 2 + Math.sin(a) * 0.9);
  }
  const fire = makeFire(0, campY, 2, 1.2);

  // ---- Estrado y trono ------------------------------------------------------------------
  const dz = -H + 4;
  const dy = gy(0, dz) - base;
  const daisBottom = lowest([[-5, dz - 3], [5, dz - 3], [-5, dz + 3], [5, dz + 3]]);
  const daisTop = dy + 0.35;
  add(new THREE.BoxGeometry(10, daisTop - daisBottom, 6), stone[0], 0, (daisTop + daisBottom) / 2, dz);
  add(new THREE.BoxGeometry(6, 0.18, 1), stone[2], 0, dy + 0.09, dz + 3.4);
  // Alfombra roja hasta la puerta.
  add(new THREE.BoxGeometry(2, 0.04, H * 2 - 8), banner, 0, gy(0, 2) - base + 0.03, 2.5, 0, false);
  const throneZ = dz - 1.4;
  add(new THREE.BoxGeometry(1.8, 0.7, 1.4), dark, 0, dy + 0.7, throneZ);
  add(new THREE.BoxGeometry(1.9, 2.8, 0.4), dark, 0, dy + 1.75, throneZ - 0.6);
  add(new THREE.BoxGeometry(2.1, 0.16, 0.5), gold, 0, dy + 3.2, throneZ - 0.6);
  for (const s of [-1, 0, 1]) add(new THREE.ConeGeometry(0.16, 0.7, 5), gold, s * 0.7, dy + 3.6 - Math.abs(s) * 0.15, throneZ - 0.6);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.3, 0.5, 1.4), dark, s * 0.95, dy + 1.2, throneZ);
    // Braseros.
    add(new THREE.CylinderGeometry(0.15, 0.25, 1.3, 6), dark, s * 3.6, dy + 0.65, dz + 1.2);
    add(new THREE.CylinderGeometry(0.6, 0.3, 0.4, 8), dark, s * 3.6, dy + 1.4, dz + 1.2);
    makeFire(s * 3.6, dy + 1.5, dz + 1.2, 0.8);
    // Estandartes en la muralla del fondo.
    add(new THREE.PlaneGeometry(1.6, 3.4), banner, s * 5.5, 3.2, -H + WALL_T / 2 + 0.05);
    add(new THREE.SphereGeometry(0.35, 7, 5), bone, s * 5.5, 3.6, -H + WALL_T / 2 + 0.15);
  }
  collide(0, throneZ - 0.2, 1.1, 3);

  // ---- Patio: tiendas, armeros y estacas fuera ------------------------------------------------
  for (const [x, z, r] of [[-10, -2, 2.4], [10, -2, 2.4], [-10, 7, 2], [10, 7, 2]]) {
    const y = gy(x, z) - base;
    add(new THREE.ConeGeometry(r, 3, 6, 1, true), hide, x, y + 1.5, z);
    add(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 4), woodDark, x, y + 1.8, z);
    collide(x, z, r * 0.8, 3);
  }
  for (const s of [-1, 1]) {
    const x = s * 6;
    const z = 10;
    const y = gy(x, z) - base;
    add(new THREE.BoxGeometry(2.2, 0.12, 0.12), woodDark, x, y + 1.3, z);
    for (let k = 0; k < 4; k++) add(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 4), wood, x - 0.8 + k * 0.5, y + 0.8, z + 0.05);
  }
  // Estacas afiladas delante de la puerta.
  for (let k = 0; k < 12; k++) {
    const side = k < 6 ? -1 : 1;
    const x = side * (GATE_W / 2 + 2 + (k % 6) * 1.6);
    const z = H + 2.6 + (k % 2) * 0.6;
    const y = gy(x, z) - base;
    const st = add(new THREE.ConeGeometry(0.14, 2, 5), wood, x, y + 0.8, z);
    st.rotation.x = 0.5;
  }

  // Puntos de interés en coordenadas del mundo.
  const throneW = W(0, throneZ + 1.6);
  const gate = W(0, H + 2);
  const guards = [W(-5, 4), W(5, 4), W(-6, -6), W(6, -6)];
  const captains = [W(-2.5, H - 3), W(2.5, H - 3)];
  // El rng se acepta por coherencia con buildGoblinBase (la fortaleza es fija).
  void rng;
  return { group, colliders, fire, fires, throne: { ...throneW, y: base + dy }, gate, spots: { guards, captains }, half: H };
}
