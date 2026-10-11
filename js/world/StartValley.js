import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { PartsBuilder } from '../render/PartsBuilder.js';
import { SeededRandom, hashString } from '../core/SeededRandom.js';
import { fallTexture } from './map/FloatingIslands.js';

/**
 * StartValley — el Valle del Despertar, la zona inicial del Edén (meta.valley del mapa):
 * un valle cerrado por muros de roca que no se escalan, con una sola salida al sur.
 *
 *  - Peña de los Saltos: piedras cada vez más altas para aprender a saltar.
 *  - Roca de los Restos: una pared con lianas (se trepa) y, arriba, restos de la nave con
 *    recursos, mejoras iniciales y el registro de la nave (E: registrar).
 *  - Piedras grabadas con pistas (E: leer), puentes de madera sobre los arroyos, las cascadas
 *    que caen de los muros y los slimes de las ruinas (el primer combate).
 *  - La garganta del sur está cerrada por una losa de roca con runas: se aparta al superar la
 *    prueba del templo del valle (TEMPLE_CLEARED de tipo TRIAL). Al salir al mirador, la
 *    primera vez, un plano de cine muestra la isla: «el mundo te espera».
 *
 * Provider de InteractionSystem. Se guarda (parte "valley"); en una partida de antes de que
 * existiera el valle la salida está abierta (`legacy()`).
 */
