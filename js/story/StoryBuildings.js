import * as THREE from 'three';

/**
 * StoryBuildings — los lugares de la historia (mallas + obstáculos para StaticColliders):
 *   - la torre del ermitaño: alta y estrecha ("de Rapunzel"), con una escalera de
 *     caracol por fuera y una habitación oscura arriba, con una sola ventana;
 *   - el ermitaño (encapuchado, barba blanca, bastón con un cristal);
 *   - la arena del nodo espacial: pedestal de piedra con una caja flotante y dos
 *     anillas que la orbitan, y un anillo de muros que suben del suelo;
 *   - el mini-nodo A1 (la clave).
 */
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function addBox(group, mat, cx, y, cz, w, h, d, yaw = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(cx, y, cz);
  m.rotation.y = yaw;
  m.castShadow = m.receiveShadow = true;
  group.add(m);
  return m;
}

// ---- Torre del ermitaño ---------------------------------------------------------------

export const TOWER = { R: 3, H: 22, ROOM_H: 3.3, STAIR_IN: 3.0, STAIR_OUT: 4.5, TURNS: 1.6, RISE: 0.34 };

/**
 * @returns {{ group, prims, room: { x, z, y, r }, door: {x, z, y}, hermitSpot: {x,z,y}, lightPos }}
 */
