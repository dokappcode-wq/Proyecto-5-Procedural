import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom, hashString } from '../core/SeededRandom.js';

/**
 * TreasureSystem — ruinas y mapas del tesoro (P8).
 *
 * - Hay TREASURE.RUINS ruinas repartidas por la isla (siempre en el mismo sitio en cada
 *   mapa diseñado), más las Ruinas del Viejo Jardín. Cada una guarda un tesoro enterrado.
 * - Un mapa del tesoro (lo vende el mercader, sale en las bases goblin) marca una ruina
 *   aún sin desenterrar: en ella aparece una X con un haz de luz que se ve de lejos.
 * - Con la pala en la mano, E sobre la X: se cava y sale el tesoro (TREASURE.LOOT).
 * Provider de InteractionSystem. Se guarda: marcadas y encontradas.
 */
export class TreasureSystem {
  constructor({ config, items, inventory, hotbar, events, scene, colliders = null, isHome = () => true, random = Math.random }) {
    this.name = 'treasure';
    this._cfg = config;
    this._items = items;
    this._inv = inventory;
    this._hotbar = hotbar;
    this._events = events;
    this._scene = scene;
    this._colliders = colliders;
    this._isHome = isHome;
    this._random = random;
    this.ruins = [];          // { id, x, y, z, name, marked, found }
    this.group = new THREE.Group();
    this.group.name = 'Ruins';
    scene.add(this.group);
    this._markers = new Map();
    this._t = 0;
  }

