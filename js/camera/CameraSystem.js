import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';

export const CameraMode = Object.freeze({
  FIRST_PERSON: 'FIRST_PERSON',
  THIRD_PERSON: 'THIRD_PERSON',
});

const MODE_BLEND = { [CameraMode.FIRST_PERSON]: 0, [CameraMode.THIRD_PERSON]: 1 };
const OCCLUSION_STEPS = 16;

/**
 * CameraSystem — coloca la cámara a partir de un "objetivo" que expone:
 *   getEyePosition(out), yaw, pitch
 *
 * No modifica al jugador: el jugador no sabe en qué modo está la cámara.
 *
 * Los modos se interpolan con un factor `blend` (0 = 1ª persona, 1 = 3ª),
 * lo que produce una transición suave. Añadir nuevos modos (cámara libre,
 * orbital, cinemática...) consiste en calcular otra posición objetivo.
 *
 * En 3ª persona la cámara mira en la misma dirección que el jugador (vista
 * "sobre el hombro"), de forma que la mira central sirve en ambos modos.
 *
 * Vista de vehículo (`setVehicleView`): mientras se pilota la nave, la cámara
 * orbita el vehículo en 3ª persona (el vehículo expone la misma interfaz que el
 * jugador + `distance`). Al soltarla vuelve suavemente al modo anterior.
 *
 * Vista de retrato (`setPortraitView(true)`): con el menú del reloj abierto, la
 * cámara gira alrededor del jugador hasta quedar delante de él, mirándolo, con el
 * personaje a la izquierda de la pantalla para que el menú quepa a la derecha.
 */
const PORTRAIT_SPEED = 6;      // rapidez de la transición
const PORTRAIT_DISTANCE = 3.0; // m delante del pecho
const PORTRAIT_HEIGHT = 0.2;   // m por encima del pecho
const PORTRAIT_SIDE = 2.15;    // m que se desplaza el punto de mira a la derecha (jugador a la izquierda)

export class CameraSystem {
  constructor({ config, camera, input, target, terrain, events, occluders = null }) {
    this.name = 'camera';
    this._cfg = config;
    this._camera = camera;
    this._input = input;
    this._target = target;
    this._terrain = terrain;
    this._events = events;

    this.mode = CameraMode[config.DEFAULT_MODE] ?? CameraMode.THIRD_PERSON;
    this._blend = MODE_BLEND[this.mode];
    this._distance = config.THIRD_PERSON_DISTANCE;
    this._bodyVisible = null;

    this._camera.rotation.order = 'YXZ';

    // Vectores reutilizados (sin asignaciones por frame).
    this._eye = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._third = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._back = new THREE.Vector3();
    this._occluders = occluders; // { raycastDistance(origin, dir, max) } — p. ej. paredes construidas
    this._vehicle = null;        // { getEyePosition(out), yaw, pitch, distance } mientras se pilota
    this._portraitOn = false;
    this._portrait = 0;          // 0..1 mezcla con la vista de retrato
    this._chest = new THREE.Vector3();
    this._pq = new THREE.Quaternion();
    this._pm = new THREE.Matrix4();
    this._pUp = new THREE.Vector3(0, 1, 0);
    this._pLook = new THREE.Vector3();
  }

  /** Cámara delante del jugador, mirándolo (menú del reloj abierto). */
  setPortraitView(on) {
    this._portraitOn = !!on;
  }

  get portraitBlend() {
    return this._portrait;
  }

  /** Cámara en 3ª persona alrededor de un vehículo (o null para volver al jugador). */
  setVehicleView(view) {
    this._vehicle = view;
  }

  setTerrain(terrain) {
    this._terrain = terrain;
  }

  setMode(mode) {
    if (!(mode in MODE_BLEND) || mode === this.mode) return;
    this.mode = mode;
    if (!this._cfg.TRANSITION_SPEED) this._blend = MODE_BLEND[mode];
    this._events.emit(GameEvents.CAMERA_MODE_CHANGED, { mode });
  }

  toggleMode() {
    this.setMode(this.mode === CameraMode.FIRST_PERSON ? CameraMode.THIRD_PERSON : CameraMode.FIRST_PERSON);
  }

  update(dt) {
    const cfg = this._cfg;
    const input = this._input;

    if (input.wasPressed('TOGGLE_CAMERA') && !this._vehicle) this.toggleMode();

    const wheel = this._vehicle ? 0 : input.getWheel();
    if (wheel && this.mode === CameraMode.THIRD_PERSON) {
      this._distance = THREE.MathUtils.clamp(
        this._distance + wheel * cfg.THIRD_PERSON_ZOOM_STEP,
        cfg.THIRD_PERSON_MIN_DISTANCE,
        cfg.THIRD_PERSON_MAX_DISTANCE,
      );
    }

    // Transición suave (exponencial, independiente del framerate).
    const goal = this._vehicle ? 1 : MODE_BLEND[this.mode];
    if (cfg.TRANSITION_SPEED > 0) {
      this._blend += (goal - this._blend) * (1 - Math.exp(-cfg.TRANSITION_SPEED * dt));
      if (Math.abs(goal - this._blend) < 0.001) this._blend = goal;
    } else {
      this._blend = goal;
    }

    const pGoal = this._portraitOn && !this._vehicle ? 1 : 0;
    this._portrait += (pGoal - this._portrait) * (1 - Math.exp(-PORTRAIT_SPEED * dt));
    if (Math.abs(pGoal - this._portrait) < 0.002) this._portrait = pGoal;

    this._place();
    if (this._portrait > 0) this._placePortrait();
    this._updateBodyVisibility();
  }

