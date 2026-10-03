import * as THREE from 'three';
import { GameEvents } from '../core/GameEvents.js';
import { withPrep } from '../systemdata/SolarSystem.js';
import { createShipLayout, toWorld, toLocal } from './ShipLayout.js';
import { BLUEPRINTS } from './ShipBlueprints.js';
import { BatteryBank } from './BatteryBank.js';
import { ShipFlight, FlightState } from './ShipFlight.js';
import { ShipModel } from './ShipModel.js';

/**
 * ShipSystem — la nave: una estructura en la que se entra y con la que se vuela.
 *
 * Empieza siendo la nave PEQUEÑA (botón exterior → compuerta con rampa → sala de
 * estar/laboratorio → puerta → sala de controles). Al instalar el NODO ESPACIAL en
 * una ranura libre se convierte en la nave AMPLIADA (alas, propulsores extra y
 * salas: mandos, estar con sofá cama, laboratorio + máquinas, cápsulas de escape y
 * cámara de descompresión) y puede salir al espacio.
 *
 * A los mandos: la cámara pasa a 3ª persona sobre la nave (CameraSystem.setVehicleView);
 * W/S adelante/atrás, A/D girar, Espacio/C subir/bajar (en el espacio, cabecear),
 * T despegar/aterrizar, G compuerta, L patas, O salir al espacio, M mapa estelar,
 * E levantarse (en el aire la nave flota; en el espacio se detiene).
 *
 * Cámara de descompresión (nave ampliada, fuera del aire respirable):
 *   el panel vacía o llena la cámara (unos segundos, con las dos puertas cerradas).
 *   Abrir la compuerta con la cámara presurizada = descompresión explosiva:
 *   quien esté en la cámara (o en la nave, con la puerta interior abierta) sale
 *   disparado; en el espacio, muere.
 *
 * Reparto: ShipBlueprints/ShipLayout (forma), ShipFlight (vuelo en atmósfera),
 * SpaceTravel (vuelo espacial), BatteryBank (combustible), ShipModel (dibujo).
 */
export class ShipSystem {
  constructor({ config, spaceConfig, system, scene, world, player, input, events, landingBlocked = () => null }) {
    this.name = 'ship';
    this._cfg = config;
    this._system = system;
    this._spaceCfg = spaceConfig;
    this._world = world;
    this._player = player;
    this._input = input;
    this._events = events;

    this.layout = createShipLayout(BLUEPRINTS.SMALL);
    this.installed = { ...config.INSTALLED };
    this.ship = { x: 0, y: 0, z: 0, yaw: 0, hatch: 0, legs: 1, doors: {}, legFeet: this.layout.LEGS.map(() => 0), rampAngle: this.layout.rampOpenAngle(0), pitch: 0, roll: 0 };
    this._doorTargets = {};
    this.batteries = new BatteryBank(config.BATTERIES);
    const floats = () => !!world.planet?.TERRAIN?.ISLANDS?.NO_LAND;
    this._floats = floats;
    this._seaLevel = () => world.seaLevel;
    this._waveAt = null; // (x, z) → cuánto levanta el agua la ola gigante
    this.flight = new ShipFlight({
      config,
      ship: this.ship,
      batteries: this.batteries,
      layout: this.layout,
      terrain: {
        // En un mundo sin tierra (solo mar) la nave amerriza: el agua hace de suelo.
        heightAt: (x, z) => (floats() ? Math.max(world.getHeightAt(x, z), world.seaLevel) : world.getHeightAt(x, z)),
        surfaceAt: (x, z) => {
          const h = world.getHeightAt(x, z);
          const pond = world.water.getPondAt?.(x, z);
          return Math.max(h, world.seaLevel, pond ? pond.level : -Infinity);
        },
        isWater: (x, z) => !floats() && (world.water.isWater(x, z) || world.getHeightAt(x, z) < world.seaLevel + 0.3),
        get bounds() {
          return world.getBounds();
        },
      },
      landingBlocked: (ship) => landingBlocked(ship, this.layout),
    });
    this.flight.onEvent = (type, data) => this._onFlightEvent(type, data);
    this.model = new ShipModel({ scene, layout: this.layout, installed: this.installed });

    this.piloting = false;
    this.hasSpaceNode = false;
    this.crippled = false;   // salto galáctico fallido: motores y navegación fuera de servicio
    this.damaged = null;     // campaña: texto de la avería (propulsores, placa de navegación) o null
    this.podsUsed = 0;
    this.body = system.homeId;
    this._activeBody = () => system.homeId;
    this._breathableOutside = () => true; // ¿hay aire fuera? (cuerpo activo)
    this._held = new Set();
    this._raycaster = new THREE.Raycaster();
    this._stateKey = '';
    this._telemetryTimer = 0;
    this._lastCharge = -1;
    this._autoLandRetry = 0;
    // Cámara de descompresión y aire de la nave.
    this.airlock = 'PRESSURIZED';   // 'PRESSURIZED' | 'DEPRESSURIZED' | 'CYCLING'
    this._airlockTimer = 0;
    this._airlockGoal = null;
    this.shipAir = true;            // aire dentro de la nave (fuera de la cámara)

    const self = this;
    this.view = {
      yawOffset: 0,
      basePitch: config.CAMERA_PITCH,
      get pitch() {
        return this.basePitch + (self.flight.state === FlightState.SPACE ? self.ship.pitch : 0);
      },
      set pitch(v) {
        this.basePitch = v;
      },
      distance: config.CAMERA_DISTANCE,
      minDistance: config.CAMERA_MIN_DISTANCE,
      maxDistance: config.CAMERA_MAX_DISTANCE,
      get yaw() {
        return self.ship.yaw + this.yawOffset;
      },
      getEyePosition(out) {
        return out.set(self.ship.x, self.ship.y + 5.5, self.ship.z);
      },
    };

    events.on(GameEvents.WORLD_GENERATED, () => this.resetToLandingSite());
    events.on(GameEvents.SHIP_COMMAND, ({ command }) => this.command(command));
    events.on(GameEvents.SHIP_CONTROL_HOLD, ({ control, active }) => {
      if (active) this._held.add(control);
      else this._held.delete(control);
    });
    events.on(GameEvents.SHIP_BATTERY_REQUEST, (e) => this._batteryRequest(e));
    events.on(GameEvents.PLAYER_DIED, () => this._forceExit());
    this._suitOn = false;
    events.on(GameEvents.SUIT_CHANGED, ({ wearing }) => (this._suitOn = wearing));
    this.spaceMode = 'SURFACE';
    events.on(GameEvents.SPACE_STATE_CHANGED, ({ state }) => {
      this.spaceMode = state === 'ASCENDING' || state === 'DESCENDING' ? state : 'SURFACE';
    });
  }

