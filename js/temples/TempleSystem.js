import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { CHALLENGE_TYPES, createChallenge } from './Challenges.js';

/**
 * TempleSystem — templos de retos del planeta de inicio (P12).
 *
 *  1. Descubrimiento: un monolito de piedra con una runa azul (sitios CHALLENGE_TEMPLE).
 *  2. Interacción: E sobre la piedra → se activa el mecanismo.
 *  3. Apertura: la piedra se abre en dos y deja ver un portal (TEMPLES.PORTAL_TIME s).
 *  4. Entrada: al cruzar el portal, el jugador aparece dentro del recinto del templo (un patio
 *     amurallado con columnas, en la explanada CHALLENGE_ARENA emparejada por orden).
 *  5. El reto (Challenges.js): carrera, pelea, puzzle, supervivencia o exploración.
 * Al superarlo: recompensa (TEMPLES.REWARD) y el templo queda superado (se guarda). Si se
 * falla, se vuelve a la piedra y se puede repetir. Dentro hay un portal de salida (E).
 * Provider de InteractionSystem.
 */
export class TempleSystem {
  constructor({ config, items, inventory, events, scene, colliders = null, enemies = null, player, teleport, isDead = () => false, isHome = () => true, random = Math.random }) {
    this.name = 'temples';
    this._cfg = config;
    this._items = items;
    this._inv = inventory;
    this._events = events;
    this._colliders = colliders;
    this._enemies = enemies;
    this._player = player;
    this._teleport = teleport;
    this._isDead = isDead;
    this._isHome = isHome;
    this._random = random;
    this.temples = [];
    this.current = null;   // templo en el que está el jugador
    this.group = new THREE.Group();
    this.group.name = 'ChallengeTemples';
    scene.add(this.group);
    this._t = 0;
  }

  setup(world) {
    this.group.clear();
    this.temples = [];
    this.current = null;
    const stones = world?.getSites?.('CHALLENGE_TEMPLE') ?? [];
    const arenas = world?.getSites?.('CHALLENGE_ARENA') ?? [];
    const types = this._cfg.TYPES_BY_SITE;
    stones.forEach((s, i) => {
      const a = arenas[i];
      if (!a) return;
      const t = {
        id: s.id, type: types[i % types.length], x: s.x, z: s.z, y: world.getHeightAt(s.x, s.z), yaw: s.yaw ?? 0,
        arena: { x: a.x, z: a.z, y: world.getHeightAt(a.x, a.z) },
        done: false, open: 0, opening: 0, challenge: null, result: null, leaveIn: 0, enemies: [], dyn: null,
      };
      buildMonolith(t, this.group);
      buildArena(t, this._cfg, this.group);
      this._colliders?.add(`temple:${t.id}`, colliderPrims(t, this._cfg));
      this.temples.push(t);
    });
  }

  get(type) {
    return this.temples.find((t) => t.type === type) ?? null;
  }

  /** Texto para el HUD mientras se está dentro de un templo (o ''). */
  get status() {
    const t = this.current;
    if (!t?.challenge) return '';
    const name = CHALLENGE_TYPES[t.type];
    if (t.result === 'won') return `${name.ICON} ¡Reto superado!`;
    if (t.result === 'lost') return `${name.ICON} Reto fallado`;
    return `${name.ICON} ${name.NAME} · ${t.challenge.status()}`;
  }

