import { GameEvents } from '../core/GameEvents.js';
import { SpaceNavigation } from './SpaceNavigation.js';

/**
 * SpaceTravel — viaje por el espacio con la nave.
 *
 *   cuerpo (MUNDO 0 / luna) → O a los mandos → fundido (ASCENDING) → ESPACIO
 *   ESPACIO → cerca de un cuerpo, T → fundido (DESCENDING) → cuerpo (la nave
 *   llega flotando sobre su zona de aterrizaje).
 *
 * En el espacio la nave está en el origen del mundo en metros (se puede recorrer
 * por dentro) y su posición real en el sistema la lleva SpaceNavigation (km).
 * SpaceView dibuja planeta, lunas y asteroides alrededor según esa posición.
 * La cámara va detrás de la nave (vista de vehículo de CameraSystem).
 */
export const TravelState = Object.freeze({ SURFACE: 'SURFACE', ASCENDING: 'ASCENDING', SPACE: 'SPACE', DESCENDING: 'DESCENDING' });

export class SpaceTravel {
  /**
   * @param {object} p.sources { getCatalog(), getTextures(), getSeed(), noonHour }
   */
  constructor({ config, events, worlds, ship, time, camera, view, sources }) {
    this.name = 'spaceTravel';
    this._cfg = config;
    this._events = events;
    this._worlds = worlds;
    this._ship = ship;
    this._time = time;
    this._camera = camera;
    this._view = view;
    this._src = sources;
    this.state = TravelState.SURFACE;
    this._timer = 0;
    this._target = null;
    this._infoTimer = 0;
    this.galacticNode = false; // Etapa 6
    this.nav = new SpaceNavigation({ config, bodies: () => view.bodyPositions(time.totalHours) });
    this.nav.onEvent = (type) => {
      if (type === 'ZONE_LIMIT') this._message('Límite del sistema: el nodo espacial no alcanza más allá.', 'danger');
    };

    events.on(GameEvents.SPACE_ENTER_REQUEST, () => this.enter());
    events.on(GameEvents.SPACE_EXIT_REQUEST, ({ target } = {}) => this.land(target));
    events.on(GameEvents.WORLD_GENERATED, () => this._reset());
    events.on(GameEvents.SPACE_AUTOPILOT, ({ target }) => {
      if (!this.inSpace) return;
      this.nav.autopilotTarget = target;
      const name = { MUNDO_0: 'MUNDO 0', MOON_A: 'la Luna A', MOON_B: 'la Luna B' }[target];
      this._message(`Rumbo fijado a ${name}: acelera con W (Shift = impulso).`, 'biome');
    });
  }

  get inSpace() {
    return this.state === TravelState.SPACE;
  }

  /** Dónde está la nave (para el mapa estelar). */
  getShipLocation() {
    return { body: this._ship.body, pos: this.nav.pos, yaw: this.nav.yaw };
  }

  enter() {
    if (this.state !== TravelState.SURFACE) return false;
    this._from = this._worlds.activeId;
    this._setState(TravelState.ASCENDING);
    return true;
  }

  /** Aterrizar en el cuerpo indicado (o en el más cercano al que se pueda). */
  land(target = null) {
    if (this.state !== TravelState.SPACE) return false;
    const landable = this.nav.survey().landable;
    if (!landable || (target && landable.id !== target)) {
      this._message('Acércate más a MUNDO 0 o a una luna para aterrizar.', 'danger');
      return false;
    }
    this._target = landable.id;
    this._setState(TravelState.DESCENDING);
    return true;
  }

  update(dt) {
    const fade = this._cfg.FADE_TIME;
    if (this.state === TravelState.SURFACE) return;
    this._timer += dt;
    if (this.state === TravelState.ASCENDING && this._timer >= fade) this._arriveInSpace();
    else if (this.state === TravelState.DESCENDING && this._timer >= fade) this._arriveAtBody();
    if (this.state === TravelState.SPACE) this._fly(dt);
  }

