import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { wrapAngle } from './Player.js';

const JUMP_BUFFER_TIME = 0.12; // s: un salto pulsado justo antes de aterrizar se ejecuta
const COYOTE_TIME = 0.1;       // s: se puede saltar justo después de abandonar un borde

/**
 * PlayerController — convierte la entrada en movimiento del jugador.
 *
 * Física cinemática sencilla sobre un "proveedor de terreno" (heightfield):
 *   terrain.getHeightAt(x, z), terrain.getBounds()
 * - Aceleración suave, carrera, salto con buffer y "coyote time".
 * - Escalones bajos se suben solos; paredes más altas bloquean (por eje, lo que
 *   permite deslizarse a lo largo de ellas).
 * - Pendientes demasiado inclinadas no se pueden subir caminando.
 * - Troncos, rocas, paredes, vallas... bloquean el paso (obstacles.resolveCollisions).
 * - Construcciones (structures): se camina sobre suelos, cimientos, escaleras y
 *   tejados; sus bordes altos bloquean y los techos frenan el salto.
 * - Al tocar el límite del mundo finito se emite WORLD_EDGE_REACHED.
 * - Modo vuelo (herramienta de depuración) sin gravedad ni colisiones.
 *
 * El movimiento es relativo al yaw de la mirada del jugador, no a la cámara:
 * funciona igual en primera y en tercera persona.
 */
export class PlayerController {
  /**
   * @param {object} config  sección PLAYER
   * @param {object} look    { sensitivity, invertY } (de la sección INPUT)
   */
  constructor({ config, look, input, player, terrain, obstacles = null, structures = null, events }) {
    this.name = 'playerController';
    this._cfg = config;
    this._lookSensitivity = look.sensitivity;
    this._invertY = look.invertY ? -1 : 1;
    this._input = input;
    this._player = player;
    this._terrain = terrain;
    this._obstacles = obstacles; // { resolveCollisions(pos, radius, y0, y1) } — troncos, rocas, paredes...
    this._structures = structures; // { surfaceAt, blocksAt, ceilingAt } — construcciones
    this._events = events;

    this._maxSlopeTan = Math.tan(THREE.MathUtils.degToRad(config.MAX_WALKABLE_SLOPE_DEG));
    this._climbTan = config.CLIMB ? Math.tan(THREE.MathUtils.degToRad(config.CLIMB.START_SLOPE_DEG)) : Infinity;
    this._edgeNoticeCooldown = 0;
    this._wasAtEdge = false;
    this._mods = { canRun: true, canClimb: true, speedMultiplier: 1 };
    this.gravityScale = 1; // lunas: menos gravedad (se salta más y se cae más despacio)
    this._jumpBuffer = 0;
    this._coyote = 0;
    this._wish = new THREE.Vector3();
  }

  /** Cambia el terreno activo (p. ej. otro planeta en el futuro). */
  /**
   * Agua del cuerpo activo: { surfaceAt(x, z) → altura | null, fluid() → { swim, dive } }.
   * Nadar y bucear son capacidades del motor; el sistema solar solo las activa o desactiva.
   */
  setWater(water) {
    this._water = water;
  }

  setTerrain(terrain) {
    this._terrain = terrain;
  }

  setFlying(flying) {
    const p = this._player;
    if (p.state.isFlying === flying) return;
    p.state.isFlying = flying;
    p.velocity.set(0, 0, 0);
    this._events.emit(GameEvents.PLAYER_FLY_CHANGED, { flying });
  }

  /**
   * Empujón (p. ej. al recibir un ataque): aleja al jugador de (fromX, fromZ).
   * La aceleración normal lo frena en unas décimas de segundo.
   */
  applyKnockback(fromX, fromZ, strength) {
    const p = this._player;
    const dx = p.position.x - fromX;
    const dz = p.position.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    p.velocity.x += (dx / d) * strength;
    p.velocity.z += (dz / d) * strength;
    if (p.state.onGround && !p.state.isFlying) {
      p.velocity.y = Math.max(p.velocity.y, strength * 0.4);
      p.state.onGround = false;
    }
  }

