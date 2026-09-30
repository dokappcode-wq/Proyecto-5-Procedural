import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SpaceScene } from './SpaceScene.js';

/**
 * SpaceSystem — transición conceptual al espacio (Fase 13).
 *
 *   SUPERFICIE → (fundido) ASCENDING → SPACE → (fundido) DESCENDING → SUPERFICIE
 *
 * Se entra con SPACE_ENTER_REQUEST (la nave, a bastante altura, o el Admin) y se
 * vuelve con SPACE_EXIT_REQUEST o la tecla T. En el espacio se ve MUNDO 0 desde
 * fuera y sus dos lunas; la cámara orbita el cuerpo enfocado (1 MUNDO 0 · 2 Luna A ·
 * 3 Luna B · 4 la nave), con el ratón se gira y con la rueda se acerca.
 *
 * Es una escena aparte (RenderContext.setActive): el mundo de la superficie no se
 * dibuja mientras tanto y sigue exactamente como estaba al volver. Las lunas no se
 * pueden visitar (falta el nodo espacial) y no hay navegación orbital.
 */
export const SpaceState = Object.freeze({ SURFACE: 'SURFACE', ASCENDING: 'ASCENDING', SPACE: 'SPACE', DESCENDING: 'DESCENDING' });
const FOCUS_KEYS = ['MUNDO_0', 'MOON_A', 'MOON_B', 'SHIP'];

export class SpaceSystem {
  /**
   * @param {object} p.sources { getCatalog(), getMapCanvas(), getSeed(), planet, noonHour }
   */
  constructor({ config, celestialConfig, render, input, events, time, sources }) {
    this.name = 'space';
    this._cfg = config;
    this._render = render;
    this._input = input;
    this._events = events;
    this._time = time;
    this._src = sources;
    this.state = SpaceState.SURFACE;
    this.focus = 'MUNDO_0';
    this._timer = 0;
    this._space = new SpaceScene({ config, celestialConfig });
    render.addCamera(this._space.camera);

    this._orbit = { yaw: 0.6, pitch: 0.25, distance: 0 };
    this._target = new THREE.Vector3();
    this._targetGoal = new THREE.Vector3();
    this._distanceGoal = 0;
    this._v = new THREE.Vector3();

    events.on(GameEvents.SPACE_ENTER_REQUEST, () => this.enter());
    events.on(GameEvents.SPACE_EXIT_REQUEST, () => this.exit());
    events.on(GameEvents.SPACE_FOCUS_REQUEST, ({ id }) => this.focusOn(id));
    // Morir o regenerar el mundo en el espacio: vuelta inmediata a la superficie.
    events.on(GameEvents.PLAYER_DIED, () => this._toSurface());
    events.on(GameEvents.WORLD_GENERATED, () => this._toSurface());
  }

  get active() {
    return this.state !== SpaceState.SURFACE;
  }

  get fadeTime() {
    return this._cfg.FADE_TIME;
  }

  enter() {
    if (this.state !== SpaceState.SURFACE) return false;
    this._setState(SpaceState.ASCENDING);
    return true;
  }

  exit() {
    if (this.state !== SpaceState.SPACE) return false;
    this._setState(SpaceState.DESCENDING);
    return true;
  }

  focusOn(id) {
    const b = this._space.bodies[id];
    if (!b) return;
    this.focus = id;
    this._distanceGoal = Math.max(8, b.radius * (id === 'MUNDO_0' ? 3.4 : id === 'SHIP' ? 14 : 4.5));
    this._events.emit(GameEvents.SPACE_FOCUS_CHANGED, { id, name: b.name });
  }

