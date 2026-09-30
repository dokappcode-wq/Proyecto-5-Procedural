import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { SpaceScene } from './SpaceScene.js';

/**
 * StarMap — mapa estelar 3D del sistema (tecnología Mapa de la nave).
 *
 * Es la escena espacial "de mapa": el planeta con su mapa real, las lunas en su
 * órbita según la hora, cinturones de asteroides y la posición actual de la nave.
 * Se abre desde el mapa de la nave (o con M a los mandos) y se cierra con M/Esc.
 * La cámara orbita el cuerpo enfocado (1 el planeta · 2… las lunas · la última tecla, la nave).
 * Es una escena aparte (RenderContext.setActive): el juego sigue debajo.
 */
export class StarMap {
  /**
   * @param {object} p.sources { getCatalog(), getMapCanvas(id), getSeed(), getProfile(id), getBodyPosition(id), noonHour, getShipLocation() }
   */
  constructor({ config, system, render, input, events, time, sources }) {
    this.name = 'starMap';
    this._cfg = config;
    this._render = render;
    this._input = input;
    this._events = events;
    this._time = time;
    this._src = sources;
    this.isOpen = false;
    this._system = system;
    this.focusKeys = [system.homeId, ...system.moons.map((b) => b.id), 'SHIP'];
    this.focus = system.homeId;
    this._timer = 0;
    this._space = new SpaceScene({ config, system });
    render.addCamera(this._space.camera);

    this._orbit = { yaw: 0.6, pitch: 0.25, distance: 0 };
    this._target = new THREE.Vector3();
    this._targetGoal = new THREE.Vector3();
    this._distanceGoal = 0;
    this._v = new THREE.Vector3();

    events.on(GameEvents.STAR_MAP_REQUEST, ({ open } = {}) => this.setOpen(open ?? !this.isOpen));
    events.on(GameEvents.SPACE_FOCUS_REQUEST, ({ id }) => this.focusOn(id));
    events.on(GameEvents.PLAYER_DIED, () => this.setOpen(false));
    events.on(GameEvents.WORLD_GENERATED, () => this.setOpen(false));
    // Esc cierra el mapa aunque la entrada esté bloqueada.
    input.onRawKey((e) => {
      if (this.isOpen && (e.code === 'Escape' || e.code === 'KeyM')) this._closeRequested = true;
    });
  }

  get active() {
    return this.isOpen;
  }

  setOpen(open) {
    if (open === this.isOpen) return;
    if (open) {
      // Se muestra el grupo del planeta actual (o el último visitado): el planeta y sus lunas.
      const catalog = this._src.getCatalog();
      this._catalog = catalog;
      this._space.build({
        catalog,
        seed: this._src.getSeed() ^ (catalog.planet.id === this._system.homeId ? 0 : hashId(catalog.planet.id)),
        mapCanvas: this._src.getMapCanvas(catalog.planet.id),
        planet: this._src.getProfile(catalog.planet.id),
      });
      this.focusKeys = [catalog.planet.id, ...catalog.bodies.map((b) => b.id), 'SHIP'];
      this.isOpen = true;
      this.focusOn(this._src.getShipLocation?.().body === 'SPACE' ? 'SHIP' : catalog.planet.id);
      this._orbit.distance = this._distanceGoal * 1.6;
      this._render.setActive(this._space.scene, this._space.camera);
    } else {
      this.isOpen = false;
      this._render.setActive(null, null);
    }
    this._input.setBlocked('star-map', false);
    this._events.emit(GameEvents.STAR_MAP_TOGGLED, { open: this.isOpen });
  }

  focusOn(id) {
    const b = this._space.bodies[id];
    if (!b) return;
    this.focus = id;
    this._distanceGoal = Math.max(8, b.radius * (id === this._catalog?.planet.id ? 3.4 : id === 'SHIP' ? 14 : 4.5));
    this._events.emit(GameEvents.SPACE_FOCUS_CHANGED, { id, name: b.name });
  }

  update(dt) {
    if (this._closeRequested) {
      this._closeRequested = false;
      this.setOpen(false);
    }
    if (!this.isOpen) return;
    this._updateSpace(dt);
  }

  _updateSpace(dt) {
    const input = this._input;
    this.focusKeys.forEach((id, i) => input.wasPressed(`HOTBAR_${i + 1}`) && this.focusOn(id));

    const m = input.getMouseDelta();
    const o = this._orbit;
    o.yaw -= m.x * 0.004;
    o.pitch = Math.max(-1.3, Math.min(1.3, o.pitch + m.y * 0.004));
    const wheel = input.getWheel();
    if (wheel) this._distanceGoal = Math.max(this._space.bodies[this.focus].radius * 1.4, this._distanceGoal * (wheel > 0 ? 1.15 : 0.87));

    const origin = this._src.getBodyPosition?.(this._catalog.planet.id) ?? { x: 0, y: 0, z: 0 };
    this._space.update(this._time.totalHours, dt, this._src.noonHour, this._src.getShipLocation?.(), origin);
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
    if (!this.isOpen) return [];
    const cam = this._space.camera;
    return Object.entries(this._space.bodies).map(([id, b]) => {
      b.object.getWorldPosition(this._v);
      this._v.y += b.radius * 1.15;
      this._v.project(cam);
      return {
        id,
        name: b.name,
        x: (this._v.x * 0.5 + 0.5) * width,
        y: (-this._v.y * 0.5 + 0.5) * height,
        visible: this._v.z < 1 && Math.abs(this._v.x) < 1.1 && Math.abs(this._v.y) < 1.1,
        focused: id === this.focus,
      };
    });
  }

  /** Datos del cuerpo enfocado para el panel. */
  getFocusInfo() {
    const catalog = this._catalog ?? this._src.getCatalog();
    if (this.focus === catalog.planet.id) return { id: this.focus, name: catalog.planet.name, radiusKm: catalog.planet.radiusKm, home: true };
    if (this.focus === 'SHIP') return { id: 'SHIP', name: 'Tu nave', ship: true, location: this._src.getShipLocation?.() };
    return { ...catalog.bodies.find((b) => b.id === this.focus) };
  }
}

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h >>> 0;
}
