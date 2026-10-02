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
const STONE = 0x8d8f93;
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

/** Mango de madera desde un poco por debajo del puño hasta `len`. */
function handle(g, len, r = 0.022, color = WOOD) {
  cyl(g, color, r, r * 1.1, len + 0.08, 0, len / 2 - 0.04, 0);
}

const BUILDERS = {
  axe(g, metal = STONE) {
    handle(g, 0.62);
    // Cabeza: bloque con el filo hacia −Z, atada con cuerda.
    box(g, metal, 0.05, 0.13, 0.17, 0, 0.54, -0.07);
    box(g, metal, 0.035, 0.17, 0.05, 0, 0.54, -0.17);
    box(g, ROPE, 0.06, 0.05, 0.06, 0, 0.47, 0);
    box(g, ROPE, 0.06, 0.05, 0.06, 0, 0.6, 0);
  },
  pickaxe(g, metal = STONE) {
    handle(g, 0.64);
    // Cabeza curva: dos puntas a los lados (−Z y +Z), más baja en las puntas.
    box(g, metal, 0.06, 0.07, 0.14, 0, 0.6, 0);
    const a = box(g, metal, 0.045, 0.05, 0.2, 0, 0.57, -0.15);
    a.rotation.x = -0.35;
    const b = box(g, metal, 0.045, 0.05, 0.2, 0, 0.57, 0.15);
    b.rotation.x = 0.35;
    box(g, ROPE, 0.06, 0.04, 0.06, 0, 0.52, 0);
  },
  sword(g, blade = 0xb9bec4, guard = 0x5e4b3a, length = 0.72) {
    cyl(g, WOOD_DARK, 0.022, 0.024, 0.16, 0, 0.02, 0);         // empuñadura
    box(g, guard, 0.06, 0.04, 0.034, 0, -0.07, 0);              // pomo
    box(g, guard, 0.05, 0.04, 0.24, 0, 0.12, 0);                // guarda
    box(g, blade, 0.018, length, 0.07, 0, 0.14 + length / 2, 0); // hoja
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), lambert(blade));
    tip.position.set(0, 0.14 + length + 0.05, 0);
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(0.36, 1, 1);
    g.add(tip);
  },
  shield(g, face = 0xb87333, rim = 0x6e4a2a) {
    // Escudo redondo: el brazo pasa por detrás (+Z), la cara mira a −Z.
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 10), lambert(face));
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0.1, -0.06);
    g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 4, 10), lambert(rim));
    ring.position.set(0, 0.1, -0.06);
    g.add(ring);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lambert(rim));
    boss.position.set(0, 0.1, -0.1);
    boss.scale.z = 0.6;
    g.add(boss);
    for (const y of [-0.12, 0.32]) box(g, WOOD, 0.5, 0.04, 0.02, 0, y + 0.0, -0.035);
  },
  slingshot(g) {
    handle(g, 0.2, 0.024, WOOD);
    // Horquilla en Y y goma.
    const l = cyl(g, WOOD, 0.018, 0.02, 0.18, -0.05, 0.27, 0);
    l.rotation.z = 0.45;
    const r = cyl(g, WOOD, 0.018, 0.02, 0.18, 0.05, 0.27, 0);
    r.rotation.z = -0.45;
    const band = box(g, 0x6b3a2a, 0.2, 0.012, 0.012, 0, 0.35, 0.02);
    band.name = 'band';
    box(g, 0x4a2a1e, 0.05, 0.03, 0.03, 0, 0.35, 0.06).name = 'pouch';
  },
  bow(g) {
    // Arco vertical (en el plano YZ) con la cuerda detrás (+Z).
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 4, 12, Math.PI * 0.8), lambert(WOOD));
    arc.rotation.z = Math.PI / 2 + Math.PI * 0.1;
    arc.rotation.y = -Math.PI / 2;
    arc.position.set(0, 0.0, 0.32);
    g.add(arc);
    box(g, WOOD_DARK, 0.05, 0.12, 0.05, 0, 0, -0.08); // empuñadura
    const string = box(g, 0xe8e2d0, 0.006, 0.78, 0.006, 0, 0, 0.22);
    string.name = 'string';
  },
  torch(g) {
    handle(g, 0.42, 0.025, WOOD_DARK);
    box(g, 0x2a2420, 0.07, 0.08, 0.07, 0, 0.42, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    flame.position.set(0, 0.53, 0);
    flame.name = 'flame';
    g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
    core.position.set(0, 0.5, 0);
    g.add(core);
  },
  arrow(g, tip = STONE) {
    cyl(g, WOOD, 0.008, 0.008, 0.6, 0, 0.3, 0, 4);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 4), lambert(tip));
    head.position.set(0, 0.63, 0);
    g.add(head);
    for (const a of [0, Math.PI / 2]) {
      const f = box(g, 0xf2f2ee, 0.005, 0.08, 0.04, 0, 0.04, 0);
      f.rotation.y = a;
    }
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