  // ---- Conexiones (main) -------------------------------------------------------------

  setBodyProvider(fn) {
    this._activeBody = fn;
  }

  /** Función que dice si fuera de la nave hay aire respirable (cuerpo activo). */
  setBreathableProvider(fn) {
    this._breathableOutside = fn;
  }

  /** Ola gigante: amerizada, la nave sube y baja con el agua (y quien vaya dentro con ella). */
  setWaveProvider(fn) {
    this._waveAt = fn;
  }

  setInventory(inventory) {
    this._inventory = inventory;
  }

  get present() {
    return this.body === this._activeBody();
  }

  get watchTaken() {
    return !!this._inventory?.hasItem(this._cfg.WATCH_ITEM, 1);
  }

  get state() {
    return this.flight.state;
  }

  get isExplorer() {
    return this.layout.blueprint.id === 'EXPLORER';
  }

  // ---- Nodo espacial: la nave crece ------------------------------------------------------

  /**
   * Instala el nodo espacial: la nave pasa a ser la ampliada. Si estaba en tierra
   * se vuelve a posar (más patas) y se retiran árboles y rocas que queden debajo.
   */
  upgrade({ removeResourcesUnder = null } = {}) {
    if (this.isExplorer) return false;
    const wasAboard = this.isAboard();
    const s = this.ship;
    this._setBlueprint('EXPLORER', this._cfg.INSTALLED_EXPLORER);
    this.hasSpaceNode = true;
    removeResourcesUnder?.(s, this.layout);
    if (this.flight.state === FlightState.LANDED) this.placeLanded(s.x, s.z, s.yaw, { keepHatch: true });
    if (wasAboard && !this.piloting) {
      const r = this.getRespawnPoint();
      this._player.teleport(r.x, r.y, r.z);
    }
    this._events.emit(GameEvents.SHIP_UPGRADED, { blueprint: this.layout.blueprint.id });
    return true;
  }

  _setBlueprint(id, installed) {
    const s = this.ship;
    this.layout = createShipLayout(BLUEPRINTS[id]);
    this.flight.layout = this.layout;
    this.installed = { ...installed };
    s.doors = {};
    this._doorTargets = {};
    s.legFeet = this.layout.LEGS.map(() => 0);
    this.airlock = 'PRESSURIZED';
    this._airlockGoal = null;
    this.shipAir = true;
    this.model.build(this.layout, this.installed);
  }

  /** Salto galáctico fallido: la nave queda inutilizada (alarma roja). */
  setCrippled(on) {
    this.crippled = on;
    this._events.emit(GameEvents.SHIP_CRIPPLED, { crippled: on });
  }

  /** La IA trae la nave a un cuerpo: aterriza en su zona de aterrizaje. */
  relocateTo(bodyId) {
    this._forceExit(true);
    this.body = bodyId;
    this.spaceMode = 'SURFACE';
    const site = this._world.getLandingSite();
    if (site) this.placeLanded(site.x, site.z, site.yaw);
  }

  /** Quita una tecnología (el nodo galáctico se consume al fallar el salto). */
  uninstallTech(techId) {
    for (const [slot, t] of Object.entries(this.installed)) if (t === techId) this.installed[slot] = null;
    this.model.build(this.layout, this.installed);
  }

  // ---- Espacio -------------------------------------------------------------------------

  enterSpace(yaw) {
    const s = this.ship;
    this.body = 'SPACE';
    Object.assign(s, { x: 0, y: 0, z: 0, yaw, pitch: 0, roll: 0 });
    s.legFeet = this.layout.LEGS.map(() => 0);
    this.flight.hover();
    this.flight.state = FlightState.SPACE;
  }

