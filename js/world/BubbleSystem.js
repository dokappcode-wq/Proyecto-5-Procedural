import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * BubbleSystem — burbujas de oxígeno: una cúpula transparente con un generador
 * en el centro. Con una batería plank dentro, dentro de la cúpula se respira (y
 * hace una temperatura agradable); sin batería es solo una cúpula vacía.
 *
 * Cada burbuja pertenece a un cuerpo y se ve solo en él. Las baterías se gastan
 * aunque el jugador esté en otro cuerpo.
 *
 * Provider de InteractionSystem: generador (poner/quitar batería) y asa para
 * recogerla (solo apagada).
 */
export class BubbleSystem {
  constructor({ scene, worlds, events, inventory, config, batteries, player, blockers = [] }) {
    this.name = 'bubbles';
    this._worlds = worlds;
    this._events = events;
    this._inventory = inventory;
    this._cfg = config;       // LIFE_SUPPORT
    this._bat = batteries;    // SHIP.BATTERIES
    this._player = player;
    this._blockers = blockers;
    this.root = new THREE.Group();
    this.root.name = 'bubbles';
    scene.add(this.root);
    this.list = [];
    this._nextId = 1;
    this._time = 0;
    this._domeGeo = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    this._gridGeo = new THREE.SphereGeometry(1.002, 18, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    events.on(GameEvents.WORLD_GENERATED, () => this.clear());
  }

  clear() {
    for (const b of this.list) this.root.remove(b.mesh);
    this.list.length = 0;
  }

  /** Coloca una burbuja delante del jugador (usa el objeto del inventario). */
  placeInFront(itemId) {
    const body = this._worlds.activeId;
    const profile = this._worlds.profile();
    if (profile?.KIND === 'SPACE') return this._msg('En el espacio no hay dónde apoyar la burbuja.', 'danger');
    const p = this._player.position;
    const yaw = this._player.yaw;
    const x = p.x - Math.sin(yaw) * 3;
    const z = p.z - Math.cos(yaw) * 3;
    const world = this._worlds.get(body);
    if (world.water?.isWater?.(x, z)) return this._msg('No se puede colocar en el agua.', 'danger');
    if (this._blockers.some((bl) => bl.overlapsBox({ minX: x - 0.6, maxX: x + 0.6, minZ: z - 0.6, maxZ: z + 0.6 }, 0))) {
      return this._msg('La nave está en medio.', 'danger');
    }
    if (this.list.some((b) => b.body === body && Math.hypot(b.x - x, b.z - z) < this._cfg.BUBBLE_RADIUS * 1.2)) {
      return this._msg('Ya hay una burbuja aquí al lado.', 'danger');
    }
    if (!this._inventory.removeItem(itemId, 1)) return false;
    const b = { id: this._nextId++, body, x, z, y: world.getHeightAt(x, z), radius: this._cfg.BUBBLE_RADIUS, battery: null };
    b.mesh = this._build(b);
    this.root.add(b.mesh);
    this.list.push(b);
    this._msg('Burbuja desplegada. Pon una batería plank en el generador (E) para llenarla de aire.', 'biome');
    return true;
  }

  _build(b) {
    const g = new THREE.Group();
    g.position.set(b.x, b.y, b.z);
    const dome = new THREE.Mesh(
      this._domeGeo,
      new THREE.MeshStandardMaterial({
        color: 0x9fdcff, transparent: true, opacity: 0.1, roughness: 0.1, metalness: 0.1,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    dome.scale.setScalar(b.radius);
    dome.position.y = -1;
    dome.renderOrder = 1;
    g.add(dome);
    // Malla de la cúpula: se ve la burbuja aunque el fondo sea claro.
    const grid = new THREE.Mesh(
      this._gridGeo,
      new THREE.MeshBasicMaterial({ color: 0x7fd8ff, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false, fog: false }),
    );
    grid.scale.setScalar(b.radius);
    grid.position.y = -1;
    g.add(grid);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(b.radius, 0.12, 6, 64),
      new THREE.MeshStandardMaterial({ color: 0x7a838c, metalness: 0.6, roughness: 0.4 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.9;
    g.add(ring);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x5d6670, roughness: 0.6 }));
    base.position.y = 0.45;
    base.castShadow = true;
    g.add(base);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xff5a4a, emissiveIntensity: 1 }),
    );
    lamp.position.y = 1.05;
    g.add(lamp);
    g.userData = { dome, lamp, grid };
    return g;
  }