const G = {
  cyl7: new THREE.CylinderGeometry(0.5, 0.5, 1, 7),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  box: new THREE.BoxGeometry(1, 1, 1),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  ico: new THREE.IcosahedronGeometry(0.5, 1),
  dodeca: new THREE.DodecahedronGeometry(0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
};
const ROCK = [0x8d867b, 0x7c766c, 0x99928a];
const LEAVES = [0x3f8a2e, 0x4f9a35, 0x5fae3f];
const WOOD = [0x7a5634, 0x6b4a2c, 0x8a6340];

export const VALLEY_CLUES = [
  {
    title: '🪨 Piedra grabada',
    text: 'Los que caen del cielo despiertan en este valle. Sus muros no se escalan: solo hay una salida, al sur, y la guarda la roca.',
  },
  {
    title: '🪨 Runas de la losa',
    text: 'La roca se apartará ante quien supere la prueba del templo del levante, al este del valle.',
  },
];

export const DEBRIS_LOG = [
  'REGISTRO · NAVE SAMPLE — última entrada.',
  'Entrada en la atmósfera de EDEN: el escudo térmico falla. Evacuación del personal en cápsulas de escape.',
  'La nave intentará posarse en las montañas heladas del norte. Si alguien encuentra esto: hay que volver a ella.',
  'Nota a mano: «El planeta no está vacío. Las piedras se mueven. No os fiéis.»',
];

export const DEBRIS_LOOT = { WATERSKIN: 1, STONE_SWORD: 1, DRIED_FRUIT: 3, ROPE: 2, CLOTH: 2 };

export class StartValley {
  /**
   * @param {object} p
   * @param {MapData} p.map            mapa con meta.valley
   * @param {(x, z) => number} p.heightAt
   * @param {THREE.Object3D} p.root   grupo del planeta de inicio
   */
  constructor({ map, heightAt, root, colliders = null, events, player, enemies = null, inventory = null, items = {}, ui = null, camera = null, lock = () => {}, isHome = () => true }) {
    this.name = 'startValley';
    this.meta = map.meta.valley;
    this._map = map;
    this._h = heightAt;
    this._col = colliders;
    this._events = events;
    this._player = player;
    this._enemies = enemies;
    this._inv = inventory;
    this._items = items;
    this._ui = ui;
    this._cam = camera;
    this._lock = lock;
    this._isHome = isHome;
    this.state = defaultValleyState();
    this.group = new THREE.Group();
    this.group.name = 'StartValley';
    root.add(this.group);
    this.waterfalls = [];
    this._t = 0;
    this._slimes = [];
    this._mist = [];
    this._dust = [];
    this._gateOpen = 0; // 0 cerrada … 1 abierta (animación)
    this._seq = null;
    this.targets = {};
    const V = this.meta;
    const solid = new PartsBuilder();
    this._buildStones(solid);
    this._buildVines(solid);
    this._buildDebris(solid);
    this._buildClues(solid);
    this._buildBridges(solid);
    const mesh = new THREE.Mesh(solid.toGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    this._buildGate();
    this._buildFalls();
    // Lugares para el tutorial y el mapa.
    const ruins = map.meta.pois?.find((p) => p.id === 'RUINAS_VALLE');
    this.targets.ruins = ruins ? { x: ruins.x, z: ruins.z, y: heightAt(ruins.x, ruins.z) + 1.5 } : null;
    this.targets.balcony = { x: V.balcony.x, z: V.balcony.z, y: V.balcony.y + 1.5 };
    this.targets.gate = { x: V.gate.x, z: V.gate.z, y: heightAt(V.gate.x, V.gate.z) + 3 };
    events.on(GameEvents.TEMPLE_CLEARED, ({ type }) => {
      if (type === 'TRIAL') this.openGate();
    });
  }

  // ---- Consultas ------------------------------------------------------------------------

  /** ¿(x, z) está en el fondo del valle (dentro de sus muros)? */
  contains(x, z) {
    return pointInPolygon(this.meta.points, x, z);
  }

  get open() {
    return this.state.gate;
  }

  /** ¿El jugador está encima de una peña del valle? (id: PENA_SALTOS, ROCA_RESTOS) */
  onMesa(id, p = this._player.position) {
    const m = this.meta.mesas.find((x) => x.id === id);
    return !!m && Math.hypot(p.x - m.x, p.z - m.z) < m.r + 0.6 && p.y > m.top - 0.8;
  }

  // ---- Piedras de los saltos -------------------------------------------------------------

  _buildStones(solid) {
    const m = this.meta.mesas.find((x) => x.stones);
    if (!m) return;
    const S = m.stones;
    const d = Math.hypot(S.x - m.x, S.z - m.z) || 1;
    const ux = (S.x - m.x) / d;
    const uz = (S.z - m.z) / d;
    const rng = new SeededRandom(hashString('valley:stones'));
    const prims = [];
    this.stones = [];
    // De la más alta (junto a la peña) a la más baja; alturas repartidas entre el suelo y la cima:
    // cada una algo más alta que un escalón (hay que saltar) y la última, a un salto de la peña.
    const spots = Array.from({ length: S.n }, (_, i) => {
      const dist = m.r + 2.6 + i * 2.5;
      return { x: m.x + ux * dist + (rng.next() - 0.5) * 0.6, z: m.z + uz * dist + (rng.next() - 0.5) * 0.6 };
    });
    const low = this._h(spots[S.n - 1].x, spots[S.n - 1].z) + 0.6;
    const high = m.top - 0.6;
    for (let i = 0; i < S.n; i++) {
      const { x, z } = spots[i];
      const top = high + (low - high) * (S.n > 1 ? i / (S.n - 1) : 0);
      const ground = this._h(x, z);
      const y0 = Math.min(ground, top) - 1.5;
      const r = 0.85;
      this.stones.push({ x, z, top, r });
      solid.add(G.cyl7, {
        position: [x, (top + y0) / 2, z], scale: [r * 2.1, top - y0, r * 2.1], color: ROCK[i % ROCK.length],
        jitter: (k, v) => {
          if (v.y < 0.45) {
            v.x *= 1 + Math.sin(k * 1.7) * 0.08;
            v.z *= 1 + Math.cos(k * 2.3) * 0.08;
          }
        },
      });
      solid.add(G.cyl7, { position: [x, top + 0.04, z], scale: [r * 2.05, 0.12, r * 2.05], color: 0x5f8f3a }); // musgo
      prims.push({ x, z, r, y0, y1: top, walk: true, wall: true });
    }
    this._col?.add('valley:stones', prims, { enabled: this._isHome });
    const first = this.stones[this.stones.length - 1];
    this.targets.stones = { x: first.x, z: first.z, y: first.top + 1.2 };
    this.targets.shelf = { x: m.x, z: m.z, y: m.top + 1.5 };
  }

  // ---- Lianas: la pared de la Roca de los Restos se puede trepar -----------------------------

  _buildVines(solid) {
    const m = this.meta.mesas.find((x) => x.vines);
    if (!m) return;
    const a0 = Math.atan2(m.vines.z - m.z, m.vines.x - m.x);
    const rng = new SeededRandom(hashString('valley:vines'));
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i / (n - 1)) - 0.5) * m.vines.arc + (rng.next() - 0.5) * 0.05;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      // La pared a cada altura: el primer punto (hacia fuera) por debajo de esa altura.
      const wallAt = (y) => {
        let rr = m.r - 1.5;
        while (rr < m.r + 6 && this._h(m.x + cx * rr, m.z + cz * rr) > y) rr += 0.1;
        return rr;
      };
      const ground = this._h(m.x + cx * (m.r + 5), m.z + cz * (m.r + 5));
      const pts = [];
      for (let y = m.top + 0.15; y > ground + 0.2; y -= 0.9) {
        const rr = wallAt(y) + 0.12;
        pts.push(new THREE.Vector3(m.x + cx * rr, y, m.z + cz * rr));
      }
      for (let k = 0; k < pts.length - 1; k++) {
        segment(solid, pts[k], pts[k + 1], 0.09, 0x356b25);
        if (rng.next() < 0.8) {
          const p = pts[k];
          const s = 0.35 + rng.next() * 0.3;
          solid.add(G.ico0, { position: [p.x + cx * 0.15 + (rng.next() - 0.5) * 0.4, p.y - 0.3, p.z + cz * 0.15 + (rng.next() - 0.5) * 0.4], scale: [s, s * 0.7, s], color: LEAVES[k % LEAVES.length] });
        }
      }
    }
    this.targets.climb = { x: m.x + Math.cos(a0) * (m.r + 2.5), z: m.z + Math.sin(a0) * (m.r + 2.5), y: this._h(m.x + Math.cos(a0) * (m.r + 2.5), m.z + Math.sin(a0) * (m.r + 2.5)) + 2 };
    this.targets.climbTop = { x: m.x, z: m.z, y: m.top + 1.5 };
  }

  // ---- Restos de la nave (arriba de la Roca de los Restos) ------------------------------------

  _buildDebris(solid) {
    const m = this.meta.mesas.find((x) => x.vines) ?? this.meta.mesas[0];
    if (!m) return;
    const rng = new SeededRandom(hashString('valley:debris'));
    const y = m.top;
    const cx = m.x - 1.5;
    const cz = m.z - 1;
    // Placas del casco (blancas con la franja naranja), un propulsor roto y un contenedor.
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = 2 + rng.next() * 5;
      const sx = 1.4 + rng.next() * 1.8;
      solid.add(G.box, {
        position: [cx + Math.cos(a) * r, y + 0.25, cz + Math.sin(a) * r], rotation: [rng.next() * 0.6 - 0.3, rng.next() * 3, rng.next() * 0.8 - 0.4],
        scale: [sx, 0.12, 0.9 + rng.next()], color: i % 3 === 0 ? 0xe8742a : 0xd5dade,
      });
    }
    solid.add(G.cyl7, { position: [cx + 3.2, y + 0.9, cz - 2.2], rotation: [1.2, 0.4, 0.2], scale: [1.6, 2.6, 1.6], color: 0x3a4048 });
    solid.add(G.cone, { position: [cx + 4.4, y + 0.5, cz - 3.4], rotation: [1.3, 0.4, 0.2], scale: [2.2, 1.6, 2.2], color: 0x2a2e33 });
    solid.add(G.box, { position: [cx, y + 0.6, cz], rotation: [0, 0.5, 0.08], scale: [1.6, 1.2, 1.1], color: 0x5c6b7a });
    solid.add(G.box, { position: [cx, y + 1.23, cz], rotation: [0, 0.5, 0.08], scale: [1.7, 0.08, 1.2], color: 0x7a8a99 });
    this._crate = { x: cx, z: cz, y: y + 0.6 };
    this._col?.add('valley:debris', [{ cx, cz, hx: 0.8, hz: 0.55, yaw: 0.5, y0: y - 0.2, y1: y + 1.25, wall: true }], { enabled: this._isHome });
    // Luz del contenedor (se apaga al registrarlo).
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 0.06), new THREE.MeshBasicMaterial({ color: 0x4fe0ff }));
    glow.position.set(cx, y + 0.9, cz);
    glow.rotation.y = 0.5;
    glow.translateZ(0.56);
    this.group.add(glow);
    this._crateGlow = glow;
    this.targets.debris = { x: cx, z: cz, y: y + 1.8 };
  }

  // ---- Piedras con pistas ---------------------------------------------------------------------

  _buildClues(solid) {
    const V = this.meta;
    const ruins = this._map.meta.pois?.find((p) => p.id === 'RUINAS_VALLE');
    const spots = [
      ruins ? { x: ruins.x - 8, z: ruins.z - 16 } : null,
      { x: V.gate.x - 4.2, z: V.gate.z - 16 },
    ];
    this.clues = [];
    spots.forEach((s, i) => {
      if (!s) return;
      const y = this._h(s.x, s.z);
      solid.add(G.box, { position: [s.x, y + 0.9, s.z], rotation: [0, 0.3 * i, 0.04], scale: [1.3, 2, 0.4], color: 0x8f8a80 });
      solid.add(G.box, { position: [s.x, y + 0.08, s.z], rotation: [0, 0.3 * i, 0], scale: [1.8, 0.2, 0.9], color: 0x6f6a62 });
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x3fa9ff, emissive: 0x3fa9ff, emissiveIntensity: 0.9 }));
      rune.position.set(s.x, y + 1.05, s.z);
      rune.rotation.y = 0.3 * i;
      rune.translateZ(0.21);
      this.group.add(rune);
      this.clues.push({ i, x: s.x, z: s.z, y: y + 1.2, rune });
      this._col?.add(`valley:clue${i}`, [{ x: s.x, z: s.z, r: 0.7, y0: y - 0.5, y1: y + 1.9, wall: true }], { enabled: this._isHome });
    });
  }

  // ---- Puentes de madera donde el sendero cruza un arroyo -------------------------------------

  _buildBridges(solid) {
    const meta = this._map.meta;
    const path = meta.roads?.find((r) => r.id === 'SENDERO_DESPERTAR');
    this.bridges = [];
    if (!path) return;
    const prims = [];
    for (const river of meta.rivers ?? []) {
      if (!river.points?.length || !this.contains(river.points[0].x, river.points[0].z)) continue;
      for (let i = 0; i < path.points.length - 1; i++) {
        for (let j = 0; j < river.points.length - 1; j++) {
          const hit = segmentHit(path.points[i], path.points[i + 1], river.points[j], river.points[j + 1]);
          if (!hit) continue;
          const a = path.points[i];
          const b = path.points[i + 1];
          const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
          const ux = (b.x - a.x) / L;
          const uz = (b.z - a.z) / L;
          const w = river.points[j].w ?? 3;
          const len = 2 * (w + 1.5) + 3.5;
          const e0 = { x: hit.x - ux * len / 2, z: hit.z - uz * len / 2 };
          const e1 = { x: hit.x + ux * len / 2, z: hit.z + uz * len / 2 };
          const level = this._map.waterAt(hit.x, hit.z) ?? this._h(hit.x, hit.z);
          const deck = Math.max(this._h(e0.x, e0.z), this._h(e1.x, e1.z), level + 0.45) + 0.12;
          const yaw = Math.atan2(-uz, ux);
          this.bridges.push({ x: hit.x, z: hit.z, len, yaw, deck });
          // Tablones, vigas, barandillas y postes.
          const n = Math.round(len / 0.55);
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n - 0.5;
            solid.add(G.box, { position: [hit.x + ux * t * len, deck - 0.06, hit.z + uz * t * len], rotation: [0, yaw, (k % 2 ? 0.02 : -0.02)], scale: [0.5, 0.12, 2.3], color: WOOD[k % 3] });
          }
          for (const side of [-1, 1]) {
            const ox = -uz * 1.1 * side;
            const oz = ux * 1.1 * side;
            solid.add(G.box, { position: [hit.x + ox, deck - 0.22, hit.z + oz], rotation: [0, yaw, 0], scale: [len, 0.2, 0.2], color: 0x5a3f26 });
            solid.add(G.box, { position: [hit.x + ox * 1.05, deck + 0.85, hit.z + oz * 1.05], rotation: [0, yaw, 0], scale: [len - 0.4, 0.1, 0.1], color: 0x7a5634 });
            for (let k = 0; k <= 4; k++) {
              const t = k / 4 - 0.5;
              solid.add(G.box, { position: [hit.x + ux * t * (len - 0.6) + ox * 1.05, deck + 0.35, hit.z + uz * t * (len - 0.6) + oz * 1.05], scale: [0.12, 1.0, 0.12], color: 0x5a3f26 });
            }
            prims.push({ cx: hit.x + ox * 1.12, cz: hit.z + oz * 1.12, hx: len / 2 - 0.3, hz: 0.08, yaw, y0: deck, y1: deck + 1, wall: true });
          }
          prims.push({ cx: hit.x, cz: hit.z, hx: len / 2, hz: 1.15, yaw, y0: deck - 0.5, y1: deck, walk: true });
        }
      }
    }
    if (prims.length) this._col?.add('valley:bridges', prims, { enabled: this._isHome });
    if (this.bridges[0]) this.targets.bridge = { x: this.bridges[0].x, z: this.bridges[0].z, y: this.bridges[0].deck + 1.5 };
  }

  // ---- Losa de la salida ------------------------------------------------------------------------

  _buildGate() {
    const V = this.meta;
    const g = V.gate;
    const gp = V.gorge;
    // Dirección de la garganta en la losa (para ponerla de través).
    let best = 0;
    for (let i = 0; i < gp.length - 1; i++) if (Math.hypot(gp[i].x - g.x, gp[i].z - g.z) < Math.hypot(gp[best].x - g.x, gp[best].z - g.z)) best = i;
    const a = gp[Math.min(best, gp.length - 2)];
    const b = gp[Math.min(best, gp.length - 2) + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const ux = (b.x - a.x) / L;
    const uz = (b.z - a.z) / L;
    // La losa va a lo ancho: su eje x local, perpendicular a la garganta.
    const px = uz;
    const pz = -ux;
    const floor = this._h(g.x, g.z);
    const slab = new THREE.Group();
    slab.position.set(g.x, floor, g.z);
    slab.rotation.y = Math.atan2(-pz, px);
    const P = new PartsBuilder();
    const rng = new SeededRandom(hashString('valley:gate'));
    // Bloque principal irregular y bloques sueltos encima.
    P.add(G.box, {
      position: [0, g.h / 2, 0], scale: [g.w, g.h, 2.6], color: 0x837c70,
      jitter: (k, v) => {
        v.x *= 1 + Math.sin(k * 3.1) * 0.03;
        v.y += Math.sin(k * 1.3) * 0.02;
      },
    });
    for (let i = 0; i < 7; i++) {
      const s = 1.4 + rng.next() * 2.2;
      P.add(G.dodeca, { position: [(rng.next() - 0.5) * g.w * 0.9, g.h + s * 0.25, (rng.next() - 0.5) * 1.6], rotation: [rng.next() * 3, rng.next() * 3, 0], scale: s, color: ROCK[i % 3] });
    }
    const slabMesh = new THREE.Mesh(P.toGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    slabMesh.castShadow = slabMesh.receiveShadow = true;
    slab.add(slabMesh);
    // Runas azules, como las del templo (se apagan al abrirse).
    const runeMat = new THREE.MeshStandardMaterial({ color: 0x3fa9ff, emissive: 0x3fa9ff, emissiveIntensity: 1 });
    for (let i = -2; i <= 2; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4 + (i % 2 ? 0.5 : 0), 0.06), runeMat);
      r.position.set(i * 2, g.h * 0.55, -1.33);
      slab.add(r);
    }
    this.group.add(slab);
    this._gate = { slab, runeMat, floor, yaw: slab.rotation.y, ux, uz };
    this._col?.add('valley:gate', [{ cx: g.x, cz: g.z, hx: g.w / 2 + 2, hz: 1.4, yaw: slab.rotation.y, y0: floor - 2, y1: floor + g.h, wall: true }], {
      enabled: () => this._isHome() && this._gateOpen < 0.6,
    });
  }

  /** Abre la losa (con animación si es ahora; sin ella al cargar). */
  openGate({ instant = false } = {}) {
    if (this.state.gate && !instant) return;
    this.state.gate = true;
    if (instant) {
      this._gateOpen = 1;
      this._applyGate();
      return;
    }
    this._opening = true;
    this._events.emit(GameEvents.UI_MESSAGE, { text: '🪨 Un estruendo recorre el valle: la losa de la garganta del sur se aparta. ¡La salida está abierta!', type: 'warning' });
    this._events.emit(GameEvents.VALLEY_OPENED, {});
  }

  _applyGate() {
    const k = this._gateOpen;
    const g = this._gate;
    if (!g) return;
    g.slab.position.y = g.floor - k * (this.meta.gate.h + 0.6);
    g.runeMat.emissiveIntensity = (1 - k) * 1;
    g.slab.visible = k < 0.999;
  }

  // ---- Cascadas de los muros ------------------------------------------------------------------

  _buildFalls() {
    const tex = fallTexture();
    this._fallTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, color: 0xe6f8ff, fog: true });
    for (const f of this.meta.falls ?? []) {
      if (!f.points?.length) continue;
      const geo = buildCliffFallGeometry(f);
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = 2;
      this.group.add(m);
      this.waterfalls.push({ x: f.foot.x, y: f.foot.y, z: f.foot.z, top: f.top, name: f.name });
      const rng = new SeededRandom(hashString(`fall:${f.id}`));
      const last = f.points[f.points.length - 1];
      for (let k = 0; k < 6; k++) {
        const mesh = new THREE.Mesh(G.ico, new THREE.MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0, depthWrite: false, fog: true }));
        mesh.renderOrder = 3;
        this.group.add(mesh);
        this._mist.push({ mesh, x: last.x + (rng.next() - 0.5) * 5, y: f.foot.y + 0.3, z: last.z + (rng.next() - 0.5) * 5, k: rng.next(), size: 2 + rng.next() * 2.5, speed: 0.12 + rng.next() * 0.08 });
      }
    }
  }

  // ---- Slimes de las ruinas (el primer combate) ---------------------------------------------

  _updateSlimes() {
    const r = this.targets.ruins;
    if (!r || this.state.slimes || !this._enemies?.spawnAt) return;
    const p = this._player.position;
    const near = Math.hypot(p.x - r.x, p.z - r.z) < 42 && this.contains(p.x, p.z);
    if (near && !this._slimes.length) {
      for (let i = 0; i < 3; i++) {
        const a = i * 2.1 + 0.4;
        const x = r.x + Math.cos(a) * 6;
        const z = r.z + Math.sin(a) * 6;
        const e = this._enemies.spawnAt('SLIME', x, z, this._h(x, z), { leash: 36 });
        if (e) this._slimes.push(e);
      }
      if (this._slimes.length) this._events.emit(GameEvents.UI_MESSAGE, { text: '🟢 ¡Slimes en las ruinas! Ataca con clic izquierdo y esquiva con un toque de Shift.', type: 'warning' });
    }
    if (this._slimes.length && this._slimes.every((e) => !e.alive || e.removed)) {
      const killed = this._slimes.some((e) => !e.alive);
      this._slimes = [];
      if (killed) {
        this.state.slimes = true;
        this._events.emit(GameEvents.UI_MESSAGE, { text: '⚔️ ¡Ruinas despejadas!', type: 'pickup' });
      }
    }
    // Lejos de las ruinas, los que queden se retiran (vuelven a salir al volver).
    if (!near && this._slimes.length && Math.hypot(p.x - r.x, p.z - r.z) > 90) {
      for (const e of this._slimes) this._enemies.remove?.(e);
      this._slimes = [];
    }
  }

  get slimesBeaten() {
    return this.state.slimes;
  }

  // ---- Bucle ------------------------------------------------------------------------------------

  update(dt) {
    if (!this._isHome()) return;
    this._t += dt;
    const t = this._t;
    if (this._fallTex) this._fallTex.offset.y = (this._fallTex.offset.y + dt * 0.8) % 1;
    for (const m of this._mist) {
      m.k = (m.k + dt * m.speed) % 1;
      m.mesh.position.set(m.x, m.y + m.k * 4, m.z);
      m.mesh.scale.setScalar(m.size * (0.6 + m.k));
      m.mesh.material.opacity = 0.22 * Math.sin(m.k * Math.PI);
    }
    for (const c of this.clues ?? []) c.rune.material.emissiveIntensity = 0.6 + Math.sin(t * 2 + c.i) * 0.3;
    if (this._crateGlow) this._crateGlow.visible = !this.state.debris && Math.sin(t * 4) > -0.6;
    // Losa: se hunde despacio con polvo.
    if (this._opening) {
      this._gateOpen = Math.min(1, this._gateOpen + dt / 5);
      this._gate.slab.position.x = this.meta.gate.x + Math.sin(t * 40) * 0.06 * (1 - this._gateOpen);
      if (Math.random() < dt * 14) this._puff();
      if (this._gateOpen >= 1) this._opening = false;
    }
    if (this._gate) this._applyGate();
    for (let i = this._dust.length - 1; i >= 0; i--) {
      const d = this._dust[i];
      d.t += dt;
      d.mesh.position.y += dt * 1.5;
      d.mesh.scale.setScalar(d.s * (1 + d.t));
      d.mesh.material.opacity = 0.35 * Math.max(0, 1 - d.t / 2.5);
      if (d.t > 2.5) {
        this.group.remove(d.mesh);
        d.mesh.material.dispose();
        this._dust.splice(i, 1);
      }
    }
    this._updateSlimes();
    // Mirador: la primera vez que se sale del valle, un plano de cine.
    const p = this._player.position;
    const B = this.meta.balcony;
    if (!this.state.vista && this.state.gate && !this._seq && Math.hypot(p.x - B.x, p.z - B.z) < B.r && p.y > B.y - 2) this._playVista();
    if (this._seq) this._runVista(dt);
  }

  _puff() {
    const g = this.meta.gate;
    const mesh = new THREE.Mesh(G.ico, new THREE.MeshBasicMaterial({ color: 0xb9aa92, transparent: true, opacity: 0.35, depthWrite: false, fog: true }));
    mesh.position.set(g.x + (Math.random() - 0.5) * g.w, this._gate.floor + Math.random() * 1.5, g.z + (Math.random() - 0.5) * 3);
    this.group.add(mesh);
    this._dust.push({ mesh, t: 0, s: 1 + Math.random() * 1.5 });
  }

  _playVista() {
    this.state.vista = true;
    const B = this.meta.balcony;
    const g = this._gate;
    const out = new THREE.Vector3(g?.ux ?? 0, 0, g?.uz ?? 1); // hacia fuera del valle
    const side = new THREE.Vector3(-out.z, 0, out.x);
    const from = new THREE.Vector3(B.x, B.y, B.z).addScaledVector(out, -12).add(new THREE.Vector3(0, 3, 0));
    const to = new THREE.Vector3(B.x, B.y, B.z).addScaledVector(out, 6).addScaledVector(side, 6).add(new THREE.Vector3(0, 14, 0));
    const lookFar = new THREE.Vector3(B.x, B.y, B.z).addScaledVector(out, 260).add(new THREE.Vector3(0, 8, 0));
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    this._lock('valley', true);
    this._ui?.letterbox(true, '');
    this._seq = { t: 0, dur: 7.5, shot: () => {
      const k = Math.min(1, this._seq ? this._seq.t / 5 : 1);
      const e = k * k * (3 - 2 * k);
      pos.lerpVectors(from, to, e);
      look.copy(lookFar);
      return { pos, look };
    } };
    this._cam?.setCinematic(this._seq.shot, { speed: 2 });
    this._ui?.caption('🌍 E D E N — el mundo te espera');
  }

  _runVista(dt) {
    this._seq.t += dt;
    if (this._seq.t < this._seq.dur) return;
    this._seq = null;
    this._cam?.setCinematic(null, { speed: 2.5 });
    this._ui?.caption('');
    this._ui?.letterbox(false);
    this._lock('valley', false);
    this._events.emit(GameEvents.VALLEY_LEFT, {});
    this._events.emit(GameEvents.UI_MESSAGE, { text: '🌍 Has salido del Valle del Despertar. Desde aquí la exploración es libre: cada torre de reconocimiento revela el mapa de su zona.', type: 'biome' });
  }

  // ---- Interacción (provider) ---------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    if (!this._isHome() || this._seq) return [];
    const out = [];
    const c = this._crate;
    if (c && Math.hypot(c.x - x, c.z - z) < range + 2 && Math.abs(c.y - y) < 3) {
      out.push({ id: 'valley:debris', x: c.x, y: c.y + 0.4, z: c.z, aimRadius: 1.0, reach: 1.4, label: '📦 Restos de la nave', action: this.state.debris ? 'Leer el registro' : 'Registrar', key: 'E' });
    }
    for (const cl of this.clues ?? []) {
      if (Math.hypot(cl.x - x, cl.z - z) < range + 1.5 && Math.abs(cl.y - y) < 3) out.push({ id: `valley:clue:${cl.i}`, x: cl.x, y: cl.y, z: cl.z, aimRadius: 0.8, reach: 1.2, label: VALLEY_CLUES[cl.i].title, action: 'Leer', key: 'E' });
    }
    const g = this.targets.gate;
    if (!this.state.gate && g && Math.hypot(g.x - x, g.z - z) < range + 4) out.push({ id: 'valley:gate', x: g.x, y: g.y, z: g.z, aimRadius: 3, reach: 3, label: '🪨 Losa de roca', action: 'Examinar', key: 'E' });
    return out;
  }

  interact(id) {
    if (id === 'valley:debris') return this._search();
    if (id === 'valley:gate') {
      this._events.emit(GameEvents.UI_MESSAGE, { text: '🪨 La losa no se mueve ni un milímetro. Sus runas brillan como las del templo del este del valle…', type: 'info' });
      return true;
    }
    const m = /^valley:clue:(\d)$/.exec(id);
    if (m) {
      const i = Number(m[1]);
      if (!this.state.clues.includes(i)) this.state.clues.push(i);
      this._show([{ speaker: VALLEY_CLUES[i].title, color: '#9fd3ff', text: VALLEY_CLUES[i].text }]);
      this._events.emit(GameEvents.VALLEY_CLUE, { i });
      return true;
    }
    return false;
  }

  _search() {
    if (!this.state.debris) {
      this.state.debris = true;
      const got = [];
      for (const [item, n] of Object.entries(DEBRIS_LOOT)) {
        if (!this._items[item]) continue;
        this._inv?.addItem(item, n);
        got.push(`${this._items[item].ICON ?? ''} ${this._items[item].NAME} ×${n}`);
      }
      this._events.emit(GameEvents.UI_MESSAGE, { text: `📦 Restos de la nave: ${got.join(', ')}.`, type: 'pickup' });
      this._events.emit(GameEvents.VALLEY_DEBRIS, {});
    }
    this._show(DEBRIS_LOG.map((text) => ({ speaker: '📟 Registro', color: '#7fe0ff', text })));
    return true;
  }

  _show(lines) {
    if (this._ui?.dialog) this._ui.dialog(lines, () => {});
    else for (const l of lines) this._events.emit(GameEvents.UI_MESSAGE, { text: `${l.speaker}: ${l.text}`, type: 'info' });
  }

  // ---- Guardar ----------------------------------------------------------------------------------

  snapshot() {
    return { ...this.state, clues: [...this.state.clues] };
  }

  restore(d) {
    const s = defaultValleyState();
    if (d && typeof d === 'object') {
      for (const k of ['debris', 'slimes', 'gate', 'vista']) if (typeof d[k] === 'boolean') s[k] = d[k];
      if (Array.isArray(d.clues)) s.clues = [...new Set(d.clues.filter((i) => Number.isInteger(i) && i >= 0 && i < VALLEY_CLUES.length))];
    }
    this.state = s;
    this._gateOpen = s.gate ? 1 : 0;
    this._opening = false;
    this._applyGate();
  }

  /** Partida de antes del valle: todo como ya hecho (salida abierta, sin plano de cine). */
  legacy() {
    this.restore({ debris: false, slimes: true, gate: true, vista: true, clues: [] });
  }
}

