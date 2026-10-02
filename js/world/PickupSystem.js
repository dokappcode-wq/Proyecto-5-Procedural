import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * PickupSystem — objetos sueltos en el mundo que se recogen con E: el nodo
 * espacial caído en el planeta, cofres, el nodo galáctico… Cada uno pertenece a un
 * cuerpo (P1, P1M1…) y solo se ve y se usa cuando ese cuerpo está activo.
 *
 *   add({ id, body, x, z, model: 'NODE'|'GALACTIC_NODE'|'CHEST', label, action,
 *         contents: [{ item, count }], beacon, mapLabel, mapColor })
 *
 * Es un "provider" de InteractionSystem (getInteractablesNear / interact) y da
 * los marcadores del mapa (markers(body)).
 */
export class PickupSystem {
  constructor({ scene, worlds, events, inventory, items }) {
    this.name = 'pickups';
    this._worlds = worlds;
    this._events = events;
    this._inventory = inventory;
    this._items = items;
    this.root = new THREE.Group();
    this.root.name = 'pickups';
    scene.add(this.root);
    this._list = new Map();
    this._time = 0;
  }

  add(def) {
    this.remove(def.id);
    const p = { beacon: true, contents: [], action: 'Coger', taken: false, ...def };
    p.mesh = buildModel(p);
    p.mesh.visible = false;
    p.y = null;
    this.root.add(p.mesh);
    this._list.set(p.id, p);
    return p;
  }

  remove(id) {
    const p = this._list.get(id);
    if (!p) return;
    this.root.remove(p.mesh);
    p.mesh.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
    this._list.delete(id);
  }

  /**
   * Deja objetos en el suelo junto a (x, z) en una bolsa. Si ya hay una bolsa a
   * menos de 3 m en ese cuerpo, se meten en ella.
   */
  drop(body, x, z, item, count, dur) {
    for (const p of this._list.values()) {
      if (p.model !== 'BAG' || p.taken || p.body !== body || Math.hypot(p.x - x, p.z - z) > 3) continue;
      // Las herramientas usadas van aparte: cada una conserva su aguante.
      const same = dur == null && p.contents.find((c) => c.item === item && c.dur == null);
      if (same) same.count += count;
      else p.contents.push(dur == null ? { item, count } : { item, count, dur });
      p.label = this._bagLabel(p.contents);
      return p;
    }
    this._bagSeq = (this._bagSeq ?? 0) + 1;
    const contents = [dur == null ? { item, count } : { item, count, dur }];
    return this.add({
      id: `BAG_${this._bagSeq}`, body, x, z, model: 'BAG', label: this._bagLabel(contents), action: 'Coger', beacon: false, contents,
    });
  }

  /** "🎒 Bolsa · 🪵×12 🪨×3" (como mucho 4 tipos). */
  _bagLabel(contents) {
    const list = contents.slice(0, 4).map((c) => `${this._items[c.item]?.ICON ?? ''}×${c.count}`).join(' ');
    return `🎒 Bolsa · ${list}${contents.length > 4 ? ' …' : ''}`;
  }

  clear(body = null) {
    for (const p of [...this._list.values()]) if (!body || p.body === body) this.remove(p.id);
  }

  get(id) {
    return this._list.get(id) ?? null;
  }

  /** Marcadores para el mapa del cuerpo `body` (solo los que quedan por coger). */
  markers(body) {
    return [...this._list.values()]
      .filter((p) => p.body === body && !p.taken && p.mapLabel)
      .map((p) => ({ x: p.x, z: p.z, label: p.mapLabel, color: p.mapColor ?? '#7fd8ff' }));
  }

  _groundY(p) {
    if (p.y === null) {
      const w = this._worlds.get(p.body);
      p.y = w ? w.getHeightAt(p.x, p.z) : 0;
    }
    return p.y;
  }

  update(dt) {
    this._time += dt;
    const active = this._worlds.activeId;
    for (const p of this._list.values()) {
      const show = p.body === active && !(p.taken && p.model !== 'CHEST');
      p.mesh.visible = show;
      if (!show) continue;
      p.mesh.position.set(p.x, this._groundY(p), p.z);
      const core = p.mesh.userData.core;
      if (core) {
        core.rotation.y += dt * 1.4;
        core.position.y = 1.0 + Math.sin(this._time * 2) * 0.12;
      }
      const lid = p.mesh.userData.lid;
      if (lid) lid.rotation.x = THREE.MathUtils.lerp(lid.rotation.x, p.taken ? -1.9 : 0, Math.min(1, dt * 6));
      const beam = p.mesh.userData.beam;
      if (beam) {
        beam.visible = !p.taken;
        beam.material.opacity = 0.12 + Math.sin(this._time * 3) * 0.04;
      }
    }
  }

  // ---- Interacción (provider de InteractionSystem) ---------------------------------

  getInteractablesNear(x, y, z, range) {
    const out = [];
    const active = this._worlds.activeId;
    for (const p of this._list.values()) {
      if (p.body !== active || p.taken) continue;
      if (Math.hypot(p.x - x, p.z - z) > range + 2) continue;
      const gy = this._groundY(p);
      out.push({ id: p.id, x: p.x, y: gy + 0.9, z: p.z, aimRadius: 0.8, reach: 0.8, label: p.label, action: p.action, key: 'E' });
    }
    return out;
  }