  /** Arrastre externo (la ola gigante, una corriente): desplaza al jugador respetando obstáculos. */
  drift(dx, dz) {
    const p = this._player;
    if (!this._isBlocked(p.position.x + dx, p.position.z)) p.position.x += dx;
    if (!this._isBlocked(p.position.x, p.position.z + dz)) p.position.z += dz;
  }

  /**
   * Modificadores de movimiento que imponen otros sistemas (p. ej. la energía).
   * @param {{ canRun?: boolean, speedMultiplier?: number }} mods
   */
  setMovementModifiers(mods) {
    Object.assign(this._mods, mods);
  }

  /** Coloca al jugador sobre el suelo en (x, z). */
  placeAt(x, z) {
    const y = this._groundHeight(x, z, this._terrain.getHeightAt(x, z) + 0.5);
    this._player.teleport(x, y, z);
  }

  spawn() {
    const s = this._terrain.getSpawnPoint();
    this.placeAt(s.x, s.z);
  }

  update(dt) {
    const p = this._player;
    const cfg = this._cfg;
    const input = this._input;

    // ---- Mirada ----------------------------------------------------------
    const mouse = input.getMouseDelta();
    const sens = this._lookSensitivity;
    p.yaw = wrapAngle(p.yaw - mouse.x * sens);
    p.pitch = THREE.MathUtils.clamp(p.pitch - mouse.y * sens * this._invertY, -cfg.PITCH_LIMIT, cfg.PITCH_LIMIT);

    // ---- Intención de movimiento ------------------------------------------
    const fwd = (input.isDown('FORWARD') ? 1 : 0) - (input.isDown('BACKWARD') ? 1 : 0);
    const strafe = (input.isDown('RIGHT') ? 1 : 0) - (input.isDown('LEFT') ? 1 : 0);
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    // adelante = (-sin, -cos), derecha = (cos, -sin)
    this._wish.set(-sin * fwd + cos * strafe, 0, -cos * fwd - sin * strafe);
    const moving = this._wish.lengthSq() > 0;
    if (moving) this._wish.normalize();

    p.state.isMoving = moving;
    p.state.isRunning = moving && input.isDown('RUN') && !p.state.isFlying && !p.state.isClimbing && this._mods.canRun;

    if (p.state.isFlying) {
      this._setSwimming(false, false, null); // volando (Admin) no se nada
      this._updateFlying(dt);
    } else this._updateWalking(dt);

    // ---- Orientación del cuerpo hacia la dirección de avance ---------------
    if (moving) {
      const targetYaw = Math.atan2(-this._wish.x, -this._wish.z);
      const diff = wrapAngle(targetYaw - p.bodyYaw);
      const maxStep = cfg.BODY_TURN_SPEED * dt;
      p.bodyYaw = wrapAngle(p.bodyYaw + THREE.MathUtils.clamp(diff, -maxStep, maxStep));
    }

    // Aviso al LLEGAR al límite (no mientras se sigue empujando contra él).
    this._edgeNoticeCooldown = Math.max(0, this._edgeNoticeCooldown - dt);
    const atEdge = this._clampToBounds();
    if (atEdge && !this._wasAtEdge && this._edgeNoticeCooldown === 0) {
      this._edgeNoticeCooldown = 3;
      this._events.emit(GameEvents.WORLD_EDGE_REACHED);
    }
    this._wasAtEdge = atEdge;
  }

  // ---- Modos de movimiento -------------------------------------------------

