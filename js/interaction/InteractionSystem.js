import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SHAPES } from '../construction/BuildRules.js';

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
 *   ATTACK   (clic / F)   golpear al animal señalado (o recoger si es un recurso);
 *                         los troncos (HARVEST.METHOD 'HIT') se talan a golpes: manteniendo
 *                         el clic se sigue golpeando. Talar entero lleva HARVEST.CHOP_TIME s
 *                         con el puño (una herramienta seleccionada lo acorta) y la madera
 *                         sale poco a poco a medida que avanza.
 *                         Las rocas (BREAK) solo se rompen con un pico seleccionado
 *                         (TOOL.MINE_SPEED); a puñetazos duelen (BREAK.FIST_DAMAGE). Con E
 *                         se cogen sus piedras sueltas.
 *
 * No contiene reglas de los recursos ni de los animales: delega en
 * ResourceSystem.harvest(), AnimalSystem.hitAnimal() e InventorySystem.
 *
 * `providers`: otros sistemas con puntos interactivos propios (la nave:
 * botones, puerta, asiento, tecnologías). Cada uno expone
 *   getInteractablesNear(x, y, z, range) → [{ id, x, y, z, aimRadius, reach, label, action, key }]
 *   interact(id)
 */
export class InteractionSystem {
  constructor({ config, resourceTypes, input, camera, player, world, animals, inventory, events, construction = null, providers = [], tool = null, canWork = null, wearTool = null, power = null, weapon = null, suppressAttack = null }) {
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
    this._providers = providers;
    this._tool = tool ?? (() => null); // herramienta seleccionada ({ CHOP_SPEED }) o null
    this._canWork = canWork ?? (() => true); // ¿queda energía para golpear?
    this._wearTool = wearTool ?? (() => {}); // gasta 1 de aguante de la herramienta seleccionada
    this._power = power ?? (() => 1);        // multiplicador de daño del nivel (golpes y rapidez al talar/picar)
    this._weapon = weapon ?? (() => null);   // arma seleccionada ({ DAMAGE }) o null (puño)
    this._suppressAttack = suppressAttack ?? (() => false); // bloqueando o con arco/tirachinas: el clic no golpea
    // Criaturas a las que se puede golpear: animales y, más adelante, enemigos (misma interfaz).
    this.creatures = [animals];
    this._swing = 0;                   // s hasta poder dar el siguiente golpe (talar/picar/romper)
    this._chopProgress = new Map();    // id del árbol → 0..1 de tala

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
    // El ritmo de golpes es fijo: hacer clic muchas veces no golpea más deprisa que mantenerlo.
    this._swing = Math.max(0, this._swing - dt);
    this.target = this._findTarget();

    const t = this.target;
    const key = t ? `${t.kind}:${t.id}:${t.label}:${t.action}:${t.remaining ?? ''}:${t.open ?? ''}` : null;
    if (key !== this._targetKey) {
      this._targetKey = key;
      this._events.emit(GameEvents.INTERACTION_TARGET_CHANGED, { target: this.target });
    }

    // Talar / picar / romper: mientras se mantiene el clic se golpea cada CHOP_SWING s.
    const suppress = this._suppressAttack();
    const attack = !suppress && (this._input.wasPressed('ATTACK') || this._input.isDown('ATTACK'));
    if (t?.kind === 'structure' && attack) {
      if (this._swing <= 0) {
        this._swing = this._cfg.CHOP_SWING ?? 0.6;
        if (!this._tired()) this._breakSwing(t.ref);
      }
      if (this._input.wasPressed('INTERACT')) this._queued = 'INTERACT';
    } else if ((t?.hit || t?.breakable) && attack) {
      const B = this._types[t.ref.type].BREAK;
      if (this._tired()) {
        // agotado: no golpea (aviso en _tired)
      } else if (t.hit || this._tool()?.[B.TOOL]) {
        if (this._swing <= 0) {
          this._swing = this._cfg.CHOP_SWING ?? 0.6;
          this._chopSwing(t.ref);
        }
      } else if (this._input.wasPressed('ATTACK') && this._cooldown <= 0) {
        this._punchRock(t.ref, B);
      }
      if (this._input.wasPressed('INTERACT')) this._queued = 'INTERACT';
    } else {
      if (this._input.wasPressed('INTERACT')) this._queued = 'INTERACT';
      else if (this._input.wasPressed('ATTACK') && !suppress) this._queued = 'ATTACK';
    }
    if (this._cooldown > 0 || !this._queued) return;
    const action = this._queued;
    this._queued = null;
    this._act(this.target, action);
  }