  _arriveInSpace() {
    const catalog = this._src.getCatalog();
    this._view.build({ catalog, seed: this._src.getSeed(), textures: this._src.getTextures() });
    const bodies = this._view.bodyPositions(this._time.totalHours);
    const from = bodies.find((b) => b.id === this._from) ?? bodies[0];
    let dir;
    if (from.id === 'MUNDO_0') {
      // Sobre la isla de MUNDO 0 (mira al sol a mediodía; gira con el planeta).
      const a = (Math.PI * 2 * (this._time.totalHours - this._src.noonHour)) / 24;
      dir = { x: Math.cos(a), y: 0.05, z: -Math.sin(a) };
    } else {
      const p = from.position;
      const l = Math.hypot(p.x, p.y, p.z) || 1;
      dir = { x: p.x / l, y: p.y / l, z: p.z / l }; // cara que mira fuera del planeta
    }
    const l = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    this.nav.placeNear(from, dir, from.id === 'MUNDO_0' ? this._cfg.EXIT_ALTITUDE_KM : this._cfg.MOON_EXIT_ALTITUDE_KM);
    this._worlds.setActive('SPACE');
    this._ship.enterSpace(this.nav.yaw);
    this._view.setVisible(true);
    this._setState(TravelState.SPACE);
    this._message('En el espacio: [1/2/3] rumbo a MUNDO 0 / Luna A / Luna B · [W] avanzar · [Shift] impulso · [T] aterrizar al llegar', 'biome');
  }

  _arriveAtBody() {
    const id = this._target;
    this._view.setVisible(false);
    this._worlds.setActive(id);
    this._ship.arriveAt(id, this._cfg.ARRIVAL_HEIGHT);
    this._setState(TravelState.SURFACE);
  }

  _fly(dt) {
    const c = this._cfg;
    const ship = this._ship;
    const nav = this.nav;
    const powered = !ship.batteries.empty;
    if (ship.piloting && ship.spaceControls) nav.update(dt, ship.spaceControls, powered);
    else nav.stop(dt);
    // Batería: mantenerse + empuje (el impulso gasta el doble).
    const thrust = Math.abs(nav.speed) / c.CRUISE_SPEED; // 1 = crucero, BOOST_MULTIPLIER = impulso
    const effort = thrust <= 1 ? thrust : 1 + (thrust - 1) / (c.BOOST_MULTIPLIER - 1); // impulso = ×2
    ship.batteries.drain((c.HOVER_DRAIN + c.THRUST_DRAIN * effort) * dt);
    if (nav.outsideZone) {
      if (this.galacticNode) this._events.emit(GameEvents.GALACTIC_JUMP_ATTEMPT, {});
      nav.clampToZone();
    }
    ship.syncSpace(nav.yaw, nav.pitch, Math.min(1, thrust));
    this._view.update(dt, nav, this._camera.position, this._time.totalHours, this._src.noonHour);

    this._infoTimer -= dt;
    if (this._infoTimer <= 0) {
      this._infoTimer = 0.2;
      const survey = nav.survey();
      this._events.emit(GameEvents.SPACE_NAV_UPDATE, {
        speed: nav.speed,
        bodies: survey.bodies,
        landable: survey.landable,
        zoneWarning: nav.distanceFromCenter > c.ZONE_RADIUS * 0.9,
        powered,
        charge: ship.batteries.ratio,
        autopilot: nav.autopilotTarget,
      });
    }
  }

  /** Posición en pantalla (0..1) de cada cuerpo, para las etiquetas del HUD. */
  bodyScreenPositions(width, height) {
    if (!this.inSpace) return [];
    return this._view.screenLabels(this._camera, width, height);
  }

  _reset() {
    if (this.state === TravelState.SURFACE) return;
    this._view.setVisible(false);
    this._setState(TravelState.SURFACE);
  }

  _setState(state) {
    const previous = this.state;
    this.state = state;
    this._timer = 0;
    this._events.emit(GameEvents.SPACE_STATE_CHANGED, { state, previous, fadeTime: this._cfg.FADE_TIME });
  }

  _message(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }
}
