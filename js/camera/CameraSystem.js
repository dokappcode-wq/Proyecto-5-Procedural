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
 * Vista del reloj (`setWristView(object3D)`): la cámara se acerca a la muñeca
 * del jugador (el reloj de pulsera) desde los ojos, dejándolo a la izquierda de
 * la pantalla para que el menú quepa a la derecha. Se mezcla suavemente.
 */
const WRIST_SPEED = 7;        // rapidez de la transición
const WRIST_DISTANCE = 0.62;  // m de la cámara al reloj
const WRIST_SIDE = 0.62;      // m que se desplaza el punto de mira a la derecha (reloj a la izquierda)
const WRIST_DROP = 0.36;     // y más abajo: el reloj sube a media altura de la pantalla
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
    this._wristObj = null;       // reloj de pulsera (Object3D) en la vista del reloj
    this._wrist = 0;             // 0..1 mezcla con la vista del reloj
    this._w = new THREE.Vector3();
    this._wq = new THREE.Quaternion();
    this._wm = new THREE.Matrix4();
    this._wUp = new THREE.Vector3(0, 1, 0);
  }

  /** Acercar la cámara al reloj de la muñeca (o null para volver). */
  setWristView(obj) {
    if (obj) this._wristObj = obj;
    this._wristOn = !!obj;
  }

  /** ¿Se está viendo (o yendo hacia) el reloj? */
  get wristBlend() {
    return this._wrist;
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

    const wGoal = this._wristOn && !this._vehicle ? 1 : 0;
    this._wrist += (wGoal - this._wrist) * (1 - Math.exp(-WRIST_SPEED * dt));
    if (Math.abs(wGoal - this._wrist) < 0.002) this._wrist = wGoal;

    this._place();
    if (this._wrist > 0 && this._wristObj) this._placeWrist();
    this._updateBodyVisibility();
  }

  /** Mezcla la cámara normal con la vista del reloj. */
  _placeWrist() {
    const cam = this._camera;
    const w = this._w;
    this._wristObj.updateWorldMatrix(true, false);
    this._wristObj.getWorldPosition(w);
    this._target.getEyePosition(this._eye);
    // Desde los ojos hacia el reloj, un poco por encima.
    this._tmp.copy(this._eye).sub(w).normalize();
    this._third.copy(w).addScaledVector(this._tmp, WRIST_DISTANCE);
    this._third.y += 0.05;
    // Mirar a un punto algo a la derecha del reloj: el reloj queda a la izquierda.
    this._right.set(this._tmp.z, 0, -this._tmp.x).normalize(); // derecha de la cámara (mira hacia −_tmp)
    this._back.copy(w).addScaledVector(this._right, WRIST_SIDE);
    this._back.y -= WRIST_DROP;
    this._wm.lookAt(this._third, this._back, this._wUp);
    this._wq.setFromRotationMatrix(this._wm);
    const k = this._wrist * this._wrist * (3 - 2 * this._wrist);
    cam.position.lerp(this._third, k);
    cam.quaternion.slerp(this._wq, k);
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
    // En la vista del reloj se ve el cuerpo (el brazo y el reloj), aunque sea 1ª persona.
    const visible = !this._vehicle && (this._blend > this._cfg.HIDE_BODY_BELOW_BLEND || this._wrist > 0.02);
    if (visible !== this._bodyVisible) {
      this._bodyVisible = visible;
      this._events.emit(GameEvents.CAMERA_BODY_VISIBILITY, { visible });
    }
  }
}