  // ---- Acciones --------------------------------------------------------------

  _act(target, button) {
    this._cooldown = this._cfg.ACTION_COOLDOWN;
    if (target?.kind === 'resource' && target.hit) {
      // Troncos: se talan en update() (manteniendo el clic). Con E solo se explica cómo.
      this._cooldown = 0;
      if (button === 'INTERACT') this._hintChop();
    } else if (target?.kind === 'resource' && target.breakable) {
      // Rocas: con E, piedras sueltas (si quedan). Picar va en update().
      if (button !== 'INTERACT') return;
      if (target.ref.remaining > 0) this._harvest(target.ref);
      else this._hint(`${this._types[target.ref.type].NAME}: para picarla hace falta un ⛏️ pico seleccionado en la barra.`);
    } else if (target?.kind === 'resource' && target.action) {
      this._harvest(target.ref);
    } else if (target?.kind === 'provided' && button === 'INTERACT') {
      target.provider.interact(target.ref.id);
    } else if (target?.kind === 'structure' && target.action && button === 'INTERACT') {
      this._events.emit(GameEvents.STRUCTURE_INTERACT, { structure: target.ref });
    } else if (target?.kind === 'water' && button === 'INTERACT') {
      this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'drink' });
      this._events.emit(GameEvents.PLAYER_DRANK, { source: target.ref?.river ? 'RIVER' : 'POND' });
    } else if (target?.kind === 'animal' && button === 'ATTACK') {
      this._hit(target.ref, target.source);
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

  /**
   * Un golpe al tronco: avanza la tala (CHOP_SWING × velocidad de la herramienta /
   * CHOP_TIME). La madera del árbol (HARVEST.AMOUNT) sale repartida a lo largo de la
   * tala; con el último trozo el árbol cae. Una herramienta acorta la tala, no da más madera.
   */
  _chopSwing(node) {
    const def = this._types[node.type];
    const rock = !!def.BREAK && def.HARVEST?.METHOD !== 'HIT';
    const job = rock
      ? { time: def.BREAK.TIME, speed: this._tool()?.[def.BREAK.TOOL] ?? 0, amount: def.BREAK.AMOUNT }
      : { time: def.HARVEST.CHOP_TIME ?? 15, speed: def.HARVEST.MATERIAL === 'web' ? 1 : this._tool()?.CHOP_SPEED ?? 1, amount: node.total ?? def.HARVEST.AMOUNT };
    const swing = this._cfg.CHOP_SWING ?? 0.6;
    // La herramienta que ayuda en este golpe se gasta (el hacha en troncos, el pico en rocas).
    const usesTool = rock || (def.HARVEST.MATERIAL !== 'web' && !!this._tool()?.CHOP_SPEED);
    const work = this._chopProgress.get(node.id) ?? { progress: 0, given: 0 };
    work.progress = Math.min(1, work.progress + (swing * job.speed * this._power()) / job.time);
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'chop' });
    // Trozos que ya deberían haber salido a estas alturas.
    const due = work.progress >= 1 ? job.amount : Math.floor(work.progress * job.amount);
    let done = false;
    if (rock) {
      if (due > work.given) this._inventory.addItem(def.BREAK.ITEM, due - work.given);
      work.given = due;
      if (work.progress >= 1) done = !!this._world.resources.removeNode(node.id);
    } else {
      while (job.amount - node.remaining < due) {
        const result = this._world.resources.harvest(node.id);
        if (!result) break;
        this._inventory.addItem(result.item, result.amount);
        this._events.emit(GameEvents.RESOURCE_HARVESTED, result);
        done = result.removed;
      }
    }
    if (done || node.removed) this._chopProgress.delete(node.id);
    else this._chopProgress.set(node.id, work);
    if (usesTool) this._wearTool();
    const p = this._player.position;
    this._events.emit(GameEvents.RESOURCE_HIT, {
      node, x: node.x, y: node.y + def.AIM_HEIGHT * node.scale, z: node.z, fromX: p.x, fromZ: p.z,
      felled: done, progress: work.progress, material: rock ? 'stone' : def.HARVEST.MATERIAL ?? 'wood',
    });
  }

  /** Sin energía no se puede golpear: avisa (de vez en cuando) y devuelve true. */
  _tired() {
    if (this._canWork()) return false;
    this._hint('Estás agotado: para un momento para recuperar energía.');
    return true;
  }

  /** Golpe a una pieza construida: al completar BUILD.BREAK_TIME se rompe y devuelve los materiales. */
  _breakSwing(piece) {
    const C = this._construction;
    if (!C?.exists(piece)) return;
    const tool = this._tool();
    const speed = tool?.CHOP_SPEED || tool?.MINE_SPEED ? 2 : 1;
    if (speed > 1) this._wearTool();
    const key = `st-${piece.id}`;
    const work = this._chopProgress.get(key) ?? { progress: 0 };
    work.progress = Math.min(1, work.progress + ((this._cfg.CHOP_SWING ?? 0.6) * speed * this._power()) / (C._cfg.BREAK_TIME ?? 3));
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'chop' });
    const stone = Object.keys(piece.cost ?? C.costOf(piece.type) ?? {}).some((k) => k === 'STONE' || k === 'MINERAL');
    const done = work.progress >= 1;
    const p = this._player.position;
    this._events.emit(GameEvents.RESOURCE_HIT, {
      node: { radius: 0.3 }, x: piece.x, y: piece.y + 0.8, z: piece.z, fromX: p.x, fromZ: p.z, felled: false,
      material: stone ? 'stone' : 'wood', small: !done,
    });
    if (done) {
      this._chopProgress.delete(key);
      C.breakPiece(piece);
    } else {
      this._chopProgress.set(key, work);
    }
  }

  /** Puñetazo a una roca: no se rompe y duele. */
  _punchRock(node, B) {
    this._cooldown = this._cfg.ACTION_COOLDOWN;
    const def = this._types[node.type];
    const p = this._player.position;
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'hit' });
    this._events.emit(GameEvents.RESOURCE_HIT, {
      node, x: node.x, y: node.y + def.AIM_HEIGHT * node.scale, z: node.z, fromX: p.x, fromZ: p.z, felled: false, material: 'stone', small: true,
    });
    this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: B.FIST_DAMAGE, source: 'ROCK', sourceName: 'golpear una roca', fromX: node.x, fromZ: node.z });
    this._hint('¡Ay! Las rocas no se rompen a puñetazos: necesitas un ⛏️ pico (fabrícalo con Tab).');
  }

  _hint(text) {
    const now = performance.now();
    if (now - (this._hintAt2 ?? -1e9) < 3000) return;
    this._hintAt2 = now;
    this._events.emit(GameEvents.UI_MESSAGE, { text, type: 'warning' });
  }

  /** Cuánto se ha talado ya este árbol (0..1). */
  chopProgress(id) {
    return this._chopProgress.get(id)?.progress ?? 0;
  }

  _hintChop() {
    const now = performance.now();
    if (now - (this._hintAt ?? -1e9) < 4000) return;
    this._hintAt = now;
    this._events.emit(GameEvents.UI_MESSAGE, { text: '🪓 Golpea el tronco (clic o F) para sacar trozos de madera.', type: 'info' });
  }

  _hit(animal, source = this._animals) {
    const p = this._player.position;
    this._events.emit(GameEvents.PLAYER_ACTION, { kind: 'hit' });
    const weapon = this._weapon();
    if (weapon) this._wearTool();
    const damage = (weapon?.DAMAGE ?? this._cfg.PLAYER_HIT_DAMAGE) * this._power();
    const { killed, drops } = source.hitAnimal(animal, damage, p.x, p.z);
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
      // Alcance medido desde el jugador (no desde la cámara); y a su altura (cuevas: no a través del suelo).
      if (Math.hypot(cx - p.x, cz - p.z) - reachRadius > range) return;
      if (Math.abs(cy - (p.y + 1.2)) > range + 2.5) return;
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
    for (const source of this.creatures) {
      for (const a of source.getAnimalsNear(p.x, p.z, range + 2)) {
        consider({ kind: 'animal', id: a.id, ref: a, source }, a.x, a.y + 0.8 * a.scale, a.z, 0.75 * a.scale, 0.5 * a.scale);
      }
    }

    // Piezas construidas con las que se interactúa (puertas, camas).
    for (const st of this._construction?.getInteractablesNear(p.x, p.z, range + 3) ?? []) {
      const door = st.type === 'DOOR';
      consider(
        { kind: 'structure', id: `st-${st.id}`, ref: st },
        st.x, st.y + (door ? 1.1 : st.type.endsWith('STATION') ? 0.9 : 0.4), st.z,
        door ? 0.9 : 1.0,
        door ? 0.3 : 0.9,
      );
    }

    // Cualquier pieza construida a lo largo de la mira: se puede romper a golpes.
    const ray = this._construction?.active ? null : this._construction?.pieceOnRay(this._origin, this._dir, range + 6);
    if (ray && ray.distance < bestT && Math.hypot(ray.point.x - p.x, ray.point.z - p.z) <= range + 0.6) {
      if (!(best?.kind === 'structure' && best.ref === ray.piece)) {
        bestT = ray.distance;
        best = { kind: 'structure', id: `st-${ray.piece.id}`, ref: ray.piece };
      }
    }

    // Otros sistemas (nave): botones, puertas, asiento, tecnologías.
    for (const provider of this._providers) {
      for (const it of provider.getInteractablesNear(p.x, p.y, p.z, range)) {
        consider({ kind: 'provided', id: `${provider.name}:${it.id}`, ref: it, provider }, it.x, it.y, it.z, it.aimRadius, it.reach);
      }
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
    // Ríos: donde la mira corta el nivel del agua, si ahí hay agua dulce (el mar no se bebe).
    const sea = this._world.seaLevel;
    if (best?.kind !== 'water' && this._dir.y < -0.05 && typeof sea === 'number' && this._world.isFreshWaterAt && !this._world.inCave?.(p.x, p.y + 1, p.z)) {
      const t = (sea - this._origin.y) / this._dir.y;
      const hx = this._origin.x + this._dir.x * t;
      const hz = this._origin.z + this._dir.z * t;
      if (t > 0 && t < bestT && Math.hypot(hx - p.x, hz - p.z) <= range + 1 && this._world.isFreshWaterAt(hx, hz)) {
        best = { kind: 'water', id: 'river', ref: { level: sea, river: true } };
        bestT = t;
      }
    }
    return best ? this._describe(best) : null;
  }

  /** Añade el texto que mostrará la UI: { label, action }. */
  _describe(t) {
    if (t.kind === 'water') return { ...t, label: t.ref.river ? 'Agua del río' : 'Agua', action: 'Beber', key: 'E' };
    if (t.kind === 'provided') return { ...t, label: t.ref.label, action: t.ref.action, key: t.ref.key ?? 'E' };
    if (t.kind === 'structure') {
      // Las piezas sin uso (paredes, suelos…) no muestran letrero: se rompen manteniendo el clic.
      if (!SHAPES[t.ref.type]?.interact) return { ...t, silent: true, label: t.ref.def.NAME, action: null };
      const kind = SHAPES[t.ref.type].interact;
      const action = t.ref.actionText ?? (kind === 'DOOR' ? (t.ref.open ? 'Cerrar' : 'Abrir') : kind === 'CRAFT' ? 'Usar' : kind === 'STORAGE' ? 'Abrir' : 'Dormir');
      return { ...t, label: t.ref.def.NAME, action, key: 'E', open: t.ref.open };
    }
    if (t.kind === 'animal') {
      return { ...t, label: t.ref.def.NAME, action: 'Golpear', key: 'Clic' };
    }
    const def = this._types[t.ref.type];
    const B = def.BREAK;
    if (B && def.HARVEST.METHOD !== 'HIT') {
      // Roca: con pico se pica; sin pico, E coge piedras sueltas si quedan.
      const hasTool = !!this._tool()?.[B.TOOL];
      if (hasTool) return { ...t, breakable: true, label: def.NAME, action: B.VERB, key: 'Clic' };
      if (t.ref.remaining > 0) return { ...t, breakable: true, label: def.NAME, action: def.HARVEST.VERB, key: 'E' };
      return { ...t, breakable: true, label: def.NAME, action: 'Necesitas un pico', key: '⛏️' };
    }
    if (t.ref.remaining <= 0) return { ...t, label: `${def.NAME} (sin fruto)`, action: null };
    if (def.HARVEST.METHOD === 'HIT') {
      // Sin letrero en pantalla (silent): basta con apuntar al tronco y mantener el clic.
      return { ...t, hit: true, silent: true, label: def.NAME, action: def.HARVEST.VERB, key: 'Clic' };
    }
    return { ...t, label: def.NAME, action: def.HARVEST.VERB, key: 'E', remaining: t.ref.remaining };
  }
}
