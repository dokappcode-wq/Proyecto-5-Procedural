import * as THREE from 'three';

/**
 * Modelos del mercader (P8): su puesto de feria junto al Camino Real y él mismo.
 * Coordenadas del puesto: origen en el centro, mostrador a lo largo de X, el cliente
 * llega por +Z; el mercader está detrás (−Z).
 */
const mats = new Map();
function lambert(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
}
const box = new THREE.BoxGeometry(1, 1, 1);
const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const ball = new THREE.IcosahedronGeometry(1, 1);

function put(parent, geo, color, [x, y, z], [sx, sy, sz] = [1, 1, 1], rot = [0, 0, 0], extra) {
  const m = new THREE.Mesh(geo, lambert(color, extra));
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const WOOD = 0x8a5a32;
const WOOD_DARK = 0x5e3b20;
const CANVAS = [0xc8423a, 0xf1e6cc];

/**
 * Puesto: mostrador, toldo a rayas, cajas de fruta, sacos, barriles, carro y farolillo.
 * @returns {{ group, prims: object[], npc: { x, z, y, yaw }, lamp: THREE.Vector3 }}
 */
export function buildMerchantStall(site, groundAt) {
  const g = new THREE.Group();
  g.name = 'MerchantStall';
  const y0 = groundAt(site.x, site.z);
  g.position.set(site.x, y0, site.z);
  g.rotation.y = site.yaw ?? 0;
  // Tarima.
  put(g, box, WOOD_DARK, [0, 0.08, -0.4], [4.4, 0.16, 3.0]);
  // Mostrador con frente de tablas y encimera.
  put(g, box, WOOD, [0, 0.5, 0.5], [3.4, 0.84, 0.6]);
  put(g, box, 0xa5744a, [0, 0.95, 0.5], [3.6, 0.08, 0.75]);
  for (let i = 0; i < 6; i++) put(g, box, i % 2 ? WOOD : 0x93623a, [-1.42 + i * 0.57, 0.5, 0.81], [0.54, 0.8, 0.03]);
  // Postes y toldo a rayas (inclinado hacia delante).
  for (const x of [-1.9, 1.9]) for (const z of [0.85, -1.6]) put(g, cyl, WOOD_DARK, [x, z > 0 ? 1.15 : 1.35, z], [0.12, z > 0 ? 2.3 : 2.7, 0.12]);
  for (let i = 0; i < 9; i++) {
    put(g, box, CANVAS[i % 2], [-1.95 + i * 0.4875 + 0.24, 2.45, -0.35], [0.49, 0.04, 2.9], [0.14, 0, 0]);
  }
  for (let i = 0; i < 9; i++) put(g, box, CANVAS[i % 2], [-1.95 + i * 0.4875 + 0.24, 2.12, 1.09], [0.49, 0.36, 0.03]); // faldón
  // Género en el mostrador: cajas de fruta, panes, frascos.
  const crate = (x, z, fruit) => {
    put(g, box, WOOD, [x, 1.07, z], [0.5, 0.16, 0.36]);
    for (let i = 0; i < 6; i++) put(g, ball, fruit, [x - 0.17 + (i % 3) * 0.17, 1.18, z - 0.08 + Math.floor(i / 3) * 0.16], [0.07, 0.07, 0.07]);
  };
  crate(-1.2, 0.5, 0xd8342a);
  crate(-0.6, 0.5, 0xec7a24);
  crate(1.25, 0.5, 0x7fbf3a);
  for (let i = 0; i < 3; i++) put(g, ball, 0xc89a5a, [0.2 + i * 0.22, 1.04, 0.45], [0.1, 0.06, 0.16], [0, 0.3, 0]);
  for (const [x, c] of [[0.85, 0xff4f7a], [0.95, 0x62c24a], [0.75, 0x9c7bff]]) put(g, cyl, c, [x, 1.08, 0.7], [0.08, 0.18, 0.08]);
  // Sacos, barriles y cajas apiladas detrás.
  for (const [x, z] of [[-1.6, -1.2], [-1.25, -1.35]]) put(g, ball, 0xc9b089, [x, 0.42, z], [0.28, 0.34, 0.26]);
  for (const [x, z] of [[1.5, -1.1], [1.1, -1.4]]) {
    put(g, cyl, WOOD, [x, 0.55, z], [0.6, 0.8, 0.6]);
    put(g, cyl, 0x4a4f55, [x, 0.75, z], [0.62, 0.05, 0.62]);
  }
  put(g, box, WOOD, [1.6, 0.4, 0.1], [0.5, 0.5, 0.5], [0, 0.3, 0]);
  put(g, box, 0x93623a, [1.6, 0.85, 0.1], [0.4, 0.4, 0.4], [0, -0.2, 0]);
  // Farolillo colgado del toldo.
  put(g, cyl, 0x3e4348, [-1.6, 2.0, 0.95], [0.18, 0.04, 0.18]);
  put(g, cyl, 0xffd38a, [-1.6, 1.85, 0.95], [0.14, 0.22, 0.14], [0, 0, 0], { emissive: 0xffb050, emissiveIntensity: 0.8 });
  // Letrero.
  put(g, box, WOOD_DARK, [2.3, 1.1, 1.0], [0.06, 2.2, 0.06]);
  put(g, box, 0xe8dcc0, [2.3, 1.9, 1.0], [0.06, 0.5, 0.8], [0, 0, 0]);
  put(g, ball, 0xd9b75a, [2.34, 1.9, 1.0], [0.02, 0.12, 0.12]);

  const local = (lx, lz) => {
    const c = Math.cos(g.rotation.y);
    const s = Math.sin(g.rotation.y);
    return [site.x + lx * c + lz * s, site.z - lx * s + lz * c];
  };
  const [cx, cz] = local(0, 0.5);
  const [bx, bz] = local(0, -1.0);
  const prims = [
    { kind: 'box', cx, cz, hx: 1.8, hz: 0.38, yaw: g.rotation.y, y0: y0, y1: y0 + 1.0, wall: true },
    { kind: 'box', cx: bx, cz: bz, hx: 2.2, hz: 0.7, yaw: g.rotation.y, y0: y0, y1: y0 + 1.0, wall: true },
  ];
  const [nx, nz] = local(0, -0.2);
  const [lx, lz] = local(-1.6, 0.95);
  return { group: g, prims, npc: { x: nx, z: nz, y: y0 + 0.16, yaw: g.rotation.y }, lamp: new THREE.Vector3(lx, y0 + 1.85, lz) };
}

/** El mercader: sombrero de ala ancha, chaleco, delantal, barba y una bolsa de monedas. */
export function buildMerchant() {
  const g = new THREE.Group();
  g.name = 'Merchant';
  const body = new THREE.Group();
  g.add(body);
  put(body, cyl, 0x4a5a8a, [0, 0.45, 0], [0.34, 0.9, 0.28]); // calzas
  put(body, cyl, 0xe8dcc0, [0, 1.15, 0], [0.42, 0.55, 0.3]); // camisa
  put(body, box, 0x7a3b2a, [0, 1.15, 0.02], [0.44, 0.5, 0.3]); // chaleco
  put(body, box, 0xd9cfb3, [0, 0.82, 0.14], [0.4, 0.5, 0.03]); // delantal
  put(body, ball, 0xd9b75a, [0.2, 0.95, 0.12], [0.07, 0.08, 0.06]); // bolsa
  const head = new THREE.Group();
  head.position.set(0, 1.55, 0);
  body.add(head);
  put(head, ball, 0xd9a98a, [0, 0, 0], [0.13, 0.15, 0.13]);
  put(head, ball, 0x6b4a2e, [0, -0.08, 0.07], [0.12, 0.08, 0.07]); // barba
  put(head, ball, 0xc9907a, [0, 0.0, 0.13], [0.03, 0.04, 0.04]); // nariz
  for (const x of [-0.05, 0.05]) put(head, ball, 0x1a1410, [x, 0.04, 0.115], [0.015, 0.017, 0.01]);
  put(head, cyl, 0x5a3d26, [0, 0.12, 0], [0.5, 0.03, 0.5]); // ala
  put(head, cyl, 0x5a3d26, [0, 0.2, 0], [0.26, 0.16, 0.26]); // copa
  put(head, cyl, 0xc8423a, [0, 0.15, 0], [0.27, 0.04, 0.27]); // cinta
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.27, 1.35, 0);
    body.add(arm);
    put(arm, cyl, 0xe8dcc0, [0, -0.22, 0], [0.1, 0.45, 0.1]);
    put(arm, ball, 0xd9a98a, [0, -0.48, 0], [0.05, 0.06, 0.05]);
    arms.push(arm);
  }
  return {
    group: g,
    animate(t, talking = false) {
      body.scale.y = 1 + Math.sin(t * 1.8) * 0.008;
      head.rotation.y = Math.sin(t * 0.6) * 0.3;
      head.rotation.x = Math.sin(t * 0.9) * 0.05;
      const wave = talking ? Math.sin(t * 6) * 0.5 : 0;
      arms[0].rotation.x = -0.2 + Math.sin(t * 1.3) * 0.05;
      arms[1].rotation.x = -0.3 - Math.abs(wave);
      arms[1].rotation.z = 0.2 + wave * 0.3;
    },
  };
}
