import * as THREE from 'three';

/**
 * ItemModels — modelos low-poly de los objetos que se llevan en la mano.
 *
 * Convención de cada modelo: el puño agarra en el origen, el objeto se extiende
 * hacia +Y (el mango sube desde la mano) y la cara "útil" (filo del hacha, punta
 * del pico) mira hacia −Z. Quien lo coloca (mano en 3ª persona, vista en 1ª
 * persona) lo gira a su gusto.
 *
 * `buildItemModel(itemId, items)` → { group, kind, light? } o null si el objeto
 * no tiene modelo (se lleva la mano vacía). `kind` dice cómo se sostiene:
 *   'tool' | 'sword' | 'shield' (mano izquierda) | 'slingshot' | 'bow' | 'torch' | 'item'
 */
const mats = new Map();
function lambert(color, extra = {}) {
  const key = `${color}:${JSON.stringify(extra)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra }));
  return mats.get(key);
}

const WOOD = 0x8a5a32;
const WOOD_DARK = 0x5e3b1f;
const STONE = 0x9c978d;
const ROPE = 0xcbb68a;

function box(g, color, sx, sy, sz, x, y, z, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lambert(color, extra));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

function cyl(g, color, r0, r1, h, x, y, z, seg = 6, extra) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), lambert(color, extra));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

/** Mango de madera desde un poco por debajo del puño hasta `len` (algo curvo, con empuñadura). */
function handle(g, len, r = 0.022, color = WOOD, wrap = 0x5a3a24) {
  tube(g, color, [[0, -0.07, 0], [0, len * 0.3, 0.006], [0, len * 0.7, -0.004], [0, len, 0]], r, 6);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.32, 4, 8), lambert(wrap));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, -0.02 + i * 0.035, 0);
    g.add(ring);
  }
}

/** Tubo a lo largo de unos puntos (ramas, mangos curvos, palas del arco). */
function tube(g, color, pts, r, seg = 8, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, radial, false), lambert(color));
  g.add(m);
  return m;
}

/**
 * Pieza plana a partir de un contorno 2D (u, v): u hacia −Z (el filo, la punta), v hacia
 * +Y; `thick` de grosor en X, con el canto biselado.
 */
function plate(g, color, outline, thick, [x, y, z] = [0, 0, 0], bevel = 0.006) {
  const shape = new THREE.Shape();
  outline.forEach(([u, v, cu, cv], i) => {
    if (i === 0) shape.moveTo(u, v);
    else if (cu !== undefined) shape.quadraticCurveTo(cu, cv, u, v);
    else shape.lineTo(u, v);
  });
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0, -thick / 2);
  geo.rotateY(Math.PI / 2); // u → −Z, grosor → X
  const m = new THREE.Mesh(geo, lambert(color));
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

const BUILDERS = {
  axe(g, metal = STONE) {
    handle(g, 0.62);
    // Cabeza en cuña con el filo curvo hacia −Z y un talón detrás.
    plate(g, metal, [[-0.05, 0.05], [0.07, 0.055], [0.19, 0.11, 0.13, 0.085], [0.2, -0.07, 0.235, 0.02], [0.07, -0.05, 0.13, -0.065], [-0.05, -0.045], [-0.07, 0.0, -0.075, 0.03], [-0.05, 0.05, -0.075, -0.03]], 0.05, [0, 0.54, 0]);
    // Filo más claro.
    plate(g, 0xe2e4e6, [[0.17, 0.1], [0.205, -0.065, 0.235, 0.02], [0.19, -0.06], [0.16, 0.09, 0.2, 0.02]], 0.02, [0, 0.54, 0], 0.003);
    // Ataduras de cuero en cruz.
    for (const r of [0.6, -0.6]) {
      const b = box(g, ROPE, 0.065, 0.12, 0.02, 0, 0.54, 0.035);
      b.rotation.x = r;
    }
  },
  pickaxe(g, metal = STONE) {
    handle(g, 0.64);
    // Cabeza curva en media luna: punta larga delante (−Z), pico corto detrás.
    plate(g, metal, [[0.29, -0.06], [0, 0.09, 0.15, 0.08], [-0.24, -0.04, -0.14, 0.07], [0, 0.035, -0.12, 0.03], [0.29, -0.06, 0.14, 0.03]], 0.045, [0, 0.6, 0]);
    box(g, 0x5c5f63, 0.07, 0.09, 0.08, 0, 0.6, 0); // casquillo
    box(g, ROPE, 0.07, 0.035, 0.07, 0, 0.53, 0);
  },
  sword(g, blade = 0xb9bec4, guard = 0x5e4b3a, length = 0.72) {
    // Empuñadura con tiras de cuero, pomo y guarda curva.
    cyl(g, WOOD_DARK, 0.021, 0.024, 0.17, 0, 0.02, 0, 8);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 4, 8), lambert(0x3a2618));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, -0.045 + i * 0.04, 0);
      g.add(ring);
    }
    const pommel = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), lambert(guard));
    pommel.position.set(0, -0.085, 0);
    g.add(pommel);
    plate(g, guard, [[0.13, 0.03], [0.0, 0.0, 0.07, -0.01], [-0.13, 0.03, -0.07, -0.01], [-0.12, -0.005], [0, -0.03, -0.06, -0.035], [0.12, -0.005, 0.06, -0.035]], 0.04, [0, 0.11, 0], 0.004);
    // Hoja: ancha en la base, punta afilada, con acanaladura.
    const L = length;
    plate(g, blade, [[0.036, 0], [0.032, L - 0.13], [0, L], [-0.032, L - 0.13], [-0.036, 0]], 0.014, [0, 0.13, 0], 0.004);
    for (const s of [-1, 1]) box(g, 0x8d9298, 0.004, L * 0.7, 0.012, s * 0.0095, 0.13 + L * 0.38, 0);
  },
  shield(g, face = 0xb87333, rim = 0x6e4a2a) {
    // Escudo redondo de tablas: el brazo pasa por detrás (+Z), la cara mira a −Z.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16), lambert(face));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0.1, -0.06);
    g.add(disc);
    for (const x of [-0.17, -0.06, 0.06, 0.17]) box(g, new THREE.Color(face).multiplyScalar(0.7).getHex(), 0.008, 0.6 - Math.abs(x) * 0.9, 0.006, x, 0.1, -0.087);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 5, 16), lambert(rim));
    ring.position.set(0, 0.1, -0.06);
    g.add(ring);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert(rim));
    boss.rotation.x = -Math.PI / 2;
    boss.position.set(0, 0.1, -0.085);
    g.add(boss);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rivet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.012, 0), lambert(0xc9c2b2));
      rivet.position.set(Math.cos(a) * 0.29, 0.1 + Math.sin(a) * 0.29, -0.09);
      g.add(rivet);
    }
    for (const y of [-0.12, 0.32]) box(g, WOOD, 0.5, 0.04, 0.02, 0, y, -0.035);
  },
  slingshot(g) {
    // Horquilla de una rama (como la de la hoja de diseño): mango, dos brazos en Y,
    // gomas oscuras y la badana de cuero con una piedra.
    const wood = 0x8a4f2a;
    tube(g, wood, [[0, -0.09, 0], [0.004, 0.05, 0.003], [0, 0.16, 0]], 0.024, 6);
    for (const s of [-1, 1]) tube(g, wood, [[0, 0.15, 0], [s * 0.045, 0.22, 0], [s * 0.08, 0.3, 0], [s * 0.088, 0.37, 0]], 0.017, 8);
    for (const y of [-0.04, 0.0, 0.04]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 8), lambert(0x5a331c));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, y, 0);
      g.add(ring);
    }
    const bands = new THREE.Group();
    bands.name = 'bands';
    bands.position.set(0, 0.35, 0);
    for (const s of [-1, 1]) {
      const from = new THREE.Vector3(s * 0.088, 0, 0);
      const to = new THREE.Vector3(s * 0.025, 0, 0.06);
      const len = from.distanceTo(to);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, len), lambert(0x2e2a28));
      band.position.copy(from).add(to).multiplyScalar(0.5);
      band.lookAt(to.x, to.y, to.z);
      bands.add(band);
    }
    g.add(bands);
    const pouch = new THREE.Group();
    pouch.name = 'pouch';
    pouch.position.set(0, 0.35, 0.06);
    const leather = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.026, 0.016), lambert(0xb08a5a));
    pouch.add(leather);
    const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), lambert(0x8d8f93));
    stone.position.set(0, 0, -0.012);
    pouch.add(stone);
    g.add(pouch);
  },
  bow(g) {
    // Arco recurvado (en el plano YZ) con empuñadura de cuero; la cuerda detrás (+Z).
    const limb = [[0, -0.47, 0.17], [0, -0.42, 0.2], [0, -0.3, 0.08], [0, -0.13, -0.005], [0, 0, 0], [0, 0.13, -0.005], [0, 0.3, 0.08], [0, 0.42, 0.2], [0, 0.47, 0.17]];
    tube(g, WOOD, limb, 0.015, 24);
    cyl(g, 0x5a3a24, 0.024, 0.024, 0.13, 0, 0, 0, 8);
    const string = box(g, 0xe8e2d0, 0.005, 0.84, 0.005, 0, 0, 0.2);
    string.name = 'string';
  },
  torch(g) {
    handle(g, 0.42, 0.025, WOOD_DARK, 0x3a2618);
    // Cabeza de trapo enrollado y quemado.
    cyl(g, 0x5a4a38, 0.045, 0.035, 0.1, 0, 0.42, 0, 8);
    cyl(g, 0x1f1a16, 0.047, 0.045, 0.03, 0, 0.475, 0, 8);
    const flame = new THREE.Group();
    flame.name = 'flame';
    flame.position.set(0, 0.5, 0);
    const layer = (r, h, color, y, op) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), new THREE.MeshBasicMaterial({ color, transparent: op < 1, opacity: op, depthWrite: op >= 1 }));
      m.position.y = y;
      flame.add(m);
    };
    layer(0.065, 0.2, 0xff7a2a, 0.08, 0.85);
    layer(0.045, 0.14, 0xffb347, 0.06, 1);
    layer(0.025, 0.08, 0xfff1b0, 0.04, 1);
    g.add(flame);
  },
  arrow(g, tip = STONE) {
    cyl(g, WOOD, 0.008, 0.008, 0.6, 0, 0.3, 0, 5);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 4), lambert(tip));
    head.position.set(0, 0.64, 0);
    g.add(head);
    for (let i = 0; i < 3; i++) {
      const f = box(g, 0xf2f2ee, 0.004, 0.09, 0.035, 0, 0.06, 0);
      f.rotation.y = (i / 3) * Math.PI * 2;
      f.geometry.translate(0, 0, 0.018);
    }
    box(g, 0xb8342a, 0.02, 0.02, 0.02, 0, 0.0, 0); // culatín
  },
};

/**
 * Modelo de un objeto. Usa ITEMS[id].MODEL = { TYPE, COLOR?, ... } si existe.
 * @returns {{ group: THREE.Group, kind: string, light: THREE.PointLight|null } | null}
 */
export function buildItemModel(itemId, items) {
  const def = items?.[itemId];
  const M = def?.MODEL;
  if (!M || !BUILDERS[M.TYPE]) return null;
  const group = new THREE.Group();
  group.name = `held_${itemId}`;
  switch (M.TYPE) {
    case 'axe':
    case 'pickaxe':
      BUILDERS[M.TYPE](group, M.METAL ?? STONE);
      break;
    case 'sword':
      BUILDERS.sword(group, M.BLADE, M.GUARD, M.LENGTH);
      break;
    case 'shield':
      BUILDERS.shield(group, M.FACE, M.RIM);
      break;
    case 'arrow':
      BUILDERS.arrow(group, M.TIP);
      break;
    default:
      BUILDERS[M.TYPE](group);
  }
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  let light = null;
  if (M.TYPE === 'torch') {
    light = new THREE.PointLight(0xffa24a, 2.2, 14, 1.6);
    light.position.set(0, 0.6, 0);
    group.add(light);
  }
  const kind = { axe: 'tool', pickaxe: 'tool', sword: 'sword', shield: 'shield', slingshot: 'slingshot', bow: 'bow', torch: 'torch', arrow: 'item' }[M.TYPE];
  return { group, kind, light };
}

/** Parpadeo de la llama de una antorcha (si la hay en el modelo). */
export function flickerTorch(model, t) {
  if (!model?.light) return;
  const k = 0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.07;
  model.light.intensity = 2.2 * k;
  const flame = model.group.getObjectByName('flame');
  if (flame) flame.scale.set(1, 0.85 + k * 0.3, 1);
}