  // ---- Bucle ---------------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    this.group.visible = this._isHome();
    const p = this._player.position;
    for (const t of this.temples) {
      // Apertura de la piedra y portal.
      const want = t.open > 0 ? 1 : 0;
      t.opening += (want - t.opening) * Math.min(1, dt * 2.5);
      t.halves.forEach((h, k) => (h.position.x = (k ? 1 : -1) * (0.78 + t.opening * 1.3)));
      t.portal.visible = t.opening > 0.05;
      t.portal.scale.setScalar(Math.max(0.01, t.opening));
      t.portal.rotation.z += dt * 1.5;
      t.rune.material.emissiveIntensity = t.done ? 0.3 : 1 + Math.sin(this._t * 3) * 0.4;
      t.exit.rotation.z -= dt * 1.2;
      if (t.open > 0) {
        t.open -= dt;
        if (this.current === null && this._isHome() && Math.hypot(p.x - t.x, p.z - t.z) < this._cfg.PORTAL_REACH && Math.abs(p.y - t.y) < 3) this.enter(t);
      }
    }
    const t = this.current;
    if (!t) return;
    if (t.challenge && !t.result) {
      const res = t.challenge.update(dt, this._ctx(t));
      this._syncDyn(t);
      if (res) this._finish(t, res);
    } else if (t.result) {
      t.leaveIn -= dt;
      if (t.leaveIn <= 0) this.leave(t);
    }
  }

  _ctx(t) {
    const p = this._player.position;
    return {
      px: p.x,
      pz: p.z,
      alive: !this._isDead(),
      spawn: (type, x, z) => {
        const e = this._enemies?.spawnAt?.(type, x, z, t.arena.y, { leash: this._cfg.ARENA_RADIUS * 2 }) ?? null;
        if (e) t.enemies.push(e);
        return e;
      },
      message: (text) => this._say(text, 'info'),
    };
  }

  // ---- Entrar, terminar, salir ----------------------------------------------------------

  enter(t) {
    t.open = 0;
    this.current = t;
    t.result = null;
    t.enemies = [];
    const a = t.arena;
    t.challenge = createChallenge(t.type, { cx: a.x, cz: a.z, cfg: this._cfg });
    this._buildDyn(t);
    this._teleport(a.x, a.y + 0.2, a.z + this._cfg.ARENA_RADIUS - 4.5);
    t.challenge.start?.(this._ctx(t));
    const def = CHALLENGE_TYPES[t.type];
    this._events.emit(GameEvents.TEMPLE_ENTERED, { id: t.id, type: t.type });
    this._say(`🏛️ Templo de retos · ${def.ICON} ${def.NAME}: ${def.HINT}`, 'biome');
  }

  _finish(t, res) {
    t.result = res;
    t.leaveIn = this._cfg.LEAVE_DELAY;
    for (const e of t.enemies) this._enemies?.remove?.(e);
    t.enemies = [];
    if (res === 'won') {
      t.done = true;
      const got = [];
      for (const [item, [lo, hi]] of Object.entries(this._cfg.REWARD)) {
        const n = lo + Math.floor(this._random() * (hi - lo + 1));
        if (n > 0 && this._items[item]) {
          this._inv.addItem(item, n);
          got.push(`${this._items[item].ICON} ×${n}`);
        }
      }
      this._events.emit(GameEvents.TEMPLE_CLEARED, { id: t.id, type: t.type });
      this._say(`🏆 ¡Reto superado! Recompensa: ${got.join(' ')}. El portal te devuelve fuera.`, 'pickup');
    } else {
      this._events.emit(GameEvents.TEMPLE_FAILED, { id: t.id, type: t.type });
      this._say('💀 Reto fallado. Vuelve a abrir la piedra para intentarlo otra vez.', 'warning');
    }
  }

  /** Sale del templo (portal de salida, o al acabar). Si el reto seguía, se abandona. */
  leave(t = this.current) {
    if (!t) return;
    for (const e of t.enemies) this._enemies?.remove?.(e);
    t.enemies = [];
    t.challenge = null;
    t.result = null;
    this._clearDyn(t);
    if (this.current === t) this.current = null;
    // Delante de la piedra, del lado contrario al recinto (si el jugador sigue vivo).
    if (!this._isDead()) {
      const dx = t.x - t.arena.x;
      const dz = t.z - t.arena.z;
      const d = Math.hypot(dx, dz) || 1;
      this._teleport(t.x + (dx / d) * 4, t.y + 0.2, t.z + (dz / d) * 4);
    }
  }

  // ---- Interacción (provider) ------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    if (!this._isHome()) return [];
    const out = [];
    for (const t of this.temples) {
      const def = CHALLENGE_TYPES[t.type];
      if (Math.hypot(t.x - x, t.z - z) <= range + 4) {
        out.push({
          id: `temple:${t.id}:stone`, x: t.x, y: t.y + 2.6, z: t.z, aimRadius: 1.8, reach: 2.5,
          label: `🏛️ Templo de retos · ${def.ICON} ${def.NAME}`,
          action: t.done ? 'Superado' : t.open > 0 ? 'Cruza el portal' : 'Abrir', key: 'E',
        });
      }
      const ex = exitPos(t, this._cfg);
      if (Math.hypot(ex.x - x, ex.z - z) <= range + 3) {
        out.push({ id: `temple:${t.id}:exit`, x: ex.x, y: t.arena.y + 1.6, z: ex.z, aimRadius: 1.3, reach: 2, label: '🌀 Portal de salida', action: 'Salir', key: 'E' });
      }
      if (this.current === t && t.type === 'EXPLORE' && t.challenge && !t.result) {
        for (const r of t.challenge.relics) {
          if (r.found || Math.hypot(r.x - x, r.z - z) > range + 2) continue;
          out.push({ id: `temple:${t.id}:relic:${r.id}`, x: r.x, y: t.arena.y + 1.1, z: r.z, aimRadius: 0.8, reach: 1.6, label: '✨ Reliquia', action: 'Coger', key: 'E' });
        }
      }
    }
    return out;
  }

  interact(id) {
    const m = /^temple:(.+):(stone|exit|relic:(.+))$/.exec(id);
    if (!m) return false;
    const t = this.temples.find((x) => x.id === m[1]);
    if (!t) return false;
    if (m[2] === 'stone') {
      if (t.done) return this._say('🏛️ Ya superaste este templo.', 'info');
      if (t.open > 0) return this._say('🌀 El portal está abierto: crúzalo.', 'info');
      t.open = this._cfg.PORTAL_TIME;
      this._events.emit(GameEvents.TEMPLE_OPENED, { id: t.id });
      return this._say('🏛️ La piedra se abre y deja ver un portal… crúzalo para entrar.', 'biome');
    }
    if (m[2] === 'exit') {
      if (this.current === t && t.challenge && !t.result) this._say('🌀 Abandonas el reto.', 'info');
      this.leave(t);
      return true;
    }
    if (this.current === t && t.challenge?.collect?.(m[3])) {
      const found = t.challenge.relics.filter((r) => r.found).length;
      this._syncDyn(t);
      return this._say(`✨ Reliquia ${found} de ${t.challenge.relics.length}.`, 'pickup');
    }
    return false;
  }

  _say(text, type) {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return true;
  }

  // ---- Elementos del reto (balizas, runas, reliquias) -------------------------------------

  _buildDyn(t) {
    this._clearDyn(t);
    const g = new THREE.Group();
    const c = t.challenge;
    const y = t.arena.y;
    g.userData.items = [];
    const glow = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.3 });
    if (t.type === 'RACE') {
      c.points.forEach((p) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 3.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
        m.position.set(p.x, y + 1.6, p.z);
        g.add(m);
        g.userData.items.push(m);
      });
    } else if (t.type === 'PUZZLE') {
      c.plates.forEach((p, i) => {
        const plate = new THREE.Group();
        plate.position.set(p.x, y + 0.08, p.z);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.16, 16), glow(0x3a7fd0));
        plate.add(m);
        // Marca del orden: tantos puntos como su número.
        for (let k = 0; k <= i; k++) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
          dot.position.set((k - i / 2) * 0.45, 0.12, 0);
          plate.add(dot);
        }
        g.add(plate);
        g.userData.items.push(m);
      });
    } else if (t.type === 'EXPLORE') {
      c.relics.forEach((r) => {
        const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), glow(0xffd23f));
        m.position.set(r.x, y + 1.1, r.z);
        g.add(m);
        g.userData.items.push(m);
      });
    }
    t.dyn = g;
    this.group.add(g);
    this._syncDyn(t);
  }

  _syncDyn(t) {
    const c = t.challenge;
    const items = t.dyn?.userData.items ?? [];
    if (!c) return;
    if (t.type === 'RACE') {
      items.forEach((m, i) => {
        m.visible = i >= c.next;
        m.material.opacity = i === c.next ? 0.75 + Math.sin(this._t * 6) * 0.2 : 0.18;
      });
    } else if (t.type === 'PUZZLE') {
      items.forEach((m, i) => {
        m.material.color.setHex(c.lit(i) ? 0x7dff7a : 0x3a7fd0);
        m.material.emissive.setHex(c.lit(i) ? 0x7dff7a : 0x3a7fd0);
      });
    } else if (t.type === 'EXPLORE') {
      items.forEach((m, i) => {
        m.visible = !c.relics[i].found;
        m.rotation.y += 0.03;
      });
    }
  }

  _clearDyn(t) {
    if (!t.dyn) return;
    this.group.remove(t.dyn);
    t.dyn.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    t.dyn = null;
  }

  // ---- Guardar --------------------------------------------------------------------------

  snapshot() {
    return { done: this.temples.filter((t) => t.done).map((t) => t.id) };
  }

  restore(d) {
    if (!d || typeof d !== 'object') return;
    const ids = new Set(Array.isArray(d.done) ? d.done.filter((v) => typeof v === 'string') : []);
    for (const t of this.temples) t.done = ids.has(t.id);
  }
}

