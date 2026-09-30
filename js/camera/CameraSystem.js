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
 */
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

    if (input.wasPressed('TOGGLE_CAMERA')) this.toggleMode();

    const wheel = input.getWheel();
    if (wheel && this.mode === CameraMode.THIRD_PERSON) {
      this._distance = THREE.MathUtils.clamp(
        this._distance + wheel * cfg.THIRD_PERSON_ZOOM_STEP,
        cfg.THIRD_PERSON_MIN_DISTANCE,
        cfg.THIRD_PERSON_MAX_DISTANCE,
      );
    }

    // Transición suave (exponencial, independiente del framerate).
    const goal = MODE_BLEND[this.mode];
    if (cfg.TRANSITION_SPEED > 0) {
      this._blend += (goal - this._blend) * (1 - Math.exp(-cfg.TRANSITION_SPEED * dt));
      if (Math.abs(goal - this._blend) < 0.001) this._blend = goal;
    } else {
      this._blend = goal;
    }

    this._place();
    this._updateBodyVisibility();
  }

  _place() {
    const cfg = this._cfg;
    const t = this._target;
    const yaw = t.yaw;
    const pitch = t.pitch;

    t.getEyePosition(this._eye);
    const cp = Math.cos(pitch);
    this._fwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    // Posición ideal en 3ª persona: detrás, un poco por encima y al hombro.
    this._pivot.copy(this._eye).addScaledVector(this._right, cfg.THIRD_PERSON_SHOULDER_OFFSET * this._blend);
    this._pivot.y += cfg.THIRD_PERSON_HEIGHT_OFFSET;
    let dist = this._occlusionDistance(this._pivot, this._distance);
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
    const visible = this._blend > this._cfg.HIDE_BODY_BELOW_BLEND;
    if (visible !== this._bodyVisible) {
      this._bodyVisible = visible;
      this._events.emit(GameEvents.CAMERA_BODY_VISIBILITY, { visible });
    }
  }
}