export function defaultValleyState() {
  return { debris: false, slimes: false, gate: false, vista: false, clues: [] };
}

/** Cinta de una cascada que baja pegada a un muro (puntos de arriba abajo). */
export function buildCliffFallGeometry(f) {
  const pts = f.points;
  const foot = f.foot;
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    // Normal horizontal: de la pared hacia el pie; el ancho va de lado.
    let nx = foot.x - pts[0].x;
    let nz = foot.z - pts[0].z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const sx = -nz;
    const sz = nx;
    const k = i / Math.max(1, pts.length - 1);
    const w = f.w * (0.7 + 0.6 * k) / 2;
    if (i > 0) v += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y, p.z - pts[i - 1].z) / 8;
    for (const s of [-1, 1]) {
      pos.push(p.x + sx * w * s, p.y, p.z + sz * w * s);
      col.push(1, 1, 1, 0.92 - 0.25 * k);
      uv.push(s < 0 ? 0 : 1, -v);
    }
    if (i < pts.length - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Tramo cilíndrico de a a b (lianas). */
function segment(solid, a, b, r, color) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  if (len < 1e-3) return;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  solid.add(G.cyl6, { position: [m.x, m.y, m.z], rotation: [e.x, e.y, e.z], scale: [r * 2, len, r * 2], color });
}

/** Cruce de dos segmentos en planta (o null). */
function segmentHit(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + r.x * t, z: a.z + r.z * t };
}

function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