  _updateWalking(dt) {
    const p = this._player;
    const cfg = this._cfg;
    const v = p.velocity;

    // ¿En el agua lo bastante honda para nadar?
    const surface = this._water?.surfaceAt(p.position.x, p.position.z) ?? null;
    const fluid = surface !== null ? this._water.fluid() : null;
    const depth = surface === null ? -1 : surface - p.position.y;
    const enter = cfg.SWIM.ENTER_DEPTH - (p.state.isSwimming ? 0.15 : 0);
    if (fluid?.swim && depth > enter) {
      this._updateSwimming(dt, surface, fluid);
      return;
    }
    this._setSwimming(false, false, surface);
    if (this._updateClimbing(dt)) return;

    const speed = (p.state.isRunning ? cfg.RUN_SPEED : cfg.WALK_SPEED) * this._mods.speedMultiplier;
    const accel = p.state.onGround ? cfg.GROUND_ACCELERATION : cfg.AIR_ACCELERATION;
    this._accelerateHorizontal(this._wish.x * speed, this._wish.z * speed, accel * dt);

    // Salto (con buffer de entrada y coyote time)
    if (this._input.wasPressed('JUMP')) this._jumpBuffer = JUMP_BUFFER_TIME;
    else this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
    this._coyote = p.state.onGround ? COYOTE_TIME : Math.max(0, this._coyote - dt);

    if (this._jumpBuffer > 0 && this._coyote > 0) {
      v.y = cfg.JUMP_VELOCITY;
      this._jumpBuffer = 0;
      this._coyote = 0;
      p.state.onGround = false;
      this._events.emit(GameEvents.PLAYER_JUMPED);
    }

    v.y = Math.max(v.y - cfg.GRAVITY * this.gravityScale * dt, -cfg.TERMINAL_VELOCITY);

    // Movimiento horizontal por ejes, con bloqueo por paredes y pendientes.
    const nx = p.position.x + v.x * dt;
    if (this._isBlocked(nx, p.position.z)) v.x = 0;
    else p.position.x = nx;
    const nz = p.position.z + v.z * dt;
    if (this._isBlocked(p.position.x, nz)) v.z = 0;
    else p.position.z = nz;

    // Obstáculos (troncos, rocas, paredes...): empujar fuera sin atravesarlos.
    if (this._obstacles) {
      const px = p.position.x;
      const pz = p.position.z;
      const hit = this._obstacles.resolveCollisions(p.position, cfg.RADIUS, p.position.y + 0.05, p.position.y + cfg.HEIGHT);
      if (hit && this._isBlocked(p.position.x, p.position.z)) {
        p.position.x = px;
        p.position.z = pz;
      }
    }

    // Movimiento vertical y contacto con el suelo.
    const wasOnGround = p.state.onGround;
    const feetBefore = p.position.y;
    const ground = this._groundHeight(p.position.x, p.position.z);
    p.position.y += v.y * dt;

    // Techo de una construcción: la cabeza no lo atraviesa al saltar.
    if (v.y > 0 && this._structures) {
      const ceiling = this._structures.ceilingAt(p.position.x, p.position.z, feetBefore + cfg.HEIGHT - 0.3);
      if (p.position.y + cfg.HEIGHT > ceiling) {
        p.position.y = Math.max(feetBefore, ceiling - cfg.HEIGHT);
        v.y = 0;
      }
    }

    if (p.position.y <= ground) {
      // Aterrizaje o subida de escalón.
      if (!wasOnGround && v.y < 0) this._events.emit(GameEvents.PLAYER_LANDED, { fallSpeed: -v.y });
      p.position.y = ground;
      v.y = 0;
      p.state.onGround = true;
    } else if (wasOnGround && v.y <= 0 && p.position.y - ground <= cfg.MAX_STEP_HEIGHT) {
      // Bajada de escalón / pendiente: mantenerse pegado al suelo.
      p.position.y = ground;
      v.y = 0;
      p.state.onGround = true;
    } else {
      p.state.onGround = false;
    }
  }

