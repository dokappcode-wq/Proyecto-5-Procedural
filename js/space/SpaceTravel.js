import { GameEvents } from '../core/GameEvents.js';
import { SpaceNavigation } from './SpaceNavigation.js';
import { withPrep } from '../systemdata/SolarSystem.js';

/**
 * SpaceTravel — viaje por el espacio con la nave.
 *
 *   cuerpo (planeta / luna) → O a los mandos → fundido (ASCENDING) → ESPACIO
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
  constructor({ config, system, events, worlds, ship, time, camera, view, sources }) {
    this.name = 'spaceTravel';
    this._cfg = config;
    this._system = system;
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
    this.galacticNode = false; // Etapa 6: con él, salir de la zona intenta el salto (y falla)
    this.crippled = false;     // tras el salto fallido la nave no se mueve
    this.meteors = null; // MeteorSystem (se conecta en main)
    this.nav = new SpaceNavigation({ config, bodies: () => view.bodyPositions(time.totalHours), extras: () => this.meteors?.extras() ?? [] });
    this._blockNotice = 0;
    this.nav.onEvent = (type) => {
      if (type === 'ZONE_LIMIT' && !this.crippled) this._message('Límite del sistema: el nodo espacial no alcanza más allá.', 'danger');
      if (type === 'EXTRA_ARRIVED') {
        this._message('Detenidos junto al meteorito. No se puede aterrizar en él: ponte el traje, descomprime la cámara y sal con el jetpack.', 'biome');
      }
      if (type === 'EXTRA_BLOCKED' && this._blockNotice <= 0) {
        this._blockNotice = 4;
        this._message('No se puede aterrizar en un meteorito: detente cerca y baja con el traje.', 'danger');
      }
    };

    events.on(GameEvents.SPACE_ENTER_REQUEST, () => this.enter());
    events.on(GameEvents.SPACE_EXIT_REQUEST, ({ target } = {}) => this.land(target));
    events.on(GameEvents.WORLD_GENERATED, () => this._reset());
    events.on(GameEvents.SPACE_AUTOPILOT, ({ target }) => {
      if (!this.inSpace) return;
      if (target === 'METEOR') {
        const near = this.meteors?.nearest();
        if (!near) {
          this._message('No hay ningún meteorito a la vista.', 'danger');
          return;
        }
        this.nav.setAutopilot(near.meteor.id);
        this._message('Rumbo al meteorito: acelera con W; la nave se detendrá a su lado.', 'biome');
        return;
      }
      this.nav.setAutopilot(target);
      this._message(`Rumbo fijado: ${this._system.nameOf(target)}. Acelera con W (Shift = impulso).`, 'biome');
    });
  }

  /** Radio del sistema (km): más allá, el nodo espacial no alcanza. */
  get zoneRadiusKm() {
    return this._cfg.ZONE_RADIUS;
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
    if (this.crippled) {
      this._message('La nave no responde: evacúa en una cápsula de escape.', 'danger');
      return false;
    }
    const landable = this.nav.survey().landable;
    if (!landable || (target && landable.id !== target)) {
      this._message(`Acércate más ${withPrep('a', this._system.home.name)} o a una luna para aterrizar.`, 'danger');
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
    const fromHome = this._system.isHome(from.id);
    if (fromHome) {
      // Sobre la región del planeta (mira al sol a mediodía; gira con el planeta).
      const a = (Math.PI * 2 * (this._time.totalHours - this._src.noonHour)) / 24;
      dir = { x: Math.cos(a), y: 0.05, z: -Math.sin(a) };
    } else {
      const p = from.position;
      const l = Math.hypot(p.x, p.y, p.z) || 1;
      dir = { x: p.x / l, y: p.y / l, z: p.z / l }; // cara que mira fuera del planeta
    }
    const l = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    this.nav.placeNear(from, dir, fromHome ? this._cfg.EXIT_ALTITUDE_KM : this._cfg.MOON_EXIT_ALTITUDE_KM);
    this._worlds.setActive('SPACE');
    this._ship.enterSpace(this.nav.yaw);
    this._view.setVisible(true);
    this._setState(TravelState.SPACE);
    const keys = this._system.autopilotTargets().filter((t) => t.id !== 'METEOR').map((t) => `[${t.key}] ${t.name}`).join(' · ');
    this._message(`En el espacio, rumbo: ${keys} · [W] avanzar · [Shift] impulso · [T] aterrizar al llegar`, 'biome');
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
    if (ship.piloting && ship.spaceControls && !this.crippled) nav.update(dt, ship.spaceControls, powered);
    else nav.stop(dt);
    // Batería: mantenerse + empuje (el impulso gasta el doble).
    const thrust = Math.abs(nav.speed) / c.CRUISE_SPEED; // 1 = crucero, BOOST_MULTIPLIER = impulso
    const effort = thrust <= 1 ? thrust : 1 + (thrust - 1) / (c.BOOST_MULTIPLIER - 1); // impulso = ×2
    ship.batteries.drain((c.HOVER_DRAIN + c.THRUST_DRAIN * effort) * dt);
    if (nav.outsideZone) {
      if (this.galacticNode && !this.crippled) {
        // El salto galáctico falla: la nave queda a la deriva en el borde del sistema.
        this.crippled = true;
        nav.setAutopilot(null);
        nav.speed = 0;
        this._events.emit(GameEvents.GALACTIC_JUMP_ATTEMPT, {});
      }
      nav.clampToZone();
    }
    ship.syncSpace(nav.yaw, nav.pitch, Math.min(1, thrust));
    this._view.update(dt, nav, this._camera.position, this._time.totalHours, this._src.noonHour);

    this._blockNotice -= dt;
    this._infoTimer -= dt;
    if (this._infoTimer <= 0) {
      this._infoTimer = 0.2;
      const survey = nav.survey();
      const meteor = this.meteors?.nearest();
      this._events.emit(GameEvents.SPACE_NAV_UPDATE, {
        speed: nav.speed,
        bodies: survey.bodies,
        landable: survey.landable,
        zoneWarning: nav.distanceFromCenter > c.ZONE_RADIUS * 0.9,
        powered,
        charge: ship.batteries.ratio,
        autopilot: nav.autopilotTarget,
        meteor: meteor ? { id: meteor.meteor.id, distanceM: meteor.distanceM } : null,
      });
    }
  }

  /**
   * El jugador deja la nave (cápsula de escape): el cuerpo activo pasa a ser el
   * destino y la nave se queda donde está (en el espacio).
   */
  abandonShip(target) {
    if (this.state === TravelState.SURFACE) return;
    this._view.setVisible(false);
    this._worlds.setActive(target);
    this._setState(TravelState.SURFACE);
  }

  /** Vuelve a dejar el viaje como al principio (fin de la demo). */
  resetAfterDemo() {
    this.galacticNode = false;
    this.crippled = false;
    this.nav.setAutopilot(null);
    this.nav.speed = 0;
    if (this.state !== TravelState.SURFACE) {
      this._view.setVisible(false);
      this._setState(TravelState.SURFACE);
    }
  }

  /** Posición en pantalla (0..1) de cada cuerpo, para las etiquetas del HUD. */
  bodyScreenPositions(width, height) {
    if (!this.inSpace) return [];
    return this._view.screenLabels(this._camera, width, height).concat(this.meteors?.screenLabels(this._camera, width, height) ?? []);
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
