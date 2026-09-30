import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SeededRandom } from '../core/SeededRandom.js';
import { createMeteor, normalize } from './Meteor.js';

/**
 * MeteorSystem — meteoritos que aparecen de vez en cuando cerca del rumbo de la
 * nave mientras está en el espacio.
 *
 * - Su posición está en km (como la nave en SpaceNavigation); se dibujan en el
 *   mundo en metros respecto a la nave (que está en el origen). Lejos se dibujan
 *   como impostor a VIEW_DISTANCE con su tamaño aparente.
 * - La nave no puede aterrizar en ellos (SpaceNavigation.extras): se detiene
 *   cerca y se baja con el traje (EVA). Su gravedad atrae al jugador (gravityAt).
 * - Tienen cúmulos de cristales: E para picar mineral (provider de InteractionSystem).
 */
const tmpQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

export class MeteorSystem {
  constructor({ scene, config, events, inventory, items, getNav, isInSpace, getSeed }) {
    this.name = 'meteors';
    this._cfg = config;
    this._events = events;
    this._inventory = inventory;
    this._items = items;
    this._getNav = getNav;
    this._isInSpace = isInSpace;
    this._getSeed = getSeed;
    this.root = new THREE.Group();
    this.root.name = 'meteors';
    this.root.visible = false;
    scene.add(this.root);
    this.list = [];
    this._counter = 0;
    this._timer = config.FIRST_DELAY;
    this._rng = new SeededRandom(1);
    this._crystalGeo = new THREE.OctahedronGeometry(0.5, 0);
    this._crystalMat = new THREE.MeshStandardMaterial({ color: 0x5fd8ff, emissive: 0x2a9fd0, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.2, flatShading: true });
    this._v = new THREE.Vector3();
    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => {
      if (state === 'SPACE') {
        this._rng = new SeededRandom((getSeed() ^ 0x3e7e0 ^ (this._counter * 7919)) >>> 0);
        this._timer = config.FIRST_DELAY;
      } else if (state === 'SURFACE') {
        this.clear();
      }
    });
    events.on(GameEvents.WORLD_GENERATED, () => {
      this.clear();
      this._counter = 0;
    });
  }

  clear() {
    for (const m of this.list) this._dispose(m);
    this.list.length = 0;
  }

  /** Para SpaceNavigation: obstáculos donde no se aterriza y destinos del rumbo automático. */
  extras() {
    const c = this._cfg;
    return this.list.map((m) => ({
      id: m.id, name: 'Meteorito', position: m.position, radiusKm: m.radius / 1000,
      stopKm: c.STOP_DISTANCE_M / 1000, minKm: c.MIN_DISTANCE_M / 1000,
    }));
  }

  /** El meteorito más cercano a la nave: { meteor, distanceM } (distancia a la superficie). */
  nearest() {
    const nav = this._getNav();
    let best = null;
    for (const m of this.list) {
      const d = Math.hypot(m.position.x - nav.pos.x, m.position.y - nav.pos.y, m.position.z - nav.pos.z) * 1000 - m.radius;
      if (!best || d < best.distanceM) best = { meteor: m, distanceM: d };
    }
    return best;
  }

  /** Centro del meteorito en el mundo en metros (la nave está en el origen). */
  localCenter(m, out = new THREE.Vector3()) {
    const nav = this._getNav();
    return out.set((m.position.x - nav.pos.x) * 1000, (m.position.y - nav.pos.y) * 1000, (m.position.z - nav.pos.z) * 1000);
  }

  /** Crea un meteorito a `distanceKm` en la dirección `dir` desde la nave. */
  spawn(dir, distanceKm) {
    const c = this._cfg;
    const nav = this._getNav();
    const id = `METEOR_${++this._counter}`;
    const m = createMeteor({
      id,
      seed: (this._getSeed() ^ Math.imul(this._counter, 2654435761)) >>> 0,
      position: { x: nav.pos.x + dir.x * distanceKm, y: nav.pos.y + dir.y * distanceKm, z: nav.pos.z + dir.z * distanceKm },
      radiusRange: c.RADIUS,
      crystals: c.CRYSTALS,
      yields: c.YIELD,
    });
    m.mesh = this._build(m);
    this.root.add(m.mesh);
    this.list.push(m);
    this._events.emit(GameEvents.METEOR_SPAWNED, { id, distanceKm });
    return m;
  }

  _build(m) {
    const g = new THREE.Group();
    g.name = m.id;
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const d = normalize(pos.getX(i), pos.getY(i), pos.getZ(i));
      const r = m.surfaceRadius(d);
      pos.setXYZ(i, d.x * r, d.y * r, d.z * r);
    }
    geo.computeVertexNormals();
    const rng = new SeededRandom(m.seed ^ 0xabc);
    const tone = new THREE.Color().setHSL(rng.range(0.03, 0.1), rng.range(0.08, 0.2), rng.range(0.22, 0.34));
    const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: tone, roughness: 0.95, metalness: 0.05, flatShading: true }));
    g.add(rock);
    m.crystalMeshes = m.deposits.map((dep) => {
      const cg = new THREE.Group();
      const r = m.surfaceRadius(dep.dir);
      cg.position.set(dep.dir.x * r, dep.dir.y * r, dep.dir.z * r);
      cg.quaternion.copy(tmpQ.setFromUnitVectors(UP, this._v.set(dep.dir.x, dep.dir.y, dep.dir.z)));
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(this._crystalGeo, this._crystalMat);
        const a = (k / 4) * Math.PI * 2 + dep.index;
        c.position.set(Math.cos(a) * 0.5 * (k ? 1 : 0), 0.4 + (k ? 0 : 0.3), Math.sin(a) * 0.5 * (k ? 1 : 0));
        c.scale.set(0.6 * dep.scale, (k ? 1.4 : 2.2) * dep.scale, 0.6 * dep.scale);
        c.rotation.set(k ? 0.3 : 0, a, k ? 0.25 : 0);
        cg.add(c);
      }
      g.add(cg);
      return cg;
    });
    return g;
  }

  _dispose(m) {
    this.root.remove(m.mesh);
    m.mesh.children[0]?.geometry?.dispose();
    m.mesh.children[0]?.material?.dispose();
  }

  update(dt) {
    const inSpace = this._isInSpace();
    this.root.visible = inSpace;
    if (!inSpace) return;
    const c = this._cfg;
    const nav = this._getNav();
    // Aparición de vez en cuando, por delante de la nave.
    this._timer -= dt;
    if (this._timer <= 0) {
      this._timer = this._rng.range(c.INTERVAL[0], c.INTERVAL[1]);
      const near = this.list.filter((m) => this._distKm(m) < c.SPAWN_DISTANCE_KM[1] * 2).length;
      if (this.list.length < c.MAX && near === 0) {
        const f = nav.forward;
        const t = this._rng.range(0.1, c.SPAWN_CONE);
        const r = normalize(this._rng.range(-1, 1), this._rng.range(-1, 1), this._rng.range(-1, 1));
        const dot = r.x * f.x + r.y * f.y + r.z * f.z;
        const p = normalize(r.x - f.x * dot, r.y - f.y * dot, r.z - f.z * dot);
        const dir = normalize(f.x * Math.cos(t) + p.x * Math.sin(t), f.y * Math.cos(t) + p.y * Math.sin(t), f.z * Math.cos(t) + p.z * Math.sin(t));
        this.spawn(dir, this._rng.range(c.SPAWN_DISTANCE_KM[0], c.SPAWN_DISTANCE_KM[1]));
      }
    }
    // Se olvidan los que quedan muy atrás.
    for (const m of [...this.list]) {
      if (this._distKm(m) > c.DESPAWN_KM && nav.autopilotTarget !== m.id) {
        this._dispose(m);
        this.list.splice(this.list.indexOf(m), 1);
      }
    }
    // Colocación en metros respecto a la nave (impostor si está lejos).
    for (const m of this.list) {
      const v = this.localCenter(m, this._v);
      const d = v.length();
      let k = d > c.VIEW_DISTANCE ? c.VIEW_DISTANCE / d : 1;
      if (d > c.VIEW_DISTANCE) k = Math.max(k, (c.MIN_APPARENT_M ?? 0) / m.radius); // lejos: al menos un punto visible
      m.mesh.position.copy(v).multiplyScalar(k);
      m.mesh.scale.setScalar(k);
      m.mesh.rotation.y += dt * 0.0; // quietos: se camina sobre ellos
      m.crystalMeshes.forEach((cg, i) => (cg.visible = m.deposits[i].left > 0));
    }
  }

  _distKm(m) {
    const nav = this._getNav();
    return Math.hypot(m.position.x - nav.pos.x, m.position.y - nav.pos.y, m.position.z - nav.pos.z);
  }

  /**
   * Gravedad en el punto (metros): el meteorito que atrae, con su centro, la
   * dirección hacia fuera y la altura sobre la superficie. null si ninguno atrae.
   */
  gravityAt(p) {
    if (!this._isInSpace()) return null;
    let best = null;
    for (const m of this.list) {
      const c = this.localCenter(m, new THREE.Vector3());
      const rel = new THREE.Vector3(p.x - c.x, p.y - c.y, p.z - c.z);
      const dist = rel.length();
      if (dist < 1e-6) continue;
      const dir = rel.divideScalar(dist);
      const surface = m.surfaceRadius(dir);
      const height = dist - surface;
      if (height > this._cfg.GRAVITY_RANGE_M) continue;
      if (!best || height < best.height) best = { meteor: m, center: c, dir, surface, height, gravity: this._cfg.GRAVITY };
    }
    return best;
  }

  // ---- Minería (provider de InteractionSystem) ----------------------------------------

  getInteractablesNear(x, y, z, range) {
    const out = [];
    if (!this._isInSpace()) return out;
    for (const m of this.list) {
      const c = this.localCenter(m, this._v);
      if (Math.hypot(x - c.x, y - c.y, z - c.z) > m.radius * 1.6 + range + 5) continue;
      for (const dep of m.deposits) {
        if (dep.left <= 0) continue;
        const r = m.surfaceRadius(dep.dir) + 0.6;
        const px = c.x + dep.dir.x * r;
        const py = c.y + dep.dir.y * r;
        const pz = c.z + dep.dir.z * r;
        if (Math.hypot(px - x, py - y, pz - z) > range + 1.5) continue;
        out.push({ id: `${m.id}:${dep.index}`, x: px, y: py, z: pz, aimRadius: 0.9, reach: 0.9, label: `💎 Cristales de mineral (${dep.left})`, action: 'Picar', key: 'E' });
      }
    }
    return out;
  }

  interact(id) {
    const i = id.lastIndexOf(':');
    const m = this.list.find((x) => x.id === id.slice(0, i));
    const dep = m?.deposits[Number(id.slice(i + 1))];
    if (!dep || dep.left <= 0) return false;
    dep.left--;
    const n = this._cfg.MINERAL_PER_HIT;
    this._inventory.addItem('MINERAL', n);
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'harvest' });
    if (!dep.left) this._events.emit(GameEvents.UI_MESSAGE, { text: 'Cúmulo de cristales agotado.', type: 'info' });
    return true;
  }

  /** Etiquetas en pantalla para el HUD del espacio. */
  screenLabels(camera, width, height) {
    const out = [];
    for (const m of this.list) {
      const v = this._v.copy(m.mesh.position);
      const d = this.localCenter(m, new THREE.Vector3()).length() - m.radius;
      v.project(camera);
      // Fuera de la pantalla (o detrás): indicador en el borde con una flecha hacia él.
      let x = v.x;
      let y = v.y;
      const behind = v.z > 1;
      if (behind) {
        x = -x;
        y = -y;
      }
      const onScreen = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9;
      let arrow = '';
      if (!onScreen) {
        const s = 0.9 / Math.max(Math.abs(x), Math.abs(y), 1e-6);
        x *= s;
        y *= s;
        const a = Math.atan2(y, x);
        arrow = ['➡️', '↗️', '⬆️', '↖️', '⬅️', '↙️', '⬇️', '↘️'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] + ' ';
      }
      out.push({
        id: m.id,
        name: 'Meteorito',
        text: `${arrow}☄️ Meteorito · ${d >= 1000 ? `${(d / 1000).toFixed(d >= 100000 ? 0 : 1)} km` : `${Math.max(0, Math.round(d))} m`}`,
        x: (x * 0.5 + 0.5) * width,
        y: (-y * 0.5 + 0.5) * height - (onScreen ? 12 : 0),
        visible: true,
      });
    }
    return out;
  }
}