export function buildHermitTower(site, ground) {
  const T = TOWER;
  const g = new THREE.Group();
  g.name = 'HermitTower';
  const x0 = site.x;
  const z0 = site.z;
  const y0 = ground;
  const top = y0 + T.H; // suelo de la habitación
  const stone = lambert(0x8d877c);
  const stoneDark = lambert(0x6e695f);
  const roofM = lambert(0x7a3426);
  const wood = lambert(0x6b4a2b);
  const ivy = lambert(0x3f6b2e);
  const prims = [];
  // Fuste.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(T.R, T.R + 0.35, T.H + 1, 14), stone);
  shaft.position.set(x0, y0 + (T.H - 1) / 2, z0);
  shaft.castShadow = shaft.receiveShadow = true;
  g.add(shaft);
  prims.push({ x: x0, z: z0, r: T.R, y0: y0 - 2, y1: top, wall: true, walk: true });
  for (const h of [0.2, 0.45, 0.7, 0.98]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(T.R + 0.12, 0.12, 4, 14), stoneDark);
    band.rotation.x = Math.PI / 2;
    band.position.set(x0, y0 + T.H * h, z0);
    g.add(band);
  }
  // Hiedra.
  for (let i = 0; i < 9; i++) {
    const a = site.yaw + i * 0.7;
    const h = 2 + (i * 2.3) % (T.H - 4);
    addBox(g, ivy, x0 + Math.cos(a) * (T.R + 0.05), y0 + h, z0 + Math.sin(a) * (T.R + 0.05), 0.5, 1.8, 0.12, -a + Math.PI / 2);
  }
  // Escalera de caracol por fuera (sube TURNS vueltas hasta la puerta de arriba).
  const n = Math.ceil(T.H / T.RISE);
  const rise = T.H / n;
  const rMid = (T.STAIR_IN + T.STAIR_OUT) / 2;
  const half = (T.STAIR_OUT - T.STAIR_IN) / 2;
  const sweep = T.TURNS * Math.PI * 2;
  const a0 = site.yaw;
  const arc = (rMid * sweep) / n;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * sweep;
    const cx = x0 + Math.cos(a) * rMid;
    const cz = z0 + Math.sin(a) * rMid;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)); // eje x local tangente
    const ty = y0 + (i + 1) * rise;
    addBox(g, i % 2 ? stone : stoneDark, cx, ty - 0.15, cz, arc * 1.15, 0.3, half * 2, yaw);
    prims.push({ cx, cz, hx: arc * 0.6, hz: half, yaw, y0: ty - 0.3, y1: ty, walk: true });
    // Pretil exterior.
    const rx = x0 + Math.cos(a) * (T.STAIR_OUT + 0.08);
    const rz = z0 + Math.sin(a) * (T.STAIR_OUT + 0.08);
    addBox(g, stoneDark, rx, ty + 0.45, rz, arc * 1.15, 0.9, 0.16, yaw);
    prims.push({ cx: rx, cz: rz, hx: arc * 0.6, hz: 0.1, yaw, y0: ty, y1: ty + 1.0, wall: true });
    // Ménsula bajo el escalón (que no flote).
    if (i % 3 === 0) addBox(g, stoneDark, x0 + Math.cos(a) * (T.STAIR_IN + 0.35), ty - 0.55, z0 + Math.sin(a) * (T.STAIR_IN + 0.35), 0.3, 0.5, 0.6, yaw);
  }
  const aDoor = a0 + sweep;
  // Habitación de arriba: muro en anillo con la puerta hacia el final de la escalera.
  const segs = 18;
  const wallR = T.R - 0.15;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    if (Math.abs(wrap(a - aDoor)) < 0.32) continue; // puerta
    const cx = x0 + Math.cos(a) * wallR;
    const cz = z0 + Math.sin(a) * wallR;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    const w = ((Math.PI * 2 * wallR) / segs) * 1.05;
    addBox(g, stone, cx, top + T.ROOM_H / 2, cz, w, T.ROOM_H, 0.3, yaw);
    prims.push({ cx, cz, hx: w / 2, hz: 0.16, yaw, y0: top, y1: top + T.ROOM_H, wall: true });
  }
  // Ventana (la única), enfrente de la puerta: brilla de lejos.
  const aWin = aDoor + Math.PI;
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshBasicMaterial({ color: 0xffc46a }));
  win.position.set(x0 + Math.cos(aWin) * (wallR + 0.17), top + 1.7, z0 + Math.sin(aWin) * (wallR + 0.17));
  win.lookAt(x0 + Math.cos(aWin) * 10, top + 1.7, z0 + Math.sin(aWin) * 10);
  g.add(win);
  // Dintel de la puerta.
  addBox(g, stoneDark, x0 + Math.cos(aDoor) * wallR, top + T.ROOM_H - 0.3, z0 + Math.sin(aDoor) * wallR, 1.9, 0.6, 0.4, Math.atan2(-Math.cos(aDoor), -Math.sin(aDoor)));
  // Tejado cónico.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(T.R + 0.9, 5, 14), roofM);
  roof.position.set(x0, top + T.ROOM_H + 2.5, z0);
  roof.castShadow = true;
  g.add(roof);
  prims.push({ x: x0, z: z0, r: T.R + 0.9, y0: top + T.ROOM_H, y1: top + T.ROOM_H + 5, roof: true });
  // Bandera en la punta.
  addBox(g, wood, x0, top + T.ROOM_H + 5.6, z0, 0.06, 1.6, 0.06);
  const flag = addBox(g, lambert(0xd8c08a), x0 + 0.38, top + T.ROOM_H + 6.1, z0, 0.7, 0.45, 0.03);
  // Suelo de madera de la habitación y un camastro, una mesa con una vela.
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(wallR - 0.1, wallR - 0.1, 0.06, 14), wood);
  floor.position.set(x0, top + 0.03, z0);
  g.add(floor);
  const bedA = aWin + 1.2;
  addBox(g, lambert(0x5a4a3a), x0 + Math.cos(bedA) * 1.7, top + 0.25, z0 + Math.sin(bedA) * 1.7, 1.8, 0.4, 0.9, -bedA);
  const tableA = aWin - 1.1;
  const tx = x0 + Math.cos(tableA) * 1.8;
  const tz = z0 + Math.sin(tableA) * 1.8;
  addBox(g, wood, tx, top + 0.45, tz, 0.8, 0.08, 0.6, -tableA);
  addBox(g, lambert(0xf0e6c8), tx, top + 0.58, tz, 0.07, 0.18, 0.07);
  const candle = new THREE.PointLight(0xffa04a, 0.7, 6, 2);
  candle.position.set(tx, top + 0.85, tz);
  g.add(candle);
  const ha = aWin - 0.2;
  return {
    group: g,
    prims,
    flag,
    candle,
    room: { x: x0, z: z0, y: top, r: wallR - 0.2, h: T.ROOM_H },
    door: { x: x0 + Math.cos(aDoor) * (T.STAIR_OUT - 0.4), z: z0 + Math.sin(aDoor) * (T.STAIR_OUT - 0.4), y: top },
    bottom: { x: x0 + Math.cos(a0) * (T.STAIR_OUT + 2), z: z0 + Math.sin(a0) * (T.STAIR_OUT + 2) },
    hermitSpot: { x: x0 + Math.cos(ha) * 1.3, z: z0 + Math.sin(ha) * 1.3, y: top },
    windowLight: win,
  };
}

