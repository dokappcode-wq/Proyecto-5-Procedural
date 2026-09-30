import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

/**
 * InteractionSystem — qué señala el jugador y qué puede hacer con ello.
 *
 * Objetivo: el recurso o animal más cercano a lo largo de la línea de la mira
 * (centro de la pantalla), dentro del alcance del jugador. Funciona igual en
 * 1ª y 3ª persona porque usa la cámara solo para APUNTAR y mide el alcance
 * desde el jugador.
 *
 * Acciones:
 *   INTERACT (E)          recoger del recurso señalado / beber del agua señalada
 *   ATTACK   (clic / F)   golpear al animal señalado (o recoger si es un recurso)
 *
 * No contiene reglas de los recursos ni de los animales: delega en
 * ResourceSystem.harvest(), AnimalSystem.hitAnimal() e InventorySystem.
 */
export class InteractionSystem {
  constructor({ config, resourceTypes, input, camera, player, world, animals, inventory, events, construction = null }) {
    this.name = 'interaction';
    this._cfg = config;
    this._types = resourceTypes;
    this._input = input;
    this._camera = camera;
    this._player = player;
    this._world = world;
    this._animals = animals;
    this._inventory = inventory;
    this._events = events;
    this._construction = construction;

    this._cooldown = 0;
    this._queued = null; // acción pulsada durante el enfriamiento (se ejecuta al terminar)
    this.target = null;
    this._targetKey = null;
    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  /** Olvida el objetivo actual para volver a anunciarlo (p. ej. al salir del modo construcción). */
  resetTarget() {
    this._targetKey = null;
  }

  update(dt) {
    this._cooldown = Math.max(0, this._cooldown - dt);
    this.target = this._findTarget();

    const t = this.target;
    const key = t ? `${t.kind}:${t.id}:${t.label}:${t.action}:${t.remaining ?? ''}:${t.open ?? ''}` : null;
    if (key !== this._targetKey) {
      this._targetKey = key;
      this._events.emit(GameEvents.INTERACTION_TARGET_CHANGED, { target: this.target });
    }

    if (this._input.wasPressed('INTERACT')) this._queued = 'INTERACT';
    else if (this._input.wasPressed('ATTACK')) this._queued = 'ATTACK';
    if (this._cooldown > 0 || !this._queued) return;
    const action = this._queued;
    this._queued = null;
    this._act(this.target, action);
  }

  // ---- Acciones --------------------------------------------------------------

  _act(target, button) {
    this._cooldown = this._cfg.ACTION_COOLDOWN;
    if (target?.kind === 'resource' && target.action) {
      this._harvest(target.ref);
    } else if (target?.kind === 'structure' && target.action && button === 'INTERACT') {
      this._events.emit(GameEvents.STRUCTURE_INTERACT, { structure: target.ref });
    } else if (target?.kind === 'water' && button === 'INTERACT') {
      this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'drink' });
      this._events.emit(GameEvents.PLAYER_DRANK, { source: 'POND' });
    } else if (target?.kind === 'animal' && button === 'ATTACK') {
      this._hit(target.ref);
    } else if (button === 'ATTACK') {
      this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'miss' });
    } else {
      this._cooldown = 0; // E sin objetivo: no consume tiempo
    }
  }

  _harvest(node) {
    const result = this._world.resources.harvest(node.id);
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'harvest' });
    if (!result) return;
    this._inventory.addItem(result.item, result.amount);
    this._events.emit(GameEvents.RESOURCE_HARVESTED, result);
  }

  _hit(animal) {
    const p = this._player.position;
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'hit' });
    const { killed, drops } = this._animals.hitAnimal(animal, this._cfg.PLAYER_HIT_DAMAGE, p.x, p.z);
    if (!killed) return;
    for (const [item, amount] of Object.entries(drops)) this._inventory.addItem(item, amount);
  }

  // ---- Selección de objetivo -------------------------------------------------

  _findTarget() {
    const p = this._player.position;
    const range = this._cfg.RANGE;
    this._camera.getWorldPosition(this._origin);
    this._camera.getWorldDirection(this._dir);

    let best = null;
    let bestT = Infinity;
    const consider = (candidate, cx, cy, cz, aimRadius, reachRadius) => {
      // Alcance medido desde el jugador (no desde la cámara).
      if (Math.hypot(cx - p.x, cz - p.z) - reachRadius > range) return;
      // Distancia del centro del objetivo a la línea de la mira.
      this._v.set(cx, cy, cz).sub(this._origin);
      const t = this._v.dot(this._dir);
      if (t <= 0) return;
      const perp2 = this._v.lengthSq() - t * t;
      if (perp2 > aimRadius * aimRadius || t >= bestT) return;
      bestT = t;
      best = candidate;
    };

    const resources = this._world.resources;
    if (resources) {
      for (const n of resources.getNodesNear(p.x, p.z, range + 2)) {
        const def = this._types[n.type];
        if (!def.HARVEST) continue;
        consider(
          { kind: 'resource', id: n.id, ref: n },
          n.x, n.y + def.AIM_HEIGHT * n.scale, n.z,
          def.AIM_RADIUS * n.scale,
          Math.max(n.radius, 0.4),
        );
      }
    }
    for (const a of this._animals.getAnimalsNear(p.x, p.z, range + 2)) {
      consider({ kind: 'animal', id: a.id, ref: a }, a.x, a.y + 0.8 * a.scale, a.z, 0.75 * a.scale, 0.5 * a.scale);
    }

    // Piezas construidas con las que se interactúa (puertas, camas).
    for (const st of this._construction?.getInteractablesNear(p.x, p.z, range + 3) ?? []) {
      const door = st.type === 'DOOR';
      consider(
        { kind: 'structure', id: `st-${st.id}`, ref: st },
        st.x, st.y + (door ? 1.1 : 0.4), st.z,
        door ? 0.9 : 1.0,
        door ? 0.3 : 0.9,
      );
    }

    // Agua: punto donde la mira corta la lámina de la charca más cercana.
    const water = this._world.water?.nearestPond(p.x, p.z);
    if (water && water.distance <= range + 1 && this._dir.y < -0.05) {
      const pond = water.pond;
      const t = (pond.level - this._origin.y) / this._dir.y;
      if (t > 0 && t < bestT) {
        const hx = this._origin.x + this._dir.x * t;
        const hz = this._origin.z + this._dir.z * t;
        const inPond = Math.hypot(hx - pond.x, hz - pond.z) <= pond.radius;
        if (inPond && Math.hypot(hx - p.x, hz - p.z) <= range + 1) {
          best = { kind: 'water', id: `pond-${pond.id}`, ref: pond };
          bestT = t;
        }
      }
    }
    return best ? this._describe(best) : null;
  }

  /** Añade el texto que mostrará la UI: { label, action }. */
  _describe(t) {
    if (t.kind === 'water') return { ...t, label: 'Agua', action: 'Beber', key: 'E' };
    if (t.kind === 'structure') {
      const action = t.ref.type === 'DOOR' ? (t.ref.open ? 'Cerrar' : 'Abrir') : 'Dormir';
      return { ...t, label: t.ref.def.NAME, action, key: 'E', open: t.ref.open };
    }
    if (t.kind === 'animal') {
      return { ...t, label: t.ref.def.NAME, action: 'Golpear', key: 'Clic' };
    }
    const def = this._types[t.ref.type];
    if (t.ref.remaining <= 0) return { ...t, label: `${def.NAME} (sin fruto)`, action: null };
    return { ...t, label: def.NAME, action: def.HARVEST.VERB, key: 'E', remaining: t.ref.remaining };
  }
}
