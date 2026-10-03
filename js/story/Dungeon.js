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
  // La sala del fondo.
  const arenaNodes = nodes.slice(cave.arenaStart);
  const first = arenaNodes[0];
  const last = arenaNodes[arenaNodes.length - 1];
  const len = Math.hypot(last.x - first.x, last.z - first.z) || 1;
  const dir = { x: (last.x - first.x) / len, z: (last.z - first.z) / len };
  const side = { x: -dir.z, z: dir.x };
  const floor = Math.min(...arenaNodes.map((n) => n.floor));
  const center = { x: (first.x + last.x) / 2, z: (first.z + last.z) / 2, y: floor };
  const R = first.r;
  // Cascadas: láminas de agua que caen del techo a unas pozas.
  const fallTex = waterTexture();
  const falls = [];
  for (const [f, s] of [[-0.25, 0.6], [0.3, -0.62], [0.55, 0.55]]) {
    const x = center.x + dir.x * len * f + side.x * R * s;
    const z = center.z + dir.z * len * f + side.z * R * s;
    const h = R * 1.05;
    const tex = fallTex.clone();
    tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, color: 0xbfe9ff });
    for (const rot of [0, Math.PI / 2]) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(1.6, h), mat);
      sheet.position.set(x, floor + h / 2, z);
      sheet.rotation.y = Math.atan2(dir.x, dir.z) + rot;
      g.add(sheet);
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), new THREE.MeshBasicMaterial({ color: 0x3f8fb8, transparent: true, opacity: 0.7, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, floor + 0.04, z);
    g.add(pool);
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.3, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(x, floor + 0.06, z);
    g.add(foam);
    falls.push({ tex, foam });
  }
  // Grandes cristales y luz en la sala.
  for (const [f, s, k] of [[-0.45, -0.7, 1.4], [0.05, 0.75, 1.1], [0.45, -0.75, 1.6], [-0.1, -0.78, 0.9]]) {
    add(new THREE.OctahedronGeometry(1), crystalM, [center.x + dir.x * len * f + side.x * R * s, floor + k * 0.9, center.z + dir.z * len * f + side.z * R * s], [0.5 * k, 1.6 * k, 0.5 * k], [0.2, f * 5, 0.15]);
  }
  for (const [f, s] of [[-0.4, 0.4], [0.4, -0.4], [0, 0], [0.45, 0.45]]) {
    const l = new THREE.PointLight(0x9fe2ff, 4.5, 40, 1.2);
    l.position.set(center.x + dir.x * len * f + side.x * R * s, floor + 7, center.z + dir.z * len * f + side.z * R * s);
    g.add(l);
    lights.push(l);
  }
  // Rocas sueltas en el suelo de la sala (de ellas se levantará el gólem gigante).
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add(ico, rock, [center.x + Math.cos(a) * 4, floor + 0.4, center.z + Math.sin(a) * 4], [0.6, 0.45, 0.55], [a, a * 2, 0]);
  }
  // El Cofre N, al fondo.
  const chestPos = { x: last.x - dir.x * 2, z: last.z - dir.z * 2, y: floor };
  const chest = new THREE.Mesh(toGeometry(BUILD_MODELS.CHEST()), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  chest.position.set(chestPos.x, floor, chestPos.z);
  chest.rotation.y = Math.atan2(-dir.x, -dir.z);
  chest.castShadow = true;
  g.add(chest);
  const nSign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: letterTexture('N'), transparent: true }));
  nSign.position.set(chestPos.x - dir.x * 0.55, floor + 0.55, chestPos.z - dir.z * 0.55);
  nSign.rotation.y = Math.atan2(-dir.x, -dir.z);
  g.add(nSign);
  // El tirachinas, en el suelo junto a la entrada de la sala.
  const slingPos = { x: first.x + dir.x * 3 + side.x * 4.5, z: first.z + dir.z * 3 + side.z * 4.5, y: floor };
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
    arena: { center, radius: R, floor, dir, side, len, entrance: { x: first.x, z: first.z } },
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
    animate(t) {
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