  /** ¿(x, y, z) está dentro de una burbuja encendida del cuerpo `body`? */
  contains(body, x, y, z) {
    for (const b of this.list) {
      if (b.body !== body || !b.battery) continue;
      const dy = y - (b.y - 1);
      if (dy < -2) continue;
      if (Math.hypot(x - b.x, Math.max(0, dy), z - b.z) < b.radius - 0.3) return true;
    }
    return false;
  }

  update(dt) {
    this._time += dt;
    const active = this._worlds.activeId;
    for (const b of this.list) {
      if (b.battery) {
        b.battery.charge = Math.max(0, b.battery.charge - dt / this._cfg.BUBBLE_BATTERY_TIME);
        if (b.battery.charge === 0 && !b.battery.warned) {
          b.battery.warned = true;
          this._msg('Una burbuja de oxígeno se ha quedado sin batería: dentro ya no hay aire.', 'danger');
          this._events.emit(GameEvents.BUBBLE_CHANGED, { id: b.id, powered: false });
        }
      }
      b.mesh.visible = b.body === active;
      if (!b.mesh.visible) continue;
      const on = this.isPowered(b);
      const { dome, lamp, grid } = b.mesh.userData;
      dome.material.opacity = on ? 0.14 + Math.sin(this._time * 1.5) * 0.02 : 0.05;
      grid.material.opacity = on ? 0.28 : 0.1;
      lamp.material.color.set(on ? 0x5fe08a : 0xff5a4a);
      lamp.material.emissive.set(on ? 0x5fe08a : 0xff5a4a);
    }
  }

  isPowered(b) {
    return !!b.battery && b.battery.charge > 0;
  }

  // ---- Interacción ---------------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    const out = [];
    const active = this._worlds.activeId;
    for (const b of this.list) {
      if (b.body !== active || Math.hypot(b.x - x, b.z - z) > range + 2) continue;
      const pct = b.battery ? Math.round(b.battery.charge * 100) : 0;
      out.push({
        id: `GEN:${b.id}`, x: b.x, y: b.y + 0.9, z: b.z, aimRadius: 0.6, reach: 0.7,
        label: `🫧 Burbuja de oxígeno · ${b.battery ? `🔋 ${pct} %` : 'sin batería'}`,
        action: b.battery ? 'Quitar la batería' : this._inventory.hasItem(this._bat.ITEM, 1) ? 'Poner batería plank' : 'Recoger la burbuja',
        key: 'E',
      });
    }
    return out;
  }

  interact(id) {
    const b = this.list.find((x) => `GEN:${x.id}` === id);
    if (!b) return false;
    const inv = this._inventory;
    if (b.battery) {
      inv.addItem(b.battery.charge > 0.5 ? this._bat.ITEM : this._bat.EMPTY_ITEM, 1);
      b.battery = null;
      this._msg('Batería retirada: la burbuja se vacía de aire.');
      this._events.emit(GameEvents.BUBBLE_CHANGED, { id: b.id, powered: false });
    } else if (inv.hasItem(this._bat.ITEM, 1)) {
      inv.removeItem(this._bat.ITEM, 1);
      b.battery = { charge: 1 };
      this._msg('Burbuja encendida: dentro se puede respirar y construir.', 'biome');
      this._events.emit(GameEvents.BUBBLE_CHANGED, { id: b.id, powered: true });
    } else {
      this.root.remove(b.mesh);
      this.list.splice(this.list.indexOf(b), 1);
      inv.addItem('OXYGEN_BUBBLE', 1);
      this._msg('Recoges la burbuja de oxígeno.');
    }
    return true;
  }

  getState() {
    return this.list.map((b) => ({ id: b.id, body: b.body, x: b.x, z: b.z, battery: b.battery?.charge ?? null }));
  }

  _msg(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
    return false;
  }
}
