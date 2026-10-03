import * as THREE from 'three';
import { BUILD_MODELS, toGeometry } from '../construction/BuildModels.js';
import { LAB, toWorldLab } from './LabLayout.js';

/**
 * ResearchCenter — el centro de investigación abandonado (segunda parte de la historia).
 *
 *   Planta (ejes locales: +z = fachada con la puerta):
 *     pasillo central de la puerta al fondo, y cuatro salas a los lados:
 *       A laboratorio (mesas, monitores, pizarra)     C taller (mesa de elaboración ya montada)
 *       B dormitorio (literas, taquillas)             D búnker (trampilla abierta → la mazmorra)
 *   La puerta de entrada tiene un teclado: la abre la IA (contraseña).
 *
 * La planta (puerta, trampilla, rumbo de la mazmorra) está en LabLayout.js.
 */
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export function buildResearchCenter(site, ground, { textColor = '#4fb6ff' } = {}) {
  const L = LAB;
  const g = new THREE.Group();
  g.name = 'ResearchCenter';
  g.position.set(site.x, ground, site.z);
  g.rotation.y = site.yaw;
  const wallM = lambert(0xc9ccc8);
  const wallDark = lambert(0x8d918f);
  const floorM = lambert(0x5d6366);
  const metal = lambert(0x6f7679);
  const stripe = lambert(0xe2b93b);
  const prims = [];
  const world = (lx, lz) => toWorldLab(site, lx, lz);
  // Caja local (cx, cz, w, d) → mesh + primitiva de colisión.
  const box = (mat, lx, ly, lz, w, h, d, { wall = true, walk = false, roof = false, collide = true } = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(lx, ly, lz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    if (collide) {
      const p = world(lx, lz);
      prims.push({ cx: p.x, cz: p.z, hx: w / 2, hz: d / 2, yaw: site.yaw, y0: ground + ly - h / 2, y1: ground + ly + h / 2, wall, walk, roof });
    }
    return m;
  };
  const W2 = L.W / 2;
  const D2 = L.D / 2;
  const H = L.H;
  const T = L.WALL;
  // Muros exteriores (con hueco de la puerta delante).
  box(wallM, -W2 / 2 - 1.0, H / 2, D2, W2 - 2, H, T);
  box(wallM, W2 / 2 + 1.0, H / 2, D2, W2 - 2, H, T);
  box(wallDark, 0, H - 0.4, D2, 2.2, 0.8, T); // dintel
  box(wallM, 0, H / 2, -D2, L.W, H, T);
  box(wallM, -W2, H / 2, 0, T, H, L.D);
  box(wallM, W2, H / 2, 0, T, H, L.D);
  // Tejado plano y cornisa.
  box(wallDark, 0, H + 0.15, 0, L.W + 0.6, 0.3, L.D + 0.6, { wall: false, roof: true });
  // Muros del pasillo con una puerta a cada sala (y un muro entre las salas de cada lado).
  const C = L.CORR;
  for (const sx of [-1, 1]) {
    // Pasillo: tramos con huecos de puerta en z = 4.5 y z = -4.5.
    for (const [z0, z1] of [[-D2, -5.3], [-3.7, 3.7], [5.3, D2]]) box(wallDark, sx * C, H / 2, (z0 + z1) / 2, T, H, z1 - z0);
    // Separación entre salas (z = 0.5), con su lado de pasillo.
    box(wallM, sx * (C + (W2 - C) / 2), H / 2, 0.5, W2 - C, H, T);
  }
  // Suelo interior (menos en el búnker, donde está la trampilla sobre la tierra).
  const slab = (lx, lz, w, d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), floorM);
    m.position.set(lx, 0.03, lz);
    m.receiveShadow = true;
    g.add(m);
  };
  slab(0, 0, C * 2, L.D);
  slab(-(C + W2) / 2, (0.5 + D2) / 2, W2 - C, D2 - 0.5);
  slab(-(C + W2) / 2, (-D2 + 0.5) / 2, W2 - C, D2 + 0.5);
  slab((C + W2) / 2, (0.5 + D2) / 2, W2 - C, D2 - 0.5);
  // Luces del techo (paneles que brillan; alguno parpadea).
  const panels = [];
  const panelM = new THREE.MeshBasicMaterial({ color: 0xe9f4ff });
  for (const [lx, lz] of [[0, 6], [0, 0], [0, -6], [-7, 5], [-7, -4.5], [7, 5], [7, -4.5]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.5), panelM.clone());
    p.position.set(lx, H - 0.03, lz);
    g.add(p);
    panels.push(p);
  }
  const lamp = (lx, lz, i) => {
    const l = new THREE.PointLight(0xdfeeff, i, 12, 2);
    l.position.set(lx, H - 0.4, lz);
    g.add(l);
    return l;
  };
  const lights = [lamp(0, 2, 0.9), lamp(-7, 3, 0.6), lamp(7, 3, 0.6), lamp(7, -4.5, 0.35)];
  // ---- Sala A: laboratorio ----
  const deskM = lambert(0xb7b9b4);
  const screenM = new THREE.MeshBasicMaterial({ color: textColor });
  for (const [lx, lz] of [[-6, 6.5], [-10, 6.5], [-6, 3], [-10, 3]]) {
    box(deskM, lx, 0.45, lz, 2.2, 0.9, 1.0, { walk: true, wall: true });
    box(metal, lx - 0.5, 1.15, lz - 0.2, 0.7, 0.5, 0.06, { collide: false });
    const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), screenM);
    sc.position.set(lx - 0.5, 1.15, lz - 0.16);
    g.add(sc);
  }
  // Pizarra con letras.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), new THREE.MeshBasicMaterial({ map: textTexture(['PROYECTO NODO', 'A1 → torre (custodia)', 'NODO → pedestal', 'Golems: NO acercarse'], '#1b2a1f', '#d8f0d8') }));
  board.position.set(-W2 + 0.2, 1.8, 4.6);
  board.rotation.y = Math.PI / 2;
  g.add(board);
  // ---- Sala B: dormitorio ----
  const bunk = lambert(0x6d7f8a);
  for (const lz of [-2.5, -6.5]) {
    box(bunk, -10.5, 0.4, lz, 2.0, 0.8, 1.0);
    box(bunk, -10.5, 1.6, lz, 2.0, 0.15, 1.0, { collide: false });
    box(metal, -11.4, 1.0, lz, 0.1, 2.0, 1.0, { collide: false });
  }
  box(lambert(0x48606e), -4, 1, -8.4, 2.4, 2, 0.5); // taquillas
  // ---- Sala C: taller con la mesa de elaboración ----
  const wbGeo = toGeometry(BUILD_MODELS.WORKBENCH());
  const wb = new THREE.Mesh(wbGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  wb.position.set(8, 0, 6);
  wb.rotation.y = Math.PI;
  wb.castShadow = true;
  g.add(wb);
  const wbw = world(8, 6);
  prims.push({ cx: wbw.x, cz: wbw.z, hx: 1.1, hz: 0.6, yaw: site.yaw, y0: ground, y1: ground + 1.0, wall: true });
  box(lambert(0x7a5a36), 11.5, 0.5, 2.2, 1.6, 1.0, 1.0); // cajas
  box(lambert(0x7a5a36), 11.2, 1.3, 2.4, 1.0, 0.6, 0.8);
  // ---- Sala D: búnker con la trampilla abierta ----
  const hatchL = LAB.HATCH;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.18, 6, 20), stripe);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(hatchL.x, 0.08, hatchL.z);
  g.add(rim);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.18, 18), metal);
  lid.position.set(hatchL.x - 2.1, 0.9, hatchL.z);
  lid.rotation.z = 1.2;
  g.add(lid);
  // Bandas de peligro en el suelo y un cartel.
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.18), i % 2 ? stripe : lambert(0x1d1d1d));
    b.position.set(hatchL.x - 2.6 + i * 0.5, 0.02, hatchL.z + 2.4);
    g.add(b);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(['BÚNKER', 'Acceso restringido'], '#3a2a10', '#ffd27a') }));
  sign.position.set(W2 - 0.2, 2.1, -4.2);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  // ---- Puerta de entrada con teclado ----
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, H - 0.8, 0.2), lambert(0x59666e));
  door.position.set(0, (H - 0.8) / 2, D2);
  door.castShadow = true;
  g.add(door);
  const dp = world(0, D2);
  const doorPrim = { cx: dp.x, cz: dp.z, hx: 1.05, hz: 0.2, yaw: site.yaw, y0: ground, y1: ground + H - 0.8, wall: true };
  const keypad = new THREE.Group();
  keypad.position.set(1.6, 1.35, D2 + 0.2);
  keypad.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.08), metal));
  const kpCanvas = document.createElement('canvas');
  kpCanvas.width = 128;
  kpCanvas.height = 64;
  const kpTex = new THREE.CanvasTexture(kpCanvas);
  const kpScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), new THREE.MeshBasicMaterial({ map: kpTex }));
  kpScreen.position.set(0, 0.12, 0.045);
  keypad.add(kpScreen);
  g.add(keypad);
  const drawKeypad = (text, color = '#ff5b4f') => {
    const c = kpCanvas.getContext('2d');
    c.fillStyle = '#071018';
    c.fillRect(0, 0, 128, 64);
    c.fillStyle = color;
    c.font = 'bold 34px monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 64, 34);
    kpTex.needsUpdate = true;
  };
  drawKeypad('----');
  // Notas en el suelo.
  const notes = [
    { l: [-8, 1.8], text: 'Día 212. El nodo no responde sin la clave A1. Se la dejamos al viejo de la torre: nadie sube hasta allí.' },
    { l: [6.5, -7.8], text: 'BÚNKER. La cueva de abajo es antigua. Algo enorme duerme al fondo, junto a las cascadas. Dejamos el cofre N con las baterías de repuesto y salimos corriendo.' },
  ].map((n) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.4), lambert(0xf2efe2));
    m.position.set(n.l[0], 0.08, n.l[1]);
    m.rotation.y = 0.4;
    g.add(m);
    const w = world(n.l[0], n.l[1]);
    return { x: w.x, z: w.z, y: ground + 0.1, text: n.text };
  });
  g.traverse((o) => {
    if (o.isMesh && o.material?.type === 'MeshLambertMaterial') o.receiveShadow = true;
  });
  return {
    group: g,
    prims,
    doorPrim,
    door,
    lights,
    panels,
    drawKeypad,
    notes,
    keypad: { ...world(1.6, D2 + 0.35), y: ground + 1.35 },
    workbench: { ...world(8, 6), y: ground + 0.9 },
    hatch: { ...world(hatchL.x, hatchL.z), y: ground },
    entrance: world(0, D2 + 3),
  };
}

function textTexture(lines, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, 512, 200);
  x.fillStyle = fg;
  x.font = 'bold 34px sans-serif';
  lines.forEach((l, i) => x.fillText(l, 20, 48 + i * 44));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