/** El ermitaño: encapuchado, barba blanca, ojos que brillan en la oscuridad y un bastón. */
export function buildHermit() {
  const g = new THREE.Group();
  g.name = 'Hermit';
  const robe = lambert(0x3a2f26);
  const robe2 = lambert(0x2c241d);
  const skin = lambert(0xc9a98a);
  const beard = lambert(0xe8e4dc);
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.35, 8), robe);
  body.position.y = 0.68;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), robe);
  shoulders.position.y = 1.25;
  shoulders.scale.set(1.2, 0.7, 1);
  const head = new THREE.Group();
  head.position.set(0, 1.45, 0.04);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), skin);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.5, 8, 1, true), robe2);
  hood.position.set(0, 0.1, -0.03);
  hood.material = robe2.clone();
  hood.material.side = THREE.DoubleSide;
  const b = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.42, 6), beard);
  b.rotation.x = Math.PI;
  b.position.set(0, -0.2, 0.1);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const eyes = [-0.05, 0.05].map((x) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), eyeM);
    e.position.set(x, 0.03, 0.135);
    return e;
  });
  head.add(face, hood, b, ...eyes);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.7, 5), lambert(0x5b4128));
  staff.position.set(0.35, 0.85, 0.12);
  staff.rotation.z = -0.08;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0x8fe8ff }));
  crystal.position.set(0.42, 1.75, 0.12);
  const glow = new THREE.PointLight(0x8fe8ff, 0.25, 3, 2);
  glow.position.copy(crystal.position);
  g.add(body, shoulders, head, staff, crystal, glow);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { group: g, head, crystal };
}

// ---- Arena del nodo espacial ------------------------------------------------------------

export const ARENA = { WALL_R: 17, WALLS: 14, WALL_H: 4.2, GOLEM_R: 8.5 };