  syncSpace(yaw, pitch, thrust) {
    this.ship.yaw = yaw;
    this.ship.pitch = this.piloting ? pitch : 0;
    this._spaceThrust = thrust;
  }

  arriveAt(bodyId, height) {
    const s = this.ship;
    const site = this._world.getLandingSite() ?? { x: 0, z: 0, yaw: 0 };
    this.body = bodyId;
    Object.assign(s, { x: site.x, z: site.z, yaw: site.yaw, pitch: 0, roll: 0 });
    s.y = this.flight._terrain.heightAt(site.x, site.z) + height;
    s.legFeet = this.layout.LEGS.map(() => 0);
    this.flight.state = FlightState.FLYING;
    this.flight.hover();
    this.model.update(s, 0, { airborne: true, batteries: this.batteries.snapshot().slots });
  }

  orbitBlocked() {
    if (!this.piloting) return 'Siéntate a los mandos';
    if (!this.hasSpaceNode) return 'Para salir al espacio hace falta el nodo espacial';
    if (this.flight.state !== FlightState.FLYING) return 'Despega primero';
    if (this.flight.hatchTarget > 0 || this.ship.hatch > 0.01) return 'Cierra la compuerta antes de salir al espacio';
    if (this.ship.y - this.flight._terrain.heightAt(this.ship.x, this.ship.z) < this._spaceCfg.ORBIT_MIN_ALTITUDE) {
      return `Sube por encima de ${this._spaceCfg.ORBIT_MIN_ALTITUDE} m para salir al espacio`;
    }
    if (this.batteries.total < this._spaceCfg.ORBIT_COST) return 'No queda batería suficiente para salir de la atmósfera';
    return null;
  }

  // ---- Colocación ------------------------------------------------------------------------

  resetToLandingSite() {
    this._forceExit(true);
    const site = this._world.getLandingSite();
    if (!site) return;
    this.body = this._system.homeId;
    // Mundo nuevo: vuelve a ser la nave pequeña, sin nodo espacial.
    if (this.isExplorer) this._setBlueprint('SMALL', this._cfg.INSTALLED);
    this.hasSpaceNode = false;
    this.placeLanded(site.x, site.z, site.yaw);
    this.batteries.fillAll(this._cfg.BATTERIES.START_CHARGE);
    this._emitBatteries(true);
  }

  placeLanded(x, z, yaw, { keepHatch = false } = {}) {
    const s = this.ship;
    const L = this.layout;
    Object.assign(s, { x, z, yaw, legs: 1, pitch: 0, roll: 0 });
    if (!keepHatch) {
      s.hatch = 0;
      this.flight.hatchTarget = 0;
      s.doors = {};
      this._doorTargets = {};
    }
    this.flight.legsTarget = 1;
    this.flight.state = FlightState.LANDED;
    const feet = L.LEGS.map((l) => {
      const [wx, wz] = toWorld(s, l.x, l.z);
      return this.flight._terrain.heightAt(wx, wz);
    });
    s.y = Math.max(...feet);
    s.legFeet = feet.map((h) => h - s.y);
    const [rx, rz] = toWorld(s, L.RAMP_FOOT_SAMPLE[0], L.RAMP_FOOT_SAMPLE[1]);
    s.rampAngle = L.rampOpenAngle(this.flight._terrain.heightAt(rx, rz) - s.y);
    this.model.update(s, 0, { batteries: this.batteries.snapshot().slots });
  }

  // ---- Mandos ----------------------------------------------------------------------------

  command(cmd) {
    if (cmd === 'STAND_UP') return this.exitPilot();
    // Nave averiada (campaña): sin propulsores ni placa de navegación no despega.
    if (this.damaged && (cmd === 'ORBIT' || cmd === 'TAKEOFF_OR_LAND' || cmd === 'TAKEOFF')) {
      this._message(this.damaged, 'danger');
      return false;
    }
    if (this.crippled && (cmd === 'ORBIT' || cmd === 'TAKEOFF_OR_LAND' || cmd === 'TAKEOFF' || cmd === 'LAND')) {
      this._message('Motores y navegación fuera de servicio. Evacúa en una cápsula de escape.', 'danger');
      return false;
    }
    if (cmd === 'ORBIT') {
      const reason = this.orbitBlocked();
      if (reason) {
        this._message(reason, 'danger');
        return false;
      }
      this.batteries.drain(this._spaceCfg.ORBIT_COST);
      this._events.emit(GameEvents.SPACE_ENTER_REQUEST, { source: 'SHIP' });
      return true;
    }
    if (cmd === 'TAKEOFF_OR_LAND' && this.flight.state === FlightState.SPACE) {
      this._events.emit(GameEvents.SPACE_EXIT_REQUEST, {});
      return true;
    }
    if (cmd === 'TOGGLE_HATCH') return this._toggleHatch();
    if (cmd === 'TAKEOFF_OR_LAND') cmd = this.flight.state === FlightState.LANDED ? 'TAKEOFF' : 'LAND';
    if (cmd === 'TOGGLE_LEGS') cmd = this.flight.legsTarget > 0 ? 'RETRACT_LEGS' : 'DEPLOY_LEGS';
    const r = this.flight.command(cmd);
    if (r.message) this._message(r.message, r.ok ? 'biome' : 'danger');
    return r.ok;
  }