// ---- Modelos ------------------------------------------------------------------------------

const STONE = 0x7d786c;
const STONE_DARK = 0x5d5952;

/** Portal de salida: dentro del recinto, junto al muro por donde se entra. */
function exitPos(t, cfg) {
  return { x: t.arena.x, z: t.arena.z + cfg.ARENA_RADIUS - 2.2 };
}

/** Monolito de dos mitades con una runa azul; al abrirse, un portal entre ellas. */
function buildMonolith(t, parent) {
  const g = new THREE.Group();
  g.name = `temple:${t.id}`;
  g.position.set(t.x, t.y, t.z);
  // De frente hacia el lado contrario del recinto (por donde llega el jugador).
  g.rotation.y = Math.atan2(t.x - t.arena.x, t.z - t.arena.z);
  const stone = new THREE.MeshLambertMaterial({ color: STONE, flatShading: true });
  const halves = [-1, 1].map((s) => {
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.4), stone);
    h.position.set(s * 0.78, 3, 0);
    h.castShadow = true;
    g.add(h);
    return h;
  });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 10), new THREE.MeshLambertMaterial({ color: STONE_DARK, flatShading: true }));
  base.position.y = 0.3;
  const runeMat = new THREE.MeshStandardMaterial({ color: 0x59d8ff, emissive: 0x2a9ad0, emissiveIntensity: 1, roughness: 0.3 });
  const rune = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 24), runeMat);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.05), runeMat);
  rune.add(ring, bar);
  rune.position.set(0, 3.4, 0.73);
  halves[0].add(rune); // la runa se parte con la piedra (va con la mitad izquierda)
  rune.position.x = 0.78;
  const portal = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.1, 8, 32), new THREE.MeshBasicMaterial({ color: 0xbff0ff }));
  portal.add(disc, edge);
  portal.position.y = 2.6;
  portal.scale.y = 1.6;
  portal.visible = false;
  g.add(base, portal);
  parent.add(g);
  Object.assign(t, { halves, rune: { material: runeMat }, portal });
}

