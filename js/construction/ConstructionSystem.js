import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { BUILD_MODELS, toGeometry } from './BuildModels.js';
import {
  SHAPES, snapXZ, slotKey, terrainBaseY, isSupported, worldColliders, footprint, surfaceAt,
  pushOutOfBox, circleOverlapsBox, boxesOverlap, shelterAt,
} from './BuildRules.js';

/**
 * ConstructionSystem — construcción modular: el jugador levanta su casa pieza
 * a pieza (cimientos, suelos, paredes, puertas, ventanas, vallas, pilares,
 * escaleras, tejados y muebles como la cama).
 *
 * Modo construcción (B):
 *   1–9, 0     elegir pieza (orden de GameConfig.BUILD.PIECES)
 *   Clic       colocar (gasta los materiales)
 *   Clic dcho  quitar la pieza apuntada (devuelve los materiales)
 *   Q          girar / cambiar el lado de la puerta
 *
 * La mira apunta con un rayo contra las piezas y el terreno; la pieza se ancla
 * a la rejilla (BuildRules.snapXZ) y a la altura de lo apuntado, así que se
 * pueden hacer varios pisos. La geometría, las colisiones y las superficies
 * caminables son datos de BuildRules (sin Three.js); aquí solo hay escena,
 * entrada y validación.
 *
 * Consultas para otros sistemas:
 *   surfaceAt(x, z, maxY)            suelo caminable (controlador del jugador)
 *   blocksAt(x, z, r, y0, y1)        superficie que actúa como muro (bordes altos)
 *   ceilingAt(x, z, y)               techo por encima (al saltar)
 *   resolveCollisions(pos, r, y0, y1) paredes, puertas, vallas, pilares, camas
 *   getShelterAt(x, y, z)            techo + paredes alrededor (Fase 10)
 *   raycastDistance(origin, dir, max) oclusión de la cámara
 */