  /** Nadar: flotar con la cabeza fuera; Espacio sube, C bucea (si se puede), Shift más rápido. */
  _updateSwimming(dt, surface, fluid) {
    const p = this._player;
    const cfg = this._cfg;
    const S = cfg.SWIM;
    const v = p.velocity;
    if (!p.state.isSwimming && v.y < -3) v.y *= S.ENTRY_DAMPING; // al caer al agua, frena
    const speed = (p.state.isRunning ? S.RUN_SPEED : S.SPEED) * this._mods.speedMultiplier;
    this._accelerateHorizontal(this._wish.x * speed, this._wish.z * speed, cfg.GROUND_ACCELERATION * 0.5 * dt);

    const ground = this._groundHeight(p.position.x, p.position.z);
    const floatFeet = surface - S.FLOAT_DEPTH;
    const up = this._input.isDown('JUMP');
    const down = this._input.isDown('DESCEND') && fluid.dive;
    // Salir del agua: en la orilla (suelo justo bajo los pies) Espacio salta; delante de
    // un borde poco más alto que la superficie (la rampa de la nave, una roca) se trepa.
    const ledge = this._input.wasPressed('JUMP') ? this._ledgeAhead(p.position.y) : null;
    if (this._input.wasPressed('JUMP') && p.position.y - ground < 0.4) {
      v.y = cfg.JUMP_VELOCITY;
      this._events.emit(GameEvents.PLAYER_JUMPED);
    } else if (ledge !== null) {
      v.y = Math.sqrt(2 * cfg.GRAVITY * this.gravityScale * (ledge - p.position.y + 0.35));
      const f = 2.5;
      v.x = -Math.sin(p.yaw) * f;
      v.z = -Math.cos(p.yaw) * f;
      this._events.emit(GameEvents.PLAYER_JUMPED);
    } else if (up) {
      v.y = p.position.y < floatFeet ? S.VERTICAL_SPEED : Math.min(v.y, 0.5);
    } else if (down) {
      v.y = -S.VERTICAL_SPEED;
    } else {
      // Sin pulsar nada se vuelve a flotar poco a poco.
      v.y += ((floatFeet - p.position.y) * S.BUOYANCY - v.y) * Math.min(1, 3 * dt);
    }

    const nx = p.position.x + v.x * dt;
    if (this._isBlocked(nx, p.position.z)) v.x = 0;
    else p.position.x = nx;
    const nz = p.position.z + v.z * dt;
    if (this._isBlocked(p.position.x, nz)) v.z = 0;
    else p.position.z = nz;
    if (this._obstacles) this._obstacles.resolveCollisions(p.position, cfg.RADIUS, p.position.y + 0.05, p.position.y + cfg.HEIGHT);

    p.position.y += v.y * dt;
    if (!fluid.dive && p.position.y < floatFeet - 0.15) p.position.y = floatFeet - 0.15; // sin buceo: no se hunde
    if (p.position.y > floatFeet + 0.6 && v.y > 0 && !(p.position.y - ground < 0.6)) v.y = Math.min(v.y, 1); // no "volar" fuera del agua
    if (p.position.y <= ground) {
      p.position.y = ground;
      if (v.y < 0) v.y = 0;
    }
    p.state.onGround = p.position.y - ground < 0.02;
    this._setSwimming(true, p.position.y + cfg.HEIGHT * 0.9 < surface, surface);
  }

  /** Altura de un borde trepable justo delante (entre 0,3 y 2 m sobre los pies), o null. */
  _ledgeAhead(feet) {
    const p = this._player;
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    for (const d of [0.6, 1.0]) {
      const h = this._groundAt(p.position.x + fx * d, p.position.z + fz * d, feet + 2.1);
      if (h - feet > 0.3 && h - feet < 2.0) return h;
    }
    return null;
  }

  /**
   * Escalada: avanzar contra una pendiente de más de CLIMB.START_SLOPE_DEG la trepa
   * (pegado al terreno, sin gravedad); parado en ella, se queda agarrado. Ambas cosas
   * gastan energía (EnergySystem lee state.isClimbing). Sin energía no se puede: en
   * una pendiente así se resbala hacia abajo. Espacio se suelta.
   * @returns {boolean} true si se ha encargado del movimiento este frame
   */
  _updateClimbing(dt) {
    const C = this._cfg.CLIMB;
    const p = this._player;
    const pos = p.position;
    const t = this._terrain;
    if (!C || p.state.isFlying) return this._setClimbing(false);
    // Altura del terreno bajo la huella (en una pendiente, el punto más alto).
    const foot = (x, z) => {
      const r = this._cfg.RADIUS;
      let h = -Infinity;
      for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) h = Math.max(h, t.getHeightAt(x + dx, z + dz));
      return h;
    };
    const ground = foot(pos.x, pos.z);
    const center = t.getHeightAt(pos.x, pos.z);
    const onStructure = this._structures?.surfaceAt(pos.x, pos.z, pos.y + this._cfg.MAX_STEP_HEIGHT) != null;
    if (onStructure || pos.y - ground > (p.state.isClimbing ? 0.6 : 0.25)) return this._setClimbing(false);