  /** Coloca las ruinas en el mundo (al generarlo). `world`: getHeightAt, getBounds, getSpawnPoint, map?, water. */
  setup(world) {
    this.group.clear();
    this._markers.clear();
    this.ruins = [];
    const key = world.map?.meta?.id ?? world.seed?.value ?? world.seed ?? 'world';
    const rng = new SeededRandom(hashString(`ruins:${key}`));
    const b = world.getBounds();
    const sp = world.getSpawnPoint();
    const pois = world.map?.meta?.pois ?? [];
    const sites = Object.values(world.sites ?? {}).flat();
    // Las Ruinas del Viejo Jardín (lugar del mapa) también guardan un tesoro.
    const garden = pois.find((p) => p.kind === 'ruins');
    if (garden) this.ruins.push({ id: 'garden', x: garden.x + 6, z: garden.z - 4, name: garden.name, decor: false });
    const ok = (x, z) => {
      if (Math.hypot(x - sp.x, z - sp.z) < this._cfg.MIN_FROM_SPAWN) return false;
      const h = world.getHeightAt(x, z);
      if (h < 3 || world.water?.isWater?.(x, z, 6)) return false;
      if (world.isCaveHole?.(x, z)) return false;
      let lo = Infinity;
      let hi = -Infinity;
      for (let a = 0; a < 8; a++) {
        const hh = world.getHeightAt(x + Math.cos(a * 0.785) * 6, z + Math.sin(a * 0.785) * 6);
        lo = Math.min(lo, hh);
        hi = Math.max(hi, hh);
      }
      if (hi - lo > 2.5) return false;
      if (this.ruins.some((r) => Math.hypot(r.x - x, r.z - z) < 260)) return false;
      if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < (s.radius ?? 20) + 40)) return false;
      return !pois.some((p) => Math.hypot(p.x - x, p.z - z) < 60);
    };
    for (let tries = 0; tries < 3000 && this.ruins.length < this._cfg.RUINS + (garden ? 1 : 0); tries++) {
      const x = b.minX + 150 + rng.next() * (b.maxX - b.minX - 300);
      const z = b.minZ + 150 + rng.next() * (b.maxZ - b.minZ - 300);
      if (ok(x, z)) this.ruins.push({ id: `r${this.ruins.length}`, x, z, name: null, decor: true, seed: Math.floor(rng.next() * 1e9) });
    }
    const prims = [];
    for (const r of this.ruins) {
      r.y = world.getHeightAt(r.x, r.z);
      r.marked = false;
      r.found = false;
      if (r.decor) prims.push(...this._buildRuin(r));
    }
    this._colliders?.add('ruins', prims);
    this._world = world;
  }

  // ---- Mapas ---------------------------------------------------------------------------

  /** Usar un mapa del tesoro: marca una ruina sin desenterrar (la más cercana). */
  readMap() {
    const p = this._player?.position;
    const left = this.ruins.filter((r) => !r.found && !r.marked);
    if (!left.length) {
      this._say(this.ruins.some((r) => r.marked && !r.found) ? '🗺️ Ya tienes marcados todos los tesoros que quedan: ¡ve a cavar!' : '🗺️ Ya no quedan tesoros por desenterrar en esta isla.');
      return false;
    }
    left.sort((a, b) => (p ? Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z) : 0));
    const r = left[0];
    r.marked = true;
    this._events.emit(GameEvents.TREASURE_MARKED, { ruin: r });
    this._say(`🗺️ El mapa señala unas ruinas ${this.direction(r)}. Busca la X (un haz de luz) y cava con la pala.`, 'pickup');
    return true;
  }

  /** "al noreste, a 640 m" desde el jugador. */
  direction(r) {
    const p = this._player?.position;
    if (!p) return '';
    const dx = r.x - p.x;
    const dz = r.z - p.z;
    const d = Math.hypot(dx, dz);
    const names = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'];
    const a = (Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2); // norte = −Z
    return `al ${names[Math.round(a / (Math.PI / 4)) % 8]}, a ${Math.round(d)} m`;
  }

  /** El tesoro marcado más cercano (para el aviso del HUD), o null. */
  nearestMarked() {
    const p = this._player?.position;
    let best = null;
    for (const r of this.ruins) {
      if (!r.marked || r.found) continue;
      const d = p ? Math.hypot(r.x - p.x, r.z - p.z) : 0;
      if (!best || d < best.d) best = { ruin: r, d };
    }
    return best;
  }

  setPlayer(player) {
    this._player = player;
  }

  // ---- Cavar (provider) -------------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    if (!this._isHome()) return [];
    const out = [];
    for (const r of this.ruins) {
      if (!r.marked || r.found || Math.hypot(r.x - x, r.z - z) > range + 2) continue;
      const shovel = this._hotbar.selectedId === 'SHOVEL';
      out.push({ id: r.id, x: r.x, y: r.y + 0.3, z: r.z, aimRadius: 1.2, reach: 1.4, label: '❌ Tesoro enterrado', action: shovel ? 'Cavar' : 'Necesitas una pala', key: 'E' });
    }
    return out;
  }

  interact(id) {
    const r = this.ruins.find((x) => x.id === id);
    if (!r || r.found || !r.marked) return false;
    if (this._hotbar.selectedId !== 'SHOVEL') return this._say('🪏 Para cavar necesitas una pala en la mano.');
    r.found = true;
    const got = [];
    for (const [item, [lo, hi]] of Object.entries(this._cfg.LOOT)) {
      const n = lo + Math.floor(this._random() * (hi - lo + 1));
      if (n <= 0) continue;
      this._inv.addItem(item, n);
      got.push(`${this._items[item].ICON} ${n}`);
    }
    const idx = this._hotbar.selectedIndex;
    if (idx != null) this._inv.wearSlot(idx, 3);
    this._dropMarker(r);
    this._events.emit(GameEvents.TREASURE_FOUND, { ruin: r, loot: got });
    this._say(`💰 ¡Un cofre enterrado! ${got.join(' · ')}`, 'pickup');
    return true;
  }

  // ---- Dibujo --------------------------------------------------------------------------------

  update(dt) {
    this._t += dt;
    this.group.visible = this._isHome();
    for (const r of this.ruins) {
      const want = r.marked && !r.found;
      if (want && !this._markers.has(r.id)) this._addMarker(r);
      if (!want && this._markers.has(r.id)) this._dropMarker(r);
    }
    for (const m of this._markers.values()) {
      m.beam.material.opacity = 0.18 + Math.sin(this._t * 2.5) * 0.06;
      m.beam.rotation.y += dt * 0.5;
    }
  }

  _addMarker(r) {
    const g = new THREE.Group();
    g.position.set(r.x, r.y, r.z);
    const red = new THREE.MeshLambertMaterial({ color: 0xc8302a });
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.28), red);
      bar.rotation.y = a;
      bar.position.y = 0.05;
      g.add(bar);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 20;
    g.add(beam);
    this.group.add(g);
    this._markers.set(r.id, { group: g, beam });
  }

  _dropMarker(r) {
    const m = this._markers.get(r.id);
    if (!m) return;
    this.group.remove(m.group);
    this._markers.delete(r.id);
  }

  /** Ruina: columnas rotas, un trozo de muro, sillares caídos y musgo. Devuelve colisiones. */
  _buildRuin(r) {
    const rng = new SeededRandom(r.seed);
    const g = new THREE.Group();
    g.position.set(r.x, r.y, r.z);
    g.rotation.y = rng.next() * Math.PI * 2;
    const stone = [0xa39d90, 0x948f84, 0xb2ac9f].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
    const moss = new THREE.MeshLambertMaterial({ color: 0x5f8a3e, flatShading: true });
    const prims = [];
    const world = (lx, lz) => {
      const c = Math.cos(g.rotation.y);
      const s = Math.sin(g.rotation.y);
      return [r.x + lx * c + lz * s, r.z - lx * s + lz * c];
    };
    // Columnas en círculo, cada una rota a una altura.
    const n = 6;
    for (let i = 0; i < n; i++) {
      if (rng.next() < 0.25) continue;
      const a = (i / n) * Math.PI * 2;
      const lx = Math.cos(a) * 4.5;
      const lz = Math.sin(a) * 4.5;
      const h = 0.6 + rng.next() * 2.6;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, h, 8), stone[i % 3]);
      col.position.set(lx, h / 2, lz);
      col.rotation.z = (rng.next() - 0.5) * 0.08;
      col.castShadow = col.receiveShadow = true;
      g.add(col);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9), stone[(i + 1) % 3]);
      base.position.set(lx, 0.12, lz);
      g.add(base);
      if (rng.next() < 0.5) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), moss);
        m.position.set(lx, h, lz);
        m.scale.set(1, 0.4, 1);
        g.add(m);
      }
      const [wx, wz] = world(lx, lz);
      prims.push({ x: wx, z: wz, r: 0.42, y0: r.y - 1, y1: r.y + h, wall: true });
    }
    // Trozo de muro con hueco de ventana.
    const wall = new THREE.Group();
    wall.position.set(-1.5, 0, -6.2);
    for (let c = 0; c < 4; c++) {
      for (let k = 0; k < 5; k++) {
        if (c >= 2 && (k === 2 || rng.next() < 0.35)) continue;
        const blk = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.4, 0.5), stone[(c + k) % 3]);
        blk.position.set(-1.3 + k * 0.68 + (c % 2) * 0.2, 0.2 + c * 0.42, 0);
        blk.castShadow = true;
        wall.add(blk);
      }
    }
    g.add(wall);
    const [wx, wz] = world(-1.5, -6.2);
    prims.push({ cx: wx, cz: wz, hx: 1.8, hz: 0.3, yaw: g.rotation.y, y0: r.y - 1, y1: r.y + 1.6, wall: true });
    // Sillares y tambores de columna caídos.
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(i % 2 ? new THREE.CylinderGeometry(0.33, 0.33, 0.8, 8) : new THREE.BoxGeometry(0.7, 0.4, 0.5), stone[i % 3]);
      m.position.set((rng.next() - 0.5) * 9, 0.2, (rng.next() - 0.5) * 9);
      m.rotation.set(i % 2 ? Math.PI / 2 : 0, rng.next() * 3, rng.next() * 0.2);
      m.castShadow = true;
      g.add(m);
    }
    // Losas del suelo asomando.
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), stone[i % 3]);
      m.position.set((rng.next() - 0.5) * 6, 0.03, (rng.next() - 0.5) * 6);
      m.rotation.y = rng.next();
      m.receiveShadow = true;
      g.add(m);
    }
    this.group.add(g);
    return prims;
  }

  _say(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return false;
  }

  // ---- Guardar --------------------------------------------------------------------------

  snapshot() {
    return { marked: this.ruins.filter((r) => r.marked).map((r) => r.id), found: this.ruins.filter((r) => r.found).map((r) => r.id) };
  }

  restore(d) {
    const marked = new Set(Array.isArray(d?.marked) ? d.marked : []);
    const found = new Set(Array.isArray(d?.found) ? d.found : []);
    for (const r of this.ruins) {
      r.marked = marked.has(r.id);
      r.found = found.has(r.id);
    }
  }
}