  /** Abrir/cerrar la compuerta (con las reglas de la cámara de descompresión). */
  _toggleHatch() {
    const opening = this.flight.hatchTarget === 0;
    const r = this.flight.command('TOGGLE_HATCH');
    if (r.ok && this.body === 'SPACE') r.message = opening ? 'Abriendo la compuerta al vacío del espacio.' : 'Cerrando la compuerta.';
    if (r.message) this._message(r.message, r.ok ? 'biome' : 'danger');
    if (r.ok && opening && this.isExplorer && !this._breathableOutside() && this.airlock !== 'DEPRESSURIZED') {
      this._explosiveDecompression();
    }
    return r.ok;
  }

  /** Compuerta abierta con la cámara presurizada: el aire sale de golpe. */
  _explosiveDecompression() {
    const L = this.layout;
    const p = this._player.position;
    const room = L.roomAt(this.ship, p.x, p.y, p.z);
    const innerOpen = (this.ship.doors.AIRLOCK ?? 0) > 0.1;
    this.airlock = 'DEPRESSURIZED';
    this._airlockGoal = null;
    if (innerOpen) this.shipAir = false;
    const exposed = room?.airlock || (innerOpen && room && !this.piloting);
    this._events.emit(GameEvents.SHIP_DECOMPRESSION, { ejected: !!exposed, inSpace: this.body === 'SPACE' });
    if (!exposed) {
      this._message('¡Descompresión brusca! La cámara se ha vaciado de golpe.', 'danger');
      return;
    }
    if (this.body === 'SPACE') {
      this._message('¡Descompresión explosiva! Has salido disparado al espacio.', 'danger');
      this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: 1000, source: 'DECOMPRESSION' });
    } else {
      this._message('¡Descompresión explosiva! El aire te ha lanzado fuera.', 'danger');
      const [bx, bz] = toWorld(this.ship, 0, L.DIM.REAR + 6);
      this._player.teleport(bx, this._world.getHeightAt(bx, bz) + 0.5, bz);
      this._events.emit(GameEvents.PLAYER_DAMAGED, { amount: 30, source: 'DECOMPRESSION' });
    }
  }

  /** Panel de la cámara: vaciar (antes de salir) o llenar (al volver). */
  _cycleAirlock() {
    if (this.airlock === 'CYCLING') {
      this._message('La cámara está cambiando de presión…');
      return;
    }
    if (this.ship.hatch > 0.01 || this.flight.hatchTarget > 0) {
      this._message('Cierra la compuerta exterior antes de usar el panel.', 'danger');
      return;
    }
    if ((this.ship.doors.AIRLOCK ?? 0) > 0.05 || this._doorTargets.AIRLOCK) {
      this._message('Cierra la puerta interior de la cámara antes de usar el panel.', 'danger');
      return;
    }
    this._airlockGoal = this.airlock === 'PRESSURIZED' ? 'DEPRESSURIZED' : 'PRESSURIZED';
    this.airlock = 'CYCLING';
    this._airlockTimer = this._cfg.AIRLOCK_TIME;
    this._message(this._airlockGoal === 'DEPRESSURIZED' ? 'Descomprimiendo la cámara…' : 'Presurizando la cámara…', 'biome');
  }

  _updateAirlock(dt) {
    if (this.airlock !== 'CYCLING') return;
    this._airlockTimer -= dt;
    if (this._airlockTimer > 0) return;
    this.airlock = this._airlockGoal;
    if (this.airlock === 'PRESSURIZED') this.shipAir = true; // la nave recupera el aire
    this._message(this.airlock === 'DEPRESSURIZED' ? 'Cámara descomprimida: ya puedes abrir la compuerta.' : 'Cámara presurizada: ya puedes abrir la puerta interior.', 'biome');
  }

  _toggleDoor(id) {
    const door = this.layout.DOORS.find((d) => d.id === id);
    if (!door) return false;
    const opening = !this._doorTargets[id];
    if (opening && door.airlock && !this._breathableOutside() && this.airlock !== 'PRESSURIZED') {
      this._message('Presuriza la cámara antes de abrir la puerta interior.', 'danger');
      return false;
    }
    this._doorTargets[id] = opening ? 1 : 0;
    return true;
  }

  enterPilot() {
    if (this.piloting) return false;
    this.piloting = true;
    this.view.yawOffset = 0;
    this.view.pitch = this._cfg.CAMERA_PITCH;
    this._held.clear();
    this._placePlayerInSeat();
    this._events.emit(GameEvents.SHIP_PILOT_CHANGED, { piloting: true });
    this._message('A los mandos: [T] despegar · [W/S] avanzar · [A/D] girar · [Espacio/C] subir/bajar · [E] levantarse', 'biome');
    return true;
  }

  exitPilot() {
    if (!this.piloting) return false;
    const state = this.flight.state;
    if (state === FlightState.TAKING_OFF || state === FlightState.LANDING) {
      this._message('Espera a que termine la maniobra para levantarte', 'danger');
      return false;
    }
    if (state === FlightState.FLYING) {
      this.flight.hover();
      this._message('Te levantas: la nave se queda flotando y sigue gastando batería.', 'biome');
    } else if (state === FlightState.SPACE) {
      this._message('Te levantas: la nave se detiene en el espacio.', 'biome');
    }
    this.piloting = false;
    this._held.clear();
    const s = this.ship;
    const [x, z] = toWorld(s, this.layout.SEAT.standUp[0], this.layout.SEAT.standUp[1]);
    this._player.teleport(x, s.y + this.layout.DIM.FLOOR, z);
    this._player.yaw = s.yaw;
    this._player.bodyYaw = s.yaw;
    this._player.pitch = 0;
    this._events.emit(GameEvents.SHIP_PILOT_CHANGED, { piloting: false });
    return true;
  }

  _forceExit(silent = false) {
    if (!this.piloting) return;
    this.piloting = false;
    this._held.clear();
    if (this.flight.state !== FlightState.LANDED && this.flight.state !== FlightState.SPACE) this.flight.autoLand();
    this._events.emit(GameEvents.SHIP_PILOT_CHANGED, { piloting: false, silent });
  }

  // ---- Bucle -------------------------------------------------------------------------------

  update(dt) {
    this.model.root.visible = this.present;
    if (!this.present) return;
    const s = this.ship;
    // Puertas.
    for (const d of this.layout.DOORS) {
      const target = this._doorTargets[d.id] ?? 0;
      const v = s.doors[d.id] ?? 0;
      s.doors[d.id] = v < target ? Math.min(target, v + dt / this._cfg.DOOR_TIME) : Math.max(target, v - dt / this._cfg.DOOR_TIME);
    }
    this._updateAirlock(dt);
    this._alarmT = (this._alarmT ?? 0) + dt;
    for (const l of this.model.lights ?? []) {
      if (this.crippled) l.color.setRGB(1, Math.sin(this._alarmT * 6) > 0 ? 0.12 : 0.02, 0.02);
      else l.color.set(0xfff1d6);
    }
    if (this.spaceMode !== 'SURFACE') {
      if (this.spaceMode === 'ASCENDING') s.y += 45 * dt;
      if (this.piloting) this._placePlayerInSeat();
      this.model.update(s, dt, { airborne: true, thrust: 1, batteries: this.batteries.snapshot().slots, airlock: this.airlock });
      return;
    }
    let controls = null;
    if (this.piloting) controls = this._readPilotInput();
    this.flight.autopilot = !this.piloting;
    this.flight.update(dt, controls);
    if (this.flight.state === FlightState.LANDED && this._floats()) s.y = this._seaLevel() + (this._waveAt?.(s.x, s.z) ?? 0);
    if (this.piloting) this._placePlayerInSeat();
    else this._checkAbandoned(dt);
    this.model.watch.visible = !this.watchTaken;

    const snap = this.batteries.snapshot();
    const inSpace = this.flight.state === FlightState.SPACE;
    if (!this.piloting) this.spaceControls = null;
    this.model.update(s, dt, {
      airborne: this.flight.airborne,
      thrust: inSpace ? this._spaceThrust ?? 0 : Math.min(1, Math.abs(this.flight.forwardSpeed) / this._cfg.MAX_SPEED),
      batteries: snap.slots,
      airlock: this.airlock,
    });
    this._emitState(dt);
    this._emitBatteries(false, snap);
  }

  _readPilotInput() {
    const input = this._input;
    const held = this._held;
    if (input.wasPressed('SHIP_TAKEOFF')) this.command('TAKEOFF_OR_LAND');
    if (input.wasPressed('SHIP_HATCH')) this.command('TOGGLE_HATCH');
    if (input.wasPressed('SHIP_LEGS')) this.command('TOGGLE_LEGS');
    if (input.wasPressed('SHIP_ORBIT')) this.command('ORBIT');
    if (input.wasPressed('STAR_MAP')) this._events.emit(GameEvents.STAR_MAP_REQUEST, {});
    if (this.flight.state === FlightState.SPACE) {
      // Teclas 1–9: rumbo automático (SpaceTravel sabe a qué cuerpo corresponde cada tecla).
      for (let slot = 1; slot <= 9; slot++) {
        if (input.wasPressed(`HOTBAR_${slot}`)) this._events.emit(GameEvents.SPACE_AUTOPILOT, { slot });
      }
    }
    if (input.wasPressed('INTERACT')) {
      input.consume('INTERACT'); // que la interacción no vuelva a sentarte con la misma pulsación
      this.exitPilot();
    }
    const m = input.getMouseDelta();
    const v = this.view;
    v.yawOffset -= m.x * 0.0025;
    v.pitch = Math.max(-1.25, Math.min(0.45, v.basePitch - m.y * 0.0025));
    const wheel = input.getWheel();
    if (wheel) v.distance = Math.max(v.minDistance, Math.min(v.maxDistance, v.distance + wheel * 1.5));

    const axis = (pos, neg) => (pos ? 1 : 0) - (neg ? 1 : 0);
    const controls = {
      forward: axis(input.isDown('FORWARD') || held.has('FORWARD'), input.isDown('BACKWARD') || held.has('BACKWARD')),
      turn: axis(input.isDown('RIGHT') || held.has('RIGHT'), input.isDown('LEFT') || held.has('LEFT')),
      vertical: axis(input.isDown('JUMP') || held.has('UP'), input.isDown('DESCEND') || held.has('DOWN')),
      boost: input.isDown('RUN'),
    };
    this.spaceControls = this.flight.state === FlightState.SPACE ? controls : null;
    return this.flight.state === FlightState.SPACE ? null : controls;
  }

  getRespawnPoint() {
    const [lx, lz] = this.layout.RESPAWN;
    const [x, z] = toWorld(this.ship, lx, lz);
    return { x, y: this.ship.y + this.layout.DIM.FLOOR, z };
  }

  isAboard(position = this._player.position) {
    const s = this.ship;
    const L = this.layout;
    const [lx, lz] = toLocal(s, position.x, position.z);
    const lowest = Math.min(L.rampEnd(s).y, L.DIM.FLOOR);
    return Math.abs(lx) <= L.DIM.HALF_WIDTH + 0.4 && lz >= L.DIM.FRONT - 0.4 && lz <= L.DIM.REAR + 0.4 && position.y >= s.y + lowest - 1.0;
  }

  _checkAbandoned(dt) {
    this._autoLandRetry = Math.max(0, this._autoLandRetry - dt);
    if (this.flight.state !== FlightState.FLYING || this._autoLandRetry > 0 || this.isAboard()) return;
    this._autoLandRetry = 3;
    if (this.flight.autoLand()) this._message('Has saltado de la nave: aterrizará sola en un sitio despejado.', 'biome');
  }

  _placePlayerInSeat() {
    const s = this.ship;
    const p = this._player;
    const [x, z] = toWorld(s, this.layout.SEAT.x, this.layout.SEAT.z);
    p.position.set(x, s.y + this.layout.DIM.FLOOR + 0.3, z);
    p.velocity.set(0, 0, 0);
    p.state.onGround = true;
    p.state.isMoving = false;
    p.state.isRunning = false;
    p.yaw = s.yaw;
    p.bodyYaw = s.yaw;
  }

  _onFlightEvent(type, data) {
    const texts = {
      AIRBORNE: 'En el aire. [L] recoger patas · [T] aterrizar · [E] levantarse (se queda flotando)',
      LANDED: 'Aterrizaje completado.',
      EMERGENCY: 'Batería agotada: aterrizaje de emergencia.',
    };
    if (type === 'NOTICE') this._message(data.message, 'danger');
    else if (texts[type]) this._message(texts[type], type === 'EMERGENCY' ? 'danger' : 'biome');
  }

  // ---- Interacción (E) ------------------------------------------------------------------

  getInteractablesNear(x, y, z, range) {
    if (this.piloting || !this.present) return [];
    const s = this.ship;
    const L = this.layout;
    if (Math.hypot(x - s.x, z - s.z) > range + 20) return [];
    const list = [];
    const add = (id, [lx, ly, lz], label, action, aimRadius = 0.5) => {
      const [wx, wz] = toWorld(s, lx, lz);
      const wy = s.y + ly;
      if (Math.abs(wy - (y + 1.2)) > 2.1) return; // otra planta (dentro/fuera)
      list.push({ id, x: wx, y: wy, z: wz, aimRadius, reach: 0.4, label, action, key: 'E' });
    };
    const hatchAction = this.flight.hatchTarget > 0 ? 'Cerrar compuerta' : 'Abrir compuerta';
    add('EXT_BUTTON', L.EXT_BUTTON.aim, 'Nave · botón de la compuerta', hatchAction, 0.4);
    add('INNER_BUTTON', L.INNER_BUTTON.aim, 'Botón de la compuerta', hatchAction, 0.4);
    for (const d of L.DOORS) add(`DOOR:${d.id}`, d.aim, d.label, this._doorTargets[d.id] ? 'Cerrar' : 'Abrir', 0.8);
    add('SEAT', L.SEAT.aim, 'Asiento del piloto', 'Sentarse a los mandos', 0.6);
    add('WATCH', L.WATCH_AIM, 'Reloj de la nave', this.watchTaken ? 'Dejar el reloj' : 'Coger el reloj', 0.35);
    for (const f of L.blueprint.furniture) {
      if (!f.interact) continue;
      let action = f.interact.action;
      if (f.interact.id.startsWith('POD_')) action = this.crippled ? `¡Evacuar ${withPrep('a', this._system.home.name)}!` : 'Subir y elegir destino';
      if (f.interact.id === 'AIRLOCK') {
        action = this.airlock === 'CYCLING' ? 'Cambiando de presión…' : this.airlock === 'PRESSURIZED' ? 'Descomprimir la cámara' : 'Presurizar la cámara';
      }
      add(f.interact.id, f.interact.aim, f.interact.label, action, 0.6);
    }
    const carryingNode = this._inventory?.hasItem(this._cfg.SPACE_NODE_ITEM, 1) && !this.isExplorer;
    const carryingGalactic = this._inventory?.hasItem(this._cfg.GALACTIC_NODE_ITEM, 1) && this.isExplorer;
    for (const [slotId, slot] of Object.entries(L.SLOTS)) {
      const techId = this.installed[slotId] ?? null;
      const tech = techId ? this._cfg.TECHNOLOGIES[techId] : null;
      const actions = {
        PLANET_MAP: 'Abrir mapa', CHARGING_STATION: 'Ver baterías', SUIT_LOCKER: this._suitOn ? 'Dejar el traje' : 'Ponerse el traje y el jetpack',
        OXYGEN_STATION: 'Recargar oxígeno del traje', SPACE_NODE: 'Examinar', GALACTIC_NODE: 'Examinar',
        AI_NODE: 'Hablar con la IA', LIGHTSPEED_NODE: 'Examinar',
      };
      const action = tech ? actions[techId] ?? 'Examinar'
        : carryingNode ? 'Instalar el nodo espacial' : carryingGalactic ? 'Instalar el nodo galáctico' : 'Examinar';
      add(`SLOT:${slotId}`, slot.aim, tech ? `${tech.ICON} ${tech.NAME}` : 'Ranura de tecnología libre', action, 0.6);
    }
    return list;
  }

  interact(id) {
    if (id === 'EXT_BUTTON' || id === 'INNER_BUTTON') return this.command('TOGGLE_HATCH');
    if (id.startsWith('DOOR:')) return this._toggleDoor(id.slice(5));
    if (id === 'SEAT') return this.enterPilot();
    if (id === 'AIRLOCK') return this._cycleAirlock();
    if (id === 'BED') {
      this._events.emit(GameEvents.SLEEP_REQUEST, { bed: { type: 'SHIP_BED', ship: true } });
      return true;
    }
    if (id.startsWith('POD_')) {
      this._events.emit(GameEvents.ESCAPE_POD_REQUEST, { pod: id });
      return true;
    }
    if (id === 'WATCH') {
      const item = this._cfg.WATCH_ITEM;
      if (this.watchTaken) {
        this._inventory.removeItem(item, 1);
        this._message('Dejas el reloj en su base.');
      } else {
        this._inventory.addItem(item, 1);
        this._message('Reloj de la nave: selecciónalo y úsalo (clic dcho / R) para ver dónde está la nave.', 'biome');
      }
      return true;
    }
    if (id.startsWith('SLOT:')) return this._slotInteract(id.slice(5));
    return false;
  }

  _slotInteract(slotId) {
    const techId = this.installed[slotId] ?? null;
    switch (techId) {
      case 'PLANET_MAP':
        this._events.emit(GameEvents.SHIP_PANEL_REQUEST, { panel: 'MAP' });
        return true;
      case 'CHARGING_STATION':
        this._events.emit(GameEvents.SHIP_PANEL_REQUEST, { panel: 'CHARGER' });
        return true;
      case 'FLIGHT_SYSTEM':
        this._message('Sistema de vuelo: siéntate en el asiento del piloto para volar.');
        return true;
      case 'SUIT_LOCKER':
        this._events.emit(GameEvents.SUIT_LOCKER_REQUEST, {});
        return true;
      case 'OXYGEN_STATION':
        this._events.emit(GameEvents.OXYGEN_REFILL_REQUEST, { source: 'SHIP' });
        return true;
      case 'AI_NODE':
        this._events.emit(GameEvents.AI_PANEL_REQUEST, {});
        return true;
      case 'SPACE_NODE':
        this._message('Nodo espacial: permite salir al espacio. A los mandos, vuela alto y pulsa [O].');
        return true;
      case 'LIGHTSPEED_NODE':
        this._message(`Nodo de velocidad-luz: a los mandos, aléjate de la estrella ${this._system.star.name} hasta el borde del sistema y la IA te preguntará a qué sistema saltar (gasta ${this._spaceCfg.HYPERSPACE.BATTERY_COST} batería).`);
        return true;
      case 'GALACTIC_NODE':
        this._message(`Nodo galáctico: a los mandos, sal del ${this._system.name} (aléjate de la estrella ${this._system.star.name}) para intentar el salto.`);
        return true;
      default:
        if (this._inventory?.hasItem(this._cfg.SPACE_NODE_ITEM, 1) && !this.isExplorer) {
          this._events.emit(GameEvents.SPACE_NODE_INSTALL_REQUEST, { slot: slotId });
          return true;
        }
        if (this._inventory?.hasItem(this._cfg.GALACTIC_NODE_ITEM, 1) && this.isExplorer) {
          this._events.emit(GameEvents.GALACTIC_NODE_INSTALL_REQUEST, { slot: slotId });
          return true;
        }
        this._message('Ranura libre: aquí se podrán instalar nuevas tecnologías.');
        return true;
    }
  }

  /** Instala una tecnología en una ranura (p. ej. el nodo galáctico). */
  installTech(slotId, techId) {
    this.installed[slotId] = techId;
    this.model.build(this.layout, this.installed);
    this.model.update(this.ship, 0, { batteries: this.batteries.snapshot().slots, airlock: this.airlock });
  }

  // ---- Puesto de carga ------------------------------------------------------------------

  _batteryRequest({ slot, action }) {
    const inv = this._inventory;
    const B = this._cfg.BATTERIES;
    if (!inv) return;
    let r;
    if (action === 'REMOVE') {
      r = this.batteries.remove(slot);
      if (r.ok) inv.addItem(r.item, 1);
    } else {
      const item = inv.hasItem(B.ITEM, 1) ? B.ITEM : inv.hasItem(B.EMPTY_ITEM, 1) ? B.EMPTY_ITEM : null;
      r = item ? this.batteries.insert(slot, item) : { ok: false, reason: 'No tienes baterías plank pequeñas' };
      if (r.ok) inv.removeItem(item, 1);
    }
    if (!r.ok) this._message(r.reason, 'danger');
    this._emitBatteries(true);
  }

  _emitBatteries(force, snap = this.batteries.snapshot()) {
    if (!force && Math.abs(snap.total - this._lastCharge) < 0.25) return;
    this._lastCharge = snap.total;
    this._events.emit(GameEvents.SHIP_BATTERIES_CHANGED, snap);
  }

  // ---- Estado para la UI -------------------------------------------------------------------

  getTelemetry() {
    const s = this.ship;
    const ground = this.flight._terrain.heightAt(s.x, s.z);
    return {
      flight: this.flight.state,
      afloat: this._floats(), // amerizada (mundo de solo mar)
      piloting: this.piloting,
      body: this.body,
      present: this.present,
      explorer: this.isExplorer,
      hatch: this.flight.hatchTarget > 0 ? 'OPEN' : 'CLOSED',
      hatchMoving: s.hatch > 0.001 && s.hatch < 0.999,
      legs: this.flight.legsTarget > 0 ? 'DEPLOYED' : 'RETRACTED',
      airlock: this.airlock,
      altitude: Math.max(0, s.y - ground),
      height: s.y,
      speed: Math.abs(this.flight.forwardSpeed),
      autopilot: !this.piloting && this.flight.airborne,
      aboard: this.present && this.isAboard(),
      vertical: this.flight.verticalSpeed,
      charge: this.batteries.ratio,
      canOrbit: this.piloting && !this.orbitBlocked(),
      position: { x: s.x, z: s.z, yaw: s.yaw },
    };
  }

  _emitState(dt) {
    const t = this.getTelemetry();
    const key = `${t.flight}|${t.piloting}|${t.hatch}|${t.legs}|${t.airlock}`;
    this._telemetryTimer -= dt;
    if (key === this._stateKey && this._telemetryTimer > 0) return;
    this._stateKey = key;
    this._telemetryTimer = 0.2;
    this._events.emit(GameEvents.SHIP_STATE_CHANGED, t);
  }

  _message(text, type = 'info') {
    this._events.emit(GameEvents.UI_MESSAGE, { text, type });
  }

  // ---- Consultas de colisión y entorno ------------------------------------------------------

  surfaceAt(x, z, maxY) {
    return this.present ? this.layout.surfaceAt(this.ship, x, z, maxY) : null;
  }

  blocksAt(x, z, r, y0, y1) {
    return this.present && this.layout.blocksAt(this.ship, x, z, r, y0, y1);
  }

  ceilingAt(x, z, y) {
    return this.present ? this.layout.ceilingAt(this.ship, x, z, y) : Infinity;
  }

  resolveCollisions(pos, r, y0, y1) {
    return this.present && this.layout.resolveCollisions(this.ship, pos, r, y0, y1);
  }

  raycastDistance(origin, dir, maxDist) {
    if (this.piloting || !this.present) return null;
    this._raycaster.set(origin, dir);
    this._raycaster.far = maxDist;
    const hit = this._raycaster.intersectObject(this.model.root, true)[0];
    return hit ? hit.distance : null;
  }

  /**
   * ¿Se respira en (x, y, z)? Dentro de la nave: si la nave tiene aire (en la
   * cámara de descompresión, solo presurizada). null = no está dentro de la nave.
   */
  breathableAt(x, y, z) {
    if (!this.present) return null;
    const room = this.layout.roomAt(this.ship, x, y, z);
    if (!room) return null;
    if (this._breathableOutside()) return true;
    if (room.airlock) return this.airlock === 'PRESSURIZED' && this.ship.hatch < 0.01;
    const hatchOpenToShip = this.ship.hatch > 0.01 && (this.ship.doors.AIRLOCK ?? 0) > 0.1;
    // Nave pequeña (sin cámara): con la compuerta abierta no hay aire.
    if (!this.isExplorer) return this.ship.hatch < 0.01;
    return this.shipAir && !hatchOpenToShip;
  }

  getShelterAt(x, y, z) {
    if (!this.present || !this.layout.isInside(this.ship, x, y, z)) return { factor: 0, heated: false };
    const air = this.breathableAt(x, y, z);
    const closed = this.ship.hatch < 0.01;
    return { factor: closed ? 1 : 0.6, heated: !!air && (closed || this.isExplorer) };
  }

  overlapsBox(box, margin = 0.2) {
    return this.present && this.layout.overlapsFootprint(this.ship, box, margin);
  }
}