  interact(id) {
    const p = this._list.get(id);
    if (!p || p.taken) return false;
    // Se coge lo que quepa; lo demás se queda dentro (la bolsa o el cofre siguen ahí).
    const got = [];
    const left = [];
    for (const { item, count, dur } of p.contents) {
      const n = this._inventory.addItem(item, count, { quiet: true, dur });
      const def = this._items[item];
      if (n > 0) got.push(`${def?.ICON ?? ''} ${def?.NAME ?? item}${n > 1 ? ` ×${n}` : ''}`);
      if (n < count) left.push(dur == null ? { item, count: count - n } : { item, count: count - n, dur });
    }
    if (got.length) this._events.emit(GameEvents.UI_MESSAGE, { text: `Has cogido: ${got.join(', ')}`, type: 'biome' });
    if (left.length) {
      p.contents = left;
      if (p.model === 'BAG') p.label = this._bagLabel(left);
      this._events.emit(GameEvents.UI_MESSAGE, { text: '🎒 No te cabe todo: haz hueco en el inventario (I) y vuelve a cogerlo.', type: 'warning' });
      return got.length > 0;
    }
    p.taken = true;
    this._events.emit(GameEvents.PICKUP_TAKEN, { id, body: p.body, contents: p.contents });
    if (p.model === 'BAG') this.remove(id);
    return true;
  }

  /** Estado serializable (para comprobar desde Admin/pruebas). */
  getState() {
    return [...this._list.values()].map(({ id, body, x, z, taken }) => ({ id, body, x, z, taken }));
  }
}

// ---- Modelos ---------------------------------------------------------------------------

function buildModel(p) {
  const g = new THREE.Group();
  g.name = `pickup:${p.id}`;
  if (p.model === 'BAG') {
    // Bolsa de cuero con lo que no cupo en el inventario.
    const leather = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), leather);
    bag.position.y = 0.21;
    bag.castShadow = true;
    g.add(bag);
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), new THREE.MeshLambertMaterial({ color: 0xd9b47a }));
    knot.position.y = 0.48;
    g.add(knot);
  } else if (p.model === 'CHEST') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.5, metalness: 0.6 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x3fb6ff, emissive: 0x1a6fa8, emissiveIntensity: 0.8 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood);
    base.position.y = 0.3;
    base.castShadow = true;
    g.add(base);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 0.84), trim);
    band.position.y = 0.45;
    g.add(band);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.6, -0.4);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.8), wood);
    lid.position.set(0, 0.11, 0.4);
    lid.castShadow = true;
    pivot.add(lid);
    g.add(pivot);
    g.userData.lid = pivot;
  } else {
    const color = p.model === 'GALACTIC_NODE' ? 0xc07bff : 0x5fd0ff;
    const cradle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.75, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.6, metalness: 0.5 }),
    );
    cradle.position.y = 0.17;
    cradle.castShadow = true;
    g.add(cradle);
    const core = new THREE.Group();
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.3 }),
    );
    crystal.scale.y = 1.4;
    core.add(crystal);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.05, 6, 24),
      new THREE.MeshStandardMaterial({ color: 0xdfe8f0, metalness: 0.8, roughness: 0.3 }),
    );
    ring.rotation.x = Math.PI / 2;
    core.add(ring);
    core.position.y = 1.0;
    g.add(core);
    g.userData.core = core;
  }
  if (p.beacon) {
    // Haz de luz que se ve de lejos (ayuda a encontrarlo con el mapa).
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.9, 90, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: p.model === 'GALACTIC_NODE' ? 0xc07bff : p.model === 'CHEST' ? 0xffd27a : 0x6fdcff,
        transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      }),
    );
    beam.position.y = 45;
    g.add(beam);
    g.userData.beam = beam;
  }
  return g;
}

/**
 * Busca un sitio en tierra firme a una distancia [min, max] de `from` (x, z):
 * dentro del mundo, sin agua ni cuestas fuertes y lejos de árboles y rocas.
 * `rng` es un SeededRandom (misma seed → mismo sitio).
 */
export function findDropSite(world, rng, from, [minDist, maxDist], tries = 60) {
  const b = world.getBounds();
  let best = null;
  for (let i = 0; i < tries; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(minDist, maxDist);
    const x = from.x + Math.cos(a) * d;
    const z = from.z + Math.sin(a) * d;
    if (x < b.minX + 24 || x > b.maxX - 24 || z < b.minZ + 24 || z > b.maxZ - 24) continue;
    const h = world.getHeightAt(x, z);
    if (h < world.seaLevel + 1.2 || world.water?.isWater?.(x, z)) continue;
    const slope = Math.max(...[[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].map(([dx, dz]) => Math.abs(world.getHeightAt(x + dx, z + dz) - h)));
    const crowded = (world.resources?.getNodesNear(x, z, 3) ?? []).length > 0;
    const site = { x, z, score: slope + (crowded ? 5 : 0) };
    if (!best || site.score < best.score) best = site;
    if (slope < 0.6 && !crowded) break;
  }
  return best;
}