  update(dt) {
    if (this.state === SpaceState.SURFACE) return;
    this._timer += dt;
    const fade = this._cfg.FADE_TIME;

    if (this.state === SpaceState.ASCENDING && this._timer >= fade) {
      // Pantalla en negro: se prepara la escena (texturas de la seed) y se cambia.
      this._space.build({
        catalog: this._src.getCatalog(),
        seed: this._src.getSeed(),
        mapCanvas: this._src.getMapCanvas(),
        planet: this._src.planet,
      });
      this.focusOn('MUNDO_0');
      this._orbit.distance = this._distanceGoal * 1.8; // llega "desde abajo" alejándose
      this._orbit.yaw = 0.35;
      this._orbit.pitch = 0.12;
      this._render.setActive(this._space.scene, this._space.camera);
      this._setState(SpaceState.SPACE);
    } else if (this.state === SpaceState.DESCENDING && this._timer >= fade) {
      this._toSurface();
      return;
    }
    if (this.state === SpaceState.SPACE) this._updateSpace(dt);
  }

  _updateSpace(dt) {
    const input = this._input;
    if (input.wasPressed('SHIP_TAKEOFF')) this.exit();
    FOCUS_KEYS.forEach((id, i) => input.wasPressed(`HOTBAR_${i + 1}`) && this.focusOn(id));

    const m = input.getMouseDelta();
    const o = this._orbit;
    o.yaw -= m.x * 0.004;
    o.pitch = Math.max(-1.3, Math.min(1.3, o.pitch + m.y * 0.004));
    const wheel = input.getWheel();
    if (wheel) this._distanceGoal = Math.max(this._space.bodies[this.focus].radius * 1.4, this._distanceGoal * (wheel > 0 ? 1.15 : 0.87));

    this._space.update(this._time.totalHours, dt, this._src.noonHour);
    // La cámara se desliza hacia el cuerpo enfocado.
    this._space.bodies[this.focus].object.getWorldPosition(this._targetGoal);
    const k = 1 - Math.exp(-3 * dt);
    this._target.lerp(this._targetGoal, k);
    o.distance += (this._distanceGoal - o.distance) * k;
    const cam = this._space.camera;
    const cp = Math.cos(o.pitch);
    cam.position.set(Math.sin(o.yaw) * cp, Math.sin(o.pitch), Math.cos(o.yaw) * cp).multiplyScalar(o.distance).add(this._target);
    cam.lookAt(this._target);
  }

  /**
   * Etiquetas de pantalla (px) de los cuerpos: [{ id, name, x, y, visible, focused }].
   * Las pinta SpaceHUD.
   */
  getLabels(width, height) {
    if (this.state !== SpaceState.SPACE) return [];
    const cam = this._space.camera;
    return Object.entries(this._space.bodies).map(([id, b]) => {
      b.object.getWorldPosition(this._v);
      this._v.y += b.radius * 1.15;
      this._v.project(cam);
      return {
        id,
        name: id === 'MUNDO_0' ? `${b.name} (estás aquí)` : b.name,
        x: (this._v.x * 0.5 + 0.5) * width,
        y: (-this._v.y * 0.5 + 0.5) * height,
        visible: this._v.z < 1 && Math.abs(this._v.x) < 1.1 && Math.abs(this._v.y) < 1.1,
        focused: id === this.focus,
      };
    });
  }

  /** Datos del cuerpo enfocado para el panel. */
  getFocusInfo() {
    const catalog = this._src.getCatalog();
    if (this.focus === 'MUNDO_0') return { id: 'MUNDO_0', name: catalog.planet.name, radiusKm: catalog.planet.radiusKm, home: true };
    if (this.focus === 'SHIP') return { id: 'SHIP', name: 'Tu nave', ship: true };
    return { ...catalog.bodies.find((b) => b.id === this.focus) };
  }

  _toSurface() {
    if (this.state === SpaceState.SURFACE) return;
    this._render.setActive(null, null);
    this._setState(SpaceState.SURFACE);
  }

  _setState(state) {
    const previous = this.state;
    this.state = state;
    this._timer = 0;
    this._events.emit(GameEvents.SPACE_STATE_CHANGED, { state, previous, fadeTime: this._cfg.FADE_TIME });
  }
}
