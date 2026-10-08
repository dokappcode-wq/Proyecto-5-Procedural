import * as THREE from 'three';
import { BUILD_MODELS, toGeometry } from '../construction/BuildModels.js';
import { buildItemModel } from '../render/ItemModels.js';

/**
 * Dungeon — lo que hay dentro de la mazmorra (la cueva DUNGEON de CaveSystem):
 *   - cristales que brillan a lo largo del túnel (algo de luz para orientarse);
 *   - en las dos cámaras, construcciones abandonadas (andamios, cajas, un muro roto) y
 *     tres gólems dormidos en cada una;
 *   - la gran sala del fondo: cascadas que caen del techo a unas pozas, el «Cofre N»
 *     al final, un tirachinas en el suelo cerca de la entrada y las rocas que taparán la
 *     salida cuando despierte el gólem gigante.
 */
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export function buildDungeon(cave, items) {
  const g = new THREE.Group();
  g.name = 'Dungeon';
  const nodes = cave.nodes;
  const wood = lambert(0x6b4a2b);
  const woodDark = lambert(0x4a3420);
  const rock = lambert(0x6b665f);
  const crystalM = new THREE.MeshLambertMaterial({ color: 0x5fd8ff, emissive: 0x2a8ab8, flatShading: true });
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const add = (geo, mat, [x, y, z], [sx, sy, sz] = [1, 1, 1], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.rotation.set(...rot);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dirAt = (i) => {
    const a = nodes[Math.max(0, i - 1)];
    const b = nodes[Math.min(nodes.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: (b.x - a.x) / l, z: (b.z - a.z) / l };
  };
  // Cristales en las paredes del túnel.
  for (let i = 3; i < cave.arenaStart; i += 2) {
    const n = nodes[i];
    const d = dirAt(i);
    const s = i % 4 === 1 ? 1 : -1;
    const x = n.x - d.z * s * n.r * 0.62;
    const z = n.z + d.x * s * n.r * 0.62;
    add(new THREE.OctahedronGeometry(1), crystalM, [x, n.floor + 0.35, z], [0.2, 0.55, 0.2], [0.3 * s, i, 0.2]);
    add(new THREE.OctahedronGeometry(1), crystalM, [x + d.x * 0.3, n.floor + 0.25, z + d.z * 0.3], [0.13, 0.35, 0.13], [-0.4, i * 2, 0]);
  }
  // Cámaras: construcciones abandonadas y sitio para tres gólems.
  const golemSpots = [];
  const lights = [];
  const falls = [];
  for (const ci of cave.chambers) {
    const n = nodes[ci];
    const d = dirAt(ci);
    const side = { x: -d.z, z: d.x };
    const at = (f, s) => [n.x + d.x * f + side.x * s, n.floor, n.z + d.z * f + side.z * s];
    // Andamio de madera contra una pared.
    const [ax, ay, az] = at(-1.5, 3.2);
    const yaw = Math.atan2(d.x, d.z);
    for (const k of [-1, 1]) for (const j of [-1, 1]) add(boxGeo, wood, [ax + d.x * k * 1.2 + side.x * j * 0.6, ay + 1.5, az + d.z * k * 1.2 + side.z * j * 0.6], [0.15, 3, 0.15]);
    add(boxGeo, woodDark, [ax, ay + 1.6, az], [1.4, 0.1, 2.8], [0, yaw, 0]);
    add(boxGeo, woodDark, [ax, ay + 2.9, az], [1.4, 0.1, 2.8], [0.1, yaw, 0.05]);
    // Cajas, un barril y un muro roto.
    const [bx, by, bz] = at(1.8, -3.3);
    add(boxGeo, wood, [bx, by + 0.4, bz], [0.8, 0.8, 0.8], [0, 0.3, 0]);
    add(boxGeo, wood, [bx + 0.5, by + 1.1, bz - 0.2], [0.6, 0.6, 0.6], [0, 0.8, 0]);
    add(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 8), woodDark, [bx - 0.9, by + 0.45, bz + 0.6]);
    const [wx, wy, wz] = at(3.2, 1.2);
    for (let k = 0; k < 4; k++) add(boxGeo, rock, [wx + side.x * k * 0.8, wy + 0.4 + (k % 2) * 0.1, wz + side.z * k * 0.8], [0.75, 0.8 - k * 0.12, 0.4], [0, yaw, 0]);
    // Un farol apagado y una lámpara de cristal.
    add(new THREE.OctahedronGeometry(1), crystalM, [n.x, n.floor + 0.6, n.z], [0.35, 0.9, 0.35]);
    const l = new THREE.PointLight(0x6fd8ff, 1.4, 16, 1.6);
    l.position.set(n.x, n.floor + 2.5, n.z);
    g.add(l);
    lights.push(l);
    for (const [f, s] of [[0, 2.2], [-2.4, -1.5], [2.2, -0.2]]) {
      const [x, , z] = at(f, s);
      golemSpots.push({ x, z, y: n.floor });
    }
  }
  // La sala del fondo (según la hoja de diseño): un altar redondo de piedra en el centro,
  // agua alrededor, cataratas en las cuatro esquinas, el techo abierto por el que entra
  // la luz del sol, ruinas y muros bajos (cobertura contra las rocas y el láser).
  const arenaNodes = nodes.slice(cave.arenaStart);
  const first = arenaNodes[0];
  const last = arenaNodes[arenaNodes.length - 1];
  const len = Math.hypot(last.x - first.x, last.z - first.z) || 1;
  const dir = { x: (last.x - first.x) / len, z: (last.z - first.z) / len };
  const side = { x: -dir.z, z: dir.x };
  const floor = Math.min(...arenaNodes.map((n) => n.floor));
  const center = { x: (first.x + last.x) / 2, z: (first.z + last.z) / 2, y: floor };
  const R = first.r;
  const halfW = R * (first.w ?? 1) * 0.58; // anchura caminable
  const yaw = Math.atan2(dir.x, dir.z);
  const P = (f, s2) => ({ x: center.x + dir.x * f + side.x * s2, z: center.z + dir.z * f + side.z * s2 });
  const arenaFx = buildArenaScene(g, { center, floor, dir, side, len, R, halfW, yaw, P, add, rock });
  lights.push(...arenaFx.lights);
  // El Cofre N, en la parte de delante del altar (el gólem duerme detrás).
  const ALT = arenaFx.altar;
  const cp = P(-ALT.top * 0.62, 0);
  const chestPos = { x: cp.x, z: cp.z, y: floor + ALT.height };
  const chest = new THREE.Mesh(toGeometry(BUILD_MODELS.CHEST()), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  chest.position.set(chestPos.x, chestPos.y, chestPos.z);
  chest.rotation.y = Math.atan2(-dir.x, -dir.z);
  chest.castShadow = true;
  g.add(chest);
  const nSign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: letterTexture('N'), transparent: true }));
  nSign.position.set(chestPos.x - dir.x * 0.55, chestPos.y + 0.55, chestPos.z - dir.z * 0.55);
  nSign.rotation.y = Math.atan2(-dir.x, -dir.z);
  g.add(nSign);
  // El tirachinas, en el suelo junto a la entrada de la sala.
  const slingPos = { x: first.x - dir.x * 2.5 + side.x * 3.5, z: first.z - dir.z * 2.5 + side.z * 3.5, y: floor };
  const slingModel = buildItemModel('SLINGSHOT', items);
  const sling = new THREE.Group();
  if (slingModel) {
    slingModel.group.rotation.set(Math.PI / 2, 0, 0.6);
    slingModel.group.scale.setScalar(1.6);
    sling.add(slingModel.group);
  }
  sling.position.set(slingPos.x, floor + 0.12, slingPos.z);
  add(ico, rock, [slingPos.x, floor + 0.08, slingPos.z], [0.7, 0.12, 0.6]);
  g.add(sling);
  // Rocas que taparán la salida (escondidas en el techo hasta entonces).
  const gate = nodes[cave.arenaStart - 1];
  const barrier = new THREE.Group();
  const rocks = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4;
    const r = new THREE.Mesh(ico, rock);
    const s = 0.9 + (i % 3) * 0.35;
    r.scale.set(s * 1.2, s, s);
    r.castShadow = true;
    r.userData.rest = new THREE.Vector3(gate.x + Math.cos(a) * (i % 4) * 0.6, gate.floor + 0.6 + Math.floor(i / 3) * 1.3, gate.z + Math.sin(a) * (i % 4) * 0.6);
    r.userData.delay = i * 0.12;
    rocks.push(r);
    barrier.add(r);
  }
  barrier.visible = false;
  g.add(barrier);
  return {
    group: g,
    golemSpots,
    lights,
    falls,
    chest: chestPos,
    sling: { ...slingPos, mesh: sling },
    barrier: {
      group: barrier,
      rocks,
      prim: { x: gate.x, z: gate.z, r: gate.r + 0.4, y0: gate.floor - 1, y1: gate.floor + 6, wall: true },
      at: { x: gate.x, z: gate.z, y: gate.floor },
    },
    arena: { center, radius: R, halfW, floor, dir, side, len, entrance: { x: first.x, z: first.z }, altar: ALT, cover: arenaFx.cover, altarPrims: arenaFx.altarPrims, groundAt: arenaFx.groundAt },
    /** k: 0 en el techo · 1 apiladas tapando el paso. */
    setBarrier(k, t = 1) {
      barrier.visible = k > 0;
      for (const r of rocks) {
        const u = Math.max(0, Math.min(1, (t - r.userData.delay) / 0.8));
        const kk = Math.min(k, u);
        r.position.copy(r.userData.rest);
        r.position.y += (1 - kk) * 14;
      }
    },
    animate(t, k = {}) {
      arenaFx.animate(t, k);
      for (const f of falls) {
        f.tex.offset.y = -t * 1.6;
        f.foam.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
      }
      sling.rotation.y = 0;
    },
  };
}

function waterTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(160,215,255,0.55)';
  x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + (i % 5) * 0.1})`;
    x.fillRect((i * 37) % 64, (i * 53) % 256, 2 + (i % 3), 18 + (i % 7) * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 3);
  return t;
}

function letterTexture(ch) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e8c35a';
  x.beginPath();
  x.arc(32, 32, 30, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#3a2410';
  x.font = 'bold 44px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(ch, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Escenario de la sala del gólem gigante (vista general de la hoja de diseño): altar
 * redondo con escalones en el centro, agua alrededor (y debajo), cuatro cataratas en las
 * esquinas con su corriente hacia el altar, el techo abierto con haces de luz, columnas
 * en ruinas y cuatro muros bajos que sirven de cobertura.
 * @returns {{ lights, altar, cover, altarPrims, groundAt, animate }}
 */
function buildArenaScene(g, { center, floor, dir, side, len, R, halfW, yaw, P, add, rock }) {
  const lights = [];
  const anim = [];
  const ALT = { x: center.x, z: center.z, top: 5.6, height: 1.2, outer: 7.4, steps: [[7.4, 0.4], [6.5, 0.8], [5.6, 1.2]] };
  const rng = seeded(97);
  const ico = new THREE.IcosahedronGeometry(1, 1);
  const moss = lambert(0x5b7d30);
  const stoneTop = lambert(0x9a968b);
  const stoneSide = lambert(0x7f7b71);
  const stoneDark = lambert(0x66625a);

  // ---- Agua: una lámina que cubre toda la sala (el altar sale de ella) y el fondo de la poza.
  const waterY = floor + 0.28;
  const ripple = rippleTexture();
  ripple.repeat.set(5, 6);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry((halfW + 0.9) * 2, len, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x2b8fae, emissive: 0x0b3346, specular: 0xd8f4ff, shininess: 90, map: ripple, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  water.position.set(center.x, waterY, center.z);
  water.rotation.y = yaw;
  water.renderOrder = 2;
  g.add(water);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry((halfW + 0.9) * 2, len).rotateX(-Math.PI / 2), lambert(0x1f5664));
  bed.position.set(center.x, floor + 0.03, center.z);
  bed.rotation.y = yaw;
  g.add(bed);
  anim.push((t) => {
    ripple.offset.set(t * 0.02, t * 0.035);
  });

  // ---- Altar: tres gradas de piedra (se suben sin saltar), relieves y runas en lo alto.
  const altarPrims = [];
  for (const [r, h] of ALT.steps) {
    const geo = new THREE.CylinderGeometry(r, r + 0.12, h + 0.3, 36);
    const m = new THREE.Mesh(geo, [stoneSide, stoneTop, stoneSide]);
    m.position.set(center.x, floor + (h - 0.3) / 2, center.z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    altarPrims.push({ x: center.x, z: center.z, r, y0: floor - 1, y1: floor + h, walk: true });
  }
  // Losas: juntas oscuras en la grada de arriba (anillos y radios).
  const seam = new THREE.MeshBasicMaterial({ color: 0x55524b });
  for (const rr of [2.3, 4.0]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(rr - 0.05, rr + 0.05, 48).rotateX(-Math.PI / 2), seam);
    ring.position.set(center.x, floor + ALT.height + 0.012, center.z);
    g.add(ring);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 3.2), seam);
    bar.position.set(center.x + Math.cos(a) * 4.0, floor + ALT.height + 0.012, center.z + Math.sin(a) * 4.0);
    bar.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
    g.add(bar);
  }
  // Runas que se encienden cuando despierta el guardián.
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
  const runes = new THREE.Group();
  const runeRing = new THREE.Mesh(new THREE.RingGeometry(3.05, 3.25, 64).rotateX(-Math.PI / 2), runeMat);
  runes.add(runeRing);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.5 + (i % 3) * 0.15).rotateX(-Math.PI / 2), runeMat);
    glyph.position.set(Math.cos(a) * 3.65, 0, Math.sin(a) * 3.65);
    glyph.rotation.y = -a;
    runes.add(glyph);
  }
  runes.position.set(center.x, floor + ALT.height + 0.02, center.z);
  g.add(runes);
  // Relieves en el borde de la grada alta (paneles tallados).
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.12), stoneDark);
    panel.position.set(center.x + Math.cos(a) * (ALT.top + 0.07), floor + 1.0, center.z + Math.sin(a) * (ALT.top + 0.07));
    panel.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)) + Math.PI / 2;
    g.add(panel);
  }
  // Musgo y piedras sueltas en las gradas.
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2;
    const [r, h] = ALT.steps[Math.floor(rng() * 3)];
    const rr = r - 0.4 - rng() * 0.4;
    const m = new THREE.Mesh(ico, i % 3 ? moss : stoneSide);
    m.position.set(center.x + Math.cos(a) * rr, floor + h + 0.02, center.z + Math.sin(a) * rr);
    m.scale.set(0.35 + rng() * 0.5, 0.06 + (i % 3 ? 0 : 0.12), 0.3 + rng() * 0.4);
    m.rotation.y = rng() * 3;
    g.add(m);
  }

  // ---- Cobertura: muros bajos en ruinas en el agua (diagonales) y columnas rotas.
  const cover = [];
  for (const k of [0, 1, 2, 3]) {
    const a = Math.atan2(side.z, side.x) + Math.PI / 4 + (k * Math.PI) / 2;
    const rr = ALT.outer + 2.4;
    const cx = center.x + Math.cos(a) * rr;
    const cz = center.z + Math.sin(a) * rr;
    const wy = Math.atan2(-Math.cos(a), -Math.sin(a));
    const wall = new THREE.Group();
    wall.position.set(cx, floor, cz);
    wall.rotation.y = wy;
    for (let j = 0; j < 3; j++) {
      const h = [1.55, 1.25, 0.9][j];
      const blk = new THREE.Mesh(new THREE.BoxGeometry(1.05, h, 0.8), j % 2 ? stoneSide : stoneDark);
      blk.position.set((j - 1) * 1.07, h / 2, 0);
      blk.rotation.y = (rng() - 0.5) * 0.1;
      blk.castShadow = blk.receiveShadow = true;
      wall.add(blk);
    }
    const cap = new THREE.Mesh(ico, moss);
    cap.position.set(-0.6, 1.58, 0);
    cap.scale.set(0.6, 0.08, 0.4);
    wall.add(cap);
    const fallen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), stoneSide);
    fallen.position.set(1.9, 0.25, 0.6);
    fallen.rotation.set(0.1, 0.5, 0.2);
    wall.add(fallen);
    g.add(wall);
    cover.push({ cx, cz, hx: 1.65, hz: 0.42, yaw: wy, y0: floor - 1, y1: floor + 1.5, wall: true });
  }
  // Columnas en ruinas junto a las paredes (también chocan).
  for (const [f, s2] of [[-0.42, -0.85], [-0.42, 0.85], [0.05, -0.92], [0.05, 0.92], [0.45, -0.8], [0.45, 0.8]]) {
    const p = P(len * f, halfW * s2);
    const h = 3 + rng() * 4;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 10), stoneSide);
    col.position.set(p.x, floor + h / 2, p.z);
    col.castShadow = col.receiveShadow = true;
    g.add(col);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), stoneDark);
    capital.position.set(p.x, floor + 0.17, p.z);
    g.add(capital);
    const top = new THREE.Mesh(ico, moss);
    top.position.set(p.x, floor + h, p.z);
    top.scale.set(0.6, 0.15, 0.6);
    g.add(top);
    cover.push({ x: p.x, z: p.z, r: 0.7, y0: floor - 1, y1: floor + h, wall: true });
    if (rng() < 0.6) {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 10), stoneSide);
      const q = P(len * f + 1.6, halfW * s2 * 0.82);
      drum.position.set(q.x, floor + 0.5, q.z);
      drum.rotation.set(Math.PI / 2, 0, rng() * 3);
      g.add(drum);
    }
  }

  // ---- Cataratas en las cuatro esquinas, con su corriente hacia el altar.
  const fallTex = waterTexture();
  const mistMat = new THREE.SpriteMaterial({ map: mistTexture(), color: 0xe8f8ff, transparent: true, opacity: 0.45, depthWrite: false });
  for (const [f, s2] of [[-0.3, 1], [-0.3, -1], [0.32, 1], [0.32, -1]]) {
    const base = P(len * f, (halfW + 1.2) * s2);
    const H = R * 1.36;
    const tex = fallTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 5);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, color: 0xd6f1ff });
    const sheetYaw = Math.atan2(side.x * s2, side.z * s2);
    for (const [w, off] of [[3.2, 0], [2.2, 0.35]]) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
      sheet.position.set(base.x - side.x * s2 * off, floor + H / 2, base.z - side.z * s2 * off);
      sheet.rotation.y = sheetYaw;
      g.add(sheet);
    }
    // Espuma y bruma al pie.
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.4, 2.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    foam.position.set(base.x - side.x * s2 * 0.8, waterY + 0.02, base.z - side.z * s2 * 0.8);
    g.add(foam);
    const mists = [];
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(mistMat.clone());
      sp.scale.setScalar(3 + i * 0.6);
      g.add(sp);
      mists.push(sp);
    }
    // Corriente: una franja clara del pie de la catarata al altar.
    const to = { x: center.x - base.x, z: center.z - base.z };
    const tl = Math.hypot(to.x, to.z);
    const streamLen = tl - ALT.outer - 0.6;
    const sTex = fallTex.clone();
    sTex.needsUpdate = true;
    sTex.repeat.set(1, 3);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(2.2, streamLen).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: sTex, color: 0xbfeaff, transparent: true, opacity: 0.35, depthWrite: false }));
    stream.position.set(base.x + (to.x / tl) * (streamLen / 2 + 0.5), waterY + 0.015, base.z + (to.z / tl) * (streamLen / 2 + 0.5));
    stream.rotation.y = Math.atan2(to.x, to.z);
    stream.renderOrder = 3;
    g.add(stream);
    const l = new THREE.PointLight(0x7fd0ff, 2.5, 18, 1.4);
    l.position.set(base.x - side.x * s2 * 2, floor + 3, base.z - side.z * s2 * 2);
    g.add(l);
    lights.push(l);
    const b0 = { x: base.x - side.x * s2 * 0.9, z: base.z - side.z * s2 * 0.9 };
    anim.push((t) => {
      tex.offset.y = -t * 1.4;
      sTex.offset.y = -t * 0.5;
      foam.scale.setScalar(1 + Math.sin(t * 5 + f) * 0.07);
      mists.forEach((sp, i) => {
        const u = (t * 0.35 + i / mists.length) % 1;
        sp.position.set(b0.x + Math.sin(i * 2.1) * 0.8, waterY + 0.3 + u * 3, b0.z + Math.cos(i * 1.7) * 0.8);
        sp.material.opacity = 0.45 * Math.sin(u * Math.PI);
      });
    });
  }

  // ---- El techo se abre: la luz del sol entra en haces sobre el altar.
  const ceilY = floor + R * 1.52;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff6dc }));
  hole.position.set(center.x + dir.x * 0.8, ceilY, center.z + dir.z * 0.8);
  g.add(hole);
  const holeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTexture(), color: 0xfff1c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  holeGlow.scale.setScalar(12);
  holeGlow.position.copy(hole.position).y -= 0.5;
  g.add(holeGlow);
  const shaftTex = shaftTexture();
  const shafts = [];
  for (const [ox, oz, rt, rb, op] of [[0, 0, 2.8, 6.2, 0.22], [1.2, -0.8, 1.4, 3.6, 0.16], [-1.4, 1.0, 1.2, 3.0, 0.14]]) {
    const H = ceilY - floor;
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, H, 28, 1, true),
      new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xffe8b8, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    cone.position.set(hole.position.x + ox, floor + H / 2, hole.position.z + oz);
    cone.rotation.z = ox * 0.04;
    cone.renderOrder = 4;
    g.add(cone);
    shafts.push({ m: cone, op });
  }
  const sun = new THREE.SpotLight(0xfff0d0, 260, 60, 0.5, 0.65, 1.3);
  sun.position.set(hole.position.x, ceilY - 0.5, hole.position.z);
  sun.target.position.set(center.x, floor, center.z);
  g.add(sun);
  g.add(sun.target);
  lights.push(sun);
  // Luz de relleno desde la orilla (la cara del guardián no queda negra a contraluz).
  const front = new THREE.PointLight(0xd8e8ff, 5, 45, 1);
  front.position.set(center.x - dir.x * 13, floor + 8, center.z - dir.z * 13);
  g.add(front);
  lights.push(front);
  const fill = new THREE.PointLight(0x9fd8ff, 3.5, 50, 1);
  fill.position.set(center.x, floor + 11, center.z);
  g.add(fill);
  lights.push(fill);
  // Motas de polvo en la luz.
  const N = 180;
  const motes = new Float32Array(N * 3);
  const seeds = [];
  for (let i = 0; i < N; i++) seeds.push([rng() * Math.PI * 2, rng() * 4.5, rng()]);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motes, 3));
  const motePts = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: 0xfff2cc, size: 0.09, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  motePts.frustumCulled = false;
  g.add(motePts);
  anim.push((t) => {
    for (let i = 0; i < N; i++) {
      const [a, r, h] = seeds[i];
      const y = ((h + t * 0.012 * (1 + (i % 3))) % 1) * (ceilY - floor);
      motes[i * 3] = hole.position.x + Math.cos(a + t * 0.05) * r;
      motes[i * 3 + 1] = floor + y;
      motes[i * 3 + 2] = hole.position.z + Math.sin(a + t * 0.05) * r;
    }
    moteGeo.attributes.position.needsUpdate = true;
    for (const s of shafts) s.m.material.opacity = s.op * (0.85 + Math.sin(t * 0.6 + s.op * 20) * 0.15);
  });

  // ---- Orilla de la entrada: rocas y lianas en las paredes.
  for (let i = 0; i < 10; i++) {
    const p = P(-len / 2 - 2 - rng() * 4, (rng() - 0.5) * halfW * 1.6);
    add(ico, rock, [p.x, floor + 0.2, p.z], [0.5 + rng() * 0.8, 0.3 + rng() * 0.4, 0.5 + rng() * 0.7], [rng(), rng() * 3, 0]);
  }
  const vineMat = new THREE.MeshLambertMaterial({ color: 0x3f6a26, side: THREE.DoubleSide });
  for (let i = 0; i < 26; i++) {
    const f = (rng() - 0.5) * len * 1.1;
    const s2 = rng() < 0.5 ? -1 : 1;
    const p = P(f, (halfW + 1.6 + rng() * 2.5) * s2);
    const L = 2 + rng() * 6;
    const v = new THREE.Mesh(new THREE.PlaneGeometry(0.35 + rng() * 0.5, L), vineMat);
    v.position.set(p.x, floor + R * 0.9 + rng() * 4 - L / 2, p.z);
    v.rotation.y = Math.atan2(side.x * s2, side.z * s2);
    g.add(v);
  }

  /** Altura del suelo en (x, z): las gradas del altar o el suelo de la sala. */
  const groundAt = (x, z) => {
    const d = Math.hypot(x - center.x, z - center.z);
    for (let i = ALT.steps.length - 1; i >= 0; i--) if (d <= ALT.steps[i][0]) return floor + ALT.steps[i][1];
    return floor;
  };
  return {
    lights,
    altar: ALT,
    cover,
    altarPrims,
    groundAt,
    /** k.runes: 0…1 brillo de las runas del altar. */
    animate(t, k = {}) {
      for (const f of anim) f(t);
      const target = k.runes ?? 0;
      runeMat.opacity += (0.15 + target * 0.75 * (0.85 + Math.sin(t * 3) * 0.15) - runeMat.opacity) * 0.05;
    },
  };
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rippleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#7fc4d8';
  x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(230,250,255,0.55)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 26; i++) {
    x.beginPath();
    const cx = (i * 53) % 128;
    const cy = (i * 29) % 128;
    x.ellipse(cx, cy, 8 + (i % 5) * 4, 3 + (i % 3) * 2, (i % 7) * 0.4, 0, Math.PI * 1.3);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 128);
  // Rayas verticales (luz que se cuela por las grietas).
  for (let i = 0; i < 9; i++) {
    x.fillStyle = `rgba(0,0,0,${0.15 + (i % 3) * 0.1})`;
    x.fillRect((i * 23) % 64, 0, 3 + (i % 4), 128);
  }
  return new THREE.CanvasTexture(c);
}