    const d = 0.4;
    const gx = (t.getHeightAt(pos.x + d, pos.z) - t.getHeightAt(pos.x - d, pos.z)) / (2 * d);
    const gz = (t.getHeightAt(pos.x, pos.z + d) - t.getHeightAt(pos.x, pos.z - d)) / (2 * d);
    const steepHere = Math.hypot(gx, gz) > this._climbTan;
    const moving = this._wish.lengthSq() > 0;
    let along = 0; // pendiente en la dirección en que se quiere ir
    if (moving) {
      const ahead = 0.6;
      along = (t.getHeightAt(pos.x + this._wish.x * ahead, pos.z + this._wish.z * ahead) - center) / ahead;
    }
    const wantsUp = moving && along > this._climbTan;
    const canClimb = this._mods.canClimb !== false;

    if ((wantsUp || (p.state.isClimbing && steepHere)) && canClimb) {
      if (this._input.wasPressed('JUMP')) {
        // Soltarse: pequeño salto hacia atrás.
        p.velocity.set(-this._wish.x * 2, this._cfg.JUMP_VELOCITY * 0.5, -this._wish.z * 2);
        p.state.onGround = false;
        return this._setClimbing(false);
      }
      if (moving) {
        const step = C.SPEED * this._mods.speedMultiplier * dt / Math.sqrt(1 + Math.max(0, along) ** 2);
        const nx = pos.x + this._wish.x * step;
        const nz = pos.z + this._wish.z * step;
        const blocked = this._structures?.blocksAt(nx, nz, this._cfg.RADIUS, pos.y + this._cfg.MAX_STEP_HEIGHT, pos.y + this._cfg.HEIGHT);
        if (!blocked) {
          pos.x = nx;
          pos.z = nz;
        }
        this._obstacles?.resolveCollisions(pos, this._cfg.RADIUS, pos.y + 0.05, pos.y + this._cfg.HEIGHT);
      }
      pos.y = foot(pos.x, pos.z);
      p.velocity.set(0, 0, 0);
      p.state.onGround = true;
      return this._setClimbing(true);
    }
    if (steepHere && !canClimb) {
      // Agotado en una pendiente demasiado empinada: resbala hacia abajo.
      const m = Math.hypot(gx, gz);
      pos.x -= (gx / m) * C.SLIDE_SPEED * dt;
      pos.z -= (gz / m) * C.SLIDE_SPEED * dt;
      this._obstacles?.resolveCollisions(pos, this._cfg.RADIUS, pos.y + 0.05, pos.y + this._cfg.HEIGHT);
      pos.y = foot(pos.x, pos.z);
      p.velocity.set(0, 0, 0);
      p.state.onGround = true;
      this._setClimbing(false);
      return true;
    }
    return this._setClimbing(false);
  }

  /** @returns {boolean} el mismo valor (para usarlo en `return`) */
  _setClimbing(on) {
    const s = this._player.state;
    if (s.isClimbing !== on) {
      s.isClimbing = on;
      this._events.emit(GameEvents.PLAYER_CLIMB_CHANGED, { climbing: on });
    }
    return on;
  }

  _setSwimming(swimming, underwater, surface) {
    const s = this._player.state;
    if (s.isSwimming === swimming && s.headUnderwater === underwater) return;
    s.isSwimming = swimming;
    s.headUnderwater = underwater;
    this._events.emit(GameEvents.PLAYER_SWIM_CHANGED, { swimming, underwater, surface });
  }

  _updateFlying(dt) {
    const p = this._player;
    const cfg = this._cfg;
    const speed = cfg.FLY_SPEED * (this._input.isDown('RUN') ? 2 : 1);
    this._accelerateHorizontal(this._wish.x * speed, this._wish.z * speed, cfg.GROUND_ACCELERATION * 2 * dt);
    const vertical = (this._input.isDown('JUMP') ? 1 : 0) - (this._input.isDown('DESCEND') ? 1 : 0);
    p.velocity.y = vertical * speed;

    p.position.addScaledVector(p.velocity, dt);
    const ground = this._groundHeight(p.position.x, p.position.z);
    if (p.position.y < ground) p.position.y = ground;
    p.state.onGround = p.position.y - ground < 0.01;
  }

  _accelerateHorizontal(tx, tz, maxDelta) {
    const v = this._player.velocity;
    const dx = tx - v.x;
    const dz = tz - v.z;
    const len = Math.hypot(dx, dz);
    if (len <= maxDelta || len === 0) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / len) * maxDelta;
      v.z += (dz / len) * maxDelta;
    }
  }

  /**
   * ¿Impide el terreno moverse a (x, z)?
   * - Pared: el suelo sube más que MAX_STEP_HEIGHT respecto a los pies.
   * - Pendiente: se sube y la inclinación supera MAX_WALKABLE_SLOPE_DEG.
   *   Bajar una pendiente siempre está permitido.
   */
  _isBlocked(x, z) {
    const p = this._player;
    const cfg = this._cfg;
    const feet = p.position.y;
    const rise = this._groundHeight(x, z) - feet;
    if (rise > cfg.MAX_STEP_HEIGHT) return true;
    // Bordes de suelos/cimientos más altos que un escalón actúan como muro.
    const st = this._structures;
    if (st?.blocksAt(x, z, cfg.RADIUS, feet + cfg.MAX_STEP_HEIGHT, feet + cfg.HEIGHT)) return true;
    // Sobre una construcción no cuenta la pendiente del terreno de debajo.
    const onStructure = st && st.surfaceAt(x, z, feet + cfg.MAX_STEP_HEIGHT) !== null;
    if (rise > 0.01 && p.state.onGround && !onStructure) {
      const t = this._terrain;
      const d = 0.5;
      const gx = (t.getHeightAt(x + d, z) - t.getHeightAt(x - d, z)) / (2 * d);
      const gz = (t.getHeightAt(x, z + d) - t.getHeightAt(x, z - d)) / (2 * d);
      if (Math.hypot(gx, gz) > this._maxSlopeTan) return true;
    }
    return false;
  }

  /**
   * Altura del suelo bajo la huella del jugador (centro + 4 puntos del radio):
   * terreno o superficie construida, sin contar las que están por encima de
   * los pies + un escalón (un piso superior no es "suelo" desde abajo).
   */
  _groundHeight(x, z, feet = this._player.position.y) {
    const r = this._cfg.RADIUS;
    const maxY = feet + this._cfg.MAX_STEP_HEIGHT;
    let h = -Infinity;
    for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      h = Math.max(h, this._groundAt(x + dx, z + dz, maxY));
    }
    return h;
  }

  _groundAt(x, z, maxY) {
    const terrain = this._terrain.getHeightAt(x, z);
    const built = this._structures?.surfaceAt(x, z, maxY) ?? null;
    return built !== null && built > terrain ? built : terrain;
  }

  /** @returns {boolean} true si el jugador estaba fuera del área jugable */
  _clampToBounds() {
    const b = this._terrain.getBounds();
    const r = this._cfg.RADIUS;
    const pos = this._player.position;
    const x = THREE.MathUtils.clamp(pos.x, b.minX + r, b.maxX - r);
    const z = THREE.MathUtils.clamp(pos.z, b.minZ + r, b.maxZ - r);
    const clamped = x !== pos.x || z !== pos.z;
    pos.x = x;
    pos.z = z;
    return clamped;
  }
}
