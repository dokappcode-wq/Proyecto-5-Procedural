import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { STRUCTURE_MODELS, toGeometry } from './StructureModels.js';

/**
 * ConstructionSystem — colocar construcciones en el mundo (cama, refugio).
 *
 * - Con un objeto colocable seleccionado en la barra (ITEMS.*.USE = 'PLACE')
 *   se muestra una vista previa delante del jugador: verde si se puede colocar,
 *   roja si no. ROTATE (Q) la gira; ItemUseSystem llama a place().
 * - Validación: dentro del mundo, fuera del agua, terreno poco inclinado y sin
 *   solaparse con árboles, rocas u otras construcciones.
 * - Colisiones (postes del refugio) mediante resolveCollisions(), igual que
 *   los recursos. isSheltered() lo usará TemperatureSystem (Fase 10).
 *
 * Preparado para crecer: cada construcción es datos (GameConfig.STRUCTURES) +
 * un modelo (StructureModels). Paredes, suelos, cofres o estaciones de trabajo
 * se añadirían igual.
 */
export class ConstructionSystem {
  constructor({ scene, config, structures, items, world, player, input, hotbar, inventory, events }) {
    this.name = 'construction';
    this._cfg = config;
    this._defs = structures;
    this._items = items;
    this._world = world;
    this._player = player;
    this._input = input;
    this._hotbar = hotbar;
    this._inventory = inventory;
    this._events = events;

    this.structures = [];
    this._nextId = 1;
    this._rotationOffset = 0;
    this._placement = { active: false, valid: false, type: null, x: 0, y: 0, z: 0, rotation: 0 };

    this.group = new THREE.Group();
    this.group.name = 'Structures';
    scene.add(this.group);

    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._geometries = {};
    for (const type of Object.keys(structures)) this._geometries[type] = toGeometry(STRUCTURE_MODELS[type]());

    this._ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.45, depthWrite: false });
    this._ghost = new THREE.Mesh(this._geometries.BED, this._ghostMaterial);
    this._ghost.visible = false;
    this._ghost.renderOrder = 2;
    scene.add(this._ghost);

    events.on(GameEvents.WORLD_GENERATED, () => this.clear());
  }

  get placement() {
    return this._placement;
  }

  // ---- Colocación ------------------------------------------------------------

  update() {
    const itemId = this._hotbar.selectedId;
    const type = this._items[itemId]?.USE === 'PLACE' ? this._items[itemId].STRUCTURE : null;
    const pl = this._placement;

    if (!type || this._input.blocked) {
      this._ghost.visible = false;
      this._setPlacement(false, false, null);
      return;
    }
    if (this._input.wasPressed('ROTATE')) this._rotationOffset += this._cfg.ROTATION_STEP;

    const p = this._player.position;
    const yaw = this._player.yaw;
    pl.x = p.x - Math.sin(yaw) * this._cfg.PLACE_DISTANCE;
    pl.z = p.z - Math.cos(yaw) * this._cfg.PLACE_DISTANCE;
    pl.rotation = yaw + this._rotationOffset;
    const check = this.canPlace(type, pl.x, pl.z);
    pl.y = check.y;

    this._ghost.geometry = this._geometries[type];
    this._ghost.position.set(pl.x, pl.y + 0.02, pl.z);
    this._ghost.rotation.set(0, pl.rotation, 0);
    this._ghostMaterial.color.set(check.ok ? 0x66ff88 : 0xff5a4a);
    this._ghost.visible = true;
    this._setPlacement(true, check.ok, type, check.reason);
  }

  /**
   * ¿Se puede colocar `type` centrado en (x, z)?
   * @returns {{ ok: boolean, reason?: string, y: number }}
   */
  canPlace(type, x, z) {
    const def = this._defs[type];
    const r = def.CLEARANCE;
    const w = this._world;
    const b = w.getBounds();
    const samples = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => w.getHeightAt(x + dx, z + dz));
    const y = Math.min(...samples);
    const fail = (reason) => ({ ok: false, reason, y });

    if (x - r < b.minX || x + r > b.maxX || z - r < b.minZ || z + r > b.maxZ) return fail('Fuera del mundo');
    if (w.water.isWater(x, z, r) || y < w.seaLevel + 0.3) return fail('No se puede construir en el agua');
    if ((Math.max(...samples) - y) / (2 * r) > this._cfg.MAX_SLOPE) return fail('El terreno es demasiado inclinado');
    for (const n of w.resources.getNodesNear(x, z, r + 2)) {
      if (n.radius > 0 && Math.hypot(n.x - x, n.z - z) < r + n.radius) return fail('Hay árboles o rocas en medio');
    }
    for (const s of this.structures) {
      if (Math.hypot(s.x - x, s.z - z) < r + this._defs[s.type].CLEARANCE) return fail('Choca con otra construcción');
    }
    return { ok: true, y };
  }

  /** Coloca la construcción de la vista previa, consumiendo el objeto. */
  place() {
    const pl = this._placement;
    if (!pl.active) return false;
    if (!pl.valid) {
      this._events.emit(GameEvents.UI_MESSAGE, { text: pl.reason ?? 'No se puede colocar aquí', type: 'danger' });
      return false;
    }
    const itemId = this._defs[pl.type].ITEM;
    if (!this._inventory.removeItem(itemId, 1)) return false;
    const structure = this.addStructure(pl.type, pl.x, pl.z, pl.rotation, pl.y);
    this._events.emit(GameEvents.STRUCTURE_PLACED, { structure });
    return true;
  }

  /** Añade una construcción (también la usan las herramientas Admin). */
  addStructure(type, x, z, rotation = 0, y = this._world.getHeightAt(x, z)) {
    const structure = { id: this._nextId++, type, x, y, z, rotation, def: this._defs[type] };
    const mesh = new THREE.Mesh(this._geometries[type], this._material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `structure_${type}_${structure.id}`;
    structure.mesh = mesh;
    this.group.add(mesh);
    this.structures.push(structure);
    return structure;
  }

  clear() {
    for (const s of this.structures) this.group.remove(s.mesh);
    this.structures = [];
  }

  // ---- Consultas ---------------------------------------------------------------

  getStructuresNear(x, z, radius) {
    return this.structures.filter((s) => Math.hypot(s.x - x, s.z - z) <= radius);
  }

  exists(structure) {
    return this.structures.includes(structure);
  }

  /** ¿Está (x, z) bajo techo? (Fase 10: protección contra el frío) */
  isSheltered(x, z) {
    return this.structures.some((s) => s.def.SHELTER_RADIUS && Math.hypot(s.x - x, s.z - z) <= s.def.SHELTER_RADIUS);
  }

  /** Empuja un círculo fuera de los colisionadores de las construcciones. */
  resolveCollisions(pos, radius) {
    let hit = false;
    for (const s of this.structures) {
      if (!s.def.COLLIDERS.length || Math.hypot(s.x - pos.x, s.z - pos.z) > 6) continue;
      const cos = Math.cos(s.rotation);
      const sin = Math.sin(s.rotation);
      for (const [lx, lz, r] of s.def.COLLIDERS) {
        const cx = s.x + lx * cos + lz * sin;
        const cz = s.z - lx * sin + lz * cos;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const min = r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-4;
        pos.x = cx + (dx / d) * min;
        pos.z = cz + (dz / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  _setPlacement(active, valid, type, reason = null) {
    const pl = this._placement;
    const changed = pl.active !== active || pl.valid !== valid || pl.type !== type || pl.reason !== reason;
    pl.active = active;
    pl.valid = valid;
    pl.type = type;
    pl.reason = reason;
    if (changed) {
      this._events.emit(GameEvents.PLACEMENT_CHANGED, {
        active,
        valid,
        type,
        reason,
        name: type ? this._defs[type].NAME : null,
      });
    }
  }
}