export class ConstructionSystem {
  constructor({ scene, camera, config, world, player, input, inventory, items, events }) {
    this.name = 'construction';
    this._cfg = config;
    this._camera = camera;
    this._world = world;
    this._player = player;
    this._input = input;
    this._inventory = inventory;
    this._items = items;
    this._events = events;

    this._profile = null; // perfil del cuerpo actual (lunas: otras piezas y materiales)
    this.pieceIds = this._piecesFor(null);
    this.active = false;
    this.selected = this.pieceIds[0];
    this.freeBuild = false; // herramienta Admin
    this.pieces = [];
    this._slots = new Map();
    this._nextId = 1;
    this._rotSteps = 0;
    this._placement = { active: false, valid: false, reason: null, piece: null };
    this._target = null; // pieza apuntada (para quitar)
    this._blockers = [];  // otras estructuras sobre las que no se construye (la nave): { overlapsBox(box) }

    this._scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Buildings_MUNDO_0';
    scene.add(this.group);
    // Cada cuerpo (MUNDO 0, lunas) guarda sus propias construcciones.
    this._bodyId = 'MUNDO_0';
    this._bodyStates = new Map([[this._bodyId, { pieces: this.pieces, slots: this._slots, group: this.group }]]);

    this._material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this._geometries = {};
    for (const type of Object.keys(SHAPES)) this._geometries[type] = toGeometry(BUILD_MODELS[type]());
    this._geometries.DOOR_LEAF = toGeometry(BUILD_MODELS.DOOR_LEAF());

    this._ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.42, depthWrite: false });
    this._ghost = new THREE.Mesh(this._geometries.FLOOR, this._ghostMaterial);
    this._ghost.visible = false;
    this._ghost.renderOrder = 2;
    scene.add(this._ghost);

    this._removeMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.22, depthWrite: false });
    this._removeHighlight = new THREE.Mesh(this._geometries.FLOOR, this._removeMaterial);
    this._removeHighlight.visible = false;
    this._removeHighlight.renderOrder = 3;
    scene.add(this._removeHighlight);

    this._raycaster = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._normal = new THREE.Vector3();

    events.on(GameEvents.WORLD_GENERATED, () => this.clear());
    events.on(GameEvents.STRUCTURE_INTERACT, ({ structure }) => this.interact(structure));
  }

  get placement() {
    return this._placement;
  }

  /** Estructura que ocupa espacio y no admite piezas encima o dentro (p. ej. la nave). */
  addBlocker(blocker) {
    this._blockers.push(blocker);
  }

  // ---- Modo construcción ---------------------------------------------------------

  setActive(active) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this._ghost.visible = false;
      this._removeHighlight.visible = false;
      this._setPlacement(false, false, null, null);
    }
    this._events.emit(GameEvents.BUILD_MODE_CHANGED, { active, pieceId: this.selected, pieces: this.pieceDefs() });
  }

  /** Piezas disponibles en un cuerpo: en las lunas, estaciones en vez de vallas y camas; en el espacio, ninguna. */
  _piecesFor(profile) {
    const all = Object.keys(this._cfg.PIECES);
    if (profile?.KIND === 'SPACE') return [];
    if (profile?.KIND === 'MOON') return all.filter((id) => !(this._cfg.HOME_ONLY ?? []).includes(id));
    return all.filter((id) => this._cfg.PIECES[id].BODIES !== 'MOON');
  }

  /** Coste de una pieza en el cuerpo actual (en las lunas la madera se sustituye por piedra…). */
  costOf(pieceId) {
    const sub = this._profile?.BUILD_SUBSTITUTE ?? {};
    const cost = {};
    for (const [item, n] of Object.entries(this._cfg.PIECES[pieceId].COST)) {
      const it = sub[item] ?? item;
      cost[it] = (cost[it] ?? 0) + n;
    }
    return cost;
  }

  /** Piezas del cuerpo actual para la UI: [{ id, NAME, ICON, COST }]. */
  pieceDefs() {
    return this.pieceIds.map((id) => ({ id, ...this._cfg.PIECES[id], COST: this.costOf(id) }));
  }

  select(pieceId) {
    if (!this._cfg.PIECES[pieceId]) return;
    this.selected = pieceId;
    this._rotSteps = 0;
    this._events.emit(GameEvents.BUILD_SELECTION_CHANGED, { pieceId });
  }

  canAfford(pieceId) {
    if (this.freeBuild) return true;
    return Object.entries(this.costOf(pieceId)).every(([item, n]) => this._inventory.hasItem(item, n));
  }

  update() {
    const input = this._input;
    if (input.wasPressed('BUILD_MODE')) {
      if (!this.active && !this.pieceIds.length) {
        this._events.emit(GameEvents.UI_MESSAGE, { text: 'Aquí no se puede construir.', type: 'danger' });
      } else {
        this.setActive(!this.active);
      }
    }
    if (!this.active) return;
    if (input.blocked) {
      this._ghost.visible = false;
      this._removeHighlight.visible = false;
      return;
    }

    for (let i = 1; i <= 10; i++) {
      if (input.wasPressed(`HOTBAR_${i}`) && this.pieceIds[i - 1]) this.select(this.pieceIds[i - 1]);
    }
    if (input.wasPressed('ROTATE')) this._rotSteps++;

    const hit = this._aim();
    this._updateRemoveTarget(hit);
    const candidate = hit ? this._candidate(this.selected, hit) : null;
    const check = candidate ? this.validate(candidate) : { ok: false, reason: 'Apunta al suelo o a una pieza' };

    if (candidate) {
      this._ghost.geometry = this._geometries[candidate.type];
      this._ghost.position.set(candidate.x, candidate.y + 0.01, candidate.z);
      this._ghost.rotation.set(0, candidate.rotation, 0);
      this._ghostMaterial.color.set(check.ok ? 0x66ff88 : 0xff5a4a);
      this._ghost.visible = true;
    } else {
      this._ghost.visible = false;
    }
    this._setPlacement(true, check.ok, check.reason ?? null, candidate);

    if (input.wasPressed('ATTACK')) this.place();
    else if (input.wasPressed('USE')) this.removeTarget();
  }

  // ---- Colocar / quitar ------------------------------------------------------------

  /** Coloca la pieza de la vista previa. */
  place() {
    const pl = this._placement;
    if (!pl.active || !pl.piece) return false;
    if (!pl.valid) {
      this._events.emit(GameEvents.UI_MESSAGE, { text: pl.reason ?? 'No se puede colocar aquí', type: 'danger' });
      return false;
    }
    const cost = this.costOf(pl.piece.type);
    if (!this.freeBuild) for (const [item, n] of Object.entries(cost)) this._inventory.removeItem(item, n);
    const structure = this.addPiece({ ...pl.piece, cost });
    this._events.emit(GameEvents.STRUCTURE_PLACED, { structure });
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'place' });
    return true;
  }

  /** Quita la pieza apuntada y devuelve los materiales. */
  removeTarget() {
    const piece = this._target;
    if (!piece) return false;
    this.removePiece(piece);
    if (!this.freeBuild) {
      for (const [item, n] of Object.entries(piece.cost ?? this.costOf(piece.type))) {
        const back = Math.floor(n * this._cfg.REFUND);
        if (back > 0) this._inventory.addItem(item, back);
      }
    }
    this._events.emit(GameEvents.STRUCTURE_REMOVED, { structure: piece });
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'place' });
    return true;
  }

  /** Añade una pieza ya validada (también la usan las herramientas Admin). */
  addPiece({ type, x, y, z, rotation, slot, cost = null }) {
    const piece = { id: this._nextId++, type, x, y, z, rotation, slot, open: false, def: this._cfg.PIECES[type], cost, body: this._bodyId };
    piece.key = slotKey(slot, y);
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.rotation.y = rotation;
    const mesh = new THREE.Mesh(this._geometries[type], this._material);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (type === 'DOOR') {
      const leaf = new THREE.Mesh(this._geometries.DOOR_LEAF, this._material);
      leaf.position.x = -0.5;
      leaf.castShadow = leaf.receiveShadow = true;
      root.add(leaf);
      piece.leaf = leaf;
    }
    root.traverse((o) => (o.userData.pieceId = piece.id));
    root.name = `piece_${type}_${piece.id}`;
    piece.object = root;
    this.group.add(root);
    root.updateMatrixWorld(true); // apuntable desde ya, sin esperar al siguiente render
    this.pieces.push(piece);
    if (piece.key) this._slots.set(piece.key, piece);
    return piece;
  }

  removePiece(piece) {
    this.group.remove(piece.object);
    const i = this.pieces.indexOf(piece);
    if (i >= 0) this.pieces.splice(i, 1); // mismo array: lo comparte el estado del cuerpo
    if (piece.key) this._slots.delete(piece.key);
    if (this._target === piece) this._target = null;
  }

  /** Cambia al cuerpo `id`: las construcciones del anterior se guardan (y se ocultan). */
  setBody(id, profile = null) {
    this._profile = profile;
    this.pieceIds = this._piecesFor(profile);
    if (!this.pieceIds.includes(this.selected) && this.pieceIds.length) this.selected = this.pieceIds[0];
    if (id === this._bodyId) return;
    this.setActive(false);
    this.group.visible = false;
    let st = this._bodyStates.get(id);
    if (!st) {
      const group = new THREE.Group();
      group.name = `Buildings_${id}`;
      this._scene.add(group);
      st = { pieces: [], slots: new Map(), group };
      this._bodyStates.set(id, st);
    }
    this.pieces = st.pieces;
    this._slots = st.slots;
    this.group = st.group;
    this.group.visible = true;
    this._bodyId = id;
    this._target = null;
  }

  get bodyId() {
    return this._bodyId;
  }

  /** Todas las piezas de todos los cuerpos (las estaciones de carga cargan aunque no estés allí). */
  allPieces() {
    return [...this._bodyStates.values()].flatMap((st) => st.pieces);
  }

  /** Quita todo lo construido en todos los cuerpos (nueva seed). */
  clear() {
    for (const st of this._bodyStates.values()) {
      for (const p of st.pieces) st.group.remove(p.object);
      st.pieces.length = 0;
      st.slots.clear();
    }
    this._target = null;
  }

  /** E sobre una pieza interactiva: puerta (abrir/cerrar) o cama (dormir). */
  interact(piece) {
    if (!this.exists(piece)) return;
    const kind = SHAPES[piece.type].interact;
    if (kind === 'DOOR') {
      if (piece.open) {
        // No cerrar la puerta encima del jugador.
        const p = this._player.position;
        const leaf = worldColliders({ ...piece, open: false }).at(-1);
        if (circleOverlapsBox(p.x, p.z, 0.35, leaf)) return;
      }
      piece.open = !piece.open;
      piece.leaf.rotation.y = piece.open ? -Math.PI / 2 : 0;
      piece.object.updateMatrixWorld(true);
    } else if (kind === 'SLEEP') {
      this._events.emit(GameEvents.SLEEP_REQUEST, { bed: piece });
    }
  }

  // ---- Validación --------------------------------------------------------------------

  /** @returns {{ ok: boolean, reason?: string }} */
  validate(candidate) {
    const w = this._world;
    const p = this._player.position;
    const fp = footprint(candidate);
    const b = w.getBounds();
    if (Math.hypot(candidate.x - p.x, candidate.z - p.z) > this._cfg.RANGE) return { ok: false, reason: 'Demasiado lejos' };
    if (fp.minX < b.minX || fp.maxX > b.maxX || fp.minZ < b.minZ || fp.maxZ > b.maxZ) return { ok: false, reason: 'Fuera del mundo' };
    if (this._blockers.some((bl) => bl.overlapsBox(fp))) return { ok: false, reason: 'La nave está en medio' };
    if (!this.canAfford(candidate.type)) return { ok: false, reason: `Te faltan materiales (${this._costText(candidate.type)})` };
    const key = slotKey(candidate.slot, candidate.y);
    if (key && this._slots.has(key)) return { ok: false, reason: 'Ya hay una pieza ahí' };
    if (w.water.isWater(candidate.x, candidate.z, 0.3)) return { ok: false, reason: 'No se puede construir en el agua' };

    // Solapes con otras piezas (muebles y piezas libres).
    const boxes = worldColliders(candidate);
    if (SHAPES[candidate.type].slot === 'FREE') {
      for (const o of this.pieces) {
        for (const ob of worldColliders(o)) if (boxesOverlap(fp, ob, 0.02)) return { ok: false, reason: 'Choca con otra pieza' };
      }
    }
    // Árboles y rocas.
    for (const n of w.resources.getNodesNear(candidate.x, candidate.z, 3)) {
      if (n.radius > 0 && circleOverlapsBox(n.x, n.z, n.radius, fp)) return { ok: false, reason: 'Hay árboles o rocas en medio' };
    }
    // No encerrar al jugador dentro de la pieza.
    const solid = boxes.concat(SHAPES[candidate.type].surfaces.length && candidate.y + SHAPES[candidate.type].top > p.y + 0.45 ? [fp] : []);
    for (const box of solid) {
      if (box.maxY > p.y + 0.05 && box.minY < p.y + 1.8 && circleOverlapsBox(p.x, p.z, 0.4, box)) {
        return { ok: false, reason: 'Estás en medio' };
      }
    }
    if (!isSupported(candidate, this.pieces, (x, z) => w.getHeightAt(x, z), this._cfg.GRID)) {
      return { ok: false, reason: 'Necesita apoyo (suelo u otra pieza)' };
    }
    return { ok: true };
  }

  _costText(type) {
    return Object.entries(this.costOf(type))
      .map(([item, n]) => `${n} ${this._items[item].NAME.toLowerCase()}`)
      .join(', ');
  }

  // ---- Apuntar y anclar --------------------------------------------------------------

  /** Rayo desde la cámara contra piezas y terreno. */
  _aim() {
    this._camera.getWorldPosition(this._origin);
    this._camera.getWorldDirection(this._dir);
    const camToPlayer = this._origin.distanceTo(this._player.position);
    const maxDist = camToPlayer + this._cfg.RANGE + 1;

    this._raycaster.set(this._origin, this._dir);
    this._raycaster.far = maxDist;
    const hits = this._raycaster.intersectObjects(this.group.children, true);
    const pieceHit = hits.find((h) => h.distance > 0.05);
    const terrainDist = this._raycastTerrain(this._origin, this._dir, pieceHit ? pieceHit.distance : maxDist);

    if (pieceHit && (terrainDist === null || pieceHit.distance <= terrainDist)) {
      const piece = this.pieces.find((p) => p.id === pieceHit.object.userData.pieceId);
      this._normal.copy(pieceHit.face.normal).transformDirection(pieceHit.object.matrixWorld);
      return { point: pieceHit.point.clone(), normal: this._normal.clone(), piece };
    }
    if (terrainDist !== null) {
      return { point: this._origin.clone().addScaledVector(this._dir, terrainDist), normal: new THREE.Vector3(0, 1, 0), piece: null };
    }
    return null;
  }

  /** Marcha a lo largo del rayo hasta cruzar el terreno. @returns distancia o null */
  _raycastTerrain(origin, dir, maxDist) {
    const w = this._world;
    const step = 0.25;
    let prev = 0;
    for (let t = step; t <= maxDist; t += step) {
      const y = origin.y + dir.y * t;
      if (y <= w.getHeightAt(origin.x + dir.x * t, origin.z + dir.z * t)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const my = origin.y + dir.y * mid;
          if (my <= w.getHeightAt(origin.x + dir.x * mid, origin.z + dir.z * mid)) hi = mid;
          else lo = mid;
        }
        return hi;
      }
      prev = t;
    }
    return null;
  }

  /** Pieza candidata a partir de lo apuntado. */
  _candidate(type, hit) {
    const point = hit.point.clone();
    let baseY = null;
    if (hit.piece) {
      if (hit.normal.y > 0.7) {
        baseY = hit.point.y; // cara superior: se construye encima
      } else {
        // Cara lateral: la nueva pieza va del lado desde el que se mira.
        const top = SHAPES[hit.piece.type].top;
        const upperHalf = top > 1 && hit.point.y > hit.piece.y + top * 0.6;
        point.x += hit.normal.x * (upperHalf ? 0.05 : 0.3);
        point.z += hit.normal.z * (upperHalf ? 0.05 : 0.3);
        // Parte alta de una pared/pilar → encima (techo, segundo piso);
        // parte baja → al mismo nivel, en la casilla de al lado.
        baseY = upperHalf ? hit.piece.y + top : hit.piece.y;
      }
    }
    const snapped = snapXZ(type, point.x, point.z, { grid: this._cfg.GRID, yaw: this._player.yaw, rotSteps: this._rotSteps });
    const piece = { type, ...snapped, y: 0 };
    piece.y = baseY !== null ? Math.round(baseY * 20) / 20 : terrainBaseY(piece, (x, z) => this._world.getHeightAt(x, z));
    return piece;
  }

  _updateRemoveTarget(hit) {
    this._target = hit?.piece ?? null;
    const t = this._target;
    if (t) {
      this._removeHighlight.geometry = this._geometries[t.type];
      this._removeHighlight.position.copy(t.object.position);
      this._removeHighlight.rotation.copy(t.object.rotation);
      this._removeHighlight.scale.setScalar(1.01);
    }
    this._removeHighlight.visible = !!t; // lo que quitaría el clic derecho
  }

  _setPlacement(active, valid, reason, piece) {
    const pl = this._placement;
    const changed = pl.active !== active || pl.valid !== valid || pl.reason !== reason || pl.pieceId !== piece?.type;
    pl.active = active;
    pl.valid = valid;
    pl.reason = reason;
    pl.piece = piece;
    pl.pieceId = piece?.type ?? null;
    if (changed) this._events.emit(GameEvents.PLACEMENT_CHANGED, { active, valid, reason, pieceId: pl.pieceId });
  }

  // ---- Consultas ---------------------------------------------------------------------

  exists(piece) {
    return this.pieces.includes(piece);
  }

  _near(x, z, r) {
    return this.pieces.filter((p) => Math.abs(p.x - x) < r && Math.abs(p.z - z) < r);
  }

  /** Superficie caminable más alta en (x, z) que no supere maxY, o null. */
  surfaceAt(x, z, maxY) {
    let best = null;
    for (const p of this._near(x, z, 2)) {
      const s = surfaceAt(p, x, z);
      if (s && s.top <= maxY && (best === null || s.top > best)) best = s.top;
    }
    return best;
  }

  /** ¿Alguna superficie en el círculo actúa como muro entre y0 e y1? (bordes altos de suelos) */
  blocksAt(x, z, r, y0, y1) {
    for (const p of this._near(x, z, 2 + r)) {
      if (!SHAPES[p.type].surfaces.length) continue;
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
        const s = surfaceAt(p, x + dx, z + dz);
        if (s && s.top > y0 && s.bottom < y1) return true;
      }
    }
    return false;
  }

  /** Parte inferior de la superficie más baja por encima de y en (x, z), o Infinity. */
  ceilingAt(x, z, y) {
    let ceiling = Infinity;
    for (const p of this._near(x, z, 2)) {
      const s = surfaceAt(p, x, z);
      if (s && s.bottom >= y && s.bottom < ceiling) ceiling = s.bottom;
    }
    return ceiling;
  }

  /** Paredes, puertas cerradas, vallas, pilares, camas: empuja el círculo fuera. */
  resolveCollisions(pos, r, y0 = -Infinity, y1 = Infinity) {
    let hit = false;
    for (const p of this._near(pos.x, pos.z, 2 + r)) {
      for (const box of worldColliders(p)) {
        if (box.maxY <= y0 || box.minY >= y1) continue;
        if (pushOutOfBox(pos, r, box)) hit = true;
      }
    }
    return hit;
  }

  getShelterAt(x, y, z) {
    return shelterAt(this._near(x, z, 10), x, y, z);
  }

  /** Piezas con las que se puede interactuar (puertas, camas) cerca de (x, z). */
  getInteractablesNear(x, z, radius) {
    return this.pieces.filter((p) => SHAPES[p.type].interact && Math.hypot(p.x - x, p.z - z) <= radius);
  }

  /** Distancia a la primera pieza a lo largo de un rayo (cámara en 3ª persona), o null. */
  raycastDistance(origin, dir, maxDist) {
    if (!this.pieces.length) return null;
    this._raycaster.set(origin, dir);
    this._raycaster.far = maxDist;
    const hit = this._raycaster.intersectObjects(this.group.children, true)[0];
    return hit ? hit.distance : null;
  }
}