  /**
   * Mezcla la cámara normal con la de retrato. La posición se interpola girando
   * alrededor del pecho del jugador (no en línea recta, que lo atravesaría).
   */
  _placePortrait() {
    const cam = this._camera;
    const t = this._target;
    const by = t.bodyYaw ?? t.yaw;
    t.getEyePosition(this._chest);
    this._chest.y -= 0.55;
    // Delante del cuerpo (el frente del jugador es -Z con yaw 0).
    const fx = -Math.sin(by);
    const fz = -Math.cos(by);
    let dist = PORTRAIT_DISTANCE;
    if (this._occluders) {
      this._tmp.set(fx, 0, fz);
      const hit = this._occluders.raycastDistance(this._chest, this._tmp, dist + 0.3);
      if (hit !== null) dist = Math.max(0.9, hit - 0.3);
    }
    const goalX = this._chest.x + fx * dist;
    const goalZ = this._chest.z + fz * dist;
    const goalY = this._chest.y + PORTRAIT_HEIGHT;

    const k = this._portrait * this._portrait * (3 - 2 * this._portrait);
    // Interpolación polar alrededor del pecho: ángulo, radio y altura.
    const ox = cam.position.x - this._chest.x;
    const oz = cam.position.z - this._chest.z;
    const a0 = Math.atan2(ox, oz);
    const a1 = Math.atan2(goalX - this._chest.x, goalZ - this._chest.z);
    let da = a1 - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    const a = a0 + da * k;
    const r = Math.hypot(ox, oz) * (1 - k) + dist * k;
    cam.position.set(this._chest.x + Math.sin(a) * r, cam.position.y + (goalY - cam.position.y) * k, this._chest.z + Math.cos(a) * r);
    const minY = this._terrain.getHeightAt(cam.position.x, cam.position.z) + this._cfg.MIN_HEIGHT_ABOVE_GROUND;
    if (cam.position.y < minY) cam.position.y = minY;

    // Mirar al jugador, con el punto de mira algo a su izquierda (él queda a la izquierda).
    const rx = -Math.cos(by);
    const rz = Math.sin(by);
    this._pLook.set(this._chest.x + rx * PORTRAIT_SIDE, this._chest.y, this._chest.z + rz * PORTRAIT_SIDE);
    this._pm.lookAt(cam.position, this._pLook, this._pUp);
    this._pq.setFromRotationMatrix(this._pm);
    cam.quaternion.slerp(this._pq, k);
  }

  _place() {
    const cfg = this._cfg;
    const v = this._vehicle;
    const t = v ?? this._target;
    const yaw = t.yaw;
    const pitch = t.pitch;
    const shoulder = v ? 0 : cfg.THIRD_PERSON_SHOULDER_OFFSET;
    const heightOffset = v ? 0 : cfg.THIRD_PERSON_HEIGHT_OFFSET;

    t.getEyePosition(this._eye);
    const cp = Math.cos(pitch);
    this._fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // Posición ideal en 3ª persona: detrás, un poco por encima y al hombro.
    this._pivot.copy(this._eye).addScaledVector(this._right, shoulder * this._blend);
    this._pivot.y += heightOffset;
    let dist = this._occlusionDistance(this._pivot, v ? v.distance : this._distance);
    // Paredes y techos construidos: la cámara se acerca para no quedar detrás.
    if (this._occluders && this._blend > 0.01) {
      this._back.copy(this._fwd).negate();
      const hit = this._occluders.raycastDistance(this._pivot, this._back, dist + 0.3);
      if (hit !== null) dist = Math.max(0, hit - 0.3);
    }
    this._third.copy(this._pivot).addScaledVector(this._fwd, -dist);

    // Mezcla entre ojos y posición de 3ª persona (curva suave).
    const k = this._blend * this._blend * (3 - 2 * this._blend);
    const pos = this._camera.position.copy(this._eye).lerp(this._third, k);

    // Nunca por debajo del terreno.
    const minY = this._terrain.getHeightAt(pos.x, pos.z) + cfg.MIN_HEIGHT_ABOVE_GROUND;
    if (pos.y < minY) pos.y = minY;

    this._camera.rotation.set(pitch, yaw, 0);
  }

  /**
   * Acorta la distancia si el terreno se interpone entre el pivote y la
   * cámara (colinas, bloques...). Muestreo simple sobre el heightfield.
   */
  _occlusionDistance(pivot, maxDist) {
    const margin = this._cfg.MIN_HEIGHT_ABOVE_GROUND;
    for (let i = 1; i <= OCCLUSION_STEPS; i++) {
      const d = (maxDist * i) / OCCLUSION_STEPS;
      this._tmp.copy(pivot).addScaledVector(this._fwd, -d);
      if (this._terrain.getHeightAt(this._tmp.x, this._tmp.z) + margin > this._tmp.y) {
        return Math.max(0, (maxDist * (i - 1)) / OCCLUSION_STEPS);
      }
    }
    return maxDist;
  }

  _updateBodyVisibility() {
    // En la vista de retrato se ve el cuerpo, aunque sea 1ª persona.
    const visible = !this._vehicle && (this._blend > this._cfg.HIDE_BODY_BELOW_BLEND || this._portrait > 0.02);
    if (visible !== this._bodyVisible) {
      this._bodyVisible = visible;
      this._events.emit(GameEvents.CAMERA_BODY_VISIBILITY, { visible });
    }
  }
}
