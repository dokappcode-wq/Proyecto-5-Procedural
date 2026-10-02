import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * ChopEffects — lo que se ve al golpear un tronco (solo presentación):
 *   - astillas que saltan hacia el jugador a cada golpe;
 *   - con el último golpe, el árbol cae hacia el lado contrario al jugador,
 *     rebota un poco y se hunde en el suelo.
 */
const CHIPS_PER_HIT = 7;
const FALL_TIME = 1.5;   // s hasta tocar el suelo
const SINK_TIME = 1.2;   // s hundiéndose después

export class ChopEffects {
  constructor({ scene, events, worlds }) {
    this.name = 'chopEffects';
    this._scene = scene;
    this._worlds = worlds;
    this._chipGeo = new THREE.BoxGeometry(0.09, 0.05, 0.14);
    this._chipMat = new THREE.MeshLambertMaterial({ color: 0xc89a5e });
    this._stoneMat = new THREE.MeshLambertMaterial({ color: 0x8e8b86 });
    this._webMat = new THREE.MeshLambertMaterial({ color: 0xf2f5f7 });
    this._chips = [];
    this._falling = [];
    events.on(GameEvents.RESOURCE_HIT, (e) => this._onHit(e));
    events.on(GameEvents.BODY_CHANGED, () => this.clear());
  }

  _onHit({ node, x, y, z, fromX, fromZ, felled, material, small }) {
    const stone = material === 'stone';
    const dx = fromX - x;
    const dz = fromZ - z;
    const d = Math.hypot(dx, dz) || 1;
    const r = Math.max(0.25, node.radius ?? 0.4);
    // Roca rota: muchas esquirlas en todas direcciones; puñetazo: unas pocas.
    const count = stone ? (felled ? 22 : small ? 3 : CHIPS_PER_HIT) : CHIPS_PER_HIT;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this._chipGeo, stone ? this._stoneMat : material === 'web' ? this._webMat : this._chipMat);
      if (stone) m.scale.setScalar(felled ? 1.6 + Math.random() : 1.2);
      m.position.set(x + (dx / d) * r, y + (Math.random() - 0.3) * 0.4, z + (dz / d) * r);
      m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
      const spread = (Math.random() - 0.5) * 2.5;
      const v = new THREE.Vector3((dx / d) * 2.2 + (-dz / d) * spread, 1.8 + Math.random() * 1.6, (dz / d) * 2.2 + (dx / d) * spread);
      this._scene.add(m);
      this._chips.push({ m, v, life: 0.7 + Math.random() * 0.3 });
    }
    if (felled && !stone && material !== 'web') this._fell(node, -dx / d, -dz / d);
  }

  /** El árbol cae hacia (fx, fz) girando sobre la base. */
  _fell(node, fx, fz) {
    const mesh = this._worlds.active?.propMesh?.(node);
    if (!mesh) return;
    mesh.castShadow = true;
    mesh.rotation.y = node.rotation;
    mesh.scale.setScalar(node.scale);
    const pivot = new THREE.Group();
    pivot.position.set(node.x, node.y - 0.12, node.z);
    pivot.add(mesh);
    this._scene.add(pivot);
    // Eje de giro: horizontal y perpendicular a la dirección de caída.
    const axis = new THREE.Vector3(fz, 0, -fx).normalize();
    this._falling.push({ pivot, mesh, axis, t: 0 });
  }

  update(dt) {
    for (const c of this._chips) {
      c.life -= dt;
      c.v.y -= 9.8 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += dt * 8;
      if (c.life <= 0) this._scene.remove(c.m);
    }
    this._chips = this._chips.filter((c) => c.life > 0);

    for (const f of this._falling) {
      f.t += dt;
      const k = Math.min(1, f.t / FALL_TIME);
      // Cae acelerando (k²) hasta casi tumbarse y rebota un poco al final.
      let angle = (Math.PI / 2 - 0.06) * k * k;
      if (k >= 1) angle -= Math.sin(Math.min(1, (f.t - FALL_TIME) / 0.25) * Math.PI) * 0.05;
      f.pivot.quaternion.setFromAxisAngle(f.axis, angle);
      if (f.t > FALL_TIME + 0.3) f.pivot.position.y -= dt * 1.2 * node2(f);
    }
    this._falling = this._falling.filter((f) => {
      if (f.t < FALL_TIME + 0.3 + SINK_TIME) return true;
      this._scene.remove(f.pivot);
      f.mesh.geometry.dispose();
      return false;
    });
  }

  clear() {
    for (const c of this._chips) this._scene.remove(c.m);
    for (const f of this._falling) {
      this._scene.remove(f.pivot);
      f.mesh.geometry.dispose();
    }
    this._chips = [];
    this._falling = [];
  }
}

const node2 = (f) => f.mesh.scale.x;