/** Recinto del templo: suelo de losas, muro circular con almenas, columnas y altar. */
function buildArena(t, cfg, parent) {
  const g = new THREE.Group();
  g.name = `templeArena:${t.id}`;
  const { x, y, z } = t.arena;
  g.position.set(x, y, z);
  const R = cfg.ARENA_RADIUS;
  const stone = new THREE.MeshLambertMaterial({ color: STONE, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: STONE_DARK, flatShading: true });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1.4, 1.2, 32), new THREE.MeshLambertMaterial({ color: 0x9a948a, flatShading: true }));
  floor.position.y = -0.5;
  floor.receiveShadow = true;
  g.add(floor);
  const n = 24;
  const seg = (2 * Math.PI * (R + 0.6)) / n + 0.35;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.BoxGeometry(seg, cfg.WALL_HEIGHT, 1), i % 2 ? stone : dark);
    w.position.set(Math.cos(a) * (R + 0.6), cfg.WALL_HEIGHT / 2, Math.sin(a) * (R + 0.6));
    w.rotation.y = -a + Math.PI / 2;
    w.castShadow = true;
    g.add(w);
    const merlon = new THREE.Mesh(new THREE.BoxGeometry(seg * 0.45, 0.8, 1), dark);
    merlon.position.set(Math.cos(a) * (R + 0.6), cfg.WALL_HEIGHT + 0.4, Math.sin(a) * (R + 0.6));
    merlon.rotation.y = w.rotation.y;
    g.add(merlon);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 4.5, 8), stone);
    c.position.set(Math.cos(a) * 12.5, 2.25, Math.sin(a) * 12.5);
    c.castShadow = true;
    g.add(c);
  }
  const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.7, 10), dark);
  altar.position.y = 0.35;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x59d8ff, emissive: 0x2a9ad0, emissiveIntensity: 1.2 }));
  crystal.position.y = 1.4;
  crystal.scale.y = 1.6;
  // Portal de salida, junto al muro.
  const ex = exitPos(t, cfg);
  const exit = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 28), new THREE.MeshBasicMaterial({ color: 0x9ae6ff }));
  exit.position.set(ex.x - x, 1.6, ex.z - z);
  const exitDisc = new THREE.Mesh(new THREE.CircleGeometry(1.05, 28), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  exit.add(exitDisc);
  g.add(altar, crystal, exit);
  parent.add(g);
  t.exit = exit;
}

/** Colisiones: la piedra, el muro del recinto (círculos seguidos), columnas y altar. */
function colliderPrims(t, cfg) {
  const prims = [{ x: t.x, z: t.z, r: 1.2, y0: t.y - 1, y1: t.y + 6, wall: true }];
  const { x, y, z } = t.arena;
  const R = cfg.ARENA_RADIUS + 0.6;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    prims.push({ x: x + Math.cos(a) * R, z: z + Math.sin(a) * R, r: 1, y0: y - 2, y1: y + cfg.WALL_HEIGHT, wall: true });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    prims.push({ x: x + Math.cos(a) * 12.5, z: z + Math.sin(a) * 12.5, r: 0.75, y0: y - 1, y1: y + 4.5, wall: true });
  }
  prims.push({ x, z, r: 1.5, y0: y - 1, y1: y + 0.7, wall: true, walk: true });
  return prims;
}
