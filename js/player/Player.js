import * as THREE from 'three';
import { PlayerModel } from './PlayerModel.js';

/**
 * Player — entidad del jugador: estado + modelo visual.
 *
 * - NO lee la entrada (eso es PlayerController).
 * - NO sabe en qué modo está la cámara: solo expone su posición de ojos y la
 *   orientación de la mirada (yaw/pitch). CameraSystem decide dónde colocar
 *   la cámara a partir de esos datos.
 * - Las estadísticas de supervivencia (vida, hambre...) serán sistemas
 *   independientes que referencian al jugador, no campos de esta clase.
 */
export class Player {
  constructor({ config, scene }) {
    this.name = 'player';
    this._cfg = config;

    // Posición de los PIES.
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();

    /** Orientación de la mirada (radianes). yaw=0 mira hacia -Z. */
    this.yaw = 0;
    this.pitch = 0;
    /** Orientación del cuerpo (se orienta hacia la dirección de avance). */
    this.bodyYaw = 0;

    this.state = {
      onGround: false,
      isRunning: false,
      isMoving: false,
      isFlying: false,
      isSwimming: false,     // en el agua (mar o charca honda)
      headUnderwater: false, // buceando: sin aire salvo con el traje
      isClimbing: false,     // trepando una pendiente empinada (gasta energía)
      isCrouching: false,    // agachado (C)
      dodging: 0,            // s que quedan de esquiva (invulnerable mientras > 0)
    };
    this.crouch = 0;         // 0..1: transición suave al agacharse (baja los ojos)

    this.model = new PlayerModel({ colors: config.COLORS });
    scene.add(this.model.root);
  }

  get eyeHeight() {
    const C = this._cfg.CROUCH;
    return C ? this._cfg.EYE_HEIGHT + (C.EYE_HEIGHT - this._cfg.EYE_HEIGHT) * this.crouch : this._cfg.EYE_HEIGHT;
  }

  /** Altura del cuerpo (más baja agachado: pasa por sitios bajos). */
  get height() {
    const C = this._cfg.CROUCH;
    return C && this.state.isCrouching ? C.HEIGHT : this._cfg.HEIGHT;
  }

  /** Posición de los ojos (escribe en `out` para no crear objetos por frame). */
  getEyePosition(out = new THREE.Vector3()) {
    return out.set(this.position.x, this.position.y + this.eyeHeight, this.position.z);
  }

  /** Vector unitario de la dirección de la mirada. */
  getLookDirection(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  teleport(x, y, z) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.state.onGround = false;
  }

  /** Animación de acción (golpear, recoger, beber…). Solo visual. */
  playAction(kind = 'hit') {
    this.model.playAction(kind);
  }

  setBodyVisible(visible) {
    this.model.setVisible(visible);
  }

  update(dt) {
    const root = this.model.root;
    root.position.copy(this.position);
    root.rotation.y = this.bodyYaw;

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.model.animate(dt, {
      horizontalSpeed,
      maxSpeed: this._cfg.RUN_SPEED,
      onGround: this.state.onGround || this.state.isFlying,
      climbing: this.state.isClimbing || !!this.state.onLadder,
      swimming: this.state.isSwimming,
      crouch: this.crouch,
      dodging: this.state.dodging > 0,
      climbMoving: this.state.isClimbing && this.state.isMoving,
      headPitch: THREE.MathUtils.clamp(this.pitch, -0.7, 0.7),
      headYaw: THREE.MathUtils.clamp(wrapAngle(this.yaw - this.bodyYaw), -1.1, 1.1),
    });
  }
}

export function wrapAngle(a) {
  return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI;
}
