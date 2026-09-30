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
 * - Troncos y rocas bloquean el paso (obstacles.resolveCollisions).
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
  constructor({ config, look, input, player, terrain, obstacles = null, events }) {
    this.name = 'playerController';
    this._cfg = config;
    this._lookSensitivity = look.sensitivity;
    this._invertY = look.invertY ? -1 : 1;
    this._input = input;
    this._player = player;
    this._terrain = terrain;
    this._obstacles = obstacles; // { resolveCollisions(pos, radius) } — troncos, rocas...
    this._events = events;

    this._maxSlopeTan = Math.tan(THREE.MathUtils.degToRad(config.MAX_WALKABLE_SLOPE_DEG));
    this._edgeNoticeCooldown = 0;
    this._wasAtEdge = false;
    this._jumpBuffer = 0;
    this._coyote = 0;
    this._wish = new THREE.Vector3();
  }

  /** Cambia el terreno activo (p. ej. al regenerar el mundo en fases posteriores). */
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

  /** Coloca al jugador sobre el suelo en (x, z). */
  placeAt(x, z) {
    const y = this._groundHeight(x, z);
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
    p.state.isRunning = moving && input.isDown('RUN') && !p.state.isFlying;

    if (p.state.isFlying) this._updateFlying(dt);
    else this._updateWalking(dt);

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

    const speed = p.state.isRunning ? cfg.RUN_SPEED : cfg.WALK_SPEED;
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

    v.y = Math.max(v.y - cfg.GRAVITY * dt, -cfg.TERMINAL_VELOCITY);

    // Movimiento horizontal por ejes, con bloqueo por paredes y pendientes.
    const nx = p.position.x + v.x * dt;
    if (this._isBlocked(nx, p.position.z)) v.x = 0;
    else p.position.x = nx;
    const nz = p.position.z + v.z * dt;
    if (this._isBlocked(p.position.x, nz)) v.z = 0;
    else p.position.z = nz;

    // Obstáculos (troncos, rocas): empujar fuera sin atravesarlos.
    if (this._obstacles) {
      const px = p.position.x;
      const pz = p.position.z;
      if (this._obstacles.resolveCollisions(p.position, cfg.RADIUS) && this._isBlocked(p.position.x, p.position.z)) {
        p.position.x = px;
        p.position.z = pz;
      }
    }

    // Movimiento vertical y contacto con el suelo.
    const wasOnGround = p.state.onGround;
    const ground = this._groundHeight(p.position.x, p.position.z);
    p.position.y += v.y * dt;

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
    const rise = this._groundHeight(x, z) - p.position.y;
    if (rise > this._cfg.MAX_STEP_HEIGHT) return true;
    if (rise > 0.01 && p.state.onGround) {
      const t = this._terrain;
      const d = 0.5;
      const gx = (t.getHeightAt(x + d, z) - t.getHeightAt(x - d, z)) / (2 * d);
      const gz = (t.getHeightAt(x, z + d) - t.getHeightAt(x, z - d)) / (2 * d);
      if (Math.hypot(gx, gz) > this._maxSlopeTan) return true;
    }
    return false;
  }

  /** Altura del suelo bajo la huella del jugador (centro + 4 puntos del radio). */
  _groundHeight(x, z) {
    const r = this._cfg.RADIUS;
    const t = this._terrain;
    return Math.max(
      t.getHeightAt(x, z),
      t.getHeightAt(x + r, z),
      t.getHeightAt(x - r, z),
      t.getHeightAt(x, z + r),
      t.getHeightAt(x, z - r),
    );
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