export function buildNodeArena(site, ground, groundAt) {
  const A = ARENA;
  const g = new THREE.Group();
  g.name = 'NodeArena';
  const x0 = site.x;
  const z0 = site.z;
  const stone = lambert(0x8a8478);
  const stoneDark = lambert(0x66615a);
  const rune = new THREE.MeshBasicMaterial({ color: 0x6fd8ff });
  const prims = [];
  // Pedestal de tres escalones con runas.
  for (const [r, h, y] of [[2.4, 0.4, 0.2], [1.8, 0.4, 0.6], [1.15, 0.5, 1.05]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.1, h, 10), y > 1 ? stoneDark : stone);
    m.position.set(x0, ground + y, z0);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    prims.push({ x: x0, z: z0, r, y0: ground - 1, y1: ground + y + h / 2, walk: true, wall: false });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.08), rune);
    m.position.set(x0 + Math.cos(a) * 2.42, ground + 0.25, z0 + Math.sin(a) * 2.42);
    m.rotation.y = -a;
    g.add(m);
  }
  // El nodo: caja flotante con aristas que brillan y dos anillas orbitando.
  const node = new THREE.Group();
  node.position.set(x0, ground + 2.4, z0);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x1e6fa8, emissiveIntensity: 0.7, metalness: 0.6, roughness: 0.3 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.64, 0.64, 0.64)), new THREE.LineBasicMaterial({ color: 0x9ff0ff }));
  const ringM = new THREE.MeshBasicMaterial({ color: 0x7fe4ff });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.035, 6, 40), ringM);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 6, 40), ringM);
  const light = new THREE.PointLight(0x6fd8ff, 1.4, 9, 2);
  node.add(cube, edges, ring1, ring2, light);
  g.add(node);
  // Muros que suben del suelo (enterrados al principio).
  const walls = [];
  for (let i = 0; i < A.WALLS; i++) {
    const a = (i / A.WALLS) * Math.PI * 2;
    const cx = x0 + Math.cos(a) * A.WALL_R;
    const cz = z0 + Math.sin(a) * A.WALL_R;
    const gy = Math.min(groundAt(cx, cz), ground);
    const w = ((Math.PI * 2 * A.WALL_R) / A.WALLS) * 1.04;
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
    const wall = new THREE.Group();
    wall.position.set(cx, gy, cz);
    wall.rotation.y = yaw;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, A.WALL_H + 1, 1.1), stone);
    body.position.y = (A.WALL_H + 1) / 2 - 1;
    body.castShadow = body.receiveShadow = true;
    wall.add(body);
    for (let k = -1; k <= 1; k += 2) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.7, 1.15), stoneDark);
      merlon.position.set(k * w * 0.25, A.WALL_H + 0.35, 0);
      wall.add(merlon);
    }
    const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.02), rune);
    glyph.position.set(0, A.WALL_H * 0.55, 0.57);
    glyph.rotation.z = Math.PI / 4;
    wall.add(glyph);
    wall.userData.baseY = gy;
    wall.position.y = gy - A.WALL_H - 1.2; // enterrado
    g.add(wall);
    walls.push(wall);
    prims.push({ cx, cz, hx: w / 2, hz: 0.6, yaw, y0: gy - 2, y1: gy + A.WALL_H, wall: true, arenaWall: true });
  }
  // Losas de piedra en círculo (suelo de la arena).
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + 0.13;
    const r = 5 + (i % 3) * 3.5;
    const sx = x0 + Math.cos(a) * r;
    const sz = z0 + Math.sin(a) * r;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.1), stoneDark);
    slab.position.set(sx, groundAt(sx, sz) + 0.03, sz);
    slab.rotation.y = a;
    slab.receiveShadow = true;
    g.add(slab);
  }
  const golemSpots = [0, 1, 2, 3].map((i) => {
    const a = site.yaw + Math.PI / 4 + (i / 4) * Math.PI * 2;
    return { x: x0 + Math.cos(a) * A.GOLEM_R, z: z0 + Math.sin(a) * A.GOLEM_R };
  });
  return {
    group: g,
    node,
    ring1,
    ring2,
    nodeLight: light,
    walls,
    staticPrims: prims.filter((p) => !p.arenaWall),
    wallPrims: prims.filter((p) => p.arenaWall),
    golemSpots,
    center: { x: x0, z: z0, y: ground },
    /** Altura de los muros: 0 enterrados · 1 arriba. */
    setWalls(k) {
      for (const w of walls) w.position.y = w.userData.baseY - (1 - k) * (A.WALL_H + 1.2);
    },
    animate(t, taken) {
      node.visible = !taken;
      node.position.y = ground + 2.4 + Math.sin(t * 1.6) * 0.12;
      cube.rotation.set(t * 0.4, t * 0.6, 0);
      edges.rotation.copy(cube.rotation);
      ring1.rotation.set(t * 1.3, 0.4, t * 0.7);
      ring2.rotation.set(0.9 + t * 0.5, t * 1.1, 0);
    },
  };
}

/** El mini-nodo A1: un cubito con una anilla, que brilla. */
export function buildMiniNode() {
  const g = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x2ea8ff, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 28), new THREE.MeshBasicMaterial({ color: 0xbff4ff }));
  const light = new THREE.PointLight(0x6fd8ff, 0.9, 4, 2);
  g.add(cube, ring, light);
  g.userData.spin = (t) => {
    cube.rotation.set(t, t * 1.3, 0);
    ring.rotation.set(t * 2, 0.5, 0);
  };
  return g;
}

function wrap(a) {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
